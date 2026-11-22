(() => {
  'use strict';

  /**
   * Antigravity Live Streaming Telemetry HUD, Bright Red Nichirin Forge (赫刀),
   * Crisis-to-Slash Battlefield Reflex & First Swordsman (Yoriichi) Command Echo.
   *
   * Security & Performance:
   *  - Reads assetBase & X-Agy-Token strictly via __AGY_SEC__ closure vault.
   *  - Sanitizes all CSS URLs via __AGY_SEC__.sanitizeCssUrl(...).
   *  - Connects to SSE byte-stream GET ${assetBase}__events?cid=${cid} (< 30ms latency)
   *    with AbortController lifecycle cleanup + resilient /__telemetry fallback backoff.
   */

  const HUD_BAR_ID = 'agy-token-context-bar';
  const ECHO_BAR_ID = 'agy-yoriichi-msg-echo';
  const STYLE_ID = 'antigravity-kny-token-hud-style';
  const DEFAULT_CONTEXT_WINDOW = 1048576;

  const state = {
    composer: null,
    themeCfg: null,
    themeKeyHint: '',
    barEl: null,
    yoriichiBtnEl: null,
    yoriichiComboIdx: 0,
    ctxBtnEl: null,
    ctxIconWrap: null,
    ctxTextEl: null,
    ctxFillEl: null,
    turnBtnEl: null,
    turnIconEl: null,
    turnTextEl: null,

    // Bright Red Nichirin (赫刀) Blade Gauge Elements & State
    bladeBtnEl: null,
    bladeFillRectEl: null,
    bladeGlowPathEl: null,
    bladeLabelEl: null,
    bladeHeat: 0,
    bladeBonusHeat: 0,
    bladeTier: 'black',

    // Quick Action SVG Buttons (Kagura Bell & Cinema Fox Mask)
    kaguraBtnEl: null,
    cinemaBtnEl: null,

    popoverEl: null,
    popoverOpen: false,

    echoEl: null,
    echoTextEl: null,
    echoAvatarEl: null,
    echoTimer: 0,
    echoShownAt: 0,
    baselineUserMsgCount: 0,

    // Detail rows inside popover
    popSessionTitle: null,
    popSessionIcon: null,
    detCtxVal: null,
    detCtxMeter: null,
    detCacheVal: null,
    detTurnIcon: null,
    detTurnVal: null,
    detBladeVal: null,
    detDraftVal: null,
    detSessionVal: null,
    detModelVal: null,
    detStatusBadge: null,

    // Runtime telemetry & live animation state
    cid: '',
    lastSessionSig: '',
    lastElemKey: '',
    isWorking: false,
    wasWorking: false,
    serverIsWorking: null,
    workStartedAt: 0,
    lastStepSeenAt: 0,
    lastServerStepIdx: -1,

    serverCtxTokens: 0,
    serverCacheTokens: 0,
    serverTurnTokens: 0,
    serverTotalOutTokens: 0,
    serverTurnSteps: 0,
    serverTurnCount: 0,
    serverStepCount: 0,
    serverTurnCtxDelta: 0,
    hasTelemetry: false,

    // Crisis & Bug-Slash state
    crisisState: false,
    lastSlashSeq: -1,
    lastTurnFinishedSeq: -1,

    turnBaselineDomChars: 0,
    stepBaselineDomChars: 0,
    liveDomTurnEst: 0,
    draftTokens: 0,
    modelLabel: '',
    quotaPct: null,

    dispCtxTokens: 0,
    dispTurnTokens: 0,
    targetCtxTokens: 0,
    targetTurnTokens: 0,

    // Streaming SSE & Fallback Polling State
    streamAbort: null,
    streamCid: '',
    streamConnected: false,
    streamReconnectTimer: 0,
    streamFailCount: 0,
    fallbackBackoffMs: 1400,
    nextFallbackAt: 0,

    rafId: 0,
    pollTimer: 0,
    fetchInFlight: false,
    cleanups: []
  };

  /* ==========================================================================
   * SECURITY HELPERS (__AGY_SEC__ INTEGRATION)
   * ========================================================================== */

  function getSecureAssetBase() {
    if (typeof __AGY_SEC__ !== 'undefined' && __AGY_SEC__ && typeof __AGY_SEC__.getAssetBase === 'function') {
      return __AGY_SEC__.getAssetBase() || '';
    }
    return '';
  }

  function getSecureAuthHeaders(extra) {
    if (typeof __AGY_SEC__ !== 'undefined' && __AGY_SEC__ && typeof __AGY_SEC__.authHeaders === 'function') {
      return __AGY_SEC__.authHeaders(extra);
    }
    return Object.assign({}, extra || {});
  }

  function sanitizeCssAssetUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    if (typeof __AGY_SEC__ !== 'undefined' && __AGY_SEC__) {
      const resolved = __AGY_SEC__.resolveAssetUrl(rawUrl) || rawUrl;
      return __AGY_SEC__.sanitizeCssUrl(resolved);
    }
    return '';
  }

  function resolveComposerRoot() {
    if (typeof document === 'undefined') return null;
    return (
      document.querySelector('.surface-composer') ||
      document.querySelector('[data-testid="composer"]') ||
      document.querySelector('form:has(textarea)')
    );
  }

  function resolveYoriichiAvatarUrl(themeCfg) {
    if (themeCfg && typeof themeCfg.userAvatar === 'string' && themeCfg.userAvatar) {
      const cleaned = sanitizeCssAssetUrl(themeCfg.userAvatar);
      if (cleaned) return cleaned;
    }
    return sanitizeCssAssetUrl('assets/yoriichi_avatar.jpg');
  }

  function resolveYoriichiActionUrl(themeCfg) {
    if (themeCfg && typeof themeCfg.userActionSticker === 'string' && themeCfg.userActionSticker) {
      const cleaned = sanitizeCssAssetUrl(themeCfg.userActionSticker);
      if (cleaned) return cleaned;
    }
    return sanitizeCssAssetUrl('assets/yoriichi_action.png');
  }

  function formatCompactTokens(n) {
    const val = Math.max(0, Math.round(Number(n) || 0));
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
    if (val >= 10000) return (val / 1000).toFixed(1) + 'K';
    if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
    return String(val);
  }

  function formatExactInt(n) {
    const val = Math.max(0, Math.round(Number(n) || 0));
    return val.toLocaleString('en-US');
  }

  function getIconsApi() {
    return typeof window !== 'undefined' ? window.__AGY_KNY_ICONS__ : null;
  }

  /* ==========================================================================
   * STYLES (HUD + BRIGHT RED NICHIRIN + SUN SLAYER MARK + CRISIS VEIN)
   * ========================================================================== */

  function ensureStyles() {
    if (typeof document === 'undefined') return;
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    st.textContent = `
      #${HUD_BAR_ID} {
        position: absolute;
        bottom: calc(100% + 5px);
        left: 6px;
        z-index: 59;
        display: inline-flex;
        align-items: center;
        gap: 4.5px;
        pointer-events: auto;
        font-family: 'Segoe UI', Inter, system-ui, -apple-system, sans-serif;
        font-variant-numeric: tabular-nums;
        user-select: none;
      }

      @media (max-width: 960px) {
        #${HUD_BAR_ID} .agy-tok-ctx-prefix,
        #${HUD_BAR_ID} .agy-tok-turn-prefix,
        #${HUD_BAR_ID} .agy-blade-tier-txt {
          display: none;
        }
      }
      @media (max-width: 560px) {
        #${HUD_BAR_ID} {
          bottom: calc(100% + 33px);
          left: 6px;
        }
      }

      .agy-sem-svg {
        display: inline-block;
        vertical-align: middle;
        flex-shrink: 0;
      }

      /* First Swordsman Yoriichi Personal Crest Button */
      .agy-yoriichi-crest-btn {
        position: relative;
        width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 9999px;
        border: 1.5px solid #fde047;
        background-color: #1c0a0a;
        background-size: cover;
        background-position: center;
        cursor: pointer;
        flex-shrink: 0;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.55), 0 0 10px rgba(239, 68, 68, 0.52);
        transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.16s ease, border-color 0.16s ease;
      }
      .agy-yoriichi-crest-btn:hover {
        transform: translateY(-1.5px) scale(1.08);
        border-color: #ffffff;
        box-shadow: 0 5px 14px rgba(0, 0, 0, 0.65), 0 0 16px rgba(250, 204, 21, 0.78);
      }
      .agy-yoriichi-crest-btn[data-surge="1"] {
        transform: scale(1.15);
        box-shadow: 0 0 22px #ef4444, 0 0 32px #fde047;
      }
      .agy-yoriichi-sun-dot {
        position: absolute;
        right: -2px;
        bottom: -2px;
        width: 9px;
        height: 9px;
        border-radius: 9999px;
        background: radial-gradient(circle, #fef08a 0%, #ef4444 75%);
        border: 1px solid #09090b;
        box-shadow: 0 0 6px #f97316;
        pointer-events: none;
      }

      /* Bright Red Blade (赫刀) Awakened -> Primordial Sun Demon Slayer Mark Halo on Yoriichi Avatars */
      html[data-agy-red-blade="1"] .agy-yoriichi-crest-btn,
      html[data-agy-red-blade="1"] .agy-shell [data-testid="user-message"]::after {
        border-color: #fde047 !important;
        box-shadow:
          0 0 14px rgba(239, 68, 68, 0.92),
          0 0 26px rgba(249, 115, 22, 0.68),
          0 0 36px rgba(253, 224, 71, 0.42) !important;
      }
      @media (prefers-reduced-motion: no-preference) {
        html[data-agy-red-blade="1"] .agy-yoriichi-crest-btn {
          animation: agySunSlayerMarkHalo 2.4s ease-in-out infinite;
        }
      }
      @keyframes agySunSlayerMarkHalo {
        0%, 100% {
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.85), 0 0 22px rgba(250, 204, 21, 0.55);
        }
        50% {
          box-shadow: 0 0 20px rgba(239, 68, 68, 1), 0 0 32px rgba(253, 224, 71, 0.85);
        }
      }

      /* Subtle Blood Demon Vein Border on .surface-composer during Crisis (0% text occlusion, 0% shake) */
      .surface-composer[data-agy-crisis="1"] {
        box-shadow:
          0 0 0 1.2px rgba(220, 38, 38, 0.72),
          0 0 18px rgba(185, 28, 28, 0.36) !important;
        transition: box-shadow 0.35s ease;
      }
      @media (prefers-reduced-motion: no-preference) {
        .surface-composer[data-agy-crisis="1"] {
          animation: agyBloodDemonCrisisPulse 2.2s ease-in-out infinite;
        }
      }
      @keyframes agyBloodDemonCrisisPulse {
        0%, 100% {
          box-shadow: 0 0 0 1px rgba(185, 28, 28, 0.52), 0 0 12px rgba(153, 27, 27, 0.24);
        }
        50% {
          box-shadow: 0 0 0 1.5px rgba(239, 68, 68, 0.85), 0 0 22px rgba(220, 38, 38, 0.46);
        }
      }

      .agy-tok-pill {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 4.5px;
        padding: 3.5px 8.5px;
        border-radius: 9999px;
        background: var(--tok-surface, rgba(16, 12, 34, 0.94));
        border: 1px solid var(--tok-border, rgba(192, 132, 252, 0.58));
        color: #f8fafc;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.25;
        white-space: nowrap;
        cursor: pointer;
        overflow: hidden;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.48), 0 0 10px var(--tok-glow, rgba(192, 132, 252, 0.22));
        transition: transform 0.14s ease, border-color 0.16s ease, box-shadow 0.16s ease;
      }
      .agy-tok-pill:hover,
      #${HUD_BAR_ID}[data-open="1"] .agy-tok-pill {
        transform: translateY(-1px);
        border-color: var(--tok-primary, #c084fc);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.58), 0 0 14px var(--tok-glow, rgba(192, 132, 252, 0.42));
      }

      .agy-tok-icon-slot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      /* Subtle bottom context gauge inside Context Pill */
      .agy-tok-ctx-track {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 1.5px;
        height: 2px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.12);
        overflow: hidden;
        pointer-events: none;
      }
      .agy-tok-ctx-fill {
        height: 100%;
        width: 0%;
        border-radius: 9999px;
        background: linear-gradient(90deg, var(--tok-primary, #38bdf8), var(--tok-secondary, #e879f9));
        transition: width 0.25s ease;
      }
      .agy-tok-ctx-fill[data-warn="amber"] {
        background: linear-gradient(90deg, #f59e0b, #fde047);
      }
      .agy-tok-ctx-fill[data-warn="red"] {
        background: linear-gradient(90deg, #ef4444, #fb923c);
      }

      /* Active working / elemental pulse state on Turn Token Pill */
      .agy-tok-turn-pill[data-working="1"] {
        border-color: var(--tok-secondary, #5eead4);
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.13) 0%, var(--tok-surface, rgba(16, 12, 34, 0.96)) 100%);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.52), 0 0 16px var(--tok-glow, rgba(94, 234, 212, 0.52));
      }
      @media (prefers-reduced-motion: no-preference) {
        .agy-tok-turn-pill[data-working="1"] .agy-tok-icon-slot {
          animation: agyElemWorkPulse 1.05s ease-in-out infinite;
        }
        .agy-tok-turn-pill[data-working="1"] .agy-elem-svg[data-elem="wind"],
        .agy-tok-turn-pill[data-working="1"] .agy-elem-svg[data-elem="sun_water"],
        .agy-tok-turn-pill[data-working="1"] .agy-elem-svg[data-elem="stone"] {
          animation: agyElemSpin 1.8s linear infinite;
        }
      }
      @keyframes agyElemWorkPulse {
        0%, 100% { transform: scale(1) translateY(0); filter: drop-shadow(0 0 2px var(--tok-primary, #fde047)); }
        50%      { transform: scale(1.22) translateY(-0.5px); filter: drop-shadow(0 0 7px var(--tok-primary, #fde047)) brightness(1.25); }
      }
      @keyframes agyElemSpin {
        0%   { transform: rotate(0deg) scale(1.06); }
        100% { transform: rotate(360deg) scale(1.06); }
      }

      .agy-tok-num {
        color: #ffffff;
        font-weight: 700;
        letter-spacing: 0.1px;
      }
      .agy-tok-turn-pill[data-working="1"] .agy-tok-num {
        color: var(--tok-primary, #fde047);
      }
      .agy-tok-draft-tag {
        color: rgba(226, 232, 240, 0.82);
        font-size: 10px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      /* ======================================================================
       * BRIGHT RED NICHIRIN BLADE PILL (赫刀 — FORGE PROGRESS KATANA SVG)
       * ====================================================================== */
      .agy-nichirin-pill {
        gap: 4px;
        padding: 3px 7.5px;
      }
      .agy-nichirin-pill[data-tier="ember"] {
        border-color: rgba(249, 115, 22, 0.72);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5), 0 0 12px rgba(249, 115, 22, 0.34);
      }
      .agy-nichirin-pill[data-tier="red"] {
        border-color: rgba(253, 224, 71, 0.88);
        background: linear-gradient(135deg, rgba(48, 8, 12, 0.95) 0%, rgba(22, 9, 18, 0.96) 100%);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 18px rgba(239, 68, 68, 0.65);
      }
      .agy-nichirin-svg {
        display: block;
        flex-shrink: 0;
        overflow: visible;
      }
      .agy-nichirin-pill[data-tier="red"] .agy-nichirin-svg {
        filter: drop-shadow(0 0 5px rgba(239, 68, 68, 0.95));
      }
      .agy-blade-label {
        font-size: 10px;
        font-weight: 800;
        color: #cbd5e1;
        letter-spacing: 0.2px;
      }
      .agy-nichirin-pill[data-tier="ember"] .agy-blade-label {
        color: #fdba74;
      }
      .agy-nichirin-pill[data-tier="red"] .agy-blade-label {
        color: #fde047;
        text-shadow: 0 0 8px rgba(239, 68, 68, 0.9);
      }

      /* ======================================================================
       * QUICK UTILITY ICON BUTTONS (KAGURA BELL & UROKODAKI FOX MASK)
       * ====================================================================== */
      .agy-hud-util-btn {
        width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--tok-surface, rgba(16, 12, 34, 0.94));
        border: 1px solid var(--tok-border, rgba(148, 163, 184, 0.45));
        color: #e2e8f0;
        cursor: pointer;
        flex-shrink: 0;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.46);
        transition: transform 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      }
      .agy-hud-util-btn:hover {
        transform: translateY(-1.5px) scale(1.07);
        border-color: #fde047;
        color: #ffffff;
        box-shadow: 0 5px 14px rgba(0, 0, 0, 0.6), 0 0 12px rgba(250, 204, 21, 0.45);
      }
      .agy-hud-util-btn[data-active="1"] {
        border-color: #fde047;
        color: #fde047;
        background: linear-gradient(135deg, rgba(46, 22, 14, 0.95) 0%, rgba(18, 12, 32, 0.95) 100%);
        box-shadow: 0 0 12px rgba(250, 204, 21, 0.55);
      }
      .agy-hud-util-btn[data-muted="1"] {
        opacity: 0.68;
      }

      /* Detailed Context & Token Breakdown Popover */
      .agy-tok-popover {
        position: absolute;
        bottom: calc(100% + 7px);
        left: 0;
        width: 316px;
        display: none;
        flex-direction: column;
        gap: 7px;
        padding: 10px 12px 11px;
        border-radius: 12px;
        background: var(--tok-surface, rgba(15, 11, 30, 0.97));
        border: 1px solid var(--tok-border, rgba(192, 132, 252, 0.68));
        box-shadow: 0 14px 34px rgba(3, 4, 14, 0.84), 0 0 22px var(--tok-glow, rgba(192, 132, 252, 0.28)), inset 0 1px 0 rgba(255, 255, 255, 0.10);
        color: #f8fafc;
        z-index: 84;
        cursor: default;
      }
      #${HUD_BAR_ID}[data-open="1"] .agy-tok-popover {
        display: flex;
        animation: agyTokPopIn 0.18s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @keyframes agyTokPopIn {
        from { opacity: 0; transform: translateY(5px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .agy-tok-pop-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.11);
      }
      .agy-tok-pop-session {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        flex: 1;
      }
      .agy-tok-pop-title {
        font-size: 11.2px;
        font-weight: 700;
        color: var(--tok-primary, #facc15);
        letter-spacing: 0.15px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agy-tok-status-badge {
        padding: 1.5px 6.5px;
        border-radius: 9999px;
        font-size: 9.8px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.09);
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #e2e8f0;
        flex-shrink: 0;
      }
      .agy-tok-status-badge[data-working="1"] {
        border-color: var(--tok-secondary, #5eead4);
        color: var(--tok-primary, #fde047);
      }

      .agy-tok-meter-bar {
        width: 100%;
        height: 5px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.10);
        overflow: hidden;
      }
      .agy-tok-meter-fill {
        height: 100%;
        width: 0%;
        border-radius: 9999px;
        background: linear-gradient(90deg, var(--tok-primary, #38bdf8), var(--tok-secondary, #e879f9));
        transition: width 0.25s ease;
      }

      .agy-tok-rows {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 11px;
      }
      .agy-tok-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .agy-tok-lbl {
        display: inline-flex;
        align-items: center;
        gap: 5.5px;
        color: rgba(226, 232, 240, 0.82);
      }
      .agy-tok-lbl-ico {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        color: var(--tok-primary, #38bdf8);
      }
      .agy-tok-val {
        color: #ffffff;
        font-weight: 600;
        text-align: right;
      }

      /* Instant Enter Message Echo Banner (First Swordsman Yoriichi Command Display) */
      #${ECHO_BAR_ID} {
        position: absolute;
        bottom: calc(100% + 66px);
        left: 8px;
        right: 120px;
        z-index: 58;
        display: none;
        align-items: flex-start;
        gap: 9px;
        padding: 7px 11px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(28, 10, 14, 0.95) 0%, rgba(15, 11, 28, 0.95) 100%);
        border: 1px solid rgba(250, 204, 21, 0.62);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.62), 0 0 18px rgba(239, 68, 68, 0.34);
        color: #fefce8;
        pointer-events: auto;
        font-family: 'Segoe UI', Inter, system-ui, sans-serif;
      }
      #${ECHO_BAR_ID}[data-visible="1"] {
        display: flex;
        animation: agyYoriichiEchoIn 0.22s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @keyframes agyYoriichiEchoIn {
        from { opacity: 0; transform: translateY(8px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .agy-echo-avatar {
        width: 28px;
        height: 28px;
        border-radius: 9999px;
        background-size: cover;
        background-position: center;
        border: 1.5px solid #fde047;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
        flex-shrink: 0;
        margin-top: 1px;
      }
      .agy-echo-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .agy-echo-hdr {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
        font-weight: 700;
        color: #fde047;
        letter-spacing: 0.2px;
      }
      .agy-echo-text {
        font-size: 12px;
        line-height: 1.38;
        color: #ffffff;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 68px;
        overflow-y: auto;
      }
      .agy-echo-close {
        background: transparent;
        border: none;
        color: rgba(254, 249, 195, 0.72);
        font-size: 13px;
        line-height: 1;
        padding: 2px 4px;
        cursor: pointer;
        border-radius: 5px;
      }
      .agy-echo-close:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.12);
      }
    `;
  }

  /* ==========================================================================
   * BRIGHT RED NICHIRIN (赫刀) FORGE ENGINE & CRISIS-TO-SLASH REFLEX
   * ========================================================================== */

  function createNichirinKatanaSvg() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'agy-nichirin-svg');
    svg.setAttribute('width', '46');
    svg.setAttribute('height', '13');
    svg.setAttribute('viewBox', '0 0 46 13');
    svg.setAttribute('aria-hidden', 'true');

    const uid = 'agy_nichirin_' + Math.random().toString(36).slice(2, 8);
    svg.innerHTML =
      `<defs>` +
      `<clipPath id="${uid}_blade_clip">` +
      `<path d="M12.5 4.3 L39.5 4.0 Q43.8 4.0 45.2 6.5 Q42.8 8.8 38.2 8.8 L12.5 8.6 Z"/>` +
      `</clipPath>` +
      `<linearGradient id="${uid}_ember_grad" x1="12" y1="6" x2="45" y2="6" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0%" stop-color="#dc2626"/>` +
      `<stop offset="60%" stop-color="#f97316"/>` +
      `<stop offset="100%" stop-color="#fde047"/>` +
      `</linearGradient>` +
      `</defs>` +
      // Tsuka hilt wrap
      `<rect x="1.2" y="4.8" width="9.4" height="3.4" rx="1.2" fill="#1e1b4b" stroke="#facc15" stroke-width="0.8"/>` +
      `<path d="M3.5 4.9l1.4 3.2M6.2 4.9l1.4 3.2M8.9 4.9l1.1 3.2" stroke="#ef4444" stroke-width="0.85"/>` +
      // Yoriichi Golden Tsuba guard
      `<rect x="10.6" y="2.2" width="2.2" height="8.6" rx="1" fill="#facc15" stroke="#ca8a04" stroke-width="0.6"/>` +
      // Base Black-Steel Nichirin Blade
      `<path d="M12.5 4.3 L39.5 4.0 Q43.8 4.0 45.2 6.5 Q42.8 8.8 38.2 8.8 L12.5 8.6 Z" fill="#1e293b" stroke="#94a3b8" stroke-width="0.85"/>` +
      // Progressive Forge Heat Overlay inside Blade Clip
      `<g clip-path="url(#${uid}_blade_clip)">` +
      `<rect class="agy-nichirin-heat-rect" x="12.5" y="3.2" width="0" height="6.4" fill="url(#${uid}_ember_grad)"/>` +
      `<path d="M13 6.7 Q18 5.4 23 6.8 T33 6.6 T43 6.2" stroke="rgba(255,255,255,0.65)" stroke-width="0.7" fill="none"/>` +
      `</g>` +
      // Outer Blade Edge Highlight
      `<path class="agy-nichirin-edge-stroke" d="M12.5 4.3 L39.5 4.0 Q43.8 4.0 45.2 6.5 Q42.8 8.8 38.2 8.8 L12.5 8.6 Z" fill="none" stroke="rgba(226,232,240,0.65)" stroke-width="0.75"/>`;

    const fillRect = svg.querySelector('.agy-nichirin-heat-rect');
    const edgePath = svg.querySelector('.agy-nichirin-edge-stroke');
    return { svg, fillRect, edgePath };
  }

  function computeAndApplyBladeHeat() {
    const turns = Math.max(0, state.serverTurnCount);
    const steps = Math.max(0, state.serverStepCount || state.serverTurnSteps);
    const tokFactor = Math.min(45, Math.floor((state.serverTotalOutTokens || 0) / 850));
    const organicHeat = Math.min(84, Math.round(turns * 11 + steps * 2.4 + tokFactor * 0.6));
    const totalHeat = Math.max(0, Math.min(100, organicHeat + state.bladeBonusHeat));

    state.bladeHeat = totalHeat;

    let tier = 'black';
    if (totalHeat >= 75) tier = 'red';
    else if (totalHeat >= 35) tier = 'ember';
    state.bladeTier = tier;

    if (typeof document !== 'undefined' && document.documentElement) {
      if (tier === 'red') {
        document.documentElement.dataset.agyRedBlade = '1';
      } else {
        delete document.documentElement.dataset.agyRedBlade;
      }
    }

    if (state.bladeBtnEl) {
      state.bladeBtnEl.dataset.tier = tier;
      const tierNameVi = tier === 'red'
        ? 'Hách Đao Khai Mở (赫刀)'
        : tier === 'ember'
        ? 'Nhiệt Hồng Đao'
        : 'Hắc Thiết Nhật Luân Đao';
      state.bladeBtnEl.title = `Rèn Nhật Luân Kiếm: ${tierNameVi} • ${totalHeat}% nhiệt độ`;
    }

    if (state.bladeFillRectEl) {
      const w = (33.0 * (totalHeat / 100)).toFixed(1);
      state.bladeFillRectEl.setAttribute('width', w);
    }

    if (state.bladeGlowPathEl) {
      if (tier === 'red') {
        state.bladeGlowPathEl.setAttribute('stroke', '#fde047');
      } else if (tier === 'ember') {
        state.bladeGlowPathEl.setAttribute('stroke', '#fb923c');
      } else {
        state.bladeGlowPathEl.setAttribute('stroke', 'rgba(226,232,240,0.65)');
      }
    }

    if (state.bladeLabelEl) {
      state.bladeLabelEl.textContent = '';
      if (tier === 'red') {
        const kj = document.createElement('span');
        kj.textContent = '赫刀 ';
        const pct = document.createElement('span');
        pct.className = 'agy-blade-tier-txt';
        pct.textContent = `${totalHeat}%`;
        state.bladeLabelEl.appendChild(kj);
        state.bladeLabelEl.appendChild(pct);
      } else {
        state.bladeLabelEl.textContent = `${totalHeat}%`;
      }
    }

    if (state.detBladeVal) {
      const desc = tier === 'red'
        ? `赫刀 Hách Đao (${totalHeat}%)`
        : tier === 'ember'
        ? `Nhiệt Hồng Đao (${totalHeat}%)`
        : `Hắc Thiết Đao (${totalHeat}%)`;
      state.detBladeVal.textContent = desc;
    }
  }

  function applyCrisisVisual(isCrisis) {
    state.crisisState = Boolean(isCrisis);
    const comp = state.composer || resolveComposerRoot();
    if (!comp || !comp.dataset) return;
    if (state.crisisState) {
      comp.dataset.agyCrisis = '1';
    } else {
      delete comp.dataset.agyCrisis;
    }
  }

  function executeDemonSlayCelebration(slashSeq, slashReason) {
    // 1. Immediately clear crisis blood demon border
    applyCrisisVisual(false);

    // 2. Grant +25% Bright Red Blade forge heat bonus
    state.bladeBonusHeat = Math.min(100, state.bladeBonusHeat + 25);
    computeAndApplyBladeHeat();

    // 3. Auto-trigger Ultimate Finisher Slash (12s cooldown guarded)
    if (typeof window !== 'undefined' && typeof window.__AGY_TRIGGER_FINISHER__ === 'function') {
      try {
        window.__AGY_TRIGGER_FINISHER__({
          reason: slashReason || 'bug_slashed',
          originEl: state.yoriichiBtnEl || null
        });
      } catch (_) {}
    }

    // 4. Stamp crimson 「滅」 (ÁC QUỶ DIỆT SÁT) seal + Kasugai Crow victory flyby
    if (
      typeof window !== 'undefined' &&
      window.__AGY_SQUAD_RAID__ &&
      typeof window.__AGY_SQUAD_RAID__.triggerVictoryStamp === 'function'
    ) {
      try {
        window.__AGY_SQUAD_RAID__.triggerVictoryStamp({
          slashSeq,
          reason: slashReason
        });
      } catch (_) {}
    }

    // 5. Trigger crisp katana sheathe "Kachin!" via Bio-Audio if exposed directly
    if (typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__) {
      const bio = window.__AGY_BIO_AUDIO__;
      try {
        if (typeof bio.playSheathe === 'function') bio.playSheathe();
        else if (typeof bio.playKachin === 'function') bio.playKachin();
      } catch (_) {}
    }
  }

  function refreshUtilityButtonStates() {
    if (state.kaguraBtnEl && typeof window !== 'undefined') {
      const bio = window.__AGY_BIO_AUDIO__;
      let active = false;
      if (bio) {
        if (typeof bio.isEnabled === 'function') active = Boolean(bio.isEnabled());
        else if (typeof bio.isActive === 'function') active = Boolean(bio.isActive());
        else if (typeof bio.enabled === 'boolean') active = bio.enabled;
      }
      if (active) {
        state.kaguraBtnEl.dataset.active = '1';
        delete state.kaguraBtnEl.dataset.muted;
      } else {
        delete state.kaguraBtnEl.dataset.active;
      }
    }

    if (state.cinemaBtnEl && typeof document !== 'undefined') {
      const dir = typeof window !== 'undefined' ? window.__AGY_CINEMA_DIRECTOR__ : null;
      const shieldOn =
        (document.documentElement && document.documentElement.dataset.agyPrivacyShield === '1') ||
        Boolean(dir && typeof dir.isPrivacyActive === 'function' && dir.isPrivacyActive());
      if (shieldOn) state.cinemaBtnEl.dataset.active = '1';
      else delete state.cinemaBtnEl.dataset.active;
    }
  }

  /* ==========================================================================
   * STREAMING SSE (/__events) + RESILIENT FALLBACK POLLING (/__telemetry)
   * ========================================================================== */

  function ingestTelemetrySnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    if (snap.cid && state.cid && snap.cid !== state.cid) return;

    const firstSync = !state.hasTelemetry;
    state.hasTelemetry = true;

    const ctxTok = Number(snap.inputTokens ?? snap.contextTokens) || 0;
    const cacheTok = Number(snap.cacheReadTokens ?? snap.cacheTokens) || 0;
    const turnTok = Number(snap.turnTokens ?? snap.turnOutputTokens) || 0;
    const outTok = Number(snap.outputTokens ?? snap.totalOutputTokens) || 0;
    const stepCnt = Number(snap.stepCount ?? snap.turnSteps) || 0;
    const turnCnt = Number(snap.turnCount) || 0;

    state.serverCtxTokens = ctxTok;
    state.serverCacheTokens = cacheTok;
    state.serverTurnTokens = turnTok;
    state.serverTotalOutTokens = outTok;
    state.serverTurnSteps = Number(snap.turnSteps ?? stepCnt) || 0;
    state.serverStepCount = stepCnt;
    state.serverTurnCount = turnCnt;
    state.serverTurnCtxDelta = Number(snap.turnContextDelta) || 0;

    if (typeof snap.isWorking === 'boolean') {
      state.serverIsWorking = snap.isWorking;
    }

    if (firstSync) {
      state.dispCtxTokens = state.serverCtxTokens;
      state.dispTurnTokens = state.serverTurnTokens;
      state.stepBaselineDomChars = measureConversationDomChars();
    }

    const stepMarker = typeof snap.latestStepIndex === 'number' ? snap.latestStepIndex : stepCnt;
    if (stepMarker !== state.lastServerStepIdx) {
      state.lastServerStepIdx = stepMarker;
      state.lastStepSeenAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      state.stepBaselineDomChars = measureConversationDomChars();
    }

    // Crisis & Bug-Slash Detection
    if (typeof snap.crisisState === 'boolean') {
      applyCrisisVisual(snap.crisisState);
    }

    const incomingSlashSeq = typeof snap.slashSeq === 'number' ? snap.slashSeq : 0;
    if (firstSync && !snap.justSlashedBug) {
      state.lastSlashSeq = incomingSlashSeq;
    } else if (
      (snap.justSlashedBug === true && incomingSlashSeq !== state.lastSlashSeq) ||
      (state.lastSlashSeq >= 0 && incomingSlashSeq > state.lastSlashSeq)
    ) {
      state.lastSlashSeq = incomingSlashSeq;
      executeDemonSlayCelebration(incomingSlashSeq, snap.slashReason || '');
    } else if (state.lastSlashSeq < 0) {
      state.lastSlashSeq = incomingSlashSeq;
    }

    if (typeof snap.turnFinishedSeq === 'number') {
      state.lastTurnFinishedSeq = snap.turnFinishedSeq;
    }

    computeAndApplyBladeHeat();

    // Forward live snapshot to Hashira Squad Raid & Bio-Acoustic Kagura Audio
    if (typeof window !== 'undefined') {
      if (window.__AGY_SQUAD_RAID__ && typeof window.__AGY_SQUAD_RAID__.sync === 'function') {
        try {
          window.__AGY_SQUAD_RAID__.sync(snap);
        } catch (_) {}
      }
      if (window.__AGY_BIO_AUDIO__ && typeof window.__AGY_BIO_AUDIO__.onTelemetry === 'function') {
        try {
          window.__AGY_BIO_AUDIO__.onTelemetry(snap);
        } catch (_) {}
      }
    }

    refreshUtilityButtonStates();

    if (typeof document !== 'undefined' && document.hidden) {
      state.dispCtxTokens = state.serverCtxTokens;
      state.dispTurnTokens = state.serverTurnTokens;
      renderDomValues();
    } else {
      ensureOdometerRunning();
    }
  }

  function abortActiveStream() {
    clearTimeout(state.streamReconnectTimer);
    state.streamReconnectTimer = 0;
    state.streamConnected = false;
    state.streamCid = '';
    if (state.streamAbort) {
      try {
        state.streamAbort.abort();
      } catch (_) {}
      state.streamAbort = null;
    }
  }

  function scheduleStreamReconnect(cid) {
    clearTimeout(state.streamReconnectTimer);
    if (!cid || cid !== state.cid || !state.barEl) return;
    const delay = Math.min(15000, 2200 * Math.pow(1.6, Math.min(4, state.streamFailCount)));
    state.streamReconnectTimer = setTimeout(() => {
      state.streamReconnectTimer = 0;
      if (state.cid === cid && state.barEl) {
        connectTelemetryStream(cid);
      }
    }, Math.round(delay));
  }

  async function connectTelemetryStream(cid) {
    if (!cid) return;
    if (state.streamAbort && state.streamCid === cid) return;

    abortActiveStream();

    const base = getSecureAssetBase();
    if (!base || !/^https?:\/\/127\.0\.0\.1:\d+/.test(base)) return;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (!controller) return;

    state.streamAbort = controller;
    state.streamCid = cid;

    const url = base.replace(/\/?$/, '/') + `__events?cid=${encodeURIComponent(cid)}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: getSecureAuthHeaders({ Accept: 'text/event-stream' }),
        signal: controller.signal,
        cache: 'no-store'
      });

      if (!res.ok || !res.body || typeof res.body.getReader !== 'function') {
        state.streamFailCount++;
        state.streamConnected = false;
        state.streamAbort = null;
        fetchDaemonTelemetry(cid);
        scheduleStreamReconnect(cid);
        return;
      }

      state.streamConnected = true;
      state.streamFailCount = 0;
      state.fallbackBackoffMs = 1400;

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        if (buffer.indexOf('\r\n') !== -1) {
          buffer = buffer.replace(/\r\n/g, '\n');
        }

        let sepIdx = buffer.indexOf('\n\n');
        while (sepIdx !== -1) {
          const rawBlock = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          sepIdx = buffer.indexOf('\n\n');

          const lines = rawBlock.split('\n');
          const dataParts = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('data:')) {
              dataParts.push(line.slice(5).trim());
            }
          }
          if (dataParts.length > 0) {
            const payloadStr = dataParts.join('\n');
            if (payloadStr && payloadStr !== '[DONE]') {
              try {
                const snap = JSON.parse(payloadStr);
                ingestTelemetrySnapshot(snap);
              } catch (_) {}
            }
          }
        }

        // Guard against unbounded buffer if server sends malformed stream without \n\n
        if (buffer.length > 262144) {
          buffer = '';
        }
      }
    } catch (_) {
      // Aborted on cid switch / teardown, or transient socket close
    } finally {
      if (state.streamAbort === controller) {
        state.streamAbort = null;
        state.streamConnected = false;
        if (!controller.signal.aborted && state.cid === cid && state.barEl) {
          state.streamFailCount++;
          scheduleStreamReconnect(cid);
        }
      }
    }
  }

  async function fetchDaemonTelemetry(cid) {
    if (!cid || state.fetchInFlight) return;
    const base = getSecureAssetBase();
    if (!base || !/^https?:\/\/127\.0\.0\.1:\d+/.test(base)) return;

    state.fetchInFlight = true;
    try {
      const url = base.replace(/\/?$/, '/') + `__telemetry?cid=${encodeURIComponent(cid)}&_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: getSecureAuthHeaders(),
        cache: 'no-store'
      });
      if (!res.ok) {
        state.fallbackBackoffMs = Math.min(9000, Math.round(state.fallbackBackoffMs * 1.7));
        return;
      }
      const data = await res.json();
      if (!data || data.ok === false || (data.cid && data.cid !== state.cid)) return;

      state.fallbackBackoffMs = 1400;
      ingestTelemetrySnapshot(data);
    } catch (_) {
      state.fallbackBackoffMs = Math.min(9000, Math.round(state.fallbackBackoffMs * 1.7));
    } finally {
      state.fetchInFlight = false;
      state.nextFallbackAt = Date.now() + state.fallbackBackoffMs;
    }
  }

  /* ==========================================================================
   * LIVE DOM SIGNALS, SESSION ICONS & ODOMETER RENDERING
   * ========================================================================== */

  function extractLivePageSignals(composerEl) {
    let cid = '';
    let isWorking = false;
    let modelLabel = '';
    let quotaPct = null;

    if (typeof window !== 'undefined' && window.location && window.location.pathname) {
      const m = window.location.pathname.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) cid = m[1].toLowerCase();
    }

    const comp = composerEl || state.composer;
    if (comp) {
      try {
        const fk = Object.keys(comp).find((k) => k.startsWith('__reactFiber$'));
        if (fk) {
          let cur = comp[fk];
          let depth = 0;
          while (cur && depth < 14) {
            const p = cur.memoizedProps;
            if (p && typeof p === 'object') {
              if (typeof p.isRunning === 'boolean' && p.isRunning) {
                isWorking = true;
              }
              if (!cid && typeof p.conversationId === 'string' && /^[0-9a-f-]{36}$/i.test(p.conversationId)) {
                cid = p.conversationId.toLowerCase();
              }
              if (!modelLabel && p.currentModelConfig && typeof p.currentModelConfig === 'object') {
                if (typeof p.currentModelConfig.label === 'string') {
                  modelLabel = p.currentModelConfig.label;
                }
                const qi = p.currentModelConfig.quotaInfo;
                if (qi && typeof qi.remainingFraction === 'number') {
                  quotaPct = Math.round(Math.max(0, Math.min(1, qi.remainingFraction)) * 100);
                }
              }
            }
            cur = cur.return;
            depth++;
          }
        }
      } catch (_) {}
    }

    if (!isWorking && typeof document !== 'undefined') {
      const cancelBtn = document.querySelector('[data-testid="input-cancel-button"], button[aria-label="Stop execution"]');
      if (cancelBtn && cancelBtn.offsetParent !== null) {
        isWorking = true;
      }
    }

    let draftText = '';
    if (comp) {
      const editor = comp.querySelector('textarea, [contenteditable="true"]');
      if (editor) {
        draftText = (typeof editor.value === 'string' ? editor.value : (editor.textContent || '')).trim();
      }
    }
    const draftTokens = draftText.length > 0 ? Math.max(1, Math.round(draftText.length / 3.6)) : 0;

    return { cid, isWorking, modelLabel, quotaPct, draftTokens, draftText };
  }

  function measureConversationDomChars() {
    if (typeof document === 'undefined') return 0;
    const comp = state.composer || resolveComposerRoot();
    if (comp) {
      let col = comp.parentElement;
      while (col && col.parentElement && col.clientHeight < 260) {
        col = col.parentElement;
      }
      if (col) return (col.textContent || '').length;
    }
    const main = document.querySelector('[data-main-content-body="true"]');
    return main ? (main.textContent || '').length : 0;
  }

  function refreshSessionAndElementIcons() {
    const ic = getIconsApi();
    if (!ic || !state.barEl) return;

    const docTitle = typeof document !== 'undefined' ? (document.title || '') : '';
    const sessionSig = `${docTitle}|${state.cid}`;
    if (sessionSig !== state.lastSessionSig) {
      state.lastSessionSig = sessionSig;
      const sesSmall = ic.buildSessionAvatar(docTitle, state.cid, 15);
      const sesLarge = ic.buildSessionAvatar(docTitle, state.cid, 18);
      if (state.ctxIconWrap) state.ctxIconWrap.innerHTML = sesSmall.svg;
      if (state.ctxBtnEl) {
        state.ctxBtnEl.title = `Phiên làm việc: ${sesSmall.info.displayLabel} — Nhấn xem chi tiết Ngữ cảnh & Nhật Luân Đao`;
      }
      if (state.popSessionIcon) state.popSessionIcon.innerHTML = sesLarge.svg;
      if (state.popSessionTitle) {
        state.popSessionTitle.textContent = sesSmall.info.displayLabel;
        state.popSessionTitle.title = sesSmall.info.displayLabel;
      }
    }

    const elemHint =
      (state.themeCfg && (state.themeCfg.fxMode || state.themeCfg.concept)) ||
      state.themeKeyHint ||
      'yoriichi';
    const elemKey = ic.normalizeElementKey(elemHint);
    if (elemKey !== state.lastElemKey) {
      state.lastElemKey = elemKey;
      const elemSvg = ic.getElementalSvg(elemHint, 14);
      if (state.turnIconEl) state.turnIconEl.innerHTML = elemSvg;
      if (state.detTurnIcon) state.detTurnIcon.innerHTML = ic.getElementalSvg(elemHint, 13);
    }
  }

  function switchActiveConversation(nextCid) {
    if (!nextCid || nextCid === state.cid) return;
    abortActiveStream();
    state.cid = nextCid;
    state.hasTelemetry = false;
    state.serverIsWorking = null;
    state.serverCtxTokens = 0;
    state.serverTurnTokens = 0;
    state.serverTotalOutTokens = 0;
    state.serverTurnCount = 0;
    state.serverStepCount = 0;
    state.dispCtxTokens = 0;
    state.dispTurnTokens = 0;
    state.lastServerStepIdx = -1;
    state.lastSlashSeq = -1;
    state.bladeBonusHeat = 0;
    applyCrisisVisual(false);
    computeAndApplyBladeHeat();

    connectTelemetryStream(nextCid);
    fetchDaemonTelemetry(nextCid);
  }

  function recomputeTargets(nowMs) {
    const sig = extractLivePageSignals(state.composer);

    if (sig.cid && sig.cid !== state.cid) {
      switchActiveConversation(sig.cid);
    }

    refreshSessionAndElementIcons();

    state.isWorking = Boolean(sig.isWorking || state.serverIsWorking);
    state.draftTokens = sig.draftTokens;
    if (sig.modelLabel) state.modelLabel = sig.modelLabel;
    if (sig.quotaPct !== null) state.quotaPct = sig.quotaPct;

    // Auto-dismiss command echo banner once Antigravity renders the new user bubble
    if (state.echoEl && state.echoEl.dataset.visible === '1' && typeof document !== 'undefined') {
      const curMsgCount = document.querySelectorAll('[data-testid="user-message"], .agy-user-bubble-frame').length;
      if (curMsgCount > state.baselineUserMsgCount && (nowMs - (state.echoShownAt || 0)) > 1800) {
        hideUserMessageEcho();
      }
    }

    const domChars = measureConversationDomChars();

    if (state.isWorking && !state.wasWorking) {
      state.workStartedAt = nowMs;
      state.lastStepSeenAt = nowMs;
      state.turnBaselineDomChars = domChars;
      state.stepBaselineDomChars = domChars;
      state.dispTurnTokens = 0;
      if (state.cid && !state.streamConnected) fetchDaemonTelemetry(state.cid);
    } else if (!state.isWorking && state.wasWorking) {
      if (state.cid && !state.streamConnected) fetchDaemonTelemetry(state.cid);
    }
    state.wasWorking = state.isWorking;

    if (state.hasTelemetry) {
      let liveTurn = state.serverTurnTokens;
      let liveCtx = state.serverCtxTokens;

      if (state.isWorking) {
        const rawCharDiff = domChars - state.stepBaselineDomChars;
        const safeCharDiff = (rawCharDiff > 0 && rawCharDiff < 24000) ? rawCharDiff : 0;
        if (rawCharDiff < -200 || rawCharDiff >= 24000) {
          state.stepBaselineDomChars = domChars;
        }
        const stepDomDelta = Math.round(safeCharDiff / 3.7);
        const sinceStepSec = Math.max(0, (nowMs - (state.lastStepSeenAt || state.workStartedAt || nowMs)) / 1000);
        const thinkingPulse = Math.round(Math.min(380, sinceStepSec * 19));
        const inFlightExtra = Math.max(stepDomDelta, thinkingPulse);

        liveTurn = state.serverTurnTokens + inFlightExtra;
        liveCtx = state.serverCtxTokens + inFlightExtra;
      }

      state.targetTurnTokens = liveTurn;
      state.targetCtxTokens = liveCtx;
    } else {
      const estCtx = Math.max(240, Math.round(domChars / 3.7));
      state.targetCtxTokens = estCtx + state.draftTokens;
      if (state.isWorking) {
        const elapsedSec = Math.max(0, (nowMs - (state.workStartedAt || nowMs)) / 1000);
        const rawDiff = Math.max(0, Math.min(24000, domChars - state.turnBaselineDomChars));
        state.targetTurnTokens = Math.max(Math.round(rawDiff / 3.6), Math.round(elapsedSec * 22));
        state.liveDomTurnEst = state.targetTurnTokens;
      } else {
        state.targetTurnTokens = state.liveDomTurnEst;
      }
    }

    if (state.dispCtxTokens === 0 && state.targetCtxTokens > 500) {
      state.dispCtxTokens = state.targetCtxTokens;
    }
    if (!state.isWorking && state.dispTurnTokens === 0 && state.targetTurnTokens > 0) {
      state.dispTurnTokens = state.targetTurnTokens;
    }
  }

  function renderDomValues() {
    if (!state.barEl) return;

    const ctxRounded = Math.max(0, Math.round(state.dispCtxTokens));
    const turnRounded = Math.max(0, Math.round(state.dispTurnTokens));
    const ctxRatio = Math.max(0, Math.min(1, ctxRounded / DEFAULT_CONTEXT_WINDOW));
    const ctxPctStr = (ctxRatio * 100).toFixed(1) + '%';

    if (state.ctxTextEl) {
      state.ctxTextEl.innerHTML =
        `<span class="agy-tok-ctx-prefix">Ngữ cảnh: </span><span class="agy-tok-num">${formatCompactTokens(ctxRounded)}</span>`;
    }
    if (state.ctxFillEl) {
      state.ctxFillEl.style.width = `${Math.max(3, Math.round(ctxRatio * 100))}%`;
      if (ctxRatio >= 0.85) state.ctxFillEl.dataset.warn = 'red';
      else if (ctxRatio >= 0.60) state.ctxFillEl.dataset.warn = 'amber';
      else delete state.ctxFillEl.dataset.warn;
    }

    if (state.turnBtnEl) {
      if (state.isWorking) state.turnBtnEl.dataset.working = '1';
      else delete state.turnBtnEl.dataset.working;
    }

    const ic = getIconsApi();
    const brushSvg = ic ? ic.getFuncSvg('draft_brush', 10) : '';

    if (state.turnTextEl) {
      const draftSuffix = (!state.isWorking && state.draftTokens > 0)
        ? ` <span class="agy-tok-draft-tag">• ${brushSvg}+${formatCompactTokens(state.draftTokens)}</span>`
        : '';
      if (state.isWorking) {
        state.turnTextEl.innerHTML =
          `<span class="agy-tok-turn-prefix">Lượt: </span><span class="agy-tok-num">+${formatExactInt(turnRounded)}</span> tok`;
      } else {
        state.turnTextEl.innerHTML =
          `<span class="agy-tok-turn-prefix">Lượt: </span><span class="agy-tok-num">+${formatCompactTokens(turnRounded)}</span> tok${draftSuffix}`;
      }
    }

    if (state.popoverOpen) {
      if (state.detStatusBadge) {
        const modeTxt = state.streamConnected ? 'SSE <30ms' : 'Trực tuyến';
        state.detStatusBadge.textContent = state.isWorking ? `Đang rèn (${modeTxt})` : `Sẵn sàng (${modeTxt})`;
        if (state.isWorking) state.detStatusBadge.dataset.working = '1';
        else delete state.detStatusBadge.dataset.working;
      }
      if (state.detCtxVal) {
        state.detCtxVal.textContent = `${formatExactInt(ctxRounded)} / 1.05M (${ctxPctStr})`;
      }
      if (state.detCtxMeter) {
        state.detCtxMeter.style.width = `${Math.max(2, Math.round(ctxRatio * 100))}%`;
      }
      if (state.detCacheVal) {
        const cachePct = ctxRounded > 0 ? Math.min(100, Math.round((state.serverCacheTokens / ctxRounded) * 100)) : 0;
        state.detCacheVal.textContent = state.serverCacheTokens > 0
          ? `${formatCompactTokens(state.serverCacheTokens)} (${cachePct}% cache)`
          : '—';
      }
      if (state.detTurnVal) {
        const stepsTxt = state.serverTurnSteps > 0 ? ` • ${state.serverTurnSteps} bước` : '';
        state.detTurnVal.textContent = `+${formatExactInt(turnRounded)} tok${stepsTxt}`;
      }
      computeAndApplyBladeHeat();
      if (state.detDraftVal) {
        state.detDraftVal.textContent = state.draftTokens > 0 ? `+${formatExactInt(state.draftTokens)} tok` : '0 tok';
      }
      if (state.detSessionVal) {
        const tot = Math.max(turnRounded, state.serverTotalOutTokens);
        state.detSessionVal.textContent = `${formatExactInt(tot)} tok`;
      }
      if (state.detModelVal) {
        const qTxt = state.quotaPct !== null ? ` (${state.quotaPct}% hạn mức)` : '';
        state.detModelVal.textContent = (state.modelLabel || 'Antigravity Agent') + qTxt;
      }
    }
  }

  function odometerTick(now) {
    if (!state.barEl || !state.barEl.isConnected) {
      state.rafId = 0;
      return;
    }
    const nowMs = typeof now === 'number' ? now : Date.now();
    recomputeTargets(nowMs);

    const lerpRate = state.isWorking ? 0.18 : 0.28;
    const dCtx = state.targetCtxTokens - state.dispCtxTokens;
    const dTurn = state.targetTurnTokens - state.dispTurnTokens;

    if (Math.abs(dCtx) > 0.6) {
      state.dispCtxTokens += dCtx * lerpRate;
    } else {
      state.dispCtxTokens = state.targetCtxTokens;
    }

    if (Math.abs(dTurn) > 0.6) {
      if (state.isWorking && dTurn < 0 && state.targetTurnTokens > 0) {
        // Hold smooth monotonic advance while step is computing
      } else {
        state.dispTurnTokens += dTurn * lerpRate;
      }
    } else {
      state.dispTurnTokens = state.targetTurnTokens;
    }

    renderDomValues();

    const settled =
      !state.isWorking &&
      Math.abs(state.targetCtxTokens - state.dispCtxTokens) < 0.6 &&
      Math.abs(state.targetTurnTokens - state.dispTurnTokens) < 0.6;

    if (settled) {
      state.rafId = 0;
      return;
    }
    state.rafId = requestAnimationFrame(odometerTick);
  }

  function ensureOdometerRunning() {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!state.rafId) {
      state.rafId = requestAnimationFrame(odometerTick);
    }
  }

  function setPopoverOpen(open) {
    state.popoverOpen = Boolean(open);
    if (!state.barEl) return;
    if (state.popoverOpen) {
      state.barEl.dataset.open = '1';
      renderDomValues();
    } else {
      delete state.barEl.dataset.open;
    }
  }

  /* ==========================================================================
   * FIRST SWORDSMAN YORIICHI: SKILL UNLEASH & INSTANT ENTER MESSAGE ECHO
   * ========================================================================== */

  function castYoriichiSunBreathing(originEl) {
    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    if (!ext || typeof ext.castSkill !== 'function') return;

    const idx = state.yoriichiComboIdx % 4;
    state.yoriichiComboIdx = (idx + 1) % 4;

    let originRect = null;
    if (originEl && typeof originEl.getBoundingClientRect === 'function') {
      originRect = originEl.getBoundingClientRect();
    }

    if (state.yoriichiBtnEl) {
      state.yoriichiBtnEl.dataset.surge = '1';
      setTimeout(() => {
        if (state.yoriichiBtnEl) delete state.yoriichiBtnEl.dataset.surge;
      }, 360);
    }

    ext.castSkill('yoriichi', idx, {
      charId: 'yoriichi',
      originRect,
      actionSticker: resolveYoriichiActionUrl(state.themeCfg),
      composerEl: null
    });
  }

  function showUserMessageEcho(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || !state.echoEl || !state.echoTextEl) return;

    state.baselineUserMsgCount = typeof document !== 'undefined'
      ? document.querySelectorAll('[data-testid="user-message"], .agy-user-bubble-frame').length
      : 0;
    state.echoShownAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    state.echoTextEl.textContent = trimmed;
    state.echoEl.dataset.visible = '1';

    if (state.yoriichiBtnEl) {
      state.yoriichiBtnEl.dataset.surge = '1';
      setTimeout(() => {
        if (state.yoriichiBtnEl) delete state.yoriichiBtnEl.dataset.surge;
      }, 420);
    }

    clearTimeout(state.echoTimer);
    const holdMs = state.isWorking ? 14000 : 5500;
    state.echoTimer = setTimeout(() => {
      hideUserMessageEcho();
    }, holdMs);
  }

  function hideUserMessageEcho() {
    clearTimeout(state.echoTimer);
    state.echoTimer = 0;
    if (state.echoEl) {
      delete state.echoEl.dataset.visible;
    }
  }

  function applyThemeColors(bar, themeCfg, themeName) {
    const cfg = themeCfg && typeof themeCfg === 'object' ? themeCfg : {};
    state.themeCfg = cfg;
    if (themeName) state.themeKeyHint = themeName;
    bar.style.setProperty('--tok-primary', cfg.primary || '#38bdf8');
    bar.style.setProperty('--tok-secondary', cfg.secondary || '#e879f9');
    bar.style.setProperty('--tok-border', cfg.borderColor || 'rgba(148, 163, 184, 0.45)');
    bar.style.setProperty('--tok-glow', cfg.glow || 'rgba(56, 189, 248, 0.28)');
    bar.style.setProperty('--tok-surface', cfg.modalBg || 'rgba(15, 11, 30, 0.95)');

    const safeYoriAv = resolveYoriichiAvatarUrl(cfg);
    if (state.yoriichiBtnEl) {
      state.yoriichiBtnEl.style.backgroundImage = safeYoriAv ? `url("${safeYoriAv}")` : 'none';
    }
    if (state.echoAvatarEl) {
      state.echoAvatarEl.style.backgroundImage = safeYoriAv ? `url("${safeYoriAv}")` : 'none';
    }

    const safeYoriAction = resolveYoriichiActionUrl(cfg);
    if (
      safeYoriAction &&
      typeof window !== 'undefined' &&
      window.__AGY_KNY_SKILLS__ &&
      typeof window.__AGY_KNY_SKILLS__.preloadActionSprite === 'function'
    ) {
      try {
        window.__AGY_KNY_SKILLS__.preloadActionSprite('yoriichi', safeYoriAction);
      } catch (_) {}
    }

    refreshSessionAndElementIcons();
    refreshUtilityButtonStates();
  }

  function createIconRow(iconSvgHtml, label) {
    const row = document.createElement('div');
    row.className = 'agy-tok-row';
    const l = document.createElement('span');
    l.className = 'agy-tok-lbl';
    const ico = document.createElement('span');
    ico.className = 'agy-tok-lbl-ico';
    ico.innerHTML = iconSvgHtml || '';
    const txt = document.createElement('span');
    txt.textContent = label;
    l.appendChild(ico);
    l.appendChild(txt);
    const v = document.createElement('span');
    v.className = 'agy-tok-val';
    v.textContent = '0';
    row.appendChild(l);
    row.appendChild(v);
    return { row, icoEl: ico, valEl: v };
  }

  function mountTokenHud(composerEl, themeCfg, themeName) {
    if (typeof document === 'undefined') return null;
    const composer = composerEl || resolveComposerRoot();
    if (!composer) return null;

    ensureStyles();

    const existing = document.getElementById(HUD_BAR_ID);
    if (existing && existing.parentElement === composer && state.barEl === existing) {
      applyThemeColors(existing, themeCfg, themeName);
      if (typeof window !== 'undefined' && window.__AGY_SQUAD_RAID__ && typeof window.__AGY_SQUAD_RAID__.mount === 'function') {
        try { window.__AGY_SQUAD_RAID__.mount(composer); } catch (_) {}
      }
      ensureOdometerRunning();
      return existing;
    }

    teardown();

    state.composer = composer;
    const ic = getIconsApi();

    const bar = document.createElement('div');
    bar.id = HUD_BAR_ID;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Khai Tổ Hỏa Thần, Ngữ cảnh Phiên, Hách Đao & Âm cảnh');

    // 0. User's First Swordsman Yoriichi Personal Crest Button
    const yoriBtn = document.createElement('button');
    yoriBtn.type = 'button';
    yoriBtn.className = 'agy-yoriichi-crest-btn';
    yoriBtn.title = 'Khai Tổ Vũ Điệu Hỏa Thần (Tsugikuni Yoriichi) — Nhấn để khai mở Nhật Chi Hô Hấp!';
    yoriBtn.setAttribute('aria-label', yoriBtn.title);
    const sunDot = document.createElement('span');
    sunDot.className = 'agy-yoriichi-sun-dot';
    yoriBtn.appendChild(sunDot);

    // 1. Session Representative Avatar + Context Window Pill
    const ctxBtn = document.createElement('button');
    ctxBtn.type = 'button';
    ctxBtn.className = 'agy-tok-pill agy-tok-ctx-pill';

    const ctxIconWrap = document.createElement('span');
    ctxIconWrap.className = 'agy-tok-icon-slot';
    const ctxText = document.createElement('span');
    ctxText.innerHTML = '<span class="agy-tok-ctx-prefix">Ngữ cảnh: </span><span class="agy-tok-num">0</span>';

    const ctxTrack = document.createElement('span');
    ctxTrack.className = 'agy-tok-ctx-track';
    const ctxFill = document.createElement('span');
    ctxFill.className = 'agy-tok-ctx-fill';
    ctxTrack.appendChild(ctxFill);

    ctxBtn.appendChild(ctxIconWrap);
    ctxBtn.appendChild(ctxText);
    ctxBtn.appendChild(ctxTrack);

    // 2. Theme Elemental Attribute Icon + Live Turn Token Counter Pill
    const turnBtn = document.createElement('button');
    turnBtn.type = 'button';
    turnBtn.className = 'agy-tok-pill agy-tok-turn-pill';
    turnBtn.title = 'Số Token chạy trực tiếp theo thuộc tính Hơi Thở của mỗi lượt làm việc';

    const turnIcon = document.createElement('span');
    turnIcon.className = 'agy-tok-icon-slot';
    const turnText = document.createElement('span');
    turnText.innerHTML = '<span class="agy-tok-turn-prefix">Lượt: </span><span class="agy-tok-num">+0</span> tok';

    turnBtn.appendChild(turnIcon);
    turnBtn.appendChild(turnText);

    // 3. Bright Red Nichirin (赫刀) Katana Progress Gauge Pill
    const bladeBtn = document.createElement('button');
    bladeBtn.type = 'button';
    bladeBtn.className = 'agy-tok-pill agy-nichirin-pill';
    bladeBtn.dataset.tier = 'black';
    bladeBtn.title = 'Rèn Nhật Luân Kiếm (0% -> 100% Khai Mở Hách Đao 赫刀)';

    const katanaParts = createNichirinKatanaSvg();
    const bladeLbl = document.createElement('span');
    bladeLbl.className = 'agy-blade-label';
    bladeLbl.textContent = '0%';
    bladeBtn.appendChild(katanaParts.svg);
    bladeBtn.appendChild(bladeLbl);

    // 4. Kagura Wind-Chime Bell Quick Toggle Button
    const kaguraBtn = document.createElement('button');
    kaguraBtn.type = 'button';
    kaguraBtn.className = 'agy-hud-util-btn agy-kagura-bell-btn';
    kaguraBtn.title = 'Chuông gió Kagura — Bật/Tắt Âm cảnh & Chuông báo hoàn thành lượt khi Alt+Tab';
    kaguraBtn.setAttribute('aria-label', kaguraBtn.title);
    kaguraBtn.innerHTML = ic ? ic.getFuncSvg('kagura_bell', 13) : '🔔';

    // 5. Urokodaki Fox Mask (Cinema Director & Privacy Shield) Button
    const cinemaBtn = document.createElement('button');
    cinemaBtn.type = 'button';
    cinemaBtn.className = 'agy-hud-util-btn agy-cinema-mask-btn';
    cinemaBtn.title = 'Mặt nạ Cáo Urokodaki — Mở Khiên Che Mật & Đạo Diễn Cinema';
    cinemaBtn.setAttribute('aria-label', cinemaBtn.title);
    cinemaBtn.innerHTML = ic ? ic.getFuncSvg('cinema_mask', 13) : '🦊';

    // 6. Detailed Breakdown Popover with semantic icons per row
    const pop = document.createElement('div');
    pop.className = 'agy-tok-popover';

    const hdr = document.createElement('div');
    hdr.className = 'agy-tok-pop-hdr';
    const sesWrap = document.createElement('span');
    sesWrap.className = 'agy-tok-pop-session';
    const sesIco = document.createElement('span');
    sesIco.className = 'agy-tok-icon-slot';
    const hdrTitle = document.createElement('span');
    hdrTitle.className = 'agy-tok-pop-title';
    hdrTitle.textContent = 'Phiên làm việc hiện tại';
    sesWrap.appendChild(sesIco);
    sesWrap.appendChild(hdrTitle);

    const badge = document.createElement('span');
    badge.className = 'agy-tok-status-badge';
    badge.textContent = 'Sẵn sàng';
    hdr.appendChild(sesWrap);
    hdr.appendChild(badge);

    const meterWrap = document.createElement('div');
    meterWrap.className = 'agy-tok-meter-bar';
    const meterFill = document.createElement('div');
    meterFill.className = 'agy-tok-meter-fill';
    meterWrap.appendChild(meterFill);

    const rows = document.createElement('div');
    rows.className = 'agy-tok-rows';
    const rCtx = createIconRow(ic ? ic.getFuncSvg('breathing_forms', 13) : '', 'Ngữ cảnh phiên:');
    const rCache = createIconRow(ic ? ic.getFuncSvg('kv_cache', 13) : '', 'Bộ nhớ đệm (KV-Cache):');
    const rTurn = createIconRow('', 'Token lượt hiện tại:');
    const rBlade = createIconRow(ic ? ic.getFuncSvg('katana_cast', 13) : '', 'Nhiệt độ Nhật Luân Đao:');
    const rDraft = createIconRow(ic ? ic.getFuncSvg('draft_brush', 13) : '', 'Đang gõ trong ô chat:');
    const rSession = createIconRow(ic ? ic.getFuncSvg('session_sum', 13) : '', 'Tổng sinh ra cả phiên:');
    const rModel = createIconRow(ic ? ic.getFuncSvg('model_quota', 13) : '', 'Mô hình & Hạn mức:');

    [rCtx, rCache, rTurn, rBlade, rDraft, rSession, rModel].forEach((r) => rows.appendChild(r.row));

    pop.appendChild(hdr);
    pop.appendChild(meterWrap);
    pop.appendChild(rows);

    bar.appendChild(yoriBtn);
    bar.appendChild(ctxBtn);
    bar.appendChild(turnBtn);
    bar.appendChild(bladeBtn);
    bar.appendChild(kaguraBtn);
    bar.appendChild(cinemaBtn);
    bar.appendChild(pop);
    composer.appendChild(bar);

    // 7. Instant Enter Message Echo Banner (#agy-yoriichi-msg-echo)
    const echo = document.createElement('div');
    echo.id = ECHO_BAR_ID;
    const echoAv = document.createElement('span');
    echoAv.className = 'agy-echo-avatar';
    const echoBody = document.createElement('div');
    echoBody.className = 'agy-echo-body';
    const echoHdr = document.createElement('div');
    echoHdr.className = 'agy-echo-hdr';
    echoHdr.innerHTML = `${ic ? ic.getFuncSvg('yoriichi_sun', 12) : ''}<span>Khai Tổ Hỏa Thần vừa truyền lệnh</span>`;
    const echoTxt = document.createElement('div');
    echoTxt.className = 'agy-echo-text';
    echoBody.appendChild(echoHdr);
    echoBody.appendChild(echoTxt);
    const echoClose = document.createElement('button');
    echoClose.type = 'button';
    echoClose.className = 'agy-echo-close';
    echoClose.textContent = '✕';
    echoClose.title = 'Ẩn thông báo lệnh vừa gửi';
    echoClose.addEventListener('click', (ev) => {
      ev.stopPropagation();
      hideUserMessageEcho();
    });
    echo.appendChild(echoAv);
    echo.appendChild(echoBody);
    echo.appendChild(echoClose);
    composer.appendChild(echo);

    state.barEl = bar;
    state.yoriichiBtnEl = yoriBtn;
    state.ctxBtnEl = ctxBtn;
    state.ctxIconWrap = ctxIconWrap;
    state.ctxTextEl = ctxText;
    state.ctxFillEl = ctxFill;
    state.turnBtnEl = turnBtn;
    state.turnIconEl = turnIcon;
    state.turnTextEl = turnText;

    state.bladeBtnEl = bladeBtn;
    state.bladeFillRectEl = katanaParts.fillRect;
    state.bladeGlowPathEl = katanaParts.edgePath;
    state.bladeLabelEl = bladeLbl;

    state.kaguraBtnEl = kaguraBtn;
    state.cinemaBtnEl = cinemaBtn;

    state.popoverEl = pop;
    state.echoEl = echo;
    state.echoTextEl = echoTxt;
    state.echoAvatarEl = echoAv;

    state.popSessionIcon = sesIco;
    state.popSessionTitle = hdrTitle;
    state.detStatusBadge = badge;
    state.detCtxVal = rCtx.valEl;
    state.detCtxMeter = meterFill;
    state.detCacheVal = rCache.valEl;
    state.detTurnIcon = rTurn.icoEl;
    state.detTurnVal = rTurn.valEl;
    state.detBladeVal = rBlade.valEl;
    state.detDraftVal = rDraft.valEl;
    state.detSessionVal = rSession.valEl;
    state.detModelVal = rModel.valEl;

    state.lastSessionSig = '';
    state.lastElemKey = '';
    applyThemeColors(bar, themeCfg, themeName);
    computeAndApplyBladeHeat();

    // Mount Hashira Squad anchor alongside composer
    if (typeof window !== 'undefined' && window.__AGY_SQUAD_RAID__ && typeof window.__AGY_SQUAD_RAID__.mount === 'function') {
      try { window.__AGY_SQUAD_RAID__.mount(composer); } catch (_) {}
    }

    yoriBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      castYoriichiSunBreathing(yoriBtn);
    });

    const onTogglePopover = (ev) => {
      ev.stopPropagation();
      setPopoverOpen(!state.popoverOpen);
      if (state.cid && !state.streamConnected) fetchDaemonTelemetry(state.cid);
      ensureOdometerRunning();
    };
    ctxBtn.addEventListener('click', onTogglePopover);
    turnBtn.addEventListener('click', onTogglePopover);
    bladeBtn.addEventListener('click', onTogglePopover);

    kaguraBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const bio = typeof window !== 'undefined' ? window.__AGY_BIO_AUDIO__ : null;
      if (bio && typeof bio.toggle === 'function') {
        try {
          const next = bio.toggle();
          if (typeof next === 'boolean') {
            if (next) kaguraBtn.dataset.active = '1';
            else delete kaguraBtn.dataset.active;
          } else {
            refreshUtilityButtonStates();
          }
        } catch (_) {}
      }
    });

    cinemaBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const dir = typeof window !== 'undefined' ? window.__AGY_CINEMA_DIRECTOR__ : null;
      if (dir) {
        try {
          if (typeof dir.openPanel === 'function') dir.openPanel();
          else if (typeof dir.togglePanel === 'function') dir.togglePanel();
          else if (typeof dir.open === 'function') dir.open();
        } catch (_) {}
        setTimeout(refreshUtilityButtonStates, 50);
      }
    });

    // Capture Enter key & Send button click BEFORE React clears the editor so user's message always shows!
    const onCaptureKeyDown = (ev) => {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey || ev.isComposing) return;
      const target = ev.target;
      if (!target || (target.closest && target.closest('#agy-shinobu-npc-wrap'))) return;
      const hasMenu = document.querySelector('[role="listbox"], [data-radix-popper-content-wrapper]');
      if (hasMenu && hasMenu.offsetParent !== null) return;

      const editor = composer.querySelector('textarea, [contenteditable="true"]');
      const raw = editor ? (typeof editor.value === 'string' ? editor.value : (editor.textContent || '')) : '';
      if (raw && raw.trim()) {
        showUserMessageEcho(raw.trim());
      }
    };

    const onCaptureSendClick = (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!btn || !composer.contains(btn)) return;
      if (
        btn.closest(`#${HUD_BAR_ID}`) ||
        btn.closest('#agy-chibi-skill-bar') ||
        btn.closest('#agy-shinobu-npc-wrap') ||
        btn.closest('agy-hashira-squad') ||
        btn.classList.contains('agy-chibi-hitbox')
      ) {
        return;
      }
      const aria = String(btn.getAttribute('aria-label') || btn.title || '').toLowerCase();
      const tid = String(btn.getAttribute('data-testid') || '').toLowerCase();
      if (btn.type === 'submit' || /send|submit|gửi/.test(aria) || /send|submit/.test(tid)) {
        const editor = composer.querySelector('textarea, [contenteditable="true"]');
        const raw = editor ? (typeof editor.value === 'string' ? editor.value : (editor.textContent || '')) : '';
        if (raw && raw.trim()) {
          showUserMessageEcho(raw.trim());
        }
      }
    };

    const onOutside = (ev) => {
      if (state.popoverOpen && bar && !bar.contains(ev.target)) {
        setPopoverOpen(false);
      }
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        if (state.popoverOpen) setPopoverOpen(false);
        hideUserMessageEcho();
      }
    };
    const onComposerInput = () => ensureOdometerRunning();
    const onVis = () => {
      if (!document.hidden) {
        if (state.cid && !state.streamConnected) {
          connectTelemetryStream(state.cid);
          fetchDaemonTelemetry(state.cid);
        }
        ensureOdometerRunning();
      }
    };

    composer.addEventListener('keydown', onCaptureKeyDown, true);
    composer.addEventListener('click', onCaptureSendClick, true);
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
    composer.addEventListener('input', onComposerInput);
    document.addEventListener('visibilitychange', onVis);

    state.cleanups.push(() => composer.removeEventListener('keydown', onCaptureKeyDown, true));
    state.cleanups.push(() => composer.removeEventListener('click', onCaptureSendClick, true));
    state.cleanups.push(() => document.removeEventListener('click', onOutside));
    state.cleanups.push(() => document.removeEventListener('keydown', onKey));
    state.cleanups.push(() => composer.removeEventListener('input', onComposerInput));
    state.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

    // Smart heartbeat: monitors cid changes & serves as resilient fallback if SSE stream drops
    // Keeps gentle background check when !document.hasFocus() so Kagura Bell still rings on Alt+Tab!
    state.pollTimer = setInterval(() => {
      refreshUtilityButtonStates();
      const sig = extractLivePageSignals(state.composer);
      if (sig.cid && sig.cid !== state.cid) {
        switchActiveConversation(sig.cid);
        ensureOdometerRunning();
        return;
      }

      const now = Date.now();
      const isHiddenOrUnfocused =
        typeof document !== 'undefined' && (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus()));

      if (!state.streamConnected && state.cid) {
        const minGap = isHiddenOrUnfocused ? Math.max(2800, state.fallbackBackoffMs) : state.fallbackBackoffMs;
        if (now >= state.nextFallbackAt || (sig.isWorking && !isHiddenOrUnfocused && now - (state.nextFallbackAt - state.fallbackBackoffMs) >= minGap)) {
          fetchDaemonTelemetry(state.cid);
        }
      }

      if (!document.hidden && (sig.isWorking || state.wasWorking)) {
        ensureOdometerRunning();
      }
    }, 850);

    const nowInit = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const initChars = measureConversationDomChars();
    state.turnBaselineDomChars = initChars;
    state.stepBaselineDomChars = initChars;
    state.workStartedAt = nowInit;
    state.lastStepSeenAt = nowInit;

    const initSig = extractLivePageSignals(composer);
    state.cid = initSig.cid;
    state.wasWorking = initSig.isWorking;
    if (state.cid) {
      connectTelemetryStream(state.cid);
      fetchDaemonTelemetry(state.cid).then(() => ensureOdometerRunning());
    }
    ensureOdometerRunning();

    return bar;
  }

  function teardown() {
    abortActiveStream();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = 0;
    }
    clearTimeout(state.echoTimer);
    state.echoTimer = 0;
    while (state.cleanups.length > 0) {
      const fn = state.cleanups.pop();
      try { fn(); } catch (_) {}
    }
    if (state.composer && state.composer.dataset) {
      delete state.composer.dataset.agyCrisis;
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll(`#${HUD_BAR_ID}, #${ECHO_BAR_ID}`).forEach((el) => el.remove());
      if (document.documentElement) {
        delete document.documentElement.dataset.agyRedBlade;
      }
    }
    if (typeof window !== 'undefined' && window.__AGY_SQUAD_RAID__ && typeof window.__AGY_SQUAD_RAID__.teardown === 'function') {
      try { window.__AGY_SQUAD_RAID__.teardown(); } catch (_) {}
    }
    state.composer = null;
    state.barEl = null;
    state.echoEl = null;
    state.kaguraBtnEl = null;
    state.cinemaBtnEl = null;
    state.bladeBtnEl = null;
    state.popoverOpen = false;
  }

  const api = {
    mountTokenHud,
    castYoriichiSunBreathing,
    showUserMessageEcho,
    hideUserMessageEcho,
    ingestTelemetrySnapshot,
    setBladeBonusHeat: (bonus) => {
      state.bladeBonusHeat = Math.max(0, Math.min(100, Number(bonus) || 0));
      computeAndApplyBladeHeat();
    },
    triggerCrisisSlashDemo: (reason) => {
      executeDemonSlayCelebration(Date.now(), reason || 'Ác Quỷ Diệt Sát • Toàn bộ kiểm thử Exit 0!');
    },
    teardown,
    destroy: teardown,
    refresh: () => {
      if (state.cid) {
        if (!state.streamConnected) connectTelemetryStream(state.cid);
        fetchDaemonTelemetry(state.cid);
      }
      refreshUtilityButtonStates();
      ensureOdometerRunning();
    }
  };

  if (typeof window !== 'undefined') window.__AGY_TOKEN_HUD__ = api;
  if (typeof globalThis !== 'undefined') globalThis.__AGY_TOKEN_HUD__ = api;
})();
