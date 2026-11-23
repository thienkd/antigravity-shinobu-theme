'use strict';

/**
 * Hardened Sidecar State Synchronizer & Atomic File I/O Utilities (`persona_runtime_hint.json` < 640B).
 * - Decouples fast-path lifecycle hooks (`PreInvocation`) from `theme_config.json` (up to 3.5 MB Base64)
 * - Enforces atomic temp-file + rename writes, symlink/UNC/FIFO rejection, and canonical cross-directory sync
 * - 100% IP-agnostic and zero-dependency
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DANGEROUS_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
]);

const VALID_MODES = new Set(['off', 'subtle', 'roleplay']);
const VALID_LANGS = new Set(['vi', 'en', 'ja']);
const SAFE_ID_RE = /^[a-z0-9_]{1,36}$/;
const WIN_DEVICE_BASE_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function isUncOrDevicePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath) return true;
  const s = rawPath.trim();
  if (!s || s.includes('\0')) return true;
  if (s.startsWith('\\\\') || s.startsWith('//')) return true;
  const base = path.basename(s);
  if (WIN_DEVICE_BASE_RE.test(base)) return true;
  return false;
}

function isSafeLocalRegularFile(filePath) {
  if (isUncOrDevicePath(filePath)) return false;
  try {
    const lst = fs.lstatSync(filePath);
    return Boolean(lst.isFile() && !lst.isSymbolicLink());
  } catch (_) {
    return false;
  }
}

function writeFileAtomicSync(targetPath, content, mode = 0o600) {
  if (isUncOrDevicePath(targetPath)) return false;
  const resolvedTarget = path.resolve(targetPath);
  const dir = path.dirname(resolvedTarget);
  const base = path.basename(resolvedTarget);

  try {
    if (fs.existsSync(resolvedTarget)) {
      const lst = fs.lstatSync(resolvedTarget);
      if (lst.isSymbolicLink() || !lst.isFile()) return false;
    }
  } catch (_) {}

  const tmpPath = path.join(
    dir,
    `.${base}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );

  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode, flag: 'wx' });
    let renamed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.renameSync(tmpPath, resolvedTarget);
        renamed = true;
        break;
      } catch (err) {
        if (attempt === 2 && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY')) {
          // Windows NTFS transient antivirus lock fallback (only after verifying target is not a symlink)
          if (!fs.existsSync(resolvedTarget) || !fs.lstatSync(resolvedTarget).isSymbolicLink()) {
            fs.writeFileSync(resolvedTarget, content, { encoding: 'utf8', mode });
            renamed = true;
          }
        }
      }
    }
    if (renamed && process.platform !== 'win32') {
      try { fs.chmodSync(resolvedTarget, mode); } catch (_) {}
    }
    return renamed;
  } catch (_) {
    return false;
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
  }
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

function normalizePersonaMode(raw, fallback = '') {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim().toLowerCase();
  return VALID_MODES.has(v) ? v : fallback;
}

function normalizeSafeId(raw, fallback = '') {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim().toLowerCase();
  if (!v || DANGEROUS_KEYS.has(v) || !SAFE_ID_RE.test(v)) return fallback;
  return v;
}

function normalizeSafeLabel(raw, maxLen = 80) {
  if (typeof raw !== 'string') return '';
  const v = raw.replace(/[\x00-\x1f\x7f<>`{}]/g, '').trim().slice(0, maxLen);
  if (!v || DANGEROUS_KEYS.has(v)) return '';
  return v;
}

function normalizeUiLang(raw) {
  if (typeof raw !== 'string') return 'vi';
  const v = raw.trim().toLowerCase();
  if (v === 'en' || v.startsWith('en-')) return 'en';
  if (v === 'ja' || v.startsWith('ja-') || v === 'jp') return 'ja';
  return VALID_LANGS.has(v) ? v : 'vi';
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

function resolveHintPaths(rootDir, explicitConfigPath) {
  if (process.env.AGY_PERSONA_HINT_PATH) {
    return [path.resolve(process.env.AGY_PERSONA_HINT_PATH)];
  }
  const defaultCfgPath = path.resolve(rootDir, 'theme_config.json');
  const cfgPath = path.resolve(explicitConfigPath || process.env.AGY_CONFIG_PATH || defaultCfgPath);
  const localHint = path.join(path.dirname(cfgPath), 'persona_runtime_hint.json');
  if (process.env.AGY_CONFIG_PATH || cfgPath !== defaultCfgPath) {
    return [localHint];
  }
  const home = os.homedir();
  const canonical = path.join(home, '.gemini', 'antigravity', 'persona_runtime_hint.json');
  const out = [canonical];
  if (localHint !== canonical) out.push(localHint);

  for (const extraDir of [
    path.join(home, '.gemini', 'config', 'plugins', 'antigravity-shinobu-theme'),
    path.join(home, '.gemini', 'config', 'skills', 'antigravity-custom-theme')
  ]) {
    try {
      if (fs.existsSync(extraDir) && fs.lstatSync(extraDir).isDirectory()) {
        const cand = path.join(extraDir, 'persona_runtime_hint.json');
        if (!out.includes(cand)) out.push(cand);
      }
    } catch (_) {}
  }
  return out;
}

function readExistingHint(hintPaths) {
  let bestObj = null;
  let bestUpdated = -1;
  for (const p of hintPaths) {
    try {
      if (!isSafeLocalRegularFile(p)) continue;
      const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
      const parsed = stripProtoKeys(JSON.parse(raw));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const ts = Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : fs.statSync(p).mtimeMs;
        if (ts >= bestUpdated) {
          bestUpdated = ts;
          bestObj = parsed;
        }
      }
    } catch (_) {}
  }
  return bestObj || {};
}

function selectFreshestConfigObject(candidatePaths) {
  let bestCfg = null;
  let bestMtime = -1;
  for (const cand of candidatePaths) {
    try {
      if (!cand || !isSafeLocalRegularFile(cand)) continue;
      const st = fs.statSync(cand);
      const raw = fs.readFileSync(cand, 'utf8').replace(/^\uFEFF/, '');
      const parsed = stripProtoKeys(JSON.parse(raw));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
        if (st.mtimeMs >= bestMtime) {
          bestMtime = st.mtimeMs;
          bestCfg = parsed;
        }
      }
    } catch (_) {}
  }
  return bestCfg || {};
}

function sanitizeCompactProfileEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const out = {};
  const tn = normalizeSafeLabel(entry.themeName, 80);
  if (tn) out.themeName = tn;
  const bn = normalizeSafeLabel(entry.bubbleName, 80);
  if (bn) out.bubbleName = bn;
  if (typeof entry.masterPersona === 'string') {
    out.masterPersona = normalizeSafeId(entry.masterPersona, 'yoriichi');
  }
  const mode = normalizePersonaMode(entry.aiPersonaMode, '');
  if (mode) out.aiPersonaMode = mode;
  if (typeof entry.dimming === 'number' && Number.isFinite(entry.dimming)) {
    out.dimming = Math.max(15, Math.min(92, Math.round(entry.dimming)));
  }
  if (typeof entry.fxDensity === 'number' && Number.isFinite(entry.fxDensity)) {
    out.fxDensity = Math.max(0, Math.min(100, Math.round(entry.fxDensity)));
  }
  if (typeof entry.chibiEnabled === 'boolean') out.chibiEnabled = entry.chibiEnabled;
  if (typeof entry.autoFinisher === 'boolean') out.autoFinisher = entry.autoFinisher;
  if (typeof entry.focusMode === 'boolean') out.focusMode = entry.focusMode;
  return Object.keys(out).length > 0 ? out : null;
}

function sanitizeWorkspaceProfilesStrict(rawProfiles) {
  const out = {};
  if (!rawProfiles || typeof rawProfiles !== 'object' || Array.isArray(rawProfiles)) return out;
  for (const rawK of Object.keys(rawProfiles)) {
    if (Object.keys(out).length >= 48) break;
    const wk = normalizeWorkspaceKey(rawK);
    if (!wk) continue;
    const cleanEntry = sanitizeCompactProfileEntry(rawProfiles[rawK]);
    if (cleanEntry) out[wk] = cleanEntry;
  }
  return out;
}

function syncPersonaRuntimeHint(cfg, opts = {}) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null;
  const rootDir = opts.rootDir || path.resolve(__dirname, '..');
  const hintPaths = resolveHintPaths(rootDir, opts.configPath);
  const prevHint = readExistingHint(hintPaths);
  const now = Date.now();

  const cleanTheme = normalizeSafeLabel(cfg.themeName, 80);
  const themeName = cleanTheme || (typeof prevHint.themeName === 'string' ? normalizeSafeLabel(prevHint.themeName, 80) : '');
  const cleanBubble = normalizeSafeLabel(cfg.bubbleName, 80);
  const bubbleName = cleanBubble || (cfg.themeName !== undefined ? themeName : normalizeSafeLabel(prevHint.bubbleName, 80)) || themeName;

  const masterPersona = cfg.masterPersona !== undefined
    ? normalizeSafeId(cfg.masterPersona, 'yoriichi')
    : normalizeSafeId(prevHint.masterPersona, 'yoriichi');
  const aiPersonaMode = cfg.aiPersonaMode !== undefined
    ? normalizePersonaMode(cfg.aiPersonaMode, '')
    : normalizePersonaMode(prevHint.aiPersonaMode, '');
  const uiLang = cfg.uiLang !== undefined ? normalizeUiLang(cfg.uiLang) : normalizeUiLang(prevHint.uiLang);
  const chibiEnabled = typeof cfg.chibiEnabled === 'boolean'
    ? cfg.chibiEnabled
    : (typeof prevHint.chibiEnabled === 'boolean' ? prevHint.chibiEnabled : true);
  const autoFinisher = typeof cfg.autoFinisher === 'boolean'
    ? cfg.autoFinisher
    : (typeof prevHint.autoFinisher === 'boolean' ? prevHint.autoFinisher : true);
  // Explicit focusMode flag only — never falsely infer from manual Chibi/AutoFinisher toggles
  const focusMode = typeof cfg.focusMode === 'boolean'
    ? cfg.focusMode
    : Boolean(prevHint.focusMode);
  const privacyShieldActive = typeof cfg.privacyShieldActive === 'boolean'
    ? cfg.privacyShieldActive
    : Boolean(prevHint.privacyShieldActive);

  let isForgedActive = false;
  let forgedFxMode = '';
  let forgedPersonaTraitId = '';
  if (cfg.activeForgedTheme && typeof cfg.activeForgedTheme === 'object' && !Array.isArray(cfg.activeForgedTheme)) {
    const fName = normalizeSafeLabel(cfg.activeForgedTheme.name, 80);
    if (!fName || fName === themeName) {
      isForgedActive = true;
      forgedFxMode = normalizeSafeId(cfg.activeForgedTheme.fxMode, '');
      forgedPersonaTraitId = normalizeSafeId(cfg.activeForgedTheme.personaTraitId || cfg.activeForgedTheme.forgedByPersona, '');
    }
  } else if (cfg.activeForgedTheme === undefined && cfg.themeName === undefined && prevHint.isForgedActive) {
    isForgedActive = true;
    forgedFxMode = normalizeSafeId(prevHint.forgedFxMode, '');
    forgedPersonaTraitId = normalizeSafeId(prevHint.forgedPersonaTraitId, '');
  }

  const activeWorkspace = cfg.activeWorkspace !== undefined
    ? normalizeWorkspaceKey(cfg.activeWorkspace)
    : normalizeWorkspaceKey(prevHint.activeWorkspace || '');

  const workspaceProfiles = (cfg.workspaceProfiles && typeof cfg.workspaceProfiles === 'object' && !Array.isArray(cfg.workspaceProfiles))
    ? sanitizeWorkspaceProfilesStrict(cfg.workspaceProfiles)
    : sanitizeWorkspaceProfilesStrict(prevHint.workspaceProfiles);

  const prevOverrides = (prevHint.workspaceActiveOverrides && typeof prevHint.workspaceActiveOverrides === 'object' && !Array.isArray(prevHint.workspaceActiveOverrides))
    ? prevHint.workspaceActiveOverrides
    : {};
  const workspaceActiveOverrides = {};
  for (const rawK of Object.keys(prevOverrides).slice(0, 32)) {
    const wk = normalizeWorkspaceKey(rawK);
    // Only retain override if workspace profile still exists (prevents ghost overrides after `remove`)
    if (!wk || !Object.prototype.hasOwnProperty.call(workspaceProfiles, wk)) continue;
    const cleanEntry = sanitizeCompactProfileEntry(prevOverrides[rawK]);
    if (cleanEntry) {
      const ts = Number.isFinite(prevOverrides[rawK]?.updatedAt) ? prevOverrides[rawK].updatedAt : now;
      if (now - ts <= 24 * 3600 * 1000) {
        cleanEntry.updatedAt = ts;
        workspaceActiveOverrides[wk] = cleanEntry;
      }
    }
  }

  const boundWs = normalizeWorkspaceKey(opts.boundWorkspaceKey || '');
  if (boundWs && Object.prototype.hasOwnProperty.call(workspaceActiveOverrides, boundWs)) {
    delete workspaceActiveOverrides[boundWs];
  }

  const directWs = normalizeWorkspaceKey(opts.directSwitchWorkspaceKey || '');
  if (directWs && Object.prototype.hasOwnProperty.call(workspaceProfiles, directWs)) {
    workspaceActiveOverrides[directWs] = {
      themeName,
      bubbleName,
      masterPersona,
      ...(aiPersonaMode ? { aiPersonaMode } : {}),
      chibiEnabled,
      autoFinisher,
      focusMode,
      updatedAt: now
    };
  }

  const hintPayload = {
    v: 2,
    themeName,
    bubbleName,
    masterPersona,
    aiPersonaMode,
    uiLang,
    chibiEnabled,
    autoFinisher,
    focusMode,
    privacyShieldActive,
    isForgedActive,
    forgedFxMode,
    forgedPersonaTraitId,
    activeWorkspace,
    workspaceProfiles,
    workspaceActiveOverrides,
    updatedAt: now
  };

  const serialized = JSON.stringify(hintPayload);
  for (const target of hintPaths) {
    writeFileAtomicSync(target, serialized, 0o600);
  }
  return hintPayload;
}

const MAX_STDIN_BUFFER_BYTES = 2 * 1024 * 1024;
const OVERSIZE_MARKER = '\0OVERSIZE:';

function readStdinJsonFast(timeoutMs = 800) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    let headSnapshot = null;
    let total = 0;
    let overflowed = false;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('end');
        process.stdin.removeAllListeners('error');
        process.stdin.pause();
        if (typeof process.stdin.unref === 'function') process.stdin.unref();
      } catch (_) {}
      if (overflowed) {
        resolve(OVERSIZE_MARKER + (headSnapshot ? headSnapshot.toString('utf8') : ''));
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    process.stdin.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      total += buf.length;
      if (overflowed) {
        // Keep draining stdin until EOF so parent process never suffers EPIPE / write EOF
        return;
      }
      if (total > MAX_STDIN_BUFFER_BYTES) {
        overflowed = true;
        chunks.push(buf);
        const fullHead = Buffer.concat(chunks);
        headSnapshot = Buffer.from(fullHead.subarray(0, Math.min(65536, fullHead.length)));
        chunks.length = 0;
        return;
      }
      chunks.push(buf);
      // Early exit (< 0.3ms) for normal payloads when a complete top-level JSON object arrives
      if (total <= 262144 && buf.includes(0x7d)) {
        const candidate = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '').trim();
        if (candidate.startsWith('{') && candidate.endsWith('}')) {
          try {
            JSON.parse(candidate);
            finish();
          } catch (_) {}
        }
      }
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

function unescapeJsonStringFragment(raw) {
  if (typeof raw !== 'string') return '';
  try {
    return JSON.parse(`"${raw}"`);
  } catch (_) {
    return raw;
  }
}

function parseHookInputSafe(rawIn) {
  if (typeof rawIn !== 'string' || !rawIn) return null;
  if (rawIn.startsWith(OVERSIZE_MARKER)) {
    const head = rawIn.slice(OVERSIZE_MARKER.length).replace(/^\uFEFF/, '');
    const out = {};
    const cidMatch = head.match(/"conversationId"\s*:\s*"([^"\\]{1,96})"/);
    if (cidMatch) out.conversationId = cidMatch[1];
    const invMatch = head.match(/"invocationNum"\s*:\s*(\d+)/);
    if (invMatch) out.invocationNum = parseInt(invMatch[1], 10);
    const trMatch = head.match(/"transcriptPath"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (trMatch) out.transcriptPath = unescapeJsonStringFragment(trMatch[1]);
    const cwdMatch = head.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (cwdMatch) out.cwd = unescapeJsonStringFragment(cwdMatch[1]);
    const wsMatch = head.match(/"workspacePaths"\s*:\s*\[\s*"((?:[^"\\]|\\.)*)"/);
    if (wsMatch) out.workspacePaths = [unescapeJsonStringFragment(wsMatch[1])];
    const parentMatch = head.match(/"parentConversationId"\s*:\s*"([^"\\]{1,96})"/);
    if (parentMatch) out.parentConversationId = parentMatch[1];
    if (/"isSubagent"\s*:\s*true\b/.test(head)) out.isSubagent = true;
    // Detect non-empty lastUserInput even if the 2MB+ prompt body itself extends past the 64KB head
    if (/"lastUserInput"\s*:\s*"(?!\s*")/.test(head) || (!head.includes('"lastUserInput"') && out.conversationId)) {
      out.lastUserInput = '[oversize-user-input]';
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  const trimmed = rawIn.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  const parsed = stripProtoKeys(JSON.parse(trimmed));
  return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
}

function pruneStalePersonaStates(stateDir, maxAgeMs = 14 * 86400 * 1000, maxFiles = 250) {
  if (!stateDir || isUncOrDevicePath(stateDir)) return 0;
  let removed = 0;
  try {
    if (!fs.existsSync(stateDir) || !fs.lstatSync(stateDir).isDirectory()) return 0;
    const now = Date.now();
    const entries = [];
    for (const name of fs.readdirSync(stateDir)) {
      if (!name.endsWith('.json')) continue;
      const full = path.join(stateDir, name);
      try {
        const lst = fs.lstatSync(full);
        if (!lst.isFile() || lst.isSymbolicLink()) continue;
        if (now - lst.mtimeMs > maxAgeMs) {
          fs.unlinkSync(full);
          removed++;
        } else {
          entries.push({ full, mtimeMs: lst.mtimeMs });
        }
      } catch (_) {}
    }
    if (entries.length > maxFiles) {
      entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (let i = maxFiles; i < entries.length; i++) {
        try {
          fs.unlinkSync(entries[i].full);
          removed++;
        } catch (_) {}
      }
    }
  } catch (_) {}
  return removed;
}

module.exports = {
  DANGEROUS_KEYS,
  VALID_MODES,
  isUncOrDevicePath,
  isSafeLocalRegularFile,
  writeFileAtomicSync,
  normalizeWorkspaceKey,
  normalizePersonaMode,
  normalizeSafeId,
  normalizeSafeLabel,
  normalizeUiLang,
  stripProtoKeys,
  sortKeysDeep,
  resolveHintPaths,
  readExistingHint,
  selectFreshestConfigObject,
  sanitizeCompactProfileEntry,
  sanitizeWorkspaceProfilesStrict,
  syncPersonaRuntimeHint,
  readStdinJsonFast,
  parseHookInputSafe,
  pruneStalePersonaStates
};
