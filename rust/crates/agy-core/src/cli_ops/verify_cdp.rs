use crate::cli_ops::cdp_client::{
    evaluate_cdp_page, fetch_json_loopback, is_candidate_antigravity_url, resolve_port_file,
};
use crate::cli_ops::proc_scan::{is_verified_any_daemon_process, scan_all_live_daemon_pids};
use crate::persona_sync::{home_dir, resolve_abs_path};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub const INSPECT_EXPR: &str = r#"(() => {
    const isAntigravityDom = Boolean(
        document.querySelector('.agy-shell, .monaco-workbench, [data-launchpad], #workbench\\.parts\\.editor') ||
        /Antigravity/i.test(document.title || '') ||
        /^\/(c\/[0-9a-f-]{36}|launchpad)/i.test(location.pathname || '')
    );
    if (!isAntigravityDom) {
        return { isAntigravityDom: false };
    }
    const styleEl = document.getElementById('antigravity-custom-theme-active');
    const shellEl = document.querySelector('.agy-shell, .monaco-workbench');
    const mainGrid = document.querySelector('[data-testid="sidebar-split"], div.flex.h-full.flex-col.overflow-hidden.relative > div.flex.flex-1.flex-row.overflow-hidden.relative');
    const domDiagnostics =
        window.__AGY_THEME_CORE__ && typeof window.__AGY_THEME_CORE__.diagnoseDomContracts === 'function'
            ? window.__AGY_THEME_CORE__.diagnoseDomContracts()
            : null;
    const projPill = document.querySelector('[data-testid="project-selector-trigger"]');
    const envPill = document.querySelector('[aria-label="Select Environment"]');
    const scrollers = Array.from(document.querySelectorAll('.overflow-y-auto, [data-main-content-body], [data-side-panel-body]'));
    const liveBlurScrollers = scrollers.filter((el) => /blur\(/i.test(getComputedStyle(el).backdropFilter || ''));
    const shellBackdrop = shellEl ? (getComputedStyle(shellEl).backdropFilter || 'none') : 'none';
    const hasLiveBlurRule = /blur\(/i.test(shellBackdrop) || liveBlurScrollers.length > 0;
    const leakedWindowToken = Boolean(
        typeof window.__AGY_AUTH_TOKEN__ !== 'undefined' ||
        typeof window.__AGY_INJECT_BOOT__ !== 'undefined' ||
        typeof window.__AGY_BOOT__ !== 'undefined'
    );
    const cinemaBtnPresent = Boolean(document.querySelector('.agy-cinema-mask-btn'));
    const kaguraBtnPresent = Boolean(document.querySelector('.agy-kagura-bell-btn'));
    const hudBarPresent = Boolean(document.getElementById('agy-token-context-bar'));
    const cinemaDirectorAlive = Boolean(
        typeof window.__AGY_CINEMA_DIRECTOR__?.openPanel === 'function' &&
        document.getElementById('antigravity-kny-cinema-director-style')
    );
    const bioAudioAlive = Boolean(
        typeof window.__AGY_BIO_AUDIO__?.openPopover === 'function' &&
        document.getElementById('antigravity-kny-bio-audio-style')
    );
    const coreState =
        window.__AGY_THEME_CORE__ && typeof window.__AGY_THEME_CORE__.getState === 'function'
            ? window.__AGY_THEME_CORE__.getState()
            : null;
    const wpEnabled =
        coreState && typeof coreState.wpEnabled === 'boolean'
            ? coreState.wpEnabled
            : localStorage.getItem('agy_wp_enabled_v1') !== 'false';
    const shellHoleActive = shellEl ? shellEl.getAttribute('data-agy-hole-active') : null;
    const shellDirectBg = shellEl ? getComputedStyle(shellEl).backgroundImage : 'none';
    const shellAfterBg = shellEl ? getComputedStyle(shellEl, '::after').backgroundImage : 'none';
    const shellDirectBgPresent = Boolean(shellEl && shellDirectBg && shellDirectBg !== 'none');
    const shellAfterBgPresent = Boolean(shellEl && shellAfterBg && shellAfterBg !== 'none');
    const shellBgImagePresent = shellHoleActive === '1' ? shellAfterBgPresent : shellDirectBgPresent;

    const userBubbleFrames = Array.from(document.querySelectorAll('.agy-user-bubble-frame'));
    const userMessageCount = document.querySelectorAll('[data-testid="user-message"], .agy-user-bubble-frame').length;
    const isWelcomeView =
        userMessageCount === 0 &&
        (/^\/(launchpad|projects|workspace|manager)?(\/|$)/i.test(location.pathname || '') ||
            Boolean(document.querySelector('[data-launchpad]')));

    const composerEl =
        document.querySelector('.surface-composer, [data-testid="composer"]') ||
        (!isWelcomeView ? document.querySelector('div.relative.flex.flex-col.rounded-lg.border') : null);
    const composerPresent = Boolean(composerEl);

    const moduleChecks = {
        sec: Boolean(
            window.__AGY_SEC__ &&
            typeof window.__AGY_SEC__.sanitizeCssUrl === 'function' &&
            typeof window.__AGY_SEC__.getAssetBase === 'function' &&
            typeof window.__AGY_SEC__.getAuthToken === 'undefined'
        ),
        themeCore: Boolean(
            window.__AGY_THEME_CORE__ &&
            typeof window.__AGY_THEME_CORE__.applyTheme === 'function' &&
            typeof window.__AGY_THEME_CORE__.getState === 'function'
        ),
        themeForge: Boolean(
            window.__AGY_THEME_FORGE__ &&
            typeof window.__AGY_THEME_FORGE__.getPersona === 'function' &&
            typeof window.__AGY_THEME_FORGE__.buildOklchThemeDefinition === 'function'
        ),
        fxModes: Boolean(
            typeof window.__AGY_KNY_FX_DRAWERS__ === 'function' &&
            Array.isArray(window.__AGY_KNY_FX_DRAWERS__.modes) &&
            window.__AGY_KNY_FX_DRAWERS__.modes.length >= 16
        ),
        chibiAura: Boolean(
            window.__AGY_KNY_CHIBI_AURA__ &&
            typeof window.__AGY_KNY_CHIBI_AURA__.mountChibiAura === 'function'
        ),
        breathingSkills: Boolean(
            window.__AGY_KNY_SKILLS__ &&
            typeof window.__AGY_KNY_SKILLS__.castSkill === 'function'
        ),
        semanticIcons: Boolean(
            window.__AGY_KNY_ICONS__ &&
            typeof window.__AGY_KNY_ICONS__.getFuncSvg === 'function'
        ),
        squadRaid: Boolean(
            window.__AGY_SQUAD_RAID__ &&
            typeof window.__AGY_SQUAD_RAID__.mount === 'function' &&
            typeof window.__AGY_SQUAD_RAID__.sync === 'function'
        ),
        tokenHud: Boolean(
            window.__AGY_TOKEN_HUD__ &&
            typeof window.__AGY_TOKEN_HUD__.mountTokenHud === 'function' &&
            typeof window.__AGY_TOKEN_HUD__.ingestTelemetrySnapshot === 'function'
        ),
        cinemaDirector: cinemaDirectorAlive,
        bioAudio: bioAudioAlive,
    };
    const tokenHudStyleAlive = Boolean(document.getElementById('antigravity-kny-token-hud-style'));

    const chibiSkillBarPresent = Boolean(document.getElementById('agy-chibi-skill-bar'));
    const userBubbleFrameCount = userBubbleFrames.length;
    let userBubbleEmptyChildCount = 0;
    let userBubbleMissingGuardCount = 0;
    for (const frame of userBubbleFrames) {
        for (const child of Array.from(frame.children)) {
            let isEmpty = false;
            try {
                isEmpty = typeof child.matches === 'function'
                    ? child.matches(':empty')
                    : (child.children.length === 0 && child.childNodes.length === 0);
            } catch (_) {
                isEmpty = child.children.length === 0 && child.childNodes.length === 0;
            }
            if (isEmpty) {
                userBubbleEmptyChildCount++;
            }
            if (child.classList.contains('agy-chibi-hitbox') || child.classList.contains('agy-user-chibi-aura-wave')) {
                if (!child.querySelector('i[aria-hidden="true"]')) {
                    userBubbleMissingGuardCount++;
                }
            }
        }
    }

    const masterPersona = (coreState && coreState.masterPersona) || localStorage.getItem('agy_master_persona_v1') || 'yoriichi';
    const crestBtn = document.querySelector('.agy-yoriichi-crest-btn');
    const crestTitle = crestBtn ? (crestBtn.getAttribute('title') || crestBtn.getAttribute('aria-label') || '') : '';
    const firstHitbox = document.querySelector('.agy-user-bubble-frame > .agy-chibi-hitbox');
    const hitboxTitle = firstHitbox ? (firstHitbox.getAttribute('title') || '') : '';
    const msgHit = document.querySelector('.agy-yoriichi-msg-hit');
    const msgHitTitle = msgHit ? (msgHit.getAttribute('title') || '') : '';
    const yoriichiRe = /Yoriichi|H\u1ecfa Th\u1ea7n/i;
    let yoriichiIdentityValid = true;
    if (masterPersona === 'yoriichi') {
        if (crestBtn && !yoriichiRe.test(crestTitle)) yoriichiIdentityValid = false;
        if (firstHitbox && !yoriichiRe.test(hitboxTitle)) yoriichiIdentityValid = false;
        if (msgHit && !yoriichiRe.test(msgHitTitle)) yoriichiIdentityValid = false;
    } else if (window.__AGY_THEME_FORGE__ && typeof window.__AGY_THEME_FORGE__.hasPersona === 'function') {
        yoriichiIdentityValid = Boolean(window.__AGY_THEME_FORGE__.hasPersona(masterPersona));
    }

    return {
        isAntigravityDom: true,
        url: location.pathname,
        isWelcomeView,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        themeActive: Boolean(styleEl),
        activeTheme: localStorage.getItem('agy_theme_v3') || null,
        wpEnabled,
        shellFound: Boolean(shellEl),
        shellDirectBgPresent,
        shellAfterBgPresent,
        shellBgImagePresent,
        hasBrowserHole: document.body.dataset.hasBrowserHole || null,
        shellHoleActive,
        mainGridFound: Boolean(mainGrid),
        projectPillBg: projPill ? getComputedStyle(projPill).backgroundColor : null,
        envPillBg: envPill ? getComputedStyle(envPill).backgroundColor : null,
        scrollerCount: scrollers.length,
        liveBlurScrollerCount: liveBlurScrollers.length,
        hasLiveBlurRule,
        leakedWindowToken,
        settingsTriggerPresent: Boolean(document.getElementById('agy-custom-theme-sidebar-btn')),
        composerPresent,
        hudBarPresent,
        cinemaBtnPresent,
        kaguraBtnPresent,
        cinemaDirectorAlive,
        bioAudioAlive,
        tokenHudStyleAlive,
        moduleChecks,
        chibiSkillBarPresent,
        userBubbleFrameCount,
        userBubbleEmptyChildCount,
        userBubbleMissingGuardCount,
        masterPersona,
        yoriichiIdentityValid,
        domDiagnostics,
    };
})()"#;

fn parse_pid_from_file(p: &Path) -> Option<u32> {
    let raw = fs::read_to_string(p).ok()?;
    let trimmed = raw.strip_prefix('\u{feff}').unwrap_or(&raw).trim();
    if trimmed.starts_with('{') {
        serde_json::from_str::<Value>(trimmed)
            .ok()?
            .get("pid")?
            .as_u64()
            .map(|n| n as u32)
    } else {
        trimmed.parse::<u32>().ok()
    }
}

fn resolve_live_daemon_pid(root_dir: &Path) -> Option<(u32, String)> {
    if let Ok(explicit) = std::env::var("AGY_DAEMON_PID_FILE") {
        if !explicit.is_empty() {
            let p = resolve_abs_path(Path::new(&explicit));
            if let Some(pid) = parse_pid_from_file(&p) {
                if pid > 0 && is_verified_any_daemon_process(pid) {
                    return Some((pid, p.display().to_string()));
                }
            }
            return None;
        }
    }

    let home = home_dir();
    let candidates = [
        root_dir.join("daemon.pid"),
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
            .join("antigravity")
            .join("theme_daemon.pid"),
        home.join(".gemini")
            .join("config")
            .join("skills")
            .join("antigravity-custom-theme")
            .join("daemon.pid"),
        home.join(".gemini")
            .join("antigravity")
            .join("skills")
            .join("antigravity-custom-theme")
            .join("daemon.pid"),
        home.join(".agents")
            .join("skills")
            .join("antigravity-custom-theme")
            .join("daemon.pid"),
    ];

    let mut seen = HashSet::<PathBuf>::new();
    for cand in candidates {
        let resolved = resolve_abs_path(&cand);
        if !seen.insert(resolved.clone()) {
            continue;
        }
        if let Some(pid) = parse_pid_from_file(&resolved) {
            if pid > 0 && is_verified_any_daemon_process(pid) {
                return Some((pid, resolved.display().to_string()));
            }
        }
    }

    if let Some(pid) = scan_all_live_daemon_pids().into_iter().next() {
        return Some((pid, "process-scan".to_string()));
    }
    None
}

pub async fn run_verify_cdp_async(root_dir: &Path) -> i32 {
    let pid_file = root_dir.join("daemon.pid");
    let Some((daemon_pid, daemon_source)) = resolve_live_daemon_pid(root_dir) else {
        eprintln!(
            "[verify-cdp] FAIL: No live theme_daemon.js process found (checked {}, standard global skill directories, and OS process table).",
            pid_file.display()
        );
        return 1;
    };

    let port_file = resolve_port_file();
    if !port_file.exists() {
        eprintln!(
            "[verify-cdp] DevToolsActivePort not found at: {}",
            port_file.display()
        );
        return 1;
    }

    let raw_port = fs::read_to_string(&port_file).unwrap_or_default();
    let first_line = raw_port
        .strip_prefix('\u{feff}')
        .unwrap_or(&raw_port)
        .trim()
        .lines()
        .next()
        .unwrap_or("");
    let Ok(port) = first_line.trim().parse::<u16>() else {
        eprintln!("[verify-cdp] Error: Invalid port in DevToolsActivePort");
        return 1;
    };

    let targets = match fetch_json_loopback(port, "/json", 2500).await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[verify-cdp] Error: {e}");
            return 1;
        }
    };

    let candidate_pages: Vec<Map<String, Value>> = targets
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|t| {
            let obj = t.as_object()?.clone();
            let is_page = obj.get("type").and_then(|v| v.as_str()) == Some("page");
            let has_ws = obj
                .get("webSocketDebuggerUrl")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            let url = obj.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if is_page && has_ws && is_candidate_antigravity_url(url) {
                Some(obj)
            } else {
                None
            }
        })
        .collect();

    if candidate_pages.is_empty() {
        eprintln!("[verify-cdp] No candidate Antigravity CDP page targets found on port {port}.");
        return 1;
    }

    let mut results: Vec<Map<String, Value>> = Vec::new();
    for page in &candidate_pages {
        let ws_url = page
            .get("webSocketDebuggerUrl")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let page_id = page.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
        match evaluate_cdp_page(ws_url, INSPECT_EXPR, true, 4000).await {
            Ok(Value::Object(rep)) => {
                if rep.get("isAntigravityDom").and_then(|v| v.as_bool()) == Some(true) {
                    let mut merged = Map::new();
                    if let Some(id_v) = page.get("id") {
                        merged.insert("id".to_string(), id_v.clone());
                    }
                    if let Some(title_v) = page.get("title") {
                        merged.insert("title".to_string(), title_v.clone());
                    }
                    for (k, v) in rep {
                        merged.insert(k, v);
                    }
                    results.push(merged);
                }
            }
            Ok(_) => {}
            Err(err) => {
                eprintln!("[verify-cdp] Skipped unresponsive target {page_id}: {err}");
            }
        }
    }

    if results.is_empty() {
        eprintln!(
            "[verify-cdp] No verified Antigravity DOM targets found among {} candidate(s).",
            candidate_pages.len()
        );
        return 1;
    }

    let json_vals: Vec<Value> = results.iter().cloned().map(Value::Object).collect();
    if let Ok(pretty) = serde_json::to_string_pretty(&Value::Array(json_vals)) {
        println!("{pretty}");
    }

    let themed_pages: Vec<&Map<String, Value>> = results
        .iter()
        .filter(|r| r.get("themeActive").and_then(|v| v.as_bool()) == Some(true))
        .collect();

    if themed_pages.is_empty() {
        eprintln!(
            "[verify-cdp] FAIL: #antigravity-custom-theme-active not active on any verified Antigravity page."
        );
        return 1;
    }
    if themed_pages
        .iter()
        .any(|r| r.get("hasLiveBlurRule").and_then(|v| v.as_bool()) == Some(true))
    {
        eprintln!("[verify-cdp] FAIL: Detected backdrop-filter blur rule in injected style.");
        return 1;
    }
    if themed_pages
        .iter()
        .any(|r| r.get("leakedWindowToken").and_then(|v| v.as_bool()) == Some(true))
    {
        eprintln!("[verify-cdp] FAIL: Ephemeral boot/auth token leaked onto global window object.");
        return 1;
    }
    if themed_pages.iter().any(|r| {
        r.get("cinemaBtnPresent").and_then(|v| v.as_bool())
            != r.get("kaguraBtnPresent").and_then(|v| v.as_bool())
    }) {
        eprintln!(
            "[verify-cdp] FAIL: Asymmetric HUD utility buttons (.agy-cinema-mask-btn vs .agy-kagura-bell-btn) on themed page."
        );
        return 1;
    }
    if themed_pages.iter().any(|r| {
        let comp = r
            .get("composerPresent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let hud = r
            .get("hudBarPresent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let cin = r
            .get("cinemaBtnPresent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let kag = r
            .get("kaguraBtnPresent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        (comp || hud) && (!cin || !kag)
    }) {
        eprintln!(
            "[verify-cdp] FAIL: Composer or HUD bar is present, but .agy-cinema-mask-btn / .agy-kagura-bell-btn is missing."
        );
        return 1;
    }
    if themed_pages.iter().any(|r| {
        r.get("cinemaDirectorAlive").and_then(|v| v.as_bool()) != Some(true)
            || r.get("bioAudioAlive").and_then(|v| v.as_bool()) != Some(true)
    }) {
        eprintln!(
            "[verify-cdp] FAIL: __AGY_CINEMA_DIRECTOR__ or __AGY_BIO_AUDIO__ (or their styles) died after injection!"
        );
        return 1;
    }

    for r in &themed_pages {
        let target_id = r.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
        if let Some(mc) = r.get("moduleChecks").and_then(|v| v.as_object()) {
            let dead: Vec<&str> = mc
                .iter()
                .filter(|(_, ok)| ok.as_bool() != Some(true))
                .map(|(k, _)| k.as_str())
                .collect();
            if !dead.is_empty() {
                eprintln!(
                    "[verify-cdp] FAIL: Dead module(s) on target {target_id}: {}",
                    dead.join(", ")
                );
                return 1;
            }
        }
        let hud = r
            .get("hudBarPresent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let hud_style = r
            .get("tokenHudStyleAlive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if hud && !hud_style {
            eprintln!(
                "[verify-cdp] FAIL: HUD bar present on target {target_id}, but #antigravity-kny-token-hud-style is missing."
            );
            return 1;
        }
        let shell_found = r
            .get("shellFound")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let hole_active = r.get("shellHoleActive").and_then(|v| v.as_str()) == Some("1");
        let wp_enabled = r.get("wpEnabled").and_then(|v| v.as_bool()) != Some(false);
        let after_bg = r
            .get("shellAfterBgPresent")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if shell_found && hole_active && wp_enabled && !after_bg {
            eprintln!(
                "[verify-cdp] FAIL: Split Browser Cutout active on target {target_id}, but .agy-shell::after backgroundImage is missing."
            );
            return 1;
        }
        if r.get("chibiSkillBarPresent").and_then(|v| v.as_bool()) == Some(true) {
            eprintln!(
                "[verify-cdp] FAIL: Obsolete #agy-chibi-skill-bar detected on target {target_id}."
            );
            return 1;
        }
        let empty_cnt = r
            .get("userBubbleEmptyChildCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let missing_cnt = r
            .get("userBubbleMissingGuardCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if empty_cnt > 0 || missing_cnt > 0 {
            eprintln!(
                "[verify-cdp] FAIL: R3 user-bubble guard violation on target {target_id} (empty={empty_cnt}, missingGuard={missing_cnt})."
            );
            return 1;
        }
        if r.get("yoriichiIdentityValid").and_then(|v| v.as_bool()) != Some(true) {
            let persona = r
                .get("masterPersona")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            eprintln!(
                "[verify-cdp] FAIL: Default master persona / Yoriichi identity check failed on target {target_id} (persona={persona})."
            );
            return 1;
        }
    }

    println!(
        "[verify-cdp] PASS: {}/{} verified page(s) themed (daemon PID {daemon_pid} via {daemon_source}) with zero live blur, zero token leak, all 11 modules alive, and R3 invariants intact.",
        themed_pages.len(),
        results.len()
    );
    0
}
