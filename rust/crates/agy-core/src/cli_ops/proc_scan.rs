use crate::persona_sync::resolve_abs_path;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::OnceLock;

#[cfg(windows)]
mod win_ffi {
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> isize;
        fn GetExitCodeProcess(process: isize, exit_code: *mut u32) -> i32;
        fn TerminateProcess(process: isize, exit_code: u32) -> i32;
        fn CloseHandle(object: isize) -> i32;
    }

    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const PROCESS_TERMINATE: u32 = 0x0001;
    const STILL_ACTIVE: u32 = 259;

    pub fn is_pid_alive(pid: u32) -> bool {
        if pid == 0 {
            return false;
        }
        // SAFETY: Standard Win32 handle lifecycle on scalar `pid` and stack `exit_code`, closed before return.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle == 0 {
                return false;
            }
            let mut exit_code: u32 = 0;
            let ok = GetExitCodeProcess(handle, &mut exit_code);
            CloseHandle(handle);
            ok != 0 && exit_code == STILL_ACTIVE
        }
    }

    pub fn terminate_pid(pid: u32) -> bool {
        if pid == 0 {
            return false;
        }
        // SAFETY: Opens handle strictly with PROCESS_TERMINATE for verified daemon `pid` and closes handle immediately.
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if handle == 0 {
                return false;
            }
            let ok = TerminateProcess(handle, 0);
            CloseHandle(handle);
            ok != 0
        }
    }
}

pub fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(windows)]
    {
        win_ffi::is_pid_alive(pid)
    }
    #[cfg(not(windows))]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

pub fn terminate_pid(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(windows)]
    {
        win_ffi::terminate_pid(pid)
    }
    #[cfg(not(windows))]
    {
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

fn node_proc_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\bnode(?:js|\d+)?(?:\.exe)?\b").expect("valid regex"))
}

fn rust_daemon_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\bagy-theme(?:\.exe)?\b.*\bdaemon\b").expect("valid regex"))
}

pub fn is_any_daemon_cmdline(text: &str) -> bool {
    (node_proc_re().is_match(text) && text.to_ascii_lowercase().contains("theme_daemon.js"))
        || rust_daemon_re().is_match(text)
}

pub fn query_process_cmdline(pid: u32) -> Option<(String, String)> {
    if pid == 0 || !is_pid_alive(pid) {
        return None;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let ps_cmd = format!(
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; $p = Get-CimInstance Win32_Process -Filter \"ProcessId = {pid}\" -ErrorAction Stop; if ($p) {{ \"$($p.Name)|$($p.CommandLine)\" }}"
        );
        if let Ok(out) = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                if let Some(sep) = s.find('|') {
                    return Some((s[..sep].to_string(), s[sep + 1..].to_string()));
                }
                return Some((String::new(), s));
            }
        }
        None
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(raw) = fs::read_to_string(format!("/proc/{pid}/cmdline")) {
            let cmd = raw.replace('\0', " ").trim().to_string();
            if !cmd.is_empty() {
                return Some((String::new(), cmd));
            }
        }
        None
    }
    #[cfg(all(not(windows), not(target_os = "linux")))]
    {
        if let Ok(out) = Command::new("ps")
            .args(["-ww", "-p", &pid.to_string(), "-o", "command="])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some((String::new(), s));
            }
        }
        None
    }
}

pub fn is_verified_any_daemon_process(pid: u32) -> bool {
    let Some((name, cmd)) = query_process_cmdline(pid) else {
        return false;
    };
    let combined = format!("{name}|{cmd}");
    is_any_daemon_cmdline(&combined)
}

pub fn split_command_line_args(cmd_line: &str, is_windows: bool) -> Vec<String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;

    for ch in cmd_line.chars() {
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            } else {
                cur.push(ch);
            }
        } else if ch == '"' || (!is_windows && ch == '\'') {
            quote = Some(ch);
        } else if ch.is_whitespace() {
            if !cur.is_empty() {
                args.push(std::mem::take(&mut cur));
            }
        } else {
            cur.push(ch);
        }
    }
    if !cur.is_empty() {
        args.push(cur);
    }
    args
}

pub fn is_uninstall_script_token(raw_tok: &str) -> bool {
    let tok = raw_tok.trim().replace('\\', "/");
    let lower = tok.to_ascii_lowercase();
    lower == "uninstall.js" || lower.ends_with("/uninstall.js")
}

const NODE_VALUE_FLAGS: &[&str] = &[
    "-r",
    "--require",
    "--import",
    "-C",
    "--conditions",
    "--input-type",
    "--loader",
    "--experimental-loader",
    "-e",
    "--eval",
    "-p",
    "--print",
    "--env-file",
    "--env-file-if-exists",
    "--watch-path",
    "--diagnostic-dir",
    "--redirect-warnings",
    "--title",
    "--max-http-header-size",
    "--heapsnapshot-near-heap-limit",
    "--tls-cipher-list",
    "--openssl-config",
    "--icu-data-dir",
    "--dns-result-order",
    "--unhandled-rejections",
    "--inspect-publish-uid",
];

pub fn extract_entry_script_token(args: &[String]) -> String {
    if args.is_empty() {
        return String::new();
    }
    let idx = if node_proc_re().is_match(&args[0]) {
        1
    } else {
        0
    };
    let mut i = idx;
    while i < args.len() {
        let tok = args[i].as_str();
        if tok.is_empty() {
            i += 1;
            continue;
        }
        if tok == "--" {
            return args.get(i + 1).cloned().unwrap_or_default();
        }
        if tok.starts_with('-') {
            if !tok.contains('=') && NODE_VALUE_FLAGS.contains(&tok) {
                i += 1;
            }
            i += 1;
            continue;
        }
        return tok.to_string();
    }
    String::new()
}

fn normalize_path_for_compare(p: &Path) -> String {
    let abs = resolve_abs_path(p);
    let s = abs.to_string_lossy().to_string();
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

fn resolve_canonical_for_compare(p: &Path) -> String {
    let abs = resolve_abs_path(p);
    let real = fs::canonicalize(&abs).unwrap_or(abs);
    let s = real.to_string_lossy().to_string();
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s).to_string();
    if cfg!(windows) {
        stripped.to_lowercase()
    } else {
        stripped
    }
}

pub fn is_target_daemon_args(
    args: &[String],
    proc_hint: &str,
    root_dir: &Path,
    allow_relative_from_root: bool,
) -> bool {
    if args.is_empty() || args.iter().any(|t| is_uninstall_script_token(t)) {
        return false;
    }
    let joined = format!("{proc_hint} {}", args.join(" "));
    if rust_daemon_re().is_match(&joined) {
        let rust_bin =
            root_dir
                .join("rust")
                .join("target")
                .join("release")
                .join(if cfg!(windows) {
                    "agy-theme.exe"
                } else {
                    "agy-theme"
                });
        let first = Path::new(&args[0]);
        if first.is_absolute()
            && normalize_path_for_compare(first) == normalize_path_for_compare(&rust_bin)
        {
            return true;
        }
        if allow_relative_from_root {
            return true;
        }
    }
    if !node_proc_re().is_match(&joined) {
        return false;
    }

    let entry_raw = extract_entry_script_token(args);
    if entry_raw.is_empty() {
        return false;
    }
    let normalized_tok = entry_raw.replace('\\', "/");
    let matches_suffix = if cfg!(windows) {
        let l = normalized_tok.to_ascii_lowercase();
        l == "theme_daemon.js" || l.ends_with("/theme_daemon.js")
    } else {
        normalized_tok == "theme_daemon.js" || normalized_tok.ends_with("/theme_daemon.js")
    };
    if !matches_suffix {
        return false;
    }

    let tok_path = Path::new(&entry_raw);
    let candidate = if tok_path.is_absolute() {
        tok_path.to_path_buf()
    } else if allow_relative_from_root && (entry_raw.contains('/') || entry_raw.contains('\\')) {
        resolve_abs_path(&root_dir.join(tok_path))
    } else {
        return false;
    };

    let expected_daemon = root_dir.join("daemon").join("theme_daemon.js");
    normalize_path_for_compare(&candidate) == normalize_path_for_compare(&expected_daemon)
        || resolve_canonical_for_compare(&candidate)
            == resolve_canonical_for_compare(&expected_daemon)
}

pub fn is_target_daemon_command(
    cmd_line: &str,
    proc_hint: &str,
    root_dir: &Path,
    allow_relative_from_root: bool,
) -> bool {
    if cmd_line.is_empty() {
        return false;
    }
    let tokens = split_command_line_args(cmd_line, cfg!(windows));
    if tokens.iter().any(|t| is_uninstall_script_token(t)) {
        return false;
    }
    if is_target_daemon_args(&tokens, proc_hint, root_dir, allow_relative_from_root) {
        return true;
    }
    let entry_raw = extract_entry_script_token(&tokens);
    let entry_lower = entry_raw.to_ascii_lowercase();
    if !entry_lower.is_empty()
        && (entry_lower.ends_with(".js")
            || entry_lower.ends_with(".cjs")
            || entry_lower.ends_with(".mjs"))
        && !entry_lower.ends_with("theme_daemon.js")
    {
        return false;
    }

    let expected = resolve_abs_path(&root_dir.join("daemon").join("theme_daemon.js"));
    let exp_str = expected.to_string_lossy();
    if cfg!(windows) {
        cmd_line.to_lowercase().contains(&exp_str.to_lowercase())
    } else {
        cmd_line.contains(exp_str.as_ref())
    }
}

pub fn is_verified_target_daemon_process(
    pid: u32,
    root_dir: &Path,
    allow_relative_from_root: bool,
) -> bool {
    let Some((name, cmd)) = query_process_cmdline(pid) else {
        return false;
    };
    is_target_daemon_command(&cmd, &name, root_dir, allow_relative_from_root)
}

pub fn scan_all_live_daemon_pids() -> Vec<u32> {
    let mut pids = Vec::new();
    let self_pid = std::process::id();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let ps_cmd = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.Name -like 'node*' -and $_.CommandLine -match 'theme_daemon\\.js') -or ($_.Name -like 'agy-theme*' -and $_.CommandLine -match '\\bdaemon\\b') } | ForEach-Object { \"$($_.ProcessId)|$($_.Name)|$($_.CommandLine)\" }";
        if let Ok(out) = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let mut parts = line.splitn(3, '|');
                if let Some(pid_s) = parts.next() {
                    if let Ok(pid) = pid_s.trim().parse::<u32>() {
                        if pid > 0 && pid != self_pid && is_pid_alive(pid) {
                            pids.push(pid);
                        }
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(out) = Command::new("ps")
            .args(["-ax", "-ww", "-o", "pid=,command="])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let trimmed = line.trim();
                if !is_any_daemon_cmdline(trimmed) {
                    continue;
                }
                if let Some(pid_s) = trimmed.split_whitespace().next() {
                    if let Ok(pid) = pid_s.parse::<u32>() {
                        if pid > 0 && pid != self_pid && is_pid_alive(pid) {
                            pids.push(pid);
                        }
                    }
                }
            }
        }
    }
    pids
}

pub fn find_orphan_daemon_pids(root_dir: &Path, exclude: &HashSet<u32>) -> Vec<u32> {
    let mut found = Vec::new();
    for pid in scan_all_live_daemon_pids() {
        if exclude.contains(&pid) || found.contains(&pid) {
            continue;
        }
        if is_verified_target_daemon_process(pid, root_dir, false) {
            found.push(pid);
        }
    }
    found
}
