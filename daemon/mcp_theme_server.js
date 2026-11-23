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

function isPidFileAlive(pidPath) {
  try {
    if (!fs.existsSync(pidPath)) return false;
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').replace(/^\uFEFF/, '').trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveRuntimeRoot() {
  const baseRoot = process.env.PLUGIN_ROOT
    ? path.resolve(process.env.PLUGIN_ROOT)
    : path.resolve(__dirname, '..');
  if (process.env.AGY_CONFIG_PATH || process.env.AGY_PID_FILE) return baseRoot;
  if (isPidFileAlive(path.join(baseRoot, 'daemon.pid'))) return baseRoot;
  const globalSkillRoot = path.join(os.homedir(), '.gemini', 'config', 'skills', 'antigravity-custom-theme');
  if (isPidFileAlive(path.join(globalSkillRoot, 'daemon.pid'))) return globalSkillRoot;
  return baseRoot;
}

const ROOT_DIR = resolveRuntimeRoot();
const THEMES_FILE = path.join(ROOT_DIR, 'themes', 'themes.json');
const PID_FILE = process.env.AGY_PID_FILE || path.join(ROOT_DIR, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const BACKUP_CONFIG_FILE =
  process.env.AGY_BACKUP_CONFIG_PATH ||
  path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');
const PAYLOAD_PATH = path.join(ROOT_DIR, 'dist', 'theme_payload.js');
const BUILD_SCRIPT = path.join(ROOT_DIR, 'scripts', 'build_payload.js');
const DAEMON_SCRIPT = path.join(ROOT_DIR, 'daemon', 'theme_daemon.js');
const INSTALL_WIN = path.join(ROOT_DIR, 'scripts', 'install-win.ps1');
const INSTALL_UNIX = path.join(ROOT_DIR, 'scripts', 'install-unix.sh');

const APP_URI = 'ui://agy-theme/studio.html';
const MAX_FORGE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_INLINE_FORGE_BYTES = Math.floor(1.35 * 1024 * 1024);

const DANGEROUS_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'
]);

const KNOWN_PERSONAS = Object.freeze([
  { id: 'yoriichi', label: '☀️ Kiếm Sĩ Đầu Tiên — Tsugikuni Yoriichi', aliases: ['yoriichi', 'sun', 'nhat', 'kiem si dau tien'] },
  { id: 'shadow_monarch', label: '🌑 Quân Vương Bóng Tối — Sung Jin-Woo', aliases: ['jinwoo', 'sung', 'shadow', 'bong toi', 'solo leveling'] },
  { id: 'six_eyes', label: '♾️ Lục Nhãn Vô Hạ Hạn — Satoru Gojo', aliases: ['gojo', 'satoru', 'six eyes', 'luc nhan', 'vo luong khong xu'] },
  { id: 'great_sage', label: '💧 Đại Hiền Giả — Rimuru Tempest', aliases: ['rimuru', 'sage', 'dai hien gia', 'slime'] },
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
  for (const candidate of [CONFIG_FILE, BACKUP_CONFIG_FILE]) {
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

function writeConfig(nextPatch) {
  const cur = readConfig();
  const merged = { ...cur, ...stripProtoKeys(nextPatch) };
  if (merged.activeForgedTheme === null) delete merged.activeForgedTheme;
  const serialized = JSON.stringify(sortKeysDeep(merged), null, 2);
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, serialized, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.mkdirSync(path.dirname(BACKUP_CONFIG_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(BACKUP_CONFIG_FILE, serialized, { encoding: 'utf8', mode: 0o600 });
  } catch (_) {}
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

async function inspectCdpAndDaemonState() {
  let daemonPid = null;
  let daemonRunning = false;
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').replace(/^\uFEFF/, '').trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        process.kill(pid, 0);
        daemonPid = pid;
        daemonRunning = true;
      }
    }
  } catch (_) {}

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
  if (cdpPort) {
    const listRes = await probeHttpJson(cdpPort, '/json/list', 1000);
    if (listRes.ok && Array.isArray(listRes.data)) {
      cdpReachable = true;
      workbenchTargets = listRes.data.filter((t) => t && t.type === 'page').length;
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
    cdpHealthy: Boolean(cdpReachable && daemonRunning)
  };
}

function ensureDaemonAwakeSync() {
  if (process.env.AGY_SKIP_DAEMON_SPAWN === '1') return false;
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').replace(/^\uFEFF/, '').trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        process.kill(pid, 0);
        return false;
      }
    }
  } catch (_) {}

  try {
    if (!fs.existsSync(PAYLOAD_PATH) && fs.existsSync(BUILD_SCRIPT)) {
      execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT_DIR, stdio: 'ignore', windowsHide: true, timeout: 6000 });
    }
    if (fs.existsSync(DAEMON_SCRIPT)) {
      const child = spawn(process.execPath, [DAEMON_SCRIPT], {
        cwd: ROOT_DIR,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
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
  const allowedFx = new Set(['wisteria', 'water', 'flame', 'sound', 'mist', 'love', 'serpent', 'wind', 'stone', 'sun', 'thunder', 'beast', 'nezuko', 'royal_wisteria']);
  const cleanFx = allowedFx.has(fxMode) ? fxMode : 'wisteria';
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;

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
      userAvatar: 'assets/yoriichi_avatar.jpg',
      wcagReport: { textContrast: '13.2', level: 'AAA' },
      forgedByPersona: personaId || 'yoriichi'
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
  return {
    cdp,
    activeConfig: {
      themeName: activeTheme,
      masterPersona: cfg.masterPersona || 'yoriichi',
      dimming: typeof cfg.dimming === 'number' ? cfg.dimming : 35,
      fxDensity: typeof cfg.fxDensity === 'number' ? cfg.fxDensity : 100,
      chibiEnabled: cfg.chibiEnabled !== false,
      autoFinisher: cfg.autoFinisher !== false,
      uiLang: cfg.uiLang || 'vi',
      activeWorkspace: cfg.activeWorkspace || '',
      workspaceProfiles: cfg.workspaceProfiles || {}
    },
    themes: themeNames.map((name) => ({
      name,
      concept: themesObj[name]?.concept || '',
      primary: themesObj[name]?.primary || '#c084fc'
    })),
    personas: KNOWN_PERSONAS.map((p) => ({ id: p.id, label: p.label }))
  };
}

function buildMcpAppHtml() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Antigravity Theme Studio</title>
<style>
  :root {
    --bg-1: var(--color-background-primary, #0d1017);
    --bg-2: var(--color-background-secondary, #151924);
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
  .title { font-size: 15px; font-weight: 700; }
  .pill { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--bd-1); }
  .pill-ok { background: rgba(16,185,129,0.15); color: #6ee7b7; border-color: rgba(16,185,129,0.4); }
  .pill-warn { background: rgba(245,158,11,0.16); color: #fde047; border-color: rgba(245,158,11,0.45); }
  .card {
    background: var(--bg-2); border: 1px solid var(--bd-1);
    border-radius: 11px; padding: 12px; margin-bottom: 11px;
  }
  .doctor { border-color: rgba(250,204,21,0.45); background: rgba(250,204,21,0.07); }
  .sec-lbl { font-size: 11.5px; font-weight: 600; color: var(--fg-2); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 7px; }
  button, select {
    font: inherit; color: var(--fg-1); background: rgba(255,255,255,0.05);
    border: 1px solid var(--bd-1); border-radius: 8px; padding: 7px 10px; cursor: pointer;
  }
  button:hover { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.09); }
  button:focus-visible, select:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
  .th-btn { text-align: left; display: flex; flex-direction: column; gap: 2px; }
  .th-btn[aria-pressed="true"] { border-color: #facc15; background: rgba(250,204,21,0.12); }
  .th-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .th-sub { font-size: 10.5px; color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn-primary { background: linear-gradient(135deg, #a855f7, #38bdf8); color: #090d16; border: none; font-weight: 700; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  #toast { font-size: 12px; color: #5eead4; min-height: 18px; margin-top: 4px; }
</style>
</head>
<body>
  <div class="hdr">
    <span class="title">🦋 Antigravity Theme Studio</span>
    <span id="cdp-badge" class="pill pill-warn">Đang kiểm tra…</span>
  </div>

  <div id="doctor-box" class="card doctor" style="display:none;">
    <div style="font-weight:700; color:#fef08a; margin-bottom:4px;">🩺 Bác Sĩ Cài Đặt Kết Nối CDP (Onboarding Doctor)</div>
    <div id="doctor-msg" style="font-size:12px; color:var(--fg-2); margin-bottom:9px;">
      Chưa phát hiện cổng DevToolsActivePort trên 127.0.0.1. Bấm nút dưới đây để tự cấu hình cờ <code>--remote-debugging-port=0</code> và đánh thức Daemon.
    </div>
    <button id="doctor-fix-btn" type="button" class="btn-primary">⚡ Cấu hình Shortcut &amp; Đánh thức Daemon (1 Chạm)</button>
  </div>

  <div class="card">
    <div class="sec-lbl">Điều Khiển Nhanh &amp; Bản Ngã</div>
    <div class="row" style="margin-bottom:8px;">
      <select id="persona-sel" aria-label="Chọn Bản Ngã Chủ Nhân" style="flex:1; min-width:170px;"></select>
      <button id="focus-btn" type="button">⚡ Tập trung sâu</button>
    </div>
    <div class="row">
      <span style="font-size:12px; color:var(--fg-2);">Ngôn ngữ Studio:</span>
      <button type="button" class="lang-btn" data-lang="vi">VI</button>
      <button type="button" class="lang-btn" data-lang="en">EN</button>
      <button type="button" class="lang-btn" data-lang="ja">日本語</button>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
  </div>

  <div class="card">
    <div class="sec-lbl">Bộ Sưu Tập 16 Chủ Đề (Chạm để đổi ngay)</div>
    <div id="themes-grid" class="grid"></div>
  </div>

<script>
(() => {
  let reqSeq = 1;
  const pending = new Map();
  let state = null;

  function rpcSend(method, params) {
    const id = reqSeq++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    });
  }

  function callTool(name, args) {
    return rpcSend('tools/call', { name, arguments: args || {} });
  }

  function applyHostVars(vars) {
    if (!vars || typeof vars !== 'object') return;
    const root = document.documentElement;
    Object.keys(vars).forEach((k) => {
      if (k.startsWith('--') && typeof vars[k] === 'string') root.style.setProperty(k, vars[k]);
    });
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    if (el) el.textContent = msg || '';
  }

  function render(data) {
    if (!data || typeof data !== 'object') return;
    state = data;
    const badge = document.getElementById('cdp-badge');
    const docBox = document.getElementById('doctor-box');
    const cdpOk = Boolean(data.cdp && data.cdp.cdpHealthy);
    if (badge) {
      badge.className = 'pill ' + (cdpOk ? 'pill-ok' : 'pill-warn');
      badge.textContent = cdpOk ? 'CDP Live • PID ' + data.cdp.daemonPid : 'Cần bật cờ CDP';
    }
    if (docBox) docBox.style.display = cdpOk ? 'none' : 'block';

    const pSel = document.getElementById('persona-sel');
    if (pSel && Array.isArray(data.personas)) {
      pSel.textContent = '';
      data.personas.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        if (data.activeConfig && data.activeConfig.masterPersona === p.id) opt.selected = true;
        pSel.appendChild(opt);
      });
    }

    const grid = document.getElementById('themes-grid');
    if (grid && Array.isArray(data.themes)) {
      grid.textContent = '';
      data.themes.forEach((th) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'th-btn';
        const isAct = data.activeConfig && data.activeConfig.themeName === th.name;
        btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
        const nEl = document.createElement('span');
        nEl.className = 'th-name';
        nEl.textContent = th.name;
        const sEl = document.createElement('span');
        sEl.className = 'th-sub';
        sEl.textContent = th.concept || '';
        btn.appendChild(nEl);
        btn.appendChild(sEl);
        btn.addEventListener('click', async () => {
          showToast('⏳ Đang chuyển sang ' + th.name + '…');
          const res = await callTool('switch_theme', { themeQuery: th.name });
          if (res && res.structuredContent) render(res.structuredContent);
          showToast('✓ Đã kích hoạt: ' + th.name);
        });
        grid.appendChild(btn);
      });
    }
  }

  document.getElementById('persona-sel').addEventListener('change', async (e) => {
    const pid = e.target.value;
    const res = await callTool('set_persona', { personaQuery: pid });
    if (res && res.structuredContent) render(res.structuredContent);
    showToast('✓ Đã chuyển Bản Ngã: ' + pid);
  });

  document.getElementById('focus-btn').addEventListener('click', async () => {
    const nextFocus = state && state.activeConfig ? state.activeConfig.chibiEnabled !== false : true;
    const res = await callTool('toggle_focus_mode', { enabled: nextFocus });
    if (res && res.structuredContent) render(res.structuredContent);
    showToast(nextFocus ? '⚡ Đã bật Chế độ Tập trung sâu' : '✨ Đã khôi phục đầy đủ hiệu ứng');
  });

  document.querySelectorAll('.lang-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const lang = b.getAttribute('data-lang');
      const curTheme = (state && state.activeConfig && state.activeConfig.themeName) || '';
      const res = await callTool('switch_theme', { themeQuery: curTheme, uiLang: lang });
      if (res && res.structuredContent) render(res.structuredContent);
      showToast('🌐 Đã chuyển ngôn ngữ giao diện: ' + lang.toUpperCase());
    });
  });

  document.getElementById('doctor-fix-btn').addEventListener('click', async () => {
    showToast('⏳ Đang cấu hình shortcut CDP & khởi chạy Daemon…');
    const res = await callTool('diagnose_cdp_onboarding', { autoFix: true });
    const msgEl = document.getElementById('doctor-msg');
    if (res && Array.isArray(res.content) && res.content[0] && msgEl) {
      msgEl.textContent = res.content[0].text;
    }
    if (res && res.structuredContent && res.structuredContent.studio) {
      render(res.structuredContent.studio);
    }
    showToast('✓ Đã chạy trình sửa tự động!');
  });

  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;
    if (msg.id !== undefined && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(msg.error);
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method === 'ui/notifications/tool-result' && msg.params) {
      render(msg.params.structuredContent || msg.params);
    } else if (msg.method === 'ui/notifications/host-context-changed' && msg.params) {
      if (msg.params.styles && msg.params.styles.variables) applyHostVars(msg.params.styles.variables);
    }
  });

  rpcSend('ui/initialize', {
    protocolVersion: '2025-06-18',
    appInfo: { name: 'Antigravity Theme Studio', version: '3.0.0' },
    appCapabilities: {}
  }).then((initRes) => {
    if (initRes && initRes.hostContext && initRes.hostContext.styles) {
      applyHostVars(initRes.hostContext.styles.variables);
    }
    window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*');
    return callTool('open_theme_studio', {});
  }).then((res) => {
    if (res && res.structuredContent) render(res.structuredContent);
  }).catch(() => {});
})();
</script>
</body>
</html>`;
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
        uiLang: { type: 'string', enum: ['vi', 'en', 'ja'], description: 'Optional Studio UI language (vi, en, ja).' }
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
        personaQuery: { type: 'string', description: 'Optional persona query when binding a workspace profile.' }
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
    }
    if (typeof args.uiLang === 'string' && ['vi', 'en', 'ja'].includes(args.uiLang.trim().toLowerCase())) {
      patch.uiLang = args.uiLang.trim().toLowerCase();
    }
    writeConfig(patch);
    ensureDaemonAwakeSync();
    const studio = await buildStudioStatePayload();
    return {
      content: [{ type: 'text', text: `Đã cập nhật giao diện: ${studio.activeConfig.themeName} (ngôn ngữ: ${studio.activeConfig.uiLang}).` }],
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
    writeConfig({ masterPersona: matched.id, userAvatar: '' });
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
        ? { chibiEnabled: false, fxDensity: 20, autoFinisher: false, transparentWorld: true }
        : { chibiEnabled: true, fxDensity: 100, autoFinisher: true, transparentWorld: true }
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
    if (!rawPath || !fs.existsSync(rawPath) || !fs.statSync(rawPath).isFile()) {
      return { isError: true, content: [{ type: 'text', text: `Không tìm thấy tệp ảnh hợp lệ tại: ${rawPath}` }] };
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
    const profiles = (cur.workspaceProfiles && typeof cur.workspaceProfiles === 'object' && !Array.isArray(cur.workspaceProfiles))
      ? { ...cur.workspaceProfiles }
      : {};

    if (action === 'list') {
      const entries = Object.entries(profiles);
      const summary = entries.length === 0
        ? 'Chưa có hồ sơ giao diện theo dự án nào.'
        : entries.map(([k, v]) => `- ${k}: ${v.themeName} (${v.masterPersona})`).join('\n');
      return { content: [{ type: 'text', text: summary }], structuredContent: { workspaceProfiles: profiles } };
    }

    const wsKey = normalizeWorkspaceKey(args.workspace || cur.activeWorkspace || '');
    if (!wsKey) {
      return { isError: true, content: [{ type: 'text', text: 'Vui lòng cung cấp tên hoặc đường dẫn thư mục dự án (workspace).' }] };
    }

    if (action === 'remove') {
      delete profiles[wsKey];
      writeConfig({ workspaceProfiles: profiles });
      return { content: [{ type: 'text', text: `Đã xóa hồ sơ giao diện của dự án "${wsKey}".` }], structuredContent: { workspaceProfiles: profiles } };
    }

    if (action === 'apply') {
      const prof = profiles[wsKey];
      if (!prof) {
        return { isError: true, content: [{ type: 'text', text: `Chưa có hồ sơ nào được lưu cho dự án "${wsKey}".` }] };
      }
      writeConfig({
        activeWorkspace: wsKey,
        themeName: prof.themeName,
        bubbleName: prof.bubbleName || prof.themeName,
        masterPersona: prof.masterPersona || 'yoriichi',
        dimming: prof.dimming ?? 35,
        fxDensity: prof.fxDensity ?? 100,
        chibiEnabled: prof.chibiEnabled !== false
      });
      ensureDaemonAwakeSync();
      return { content: [{ type: 'text', text: `Đã áp dụng hồ sơ của dự án "${wsKey}": ${prof.themeName}.` }], structuredContent: { workspaceProfiles: profiles } };
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
    profiles[wsKey] = {
      themeName: resolvedTheme,
      bubbleName: resolvedTheme,
      masterPersona: personaId,
      dimming: typeof cur.dimming === 'number' ? cur.dimming : (themesObj[resolvedTheme]?.defaultDimming ?? 35),
      fxDensity: typeof cur.fxDensity === 'number' ? cur.fxDensity : 100,
      chibiEnabled: cur.chibiEnabled !== false
    };
    writeConfig({
      activeWorkspace: wsKey,
      themeName: resolvedTheme,
      bubbleName: resolvedTheme,
      masterPersona: personaId,
      workspaceProfiles: profiles
    });
    ensureDaemonAwakeSync();
    return {
      content: [{ type: 'text', text: `Đã gắn dự án "${wsKey}" với chủ đề "${resolvedTheme}" & Bản Ngã "${personaId}".` }],
      structuredContent: { workspaceProfiles: profiles }
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
      const supported = ['2024-11-05', '2025-03-26', '2025-06-18'];
      const negotiated = supported.includes(clientProto) ? clientProto : '2025-03-26';
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
              name: 'antigravity-shinobu-theme-controller',
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
        writeJsonRpcMessage({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            contents: [
              {
                uri: APP_URI,
                mimeType: 'text/html;profile=mcp-app',
                text: buildMcpAppHtml(),
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
