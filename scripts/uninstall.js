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

function getEffectiveHomedir() {
    if (process.platform === 'win32') {
        return process.env.USERPROFILE || process.env.HOME || os.homedir();
    }
    return process.env.HOME || os.homedir();
}

const ROOT_DIR = path.resolve(__dirname, '..');
const DAEMON_JS = path.join(ROOT_DIR, 'daemon', 'theme_daemon.js');
const RESOLVED_DAEMON_JS = path.resolve(DAEMON_JS);
const PID_FILE = path.join(ROOT_DIR, 'daemon.pid');
const LOG_FILE = path.join(ROOT_DIR, 'daemon.log');
const LOCK_FILE = path.join(ROOT_DIR, 'daemon.lock');
const VBS_FILE = path.join(ROOT_DIR, 'silent-start.vbs');
const CONFIG_FILE = process.env.AGY_CONFIG_PATH || path.join(ROOT_DIR, 'theme_config.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BACKUP_CONFIG_FILE =
    process.env.AGY_BACKUP_CONFIG_PATH ||
    path.join(getEffectiveHomedir(), '.gemini', 'antigravity', 'custom_theme_backup.json');

const PURGE = process.argv.slice(2).includes('--purge');

const WIN_CI_FLAGS = process.platform === 'win32' ? 'i' : '';
const NODE_PROC_RE = /\bnode(?:js|\d+)?(?:\.exe)?\b/i;
const DAEMON_SCRIPT_RE = new RegExp('theme_daemon\\.js', WIN_CI_FLAGS);
const DAEMON_ARG_RE = new RegExp('(?:^|[\\s"\'\\\\/])theme_daemon\\.js(?=$|[\\s"\'])', WIN_CI_FLAGS);
const UNINSTALL_SCRIPT_TOKEN_RE = /(?:^|[\\/])uninstall\.js$/i;

function normalizePathForCompare(p) {
    let resolved = path.resolve(String(p || ''));
    try {
        resolved = resolved.normalize('NFC');
    } catch (_) {}
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function resolveCanonicalPath(p) {
    const resolved = path.resolve(String(p || ''));
    try {
        let real = fs.realpathSync(resolved);
        try { real = real.normalize('NFC'); } catch (_) {}
        return process.platform === 'win32' ? real.toLowerCase() : real;
    } catch (_) {
        let fallback = resolved;
        try { fallback = fallback.normalize('NFC'); } catch (__) {}
        return process.platform === 'win32' ? fallback.toLowerCase() : fallback;
    }
}

function splitCommandLineArgs(cmdLine, platform = process.platform) {
    const args = [];
    let cur = '';
    let quote = '';
    for (let i = 0; i < cmdLine.length; i++) {
        const ch = cmdLine[i];
        if (quote) {
            if (ch === quote) {
                quote = '';
            } else {
                cur += ch;
            }
        } else if (ch === '"' || (platform !== 'win32' && ch === "'")) {
            quote = ch;
        } else if (/\s/.test(ch)) {
            if (cur) {
                args.push(cur);
                cur = '';
            }
        } else {
            cur += ch;
        }
    }
    if (cur) args.push(cur);
    return args;
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isUninstallScriptToken(rawTok) {
    if (!rawTok) return false;
    const tok = String(rawTok).trim().replace(/\//g, path.sep);
    return UNINSTALL_SCRIPT_TOKEN_RE.test(tok);
}

const NODE_VALUE_FLAGS = new Set([
    '-r',
    '--require',
    '--import',
    '-C',
    '--conditions',
    '--input-type',
    '--loader',
    '--experimental-loader',
    '-e',
    '--eval',
    '-p',
    '--print',
    '--env-file',
    '--env-file-if-exists',
    '--watch-path',
    '--diagnostic-dir',
    '--redirect-warnings',
    '--title',
    '--max-http-header-size',
    '--heapsnapshot-near-heap-limit',
    '--tls-cipher-list',
    '--openssl-config',
    '--icu-data-dir',
    '--dns-result-order',
    '--unhandled-rejections',
    '--inspect-publish-uid',
]);

function extractEntryScriptToken(args) {
    if (!Array.isArray(args) || args.length === 0) return '';
    let idx = 0;
    const first = String(args[0] || '');
    if (NODE_PROC_RE.test(first)) {
        idx = 1;
    }
    for (let i = idx; i < args.length; i++) {
        const tok = String(args[i] || '');
        if (!tok) continue;
        if (tok === '--') {
            return i + 1 < args.length ? String(args[i + 1] || '') : '';
        }
        if (tok.startsWith('-')) {
            if (!tok.includes('=') && NODE_VALUE_FLAGS.has(tok)) {
                i++;
            }
            continue;
        }
        return tok;
    }
    return '';
}

function isTargetDaemonArgs(args, procHint = '', options = {}) {
    if (!Array.isArray(args) || args.length === 0) return false;
    if (args.some((rawTok) => isUninstallScriptToken(rawTok))) return false;
    const joined = `${procHint} ${args.join(' ')}`.trim();
    if (!NODE_PROC_RE.test(joined)) return false;

    const entryRaw = extractEntryScriptToken(args);
    if (!entryRaw) return false;

    const allowRelativeFromRoot = Boolean(options && options.allowRelativeFromRoot);
    const baseDir = options && typeof options.baseDir === 'string' ? options.baseDir : '';
    const resolveRoot = baseDir || (allowRelativeFromRoot ? ROOT_DIR : '');

    const targetNorm = normalizePathForCompare(RESOLVED_DAEMON_JS);
    const targetCanonical = resolveCanonicalPath(RESOLVED_DAEMON_JS);

    const tok = String(entryRaw).replace(/\//g, path.sep);
    const endsWithDaemon = process.platform === 'win32'
        ? /(?:^|[\\/])theme_daemon\.js$/i.test(tok)
        : /(?:^|[\\/])theme_daemon\.js$/.test(tok);
    if (!endsWithDaemon) return false;

    let candidatePath = '';
    if (path.isAbsolute(tok)) {
        candidatePath = tok;
    } else if (resolveRoot && /[\\/]/.test(tok)) {
        candidatePath = path.resolve(resolveRoot, tok);
    } else {
        return false;
    }

    if (normalizePathForCompare(candidatePath) === targetNorm) return true;
    if (resolveCanonicalPath(candidatePath) === targetCanonical) return true;
    return false;
}

function isTargetDaemonCommand(cmdLine, procHint = '', options = {}) {
    if (!cmdLine || typeof cmdLine !== 'string') return false;
    const combined = procHint ? `${procHint} ${cmdLine}` : cmdLine;
    if (!NODE_PROC_RE.test(combined) || !DAEMON_ARG_RE.test(cmdLine)) return false;

    const tokens = splitCommandLineArgs(cmdLine);
    if (tokens.some((rawTok) => isUninstallScriptToken(rawTok))) return false;
    if (isTargetDaemonArgs(tokens, procHint, options)) return true;

    // Fallback cho trường hợp ps in đường dẫn tuyệt đối có khoảng trắng không bọc dấu nháy;
    // không áp dụng nếu có một script .js/.cjs/.mjs khác đứng làm entry script trước đó.
    const entryRaw = extractEntryScriptToken(tokens);
    if (entryRaw && /\.(?:js|cjs|mjs)$/i.test(entryRaw) && !/theme_daemon\.js$/i.test(entryRaw)) {
        return false;
    }

    const targetVariantsSet = new Set([RESOLVED_DAEMON_JS]);
    try {
        const real = fs.realpathSync(RESOLVED_DAEMON_JS);
        if (real) targetVariantsSet.add(real);
    } catch (_) {}
    for (const v of Array.from(targetVariantsSet)) {
        if (v.startsWith('/private/var/')) targetVariantsSet.add(v.slice('/private'.length));
        else if (v.startsWith('/var/')) targetVariantsSet.add('/private' + v);
    }
    for (const v of Array.from(targetVariantsSet)) {
        try { targetVariantsSet.add(v.normalize('NFC')); } catch (_) {}
        try { targetVariantsSet.add(v.normalize('NFD')); } catch (_) {}
    }
    const targetVariants = Array.from(targetVariantsSet);
    const flags = process.platform === 'win32' ? 'i' : '';
    let normalizedCmdLine = cmdLine;
    try { normalizedCmdLine = cmdLine.normalize('NFC'); } catch (_) {}
    for (const variant of targetVariants) {
        const sepPattern = process.platform === 'win32'
            ? escapeRegExp(variant).replace(/\\\\/g, '[\\\\/]')
            : escapeRegExp(variant);
        const exactBoundaryRe = new RegExp(`(?:^|\\s)${sepPattern}(?=$|\\s)`, flags);
        if (exactBoundaryRe.test(cmdLine) || exactBoundaryRe.test(normalizedCmdLine)) return true;
    }
    return false;
}

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
    if (process.env.AGY_DEVTOOLS_PORT_FILE) return process.env.AGY_DEVTOOLS_PORT_FILE;
    if (process.env.AGY_PORT_FILE) return process.env.AGY_PORT_FILE;
    const home = getEffectiveHomedir();
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

function getLinuxProcCwd(pid) {
    if (process.platform !== 'linux') return '';
    try {
        return fs.readlinkSync(`/proc/${pid}/cwd`);
    } catch (_) {
        return '';
    }
}

function isVerifiedDaemonProcess(pid, options = {}) {
    if (!Number.isInteger(pid) || pid <= 0 || !isPidAlive(pid)) return false;

    if (process.platform === 'win32') {
        try {
            const out = execFileSync(
                'powershell.exe',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; $p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction Stop; if ($p) { "$($p.Name)|$($p.CommandLine)" }`,
                ],
                { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
            ).trim();
            if (!out) return false;
            const sep = out.indexOf('|');
            const procName = sep >= 0 ? out.slice(0, sep) : '';
            const cmdLine = sep >= 0 ? out.slice(sep + 1) : out;
            return isTargetDaemonCommand(cmdLine, procName, options);
        } catch (_) {
            try {
                const wmicOut = execFileSync(
                    'wmic.exe',
                    ['process', 'where', `ProcessId=${pid}`, 'get', 'Name,CommandLine', '/FORMAT:LIST'],
                    { encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }
                ).trim();
                if (!wmicOut) return false;
                const nameMatch = wmicOut.match(/^Name=(.*)$/im);
                const cmdMatch = wmicOut.match(/^CommandLine=(.*)$/im);
                const procName = nameMatch ? nameMatch[1].trim() : '';
                const cmdLine = cmdMatch ? cmdMatch[1].trim() : '';
                return isTargetDaemonCommand(cmdLine, procName, options);
            } catch (__) {
                return false;
            }
        }
    }

    if (process.platform === 'linux') {
        const procCwd = (options && options.baseDir) || getLinuxProcCwd(pid);
        const linuxOpts = procCwd ? { ...options, baseDir: procCwd } : options;
        try {
            const rawArgs = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
            if (rawArgs.length > 0) {
                return isTargetDaemonArgs(rawArgs, '', linuxOpts);
            }
        } catch (_) {}
        try {
            const cmdline = execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], {
                encoding: 'utf8',
                timeout: 3000,
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
            return isTargetDaemonCommand(cmdline, '', linuxOpts);
        } catch (_) {
            return false;
        }
    }

    const utf8PsEnv = { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
    try {
        const cmdline = execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], {
            encoding: 'utf8',
            env: utf8PsEnv,
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return isTargetDaemonCommand(cmdline, '', options);
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
    const xdgData = process.env.XDG_DATA_HOME || path.join(getEffectiveHomedir(), '.local', 'share');
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

function unpatchWindowsShortcuts(overrideDirs = null) {
    if (process.platform !== 'win32') return;
    const rawEnvDirs = process.env.AGY_UNINSTALL_SHORTCUT_DIRS;
    const customDirs = Array.isArray(overrideDirs)
        ? overrideDirs.map((d) => String(d || '').trim()).filter(Boolean)
        : rawEnvDirs !== undefined
          ? String(rawEnvDirs)
                .split(path.delimiter)
                .map((d) => d.trim())
                .filter(Boolean)
          : null;
    if (customDirs && customDirs.length === 0) return;

    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
if (-not ([System.Management.Automation.PSTypeName]'AgyWinShortcut.ShortcutCom').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace AgyWinShortcut {
    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink { }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    public static class ShortcutCom {
        public static string[] ReadTargetAndArgs(string lnkPath) {
            object link = null;
            try {
                link = new ShellLink();
                var persist = (IPersistFile)link;
                persist.Load(lnkPath, 0);
                var shellLink = (IShellLinkW)link;
                var targetSb = new StringBuilder(4096);
                var argsSb = new StringBuilder(4096);
                shellLink.GetPath(targetSb, targetSb.Capacity, IntPtr.Zero, 0);
                shellLink.GetArguments(argsSb, argsSb.Capacity);
                return new string[] { targetSb.ToString(), argsSb.ToString() };
            } finally {
                if (link != null && Marshal.IsComObject(link)) {
                    Marshal.FinalReleaseComObject(link);
                }
            }
        }

        public static void SaveArguments(string lnkPath, string newArgs) {
            object link = null;
            try {
                link = new ShellLink();
                var persist = (IPersistFile)link;
                persist.Load(lnkPath, 0);
                var shellLink = (IShellLinkW)link;
                shellLink.SetArguments(newArgs);
                persist.Save(lnkPath, true);
            } finally {
                if (link != null && Marshal.IsComObject(link)) {
                    Marshal.FinalReleaseComObject(link);
                }
            }
        }
    }
}
'@
}
$OverrideDirsRaw = $env:AGY_SHORTCUT_OVERRIDE_DIRS
if ($OverrideDirsRaw) {
  $Dirs = @($OverrideDirsRaw -split "\`r?\`n" | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
} else {
  $Dirs = @(
    [Environment]::GetFolderPath('DesktopDirectory'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Startup'),
    (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
}
foreach ($d in $Dirs) {
  Get-ChildItem -LiteralPath $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $lnkPath = $_.FullName
      $info = [AgyWinShortcut.ShortcutCom]::ReadTargetAndArgs($lnkPath)
      $targetPath = $info[0]
      $rawArgs = $info[1]
      if ($targetPath -and ($targetPath -imatch '\\\\Antigravity\\.exe$')) {
        if ($rawArgs -and ($rawArgs -match '--remote-debugging-port')) {
          $newArgs = (($rawArgs -replace '\\s*--remote-debugging-port(?:=\\S+)?', '') -replace '\\s{2,}', ' ').Trim()
          if ($newArgs -ne $rawArgs) {
            [AgyWinShortcut.ShortcutCom]::SaveArguments($lnkPath, $newArgs)
            Write-Output $lnkPath
          }
        }
      }
    } catch {}
  }
}
`;
    const childEnv = { ...process.env };
    if (customDirs) {
        childEnv.AGY_SHORTCUT_OVERRIDE_DIRS = customDirs.join('\n');
    } else {
        delete childEnv.AGY_SHORTCUT_OVERRIDE_DIRS;
    }
    try {
        const out = execFileSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', psScript],
            {
                encoding: 'utf8',
                env: childEnv,
                windowsHide: true,
                timeout: 20000,
                stdio: ['ignore', 'pipe', 'ignore'],
            }
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

function findOrphanDaemonPids(excludePids = new Set()) {
    const found = new Set();
    const selfPid = process.pid;
    const parentPid = process.ppid;

    const considerCandidate = (pid, cmdLine, procHint = '') => {
        if (!Number.isInteger(pid) || pid <= 0) return;
        if (pid === selfPid || pid === parentPid || excludePids.has(pid) || found.has(pid)) return;
        const procOpts = process.platform === 'linux' ? { baseDir: getLinuxProcCwd(pid) } : {};
        if (cmdLine && !isTargetDaemonCommand(cmdLine, procHint, procOpts)) return;
        if (isVerifiedDaemonProcess(pid, procOpts)) {
            found.add(pid);
        }
    };

    if (process.platform === 'win32') {
        try {
            const out = execFileSync(
                'powershell.exe',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process -Filter "Name LIKE 'node%'" -ErrorAction SilentlyContinue | ForEach-Object { if ($_.CommandLine) { "$($_.ProcessId)|$($_.CommandLine)" } }`,
                ],
                { encoding: 'utf8', windowsHide: true, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }
            );
            for (const line of out.split(/\r?\n/)) {
                const sep = line.indexOf('|');
                if (sep <= 0) continue;
                const pid = parseInt(line.slice(0, sep).trim(), 10);
                const cmd = line.slice(sep + 1);
                considerCandidate(pid, cmd, 'node.exe');
            }
            return Array.from(found);
        } catch (_) {
            try {
                const wmicOut = execFileSync(
                    'wmic.exe',
                    ['process', 'where', "Name like 'node%'", 'get', 'ProcessId,CommandLine', '/FORMAT:LIST'],
                    { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
                );
                for (const block of wmicOut.split(/\r?\n\s*\r?\n/)) {
                    const pidMatch = block.match(/ProcessId=(\d+)/i);
                    const cmdMatch = block.match(/CommandLine=(.*)/i);
                    const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
                    const cmd = cmdMatch ? cmdMatch[1] : block;
                    considerCandidate(pid, cmd, 'node.exe');
                }
            } catch (__) {}
            return Array.from(found);
        }
    }

    const utf8PsEnv = { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
    try {
        const psOut = execFileSync('ps', ['-ax', '-ww', '-o', 'pid=,command='], {
            encoding: 'utf8',
            env: utf8PsEnv,
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        for (const line of psOut.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || !DAEMON_SCRIPT_RE.test(trimmed)) continue;
            const m = trimmed.match(/^(\d+)\s+(.*)$/);
            if (!m) continue;
            considerCandidate(parseInt(m[1], 10), m[2]);
        }
        return Array.from(found);
    } catch (_) {
        try {
            const pgrepOut = execFileSync('pgrep', ['-f', 'theme_daemon.js'], {
                encoding: 'utf8',
                timeout: 3000,
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            for (const line of pgrepOut.split(/\r?\n/)) {
                const pid = parseInt(line.trim(), 10);
                considerCandidate(pid, '');
            }
        } catch (__) {}
        return Array.from(found);
    }
}

async function stopDaemonAndCleanRuntimeFiles(prePid, preVerified) {
    const currentPid = readRecordedPid();
    const pid = currentPid || prePid;
    const waitPids = [];
    const handledPids = new Set();

    if (pid > 0) {
        handledPids.add(pid);
        if (isVerifiedDaemonProcess(pid, { allowRelativeFromRoot: true })) {
            waitPids.push(pid);
            try {
                process.kill(pid, 'SIGTERM');
                console.log(`[uninstall] Sent SIGTERM to verified daemon PID ${pid}.`);
            } catch (_) {
                console.log(`[uninstall] Daemon PID ${pid} already exited.`);
            }
        } else if (pid === prePid && preVerified) {
            waitPids.push(pid);
            console.log(`[uninstall] Verified daemon PID ${pid} stopped via service manager.`);
        } else {
            console.log(`[uninstall] Skipped PID ${pid} (not an active theme_daemon.js process).`);
        }
    } else {
        console.log('[uninstall] No active daemon.pid found.');
    }

    const orphanPids = findOrphanDaemonPids(handledPids);
    for (const orphanPid of orphanPids) {
        waitPids.push(orphanPid);
        try {
            process.kill(orphanPid, 'SIGTERM');
            console.log(`[uninstall] Sent SIGTERM to orphan daemon PID ${orphanPid}.`);
        } catch (_) {
            console.log(`[uninstall] Orphan daemon PID ${orphanPid} already exited.`);
        }
    }

    if (waitPids.length > 0) {
        await Promise.all(waitPids.map((p) => waitForPidExit(p, 800, 80)));
    }

    safeUnlink(PID_FILE, 'daemon PID file');
    safeUnlink(LOG_FILE, 'daemon log file');
    safeUnlink(LOCK_FILE, 'daemon lock file');
    safeUnlink(VBS_FILE, 'VBScript launcher');

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
        const appData = process.env.APPDATA || path.join(getEffectiveHomedir(), 'AppData', 'Roaming');
        const lnk = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'AntigravityCustomTheme.lnk');
        safeUnlink(lnk, 'Windows Startup shortcut');
        safeUnlink(VBS_FILE, 'VBScript launcher');
        return;
    }

    if (process.platform === 'darwin') {
        const label = 'io.antigravity.custom-theme';
        const plist = path.join(getEffectiveHomedir(), 'Library', 'LaunchAgents', `${label}.plist`);
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

    const xdg = process.env.XDG_CONFIG_HOME || path.join(getEffectiveHomedir(), '.config');
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
            p.startsWith('/c/') ||
            p.startsWith('/p/') ||
            p === '/projects' ||
            p.startsWith('/projects/') ||
            p === '/settings' ||
            p.startsWith('/settings/') ||
            p === '/manager' ||
            p.startsWith('/manager/') ||
            p === '/workspace' ||
            p.startsWith('/workspace/') ||
            p.startsWith('/w/') ||
            p === '/chat' ||
            p.startsWith('/chat/')
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
    if (process.env.AGY_SKIP_CDP_CLEANUP === '1') {
        console.log('[uninstall] CDP cleanup skipped (AGY_SKIP_CDP_CLEANUP=1).');
        return;
    }
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
    const preVerified = prePid > 0 ? isVerifiedDaemonProcess(prePid, { allowRelativeFromRoot: true }) : false;
    removeAutoStart();
    await stopDaemonAndCleanRuntimeFiles(prePid, preVerified);
    await clearOpenPages();
    console.log(`[uninstall] Done. Antigravity theme removed${PURGE ? ' (purged config & dist)' : ''}.`);
}

main();
