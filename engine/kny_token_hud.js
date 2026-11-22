(() => {
  'use strict';

  /**
   * Antigravity Live Context & Real-Time Turn Token HUD
   * Mounts #agy-token-context-bar on the top-left edge of .surface-composer
   * (symmetrical counterpart to #agy-chibi-skill-bar & Chibi on the top-right).
   *
   * Combines:
   *  1. Exact server token telemetry from daemon /__telemetry?cid=<uuid> (transcript.jsonl:
   *     input_tokens, cache_read_tokens, output_tokens, step_index).
   *  2. Real-time 60fps streaming token odometer during active AI thinking/tool execution
   *     (detecting React Fiber isRunning + live DOM streaming character delta).
   *  3. Zero idle CPU: rAF counter halts completely once numbers settle after turn completion.
   */

  const HUD_BAR_ID = 'agy-token-context-bar';
  const STYLE_ID = 'antigravity-kny-token-hud-style';
  const DEFAULT_CONTEXT_WINDOW = 1048576; // 1M context window standard

  const state = {
    composer: null,
    barEl: null,
    ctxBtnEl: null,
    ctxTextEl: null,
    ctxFillEl: null,
    turnBtnEl: null,
    turnIconEl: null,
    turnTextEl: null,
    popoverEl: null,
    popoverOpen: false,

    // Detail rows inside popover
    detCtxVal: null,
    detCtxMeter: null,
    detCacheVal: null,
    detTurnVal: null,
    detDraftVal: null,
    detSessionVal: null,
    detModelVal: null,
    detStatusBadge: null,

    // Runtime telemetry & live animation state
    cid: '',
    isWorking: false,
    wasWorking: false,
    workStartedAt: 0,
    lastStepSeenAt: 0,
    lastServerStepIdx: -1,

    serverCtxTokens: 0,
    serverCacheTokens: 0,
    serverTurnTokens: 0,
    serverTotalOutTokens: 0,
    serverTurnSteps: 0,
    serverTurnCtxDelta: 0,
    hasTelemetry: false,

    // Live DOM streaming measurement
    turnBaselineDomChars: 0,
    stepBaselineDomChars: 0,
    liveDomTurnEst: 0,
    draftTokens: 0,
    modelLabel: '',
    quotaPct: null,

    // Smooth odometer display numbers
    dispCtxTokens: 0,
    dispTurnTokens: 0,
    targetCtxTokens: 0,
    targetTurnTokens: 0,

    rafId: 0,
    pollTimer: 0,
    fetchInFlight: false,
    cleanups: []
  };

  function formatCompactTokens(n) {
    const val = Math.max(0, Math.round(Number(n) || 0));
    if (val >= 1000000) {
      return (val / 1000000).toFixed(2) + 'M';
    }
    if (val >= 10000) {
      return (val / 1000).toFixed(1) + 'K';
    }
    if (val >= 1000) {
      return (val / 1000).toFixed(2) + 'K';
    }
    return String(val);
  }

  function formatExactInt(n) {
    const val = Math.max(0, Math.round(Number(n) || 0));
    return val.toLocaleString('en-US');
  }

  function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${HUD_BAR_ID} {
        position: absolute;
        bottom: calc(100% + 5px);
        left: 8px;
        z-index: 59;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        pointer-events: auto;
        font-family: 'Segoe UI', Inter, system-ui, -apple-system, sans-serif;
        font-variant-numeric: tabular-nums;
        user-select: none;
      }

      /* Adapt gracefully on narrow split panes so left & right bars never overlap */
      @media (max-width: 780px) {
        #${HUD_BAR_ID} .agy-tok-ctx-prefix {
          display: none;
        }
      }
      @media (max-width: 560px) {
        #${HUD_BAR_ID} {
          bottom: calc(100% + 33px);
          left: 8px;
        }
      }

      .agy-tok-pill {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 4.5px;
        padding: 3.5px 9.5px;
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

      /* Subtle bottom context gauge inside the Context Pill */
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

      /* Active working / computing state on the Turn Token Pill */
      .agy-tok-turn-pill[data-working="1"] {
        border-color: var(--tok-secondary, #5eead4);
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, var(--tok-surface, rgba(16, 12, 34, 0.96)) 100%);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.52), 0 0 16px var(--tok-glow, rgba(94, 234, 212, 0.48));
      }
      .agy-tok-spin-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10.5px;
        line-height: 1;
      }
      @media (prefers-reduced-motion: no-preference) {
        .agy-tok-turn-pill[data-working="1"] .agy-tok-spin-dot {
          animation: agyTokPulseSpin 1.15s linear infinite;
        }
      }
      @keyframes agyTokPulseSpin {
        0%   { transform: rotate(0deg) scale(1); filter: brightness(1); }
        50%  { transform: rotate(180deg) scale(1.16); filter: brightness(1.3); }
        100% { transform: rotate(360deg) scale(1); filter: brightness(1); }
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
        color: rgba(226, 232, 240, 0.78);
        font-size: 10px;
        font-weight: 600;
      }

      /* Detailed Context & Token Breakdown Popover */
      .agy-tok-popover {
        position: absolute;
        bottom: calc(100% + 7px);
        left: 0;
        width: 292px;
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
        padding-bottom: 5px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.11);
      }
      .agy-tok-pop-title {
        font-size: 11.2px;
        font-weight: 700;
        color: var(--tok-primary, #facc15);
        letter-spacing: 0.15px;
      }
      .agy-tok-status-badge {
        padding: 1.5px 6.5px;
        border-radius: 9999px;
        font-size: 9.8px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.09);
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #e2e8f0;
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
        gap: 4.5px;
        font-size: 11px;
      }
      .agy-tok-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .agy-tok-lbl {
        color: rgba(226, 232, 240, 0.78);
      }
      .agy-tok-val {
        color: #ffffff;
        font-weight: 600;
        text-align: right;
      }
    `;
    document.head.appendChild(st);
  }

  function extractLivePageSignals(composerEl) {
    let cid = '';
    let isWorking = false;
    let modelLabel = '';
    let quotaPct = null;

    if (typeof window !== 'undefined' && window.location && window.location.pathname) {
      const m = window.location.pathname.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) cid = m[1].toLowerCase();
    }

    // Inspect React Fiber around .surface-composer for exact isRunning, conversationId, model & quota
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

    // DOM fallback for active execution indicator
    if (!isWorking && typeof document !== 'undefined') {
      const cancelBtn = document.querySelector('[data-testid="input-cancel-button"], button[aria-label="Stop execution"]');
      if (cancelBtn && cancelBtn.offsetParent !== null) {
        isWorking = true;
      }
    }

    // Measure draft input tokens in composer textbox/contenteditable
    let draftChars = 0;
    if (comp) {
      const editor = comp.querySelector('textarea, [contenteditable="true"]');
      if (editor) {
        const raw = typeof editor.value === 'string' ? editor.value : (editor.textContent || '');
        draftChars = raw.trim().length;
      }
    }
    const draftTokens = draftChars > 0 ? Math.max(1, Math.round(draftChars / 3.6)) : 0;

    return { cid, isWorking, modelLabel, quotaPct, draftTokens };
  }

  function measureConversationDomChars() {
    if (typeof document === 'undefined') return 0;
    // Scope strictly to the conversation column containing .surface-composer (excludes right-hand code/file viewer tabs!)
    const comp = state.composer || document.querySelector('.surface-composer');
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

  async function fetchDaemonTelemetry(cid) {
    if (!cid || state.fetchInFlight) return;
    const base = (typeof window !== 'undefined' && window.__AGY_ASSET_BASE__) || '';
    if (!base || !base.startsWith('http')) return;

    state.fetchInFlight = true;
    try {
      const url = base.replace(/\/?$/, '/') + `__telemetry?cid=${encodeURIComponent(cid)}&_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.ok || data.cid !== state.cid) return;

      const firstSync = !state.hasTelemetry;
      state.hasTelemetry = true;
      state.serverCtxTokens = Number(data.contextTokens) || 0;
      state.serverCacheTokens = Number(data.cacheTokens) || 0;
      state.serverTurnTokens = Number(data.turnOutputTokens) || 0;
      state.serverTotalOutTokens = Number(data.totalOutputTokens) || 0;
      state.serverTurnSteps = Number(data.turnSteps) || 0;
      state.serverTurnCtxDelta = Number(data.turnContextDelta) || 0;

      if (firstSync) {
        state.dispCtxTokens = state.serverCtxTokens;
        state.dispTurnTokens = state.serverTurnTokens;
        state.stepBaselineDomChars = measureConversationDomChars();
      }

      if (typeof data.latestStepIndex === 'number' && data.latestStepIndex !== state.lastServerStepIdx) {
        state.lastServerStepIdx = data.latestStepIndex;
        state.lastStepSeenAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        state.stepBaselineDomChars = measureConversationDomChars();
      }
    } catch (_) {
      // Graceful fallback to DOM estimation when offline or in preview.html
    } finally {
      state.fetchInFlight = false;
    }
  }

  function recomputeTargets(nowMs) {
    const sig = extractLivePageSignals(state.composer);
    const prevCid = state.cid;

    if (sig.cid && sig.cid !== prevCid) {
      state.cid = sig.cid;
      state.hasTelemetry = false;
      state.serverCtxTokens = 0;
      state.serverTurnTokens = 0;
      state.dispCtxTokens = 0;
      state.dispTurnTokens = 0;
      state.lastServerStepIdx = -1;
      fetchDaemonTelemetry(sig.cid);
    }

    state.isWorking = sig.isWorking;
    state.draftTokens = sig.draftTokens;
    if (sig.modelLabel) state.modelLabel = sig.modelLabel;
    if (sig.quotaPct !== null) state.quotaPct = sig.quotaPct;

    const domChars = measureConversationDomChars();

    // Detect start of a brand-new calculation turn!
    if (state.isWorking && !state.wasWorking) {
      state.workStartedAt = nowMs;
      state.lastStepSeenAt = nowMs;
      state.turnBaselineDomChars = domChars;
      state.stepBaselineDomChars = domChars;
      state.dispTurnTokens = 0;
      if (state.cid) fetchDaemonTelemetry(state.cid);
    } else if (!state.isWorking && state.wasWorking) {
      // Turn just finished — fetch final exact transcript numbers immediately!
      if (state.cid) fetchDaemonTelemetry(state.cid);
    }
    state.wasWorking = state.isWorking;

    if (state.hasTelemetry) {
      let liveTurn = state.serverTurnTokens;
      let liveCtx = state.serverCtxTokens;

      if (state.isWorking) {
        // Add real-time streamed DOM characters inside chat column since last step flush + smooth thinking pulse
        const rawCharDiff = domChars - state.stepBaselineDomChars;
        // Guard against large jumps from expanding/collapsing old sections
        const safeCharDiff = (rawCharDiff > 0 && rawCharDiff < 24000) ? rawCharDiff : 0;
        if (rawCharDiff < -200 || rawCharDiff >= 24000) {
          state.stepBaselineDomChars = domChars;
        }
        const stepDomDelta = Math.round(safeCharDiff / 3.7);
        const sinceStepSec = Math.max(0, (nowMs - (state.lastStepSeenAt || state.workStartedAt || nowMs)) / 1000);
        // Gentle asymptotic thinking pulse while model reasons internally before flushing step
        const thinkingPulse = Math.round(Math.min(380, sinceStepSec * 19));
        const inFlightExtra = Math.max(stepDomDelta, thinkingPulse);

        liveTurn = state.serverTurnTokens + inFlightExtra;
        liveCtx = state.serverCtxTokens + inFlightExtra;
      }

      state.targetTurnTokens = liveTurn;
      state.targetCtxTokens = liveCtx;
    } else {
      // Pure DOM fallback (e.g., standalone preview.html or brand-new unsaved conversation)
      const estCtx = Math.max(240, Math.round(domChars / 3.7));
      state.targetCtxTokens = estCtx + state.draftTokens;
      if (state.isWorking) {
        const elapsedSec = Math.max(0, (nowMs - (state.workStartedAt || nowMs)) / 1000);
        const domDelta = Math.max(0, Math.round((domChars - state.turnBaselineDomChars) / 3.6));
        state.targetTurnTokens = Math.max(domDelta, Math.round(elapsedSec * 24));
      } else {
        state.targetTurnTokens = state.liveDomTurnEst;
      }
      if (state.isWorking) state.liveDomTurnEst = state.targetTurnTokens;
    }

    // Initialize display immediately on first load so it doesn't count from 0 on page open
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
    if (state.turnIconEl) {
      state.turnIconEl.textContent = state.isWorking ? '✴️' : '⚡';
    }
    if (state.turnTextEl) {
      const draftSuffix = (!state.isWorking && state.draftTokens > 0)
        ? ` <span class="agy-tok-draft-tag">• ✎+${formatCompactTokens(state.draftTokens)}</span>`
        : '';
      if (state.isWorking) {
        state.turnTextEl.innerHTML =
          `Lượt: <span class="agy-tok-num">+${formatExactInt(turnRounded)}</span> tok`;
      } else {
        state.turnTextEl.innerHTML =
          `Lượt: <span class="agy-tok-num">+${formatCompactTokens(turnRounded)}</span> tok${draftSuffix}`;
      }
    }

    if (state.popoverOpen) {
      if (state.detStatusBadge) {
        state.detStatusBadge.textContent = state.isWorking ? '✴️ Đang tính toán...' : '✓ Đã chốt lượt';
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

    // Smooth exponential interpolation toward target numbers
    const lerpRate = state.isWorking ? 0.18 : 0.28;
    const dCtx = state.targetCtxTokens - state.dispCtxTokens;
    const dTurn = state.targetTurnTokens - state.dispTurnTokens;

    if (Math.abs(dCtx) > 0.6) {
      state.dispCtxTokens += dCtx * lerpRate;
    } else {
      state.dispCtxTokens = state.targetCtxTokens;
    }

    if (Math.abs(dTurn) > 0.6) {
      // Never count backwards visually while actively working unless turn reset
      if (state.isWorking && dTurn < 0 && state.targetTurnTokens > 0) {
        // Hold steady until real output catches up to thinking pulse
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

  function applyThemeColors(bar, themeCfg) {
    const cfg = themeCfg && typeof themeCfg === 'object' ? themeCfg : {};
    bar.style.setProperty('--tok-primary', cfg.primary || '#38bdf8');
    bar.style.setProperty('--tok-secondary', cfg.secondary || '#e879f9');
    bar.style.setProperty('--tok-border', cfg.borderColor || 'rgba(148, 163, 184, 0.45)');
    bar.style.setProperty('--tok-glow', cfg.glow || 'rgba(56, 189, 248, 0.28)');
    bar.style.setProperty('--tok-surface', cfg.modalBg || 'rgba(15, 11, 30, 0.95)');
  }

  function createRow(label) {
    const row = document.createElement('div');
    row.className = 'agy-tok-row';
    const l = document.createElement('span');
    l.className = 'agy-tok-lbl';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'agy-tok-val';
    v.textContent = '0';
    row.appendChild(l);
    row.appendChild(v);
    return { row, valEl: v };
  }

  function mountTokenHud(composerEl, themeCfg) {
    if (typeof document === 'undefined') return null;
    const composer = composerEl || document.querySelector('.surface-composer');
    if (!composer) return null;

    ensureStyles();

    const existing = document.getElementById(HUD_BAR_ID);
    if (existing && existing.parentElement === composer && state.barEl === existing) {
      applyThemeColors(existing, themeCfg);
      ensureOdometerRunning();
      return existing;
    }

    teardown();

    state.composer = composer;
    const bar = document.createElement('div');
    bar.id = HUD_BAR_ID;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Thông số Ngữ cảnh và Token thời gian thực');
    applyThemeColors(bar, themeCfg);

    // 1. Context Window Pill ("🧠 Ngữ cảnh: 240.6K")
    const ctxBtn = document.createElement('button');
    ctxBtn.type = 'button';
    ctxBtn.className = 'agy-tok-pill agy-tok-ctx-pill';
    ctxBtn.title = 'Xem chi tiết Ngữ cảnh (Context Window), KV-Cache & Token';

    const ctxIcon = document.createElement('span');
    ctxIcon.textContent = '🧠';
    const ctxText = document.createElement('span');
    ctxText.innerHTML = '<span class="agy-tok-ctx-prefix">Ngữ cảnh: </span><span class="agy-tok-num">0</span>';

    const ctxTrack = document.createElement('span');
    ctxTrack.className = 'agy-tok-ctx-track';
    const ctxFill = document.createElement('span');
    ctxFill.className = 'agy-tok-ctx-fill';
    ctxTrack.appendChild(ctxFill);

    ctxBtn.appendChild(ctxIcon);
    ctxBtn.appendChild(ctxText);
    ctxBtn.appendChild(ctxTrack);

    // 2. Real-time Turn Token Counter Pill ("⚡ Lượt: +1,842 tok")
    const turnBtn = document.createElement('button');
    turnBtn.type = 'button';
    turnBtn.className = 'agy-tok-pill agy-tok-turn-pill';
    turnBtn.title = 'Số Token chạy trực tiếp trong lượt suy nghĩ & làm việc hiện tại';

    const turnIcon = document.createElement('span');
    turnIcon.className = 'agy-tok-spin-dot';
    turnIcon.textContent = '⚡';
    const turnText = document.createElement('span');
    turnText.innerHTML = 'Lượt: <span class="agy-tok-num">+0</span> tok';

    turnBtn.appendChild(turnIcon);
    turnBtn.appendChild(turnText);

    // 3. Detailed Breakdown Popover
    const pop = document.createElement('div');
    pop.className = 'agy-tok-popover';

    const hdr = document.createElement('div');
    hdr.className = 'agy-tok-pop-hdr';
    const hdrTitle = document.createElement('span');
    hdrTitle.className = 'agy-tok-pop-title';
    hdrTitle.textContent = '🧠 Ngữ Cảnh & Bộ Đếm Token';
    const badge = document.createElement('span');
    badge.className = 'agy-tok-status-badge';
    badge.textContent = '✓ Sẵn sàng';
    hdr.appendChild(hdrTitle);
    hdr.appendChild(badge);

    const meterWrap = document.createElement('div');
    meterWrap.className = 'agy-tok-meter-bar';
    const meterFill = document.createElement('div');
    meterFill.className = 'agy-tok-meter-fill';
    meterWrap.appendChild(meterFill);

    const rows = document.createElement('div');
    rows.className = 'agy-tok-rows';
    const rCtx = createRow('Ngữ cảnh (Context):');
    const rCache = createRow('Bộ nhớ đệm (KV-Cache):');
    const rTurn = createRow('Token lượt hiện tại:');
    const rDraft = createRow('Đang gõ trong ô chat:');
    const rSession = createRow('Tổng sinh ra cả phiên:');
    const rModel = createRow('Mô hình & Hạn mức:');

    [rCtx, rCache, rTurn, rDraft, rSession, rModel].forEach((r) => rows.appendChild(r.row));

    pop.appendChild(hdr);
    pop.appendChild(meterWrap);
    pop.appendChild(rows);

    bar.appendChild(ctxBtn);
    bar.appendChild(turnBtn);
    bar.appendChild(pop);
    composer.appendChild(bar);

    state.barEl = bar;
    state.ctxBtnEl = ctxBtn;
    state.ctxTextEl = ctxText;
    state.ctxFillEl = ctxFill;
    state.turnBtnEl = turnBtn;
    state.turnIconEl = turnIcon;
    state.turnTextEl = turnText;
    state.popoverEl = pop;

    state.detStatusBadge = badge;
    state.detCtxVal = rCtx.valEl;
    state.detCtxMeter = meterFill;
    state.detCacheVal = rCache.valEl;
    state.detTurnVal = rTurn.valEl;
    state.detDraftVal = rDraft.valEl;
    state.detSessionVal = rSession.valEl;
    state.detModelVal = rModel.valEl;

    const onToggle = (ev) => {
      ev.stopPropagation();
      setPopoverOpen(!state.popoverOpen);
      if (state.cid) fetchDaemonTelemetry(state.cid);
      ensureOdometerRunning();
    };
    ctxBtn.addEventListener('click', onToggle);
    turnBtn.addEventListener('click', onToggle);

    const onOutside = (ev) => {
      if (state.popoverOpen && bar && !bar.contains(ev.target)) {
        setPopoverOpen(false);
      }
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape' && state.popoverOpen) setPopoverOpen(false);
    };
    const onComposerInput = () => ensureOdometerRunning();
    const onVis = () => {
      if (!document.hidden) {
        if (state.cid) fetchDaemonTelemetry(state.cid);
        ensureOdometerRunning();
      }
    };

    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
    composer.addEventListener('input', onComposerInput);
    document.addEventListener('visibilitychange', onVis);

    state.cleanups.push(() => document.removeEventListener('click', onOutside));
    state.cleanups.push(() => document.removeEventListener('keydown', onKey));
    state.cleanups.push(() => composer.removeEventListener('input', onComposerInput));
    state.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

    // Adaptive polling: fast (700ms) while AI is computing/working, ultra-light check when idle
    let idleCounter = 0;
    state.pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const sig = extractLivePageSignals(state.composer);
      if (sig.isWorking || sig.cid !== state.cid) {
        idleCounter = 0;
        if (sig.cid) fetchDaemonTelemetry(sig.cid);
        ensureOdometerRunning();
      } else {
        idleCounter++;
        if (state.wasWorking) {
          if (sig.cid) fetchDaemonTelemetry(sig.cid);
          ensureOdometerRunning();
        } else if (idleCounter % 6 === 0 && sig.cid) {
          fetchDaemonTelemetry(sig.cid).then(() => ensureOdometerRunning());
        }
      }
    }, 700);

    // Kick off initial baseline & telemetry read
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
      fetchDaemonTelemetry(state.cid).then(() => ensureOdometerRunning());
    }
    ensureOdometerRunning();

    return bar;
  }

  function teardown() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = 0;
    }
    while (state.cleanups.length > 0) {
      const fn = state.cleanups.pop();
      try { fn(); } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll(`#${HUD_BAR_ID}`).forEach((el) => el.remove());
    }
    state.composer = null;
    state.barEl = null;
    state.popoverOpen = false;
  }

  const api = {
    mountTokenHud,
    teardown,
    refresh: () => {
      if (state.cid) fetchDaemonTelemetry(state.cid);
      ensureOdometerRunning();
    }
  };

  if (typeof window !== 'undefined') {
    window.__AGY_TOKEN_HUD__ = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__AGY_TOKEN_HUD__ = api;
  }
})();
