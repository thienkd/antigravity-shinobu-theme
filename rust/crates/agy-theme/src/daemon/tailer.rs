use agy_core::persona_sync::{file_mtime_ms, home_dir, js_math_round, now_epoch_ms};
use agy_core::security::slice_utf16_safe;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::VecDeque;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const MAX_TRACKED_CONVERSATIONS: usize = 16;
const MAX_TRACKED_CHILDREN: usize = 32;
const MAX_KNOWN_SUBAGENTS: usize = 64;
const MAX_ACTIVE_SUBAGENTS_TAILED: usize = 8;
const MAX_RECENT_COMPLETED_SUBAGENTS: usize = 6;
pub const COMPLETED_SUBAGENT_TTL_MS: u64 = 12_000;
const REVIVE_GRACE_MS: u64 = 20_000;
const SUBAGENT_IDLE_COMPLETE_MS: u64 = 2_500;
const LATEST_CID_CACHE_TTL_MS: u64 = 1_500;
const MAX_LINE_BYTES: usize = 2 * 1024 * 1024;
const READ_CHUNK_BYTES: usize = 64 * 1024;

pub fn is_valid_uuid_lower(s: &str) -> bool {
    if s.len() != 36 {
        return false;
    }
    for (i, b) in s.bytes().enumerate() {
        if matches!(i, 8 | 13 | 18 | 23) {
            if b != b'-' {
                return false;
            }
        } else if !(b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return false;
        }
    }
    true
}

pub fn is_dynamic_cid_alias(cid: &str) -> bool {
    cid == "latest" || cid == "active"
}

fn git_push_cmd_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)\bgit(?:\s+(?:-C|-c|--git-dir|--work-tree)(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)|\s+--[a-z-]+)*\s+push\b"#)
            .expect("valid regex")
    })
}

fn gh_repo_create_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\bgh\s+repo\s+create\b").expect("valid regex"))
}

fn read_file_prefix_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)^\s*Created At:[^\r\n]*\r?\n(?:Completed At:[^\r\n]*\r?\n)?Showing lines\s+\d+",
        )
        .expect("valid regex")
    })
}

fn created_subagent_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?is)Created the following subagent:.*?"conversationId"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})""#)
            .expect("valid regex")
    })
}

fn sender_uuid_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)sender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
            .expect("valid regex")
    })
}

fn cmd_exit_code_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?:^|\r?\n)Command exited with code (\d+)\b").expect("valid regex")
    })
}

fn has_standalone_flag(sub: &str, flag_lower: &str) -> bool {
    sub.split_whitespace()
        .any(|tok| tok.eq_ignore_ascii_case(flag_lower))
}

fn split_shell_sub_commands(raw: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut escaped = false;
    let chars: Vec<char> = raw.chars().collect();
    let mut i = 0usize;

    while i < chars.len() {
        let ch = chars[i];
        if in_single {
            if ch == '\'' {
                in_single = false;
                cur.push('\'');
            }
            i += 1;
            continue;
        }
        if in_double {
            if escaped {
                escaped = false;
                i += 1;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                i += 1;
                continue;
            }
            if ch == '"' {
                in_double = false;
                cur.push('"');
            }
            i += 1;
            continue;
        }
        if escaped {
            escaped = false;
            cur.push(ch);
            i += 1;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            cur.push(ch);
            i += 1;
            continue;
        }
        if ch == '\'' {
            in_single = true;
            cur.push('\'');
            i += 1;
            continue;
        }
        if ch == '"' {
            in_double = true;
            cur.push('"');
            i += 1;
            continue;
        }
        if ch == '\r' || ch == '\n' || ch == ';' {
            if !cur.trim().is_empty() {
                parts.push(cur.trim().to_string());
            }
            cur.clear();
            i += 1;
            continue;
        }
        if (ch == '&' || ch == '|') && chars.get(i + 1) == Some(&ch) {
            if !cur.trim().is_empty() {
                parts.push(cur.trim().to_string());
            }
            cur.clear();
            i += 2;
            continue;
        }
        if ch == '|' {
            if !cur.trim().is_empty() {
                parts.push(cur.trim().to_string());
            }
            cur.clear();
            i += 1;
            continue;
        }
        cur.push(ch);
        i += 1;
    }
    if !cur.trim().is_empty() {
        parts.push(cur.trim().to_string());
    }
    parts
}

pub fn is_git_push_command_line(raw_cmd_line: &str) -> bool {
    if raw_cmd_line.trim().is_empty() {
        return false;
    }
    let bounded = slice_utf16_safe(raw_cmd_line, 8192);
    for sub in split_shell_sub_commands(bounded) {
        if has_standalone_flag(&sub, "--dry-run") || has_standalone_flag(&sub, "-n") {
            continue;
        }
        if git_push_cmd_re().is_match(&sub) {
            return true;
        }
        if gh_repo_create_re().is_match(&sub) && has_standalone_flag(&sub, "--push") {
            return true;
        }
    }
    false
}

pub fn resolve_brain_dir() -> PathBuf {
    if let Ok(b) = std::env::var("AGY_BRAIN_DIR") {
        if !b.is_empty() {
            return PathBuf::from(b);
        }
    }
    home_dir().join(".gemini").join("antigravity").join("brain")
}

pub fn resolve_safe_transcript_path(cid: &str) -> Option<PathBuf> {
    if !is_valid_uuid_lower(cid) {
        return None;
    }
    let real_brain = fs::canonicalize(resolve_brain_dir()).ok()?;
    let candidate = real_brain
        .join(cid)
        .join(".system_generated")
        .join("logs")
        .join("transcript.jsonl");
    let real_file = fs::canonicalize(candidate).ok()?;
    let rel = real_file.strip_prefix(&real_brain).ok()?;
    if rel.as_os_str().is_empty() {
        return None;
    }
    Some(real_file)
}

fn parse_iso8601_ms(iso: &str) -> u64 {
    // Parses YYYY-MM-DDTHH:MM:SS(.sss)?(Z|+-HH:MM) into epoch ms
    let s = iso.trim();
    if s.len() < 19 {
        return 0;
    }
    let year = s.get(0..4).and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
    let month = s.get(5..7).and_then(|v| v.parse::<u32>().ok()).unwrap_or(0);
    let day = s
        .get(8..10)
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0);
    let hour = s
        .get(11..13)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let min = s
        .get(14..16)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let sec = s
        .get(17..19)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    if year < 1970 || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return 0;
    }

    let mut rest = &s[19..];
    let mut frac_ms: i64 = 0;
    if let Some(after_dot) = rest.strip_prefix('.') {
        let digits: String = after_dot
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        rest = &after_dot[digits.len()..];
        let mut padded = digits;
        while padded.len() < 3 {
            padded.push('0');
        }
        frac_ms = padded[..3].parse::<i64>().unwrap_or(0);
    }

    let mut tz_offset_sec: i64 = 0;
    if let Some(tz_rest) = rest.strip_prefix('+') {
        let tz_h = tz_rest
            .get(0..2)
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let tz_m = tz_rest
            .get(3..5)
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        tz_offset_sec = tz_h * 3600 + tz_m * 60;
    } else if let Some(tz_rest) = rest.strip_prefix('-') {
        let tz_h = tz_rest
            .get(0..2)
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let tz_m = tz_rest
            .get(3..5)
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        tz_offset_sec = -(tz_h * 3600 + tz_m * 60);
    }

    // Howard Hinnant days-from-civil algorithm
    let y = year - if month <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let m_adj = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * m_adj + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + (doe as i64) - 719_468;

    let total_sec = days * 86_400 + hour * 3600 + min * 60 + sec - tz_offset_sec;
    if total_sec < 0 {
        0
    } else {
        (total_sec as u64) * 1000 + (frac_ms as u64)
    }
}

fn extract_command_exit_code(step_type: &str, content_str: &str) -> Option<u32> {
    if step_type != "GENERIC" && step_type != "SYSTEM_MESSAGE" {
        return None;
    }
    if content_str.is_empty() || read_file_prefix_re().is_match(content_str) {
        return None;
    }
    let header_section = content_str
        .split("\nCommand output:")
        .next()
        .unwrap_or(content_str)
        .trim_end_matches('\r');
    let cap = cmd_exit_code_re().captures(header_section)?;
    cap[1].parse::<u32>().ok()
}

fn sanitize_display_label(raw: &str, max_len: usize) -> String {
    let mut s = raw.trim().to_string();
    if s.len() >= 2 && s.starts_with('"') && s.ends_with('"') {
        if let Ok(inner) = serde_json::from_str::<String>(&s) {
            s = inner;
        } else {
            s = s[1..s.len() - 1].to_string();
        }
    }
    let mut collapsed = String::with_capacity(s.len());
    let mut prev_space = true;
    for ch in s.chars() {
        let code = ch as u32;
        if code <= 0x1f || code == 0x7f || ch.is_whitespace() {
            if !prev_space {
                collapsed.push(' ');
                prev_space = true;
            }
        } else {
            collapsed.push(ch);
            prev_space = false;
        }
    }
    slice_utf16_safe(collapsed.trim(), max_len).to_string()
}

fn decode_json_encoded_arg_value(val: &Value) -> Value {
    let Value::String(s) = val else {
        return val.clone();
    };
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return val.clone();
    }
    let starts_json = (trimmed.starts_with('"') && trimmed.len() >= 2 && trimmed.ends_with('"'))
        || (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
        || trimmed == "true"
        || trimmed == "false"
        || trimmed
            .bytes()
            .all(|b| b.is_ascii_digit() || b == b'-' || b == b'.');
    if starts_json {
        if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
            return parsed;
        }
    }
    val.clone()
}

fn parse_tool_args(tc: &Map<String, Value>) -> Map<String, Value> {
    let raw = tc.get("args").or_else(|| tc.get("arguments"));
    let base = match raw {
        Some(Value::Object(m)) => m.clone(),
        Some(Value::String(s)) => serde_json::from_str::<Value>(s)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default(),
        _ => return Map::new(),
    };
    let mut out = Map::with_capacity(base.len());
    for (k, v) in &base {
        out.insert(k.clone(), decode_json_encoded_arg_value(v));
    }
    out
}

#[derive(Clone, Debug)]
struct SubagentEntry {
    cid: String,
    role: String,
    type_name: String,
    status: String,
    step_count: u64,
    last_tool: String,
    started_at: u64,
    completed_at: u64,
}

#[derive(Clone, Debug)]
struct PendingCommand {
    id: String,
    is_git_push: bool,
}

#[derive(Clone, Debug)]
struct PendingSubagent {
    role: String,
    type_name: String,
    started_at: u64,
}

#[derive(Clone, Debug)]
struct WorkStateItem {
    task: String,
    status: String,
    updated_at: u64,
}

struct ParentTracker {
    cid: String,
    rev: u64,
    initialized: bool,
    byte_offset: u64,
    last_seen_size: i64,
    last_mtime_ms: f64,
    utf8_carry: Vec<u8>,
    remainder: String,
    oversize_scan: Option<OversizeScanner>,

    input_tokens: u64,
    cache_read_tokens: u64,
    context_tokens: u64,
    prev_turn_context_tokens: u64,
    awaiting_post_checkpoint_baseline: bool,
    output_tokens: u64,
    turn_output_tokens: u64,
    last_step_in_flight_est: u64,
    turn_count: u64,
    turn_steps: u64,
    step_count: u64,
    latest_step_index: i64,
    latest_status: String,
    last_step_type: String,
    model_name: String,
    is_working: bool,
    turn_finished_seq: u64,

    crisis_state: bool,
    just_slashed_bug: bool,
    slash_seq: u64,
    slash_reason: String,
    pending_git_push_count: usize,
    pending_command_queue: VecDeque<PendingCommand>,

    pending_subagent_queue: VecDeque<PendingSubagent>,
    subagents_list: Vec<SubagentEntry>,
    recent_completed_subagents: Vec<SubagentEntry>,
    known_subagents: VecDeque<(String, SubagentEntry)>,
    work_state_items: Vec<WorkStateItem>,
    workflow_seq: u64,
}

impl ParentTracker {
    fn new(cid: String) -> Self {
        Self {
            cid,
            rev: 0,
            initialized: false,
            byte_offset: 0,
            last_seen_size: -1,
            last_mtime_ms: -1.0,
            utf8_carry: Vec::new(),
            remainder: String::new(),
            oversize_scan: None,
            input_tokens: 0,
            cache_read_tokens: 0,
            context_tokens: 0,
            prev_turn_context_tokens: 0,
            awaiting_post_checkpoint_baseline: false,
            output_tokens: 0,
            turn_output_tokens: 0,
            last_step_in_flight_est: 0,
            turn_count: 0,
            turn_steps: 0,
            step_count: 0,
            latest_step_index: 0,
            latest_status: "IDLE".to_string(),
            last_step_type: String::new(),
            model_name: String::new(),
            is_working: false,
            turn_finished_seq: 0,
            crisis_state: false,
            just_slashed_bug: false,
            slash_seq: 0,
            slash_reason: String::new(),
            pending_git_push_count: 0,
            pending_command_queue: VecDeque::new(),
            pending_subagent_queue: VecDeque::new(),
            subagents_list: Vec::new(),
            recent_completed_subagents: Vec::new(),
            known_subagents: VecDeque::new(),
            work_state_items: Vec::new(),
            workflow_seq: 0,
        }
    }

    fn reset(&mut self) {
        let rev = self.rev;
        *self = Self::new(self.cid.clone());
        self.rev = rev;
    }

    fn upsert_subagent(&mut self, entry: SubagentEntry) {
        if let Some(existing) = self.subagents_list.iter_mut().find(|x| x.cid == entry.cid) {
            *existing = entry.clone();
        } else {
            self.subagents_list.push(entry.clone());
        }
        self.touch_known(entry);
    }

    fn touch_known(&mut self, entry: SubagentEntry) {
        self.known_subagents.retain(|(k, _)| k != &entry.cid);
        if self.known_subagents.len() >= MAX_KNOWN_SUBAGENTS {
            self.known_subagents.pop_front();
        }
        self.known_subagents.push_back((entry.cid.clone(), entry));
    }

    fn get_known(&self, cid: &str) -> Option<SubagentEntry> {
        self.known_subagents
            .iter()
            .find(|(k, _)| k == cid)
            .map(|(_, v)| v.clone())
    }
}

struct ChildTracker {
    byte_offset: u64,
    last_seen_size: i64,
    last_mtime_ms: f64,
    utf8_carry: Vec<u8>,
    remainder: String,
    oversize_scan: Option<OversizeScanner>,
    step_count: u64,
    last_tool: String,
    last_step_type: String,
    last_step_status: String,
    last_has_tool_calls: bool,
    revived_at_ms: u64,
}

impl ChildTracker {
    fn new(_cid: String) -> Self {
        Self {
            byte_offset: 0,
            last_seen_size: -1,
            last_mtime_ms: -1.0,
            utf8_carry: Vec::new(),
            remainder: String::new(),
            oversize_scan: None,
            step_count: 0,
            last_tool: String::new(),
            last_step_type: String::new(),
            last_step_status: String::new(),
            last_has_tool_calls: false,
            revived_at_ms: 0,
        }
    }
}

#[derive(Default)]
struct ScannedToolCall {
    name: String,
    command_line: String,
    role: String,
    type_name: String,
    recipient: String,
    tool_summary: String,
    description: String,
    action: String,
    tc_arg_name: String,
    brief: String,
    title: String,
    tool_name: String,
    task: String,
    status: String,
}

struct TinyArgsScanner {
    depth: usize,
    in_string: bool,
    escaped: bool,
    unicode_remain: usize,
    unicode_buf: String,
    expect_key: bool,
    cur_key: String,
    str_role: &'static str,
    str_buf: String,
    max_str_len: usize,
    captured: Vec<(String, String)>,
}

impl TinyArgsScanner {
    fn new() -> Self {
        Self {
            depth: 0,
            in_string: false,
            escaped: false,
            unicode_remain: 0,
            unicode_buf: String::new(),
            expect_key: true,
            cur_key: String::new(),
            str_role: "",
            str_buf: String::new(),
            max_str_len: 0,
            captured: Vec::new(),
        }
    }
}

fn oversize_tc_arg_limit(key_lower: &str) -> Option<usize> {
    match key_lower {
        "commandline" => Some(2048),
        "role" | "toolsummary" | "description" | "brief" | "task" => Some(180),
        "title" => Some(120),
        "typename" | "recipient" => Some(80),
        "name" | "toolname" => Some(64),
        "action" | "status" => Some(32),
        _ => None,
    }
}

fn feed_tiny_args_char(sub: &mut TinyArgsScanner, ch: char) {
    if sub.in_string {
        if sub.unicode_remain > 0 {
            sub.unicode_buf.push(ch);
            sub.unicode_remain -= 1;
            if sub.unicode_remain == 0 {
                if let Ok(code) = u32::from_str_radix(&sub.unicode_buf, 16) {
                    if let Some(decoded) = char::from_u32(code) {
                        if sub.str_role != "skip" && sub.str_buf.len() < sub.max_str_len {
                            sub.str_buf.push(decoded);
                        }
                    }
                }
                sub.unicode_buf.clear();
            }
            return;
        }
        if sub.escaped {
            sub.escaped = false;
            if ch == 'u' {
                sub.unicode_remain = 4;
                sub.unicode_buf.clear();
                return;
            }
            let out_ch = match ch {
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                'b' => '\u{0008}',
                'f' => '\u{000c}',
                _ => ch,
            };
            if sub.str_role != "skip" && sub.str_buf.len() < sub.max_str_len {
                sub.str_buf.push(out_ch);
            }
            return;
        }
        if ch == '\\' {
            sub.escaped = true;
            return;
        }
        if ch == '"' {
            if sub.str_role == "key" {
                sub.cur_key = std::mem::take(&mut sub.str_buf);
            } else if sub.str_role == "val" && !sub.cur_key.is_empty() {
                let lk = sub.cur_key.to_ascii_lowercase();
                if oversize_tc_arg_limit(&lk).is_some()
                    && !sub.captured.iter().any(|(k, _)| k == &lk)
                {
                    sub.captured.push((lk, std::mem::take(&mut sub.str_buf)));
                }
            }
            sub.in_string = false;
            sub.str_role = "";
            sub.str_buf.clear();
            return;
        }
        if sub.str_role != "skip" && sub.str_buf.len() < sub.max_str_len {
            sub.str_buf.push(ch);
        }
        return;
    }

    if ch == '"' {
        sub.in_string = true;
        sub.str_buf.clear();
        if sub.depth == 1 && sub.expect_key {
            sub.str_role = "key";
            sub.max_str_len = 64;
        } else if sub.depth == 1 && !sub.expect_key {
            let lk = sub.cur_key.to_ascii_lowercase();
            if let Some(lim) = oversize_tc_arg_limit(&lk) {
                sub.str_role = "val";
                sub.max_str_len = lim;
            } else {
                sub.str_role = "skip";
                sub.max_str_len = 0;
            }
        } else {
            sub.str_role = "skip";
            sub.max_str_len = 0;
        }
        return;
    }
    if ch == '{' || ch == '[' {
        sub.depth += 1;
        if sub.depth == 1 {
            sub.expect_key = ch == '{';
            sub.cur_key.clear();
        }
        return;
    }
    if ch == '}' || ch == ']' {
        sub.depth = sub.depth.saturating_sub(1);
        return;
    }
    if sub.depth == 1 {
        if ch == ':' {
            sub.expect_key = false;
        } else if ch == ',' {
            sub.expect_key = true;
            sub.cur_key.clear();
        }
    }
}

struct OversizeScanner {
    child_mode: bool,
    depth: usize,
    container_stack: Vec<char>,
    expect_key_stack: Vec<bool>,
    cur_key_stack: Vec<String>,
    in_string: bool,
    escaped: bool,
    unicode_remain: usize,
    unicode_buf: String,
    str_role: &'static str,
    str_buf: String,
    max_str_len: usize,
    tc_arg_target_key: String,
    reading_num: bool,
    num_key: String,
    num_buf: String,

    content_head: String,
    content_chars_read: usize,
    content_line_buf: String,
    content_tail: String,
    awaiting_child_cid_remain: usize,
    sender_flush_counter: usize,

    cur_tc: Option<ScannedToolCall>,
    tc_args_scanner: Option<TinyArgsScanner>,

    is_read_file_header: bool,
    seen_command_output_marker: bool,
    step_index: Option<i64>,
    step_type: String,
    step_status: String,
    model_name: String,
    in_tok: u64,
    cache_tok: u64,
    out_tok: u64,
    has_tool_calls: bool,
    non_zero_exit: bool,
    zero_exit: bool,
    has_git_push: bool,
    invoked_subagents: Vec<(String, String)>,
    swarm_calls: Vec<(String, String, String)>,
    workflow_calls: Vec<String>,
    work_state_calls: Vec<(String, String)>,
    send_message_recipients: Vec<String>,
    created_child_cids: Vec<String>,
    sender_cids: Vec<String>,
    last_tool: String,
}

impl OversizeScanner {
    fn new(child_mode: bool) -> Self {
        Self {
            child_mode,
            depth: 0,
            container_stack: vec!['\0'; 16],
            expect_key_stack: vec![false; 16],
            cur_key_stack: vec![String::new(); 16],
            in_string: false,
            escaped: false,
            unicode_remain: 0,
            unicode_buf: String::new(),
            str_role: "",
            str_buf: String::new(),
            max_str_len: 0,
            tc_arg_target_key: String::new(),
            reading_num: false,
            num_key: String::new(),
            num_buf: String::new(),
            content_head: String::new(),
            content_chars_read: 0,
            content_line_buf: String::new(),
            content_tail: String::new(),
            awaiting_child_cid_remain: 0,
            sender_flush_counter: 0,
            cur_tc: None,
            tc_args_scanner: None,
            is_read_file_header: false,
            seen_command_output_marker: false,
            step_index: None,
            step_type: String::new(),
            step_status: String::new(),
            model_name: String::new(),
            in_tok: 0,
            cache_tok: 0,
            out_tok: 0,
            has_tool_calls: false,
            non_zero_exit: false,
            zero_exit: false,
            has_git_push: false,
            invoked_subagents: Vec::new(),
            swarm_calls: Vec::new(),
            workflow_calls: Vec::new(),
            work_state_calls: Vec::new(),
            send_message_recipients: Vec::new(),
            created_child_cids: Vec::new(),
            sender_cids: Vec::new(),
            last_tool: String::new(),
        }
    }

    fn ensure_stack(&mut self, d: usize) {
        while self.container_stack.len() <= d {
            self.container_stack.push('\0');
            self.expect_key_stack.push(false);
            self.cur_key_stack.push(String::new());
        }
    }
}

fn assign_tc_arg_field(tc: &mut ScannedToolCall, key_lower: &str, val: String) {
    match key_lower {
        "commandline" if tc.command_line.is_empty() => tc.command_line = val,
        "role" if tc.role.is_empty() => tc.role = val,
        "typename" if tc.type_name.is_empty() => tc.type_name = val,
        "recipient" if tc.recipient.is_empty() => tc.recipient = val,
        "toolsummary" if tc.tool_summary.is_empty() => tc.tool_summary = val,
        "description" if tc.description.is_empty() => tc.description = val,
        "action" if tc.action.is_empty() => tc.action = val,
        "name" if tc.tc_arg_name.is_empty() => tc.tc_arg_name = val,
        "brief" if tc.brief.is_empty() => tc.brief = val,
        "title" if tc.title.is_empty() => tc.title = val,
        "toolname" if tc.tool_name.is_empty() => tc.tool_name = val,
        "task" if tc.task.is_empty() => tc.task = val,
        "status" if tc.status.is_empty() => tc.status = val,
        _ => {}
    }
}

fn flush_content_line(scan: &mut OversizeScanner) {
    let line = std::mem::take(&mut scan.content_line_buf);
    if line.is_empty() || scan.seen_command_output_marker || scan.is_read_file_header {
        return;
    }
    if line.len() >= 15 && line[..15].eq_ignore_ascii_case("command output:") {
        scan.seen_command_output_marker = true;
        return;
    }
    if let Some(rest) = line.strip_prefix("Command exited with code ") {
        let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(code) = digits.parse::<u32>() {
            if code == 0 {
                scan.zero_exit = true;
            } else {
                scan.non_zero_exit = true;
            }
        }
    }
}

fn flush_content_senders(scan: &mut OversizeScanner, final_flush: bool) {
    if scan.content_tail.is_empty() {
        return;
    }
    for cap in sender_uuid_re().captures_iter(&scan.content_tail) {
        let scid = cap[1].to_ascii_lowercase();
        if !scan.sender_cids.contains(&scid) {
            scan.sender_cids.push(scid);
        }
    }
    if !final_flush {
        let keep_len = if scan.awaiting_child_cid_remain > 0 {
            1024
        } else {
            64
        };
        if scan.content_tail.len() > keep_len * 2 {
            let start_byte = scan
                .content_tail
                .char_indices()
                .rev()
                .nth(keep_len)
                .map(|(i, _)| i)
                .unwrap_or(0);
            scan.content_tail.drain(..start_byte);
        }
    }
}

fn feed_content_decoded_char(scan: &mut OversizeScanner, out_ch: char) {
    if scan.content_chars_read < 512 {
        scan.content_head.push(out_ch);
        scan.content_chars_read += 1;
        if scan.content_chars_read == 512 && read_file_prefix_re().is_match(&scan.content_head) {
            scan.is_read_file_header = true;
        }
    }
    if !scan.seen_command_output_marker && !scan.is_read_file_header {
        if out_ch == '\n' {
            flush_content_line(scan);
        } else if out_ch != '\r' && scan.content_line_buf.len() < 512 {
            scan.content_line_buf.push(out_ch);
        }
    }
    scan.content_tail.push(out_ch);
    scan.sender_flush_counter += 1;

    if scan.created_child_cids.len() < 16 {
        if scan.awaiting_child_cid_remain > 0 {
            scan.awaiting_child_cid_remain -= 1;
            if out_ch == '"' || out_ch == '}' || scan.awaiting_child_cid_remain == 0 {
                if let Some(cap) = created_subagent_re().captures(&scan.content_tail) {
                    let found_cid = cap[1].to_ascii_lowercase();
                    if !scan.created_child_cids.contains(&found_cid) {
                        scan.created_child_cids.push(found_cid);
                    }
                    scan.content_tail.clear();
                    scan.awaiting_child_cid_remain = 0;
                }
            }
        } else if scan
            .content_tail
            .ends_with("Created the following subagent")
        {
            scan.awaiting_child_cid_remain = 2048;
        }
    }

    if scan.sender_flush_counter >= 1024 {
        scan.sender_flush_counter = 0;
        flush_content_senders(scan, false);
    }
}

fn finalize_current_tool_call(scan: &mut OversizeScanner) {
    let Some(tc) = scan.cur_tc.take() else {
        return;
    };
    if scan.child_mode {
        let raw = if !tc.tool_summary.is_empty() {
            &tc.tool_summary
        } else if !tc.description.is_empty() {
            &tc.description
        } else if !tc.role.is_empty() {
            &tc.role
        } else {
            &tc.name
        };
        let label = sanitize_display_label(raw, 90);
        if !label.is_empty() {
            scan.last_tool = label;
        }
        return;
    }

    match tc.name.as_str() {
        "run_command" => {
            if !tc.command_line.is_empty() && is_git_push_command_line(&tc.command_line) {
                scan.has_git_push = true;
            }
        }
        "invoke_subagent" => {
            let role = {
                let r = sanitize_display_label(
                    if tc.role.is_empty() {
                        "Subagent"
                    } else {
                        &tc.role
                    },
                    90,
                );
                if r.is_empty() {
                    "Subagent".to_string()
                } else {
                    r
                }
            };
            let tn = {
                let t = sanitize_display_label(
                    if tc.type_name.is_empty() {
                        "self"
                    } else {
                        &tc.type_name
                    },
                    40,
                );
                if t.is_empty() {
                    "self".to_string()
                } else {
                    t
                }
            };
            if scan.invoked_subagents.len() < 8 {
                scan.invoked_subagents.push((role, tn));
            }
        }
        "send_message" => {
            let rec = sanitize_display_label(&tc.recipient, 64).to_ascii_lowercase();
            if is_valid_uuid_lower(&rec) && scan.send_message_recipients.len() < 16 {
                scan.send_message_recipients.push(rec);
            }
        }
        "swarm" => {
            let act = sanitize_display_label(&tc.action, 24).to_ascii_lowercase();
            if (act == "add" || act == "kill") && scan.swarm_calls.len() < 8 {
                let nm = sanitize_display_label(
                    if tc.tc_arg_name.is_empty() {
                        "worker"
                    } else {
                        &tc.tc_arg_name
                    },
                    48,
                );
                let br_src = if !tc.brief.is_empty() {
                    &tc.brief
                } else if !tc.title.is_empty() {
                    &tc.title
                } else {
                    "Swarm Worker"
                };
                let br = sanitize_display_label(br_src, 90);
                scan.swarm_calls.push((act, nm, br));
            }
        }
        "run_workflow" => {
            if scan.workflow_calls.len() < 4 {
                let src = if !tc.description.is_empty() {
                    &tc.description
                } else if !tc.tool_summary.is_empty() {
                    &tc.tool_summary
                } else {
                    "Python Workflow"
                };
                scan.workflow_calls.push(sanitize_display_label(src, 90));
            }
        }
        other => {
            let clean_tool = sanitize_display_label(&tc.tool_name, 64);
            let is_ws = (other == "call_mcp_tool"
                && clean_tool.eq_ignore_ascii_case("work_state_write"))
                || other.to_ascii_lowercase().ends_with("work_state_write");
            if is_ws && !tc.task.is_empty() && scan.work_state_calls.len() < 12 {
                let st = sanitize_display_label(
                    if tc.status.is_empty() {
                        "doing"
                    } else {
                        &tc.status
                    },
                    20,
                )
                .to_ascii_lowercase();
                scan.work_state_calls
                    .push((sanitize_display_label(&tc.task, 120), st));
            }
        }
    }
}

fn commit_top_level_number(scan: &mut OversizeScanner) {
    if !scan.reading_num {
        return;
    }
    scan.reading_num = false;
    let raw = std::mem::take(&mut scan.num_buf);
    let key = std::mem::take(&mut scan.num_key);
    if raw.is_empty() || raw == "-" {
        return;
    }
    if let Ok(n) = raw.parse::<i64>() {
        match key.as_str() {
            "step_index" => scan.step_index = Some(n),
            "input_tokens" if n > 0 => scan.in_tok = n as u64,
            "cache_read_tokens" if n > 0 => scan.cache_tok = n as u64,
            "output_tokens" if n > 0 => scan.out_tok = n as u64,
            _ => {}
        }
    }
}

fn feed_oversize_chunk(scan: &mut OversizeScanner, text_chunk: &str, is_final_chunk: bool) {
    for ch in text_chunk.chars() {
        if scan.in_string {
            if scan.unicode_remain > 0 {
                scan.unicode_buf.push(ch);
                scan.unicode_remain -= 1;
                if scan.unicode_remain == 0 {
                    if let Ok(code) = u32::from_str_radix(&scan.unicode_buf, 16) {
                        if let Some(decoded) = char::from_u32(code) {
                            if scan.str_role == "content" {
                                feed_content_decoded_char(scan, decoded);
                            } else if scan.str_role == "tc_arguments" {
                                if let Some(ref mut sub) = scan.tc_args_scanner {
                                    feed_tiny_args_char(sub, decoded);
                                }
                            } else if scan.str_role != "skip"
                                && scan.str_buf.len() < scan.max_str_len
                            {
                                scan.str_buf.push(decoded);
                            }
                        }
                    }
                    scan.unicode_buf.clear();
                }
                continue;
            }
            if scan.escaped {
                scan.escaped = false;
                if ch == 'u' {
                    scan.unicode_remain = 4;
                    scan.unicode_buf.clear();
                    continue;
                }
                let out_ch = match ch {
                    'n' => '\n',
                    'r' => '\r',
                    't' => '\t',
                    'b' => '\u{0008}',
                    'f' => '\u{000c}',
                    _ => ch,
                };
                if scan.str_role == "content" {
                    feed_content_decoded_char(scan, out_ch);
                } else if scan.str_role == "tc_arguments" {
                    if let Some(ref mut sub) = scan.tc_args_scanner {
                        feed_tiny_args_char(sub, out_ch);
                    }
                } else if scan.str_role != "skip" && scan.str_buf.len() < scan.max_str_len {
                    scan.str_buf.push(out_ch);
                }
                continue;
            }
            if ch == '\\' {
                scan.escaped = true;
                continue;
            }
            if ch == '"' {
                match scan.str_role {
                    "key" => {
                        let d = scan.depth;
                        scan.ensure_stack(d);
                        scan.cur_key_stack[d] = std::mem::take(&mut scan.str_buf);
                    }
                    "top_scalar" => {
                        let k1 = scan.cur_key_stack.get(1).map(|s| s.as_str()).unwrap_or("");
                        if k1 == "type" && scan.step_type.is_empty() {
                            scan.step_type = std::mem::take(&mut scan.str_buf);
                        } else if k1 == "status" && scan.step_status.is_empty() {
                            scan.step_status = std::mem::take(&mut scan.str_buf);
                        } else if k1 == "model"
                            && scan.model_name.is_empty()
                            && !scan.str_buf.is_empty()
                        {
                            scan.model_name = std::mem::take(&mut scan.str_buf);
                        }
                    }
                    "content" => {
                        if !scan.is_read_file_header
                            && !scan.content_head.is_empty()
                            && read_file_prefix_re().is_match(&scan.content_head)
                        {
                            scan.is_read_file_header = true;
                        }
                        flush_content_line(scan);
                        if scan.created_child_cids.len() < 16 && scan.awaiting_child_cid_remain > 0
                        {
                            if let Some(cap) = created_subagent_re().captures(&scan.content_tail) {
                                let found_cid = cap[1].to_ascii_lowercase();
                                if !scan.created_child_cids.contains(&found_cid) {
                                    scan.created_child_cids.push(found_cid);
                                }
                            }
                            scan.awaiting_child_cid_remain = 0;
                        }
                        flush_content_senders(scan, true);
                    }
                    "tc_name" => {
                        if let Some(ref mut tc) = scan.cur_tc {
                            tc.name = std::mem::take(&mut scan.str_buf);
                        }
                    }
                    "tc_arg_val" => {
                        let tk = std::mem::take(&mut scan.tc_arg_target_key);
                        let val = std::mem::take(&mut scan.str_buf);
                        if let Some(ref mut tc) = scan.cur_tc {
                            assign_tc_arg_field(tc, &tk, val);
                        }
                    }
                    "tc_arguments" => {
                        if let Some(sub) = scan.tc_args_scanner.take() {
                            if let Some(ref mut tc) = scan.cur_tc {
                                for (k, v) in sub.captured {
                                    assign_tc_arg_field(tc, &k, v);
                                }
                            }
                        }
                    }
                    _ => {}
                }
                scan.in_string = false;
                scan.str_role = "";
                scan.str_buf.clear();
                scan.tc_arg_target_key.clear();
                continue;
            }
            if scan.str_role == "content" {
                feed_content_decoded_char(scan, ch);
            } else if scan.str_role == "tc_arguments" {
                if let Some(ref mut sub) = scan.tc_args_scanner {
                    feed_tiny_args_char(sub, ch);
                }
            } else if scan.str_role != "skip" && scan.str_buf.len() < scan.max_str_len {
                scan.str_buf.push(ch);
            }
            continue;
        }

        if scan.reading_num {
            if ch.is_ascii_digit() {
                if scan.num_buf.len() < 24 {
                    scan.num_buf.push(ch);
                }
                continue;
            }
            commit_top_level_number(scan);
        }

        if ch == '"' {
            scan.in_string = true;
            scan.str_buf.clear();
            let d = scan.depth;
            scan.ensure_stack(d);
            if scan.container_stack[d] == '{' && scan.expect_key_stack[d] {
                scan.str_role = "key";
                scan.max_str_len = 96;
            } else if d == 1 && !scan.expect_key_stack[1] {
                let k1 = scan.cur_key_stack[1].as_str();
                if k1 == "type" || k1 == "status" {
                    scan.str_role = "top_scalar";
                    scan.max_str_len = 64;
                } else if k1 == "model" && !scan.child_mode {
                    scan.str_role = "top_scalar";
                    scan.max_str_len = 256;
                } else if k1 == "content" && !scan.child_mode {
                    scan.str_role = "content";
                    scan.max_str_len = 0;
                } else {
                    scan.str_role = "skip";
                    scan.max_str_len = 0;
                }
            } else if scan.cur_key_stack.get(1).map(|s| s.as_str()) == Some("tool_calls") {
                if d == 3 && !scan.expect_key_stack[3] {
                    let k3 = scan.cur_key_stack[3].as_str();
                    if k3 == "name" {
                        scan.str_role = "tc_name";
                        scan.max_str_len = 96;
                    } else if k3 == "arguments" {
                        scan.str_role = "tc_arguments";
                        scan.tc_args_scanner = Some(TinyArgsScanner::new());
                        scan.max_str_len = 0;
                    } else {
                        scan.str_role = "skip";
                        scan.max_str_len = 0;
                    }
                } else if d == 4
                    && !scan.expect_key_stack[4]
                    && matches!(scan.cur_key_stack[3].as_str(), "args" | "arguments")
                {
                    let lk4 = scan.cur_key_stack[4].to_ascii_lowercase();
                    if let Some(lim) = oversize_tc_arg_limit(&lk4) {
                        scan.str_role = "tc_arg_val";
                        scan.tc_arg_target_key = lk4;
                        scan.max_str_len = lim;
                    } else {
                        scan.str_role = "skip";
                        scan.max_str_len = 0;
                    }
                } else {
                    scan.str_role = "skip";
                    scan.max_str_len = 0;
                }
            } else {
                scan.str_role = "skip";
                scan.max_str_len = 0;
            }
            continue;
        }

        if ch == '{' || ch == '[' {
            scan.depth += 1;
            let d = scan.depth;
            scan.ensure_stack(d);
            scan.container_stack[d] = ch;
            scan.expect_key_stack[d] = ch == '{';
            scan.cur_key_stack[d].clear();
            if d == 3
                && ch == '{'
                && scan.cur_key_stack.get(1).map(|s| s.as_str()) == Some("tool_calls")
                && scan.container_stack.get(2) == Some(&'[')
            {
                scan.has_tool_calls = true;
                scan.cur_tc = Some(ScannedToolCall::default());
            }
            continue;
        }

        if ch == '}' || ch == ']' {
            if scan.depth == 3 && ch == '}' && scan.cur_tc.is_some() {
                finalize_current_tool_call(scan);
            }
            if scan.depth > 0 {
                let d = scan.depth;
                scan.ensure_stack(d);
                scan.container_stack[d] = '\0';
                scan.expect_key_stack[d] = false;
                scan.cur_key_stack[d].clear();
                scan.depth -= 1;
            }
            continue;
        }

        let d = scan.depth;
        scan.ensure_stack(d);
        if d > 0 && scan.container_stack[d] == '{' {
            if ch == ':' {
                scan.expect_key_stack[d] = false;
                continue;
            }
            if ch == ',' {
                scan.expect_key_stack[d] = true;
                scan.cur_key_stack[d].clear();
                continue;
            }
        }

        if !scan.child_mode
            && d == 1
            && scan.container_stack[1] == '{'
            && !scan.expect_key_stack[1]
            && matches!(
                scan.cur_key_stack[1].as_str(),
                "step_index" | "input_tokens" | "cache_read_tokens" | "output_tokens"
            )
            && (ch.is_ascii_digit() || ch == '-')
        {
            scan.reading_num = true;
            scan.num_key = scan.cur_key_stack[1].clone();
            scan.num_buf.clear();
            scan.num_buf.push(ch);
        }
    }

    if is_final_chunk {
        commit_top_level_number(scan);
        if scan.cur_tc.is_some() {
            finalize_current_tool_call(scan);
        }
        if scan.str_role == "content" {
            if !scan.is_read_file_header
                && !scan.content_head.is_empty()
                && read_file_prefix_re().is_match(&scan.content_head)
            {
                scan.is_read_file_header = true;
            }
            flush_content_line(scan);
            flush_content_senders(scan, true);
        }
    }
}

fn decode_streaming_utf8(carry: &mut Vec<u8>, incoming: &[u8]) -> String {
    let mut combined = Vec::new();
    let buf: &[u8] = if carry.is_empty() {
        incoming
    } else {
        combined.extend_from_slice(carry);
        combined.extend_from_slice(incoming);
        carry.clear();
        &combined
    };

    match std::str::from_utf8(buf) {
        Ok(s) => s.to_string(),
        Err(err) => {
            if err.error_len().is_none() {
                let valid = err.valid_up_to();
                carry.extend_from_slice(&buf[valid..]);
                std::str::from_utf8(&buf[..valid]).unwrap_or("").to_string()
            } else {
                // Check if only the very end (< 4 bytes) is an incomplete multi-byte sequence
                let check_from = buf.len().saturating_sub(3);
                if let Err(tail_err) = std::str::from_utf8(&buf[check_from..]) {
                    if tail_err.error_len().is_none() {
                        let split_at = check_from + tail_err.valid_up_to();
                        carry.extend_from_slice(&buf[split_at..]);
                        return String::from_utf8_lossy(&buf[..split_at]).into_owned();
                    }
                }
                String::from_utf8_lossy(buf).into_owned()
            }
        }
    }
}

pub struct TranscriptTailer {
    parents: VecDeque<(String, ParentTracker)>,
    children: VecDeque<(String, ChildTracker)>,
    latest_cid_cache: Option<String>,
    latest_cid_expires_at: u64,
}

impl Default for TranscriptTailer {
    fn default() -> Self {
        Self::new()
    }
}

impl TranscriptTailer {
    pub fn new() -> Self {
        Self {
            parents: VecDeque::new(),
            children: VecDeque::new(),
            latest_cid_cache: None,
            latest_cid_expires_at: 0,
        }
    }

    fn is_known_or_detected_subagent(&self, cand_cid: &str, tp: &Path) -> bool {
        if self.children.iter().any(|(k, _)| k == cand_cid) {
            return true;
        }
        for (_, p_trk) in &self.parents {
            if p_trk.subagents_list.iter().any(|s| s.cid == cand_cid)
                || p_trk.known_subagents.iter().any(|(k, _)| k == cand_cid)
            {
                return true;
            }
        }
        let Ok(mut f) = File::open(tp) else {
            return false;
        };
        let mut buf = [0u8; 8192];
        let Ok(n) = f.read(&mut buf) else {
            return false;
        };
        if n == 0 {
            return false;
        }
        let head = String::from_utf8_lossy(&buf[..n]);
        let trimmed = head.trim_start_matches('\u{feff}').trim_start();
        if trimmed.is_empty() {
            return false;
        }
        if let Some(nl) = trimmed.find('\n') {
            let line1 = trimmed[..nl].trim();
            if line1.starts_with('{') {
                if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(line1) {
                    let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    let src = obj.get("source").and_then(|v| v.as_str()).unwrap_or("");
                    if t == "USER_INPUT" || t == "CHECKPOINT" {
                        return false;
                    }
                    if (t == "SYSTEM_MESSAGE" && (src == "SYSTEM" || src == "SYSTEM_SDK"))
                        || src == "SYSTEM_SDK"
                    {
                        return true;
                    }
                }
            }
        } else {
            if trimmed.contains("\"USER_INPUT\"") || trimmed.contains("\"CHECKPOINT\"") {
                return false;
            }
            if trimmed.contains("\"SYSTEM_SDK\"")
                || (trimmed.contains("\"SYSTEM_MESSAGE\"")
                    && trimmed.contains("\"source\":\"SYSTEM\""))
            {
                return true;
            }
        }
        false
    }

    pub fn resolve_latest_conversation_id(&mut self) -> Option<String> {
        let now = now_epoch_ms();
        if now < self.latest_cid_expires_at {
            return self.latest_cid_cache.clone();
        }
        let mut best_cid: Option<String> = None;

        if let Ok(real_brain) = fs::canonicalize(resolve_brain_dir()) {
            if let Ok(rd) = fs::read_dir(&real_brain) {
                let mut candidates: Vec<(String, PathBuf, f64)> = Vec::new();
                for entry in rd.flatten() {
                    if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        continue;
                    }
                    let cand_cid = entry
                        .file_name()
                        .to_string_lossy()
                        .trim()
                        .to_ascii_lowercase();
                    if !is_valid_uuid_lower(&cand_cid) {
                        continue;
                    }
                    let tp = real_brain
                        .join(entry.file_name())
                        .join(".system_generated")
                        .join("logs")
                        .join("transcript.jsonl");
                    if let Ok(st) = fs::metadata(&tp) {
                        if st.is_file() {
                            candidates.push((cand_cid, tp, file_mtime_ms(&st)));
                        }
                    }
                }
                candidates
                    .sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
                for (cand_cid, tp, _) in candidates {
                    if self.is_known_or_detected_subagent(&cand_cid, &tp) {
                        continue;
                    }
                    best_cid = Some(cand_cid);
                    break;
                }
            }
        }
        if let Some(ref c) = best_cid {
            if resolve_safe_transcript_path(c).is_none() {
                best_cid = None;
            }
        }
        self.latest_cid_cache = best_cid.clone();
        self.latest_cid_expires_at = now + LATEST_CID_CACHE_TTL_MS;
        best_cid
    }

    fn touch_child(&mut self, cid: &str) -> usize {
        if let Some(pos) = self.children.iter().position(|(k, _)| k == cid) {
            if let Some(pair) = self.children.remove(pos) {
                self.children.push_back(pair);
            }
        } else {
            if self.children.len() >= MAX_TRACKED_CHILDREN {
                self.children.pop_front();
            }
            self.children
                .push_back((cid.to_string(), ChildTracker::new(cid.to_string())));
        }
        self.children.len() - 1
    }

    fn record_completed_subagent(
        tracker: &mut ParentTracker,
        child_cid: &str,
        event_ts_ms: u64,
        is_live_delta: bool,
    ) {
        let Some(pos) = tracker
            .subagents_list
            .iter()
            .position(|x| x.cid == child_cid)
        else {
            return;
        };
        let mut entry = tracker.subagents_list.remove(pos);
        entry.status = "completed".to_string();
        let now = now_epoch_ms();
        let effective_completed_at = if is_live_delta {
            now
        } else if event_ts_ms > 0 {
            event_ts_ms
        } else {
            now
        };
        entry.completed_at = effective_completed_at;
        tracker.touch_known(entry.clone());

        tracker
            .recent_completed_subagents
            .retain(|x| x.cid != child_cid);
        if now.saturating_sub(effective_completed_at) <= COMPLETED_SUBAGENT_TTL_MS {
            tracker.recent_completed_subagents.push(entry);
            if tracker.recent_completed_subagents.len() > MAX_RECENT_COMPLETED_SUBAGENTS {
                let drop_n =
                    tracker.recent_completed_subagents.len() - MAX_RECENT_COMPLETED_SUBAGENTS;
                tracker.recent_completed_subagents.drain(..drop_n);
            }
        }
    }

    fn apply_step_signals(
        tracker: &mut ParentTracker,
        children: &mut VecDeque<(String, ChildTracker)>,
        step: &Map<String, Value>,
        is_live_delta: bool,
    ) {
        tracker.step_count += 1;
        if let Some(idx) = step.get("step_index").and_then(|v| v.as_i64()) {
            tracker.latest_step_index = idx;
        }
        let step_type = step.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let step_status = step.get("status").and_then(|v| v.as_str()).unwrap_or("");
        if !step_type.is_empty() {
            tracker.last_step_type = step_type.to_string();
        }
        if !step_status.is_empty() {
            tracker.latest_status = step_status.to_string();
        }
        if let Some(m) = step
            .get("model")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            tracker.model_name = m.to_string();
        }

        let step_ts_ms = step
            .get("created_at")
            .and_then(|v| v.as_str())
            .map(parse_iso8601_ms)
            .unwrap_or(0);

        if step_type == "USER_INPUT" {
            tracker.turn_count += 1;
            if !tracker.awaiting_post_checkpoint_baseline && tracker.context_tokens > 0 {
                tracker.prev_turn_context_tokens = tracker.context_tokens;
            }
            tracker.turn_output_tokens = 0;
            tracker.last_step_in_flight_est = 0;
            tracker.turn_steps = 0;
            tracker.crisis_state = false;
            tracker.just_slashed_bug = false;
            tracker.pending_git_push_count = 0;
            tracker.pending_command_queue.clear();
            tracker.pending_subagent_queue.clear();
        }

        let in_tok = step
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let c_tok = step
            .get("cache_read_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let out_tok = step
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let ctx_sum = in_tok + c_tok;

        if step_type == "CHECKPOINT" {
            if ctx_sum > 0 {
                tracker.input_tokens = in_tok;
                tracker.cache_read_tokens = c_tok;
                tracker.context_tokens = ctx_sum;
                tracker.prev_turn_context_tokens = ctx_sum;
                tracker.awaiting_post_checkpoint_baseline = false;
            } else {
                tracker.awaiting_post_checkpoint_baseline = true;
            }
        } else if ctx_sum > 0 {
            if tracker.prev_turn_context_tokens == 0
                || tracker.awaiting_post_checkpoint_baseline
                || (ctx_sum as f64) < (tracker.prev_turn_context_tokens as f64) * 0.7
            {
                tracker.prev_turn_context_tokens = ctx_sum;
                tracker.awaiting_post_checkpoint_baseline = false;
            }
            tracker.input_tokens = in_tok;
            tracker.cache_read_tokens = c_tok;
            tracker.context_tokens = ctx_sum;
        }

        if out_tok > 0 {
            tracker.output_tokens += out_tok;
            tracker.turn_output_tokens += out_tok;
            tracker.last_step_in_flight_est = 0;
        } else if step_type == "PLANNER_RESPONSE" {
            let think_chars = step
                .get("thinking")
                .and_then(|v| v.as_str())
                .map(|s| s.encode_utf16().count())
                .unwrap_or(0);
            let content_chars = step
                .get("content")
                .and_then(|v| v.as_str())
                .map(|s| s.encode_utf16().count())
                .unwrap_or(0);
            tracker.last_step_in_flight_est =
                js_math_round((think_chars + content_chars) as f64 / 3.7).max(0) as u64;
        }

        if step_type == "PLANNER_RESPONSE" {
            tracker.turn_steps += 1;
        }

        let empty_arr = Vec::new();
        let tool_calls = step
            .get("tool_calls")
            .and_then(|v| v.as_array())
            .unwrap_or(&empty_arr);

        for tc_val in tool_calls {
            let Some(tc) = tc_val.as_object() else {
                continue;
            };
            let tc_name = tc.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args = parse_tool_args(tc);

            if tc_name == "invoke_subagent" {
                let raw_role = args
                    .get("Role")
                    .or_else(|| args.get("role"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Subagent");
                let role = {
                    let s = sanitize_display_label(raw_role, 90);
                    if s.is_empty() {
                        "Subagent".to_string()
                    } else {
                        s
                    }
                };
                let raw_tn = args
                    .get("TypeName")
                    .or_else(|| args.get("typeName"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("self");
                let type_name = {
                    let s = sanitize_display_label(raw_tn, 40);
                    if s.is_empty() {
                        "self".to_string()
                    } else {
                        s
                    }
                };
                tracker.pending_subagent_queue.push_back(PendingSubagent {
                    role,
                    type_name,
                    started_at: if step_ts_ms > 0 {
                        step_ts_ms
                    } else {
                        now_epoch_ms()
                    },
                });
                if tracker.pending_subagent_queue.len() > 16 {
                    tracker.pending_subagent_queue.pop_front();
                }
            } else if tc_name == "send_message" {
                let raw_rec = args
                    .get("Recipient")
                    .or_else(|| args.get("recipient"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let recipient = sanitize_display_label(raw_rec, 64).to_ascii_lowercase();
                if is_valid_uuid_lower(&recipient) && recipient != tracker.cid {
                    if let Some(pos) = tracker
                        .recent_completed_subagents
                        .iter()
                        .position(|s| s.cid == recipient)
                    {
                        let mut revived = tracker.recent_completed_subagents.remove(pos);
                        revived.status = "working".to_string();
                        revived.completed_at = 0;
                        tracker.upsert_subagent(revived);
                    } else if let Some(existing) = tracker
                        .subagents_list
                        .iter_mut()
                        .find(|s| s.cid == recipient)
                    {
                        existing.status = "working".to_string();
                        existing.completed_at = 0;
                        let cloned = existing.clone();
                        tracker.touch_known(cloned);
                    } else if let Some(mut known) = tracker.get_known(&recipient) {
                        known.status = "working".to_string();
                        known.completed_at = 0;
                        tracker.upsert_subagent(known);
                    }

                    let revive_ms = if is_live_delta {
                        step_ts_ms.max(now_epoch_ms())
                    } else if step_ts_ms > 0 {
                        step_ts_ms
                    } else {
                        now_epoch_ms()
                    };
                    if let Some((_, c_trk)) = children.iter_mut().find(|(k, _)| k == &recipient) {
                        c_trk.revived_at_ms = revive_ms;
                        c_trk.last_step_status = "WORKING".to_string();
                    } else {
                        if children.len() >= MAX_TRACKED_CHILDREN {
                            children.pop_front();
                        }
                        let mut ct = ChildTracker::new(recipient.clone());
                        ct.revived_at_ms = revive_ms;
                        ct.last_step_status = "WORKING".to_string();
                        children.push_back((recipient, ct));
                    }
                }
            } else if tc_name == "manage_subagents" {
                let raw_act = args
                    .get("Action")
                    .or_else(|| args.get("action"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let act = sanitize_display_label(raw_act, 32).to_ascii_lowercase();
                if act == "kill_all" {
                    let direct_cids: Vec<String> = tracker
                        .subagents_list
                        .iter()
                        .filter(|s| is_valid_uuid_lower(&s.cid))
                        .map(|s| s.cid.clone())
                        .collect();
                    for key in direct_cids {
                        Self::record_completed_subagent(tracker, &key, step_ts_ms, is_live_delta);
                    }
                } else if act == "kill" {
                    if let Some(arr) = args
                        .get("ConversationIds")
                        .or_else(|| args.get("conversationIds"))
                        .and_then(|v| v.as_array())
                    {
                        for item in arr {
                            if let Some(raw_id) = item.as_str() {
                                let target_cid =
                                    sanitize_display_label(raw_id, 64).to_ascii_lowercase();
                                if is_valid_uuid_lower(&target_cid) {
                                    Self::record_completed_subagent(
                                        tracker,
                                        &target_cid,
                                        step_ts_ms,
                                        is_live_delta,
                                    );
                                }
                            }
                        }
                    }
                }
            } else if tc_name == "run_command" {
                let raw_cmd = args
                    .get("CommandLine")
                    .or_else(|| args.get("commandLine"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let is_git_push = is_git_push_command_line(raw_cmd);
                let call_id = tc
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                tracker.pending_command_queue.push_back(PendingCommand {
                    id: call_id,
                    is_git_push,
                });
                if tracker.pending_command_queue.len() > 32 {
                    tracker.pending_command_queue.pop_front();
                }
                tracker.pending_git_push_count = tracker
                    .pending_command_queue
                    .iter()
                    .filter(|c| c.is_git_push)
                    .count();
            } else if tc_name == "swarm" {
                let raw_action = args.get("action").and_then(|v| v.as_str()).unwrap_or("");
                let action = sanitize_display_label(raw_action, 32).to_ascii_lowercase();
                let raw_name_in = args
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("worker");
                let cleaned_name: String = sanitize_display_label(raw_name_in, 32)
                    .to_ascii_lowercase()
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                    .collect();
                let raw_name = if cleaned_name.is_empty() {
                    "worker".to_string()
                } else {
                    cleaned_name
                };

                if action == "add" {
                    let brief_in = args
                        .get("brief")
                        .or_else(|| args.get("title"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Swarm Worker");
                    let brief = {
                        let b = sanitize_display_label(brief_in, 90);
                        if b.is_empty() {
                            "Swarm Worker".to_string()
                        } else {
                            b
                        }
                    };
                    let task_list = args.get("tasks").and_then(|v| v.as_array());
                    let task_len = task_list.map(|a| a.len()).unwrap_or(0);
                    let copies = if task_len > 0 {
                        task_len.min(6)
                    } else {
                        args.get("n")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(1)
                            .clamp(1, 6) as usize
                    };
                    for k in 0..copies {
                        let roster_id = if copies > 1 || task_len > 0 {
                            format!("{raw_name}-{}", k + 1)
                        } else {
                            raw_name.clone()
                        };
                        let swarm_cid = format!("swarm:{}:{roster_id}", tracker.cid);
                        let slice_desc = task_list
                            .and_then(|a| a.get(k))
                            .and_then(|v| v.as_str())
                            .map(|s| sanitize_display_label(s, 56))
                            .unwrap_or_default();
                        let role_label = if !slice_desc.is_empty() {
                            format!("[Swarm {roster_id}] {slice_desc}")
                        } else {
                            format!("[Swarm {roster_id}] {brief}")
                        };
                        tracker
                            .recent_completed_subagents
                            .retain(|x| x.cid != swarm_cid);
                        let sub_entry = SubagentEntry {
                            cid: swarm_cid,
                            role: slice_utf16_safe(&role_label, 90).to_string(),
                            type_name: "swarm".to_string(),
                            status: "working".to_string(),
                            step_count: 1,
                            last_tool: brief.clone(),
                            started_at: if step_ts_ms > 0 {
                                step_ts_ms
                            } else {
                                now_epoch_ms()
                            },
                            completed_at: 0,
                        };
                        tracker.upsert_subagent(sub_entry);
                    }
                } else if action == "kill" {
                    let target_prefix = format!("swarm:{}:{raw_name}", tracker.cid);
                    let target_dash = format!("{target_prefix}-");
                    let matching_keys: Vec<String> = tracker
                        .subagents_list
                        .iter()
                        .filter(|s| {
                            s.cid == target_prefix
                                || s.cid.starts_with(&target_dash)
                                || raw_name == "all"
                        })
                        .map(|s| s.cid.clone())
                        .collect();
                    for key in matching_keys {
                        Self::record_completed_subagent(tracker, &key, step_ts_ms, is_live_delta);
                    }
                }
            } else if tc_name == "run_workflow" {
                let wf_in = args
                    .get("Description")
                    .or_else(|| args.get("description"))
                    .or_else(|| args.get("ScriptPath"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Python Workflow");
                let wf_desc = {
                    let s = sanitize_display_label(wf_in, 90);
                    if s.is_empty() {
                        "Python Workflow".to_string()
                    } else {
                        s
                    }
                };
                tracker.workflow_seq += 1;
                let wf_cid = format!("workflow:{}:{}", tracker.cid, tracker.workflow_seq);
                let wf_role = format!("[Workflow] {wf_desc}");
                let wf_entry = SubagentEntry {
                    cid: wf_cid,
                    role: slice_utf16_safe(&wf_role, 90).to_string(),
                    type_name: "workflow".to_string(),
                    status: "working".to_string(),
                    step_count: 1,
                    last_tool: wf_desc,
                    started_at: if step_ts_ms > 0 {
                        step_ts_ms
                    } else {
                        now_epoch_ms()
                    },
                    completed_at: 0,
                };
                tracker.upsert_subagent(wf_entry);
            } else {
                let is_ws = (tc_name == "call_mcp_tool"
                    && args
                        .get("ToolName")
                        .or_else(|| args.get("toolName"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.eq_ignore_ascii_case("work_state_write"))
                        .unwrap_or(false))
                    || tc_name.to_ascii_lowercase().ends_with("work_state_write");
                if is_ws {
                    let inner_args = args
                        .get("Arguments")
                        .and_then(|v| v.as_object())
                        .unwrap_or(&args);
                    let fields = inner_args
                        .get("fields")
                        .and_then(|v| v.as_object())
                        .unwrap_or(inner_args);
                    let task_title = fields
                        .get("task")
                        .and_then(|v| v.as_str())
                        .map(|s| sanitize_display_label(s, 120))
                        .unwrap_or_default();
                    let raw_st = fields
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("doing")
                        .trim()
                        .to_ascii_lowercase();
                    let norm_st = if matches!(raw_st.as_str(), "done" | "todo" | "doing") {
                        raw_st
                    } else {
                        "doing".to_string()
                    };
                    if !task_title.is_empty() {
                        let next_item = WorkStateItem {
                            task: task_title.clone(),
                            status: norm_st,
                            updated_at: if step_ts_ms > 0 {
                                step_ts_ms
                            } else {
                                now_epoch_ms()
                            },
                        };
                        if let Some(ex) = tracker
                            .work_state_items
                            .iter_mut()
                            .find(|it| it.task == task_title)
                        {
                            *ex = next_item;
                        } else {
                            tracker.work_state_items.push(next_item);
                            if tracker.work_state_items.len() > 12 {
                                tracker.work_state_items.remove(0);
                            }
                        }
                    }
                }
            }
        }

        let content_str = step.get("content").and_then(|v| v.as_str()).unwrap_or("");
        if content_str.contains("Created the following subagent:") {
            let mut search_from = 0usize;
            while search_from < content_str.len() {
                let Some(rel_idx) =
                    content_str[search_from..].find("Created the following subagent:")
                else {
                    break;
                };
                let sub_idx = search_from + rel_idx;
                let tail = &content_str[sub_idx..];
                let snippet = slice_utf16_safe(tail, 1024);
                if let Some(cap) = created_subagent_re().captures(snippet) {
                    let matched_len = cap.get(0).map(|m| m.end()).unwrap_or(31).max(31);
                    let child_cid = cap[1].to_ascii_lowercase();
                    let meta = tracker
                        .pending_subagent_queue
                        .pop_front()
                        .unwrap_or_else(|| PendingSubagent {
                            role: "Subagent".to_string(),
                            type_name: "self".to_string(),
                            started_at: if step_ts_ms > 0 {
                                step_ts_ms
                            } else {
                                now_epoch_ms()
                            },
                        });
                    tracker
                        .recent_completed_subagents
                        .retain(|x| x.cid != child_cid);
                    let sub_entry = SubagentEntry {
                        cid: child_cid,
                        role: meta.role.clone(),
                        type_name: meta.type_name,
                        status: "working".to_string(),
                        step_count: 0,
                        last_tool: meta.role,
                        started_at: meta.started_at,
                        completed_at: 0,
                    };
                    tracker.upsert_subagent(sub_entry);
                    search_from = sub_idx + matched_len;
                } else {
                    search_from = sub_idx + 31;
                }
            }
        }

        if step_type == "SYSTEM_MESSAGE" && content_str.contains("sender=") {
            for cap in sender_uuid_re().captures_iter(content_str) {
                Self::record_completed_subagent(
                    tracker,
                    &cap[1].to_ascii_lowercase(),
                    step_ts_ms,
                    is_live_delta,
                );
            }
        }

        let cmd_exit_code = extract_command_exit_code(step_type, content_str);
        let non_zero_exit = matches!(cmd_exit_code, Some(c) if c > 0);
        let zero_exit = cmd_exit_code == Some(0);
        let is_step_error = step_status == "ERROR" || step_type == "ERROR_MESSAGE";

        let mut matched_git_push = false;
        let step_call_id = step
            .get("tool_call_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if cmd_exit_code.is_some() {
            let matched_idx = if !step_call_id.is_empty() {
                tracker
                    .pending_command_queue
                    .iter()
                    .position(|c| c.id == step_call_id)
                    .or(if tracker.pending_command_queue.is_empty() {
                        None
                    } else {
                        Some(0)
                    })
            } else if !tracker.pending_command_queue.is_empty() {
                Some(0)
            } else {
                None
            };

            if let Some(idx) = matched_idx {
                if let Some(cmd_entry) = tracker.pending_command_queue.remove(idx) {
                    matched_git_push = cmd_entry.is_git_push;
                }
            } else if tracker.pending_git_push_count > 0 {
                matched_git_push = true;
                tracker.pending_git_push_count -= 1;
            }
            if !tracker.pending_command_queue.is_empty() || matched_idx.is_some() {
                tracker.pending_git_push_count = tracker
                    .pending_command_queue
                    .iter()
                    .filter(|c| c.is_git_push)
                    .count();
            }
        } else if step_type == "GENERIC"
            && !step_call_id.is_empty()
            && (step_status == "CANCELED"
                || step_status == "ERROR"
                || (!content_str.is_empty()
                    && !content_str
                        .to_ascii_lowercase()
                        .contains("running in background")
                    && !content_str
                        .to_ascii_lowercase()
                        .contains("command is running")))
        {
            if let Some(idx) = tracker
                .pending_command_queue
                .iter()
                .position(|c| c.id == step_call_id)
            {
                tracker.pending_command_queue.remove(idx);
                tracker.pending_git_push_count = tracker
                    .pending_command_queue
                    .iter()
                    .filter(|c| c.is_git_push)
                    .count();
            }
        }

        if non_zero_exit || is_step_error {
            tracker.crisis_state = true;
            tracker.just_slashed_bug = false;
        } else if zero_exit {
            if matched_git_push {
                tracker.crisis_state = false;
                if is_live_delta {
                    tracker.just_slashed_bug = true;
                    tracker.slash_seq += 1;
                    tracker.slash_reason = "git_pushed".to_string();
                }
            } else if tracker.crisis_state {
                tracker.crisis_state = false;
                if is_live_delta {
                    tracker.just_slashed_bug = true;
                    tracker.slash_seq += 1;
                    tracker.slash_reason = "bug_slashed".to_string();
                }
            }
        }

        let is_planner_idle_done =
            step_type == "PLANNER_RESPONSE" && step_status == "DONE" && tool_calls.is_empty();
        let is_checkpoint_done = step_type == "CHECKPOINT" && step_status == "DONE";
        let is_terminal_stop = step_status == "CANCELED"
            || step_type == "ERROR_MESSAGE"
            || (step_status == "ERROR" && step_type != "GENERIC");
        let next_is_working = !(is_planner_idle_done || is_checkpoint_done || is_terminal_stop);

        if is_planner_idle_done && !is_step_error {
            tracker.crisis_state = false;
            tracker.pending_git_push_count = 0;
            tracker.pending_command_queue.clear();
            tracker.pending_subagent_queue.clear();
        }

        if tracker.is_working && !next_is_working {
            tracker.turn_finished_seq += 1;
            let virtual_keys: Vec<String> = tracker
                .subagents_list
                .iter()
                .filter(|s| {
                    s.cid.starts_with("workflow:")
                        || (is_planner_idle_done && s.cid.starts_with("swarm:"))
                })
                .map(|s| s.cid.clone())
                .collect();
            for key in virtual_keys {
                Self::record_completed_subagent(tracker, &key, step_ts_ms, is_live_delta);
            }
        }
        tracker.is_working = next_is_working;
    }

    fn apply_oversize_scan_signals(
        tracker: &mut ParentTracker,
        children: &mut VecDeque<(String, ChildTracker)>,
        scan: OversizeScanner,
        is_live_delta: bool,
    ) {
        let resolved_type = if !scan.step_type.is_empty() {
            scan.step_type
        } else {
            tracker.last_step_type.clone()
        };
        let mut synthetic_tcs = Vec::<Value>::new();
        for (role, tn) in scan.invoked_subagents {
            synthetic_tcs.push(
                json!({ "name": "invoke_subagent", "args": { "Role": role, "TypeName": tn } }),
            );
        }
        for (act, nm, br) in scan.swarm_calls {
            synthetic_tcs.push(
                json!({ "name": "swarm", "args": { "action": act, "name": nm, "brief": br } }),
            );
        }
        for wf in scan.workflow_calls {
            synthetic_tcs.push(json!({ "name": "run_workflow", "args": { "Description": wf } }));
        }
        for (task, st) in scan.work_state_calls {
            synthetic_tcs.push(json!({
                "name": "call_mcp_tool",
                "args": { "ToolName": "work_state_write", "Arguments": { "fields": { "task": task, "status": st } } }
            }));
        }
        for rcid in scan.send_message_recipients {
            synthetic_tcs.push(json!({ "name": "send_message", "args": { "Recipient": rcid } }));
        }
        if scan.has_git_push {
            synthetic_tcs
                .push(json!({ "name": "run_command", "args": { "CommandLine": "git push" } }));
        } else if scan.has_tool_calls && synthetic_tcs.is_empty() {
            synthetic_tcs.push(json!({ "name": "_oversize_tool_call" }));
        }

        let mut content_parts = Vec::<String>::new();
        for ccid in scan.created_child_cids {
            content_parts.push(format!(
                "Created the following subagent: {{\"conversationId\": \"{ccid}\"}}"
            ));
        }
        for scid in scan.sender_cids {
            content_parts.push(format!("sender={scid}"));
        }
        if !scan.is_read_file_header
            && (resolved_type == "GENERIC" || resolved_type == "SYSTEM_MESSAGE")
        {
            if scan.non_zero_exit {
                content_parts.push("Command exited with code 1".to_string());
            } else if scan.zero_exit {
                content_parts.push("Command exited with code 0".to_string());
            }
        }

        let synthetic_step = json!({
            "step_index": scan.step_index.unwrap_or(tracker.latest_step_index),
            "type": resolved_type,
            "status": if scan.step_status.is_empty() { "DONE" } else { &scan.step_status },
            "model": scan.model_name,
            "input_tokens": scan.in_tok,
            "cache_read_tokens": scan.cache_tok,
            "output_tokens": scan.out_tok,
            "tool_calls": synthetic_tcs,
            "content": content_parts.join("\n")
        });

        if let Some(obj) = synthetic_step.as_object() {
            Self::apply_step_signals(tracker, children, obj, is_live_delta);
        }
    }

    fn process_parent_line(
        tracker: &mut ParentTracker,
        children: &mut VecDeque<(String, ChildTracker)>,
        raw_line: &str,
        is_live_delta: bool,
    ) {
        let trimmed = raw_line.strip_prefix('\u{feff}').unwrap_or(raw_line).trim();
        if trimmed.is_empty() {
            return;
        }
        if trimmed.len() > MAX_LINE_BYTES {
            let mut scan = OversizeScanner::new(false);
            feed_oversize_chunk(&mut scan, trimmed, true);
            Self::apply_oversize_scan_signals(tracker, children, scan, is_live_delta);
            return;
        }
        if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(trimmed) {
            Self::apply_step_signals(tracker, children, &obj, is_live_delta);
        }
    }

    fn advance_parent_tracker(
        tracker: &mut ParentTracker,
        children: &mut VecDeque<(String, ChildTracker)>,
        file_path: &Path,
        st_size: u64,
        st_mtime_ms: f64,
    ) {
        if st_size < tracker.byte_offset {
            tracker.reset();
            tracker.rev += 1;
        }
        if st_size == tracker.byte_offset {
            if tracker.just_slashed_bug {
                tracker.just_slashed_bug = false;
                tracker.rev += 1;
            }
            tracker.last_seen_size = st_size as i64;
            tracker.last_mtime_ms = st_mtime_ms;
            tracker.initialized = true;
            return;
        }

        let is_live_delta = tracker.initialized;
        let Ok(mut file) = File::open(file_path) else {
            return;
        };
        if file.seek(SeekFrom::Start(tracker.byte_offset)).is_err() {
            return;
        }

        let buf_cap = READ_CHUNK_BYTES.min(((st_size - tracker.byte_offset) as usize).max(1024));
        let mut buf = vec![0u8; buf_cap];
        let mut pos = tracker.byte_offset;
        let mut cycle_cleared_slash = false;
        let mut bytes_processed = 0u64;

        while pos < st_size {
            let to_read = buf.len().min((st_size - pos) as usize);
            let Ok(bytes_read) = file.read(&mut buf[..to_read]) else {
                break;
            };
            if bytes_read == 0 {
                if let Ok(cur_st) = file.metadata() {
                    if cur_st.len() < tracker.byte_offset {
                        tracker.reset();
                        tracker.rev += 1;
                        return;
                    }
                }
                break;
            }
            pos += bytes_read as u64;
            bytes_processed += bytes_read as u64;

            if !cycle_cleared_slash {
                tracker.just_slashed_bug = false;
                cycle_cleared_slash = true;
            }

            let decoded = decode_streaming_utf8(&mut tracker.utf8_carry, &buf[..bytes_read]);
            let mut cursor = 0usize;
            while cursor < decoded.len() {
                if let Some(rel_nl) = decoded[cursor..].find('\n') {
                    let nl_idx = cursor + rel_nl;
                    let piece = &decoded[cursor..nl_idx];
                    cursor = nl_idx + 1;

                    if let Some(mut scan) = tracker.oversize_scan.take() {
                        feed_oversize_chunk(&mut scan, piece, true);
                        Self::apply_oversize_scan_signals(tracker, children, scan, is_live_delta);
                    } else if tracker.remainder.len() + piece.len() > MAX_LINE_BYTES {
                        let mut scan = OversizeScanner::new(false);
                        let rem = std::mem::take(&mut tracker.remainder);
                        feed_oversize_chunk(&mut scan, &rem, false);
                        feed_oversize_chunk(&mut scan, piece, true);
                        Self::apply_oversize_scan_signals(tracker, children, scan, is_live_delta);
                    } else if tracker.remainder.is_empty() {
                        Self::process_parent_line(tracker, children, piece, is_live_delta);
                    } else {
                        let mut full_line = std::mem::take(&mut tracker.remainder);
                        full_line.push_str(piece);
                        Self::process_parent_line(tracker, children, &full_line, is_live_delta);
                    }
                } else {
                    let tail = &decoded[cursor..];
                    if let Some(ref mut scan) = tracker.oversize_scan {
                        feed_oversize_chunk(scan, tail, false);
                    } else if tracker.remainder.len() + tail.len() > MAX_LINE_BYTES {
                        let mut scan = OversizeScanner::new(false);
                        let rem = std::mem::take(&mut tracker.remainder);
                        feed_oversize_chunk(&mut scan, &rem, false);
                        feed_oversize_chunk(&mut scan, tail, false);
                        tracker.oversize_scan = Some(scan);
                    } else {
                        tracker.remainder.push_str(tail);
                    }
                    break;
                }
            }
            tracker.byte_offset = pos;
        }

        tracker.byte_offset = pos;
        tracker.last_seen_size = st_size as i64;
        tracker.last_mtime_ms = st_mtime_ms;
        tracker.initialized = true;
        if bytes_processed > 0 {
            tracker.rev += 1;
        }
    }

    fn process_child_line(c_trk: &mut ChildTracker, raw_line: &str) {
        let trimmed = raw_line.strip_prefix('\u{feff}').unwrap_or(raw_line).trim();
        if trimmed.is_empty() {
            return;
        }
        if trimmed.len() > MAX_LINE_BYTES {
            let mut scan = OversizeScanner::new(true);
            feed_oversize_chunk(&mut scan, trimmed, true);
            c_trk.step_count += 1;
            if !scan.step_type.is_empty() {
                c_trk.last_step_type = scan.step_type;
            }
            if !scan.step_status.is_empty() {
                c_trk.last_step_status = scan.step_status;
            }
            c_trk.last_has_tool_calls = scan.has_tool_calls;
            if !scan.last_tool.is_empty() {
                c_trk.last_tool = scan.last_tool;
            }
            return;
        }
        let Ok(Value::Object(step)) = serde_json::from_str::<Value>(trimmed) else {
            return;
        };
        c_trk.step_count += 1;
        if let Some(t) = step
            .get("type")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            c_trk.last_step_type = t.to_string();
        }
        if let Some(s) = step
            .get("status")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            c_trk.last_step_status = s.to_string();
        }
        let tcs = step.get("tool_calls").and_then(|v| v.as_array());
        let has_tools = tcs.map(|a| !a.is_empty()).unwrap_or(false);
        c_trk.last_has_tool_calls = has_tools;
        if let Some(last_tc) = tcs.and_then(|a| a.last()).and_then(|v| v.as_object()) {
            let args = parse_tool_args(last_tc);
            let raw_sum = args
                .get("toolSummary")
                .or_else(|| args.get("Description"))
                .or_else(|| args.get("Role"))
                .and_then(|v| v.as_str())
                .or_else(|| last_tc.get("name").and_then(|v| v.as_str()))
                .unwrap_or("");
            let summary = sanitize_display_label(raw_sum, 90);
            if !summary.is_empty() {
                c_trk.last_tool = summary;
            }
        }
    }

    fn is_child_idle_completed(c_trk: &ChildTracker, mtime_ms: f64, now_ms: u64) -> bool {
        if c_trk.revived_at_ms > 0
            && mtime_ms <= c_trk.revived_at_ms as f64
            && now_ms.saturating_sub(c_trk.revived_at_ms) < REVIVE_GRACE_MS
        {
            return false;
        }
        if c_trk.last_step_type == "ERROR_MESSAGE" || c_trk.last_step_status == "CANCELED" {
            return true;
        }
        c_trk.last_step_type == "PLANNER_RESPONSE"
            && c_trk.last_step_status == "DONE"
            && !c_trk.last_has_tool_calls
            && (now_ms as f64 - mtime_ms) >= SUBAGENT_IDLE_COMPLETE_MS as f64
    }

    pub fn get_conversation_snapshot(&mut self, raw_cid: &str) -> (Value, Option<u64>) {
        let requested = raw_cid.trim().to_ascii_lowercase();
        let cid = if is_dynamic_cid_alias(&requested) {
            let Some(resolved) = self.resolve_latest_conversation_id() else {
                return (
                    json!({ "ok": false, "reason": "not_found", "cid": requested }),
                    None,
                );
            };
            resolved
        } else if !is_valid_uuid_lower(&requested) {
            return (json!({ "ok": false, "reason": "invalid_cid" }), None);
        } else {
            requested
        };

        let Some(transcript_path) = resolve_safe_transcript_path(&cid) else {
            return (
                json!({ "ok": false, "reason": "not_found", "cid": cid }),
                None,
            );
        };
        let Ok(st) = fs::metadata(&transcript_path) else {
            return (
                json!({ "ok": false, "reason": "not_found", "cid": cid }),
                None,
            );
        };
        if !st.is_file() {
            return (
                json!({ "ok": false, "reason": "not_found", "cid": cid }),
                None,
            );
        }

        let st_size = st.len();
        let st_mtime_ms = file_mtime_ms(&st);

        let mut p_trk = if let Some(pos) = self.parents.iter().position(|(k, _)| k == &cid) {
            self.parents.remove(pos).expect("exists").1
        } else {
            if self.parents.len() >= MAX_TRACKED_CONVERSATIONS {
                self.parents.pop_front();
            }
            ParentTracker::new(cid.clone())
        };

        Self::advance_parent_tracker(
            &mut p_trk,
            &mut self.children,
            &transcript_path,
            st_size,
            st_mtime_ms,
        );

        let mut active_subagents = Vec::<Value>::new();
        let working_cids: Vec<String> = p_trk
            .subagents_list
            .iter()
            .filter(|e| e.status == "working")
            .take(MAX_ACTIVE_SUBAGENTS_TAILED)
            .map(|e| e.cid.clone())
            .collect();

        for child_cid in working_cids {
            let mut auto_completed = false;
            if let Some(child_path) = resolve_safe_transcript_path(&child_cid) {
                if let Ok(cst) = fs::metadata(&child_path) {
                    if cst.is_file() {
                        let cst_size = cst.len();
                        let cst_mtime = file_mtime_ms(&cst);
                        let c_idx = self.touch_child(&child_cid);
                        let c_trk = &mut self.children[c_idx].1;

                        let prev_offset = c_trk.byte_offset;
                        let prev_steps = c_trk.step_count;
                        let prev_tool = c_trk.last_tool.clone();
                        let prev_status = c_trk.last_step_status.clone();

                        if cst_size < c_trk.byte_offset {
                            *c_trk = ChildTracker::new(child_cid.clone());
                        }
                        if cst_size == c_trk.byte_offset {
                            c_trk.last_seen_size = cst_size as i64;
                            c_trk.last_mtime_ms = cst_mtime;
                        } else if cst_size > c_trk.byte_offset {
                            if let Ok(mut cf) = File::open(&child_path) {
                                if cf.seek(SeekFrom::Start(c_trk.byte_offset)).is_ok() {
                                    let bcap = READ_CHUNK_BYTES
                                        .min(((cst_size - c_trk.byte_offset) as usize).max(1024));
                                    let mut cbuf = vec![0u8; bcap];
                                    let mut pos = c_trk.byte_offset;
                                    while pos < cst_size {
                                        let tr = cbuf.len().min((cst_size - pos) as usize);
                                        let Ok(n) = cf.read(&mut cbuf[..tr]) else {
                                            break;
                                        };
                                        if n == 0 {
                                            break;
                                        }
                                        pos += n as u64;
                                        let dec = decode_streaming_utf8(
                                            &mut c_trk.utf8_carry,
                                            &cbuf[..n],
                                        );
                                        let mut cur = 0usize;
                                        while cur < dec.len() {
                                            if let Some(rnl) = dec[cur..].find('\n') {
                                                let nl = cur + rnl;
                                                let pc = &dec[cur..nl];
                                                cur = nl + 1;
                                                if let Some(mut sc) = c_trk.oversize_scan.take() {
                                                    feed_oversize_chunk(&mut sc, pc, true);
                                                    c_trk.step_count += 1;
                                                    if !sc.step_type.is_empty() {
                                                        c_trk.last_step_type = sc.step_type;
                                                    }
                                                    if !sc.step_status.is_empty() {
                                                        c_trk.last_step_status = sc.step_status;
                                                    }
                                                    c_trk.last_has_tool_calls = sc.has_tool_calls;
                                                    if !sc.last_tool.is_empty() {
                                                        c_trk.last_tool = sc.last_tool;
                                                    }
                                                } else if c_trk.remainder.is_empty() {
                                                    Self::process_child_line(c_trk, pc);
                                                } else {
                                                    let mut fl =
                                                        std::mem::take(&mut c_trk.remainder);
                                                    fl.push_str(pc);
                                                    Self::process_child_line(c_trk, &fl);
                                                }
                                            } else {
                                                let tl = &dec[cur..];
                                                if let Some(ref mut sc) = c_trk.oversize_scan {
                                                    feed_oversize_chunk(sc, tl, false);
                                                } else if c_trk.remainder.len() + tl.len()
                                                    > MAX_LINE_BYTES
                                                {
                                                    let mut sc = OversizeScanner::new(true);
                                                    let rm = std::mem::take(&mut c_trk.remainder);
                                                    feed_oversize_chunk(&mut sc, &rm, false);
                                                    feed_oversize_chunk(&mut sc, tl, false);
                                                    c_trk.oversize_scan = Some(sc);
                                                } else {
                                                    c_trk.remainder.push_str(tl);
                                                }
                                                break;
                                            }
                                        }
                                        c_trk.byte_offset = pos;
                                    }
                                    c_trk.byte_offset = pos;
                                    c_trk.last_seen_size = cst_size as i64;
                                    c_trk.last_mtime_ms = cst_mtime;
                                }
                            }
                        }

                        if c_trk.revived_at_ms > 0 && cst_mtime > c_trk.revived_at_ms as f64 {
                            c_trk.revived_at_ms = 0;
                        }
                        if let Some(pe) =
                            p_trk.subagents_list.iter_mut().find(|e| e.cid == child_cid)
                        {
                            pe.step_count = c_trk.step_count;
                            if !c_trk.last_tool.is_empty() {
                                pe.last_tool = c_trk.last_tool.clone();
                            }
                        }
                        if c_trk.byte_offset != prev_offset
                            || c_trk.step_count != prev_steps
                            || c_trk.last_tool != prev_tool
                            || c_trk.last_step_status != prev_status
                        {
                            p_trk.rev += 1;
                        }

                        let now = now_epoch_ms();
                        if Self::is_child_idle_completed(c_trk, cst_mtime, now) {
                            let is_init = p_trk.initialized;
                            Self::record_completed_subagent(
                                &mut p_trk,
                                &child_cid,
                                cst_mtime as u64,
                                is_init,
                            );
                            p_trk.rev += 1;
                            auto_completed = true;
                        }
                    }
                }
            }

            if !auto_completed {
                if let Some(entry) = p_trk.subagents_list.iter().find(|e| e.cid == child_cid) {
                    active_subagents.push(json!({
                        "cid": entry.cid,
                        "role": entry.role,
                        "typeName": entry.type_name,
                        "status": "working",
                        "stepCount": entry.step_count,
                        "lastTool": if entry.last_tool.is_empty() { &entry.role } else { &entry.last_tool },
                        "startedAt": entry.started_at
                    }));
                }
            }
        }

        let now = now_epoch_ms();
        let prev_recent_len = p_trk.recent_completed_subagents.len();
        p_trk
            .recent_completed_subagents
            .retain(|item| now.saturating_sub(item.completed_at) <= COMPLETED_SUBAGENT_TTL_MS);
        if p_trk.recent_completed_subagents.len() > MAX_RECENT_COMPLETED_SUBAGENTS {
            let dn = p_trk.recent_completed_subagents.len() - MAX_RECENT_COMPLETED_SUBAGENTS;
            p_trk.recent_completed_subagents.drain(..dn);
        }
        if p_trk.recent_completed_subagents.len() != prev_recent_len {
            p_trk.rev += 1;
        }

        let recent_completed: Vec<Value> = p_trk
            .recent_completed_subagents
            .iter()
            .map(|entry| {
                json!({
                    "cid": entry.cid,
                    "role": entry.role,
                    "typeName": entry.type_name,
                    "status": "completed",
                    "stepCount": entry.step_count,
                    "lastTool": if entry.last_tool.is_empty() { &entry.role } else { &entry.last_tool },
                    "completedAt": entry.completed_at
                })
            })
            .collect();

        let effective_ctx = if p_trk.context_tokens > 0 {
            p_trk.context_tokens
        } else if st_size > 0 {
            js_math_round(st_size as f64 / 4.2).max(0) as u64
        } else {
            0
        };

        let turn_context_delta = if p_trk.prev_turn_context_tokens > 0 {
            effective_ctx.saturating_sub(p_trk.prev_turn_context_tokens)
        } else {
            0
        };

        let in_flight_out = if p_trk.is_working {
            p_trk.last_step_in_flight_est
        } else {
            0
        };
        let turn_output_tokens = p_trk.turn_output_tokens + in_flight_out;
        let total_output_tokens = p_trk.output_tokens + in_flight_out;
        let turn_tokens = turn_output_tokens + turn_context_delta;

        let work_items: Vec<Value> = p_trk
            .work_state_items
            .iter()
            .map(|w| {
                json!({
                    "task": w.task,
                    "status": w.status,
                    "updatedAt": w.updated_at
                })
            })
            .collect();

        let rev = p_trk.rev;
        let snap = json!({
            "ok": true,
            "cid": cid,
            "contextTokens": effective_ctx,
            "inputTokens": p_trk.input_tokens,
            "uncachedInputTokens": p_trk.input_tokens,
            "cacheReadTokens": p_trk.cache_read_tokens,
            "cacheTokens": p_trk.cache_read_tokens,
            "outputTokens": total_output_tokens,
            "totalOutputTokens": total_output_tokens,
            "turnTokens": turn_tokens,
            "turnOutputTokens": turn_output_tokens,
            "turnContextDelta": turn_context_delta,
            "turnCount": p_trk.turn_count,
            "totalTurns": p_trk.turn_count,
            "turnSteps": p_trk.turn_steps,
            "stepCount": p_trk.step_count,
            "latestStepIndex": p_trk.latest_step_index,
            "latestStatus": p_trk.latest_status,
            "lastStepType": p_trk.last_step_type,
            "modelName": p_trk.model_name,
            "isWorking": p_trk.is_working,
            "turnFinishedSeq": p_trk.turn_finished_seq,
            "crisisState": p_trk.crisis_state,
            "justSlashedBug": p_trk.just_slashed_bug,
            "slashSeq": p_trk.slash_seq,
            "slashReason": p_trk.slash_reason,
            "activeSubagents": active_subagents,
            "recentCompletedSubagents": recent_completed,
            "workStateItems": work_items,
            "fileBytes": st_size,
            "updatedAt": st_mtime_ms as u64
        });

        self.parents.push_back((cid, p_trk));
        (snap, Some(rev))
    }

    pub fn has_conversation_activity(&self, cid: &str, last_pushed_rev: Option<u64>) -> bool {
        let Some(parent_path) = resolve_safe_transcript_path(cid) else {
            return false;
        };
        let tracker = self.parents.iter().find(|(k, _)| k == cid).map(|(_, v)| v);
        if let (Some(t), Some(lrev)) = (tracker, last_pushed_rev) {
            if t.rev != lrev {
                return true;
            }
        }
        let Ok(st) = fs::metadata(&parent_path) else {
            return false;
        };
        let Some(t) = tracker else {
            return true;
        };
        if st.len() as i64 != t.last_seen_size
            || (file_mtime_ms(&st) - t.last_mtime_ms).abs() > 0.001
        {
            return true;
        }
        let now = now_epoch_ms();
        if t.recent_completed_subagents
            .iter()
            .any(|s| now.saturating_sub(s.completed_at) > COMPLETED_SUBAGENT_TTL_MS)
        {
            return true;
        }
        for entry in t
            .subagents_list
            .iter()
            .filter(|e| e.status == "working")
            .take(MAX_ACTIVE_SUBAGENTS_TAILED)
        {
            let Some(c_path) = resolve_safe_transcript_path(&entry.cid) else {
                continue;
            };
            if let Ok(cst) = fs::metadata(&c_path) {
                let c_trk = self
                    .children
                    .iter()
                    .find(|(k, _)| k == &entry.cid)
                    .map(|(_, v)| v);
                let Some(ct) = c_trk else {
                    return true;
                };
                let cm = file_mtime_ms(&cst);
                if cst.len() as i64 != ct.last_seen_size || (cm - ct.last_mtime_ms).abs() > 0.001 {
                    return true;
                }
                if Self::is_child_idle_completed(ct, cm, now) {
                    return true;
                }
            }
        }
        false
    }
}
