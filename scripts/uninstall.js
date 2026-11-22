#!/usr/bin/env node
'use strict';

/**
 * Cleanly uninstalls Antigravity Custom Theme across Windows, macOS, and Linux:
 * 1. Removes OS auto-start registration (Startup .lnk / LaunchAgent / systemd unit) using safe execFileSync arrays.
 * 2. Verifies process command line before stopping theme_daemon.js, waits up to 800ms for graceful exit, then deletes daemon.pid, daemon.log, daemon.lock, silent-start.vbs.
 * 3. Supports --purge to also remove theme_config.json, dist/, ~/.gemini/antigravity/custom_theme_backup.json, and Linux XDG .desktop CDP flags.
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

const NODE_PROC_RE = /\bnode(?:js|\d+)?(?:\.exe)?\b/i;
const DAEMON_SCRIPT_RE = /theme_daemon\.js/;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
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

function readRecordedPid() {
    if (!fs.existsSync(PID_FILE)) return 0;
    try {
        const rawPid = fs.readFileSync(PID_FILE, 'utf8').replace(/^\uFEFF/, '').trim();
        const pid = parseInt(rawPid, 10);
        return Number.isInteger(pid) && pid > 0 ? pid : 0;
    } catch (_) {
        return 0;
    }
}

async function waitForPidExit(pid, maxWaitMs = 800, pollMs = 80) {
    if (!Number.isInteger(pid) || pid <= 0) return;
    let waited = 0;
    while (waited < maxWaitMs && isPidAlive(pid)) {
        await sleep(pollMs);
        waited += pollMs;
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

function unpatchLinuxDesktopLaunchers() {
    if (process.platform !== 'linux') return;
    const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const appsDir = path.join(xdgData, 'applications');
    if (!fs.existsSync(appsDir)) return;

    let updatedAny = false;
    try {
        for (const entry of fs.readdirSync(appsDir)) {
            if (!/^antigravity.*\.desktop$/i.test(entry)) continue;
            const desktopPath = path.join(appsDir, entry);
            try {
                const st = fs.statSync(desktopPath);
                if (!st.isFile()) continue;
                const src = fs.readFileSync(desktopPath, 'utf8');
                let changed = false;
                const cleaned = src.replace(/^Exec=(.*)$/gm, (full, cmd) => {
                    if (!/--remote-debugging-port(?:=\S+)?/.test(cmd)) return full;
                    changed = true;
                    const stripped = cmd
                        .replace(/\s*--remote-debugging-port(?:=\S+)?/g, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    return `Exec=${stripped}`;
                });
                if (changed) {
                    fs.writeFileSync(desktopPath, cleaned, 'utf8');
                    console.log(`[uninstall] Removed CDP flag from Linux desktop launcher: ${desktopPath}`);
                    updatedAny = true;
                }
            } catch (_) {}
        }
    } catch (_) {}

    if (updatedAny) {
        try {
            execFileSync('update-desktop-database', [appsDir], { stdio: 'ignore', timeout: 3000 });
        } catch (_) {}
    }
}

function unpatchWindowsShortcuts() {
    if (process.platform !== 'win32') return;
    const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Dirs = @(
  [Environment]::GetFolderPath('DesktopDirectory'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('Startup'),
  (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
foreach ($d in $Dirs) {
  Get-ChildItem -LiteralPath $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $WshShell.CreateShortcut($_.FullName)
      if ($sc.TargetPath -and ($sc.TargetPath -imatch '\\\\Antigravity\\.exe$')) {
        if ($sc.Arguments -and ($sc.Arguments -match '--remote-debugging-port')) {
          $sc.Arguments = (($sc.Arguments -replace '\\s*--remote-debugging-port(?:=\\S+)?', '') -replace '\\s{2,}', ' ').Trim()
          $sc.Save()
          Write-Output $_.FullName
        }
      }
    } catch {}
  }
}
`;
    try {
        const out = execFileSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', psScript],
            { encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
        if (out) {
            for (const line of out.split(/\r?\n/)) {
                if (line.trim()) {
                    console.log(`[uninstall] Removed CDP flag from Windows shortcut: ${line.trim()}`);
                }
            }
        }
    } catch (_) {}
}

async function stopDaemonAndCleanRuntimeFiles(prePid, preVerified) {
    const currentPid = readRecordedPid();
    const pid = currentPid || prePid;
    let waitPid = 0;

    if (pid > 0) {
        if (isVerifiedDaemonProcess(pid)) {
            waitPid = pid;
            try {
                process.kill(pid, 'SIGTERM');
                console.log(`[uninstall] Sent SIGTERM to verified daemon PID ${pid}.`);
            } catch (_) {
                console.log(`[uninstall] Daemon PID ${pid} already exited.`);
            }
        } else if (pid === prePid && preVerified) {
            waitPid = pid;
            console.log(`[uninstall] Verified daemon PID ${pid} stopped via service manager.`);
        } else {
            console.log(`[uninstall] Skipped PID ${pid} (not an active theme_daemon.js process).`);
        }
    } else {
        console.log('[uninstall] No active daemon.pid found.');
    }

    if (waitPid > 0) {
        await waitForPidExit(waitPid, 800, 80);
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
        unpatchWindowsShortcuts();
        unpatchLinuxDesktopLaunchers();
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
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]') return false;
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
        let settled = false;
        const ws = new globalThis.WebSocket(wsUrl);
        const finish = (val) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(Boolean(val));
        };
        const timer = setTimeout(() => {
            try {
                ws.close();
            } catch (_) {}
            finish(false);
        }, 2500);

        ws.addEventListener('open', () => {
            try {
                ws.send(
                    JSON.stringify({
                        id: 1,
                        method: 'Runtime.evaluate',
                        params: {
                            returnByValue: true,
                            expression: `(() => {
                                const purgeStorage = ${JSON.stringify(PURGE)};
                                const isAgy = Boolean(
                                    document.getElementById('antigravity-custom-theme-active') ||
                                    document.querySelector('.agy-shell, .monaco-workbench, [data-launchpad], #workbench\\\\.parts\\\\.editor')
                                );
                                if (!isAgy) return false;
                                let cleaned = false;
                                if (typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === 'function') {
                                    window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__();
                                    cleaned = true;
                                }
                                if (purgeStorage) {
                                    try {
                                        const keys = [];
                                        for (let i = 0; i < localStorage.length; i++) {
                                            const k = localStorage.key(i);
                                            if (k && k.startsWith('agy_')) keys.push(k);
                                        }
                                        for (const k of keys) {
                                            localStorage.removeItem(k);
                                        }
                                        if (keys.length > 0) cleaned = true;
                                    } catch (_) {}
                                }
                                return cleaned;
                            })()`,
                        },
                    })
                );
            } catch (_) {
                finish(false);
            }
        });
        ws.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(String(event.data));
                if (msg.id === 1) {
                    const removed = Boolean(msg.result && msg.result.result && msg.result.result.value);
                    finish(removed);
                    try {
                        ws.close();
                    } catch (_) {}
                }
            } catch (_) {}
        });
        ws.addEventListener('close', () => {
            finish(false);
        });
        ws.addEventListener('error', () => {
            finish(false);
        });
    });
}

async function clearOpenPages() {
    if (typeof globalThis.WebSocket !== 'function') {
        console.warn(
            `[uninstall] Warning: Node.js < 22 detected (found ${process.version}, built-in WebSocket unavailable); skipped live CDP DOM cleanup. Please reload open Antigravity windows with Cmd/Ctrl + R.`
        );
        return;
    }

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
    const prePid = readRecordedPid();
    const preVerified = prePid > 0 ? isVerifiedDaemonProcess(prePid) : false;
    removeAutoStart();
    await stopDaemonAndCleanRuntimeFiles(prePid, preVerified);
    await clearOpenPages();
    console.log(`[uninstall] Done. Antigravity theme removed${PURGE ? ' (purged config & dist)' : ''}.`);
}

main();
