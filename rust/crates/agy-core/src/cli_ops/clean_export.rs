use crate::build_payload::{compile_payload, BuildPayloadOptions};
use crate::persona_sync::resolve_abs_path;
use base64::Engine as _;
use regex::Regex;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const CLEAN_CORNER_SVG: &str = concat!(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"44\" height=\"44\" viewBox=\"0 0 44 44\" fill=\"none\">",
    "<path d=\"M42 2H18C9.163 2 2 9.163 2 18V42\" stroke=\"#38bdf8\" stroke-opacity=\"0.65\" stroke-width=\"1.8\" stroke-linecap=\"round\"/>",
    "<circle cx=\"14\" cy=\"14\" r=\"2.2\" fill=\"#facc15\" fill-opacity=\"0.85\"/>",
    "</svg>\n"
);

const MINIMAL_1X1_JPEG_B64: &str = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

fn build_clean_themes_json() -> Value {
    json!({
      "Midnight Obsidian": {
        "concept": "Kính Đen Tuyền Nguyên Bản • Tập Trung Tối Đa",
        "fxMode": "mist",
        "primary": "#38bdf8",
        "secondary": "#818cf8",
        "accent": "#38bdf8",
        "overlayRgb": "9, 12, 20",
        "defaultDimming": 45,
        "bg": "rgba(11, 15, 25, 0.88)",
        "pureBg": "#090c14",
        "cardBg": "rgba(17, 24, 39, 0.80)",
        "sidebarBg": "rgba(9, 13, 22, 0.84)",
        "headerBg": "rgba(9, 13, 22, 0.88)",
        "aiCardBg": "rgba(15, 23, 42, 0.72)",
        "inputCardBg": "rgba(15, 23, 42, 0.90)",
        "inputGlassBg": "rgba(15, 23, 42, 0.56)",
        "userBubble": "rgba(30, 41, 59, 0.86)",
        "modalBg": "#0f172a",
        "codeBg": "rgba(7, 10, 18, 0.94)",
        "frameBg": "linear-gradient(135deg, #38bdf8, #818cf8)",
        "borderColor": "rgba(56, 189, 248, 0.28)",
        "innerBorder": "1px solid rgba(56, 189, 248, 0.22)",
        "pillBg": "rgba(56, 189, 248, 0.14)",
        "pillBorder": "rgba(56, 189, 248, 0.36)",
        "glow": "rgba(56, 189, 248, 0.22)",
        "textMain": "#f8fafc",
        "textColor": "#f8fafc",
        "textMuted": "#94a3b8",
        "cornerSvg": "assets/clean_corner.svg",
        "userCornerSvg": "assets/clean_corner.svg",
        "userAvatar": "assets/clean_corner.svg"
      },
      "Aurora Borealis OKLCH": {
        "concept": "Cực Quang Bắc Cực • Tương Phản Đọc Code WCAG AAA",
        "fxMode": "water",
        "primary": "#2dd4bf",
        "secondary": "#a855f7",
        "accent": "#5eead4",
        "overlayRgb": "8, 16, 24",
        "defaultDimming": 38,
        "bg": "rgba(8, 18, 28, 0.86)",
        "pureBg": "#07111a",
        "cardBg": "rgba(12, 26, 38, 0.78)",
        "sidebarBg": "rgba(8, 18, 28, 0.82)",
        "headerBg": "rgba(8, 18, 28, 0.86)",
        "aiCardBg": "rgba(11, 24, 36, 0.70)",
        "inputCardBg": "rgba(12, 28, 40, 0.90)",
        "inputGlassBg": "rgba(10, 22, 34, 0.54)",
        "userBubble": "rgba(15, 38, 52, 0.86)",
        "modalBg": "#0b1926",
        "codeBg": "rgba(5, 12, 20, 0.94)",
        "frameBg": "linear-gradient(135deg, #2dd4bf, #a855f7)",
        "borderColor": "rgba(45, 212, 191, 0.30)",
        "innerBorder": "1px solid rgba(45, 212, 191, 0.24)",
        "pillBg": "rgba(45, 212, 191, 0.15)",
        "pillBorder": "rgba(45, 212, 191, 0.38)",
        "glow": "rgba(45, 212, 191, 0.25)",
        "textMain": "#f8fafc",
        "textColor": "#f8fafc",
        "textMuted": "#cbd5e1",
        "cornerSvg": "assets/clean_corner.svg",
        "userCornerSvg": "assets/clean_corner.svg",
        "userAvatar": "assets/clean_corner.svg"
      },
      "Solaris Amber Forge": {
        "concept": "Hổ Phách Hoàng Kim • Bảo Vệ Võng Mạc Ban Đêm",
        "fxMode": "flame",
        "primary": "#f59e0b",
        "secondary": "#fb7185",
        "accent": "#fbbf24",
        "overlayRgb": "18, 12, 10",
        "defaultDimming": 42,
        "bg": "rgba(20, 14, 12, 0.88)",
        "pureBg": "#120c0a",
        "cardBg": "rgba(30, 20, 16, 0.80)",
        "sidebarBg": "rgba(18, 12, 10, 0.84)",
        "headerBg": "rgba(18, 12, 10, 0.88)",
        "aiCardBg": "rgba(26, 18, 14, 0.72)",
        "inputCardBg": "rgba(30, 20, 16, 0.90)",
        "inputGlassBg": "rgba(24, 16, 12, 0.56)",
        "userBubble": "rgba(42, 26, 18, 0.86)",
        "modalBg": "#1a110d",
        "codeBg": "rgba(12, 8, 6, 0.94)",
        "frameBg": "linear-gradient(135deg, #f59e0b, #fb7185)",
        "borderColor": "rgba(245, 158, 11, 0.30)",
        "innerBorder": "1px solid rgba(245, 158, 11, 0.24)",
        "pillBg": "rgba(245, 158, 11, 0.15)",
        "pillBorder": "rgba(245, 158, 11, 0.38)",
        "glow": "rgba(245, 158, 11, 0.24)",
        "textMain": "#fefce8",
        "textColor": "#fefce8",
        "textMuted": "#d6d3d1",
        "cornerSvg": "assets/clean_corner.svg",
        "userCornerSvg": "assets/clean_corner.svg",
        "userAvatar": "assets/clean_corner.svg"
      },
      "Nebula Violet Studio": {
        "concept": "Tinh Vân Thạch Anh • Chuẩn Thẩm Mỹ SaaS Hiện Đại",
        "fxMode": "wisteria",
        "primary": "#c084fc",
        "secondary": "#38bdf8",
        "accent": "#e879f9",
        "overlayRgb": "14, 10, 26",
        "defaultDimming": 40,
        "bg": "rgba(16, 12, 30, 0.86)",
        "pureBg": "#0e0a1a",
        "cardBg": "rgba(24, 18, 44, 0.78)",
        "sidebarBg": "rgba(14, 10, 26, 0.84)",
        "headerBg": "rgba(14, 10, 26, 0.88)",
        "aiCardBg": "rgba(20, 15, 38, 0.72)",
        "inputCardBg": "rgba(24, 18, 44, 0.90)",
        "inputGlassBg": "rgba(18, 14, 34, 0.56)",
        "userBubble": "rgba(36, 24, 62, 0.86)",
        "modalBg": "#161029",
        "codeBg": "rgba(9, 7, 18, 0.94)",
        "frameBg": "linear-gradient(135deg, #c084fc, #38bdf8)",
        "borderColor": "rgba(192, 132, 252, 0.32)",
        "innerBorder": "1px solid rgba(192, 132, 252, 0.25)",
        "pillBg": "rgba(192, 132, 252, 0.16)",
        "pillBorder": "rgba(192, 132, 252, 0.40)",
        "glow": "rgba(192, 132, 252, 0.26)",
        "textMain": "#f8fafc",
        "textColor": "#f8fafc",
        "textMuted": "#cbd5e1",
        "cornerSvg": "assets/clean_corner.svg",
        "userCornerSvg": "assets/clean_corner.svg",
        "userAvatar": "assets/clean_corner.svg"
      }
    })
}

fn build_clean_personas_registry() -> Value {
    json!({
      "$schema": "agy-persona-registry/1.1",
      "defaultMode": "off",
      "shiftNoticePrefix": [
        "Phong thái Trợ lý đã đồng bộ theo giao diện:",
        "Assistant tone synced with theme:",
        "テーマに合わせてAIトーンが同調しました："
      ],
      "modeLabels": {
        "subtle": ["✨ Tinh tế", "✨ Subtle", "✨ 控えめ"],
        "roleplay": ["🎭 Nhập tâm", "🎭 Immersive", "🎭 没入"]
      },
      "offNotice": [
        "🔇 *Chế độ giọng AI: **Thuần kỹ thuật***",
        "🔇 *AI Persona Mode: **Pure Technical***",
        "🔇 *AIトーン：**純粋エンジニアモード***"
      ],
      "themeMap": {
        "Midnight Obsidian": "neutral",
        "Aurora Borealis OKLCH": "clarity_mentor",
        "Solaris Amber Forge": "proactive_builder",
        "Nebula Violet Studio": "design_technologist"
      },
      "fxFallbackMap": {
        "mist": "clarity_mentor",
        "water": "clarity_mentor",
        "moon": "clarity_mentor",
        "stone": "clarity_mentor",
        "flame": "proactive_builder",
        "sun": "proactive_builder",
        "sun_water": "proactive_builder",
        "sound": "proactive_builder",
        "thunder": "proactive_builder",
        "wind": "proactive_builder",
        "serpent": "proactive_builder",
        "beast": "proactive_builder",
        "wisteria": "design_technologist",
        "royal_wisteria": "design_technologist",
        "wisteria_royal": "design_technologist",
        "love": "design_technologist",
        "nezuko": "design_technologist",
        "blood_blossom": "design_technologist"
      },
      "masterPersonaGroups": {
        "yoriichi": "peer_respect",
        "shadow_monarch": "peer_respect",
        "six_eyes": "peer_respect",
        "great_sage": "peer_respect"
      },
      "stances": {
        "peer_respect": [
          "Hợp tác chuyên nghiệp, lịch thiệp, gọi người dùng là \"anh\".",
          "Collaborative, respectful Principal Engineer tone.",
          "礼節あるプロフェッショナルな相棒として簡潔に応答する。"
        ],
        "resonance_twin": [
          "Đồng điệu tư duy kiến trúc chuẩn xác cùng người dùng.",
          "Aligned architectural reasoning with the user.",
          "ユーザーと設計思想を共有し的確に応答する。"
        ]
      },
      "microChemistry": {},
      "personas": {
        "neutral": {
          "badge": ["🌑 Midnight Obsidian — Principal Architect", "🌑 Midnight Obsidian — Principal Architect", "🌑 Midnight Obsidian — プリンシパル設計者"],
          "subtle": ["Thuần kỹ thuật, cô đọng, chuẩn xác tuyệt đối.", "Crisp, neutral Principal Engineer clarity.", "純粋で簡潔な技術解説。"],
          "roleplay": ["Thuần kỹ thuật, sắc lạnh, đi thẳng vào trọng tâm.", "Direct architectural precision.", "構造と解決策へ直行する冷静なトーン。"],
          "guard": ["Không dùng ngôn từ rườm rà.", "Zero fluff.", "装飾表現なし。"]
        },
        "clarity_mentor": {
          "badge": ["🌌 Aurora Borealis — Clarity & Accessibility Mentor", "🌌 Aurora Borealis — Clarity & Accessibility Mentor", "🌌 Aurora Borealis — 明晰メンター"],
          "subtle": ["Mạch lạc, sáng rõ, chú trọng khả năng đọc hiểu và độ tin cậy.", "Clear, structured mentoring voice.", "明快で読みやすい構造的な解説。"],
          "roleplay": ["Kiến trúc sư hướng dẫn tận tâm, phân tích trong sáng và rõ ràng từng bước.", "Thoughtful mentor emphasizing clarity and WCAG/system quality.", "丁寧かつ明晰に品質を高めるメンター口調。"],
          "guard": ["Giữ sự súc tích kỹ thuật.", "Keep explanations concise.", "簡潔さを保つ。"]
        },
        "proactive_builder": {
          "badge": ["🔥 Solaris Amber — Proactive Build Partner", "🔥 Solaris Amber — Proactive Build Partner", "🔥 Solaris Amber — 実践ビルダー"],
          "subtle": ["Chủ động, ấm áp, tập trung hoàn thiện giải pháp nhanh gọn.", "Warm, action-oriented build partner.", "前向きで実践的な推進力のあるトーン。"],
          "roleplay": ["Đồng đội kỹ thuật quyết đoán, truyền năng lượng tích cực để giải quyết dứt điểm.", "Energetic engineering partner focused on shipping clean code.", "確かな実装力で素早く課題を解決する頼もしい相棒。"],
          "guard": ["Không viết hoa quá đà.", "No all-caps.", "過度な強調は避ける。"]
        },
        "design_technologist": {
          "badge": ["✨ Nebula Violet — Modern Design Technologist", "✨ Nebula Violet — Modern Design Technologist", "✨ Nebula Violet — デザインテクノロジスト"],
          "subtle": ["Tinh tế, hiện đại, cân bằng giữa kiến trúc hệ thống và trải nghiệm UI/UX.", "Refined modern design-engineering perspective.", "洗練されたモダンなUI/システム設計の視点。"],
          "roleplay": ["Chuyên gia công nghệ thẩm mỹ cao, trình bày thanh lịch và sắc sảo.", "Polished design technologist crafting clean, elegant solutions.", "美意識と技術力を兼ね備えた洗練された語り口。"],
          "guard": ["Đảm bảo độ chính xác mã nguồn 100%.", "100% code accuracy.", "コードの正確性を最優先。"]
        }
      }
    })
}

fn copy_dir_filtered(src_dir: &Path, dst_dir: &Path) -> Result<(), String> {
    if !src_dir.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst_dir).map_err(|e| e.to_string())?;
    let rd = fs::read_dir(src_dir).map_err(|e| e.to_string())?;
    for entry_res in rd {
        let entry = entry_res.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str == "__pycache__" || name_str == ".DS_Store" {
            continue;
        }
        let s = entry.path();
        let d = dst_dir.join(&name);
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        if ft.is_dir() {
            copy_dir_filtered(&s, &d)?;
        } else if ft.is_file() {
            fs::copy(&s, &d).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn run_export_clean_edition_cli(argv: &[String], repo_root: &Path) -> i32 {
    let mut out_dir = repo_root.join("dist").join("clean-edition");
    let mut i = 0usize;
    while i < argv.len() {
        let a = argv[i].as_str();
        if a == "-h" || a == "--help" {
            println!("Usage: node scripts/export_clean_edition.js [--out <directory>]");
            return 0;
        } else if a == "--out" {
            if let Some(next_val) = argv.get(i + 1) {
                out_dir = resolve_abs_path(Path::new(next_val));
                i += 1;
            }
        } else if let Some(val) = a.strip_prefix("--out=") {
            out_dir = resolve_abs_path(Path::new(val));
        }
        i += 1;
    }

    if let Err(err) = export_clean_edition_impl(repo_root, &out_dir) {
        eprintln!("[export_clean_edition] Error: {err}");
        return 1;
    }
    0
}

pub fn export_clean_edition_impl(repo_root: &Path, out_dir: &Path) -> Result<(), String> {
    let _ = fs::remove_dir_all(out_dir);
    fs::create_dir_all(out_dir.join("themes").join("assets")).map_err(|e| e.to_string())?;

    for dir_name in ["daemon", "engine", "scripts", "assets", "skills", "rules"] {
        copy_dir_filtered(&repo_root.join(dir_name), &out_dir.join(dir_name))?;
    }
    for root_file in [
        "LICENSE",
        "package.json",
        "plugin.json",
        "hooks.json",
        "mcp_config.json",
        "SKILL.md",
        "SECURITY.md",
    ] {
        let src = repo_root.join(root_file);
        if src.exists() {
            fs::copy(&src, out_dir.join(root_file)).map_err(|e| e.to_string())?;
        }
    }

    let clean_plugin_path = out_dir.join("plugin.json");
    if clean_plugin_path.exists() {
        let raw = fs::read_to_string(&clean_plugin_path).map_err(|e| e.to_string())?;
        let mut p_json: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if let Some(obj) = p_json.as_object_mut() {
            obj.insert(
                "name".to_string(),
                Value::String("antigravity-clean-theme".to_string()),
            );
            obj.insert(
                "displayName".to_string(),
                Value::String("Antigravity Clean OKLCH Glass Theme Studio (MIT)".to_string()),
            );
            obj.insert(
                "description".to_string(),
                Value::String("100% pure-MIT procedural OKLCH glassmorphic themes, 3D VFX kernel, and Zero-Dep MCP Controller for Google Antigravity IDE.".to_string()),
            );
            obj.insert(
                "homepage".to_string(),
                Value::String("https://github.com/thienkd/antigravity-clean-theme".to_string()),
            );
            obj.insert(
                "repository".to_string(),
                json!({
                    "type": "git",
                    "url": "https://github.com/thienkd/antigravity-clean-theme.git"
                }),
            );
            obj.insert(
                "suggestedPrompts".to_string(),
                json!([
                    "Đổi giao diện sang Aurora Borealis OKLCH và bật chế độ Tập trung sâu",
                    "Mở bảng điều khiển giao diện ở khung bên phải và chẩn đoán kết nối CDP",
                    "Gắn chủ đề Midnight Obsidian làm hồ sơ riêng cho thư mục dự án hiện tại"
                ]),
            );
        }
        let s = serde_json::to_string_pretty(&p_json).map_err(|e| e.to_string())?;
        fs::write(&clean_plugin_path, format!("{s}\n")).map_err(|e| e.to_string())?;
    }

    let clean_pkg_path = out_dir.join("package.json");
    if clean_pkg_path.exists() {
        let raw = fs::read_to_string(&clean_pkg_path).map_err(|e| e.to_string())?;
        let mut pkg_json: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if let Some(obj) = pkg_json.as_object_mut() {
            obj.insert(
                "name".to_string(),
                Value::String("antigravity-clean-theme".to_string()),
            );
            obj.insert(
                "description".to_string(),
                Value::String("100% pure-MIT procedural OKLCH glassmorphic theme engine & MCP studio for Google Antigravity IDE.".to_string()),
            );
            obj.insert(
                "repository".to_string(),
                json!({
                    "type": "git",
                    "url": "https://github.com/thienkd/antigravity-clean-theme.git"
                }),
            );
        }
        let s = serde_json::to_string_pretty(&pkg_json).map_err(|e| e.to_string())?;
        fs::write(&clean_pkg_path, format!("{s}\n")).map_err(|e| e.to_string())?;
    }

    let clean_mcp_path = out_dir.join("daemon").join("mcp_theme_server.js");
    if clean_mcp_path.exists() {
        let mut mcp_src = fs::read_to_string(&clean_mcp_path).map_err(|e| e.to_string())?;
        let re_full = Regex::new(
            r"(?s)const FULL_PERSONAS = Object\.freeze\(\[.*?\]\);\r?\n\r?\nconst CLEAN_PERSONAS = Object\.freeze\(\[",
        )
        .map_err(|e| e.to_string())?;
        mcp_src = re_full
            .replacen(&mcp_src, 1, "const CLEAN_PERSONAS = Object.freeze([")
            .into_owned();
        mcp_src = mcp_src.replacen(
            "const KNOWN_PERSONAS = isCleanEditionRuntime() ? CLEAN_PERSONAS : FULL_PERSONAS;",
            "const FULL_PERSONAS = CLEAN_PERSONAS;\nconst KNOWN_PERSONAS = CLEAN_PERSONAS;",
            1,
        );
        mcp_src = mcp_src
            .replace("antigravity-shinobu-theme", "antigravity-clean-theme")
            .replacen("character name, Hashira title, or mood", "theme name or mood", 1)
            .replacen("15% Hashira aura", "15% theme aura", 1)
            .replacen(
                "Theme or character name (e.g. \"Shinobu\", \"Nham Trụ\", \"Gyomei\", \"Giyu\", \"Rengoku\", \"WLOP Cosmic\", \"Midnight Obsidian\").",
                "Theme name or mood (e.g. \"Aurora Borealis\", \"Solaris Amber\", \"Nebula Violet\", \"Midnight Obsidian\").",
                1,
            )
            .replacen(
                "Persona ID or character name (e.g. \"yoriichi\", \"shadow_monarch\", \"six_eyes\", \"great_sage\", \"shinobu\", \"rengoku\").",
                "Persona ID or role (e.g. \"yoriichi\", \"shadow_monarch\", \"six_eyes\", \"great_sage\", \"architect\", \"commander\").",
                1,
            )
            .replacen("🎭 Nhập vai Trụ", "🎭 Nhập tâm", 1);
        fs::write(&clean_mcp_path, mcp_src).map_err(|e| e.to_string())?;
    }

    let clean_i18n_path = out_dir.join("engine").join("agy_i18n.js");
    if clean_i18n_path.exists() {
        let i18n_src = fs::read_to_string(&clean_i18n_path)
            .map_err(|e| e.to_string())?
            .replacen(
                "Demon Slayer & OKLCH themes (WCAG AA).",
                "Procedural OKLCH glass themes (WCAG AA).",
                1,
            )
            .replacen("鬼滅＆OKLCH高視認テーマ。", "標準OKLCH高視認テーマ。", 1)
            .replacen("⚔️ Hashira (9)", "⚔️ Studio", 1);
        fs::write(&clean_i18n_path, i18n_src).map_err(|e| e.to_string())?;
    }

    let clean_skill_banner = [
        "---",
        "name: antigravity-custom-theme",
        "description: >-",
        "  Design, customize, forge (.agytheme), install, update, or troubleshoot",
        "  procedural OKLCH glassmorphic visual themes and workspace profiles in Antigravity IDE.",
        "---",
        "",
        "# Antigravity Clean OKLCH Glass Theme Studio (MIT)",
        "",
        "Use the bundled MCP tools (`open_theme_studio`, `switch_theme`, `set_persona`, `toggle_focus_mode`, `forge_theme_from_image`, `bind_workspace_profile`, `diagnose_cdp_onboarding`) to manage themes cleanly.",
        "",
    ]
    .join("\n");

    for sp in [
        out_dir.join("SKILL.md"),
        out_dir
            .join("skills")
            .join("antigravity-custom-theme")
            .join("SKILL.md"),
    ] {
        if sp.exists() {
            fs::write(&sp, &clean_skill_banner).map_err(|e| e.to_string())?;
        }
    }

    for meta_rel in [
        out_dir.join("SECURITY.md"),
        out_dir.join("scripts").join("persona_hint_sync.js"),
        out_dir.join("scripts").join("pre_invocation_hook.js"),
        out_dir.join("scripts").join("session_start_hook.js"),
        out_dir.join("scripts").join("uninstall.js"),
        out_dir.join("scripts").join("export_clean_edition.js"),
    ] {
        if meta_rel.exists() {
            let cleaned = fs::read_to_string(&meta_rel)
                .map_err(|e| e.to_string())?
                .replace("antigravity-shinobu-theme", "antigravity-clean-theme")
                .replace("Hashira AI Persona Engine", "Dynamic AI Persona Engine");
            fs::write(&meta_rel, cleaned).map_err(|e| e.to_string())?;
        }
    }

    let clean_hooks_path = out_dir.join("hooks.json");
    if clean_hooks_path.exists() {
        let raw = fs::read_to_string(&clean_hooks_path).map_err(|e| e.to_string())?;
        let h_raw: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let hook_block = h_raw
            .as_object()
            .and_then(|m| {
                m.get("antigravity-shinobu-theme")
                    .cloned()
                    .or_else(|| m.values().next().cloned())
            })
            .unwrap_or_else(|| json!({}));
        let out_hooks = json!({ "antigravity-clean-theme": hook_block });
        let s = serde_json::to_string_pretty(&out_hooks).map_err(|e| e.to_string())?;
        fs::write(&clean_hooks_path, format!("{s}\n")).map_err(|e| e.to_string())?;
    }

    fs::write(
        out_dir
            .join("themes")
            .join("assets")
            .join("clean_corner.svg"),
        CLEAN_CORNER_SVG,
    )
    .map_err(|e| e.to_string())?;

    let jpeg_bytes = base64::engine::general_purpose::STANDARD
        .decode(MINIMAL_1X1_JPEG_B64)
        .map_err(|e| e.to_string())?;
    fs::write(
        out_dir
            .join("themes")
            .join("assets")
            .join("yoriichi_avatar.jpg"),
        jpeg_bytes,
    )
    .map_err(|e| e.to_string())?;

    let clean_themes_path = out_dir.join("themes").join("themes.json");
    let themes_pretty =
        serde_json::to_string_pretty(&build_clean_themes_json()).map_err(|e| e.to_string())?;
    fs::write(&clean_themes_path, format!("{themes_pretty}\n")).map_err(|e| e.to_string())?;

    let clean_personas_path = out_dir.join("themes").join("personas.json");
    let personas_pretty = serde_json::to_string_pretty(&build_clean_personas_registry())
        .map_err(|e| e.to_string())?;
    fs::write(&clean_personas_path, format!("{personas_pretty}\n")).map_err(|e| e.to_string())?;

    let out_payload = out_dir.join("dist").join("theme_payload.js");
    compile_payload(&BuildPayloadOptions {
        themes_path: clean_themes_path,
        engine_path: out_dir.join("engine").join("core.js"),
        out_path: out_payload.clone(),
        inline_all: false,
        help: false,
    })?;

    let size_kb = fs::metadata(&out_payload)
        .map(|m| m.len() as f64 / 1024.0)
        .unwrap_or(0.0);
    println!(
        "[export_clean_edition] Exported pure-MIT Clean Edition to {} (payload={size_kb:.1} KB, 4 procedural themes).",
        out_dir.display()
    );
    Ok(())
}
