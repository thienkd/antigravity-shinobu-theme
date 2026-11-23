use crate::build_payload::{compile_payload, BuildPayloadOptions};
use crate::cli_ops::proc_scan::is_pid_alive;
use crate::persona_sync::{
    home_dir, normalize_workspace_key, parse_hook_input_safe, prune_stale_persona_states,
    read_stdin_json_fast, resolve_abs_path, sanitize_compact_profile_entry,
    select_freshest_config_object, sync_persona_runtime_hint, write_file_atomic_sync,
    SyncHintOptions,
};
use crate::security::sort_keys_deep;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub fn check_pid_file_alive(pid_path: &Path) -> bool {
    let Ok(raw_str) = fs::read_to_string(pid_path) else {
        return false;
    };
    let raw = raw_str.strip_prefix('\u{feff}').unwrap_or(&raw_str).trim();
    if raw.is_empty() {
        return false;
    }
    let pid_opt = if raw.starts_with('{') {
        serde_json::from_str::<Value>(raw)
            .ok()
            .and_then(|v| v.get("pid").and_then(|p| p.as_u64()))
            .map(|n| n as u32)
    } else {
        raw.parse::<u32>().ok()
    };
    match pid_opt {
        Some(pid) if pid > 0 => is_pid_alive(pid),
        _ => false,
    }
}

pub fn resolve_runtime_root(code_root: &Path) -> PathBuf {
    let has_cfg_env = std::env::var("AGY_CONFIG_PATH")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let has_pid_env = std::env::var("AGY_PID_FILE")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    if has_cfg_env || has_pid_env {
        return code_root.to_path_buf();
    }

    let home = home_dir();
    let global_pid = home
        .join(".gemini")
        .join("antigravity")
        .join("theme_daemon.pid");
    if let Ok(raw) = fs::read_to_string(&global_pid) {
        if let Ok(info) =
            serde_json::from_str::<Value>(raw.strip_prefix('\u{feff}').unwrap_or(&raw))
        {
            if let Some(pid) = info.get("pid").and_then(|p| p.as_u64()).map(|n| n as u32) {
                if pid > 0 && is_pid_alive(pid) {
                    if let Some(rd) = info.get("rootDir").and_then(|r| r.as_str()) {
                        let rd_path = Path::new(rd);
                        if rd_path.exists() {
                            return resolve_abs_path(rd_path);
                        }
                    }
                }
            }
        }
    }

    if check_pid_file_alive(&code_root.join("daemon.pid")) {
        return code_root.to_path_buf();
    }
    for rel_sub in [
        ["plugins", "antigravity-shinobu-theme"],
        ["plugins", "antigravity-custom-theme"],
        ["skills", "antigravity-custom-theme"],
    ] {
        let cand_root = home
            .join(".gemini")
            .join("config")
            .join(rel_sub[0])
            .join(rel_sub[1]);
        if check_pid_file_alive(&cand_root.join("daemon.pid")) {
            return cand_root;
        }
    }
    code_root.to_path_buf()
}

pub fn ensure_daemon_awake(code_root: &Path, root_dir: &Path, pid_file: &Path) -> bool {
    if std::env::var("AGY_SKIP_DAEMON_SPAWN").ok().as_deref() == Some("1") {
        return false;
    }
    if check_pid_file_alive(pid_file) {
        return false;
    }
    let has_pid_env = std::env::var("AGY_PID_FILE")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let home = home_dir();
    let global_pid = home
        .join(".gemini")
        .join("antigravity")
        .join("theme_daemon.pid");
    if !has_pid_env {
        if check_pid_file_alive(&global_pid) {
            return false;
        }
        for rel_sub in [
            ["plugins", "antigravity-shinobu-theme"],
            ["plugins", "antigravity-custom-theme"],
            ["skills", "antigravity-custom-theme"],
        ] {
            let extra_pid = home
                .join(".gemini")
                .join("config")
                .join(rel_sub[0])
                .join(rel_sub[1])
                .join("daemon.pid");
            if check_pid_file_alive(&extra_pid) {
                return false;
            }
        }
    }

    let payload_path = code_root.join("dist").join("theme_payload.js");
    if !payload_path.exists() {
        let opts = BuildPayloadOptions {
            themes_path: code_root.join("themes").join("themes.json"),
            engine_path: code_root.join("engine").join("core.js"),
            out_path: payload_path,
            inline_all: false,
            help: false,
        };
        let _ = compile_payload(&opts);
    }

    if let Ok(cur_exe) = std::env::current_exe() {
        let mut cmd = Command::new(cur_exe);
        cmd.arg("daemon")
            .current_dir(root_dir)
            .env("PLUGIN_ROOT", code_root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            const DETACHED_PROCESS: u32 = 0x0000_0008;
            cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
        }
        if let Ok(child) = cmd.spawn() {
            let spawned_pid = child.id();
            for _ in 0..8 {
                if check_pid_file_alive(pid_file)
                    || (!has_pid_env && check_pid_file_alive(&global_pid))
                {
                    break;
                }
                if !is_pid_alive(spawned_pid) {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            return true;
        }
    }
    false
}

fn has_subagent_message_files(msg_base: &Path) -> bool {
    for sub in [msg_base.to_path_buf(), msg_base.join("undelivered")] {
        let Ok(meta) = fs::symlink_metadata(&sub) else {
            continue;
        };
        if !meta.file_type().is_dir() || meta.file_type().is_symlink() {
            continue;
        }
        if let Ok(rd) = fs::read_dir(&sub) {
            for entry in rd.flatten().take(16) {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.ends_with(".json") && name_str != "read.json" {
                    return true;
                }
            }
        }
    }
    false
}

fn is_subagent_session_start(parsed: Option<&Map<String, Value>>) -> bool {
    let Some(obj) = parsed else {
        return false;
    };
    if obj.get("isSubagent").and_then(|v| v.as_bool()) == Some(true) {
        return true;
    }
    if obj
        .get("parentConversationId")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return true;
    }
    if let Some(tp) = obj
        .get("transcriptPath")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
    {
        let logs_dir = resolve_abs_path(Path::new(tp));
        if let Some(parent_logs) = logs_dir.parent() {
            if parent_logs.file_name().and_then(|n| n.to_str()) == Some("logs") {
                if let Some(sys_gen) = parent_logs.parent() {
                    if has_subagent_message_files(&sys_gen.join("messages")) {
                        return true;
                    }
                }
            }
        }
    }
    if let Some(cid) = obj
        .get("conversationId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 96
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
    {
        let msg_dir = home_dir()
            .join(".gemini")
            .join("antigravity")
            .join("brain")
            .join(cid)
            .join(".system_generated")
            .join("messages");
        if has_subagent_message_files(&msg_dir) {
            return true;
        }
    }
    false
}

pub fn run_session_start_with_input(raw_in: &str, default_code_root: &Path) -> String {
    let code_root = std::env::var("PLUGIN_ROOT")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| resolve_abs_path(Path::new(&s)))
        .unwrap_or_else(|| resolve_abs_path(default_code_root));

    let root_dir = resolve_runtime_root(&code_root);
    let pid_file = std::env::var("AGY_PID_FILE")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| root_dir.join("daemon.pid"));
    let env_cfg = std::env::var("AGY_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty());
    let config_file = env_cfg
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| root_dir.join("theme_config.json"));
    let backup_config_file = std::env::var("AGY_BACKUP_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            home_dir()
                .join(".gemini")
                .join("antigravity")
                .join("custom_theme_backup.json")
        });

    let parsed = parse_hook_input_safe(raw_in);
    if is_subagent_session_start(parsed.as_ref()) {
        let _ = ensure_daemon_awake(&code_root, &root_dir, &pid_file);
        return "{}\n".to_string();
    }

    let candidates = if env_cfg.is_some() {
        vec![config_file.clone(), backup_config_file.clone()]
    } else {
        let home = home_dir();
        vec![
            config_file.clone(),
            backup_config_file.clone(),
            home.join(".gemini")
                .join("config")
                .join("skills")
                .join("antigravity-custom-theme")
                .join("theme_config.json"),
            home.join(".gemini")
                .join("config")
                .join("plugins")
                .join("antigravity-shinobu-theme")
                .join("theme_config.json"),
        ]
    };

    let mut cfg: Map<String, Value> = select_freshest_config_object(&candidates);
    let mut mutated = false;

    if cfg.get("privacyShieldActive") == Some(&Value::Bool(true)) {
        cfg.insert("privacyShieldActive".to_string(), Value::Bool(false));
        mutated = true;
    }

    let raw_ws = parsed
        .as_ref()
        .and_then(|obj| {
            obj.get("workspacePaths")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .or_else(|| obj.get("cwd").and_then(|v| v.as_str()))
        })
        .unwrap_or("");
    let ws_key = normalize_workspace_key(raw_ws);

    if !ws_key.is_empty() && cfg.get("activeWorkspace").and_then(|v| v.as_str()) != Some(&ws_key) {
        cfg.insert("activeWorkspace".to_string(), Value::String(ws_key.clone()));
        mutated = true;
    }

    let mut matched_profile = false;
    if !ws_key.is_empty() {
        if let Some(prof_val) = cfg
            .get("workspaceProfiles")
            .and_then(|v| v.as_object())
            .and_then(|m| m.get(&ws_key))
            .cloned()
        {
            if let Some(clean_prof) = sanitize_compact_profile_entry(&prof_val) {
                matched_profile = true;
                let allowed_fields = [
                    "themeName",
                    "bubbleName",
                    "masterPersona",
                    "aiPersonaMode",
                    "dimming",
                    "fxDensity",
                    "chibiEnabled",
                    "autoFinisher",
                    "focusMode",
                ];
                for field in allowed_fields {
                    if let Some(val) = clean_prof.get(field) {
                        if cfg.get(field) != Some(val) {
                            cfg.insert(field.to_string(), val.clone());
                            mutated = true;
                        }
                    }
                }
            }
        }
    }

    if mutated {
        let sorted = sort_keys_deep(&Value::Object(cfg.clone()), 0);
        if let Ok(serialized) = serde_json::to_string_pretty(&sorted) {
            write_file_atomic_sync(&config_file, &serialized, 0o600);
            write_file_atomic_sync(&backup_config_file, &serialized, 0o600);
        }
    }

    if !cfg.is_empty() {
        let _ = sync_persona_runtime_hint(
            &cfg,
            SyncHintOptions {
                root_dir: Some(&root_dir),
                config_path: if env_cfg.is_some() {
                    Some(&config_file)
                } else {
                    None
                },
                bound_workspace_key: if matched_profile { Some(&ws_key) } else { None },
                direct_switch_workspace_key: None,
            },
        );
    }

    if env_cfg.is_none() {
        if let Ok(pd) = std::env::var("PLUGIN_DATA") {
            if !pd.trim().is_empty() {
                let p = resolve_abs_path(Path::new(&pd)).join("persona_state");
                prune_stale_persona_states(&p, 14 * 86_400 * 1000, 250);
            }
        }
        let default_state = home_dir()
            .join(".gemini")
            .join("antigravity")
            .join("persona_state");
        prune_stale_persona_states(&default_state, 14 * 86_400 * 1000, 250);
    }

    ensure_daemon_awake(&code_root, &root_dir, &pid_file);
    "{}\n".to_string()
}

pub fn run_session_start_cli(default_code_root: &Path) -> i32 {
    let raw_in = read_stdin_json_fast(800);
    let out = run_session_start_with_input(&raw_in, default_code_root);
    print!("{out}");
    0
}
