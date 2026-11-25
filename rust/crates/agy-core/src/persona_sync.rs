use crate::security::{
    is_dangerous_key, is_safe_local_regular_file, is_unc_or_device_path, random_hex_4,
    slice_utf16_safe, strip_proto_keys,
};
use serde_json::{json, Map, Value};
use std::fs::{self, OpenOptions};
use std::io::{IsTerminal, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const MAX_STDIN_BUFFER_BYTES: usize = 2 * 1024 * 1024;
pub const OVERSIZE_MARKER: &str = "\0OVERSIZE:";

pub fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn file_mtime_ms(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

pub fn home_dir() -> PathBuf {
    if cfg!(windows) {
        if let Ok(up) = std::env::var("USERPROFILE") {
            if !up.trim().is_empty() {
                return PathBuf::from(up);
            }
        }
    }
    if let Ok(h) = std::env::var("HOME") {
        if !h.trim().is_empty() {
            return PathBuf::from(h);
        }
    }
    if let Ok(up) = std::env::var("USERPROFILE") {
        if !up.trim().is_empty() {
            return PathBuf::from(up);
        }
    }
    PathBuf::from(".")
}

pub fn resolve_abs_path(p: &Path) -> PathBuf {
    if p.is_absolute() {
        clean_lexical_path(p)
    } else {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        clean_lexical_path(&cwd.join(p))
    }
}

pub fn clean_lexical_path(p: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

pub fn write_file_atomic_sync(target_path: &Path, content: &str, _mode: u32) -> bool {
    let Some(raw_str) = target_path.to_str() else {
        return false;
    };
    if is_unc_or_device_path(raw_str) {
        return false;
    }
    let resolved_target = resolve_abs_path(target_path);
    let Some(dir) = resolved_target.parent() else {
        return false;
    };
    let Some(base) = resolved_target.file_name().and_then(|b| b.to_str()) else {
        return false;
    };

    if let Ok(lst) = fs::symlink_metadata(&resolved_target) {
        if lst.file_type().is_symlink() || !lst.file_type().is_file() {
            return false;
        }
    }

    let pid = std::process::id();
    let tmp_name = format!(".{base}.{pid}.{}.tmp", random_hex_4());
    let tmp_path = dir.join(tmp_name);

    let result = (|| -> bool {
        if fs::create_dir_all(dir).is_err() {
            return false;
        }
        let mut opts = OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(_mode);
        }
        let mut f = match opts.open(&tmp_path) {
            Ok(f) => f,
            Err(_) => return false,
        };
        if f.write_all(content.as_bytes()).is_err() {
            return false;
        }
        drop(f);

        let mut renamed = false;
        for attempt in 0..3 {
            match fs::rename(&tmp_path, &resolved_target) {
                Ok(()) => {
                    renamed = true;
                    break;
                }
                Err(err) => {
                    if attempt == 2
                        && matches!(
                            err.kind(),
                            std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::Other
                        )
                    {
                        let is_symlink = fs::symlink_metadata(&resolved_target)
                            .map(|m| m.file_type().is_symlink())
                            .unwrap_or(false);
                        if !is_symlink && fs::write(&resolved_target, content.as_bytes()).is_ok() {
                            renamed = true;
                        }
                    }
                }
            }
        }
        #[cfg(unix)]
        if renamed {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&resolved_target, fs::Permissions::from_mode(_mode));
        }
        renamed
    })();

    let _ = fs::remove_file(&tmp_path);
    result
}

fn percent_decode_utf8(input: &str) -> Result<String, ()> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(());
            }
            let hex_str = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|_| ())?;
            let val = u8::from_str_radix(hex_str, 16).map_err(|_| ())?;
            out.push(val);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| ())
}

pub fn normalize_workspace_key(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return String::new();
    }
    if s.len() >= 7 && s[..7].eq_ignore_ascii_case("file://") {
        let rest = &s[7..];
        let stripped = rest.strip_prefix('/').unwrap_or(rest);
        if let Ok(decoded) = percent_decode_utf8(stripped) {
            s = decoded;
        }
    }
    s = s.replace('\\', "/");
    while s.ends_with('/') {
        s.pop();
    }
    if s.contains('/') {
        s = s
            .rsplit('/')
            .find(|part| !part.is_empty())
            .unwrap_or("")
            .to_string();
    }
    let mut clean = String::with_capacity(s.len());
    let mut prev_dash = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
            if ch == '-' {
                if !prev_dash {
                    clean.push('-');
                    prev_dash = true;
                }
            } else {
                clean.push(ch);
                prev_dash = false;
            }
        } else if !prev_dash {
            clean.push('-');
            prev_dash = true;
        }
    }
    let trimmed = clean.trim_matches('-');
    let sliced = slice_utf16_safe(trimmed, 64).to_ascii_lowercase();
    if sliced.is_empty() || is_dangerous_key(&sliced) {
        return String::new();
    }
    sliced
}

pub fn normalize_persona_mode(raw: &str, fallback: &str) -> String {
    let v = raw.trim().to_ascii_lowercase();
    if matches!(v.as_str(), "off" | "subtle" | "roleplay") {
        v
    } else {
        fallback.to_string()
    }
}

pub fn normalize_safe_id(raw: &str, fallback: &str) -> String {
    let v = raw.trim().to_ascii_lowercase();
    if v.is_empty() || v.len() > 36 || is_dangerous_key(&v) {
        return fallback.to_string();
    }
    if v.bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    {
        v
    } else {
        fallback.to_string()
    }
}

pub fn normalize_safe_label(raw: &str, max_len: usize) -> String {
    let filtered: String = raw
        .chars()
        .filter(|&ch| {
            let code = ch as u32;
            !(code <= 0x1f || code == 0x7f || matches!(ch, '<' | '>' | '`' | '{' | '}'))
        })
        .collect();
    let trimmed = filtered.trim();
    let v = slice_utf16_safe(trimmed, max_len);
    if v.is_empty() || is_dangerous_key(v) {
        String::new()
    } else {
        v.to_string()
    }
}

pub fn normalize_ui_lang(raw: &str) -> String {
    let v = raw.trim().to_ascii_lowercase();
    if v == "en" || v.starts_with("en-") {
        "en".to_string()
    } else if v == "ja" || v.starts_with("ja-") || v == "jp" {
        "ja".to_string()
    } else if matches!(v.as_str(), "vi" | "en" | "ja") {
        v
    } else {
        "vi".to_string()
    }
}

pub fn resolve_hint_paths(root_dir: &Path, explicit_config_path: Option<&Path>) -> Vec<PathBuf> {
    if let Ok(env_hint) = std::env::var("AGY_PERSONA_HINT_PATH") {
        if !env_hint.trim().is_empty() {
            return vec![resolve_abs_path(Path::new(&env_hint))];
        }
    }
    let default_cfg_path = resolve_abs_path(&root_dir.join("theme_config.json"));
    let env_cfg = std::env::var("AGY_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty());
    let cfg_path = if let Some(exp) = explicit_config_path {
        resolve_abs_path(exp)
    } else if let Some(ref ec) = env_cfg {
        resolve_abs_path(Path::new(ec))
    } else {
        default_cfg_path.clone()
    };
    let local_hint = cfg_path
        .parent()
        .unwrap_or(root_dir)
        .join("persona_runtime_hint.json");
    if env_cfg.is_some() || cfg_path != default_cfg_path {
        return vec![local_hint];
    }

    let home = home_dir();
    let canonical = home
        .join(".gemini")
        .join("antigravity")
        .join("persona_runtime_hint.json");
    let mut out = vec![canonical.clone()];
    if local_hint != canonical {
        out.push(local_hint);
    }

    for extra_dir in [
        home.join(".gemini")
            .join("config")
            .join("plugins")
            .join("antigravity-shinobu-theme"),
        home.join(".gemini")
            .join("config")
            .join("skills")
            .join("antigravity-custom-theme"),
    ] {
        if let Ok(lst) = fs::symlink_metadata(&extra_dir) {
            if lst.file_type().is_dir() && !lst.file_type().is_symlink() {
                let cand = extra_dir.join("persona_runtime_hint.json");
                if !out.contains(&cand) {
                    out.push(cand);
                }
            }
        }
    }
    out
}

pub fn read_existing_hint(hint_paths: &[PathBuf]) -> Map<String, Value> {
    let mut best_obj: Option<Map<String, Value>> = None;
    let mut best_updated: f64 = -1.0;

    for p in hint_paths {
        if !is_safe_local_regular_file(p) {
            continue;
        }
        let Ok(raw_str) = fs::read_to_string(p) else {
            continue;
        };
        let stripped_bom = raw_str.strip_prefix('\u{feff}').unwrap_or(&raw_str);
        let Ok(parsed_val) = serde_json::from_str::<Value>(stripped_bom) else {
            continue;
        };
        let cleaned = strip_proto_keys(&parsed_val, 0);
        if let Value::Object(map) = cleaned {
            let ts = map
                .get("updatedAt")
                .and_then(|v| v.as_f64())
                .filter(|n| n.is_finite())
                .unwrap_or_else(|| fs::metadata(p).map(|m| file_mtime_ms(&m)).unwrap_or(0.0));
            if ts >= best_updated {
                best_updated = ts;
                best_obj = Some(map);
            }
        }
    }
    best_obj.unwrap_or_default()
}

pub fn select_freshest_config_object(candidate_paths: &[PathBuf]) -> Map<String, Value> {
    let mut best_cfg: Option<Map<String, Value>> = None;
    let mut best_mtime: f64 = -1.0;

    for cand in candidate_paths {
        if !is_safe_local_regular_file(cand) {
            continue;
        }
        let Ok(st) = fs::metadata(cand) else {
            continue;
        };
        let Ok(raw_str) = fs::read_to_string(cand) else {
            continue;
        };
        let stripped_bom = raw_str.strip_prefix('\u{feff}').unwrap_or(&raw_str);
        let Ok(parsed_val) = serde_json::from_str::<Value>(stripped_bom) else {
            continue;
        };
        let cleaned = strip_proto_keys(&parsed_val, 0);
        if let Value::Object(map) = cleaned {
            if !map.is_empty() {
                let mtime = file_mtime_ms(&st);
                if mtime >= best_mtime {
                    best_mtime = mtime;
                    best_cfg = Some(map);
                }
            }
        }
    }
    best_cfg.unwrap_or_default()
}

/// Exact JS `Math.round(x)` semantics: rounds half towards +infinity (e.g. -2.5 -> -2, 2.5 -> 3).
pub fn js_math_round(x: f64) -> i64 {
    (x + 0.5).floor() as i64
}

pub fn sanitize_compact_profile_entry(entry: &Value) -> Option<Map<String, Value>> {
    let obj = entry.as_object()?;
    let mut out = Map::new();

    if let Some(tn_raw) = obj.get("themeName").and_then(|v| v.as_str()) {
        let tn = normalize_safe_label(tn_raw, 80);
        if !tn.is_empty() {
            out.insert("themeName".to_string(), Value::String(tn));
        }
    }
    if let Some(bn_raw) = obj.get("bubbleName").and_then(|v| v.as_str()) {
        let bn = normalize_safe_label(bn_raw, 80);
        if !bn.is_empty() {
            out.insert("bubbleName".to_string(), Value::String(bn));
        }
    }
    if let Some(mp_raw) = obj.get("masterPersona").and_then(|v| v.as_str()) {
        out.insert(
            "masterPersona".to_string(),
            Value::String(normalize_safe_id(mp_raw, "yoriichi")),
        );
    }
    if let Some(mode_raw) = obj.get("aiPersonaMode").and_then(|v| v.as_str()) {
        let mode = normalize_persona_mode(mode_raw, "");
        if !mode.is_empty() {
            out.insert("aiPersonaMode".to_string(), Value::String(mode));
        }
    }
    if let Some(dim) = obj
        .get("dimming")
        .and_then(|v| v.as_f64())
        .filter(|n| n.is_finite())
    {
        let clamped = js_math_round(dim).clamp(15, 92);
        out.insert("dimming".to_string(), Value::Number(clamped.into()));
    }
    if let Some(fx) = obj
        .get("fxDensity")
        .and_then(|v| v.as_f64())
        .filter(|n| n.is_finite())
    {
        let clamped = js_math_round(fx).clamp(0, 100);
        out.insert("fxDensity".to_string(), Value::Number(clamped.into()));
    }
    if let Some(b) = obj.get("chibiEnabled").and_then(|v| v.as_bool()) {
        out.insert("chibiEnabled".to_string(), Value::Bool(b));
    }
    if let Some(b) = obj.get("chibi3dEnabled").and_then(|v| v.as_bool()) {
        out.insert("chibi3dEnabled".to_string(), Value::Bool(b));
    }
    if let Some(b) = obj.get("chibi2dLive").and_then(|v| v.as_bool()) {
        out.insert("chibi2dLive".to_string(), Value::Bool(b));
    }
    if let Some(b) = obj.get("autoFinisher").and_then(|v| v.as_bool()) {
        out.insert("autoFinisher".to_string(), Value::Bool(b));
    }
    if let Some(b) = obj.get("focusMode").and_then(|v| v.as_bool()) {
        out.insert("focusMode".to_string(), Value::Bool(b));
    }

    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

pub fn sanitize_workspace_profiles_strict(raw_profiles: Option<&Value>) -> Map<String, Value> {
    let mut out = Map::new();
    let Some(obj) = raw_profiles.and_then(|v| v.as_object()) else {
        return out;
    };
    for (raw_k, raw_val) in obj {
        if out.len() >= 48 {
            break;
        }
        let wk = normalize_workspace_key(raw_k);
        if wk.is_empty() {
            continue;
        }
        if let Some(clean_entry) = sanitize_compact_profile_entry(raw_val) {
            out.insert(wk, Value::Object(clean_entry));
        }
    }
    out
}

#[derive(Default, Clone)]
pub struct SyncHintOptions<'a> {
    pub root_dir: Option<&'a Path>,
    pub config_path: Option<&'a Path>,
    pub bound_workspace_key: Option<&'a str>,
    pub direct_switch_workspace_key: Option<&'a str>,
}

pub fn sync_persona_runtime_hint(cfg: &Map<String, Value>, opts: SyncHintOptions<'_>) -> Value {
    let fallback_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let root_dir = opts.root_dir.unwrap_or(&fallback_root);
    let hint_paths = resolve_hint_paths(root_dir, opts.config_path);
    let prev_hint = read_existing_hint(&hint_paths);
    let now = now_epoch_ms();

    let clean_theme = cfg
        .get("themeName")
        .and_then(|v| v.as_str())
        .map(|s| normalize_safe_label(s, 80))
        .unwrap_or_default();
    let theme_name = if !clean_theme.is_empty() {
        clean_theme
    } else {
        prev_hint
            .get("themeName")
            .and_then(|v| v.as_str())
            .map(|s| normalize_safe_label(s, 80))
            .unwrap_or_default()
    };

    let clean_bubble = cfg
        .get("bubbleName")
        .and_then(|v| v.as_str())
        .map(|s| normalize_safe_label(s, 80))
        .unwrap_or_default();
    let bubble_name = if !clean_bubble.is_empty() {
        clean_bubble
    } else if cfg.contains_key("themeName") {
        theme_name.clone()
    } else {
        let prev_b = prev_hint
            .get("bubbleName")
            .and_then(|v| v.as_str())
            .map(|s| normalize_safe_label(s, 80))
            .unwrap_or_default();
        if !prev_b.is_empty() {
            prev_b
        } else {
            theme_name.clone()
        }
    };

    let master_persona = if let Some(mp) = cfg.get("masterPersona") {
        normalize_safe_id(mp.as_str().unwrap_or(""), "yoriichi")
    } else {
        normalize_safe_id(
            prev_hint
                .get("masterPersona")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
            "yoriichi",
        )
    };

    let ai_persona_mode = if let Some(m) = cfg.get("aiPersonaMode") {
        normalize_persona_mode(m.as_str().unwrap_or(""), "")
    } else {
        normalize_persona_mode(
            prev_hint
                .get("aiPersonaMode")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
            "",
        )
    };

    let ui_lang = if let Some(l) = cfg.get("uiLang") {
        normalize_ui_lang(l.as_str().unwrap_or(""))
    } else {
        normalize_ui_lang(
            prev_hint
                .get("uiLang")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        )
    };

    let chibi_enabled = cfg
        .get("chibiEnabled")
        .and_then(|v| v.as_bool())
        .or_else(|| prev_hint.get("chibiEnabled").and_then(|v| v.as_bool()))
        .unwrap_or(true);

    let auto_finisher = cfg
        .get("autoFinisher")
        .and_then(|v| v.as_bool())
        .or_else(|| prev_hint.get("autoFinisher").and_then(|v| v.as_bool()))
        .unwrap_or(true);

    let focus_mode = cfg
        .get("focusMode")
        .and_then(|v| v.as_bool())
        .or_else(|| prev_hint.get("focusMode").and_then(|v| v.as_bool()))
        .unwrap_or(false);

    let privacy_shield_active = cfg
        .get("privacyShieldActive")
        .and_then(|v| v.as_bool())
        .or_else(|| {
            prev_hint
                .get("privacyShieldActive")
                .and_then(|v| v.as_bool())
        })
        .unwrap_or(false);

    let mut is_forged_active = false;
    let mut forged_fx_mode = String::new();
    let mut forged_persona_trait_id = String::new();

    if let Some(forged_obj) = cfg.get("activeForgedTheme").and_then(|v| v.as_object()) {
        let f_name = forged_obj
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| normalize_safe_label(s, 80))
            .unwrap_or_default();
        if f_name.is_empty() || f_name == theme_name {
            is_forged_active = true;
            forged_fx_mode = forged_obj
                .get("fxMode")
                .and_then(|v| v.as_str())
                .map(|s| normalize_safe_id(s, ""))
                .unwrap_or_default();
            let trait_raw = forged_obj
                .get("personaTraitId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .or_else(|| forged_obj.get("forgedByPersona").and_then(|v| v.as_str()))
                .unwrap_or("");
            forged_persona_trait_id = normalize_safe_id(trait_raw, "");
        }
    } else if !cfg.contains_key("activeForgedTheme")
        && !cfg.contains_key("themeName")
        && prev_hint
            .get("isForgedActive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    {
        is_forged_active = true;
        forged_fx_mode = prev_hint
            .get("forgedFxMode")
            .and_then(|v| v.as_str())
            .map(|s| normalize_safe_id(s, ""))
            .unwrap_or_default();
        forged_persona_trait_id = prev_hint
            .get("forgedPersonaTraitId")
            .and_then(|v| v.as_str())
            .map(|s| normalize_safe_id(s, ""))
            .unwrap_or_default();
    }

    let active_workspace = if let Some(aw) = cfg.get("activeWorkspace") {
        normalize_workspace_key(aw.as_str().unwrap_or(""))
    } else {
        normalize_workspace_key(
            prev_hint
                .get("activeWorkspace")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        )
    };

    let workspace_profiles = if cfg
        .get("workspaceProfiles")
        .and_then(|v| v.as_object())
        .is_some()
    {
        sanitize_workspace_profiles_strict(cfg.get("workspaceProfiles"))
    } else {
        sanitize_workspace_profiles_strict(prev_hint.get("workspaceProfiles"))
    };

    let mut workspace_active_overrides = Map::new();
    if let Some(prev_ov) = prev_hint
        .get("workspaceActiveOverrides")
        .and_then(|v| v.as_object())
    {
        for (raw_k, raw_v) in prev_ov.iter().take(32) {
            let wk = normalize_workspace_key(raw_k);
            if wk.is_empty() || !workspace_profiles.contains_key(&wk) {
                continue;
            }
            if let Some(mut clean_entry) = sanitize_compact_profile_entry(raw_v) {
                let ts = raw_v
                    .as_object()
                    .and_then(|o| o.get("updatedAt"))
                    .and_then(|t| t.as_u64())
                    .unwrap_or(now);
                if now.saturating_sub(ts) <= 24 * 3600 * 1000 {
                    clean_entry.insert("updatedAt".to_string(), Value::Number(ts.into()));
                    workspace_active_overrides.insert(wk, Value::Object(clean_entry));
                }
            }
        }
    }

    let bound_ws = normalize_workspace_key(opts.bound_workspace_key.unwrap_or(""));
    if !bound_ws.is_empty() {
        workspace_active_overrides.shift_remove(&bound_ws);
    }

    let direct_ws = normalize_workspace_key(opts.direct_switch_workspace_key.unwrap_or(""));
    if !direct_ws.is_empty() && workspace_profiles.contains_key(&direct_ws) {
        let mut ov = Map::new();
        ov.insert("themeName".to_string(), Value::String(theme_name.clone()));
        ov.insert("bubbleName".to_string(), Value::String(bubble_name.clone()));
        ov.insert(
            "masterPersona".to_string(),
            Value::String(master_persona.clone()),
        );
        if !ai_persona_mode.is_empty() {
            ov.insert(
                "aiPersonaMode".to_string(),
                Value::String(ai_persona_mode.clone()),
            );
        }
        ov.insert("chibiEnabled".to_string(), Value::Bool(chibi_enabled));
        ov.insert("autoFinisher".to_string(), Value::Bool(auto_finisher));
        ov.insert("focusMode".to_string(), Value::Bool(focus_mode));
        ov.insert("updatedAt".to_string(), Value::Number(now.into()));
        workspace_active_overrides.insert(direct_ws, Value::Object(ov));
    }

    let hint_payload = json!({
        "v": 2,
        "themeName": theme_name,
        "bubbleName": bubble_name,
        "masterPersona": master_persona,
        "aiPersonaMode": ai_persona_mode,
        "uiLang": ui_lang,
        "chibiEnabled": chibi_enabled,
        "autoFinisher": auto_finisher,
        "focusMode": focus_mode,
        "privacyShieldActive": privacy_shield_active,
        "isForgedActive": is_forged_active,
        "forgedFxMode": forged_fx_mode,
        "forgedPersonaTraitId": forged_persona_trait_id,
        "activeWorkspace": active_workspace,
        "workspaceProfiles": workspace_profiles,
        "workspaceActiveOverrides": workspace_active_overrides,
        "updatedAt": now
    });

    if let Ok(serialized) = serde_json::to_string(&hint_payload) {
        for target in &hint_paths {
            write_file_atomic_sync(target, &serialized, 0o600);
        }
    }
    hint_payload
}

pub fn read_stdin_json_fast(timeout_ms: u64) -> String {
    if std::io::stdin().is_terminal() {
        return String::new();
    }
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut stdin = std::io::stdin();
        let mut buf = [0u8; 16384];
        let mut accum: Vec<u8> = Vec::with_capacity(8192);
        let mut head_snapshot: Vec<u8> = Vec::new();
        let mut total = 0usize;
        let mut overflowed = false;

        loop {
            match stdin.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = &buf[..n];
                    total += n;
                    if overflowed {
                        // Keep draining stdin until EOF so parent writer never suffers EPIPE
                        continue;
                    }
                    if total > MAX_STDIN_BUFFER_BYTES {
                        overflowed = true;
                        let needed = 65536usize.saturating_sub(accum.len());
                        if needed > 0 {
                            let take = needed.min(chunk.len());
                            accum.extend_from_slice(&chunk[..take]);
                        }
                        accum.truncate(65536);
                        head_snapshot = std::mem::take(&mut accum);
                        continue;
                    }
                    accum.extend_from_slice(chunk);
                    if total <= 262_144 && chunk.contains(&b'}') {
                        if let Ok(s) = std::str::from_utf8(&accum) {
                            let trimmed = s.strip_prefix('\u{feff}').unwrap_or(s).trim();
                            if trimmed.starts_with('{')
                                && trimmed.ends_with('}')
                                && serde_json::from_str::<Value>(trimmed).is_ok()
                            {
                                let _ = tx.send(s.to_string());
                                return;
                            }
                        }
                    }
                }
            }
        }

        if overflowed {
            let head_str = String::from_utf8_lossy(&head_snapshot);
            let _ = tx.send(format!("{OVERSIZE_MARKER}{head_str}"));
        } else {
            let _ = tx.send(String::from_utf8_lossy(&accum).into_owned());
        }
    });

    rx.recv_timeout(Duration::from_millis(timeout_ms))
        .unwrap_or_default()
}

fn unescape_json_string_fragment(raw: &str) -> String {
    let wrapped = format!("\"{raw}\"");
    serde_json::from_str::<String>(&wrapped).unwrap_or_else(|_| raw.to_string())
}

fn has_non_empty_last_user_input(head: &str) -> bool {
    // Equivalent to /"lastUserInput"\s*:\s*"(?!\s*")/ without lookahead
    let needle = "\"lastUserInput\"";
    let mut search_from = 0usize;
    while let Some(pos) = head[search_from..].find(needle) {
        let after_key = &head[search_from + pos + needle.len()..];
        let after_ws = after_key.trim_start();
        if let Some(after_colon) = after_ws.strip_prefix(':') {
            let after_colon_ws = after_colon.trim_start();
            if let Some(inside_str) = after_colon_ws.strip_prefix('"') {
                let inside_trimmed = inside_str.trim_start();
                if !inside_trimmed.starts_with('"') {
                    return true;
                }
            }
        }
        search_from += pos + needle.len();
    }
    false
}

pub fn parse_hook_input_safe(raw_in: &str) -> Option<Map<String, Value>> {
    if raw_in.is_empty() {
        return None;
    }
    if let Some(rest) = raw_in.strip_prefix(OVERSIZE_MARKER) {
        let head = rest.strip_prefix('\u{feff}').unwrap_or(rest);
        let mut out = Map::new();

        if let Ok(re) = regex::Regex::new(r#""conversationId"\s*:\s*"([^"\\]{1,96})""#) {
            if let Some(cap) = re.captures(head) {
                out.insert(
                    "conversationId".to_string(),
                    Value::String(cap[1].to_string()),
                );
            }
        }
        if let Ok(re) = regex::Regex::new(r#""invocationNum"\s*:\s*(\d+)"#) {
            if let Some(cap) = re.captures(head) {
                if let Ok(n) = cap[1].parse::<u64>() {
                    out.insert("invocationNum".to_string(), Value::Number(n.into()));
                }
            }
        }
        if let Ok(re) = regex::Regex::new(r#""transcriptPath"\s*:\s*"((?:[^"\\]|\\.)*)""#) {
            if let Some(cap) = re.captures(head) {
                out.insert(
                    "transcriptPath".to_string(),
                    Value::String(unescape_json_string_fragment(&cap[1])),
                );
            }
        }
        if let Ok(re) = regex::Regex::new(r#""cwd"\s*:\s*"((?:[^"\\]|\\.)*)""#) {
            if let Some(cap) = re.captures(head) {
                out.insert(
                    "cwd".to_string(),
                    Value::String(unescape_json_string_fragment(&cap[1])),
                );
            }
        }
        if let Ok(re) = regex::Regex::new(r#""workspacePaths"\s*:\s*\[\s*"((?:[^"\\]|\\.)*)""#) {
            if let Some(cap) = re.captures(head) {
                out.insert(
                    "workspacePaths".to_string(),
                    Value::Array(vec![Value::String(unescape_json_string_fragment(&cap[1]))]),
                );
            }
        }
        if let Ok(re) = regex::Regex::new(r#""parentConversationId"\s*:\s*"([^"\\]{1,96})""#) {
            if let Some(cap) = re.captures(head) {
                out.insert(
                    "parentConversationId".to_string(),
                    Value::String(cap[1].to_string()),
                );
            }
        }
        if let Ok(re) = regex::Regex::new(r#""isSubagent"\s*:\s*true\b"#) {
            if re.is_match(head) {
                out.insert("isSubagent".to_string(), Value::Bool(true));
            }
        }
        if has_non_empty_last_user_input(head)
            || (!head.contains("\"lastUserInput\"") && out.contains_key("conversationId"))
        {
            out.insert(
                "lastUserInput".to_string(),
                Value::String("[oversize-user-input]".to_string()),
            );
        }
        return if out.is_empty() { None } else { Some(out) };
    }

    let trimmed = raw_in.strip_prefix('\u{feff}').unwrap_or(raw_in).trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed: Value = serde_json::from_str(trimmed).ok()?;
    let cleaned = strip_proto_keys(&parsed, 0);
    match cleaned {
        Value::Object(m) => Some(m),
        _ => None,
    }
}

pub fn prune_stale_persona_states(state_dir: &Path, max_age_ms: u64, max_files: usize) -> usize {
    let Some(dir_str) = state_dir.to_str() else {
        return 0;
    };
    if dir_str.is_empty() || is_unc_or_device_path(dir_str) {
        return 0;
    }
    let Ok(dir_meta) = fs::symlink_metadata(state_dir) else {
        return 0;
    };
    if !dir_meta.file_type().is_dir() || dir_meta.file_type().is_symlink() {
        return 0;
    }

    let now_ms = now_epoch_ms() as f64;
    let mut removed = 0usize;
    let mut entries: Vec<(PathBuf, f64)> = Vec::new();

    if let Ok(rd) = fs::read_dir(state_dir) {
        for entry_res in rd.flatten() {
            let name = entry_res.file_name();
            let Some(name_str) = name.to_str() else {
                continue;
            };
            if !name_str.ends_with(".json") {
                continue;
            }
            let full = entry_res.path();
            let Ok(lst) = fs::symlink_metadata(&full) else {
                continue;
            };
            if !lst.file_type().is_file() || lst.file_type().is_symlink() {
                continue;
            }
            let mtime = file_mtime_ms(&lst);
            if now_ms - mtime > max_age_ms as f64 {
                if fs::remove_file(&full).is_ok() {
                    removed += 1;
                }
            } else {
                entries.push((full, mtime));
            }
        }
    }

    if entries.len() > max_files {
        entries.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        for (p, _) in entries.into_iter().skip(max_files) {
            if fs::remove_file(&p).is_ok() {
                removed += 1;
            }
        }
    }

    removed
}
