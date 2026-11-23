'use strict';

/**
 * Bộ kiểm thử CLI & vòng đời công cụ scripts/* (F15 phần CLI):
 * - scripts/uninstall.js (sandbox os.tmpdir(), bảo vệ non-daemon PID, orphan PID, --purge an toàn qua VM)
 * - scripts/build_payload.js (CLI flags, thiếu giá trị, unknown flag)
 * - scripts/install-win.ps1 & scripts/install-unix.sh (cờ python -B & guard cốt lõi)
 * - scripts/verify_cdp.js (Mock CDP HTTP + WebSocket server, lọc target, hợp đồng HUD & ::after)
 * Zero-dependency (Node.js >= 22).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const TMP_DIRS = [];
const SPAWNED_CHILDREN = new Set();
const OPEN_SERVERS = new Set();

function makeTempDir(prefix = 'agy-test-cli-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    TMP_DIRS.push(dir);
    return dir;
}

function isPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err && err.code === 'EPERM';
    }
}

function spawnTracked(cmd, args, opts = {}) {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    SPAWNED_CHILDREN.add(child);
    child.on('exit', () => SPAWNED_CHILDREN.delete(child));
    return child;
}

function runNodeAsync(args, opts = {}) {
    const timeoutMs = opts.timeout || 25000;
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: opts.cwd || REPO_ROOT,
            env: opts.env || process.env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c) => {
            stdout += c.toString('utf8');
        });
        child.stderr.on('data', (c) => {
            stderr += c.toString('utf8');
        });
        const timer = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch (_) {}
            reject(new Error(`runNodeAsync timeout after ${timeoutMs}ms: ${args.join(' ')}\nstdout=${stdout}\nstderr=${stderr}`));
        }, timeoutMs);
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
    });
}

async function stopChildAndWait(child, timeoutMs = 3000) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
        const timer = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch (_) {}
            resolve();
        }, timeoutMs);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
        try {
            child.kill();
        } catch (_) {
            clearTimeout(timer);
            resolve();
        }
    });
}

after(async () => {
    for (const child of Array.from(SPAWNED_CHILDREN)) {
        await stopChildAndWait(child);
    }
    for (const srv of Array.from(OPEN_SERVERS)) {
        try {
            await srv.close();
        } catch (_) {}
    }
    while (TMP_DIRS.length > 0) {
        const d = TMP_DIRS.pop();
        try {
            fs.rmSync(d, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
        } catch (_) {}
    }
});

/**
 * Tạo Mock CDP HTTP + WebSocket Server (RFC 6455) tối giản bind 127.0.0.1:0.
 */
function createMockCdpServer({ targetsFactory, onEvaluate }) {
    const sockets = new Set();
    const server = http.createServer((req, res) => {
        if (req.url === '/json' || req.url === '/json/list') {
            const list = typeof targetsFactory === 'function' ? targetsFactory(server.address().port) : [];
            const body = JSON.stringify(list);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
            res.end(body);
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    });

    function encodeWsTextFrame(str) {
        const payload = Buffer.from(str, 'utf8');
        let header;
        if (payload.length < 126) {
            header = Buffer.from([0x81, payload.length]);
        } else if (payload.length < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x81;
            header[1] = 126;
            header.writeUInt16BE(payload.length, 2);
        } else {
            header = Buffer.alloc(10);
            header[0] = 0x81;
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(payload.length), 2);
        }
        return Buffer.concat([header, payload]);
    }

    function decodeWsFrames(buffer, onFrame) {
        let offset = 0;
        while (offset + 2 <= buffer.length) {
            const b1 = buffer[offset];
            const b2 = buffer[offset + 1];
            const opcode = b1 & 0x0f;
            const masked = (b2 & 0x80) !== 0;
            let len = b2 & 0x7f;
            let pos = offset + 2;
            if (len === 126) {
                if (pos + 2 > buffer.length) break;
                len = buffer.readUInt16BE(pos);
                pos += 2;
            } else if (len === 127) {
                if (pos + 8 > buffer.length) break;
                len = Number(buffer.readBigUInt64BE(pos));
                pos += 8;
            }
            const maskLen = masked ? 4 : 0;
            if (pos + maskLen + len > buffer.length) break;
            const mask = masked ? buffer.subarray(pos, pos + 4) : null;
            pos += maskLen;
            const data = Buffer.alloc(len);
            for (let i = 0; i < len; i++) {
                data[i] = masked ? buffer[pos + i] ^ mask[i % 4] : buffer[pos + i];
            }
            offset = pos + len;
            onFrame(opcode, data);
        }
        return buffer.subarray(offset);
    }

    server.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }
        sockets.add(socket);
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));

        const accept = crypto
            .createHash('sha1')
            .update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64');

        socket.write(
            [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Accept: ${accept}`,
                '',
                '',
            ].join('\r\n')
        );

        let rxBuf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
            rxBuf = Buffer.concat([rxBuf, chunk]);
            rxBuf = decodeWsFrames(rxBuf, (opcode, payload) => {
                if (opcode === 0x08) {
                    try {
                        socket.end(Buffer.from([0x88, 0x00]));
                    } catch (_) {}
                    return;
                }
                if (opcode === 0x09) {
                    socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
                    return;
                }
                if (opcode === 0x01) {
                    const msg = JSON.parse(payload.toString('utf8'));
                    if (msg.method === 'Runtime.evaluate') {
                        const expr = String((msg.params && msg.params.expression) || '');
                        const val = onEvaluate ? onEvaluate(req.url, expr) : { ok: true };
                        const resp = JSON.stringify({ id: msg.id, result: { result: { value: val } } });
                        socket.write(encodeWsTextFrame(resp));
                    } else {
                        const resp = JSON.stringify({ id: msg.id, result: {} });
                        socket.write(encodeWsTextFrame(resp));
                    }
                }
            });
        });
    });

    const wrapper = {
        port: 0,
        async start() {
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            wrapper.port = server.address().port;
            OPEN_SERVERS.add(wrapper);
            return wrapper.port;
        },
        async close() {
            OPEN_SERVERS.delete(wrapper);
            for (const s of sockets) {
                try {
                    s.destroy();
                } catch (_) {}
            }
            sockets.clear();
            await new Promise((resolve) => server.close(() => resolve()));
        },
    };
    return wrapper;
}

function buildSandboxEnv(sandbox, portFilePath, extra = {}) {
    const homeDir = path.join(sandbox, 'home');
    const appDataDir = path.join(sandbox, 'appdata');
    const localAppDataDir = path.join(sandbox, 'localappdata');
    const xdgCfg = path.join(sandbox, 'xdg_config');
    const xdgData = path.join(sandbox, 'xdg_data');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(appDataDir, { recursive: true });
    fs.mkdirSync(localAppDataDir, { recursive: true });
    fs.mkdirSync(xdgCfg, { recursive: true });
    fs.mkdirSync(xdgData, { recursive: true });

    return {
        ...process.env,
        USERPROFILE: homeDir,
        HOME: homeDir,
        APPDATA: appDataDir,
        LOCALAPPDATA: localAppDataDir,
        XDG_CONFIG_HOME: xdgCfg,
        XDG_DATA_HOME: xdgData,
        AGY_CONFIG_PATH: path.join(sandbox, 'theme_config.json'),
        AGY_PORT_FILE: portFilePath || path.join(sandbox, 'nonexistent_port'),
        ...extra,
    };
}

function setupUninstallSandbox() {
    const sandbox = makeTempDir('agy-test-uninstall-');
    const scriptsDir = path.join(sandbox, 'scripts');
    const daemonDir = path.join(sandbox, 'daemon');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(daemonDir, { recursive: true });

    const uninstallDest = path.join(scriptsDir, 'uninstall.js');
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'uninstall.js'), uninstallDest);

    const dummyDaemonPath = path.join(daemonDir, 'theme_daemon.js');
    fs.writeFileSync(dummyDaemonPath, 'setInterval(() => {}, 1000);\n', 'utf8');

    const env = buildSandboxEnv(sandbox);
    return { sandbox, uninstallDest, dummyDaemonPath, env };
}

function loadUninstallHelpersForRoot(rootDir) {
    const src = fs
        .readFileSync(path.join(REPO_ROOT, 'scripts', 'uninstall.js'), 'utf8')
        .replace(/^#![^\r\n]*\r?\n/, '');
    const patched = src.replace(
        /\bmain\(\);\s*$/,
        'module.exports = { splitCommandLineArgs, isTargetDaemonArgs, isTargetDaemonCommand, isUninstallScriptToken, unpatchWindowsShortcuts };'
    );
    assert.notEqual(patched, src, 'Không tìm thấy lời gọi main() ở cuối scripts/uninstall.js');
    const fakeFilename = path.join(rootDir, 'scripts', 'uninstall.js');
    const fakeDirname = path.join(rootDir, 'scripts');
    const mod = { exports: {} };
    const fn = vm.runInThisContext(
        `(function(require, module, exports, __filename, __dirname) {\n${patched}\n})`,
        { filename: fakeFilename }
    );
    fn(require, mod, mod.exports, fakeFilename, fakeDirname);
    return mod.exports;
}

describe('F15 (CLI) — Bộ công cụ scripts/* & Hợp đồng verify_cdp.js', () => {
    describe('Tier 1 — Phủ Tính Năng CLI & Verify Contract', () => {
        it('F15-T1-01: uninstall.js trong sandbox xóa daemon.pid/lock/log, silent-start.vbs, startup .lnk nhưng giữ theme_config.json', () => {
            const { sandbox, uninstallDest, env } = setupUninstallSandbox();
            const pidFile = path.join(sandbox, 'daemon.pid');
            const lockFile = path.join(sandbox, 'daemon.lock');
            const logFile = path.join(sandbox, 'daemon.log');
            const vbsFile = path.join(sandbox, 'silent-start.vbs');
            const cfgFile = path.join(sandbox, 'theme_config.json');

            fs.writeFileSync(pidFile, '', 'utf8');
            fs.writeFileSync(lockFile, 'lock', 'utf8');
            fs.writeFileSync(logFile, 'log', 'utf8');
            fs.writeFileSync(vbsFile, 'vbs', 'utf8');
            fs.writeFileSync(cfgFile, '{"activeTheme":"Shinobu"}', 'utf8');

            if (process.platform === 'win32') {
                const startupDir = path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
                fs.mkdirSync(startupDir, { recursive: true });
                fs.writeFileSync(path.join(startupDir, 'AntigravityCustomTheme.lnk'), 'fake-lnk', 'utf8');
            }

            execFileSync(process.execPath, [uninstallDest], {
                cwd: sandbox,
                env,
                stdio: 'pipe',
                windowsHide: true,
                timeout: 15000,
            });

            assert.equal(fs.existsSync(pidFile), false);
            assert.equal(fs.existsSync(lockFile), false);
            assert.equal(fs.existsSync(logFile), false);
            assert.equal(fs.existsSync(vbsFile), false);
            assert.equal(fs.existsSync(cfgFile), true, 'Chạy không --purge phải giữ theme_config.json');
        });

        it('F15-T1-02: uninstall.js không giết nhầm PID của tiến trình node không phải theme_daemon.js', async () => {
            const { sandbox, uninstallDest, env } = setupUninstallSandbox();
            const innocent = spawnTracked(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
            await new Promise((r) => setTimeout(r, 150));
            assert.equal(isPidAlive(innocent.pid), true);

            fs.writeFileSync(path.join(sandbox, 'daemon.pid'), String(innocent.pid), 'utf8');
            fs.writeFileSync(path.join(sandbox, 'daemon.lock'), '1', 'utf8');
            fs.writeFileSync(path.join(sandbox, 'daemon.log'), '1', 'utf8');

            execFileSync(process.execPath, [uninstallDest], {
                cwd: sandbox,
                env,
                stdio: 'pipe',
                windowsHide: true,
                timeout: 15000,
            });

            assert.equal(isPidAlive(innocent.pid), true, 'uninstall.js không được giết tiến trình không phải theme_daemon.js');
            assert.equal(fs.existsSync(path.join(sandbox, 'daemon.pid')), false);
            await stopChildAndWait(innocent);
        });

        it('F15-T1-03: uninstall.js dừng đúng dummy theme_daemon.js khi có daemon.pid hợp lệ', async () => {
            const { sandbox, uninstallDest, dummyDaemonPath, env } = setupUninstallSandbox();
            const dummy = spawnTracked(process.execPath, [dummyDaemonPath], { cwd: sandbox, env });
            await new Promise((r) => setTimeout(r, 150));
            assert.equal(isPidAlive(dummy.pid), true);

            fs.writeFileSync(path.join(sandbox, 'daemon.pid'), String(dummy.pid), 'utf8');

            const res = await runNodeAsync([uninstallDest], {
                cwd: sandbox,
                env,
                timeout: 30000,
            });
            assert.equal(res.code, 0, `uninstall.js thất bại: ${res.stderr}`);

            await new Promise((r) => setTimeout(r, 200));
            assert.equal(isPidAlive(dummy.pid), false, 'Dummy theme_daemon.js trong sandbox phải bị dừng');
            assert.equal(fs.existsSync(path.join(sandbox, 'daemon.pid')), false);
        });

        it('F15-T1-04: build_payload.js hỗ trợ đầy đủ --themes, --engine, --out và --inline-all tạo Master IIFE Closure', () => {
            const tmp = makeTempDir('agy-test-build-cli-');
            const outFile = path.join(tmp, 'custom_bundle.js');
            const out = execFileSync(
                process.execPath,
                [
                    path.join(REPO_ROOT, 'scripts', 'build_payload.js'),
                    '--themes',
                    path.join(REPO_ROOT, 'themes', 'themes.json'),
                    '--engine',
                    path.join(REPO_ROOT, 'engine', 'core.js'),
                    '--out',
                    outFile,
                    '--inline-all',
                ],
                { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, timeout: 20000 }
            );
            assert.match(out, /mode=inline-all/);
            const code = fs.readFileSync(outFile, 'utf8');
            assert.ok(code.startsWith('(function(__AGY_BOOT__) {'));
            assert.ok(code.includes('__ANTIGRAVITY_REMOVE_CUSTOM_THEME__'));
        });

        it('F15-T1-05: verify_cdp.js PASS chuẩn với Mock CDP Server và dummy theme_daemon.js', async () => {
            const sandbox = makeTempDir('agy-test-vcdp-pass-');
            const daemonDir = path.join(sandbox, 'daemon');
            fs.mkdirSync(daemonDir, { recursive: true });
            const dummyDaemon = path.join(daemonDir, 'theme_daemon.js');
            fs.writeFileSync(dummyDaemon, 'setInterval(() => {}, 1000);\n', 'utf8');

            const child = spawnTracked(process.execPath, [dummyDaemon], { cwd: sandbox });
            await new Promise((r) => setTimeout(r, 150));
            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(child.pid), 'utf8');

            const mockCdp = createMockCdpServer({
                targetsFactory: (port) => [
                    {
                        id: 'page-1',
                        type: 'page',
                        title: 'Antigravity Workbench',
                        url: `http://127.0.0.1:${port}/workbench`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-1`,
                    },
                ],
                onEvaluate: () => ({
                    isAntigravityDom: true,
                    url: '/workbench',
                    themeActive: true,
                    wpEnabled: true,
                    hasLiveBlurRule: false,
                    leakedWindowToken: false,
                    cinemaBtnPresent: true,
                    kaguraBtnPresent: true,
                    hudBarPresent: true,
                    cinemaDirectorAlive: true,
                    bioAudioAlive: true,
                    tokenHudStyleAlive: true,
                    moduleChecks: {
                        sec: true,
                        themeCore: true,
                        themeForge: true,
                        fxModes: true,
                        chibiAura: true,
                        breathingSkills: true,
                        semanticIcons: true,
                        squadRaid: true,
                        tokenHud: true,
                        cinemaDirector: true,
                        bioAudio: true,
                    },
                    chibiSkillBarPresent: false,
                    userBubbleEmptyChildCount: 0,
                    userBubbleMissingGuardCount: 0,
                    masterPersona: 'yoriichi',
                    yoriichiIdentityValid: true,
                    shellFound: true,
                    shellDirectBgPresent: true,
                    shellAfterBgPresent: false,
                    shellBgImagePresent: true,
                    shellHoleActive: '0',
                }),
            });
            const cdpPort = await mockCdp.start();
            const portFile = path.join(sandbox, 'DevToolsActivePort');
            fs.writeFileSync(portFile, `${cdpPort}\r\nmock-token\r\n`, 'utf8');

            const res = await runNodeAsync([path.join(REPO_ROOT, 'scripts', 'verify_cdp.js')], {
                cwd: REPO_ROOT,
                env: { ...process.env, AGY_PORT_FILE: portFile, AGY_DAEMON_PID_FILE: pidFile },
                timeout: 20000,
            });
            assert.equal(res.code, 0, `verify_cdp.js phải PASS: ${res.stderr}`);
            assert.match(res.stdout, /\[verify-cdp\] PASS:/);

            await mockCdp.close();
            await stopChildAndWait(child);
        });

        it('F15-T1-06: verify_cdp.js lọc bỏ target ngoài (devtools://, preview.html, webview) và chỉ đánh giá target Antigravity', async () => {
            const sandbox = makeTempDir('agy-test-vcdp-filter-');
            const daemonDir = path.join(sandbox, 'daemon');
            fs.mkdirSync(daemonDir, { recursive: true });
            const dummyDaemon = path.join(daemonDir, 'theme_daemon.js');
            fs.writeFileSync(dummyDaemon, 'setInterval(() => {}, 1000);\n', 'utf8');

            const child = spawnTracked(process.execPath, [dummyDaemon], { cwd: sandbox });
            await new Promise((r) => setTimeout(r, 150));
            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(child.pid), 'utf8');

            const evaluatedUrls = [];
            const mockCdp = createMockCdpServer({
                targetsFactory: (port) => [
                    {
                        id: 'devtools-1',
                        type: 'page',
                        url: 'devtools://devtools/bundled/inspector.html',
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/devtools-1`,
                    },
                    {
                        id: 'preview-1',
                        type: 'page',
                        url: `http://127.0.0.1:${port}/preview.html`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/preview-1`,
                    },
                    {
                        id: 'webview-1',
                        type: 'webview',
                        url: `http://127.0.0.1:${port}/workbench`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/webview-1`,
                    },
                    {
                        id: 'agy-1',
                        type: 'page',
                        title: 'Antigravity',
                        url: `http://127.0.0.1:${port}/c/11111111-1111-1111-1111-111111111111`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/agy-1`,
                    },
                ],
                onEvaluate: (wsPath) => {
                    evaluatedUrls.push(wsPath);
                    return {
                        isAntigravityDom: true,
                        url: '/c/11111111-1111-1111-1111-111111111111',
                        themeActive: true,
                        wpEnabled: true,
                        hasLiveBlurRule: false,
                        leakedWindowToken: false,
                        cinemaBtnPresent: true,
                        kaguraBtnPresent: true,
                        hudBarPresent: true,
                        cinemaDirectorAlive: true,
                        bioAudioAlive: true,
                        tokenHudStyleAlive: true,
                        moduleChecks: {
                            sec: true,
                            themeCore: true,
                            themeForge: true,
                            fxModes: true,
                            chibiAura: true,
                            breathingSkills: true,
                            semanticIcons: true,
                            squadRaid: true,
                            tokenHud: true,
                            cinemaDirector: true,
                            bioAudio: true,
                        },
                        chibiSkillBarPresent: false,
                        userBubbleEmptyChildCount: 0,
                        userBubbleMissingGuardCount: 0,
                        masterPersona: 'yoriichi',
                        yoriichiIdentityValid: true,
                        shellFound: true,
                        shellDirectBgPresent: true,
                        shellAfterBgPresent: false,
                        shellBgImagePresent: true,
                        shellHoleActive: '0',
                    };
                },
            });
            const cdpPort = await mockCdp.start();
            const portFile = path.join(sandbox, 'DevToolsActivePort');
            fs.writeFileSync(portFile, `${cdpPort}\n`, 'utf8');

            const res = await runNodeAsync([path.join(REPO_ROOT, 'scripts', 'verify_cdp.js')], {
                cwd: REPO_ROOT,
                env: { ...process.env, AGY_PORT_FILE: portFile, AGY_DAEMON_PID_FILE: pidFile },
                timeout: 20000,
            });
            assert.equal(res.code, 0, `verify_cdp.js phải PASS: ${res.stderr}`);
            assert.deepEqual(evaluatedUrls, ['/devtools/page/agy-1']);

            await mockCdp.close();
            await stopChildAndWait(child);
        });
    });

    describe('Tier 2 — Biên, Lỗi Cốt Lõi M1 & Bảo Toàn Môi Trường', () => {
        it('F15-T2-01: uninstall.js quét và dừng được orphan dummy theme_daemon.js trong sandbox khi mất daemon.pid, KHÔNG giết daemon ở thư mục khác', async () => {
            const { sandbox, uninstallDest, dummyDaemonPath, env } = setupUninstallSandbox();
            const otherDir = makeTempDir('agy-test-other-install-');
            const otherDaemonDir = path.join(otherDir, 'daemon');
            fs.mkdirSync(otherDaemonDir, { recursive: true });
            const foreignDaemonPath = path.join(otherDaemonDir, 'theme_daemon.js');
            fs.writeFileSync(foreignDaemonPath, 'setInterval(() => {}, 1000);\n', 'utf8');

            const orphan = spawnTracked(process.execPath, [dummyDaemonPath], { cwd: sandbox, env });
            const foreign = spawnTracked(process.execPath, [foreignDaemonPath], { cwd: otherDir });
            await new Promise((r) => setTimeout(r, 200));
            assert.equal(isPidAlive(orphan.pid), true);
            assert.equal(isPidAlive(foreign.pid), true);
            assert.equal(fs.existsSync(path.join(sandbox, 'daemon.pid')), false, 'Không tạo daemon.pid để mô phỏng trạng thái mất PID file');

            await runNodeAsync([uninstallDest], {
                cwd: sandbox,
                env,
                timeout: 30000,
            });

            await new Promise((r) => setTimeout(r, 250));
            const stillAlive = isPidAlive(orphan.pid);
            const foreignAlive = isPidAlive(foreign.pid);
            await stopChildAndWait(orphan);
            await stopChildAndWait(foreign);
            assert.equal(stillAlive, false, 'uninstall.js phải phát hiện và dừng orphan theme_daemon.js thuộc đúng ROOT_DIR dù thiếu daemon.pid');
            assert.equal(foreignAlive, true, 'uninstall.js tuyệt đối không được giết tiến trình theme_daemon.js thuộc thư mục khác');
        });

        it('F15-T2-02: uninstall.js --purge dọn config/backup/dist và xóa localStorage agy_* qua CDP (cô lập bằng VM không chạm Desktop thật)', async () => {
            const { sandbox, env } = setupUninstallSandbox();
            const cfgFile = env.AGY_CONFIG_PATH;
            const backupFile = path.join(env.USERPROFILE, '.gemini', 'antigravity', 'custom_theme_backup.json');
            const distDir = path.join(sandbox, 'dist');
            fs.mkdirSync(path.dirname(backupFile), { recursive: true });
            fs.mkdirSync(distDir, { recursive: true });
            fs.writeFileSync(cfgFile, '{"activeTheme":"Shinobu"}', 'utf8');
            fs.writeFileSync(backupFile, '{"activeTheme":"Giyu"}', 'utf8');
            fs.writeFileSync(path.join(distDir, 'theme_payload.js'), '// payload', 'utf8');

            const evalExprs = [];
            const mockCdp = createMockCdpServer({
                targetsFactory: (port) => [
                    {
                        id: 'agy-purge-1',
                        type: 'page',
                        url: `http://127.0.0.1:${port}/workbench`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/agy-purge-1`,
                    },
                ],
                onEvaluate: (_wsPath, expr) => {
                    evalExprs.push(expr);
                    return { removed: true };
                },
            });
            const cdpPort = await mockCdp.start();
            const portFile = path.join(sandbox, 'DevToolsActivePort');
            fs.writeFileSync(portFile, `${cdpPort}\n`, 'utf8');

            // Chạy uninstall.js trong Node VM với stub child_process.execFileSync cho PowerShell/shortcut scan
            // để 100% không bao giờ chạm Desktop/Programs/Startup thật trên Windows.
            const uninstallSrc = fs
                .readFileSync(path.join(REPO_ROOT, 'scripts', 'uninstall.js'), 'utf8')
                .replace(/^#![^\r\n]*\r?\n/, '');
            const stubbedPsCalls = [];
            const origEnv = { ...process.env };
            Object.assign(process.env, env, { AGY_PORT_FILE: portFile });
            const origArgv = process.argv;
            process.argv = [process.execPath, path.join(sandbox, 'scripts', 'uninstall.js'), '--purge'];
            const origConsoleLog = console.log;
            let uninstallDone = false;
            console.log = (...args) => {
                const msg = args.map(String).join(' ');
                if (msg.includes('[uninstall] Done.')) {
                    uninstallDone = true;
                }
                origConsoleLog(...args);
            };

            try {
                const cp = require('node:child_process');
                const fakeCp = {
                    ...cp,
                    execFileSync(file, args, opts) {
                        if (String(file).toLowerCase().includes('powershell')) {
                            stubbedPsCalls.push({ file, args });
                            return '';
                        }
                        return cp.execFileSync(file, args, opts);
                    },
                };
                const fakeRequire = (id) => (id === 'child_process' || id === 'node:child_process' ? fakeCp : require(id));
                const fn = vm.runInThisContext(
                    `(function(require, module, exports, __filename, __dirname) {\n${uninstallSrc}\n})`,
                    { filename: path.join(sandbox, 'scripts', 'uninstall.js') }
                );
                const mod = { exports: {} };
                fn(fakeRequire, mod, mod.exports, path.join(sandbox, 'scripts', 'uninstall.js'), path.join(sandbox, 'scripts'));
                const deadline = Date.now() + 4000;
                while (!uninstallDone && Date.now() < deadline) {
                    await new Promise((r) => setTimeout(r, 25));
                }
            } finally {
                console.log = origConsoleLog;
                process.argv = origArgv;
                for (const k of Object.keys(process.env)) {
                    if (!(k in origEnv)) delete process.env[k];
                }
                Object.assign(process.env, origEnv);
                await mockCdp.close();
            }

            assert.equal(uninstallDone, true, 'uninstall.js main() phải hoàn tất cleanupPage và in [uninstall] Done.');
            assert.equal(fs.existsSync(cfgFile), false, '--purge phải xóa theme_config.json');
            assert.equal(fs.existsSync(backupFile), false, '--purge phải xóa custom_theme_backup.json');
            assert.equal(fs.existsSync(distDir), false, '--purge phải xóa thư mục dist/');
            assert.ok(evalExprs.some((e) => e.includes('__ANTIGRAVITY_REMOVE_CUSTOM_THEME__')));
            assert.ok(evalExprs.some((e) => e.includes('agy_')));
            if (process.platform === 'win32') {
                assert.ok(stubbedPsCalls.length >= 1, 'Nhánh unpatchWindowsShortcuts phải được gọi trong VM stub');
            }
        });

        it('F15-T2-03: build_payload.js báo lỗi exit != 0 khi thiếu giá trị flag hoặc gặp unknown CLI flag', () => {
            const buildJs = path.join(REPO_ROOT, 'scripts', 'build_payload.js');
            const missingCases = [['--out'], ['--themes', '--inline-all'], ['--engine']];
            for (const args of missingCases) {
                let threw = false;
                try {
                    execFileSync(process.execPath, [buildJs, ...args], {
                        cwd: REPO_ROOT,
                        stdio: 'pipe',
                        windowsHide: true,
                    });
                } catch (err) {
                    threw = true;
                    assert.match(`${err.stderr || ''}${err.stdout || ''}`, /Missing valid path value/i);
                }
                assert.equal(threw, true, `build_payload.js phải từ chối thiếu giá trị: ${args.join(' ')}`);
            }

            let unknownThrew = false;
            try {
                execFileSync(process.execPath, [buildJs, '--unknown-flag-xyz'], {
                    cwd: REPO_ROOT,
                    stdio: 'pipe',
                    windowsHide: true,
                });
            } catch (_) {
                unknownThrew = true;
            }
            assert.equal(unknownThrew, true, 'build_payload.js phải từ chối unknown flag (--unknown-flag-xyz) với exit code != 0 như build_payload.py');
        });

        it('F15-T2-04: install-win.ps1 & install-unix.sh phải truyền cờ -B khi fallback Python và giữ các guard an toàn', () => {
            const ps1 = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'install-win.ps1'), 'utf8');
            const sh = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'install-unix.sh'), 'utf8');

            assert.match(ps1, /\$NodeMajor\s*-lt\s*22/, 'install-win.ps1 thiếu kiểm tra Node >= 22');
            assert.match(ps1, /Win32_Process/, 'install-win.ps1 thiếu kiểm tra tiến trình Win32_Process');
            assert.match(ps1, /&\s*\$PyCmd\.Source\s+-B\s+\$BuildPy/, 'install-win.ps1 fallback Python bắt buộc phải truyền -B để tránh sinh __pycache__');

            assert.match(sh, /set -euo pipefail/, 'install-unix.sh thiếu set -euo pipefail');
            assert.match(sh, /python3\s+-B\s+"\$BUILD_PY"/, 'install-unix.sh fallback python3 bắt buộc phải truyền -B để tránh sinh __pycache__');
        });

        it('F15-T2-05: verify_cdp.js phải FAIL khi thiếu 1 trong 2 nút HUD hoặc 1 module HUD chết (bắt lỗi dòng 453)', async () => {
            const sandbox = makeTempDir('agy-test-vcdp-hud-');
            const daemonDir = path.join(sandbox, 'daemon');
            fs.mkdirSync(daemonDir, { recursive: true });
            const dummyDaemon = path.join(daemonDir, 'theme_daemon.js');
            fs.writeFileSync(dummyDaemon, 'setInterval(() => {}, 1000);\n', 'utf8');
            const child = spawnTracked(process.execPath, [dummyDaemon], { cwd: sandbox });
            await new Promise((r) => setTimeout(r, 150));
            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(child.pid), 'utf8');

            // Trường hợp mất nút Chuông Kagura (kaguraBtnPresent: false) và bioAudioAlive: false
            const mockCdp = createMockCdpServer({
                targetsFactory: (port) => [
                    {
                        id: 'page-hud-missing',
                        type: 'page',
                        url: `http://127.0.0.1:${port}/workbench`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-hud-missing`,
                    },
                ],
                onEvaluate: () => ({
                    isAntigravityDom: true,
                    themeActive: true,
                    wpEnabled: true,
                    hasLiveBlurRule: false,
                    leakedWindowToken: false,
                    cinemaBtnPresent: true,
                    kaguraBtnPresent: false,
                    hudBarPresent: true,
                    cinemaDirectorAlive: true,
                    bioAudioAlive: false,
                    tokenHudStyleAlive: true,
                    moduleChecks: {
                        sec: true,
                        themeCore: true,
                        themeForge: true,
                        fxModes: true,
                        chibiAura: true,
                        breathingSkills: true,
                        semanticIcons: true,
                        squadRaid: true,
                        tokenHud: true,
                        cinemaDirector: true,
                        bioAudio: false,
                    },
                    chibiSkillBarPresent: false,
                    userBubbleEmptyChildCount: 0,
                    userBubbleMissingGuardCount: 0,
                    masterPersona: 'yoriichi',
                    yoriichiIdentityValid: true,
                    shellFound: true,
                    shellDirectBgPresent: true,
                    shellAfterBgPresent: false,
                    shellBgImagePresent: true,
                    shellHoleActive: '0',
                }),
            });
            const cdpPort = await mockCdp.start();
            const portFile = path.join(sandbox, 'DevToolsActivePort');
            fs.writeFileSync(portFile, `${cdpPort}\n`, 'utf8');

            const res = await runNodeAsync([path.join(REPO_ROOT, 'scripts', 'verify_cdp.js')], {
                cwd: REPO_ROOT,
                env: { ...process.env, AGY_PORT_FILE: portFile, AGY_DAEMON_PID_FILE: pidFile },
                timeout: 20000,
            });
            await mockCdp.close();
            await stopChildAndWait(child);
            assert.notEqual(res.code, 0, 'verify_cdp.js phải trả exit code != 0 khi mất nút .agy-kagura-bell-btn hoặc module HUD chết');
            assert.match(res.stderr, /Asymmetric HUD|missing|died/i);
        });

        it('F15-T2-06: verify_cdp.js kiểm tra nền .agy-shell::after khi shellHoleActive === "1"', async () => {
            const vcdpSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'verify_cdp.js'), 'utf8');
            assert.match(
                vcdpSrc,
                /getComputedStyle\(\s*shellEl\s*,\s*['"]::after['"]\s*\)/,
                "verify_cdp.js INSPECT_EXPR phải kiểm tra getComputedStyle(shellEl, '::after') cho trường hợp shellHoleActive === '1'"
            );

            const sandbox = makeTempDir('agy-test-vcdp-after-');
            const daemonDir = path.join(sandbox, 'daemon');
            fs.mkdirSync(daemonDir, { recursive: true });
            const dummyDaemon = path.join(daemonDir, 'theme_daemon.js');
            fs.writeFileSync(dummyDaemon, 'setInterval(() => {}, 1000);\n', 'utf8');
            const child = spawnTracked(process.execPath, [dummyDaemon], { cwd: sandbox });
            await new Promise((r) => setTimeout(r, 150));
            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(child.pid), 'utf8');

            const mockCdp = createMockCdpServer({
                targetsFactory: (port) => [
                    {
                        id: 'page-hole',
                        type: 'page',
                        url: `http://127.0.0.1:${port}/workbench`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-hole`,
                    },
                ],
                onEvaluate: () => ({
                    isAntigravityDom: true,
                    themeActive: true,
                    wpEnabled: true,
                    hasLiveBlurRule: false,
                    leakedWindowToken: false,
                    cinemaBtnPresent: true,
                    kaguraBtnPresent: true,
                    hudBarPresent: true,
                    cinemaDirectorAlive: true,
                    bioAudioAlive: true,
                    tokenHudStyleAlive: true,
                    moduleChecks: {
                        sec: true,
                        themeCore: true,
                        themeForge: true,
                        fxModes: true,
                        chibiAura: true,
                        breathingSkills: true,
                        semanticIcons: true,
                        squadRaid: true,
                        tokenHud: true,
                        cinemaDirector: true,
                        bioAudio: true,
                    },
                    chibiSkillBarPresent: false,
                    userBubbleEmptyChildCount: 0,
                    userBubbleMissingGuardCount: 0,
                    masterPersona: 'yoriichi',
                    yoriichiIdentityValid: true,
                    shellFound: true,
                    shellDirectBgPresent: false,
                    shellAfterBgPresent: false,
                    shellBgImagePresent: false,
                    hasBrowserHole: 'true',
                    shellHoleActive: '1',
                }),
            });
            const cdpPort = await mockCdp.start();
            const portFile = path.join(sandbox, 'DevToolsActivePort');
            fs.writeFileSync(portFile, `${cdpPort}\n`, 'utf8');

            const res = await runNodeAsync([path.join(REPO_ROOT, 'scripts', 'verify_cdp.js')], {
                cwd: REPO_ROOT,
                env: { ...process.env, AGY_PORT_FILE: portFile, AGY_DAEMON_PID_FILE: pidFile },
                timeout: 20000,
            });
            await mockCdp.close();
            await stopChildAndWait(child);
            assert.notEqual(res.code, 0, 'verify_cdp.js phải FAIL khi shellHoleActive === "1" mà nền ::after bị rỗng');
            assert.match(res.stderr, /::after/i);
        });

        it('F15-T2-07: verify_cdp.js kiểm chứng đầy đủ các nhánh lỗi (deadModules, bioAudioAlive, tokenHudStyleAlive, R3, liveBlur, leakedToken) và wpEnabled=false hợp lệ', async () => {
            const sandbox = makeTempDir('agy-test-vcdp-branches-');
            const daemonDir = path.join(sandbox, 'daemon');
            fs.mkdirSync(daemonDir, { recursive: true });
            const dummyDaemon = path.join(daemonDir, 'theme_daemon.js');
            fs.writeFileSync(dummyDaemon, 'setInterval(() => {}, 1000);\n', 'utf8');
            const child = spawnTracked(process.execPath, [dummyDaemon], { cwd: sandbox });
            await new Promise((r) => setTimeout(r, 150));
            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(child.pid), 'utf8');

            const makeBaseReport = () => ({
                isAntigravityDom: true,
                themeActive: true,
                wpEnabled: true,
                hasLiveBlurRule: false,
                leakedWindowToken: false,
                cinemaBtnPresent: true,
                kaguraBtnPresent: true,
                hudBarPresent: true,
                cinemaDirectorAlive: true,
                bioAudioAlive: true,
                tokenHudStyleAlive: true,
                moduleChecks: {
                    sec: true,
                    themeCore: true,
                    themeForge: true,
                    fxModes: true,
                    chibiAura: true,
                    breathingSkills: true,
                    semanticIcons: true,
                    squadRaid: true,
                    tokenHud: true,
                    cinemaDirector: true,
                    bioAudio: true,
                },
                chibiSkillBarPresent: false,
                userBubbleEmptyChildCount: 0,
                userBubbleMissingGuardCount: 0,
                masterPersona: 'yoriichi',
                yoriichiIdentityValid: true,
                shellFound: true,
                shellDirectBgPresent: true,
                shellAfterBgPresent: false,
                shellBgImagePresent: true,
                shellHoleActive: '0',
            });

            let currentReport = makeBaseReport();
            const mockCdp = createMockCdpServer({
                targetsFactory: (port) => [
                    {
                        id: 'page-branch',
                        type: 'page',
                        url: `http://127.0.0.1:${port}/workbench`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-branch`,
                    },
                ],
                onEvaluate: () => currentReport,
            });
            const cdpPort = await mockCdp.start();
            const portFile = path.join(sandbox, 'DevToolsActivePort');
            fs.writeFileSync(portFile, `${cdpPort}\n`, 'utf8');
            const runVerify = () =>
                runNodeAsync([path.join(REPO_ROOT, 'scripts', 'verify_cdp.js')], {
                    cwd: REPO_ROOT,
                    env: { ...process.env, AGY_PORT_FILE: portFile, AGY_DAEMON_PID_FILE: pidFile },
                    timeout: 20000,
                });

            try {
                // 1. deadModules khi nút HUD vẫn đủ
                currentReport = makeBaseReport();
                currentReport.moduleChecks.squadRaid = false;
                let res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi deadModules chứa squadRaid');
                assert.match(res.stderr, /Dead module\(s\).*squadRaid/i);

                // 2. !bioAudioAlive độc lập
                currentReport = makeBaseReport();
                currentReport.bioAudioAlive = false;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi bioAudioAlive = false');
                assert.match(res.stderr, /__AGY_BIO_AUDIO__|died/i);

                // 3. !tokenHudStyleAlive khi hudBarPresent = true
                currentReport = makeBaseReport();
                currentReport.tokenHudStyleAlive = false;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi thiếu #antigravity-kny-token-hud-style');
                assert.match(res.stderr, /antigravity-kny-token-hud-style/);

                // 4. R3: chibiSkillBarPresent = true
                currentReport = makeBaseReport();
                currentReport.chibiSkillBarPresent = true;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi phát hiện #agy-chibi-skill-bar');
                assert.match(res.stderr, /agy-chibi-skill-bar/);

                // 5. R3: userBubbleEmptyChildCount > 0 & userBubbleMissingGuardCount > 0
                currentReport = makeBaseReport();
                currentReport.userBubbleEmptyChildCount = 1;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi userBubbleEmptyChildCount > 0');
                assert.match(res.stderr, /R3 user-bubble guard/);

                currentReport = makeBaseReport();
                currentReport.userBubbleMissingGuardCount = 2;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi userBubbleMissingGuardCount > 0');
                assert.match(res.stderr, /R3 user-bubble guard/);

                // 6. R3: yoriichiIdentityValid = false
                currentReport = makeBaseReport();
                currentReport.yoriichiIdentityValid = false;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi yoriichiIdentityValid = false');
                assert.match(res.stderr, /Yoriichi identity/i);

                // 7. hasLiveBlurRule = true & leakedWindowToken = true
                currentReport = makeBaseReport();
                currentReport.hasLiveBlurRule = true;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi hasLiveBlurRule = true');
                assert.match(res.stderr, /backdrop-filter blur/i);

                currentReport = makeBaseReport();
                currentReport.leakedWindowToken = true;
                res = await runVerify();
                assert.notEqual(res.code, 0, 'Phải FAIL khi leakedWindowToken = true');
                assert.match(res.stderr, /leaked onto global window/i);

                // 8. wpEnabled === false && shellHoleActive === '1' && !shellAfterBgPresent -> phải PASS
                currentReport = makeBaseReport();
                currentReport.wpEnabled = false;
                currentReport.shellHoleActive = '1';
                currentReport.shellDirectBgPresent = false;
                currentReport.shellAfterBgPresent = false;
                currentReport.shellBgImagePresent = false;
                res = await runVerify();
                assert.equal(res.code, 0, `wpEnabled=false với shellHoleActive='1' phải PASS: ${res.stderr}`);
                assert.match(res.stdout, /\[verify-cdp\] PASS:/);
            } finally {
                await mockCdp.close();
                await stopChildAndWait(child);
            }
        });

        it('F15-T2-08: INSPECT_EXPR trong verify_cdp.js hợp lệ cú pháp JS, tránh đếm trùng empty child và không nhận nhầm card Welcome là composer', () => {
            const vcdpSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'verify_cdp.js'), 'utf8');
            const m = vcdpSrc.match(/const INSPECT_EXPR = `([\s\S]*?)`;\r?\n\r?\nasync function main/);
            assert.ok(m, 'Không trích xuất được INSPECT_EXPR từ scripts/verify_cdp.js');
            const expr = m[1]
                .replace(/\\\\/g, '\\')
                .replace(/\\`/g, '`')
                .replace(/\\\$/g, '$');

            assert.doesNotThrow(() => new vm.Script(expr), 'INSPECT_EXPR phải hợp lệ cú pháp JS');

            const makeChild = ({ empty = false, classes = [], hasGuard = false } = {}) => ({
                children: empty ? [] : [{}],
                textContent: '',
                childNodes: empty ? [] : [{}],
                classList: { contains: (c) => classes.includes(c) },
                matches: (sel) => (sel === ':empty' ? empty : false),
                querySelector: (sel) => (sel === 'i[aria-hidden="true"]' && hasGuard ? {} : null),
            });
            const frame = {
                children: [
                    makeChild({ empty: true }),
                    makeChild({ empty: false, classes: ['agy-chibi-hitbox'], hasGuard: true }),
                ],
                querySelectorAll: () => [makeChild({ empty: true })],
            };
            const welcomeCard = { id: 'welcome-card' };
            const sandboxCtx = {
                window: { innerWidth: 1280, innerHeight: 800 },
                location: { pathname: '/launchpad' },
                localStorage: { getItem: () => null },
                getComputedStyle: () => ({ backdropFilter: 'none', backgroundImage: 'none', backgroundColor: 'transparent' }),
                document: {
                    title: 'Antigravity',
                    body: { dataset: {} },
                    getElementById: (id) => (id === 'antigravity-custom-theme-active' ? {} : null),
                    querySelector: (sel) => {
                        if (sel === '[data-launchpad]') return {};
                        if (sel === 'div.relative.flex.flex-col.rounded-lg.border') return welcomeCard;
                        if (sel === '.agy-shell, .monaco-workbench, [data-launchpad], #workbench\\.parts\\.editor') return {};
                        return null;
                    },
                    querySelectorAll: (sel) => {
                        if (sel === '.agy-user-bubble-frame') return [frame];
                        return [];
                    },
                },
            };
            const report = vm.runInNewContext(expr, sandboxCtx);
            assert.equal(report.isAntigravityDom, true);
            assert.equal(report.isWelcomeView, true);
            assert.equal(report.composerPresent, false, 'Welcome view không được nhận nhầm div.relative.flex.flex-col.rounded-lg.border là composer');
            assert.equal(report.userBubbleEmptyChildCount, 1, 'Một phần tử rỗng chỉ được đếm đúng 1 lần');
            assert.equal(report.userBubbleMissingGuardCount, 0);
        });

        it('F15-T2-09: build_payload.js hỗ trợ -h/--help và cú pháp --themes=/--engine=/--out=', () => {
            const buildJs = path.join(REPO_ROOT, 'scripts', 'build_payload.js');
            const helpOut = execFileSync(process.execPath, [buildJs, '--help'], {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                windowsHide: true,
            });
            assert.match(helpOut, /Usage:\s+node scripts\/build_payload\.js/i);

            const shortHelpOut = execFileSync(process.execPath, [buildJs, '-h'], {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                windowsHide: true,
            });
            assert.match(shortHelpOut, /--inline-all/);

            const tmp = makeTempDir('agy-test-build-eq-');
            const outFile = path.join(tmp, 'eq_bundle.js');
            const eqOut = execFileSync(
                process.execPath,
                [
                    buildJs,
                    `--themes=${path.join(REPO_ROOT, 'themes', 'themes.json')}`,
                    `--engine=${path.join(REPO_ROOT, 'engine', 'core.js')}`,
                    `--out=${outFile}`,
                ],
                { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, timeout: 20000 }
            );
            assert.match(eqOut, /mode=hybrid/);
            assert.equal(fs.existsSync(outFile), true);
        });

        it('F15-T2-10: uninstall.js dừng được daemon khởi chạy kiểu npm start (đường dẫn tương đối daemon/theme_daemon.js) và giữ nguyên foreign', async () => {
            const { sandbox, uninstallDest, env } = setupUninstallSandbox();
            const otherDir = makeTempDir('agy-test-rel-foreign-');
            fs.mkdirSync(path.join(otherDir, 'daemon'), { recursive: true });
            fs.writeFileSync(path.join(otherDir, 'daemon', 'theme_daemon.js'), 'setInterval(() => {}, 1000);\n', 'utf8');

            const relDaemon = spawnTracked(process.execPath, ['daemon/theme_daemon.js'], { cwd: sandbox, env });
            const foreign = spawnTracked(process.execPath, ['daemon/theme_daemon.js'], { cwd: otherDir });
            await new Promise((r) => setTimeout(r, 200));
            assert.equal(isPidAlive(relDaemon.pid), true);
            assert.equal(isPidAlive(foreign.pid), true);

            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(relDaemon.pid), 'utf8');

            const helpers = loadUninstallHelpersForRoot(sandbox);
            assert.equal(
                helpers.isTargetDaemonCommand('node ./daemon/theme_daemon.js', '', { allowRelativeFromRoot: true }),
                true,
                'Phải chấp nhận đường dẫn tương đối có phân cách thư mục thuộc ROOT_DIR'
            );
            assert.equal(
                helpers.isTargetDaemonCommand('node theme_daemon.js', '', { allowRelativeFromRoot: true }),
                false,
                'Không được chấp nhận tên file trần theme_daemon.js không có phân cách thư mục'
            );

            const res = await runNodeAsync([uninstallDest], { cwd: sandbox, env, timeout: 30000 });
            assert.equal(res.code, 0, `uninstall.js thất bại: ${res.stderr}`);

            await new Promise((r) => setTimeout(r, 250));
            const relAlive = isPidAlive(relDaemon.pid);
            const foreignAlive = isPidAlive(foreign.pid);
            await stopChildAndWait(relDaemon);
            await stopChildAndWait(foreign);

            assert.equal(relAlive, false, 'uninstall.js phải dừng được daemon cùng ROOT_DIR chạy bằng daemon/theme_daemon.js');
            assert.equal(fs.existsSync(pidFile), false);
            assert.equal(foreignAlive, true, 'uninstall.js không được giết tiến trình daemon ở thư mục khác');
        });

        it('F15-T2-11: uninstall.js nhận diện đúng đường dẫn viết hoa/thường trên Windows (DAEMON\\THEME_DAEMON.JS) kể cả khi mất daemon.pid', async () => {
            const { sandbox, uninstallDest, env } = setupUninstallSandbox();
            const helpers = loadUninstallHelpersForRoot(sandbox);

            if (process.platform === 'win32') {
                const upperDaemonPath = path.join(sandbox, 'DAEMON', 'THEME_DAEMON.JS');
                assert.equal(
                    helpers.isTargetDaemonCommand(`"node.exe" "${upperDaemonPath}"`, 'node.exe'),
                    true,
                    'isTargetDaemonCommand trên win32 phải trả về true với đường dẫn viết hoa DAEMON\\THEME_DAEMON.JS'
                );

                const upperOrphan = spawnTracked(process.execPath, [upperDaemonPath], { cwd: sandbox, env });
                await new Promise((r) => setTimeout(r, 200));
                assert.equal(isPidAlive(upperOrphan.pid), true);
                assert.equal(fs.existsSync(path.join(sandbox, 'daemon.pid')), false);

                const res = await runNodeAsync([uninstallDest], { cwd: sandbox, env, timeout: 30000 });
                assert.equal(res.code, 0, `uninstall.js thất bại: ${res.stderr}`);

                await new Promise((r) => setTimeout(r, 250));
                const stillAlive = isPidAlive(upperOrphan.pid);
                await stopChildAndWait(upperOrphan);
                assert.equal(stillAlive, false, 'Orphan daemon với đường dẫn hoa/thường trong sandbox phải bị dừng khi mất daemon.pid');
            } else {
                const exactDaemonPath = path.join(sandbox, 'daemon', 'theme_daemon.js');
                assert.equal(helpers.isTargetDaemonCommand(`"node" "${exactDaemonPath}"`, 'node'), true);
            }
        });

        it('F15-T2-12: isTargetDaemonCommand chống false-positive --target="<RESOLVED_DAEMON_JS>" và không chặn nhầm thư mục uninstall.js-app', () => {
            const { sandbox } = setupUninstallSandbox();
            const resolvedDaemon = path.join(sandbox, 'daemon', 'theme_daemon.js');
            const helpers = loadUninstallHelpersForRoot(sandbox);

            assert.equal(
                helpers.isTargetDaemonCommand(`"node.exe" "other.js" --target="${resolvedDaemon}"`, 'node.exe'),
                false,
                'Không được nhận nhầm tham số --target="..." trỏ tới daemon'
            );
            assert.equal(
                helpers.isTargetDaemonCommand(`node other.js --target=${resolvedDaemon}`, 'node.exe'),
                false,
                'Không được nhận nhầm tham số --target=... không bọc ngoặc kép'
            );
            assert.equal(
                helpers.isTargetDaemonCommand(
                    'node other.js --flag=../daemon/theme_daemon.js',
                    'node.exe',
                    { allowRelativeFromRoot: true }
                ),
                false,
                'Không được nhận nhầm cờ dạng --flag=../daemon/theme_daemon.js ngay cả khi allowRelativeFromRoot=true'
            );
            assert.equal(
                helpers.isTargetDaemonArgs(
                    ['node', '-f=../daemon/theme_daemon.js'],
                    'node.exe',
                    { allowRelativeFromRoot: true }
                ),
                false,
                'Không được nhận nhầm token bắt đầu bằng dấu gạch nối ở nhánh đường dẫn tương đối'
            );
            assert.equal(
                helpers.isTargetDaemonCommand(`"node.exe" "${path.join(sandbox, 'scripts', 'uninstall.js')}" "${resolvedDaemon}"`, 'node.exe'),
                false,
                'Lệnh thực thi scripts/uninstall.js vẫn phải bị từ chối'
            );

            const appDir = makeTempDir('agy-uninstall.js-app-');
            fs.mkdirSync(path.join(appDir, 'daemon'), { recursive: true });
            const appDaemon = path.join(appDir, 'daemon', 'theme_daemon.js');
            fs.writeFileSync(appDaemon, 'setInterval(() => {}, 1000);\n', 'utf8');
            const appHelpers = loadUninstallHelpersForRoot(appDir);
            assert.equal(
                appHelpers.isTargetDaemonCommand(`"node.exe" "${appDaemon}"`, 'node.exe'),
                true,
                'Không được chặn nhầm thư mục cài đặt có tên chứa uninstall.js-app'
            );
        });

        it("F15-T2-13: splitCommandLineArgs trên win32 giữ nguyên ký tự ' trong đường dẫn Windows", () => {
            const { sandbox } = setupUninstallSandbox();
            const helpers = loadUninstallHelpersForRoot(sandbox);
            const samplePath = ['C:', 'Users', "O'Brien", 'antigravity-custom-theme', 'daemon', 'theme_daemon.js'].join('\\');

            const tokensWin = helpers.splitCommandLineArgs(`node ${samplePath}`, 'win32');
            assert.deepEqual(tokensWin, ['node', samplePath]);
            assert.ok(tokensWin[1].includes("O'Brien"), "splitCommandLineArgs trên win32 phải giữ nguyên dấu nháy đơn '");

            if (process.platform === 'win32') {
                assert.deepEqual(helpers.splitCommandLineArgs(`node ${samplePath}`), ['node', samplePath]);
            }

            const obrienSandbox = makeTempDir("agy-O'Brien-");
            fs.mkdirSync(path.join(obrienSandbox, 'daemon'), { recursive: true });
            const obrienDaemon = path.join(obrienSandbox, 'daemon', 'theme_daemon.js');
            fs.writeFileSync(obrienDaemon, 'setInterval(() => {}, 1000);\n', 'utf8');
            const obrienHelpers = loadUninstallHelpersForRoot(obrienSandbox);
            assert.equal(
                obrienHelpers.isTargetDaemonCommand(`node.exe ${obrienDaemon}`, 'node.exe'),
                true,
                "isTargetDaemonCommand phải khớp đúng đường dẫn không bọc ngoặc kép chứa dấu '"
            );
        });

        it('F15-T2-14: uninstall.js dừng đúng daemon trong thư mục Unicode Tiếng Việt có dấu (cả có daemon.pid và orphan) mà vẫn giữ nguyên foreign', async () => {
            const baseTmp = makeTempDir('agy-test-unicode-');
            const unicodeDirName = 'Th\u1eed Nghi\u1ec7m Ti\u1ebfng Vi\u1ec7t';
            const sandbox = path.join(baseTmp, unicodeDirName);
            const scriptsDir = path.join(sandbox, 'scripts');
            const daemonDir = path.join(sandbox, 'daemon');
            fs.mkdirSync(scriptsDir, { recursive: true });
            fs.mkdirSync(daemonDir, { recursive: true });

            const uninstallDest = path.join(scriptsDir, 'uninstall.js');
            fs.copyFileSync(path.join(REPO_ROOT, 'scripts', 'uninstall.js'), uninstallDest);
            const dummyDaemonPath = path.join(daemonDir, 'theme_daemon.js');
            fs.writeFileSync(dummyDaemonPath, 'setInterval(() => {}, 1000);\n', 'utf8');
            const env = buildSandboxEnv(sandbox);

            const foreignDir = path.join(baseTmp, 'Ngo\u1ea1i Lai Kh\u00e1c');
            fs.mkdirSync(path.join(foreignDir, 'daemon'), { recursive: true });
            const foreignDaemonPath = path.join(foreignDir, 'daemon', 'theme_daemon.js');
            fs.writeFileSync(foreignDaemonPath, 'setInterval(() => {}, 1000);\n', 'utf8');

            // Ca A: có daemon.pid trong thư mục Unicode Tiếng Việt
            const daemonWithPid = spawnTracked(process.execPath, [dummyDaemonPath], { cwd: sandbox, env });
            const foreign1 = spawnTracked(process.execPath, [foreignDaemonPath], { cwd: foreignDir });
            await new Promise((r) => setTimeout(r, 200));
            assert.equal(isPidAlive(daemonWithPid.pid), true);
            assert.equal(isPidAlive(foreign1.pid), true);

            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(daemonWithPid.pid), 'utf8');

            const resWithPid = await runNodeAsync([uninstallDest], { cwd: sandbox, env, timeout: 30000 });
            assert.equal(resWithPid.code, 0, `uninstall.js thất bại (có daemon.pid): ${resWithPid.stderr}`);

            await new Promise((r) => setTimeout(r, 250));
            const withPidAliveAfter = isPidAlive(daemonWithPid.pid);
            const foreign1AliveAfter = isPidAlive(foreign1.pid);
            await stopChildAndWait(daemonWithPid);
            await stopChildAndWait(foreign1);

            assert.equal(withPidAliveAfter, false, 'uninstall.js phải dừng được daemon có daemon.pid trong thư mục Unicode');
            assert.equal(fs.existsSync(pidFile), false, 'daemon.pid phải bị xóa sau khi gỡ');
            assert.equal(foreign1AliveAfter, true, 'uninstall.js không được giết tiến trình ngoại lai ở thư mục khác (ca có daemon.pid)');

            // Ca B: mất daemon.pid (orphan) trong thư mục Unicode Tiếng Việt
            const orphanDaemon = spawnTracked(process.execPath, [dummyDaemonPath], { cwd: sandbox, env });
            const foreign2 = spawnTracked(process.execPath, [foreignDaemonPath], { cwd: foreignDir });
            await new Promise((r) => setTimeout(r, 200));
            assert.equal(isPidAlive(orphanDaemon.pid), true);
            assert.equal(isPidAlive(foreign2.pid), true);
            assert.equal(fs.existsSync(pidFile), false);

            const resOrphan = await runNodeAsync([uninstallDest], { cwd: sandbox, env, timeout: 30000 });
            assert.equal(resOrphan.code, 0, `uninstall.js thất bại (orphan): ${resOrphan.stderr}`);

            await new Promise((r) => setTimeout(r, 250));
            const orphanAliveAfter = isPidAlive(orphanDaemon.pid);
            const foreign2AliveAfter = isPidAlive(foreign2.pid);
            await stopChildAndWait(orphanDaemon);
            await stopChildAndWait(foreign2);

            assert.equal(orphanAliveAfter, false, 'uninstall.js phải dừng được orphan daemon trong thư mục Unicode');
            assert.equal(foreign2AliveAfter, true, 'uninstall.js không được giết tiến trình ngoại lai ở thư mục khác (ca orphan)');
        });

        it("F15-T2-15: unpatchWindowsShortcuts xử lý đúng shortcut .lnk Unicode Tiếng Việt + nháy đơn bằng COM IShellLinkW (cô lập hoàn toàn trong tmpdir)", (t) => {
            if (process.platform !== 'win32') {
                t.skip('Kiểm thử COM IShellLinkW chỉ áp dụng trên Windows');
                return;
            }

            // 1. Kiểm chứng PowerShell AST cho psScript bên trong unpatchWindowsShortcuts
            const uninstallSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'uninstall.js'), 'utf8');
            const psMatch = uninstallSrc.match(/function unpatchWindowsShortcuts[\s\S]*?const psScript = (`[\s\S]*?`);/);
            assert.ok(psMatch, 'Không trích xuất được psScript từ unpatchWindowsShortcuts');
            const extractedPs = vm.runInNewContext(psMatch[1]);
            execFileSync(
                'powershell.exe',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    '$errs = $null; $toks = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:AGY_PS_SRC, [ref]$toks, [ref]$errs); if ($errs -and $errs.Count -gt 0) { $errs | ForEach-Object { Write-Error $_.ToString() }; exit 1 }',
                ],
                {
                    env: { ...process.env, AGY_PS_SRC: extractedPs },
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 15000,
                }
            );

            // 2. Tạo cấu trúc thư mục & file .lnk cô lập hoàn toàn trong os.tmpdir() (chuẩn hóa đường dẫn 8.3 RUNNER~1 trên Windows CI)
            const rawTmp = makeTempDir('agy-test-lnk-unicode-');
            const tmp = (fs.realpathSync && typeof fs.realpathSync.native === 'function')
                ? fs.realpathSync.native(rawTmp)
                : fs.realpathSync(rawTmp);
            const asciiDir = path.join(tmp, 'AsciiDir');
            const unicodeRoot = path.join(tmp, 'Th\u1eed Nghi\u1ec7m Ti\u1ebfng Vi\u1ec7t');
            const unicodeSubDir = path.join(unicodeRoot, "O'Brien");
            const appDir = path.join(tmp, 'AsciiApp');
            fs.mkdirSync(asciiDir, { recursive: true });
            fs.mkdirSync(unicodeSubDir, { recursive: true });
            fs.mkdirSync(appDir, { recursive: true });

            const fakeExe = path.join(appDir, 'Antigravity.exe');
            const otherExe = path.join(appDir, 'OtherApp.exe');
            fs.writeFileSync(fakeExe, Buffer.alloc(0));
            fs.writeFileSync(otherExe, Buffer.alloc(0));

            const dummyDataDir = ['C:', 'Ascii', 'Data'].join('\\');
            const expectedPatchedArgs = `--user-data-dir="${dummyDataDir}"`;
            const initialArgs = `--remote-debugging-port=9222 ${expectedPatchedArgs}`;
            const otherInitialArgs = '--remote-debugging-port=9222 --keep=1';

            const asciiLnk = path.join(asciiDir, 'Antigravity.lnk');
            const uniDirLnk = path.join(unicodeSubDir, 'Antigravity.lnk');
            const uniNameLnk = path.join(asciiDir, 'Antigravity Ti\u1ebfng Vi\u1ec7t.lnk');
            const otherLnk = path.join(asciiDir, 'OtherApp.lnk');

            const createSeedPs = `
$wsh = New-Object -ComObject WScript.Shell
$s1 = $wsh.CreateShortcut($env:AGY_SEED_LNK)
$s1.TargetPath = $env:AGY_FAKE_EXE
$s1.Arguments = $env:AGY_INIT_ARGS
$s1.Save()
$s2 = $wsh.CreateShortcut($env:AGY_OTHER_LNK)
$s2.TargetPath = $env:AGY_OTHER_EXE
$s2.Arguments = $env:AGY_OTHER_ARGS
$s2.Save()
[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($wsh)
`;
            execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', createSeedPs], {
                env: {
                    ...process.env,
                    AGY_SEED_LNK: asciiLnk,
                    AGY_FAKE_EXE: fakeExe,
                    AGY_INIT_ARGS: initialArgs,
                    AGY_OTHER_LNK: otherLnk,
                    AGY_OTHER_EXE: otherExe,
                    AGY_OTHER_ARGS: otherInitialArgs,
                },
                stdio: 'pipe',
                windowsHide: true,
                timeout: 15000,
            });
            fs.copyFileSync(asciiLnk, uniDirLnk);
            fs.copyFileSync(asciiLnk, uniNameLnk);

            // 3. Gọi logic unpatchWindowsShortcuts() chỉ nhắm vào 2 thư mục tạm cô lập
            const helpers = loadUninstallHelpersForRoot(tmp);
            const logs = [];
            const origLog = console.log;
            console.log = (...args) => logs.push(args.map(String).join(' '));
            try {
                helpers.unpatchWindowsShortcuts([asciiDir, unicodeRoot]);
            } finally {
                console.log = origLog;
            }

            assert.equal(logs.some((l) => l.includes(asciiLnk)), true, 'Phải log đã sửa AsciiDir\\Antigravity.lnk');
            assert.equal(logs.some((l) => l.includes(uniDirLnk)), true, 'Phải log đã sửa shortcut trong thư mục Unicode Tiếng Việt');
            assert.equal(logs.some((l) => l.includes(uniNameLnk)), true, 'Phải log đã sửa shortcut có tên tệp Unicode Tiếng Việt');
            assert.equal(logs.some((l) => l.includes(otherLnk)), false, 'Không được sửa shortcut không phải Antigravity.exe');

            // 4. Đọc lại cả 4 file .lnk bằng COM Unicode IShellLinkW để xác nhận nội dung
            const readBackPs = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace AgyTestLnkVerify {
    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink { }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    public static class Reader {
        public static string[] Read(string path) {
            object link = null;
            try {
                link = new ShellLink();
                ((IPersistFile)link).Load(path, 0);
                var sl = (IShellLinkW)link;
                var t = new StringBuilder(4096);
                var a = new StringBuilder(4096);
                sl.GetPath(t, t.Capacity, IntPtr.Zero, 0);
                sl.GetArguments(a, a.Capacity);
                return new string[] { t.ToString(), a.ToString() };
            } finally {
                if (link != null && Marshal.IsComObject(link)) {
                    Marshal.FinalReleaseComObject(link);
                }
            }
        }
    }
}
'@
$targets = @($env:AGY_LNK_1, $env:AGY_LNK_2, $env:AGY_LNK_3, $env:AGY_LNK_4)
$res = foreach ($p in $targets) {
  $v = [AgyTestLnkVerify.Reader]::Read($p)
  [PSCustomObject]@{ path = $p; target = $v[0]; args = $v[1] }
}
$res | ConvertTo-Json -Compress
`;
            const rawJson = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', readBackPs], {
                env: {
                    ...process.env,
                    AGY_LNK_1: asciiLnk,
                    AGY_LNK_2: uniDirLnk,
                    AGY_LNK_3: uniNameLnk,
                    AGY_LNK_4: otherLnk,
                },
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
                timeout: 20000,
            }).trim();
            const parsed = JSON.parse(rawJson.replace(/^\uFEFF/, ''));
            assert.equal(parsed.length, 4);

            for (const idx of [0, 1, 2]) {
                assert.equal(
                    parsed[idx].target.toLowerCase(),
                    fakeExe.toLowerCase(),
                    `TargetPath phải được giữ nguyên trên ${parsed[idx].path}`
                );
                assert.equal(
                    parsed[idx].args,
                    expectedPatchedArgs,
                    `--remote-debugging-port=9222 phải bị gỡ sạch mà vẫn giữ --user-data-dir trên ${parsed[idx].path}`
                );
            }
            assert.equal(parsed[3].target.toLowerCase(), otherExe.toLowerCase());
            assert.equal(parsed[3].args, otherInitialArgs, 'Shortcut không phải Antigravity.exe phải giữ nguyên arguments');

            // 5. Xác nhận file .lnk không bị COM giữ lock khi xóa
            fs.rmSync(asciiLnk, { force: true });
            fs.rmSync(uniDirLnk, { force: true });
            fs.rmSync(uniNameLnk, { force: true });
            assert.equal(fs.existsSync(uniDirLnk), false);
        });
    });

    describe('Tier 3 — Tổ Hợp Vòng Đời Scripts (Build -> Verify CDP -> Uninstall)', () => {
        it('F15-T3-01: Chuỗi tích hợp build_payload.js -> verify_cdp.js -> uninstall.js (gỡ payload qua Mock CDP)', async () => {
            const { sandbox, uninstallDest, dummyDaemonPath, env } = setupUninstallSandbox();
            const outPayload = path.join(sandbox, 'dist', 'theme_payload.js');

            execFileSync(
                process.execPath,
                [path.join(REPO_ROOT, 'scripts', 'build_payload.js'), '--out', outPayload],
                { cwd: REPO_ROOT, stdio: 'pipe', windowsHide: true, timeout: 20000 }
            );
            assert.equal(fs.existsSync(outPayload), true);

            const dummy = spawnTracked(process.execPath, [dummyDaemonPath], { cwd: sandbox, env });
            await new Promise((r) => setTimeout(r, 150));
            const pidFile = path.join(sandbox, 'daemon.pid');
            fs.writeFileSync(pidFile, String(dummy.pid), 'utf8');

            const cdpCalls = [];
            const mockCdp = createMockCdpServer({
                targetsFactory: (port) => [
                    {
                        id: 'agy-e2e-1',
                        type: 'page',
                        url: `http://127.0.0.1:${port}/workbench`,
                        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/agy-e2e-1`,
                    },
                ],
                onEvaluate: (_wsPath, expr) => {
                    cdpCalls.push(expr);
                    return {
                        isAntigravityDom: true,
                        themeActive: true,
                        wpEnabled: true,
                        hasLiveBlurRule: false,
                        leakedWindowToken: false,
                        cinemaBtnPresent: true,
                        kaguraBtnPresent: true,
                        hudBarPresent: true,
                        cinemaDirectorAlive: true,
                        bioAudioAlive: true,
                        tokenHudStyleAlive: true,
                        moduleChecks: {
                            sec: true,
                            themeCore: true,
                            themeForge: true,
                            fxModes: true,
                            chibiAura: true,
                            breathingSkills: true,
                            semanticIcons: true,
                            squadRaid: true,
                            tokenHud: true,
                            cinemaDirector: true,
                            bioAudio: true,
                        },
                        chibiSkillBarPresent: false,
                        userBubbleEmptyChildCount: 0,
                        userBubbleMissingGuardCount: 0,
                        masterPersona: 'yoriichi',
                        yoriichiIdentityValid: true,
                        shellFound: true,
                        shellDirectBgPresent: true,
                        shellAfterBgPresent: false,
                        shellBgImagePresent: true,
                        shellHoleActive: '0',
                    };
                },
            });
            const cdpPort = await mockCdp.start();
            const portFile = path.join(sandbox, 'DevToolsActivePort');
            fs.writeFileSync(portFile, `${cdpPort}\n`, 'utf8');

            const verifyRes = await runNodeAsync([path.join(REPO_ROOT, 'scripts', 'verify_cdp.js')], {
                cwd: REPO_ROOT,
                env: { ...env, AGY_PORT_FILE: portFile, AGY_DAEMON_PID_FILE: pidFile },
                timeout: 20000,
            });
            assert.equal(verifyRes.code, 0, `verify_cdp.js thất bại: ${verifyRes.stderr}`);
            assert.match(verifyRes.stdout, /\[verify-cdp\] PASS:/);

            const uninstRes = await runNodeAsync([uninstallDest], {
                cwd: sandbox,
                env: { ...env, AGY_PORT_FILE: portFile },
                timeout: 30000,
            });
            assert.equal(uninstRes.code, 0, `uninstall.js thất bại: ${uninstRes.stderr}`);

            await new Promise((r) => setTimeout(r, 200));
            assert.equal(isPidAlive(dummy.pid), false);
            assert.equal(fs.existsSync(pidFile), false);
            assert.ok(cdpCalls.some((e) => e.includes('__ANTIGRAVITY_REMOVE_CUSTOM_THEME__')));

            await mockCdp.close();
            await stopChildAndWait(dummy);
        });
    });
});
