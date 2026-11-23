use crate::persona_sync::resolve_abs_path;
use base64::Engine as _;
use regex::Regex;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const ASSET_KEYS: &[&str] = &[
    "wallpaper",
    "sticker",
    "userSticker",
    "actionSticker",
    "userActionSticker",
    "cornerSvg",
    "userCornerSvg",
    "userAvatar",
    "agentAvatar",
];

pub const HYBRID_INLINE_CANDIDATES: &[&str] = &[
    "cornerSvg",
    "userCornerSvg",
    "userAvatar",
    "sticker",
    "userSticker",
];

pub const HYBRID_INLINE_MAX_BYTES: usize = 12 * 1024;
pub const PLACEHOLDER: &str = "/*__THEMES_PLACEHOLDER__*/{}";

pub const EXTRA_MODULES: &[&str] = &[
    "agy_security.js",
    "agy_i18n.js",
    "kny_semantic_icons.js",
    "kny_bio_audio.js",
    "kny_fx_modes.js",
    "kny_3d_vfx_kernel.js",
    "kny_breathing_skills.js",
    "kny_chibi_aura.js",
    "kny_squad_raid.js",
    "kny_token_hud.js",
    "agy_theme_forge.js",
    "kny_cinema_director.js",
];

fn unsafe_svg_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)<script|<foreignobject|<iframe|<object|<embed|\bon[a-z]+\s*=|javascript:")
            .expect("valid static SVG XSS regex")
    })
}

pub fn read_utf8_no_bom(file_path: &Path) -> Result<String, String> {
    let raw = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read {}: {e}", file_path.display()))?;
    let no_bom = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    // Exact equivalent of JS `.replace(/\r\n?/g, '\n')`
    let mut out = String::with_capacity(no_bom.len());
    let mut chars = no_bom.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\r' {
            if chars.peek() == Some(&'\n') {
                let _ = chars.next();
            }
            out.push('\n');
        } else {
            out.push(ch);
        }
    }
    Ok(out)
}

pub fn assert_safe_svg_content(svg_text: &str, asset_path: &Path) -> Result<(), String> {
    if unsafe_svg_regex().is_match(svg_text) {
        return Err(format!(
            "Security violation: unsafe executable markup detected in SVG asset: {}",
            asset_path.display()
        ));
    }
    Ok(())
}

/// Exact byte-for-byte match with `encodeURIComponent(svgText).replace(/[!'()*~]/g, ...)`
/// and Python `urllib.parse.quote(svg_text, safe="-_.").replace("~", "%7E")`.
pub fn encode_strict_svg_data_uri(svg_text: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let bytes = svg_text.as_bytes();
    let mut out = String::with_capacity(19 + bytes.len() * 2);
    out.push_str("data:image/svg+xml,");
    for &b in bytes {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' {
            out.push(b as char);
        } else {
            out.push('%');
            out.push(HEX[(b >> 4) as usize] as char);
            out.push(HEX[(b & 0x0f) as usize] as char);
        }
    }
    out
}

fn mime_by_ext(ext_lower: &str) -> &'static str {
    match ext_lower {
        ".webp" => "image/webp",
        ".png" => "image/png",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".svg" => "image/svg+xml",
        _ => "image/png",
    }
}

fn ext_with_dot_lower(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|s| format!(".{}", s.to_ascii_lowercase()))
        .unwrap_or_default()
}

pub fn encode_file_as_data_uri(asset_path: &Path) -> Result<String, String> {
    let ext = ext_with_dot_lower(asset_path);
    if ext == ".svg" {
        let svg_text = read_utf8_no_bom(asset_path)?;
        assert_safe_svg_content(&svg_text, asset_path)?;
        return Ok(encode_strict_svg_data_uri(&svg_text));
    }
    let raw = fs::read(asset_path)
        .map_err(|e| format!("Failed to read asset {}: {e}", asset_path.display()))?;
    let mime = mime_by_ext(&ext);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&raw);
    Ok(format!("data:{mime};base64,{b64}"))
}

fn normalize_drive_case_win(abs_path: &Path) -> PathBuf {
    if cfg!(windows) {
        if let Some(s) = abs_path.to_str() {
            let bytes = s.as_bytes();
            if bytes.len() >= 2 && bytes[0].is_ascii_lowercase() && bytes[1] == b':' {
                let mut owned = s.to_string();
                owned.replace_range(0..1, &(bytes[0].to_ascii_uppercase() as char).to_string());
                return PathBuf::from(owned);
            }
        }
    }
    abs_path.to_path_buf()
}

fn to_posix_relative_if_inside(asset_path: &Path, themes_dir: &Path) -> Option<String> {
    let resolved_themes = normalize_drive_case_win(&resolve_abs_path(themes_dir));
    let resolved_asset = normalize_drive_case_win(&resolve_abs_path(asset_path));
    let rel = resolved_asset.strip_prefix(&resolved_themes).ok()?;
    let rel_str = rel.to_str()?;
    if rel_str.is_empty() {
        return None;
    }
    Some(rel_str.replace('\\', "/"))
}

fn resolve_asset_value(
    key: &str,
    value: &Value,
    themes_dir: &Path,
    inline_all: bool,
) -> Result<Value, String> {
    let Some(s) = value.as_str() else {
        return Ok(value.clone());
    };
    let trimmed = s.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("data:")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
    {
        return Ok(Value::String(trimmed.to_string()));
    }

    let p = Path::new(trimmed);
    let asset_path = if p.is_absolute() {
        p.to_path_buf()
    } else {
        resolve_abs_path(&themes_dir.join(trimmed))
    };

    match fs::metadata(&asset_path) {
        Ok(m) if m.is_file() => {}
        _ => {
            return Err(format!(
                "Theme asset not found: {trimmed} (resolved: {})",
                asset_path.display()
            ));
        }
    }

    let ext = ext_with_dot_lower(&asset_path);
    let normalized_svg_text = if ext == ".svg" {
        let svg = read_utf8_no_bom(&asset_path)?;
        assert_safe_svg_content(&svg, &asset_path)?;
        Some(svg)
    } else {
        None
    };

    if inline_all {
        let uri = match normalized_svg_text {
            Some(ref svg) => encode_strict_svg_data_uri(svg),
            None => encode_file_as_data_uri(&asset_path)?,
        };
        return Ok(Value::String(uri));
    }

    let Some(rel_posix) = to_posix_relative_if_inside(&asset_path, themes_dir) else {
        let uri = match normalized_svg_text {
            Some(ref svg) => encode_strict_svg_data_uri(svg),
            None => encode_file_as_data_uri(&asset_path)?,
        };
        return Ok(Value::String(uri));
    };

    let raw_bytes = match normalized_svg_text {
        Some(ref svg) => svg.as_bytes().to_vec(),
        None => fs::read(&asset_path)
            .map_err(|e| format!("Failed to read asset {}: {e}", asset_path.display()))?,
    };

    if HYBRID_INLINE_CANDIDATES.contains(&key) && raw_bytes.len() < HYBRID_INLINE_MAX_BYTES {
        let uri = match normalized_svg_text {
            Some(ref svg) => encode_strict_svg_data_uri(svg),
            None => encode_file_as_data_uri(&asset_path)?,
        };
        return Ok(Value::String(uri));
    }

    let digest = Sha256::digest(&raw_bytes);
    let hash8 = &hex::encode(digest)[..8];
    Ok(Value::String(format!("{rel_posix}?v={hash8}")))
}

#[derive(Debug, Clone)]
pub struct BuildPayloadOptions {
    pub themes_path: PathBuf,
    pub engine_path: PathBuf,
    pub out_path: PathBuf,
    pub inline_all: bool,
    pub help: bool,
}

pub fn usage_text() -> &'static str {
    concat!(
        "Usage: node scripts/build_payload.js [options]\n",
        "\n",
        "Options:\n",
        "  --themes <path>   Path to themes.json (default: themes/themes.json)\n",
        "  --engine <path>   Path to engine/core.js (default: engine/core.js)\n",
        "  --out <path>      Output bundle path (default: dist/theme_payload.js)\n",
        "  --inline-all      Embed all assets (including 2K wallpapers) as data: URIs\n",
        "  -h, --help        Show this help message and exit"
    )
}

pub fn parse_build_args(argv: &[String], repo_root: &Path) -> Result<BuildPayloadOptions, String> {
    let mut opts = BuildPayloadOptions {
        themes_path: repo_root.join("themes").join("themes.json"),
        engine_path: repo_root.join("engine").join("core.js"),
        out_path: repo_root.join("dist").join("theme_payload.js"),
        inline_all: false,
        help: false,
    };

    let read_opt_val =
        |flag: &str, inline_val: Option<&str>, next_val: Option<&str>| -> Result<PathBuf, String> {
            let val = inline_val.or(next_val).unwrap_or("");
            if val.is_empty() || val.starts_with("--") {
                return Err(format!("Missing valid path value for CLI option '{flag}'."));
            }
            Ok(resolve_abs_path(Path::new(val)))
        };

    let mut i = 0usize;
    while i < argv.len() {
        let arg = argv[i].as_str();
        if arg == "-h" || arg == "--help" {
            opts.help = true;
        } else if arg == "--inline-all" {
            opts.inline_all = true;
        } else if arg == "--themes" {
            i += 1;
            opts.themes_path = read_opt_val("--themes", None, argv.get(i).map(|s| s.as_str()))?;
        } else if let Some(v) = arg.strip_prefix("--themes=") {
            opts.themes_path = read_opt_val("--themes", Some(v), None)?;
        } else if arg == "--engine" {
            i += 1;
            opts.engine_path = read_opt_val("--engine", None, argv.get(i).map(|s| s.as_str()))?;
        } else if let Some(v) = arg.strip_prefix("--engine=") {
            opts.engine_path = read_opt_val("--engine", Some(v), None)?;
        } else if arg == "--out" {
            i += 1;
            opts.out_path = read_opt_val("--out", None, argv.get(i).map(|s| s.as_str()))?;
        } else if let Some(v) = arg.strip_prefix("--out=") {
            opts.out_path = read_opt_val("--out", Some(v), None)?;
        } else {
            return Err(format!(
                "Unknown or unsupported CLI argument: '{arg}'. Run with --help for usage."
            ));
        }
        i += 1;
    }

    Ok(opts)
}

pub fn compile_payload(opts: &BuildPayloadOptions) -> Result<String, String> {
    if !fs::metadata(&opts.themes_path)
        .map(|m| m.is_file())
        .unwrap_or(false)
    {
        return Err(format!(
            "themes.json not found: {}",
            opts.themes_path.display()
        ));
    }
    if !fs::metadata(&opts.engine_path)
        .map(|m| m.is_file())
        .unwrap_or(false)
    {
        return Err(format!("core.js not found: {}", opts.engine_path.display()));
    }

    let themes_str = read_utf8_no_bom(&opts.themes_path)?;
    let themes_val: Value =
        serde_json::from_str(&themes_str).map_err(|e| format!("Invalid themes.json: {e}"))?;
    let Some(themes_map) = themes_val.as_object() else {
        return Err("themes.json must be a non-empty JSON object keyed by theme name.".to_string());
    };
    if themes_map.is_empty() {
        return Err("themes.json must be a non-empty JSON object keyed by theme name.".to_string());
    }

    let themes_dir = opts.themes_path.parent().unwrap_or_else(|| Path::new("."));
    let mut resolved = Map::with_capacity(themes_map.len());
    let mut theme_names = Vec::with_capacity(themes_map.len());

    for (name, cfg_val) in themes_map {
        let Some(cfg_obj) = cfg_val.as_object() else {
            return Err(format!("Theme '{name}' must be a JSON object."));
        };
        let mut copied = cfg_obj.clone();
        for &key in ASSET_KEYS {
            if let Some(existing_val) = copied.get(key).cloned() {
                let new_val = resolve_asset_value(key, &existing_val, themes_dir, opts.inline_all)?;
                copied.insert(key.to_string(), new_val);
            }
        }
        theme_names.push(name.clone());
        resolved.insert(name.clone(), Value::Object(copied));
    }

    let engine_src = read_utf8_no_bom(&opts.engine_path)?;
    let placeholder_count = engine_src.matches(PLACEHOLDER).count();
    if placeholder_count != 1 {
        return Err(format!(
            "Expected exactly 1 '{PLACEHOLDER}' placeholder in {}, found {placeholder_count}.",
            opts.engine_path.display()
        ));
    }

    let resolved_json = serde_json::to_string(&Value::Object(resolved))
        .map_err(|e| format!("Failed to serialize resolved themes: {e}"))?;
    let mut compiled = engine_src.replacen(PLACEHOLDER, &resolved_json, 1);

    let engine_dir = opts.engine_path.parent().unwrap_or_else(|| Path::new("."));
    let mut prepends = Vec::with_capacity(EXTRA_MODULES.len());
    for &mod_name in EXTRA_MODULES {
        let mod_path = engine_dir.join(mod_name);
        if !fs::metadata(&mod_path)
            .map(|m| m.is_file())
            .unwrap_or(false)
        {
            return Err(format!(
                "Required engine module missing: {}",
                mod_path.display()
            ));
        }
        prepends.push(read_utf8_no_bom(&mod_path)?);
    }
    if !prepends.is_empty() {
        compiled = format!("{}\n{}", prepends.join("\n"), compiled);
    }

    let final_bundle = [
        "(function(__AGY_BOOT__) {",
        "let __AGY_PRECLEANED__ = false;",
        "if (typeof window !== \"undefined\" && typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === \"function\") {",
        "  try { window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__({ isReinject: true }); } catch (_) {}",
        "  __AGY_PRECLEANED__ = true;",
        "}",
        &compiled,
        "})(typeof __AGY_INJECT_BOOT__ !== \"undefined\" ? __AGY_INJECT_BOOT__ : null);",
        "",
    ]
    .join("\n");

    if let Some(parent) = opts.out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create output directory {}: {e}",
                parent.display()
            )
        })?;
    }
    fs::write(&opts.out_path, final_bundle.as_bytes())
        .map_err(|e| format!("Failed to write {}: {e}", opts.out_path.display()))?;

    let size_kb = final_bundle.len() as f64 / 1024.0;
    let mode_label = if opts.inline_all {
        "inline-all"
    } else {
        "hybrid"
    };
    Ok(format!(
        "[build_payload.js] Built {} ({size_kb:.1} KB, mode={mode_label}) with {} theme(s): {}",
        opts.out_path.display(),
        theme_names.len(),
        theme_names.join(", ")
    ))
}

pub fn run_build_payload_cli(argv: &[String], repo_root: &Path) -> i32 {
    match parse_build_args(argv, repo_root) {
        Ok(opts) => {
            if opts.help {
                println!("{}", usage_text());
                return 0;
            }
            match compile_payload(&opts) {
                Ok(msg) => {
                    println!("{msg}");
                    0
                }
                Err(err) => {
                    eprintln!("[build_payload.js] Error: {err}");
                    2
                }
            }
        }
        Err(err) => {
            eprintln!("[build_payload.js] Error: {err}");
            2
        }
    }
}
