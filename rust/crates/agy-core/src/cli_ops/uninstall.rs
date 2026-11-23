use crate::cli_ops::cdp_client::{
    evaluate_cdp_page, fetch_json_loopback, is_candidate_antigravity_url, resolve_port_file,
};
use crate::cli_ops::proc_scan::{
    find_orphan_daemon_pids, is_pid_alive, is_verified_target_daemon_process, terminate_pid,
};
use crate::persona_sync::{home_dir, resolve_abs_path};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

fn read_recorded_pid(pid_file: &Path) -> u32 {
    let Ok(raw) = fs::read_to_string(pid_file) else {
        return 0;
    };
    raw.strip_prefix('\u{feff}')
        .unwrap_or(&raw)
        .trim()
        .parse::<u32>()
        .unwrap_or(0)
}

fn safe_unlink(target: &Path, label: &str) {
    if target.exists() && fs::remove_file(target).is_ok() {
        println!("[uninstall] Removed {label}: {}", target.display());
    }
}

fn safe_remove_dir_no_symlink(dir_path: &Path, label: &str) {
    if let Ok(lst) = fs::symlink_metadata(dir_path) {
        if lst.file_type().is_dir()
            && !lst.file_type().is_symlink()
            && fs::remove_dir_all(dir_path).is_ok()
            && !label.is_empty()
        {
            println!("[uninstall] Purged {label}: {}", dir_path.display());
        }
    }
}

async fn wait_for_pid_exit(pid: u32, max_wait_ms: u64, poll_ms: u64) {
    if pid == 0 {
        return;
    }
    let mut waited = 0u64;
    while waited < max_wait_ms && is_pid_alive(pid) {
        tokio::time::sleep(Duration::from_millis(poll_ms)).await;
        waited += poll_ms;
    }
}

fn remove_auto_start(root_dir: &Path) {
    let vbs_file = root_dir.join("silent-start.vbs");
    #[cfg(windows)]
    {
        let home = home_dir();
        let app_data = std::env::var("APPDATA")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"));
        let lnk = app_data
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup")
            .join("AntigravityCustomTheme.lnk");
        safe_unlink(&lnk, "Windows Startup shortcut");
        safe_unlink(&vbs_file, "VBScript launcher");
    }
    #[cfg(target_os = "macos")]
    {
        let label = "io.antigravity.custom-theme";
        let plist = home_dir()
            .join("Library")
            .join("LaunchAgents")
            .join(format!("{label}.plist"));
        let _ = Command::new("launchctl")
            .args(["unload", &plist.to_string_lossy()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        safe_unlink(&plist, "LaunchAgent plist");
        let _ = vbs_file;
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let xdg = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".config"));
        let unit_name = "antigravity-custom-theme.service";
        let unit_path = xdg.join("systemd").join("user").join(unit_name);
        let _ = Command::new("systemctl")
            .args(["--user", "disable", "--now", unit_name])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if unit_path.exists() {
            safe_unlink(&unit_path, "systemd user unit");
            let _ = Command::new("systemctl")
                .args(["--user", "daemon-reload"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        let _ = vbs_file;
    }
}

const UNPATCH_SHORTCUTS_PS: &str = r#"
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
  $Dirs = @($OverrideDirsRaw -split "`r?`n" | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
} else {
  $Dirs = @(
    [Environment]::GetFolderPath('DesktopDirectory'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Startup'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
}
foreach ($d in $Dirs) {
  Get-ChildItem -LiteralPath $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $lnkPath = $_.FullName
      $info = [AgyWinShortcut.ShortcutCom]::ReadTargetAndArgs($lnkPath)
      $targetPath = $info[0]
      $rawArgs = $info[1]
      if ($targetPath -and ($targetPath -imatch '\\Antigravity\.exe$')) {
        if ($rawArgs -and ($rawArgs -match '--remote-debugging-port')) {
          $newArgs = (($rawArgs -replace '\s*--remote-debugging-port(?:=\S+)?', '') -replace '\s{2,}', ' ').Trim()
          if ($newArgs -ne $rawArgs) {
            [AgyWinShortcut.ShortcutCom]::SaveArguments($lnkPath, $newArgs)
            Write-Output $lnkPath
          }
        }
      }
    } catch {}
  }
}
"#;

fn unpatch_windows_shortcuts() {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = Command::new("powershell.exe");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            UNPATCH_SHORTCUTS_PS,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stderr(Stdio::null());

        if let Ok(raw_env_dirs) = std::env::var("AGY_UNINSTALL_SHORTCUT_DIRS") {
            let dirs: Vec<&str> = raw_env_dirs
                .split(';')
                .map(|d| d.trim())
                .filter(|d| !d.is_empty())
                .collect();
            if dirs.is_empty() {
                return;
            }
            cmd.env("AGY_SHORTCUT_OVERRIDE_DIRS", dirs.join("\n"));
        } else {
            cmd.env_remove("AGY_SHORTCUT_OVERRIDE_DIRS");
        }

        if let Ok(out) = cmd.output() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let t = line.trim();
                if !t.is_empty() {
                    println!("[uninstall] Removed CDP flag from Windows shortcut: {t}");
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = UNPATCH_SHORTCUTS_PS;
    }
}

async fn clear_open_pages(purge: bool) {
    if std::env::var("AGY_SKIP_CDP_CLEANUP").ok().as_deref() == Some("1") {
        println!("[uninstall] CDP cleanup skipped (AGY_SKIP_CDP_CLEANUP=1).");
        return;
    }
    let port_file = resolve_port_file();
    if !port_file.exists() {
        println!("[uninstall] Antigravity is not running (no DevToolsActivePort).");
        return;
    }
    let raw_port = fs::read_to_string(&port_file).unwrap_or_default();
    let first_line = raw_port
        .strip_prefix('\u{feff}')
        .unwrap_or(&raw_port)
        .trim()
        .lines()
        .next()
        .unwrap_or("");
    let Ok(port) = first_line.trim().parse::<u16>() else {
        return;
    };
    if port == 0 {
        return;
    }

    let targets = match fetch_json_loopback(port, "/json", 2000).await {
        Ok(t) => t,
        Err(err) => {
            println!("[uninstall] CDP cleanup skipped ({err}).");
            return;
        }
    };

    let expr = format!(
        r#"(() => {{
            const purgeStorage = {};
            const isAgy = Boolean(
                document.getElementById('antigravity-custom-theme-active') ||
                document.querySelector('.agy-shell, .monaco-workbench, [data-launchpad], #workbench\\.parts\\.editor')
            );
            if (!isAgy) return false;
            let cleaned = false;
            if (typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === 'function') {{
                window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__();
                cleaned = true;
            }}
            if (purgeStorage) {{
                try {{
                    const keys = [];
                    for (let i = 0; i < localStorage.length; i++) {{
                        const k = localStorage.key(i);
                        if (k && k.startsWith('agy_')) keys.push(k);
                    }}
                    for (const k of keys) {{
                        localStorage.removeItem(k);
                    }}
                    if (keys.length > 0) cleaned = true;
                }} catch (_) {{}}
            }}
            return cleaned;
        }})()"#,
        if purge { "true" } else { "false" }
    );

    if let Some(arr) = targets.as_array() {
        for t in arr {
            let Some(obj) = t.as_object() else {
                continue;
            };
            let is_page = obj.get("type").and_then(|v| v.as_str()) == Some("page");
            let ws_url = obj
                .get("webSocketDebuggerUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let url = obj.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
            if !is_page || ws_url.is_empty() || !is_candidate_antigravity_url(url) {
                continue;
            }
            if let Ok(Value::Bool(true)) = evaluate_cdp_page(ws_url, &expr, false, 2500).await {
                println!("[uninstall] Cleared theme from verified Antigravity page {id}.");
            }
        }
    }
}

pub async fn run_uninstall_async(argv: &[String], root_dir: &Path) -> i32 {
    let root_dir = resolve_abs_path(root_dir);
    let purge = argv.iter().any(|a| a == "--purge");

    let pid_file = root_dir.join("daemon.pid");
    let log_file = root_dir.join("daemon.log");
    let lock_file = root_dir.join("daemon.lock");
    let vbs_file = root_dir.join("silent-start.vbs");
    let dist_dir = root_dir.join("dist");

    let env_cfg = std::env::var("AGY_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty());
    let config_file = env_cfg
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| root_dir.join("theme_config.json"));
    let env_bak = std::env::var("AGY_BACKUP_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty());
    let backup_config_file = env_bak.as_ref().map(PathBuf::from).unwrap_or_else(|| {
        home_dir()
            .join(".gemini")
            .join("antigravity")
            .join("custom_theme_backup.json")
    });

    let pre_pid = read_recorded_pid(&pid_file);
    let pre_verified = if pre_pid > 0 {
        is_verified_target_daemon_process(pre_pid, &root_dir, true)
    } else {
        false
    };

    remove_auto_start(&root_dir);

    let current_pid = read_recorded_pid(&pid_file);
    let pid = if current_pid > 0 {
        current_pid
    } else {
        pre_pid
    };
    let mut wait_pids = Vec::new();
    let mut handled_pids = HashSet::new();

    if pid > 0 {
        handled_pids.insert(pid);
        if is_verified_target_daemon_process(pid, &root_dir, true) {
            wait_pids.push(pid);
            if terminate_pid(pid) {
                println!("[uninstall] Sent SIGTERM to verified daemon PID {pid}.");
            } else {
                println!("[uninstall] Daemon PID {pid} already exited.");
            }
        } else if pid == pre_pid && pre_verified {
            wait_pids.push(pid);
            println!("[uninstall] Verified daemon PID {pid} stopped via service manager.");
        } else {
            println!("[uninstall] Skipped PID {pid} (not an active theme_daemon.js process).");
        }
    } else {
        println!("[uninstall] No active daemon.pid found.");
    }

    let orphan_pids = find_orphan_daemon_pids(&root_dir, &handled_pids);
    for orphan_pid in orphan_pids {
        wait_pids.push(orphan_pid);
        if terminate_pid(orphan_pid) {
            println!("[uninstall] Sent SIGTERM to orphan daemon PID {orphan_pid}.");
        } else {
            println!("[uninstall] Orphan daemon PID {orphan_pid} already exited.");
        }
    }

    for p in wait_pids {
        wait_for_pid_exit(p, 800, 80).await;
    }

    safe_unlink(&pid_file, "daemon PID file");
    safe_unlink(&log_file, "daemon log file");
    safe_unlink(&lock_file, "daemon lock file");
    safe_unlink(&vbs_file, "VBScript launcher");

    let backup_dir = backup_config_file
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let global_pid_path = backup_dir.join("theme_daemon.pid");
    let has_pid_env = std::env::var("AGY_PID_FILE")
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    if !has_pid_env {
        if let Ok(lst) = fs::symlink_metadata(&global_pid_path) {
            if !lst.file_type().is_symlink() {
                if let Ok(raw_g) = fs::read_to_string(&global_pid_path) {
                    let trimmed = raw_g.strip_prefix('\u{feff}').unwrap_or(&raw_g).trim();
                    let (g_pid, same_root) = if trimmed.starts_with('{') {
                        let parsed = serde_json::from_str::<Value>(trimmed).ok();
                        let gp = parsed
                            .as_ref()
                            .and_then(|o| o.get("pid"))
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        let sr = parsed
                            .as_ref()
                            .and_then(|o| o.get("rootDir"))
                            .and_then(|v| v.as_str())
                            .map(|s| resolve_abs_path(Path::new(s)) == root_dir)
                            .unwrap_or(false);
                        (gp, sr)
                    } else {
                        (trimmed.parse::<u32>().unwrap_or(0), false)
                    };
                    if g_pid == 0 || g_pid == pre_pid || same_root || !is_pid_alive(g_pid) {
                        safe_unlink(&global_pid_path, "global daemon PID file");
                    }
                }
            }
        }
    }

    if purge {
        safe_unlink(&config_file, "theme config");
        safe_unlink(&backup_config_file, "backup theme config");
        if let Some(cfg_dir) = config_file.parent() {
            safe_unlink(
                &cfg_dir.join("persona_runtime_hint.json"),
                "local persona hint",
            );
        }
        safe_unlink(
            &backup_dir.join("persona_runtime_hint.json"),
            "canonical persona hint",
        );
        safe_unlink(&global_pid_path, "global daemon PID file");
        if env_cfg.is_none() && env_bak.is_none() {
            let eff_home = home_dir();
            safe_unlink(
                &eff_home
                    .join(".gemini")
                    .join("config")
                    .join("plugins")
                    .join("antigravity-shinobu-theme")
                    .join("persona_runtime_hint.json"),
                "plugin persona hint",
            );
            safe_unlink(
                &eff_home
                    .join(".gemini")
                    .join("config")
                    .join("skills")
                    .join("antigravity-custom-theme")
                    .join("persona_runtime_hint.json"),
                "skill persona hint",
            );
        }
        safe_remove_dir_no_symlink(&backup_dir.join("persona_state"), "persona state directory");
        safe_remove_dir_no_symlink(
            &backup_dir
                .join("plugin_data")
                .join("antigravity-shinobu-theme")
                .join("persona_state"),
            "plugin persona state directory",
        );
        safe_remove_dir_no_symlink(
            &backup_dir
                .join("plugin_data")
                .join("antigravity-clean-theme")
                .join("persona_state"),
            "clean plugin persona state directory",
        );
        if let Ok(pd) = std::env::var("PLUGIN_DATA") {
            if !pd.trim().is_empty() {
                safe_remove_dir_no_symlink(
                    &resolve_abs_path(Path::new(&pd)).join("persona_state"),
                    "active PLUGIN_DATA persona state directory",
                );
            }
        }
        safe_remove_dir_no_symlink(&dist_dir, "build directory");
        unpatch_windows_shortcuts();
    }

    clear_open_pages(purge).await;
    println!(
        "[uninstall] Done. Antigravity theme removed{}.",
        if purge { " (purged config & dist)" } else { "" }
    );
    0
}
