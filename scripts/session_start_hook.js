#!/usr/bin/env node
'use strict';

/**
 * Antigravity Lifecycle Hook (`SessionStart`) for `antigravity-shinobu-theme` (v3.1 Hardened).
 * - Fast non-blocking startup (< 60ms): reads stdin JSON via early-exit parser
 * - Clears stale overnight `privacyShieldActive` ephemeral session flags
 * - Applies matching Workspace-Aware Theme Profile (`workspaceProfiles[wsKey]`) with strict type validation
 * - Prunes stale `persona_state/*.json` files (> 14 days / > 250 files)
 * - Idempotently wakes a single verified `daemon/theme_daemon.js` instance
 * - Always writes valid `{}` JSON to stdout per Antigravity Hook Contract
 */

const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  writeFileAtomicSync,
  normalizeWorkspaceKey,
  stripProtoKeys,
  sortKeysDeep,
  selectFreshestConfigObject,
  sanitizeCompactProfileEntry,
  syncPersonaRuntimeHint,
  readStdinJsonFast,
  parseHookInputSafe,
  pruneStalePersonaStates
} = require('./persona_hint_sync');

const CODE_ROOT = process.env.PLUGIN_ROOT
  ? path.resolve(process.env.PLUGIN_ROOT)
  : path.resolve(__dirname, '..');

function checkPidFileAlive(pidPath) {
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
  if (checkPidFileAlive(path.join(CODE_ROOT, 'daemon.pid'))) return CODE_ROOT;
  for (const [grp, sub] of [
    ['plugins', 'antigravity-shinobu-theme'],
    ['plugins', 'antigravity-custom-theme'],
    ['skills', 'antigravity-custom-theme']
  ]) {
    const candRoot = path.join(os.homedir(), '.gemini', 'config', grp, sub);
    if (checkPidFileAlive(path.join(candRoot, 'daemon.pid'))) return candRoot;
  }
  return CODE_ROOT;
}

const ROOT_DIR = resolveRuntimeRoot();
const PID_FILE = process.env.AGY_PID_FILE || path.join(ROOT_DIR, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const BACKUP_CONFIG_FILE =
  process.env.AGY_BACKUP_CONFIG_PATH ||
  path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');
const PAYLOAD_PATH = path.join(CODE_ROOT, 'dist', 'theme_payload.js');
const BUILD_SCRIPT = path.join(CODE_ROOT, 'scripts', 'build_payload.js');
const DAEMON_SCRIPT = path.join(CODE_ROOT, 'daemon', 'theme_daemon.js');

function readExistingConfig() {
  if (process.env.AGY_CONFIG_PATH) {
    return selectFreshestConfigObject([CONFIG_FILE, BACKUP_CONFIG_FILE]);
  }
  const home = os.homedir();
  return selectFreshestConfigObject([
    CONFIG_FILE,
    BACKUP_CONFIG_FILE,
    path.join(home, '.gemini', 'config', 'skills', 'antigravity-custom-theme', 'theme_config.json'),
    path.join(home, '.gemini', 'config', 'plugins', 'antigravity-shinobu-theme', 'theme_config.json')
  ]);
}

function writeConfigAtomically(cfg) {
  const serialized = JSON.stringify(sortKeysDeep(cfg), null, 2);
  writeFileAtomicSync(CONFIG_FILE, serialized, 0o600);
  writeFileAtomicSync(BACKUP_CONFIG_FILE, serialized, 0o600);
}

function hasSubagentMessageFiles(baseMsgDir) {
  for (const dir of [baseMsgDir, path.join(baseMsgDir, 'undelivered')]) {
    try {
      if (!fs.existsSync(dir)) continue;
      const lst = fs.lstatSync(dir);
      if (!lst.isDirectory() || lst.isSymbolicLink()) continue;
      const entries = fs.readdirSync(dir).slice(0, 16);
      if (entries.some((f) => f.endsWith('.json') && f !== 'read.json')) return true;
    } catch (_) {}
  }
  return false;
}

function isSubagentSessionStart(hookInput) {
  if (!hookInput || typeof hookInput !== 'object') return false;
  if (hookInput.isSubagent === true) return true;
  if (typeof hookInput.parentConversationId === 'string' && hookInput.parentConversationId.trim()) return true;
  if (typeof hookInput.transcriptPath === 'string' && hookInput.transcriptPath.trim()) {
    try {
      const logsDir = path.dirname(path.resolve(hookInput.transcriptPath));
      if (path.basename(logsDir) === 'logs') {
        if (hasSubagentMessageFiles(path.join(path.dirname(logsDir), 'messages'))) return true;
      }
    } catch (_) {}
  }
  if (typeof hookInput.conversationId === 'string') {
    const cid = hookInput.conversationId.trim();
    if (/^[a-zA-Z0-9_-]{1,96}$/.test(cid)) {
      const msgDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain', cid, '.system_generated', 'messages');
      if (hasSubagentMessageFiles(msgDir)) return true;
    }
  }
  return false;
}

function syncWorkspaceProfileOnStart(hookInput) {
  if (isSubagentSessionStart(hookInput)) return false;
  const cfg = readExistingConfig();
  let mutated = false;

  // Clear orphaned ephemeral Privacy Shield state from a closed previous IDE session
  if (cfg.privacyShieldActive === true) {
    cfg.privacyShieldActive = false;
    mutated = true;
  }

  const rawWs = (hookInput && typeof hookInput === 'object')
    ? ((Array.isArray(hookInput.workspacePaths) && hookInput.workspacePaths[0]) || hookInput.cwd || '')
    : '';
  const wsKey = normalizeWorkspaceKey(rawWs);

  if (wsKey && cfg.activeWorkspace !== wsKey) {
    cfg.activeWorkspace = wsKey;
    mutated = true;
  }

  let matchedProfile = false;
  const profiles = cfg.workspaceProfiles;
  if (wsKey && profiles && typeof profiles === 'object' && !Array.isArray(profiles) && Object.prototype.hasOwnProperty.call(profiles, wsKey)) {
    const cleanProf = sanitizeCompactProfileEntry(profiles[wsKey]);
    if (cleanProf) {
      matchedProfile = true;
      const allowedFields = [
        'themeName', 'bubbleName', 'masterPersona', 'aiPersonaMode',
        'dimming', 'fxDensity', 'chibiEnabled', 'autoFinisher', 'focusMode'
      ];
      for (const f of allowedFields) {
        if (cleanProf[f] !== undefined && cfg[f] !== cleanProf[f]) {
          cfg[f] = cleanProf[f];
          mutated = true;
        }
      }
    }
  }

  if (mutated) {
    writeConfigAtomically(cfg);
  }
  if (Object.keys(cfg).length > 0) {
    try {
      syncPersonaRuntimeHint(cfg, {
        rootDir: ROOT_DIR,
        configPath: process.env.AGY_CONFIG_PATH ? CONFIG_FILE : '',
        boundWorkspaceKey: matchedProfile ? wsKey : ''
      });
    } catch (_) {}
  }
  return mutated;
}

function isDaemonRunning() {
  if (checkPidFileAlive(PID_FILE)) return true;
  if (!process.env.AGY_PID_FILE) {
    const globalPid = path.join(os.homedir(), '.gemini', 'antigravity', 'theme_daemon.pid');
    if (checkPidFileAlive(globalPid)) return true;
  }
  return false;
}

function ensureDaemonAwake() {
  if (process.env.AGY_SKIP_DAEMON_SPAWN === '1') return false;
  if (isDaemonRunning()) return false;
  try {
    if (!fs.existsSync(PAYLOAD_PATH) && fs.existsSync(BUILD_SCRIPT)) {
      execFileSync(process.execPath, [BUILD_SCRIPT], {
        cwd: CODE_ROOT,
        stdio: 'ignore',
        windowsHide: true,
        timeout: 4500
      });
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

function runStateGarbageCollection() {
  const dirs = process.env.AGY_CONFIG_PATH
    ? []
    : [
        process.env.PLUGIN_DATA ? path.join(path.resolve(process.env.PLUGIN_DATA), 'persona_state') : '',
        path.join(os.homedir(), '.gemini', 'antigravity', 'persona_state')
      ].filter(Boolean);
  for (const d of dirs) {
    pruneStalePersonaStates(d);
  }
}

async function main() {
  try {
    const rawIn = await readStdinJsonFast(800);
    const parsed = parseHookInputSafe(rawIn);
    syncWorkspaceProfileOnStart(parsed);
    runStateGarbageCollection();
    ensureDaemonAwake();
  } catch (_) {}
  process.stdout.write('{}\n');
}

main();
