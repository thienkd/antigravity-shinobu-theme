#!/usr/bin/env node
'use strict';

/**
 * Antigravity Lifecycle Hook (`PreInvocation`) for Dynamic Theme Persona Sync (v3.1 Hardened).
 * - Atomic state I/O, symlink/UNC/FIFO-safe, < 18ms fast-path
 * - True multi-signal subagent detection (`lastUserInput`, `.system_generated/messages`, JSONL line AST)
 * - Accurate JSONL top-level `CHECKPOINT` (`/compact`) & Rewind recovery (even while `off` / `Privacy Shield`)
 * - Silent auto-mute & silent restore across `Privacy Shield` (`Alt+Shift+P`) and `Deep Focus Mode`
 * - 100% Closed-Enum Allowlist (`themes/personas.json`) — zero untrusted text interpolation
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DANGEROUS_KEYS,
  isSafeLocalRegularFile,
  writeFileAtomicSync,
  normalizeWorkspaceKey,
  normalizePersonaMode,
  normalizeSafeId,
  normalizeSafeLabel,
  normalizeUiLang,
  stripProtoKeys,
  resolveHintPaths,
  readExistingHint,
  selectFreshestConfigObject,
  syncPersonaRuntimeHint,
  readStdinJsonFast,
  parseHookInputSafe
} = require('./persona_hint_sync');

const SAFE_CID_RE = /^[a-zA-Z0-9_-]{1,96}$/;

const CODE_ROOT = process.env.PLUGIN_ROOT
  ? path.resolve(process.env.PLUGIN_ROOT)
  : path.resolve(__dirname, '..');
const PERSONAS_FILE = process.env.AGY_PERSONAS_FILE || path.join(CODE_ROOT, 'themes', 'personas.json');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(CODE_ROOT, 'theme_config.json');

function resolveStateDir() {
  if (process.env.AGY_PERSONA_STATE_DIR) {
    return path.resolve(process.env.AGY_PERSONA_STATE_DIR);
  }
  if (process.env.AGY_CONFIG_PATH) {
    return path.join(path.dirname(path.resolve(process.env.AGY_CONFIG_PATH)), '.persona_state');
  }
  if (process.env.PLUGIN_DATA) {
    return path.join(path.resolve(process.env.PLUGIN_DATA), 'persona_state');
  }
  return path.join(os.homedir(), '.gemini', 'antigravity', 'persona_state');
}

function loadPersonasRegistry() {
  try {
    if (!isSafeLocalRegularFile(PERSONAS_FILE)) return null;
    const raw = fs.readFileSync(PERSONAS_FILE, 'utf8').replace(/^\uFEFF/, '');
    const parsed = stripProtoKeys(JSON.parse(raw));
    if (!parsed || typeof parsed !== 'object' || !parsed.personas || typeof parsed.personas !== 'object') {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function loadOrBootstrapHint() {
  const hintPaths = resolveHintPaths(CODE_ROOT, process.env.AGY_CONFIG_PATH || '');
  const hint = readExistingHint(hintPaths);
  if (hint && typeof hint === 'object' && Object.keys(hint).length > 0) {
    return hint;
  }
  const home = os.homedir();
  const candidates = process.env.AGY_CONFIG_PATH
    ? [CONFIG_FILE]
    : [
        CONFIG_FILE,
        path.join(home, '.gemini', 'antigravity', 'custom_theme_backup.json'),
        path.join(home, '.gemini', 'config', 'skills', 'antigravity-custom-theme', 'theme_config.json'),
        path.join(home, '.gemini', 'config', 'plugins', 'antigravity-shinobu-theme', 'theme_config.json')
      ];
  const freshestCfg = selectFreshestConfigObject(candidates);
  if (freshestCfg && Object.keys(freshestCfg).length > 0) {
    const synced = syncPersonaRuntimeHint(freshestCfg, {
      rootDir: CODE_ROOT,
      configPath: process.env.AGY_CONFIG_PATH || ''
    });
    if (synced) return synced;
  }
  return {};
}

function readConversationState(stateFile) {
  try {
    if (!isSafeLocalRegularFile(stateFile)) return null;
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = stripProtoKeys(JSON.parse(raw));
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeConversationState(stateFile, stateObj) {
  writeFileAtomicSync(stateFile, JSON.stringify(stateObj), 0o600);
}

/**
 * Multi-signal classification (`'main' | 'subagent' | 'unknown'`):
 * 1. Explicit `lastUserInput` on stdin -> `'main'` immediately (O(1))
 * 2. `.system_generated/messages/*.json` from parent conversation UUID -> `'subagent'` even when transcript is 0 bytes
 * 3. First non-`SYSTEM_SDK` JSONL step in `transcript.jsonl`:
 *    - `USER_EXPLICIT` / `USER_INPUT` -> `'main'` (unless synthetic test fixture starts directly with `<subagent_reminder>`)
 *    - `SYSTEM` / `SYSTEM_MESSAGE` with `[Message] timestamp=... sender=` -> `'subagent'`
 */
function detectConversationKind(input, transcriptPath, rawCid) {
  if (input.isSubagent === true || (typeof input.parentConversationId === 'string' && input.parentConversationId.trim())) {
    return 'subagent';
  }
  if (typeof input.lastUserInput === 'string' && input.lastUserInput.trim().length > 0) {
    return 'main';
  }

  if (typeof transcriptPath === 'string' && transcriptPath) {
    // Check `.system_generated/messages` and `messages/undelivered` (created before invocationNum=0 on subagents & swarm workers)
    try {
      const logsDir = path.dirname(path.resolve(transcriptPath));
      if (path.basename(logsDir) === 'logs') {
        const baseMsgDir = path.join(path.dirname(logsDir), 'messages');
        for (const msgDir of [baseMsgDir, path.join(baseMsgDir, 'undelivered')]) {
          if (!fs.existsSync(msgDir) || !fs.lstatSync(msgDir).isDirectory() || fs.lstatSync(msgDir).isSymbolicLink()) {
            continue;
          }
          const files = fs.readdirSync(msgDir)
            .filter((f) => f.endsWith('.json') && f !== 'read.json')
            .slice(0, 32);
          for (const f of files) {
            const fp = path.join(msgDir, f);
            if (!isSafeLocalRegularFile(fp)) continue;
            let m = null;
            try { m = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { continue; }
            if (m && m.recipient === rawCid && typeof m.sender === 'string') {
              const sender = m.sender.trim();
              if (sender && sender !== rawCid && !sender.startsWith(`${rawCid}/`)) {
                return 'subagent';
              }
            }
          }
        }
      }
    } catch (_) {}

    if (isSafeLocalRegularFile(transcriptPath)) {
      let fd = null;
      try {
        const st = fs.statSync(transcriptPath);
        if (st.size > 0) {
          const readLen = Math.min(st.size, 65536);
          fd = fs.openSync(transcriptPath, 'r');
          const buf = Buffer.allocUnsafe(readLen);
          const bytesRead = fs.readSync(fd, buf, 0, readLen, 0);
          if (bytesRead > 0) {
            const lines = buf.subarray(0, bytesRead).toString('utf8').split(/\r?\n/);
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('{')) continue;
              let step = null;
              try { step = JSON.parse(trimmed); } catch (_) { continue; }
              if (!step || typeof step !== 'object') continue;
              if (step.source === 'SYSTEM_SDK') continue;

              const contentStr = typeof step.content === 'string' ? step.content.trim() : '';
              if (step.step_index === 0 && contentStr.startsWith('<subagent_reminder>')) {
                return 'subagent';
              }
              if (step.source === 'USER_EXPLICIT' || step.type === 'USER_INPUT') {
                return 'main';
              }
              if (
                step.source === 'SYSTEM' &&
                step.type === 'SYSTEM_MESSAGE' &&
                contentStr.includes('[Message] timestamp=') &&
                contentStr.includes('sender=')
              ) {
                return 'subagent';
              }
            }
          }
        }
      } catch (_) {
      } finally {
        if (fd !== null) {
          try { fs.closeSync(fd); } catch (_) {}
        }
      }
    }
  }

  return 'unknown';
}

function hasDepthOneCheckpointType(prefix) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  const len = prefix.length;
  for (let i = 0; i < len; i++) {
    const ch = prefix.charCodeAt(i);
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === 0x5c) { esc = true; continue; }
      if (ch === 0x22) inStr = false;
      continue;
    }
    if (ch === 0x22) {
      if (depth === 1 && prefix.startsWith('"type"', i)) {
        const afterKey = prefix.slice(i + 6);
        const m = afterKey.match(/^\s*:\s*"([^"\\]*)"/);
        if (m) return m[1] === 'CHECKPOINT';
      }
      inStr = true;
      continue;
    }
    if (ch === 0x7b || ch === 0x5b) {
      depth++;
    } else if (ch === 0x7d || ch === 0x5d) {
      depth--;
      if (depth <= 0) break;
    }
  }
  return false;
}

function isTopLevelCheckpointLine(lineStr, isTruncated) {
  const trimmed = lineStr.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"CHECKPOINT"')) return false;
  if (!isTruncated && trimmed.length <= 65536) {
    try {
      const obj = JSON.parse(trimmed);
      return Boolean(obj && typeof obj === 'object' && obj.type === 'CHECKPOINT');
    } catch (_) {}
  }
  return hasDepthOneCheckpointType(trimmed.slice(0, 4096));
}

function scanRangeForCheckpoint(fd, rangeStart, rangeEnd) {
  if (rangeEnd <= rangeStart) return false;
  let skipPartialFirstLine = false;
  if (rangeStart > 0) {
    const prevByte = Buffer.allocUnsafe(1);
    if (fs.readSync(fd, prevByte, 0, 1, rangeStart - 1) === 1 && prevByte[0] !== 0x0a) {
      skipPartialFirstLine = true;
    }
  }

  const MAX_HEAD_CAP = 66000;
  const CHUNK_SIZE = 65536;
  const buf = Buffer.allocUnsafe(CHUNK_SIZE);
  let headChunks = [];
  let headLen = 0;

  for (let pos = rangeStart; pos < rangeEnd; ) {
    const toRead = Math.min(CHUNK_SIZE, rangeEnd - pos);
    const bytesRead = fs.readSync(fd, buf, 0, toRead, pos);
    if (bytesRead <= 0) break;
    pos += bytesRead;
    const slice = buf.subarray(0, bytesRead);

    let cursor = 0;
    while (cursor < slice.length) {
      const nlIdx = slice.indexOf(0x0a, cursor);
      if (nlIdx === -1) {
        if (!skipPartialFirstLine && headLen < MAX_HEAD_CAP) {
          const rem = slice.subarray(cursor, Math.min(slice.length, cursor + (MAX_HEAD_CAP - headLen)));
          headChunks.push(Buffer.from(rem));
          headLen += rem.length;
        }
        break;
      }
      if (skipPartialFirstLine) {
        skipPartialFirstLine = false;
        headChunks = [];
        headLen = 0;
        cursor = nlIdx + 1;
        continue;
      }
      let lineBuf = null;
      let truncated = false;
      if (headLen === 0) {
        const segLen = nlIdx - cursor;
        truncated = segLen > MAX_HEAD_CAP;
        lineBuf = slice.subarray(cursor, cursor + Math.min(segLen, MAX_HEAD_CAP));
      } else {
        if (headLen < MAX_HEAD_CAP && nlIdx > cursor) {
          const take = Math.min(nlIdx - cursor, MAX_HEAD_CAP - headLen);
          headChunks.push(slice.subarray(cursor, cursor + take));
          headLen += take;
        }
        truncated = headLen >= MAX_HEAD_CAP;
        lineBuf = headChunks.length === 1 ? headChunks[0] : Buffer.concat(headChunks);
      }
      if (lineBuf.length >= 18 && lineBuf.includes('CHECKPOINT')) {
        if (isTopLevelCheckpointLine(lineBuf.toString('utf8'), truncated)) {
          return true;
        }
      }
      headChunks = [];
      headLen = 0;
      cursor = nlIdx + 1;
    }
  }

  if (!skipPartialFirstLine && headLen >= 18) {
    const lineBuf = headChunks.length === 1 ? headChunks[0] : Buffer.concat(headChunks);
    if (lineBuf.includes('CHECKPOINT')) {
      if (isTopLevelCheckpointLine(lineBuf.toString('utf8'), headLen >= MAX_HEAD_CAP)) {
        return true;
      }
    }
  }
  return false;
}

function checkTranscriptRewindOrCompact(transcriptPath, prevState, invocationNum) {
  if (!prevState) return { needReinject: false, currentSize: 0, advanceScanOnly: false };
  const prevOffset = Number.isFinite(prevState.injectedAtOffset) ? prevState.injectedAtOffset : 0;
  const prevScanned = Number.isFinite(prevState.lastScannedOffset) ? prevState.lastScannedOffset : prevOffset;
  const prevInv = Number.isFinite(prevState.injectedAtInvNum) ? prevState.injectedAtInvNum : -1;

  if (Number.isFinite(invocationNum) && invocationNum >= 0 && prevInv >= 0 && invocationNum < prevInv) {
    const curSize = getTranscriptSizeSafe(transcriptPath);
    return { needReinject: true, currentSize: curSize, advanceScanOnly: false };
  }

  if (typeof transcriptPath !== 'string' || !transcriptPath || !isSafeLocalRegularFile(transcriptPath)) {
    return { needReinject: false, currentSize: prevScanned, advanceScanOnly: false };
  }

  let st = null;
  try {
    st = fs.statSync(transcriptPath);
  } catch (_) {
    return { needReinject: false, currentSize: prevScanned, advanceScanOnly: false };
  }

  if (st.size < prevOffset || st.size < prevScanned) {
    return { needReinject: true, currentSize: st.size, advanceScanOnly: false };
  }

  const scanOrigin = Math.max(prevOffset, prevScanned);
  if (st.size > scanOrigin) {
    const delta = st.size - scanOrigin;
    const MAX_CONTIGUOUS_SCAN = 4 * 1024 * 1024;
    let fd = null;
    try {
      fd = fs.openSync(transcriptPath, 'r');
      if (delta <= MAX_CONTIGUOUS_SCAN) {
        if (scanRangeForCheckpoint(fd, scanOrigin, st.size)) {
          return { needReinject: true, currentSize: st.size, advanceScanOnly: false };
        }
      } else {
        const half = 2 * 1024 * 1024;
        if (
          scanRangeForCheckpoint(fd, scanOrigin, scanOrigin + half) ||
          scanRangeForCheckpoint(fd, st.size - half, st.size)
        ) {
          return { needReinject: true, currentSize: st.size, advanceScanOnly: false };
        }
      }
    } catch (_) {
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch (_) {}
      }
    }
    return {
      needReinject: false,
      currentSize: st.size,
      advanceScanOnly: delta >= 32768
    };
  }

  return { needReinject: false, currentSize: st.size, advanceScanOnly: false };
}

function getTranscriptSizeSafe(transcriptPath) {
  try {
    if (typeof transcriptPath === 'string' && transcriptPath && isSafeLocalRegularFile(transcriptPath)) {
      return fs.statSync(transcriptPath).size;
    }
  } catch (_) {}
  return 0;
}

function pickLocalized(arrOrStr, langIdx) {
  if (Array.isArray(arrOrStr)) {
    return String(arrOrStr[langIdx] || arrOrStr[0] || '');
  }
  return typeof arrOrStr === 'string' ? arrOrStr : '';
}

function resolveEffectiveContext(hint, registry, wsKey) {
  const defaultMode = normalizePersonaMode(registry.defaultMode, 'subtle');
  const lang = normalizeUiLang(hint.uiLang);
  const langIdx = lang === 'en' ? 1 : (lang === 'ja' ? 2 : 0);

  let themeName = normalizeSafeLabel(hint.themeName, 80);
  let bubbleName = normalizeSafeLabel(hint.bubbleName, 80);
  let masterPersona = normalizeSafeId(hint.masterPersona, 'yoriichi');
  let rawMode = normalizePersonaMode(hint.aiPersonaMode, '');
  let focusMode = Boolean(hint.focusMode);
  const privacyShieldActive = Boolean(hint.privacyShieldActive);

  if (wsKey) {
    const ovMap = hint.workspaceActiveOverrides;
    const pfMap = hint.workspaceProfiles;
    const wsEntry = (ovMap && typeof ovMap === 'object' && Object.prototype.hasOwnProperty.call(ovMap, wsKey))
      ? ovMap[wsKey]
      : ((pfMap && typeof pfMap === 'object' && Object.prototype.hasOwnProperty.call(pfMap, wsKey)) ? pfMap[wsKey] : null);

    if (wsEntry && typeof wsEntry === 'object') {
      const wsTheme = normalizeSafeLabel(wsEntry.themeName, 80);
      if (wsTheme) themeName = wsTheme;
      const wsBubble = normalizeSafeLabel(wsEntry.bubbleName, 80);
      if (wsBubble) bubbleName = wsBubble;
      else if (wsTheme) bubbleName = wsTheme;
      if (typeof wsEntry.masterPersona === 'string' && wsEntry.masterPersona) {
        masterPersona = normalizeSafeId(wsEntry.masterPersona, masterPersona);
      }
      const wsMode = normalizePersonaMode(wsEntry.aiPersonaMode, '');
      if (wsMode) rawMode = wsMode;
      if (typeof wsEntry.focusMode === 'boolean') {
        focusMode = wsEntry.focusMode;
      }
    }
  }

  const configuredMode = rawMode || defaultMode;
  const mutedByCircuitBreaker = privacyShieldActive || focusMode;
  const effectiveMode = mutedByCircuitBreaker ? 'off' : configuredMode;

  if (effectiveMode === 'off') {
    return {
      configuredMode,
      effectiveMode: 'off',
      personaId: 'neutral',
      isNeutralTheme: false,
      stanceKey: 'none',
      chemKey: '',
      langIdx,
      mutedByCircuitBreaker,
      privacyShieldActive,
      hash: mutedByCircuitBreaker ? 'off:breaker' : `off:manual:${langIdx}`
    };
  }

  const themeMap = (registry.themeMap && typeof registry.themeMap === 'object') ? registry.themeMap : {};
  const fxFallbackMap = (registry.fxFallbackMap && typeof registry.fxFallbackMap === 'object') ? registry.fxFallbackMap : {};
  const personas = registry.personas || {};

  let personaId = '';
  if (themeName && !DANGEROUS_KEYS.has(themeName) && Object.prototype.hasOwnProperty.call(themeMap, themeName)) {
    personaId = themeMap[themeName];
    // Smart Bubble Companion fallback: if backdrop is neutral (`Midnight Obsidian`) while Chibi/Bubble is a specific Hashira
    if (
      personaId === 'neutral' &&
      bubbleName &&
      bubbleName !== themeName &&
      !DANGEROUS_KEYS.has(bubbleName) &&
      Object.prototype.hasOwnProperty.call(themeMap, bubbleName) &&
      themeMap[bubbleName] !== 'neutral'
    ) {
      personaId = themeMap[bubbleName];
    }
  } else if (hint.isForgedActive) {
    const traitCand = normalizeSafeId(hint.forgedPersonaTraitId, '');
    if (traitCand && Object.prototype.hasOwnProperty.call(personas, traitCand)) {
      personaId = traitCand;
    } else {
      const fxCand = normalizeSafeId(hint.forgedFxMode, '');
      if (fxCand && Object.prototype.hasOwnProperty.call(fxFallbackMap, fxCand)) {
        personaId = fxFallbackMap[fxCand];
      }
    }
  }

  if (!personaId && !themeName) {
    const firstThemeKey = Object.keys(themeMap)[0] || '';
    if (firstThemeKey && Object.prototype.hasOwnProperty.call(themeMap, firstThemeKey)) {
      personaId = themeMap[firstThemeKey];
    }
  }

  if (!personaId || !Object.prototype.hasOwnProperty.call(personas, personaId)) {
    personaId = 'neutral';
  }

  // Distinct handling for neutral theme (`Midnight Obsidian`) while AI persona sync is still enabled (`subtle` / `roleplay`)
  if (personaId === 'neutral') {
    return {
      configuredMode,
      effectiveMode: 'off',
      personaId: 'neutral',
      isNeutralTheme: true,
      stanceKey: 'none',
      chemKey: '',
      langIdx,
      mutedByCircuitBreaker: false,
      privacyShieldActive: false,
      hash: `${configuredMode}:neutral:${langIdx}`
    };
  }

  const mpGroups = (registry.masterPersonaGroups && typeof registry.masterPersonaGroups === 'object')
    ? registry.masterPersonaGroups
    : {};
  let stanceKey = 'founder_respect';
  if (personaId === masterPersona) {
    stanceKey = 'resonance_twin';
  } else if (masterPersona && Object.prototype.hasOwnProperty.call(mpGroups, masterPersona)) {
    stanceKey = mpGroups[masterPersona];
  }

  const chemCandidate = `${personaId}:${masterPersona}`;
  const chemMap = (registry.microChemistry && typeof registry.microChemistry === 'object') ? registry.microChemistry : {};
  const chemKey = Object.prototype.hasOwnProperty.call(chemMap, chemCandidate) ? chemCandidate : '';

  return {
    configuredMode,
    effectiveMode,
    personaId,
    isNeutralTheme: false,
    stanceKey,
    chemKey,
    langIdx,
    mutedByCircuitBreaker: false,
    privacyShieldActive: false,
    hash: `${effectiveMode}:${personaId}:${stanceKey}:${chemKey}:${langIdx}`
  };
}

function wrapStepOutput(sysText, visibleMd) {
  const inner = { systemMessage: sysText };
  if (visibleMd) {
    inner.metadata = { user_markdown: visibleMd };
  }
  return { systemMessage: inner };
}

function buildPersonaShiftStep(ctx, registry, showVisibleBadge) {
  const { effectiveMode, personaId, isNeutralTheme, stanceKey, chemKey, langIdx, privacyShieldActive, mutedByCircuitBreaker } = ctx;

  if (effectiveMode === 'off' || personaId === 'neutral') {
    const sysText = '[AGY_PERSONA_SHIFT id="neutral" mode="off"]\nRespond with crisp, neutral Principal Engineer clarity and zero character roleplay.';
    let visibleMd = '';
    if (showVisibleBadge && !privacyShieldActive && !mutedByCircuitBreaker) {
      if (isNeutralTheme && registry.personas && registry.personas.neutral) {
        const prefix = pickLocalized(registry.shiftNoticePrefix, langIdx);
        const neutralBadge = pickLocalized(registry.personas.neutral.badge, langIdx);
        visibleMd = `${prefix ? `*${prefix}* ` : ''}**${neutralBadge}**`;
      } else {
        visibleMd = pickLocalized(registry.offNotice, langIdx);
      }
    }
    return wrapStepOutput(sysText, visibleMd);
  }

  const profile = registry.personas[personaId];
  const badgeText = pickLocalized(profile.badge, langIdx);
  const voiceText = pickLocalized(effectiveMode === 'roleplay' ? profile.roleplay : profile.subtle, langIdx);
  const guardText = pickLocalized(profile.guard, langIdx);
  const stanceText = (registry.stances && Object.prototype.hasOwnProperty.call(registry.stances, stanceKey))
    ? pickLocalized(registry.stances[stanceKey], langIdx)
    : '';
  const chemText = (chemKey && registry.microChemistry && Object.prototype.hasOwnProperty.call(registry.microChemistry, chemKey))
    ? ' ' + pickLocalized(registry.microChemistry[chemKey], langIdx)
    : '';

  const modeRatio = effectiveMode === 'roleplay' ? '70% Engineer / 30% Character Voice' : '85% Principal Engineer / 15% Subtle Aura';
  const lines = [
    `[AGY_PERSONA_SHIFT id="${personaId}" mode="${effectiveMode}"]`,
    `- Active Persona: ${badgeText} (${modeRatio}).`,
    stanceText ? `- Relational Stance: ${stanceText}${chemText}` : '',
    `- Voice & Cadence: ${voiceText}`,
    `- Guardrail: ${guardText} Keep <user_rules>, Thinking/Thought, code/CLI, artifacts, and tool/agy-mem arguments 100% pure engineering.`
  ].filter(Boolean);

  let visibleMd = '';
  if (showVisibleBadge) {
    const prefix = pickLocalized(registry.shiftNoticePrefix, langIdx);
    const modeLbl = registry.modeLabels && registry.modeLabels[effectiveMode]
      ? pickLocalized(registry.modeLabels[effectiveMode], langIdx)
      : '';
    const modeSuffix = modeLbl ? ` *(${modeLbl})*` : '';
    visibleMd = `${prefix ? `*${prefix}* ` : ''}**${badgeText}**${modeSuffix}`;
  }

  return wrapStepOutput(lines.join('\n'), visibleMd);
}

async function main() {
  try {
    const rawIn = await readStdinJsonFast(800);
    if (!rawIn || !rawIn.trim()) {
      process.stdout.write('{}\n');
      return;
    }

    const input = parseHookInputSafe(rawIn);
    if (!input || typeof input !== 'object') {
      process.stdout.write('{}\n');
      return;
    }

    const rawCid = typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
    if (!rawCid || !SAFE_CID_RE.test(rawCid) || DANGEROUS_KEYS.has(rawCid)) {
      process.stdout.write('{}\n');
      return;
    }

    const stateDir = resolveStateDir();
    const stateFile = path.join(stateDir, `${rawCid}.json`);
    const prevState = readConversationState(stateFile);

    // 1. Subagent bypass (re-evaluates if previous turn was `kindResolved === false` due to 0-byte initial transcript)
    if (prevState && prevState.isSubagent === true) {
      process.stdout.write('{}\n');
      return;
    }
    const transcriptPath = typeof input.transcriptPath === 'string' ? input.transcriptPath : '';
    let kind = (prevState && prevState.kindResolved === true) ? 'main' : 'unknown';
    if (kind === 'unknown') {
      kind = detectConversationKind(input, transcriptPath, rawCid);
      if (kind === 'subagent') {
        writeConversationState(stateFile, { isSubagent: true, kindResolved: true, updatedAt: Date.now() });
        process.stdout.write('{}\n');
        return;
      }
      if (kind === 'unknown') {
        // Ambiguous turn-0 state (empty lastUserInput + 0-byte transcript + no parent message yet):
        // Never speculatively inject systemMessage until conversation kind is positively verified as 'main'.
        process.stdout.write('{}\n');
        return;
      }
    }

    const registry = loadPersonasRegistry();
    if (!registry) {
      process.stdout.write('{}\n');
      return;
    }

    const hint = loadOrBootstrapHint();
    // Fail-safe against transient empty hint mid-conversation: never clobber existing state with fallback theme[0]
    if (prevState && prevState.hash && (!hint || Object.keys(hint).length === 0)) {
      process.stdout.write('{}\n');
      return;
    }

    const rawWs = (Array.isArray(input.workspacePaths) && input.workspacePaths[0]) || input.cwd || '';
    const wsKey = normalizeWorkspaceKey(rawWs);
    const ctx = resolveEffectiveContext(hint, registry, wsKey);
    const invocationNum = Number.isFinite(input.invocationNum) ? input.invocationNum : 0;
    const isActivePersona = ctx.effectiveMode !== 'off' && ctx.personaId !== 'neutral';

    // 2. First time encountering this conversation
    if (!prevState || typeof prevState.hash !== 'string') {
      const curSize = getTranscriptSizeSafe(transcriptPath);
      writeConversationState(stateFile, {
        hash: ctx.hash,
        personaId: ctx.personaId,
        mode: ctx.effectiveMode,
        isSubagent: false,
        kindResolved: kind === 'main',
        hadPersonaInjection: isActivePersona,
        wasMutedByBreaker: ctx.mutedByCircuitBreaker,
        lastActivePersonaId: isActivePersona ? ctx.personaId : '',
        lastActiveMode: isActivePersona ? ctx.effectiveMode : '',
        injectedAtOffset: curSize,
        lastScannedOffset: curSize,
        injectedAtInvNum: invocationNum,
        updatedAt: Date.now()
      });

      if (!isActivePersona) {
        process.stdout.write('{}\n');
        return;
      }

      // Silent initialization at start of conversation
      const step = buildPersonaShiftStep(ctx, registry, false);
      process.stdout.write(JSON.stringify({ injectSteps: [step] }) + '\n');
      return;
    }

    // 3. Fast-Path: Same hash (99% of model calls) -> check rewind or `/compact` CHECKPOINT
    if (prevState.hash === ctx.hash) {
      if (kind === 'main' && prevState.kindResolved !== true) {
        writeConversationState(stateFile, { ...prevState, kindResolved: true, updatedAt: Date.now() });
      }
      // Only skip transcript check if this conversation NEVER injected a persona from start to present
      if (!isActivePersona && !prevState.hadPersonaInjection) {
        process.stdout.write('{}\n');
        return;
      }
      const check = checkTranscriptRewindOrCompact(transcriptPath, prevState, invocationNum);
      if (!check.needReinject) {
        if (check.advanceScanOnly) {
          writeConversationState(stateFile, {
            ...prevState,
            kindResolved: kind === 'main' || Boolean(prevState.kindResolved),
            lastScannedOffset: check.currentSize,
            updatedAt: Date.now()
          });
        }
        process.stdout.write('{}\n');
        return;
      }
      // Silent recovery after `/compact` or rewind (re-asserts either active persona OR `off` override!)
      writeConversationState(stateFile, {
        ...prevState,
        kindResolved: kind === 'main' || Boolean(prevState.kindResolved),
        injectedAtOffset: check.currentSize,
        lastScannedOffset: check.currentSize,
        injectedAtInvNum: invocationNum,
        updatedAt: Date.now()
      });
      const step = buildPersonaShiftStep(ctx, registry, false);
      process.stdout.write(JSON.stringify({ injectSteps: [step] }) + '\n');
      return;
    }

    // 4. Live Mid-Conversation Persona / Theme / Mode Switch!
    const curSize = getTranscriptSizeSafe(transcriptPath);
    const returningFromBreakerMute = Boolean(
      prevState.wasMutedByBreaker &&
      !ctx.mutedByCircuitBreaker &&
      prevState.lastActivePersonaId === ctx.personaId &&
      prevState.lastActiveMode === ctx.effectiveMode
    );

    const personaOrModeChanged =
      prevState.personaId !== ctx.personaId ||
      prevState.mode !== ctx.effectiveMode ||
      (ctx.isNeutralTheme && prevState.hash !== ctx.hash);

    const showVisibleBadge = Boolean(
      personaOrModeChanged &&
      !returningFromBreakerMute &&
      !ctx.mutedByCircuitBreaker &&
      (invocationNum > 0 || curSize > 0)
    );

    const nextHadInjection = Boolean(prevState.hadPersonaInjection || isActivePersona);
    // If conversation started pure `off:manual` and switched to `Midnight Obsidian` (`subtle:neutral`), still 0-token needed if never injected!
    const needSystemStep = Boolean(nextHadInjection || showVisibleBadge);

    writeConversationState(stateFile, {
      hash: ctx.hash,
      personaId: ctx.personaId,
      mode: ctx.effectiveMode,
      isSubagent: false,
      kindResolved: kind === 'main' || Boolean(prevState.kindResolved),
      hadPersonaInjection: nextHadInjection,
      wasMutedByBreaker: ctx.mutedByCircuitBreaker,
      lastActivePersonaId: isActivePersona ? ctx.personaId : (prevState.lastActivePersonaId || ''),
      lastActiveMode: isActivePersona ? ctx.effectiveMode : (prevState.lastActiveMode || ''),
      injectedAtOffset: curSize,
      lastScannedOffset: curSize,
      injectedAtInvNum: invocationNum,
      updatedAt: Date.now()
    });

    if (!needSystemStep) {
      process.stdout.write('{}\n');
      return;
    }

    const step = buildPersonaShiftStep(ctx, registry, showVisibleBadge);
    process.stdout.write(JSON.stringify({ injectSteps: [step] }) + '\n');
  } catch (_) {
    process.stdout.write('{}\n');
  }
}

main();
