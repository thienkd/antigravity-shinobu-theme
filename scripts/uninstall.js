#!/usr/bin/env node
'use strict';

/**
 * Cleanly uninstalls Antigravity Custom Theme across Windows, macOS, and Linux:
 * 1. Removes OS auto-start registration (Startup .lnk / LaunchAgent / systemd unit) using safe execFileSync arrays.
 * 2. Verifies process command line before stopping theme_daemon.js, then deletes daemon.pid, daemon.log, daemon.lock, silent-start.vbs.
 * 3. Supports --purge to also remove theme_config.json, dist/, and ~/.gemini/antigravity/custom_theme_backup.json.
 * 4. Calls window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__() strictly on verified Antigravity CDP pages (never Split Browser tabs).
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, 'daemon.pid');
const LOG_FILE = path.join(ROOT_DIR, 'daemon.log');
const LOCK_FILE = path.join(ROOT_DIR, 'daemon.lock');
const VBS_FILE = path.join(ROOT_DIR, 'silent-start.vbs');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BACKUP_CONFIG_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');

const PURGE = process.argv.slice(2).includes('--purge');

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

function isVerifiedDaemonProcess(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
    } catch (_) {
        return false;
    }

    if (process.platform === 'win32') {
        try {
            const out = execFileSync(
                'powershell.exe',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; if ($p) { "$($p.Name)|$($p.CommandLine)" }`,
                ],
                { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
            ).trim();
            if (!out) return false;
            return /^node(?:\.exe)?\|/i.test(out) && /theme_daemon\.js/i.test(out);
        } catch (_) {
            return false;
        }
    }

    try {
        const cmdline = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
            encoding: 'utf8',
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return /\bnode\b/i.test(cmdline) && /theme_daemon\.js/.test(cmdline);
    } catch (_) {
        return false;
    }
}

function safeUnlink(targetPath, label) {
    try {
        if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
            console.log(`[uninstall] Removed ${label}: ${targetPath}`);
        }
    } catch (_) {}
}

function stopDaemonAndCleanRuntimeFiles() {
    if (fs.existsSync(PID_FILE)) {
        const rawPid = fs.readFileSync(PID_FILE, 'utf8').replace(/^\uFEFF/, '').trim();
        const pid = parseInt(rawPid, 10);
        if (pid > 0) {
            if (isVerifiedDaemonProcess(pid)) {
                try {
                    process.kill(pid, 'SIGTERM');
                    console.log(`[uninstall] Stopped verified daemon PID ${pid}.`);
                } catch (_) {
                    console.log(`[uninstall] Daemon PID ${pid} already exited.`);
                }
            } else {
                console.log(`[uninstall] Skipped PID ${pid} (not an active theme_daemon.js process).`);
            }
        }
    } else {
        console.log('[uninstall] No active daemon.pid found.');
    }

    safeUnlink(PID_FILE, 'daemon PID file');
    safeUnlink(LOG_FILE, 'daemon log file');
    safeUnlink(LOCK_FILE, 'daemon lock file');

    if (PURGE) {
        safeUnlink(CONFIG_FILE, 'theme config');
        safeUnlink(BACKUP_CONFIG_FILE, 'backup theme config');
        try {
            if (fs.existsSync(DIST_DIR)) {
                fs.rmSync(DIST_DIR, { recursive: true, force: true });
                console.log(`[uninstall] Purged build directory: ${DIST_DIR}`);
            }
        } catch (_) {}
    }
}

function removeAutoStart() {
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        const lnk = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'AntigravityCustomTheme.lnk');
        safeUnlink(lnk, 'Windows Startup shortcut');
        safeUnlink(VBS_FILE, 'VBScript launcher');
        return;
    }

    if (process.platform === 'darwin') {
        const label = 'io.antigravity.custom-theme';
        const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
        const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
        try {
            execFileSync('launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'ignore' });
        } catch (_) {
            try {
                if (fs.existsSync(plist)) {
                    execFileSync('launchctl', ['unload', plist], { stdio: 'ignore' });
                }
            } catch (_) {}
        }
        safeUnlink(plist, 'LaunchAgent plist');
        return;
    }

    const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const unitName = 'antigravity-custom-theme.service';
    const unitPath = path.join(xdg, 'systemd', 'user', unitName);
    try {
        execFileSync('systemctl', ['--user', 'disable', '--now', unitName], { stdio: 'ignore' });
    } catch (_) {}
    if (fs.existsSync(unitPath)) {
        safeUnlink(unitPath, 'systemd user unit');
        try {
            execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
        } catch (_) {}
    }
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
        const req = http.get(url, { timeout: 2000 }, (res) => {
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

function cleanupPage(wsUrl) {
    return new Promise((resolve) => {
        if (typeof globalThis.WebSocket !== 'function') {
            resolve(false);
            return;
        }
        const ws = new globalThis.WebSocket(wsUrl);
        const timer = setTimeout(() => {
            try {
                ws.close();
            } catch (_) {}
            resolve(false);
        }, 2500);

        ws.addEventListener('open', () => {
            ws.send(
                JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: {
                        returnByValue: true,
                        expression: `(() => {
                            const isAgy = Boolean(
                                document.getElementById('antigravity-custom-theme-active') ||
                                document.querySelector('.agy-shell, .monaco-workbench, [data-launchpad]')
                            );
                            if (!isAgy) return false;
                            if (typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === 'function') {
                                window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__();
                                return true;
                            }
                            return false;
                        })()`,
                    },
                })
            );
        });
        ws.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(String(event.data));
                if (msg.id === 1) {
                    clearTimeout(timer);
                    const removed = Boolean(msg.result && msg.result.result && msg.result.result.value);
                    ws.close();
                    resolve(removed);
                }
            } catch (_) {}
        });
        ws.addEventListener('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}

async function clearOpenPages() {
    const portFile = resolvePortFile();
    if (!fs.existsSync(portFile)) {
        console.log('[uninstall] Antigravity is not running (no DevToolsActivePort).');
        return;
    }
    const port = parseInt(fs.readFileSync(portFile, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/)[0], 10);
    if (!Number.isFinite(port) || port <= 0) return;

    try {
        const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
        const pages = (Array.isArray(targets) ? targets : []).filter(
            (t) => t && t.type === 'page' && t.webSocketDebuggerUrl && isCandidateAntigravityUrl(String(t.url || ''))
        );
        for (const p of pages) {
            const removed = await cleanupPage(p.webSocketDebuggerUrl);
            if (removed) {
                console.log(`[uninstall] Cleared theme from verified Antigravity page ${p.id}.`);
            }
        }
    } catch (err) {
        console.log(`[uninstall] CDP cleanup skipped (${err.message}).`);
    }
}

async function main() {
    removeAutoStart();
    stopDaemonAndCleanRuntimeFiles();
    await clearOpenPages();
    console.log(`[uninstall] Done. Antigravity theme removed${PURGE ? ' (purged config & dist)' : ''}.`);
}

main();
