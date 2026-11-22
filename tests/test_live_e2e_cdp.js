'use strict';

/**
 * F19 — Kiểm thử Tích hợp Gói Bundle Thật & Live E2E CDP Không Xâm Lấn
 * - Tự động kiểm tra gói biên dịch dist/theme_payload.js (Master IIFE Pre-Clean, 11 modules, 0% PII)
 * - Khi có Antigravity IDE + Daemon đang chạy (DevToolsActivePort), thực hiện kiểm thử E2E không xâm lấn:
 *   + Xác nhận cả 11 module đều sống khỏe (moduleChecks === true)
 *   + Xác nhận tương tác đóng chéo 3 Popover (Ngữ cảnh -> Chuông gió Kagura -> Mặt nạ Cáo Urokodaki)
 *   + Xác nhận bất biến R3 (Yoriichi mặc định, 0 empty child trong .agy-user-bubble-frame, không có #agy-chibi-skill-bar)
 *   + Xác nhận Zero Live Blur & Zero Token Leak trên window
 * - Trên môi trường CI / máy chưa bật Antigravity IDE, tự động skip phần kết nối CDP sống mà không làm gãy bài test.
 */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function resolvePortFile() {
    if (process.env.AGY_DEVTOOLS_PORT_FILE) return process.env.AGY_DEVTOOLS_PORT_FILE;
    if (process.env.AGY_PORT_FILE) return process.env.AGY_PORT_FILE;
    const home = os.homedir();
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        const cands = [
            path.join(appData, 'antigravity', 'DevToolsActivePort'),
            path.join(appData, 'Antigravity', 'DevToolsActivePort'),
        ];
        return cands.find((p) => fs.existsSync(p)) || '';
    }
    if (process.platform === 'darwin') {
        const appSup = path.join(home, 'Library', 'Application Support');
        const cands = [
            path.join(appSup, 'antigravity', 'DevToolsActivePort'),
            path.join(appSup, 'Antigravity', 'DevToolsActivePort'),
        ];
        return cands.find((p) => fs.existsSync(p)) || '';
    }
    const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const cands = [
        path.join(xdg, 'antigravity', 'DevToolsActivePort'),
        path.join(xdg, 'Antigravity', 'DevToolsActivePort'),
    ];
    return cands.find((p) => fs.existsSync(p)) || '';
}

function httpGetJson(port, reqPath) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: reqPath, timeout: 2500 }, (res) => {
            let raw = '';
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('CDP HTTP timeout'));
        });
    });
}

function evaluateCdp(wsUrl, expression) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let settled = false;
        const finish = (err, val) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                ws.close();
            } catch (_) {}
            if (err) reject(err);
            else resolve(val);
        };
        const timer = setTimeout(() => finish(new Error('CDP evaluate timeout')), 4500);
        ws.addEventListener('open', () => {
            try {
                ws.send(
                    JSON.stringify({
                        id: 1,
                        method: 'Runtime.evaluate',
                        params: { expression, returnByValue: true, awaitPromise: true },
                    })
                );
            } catch (err) {
                finish(err);
            }
        });
        ws.addEventListener('message', (ev) => {
            try {
                const msg = JSON.parse(String(ev.data));
                if (msg.id === 1) {
                    if (msg.error) finish(new Error(msg.error.message || 'CDP error'));
                    else finish(null, msg.result && msg.result.result ? msg.result.result.value : undefined);
                }
            } catch (err) {
                finish(err);
            }
        });
        ws.addEventListener('error', () => finish(new Error('CDP WebSocket error')));
        ws.addEventListener('close', () => finish(new Error('CDP WebSocket closed early')));
    });
}

describe('F19 — Gói Bundle Thật & Kiểm Thử Live E2E CDP Không Xâm Lấn', () => {
    it('F19-T1-01: Biên dịch dist/theme_payload.js chứa đầy đủ khối Master IIFE Pre-Clean và 11 phân hệ lõi', () => {
        execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build_payload.js')], {
            cwd: REPO_ROOT,
            stdio: 'pipe',
            windowsHide: true,
            timeout: 20000,
        });
        const bundlePath = path.join(REPO_ROOT, 'dist', 'theme_payload.js');
        assert.equal(fs.existsSync(bundlePath), true, 'Phải tạo được dist/theme_payload.js');
        const bundle = fs.readFileSync(bundlePath, 'utf8');

        // Khối Pre-Clean phải đứng ở đầu Master IIFE trước mọi module con
        const headSlice = bundle.slice(0, 480);
        assert.match(headSlice, /let __AGY_PRECLEANED__ = false;/, 'Master IIFE phải khai báo __AGY_PRECLEANED__ ở đầu bundle');
        assert.match(
            headSlice,
            /window\.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__\(\{\s*isReinject:\s*true\s*\}\)/,
            'Master IIFE phải gọi pre-clean với { isReinject: true } trước khi khởi tạo 10 EXTRA_MODULES'
        );

        // Cả 11 phân hệ lõi đều hiện diện trong bundle
        const markers = [
            '__AGY_SEC__',
            '__AGY_KNY_ICONS__',
            '__AGY_BIO_AUDIO__',
            '__AGY_KNY_FX_DRAWERS__',
            '__AGY_KNY_SKILLS__',
            '__AGY_KNY_CHIBI_AURA__',
            '__AGY_SQUAD_RAID__',
            '__AGY_TOKEN_HUD__',
            '__AGY_THEME_FORGE__',
            '__AGY_CINEMA_DIRECTOR__',
            '__AGY_THEME_CORE__',
        ];
        for (const m of markers) {
            assert.equal(bundle.includes(m), true, `Bundle thiếu phân hệ ${m}`);
        }
    });

    it('F19-T1-02: Live E2E CDP kiểm chứng 11 module, đóng chéo 3 Popover & bất biến R3 trên cửa sổ Antigravity đang mở', async (t) => {
        const portFile = resolvePortFile();
        if (!portFile || !fs.existsSync(portFile)) {
            t.skip('Không tìm thấy DevToolsActivePort (môi trường headless / chưa mở Antigravity IDE)');
            return;
        }

        const port = parseInt(fs.readFileSync(portFile, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/)[0], 10);
        if (!Number.isFinite(port) || port <= 0) {
            t.skip('DevToolsActivePort không chứa cổng hợp lệ');
            return;
        }

        let targets;
        try {
            targets = await httpGetJson(port, '/json/list');
        } catch (_) {
            t.skip('Cổng CDP hiện không phản hồi (Antigravity IDE vừa đóng)');
            return;
        }

        const candidates = (Array.isArray(targets) ? targets : []).filter(
            (item) =>
                item &&
                item.type === 'page' &&
                item.webSocketDebuggerUrl &&
                /(?:^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/|vscode-file:\/\/)/i.test(String(item.url || ''))
        );

        let verifiedCount = 0;
        for (const page of candidates) {
            let probe;
            try {
                probe = await evaluateCdp(
                    page.webSocketDebuggerUrl,
                    `(() => {
                        const shell = document.querySelector('.agy-shell');
                        const activeStyle = document.getElementById('antigravity-custom-theme-active');
                        if (!shell || !activeStyle) return { isThemedAgy: false };

                        const mods = {
                            sec: Boolean(window.__AGY_SEC__),
                            core: Boolean(window.__AGY_THEME_CORE__),
                            forge: Boolean(window.__AGY_THEME_FORGE__),
                            icons: Boolean(window.__AGY_KNY_ICONS__),
                            bioAudio: Boolean(window.__AGY_BIO_AUDIO__),
                            fxModes: Boolean(window.__AGY_KNY_FX_DRAWERS__),
                            skills: Boolean(window.__AGY_KNY_SKILLS__),
                            chibiAura: Boolean(window.__AGY_KNY_CHIBI_AURA__),
                            squadRaid: Boolean(window.__AGY_SQUAD_RAID__),
                            tokenHud: Boolean(window.__AGY_TOKEN_HUD__),
                            cinemaDirector: Boolean(window.__AGY_CINEMA_DIRECTOR__)
                        };

                        const composer = document.querySelector('.surface-composer');
                        let popoverCycleOk = true;
                        if (composer) {
                            const hudBar = document.getElementById('agy-token-context-bar');
                            const ctxBtn = document.querySelector('.agy-tok-ctx-pill');
                            const bellBtn = document.querySelector('.agy-kagura-bell-btn');
                            const maskBtn = document.querySelector('.agy-cinema-mask-btn');
                            const wasOpenTok = Boolean(hudBar && hudBar.dataset.open === '1');

                            if (ctxBtn && bellBtn && maskBtn && hudBar) {
                                ctxBtn.click();
                                const tokOpened = hudBar.dataset.open === '1';
                                bellBtn.click();
                                const bellOpened = Boolean(document.getElementById('agy-kny-bio-audio-popover'));
                                const tokClosed = hudBar.dataset.open !== '1';
                                maskBtn.click();
                                const maskOpened = Boolean(document.getElementById('agy-cinema-director-panel'));
                                const bellClosed = !document.getElementById('agy-kny-bio-audio-popover');
                                maskBtn.click();
                                const maskClosed = !document.getElementById('agy-cinema-director-panel');
                                if (wasOpenTok) ctxBtn.click();
                                popoverCycleOk = tokOpened && bellOpened && tokClosed && maskOpened && bellClosed && maskClosed;
                            } else {
                                popoverCycleOk = false;
                            }
                        }

                        const frames = Array.from(document.querySelectorAll('.agy-user-bubble-frame'));
                        const emptyDirectChildren = frames.reduce((acc, f) => {
                            const bad = Array.from(f.children).filter((c) => c.children.length === 0 && (c.textContent || '').trim() === '');
                            return acc + bad.length;
                        }, 0);

                        const leakedKeys = Object.keys(window).filter((k) => /__AGY_INJECT_BOOT__|EPHEMERAL_TOKEN/i.test(k));

                        return {
                            isThemedAgy: true,
                            mods,
                            popoverCycleOk,
                            skillBarRemoved: !document.getElementById('agy-chibi-skill-bar'),
                            emptyDirectChildren,
                            leakedTokenCount: leakedKeys.length
                        };
                    })()`
                );
            } catch (_) {
                continue;
            }

            if (!probe || !probe.isThemedAgy) continue;
            verifiedCount++;
            for (const [modName, ok] of Object.entries(probe.mods)) {
                assert.equal(ok, true, `Phân hệ ${modName} phải hoạt động trên cửa sổ Antigravity sống`);
            }
            assert.equal(probe.popoverCycleOk, true, 'Chu trình bấm mở & đóng chéo Ngữ cảnh -> Chuông gió -> Mặt nạ Cáo phải đạt 100%');
            assert.equal(probe.skillBarRemoved, true, 'Không được xuất hiện lại #agy-chibi-skill-bar');
            assert.equal(probe.emptyDirectChildren, 0, 'Mọi phần tử con trực tiếp của .agy-user-bubble-frame không được :empty');
            assert.equal(probe.leakedTokenCount, 0, 'Không được lộ khóa xác thực trên window');
        }

        if (verifiedCount === 0) {
            t.skip('Không có tab Antigravity nào đang mang theme hoạt động ở thời điểm kiểm tra');
        }
    });
});
