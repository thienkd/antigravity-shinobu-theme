# `themes/themes.json`, `.agytheme` v2.0 Schema & Antigravity 2.0 DOM Reference

`themes/themes.json` (encoded strictly in **UTF-8 without BOM**) is a JSON object keyed by display preset name (e.g., `"👑 Gia Đình Chúa Công (Ubuyashiki)"`, `"🦋 Trùng Trụ — Shinobu Kocho"`). The first entry acts as the fallback theme when no persisted `theme_config.json` or `localStorage` selection exists.

---

## 1. Complete Preset Fields (`themes/themes.json`)

### A. Palette, Glass Surfaces & Typography

| Key | Type | Required | Purpose |
| :--- | :--- | :---: | :--- |
| `concept` | `string` | Yes | Short subtitle displayed in the Custom Theme Studio modal |
| `primary` | `css color` | Yes | Primary accent color (active borders, focus rings, elemental highlights) |
| `secondary` | `css color` | Yes | Secondary paired gradient highlight |
| `glow` | `rgba(...)` | Yes | Primary ambient glow behind active composer & user bubbles |
| `secondaryGlow` | `rgba(...)` | Optional | Secondary radial glow layer |
| `bg` | `css background` | Yes | User chat bubble surface gradient/fill |
| `frameBg` | `css background` | Yes | Outer double-border gradient framing user bubbles & synced composer |
| `composerHeaderBg` | `css background` | Optional | Accent strip gradient along the top edge of the composer |
| `textColor` | `css color` | Yes | Foreground ink inside user message bubbles (`#f8fafc` / `#fefce8`) |
| `borderColor` | `rgba(...)` | Yes | Subtle border color for composer & interactive cards |
| `innerBorder` | `css border` | Yes | Inner hairline border shorthand for bubbles/cards |
| `clearBackdrop` | `boolean` | Yes | Clears default opaque workbench wrappers so 4K wallpapers breathe |
| `defaultDimming` | `number` (`15–92`) | Optional | Default wallpaper scrim dimming percentage when selecting the preset |
| `overlayRgb` | `"R, G, B"` | Yes | Base RGB triplet for wallpaper tint scrim & pre-baked L-glass |
| `bgPosition` | `css position` | Optional | Wallpaper focal alignment (`"center center"`, `"center 20%"`, etc.) |
| `pureBg` | `css background` | Optional | Pure-CSS multi-layer gradient used when `wallpaper` is `""` |
| `sidebarBg` | `rgba(...)` | Yes | Left navigation rail tint |
| `sidebarBlur` | `string` | Optional | Offscreen pre-bake blur radius hint (`syncPrebakedGlass`) — **never** used as live CSS `backdrop-filter` |
| `sidebarHoverBg` | `rgba(...)` | Yes | Hover highlight on sidebar conversation rows |
| `sidebarEnhanceText` | `boolean` | Optional | Boosts crisp text-shadow contrast over bright/detailed artwork |
| `aiCardBg` | `rgba(...)` | Yes | Translucent scrim behind AI markdown response panels |
| `aiCardBorder` | `rgba(...)` | Yes | Border tint for AI response cards |
| `headerBg` | `rgba(...)` | Yes | Top titlebar tint matching the unified L-glass frame |
| `headerBlur` | `string` | Optional | Offscreen pre-bake blur hint for the top header bar |
| `headerBorder` | `rgba(...)` | Yes | Bottom hairline border of the top titlebar |
| `unifiedGlass` | `boolean` | Yes | Enables seamless unified L-shaped glass spanning sidebar + header |
| `btnBg` | `rgba(...)` | Yes | Composer button/action surface |
| `inputGlassBg` | `rgba(...)` | Yes | Composer glass backdrop |
| `inputCardBg` | `css background` | Yes | Composer main container gradient |
| `pillBg`, `pillHoverBg`, `pillTextColor`, `pillBorder` | `css color` | Optional | Contrast tokens for composer strip pills (`Project`, `Environment`, `Branch`) |
| `modalBg`, `modalHeaderBg`, `cardBg`, `cardSelectedBg` | `rgba(...)` | Yes | Custom Theme Studio modal & preset card surfaces |
| `isLight` | `boolean` | Optional | Switches UI typography & window controls to high-contrast Light Glass mode |
| `uiTextColor`, `uiMutedColor` | `css color` | Optional | Custom overrides for primary/muted workbench ink |

### B. Live 60fps Canvas VFX & Dual-Persona Asset Keys

| Key | Type | Required | Purpose |
| :--- | :--- | :---: | :--- |
| `wallpaper` | `string` | Yes | `"assets/<file>.webp"` (or `.jpg`/`.png`), `data:image/...`, or `""` for CSS-only |
| `liveWallpaperFx` | `boolean` | Optional | Enables the 60fps `<agy-live-fx>` canvas landscape |
| `fxMode` | `string` | Optional | Scene ID in `engine/kny_fx_modes.js` (`wisteria_royal`, `wisteria`, `water`, `flame`, `sound`, `mist`, `love`, `serpent`, `wind`, `stone`, `sun_water`, `blood_blossom`, `thunder`, `beast`, `sun`) |
| `arcColor1`, `arcColor2`, `accentParticleColor` | `css color` | Optional | Elemental aura & particle colors for Chibi aura and canvas VFX |
| `isOrnament` | `boolean` | Optional | Enables decorative SVG corner filigrees & top stickers |
| `isChibiNpc` | `boolean` | Optional | Mounts interactive 2-way Chibi NPC dialog & Breathing Skill bar on `.surface-composer` |
| `cornerSvg` | `string` | Optional | Corner emblem (`"assets/<name>_corner.svg"`) on composer & AI frames |
| `userCornerSvg` | `string` | Optional | Dedicated corner emblem on `.agy-user-bubble-frame::after` (e.g., Yoriichi Hanafuda/Sun filigree; falls back to `cornerSvg`) |
| `sticker` | `string` | Optional | Resting Chibi / ornament perched atop `.surface-composer` |
| `userSticker` | `string` | Optional | Dedicated resting Chibi perched atop `.agy-user-bubble-frame::before` (e.g., Yoriichi Chibi; falls back to `sticker`) |
| `actionSticker` | `string` | Optional | Full-body leaping action sprite (`"assets/<char>_action.png"`) drawn on stage when the Agent/Hashira casts a Breathing Form |
| `userActionSticker` | `string` | Optional | Full-body leaping action sprite (`"assets/yoriichi_action.png"`) drawn when clicking the User bubble Chibi or Yoriichi HUD crest |
| `stickerW`, `stickerH` | `number` | Optional | Rendered pixel width & height for resting `sticker` |
| `stickerTop`, `stickerRight` | `number` | Optional | Pixel offset above/right of the composer frame |
| `userAvatar` | `string` | Optional | User avatar rendered beside `[data-testid="user-message"]` & Yoriichi HUD crest |
| `agentAvatar` | `string` | Optional | Agent avatar rendered top-left of `[data-testid="agent-response"]` |
| `npc` | `object` | Optional | `{ badgeLabel, title, placeholder, pills: [{ key, label }], dialogs: { welcome, act1..3, typing, sent, remind }, replies }` |

---

## 2. Reproducible Build & Secure Hybrid Asset Server

### `scripts/build_payload.js` (Zero-Dependency Compiler)
- **UTF-8 BOM Stripping & Build-Time SVG Guard**: Strips leading `\uFEFF` BOM bytes and rejects any `.svg` containing `<script`, `<foreignObject`, `<iframe`, `on*=`, or `javascript:`.
- **Hybrid Asset Resolution (Default)**:
  - Lightweight vector/avatar candidates (`cornerSvg`, `userCornerSvg`, `userAvatar`, `sticker`, `userSticker`) smaller than `12 KB` are inlined directly as `data:` URIs for zero-latency first paint.
  - High-resolution wallpapers, large Chibi sprites, `actionSticker`, `userActionSticker`, and `agentAvatar` stay as clean relative paths with **reproducible 8-character SHA-256 content hashes**: `"assets/shinobu_bg.jpg?v=a1b2c3d4"` (no machine-specific `mtime` timestamps).
  - Pass `--inline-all` to embed all assets into a single self-contained `dist/theme_payload.js`.
- **Master Closure Wrapping**: Prepends all 10 auxiliary `engine/*.js` modules ahead of `engine/core.js` inside `(function(__AGY_BOOT__) { ... })(...)` so `agy_security.js` (`__AGY_SEC__`) holds the ephemeral auth token privately in lexical scope.

### `daemon/theme_daemon.js` (Hardened Loopback Asset & SSE Server)
- Binds strictly to `127.0.0.1:<ephemeral_port>` with **Host Pinning** (`Host: 127.0.0.1:<port>`), `fs.realpath` containment inside `themes/assets/`, `X-Content-Type-Options: nosniff`, and sandboxed SVG CSP (`default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox`).
- Protects `/__telemetry` and `/__events` (incremental SSE Byte-Tailer) behind a **256-bit `X-Agy-Token`** header and requires token verification inside `agySaveThemeConfig` CDP binding calls.

---

## 3. Portable `.agytheme` Package Specification (`agytheme/2.0`)

Generated and imported by `engine/agy_theme_forge.js` (`window.__AGY_THEME_FORGE__`):

```json
{
  "schema": "agytheme/2.0",
  "exportedAt": "2026-11-22T00:00:00.000Z",
  "name": "Forged Crimson Eclipse",
  "masterPersona": "yoriichi",
  "settings": {
    "dimming": 28,
    "glassBlur": 3,
    "inputStyle": "sync",
    "transparentWorld": true
  },
  "theme": {
    "concept": "OKLCH Perceptual Forged Theme • WCAG AA Verified",
    "primary": "#f59e0b",
    "secondary": "#ef4444",
    "fxMode": "sun",
    "wallpaper": "data:image/webp;base64,...",
    "userAvatar": "assets/yoriichi_avatar.jpg",
    "userActionSticker": "assets/yoriichi_action.png"
  }
}
```

- On import (`importAgyThemeObject`), `__AGY_SEC__.stripProtoKeys`, `sanitizeCssValue`, `sanitizeCssUrl`, and DOMParser-based `sanitizeSvgMarkup` neutralize prototype pollution, CSS breakout payloads, and executable SVG tags before persisting to `localStorage` (`agy_forged_themes_v2`).

---

## 4. Critical Antigravity 2.0 DOM Rules & Structural Invariants

1. **Never Leave `:empty` Children Inside `.agy-user-bubble-frame`:**
   - Upstream Antigravity 2.0 applies `[&:has(>.agy-user-bubble-frame>:empty)]:hidden` on user message wrappers.
   - Any injected child inside `.agy-user-bubble-frame` (such as `button.agy-chibi-hitbox`) **must** contain an inner element (`<i aria-hidden="true"></i>`). Leaving it `:empty` causes the entire user chat bubble to vanish!
   - `engine/core.js` also reinforces visibility via `.agy-shell div:has(> .agy-user-bubble-frame > .agy-user-bubble:not(:empty)) { display: flex !important; }`.
2. **Always Use `<agy-live-fx id="agy-live-fx-host">` Inside `.agy-shell`:**
   - Unified L-glass layout relies on `.agy-shell > div:first-of-type:not(#agy-live-fx-host)` (top bar) and `.agy-shell > div:not(:first-of-type):not(#agy-live-fx-host)` (workbench panes).
   - Mounting a custom tag `<agy-live-fx>` instead of `<div>` guarantees `:first-of-type` never matches the wallpaper VFX host.
3. **Circadian & Privacy Shield Root Datasets:**
   - `html[data-agy-circadian="night" | "dawn"]` (`engine/kny_bio_audio.js`) applies subtle `sepia`/`brightness` filters **exclusively** to `agy-live-fx`, `#agy-live-fx-host`, and `.agy-shell::before` so Monaco Editor syntax colors remain 100% accurate.
   - `html[data-agy-privacy-shield="1"]` and `html[data-agy-privacy-strict="1"]` (`engine/kny_cinema_director.js`) apply non-destructive `filter: blur(7px)` to file trees, breadcrumbs, project pills, and chat history while explicitly whitelisting `agy-live-fx`, Chibi hitboxes, `#agy-token-context-bar`, and skill canvases with `filter: none !important`.
4. **Split-Browser Cutout (`data-has-browser-hole`):**
   - Whenever `body[data-has-browser-hole="true"]` is active, `.agy-shell` computes an `evenodd` `clip-path` polygon hole around the embedded browser viewport so live web previews render with native clarity.
