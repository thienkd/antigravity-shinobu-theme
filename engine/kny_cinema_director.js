// ============================================================================
// Kimetsu no Yaiba — 1-Click Cinema Demo Director & Privacy Shield (kny_cinema_director.js)
// Exposes window.__AGY_CINEMA_DIRECTOR__
// - Enterprise 1-Click Privacy Shield (Alt+Shift+P): Non-destructive glass blur masking
//   of sensitive IDE file trees, breadcrumbs, chat history & endpoints while keeping
//   4K wallpapers, Yoriichi Chibi, Hashira Squad, Red Blade & Breathing VFX 100% razor-sharp.
// - 15-Second Auto-Showcase Choreography (Alt+Shift+C): Automated trailer director.
// Built 100% with document.createElement + .textContent (Zero XSS surface).
// ============================================================================

(() => {
  'use strict';

  const ROOT = typeof window !== 'undefined' ? window : globalThis;

  // Clean teardown on hot-reload if a previous instance exists (preserve active Privacy Shield without flicker)
  if (ROOT.__AGY_CINEMA_DIRECTOR__ && typeof ROOT.__AGY_CINEMA_DIRECTOR__.destroy === 'function') {
    try { ROOT.__AGY_CINEMA_DIRECTOR__.destroy({ isReinject: true }); } catch (_) {}
  }
  const wasShieldActive = Boolean(
    typeof document !== 'undefined' &&
      document.documentElement &&
      document.documentElement.dataset.agyPrivacyShield === '1'
  );

  const STORAGE_THEME = 'agy_theme_v3';
  const STORAGE_BUBBLE = 'agy_bubble_v3';
  const STORAGE_DIRECTOR_PREFS = 'agy_kny_cinema_prefs';

  const STYLE_ID = 'antigravity-kny-cinema-director-style';
  const SHIELD_BADGE_ID = 'agy-cinema-privacy-badge';
  const PANEL_ID = 'agy-cinema-director-panel';
  const STAGE_BANNER_ID = 'agy-cinema-stage-banner';
  const METSU_SEAL_ID = 'agy-cinema-metsu-seal';
  const RED_BLADE_SHOWCASE_ID = 'agy-cinema-red-blade-crest';
  const HUD_BAR_ID = 'agy-token-context-bar';
  const AUTO_HUD_BTN_ID = 'agy-cinema-hud-btn';

  const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(String(navigator.platform || navigator.userAgent || ''));
  const SHORTCUT_SHIELD = IS_MAC ? '⌥⇧P' : 'Alt+Shift+P';
  const SHORTCUT_CINEMA = IS_MAC ? '⌥⇧C' : 'Alt+Shift+C';

  const SENSITIVE_TEXT_RE = /(?:localhost:\d{2,5}|127\.0\.0\.1:\d{2,5}|0\.0\.0\.0:\d{2,5}|[A-Za-z]:\\[A-Za-z0-9._ -]+\\|[A-Za-z]:\\(?:Users|Projects|Workspaces|Repos)\\[A-Za-z0-9._-]+|[A-Za-z]:\/[A-Za-z0-9._ -]+\/|\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,})/i;

  function loadDirectorPrefs() {
    try {
      if (typeof localStorage === 'undefined') {
        return { strictRedact: false, autoShield: true, keepShieldAfter: false };
      }
      const raw = localStorage.getItem(STORAGE_DIRECTOR_PREFS);
      if (!raw) return { strictRedact: false, autoShield: true, keepShieldAfter: false };
      const parsed = JSON.parse(raw);
      return {
        strictRedact: Boolean(parsed && parsed.strictRedact),
        autoShield: parsed && typeof parsed.autoShield === 'boolean' ? parsed.autoShield : true,
        keepShieldAfter: parsed && typeof parsed.keepShieldAfter === 'boolean' ? parsed.keepShieldAfter : false
      };
    } catch (_) {
      return { strictRedact: false, autoShield: true, keepShieldAfter: false };
    }
  }

  function saveDirectorPrefs(p) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_DIRECTOR_PREFS, JSON.stringify({
          strictRedact: Boolean(p.strictRedact),
          autoShield: Boolean(p.autoShield),
          keepShieldAfter: Boolean(p.keepShieldAfter)
        }));
      }
    } catch (_) {}
  }

  const state = {
    destroyed: false,
    prefs: loadDirectorPrefs(),
    shieldActive: false,
    shieldScanTimer: 0,
    shieldChunkTimer: 0,
    shieldScanCursor: 0,
    shieldPendingNodes: [],
    shieldObserver: null,
    shieldMutationDebounce: 0,

    // Showcase choreography state
    showcaseRunning: false,
    showcaseStartMs: 0,
    showcaseTimers: [],
    showcaseProgressRaf: 0,
    savedSnapshot: null,
    lastRestoredSnapshot: null,
    snapshotRestoredForRun: false,
    savedThemeName: '',
    savedBubbleName: '',
    savedShieldBeforeShowcase: false,
    savedBladeBonus: 0,

    // UI elements
    panelEl: null,
    anchorEl: null,
    progressFillEl: null,
    progressTimeEl: null,
    playBtnEl: null,
    shieldSwitchEl: null,
    hudMountTimer: 0,
    hudMountInitTimer: 0,
    cleanups: []
  };

  /* ==========================================================================
   * 1. NON-DESTRUCTIVE PRIVACY SHIELD & CINEMA STAGE CSS
   * ========================================================================== */

  function ensureStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    st.textContent = `
      /* ======================================================================
       * 1-CLICK ENTERPRISE PRIVACY SHIELD (100% Non-Destructive Blur Masking)
       * Blurs workspace trees, breadcrumbs, editor tabs, project pills & chat history
       * while keeping 4K backgrounds, Chibis, Hashira Squad & VFX 100% sharp!
       * ====================================================================== */
      html[data-agy-privacy-shield="1"] .explorer-folders-view,
      html[data-agy-privacy-shield="1"] [role="tree"],
      html[data-agy-privacy-shield="1"] [data-testid*="file-tree"],
      html[data-agy-privacy-shield="1"] [data-testid*="explorer"],
      html[data-agy-privacy-shield="1"] .monaco-breadcrumbs,
      html[data-agy-privacy-shield="1"] [class*="breadcrumb"],
      html[data-agy-privacy-shield="1"] [data-testid*="breadcrumb"],
      html[data-agy-privacy-shield="1"] .tabs-and-actions-container .tab,
      html[data-agy-privacy-shield="1"] [role="tablist"] [role="tab"],
      html[data-agy-privacy-shield="1"] .tab-label,
      html[data-agy-privacy-shield="1"] .preview-tabs,
      html[data-agy-privacy-shield="1"] [data-testid="project-selector-trigger"],
      html[data-agy-privacy-shield="1"] [aria-label="Select Environment"],
      html[data-agy-privacy-shield="1"] [data-testid="branch-pill-trigger"],
      html[data-agy-privacy-shield="1"] .window-title,
      html[data-agy-privacy-shield="1"] [data-testid*="conversation-list"] a,
      html[data-agy-privacy-shield="1"] [data-testid*="conversation-item"],
      html[data-agy-privacy-shield="1"] .sidebar-conv-list,
      html[data-agy-privacy-shield="1"] .bg-sidebar .conv-item,
      html[data-agy-privacy-shield="1"] .agy-tok-pop-title,
      html[data-agy-privacy-shield="1"] aside nav a:not(#agy-custom-theme-sidebar-btn),
      html[data-agy-privacy-shield="1"] aside [role="listitem"]:not(:has(#agy-custom-theme-sidebar-btn)),
      html[data-agy-privacy-shield="1"] [data-agy-sensitive-masked="1"] {
        filter: blur(7px) !important;
        user-select: none !important;
        transition: filter 0.22s ease;
      }

      /* Strict Redact Option: Also masks code editor lines, terminal, composer & raw message text */
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] .monaco-editor .view-lines,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] .monaco-list-rows,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] .xterm-screen,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] .agy-user-bubble,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="user-message-bubble"],
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] p,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] pre,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] li,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] code,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] table,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] blockquote,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] h1,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] h2,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] h3,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] [data-testid="agent-response"] details,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] .surface-composer textarea,
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] .surface-composer [contenteditable="true"],
      html[data-agy-privacy-shield="1"][data-agy-privacy-strict="1"] #agy-yoriichi-msg-echo {
        filter: blur(7.5px) !important;
        user-select: none !important;
      }

      /* Explicitly guarantee 100% crystal sharpness for KNY Theme Art, Chibis, Squad, Red Blade & VFX */
      html[data-agy-privacy-shield="1"] agy-live-fx,
      html[data-agy-privacy-shield="1"] #agy-live-fx-host,
      html[data-agy-privacy-shield="1"] #agy-live-fx-canvas,
      html[data-agy-privacy-shield="1"] agy-hashira-squad,
      html[data-agy-privacy-shield="1"] agy-skill-vfx,
      html[data-agy-privacy-shield="1"] #agy-custom-theme-sidebar-btn,
      html[data-agy-privacy-shield="1"] .agy-chibi-hitbox,
      html[data-agy-privacy-shield="1"] #agy-shinobu-npc-wrap,
      html[data-agy-privacy-shield="1"] #${HUD_BAR_ID},
      html[data-agy-privacy-shield="1"] #${SHIELD_BADGE_ID},
      html[data-agy-privacy-shield="1"] #${PANEL_ID},
      html[data-agy-privacy-shield="1"] #${STAGE_BANNER_ID},
      html[data-agy-privacy-shield="1"] #${METSU_SEAL_ID},
      html[data-agy-privacy-shield="1"] #${RED_BLADE_SHOWCASE_ID} {
        filter: none !important;
      }

      /* Top Privacy Shield Status Pill (top: 42px clears 38px macOS titlebar & Traffic Lights) */
      #${SHIELD_BADGE_ID} {
        position: fixed;
        top: 42px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100040;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 4.5px 13px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(6, 78, 59, 0.92) 0%, rgba(15, 23, 42, 0.95) 100%);
        border: 1px solid rgba(52, 211, 153, 0.62);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55), 0 0 14px rgba(16, 185, 129, 0.28);
        color: #ecfdf5;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.3px;
        cursor: pointer;
        user-select: none;
        -webkit-app-region: no-drag;
      }
      #${SHIELD_BADGE_ID}:hover {
        border-color: #6ee7b7;
      }

      /* HUD Showcase Button */
      #${AUTO_HUD_BTN_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid rgba(251, 146, 60, 0.38);
        background: rgba(24, 16, 28, 0.78);
        color: #ffedd5;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.14s ease, border-color 0.16s ease, background 0.16s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.34);
      }
      #${AUTO_HUD_BTN_ID}:hover {
        transform: translateY(-1px);
        border-color: rgba(251, 191, 36, 0.75);
        background: rgba(67, 20, 32, 0.88);
      }
      #${AUTO_HUD_BTN_ID}[data-shield="1"] {
        border-color: rgba(52, 211, 153, 0.68);
      }
      #${AUTO_HUD_BTN_ID}[data-running="1"] {
        background: linear-gradient(135deg, rgba(185, 28, 28, 0.9) 0%, rgba(217, 119, 6, 0.9) 100%);
        border-color: #fde047;
        color: #ffffff;
      }

      /* Cinema Director Control Panel */
      #${PANEL_ID} {
        position: fixed;
        z-index: 100030;
        width: 312px;
        padding: 13px 14px;
        border-radius: 15px;
        background: rgba(15, 11, 22, 0.97);
        border: 1px solid rgba(251, 146, 60, 0.42);
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.84), 0 0 26px rgba(234, 88, 12, 0.20);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-size: 12px;
        user-select: none;
        -webkit-app-region: no-drag;
      }
      #${PANEL_ID} .agy-cd-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 8px;
        margin-bottom: 9px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.09);
      }
      #${PANEL_ID} .agy-cd-title {
        font-size: 13px;
        font-weight: 700;
        color: #fed7aa;
      }
      #${PANEL_ID} .agy-cd-sub {
        font-size: 10.5px;
        color: #94a3b8;
        margin-top: 1px;
      }
      #${PANEL_ID} .agy-cd-hero-btn {
        width: 100%;
        padding: 9px 12px;
        border-radius: 10px;
        border: 1px solid rgba(253, 224, 71, 0.55);
        background: linear-gradient(135deg, #991b1b 0%, #c2410c 52%, #b45309 100%);
        color: #fefce8;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 6px 18px rgba(185, 28, 28, 0.42);
        transition: transform 0.14s ease, filter 0.14s ease;
      }
      #${PANEL_ID} .agy-cd-hero-btn:hover {
        transform: translateY(-1px);
        filter: brightness(1.08);
      }
      #${PANEL_ID} .agy-cd-prog-wrap {
        margin-top: 8px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .agy-cd-prog-track {
        height: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.09);
        overflow: hidden;
      }
      #${PANEL_ID} .agy-cd-prog-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #facc15 0%, #fb923c 50%, #ef4444 100%);
        transition: width 0.08s linear;
      }
      #${PANEL_ID} .agy-cd-prog-meta {
        display: flex;
        justify-content: space-between;
        font-size: 10.5px;
        color: #cbd5e1;
        margin-top: 4px;
        font-variant-numeric: tabular-nums;
      }
      #${PANEL_ID} .agy-cd-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 4px;
        border-radius: 8px;
      }
      #${PANEL_ID} .agy-cd-row:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      #${PANEL_ID} .agy-cd-lbl {
        display: flex;
        flex-direction: column;
        gap: 1px;
        cursor: pointer;
      }
      #${PANEL_ID} .agy-cd-lbl-main {
        font-size: 12px;
        font-weight: 600;
        color: #f1f5f9;
      }
      #${PANEL_ID} .agy-cd-lbl-desc {
        font-size: 10.5px;
        color: #94a3b8;
      }
      #${PANEL_ID} .agy-cd-switch {
        position: relative;
        width: 34px;
        height: 19px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(51, 65, 85, 0.72);
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        transition: background 0.16s ease;
      }
      #${PANEL_ID} .agy-cd-switch[aria-checked="true"] {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        border-color: rgba(110, 231, 183, 0.75);
      }
      #${PANEL_ID} .agy-cd-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #ffffff;
        transition: transform 0.16s ease;
      }
      #${PANEL_ID} .agy-cd-switch[aria-checked="true"] .agy-cd-knob {
        transform: translateX(15px);
      }

      /* Cinematic Act Subtitle Ribbon during 15s Trailer */
      #${STAGE_BANNER_ID} {
        position: fixed;
        top: 76px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100035;
        padding: 6px 18px;
        border-radius: 999px;
        background: rgba(12, 10, 20, 0.86);
        border: 1px solid rgba(250, 204, 21, 0.52);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 18px rgba(250, 204, 21, 0.22);
        color: #fef9c3;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        pointer-events: none;
      }

      /* Showcase Crimson Red Blade 100% Indicator (Act II: 4s–8s) */
      #${RED_BLADE_SHOWCASE_ID} {
        position: fixed;
        bottom: 112px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100032;
        padding: 7px 20px;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(69, 10, 10, 0.94) 0%, rgba(185, 28, 28, 0.95) 50%, rgba(69, 10, 10, 0.94) 100%);
        border: 1.5px solid #fca5a5;
        box-shadow: 0 0 28px rgba(239, 68, 68, 0.78), inset 0 0 12px rgba(254, 202, 202, 0.45);
        color: #fef2f2;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-size: 12.5px;
        font-weight: 800;
        letter-spacing: 0.8px;
        pointer-events: none;
      }

      /* Act IV (13s–15s): Crimson Vermilion Seal 「滅」 (DEMON ANNIHILATED) */
      @keyframes agyMetsuStampImpact {
        0% { transform: translate(-50%, -50%) scale(2.35) rotate(-8deg); opacity: 0; }
        22% { transform: translate(-50%, -50%) scale(0.96) rotate(1.5deg); opacity: 1; }
        34% { transform: translate(-50%, -50%) scale(1.03) rotate(0deg); opacity: 1; }
        84% { transform: translate(-50%, -50%) scale(1.0) rotate(0deg); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1.08) rotate(0deg); opacity: 0; }
      }
      #${METSU_SEAL_ID} {
        position: fixed;
        top: 47%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 100050;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      @media (prefers-reduced-motion: no-preference) {
        #${METSU_SEAL_ID} {
          animation: agyMetsuStampImpact 1.95s cubic-bezier(0.18, 0.89, 0.32, 1.18) forwards;
        }
      }
      #${METSU_SEAL_ID} .agy-metsu-frame {
        width: 158px;
        height: 158px;
        border-radius: 22px;
        border: 4px solid #ef4444;
        outline: 2px solid rgba(250, 204, 21, 0.72);
        outline-offset: 4px;
        background: radial-gradient(circle, rgba(153, 27, 27, 0.92) 0%, rgba(69, 10, 10, 0.96) 100%);
        box-shadow: 0 0 54px rgba(220, 38, 38, 0.88), inset 0 0 24px rgba(252, 165, 165, 0.36);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #${METSU_SEAL_ID} .agy-metsu-kanji {
        font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP', 'Noto Serif JP', 'Source Han Serif JP', 'IPAPMincho', 'MS PMincho', 'Noto Serif', Georgia, serif;
        font-size: 96px;
        font-weight: 900;
        line-height: 1;
        color: #fef2f2;
        text-shadow: 0 0 22px rgba(248, 113, 113, 0.95), 0 3px 10px rgba(0, 0, 0, 0.85);
      }
      #${METSU_SEAL_ID} .agy-metsu-caption {
        margin-top: 14px;
        padding: 4px 16px;
        border-radius: 999px;
        background: rgba(24, 8, 12, 0.92);
        border: 1px solid rgba(252, 165, 165, 0.65);
        color: #fecaca;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-size: 12.5px;
        font-weight: 800;
        letter-spacing: 2.2px;
      }
    `;
  }

  /* ==========================================================================
   * 2. PRIVACY SHIELD CONTROLLER (Alt+Shift+P)
   * ========================================================================== */

  const SHIELD_IGNORE_SELECTOR = `#${PANEL_ID}, #${SHIELD_BADGE_ID}, #${HUD_BAR_ID}, #agy-custom-theme-modal-backdrop, agy-hashira-squad, agy-skill-vfx`;

  function inspectAndMaskCandidate(el) {
    if (!el || !el.dataset || el.dataset.agySensitiveMasked === '1') return;
    if (typeof el.closest === 'function' && el.closest(SHIELD_IGNORE_SELECTOR)) {
      return;
    }
    const txt = (el.textContent || '').slice(0, 600);
    const ttl = (el.getAttribute && el.getAttribute('title')) || '';
    if ((txt && SENSITIVE_TEXT_RE.test(txt)) || (ttl && SENSITIVE_TEXT_RE.test(ttl))) {
      el.dataset.agySensitiveMasked = '1';
    }
  }

  function scanAndTagSensitiveInlineNodes(sweepAllAsync = false) {
    if (typeof document === 'undefined' || !state.shieldActive || state.destroyed) return;
    const candidates = document.querySelectorAll('code, a, .monaco-icon-label-container, [title]');
    const len = candidates.length;
    if (len === 0) return;

    // Pha 1: Quét ưu tiên 250 node cuối DOM (tin nhắn đang stream ở cuối hội thoại)
    const TAIL = 250;
    const tailStart = Math.max(0, len - TAIL);
    for (let i = len - 1; i >= tailStart; i--) {
      inspectAndMaskCandidate(candidates[i]);
    }

    if (tailStart === 0) {
      state.shieldScanCursor = 0;
      return;
    }

    // Pha 2: Quét phần đầu & giữa DOM [0 .. tailStart - 1] bằng batch cuốn chiếu + async chunk khi vừa bật Khiên
    const BATCH = 400;
    if (tailStart <= BATCH) {
      for (let i = 0; i < tailStart; i++) {
        inspectAndMaskCandidate(candidates[i]);
      }
      state.shieldScanCursor = 0;
      return;
    }

    const startIdx = state.shieldScanCursor % tailStart;
    for (let c = 0; c < BATCH; c++) {
      inspectAndMaskCandidate(candidates[(startIdx + c) % tailStart]);
    }
    state.shieldScanCursor = (startIdx + BATCH) % tailStart;

    if (sweepAllAsync) {
      clearTimeout(state.shieldChunkTimer);
      state.shieldChunkTimer = 0;
      let chunkPos = 0;
      const CHUNK = 500;
      const runChunk = () => {
        state.shieldChunkTimer = 0;
        if (!state.shieldActive || state.destroyed || typeof document === 'undefined') return;
        const liveList = document.querySelectorAll('code, a, .monaco-icon-label-container, [title]');
        const limit = Math.min(liveList.length, chunkPos + CHUNK);
        for (let i = chunkPos; i < limit; i++) {
          inspectAndMaskCandidate(liveList[i]);
        }
        chunkPos = limit;
        if (chunkPos < liveList.length) {
          state.shieldChunkTimer = setTimeout(runChunk, 16);
        }
      };
      state.shieldChunkTimer = setTimeout(runChunk, 16);
    }
  }

  function disconnectShieldObserver() {
    clearTimeout(state.shieldMutationDebounce);
    state.shieldMutationDebounce = 0;
    clearTimeout(state.shieldChunkTimer);
    state.shieldChunkTimer = 0;
    state.shieldPendingNodes = [];
    if (state.shieldObserver) {
      try { state.shieldObserver.disconnect(); } catch (_) {}
      state.shieldObserver = null;
    }
  }

  function ensureShieldObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
    if (state.shieldObserver) return;
    state.shieldObserver = new MutationObserver((mutations) => {
      if (!state.shieldActive || state.destroyed) return;
      if (Array.isArray(mutations) && state.shieldPendingNodes.length < 150) {
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (m.target && m.target.nodeType === 1) {
            state.shieldPendingNodes.push(m.target);
          }
          if (m.addedNodes && m.addedNodes.length > 0) {
            for (let j = 0; j < m.addedNodes.length; j++) {
              const n = m.addedNodes[j];
              if (n && n.nodeType === 1) state.shieldPendingNodes.push(n);
              if (state.shieldPendingNodes.length >= 150) break;
            }
          }
          if (state.shieldPendingNodes.length >= 150) break;
        }
      }
      if (state.shieldMutationDebounce) return;
      state.shieldMutationDebounce = setTimeout(() => {
        state.shieldMutationDebounce = 0;
        const pending = state.shieldPendingNodes.splice(0, 150);
        if (state.shieldActive && !state.destroyed) {
          for (let i = 0; i < pending.length; i++) {
            const node = pending[i];
            if (!node || !node.isConnected) continue;
            if (typeof node.matches === 'function' && node.matches('code, a, .monaco-icon-label-container, [title]')) {
              inspectAndMaskCandidate(node);
            }
            if (typeof node.querySelectorAll === 'function') {
              const sub = node.querySelectorAll('code, a, .monaco-icon-label-container, [title]');
              for (let k = 0; k < sub.length && k < 120; k++) {
                inspectAndMaskCandidate(sub[k]);
              }
            }
          }
          scanAndTagSensitiveInlineNodes(false);
        }
      }, 120);
    });
    state.shieldObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function clearSensitiveInlineTags() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-agy-sensitive-masked="1"]').forEach((el) => {
      delete el.dataset.agySensitiveMasked;
    });
  }

  function renderShieldBadge() {
    if (typeof document === 'undefined' || !document.body) return;
    let badge = document.getElementById(SHIELD_BADGE_ID);
    if (!state.shieldActive) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = SHIELD_BADGE_ID;
      badge.setAttribute('role', 'status');
      badge.title = `Nhấn để tắt Khiên Che Mật hoặc bấm ${SHORTCUT_SHIELD}`;
      badge.addEventListener('click', (ev) => {
        ev.stopPropagation();
        togglePrivacyShield(false);
      });
      document.body.appendChild(badge);
    }
    badge.textContent = state.prefs.strictRedact
      ? `🛡️ KHIÊN CHE MẬT NGHIÊM NGẶT ĐANG BẬT (${SHORTCUT_SHIELD})`
      : `🛡️ KHIÊN CHE MẬT ĐANG BẬT (${SHORTCUT_SHIELD})`;
  }

  function syncShieldAttributes(sweepAllAsync = false) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    if (state.shieldActive && !state.destroyed) {
      document.documentElement.dataset.agyPrivacyShield = '1';
      if (state.prefs.strictRedact) {
        document.documentElement.dataset.agyPrivacyStrict = '1';
      } else {
        delete document.documentElement.dataset.agyPrivacyStrict;
      }
      scanAndTagSensitiveInlineNodes(sweepAllAsync);
      ensureShieldObserver();
      if (!state.shieldScanTimer) {
        state.shieldScanTimer = setInterval(() => scanAndTagSensitiveInlineNodes(false), 1800);
      }
    } else {
      state.shieldActive = false;
      delete document.documentElement.dataset.agyPrivacyShield;
      delete document.documentElement.dataset.agyPrivacyStrict;
      disconnectShieldObserver();
      clearInterval(state.shieldScanTimer);
      state.shieldScanTimer = 0;
      clearSensitiveInlineTags();
    }
    renderShieldBadge();
    if (state.shieldSwitchEl) {
      state.shieldSwitchEl.setAttribute('aria-checked', state.shieldActive ? 'true' : 'false');
    }
    updateHudButtonVisual();
  }

  function togglePrivacyShield(forceState) {
    if (state.destroyed) {
      if (forceState === false) {
        state.shieldActive = false;
        syncShieldAttributes(false);
      }
      return false;
    }
    ensureStyles();
    const prevActive = state.shieldActive;
    state.shieldActive = typeof forceState === 'boolean' ? forceState : !state.shieldActive;
    syncShieldAttributes(!prevActive && state.shieldActive);
    if (prevActive !== state.shieldActive) {
      try {
        if (ROOT.__AGY_THEME_CORE__ && typeof ROOT.__AGY_THEME_CORE__.syncPrivacyShield === 'function') {
          ROOT.__AGY_THEME_CORE__.syncPrivacyShield(state.shieldActive);
        } else if (typeof __AGY_SEC__ === 'object' && __AGY_SEC__ && typeof __AGY_SEC__.saveConfigSecure === 'function') {
          __AGY_SEC__.saveConfigSecure({ privacyShieldActive: state.shieldActive });
        }
      } catch (_) {}
    }
    return state.shieldActive;
  }

  /* ==========================================================================
   * 3. SEAMLESS THEME SWITCHER & 15-SECOND AUTO-SHOWCASE CHOREOGRAPHY
   * ========================================================================== */

  function resolveMatchingThemeKey(queryOrExactName) {
    const raw = String(queryOrExactName || '').trim();
    if (!raw) return '';
    const core = ROOT.__AGY_THEME_CORE__;
    if (core && typeof core.getThemeKeys === 'function') {
      try {
        const keys = core.getThemeKeys();
        const qLower = raw.toLowerCase();
        const matched = keys.find((k) => k === raw) ||
          keys.find((k) => String(k || '').toLowerCase().includes(qLower));
        if (matched) return matched;
      } catch (_) {}
    }
    return raw;
  }

  function switchShowcaseThemeTransient(queryOrExactName) {
    if (state.destroyed) return false;
    const core = ROOT.__AGY_THEME_CORE__;
    if (core && typeof core.getThemeKeys === 'function' && typeof core.applyTransientTheme === 'function') {
      try {
        const matched = resolveMatchingThemeKey(queryOrExactName);
        if (matched) {
          return Boolean(core.applyTransientTheme(matched));
        }
      } catch (_) {}
    }
    return switchPresetSilently(queryOrExactName, queryOrExactName, { transient: true });
  }

  function restoreOriginalThemeSnapshot(finalizeClear = false) {
    if (state.destroyed) return false;
    const core = ROOT.__AGY_THEME_CORE__;
    const snap = state.savedSnapshot || state.lastRestoredSnapshot;
    if (snap && typeof snap === 'object') {
      state.lastRestoredSnapshot = { ...snap };
      if (core && typeof core.restoreSnapshot === 'function') {
        try {
          core.restoreSnapshot(snap);
          if (finalizeClear) state.savedSnapshot = null;
          return true;
        } catch (_) {}
      }
      const applyFn = (core && typeof core.applyTheme === 'function')
        ? core.applyTheme
        : ROOT.__ANTIGRAVITY_APPLY_CUSTOM_THEME__;
      if (typeof applyFn === 'function') {
        try {
          applyFn({ ...snap }, { skipSaveDisk: true });
          if (finalizeClear) state.savedSnapshot = null;
          return true;
        } catch (_) {}
      }
    }
    if (state.savedThemeName) {
      const ok = switchPresetSilently(state.savedThemeName, state.savedBubbleName || state.savedThemeName);
      if (finalizeClear) state.savedSnapshot = null;
      return ok;
    }
    return false;
  }

  /**
   * Switches preset cleanly via Core API with { skipSaveDisk: true }.
   * NEVER simulates .click() on .agy-preset-card (which would wipe customWp: '' onto disk!).
   */
  function switchPresetSilently(presetName, optionalBubbleExact, extraOpts) {
    if (state.destroyed) return false;
    const resolvedTheme = resolveMatchingThemeKey(presetName);
    if (!resolvedTheme) return false;
    const resolvedBubble = optionalBubbleExact
      ? (resolveMatchingThemeKey(optionalBubbleExact) || resolvedTheme)
      : resolvedTheme;
    const opts = { skipSaveDisk: true, ...(extraOpts && typeof extraOpts === 'object' ? extraOpts : {}) };

    const core = ROOT.__AGY_THEME_CORE__;
    if (core && typeof core.applyTheme === 'function') {
      try {
        core.applyTheme({ themeName: resolvedTheme, bubbleName: resolvedBubble }, opts);
        return true;
      } catch (_) {}
    }

    if (typeof ROOT.__ANTIGRAVITY_APPLY_CUSTOM_THEME__ === 'function') {
      try {
        ROOT.__ANTIGRAVITY_APPLY_CUSTOM_THEME__({ themeName: resolvedTheme, bubbleName: resolvedBubble }, opts);
        return true;
      } catch (_) {}
    }

    const legacyFn = ROOT.__AGY_APPLY_THEME__ || ROOT.__AGY_SET_THEME__;
    if (typeof legacyFn === 'function') {
      try {
        legacyFn({ themeName: resolvedTheme, bubbleName: resolvedBubble }, opts);
        return true;
      } catch (_) {}
    }

    return false;
  }

  function showStageBanner(text) {
    if (typeof document === 'undefined' || !document.body) return;
    let el = document.getElementById(STAGE_BANNER_ID);
    if (!text) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = STAGE_BANNER_ID;
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  function showRedBladeCrest(visible) {
    if (typeof document === 'undefined' || !document.body) return;
    let el = document.getElementById(RED_BLADE_SHOWCASE_ID);
    if (!visible) {
      if (el) el.remove();
      return;
    }
    // Avoid visual overlap if dedicated Red Blade module already displays an active banner
    if (document.querySelector('[data-agy-red-blade-active="1"]')) return;
    if (!el) {
      el = document.createElement('div');
      el.id = RED_BLADE_SHOWCASE_ID;
      el.textContent = '🔥 HÁCH ĐAO KHAI MỞ — 赫刀 100% • QUÂN ĐOÀN ĐẠI TRỤ TẬP KẾT';
      document.body.appendChild(el);
    }
  }

  function stampMetsuSeal() {
    if (typeof document === 'undefined' || !document.body) return;
    const prev = document.getElementById(METSU_SEAL_ID);
    if (prev) prev.remove();
    const otherSeal = document.getElementById('agy-metsu-victory-overlay');
    if (otherSeal) otherSeal.remove();

    const wrap = document.createElement('div');
    wrap.id = METSU_SEAL_ID;
    wrap.setAttribute('aria-hidden', 'true');

    const frame = document.createElement('div');
    frame.className = 'agy-metsu-frame';

    const kanji = document.createElement('span');
    kanji.className = 'agy-metsu-kanji';
    kanji.setAttribute('lang', 'ja');
    kanji.textContent = '滅';
    frame.appendChild(kanji);

    const cap = document.createElement('div');
    cap.className = 'agy-metsu-caption';
    cap.textContent = 'ÁC QUỶ DIỆT SÁT • SÁT QUỶ ĐỘI';

    wrap.appendChild(frame);
    wrap.appendChild(cap);
    document.body.appendChild(wrap);
  }

  function clearShowcaseArtifacts() {
    while (state.showcaseTimers.length > 0) {
      clearTimeout(state.showcaseTimers.pop());
    }
    if (state.showcaseProgressRaf) {
      cancelAnimationFrame(state.showcaseProgressRaf);
      state.showcaseProgressRaf = 0;
    }
    showStageBanner('');
    showRedBladeCrest(false);
    if (typeof document !== 'undefined') {
      const seal = document.getElementById(METSU_SEAL_ID);
      if (seal) seal.remove();
    }
  }

  function syncPanelShowcaseState() {
    updateHudButtonVisual();
    if (state.playBtnEl) {
      state.playBtnEl.textContent = state.showcaseRunning
        ? '⏹️ Dừng Trình Diễn & Khôi Phục Ngay (Esc)'
        : `▶️ Tự Diễn Trình Chiếu 15s (${SHORTCUT_CINEMA})`;
    }
    if (!state.showcaseRunning) {
      if (state.progressFillEl) state.progressFillEl.style.width = '0%';
      if (state.progressTimeEl) state.progressTimeEl.textContent = '00.0s / 15.0s';
    }
  }

  function stopShowcase(restoreOriginal = true, stopOpts = {}) {
    const wasRunning = state.showcaseRunning;
    state.showcaseRunning = false;
    clearShowcaseArtifacts();

    const skipRestoreTheme = !restoreOriginal || state.destroyed || Boolean(stopOpts && stopOpts.skipRestoreTheme);

    if (wasRunning) {
      const skillsApi = ROOT.__AGY_BREATHING_SKILLS__ || ROOT.__AGY_KNY_SKILLS__;
      if (skillsApi && typeof skillsApi.stopActiveSkill === 'function') {
        try { skillsApi.stopActiveSkill(); } catch (_) {}
      }
      if (ROOT.__AGY_SQUAD_RAID__ && typeof ROOT.__AGY_SQUAD_RAID__.stopSimulation === 'function') {
        try { ROOT.__AGY_SQUAD_RAID__.stopSimulation(); } catch (_) {}
      }
      if (
        !state.destroyed &&
        typeof document !== 'undefined' &&
        document.getElementById(HUD_BAR_ID) &&
        ROOT.__AGY_TOKEN_HUD__ &&
        typeof ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat === 'function'
      ) {
        try { ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat(state.savedBladeBonus); } catch (_) {}
      }

      if (!skipRestoreTheme) {
        if (!state.snapshotRestoredForRun) {
          restoreOriginalThemeSnapshot(true);
        } else {
          state.savedSnapshot = null;
        }
        // When user explicitly cancels Trailer (Esc / Stop), ALWAYS restore exact pre-showcase Shield state
        togglePrivacyShield(state.savedShieldBeforeShowcase);
      }
    }

    if (skipRestoreTheme) {
      state.savedSnapshot = null;
      state.lastRestoredSnapshot = null;
      state.savedThemeName = '';
      state.savedBubbleName = '';
      state.savedBladeBonus = 0;
    }
    state.snapshotRestoredForRun = false;

    syncPanelShowcaseState();
  }

  function scheduleStep(delayMs, fn) {
    const id = setTimeout(() => {
      if (!state.showcaseRunning || state.destroyed) return;
      try { fn(); } catch (_) {}
    }, delayMs);
    state.showcaseTimers.push(id);
  }

  /**
   * 15-Second Automated Trailer Choreography:
   * - 0s–4s:   4K Parallax Hashira Tour (Shinobu -> Giyu -> Rengoku)
   * - 4s–8s:   5-Hashira Swarm Squad Raid + 100% Crimson Red Blade Ignition
   * - 8s–13s:  First Swordsman Yoriichi — Hinokami Kagura Thirteenth Form Finisher
   * - 13s–15s: Crimson 「滅」 Annihilation Seal + Nichirin "Kachin!" Sheathe + Theme Restore
   */
  function startShowcase() {
    if (state.destroyed) return false;
    ensureStyles();

    if (state.showcaseRunning) {
      stopShowcase(true);
      return false;
    }

    // Close control popover so the recorded viewport is clean and unobstructed
    closePanel();

    const core = ROOT.__AGY_THEME_CORE__;
    const snap = (core && typeof core.getSnapshot === 'function') ? core.getSnapshot() : null;
    state.savedSnapshot = snap ? { ...snap } : null;
    state.lastRestoredSnapshot = snap ? { ...snap } : null;
    state.savedThemeName = (state.savedSnapshot && state.savedSnapshot.themeName) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_THEME)) || '';
    state.savedBubbleName = (state.savedSnapshot && state.savedSnapshot.bubbleName) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_BUBBLE)) || state.savedThemeName;
    state.savedShieldBeforeShowcase = state.shieldActive;

    const hud = ROOT.__AGY_TOKEN_HUD__;
    state.savedBladeBonus = (hud && typeof hud.getBladeBonusHeat === 'function')
      ? (Number(hud.getBladeBonusHeat()) || 0)
      : 0;

    if (state.prefs.autoShield) {
      togglePrivacyShield(true);
    }

    state.showcaseRunning = true;
    state.snapshotRestoredForRun = false;
    state.showcaseStartMs = Date.now();
    syncPanelShowcaseState();

    const tickProgress = () => {
      if (!state.showcaseRunning || state.destroyed) return;
      const elapsedSec = Math.min(15, (Date.now() - state.showcaseStartMs) / 1000);
      const pct = Math.min(100, (elapsedSec / 15) * 100);
      if (state.progressFillEl) state.progressFillEl.style.width = `${pct.toFixed(1)}%`;
      if (state.progressTimeEl) state.progressTimeEl.textContent = `${elapsedSec.toFixed(1).padStart(4, '0')}s / 15.0s`;
      if (elapsedSec < 15) {
        state.showcaseProgressRaf = requestAnimationFrame(tickProgress);
      }
    };
    state.showcaseProgressRaf = requestAnimationFrame(tickProgress);

    // ACT I (0.0s – 4.0s): 4K Parallax Showcase across iconic Hashira realms
    scheduleStep(20, () => {
      showStageBanner('🎬 CẢNH I (0–4s) • CẢNH QUAN 4K ĐẠI TRỤ: TRÙNG TRỤ SHINOBU KOCHO');
      switchShowcaseThemeTransient('Shinobu');
    });

    scheduleStep(1950, () => {
      showStageBanner('🎬 CẢNH I (0–4s) • CẢNH QUAN 4K ĐẠI TRỤ: THỦY TRỤ GIYU & VIÊM TRỤ RENGOKU');
      switchShowcaseThemeTransient('Giyu');
    });

    scheduleStep(3050, () => {
      switchShowcaseThemeTransient('Rengoku');
    });

    // ACT II (4.0s – 8.0s): 5-Hashira Swarm Raid + 100% Crimson Red Blade
    scheduleStep(4000, () => {
      showStageBanner('⚔️ CẢNH II (4–8s) • QUÂN ĐOÀN CỬU TRỤ TẬP KẾT & NUNG ĐỎ HÁCH ĐAO 100%');
      showRedBladeCrest(true);

      const squadApi = ROOT.__AGY_SQUAD_RAID__;
      if (squadApi) {
        const fiveHashiraSquad = [
          { cid: 'showcase-h1', isSim: true, typeName: 'research', role: 'Trùng Trụ • Điệp Vũ Trinh Sát', lastTool: 'Giải độc & Phân tích Kiến trúc', stepCount: 4 },
          { cid: 'showcase-h2', isSim: true, typeName: 'self', role: 'Thủy Trụ • Tĩnh Thủy Phòng Tuyến', lastTool: 'Bảo vệ Ranh giới Bảo mật CDP', stepCount: 5 },
          { cid: 'showcase-h3', isSim: true, typeName: 'self', role: 'Viêm Trụ • Luyện Ngục Tiên Phong', lastTool: 'Nung đỏ Nhật Luân Hách Đao 100%', stepCount: 6 },
          { cid: 'showcase-h4', isSim: true, typeName: 'browser', role: 'Âm Trụ • Phổ Nhạc Chiến Trường', lastTool: 'Đồng bộ Khung hình 60fps 4K', stepCount: 4 },
          { cid: 'showcase-h5', isSim: true, typeName: 'image-generator', role: 'Hà Trụ • Mê Vụ Chế Tác', lastTool: 'Rèn Đa Vũ Trụ OKLCH .agytheme', stepCount: 5 }
        ];
        if (typeof squadApi.simulateRaid === 'function') {
          squadApi.simulateRaid({ durationMs: 3900, subagents: fiveHashiraSquad });
        } else if (typeof squadApi.triggerRaid === 'function') {
          squadApi.triggerRaid({ count: 5, durationMs: 3900 });
        }
      }

      if (
        !state.destroyed &&
        typeof document !== 'undefined' &&
        document.getElementById(HUD_BAR_ID) &&
        ROOT.__AGY_TOKEN_HUD__ &&
        typeof ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat === 'function'
      ) {
        try { ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat(100); } catch (_) {}
      }
      const redBladeApi = ROOT.__AGY_RED_BLADE__ || ROOT.__AGY_NICHIRIN_FORGE__;
      if (redBladeApi) {
        if (typeof redBladeApi.setHeat === 'function') redBladeApi.setHeat(100);
        if (typeof redBladeApi.ignite === 'function') redBladeApi.ignite();
        else if (typeof redBladeApi.igniteRedBlade === 'function') redBladeApi.igniteRedBlade();
      }
    });

    // ACT III (8.0s – 13.0s): First Swordsman Yoriichi — Single Clean Thirteenth Form Unleash
    scheduleStep(8000, () => {
      showRedBladeCrest(false);
      showStageBanner('☀️ CẢNH III (8–13s) • KIẾM SĨ ĐẦU TIÊN YORIICHI — VŨ ĐIỆU HỎA THẦN THẬP TAM THỨC');

      const skillsApi = ROOT.__AGY_BREATHING_SKILLS__ || ROOT.__AGY_KNY_SKILLS__;
      if (skillsApi && typeof skillsApi.castSkill === 'function') {
        const crestEl = typeof document !== 'undefined' ? document.querySelector('.agy-yoriichi-crest-btn') : null;
        const originRect = crestEl && typeof crestEl.getBoundingClientRect === 'function'
          ? crestEl.getBoundingClientRect()
          : null;
        skillsApi.castSkill('yoriichi', 3, {
          charId: 'yoriichi',
          durationMs: 3150,
          composerEl: null,
          originRect
        });
      } else if (ROOT.__AGY_TOKEN_HUD__ && typeof ROOT.__AGY_TOKEN_HUD__.castYoriichiSunBreathing === 'function') {
        ROOT.__AGY_TOKEN_HUD__.castYoriichiSunBreathing();
      }
    });

    // ACT IV (13.0s – 15.0s): Single Crisp Crimson 「滅」 Stamp + Nichirin "Kachin!" + Seamless Theme Restore
    scheduleStep(13000, () => {
      showStageBanner('🏮 CẢNH IV (13–15s) • ÁC QUỶ DIỆT SÁT 「滅」 & TRA KIẾM NHẬT LUÂN');
      stampMetsuSeal();
      if (ROOT.__AGY_BIO_AUDIO__ && typeof ROOT.__AGY_BIO_AUDIO__.playNichirinSheathe === 'function') {
        ROOT.__AGY_BIO_AUDIO__.playNichirinSheathe({ force: true });
      }
    });

    // Keep state.savedSnapshot intact across 14.55s–15.0s so an Esc cancel in that window never loses customWp!
    scheduleStep(14550, () => {
      if (restoreOriginalThemeSnapshot(false)) {
        state.snapshotRestoredForRun = true;
      }
    });

    scheduleStep(15000, () => {
      state.showcaseRunning = false;
      clearShowcaseArtifacts();
      if (!state.snapshotRestoredForRun) {
        restoreOriginalThemeSnapshot(true);
      } else {
        state.savedSnapshot = null;
        state.lastRestoredSnapshot = null;
      }
      state.snapshotRestoredForRun = false;
      if (
        !state.destroyed &&
        typeof document !== 'undefined' &&
        document.getElementById(HUD_BAR_ID) &&
        ROOT.__AGY_TOKEN_HUD__ &&
        typeof ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat === 'function'
      ) {
        try { ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat(state.savedBladeBonus); } catch (_) {}
      }
      if (!state.prefs.keepShieldAfter) {
        togglePrivacyShield(state.savedShieldBeforeShowcase);
      }
      syncPanelShowcaseState();
    });

    return true;
  }

  /* ==========================================================================
   * 4. CONTROL PANEL & HUD TRIGGER (100% createElement + textContent)
   * ========================================================================== */

  function updateHudButtonVisual() {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById(HUD_BAR_ID);
    const extTrigger = bar ? bar.querySelector('[data-agy-cinema-trigger="1"]') : null;
    if (extTrigger && extTrigger.id !== AUTO_HUD_BTN_ID) {
      if (state.shieldActive || state.showcaseRunning) {
        extTrigger.dataset.active = '1';
      } else {
        delete extTrigger.dataset.active;
      }
    }

    const btn = document.getElementById(AUTO_HUD_BTN_ID);
    if (!btn) return;
    btn.dataset.shield = state.shieldActive ? '1' : '0';
    btn.dataset.running = state.showcaseRunning ? '1' : '0';
    btn.textContent = state.showcaseRunning
      ? '⏹️ Đang diễn...'
      : (state.shieldActive ? '🛡️ Trình Diễn' : '🎬 Trình Diễn');
  }

  function closePanel() {
    if (state.panelEl && state.panelEl.isConnected) {
      state.panelEl.remove();
    }
    state.panelEl = null;
    state.anchorEl = null;
    state.progressFillEl = null;
    state.progressTimeEl = null;
    state.playBtnEl = null;
    state.shieldSwitchEl = null;
  }

  function buildToggleRow(titleText, descText, initialChecked, onFlip) {
    const row = document.createElement('div');
    row.className = 'agy-cd-row';

    const lbl = document.createElement('div');
    lbl.className = 'agy-cd-lbl';
    const m = document.createElement('span');
    m.className = 'agy-cd-lbl-main';
    m.textContent = titleText;
    const d = document.createElement('span');
    d.className = 'agy-cd-lbl-desc';
    d.textContent = descText;
    lbl.appendChild(m);
    lbl.appendChild(d);

    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'agy-cd-switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', initialChecked ? 'true' : 'false');
    const knob = document.createElement('span');
    knob.className = 'agy-cd-knob';
    sw.appendChild(knob);

    const trigger = (ev) => {
      ev.stopPropagation();
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      onFlip(next);
    };
    sw.addEventListener('click', trigger);
    lbl.addEventListener('click', trigger);

    row.appendChild(lbl);
    row.appendChild(sw);
    return { row, sw };
  }

  function openPanel(anchorEl) {
    if (state.destroyed || typeof document === 'undefined' || !document.body) return null;
    ensureStyles();

    if (state.panelEl && state.panelEl.isConnected && state.anchorEl === anchorEl) {
      closePanel();
      return null;
    }
    closePanel();
    try { ROOT.__AGY_BIO_AUDIO__?.closePopover?.(); } catch (_) {}
    try { ROOT.__AGY_TOKEN_HUD__?.closePopover?.(); } catch (_) {}
    state.anchorEl = anchorEl || null;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Đạo diễn Quay phim & Khiên Che Mật');

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'agy-cd-hdr';
    const hdrLeft = document.createElement('div');
    const hdrTitle = document.createElement('div');
    hdrTitle.className = 'agy-cd-title';
    hdrTitle.textContent = '🎬 Đạo Diễn Trình Diễn & Khiên Che Mật';
    const hdrSub = document.createElement('div');
    hdrSub.className = 'agy-cd-sub';
    hdrSub.textContent = 'Quay video an toàn 100% • Kịch bản tự diễn 15s';
    hdrLeft.appendChild(hdrTitle);
    hdrLeft.appendChild(hdrSub);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.style.cssText = 'background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 4px;';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel();
    });
    hdr.appendChild(hdrLeft);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    // 15s Showcase Hero Button
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'agy-cd-hero-btn';
    playBtn.textContent = state.showcaseRunning
      ? '⏹️ Dừng Trình Diễn & Khôi Phục Ngay (Esc)'
      : `▶️ Tự Diễn Trình Chiếu 15s (${SHORTCUT_CINEMA})`;
    playBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      startShowcase();
    });
    state.playBtnEl = playBtn;
    panel.appendChild(playBtn);

    // Timeline Progress
    const progWrap = document.createElement('div');
    progWrap.className = 'agy-cd-prog-wrap';
    const track = document.createElement('div');
    track.className = 'agy-cd-prog-track';
    const fill = document.createElement('div');
    fill.className = 'agy-cd-prog-fill';
    track.appendChild(fill);

    const meta = document.createElement('div');
    meta.className = 'agy-cd-prog-meta';
    const sceneHint = document.createElement('span');
    sceneHint.textContent = '4K Trụ -> Cửu Trụ -> Yoriichi -> 「滅」';
    const timeLbl = document.createElement('span');
    timeLbl.textContent = '00.0s / 15.0s';
    meta.appendChild(sceneHint);
    meta.appendChild(timeLbl);

    progWrap.appendChild(track);
    progWrap.appendChild(meta);
    panel.appendChild(progWrap);
    state.progressFillEl = fill;
    state.progressTimeEl = timeLbl;

    // Privacy Shield Toggle
    const shieldRow = buildToggleRow(
      `🛡️ Khiên Che Mật (${SHORTCUT_SHIELD})`,
      'Làm mờ cây thư mục, tên dự án & lịch sử chat',
      state.shieldActive,
      (val) => togglePrivacyShield(val)
    );
    state.shieldSwitchEl = shieldRow.sw;
    panel.appendChild(shieldRow.row);

    // Strict Redact Toggle
    const strictRow = buildToggleRow(
      '🔒 Che Nghiêm Ngặt Toàn Phần',
      'Làm mờ cả khung mã nguồn, cửa sổ dòng lệnh & chữ hội thoại',
      state.prefs.strictRedact,
      (val) => {
        state.prefs.strictRedact = val;
        saveDirectorPrefs(state.prefs);
        if (state.shieldActive) syncShieldAttributes(false);
      }
    );
    panel.appendChild(strictRow.row);

    // Auto-Shield on Trailer Toggle
    const autoShieldRow = buildToggleRow(
      '✨ Tự bật Khiên khi chạy Trình Diễn',
      'Bảo vệ chống lộ thông tin ngay giây đầu quay màn hình',
      state.prefs.autoShield,
      (val) => {
        state.prefs.autoShield = val;
        saveDirectorPrefs(state.prefs);
      }
    );
    panel.appendChild(autoShieldRow.row);

    // Keep Shield After Trailer Toggle
    const keepShieldRow = buildToggleRow(
      '📌 Giữ Khiên Che Mật sau khi hết Trình Diễn',
      'Không tự tắt Khiên sau mốc 15s (nhấn Esc vẫn khôi phục)',
      state.prefs.keepShieldAfter,
      (val) => {
        state.prefs.keepShieldAfter = val;
        saveDirectorPrefs(state.prefs);
      }
    );
    panel.appendChild(keepShieldRow.row);

    document.body.appendChild(panel);
    state.panelEl = panel;

    // Smart viewport positioning
    const vw = ROOT.innerWidth || 1280;
    const vh = ROOT.innerHeight || 800;
    const rect = panel.getBoundingClientRect();
    const pw = rect.width || 312;
    const ph = rect.height || 295;
    if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
      const r = anchorEl.getBoundingClientRect();
      let left = Math.round(r.left);
      let top = Math.round(r.top - ph - 8);
      if (top < 12) top = Math.min(vh - ph - 12, Math.round(r.bottom + 8));
      if (left + pw > vw - 12) left = Math.max(12, vw - pw - 12);
      panel.style.left = `${Math.max(12, left)}px`;
      panel.style.top = `${Math.max(12, top)}px`;
    } else {
      panel.style.right = '22px';
      panel.style.bottom = '86px';
    }

    return panel;
  }

  function ensureHudTriggerMounted() {
    if (state.destroyed || typeof document === 'undefined') return;
    const bar = document.getElementById(HUD_BAR_ID);
    if (!bar) return;
    if (bar.querySelector('[data-agy-cinema-trigger="1"]') || document.getElementById(AUTO_HUD_BTN_ID)) {
      updateHudButtonVisual();
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = AUTO_HUD_BTN_ID;
    btn.dataset.agyCinemaTrigger = '1';
    btn.title = `Đạo diễn Trình Diễn 15s (${SHORTCUT_CINEMA}) & Khiên Che Mật Dự Án (${SHORTCUT_SHIELD})`;
    btn.setAttribute('aria-label', btn.title);
    btn.textContent = '🎬 Trình Diễn';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openPanel(btn);
    });

    bar.appendChild(btn);
    updateHudButtonVisual();
  }

  /* ==========================================================================
   * 5. KEYBOARD SHORTCUTS & CLEAN DESTROY
   * ========================================================================== */

  function initDomLifecycle() {
    if (typeof document === 'undefined') return;
    ensureStyles();

    state.hudMountTimer = setInterval(ensureHudTriggerMounted, 1500);
    state.hudMountInitTimer = setTimeout(() => {
      state.hudMountInitTimer = 0;
      ensureHudTriggerMounted();
    }, 280);

    const onKeyDown = (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      if (state.destroyed) return;
      const code = String(ev.code || '');
      const keyUpper = String(ev.key || '').toUpperCase();

      const t = ev.target;
      const inEditable = Boolean(
        t && (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          (typeof t.closest === 'function' && t.closest('input, textarea, [contenteditable="true"], .monaco-editor, .xterm'))
        )
      );

      const isAltShiftOnly = ev.altKey && ev.shiftKey && !ev.ctrlKey && !ev.metaKey;
      const isCtrlAltShift = ev.ctrlKey && ev.altKey && ev.shiftKey && !ev.metaKey;
      // On macOS, Option+Shift+P/C inside text editors types ∏ / Ç, so only intercept Alt+Shift outside editable fields (Ctrl+Alt+Shift works everywhere)
      const allowShortcut = isCtrlAltShift || (isAltShiftOnly && !(IS_MAC && inEditable));

      // Alt + Shift + P (or Ctrl + Alt + Shift + P) -> Toggle 1-Click Privacy Shield
      if (allowShortcut && (code === 'KeyP' || keyUpper === 'P')) {
        ev.preventDefault();
        ev.stopPropagation();
        togglePrivacyShield();
        return;
      }

      // Alt + Shift + C (or Ctrl + Alt + Shift + C) -> Start / Stop 15s Auto-Showcase Trailer
      if (allowShortcut && (code === 'KeyC' || keyUpper === 'C')) {
        ev.preventDefault();
        ev.stopPropagation();
        startShowcase();
        return;
      }

      if (ev.key === 'Escape') {
        if (state.showcaseRunning) {
          stopShowcase(true);
        } else if (state.panelEl) {
          closePanel();
        }
      }
    };

    const onDocClick = (ev) => {
      if (!state.panelEl) return;
      const t = ev.target;
      if (state.panelEl.contains(t)) return;
      if (state.anchorEl && state.anchorEl.contains && state.anchorEl.contains(t)) return;
      closePanel();
    };

    ROOT.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onDocClick, true);

    state.cleanups.push(() => ROOT.removeEventListener('keydown', onKeyDown, true));
    state.cleanups.push(() => document.removeEventListener('click', onDocClick, true));

    if (
      wasShieldActive ||
      (typeof document !== 'undefined' &&
        document.documentElement &&
        document.documentElement.dataset.agyPrivacyShield === '1')
    ) {
      togglePrivacyShield(true);
    }
  }

  function destroy(opts) {
    const isReinject = Boolean(opts && opts.isReinject);
    const wasRunning = state.showcaseRunning;
    const userIntendedShield = wasRunning ? state.savedShieldBeforeShowcase : state.shieldActive;
    const keepShieldOnReinject = isReinject && (
      (wasRunning && state.prefs && state.prefs.keepShieldAfter && state.shieldActive) ||
      userIntendedShield ||
      (!wasRunning && Boolean(typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.agyPrivacyShield === '1'))
    );
    if (isReinject && wasRunning) {
      if (
        typeof document !== 'undefined' &&
        document.getElementById(HUD_BAR_ID) &&
        ROOT.__AGY_TOKEN_HUD__ &&
        typeof ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat === 'function'
      ) {
        try { ROOT.__AGY_TOKEN_HUD__.setBladeBonusHeat(state.savedBladeBonus); } catch (_) {}
      }
      if (!state.snapshotRestoredForRun) {
        try { restoreOriginalThemeSnapshot(true); } catch (_) {}
      }
    }
    state.destroyed = true;
    stopShowcase(false, { skipRestoreTheme: true });
    state.savedSnapshot = null;
    state.lastRestoredSnapshot = null;
    if (!isReinject || !keepShieldOnReinject) {
      togglePrivacyShield(false);
    } else if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.agyPrivacyShield = '1';
      if (state.prefs && state.prefs.strictRedact) {
        document.documentElement.dataset.agyPrivacyStrict = '1';
      }
    }
    disconnectShieldObserver();
    closePanel();
    clearInterval(state.hudMountTimer);
    state.hudMountTimer = 0;
    clearTimeout(state.hudMountInitTimer);
    state.hudMountInitTimer = 0;
    clearInterval(state.shieldScanTimer);
    state.shieldScanTimer = 0;

    while (state.cleanups.length > 0) {
      const fn = state.cleanups.pop();
      try { fn(); } catch (_) {}
    }

    if (typeof document !== 'undefined') {
      const idsToRemove = [
        SHIELD_BADGE_ID,
        PANEL_ID,
        STAGE_BANNER_ID,
        METSU_SEAL_ID,
        RED_BLADE_SHOWCASE_ID,
        AUTO_HUD_BTN_ID
      ];
      if (!isReinject) {
        idsToRemove.unshift(STYLE_ID);
      }
      idsToRemove.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  }

  function isPrivacyShieldActive() {
    return state.shieldActive;
  }

  initDomLifecycle();

  const API = Object.freeze({
    togglePrivacyShield,
    isPrivacyShieldActive,
    isPrivacyActive: isPrivacyShieldActive,
    startShowcase,
    runShowcase: startShowcase,
    playTrailer: startShowcase,
    stopShowcase,
    isShowcaseRunning: () => state.showcaseRunning,
    openPanel,
    openPopover: openPanel,
    togglePanel: openPanel,
    closePanel,
    destroy,
    teardown: destroy
  });

  ROOT.__AGY_CINEMA_DIRECTOR__ = API;
})();
