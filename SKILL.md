---
name: antigravity-custom-theme
description: Use when the user wants to design, customize, forge (.agytheme), install, update, or troubleshoot an Antigravity IDE or Manager visual theme from a wallpaper image, color palette, aesthetic mood, or preset.
---

# Antigravity Custom Theme Skill (v2.0 Enterprise Architecture)

Creates, compiles, and applies high-frame-rate (`60/120fps` Zero-Live-Blur) glassmorphic themes, live canvas landscapes, real-time Subagent Hashira HUDs, `0 KB` WebAudio soundscapes, and `.agytheme` packages to Google Antigravity 2.x without modifying application binaries.

## Repository Layout & 11-Module Engine Architecture

- `themes/themes.json` — Theme presets (OKLCH/hex tokens, wallpaper & Chibi paths, action sprites, glass alpha/dimming defaults, NPC dialog trees).
- `themes/assets/` — High-res wallpapers (`.webp`/`.jpg`/`.png`), resting/action Chibi sprites, avatars, and sanitized SVG corner/composer ornaments.
- `engine/` — **11 Modular Renderer Subsystems** bundled inside a single isolated Master Closure (`__AGY_BOOT__`):
  1. `engine/agy_security.js` — Enterprise Closure Vault (`__AGY_SEC__`): stores the 256-bit ephemeral token outside `window`, strips `__proto__`/`constructor`/`prototype`, and sanitizes CSS values, asset URLs, and raw SVG markup.
  2. `engine/kny_semantic_icons.js` — Crisp vector semantic iconography (`window.__AGY_KNY_ICONS__`).
  3. `engine/kny_bio_audio.js` — `0 KB` Mathematical Web Audio synthesizer (Japanese Koto + Furin completion chimes, *"Kachin!"* blade sheathe, `0.12Hz` Alpha rain/hearth soundscapes, `0%` idle CPU suspend) & Bio-Circadian Retinal Guard (`window.__AGY_BIO_AUDIO__`).
  4. `engine/kny_fx_modes.js` — 60fps multi-layer parallax canvas drawers, *Sukitōru Sekai* (Transparent World), and Multi-Window `0% GPU` background arbiter (`window.__AGY_KNY_FX_DRAWERS__`).
  5. `engine/kny_breathing_skills.js` — 60 full-screen Ufotable-inspired Breathing Forms (`15 characters × 4 forms`) with Hit-Stop camera choreography and full-body leaping Chibi sprites (`window.__AGY_KNY_SKILLS__`).
  6. `engine/kny_chibi_aura.js` — Elemental Chibi aura canvas, skill trigger strip, **Crimson Red Blade (`赫刀`)** heat gauge, and automatic Demon-Slaying counter-slash (`window.__AGY_KNY_CHIBI_AURA__`).
  7. `engine/kny_squad_raid.js` — **Live Hashira Swarm Squad** synchronized with active subagents via `< 30ms` SSE and **「滅」** victory stamp + Kasugai crow flyby (`window.__AGY_SQUAD_RAID__`).
  8. `engine/kny_token_hud.js` — Live Context Window & Elemental Turn Token odometer, First Swordsman Yoriichi crest, and Instant Enter Command Echo (`window.__AGY_TOKEN_HUD__`).
  9. `engine/agy_theme_forge.js` — **Multiverse AI Theme Forge**: perceptual `64×64` OKLCH palette extraction, WCAG AA contrast solver, 18 Master Personas, and `.agytheme` (`agytheme/2.0`) import/export (`window.__AGY_THEME_FORGE__`).
  10. `engine/kny_cinema_director.js` — **1-Click Privacy Shield (`Alt+Shift+P`)** non-destructive IDE redaction & **15-Second Auto-Showcase Trailer Director (`Alt+Shift+C`)** (`window.__AGY_CINEMA_DIRECTOR__`).
  11. `engine/core.js` — Core Zero-Live-Blur stylesheet engine, offscreen pre-baked L-glass (`syncPrebakedGlass`), Split-Browser `evenodd` hole cutout, interactive Chibi NPC popover, and Custom Theme Studio modal.
- `scripts/build_payload.js` *(primary, zero-dependency Node.js)* & `scripts/build_payload.py` — Strips UTF-8 BOM, enforces build-time SVG security assertions, resolves Hybrid Asset URLs with reproducible 8-char SHA-256 content hashes (`?v=<hash8>`), and compiles all 11 modules into `dist/theme_payload.js`.
- `daemon/theme_daemon.js` — Hardened Node.js (`>= 22.0.0`) loopback daemon: `127.0.0.1` Host Pinning, 256-bit `X-Agy-Token` authentication, `fs.realpath` static asset serving, incremental SSE Byte-Tailer (`/__events`), and strict Antigravity CDP target verification.
- `scripts/install-win.ps1`, `scripts/install-unix.sh`, `scripts/uninstall.js`, `scripts/verify_cdp.js` — Cross-platform setup, clean `--purge` teardown, and live CDP diagnostics.
- `references/theme-schema.md` — Complete `themes.json` & `.agytheme` schema, asset keys, and Antigravity 2.0 DOM invariants.

## Workflow

1. **Gather aesthetic & inspect artwork**
   - Clarify mood only if ambiguous (Hashira elemental realm, cozy warm, cyberpunk neon, minimalist pure-CSS gradient, or `.agytheme` multiverse pack).
   - Clean or crop unwanted corner watermarks before staging assets under `themes/assets/`.
2. **Design cohesive tokens (OKLCH / WCAG AA Dark or Light Glass)**
   - Read `references/theme-schema.md` for every `themes.json` and `.agytheme` key.
   - Populate cohesive surface tokens (`primary`, `secondary`, `overlayRgb`, `bg`, `frameBg`, `sidebarBg`, `aiCardBg`, `headerBg`, `inputCardBg`, `modalBg`, `pillBg`, `pillBorder`).
   - Support complete dual-persona ornaments when desired:
     - Agent / Composer side: `sticker`, `actionSticker`, `cornerSvg`, `agentAvatar`
     - User (First Swordsman Yoriichi / Master Persona) side: `userSticker`, `userActionSticker`, `userCornerSvg`, `userAvatar`
3. **Stage assets & edit `themes/themes.json` (UTF-8 without BOM)**
   - Store assets in `themes/assets/` and reference them as `"assets/<filename>"`.
   - Never hardcode personal OS paths (`C:\Users\...`, `/Users/...`, `/home/...`) anywhere in JSON, JS, or documentation.
   - Ensure all `.svg` files contain pure vector primitives (no `<script>`, `<foreignObject>`, inline `on*=` handlers, or external URLs).
4. **Compile & syntax-check payload**
   - Run `npm run build` (`node scripts/build_payload.js`; pass `--inline-all` only when generating a standalone zero-HTTP bundle).
   - Run `node --check dist/theme_payload.js` to confirm zero syntax errors.
5. **Run / hot-reload daemon**
   - **Windows:** `powershell -ExecutionPolicy Bypass -File scripts/install-win.ps1`
   - **macOS / Linux:** `bash scripts/install-unix.sh`
   - When `daemon/theme_daemon.js` is already running, `npm run build` triggers automatic hot-reload via `fs.watch`.
6. **Verify live via CDP**
   - Run `npm run verify` (`node scripts/verify_cdp.js`) while Antigravity is open.
   - Confirm `themeActive: true`, `hasLiveBlurRule: false`, valid `.agy-shell` background, visible user message bubbles, and readable composer pills.

## Non-Negotiable Antigravity 2.0 DOM & Security Rules

1. **User Bubble `:empty` Trap Prevention (CRITICAL):**
   - Antigravity 2.0 styles user message wrappers with the Tailwind selector `[&:has(>.agy-user-bubble-frame>:empty)]:hidden`.
   - **NEVER** append an empty element (such as `<div></div>` or `<button class="agy-chibi-hitbox"></button>`) directly inside `.agy-user-bubble-frame` — doing so immediately hides the entire user message!
   - Every direct helper child inside `.agy-user-bubble-frame` **MUST** contain a non-empty child node, e.g. `<button type="button" class="agy-chibi-hitbox"><i aria-hidden="true"></i></button>`.
2. **Custom `<agy-live-fx>` Host Tag (CRITICAL):**
   - `engine/core.js` targets `.agy-shell > div:first-of-type` (top header bar, `z-index: 3`) and `.agy-shell > div:not(:first-of-type)` (workbench body, `z-index: 2`).
   - **NEVER** mount a `<div>` as a direct child of `.agy-shell` for background canvases, or `:first-of-type` structural selectors will shift! Always mount the custom element `<agy-live-fx id="agy-live-fx-host">` instead.
3. **Zero Live Blur:**
   - Never apply live `backdrop-filter: blur(...)` to `.agy-shell`, `.agy-chat-frame`, or scrolling containers. Use `syncPrebakedGlass` offscreen canvas baking exclusively.
4. **Split-Browser Cutout & Strict CDP Target Verification:**
   - Preserve `body[data-has-browser-hole="true"]` `evenodd` polygon cutouts so the right-side browser pane remains 100% unobstructed, and never inject scripts into non-Workbench Split Browser targets.
5. **Zero XSS & Closure Security:**
   - Render untrusted strings (`transcript.jsonl` titles, `Role`, `toolSummary`, imported `.agytheme` metadata) strictly via `document.createElement` + `.textContent` (never `.innerHTML` concatenation), and route authenticated daemon calls through `__AGY_SEC__`.

## Troubleshooting: Theme Disappeared After Antigravity Update

Antigravity v2.33.0+ requires `--remote-debugging-port=0` to expose `DevToolsActivePort` on `127.0.0.1`, and auto-updates may reset desktop shortcuts:

- **Windows:** Re-run `powershell -ExecutionPolicy Bypass -File scripts/install-win.ps1`, quit Antigravity completely from the **System Tray (`Quit`)**, and relaunch from **Start Menu** (re-pin Taskbar icons from Start Menu if needed).
- **macOS / Linux:** Launch with `open -a Antigravity --args --remote-debugging-port=0` (macOS) or append `--remote-debugging-port=0` to `Exec=` in your Linux `.desktop` launcher.
