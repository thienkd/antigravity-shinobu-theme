#!/usr/bin/env node
'use strict';

/**
 * Antigravity Custom Theme Daemon (Windows / macOS / Linux)
 * Connects to Antigravity CDP (DevToolsActivePort), injects dist/theme_payload.js,
 * persists user theme preferences in theme_config.json, and hot-reloads on rebuild.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

if (typeof globalThis.WebSocket !== 'function') {
    console.error('[theme-daemon] Node.js >= 22 with built-in WebSocket is required.');
    process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const BACKUP_CONFIG_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');
const THEMES_DIR = path.join(ROOT_DIR, 'themes');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PAYLOAD_PATH = path.join(DIST_DIR, 'theme_payload.js');
const BUILD_SCRIPT_JS = path.join(ROOT_DIR, 'scripts', 'build_payload.js');
const LOG_FILE = path.join(ROOT_DIR, 'daemon.log');
const DEFAULT_CONFIG = {};

const ASSET_MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

let assetServer = null;
let assetPort = 0;
const telemetryCache = new Map();

function resolveBrainDir() {
    if (process.env.AGY_BRAIN_DIR) return process.env.AGY_BRAIN_DIR;
    return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
}

function readConversationTelemetry(rawCid) {
    const cid = String(rawCid || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cid)) {
        return { ok: false, reason: 'invalid_cid' };
    }
    const transcriptPath = path.join(resolveBrainDir(), cid, '.system_generated', 'logs', 'transcript.jsonl');
    let st;
    try {
        st = fs.statSync(transcriptPath);
        if (!st.isFile()) return { ok: false, reason: 'not_found', cid };
    } catch (_) {
        return { ok: false, reason: 'not_found', cid };
    }

    const cached = telemetryCache.get(cid);
    if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs) {
        return cached.data;
    }

    let rawText = '';
    try {
        rawText = fs.readFileSync(transcriptPath, 'utf8');
    } catch (_) {
        return { ok: false, reason: 'read_error', cid };
    }

    const lines = rawText.split(/\r?\n/);
    let lastUserIdx = -1;
    let totalTurns = 0;
    const parsed = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
            const obj = JSON.parse(line);
            parsed.push(obj);
            if (obj.type === 'USER_INPUT') {
                lastUserIdx = parsed.length - 1;
                totalTurns++;
            }
        } catch (_) {
            // Ignore partial line while file is actively flushing
        }
    }

    let contextTokens = 0;
    let inputTokens = 0;
    let cacheTokens = 0;
    let prevTurnContextTokens = 0;
    let turnOutputTokens = 0;
    let totalOutputTokens = 0;
    let turnSteps = 0;
    let latestStepIndex = 0;
    let latestStatus = 'IDLE';
    let modelName = '';

    for (let i = 0; i < parsed.length; i++) {
        const step = parsed[i];
        if (typeof step.step_index === 'number') latestStepIndex = step.step_index;
        if (step.status) latestStatus = String(step.status);

        const inTok = Number(step.input_tokens) || 0;
        const cTok = Number(step.cache_read_tokens) || 0;
        const outTok = Number(step.output_tokens) || 0;
        const ctxSum = inTok + cTok;

        if (ctxSum > 0) {
            contextTokens = ctxSum;
            inputTokens = inTok;
            cacheTokens = cTok;
            if (i < lastUserIdx) {
                prevTurnContextTokens = ctxSum;
            }
        }
        if (step.model && typeof step.model === 'string') {
            modelName = step.model;
        }
        if (outTok > 0) {
            totalOutputTokens += outTok;
            if (i > lastUserIdx) {
                turnOutputTokens += outTok;
            }
        } else if (i > lastUserIdx && step.type === 'PLANNER_RESPONSE') {
            // In-flight step before output_tokens is finalized
            const thinkChars = typeof step.thinking === 'string' ? step.thinking.length : 0;
            const contentChars = typeof step.content === 'string' ? step.content.length : 0;
            const est = Math.round((thinkChars + contentChars) / 3.7);
            turnOutputTokens += est;
            totalOutputTokens += est;
        }

        if (i > lastUserIdx && step.type === 'PLANNER_RESPONSE') {
            turnSteps++;
        }
    }

    // Fallback context estimate from raw transcript size if brand new conversation has no finalized planner step yet
    if (contextTokens === 0 && st.size > 0) {
        contextTokens = Math.round(st.size / 4.2);
    }

    const data = {
        ok: true,
        cid,
        contextTokens,
        inputTokens,
        cacheTokens,
        turnContextDelta: prevTurnContextTokens > 0 ? Math.max(0, contextTokens - prevTurnContextTokens) : contextTokens,
        turnOutputTokens,
        totalOutputTokens,
        turnSteps,
        totalTurns,
        latestStepIndex,
        latestStatus,
        fileBytes: st.size,
        updatedAt: Math.floor(st.mtimeMs)
    };

    if (telemetryCache.size > 20) {
        const oldestKey = telemetryCache.keys().next().value;
        if (oldestKey) telemetryCache.delete(oldestKey);
    }
    telemetryCache.set(cid, { size: st.size, mtimeMs: st.mtimeMs, data });
    return data;
}

function startAssetServer() {
    return new Promise((resolve) => {
        const safePrefix = THEMES_DIR.endsWith(path.sep) ? THEMES_DIR : THEMES_DIR + path.sep;

        const server = http.createServer((req, res) => {
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
            };

            if (req.method === 'OPTIONS') {
                res.writeHead(204, {
                    ...corsHeaders,
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                });
                res.end();
                return;
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Method Not Allowed');
                return;
            }

            let rawPathname = '/';
            let queryString = '';
            try {
                const rawUrl = String(req.url || '/');
                const qIdx = rawUrl.indexOf('?');
                rawPathname = decodeURIComponent(qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl);
                queryString = qIdx >= 0 ? rawUrl.slice(qIdx + 1).split('#')[0] : '';
            } catch (_) {
                res.writeHead(400, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Bad Request');
                return;
            }

            if (rawPathname === '/__telemetry') {
                const params = new URLSearchParams(queryString);
                const payload = readConversationTelemetry(params.get('cid') || '');
                const body = JSON.stringify(payload);
                res.writeHead(200, {
                    ...corsHeaders,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': Buffer.byteLength(body),
                });
                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }
                res.end(body);
                return;
            }

            if (rawPathname.includes('\0')) {
                res.writeHead(400, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Bad Request');
                return;
            }

            const relPath = rawPathname.replace(/^[/\\]+/, '');
            if (!relPath) {
                res.writeHead(404, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not Found');
                return;
            }

            const resolvedPath = path.resolve(THEMES_DIR, relPath);
            if (!resolvedPath.startsWith(safePrefix)) {
                res.writeHead(403, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
                return;
            }

            fs.stat(resolvedPath, (err, stat) => {
                if (err || !stat.isFile()) {
                    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Not Found');
                    return;
                }

                const ext = path.extname(resolvedPath).toLowerCase();
                const contentType = ASSET_MIME_TYPES[ext] || 'application/octet-stream';
                const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
                if (req.headers['if-none-match'] === etag) {
                    res.writeHead(304, { ...corsHeaders, ETag: etag });
                    res.end();
                    return;
                }
                res.writeHead(200, {
                    ...corsHeaders,
                    'Content-Type': contentType,
                    'Content-Length': stat.size,
                    ETag: etag,
                });

                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }

                const stream = fs.createReadStream(resolvedPath);
                stream.on('error', () => {
                    if (!res.headersSent) {
                        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                    }
                    res.end();
                });
                stream.pipe(res);
            });
        });

        server.on('error', (err) => {
            log(`Local asset server error: ${err.message}`);
            resolve(0);
        });

        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            assetPort = addr && typeof addr === 'object' && addr.port ? addr.port : 0;
            assetServer = server;
            log(`Local asset server listening on http://127.0.0.1:${assetPort}/ (serving ${THEMES_DIR})`);
            resolve(assetPort);
        });
    });
}

function resolvePortFile() {
    if (process.env.AGY_PORT_FILE) {
        return process.env.AGY_PORT_FILE;
    }

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
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
        candidates = [
            path.join(xdgConfig, 'antigravity', 'DevToolsActivePort'),
            path.join(xdgConfig, 'Antigravity', 'DevToolsActivePort'),
        ];
    }

    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) {
            fs.writeFileSync(LOG_FILE, '');
        }
        fs.appendFileSync(LOG_FILE, line);
    } catch (_) {}
    if (process.stdout.isTTY || process.env.AGY_DAEMON_STDOUT === '1') {
        process.stdout.write(line);
    }
}

function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

function acquirePidLock() {
    if (fs.existsSync(PID_FILE)) {
        const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
        if (existingPid && existingPid !== process.pid && isPidAlive(existingPid)) {
            log(`Another daemon instance is already running (PID ${existingPid}). Exiting.`);
            process.exit(0);
        }
    }
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

function removePidLock() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        }
    } catch (_) {}
}

function readConfig() {
    for (const candidate of [CONFIG_FILE, BACKUP_CONFIG_FILE]) {
        try {
            if (fs.existsSync(candidate)) {
                const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    // Self-heal primary config if restored from immutable user backup
                    if (candidate === BACKUP_CONFIG_FILE && !fs.existsSync(CONFIG_FILE)) {
                        try {
                            fs.writeFileSync(CONFIG_FILE, JSON.stringify(parsed, null, 2), 'utf8');
                            log('Restored theme_config.json from immutable backup after update.');
                        } catch (_) {}
                    }
                    return { ...DEFAULT_CONFIG, ...parsed };
                }
            }
        } catch (err) {
            log(`Failed reading ${candidate}: ${err.message}`);
        }
    }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(next) {
    try {
        const merged = { ...readConfig(), ...next };
        const serialized = JSON.stringify(merged, null, 2);
        fs.writeFileSync(CONFIG_FILE, serialized, 'utf8');
        try {
            fs.mkdirSync(path.dirname(BACKUP_CONFIG_FILE), { recursive: true });
            fs.writeFileSync(BACKUP_CONFIG_FILE, serialized, 'utf8');
        } catch (_) {}
        return merged;
    } catch (err) {
        log(`Failed saving theme_config.json: ${err.message}`);
        return null;
    }
}

/* ==========================================================================
 * SELF-HEALING UPDATE GUARD (Protects against Antigravity Installer overwrites)
 * ========================================================================== */

let lastKnownExeMtime = 0;
let shortcutHealRunning = false;

function resolveAntigravityExeWin() {
    if (process.platform !== 'win32') return null;
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const candidates = [
        path.join(localAppData, 'Programs', 'antigravity', 'Antigravity.exe'),
        path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

function healWindowsShortcutsAsync(reason) {
    if (process.platform !== 'win32' || shortcutHealRunning) return;
    shortcutHealRunning = true;
    const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Dirs = @(
  [Environment]::GetFolderPath('DesktopDirectory'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('Startup'),
  (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar')
) | Where-Object { $_ -and (Test-Path $_) }
$patched = 0
foreach ($d in $Dirs) {
  Get-ChildItem -Path $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $WshShell.CreateShortcut($_.FullName)
      if ($sc.TargetPath -and ($sc.TargetPath -imatch '\\\\Antigravity\\.exe$')) {
        if ($sc.Arguments -notmatch '--remote-debugging-port') {
          $sc.Arguments = ("$($sc.Arguments) --remote-debugging-port=0").Trim()
          $sc.Save()
          $patched++
        }
      }
    } catch {}
  }
}
if ($patched -gt 0) { Write-Output "Patched $patched shortcut(s)" }
`;
    try {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        });
        let out = '';
        if (child.stdout) child.stdout.on('data', (c) => (out += String(c)));
        child.on('close', () => {
            shortcutHealRunning = false;
            if (out.trim()) {
                log(`[update-guard] Auto-healed Antigravity shortcuts (${reason}): ${out.trim()}`);
            }
        });
        child.on('error', () => {
            shortcutHealRunning = false;
        });
    } catch (_) {
        shortcutHealRunning = false;
    }
}

function checkAntigravityUpdateAndHeal() {
    // 1. Auto-rebuild dist/theme_payload.js if missing after a git pull / skill update
    if (!fs.existsSync(PAYLOAD_PATH) && fs.existsSync(BUILD_SCRIPT_JS)) {
        try {
            execFileSync(process.execPath, [BUILD_SCRIPT_JS], { cwd: ROOT_DIR, windowsHide: true, timeout: 15000 });
            log('[update-guard] Auto-rebuilt missing dist/theme_payload.js.');
        } catch (err) {
            log(`[update-guard] Auto-rebuild failed: ${err.message}`);
        }
    }

    // 2. Detect Antigravity.exe binary update on Windows & immediately re-patch overwritten .lnk shortcuts
    if (process.platform === 'win32') {
        const exePath = resolveAntigravityExeWin();
        if (exePath) {
            try {
                const st = fs.statSync(exePath);
                if (lastKnownExeMtime === 0) {
                    lastKnownExeMtime = st.mtimeMs;
                    healWindowsShortcutsAsync('daemon-startup');
                } else if (st.mtimeMs !== lastKnownExeMtime) {
                    lastKnownExeMtime = st.mtimeMs;
                    log(`[update-guard] Detected Antigravity.exe update (${exePath}); healing shortcuts.`);
                    healWindowsShortcutsAsync('app-updated');
                    // Re-check again 8s later once installer finishes writing all shortcuts
                    setTimeout(() => healWindowsShortcutsAsync('app-updated-followup'), 8000);
                }
            } catch (_) {}
        }
    }
}

let missingPayloadLogged = false;
function buildInjectedSource() {
    if (!fs.existsSync(PAYLOAD_PATH)) {
        checkAntigravityUpdateAndHeal();
    }
    if (!fs.existsSync(PAYLOAD_PATH)) {
        if (!missingPayloadLogged) {
            log(`Payload not built yet (${PAYLOAD_PATH}). Run: node scripts/build_payload.js`);
            missingPayloadLogged = true;
        }
        return null;
    }
    missingPayloadLogged = false;

    const cfgJson = JSON.stringify(readConfig());
    const payloadCode = fs.readFileSync(PAYLOAD_PATH, 'utf8');
    const assetBasePrefix = assetPort > 0
        ? `window.__AGY_ASSET_BASE__ = "http://127.0.0.1:" + ${assetPort} + "/";\n`
        : '';
    return `${assetBasePrefix}window.__AGY_INITIAL_CONFIG__ = ${cfgJson};\n${payloadCode}`;
}

function getPortInfo() {
    const portFile = resolvePortFile();
    if (!fs.existsSync(portFile)) return null;
    const lines = fs
        .readFileSync(portFile, 'utf8')
        .trim()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    const port = parseInt(lines[0], 10);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { port, token: lines[1] || '' };
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 2000 }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
        req.on('error', reject);
    });
}

const sessions = new Map();
let lastPort = null;
let reloadTimer = null;

function createSession(target) {
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    const session = { id: target.id, ws, target };
    sessions.set(target.id, session);

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== 1) {
                reject(new Error('WebSocket is not open'));
                return;
            }
            const id = nextId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    session.reinject = async () => {
        const src = buildInjectedSource();
        if (!src) return;
        try {
            await send('Runtime.evaluate', { expression: src, awaitPromise: false });
        } catch (_) {}
    };

    ws.addEventListener('message', async (event) => {
        let msg;
        try {
            msg = JSON.parse(String(event.data));
        } catch (_) {
            return;
        }

        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
            else p.resolve(msg.result);
            return;
        }

        if (msg.method === 'Runtime.bindingCalled' && msg.params && msg.params.name === 'agySaveThemeConfig') {
            try {
                const payload = JSON.parse(msg.params.payload || '{}');
                saveConfig(payload);
                for (const other of sessions.values()) {
                    if (other.id !== target.id) {
                        other.reinject();
                    }
                }
            } catch (err) {
                log(`Config binding error: ${err.message}`);
            }
            return;
        }

        if (msg.method === 'Page.frameNavigated' && msg.params && msg.params.frame && !msg.params.frame.parentId) {
            await session.reinject();
        }
    });

    ws.addEventListener('open', async () => {
        try {
            await send('Page.enable');
            await send('Runtime.enable');
            try {
                await send('Runtime.addBinding', { name: 'agySaveThemeConfig' });
            } catch (_) {}

            const src = buildInjectedSource();
            if (src) {
                await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
                await send('Runtime.evaluate', { expression: src, awaitPromise: false });
            }
            log(`Attached target ${target.id} (${target.url})`);
        } catch (err) {
            log(`Attach error for ${target.id}: ${err.message}`);
        }
    });

    const cleanup = () => {
        for (const p of pending.values()) {
            p.reject(new Error('WebSocket closed'));
        }
        pending.clear();
        sessions.delete(target.id);
    };
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
}

async function scanPages() {
    const info = getPortInfo();
    if (!info) return;

    if (lastPort !== null && lastPort !== info.port) {
        for (const s of sessions.values()) {
            try {
                s.ws.close();
            } catch (_) {}
        }
        sessions.clear();
    }
    lastPort = info.port;

    let targets;
    try {
        targets = await fetchJson(`http://127.0.0.1:${info.port}/json`);
    } catch (_) {
        return;
    }
    if (!Array.isArray(targets)) return;

    const pages = targets.filter((t) => {
        if (!t || t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
        const url = String(t.url || '');
        if (url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return false;
        return url.includes('127.0.0.1') || url.includes('workbench') || url.includes('launchpad');
    });

    const liveIds = new Set(pages.map((p) => p.id));
    for (const [id, session] of sessions.entries()) {
        if (!liveIds.has(id)) {
            try {
                session.ws.close();
            } catch (_) {}
            sessions.delete(id);
        }
    }

    for (const page of pages) {
        if (!sessions.has(page.id)) {
            createSession(page);
        }
    }
}

function watchPayload() {
    try {
        if (!fs.existsSync(DIST_DIR)) {
            fs.mkdirSync(DIST_DIR, { recursive: true });
        }
        fs.watch(DIST_DIR, (_eventType, filename) => {
            if (filename && filename !== 'theme_payload.js') return;
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
                log('Detected dist/theme_payload.js update; hot-reloading attached pages.');
                for (const s of sessions.values()) {
                    s.reinject();
                }
            }, 250);
        });
    } catch (err) {
        log(`fs.watch skipped: ${err.message}`);
    }
}

function shutdown(signal) {
    log(`Shutting down on ${signal}.`);
    for (const s of sessions.values()) {
        try {
            s.ws.close();
        } catch (_) {}
    }
    sessions.clear();
    if (assetServer) {
        try {
            assetServer.close();
        } catch (_) {}
        assetServer = null;
    }
    removePidLock();
    process.exit(0);
}

acquirePidLock();
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', removePidLock);
process.on('uncaughtException', (err) => {
    log(`[daemon-guard] Uncaught exception recovered: ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (reason) => {
    log(`[daemon-guard] Unhandled rejection recovered: ${reason}`);
});

log(`Theme daemon started (PID ${process.pid}, platform=${process.platform}, portFile=${resolvePortFile()}).`);
checkAntigravityUpdateAndHeal();
setInterval(checkAntigravityUpdateAndHeal, 120000);
startAssetServer().then(() => {
    watchPayload();
    scanPages();
    setInterval(scanPages, 1500);
});
