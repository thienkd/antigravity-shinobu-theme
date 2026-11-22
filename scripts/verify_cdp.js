#!/usr/bin/env node
'use strict';

/**
 * Non-destructive live CDP verifier for Antigravity Custom Theme.
 * Strictly filters candidate Antigravity URLs and verifies authentic Antigravity DOM
 * so Split Browser / localhost user apps are never mistakenly probed as IDE windows.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

if (typeof globalThis.WebSocket !== 'function') {
    console.error(`[verify-cdp] Node.js >= 22 is required (found ${process.version} at ${process.execPath}).`);
    process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, 'daemon.pid');
const NODE_PROC_RE = /\bnode(?:js|\d+)?(?:\.exe)?\b/i;
const DAEMON_SCRIPT_RE = /theme_daemon\.js/;

function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

function getEffectiveHomedir() {
    if (process.platform === 'win32') {
        return process.env.USERPROFILE || process.env.HOME || os.homedir();
    }
    return process.env.HOME || os.homedir();
}

function resolveLiveDaemonPid() {
    if (process.env.AGY_DAEMON_PID_FILE) {
        const explicitPath = path.resolve(process.env.AGY_DAEMON_PID_FILE);
        if (!fs.existsSync(explicitPath)) return null;
        try {
            const pid = parseInt(fs.readFileSync(explicitPath, 'utf8').replace(/^\uFEFF/, '').trim(), 10);
            if (pid > 0 && isVerifiedDaemonProcess(pid)) {
                return { pid, source: explicitPath };
            }
        } catch (_) {}
        return null;
    }

    const home = getEffectiveHomedir();
    const pidFileCandidates = [
        PID_FILE,
        path.join(home, '.gemini', 'config', 'skills', 'antigravity-custom-theme', 'daemon.pid'),
        path.join(home, '.gemini', 'antigravity', 'skills', 'antigravity-custom-theme', 'daemon.pid'),
        path.join(home, '.agents', 'skills', 'antigravity-custom-theme', 'daemon.pid'),
    ].filter(Boolean);

    const seenPaths = new Set();
    for (const candidate of pidFileCandidates) {
        const resolved = path.resolve(candidate);
        if (seenPaths.has(resolved)) continue;
        seenPaths.add(resolved);
        if (!fs.existsSync(resolved)) continue;
        try {
            const pid = parseInt(fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '').trim(), 10);
            if (pid > 0 && isVerifiedDaemonProcess(pid)) {
                return { pid, source: resolved };
            }
        } catch (_) {}
    }

    // Fallback: scan live OS processes running theme_daemon.js
    if (process.platform === 'win32') {
        try {
            const out = execFileSync(
                'powershell.exe',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    `Get-CimInstance Win32_Process -Filter "Name LIKE 'node%'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'theme_daemon\\.js' } | Select-Object -ExpandProperty ProcessId`,
                ],
                { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
            ).trim();
            for (const line of out.split(/\r?\n/)) {
                const pid = parseInt(line.trim(), 10);
                if (pid > 0 && isVerifiedDaemonProcess(pid)) {
                    return { pid, source: 'process-scan' };
                }
            }
        } catch (_) {
            try {
                const wmicOut = execFileSync(
                    'wmic.exe',
                    ['process', 'where', "Name like 'node%'", 'get', 'ProcessId,CommandLine', '/FORMAT:LIST'],
                    { encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }
                ).trim();
                for (const block of wmicOut.split(/\r?\n\s*\r?\n/)) {
                    if (!DAEMON_SCRIPT_RE.test(block)) continue;
                    const m = block.match(/ProcessId=(\d+)/i);
                    const pid = m ? parseInt(m[1], 10) : 0;
                    if (pid > 0 && isVerifiedDaemonProcess(pid)) {
                        return { pid, source: 'process-scan' };
                    }
                }
            } catch (__) {}
        }
    } else {
        try {
            const psOut = execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
                encoding: 'utf8',
                timeout: 3000,
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            for (const line of psOut.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || !DAEMON_SCRIPT_RE.test(trimmed)) continue;
                const m = trimmed.match(/^(\d+)\s+(.*)$/);
                if (!m) continue;
                const pid = parseInt(m[1], 10);
                if (pid > 0 && pid !== process.pid && NODE_PROC_RE.test(m[2]) && isVerifiedDaemonProcess(pid)) {
                    return { pid, source: 'process-scan' };
                }
            }
        } catch (_) {}
    }

    return null;
}

function isVerifiedDaemonProcess(pid) {
    if (!Number.isInteger(pid) || pid <= 0 || !isPidAlive(pid)) return false;

    if (process.platform === 'win32') {
        try {
            const out = execFileSync(
                'powershell.exe',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction Stop; if ($p) { "$($p.Name)|$($p.CommandLine)" }`,
                ],
                { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
            ).trim();
            if (!out) return false;
            return NODE_PROC_RE.test(out) && DAEMON_SCRIPT_RE.test(out);
        } catch (_) {
            try {
                const wmicOut = execFileSync(
                    'wmic.exe',
                    ['process', 'where', `ProcessId=${pid}`, 'get', 'Name,CommandLine', '/FORMAT:LIST'],
                    { encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }
                ).trim();
                if (!wmicOut) return false;
                return NODE_PROC_RE.test(wmicOut) && DAEMON_SCRIPT_RE.test(wmicOut);
            } catch (__) {
                return false;
            }
        }
    }

    if (process.platform === 'linux') {
        try {
            const rawCmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0+/g, ' ').trim();
            if (rawCmd) {
                return NODE_PROC_RE.test(rawCmd) && DAEMON_SCRIPT_RE.test(rawCmd);
            }
        } catch (_) {}
    }

    try {
        const cmdline = execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], {
            encoding: 'utf8',
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return NODE_PROC_RE.test(cmdline) && DAEMON_SCRIPT_RE.test(cmdline);
    } catch (_) {
        return false;
    }
}

function resolvePortFile() {
    if (process.env.AGY_DEVTOOLS_PORT_FILE) return process.env.AGY_DEVTOOLS_PORT_FILE;
    if (process.env.AGY_PORT_FILE) return process.env.AGY_PORT_FILE;
    const home = getEffectiveHomedir();
    let candidates;
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        candidates = [
            path.join(appData, 'antigravity', 'DevToolsActivePort'),
            path.join(appData, 'Antigravity', 'DevToolsActivePort'),
        ];
    } else if (process.platform === 'darwin') {
        const appSupport = path.join(home, 'Library', 'Application Support');
        candidates = [
            path.join(appSupport, 'antigravity', 'DevToolsActivePort'),
            path.join(appSupport, 'Antigravity', 'DevToolsActivePort'),
        ];
    } else {
        const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
        candidates = [
            path.join(xdg, 'antigravity', 'DevToolsActivePort'),
            path.join(xdg, 'Antigravity', 'DevToolsActivePort'),
            path.join(home, 'snap', 'antigravity', 'current', '.config', 'Antigravity', 'DevToolsActivePort'),
            path.join(home, 'snap', 'antigravity', 'current', '.config', 'antigravity', 'DevToolsActivePort'),
        ];
        const flatpakBase = path.join(home, '.var', 'app');
        try {
            if (fs.existsSync(flatpakBase)) {
                for (const entry of fs.readdirSync(flatpakBase)) {
                    if (/antigravity/i.test(entry)) {
                        candidates.push(
                            path.join(flatpakBase, entry, 'config', 'Antigravity', 'DevToolsActivePort'),
                            path.join(flatpakBase, entry, 'config', 'antigravity', 'DevToolsActivePort')
                        );
                    }
                }
            }
        } catch (_) {}
    }
    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function isCandidateAntigravityUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;
    const trimmed = rawUrl.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (
        lower.startsWith('devtools://') ||
        lower.startsWith('chrome-extension://') ||
        lower.startsWith('about:') ||
        lower.startsWith('data:') ||
        lower.startsWith('blob:')
    ) {
        return false;
    }
    if (lower.startsWith('vscode-file:') || lower.startsWith('file:')) {
        return lower.includes('workbench') || lower.includes('antigravity');
    }
    try {
        const u = new URL(trimmed);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]') return false;
        const p = u.pathname || '/';
        return (
            p === '/' ||
            p === '/launchpad' ||
            p.startsWith('/launchpad/') ||
            p === '/workbench' ||
            p.startsWith('/workbench/') ||
            p.startsWith('/c/') ||
            p.startsWith('/p/') ||
            p === '/projects' ||
            p.startsWith('/projects/') ||
            p === '/settings' ||
            p.startsWith('/settings/') ||
            p === '/manager' ||
            p.startsWith('/manager/') ||
            p === '/workspace' ||
            p.startsWith('/workspace/') ||
            p.startsWith('/w/') ||
            p === '/chat' ||
            p.startsWith('/chat/')
        );
    } catch (_) {
        return false;
    }
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 2500 }, (res) => {
            let body = '';
            res.on('data', (c) => {
                body += c;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body.replace(/^\uFEFF/, '')));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
        req.on('error', reject);
    });
}

function evaluatePage(wsUrl, expression) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const ws = new globalThis.WebSocket(wsUrl);
        const finish = (err, val) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (err) reject(err);
            else resolve(val);
        };
        const timer = setTimeout(() => {
            try {
                ws.close();
            } catch (_) {}
            finish(new Error('CDP evaluation timeout'));
        }, 4000);

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
        ws.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(String(event.data));
                if (msg.id === 1) {
                    if (msg.error) {
                        finish(new Error(msg.error.message || 'CDP error'));
                    } else if (msg.result && msg.result.exceptionDetails) {
                        finish(new Error(msg.result.exceptionDetails.text || 'Runtime exception'));
                    } else {
                        finish(null, msg.result && msg.result.result ? msg.result.result.value : null);
                    }
                    try {
                        ws.close();
                    } catch (_) {}
                }
            } catch (_) {}
        });
        ws.addEventListener('close', () => {
            finish(new Error('WebSocket closed before CDP response'));
        });
        ws.addEventListener('error', (err) => {
            finish(err instanceof Error ? err : new Error('WebSocket connection error'));
        });
    });
}

const INSPECT_EXPR = `(() => {
    const isAntigravityDom = Boolean(
        document.querySelector('.agy-shell, .monaco-workbench, [data-launchpad], #workbench\\\\.parts\\\\.editor') ||
        /Antigravity/i.test(document.title || '') ||
        /^\\/(c\\/[0-9a-f-]{36}|launchpad)/i.test(location.pathname || '')
    );
    if (!isAntigravityDom) {
        return { isAntigravityDom: false };
    }
    const styleEl = document.getElementById('antigravity-custom-theme-active');
    const shellEl = document.querySelector('.agy-shell');
    const mainGrid = document.querySelector('div.flex.h-full.flex-col.overflow-hidden.relative > div.flex.flex-1.flex-row.overflow-hidden.relative');
    const projPill = document.querySelector('[data-testid="project-selector-trigger"]');
    const envPill = document.querySelector('[aria-label="Select Environment"]');
    const scrollers = Array.from(document.querySelectorAll('.overflow-y-auto, [data-main-content-body], [data-side-panel-body]'));
    const liveBlurScrollers = scrollers.filter((el) => /blur\\(/i.test(getComputedStyle(el).backdropFilter || ''));
    const shellBackdrop = shellEl ? (getComputedStyle(shellEl).backdropFilter || 'none') : 'none';
    const hasLiveBlurRule = /blur\\(/i.test(shellBackdrop) || liveBlurScrollers.length > 0;
    const leakedWindowToken = Boolean(
        typeof window.__AGY_AUTH_TOKEN__ !== 'undefined' ||
        typeof window.__AGY_INJECT_BOOT__ !== 'undefined' ||
        typeof window.__AGY_BOOT__ !== 'undefined'
    );
    const cinemaBtnPresent = Boolean(document.querySelector('.agy-cinema-mask-btn'));
    const kaguraBtnPresent = Boolean(document.querySelector('.agy-kagura-bell-btn'));
    const hudBarPresent = Boolean(document.getElementById('agy-token-context-bar'));
    const cinemaDirectorAlive = Boolean(
        typeof window.__AGY_CINEMA_DIRECTOR__?.openPanel === 'function' &&
        document.getElementById('antigravity-kny-cinema-director-style')
    );
    const bioAudioAlive = Boolean(
        typeof window.__AGY_BIO_AUDIO__?.openPopover === 'function' &&
        document.getElementById('antigravity-kny-bio-audio-style')
    );
    const coreState =
        window.__AGY_THEME_CORE__ && typeof window.__AGY_THEME_CORE__.getState === 'function'
            ? window.__AGY_THEME_CORE__.getState()
            : null;
    const wpEnabled =
        coreState && typeof coreState.wpEnabled === 'boolean'
            ? coreState.wpEnabled
            : localStorage.getItem('agy_wp_enabled_v1') !== 'false';
    const shellHoleActive = shellEl ? shellEl.getAttribute('data-agy-hole-active') : null;
    const shellDirectBg = shellEl ? getComputedStyle(shellEl).backgroundImage : 'none';
    const shellAfterBg = shellEl ? getComputedStyle(shellEl, '::after').backgroundImage : 'none';
    const shellDirectBgPresent = Boolean(shellEl && shellDirectBg && shellDirectBg !== 'none');
    const shellAfterBgPresent = Boolean(shellEl && shellAfterBg && shellAfterBg !== 'none');
    const shellBgImagePresent = shellHoleActive === '1' ? shellAfterBgPresent : shellDirectBgPresent;

    const userBubbleFrames = Array.from(document.querySelectorAll('.agy-user-bubble-frame'));
    const userMessageCount = document.querySelectorAll('[data-testid="user-message"], .agy-user-bubble-frame').length;
    const isWelcomeView =
        userMessageCount === 0 &&
        (/^\\/(launchpad|projects|workspace|manager)?(\\/|$)/i.test(location.pathname || '') ||
            Boolean(document.querySelector('[data-launchpad]')));

    const composerEl =
        document.querySelector('.surface-composer, [data-testid="composer"]') ||
        (!isWelcomeView ? document.querySelector('div.relative.flex.flex-col.rounded-lg.border') : null);
    const composerPresent = Boolean(composerEl);

    const moduleChecks = {
        sec: Boolean(
            window.__AGY_SEC__ &&
            typeof window.__AGY_SEC__.sanitizeCssUrl === 'function' &&
            typeof window.__AGY_SEC__.getAssetBase === 'function' &&
            typeof window.__AGY_SEC__.getAuthToken === 'undefined'
        ),
        themeCore: Boolean(
            window.__AGY_THEME_CORE__ &&
            typeof window.__AGY_THEME_CORE__.applyTheme === 'function' &&
            typeof window.__AGY_THEME_CORE__.getState === 'function'
        ),
        themeForge: Boolean(
            window.__AGY_THEME_FORGE__ &&
            typeof window.__AGY_THEME_FORGE__.getPersona === 'function' &&
            typeof window.__AGY_THEME_FORGE__.buildOklchThemeDefinition === 'function'
        ),
        fxModes: Boolean(
            typeof window.__AGY_KNY_FX_DRAWERS__ === 'function' &&
            Array.isArray(window.__AGY_KNY_FX_DRAWERS__.modes) &&
            window.__AGY_KNY_FX_DRAWERS__.modes.length >= 16
        ),
        chibiAura: Boolean(
            window.__AGY_KNY_CHIBI_AURA__ &&
            typeof window.__AGY_KNY_CHIBI_AURA__.mountChibiAura === 'function'
        ),
        breathingSkills: Boolean(
            window.__AGY_KNY_SKILLS__ &&
            typeof window.__AGY_KNY_SKILLS__.castSkill === 'function'
        ),
        semanticIcons: Boolean(
            window.__AGY_KNY_ICONS__ &&
            typeof window.__AGY_KNY_ICONS__.getFuncSvg === 'function'
        ),
        squadRaid: Boolean(
            window.__AGY_SQUAD_RAID__ &&
            typeof window.__AGY_SQUAD_RAID__.mount === 'function' &&
            typeof window.__AGY_SQUAD_RAID__.sync === 'function'
        ),
        tokenHud: Boolean(
            window.__AGY_TOKEN_HUD__ &&
            typeof window.__AGY_TOKEN_HUD__.mountTokenHud === 'function' &&
            typeof window.__AGY_TOKEN_HUD__.ingestTelemetrySnapshot === 'function'
        ),
        cinemaDirector: cinemaDirectorAlive,
        bioAudio: bioAudioAlive,
    };
    const tokenHudStyleAlive = Boolean(document.getElementById('antigravity-kny-token-hud-style'));

    const chibiSkillBarPresent = Boolean(document.getElementById('agy-chibi-skill-bar'));
    const userBubbleFrameCount = userBubbleFrames.length;
    let userBubbleEmptyChildCount = 0;
    let userBubbleMissingGuardCount = 0;
    for (const frame of userBubbleFrames) {
        for (const child of Array.from(frame.children)) {
            let isEmpty = false;
            try {
                isEmpty = typeof child.matches === 'function'
                    ? child.matches(':empty')
                    : (child.children.length === 0 && child.childNodes.length === 0);
            } catch (_) {
                isEmpty = child.children.length === 0 && child.childNodes.length === 0;
            }
            if (isEmpty) {
                userBubbleEmptyChildCount++;
            }
            if (child.classList.contains('agy-chibi-hitbox') || child.classList.contains('agy-user-chibi-aura-wave')) {
                if (!child.querySelector('i[aria-hidden="true"]')) {
                    userBubbleMissingGuardCount++;
                }
            }
        }
    }

    const masterPersona = (coreState && coreState.masterPersona) || localStorage.getItem('agy_master_persona_v1') || 'yoriichi';
    const crestBtn = document.querySelector('.agy-yoriichi-crest-btn');
    const crestTitle = crestBtn ? (crestBtn.getAttribute('title') || crestBtn.getAttribute('aria-label') || '') : '';
    const firstHitbox = document.querySelector('.agy-user-bubble-frame > .agy-chibi-hitbox');
    const hitboxTitle = firstHitbox ? (firstHitbox.getAttribute('title') || '') : '';
    const msgHit = document.querySelector('.agy-yoriichi-msg-hit');
    const msgHitTitle = msgHit ? (msgHit.getAttribute('title') || '') : '';
    const yoriichiRe = /Yoriichi|H\\u1ecfa Th\\u1ea7n/i;
    let yoriichiIdentityValid = true;
    if (masterPersona === 'yoriichi') {
        if (crestBtn && !yoriichiRe.test(crestTitle)) yoriichiIdentityValid = false;
        if (firstHitbox && !yoriichiRe.test(hitboxTitle)) yoriichiIdentityValid = false;
        if (msgHit && !yoriichiRe.test(msgHitTitle)) yoriichiIdentityValid = false;
    } else if (window.__AGY_THEME_FORGE__ && typeof window.__AGY_THEME_FORGE__.hasPersona === 'function') {
        yoriichiIdentityValid = Boolean(window.__AGY_THEME_FORGE__.hasPersona(masterPersona));
    }

    return {
        isAntigravityDom: true,
        url: location.pathname,
        isWelcomeView,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        themeActive: Boolean(styleEl),
        activeTheme: localStorage.getItem('agy_theme_v3') || null,
        wpEnabled,
        shellFound: Boolean(shellEl),
        shellDirectBgPresent,
        shellAfterBgPresent,
        shellBgImagePresent,
        hasBrowserHole: document.body.dataset.hasBrowserHole || null,
        shellHoleActive,
        mainGridFound: Boolean(mainGrid),
        projectPillBg: projPill ? getComputedStyle(projPill).backgroundColor : null,
        envPillBg: envPill ? getComputedStyle(envPill).backgroundColor : null,
        scrollerCount: scrollers.length,
        liveBlurScrollerCount: liveBlurScrollers.length,
        hasLiveBlurRule,
        leakedWindowToken,
        settingsTriggerPresent: Boolean(document.getElementById('agy-custom-theme-sidebar-btn')),
        composerPresent,
        hudBarPresent,
        cinemaBtnPresent,
        kaguraBtnPresent,
        cinemaDirectorAlive,
        bioAudioAlive,
        tokenHudStyleAlive,
        moduleChecks,
        chibiSkillBarPresent,
        userBubbleFrameCount,
        userBubbleEmptyChildCount,
        userBubbleMissingGuardCount,
        masterPersona,
        yoriichiIdentityValid,
    };
})()`;

async function main() {
    const liveDaemon = resolveLiveDaemonPid();
    if (!liveDaemon) {
        console.error(
            `[verify-cdp] FAIL: No live theme_daemon.js process found (checked ${PID_FILE}, standard global skill directories, and OS process table).`
        );
        process.exit(1);
    }

    const portFile = resolvePortFile();
    if (!fs.existsSync(portFile)) {
        console.error(`[verify-cdp] DevToolsActivePort not found at: ${portFile}`);
        process.exit(1);
    }

    const port = parseInt(fs.readFileSync(portFile, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/)[0], 10);
    const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
    const candidatePages = (Array.isArray(targets) ? targets : []).filter(
        (t) => t && t.type === 'page' && t.webSocketDebuggerUrl && isCandidateAntigravityUrl(String(t.url || ''))
    );

    if (candidatePages.length === 0) {
        console.error(`[verify-cdp] No candidate Antigravity CDP page targets found on port ${port}.`);
        process.exit(1);
    }

    const results = [];
    for (const page of candidatePages) {
        try {
            const report = await evaluatePage(page.webSocketDebuggerUrl, INSPECT_EXPR);
            if (report && report.isAntigravityDom) {
                results.push({ id: page.id, title: page.title, ...report });
            }
        } catch (err) {
            console.warn(`[verify-cdp] Skipped unresponsive target ${page.id}: ${err.message}`);
        }
    }

    if (results.length === 0) {
        console.error(`[verify-cdp] No verified Antigravity DOM targets found among ${candidatePages.length} candidate(s).`);
        process.exit(1);
    }

    console.log(JSON.stringify(results, null, 2));

    const themedPages = results.filter((r) => r.themeActive);
    if (themedPages.length === 0) {
        console.error('[verify-cdp] FAIL: #antigravity-custom-theme-active not active on any verified Antigravity page.');
        process.exit(1);
    }
    if (themedPages.some((r) => r.hasLiveBlurRule)) {
        console.error('[verify-cdp] FAIL: Detected backdrop-filter blur rule in injected style.');
        process.exit(1);
    }
    if (themedPages.some((r) => r.leakedWindowToken)) {
        console.error('[verify-cdp] FAIL: Ephemeral boot/auth token leaked onto global window object.');
        process.exit(1);
    }
    if (themedPages.some((r) => r.cinemaBtnPresent !== r.kaguraBtnPresent)) {
        console.error(
            '[verify-cdp] FAIL: Asymmetric HUD utility buttons (.agy-cinema-mask-btn vs .agy-kagura-bell-btn) on themed page.'
        );
        process.exit(1);
    }
    if (themedPages.some((r) => (r.composerPresent || r.hudBarPresent) && (!r.cinemaBtnPresent || !r.kaguraBtnPresent))) {
        console.error(
            '[verify-cdp] FAIL: Composer or HUD bar is present, but .agy-cinema-mask-btn / .agy-kagura-bell-btn is missing.'
        );
        process.exit(1);
    }
    if (themedPages.some((r) => !r.cinemaDirectorAlive || !r.bioAudioAlive)) {
        console.error(
            '[verify-cdp] FAIL: __AGY_CINEMA_DIRECTOR__ or __AGY_BIO_AUDIO__ (or their styles) died after injection!'
        );
        process.exit(1);
    }
    for (const r of themedPages) {
        const deadModules = Object.entries(r.moduleChecks || {})
            .filter(([, ok]) => !ok)
            .map(([name]) => name);
        if (deadModules.length > 0) {
            console.error(`[verify-cdp] FAIL: Dead module(s) on target ${r.id}: ${deadModules.join(', ')}`);
            process.exit(1);
        }
        if (r.hudBarPresent && !r.tokenHudStyleAlive) {
            console.error(`[verify-cdp] FAIL: HUD bar present on target ${r.id}, but #antigravity-kny-token-hud-style is missing.`);
            process.exit(1);
        }
        if (r.shellFound && r.shellHoleActive === '1' && r.wpEnabled !== false && !r.shellAfterBgPresent) {
            console.error(`[verify-cdp] FAIL: Split Browser Cutout active on target ${r.id}, but .agy-shell::after backgroundImage is missing.`);
            process.exit(1);
        }
        if (r.chibiSkillBarPresent) {
            console.error(`[verify-cdp] FAIL: Obsolete #agy-chibi-skill-bar detected on target ${r.id}.`);
            process.exit(1);
        }
        if (r.userBubbleEmptyChildCount > 0 || r.userBubbleMissingGuardCount > 0) {
            console.error(
                `[verify-cdp] FAIL: R3 user-bubble guard violation on target ${r.id} (empty=${r.userBubbleEmptyChildCount}, missingGuard=${r.userBubbleMissingGuardCount}).`
            );
            process.exit(1);
        }
        if (!r.yoriichiIdentityValid) {
            console.error(`[verify-cdp] FAIL: Default master persona / Yoriichi identity check failed on target ${r.id} (persona=${r.masterPersona}).`);
            process.exit(1);
        }
    }
    console.log(
        `[verify-cdp] PASS: ${themedPages.length}/${results.length} verified page(s) themed (daemon PID ${liveDaemon.pid} via ${liveDaemon.source}) with zero live blur, zero token leak, all 11 modules alive, and R3 invariants intact.`
    );
}

main().catch((err) => {
    console.error(`[verify-cdp] Error: ${err.message}`);
    process.exit(1);
});
