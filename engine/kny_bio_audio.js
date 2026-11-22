// ============================================================================
// Kimetsu no Yaiba — 0 KB Bio-Acoustic Kagura & Circadian Guard (kny_bio_audio.js)
// Exposes window.__AGY_BIO_AUDIO__
// 100% Pure Mathematical Web Audio Synthesis (0 KB external MP3/WAV, 0% idle CPU)
// + Bio-Circadian Retinal Guard (Night Care 01:30–05:54 & Yoriichi Dawn 05:55–06:30)
// Built strictly with createElement + textContent (Zero XSS surface).
// ============================================================================

(() => {
  'use strict';

  const ROOT = typeof window !== 'undefined' ? window : globalThis;

  // Clean teardown on hot-reload if a previous instance exists
  if (ROOT.__AGY_BIO_AUDIO__ && typeof ROOT.__AGY_BIO_AUDIO__.destroy === 'function') {
    try { ROOT.__AGY_BIO_AUDIO__.destroy({ isReinject: true }); } catch (_) {}
  }

  const STORAGE_KEY = 'agy_kny_audio_prefs';
  const SFX_MUTE_STORAGE_KEY = 'agy_kny_sfx_muted';
  const NIGHT_TOAST_SESSION_KEY = 'agy_kny_night_care_shown_date';
  const STYLE_ID = 'antigravity-kny-bio-audio-style';
  const POPOVER_ID = 'agy-kny-bio-audio-popover';
  const TOAST_ID = 'agy-kny-circadian-toast';
  const CIRCADIAN_VEIL_TAG = 'agy-circadian-veil';
  const CIRCADIAN_VEIL_ID = 'agy-kny-circadian-veil';
  const DAWN_GLOW_ID = 'agy-kny-dawn-glow-layer';
  const HUD_BAR_ID = 'agy-token-context-bar';
  const AUTO_HUD_BTN_ID = 'agy-bio-audio-hud-btn';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULT_PREFS = Object.freeze({
    enabled: true,
    chimeEnabled: true,
    swordSfxEnabled: true,
    ambientMode: 'off', // 'off' | 'rain' | 'hearth'
    nightCare: true
  });

  // Japanese Pentatonic Scales (Yo & Miyako-bushi / Hirajoshi)
  // Phrase A: D5 - F5 - A5 - C6 (Warm Yo Dawn Scale)
  // Phrase B: E5 - F#5 - B5 - E6 (Serene Butterfly Estate Scale)
  const KOTO_PHRASES = [
    [587.33, 698.46, 880.00, 1046.50],
    [659.25, 739.99, 987.77, 1318.51]
  ];
  const FURIN_HARMONICS = [
    [2349.32, 3520.00], // D7 + A7
    [2637.02, 3951.07]  // E7 + B7
  ];

  function getSecHelper() {
    if (typeof __AGY_SEC__ === 'object' && __AGY_SEC__) return __AGY_SEC__;
    return null;
  }

  function safeStripProto(obj) {
    const sec = getSecHelper();
    if (sec && typeof sec.stripProtoKeys === 'function') {
      return sec.stripProtoKeys(obj);
    }
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = obj[k];
    }
    return out;
  }

  function loadPrefs() {
    try {
      if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PREFS };
      const parsed = safeStripProto(JSON.parse(raw));
      const mode = (parsed.ambientMode === 'rain' || parsed.ambientMode === 'hearth') ? parsed.ambientMode : 'off';
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PREFS.enabled,
        chimeEnabled: typeof parsed.chimeEnabled === 'boolean' ? parsed.chimeEnabled : DEFAULT_PREFS.chimeEnabled,
        swordSfxEnabled: typeof parsed.swordSfxEnabled === 'boolean' ? parsed.swordSfxEnabled : DEFAULT_PREFS.swordSfxEnabled,
        ambientMode: mode,
        nightCare: typeof parsed.nightCare === 'boolean' ? parsed.nightCare : DEFAULT_PREFS.nightCare
      };
    } catch (_) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(prefs) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          enabled: Boolean(prefs.enabled),
          chimeEnabled: Boolean(prefs.chimeEnabled),
          swordSfxEnabled: Boolean(prefs.swordSfxEnabled),
          ambientMode: (prefs.ambientMode === 'rain' || prefs.ambientMode === 'hearth') ? prefs.ambientMode : 'off',
          nightCare: Boolean(prefs.nightCare)
        }));
      }
    } catch (_) {}
  }

  const state = {
    prefs: loadPrefs(),
    destroyed: false,
    userInteracted: Boolean(
      ROOT.__AGY_AUDIO_UNLOCKED__ ||
      (typeof navigator !== 'undefined' && navigator.userActivation && navigator.userActivation.hasBeenActive)
    ),
    audioCtx: null,
    audioCtxStateHandler: null,
    noiseBuffers: {
      pink: null,
      brown: null,
      white: null
    },
    ambientNodes: null,
    ambientFadeTimer: 0,
    pendingAmbientCleanup: null,
    hearthCrackleTimer: 0,
    suspendTimer: 0,
    pendingResumeTimers: new Set(),
    activeOneShotUntil: 0,
    phraseCursor: 0,
    lastChimeAt: 0,
    lastSheatheAt: 0,
    lastDrawAt: 0,

    // Telemetry sequence baselines
    telemetryPrimed: false,
    lastTurnFinishedSeq: null,
    lastSlashSeq: null,
    lastWorkingState: false,

    // Circadian guard
    circadianTimer: 0,
    circadianPhase: 'day', // 'day' | 'night' | 'dawn'
    nightToastShownDate: '',
    toastHideTimer: 0,

    // UI Popover & HUD hook
    popoverEl: null,
    anchorEl: null,
    chimeSwitchEl: null,
    swordSwitchEl: null,
    syncingSwordSfx: false,
    hudMountTimer: 0,
    initHudTimer: 0,
    cleanups: []
  };

  /* ==========================================================================
   * 1. LAZY WEB AUDIO ENGINE & ZERO-CPU AUTO-SUSPEND
   * ========================================================================== */

  function disconnectAll(nodes) {
    if (!Array.isArray(nodes)) return;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n && typeof n.disconnect === 'function') {
        try { n.disconnect(); } catch (_) {}
      }
    }
  }

  function isExternalSwordSfxMuted() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(SFX_MUTE_STORAGE_KEY);
        if (raw === '1' || raw === 'true') return true;
      }
    } catch (_) {}
    return false;
  }

  function getAudioContextCtor() {
    if (typeof ROOT === 'undefined') return null;
    return ROOT.AudioContext || ROOT.webkitAudioContext || null;
  }

  function detachAudioCtxListener(ctx) {
    const target = ctx || state.audioCtx;
    if (target && state.audioCtxStateHandler && typeof target.removeEventListener === 'function') {
      try { target.removeEventListener('statechange', state.audioCtxStateHandler); } catch (_) {}
    }
    state.audioCtxStateHandler = null;
  }

  function ensureAudioContext() {
    if (state.destroyed || !state.userInteracted) return null;
    if (!state.audioCtx || state.audioCtx.state === 'closed') {
      detachAudioCtxListener(state.audioCtx);
      const Ctor = getAudioContextCtor();
      if (!Ctor) return null;
      try {
        state.audioCtx = new Ctor({ latencyHint: 'interactive' });
      } catch (_) {
        try {
          state.audioCtx = new Ctor();
        } catch (_e) {
          return null;
        }
      }
      if (state.audioCtx && typeof state.audioCtx.addEventListener === 'function') {
        state.audioCtxStateHandler = () => {
          if (state.destroyed || !state.audioCtx) return;
          const keepAlive = state.lastWorkingState ||
            (state.prefs.enabled && state.prefs.ambientMode !== 'off' && Boolean(state.ambientNodes));
          if (keepAlive && (state.audioCtx.state === 'suspended' || state.audioCtx.state === 'interrupted')) {
            try { state.audioCtx.resume().catch(() => {}); } catch (_) {}
          }
        };
        state.audioCtx.addEventListener('statechange', state.audioCtxStateHandler);
      }
    }
    if (state.audioCtx && state.audioCtx.state !== 'running' && state.audioCtx.state !== 'closed') {
      try {
        state.audioCtx.resume().catch(() => {});
      } catch (_) {}
    }
    return state.audioCtx;
  }

  /**
   * Ensures AudioContext is 'running' before computing ctx.currentTime + 0.015 and constructing nodes.
   * Races ctx.resume() against maxWaitMs (1200ms) so WASAPI/CoreAudio wake latency never clips the
   * first Koto note AND backgrounded blocked contexts never fire stale chimes minutes later.
   */
  function withRunningAudioContext(maxWaitMs, fn) {
    if (state.destroyed || typeof fn !== 'function') return false;
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state === 'closed') return false;

    if (ctx.state === 'running') {
      try {
        fn(ctx);
        return true;
      } catch (_) {
        return false;
      }
    }

    clearTimeout(state.suspendTimer);
    state.suspendTimer = 0;

    const limitMs = (typeof maxWaitMs === 'number' && maxWaitMs > 0) ? maxWaitMs : 1200;
    let settled = false;
    let timerId = 0;
    const releaseTimer = () => {
      if (timerId) {
        clearTimeout(timerId);
        state.pendingResumeTimers.delete(timerId);
        timerId = 0;
      }
    };

    try {
      const resumePromise = ctx.resume();
      if (!resumePromise || typeof resumePromise.then !== 'function') {
        if (ctx.state === 'running') {
          try { fn(ctx); return true; } catch (_) { return false; }
        }
        scheduleAutoSuspend();
        return false;
      }

      timerId = setTimeout(() => {
        state.pendingResumeTimers.delete(timerId);
        timerId = 0;
        if (settled || state.destroyed) return;
        settled = true;
        scheduleAutoSuspend();
      }, limitMs);
      state.pendingResumeTimers.add(timerId);

      resumePromise.then(() => {
        releaseTimer();
        if (settled || state.destroyed || ctx !== state.audioCtx || ctx.state !== 'running') {
          if (!settled && !state.destroyed) scheduleAutoSuspend();
          settled = true;
          return;
        }
        settled = true;
        try { fn(ctx); } catch (_) {}
      }).catch(() => {
        releaseTimer();
        if (!settled) {
          settled = true;
          if (!state.destroyed) scheduleAutoSuspend();
        }
      });

      // Chưa ở trạng thái 'running' tại thời điểm gọi đồng bộ: chỉ trả false để tránh báo phát thành công sai khi resume() bị từ chối/chặn Autoplay
      return false;
    } catch (_) {
      releaseTimer();
      scheduleAutoSuspend();
      return false;
    }
  }

  function markOneShotActivity(durationSec) {
    const nowMs = Date.now();
    const targetUntil = nowMs + Math.ceil((Number(durationSec) || 1.0) * 1000) + 220;
    if (targetUntil > state.activeOneShotUntil) {
      state.activeOneShotUntil = targetUntil;
    }
    scheduleAutoSuspend();
  }

  function scheduleAutoSuspend() {
    clearTimeout(state.suspendTimer);
    state.suspendTimer = 0;
    if (state.destroyed || !state.audioCtx) return;
    // CRITICAL-02: NEVER suspend AudioContext while AI is actively reasoning (lastWorkingState === true)
    // Empty WebAudio graph consumes 0% CPU while keeping background Alt+Tab Koto/Furin chime instant!
    if (state.lastWorkingState) {
      return;
    }
    if (state.prefs.enabled && state.prefs.ambientMode !== 'off' && state.ambientNodes) {
      return; // Keep running smoothly while Alpha-wave ambient soundscape is active
    }
    const waitMs = Math.max(350, state.activeOneShotUntil - Date.now() + 180);
    state.suspendTimer = setTimeout(() => {
      state.suspendTimer = 0;
      if (state.destroyed || !state.audioCtx) return;
      if (state.lastWorkingState) return;
      if (state.prefs.enabled && state.prefs.ambientMode !== 'off' && state.ambientNodes) return;
      if (Date.now() < state.activeOneShotUntil) {
        scheduleAutoSuspend();
        return;
      }
      if (state.audioCtx.state === 'running') {
        try {
          state.audioCtx.suspend().catch(() => {});
        } catch (_) {}
      }
    }, waitMs);
  }

  /**
   * Generates seamless crossfaded procedural noise buffers (0 KB external files, zero loop click).
   */
  function getNoiseBuffer(ctx, kind) {
    if (state.noiseBuffers[kind]) return state.noiseBuffers[kind];
    const sampleRate = ctx.sampleRate || 44100;
    const durationSec = kind === 'white' ? 0.8 : 4.2;
    const length = Math.floor(sampleRate * durationSec);
    const buf = ctx.createBuffer(1, length, sampleRate);
    const data = buf.getChannelData(0);

    if (kind === 'white') {
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } else if (kind === 'pink') {
      // Paul Kellet's refined Pink Noise filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const sample = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = sample * 0.11;
      }
    } else {
      // Integrated Brownian / Warm Deep Noise
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.022 * white) / 1.022;
        data[i] = lastOut * 3.1;
      }
    }

    // Equal-power boundary crossfade (120ms) so infinite loop has 0 seam click
    if (kind !== 'white') {
      const fadeSamples = Math.min(Math.floor(sampleRate * 0.12), Math.floor(length * 0.2));
      for (let i = 0; i < fadeSamples; i++) {
        const alpha = i / fadeSamples;
        const wIn = Math.sin(alpha * Math.PI * 0.5);
        const wOut = Math.cos(alpha * Math.PI * 0.5);
        const tailIdx = length - fadeSamples + i;
        const blended = data[i] * wIn + data[tailIdx] * wOut;
        data[i] = blended;
        data[tailIdx] = blended;
      }
    }

    state.noiseBuffers[kind] = buf;
    return buf;
  }

  /* ==========================================================================
   * 2. FOUR SIGNATURE KNY BIO-ACOUSTIC SOUNDSCAPES
   * ========================================================================== */

  /**
   * 1) playKaguraChime(): Koto Pentatonic Arpeggio + Butterfly Estate Furin Wind Chime (~1.5s, gain ~0.08)
   * Ideal gentle completion cue when AI finishes a turn, especially while Alt+Tabbed!
   */
  function playKaguraChime(opts = {}) {
    const force = Boolean(opts && opts.force);
    if (state.destroyed) return false;
    if (!force && (!state.prefs.enabled || !state.prefs.chimeEnabled)) return false;

    const nowMs = Date.now();
    if (!force && nowMs - state.lastChimeAt < 900) return false;

    return withRunningAudioContext(1200, (ctx) => {
      const fireMs = Date.now();
      if (!force && fireMs - state.lastChimeAt < 900) return;
      state.lastChimeAt = fireMs;
      const t0 = ctx.currentTime + 0.015;
      const isBackgrounded = typeof document !== 'undefined' && (
        Boolean(document.hidden) ||
        (typeof document.hasFocus === 'function' ? !document.hasFocus() : false)
      );
      const masterPeak = isBackgrounded ? 0.092 : 0.078;

      const phraseIdx = state.phraseCursor % KOTO_PHRASES.length;
      state.phraseCursor += 1;
      const notes = KOTO_PHRASES[phraseIdx];
      const furinPair = FURIN_HARMONICS[phraseIdx];

      const masterGain = ctx.createGain();
      const warmthFilter = ctx.createBiquadFilter();
      warmthFilter.type = 'lowpass';
      warmthFilter.frequency.setValueAtTime(3800, t0);
      warmthFilter.Q.setValueAtTime(0.65, t0);

      masterGain.gain.setValueAtTime(masterPeak, t0);
      masterGain.gain.setValueAtTime(masterPeak, t0 + 1.05);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.52);

      warmthFilter.connect(masterGain);
      masterGain.connect(ctx.destination);

      let remainingVoices = notes.length * 2 + furinPair.length;
      const furinGain = ctx.createGain();
      const onVoiceDone = () => {
        remainingVoices -= 1;
        if (remainingVoices <= 0) {
          disconnectAll([furinGain, warmthFilter, masterGain]);
        }
      };

      // Koto plucked strings (Triangle body + 2nd harmonic Sine + subtle oshide pitch bend)
      notes.forEach((freq, idx) => {
        const start = t0 + idx * 0.078;
        const dur = 1.38 - idx * 0.08;

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0.0001, start);
        noteGain.gain.linearRampToValueAtTime(0.85 - idx * 0.08, start + 0.009);
        noteGain.gain.exponentialRampToValueAtTime(0.24, start + 0.22);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        noteGain.connect(warmthFilter);

        const bodyOsc = ctx.createOscillator();
        bodyOsc.type = 'triangle';
        bodyOsc.frequency.setValueAtTime(freq * 1.011, start);
        bodyOsc.frequency.exponentialRampToValueAtTime(freq, start + 0.028);
        bodyOsc.connect(noteGain);

        const overtoneGain = ctx.createGain();
        overtoneGain.gain.setValueAtTime(0.22, start);
        overtoneGain.connect(noteGain);

        const overtoneOsc = ctx.createOscillator();
        overtoneOsc.type = 'sine';
        overtoneOsc.frequency.setValueAtTime(freq * 2, start);
        overtoneOsc.connect(overtoneGain);

        let notePartsLeft = 2;
        const onPartEnded = (oscNode) => {
          disconnectAll([oscNode]);
          notePartsLeft -= 1;
          if (notePartsLeft <= 0) {
            disconnectAll([overtoneGain, noteGain]);
          }
          onVoiceDone();
        };
        bodyOsc.onended = () => onPartEnded(bodyOsc);
        overtoneOsc.onended = () => onPartEnded(overtoneOsc);

        bodyOsc.start(start);
        overtoneOsc.start(start);
        bodyOsc.stop(start + dur + 0.03);
        overtoneOsc.stop(start + dur + 0.03);
      });

      // Butterfly Estate Edo Glass Furin (delicate crystalline breeze shimmer)
      const furinStart = t0 + 0.25;
      furinGain.gain.setValueAtTime(0.0001, furinStart);
      furinGain.gain.linearRampToValueAtTime(0.24, furinStart + 0.012);
      furinGain.gain.exponentialRampToValueAtTime(0.0001, furinStart + 1.22);
      furinGain.connect(masterGain);

      furinPair.forEach((fFreq, fIdx) => {
        const fOsc = ctx.createOscillator();
        fOsc.type = 'sine';
        fOsc.frequency.setValueAtTime(fFreq, furinStart);
        const partialGain = ctx.createGain();
        partialGain.gain.setValueAtTime(fIdx === 0 ? 0.72 : 0.28, furinStart);
        fOsc.connect(partialGain);
        partialGain.connect(furinGain);
        fOsc.onended = () => {
          disconnectAll([fOsc, partialGain]);
          onVoiceDone();
        };
        fOsc.start(furinStart);
        fOsc.stop(furinStart + 1.25);
      });

      // Keep AudioContext running ~3.5s until every Koto/Furin harmonic tail completely decays
      markOneShotActivity(3.5);
    });
  }

  /**
   * 2) playNichirinSheathe(): Crisp "Kachin!" Nichirin Blade Sheathing (~0.45s)
   * Metallic harmonic shimmer (2800Hz -> 4200Hz) + wooden saya / brass habaki tsuba lock (180Hz).
   */
  function playNichirinSheathe(opts = {}) {
    const force = Boolean(opts && opts.force);
    if (state.destroyed) return false;
    if (!force && (!state.prefs.enabled || !state.prefs.swordSfxEnabled || isExternalSwordSfxMuted())) return false;

    const nowMs = Date.now();
    if (!force && nowMs - state.lastSheatheAt < 420) return false;

    return withRunningAudioContext(1200, (ctx) => {
      const fireMs = Date.now();
      if (!force && fireMs - state.lastSheatheAt < 420) return;
      state.lastSheatheAt = fireMs;
      const t0 = ctx.currentTime + 0.015;

      // Layer A: Metallic blade slide & harmonic ring (2800Hz -> 4200Hz)
      const metalFilter = ctx.createBiquadFilter();
      metalFilter.type = 'highpass';
      metalFilter.frequency.setValueAtTime(2350, t0);
      metalFilter.Q.setValueAtTime(2.6, t0);

      const metalGain = ctx.createGain();
      metalGain.gain.setValueAtTime(0.0001, t0);
      metalGain.gain.linearRampToValueAtTime(0.068, t0 + 0.024);
      metalGain.gain.linearRampToValueAtTime(0.082, t0 + 0.082);
      metalGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);

      metalFilter.connect(metalGain);
      metalGain.connect(ctx.destination);

      const shimmerA = ctx.createOscillator();
      shimmerA.type = 'sine';
      shimmerA.frequency.setValueAtTime(2800, t0);
      shimmerA.frequency.exponentialRampToValueAtTime(4200, t0 + 0.085);
      shimmerA.frequency.exponentialRampToValueAtTime(4120, t0 + 0.45);
      shimmerA.connect(metalFilter);

      const shimmerB = ctx.createOscillator();
      shimmerB.type = 'triangle';
      shimmerB.frequency.setValueAtTime(3380, t0);
      shimmerB.frequency.exponentialRampToValueAtTime(5080, t0 + 0.085);
      const shimmerBGain = ctx.createGain();
      shimmerBGain.gain.setValueAtTime(0.38, t0);
      shimmerB.connect(shimmerBGain);
      shimmerBGain.connect(metalFilter);

      let shimmerAlive = 2;
      const onShimmerEnded = (oscNode, extraNode) => {
        disconnectAll(extraNode ? [oscNode, extraNode] : [oscNode]);
        shimmerAlive -= 1;
        if (shimmerAlive <= 0) {
          disconnectAll([metalFilter, metalGain]);
        }
      };
      shimmerA.onended = () => onShimmerEnded(shimmerA, null);
      shimmerB.onended = () => onShimmerEnded(shimmerB, shimmerBGain);

      shimmerA.start(t0);
      shimmerB.start(t0);
      shimmerA.stop(t0 + 0.46);
      shimmerB.stop(t0 + 0.46);

      // Layer B: Tsuba & Wooden Saya Lock ("Ka-chin!" at +75ms, 180Hz -> 92Hz + crisp brass click)
      const tLock = t0 + 0.075;
      const woodOsc = ctx.createOscillator();
      woodOsc.type = 'sine';
      woodOsc.frequency.setValueAtTime(180, tLock);
      woodOsc.frequency.exponentialRampToValueAtTime(92, tLock + 0.068);

      const woodGain = ctx.createGain();
      woodGain.gain.setValueAtTime(0.0001, tLock);
      woodGain.gain.linearRampToValueAtTime(0.115, tLock + 0.005);
      woodGain.gain.exponentialRampToValueAtTime(0.0001, tLock + 0.085);

      woodOsc.connect(woodGain);
      woodGain.connect(ctx.destination);
      woodOsc.onended = () => disconnectAll([woodOsc, woodGain]);
      woodOsc.start(tLock);
      woodOsc.stop(tLock + 0.095);

      // Crisp Habaki Collar Click transient
      const noiseBuf = getNoiseBuffer(ctx, 'white');
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = noiseBuf;

      const clickBp = ctx.createBiquadFilter();
      clickBp.type = 'bandpass';
      clickBp.frequency.setValueAtTime(3150, tLock);
      clickBp.Q.setValueAtTime(4.2, tLock);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.0001, tLock);
      clickGain.gain.linearRampToValueAtTime(0.085, tLock + 0.003);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, tLock + 0.036);

      clickSrc.connect(clickBp);
      clickBp.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickSrc.onended = () => disconnectAll([clickSrc, clickBp, clickGain]);
      clickSrc.start(tLock, 0, 0.05);

      markOneShotActivity(0.8);
    });
  }

  /**
   * 3) playSwordDraw(): Swift, airy Nichirin blade draw when unleashing a Breathing Form (~0.28s)
   */
  function playSwordDraw(opts = {}) {
    const force = Boolean(opts && opts.force);
    if (state.destroyed) return false;
    if (!force && (!state.prefs.enabled || !state.prefs.swordSfxEnabled || isExternalSwordSfxMuted())) return false;

    const nowMs = Date.now();
    if (!force && nowMs - state.lastDrawAt < 380) return false;

    return withRunningAudioContext(1200, (ctx) => {
      const fireMs = Date.now();
      if (!force && fireMs - state.lastDrawAt < 380) return;
      state.lastDrawAt = fireMs;
      const t0 = ctx.currentTime + 0.015;

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = getNoiseBuffer(ctx, 'white');

      const sweepBp = ctx.createBiquadFilter();
      sweepBp.type = 'bandpass';
      sweepBp.frequency.setValueAtTime(1450, t0);
      sweepBp.frequency.exponentialRampToValueAtTime(3950, t0 + 0.22);
      sweepBp.Q.setValueAtTime(1.9, t0);

      const airGain = ctx.createGain();
      airGain.gain.setValueAtTime(0.0001, t0);
      airGain.gain.linearRampToValueAtTime(0.058, t0 + 0.035);
      airGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.27);

      noiseSrc.connect(sweepBp);
      sweepBp.connect(airGain);
      airGain.connect(ctx.destination);
      noiseSrc.onended = () => disconnectAll([noiseSrc, sweepBp, airGain]);
      noiseSrc.start(t0, 0, 0.30);

      const edgeOsc = ctx.createOscillator();
      edgeOsc.type = 'sine';
      edgeOsc.frequency.setValueAtTime(2150, t0);
      edgeOsc.frequency.exponentialRampToValueAtTime(3280, t0 + 0.24);

      const edgeGain = ctx.createGain();
      edgeGain.gain.setValueAtTime(0.0001, t0);
      edgeGain.gain.linearRampToValueAtTime(0.036, t0 + 0.03);
      edgeGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);

      edgeOsc.connect(edgeGain);
      edgeGain.connect(ctx.destination);
      edgeOsc.onended = () => disconnectAll([edgeOsc, edgeGain]);
      edgeOsc.start(t0);
      edgeOsc.stop(t0 + 0.29);

      markOneShotActivity(0.55);
    });
  }

  /**
   * 4) Alpha-Wave Meditative Ambient Soundscape ('rain' = Butterfly Estate Night Rain, 'hearth' = Primordial Charcoal Hearth)
   * Modulated at 0.12Hz slow breathing wave via BiquadFilterNode.
   */
  function stopAmbientNodes(immediate = false) {
    clearTimeout(state.hearthCrackleTimer);
    state.hearthCrackleTimer = 0;
    clearTimeout(state.ambientFadeTimer);
    state.ambientFadeTimer = 0;
    if (typeof state.pendingAmbientCleanup === 'function') {
      const prevCleanup = state.pendingAmbientCleanup;
      state.pendingAmbientCleanup = null;
      try { prevCleanup(); } catch (_) {}
    }

    const active = state.ambientNodes;
    state.ambientNodes = null;
    if (!active) {
      scheduleAutoSuspend();
      return;
    }

    const ctx = state.audioCtx;
    if (!ctx || immediate || state.destroyed) {
      active.cleanup();
      scheduleAutoSuspend();
      return;
    }

    try {
      const now = ctx.currentTime;
      const gainParam = active.masterGain.gain;
      const curVal = Math.max(0.0001, gainParam.value);
      if (typeof gainParam.cancelAndHoldAtTime === 'function') {
        gainParam.cancelAndHoldAtTime(now);
        gainParam.setValueAtTime(Math.max(0.0001, gainParam.value || curVal), now);
      } else {
        gainParam.cancelScheduledValues(now);
        gainParam.setValueAtTime(curVal, now);
      }
      gainParam.linearRampToValueAtTime(0.0001, now + 0.28);
      markOneShotActivity(0.35);
      state.pendingAmbientCleanup = active.cleanup;
      state.ambientFadeTimer = setTimeout(() => {
        state.ambientFadeTimer = 0;
        const fn = state.pendingAmbientCleanup;
        state.pendingAmbientCleanup = null;
        if (typeof fn === 'function') {
          try { fn(); } catch (_) {}
        }
        scheduleAutoSuspend();
      }, 320);
    } catch (_) {
      active.cleanup();
      scheduleAutoSuspend();
    }
  }

  function scheduleHearthCrackle() {
    clearTimeout(state.hearthCrackleTimer);
    if (state.destroyed || !state.prefs.enabled || state.prefs.ambientMode !== 'hearth' || !state.ambientNodes) {
      return;
    }
    const nextDelay = 1600 + Math.floor(Math.random() * 2800);
    state.hearthCrackleTimer = setTimeout(() => {
      if (state.destroyed || !state.prefs.enabled || state.prefs.ambientMode !== 'hearth' || !state.audioCtx) return;
      try {
        const ctx = state.audioCtx;
        if (ctx.state === 'running') {
          const t = ctx.currentTime + 0.01;
          const src = ctx.createBufferSource();
          src.buffer = getNoiseBuffer(ctx, 'white');
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(1850 + Math.random() * 1400, t);
          bp.Q.setValueAtTime(3.6, t);
          const g = ctx.createGain();
          const amp = 0.012 + Math.random() * 0.012;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(amp, t + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
          src.connect(bp);
          bp.connect(g);
          g.connect(ctx.destination);
          src.onended = () => disconnectAll([src, bp, g]);
          src.start(t, Math.random() * 0.4, 0.04);
        }
      } catch (_) {}
      scheduleHearthCrackle();
    }, nextDelay);
  }

  function syncAmbientSoundscape() {
    const mode = state.prefs.ambientMode;
    if (state.destroyed || !state.prefs.enabled || mode === 'off') {
      stopAmbientNodes(false);
      return;
    }
    if (!state.userInteracted) {
      return; // Will auto-start as soon as first user interaction unlocks AudioContext
    }
    if (state.ambientNodes && state.ambientNodes.mode === mode) {
      // Resume AudioContext if OS suspended/interrupted it after sleep/wake or headphone hot-plug
      ensureAudioContext();
      if (mode === 'hearth' && !state.hearthCrackleTimer) {
        scheduleHearthCrackle();
      }
      return;
    }

    stopAmbientNodes(true);
    const ctx = ensureAudioContext();
    if (!ctx) return;

    clearTimeout(state.suspendTimer);
    state.suspendTimer = 0;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    const targetGain = mode === 'rain' ? 0.048 : 0.054;
    masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.45);
    masterGain.connect(ctx.destination);

    const sources = [];
    const oscillators = [];
    const nodesToDisconnect = [masterGain];

    if (mode === 'rain') {
      // Butterfly Estate Night Rain: Pink noise + 0.12Hz slow Biquad lowpass wave
      const pinkSrc = ctx.createBufferSource();
      pinkSrc.buffer = getNoiseBuffer(ctx, 'pink');
      pinkSrc.loop = true;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(510, now);
      lowpass.Q.setValueAtTime(0.68, now);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.12, now); // 0.12Hz Deep Focus wave
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(140, now);
      lfo.connect(lfoGain);
      lfoGain.connect(lowpass.frequency);

      // Subtle distant eaves mist layer
      const mistFilter = ctx.createBiquadFilter();
      mistFilter.type = 'bandpass';
      mistFilter.frequency.setValueAtTime(1550, now);
      mistFilter.Q.setValueAtTime(0.9, now);
      const mistGain = ctx.createGain();
      mistGain.gain.setValueAtTime(0.16, now);

      pinkSrc.connect(lowpass);
      lowpass.connect(masterGain);

      pinkSrc.connect(mistFilter);
      mistFilter.connect(mistGain);
      mistGain.connect(masterGain);

      pinkSrc.start(now);
      lfo.start(now);

      sources.push(pinkSrc);
      oscillators.push(lfo);
      nodesToDisconnect.push(lowpass, lfoGain, mistFilter, mistGain);
    } else if (mode === 'hearth') {
      // Primordial Charcoal Hearth: Deep Brown noise + 0.12Hz breathing ember filter
      const brownSrc = ctx.createBufferSource();
      brownSrc.buffer = getNoiseBuffer(ctx, 'brown');
      brownSrc.loop = true;

      const emberLowpass = ctx.createBiquadFilter();
      emberLowpass.type = 'lowpass';
      emberLowpass.frequency.setValueAtTime(265, now);
      emberLowpass.Q.setValueAtTime(0.8, now);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.12, now);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(65, now);
      lfo.connect(lfoGain);
      lfoGain.connect(emberLowpass.frequency);

      brownSrc.connect(emberLowpass);
      emberLowpass.connect(masterGain);

      brownSrc.start(now);
      lfo.start(now);

      sources.push(brownSrc);
      oscillators.push(lfo);
      nodesToDisconnect.push(emberLowpass, lfoGain);
    }

    state.ambientNodes = {
      mode,
      masterGain,
      cleanup: () => {
        sources.forEach((s) => { try { s.stop(); s.disconnect(); } catch (_) {} });
        oscillators.forEach((o) => { try { o.stop(); o.disconnect(); } catch (_) {} });
        nodesToDisconnect.forEach((n) => { try { n.disconnect(); } catch (_) {} });
      }
    };

    if (mode === 'hearth') {
      scheduleHearthCrackle();
    }
  }

  /* ==========================================================================
   * 3. BIO-CIRCADIAN RETINAL GUARD (01:30–05:54 NIGHT & 05:55–06:30 DAWN)
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
      /* Full-Frame Bio-Circadian Veil (<agy-circadian-veil> appended at end of .agy-shell, z-index: 1):
       * Covers 100% of 4K wallpaper, L-glass ::before & live particles seamlessly with ZERO L-seam cut,
       * immune to Privacy Shield overrides, and ZERO filter on .agy-shell (100% code color & position:fixed fidelity)! */
      ${CIRCADIAN_VEIL_TAG} {
        display: block;
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        opacity: 0;
        transition: opacity 1.6s ease;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] ${CIRCADIAN_VEIL_TAG} {
        clip-path: var(--agy-hole-clip, none);
      }

      /* Retinal Night Care (01:30–05:54): Warm amber-ivory multiply veil absorbing harsh blue peaks evenly */
      .agy-shell[data-agy-circadian="night"] > ${CIRCADIAN_VEIL_TAG},
      html[data-agy-circadian="night"] .agy-shell > ${CIRCADIAN_VEIL_TAG} {
        opacity: 1;
        mix-blend-mode: multiply;
        background: linear-gradient(180deg, rgba(244, 219, 190, 0.92) 0%, rgba(232, 204, 174, 0.89) 100%);
      }

      /* Primordial Yoriichi Dawn (05:55–06:30): Soft golden-amber sunrise warmth across entire 4K horizon */
      .agy-shell[data-agy-circadian="dawn"] > ${CIRCADIAN_VEIL_TAG},
      html[data-agy-circadian="dawn"] .agy-shell > ${CIRCADIAN_VEIL_TAG} {
        opacity: 1;
        mix-blend-mode: soft-light;
        background: radial-gradient(ellipse 92% 66% at 52% 96%, rgba(251, 146, 60, 0.42) 0%, rgba(250, 204, 21, 0.24) 46%, rgba(254, 215, 170, 0.12) 78%, transparent 100%);
      }

      #${DAWN_GLOW_ID} {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 2;
        background: radial-gradient(ellipse 88% 58% at 52% 96%, rgba(251, 146, 60, 0.14) 0%, rgba(250, 204, 21, 0.08) 42%, transparent 78%);
        opacity: 0;
        transition: opacity 1.8s ease;
      }
      .agy-shell[data-agy-circadian="dawn"] #${DAWN_GLOW_ID},
      html[data-agy-circadian="dawn"] #${DAWN_GLOW_ID} {
        opacity: 1;
      }

      /* HUD Wind Chime Pill Button */
      #${AUTO_HUD_BTN_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 22px;
        padding: 0 7px;
        border-radius: 999px;
        border: 1px solid rgba(226, 232, 240, 0.22);
        background: rgba(15, 23, 42, 0.72);
        color: #f8fafc;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.14s ease, border-color 0.16s ease, background 0.16s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
      }
      #${AUTO_HUD_BTN_ID}:hover {
        transform: translateY(-1px);
        border-color: rgba(232, 121, 249, 0.58);
        background: rgba(30, 20, 56, 0.86);
      }
      #${AUTO_HUD_BTN_ID}[data-muted="1"] {
        opacity: 0.68;
        color: #94a3b8;
      }
      #${AUTO_HUD_BTN_ID}[data-ambient="1"] {
        border-color: rgba(56, 189, 248, 0.58);
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
      }

      /* Bio-Audio Popover Panel */
      #${POPOVER_ID} {
        position: fixed;
        z-index: 100020;
        width: 288px;
        padding: 12px 13px;
        border-radius: 14px;
        background: rgba(14, 12, 26, 0.96);
        border: 1px solid rgba(216, 180, 254, 0.34);
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.78), 0 0 22px rgba(192, 132, 252, 0.18);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-size: 12px;
        user-select: none;
        -webkit-app-region: no-drag;
      }
      #${POPOVER_ID} .agy-ba-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.09);
      }
      #${POPOVER_ID} .agy-ba-title {
        font-size: 12.5px;
        font-weight: 700;
        color: #f5d0fe;
        letter-spacing: 0.1px;
      }
      #${POPOVER_ID} .agy-ba-sub {
        font-size: 10.5px;
        color: #94a3b8;
        margin-top: 1px;
      }
      #${POPOVER_ID} .agy-ba-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 4px;
        border-radius: 8px;
      }
      #${POPOVER_ID} .agy-ba-row:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      #${POPOVER_ID} .agy-ba-lbl {
        display: flex;
        flex-direction: column;
        gap: 1px;
        cursor: pointer;
      }
      #${POPOVER_ID} .agy-ba-lbl-main {
        font-size: 12px;
        font-weight: 500;
        color: #f1f5f9;
      }
      #${POPOVER_ID} .agy-ba-lbl-desc {
        font-size: 10.5px;
        color: #94a3b8;
      }
      #${POPOVER_ID} .agy-ba-switch {
        position: relative;
        width: 34px;
        height: 19px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(51, 65, 85, 0.72);
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        transition: background 0.16s ease, border-color 0.16s ease;
      }
      #${POPOVER_ID} .agy-ba-switch[aria-checked="true"] {
        background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
        border-color: rgba(244, 114, 182, 0.7);
      }
      #${POPOVER_ID} .agy-ba-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #ffffff;
        transition: transform 0.16s ease;
      }
      #${POPOVER_ID} .agy-ba-switch[aria-checked="true"] .agy-ba-knob {
        transform: translateX(15px);
      }
      #${POPOVER_ID} .agy-ba-seg {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      #${POPOVER_ID} .agy-ba-seg-btn {
        padding: 5px 4px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(30, 41, 59, 0.55);
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
        transition: all 0.14s ease;
      }
      #${POPOVER_ID} .agy-ba-seg-btn[data-active="1"] {
        background: rgba(56, 189, 248, 0.22);
        border-color: rgba(56, 189, 248, 0.68);
        color: #f0f9ff;
        font-weight: 600;
      }
      #${POPOVER_ID} .agy-ba-test-row {
        display: flex;
        gap: 6px;
        margin-top: 8px;
        padding-top: 7px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      #${POPOVER_ID} .agy-ba-mini-btn {
        flex: 1;
        padding: 4.5px 6px;
        border-radius: 7px;
        border: 1px solid rgba(250, 204, 21, 0.28);
        background: rgba(250, 204, 21, 0.09);
        color: #fef08a;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
      }
      #${POPOVER_ID} .agy-ba-mini-btn:hover {
        background: rgba(250, 204, 21, 0.18);
      }

      /* Gentle 1-time Night Care Toast from Butterfly Estate */
      #${TOAST_ID} {
        position: fixed;
        right: 18px;
        bottom: 84px;
        z-index: 99980;
        max-width: 332px;
        padding: 10px 13px;
        border-radius: 12px;
        background: rgba(17, 12, 30, 0.94);
        border: 1px solid rgba(232, 121, 249, 0.36);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        font-size: 12px;
        line-height: 1.45;
        display: flex;
        align-items: flex-start;
        gap: 9px;
        -webkit-app-region: no-drag;
      }
      #${TOAST_ID} .agy-ba-toast-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 13px;
        padding: 0 2px;
        line-height: 1;
      }
    `;
  }

  function syncCircadianVeilAndShell(phase) {
    if (typeof document === 'undefined') return;
    const isActive = phase === 'night' || phase === 'dawn';
    const shell = document.querySelector('.agy-shell');
    let veil = document.getElementById(CIRCADIAN_VEIL_ID);

    if (shell) {
      if (isActive) {
        shell.dataset.agyCircadian = phase;
        if (!veil) {
          veil = document.createElement(CIRCADIAN_VEIL_TAG);
          veil.id = CIRCADIAN_VEIL_ID;
          veil.setAttribute('aria-hidden', 'true');
          const guardChild = document.createElement('i');
          guardChild.setAttribute('aria-hidden', 'true');
          veil.appendChild(guardChild);
        }
        // Always mount at the end of .agy-shell so it sits above #agy-live-fx-host & ::before
        // while staying at z-index: 1 underneath all UI panes (z-index >= 2)
        if (veil.parentElement !== shell || shell.lastElementChild !== veil) {
          shell.appendChild(veil);
        }
      } else {
        delete shell.dataset.agyCircadian;
        if (veil) veil.remove();
      }
    } else if (veil && !isActive) {
      veil.remove();
    }

    syncDawnLayerElement(phase === 'dawn');
  }

  function syncDawnLayerElement(isDawn) {
    if (typeof document === 'undefined') return;
    const fxHost = document.getElementById('agy-live-fx-host') || document.querySelector('agy-live-fx');
    let layer = document.getElementById(DAWN_GLOW_ID);
    if (isDawn && fxHost) {
      if (!layer) {
        layer = document.createElement('div');
        layer.id = DAWN_GLOW_ID;
        layer.setAttribute('aria-hidden', 'true');
        const guardChild = document.createElement('i');
        guardChild.setAttribute('aria-hidden', 'true');
        layer.appendChild(guardChild);
        fxHost.appendChild(layer);
      }
    } else if (layer && !isDawn) {
      layer.remove();
    }
  }

  function showNightCareGentleReminder(dateKey) {
    if (typeof document === 'undefined' || !document.body) return;
    if (state.nightToastShownDate === dateKey) return;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(NIGHT_TOAST_SESSION_KEY) === dateKey) {
        state.nightToastShownDate = dateKey;
        return;
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(NIGHT_TOAST_SESSION_KEY, dateKey);
      }
    } catch (_) {}
    state.nightToastShownDate = dateKey;

    const old = document.getElementById(TOAST_ID);
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.setAttribute('role', 'status');

    const iconSpan = document.createElement('span');
    iconSpan.textContent = '🦋';
    iconSpan.style.fontSize = '16px';

    const bodyWrap = document.createElement('div');
    bodyWrap.style.flex = '1';

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.style.color = '#f5d0fe';
    titleEl.style.marginBottom = '2px';
    titleEl.textContent = 'Điệp Phủ & Chúa Công dặn dò';

    const msgEl = document.createElement('div');
    msgEl.style.color = '#e2e8f0';
    msgEl.textContent = 'Đêm đã về khuya rồi, lớp nền đã tự dịu sáng để bảo vệ mắt. Anh nhớ uống ngụm nước ấm và giữ sức khỏe nhé!';

    bodyWrap.appendChild(titleEl);
    bodyWrap.appendChild(msgEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'agy-ba-toast-close';
    closeBtn.title = 'Đóng';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      clearTimeout(state.toastHideTimer);
      toast.remove();
    });

    toast.appendChild(iconSpan);
    toast.appendChild(bodyWrap);
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);

    clearTimeout(state.toastHideTimer);
    state.toastHideTimer = setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, 9500);
  }

  function syncCircadianNow(customDate) {
    if (typeof document === 'undefined' || !document.documentElement) return 'day';
    if (!state.prefs.nightCare) {
      delete document.documentElement.dataset.agyCircadian;
      syncCircadianVeilAndShell('day');
      state.circadianPhase = 'day';
      return 'day';
    }

    const now = customDate instanceof Date ? customDate : new Date();
    const totalMins = now.getHours() * 60 + now.getMinutes();

    // 01:30 (90m) through 05:54 (354m) -> Continuous Night Retinal Care (no 05:30 white flash!)
    if (totalMins >= 90 && totalMins < 355) {
      document.documentElement.dataset.agyCircadian = 'night';
      syncCircadianVeilAndShell('night');
      state.circadianPhase = 'night';
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      showNightCareGentleReminder(dateKey);
      return 'night';
    }

    // 05:55 (355m) to 06:30 (390m) -> Seamless transition to Primordial Yoriichi Dawn
    if (totalMins >= 355 && totalMins <= 390) {
      document.documentElement.dataset.agyCircadian = 'dawn';
      syncCircadianVeilAndShell('dawn');
      state.circadianPhase = 'dawn';
      return 'dawn';
    }

    delete document.documentElement.dataset.agyCircadian;
    syncCircadianVeilAndShell('day');
    state.circadianPhase = 'day';
    return 'day';
  }

  /* ==========================================================================
   * 4. TELEMETRY BRIDGE & POPOVER UI (100% createElement + textContent)
   * ========================================================================== */

  function onTelemetry(snap) {
    if (state.destroyed || !snap || typeof snap !== 'object') return;

    const turnSeq = typeof snap.turnFinishedSeq === 'number' ? snap.turnFinishedSeq : null;
    const slashSeq = typeof snap.slashSeq === 'number' ? snap.slashSeq : null;
    const hasWorkingBool = typeof snap.isWorking === 'boolean';

    if (!state.telemetryPrimed) {
      state.telemetryPrimed = true;
      if (turnSeq !== null) state.lastTurnFinishedSeq = turnSeq;
      if (slashSeq !== null) state.lastSlashSeq = slashSeq;
      if (hasWorkingBool) {
        state.lastWorkingState = snap.isWorking;
        if (snap.isWorking && state.prefs.enabled && state.userInteracted) {
          clearTimeout(state.suspendTimer);
          state.suspendTimer = 0;
          ensureAudioContext();
        }
      }
      return;
    }

    const prevWorking = state.lastWorkingState;
    if (hasWorkingBool) {
      state.lastWorkingState = snap.isWorking;
      if (snap.isWorking) {
        // Keep AudioContext 'running' (0% CPU empty graph) throughout AI reasoning so Alt+Tab chime is instant
        clearTimeout(state.suspendTimer);
        state.suspendTimer = 0;
        if (state.prefs.enabled && state.userInteracted) {
          ensureAudioContext();
        }
      }
    }

    // Trigger Koto + Furin chime when AI finishes a turn
    let chimePlayed = false;
    if (turnSeq !== null) {
      if (state.lastTurnFinishedSeq !== null && turnSeq > state.lastTurnFinishedSeq) {
        chimePlayed = Boolean(playKaguraChime());
      }
      state.lastTurnFinishedSeq = turnSeq;
    } else if (hasWorkingBool && prevWorking && !snap.isWorking) {
      chimePlayed = Boolean(playKaguraChime());
    }

    // Trigger Nichirin "Kachin!" sheathe when Demon Slash counter-attack succeeds
    if (slashSeq !== null) {
      if (state.lastSlashSeq !== null && slashSeq > state.lastSlashSeq) {
        playNichirinSheathe();
      }
      state.lastSlashSeq = slashSeq;
    }

    // Only schedule auto-suspend once lastWorkingState === false AND after ~3.5s chime tail completes
    if (hasWorkingBool && prevWorking && !snap.isWorking && !chimePlayed) {
      markOneShotActivity(3.5);
    }
  }

  function createFurinSvgIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const dome = document.createElementNS(SVG_NS, 'path');
    dome.setAttribute('d', 'M6 10a6 6 0 0 1 12 0v3H6v-3Z');
    const clapper = document.createElementNS(SVG_NS, 'line');
    clapper.setAttribute('x1', '12');
    clapper.setAttribute('y1', '13');
    clapper.setAttribute('x2', '12');
    clapper.setAttribute('y2', '16');
    const strip = document.createElementNS(SVG_NS, 'rect');
    strip.setAttribute('x', '10');
    strip.setAttribute('y', '16');
    strip.setAttribute('width', '4');
    strip.setAttribute('height', '6');
    strip.setAttribute('rx', '1');

    svg.appendChild(dome);
    svg.appendChild(clapper);
    svg.appendChild(strip);
    return svg;
  }

  function updateHudButtonVisual() {
    if (typeof document === 'undefined') return;
    const enabled = isEnabled();
    const ambientOn = enabled && state.prefs.ambientMode !== 'off';

    // Sync unified HUD trigger button (e.g. kaguraBtn in kny_token_hud.js)
    const bar = document.getElementById(HUD_BAR_ID);
    const extTrigger = bar ? bar.querySelector('[data-agy-bio-audio-trigger="1"]') : null;
    if (extTrigger && extTrigger.id !== AUTO_HUD_BTN_ID) {
      if (enabled) {
        extTrigger.dataset.active = '1';
        delete extTrigger.dataset.muted;
      } else {
        delete extTrigger.dataset.active;
        extTrigger.dataset.muted = '1';
      }
      if (ambientOn) extTrigger.dataset.ambient = '1';
      else delete extTrigger.dataset.ambient;
    }

    const btn = document.getElementById(AUTO_HUD_BTN_ID);
    if (!btn) return;
    btn.dataset.muted = enabled ? '0' : '1';
    btn.dataset.ambient = ambientOn ? '1' : '0';
    const labelEl = btn.querySelector('.agy-ba-hud-lbl');
    if (labelEl) {
      if (!enabled) {
        labelEl.textContent = 'Tắt âm';
      } else if (state.prefs.ambientMode === 'rain') {
        labelEl.textContent = 'Mưa đêm';
      } else if (state.prefs.ambientMode === 'hearth') {
        labelEl.textContent = 'Lửa than';
      } else {
        labelEl.textContent = 'Điệp Phủ';
      }
    }
  }

  function closePopover() {
    if (state.popoverEl && state.popoverEl.isConnected) {
      state.popoverEl.remove();
    }
    state.popoverEl = null;
    state.anchorEl = null;
    state.chimeSwitchEl = null;
    state.swordSwitchEl = null;
  }

  function createSwitchRow(titleText, descText, isChecked, onToggle) {
    const row = document.createElement('div');
    row.className = 'agy-ba-row';

    const lbl = document.createElement('div');
    lbl.className = 'agy-ba-lbl';
    const main = document.createElement('span');
    main.className = 'agy-ba-lbl-main';
    main.textContent = titleText;
    const desc = document.createElement('span');
    desc.className = 'agy-ba-lbl-desc';
    desc.textContent = descText;
    lbl.appendChild(main);
    lbl.appendChild(desc);

    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'agy-ba-switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    const knob = document.createElement('span');
    knob.className = 'agy-ba-knob';
    sw.appendChild(knob);

    const handleFlip = (ev) => {
      ev.stopPropagation();
      state.userInteracted = true;
      ROOT.__AGY_AUDIO_UNLOCKED__ = true;
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      onToggle(next);
    };

    sw.addEventListener('click', handleFlip);
    lbl.addEventListener('click', handleFlip);

    row.appendChild(lbl);
    row.appendChild(sw);
    return { row, sw };
  }

  function positionPopoverNear(pop, anchorEl) {
    const vw = ROOT.innerWidth || 1280;
    const vh = ROOT.innerHeight || 800;
    const popRect = pop.getBoundingClientRect();
    const pw = popRect.width || 288;
    const ph = popRect.height || 260;

    if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
      const r = anchorEl.getBoundingClientRect();
      let left = Math.round(r.left);
      let top = Math.round(r.top - ph - 8);
      if (top < 12) {
        top = Math.min(vh - ph - 12, Math.round(r.bottom + 8));
      }
      if (left + pw > vw - 12) {
        left = Math.max(12, vw - pw - 12);
      }
      pop.style.left = `${Math.max(12, left)}px`;
      pop.style.top = `${Math.max(12, top)}px`;
    } else {
      pop.style.right = '20px';
      pop.style.bottom = '86px';
    }
  }

  function syncSwordMuteWithAura(swordEnabled) {
    if (state.syncingSwordSfx) return;
    state.syncingSwordSfx = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SFX_MUTE_STORAGE_KEY, swordEnabled ? '0' : '1');
      }
      if (ROOT.__AGY_KNY_CHIBI_AURA__ && typeof ROOT.__AGY_KNY_CHIBI_AURA__.setSfxMuted === 'function') {
        ROOT.__AGY_KNY_CHIBI_AURA__.setSfxMuted(!swordEnabled);
      }
    } catch (_) {
    } finally {
      state.syncingSwordSfx = false;
    }
  }

  function setSwordSfxEnabled(enabled) {
    const next = Boolean(enabled);
    if (next) state.prefs.enabled = true;
    state.prefs.swordSfxEnabled = next;
    savePrefs(state.prefs);
    syncSwordMuteWithAura(next);
    if (state.swordSwitchEl && state.swordSwitchEl.isConnected) {
      state.swordSwitchEl.setAttribute('aria-checked', (state.prefs.enabled && state.prefs.swordSfxEnabled) ? 'true' : 'false');
    }
    if (state.chimeSwitchEl && state.chimeSwitchEl.isConnected) {
      state.chimeSwitchEl.setAttribute('aria-checked', (state.prefs.enabled && state.prefs.chimeEnabled) ? 'true' : 'false');
    }
    updateHudButtonVisual();
    return Boolean(state.prefs.enabled && state.prefs.swordSfxEnabled);
  }

  function openPopover(anchorEl) {
    if (state.destroyed || typeof document === 'undefined' || !document.body) return null;
    state.userInteracted = true;
    ROOT.__AGY_AUDIO_UNLOCKED__ = true;
    if (state.prefs.enabled) {
      ensureAudioContext();
      markOneShotActivity(3.5);
    }
    ensureStyles();

    if (state.popoverEl && state.popoverEl.isConnected && state.anchorEl === anchorEl) {
      closePopover();
      return null;
    }
    closePopover();
    try { ROOT.__AGY_CINEMA_DIRECTOR__?.closePanel?.(); } catch (_) {}
    try { ROOT.__AGY_TOKEN_HUD__?.closePopover?.(); } catch (_) {}
    state.anchorEl = anchorEl || null;

    const pop = document.createElement('div');
    pop.id = POPOVER_ID;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Âm cảnh Sinh học Điệp Phủ');

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'agy-ba-hdr';
    const hdrLeft = document.createElement('div');
    const hdrTitle = document.createElement('div');
    hdrTitle.className = 'agy-ba-title';
    hdrTitle.textContent = '🎐 Âm Cảnh Điệp Phủ (0 KB WebAudio)';
    const hdrSub = document.createElement('div');
    hdrSub.className = 'agy-ba-sub';
    hdrSub.textContent = 'Tổng hợp toán học 100% • 0% CPU khi nghỉ';
    hdrLeft.appendChild(hdrTitle);
    hdrLeft.appendChild(hdrSub);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.style.cssText = 'background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 4px;';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePopover();
    });
    hdr.appendChild(hdrLeft);
    hdr.appendChild(closeBtn);
    pop.appendChild(hdr);

    // Switches
    const chimeCtrl = createSwitchRow(
      '🔔 Chuông báo xong việc',
      'Đàn Koto & Chuông gió Furin khi AI hoàn tất lượt',
      state.prefs.enabled && state.prefs.chimeEnabled,
      (val) => {
        if (val) state.prefs.enabled = true;
        state.prefs.chimeEnabled = val;
        savePrefs(state.prefs);
        syncAmbientSoundscape();
        updateHudButtonVisual();
        if (val) playKaguraChime({ force: true });
      }
    );
    state.chimeSwitchEl = chimeCtrl.sw;
    pop.appendChild(chimeCtrl.row);

    const swordEffective = Boolean(state.prefs.enabled && state.prefs.swordSfxEnabled && !isExternalSwordSfxMuted());
    const swordCtrl = createSwitchRow(
      '⚔️ Tiếng kiếm Nhật Luân Đao',
      'Âm rút kiếm xuất chiêu & tra kiếm "Kachin!"',
      swordEffective,
      (val) => {
        setSwordSfxEnabled(val);
        if (val) playNichirinSheathe({ force: true });
      }
    );
    state.swordSwitchEl = swordCtrl.sw;
    pop.appendChild(swordCtrl.row);

    const nightCtrl = createSwitchRow(
      '🌙 Bảo vệ mắt đêm khuya',
      'Giảm sáng xanh 01:30–05:54 & Bình minh 05:55',
      state.prefs.nightCare,
      (val) => {
        state.prefs.nightCare = val;
        savePrefs(state.prefs);
        syncCircadianNow();
      }
    );
    pop.appendChild(nightCtrl.row);

    // Ambient Segmented Picker
    const segTitle = document.createElement('div');
    segTitle.style.cssText = 'font-size:11px;color:#cbd5e1;margin-top:6px;font-weight:600;';
    segTitle.textContent = '🌧️ Âm cảnh Thiền định Sóng Alpha (0.12Hz)';
    pop.appendChild(segTitle);

    const segWrap = document.createElement('div');
    segWrap.className = 'agy-ba-seg';
    const modes = [
      { id: 'off', label: '🔇 Tắt nền' },
      { id: 'rain', label: '🌧️ Mưa Điệp Phủ' },
      { id: 'hearth', label: '🔥 Lửa Khởi Nguyên' }
    ];
    const segBtns = [];

    modes.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'agy-ba-seg-btn';
      b.textContent = m.label;
      const isAct = state.prefs.enabled && state.prefs.ambientMode === m.id;
      b.dataset.active = isAct ? '1' : '0';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.userInteracted = true;
        ROOT.__AGY_AUDIO_UNLOCKED__ = true;
        if (m.id !== 'off') state.prefs.enabled = true;
        state.prefs.ambientMode = m.id;
        savePrefs(state.prefs);
        segBtns.forEach((item) => {
          item.btn.dataset.active = (state.prefs.enabled && state.prefs.ambientMode === item.id) ? '1' : '0';
        });
        syncAmbientSoundscape();
        updateHudButtonVisual();
      });
      segBtns.push({ id: m.id, btn: b });
      segWrap.appendChild(b);
    });
    pop.appendChild(segWrap);

    // Preview buttons
    const testRow = document.createElement('div');
    testRow.className = 'agy-ba-test-row';

    const testChimeBtn = document.createElement('button');
    testChimeBtn.type = 'button';
    testChimeBtn.className = 'agy-ba-mini-btn';
    testChimeBtn.textContent = '🎵 Thử Chuông Koto';
    testChimeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.userInteracted = true;
      ROOT.__AGY_AUDIO_UNLOCKED__ = true;
      playKaguraChime({ force: true });
    });

    const testSheatheBtn = document.createElement('button');
    testSheatheBtn.type = 'button';
    testSheatheBtn.className = 'agy-ba-mini-btn';
    testSheatheBtn.textContent = '⚔️ Thử "Kachin!"';
    testSheatheBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.userInteracted = true;
      ROOT.__AGY_AUDIO_UNLOCKED__ = true;
      playNichirinSheathe({ force: true });
    });

    testRow.appendChild(testChimeBtn);
    testRow.appendChild(testSheatheBtn);
    pop.appendChild(testRow);

    document.body.appendChild(pop);
    state.popoverEl = pop;
    positionPopoverNear(pop, anchorEl);
    return pop;
  }

  function ensureHudTriggerMounted() {
    if (state.destroyed || typeof document === 'undefined') return;
    const bar = document.getElementById(HUD_BAR_ID);
    if (!bar) return;
    // Avoid duplicating if another module already placed a dedicated Bio-Audio trigger
    if (bar.querySelector('[data-agy-bio-audio-trigger="1"]') || document.getElementById(AUTO_HUD_BTN_ID)) {
      updateHudButtonVisual();
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = AUTO_HUD_BTN_ID;
    btn.dataset.agyBioAudioTrigger = '1';
    btn.title = 'Âm cảnh Sinh học Điệp Phủ (Chuông Koto, Tiếng kiếm & Bảo vệ mắt đêm khuya)';
    btn.setAttribute('aria-label', btn.title);

    btn.appendChild(createFurinSvgIcon());
    const lbl = document.createElement('span');
    lbl.className = 'agy-ba-hud-lbl';
    lbl.textContent = 'Điệp Phủ';
    btn.appendChild(lbl);

    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.userInteracted = true;
      ROOT.__AGY_AUDIO_UNLOCKED__ = true;
      openPopover(btn);
    });

    bar.appendChild(btn);
    updateHudButtonVisual();
  }

  /* ==========================================================================
   * 5. LIFECYCLE, GESTURE UNLOCK & PUBLIC API
   * ========================================================================== */

  function isEnabled() {
    return Boolean(state.prefs.enabled && (state.prefs.chimeEnabled || state.prefs.swordSfxEnabled || state.prefs.ambientMode !== 'off'));
  }

  function toggle(forceState) {
    state.userInteracted = true;
    ROOT.__AGY_AUDIO_UNLOCKED__ = true;
    const next = typeof forceState === 'boolean' ? forceState : !state.prefs.enabled;
    state.prefs.enabled = next;
    if (next && !state.prefs.chimeEnabled && !state.prefs.swordSfxEnabled && state.prefs.ambientMode === 'off') {
      state.prefs.chimeEnabled = true;
      state.prefs.swordSfxEnabled = true;
    }
    savePrefs(state.prefs);
    if (next) ensureAudioContext();
    syncAmbientSoundscape();
    updateHudButtonVisual();
    if (next && state.prefs.chimeEnabled) {
      playKaguraChime({ force: true });
    }
    return isEnabled();
  }

  function setAmbientMode(mode) {
    const cleanMode = (mode === 'rain' || mode === 'hearth') ? mode : 'off';
    if (cleanMode !== 'off') state.prefs.enabled = true;
    state.prefs.ambientMode = cleanMode;
    savePrefs(state.prefs);
    syncAmbientSoundscape();
    updateHudButtonVisual();
    return cleanMode;
  }

  /**
   * Unlocks AudioContext strictly inside a genuine User Gesture (pointerdown/click/keydown)
   * even when ambientMode === 'off', satisfying Chromium Autoplay Policy for future Alt+Tab chimes.
   */
  function unlockAudioOnUserGesture() {
    if (state.destroyed) return;
    const firstTime = !state.userInteracted;
    state.userInteracted = true;
    ROOT.__AGY_AUDIO_UNLOCKED__ = true;
    if (!state.prefs.enabled) return;

    if (state.prefs.ambientMode !== 'off') {
      syncAmbientSoundscape();
      return;
    }

    if (firstTime || !state.audioCtx || state.audioCtx.state !== 'running') {
      const ctx = ensureAudioContext();
      if (ctx && !state.lastWorkingState) {
        markOneShotActivity(3.5);
      }
    } else if (!state.lastWorkingState && (state.activeOneShotUntil - Date.now() < 1500)) {
      markOneShotActivity(3.5);
    }
  }

  function initDomLifecycle() {
    if (typeof document === 'undefined') return;
    ensureStyles();
    syncCircadianNow();

    state.circadianTimer = setInterval(() => {
      syncCircadianNow();
    }, 5 * 60 * 1000); // Check local clock every 5 minutes

    state.hudMountTimer = setInterval(() => {
      ensureHudTriggerMounted();
      if (state.circadianPhase === 'night' || state.circadianPhase === 'dawn') {
        syncCircadianVeilAndShell(state.circadianPhase);
      }
    }, 1500);
    state.initHudTimer = setTimeout(() => {
      state.initHudTimer = 0;
      ensureHudTriggerMounted();
    }, 250);

    const onFirstGesture = () => {
      unlockAudioOnUserGesture();
    };

    const onDocClickOutside = (ev) => {
      if (!state.popoverEl) return;
      const t = ev.target;
      if (state.popoverEl.contains(t)) return;
      if (state.anchorEl && state.anchorEl.contains && state.anchorEl.contains(t)) return;
      closePopover();
    };

    const onDocKeyDown = (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      unlockAudioOnUserGesture();
      if (ev.key === 'Escape' && state.popoverEl) {
        closePopover();
      }
    };

    document.addEventListener('pointerdown', onFirstGesture, { capture: true, passive: true });
    document.addEventListener('click', onFirstGesture, { capture: true, passive: true });
    document.addEventListener('click', onDocClickOutside, true);
    document.addEventListener('keydown', onDocKeyDown, { passive: true });

    state.cleanups.push(() => document.removeEventListener('pointerdown', onFirstGesture, { capture: true }));
    state.cleanups.push(() => document.removeEventListener('click', onFirstGesture, { capture: true }));
    state.cleanups.push(() => document.removeEventListener('click', onDocClickOutside, true));
    state.cleanups.push(() => document.removeEventListener('keydown', onDocKeyDown));

    if (state.userInteracted && state.prefs.enabled && state.prefs.ambientMode !== 'off') {
      syncAmbientSoundscape();
    }
  }

  function destroy(opts) {
    const isReinject = Boolean(opts && opts.isReinject);
    state.destroyed = true;
    if (!isReinject) {
      delete ROOT.__AGY_AUDIO_UNLOCKED__;
    }
    closePopover();
    stopAmbientNodes(true);
    clearTimeout(state.suspendTimer);
    state.suspendTimer = 0;
    clearTimeout(state.hearthCrackleTimer);
    state.hearthCrackleTimer = 0;
    clearTimeout(state.toastHideTimer);
    state.toastHideTimer = 0;
    clearTimeout(state.initHudTimer);
    state.initHudTimer = 0;
    clearTimeout(state.ambientFadeTimer);
    state.ambientFadeTimer = 0;
    if (typeof state.pendingAmbientCleanup === 'function') {
      const fn = state.pendingAmbientCleanup;
      state.pendingAmbientCleanup = null;
      try { fn(); } catch (_) {}
    }
    if (state.pendingResumeTimers && state.pendingResumeTimers.size > 0) {
      state.pendingResumeTimers.forEach((tid) => clearTimeout(tid));
      state.pendingResumeTimers.clear();
    }
    clearInterval(state.circadianTimer);
    state.circadianTimer = 0;
    clearInterval(state.hudMountTimer);
    state.hudMountTimer = 0;

    while (state.cleanups.length > 0) {
      const fn = state.cleanups.pop();
      try { fn(); } catch (_) {}
    }

    if (state.audioCtx) {
      detachAudioCtxListener(state.audioCtx);
      try { state.audioCtx.close().catch(() => {}); } catch (_) {}
      state.audioCtx = null;
    }
    state.noiseBuffers = { pink: null, brown: null, white: null };

    if (typeof document !== 'undefined') {
      if (document.documentElement) {
        delete document.documentElement.dataset.agyCircadian;
      }
      const shell = document.querySelector('.agy-shell');
      if (shell) {
        delete shell.dataset.agyCircadian;
      }
      [STYLE_ID, POPOVER_ID, TOAST_ID, CIRCADIAN_VEIL_ID, DAWN_GLOW_ID, AUTO_HUD_BTN_ID].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  }

  initDomLifecycle();

  const API = Object.freeze({
    toggle,
    openPopover,
    closePopover,
    onTelemetry,
    playNichirinSheathe,
    playSheathe: playNichirinSheathe,
    playKaguraChime,
    playSwordDraw,
    setSwordSfxEnabled,
    setAmbientMode,
    syncCircadianNow,
    getPrefs: () => ({ ...state.prefs }),
    isEnabled,
    destroy,
    teardown: destroy
  });

  ROOT.__AGY_BIO_AUDIO__ = API;
})();
