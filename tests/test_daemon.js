'use strict';

/**
 * Bộ kiểm thử toàn diện cho daemon/theme_daemon.js (F01, F02, F03):
 * - F01: Loopback-only, Host Pinning, Ephemeral Token 256-bit (không lộ trên window), /assets/* chống traversal/junction, MIME, ETag 304, CORP, Origin & CORS
 * - F02: Incremental Byte-Offset Tailer O(Δbytes), UTF-8 multi-byte chunk split, truncation, OversizeScanner > 2MB, SSE /__events & /__telemetry, batch justSlashedBug, Swarm & hồi sinh > 12s TTL
 * - F03: DevToolsActivePort parsing, lọc candidate target & verifyDomIsAntigravity, chống double-inject Page.frameNavigated, hot-reload debounce, sync đa cửa sổ không Ping-Pong, PID lock & PII log redaction/rotation
 * Cô lập 100% trong os.tmpdir() (tiền tố agy-test-), không sửa code sản phẩm, không chạm daemon thật hay shortcuts Windows thật.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const DAEMON_SRC_PATH = path.join(REPO_ROOT, 'daemon', 'theme_daemon.js');

const ACTIVE_SANDBOXES = [];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 6000, intervalMs = 50, errMsg = 'Hết thời gian chờ điều kiện') {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await predicate();
        if (res) return res;
        await sleep(intervalMs);
    }
    throw new Error(errMsg);
}

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

/**
 * Mock CDP Server (HTTP /json + WebSocket RFC 6455) hỗ trợ đa target & đẩy event ngược về daemon.
 */
function createMockCdpServer() {
    let targets = [];
    const targetSockets = new Map();
    const allSockets = new Set();
    const events = [];
    let probeOverride = null;
    let evalDelayMs = 0;
    let tokenResolve = null;
    const tokenPromise = new Promise((r) => {
        tokenResolve = r;
    });
    let extractedToken = '';
    let lastInjectedBootExpr = '';

    const server = http.createServer((req, res) => {
        if (req.url === '/json' || req.url === '/json/list') {
            const port = server.address().port;
            const resolved = targets.map((t) => ({
                ...t,
                webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${t.id}`,
            }));
            const body = JSON.stringify(resolved);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
            res.end(body);
            return;
        }
        res.writeHead(404);
        res.end('Not Found');
    });

    server.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }
        const match = String(req.url || '').match(/\/devtools\/page\/([^/?]+)/);
        const targetId = match ? match[1] : 'unknown';

        allSockets.add(socket);
        if (!targetSockets.has(targetId)) targetSockets.set(targetId, new Set());
        targetSockets.get(targetId).add(socket);

        socket.on('error', () => {});
        socket.on('close', () => {
            allSockets.delete(socket);
            const set = targetSockets.get(targetId);
            if (set) set.delete(socket);
        });

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
        let scriptCounter = 1;
        socket.on('data', (chunk) => {
            rxBuf = Buffer.concat([rxBuf, chunk]);
            rxBuf = decodeWsFrames(rxBuf, async (opcode, payload) => {
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
                if (opcode !== 0x01) return;
                const msg = JSON.parse(payload.toString('utf8'));
                events.push({ targetId, method: msg.method, params: msg.params || {} });

                if (msg.method === 'Runtime.evaluate') {
                    const expr = String((msg.params && msg.params.expression) || '');
                    const isProbe = expr.includes('DOM_VERIFICATION_PROBE') || expr.includes('payloadReady');
                    if (!isProbe && expr.includes('__AGY_INJECT_BOOT__')) {
                        lastInjectedBootExpr = expr;
                        const tm = expr.match(/"token"\s*:\s*"([0-9a-f]{64})"/);
                        if (tm && !extractedToken) {
                            extractedToken = tm[1];
                            tokenResolve(extractedToken);
                        }
                        if (evalDelayMs > 0) await sleep(evalDelayMs);
                        socket.write(encodeWsTextFrame(JSON.stringify({ id: msg.id, result: { result: { value: true } } })));
                        return;
                    }
                    const targetObj = targets.find((t) => t.id === targetId);
                    let probeVal;
                    if (typeof probeOverride === 'function') {
                        probeVal = probeOverride(targetId, targetObj, expr);
                    } else if (targetObj && targetObj._probe) {
                        probeVal = targetObj._probe;
                    } else {
                        probeVal = {
                            matched: !(targetObj && targetObj._fakeNonAntigravity),
                            hasBody: true,
                            payloadReady: false,
                            readyState: 'complete',
                            origin: targetObj && targetObj._origin ? targetObj._origin : `http://127.0.0.1:${server.address().port}`,
                        };
                    }
                    socket.write(encodeWsTextFrame(JSON.stringify({ id: msg.id, result: { result: { value: probeVal } } })));
                } else if (msg.method === 'Page.addScriptToEvaluateOnNewDocument') {
                    const expr = String((msg.params && msg.params.source) || '');
                    const tm = expr.match(/"token"\s*:\s*"([0-9a-f]{64})"/);
                    if (tm && !extractedToken) {
                        extractedToken = tm[1];
                        tokenResolve(extractedToken);
                    }
                    const idStr = `script-${targetId}-${scriptCounter++}`;
                    socket.write(encodeWsTextFrame(JSON.stringify({ id: msg.id, result: { identifier: idStr } })));
                } else {
                    socket.write(encodeWsTextFrame(JSON.stringify({ id: msg.id, result: {} })));
                }
            });
        });
    });

    return {
        get port() {
            return server.address() ? server.address().port : 0;
        },
        events,
        get token() {
            return extractedToken;
        },
        get lastInjectedBootExpr() {
            return lastInjectedBootExpr;
        },
        setTargets(nextTargets) {
            targets = nextTargets;
        },
        setProbeOverride(fn) {
            probeOverride = fn;
        },
        setEvalDelay(ms) {
            evalDelayMs = ms;
        },
        waitForToken(timeoutMs = 8000) {
            return Promise.race([
                tokenPromise,
                sleep(timeoutMs).then(() => {
                    throw new Error('Không trích được EPHEMERAL_TOKEN từ Mock CDP');
                }),
            ]);
        },
        sendEvent(targetId, method, params) {
            const set = targetSockets.get(targetId);
            if (!set || set.size === 0) throw new Error(`Không có WS socket đang mở cho target ${targetId}`);
            const frame = encodeWsTextFrame(JSON.stringify({ method, params }));
            for (const s of set) {
                s.write(frame);
            }
        },
        countMethod(targetId, method, predicate) {
            return events.filter(
                (e) =>
                    (targetId === null || e.targetId === targetId) &&
                    e.method === method &&
                    (!predicate || predicate(e.params))
            ).length;
        },
        clearEvents() {
            events.length = 0;
        },
        async start() {
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            return server.address().port;
        },
        async close() {
            for (const s of allSockets) {
                try {
                    s.destroy();
                } catch (_) {}
            }
            allSockets.clear();
            targetSockets.clear();
            await new Promise((resolve) => server.close(() => resolve()));
        },
    };
}

function rawTcpHttpRequest(port, rawRequest) {
    return new Promise((resolve, reject) => {
        const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
            sock.write(rawRequest);
        });
        const chunks = [];
        sock.on('data', (c) => chunks.push(c));
        sock.on('end', () => {
            const full = Buffer.concat(chunks).toString('utf8');
            const m = full.match(/^HTTP\/1\.[01]\s+(\d+)/);
            resolve({ status: m ? parseInt(m[1], 10) : 0, raw: full });
        });
        sock.on('error', reject);
    });
}

async function waitForInitialAttach(ctx, targetId = 'target-main') {
    await waitFor(
        () =>
            ctx.mockCdp.countMethod(targetId, 'Runtime.addBinding') >= 1 &&
            ctx.mockCdp.countMethod(targetId, 'Page.addScriptToEvaluateOnNewDocument') >= 1 &&
            ctx.mockCdp.countMethod(targetId, 'Runtime.evaluate', (p) => String(p.expression).includes('__AGY_INJECT_BOOT__')) >= 1,
        6000,
        40,
        `Target ${targetId} chưa hoàn tất initialAttach`
    );
    await sleep(60);
}

/**
 * Tạo HTTP raw request tới 127.0.0.1:<port> cho phép gửi Host/path raw (không chuẩn hóa .. hay %2e%2e).
 */
function rawHttpRequest({ port, method = 'GET', path: reqPath = '/', headers = {} }) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                method,
                path: reqPath,
                agent: false,
                headers: {
                    Host: `127.0.0.1:${port}`,
                    Connection: 'close',
                    ...headers,
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                        text() {
                            return this.body.toString('utf8');
                        },
                        json() {
                            return JSON.parse(this.body.toString('utf8'));
                        },
                    });
                });
            }
        );
        req.on('error', reject);
        req.end();
    });
}

/**
 * Khởi tạo 1 sandbox cô lập hoàn toàn trong os.tmpdir() và chạy daemon/theme_daemon.js.
 */
async function startIsolatedDaemon({ initialTargetsFactory, withInitialTarget = true, initialConfig = null } = {}) {
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-daemon-'));
    const daemonDir = path.join(sandboxRoot, 'daemon');
    const distDir = path.join(sandboxRoot, 'dist');
    const assetsDir = path.join(sandboxRoot, 'themes', 'assets');
    const outsideDir = path.join(sandboxRoot, 'outside');
    const homeDir = path.join(sandboxRoot, 'home');
    const appDataDir = path.join(sandboxRoot, 'appdata');
    const localAppDataDir = path.join(sandboxRoot, 'localappdata');
    const xdgConfigDir = path.join(sandboxRoot, 'xdg_config');
    const xdgDataDir = path.join(sandboxRoot, 'xdg_data');
    const brainDir = path.join(sandboxRoot, 'brain');
    const portFile = path.join(sandboxRoot, 'DevToolsActivePort');
    const configPath = path.join(sandboxRoot, 'theme_config.json');
    const backupConfigPath = path.join(sandboxRoot, 'custom_theme_backup.json');

    for (const d of [daemonDir, distDir, assetsDir, outsideDir, homeDir, appDataDir, localAppDataDir, xdgConfigDir, xdgDataDir, brainDir]) {
        fs.mkdirSync(d, { recursive: true });
    }

    const daemonScript = path.join(daemonDir, 'theme_daemon.js');
    fs.copyFileSync(DAEMON_SRC_PATH, daemonScript);

    const payloadPath = path.join(distDir, 'theme_payload.js');
    fs.writeFileSync(
        payloadPath,
        '/* test payload */ globalThis.__AGY_TEST_TICK__ = (globalThis.__AGY_TEST_TICK__ || 0) + 1;\n',
        'utf8'
    );

    if (initialConfig) {
        fs.writeFileSync(configPath, JSON.stringify(initialConfig), 'utf8');
    }

    // Tạo sẵn 6 loại ảnh mẫu + 1 file forbidden + 1 file ngoài ASSETS_DIR
    fs.writeFileSync(path.join(assetsDir, 'sample.webp'), Buffer.from('RIFF\x00\x00\x00\x00WEBP'));
    fs.writeFileSync(path.join(assetsDir, 'sample.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    fs.writeFileSync(path.join(assetsDir, 'sample.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    fs.writeFileSync(path.join(assetsDir, 'sample.jpeg'), Buffer.from([0xff, 0xd8, 0xff, 0xe1]));
    fs.writeFileSync(path.join(assetsDir, 'sample.gif'), Buffer.from('GIF89a'));
    fs.writeFileSync(path.join(assetsDir, 'sample.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>', 'utf8');
    fs.writeFileSync(path.join(assetsDir, 'evil.js'), 'alert(1);', 'utf8');
    fs.writeFileSync(path.join(assetsDir, 'data.json'), '{"secret":1}', 'utf8');
    fs.writeFileSync(path.join(assetsDir, 'noext'), 'raw', 'utf8');
    fs.writeFileSync(path.join(outsideDir, 'secret.png'), Buffer.from('OUTSIDE_SECRET_PNG'));

    const mockCdp = createMockCdpServer();
    const cdpPort = await mockCdp.start();

    if (typeof initialTargetsFactory === 'function') {
        mockCdp.setTargets(initialTargetsFactory(cdpPort));
    } else if (withInitialTarget) {
        mockCdp.setTargets([
            {
                id: 'target-main',
                type: 'page',
                title: 'Antigravity',
                url: `http://127.0.0.1:${cdpPort}/workbench`,
            },
        ]);
    }
    fs.writeFileSync(portFile, `${cdpPort}\r\ncdp-secret-token\r\n`, 'utf8');

    const env = {
        ...process.env,
        USERPROFILE: homeDir,
        HOME: homeDir,
        APPDATA: appDataDir,
        LOCALAPPDATA: localAppDataDir,
        XDG_CONFIG_HOME: xdgConfigDir,
        XDG_DATA_HOME: xdgDataDir,
        AGY_CONFIG_PATH: configPath,
        AGY_BACKUP_CONFIG_PATH: backupConfigPath,
        AGY_BRAIN_DIR: brainDir,
        AGY_DEVTOOLS_PORT_FILE: portFile,
        AGY_PORT_FILE: portFile,
        AGY_DAEMON_STDOUT: '1',
    };

    const child = spawn(process.execPath, [daemonScript], {
        cwd: sandboxRoot,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.on('data', (c) => {
        stdoutBuf += c.toString('utf8');
    });
    child.stderr.on('data', (c) => {
        stderrBuf += c.toString('utf8');
    });

    const ctx = {
        sandboxRoot,
        daemonDir,
        daemonScript,
        distDir,
        payloadPath,
        assetsDir,
        outsideDir,
        homeDir,
        brainDir,
        portFile,
        configPath,
        backupConfigPath,
        pidFile: path.join(sandboxRoot, 'daemon.pid'),
        logFile: path.join(sandboxRoot, 'daemon.log'),
        env,
        mockCdp,
        child,
        assetPort: 0,
        token: '',
        get stdout() {
            return stdoutBuf;
        },
        get stderr() {
            return stderrBuf;
        },
        writeTranscript(cid, contentOrLines) {
            const dir = path.join(brainDir, cid, '.system_generated', 'logs');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, 'transcript.jsonl');
            const text = Array.isArray(contentOrLines) ? contentOrLines.map((x) => JSON.stringify(x)).join('\n') + '\n' : contentOrLines;
            fs.writeFileSync(file, text, 'utf8');
            return file;
        },
        appendTranscript(cid, contentOrLines) {
            const file = path.join(brainDir, cid, '.system_generated', 'logs', 'transcript.jsonl');
            const text = Array.isArray(contentOrLines) ? contentOrLines.map((x) => JSON.stringify(x)).join('\n') + '\n' : contentOrLines;
            fs.appendFileSync(file, text, 'utf8');
            return file;
        },
        async cleanup() {
            if (child.exitCode === null && child.signalCode === null) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        try {
                            child.kill('SIGKILL');
                        } catch (_) {}
                        resolve();
                    }, 3000);
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
            await mockCdp.close();
            try {
                fs.rmSync(sandboxRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
            } catch (_) {}
        },
    };
    ACTIVE_SANDBOXES.push(ctx);

    ctx.assetPort = await waitFor(() => {
        const m = stdoutBuf.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
        return m ? parseInt(m[1], 10) : 0;
    }, 8000, 40, `Daemon không khởi động được HTTP server. stderr=${stderrBuf}`);

    if (withInitialTarget || (typeof initialTargetsFactory === 'function' && initialTargetsFactory(cdpPort).length > 0)) {
        ctx.token = await mockCdp.waitForToken(8000);
    }

    return ctx;
}

after(async () => {
    while (ACTIVE_SANDBOXES.length > 0) {
        const ctx = ACTIVE_SANDBOXES.pop();
        await ctx.cleanup();
    }
});

describe('F01 — Daemon HTTP Asset Server, Host Pinning & Ephemeral Token 256-bit', () => {
    describe('Tier 1 — Phủ Tính Năng F01', () => {
        it('F01-T1-01: Kết nối loopback 127.0.0.1 với Host Pinning hợp lệ trả 200 OK', async () => {
            const ctx = await startIsolatedDaemon();
            const res = await rawHttpRequest({ port: ctx.assetPort, path: '/assets/sample.png' });
            assert.equal(res.status, 200);
            assert.deepEqual(res.body, fs.readFileSync(path.join(ctx.assetsDir, 'sample.png')));
            await ctx.cleanup();
        });

        it('F01-T1-02: MIME whitelist đủ 6 đuôi ảnh & header bảo mật CORP / nosniff / sandbox CSP', async () => {
            const ctx = await startIsolatedDaemon();
            const expectedMimes = {
                'sample.webp': 'image/webp',
                'sample.png': 'image/png',
                'sample.jpg': 'image/jpeg',
                'sample.jpeg': 'image/jpeg',
                'sample.gif': 'image/gif',
                'sample.svg': 'image/svg+xml; charset=utf-8',
            };
            for (const [file, mime] of Object.entries(expectedMimes)) {
                const res = await rawHttpRequest({ port: ctx.assetPort, path: `/assets/${file}` });
                assert.equal(res.status, 200, `Thất bại với ${file}`);
                assert.equal(res.headers['content-type'], mime);
                assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
                assert.equal(res.headers['x-content-type-options'], 'nosniff');
                assert.equal(res.headers['access-control-allow-origin'], '*');
                assert.match(String(res.headers['content-security-policy'] || ''), /sandbox/);
            }
            await ctx.cleanup();
        });

        it('F01-T1-03: Hỗ trợ ETag và 304 Not Modified giữ nguyên CORP header', async () => {
            const ctx = await startIsolatedDaemon();
            const r1 = await rawHttpRequest({ port: ctx.assetPort, path: '/assets/sample.png' });
            assert.equal(r1.status, 200);
            const etag = r1.headers.etag;
            assert.ok(etag, 'Phản hồi /assets phải có ETag');

            const r2 = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/assets/sample.png',
                headers: { 'If-None-Match': etag },
            });
            assert.equal(r2.status, 304);
            assert.equal(r2.body.length, 0);
            assert.equal(r2.headers['cross-origin-resource-policy'], 'cross-origin');
            await ctx.cleanup();
        });

        it('F01-T1-04: HEAD và OPTIONS Preflight (kể cả Private Network Access)', async () => {
            const ctx = await startIsolatedDaemon();
            const headRes = await rawHttpRequest({ port: ctx.assetPort, method: 'HEAD', path: '/assets/sample.png' });
            assert.equal(headRes.status, 200);
            assert.equal(headRes.body.length, 0);
            assert.ok(Number(headRes.headers['content-length']) > 0);

            const optAsset = await rawHttpRequest({ port: ctx.assetPort, method: 'OPTIONS', path: '/assets/sample.png' });
            assert.equal(optAsset.status, 204);

            const optApi = await rawHttpRequest({
                port: ctx.assetPort,
                method: 'OPTIONS',
                path: '/__telemetry?cid=latest',
                headers: {
                    Origin: 'vscode-file://vscode-app',
                    'Access-Control-Request-Private-Network': 'true',
                },
            });
            assert.equal(optApi.status, 204);
            assert.equal(optApi.headers['access-control-allow-headers'], 'X-Agy-Token');
            assert.equal(optApi.headers['access-control-allow-private-network'], 'true');
            await ctx.cleanup();
        });

        it('F01-T1-05: Ephemeral Token 256-bit nằm kín trong lexical closure (0% lộ trên window) và gọi /__telemetry thành công', async () => {
            const ctx = await startIsolatedDaemon();
            await waitForInitialAttach(ctx, 'target-main');
            assert.match(ctx.token, /^[0-9a-f]{64}$/, 'Ephemeral Token phải đúng 64 ký tự hex (256-bit)');

            const win = { localStorage: { getItem: () => null, setItem: () => {} }, setTimeout, clearTimeout, setInterval, clearInterval };
            win.window = win;
            win.globalThis = win;
            const sandboxCtx = vm.createContext(win);
            vm.runInContext(ctx.mockCdp.lastInjectedBootExpr, sandboxCtx);

            assert.equal(win.__AGY_AUTH_TOKEN__, undefined);
            assert.equal(win.__AGY_INJECT_BOOT__, undefined);
            assert.equal(win.__AGY_BOOT__, undefined);
            assert.equal(win.__AGY_TEST_TICK__, 1);

            const res = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/__telemetry?cid=latest',
                headers: { 'X-Agy-Token': ctx.token },
            });
            assert.equal(res.status, 200);
            assert.equal(res.json().ok, false);
            await ctx.cleanup();
        });

        it('F01-T1-06: Origin hợp lệ sau khi CDP verified (loopback origin & Origin: null cho vscode-file)', async () => {
            const ctx = await startIsolatedDaemon({
                initialTargetsFactory: (cdpPort) => [
                    { id: 't-http', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${cdpPort}/workbench` },
                    { id: 't-vsf', type: 'page', title: 'Antigravity', url: 'vscode-file://vscode-app/workbench.html' },
                ],
            });
            await waitFor(() => ctx.mockCdp.countMethod('t-vsf', 'Runtime.addBinding') >= 1, 5000);

            const r1 = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/__telemetry?cid=latest',
                headers: {
                    Origin: `http://127.0.0.1:${ctx.mockCdp.port}`,
                    'X-Agy-Token': ctx.token,
                },
            });
            assert.equal(r1.status, 200);
            assert.equal(r1.headers['access-control-allow-origin'], `http://127.0.0.1:${ctx.mockCdp.port}`);

            const rNull = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/__telemetry?cid=latest',
                headers: {
                    Origin: 'null',
                    'X-Agy-Token': ctx.token,
                },
            });
            assert.equal(rNull.status, 200);
            await ctx.cleanup();
        });
    });

    describe('Tier 2 — Biên & Bảo Mật F01', () => {
        it('F01-T2-01: Chặn non-loopback IP (192.168.1.50, 10.0.0.1, ::ffff:192.168.1.50) qua Node VM tách auto-start', async () => {
            let rawSrc = fs.readFileSync(DAEMON_SRC_PATH, 'utf8').replace(/^#![^\r\n]*\r?\n/, '');
            const bootMarkerIdx = rawSrc.lastIndexOf('acquirePidLock();');
            assert.ok(bootMarkerIdx > 0, 'Không tìm thấy điểm khởi chạy acquirePidLock() cuối tệp theme_daemon.js');
            const libSrc = rawSrc.slice(0, bootMarkerIdx) + '\nmodule.exports = { startAssetServer, isLoopbackAddress };\n';

            let capturedHandler = null;
            const fakeHttp = {
                ...http,
                createServer(handler) {
                    capturedHandler = handler;
                    return {
                        on() {
                            return this;
                        },
                        listen(_port, _host, cb) {
                            setImmediate(cb);
                            return this;
                        },
                        address() {
                            return { port: 45678 };
                        },
                        close() {},
                    };
                },
            };
            const sandboxMod = { exports: {} };
            const customRequire = (id) => (id === 'http' || id === 'node:http' ? fakeHttp : require(id));
            const fn = vm.runInThisContext(`(function(require, module, exports, __filename, __dirname) {\n${libSrc}\n})`, {
                filename: DAEMON_SRC_PATH,
            });
            fn(customRequire, sandboxMod, sandboxMod.exports, DAEMON_SRC_PATH, path.dirname(DAEMON_SRC_PATH));
            const { startAssetServer, isLoopbackAddress } = sandboxMod.exports;

            assert.equal(isLoopbackAddress('127.0.0.1'), true);
            assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
            assert.equal(isLoopbackAddress('::1'), true);
            assert.equal(isLoopbackAddress('192.168.1.50'), false);
            assert.equal(isLoopbackAddress('10.0.0.1'), false);
            assert.equal(isLoopbackAddress('::ffff:192.168.1.50'), false);

            const port = await startAssetServer();
            assert.equal(port, 45678);
            for (const remoteAddress of ['192.168.1.50', '10.0.0.1', '::ffff:192.168.1.50', '']) {
                let status = 0;
                let body = '';
                capturedHandler(
                    { socket: { remoteAddress }, headers: { host: '127.0.0.1:45678' }, url: '/assets/sample.png', method: 'GET' },
                    {
                        writeHead(s) {
                            status = s;
                        },
                        end(b) {
                            body = String(b || '');
                        },
                    }
                );
                assert.equal(status, 403, `IP ${remoteAddress} phải bị chặn 403`);
                assert.equal(body, 'Forbidden');
            }
        });

        it('F01-T2-02: Host Pinning chặn localhost:<port>, evil.com:<port>, thiếu port và Host rỗng', async () => {
            const ctx = await startIsolatedDaemon();
            for (const badHost of [`localhost:${ctx.assetPort}`, `evil.com:${ctx.assetPort}`, '127.0.0.1']) {
                const res = await rawHttpRequest({
                    port: ctx.assetPort,
                    path: '/assets/sample.png',
                    headers: { Host: badHost },
                });
                assert.equal(res.status, 403, `Host "${badHost}" phải bị chặn 403`);
            }
            const emptyHostRes = await rawTcpHttpRequest(
                ctx.assetPort,
                'GET /assets/sample.png HTTP/1.1\r\nHost: \r\nConnection: close\r\n\r\n'
            );
            assert.equal(emptyHostRes.status, 403, 'Host rỗng phải bị chặn 403');
            const noHostRes = await rawTcpHttpRequest(
                ctx.assetPort,
                'GET /assets/sample.png HTTP/1.1\r\nConnection: close\r\n\r\n'
            );
            assert.equal([400, 403].includes(noHostRes.status), true, `Thiếu header Host phải bị chặn 400/403 (thực tế: ${noHostRes.status})`);
            await ctx.cleanup();
        });

        it('F01-T2-03: Token thiếu / rỗng / sai ký tự / UTF-8 multi-byte length 64 bị từ chối 403 không crash', async () => {
            const ctx = await startIsolatedDaemon();
            const wrongLastChar = ctx.token.slice(0, 63) + (ctx.token[63] === 'a' ? 'b' : 'a');
            const utf8Length64 = 'á'.repeat(64); // .length === 64 nhưng Buffer.byteLength === 128

            const badTokens = [undefined, '', 'short', wrongLastChar, utf8Length64];
            for (const tok of badTokens) {
                for (const endpoint of ['/__telemetry?cid=latest', '/__events?cid=latest']) {
                    const hdrs = tok === undefined ? {} : { 'X-Agy-Token': tok };
                    const res = await rawHttpRequest({ port: ctx.assetPort, path: endpoint, headers: hdrs });
                    assert.equal(res.status, 403, `${endpoint} với token không hợp lệ phải trả 403`);
                }
            }
            // Kiểm tra server vẫn sống bình thường sau token UTF-8
            const okRes = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/__telemetry?cid=latest',
                headers: { 'X-Agy-Token': ctx.token },
            });
            assert.equal(okRes.status, 200);
            await ctx.cleanup();
        });

        it('F01-T2-04: Chặn Origin độc hại & Origin: null khi chưa có session file:/vscode-file:', async () => {
            const ctx = await startIsolatedDaemon(); // Chỉ attach target http://127.0.0.1:...
            for (const badOrigin of ['https://evil.com', 'http://127.0.0.1:9999', 'null']) {
                const res = await rawHttpRequest({
                    port: ctx.assetPort,
                    path: '/__telemetry?cid=latest',
                    headers: { Origin: badOrigin, 'X-Agy-Token': ctx.token },
                });
                assert.equal(res.status, 403, `Origin "${badOrigin}" phải bị từ chối 403`);
                assert.equal(res.headers.vary, 'Origin');
            }
            await ctx.cleanup();
        });

        it('F01-T2-05: Chặn Path Traversal (.. và %2e%2e), Null-byte & Malformed URI', async () => {
            const ctx = await startIsolatedDaemon();
            for (const trav of ['/assets/../../outside/secret.png', '/assets/%2e%2e/%2e%2e/outside/secret.png']) {
                const res = await rawHttpRequest({ port: ctx.assetPort, path: trav });
                assert.equal(res.status, 403, `Traversal ${trav} phải trả 403`);
            }
            for (const badUri of ['/assets/sample.png%00.jpg', '/assets/%E0%A4%A']) {
                const res = await rawHttpRequest({ port: ctx.assetPort, path: badUri });
                assert.equal(res.status, 400, `URI lỗi ${badUri} phải trả 400`);
            }
            const rEmpty = await rawHttpRequest({ port: ctx.assetPort, path: '/assets/' });
            assert.equal(rEmpty.status, 404);
            const rMissing = await rawHttpRequest({ port: ctx.assetPort, path: '/assets/missing.png' });
            assert.equal(rMissing.status, 404);
            await ctx.cleanup();
        });

        it('F01-T2-06: Chặn NTFS Directory Junction / Symlink Escape ra ngoài ASSETS_DIR', async () => {
            const ctx = await startIsolatedDaemon();
            const linkPath = path.join(ctx.assetsDir, 'escape-link');
            fs.symlinkSync(ctx.outsideDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

            const res = await rawHttpRequest({ port: ctx.assetPort, path: '/assets/escape-link/secret.png' });
            assert.equal(res.status, 403, 'Symlink/Junction trỏ ra ngoài ASSETS_DIR phải bị fs.realpath chặn trả 403');
            await ctx.cleanup();
        });

        it('F01-T2-07: Chặn route nhạy cảm, đuôi không hợp lệ & HTTP method cấm', async () => {
            const ctx = await startIsolatedDaemon();
            for (const route of ['/daemon.pid', '/theme_config.json', '/assets/evil.js', '/assets/data.json', '/assets/noext']) {
                const res = await rawHttpRequest({ port: ctx.assetPort, path: route });
                assert.equal(res.status, 403, `Route ${route} phải bị chặn 403`);
            }
            const postAsset = await rawHttpRequest({ port: ctx.assetPort, method: 'POST', path: '/assets/sample.png' });
            assert.equal(postAsset.status, 405);
            const postApi = await rawHttpRequest({
                port: ctx.assetPort,
                method: 'POST',
                path: '/__telemetry?cid=latest',
                headers: { 'X-Agy-Token': ctx.token },
            });
            assert.equal(postApi.status, 405);
            await ctx.cleanup();
        });
    });
});

describe('F02 — Incremental Tailer O(Δbytes), OversizeScanner, SSE, Crisis/Slash & Swarm', () => {
    describe('Tier 1 — Phủ Tính Năng F02', () => {
        it('F02-T1-01: Tailer đọc tăng dần & tổng hợp token chuẩn (input_tokens, cache_read_tokens, output_tokens, CHECKPOINT)', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '11111111-1111-1111-1111-111111111111';
            ctx.writeTranscript(cid, [
                { step_index: 1, type: 'USER_INPUT', status: 'DONE' },
                {
                    step_index: 2,
                    type: 'PLANNER_RESPONSE',
                    status: 'DONE',
                    input_tokens: 1200,
                    cache_read_tokens: 800,
                    output_tokens: 150,
                    model: 'gemini-2.5-pro',
                },
                { step_index: 3, type: 'CHECKPOINT', status: 'DONE', input_tokens: 1200, cache_read_tokens: 800 },
            ]);

            const r1 = await rawHttpRequest({
                port: ctx.assetPort,
                path: `/__telemetry?cid=${cid}`,
                headers: { 'X-Agy-Token': ctx.token },
            });
            const s1 = r1.json();
            assert.equal(s1.ok, true);
            assert.equal(s1.contextTokens, 2000);
            assert.equal(s1.cacheReadTokens, 800);
            assert.equal(s1.outputTokens, 150);
            assert.equal(s1.turnCount, 1);
            assert.equal(s1.modelName, 'gemini-2.5-pro');
            assert.equal(s1.isWorking, false);

            ctx.appendTranscript(cid, [
                { step_index: 4, type: 'USER_INPUT', status: 'DONE' },
                { step_index: 5, type: 'PLANNER_RESPONSE', status: 'DONE', output_tokens: 90 },
            ]);
            const r2 = await rawHttpRequest({
                port: ctx.assetPort,
                path: `/__telemetry?cid=${cid}`,
                headers: { 'X-Agy-Token': ctx.token },
            });
            const s2 = r2.json();
            assert.equal(s2.outputTokens, 240);
            assert.equal(s2.turnOutputTokens, 90);
            assert.equal(s2.turnCount, 2);
            await ctx.cleanup();
        });

        it('F02-T1-02: cid=latest và cid=active chọn hội thoại có mtime mới nhất và cập nhật qua TTL cache', async () => {
            const ctx = await startIsolatedDaemon();
            const cidA = 'aaaaaaaa-1111-1111-1111-111111111111';
            const cidB = 'bbbbbbbb-2222-2222-2222-222222222222';
            const fA = ctx.writeTranscript(cidA, [{ step_index: 1, type: 'USER_INPUT', status: 'DONE' }]);
            const oldTime = new Date(Date.now() - 60000);
            fs.utimesSync(fA, oldTime, oldTime);
            ctx.writeTranscript(cidB, [{ step_index: 1, type: 'USER_INPUT', status: 'DONE' }]);

            const rLatest = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/__telemetry?cid=latest',
                headers: { 'X-Agy-Token': ctx.token },
            });
            assert.equal(rLatest.json().cid, cidB);

            const rActive = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/__telemetry?cid=active',
                headers: { 'X-Agy-Token': ctx.token },
            });
            assert.equal(rActive.json().cid, cidB);

            ctx.appendTranscript(cidA, [{ step_index: 2, type: 'PLANNER_RESPONSE', status: 'DONE', output_tokens: 10 }]);
            await sleep(1650); // qua LATEST_CID_CACHE_TTL_MS = 1500ms

            const rSwitched = await rawHttpRequest({
                port: ctx.assetPort,
                path: '/__telemetry?cid=latest',
                headers: { 'X-Agy-Token': ctx.token },
            });
            assert.equal(rSwitched.json().cid, cidA);
            await ctx.cleanup();
        });

        it('F02-T1-03: Chuỗi run_command lỗi -> crisisState -> exit 0 (bug_slashed) -> git push (git_pushed)', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '22222222-2222-2222-2222-222222222222';
            ctx.writeTranscript(cid, [{ step_index: 1, type: 'USER_INPUT', status: 'DONE' }]);
            await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } });

            // 1. Lệnh test lỗi (exit 1)
            ctx.appendTranscript(cid, [
                { step_index: 2, type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ id: 'c1', name: 'run_command', args: { CommandLine: 'npm test' } }] },
                { step_index: 3, type: 'GENERIC', status: 'DONE', tool_call_id: 'c1', content: 'Command exited with code 1\nCommand output:\nFail' },
            ]);
            const sCrisis = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sCrisis.crisisState, true);
            assert.equal(sCrisis.justSlashedBug, false);

            // 2. Sửa xong (exit 0) -> bug_slashed
            ctx.appendTranscript(cid, [
                { step_index: 4, type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ id: 'c2', name: 'run_command', args: { CommandLine: 'npm test' } }] },
                { step_index: 5, type: 'GENERIC', status: 'DONE', tool_call_id: 'c2', content: 'Command exited with code 0\nCommand output:\nOK' },
            ]);
            const sSlash = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sSlash.crisisState, false);
            assert.equal(sSlash.justSlashedBug, true);
            assert.equal(sSlash.slashReason, 'bug_slashed');
            assert.equal(sSlash.slashSeq, 1);

            // 3. git -C repo push -> git_pushed
            ctx.appendTranscript(cid, [
                { step_index: 6, type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ id: 'c3', name: 'run_command', args: { CommandLine: 'git -C repo push origin main' } }] },
                { step_index: 7, type: 'GENERIC', status: 'DONE', tool_call_id: 'c3', content: 'Command exited with code 0\nCommand output:\nEverything up-to-date' },
            ]);
            const sPush = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sPush.justSlashedBug, true);
            assert.equal(sPush.slashReason, 'git_pushed');
            assert.equal(sPush.slashSeq, 2);
            await ctx.cleanup();
        });

        it('F02-T1-04: ERROR_MESSAGE bật crisisState = true, isWorking = false và tăng turnFinishedSeq', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '33333333-3333-3333-3333-333333333333';
            ctx.writeTranscript(cid, [{ step_index: 1, type: 'USER_INPUT', status: 'DONE' }]);
            const s1 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(s1.isWorking, true);

            ctx.appendTranscript(cid, [{ step_index: 2, type: 'ERROR_MESSAGE', status: 'ERROR', content: 'Model timeout' }]);
            const s2 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(s2.crisisState, true);
            assert.equal(s2.justSlashedBug, false);
            assert.equal(s2.isWorking, false);
            assert.ok(s2.turnFinishedSeq >= 1);
            await ctx.cleanup();
        });

        it('F02-T1-05: Theo dõi Subagent Swarm đầy đủ (invoke_subagent -> child transcript -> SYSTEM_MESSAGE sender=)', async () => {
            const ctx = await startIsolatedDaemon();
            const parentCid = '44444444-4444-4444-4444-444444444444';
            const childCid = '55555555-5555-5555-5555-555555555555';
            ctx.writeTranscript(parentCid, [
                { step_index: 1, type: 'USER_INPUT', status: 'DONE' },
                {
                    step_index: 2,
                    type: 'PLANNER_RESPONSE',
                    status: 'DONE',
                    tool_calls: [{ name: 'invoke_subagent', args: { Role: 'Explorer 2', TypeName: 'research' } }],
                },
                {
                    step_index: 3,
                    type: 'GENERIC',
                    status: 'DONE',
                    content: `Created the following subagent:\n{"conversationId":"${childCid}"}`,
                },
            ]);
            ctx.writeTranscript(childCid, [
                {
                    step_index: 1,
                    type: 'PLANNER_RESPONSE',
                    status: 'RUNNING',
                    tool_calls: [{ name: 'read_file', args: { toolSummary: 'Đọc daemon' } }],
                },
            ]);

            const sRunning = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${parentCid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sRunning.activeSubagents.length, 1);
            assert.equal(sRunning.activeSubagents[0].cid, childCid);
            assert.equal(sRunning.activeSubagents[0].role, 'Explorer 2');
            assert.equal(sRunning.activeSubagents[0].stepCount, 1);
            assert.equal(sRunning.activeSubagents[0].lastTool, 'Đọc daemon');

            ctx.appendTranscript(parentCid, [{ step_index: 4, type: 'SYSTEM_MESSAGE', status: 'DONE', content: `[Message] sender=${childCid}` }]);
            const sDone = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${parentCid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sDone.activeSubagents.length, 0);
            assert.equal(sDone.recentCompletedSubagents.length, 1);
            assert.equal(sDone.recentCompletedSubagents[0].cid, childCid);
            assert.equal(sDone.recentCompletedSubagents[0].status, 'completed');
            await ctx.cleanup();
        });

        it('F02-T1-06: SSE /__events đẩy snapshot ban đầu, cập nhật live delta và không lặp payload trùng', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '66666666-6666-6666-6666-666666666666';
            ctx.writeTranscript(cid, [{ step_index: 1, type: 'USER_INPUT', status: 'DONE' }]);

            const received = [];
            let sseResHeaders = null;
            await new Promise((resolve, reject) => {
                const req = http.request(
                    {
                        hostname: '127.0.0.1',
                        port: ctx.assetPort,
                        path: `/__events?cid=${cid}`,
                        headers: {
                            Host: `127.0.0.1:${ctx.assetPort}`,
                            Origin: 'vscode-file://vscode-app',
                            'X-Agy-Token': ctx.token,
                        },
                    },
                    (res) => {
                        sseResHeaders = res.headers;
                        assert.equal(res.statusCode, 200);
                        let buf = '';
                        res.on('data', (c) => {
                            buf += c.toString('utf8');
                            const parts = buf.split('\n\n');
                            buf = parts.pop();
                            for (const frame of parts) {
                                if (frame.startsWith('data: ')) {
                                    received.push(JSON.parse(frame.slice(6)));
                                }
                            }
                            if (received.length === 1) {
                                ctx.appendTranscript(cid, [{ step_index: 2, type: 'PLANNER_RESPONSE', status: 'DONE', output_tokens: 77 }]);
                            } else if (received.length >= 2) {
                                req.destroy();
                                resolve();
                            }
                        });
                    }
                );
                req.on('error', (e) => {
                    if (received.length >= 2) resolve();
                    else reject(e);
                });
                req.end();
            });

            assert.equal(sseResHeaders['content-type'], 'text/event-stream; charset=utf-8');
            assert.equal(sseResHeaders['cache-control'], 'no-cache, no-transform');
            assert.equal(received[0].outputTokens, 0);
            assert.equal(received[1].outputTokens, 77);
            await ctx.cleanup();
        });
    });

    describe('Tier 2 — Biên, Góc Khuất & 3 Bug Trọng Yếu F02', () => {
        it('F02-T2-01: Cắt giữa ký tự UTF-8 3-byte tại biên chunk 64KB & partial line chưa có newline', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '77777777-7777-7777-7777-777777777777';
            // Tạo dòng dài > 66KB sao cho chuỗi tiếng Việt 'Đạo' (3 byte mỗi ký tự) vắt đúng qua byte 65536
            const prefixObj = '{"step_index":1,"type":"PLANNER_RESPONSE","status":"DONE","output_tokens":33,"content":"';
            const padLen = 65534 - Buffer.byteLength(prefixObj, 'utf8');
            const bigLine = prefixObj + 'a'.repeat(padLen) + 'Đạo赫Kiếm'.repeat(100) + '"}\n';
            const file = ctx.writeTranscript(cid, bigLine);

            const s1 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(s1.stepCount, 1);
            assert.equal(s1.outputTokens, 33);

            // Ghi partial line chưa có \n
            const partialLine = JSON.stringify({ step_index: 2, type: 'PLANNER_RESPONSE', status: 'DONE', output_tokens: 17 });
            fs.appendFileSync(file, partialLine.slice(0, 20), 'utf8');
            const sPartial = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sPartial.stepCount, 1, 'Partial line chưa có newline không được parse sớm');

            fs.appendFileSync(file, partialLine.slice(20) + '\n', 'utf8');
            const sDone = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sDone.stepCount, 2);
            assert.equal(sDone.outputTokens, 50);
            await ctx.cleanup();
        });

        it('F02-T2-02: Truncation / Rotation (st.size < byteOffset) tự reset tracker về 0', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '88888888-8888-8888-8888-888888888888';
            const padding = 'x'.repeat(4096);
            ctx.writeTranscript(cid, [
                { step_index: 1, type: 'USER_INPUT', status: 'DONE', content: padding },
                { step_index: 2, type: 'PLANNER_RESPONSE', status: 'DONE', output_tokens: 500 },
                { step_index: 3, type: 'ERROR_MESSAGE', status: 'ERROR' },
            ]);
            const s1 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(s1.outputTokens, 500);
            assert.equal(s1.crisisState, true);

            // Ghi đè file mới nhỏ hơn hẳn
            ctx.writeTranscript(cid, [{ step_index: 1, type: 'USER_INPUT', status: 'DONE' }]);
            const s2 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(s2.turnCount, 1);
            assert.equal(s2.outputTokens, 0);
            assert.equal(s2.crisisState, false);
            assert.ok(s2.fileBytes < 500);
            await ctx.cleanup();
        });

        it('F02-T2-03: Flush batch >= 2 dòng JSONL cùng lúc không làm mất cờ justSlashedBug (bug_slashed & git_pushed)', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '99999999-9999-9999-9999-999999999999';
            ctx.writeTranscript(cid, [
                { step_index: 1, type: 'USER_INPUT', status: 'DONE' },
                { step_index: 2, type: 'ERROR_MESSAGE', status: 'ERROR' },
            ]);
            const sInit = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sInit.crisisState, true);

            // Ghi ĐỒNG THỜI 2 dòng trong 1 batch duy nhất: GENERIC (exit 0) + PLANNER_RESPONSE (DONE)
            ctx.appendTranscript(cid, [
                { step_index: 3, type: 'GENERIC', status: 'DONE', content: 'Command exited with code 0\nCommand output:\nPass' },
                { step_index: 4, type: 'PLANNER_RESPONSE', status: 'DONE', output_tokens: 55 },
            ]);
            const sBatch1 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sBatch1.slashSeq, 1);
            assert.equal(sBatch1.slashReason, 'bug_slashed');
            assert.equal(sBatch1.justSlashedBug, true, 'PLANNER_RESPONSE nối sau trong cùng batch không được xóa cờ justSlashedBug');

            // Batch 2: run_command(git push) + GENERIC(exit 0) + PLANNER_RESPONSE(DONE)
            ctx.appendTranscript(cid, [
                { step_index: 5, type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ id: 'gp1', name: 'run_command', args: { CommandLine: 'git push origin main' } }] },
                { step_index: 6, type: 'GENERIC', status: 'DONE', tool_call_id: 'gp1', content: 'Command exited with code 0\nCommand output:\nOK' },
                { step_index: 7, type: 'PLANNER_RESPONSE', status: 'DONE', output_tokens: 12 },
            ]);
            const sBatch2 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sBatch2.slashSeq, 2);
            assert.equal(sBatch2.slashReason, 'git_pushed');
            assert.equal(sBatch2.justSlashedBug, true);
            await ctx.cleanup();
        });

        it('F02-T2-04: OversizeScanner (> 2MB) chống nhiễu chuỗi trong content, bắt escaped conversationId và modelName', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = 'abababab-1111-1111-1111-111111111111';
            const childCid = 'cdcdcdcd-2222-2222-2222-222222222222';
            const pad = 'x'.repeat(2 * 1024 * 1024 + 50000);
            const noisyContent = `${pad} "type":"FAKE_NOISE","status":"ERROR","model":"fake-noise-model","output_tokens":999999,"git push origin main","Command exited with code 1"`;
            const bigPlannerStep = {
                step_index: 1,
                content: noisyContent,
                type: 'PLANNER_RESPONSE',
                status: 'DONE',
                input_tokens: 1500,
                cache_read_tokens: 500,
                output_tokens: 88,
                model: 'gemini-2.5-pro',
            };
            const bigSubagentStep = {
                step_index: 2,
                type: 'GENERIC',
                status: 'DONE',
                content: `Created the following subagent:\n{"conversationId":"${childCid}"}\n${'y'.repeat(2 * 1024 * 1024 + 10000)}`,
            };
            ctx.writeTranscript(cid, [bigPlannerStep, bigSubagentStep]);

            const snap = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(snap.inputTokens, 1500);
            assert.equal(snap.cacheReadTokens, 500);
            assert.equal(snap.outputTokens, 88, 'Không được lấy nhầm output_tokens=999999 từ content nhiễu');
            assert.equal(snap.crisisState, false, 'Không được dính nhiễu git push / Command exited with code 1 trong content');
            assert.equal(snap.activeSubagents.some((s) => s.cid === childCid), true, 'OversizeScanner phải trích được escaped \\"conversationId\\"');
            assert.equal(snap.modelName, 'gemini-2.5-pro', 'OversizeScanner phải trích xuất được modelName');

            // Kiểm tra biên: "model" đứng trước "content" và chứa Unicode escape \uXXXX
            const rawModelFirstLine = `{"step_index":3,"model":"\\u0067emini-2.5-flash","type":"PLANNER_RESPONSE","status":"DONE","content":${JSON.stringify(noisyContent)}}`;
            ctx.appendTranscript(cid, `${rawModelFirstLine}\n`);
            const snap2 = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(snap2.modelName, 'gemini-2.5-flash', 'OversizeScanner phải giải mã \\uXXXX cho model đứng trước content');
            await ctx.cleanup();
        });

        it('F02-T2-05: Hồi sinh Subagent sau > 12s TTL bằng send_message và auto-complete khi child idle > 2.5s (không cần sleep)', async () => {
            const ctx = await startIsolatedDaemon();
            const parentCid = 'dededede-1111-1111-1111-111111111111';
            const childCid = 'efefefef-2222-2222-2222-222222222222';
            const pastIso = new Date(Date.now() - 25000).toISOString();

            ctx.writeTranscript(parentCid, [
                { step_index: 1, type: 'USER_INPUT', status: 'DONE', created_at: pastIso },
                {
                    step_index: 2,
                    type: 'PLANNER_RESPONSE',
                    status: 'DONE',
                    created_at: pastIso,
                    tool_calls: [{ name: 'invoke_subagent', args: { Role: 'Chuyên gia Bảo mật', TypeName: 'research' } }],
                },
                {
                    step_index: 3,
                    type: 'GENERIC',
                    status: 'DONE',
                    created_at: pastIso,
                    content: `Created the following subagent:\n{"conversationId":"${childCid}"}`,
                },
                {
                    step_index: 4,
                    type: 'SYSTEM_MESSAGE',
                    status: 'DONE',
                    created_at: pastIso,
                    content: `[Message] sender=${childCid}`,
                },
            ]);
            const childFile = ctx.writeTranscript(childCid, [{ step_index: 1, type: 'PLANNER_RESPONSE', status: 'DONE' }]);
            const oldChildTime = new Date(Date.now() - 25000);
            fs.utimesSync(childFile, oldChildTime, oldChildTime);

            const sBefore = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${parentCid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sBefore.activeSubagents.length, 0);
            assert.equal(sBefore.recentCompletedSubagents.length, 0, 'Đã quá TTL 12s nên recentCompletedSubagents phải rỗng');

            // Gửi send_message hồi sinh sau khi đã hết TTL 12s
            ctx.appendTranscript(parentCid, [
                {
                    step_index: 5,
                    type: 'PLANNER_RESPONSE',
                    status: 'RUNNING',
                    tool_calls: [{ name: 'send_message', args: { Recipient: childCid, Message: 'Tiếp tục' } }],
                },
            ]);
            const sRevived = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${parentCid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sRevived.activeSubagents.length, 1, 'Subagent phải hồi sinh vào activeSubagents sau > 12s TTL');
            assert.equal(sRevived.activeSubagents[0].cid, childCid);
            assert.equal(sRevived.activeSubagents[0].role, 'Chuyên gia Bảo mật');
            assert.equal(sRevived.activeSubagents[0].typeName, 'research');

            // Test auto-complete khi child idle > 2.5s (dùng utimesSync thay vì sleep)
            const autoParent = '12121212-1111-1111-1111-111111111111';
            const autoChild = '34343434-2222-2222-2222-222222222222';
            ctx.writeTranscript(autoParent, [
                { step_index: 1, type: 'USER_INPUT', status: 'DONE' },
                { step_index: 2, type: 'GENERIC', status: 'DONE', content: `Created the following subagent:\n{"conversationId":"${autoChild}"}` },
            ]);
            const autoChildFile = ctx.writeTranscript(autoChild, [{ step_index: 1, type: 'PLANNER_RESPONSE', status: 'DONE' }]);
            const idleTime = new Date(Date.now() - 5000);
            fs.utimesSync(autoChildFile, idleTime, idleTime);
            const sAuto = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${autoParent}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sAuto.activeSubagents.length, 0);
            assert.equal(sAuto.recentCompletedSubagents.length, 1);
            await ctx.cleanup();
        });

        it('F02-T2-06: read_file chứa "Command exited with code 1" không gây false-positive & pendingCommandQueue khớp đúng tool_call_id', async () => {
            const ctx = await startIsolatedDaemon();
            const cid = '56565656-5656-5656-5656-565656565656';
            ctx.writeTranscript(cid, [{ step_index: 1, type: 'USER_INPUT', status: 'DONE' }]);
            await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } });

            ctx.appendTranscript(cid, [
                {
                    step_index: 2,
                    type: 'GENERIC',
                    status: 'DONE',
                    content: 'Created At: 2026-11-22\nShowing lines 1-10 of 10\nCommand exited with code 1\n',
                },
            ]);
            const sRead = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sRead.crisisState, false);

            ctx.appendTranscript(cid, [
                {
                    step_index: 3,
                    type: 'PLANNER_RESPONSE',
                    status: 'DONE',
                    tool_calls: [
                        { id: 'call_push', name: 'run_command', args: { CommandLine: 'git push origin main' } },
                        { id: 'call_ls', name: 'run_command', args: { CommandLine: 'ls -la' } },
                    ],
                },
                {
                    step_index: 4,
                    type: 'GENERIC',
                    status: 'DONE',
                    tool_call_id: 'call_ls',
                    content: 'Command exited with code 0\nCommand output:\nfile.txt',
                },
            ]);
            const sLs = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sLs.slashSeq, 0, 'Lệnh call_ls xong trước không được kích hoạt nhầm git_pushed của call_push');

            ctx.appendTranscript(cid, [
                {
                    step_index: 5,
                    type: 'GENERIC',
                    status: 'DONE',
                    tool_call_id: 'call_push',
                    content: 'Command exited with code 0\nCommand output:\nPushed',
                },
            ]);
            const sPush = (await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${cid}`, headers: { 'X-Agy-Token': ctx.token } })).json();
            assert.equal(sPush.slashSeq, 1);
            assert.equal(sPush.slashReason, 'git_pushed');
            await ctx.cleanup();
        });

        it('F02-T2-07: Giới hạn MAX_SSE_CLIENTS = 32, invalid_cid (400 vs 200) và chặn symlink cid thoát khỏi AGY_BRAIN_DIR', async () => {
            const ctx = await startIsolatedDaemon();

            // 1. invalid_cid
            const evBad = await rawHttpRequest({ port: ctx.assetPort, path: '/__events?cid=not-a-uuid', headers: { 'X-Agy-Token': ctx.token } });
            assert.equal(evBad.status, 400);
            assert.equal(evBad.json().reason, 'invalid_cid');

            const telBad = await rawHttpRequest({ port: ctx.assetPort, path: '/__telemetry?cid=../etc', headers: { 'X-Agy-Token': ctx.token } });
            assert.equal(telBad.status, 200);
            assert.equal(telBad.json().ok, false);
            assert.equal(telBad.json().reason, 'invalid_cid');

            // 2. Symlink cid thoát ngoài AGY_BRAIN_DIR
            const escapeCid = '78787878-7878-7878-7878-787878787878';
            const outsideCidDir = path.join(ctx.outsideDir, 'fake_brain');
            fs.mkdirSync(path.join(outsideCidDir, '.system_generated', 'logs'), { recursive: true });
            fs.writeFileSync(path.join(outsideCidDir, '.system_generated', 'logs', 'transcript.jsonl'), '{"step_index":1,"type":"USER_INPUT"}\n');
            fs.symlinkSync(outsideCidDir, path.join(ctx.brainDir, escapeCid), process.platform === 'win32' ? 'junction' : 'dir');
            const symTel = await rawHttpRequest({ port: ctx.assetPort, path: `/__telemetry?cid=${escapeCid}`, headers: { 'X-Agy-Token': ctx.token } });
            assert.equal(symTel.json().ok, false);
            assert.equal(symTel.json().reason, 'not_found');

            // 3. MAX_SSE_CLIENTS = 32 -> client #33 đẩy client #1 đóng
            const conns = [];
            let firstClosed = false;
            const openSse = () =>
                new Promise((resolve) => {
                    const req = http.request(
                        {
                            hostname: '127.0.0.1',
                            port: ctx.assetPort,
                            path: '/__events?cid=latest',
                            headers: { Host: `127.0.0.1:${ctx.assetPort}`, 'X-Agy-Token': ctx.token },
                        },
                        (res) => {
                            res.resume();
                            conns.push({ req, res });
                            resolve(res);
                        }
                    );
                    req.on('error', () => {});
                    req.end();
                });

            const r1 = await openSse();
            r1.on('end', () => {
                firstClosed = true;
            });
            r1.on('close', () => {
                firstClosed = true;
            });
            for (let i = 1; i < 33; i++) {
                await openSse();
            }
            await waitFor(() => firstClosed, 4000, 30, 'Kết nối SSE thứ 33 phải đóng kết nối cũ nhất (#1)');
            for (const c of conns) {
                try {
                    c.req.destroy();
                } catch (_) {}
            }
            await ctx.cleanup();
        });
    });
});

describe('F03 — CDP Lifecycle, Lọc Target, Anti-Double-Inject, Debounce & PII Log Redaction', () => {
    describe('Tier 1 — Phủ Tính Năng F03', () => {
        it('F03-T1-01: DevToolsActivePort parsing & CDP attach thực hiện đủ chuỗi lệnh chuẩn', async () => {
            const ctx = await startIsolatedDaemon();
            await waitFor(() => ctx.mockCdp.countMethod('target-main', 'Runtime.evaluate', (p) => !String(p.expression).includes('payloadReady')) >= 1, 5000);

            assert.ok(ctx.mockCdp.countMethod('target-main', 'Page.enable') >= 1);
            assert.ok(ctx.mockCdp.countMethod('target-main', 'Runtime.enable') >= 1);
            assert.ok(ctx.mockCdp.countMethod('target-main', 'Runtime.addBinding', (p) => p.name === 'agySaveThemeConfig') >= 1);
            assert.ok(ctx.mockCdp.countMethod('target-main', 'Page.addScriptToEvaluateOnNewDocument') >= 1);
            await ctx.cleanup();
        });

        it('F03-T1-02: Lọc candidate URL trong scanPages (chỉ giữ target Antigravity hợp lệ)', async () => {
            const ctx = await startIsolatedDaemon({
                initialTargetsFactory: (port) => [
                    { id: 'ok-wb', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${port}/workbench` },
                    { id: 'ok-chat', type: 'page', title: 'Antigravity', url: `http://localhost:${port}/c/11111111-1111-1111-1111-111111111111` },
                    { id: 'bad-ext', type: 'page', url: 'chrome-extension://abc/popup.html' },
                    { id: 'bad-dev', type: 'page', url: 'devtools://devtools/bundled/inspector.html' },
                    { id: 'bad-web', type: 'page', url: 'https://google.com/' },
                    { id: 'bad-prev', type: 'page', url: `http://127.0.0.1:${port}/preview.html` },
                    { id: 'bad-wv', type: 'webview', url: `http://127.0.0.1:${port}/workbench` },
                ],
            });
            await waitFor(() => ctx.mockCdp.countMethod('ok-chat', 'Runtime.addBinding') >= 1, 6000);
            for (const badId of ['bad-ext', 'bad-dev', 'bad-web', 'bad-prev', 'bad-wv']) {
                assert.equal(ctx.mockCdp.countMethod(badId, 'Runtime.evaluate'), 0, `Target không hợp lệ ${badId} không được phép kết nối`);
            }
            await ctx.cleanup();
        });

        it('F03-T1-03: verifyDomIsAntigravity từ chối trang localhost giả mạo và đưa vào ignoredTargetFingerprints', async () => {
            const ctx = await startIsolatedDaemon({
                initialTargetsFactory: (port) => [
                    { id: 'good-1', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${port}/workbench` },
                    { id: 'spoof-1', type: 'page', title: 'Not Antigravity', url: `http://127.0.0.1:${port}/`, _fakeNonAntigravity: true },
                ],
            });
            await waitFor(() => ctx.mockCdp.events.some((e) => e.targetId === 'spoof-1'), 5000);
            await sleep(1700); // Chờ qua 1 chu kỳ scanPages (1500ms) để chắc chắn không spam kết nối lại

            assert.equal(ctx.mockCdp.countMethod('spoof-1', 'Runtime.addBinding'), 0);
            assert.equal(ctx.mockCdp.countMethod('spoof-1', 'Page.addScriptToEvaluateOnNewDocument'), 0);
            assert.equal(ctx.mockCdp.countMethod('spoof-1', 'Runtime.evaluate'), 1, 'Target giả mạo chỉ được probe đúng 1 lần rồi nhớ vào ignore list');
            await ctx.cleanup();
        });

        it('F03-T1-04: Chống double-inject Page.frameNavigated (bỏ qua iframe con, tránh Runtime.evaluate khi payloadReady=true)', async () => {
            const ctx = await startIsolatedDaemon();
            await waitForInitialAttach(ctx, 'target-main');
            ctx.mockCdp.clearEvents();

            // 1. iframe con (có parentId) -> bỏ qua hoàn toàn
            ctx.mockCdp.sendEvent('target-main', 'Page.frameNavigated', {
                frame: { id: 'sub-1', parentId: 'root', url: 'https://example.com/embed' },
            });
            await sleep(250);
            assert.equal(ctx.mockCdp.countMethod('target-main', 'Runtime.evaluate'), 0, 'iframe con không được phép trigger probe/inject');

            // 2. Main frame điều hướng và document mới đã có payloadReady=true từ AddScriptOnNewDocument
            ctx.mockCdp.setProbeOverride(() => ({
                matched: true,
                hasBody: true,
                payloadReady: true,
                readyState: 'complete',
                origin: `http://127.0.0.1:${ctx.mockCdp.port}`,
            }));
            ctx.mockCdp.sendEvent('target-main', 'Page.frameNavigated', {
                frame: { id: 'root', url: `http://127.0.0.1:${ctx.mockCdp.port}/c/11111111-1111-1111-1111-111111111111` },
            });
            await sleep(300);

            const injectEvalsWhenReady = ctx.mockCdp.countMethod(
                'target-main',
                'Runtime.evaluate',
                (p) => String(p.expression).includes('__AGY_INJECT_BOOT__')
            );
            assert.equal(injectEvalsWhenReady, 0, 'Khi payloadReady=true và đã có evalScriptId, không được double-inject qua Runtime.evaluate');

            // 3. Main frame điều hướng khi payloadReady=false -> phải inject lại 1 lần
            ctx.mockCdp.clearEvents();
            ctx.mockCdp.setProbeOverride(() => ({
                matched: true,
                hasBody: true,
                payloadReady: false,
                readyState: 'complete',
                origin: `http://127.0.0.1:${ctx.mockCdp.port}`,
            }));
            ctx.mockCdp.sendEvent('target-main', 'Page.frameNavigated', {
                frame: { id: 'root', url: `http://127.0.0.1:${ctx.mockCdp.port}/c/22222222-2222-2222-2222-222222222222` },
            });
            await waitFor(
                () => ctx.mockCdp.countMethod('target-main', 'Runtime.evaluate', (p) => String(p.expression).includes('__AGY_INJECT_BOOT__')) === 1,
                4000
            );
            await ctx.cleanup();
        });

        it('F03-T1-05: Hot-reload fs.watch bỏ qua tệp lạ và gỡ evalScriptId cũ trước khi nạp lại payload mới', async () => {
            const ctx = await startIsolatedDaemon();
            await waitForInitialAttach(ctx, 'target-main');
            ctx.mockCdp.clearEvents();

            // Ghi tệp lạ trong dist/ -> bỏ qua
            fs.writeFileSync(path.join(ctx.distDir, 'other.txt'), 'ignored', 'utf8');
            await sleep(450);
            assert.equal(ctx.mockCdp.countMethod('target-main', 'Runtime.evaluate'), 0);

            // Ghi đè theme_payload.js -> gỡ script cũ và nạp script mới
            fs.writeFileSync(ctx.payloadPath, '/* v2 */ globalThis.__AGY_TEST_TICK__ = 2;\n', 'utf8');
            await waitFor(
                () => ctx.mockCdp.countMethod('target-main', 'Runtime.evaluate', (p) => String(p.expression).includes('__AGY_TEST_TICK__ = 2')) >= 1,
                4000
            );
            assert.ok(ctx.mockCdp.countMethod('target-main', 'Page.removeScriptToEvaluateOnNewDocument') >= 1);
            assert.ok(ctx.mockCdp.countMethod('target-main', 'Page.addScriptToEvaluateOnNewDocument') >= 1);
            await ctx.cleanup();
        });

        it('F03-T1-06: PII Log Redaction che homedir (~), ROOT_DIR ([repo-root]), query (?[redacted-query]) và UUID ([redacted-id])', async () => {
            const secretUuid = 'abcdef12-3456-4789-abcd-ef1234567890';
            const ctx = await startIsolatedDaemon({
                initialTargetsFactory: (port) => [
                    {
                        id: 'target-pii',
                        type: 'page',
                        title: 'Antigravity',
                        url: `http://127.0.0.1:${port}/workbench?folder=${encodeURIComponent(path.join(os.tmpdir(), 'secret'))}&project=${secretUuid}`,
                    },
                ],
            });
            await waitFor(() => fs.existsSync(ctx.logFile), 4000);
            await sleep(300);
            const logText = fs.readFileSync(ctx.logFile, 'utf8');
            assert.equal(logText.includes(ctx.homeDir), false, 'daemon.log không được chứa đường dẫn homedir thật');
            assert.equal(logText.includes(ctx.sandboxRoot), false, 'daemon.log không được chứa đường dẫn ROOT_DIR');
            assert.equal(logText.includes(secretUuid), false, 'daemon.log không được chứa UUID thô');
            assert.match(logText, /\[redacted-query\]|\[redacted-id\]|\[repo-root\]/);
            await ctx.cleanup();
        });
    });

    describe('Tier 2 — Biên & Góc Khuất F03', () => {
        it('F03-T2-01: DevToolsActivePort biên (UTF-8 BOM, 1 dòng, rác/0, và chuyển sang port CDP mới)', async () => {
            const ctx = await startIsolatedDaemon({ withInitialTarget: false });
            // Ghi port rác 0 -> không crash
            fs.writeFileSync(ctx.portFile, '0\n', 'utf8');
            await sleep(300);
            assert.equal(ctx.child.exitCode, null);

            // Ghi BOM + 1 dòng port chuẩn -> attach
            ctx.mockCdp.setTargets([{ id: 'p-bom', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${ctx.mockCdp.port}/workbench` }]);
            fs.writeFileSync(ctx.portFile, `\uFEFF${ctx.mockCdp.port}\n`, 'utf8');
            await waitFor(() => ctx.mockCdp.countMethod('p-bom', 'Runtime.addBinding') >= 1, 5000);

            // Đổi sang Mock CDP Server #2
            const cdp2 = createMockCdpServer();
            const p2 = await cdp2.start();
            cdp2.setTargets([{ id: 'p-new', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${p2}/workbench` }]);
            fs.writeFileSync(ctx.portFile, `${p2}\ntok2\n`, 'utf8');
            await waitFor(() => cdp2.countMethod('p-new', 'Runtime.addBinding') >= 1, 5000);
            await cdp2.close();
            await ctx.cleanup();
        });

        it('F03-T2-02: Hot-reload burst 5 lần liên tiếp trong ~75ms được debounce 250ms thành đúng 1 lần reinject', async () => {
            const ctx = await startIsolatedDaemon();
            await waitForInitialAttach(ctx, 'target-main');
            ctx.mockCdp.clearEvents();

            for (let i = 1; i <= 5; i++) {
                fs.writeFileSync(ctx.payloadPath, `/* burst ${i} */ globalThis.__AGY_BURST__ = ${i};\n`, 'utf8');
                await sleep(15);
            }
            await sleep(550);

            const evalCount = ctx.mockCdp.countMethod(
                'target-main',
                'Runtime.evaluate',
                (p) => String(p.expression).includes('__AGY_BURST__')
            );
            assert.equal(evalCount, 1, `Debounce 250ms phải gộp 5 lần ghi liên tiếp thành 1 lần reinject (thực tế: ${evalCount})`);
            await ctx.cleanup();
        });

        it('F03-T2-03: Đồng bộ đa cửa sổ qua agySaveThemeConfig không Ping-Pong & bỏ qua config không đổi', async () => {
            const ctx = await startIsolatedDaemon({
                initialTargetsFactory: (port) => [
                    { id: 'win-1', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${port}/workbench` },
                    { id: 'win-2', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${port}/launchpad` },
                ],
            });
            await waitForInitialAttach(ctx, 'win-1');
            await waitForInitialAttach(ctx, 'win-2');
            ctx.mockCdp.clearEvents();

            const cfgPayload = JSON.stringify({
                __agyToken: ctx.token,
                config: { activeTheme: '🔥 Viêm Trụ — Kyojuro Rengoku', dim: 30 },
            });
            ctx.mockCdp.sendEvent('win-1', 'Runtime.bindingCalled', { name: 'agySaveThemeConfig', payload: cfgPayload });
            await sleep(450);

            // Cửa sổ nguồn win-1 KHÔNG nhận Runtime.evaluate (tránh Ping-Pong), chỉ win-2 nhận với syncFromDaemon: true
            assert.equal(ctx.mockCdp.countMethod('win-1', 'Runtime.evaluate'), 0, 'Cửa sổ nguồn không được nhận Runtime.evaluate gây Ping-Pong');
            assert.equal(
                ctx.mockCdp.countMethod('win-2', 'Runtime.evaluate', (p) => String(p.expression).includes('"syncFromDaemon":true')),
                1,
                'Cửa sổ khác phải nhận Runtime.evaluate với syncFromDaemon=true'
            );

            // Gửi lại đúng config giống hệt -> không trigger thêm
            ctx.mockCdp.clearEvents();
            ctx.mockCdp.sendEvent('win-1', 'Runtime.bindingCalled', { name: 'agySaveThemeConfig', payload: cfgPayload });
            await sleep(300);
            assert.equal(ctx.mockCdp.countMethod('win-2', 'Runtime.evaluate'), 0);
            await ctx.cleanup();
        });

        it('F03-T2-04: Coalescing queue khi reinject bị gọi chồng lấp không chạy song song dư thừa', async () => {
            const ctx = await startIsolatedDaemon();
            await waitForInitialAttach(ctx, 'target-main');
            ctx.mockCdp.clearEvents();
            ctx.mockCdp.setEvalDelay(200);

            // Gửi 2 đợt frameNavigated chồng lấp trong lúc Runtime.evaluate đầu tiên đang bị delay 200ms
            ctx.mockCdp.sendEvent('target-main', 'Page.frameNavigated', {
                frame: { id: 'root', url: `http://127.0.0.1:${ctx.mockCdp.port}/c/11111111-1111-1111-1111-111111111111` },
            });
            await sleep(40);
            fs.writeFileSync(ctx.payloadPath, '/* coalesce 1 */ globalThis.__AGY_C__ = 1;\n', 'utf8');
            await sleep(270);
            fs.writeFileSync(ctx.payloadPath, '/* coalesce 2 */ globalThis.__AGY_C__ = 2;\n', 'utf8');
            await sleep(750);

            const evals = ctx.mockCdp.countMethod(
                'target-main',
                'Runtime.evaluate',
                (p) => String(p.expression).includes('__AGY_INJECT_BOOT__')
            );
            assert.ok(evals >= 1 && evals <= 3, `Số lần reinject phải được gộp gọn qua coalescing queue (thực tế: ${evals})`);
            await ctx.cleanup();
        });

        it('F03-T2-05: Page.frameNavigated chuyển hướng sang domain ngoài lạ bị hủy verified và đóng WebSocket', async () => {
            const ctx = await startIsolatedDaemon();
            await waitForInitialAttach(ctx, 'target-main');
            ctx.mockCdp.clearEvents();

            ctx.mockCdp.sendEvent('target-main', 'Page.frameNavigated', {
                frame: { id: 'root', url: 'https://evil.example.com/phish' },
            });
            await sleep(300);
            assert.equal(ctx.mockCdp.countMethod('target-main', 'Runtime.evaluate'), 0, 'Không được probe/inject lên trang đích ngoài domain');
            await ctx.cleanup();
        });

        it('F03-T2-06: acquirePidLock không thoát nhầm vì PID reuse, daemon #2 tự thoát giữ nguyên #1, và xoay vòng daemon.log > 512KB', async () => {
            const ctx = await startIsolatedDaemon();
            // Spawn daemon thứ 2 trỏ cùng sandboxRoot -> phải phát hiện daemon #1 và tự thoát exit 0
            const second = spawn(process.execPath, [ctx.daemonScript], {
                cwd: ctx.sandboxRoot,
                env: ctx.env,
                windowsHide: true,
                stdio: 'pipe',
            });
            const secondExit = await new Promise((resolve) => {
                const t = setTimeout(() => resolve(-1), 6000);
                second.once('exit', (code) => {
                    clearTimeout(t);
                    resolve(code);
                });
            });
            assert.equal(secondExit, 0, 'Daemon #2 cùng thư mục phải nhường daemon #1 và thoát code 0');
            assert.equal(ctx.child.exitCode, null, 'Daemon #1 phải vẫn đang chạy');

            // Kiểm tra log rotation > 512KB: ghi trước > 540KB vào daemon.log rồi trigger ghi log mới (hot-reload)
            const bigChunk = ('2026-11-22T00:00:00.000Z [test-rotation-line] ' + 'A'.repeat(120) + '\n').repeat(3600);
            fs.writeFileSync(ctx.logFile, bigChunk, 'utf8');
            assert.ok(fs.statSync(ctx.logFile).size > 512 * 1024);

            // Kích hoạt > 40 lần log hoặc khởi chạy 1 instance khác trên sandbox phụ để kiểm chứng rotateLogKeepingTailIfNeeded
            for (let i = 0; i < 42; i++) {
                ctx.mockCdp.sendEvent('target-main', 'Runtime.bindingCalled', { name: 'agySaveThemeConfig', payload: '{}' });
            }
            await waitFor(() => fs.statSync(ctx.logFile).size < 400 * 1024, 5000, 50, 'daemon.log > 512KB phải được xoay vòng giữ ~256KB cuối');
            const rotatedContent = fs.readFileSync(ctx.logFile, 'utf8');
            assert.ok(rotatedContent.length > 100 * 1024 && rotatedContent.length < 400 * 1024);
            await ctx.cleanup();
        });
    });

    describe('Tier 3 — Tổ Hợp Liên Phân Hệ Daemon (F01 + F02 + F03)', () => {
        it('F03-T3-01: Kịch bản E2E đa cửa sổ: CDP token thật -> agySaveThemeConfig sync -> SSE /__events nhận crisis -> slash -> subagent', async () => {
            const ctx = await startIsolatedDaemon({
                initialTargetsFactory: (port) => [
                    { id: 'w1', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${port}/workbench` },
                    { id: 'w2', type: 'page', title: 'Antigravity', url: `http://127.0.0.1:${port}/launchpad` },
                ],
            });
            await waitFor(
                () => ctx.mockCdp.countMethod('w1', 'Runtime.addBinding') >= 1 && ctx.mockCdp.countMethod('w2', 'Runtime.addBinding') >= 1,
                6000
            );

            // 1. Sync config qua CDP
            ctx.mockCdp.sendEvent('w1', 'Runtime.bindingCalled', {
                name: 'agySaveThemeConfig',
                payload: JSON.stringify({ __agyToken: ctx.token, config: { activeTheme: '🦋 Trùng Trụ — Shinobu Kocho' } }),
            });
            await waitFor(() => fs.existsSync(ctx.configPath), 4000);
            assert.equal(JSON.parse(fs.readFileSync(ctx.configPath, 'utf8')).activeTheme, '🦋 Trùng Trụ — Shinobu Kocho');

            // 2. Tailer + SSE /__events?cid=latest với Origin từ w1
            const cid = 'f0f0f0f0-1111-1111-1111-111111111111';
            ctx.writeTranscript(cid, [
                { step_index: 1, type: 'USER_INPUT', status: 'DONE' },
                { step_index: 2, type: 'ERROR_MESSAGE', status: 'ERROR' },
            ]);

            const states = [];
            await new Promise((resolve, reject) => {
                const req = http.request(
                    {
                        hostname: '127.0.0.1',
                        port: ctx.assetPort,
                        path: '/__events?cid=latest',
                        headers: {
                            Host: `127.0.0.1:${ctx.assetPort}`,
                            Origin: `http://127.0.0.1:${ctx.mockCdp.port}`,
                            'X-Agy-Token': ctx.token,
                        },
                    },
                    (res) => {
                        let buf = '';
                        res.on('data', (c) => {
                            buf += c.toString('utf8');
                            const parts = buf.split('\n\n');
                            buf = parts.pop();
                            for (const frame of parts) {
                                if (frame.startsWith('data: ')) states.push(JSON.parse(frame.slice(6)));
                            }
                            if (states.length === 1 && states[0].crisisState === true) {
                                ctx.appendTranscript(cid, [
                                    { step_index: 3, type: 'GENERIC', status: 'DONE', content: 'Command exited with code 0\nCommand output:\nOK' },
                                ]);
                            } else if (states.some((s) => s.justSlashedBug === true)) {
                                req.destroy();
                                resolve();
                            }
                        });
                    }
                );
                req.on('error', (e) => {
                    if (states.some((s) => s.justSlashedBug === true)) resolve();
                    else reject(e);
                });
                req.end();
            });
            assert.equal(states[0].crisisState, true);
            assert.equal(states[states.length - 1].justSlashedBug, true);
            assert.equal(states[states.length - 1].slashReason, 'bug_slashed');
            await ctx.cleanup();
        });

        it('F03-T3-02: Sanitize config server-side & tự khôi phục từ custom_theme_backup.json khi mất theme_config.json', async () => {
            const ctx = await startIsolatedDaemon({
                initialConfig: { activeTheme: '🌊 Thủy Trụ — Giyu Tomioka' },
            });
            // Gửi config chứa ký tự nguy hiểm & field cấm qua binding -> phải bị lọc sạch
            ctx.mockCdp.sendEvent('target-main', 'Runtime.bindingCalled', {
                name: 'agySaveThemeConfig',
                payload: JSON.stringify({
                    __agyToken: ctx.token,
                    config: {
                        activeTheme: '⚡ Zenitsu Agatsuma — Lôi Minh',
                        customWp: 'javascript:alert("xss")',
                        __agyToken: 'stolen',
                        __proto__: { polluted: true },
                    },
                }),
            });
            await waitFor(() => {
                if (!fs.existsSync(ctx.configPath)) return false;
                return JSON.parse(fs.readFileSync(ctx.configPath, 'utf8')).activeTheme === '⚡ Zenitsu Agatsuma — Lôi Minh';
            }, 4000);

            const savedCfg = JSON.parse(fs.readFileSync(ctx.configPath, 'utf8'));
            assert.equal(savedCfg.customWp, undefined, 'customWp chứa ngoặc kép/script phải bị sanitizeConfigServerSide loại bỏ');
            assert.equal(savedCfg.__agyToken, undefined);
            assert.equal(({}).polluted, undefined);
            assert.equal(fs.existsSync(ctx.backupConfigPath), true, 'Phải tạo bản sao lưu sinh tồn');

            // Xóa theme_config.json -> trigger hot-reload -> daemon tự khôi phục từ SURVIVAL_BACKUP_FILE
            fs.unlinkSync(ctx.configPath);
            fs.writeFileSync(ctx.payloadPath, '/* trigger restore */ globalThis.__AGY_RESTORE__ = 1;\n', 'utf8');
            await waitFor(() => fs.existsSync(ctx.configPath), 5000);
            const restored = JSON.parse(fs.readFileSync(ctx.configPath, 'utf8'));
            assert.equal(restored.activeTheme, '⚡ Zenitsu Agatsuma — Lôi Minh');
            await ctx.cleanup();
        });
    });
});
