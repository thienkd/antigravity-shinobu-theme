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

if (typeof globalThis.WebSocket !== 'function') {
    console.error('[verify-cdp] Node.js >= 22 is required.');
    process.exit(1);
}

function resolvePortFile() {
    if (process.env.AGY_PORT_FILE) return process.env.AGY_PORT_FILE;
    const home = os.homedir();
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
        ];
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
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
        const p = u.pathname || '/';
        return (
            p === '/' ||
            p === '/launchpad' ||
            p.startsWith('/launchpad/') ||
            p === '/workbench' ||
            p.startsWith('/workbench/') ||
            p.startsWith('/c/')
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
        const ws = new globalThis.WebSocket(wsUrl);
        const timer = setTimeout(() => {
            try {
                ws.close();
            } catch (_) {}
            reject(new Error('CDP evaluation timeout'));
        }, 4000);

        ws.addEventListener('open', () => {
            ws.send(
                JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: { expression, returnByValue: true, awaitPromise: true },
                })
            );
        });
        ws.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(String(event.data));
                if (msg.id === 1) {
                    clearTimeout(timer);
                    ws.close();
                    if (msg.error) reject(new Error(msg.error.message));
                    else if (msg.result && msg.result.exceptionDetails) {
                        reject(new Error(msg.result.exceptionDetails.text || 'Runtime exception'));
                    } else {
                        resolve(msg.result && msg.result.result ? msg.result.result.value : null);
                    }
                }
            } catch (_) {}
        });
        ws.addEventListener('error', (err) => {
            clearTimeout(timer);
            reject(err);
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
    return {
        isAntigravityDom: true,
        url: location.pathname,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        themeActive: Boolean(styleEl),
        activeTheme: localStorage.getItem('agy_theme_v3') || null,
        shellFound: Boolean(shellEl),
        shellBgImagePresent: shellEl ? getComputedStyle(shellEl).backgroundImage !== 'none' : false,
        hasBrowserHole: document.body.dataset.hasBrowserHole || null,
        shellHoleActive: shellEl ? shellEl.getAttribute('data-agy-hole-active') : null,
        mainGridFound: Boolean(mainGrid),
        projectPillBg: projPill ? getComputedStyle(projPill).backgroundColor : null,
        envPillBg: envPill ? getComputedStyle(envPill).backgroundColor : null,
        scrollerCount: scrollers.length,
        liveBlurScrollerCount: liveBlurScrollers.length,
        hasLiveBlurRule,
        leakedWindowToken,
        settingsTriggerPresent: Boolean(document.getElementById('agy-custom-theme-sidebar-btn')),
        composerPresent: Boolean(document.querySelector('div.relative.flex.flex-col.rounded-lg.border')),
    };
})()`;

async function main() {
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
        const report = await evaluatePage(page.webSocketDebuggerUrl, INSPECT_EXPR);
        if (report && report.isAntigravityDom) {
            results.push({ id: page.id, title: page.title, ...report });
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
    console.log(`[verify-cdp] PASS: ${themedPages.length}/${results.length} verified page(s) themed with zero live blur and zero token leak.`);
}

main().catch((err) => {
    console.error(`[verify-cdp] Error: ${err.message}`);
    process.exit(1);
});
