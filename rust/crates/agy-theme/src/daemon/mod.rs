pub mod tailer;

use crate::daemon::tailer::{is_dynamic_cid_alias, is_valid_uuid_lower, TranscriptTailer};
use agy_core::build_payload::{compile_payload, BuildPayloadOptions};
use agy_core::cli_ops::cdp_client::{
    extract_url_origin, fetch_json_loopback, is_candidate_antigravity_url, resolve_port_file,
};
use agy_core::cli_ops::proc_scan::is_verified_any_daemon_process;
use agy_core::persona_sync::{
    file_mtime_ms, home_dir, now_epoch_ms, resolve_abs_path, sanitize_workspace_profiles_strict,
    sync_persona_runtime_hint, write_file_atomic_sync, SyncHintOptions,
};
use agy_core::security::{
    generate_ephemeral_token_hex, is_dangerous_key, sort_keys_deep, strip_proto_keys,
    timing_safe_token_match,
};
use futures_util::{SinkExt, StreamExt};
use regex::Regex;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::{self, File, OpenOptions};
use std::io::{IsTerminal, Read, Seek, SeekFrom, Write};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

const MAX_BINDING_PAYLOAD_BYTES: usize = 4 * 1024 * 1024;
const MAX_ACTIVE_FORGED_THEME_BYTES: usize = 1_887_436; // Math.floor(1.8 * 1024 * 1024)
const MAX_SSE_CLIENTS: usize = 32;
const SSE_POLL_INTERVAL_MS: u64 = 350;
const SSE_PING_INTERVAL_MS: u64 = 15_000;
const MAX_LOG_BYTES: u64 = 512 * 1024;
const LOG_STAT_INTERVAL: u64 = 40;
const CDP_SEND_TIMEOUT_MS: u64 = 6_000;
const CONFIG_BROADCAST_DEBOUNCE_MS: u64 = 120;
const ASSET_CSP: &str = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

const DOM_VERIFICATION_PROBE_EXPR: &str = r#"(() => {
    const matched = Boolean(
        document.querySelector('.agy-shell, .monaco-workbench, [data-launchpad], #workbench\\.parts\\.editor') ||
        /Antigravity/i.test(document.title || '') ||
        /^\/(c\/[0-9a-f-]{36}|launchpad)/i.test(location.pathname || '')
    );
    const hasBody = Boolean(document.body);
    const payloadReady = Boolean(
        window.__AGY_THEME_CORE__ &&
        typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === 'function' &&
        window.__AGY_MODAL_OBSERVER__ &&
        document.getElementById('antigravity-custom-theme-active')
    );
    return { matched, hasBody, payloadReady, readyState: document.readyState || 'complete', origin: location.origin || '' };
})()"#;

fn allowed_asset_mime(ext_lower: &str) -> Option<&'static str> {
    match ext_lower {
        ".webp" => Some("image/webp"),
        ".png" => Some("image/png"),
        ".jpg" | ".jpeg" => Some("image/jpeg"),
        ".gif" => Some("image/gif"),
        ".svg" => Some("image/svg+xml; charset=utf-8"),
        _ => None,
    }
}

fn file_uri_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)file:///[^\s&)"']*"#).expect("valid regex"))
}

fn file_enc_uri_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)file%3A%2F%2F[^\s&)"']*"#).expect("valid regex"))
}

fn query_redact_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"([?&])(?i:(?:project|tab|folder|folderUri|workspace|workspaceUri|file|path))=[^\s&)"']*"#)
            .expect("valid regex")
    })
}

fn uuid_any_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
            .expect("valid regex")
    })
}

fn forbidden_prompt_key_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)prompt|instruction|systemmessage").expect("valid regex"))
}

fn format_iso8601_now() -> String {
    let ms = now_epoch_ms();
    let total_secs = (ms / 1000) as i64;
    let millis = ms % 1000;
    let days = total_secs.div_euclid(86_400);
    let secs_of_day = total_secs.rem_euclid(86_400);
    let hour = secs_of_day / 3600;
    let min = (secs_of_day % 3600) / 60;
    let sec = secs_of_day % 60;

    // Civil from days (Howard Hinnant)
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };

    format!("{year:04}-{m:02}-{d:02}T{hour:02}:{min:02}:{sec:02}.{millis:03}Z")
}

fn case_insensitive_replace_all(haystack: &str, needle: &str, replacement: &str) -> String {
    if needle.len() <= 1 {
        return haystack.to_string();
    }
    let escaped = regex::escape(needle);
    if let Ok(re) = Regex::new(&format!("(?i){escaped}")) {
        re.replace_all(haystack, replacement).into_owned()
    } else {
        haystack.to_string()
    }
}

fn redact_log_message(msg: &str, root_dir: &Path) -> String {
    let mut text = file_uri_re()
        .replace_all(msg, "file:///[redacted-path]")
        .into_owned();
    text = file_enc_uri_re()
        .replace_all(&text, "file://[redacted-path]")
        .into_owned();

    let home = home_dir()
        .to_string_lossy()
        .trim_end_matches(['/', '\\'])
        .to_string();
    let root_s = root_dir
        .to_string_lossy()
        .trim_end_matches(['/', '\\'])
        .to_string();
    let mut targets = vec![(home, "~"), (root_s, "[repo-root]")];
    targets.sort_by_key(|a| std::cmp::Reverse(a.0.len()));

    for (raw_p, tok) in targets {
        if raw_p.len() <= 2 {
            continue;
        }
        let fwd = raw_p.replace('\\', "/");
        let back = raw_p.replace('/', "\\");
        text = case_insensitive_replace_all(&text, &fwd, tok);
        text = case_insensitive_replace_all(&text, &back, tok);
    }

    text = query_redact_re()
        .replace_all(&text, "$1[redacted-query]")
        .into_owned();
    uuid_any_re()
        .replace_all(&text, "[redacted-id]")
        .into_owned()
}

#[derive(Clone, Debug)]
enum SessionCmd {
    Reinject {
        sync_from_daemon: bool,
        only_update_new_doc: bool,
    },
    SyncDelta,
    Close,
}

#[derive(Clone)]
struct SessionHandle {
    current_url: Arc<RwLock<String>>,
    verified: Arc<AtomicBool>,
    tx: mpsc::UnboundedSender<SessionCmd>,
}

struct DaemonState {
    root_dir: PathBuf,
    code_root: PathBuf,
    assets_dir: PathBuf,
    payload_path: PathBuf,
    config_file: PathBuf,
    backup_config_file: PathBuf,
    log_file: PathBuf,
    pid_file: PathBuf,
    ephemeral_token: String,
    asset_port: AtomicU16,
    stdout_mirror: bool,
    log_counter: AtomicU64,
    missing_payload_logged: AtomicBool,

    tailer: Mutex<TranscriptTailer>,
    trusted_origins: RwLock<HashSet<String>>,
    ignored_fingerprints: Mutex<VecDeque<String>>,
    sessions: tokio::sync::Mutex<HashMap<String, SessionHandle>>,
    sse_seq: AtomicU64,
    sse_clients: Mutex<VecDeque<(u64, oneshot::Sender<()>)>>,
    last_known_config_hash: Mutex<String>,
    broadcast_tx: mpsc::UnboundedSender<Option<String>>,
}

impl DaemonState {
    fn log(&self, msg: &str) {
        let safe_msg = redact_log_message(msg, &self.root_dir);
        let line = format!("[{}] {safe_msg}\n", format_iso8601_now());

        let cnt = self.log_counter.fetch_add(1, Ordering::Relaxed) + 1;
        if cnt >= LOG_STAT_INTERVAL {
            self.log_counter.store(0, Ordering::Relaxed);
            self.rotate_log_if_needed();
        }

        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file)
        {
            let _ = f.write_all(line.as_bytes());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&self.log_file, fs::Permissions::from_mode(0o600));
        }

        if self.stdout_mirror {
            let mut out = std::io::stdout().lock();
            let _ = out.write_all(line.as_bytes());
            let _ = out.flush();
        }
    }

    fn rotate_log_if_needed(&self) {
        let Ok(st) = fs::metadata(&self.log_file) else {
            return;
        };
        if st.len() <= MAX_LOG_BYTES {
            return;
        }
        let keep_bytes = MAX_LOG_BYTES / 2;
        if let Ok(mut f) = File::open(&self.log_file) {
            let start_pos = st.len().saturating_sub(keep_bytes);
            if f.seek(SeekFrom::Start(start_pos)).is_ok() {
                let mut buf = Vec::with_capacity(keep_bytes as usize);
                if f.read_to_end(&mut buf).is_ok() {
                    let slice = match buf.iter().position(|&b| b == b'\n') {
                        Some(nl) if nl + 1 < buf.len() => &buf[nl + 1..],
                        _ => &buf[..],
                    };
                    let _ = fs::write(&self.log_file, slice);
                }
            }
        }
    }

    fn record_trusted_origin(&self, url_or_origin: &str) {
        if let Some(orig) = extract_url_origin(url_or_origin) {
            if orig.starts_with("vscode-file://")
                || orig.starts_with("http://127.0.0.1")
                || orig.starts_with("https://127.0.0.1")
                || orig.starts_with("http://localhost")
                || orig.starts_with("https://localhost")
                || orig.starts_with("http://[::1]")
                || orig.starts_with("https://[::1]")
            {
                if let Ok(mut set) = self.trusted_origins.write() {
                    set.insert(orig);
                }
            }
        }
    }

    fn remember_ignored_target(&self, target_id: &str, target_url: &str) {
        if let Ok(mut q) = self.ignored_fingerprints.lock() {
            let fp = format!("{target_id}|{target_url}");
            if !q.contains(&fp) {
                if q.len() >= 256 {
                    q.pop_front();
                }
                q.push_back(fp);
            }
        }
    }

    fn is_ignored_target(&self, target_id: &str, target_url: &str) -> bool {
        let fp = format!("{target_id}|{target_url}");
        self.ignored_fingerprints
            .lock()
            .map(|q| q.contains(&fp))
            .unwrap_or(false)
    }

    async fn has_verified_opaque_origin_session(&self) -> bool {
        let sessions = self.sessions.lock().await;
        for s in sessions.values() {
            if !s.verified.load(Ordering::Relaxed) {
                continue;
            }
            if let Ok(u) = s.current_url.read() {
                let lower = u.trim().to_ascii_lowercase();
                if lower.starts_with("file:") || lower.starts_with("vscode-file:") {
                    return true;
                }
            }
        }
        false
    }

    async fn is_origin_allowed_for_api(&self, origin_header: Option<&str>) -> bool {
        let Some(raw) = origin_header else {
            return true;
        };
        let origin = raw.trim();
        if origin.is_empty() || origin == "vscode-file://vscode-app" {
            return true;
        }
        if origin == "null" {
            return self.has_verified_opaque_origin_session().await;
        }
        self.trusted_origins
            .read()
            .map(|set| set.contains(origin))
            .unwrap_or(false)
    }

    fn read_config(&self) -> Map<String, Value> {
        for cand in [&self.config_file, &self.backup_config_file] {
            if !cand.exists() {
                continue;
            }
            let Ok(raw) = fs::read_to_string(cand) else {
                continue;
            };
            let stripped = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
            let Ok(val) = serde_json::from_str::<Value>(stripped) else {
                continue;
            };
            if let Some(mut parsed) = sanitize_config_server_side(&val) {
                if !parsed.is_empty() {
                    if parsed.get("activeForgedTheme") == Some(&Value::Null) {
                        parsed.shift_remove("activeForgedTheme");
                    }
                    if cand == &self.backup_config_file && !self.config_file.exists() {
                        let sorted = sort_keys_deep(&Value::Object(parsed.clone()), 0);
                        if let Ok(restored_str) = serde_json::to_string_pretty(&sorted) {
                            write_file_atomic_sync(&self.config_file, &restored_str, 0o600);
                            let _ = sync_persona_runtime_hint(
                                &parsed,
                                SyncHintOptions {
                                    root_dir: Some(&self.root_dir),
                                    config_path: Some(&self.config_file),
                                    bound_workspace_key: None,
                                    direct_switch_workspace_key: None,
                                },
                            );
                            self.log(
                                "Restored theme_config.json from immutable backup after update.",
                            );
                        }
                    }
                    return parsed;
                }
            }
        }
        Map::new()
    }

    fn save_config(&self, incoming: &Value) -> Option<(bool, Map<String, Value>)> {
        let cleaned_next = sanitize_config_server_side(incoming)?;
        let mut prev_raw = self.read_config();
        if prev_raw.get("activeForgedTheme") == Some(&Value::Null) {
            prev_raw.shift_remove("activeForgedTheme");
        }
        let prev_norm_val = sort_keys_deep(&Value::Object(prev_raw), 0);
        let prev_norm = prev_norm_val.as_object().cloned().unwrap_or_default();
        let prev_serialized = serde_json::to_string_pretty(&prev_norm_val).ok()?;

        let mut merged_raw = prev_norm.clone();
        for (k, v) in cleaned_next {
            merged_raw.insert(k, v);
        }
        if merged_raw.get("activeForgedTheme") == Some(&Value::Null) {
            merged_raw.shift_remove("activeForgedTheme");
        }
        let merged_val = sort_keys_deep(&Value::Object(merged_raw), 0);
        let merged = merged_val.as_object()?.clone();
        let serialized = serde_json::to_string_pretty(&merged_val).ok()?;

        if prev_serialized == serialized {
            let _ = sync_persona_runtime_hint(
                &merged,
                SyncHintOptions {
                    root_dir: Some(&self.root_dir),
                    config_path: Some(&self.config_file),
                    bound_workspace_key: None,
                    direct_switch_workspace_key: None,
                },
            );
            return Some((false, merged));
        }

        write_file_atomic_sync(&self.config_file, &serialized, 0o600);
        let new_hash = hex::encode(Sha256::digest(serialized.as_bytes()));
        if let Ok(mut h) = self.last_known_config_hash.lock() {
            *h = new_hash;
        }

        let persona_fields_changed = merged.get("themeName") != prev_norm.get("themeName")
            || merged.get("bubbleName") != prev_norm.get("bubbleName")
            || merged.get("masterPersona") != prev_norm.get("masterPersona")
            || merged.get("aiPersonaMode") != prev_norm.get("aiPersonaMode")
            || merged.get("focusMode") != prev_norm.get("focusMode")
            || merged.get("chibiEnabled") != prev_norm.get("chibiEnabled");
        let active_ws = merged
            .get("activeWorkspace")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let _ = sync_persona_runtime_hint(
            &merged,
            SyncHintOptions {
                root_dir: Some(&self.root_dir),
                config_path: Some(&self.config_file),
                bound_workspace_key: None,
                direct_switch_workspace_key: if persona_fields_changed {
                    Some(active_ws)
                } else {
                    None
                },
            },
        );

        write_file_atomic_sync(&self.backup_config_file, &serialized, 0o600);
        Some((true, merged))
    }

    fn compute_current_disk_config_hash(&self) -> String {
        if !self.config_file.exists() {
            return String::new();
        }
        let sorted = sort_keys_deep(&Value::Object(self.read_config()), 0);
        match serde_json::to_string_pretty(&sorted) {
            Ok(s) => hex::encode(Sha256::digest(s.as_bytes())),
            Err(_) => String::new(),
        }
    }

    fn check_external_config_update(&self) {
        let cur_hash = self.compute_current_disk_config_hash();
        if cur_hash.is_empty() {
            return;
        }
        let mut changed = false;
        if let Ok(mut prev) = self.last_known_config_hash.lock() {
            if prev.is_empty() {
                *prev = cur_hash;
                return;
            }
            if *prev != cur_hash {
                *prev = cur_hash;
                changed = true;
            }
        }
        if changed {
            self.log(
                "Detected external theme_config.json update (MCP / Hook); syncing live delta.",
            );
            let cfg = self.read_config();
            let _ = sync_persona_runtime_hint(
                &cfg,
                SyncHintOptions {
                    root_dir: Some(&self.root_dir),
                    config_path: Some(&self.config_file),
                    bound_workspace_key: None,
                    direct_switch_workspace_key: None,
                },
            );
            let _ = self.broadcast_tx.send(None);
        }
    }

    fn ensure_payload_built(&self) {
        if self.payload_path.exists() {
            return;
        }
        let themes_p = self.code_root.join("themes").join("themes.json");
        let engine_p = self.code_root.join("engine").join("core.js");
        if themes_p.is_file() && engine_p.is_file() {
            match compile_payload(&BuildPayloadOptions {
                themes_path: themes_p,
                engine_path: engine_p,
                out_path: self.payload_path.clone(),
                inline_all: false,
                help: false,
            }) {
                Ok(_) => self.log("[update-guard] Auto-rebuilt missing dist/theme_payload.js."),
                Err(e) => self.log(&format!("[update-guard] Auto-rebuild failed: {e}")),
            }
        }
    }

    fn build_runtime_wrapped_source(&self, sync_from_daemon: bool) -> Option<String> {
        if !self.payload_path.exists() {
            self.ensure_payload_built();
        }
        let Ok(raw_payload) = fs::read_to_string(&self.payload_path) else {
            if !self.missing_payload_logged.swap(true, Ordering::Relaxed) {
                self.log(&format!(
                    "Payload not built yet ({}). Run: agy-theme build-payload",
                    self.payload_path.display()
                ));
            }
            return None;
        };
        self.missing_payload_logged.store(false, Ordering::Relaxed);
        let payload_code = raw_payload.strip_prefix('\u{feff}').unwrap_or(&raw_payload);
        let current_cfg = self.read_config();
        let port = self.asset_port.load(Ordering::Relaxed);
        let asset_base = if port > 0 {
            format!("http://127.0.0.1:{port}/")
        } else {
            String::new()
        };
        let boot_obj = json!({
            "token": self.ephemeral_token,
            "authToken": self.ephemeral_token,
            "assetBase": asset_base,
            "initialConfig": current_cfg,
            "syncFromDaemon": sync_from_daemon,
        });
        let boot_json = serde_json::to_string(&boot_obj).ok()?;
        Some(format!(
            "(() => {{\nconst __AGY_INJECT_BOOT__ = Object.freeze({boot_json});\n{payload_code}\n}})();"
        ))
    }

    fn build_delta_config_sync_source(&self) -> Option<String> {
        let current_cfg = self.read_config();
        let delta_obj = json!({
            "syncFromDaemon": true,
            "config": current_cfg,
        });
        let delta_payload = serde_json::to_string(&delta_obj)
            .ok()?
            .replace("</", "<\\/")
            .replace('\u{2028}', "\\u2028")
            .replace('\u{2029}', "\\u2029");
        Some(format!(
            "(() => {{\nconst delta = {delta_payload};\nif (typeof window !== 'undefined' && window.__AGY_THEME_CORE__ && typeof window.__AGY_THEME_CORE__.applyDaemonDelta === 'function') {{\n  return Boolean(window.__AGY_THEME_CORE__.applyDaemonDelta(delta.config));\n}}\nreturn false;\n}})()"
        ))
    }
}

fn strip_prompt_keys_deep(val: &Value, depth: usize) -> Value {
    if depth > 8 {
        return val.clone();
    }
    match val {
        Value::Array(arr) => Value::Array(
            arr.iter()
                .take(250)
                .map(|x| strip_prompt_keys_deep(x, depth + 1))
                .collect(),
        ),
        Value::Object(map) => {
            let mut out = Map::with_capacity(map.len());
            for (k, v) in map {
                if is_dangerous_key(k) || forbidden_prompt_key_re().is_match(k) {
                    continue;
                }
                out.insert(k.clone(), strip_prompt_keys_deep(v, depth + 1));
            }
            Value::Object(out)
        }
        _ => val.clone(),
    }
}

pub fn sanitize_config_server_side(raw: &Value) -> Option<Map<String, Value>> {
    let cleaned = strip_prompt_keys_deep(&strip_proto_keys(raw, 0), 0);
    let src = cleaned.as_object()?;
    let mut out = Map::new();

    for (key, val) in src {
        if key.is_empty()
            || key.len() > 64
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-'))
        {
            continue;
        }
        if matches!(
            key.as_str(),
            "__agyToken" | "authToken" | "token" | "config"
        ) || forbidden_prompt_key_re().is_match(key)
        {
            continue;
        }

        if key == "workspaceProfiles" {
            let sanitized = sanitize_workspace_profiles_strict(Some(val));
            out.insert("workspaceProfiles".to_string(), Value::Object(sanitized));
            continue;
        }
        if key == "aiPersonaMode" {
            if let Some(s) = val.as_str() {
                let m = s.trim().to_ascii_lowercase();
                if matches!(m.as_str(), "off" | "subtle" | "roleplay") {
                    out.insert("aiPersonaMode".to_string(), Value::String(m));
                }
            }
            continue;
        }
        if key == "personaTraitId" {
            if let Some(s) = val.as_str() {
                let m = s.trim().to_ascii_lowercase();
                if !m.is_empty()
                    && m.len() <= 36
                    && m.bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
                {
                    out.insert("personaTraitId".to_string(), Value::String(m));
                }
            }
            continue;
        }
        if key == "activeForgedTheme" {
            if val.is_null() {
                out.insert("activeForgedTheme".to_string(), Value::Null);
            } else if val.is_object() {
                if let Ok(s) = serde_json::to_string(val) {
                    if s.len() <= MAX_ACTIVE_FORGED_THEME_BYTES {
                        out.insert("activeForgedTheme".to_string(), val.clone());
                    }
                }
            }
            continue;
        }
        if matches!(key.as_str(), "customWp" | "userAvatar" | "agentAvatar") {
            if let Some(s) = val.as_str() {
                let has_bad = s.chars().any(|c| {
                    matches!(
                        c,
                        '"' | '\''
                            | '('
                            | ')'
                            | '\\'
                            | '\r'
                            | '\n'
                            | '\0'
                            | '<'
                            | '>'
                            | '`'
                            | '{'
                            | '}'
                    )
                });
                if !has_bad && s.len() <= (3.5 * 1024.0 * 1024.0) as usize {
                    out.insert(key.clone(), Value::String(s.trim().to_string()));
                }
            }
            continue;
        }

        match val {
            Value::Bool(b) => {
                out.insert(key.clone(), Value::Bool(*b));
            }
            Value::Number(n) if n.as_f64().map(|f| f.is_finite()).unwrap_or(false) => {
                out.insert(key.clone(), Value::Number(n.clone()));
            }
            Value::String(s) if s.encode_utf16().count() <= 8192 && !s.contains('\0') => {
                out.insert(key.clone(), Value::String(s.clone()));
            }
            Value::Null => {
                out.insert(key.clone(), Value::Null);
            }
            Value::Array(_) | Value::Object(_) => {
                if let Ok(sub_json) = serde_json::to_string(val) {
                    if sub_json.len() <= 512 * 1024 {
                        out.insert(key.clone(), val.clone());
                    }
                }
            }
            _ => {}
        }
    }
    Some(out)
}

/* ============================================================================
 * HTTP/1.1 & SSE ASSET/TELEMETRY SERVER
 * ============================================================================ */

fn percent_decode_path(raw: &str) -> Result<String, ()> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(());
            }
            let hx = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|_| ())?;
            let b = u8::from_str_radix(hx, 16).map_err(|_| ())?;
            out.push(b);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| ())
}

fn parse_query_param(query: &str, target_key: &str) -> Option<String> {
    for part in query.split('&') {
        if part.is_empty() {
            continue;
        }
        let (k, v) = match part.split_once('=') {
            Some((k, v)) => (k, v),
            None => (part, ""),
        };
        if k == target_key {
            let plus_decoded = v.replace('+', " ");
            return percent_decode_path(&plus_decoded).ok();
        }
    }
    None
}

async fn write_http_response(
    stream: &mut TcpStream,
    status_line: &str,
    headers: &[(&str, String)],
    body: &[u8],
) {
    let mut head = format!("HTTP/1.1 {status_line}\r\n");
    let mut has_len = false;
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("content-length") {
            has_len = true;
        }
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    if !has_len {
        head.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    head.push_str("Connection: close\r\n\r\n");
    let _ = stream.write_all(head.as_bytes()).await;
    if !body.is_empty() {
        let _ = stream.write_all(body).await;
    }
    let _ = stream.flush().await;
}

fn build_api_cors_headers(
    origin_hdr: Option<&str>,
    has_pna_req: bool,
) -> Vec<(&'static str, String)> {
    let mut h = vec![
        ("Access-Control-Allow-Headers", "X-Agy-Token".to_string()),
        ("Access-Control-Allow-Methods", "GET, OPTIONS".to_string()),
        (
            "Vary",
            "Origin, Access-Control-Request-Private-Network".to_string(),
        ),
        ("X-Content-Type-Options", "nosniff".to_string()),
        ("Cache-Control", "no-store".to_string()),
    ];
    if let Some(orig) = origin_hdr {
        let t = orig.trim();
        if !t.is_empty() {
            h.push(("Access-Control-Allow-Origin", t.to_string()));
        }
    }
    if has_pna_req {
        h.push(("Access-Control-Allow-Private-Network", "true".to_string()));
    }
    h
}

async fn handle_sse_stream(
    mut stream: TcpStream,
    state: Arc<DaemonState>,
    raw_cid: String,
    mut api_headers: Vec<(&'static str, String)>,
) {
    let is_dynamic = is_dynamic_cid_alias(&raw_cid);
    if !is_dynamic && !is_valid_uuid_lower(&raw_cid) {
        let body = b"{\"ok\":false,\"reason\":\"invalid_cid\"}";
        api_headers.push((
            "Content-Type",
            "application/json; charset=utf-8".to_string(),
        ));
        write_http_response(&mut stream, "400 Bad Request", &api_headers, body).await;
        return;
    }

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    let my_sse_id = state.sse_seq.fetch_add(1, Ordering::Relaxed) + 1;
    if let Ok(mut clients) = state.sse_clients.lock() {
        while clients.len() >= MAX_SSE_CLIENTS {
            if let Some((_, old_cancel)) = clients.pop_front() {
                let _ = old_cancel.send(());
            }
        }
        clients.push_back((my_sse_id, cancel_tx));
    }

    api_headers.retain(|(k, _)| !k.eq_ignore_ascii_case("cache-control"));
    api_headers.push((
        "Content-Type",
        "text/event-stream; charset=utf-8".to_string(),
    ));
    api_headers.push(("Cache-Control", "no-cache, no-transform".to_string()));
    api_headers.push(("Connection", "keep-alive".to_string()));

    let mut head = String::from("HTTP/1.1 200 OK\r\n");
    for (k, v) in &api_headers {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    if stream.write_all(head.as_bytes()).await.is_err() {
        if let Ok(mut clients) = state.sse_clients.lock() {
            clients.retain(|(id, _)| *id != my_sse_id);
        }
        return;
    }

    let mut last_json = String::new();
    let mut last_pushed_rev: Option<u64> = None;
    let mut last_resolved_cid: Option<String> = if is_dynamic {
        state
            .tailer
            .lock()
            .ok()
            .and_then(|mut t| t.resolve_latest_conversation_id())
    } else {
        Some(raw_cid.clone())
    };

    let push_once = |state: &DaemonState,
                     target_cid: &str,
                     last_json: &mut String,
                     last_rev: &mut Option<u64>|
     -> Option<String> {
        let mut tailer = state.tailer.lock().ok()?;
        let (snap, rev_opt) = tailer.get_conversation_snapshot(target_cid);
        if rev_opt.is_some() {
            *last_rev = rev_opt;
        }
        let s = serde_json::to_string(&snap).ok()?;
        if s != *last_json {
            *last_json = s.clone();
            Some(format!("data: {s}\n\n"))
        } else {
            None
        }
    };

    let initial_target = last_resolved_cid.as_deref().unwrap_or(&raw_cid);
    if let Some(frame) = push_once(&state, initial_target, &mut last_json, &mut last_pushed_rev) {
        if stream.write_all(frame.as_bytes()).await.is_err() {
            if let Ok(mut clients) = state.sse_clients.lock() {
                clients.retain(|(id, _)| *id != my_sse_id);
            }
            return;
        }
    }

    let mut poll_tick = tokio::time::interval(Duration::from_millis(SSE_POLL_INTERVAL_MS));
    poll_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    poll_tick.tick().await;

    let mut ping_tick = tokio::time::interval(Duration::from_millis(SSE_PING_INTERVAL_MS));
    ping_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    ping_tick.tick().await;

    let mut peer_eof_buf = [0u8; 32];

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                break;
            }
            rd = stream.read(&mut peer_eof_buf) => {
                match rd {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {}
                }
            }
            _ = ping_tick.tick() => {
                if stream.write_all(b": ping\n\n").await.is_err() {
                    break;
                }
            }
            _ = poll_tick.tick() => {
                let mut should_push_target: Option<String> = None;
                if is_dynamic {
                    let next_cid = state
                        .tailer
                        .lock()
                        .ok()
                        .and_then(|mut t| t.resolve_latest_conversation_id());
                    let check_rev = if next_cid == last_resolved_cid {
                        last_pushed_rev
                    } else {
                        None
                    };
                    let active = next_cid.as_deref().map(|nc| {
                        state
                            .tailer
                            .lock()
                            .map(|t| t.has_conversation_activity(nc, check_rev))
                            .unwrap_or(false)
                    }).unwrap_or(false);
                    if next_cid != last_resolved_cid || active {
                        last_resolved_cid = next_cid.clone();
                        should_push_target = Some(next_cid.unwrap_or_else(|| raw_cid.clone()));
                    }
                } else {
                    let active = state
                        .tailer
                        .lock()
                        .map(|t| t.has_conversation_activity(&raw_cid, last_pushed_rev))
                        .unwrap_or(false);
                    if active {
                        should_push_target = Some(raw_cid.clone());
                    }
                }

                if let Some(target_cid) = should_push_target {
                    if let Some(frame) = push_once(&state, &target_cid, &mut last_json, &mut last_pushed_rev) {
                        if stream.write_all(frame.as_bytes()).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }

    if let Ok(mut clients) = state.sse_clients.lock() {
        clients.retain(|(id, _)| *id != my_sse_id);
    }
}

async fn handle_http_connection(mut stream: TcpStream, peer: SocketAddr, state: Arc<DaemonState>) {
    if !peer.ip().is_loopback() {
        write_http_response(
            &mut stream,
            "403 Forbidden",
            &[
                ("Content-Type", "text/plain; charset=utf-8".to_string()),
                ("X-Content-Type-Options", "nosniff".to_string()),
            ],
            b"Forbidden",
        )
        .await;
        return;
    }

    let mut req_buf = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    let hdr_end_opt = tokio::time::timeout(Duration::from_millis(4000), async {
        loop {
            let Ok(n) = stream.read(&mut chunk).await else {
                return None;
            };
            if n == 0 {
                return None;
            }
            req_buf.extend_from_slice(&chunk[..n]);
            if let Some(pos) = req_buf.windows(4).position(|w| w == b"\r\n\r\n") {
                return Some(pos);
            }
            if req_buf.len() > 32768 {
                return None;
            }
        }
    })
    .await
    .ok()
    .flatten();

    let Some(hdr_end) = hdr_end_opt else {
        return;
    };
    let Ok(hdr_text) = std::str::from_utf8(&req_buf[..hdr_end]) else {
        return;
    };
    let mut lines = hdr_text.split("\r\n");
    let Some(req_line) = lines.next() else {
        return;
    };
    let mut req_parts = req_line.split_whitespace();
    let method = req_parts.next().unwrap_or("");
    let raw_url = req_parts.next().unwrap_or("/");

    let mut headers_map = HashMap::<String, String>::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers_map.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let port = state.asset_port.load(Ordering::Relaxed);
    let expected_host = format!("127.0.0.1:{port}");
    if port == 0 || headers_map.get("host").map(|s| s.as_str()) != Some(expected_host.as_str()) {
        write_http_response(
            &mut stream,
            "403 Forbidden",
            &[
                ("Content-Type", "text/plain; charset=utf-8".to_string()),
                ("X-Content-Type-Options", "nosniff".to_string()),
            ],
            b"Forbidden",
        )
        .await;
        return;
    }

    let (raw_path_enc, query_str) = match raw_url.split_once('?') {
        Some((p, q)) => (p, q.split('#').next().unwrap_or("")),
        None => (raw_url.split('#').next().unwrap_or("/"), ""),
    };

    let Ok(raw_pathname) = percent_decode_path(raw_path_enc) else {
        write_http_response(
            &mut stream,
            "400 Bad Request",
            &[
                ("Content-Type", "text/plain; charset=utf-8".to_string()),
                ("X-Content-Type-Options", "nosniff".to_string()),
            ],
            b"Bad Request",
        )
        .await;
        return;
    };

    if raw_pathname.contains('\0') {
        write_http_response(
            &mut stream,
            "400 Bad Request",
            &[
                ("Content-Type", "text/plain; charset=utf-8".to_string()),
                ("X-Content-Type-Options", "nosniff".to_string()),
            ],
            b"Bad Request",
        )
        .await;
        return;
    }

    let has_pna = headers_map.contains_key("access-control-request-private-network");

    if raw_pathname == "/__telemetry" || raw_pathname == "/__events" {
        let origin_hdr = headers_map.get("origin").map(|s| s.as_str());
        if !state.is_origin_allowed_for_api(origin_hdr).await {
            write_http_response(
                &mut stream,
                "403 Forbidden",
                &[
                    ("Content-Type", "text/plain; charset=utf-8".to_string()),
                    ("Vary", "Origin".to_string()),
                    ("X-Content-Type-Options", "nosniff".to_string()),
                ],
                b"Forbidden",
            )
            .await;
            return;
        }

        let mut api_headers = build_api_cors_headers(origin_hdr, has_pna);

        if method == "OPTIONS" {
            write_http_response(&mut stream, "204 No Content", &api_headers, b"").await;
            return;
        }
        if method != "GET" {
            api_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
            write_http_response(
                &mut stream,
                "405 Method Not Allowed",
                &api_headers,
                b"Method Not Allowed",
            )
            .await;
            return;
        }

        let token_hdr = headers_map
            .get("x-agy-token")
            .map(|s| s.as_str())
            .unwrap_or("");
        if !timing_safe_token_match(token_hdr, &state.ephemeral_token) {
            api_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
            write_http_response(&mut stream, "403 Forbidden", &api_headers, b"Forbidden").await;
            return;
        }

        let cid = parse_query_param(query_str, "cid")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();

        if raw_pathname == "/__events" {
            handle_sse_stream(stream, state, cid, api_headers).await;
            return;
        }

        let payload = state
            .tailer
            .lock()
            .map(|mut t| t.get_conversation_snapshot(&cid).0)
            .unwrap_or_else(|_| json!({ "ok": false, "reason": "internal_error" }));
        let body_str = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
        api_headers.push((
            "Content-Type",
            "application/json; charset=utf-8".to_string(),
        ));
        write_http_response(&mut stream, "200 OK", &api_headers, body_str.as_bytes()).await;
        return;
    }

    let mut asset_headers = vec![
        ("Access-Control-Allow-Origin", "*".to_string()),
        ("Cross-Origin-Resource-Policy", "cross-origin".to_string()),
        ("Vary", "Access-Control-Request-Private-Network".to_string()),
        ("X-Content-Type-Options", "nosniff".to_string()),
        ("Content-Security-Policy", ASSET_CSP.to_string()),
        ("Cache-Control", "no-cache".to_string()),
    ];
    if has_pna {
        asset_headers.push(("Access-Control-Allow-Private-Network", "true".to_string()));
    }

    let Some(after_assets) = raw_pathname.strip_prefix("/assets/") else {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "403 Forbidden", &asset_headers, b"Forbidden").await;
        return;
    };

    if method == "OPTIONS" {
        asset_headers.push((
            "Access-Control-Allow-Methods",
            "GET, HEAD, OPTIONS".to_string(),
        ));
        write_http_response(&mut stream, "204 No Content", &asset_headers, b"").await;
        return;
    }
    if method != "GET" && method != "HEAD" {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(
            &mut stream,
            "405 Method Not Allowed",
            &asset_headers,
            b"Method Not Allowed",
        )
        .await;
        return;
    }

    let sub_asset_rel = after_assets.trim_start_matches(['/', '\\']);
    if sub_asset_rel.is_empty() {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "404 Not Found", &asset_headers, b"Not Found").await;
        return;
    }

    // Reject path traversal segments with allowed asset extension before canonicalization -> 403 Forbidden
    let ext_lower = Path::new(sub_asset_rel)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| format!(".{}", s.to_ascii_lowercase()))
        .unwrap_or_default();
    let Some(content_type) = allowed_asset_mime(&ext_lower) else {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "403 Forbidden", &asset_headers, b"Forbidden").await;
        return;
    };

    let Ok(real_assets_root) = fs::canonicalize(&state.assets_dir) else {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "404 Not Found", &asset_headers, b"Not Found").await;
        return;
    };

    let candidate_path = state.assets_dir.join(sub_asset_rel);
    let Ok(real_file) = fs::canonicalize(&candidate_path) else {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "404 Not Found", &asset_headers, b"Not Found").await;
        return;
    };

    let inside = real_file
        .strip_prefix(&real_assets_root)
        .map(|rel| !rel.as_os_str().is_empty())
        .unwrap_or(false);
    if !inside {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "403 Forbidden", &asset_headers, b"Forbidden").await;
        return;
    }

    let Ok(stat) = fs::metadata(&real_file) else {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "404 Not Found", &asset_headers, b"Not Found").await;
        return;
    };
    if !stat.is_file() {
        asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
        write_http_response(&mut stream, "404 Not Found", &asset_headers, b"Not Found").await;
        return;
    }

    let etag = format!("\"{}-{}\"", stat.len(), file_mtime_ms(&stat).floor() as u64);
    if headers_map.get("if-none-match").map(|s| s.as_str()) == Some(etag.as_str()) {
        asset_headers.push(("ETag", etag));
        write_http_response(&mut stream, "304 Not Modified", &asset_headers, b"").await;
        return;
    }

    asset_headers.push(("Content-Type", content_type.to_string()));
    asset_headers.push(("Content-Length", stat.len().to_string()));
    asset_headers.push(("ETag", etag));

    if method == "HEAD" {
        write_http_response(&mut stream, "200 OK", &asset_headers, b"").await;
        return;
    }

    match tokio::fs::read(&real_file).await {
        Ok(bytes) => {
            write_http_response(&mut stream, "200 OK", &asset_headers, &bytes).await;
        }
        Err(_) => {
            asset_headers.push(("Content-Type", "text/plain; charset=utf-8".to_string()));
            write_http_response(
                &mut stream,
                "500 Internal Server Error",
                &asset_headers,
                b"",
            )
            .await;
        }
    }
}

/* ============================================================================
 * CDP WEBSOCKET ACTOR SESSION PER VERIFIED IDE PAGE
 * ============================================================================ */

type PendingRpcMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;

struct CdpRpcClient {
    out_tx: mpsc::UnboundedSender<String>,
    pending: PendingRpcMap,
    next_id: AtomicU64,
}

impl CdpRpcClient {
    async fn send(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let (tx, rx) = oneshot::channel();
        if let Ok(mut map) = self.pending.lock() {
            map.insert(id, tx);
        }
        let msg = json!({
            "id": id,
            "method": method,
            "params": params
        });
        let serialized = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        if self.out_tx.send(serialized).is_err() {
            if let Ok(mut map) = self.pending.lock() {
                map.remove(&id);
            }
            return Err("WebSocket is not open".to_string());
        }

        match tokio::time::timeout(Duration::from_millis(CDP_SEND_TIMEOUT_MS), rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => Err("WebSocket closed".to_string()),
            Err(_) => {
                if let Ok(mut map) = self.pending.lock() {
                    map.remove(&id);
                }
                Err(format!("CDP timeout ({method})"))
            }
        }
    }
}

struct ProbeInfo {
    payload_ready: bool,
}

async fn verify_dom_is_antigravity(
    rpc: &CdpRpcClient,
    state: &DaemonState,
    current_url: &str,
    max_attempts: usize,
    delay_ms: u64,
    ignore_ready_state: bool,
    require_ready_dom: bool,
) -> Option<ProbeInfo> {
    for attempt in 0..max_attempts {
        let eval_res = rpc
            .send(
                "Runtime.evaluate",
                json!({
                    "expression": DOM_VERIFICATION_PROBE_EXPR,
                    "returnByValue": true,
                    "awaitPromise": false
                }),
            )
            .await
            .ok()?;

        let val = eval_res.get("result").and_then(|r| r.get("value"));
        if let Some(obj) = val.and_then(|v| v.as_object()) {
            let matched = obj.get("matched").and_then(|v| v.as_bool()) == Some(true);
            let payload_ready = obj.get("payloadReady").and_then(|v| v.as_bool()) == Some(true);
            let ready_state = obj
                .get("readyState")
                .and_then(|v| v.as_str())
                .unwrap_or("complete");

            if matched {
                if require_ready_dom
                    && ready_state == "loading"
                    && !payload_ready
                    && attempt + 1 < max_attempts
                {
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    continue;
                }
                if let Some(orig) = obj.get("origin").and_then(|v| v.as_str()) {
                    if !orig.is_empty() && orig != "null" {
                        state.record_trusted_origin(orig);
                    }
                }
                state.record_trusted_origin(current_url);
                return Some(ProbeInfo { payload_ready });
            }

            if attempt + 1 < max_attempts && (ignore_ready_state || ready_state == "loading") {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                continue;
            }
        } else if attempt + 1 < max_attempts && ignore_ready_state {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            continue;
        }
        break;
    }
    None
}

async fn refresh_new_document_script(
    rpc: &CdpRpcClient,
    state: &DaemonState,
    eval_script_id: &mut Option<String>,
    last_doc_hash: &mut String,
) -> bool {
    let Some(doc_src) = state.build_runtime_wrapped_source(false) else {
        return false;
    };
    let next_hash = hex::encode(Sha256::digest(doc_src.as_bytes()));
    if next_hash == *last_doc_hash && eval_script_id.is_some() {
        return true;
    }
    if let Some(old_id) = eval_script_id.take() {
        let _ = rpc
            .send(
                "Page.removeScriptToEvaluateOnNewDocument",
                json!({ "identifier": old_id }),
            )
            .await;
    }
    if let Ok(add_res) = rpc
        .send(
            "Page.addScriptToEvaluateOnNewDocument",
            json!({ "source": doc_src }),
        )
        .await
    {
        *eval_script_id = add_res
            .get("identifier")
            .and_then(|v| v.as_str())
            .map(String::from);
        *last_doc_hash = next_hash;
        return true;
    }
    false
}

fn spawn_cdp_session(
    target_id: String,
    target_url: String,
    ws_url: String,
    state: Arc<DaemonState>,
) -> SessionHandle {
    let current_url = Arc::new(RwLock::new(target_url.clone()));
    let verified = Arc::new(AtomicBool::new(false));
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<SessionCmd>();

    let handle = SessionHandle {
        current_url: current_url.clone(),
        verified: verified.clone(),
        tx: cmd_tx.clone(),
    };

    tokio::spawn(async move {
        let ws_conn = tokio::time::timeout(
            Duration::from_millis(4000),
            tokio_tungstenite::connect_async(&ws_url),
        )
        .await;
        let Ok(Ok((ws_stream, _))) = ws_conn else {
            state.sessions.lock().await.remove(&target_id);
            return;
        };

        let (mut ws_write, mut ws_read) = ws_stream.split();
        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
        let (evt_tx, mut evt_rx) = mpsc::unbounded_channel::<Value>();
        let pending: PendingRpcMap = Arc::new(Mutex::new(HashMap::new()));

        let write_task = tokio::spawn(async move {
            while let Some(txt) = out_rx.recv().await {
                if ws_write.send(Message::Text(txt.into())).await.is_err() {
                    break;
                }
            }
            let _ = ws_write.close().await;
        });

        let pending_reader = pending.clone();
        let read_task = tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_read.next().await {
                let Message::Text(txt) = msg else {
                    continue;
                };
                let stripped = txt.strip_prefix('\u{feff}').unwrap_or(&txt);
                let Ok(parsed) = serde_json::from_str::<Value>(stripped) else {
                    continue;
                };
                if let Some(id) = parsed.get("id").and_then(|v| v.as_u64()) {
                    let tx_opt = pending_reader.lock().ok().and_then(|mut m| m.remove(&id));
                    if let Some(tx) = tx_opt {
                        if let Some(err_obj) = parsed.get("error") {
                            let em = err_obj
                                .get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("CDP error")
                                .to_string();
                            let _ = tx.send(Err(em));
                        } else {
                            let res = parsed.get("result").cloned().unwrap_or(Value::Null);
                            let _ = tx.send(Ok(res));
                        }
                        continue;
                    }
                }
                let _ = evt_tx.send(parsed);
            }
            if let Ok(mut map) = pending_reader.lock() {
                for (_, tx) in map.drain() {
                    let _ = tx.send(Err("WebSocket closed".to_string()));
                }
            }
        });

        let rpc = Arc::new(CdpRpcClient {
            out_tx,
            pending,
            next_id: AtomicU64::new(0),
        });

        // Initial authentic Antigravity DOM probe BEFORE Runtime.addBinding / secret injection
        let probe_ok =
            verify_dom_is_antigravity(&rpc, &state, &target_url, 3, 250, false, false).await;

        if probe_ok.is_none() {
            state.remember_ignored_target(&target_id, &target_url);
            state.log(&format!(
                "[security] Skipped non-Antigravity localhost page {target_id} ({target_url})."
            ));
            write_task.abort();
            read_task.abort();
            state.sessions.lock().await.remove(&target_id);
            return;
        }

        let mut eval_script_id: Option<String> = None;
        let mut last_doc_hash = String::new();

        let attach_res: Result<(), String> = async {
            rpc.send("Page.enable", json!({})).await?;
            rpc.send("Runtime.enable", json!({})).await?;
            let _ = rpc
                .send(
                    "Runtime.addBinding",
                    json!({ "name": "agySaveThemeConfig" }),
                )
                .await;
            verified.store(true, Ordering::SeqCst);

            refresh_new_document_script(&rpc, &state, &mut eval_script_id, &mut last_doc_hash)
                .await;
            if let Some(eval_src) = state.build_runtime_wrapped_source(false) {
                rpc.send(
                    "Runtime.evaluate",
                    json!({ "expression": eval_src, "awaitPromise": false }),
                )
                .await?;
            }
            Ok(())
        }
        .await;

        if let Err(err) = attach_res {
            verified.store(false, Ordering::SeqCst);
            state.log(&format!("Attach error for {target_id}: {err}"));
            write_task.abort();
            read_task.abort();
            state.sessions.lock().await.remove(&target_id);
            return;
        }

        state.log(&format!(
            "Attached verified Antigravity target {target_id} ({target_url})"
        ));

        loop {
            tokio::select! {
                cmd_opt = cmd_rx.recv() => {
                    let Some(cmd) = cmd_opt else { break; };
                    match cmd {
                        SessionCmd::Close => break,
                        SessionCmd::Reinject { sync_from_daemon, only_update_new_doc } => {
                            if !verified.load(Ordering::Relaxed) {
                                continue;
                            }
                            refresh_new_document_script(&rpc, &state, &mut eval_script_id, &mut last_doc_hash).await;
                            if !only_update_new_doc {
                                if let Some(eval_src) = state.build_runtime_wrapped_source(sync_from_daemon) {
                                    let _ = rpc.send("Runtime.evaluate", json!({ "expression": eval_src, "awaitPromise": false })).await;
                                }
                            }
                        }
                        SessionCmd::SyncDelta => {
                            if !verified.load(Ordering::Relaxed) {
                                continue;
                            }
                            refresh_new_document_script(&rpc, &state, &mut eval_script_id, &mut last_doc_hash).await;
                            if let Some(delta_expr) = state.build_delta_config_sync_source() {
                                if let Ok(eval_res) = rpc.send(
                                    "Runtime.evaluate",
                                    json!({ "expression": delta_expr, "returnByValue": true, "awaitPromise": false })
                                ).await {
                                    let applied = eval_res.get("result").and_then(|r| r.get("value")).and_then(|v| v.as_bool());
                                    if applied == Some(false) {
                                        if let Some(eval_src) = state.build_runtime_wrapped_source(true) {
                                            let _ = rpc.send("Runtime.evaluate", json!({ "expression": eval_src, "awaitPromise": false })).await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                evt_opt = evt_rx.recv() => {
                    let Some(evt) = evt_opt else { break; };
                    let method = evt.get("method").and_then(|v| v.as_str()).unwrap_or("");

                    if method == "Runtime.bindingCalled" {
                        let b_name = evt.get("params").and_then(|p| p.get("name")).and_then(|v| v.as_str()).unwrap_or("");
                        if b_name != "agySaveThemeConfig" || !verified.load(Ordering::Relaxed) {
                            continue;
                        }
                        let raw_payload = evt.get("params").and_then(|p| p.get("payload")).and_then(|v| v.as_str()).unwrap_or("");
                        if raw_payload.is_empty() || raw_payload.len() > MAX_BINDING_PAYLOAD_BYTES {
                            state.log(&format!("[security] Rejected oversized or empty agySaveThemeConfig payload on target {target_id}."));
                            continue;
                        }
                        let stripped = raw_payload.strip_prefix('\u{feff}').unwrap_or(raw_payload);
                        let Ok(parsed) = serde_json::from_str::<Value>(stripped) else {
                            continue;
                        };
                        let tok = parsed.get("__agyToken").and_then(|v| v.as_str()).unwrap_or("");
                        if !timing_safe_token_match(tok, &state.ephemeral_token) {
                            state.log(&format!("[security] Rejected unauthorized agySaveThemeConfig call on target {target_id}."));
                            continue;
                        }
                        let Some(cfg_val) = parsed.get("config").filter(|v| v.is_object()) else {
                            state.log(&format!("[security] Rejected malformed config object on target {target_id}."));
                            continue;
                        };
                        if let Some((changed, _)) = state.save_config(cfg_val) {
                            if changed {
                                let _ = state.broadcast_tx.send(Some(target_id.clone()));
                            }
                        }
                    } else if method == "Page.frameNavigated" {
                        let Some(frame) = evt.get("params").and_then(|p| p.get("frame")).and_then(|f| f.as_object()) else {
                            continue;
                        };
                        if frame.get("parentId").filter(|v| !v.is_null()).is_some() {
                            continue;
                        }
                        let nav_url = frame.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let was_verified = verified.load(Ordering::Relaxed);
                        if let Ok(mut cu) = current_url.write() {
                            *cu = nav_url.clone();
                        }
                        let same_trusted_origin = if was_verified {
                            extract_url_origin(&nav_url)
                                .and_then(|orig| state.trusted_origins.read().ok().map(|s| s.contains(&orig)))
                                .unwrap_or(false)
                        } else {
                            false
                        };

                        if !is_candidate_antigravity_url(&nav_url) && !(was_verified && same_trusted_origin) {
                            verified.store(false, Ordering::SeqCst);
                            if !was_verified {
                                state.remember_ignored_target(&target_id, &nav_url);
                            }
                            break;
                        }

                        let probe = verify_dom_is_antigravity(
                            &rpc,
                            &state,
                            &nav_url,
                            8,
                            250,
                            true,
                            true,
                        ).await;

                        let Some(p_info) = probe else {
                            verified.store(false, Ordering::SeqCst);
                            if !was_verified {
                                state.remember_ignored_target(&target_id, &nav_url);
                            }
                            break;
                        };
                        verified.store(true, Ordering::SeqCst);
                        refresh_new_document_script(&rpc, &state, &mut eval_script_id, &mut last_doc_hash).await;
                        if !(p_info.payload_ready && eval_script_id.is_some()) {
                            if let Some(eval_src) = state.build_runtime_wrapped_source(false) {
                                let _ = rpc.send("Runtime.evaluate", json!({ "expression": eval_src, "awaitPromise": false })).await;
                            }
                        }
                    }
                }
            }
        }

        verified.store(false, Ordering::SeqCst);
        write_task.abort();
        read_task.abort();
        state.sessions.lock().await.remove(&target_id);
    });

    handle
}

async fn scan_pages(state: &Arc<DaemonState>, last_port: &mut Option<u16>) {
    let port_file = resolve_port_file();
    let Ok(raw_pf) = fs::read_to_string(&port_file) else {
        return;
    };
    let first_line = raw_pf
        .strip_prefix('\u{feff}')
        .unwrap_or(&raw_pf)
        .trim()
        .lines()
        .next()
        .unwrap_or("")
        .trim();
    let Ok(port) = first_line.parse::<u16>() else {
        return;
    };
    if port == 0 {
        return;
    }

    if let Some(prev_p) = *last_port {
        if prev_p != port {
            let mut sessions = state.sessions.lock().await;
            for (_, s) in sessions.drain() {
                let _ = s.tx.send(SessionCmd::Close);
            }
            if let Ok(mut ig) = state.ignored_fingerprints.lock() {
                ig.clear();
            }
        }
    }
    *last_port = Some(port);

    let Ok(Value::Array(targets)) = fetch_json_loopback(port, "/json", 2000).await else {
        return;
    };

    let mut live_page_ids = HashSet::<String>::new();
    let mut candidates = Vec::<(String, String, String)>::new();

    for t in &targets {
        let Some(obj) = t.as_object() else {
            continue;
        };
        if obj.get("type").and_then(|v| v.as_str()) != Some("page") {
            continue;
        }
        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !id.is_empty() {
            live_page_ids.insert(id.clone());
        }
        let ws_url = obj
            .get("webSocketDebuggerUrl")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let url = obj
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() || ws_url.is_empty() || !is_candidate_antigravity_url(&url) {
            continue;
        }
        if state.is_ignored_target(&id, &url) {
            continue;
        }
        candidates.push((id, url, ws_url));
    }

    let mut sessions = state.sessions.lock().await;
    let stale_ids: Vec<String> = sessions
        .keys()
        .filter(|id| !live_page_ids.contains(*id))
        .cloned()
        .collect();
    for sid in stale_ids {
        if let Some(s) = sessions.remove(&sid) {
            let _ = s.tx.send(SessionCmd::Close);
        }
    }

    for (id, url, ws_url) in candidates {
        sessions
            .entry(id.clone())
            .or_insert_with(|| spawn_cdp_session(id, url, ws_url, state.clone()));
    }
}

/* ============================================================================
 * PID LOCK, SHORTCUT HEAL & DAEMON ENTRYPOINT
 * ============================================================================ */

fn acquire_pid_lock(state: &DaemonState) -> bool {
    let my_pid = std::process::id();
    if let Ok(raw) = fs::read_to_string(&state.pid_file) {
        if let Ok(existing_pid) = raw
            .strip_prefix('\u{feff}')
            .unwrap_or(&raw)
            .trim()
            .parse::<u32>()
        {
            if existing_pid > 0
                && existing_pid != my_pid
                && is_verified_any_daemon_process(existing_pid)
            {
                state.log(&format!(
                    "Another daemon instance is already running (PID {existing_pid}). Exiting."
                ));
                return false;
            }
        }
    }

    let isolated = std::env::var("AGY_CONFIG_PATH")
        .map(|s| !s.is_empty())
        .unwrap_or(false)
        || std::env::var("AGY_PID_FILE")
            .map(|s| !s.is_empty())
            .unwrap_or(false);

    if !isolated {
        let global_pid_file = home_dir()
            .join(".gemini")
            .join("antigravity")
            .join("theme_daemon.pid");
        if let Ok(raw_g) = fs::read_to_string(&global_pid_file) {
            let trimmed = raw_g.strip_prefix('\u{feff}').unwrap_or(&raw_g).trim();
            let g_pid = if trimmed.starts_with('{') {
                serde_json::from_str::<Value>(trimmed)
                    .ok()
                    .and_then(|v| v.get("pid").and_then(|p| p.as_u64()))
                    .unwrap_or(0) as u32
            } else {
                trimmed.parse::<u32>().unwrap_or(0)
            };
            if g_pid > 0 && g_pid != my_pid && is_verified_any_daemon_process(g_pid) {
                state.log(&format!(
                    "Global daemon lock held by PID {g_pid}. Exiting duplicate instance."
                ));
                return false;
            }
        }
        let g_payload = json!({
            "pid": my_pid,
            "rootDir": state.root_dir.to_string_lossy(),
            "startedAt": now_epoch_ms()
        });
        if let Ok(s) = serde_json::to_string(&g_payload) {
            write_file_atomic_sync(&global_pid_file, &s, 0o600);
        }
    }

    let _ = fs::write(&state.pid_file, my_pid.to_string());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&state.pid_file, fs::Permissions::from_mode(0o600));
    }
    true
}

fn remove_pid_lock(state: &DaemonState) {
    let my_pid = std::process::id();
    if let Ok(raw) = fs::read_to_string(&state.pid_file) {
        if raw
            .strip_prefix('\u{feff}')
            .unwrap_or(&raw)
            .trim()
            .parse::<u32>()
            == Ok(my_pid)
        {
            let _ = fs::remove_file(&state.pid_file);
        }
    }
    let isolated = std::env::var("AGY_CONFIG_PATH")
        .map(|s| !s.is_empty())
        .unwrap_or(false)
        || std::env::var("AGY_PID_FILE")
            .map(|s| !s.is_empty())
            .unwrap_or(false);
    if !isolated {
        let global_pid_file = home_dir()
            .join(".gemini")
            .join("antigravity")
            .join("theme_daemon.pid");
        if let Ok(raw_g) = fs::read_to_string(&global_pid_file) {
            let trimmed = raw_g.strip_prefix('\u{feff}').unwrap_or(&raw_g);
            if let Ok(info) = serde_json::from_str::<Value>(trimmed) {
                if info.get("pid").and_then(|v| v.as_u64()) == Some(my_pid as u64) {
                    let _ = fs::remove_file(&global_pid_file);
                }
            }
        }
    }
}

fn heal_windows_shortcuts_bg() {
    #[cfg(windows)]
    {
        let isolated = std::env::var("AGY_CONFIG_PATH")
            .map(|s| !s.is_empty())
            .unwrap_or(false)
            || std::env::var("AGY_DEVTOOLS_PORT_FILE")
                .map(|s| !s.is_empty())
                .unwrap_or(false);
        if isolated {
            return;
        }
        let local_app = std::env::var("LOCALAPPDATA")
            .ok()
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Local"));
        let agy_exe = [
            local_app
                .join("Programs")
                .join("antigravity")
                .join("Antigravity.exe"),
            local_app
                .join("Programs")
                .join("Antigravity")
                .join("Antigravity.exe"),
        ]
        .into_iter()
        .find(|p| p.exists());
        if agy_exe.is_none() {
            return;
        }

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let ps_script = r#"
$WshShell = New-Object -ComObject WScript.Shell
$Dirs = @(
  [Environment]::GetFolderPath('DesktopDirectory'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('Startup'),
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
foreach ($d in $Dirs) {
  Get-ChildItem -LiteralPath $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $WshShell.CreateShortcut($_.FullName)
      if ($sc.TargetPath -and ($sc.TargetPath -imatch '\\Antigravity\.exe$') -and (Test-Path -LiteralPath $sc.TargetPath)) {
        if ($sc.Arguments -notmatch '--remote-debugging-port') {
          $sc.Arguments = ("$($sc.Arguments) --remote-debugging-port=0").Trim()
          $sc.Save()
        }
      }
    } catch {}
  }
}
"#;
        let _ = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                ps_script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

pub async fn run_daemon_async(default_code_root: &Path) -> i32 {
    let code_root = resolve_abs_path(default_code_root);
    let root_dir = std::env::current_dir()
        .ok()
        .filter(|d| d.join("themes").is_dir() || d.join("dist").is_dir())
        .map(|d| resolve_abs_path(&d))
        .unwrap_or_else(|| code_root.clone());

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

    let assets_dir = if root_dir.join("themes").join("assets").is_dir() {
        root_dir.join("themes").join("assets")
    } else {
        code_root.join("themes").join("assets")
    };
    let payload_path = if root_dir.join("dist").join("theme_payload.js").exists()
        || !code_root.join("dist").join("theme_payload.js").exists()
    {
        root_dir.join("dist").join("theme_payload.js")
    } else {
        code_root.join("dist").join("theme_payload.js")
    };

    let stdout_mirror = std::io::stdout().is_terminal()
        || std::env::var("AGY_DAEMON_STDOUT").ok().as_deref() == Some("1");

    let (broadcast_tx, mut broadcast_rx) = mpsc::unbounded_channel::<Option<String>>();

    let mut initial_trusted = HashSet::new();
    initial_trusted.insert("vscode-file://vscode-app".to_string());

    let state = Arc::new(DaemonState {
        root_dir: root_dir.clone(),
        code_root,
        assets_dir: assets_dir.clone(),
        payload_path: payload_path.clone(),
        config_file: config_file.clone(),
        backup_config_file,
        log_file: root_dir.join("daemon.log"),
        pid_file,
        ephemeral_token: generate_ephemeral_token_hex(),
        asset_port: AtomicU16::new(0),
        stdout_mirror,
        log_counter: AtomicU64::new(LOG_STAT_INTERVAL - 1),
        missing_payload_logged: AtomicBool::new(false),
        tailer: Mutex::new(TranscriptTailer::new()),
        trusted_origins: RwLock::new(initial_trusted),
        ignored_fingerprints: Mutex::new(VecDeque::new()),
        sessions: tokio::sync::Mutex::new(HashMap::new()),
        sse_seq: AtomicU64::new(0),
        sse_clients: Mutex::new(VecDeque::new()),
        last_known_config_hash: Mutex::new(String::new()),
        broadcast_tx,
    });

    if !acquire_pid_lock(&state) {
        return 0;
    }

    let platform_lbl = if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };
    state.log(&format!(
        "Theme daemon started (PID {}, platform={platform_lbl}, portFile={}).",
        std::process::id(),
        resolve_port_file().display()
    ));

    state.ensure_payload_built();
    heal_windows_shortcuts_bg();

    let initial_hash = state.compute_current_disk_config_hash();
    if let Ok(mut h) = state.last_known_config_hash.lock() {
        *h = initial_hash;
    }
    let cur_cfg = state.read_config();
    if !cur_cfg.is_empty() {
        let _ = sync_persona_runtime_hint(
            &cur_cfg,
            SyncHintOptions {
                root_dir: Some(&state.root_dir),
                config_path: Some(&state.config_file),
                bound_workspace_key: None,
                direct_switch_workspace_key: None,
            },
        );
    }

    let listener = match TcpListener::bind(("127.0.0.1", 0)).await {
        Ok(l) => l,
        Err(err) => {
            state.log(&format!("Local asset server error: {err}"));
            remove_pid_lock(&state);
            return 1;
        }
    };
    let bound_port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    state.asset_port.store(bound_port, Ordering::SeqCst);
    state.log(&format!(
        "Local asset server listening on http://127.0.0.1:{bound_port}/ (serving {})",
        assets_dir.display()
    ));

    // HTTP accept loop
    let http_state = state.clone();
    let http_task = tokio::spawn(async move {
        while let Ok((stream, peer)) = listener.accept().await {
            let st = http_state.clone();
            tokio::spawn(async move {
                handle_http_connection(stream, peer, st).await;
            });
        }
    });

    // Cross-window config sync debouncer (120ms)
    let bcast_state = state.clone();
    let bcast_task = tokio::spawn(async move {
        while let Some(mut latest_src) = broadcast_rx.recv().await {
            let deadline =
                tokio::time::Instant::now() + Duration::from_millis(CONFIG_BROADCAST_DEBOUNCE_MS);
            loop {
                tokio::select! {
                    _ = tokio::time::sleep_until(deadline) => break,
                    next_opt = broadcast_rx.recv() => {
                        match next_opt {
                            Some(s) => latest_src = s,
                            None => return,
                        }
                    }
                }
            }
            let sessions = bcast_state.sessions.lock().await;
            for (id, sess) in sessions.iter() {
                if !sess.verified.load(Ordering::Relaxed) {
                    continue;
                }
                if latest_src.as_deref() == Some(id.as_str()) {
                    let _ = sess.tx.send(SessionCmd::Reinject {
                        sync_from_daemon: false,
                        only_update_new_doc: true,
                    });
                } else {
                    let _ = sess.tx.send(SessionCmd::SyncDelta);
                }
            }
        }
    });

    // Payload hot-reload & external config & CDP target scanner loop
    let loop_state = state.clone();
    let mut last_port: Option<u16> = None;
    let mut last_payload_sig: Option<(u64, f64)> = fs::metadata(&payload_path)
        .ok()
        .map(|m| (m.len(), file_mtime_ms(&m)));

    scan_pages(&loop_state, &mut last_port).await;

    let mut fast_watch_tick = tokio::time::interval(Duration::from_millis(300));
    fast_watch_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    fast_watch_tick.tick().await;

    let mut scan_tick = tokio::time::interval(Duration::from_millis(1500));
    scan_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    scan_tick.tick().await;

    let mut heal_tick = tokio::time::interval(Duration::from_secs(120));
    heal_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    heal_tick.tick().await;

    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                state.log("Shutting down on SIGINT.");
                break;
            }
            _ = fast_watch_tick.tick() => {
                loop_state.check_external_config_update();
                let cur_sig = fs::metadata(&loop_state.payload_path)
                    .ok()
                    .map(|m| (m.len(), file_mtime_ms(&m)));
                if cur_sig.is_some() && cur_sig != last_payload_sig {
                    let had_prev = last_payload_sig.is_some();
                    last_payload_sig = cur_sig;
                    if had_prev {
                        loop_state.log("Detected dist/theme_payload.js update; hot-reloading verified pages.");
                        let sessions = loop_state.sessions.lock().await;
                        for sess in sessions.values() {
                            if sess.verified.load(Ordering::Relaxed) {
                                let _ = sess.tx.send(SessionCmd::Reinject {
                                    sync_from_daemon: false,
                                    only_update_new_doc: false,
                                });
                            }
                        }
                    }
                }
            }
            _ = scan_tick.tick() => {
                scan_pages(&loop_state, &mut last_port).await;
            }
            _ = heal_tick.tick() => {
                loop_state.ensure_payload_built();
                heal_windows_shortcuts_bg();
            }
        }
    }

    http_task.abort();
    bcast_task.abort();
    if let Ok(mut clients) = state.sse_clients.lock() {
        for (_, cancel) in clients.drain(..) {
            let _ = cancel.send(());
        }
    }
    {
        let mut sessions = state.sessions.lock().await;
        for (_, s) in sessions.drain() {
            let _ = s.tx.send(SessionCmd::Close);
        }
    }
    remove_pid_lock(&state);
    0
}
