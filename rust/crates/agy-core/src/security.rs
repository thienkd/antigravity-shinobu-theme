use getrandom::getrandom;
use serde_json::{Map, Value};
use std::path::Path;

pub const DANGEROUS_KEYS: &[&str] = &[
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
];

pub fn is_dangerous_key(k: &str) -> bool {
    DANGEROUS_KEYS.contains(&k)
}

pub fn generate_ephemeral_token_hex() -> String {
    let mut bytes = [0u8; 32];
    let _ = getrandom(&mut bytes);
    hex::encode(bytes)
}

pub fn random_hex_4() -> String {
    let mut bytes = [0u8; 4];
    let _ = getrandom(&mut bytes);
    hex::encode(bytes)
}

/// Constant-time match against a 64-byte ASCII hex token.
pub fn timing_safe_token_match(candidate: &str, expected_hex_64: &str) -> bool {
    let cand_bytes = candidate.as_bytes();
    let exp_bytes = expected_hex_64.as_bytes();
    if cand_bytes.len() != 64 || exp_bytes.len() != 64 {
        return false;
    }
    // Also ensure UTF-16 code unit count == 64 (ASCII-only check matches JS candidate.length === 64 && byteLength === 64)
    if !candidate.is_ascii() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..64 {
        diff |= cand_bytes[i] ^ exp_bytes[i];
    }
    diff == 0
}

pub fn is_win_device_basename(base: &str) -> bool {
    let stem = match base.split('.').next() {
        Some(s) => s,
        None => base,
    };
    let lower = stem.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    )
}

pub fn is_unc_or_device_path(raw_path: &str) -> bool {
    let s = raw_path.trim();
    if s.is_empty() || s.contains('\0') {
        return true;
    }
    if s.starts_with("\\\\") || s.starts_with("//") {
        return true;
    }
    let normalized = s.replace('\\', "/");
    let base = normalized
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("");
    if is_win_device_basename(base) {
        return true;
    }
    if let Some(os_base) = Path::new(s).file_name().and_then(|n| n.to_str()) {
        if is_win_device_basename(os_base) {
            return true;
        }
    }
    false
}

pub fn is_safe_local_regular_file(file_path: &Path) -> bool {
    let Some(s) = file_path.to_str() else {
        return false;
    };
    if is_unc_or_device_path(s) {
        return false;
    }
    match std::fs::symlink_metadata(file_path) {
        Ok(meta) => meta.file_type().is_file() && !meta.file_type().is_symlink(),
        Err(_) => false,
    }
}

/// Slice a Rust UTF-8 `&str` by at most `max_utf16_units` UTF-16 code units without splitting surrogate pairs.
pub fn slice_utf16_safe(s: &str, max_utf16_units: usize) -> &str {
    let mut units = 0usize;
    for (byte_idx, ch) in s.char_indices() {
        let len16 = ch.len_utf16();
        if units + len16 > max_utf16_units {
            return &s[..byte_idx];
        }
        units += len16;
    }
    s
}

pub fn strip_proto_keys(val: &Value, depth: usize) -> Value {
    if depth > 8 {
        return val.clone();
    }
    match val {
        Value::Array(arr) => Value::Array(
            arr.iter()
                .map(|item| strip_proto_keys(item, depth + 1))
                .collect(),
        ),
        Value::Object(map) => {
            let mut out = Map::with_capacity(map.len());
            for (k, v) in map {
                if is_dangerous_key(k) {
                    continue;
                }
                out.insert(k.clone(), strip_proto_keys(v, depth + 1));
            }
            Value::Object(out)
        }
        _ => val.clone(),
    }
}

pub fn sort_keys_deep(val: &Value, depth: usize) -> Value {
    if depth > 8 {
        return val.clone();
    }
    match val {
        Value::Array(arr) => Value::Array(
            arr.iter()
                .map(|item| sort_keys_deep(item, depth + 1))
                .collect(),
        ),
        Value::Object(map) => {
            let mut keys: Vec<&String> = map
                .keys()
                .filter(|k| !is_dangerous_key(k.as_str()))
                .collect();
            keys.sort();
            let mut out = Map::with_capacity(keys.len());
            for k in keys {
                if let Some(v) = map.get(k) {
                    out.insert(k.clone(), sort_keys_deep(v, depth + 1));
                }
            }
            Value::Object(out)
        }
        _ => val.clone(),
    }
}
