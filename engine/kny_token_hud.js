(() => {
  'use strict';

  if (typeof window !== 'undefined' && window.__AGY_TOKEN_HUD__ && typeof window.__AGY_TOKEN_HUD__.teardown === 'function') {
    try { window.__AGY_TOKEN_HUD__.teardown(); } catch (_) {}
  }

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
  const HERALD_BAR_ID = 'agy-kasugai-herald';
  const HERALD_AUTO_HIDE_MS = 6000;
  const HERALD_LONG_TURN_MS = 12000;
  const HERALD_COOLDOWN_MS = 3200;
  const STYLE_ID = 'antigravity-kny-token-hud-style';
  const DEFAULT_CONTEXT_WINDOW = 1048576;
  const AUTO_COMPACT_STORAGE_KEY = 'agy_auto_compact_380k_v1';
  const AUTO_COMPACT_THRESHOLD = 380000;
  const AUTO_COMPACT_REARM_BELOW = 350000;
  const AUTO_COMPACT_COOLDOWN_MS = 120000;
  const MANUAL_COMPACT_COOLDOWN_MS = 4000;
  const AUTO_COMPACT_SETTLE_MS = 1200;
  const COMPACT_COMMAND = '/compact';

  function readAutoCompactPref() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(AUTO_COMPACT_STORAGE_KEY);
        if (raw !== '0') {
          localStorage.setItem(AUTO_COMPACT_STORAGE_KEY, '0');
        }
      }
    } catch (_) {}
    return false;
  }

  function writeAutoCompactPref() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTO_COMPACT_STORAGE_KEY, '0');
      }
    } catch (_) {}
  }

  const state = {
    composer: null,
    composerRo: null,
    themeCfg: null,
    themeKeyHint: '',
    personaSkillId: 'yoriichi',
    personaLabel: '',
    barEl: null,
    yoriichiBtnEl: null,
    yoriichiComboIdx: 0,
    ctxBtnEl: null,
    ctxIconWrap: null,
    ctxTextEl: null,
    ctxNumEl: null,
    ctxFillEl: null,
    ctxCacheFillEl: null,
    turnBtnEl: null,
    turnIconEl: null,
    turnTextEl: null,
    turnNumEl: null,
    turnDraftWrapEl: null,
    turnDraftNumEl: null,

    // Bright Red Nichirin (赫刀) Blade Gauge Elements & State
    bladeBtnEl: null,
    bladeFillRectEl: null,
    bladeGlowPathEl: null,
    bladeLabelEl: null,
    bladeHeat: 0,
    bladeBonusHeat: 0,
    typingHeatPulse: 0,
    lastHeatDecayAt: 0,
    lastActivityAt: 0,
    bonusHoldUntil: 0,
    lastRenderedBladeHeat: -1,
    lastRenderedBladeTier: '',
    bladeTier: 'black',

    // Quick Action SVG Buttons (Kagura Bell & Cinema Fox Mask)
    kaguraBtnEl: null,
    cinemaBtnEl: null,

    popoverEl: null,
    popoverOpen: false,

    echoEl: null,
    echoHdrLabelEl: null,
    echoTextEl: null,
    echoAvatarEl: null,
    echoTimer: 0,
    echoShownAt: 0,
    baselineUserMsgCount: 0,

    // v3.5 Smart Kasugai / Chuntaro / Kaburamaru Herald state
    heraldEl: null,
    heraldSvgSlotEl: null,
    heraldTitleEl: null,
    heraldMsgEl: null,
    heraldTimer: 0,
    heraldGlowTimer: 0,
    heraldVisible: false,
    heraldKind: 'kasugai_crow',
    heraldCharId: 'shinobu',
    heraldCompanionName: '',
    heraldLastShownAt: 0,
    heraldLastTriggerReason: '',
    heraldLastApprovalSig: '',
    liveTurnWorkStartedMs: 0,
    liveTurnWasWorking: false,

    // Detail rows inside popover
    popSessionTitle: null,
    popSessionIcon: null,
    detCtxVal: null,
    detCtxMeter: null,
    detCtxCacheMeter: null,
    detCacheVal: null,
    detTurnIcon: null,
    detTurnVal: null,
    detVelocityVal: null,
    detBladeVal: null,
    detDraftVal: null,
    detSessionVal: null,
    detModelVal: null,
    detStatusBadge: null,

    // Runtime telemetry & live animation state
    cid: '',
    resolvedCid: '',
    everSawExplicitCid: false,
    lastSessionSig: '',
    lastElemKey: '',
    isWorking: false,
    wasWorking: false,
    pollWasWorking: false,
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
    serverModelName: '',
    hasTelemetry: false,

    // Crisis & Bug-Slash state
    crisisState: false,
    lastSlashSeq: -1,
    lastTurnFinishedSeq: -1,
    localFinishSeq: 0,

    // Throttled DOM/Fiber measurement cache (220ms)
    lastSignalSampleAt: 0,
    forceSignalSample: true,
    cachedSignals: null,
    cachedDomChars: 0,

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
    burnRateTokPerSec: 0,
    peakBurnRateTokPerSec: 0,
    lastBurnSampleTokens: 0,
    lastBurnSampleAt: 0,

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
    mountEpoch: 0,
    cidEpoch: 0,
    yoriichiSurgeTimer: 0,
    kaguraSyncTimer: 0,
    cinemaSyncTimer: 0,
    fetchInFlight: false,
    workStateItems: [],
    detWorkStateRow: null,
    detWorkStateVal: null,
    detCompactVal: null,

    // Auto-Compact 380K & Manual Compact (/compact) state
    autoCompactEnabled: readAutoCompactPref(),
    autoCompactPending: false,
    autoCompactDisarmed: false,
    autoCompactWaitingLiveTurn: false,
    autoCompactBaselineCtx: 0,
    autoCompactBaselineTurn: 0,
    autoCompactBaselineStep: 0,
    autoCompactTriggeredCtx: 0,
    autoCompactTriggeredTurn: 0,
    autoCompactLastAt: 0,
    manualCompactLastAt: 0,
    compactInFlight: false,
    compactLastFailed: false,
    autoCompactTimer: 0,
    compactStepTimers: [],
    suppressNextCompactEchoUntil: 0,
    cleanups: []
  };

  const MAX_COMPACT_HISTORY_CIDS = 20;
  const compactHistoryByCid = new Map();

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

  const COMPOSER_ROOT_SEL = '.surface-composer, [data-testid="composer"], form:has(textarea)';
  const CASCADE_ATTR_SEL = '[data-conversation-id], [data-cascade-id], [data-trajectory-id], [data-session-id]';
  const SIDEBAR_GUARD_SEL = '[data-sidebar="true"], [data-testid="conversation-list-sidebar"], [data-testid="sidebar-navigation-items"], aside, nav, [role="navigation"]';

  function isInsideSidebarNav(el) {
    if (!el || typeof el.closest !== 'function') return false;
    try {
      if (el.closest(SIDEBAR_GUARD_SEL)) return true;
      const split = el.closest('[data-testid="sidebar-split"]');
      if (split && split !== el && split.children && split.children.length > 1) {
        for (let i = 0; i < split.children.length; i++) {
          const pane = split.children[i];
          if (pane && typeof pane.contains === 'function' && pane.contains(el)) {
            const hasMainContent = typeof pane.querySelector === 'function' && Boolean(
              pane.querySelector('.surface-composer, [data-testid="composer"], [data-testid="conversation-view"], [data-main-content-body="true"], form:has(textarea)')
            );
            if (!hasMainContent && i === 0) return true;
            break;
          }
        }
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function extractAttrCid(el) {
    if (!el || typeof el.getAttribute !== 'function') return '';
    const val = String(
      el.getAttribute('data-conversation-id') ||
      el.getAttribute('data-cascade-id') ||
      el.getAttribute('data-trajectory-id') ||
      el.getAttribute('data-session-id') ||
      ''
    ).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
      ? val.toLowerCase()
      : '';
  }

  function extractLocationUrlCid() {
    if (typeof window === 'undefined' || !window.location) return '';
    const locStr = `${window.location.pathname || ''}${window.location.hash || ''}${window.location.search || ''}`;
    const mPath = locStr.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (mPath) return mPath[1].toLowerCase();
    const mQuery = locStr.match(/[?&](?:conversationId|cascadeId|cid)=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return mQuery ? mQuery[1].toLowerCase() : '';
  }

  function isElementVisiblyLaidOut(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.getBoundingClientRect === 'function') {
      try {
        const r = el.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) return true;
        if (r && r.width === 0 && r.height === 0 && el.clientWidth === 0 && el.clientHeight === 0) {
          return false;
        }
      } catch (_) {}
    }
    return true;
  }

  function resolveComposerRoot() {
    if (typeof document === 'undefined') return null;
    let all = [];
    try {
      all = Array.from(document.querySelectorAll('.surface-composer, [data-testid="composer"]'));
      if (all.length === 0) {
        const f = document.querySelector('form:has(textarea)');
        if (f) all = [f];
      }
    } catch (_) {
      const fallback = document.querySelector('.surface-composer') || document.querySelector('[data-testid="composer"]');
      return fallback || null;
    }
    if (all.length === 0) return null;
    if (all.length === 1) return all[0];

    const visible = all.filter((c) => !isInsideSidebarNav(c) && isElementVisiblyLaidOut(c));
    const pool = visible.length > 0 ? visible : all;

    const ae = document.activeElement;
    if (ae) {
      const focused = pool.find((c) => c === ae || (typeof c.contains === 'function' && c.contains(ae)));
      if (focused) return focused;
    }

    const urlCid = extractLocationUrlCid();
    if (urlCid) {
      const byUrl = pool.find((c) => {
        const anc = typeof c.closest === 'function' ? c.closest(CASCADE_ATTR_SEL) : null;
        return anc && !isInsideSidebarNav(anc) && extractAttrCid(anc) === urlCid;
      });
      if (byUrl) return byUrl;
    }

    return pool[0];
  }

  function resolveYoriichiAvatarUrl(themeCfg) {
    if (themeCfg && typeof themeCfg.effectiveUserAvatar === 'string' && themeCfg.effectiveUserAvatar) {
      const cleanedEff = sanitizeCssAssetUrl(themeCfg.effectiveUserAvatar);
      if (cleanedEff) return cleanedEff;
    }
    if (themeCfg && typeof themeCfg.userAvatar === 'string' && themeCfg.userAvatar) {
      const cleaned = sanitizeCssAssetUrl(themeCfg.userAvatar);
      if (cleaned) return cleaned;
    }
    return sanitizeCssAssetUrl('assets/yoriichi_avatar.jpg');
  }

  function resolveYoriichiActionUrl(themeCfg) {
    const cfg = themeCfg && typeof themeCfg === 'object' ? themeCfg : {};
    if (typeof cfg.userActionSticker === 'string' && cfg.userActionSticker.trim()) {
      const cleaned = sanitizeCssAssetUrl(cfg.userActionSticker.trim());
      if (cleaned) return cleaned;
    }
    if (cfg.isMultiversePersona) {
      return '';
    }
    const rawSkillId = typeof cfg.personaSkillId === 'string' && cfg.personaSkillId.trim()
      ? cfg.personaSkillId.trim().toLowerCase()
      : 'yoriichi';
    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    const canonicalId = (ext && typeof ext.resolveCharacterId === 'function' && ext.resolveCharacterId(rawSkillId)) || rawSkillId;
    const safeSkillFile = String(canonicalId || 'yoriichi').replace(/[^a-z0-9_]/g, '') || 'yoriichi';
    return sanitizeCssAssetUrl(`assets/${safeSkillFile}_action.webp`);
  }

  function isSfxMutedNow() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('agy_kny_sfx_muted');
        if (raw === '1' || raw === 'true') return true;
      }
      if (typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__) {
        const bio = window.__AGY_BIO_AUDIO__;
        if (typeof bio.getPrefs === 'function') {
          const prefs = bio.getPrefs();
          if (prefs && prefs.swordSfxEnabled === false) return true;
        }
      }
      if (typeof window !== 'undefined' && window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.isSoundMuted === 'function') {
        if (window.__AGY_KNY_SKILLS__.isSoundMuted()) return true;
      }
    } catch (_) {}
    return false;
  }

  function setTextIfChanged(el, nextText) {
    if (el && el.textContent !== nextText) {
      el.textContent = nextText;
    }
  }

  function formatSlashReasonVi(rawReason) {
    const key = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (!key || key === 'bug_slashed') {
      return 'Đã chém đứt tà khí lỗi (Exit 0) • Rèn Hách Đao +25%';
    }
    if (key === 'git_pushed') {
      return 'Khải hoàn đẩy code lên kho lưu trữ (Git Push thành công)!';
    }
    return key;
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
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-variant-numeric: tabular-nums;
        user-select: none;
        -webkit-app-region: no-drag;
      }

      #${HUD_BAR_ID}[data-open="1"] {
        z-index: 95;
      }

      /* Split-View Container Responsive Tiers (observed via ResizeObserver on composer.clientWidth) */
      #${HUD_BAR_ID}[data-compact="1"] .agy-tok-ctx-prefix,
      #${HUD_BAR_ID}[data-compact="1"] .agy-tok-turn-prefix,
      #${HUD_BAR_ID}[data-compact="1"] .agy-blade-tier-txt,
      #${HUD_BAR_ID}[data-compact="1"] .agy-tok-draft-tag,
      #${HUD_BAR_ID}[data-compact="2"] .agy-tok-ctx-prefix,
      #${HUD_BAR_ID}[data-compact="2"] .agy-tok-turn-prefix,
      #${HUD_BAR_ID}[data-compact="2"] .agy-blade-tier-txt,
      #${HUD_BAR_ID}[data-compact="2"] .agy-tok-draft-tag {
        display: none !important;
      }
      #${HUD_BAR_ID}[data-compact="1"] {
        gap: 3.5px;
      }
      #${HUD_BAR_ID}[data-compact="1"] .agy-tok-pill {
        padding: 3px 6px;
        font-size: 10.5px;
      }
      #${HUD_BAR_ID}[data-compact="1"] .agy-nichirin-svg {
        width: 34px;
        height: 11px;
      }
      #${HUD_BAR_ID}[data-compact="2"] {
        bottom: calc(100% + 5px);
        left: 4px;
        gap: 2.5px;
        max-width: calc(100% - 96px);
        flex-wrap: nowrap;
      }
      #${HUD_BAR_ID}[data-compact="2"] .agy-tok-pill {
        padding: 2px 5px;
        font-size: 9.8px;
        gap: 3px;
      }
      #${HUD_BAR_ID}[data-compact="2"] .agy-nichirin-svg {
        width: 24px;
        height: 10px;
      }
      #${HUD_BAR_ID}[data-compact="2"] .agy-yoriichi-crest-btn,
      #${HUD_BAR_ID}[data-compact="2"] .agy-hud-util-btn {
        width: 22px;
        height: 22px;
      }
      #${HUD_BAR_ID}[data-compact="2"] .agy-tok-popover {
        width: min(296px, calc(100vw - 20px));
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
          bottom: calc(100% + 5px);
          left: 4px;
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
      html[data-agy-red-blade="1"] .agy-yoriichi-crest-btn {
        border-color: #fde047 !important;
        box-shadow:
          0 0 14px rgba(239, 68, 68, 0.92),
          0 0 26px rgba(249, 115, 22, 0.68),
          0 0 36px rgba(253, 224, 71, 0.42);
      }
      html[data-agy-red-blade="1"] .agy-yoriichi-crest-btn[data-surge="1"] {
        transform: scale(1.15);
        box-shadow: 0 0 22px #ef4444, 0 0 32px #fde047;
      }
      html[data-agy-red-blade="1"] .agy-shell [data-testid="user-message"]::after {
        border-color: #fde047 !important;
        box-shadow:
          0 0 14px rgba(239, 68, 68, 0.92),
          0 0 26px rgba(249, 115, 22, 0.68),
          0 0 36px rgba(253, 224, 71, 0.42) !important;
      }
      @media (prefers-reduced-motion: no-preference) {
        html[data-agy-red-blade="1"] .agy-yoriichi-crest-btn:not([data-surge="1"]) {
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
        gap: 5px;
        padding: 3.5px 9px;
        border-radius: 9999px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.085) 0%, rgba(255, 255, 255, 0.01) 48%, rgba(0, 0, 0, 0.22) 100%),
          var(--tok-surface, rgba(14, 11, 29, 0.95));
        border: 1px solid var(--tok-border, rgba(192, 132, 252, 0.58));
        color: #f8fafc;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.25;
        white-space: nowrap;
        cursor: pointer;
        overflow: hidden;
        contain: layout style paint;
        box-shadow:
          0 4px 14px rgba(0, 0, 0, 0.52),
          0 0 10px var(--tok-glow, rgba(192, 132, 252, 0.20)),
          inset 0 1px 0 rgba(255, 255, 255, 0.20),
          inset 0 -1px 0 rgba(0, 0, 0, 0.45);
        transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s ease, box-shadow 0.18s ease;
      }
      .agy-tok-pill::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 46%;
        height: 100%;
        background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 100%);
        transform: translateX(-160%) skewX(-22deg);
        pointer-events: none;
        will-change: transform;
      }
      @media (prefers-reduced-motion: no-preference) {
        .agy-tok-pill:hover::after {
          animation: agyPillSpecularSweep 0.68s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .agy-tok-turn-pill[data-working="1"]::after {
          animation: agyPillWorkingSweep 2.1s ease-in-out infinite;
        }
      }
      @keyframes agyPillSpecularSweep {
        0%   { transform: translateX(-160%) skewX(-22deg); }
        100% { transform: translateX(340%) skewX(-22deg); }
      }
      @keyframes agyPillWorkingSweep {
        0%   { transform: translateX(-160%) skewX(-22deg); opacity: 0.9; }
        55%  { transform: translateX(340%) skewX(-22deg); opacity: 0.9; }
        100% { transform: translateX(340%) skewX(-22deg); opacity: 0; }
      }
      .agy-tok-pill:hover,
      #${HUD_BAR_ID}[data-open="1"] .agy-tok-pill {
        transform: translateY(-1.5px);
        border-color: var(--tok-primary, #c084fc);
        box-shadow:
          0 6px 18px rgba(0, 0, 0, 0.62),
          0 0 15px var(--tok-glow, rgba(192, 132, 252, 0.44)),
          inset 0 1px 0 rgba(255, 255, 255, 0.32),
          inset 0 -1px 0 rgba(0, 0, 0, 0.45);
      }

      .agy-tok-icon-slot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
      }

      /* Dual-Layer Segmented Context + KV Cache Gauge inside Context Pill */
      .agy-tok-ctx-track {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 1.5px;
        height: 2.5px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.12);
        overflow: hidden;
        pointer-events: none;
      }
      .agy-tok-ctx-fill {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 0%;
        border-radius: 9999px;
        background: linear-gradient(90deg, var(--tok-primary, #38bdf8), var(--tok-secondary, #e879f9));
        box-shadow: 0 0 6px var(--tok-primary, #38bdf8);
        transition: width 0.24s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .agy-tok-ctx-cache {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 0%;
        border-radius: 9999px;
        background: linear-gradient(90deg, rgba(45, 212, 191, 0.95), rgba(56, 189, 248, 0.85));
        opacity: 0.72;
        transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .agy-tok-ctx-fill[data-warn="amber"] {
        background: linear-gradient(90deg, #f59e0b, #fde047);
        box-shadow: 0 0 7px rgba(245, 158, 11, 0.75);
      }
      .agy-tok-ctx-fill[data-warn="red"] {
        background: linear-gradient(90deg, #ef4444, #fb923c);
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.85);
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
      .agy-nichirin-pill[data-compact-ready="1"] {
        border-color: rgba(251, 191, 36, 0.92);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 14px rgba(249, 115, 22, 0.56);
      }
      .agy-nichirin-pill[data-compacting="1"] {
        border-color: rgba(56, 189, 248, 0.92);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.58);
      }
      @media (prefers-reduced-motion: no-preference) {
        .agy-nichirin-pill[data-compact-ready="1"]:not([data-compacting="1"]) {
          animation: agyBladeCompactReadyPulse 2s ease-in-out infinite;
        }
      }
      @keyframes agyBladeCompactReadyPulse {
        0%, 100% {
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.54), 0 0 10px rgba(251, 191, 36, 0.45);
        }
        50% {
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65), 0 0 18px rgba(239, 68, 68, 0.78);
        }
      }

      /* ======================================================================
       * QUICK UTILITY ICON BUTTONS (KAGURA BELL & UROKODAKI FOX MASK)
       * ====================================================================== */
      .agy-hud-util-btn {
        position: relative;
        width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.15), transparent 62%),
          var(--tok-surface, rgba(16, 12, 34, 0.95));
        border: 1px solid var(--tok-border, rgba(148, 163, 184, 0.48));
        color: #e2e8f0;
        cursor: pointer;
        flex-shrink: 0;
        box-shadow:
          0 3px 10px rgba(0, 0, 0, 0.52),
          inset 0 1px 0 rgba(255, 255, 255, 0.22);
        transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
      }
      .agy-hud-util-btn:hover {
        transform: translateY(-1.5px) scale(1.09);
        border-color: #fde047;
        color: #ffffff;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.64), 0 0 13px rgba(250, 204, 21, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.35);
      }
      @media (prefers-reduced-motion: no-preference) {
        .agy-kagura-bell-btn:hover svg {
          animation: agyKaguraBellSwing 0.55s ease-in-out;
          transform-origin: 50% 15%;
        }
      }
      @keyframes agyKaguraBellSwing {
        0%, 100% { transform: rotate(0deg); }
        25%      { transform: rotate(11deg); }
        65%      { transform: rotate(-9deg); }
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
        bottom: calc(100% + 8px);
        left: 0;
        width: 326px;
        display: none;
        flex-direction: column;
        gap: 7.5px;
        padding: 11px 13px 12px;
        border-radius: 13px;
        background:
          linear-gradient(165deg, rgba(255, 255, 255, 0.065) 0%, rgba(255, 255, 255, 0.0) 36%),
          var(--tok-surface, rgba(13, 10, 27, 0.98));
        border: 1px solid var(--tok-border, rgba(192, 132, 252, 0.72));
        box-shadow:
          0 18px 40px rgba(2, 4, 14, 0.88),
          0 0 24px var(--tok-glow, rgba(192, 132, 252, 0.28)),
          inset 0 1px 0 rgba(255, 255, 255, 0.18),
          inset 0 -1px 0 rgba(0, 0, 0, 0.5);
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
        position: relative;
        width: 100%;
        height: 6px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.09);
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.55);
        overflow: hidden;
      }
      .agy-tok-meter-bar::after {
        content: "";
        position: absolute;
        left: 36.24%;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(253, 224, 71, 0.45);
        pointer-events: none;
      }
      .agy-tok-meter-fill {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 0%;
        border-radius: 9999px;
        background: linear-gradient(90deg, var(--tok-primary, #38bdf8), var(--tok-secondary, #e879f9));
        box-shadow: 0 0 8px var(--tok-primary, #38bdf8);
        transition: width 0.25s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .agy-tok-meter-cache {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 0%;
        border-radius: 9999px;
        background: linear-gradient(90deg, rgba(45, 212, 191, 0.95), rgba(56, 189, 248, 0.85));
        opacity: 0.76;
        transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
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
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        -webkit-app-region: no-drag;
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

      /* v3.5 Smart Kasugai / Chuntaro / Kaburamaru Herald (#agy-kasugai-herald) */
      #${HERALD_BAR_ID} {
        position: absolute;
        bottom: calc(100% + 36px);
        left: 8px;
        max-width: min(468px, calc(100% - 124px));
        z-index: 62;
        display: none;
        align-items: center;
        gap: 8px;
        padding: 5px 9px 5px 7px;
        border-radius: 9999px;
        background: linear-gradient(135deg, rgba(15, 11, 29, 0.97) 0%, rgba(28, 16, 40, 0.96) 100%);
        border: 1px solid var(--tok-border, rgba(192, 132, 252, 0.72));
        box-shadow:
          0 10px 26px rgba(2, 4, 14, 0.78),
          0 0 18px var(--tok-glow, rgba(192, 132, 252, 0.28)),
          inset 0 1px 0 rgba(255, 255, 255, 0.16);
        color: #f8fafc;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', sans-serif;
        -webkit-app-region: no-drag;
      }
      #${HERALD_BAR_ID}[data-visible="1"] {
        display: inline-flex;
        animation: agyKasugaiGlideIn 0.32s cubic-bezier(0.22, 1, 0.36, 1);
      }
      #${HERALD_BAR_ID}[data-urgent="1"] {
        border-color: rgba(248, 113, 113, 0.86);
        box-shadow: 0 10px 26px rgba(15, 4, 8, 0.85), 0 0 20px rgba(239, 68, 68, 0.42);
      }
      @keyframes agyKasugaiGlideIn {
        from { opacity: 0; transform: translate(-10px, -12px) scale(0.92); }
        to   { opacity: 1; transform: translate(0, 0) scale(1); }
      }
      @keyframes agyKasugaiBob {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50%      { transform: translateY(-2px) rotate(-3deg); }
      }
      .agy-herald-main {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        flex: 1;
        background: transparent;
        border: none;
        padding: 0;
        color: inherit;
        cursor: pointer;
        text-align: left;
      }
      .agy-herald-companion-svg {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.38));
        border: 1px solid rgba(255, 255, 255, 0.22);
        animation: agyKasugaiBob 2.2s ease-in-out infinite;
      }
      .agy-herald-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.24;
      }
      .agy-herald-title {
        font-size: 9.8px;
        font-weight: 700;
        color: var(--tok-primary, #fde047);
        letter-spacing: 0.18px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .agy-herald-msg {
        font-size: 11.2px;
        font-weight: 500;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 340px;
      }
      .agy-herald-close {
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        border: none;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(226, 232, 240, 0.78);
        font-size: 10.5px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        padding: 0;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .agy-herald-close:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
      }
      .agy-herald-target-glow {
        outline: 1.5px solid var(--tok-primary, #fde047) !important;
        box-shadow: 0 0 22px var(--tok-glow, rgba(250, 204, 21, 0.38)) !important;
        border-radius: 10px;
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
    const bladeD = 'M12.5 4.4 C21.8 4.3 33.2 3.8 42.1 3.2 Q44.7 4.3 45.5 6.4 Q42.8 8.6 38.2 8.7 C29.5 8.9 20.2 8.7 12.5 8.4 Z';
    svg.innerHTML =
      `<defs>` +
      `<clipPath id="${uid}_blade_clip"><path d="${bladeD}"/></clipPath>` +
      `<linearGradient id="${uid}_steel_grad" x1="12.5" y1="3" x2="12.5" y2="9.5" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0%" stop-color="#475569"/><stop offset="48%" stop-color="#0f172a"/><stop offset="100%" stop-color="#334155"/>` +
      `</linearGradient>` +
      `<linearGradient id="${uid}_ember_grad" x1="12.5" y1="6" x2="45.5" y2="6" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0%" stop-color="#b91c1c"/>` +
      `<stop offset="45%" stop-color="#ef4444"/>` +
      `<stop offset="80%" stop-color="#f97316"/>` +
      `<stop offset="100%" stop-color="#fef08a"/>` +
      `</linearGradient>` +
      `</defs>` +
      // Golden Kashira pommel cap + Tsuka hilt with crimson diamond Tsuka-maki wrap
      `<rect x="0.8" y="4.7" width="8.6" height="3.4" rx="1.2" fill="#17153b" stroke="#facc15" stroke-width="0.75"/>` +
      `<rect x="0.7" y="4.7" width="1.5" height="3.4" rx="0.7" fill="#eab308"/>` +
      `<path d="M2.9 4.8l1.2 3.2M4.1 4.8L2.9 8.0M5.4 4.8l1.2 3.2M6.6 4.8L5.4 8.0M7.9 4.8l1.0 3.2" stroke="#ef4444" stroke-width="0.8" stroke-linecap="round"/>` +
      // Yoriichi Flame-Rimmed Golden Tsuba Guard + Brass Habaki Collar
      `<ellipse cx="10.2" cy="6.4" rx="1.3" ry="4.6" fill="#facc15" stroke="#b45309" stroke-width="0.65"/>` +
      `<rect x="11.1" y="4.5" width="1.6" height="3.8" rx="0.35" fill="#fde047" stroke="#ca8a04" stroke-width="0.5"/>` +
      // Base Forged Black-Steel Sori Curved Nichirin Blade + Bo-hi Fuller Groove
      `<path d="${bladeD}" fill="url(#${uid}_steel_grad)" stroke="#94a3b8" stroke-width="0.75"/>` +
      `<line x1="13.5" y1="5.3" x2="38.8" y2="4.8" stroke="rgba(226,232,240,0.45)" stroke-width="0.55" stroke-linecap="round"/>` +
      // Progressive Bright-Red Forge Heat Overlay + Tempered Wavy Hamon Line (exact 33.0 span: 12.5 -> 45.5)
      `<g clip-path="url(#${uid}_blade_clip)">` +
      `<rect class="agy-nichirin-heat-rect" x="12.5" y="2.6" width="0" height="6.8" fill="url(#${uid}_ember_grad)"/>` +
      `<path d="M13.0 7.1 Q16.6 5.8 20.2 7.1 T27.4 6.9 T34.6 6.7 T41.8 6.2 T45.0 6.1" stroke="rgba(255,255,255,0.78)" stroke-width="0.65" fill="none"/>` +
      `</g>` +
      // Razor Kissaki Tip & Spine Specular Highlight
      `<path class="agy-nichirin-edge-stroke" d="${bladeD}" fill="none" stroke="rgba(226,232,240,0.68)" stroke-width="0.72"/>`;

    const fillRect = svg.querySelector('.agy-nichirin-heat-rect');
    const edgePath = svg.querySelector('.agy-nichirin-edge-stroke');
    return { svg, fillRect, edgePath };
  }

  function decayBladeHeatWhenIdle(nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    if (!state.lastHeatDecayAt) {
      state.lastHeatDecayAt = now;
      return false;
    }
    const dtSec = Math.max(0, Math.min(5, (now - state.lastHeatDecayAt) / 1000));
    if (dtSec < 0.25) return false;
    state.lastHeatDecayAt = now;

    let changed = false;
    const idleSinceInputMs = now - (state.lastActivityAt || 0);
    if (!state.isWorking && state.typingHeatPulse > 0 && idleSinceInputMs > 1200) {
      const nextPulse = Math.max(0, +(state.typingHeatPulse - dtSec * 3.6).toFixed(2));
      if (nextPulse !== state.typingHeatPulse) {
        state.typingHeatPulse = nextPulse;
        changed = true;
      }
    }
    if (!state.isWorking && state.bladeBonusHeat > 0 && now >= (state.bonusHoldUntil || 0) && idleSinceInputMs > 6000) {
      const nextBonus = Math.max(0, +(state.bladeBonusHeat - dtSec * 1.1).toFixed(2));
      if (nextBonus !== state.bladeBonusHeat) {
        state.bladeBonusHeat = nextBonus;
        changed = true;
      }
    }
    return changed;
  }

  function computeAndApplyBladeHeat() {
    if (!state.barEl || !state.barEl.isConnected) return;
    let organicHeat = 0;
    if (state.hasTelemetry) {
      const turns = Math.max(0, state.serverTurnCount);
      const steps = Math.max(0, state.serverStepCount || state.serverTurnSteps);
      const tokFactor = Math.min(60, Math.floor((state.serverTotalOutTokens || 0) / 800));
      organicHeat = Math.min(100, Math.round(turns * 11 + steps * 2.5 + tokFactor * 0.65));
    } else {
      const domCtxEst = Math.max(0, state.targetCtxTokens || state.dispCtxTokens || 0);
      const domTurnEst = Math.max(0, state.targetTurnTokens || state.dispTurnTokens || 0);
      organicHeat = Math.min(100, Math.round(Math.min(45, domCtxEst / 950) + Math.min(55, domTurnEst / 45)));
    }

    let activePulse = 0;
    if (state.isWorking) {
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const workSec = Math.max(0, (nowPerf - (state.workStartedAt || nowPerf)) / 1000);
      activePulse += 12 + Math.min(14, Math.floor(workSec * 1.5));
    }
    if (state.typingHeatPulse > 0 || state.draftTokens > 0) {
      activePulse += Math.min(14, Math.round(state.typingHeatPulse + Math.min(8, state.draftTokens / 12)));
    }

    const totalHeat = Math.max(0, Math.min(100, Math.round(organicHeat + activePulse + state.bladeBonusHeat)));
    state.bladeHeat = totalHeat;

    let tier = 'black';
    if (totalHeat >= 75) tier = 'red';
    else if (totalHeat >= 35) tier = 'ember';
    state.bladeTier = tier;

    if (totalHeat === state.lastRenderedBladeHeat && tier === state.lastRenderedBladeTier) {
      return;
    }
    state.lastRenderedBladeHeat = totalHeat;
    state.lastRenderedBladeTier = tier;

    if (typeof document !== 'undefined' && document.documentElement) {
      if (tier === 'red') {
        document.documentElement.dataset.agyRedBlade = '1';
      } else {
        delete document.documentElement.dataset.agyRedBlade;
      }
    }

    if (state.bladeBtnEl) {
      state.bladeBtnEl.dataset.tier = tier;
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
        kj.setAttribute('lang', 'ja');
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
      setTextIfChanged(state.detBladeVal, desc);
    }

    refreshBladeCompactUi();
  }

  /* ==========================================================================
   * NICHIRIN BLADE /compact TRIGGER & 380K AUTO-COMPACT ENGINE
   * ========================================================================== */

  function getTrackableCompactCid() {
    if (state.resolvedCid && state.resolvedCid !== 'idle' && state.resolvedCid !== 'latest') {
      return state.resolvedCid;
    }
    if (state.cid && state.cid !== 'idle' && state.cid !== 'latest') {
      return state.cid;
    }
    return '';
  }

  function persistCompactHistory(cidOverride) {
    const cid = cidOverride || getTrackableCompactCid();
    if (!cid) return;
    if (!state.autoCompactDisarmed && !state.autoCompactLastAt && !state.compactLastFailed) {
      compactHistoryByCid.delete(cid);
      return;
    }
    compactHistoryByCid.delete(cid);
    compactHistoryByCid.set(cid, {
      disarmed: Boolean(state.autoCompactDisarmed),
      lastAutoAt: Number(state.autoCompactLastAt) || 0,
      triggeredCtx: Number(state.autoCompactTriggeredCtx) || 0,
      triggeredTurn: Number(state.autoCompactTriggeredTurn) || 0,
      failed: Boolean(state.compactLastFailed)
    });
    while (compactHistoryByCid.size > MAX_COMPACT_HISTORY_CIDS) {
      const oldestKey = compactHistoryByCid.keys().next().value;
      if (oldestKey === undefined) break;
      compactHistoryByCid.delete(oldestKey);
    }
  }

  function restoreCompactHistory(cid) {
    if (!cid || cid === 'idle' || cid === 'latest') return false;
    const rec = compactHistoryByCid.get(cid);
    if (!rec) return false;
    state.autoCompactDisarmed = Boolean(rec.disarmed);
    state.autoCompactLastAt = Number(rec.lastAutoAt) || 0;
    state.autoCompactTriggeredCtx = Number(rec.triggeredCtx) || 0;
    state.autoCompactTriggeredTurn = Number(rec.triggeredTurn) || 0;
    state.compactLastFailed = Boolean(rec.failed);
    return true;
  }

  function clearCompactTimers() {
    if (state.autoCompactTimer) {
      clearTimeout(state.autoCompactTimer);
      state.autoCompactTimer = 0;
    }
    if (Array.isArray(state.compactStepTimers)) {
      while (state.compactStepTimers.length > 0) {
        const tid = state.compactStepTimers.pop();
        clearTimeout(tid);
      }
    }
    state.compactInFlight = false;
  }

  function resetConversationCompactState() {
    clearCompactTimers();
    state.autoCompactPending = false;
    state.autoCompactDisarmed = false;
    state.autoCompactWaitingLiveTurn = false;
    state.autoCompactBaselineCtx = 0;
    state.autoCompactBaselineTurn = 0;
    state.autoCompactBaselineStep = 0;
    state.autoCompactTriggeredCtx = 0;
    state.autoCompactTriggeredTurn = 0;
    state.autoCompactLastAt = 0;
    state.manualCompactLastAt = 0;
    state.compactLastFailed = false;
    state.suppressNextCompactEchoUntil = 0;
  }

  function scheduleCompactStep(fn, delayMs, reqEpoch, reqCidEpoch) {
    let tid = 0;
    tid = setTimeout(() => {
      const idx = state.compactStepTimers.indexOf(tid);
      if (idx >= 0) state.compactStepTimers.splice(idx, 1);
      if (
        reqEpoch !== state.mountEpoch ||
        reqCidEpoch !== state.cidEpoch ||
        !state.barEl ||
        !state.barEl.isConnected
      ) {
        return;
      }
      fn();
    }, delayMs);
    state.compactStepTimers.push(tid);
    return tid;
  }

  function createDomEvent(type, props, ctorName) {
    const init = Object.assign({ bubbles: true, cancelable: true }, props || {});
    if (typeof window !== 'undefined' && ctorName && typeof window[ctorName] === 'function') {
      try {
        return new window[ctorName](type, init);
      } catch (_) {}
    }
    if (typeof window !== 'undefined' && typeof window.Event === 'function') {
      try {
        const ev = new window.Event(type, { bubbles: init.bubbles, cancelable: init.cancelable });
        for (const k of Object.keys(init)) {
          if (k !== 'bubbles' && k !== 'cancelable' && !(k in ev)) {
            try { ev[k] = init[k]; } catch (_) {}
          }
        }
        return ev;
      } catch (_) {}
    }
    return Object.assign({
      type: String(type),
      bubbles: Boolean(init.bubbles),
      cancelable: Boolean(init.cancelable),
      defaultPrevented: false,
      preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
      },
      stopPropagation() {},
      stopImmediatePropagation() {}
    }, init);
  }

  function findComposerEditor(comp) {
    if (!comp || typeof comp.querySelectorAll !== 'function') return null;
    let nodes = [];
    try {
      nodes = Array.from(comp.querySelectorAll('textarea, [contenteditable="true"]'));
    } catch (_) {
      return null;
    }
    const valid = nodes.filter((el) => {
      if (!el || el.disabled || el.readOnly) return false;
      if (typeof el.closest === 'function') {
        if (el.closest(`#${HUD_BAR_ID}`) || el.closest('#agy-shinobu-npc-wrap') || el.closest('agy-hashira-squad')) {
          return false;
        }
      }
      return true;
    });
    if (valid.length === 0) return null;
    return valid.find((el) => isElementVisiblyLaidOut(el)) || valid[0];
  }

  function readEditorText(editor) {
    if (!editor) return '';
    const tag = String(editor.tagName || '').toUpperCase();
    const raw = (tag === 'TEXTAREA' || tag === 'INPUT') && typeof editor.value === 'string'
      ? editor.value
      : (editor.textContent || '');
    return raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }

  function isPopupElementVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.hidden) return false;
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    try {
      if (el.style) {
        if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') {
          return false;
        }
      }
      if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        const cs = window.getComputedStyle(el);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) {
          return false;
        }
      }
    } catch (_) {}
    if (typeof el.getBoundingClientRect === 'function') {
      try {
        const r = el.getBoundingClientRect();
        if (r) {
          if (r.width > 0 || r.height > 0) return true;
          if (r.width === 0 && r.height === 0 && el.clientWidth === 0 && el.clientHeight === 0) {
            return false;
          }
        }
      } catch (_) {}
    }
    return el.offsetParent !== null;
  }

  function findComposerSendButton(comp) {
    if (!comp || typeof comp.querySelectorAll !== 'function') return null;
    let buttons = [];
    try {
      buttons = Array.from(comp.querySelectorAll('button'));
    } catch (_) {
      return null;
    }
    const tier1 = [];
    const tier2 = [];
    const excludedLabelRe = /\b(?:stop|cancel|attach|upload|model|mode|voice|mic|image|file|mention|menu|add|plus|environment|project|branch|setting|option)\b|dừng|hủy|đính kèm|tải lên/i;

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
      if (typeof btn.closest === 'function') {
        if (
          btn.closest(`#${HUD_BAR_ID}`) ||
          btn.closest(`#${ECHO_BAR_ID}`) ||
          btn.closest(`#${HERALD_BAR_ID}`) ||
          btn.closest('#agy-shinobu-npc-wrap') ||
          btn.closest('agy-hashira-squad') ||
          btn.closest('agy-chibi-aura') ||
          btn.classList.contains('agy-chibi-hitbox') ||
          btn.classList.contains('agy-echo-close')
        ) {
          continue;
        }
      }
      if (
        typeof btn.hasAttribute === 'function' &&
        (btn.hasAttribute('aria-haspopup') || btn.hasAttribute('aria-expanded'))
      ) {
        continue;
      }
      const aria = String(btn.getAttribute('aria-label') || btn.title || '').trim().toLowerCase();
      const tid = String(btn.getAttribute('data-testid') || '').trim().toLowerCase();
      if (tid === 'input-cancel-button' || excludedLabelRe.test(aria) || excludedLabelRe.test(tid)) {
        continue;
      }

      const isTier1 =
        /\b(?:send|submit)\b/.test(tid) ||
        /\b(?:send|submit)\b/.test(aria) ||
        /^(?:gửi)(?:\b|\s|$)|gửi\s+(?:tin\s+nhắn|lệnh)/i.test(aria);
      if (isTier1) {
        tier1.push(btn);
        continue;
      }

      const explicitType = typeof btn.getAttribute === 'function'
        ? String(btn.getAttribute('type') || '').trim().toLowerCase()
        : '';
      if (explicitType === 'submit') {
        tier2.push(btn);
      }
    }

    if (tier1.length > 0) {
      return tier1.find((b) => isElementVisiblyLaidOut(b)) || tier1[0];
    }
    if (tier2.length > 0) {
      return tier2.find((b) => isElementVisiblyLaidOut(b)) || tier2[0];
    }
    return null;
  }

  function isExactCompactEditorState(editor) {
    return readEditorText(editor).toLowerCase() === COMPACT_COMMAND;
  }

  function hasVisibleSlashOrPopupMenu() {
    if (typeof document === 'undefined') return false;
    try {
      const menus = document.querySelectorAll('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], [cmdk-list], [data-lexical-typeahead-menu]');
      for (let i = 0; i < menus.length; i++) {
        const m = menus[i];
        if (m && isPopupElementVisible(m) && !(typeof m.closest === 'function' && m.closest(`#${HUD_BAR_ID}`))) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function isSlashMenuOpenForEditor(editor) {
    if (editor && typeof editor.getAttribute === 'function' && editor.getAttribute('aria-expanded') === 'true') {
      return true;
    }
    return hasVisibleSlashOrPopupMenu();
  }

  function matchesCompactSlashItem(item) {
    if (!item || (typeof item.closest === 'function' && item.closest(`#${HUD_BAR_ID}`))) {
      return false;
    }
    const val = typeof item.getAttribute === 'function' ? String(item.getAttribute('data-value') || '').trim() : '';
    const aria = typeof item.getAttribute === 'function' ? String(item.getAttribute('aria-label') || '').trim() : '';
    const title = typeof item.getAttribute === 'function' ? String(item.getAttribute('title') || '').trim() : '';
    if (
      /^\/?compact$/i.test(val) ||
      /(?:^|\s)\/compact(?:\s|$)/i.test(aria) ||
      /(?:^|\s)\/compact(?:\s|$)/i.test(title)
    ) {
      return true;
    }
    const txt = String(item.textContent || '').trim();
    if (/(?:^|\s)\/compact(?:\s|$)/i.test(txt)) {
      return true;
    }
    if (typeof item.querySelectorAll === 'function') {
      try {
        const subNodes = item.querySelectorAll('span, div, code, strong');
        for (let i = 0; i < subNodes.length; i++) {
          const subTxt = String(subNodes[i].textContent || '').trim();
          if (/^\/?compact$/i.test(subTxt)) {
            return true;
          }
        }
      } catch (_) {}
    }
    return false;
  }

  function findVisibleSlashCompactOption(editor) {
    if (typeof document === 'undefined') return null;
    try {
      if (editor && typeof editor.getAttribute === 'function' && typeof document.getElementById === 'function') {
        const activeId = String(editor.getAttribute('aria-activedescendant') || '').trim();
        if (activeId) {
          const activeEl = document.getElementById(activeId);
          if (activeEl && isPopupElementVisible(activeEl) && matchesCompactSlashItem(activeEl)) {
            return activeEl;
          }
        }
        const controlsId = String(editor.getAttribute('aria-controls') || '').trim();
        if (controlsId) {
          const ctrlEl = document.getElementById(controlsId);
          if (ctrlEl && isPopupElementVisible(ctrlEl) && !(typeof ctrlEl.closest === 'function' && ctrlEl.closest(`#${HUD_BAR_ID}`))) {
            const ctrlItems = ctrlEl.querySelectorAll('[role="option"], [role="menuitem"], [cmdk-item], button, li, [tabindex]');
            for (let k = 0; k < ctrlItems.length; k++) {
              if (matchesCompactSlashItem(ctrlItems[k])) {
                return ctrlItems[k];
              }
            }
          }
        }
      }

      const menus = document.querySelectorAll('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], [cmdk-list], [data-lexical-typeahead-menu]');
      for (let i = 0; i < menus.length; i++) {
        const menu = menus[i];
        if (!menu || !isPopupElementVisible(menu) || (typeof menu.closest === 'function' && menu.closest(`#${HUD_BAR_ID}`))) continue;
        const items = menu.querySelectorAll('[role="option"], [role="menuitem"], [cmdk-item], button, li');
        for (let j = 0; j < items.length; j++) {
          if (matchesCompactSlashItem(items[j])) {
            return items[j];
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function collapseSelectionToEnd(editor) {
    if (typeof window === 'undefined' || typeof window.getSelection !== 'function' || typeof document === 'undefined' || typeof document.createRange !== 'function') {
      return;
    }
    try {
      const sel = window.getSelection();
      if (!sel) return;
      const target = editor.firstElementChild || editor;
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  }

  function applySingleContentEditableFallback(editor, cmdText) {
    if (!editor) return '';
    try {
      if (typeof editor.focus === 'function') editor.focus();
    } catch (_) {}

    if (
      typeof window !== 'undefined' &&
      typeof window.ClipboardEvent === 'function' &&
      typeof window.DataTransfer === 'function'
    ) {
      try {
        const dt = new window.DataTransfer();
        dt.setData('text/plain', cmdText);
        editor.dispatchEvent(new window.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        return 'paste_fallback';
      } catch (_) {}
    }

    editor.textContent = cmdText;
    collapseSelectionToEnd(editor);
    editor.dispatchEvent(createDomEvent('input', { inputType: 'insertText', data: cmdText }, 'InputEvent'));
    return 'dom_fallback';
  }

  function insertCommandIntoEditor(editor, cmdText) {
    if (!editor) return '';
    try {
      if (typeof editor.focus === 'function') editor.focus();
    } catch (_) {}

    const tag = String(editor.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      try {
        const proto = tag === 'TEXTAREA'
          ? (typeof HTMLTextAreaElement !== 'undefined' ? HTMLTextAreaElement.prototype : null)
          : (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : null);
        const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
        if (desc && typeof desc.set === 'function') {
          desc.set.call(editor, cmdText);
        } else {
          editor.value = cmdText;
        }
      } catch (_) {
        editor.value = cmdText;
      }
      editor.dispatchEvent(createDomEvent('input', { inputType: 'insertText', data: cmdText }, 'InputEvent'));
      editor.dispatchEvent(createDomEvent('change', {}, 'Event'));
      return 'value_setter';
    }

    if (typeof window !== 'undefined' && typeof window.getSelection === 'function' && typeof document !== 'undefined' && typeof document.createRange === 'function') {
      try {
        const sel = window.getSelection();
        if (sel) {
          if (readEditorText(editor) !== '') {
            const range = document.createRange();
            range.selectNodeContents(editor);
            sel.removeAllRanges();
            sel.addRange(range);
          } else if (sel.rangeCount === 0 || (typeof editor.contains === 'function' && !editor.contains(sel.anchorNode))) {
            collapseSelectionToEnd(editor);
          }
        }
      } catch (_) {}
    }

    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      try {
        document.execCommand('insertText', false, cmdText);
      } catch (_) {}
      return 'execCommand';
    }

    editor.textContent = cmdText;
    collapseSelectionToEnd(editor);
    editor.dispatchEvent(createDomEvent('input', { inputType: 'insertText', data: cmdText }, 'InputEvent'));
    return 'dom_fallback';
  }

  function dispatchEnterKey(editor) {
    if (!editor) return;
    const keyProps = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    editor.dispatchEvent(createDomEvent('keydown', keyProps, 'KeyboardEvent'));
    editor.dispatchEvent(createDomEvent('keypress', keyProps, 'KeyboardEvent'));
    editor.dispatchEvent(createDomEvent('keyup', keyProps, 'KeyboardEvent'));
  }

  function refreshBladeCompactUi() {
    if (state.bladeBtnEl) {
      state.bladeBtnEl.dataset.autoCompact = '0';
      if (state.compactInFlight) {
        state.bladeBtnEl.dataset.compacting = '1';
      } else {
        delete state.bladeBtnEl.dataset.compacting;
      }
      delete state.bladeBtnEl.dataset.compactReady;

      const tier = state.bladeTier || 'black';
      const totalHeat = Math.max(0, Math.round(state.bladeHeat || 0));
      const tierNameVi = tier === 'red'
        ? 'Hách Đao Khai Mở (赫刀)'
        : tier === 'ember'
        ? 'Nhiệt Hồng Đao'
        : 'Hắc Thiết Nhật Luân Đao';
      let compactHint = 'Tự động nén: Đã tắt';
      if (state.compactInFlight) {
        compactHint = 'Đang nén phiên (/compact)...';
      } else if (state.compactLastFailed) {
        compactHint = 'Cần nhấn Enter để hoàn tất /compact';
      }
      const nextTitle = `Rèn Nhật Luân Kiếm: ${tierNameVi} (${totalHeat}%) • ${compactHint} • Nhấn: Nén tay /compact`;
      if (state.bladeBtnEl.title !== nextTitle) {
        state.bladeBtnEl.title = nextTitle;
      }
      if (state.bladeBtnEl.getAttribute('aria-label') !== nextTitle) {
        state.bladeBtnEl.setAttribute('aria-label', nextTitle);
      }
    }

    if (state.detCompactVal) {
      let statusTxt = 'Tự động nén: Đã tắt (Nhấn thanh kiếm để nén tay)';
      if (state.compactInFlight) {
        statusTxt = 'Đang gửi lệnh nén /compact...';
      } else if (state.compactLastFailed) {
        statusTxt = 'Cần nhấn Enter để hoàn tất /compact';
      }
      setTextIfChanged(state.detCompactVal, statusTxt);
    }
  }

  function finishCompactDispatch(opts = {}) {
    const failed = Boolean(opts && opts.failed);
    const disarmOnSuccess = Boolean(opts && opts.disarmOnSuccess);
    clearCompactTimers();
    state.compactLastFailed = failed;
    if (failed) {
      state.autoCompactDisarmed = false;
    } else if (disarmOnSuccess) {
      state.autoCompactDisarmed = true;
      state.autoCompactLastAt = Date.now();
      state.autoCompactTriggeredCtx = Math.max(0, Math.round(state.serverCtxTokens || 0));
      state.autoCompactTriggeredTurn = state.serverTurnCount || 0;
    }
    persistCompactHistory();
    refreshBladeCompactUi();
    renderDomValues();
  }

  function triggerCompactSession(opts = {}) {
    const source = opts && opts.source === 'auto' ? 'auto' : 'manual';
    const isAuto = source === 'auto';
    if (isAuto) {
      return { ok: false, reason: 'disabled' };
    }

    if (!state.barEl || !state.barEl.isConnected) {
      return { ok: false, reason: 'not_mounted' };
    }
    const comp = state.composer || resolveComposerRoot();
    if (!comp || !comp.isConnected) {
      return { ok: false, reason: 'no_composer' };
    }
    if (state.compactInFlight) {
      return { ok: false, reason: 'in_flight' };
    }

    const now = Date.now();
    const liveSig = extractLivePageSignals(comp);
    const workingNow = Boolean(liveSig.isWorking || state.isWorking || state.serverIsWorking);
    if (workingNow) {
      showUserMessageEcho('AI đang xử lý — vui lòng chờ hoàn tất rồi bấm nén (/compact)');
      return { ok: false, reason: 'working' };
    }

    if (state.manualCompactLastAt > 0 && (now - state.manualCompactLastAt) < MANUAL_COMPACT_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }

    const editor = findComposerEditor(comp);
    if (!editor) {
      showUserMessageEcho('Không tìm thấy khung nhập để gửi lệnh /compact');
      return { ok: false, reason: 'no_editor' };
    }

    const existingText = readEditorText(editor);
    if (existingText && existingText !== COMPACT_COMMAND) {
      showUserMessageEcho('Ô chat đang có nội dung nháp — hãy gửi hoặc xóa trước khi nén (/compact)');
      return { ok: false, reason: 'has_draft' };
    }

    if (state.autoCompactTimer) {
      clearTimeout(state.autoCompactTimer);
      state.autoCompactTimer = 0;
    }
    state.autoCompactPending = false;
    state.compactLastFailed = false;
    state.compactInFlight = true;
    state.manualCompactLastAt = now;
    persistCompactHistory();

    state.suppressNextCompactEchoUntil = now + 900;
    showUserMessageEcho('Đang nén phiên (/compact) theo lệnh Chủ nhân...');
    refreshBladeCompactUi();

    const reqEpoch = state.mountEpoch;
    const reqCidEpoch = state.cidEpoch;
    const insertMethod = existingText === COMPACT_COMMAND
      ? 'existing'
      : insertCommandIntoEditor(editor, COMPACT_COMMAND);

    let submittedVia = '';
    let clickedSendBtn = null;
    const shouldDisarmManual = false;

    scheduleCompactStep(() => {
      if (!state.compactInFlight) return;
      const curComp = state.composer || resolveComposerRoot() || comp;
      const curSig = curComp ? extractLivePageSignals(curComp) : { isWorking: false };
      if (state.isWorking || state.serverIsWorking || curSig.isWorking) {
        finishCompactDispatch({ failed: false, disarmOnSuccess: shouldDisarmManual });
        return;
      }
      if (insertMethod === 'execCommand' && readEditorText(editor) === '') {
        applySingleContentEditableFallback(editor, COMPACT_COMMAND);
      }
    }, 70, reqEpoch, reqCidEpoch);

    scheduleCompactStep(() => {
      if (!state.compactInFlight) return;
      const curComp = state.composer || resolveComposerRoot() || comp;
      const curSig = curComp ? extractLivePageSignals(curComp) : { isWorking: false };
      if (state.isWorking || state.serverIsWorking || curSig.isWorking) {
        finishCompactDispatch({ failed: false, disarmOnSuccess: shouldDisarmManual });
        return;
      }
      const curText = readEditorText(editor);
      if (!curText) {
        finishCompactDispatch({ failed: false, disarmOnSuccess: shouldDisarmManual });
        return;
      }
      if (!isExactCompactEditorState(editor)) {
        finishCompactDispatch({ failed: true, disarmOnSuccess: false });
        showUserMessageEcho('Phát hiện nội dung ô chat không khớp /compact — đã dừng gửi tự động để tránh gửi nhầm');
        return;
      }
      const optEl = findVisibleSlashCompactOption(editor);
      if (optEl && typeof optEl.click === 'function') {
        submittedVia = 'slash_opt';
        optEl.click();
        return;
      }
      if (isSlashMenuOpenForEditor(editor)) {
        submittedVia = 'slash_enter';
        dispatchEnterKey(editor);
        return;
      }
      const sendBtn = findComposerSendButton(curComp);
      if (sendBtn && typeof sendBtn.click === 'function') {
        submittedVia = 'send_btn';
        clickedSendBtn = sendBtn;
        sendBtn.click();
        return;
      }
      submittedVia = 'enter';
      dispatchEnterKey(editor);
    }, 200, reqEpoch, reqCidEpoch);

    scheduleCompactStep(() => {
      if (!state.compactInFlight) return;
      const curComp = state.composer || resolveComposerRoot() || comp;
      const curSig = curComp ? extractLivePageSignals(curComp) : { isWorking: false };
      if (!readEditorText(editor) || state.isWorking || state.serverIsWorking || curSig.isWorking) {
        finishCompactDispatch({ failed: false, disarmOnSuccess: shouldDisarmManual });
        return;
      }
      if (!isExactCompactEditorState(editor)) {
        finishCompactDispatch({ failed: true, disarmOnSuccess: false });
        showUserMessageEcho('Phát hiện nội dung ô chat không khớp /compact — đã dừng gửi tự động để tránh gửi nhầm');
        return;
      }
      if (submittedVia === 'slash_opt' || submittedVia === 'slash_enter') {
        if (isSlashMenuOpenForEditor(editor)) return;
        const sendBtn = findComposerSendButton(curComp);
        if (sendBtn && typeof sendBtn.click === 'function') {
          clickedSendBtn = sendBtn;
          sendBtn.click();
        } else {
          const anyComposerSubmit = curComp && typeof curComp.querySelector === 'function'
            ? curComp.querySelector('button[aria-label*="send" i], button[aria-label*="submit" i], button[data-testid*="send" i], button[data-testid*="submit" i]')
            : null;
          if (!anyComposerSubmit) {
            dispatchEnterKey(editor);
          }
        }
      } else if (submittedVia === 'send_btn') {
        const canRetryEnter = Boolean(
          clickedSendBtn &&
          clickedSendBtn.isConnected &&
          !clickedSendBtn.disabled &&
          clickedSendBtn.getAttribute('aria-disabled') !== 'true'
        );
        if (canRetryEnter) {
          dispatchEnterKey(editor);
        }
      } else if (submittedVia === 'enter') {
        const sendBtn = findComposerSendButton(curComp);
        if (sendBtn && typeof sendBtn.click === 'function') {
          clickedSendBtn = sendBtn;
          sendBtn.click();
        }
      }
    }, 460, reqEpoch, reqCidEpoch);

    scheduleCompactStep(() => {
      if (!state.compactInFlight) return;
      const curComp = state.composer || resolveComposerRoot() || comp;
      const curSig = curComp ? extractLivePageSignals(curComp) : { isWorking: false };
      const workingAfter = Boolean(state.isWorking || state.serverIsWorking || curSig.isWorking);
      const stillStuck = !workingAfter && readEditorText(editor) !== '';
      finishCompactDispatch({ failed: stillStuck, disarmOnSuccess: !stillStuck && shouldDisarmManual });
      if (stillStuck) {
        showUserMessageEcho('Chưa thể tự gửi /compact — vui lòng nhấn Enter trong ô chat để nén phiên');
      }
    }, 860, reqEpoch, reqCidEpoch);

    return { ok: true, source, threshold: AUTO_COMPACT_THRESHOLD };
  }

  function evaluateAutoCompact() {
    if (state.autoCompactTimer) {
      clearTimeout(state.autoCompactTimer);
      state.autoCompactTimer = 0;
    }
    state.autoCompactEnabled = false;
    state.autoCompactPending = false;
    state.autoCompactDisarmed = false;
    state.autoCompactWaitingLiveTurn = false;

    if (state.compactLastFailed && state.barEl && state.barEl.isConnected) {
      const comp = state.composer || resolveComposerRoot();
      const editor = comp ? findComposerEditor(comp) : null;
      const liveDraft = editor ? readEditorText(editor) : '';
      if (liveDraft !== COMPACT_COMMAND) {
        state.compactLastFailed = false;
        persistCompactHistory();
      }
    }

    refreshBladeCompactUi();
  }

  function setAutoCompactEnabled(nextEnabled, opts = {}) {
    state.autoCompactEnabled = false;
    writeAutoCompactPref(false);
    state.autoCompactPending = false;
    state.autoCompactDisarmed = false;
    state.autoCompactWaitingLiveTurn = false;
    if (state.autoCompactTimer) {
      clearTimeout(state.autoCompactTimer);
      state.autoCompactTimer = 0;
    }
    refreshBladeCompactUi();
    if (!(opts && opts.silent)) {
      showUserMessageEcho('Tự động nén phiên đã được tắt (nhấn thanh kiếm nếu muốn nén tay)');
    }
    return false;
  }

  function toggleAutoCompactMode() {
    return setAutoCompactEnabled(false);
  }

  function applyCrisisVisual(isCrisis) {
    const prevCrisis = state.crisisState;
    state.crisisState = Boolean(isCrisis);
    if (typeof window !== 'undefined' && window.__AGY_KNY_CHIBI_AURA__) {
      try {
        if (typeof window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState({ crisis: state.crisisState });
        }
        if (state.crisisState && !prevCrisis && typeof window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction('crisis', 2000);
        }
      } catch (_) {}
    }
    if (state.crisisState && !prevCrisis && state.hasTelemetry) {
      summonKasugaiHerald({
        reason: 'crisis_onset',
        urgent: true,
        message: 'Khẩn báo: Phát hiện lỗi hoặc xung đột cần kiểm tra ngay!'
      });
    }
    const comp = state.composer || resolveComposerRoot();
    if (!comp || !comp.dataset) return;
    if (state.crisisState) {
      comp.dataset.agyCrisis = '1';
    } else {
      delete comp.dataset.agyCrisis;
    }
  }

  /* ==========================================================================
   * v3.5 SMART KASUGAI / CHUNTARO / KABURAMARU HERALD ENGINE
   * ========================================================================== */

  const HERALD_CHAR_RULES = [
    { id: 'zenitsu', re: /\b(?:zenitsu|thunder_flash|agatsuma)\b/, kind: 'chuntaro', name: 'Chim Sẻ Chuntaro', chimeKind: 'chuntaro', primary: '#facc15', accent: '#fef08a' },
    { id: 'obanai', re: /\b(?:obanai|serpent_prism|iguro)\b/, kind: 'kaburamaru', name: 'Bạch Xà Kaburamaru', chimeKind: 'kaburamaru', primary: '#a855f7', accent: '#f43f5e' },
    { id: 'shinobu', re: /\b(?:shinobu|butterfly|insect|kocho)\b/, kind: 'butterfly_crow', name: 'Quạ Kasugai Điệp Vũ', chimeKind: 'butterfly', primary: '#c084fc', accent: '#5eead4' },
    { id: 'mitsuri', re: /\b(?:mitsuri|love_sakura|kanroji)\b/, kind: 'clover_crow', name: 'Quạ Urara Cỏ Bốn Lá', chimeKind: 'clover', primary: '#f472b6', accent: '#86efac' },
    { id: 'muichiro', re: /\b(?:muichiro|mist_sea|tokito)\b/, kind: 'ginko_crow', name: 'Quạ Ginko Hàng Mi Dài', chimeKind: 'crow', primary: '#67e8f9', accent: '#ccfbf1' },
    { id: 'ubuyashiki', re: /\b(?:ubuyashiki|kagaya|royal_wisteria|wisteria_royal)\b/, kind: 'royal_crow', name: 'Quạ Chúa Công Khăn Tím', chimeKind: 'crow', primary: '#d8b4fe', accent: '#fde047' },
    { id: 'nezuko', re: /\b(?:nezuko|pink_flame)\b/, kind: 'nezuko_ribbon', name: 'Cánh Én Hồng Liên Nezuko', chimeKind: 'ribbon', primary: '#fb7185', accent: '#86efac' },
    { id: 'shadow_monarch', re: /\b(?:shadow_monarch|jinwoo|arise)\b/, kind: 'shadow_raven', name: 'Quạ Bóng Đêm Kaisel', chimeKind: 'crow', primary: '#8b5cf6', accent: '#38bdf8' },
    { id: 'six_eyes', re: /\b(?:six_eyes|gojo|limitless)\b/, kind: 'six_eyes_shikigami', name: 'Thức Thần Lục Nhãn', chimeKind: 'butterfly', primary: '#38bdf8', accent: '#e0f2fe' },
    { id: 'great_sage', re: /\b(?:great_sage|raphael|rimuru)\b/, kind: 'great_sage_prism', name: 'Lăng Kính Đại Hiền Giả', chimeKind: 'butterfly', primary: '#22d3ee', accent: '#fde047' },
    { id: 'giyu', re: /\b(?:giyu|water_calm|tomioka)\b/, kind: 'kasugai_crow', name: 'Quạ Già Kanzaburo', chimeKind: 'crow', primary: '#38bdf8', accent: '#bae6fd' },
    { id: 'rengoku', re: /\b(?:rengoku|flame_ember|kyojuro)\b/, kind: 'kasugai_crow', name: 'Quạ Hỏa Viêm Kaname', chimeKind: 'crow', primary: '#f97316', accent: '#fde047' },
    { id: 'tanjiro', re: /\b(?:tanjiro|hinokami|water_dragon)\b/, kind: 'kasugai_crow', name: 'Quạ Matsuemon Truyền Tin', chimeKind: 'crow', primary: '#10b981', accent: '#ef4444' },
    { id: 'uzui', re: /\b(?:uzui|sound_fireworks|tengen)\b/, kind: 'kasugai_crow', name: 'Quạ Nạm Ngọc Nijimaru', chimeKind: 'crow', primary: '#f43f5e', accent: '#facc15' },
    { id: 'sanemi', re: /\b(?:sanemi|wind_gale|shinazugawa)\b/, kind: 'kasugai_crow', name: 'Quạ Phong Sát Sorai', chimeKind: 'crow', primary: '#4ade80', accent: '#dcfce7' },
    { id: 'gyomei', re: /\b(?:gyomei|stone_mantra|himejima)\b/, kind: 'kasugai_crow', name: 'Quạ Nham Thạch Zekka', chimeKind: 'crow', primary: '#eab308', accent: '#fef08a' },
    { id: 'inosuke', re: /\b(?:inosuke|beast_fangs)\b/, kind: 'kasugai_crow', name: 'Quạ Hạt Dẻ Donguri', chimeKind: 'crow', primary: '#60a5fa', accent: '#bfdbfe' },
    { id: 'yoriichi', re: /\b(?:yoriichi|sun_halo|crimson_sun)\b/, kind: 'kasugai_crow', name: 'Quạ Thái Dương Khai Tổ', chimeKind: 'crow', primary: '#ef4444', accent: '#fde047' }
  ];

  function resolveHeraldCompanion(themeCfgOverride, themeKeyOverride) {
    const cfg = themeCfgOverride || state.themeCfg || {};
    const hint = `${themeKeyOverride || state.themeKeyHint || ''} ${cfg.fxMode || ''} ${cfg.concept || ''} ${cfg.name || ''}`.toLowerCase();
    for (let i = 0; i < HERALD_CHAR_RULES.length; i++) {
      const r = HERALD_CHAR_RULES[i];
      if (r.re.test(hint)) {
        return {
          charId: r.id,
          kind: r.kind,
          name: r.name,
          chimeKind: r.chimeKind,
          primary: cfg.primary || r.primary,
          accent: cfg.accent || cfg.secondary || r.accent
        };
      }
    }
    return {
      charId: 'shinobu',
      kind: 'kasugai_crow',
      name: 'Quạ Kasugai Truyền Tin',
      chimeKind: 'crow',
      primary: cfg.primary || '#c084fc',
      accent: cfg.accent || '#5eead4'
    };
  }

  function buildHeraldCompanionSvg(comp) {
    const c = comp || resolveHeraldCompanion();
    const p = sanitizeCssColorToken(c.primary, '#c084fc');
    const a = sanitizeCssColorToken(c.accent, '#fde047');

    if (c.kind === 'chuntaro') {
      return (
        `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">` +
        `<ellipse cx="12" cy="13.5" rx="7.2" ry="6.4" fill="#d69e66" stroke="#78350f" stroke-width="1"/>` +
        `<ellipse cx="12" cy="15.2" rx="4.8" ry="3.8" fill="#fef3c7"/>` +
        `<path d="M5.2 12.8 Q8.2 9.5 10.6 13.8" fill="#92400e"/>` +
        `<path d="M18.8 12.8 Q15.8 9.5 13.4 13.8" fill="#92400e"/>` +
        `<circle cx="9.6" cy="11.4" r="1.15" fill="#1e1b4b"/><circle cx="14.4" cy="11.4" r="1.15" fill="#1e1b4b"/>` +
        `<circle cx="8.1" cy="13.2" r="1.1" fill="#fb7185" opacity="0.82"/><circle cx="15.9" cy="13.2" r="1.1" fill="#fb7185" opacity="0.82"/>` +
        `<polygon points="12,11.8 10.7,13.4 13.3,13.4" fill="#f59e0b"/>` +
        `<path d="M11.6 4.2 L10.2 7.2 L12.2 7.2 L11.1 9.6" fill="none" stroke="${p}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</svg>`
      );
    }
    if (c.kind === 'kaburamaru') {
      return (
        `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">` +
        `<path d="M5.5 17.5 C4.2 13.2 8.8 11.4 12.4 13.6 C16.2 15.8 19.4 12.8 17.6 8.6 C16.4 6.2 12.6 5.8 11.2 8.2" fill="none" stroke="#f8fafc" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="M5.5 17.5 C4.2 13.2 8.8 11.4 12.4 13.6 C16.2 15.8 19.4 12.8 17.6 8.6" fill="none" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="1.5 2"/>` +
        `<ellipse cx="11.2" cy="8.4" rx="3.1" ry="2.3" fill="#ffffff" stroke="#94a3b8" stroke-width="0.9"/>` +
        `<circle cx="10.1" cy="8.1" r="0.85" fill="#e11d48"/><circle cx="12.3" cy="8.1" r="0.85" fill="#e11d48"/>` +
        `<path d="M11.2 10.7 L11.2 12.6 M11.2 12.6 L10.4 13.5 M11.2 12.6 L12.0 13.5" stroke="#f43f5e" stroke-width="0.85" stroke-linecap="round"/>` +
        `</svg>`
      );
    }
    if (c.kind === 'nezuko_ribbon') {
      return (
        `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">` +
        `<path d="M12 11.5 C7.2 5.8 3.2 8.5 6.4 13.4 C4.8 16.5 8.5 18.2 12 14.2 C15.5 18.2 19.2 16.5 17.6 13.4 C20.8 8.5 16.8 5.8 12 11.5 Z" fill="${p}" stroke="#ffe4e6" stroke-width="0.9"/>` +
        `<rect x="8.2" y="10.6" width="7.6" height="2.8" rx="1.3" fill="#22c55e" stroke="#dcfce7" stroke-width="0.7"/>` +
        `</svg>`
      );
    }
    if (c.kind === 'great_sage_prism' || c.kind === 'six_eyes_shikigami') {
      return (
        `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">` +
        `<polygon points="12,3 20,12 12,21 4,12" fill="rgba(56,189,248,0.28)" stroke="${p}" stroke-width="1.4"/>` +
        `<polygon points="12,6.5 16.8,12 12,17.5 7.2,12" fill="${a}" opacity="0.85"/>` +
        `</svg>`
      );
    }
    // Crow family (Butterfly Crow, Clover Urara, Eyelash Ginko, Royal Scarf, Kaisel, Kasugai Crow)
    const crestExtra = c.kind === 'butterfly_crow'
      ? `<path d="M15.2 5.2 C17.8 3.0 19.8 5.2 17.4 7.4 C19.4 8.8 17.6 10.4 15.4 8.2 Z" fill="${p}" stroke="${a}" stroke-width="0.65"/>`
      : c.kind === 'clover_crow'
      ? `<circle cx="15.5" cy="5.2" r="1.4" fill="#4ade80"/><circle cx="17.5" cy="6.4" r="1.4" fill="#4ade80"/><circle cx="14.6" cy="7.1" r="1.4" fill="#fb7185"/>`
      : c.kind === 'ginko_crow'
      ? `<path d="M8.1 9.0 L6.8 7.7 M9.1 8.6 L8.4 7.1" stroke="${a}" stroke-width="0.9" stroke-linecap="round"/>`
      : c.kind === 'royal_crow'
      ? `<path d="M8.2 14.8 Q12 17.2 15.8 14.8 L16.8 18.2 L14.4 17.6" fill="#a855f7" stroke="#fde047" stroke-width="0.75"/>`
      : `<circle cx="12" cy="15.6" r="1.35" fill="${a}" stroke="${p}" stroke-width="0.7"/>`;

    const eyeColor = c.kind === 'shadow_raven' ? '#38bdf8' : '#f8fafc';
    return (
      `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">` +
      `<path d="M3.5 13.5 Q7.2 8.2 11.4 11.8 L12.6 11.8 Q16.8 8.2 20.5 13.5 Q16.6 14.6 14.8 16.5 L9.2 16.5 Q7.4 14.6 3.5 13.5 Z" fill="#1e293b" stroke="${p}" stroke-width="0.95"/>` +
      `<circle cx="12" cy="10.2" r="4.1" fill="#0f172a" stroke="#475569" stroke-width="0.8"/>` +
      `<circle cx="10.4" cy="9.8" r="0.9" fill="${eyeColor}"/><circle cx="13.6" cy="9.8" r="0.9" fill="${eyeColor}"/>` +
      `<polygon points="12,10.5 10.6,12.5 13.4,12.5" fill="#fbbf24"/>` +
      crestExtra +
      `</svg>`
    );
  }

  function sanitizeCssColorToken(val, fallback) {
    const s = String(val || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(s) || /^rgba?\([0-9.,\s%]+\)$/.test(s)) return s;
    return fallback;
  }

  function isMainChatScrolledAway(thresholdPx = 320) {
    if (typeof document === 'undefined') return false;
    try {
      const candidates = [
        document.querySelector('[data-main-content-body="true"]'),
        state.composer ? resolveConversationPaneRoot(state.composer) : null
      ].filter(Boolean);
      for (let i = 0; i < candidates.length; i++) {
        let cur = candidates[i];
        let depth = 0;
        while (cur && depth < 5) {
          const sh = Number(cur.scrollHeight) || 0;
          const ch = Number(cur.clientHeight) || 0;
          const st = Number(cur.scrollTop) || 0;
          if (sh - ch > 80 && (sh - st - ch) > thresholdPx) {
            return true;
          }
          cur = cur.firstElementChild || null;
          depth++;
        }
      }
      const rootNodes = Array.from(document.querySelectorAll('[data-main-content-body="true"] *'));
      for (let j = 0; j < rootNodes.length && j < 48; j++) {
        const el = rootNodes[j];
        const sh = Number(el.scrollHeight) || 0;
        const ch = Number(el.clientHeight) || 0;
        if (sh - ch > 160) {
          const gap = sh - (Number(el.scrollTop) || 0) - ch;
          if (gap > thresholdPx) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function findPendingApprovalButton() {
    if (typeof document === 'undefined') return null;
    try {
      const root = document.querySelector('[data-main-content-body="true"]') || document.body;
      if (!root) return null;
      const btns = root.querySelectorAll('button:not([disabled])');
      const approvalRe = /^(?:proceed|approve|accept|allow|run command|confirm|tiếp tục thực hiện|phê duyệt|chấp nhận)$/i;
      for (let i = btns.length - 1; i >= 0; i--) {
        const b = btns[i];
        if (!b || b.closest(`#${HUD_BAR_ID}, #${HERALD_BAR_ID}, #agy-shinobu-npc-wrap, .surface-composer`)) continue;
        const txt = String(b.textContent || '').trim();
        if (txt.length > 0 && txt.length <= 28 && approvalRe.test(txt)) {
          return b;
        }
      }
    } catch (_) {}
    return null;
  }

  function scrollToHeraldTarget() {
    if (typeof document === 'undefined') return false;
    let target = findPendingApprovalButton();
    if (!target) {
      const responses = document.querySelectorAll('[data-main-content-body="true"] [data-testid="agent-response"], [data-testid="agent-response"]');
      if (responses.length > 0) {
        target = responses[responses.length - 1];
      }
    }
    if (!target) return false;

    if (typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__ && typeof window.__AGY_BIO_AUDIO__.playBiwaPluck === 'function') {
      try { window.__AGY_BIO_AUDIO__.playBiwaPluck({ semitone: 2 }); } catch (_) {}
    }

    try {
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      target.classList.add('agy-herald-target-glow');
      clearTimeout(state.heraldGlowTimer);
      state.heraldGlowTimer = setTimeout(() => {
        state.heraldGlowTimer = 0;
        try { target.classList.remove('agy-herald-target-glow'); } catch (_) {}
      }, 1250);
    } catch (_) {}
    return true;
  }

  function dismissKasugaiHerald() {
    clearTimeout(state.heraldTimer);
    state.heraldTimer = 0;
    state.heraldVisible = false;
    if (state.heraldEl) {
      delete state.heraldEl.dataset.visible;
      delete state.heraldEl.dataset.urgent;
    }
  }

  function summonKasugaiHerald(rawOpts) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    if (!state.heraldEl || !state.heraldEl.isConnected) return { ok: false, reason: 'unmounted' };

    const now = Date.now();
    const force = Boolean(opts.force);
    if (!force && now - state.heraldLastShownAt < HERALD_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }

    const comp = resolveHeraldCompanion(opts.themeCfg, opts.themeKey);
    state.heraldKind = comp.kind;
    state.heraldCharId = comp.charId;
    state.heraldCompanionName = comp.name;
    state.heraldLastShownAt = now;
    state.heraldLastTriggerReason = String(opts.reason || 'manual');
    state.heraldVisible = true;

    if (state.heraldSvgSlotEl) {
      state.heraldSvgSlotEl.innerHTML = buildHeraldCompanionSvg(comp);
    }
    if (state.heraldTitleEl) {
      state.heraldTitleEl.textContent = `${comp.name} truyền tin`;
    }
    if (state.heraldMsgEl) {
      state.heraldMsgEl.textContent = String(opts.message || 'Phản hồi đã hoàn tất — nhấn để cuộn tới ngay!');
    }

    state.heraldEl.dataset.kind = comp.kind;
    state.heraldEl.dataset.charId = comp.charId;
    if (opts.urgent) state.heraldEl.dataset.urgent = '1';
    else delete state.heraldEl.dataset.urgent;
    state.heraldEl.dataset.visible = '1';

    if (!opts.silent && typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__ && typeof window.__AGY_BIO_AUDIO__.playKasugaiHeraldChime === 'function') {
      try {
        window.__AGY_BIO_AUDIO__.playKasugaiHeraldChime(comp.chimeKind, { force: Boolean(opts.forceAudio) });
      } catch (_) {}
    }

    clearTimeout(state.heraldTimer);
    const hideMs = Math.max(1200, Number(opts.durationMs) || HERALD_AUTO_HIDE_MS);
    state.heraldTimer = setTimeout(() => {
      dismissKasugaiHerald();
    }, hideMs);

    return {
      ok: true,
      kind: comp.kind,
      charId: comp.charId,
      companionName: comp.name,
      reason: state.heraldLastTriggerReason
    };
  }

  function evaluateSmartHeraldOnTurnTransition(wasWorking, nowWorking, firstSync) {
    const nowEpoch = Date.now();
    if (firstSync) {
      state.liveTurnWasWorking = Boolean(nowWorking);
      state.liveTurnWorkStartedMs = nowWorking ? nowEpoch : 0;
      return null;
    }

    if (nowWorking && !wasWorking) {
      state.liveTurnWorkStartedMs = nowEpoch;
      state.liveTurnWasWorking = true;
      dismissKasugaiHerald();
      return null;
    }

    if (!nowWorking && wasWorking) {
      const started = state.liveTurnWorkStartedMs || nowEpoch;
      const elapsedMs = Math.max(0, nowEpoch - started);
      state.liveTurnWasWorking = false;
      state.liveTurnWorkStartedMs = 0;

      const isUnfocused = typeof document !== 'undefined' && (
        Boolean(document.hidden) ||
        (typeof document.hasFocus === 'function' ? !document.hasFocus() : false)
      );
      const isScrolledAway = isMainChatScrolledAway(320);
      const pendingBtn = findPendingApprovalButton();

      if (pendingBtn) {
        const lbl = String(pendingBtn.textContent || 'Proceed').trim();
        return summonKasugaiHerald({
          reason: 'pending_approval',
          urgent: true,
          message: `Đang chờ lệnh xác nhận (${lbl}) — nhấn để nhảy tới!`
        });
      }
      if (elapsedMs >= HERALD_LONG_TURN_MS) {
        const sec = Math.max(12, Math.round(elapsedMs / 1000));
        return summonKasugaiHerald({
          reason: 'long_task_done',
          message: `Nhiệm vụ ${sec}s đã hoàn tất — nhấn để xem kết quả!`
        });
      }
      if (isUnfocused || isScrolledAway) {
        return summonKasugaiHerald({
          reason: isUnfocused ? 'window_unfocused' : 'scrolled_away',
          message: 'Phản hồi mới vừa sẵn sàng ở cuối cuộc trò chuyện!'
        });
      }
    } else if (!nowWorking) {
      const pendingBtn = findPendingApprovalButton();
      if (pendingBtn) {
        const sig = String(pendingBtn.textContent || '').trim();
        if (sig && sig !== state.heraldLastApprovalSig) {
          state.heraldLastApprovalSig = sig;
          return summonKasugaiHerald({
            reason: 'pending_approval',
            urgent: true,
            message: `Đang chờ xác nhận (${sig}) — nhấn để mở tới nút!`
          });
        }
      } else {
        state.heraldLastApprovalSig = '';
      }
    }
    return null;
  }

  function shouldSuppressFullscreenFinisher() {
    try {
      if (typeof window !== 'undefined' && window.__AGY_AUTO_FINISHER__ === false) {
        return true;
      }
      if (typeof document !== 'undefined' && document.activeElement) {
        const ae = document.activeElement;
        const tag = String(ae.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'INPUT' || ae.isContentEditable) {
          return true;
        }
        if (typeof ae.closest === 'function' && ae.closest('.monaco-editor, .xterm, [contenteditable="true"]')) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function executeDemonSlayCelebration(slashSeq, slashReason) {
    // 1. Immediately clear crisis blood demon border
    applyCrisisVisual(false);
    if (typeof window !== 'undefined' && window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction === 'function') {
      try { window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction('victory', 2200); } catch (_) {}
    }

    // 2. Grant +25% Bright Red Blade forge heat bonus
    state.bladeBonusHeat = Math.min(100, state.bladeBonusHeat + 25);
    state.bonusHoldUntil = Date.now() + 18000;
    computeAndApplyBladeHeat();

    const reasonVi = formatSlashReasonVi(slashReason);

    // 3. Auto-trigger Ultimate Finisher Slash (guarded when typing in Monaco/Terminal or disabled by user!)
    if (!shouldSuppressFullscreenFinisher() && typeof window !== 'undefined' && typeof window.__AGY_TRIGGER_FINISHER__ === 'function') {
      try {
        window.__AGY_TRIGGER_FINISHER__({
          reason: slashReason || 'bug_slashed',
          dualPartnerId: state.personaSkillId || '',
          fallbackOriginEl: state.yoriichiBtnEl || null
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
          reason: reasonVi
        });
      } catch (_) {}
    }

    // 5. Trigger crisp katana sheathe "Kachin!" via Bio-Audio if exposed directly
    if (typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__) {
      const bio = window.__AGY_BIO_AUDIO__;
      try {
        if (typeof bio.playNichirinSheathe === 'function') bio.playNichirinSheathe();
        else if (typeof bio.playSheathe === 'function') bio.playSheathe();
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
        state.kaguraBtnEl.dataset.muted = '1';
      }
    }

    if (state.cinemaBtnEl && typeof document !== 'undefined') {
      const dir = typeof window !== 'undefined' ? window.__AGY_CINEMA_DIRECTOR__ : null;
      const shieldOn =
        (document.documentElement && document.documentElement.dataset.agyPrivacyShield === '1') ||
        Boolean(dir && typeof dir.isPrivacyShieldActive === 'function' && dir.isPrivacyShieldActive()) ||
        Boolean(dir && typeof dir.isPrivacyActive === 'function' && dir.isPrivacyActive()) ||
        Boolean(dir && typeof dir.isShowcaseRunning === 'function' && dir.isShowcaseRunning());
      if (shieldOn) state.cinemaBtnEl.dataset.active = '1';
      else delete state.cinemaBtnEl.dataset.active;
    }
  }

  /* ==========================================================================
   * STREAMING SSE (/__events) + RESILIENT FALLBACK POLLING (/__telemetry)
   * ========================================================================== */

  function ingestTelemetrySnapshot(snap) {
    if (!snap || typeof snap !== 'object' || snap.ok === false) return;
    if (state.cid === 'idle') return;
    if (snap.cid && state.cid && state.cid !== 'latest' && snap.cid !== state.cid) return;

    if (snap.cid) {
      if (state.cid === 'latest' && state.resolvedCid && snap.cid !== state.resolvedCid) {
        // Active session rotated on server while window uses cid='latest' fallback
        state.hasTelemetry = false;
        state.lastSlashSeq = -1;
        state.lastServerStepIdx = -1;
        state.bladeBonusHeat = 0;
        state.workStateItems = [];
        resetConversationCompactState();
        applyCrisisVisual(false);
        if (
          typeof window !== 'undefined' &&
          window.__AGY_SQUAD_RAID__ &&
          typeof window.__AGY_SQUAD_RAID__.resetConversation === 'function'
        ) {
          try { window.__AGY_SQUAD_RAID__.resetConversation(snap.cid); } catch (_) {}
        }
        if (
          typeof window !== 'undefined' &&
          window.__AGY_BIO_AUDIO__ &&
          typeof window.__AGY_BIO_AUDIO__.resetConversation === 'function'
        ) {
          try { window.__AGY_BIO_AUDIO__.resetConversation(snap.cid); } catch (_) {}
        }
      }
      if (snap.cid !== state.resolvedCid) {
        state.resolvedCid = snap.cid;
        restoreCompactHistory(snap.cid);
        refreshSessionAndElementIcons();
      }
    }

    const firstSync = !state.hasTelemetry;
    state.hasTelemetry = true;

    const ctxTok = Number(snap.contextTokens ?? snap.inputTokens) || 0;
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

    if (typeof snap.modelName === 'string' && snap.modelName.trim()) {
      state.serverModelName = snap.modelName.trim();
    }

    const prevServerWorking = Boolean(state.serverIsWorking);
    if (typeof snap.isWorking === 'boolean') {
      state.serverIsWorking = snap.isWorking;
      state.pollWasWorking = snap.isWorking;
      evaluateSmartHeraldOnTurnTransition(prevServerWorking, snap.isWorking, firstSync);
    }

    const nowVelMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (firstSync) {
      state.lastBurnSampleTokens = outTok || turnTok;
      state.lastBurnSampleAt = nowVelMs;
    } else {
      const curSample = outTok > 0 ? outTok : turnTok;
      const dtVelSec = (nowVelMs - (state.lastBurnSampleAt || nowVelMs)) / 1000;
      const dTok = curSample - (state.lastBurnSampleTokens || 0);
      if (dTok > 0 && dtVelSec >= 0.08 && dtVelSec <= 15) {
        const instRate = Math.min(2500, dTok / dtVelSec);
        state.burnRateTokPerSec = state.burnRateTokPerSec > 0
          ? (state.burnRateTokPerSec * 0.55 + instRate * 0.45)
          : instRate;
        if (state.burnRateTokPerSec > state.peakBurnRateTokPerSec) {
          state.peakBurnRateTokPerSec = state.burnRateTokPerSec;
        }
        state.lastBurnSampleTokens = curSample;
        state.lastBurnSampleAt = nowVelMs;
      } else if (dTok < 0 || dtVelSec > 15) {
        state.lastBurnSampleTokens = curSample;
        state.lastBurnSampleAt = nowVelMs;
      }
      if (snap.isWorking === false) {
        state.burnRateTokPerSec = 0;
      }
    }

    if (firstSync) {
      state.dispCtxTokens = state.serverCtxTokens;
      state.dispTurnTokens = state.serverTurnTokens;
      state.stepBaselineDomChars = measureConversationDomChars();
      state.cachedDomChars = state.stepBaselineDomChars;
    }

    const stepMarker = typeof snap.latestStepIndex === 'number' ? snap.latestStepIndex : stepCnt;
    if (stepMarker !== state.lastServerStepIdx) {
      state.lastServerStepIdx = stepMarker;
      state.lastStepSeenAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      state.stepBaselineDomChars = measureConversationDomChars();
      state.cachedDomChars = state.stepBaselineDomChars;
    }

    // Crisis & Bug-Slash Detection (strictly baseline on firstSync / tab switch — 0% false-positive!)
    if (typeof snap.crisisState === 'boolean') {
      applyCrisisVisual(snap.crisisState);
    }

    const incomingSlashSeq = typeof snap.slashSeq === 'number' ? snap.slashSeq : 0;
    if (firstSync || state.lastSlashSeq < 0) {
      state.lastSlashSeq = incomingSlashSeq;
    } else if (incomingSlashSeq > state.lastSlashSeq) {
      state.lastSlashSeq = incomingSlashSeq;
      executeDemonSlayCelebration(incomingSlashSeq, snap.slashReason || '');
    } else if (incomingSlashSeq < state.lastSlashSeq) {
      state.lastSlashSeq = incomingSlashSeq;
    }

    if (Array.isArray(snap.workStateItems)) {
      state.workStateItems = snap.workStateItems
        .filter((it) => it && typeof it === 'object' && typeof it.task === 'string' && it.task.trim())
        .slice(-12);
    }

    if (typeof snap.turnFinishedSeq === 'number') {
      state.lastTurnFinishedSeq = snap.turnFinishedSeq;
      if (snap.turnFinishedSeq > state.localFinishSeq) {
        state.localFinishSeq = snap.turnFinishedSeq;
      }
    }

    computeAndApplyBladeHeat();
    evaluateAutoCompact({ firstSync });

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
      if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState === 'function') {
        try {
          window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState({
            working: Boolean(state.serverIsWorking || state.isWorking),
            crisis: Boolean(state.crisisState),
            bladeHeat: state.bladeHeat || 0
          });
        } catch (_) {}
      }
    }

    refreshUtilityButtonStates();

    const unfocusedOrHidden =
      typeof document !== 'undefined' &&
      (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus()));
    if (firstSync || unfocusedOrHidden) {
      state.targetCtxTokens = state.serverCtxTokens;
      state.targetTurnTokens = state.serverTurnTokens;
      state.dispCtxTokens = state.serverCtxTokens;
      state.dispTurnTokens = state.serverTurnTokens;
      renderDomValues();
    }
    if (!(typeof document !== 'undefined' && document.hidden)) {
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
    if (!cid || cid !== state.cid || !state.barEl || !state.barEl.isConnected) return;
    const reqEpoch = state.mountEpoch;
    const delay = Math.min(15000, 2200 * Math.pow(1.6, Math.min(4, state.streamFailCount)));
    state.streamReconnectTimer = setTimeout(() => {
      state.streamReconnectTimer = 0;
      if (reqEpoch === state.mountEpoch && state.cid === cid && state.barEl && state.barEl.isConnected) {
        connectTelemetryStream(cid);
      }
    }, Math.round(delay));
  }

  async function connectTelemetryStream(cid) {
    if (!cid || cid === 'idle' || !state.barEl || !state.barEl.isConnected) return;
    if (state.streamAbort && state.streamCid === cid) return;

    abortActiveStream();

    const base = getSecureAssetBase();
    if (!base || !/^https?:\/\/127\.0\.0\.1:\d+/.test(base)) return;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (!controller) return;

    const reqEpoch = state.mountEpoch;
    state.streamAbort = controller;
    state.streamCid = cid;

    const url = base.replace(/\/?$/, '/') + `__events?cid=${encodeURIComponent(cid)}`;
    let reader = null;
    const cancelStreamAndReader = () => {
      try { controller.abort(); } catch (_) {}
      try {
        if (reader && typeof reader.cancel === 'function') {
          Promise.resolve(reader.cancel()).catch(() => {});
        }
      } catch (_) {}
    };

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: getSecureAuthHeaders({ Accept: 'text/event-stream' }),
        signal: controller.signal,
        cache: 'no-store'
      });

      if (reqEpoch !== state.mountEpoch || !state.barEl || !state.barEl.isConnected) {
        cancelStreamAndReader();
        try {
          if (res && res.body && typeof res.body.cancel === 'function') {
            Promise.resolve(res.body.cancel()).catch(() => {});
          }
        } catch (_) {}
        return;
      }

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

      reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        const invalidStreamState =
          controller.signal.aborted || reqEpoch !== state.mountEpoch || !state.barEl || !state.barEl.isConnected;
        if (done || invalidStreamState) {
          if (invalidStreamState) cancelStreamAndReader();
          break;
        }

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
                if (!snap || snap.ok === false) continue;
                if (reqEpoch !== state.mountEpoch || !state.barEl || !state.barEl.isConnected) {
                  cancelStreamAndReader();
                  return;
                }
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
      if (controller.signal.aborted || reqEpoch !== state.mountEpoch || !state.barEl || !state.barEl.isConnected) {
        cancelStreamAndReader();
      }
      if (state.streamAbort === controller) {
        state.streamAbort = null;
        state.streamConnected = false;
        if (!controller.signal.aborted && reqEpoch === state.mountEpoch && state.cid === cid && state.barEl && state.barEl.isConnected) {
          state.streamFailCount++;
          scheduleStreamReconnect(cid);
        }
      }
    }
  }

  async function fetchDaemonTelemetry(cid) {
    if (!cid || cid === 'idle' || state.fetchInFlight || !state.barEl || !state.barEl.isConnected) return;
    const base = getSecureAssetBase();
    if (!base || !/^https?:\/\/127\.0\.0\.1:\d+/.test(base)) return;

    const reqEpoch = state.mountEpoch;
    const reqCidEpoch = state.cidEpoch;
    state.fetchInFlight = true;
    try {
      const url = base.replace(/\/?$/, '/') + `__telemetry?cid=${encodeURIComponent(cid)}&_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: getSecureAuthHeaders(),
        cache: 'no-store'
      });
      if (reqEpoch !== state.mountEpoch || reqCidEpoch !== state.cidEpoch || !state.barEl || !state.barEl.isConnected) return;
      if (!res.ok) {
        state.fallbackBackoffMs = Math.min(9000, Math.round(state.fallbackBackoffMs * 1.7));
        return;
      }
      const data = await res.json();
      if (reqEpoch !== state.mountEpoch || reqCidEpoch !== state.cidEpoch || !state.barEl || !state.barEl.isConnected) return;
      if (!data || data.ok === false) return;
      if (data.cid && state.cid && state.cid !== 'latest' && data.cid !== state.cid) return;

      state.fallbackBackoffMs = 1400;
      ingestTelemetrySnapshot(data);
    } catch (_) {
      if (reqEpoch === state.mountEpoch && reqCidEpoch === state.cidEpoch) {
        state.fallbackBackoffMs = Math.min(9000, Math.round(state.fallbackBackoffMs * 1.7));
      }
    } finally {
      if (reqEpoch === state.mountEpoch && reqCidEpoch === state.cidEpoch) {
        state.fetchInFlight = false;
        state.nextFallbackAt = Date.now() + state.fallbackBackoffMs;
      }
    }
  }

  /* ==========================================================================
   * LIVE DOM SIGNALS, SESSION ICONS & ODOMETER RENDERING
   * ========================================================================== */

  const UUID_EXACT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const URL_CID_RE = /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  const BLANK_ROUTE_RE = /^\/(?:launchpad|new|welcome)(?:\/|$)/i;

  function resolveConversationPaneRoot(comp) {
    if (!comp) return typeof document !== 'undefined' ? document.querySelector('[data-main-content-body="true"]') : null;
    if (typeof comp.closest === 'function') {
      const byCascade = comp.closest(CASCADE_ATTR_SEL);
      if (byCascade && !isInsideSidebarNav(byCascade)) return byCascade;
      const byMain = comp.closest('[data-main-content-body="true"], .agy-inset-shell, main');
      if (byMain && !isInsideSidebarNav(byMain)) return byMain;
    }
    let col = comp.parentElement;
    while (col && col.parentElement && col.clientHeight < 260) {
      col = col.parentElement;
    }
    return col || comp;
  }

  function hasConversationMessagesInPane(comp) {
    if (typeof document === 'undefined') return false;
    const pane = resolveConversationPaneRoot(comp);
    const scope = pane || document;
    try {
      const nodes = scope.querySelectorAll('[data-testid="user-message"], .agy-user-bubble-frame, [data-testid="agent-response"]');
      for (let i = 0; i < nodes.length; i++) {
        if (!isInsideSidebarNav(nodes[i])) return true;
      }
    } catch (_) {}
    return false;
  }

  function extractLivePageSignals(composerEl) {
    let explicitCid = '';
    let isWorking = false;
    let modelLabel = '';
    let quotaPct = null;

    const comp = composerEl || state.composer;

    // 1. Highest priority: direct cascade/conversation container of THIS composer (Split-View safe!)
    if (comp && typeof comp.closest === 'function') {
      try {
        const ancestorAttrEl = comp.closest(CASCADE_ATTR_SEL);
        if (ancestorAttrEl && !isInsideSidebarNav(ancestorAttrEl)) {
          explicitCid = extractAttrCid(ancestorAttrEl);
        }
      } catch (_) {}
    }

    const inspectFiberChain = (rootNode, allowIsWorking) => {
      if (!rootNode) return;
      try {
        const fk = Object.keys(rootNode).find((k) => k.startsWith('__reactFiber$'));
        if (!fk) return;
        let cur = rootNode[fk];
        let depth = 0;
        while (cur && depth < 48) {
          const p = cur.memoizedProps;
          if (p && typeof p === 'object') {
            if (allowIsWorking && typeof p.isRunning === 'boolean' && p.isRunning) {
              isWorking = true;
            }
            if (!explicitCid) {
              const rawCand =
                p.conversationId ||
                p.cascadeId ||
                p.effectiveCascadeId ||
                p.trajectoryId ||
                p.sessionId ||
                p['data-cascade-id'] ||
                p['data-conversation-id'];
              if (typeof rawCand === 'string' && UUID_EXACT_RE.test(rawCand.trim())) {
                explicitCid = rawCand.trim().toLowerCase();
              }
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
      } catch (_) {}
    };

    // 2. React Fiber chain of THIS composer
    if (comp) inspectFiberChain(comp, true);

    // 3. Window URL route (/c/<uuid> or ?conversationId=<uuid>) when single-pane or composer has no own tag
    if (!explicitCid) {
      explicitCid = extractLocationUrlCid();
    }

    // 4. Main content container ONLY when it encloses this composer (NEVER scan sidebar history items!)
    if (!explicitCid && typeof document !== 'undefined') {
      const mainBody = document.querySelector('[data-main-content-body="true"]');
      if (mainBody && mainBody !== comp && (!comp || (typeof mainBody.contains === 'function' && mainBody.contains(comp)))) {
        inspectFiberChain(mainBody, true);
      }
    }

    if (!explicitCid && comp && typeof document !== 'undefined') {
      try {
        const candidates = Array.from(document.querySelectorAll(CASCADE_ATTR_SEL));
        for (let i = 0; i < candidates.length; i++) {
          const el = candidates[i];
          if (isInsideSidebarNav(el)) continue;
          if (typeof el.contains === 'function' && el.contains(comp)) {
            const val = extractAttrCid(el);
            if (val) {
              explicitCid = val;
              break;
            }
          }
        }
      } catch (_) {}
    }

    // 5. Strict aria-current="page" link (only when not on a blank launchpad/new route)
    const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) || '';
    const isBlankRoute = BLANK_ROUTE_RE.test(pathname);
    if (!explicitCid && !isBlankRoute && typeof document !== 'undefined') {
      try {
        const activeLink = document.querySelector('a[href*="/c/"][aria-current="page"]');
        if (activeLink) {
          const href = String(activeLink.getAttribute('href') || '');
          const m = href.match(URL_CID_RE);
          if (m) explicitCid = m[1].toLowerCase();
        }
      } catch (_) {}
    }

    if (explicitCid) {
      state.everSawExplicitCid = true;
    }

    if (!isWorking && typeof document !== 'undefined') {
      const paneScope = resolveConversationPaneRoot(comp) || document;
      const cancelBtn = paneScope.querySelector('[data-testid="input-cancel-button"], button[aria-label="Stop execution"]');
      if (cancelBtn && cancelBtn.offsetParent !== null) {
        isWorking = true;
      }
    }

    let draftText = '';
    if (comp) {
      const editor = findComposerEditor(comp) || comp.querySelector('textarea, [contenteditable="true"]');
      if (editor) {
        draftText = readEditorText(editor);
      }
    }
    const draftTokens = draftText.length > 0 ? Math.max(1, Math.round(draftText.length / 3.6)) : 0;

    let cid = explicitCid;
    if (!cid) {
      let hasMultiSessionUi = state.everSawExplicitCid;
      if (!hasMultiSessionUi && typeof document !== 'undefined') {
        try {
          hasMultiSessionUi = Boolean(
            document.querySelector('[data-sidebar="true"] [data-cascade-id], aside [data-cascade-id], a[href*="/c/"]')
          );
        } catch (_) {}
      }
      if (isBlankRoute || (hasMultiSessionUi && !hasConversationMessagesInPane(comp))) {
        cid = 'idle';
      } else {
        cid = 'latest';
      }
    }

    return { cid, explicitCid, isWorking, modelLabel, quotaPct, draftTokens, draftText };
  }

  function measureConversationDomChars() {
    if (typeof document === 'undefined' || state.cid === 'idle') return 0;
    const comp = state.composer || resolveComposerRoot();
    const pane = resolveConversationPaneRoot(comp);
    if (pane && !isInsideSidebarNav(pane)) {
      return (pane.textContent || '').length;
    }
    const main = document.querySelector('[data-main-content-body="true"]');
    return main ? (main.textContent || '').length : 0;
  }

  function refreshSessionAndElementIcons() {
    const ic = getIconsApi();
    if (!ic || !state.barEl) return;

    const docTitle = typeof document !== 'undefined' ? (document.title || '') : '';
    const displayCid = state.resolvedCid || (state.cid !== 'latest' && state.cid !== 'idle' ? state.cid : '');
    const sessionSig = `${docTitle}|${displayCid}`;
    if (sessionSig !== state.lastSessionSig) {
      state.lastSessionSig = sessionSig;
      const sesSmall = ic.buildSessionAvatar(docTitle, displayCid, 15);
      const sesLarge = ic.buildSessionAvatar(docTitle, displayCid, 18);
      if (state.ctxIconWrap) state.ctxIconWrap.innerHTML = sesSmall.svg;
      if (state.ctxBtnEl) {
        const nextTitle = `Phiên làm việc: ${sesSmall.info.displayLabel} — Nhấn xem chi tiết Ngữ cảnh & Nhật Luân Đao`;
        if (state.ctxBtnEl.title !== nextTitle) state.ctxBtnEl.title = nextTitle;
      }
      if (state.popSessionIcon) state.popSessionIcon.innerHTML = sesLarge.svg;
      if (state.popSessionTitle) {
        setTextIfChanged(state.popSessionTitle, sesSmall.info.displayLabel);
        if (state.popSessionTitle.title !== sesSmall.info.displayLabel) {
          state.popSessionTitle.title = sesSmall.info.displayLabel;
        }
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
    if (state.cid === 'latest' && nextCid !== 'latest' && nextCid !== 'idle' && state.resolvedCid === nextCid) {
      // Seamless promotion from 'latest' fallback to exact verified UUID of the same conversation
      abortActiveStream();
      state.cid = nextCid;
      if (
        typeof window !== 'undefined' &&
        window.__AGY_SQUAD_RAID__ &&
        typeof window.__AGY_SQUAD_RAID__.lockActiveCid === 'function'
      ) {
        try { window.__AGY_SQUAD_RAID__.lockActiveCid(nextCid); } catch (_) {}
      }
      connectTelemetryStream(nextCid);
      return;
    }

    abortActiveStream();
    hideUserMessageEcho();
    dismissKasugaiHerald();
    state.liveTurnWasWorking = false;
    state.liveTurnWorkStartedMs = 0;
    state.heraldLastApprovalSig = '';
    resetConversationCompactState();
    state.cidEpoch++;
    state.fetchInFlight = false;
    state.cid = nextCid;
    state.resolvedCid = (nextCid !== 'latest' && nextCid !== 'idle') ? nextCid : '';
    restoreCompactHistory(getTrackableCompactCid());
    state.hasTelemetry = false;
    state.serverIsWorking = null;
    state.isWorking = false;
    state.wasWorking = false;
    state.pollWasWorking = false;
    state.serverCtxTokens = 0;
    state.serverCacheTokens = 0;
    state.serverTurnTokens = 0;
    state.serverTotalOutTokens = 0;
    state.serverTurnSteps = 0;
    state.serverTurnCount = 0;
    state.serverStepCount = 0;
    state.serverTurnCtxDelta = 0;
    state.serverModelName = '';
    state.dispCtxTokens = 0;
    state.dispTurnTokens = 0;
    state.targetCtxTokens = 0;
    state.targetTurnTokens = 0;
    state.burnRateTokPerSec = 0;
    state.peakBurnRateTokPerSec = 0;
    state.lastBurnSampleTokens = 0;
    state.lastBurnSampleAt = 0;
    state.liveDomTurnEst = 0;
    state.workStateItems = [];
    state.lastServerStepIdx = -1;
    state.lastSlashSeq = -1;
    state.bladeBonusHeat = 0;
    state.typingHeatPulse = 0;
    state.lastRenderedBladeHeat = -1;
    state.lastRenderedBladeTier = '';
    state.forceSignalSample = true;

    if (
      typeof window !== 'undefined' &&
      window.__AGY_SQUAD_RAID__ &&
      typeof window.__AGY_SQUAD_RAID__.resetConversation === 'function'
    ) {
      try { window.__AGY_SQUAD_RAID__.resetConversation(nextCid); } catch (_) {}
    }
    if (
      typeof window !== 'undefined' &&
      window.__AGY_BIO_AUDIO__ &&
      typeof window.__AGY_BIO_AUDIO__.resetConversation === 'function'
    ) {
      try { window.__AGY_BIO_AUDIO__.resetConversation(nextCid); } catch (_) {}
    }

    applyCrisisVisual(false);
    refreshSessionAndElementIcons();
    computeAndApplyBladeHeat();
    renderDomValues();

    if (nextCid !== 'idle') {
      connectTelemetryStream(nextCid);
      fetchDaemonTelemetry(nextCid);
    }
  }

  function recomputeTargets(nowMs) {
    const shouldSampleDom =
      state.forceSignalSample ||
      !state.cachedSignals ||
      (nowMs - state.lastSignalSampleAt) >= 220;

    if (shouldSampleDom) {
      state.forceSignalSample = false;
      state.lastSignalSampleAt = nowMs;
      state.cachedSignals = extractLivePageSignals(state.composer);
      // Zero-GC optimization: skip walking full conversation DOM textContent every 220ms when server SSE telemetry is already active & idle
      const nextWorking = Boolean(state.cachedSignals.isWorking || state.serverIsWorking);
      if (!state.hasTelemetry || nextWorking || state.cachedDomChars === 0) {
        state.cachedDomChars = measureConversationDomChars();
      }
      refreshSessionAndElementIcons();
    }

    const sig = state.cachedSignals;
    const domChars = state.cachedDomChars;

    const desiredCid = sig.explicitCid || sig.cid || 'idle';
    if (desiredCid !== state.cid) {
      switchActiveConversation(desiredCid);
    }

    state.isWorking = Boolean(sig.isWorking || state.serverIsWorking);
    state.draftTokens = sig.draftTokens;
    if (sig.modelLabel) state.modelLabel = sig.modelLabel;
    if (sig.quotaPct !== null) state.quotaPct = sig.quotaPct;

    // Auto-dismiss command echo banner once Antigravity renders the new user bubble
    if (state.echoEl && state.echoEl.dataset.visible === '1' && shouldSampleDom && typeof document !== 'undefined') {
      const curMsgCount = document.querySelectorAll('[data-testid="user-message"], .agy-user-bubble-frame').length;
      if (curMsgCount > state.baselineUserMsgCount && (nowMs - (state.echoShownAt || 0)) > 1800) {
        hideUserMessageEcho();
      }
    }

    if (state.isWorking && !state.wasWorking) {
      state.workStartedAt = nowMs;
      state.lastStepSeenAt = nowMs;
      state.turnBaselineDomChars = domChars;
      state.stepBaselineDomChars = domChars;
      state.dispTurnTokens = 0;
      if (!state.hasTelemetry) {
        evaluateSmartHeraldOnTurnTransition(false, true, false);
      }
      computeAndApplyBladeHeat();
      if (typeof window !== 'undefined' && window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState === 'function') {
        try { window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState({ working: true, crisis: state.crisisState, bladeHeat: state.bladeHeat }); } catch (_) {}
      }
      if (state.cid && !state.streamConnected) fetchDaemonTelemetry(state.cid);
    } else if (!state.isWorking && state.wasWorking) {
      computeAndApplyBladeHeat();
      if (!state.hasTelemetry) {
        evaluateSmartHeraldOnTurnTransition(true, false, false);
      }
      if (typeof window !== 'undefined' && window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState === 'function') {
        try { window.__AGY_KNY_CHIBI_AURA__.setLive2dWorkState({ working: false, crisis: state.crisisState, bladeHeat: state.bladeHeat }); } catch (_) {}
      }
      evaluateAutoCompact({ firstSync: false });
      if (state.cid && !state.streamConnected) fetchDaemonTelemetry(state.cid);
    }
    state.wasWorking = state.isWorking;

    if (shouldSampleDom && state.isWorking) {
      computeAndApplyBladeHeat();
    }

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
    } else if (state.cid === 'idle') {
      state.targetCtxTokens = state.draftTokens;
      state.targetTurnTokens = 0;
      if (shouldSampleDom) {
        computeAndApplyBladeHeat();
      }
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
      if (shouldSampleDom) {
        computeAndApplyBladeHeat();
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
    const cacheRatio = state.serverCacheTokens > 0
      ? Math.max(0, Math.min(ctxRatio, state.serverCacheTokens / DEFAULT_CONTEXT_WINDOW))
      : 0;
    const ctxPctStr = (ctxRatio * 100).toFixed(1) + '%';

    if (state.ctxNumEl) {
      setTextIfChanged(state.ctxNumEl, formatCompactTokens(ctxRounded));
    }
    if (state.ctxFillEl) {
      const nextW = `${Math.max(3, Math.round(ctxRatio * 100))}%`;
      if (state.ctxFillEl.style.width !== nextW) {
        state.ctxFillEl.style.width = nextW;
      }
      const nextWarn = ctxRatio >= 0.85 ? 'red' : (ctxRatio >= 0.60 ? 'amber' : '');
      if (nextWarn) {
        if (state.ctxFillEl.dataset.warn !== nextWarn) state.ctxFillEl.dataset.warn = nextWarn;
      } else if (state.ctxFillEl.dataset.warn) {
        delete state.ctxFillEl.dataset.warn;
      }
    }
    if (state.ctxCacheFillEl) {
      const nextCacheW = cacheRatio > 0 ? `${Math.max(2, Math.round(cacheRatio * 100))}%` : '0%';
      if (state.ctxCacheFillEl.style.width !== nextCacheW) {
        state.ctxCacheFillEl.style.width = nextCacheW;
      }
    }

    if (state.turnBtnEl) {
      if (state.isWorking) {
        if (state.turnBtnEl.dataset.working !== '1') state.turnBtnEl.dataset.working = '1';
      } else if (state.turnBtnEl.dataset.working) {
        delete state.turnBtnEl.dataset.working;
      }
    }

    if (state.turnNumEl) {
      const turnStr = state.isWorking ? `+${formatExactInt(turnRounded)}` : `+${formatCompactTokens(turnRounded)}`;
      setTextIfChanged(state.turnNumEl, turnStr);
    }
    if (state.turnDraftWrapEl && state.turnDraftNumEl) {
      const showDraft = !state.isWorking && state.draftTokens > 0;
      const nextDisp = showDraft ? '' : 'none';
      if (state.turnDraftWrapEl.style.display !== nextDisp) {
        state.turnDraftWrapEl.style.display = nextDisp;
      }
      if (showDraft) {
        setTextIfChanged(state.turnDraftNumEl, `+${formatCompactTokens(state.draftTokens)}`);
      }
    }

    if (state.popoverOpen) {
      if (state.detStatusBadge) {
        const modeTxt = state.streamConnected ? 'Thời gian thực <30ms' : 'Trực tuyến';
        setTextIfChanged(state.detStatusBadge, state.isWorking ? `Đang rèn (${modeTxt})` : `Sẵn sàng (${modeTxt})`);
        if (state.isWorking) {
          if (state.detStatusBadge.dataset.working !== '1') state.detStatusBadge.dataset.working = '1';
        } else if (state.detStatusBadge.dataset.working) {
          delete state.detStatusBadge.dataset.working;
        }
      }
      if (state.detCtxVal) {
        setTextIfChanged(state.detCtxVal, `${formatExactInt(ctxRounded)} / 1.05M (${ctxPctStr})`);
      }
      if (state.detCtxMeter) {
        const nextMeterW = `${Math.max(2, Math.round(ctxRatio * 100))}%`;
        if (state.detCtxMeter.style.width !== nextMeterW) {
          state.detCtxMeter.style.width = nextMeterW;
        }
      }
      if (state.detCtxCacheMeter) {
        const nextCacheMeterW = cacheRatio > 0 ? `${Math.max(1, Math.round(cacheRatio * 100))}%` : '0%';
        if (state.detCtxCacheMeter.style.width !== nextCacheMeterW) {
          state.detCtxCacheMeter.style.width = nextCacheMeterW;
        }
      }
      if (state.detCacheVal) {
        const cachePct = ctxRounded > 0 ? Math.min(100, Math.round((state.serverCacheTokens / ctxRounded) * 100)) : 0;
        setTextIfChanged(
          state.detCacheVal,
          state.serverCacheTokens > 0 ? `${formatCompactTokens(state.serverCacheTokens)} (${cachePct}% bộ nhớ đệm)` : '—'
        );
      }
      if (state.detTurnVal) {
        const stepsTxt = state.serverTurnSteps > 0 ? ` • ${state.serverTurnSteps} bước` : '';
        setTextIfChanged(state.detTurnVal, `+${formatExactInt(turnRounded)} token${stepsTxt}`);
      }
      if (state.detVelocityVal) {
        let velTxt = 'Sẵn sàng';
        if (state.isWorking) {
          const liveRate = state.burnRateTokPerSec > 0
            ? Math.round(state.burnRateTokPerSec)
            : (state.workStartedAt > 0 && turnRounded > 0
                ? Math.max(1, Math.round(turnRounded / Math.max(0.5, ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - state.workStartedAt) / 1000)))
                : 0);
          velTxt = liveRate > 0 ? `${formatExactInt(liveRate)} token/giây` : 'Đang khởi phát…';
        } else if (state.peakBurnRateTokPerSec > 0) {
          velTxt = `Đỉnh ${formatExactInt(Math.round(state.peakBurnRateTokPerSec))} token/giây`;
        }
        setTextIfChanged(state.detVelocityVal, velTxt);
      }
      computeAndApplyBladeHeat();
      refreshBladeCompactUi();
      if (state.detDraftVal) {
        setTextIfChanged(state.detDraftVal, state.draftTokens > 0 ? `+${formatExactInt(state.draftTokens)} token` : '0 token');
      }
      if (state.detSessionVal) {
        const tot = state.hasTelemetry
          ? state.serverTotalOutTokens
          : Math.max(turnRounded, state.serverTotalOutTokens);
        setTextIfChanged(state.detSessionVal, `${formatExactInt(tot)} token`);
      }
      if (state.detModelVal) {
        const qTxt = state.quotaPct !== null ? ` (${state.quotaPct}% hạn mức)` : '';
        const modelName = state.modelLabel || state.serverModelName || 'Tác tử Antigravity';
        setTextIfChanged(state.detModelVal, modelName + qTxt);
      }
      if (state.detWorkStateRow && state.detWorkStateVal) {
        const items = Array.isArray(state.workStateItems) ? state.workStateItems : [];
        if (items.length === 0) {
          state.detWorkStateRow.style.display = 'none';
          setTextIfChanged(state.detWorkStateVal, '');
        } else {
          state.detWorkStateRow.style.display = 'flex';
          const doneCnt = items.filter((x) => x.status === 'done').length;
          const activeItem = items.find((x) => x.status === 'doing') || items[items.length - 1];
          const shortTask = String(activeItem.task || '').slice(0, 34);
          setTextIfChanged(state.detWorkStateVal, `${doneCnt}/${items.length} xong • ${shortTask}`);
        }
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
    if (typeof requestAnimationFrame !== 'function') return;
    if (!state.rafId) {
      state.rafId = requestAnimationFrame(odometerTick);
    }
  }

  function setPopoverOpen(open) {
    state.popoverOpen = Boolean(open);
    if (!state.barEl) return;
    if (state.popoverOpen) {
      if (typeof window !== 'undefined') {
        try { window.__AGY_BIO_AUDIO__?.closePopover?.(); } catch (_) {}
        try { window.__AGY_CINEMA_DIRECTOR__?.closePanel?.(); } catch (_) {}
      }
      state.barEl.dataset.open = '1';
      renderDomValues();
    } else {
      delete state.barEl.dataset.open;
    }
  }

  /* ==========================================================================
   * FIRST SWORDSMAN YORIICHI: SKILL UNLEASH & INSTANT ENTER MESSAGE ECHO
   * ========================================================================== */

  function castYoriichiSunBreathing(arg0, arg1) {
    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    if (!ext || typeof ext.castSkill !== 'function') return;

    const explicitSkillIdx = typeof arg0 === 'number' ? arg0 : (typeof arg1 === 'number' ? arg1 : null);
    const originEl = (typeof arg0 === 'object' && arg0)
      ? arg0
      : ((typeof arg1 === 'object' && arg1) ? arg1 : state.yoriichiBtnEl);

    const targetSkillId = state.personaSkillId || 'yoriichi';
    let idx = 0;
    if (typeof explicitSkillIdx === 'number' && Number.isFinite(explicitSkillIdx)) {
      idx = ((Math.floor(explicitSkillIdx) % 4) + 4) % 4;
    } else {
      idx = state.yoriichiComboIdx % 4;
      state.yoriichiComboIdx = (idx + 1) % 4;
    }

    let originRect = null;
    if (originEl && typeof originEl.getBoundingClientRect === 'function') {
      originRect = originEl.getBoundingClientRect();
    }

    if (state.yoriichiBtnEl) {
      state.yoriichiBtnEl.dataset.surge = '1';
      clearTimeout(state.yoriichiSurgeTimer);
      state.yoriichiSurgeTimer = setTimeout(() => {
        state.yoriichiSurgeTimer = 0;
        if (state.yoriichiBtnEl) delete state.yoriichiBtnEl.dataset.surge;
      }, 360);
    }

    const cfg = state.themeCfg || {};
    const hasCustomUserAction = Boolean(typeof cfg.userActionSticker === 'string' && cfg.userActionSticker.trim());
    const noActionSprite = Boolean(cfg.isMultiversePersona && !hasCustomUserAction);
    const actionSticker = noActionSprite ? '' : resolveYoriichiActionUrl(cfg);
    const muted = isSfxMutedNow();

    ext.castSkill(targetSkillId, idx, {
      charId: targetSkillId,
      originRect,
      actionSticker,
      noActionSprite,
      composerEl: null,
      soundEnabled: !muted
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
      clearTimeout(state.yoriichiSurgeTimer);
      state.yoriichiSurgeTimer = setTimeout(() => {
        state.yoriichiSurgeTimer = 0;
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
    clearTimeout(state.heraldTimer);
    state.heraldTimer = 0;
    clearTimeout(state.heraldGlowTimer);
    state.heraldGlowTimer = 0;
    state.heraldVisible = false;
    state.liveTurnWasWorking = false;
    state.liveTurnWorkStartedMs = 0;
    state.heraldLastApprovalSig = '';
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

    const nextSkillId = typeof cfg.personaSkillId === 'string' && cfg.personaSkillId.trim()
      ? cfg.personaSkillId.trim()
      : 'yoriichi';
    const nextPersonaLabel = typeof cfg.personaLabel === 'string' ? cfg.personaLabel.trim() : '';
    if (nextSkillId !== state.personaSkillId) {
      state.yoriichiComboIdx = 0;
    }
    state.personaSkillId = nextSkillId;
    state.personaLabel = nextPersonaLabel;

    const isDefaultYoriichi = nextSkillId === 'yoriichi' && (!nextPersonaLabel || /Yoriichi|Hỏa Thần/i.test(nextPersonaLabel));
    const safeYoriAv = resolveYoriichiAvatarUrl(cfg);
    if (state.yoriichiBtnEl) {
      state.yoriichiBtnEl.style.backgroundImage = safeYoriAv ? `url("${safeYoriAv}")` : 'none';
      if (cfg.personaRingColor) {
        state.yoriichiBtnEl.style.borderColor = cfg.personaRingColor;
      } else {
        state.yoriichiBtnEl.style.removeProperty('border-color');
      }
      const crestTitle = isDefaultYoriichi
        ? 'Khai Tổ Vũ Điệu Hỏa Thần (Tsugikuni Yoriichi) — Nhấn để khai mở Nhật Chi Hô Hấp!'
        : `${nextPersonaLabel || 'Bản Ngã Chủ Nhân'} — Nhấn để khai mở tuyệt kỹ Hơi Thở!`;
      state.yoriichiBtnEl.title = crestTitle;
      state.yoriichiBtnEl.setAttribute('aria-label', crestTitle);
    }
    if (state.echoAvatarEl) {
      state.echoAvatarEl.style.backgroundImage = safeYoriAv ? `url("${safeYoriAv}")` : 'none';
      if (cfg.personaRingColor) {
        state.echoAvatarEl.style.borderColor = cfg.personaRingColor;
      } else {
        state.echoAvatarEl.style.removeProperty('border-color');
      }
    }
    if (state.echoHdrLabelEl) {
      state.echoHdrLabelEl.textContent = isDefaultYoriichi
        ? 'Khai Tổ Hỏa Thần vừa truyền lệnh'
        : `${nextPersonaLabel || 'Chủ Nhân'} vừa truyền lệnh`;
    }

    const safeYoriAction = resolveYoriichiActionUrl(cfg);
    if (
      safeYoriAction &&
      typeof window !== 'undefined' &&
      window.__AGY_KNY_SKILLS__ &&
      typeof window.__AGY_KNY_SKILLS__.preloadActionSprite === 'function'
    ) {
      try {
        window.__AGY_KNY_SKILLS__.preloadActionSprite(nextSkillId, safeYoriAction);
      } catch (_) {}
    }

    refreshSessionAndElementIcons();
    refreshUtilityButtonStates();

    if (state.heraldEl) {
      const nextComp = resolveHeraldCompanion(cfg, state.themeKeyHint);
      state.heraldKind = nextComp.kind;
      state.heraldCharId = nextComp.charId;
      state.heraldCompanionName = nextComp.name;
      state.heraldEl.dataset.kind = nextComp.kind;
      state.heraldEl.dataset.charId = nextComp.charId;
      if (state.heraldSvgSlotEl) {
        state.heraldSvgSlotEl.innerHTML = buildHeraldCompanionSvg(nextComp);
      }
      if (state.heraldTitleEl) {
        state.heraldTitleEl.textContent = `${nextComp.name} truyền tin`;
      }
    }
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
    if (existing && existing.parentElement === composer && state.barEl === existing && existing.isConnected && composer.isConnected) {
      applyThemeColors(existing, themeCfg, themeName);
      if (typeof window !== 'undefined' && window.__AGY_SQUAD_RAID__ && typeof window.__AGY_SQUAD_RAID__.mount === 'function') {
        try { window.__AGY_SQUAD_RAID__.mount(composer); } catch (_) {}
      }
      ensureOdometerRunning();
      return existing;
    }

    teardownInternal(true);
    state.mountEpoch++;

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
    const ctxNumEl = ctxText.querySelector('.agy-tok-num');

    const ctxTrack = document.createElement('span');
    ctxTrack.className = 'agy-tok-ctx-track';
    const ctxFill = document.createElement('span');
    ctxFill.className = 'agy-tok-ctx-fill';
    const ctxCacheFill = document.createElement('span');
    ctxCacheFill.className = 'agy-tok-ctx-cache';
    ctxTrack.appendChild(ctxFill);
    ctxTrack.appendChild(ctxCacheFill);

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
    const brushSvgInit = ic ? ic.getFuncSvg('draft_brush', 10) : '';
    turnText.innerHTML =
      `<span class="agy-tok-turn-prefix">Lượt: </span><span class="agy-tok-num">+0</span><span> token</span>` +
      `<span class="agy-tok-draft-tag" style="display:none"> • ${brushSvgInit}<span class="agy-tok-draft-num">+0</span></span>`;
    const turnNumEl = turnText.querySelector('.agy-tok-num');
    const turnDraftWrapEl = turnText.querySelector('.agy-tok-draft-tag');
    const turnDraftNumEl = turnText.querySelector('.agy-tok-draft-num');

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

    // 4. Kagura Wind-Chime Bell Button (Click -> Popover; Shift+Click / Right-Click -> Quick Toggle)
    const kaguraBtn = document.createElement('button');
    kaguraBtn.type = 'button';
    kaguraBtn.className = 'agy-hud-util-btn agy-kagura-bell-btn';
    kaguraBtn.dataset.agyBioAudioTrigger = '1';
    kaguraBtn.title = 'Chuông gió Kagura — Nhấn mở Âm cảnh Điệp Phủ • Shift+Click hoặc Chuột phải để Bật/Tắt nhanh';
    kaguraBtn.setAttribute('aria-label', kaguraBtn.title);
    kaguraBtn.innerHTML = ic ? ic.getFuncSvg('kagura_bell', 13) : '🔔';

    // 5. Urokodaki Fox Mask (Cinema Director & Privacy Shield) Button
    const cinemaBtn = document.createElement('button');
    cinemaBtn.type = 'button';
    cinemaBtn.className = 'agy-hud-util-btn agy-cinema-mask-btn';
    cinemaBtn.dataset.agyCinemaTrigger = '1';
    cinemaBtn.title = 'Mặt nạ Cáo Urokodaki — Nhấn mở Khiên Che Mật & Đạo Diễn Trình Diễn • Shift+Click hoặc Chuột phải để Bật/Tắt Khiên nhanh';
    cinemaBtn.setAttribute('aria-label', cinemaBtn.title);
    cinemaBtn.innerHTML = ic ? ic.getFuncSvg('cinema_mask', 13) : '🦊';

    // Remove any auto-mounted duplicate long buttons if they were mounted before HUD
    ['agy-bio-audio-hud-btn', 'agy-cinema-hud-btn'].forEach((dupId) => {
      const dup = document.getElementById(dupId);
      if (dup) dup.remove();
    });

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
    const meterCacheFill = document.createElement('div');
    meterCacheFill.className = 'agy-tok-meter-cache';
    meterWrap.appendChild(meterFill);
    meterWrap.appendChild(meterCacheFill);

    const rows = document.createElement('div');
    rows.className = 'agy-tok-rows';
    const rCtx = createIconRow(ic ? ic.getFuncSvg('context_scroll', 13) : '', 'Ngữ cảnh phiên:');
    const rCache = createIconRow(ic ? ic.getFuncSvg('kv_cache', 13) : '', 'Bộ nhớ đệm (KV):');
    const rTurn = createIconRow('', 'Token lượt hiện tại:');
    const rVelocity = createIconRow(ic ? ic.getFuncSvg('burn_velocity', 13) : '', 'Nhịp rèn trực tiếp:');
    const rBlade = createIconRow(ic ? ic.getFuncSvg('katana_cast', 13) : '', 'Nhiệt độ Nhật Luân Đao:');
    const rCompact = createIconRow(ic ? ic.getFuncSvg('compact_seal', 13) : '', 'Nén phiên (/compact):');
    const rDraft = createIconRow(ic ? ic.getFuncSvg('draft_brush', 13) : '', 'Đang gõ trong ô chat:');
    const rSession = createIconRow(ic ? ic.getFuncSvg('session_sum', 13) : '', 'Tổng sinh ra cả phiên:');
    const rModel = createIconRow(ic ? ic.getFuncSvg('model_quota', 13) : '', 'Mô hình & Hạn mức:');
    const rTasks = createIconRow(ic ? ic.getFuncSvg('task_scroll', 13) : '', 'Tiến độ nhiệm vụ:');
    rTasks.row.style.display = 'none';

    [rCtx, rCache, rTurn, rVelocity, rBlade, rCompact, rDraft, rSession, rModel, rTasks].forEach((r) => rows.appendChild(r.row));

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
    echoHdr.innerHTML = `${ic ? ic.getFuncSvg('yoriichi_sun', 12) : ''}`;
    const echoHdrLbl = document.createElement('span');
    echoHdrLbl.textContent = 'Khai Tổ Hỏa Thần vừa truyền lệnh';
    echoHdr.appendChild(echoHdrLbl);
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

    // 8. v3.5 Smart Kasugai / Chuntaro / Kaburamaru Herald (#agy-kasugai-herald)
    const oldHerald = document.getElementById(HERALD_BAR_ID);
    if (oldHerald) oldHerald.remove();
    const herald = document.createElement('div');
    herald.id = HERALD_BAR_ID;
    herald.setAttribute('role', 'status');
    herald.setAttribute('aria-live', 'polite');

    const heraldMain = document.createElement('button');
    heraldMain.type = 'button';
    heraldMain.className = 'agy-herald-main';
    heraldMain.title = 'Nhấn để cuộn mượt tới phản hồi mới nhất';

    const heraldSvgSlot = document.createElement('span');
    heraldSvgSlot.className = 'agy-herald-companion-svg';
    const initComp = resolveHeraldCompanion(themeCfg, themeName);
    heraldSvgSlot.innerHTML = buildHeraldCompanionSvg(initComp);

    const heraldCopy = document.createElement('span');
    heraldCopy.className = 'agy-herald-copy';
    const heraldTitle = document.createElement('span');
    heraldTitle.className = 'agy-herald-title';
    heraldTitle.textContent = `${initComp.name} truyền tin`;
    const heraldMsg = document.createElement('span');
    heraldMsg.className = 'agy-herald-msg';
    heraldMsg.textContent = 'Phản hồi mới đã sẵn sàng!';
    heraldCopy.appendChild(heraldTitle);
    heraldCopy.appendChild(heraldMsg);

    heraldMain.appendChild(heraldSvgSlot);
    heraldMain.appendChild(heraldCopy);
    heraldMain.addEventListener('click', (ev) => {
      ev.stopPropagation();
      scrollToHeraldTarget();
      dismissKasugaiHerald();
    });

    const heraldClose = document.createElement('button');
    heraldClose.type = 'button';
    heraldClose.className = 'agy-herald-close';
    heraldClose.textContent = '✕';
    heraldClose.title = 'Thu cánh sứ giả';
    heraldClose.setAttribute('aria-label', 'Thu cánh sứ giả');
    heraldClose.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dismissKasugaiHerald();
    });

    herald.appendChild(heraldMain);
    herald.appendChild(heraldClose);
    herald.dataset.kind = initComp.kind;
    herald.dataset.charId = initComp.charId;
    composer.appendChild(herald);

    state.heraldEl = herald;
    state.heraldSvgSlotEl = heraldSvgSlot;
    state.heraldTitleEl = heraldTitle;
    state.heraldMsgEl = heraldMsg;
    state.heraldKind = initComp.kind;
    state.heraldCharId = initComp.charId;
    state.heraldCompanionName = initComp.name;

    state.barEl = bar;
    state.yoriichiBtnEl = yoriBtn;
    state.ctxBtnEl = ctxBtn;
    state.ctxIconWrap = ctxIconWrap;
    state.ctxTextEl = ctxText;
    state.ctxNumEl = ctxNumEl;
    state.ctxFillEl = ctxFill;
    state.ctxCacheFillEl = ctxCacheFill;
    state.turnBtnEl = turnBtn;
    state.turnIconEl = turnIcon;
    state.turnTextEl = turnText;
    state.turnNumEl = turnNumEl;
    state.turnDraftWrapEl = turnDraftWrapEl;
    state.turnDraftNumEl = turnDraftNumEl;

    state.bladeBtnEl = bladeBtn;
    state.bladeFillRectEl = katanaParts.fillRect;
    state.bladeGlowPathEl = katanaParts.edgePath;
    state.bladeLabelEl = bladeLbl;
    state.lastRenderedBladeHeat = -1;
    state.lastRenderedBladeTier = '';

    state.kaguraBtnEl = kaguraBtn;
    state.cinemaBtnEl = cinemaBtn;

    state.popoverEl = pop;
    state.echoEl = echo;
    state.echoHdrLabelEl = echoHdrLbl;
    state.echoTextEl = echoTxt;
    state.echoAvatarEl = echoAv;

    state.popSessionIcon = sesIco;
    state.popSessionTitle = hdrTitle;
    state.detStatusBadge = badge;
    state.detCtxVal = rCtx.valEl;
    state.detCtxMeter = meterFill;
    state.detCtxCacheMeter = meterCacheFill;
    state.detCacheVal = rCache.valEl;
    state.detTurnIcon = rTurn.icoEl;
    state.detTurnVal = rTurn.valEl;
    state.detVelocityVal = rVelocity.valEl;
    state.detBladeVal = rBlade.valEl;
    state.detCompactVal = rCompact.valEl;
    state.detDraftVal = rDraft.valEl;
    state.detSessionVal = rSession.valEl;
    state.detModelVal = rModel.valEl;
    state.detWorkStateRow = rTasks.row;
    state.detWorkStateVal = rTasks.valEl;

    state.lastSessionSig = '';
    state.lastElemKey = '';
    applyThemeColors(bar, themeCfg, themeName);
    computeAndApplyBladeHeat();
    refreshBladeCompactUi();

    // Observe composer.clientWidth directly for Split-View narrow columns (MacBook 13" 2-pane / 3-pane)
    const syncCompactTier = () => {
      if (!bar || !composer) return;
      const cw = Math.round(composer.clientWidth || (composer.getBoundingClientRect && composer.getBoundingClientRect().width) || 800);
      if (cw > 0 && cw < 440) {
        bar.dataset.compact = '2';
        if (composer.dataset) composer.dataset.agyCompact = '2';
      } else if (cw > 0 && cw < 620) {
        bar.dataset.compact = '1';
        if (composer.dataset) composer.dataset.agyCompact = '1';
      } else {
        delete bar.dataset.compact;
        if (composer.dataset) delete composer.dataset.agyCompact;
      }
      if (composer.dataset) {
        if (cw > 0 && cw < 700) composer.dataset.agyNpcStack = '1';
        else delete composer.dataset.agyNpcStack;
      }
    };
    syncCompactTier();
    if (typeof ResizeObserver !== 'undefined') {
      state.composerRo = new ResizeObserver(syncCompactTier);
      state.composerRo.observe(composer);
    }

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

    bladeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ev.shiftKey) {
        onTogglePopover(ev);
        return;
      }
      if (state.popoverOpen) {
        setPopoverOpen(false);
      }
      triggerCompactSession({ source: 'manual' });
    });

    const quickToggleBioAudio = () => {
      const bio = typeof window !== 'undefined' ? window.__AGY_BIO_AUDIO__ : null;
      if (bio && typeof bio.toggle === 'function') {
        try {
          bio.toggle();
          refreshUtilityButtonStates();
        } catch (_) {}
      }
    };

    kaguraBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ev.shiftKey) {
        quickToggleBioAudio();
        return;
      }
      const bio = typeof window !== 'undefined' ? window.__AGY_BIO_AUDIO__ : null;
      if (bio) {
        try {
          if (typeof bio.openPopover === 'function') {
            bio.openPopover(kaguraBtn);
          } else if (typeof bio.toggle === 'function') {
            bio.toggle();
          }
          clearTimeout(state.kaguraSyncTimer);
          state.kaguraSyncTimer = setTimeout(() => {
            state.kaguraSyncTimer = 0;
            refreshUtilityButtonStates();
          }, 30);
        } catch (_) {}
      }
    });

    kaguraBtn.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      quickToggleBioAudio();
    });

    const quickTogglePrivacyShield = () => {
      const dir = typeof window !== 'undefined' ? window.__AGY_CINEMA_DIRECTOR__ : null;
      if (dir && typeof dir.togglePrivacyShield === 'function') {
        try {
          dir.togglePrivacyShield();
          refreshUtilityButtonStates();
        } catch (_) {}
      }
    };

    cinemaBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ev.shiftKey) {
        quickTogglePrivacyShield();
        return;
      }
      const dir = typeof window !== 'undefined' ? window.__AGY_CINEMA_DIRECTOR__ : null;
      if (dir) {
        try {
          if (typeof dir.openPanel === 'function') dir.openPanel(cinemaBtn);
          else if (typeof dir.togglePanel === 'function') dir.togglePanel(cinemaBtn);
          else if (typeof dir.open === 'function') dir.open(cinemaBtn);
        } catch (_) {}
        clearTimeout(state.cinemaSyncTimer);
        state.cinemaSyncTimer = setTimeout(() => {
          state.cinemaSyncTimer = 0;
          refreshUtilityButtonStates();
        }, 50);
      }
    });

    cinemaBtn.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      quickTogglePrivacyShield();
    });

    const onManualCompactSubmitted = (trimmedText) => {
      if (trimmedText !== COMPACT_COMMAND) return false;
      const wasSuppressed = Date.now() <= state.suppressNextCompactEchoUntil;
      if (!wasSuppressed) {
        if (state.autoCompactTimer) {
          clearTimeout(state.autoCompactTimer);
          state.autoCompactTimer = 0;
        }
        state.autoCompactPending = false;
        state.compactLastFailed = false;
        persistCompactHistory();
        refreshBladeCompactUi();
      }
      return wasSuppressed;
    };

    // Capture Enter key & Send button click BEFORE React clears the editor so user's message always shows!
    const onCaptureKeyDown = (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key !== 'Enter' || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const target = ev.target;
      if (!target || (target.closest && target.closest('#agy-shinobu-npc-wrap'))) return;
      const editor = findComposerEditor(composer) || composer.querySelector('textarea, [contenteditable="true"]');
      if (!editor || (target !== editor && !(editor.contains && editor.contains(target)))) return;
      if (hasVisibleSlashOrPopupMenu()) return;

      const trimmedRaw = readEditorText(editor);
      if (trimmedRaw && !onManualCompactSubmitted(trimmedRaw)) {
        showUserMessageEcho(trimmedRaw);
      }
    };

    const onCaptureSendClick = (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!btn || !composer.contains(btn)) return;
      if (
        btn.closest(`#${HUD_BAR_ID}`) ||
        btn.closest(`#${ECHO_BAR_ID}`) ||
        btn.closest('#agy-shinobu-npc-wrap') ||
        btn.closest('agy-hashira-squad') ||
        btn.closest('agy-chibi-aura') ||
        btn.classList.contains('agy-chibi-hitbox') ||
        btn.classList.contains('agy-echo-close')
      ) {
        return;
      }
      const aria = String(btn.getAttribute('aria-label') || btn.title || '').toLowerCase();
      const tid = String(btn.getAttribute('data-testid') || '').toLowerCase();
      const explicitSubmit = typeof btn.getAttribute === 'function' && String(btn.getAttribute('type') || '').trim().toLowerCase() === 'submit';
      if (explicitSubmit || /\b(?:send|submit)\b/.test(aria) || /\b(?:send|submit)\b/.test(tid) || /^(?:gửi)(?:\b|\s|$)|gửi\s+(?:tin\s+nhắn|lệnh)/i.test(aria)) {
        const editor = findComposerEditor(composer) || composer.querySelector('textarea, [contenteditable="true"]');
        const trimmedRaw = editor ? readEditorText(editor) : '';
        if (trimmedRaw && !onManualCompactSubmitted(trimmedRaw)) {
          showUserMessageEcho(trimmedRaw);
        }
      }
    };

    const onOutside = (ev) => {
      if (!state.popoverOpen) return;
      const t = ev.target;
      if (state.popoverEl && state.popoverEl.contains(t)) return;
      if (ctxBtn && ctxBtn.contains(t)) return;
      if (turnBtn && turnBtn.contains(t)) return;
      if (bladeBtn && bladeBtn.contains(t)) return;
      setPopoverOpen(false);
    };
    const onKey = (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Escape') {
        if (state.popoverOpen) setPopoverOpen(false);
        hideUserMessageEcho();
      }
    };
    const onComposerInput = () => {
      state.forceSignalSample = true;
      state.lastActivityAt = Date.now();
      state.typingHeatPulse = Math.min(14, +(state.typingHeatPulse + 2.4).toFixed(2));
      computeAndApplyBladeHeat();
      if (state.compactLastFailed) {
        const ed = findComposerEditor(composer);
        if (!ed || readEditorText(ed) !== COMPACT_COMMAND) {
          state.compactLastFailed = false;
          persistCompactHistory();
          refreshBladeCompactUi();
        }
      }
      if (state.autoCompactPending) {
        evaluateAutoCompact({ firstSync: false });
      }
      ensureOdometerRunning();
    };
    const onVis = () => {
      if (!document.hidden) {
        state.forceSignalSample = true;
        if (state.cid && !state.streamConnected) {
          connectTelemetryStream(state.cid);
          fetchDaemonTelemetry(state.cid);
        }
        if (state.autoCompactPending) {
          evaluateAutoCompact({ firstSync: false });
        }
        ensureOdometerRunning();
      }
    };

    const onSplitPaneFocusIn = (ev) => {
      const t = ev && ev.target;
      if (!t || typeof t.closest !== 'function' || !state.barEl || !state.barEl.isConnected) return;
      const focusedComp = t.closest('.surface-composer, [data-testid="composer"]');
      if (focusedComp && focusedComp !== state.composer && !isInsideSidebarNav(focusedComp) && isElementVisiblyLaidOut(focusedComp)) {
        mountTokenHud(focusedComp, state.themeCfg || {}, state.themeKeyHint);
      }
    };

    composer.addEventListener('keydown', onCaptureKeyDown, true);
    composer.addEventListener('click', onCaptureSendClick, true);
    document.addEventListener('click', onOutside, true);
    document.addEventListener('focusin', onSplitPaneFocusIn, true);
    document.addEventListener('keydown', onKey);
    composer.addEventListener('input', onComposerInput);
    document.addEventListener('visibilitychange', onVis);

    state.cleanups.push(() => composer.removeEventListener('keydown', onCaptureKeyDown, true));
    state.cleanups.push(() => composer.removeEventListener('click', onCaptureSendClick, true));
    state.cleanups.push(() => document.removeEventListener('click', onOutside, true));
    state.cleanups.push(() => document.removeEventListener('focusin', onSplitPaneFocusIn, true));
    state.cleanups.push(() => document.removeEventListener('keydown', onKey));
    state.cleanups.push(() => composer.removeEventListener('input', onComposerInput));
    state.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

    // Smart heartbeat: monitors cid changes, cools idle blade naturally & serves as resilient fallback if SSE drops
    // Keeps gentle background check when !document.hasFocus() so Kagura Bell still rings on Alt+Tab & offline/preview!
    state.pollTimer = setInterval(() => {
      if (!state.barEl || !state.barEl.isConnected || (state.composer && !state.composer.isConnected)) {
        clearInterval(state.pollTimer);
        state.pollTimer = 0;
        clearCompactTimers();
        abortActiveStream();
        return;
      }
      const bestComp = resolveComposerRoot();
      if (bestComp && bestComp !== state.composer && bestComp.isConnected) {
        mountTokenHud(bestComp, state.themeCfg || {}, state.themeKeyHint);
        return;
      }
      refreshUtilityButtonStates();
      const sig = extractLivePageSignals(state.composer);
      state.cachedSignals = sig;
      state.lastSignalSampleAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

      const desiredCid = sig.explicitCid || sig.cid || 'idle';
      if (desiredCid !== state.cid) {
        switchActiveConversation(desiredCid);
        ensureOdometerRunning();
        return;
      }

      const now = Date.now();
      const curWorking = Boolean(sig.isWorking || state.serverIsWorking);

      // Offline / preview.html / disconnected SSE fallback so Koto chime still rings on turn finish!
      if (!state.streamConnected) {
        if (!state.pollWasWorking && curWorking) {
          if (typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__ && typeof window.__AGY_BIO_AUDIO__.onTelemetry === 'function') {
            try {
              window.__AGY_BIO_AUDIO__.onTelemetry({
                isWorking: true,
                turnFinishedSeq: state.localFinishSeq
              });
            } catch (_) {}
          }
        } else if (state.pollWasWorking && !curWorking) {
          state.localFinishSeq = (state.localFinishSeq || 0) + 1;
          if (typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__ && typeof window.__AGY_BIO_AUDIO__.onTelemetry === 'function') {
            try {
              window.__AGY_BIO_AUDIO__.onTelemetry({
                isWorking: false,
                turnFinishedSeq: state.localFinishSeq
              });
            } catch (_) {}
          }
        }
      }
      state.pollWasWorking = curWorking;

      const workChanged = curWorking !== state.isWorking;
      if (workChanged) {
        state.isWorking = curWorking;
      }
      if (decayBladeHeatWhenIdle(now) || workChanged) {
        computeAndApplyBladeHeat();
      }
      if ((workChanged && !curWorking) || state.autoCompactPending) {
        evaluateAutoCompact({ firstSync: false });
      }

      const isHiddenOrUnfocused =
        typeof document !== 'undefined' && (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus()));

      if (!state.streamConnected && state.cid && state.cid !== 'idle') {
        const minGap = isHiddenOrUnfocused ? Math.max(2800, state.fallbackBackoffMs) : state.fallbackBackoffMs;
        if (now >= state.nextFallbackAt || (sig.isWorking && !isHiddenOrUnfocused && now - (state.nextFallbackAt - state.fallbackBackoffMs) >= minGap)) {
          fetchDaemonTelemetry(state.cid);
        }
      }

      if (isHiddenOrUnfocused && state.hasTelemetry && !curWorking) {
        if (state.dispCtxTokens !== state.serverCtxTokens || state.dispTurnTokens !== state.serverTurnTokens) {
          state.targetCtxTokens = state.serverCtxTokens;
          state.targetTurnTokens = state.serverTurnTokens;
          state.dispCtxTokens = state.serverCtxTokens;
          state.dispTurnTokens = state.serverTurnTokens;
          renderDomValues();
        }
      } else if (!document.hidden && (sig.isWorking || state.wasWorking)) {
        ensureOdometerRunning();
      }
    }, 850);

    const nowInit = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const initSig = extractLivePageSignals(composer);
    state.cachedSignals = initSig;
    state.lastSignalSampleAt = nowInit;
    state.cid = initSig.cid || 'idle';
    state.resolvedCid = initSig.explicitCid || '';
    restoreCompactHistory(getTrackableCompactCid());
    refreshBladeCompactUi();
    state.wasWorking = initSig.isWorking;
    state.pollWasWorking = initSig.isWorking;

    const initChars = measureConversationDomChars();
    state.turnBaselineDomChars = initChars;
    state.stepBaselineDomChars = initChars;
    state.cachedDomChars = initChars;
    state.workStartedAt = nowInit;
    state.lastStepSeenAt = nowInit;
    state.lastHeatDecayAt = Date.now();

    if (
      typeof window !== 'undefined' &&
      window.__AGY_SQUAD_RAID__ &&
      typeof window.__AGY_SQUAD_RAID__.resetConversation === 'function'
    ) {
      try { window.__AGY_SQUAD_RAID__.resetConversation(state.cid); } catch (_) {}
    }

    if (state.cid && state.cid !== 'idle') {
      connectTelemetryStream(state.cid);
      fetchDaemonTelemetry(state.cid).then(() => ensureOdometerRunning());
    } else {
      renderDomValues();
    }
    ensureOdometerRunning();

    return bar;
  }

  function teardownInternal(preserveSessionHistory) {
    state.mountEpoch++;
    state.cidEpoch++;
    state.fetchInFlight = false;
    abortActiveStream();
    resetConversationCompactState();
    if (!preserveSessionHistory) {
      state.everSawExplicitCid = false;
      compactHistoryByCid.clear();
    }
    state.cid = '';
    state.resolvedCid = '';
    state.hasTelemetry = false;
    state.serverIsWorking = null;
    state.isWorking = false;
    state.wasWorking = false;
    state.pollWasWorking = false;
    state.serverCtxTokens = 0;
    state.serverCacheTokens = 0;
    state.serverTurnTokens = 0;
    state.serverTotalOutTokens = 0;
    state.serverTurnSteps = 0;
    state.serverTurnCount = 0;
    state.serverStepCount = 0;
    state.serverTurnCtxDelta = 0;
    state.serverModelName = '';
    state.dispCtxTokens = 0;
    state.dispTurnTokens = 0;
    state.targetCtxTokens = 0;
    state.targetTurnTokens = 0;
    state.burnRateTokPerSec = 0;
    state.peakBurnRateTokPerSec = 0;
    state.lastBurnSampleTokens = 0;
    state.lastBurnSampleAt = 0;
    state.liveDomTurnEst = 0;
    state.workStateItems = [];
    state.lastServerStepIdx = -1;
    state.lastSlashSeq = -1;
    state.bladeBonusHeat = 0;
    state.typingHeatPulse = 0;
    if (state.composerRo) {
      try { state.composerRo.disconnect(); } catch (_) {}
      state.composerRo = null;
    }
    if (state.rafId) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = 0;
    }
    clearTimeout(state.echoTimer);
    state.echoTimer = 0;
    clearTimeout(state.heraldTimer);
    state.heraldTimer = 0;
    clearTimeout(state.heraldGlowTimer);
    state.heraldGlowTimer = 0;
    state.heraldVisible = false;
    state.liveTurnWasWorking = false;
    state.liveTurnWorkStartedMs = 0;
    state.heraldLastApprovalSig = '';
    clearTimeout(state.yoriichiSurgeTimer);
    state.yoriichiSurgeTimer = 0;
    clearTimeout(state.kaguraSyncTimer);
    state.kaguraSyncTimer = 0;
    clearTimeout(state.cinemaSyncTimer);
    state.cinemaSyncTimer = 0;
    clearTimeout(state.streamReconnectTimer);
    state.streamReconnectTimer = 0;
    while (state.cleanups.length > 0) {
      const fn = state.cleanups.pop();
      try { fn(); } catch (_) {}
    }
    if (state.composer && state.composer.dataset) {
      delete state.composer.dataset.agyCrisis;
      delete state.composer.dataset.agyCompact;
      delete state.composer.dataset.agyNpcStack;
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll(`#${HUD_BAR_ID}, #${ECHO_BAR_ID}, #${HERALD_BAR_ID}`).forEach((el) => el.remove());
      document.querySelectorAll('.agy-herald-target-glow').forEach((el) => el.classList.remove('agy-herald-target-glow'));
      const st = document.getElementById(STYLE_ID);
      if (st) st.remove();
      if (document.documentElement) {
        delete document.documentElement.dataset.agyRedBlade;
      }
    }
    if (typeof window !== 'undefined' && window.__AGY_SQUAD_RAID__ && typeof window.__AGY_SQUAD_RAID__.teardown === 'function') {
      try { window.__AGY_SQUAD_RAID__.teardown(); } catch (_) {}
    }
    state.composer = null;
    state.themeCfg = null;
    state.barEl = null;
    state.yoriichiBtnEl = null;
    state.ctxBtnEl = null;
    state.ctxIconWrap = null;
    state.ctxTextEl = null;
    state.ctxNumEl = null;
    state.ctxFillEl = null;
    state.turnBtnEl = null;
    state.turnIconEl = null;
    state.turnTextEl = null;
    state.turnNumEl = null;
    state.turnDraftWrapEl = null;
    state.turnDraftNumEl = null;
    state.bladeBtnEl = null;
    state.bladeFillRectEl = null;
    state.bladeGlowPathEl = null;
    state.bladeLabelEl = null;
    state.kaguraBtnEl = null;
    state.cinemaBtnEl = null;
    state.popoverEl = null;
    state.echoEl = null;
    state.echoHdrLabelEl = null;
    state.echoTextEl = null;
    state.echoAvatarEl = null;
    state.heraldEl = null;
    state.heraldSvgSlotEl = null;
    state.heraldTitleEl = null;
    state.heraldMsgEl = null;
    state.popSessionTitle = null;
    state.popSessionIcon = null;
    state.detCtxVal = null;
    state.detCtxMeter = null;
    state.detCacheVal = null;
    state.detTurnIcon = null;
    state.detTurnVal = null;
    state.detBladeVal = null;
    state.detCompactVal = null;
    state.detDraftVal = null;
    state.detSessionVal = null;
    state.detModelVal = null;
    state.detWorkStateRow = null;
    state.detWorkStateVal = null;
    state.detStatusBadge = null;
    state.cachedSignals = null;
    state.popoverOpen = false;
  }

  function teardown() {
    teardownInternal(false);
  }

  const api = {
    mountTokenHud,
    closePopover: () => setPopoverOpen(false),
    castYoriichiSunBreathing,
    showUserMessageEcho,
    hideUserMessageEcho,
    summonKasugaiHerald,
    dismissKasugaiHerald,
    resolveHeraldCompanion,
    evaluateSmartHeraldOnTurnTransition,
    getHeraldState: () => ({
      visible: Boolean(state.heraldVisible && state.heraldEl && state.heraldEl.dataset.visible === '1'),
      kind: state.heraldKind,
      charId: state.heraldCharId,
      companionName: state.heraldCompanionName,
      lastReason: state.heraldLastTriggerReason,
      lastShownAt: state.heraldLastShownAt
    }),
    ingestTelemetrySnapshot,
    getBladeBonusHeat: () => state.bladeBonusHeat,
    getBladeHeat: () => state.bladeHeat,
    setBladeBonusHeat: (bonus) => {
      if (!state.barEl || !state.barEl.isConnected) return;
      state.bladeBonusHeat = Math.max(0, Math.min(100, Number(bonus) || 0));
      state.bonusHoldUntil = Date.now() + 18000;
      computeAndApplyBladeHeat();
    },
    triggerCompact: (opts) => triggerCompactSession(opts),
    isAutoCompactEnabled: () => Boolean(state.autoCompactEnabled),
    setAutoCompactEnabled: (enabled, opts) => setAutoCompactEnabled(enabled, opts),
    getAutoCompactThreshold: () => AUTO_COMPACT_THRESHOLD,
    getCompactState: () => ({
      enabled: Boolean(state.autoCompactEnabled),
      threshold: AUTO_COMPACT_THRESHOLD,
      rearmBelow: AUTO_COMPACT_REARM_BELOW,
      pending: Boolean(state.autoCompactPending),
      disarmed: Boolean(state.autoCompactDisarmed),
      inFlight: Boolean(state.compactInFlight),
      failed: Boolean(state.compactLastFailed),
      waitingLiveTurn: Boolean(state.autoCompactWaitingLiveTurn)
    }),
    triggerCrisisSlashDemo: (reason) => {
      executeDemonSlayCelebration(Date.now(), reason || 'Ác Quỷ Diệt Sát • Toàn bộ kiểm thử Exit 0!');
    },
    teardown,
    destroy: teardown,
    refresh: () => {
      state.forceSignalSample = true;
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
