#!/usr/bin/env node
'use strict';

/**
 * Antigravity Lifecycle Hook (`SessionStart`) for `antigravity-shinobu-theme`.
 * - Non-blocking (< 80ms): reads stdin JSON context (`workspacePaths` / `cwd`)
 * - Applies matching Workspace-Aware Theme Profile (`workspaceProfiles[wsKey]`) if configured
 * - Idempotently wakes `daemon/theme_daemon.js` in the background if not already running
 * - Always writes valid `{}` JSON to stdout per Antigravity Hook Contract
 */

const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function checkPidFileAlive(pidPath) {
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
  if (checkPidFileAlive(path.join(baseRoot, 'daemon.pid'))) return baseRoot;
  const globalSkillRoot = path.join(os.homedir(), '.gemini', 'config', 'skills', 'antigravity-custom-theme');
  if (checkPidFileAlive(path.join(globalSkillRoot, 'daemon.pid'))) return globalSkillRoot;
  return baseRoot;
}

const ROOT_DIR = resolveRuntimeRoot();
const PID_FILE = process.env.AGY_PID_FILE || path.join(ROOT_DIR, 'daemon.pid');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const BACKUP_CONFIG_FILE =
  process.env.AGY_BACKUP_CONFIG_PATH ||
  path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');
const PAYLOAD_PATH = path.join(ROOT_DIR, 'dist', 'theme_payload.js');
const BUILD_SCRIPT = path.join(ROOT_DIR, 'scripts', 'build_payload.js');
const DAEMON_SCRIPT = path.join(ROOT_DIR, 'daemon', 'theme_daemon.js');

const DANGEROUS_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'
]);

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

function readExistingConfig() {
  for (const candidate of [CONFIG_FILE, BACKUP_CONFIG_FILE]) {
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8').replace(/^\uFEFF/, '');
        const parsed = stripProtoKeys(JSON.parse(raw));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (_) {}
  }
  return {};
}

function writeConfigAtomically(cfg) {
  const serialized = JSON.stringify(sortKeysDeep(cfg), null, 2);
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, serialized, { encoding: 'utf8', mode: 0o600 });
  } catch (_) {}
  try {
    fs.mkdirSync(path.dirname(BACKUP_CONFIG_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(BACKUP_CONFIG_FILE, serialized, { encoding: 'utf8', mode: 0o600 });
  } catch (_) {}
}

function syncWorkspaceProfileOnStart(hookInput) {
  if (!hookInput || typeof hookInput !== 'object') return false;
  const rawWs = (Array.isArray(hookInput.workspacePaths) && hookInput.workspacePaths[0]) || hookInput.cwd || '';
  const wsKey = normalizeWorkspaceKey(rawWs);
  if (!wsKey) return false;

  const cfg = readExistingConfig();
  let mutated = false;
  if (cfg.activeWorkspace !== wsKey) {
    cfg.activeWorkspace = wsKey;
    mutated = true;
  }

  const profiles = cfg.workspaceProfiles;
  if (profiles && typeof profiles === 'object' && !Array.isArray(profiles) && Object.prototype.hasOwnProperty.call(profiles, wsKey)) {
    const prof = profiles[wsKey];
    if (prof && typeof prof === 'object') {
      const allowedFields = ['themeName', 'bubbleName', 'masterPersona', 'dimming', 'fxDensity', 'chibiEnabled'];
      for (const f of allowedFields) {
        if (prof[f] !== undefined && cfg[f] !== prof[f]) {
          cfg[f] = prof[f];
          mutated = true;
        }
      }
    }
  }

  if (mutated) {
    writeConfigAtomically(cfg);
  }
  return mutated;
}

function isDaemonRunning() {
  try {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').replace(/^\uFEFF/, '').trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function ensureDaemonAwake() {
  if (process.env.AGY_SKIP_DAEMON_SPAWN === '1') return false;
  if (isDaemonRunning()) return false;
  try {
    if (!fs.existsSync(PAYLOAD_PATH) && fs.existsSync(BUILD_SCRIPT)) {
      execFileSync(process.execPath, [BUILD_SCRIPT], {
        cwd: ROOT_DIR,
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

function readStdinWithTimeout(timeoutMs) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { process.stdin.pause(); } catch (_) {}
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      if (chunks.reduce((s, b) => s + b.length, 0) > 256 * 1024) finish();
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

async function main() {
  try {
    const rawIn = await readStdinWithTimeout(90);
    if (rawIn && rawIn.trim()) {
      const parsed = stripProtoKeys(JSON.parse(rawIn.replace(/^\uFEFF/, '')));
      syncWorkspaceProfileOnStart(parsed);
    }
    ensureDaemonAwake();
  } catch (_) {}
  process.stdout.write('{}\n');
}

main();
