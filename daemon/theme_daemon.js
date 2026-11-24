#!/usr/bin/env node
'use strict';

/**
 * Antigravity Custom Theme Daemon — Enterprise Hardened Edition (Windows / macOS / Linux)
 * - Ephemeral 256-bit secret & Master IIFE lexical closure injection (zero window token exposure)
 * - Strict CDP target URL filter + live DOM verification probe before Runtime.addBinding / injection
 * - Host-header anti-DNS-rebinding guard, symlink-safe static /assets/ server, & strict Origin/Token API guard
 * - O(delta-bytes) Incremental Byte-Offset Transcript Tailer + SSE streaming endpoint (/__events)
 * - Automatic PII log redaction & 0o600 file permissions
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const { spawn, execFileSync } = require('child_process');

if (typeof globalThis.WebSocket !== 'function') {
    console.error(
        `[theme-daemon] Node.js >= 22 with built-in WebSocket is required (found ${process.version} at ${process.execPath}).`
    );
    process.exit(1);
}

const EPHEMERAL_TOKEN = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_TOKEN_BUF = Buffer.from(EPHEMERAL_TOKEN, 'utf8');

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const BACKUP_CONFIG_FILE =
    process.env.AGY_BACKUP_CONFIG_PATH ||
    path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');
const SURVIVAL_BACKUP_FILE = BACKUP_CONFIG_FILE;
const THEMES_DIR = path.join(ROOT_DIR, 'themes');
const ASSETS_DIR = path.join(THEMES_DIR, 'assets');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PAYLOAD_PATH = path.join(DIST_DIR, 'theme_payload.js');
const BUILD_SCRIPT_JS = path.join(ROOT_DIR, 'scripts', 'build_payload.js');
const LOG_FILE = path.join(ROOT_DIR, 'daemon.log');
const DEFAULT_CONFIG = {};
const FALLBACK_DANGEROUS_KEYS = new Set([
    '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
    'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
    '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
]);
let DANGEROUS_KEYS = FALLBACK_DANGEROUS_KEYS;
let syncPersonaRuntimeHint = null;
let writeFileAtomicSync = null;
let sanitizeWorkspaceProfilesStrict = null;
try {
    const personaSyncMod = require('../scripts/persona_hint_sync');
    syncPersonaRuntimeHint = personaSyncMod.syncPersonaRuntimeHint;
    writeFileAtomicSync = personaSyncMod.writeFileAtomicSync;
    sanitizeWorkspaceProfilesStrict = personaSyncMod.sanitizeWorkspaceProfilesStrict;
    if (personaSyncMod.DANGEROUS_KEYS instanceof Set) {
        DANGEROUS_KEYS = personaSyncMod.DANGEROUS_KEYS;
    }
} catch (_) {}

const MAX_BINDING_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_ACTIVE_FORGED_THEME_BYTES = Math.floor(1.8 * 1024 * 1024);
const MAX_TRACKED_CONVERSATIONS = 16;
const MAX_TRACKED_CHILDREN = 32;
const MAX_KNOWN_SUBAGENTS = 64;
const MAX_ACTIVE_SUBAGENTS_TAILED = 8;
const MAX_RECENT_COMPLETED_SUBAGENTS = 6;
const COMPLETED_SUBAGENT_TTL_MS = 12000;
const REVIVE_GRACE_MS = 20000;
const SUBAGENT_IDLE_COMPLETE_MS = 2500;
const LATEST_CID_CACHE_TTL_MS = 1500;
const MAX_LINE_BYTES = 2 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_SSE_CLIENTS = 32;
const SSE_POLL_INTERVAL_MS = 350;
const SSE_PING_INTERVAL_MS = 15000;
const MAX_LOG_BYTES = 512 * 1024;
const LOG_STAT_INTERVAL = 40;
const CDP_SEND_TIMEOUT_MS = 6000;
const CONFIG_BROADCAST_DEBOUNCE_MS = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ALLOWED_ASSET_MIME = Object.freeze({
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.vrm': 'model/gltf-binary',
});

const ASSET_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

let assetServer = null;
let assetPort = 0;

const trustedOrigins = new Set(['vscode-file://vscode-app']);
const ignoredTargetFingerprints = new Set();
const sseClients = [];

/* ==========================================================================
 * SECURITY HELPERS: REDACTION, CONSTANT-TIME AUTH, PROTO SANITIZATION, BOM
 * ========================================================================== */

function stripBom(str) {
    return typeof str === 'string' ? str.replace(/^\uFEFF/, '') : '';
}

function parseJsonFileSync(filePath) {
    const raw = stripBom(fs.readFileSync(filePath, 'utf8'));
    return JSON.parse(raw);
}

function timingSafeTokenMatch(candidate) {
    if (typeof candidate !== 'string' || candidate.length !== EPHEMERAL_TOKEN.length) {
        return false;
    }
    try {
        const buf = Buffer.from(candidate, 'utf8');
        if (buf.length !== EPHEMERAL_TOKEN_BUF.length) return false;
        return crypto.timingSafeEqual(buf, EPHEMERAL_TOKEN_BUF);
    } catch (_) {
        return false;
    }
}

function stripProtoKeys(obj, depth = 0) {
    if (depth > 10 || !obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.slice(0, 250).map((item) => stripProtoKeys(item, depth + 1));
    }
    const clean = Object.create(null);
    for (const key of Object.keys(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        clean[key] = stripProtoKeys(obj[key], depth + 1);
    }
    return Object.assign({}, clean);
}

function buildPathRedactionRegexes(rawPath) {
    if (typeof rawPath !== 'string') return [];
    const trimmed = rawPath.replace(/[/\\]+$/, '');
    if (trimmed.length <= 1 || /^[A-Za-z]:$/.test(trimmed)) return [];
    const seedPaths = new Set([trimmed]);
    try {
        const rp = fs.realpathSync(trimmed).replace(/[/\\]+$/, '');
        if (rp && rp.length > 1) seedPaths.add(rp);
    } catch (_) {}
    for (const sp of Array.from(seedPaths)) {
        if (sp.startsWith('/private/var/') || sp === '/private/var') {
            seedPaths.add(sp.slice('/private'.length));
        } else if (sp.startsWith('/var/')) {
            seedPaths.add('/private' + sp);
        } else if (sp.startsWith('/private/tmp/') || sp === '/private/tmp') {
            seedPaths.add(sp.slice('/private'.length));
        } else if (sp.startsWith('/tmp/')) {
            seedPaths.add('/private' + sp);
        }
    }

    const baseForms = new Set();
    for (const sp of seedPaths) {
        baseForms.add(sp);
        try {
            baseForms.add(sp.normalize('NFC'));
        } catch (_) {}
        try {
            baseForms.add(sp.normalize('NFD'));
        } catch (_) {}
    }

    const variants = new Set();
    for (const form of baseForms) {
        if (!form || form.length <= 1) continue;
        const fwd = form.split('\\').join('/');
        const back = form.split('/').join('\\');
        variants.add(fwd);
        variants.add(back);
        try {
            const enc = encodeURI(fwd);
            if (enc && enc.length > 1) variants.add(enc);
        } catch (_) {}
    }

    return Array.from(variants)
        .sort((a, b) => b.length - a.length)
        .map((v) => new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
}

function redactLog(msg) {
    let text = String(msg == null ? '' : msg);
    text = text.replace(/file:\/\/\/[^\s&)"']*/gi, 'file:///[redacted-path]');
    text = text.replace(/file%3A%2F%2F[^\s&)"']*/gi, 'file://[redacted-path]');

    const home = os.homedir();
    const redactTargets = [];
    if (home && home.length > 1) redactTargets.push({ raw: home, token: '~' });
    if (ROOT_DIR && ROOT_DIR.length > 1) redactTargets.push({ raw: ROOT_DIR, token: '[repo-root]' });
    redactTargets.sort((a, b) => b.raw.length - a.raw.length);
    for (const item of redactTargets) {
        for (const re of buildPathRedactionRegexes(item.raw)) {
            text = text.replace(re, item.token);
        }
    }

    text = text.replace(/([?&])(?:project|tab|folder|folderUri|workspace|workspaceUri|file|path)=[^\s&)"']*/gi, '$1[redacted-query]');
    text = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[redacted-id]');
    return text;
}

function ensurePrivateFileMode(filePath) {
    if (process.platform === 'win32') return;
    try {
        fs.chmodSync(filePath, 0o600);
    } catch (_) {}
}

let logWriteCounter = LOG_STAT_INTERVAL - 1;

function rotateLogKeepingTailIfNeeded() {
    if (++logWriteCounter < LOG_STAT_INTERVAL) return;
    logWriteCounter = 0;
    if (!fs.existsSync(LOG_FILE)) return;
    const st = fs.statSync(LOG_FILE);
    if (st.size <= MAX_LOG_BYTES) return;

    const keepBytes = Math.floor(MAX_LOG_BYTES / 2);
    let fd = -1;
    let tailSlice = Buffer.alloc(0);
    try {
        fd = fs.openSync(LOG_FILE, 'r');
        const buf = Buffer.allocUnsafe(keepBytes);
        const readPos = Math.max(0, st.size - keepBytes);
        const bytesRead = fs.readSync(fd, buf, 0, keepBytes, readPos);
        const rawSlice = buf.subarray(0, bytesRead);
        const firstNl = rawSlice.indexOf(0x0a);
        tailSlice = firstNl >= 0 && firstNl + 1 < rawSlice.length ? rawSlice.subarray(firstNl + 1) : rawSlice;
    } finally {
        if (fd !== -1) {
            try {
                fs.closeSync(fd);
            } catch (_) {}
        }
    }
    fs.writeFileSync(LOG_FILE, tailSlice, { mode: 0o600 });
    ensurePrivateFileMode(LOG_FILE);
}

function log(msg) {
    const safeMsg = redactLog(msg);
    const line = `[${new Date().toISOString()}] ${safeMsg}\n`;
    try {
        rotateLogKeepingTailIfNeeded();
        fs.appendFileSync(LOG_FILE, line, { encoding: 'utf8', mode: 0o600 });
        ensurePrivateFileMode(LOG_FILE);
    } catch (_) {}
    if (process.stdout.isTTY || process.env.AGY_DAEMON_STDOUT === '1') {
        process.stdout.write(line);
    }
}

/* ==========================================================================
 * INCREMENTAL BYTE-OFFSET TRANSCRIPT TAILER (O(delta-bytes), < 0.3ms)
 * ========================================================================== */

const conversationTrackers = new Map();
const childSubagentTrackers = new Map();
let latestCidCache = { cid: null, expiresAt: 0 };

const GIT_PUSH_CMD_RE = /\bgit(?:\s+(?:-C|-c|--git-dir|--work-tree)(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)|\s+--[a-z-]+)*\s+push\b/i;
const GH_REPO_CREATE_RE = /\bgh\s+repo\s+create\b/i;
const PUSH_FLAG_RE = /(?:^|\s)--push(?=\s|$)/i;
const DRY_RUN_FLAG_RE = /(?:^|\s)(?:--dry-run|-n)(?=\s|$)/i;
const READ_FILE_OUTPUT_PREFIX_RE = /^\s*Created At:[^\r\n]*\r?\n(?:Completed At:[^\r\n]*\r?\n)?Showing lines\s+\d+/i;

function splitShellSubCommands(raw) {
    const parts = [];
    let cur = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inSingle) {
            if (ch === "'") {
                inSingle = false;
                cur += "'";
            }
            continue;
        }
        if (inDouble) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inDouble = false;
                cur += '"';
            }
            continue;
        }
        if (escaped) {
            escaped = false;
            cur += ch;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            cur += ch;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            cur += "'";
            continue;
        }
        if (ch === '"') {
            inDouble = true;
            cur += '"';
            continue;
        }
        if (ch === '\r' || ch === '\n' || ch === ';') {
            if (cur.trim()) parts.push(cur.trim());
            cur = '';
            continue;
        }
        if ((ch === '&' || ch === '|') && raw[i + 1] === ch) {
            if (cur.trim()) parts.push(cur.trim());
            cur = '';
            i++;
            continue;
        }
        if (ch === '|') {
            if (cur.trim()) parts.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
}

function isGitPushCommandLine(rawCmdLine) {
    if (typeof rawCmdLine !== 'string' || !rawCmdLine.trim()) return false;
    const bounded = rawCmdLine.length > 8192 ? rawCmdLine.slice(0, 8192) : rawCmdLine;
    const subCmds = splitShellSubCommands(bounded);
    for (let i = 0; i < subCmds.length; i++) {
        const sub = subCmds[i];
        if (DRY_RUN_FLAG_RE.test(sub)) continue;
        if (GIT_PUSH_CMD_RE.test(sub)) return true;
        if (GH_REPO_CREATE_RE.test(sub) && PUSH_FLAG_RE.test(sub)) return true;
    }
    return false;
}

function resolveBrainDir() {
    if (process.env.AGY_BRAIN_DIR) return process.env.AGY_BRAIN_DIR;
    return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
}

function resolveSafeTranscriptPath(cid) {
    if (!UUID_RE.test(cid)) return null;
    const brainDir = resolveBrainDir();
    let realBrain;
    try {
        realBrain = fs.realpathSync(brainDir);
    } catch (_) {
        return null;
    }
    const candidate = path.join(realBrain, cid, '.system_generated', 'logs', 'transcript.jsonl');
    let realFile;
    try {
        realFile = fs.realpathSync(candidate);
    } catch (_) {
        return null;
    }
    const rel = path.relative(realBrain, realFile);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        return null;
    }
    return realFile;
}

function isDynamicCidAlias(cid) {
    return cid === 'latest' || cid === 'active';
}

function isKnownOrDetectedSubagentTranscript(realBrain, candidateCid, transcriptPath) {
    if (childSubagentTrackers.has(candidateCid)) return true;
    for (const pTrk of conversationTrackers.values()) {
        if (pTrk.subagentsMap.has(candidateCid) || pTrk.knownSubagents.has(candidateCid)) {
            return true;
        }
    }
    let fd = -1;
    try {
        fd = fs.openSync(transcriptPath, 'r');
        const buf = Buffer.allocUnsafe(8192);
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        if (bytesRead <= 0) return false;
        const headText = stripBom(buf.subarray(0, bytesRead).toString('utf8')).trimStart();
        if (!headText) return false;
        const nlIdx = headText.indexOf('\n');
        const firstChunk = nlIdx >= 0 ? headText.slice(0, nlIdx).trim() : headText;
        if (nlIdx >= 0 && firstChunk.startsWith('{')) {
            try {
                const firstStep = JSON.parse(firstChunk);
                if (firstStep && typeof firstStep === 'object') {
                    const t = String(firstStep.type || '');
                    const src = String(firstStep.source || '');
                    if (t === 'USER_INPUT' || t === 'CHECKPOINT') return false;
                    if (t === 'SYSTEM_MESSAGE' && (src === 'SYSTEM' || src === 'SYSTEM_SDK')) {
                        return true;
                    }
                    if (src === 'SYSTEM_SDK') return true;
                }
            } catch (_) {}
        } else {
            if (/"type"\s*:\s*"(?:USER_INPUT|CHECKPOINT)"/.test(firstChunk)) return false;
            if (/"source"\s*:\s*"SYSTEM_SDK"/.test(firstChunk)) return true;
            if (
                /"type"\s*:\s*"SYSTEM_MESSAGE"/.test(firstChunk) &&
                /"source"\s*:\s*"SYSTEM"/.test(firstChunk)
            ) {
                return true;
            }
        }
    } catch (_) {
        return false;
    } finally {
        if (fd !== -1) {
            try {
                fs.closeSync(fd);
            } catch (_) {}
        }
    }
    return false;
}

function resolveLatestConversationId() {
    const now = Date.now();
    if (now < latestCidCache.expiresAt) {
        return latestCidCache.cid;
    }

    let bestCid = null;
    try {
        const realBrain = fs.realpathSync(resolveBrainDir());
        const entries = fs.readdirSync(realBrain, { withFileTypes: true });
        const candidates = [];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (!entry || !entry.isDirectory()) continue;
            const candidateCid = String(entry.name || '').trim().toLowerCase();
            if (!UUID_RE.test(candidateCid)) continue;
            const transcriptPath = path.join(realBrain, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
            try {
                const st = fs.statSync(transcriptPath);
                if (st.isFile()) {
                    candidates.push({ cid: candidateCid, transcriptPath, mtimeMs: st.mtimeMs });
                }
            } catch (_) {}
        }
        candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (isKnownOrDetectedSubagentTranscript(realBrain, c.cid, c.transcriptPath)) {
                continue;
            }
            bestCid = c.cid;
            break;
        }
    } catch (_) {}

    if (bestCid && !resolveSafeTranscriptPath(bestCid)) {
        bestCid = null;
    }

    latestCidCache = {
        cid: bestCid,
        expiresAt: now + LATEST_CID_CACHE_TTL_MS,
    };
    return bestCid;
}

function extractCommandExitCode(stepType, contentStr) {
    if (stepType !== 'GENERIC' && stepType !== 'SYSTEM_MESSAGE') return null;
    if (typeof contentStr !== 'string' || !contentStr) return null;
    if (READ_FILE_OUTPUT_PREFIX_RE.test(contentStr)) return null;
    const headerSection = contentStr.split(/\r?\nCommand output:/)[0];
    const m = /(?:^|\r?\n)Command exited with code (\d+)\b/.exec(headerSection);
    if (!m) return null;
    const code = parseInt(m[1], 10);
    return Number.isFinite(code) ? code : null;
}

function sanitizeDisplayLabel(raw, maxLen = 90) {
    if (typeof raw !== 'string') return '';
    let s = raw.trim();
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
        try {
            const inner = JSON.parse(s);
            if (typeof inner === 'string') s = inner;
        } catch (_) {
            s = s.slice(1, -1);
        }
    }
    return s.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function decodeJsonEncodedArgValue(val) {
    if (typeof val !== 'string') return val;
    const s = val.trim();
    if (!s) return val;
    const c0 = s[0];
    if (
        (c0 === '"' && s.length >= 2 && s.endsWith('"')) ||
        (c0 === '{' && s.endsWith('}')) ||
        (c0 === '[' && s.endsWith(']')) ||
        s === 'true' ||
        s === 'false' ||
        /^-?\d+(?:\.\d+)?$/.test(s)
    ) {
        try {
            return JSON.parse(s);
        } catch (_) {
            return val;
        }
    }
    return val;
}

function parseToolArgs(tc) {
    if (!tc || typeof tc !== 'object') return {};
    const raw = tc.args !== undefined ? tc.args : tc.arguments;
    if (!raw) return {};
    let base = null;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        base = raw;
    } else if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                base = parsed;
            }
        } catch (_) {
            return {};
        }
    }
    if (!base) return {};
    const out = Object.create(null);
    const keys = Object.keys(base);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        out[k] = decodeJsonEncodedArgValue(base[k]);
    }
    return out;
}

function touchLruMap(map, key, value, maxEntries) {
    if (map.has(key)) {
        map.delete(key);
    } else if (map.size >= maxEntries) {
        const oldestKey = map.keys().next().value;
        if (oldestKey !== undefined) map.delete(oldestKey);
    }
    map.set(key, value);
}

function createParentTracker(cid) {
    return {
        cid,
        rev: 0,
        initialized: false,
        byteOffset: 0,
        lastSeenSize: -1,
        lastMtimeMs: -1,
        remainder: '',
        decoder: new StringDecoder('utf8'),
        oversizeScan: null,

        inputTokens: 0,
        cacheReadTokens: 0,
        contextTokens: 0,
        prevTurnContextTokens: 0,
        awaitingPostCheckpointBaseline: false,
        outputTokens: 0,
        turnOutputTokens: 0,
        lastStepInFlightEst: 0,
        turnCount: 0,
        turnSteps: 0,
        stepCount: 0,
        latestStepIndex: 0,
        latestStatus: 'IDLE',
        lastStepType: '',
        modelName: '',
        isWorking: false,
        turnFinishedSeq: 0,

        crisisState: false,
        justSlashedBug: false,
        slashSeq: 0,
        slashReason: '',
        pendingGitPushCount: 0,
        pendingCommandQueue: [],

        pendingSubagentQueue: [],
        subagentsMap: new Map(),
        recentCompletedSubagents: [],
        knownSubagents: new Map(),
        workStateItems: [],
        workflowSeq: 0,
    };
}

function createChildTracker(cid) {
    return {
        cid,
        byteOffset: 0,
        lastSeenSize: -1,
        lastMtimeMs: -1,
        remainder: '',
        decoder: new StringDecoder('utf8'),
        oversizeScan: null,
        stepCount: 0,
        lastTool: '',
        lastStepType: '',
        lastStepStatus: '',
        lastHasToolCalls: false,
        revivedAtMs: 0,
    };
}

function resetParentTrackerState(tracker) {
    const fresh = createParentTracker(tracker.cid);
    Object.assign(tracker, fresh);
}

const OVERSIZE_SCALAR_NUM_KEYS = new Set(['step_index', 'input_tokens', 'cache_read_tokens', 'output_tokens']);
const OVERSIZE_TC_ARG_LIMITS = Object.freeze(
    Object.assign(Object.create(null), {
        commandline: 2048,
        role: 180,
        typename: 80,
        recipient: 80,
        toolsummary: 180,
        description: 180,
        action: 32,
        name: 64,
        brief: 180,
        title: 120,
        toolname: 64,
        task: 180,
        status: 32,
    })
);

function createTinyArgsScanner() {
    return {
        depth: 0,
        inString: false,
        escaped: false,
        unicodeRemain: 0,
        unicodeBuf: '',
        expectKey: true,
        curKey: '',
        strRole: '',
        strBuf: '',
        maxStrLen: 0,
        captured: {},
    };
}

function commitTinyArgValue(sub, rawVal) {
    if (!sub.curKey) return;
    const lk = sub.curKey.toLowerCase();
    if (lk in OVERSIZE_TC_ARG_LIMITS && sub.captured[lk] === undefined) {
        sub.captured[lk] = rawVal;
    }
}

function feedTinyArgsChar(sub, ch) {
    if (sub.inString) {
        if (sub.unicodeRemain > 0) {
            sub.unicodeBuf += ch;
            sub.unicodeRemain--;
            if (sub.unicodeRemain === 0) {
                const code = parseInt(sub.unicodeBuf, 16);
                const decoded = Number.isFinite(code) ? String.fromCharCode(code) : '';
                sub.unicodeBuf = '';
                if (decoded && sub.strRole !== 'skip' && sub.strBuf.length < sub.maxStrLen) {
                    sub.strBuf += decoded;
                }
            }
            return;
        }
        if (sub.escaped) {
            sub.escaped = false;
            if (ch === 'u') {
                sub.unicodeRemain = 4;
                sub.unicodeBuf = '';
                return;
            }
            let outCh = ch;
            if (ch === 'n') outCh = '\n';
            else if (ch === 'r') outCh = '\r';
            else if (ch === 't') outCh = '\t';
            else if (ch === 'b') outCh = '\b';
            else if (ch === 'f') outCh = '\f';
            if (sub.strRole !== 'skip' && sub.strBuf.length < sub.maxStrLen) {
                sub.strBuf += outCh;
            }
            return;
        }
        if (ch === '\\') {
            sub.escaped = true;
            return;
        }
        if (ch === '"') {
            if (sub.strRole === 'key') {
                sub.curKey = sub.strBuf;
            } else if (sub.strRole === 'val') {
                commitTinyArgValue(sub, sub.strBuf);
            }
            sub.inString = false;
            sub.strRole = '';
            sub.strBuf = '';
            return;
        }
        if (sub.strRole !== 'skip' && sub.strBuf.length < sub.maxStrLen) {
            sub.strBuf += ch;
        }
        return;
    }

    if (ch === '"') {
        sub.inString = true;
        sub.strBuf = '';
        if (sub.depth === 1 && sub.expectKey) {
            sub.strRole = 'key';
            sub.maxStrLen = 64;
        } else if (sub.depth === 1 && !sub.expectKey) {
            const lk = sub.curKey.toLowerCase();
            const lim = OVERSIZE_TC_ARG_LIMITS[lk];
            if (lim) {
                sub.strRole = 'val';
                sub.maxStrLen = lim;
            } else {
                sub.strRole = 'skip';
                sub.maxStrLen = 0;
            }
        } else {
            sub.strRole = 'skip';
            sub.maxStrLen = 0;
        }
        return;
    }

    if (ch === '{' || ch === '[') {
        sub.depth++;
        if (sub.depth === 1) {
            sub.expectKey = ch === '{';
            sub.curKey = '';
        }
        return;
    }
    if (ch === '}' || ch === ']') {
        if (sub.depth > 0) sub.depth--;
        return;
    }
    if (sub.depth === 1) {
        if (ch === ':') sub.expectKey = false;
        else if (ch === ',') {
            sub.expectKey = true;
            sub.curKey = '';
        }
    }
}

function createOversizeScanner(childMode = false) {
    return {
        childMode: Boolean(childMode),
        depth: 0,
        containerStack: [],
        expectKeyStack: [],
        curKeyStack: [],
        inString: false,
        escaped: false,
        unicodeRemain: 0,
        unicodeBuf: '',
        strRole: '',
        strBuf: '',
        maxStrLen: 0,
        tcArgTargetKey: '',
        readingNum: false,
        numKey: '',
        numBuf: '',

        contentHead: '',
        contentCharsRead: 0,
        contentLineBuf: '',
        contentTail: '',
        awaitingChildCidRemain: 0,
        senderFlushCounter: 0,

        curTc: null,
        tcArgsScanner: null,

        isReadFileHeader: false,
        seenCommandOutputMarker: false,
        stepIndex: null,
        stepType: '',
        stepStatus: '',
        modelName: '',
        inTok: 0,
        cacheTok: 0,
        outTok: 0,
        hasToolCalls: false,
        nonZeroExit: false,
        zeroExit: false,
        hasGitPush: false,
        invokedSubagents: [],
        swarmCalls: [],
        workflowCalls: [],
        workStateCalls: [],
        sendMessageRecipients: [],
        createdChildCids: [],
        senderCids: [],
        lastTool: '',
    };
}

function flushContentLine(scan) {
    const line = scan.contentLineBuf;
    scan.contentLineBuf = '';
    if (!line || scan.seenCommandOutputMarker || scan.isReadFileHeader) return;
    if (/^Command output:/i.test(line)) {
        scan.seenCommandOutputMarker = true;
        return;
    }
    const m = /^Command exited with code (\d+)\b/.exec(line);
    if (m) {
        const code = parseInt(m[1], 10);
        if (code === 0) scan.zeroExit = true;
        else if (code > 0) scan.nonZeroExit = true;
    }
}

function flushContentSenders(scan, finalFlush = false) {
    if (!scan.contentTail) return;
    const senderRe = /sender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    let sm;
    while ((sm = senderRe.exec(scan.contentTail)) !== null) {
        const scid = sm[1].toLowerCase();
        if (!scan.senderCids.includes(scid)) scan.senderCids.push(scid);
    }
    if (!finalFlush) {
        const keepLen = scan.awaitingChildCidRemain > 0 ? 1024 : 64;
        if (scan.contentTail.length > keepLen * 2) {
            scan.contentTail = scan.contentTail.slice(-keepLen);
        }
    }
}

function feedContentDecodedChar(scan, outCh) {
    if (scan.contentCharsRead < 512) {
        scan.contentHead += outCh;
        scan.contentCharsRead++;
        if (scan.contentCharsRead === 512 && READ_FILE_OUTPUT_PREFIX_RE.test(scan.contentHead)) {
            scan.isReadFileHeader = true;
        }
    }

    if (!scan.seenCommandOutputMarker && !scan.isReadFileHeader) {
        if (outCh === '\n') {
            flushContentLine(scan);
        } else if (outCh !== '\r' && scan.contentLineBuf.length < 512) {
            scan.contentLineBuf += outCh;
        }
    }

    scan.contentTail += outCh;
    scan.senderFlushCounter++;

    if (scan.createdChildCids.length < 16) {
        if (scan.awaitingChildCidRemain > 0) {
            scan.awaitingChildCidRemain--;
            if (outCh === '"' || outCh === '}' || scan.awaitingChildCidRemain === 0) {
                const cidMatch = scan.contentTail.match(
                    /"conversationId"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i
                );
                if (cidMatch) {
                    const foundCid = cidMatch[1].toLowerCase();
                    if (!scan.createdChildCids.includes(foundCid)) {
                        scan.createdChildCids.push(foundCid);
                    }
                    scan.contentTail = '';
                    scan.awaitingChildCidRemain = 0;
                }
            }
        } else if (scan.contentTail.endsWith('Created the following subagent')) {
            scan.awaitingChildCidRemain = 2048;
        }
    }

    if (scan.senderFlushCounter >= 1024) {
        scan.senderFlushCounter = 0;
        flushContentSenders(scan, false);
    }
}

function finalizeCurrentToolCall(scan) {
    const tc = scan.curTc;
    scan.curTc = null;
    if (!tc) return;

    if (scan.childMode) {
        const label = sanitizeDisplayLabel(
            String(tc.toolSummary || tc.description || tc.role || tc.name || ''),
            90
        );
        if (label) scan.lastTool = label;
        return;
    }

    if (tc.name === 'run_command') {
        if (tc.commandLine && isGitPushCommandLine(tc.commandLine)) {
            scan.hasGitPush = true;
        }
    } else if (tc.name === 'invoke_subagent') {
        const role = sanitizeDisplayLabel(tc.role || 'Subagent', 90) || 'Subagent';
        const typeName = sanitizeDisplayLabel(tc.typeName || 'self', 40) || 'self';
        if (scan.invokedSubagents.length < 8) {
            scan.invokedSubagents.push({ role, typeName });
        }
    } else if (tc.name === 'send_message') {
        const recipient = sanitizeDisplayLabel(tc.recipient || '', 64).toLowerCase();
        if (UUID_RE.test(recipient) && scan.sendMessageRecipients.length < 16) {
            scan.sendMessageRecipients.push(recipient);
        }
    } else if (tc.name === 'swarm') {
        const action = sanitizeDisplayLabel(tc.action || '', 24).toLowerCase();
        if ((action === 'add' || action === 'kill') && scan.swarmCalls.length < 8) {
            scan.swarmCalls.push({
                action,
                name: sanitizeDisplayLabel(tc.name || 'worker', 48),
                brief: sanitizeDisplayLabel(tc.brief || tc.title || 'Swarm Worker', 90),
            });
        }
    } else if (tc.name === 'run_workflow') {
        if (scan.workflowCalls.length < 4) {
            scan.workflowCalls.push({
                description: sanitizeDisplayLabel(tc.description || tc.toolSummary || 'Python Workflow', 90),
            });
        }
    } else if (
        (tc.name === 'call_mcp_tool' && sanitizeDisplayLabel(tc.toolName || '', 64).toLowerCase() === 'work_state_write') ||
        String(tc.name || '').toLowerCase().endsWith('work_state_write')
    ) {
        if (tc.task && scan.workStateCalls.length < 12) {
            scan.workStateCalls.push({
                task: sanitizeDisplayLabel(tc.task, 120),
                status: sanitizeDisplayLabel(tc.status || 'doing', 20).toLowerCase(),
            });
        }
    }
}

function assignTcArgField(tc, keyLower, val) {
    if (!tc) return;
    if (keyLower === 'commandline' && !tc.commandLine) tc.commandLine = val;
    else if (keyLower === 'role' && !tc.role) tc.role = val;
    else if (keyLower === 'typename' && !tc.typeName) tc.typeName = val;
    else if (keyLower === 'recipient' && !tc.recipient) tc.recipient = val;
    else if (keyLower === 'toolsummary' && !tc.toolSummary) tc.toolSummary = val;
    else if (keyLower === 'description' && !tc.description) tc.description = val;
    else if (keyLower === 'action' && !tc.action) tc.action = val;
    else if (keyLower === 'name' && !tc.name) tc.name = val;
    else if (keyLower === 'brief' && !tc.brief) tc.brief = val;
    else if (keyLower === 'title' && !tc.title) tc.title = val;
    else if (keyLower === 'toolname' && !tc.toolName) tc.toolName = val;
    else if (keyLower === 'task' && !tc.task) tc.task = val;
    else if (keyLower === 'status' && !tc.status) tc.status = val;
}

function commitTopLevelNumber(scan) {
    if (!scan.readingNum) return;
    const raw = scan.numBuf;
    const key = scan.numKey;
    scan.readingNum = false;
    scan.numKey = '';
    scan.numBuf = '';
    if (!raw || raw === '-') return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    if (key === 'step_index') scan.stepIndex = n;
    else if (key === 'input_tokens') scan.inTok = n || scan.inTok;
    else if (key === 'cache_read_tokens') scan.cacheTok = n || scan.cacheTok;
    else if (key === 'output_tokens') scan.outTok = n || scan.outTok;
}

function feedOversizeChunk(scan, textChunk, isFinalChunk = false) {
    const chunk = textChunk || '';
    for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];

        if (scan.inString) {
            if (scan.unicodeRemain > 0) {
                scan.unicodeBuf += ch;
                scan.unicodeRemain--;
                if (scan.unicodeRemain === 0) {
                    const code = parseInt(scan.unicodeBuf, 16);
                    const decoded = Number.isFinite(code) ? String.fromCharCode(code) : '';
                    scan.unicodeBuf = '';
                    if (decoded) {
                        if (scan.strRole === 'content') {
                            feedContentDecodedChar(scan, decoded);
                        } else if (scan.strRole === 'tc_arguments' && scan.tcArgsScanner) {
                            feedTinyArgsChar(scan.tcArgsScanner, decoded);
                        } else if (scan.strRole !== 'skip' && scan.strBuf.length < scan.maxStrLen) {
                            scan.strBuf += decoded;
                        }
                    }
                }
                continue;
            }
            if (scan.escaped) {
                scan.escaped = false;
                if (ch === 'u') {
                    scan.unicodeRemain = 4;
                    scan.unicodeBuf = '';
                    continue;
                }
                let outCh = ch;
                if (ch === 'n') outCh = '\n';
                else if (ch === 'r') outCh = '\r';
                else if (ch === 't') outCh = '\t';
                else if (ch === 'b') outCh = '\b';
                else if (ch === 'f') outCh = '\f';

                if (scan.strRole === 'content') {
                    feedContentDecodedChar(scan, outCh);
                } else if (scan.strRole === 'tc_arguments' && scan.tcArgsScanner) {
                    feedTinyArgsChar(scan.tcArgsScanner, outCh);
                } else if (scan.strRole !== 'skip' && scan.strBuf.length < scan.maxStrLen) {
                    scan.strBuf += outCh;
                }
                continue;
            }
            if (ch === '\\') {
                scan.escaped = true;
                continue;
            }
            if (ch === '"') {
                if (scan.strRole === 'key') {
                    scan.curKeyStack[scan.depth] = scan.strBuf;
                } else if (scan.strRole === 'top_scalar') {
                    const k1 = scan.curKeyStack[1];
                    if (k1 === 'type' && !scan.stepType) scan.stepType = scan.strBuf;
                    else if (k1 === 'status' && !scan.stepStatus) scan.stepStatus = scan.strBuf;
                    else if (k1 === 'model' && !scan.modelName && scan.strBuf) scan.modelName = scan.strBuf;
                } else if (scan.strRole === 'content') {
                    if (!scan.isReadFileHeader && scan.contentHead && READ_FILE_OUTPUT_PREFIX_RE.test(scan.contentHead)) {
                        scan.isReadFileHeader = true;
                    }
                    flushContentLine(scan);
                    if (scan.createdChildCids.length < 16 && scan.awaitingChildCidRemain > 0) {
                        const cidMatch = scan.contentTail.match(
                            /"conversationId"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i
                        );
                        if (cidMatch) {
                            const foundCid = cidMatch[1].toLowerCase();
                            if (!scan.createdChildCids.includes(foundCid)) {
                                scan.createdChildCids.push(foundCid);
                            }
                        }
                        scan.awaitingChildCidRemain = 0;
                    }
                    flushContentSenders(scan, true);
                } else if (scan.strRole === 'tc_name') {
                    if (scan.curTc) scan.curTc.name = scan.strBuf;
                } else if (scan.strRole === 'tc_arg_val') {
                    assignTcArgField(scan.curTc, scan.tcArgTargetKey, scan.strBuf);
                } else if (scan.strRole === 'tc_arguments' && scan.tcArgsScanner) {
                    if (scan.curTc) {
                        for (const [k, v] of Object.entries(scan.tcArgsScanner.captured)) {
                            assignTcArgField(scan.curTc, k, v);
                        }
                    }
                    scan.tcArgsScanner = null;
                }
                scan.inString = false;
                scan.strRole = '';
                scan.strBuf = '';
                scan.tcArgTargetKey = '';
                continue;
            }

            if (scan.strRole === 'content') {
                feedContentDecodedChar(scan, ch);
            } else if (scan.strRole === 'tc_arguments' && scan.tcArgsScanner) {
                feedTinyArgsChar(scan.tcArgsScanner, ch);
            } else if (scan.strRole !== 'skip' && scan.strBuf.length < scan.maxStrLen) {
                scan.strBuf += ch;
            }
            continue;
        }

        if (scan.readingNum) {
            if (ch >= '0' && ch <= '9') {
                if (scan.numBuf.length < 24) scan.numBuf += ch;
                continue;
            }
            commitTopLevelNumber(scan);
        }

        if (ch === '"') {
            scan.inString = true;
            scan.strBuf = '';
            const d = scan.depth;
            if (scan.containerStack[d] === '{' && scan.expectKeyStack[d]) {
                scan.strRole = 'key';
                scan.maxStrLen = 96;
            } else if (d === 1 && !scan.expectKeyStack[1]) {
                const k1 = scan.curKeyStack[1];
                if (k1 === 'type' || k1 === 'status') {
                    scan.strRole = 'top_scalar';
                    scan.maxStrLen = 64;
                } else if (k1 === 'model' && !scan.childMode) {
                    scan.strRole = 'top_scalar';
                    scan.maxStrLen = 256;
                } else if (k1 === 'content' && !scan.childMode) {
                    scan.strRole = 'content';
                    scan.maxStrLen = 0;
                } else {
                    scan.strRole = 'skip';
                    scan.maxStrLen = 0;
                }
            } else if (scan.curKeyStack[1] === 'tool_calls') {
                if (d === 3 && !scan.expectKeyStack[3]) {
                    const k3 = scan.curKeyStack[3];
                    if (k3 === 'name') {
                        scan.strRole = 'tc_name';
                        scan.maxStrLen = 96;
                    } else if (k3 === 'arguments') {
                        scan.strRole = 'tc_arguments';
                        scan.tcArgsScanner = createTinyArgsScanner();
                        scan.maxStrLen = 0;
                    } else {
                        scan.strRole = 'skip';
                        scan.maxStrLen = 0;
                    }
                } else if (d === 4 && !scan.expectKeyStack[4] && (scan.curKeyStack[3] === 'args' || scan.curKeyStack[3] === 'arguments')) {
                    const lk4 = String(scan.curKeyStack[4] || '').toLowerCase();
                    const lim = OVERSIZE_TC_ARG_LIMITS[lk4];
                    if (lim) {
                        scan.strRole = 'tc_arg_val';
                        scan.tcArgTargetKey = lk4;
                        scan.maxStrLen = lim;
                    } else {
                        scan.strRole = 'skip';
                        scan.maxStrLen = 0;
                    }
                } else {
                    scan.strRole = 'skip';
                    scan.maxStrLen = 0;
                }
            } else {
                scan.strRole = 'skip';
                scan.maxStrLen = 0;
            }
            continue;
        }

        if (ch === '{' || ch === '[') {
            scan.depth++;
            const d = scan.depth;
            scan.containerStack[d] = ch;
            scan.expectKeyStack[d] = ch === '{';
            scan.curKeyStack[d] = '';
            if (d === 3 && ch === '{' && scan.curKeyStack[1] === 'tool_calls' && scan.containerStack[2] === '[') {
                scan.hasToolCalls = true;
                scan.curTc = {
                    name: '',
                    commandLine: '',
                    role: '',
                    typeName: '',
                    recipient: '',
                    toolSummary: '',
                    description: '',
                };
            }
            continue;
        }

        if (ch === '}' || ch === ']') {
            if (scan.depth === 3 && ch === '}' && scan.curTc) {
                finalizeCurrentToolCall(scan);
            }
            if (scan.depth > 0) {
                scan.containerStack[scan.depth] = '';
                scan.expectKeyStack[scan.depth] = false;
                scan.curKeyStack[scan.depth] = '';
                scan.depth--;
            }
            continue;
        }

        const d = scan.depth;
        if (d > 0 && scan.containerStack[d] === '{') {
            if (ch === ':') {
                scan.expectKeyStack[d] = false;
                continue;
            }
            if (ch === ',') {
                scan.expectKeyStack[d] = true;
                scan.curKeyStack[d] = '';
                continue;
            }
        }

        if (
            !scan.childMode &&
            d === 1 &&
            scan.containerStack[1] === '{' &&
            !scan.expectKeyStack[1] &&
            OVERSIZE_SCALAR_NUM_KEYS.has(scan.curKeyStack[1]) &&
            ((ch >= '0' && ch <= '9') || ch === '-')
        ) {
            scan.readingNum = true;
            scan.numKey = scan.curKeyStack[1];
            scan.numBuf = ch;
        }
    }

    if (isFinalChunk) {
        commitTopLevelNumber(scan);
        if (scan.curTc) finalizeCurrentToolCall(scan);
        if (scan.strRole === 'content') {
            if (!scan.isReadFileHeader && scan.contentHead && READ_FILE_OUTPUT_PREFIX_RE.test(scan.contentHead)) {
                scan.isReadFileHeader = true;
            }
            flushContentLine(scan);
            flushContentSenders(scan, true);
        }
    }
}

function recordCompletedSubagent(tracker, childCid, eventTimestampMs, isLiveDelta) {
    const entry = tracker.subagentsMap.get(childCid);
    if (!entry) return;
    entry.status = 'completed';
    const now = Date.now();
    const effectiveCompletedAt = isLiveDelta ? now : (eventTimestampMs || now);
    entry.completedAt = effectiveCompletedAt;
    touchLruMap(tracker.knownSubagents, childCid, { ...entry }, MAX_KNOWN_SUBAGENTS);
    tracker.subagentsMap.delete(childCid);

    tracker.recentCompletedSubagents = tracker.recentCompletedSubagents.filter((x) => x.cid !== childCid);
    if (now - effectiveCompletedAt <= COMPLETED_SUBAGENT_TTL_MS) {
        tracker.recentCompletedSubagents.push({ ...entry });
        if (tracker.recentCompletedSubagents.length > MAX_RECENT_COMPLETED_SUBAGENTS) {
            tracker.recentCompletedSubagents.splice(
                0,
                tracker.recentCompletedSubagents.length - MAX_RECENT_COMPLETED_SUBAGENTS
            );
        }
    }
}

function applyStepSignals(tracker, step, isLiveDelta) {
    tracker.stepCount++;
    if (typeof step.step_index === 'number') tracker.latestStepIndex = step.step_index;

    const stepType = typeof step.type === 'string' ? step.type : '';
    const stepStatus = typeof step.status === 'string' ? step.status : '';
    if (stepType) tracker.lastStepType = stepType;
    if (stepStatus) tracker.latestStatus = stepStatus;
    if (typeof step.model === 'string' && step.model) tracker.modelName = step.model;

    const stepTsMs = typeof step.created_at === 'string' ? (Date.parse(step.created_at) || 0) : 0;

    if (stepType === 'USER_INPUT') {
        tracker.turnCount++;
        if (!tracker.awaitingPostCheckpointBaseline && tracker.contextTokens > 0) {
            tracker.prevTurnContextTokens = tracker.contextTokens;
        }
        tracker.turnOutputTokens = 0;
        tracker.lastStepInFlightEst = 0;
        tracker.turnSteps = 0;
        tracker.crisisState = false;
        tracker.justSlashedBug = false;
        tracker.pendingGitPushCount = 0;
        tracker.pendingCommandQueue = [];
        tracker.pendingSubagentQueue = [];
    }

    const inTok = Number(step.input_tokens) || 0;
    const cTok = Number(step.cache_read_tokens) || 0;
    const outTok = Number(step.output_tokens) || 0;
    const ctxSum = inTok + cTok;

    if (stepType === 'CHECKPOINT') {
        if (ctxSum > 0) {
            tracker.inputTokens = inTok;
            tracker.cacheReadTokens = cTok;
            tracker.contextTokens = ctxSum;
            tracker.prevTurnContextTokens = ctxSum;
            tracker.awaitingPostCheckpointBaseline = false;
        } else {
            tracker.awaitingPostCheckpointBaseline = true;
        }
    } else if (ctxSum > 0) {
        if (
            tracker.prevTurnContextTokens === 0 ||
            tracker.awaitingPostCheckpointBaseline ||
            ctxSum < tracker.prevTurnContextTokens * 0.7
        ) {
            tracker.prevTurnContextTokens = ctxSum;
            tracker.awaitingPostCheckpointBaseline = false;
        }
        tracker.inputTokens = inTok;
        tracker.cacheReadTokens = cTok;
        tracker.contextTokens = ctxSum;
    }

    if (outTok > 0) {
        tracker.outputTokens += outTok;
        tracker.turnOutputTokens += outTok;
        tracker.lastStepInFlightEst = 0;
    } else if (stepType === 'PLANNER_RESPONSE') {
        const thinkChars = typeof step.thinking === 'string' ? step.thinking.length : 0;
        const contentChars = typeof step.content === 'string' ? step.content.length : 0;
        tracker.lastStepInFlightEst = Math.round((thinkChars + contentChars) / 3.7);
    }

    if (stepType === 'PLANNER_RESPONSE') {
        tracker.turnSteps++;
    }

    const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        if (!tc || typeof tc !== 'object') continue;
        const args = parseToolArgs(tc);
        if (tc.name === 'invoke_subagent') {
            const role = sanitizeDisplayLabel(String(args.Role || args.role || 'Subagent'), 90) || 'Subagent';
            const typeName = sanitizeDisplayLabel(String(args.TypeName || args.typeName || 'self'), 40) || 'self';
            tracker.pendingSubagentQueue.push({
                role,
                typeName,
                startedAt: stepTsMs || Date.now(),
            });
            if (tracker.pendingSubagentQueue.length > 16) {
                tracker.pendingSubagentQueue.shift();
            }
        } else if (tc.name === 'send_message') {
            const recipient = sanitizeDisplayLabel(String(args.Recipient || args.recipient || ''), 64).toLowerCase();
            if (UUID_RE.test(recipient) && recipient !== tracker.cid) {
                const prevCompletedIdx = tracker.recentCompletedSubagents.findIndex((s) => s.cid === recipient);
                if (prevCompletedIdx >= 0) {
                    const revived = tracker.recentCompletedSubagents.splice(prevCompletedIdx, 1)[0];
                    revived.status = 'working';
                    revived.completedAt = 0;
                    tracker.subagentsMap.set(recipient, revived);
                    touchLruMap(tracker.knownSubagents, recipient, { ...revived }, MAX_KNOWN_SUBAGENTS);
                } else if (tracker.subagentsMap.has(recipient)) {
                    const existing = tracker.subagentsMap.get(recipient);
                    existing.status = 'working';
                    existing.completedAt = 0;
                    touchLruMap(tracker.knownSubagents, recipient, { ...existing }, MAX_KNOWN_SUBAGENTS);
                } else if (tracker.knownSubagents.has(recipient)) {
                    const known = tracker.knownSubagents.get(recipient);
                    const revived = {
                        ...known,
                        status: 'working',
                        completedAt: 0,
                    };
                    tracker.subagentsMap.set(recipient, revived);
                    touchLruMap(tracker.knownSubagents, recipient, { ...revived }, MAX_KNOWN_SUBAGENTS);
                }
                let cTrk = childSubagentTrackers.get(recipient);
                if (!cTrk) {
                    cTrk = createChildTracker(recipient);
                    touchLruMap(childSubagentTrackers, recipient, cTrk, MAX_TRACKED_CHILDREN);
                }
                const reviveMs = isLiveDelta ? Math.max(stepTsMs || 0, Date.now()) : (stepTsMs || Date.now());
                cTrk.revivedAtMs = reviveMs;
                cTrk.lastStepStatus = 'WORKING';
            }
        } else if (tc.name === 'manage_subagents') {
            const act = sanitizeDisplayLabel(String(args.Action || args.action || ''), 32).toLowerCase();
            if (act === 'kill_all') {
                for (const key of Array.from(tracker.subagentsMap.keys())) {
                    if (UUID_RE.test(key)) {
                        recordCompletedSubagent(tracker, key, stepTsMs, isLiveDelta);
                    }
                }
            } else if (act === 'kill') {
                const rawIds = args.ConversationIds || args.conversationIds;
                if (Array.isArray(rawIds)) {
                    for (let k = 0; k < rawIds.length; k++) {
                        const targetCid = sanitizeDisplayLabel(String(rawIds[k] || ''), 64).toLowerCase();
                        if (UUID_RE.test(targetCid)) {
                            recordCompletedSubagent(tracker, targetCid, stepTsMs, isLiveDelta);
                        }
                    }
                }
            }
        } else if (tc.name === 'run_command') {
            const rawCmdLine = String(args.CommandLine || args.commandLine || '');
            const isGitPush = isGitPushCommandLine(rawCmdLine);
            const callId = typeof tc.id === 'string' ? tc.id : '';
            tracker.pendingCommandQueue.push({ id: callId, isGitPush });
            if (tracker.pendingCommandQueue.length > 32) {
                tracker.pendingCommandQueue.shift();
            }
            tracker.pendingGitPushCount = tracker.pendingCommandQueue.reduce(
                (acc, item) => acc + (item.isGitPush ? 1 : 0),
                0
            );
        } else if (tc.name === 'swarm') {
            const action = sanitizeDisplayLabel(String(args.action || ''), 32).toLowerCase();
            const rawName = sanitizeDisplayLabel(String(args.name || 'worker'), 32)
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '') || 'worker';
            if (action === 'add') {
                const brief = sanitizeDisplayLabel(String(args.brief || args.title || 'Swarm Worker'), 90) || 'Swarm Worker';
                const taskList = Array.isArray(args.tasks) ? args.tasks : [];
                const copies = taskList.length > 0
                    ? Math.min(6, taskList.length)
                    : Math.min(6, Math.max(1, parseInt(args.n, 10) || 1));
                for (let k = 0; k < copies; k++) {
                    const rosterId = copies > 1 || taskList.length > 0 ? `${rawName}-${k + 1}` : rawName;
                    const swarmCid = `swarm:${tracker.cid}:${rosterId}`;
                    const sliceDesc = taskList[k] ? sanitizeDisplayLabel(String(taskList[k]), 56) : '';
                    const roleLabel = sliceDesc
                        ? `[Swarm ${rosterId}] ${sliceDesc}`
                        : `[Swarm ${rosterId}] ${brief}`;
                    tracker.recentCompletedSubagents = tracker.recentCompletedSubagents.filter((x) => x.cid !== swarmCid);
                    const subEntry = {
                        cid: swarmCid,
                        role: roleLabel.slice(0, 90),
                        typeName: 'swarm',
                        status: 'working',
                        stepCount: 1,
                        lastTool: brief,
                        startedAt: stepTsMs || Date.now(),
                        completedAt: 0,
                    };
                    tracker.subagentsMap.set(swarmCid, subEntry);
                    touchLruMap(tracker.knownSubagents, swarmCid, { ...subEntry }, MAX_KNOWN_SUBAGENTS);
                }
            } else if (action === 'kill') {
                const targetPrefix = `swarm:${tracker.cid}:${rawName}`;
                for (const key of Array.from(tracker.subagentsMap.keys())) {
                    if (key === targetPrefix || key.startsWith(`${targetPrefix}-`) || rawName === 'all') {
                        recordCompletedSubagent(tracker, key, stepTsMs, isLiveDelta);
                    }
                }
            }
        } else if (tc.name === 'run_workflow') {
            const wfDesc = sanitizeDisplayLabel(
                String(args.Description || args.description || args.ScriptPath || 'Python Workflow'),
                90
            ) || 'Python Workflow';
            const wfCid = `workflow:${tracker.cid}:${++tracker.workflowSeq}`;
            const wfEntry = {
                cid: wfCid,
                role: `[Workflow] ${wfDesc}`.slice(0, 90),
                typeName: 'workflow',
                status: 'working',
                stepCount: 1,
                lastTool: wfDesc,
                startedAt: stepTsMs || Date.now(),
                completedAt: 0,
            };
            tracker.subagentsMap.set(wfCid, wfEntry);
            touchLruMap(tracker.knownSubagents, wfCid, { ...wfEntry }, MAX_KNOWN_SUBAGENTS);
        } else if (
            (tc.name === 'call_mcp_tool' && String(args.ToolName || args.toolName || '').toLowerCase() === 'work_state_write') ||
            String(tc.name || '').toLowerCase().endsWith('work_state_write')
        ) {
            const innerArgs = (args.Arguments && typeof args.Arguments === 'object') ? args.Arguments : args;
            const fields = (innerArgs && innerArgs.fields && typeof innerArgs.fields === 'object') ? innerArgs.fields : innerArgs;
            const taskTitle = sanitizeDisplayLabel(String((fields && fields.task) || ''), 120);
            const rawSt = String((fields && fields.status) || 'doing').trim().toLowerCase();
            const normStatus = rawSt === 'done' || rawSt === 'todo' || rawSt === 'doing' ? rawSt : 'doing';
            if (taskTitle) {
                const existingIdx = tracker.workStateItems.findIndex((it) => it.task === taskTitle);
                const nextItem = {
                    task: taskTitle,
                    status: normStatus,
                    updatedAt: stepTsMs || Date.now(),
                };
                if (existingIdx >= 0) {
                    tracker.workStateItems[existingIdx] = nextItem;
                } else {
                    tracker.workStateItems.push(nextItem);
                    if (tracker.workStateItems.length > 12) {
                        tracker.workStateItems.shift();
                    }
                }
            }
        }
    }

    const contentStr = typeof step.content === 'string' ? step.content : '';

    if (contentStr.includes('Created the following subagent:')) {
        let searchFrom = 0;
        while (searchFrom < contentStr.length) {
            const subIdx = contentStr.indexOf('Created the following subagent:', searchFrom);
            if (subIdx === -1) break;
            const snippet = contentStr.slice(subIdx, subIdx + 1024);
            const m = snippet.match(/Created the following subagent:[\s\S]{0,600}?"conversationId"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i);
            if (m) {
                const childCid = m[1].toLowerCase();
                const meta = tracker.pendingSubagentQueue.shift() || {
                    role: 'Subagent',
                    typeName: 'self',
                    startedAt: stepTsMs || Date.now(),
                };
                tracker.recentCompletedSubagents = tracker.recentCompletedSubagents.filter((x) => x.cid !== childCid);
                const subEntry = {
                    cid: childCid,
                    role: meta.role,
                    typeName: meta.typeName,
                    status: 'working',
                    stepCount: 0,
                    lastTool: meta.role,
                    startedAt: meta.startedAt || Date.now(),
                    completedAt: 0,
                };
                tracker.subagentsMap.set(childCid, subEntry);
                touchLruMap(tracker.knownSubagents, childCid, { ...subEntry }, MAX_KNOWN_SUBAGENTS);
                searchFrom = subIdx + m[0].length;
            } else {
                searchFrom = subIdx + 31;
            }
        }
    }

    if (stepType === 'SYSTEM_MESSAGE' && contentStr.includes('sender=')) {
        const senderRe = /sender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
        let sm;
        while ((sm = senderRe.exec(contentStr)) !== null) {
            recordCompletedSubagent(tracker, sm[1].toLowerCase(), stepTsMs, isLiveDelta);
        }
    }

    const cmdExitCode = extractCommandExitCode(stepType, contentStr);
    const nonZeroExit = cmdExitCode !== null && cmdExitCode > 0;
    const zeroExit = cmdExitCode === 0;
    const isStepError = stepStatus === 'ERROR' || stepType === 'ERROR_MESSAGE';

    let matchedGitPush = false;
    const stepCallId = typeof step.tool_call_id === 'string' ? step.tool_call_id : '';
    if (cmdExitCode !== null) {
        let matchedIdx = -1;
        if (stepCallId) {
            matchedIdx = tracker.pendingCommandQueue.findIndex((c) => c.id === stepCallId);
        }
        if (matchedIdx < 0 && tracker.pendingCommandQueue.length > 0) {
            matchedIdx = 0;
        }
        if (matchedIdx >= 0) {
            const [cmdEntry] = tracker.pendingCommandQueue.splice(matchedIdx, 1);
            matchedGitPush = Boolean(cmdEntry && cmdEntry.isGitPush);
        } else if (tracker.pendingGitPushCount > 0) {
            matchedGitPush = true;
            tracker.pendingGitPushCount--;
        }
        if (tracker.pendingCommandQueue.length > 0 || matchedIdx >= 0) {
            tracker.pendingGitPushCount = tracker.pendingCommandQueue.reduce(
                (acc, item) => acc + (item.isGitPush ? 1 : 0),
                0
            );
        }
    } else if (
        stepType === 'GENERIC' &&
        stepCallId &&
        (stepStatus === 'CANCELED' ||
            stepStatus === 'ERROR' ||
            (contentStr && !/running in background|command is running/i.test(contentStr)))
    ) {
        const matchedIdx = tracker.pendingCommandQueue.findIndex((c) => c.id === stepCallId);
        if (matchedIdx >= 0) {
            tracker.pendingCommandQueue.splice(matchedIdx, 1);
            tracker.pendingGitPushCount = tracker.pendingCommandQueue.reduce(
                (acc, item) => acc + (item.isGitPush ? 1 : 0),
                0
            );
        }
    }

    if (nonZeroExit || isStepError) {
        tracker.crisisState = true;
        tracker.justSlashedBug = false;
    } else if (zeroExit) {
        if (matchedGitPush) {
            tracker.crisisState = false;
            if (isLiveDelta) {
                tracker.justSlashedBug = true;
                tracker.slashSeq++;
                tracker.slashReason = 'git_pushed';
            }
        } else if (tracker.crisisState === true) {
            tracker.crisisState = false;
            if (isLiveDelta) {
                tracker.justSlashedBug = true;
                tracker.slashSeq++;
                tracker.slashReason = 'bug_slashed';
            }
        }
    }

    const isPlannerIdleDone = stepType === 'PLANNER_RESPONSE' && stepStatus === 'DONE' && toolCalls.length === 0;
    const isCheckpointDone = stepType === 'CHECKPOINT' && stepStatus === 'DONE';
    const isTerminalStop =
        stepStatus === 'CANCELED' ||
        stepType === 'ERROR_MESSAGE' ||
        (stepStatus === 'ERROR' && stepType !== 'GENERIC');
    const nextIsWorking = !(isPlannerIdleDone || isCheckpointDone || isTerminalStop);

    if (isPlannerIdleDone && !isStepError) {
        tracker.crisisState = false;
        tracker.pendingGitPushCount = 0;
        tracker.pendingCommandQueue = [];
        tracker.pendingSubagentQueue = [];
    }

    if (tracker.isWorking && !nextIsWorking) {
        tracker.turnFinishedSeq++;
        for (const key of Array.from(tracker.subagentsMap.keys())) {
            if (key.startsWith('workflow:') || (isPlannerIdleDone && key.startsWith('swarm:'))) {
                recordCompletedSubagent(tracker, key, stepTsMs, isLiveDelta);
            }
        }
    }
    tracker.isWorking = nextIsWorking;
}

function applyOversizeScanSignals(tracker, scan, isLiveDelta) {
    const resolvedType = scan.stepType || tracker.lastStepType;
    const syntheticToolCalls = [];
    for (const sub of scan.invokedSubagents) {
        syntheticToolCalls.push({
            name: 'invoke_subagent',
            args: { Role: sub.role, TypeName: sub.typeName },
        });
    }
    for (const sw of scan.swarmCalls) {
        syntheticToolCalls.push({
            name: 'swarm',
            args: { action: sw.action, name: sw.name, brief: sw.brief },
        });
    }
    for (const wf of scan.workflowCalls) {
        syntheticToolCalls.push({
            name: 'run_workflow',
            args: { Description: wf.description },
        });
    }
    for (const ws of scan.workStateCalls) {
        syntheticToolCalls.push({
            name: 'call_mcp_tool',
            args: { ToolName: 'work_state_write', Arguments: { fields: { task: ws.task, status: ws.status } } },
        });
    }
    for (const rcid of scan.sendMessageRecipients) {
        syntheticToolCalls.push({
            name: 'send_message',
            args: { Recipient: rcid },
        });
    }
    if (scan.hasGitPush) {
        syntheticToolCalls.push({
            name: 'run_command',
            args: { CommandLine: 'git push' },
        });
    } else if (scan.hasToolCalls && syntheticToolCalls.length === 0) {
        syntheticToolCalls.push({ name: '_oversize_tool_call' });
    }

    const syntheticStep = {
        step_index: typeof scan.stepIndex === 'number' ? scan.stepIndex : tracker.latestStepIndex,
        type: resolvedType,
        status: scan.stepStatus || 'DONE',
        model: scan.modelName || '',
        input_tokens: scan.inTok,
        cache_read_tokens: scan.cacheTok,
        output_tokens: scan.outTok,
        tool_calls: syntheticToolCalls,
        content: '',
    };

    const contentParts = [];
    for (const ccid of scan.createdChildCids) {
        contentParts.push(`Created the following subagent: {"conversationId": "${ccid}"}`);
    }
    for (const scid of scan.senderCids) {
        contentParts.push(`sender=${scid}`);
    }
    if (!scan.isReadFileHeader && (resolvedType === 'GENERIC' || resolvedType === 'SYSTEM_MESSAGE')) {
        if (scan.nonZeroExit) contentParts.push('Command exited with code 1');
        else if (scan.zeroExit) contentParts.push('Command exited with code 0');
    }
    syntheticStep.content = contentParts.join('\n');

    applyStepSignals(tracker, syntheticStep, isLiveDelta);
}

function processParentLine(tracker, rawLine, isLiveDelta) {
    const trimmed = stripBom(rawLine).trim();
    if (!trimmed) return;

    if (trimmed.length > MAX_LINE_BYTES) {
        const scan = createOversizeScanner();
        feedOversizeChunk(scan, trimmed, true);
        applyOversizeScanSignals(tracker, scan, isLiveDelta);
        return;
    }

    try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj === 'object') {
            applyStepSignals(tracker, obj, isLiveDelta);
        }
    } catch (_) {
        // Ignore malformed line
    }
}

function advanceParentTracker(tracker, filePath, st) {
    if (st.size < tracker.byteOffset) {
        resetParentTrackerState(tracker);
        tracker.rev++;
    }
    if (st.size === tracker.byteOffset) {
        if (tracker.justSlashedBug) {
            tracker.justSlashedBug = false;
            tracker.rev++;
        }
        tracker.lastSeenSize = st.size;
        tracker.lastMtimeMs = st.mtimeMs;
        tracker.initialized = true;
        return;
    }

    const isLiveDelta = tracker.initialized;
    let fd = -1;
    let cycleClearedSlash = false;
    let bytesProcessed = 0;
    try {
        fd = fs.openSync(filePath, 'r');
        const buf = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, Math.max(1024, st.size - tracker.byteOffset)));
        let pos = tracker.byteOffset;

        while (pos < st.size) {
            const toRead = Math.min(buf.length, st.size - pos);
            const bytesRead = fs.readSync(fd, buf, 0, toRead, pos);
            if (bytesRead <= 0) {
                try {
                    const curSt = fs.fstatSync(fd);
                    if (curSt.size < tracker.byteOffset) {
                        resetParentTrackerState(tracker);
                        tracker.rev++;
                        return;
                    }
                } catch (_) {}
                break;
            }
            pos += bytesRead;
            bytesProcessed += bytesRead;

            if (!cycleClearedSlash) {
                tracker.justSlashedBug = false;
                cycleClearedSlash = true;
            }

            const decoded = tracker.decoder.write(buf.subarray(0, bytesRead));
            let cursor = 0;

            while (cursor < decoded.length) {
                const nlIdx = decoded.indexOf('\n', cursor);
                if (nlIdx === -1) {
                    const tail = decoded.slice(cursor);
                    if (tracker.oversizeScan) {
                        feedOversizeChunk(tracker.oversizeScan, tail, false);
                    } else if (tracker.remainder.length + tail.length > MAX_LINE_BYTES) {
                        tracker.oversizeScan = createOversizeScanner();
                        feedOversizeChunk(tracker.oversizeScan, tracker.remainder, false);
                        tracker.remainder = '';
                        feedOversizeChunk(tracker.oversizeScan, tail, false);
                    } else {
                        tracker.remainder += tail;
                    }
                    break;
                }

                const piece = decoded.slice(cursor, nlIdx);
                cursor = nlIdx + 1;

                if (tracker.oversizeScan) {
                    feedOversizeChunk(tracker.oversizeScan, piece, true);
                    applyOversizeScanSignals(tracker, tracker.oversizeScan, isLiveDelta);
                    tracker.oversizeScan = null;
                } else if (tracker.remainder.length + piece.length > MAX_LINE_BYTES) {
                    const scan = createOversizeScanner();
                    feedOversizeChunk(scan, tracker.remainder, false);
                    tracker.remainder = '';
                    feedOversizeChunk(scan, piece, true);
                    applyOversizeScanSignals(tracker, scan, isLiveDelta);
                } else {
                    const fullLine = tracker.remainder + piece;
                    tracker.remainder = '';
                    processParentLine(tracker, fullLine, isLiveDelta);
                }
            }

            tracker.byteOffset = pos;
        }

        tracker.byteOffset = pos;
        tracker.lastSeenSize = st.size;
        tracker.lastMtimeMs = st.mtimeMs;
        tracker.initialized = true;
        if (bytesProcessed > 0) {
            tracker.rev++;
        }
    } catch (_) {
        if (fd !== -1) {
            try {
                const curSt = fs.fstatSync(fd);
                if (curSt.size < tracker.byteOffset) {
                    resetParentTrackerState(tracker);
                    tracker.rev++;
                }
            } catch (__) {}
        }
    } finally {
        if (fd !== -1) {
            try {
                fs.closeSync(fd);
            } catch (_) {}
        }
    }
}

function createChildOversizeScanner() {
    return createOversizeScanner(true);
}

function feedChildOversizeChunk(scan, textChunk, isFinalChunk = false) {
    feedOversizeChunk(scan, textChunk, isFinalChunk);
}

function applyChildOversizeScan(childTracker, scan) {
    childTracker.stepCount++;
    if (scan.stepType) childTracker.lastStepType = scan.stepType;
    if (scan.stepStatus) childTracker.lastStepStatus = scan.stepStatus;
    childTracker.lastHasToolCalls = Boolean(scan.hasToolCalls);
    if (scan.lastTool) childTracker.lastTool = scan.lastTool;
}

function processChildLine(childTracker, rawLine) {
    const trimmed = stripBom(rawLine).trim();
    if (!trimmed) return;

    if (trimmed.length > MAX_LINE_BYTES) {
        const scan = createChildOversizeScanner();
        feedChildOversizeChunk(scan, trimmed, true);
        applyChildOversizeScan(childTracker, scan);
        return;
    }

    try {
        const step = JSON.parse(trimmed);
        if (!step || typeof step !== 'object') return;
        childTracker.stepCount++;
        if (typeof step.type === 'string' && step.type) childTracker.lastStepType = step.type;
        if (typeof step.status === 'string' && step.status) childTracker.lastStepStatus = step.status;
        const hasTools = Array.isArray(step.tool_calls) && step.tool_calls.length > 0;
        childTracker.lastHasToolCalls = hasTools;
        if (hasTools) {
            const lastTc = step.tool_calls[step.tool_calls.length - 1];
            if (lastTc && typeof lastTc === 'object') {
                const args = parseToolArgs(lastTc);
                const summary = sanitizeDisplayLabel(
                    String(args.toolSummary || args.Description || args.Role || lastTc.name || ''),
                    90
                );
                if (summary) childTracker.lastTool = summary;
            }
        }
    } catch (_) {}
}

function isChildTrackerIdleCompleted(cTracker, mtimeMs, nowMs) {
    if (!cTracker) return false;
    if (cTracker.revivedAtMs > 0 && mtimeMs <= cTracker.revivedAtMs) {
        if (nowMs - cTracker.revivedAtMs < REVIVE_GRACE_MS) {
            return false;
        }
    }
    if (cTracker.lastStepType === 'ERROR_MESSAGE' || cTracker.lastStepStatus === 'CANCELED') {
        return true;
    }
    if (
        cTracker.lastStepType === 'PLANNER_RESPONSE' &&
        cTracker.lastStepStatus === 'DONE' &&
        !cTracker.lastHasToolCalls &&
        nowMs - (mtimeMs || 0) >= SUBAGENT_IDLE_COMPLETE_MS
    ) {
        return true;
    }
    return false;
}

function syncChildSubagentMetrics(parentTracker, childCid, parentEntry) {
    const childPath = resolveSafeTranscriptPath(childCid);
    if (!childPath) return false;

    let st;
    try {
        st = fs.statSync(childPath);
        if (!st.isFile()) return false;
    } catch (_) {
        return false;
    }

    let cTracker = childSubagentTrackers.get(childCid);
    if (!cTracker) {
        cTracker = createChildTracker(childCid);
    }
    touchLruMap(childSubagentTrackers, childCid, cTracker, MAX_TRACKED_CHILDREN);

    const prevOffset = cTracker.byteOffset;
    const prevStepCount = cTracker.stepCount;
    const prevLastTool = cTracker.lastTool;
    const prevLastStatus = cTracker.lastStepStatus;

    if (st.size < cTracker.byteOffset) {
        Object.assign(cTracker, createChildTracker(childCid));
    }

    if (st.size === cTracker.byteOffset) {
        cTracker.lastSeenSize = st.size;
        cTracker.lastMtimeMs = st.mtimeMs;
    } else if (st.size > cTracker.byteOffset) {
        let fd = -1;
        try {
            fd = fs.openSync(childPath, 'r');
            const buf = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, Math.max(1024, st.size - cTracker.byteOffset)));
            let pos = cTracker.byteOffset;

            while (pos < st.size) {
                const toRead = Math.min(buf.length, st.size - pos);
                const bytesRead = fs.readSync(fd, buf, 0, toRead, pos);
                if (bytesRead <= 0) {
                    try {
                        const curSt = fs.fstatSync(fd);
                        if (curSt.size < cTracker.byteOffset) {
                            Object.assign(cTracker, createChildTracker(childCid));
                        }
                    } catch (_) {}
                    break;
                }
                pos += bytesRead;

                const decoded = cTracker.decoder.write(buf.subarray(0, bytesRead));
                let cursor = 0;

                while (cursor < decoded.length) {
                    const nlIdx = decoded.indexOf('\n', cursor);
                    if (nlIdx === -1) {
                        const tail = decoded.slice(cursor);
                        if (cTracker.oversizeScan) {
                            feedChildOversizeChunk(cTracker.oversizeScan, tail, false);
                        } else if (cTracker.remainder.length + tail.length > MAX_LINE_BYTES) {
                            cTracker.oversizeScan = createChildOversizeScanner();
                            feedChildOversizeChunk(cTracker.oversizeScan, cTracker.remainder, false);
                            cTracker.remainder = '';
                            feedChildOversizeChunk(cTracker.oversizeScan, tail, false);
                        } else {
                            cTracker.remainder += tail;
                        }
                        break;
                    }

                    const piece = decoded.slice(cursor, nlIdx);
                    cursor = nlIdx + 1;

                    if (cTracker.oversizeScan) {
                        feedChildOversizeChunk(cTracker.oversizeScan, piece, true);
                        applyChildOversizeScan(cTracker, cTracker.oversizeScan);
                        cTracker.oversizeScan = null;
                    } else if (cTracker.remainder.length + piece.length > MAX_LINE_BYTES) {
                        const scan = createChildOversizeScanner();
                        feedChildOversizeChunk(scan, cTracker.remainder, false);
                        cTracker.remainder = '';
                        feedChildOversizeChunk(scan, piece, true);
                        applyChildOversizeScan(cTracker, scan);
                    } else {
                        const fullLine = cTracker.remainder + piece;
                        cTracker.remainder = '';
                        processChildLine(cTracker, fullLine);
                    }
                }

                cTracker.byteOffset = pos;
            }

            cTracker.byteOffset = pos;
            cTracker.lastSeenSize = st.size;
            cTracker.lastMtimeMs = st.mtimeMs;
        } catch (_) {
            if (fd !== -1) {
                try {
                    const curSt = fs.fstatSync(fd);
                    if (curSt.size < cTracker.byteOffset) {
                        Object.assign(cTracker, createChildTracker(childCid));
                    }
                } catch (__) {}
            }
        } finally {
            if (fd !== -1) {
                try {
                    fs.closeSync(fd);
                } catch (_) {}
            }
        }
    }

    if (cTracker.revivedAtMs > 0 && st.mtimeMs > cTracker.revivedAtMs) {
        cTracker.revivedAtMs = 0;
    }

    parentEntry.stepCount = cTracker.stepCount;
    if (cTracker.lastTool) {
        parentEntry.lastTool = cTracker.lastTool;
    }

    if (
        parentTracker &&
        (cTracker.byteOffset !== prevOffset ||
            cTracker.stepCount !== prevStepCount ||
            cTracker.lastTool !== prevLastTool ||
            cTracker.lastStepStatus !== prevLastStatus)
    ) {
        parentTracker.rev++;
    }

    const now = Date.now();
    if (parentTracker && isChildTrackerIdleCompleted(cTracker, st.mtimeMs, now)) {
        recordCompletedSubagent(parentTracker, childCid, Math.floor(st.mtimeMs || now), Boolean(parentTracker.initialized));
        parentTracker.rev++;
        return true;
    }

    return false;
}

function getConversationSnapshot(rawCid) {
    const requested = String(rawCid || '').trim().toLowerCase();
    let cid = requested;
    if (isDynamicCidAlias(requested)) {
        const resolved = resolveLatestConversationId();
        if (!resolved) {
            return { ok: false, reason: 'not_found', cid: requested };
        }
        cid = resolved;
    } else if (!UUID_RE.test(cid)) {
        return { ok: false, reason: 'invalid_cid' };
    }

    const transcriptPath = resolveSafeTranscriptPath(cid);
    if (!transcriptPath) {
        return { ok: false, reason: 'not_found', cid };
    }

    let st;
    try {
        st = fs.statSync(transcriptPath);
        if (!st.isFile()) return { ok: false, reason: 'not_found', cid };
    } catch (_) {
        return { ok: false, reason: 'not_found', cid };
    }

    let tracker = conversationTrackers.get(cid);
    if (!tracker) {
        tracker = createParentTracker(cid);
    }
    touchLruMap(conversationTrackers, cid, tracker, MAX_TRACKED_CONVERSATIONS);

    advanceParentTracker(tracker, transcriptPath, st);

    const activeSubagents = [];
    for (const entry of Array.from(tracker.subagentsMap.values())) {
        if (entry.status !== 'working') continue;
        if (activeSubagents.length < MAX_ACTIVE_SUBAGENTS_TAILED) {
            const autoCompleted = syncChildSubagentMetrics(tracker, entry.cid, entry);
            if (autoCompleted) continue;
            activeSubagents.push({
                cid: entry.cid,
                role: entry.role,
                typeName: entry.typeName,
                status: 'working',
                stepCount: entry.stepCount,
                lastTool: entry.lastTool || entry.role,
                startedAt: entry.startedAt,
            });
        }
    }

    const now = Date.now();
    const prevRecentLen = tracker.recentCompletedSubagents.length;
    tracker.recentCompletedSubagents = tracker.recentCompletedSubagents
        .filter((item) => now - (item.completedAt || 0) <= COMPLETED_SUBAGENT_TTL_MS)
        .slice(-MAX_RECENT_COMPLETED_SUBAGENTS);
    if (tracker.recentCompletedSubagents.length !== prevRecentLen) {
        tracker.rev++;
    }

    const recentCompletedSubagents = tracker.recentCompletedSubagents.map((entry) => ({
        cid: entry.cid,
        role: entry.role,
        typeName: entry.typeName,
        status: 'completed',
        stepCount: entry.stepCount,
        lastTool: entry.lastTool || entry.role,
        completedAt: entry.completedAt,
    }));

    const effectiveCtx = tracker.contextTokens > 0
        ? tracker.contextTokens
        : (st.size > 0 ? Math.round(st.size / 4.2) : 0);

    const turnContextDelta = tracker.prevTurnContextTokens > 0
        ? Math.max(0, effectiveCtx - tracker.prevTurnContextTokens)
        : 0;

    const inFlightOut = tracker.isWorking ? tracker.lastStepInFlightEst : 0;
    const turnOutputTokens = tracker.turnOutputTokens + inFlightOut;
    const totalOutputTokens = tracker.outputTokens + inFlightOut;
    const turnTokens = turnOutputTokens + turnContextDelta;

    return {
        ok: true,
        cid,
        contextTokens: effectiveCtx,
        inputTokens: tracker.inputTokens,
        uncachedInputTokens: tracker.inputTokens,
        cacheReadTokens: tracker.cacheReadTokens,
        cacheTokens: tracker.cacheReadTokens,
        outputTokens: totalOutputTokens,
        totalOutputTokens,
        turnTokens,
        turnOutputTokens,
        turnContextDelta,
        turnCount: tracker.turnCount,
        totalTurns: tracker.turnCount,
        turnSteps: tracker.turnSteps,
        stepCount: tracker.stepCount,
        latestStepIndex: tracker.latestStepIndex,
        latestStatus: tracker.latestStatus,
        lastStepType: tracker.lastStepType,
        modelName: tracker.modelName,
        isWorking: tracker.isWorking,
        turnFinishedSeq: tracker.turnFinishedSeq,
        crisisState: tracker.crisisState,
        justSlashedBug: tracker.justSlashedBug,
        slashSeq: tracker.slashSeq,
        slashReason: tracker.slashReason,
        activeSubagents,
        recentCompletedSubagents,
        workStateItems: tracker.workStateItems.slice(-12),
        fileBytes: st.size,
        updatedAt: Math.floor(st.mtimeMs),
    };
}

function hasConversationActivity(cid, lastPushedRev = -1) {
    const tracker = conversationTrackers.get(cid);
    const parentPath = resolveSafeTranscriptPath(cid);
    if (!parentPath) return false;

    if (tracker && lastPushedRev >= 0 && tracker.rev !== lastPushedRev) {
        return true;
    }

    try {
        const st = fs.statSync(parentPath);
        if (!tracker || st.size !== tracker.lastSeenSize || st.mtimeMs !== tracker.lastMtimeMs) {
            return true;
        }
    } catch (_) {
        return false;
    }

    const now = Date.now();
    if (tracker.recentCompletedSubagents.length > 0) {
        if (tracker.recentCompletedSubagents.some((s) => now - (s.completedAt || 0) > COMPLETED_SUBAGENT_TTL_MS)) {
            return true;
        }
    }

    let checked = 0;
    for (const entry of tracker.subagentsMap.values()) {
        if (entry.status !== 'working') continue;
        if (++checked > MAX_ACTIVE_SUBAGENTS_TAILED) break;
        const cPath = resolveSafeTranscriptPath(entry.cid);
        if (!cPath) continue;
        try {
            const cst = fs.statSync(cPath);
            const cTracker = childSubagentTrackers.get(entry.cid);
            if (!cTracker || cst.size !== cTracker.lastSeenSize || cst.mtimeMs !== cTracker.lastMtimeMs) {
                return true;
            }
            if (isChildTrackerIdleCompleted(cTracker, cst.mtimeMs, now)) {
                return true;
            }
        } catch (_) {}
    }

    return false;
}

/* ==========================================================================
 * HARDENED LOCAL HTTP SERVER (/assets/, /__telemetry, /__events)
 * ========================================================================== */

function isLoopbackAddress(addr) {
    return addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1';
}

function hasVerifiedOpaqueOriginSession() {
    for (const s of sessions.values()) {
        if (!s || !s.verified) continue;
        const u = String(s.currentUrl || (s.target && s.target.url) || '').trim().toLowerCase();
        if (u.startsWith('file:') || u.startsWith('vscode-file:')) {
            return true;
        }
    }
    return false;
}

function isOriginAllowedForApi(originHeader) {
    if (originHeader === undefined || originHeader === '') return true;
    const origin = String(originHeader).trim();
    if (origin === 'vscode-file://vscode-app') return true;
    if (origin === 'null') return hasVerifiedOpaqueOriginSession();
    return trustedOrigins.has(origin);
}

function buildApiCorsHeaders(originHeader, req) {
    const headers = {
        'Access-Control-Allow-Headers': 'X-Agy-Token',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Vary': 'Origin, Access-Control-Request-Private-Network',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
    };
    if (originHeader) {
        headers['Access-Control-Allow-Origin'] = String(originHeader).trim();
    }
    if (req && req.headers && req.headers['access-control-request-private-network']) {
        headers['Access-Control-Allow-Private-Network'] = 'true';
    }
    return headers;
}

function handleSseEventsRequest(req, res, rawCid, apiHeaders) {
    const isDynamic = isDynamicCidAlias(rawCid);
    if (!isDynamic && !UUID_RE.test(rawCid)) {
        const body = JSON.stringify({ ok: false, reason: 'invalid_cid' });
        res.writeHead(400, {
            ...apiHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
    }

    while (sseClients.length >= MAX_SSE_CLIENTS) {
        const oldest = sseClients.shift();
        if (oldest) oldest.close();
    }

    res.writeHead(200, {
        ...apiHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
    });

    let closed = false;
    let lastJson = '';
    let lastPushedRev = -1;
    let lastResolvedCid = isDynamic ? resolveLatestConversationId() : rawCid;

    const pushSnapshot = (targetCid) => {
        if (closed) return;
        let snap;
        let json;
        try {
            snap = getConversationSnapshot(targetCid || rawCid);
            const resolvedTracker = snap && snap.cid ? conversationTrackers.get(snap.cid) : null;
            if (resolvedTracker) {
                lastPushedRev = resolvedTracker.rev;
            }
            json = JSON.stringify(snap);
        } catch (_) {
            return;
        }
        if (json !== lastJson) {
            lastJson = json;
            try {
                res.write(`data: ${json}\n\n`);
            } catch (_) {
                clientEntry.close();
            }
        }
    };

    pushSnapshot(lastResolvedCid || rawCid);

    const pollTimer = setInterval(() => {
        if (closed) return;
        if (isDynamic) {
            const nextCid = resolveLatestConversationId();
            const checkRev = nextCid === lastResolvedCid ? lastPushedRev : -1;
            if (nextCid !== lastResolvedCid || (nextCid && hasConversationActivity(nextCid, checkRev))) {
                lastResolvedCid = nextCid;
                pushSnapshot(nextCid || rawCid);
            }
            return;
        }
        if (hasConversationActivity(rawCid, lastPushedRev)) {
            pushSnapshot(rawCid);
        }
    }, SSE_POLL_INTERVAL_MS);

    const pingTimer = setInterval(() => {
        if (closed) return;
        try {
            res.write(': ping\n\n');
        } catch (_) {
            clientEntry.close();
        }
    }, SSE_PING_INTERVAL_MS);

    const clientEntry = {
        close() {
            if (closed) return;
            closed = true;
            clearInterval(pollTimer);
            clearInterval(pingTimer);
            const idx = sseClients.indexOf(clientEntry);
            if (idx >= 0) sseClients.splice(idx, 1);
            try {
                res.end();
            } catch (_) {}
        },
    };

    sseClients.push(clientEntry);
    req.on('close', () => clientEntry.close());
    res.on('close', () => clientEntry.close());
    res.on('error', () => clientEntry.close());
}

function startAssetServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const remoteAddr = String((req.socket && req.socket.remoteAddress) || '');
            if (!isLoopbackAddress(remoteAddr)) {
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
                res.end('Forbidden');
                return;
            }

            const expectedHost = `127.0.0.1:${assetPort}`;
            if (!assetPort || String(req.headers.host || '') !== expectedHost) {
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
                res.end('Forbidden');
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
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
                res.end('Bad Request');
                return;
            }

            if (rawPathname.includes('\0')) {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
                res.end('Bad Request');
                return;
            }

            // 1. Authenticated Telemetry & SSE Streaming Endpoints
            if (rawPathname === '/__telemetry' || rawPathname === '/__events') {
                const originHdr = req.headers.origin;
                if (!isOriginAllowedForApi(originHdr)) {
                    res.writeHead(403, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Vary': 'Origin',
                        'X-Content-Type-Options': 'nosniff',
                    });
                    res.end('Forbidden');
                    return;
                }

                const apiHeaders = buildApiCorsHeaders(originHdr, req);

                if (req.method === 'OPTIONS') {
                    res.writeHead(204, apiHeaders);
                    res.end();
                    return;
                }

                if (req.method !== 'GET') {
                    res.writeHead(405, { ...apiHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Method Not Allowed');
                    return;
                }

                const tokenHdr = String(req.headers['x-agy-token'] || '');
                if (!timingSafeTokenMatch(tokenHdr)) {
                    res.writeHead(403, { ...apiHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Forbidden');
                    return;
                }

                const params = new URLSearchParams(queryString);
                const cid = String(params.get('cid') || '').trim().toLowerCase();

                if (rawPathname === '/__events') {
                    handleSseEventsRequest(req, res, cid, apiHeaders);
                    return;
                }

                const payload = getConversationSnapshot(cid);
                const body = JSON.stringify(payload);
                res.writeHead(200, {
                    ...apiHeaders,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': Buffer.byteLength(body),
                });
                res.end(body);
                return;
            }

            // 2. Symlink-Safe Static Theme Image Assets (/assets/...)
            const assetBaseHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Cross-Origin-Resource-Policy': 'cross-origin',
                'Vary': 'Access-Control-Request-Private-Network',
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': ASSET_CSP,
                'Cache-Control': 'no-cache',
            };
            if (req.headers['access-control-request-private-network']) {
                assetBaseHeaders['Access-Control-Allow-Private-Network'] = 'true';
            }

            if (!rawPathname.startsWith('/assets/')) {
                res.writeHead(403, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
                return;
            }

            if (req.method === 'OPTIONS') {
                res.writeHead(204, {
                    ...assetBaseHeaders,
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                });
                res.end();
                return;
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Method Not Allowed');
                return;
            }

            const subAssetRel = rawPathname.slice('/assets/'.length).replace(/^[/\\]+/, '');
            if (!subAssetRel) {
                res.writeHead(404, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not Found');
                return;
            }

            const ext = path.extname(subAssetRel).toLowerCase();
            const contentType = ALLOWED_ASSET_MIME[ext];
            if (!contentType) {
                res.writeHead(403, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
                return;
            }

            const candidatePath = path.resolve(ASSETS_DIR, subAssetRel);

            fs.realpath(ASSETS_DIR, (rootErr, realAssetsRoot) => {
                if (rootErr) {
                    res.writeHead(404, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Not Found');
                    return;
                }

                fs.realpath(candidatePath, (fileErr, realFile) => {
                    if (fileErr) {
                        res.writeHead(404, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('Not Found');
                        return;
                    }

                    const relCheck = path.relative(realAssetsRoot, realFile);
                    if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
                        res.writeHead(403, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('Forbidden');
                        return;
                    }

                    fs.stat(realFile, (statErr, stat) => {
                        if (statErr || !stat.isFile()) {
                            res.writeHead(404, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end('Not Found');
                            return;
                        }

                        const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
                        if (req.headers['if-none-match'] === etag) {
                            res.writeHead(304, { ...assetBaseHeaders, ETag: etag });
                            res.end();
                            return;
                        }

                        res.writeHead(200, {
                            ...assetBaseHeaders,
                            'Content-Type': contentType,
                            'Content-Length': stat.size,
                            ETag: etag,
                        });

                        if (req.method === 'HEAD') {
                            res.end();
                            return;
                        }

                        const stream = fs.createReadStream(realFile);
                        stream.on('error', () => {
                            if (!res.headersSent) {
                                res.writeHead(500, { ...assetBaseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
                            }
                            res.end();
                        });
                        stream.pipe(res);
                    });
                });
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
            log(`Local asset server listening on http://127.0.0.1:${assetPort}/ (serving ${ASSETS_DIR})`);
            resolve(assetPort);
        });
    });
}

/* ==========================================================================
 * CONFIG PERSISTENCE & PID MANAGEMENT (0o600 PERMISSIONS)
 * ========================================================================== */

function resolvePortFile() {
    if (process.env.AGY_DEVTOOLS_PORT_FILE) {
        return process.env.AGY_DEVTOOLS_PORT_FILE;
    }
    if (process.env.AGY_PORT_FILE) {
        return process.env.AGY_PORT_FILE;
    }

    const home = process.platform === 'win32'
        ? (process.env.USERPROFILE || process.env.HOME || os.homedir())
        : (process.env.HOME || os.homedir());
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
                { encoding: 'utf8', windowsHide: true, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }
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

function acquirePidLock() {
    if (fs.existsSync(PID_FILE)) {
        const existingPid = parseInt(stripBom(fs.readFileSync(PID_FILE, 'utf8')).trim(), 10);
        if (existingPid && existingPid !== process.pid && isVerifiedDaemonProcess(existingPid)) {
            log(`Another daemon instance is already running (PID ${existingPid}). Exiting.`);
            process.exit(0);
        }
    }
    if (!process.env.AGY_CONFIG_PATH && !process.env.AGY_PID_FILE) {
        const globalPidFile = path.join(os.homedir(), '.gemini', 'antigravity', 'theme_daemon.pid');
        try {
            if (fs.existsSync(globalPidFile)) {
                const rawGlobal = stripBom(fs.readFileSync(globalPidFile, 'utf8')).trim();
                const gPid = rawGlobal.startsWith('{') ? JSON.parse(rawGlobal).pid : parseInt(rawGlobal, 10);
                if (gPid && gPid !== process.pid && isVerifiedDaemonProcess(gPid)) {
                    log(`Global daemon lock held by PID ${gPid}. Exiting duplicate instance.`);
                    process.exit(0);
                }
            }
            const gPayload = JSON.stringify({ pid: process.pid, rootDir: ROOT_DIR, startedAt: Date.now() });
            if (typeof writeFileAtomicSync === 'function') {
                writeFileAtomicSync(globalPidFile, gPayload, 0o600);
            }
        } catch (_) {}
    }
    fs.writeFileSync(PID_FILE, String(process.pid), { encoding: 'utf8', mode: 0o600 });
    ensurePrivateFileMode(PID_FILE);
}

function removePidLock() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(stripBom(fs.readFileSync(PID_FILE, 'utf8')).trim(), 10);
            if (pid === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        }
    } catch (_) {}
    if (!process.env.AGY_CONFIG_PATH && !process.env.AGY_PID_FILE) {
        try {
            const globalPidFile = path.join(os.homedir(), '.gemini', 'antigravity', 'theme_daemon.pid');
            if (fs.existsSync(globalPidFile)) {
                const info = JSON.parse(stripBom(fs.readFileSync(globalPidFile, 'utf8')));
                if (info && info.pid === process.pid) fs.unlinkSync(globalPidFile);
            }
        } catch (_) {}
    }
}

function isPlainObject(val) {
    return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

function sortKeysDeep(val, depth = 0) {
    if (depth > 10 || !val || typeof val !== 'object') return val;
    if (Array.isArray(val)) {
        return val.map((item) => sortKeysDeep(item, depth + 1));
    }
    const sorted = {};
    for (const k of Object.keys(val).sort()) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (val[k] === undefined) continue;
        sorted[k] = sortKeysDeep(val[k], depth + 1);
    }
    return sorted;
}

const LARGE_ASSET_CONFIG_KEYS = new Set(['customWp', 'userAvatar', 'agentAvatar']);
const FORBIDDEN_PROMPT_KEY_RE = /prompt|instruction|systemmessage/i;

function stripPromptKeysDeep(val, depth = 0) {
    if (depth > 8 || !val || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map((item) => stripPromptKeysDeep(item, depth + 1));
    const out = {};
    for (const k of Object.keys(val)) {
        if (DANGEROUS_KEYS.has(k) || FORBIDDEN_PROMPT_KEY_RE.test(k)) continue;
        out[k] = stripPromptKeysDeep(val[k], depth + 1);
    }
    return out;
}

function sanitizeConfigServerSide(raw) {
    const src = stripPromptKeysDeep(stripProtoKeys(raw));
    if (!isPlainObject(src)) return null;

    const clean = {};
    for (const key of Object.keys(src)) {
        if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) continue;
        if (key === '__agyToken' || key === 'authToken' || key === 'token' || key === 'config') continue;
        if (FORBIDDEN_PROMPT_KEY_RE.test(key)) continue;
        const val = src[key];
        if (val === undefined) continue;

        if (key === 'workspaceProfiles') {
            if (typeof sanitizeWorkspaceProfilesStrict === 'function') {
                clean.workspaceProfiles = sanitizeWorkspaceProfilesStrict(val);
            } else if (isPlainObject(val)) {
                clean.workspaceProfiles = val;
            }
            continue;
        }

        if (key === 'aiPersonaMode') {
            if (typeof val === 'string') {
                const m = val.trim().toLowerCase();
                if (m === 'off' || m === 'subtle' || m === 'roleplay') {
                    clean.aiPersonaMode = m;
                }
            }
            continue;
        }
        if (key === 'personaTraitId') {
            if (typeof val === 'string' && /^[a-z0-9_]{1,36}$/.test(val.trim().toLowerCase())) {
                clean.personaTraitId = val.trim().toLowerCase();
            }
            continue;
        }

        if (key === 'activeForgedTheme') {
            if (val === null) {
                clean.activeForgedTheme = null;
            } else if (isPlainObject(val)) {
                try {
                    const serializedForged = JSON.stringify(val);
                    if (
                        serializedForged &&
                        Buffer.byteLength(serializedForged, 'utf8') <= MAX_ACTIVE_FORGED_THEME_BYTES
                    ) {
                        clean.activeForgedTheme = val;
                    }
                } catch (_) {}
            }
            continue;
        }

        if (LARGE_ASSET_CONFIG_KEYS.has(key)) {
            if (
                typeof val === 'string' &&
                !/["'()\\\r\n\0<>`{}]/.test(val) &&
                Buffer.byteLength(val, 'utf8') <= 3.5 * 1024 * 1024
            ) {
                clean[key] = val.trim();
            }
            continue;
        }

        if (typeof val === 'boolean') {
            clean[key] = val;
        } else if (typeof val === 'number' && Number.isFinite(val)) {
            clean[key] = val;
        } else if (typeof val === 'string' && val.length <= 8192 && !val.includes('\0')) {
            clean[key] = val;
        } else if (val === null) {
            clean[key] = null;
        } else if (typeof val === 'object') {
            try {
                const subJson = JSON.stringify(val);
                if (subJson && Buffer.byteLength(subJson, 'utf8') <= 512 * 1024) {
                    clean[key] = val;
                }
            } catch (_) {}
        }
    }
    return clean;
}

function readConfig() {
    for (const candidate of [CONFIG_FILE, SURVIVAL_BACKUP_FILE]) {
        try {
            if (fs.existsSync(candidate)) {
                const parsed = sanitizeConfigServerSide(parseJsonFileSync(candidate));
                if (parsed && Object.keys(parsed).length > 0) {
                    if (parsed.activeForgedTheme === null) {
                        delete parsed.activeForgedTheme;
                    }
                    if (candidate === SURVIVAL_BACKUP_FILE && !fs.existsSync(CONFIG_FILE)) {
                        try {
                            const restoredStr = JSON.stringify(sortKeysDeep(parsed), null, 2);
                            if (typeof writeFileAtomicSync === 'function') {
                                writeFileAtomicSync(CONFIG_FILE, restoredStr, 0o600);
                            } else {
                                fs.writeFileSync(CONFIG_FILE, restoredStr, { encoding: 'utf8', mode: 0o600 });
                                ensurePrivateFileMode(CONFIG_FILE);
                            }
                            if (typeof syncPersonaRuntimeHint === 'function') {
                                syncPersonaRuntimeHint(parsed, { rootDir: ROOT_DIR, configPath: CONFIG_FILE });
                            }
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

function saveConfig(incoming) {
    try {
        const cleanedNext = sanitizeConfigServerSide(incoming);
        if (!cleanedNext) {
            return null;
        }
        const prevRaw = { ...DEFAULT_CONFIG, ...(sanitizeConfigServerSide(readConfig()) || {}) };
        if (prevRaw.activeForgedTheme === null) {
            delete prevRaw.activeForgedTheme;
        }
        const prevNormalized = sortKeysDeep(prevRaw);
        const prevSerialized = JSON.stringify(prevNormalized, null, 2);

        const mergedRaw = { ...prevNormalized, ...cleanedNext };
        if (mergedRaw.activeForgedTheme === null) {
            delete mergedRaw.activeForgedTheme;
        }
        const merged = sortKeysDeep(mergedRaw);
        const serialized = JSON.stringify(merged, null, 2);

        if (prevSerialized === serialized) {
            if (typeof syncPersonaRuntimeHint === 'function') {
                try {
                    syncPersonaRuntimeHint(merged, { rootDir: ROOT_DIR, configPath: CONFIG_FILE });
                } catch (_) {}
            }
            return { changed: false, config: merged };
        }

        if (typeof writeFileAtomicSync === 'function') {
            writeFileAtomicSync(CONFIG_FILE, serialized, 0o600);
        } else {
            fs.writeFileSync(CONFIG_FILE, serialized, { encoding: 'utf8', mode: 0o600 });
            ensurePrivateFileMode(CONFIG_FILE);
        }
        lastKnownConfigHash = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
        if (typeof syncPersonaRuntimeHint === 'function') {
            try {
                const personaFieldsChanged =
                    merged.themeName !== prevNormalized.themeName ||
                    merged.bubbleName !== prevNormalized.bubbleName ||
                    merged.masterPersona !== prevNormalized.masterPersona ||
                    merged.aiPersonaMode !== prevNormalized.aiPersonaMode ||
                    merged.focusMode !== prevNormalized.focusMode ||
                    merged.chibiEnabled !== prevNormalized.chibiEnabled;
                syncPersonaRuntimeHint(merged, {
                    rootDir: ROOT_DIR,
                    configPath: CONFIG_FILE,
                    directSwitchWorkspaceKey: personaFieldsChanged ? (merged.activeWorkspace || '') : ''
                });
            } catch (_) {}
        }
        try {
            if (typeof writeFileAtomicSync === 'function') {
                writeFileAtomicSync(SURVIVAL_BACKUP_FILE, serialized, 0o600);
            } else {
                fs.mkdirSync(path.dirname(SURVIVAL_BACKUP_FILE), { recursive: true, mode: 0o700 });
                fs.writeFileSync(SURVIVAL_BACKUP_FILE, serialized, { encoding: 'utf8', mode: 0o600 });
                ensurePrivateFileMode(SURVIVAL_BACKUP_FILE);
            }
        } catch (_) {}
        return { changed: true, config: merged };
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
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$patched = 0
foreach ($d in $Dirs) {
  Get-ChildItem -LiteralPath $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $WshShell.CreateShortcut($_.FullName)
      if ($sc.TargetPath -and ($sc.TargetPath -imatch '\\\\Antigravity\\.exe$') -and (Test-Path -LiteralPath $sc.TargetPath)) {
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
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        let out = '';
        let settled = false;
        const guardTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            shortcutHealRunning = false;
            try {
                child.kill();
            } catch (_) {}
            log(`[update-guard] Shortcut heal timed out after 30000ms (${reason}).`);
        }, 30000);
        if (child.stdout) child.stdout.on('data', (c) => (out += String(c)));
        child.on('close', () => {
            if (settled) return;
            settled = true;
            clearTimeout(guardTimer);
            shortcutHealRunning = false;
            if (out.trim()) {
                log(`[update-guard] Auto-healed Antigravity shortcuts (${reason}): ${out.trim()}`);
            }
        });
        child.on('error', () => {
            if (settled) return;
            settled = true;
            clearTimeout(guardTimer);
            shortcutHealRunning = false;
        });
    } catch (_) {
        shortcutHealRunning = false;
    }
}

function checkAntigravityUpdateAndHeal() {
    if (!fs.existsSync(PAYLOAD_PATH) && fs.existsSync(BUILD_SCRIPT_JS)) {
        try {
            execFileSync(process.execPath, [BUILD_SCRIPT_JS], { cwd: ROOT_DIR, windowsHide: true, timeout: 15000 });
            log('[update-guard] Auto-rebuilt missing dist/theme_payload.js.');
        } catch (err) {
            log(`[update-guard] Auto-rebuild failed: ${err.message}`);
        }
    }

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
                    setTimeout(() => healWindowsShortcutsAsync('app-updated-followup'), 8000);
                }
            } catch (_) {}
        }
    }
}

/* ==========================================================================
 * STRICT CDP TARGET FILTER, DOM PROBE & MASTER CLOSURE INJECTION
 * ========================================================================== */

let missingPayloadLogged = false;
function buildRuntimeWrappedSource(opts = {}) {
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

    const payloadCode = stripBom(fs.readFileSync(PAYLOAD_PATH, 'utf8'));
    const currentCfg = readConfig();
    const bootObj = JSON.stringify({
        token: EPHEMERAL_TOKEN,
        authToken: EPHEMERAL_TOKEN,
        assetBase: assetPort > 0 ? `http://127.0.0.1:${assetPort}/` : '',
        initialConfig: currentCfg,
        syncFromDaemon: Boolean(opts && opts.syncFromDaemon),
    });
    return `(() => {\nconst __AGY_INJECT_BOOT__ = Object.freeze(${bootObj});\n${payloadCode}\n})();`;
}
const buildInjectedSource = buildRuntimeWrappedSource;

function buildDeltaConfigSyncSource() {
    const currentCfg = readConfig();
    const deltaPayload = JSON.stringify({
        syncFromDaemon: true,
        config: currentCfg,
    }).replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return `(() => {\nconst delta = ${deltaPayload};\nif (typeof window !== 'undefined' && window.__AGY_THEME_CORE__ && typeof window.__AGY_THEME_CORE__.applyDaemonDelta === 'function') {\n  return Boolean(window.__AGY_THEME_CORE__.applyDaemonDelta(delta.config));\n}\nreturn false;\n})()`;
}

function computeSourceHash(src) {
    return crypto.createHash('sha256').update(src, 'utf8').digest('hex');
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

    let u;
    try {
        u = new URL(trimmed);
    } catch (_) {
        return false;
    }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return false;
    }
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]') {
        return false;
    }

    const pathname = u.pathname || '/';
    return (
        pathname === '/' ||
        pathname === '/launchpad' ||
        pathname.startsWith('/launchpad/') ||
        pathname === '/workbench' ||
        pathname.startsWith('/workbench/') ||
        pathname.startsWith('/c/') ||
        pathname.startsWith('/p/') ||
        pathname === '/projects' ||
        pathname.startsWith('/projects/') ||
        pathname === '/settings' ||
        pathname.startsWith('/settings/') ||
        pathname === '/manager' ||
        pathname.startsWith('/manager/') ||
        pathname === '/workspace' ||
        pathname.startsWith('/workspace/') ||
        pathname.startsWith('/w/') ||
        pathname === '/chat' ||
        pathname.startsWith('/chat/')
    );
}

function recordTrustedOriginFromUrl(rawUrl) {
    try {
        const u = new URL(String(rawUrl || ''));
        if (
            (u.protocol === 'http:' || u.protocol === 'https:') &&
            (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')
        ) {
            trustedOrigins.add(u.origin);
        } else if (u.protocol === 'vscode-file:') {
            trustedOrigins.add(`${u.protocol}//${u.host || 'vscode-app'}`);
        }
    } catch (_) {}
}

function rememberIgnoredTarget(targetId, targetUrl) {
    if (ignoredTargetFingerprints.size >= 256) {
        const first = ignoredTargetFingerprints.values().next().value;
        if (first !== undefined) ignoredTargetFingerprints.delete(first);
    }
    ignoredTargetFingerprints.add(`${targetId}|${targetUrl}`);
}

const DOM_VERIFICATION_PROBE_EXPR = `(() => {
    const matched = Boolean(
        document.querySelector('.agy-shell, .monaco-workbench, [data-launchpad], #workbench\\\\.parts\\\\.editor') ||
        /Antigravity/i.test(document.title || '') ||
        /^\\/(c\\/[0-9a-f-]{36}|launchpad)/i.test(location.pathname || '')
    );
    const hasBody = Boolean(document.body);
    const payloadReady = Boolean(
        window.__AGY_THEME_CORE__ &&
        typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === 'function' &&
        window.__AGY_MODAL_OBSERVER__ &&
        document.getElementById('antigravity-custom-theme-active')
    );
    return { matched, hasBody, payloadReady, readyState: document.readyState || 'complete', origin: location.origin || '' };
})()`;

function getPortInfo() {
    const portFile = resolvePortFile();
    if (!fs.existsSync(portFile)) return null;
    const lines = stripBom(fs.readFileSync(portFile, 'utf8'))
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
                    resolve(JSON.parse(stripBom(body)));
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
let configBroadcastTimer = null;
let pendingBroadcastSourceId = null;
let lastKnownConfigHash = '';
let configWatcher = null;
let externalConfigTimer = null;

function computeCurrentDiskConfigHash() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) return '';
        const normalized = JSON.stringify(sortKeysDeep(readConfig()), null, 2);
        return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
    } catch (_) {
        return '';
    }
}

function checkExternalConfigUpdate() {
    const curHash = computeCurrentDiskConfigHash();
    if (!curHash) return;
    if (!lastKnownConfigHash) {
        lastKnownConfigHash = curHash;
        return;
    }
    if (curHash !== lastKnownConfigHash) {
        lastKnownConfigHash = curHash;
        log('Detected external theme_config.json update (MCP / Hook); syncing live delta.');
        if (typeof syncPersonaRuntimeHint === 'function') {
            try {
                syncPersonaRuntimeHint(readConfig(), { rootDir: ROOT_DIR, configPath: CONFIG_FILE });
            } catch (_) {}
        }
        scheduleCrossWindowConfigSync(null);
    }
}

function watchExternalConfig() {
    lastKnownConfigHash = computeCurrentDiskConfigHash();
    if (typeof syncPersonaRuntimeHint === 'function') {
        try {
            const curCfg = readConfig();
            if (curCfg && Object.keys(curCfg).length > 0) {
                syncPersonaRuntimeHint(curCfg, { rootDir: ROOT_DIR, configPath: CONFIG_FILE });
            }
        } catch (_) {}
    }
    try {
        const cfgDir = path.dirname(CONFIG_FILE);
        const cfgBase = path.basename(CONFIG_FILE);
        if (!fs.existsSync(cfgDir)) {
            fs.mkdirSync(cfgDir, { recursive: true });
        }
        configWatcher = fs.watch(cfgDir, (_evt, filename) => {
            if (filename && filename !== cfgBase) return;
            clearTimeout(externalConfigTimer);
            externalConfigTimer = setTimeout(checkExternalConfigUpdate, 60);
        });
        configWatcher.on('error', () => {
            if (configWatcher) {
                try { configWatcher.close(); } catch (_) {}
                configWatcher = null;
            }
        });
    } catch (_) {}
}

function scheduleCrossWindowConfigSync(sourceTargetId) {
    pendingBroadcastSourceId = sourceTargetId;
    clearTimeout(configBroadcastTimer);
    configBroadcastTimer = setTimeout(() => {
        const srcId = pendingBroadcastSourceId;
        pendingBroadcastSourceId = null;
        configBroadcastTimer = null;
        for (const other of sessions.values()) {
            if (!other.verified) continue;
            if (other.id === srcId) {
                other.reinject({ onlyUpdateNewDoc: true });
            } else if (typeof other.syncConfigDelta === 'function') {
                other.syncConfigDelta();
            } else {
                other.reinject({ syncFromDaemon: true });
            }
        }
    }, CONFIG_BROADCAST_DEBOUNCE_MS);
}

function createSession(target) {
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    const session = {
        id: target.id,
        ws,
        target,
        currentUrl: String(target.url || ''),
        verified: false,
        initialAttachDone: false,
        navSeq: 0,
        injecting: false,
        queuedReinjectOpts: null,
        evalScriptId: null,
        lastRegisteredDocHash: '',
    };
    sessions.set(target.id, session);

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== 1) {
                reject(new Error('WebSocket is not open'));
                return;
            }
            const id = nextId++;
            const timer = setTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    reject(new Error(`CDP timeout (${method})`));
                }
            }, CDP_SEND_TIMEOUT_MS);
            pending.set(id, {
                resolve(val) {
                    clearTimeout(timer);
                    resolve(val);
                },
                reject(err) {
                    clearTimeout(timer);
                    reject(err);
                },
            });
            try {
                ws.send(JSON.stringify({ id, method, params }));
            } catch (err) {
                clearTimeout(timer);
                pending.delete(id);
                reject(err);
            }
        });
    }

    async function verifyDomIsAntigravity(opts = {}) {
        const maxAttempts = Number.isInteger(opts.maxAttempts) && opts.maxAttempts > 0 ? opts.maxAttempts : 2;
        const delayMs = Number.isFinite(opts.delayMs) && opts.delayMs > 0 ? opts.delayMs : 300;
        const ignoreReadyState = Boolean(opts.ignoreReadyState);
        const requireReadyDom = Boolean(opts.requireReadyDom);

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const evalRes = await send('Runtime.evaluate', {
                expression: DOM_VERIFICATION_PROBE_EXPR,
                returnByValue: true,
                awaitPromise: false,
            });
            const val = evalRes && evalRes.result ? evalRes.result.value : null;
            if (val && val.matched === true) {
                if (requireReadyDom && val.readyState === 'loading' && !val.payloadReady && attempt + 1 < maxAttempts) {
                    await new Promise((r) => setTimeout(r, delayMs));
                    continue;
                }
                if (val.origin && val.origin !== 'null') {
                    recordTrustedOriginFromUrl(val.origin);
                }
                recordTrustedOriginFromUrl(session.currentUrl || target.url);
                return {
                    matched: true,
                    hasBody: Boolean(val.hasBody),
                    payloadReady: Boolean(val.payloadReady),
                    readyState: val.readyState || 'complete',
                };
            }
            if (attempt + 1 < maxAttempts && (ignoreReadyState || (val && val.readyState === 'loading'))) {
                await new Promise((r) => setTimeout(r, delayMs));
                continue;
            }
            break;
        }
        return null;
    }

    async function refreshNewDocumentScript() {
        const docSrc = buildRuntimeWrappedSource({ syncFromDaemon: false });
        if (!docSrc) return false;
        const nextHash = computeSourceHash(docSrc);
        if (nextHash === session.lastRegisteredDocHash && session.evalScriptId) {
            return true;
        }
        if (session.evalScriptId) {
            const oldId = session.evalScriptId;
            session.evalScriptId = null;
            try {
                await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: oldId });
            } catch (_) {}
        }
        const addRes = await send('Page.addScriptToEvaluateOnNewDocument', { source: docSrc });
        session.evalScriptId = addRes && addRes.identifier ? String(addRes.identifier) : null;
        session.lastRegisteredDocHash = nextHash;
        return true;
    }

    session.syncConfigDelta = async () => {
        if (!session.verified) return;
        if (session.injecting) {
            session.reinject({ syncFromDaemon: true });
            return;
        }
        try {
            await refreshNewDocumentScript();
            const deltaExpr = buildDeltaConfigSyncSource();
            const evalRes = await send('Runtime.evaluate', {
                expression: deltaExpr,
                returnByValue: true,
                awaitPromise: false,
            });
            const val = evalRes && evalRes.result ? evalRes.result.value : undefined;
            if (val === false) {
                await session.reinject({ syncFromDaemon: true });
            }
        } catch (_) {}
    };

    session.reinject = async (opts = {}) => {
        const allowUnverified = Boolean(opts && opts.initialAttach);
        if (!session.verified && !allowUnverified) return;

        const normalizedOpts = {
            syncFromDaemon: Boolean(opts && opts.syncFromDaemon),
            onlyUpdateNewDoc: Boolean(opts && opts.onlyUpdateNewDoc),
        };

        if (session.injecting) {
            if (!session.queuedReinjectOpts) {
                session.queuedReinjectOpts = normalizedOpts;
            } else {
                if (!normalizedOpts.onlyUpdateNewDoc) {
                    if (session.queuedReinjectOpts.onlyUpdateNewDoc) {
                        session.queuedReinjectOpts = normalizedOpts;
                    } else if (normalizedOpts.syncFromDaemon) {
                        session.queuedReinjectOpts.syncFromDaemon = true;
                    }
                }
            }
            return;
        }

        session.injecting = true;
        let cur = normalizedOpts;
        try {
            while (cur) {
                await refreshNewDocumentScript();
                if (!cur.onlyUpdateNewDoc) {
                    const evalSrc = buildRuntimeWrappedSource({ syncFromDaemon: cur.syncFromDaemon });
                    if (evalSrc) {
                        await send('Runtime.evaluate', { expression: evalSrc, awaitPromise: false });
                    }
                }
                cur = session.queuedReinjectOpts;
                session.queuedReinjectOpts = null;
            }
        } catch (err) {
            if (allowUnverified) throw err;
        } finally {
            session.injecting = false;
        }
    };

    ws.addEventListener('message', async (event) => {
        let msg;
        try {
            msg = JSON.parse(stripBom(String(event.data)));
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
            if (!session.verified) return;
            try {
                const rawPayload = typeof msg.params.payload === 'string' ? msg.params.payload : '';
                if (!rawPayload || Buffer.byteLength(rawPayload, 'utf8') > MAX_BINDING_PAYLOAD_BYTES) {
                    log(`[security] Rejected oversized or empty agySaveThemeConfig payload on target ${target.id}.`);
                    return;
                }
                const parsed = JSON.parse(stripBom(rawPayload));
                if (!parsed || typeof parsed !== 'object' || !timingSafeTokenMatch(parsed.__agyToken)) {
                    log(`[security] Rejected unauthorized agySaveThemeConfig call on target ${target.id}.`);
                    return;
                }
                if (!parsed.config || typeof parsed.config !== 'object' || Array.isArray(parsed.config)) {
                    log(`[security] Rejected malformed config object on target ${target.id}.`);
                    return;
                }
                const saved = saveConfig(parsed.config);
                if (saved && saved.changed === true) {
                    scheduleCrossWindowConfigSync(target.id);
                }
            } catch (err) {
                log(`Config binding error: ${err.message}`);
            }
            return;
        }

        if (msg.method === 'Page.frameNavigated' && msg.params && msg.params.frame && !msg.params.frame.parentId) {
            const myNavSeq = ++session.navSeq;
            const navUrl = String(msg.params.frame.url || '');
            const wasVerified = session.verified;
            session.currentUrl = navUrl;
            let isSameTrustedOrigin = false;
            if (wasVerified) {
                try {
                    const u = new URL(navUrl);
                    const originKey =
                        u.protocol === 'vscode-file:' ? `${u.protocol}//${u.host || 'vscode-app'}` : u.origin;
                    isSameTrustedOrigin = trustedOrigins.has(originKey);
                } catch (_) {}
            }
            if (!isCandidateAntigravityUrl(navUrl) && !(wasVerified && isSameTrustedOrigin)) {
                session.verified = false;
                if (!wasVerified) {
                    rememberIgnoredTarget(target.id, navUrl);
                }
                try {
                    ws.close();
                } catch (_) {}
                return;
            }
            if (!session.initialAttachDone) {
                return;
            }
            try {
                const probe = await verifyDomIsAntigravity({
                    maxAttempts: 8,
                    delayMs: 250,
                    ignoreReadyState: true,
                    requireReadyDom: true,
                });
                if (myNavSeq !== session.navSeq || session.ws.readyState !== 1) return;
                if (!probe) {
                    session.verified = false;
                    if (!wasVerified) {
                        rememberIgnoredTarget(target.id, navUrl);
                    }
                    try {
                        ws.close();
                    } catch (_) {}
                    return;
                }
                session.verified = true;
                if (probe.payloadReady && session.evalScriptId) {
                    await session.reinject({ onlyUpdateNewDoc: true });
                } else {
                    await session.reinject({ syncFromDaemon: false });
                }
            } catch (_) {}
        }
    });

    ws.addEventListener('open', async () => {
        try {
            const isAuthentic = await verifyDomIsAntigravity({ maxAttempts: 3, delayMs: 250 });
            if (!isAuthentic) {
                rememberIgnoredTarget(target.id, String(target.url || ''));
                log(`[security] Skipped non-Antigravity localhost page ${target.id} (${target.url}).`);
                try {
                    ws.close();
                } catch (_) {}
                return;
            }

            await send('Page.enable');
            await send('Runtime.enable');
            try {
                await send('Runtime.addBinding', { name: 'agySaveThemeConfig' });
            } catch (_) {}

            session.verified = true;
            await session.reinject({ initialAttach: true, syncFromDaemon: false });
            session.initialAttachDone = true;
            log(`Attached verified Antigravity target ${target.id} (${target.url})`);
        } catch (err) {
            session.verified = false;
            session.initialAttachDone = false;
            log(`Attach error for ${target.id}: ${err.message}`);
            try {
                ws.close();
            } catch (_) {}
        }
    });

    const cleanup = () => {
        session.verified = false;
        session.initialAttachDone = false;
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
        ignoredTargetFingerprints.clear();
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
        if (!isCandidateAntigravityUrl(url)) return false;
        if (ignoredTargetFingerprints.has(`${t.id}|${url}`)) return false;
        return true;
    });

    const liveIds = new Set(targets.filter((t) => t && t.type === 'page').map((p) => p.id));
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

let payloadWatcher = null;
let payloadWatchRetryTimer = null;

function watchPayload() {
    clearTimeout(payloadWatchRetryTimer);
    payloadWatchRetryTimer = null;
    if (payloadWatcher) return;
    try {
        if (!fs.existsSync(DIST_DIR)) {
            fs.mkdirSync(DIST_DIR, { recursive: true });
        }
        payloadWatcher = fs.watch(DIST_DIR, (_eventType, filename) => {
            if (filename && filename !== 'theme_payload.js') return;
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
                log('Detected dist/theme_payload.js update; hot-reloading verified pages.');
                for (const s of sessions.values()) {
                    if (s.verified) s.reinject();
                }
            }, 250);
        });
        payloadWatcher.on('error', (err) => {
            log(`fs.watch error (${err && err.code ? err.code : 'ERR'}): ${err ? err.message : err}`);
            if (payloadWatcher) {
                try {
                    payloadWatcher.close();
                } catch (_) {}
                payloadWatcher = null;
            }
            clearTimeout(payloadWatchRetryTimer);
            payloadWatchRetryTimer = setTimeout(watchPayload, 3000);
        });
    } catch (err) {
        log(`fs.watch skipped: ${err.message}`);
        clearTimeout(payloadWatchRetryTimer);
        payloadWatchRetryTimer = setTimeout(watchPayload, 3000);
    }
}

function shutdown(signal) {
    log(`Shutting down on ${signal}.`);
    clearTimeout(reloadTimer);
    clearTimeout(configBroadcastTimer);
    clearTimeout(payloadWatchRetryTimer);
    clearTimeout(externalConfigTimer);
    if (configWatcher) {
        try {
            configWatcher.close();
        } catch (_) {}
        configWatcher = null;
    }
    if (payloadWatcher) {
        try {
            payloadWatcher.close();
        } catch (_) {}
        payloadWatcher = null;
    }
    while (sseClients.length > 0) {
        const client = sseClients.pop();
        if (client) client.close();
    }
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
    watchExternalConfig();
    scanPages();
    setInterval(() => {
        checkExternalConfigUpdate();
        scanPages();
    }, 1500);
});
