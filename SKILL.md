---
name: antigravity-custom-theme
description: Use when the user wants to design, customize, forge (.agytheme), install, update, or troubleshoot an Antigravity IDE or Manager visual theme from a wallpaper image, color palette, aesthetic mood, workspace profile, or natural-language chat command.
---

# Antigravity Custom Theme Engine & Native Plugin (v3.0)

Creates, compiles, and applies high-frame-rate (`60/120fps` Zero-Live-Blur) glassmorphic themes, 3D Micro-WebGL2 Breathing VFX, real-time Subagent/Swarm/Workflow Hashira HUDs, `0 KB` WebAudio soundscapes, Workspace-Aware Profiles, multilingual Studio UI (`vi` / `en` / `ja`), and `.agytheme` packages to Google Antigravity 2.x without modifying application binaries.

## Repository Layout & 13-Module Engine Architecture

- `plugin.json`, `hooks.json`, `mcp_config.json`, `assets/logo.svg` — Native Antigravity 2.x Plugin bundle (`SessionStart` lifecycle hook auto-wakes the daemon and applies per-workspace theme profiles; Zero-Dep Stdio MCP Server + Side-Pane MCP App).
- `themes/themes.json` & `themes/assets/` — 16 built-in themes with WebP-optimized 2K wallpapers, Chibi sprites, avatars, and sanitized SVG ornaments.
- `engine/` — **13 Modular Renderer Subsystems** bundled inside a single isolated Master Closure (`__AGY_BOOT__`):
  1. `engine/agy_security.js` — Closure Vault (`__AGY_SEC__`): 256-bit ephemeral token, prototype-pollution stripping, CSS/URL/SVG sanitizers.
  2. `engine/agy_i18n.js` — Ultra-lightweight (`< 8 KB`) multilingual dictionary (`vi` default / `en` / `ja`) (`window.__AGY_I18N__`).
  3. `engine/kny_semantic_icons.js` — Crisp vector semantic iconography (`window.__AGY_KNY_ICONS__`).
  4. `engine/kny_bio_audio.js` — `0 KB` Mathematical Web Audio synthesizer & Bio-Circadian Retinal Guard (`window.__AGY_BIO_AUDIO__`).
  5. `engine/kny_fx_modes.js` — 60fps parallax canvas drawers, *Sukitōru Sekai*, particle density & laptop Eco-Battery governor (`window.__AGY_KNY_FX_DRAWERS__`).
  6. `engine/kny_3d_vfx_kernel.js` — Zero-idle-VRAM Micro-WebGL2 3D ribbon/particle kernel with automatic Canvas2D fallback (`window.__AGY_3D_VFX_KERNEL__`).
  7. `engine/kny_breathing_skills.js` — 60 full-screen 3D Breathing Forms (`15 characters × 4 forms`) (`window.__AGY_KNY_SKILLS__`).
  8. `engine/kny_chibi_aura.js` — Elemental Chibi aura canvas & Crimson Red Blade (`赫刀`) heat gauge (`window.__AGY_KNY_CHIBI_AURA__`).
  9. `engine/kny_squad_raid.js` — Live Hashira Squad Raid HUD tracking `invoke_subagent`, `swarm`, `run_workflow`, and `run_command` via SSE (`window.__AGY_SQUAD_RAID__`).
  10. `engine/kny_token_hud.js` — Live Context Window, Turn Token odometer, `work_state_write` task progress, and Monaco/Terminal finisher guard (`window.__AGY_TOKEN_HUD__`).
  11. `engine/agy_theme_forge.js` — Multiverse AI Theme Forge (`64×64` OKLCH palette extraction, WCAG AA contrast solver, 18 Master Personas, `.agytheme` v2.0) (`window.__AGY_THEME_FORGE__`).
  12. `engine/kny_cinema_director.js` — Privacy Shield (`Alt+Shift+P`) & Auto-Showcase Trailer Director (`Alt+Shift+C`) (`window.__AGY_CINEMA_DIRECTOR__`).
  13. `engine/core.js` — Core Zero-Live-Blur stylesheet engine, `AGY_DOM_CONTRACTS` circuit-breaker, `< 1 KB` `applyDaemonDelta` multi-window sync, Workspace Profiles, and 5-Tab WAI-ARIA Studio Modal.
- `daemon/theme_daemon.js` — Hardened Node.js (`>= 22.0.0`) loopback daemon with SHA-256 doc-hash dedup, `< 1 KB` delta broadcast, external config watcher, and SSE byte-tailer.
- `daemon/mcp_theme_server.js` — Zero-Dependency Stdio MCP Server (`open_theme_studio`, `switch_theme`, `set_persona`, `toggle_focus_mode`, `forge_theme_from_image`, `bind_workspace_profile`, `diagnose_cdp_onboarding`) + MCP App `ui://agy-theme/studio.html`.
- `scripts/build_payload.js` & `scripts/build_payload.py` — Byte-identical payload compilers with build-time SVG XSS guard.
- `scripts/export_clean_edition.js` — Exports a pure-MIT Clean Edition bundle (procedural/multiverse themes only) for enterprise or marketplace distribution.

## Workflow

1. **Control instantly via MCP Tools (when installed as a Plugin)**
   - Prefer calling `switch_theme`, `set_persona`, `toggle_focus_mode`, `forge_theme_from_image`, `bind_workspace_profile`, or `diagnose_cdp_onboarding` directly when the `antigravity-shinobu-theme_controller` MCP server is active.
2. **Author or customize themes in `themes/themes.json`**
   - Read `references/theme-schema.md` for token keys (`primary`, `secondary`, `overlayRgb`, `bg`, `frameBg`, `sidebarBg`, `aiCardBg`, `headerBg`, `inputCardBg`, `modalBg`, `pillBg`, `pillBorder`).
   - Store assets in `themes/assets/` as `"assets/<filename>"` (prefer `.webp` for wallpapers/sprites and pure vector `.svg` without scripts or inline handlers).
   - Never hardcode personal OS paths (`C:\Users\...`, `/Users/...`, `/home/...`) in tracked files.
3. **Compile, test & hot-reload**
   - Run `npm run build` (`node scripts/build_payload.js`) and `npm test` (`node tests/run_all.js`).
   - Setup/repair CDP shortcut & background daemon:
     - **Windows:** `powershell -ExecutionPolicy Bypass -File scripts/install-win.ps1`
     - **macOS / Linux:** `bash scripts/install-unix.sh`
   - Verify live injection via `npm run verify` (`node scripts/verify_cdp.js`).

## Non-Negotiable Antigravity 2.x DOM & Security Rules

1. **User Bubble `:empty` Trap Prevention:** Never append an empty direct child inside `.agy-user-bubble-frame` (`[&:has(>.agy-user-bubble-frame>:empty)]:hidden` will hide the entire message). Always include `<i aria-hidden="true"></i>`.
2. **Custom `<agy-live-fx>` Host Tag:** Never mount a `<div>` as the first child of `.agy-shell`; always use `<agy-live-fx id="agy-live-fx-host">`.
3. **Zero Live Blur & Monaco Safety:** Never apply `backdrop-filter: blur(...)` to scrolling containers or override `font-family`/`line-height` inside `.monaco-editor` / `.xterm`.
4. **Zero XSS & Magic-Byte Validation:** Render untrusted labels via `.textContent` and validate image magic bytes before forging data URIs.
