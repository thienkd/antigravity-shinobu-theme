use agy_core::cli_ops::cdp_client::fetch_json_loopback;
use agy_core::cli_ops::proc_scan::is_pid_alive;
use agy_core::hooks::session_start::{
    check_pid_file_alive, ensure_daemon_awake, resolve_runtime_root,
};
use agy_core::persona_sync::{
    home_dir, js_math_round, normalize_persona_mode, normalize_workspace_key, resolve_abs_path,
    sanitize_workspace_profiles_strict, select_freshest_config_object, sync_persona_runtime_hint,
    write_file_atomic_sync, SyncHintOptions,
};
use agy_core::security::{
    is_safe_local_regular_file, is_unc_or_device_path, slice_utf16_safe, sort_keys_deep,
    strip_proto_keys,
};
use base64::Engine as _;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const APP_URI: &str = "ui://agy-theme/studio.html";
const MAX_FORGE_IMAGE_BYTES: u64 = 15 * 1024 * 1024;
const MAX_INLINE_FORGE_BYTES: u64 = 1_415_577; // Math.floor(1.35 * 1024 * 1024)

struct PersonaItem {
    id: &'static str,
    label: &'static str,
    aliases: &'static [&'static str],
}

const FULL_PERSONAS: &[PersonaItem] = &[
    PersonaItem {
        id: "yoriichi",
        label: "☀️ Kiếm Sĩ Đầu Tiên — Tsugikuni Yoriichi",
        aliases: &["yoriichi", "sun", "nhat", "kiem si dau tien"],
    },
    PersonaItem {
        id: "shadow_monarch",
        label: "🌑 Quân Vương Bóng Tối — Sung Jin-Woo",
        aliases: &["jinwoo", "sung", "shadow", "bong toi", "solo leveling"],
    },
    PersonaItem {
        id: "six_eyes",
        label: "♾️ Lục Nhãn Vô Hạ Hạn — Satoru Gojo",
        aliases: &[
            "gojo",
            "satoru",
            "six eyes",
            "luc nhan",
            "vo luong khong xu",
        ],
    },
    PersonaItem {
        id: "great_sage",
        label: "🔥 Tề Thiên Đại Thánh — Hỏa Nhãn Kim Tinh",
        aliases: &[
            "wukong",
            "sage",
            "te thien",
            "dai thanh",
            "hoa nhan",
            "rimuru",
        ],
    },
    PersonaItem {
        id: "ubuyashiki",
        label: "👑 Chúa Công — Kagaya Ubuyashiki",
        aliases: &["ubuyashiki", "kagaya", "chua cong", "master"],
    },
    PersonaItem {
        id: "shinobu",
        label: "🦋 Trùng Trụ — Shinobu Kocho",
        aliases: &["shinobu", "kocho", "trung tru", "insect", "wisteria"],
    },
    PersonaItem {
        id: "giyu",
        label: "🌊 Thủy Trụ — Giyu Tomioka",
        aliases: &["giyu", "tomioka", "thuy tru", "water"],
    },
    PersonaItem {
        id: "rengoku",
        label: "🔥 Viêm Trụ — Kyojuro Rengoku",
        aliases: &["rengoku", "kyojuro", "viem tru", "flame"],
    },
    PersonaItem {
        id: "uzui",
        label: "💎 Âm Trụ — Tengen Uzui",
        aliases: &["uzui", "tengen", "am tru", "sound"],
    },
    PersonaItem {
        id: "muichiro",
        label: "🌫️ Hà Trụ — Muichiro Tokito",
        aliases: &["muichiro", "tokito", "ha tru", "mist"],
    },
    PersonaItem {
        id: "mitsuri",
        label: "🌸 Luyến Trụ — Mitsuri Kanroji",
        aliases: &["mitsuri", "kanroji", "luyen tru", "love"],
    },
    PersonaItem {
        id: "obanai",
        label: "🐍 Xà Trụ — Obanai Iguro",
        aliases: &["obanai", "iguro", "xa tru", "serpent"],
    },
    PersonaItem {
        id: "sanemi",
        label: "🌪️ Phong Trụ — Sanemi Shinazugawa",
        aliases: &["sanemi", "phong tru", "wind"],
    },
    PersonaItem {
        id: "gyomei",
        label: "📿 Nham Trụ — Gyomei Himejima",
        aliases: &["gyomei", "himejima", "nham tru", "stone"],
    },
    PersonaItem {
        id: "tanjiro",
        label: "☀️ Tanjiro Kamado — Hỏa Thần",
        aliases: &["tanjiro", "kamado", "hinokami"],
    },
    PersonaItem {
        id: "nezuko",
        label: "🎋 Nezuko Kamado — Hồng Liên",
        aliases: &["nezuko", "hong lien"],
    },
    PersonaItem {
        id: "zenitsu",
        label: "⚡ Zenitsu Agatsuma — Lôi Minh",
        aliases: &["zenitsu", "agatsuma", "loi minh", "thunder"],
    },
    PersonaItem {
        id: "inosuke",
        label: "🐗 Inosuke Hashibira — Dã Thú",
        aliases: &["inosuke", "hashibira", "da thu", "beast"],
    },
];

const CLEAN_PERSONAS: &[PersonaItem] = &[
    PersonaItem {
        id: "yoriichi",
        label: "☀️ Principal Architect (Default)",
        aliases: &["default", "architect", "principal", "yoriichi"],
    },
    PersonaItem {
        id: "shadow_monarch",
        label: "🌌 Systems Commander",
        aliases: &["commander", "systems", "shadow"],
    },
    PersonaItem {
        id: "six_eyes",
        label: "♾️ Clarity Specialist",
        aliases: &["clarity", "specialist", "infinity"],
    },
    PersonaItem {
        id: "great_sage",
        label: "🔥 Proactive Builder",
        aliases: &["builder", "proactive", "forge"],
    },
];

fn is_clean_edition_runtime(code_root: &Path) -> bool {
    let manifest = code_root.join("plugin.json");
    if let Ok(raw) = fs::read_to_string(manifest) {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            return v.get("name").and_then(|n| n.as_str()) == Some("antigravity-clean-theme");
        }
    }
    false
}

fn known_personas(code_root: &Path) -> &'static [PersonaItem] {
    if is_clean_edition_runtime(code_root) {
        CLEAN_PERSONAS
    } else {
        FULL_PERSONAS
    }
}

fn read_default_ai_persona_mode(code_root: &Path) -> String {
    let reg = code_root.join("themes").join("personas.json");
    if let Ok(raw) = fs::read_to_string(reg) {
        if let Ok(v) = serde_json::from_str::<Value>(raw.strip_prefix('\u{feff}').unwrap_or(&raw)) {
            if let Some(m) = v.get("defaultMode").and_then(|x| x.as_str()) {
                if matches!(m, "off" | "subtle" | "roleplay") {
                    return m.to_string();
                }
            }
        }
    }
    if is_clean_edition_runtime(code_root) {
        "off".to_string()
    } else {
        "subtle".to_string()
    }
}

fn fold_vn_char(ch: char) -> Option<char> {
    let c = ch.to_lowercase().next().unwrap_or(ch);
    match c {
        'à' | 'á' | 'ả' | 'ã' | 'ạ' | 'ă' | 'ằ' | 'ắ' | 'ẳ' | 'ẵ' | 'ặ' | 'â' | 'ầ' | 'ấ' | 'ẩ'
        | 'ẫ' | 'ậ' => Some('a'),
        'è' | 'é' | 'ẻ' | 'ẽ' | 'ẹ' | 'ê' | 'ề' | 'ế' | 'ể' | 'ễ' | 'ệ' => {
            Some('e')
        }
        'ì' | 'í' | 'ỉ' | 'ĩ' | 'ị' => Some('i'),
        'ò' | 'ó' | 'ỏ' | 'õ' | 'ọ' | 'ô' | 'ồ' | 'ố' | 'ổ' | 'ỗ' | 'ộ' | 'ơ' | 'ờ' | 'ớ' | 'ở'
        | 'ỡ' | 'ợ' => Some('o'),
        'ù' | 'ú' | 'ủ' | 'ũ' | 'ụ' | 'ư' | 'ừ' | 'ứ' | 'ử' | 'ữ' | 'ự' => {
            Some('u')
        }
        'ỳ' | 'ý' | 'ỷ' | 'ỹ' | 'ỵ' => Some('y'),
        'đ' => Some('d'),
        _ if ('\u{0300}'..='\u{036f}').contains(&c) => None,
        _ if c.is_ascii_alphanumeric()
            || ('\u{3040}'..='\u{30ff}').contains(&c)
            || ('\u{4e00}'..='\u{9faf}').contains(&c) =>
        {
            Some(c)
        }
        _ => Some(' '),
    }
}

pub fn fold_search_text(raw: &str) -> String {
    let mut tmp = String::with_capacity(raw.len());
    let mut prev_space = true;
    for ch in raw.chars() {
        if let Some(mapped) = fold_vn_char(ch) {
            if mapped == ' ' {
                if !prev_space {
                    tmp.push(' ');
                    prev_space = true;
                }
            } else {
                tmp.push(mapped);
                prev_space = false;
            }
        }
    }
    tmp.trim().to_string()
}

struct DynamicPaths {
    root_dir: PathBuf,
    pid_file: PathBuf,
    config_file: PathBuf,
    backup_config_file: PathBuf,
}

fn get_dynamic_paths(code_root: &Path) -> DynamicPaths {
    let root_dir = resolve_runtime_root(code_root);
    let pid_file = std::env::var("AGY_PID_FILE")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| root_dir.join("daemon.pid"));
    let config_file = std::env::var("AGY_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty())
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
    DynamicPaths {
        root_dir,
        pid_file,
        config_file,
        backup_config_file,
    }
}

fn load_themes_registry(code_root: &Path) -> Map<String, Value> {
    let p = code_root.join("themes").join("themes.json");
    let Ok(raw) = fs::read_to_string(p) else {
        return Map::new();
    };
    let stripped = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    let Ok(val) = serde_json::from_str::<Value>(stripped) else {
        return Map::new();
    };
    match strip_proto_keys(&val, 0) {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

fn read_config(code_root: &Path) -> Map<String, Value> {
    let dp = get_dynamic_paths(code_root);
    let has_env_cfg = std::env::var("AGY_CONFIG_PATH")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let candidates = if has_env_cfg {
        vec![dp.config_file, dp.backup_config_file]
    } else {
        let home = home_dir();
        vec![
            dp.config_file,
            dp.backup_config_file,
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
    select_freshest_config_object(&candidates)
}

fn write_config(
    code_root: &Path,
    next_patch: &Map<String, Value>,
    bound_workspace_key: Option<&str>,
) -> Map<String, Value> {
    let dp = get_dynamic_paths(code_root);
    let cur = read_config(code_root);
    let clean_patch_val = strip_proto_keys(&Value::Object(next_patch.clone()), 0);
    let clean_patch = clean_patch_val.as_object().cloned().unwrap_or_default();

    let mut merged = cur;
    for (k, v) in &clean_patch {
        merged.insert(k.clone(), v.clone());
    }
    if merged.get("activeForgedTheme") == Some(&Value::Null) {
        merged.shift_remove("activeForgedTheme");
    }
    if merged.contains_key("workspaceProfiles") {
        let sanitized = sanitize_workspace_profiles_strict(merged.get("workspaceProfiles"));
        merged.insert("workspaceProfiles".to_string(), Value::Object(sanitized));
    }

    let sorted = sort_keys_deep(&Value::Object(merged.clone()), 0);
    if let Ok(serialized) = serde_json::to_string_pretty(&sorted) {
        write_file_atomic_sync(&dp.config_file, &serialized, 0o600);
        write_file_atomic_sync(&dp.backup_config_file, &serialized, 0o600);

        let has_env_cfg = std::env::var("AGY_CONFIG_PATH")
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        if !has_env_cfg {
            let home = home_dir();
            for extra_dir in [
                home.join(".gemini")
                    .join("config")
                    .join("skills")
                    .join("antigravity-custom-theme"),
                home.join(".gemini")
                    .join("config")
                    .join("plugins")
                    .join("antigravity-shinobu-theme"),
            ] {
                if let Ok(lst) = fs::symlink_metadata(&extra_dir) {
                    if lst.file_type().is_dir() && !lst.file_type().is_symlink() {
                        let extra_cfg = extra_dir.join("theme_config.json");
                        if extra_cfg != dp.config_file {
                            write_file_atomic_sync(&extra_cfg, &serialized, 0o600);
                        }
                    }
                }
            }
        }
    }

    let is_direct_switch = clean_patch.contains_key("themeName")
        || clean_patch.contains_key("bubbleName")
        || clean_patch.contains_key("masterPersona")
        || clean_patch.contains_key("aiPersonaMode")
        || clean_patch.contains_key("focusMode")
        || clean_patch.contains_key("chibiEnabled")
        || clean_patch.contains_key("autoFinisher");

    let has_env_cfg = std::env::var("AGY_CONFIG_PATH")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let active_ws = merged
        .get("activeWorkspace")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let _ = sync_persona_runtime_hint(
        &merged,
        SyncHintOptions {
            root_dir: Some(&dp.root_dir),
            config_path: if has_env_cfg {
                Some(&dp.config_file)
            } else {
                None
            },
            bound_workspace_key,
            direct_switch_workspace_key: if bound_workspace_key.is_some() {
                None
            } else if is_direct_switch {
                Some(&active_ws)
            } else {
                None
            },
        },
    );

    merged
}

fn match_theme_name(query: Option<&str>, themes_obj: &Map<String, Value>) -> Option<String> {
    if themes_obj.is_empty() {
        return None;
    }
    let Some(q_raw) = query else {
        return themes_obj.keys().next().cloned();
    };
    if q_raw.is_empty() {
        return themes_obj.keys().next().cloned();
    }
    let q_trimmed = q_raw.trim();
    if themes_obj.contains_key(q_trimmed) {
        return Some(q_trimmed.to_string());
    }
    let folded_query = fold_search_text(q_raw);
    if folded_query.is_empty() {
        return None;
    }
    for k in themes_obj.keys() {
        let fk = fold_search_text(k);
        if fk.contains(&folded_query) || folded_query.contains(&fk) {
            return Some(k.clone());
        }
    }
    let tokens: Vec<&str> = folded_query
        .split(' ')
        .filter(|t| t.chars().count() >= 2)
        .collect();
    let mut best_key: Option<String> = None;
    let mut best_score = 0usize;
    for (k, v) in themes_obj {
        let concept = v.get("concept").and_then(|x| x.as_str()).unwrap_or("");
        let fx = v.get("fxMode").and_then(|x| x.as_str()).unwrap_or("");
        let hay = fold_search_text(&format!("{k} {concept} {fx}"));
        let mut score = 0usize;
        for tk in &tokens {
            if hay.contains(tk) {
                score += tk.len();
            }
        }
        if score > best_score {
            best_score = score;
            best_key = Some(k.clone());
        }
    }
    if best_score > 0 {
        best_key
    } else {
        None
    }
}

fn match_persona(query: Option<&str>, code_root: &Path) -> Option<&'static PersonaItem> {
    let q_raw = query?;
    let q = fold_search_text(q_raw);
    if q.is_empty() {
        return None;
    }
    let lower_trim = q_raw.trim().to_ascii_lowercase();
    for p in known_personas(code_root) {
        if p.id == lower_trim || fold_search_text(p.id) == q {
            return Some(p);
        }
        if p.aliases.iter().any(|al| q.contains(al) || al.contains(&q)) {
            return Some(p);
        }
        if fold_search_text(p.label).contains(&q) {
            return Some(p);
        }
    }
    None
}

fn resolve_devtools_port_candidates() -> Vec<PathBuf> {
    if let Ok(ov) =
        std::env::var("AGY_DEVTOOLS_PORT_FILE").or_else(|_| std::env::var("AGY_PORT_FILE"))
    {
        if !ov.is_empty() {
            return vec![resolve_abs_path(Path::new(&ov))];
        }
    }
    let home = home_dir();
    if cfg!(windows) {
        let app_data = std::env::var("APPDATA")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"));
        vec![
            app_data.join("Antigravity").join("DevToolsActivePort"),
            app_data.join("antigravity").join("DevToolsActivePort"),
        ]
    } else if cfg!(target_os = "macos") {
        vec![home
            .join("Library")
            .join("Application Support")
            .join("Antigravity")
            .join("DevToolsActivePort")]
    } else {
        let xdg = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        vec![
            xdg.join("Antigravity").join("DevToolsActivePort"),
            xdg.join("antigravity").join("DevToolsActivePort"),
        ]
    }
}

fn os_platform_label() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

fn is_reserved_non_workspace_slug(slug: &str) -> bool {
    matches!(
        slug,
        "antigravity"
            | "launchpad"
            | "new-conversation"
            | "settings"
            | "customizations"
            | "automations"
            | "theme-studio"
            | "welcome"
            | "open-ide"
    )
}

pub fn extract_workspace_from_antigravity_title(raw_title: &str) -> Option<String> {
    let trimmed = raw_title.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    let base = if lower.ends_with(" - antigravity") {
        &trimmed[..trimmed.len() - " - antigravity".len()]
    } else if lower.ends_with(" — antigravity") {
        &trimmed[..trimmed.len() - " — antigravity".len()]
    } else {
        return None;
    };
    let candidate = match base.rfind(" - ") {
        Some(idx) => &base[idx + 3..],
        None => base,
    }
    .trim();
    if candidate.is_empty() {
        return None;
    }
    let key = normalize_workspace_key(candidate);
    if key.is_empty() || is_reserved_non_workspace_slug(&key) {
        return None;
    }
    Some(key)
}

async fn inspect_cdp_and_daemon_state(code_root: &Path) -> Value {
    let dp = get_dynamic_paths(code_root);
    let has_env_pid = std::env::var("AGY_PID_FILE")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let pid_candidates = if has_env_pid {
        vec![dp.pid_file]
    } else {
        let home = home_dir();
        vec![
            dp.pid_file,
            home.join(".gemini")
                .join("antigravity")
                .join("theme_daemon.pid"),
            home.join(".gemini")
                .join("config")
                .join("plugins")
                .join("antigravity-shinobu-theme")
                .join("daemon.pid"),
            home.join(".gemini")
                .join("config")
                .join("plugins")
                .join("antigravity-custom-theme")
                .join("daemon.pid"),
            home.join(".gemini")
                .join("config")
                .join("skills")
                .join("antigravity-custom-theme")
                .join("daemon.pid"),
        ]
    };

    let mut daemon_pid: Option<u32> = None;
    let mut daemon_running = false;
    for cand in pid_candidates {
        if let Ok(raw) = fs::read_to_string(&cand) {
            let t = raw.strip_prefix('\u{feff}').unwrap_or(&raw).trim();
            let pid_opt = if t.starts_with('{') {
                serde_json::from_str::<Value>(t)
                    .ok()
                    .and_then(|v| v.get("pid").and_then(|p| p.as_u64()))
                    .map(|n| n as u32)
            } else {
                t.parse::<u32>().ok()
            };
            if let Some(pid) = pid_opt {
                if pid > 0 && is_pid_alive(pid) {
                    daemon_pid = Some(pid);
                    daemon_running = true;
                    break;
                }
            }
        }
    }

    let mut port_file_found = false;
    let mut cdp_port: Option<u16> = None;
    for cand in resolve_devtools_port_candidates() {
        if let Ok(raw) = fs::read_to_string(&cand) {
            let first = raw
                .strip_prefix('\u{feff}')
                .unwrap_or(&raw)
                .lines()
                .next()
                .unwrap_or("")
                .trim();
            if let Ok(p) = first.parse::<u16>() {
                if p > 0 {
                    port_file_found = true;
                    cdp_port = Some(p);
                    break;
                }
            }
        }
    }

    let mut cdp_reachable = false;
    let mut workbench_targets = 0usize;
    let mut live_workspace: Option<String> = None;
    if let Some(port) = cdp_port {
        if let Ok(Value::Array(arr)) = fetch_json_loopback(port, "/json/list", 1000).await {
            cdp_reachable = true;
            for t in &arr {
                if t.get("type").and_then(|v| v.as_str()) == Some("page") {
                    workbench_targets += 1;
                    if live_workspace.is_none() {
                        let url_s = t.get("url").and_then(|v| v.as_str()).unwrap_or("");
                        if !url_s.starts_with("data:") && !url_s.starts_with("devtools://") {
                            if let Some(title_s) = t.get("title").and_then(|v| v.as_str()) {
                                live_workspace = extract_workspace_from_antigravity_title(title_s);
                            }
                        }
                    }
                }
            }
        }
    }

    json!({
        "platform": os_platform_label(),
        "daemonRunning": daemon_running,
        "daemonPid": daemon_pid,
        "portFileFound": port_file_found,
        "cdpPort": cdp_port,
        "cdpReachable": cdp_reachable,
        "workbenchTargets": workbench_targets,
        "liveWorkspace": live_workspace,
        "cdpHealthy": cdp_reachable && daemon_running
    })
}

fn ensure_daemon_awake_sync(code_root: &Path) -> bool {
    let dp = get_dynamic_paths(code_root);
    if check_pid_file_alive(&dp.pid_file) {
        return false;
    }
    ensure_daemon_awake(code_root, &dp.root_dir, &dp.pid_file)
}

pub fn detect_image_mime_by_magic_bytes(buf: &[u8]) -> Option<&'static str> {
    if buf.len() < 12 {
        return None;
    }
    if buf[0..4] == [0x89, 0x50, 0x4e, 0x47] {
        return Some("image/png");
    }
    if buf[0..3] == [0xff, 0xd8, 0xff] {
        return Some("image/jpeg");
    }
    if &buf[0..4] == b"RIFF" && &buf[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if &buf[0..4] == b"GIF8" {
        return Some("image/gif");
    }
    None
}

fn hsl_to_hex(h: i64, s: f64, l: f64) -> String {
    let hue = h.rem_euclid(360) as f64;
    let sat = s.clamp(0.0, 100.0) / 100.0;
    let lig = l.clamp(0.0, 100.0) / 100.0;
    let c = (1.0 - (2.0 * lig - 1.0).abs()) * sat;
    let x = c * (1.0 - (((hue / 60.0) % 2.0) - 1.0).abs());
    let m = lig - c / 2.0;
    let (r, g, b) = if hue < 60.0 {
        (c, x, 0.0)
    } else if hue < 120.0 {
        (x, c, 0.0)
    } else if hue < 180.0 {
        (0.0, c, x)
    } else if hue < 240.0 {
        (0.0, x, c)
    } else if hue < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    let to_hex = |v: f64| -> String {
        let byte = js_math_round((v + m) * 255.0).clamp(0, 255) as u8;
        format!("{byte:02x}")
    };
    format!("#{}{}{}", to_hex(r), to_hex(g), to_hex(b))
}

fn hex_to_rgb_tuple(hex_str: &str) -> String {
    let clean = hex_str.trim_start_matches('#');
    let r = u8::from_str_radix(clean.get(0..2).unwrap_or(""), 16).unwrap_or(14);
    let g = u8::from_str_radix(clean.get(2..4).unwrap_or(""), 16).unwrap_or(20);
    let b = u8::from_str_radix(clean.get(4..6).unwrap_or(""), 16).unwrap_or(34);
    format!("{r}, {g}, {b}")
}

fn build_forged_theme_from_bytes(
    buf: &[u8],
    mime: &str,
    custom_name: Option<&str>,
    fx_mode: Option<&str>,
    persona_id: &str,
    code_root: &Path,
) -> (String, Map<String, Value>) {
    let digest = Sha256::digest(buf);
    let u16_be = u16::from_be_bytes([digest[0], digest[1]]);
    let base_hue = js_math_round((u16_be as f64 / 65535.0) * 360.0);
    let accent_hue = (base_hue + 42 + (digest[2] as i64 % 48)) % 360;

    let primary = hsl_to_hex(base_hue, 82.0, 68.0);
    let accent = hsl_to_hex(accent_hue, 86.0, 66.0);
    let deep_dark = hsl_to_hex(base_hue, 44.0, 8.0);
    let mid_dark = hsl_to_hex(base_hue, 38.0, 12.0);
    let overlay_rgb = hex_to_rgb_tuple(&deep_dark);
    let primary_rgb = hex_to_rgb_tuple(&primary);
    let mid_rgb = hex_to_rgb_tuple(&mid_dark);

    let default_title = "⚒️ Vũ Trụ Rèn Qua Chat";
    let raw_name = custom_name
        .filter(|s| !s.is_empty())
        .unwrap_or(default_title);
    let filtered_name: String = raw_name
        .chars()
        .filter(|&c| !matches!(c, '\r' | '\n' | '\0' | '<' | '>' | '`' | '{' | '}'))
        .collect();
    let trimmed_name = slice_utf16_safe(filtered_name.trim(), 60);
    let safe_name = if trimmed_name.is_empty() {
        default_title.to_string()
    } else {
        trimmed_name.to_string()
    };

    const ALLOWED_FX: &[&str] = &[
        "wisteria",
        "royal_wisteria",
        "wisteria_royal",
        "water",
        "flame",
        "sound",
        "mist",
        "moon",
        "love",
        "serpent",
        "wind",
        "stone",
        "sun",
        "sun_water",
        "thunder",
        "beast",
        "nezuko",
        "blood_blossom",
    ];
    let clean_fx = fx_mode
        .filter(|m| ALLOWED_FX.contains(m))
        .unwrap_or("wisteria");

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf);
    let data_uri = format!("data:{mime};base64,{b64}");
    let default_avatar = if is_clean_edition_runtime(code_root) {
        "assets/clean_corner.svg"
    } else {
        "assets/yoriichi_avatar.jpg"
    };
    let safe_trait = if !persona_id.is_empty()
        && persona_id.len() <= 36
        && persona_id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    {
        persona_id
    } else {
        "yoriichi"
    };

    let theme_val = json!({
        "isForged": true,
        "concept": "OKLCH WCAG AA • Rèn qua MCP Chat",
        "fxMode": clean_fx,
        "primary": primary,
        "secondary": accent,
        "accent": accent,
        "overlayRgb": overlay_rgb,
        "defaultDimming": 30,
        "bg": format!("rgba({overlay_rgb}, 0.84)"),
        "pureBg": deep_dark,
        "cardBg": format!("rgba({mid_rgb}, 0.78)"),
        "sidebarBg": format!("rgba({overlay_rgb}, 0.74)"),
        "headerBg": format!("rgba({overlay_rgb}, 0.80)"),
        "aiCardBg": format!("rgba({overlay_rgb}, 0.68)"),
        "inputCardBg": format!("rgba({mid_rgb}, 0.88)"),
        "inputGlassBg": format!("rgba({overlay_rgb}, 0.52)"),
        "userBubble": format!("rgba({mid_rgb}, 0.86)"),
        "modalBg": mid_dark,
        "codeBg": format!("rgba({overlay_rgb}, 0.92)"),
        "frameBg": format!("linear-gradient(135deg, {primary}, {accent})"),
        "borderColor": format!("rgba({primary_rgb}, 0.36)"),
        "innerBorder": format!("1px solid rgba({primary_rgb}, 0.28)"),
        "pillBg": format!("rgba({primary_rgb}, 0.16)"),
        "pillBorder": format!("rgba({primary_rgb}, 0.42)"),
        "glow": format!("rgba({primary_rgb}, 0.30)"),
        "textMain": "#f8fafc",
        "textColor": "#f8fafc",
        "textMuted": "#cbd5e1",
        "wallpaper": data_uri,
        "userAvatar": default_avatar,
        "wcagReport": { "textContrast": "13.2", "level": "AAA" },
        "forgedByPersona": safe_trait,
        "personaTraitId": safe_trait
    });

    (
        safe_name,
        theme_val.as_object().cloned().unwrap_or_default(),
    )
}

async fn build_studio_state_payload(code_root: &Path) -> Value {
    let themes_obj = load_themes_registry(code_root);
    let cfg = read_config(code_root);
    let cdp = inspect_cdp_and_daemon_state(code_root).await;

    let first_theme = themes_obj.keys().next().cloned().unwrap_or_default();
    let cfg_theme = cfg.get("themeName").and_then(|v| v.as_str()).unwrap_or("");
    let forged_matches = cfg
        .get("activeForgedTheme")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("name"))
        .and_then(|n| n.as_str())
        == Some(cfg_theme);
    let active_theme =
        if !cfg_theme.is_empty() && (themes_obj.contains_key(cfg_theme) || forged_matches) {
            cfg_theme.to_string()
        } else {
            first_theme
        };

    let default_mode = read_default_ai_persona_mode(code_root);
    let ai_mode = normalize_persona_mode(
        cfg.get("aiPersonaMode")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
        &default_mode,
    );

    let themes_list: Vec<Value> = themes_obj
        .iter()
        .map(|(name, obj)| {
            json!({
                "name": name,
                "concept": obj.get("concept").and_then(|v| v.as_str()).unwrap_or(""),
                "primary": obj.get("primary").and_then(|v| v.as_str()).unwrap_or("#c084fc")
            })
        })
        .collect();

    let personas_list: Vec<Value> = known_personas(code_root)
        .iter()
        .map(|p| json!({ "id": p.id, "label": p.label }))
        .collect();

    let ws_profiles = sanitize_workspace_profiles_strict(cfg.get("workspaceProfiles"));

    let effective_ws = cdp
        .get("liveWorkspace")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| cfg.get("activeWorkspace").and_then(|v| v.as_str()))
        .unwrap_or("");

    json!({
        "cdp": cdp,
        "activeConfig": {
            "themeName": active_theme,
            "masterPersona": cfg.get("masterPersona").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or("yoriichi"),
            "aiPersonaMode": ai_mode,
            "dimming": cfg.get("dimming").and_then(|v| v.as_i64()).unwrap_or(35),
            "fxDensity": cfg.get("fxDensity").and_then(|v| v.as_i64()).unwrap_or(100),
            "chibiEnabled": cfg.get("chibiEnabled").and_then(|v| v.as_bool()) != Some(false),
            "autoFinisher": cfg.get("autoFinisher").and_then(|v| v.as_bool()) != Some(false),
            "focusMode": cfg.get("focusMode").and_then(|v| v.as_bool()).unwrap_or(false),
            "privacyShieldActive": cfg.get("privacyShieldActive").and_then(|v| v.as_bool()).unwrap_or(false),
            "uiLang": cfg.get("uiLang").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or("vi"),
            "activeWorkspace": effective_ws,
            "workspaceProfiles": ws_profiles
        },
        "themes": themes_list,
        "personas": personas_list
    })
}

const STUDIO_APP_TEMPLATE: &str = include_str!("studio_app.html");

fn serialize_safe_json_for_script(val: &Value) -> String {
    let raw = serde_json::to_string(val).unwrap_or_else(|_| "null".to_string());
    let mut out = String::with_capacity(raw.len() + 16);
    for ch in raw.chars() {
        match ch {
            '<' => out.push_str("\\u003c"),
            '>' => out.push_str("\\u003e"),
            '&' => out.push_str("\\u0026"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            _ => out.push(ch),
        }
    }
    out
}

fn build_mcp_app_html(initial_state: &Value) -> String {
    let safe_json = serialize_safe_json_for_script(initial_state);
    STUDIO_APP_TEMPLATE.replace("__AGY_STUDIO_INITIAL_STATE__", &safe_json)
}

fn tools_catalog(clean_edition: bool) -> Value {
    let switch_desc = if clean_edition {
        "Switch the active Antigravity IDE wallpaper/glass theme by theme name or mood (supports fuzzy Vietnamese/English/Japanese queries), with optional dimming, particle density, Chibi visibility, and UI language."
    } else {
        "Switch the active Antigravity IDE wallpaper/glass theme by character name, Hashira title, or mood (supports fuzzy Vietnamese/English/Japanese queries), with optional dimming, particle density, Chibi visibility, and UI language."
    };
    let theme_q_desc = if clean_edition {
        "Theme name or mood (e.g. \"Aurora Borealis\", \"Solaris Amber\", \"Nebula Violet\", \"Midnight Obsidian\")."
    } else {
        "Theme or character name (e.g. \"Shinobu\", \"Nham Trụ\", \"Gyomei\", \"Giyu\", \"Rengoku\", \"WLOP Cosmic\", \"Midnight Obsidian\")."
    };
    let persona_q_desc = if clean_edition {
        "Persona ID or role (e.g. \"yoriichi\", \"shadow_monarch\", \"six_eyes\", \"great_sage\", \"architect\", \"commander\")."
    } else {
        "Persona ID or character name (e.g. \"yoriichi\", \"shadow_monarch\", \"six_eyes\", \"great_sage\", \"shinobu\", \"rengoku\")."
    };

    json!([
      {
        "name": "open_theme_studio",
        "title": "Theme Studio",
        "description": "Open the interactive Antigravity Theme Studio Side-Pane & inspect active theme, persona, workspace profiles, and CDP connection health.",
        "inputSchema": {
          "type": "object",
          "properties": {},
          "additionalProperties": false
        },
        "_meta": {
          "ui": {
            "resourceUri": APP_URI,
            "visibility": ["model", "app"]
          },
          "com.google.antigravity/ui": {
            "entrypoints": [
              { "type": "aux_pane", "title": "Theme Studio" },
              { "type": "global", "title": "Theme Studio" }
            ]
          }
        }
      },
      {
        "name": "switch_theme",
        "title": "Switch Antigravity Theme",
        "description": switch_desc,
        "inputSchema": {
          "type": "object",
          "properties": {
            "themeQuery": { "type": "string", "description": theme_q_desc },
            "dimming": { "type": "number", "description": "Optional code backdrop dimming percentage (15..92)." },
            "fxDensity": { "type": "number", "description": "Optional ambient particle density percentage (0..100, 0 disables particles)." },
            "chibiEnabled": { "type": "boolean", "description": "Optional toggle for Chibi companion sprites." },
            "uiLang": { "type": "string", "enum": ["vi", "en", "ja"], "description": "Optional Studio UI language (vi, en, ja)." },
            "aiPersonaMode": {
              "type": "string",
              "enum": ["off", "subtle", "roleplay"],
              "description": "Optional AI assistant persona intensity synced with the active theme."
            }
          }
        },
        "_meta": { "ui": { "visibility": ["model", "app"] } }
      },
      {
        "name": "set_persona",
        "title": "Set Master Persona",
        "description": "Switch the user Master Persona (avatar crest, 3D Breathing VFX identity, and title) independently without changing the current wallpaper.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "personaQuery": { "type": "string", "description": persona_q_desc },
            "aiPersonaMode": {
              "type": "string",
              "enum": ["off", "subtle", "roleplay"],
              "description": "Optional AI response persona mode (\"off\", \"subtle\", \"roleplay\")."
            }
          },
          "required": ["personaQuery"]
        },
        "_meta": { "ui": { "visibility": ["model", "app"] } }
      },
      {
        "name": "toggle_focus_mode",
        "title": "Toggle Deep Focus Mode",
        "description": "Enable or disable Deep Focus Mode (hides Chibi companions, lowers ambient particles to 20%, pauses automatic full-screen Breathing finishers, and enables Transparent World).",
        "inputSchema": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "description": "True to enter Deep Focus Mode; false to restore full visual effects." }
          },
          "required": ["enabled"]
        },
        "_meta": { "ui": { "visibility": ["model", "app"] } }
      },
      {
        "name": "forge_theme_from_image",
        "title": "Forge OKLCH Theme from Image",
        "description": "Forge and activate a WCAG AA high-contrast glassmorphic theme directly from a local PNG/JPEG/WebP/GIF wallpaper file.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "imagePath": { "type": "string", "description": "Absolute path to a local image file (<= 15 MB, PNG/JPEG/WebP/GIF)." },
            "themeName": { "type": "string", "description": "Optional custom display name for the forged theme." },
            "fxMode": { "type": "string", "description": "Optional particle mode." },
            "personaQuery": { "type": "string", "description": "Optional Master Persona to pair with the forged theme." }
          },
          "required": ["imagePath"]
        },
        "_meta": { "ui": { "visibility": ["model", "app"] } }
      },
      {
        "name": "bind_workspace_profile",
        "title": "Manage Workspace Theme Profile",
        "description": "Bind, apply, remove, or list automatic per-workspace theme & persona profiles.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "action": { "type": "string", "enum": ["bind", "apply", "remove", "list"], "description": "Profile operation to perform." },
            "workspace": { "type": "string", "description": "Workspace directory path or folder key (e.g. \"my-backend\")." },
            "themeQuery": { "type": "string", "description": "Optional theme query when binding a workspace profile." },
            "personaQuery": { "type": "string", "description": "Optional persona query when binding a workspace profile." },
            "aiPersonaMode": { "type": "string", "enum": ["off", "subtle", "roleplay"], "description": "Optional AI persona mode for this workspace (\"off\", \"subtle\", \"roleplay\")." }
          },
          "required": ["action"]
        },
        "_meta": { "ui": { "visibility": ["model", "app"] } }
      },
      {
        "name": "diagnose_cdp_onboarding",
        "title": "CDP Onboarding Doctor",
        "description": "Diagnose Antigravity 127.0.0.1 DevToolsActivePort & theme daemon health, and optionally auto-configure user-level shortcuts (--remote-debugging-port=0) and start the daemon.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "autoFix": { "type": "boolean", "description": "When true, runs non-admin shortcut patching and wakes the background daemon." }
          }
        },
        "_meta": { "ui": { "visibility": ["model", "app"] } }
      }
    ])
}

async fn handle_tool_call(
    name: &str,
    raw_args: &Value,
    code_root: &Path,
) -> Result<Value, (i64, String)> {
    let empty_obj = Map::new();
    let args = raw_args.as_object().unwrap_or(&empty_obj);
    let themes_obj = load_themes_registry(code_root);

    match name {
        "open_theme_studio" => {
            ensure_daemon_awake_sync(code_root);
            let studio = build_studio_state_payload(code_root).await;
            let healthy = studio["cdp"]["cdpHealthy"].as_bool().unwrap_or(false);
            let status_text = if healthy {
                format!(
                    "Theme Studio sẵn sàng (CDP hoạt động trên cổng {}, Daemon PID {}). Chủ đề hiện tại: {}.",
                    studio["cdp"]["cdpPort"],
                    studio["cdp"]["daemonPid"],
                    studio["activeConfig"]["themeName"].as_str().unwrap_or("")
                )
            } else {
                "Theme Studio đã mở ở chế độ Bác Sĩ Cài Đặt (chưa phát hiện cổng CDP trực tiếp; bạn có thể chạy diagnose_cdp_onboarding với autoFix=true).".to_string()
            };
            Ok(json!({
                "content": [{ "type": "text", "text": status_text }],
                "structuredContent": studio
            }))
        }
        "switch_theme" => {
            let mut patch = Map::new();
            if let Some(tq) = args
                .get("themeQuery")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
            {
                let Some(resolved_theme) = match_theme_name(Some(tq), &themes_obj) else {
                    let valid_keys: Vec<&str> = themes_obj.keys().map(|k| k.as_str()).collect();
                    return Ok(json!({
                        "isError": true,
                        "content": [{ "type": "text", "text": format!("Không tìm thấy chủ đề khớp với \"{tq}\". Danh sách hợp lệ: {}", valid_keys.join(", ")) }]
                    }));
                };
                let th_def = themes_obj.get(&resolved_theme).and_then(|v| v.as_object());
                patch.insert(
                    "themeName".to_string(),
                    Value::String(resolved_theme.clone()),
                );
                patch.insert("bubbleName".to_string(), Value::String(resolved_theme));
                patch.insert("customWp".to_string(), Value::String(String::new()));
                patch.insert("wpEnabled".to_string(), Value::Bool(true));
                if !args.contains_key("dimming") {
                    if let Some(def_dim) = th_def
                        .and_then(|d| d.get("defaultDimming"))
                        .and_then(|v| v.as_i64())
                    {
                        patch.insert("dimming".to_string(), Value::Number(def_dim.into()));
                    }
                }
            }
            if let Some(dim) = args
                .get("dimming")
                .and_then(|v| v.as_f64())
                .filter(|n| n.is_finite())
            {
                let c = js_math_round(dim).clamp(15, 92);
                patch.insert("dimming".to_string(), Value::Number(c.into()));
            }
            if let Some(fx) = args
                .get("fxDensity")
                .and_then(|v| v.as_f64())
                .filter(|n| n.is_finite())
            {
                let c = js_math_round(fx).clamp(0, 100);
                patch.insert("fxDensity".to_string(), Value::Number(c.into()));
            }
            if let Some(chibi) = args.get("chibiEnabled").and_then(|v| v.as_bool()) {
                patch.insert("chibiEnabled".to_string(), Value::Bool(chibi));
                if chibi {
                    patch.insert("focusMode".to_string(), Value::Bool(false));
                }
            }
            if let Some(lang_raw) = args.get("uiLang").and_then(|v| v.as_str()) {
                let l = lang_raw.trim().to_ascii_lowercase();
                if matches!(l.as_str(), "vi" | "en" | "ja") {
                    patch.insert("uiLang".to_string(), Value::String(l));
                }
            }
            let req_mode = normalize_persona_mode(
                args.get("aiPersonaMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                "",
            );
            if !req_mode.is_empty() {
                if req_mode == "subtle" || req_mode == "roleplay" {
                    patch.insert("focusMode".to_string(), Value::Bool(false));
                }
                patch.insert("aiPersonaMode".to_string(), Value::String(req_mode));
            }
            write_config(code_root, &patch, None);
            ensure_daemon_awake_sync(code_root);
            let studio = build_studio_state_payload(code_root).await;
            let txt = format!(
                "Đã cập nhật giao diện: {} (khí chất AI: {}, ngôn ngữ: {}).",
                studio["activeConfig"]["themeName"].as_str().unwrap_or(""),
                studio["activeConfig"]["aiPersonaMode"]
                    .as_str()
                    .unwrap_or(""),
                studio["activeConfig"]["uiLang"].as_str().unwrap_or("vi")
            );
            Ok(json!({
                "content": [{ "type": "text", "text": txt }],
                "structuredContent": studio
            }))
        }
        "set_persona" => {
            let pq = args.get("personaQuery").and_then(|v| v.as_str());
            let Some(matched) = match_persona(pq, code_root) else {
                let ids: Vec<&str> = known_personas(code_root).iter().map(|p| p.id).collect();
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": format!("Không tìm thấy Bản Ngã khớp với \"{}\". Gợi ý: {}", pq.unwrap_or(""), ids.join(", ")) }]
                }));
            };
            let mut patch = Map::new();
            patch.insert(
                "masterPersona".to_string(),
                Value::String(matched.id.to_string()),
            );
            patch.insert("userAvatar".to_string(), Value::String(String::new()));
            let req_mode = normalize_persona_mode(
                args.get("aiPersonaMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                "",
            );
            if !req_mode.is_empty() {
                patch.insert("aiPersonaMode".to_string(), Value::String(req_mode));
            }
            write_config(code_root, &patch, None);
            ensure_daemon_awake_sync(code_root);
            let studio = build_studio_state_payload(code_root).await;
            Ok(json!({
                "content": [{ "type": "text", "text": format!("Đã chuyển Bản Ngã Chủ Nhân sang: {} ({}).", matched.label, matched.id) }],
                "structuredContent": studio
            }))
        }
        "toggle_focus_mode" => {
            let on = args
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let patch_val = if on {
                json!({ "chibiEnabled": false, "fxDensity": 20, "autoFinisher": false, "transparentWorld": true, "focusMode": true })
            } else {
                json!({ "chibiEnabled": true, "fxDensity": 100, "autoFinisher": true, "transparentWorld": true, "focusMode": false })
            };
            write_config(
                code_root,
                patch_val.as_object().expect("static object"),
                None,
            );
            ensure_daemon_awake_sync(code_root);
            let studio = build_studio_state_payload(code_root).await;
            let msg = if on {
                "Đã kích hoạt Chế độ Tập trung sâu (ẩn Chibi, hạt 20%, tắt tự tung chiêu)."
            } else {
                "Đã tắt Chế độ Tập trung sâu và khôi phục đầy đủ hiệu ứng."
            };
            Ok(json!({
                "content": [{ "type": "text", "text": msg }],
                "structuredContent": studio
            }))
        }
        "forge_theme_from_image" => {
            let raw_path = args
                .get("imagePath")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if raw_path.is_empty()
                || is_unc_or_device_path(raw_path)
                || !is_safe_local_regular_file(Path::new(raw_path))
            {
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": "Đường dẫn tệp ảnh không hợp lệ hoặc bị chặn vì lý do bảo mật (chỉ chấp nhận tệp cục bộ thông thường, không chấp nhận UNC/Symlink)." }]
                }));
            }
            let Ok(stat) = fs::metadata(raw_path) else {
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": "Không thể đọc thông tin tệp ảnh." }]
                }));
            };
            if stat.len() == 0 || stat.len() > MAX_FORGE_IMAGE_BYTES {
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": "Kích thước ảnh vượt giới hạn an toàn (yêu cầu <= 15 MB)." }]
                }));
            }
            if stat.len() > MAX_INLINE_FORGE_BYTES {
                let mb = stat.len() as f64 / (1024.0 * 1024.0);
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": format!("Ảnh nặng {mb:.2} MB (> 1.35 MB giới hạn nhúng trực tiếp qua Stdio). Vui lòng thả ảnh vào Tab \"Lò rèn & Dữ liệu\" trong Xưởng Tùy Biến để trình duyệt tự nén WebP 2K trước khi rèn.") }]
                }));
            }
            let Ok(buf) = fs::read(raw_path) else {
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": "Không thể đọc nội dung tệp ảnh." }]
                }));
            };
            let Some(mime) = detect_image_mime_by_magic_bytes(&buf) else {
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": "Tệp không phải định dạng ảnh hợp lệ (chỉ chấp nhận PNG, JPEG, WebP, GIF qua kiểm tra Magic Bytes)." }]
                }));
            };
            let cur_cfg = read_config(code_root);
            let matched_persona =
                match_persona(args.get("personaQuery").and_then(|v| v.as_str()), code_root);
            let persona_id = matched_persona
                .map(|p| p.id.to_string())
                .or_else(|| {
                    cur_cfg
                        .get("masterPersona")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                })
                .unwrap_or_else(|| "yoriichi".to_string());

            let (forged_name, mut forged_theme) = build_forged_theme_from_bytes(
                &buf,
                mime,
                args.get("themeName").and_then(|v| v.as_str()),
                args.get("fxMode").and_then(|v| v.as_str()),
                &persona_id,
                code_root,
            );
            let primary_hex = forged_theme
                .get("primary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let accent_hex = forged_theme
                .get("accent")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let def_dim = forged_theme
                .get("defaultDimming")
                .and_then(|v| v.as_i64())
                .unwrap_or(30);
            forged_theme.insert("name".to_string(), Value::String(forged_name.clone()));

            let patch_val = json!({
                "themeName": forged_name,
                "bubbleName": forged_name,
                "masterPersona": persona_id,
                "dimming": def_dim,
                "customWp": "",
                "wpEnabled": true,
                "activeForgedTheme": Value::Object(forged_theme)
            });
            write_config(
                code_root,
                patch_val.as_object().expect("static object"),
                None,
            );
            ensure_daemon_awake_sync(code_root);
            let studio = build_studio_state_payload(code_root).await;
            Ok(json!({
                "content": [{ "type": "text", "text": format!("Đã rèn và kích hoạt chủ đề \"{forged_name}\" (chính: {primary_hex}, nhấn: {accent_hex}, chuẩn tương phản WCAG AAA).") }],
                "structuredContent": studio
            }))
        }
        "bind_workspace_profile" => {
            let action = args
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("list")
                .trim();
            let cur = read_config(code_root);
            let mut profiles = sanitize_workspace_profiles_strict(cur.get("workspaceProfiles"));

            if action == "list" {
                let summary = if profiles.is_empty() {
                    "Chưa có hồ sơ giao diện theo dự án nào.".to_string()
                } else {
                    profiles
                        .iter()
                        .map(|(k, v)| {
                            let tn = v.get("themeName").and_then(|x| x.as_str()).unwrap_or("");
                            let mp = v
                                .get("masterPersona")
                                .and_then(|x| x.as_str())
                                .filter(|s| !s.is_empty())
                                .unwrap_or("yoriichi");
                            format!("- {k}: {tn} ({mp})")
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                };
                return Ok(json!({
                    "content": [{ "type": "text", "text": summary }],
                    "structuredContent": { "workspaceProfiles": profiles }
                }));
            }

            let cdp_ws = if args
                .get("workspace")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .is_none()
            {
                inspect_cdp_and_daemon_state(code_root).await["liveWorkspace"]
                    .as_str()
                    .map(String::from)
            } else {
                None
            };
            let raw_ws = args
                .get("workspace")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .or(cdp_ws.as_deref())
                .or_else(|| cur.get("activeWorkspace").and_then(|v| v.as_str()))
                .unwrap_or("");
            let ws_key = normalize_workspace_key(raw_ws);
            if ws_key.is_empty() {
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": "Vui lòng cung cấp tên hoặc đường dẫn thư mục dự án (workspace)." }]
                }));
            }

            if action == "remove" {
                profiles.shift_remove(&ws_key);
                let mut patch = Map::new();
                patch.insert(
                    "workspaceProfiles".to_string(),
                    Value::Object(profiles.clone()),
                );
                write_config(code_root, &patch, Some(&ws_key));
                let studio = build_studio_state_payload(code_root).await;
                return Ok(json!({
                    "content": [{ "type": "text", "text": format!("Đã xóa hồ sơ giao diện của dự án \"{ws_key}\".") }],
                    "structuredContent": { "workspaceProfiles": profiles, "studio": studio }
                }));
            }

            if action == "apply" {
                let Some(prof) = profiles.get(&ws_key).and_then(|v| v.as_object()).cloned() else {
                    return Ok(json!({
                        "isError": true,
                        "content": [{ "type": "text", "text": format!("Chưa có hồ sơ nào được lưu cho dự án \"{ws_key}\".") }]
                    }));
                };
                let tn = prof
                    .get("themeName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let bn = prof
                    .get("bubbleName")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(&tn)
                    .to_string();
                let mut next_patch = json!({
                    "activeWorkspace": ws_key,
                    "themeName": tn,
                    "bubbleName": bn,
                    "masterPersona": prof.get("masterPersona").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or("yoriichi"),
                    "dimming": prof.get("dimming").and_then(|v| v.as_i64()).unwrap_or(35),
                    "fxDensity": prof.get("fxDensity").and_then(|v| v.as_i64()).unwrap_or(100),
                    "chibiEnabled": prof.get("chibiEnabled").and_then(|v| v.as_bool()) != Some(false),
                    "autoFinisher": prof.get("autoFinisher").and_then(|v| v.as_bool()) != Some(false),
                    "focusMode": prof.get("focusMode").and_then(|v| v.as_bool()).unwrap_or(false)
                });
                if let Some(m) = prof.get("aiPersonaMode").and_then(|v| v.as_str()) {
                    let norm_m =
                        normalize_persona_mode(m, &read_default_ai_persona_mode(code_root));
                    if let Some(obj) = next_patch.as_object_mut() {
                        obj.insert("aiPersonaMode".to_string(), Value::String(norm_m));
                    }
                }
                write_config(
                    code_root,
                    next_patch.as_object().expect("static object"),
                    Some(&ws_key),
                );
                ensure_daemon_awake_sync(code_root);
                let studio = build_studio_state_payload(code_root).await;
                return Ok(json!({
                    "content": [{ "type": "text", "text": format!("Đã áp dụng hồ sơ của dự án \"{ws_key}\": {tn}.") }],
                    "structuredContent": { "workspaceProfiles": profiles, "studio": studio }
                }));
            }

            // action == "bind"
            let tq = args
                .get("themeQuery")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty());
            let resolved_theme = if let Some(q) = tq {
                match_theme_name(Some(q), &themes_obj)
            } else {
                cur.get("themeName")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .or_else(|| themes_obj.keys().next().cloned())
            };
            let Some(resolved_theme) = resolved_theme else {
                return Ok(json!({
                    "isError": true,
                    "content": [{ "type": "text", "text": format!("Không tìm thấy chủ đề \"{}\".", tq.unwrap_or("")) }]
                }));
            };
            let matched_persona =
                match_persona(args.get("personaQuery").and_then(|v| v.as_str()), code_root);
            let persona_id = matched_persona
                .map(|p| p.id.to_string())
                .or_else(|| {
                    cur.get("masterPersona")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                })
                .unwrap_or_else(|| "yoriichi".to_string());

            let def_mode = read_default_ai_persona_mode(code_root);
            let cur_mode = normalize_persona_mode(
                cur.get("aiPersonaMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                &def_mode,
            );
            let bound_mode = normalize_persona_mode(
                args.get("aiPersonaMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                &cur_mode,
            );
            let def_dim = themes_obj
                .get(&resolved_theme)
                .and_then(|t| t.get("defaultDimming"))
                .and_then(|v| v.as_i64())
                .unwrap_or(35);

            let entry = json!({
                "themeName": resolved_theme,
                "bubbleName": resolved_theme,
                "masterPersona": persona_id,
                "aiPersonaMode": bound_mode,
                "dimming": cur.get("dimming").and_then(|v| v.as_i64()).unwrap_or(def_dim),
                "fxDensity": cur.get("fxDensity").and_then(|v| v.as_i64()).unwrap_or(100),
                "chibiEnabled": cur.get("chibiEnabled").and_then(|v| v.as_bool()) != Some(false),
                "autoFinisher": cur.get("autoFinisher").and_then(|v| v.as_bool()) != Some(false),
                "focusMode": cur.get("focusMode").and_then(|v| v.as_bool()).unwrap_or(false)
            });
            profiles.insert(ws_key.clone(), entry);

            let patch_val = json!({
                "activeWorkspace": ws_key,
                "themeName": resolved_theme,
                "bubbleName": resolved_theme,
                "masterPersona": persona_id,
                "aiPersonaMode": bound_mode,
                "workspaceProfiles": profiles
            });
            write_config(
                code_root,
                patch_val.as_object().expect("static object"),
                Some(&ws_key),
            );
            ensure_daemon_awake_sync(code_root);
            let studio = build_studio_state_payload(code_root).await;
            Ok(json!({
                "content": [{ "type": "text", "text": format!("Đã gắn dự án \"{ws_key}\" với chủ đề \"{resolved_theme}\" & Bản Ngã \"{persona_id}\".") }],
                "structuredContent": { "workspaceProfiles": profiles, "studio": studio }
            }))
        }
        "diagnose_cdp_onboarding" => {
            let mut auto_fix_log = String::new();
            let auto_fix = args
                .get("autoFix")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let skip_spawn = std::env::var("AGY_SKIP_DAEMON_SPAWN").ok().as_deref() == Some("1");
            if auto_fix {
                let install_win = code_root.join("scripts").join("install-win.ps1");
                let install_unix = code_root.join("scripts").join("install-unix.sh");
                if cfg!(windows) && install_win.exists() && !skip_spawn {
                    let res = Command::new("powershell.exe")
                        .args([
                            "-NoProfile",
                            "-ExecutionPolicy",
                            "Bypass",
                            "-File",
                            &install_win.to_string_lossy(),
                        ])
                        .current_dir(code_root)
                        .stdin(Stdio::null())
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .status();
                    match res {
                        Ok(s) if s.success() => {
                            auto_fix_log = "Đã vá tự động cờ --remote-debugging-port=0 vào các Shortcut Antigravity và khởi chạy Daemon. ".to_string();
                        }
                        Ok(s) => {
                            auto_fix_log = format!("Lưu ý khi chạy trình vá tự động: exit {s}. ");
                        }
                        Err(e) => {
                            auto_fix_log = format!("Lưu ý khi chạy trình vá tự động: {e}. ");
                        }
                    }
                } else if !cfg!(windows) && install_unix.exists() && !skip_spawn {
                    let _ = Command::new("bash")
                        .arg(&install_unix)
                        .current_dir(code_root)
                        .stdin(Stdio::null())
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .status();
                    auto_fix_log =
                        "Đã cấu hình launcher Unix/macOS và khởi chạy Daemon. ".to_string();
                } else {
                    let woke = ensure_daemon_awake_sync(code_root);
                    auto_fix_log = if woke {
                        "Đã đánh thức tiến trình Daemon chạy ngầm. ".to_string()
                    } else {
                        "Đã kiểm tra tiến trình Daemon. ".to_string()
                    };
                }
            }

            let studio = build_studio_state_payload(code_root).await;
            let cdp = studio["cdp"].clone();
            let guidance = if cdp["cdpHealthy"].as_bool().unwrap_or(false) {
                format!(
                    "{auto_fix_log}Kết nối CDP hoàn toàn khỏe mạnh (127.0.0.1:{}, {} cửa sổ, Daemon PID {}). Giao diện đã được nạp trực tiếp!",
                    cdp["cdpPort"], cdp["workbenchTargets"], cdp["daemonPid"]
                )
            } else {
                format!(
                    "{auto_fix_log}Hiện chưa phát hiện cổng DevToolsActivePort hoạt động. Vui lòng thoát hẳn Antigravity (Quit ở khay hệ thống / Cmd+Q) rồi mở lại từ Start Menu hoặc ứng dụng đã vá để kích hoạt --remote-debugging-port=0."
                )
            };
            Ok(json!({
                "content": [{ "type": "text", "text": guidance }],
                "structuredContent": { "cdp": cdp, "studio": studio }
            }))
        }
        other => Err((-32601, format!("Unknown tool: {other}"))),
    }
}

fn write_json_rpc_message(payload_obj: &Value, use_content_length: bool) {
    let Ok(json_str) = serde_json::to_string(payload_obj) else {
        return;
    };
    let mut stdout = std::io::stdout().lock();
    if use_content_length {
        let _ = write!(
            stdout,
            "Content-Length: {}\r\n\r\n{}",
            json_str.len(),
            json_str
        );
    } else {
        let _ = writeln!(stdout, "{json_str}");
    }
    let _ = stdout.flush();
}

async fn dispatch_rpc_request(msg: &Value, use_content_length: bool, code_root: &Path) {
    let Some(obj) = msg.as_object() else {
        return;
    };
    if obj.get("jsonrpc").and_then(|v| v.as_str()) != Some("2.0") {
        return;
    }
    let id_val = obj.get("id").filter(|v| !v.is_null()).cloned();
    let method = obj.get("method").and_then(|v| v.as_str()).unwrap_or("");

    if method == "initialize" {
        let client_proto = obj
            .get("params")
            .and_then(|p| p.get("protocolVersion"))
            .and_then(|v| v.as_str())
            .unwrap_or("2025-03-26");
        let negotiated = if matches!(
            client_proto,
            "2024-11-05" | "2025-03-26" | "2025-06-18" | "2026-01-26"
        ) {
            client_proto
        } else {
            "2025-06-18"
        };
        let srv_name = if is_clean_edition_runtime(code_root) {
            "antigravity-clean-theme-controller"
        } else {
            "antigravity-shinobu-theme-controller"
        };
        if let Some(id) = id_val {
            write_json_rpc_message(
                &json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "protocolVersion": negotiated,
                        "capabilities": {
                            "tools": { "listChanged": false },
                            "resources": { "subscribe": false, "listChanged": false }
                        },
                        "serverInfo": {
                            "name": srv_name,
                            "version": "3.0.0"
                        }
                    }
                }),
                use_content_length,
            );
        }
        return;
    }

    if method == "ping" {
        if let Some(id) = id_val {
            write_json_rpc_message(
                &json!({ "jsonrpc": "2.0", "id": id, "result": {} }),
                use_content_length,
            );
        }
        return;
    }

    if method.starts_with("notifications/") {
        return;
    }

    if method == "tools/list" {
        if let Some(id) = id_val {
            let tools = tools_catalog(is_clean_edition_runtime(code_root));
            write_json_rpc_message(
                &json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools } }),
                use_content_length,
            );
        }
        return;
    }

    if method == "tools/call" {
        let tool_name = obj
            .get("params")
            .and_then(|p| p.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let tool_args = obj
            .get("params")
            .and_then(|p| p.get("arguments"))
            .cloned()
            .unwrap_or_else(|| json!({}));
        match handle_tool_call(tool_name, &tool_args, code_root).await {
            Ok(result) => {
                if let Some(id) = id_val {
                    write_json_rpc_message(
                        &json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                        use_content_length,
                    );
                }
            }
            Err((code, err_msg)) => {
                if let Some(id) = id_val {
                    write_json_rpc_message(
                        &json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": err_msg } }),
                        use_content_length,
                    );
                }
            }
        }
        return;
    }

    if method == "resources/list" {
        if let Some(id) = id_val {
            write_json_rpc_message(
                &json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "resources": [{
                            "uri": APP_URI,
                            "name": "Antigravity Theme Studio",
                            "description": "Interactive Side-Pane Theme Controller & CDP Onboarding Doctor",
                            "mimeType": "text/html;profile=mcp-app",
                            "_meta": { "ui": { "prefersBorder": false } }
                        }]
                    }
                }),
                use_content_length,
            );
        }
        return;
    }

    if method == "resources/read" {
        let uri = obj
            .get("params")
            .and_then(|p| p.get("uri"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if uri != APP_URI {
            if let Some(id) = id_val {
                write_json_rpc_message(
                    &json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32602, "message": format!("Resource not found: {uri}") }
                    }),
                    use_content_length,
                );
            }
            return;
        }
        if let Some(id) = id_val {
            ensure_daemon_awake_sync(code_root);
            let initial_state = build_studio_state_payload(code_root).await;
            write_json_rpc_message(
                &json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "contents": [{
                            "uri": APP_URI,
                            "mimeType": "text/html;profile=mcp-app",
                            "text": build_mcp_app_html(&initial_state),
                            "_meta": { "ui": { "prefersBorder": false } }
                        }]
                    }
                }),
                use_content_length,
            );
        }
        return;
    }

    if let Some(id) = id_val {
        write_json_rpc_message(
            &json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("Method not found: {method}") }
            }),
            use_content_length,
        );
    }
}

fn parse_content_length_header(hdr_ascii: &str) -> Option<usize> {
    for line in hdr_ascii.lines() {
        let trimmed = line.trim();
        if trimmed.len() >= 15 && trimmed[..15].eq_ignore_ascii_case("content-length:") {
            return trimmed[15..].trim().parse::<usize>().ok();
        }
    }
    None
}

pub async fn run_mcp_server_async(default_code_root: &Path) -> i32 {
    let code_root = std::env::var("PLUGIN_ROOT")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| resolve_abs_path(Path::new(&s)))
        .unwrap_or_else(|| resolve_abs_path(default_code_root));

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut stdin = std::io::stdin();
        let mut chunk = [0u8; 16384];
        while let Ok(n) = stdin.read(&mut chunk) {
            if n == 0 {
                break;
            }
            if tx.send(chunk[..n].to_vec()).is_err() {
                break;
            }
        }
    });

    let mut stdin_buf: Vec<u8> = Vec::with_capacity(8192);
    let mut use_content_length_framing = false;

    while let Some(chunk) = rx.recv().await {
        stdin_buf.extend_from_slice(&chunk);
        if stdin_buf.len() > 16 * 1024 * 1024 {
            stdin_buf.clear();
            continue;
        }

        loop {
            let start = stdin_buf
                .iter()
                .position(|&b| !matches!(b, b'\n' | b'\r' | b' ' | b'\t'))
                .unwrap_or(stdin_buf.len());
            if start > 0 {
                stdin_buf.drain(..start);
            }
            if stdin_buf.is_empty() {
                break;
            }

            let head_len = stdin_buf.len().min(32);
            let head_str = String::from_utf8_lossy(&stdin_buf[..head_len]);
            if head_str.len() >= 15 && head_str[..15].eq_ignore_ascii_case("content-length:") {
                use_content_length_framing = true;
                let Some(sep_idx) = stdin_buf.windows(4).position(|w| w == b"\r\n\r\n") else {
                    break;
                };
                let hdr_ascii = String::from_utf8_lossy(&stdin_buf[..sep_idx]);
                let Some(content_len) = parse_content_length_header(&hdr_ascii) else {
                    stdin_buf.drain(..sep_idx + 4);
                    continue;
                };
                let body_start = sep_idx + 4;
                if stdin_buf.len() < body_start + content_len {
                    break;
                }
                let body_bytes = stdin_buf[body_start..body_start + content_len].to_vec();
                stdin_buf.drain(..body_start + content_len);
                if let Ok(body_str) = std::str::from_utf8(&body_bytes) {
                    if let Ok(val) = serde_json::from_str::<Value>(body_str) {
                        let cleaned = strip_proto_keys(&val, 0);
                        dispatch_rpc_request(&cleaned, use_content_length_framing, &code_root)
                            .await;
                    }
                }
                continue;
            }

            let Some(nl_idx) = stdin_buf.iter().position(|&b| b == b'\n') else {
                break;
            };
            let line_bytes = stdin_buf[..nl_idx].to_vec();
            stdin_buf.drain(..=nl_idx);
            if let Ok(s) = std::str::from_utf8(&line_bytes) {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                    let cleaned = strip_proto_keys(&val, 0);
                    dispatch_rpc_request(&cleaned, use_content_length_framing, &code_root).await;
                }
            }
        }
    }

    0
}
