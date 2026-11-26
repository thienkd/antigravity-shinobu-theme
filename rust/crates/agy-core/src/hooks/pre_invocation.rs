use crate::persona_sync::{
    home_dir, normalize_persona_mode, normalize_safe_id, normalize_safe_label, normalize_ui_lang,
    normalize_workspace_key, now_epoch_ms, parse_hook_input_safe, read_existing_hint,
    read_stdin_json_fast, resolve_abs_path, resolve_hint_paths, select_freshest_config_object,
    sync_persona_runtime_hint, write_file_atomic_sync, SyncHintOptions,
};
use crate::security::{is_dangerous_key, is_safe_local_regular_file, strip_proto_keys};
use serde_json::{json, Map, Value};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

fn is_safe_cid(cid: &str) -> bool {
    if cid.is_empty() || cid.len() > 96 || is_dangerous_key(cid) {
        return false;
    }
    cid.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn resolve_state_dir() -> PathBuf {
    if let Ok(d) = std::env::var("AGY_PERSONA_STATE_DIR") {
        if !d.trim().is_empty() {
            return resolve_abs_path(Path::new(&d));
        }
    }
    if let Ok(cfg) = std::env::var("AGY_CONFIG_PATH") {
        if !cfg.trim().is_empty() {
            let abs = resolve_abs_path(Path::new(&cfg));
            return abs
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(".persona_state");
        }
    }
    if let Ok(pd) = std::env::var("PLUGIN_DATA") {
        if !pd.trim().is_empty() {
            return resolve_abs_path(Path::new(&pd)).join("persona_state");
        }
    }
    home_dir()
        .join(".gemini")
        .join("antigravity")
        .join("persona_state")
}

fn load_personas_registry(personas_file: &Path) -> Option<Map<String, Value>> {
    if !is_safe_local_regular_file(personas_file) {
        return None;
    }
    let raw = fs::read_to_string(personas_file).ok()?;
    let stripped = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    let val: Value = serde_json::from_str(stripped).ok()?;
    let cleaned = strip_proto_keys(&val, 0);
    let obj = cleaned.as_object()?.clone();
    if !obj.get("personas").map(|v| v.is_object()).unwrap_or(false) {
        return None;
    }
    Some(obj)
}

fn load_or_bootstrap_hint(code_root: &Path, config_file: &Path) -> Map<String, Value> {
    let env_cfg = std::env::var("AGY_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty());
    let explicit_cfg = env_cfg.as_deref().map(Path::new);
    let hint_paths = resolve_hint_paths(code_root, explicit_cfg);
    let hint = read_existing_hint(&hint_paths);
    if !hint.is_empty() {
        return hint;
    }

    let candidates = if env_cfg.is_some() {
        vec![config_file.to_path_buf()]
    } else {
        let home = home_dir();
        vec![
            config_file.to_path_buf(),
            home.join(".gemini")
                .join("antigravity")
                .join("custom_theme_backup.json"),
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

    let freshest_cfg = select_freshest_config_object(&candidates);
    if !freshest_cfg.is_empty() {
        let synced = sync_persona_runtime_hint(
            &freshest_cfg,
            SyncHintOptions {
                root_dir: Some(code_root),
                config_path: explicit_cfg,
                bound_workspace_key: None,
                direct_switch_workspace_key: None,
            },
        );
        if let Some(m) = synced.as_object() {
            return m.clone();
        }
    }
    Map::new()
}

fn read_conversation_state(state_file: &Path) -> Option<Map<String, Value>> {
    if !is_safe_local_regular_file(state_file) {
        return None;
    }
    let raw = fs::read_to_string(state_file).ok()?;
    let val: Value = serde_json::from_str(&raw).ok()?;
    match strip_proto_keys(&val, 0) {
        Value::Object(m) => Some(m),
        _ => None,
    }
}

fn write_conversation_state(state_file: &Path, state_obj: &Value) {
    if let Ok(s) = serde_json::to_string(state_obj) {
        write_file_atomic_sync(state_file, &s, 0o600);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConversationKind {
    Main,
    Subagent,
    Unknown,
}

fn detect_conversation_kind(
    input: &Map<String, Value>,
    transcript_path: &str,
    raw_cid: &str,
) -> ConversationKind {
    if input.get("isSubagent") == Some(&Value::Bool(true)) {
        return ConversationKind::Subagent;
    }
    if input
        .get("parentConversationId")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return ConversationKind::Subagent;
    }
    if input
        .get("lastUserInput")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return ConversationKind::Main;
    }

    if !transcript_path.is_empty() {
        let abs_tr = resolve_abs_path(Path::new(transcript_path));
        if let Some(logs_dir) = abs_tr.parent() {
            if logs_dir.file_name().and_then(|n| n.to_str()) == Some("logs") {
                if let Some(sys_gen_dir) = logs_dir.parent() {
                    let base_msg_dir = sys_gen_dir.join("messages");
                    for msg_dir in [&base_msg_dir, &base_msg_dir.join("undelivered")] {
                        let Ok(meta) = fs::symlink_metadata(msg_dir) else {
                            continue;
                        };
                        if !meta.file_type().is_dir() || meta.file_type().is_symlink() {
                            continue;
                        }
                        if let Ok(rd) = fs::read_dir(msg_dir) {
                            let mut json_files: Vec<PathBuf> = rd
                                .flatten()
                                .filter_map(|e| {
                                    let name = e.file_name().into_string().ok()?;
                                    if name.ends_with(".json") && name != "read.json" {
                                        Some(e.path())
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                            json_files.sort();
                            for fp in json_files.into_iter().take(32) {
                                if !is_safe_local_regular_file(&fp) {
                                    continue;
                                }
                                let Ok(txt) = fs::read_to_string(&fp) else {
                                    continue;
                                };
                                let Ok(m) = serde_json::from_str::<Value>(&txt) else {
                                    continue;
                                };
                                if m.get("recipient").and_then(|v| v.as_str()) == Some(raw_cid) {
                                    if let Some(sender_raw) =
                                        m.get("sender").and_then(|v| v.as_str())
                                    {
                                        let sender = sender_raw.trim();
                                        let self_prefix = format!("{raw_cid}/");
                                        if !sender.is_empty()
                                            && sender != raw_cid
                                            && !sender.starts_with(&self_prefix)
                                        {
                                            return ConversationKind::Subagent;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let tr_p = Path::new(transcript_path);
        if is_safe_local_regular_file(tr_p) {
            if let Ok(mut f) = File::open(tr_p) {
                let mut buf = vec![0u8; 65536];
                if let Ok(n) = f.read(&mut buf) {
                    if n > 0 {
                        let text = String::from_utf8_lossy(&buf[..n]);
                        for line in text.lines() {
                            let trimmed = line.trim();
                            if !trimmed.starts_with('{') {
                                continue;
                            }
                            let Ok(step) = serde_json::from_str::<Value>(trimmed) else {
                                continue;
                            };
                            let Some(step_obj) = step.as_object() else {
                                continue;
                            };
                            let source = step_obj
                                .get("source")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            if source == "SYSTEM_SDK" {
                                continue;
                            }
                            let step_type =
                                step_obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            let content_str = step_obj
                                .get("content")
                                .and_then(|v| v.as_str())
                                .map(|s| s.trim())
                                .unwrap_or("");
                            let step_idx = step_obj.get("step_index").and_then(|v| v.as_i64());

                            if step_idx == Some(0) && content_str.starts_with("<subagent_reminder>")
                            {
                                return ConversationKind::Subagent;
                            }
                            if source == "USER_EXPLICIT" || step_type == "USER_INPUT" {
                                return ConversationKind::Main;
                            }
                            if source == "SYSTEM"
                                && step_type == "SYSTEM_MESSAGE"
                                && content_str.contains("[Message] timestamp=")
                                && content_str.contains("sender=")
                            {
                                return ConversationKind::Subagent;
                            }
                        }
                    }
                }
            }
        }
    }

    ConversationKind::Unknown
}

fn scan_range_for_checkpoint(file: &mut File, range_start: u64, range_end: u64) -> bool {
    if range_end <= range_start {
        return false;
    }
    let mut skip_partial_first_line = false;
    if range_start > 0 {
        let mut prev_byte = [0u8; 1];
        if file.seek(SeekFrom::Start(range_start - 1)).is_ok()
            && file.read_exact(&mut prev_byte).is_ok()
            && prev_byte[0] != b'\n'
        {
            skip_partial_first_line = true;
        }
    }

    if file.seek(SeekFrom::Start(range_start)).is_err() {
        return false;
    }

    // Zero-allocation streaming depth-1 JSON scanner: detects `"type" : "CHECKPOINT"` at root object depth
    // regardless of field ordering or multi-megabyte `content` strings preceding `type`.
    const CHUNK_SIZE: usize = 65_536;
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut pos = range_start;

    let mut depth: i32 = 0;
    let mut in_str = false;
    let mut esc = false;
    let mut expect_key = false;
    let mut capturing_str = false;
    let mut str_buf = Vec::<u8>::with_capacity(32);
    let mut last_depth1_key_is_type = false;
    let mut awaiting_type_val = false;

    let reset_line = |depth: &mut i32,
                      in_str: &mut bool,
                      esc: &mut bool,
                      expect_key: &mut bool,
                      capturing_str: &mut bool,
                      str_buf: &mut Vec<u8>,
                      last_depth1_key_is_type: &mut bool,
                      awaiting_type_val: &mut bool| {
        *depth = 0;
        *in_str = false;
        *esc = false;
        *expect_key = false;
        *capturing_str = false;
        str_buf.clear();
        *last_depth1_key_is_type = false;
        *awaiting_type_val = false;
    };

    while pos < range_end {
        let to_read = ((range_end - pos) as usize).min(CHUNK_SIZE);
        let Ok(bytes_read) = file.read(&mut buf[..to_read]) else {
            break;
        };
        if bytes_read == 0 {
            break;
        }
        pos += bytes_read as u64;

        for &ch in &buf[..bytes_read] {
            if ch == b'\n' {
                skip_partial_first_line = false;
                reset_line(
                    &mut depth,
                    &mut in_str,
                    &mut esc,
                    &mut expect_key,
                    &mut capturing_str,
                    &mut str_buf,
                    &mut last_depth1_key_is_type,
                    &mut awaiting_type_val,
                );
                continue;
            }
            if skip_partial_first_line {
                continue;
            }

            if in_str {
                if esc {
                    esc = false;
                    if capturing_str && str_buf.len() < 32 {
                        str_buf.push(ch);
                    }
                    continue;
                }
                if ch == b'\\' {
                    esc = true;
                    continue;
                }
                if ch == b'"' {
                    in_str = false;
                    if capturing_str {
                        capturing_str = false;
                        if depth == 1 && expect_key {
                            last_depth1_key_is_type = str_buf.as_slice() == b"type";
                        } else if depth == 1 && awaiting_type_val {
                            awaiting_type_val = false;
                            if str_buf.as_slice() == b"CHECKPOINT" {
                                return true;
                            }
                        }
                        str_buf.clear();
                    }
                    continue;
                }
                if capturing_str {
                    if str_buf.len() < 32 {
                        str_buf.push(ch);
                    } else {
                        // Longer than 32 bytes cannot be "type" or "CHECKPOINT"
                        capturing_str = false;
                        awaiting_type_val = false;
                        str_buf.clear();
                    }
                }
                continue;
            }

            if ch == b'"' {
                in_str = true;
                str_buf.clear();
                capturing_str = depth == 1 && (expect_key || awaiting_type_val);
                continue;
            }

            if ch == b'{' || ch == b'[' {
                if depth == 1 && awaiting_type_val {
                    awaiting_type_val = false;
                }
                depth += 1;
                if depth == 1 {
                    expect_key = ch == b'{';
                    last_depth1_key_is_type = false;
                    awaiting_type_val = false;
                }
                continue;
            }

            if ch == b'}' || ch == b']' {
                depth -= 1;
                if depth < 1 {
                    last_depth1_key_is_type = false;
                    awaiting_type_val = false;
                }
                continue;
            }

            if depth == 1 {
                if ch == b':' {
                    expect_key = false;
                    awaiting_type_val = last_depth1_key_is_type;
                    last_depth1_key_is_type = false;
                } else if ch == b',' {
                    expect_key = true;
                    last_depth1_key_is_type = false;
                    awaiting_type_val = false;
                } else if awaiting_type_val && !ch.is_ascii_whitespace() {
                    // Non-string value for "type" (e.g. null / number)
                    awaiting_type_val = false;
                }
            }
        }
    }

    false
}

struct TranscriptCheck {
    need_reinject: bool,
    current_size: u64,
    advance_scan_only: bool,
}

fn get_transcript_size_safe(transcript_path: &str) -> u64 {
    if transcript_path.is_empty() {
        return 0;
    }
    let p = Path::new(transcript_path);
    if is_safe_local_regular_file(p) {
        fs::metadata(p).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    }
}

fn check_transcript_rewind_or_compact(
    transcript_path: &str,
    prev_state: &Map<String, Value>,
    invocation_num: i64,
) -> TranscriptCheck {
    let prev_offset = prev_state
        .get("injectedAtOffset")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let prev_scanned = prev_state
        .get("lastScannedOffset")
        .and_then(|v| v.as_u64())
        .unwrap_or(prev_offset);
    let prev_inv = prev_state
        .get("injectedAtInvNum")
        .and_then(|v| v.as_i64())
        .unwrap_or(-1);

    if invocation_num >= 0 && prev_inv >= 0 && invocation_num < prev_inv {
        return TranscriptCheck {
            need_reinject: true,
            current_size: get_transcript_size_safe(transcript_path),
            advance_scan_only: false,
        };
    }

    if transcript_path.is_empty() || !is_safe_local_regular_file(Path::new(transcript_path)) {
        return TranscriptCheck {
            need_reinject: false,
            current_size: prev_scanned,
            advance_scan_only: false,
        };
    }

    let Ok(st) = fs::metadata(transcript_path) else {
        return TranscriptCheck {
            need_reinject: false,
            current_size: prev_scanned,
            advance_scan_only: false,
        };
    };
    let cur_size = st.len();

    if cur_size < prev_offset || cur_size < prev_scanned {
        return TranscriptCheck {
            need_reinject: true,
            current_size: cur_size,
            advance_scan_only: false,
        };
    }

    let scan_origin = prev_offset.max(prev_scanned);
    if cur_size > scan_origin {
        let delta = cur_size - scan_origin;
        const MAX_CONTIGUOUS_SCAN: u64 = 4 * 1024 * 1024;
        if let Ok(mut f) = File::open(transcript_path) {
            if delta <= MAX_CONTIGUOUS_SCAN {
                if scan_range_for_checkpoint(&mut f, scan_origin, cur_size) {
                    return TranscriptCheck {
                        need_reinject: true,
                        current_size: cur_size,
                        advance_scan_only: false,
                    };
                }
            } else {
                let half = 2 * 1024 * 1024;
                if scan_range_for_checkpoint(&mut f, scan_origin, scan_origin + half)
                    || scan_range_for_checkpoint(&mut f, cur_size - half, cur_size)
                {
                    return TranscriptCheck {
                        need_reinject: true,
                        current_size: cur_size,
                        advance_scan_only: false,
                    };
                }
            }
        }
        return TranscriptCheck {
            need_reinject: false,
            current_size: cur_size,
            advance_scan_only: delta >= 32_768,
        };
    }

    TranscriptCheck {
        need_reinject: false,
        current_size: cur_size,
        advance_scan_only: false,
    }
}

fn pick_localized(val: Option<&Value>, lang_idx: usize) -> String {
    let Some(v) = val else {
        return String::new();
    };
    if let Some(arr) = v.as_array() {
        arr.get(lang_idx)
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| arr.first().and_then(|x| x.as_str()))
            .unwrap_or("")
            .to_string()
    } else {
        v.as_str().unwrap_or("").to_string()
    }
}

struct EffectiveContext {
    effective_mode: String,
    persona_id: String,
    is_neutral_theme: bool,
    stance_key: String,
    chem_key: String,
    lang_idx: usize,
    muted_by_circuit_breaker: bool,
    privacy_shield_active: bool,
    hash: String,
}

fn resolve_effective_context(
    hint: &Map<String, Value>,
    registry: &Map<String, Value>,
    ws_key: &str,
) -> EffectiveContext {
    let default_mode = normalize_persona_mode(
        registry
            .get("defaultMode")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
        "subtle",
    );
    let lang = normalize_ui_lang(hint.get("uiLang").and_then(|v| v.as_str()).unwrap_or(""));
    let lang_idx = match lang.as_str() {
        "en" => 1,
        "ja" => 2,
        _ => 0,
    };

    let mut theme_name = normalize_safe_label(
        hint.get("themeName").and_then(|v| v.as_str()).unwrap_or(""),
        80,
    );
    let mut bubble_name = normalize_safe_label(
        hint.get("bubbleName")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
        80,
    );
    let mut master_persona = normalize_safe_id(
        hint.get("masterPersona")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
        "yoriichi",
    );
    let mut raw_mode = normalize_persona_mode(
        hint.get("aiPersonaMode")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
        "",
    );
    let mut focus_mode = hint
        .get("focusMode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let privacy_shield_active = hint
        .get("privacyShieldActive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !ws_key.is_empty() {
        let ws_entry = hint
            .get("workspaceActiveOverrides")
            .and_then(|v| v.as_object())
            .and_then(|m| m.get(ws_key))
            .or_else(|| {
                hint.get("workspaceProfiles")
                    .and_then(|v| v.as_object())
                    .and_then(|m| m.get(ws_key))
            });

        if let Some(ws_obj) = ws_entry.and_then(|v| v.as_object()) {
            let ws_theme = normalize_safe_label(
                ws_obj
                    .get("themeName")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                80,
            );
            if !ws_theme.is_empty() {
                theme_name = ws_theme.clone();
            }
            let ws_bubble = normalize_safe_label(
                ws_obj
                    .get("bubbleName")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                80,
            );
            if !ws_bubble.is_empty() {
                bubble_name = ws_bubble;
            } else if !ws_theme.is_empty() {
                bubble_name = ws_theme;
            }
            if let Some(mp) = ws_obj
                .get("masterPersona")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                master_persona = normalize_safe_id(mp, &master_persona);
            }
            let ws_mode = normalize_persona_mode(
                ws_obj
                    .get("aiPersonaMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                "",
            );
            if !ws_mode.is_empty() {
                raw_mode = ws_mode;
            }
            if let Some(fm) = ws_obj.get("focusMode").and_then(|v| v.as_bool()) {
                focus_mode = fm;
            }
        }
    }

    let configured_mode = if !raw_mode.is_empty() {
        raw_mode
    } else {
        default_mode
    };
    let muted_by_circuit_breaker = privacy_shield_active || focus_mode;
    let effective_mode = if muted_by_circuit_breaker {
        "off".to_string()
    } else {
        configured_mode.clone()
    };

    if effective_mode == "off" {
        return EffectiveContext {
            effective_mode: "off".to_string(),
            persona_id: "neutral".to_string(),
            is_neutral_theme: false,
            stance_key: "none".to_string(),
            chem_key: String::new(),
            lang_idx,
            muted_by_circuit_breaker,
            privacy_shield_active,
            hash: if muted_by_circuit_breaker {
                "off:breaker".to_string()
            } else {
                format!("off:manual:{lang_idx}")
            },
        };
    }

    let empty_map = Map::new();
    let theme_map = registry
        .get("themeMap")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);
    let fx_fallback_map = registry
        .get("fxFallbackMap")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);
    let personas = registry
        .get("personas")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);

    let mut persona_id = String::new();
    if !theme_name.is_empty()
        && !is_dangerous_key(&theme_name)
        && theme_map.contains_key(&theme_name)
    {
        persona_id = theme_map
            .get(&theme_name)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if persona_id == "neutral"
            && !bubble_name.is_empty()
            && bubble_name != theme_name
            && !is_dangerous_key(&bubble_name)
        {
            if let Some(b_id) = theme_map.get(&bubble_name).and_then(|v| v.as_str()) {
                if b_id != "neutral" {
                    persona_id = b_id.to_string();
                }
            }
        }
    } else if hint
        .get("isForgedActive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let trait_cand = normalize_safe_id(
            hint.get("forgedPersonaTraitId")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
            "",
        );
        if !trait_cand.is_empty() && personas.contains_key(&trait_cand) {
            persona_id = trait_cand;
        } else {
            let fx_cand = normalize_safe_id(
                hint.get("forgedFxMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
                "",
            );
            if let Some(fid) = fx_fallback_map.get(&fx_cand).and_then(|v| v.as_str()) {
                persona_id = fid.to_string();
            }
        }
    }

    if persona_id.is_empty() && theme_name.is_empty() {
        if let Some((_, first_val)) = theme_map.iter().next() {
            if let Some(fid) = first_val.as_str() {
                persona_id = fid.to_string();
            }
        }
    }

    if persona_id.is_empty() || !personas.contains_key(&persona_id) {
        persona_id = "neutral".to_string();
    }

    if persona_id == "neutral" {
        return EffectiveContext {
            effective_mode: "off".to_string(),
            persona_id: "neutral".to_string(),
            is_neutral_theme: true,
            stance_key: "none".to_string(),
            chem_key: String::new(),
            lang_idx,
            muted_by_circuit_breaker: false,
            privacy_shield_active: false,
            hash: format!("{configured_mode}:neutral:{lang_idx}"),
        };
    }

    let mp_groups = registry
        .get("masterPersonaGroups")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);
    let stance_key = if persona_id == master_persona {
        "resonance_twin".to_string()
    } else if let Some(grp) = mp_groups.get(&master_persona).and_then(|v| v.as_str()) {
        grp.to_string()
    } else {
        "founder_respect".to_string()
    };

    let chem_candidate = format!("{persona_id}:{master_persona}");
    let chem_map = registry
        .get("microChemistry")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);
    let chem_key = if chem_map.contains_key(&chem_candidate) {
        chem_candidate
    } else {
        String::new()
    };

    let hash = format!("{effective_mode}:{persona_id}:{stance_key}:{chem_key}:{lang_idx}");
    EffectiveContext {
        effective_mode,
        persona_id,
        is_neutral_theme: false,
        stance_key,
        chem_key,
        lang_idx,
        muted_by_circuit_breaker: false,
        privacy_shield_active: false,
        hash,
    }
}

fn wrap_step_output(sys_text: String, visible_md: String) -> Value {
    let mut inner = Map::new();
    inner.insert("systemMessage".to_string(), Value::String(sys_text));
    if !visible_md.is_empty() {
        inner.insert(
            "metadata".to_string(),
            json!({ "user_markdown": visible_md }),
        );
    }
    json!({ "systemMessage": Value::Object(inner) })
}

fn build_persona_shift_step(
    ctx: &EffectiveContext,
    registry: &Map<String, Value>,
    show_visible_badge: bool,
) -> Value {
    if ctx.effective_mode == "off" || ctx.persona_id == "neutral" {
        let sys_text = "[AGY_PERSONA_SHIFT id=\"neutral\" mode=\"off\"]\nRespond with crisp, neutral Principal Engineer clarity and zero character roleplay.".to_string();
        let mut visible_md = String::new();
        if show_visible_badge && !ctx.privacy_shield_active && !ctx.muted_by_circuit_breaker {
            if ctx.is_neutral_theme {
                if let Some(neutral_prof) = registry
                    .get("personas")
                    .and_then(|v| v.as_object())
                    .and_then(|p| p.get("neutral"))
                    .and_then(|n| n.as_object())
                {
                    let prefix = pick_localized(registry.get("shiftNoticePrefix"), ctx.lang_idx);
                    let neutral_badge = pick_localized(neutral_prof.get("badge"), ctx.lang_idx);
                    let pfx = if !prefix.is_empty() {
                        format!("*{prefix}* ")
                    } else {
                        String::new()
                    };
                    visible_md = format!("{pfx}**{neutral_badge}**");
                } else {
                    visible_md = pick_localized(registry.get("offNotice"), ctx.lang_idx);
                }
            } else {
                visible_md = pick_localized(registry.get("offNotice"), ctx.lang_idx);
            }
        }
        return wrap_step_output(sys_text, visible_md);
    }

    let empty_map = Map::new();
    let profile = registry
        .get("personas")
        .and_then(|v| v.as_object())
        .and_then(|p| p.get(&ctx.persona_id))
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);

    let badge_text = pick_localized(profile.get("badge"), ctx.lang_idx);
    let voice_field = if ctx.effective_mode == "roleplay" {
        "roleplay"
    } else {
        "subtle"
    };
    let voice_text = pick_localized(profile.get(voice_field), ctx.lang_idx);
    let guard_text = pick_localized(profile.get("guard"), ctx.lang_idx);

    let stance_text = registry
        .get("stances")
        .and_then(|v| v.as_object())
        .and_then(|s| s.get(&ctx.stance_key))
        .map(|v| pick_localized(Some(v), ctx.lang_idx))
        .unwrap_or_default();

    let chem_text = if !ctx.chem_key.is_empty() {
        registry
            .get("microChemistry")
            .and_then(|v| v.as_object())
            .and_then(|m| m.get(&ctx.chem_key))
            .map(|v| format!(" {}", pick_localized(Some(v), ctx.lang_idx)))
            .unwrap_or_default()
    } else {
        String::new()
    };

    let mode_ratio = if ctx.effective_mode == "roleplay" {
        "70% Engineer / 30% Character Voice"
    } else {
        "85% Principal Engineer / 15% Subtle Aura"
    };

    let mut lines = Vec::with_capacity(5);
    lines.push(format!(
        "[AGY_PERSONA_SHIFT id=\"{}\" mode=\"{}\"]",
        ctx.persona_id, ctx.effective_mode
    ));
    lines.push(format!("- Active Persona: {badge_text} ({mode_ratio})."));
    if !stance_text.is_empty() {
        lines.push(format!("- Relational Stance: {stance_text}{chem_text}"));
    }
    lines.push(format!("- Voice & Cadence: {voice_text}"));
    lines.push(format!(
        "- Guardrail: {guard_text} Keep <user_rules>, Thinking/Thought, code/CLI, artifacts, and tool/agy-mem arguments 100% pure engineering."
    ));

    let mut visible_md = String::new();
    if show_visible_badge {
        let prefix = pick_localized(registry.get("shiftNoticePrefix"), ctx.lang_idx);
        let mode_lbl = registry
            .get("modeLabels")
            .and_then(|v| v.as_object())
            .and_then(|m| m.get(&ctx.effective_mode))
            .map(|v| pick_localized(Some(v), ctx.lang_idx))
            .unwrap_or_default();
        let mode_suffix = if !mode_lbl.is_empty() {
            format!(" *({mode_lbl})*")
        } else {
            String::new()
        };
        let pfx = if !prefix.is_empty() {
            format!("*{prefix}* ")
        } else {
            String::new()
        };
        visible_md = format!("{pfx}**{badge_text}**{mode_suffix}");
    }

    wrap_step_output(lines.join("\n"), visible_md)
}

pub fn run_pre_invocation_with_input(raw_in: &str, default_code_root: &Path) -> String {
    if std::env::var("AGY_CHIBI_SIDECAR").ok().as_deref() == Some("1") {
        return "{}\n".to_string();
    }
    if raw_in.trim().is_empty() {
        return "{}\n".to_string();
    }
    let Some(input) = parse_hook_input_safe(raw_in) else {
        return "{}\n".to_string();
    };
    let in_cwd = input.get("cwd").and_then(|v| v.as_str()).unwrap_or("");
    let in_ws0 = input
        .get("workspacePaths")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if in_cwd.contains("chibi_npc_sandbox") || in_ws0.contains("chibi_npc_sandbox") {
        return "{}\n".to_string();
    }

    let raw_cid = input
        .get("conversationId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .unwrap_or("");
    if !is_safe_cid(raw_cid) {
        return "{}\n".to_string();
    }

    let code_root = std::env::var("PLUGIN_ROOT")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| resolve_abs_path(Path::new(&s)))
        .unwrap_or_else(|| resolve_abs_path(default_code_root));
    let personas_file = std::env::var("AGY_PERSONAS_FILE")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| code_root.join("themes").join("personas.json"));
    let config_file = std::env::var("AGY_CONFIG_PATH")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| code_root.join("theme_config.json"));

    let state_dir = resolve_state_dir();
    let state_file = state_dir.join(format!("{raw_cid}.json"));
    let prev_state = read_conversation_state(&state_file);

    if prev_state
        .as_ref()
        .and_then(|s| s.get("isSubagent"))
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return "{}\n".to_string();
    }

    let transcript_path = input
        .get("transcriptPath")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let mut kind = if prev_state
        .as_ref()
        .and_then(|s| s.get("kindResolved"))
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        ConversationKind::Main
    } else {
        ConversationKind::Unknown
    };

    if kind == ConversationKind::Unknown {
        kind = detect_conversation_kind(&input, transcript_path, raw_cid);
        if kind == ConversationKind::Subagent {
            write_conversation_state(
                &state_file,
                &json!({
                    "isSubagent": true,
                    "kindResolved": true,
                    "updatedAt": now_epoch_ms()
                }),
            );
            return "{}\n".to_string();
        }
        if kind == ConversationKind::Unknown {
            return "{}\n".to_string();
        }
    }

    let Some(registry) = load_personas_registry(&personas_file) else {
        return "{}\n".to_string();
    };

    let hint = load_or_bootstrap_hint(&code_root, &config_file);
    if prev_state
        .as_ref()
        .and_then(|s| s.get("hash"))
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false)
        && hint.is_empty()
    {
        return "{}\n".to_string();
    }

    let raw_ws = input
        .get("workspacePaths")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| input.get("cwd").and_then(|v| v.as_str()))
        .unwrap_or("");
    let ws_key = normalize_workspace_key(raw_ws);
    let ctx = resolve_effective_context(&hint, &registry, &ws_key);
    let invocation_num = input
        .get("invocationNum")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let is_active_persona = ctx.effective_mode != "off" && ctx.persona_id != "neutral";

    let has_prev_hash = prev_state
        .as_ref()
        .and_then(|s| s.get("hash"))
        .map(|v| v.is_string())
        .unwrap_or(false);

    if !has_prev_hash {
        let cur_size = get_transcript_size_safe(transcript_path);
        write_conversation_state(
            &state_file,
            &json!({
                "hash": ctx.hash,
                "personaId": ctx.persona_id,
                "mode": ctx.effective_mode,
                "isSubagent": false,
                "kindResolved": kind == ConversationKind::Main,
                "hadPersonaInjection": is_active_persona,
                "wasMutedByBreaker": ctx.muted_by_circuit_breaker,
                "lastActivePersonaId": if is_active_persona { ctx.persona_id.as_str() } else { "" },
                "lastActiveMode": if is_active_persona { ctx.effective_mode.as_str() } else { "" },
                "injectedAtOffset": cur_size,
                "lastScannedOffset": cur_size,
                "injectedAtInvNum": invocation_num,
                "updatedAt": now_epoch_ms()
            }),
        );

        if !is_active_persona {
            return "{}\n".to_string();
        }
        let step = build_persona_shift_step(&ctx, &registry, false);
        return format!("{}\n", json!({ "injectSteps": [step] }));
    }

    let prev = prev_state.expect("checked has_prev_hash");
    let prev_hash = prev.get("hash").and_then(|v| v.as_str()).unwrap_or("");

    if prev_hash == ctx.hash {
        let prev_kind_resolved = prev
            .get("kindResolved")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if kind == ConversationKind::Main && !prev_kind_resolved {
            let mut updated = prev.clone();
            updated.insert("kindResolved".to_string(), Value::Bool(true));
            updated.insert(
                "updatedAt".to_string(),
                Value::Number(now_epoch_ms().into()),
            );
            write_conversation_state(&state_file, &Value::Object(updated));
        }
        let had_inj = prev
            .get("hadPersonaInjection")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !is_active_persona && !had_inj {
            return "{}\n".to_string();
        }

        let check = check_transcript_rewind_or_compact(transcript_path, &prev, invocation_num);
        if !check.need_reinject {
            if check.advance_scan_only {
                let mut updated = prev.clone();
                updated.insert(
                    "kindResolved".to_string(),
                    Value::Bool(kind == ConversationKind::Main || prev_kind_resolved),
                );
                updated.insert(
                    "lastScannedOffset".to_string(),
                    Value::Number(check.current_size.into()),
                );
                updated.insert(
                    "updatedAt".to_string(),
                    Value::Number(now_epoch_ms().into()),
                );
                write_conversation_state(&state_file, &Value::Object(updated));
            }
            return "{}\n".to_string();
        }

        let mut updated = prev.clone();
        updated.insert(
            "kindResolved".to_string(),
            Value::Bool(kind == ConversationKind::Main || prev_kind_resolved),
        );
        updated.insert(
            "injectedAtOffset".to_string(),
            Value::Number(check.current_size.into()),
        );
        updated.insert(
            "lastScannedOffset".to_string(),
            Value::Number(check.current_size.into()),
        );
        updated.insert(
            "injectedAtInvNum".to_string(),
            Value::Number(invocation_num.into()),
        );
        updated.insert(
            "updatedAt".to_string(),
            Value::Number(now_epoch_ms().into()),
        );
        write_conversation_state(&state_file, &Value::Object(updated));

        let step = build_persona_shift_step(&ctx, &registry, false);
        return format!("{}\n", json!({ "injectSteps": [step] }));
    }

    let cur_size = get_transcript_size_safe(transcript_path);
    let was_muted = prev
        .get("wasMutedByBreaker")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let prev_last_active_id = prev
        .get("lastActivePersonaId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let prev_last_active_mode = prev
        .get("lastActiveMode")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let returning_from_breaker_mute = was_muted
        && !ctx.muted_by_circuit_breaker
        && prev_last_active_id == ctx.persona_id
        && prev_last_active_mode == ctx.effective_mode;

    let prev_persona_id = prev.get("personaId").and_then(|v| v.as_str()).unwrap_or("");
    let prev_mode = prev.get("mode").and_then(|v| v.as_str()).unwrap_or("");

    let persona_or_mode_changed = prev_persona_id != ctx.persona_id
        || prev_mode != ctx.effective_mode
        || (ctx.is_neutral_theme && prev_hash != ctx.hash);

    let show_visible_badge = persona_or_mode_changed
        && !returning_from_breaker_mute
        && !ctx.muted_by_circuit_breaker
        && (invocation_num > 0 || cur_size > 0);

    let prev_had_inj = prev
        .get("hadPersonaInjection")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let next_had_injection = prev_had_inj || is_active_persona;
    let need_system_step = next_had_injection || show_visible_badge;
    let prev_kind_resolved = prev
        .get("kindResolved")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    write_conversation_state(
        &state_file,
        &json!({
            "hash": ctx.hash,
            "personaId": ctx.persona_id,
            "mode": ctx.effective_mode,
            "isSubagent": false,
            "kindResolved": kind == ConversationKind::Main || prev_kind_resolved,
            "hadPersonaInjection": next_had_injection,
            "wasMutedByBreaker": ctx.muted_by_circuit_breaker,
            "lastActivePersonaId": if is_active_persona { ctx.persona_id.as_str() } else { prev_last_active_id },
            "lastActiveMode": if is_active_persona { ctx.effective_mode.as_str() } else { prev_last_active_mode },
            "injectedAtOffset": cur_size,
            "lastScannedOffset": cur_size,
            "injectedAtInvNum": invocation_num,
            "updatedAt": now_epoch_ms()
        }),
    );

    if !need_system_step {
        return "{}\n".to_string();
    }

    let step = build_persona_shift_step(&ctx, &registry, show_visible_badge);
    format!("{}\n", json!({ "injectSteps": [step] }))
}

pub fn run_pre_invocation_cli(default_code_root: &Path) -> i32 {
    let raw_in = read_stdin_json_fast(800);
    let out = run_pre_invocation_with_input(&raw_in, default_code_root);
    print!("{out}");
    0
}
