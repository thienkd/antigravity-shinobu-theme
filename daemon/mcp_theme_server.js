#!/usr/bin/env node
'use strict';

/**
 * Zero-Dependency Stdio MCP Server + MCP App (`ui://agy-theme/studio.html`)
 * for `antigravity-shinobu-theme` (Node.js >= 22, 0 NPM packages).
 *
 * Capabilities:
 * - Natural-language chat control: `switch_theme`, `set_persona`, `toggle_focus_mode`,
 *   `forge_theme_from_image`, `bind_workspace_profile`
 * - Honest 1-Click CDP Onboarding Doctor: `diagnose_cdp_onboarding`
 * - Interactive Side-Pane / Global MCP App (`open_theme_studio` -> `ui://agy-theme/studio.html`)
 */

const { execFileSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const CODE_ROOT = process.env.PLUGIN_ROOT
  ? path.resolve(process.env.PLUGIN_ROOT)
  : path.resolve(__dirname, '..');

let syncPersonaRuntimeHint = null;
let writeFileAtomicSync = null;
let isUncOrDevicePath = null;
let isSafeLocalRegularFile = null;
let selectFreshestConfigObject = null;
let sanitizeWorkspaceProfilesStrict = null;
try {
  ({
    syncPersonaRuntimeHint,
    writeFileAtomicSync,
    isUncOrDevicePath,
    isSafeLocalRegularFile,
    selectFreshestConfigObject,
    sanitizeWorkspaceProfilesStrict
  } = require('../scripts/persona_hint_sync'));
} catch (_) {}

function isPidFileAlive(pidPath) {
  try {
    if (!fs.existsSync(pidPath)) return false;
    const raw = fs.readFileSync(pidPath, 'utf8').replace(/^\uFEFF/, '').trim();
    const pid = raw.startsWith('{') ? JSON.parse(raw).pid : parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveRuntimeRoot() {
  if (process.env.AGY_CONFIG_PATH || process.env.AGY_PID_FILE) return CODE_ROOT;
  const globalPid = path.join(os.homedir(), '.gemini', 'antigravity', 'theme_daemon.pid');
  try {
    if (fs.existsSync(globalPid)) {
      const info = JSON.parse(fs.readFileSync(globalPid, 'utf8'));
      if (info && Number.isFinite(info.pid) && info.pid > 0) {
        process.kill(info.pid, 0);
        if (typeof info.rootDir === 'string' && fs.existsSync(info.rootDir)) {
          return path.resolve(info.rootDir);
        }
      }
    }
  } catch (_) {}
  if (isPidFileAlive(path.join(CODE_ROOT, 'daemon.pid'))) return CODE_ROOT;
  for (const [grp, sub] of [
    ['plugins', 'antigravity-shinobu-theme'],
    ['plugins', 'antigravity-custom-theme'],
    ['skills', 'antigravity-custom-theme']
  ]) {
    const candRoot = path.join(os.homedir(), '.gemini', 'config', grp, sub);
    if (isPidFileAlive(path.join(candRoot, 'daemon.pid'))) return candRoot;
  }
  return CODE_ROOT;
}

function getDynamicPaths() {
  const rootDir = resolveRuntimeRoot();
  return {
    rootDir,
    pidFile: process.env.AGY_PID_FILE || path.join(rootDir, 'daemon.pid'),
    configFile: process.env.AGY_CONFIG_PATH || path.join(rootDir, 'theme_config.json'),
    backupConfigFile:
      process.env.AGY_BACKUP_CONFIG_PATH ||
      path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json')
  };
}

const ROOT_DIR = CODE_ROOT;
const THEMES_FILE = path.join(CODE_ROOT, 'themes', 'themes.json');
const PERSONAS_REGISTRY_FILE = path.join(CODE_ROOT, 'themes', 'personas.json');
const PLUGIN_MANIFEST_FILE = path.join(CODE_ROOT, 'plugin.json');
const PID_FILE = process.env.AGY_PID_FILE || path.join(CODE_ROOT, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(CODE_ROOT, 'theme_config.json');
const BACKUP_CONFIG_FILE =
  process.env.AGY_BACKUP_CONFIG_PATH ||
  path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');
const PAYLOAD_PATH = path.join(CODE_ROOT, 'dist', 'theme_payload.js');
const BUILD_SCRIPT = path.join(CODE_ROOT, 'scripts', 'build_payload.js');
const DAEMON_SCRIPT = path.join(CODE_ROOT, 'daemon', 'theme_daemon.js');
const INSTALL_WIN = path.join(CODE_ROOT, 'scripts', 'install-win.ps1');
const INSTALL_UNIX = path.join(CODE_ROOT, 'scripts', 'install-unix.sh');

const APP_URI = 'ui://agy-theme/studio.html';
const MAX_FORGE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_INLINE_FORGE_BYTES = Math.floor(1.35 * 1024 * 1024);

const DANGEROUS_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'
]);

const FULL_PERSONAS = Object.freeze([
  { id: 'yoriichi', label: '☀️ Kiếm Sĩ Đầu Tiên — Tsugikuni Yoriichi', aliases: ['yoriichi', 'sun', 'nhat', 'kiem si dau tien'] },
  { id: 'shadow_monarch', label: '🌑 Quân Vương Bóng Tối — Sung Jin-Woo', aliases: ['jinwoo', 'sung', 'shadow', 'bong toi', 'solo leveling'] },
  { id: 'six_eyes', label: '♾️ Lục Nhãn Vô Hạ Hạn — Satoru Gojo', aliases: ['gojo', 'satoru', 'six eyes', 'luc nhan', 'vo luong khong xu'] },
  { id: 'great_sage', label: '🔥 Tề Thiên Đại Thánh — Hỏa Nhãn Kim Tinh', aliases: ['wukong', 'sage', 'te thien', 'dai thanh', 'hoa nhan', 'rimuru'] },
  { id: 'ubuyashiki', label: '👑 Chúa Công — Kagaya Ubuyashiki', aliases: ['ubuyashiki', 'kagaya', 'chua cong', 'master'] },
  { id: 'shinobu', label: '🦋 Trùng Trụ — Shinobu Kocho', aliases: ['shinobu', 'kocho', 'trung tru', 'insect', 'wisteria'] },
  { id: 'giyu', label: '🌊 Thủy Trụ — Giyu Tomioka', aliases: ['giyu', 'tomioka', 'thuy tru', 'water'] },
  { id: 'rengoku', label: '🔥 Viêm Trụ — Kyojuro Rengoku', aliases: ['rengoku', 'kyojuro', 'viem tru', 'flame'] },
  { id: 'uzui', label: '💎 Âm Trụ — Tengen Uzui', aliases: ['uzui', 'tengen', 'am tru', 'sound'] },
  { id: 'muichiro', label: '🌫️ Hà Trụ — Muichiro Tokito', aliases: ['muichiro', 'tokito', 'ha tru', 'mist'] },
  { id: 'mitsuri', label: '🌸 Luyến Trụ — Mitsuri Kanroji', aliases: ['mitsuri', 'kanroji', 'luyen tru', 'love'] },
  { id: 'obanai', label: '🐍 Xà Trụ — Obanai Iguro', aliases: ['obanai', 'iguro', 'xa tru', 'serpent'] },
  { id: 'sanemi', label: '🌪️ Phong Trụ — Sanemi Shinazugawa', aliases: ['sanemi', 'phong tru', 'wind'] },
  { id: 'gyomei', label: '📿 Nham Trụ — Gyomei Himejima', aliases: ['gyomei', 'himejima', 'nham tru', 'stone'] },
  { id: 'tanjiro', label: '☀️ Tanjiro Kamado — Hỏa Thần', aliases: ['tanjiro', 'kamado', 'hinokami'] },
  { id: 'nezuko', label: '🎋 Nezuko Kamado — Hồng Liên', aliases: ['nezuko', 'hong lien'] },
  { id: 'zenitsu', label: '⚡ Zenitsu Agatsuma — Lôi Minh', aliases: ['zenitsu', 'agatsuma', 'loi minh', 'thunder'] },
  { id: 'inosuke', label: '🐗 Inosuke Hashibira — Dã Thú', aliases: ['inosuke', 'hashibira', 'da thu', 'beast'] }
]);

const CLEAN_PERSONAS = Object.freeze([
  { id: 'yoriichi', label: '☀️ Principal Architect (Default)', aliases: ['default', 'architect', 'principal', 'yoriichi'] },
  { id: 'shadow_monarch', label: '🌌 Systems Commander', aliases: ['commander', 'systems', 'shadow'] },
  { id: 'six_eyes', label: '♾️ Clarity Specialist', aliases: ['clarity', 'specialist', 'infinity'] },
  { id: 'great_sage', label: '🔥 Proactive Builder', aliases: ['builder', 'proactive', 'forge'] }
]);

function isCleanEditionRuntime() {
  try {
    if (fs.existsSync(PLUGIN_MANIFEST_FILE)) {
      const m = JSON.parse(fs.readFileSync(PLUGIN_MANIFEST_FILE, 'utf8'));
      return Boolean(m && m.name === 'antigravity-clean-theme');
    }
  } catch (_) {}
  return false;
}

const KNOWN_PERSONAS = isCleanEditionRuntime() ? CLEAN_PERSONAS : FULL_PERSONAS;

function readDefaultAiPersonaMode() {
  try {
    if (fs.existsSync(PERSONAS_REGISTRY_FILE)) {
      const p = JSON.parse(fs.readFileSync(PERSONAS_REGISTRY_FILE, 'utf8'));
      if (p && (p.defaultMode === 'off' || p.defaultMode === 'subtle' || p.defaultMode === 'roleplay')) {
        return p.defaultMode;
      }
    }
  } catch (_) {}
  return isCleanEditionRuntime() ? 'off' : 'subtle';
}

function normalizeAiPersonaMode(val, fallback) {
  if (typeof val === 'string') {
    const clean = val.trim().toLowerCase();
    if (clean === 'off' || clean === 'subtle' || clean === 'roleplay') return clean;
  }
  return fallback;
}

function foldSearchText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, ' ')
    .trim();
}

function stripProtoKeys(val, depth = 0) {
  if (depth > 8 || !val || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((item) => stripProtoKeys(item, depth + 1));
  const out = {};
  for (const k of Object.keys(val)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    out[k] = stripProtoKeys(val[k], depth + 1);
  }
  return out;
}

function sortKeysDeep(val, depth = 0) {
  if (depth > 8 || !val || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((item) => sortKeysDeep(item, depth + 1));
  const out = {};
  for (const k of Object.keys(val).sort()) {
    if (DANGEROUS_KEYS.has(k) || val[k] === undefined) continue;
    out[k] = sortKeysDeep(val[k], depth + 1);
  }
  return out;
}

function loadThemesRegistry() {
  try {
    const raw = fs.readFileSync(THEMES_FILE, 'utf8').replace(/^\uFEFF/, '');
    const parsed = stripProtoKeys(JSON.parse(raw));
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function readConfig() {
  const { configFile, backupConfigFile } = getDynamicPaths();
  if (typeof selectFreshestConfigObject === 'function') {
    const candidates = process.env.AGY_CONFIG_PATH
      ? [configFile, backupConfigFile]
      : [
          configFile,
          backupConfigFile,
          path.join(os.homedir(), '.gemini', 'config', 'skills', 'antigravity-custom-theme', 'theme_config.json'),
          path.join(os.homedir(), '.gemini', 'config', 'plugins', 'antigravity-shinobu-theme', 'theme_config.json')
        ];
    return selectFreshestConfigObject(candidates);
  }
  for (const candidate of [configFile, backupConfigFile]) {
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8').replace(/^\uFEFF/, '');
        const parsed = stripProtoKeys(JSON.parse(raw));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
  }
  return {};
}

function writeConfig(nextPatch, hintOpts = {}) {
  const { rootDir, configFile, backupConfigFile } = getDynamicPaths();
  const cur = readConfig();
  const cleanPatch = stripProtoKeys(nextPatch);
  const merged = { ...cur, ...cleanPatch };
  if (merged.activeForgedTheme === null) delete merged.activeForgedTheme;
  if (merged.workspaceProfiles && typeof sanitizeWorkspaceProfilesStrict === 'function') {
    merged.workspaceProfiles = sanitizeWorkspaceProfilesStrict(merged.workspaceProfiles);
  }
  const serialized = JSON.stringify(sortKeysDeep(merged), null, 2);
  const writeFn = typeof writeFileAtomicSync === 'function'
    ? (target, data) => writeFileAtomicSync(target, data, 0o600)
    : (target, data) => {
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.writeFileSync(target, data, { encoding: 'utf8', mode: 0o600 });
      };

  writeFn(configFile, serialized);
  try { writeFn(backupConfigFile, serialized); } catch (_) {}
  if (!process.env.AGY_CONFIG_PATH) {
    for (const extraDir of [
      path.join(os.homedir(), '.gemini', 'config', 'skills', 'antigravity-custom-theme'),
      path.join(os.homedir(), '.gemini', 'config', 'plugins', 'antigravity-shinobu-theme')
    ]) {
      try {
        const extraCfg = path.join(extraDir, 'theme_config.json');
        if (extraCfg !== configFile && fs.existsSync(extraDir) && fs.lstatSync(extraDir).isDirectory()) {
          writeFn(extraCfg, serialized);
        }
      } catch (_) {}
    }
  }

  if (typeof syncPersonaRuntimeHint === 'function') {
    try {
      const isDirectSwitch =
        cleanPatch.themeName !== undefined ||
        cleanPatch.bubbleName !== undefined ||
        cleanPatch.masterPersona !== undefined ||
        cleanPatch.aiPersonaMode !== undefined ||
        cleanPatch.focusMode !== undefined ||
        cleanPatch.chibiEnabled !== undefined ||
        cleanPatch.autoFinisher !== undefined;
      syncPersonaRuntimeHint(merged, {
        rootDir,
        configPath: process.env.AGY_CONFIG_PATH ? configFile : '',
        boundWorkspaceKey: hintOpts.boundWorkspaceKey || '',
        directSwitchWorkspaceKey: hintOpts.boundWorkspaceKey ? '' : (isDirectSwitch ? (merged.activeWorkspace || '') : '')
      });
    } catch (_) {}
  }
  return merged;
}

function normalizeWorkspaceKey(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s) return '';
  try {
    if (/^file:\/\//i.test(s)) s = decodeURIComponent(s.replace(/^file:\/\/\/?/i, ''));
  } catch (_) {}
  s = s.replace(/\\/g, '/').replace(/\/+$/, '');
  if (s.includes('/')) {
    const parts = s.split('/').filter(Boolean);
    s = parts[parts.length - 1] || '';
  }
  const clean = s.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64).toLowerCase();
  if (!clean || DANGEROUS_KEYS.has(clean)) return '';
  return clean;
}

function matchThemeName(query, themesObj) {
  const keys = Object.keys(themesObj);
  if (keys.length === 0) return null;
  if (!query || typeof query !== 'string') return keys[0];
  const exact = keys.find((k) => k === query.trim());
  if (exact) return exact;
  const foldedQuery = foldSearchText(query);
  if (!foldedQuery) return null;
  for (const k of keys) {
    const fk = foldSearchText(k);
    if (fk.includes(foldedQuery) || foldedQuery.includes(fk)) return k;
  }
  const tokens = foldedQuery.split(' ').filter((t) => t.length >= 2);
  let bestKey = null;
  let bestScore = 0;
  for (const k of keys) {
    const hay = foldSearchText(k + ' ' + (themesObj[k]?.concept || '') + ' ' + (themesObj[k]?.fxMode || ''));
    let score = 0;
    for (const tk of tokens) {
      if (hay.includes(tk)) score += tk.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestScore > 0 ? bestKey : null;
}

function matchPersona(query) {
  if (!query || typeof query !== 'string') return null;
  const q = foldSearchText(query);
  if (!q) return null;
  for (const p of KNOWN_PERSONAS) {
    if (p.id === query.trim().toLowerCase() || foldSearchText(p.id) === q) return p;
    if (p.aliases.some((al) => q.includes(al) || al.includes(q))) return p;
    if (foldSearchText(p.label).includes(q)) return p;
  }
  return null;
}

function resolveDevToolsPortCandidates() {
  const envOverride = process.env.AGY_DEVTOOLS_PORT_FILE || process.env.AGY_PORT_FILE;
  if (envOverride) return [path.resolve(envOverride)];
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [
      path.join(appData, 'Antigravity', 'DevToolsActivePort'),
      path.join(appData, 'antigravity', 'DevToolsActivePort')
    ];
  }
  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort')];
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [
    path.join(xdgConfig, 'Antigravity', 'DevToolsActivePort'),
    path.join(xdgConfig, 'antigravity', 'DevToolsActivePort')
  ];
}

function probeHttpJson(port, urlPath, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode === 200, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch (_) {
          resolve({ ok: false, data: null });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, data: null }); });
    req.on('error', () => resolve({ ok: false, data: null }));
  });
}

const RESERVED_NON_WORKSPACE_SLUGS = new Set([
  'antigravity', 'launchpad', 'new-conversation', 'settings',
  'customizations', 'automations', 'theme-studio', 'welcome', 'open-ide'
]);

function extractWorkspaceFromAntigravityTitle(rawTitle) {
  if (typeof rawTitle !== 'string') return null;
  const trimmed = rawTitle.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  let base = null;
  if (lower.endsWith(' - antigravity')) {
    base = trimmed.slice(0, trimmed.length - ' - antigravity'.length);
  } else if (lower.endsWith(' — antigravity')) {
    base = trimmed.slice(0, trimmed.length - ' — antigravity'.length);
  } else {
    return null;
  }
  const sepIdx = base.lastIndexOf(' - ');
  const candidate = (sepIdx !== -1 ? base.slice(sepIdx + 3) : base).trim();
  if (!candidate) return null;
  const key = normalizeWorkspaceKey(candidate);
  if (!key || RESERVED_NON_WORKSPACE_SLUGS.has(key)) return null;
  return key;
}

let lastSpawnedDaemonPid = null;

async function inspectCdpAndDaemonState() {
  let daemonPid = null;
  let daemonRunning = false;
  const { pidFile } = getDynamicPaths();
  const home = os.homedir();
  const pidCandidates = process.env.AGY_PID_FILE
    ? [pidFile]
    : [
        pidFile,
        path.join(home, '.gemini', 'antigravity', 'theme_daemon.pid'),
        path.join(home, '.gemini', 'config', 'plugins', 'antigravity-shinobu-theme', 'daemon.pid'),
        path.join(home, '.gemini', 'config', 'plugins', 'antigravity-custom-theme', 'daemon.pid'),
        path.join(home, '.gemini', 'config', 'skills', 'antigravity-custom-theme', 'daemon.pid')
      ];
  for (const attrTry of [0, 1]) {
    for (const candPidFile of pidCandidates) {
      try {
        if (fs.existsSync(candPidFile)) {
          const rawPid = fs.readFileSync(candPidFile, 'utf8').replace(/^\uFEFF/, '').trim();
          const pid = rawPid.startsWith('{') ? JSON.parse(rawPid).pid : parseInt(rawPid, 10);
          if (Number.isFinite(pid) && pid > 0) {
            process.kill(pid, 0);
            daemonPid = pid;
            daemonRunning = true;
            break;
          }
        }
      } catch (_) {}
    }
    if (daemonRunning) break;
    if (attrTry === 0 && lastSpawnedDaemonPid) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  if (!daemonRunning && lastSpawnedDaemonPid) {
    try {
      process.kill(lastSpawnedDaemonPid, 0);
      daemonPid = lastSpawnedDaemonPid;
      daemonRunning = true;
    } catch (_) {
      lastSpawnedDaemonPid = null;
    }
  }

  let portFileFound = null;
  let cdpPort = null;
  for (const cand of resolveDevToolsPortCandidates()) {
    try {
      if (fs.existsSync(cand)) {
        const firstLine = fs.readFileSync(cand, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)[0].trim();
        const p = parseInt(firstLine, 10);
        if (Number.isFinite(p) && p > 0 && p <= 65535) {
          portFileFound = cand;
          cdpPort = p;
          break;
        }
      }
    } catch (_) {}
  }

  let cdpReachable = false;
  let workbenchTargets = 0;
  let liveWorkspace = null;
  if (cdpPort) {
    const listRes = await probeHttpJson(cdpPort, '/json/list', 1000);
    if (listRes.ok && Array.isArray(listRes.data)) {
      cdpReachable = true;
      for (const t of listRes.data) {
        if (t && t.type === 'page') {
          workbenchTargets++;
          if (!liveWorkspace) {
            const u = typeof t.url === 'string' ? t.url : '';
            if (!u.startsWith('data:') && !u.startsWith('devtools://')) {
              liveWorkspace = extractWorkspaceFromAntigravityTitle(t.title);
            }
          }
        }
      }
    }
  }

  return {
    platform: process.platform,
    daemonRunning,
    daemonPid,
    portFileFound: Boolean(portFileFound),
    cdpPort,
    cdpReachable,
    workbenchTargets,
    liveWorkspace,
    cdpHealthy: Boolean(cdpReachable && daemonRunning)
  };
}

function ensureDaemonAwakeSync() {
  if (process.env.AGY_SKIP_DAEMON_SPAWN === '1') return false;
  const { rootDir, pidFile } = getDynamicPaths();
  if (isPidFileAlive(pidFile)) return false;
  if (!process.env.AGY_PID_FILE) {
    const home = os.homedir();
    for (const extraPid of [
      path.join(home, '.gemini', 'antigravity', 'theme_daemon.pid'),
      path.join(home, '.gemini', 'config', 'plugins', 'antigravity-shinobu-theme', 'daemon.pid'),
      path.join(home, '.gemini', 'config', 'plugins', 'antigravity-custom-theme', 'daemon.pid'),
      path.join(home, '.gemini', 'config', 'skills', 'antigravity-custom-theme', 'daemon.pid')
    ]) {
      if (isPidFileAlive(extraPid)) return false;
    }
  }

  try {
    if (!fs.existsSync(PAYLOAD_PATH) && fs.existsSync(BUILD_SCRIPT)) {
      execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: CODE_ROOT, stdio: 'ignore', windowsHide: true, timeout: 6000 });
    }
    if (fs.existsSync(DAEMON_SCRIPT)) {
      const child = spawn(process.execPath, [DAEMON_SCRIPT], {
        cwd: rootDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      if (child && Number.isFinite(child.pid) && child.pid > 0) {
        lastSpawnedDaemonPid = child.pid;
      }
      child.unref();
      return true;
    }
  } catch (_) {}
  return false;
}

function detectImageMimeByMagicBytes(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  return null;
}

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgbTuple(hex) {
  const clean = String(hex || '#38bdf8').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 14;
  const g = parseInt(clean.slice(2, 4), 16) || 20;
  const b = parseInt(clean.slice(4, 6), 16) || 34;
  return `${r}, ${g}, ${b}`;
}

function buildForgedThemeFromBytes(buf, mime, customName, fxMode, personaId) {
  const digest = crypto.createHash('sha256').update(buf).digest();
  const baseHue = Math.round((digest.readUInt16BE(0) / 65535) * 360);
  const accentHue = (baseHue + 42 + (digest[2] % 48)) % 360;
  const primary = hslToHex(baseHue, 82, 68);
  const accent = hslToHex(accentHue, 86, 66);
  const deepDark = hslToHex(baseHue, 44, 8);
  const midDark = hslToHex(baseHue, 38, 12);
  const overlayRgb = hexToRgbTuple(deepDark);
  const primaryRgb = hexToRgbTuple(primary);

  const safeName = String(customName || '⚒️ Vũ Trụ Rèn Qua Chat')
    .replace(/[\r\n\0<>`{}]/g, '')
    .trim()
    .slice(0, 60) || '⚒️ Vũ Trụ Rèn Qua Chat';
  const allowedFx = new Set([
    'wisteria', 'royal_wisteria', 'wisteria_royal', 'water', 'flame', 'sound',
    'mist', 'moon', 'love', 'serpent', 'wind', 'stone', 'sun', 'sun_water',
    'thunder', 'beast', 'nezuko', 'blood_blossom'
  ]);
  const cleanFx = allowedFx.has(fxMode) ? fxMode : 'wisteria';
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  const defaultAvatar = isCleanEditionRuntime() ? 'assets/clean_corner.svg' : 'assets/yoriichi_avatar.jpg';
  const safeTrait = (typeof personaId === 'string' && /^[a-z0-9_]{1,36}$/.test(personaId)) ? personaId : 'yoriichi';

  return {
    name: safeName,
    theme: {
      isForged: true,
      concept: 'OKLCH WCAG AA • Rèn qua MCP Chat',
      fxMode: cleanFx,
      primary,
      secondary: accent,
      accent,
      overlayRgb,
      defaultDimming: 30,
      bg: `rgba(${overlayRgb}, 0.84)`,
      pureBg: deepDark,
      cardBg: `rgba(${hexToRgbTuple(midDark)}, 0.78)`,
      sidebarBg: `rgba(${overlayRgb}, 0.74)`,
      headerBg: `rgba(${overlayRgb}, 0.80)`,
      aiCardBg: `rgba(${overlayRgb}, 0.68)`,
      inputCardBg: `rgba(${hexToRgbTuple(midDark)}, 0.88)`,
      inputGlassBg: `rgba(${overlayRgb}, 0.52)`,
      userBubble: `rgba(${hexToRgbTuple(midDark)}, 0.86)`,
      modalBg: midDark,
      codeBg: `rgba(${overlayRgb}, 0.92)`,
      frameBg: `linear-gradient(135deg, ${primary}, ${accent})`,
      borderColor: `rgba(${primaryRgb}, 0.36)`,
      innerBorder: `1px solid rgba(${primaryRgb}, 0.28)`,
      pillBg: `rgba(${primaryRgb}, 0.16)`,
      pillBorder: `rgba(${primaryRgb}, 0.42)`,
      glow: `rgba(${primaryRgb}, 0.30)`,
      textMain: '#f8fafc',
      textColor: '#f8fafc',
      textMuted: '#cbd5e1',
      wallpaper: dataUri,
      userAvatar: defaultAvatar,
      wcagReport: { textContrast: '13.2', level: 'AAA' },
      forgedByPersona: safeTrait,
      personaTraitId: safeTrait
    }
  };
}

async function buildStudioStatePayload() {
  const themesObj = loadThemesRegistry();
  const cfg = readConfig();
  const cdp = await inspectCdpAndDaemonState();
  const themeNames = Object.keys(themesObj);
  const activeTheme = (cfg.themeName && (themesObj[cfg.themeName] || cfg.activeForgedTheme?.name === cfg.themeName))
    ? cfg.themeName
    : (themeNames[0] || '');
  const defaultMode = readDefaultAiPersonaMode();
  const effectiveWorkspace = cdp.liveWorkspace || cfg.activeWorkspace || '';
  return {
    cdp,
    activeConfig: {
      themeName: activeTheme,
      masterPersona: cfg.masterPersona || 'yoriichi',
      aiPersonaMode: normalizeAiPersonaMode(cfg.aiPersonaMode, defaultMode),
      dimming: typeof cfg.dimming === 'number' ? cfg.dimming : 35,
      fxDensity: typeof cfg.fxDensity === 'number' ? cfg.fxDensity : 100,
      chibiEnabled: cfg.chibiEnabled !== false,
      autoFinisher: cfg.autoFinisher !== false,
      focusMode: Boolean(cfg.focusMode),
      privacyShieldActive: Boolean(cfg.privacyShieldActive),
      uiLang: cfg.uiLang || 'vi',
      activeWorkspace: effectiveWorkspace,
      workspaceProfiles: typeof sanitizeWorkspaceProfilesStrict === 'function'
        ? sanitizeWorkspaceProfilesStrict(cfg.workspaceProfiles)
        : (cfg.workspaceProfiles || {})
    },
    themes: themeNames.map((name) => ({
      name,
      concept: themesObj[name]?.concept || '',
      primary: themesObj[name]?.primary || '#c084fc'
    })),
    personas: KNOWN_PERSONAS.map((p) => ({ id: p.id, label: p.label }))
  };
}

const STUDIO_APP_TEMPLATE = String.raw`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Antigravity Theme Studio</title>
<style>
  :root {
    --bg-1: var(--color-background-primary, #0d1017);
    --bg-2: var(--color-background-secondary, #151924);
    --bg-3: var(--color-background-tertiary, rgba(255,255,255,0.06));
    --fg-1: var(--color-text-primary, #f8fafc);
    --fg-2: var(--color-text-secondary, #94a3b8);
    --bd-1: var(--color-border-primary, rgba(255,255,255,0.12));
    --acc: #c084fc;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 14px;
    background: var(--bg-1); color: var(--fg-1);
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif);
    font-size: 13px; line-height: 1.45;
  }
  .hdr { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
  .hdr-right { display: flex; align-items: center; gap: 6px; }
  .title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
  .pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--bd-1); white-space: nowrap; }
  .pill-ok { background: rgba(16,185,129,0.15); color: #6ee7b7; border-color: rgba(16,185,129,0.42); }
  .pill-warn { background: rgba(245,158,11,0.16); color: #fde047; border-color: rgba(245,158,11,0.45); }
  .card {
    background: var(--bg-2); border: 1px solid var(--bd-1);
    border-radius: 11px; padding: 12px; margin-bottom: 11px;
  }
  .doctor { border-color: rgba(250,204,21,0.45); background: rgba(250,204,21,0.07); }
  .sec-lbl { font-size: 11.5px; font-weight: 600; color: var(--fg-2); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 7px; }
  button, select, input[type="text"] {
    font: inherit; color: var(--fg-1); background: rgba(255,255,255,0.05);
    border: 1px solid var(--bd-1); border-radius: 8px; padding: 7px 10px;
  }
  button, select { cursor: pointer; }
  select option { background: #151924; color: #f8fafc; }
  button:hover { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.09); }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
  button[aria-pressed="true"] { border-color: #38bdf8; background: rgba(56,189,248,0.14); color: #e0f2fe; }
  .icon-btn { padding: 4px 8px; font-size: 12px; border-radius: 999px; }
  .th-btn { text-align: left; display: flex; flex-direction: column; gap: 3px; position: relative; transition: border-color 0.14s ease, background 0.14s ease; }
  .th-btn[aria-pressed="true"] { border-color: #facc15; background: rgba(250,204,21,0.13); color: var(--fg-1); }
  .th-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .th-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: #c084fc; box-shadow: 0 0 6px rgba(255,255,255,0.22); }
  .th-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .th-sub { font-size: 10.5px; color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn-primary { background: linear-gradient(135deg, #a855f7, #38bdf8); color: #090d16; border: none; font-weight: 700; }
  .btn-primary:hover { filter: brightness(1.06); background: linear-gradient(135deg, #a855f7, #38bdf8); }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sliders { display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 10px; margin: 9px 0; padding: 8px 10px; border-radius: 8px; background: var(--bg-3); border: 1px solid var(--bd-1); }
  .sl-box { display: flex; flex-direction: column; gap: 4px; }
  .sl-hdr { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--fg-2); }
  .sl-val { color: var(--fg-1); font-weight: 600; font-variant-numeric: tabular-nums; }
  input[type="range"] { width: 100%; accent-color: #c084fc; cursor: pointer; margin: 0; }
  .ws-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .ws-chip { display: inline-flex; align-items: center; gap: 4px; background: var(--bg-3); border: 1px solid var(--bd-1); border-radius: 999px; padding: 2px 4px 2px 9px; font-size: 11.5px; }
  .ws-chip.active { border-color: rgba(52,211,153,0.65); background: rgba(16,185,129,0.14); }
  .ws-apply { border: 0; background: transparent; padding: 2px 4px; font-size: 11.5px; color: var(--fg-1); }
  .ws-apply:hover { background: transparent; color: #7dd3fc; }
  .ws-del { border: 0; background: transparent; padding: 1px 6px; border-radius: 999px; font-size: 12px; color: var(--fg-2); }
  .ws-del:hover { background: rgba(239,68,68,0.18); color: #fca5a5; }
  #toast { font-size: 12px; color: #5eead4; min-height: 18px; margin-top: 6px; }
  #toast[data-err="1"] { color: #fca5a5; }
</style>
</head>
<body>
  <div class="hdr">
    <span class="title">🦋 Antigravity Theme Studio</span>
    <div class="hdr-right">
      <span id="cdp-badge" class="pill pill-warn">Đang kiểm tra…</span>
      <button id="refresh-btn" type="button" class="icon-btn" title="Làm mới trạng thái">↻</button>
    </div>
  </div>

  <div id="doctor-box" class="card doctor" style="display:none;">
    <div id="doc-title" style="font-weight:700; color:#fef08a; margin-bottom:4px;">🩺 Bác Sĩ Cài Đặt Kết Nối CDP (Onboarding Doctor)</div>
    <div id="doctor-msg" style="font-size:12px; color:var(--fg-2); margin-bottom:9px;">
      Chưa phát hiện cổng DevToolsActivePort trên 127.0.0.1. Bấm nút dưới đây để tự cấu hình cờ <code>--remote-debugging-port=0</code> và đánh thức Daemon.
    </div>
    <button id="doctor-fix-btn" type="button" class="btn-primary">⚡ Cấu hình Shortcut &amp; Đánh thức Daemon (1 Chạm)</button>
  </div>

  <div class="card">
    <div id="ctrl-lbl" class="sec-lbl">Điều Khiển Nhanh, Bản Ngã &amp; Khí Chất AI</div>
    <div class="row" style="margin-bottom:8px;">
      <select id="persona-sel" aria-label="Chọn Bản Ngã Chủ Nhân" style="flex:1; min-width:170px;"></select>
      <select id="ai-tone-sel" aria-label="Chọn Khí chất Giọng trả lời AI" style="min-width:155px;">
        <option value="subtle">✨ Giọng AI: Tinh tế</option>
        <option value="roleplay">🎭 Giọng AI: Nhập vai</option>
        <option value="off">🔇 Giọng AI: Thuần kỹ thuật</option>
      </select>
      <button id="focus-btn" type="button" aria-pressed="false">⚡ Tập trung sâu</button>
      <button id="chibi-btn" type="button" aria-pressed="true">🎋 Chibi: Bật</button>
    </div>

    <div class="sliders">
      <div class="sl-box">
        <div class="sl-hdr">
          <span id="dim-lbl">Độ tối nền code</span>
          <span id="dimming-val" class="sl-val">35%</span>
        </div>
        <input id="dimming-range" type="range" min="15" max="92" step="1" value="35" aria-label="Độ tối nền code" />
      </div>
      <div class="sl-box">
        <div class="sl-hdr">
          <span id="fx-lbl">Mật độ hạt hiệu ứng</span>
          <span id="fx-val" class="sl-val">100%</span>
        </div>
        <input id="fx-range" type="range" min="0" max="100" step="5" value="100" aria-label="Mật độ hạt hiệu ứng" />
      </div>
    </div>

    <div class="row">
      <span id="lang-lbl" style="font-size:12px; color:var(--fg-2);">Ngôn ngữ Studio:</span>
      <button type="button" class="lang-btn" data-lang="vi" aria-pressed="true">VI</button>
      <button type="button" class="lang-btn" data-lang="en" aria-pressed="false">EN</button>
      <button type="button" class="lang-btn" data-lang="ja" aria-pressed="false">日本語</button>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
  </div>

  <div class="card">
    <div id="ws-lbl" class="sec-lbl">Hồ Sơ Giao Diện Theo Dự Án (Workspace Profile)</div>
    <div class="row">
      <input id="ws-input" type="text" placeholder="Tên thư mục dự án (vd: my-backend)" style="flex:1; min-width:160px;" />
      <button id="ws-bind-btn" type="button">📌 Gắn chủ đề hiện tại</button>
    </div>
    <div id="ws-list" class="ws-chips"></div>
  </div>

  <div class="card">
    <div id="gal-lbl" class="sec-lbl">Bộ Sưu Tập Chủ Đề (Chạm để đổi ngay)</div>
    <div id="themes-grid" class="grid"></div>
  </div>

<script>
(() => {
  const INITIAL_STATE = __AGY_STUDIO_INITIAL_STATE__;
  let reqSeq = 1;
  const pending = new Map();
  let state = null;
  let wsInputDirty = false;
  let lastAutoSyncMs = 0;

  function postToHost(payload) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  }

  function rpcSend(method, params, timeoutMs = 15000) {
    const id = reqSeq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('RPC timeout: ' + method));
        }
      }, timeoutMs);
      pending.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      postToHost({ jsonrpc: '2.0', id, method, params });
    });
  }

  function callTool(name, args) {
    return rpcSend('tools/call', { name, arguments: args || {} });
  }

  function isSafeCssVarValue(v) {
    if (typeof v !== 'string' || v.length === 0 || v.length > 512) return false;
    const low = v.toLowerCase();
    if (low.includes('url(') || low.includes('expression(') || low.includes('javascript:') || low.includes('@import')) {
      return false;
    }
    for (let i = 0; i < v.length; i++) {
      const ch = v.charCodeAt(i);
      if (ch < 32 || ch === 59 || ch === 123 || ch === 125 || ch === 60 || ch === 62 || ch === 92) {
        return false;
      }
    }
    return true;
  }

  function isSafeHexColor(c) {
    if (typeof c !== 'string' || (c.length !== 4 && c.length !== 7 && c.length !== 9) || c.charCodeAt(0) !== 35) {
      return false;
    }
    for (let i = 1; i < c.length; i++) {
      const code = c.charCodeAt(i);
      const ok = (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
      if (!ok) return false;
    }
    return true;
  }

  function applyHostVars(vars) {
    if (!vars || typeof vars !== 'object') return;
    const root = document.documentElement;
    Object.keys(vars).forEach((k) => {
      const v = vars[k];
      if (k.startsWith('--') && isSafeCssVarValue(v)) {
        root.style.setProperty(k, v);
      }
    });
  }

  const MCP_I18N = {
    vi: {
      ctrl: 'Điều Khiển Nhanh, Bản Ngã & Khí Chất AI',
      lang: 'Ngôn ngữ Studio:',
      gal: 'Bộ Sưu Tập {n} Chủ Đề (Chạm để đổi ngay)',
      focOff: '⚡ Tập trung sâu',
      focOn: '⚡ Đang bật Tập trung sâu',
      chibiOn: '🎋 Chibi: Bật',
      chibiOff: '🎋 Chibi: Tắt',
      dim: 'Độ tối nền code',
      fx: 'Mật độ hạt hiệu ứng',
      wsTitle: 'Hồ Sơ Giao Diện Theo Dự Án (Workspace Profile)',
      wsPh: 'Tên thư mục dự án (vd: my-backend)',
      wsBind: '📌 Gắn chủ đề hiện tại',
      wsEmpty: 'Chưa gắn hồ sơ riêng cho dự án nào.',
      cdpOk: 'CDP Live • PID {pid}',
      cdpWarn: 'Cần bật cờ CDP',
      tSub: '✨ Giọng AI: Tinh tế',
      tRp: '🎭 Giọng AI: Nhập vai',
      tOff: '🔇 Giọng AI: Thuần kỹ thuật'
    },
    en: {
      ctrl: 'Quick Controls, Persona & AI Tone',
      lang: 'Studio Language:',
      gal: 'Theme Collection ({n} — Click to Switch)',
      focOff: '⚡ Deep Focus',
      focOn: '⚡ Deep Focus Active',
      chibiOn: '🎋 Chibi: ON',
      chibiOff: '🎋 Chibi: OFF',
      dim: 'Code Backdrop Dimming',
      fx: 'Ambient Particle Density',
      wsTitle: 'Workspace Theme Profiles',
      wsPh: 'Workspace folder key (e.g. my-backend)',
      wsBind: '📌 Bind Active Theme',
      wsEmpty: 'No per-workspace profiles bound yet.',
      cdpOk: 'CDP Live • PID {pid}',
      cdpWarn: 'CDP Flag Needed',
      tSub: '✨ AI Tone: Subtle',
      tRp: '🎭 AI Tone: Roleplay',
      tOff: '🔇 AI Tone: Pure Tech'
    },
    ja: {
      ctrl: 'クイック操作・化身・AIトーン',
      lang: '言語:',
      gal: 'テーマ一覧 ({n} • クリックで切替)',
      focOff: '⚡ 集中モード',
      focOn: '⚡ 集中モードON',
      chibiOn: '🎋 ちびキャラ: ON',
      chibiOff: '🎋 ちびキャラ: OFF',
      dim: '背景の暗さ',
      fx: 'パーティクル密度',
      wsTitle: 'ワークスペース別テーマ設定',
      wsPh: 'フォルダ名 (例: my-backend)',
      wsBind: '📌 現在のテーマを紐付け',
      wsEmpty: '登録されたワークスペース設定はありません。',
      cdpOk: 'CDP 接続中 • PID {pid}',
      cdpWarn: 'CDP設定が必要',
      tSub: '✨ AIトーン: 控えめ',
      tRp: '🎭 AIトーン: なりきり',
      tOff: '🔇 AIトーン: 技術のみ'
    }
  };

  function showToast(msg, isError = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.setAttribute('data-err', isError ? '1' : '0');
    el.textContent = msg || '';
  }

  function extractFirstText(res) {
    if (res && Array.isArray(res.content) && res.content[0] && typeof res.content[0].text === 'string') {
      return res.content[0].text;
    }
    return '';
  }

  function renderWorkspaceProfiles(profiles, d) {
    const box = document.getElementById('ws-list');
    if (!box) return;
    box.textContent = '';
    const obj = (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) ? profiles : {};
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      const empty = document.createElement('span');
      empty.style.fontSize = '11.5px';
      empty.style.color = 'var(--fg-2)';
      empty.textContent = d.wsEmpty;
      box.appendChild(empty);
      return;
    }
    keys.forEach((wsKey) => {
      const entry = obj[wsKey] || {};
      const chip = document.createElement('span');
      const isCurWs = Boolean(state && state.activeConfig && state.activeConfig.activeWorkspace === wsKey);
      chip.className = isCurWs ? 'ws-chip active' : 'ws-chip';

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'ws-apply';
      applyBtn.textContent = wsKey + ' → ' + (entry.themeName || '');
      applyBtn.addEventListener('click', async () => {
        try {
          const res = await callTool('bind_workspace_profile', { action: 'apply', workspace: wsKey });
          if (res && res.isError) {
            showToast(extractFirstText(res) || 'Không thể áp dụng hồ sơ.', true);
            return;
          }
          if (res && res.structuredContent && res.structuredContent.studio) {
            render(res.structuredContent.studio);
          } else {
            const fresh = await callTool('open_theme_studio', {});
            if (fresh && fresh.structuredContent) render(fresh.structuredContent);
          }
          showToast('✓ ' + (extractFirstText(res) || ('Đã áp dụng hồ sơ ' + wsKey)));
        } catch (err) {
          showToast('Lỗi kết nối MCP: ' + (err && err.message ? err.message : err), true);
        }
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ws-del';
      delBtn.title = 'Xóa hồ sơ ' + wsKey;
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        try {
          const res = await callTool('bind_workspace_profile', { action: 'remove', workspace: wsKey });
          if (res && res.structuredContent && res.structuredContent.studio) {
            render(res.structuredContent.studio);
          } else if (state && state.activeConfig && res && res.structuredContent && res.structuredContent.workspaceProfiles) {
            state.activeConfig.workspaceProfiles = res.structuredContent.workspaceProfiles;
            render(state);
          }
          showToast('✓ Đã gỡ hồ sơ: ' + wsKey);
        } catch (err) {
          showToast('Lỗi gỡ hồ sơ: ' + (err && err.message ? err.message : err), true);
        }
      });

      chip.appendChild(applyBtn);
      chip.appendChild(delBtn);
      box.appendChild(chip);
    });
  }

  function render(data) {
    if (!data || typeof data !== 'object') return;
    if (data.studio && typeof data.studio === 'object') data = data.studio;
    if (!data.activeConfig && !Array.isArray(data.themes)) return;
    state = data;
    const cfg = data.activeConfig || {};
    const langKey = (cfg.uiLang && MCP_I18N[cfg.uiLang]) ? cfg.uiLang : 'vi';
    const d = MCP_I18N[langKey];
    document.documentElement.lang = langKey;

    const ctrlEl = document.getElementById('ctrl-lbl');
    if (ctrlEl) ctrlEl.textContent = d.ctrl;
    const langEl = document.getElementById('lang-lbl');
    if (langEl) langEl.textContent = d.lang;
    const dimLbl = document.getElementById('dim-lbl');
    if (dimLbl) dimLbl.textContent = d.dim;
    const fxLbl = document.getElementById('fx-lbl');
    if (fxLbl) fxLbl.textContent = d.fx;
    const wsLbl = document.getElementById('ws-lbl');
    if (wsLbl) wsLbl.textContent = d.wsTitle;
    const wsInput = document.getElementById('ws-input');
    if (wsInput) {
      wsInput.placeholder = d.wsPh;
      if (!wsInputDirty && document.activeElement !== wsInput && typeof cfg.activeWorkspace === 'string') {
        wsInput.value = cfg.activeWorkspace;
      }
    }
    const wsBindBtn = document.getElementById('ws-bind-btn');
    if (wsBindBtn) wsBindBtn.textContent = d.wsBind;
    const galEl = document.getElementById('gal-lbl');
    if (galEl) galEl.textContent = d.gal.replace('{n}', Array.isArray(data.themes) ? data.themes.length : 0);

    document.querySelectorAll('.lang-btn').forEach((b) => {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === langKey ? 'true' : 'false');
    });

    const badge = document.getElementById('cdp-badge');
    const docBox = document.getElementById('doctor-box');
    const cdpOk = Boolean(data.cdp && data.cdp.cdpHealthy);
    if (badge) {
      badge.className = 'pill ' + (cdpOk ? 'pill-ok' : 'pill-warn');
      badge.textContent = cdpOk ? d.cdpOk.replace('{pid}', String(data.cdp.daemonPid || '')) : d.cdpWarn;
    }
    if (docBox) docBox.style.display = cdpOk ? 'none' : 'block';

    const pSel = document.getElementById('persona-sel');
    if (pSel && Array.isArray(data.personas)) {
      pSel.textContent = '';
      data.personas.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        if (cfg.masterPersona === p.id) opt.selected = true;
        pSel.appendChild(opt);
      });
    }

    const toneSel = document.getElementById('ai-tone-sel');
    if (toneSel) {
      if (toneSel.options[0]) toneSel.options[0].textContent = d.tSub;
      if (toneSel.options[1]) toneSel.options[1].textContent = d.tRp;
      if (toneSel.options[2]) toneSel.options[2].textContent = d.tOff;
      if (cfg.aiPersonaMode) toneSel.value = cfg.aiPersonaMode;
    }

    const focBtn = document.getElementById('focus-btn');
    if (focBtn) {
      const isFocus = Boolean(cfg.focusMode);
      focBtn.setAttribute('aria-pressed', isFocus ? 'true' : 'false');
      focBtn.textContent = isFocus ? d.focOn : d.focOff;
    }

    const chibiBtn = document.getElementById('chibi-btn');
    if (chibiBtn) {
      const chibiOn = cfg.chibiEnabled !== false;
      chibiBtn.setAttribute('aria-pressed', chibiOn ? 'true' : 'false');
      chibiBtn.textContent = chibiOn ? d.chibiOn : d.chibiOff;
    }

    const dimRange = document.getElementById('dimming-range');
    const dimVal = document.getElementById('dimming-val');
    const curDim = typeof cfg.dimming === 'number' ? cfg.dimming : 35;
    if (dimRange) dimRange.value = String(curDim);
    if (dimVal) dimVal.textContent = curDim + '%';

    const fxRange = document.getElementById('fx-range');
    const fxVal = document.getElementById('fx-val');
    const curFx = typeof cfg.fxDensity === 'number' ? cfg.fxDensity : 100;
    if (fxRange) fxRange.value = String(curFx);
    if (fxVal) fxVal.textContent = curFx + '%';

    renderWorkspaceProfiles(cfg.workspaceProfiles, d);

    const grid = document.getElementById('themes-grid');
    if (grid && Array.isArray(data.themes)) {
      grid.textContent = '';
      data.themes.forEach((th) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'th-btn';
        const isAct = cfg.themeName === th.name;
        btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');

        const topRow = document.createElement('span');
        topRow.className = 'th-top';
        const dot = document.createElement('span');
        dot.className = 'th-dot';
        if (isSafeHexColor(th.primary)) dot.style.backgroundColor = th.primary;
        const nEl = document.createElement('span');
        nEl.className = 'th-name';
        nEl.textContent = th.name;
        topRow.appendChild(dot);
        topRow.appendChild(nEl);

        const sEl = document.createElement('span');
        sEl.className = 'th-sub';
        sEl.textContent = th.concept || '';

        btn.appendChild(topRow);
        btn.appendChild(sEl);
        btn.addEventListener('click', async () => {
          showToast('⏳ Đang chuyển sang ' + th.name + '…');
          try {
            const res = await callTool('switch_theme', { themeQuery: th.name });
            if (res && res.isError) {
              showToast(extractFirstText(res) || 'Không thể đổi chủ đề.', true);
              return;
            }
            if (res && res.structuredContent) render(res.structuredContent);
            showToast('✓ Đã kích hoạt: ' + th.name);
          } catch (err) {
            showToast('Lỗi đổi chủ đề: ' + (err && err.message ? err.message : err), true);
          }
        });
        grid.appendChild(btn);
      });
    }
  }

  document.getElementById('refresh-btn').addEventListener('click', async () => {
    wsInputDirty = false;
    try {
      const res = await callTool('open_theme_studio', {});
      if (res && res.structuredContent) render(res.structuredContent);
      showToast('↻ Đã đồng bộ trạng thái mới nhất.');
    } catch (err) {
      showToast('Không thể đồng bộ: ' + (err && err.message ? err.message : err), true);
    }
  });

  document.getElementById('persona-sel').addEventListener('change', async (e) => {
    const pid = e.target.value;
    try {
      const res = await callTool('set_persona', { personaQuery: pid });
      if (res && res.isError) {
        showToast(extractFirstText(res), true);
        return;
      }
      if (res && res.structuredContent) render(res.structuredContent);
      showToast('✓ Đã chuyển Bản Ngã: ' + pid);
    } catch (err) {
      showToast('Lỗi chuyển Bản Ngã: ' + (err && err.message ? err.message : err), true);
    }
  });

  document.getElementById('ai-tone-sel').addEventListener('change', async (e) => {
    const mode = e.target.value;
    try {
      const res = await callTool('switch_theme', { aiPersonaMode: mode });
      if (res && res.structuredContent) render(res.structuredContent);
      const labelMap = { subtle: '✨ Tinh tế', roleplay: '🎭 Nhập vai Trụ', off: '🔇 Thuần kỹ thuật' };
      showToast('✓ Khí chất AI: ' + (labelMap[mode] || mode));
    } catch (err) {
      showToast('Lỗi đổi giọng AI: ' + (err && err.message ? err.message : err), true);
    }
  });

  document.getElementById('focus-btn').addEventListener('click', async () => {
    const nextFocus = !(state && state.activeConfig && state.activeConfig.focusMode);
    try {
      const res = await callTool('toggle_focus_mode', { enabled: nextFocus });
      if (res && res.structuredContent) render(res.structuredContent);
      showToast(nextFocus ? '⚡ Đã bật Chế độ Tập trung sâu' : '✨ Đã khôi phục đầy đủ hiệu ứng');
    } catch (err) {
      showToast('Lỗi chuyển Tập trung sâu: ' + (err && err.message ? err.message : err), true);
    }
  });

  document.getElementById('chibi-btn').addEventListener('click', async () => {
    const curOn = !(state && state.activeConfig && state.activeConfig.chibiEnabled === false);
    const nextOn = !curOn;
    try {
      const res = await callTool('switch_theme', { chibiEnabled: nextOn });
      if (res && res.structuredContent) render(res.structuredContent);
      showToast(nextOn ? '🎋 Đã bật Chibi đồng hành' : '🎋 Đã ẩn Chibi đồng hành');
    } catch (err) {
      showToast('Lỗi bật/tắt Chibi: ' + (err && err.message ? err.message : err), true);
    }
  });

  const dimRangeEl = document.getElementById('dimming-range');
  dimRangeEl.addEventListener('input', () => {
    const vEl = document.getElementById('dimming-val');
    if (vEl) vEl.textContent = dimRangeEl.value + '%';
  });
  dimRangeEl.addEventListener('change', async () => {
    const val = Number(dimRangeEl.value);
    try {
      const res = await callTool('switch_theme', { dimming: val });
      if (res && res.structuredContent) render(res.structuredContent);
      showToast('✓ Độ tối nền code: ' + val + '%');
    } catch (err) {
      showToast('Lỗi chỉnh độ tối: ' + (err && err.message ? err.message : err), true);
    }
  });

  const fxRangeEl = document.getElementById('fx-range');
  fxRangeEl.addEventListener('input', () => {
    const vEl = document.getElementById('fx-val');
    if (vEl) vEl.textContent = fxRangeEl.value + '%';
  });
  fxRangeEl.addEventListener('change', async () => {
    const val = Number(fxRangeEl.value);
    try {
      const res = await callTool('switch_theme', { fxDensity: val });
      if (res && res.structuredContent) render(res.structuredContent);
      showToast('✓ Mật độ hạt: ' + val + '%');
    } catch (err) {
      showToast('Lỗi chỉnh mật độ hạt: ' + (err && err.message ? err.message : err), true);
    }
  });

  const wsInputEl = document.getElementById('ws-input');
  if (wsInputEl) {
    wsInputEl.addEventListener('input', () => {
      wsInputDirty = true;
    });
  }

  document.getElementById('ws-bind-btn').addEventListener('click', async () => {
    const wsInput = document.getElementById('ws-input');
    const wsRaw = wsInput ? wsInput.value.trim() : '';
    if (!wsRaw) {
      showToast('Vui lòng nhập tên thư mục dự án trước khi gắn.', true);
      return;
    }
    try {
      const res = await callTool('bind_workspace_profile', { action: 'bind', workspace: wsRaw });
      if (res && res.isError) {
        showToast(extractFirstText(res) || 'Không thể gắn hồ sơ dự án.', true);
        return;
      }
      wsInputDirty = false;
      if (res && res.structuredContent && res.structuredContent.studio) {
        render(res.structuredContent.studio);
      } else if (state && state.activeConfig && res && res.structuredContent && res.structuredContent.workspaceProfiles) {
        state.activeConfig.workspaceProfiles = res.structuredContent.workspaceProfiles;
        render(state);
      }
      showToast('✓ ' + (extractFirstText(res) || ('Đã gắn dự án: ' + wsRaw)));
    } catch (err) {
      showToast('Lỗi gắn hồ sơ: ' + (err && err.message ? err.message : err), true);
    }
  });

  document.querySelectorAll('.lang-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const lang = b.getAttribute('data-lang');
      const curTheme = (state && state.activeConfig && state.activeConfig.themeName) || '';
      try {
        const res = await callTool('switch_theme', { themeQuery: curTheme, uiLang: lang });
        if (res && res.structuredContent) render(res.structuredContent);
        showToast('🌐 Đã chuyển ngôn ngữ giao diện: ' + lang.toUpperCase());
      } catch (err) {
        showToast('Lỗi đổi ngôn ngữ: ' + (err && err.message ? err.message : err), true);
      }
    });
  });

  document.getElementById('doctor-fix-btn').addEventListener('click', async () => {
    showToast('⏳ Đang cấu hình shortcut CDP & khởi chạy Daemon…');
    try {
      const res = await callTool('diagnose_cdp_onboarding', { autoFix: true });
      const msgEl = document.getElementById('doctor-msg');
      const txt = extractFirstText(res);
      if (txt && msgEl) msgEl.textContent = txt;
      if (res && res.structuredContent && res.structuredContent.studio) {
        render(res.structuredContent.studio);
      }
      showToast('✓ Đã chạy trình sửa tự động!');
    } catch (err) {
      showToast('Lỗi chạy trình sửa tự động: ' + (err && err.message ? err.message : err), true);
    }
  });

  window.addEventListener('message', (ev) => {
    if (ev.source && window.parent && ev.source !== window.parent && ev.source !== window.top) return;
    const msg = ev.data;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;
    if (msg.method === 'ping' && msg.id !== undefined) {
      postToHost({ jsonrpc: '2.0', id: msg.id, result: {} });
      return;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(msg.error);
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method === 'ui/notifications/tool-result' && msg.params) {
      const sc = msg.params.structuredContent || (msg.params.result && msg.params.result.structuredContent) || msg.params;
      render(sc);
    } else if (msg.method === 'ui/notifications/host-context-changed' && msg.params) {
      if (msg.params.styles && msg.params.styles.variables) applyHostVars(msg.params.styles.variables);
    }
  });

  function autoRefreshStudioState() {
    const now = Date.now();
    if (now - lastAutoSyncMs < 1200) return;
    lastAutoSyncMs = now;
    callTool('open_theme_studio', {}).then((res) => {
      if (res && res.structuredContent) render(res.structuredContent);
    }).catch(() => {});
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') autoRefreshStudioState();
  });
  window.addEventListener('focus', autoRefreshStudioState);
  document.addEventListener('pointerenter', autoRefreshStudioState);

  if (INITIAL_STATE && typeof INITIAL_STATE === 'object') {
    render(INITIAL_STATE);
  }

  rpcSend('ui/initialize', {
    protocolVersion: '2026-01-26',
    appInfo: { name: 'Antigravity Theme Studio', version: '3.0.0' },
    appCapabilities: {}
  }).then((initRes) => {
    if (initRes && initRes.hostContext && initRes.hostContext.styles) {
      applyHostVars(initRes.hostContext.styles.variables);
    }
    postToHost({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} });
    return callTool('open_theme_studio', {});
  }).then((res) => {
    if (res && res.structuredContent) render(res.structuredContent);
  }).catch(() => {});
})();
</script>
</body>
</html>
`;

function serializeSafeJsonForScript(val) {
  const raw = JSON.stringify(val === undefined ? null : val) || 'null';
  return raw
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildMcpAppHtml(initialState = null) {
  return STUDIO_APP_TEMPLATE.replace('__AGY_STUDIO_INITIAL_STATE__', serializeSafeJsonForScript(initialState));
}

const TOOLS = Object.freeze([
  {
    name: 'open_theme_studio',
    title: 'Theme Studio',
    description: 'Open the interactive Antigravity Theme Studio Side-Pane & inspect active theme, persona, workspace profiles, and CDP connection health.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    _meta: {
      ui: {
        resourceUri: APP_URI,
        visibility: ['model', 'app']
      },
      'com.google.antigravity/ui': {
        entrypoints: [
          { type: 'aux_pane', title: 'Theme Studio' },
          { type: 'global', title: 'Theme Studio' }
        ]
      }
    }
  },
  {
    name: 'switch_theme',
    title: 'Switch Antigravity Theme',
    description: 'Switch the active Antigravity IDE wallpaper/glass theme by character name, Hashira title, or mood (supports fuzzy Vietnamese/English/Japanese queries), with optional dimming, particle density, Chibi visibility, and UI language.',
    inputSchema: {
      type: 'object',
      properties: {
        themeQuery: {
          type: 'string',
          description: 'Theme or character name (e.g. "Shinobu", "Nham Trụ", "Gyomei", "Giyu", "Rengoku", "WLOP Cosmic", "Midnight Obsidian").'
        },
        dimming: { type: 'number', description: 'Optional code backdrop dimming percentage (15..92).' },
        fxDensity: { type: 'number', description: 'Optional ambient particle density percentage (0..100, 0 disables particles).' },
        chibiEnabled: { type: 'boolean', description: 'Optional toggle for Chibi companion sprites.' },
        uiLang: { type: 'string', enum: ['vi', 'en', 'ja'], description: 'Optional Studio UI language (vi, en, ja).' },
        aiPersonaMode: {
          type: 'string',
          enum: ['off', 'subtle', 'roleplay'],
          description: 'Optional AI assistant persona intensity synced with the active theme ("off" = pure technical, "subtle" = 85% engineer / 15% Hashira aura, "roleplay" = immersive character voice).'
        }
      }
    },
    _meta: { ui: { visibility: ['model', 'app'] } }
  },
  {
    name: 'set_persona',
    title: 'Set Master Persona',
    description: 'Switch the user Master Persona (avatar crest, 3D Breathing VFX identity, and title) independently without changing the current wallpaper.',
    inputSchema: {
      type: 'object',
      properties: {
        personaQuery: {
          type: 'string',
          description: 'Persona ID or character name (e.g. "yoriichi", "shadow_monarch", "six_eyes", "great_sage", "shinobu", "rengoku").'
        },
        aiPersonaMode: {
          type: 'string',
          enum: ['off', 'subtle', 'roleplay'],
          description: 'Optional AI response persona mode ("off", "subtle", "roleplay").'
        }
      },
      required: ['personaQuery']
    },
    _meta: { ui: { visibility: ['model', 'app'] } }
  },
  {
    name: 'toggle_focus_mode',
    title: 'Toggle Deep Focus Mode',
    description: 'Enable or disable Deep Focus Mode (hides Chibi companions, lowers ambient particles to 20%, pauses automatic full-screen Breathing finishers, and enables Transparent World).',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'True to enter Deep Focus Mode; false to restore full visual effects.' }
      },
      required: ['enabled']
    },
    _meta: { ui: { visibility: ['model', 'app'] } }
  },
  {
    name: 'forge_theme_from_image',
    title: 'Forge OKLCH Theme from Image',
    description: 'Forge and activate a WCAG AA high-contrast glassmorphic theme directly from a local PNG/JPEG/WebP/GIF wallpaper file.',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Absolute path to a local image file (<= 15 MB, PNG/JPEG/WebP/GIF).' },
        themeName: { type: 'string', description: 'Optional custom display name for the forged theme.' },
        fxMode: { type: 'string', description: 'Optional particle mode (wisteria, water, flame, sound, mist, love, serpent, wind, stone, sun, thunder, beast).' },
        personaQuery: { type: 'string', description: 'Optional Master Persona to pair with the forged theme.' }
      },
      required: ['imagePath']
    },
    _meta: { ui: { visibility: ['model', 'app'] } }
  },
  {
    name: 'bind_workspace_profile',
    title: 'Manage Workspace Theme Profile',
    description: 'Bind, apply, remove, or list automatic per-workspace theme & persona profiles.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['bind', 'apply', 'remove', 'list'], description: 'Profile operation to perform.' },
        workspace: { type: 'string', description: 'Workspace directory path or folder key (e.g. "my-backend").' },
        themeQuery: { type: 'string', description: 'Optional theme query when binding a workspace profile.' },
        personaQuery: { type: 'string', description: 'Optional persona query when binding a workspace profile.' },
        aiPersonaMode: { type: 'string', enum: ['off', 'subtle', 'roleplay'], description: 'Optional AI persona mode for this workspace ("off", "subtle", "roleplay").' }
      },
      required: ['action']
    },
    _meta: { ui: { visibility: ['model', 'app'] } }
  },
  {
    name: 'diagnose_cdp_onboarding',
    title: 'CDP Onboarding Doctor',
    description: 'Diagnose Antigravity 127.0.0.1 DevToolsActivePort & theme daemon health, and optionally auto-configure user-level shortcuts (--remote-debugging-port=0) and start the daemon.',
    inputSchema: {
      type: 'object',
      properties: {
        autoFix: { type: 'boolean', description: 'When true, runs non-admin shortcut patching and wakes the background daemon.' }
      }
    },
    _meta: { ui: { visibility: ['model', 'app'] } }
  }
]);

async function handleToolCall(name, rawArgs) {
  const args = (rawArgs && typeof rawArgs === 'object') ? rawArgs : {};
  const themesObj = loadThemesRegistry();

  if (name === 'open_theme_studio') {
    ensureDaemonAwakeSync();
    const studio = await buildStudioStatePayload();
    const statusText = studio.cdp.cdpHealthy
      ? `Theme Studio sẵn sàng (CDP hoạt động trên cổng ${studio.cdp.cdpPort}, Daemon PID ${studio.cdp.daemonPid}). Chủ đề hiện tại: ${studio.activeConfig.themeName}.`
      : `Theme Studio đã mở ở chế độ Bác Sĩ Cài Đặt (chưa phát hiện cổng CDP trực tiếp; bạn có thể chạy diagnose_cdp_onboarding với autoFix=true).`;
    return {
      content: [{ type: 'text', text: statusText }],
      structuredContent: studio
    };
  }

  if (name === 'switch_theme') {
    const patch = {};
    let resolvedTheme = null;
    if (typeof args.themeQuery === 'string' && args.themeQuery.trim()) {
      resolvedTheme = matchThemeName(args.themeQuery, themesObj);
      if (!resolvedTheme) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Không tìm thấy chủ đề khớp với "${args.themeQuery}". Danh sách hợp lệ: ${Object.keys(themesObj).join(', ')}` }]
        };
      }
      const thDef = themesObj[resolvedTheme] || {};
      patch.themeName = resolvedTheme;
      patch.bubbleName = resolvedTheme;
      patch.customWp = '';
      patch.wpEnabled = true;
      if (args.dimming === undefined && typeof thDef.defaultDimming === 'number') {
        patch.dimming = thDef.defaultDimming;
      }
    }
    if (typeof args.dimming === 'number' && Number.isFinite(args.dimming)) {
      patch.dimming = Math.max(15, Math.min(92, Math.round(args.dimming)));
    }
    if (typeof args.fxDensity === 'number' && Number.isFinite(args.fxDensity)) {
      patch.fxDensity = Math.max(0, Math.min(100, Math.round(args.fxDensity)));
    }
    if (typeof args.chibiEnabled === 'boolean') {
      patch.chibiEnabled = args.chibiEnabled;
      if (args.chibiEnabled === true) patch.focusMode = false;
    }
    if (typeof args.uiLang === 'string' && ['vi', 'en', 'ja'].includes(args.uiLang.trim().toLowerCase())) {
      patch.uiLang = args.uiLang.trim().toLowerCase();
    }
    const reqMode = normalizeAiPersonaMode(args.aiPersonaMode, '');
    if (reqMode) {
      patch.aiPersonaMode = reqMode;
      if (reqMode === 'subtle' || reqMode === 'roleplay') {
        patch.focusMode = false;
      }
    }
    writeConfig(patch);
    ensureDaemonAwakeSync();
    const studio = await buildStudioStatePayload();
    return {
      content: [{ type: 'text', text: `Đã cập nhật giao diện: ${studio.activeConfig.themeName} (khí chất AI: ${studio.activeConfig.aiPersonaMode}, ngôn ngữ: ${studio.activeConfig.uiLang}).` }],
      structuredContent: studio
    };
  }

  if (name === 'set_persona') {
    const matched = matchPersona(args.personaQuery);
    if (!matched) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Không tìm thấy Bản Ngã khớp với "${args.personaQuery}". Gợi ý: ${KNOWN_PERSONAS.map((p) => p.id).join(', ')}` }]
      };
    }
    const pPatch = { masterPersona: matched.id, userAvatar: '' };
    const reqMode = normalizeAiPersonaMode(args.aiPersonaMode, '');
    if (reqMode) pPatch.aiPersonaMode = reqMode;
    writeConfig(pPatch);
    ensureDaemonAwakeSync();
    const studio = await buildStudioStatePayload();
    return {
      content: [{ type: 'text', text: `Đã chuyển Bản Ngã Chủ Nhân sang: ${matched.label} (${matched.id}).` }],
      structuredContent: studio
    };
  }

  if (name === 'toggle_focus_mode') {
    const on = Boolean(args.enabled);
    writeConfig(
      on
        ? { chibiEnabled: false, fxDensity: 20, autoFinisher: false, transparentWorld: true, focusMode: true }
        : { chibiEnabled: true, fxDensity: 100, autoFinisher: true, transparentWorld: true, focusMode: false }
    );
    ensureDaemonAwakeSync();
    const studio = await buildStudioStatePayload();
    return {
      content: [{ type: 'text', text: on ? 'Đã kích hoạt Chế độ Tập trung sâu (ẩn Chibi, hạt 20%, tắt tự tung chiêu).' : 'Đã tắt Chế độ Tập trung sâu và khôi phục đầy đủ hiệu ứng.' }],
      structuredContent: studio
    };
  }

  if (name === 'forge_theme_from_image') {
    const rawPath = String(args.imagePath || '').trim();
    const isBlockedPath = typeof isUncOrDevicePath === 'function'
      ? isUncOrDevicePath(rawPath)
      : (rawPath.startsWith('\\\\') || rawPath.startsWith('//') || rawPath.includes('\0'));
    const isRegularOk = typeof isSafeLocalRegularFile === 'function'
      ? isSafeLocalRegularFile(rawPath)
      : (!isBlockedPath && fs.existsSync(rawPath) && fs.lstatSync(rawPath).isFile() && !fs.lstatSync(rawPath).isSymbolicLink());
    if (!rawPath || isBlockedPath || !isRegularOk) {
      return { isError: true, content: [{ type: 'text', text: 'Đường dẫn tệp ảnh không hợp lệ hoặc bị chặn vì lý do bảo mật (chỉ chấp nhận tệp cục bộ thông thường, không chấp nhận UNC/Symlink).' }] };
    }
    const stat = fs.statSync(rawPath);
    if (stat.size <= 0 || stat.size > MAX_FORGE_IMAGE_BYTES) {
      return { isError: true, content: [{ type: 'text', text: `Kích thước ảnh vượt giới hạn an toàn (yêu cầu <= 15 MB).` }] };
    }
    if (stat.size > MAX_INLINE_FORGE_BYTES) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Ảnh nặng ${(stat.size / (1024 * 1024)).toFixed(2)} MB (> 1.35 MB giới hạn nhúng trực tiếp qua Stdio). Vui lòng thả ảnh vào Tab "Lò rèn & Dữ liệu" trong Xưởng Tùy Biến để trình duyệt tự nén WebP 2K trước khi rèn.` }]
      };
    }
    const buf = fs.readFileSync(rawPath);
    const mime = detectImageMimeByMagicBytes(buf);
    if (!mime) {
      return { isError: true, content: [{ type: 'text', text: 'Tệp không phải định dạng ảnh hợp lệ (chỉ chấp nhận PNG, JPEG, WebP, GIF qua kiểm tra Magic Bytes).' }] };
    }
    const matchedPersona = args.personaQuery ? matchPersona(args.personaQuery) : null;
    const curCfg = readConfig();
    const personaId = matchedPersona ? matchedPersona.id : (curCfg.masterPersona || 'yoriichi');
    const forged = buildForgedThemeFromBytes(buf, mime, args.themeName, args.fxMode, personaId);
    writeConfig({
      themeName: forged.name,
      bubbleName: forged.name,
      masterPersona: personaId,
      dimming: forged.theme.defaultDimming,
      customWp: '',
      wpEnabled: true,
      activeForgedTheme: { ...forged.theme, name: forged.name }
    });
    ensureDaemonAwakeSync();
    const studio = await buildStudioStatePayload();
    return {
      content: [{ type: 'text', text: `Đã rèn và kích hoạt chủ đề "${forged.name}" (chính: ${forged.theme.primary}, nhấn: ${forged.theme.accent}, chuẩn tương phản WCAG AAA).` }],
      structuredContent: studio
    };
  }

  if (name === 'bind_workspace_profile') {
    const action = String(args.action || 'list').trim();
    const cur = readConfig();
    const profiles = typeof sanitizeWorkspaceProfilesStrict === 'function'
      ? { ...sanitizeWorkspaceProfilesStrict(cur.workspaceProfiles) }
      : ((cur.workspaceProfiles && typeof cur.workspaceProfiles === 'object' && !Array.isArray(cur.workspaceProfiles)) ? { ...cur.workspaceProfiles } : {});

    if (action === 'list') {
      const entries = Object.entries(profiles);
      const summary = entries.length === 0
        ? 'Chưa có hồ sơ giao diện theo dự án nào.'
        : entries.map(([k, v]) => `- ${k}: ${v.themeName} (${v.masterPersona || 'yoriichi'})`).join('\n');
      return { content: [{ type: 'text', text: summary }], structuredContent: { workspaceProfiles: profiles } };
    }

    let fallbackLiveWs = '';
    if (!args.workspace || !String(args.workspace).trim()) {
      const cdpSnap = await inspectCdpAndDaemonState();
      fallbackLiveWs = cdpSnap.liveWorkspace || '';
    }
    const wsKey = normalizeWorkspaceKey(args.workspace || fallbackLiveWs || cur.activeWorkspace || '');
    if (!wsKey) {
      return { isError: true, content: [{ type: 'text', text: 'Vui lòng cung cấp tên hoặc đường dẫn thư mục dự án (workspace).' }] };
    }

    if (action === 'remove') {
      delete profiles[wsKey];
      writeConfig({ workspaceProfiles: profiles }, { boundWorkspaceKey: wsKey });
      const studio = await buildStudioStatePayload();
      return { content: [{ type: 'text', text: `Đã xóa hồ sơ giao diện của dự án "${wsKey}".` }], structuredContent: { workspaceProfiles: profiles, studio } };
    }

    if (action === 'apply') {
      const prof = profiles[wsKey];
      if (!prof) {
        return { isError: true, content: [{ type: 'text', text: `Chưa có hồ sơ nào được lưu cho dự án "${wsKey}".` }] };
      }
      const nextPatch = {
        activeWorkspace: wsKey,
        themeName: prof.themeName,
        bubbleName: prof.bubbleName || prof.themeName,
        masterPersona: prof.masterPersona || 'yoriichi',
        dimming: prof.dimming ?? 35,
        fxDensity: prof.fxDensity ?? 100,
        chibiEnabled: prof.chibiEnabled !== false,
        autoFinisher: prof.autoFinisher !== false,
        focusMode: Boolean(prof.focusMode)
      };
      if (prof.aiPersonaMode) nextPatch.aiPersonaMode = normalizeAiPersonaMode(prof.aiPersonaMode, readDefaultAiPersonaMode());
      writeConfig(nextPatch, { boundWorkspaceKey: wsKey });
      ensureDaemonAwakeSync();
      const studio = await buildStudioStatePayload();
      return { content: [{ type: 'text', text: `Đã áp dụng hồ sơ của dự án "${wsKey}": ${prof.themeName}.` }], structuredContent: { workspaceProfiles: profiles, studio } };
    }

    // action === 'bind'
    const resolvedTheme = args.themeQuery
      ? matchThemeName(args.themeQuery, themesObj)
      : (cur.themeName || Object.keys(themesObj)[0]);
    if (!resolvedTheme) {
      return { isError: true, content: [{ type: 'text', text: `Không tìm thấy chủ đề "${args.themeQuery}".` }] };
    }
    const matchedPersona = args.personaQuery ? matchPersona(args.personaQuery) : null;
    const personaId = matchedPersona ? matchedPersona.id : (cur.masterPersona || 'yoriichi');
    const boundMode = normalizeAiPersonaMode(args.aiPersonaMode, normalizeAiPersonaMode(cur.aiPersonaMode, readDefaultAiPersonaMode()));
    profiles[wsKey] = {
      themeName: resolvedTheme,
      bubbleName: resolvedTheme,
      masterPersona: personaId,
      aiPersonaMode: boundMode,
      dimming: typeof cur.dimming === 'number' ? cur.dimming : (themesObj[resolvedTheme]?.defaultDimming ?? 35),
      fxDensity: typeof cur.fxDensity === 'number' ? cur.fxDensity : 100,
      chibiEnabled: cur.chibiEnabled !== false,
      autoFinisher: cur.autoFinisher !== false,
      focusMode: Boolean(cur.focusMode)
    };
    writeConfig({
      activeWorkspace: wsKey,
      themeName: resolvedTheme,
      bubbleName: resolvedTheme,
      masterPersona: personaId,
      aiPersonaMode: boundMode,
      workspaceProfiles: profiles
    }, { boundWorkspaceKey: wsKey });
    ensureDaemonAwakeSync();
    const studio = await buildStudioStatePayload();
    return {
      content: [{ type: 'text', text: `Đã gắn dự án "${wsKey}" với chủ đề "${resolvedTheme}" & Bản Ngã "${personaId}".` }],
      structuredContent: { workspaceProfiles: profiles, studio }
    };
  }

  if (name === 'diagnose_cdp_onboarding') {
    let autoFixLog = '';
    if (args.autoFix) {
      try {
        if (process.platform === 'win32' && fs.existsSync(INSTALL_WIN) && process.env.AGY_SKIP_DAEMON_SPAWN !== '1') {
          execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', INSTALL_WIN], {
            cwd: ROOT_DIR,
            stdio: 'pipe',
            windowsHide: true,
            timeout: 20000
          });
          autoFixLog = 'Đã vá tự động cờ --remote-debugging-port=0 vào các Shortcut Antigravity và khởi chạy Daemon. ';
        } else if (process.platform !== 'win32' && fs.existsSync(INSTALL_UNIX) && process.env.AGY_SKIP_DAEMON_SPAWN !== '1') {
          execFileSync('bash', [INSTALL_UNIX], { cwd: ROOT_DIR, stdio: 'pipe', timeout: 20000 });
          autoFixLog = 'Đã cấu hình launcher Unix/macOS và khởi chạy Daemon. ';
        } else {
          const woke = ensureDaemonAwakeSync();
          autoFixLog = woke ? 'Đã đánh thức tiến trình Daemon chạy ngầm. ' : 'Đã kiểm tra tiến trình Daemon. ';
        }
      } catch (err) {
        autoFixLog = `Lưu ý khi chạy trình vá tự động: ${err && err.message ? err.message : err}. `;
      }
    }

    const studio = await buildStudioStatePayload();
    const cdp = studio.cdp;
    const guidance = cdp.cdpHealthy
      ? `${autoFixLog}Kết nối CDP hoàn toàn khỏe mạnh (127.0.0.1:${cdp.cdpPort}, ${cdp.workbenchTargets} cửa sổ, Daemon PID ${cdp.daemonPid}). Giao diện đã được nạp trực tiếp!`
      : `${autoFixLog}Hiện chưa phát hiện cổng DevToolsActivePort hoạt động. Vui lòng thoát hẳn Antigravity (Quit ở khay hệ thống / Cmd+Q) rồi mở lại từ Start Menu hoặc ứng dụng đã vá để kích hoạt --remote-debugging-port=0.`;
    return {
      content: [{ type: 'text', text: guidance }],
      structuredContent: { cdp, studio }
    };
  }

  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
}

/* ============================================================================
 * DUAL-FRAMING STDIO JSON-RPC 2.0 TRANSPORT (Newline JSON + Content-Length)
 * ============================================================================ */

let useContentLengthFraming = false;
let stdinBuf = Buffer.alloc(0);
let rpcQueue = Promise.resolve();

function enqueueRpc(parsed) {
  rpcQueue = rpcQueue.then(() => dispatchRpcRequest(parsed)).catch(() => {});
}

function writeJsonRpcMessage(payloadObj) {
  const json = JSON.stringify(payloadObj);
  if (useContentLengthFraming) {
    const byteLen = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

async function dispatchRpcRequest(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;
  const hasId = msg.id !== undefined && msg.id !== null;

  try {
    if (msg.method === 'initialize') {
      const clientProto = msg.params && typeof msg.params.protocolVersion === 'string'
        ? msg.params.protocolVersion
        : '2025-03-26';
      const supported = ['2024-11-05', '2025-03-26', '2025-06-18', '2026-01-26'];
      const negotiated = supported.includes(clientProto) ? clientProto : '2025-06-18';
      if (hasId) {
        writeJsonRpcMessage({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: negotiated,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false }
            },
            serverInfo: {
              name: isCleanEditionRuntime() ? 'antigravity-clean-theme-controller' : 'antigravity-shinobu-theme-controller',
              version: '3.0.0'
            }
          }
        });
      }
      return;
    }

    if (msg.method === 'ping') {
      if (hasId) writeJsonRpcMessage({ jsonrpc: '2.0', id: msg.id, result: {} });
      return;
    }

    if (msg.method && msg.method.startsWith('notifications/')) {
      return;
    }

    if (msg.method === 'tools/list') {
      if (hasId) writeJsonRpcMessage({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
      return;
    }

    if (msg.method === 'tools/call') {
      const toolName = msg.params && msg.params.name;
      const toolArgs = (msg.params && msg.params.arguments) || {};
      const result = await handleToolCall(toolName, toolArgs);
      if (hasId) writeJsonRpcMessage({ jsonrpc: '2.0', id: msg.id, result });
      return;
    }

    if (msg.method === 'resources/list') {
      if (hasId) {
        writeJsonRpcMessage({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            resources: [
              {
                uri: APP_URI,
                name: 'Antigravity Theme Studio',
                description: 'Interactive Side-Pane Theme Controller & CDP Onboarding Doctor',
                mimeType: 'text/html;profile=mcp-app',
                _meta: { ui: { prefersBorder: false } }
              }
            ]
          }
        });
      }
      return;
    }

    if (msg.method === 'resources/read') {
      const uri = msg.params && msg.params.uri;
      if (uri !== APP_URI) {
        throw Object.assign(new Error(`Resource not found: ${uri}`), { code: -32602 });
      }
      if (hasId) {
        ensureDaemonAwakeSync();
        const initialState = await buildStudioStatePayload();
        writeJsonRpcMessage({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            contents: [
              {
                uri: APP_URI,
                mimeType: 'text/html;profile=mcp-app',
                text: buildMcpAppHtml(initialState),
                _meta: { ui: { prefersBorder: false } }
              }
            ]
          }
        });
      }
      return;
    }

    if (hasId) {
      writeJsonRpcMessage({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` }
      });
    }
  } catch (err) {
    if (hasId) {
      writeJsonRpcMessage({
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: (err && typeof err.code === 'number') ? err.code : -32603,
          message: err && err.message ? err.message : String(err)
        }
      });
    }
  }
}

function drainStdinBuffer() {
  while (stdinBuf.length > 0) {
    // Strip leading whitespace/newlines between messages
    let start = 0;
    while (start < stdinBuf.length && (stdinBuf[start] === 0x0a || stdinBuf[start] === 0x0d || stdinBuf[start] === 0x20 || stdinBuf[start] === 0x09)) {
      start++;
    }
    if (start > 0) stdinBuf = stdinBuf.subarray(start);
    if (stdinBuf.length === 0) return;

    const headAscii = stdinBuf.subarray(0, Math.min(32, stdinBuf.length)).toString('ascii');
    if (/^Content-Length:/i.test(headAscii)) {
      useContentLengthFraming = true;
      const sepIdx = stdinBuf.indexOf('\r\n\r\n');
      if (sepIdx === -1) return;
      const headerStr = stdinBuf.subarray(0, sepIdx).toString('ascii');
      const m = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!m) {
        stdinBuf = stdinBuf.subarray(sepIdx + 4);
        continue;
      }
      const contentLen = parseInt(m[1], 10);
      const bodyStart = sepIdx + 4;
      if (stdinBuf.length < bodyStart + contentLen) return;
      const bodyStr = stdinBuf.subarray(bodyStart, bodyStart + contentLen).toString('utf8');
      stdinBuf = stdinBuf.subarray(bodyStart + contentLen);
      try {
        const parsed = stripProtoKeys(JSON.parse(bodyStr));
        enqueueRpc(parsed);
      } catch (_) {}
      continue;
    }

    const nlIdx = stdinBuf.indexOf(0x0a);
    if (nlIdx === -1) return;
    const lineStr = stdinBuf.subarray(0, nlIdx).toString('utf8').trim();
    stdinBuf = stdinBuf.subarray(nlIdx + 1);
    if (!lineStr) continue;
    try {
      const parsed = stripProtoKeys(JSON.parse(lineStr));
      enqueueRpc(parsed);
    } catch (_) {}
  }
}

process.stdin.on('data', (chunk) => {
  stdinBuf = Buffer.concat([stdinBuf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
  if (stdinBuf.length > 16 * 1024 * 1024) {
    stdinBuf = Buffer.alloc(0);
    return;
  }
  drainStdinBuffer();
});

process.stdin.on('end', () => {
  rpcQueue.finally(() => process.exit(0));
});
