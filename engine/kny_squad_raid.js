(() => {
  'use strict';

  if (typeof window !== 'undefined' && window.__AGY_SQUAD_RAID__ && typeof window.__AGY_SQUAD_RAID__.teardown === 'function') {
    try { window.__AGY_SQUAD_RAID__.teardown(); } catch (_) {}
  }

  /**
   * Kimetsu no Yaiba — Live Hashira Swarm Squad & Kasugai Battlefield Victory Engine
   * Exposes window.__AGY_SQUAD_RAID__:
   *  - sync(snap): Live subagent summoning, Shunshin landing, Kasugai Intel cards (100% DOM textContent, CWE-79 immune),
   *                1-click Hashira Breathing Form unleash, and golden 「完」 completion mist retreat.
   *  - simulateRaid(opts): Demo/Cinema mode summoning a coordinated multi-Hashira squad.
   *  - triggerVictoryStamp(opts): Crimson 「滅」 (Ác Quỷ Diệt Sát) seal + Kasugai Crow flyby on bug/crisis victory.
   *  - mount(composerEl) / teardown()
   */

  const STYLE_ID = 'antigravity-kny-squad-raid-style';
  const SQUAD_TAG = 'agy-hashira-squad';
  const VICTORY_HOST_ID = 'agy-metsu-victory-overlay';

  const HERO_ROSTER = {
    shinobu: {
      hero: 'shinobu',
      titleVi: 'Trùng Trụ • Kochō Shinobu',
      shortVi: 'Trùng Trụ',
      elem: 'wisteria',
      color: '#c084fc',
      accent: '#5eead4',
      glow: 'rgba(192, 132, 252, 0.55)'
    },
    muichiro: {
      hero: 'muichiro',
      titleVi: 'Hà Trụ • Tokitō Muichirō',
      shortVi: 'Hà Trụ',
      elem: 'mist',
      color: '#5eead4',
      accent: '#ccfbf1',
      glow: 'rgba(94, 234, 212, 0.55)'
    },
    ubuyashiki: {
      hero: 'ubuyashiki',
      titleVi: 'Chúa Công • Ubuyashiki',
      shortVi: 'Chúa Công',
      elem: 'royal_wisteria',
      color: '#facc15',
      accent: '#e879f9',
      glow: 'rgba(250, 204, 21, 0.55)'
    },
    uzui: {
      hero: 'uzui',
      titleVi: 'Âm Trụ • Uzui Tengen',
      shortVi: 'Âm Trụ',
      elem: 'sound',
      color: '#facc15',
      accent: '#f472b6',
      glow: 'rgba(244, 114, 182, 0.55)'
    },
    mitsuri: {
      hero: 'mitsuri',
      titleVi: 'Luyến Trụ • Kanroji Mitsuri',
      shortVi: 'Luyến Trụ',
      elem: 'love',
      color: '#f472b6',
      accent: '#a3e635',
      glow: 'rgba(244, 114, 182, 0.55)'
    },
    obanai: {
      hero: 'obanai',
      titleVi: 'Xà Trụ • Iguro Obanai',
      shortVi: 'Xà Trụ',
      elem: 'serpent',
      color: '#a855f7',
      accent: '#34d399',
      glow: 'rgba(168, 85, 247, 0.55)'
    },
    inosuke: {
      hero: 'inosuke',
      titleVi: 'Dã Thú • Hashibira Inosuke',
      shortVi: 'Inosuke',
      elem: 'beast',
      color: '#60a5fa',
      accent: '#e2e8f0',
      glow: 'rgba(96, 165, 250, 0.55)'
    },
    zenitsu: {
      hero: 'zenitsu',
      titleVi: 'Lôi Minh • Agatsuma Zenitsu',
      shortVi: 'Zenitsu',
      elem: 'thunder',
      color: '#facc15',
      accent: '#38bdf8',
      glow: 'rgba(250, 204, 21, 0.60)'
    },
    rengoku: {
      hero: 'rengoku',
      titleVi: 'Viêm Trụ • Rengoku Kyōjurō',
      shortVi: 'Viêm Trụ',
      elem: 'flame',
      color: '#f97316',
      accent: '#fde047',
      glow: 'rgba(249, 115, 22, 0.58)'
    },
    giyu: {
      hero: 'giyu',
      titleVi: 'Thủy Trụ • Tomioka Giyū',
      shortVi: 'Thủy Trụ',
      elem: 'water',
      color: '#38bdf8',
      accent: '#bae6fd',
      glow: 'rgba(56, 189, 248, 0.55)'
    },
    sanemi: {
      hero: 'sanemi',
      titleVi: 'Phong Trụ • Shinazugawa Sanemi',
      shortVi: 'Phong Trụ',
      elem: 'wind',
      color: '#22c55e',
      accent: '#bbf7d0',
      glow: 'rgba(34, 197, 94, 0.55)'
    },
    gyomei: {
      hero: 'gyomei',
      titleVi: 'Nham Trụ • Himejima Gyōmei',
      shortVi: 'Nham Trụ',
      elem: 'stone',
      color: '#f59e0b',
      accent: '#fde68a',
      glow: 'rgba(245, 158, 11, 0.55)'
    },
    tanjiro: {
      hero: 'tanjiro',
      titleVi: 'Nhật Thủy • Kamado Tanjirō',
      shortVi: 'Tanjirō',
      elem: 'sun_water',
      color: '#f97316',
      accent: '#38bdf8',
      glow: 'rgba(249, 115, 22, 0.55)'
    }
  };

  const POOLS = {
    research: ['shinobu', 'muichiro', 'ubuyashiki'],
    design: ['uzui', 'mitsuri'],
    browser: ['obanai', 'inosuke', 'zenitsu'],
    swarm: ['gyomei', 'sanemi', 'rengoku', 'giyu', 'uzui'],
    workflow: ['ubuyashiki', 'muichiro', 'shinobu'],
    system: ['rengoku', 'giyu', 'sanemi', 'gyomei', 'tanjiro']
  };

  const ALL_HERO_KEYS = Object.keys(HERO_ROSTER);

  const state = {
    composer: null,
    squadEl: null,
    headerCountEl: null,
    unitsWrapEl: null,
    activeCid: '',
    lockedCid: '',
    unitsById: new Map(),           // subId -> unit record
    assignedHeroBySubId: new Map(), // subId -> heroKey (bounded <= 150)
    seenCompletedIds: new Set(),
    comboByHero: Object.create(null),
    simTimers: [],
    simActive: false,
    victoryTimer: 0,
    crowTimer: 0,
    lastSlashSeqHandled: 0
  };

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || 'hashira');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function safeAssetUrl(relPath) {
    if (typeof __AGY_SEC__ !== 'undefined' && __AGY_SEC__) {
      const resolved = __AGY_SEC__.resolveAssetUrl(relPath);
      return __AGY_SEC__.sanitizeCssUrl(resolved);
    }
    return '';
  }

  function resolveComposer() {
    if (typeof document === 'undefined') return null;
    let all = [];
    try {
      all = Array.from(document.querySelectorAll('.surface-composer, [data-testid="composer"]'));
      if (all.length === 0) {
        const f = document.querySelector('form:has(textarea)');
        if (f) all = [f];
      }
    } catch (_) {
      return document.querySelector('.surface-composer') || document.querySelector('[data-testid="composer"]');
    }
    if (all.length === 0) return null;
    if (all.length === 1) return all[0];

    const ae = document.activeElement;
    if (ae) {
      const focused = all.find((c) => c === ae || (typeof c.contains === 'function' && c.contains(ae)));
      if (focused) return focused;
    }
    if (typeof window !== 'undefined' && window.location) {
      const locStr = `${window.location.pathname || ''}${window.location.hash || ''}${window.location.search || ''}`;
      const m = locStr.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) {
        const urlCid = m[1].toLowerCase();
        const byUrl = all.find((c) => {
          const anc = typeof c.closest === 'function'
            ? c.closest('[data-conversation-id], [data-cascade-id], [data-trajectory-id], [data-session-id]')
            : null;
          if (!anc) return false;
          const v = String(anc.getAttribute('data-conversation-id') || anc.getAttribute('data-cascade-id') || '').trim().toLowerCase();
          return v === urlCid;
        });
        if (byUrl) return byUrl;
      }
    }
    return all[0];
  }

  function getHostCharId() {
    if (typeof document === 'undefined') return '';
    const aura = document.querySelector('agy-chibi-aura');
    return aura && aura.dataset && aura.dataset.charId ? aura.dataset.charId : '';
  }

  function classifyPoolKey(typeName, roleText) {
    const t = String(typeName || '').toLowerCase();
    const r = String(roleText || '').toLowerCase();
    const combined = `${t} ${r}`;

    if (t === 'workflow' || /workflow|pipeline|orchestrat/.test(t)) {
      return 'workflow';
    }
    if (t === 'swarm') {
      return 'swarm';
    }

    if (
      t.includes('image') ||
      /image-generator|design|ui|ux|theme|visual|css|svg|canvas|artwork|thiết kế|giao diện|đồ họa|mỹ thuật|hình ảnh|motion/.test(combined)
    ) {
      return 'design';
    }
    if (
      t.includes('browser') ||
      /browser|cdp|playwright|webview|qa|test|verify|e2e|kiểm thử|trình duyệt|kiểm định/.test(combined)
    ) {
      return 'browser';
    }
    if (
      t.includes('research') ||
      /research|audit|appsec|sec|pii|analyze|analysis|explore|survey|doc|bảo mật|kiểm toán|phân tích|khảo sát|rà soát|nghiên cứu/.test(combined)
    ) {
      return 'research';
    }
    return 'system';
  }

  function rememberAssignedHero(subId, heroKey) {
    if (state.assignedHeroBySubId.has(subId)) {
      state.assignedHeroBySubId.delete(subId);
    }
    state.assignedHeroBySubId.set(subId, heroKey);
    while (state.assignedHeroBySubId.size > 150) {
      const oldestKey = state.assignedHeroBySubId.keys().next().value;
      state.assignedHeroBySubId.delete(oldestKey);
    }
  }

  function assignHeroForSubagent(subId, typeName, roleText) {
    const usedNow = new Set();
    const hostHero = getHostCharId();
    if (hostHero) usedNow.add(hostHero);
    state.unitsById.forEach((u, otherId) => {
      if (otherId !== subId && u && u.hero) {
        usedNow.add(u.hero);
      }
    });

    if (state.assignedHeroBySubId.has(subId)) {
      const cachedHero = state.assignedHeroBySubId.get(subId);
      if (cachedHero && !usedNow.has(cachedHero)) {
        rememberAssignedHero(subId, cachedHero);
        return cachedHero;
      }
    }

    const poolKey = classifyPoolKey(typeName, roleText);
    const primaryPool = POOLS[poolKey] || POOLS.system;
    const h = hashStr(`${subId}|${typeName}|${roleText}`);

    // 1. Pick non-duplicate from specialized pool
    for (let i = 0; i < primaryPool.length; i++) {
      const candidate = primaryPool[(h + i) % primaryPool.length];
      if (!usedNow.has(candidate)) {
        rememberAssignedHero(subId, candidate);
        return candidate;
      }
    }

    // 2. Fallback to any non-duplicate Hashira in the full corps
    for (let i = 0; i < ALL_HERO_KEYS.length; i++) {
      const candidate = ALL_HERO_KEYS[(h + i) % ALL_HERO_KEYS.length];
      if (!usedNow.has(candidate)) {
        rememberAssignedHero(subId, candidate);
        return candidate;
      }
    }

    // 3. All 13+ slots full: deterministic pick from specialized pool
    const fallbackHero = primaryPool[h % primaryPool.length];
    rememberAssignedHero(subId, fallbackHero);
    return fallbackHero;
  }

  function normalizeSubEntry(raw, idx) {
    if (!raw || typeof raw !== 'object') return null;
    const rawId = String(
      raw.cid || raw.conversationId || raw.id || raw.subagentId || `sub_${idx}`
    ).trim().slice(0, 80);
    if (!rawId) return null;

    const typeName = String(raw.typeName || raw.type || raw.agentType || 'self')
      .trim()
      .slice(0, 40);
    const role = String(raw.role || raw.title || raw.name || raw.task || 'Kiếm sĩ Hiệp Chiến')
      .trim()
      .slice(0, 120);
    const lastTool = String(
      raw.lastTool || raw.toolSummary || raw.currentTool || raw.lastAction || ''
    )
      .trim()
      .slice(0, 110);
    const stepCount = Math.max(0, Math.round(Number(raw.stepCount ?? raw.steps ?? 0) || 0));
    const status = String(raw.status || raw.state || 'working').trim().toLowerCase();

    return {
      id: rawId,
      isSim: Boolean(raw.isSim || /^sim-|^showcase-/i.test(rawId)),
      typeName,
      role,
      lastTool,
      stepCount,
      status
    };
  }

  function ensureStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      ${SQUAD_TAG} {
        position: absolute;
        bottom: calc(100% + 34px);
        left: 8px;
        max-width: calc(100% - 158px);
        z-index: 61;
        display: none;
        align-items: center;
        gap: 6px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
        user-select: none;
        -webkit-app-region: no-drag;
      }
      ${SQUAD_TAG}[data-active="1"] {
        display: inline-flex;
      }
      @media (max-width: 640px) {
        ${SQUAD_TAG} {
          bottom: calc(100% + 62px);
          max-width: calc(100% - 20px);
        }
      }

      .agy-squad-banner-pill {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8.5px;
        border-radius: 9999px;
        background: linear-gradient(135deg, rgba(20, 12, 32, 0.95) 0%, rgba(36, 14, 24, 0.94) 100%);
        border: 1px solid rgba(250, 204, 21, 0.58);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), 0 0 12px rgba(250, 204, 21, 0.24);
        color: #fef08a;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.15px;
        white-space: nowrap;
      }
      .agy-squad-banner-dot {
        width: 6px;
        height: 6px;
        border-radius: 9999px;
        background: #fde047;
        box-shadow: 0 0 7px #f97316;
      }
      @keyframes agySquadBeacon {
        0%, 100% { transform: scale(0.9); opacity: 0.75; }
        50%      { transform: scale(1.28); opacity: 1; }
      }

      .agy-squad-units {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        pointer-events: none;
      }

      .agy-squad-unit-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        pointer-events: auto;
      }

      /* Shunshin Elemental Beam on Landing */
      .agy-shunshin-beam {
        position: absolute;
        left: 50%;
        bottom: 4px;
        width: 18px;
        height: 58px;
        transform: translateX(-50%) scaleY(0);
        transform-origin: bottom center;
        background: linear-gradient(180deg, rgba(255,255,255,0) 0%, var(--unit-color, #fde047) 65%, #ffffff 100%);
        filter: blur(2px);
        opacity: 0;
        pointer-events: none;
        border-radius: 999px;
      }
      @keyframes agyShunshinBeamFlash {
        0%   { opacity: 0.95; transform: translateX(-50%) scaleY(1.25); }
        55%  { opacity: 0.65; transform: translateX(-50%) scaleY(0.55); }
        100% { opacity: 0; transform: translateX(-50%) scaleY(0); }
      }

      .agy-squad-unit-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 28px;
        padding: 2px 8px 2px 3px;
        border-radius: 9999px;
        background: rgba(13, 11, 26, 0.94);
        border: 1.4px solid var(--unit-color, #38bdf8);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.56), 0 0 11px var(--unit-glow, rgba(56, 189, 248, 0.42));
        color: #f8fafc;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.42s ease;
      }
      .agy-squad-unit-btn:hover {
        transform: translateY(-2.5px) scale(1.06);
        border-color: #ffffff;
        box-shadow: 0 7px 18px rgba(0, 0, 0, 0.68), 0 0 18px var(--unit-color, #fde047);
      }

      @keyframes agyShunshinSpringLand {
        0%   { opacity: 0; transform: translateY(-26px) scale(0.68); }
        62%  { opacity: 1; transform: translateY(3px) scale(1.08); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* Breathing Aura Halo while Working */
      .agy-squad-unit-wrap[data-state="working"] .agy-squad-unit-btn::before {
        content: "";
        position: absolute;
        inset: -3px;
        border-radius: 9999px;
        border: 1px solid var(--unit-accent, #fde047);
        opacity: 0.55;
        pointer-events: none;
      }
      @keyframes agyUnitAuraBreathe {
        0%, 100% { transform: scale(0.98); opacity: 0.28; }
        50%      { transform: scale(1.06); opacity: 0.76; }
      }

      .agy-squad-emblem {
        width: 21px;
        height: 21px;
        border-radius: 9999px;
        background-color: rgba(255, 255, 255, 0.08);
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        border: 1px solid rgba(255, 255, 255, 0.32);
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .agy-squad-name {
        white-space: nowrap;
        color: #f8fafc;
      }
      .agy-squad-step-tag {
        padding: 0.5px 4.5px;
        border-radius: 999px;
        font-size: 9.5px;
        font-weight: 800;
        background: rgba(255, 255, 255, 0.11);
        color: var(--unit-accent, #fde047);
      }

      /* Golden Completion 「完」 & Farewell Slash State */
      .agy-squad-unit-wrap[data-state="completed"] .agy-squad-unit-btn {
        border-color: #fde047;
        background: linear-gradient(135deg, rgba(66, 38, 6, 0.96) 0%, rgba(24, 16, 8, 0.96) 100%);
        box-shadow: 0 0 18px rgba(250, 204, 21, 0.85), 0 0 30px rgba(245, 158, 11, 0.45);
      }
      .agy-squad-kan-seal {
        display: none;
        padding: 0.5px 5px;
        border-radius: 999px;
        background: linear-gradient(135deg, #fde047 0%, #f59e0b 100%);
        color: #1c0a00;
        font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP', 'Noto Serif JP', 'Source Han Serif JP', 'IPAPMincho', 'MS PMincho', 'Noto Serif', Georgia, serif;
        font-size: 9.5px;
        font-weight: 900;
        letter-spacing: 0.3px;
        box-shadow: 0 0 8px #fde047;
      }
      .agy-squad-unit-wrap[data-state="completed"] .agy-squad-kan-seal {
        display: inline-block;
      }
      .agy-squad-unit-wrap[data-state="completed"] .agy-squad-step-tag {
        display: none;
      }

      .agy-unit-farewell-slash {
        position: absolute;
        left: -8px;
        right: -8px;
        top: 50%;
        height: 2.5px;
        background: linear-gradient(90deg, transparent, #ffffff, #fde047, transparent);
        transform: translateY(-50%) rotate(-24deg) scaleX(0);
        opacity: 0;
        pointer-events: none;
      }
      @keyframes agyFarewellSlashArc {
        0%   { opacity: 1; transform: translateY(-50%) rotate(-24deg) scaleX(0.1); }
        45%  { opacity: 1; transform: translateY(-50%) rotate(-24deg) scaleX(1.35); }
        100% { opacity: 0; transform: translateY(-50%) rotate(-24deg) scaleX(1.6); }
      }

      .agy-squad-unit-wrap[data-retreating="1"] {
        opacity: 0;
        transform: translateY(-14px) scale(0.86);
        filter: blur(3px);
        transition: opacity 0.48s ease, transform 0.48s ease, filter 0.48s ease;
        pointer-events: none;
      }

      /* Kasugai Crow Intelligence Hover Card (100% CWE-79 Safe DOM) */
      .agy-kasugai-intel {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 0;
        width: 256px;
        display: none;
        flex-direction: column;
        gap: 4.5px;
        padding: 9px 11px;
        border-radius: 11px;
        background: rgba(12, 10, 24, 0.97);
        border: 1px solid var(--unit-color, #fde047);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.82), 0 0 18px var(--unit-glow, rgba(250, 204, 21, 0.3));
        color: #f8fafc;
        font-size: 10.8px;
        line-height: 1.35;
        z-index: 92;
        pointer-events: none;
      }
      .agy-squad-unit-wrap:hover .agy-kasugai-intel,
      .agy-squad-unit-btn:focus-visible + .agy-kasugai-intel {
        display: flex;
      }
      @keyframes agyIntelFadeIn {
        from { opacity: 0; transform: translateY(4px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .agy-intel-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }
      .agy-intel-title {
        font-weight: 800;
        color: var(--unit-color, #fde047);
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agy-intel-badge {
        font-size: 9.5px;
        font-weight: 700;
        padding: 1px 5.5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        color: #fef08a;
        flex-shrink: 0;
      }
      .agy-intel-row {
        display: flex;
        align-items: flex-start;
        gap: 5px;
      }
      .agy-intel-key {
        color: rgba(148, 163, 184, 0.95);
        font-weight: 600;
        flex-shrink: 0;
      }
      .agy-intel-val {
        color: #f1f5f9;
        font-weight: 600;
        word-break: break-word;
      }
      .agy-intel-hint {
        margin-top: 2px;
        padding-top: 4px;
        border-top: 1px dashed rgba(255, 255, 255, 0.12);
        font-size: 9.8px;
        color: #fde047;
        font-weight: 600;
      }

      /* ======================================================================
       * CRISIS-TO-SLASH VICTORY SEAL 「滅」 (ÁC QUỶ DIỆT SÁT) & KASUGAI CROW
       * ====================================================================== */
      #${VICTORY_HOST_ID} {
        position: fixed;
        top: 42px;
        right: 24px;
        z-index: 9998;
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 12px;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
      }
      .agy-metsu-stamp-card {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 15px 8px 11px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(32, 6, 10, 0.94) 0%, rgba(16, 8, 18, 0.94) 100%);
        border: 1.6px solid rgba(239, 68, 68, 0.88);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.72), 0 0 26px rgba(239, 68, 68, 0.55), inset 0 0 12px rgba(253, 224, 71, 0.2);
      }
      @keyframes agyMetsuStampSlam {
        0%   { opacity: 0; transform: scale(1.65) rotate(-8deg); filter: brightness(1.8); }
        16%  { opacity: 1; transform: scale(0.96) rotate(1.5deg); filter: brightness(1.25); }
        26%  { opacity: 1; transform: scale(1) rotate(0deg); filter: brightness(1); }
        80%  { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-10px) scale(0.94); }
      }
      .agy-metsu-seal-circle {
        width: 38px;
        height: 38px;
        border-radius: 8px;
        border: 2px solid #fde047;
        background: radial-gradient(circle, #dc2626 0%, #7f1d1d 100%);
        box-shadow: 0 0 14px #ef4444;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #fef9c3;
        font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP', 'Noto Serif JP', 'Source Han Serif JP', 'IPAPMincho', 'MS PMincho', 'Noto Serif', Georgia, serif;
        font-size: 21px;
        font-weight: 900;
        line-height: 1;
        transform: rotate(-4deg);
      }
      .agy-metsu-col {
        display: flex;
        flex-direction: column;
        gap: 1.5px;
      }
      .agy-metsu-headline {
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.9px;
        color: #fde047;
        text-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
      }
      .agy-metsu-sub {
        font-size: 10.5px;
        font-weight: 600;
        color: #fecaca;
      }

      /* Kasugai Crow Silhouette Gliding Across Top Edge */
      .agy-kasugai-crow-flyby {
        position: fixed;
        top: 24px;
        right: -80px;
        width: 54px;
        height: 38px;
        z-index: 9997;
        pointer-events: none;
        filter: drop-shadow(0 0 8px rgba(250, 204, 21, 0.72));
      }
      @keyframes agyKasugaiCrowGlide {
        0%   { opacity: 0; transform: translate(0, 14px) scale(0.75) rotate(-6deg); }
        18%  { opacity: 0.96; }
        50%  { opacity: 0.98; transform: translate(-240px, -8px) scale(1.04) rotate(3deg); }
        100% { opacity: 0; transform: translate(-520px, -26px) scale(0.82) rotate(-5deg); }
      }
      .agy-kasugai-crow-wings {
        transform-origin: 24px 20px;
      }
      @keyframes agyCrowWingFlap {
        from { transform: scaleY(1); }
        to   { transform: scaleY(0.56); }
      }
      @media (prefers-reduced-motion: no-preference) {
        .agy-squad-banner-dot {
          animation: agySquadBeacon 1.2s ease-in-out infinite;
        }
        .agy-squad-unit-wrap[data-state="working"] .agy-squad-unit-btn::before {
          animation: agyUnitAuraBreathe 1.65s ease-in-out infinite;
        }
        .agy-squad-unit-wrap[data-entering="1"] .agy-shunshin-beam {
          animation: agyShunshinBeamFlash 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .agy-squad-unit-wrap[data-entering="1"] .agy-squad-unit-btn {
          animation: agyShunshinSpringLand 0.54s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .agy-squad-unit-wrap[data-state="completed"] .agy-unit-farewell-slash {
          animation: agyFarewellSlashArc 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .agy-squad-unit-wrap:hover .agy-kasugai-intel,
        .agy-squad-unit-btn:focus-visible + .agy-kasugai-intel {
          animation: agyIntelFadeIn 0.15s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .agy-metsu-stamp-card {
          animation: agyMetsuStampSlam 1.82s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .agy-kasugai-crow-flyby {
          animation: agyKasugaiCrowGlide 1.8s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
        }
        .agy-kasugai-crow-wings {
          animation: agyCrowWingFlap 0.24s ease-in-out infinite alternate;
        }
      }
    `;
    document.head.appendChild(st);
  }

  function ensureMounted(composerEl) {
    if (typeof document === 'undefined') return null;
    const activeComposer = (state.composer && state.composer.isConnected) ? state.composer : null;
    const composer = composerEl || activeComposer || resolveComposer();
    if (!composer || !composer.isConnected) {
      if (!activeComposer) {
        if (state.squadEl && state.squadEl.parentElement) {
          state.squadEl.remove();
        }
        state.composer = null;
        state.squadEl = null;
        state.headerCountEl = null;
        state.unitsWrapEl = null;
      }
      return null;
    }

    ensureStyles();

    if (state.squadEl && state.squadEl.isConnected && state.squadEl.parentElement === composer) {
      return state.squadEl;
    }

    if (state.squadEl && state.squadEl.parentElement) {
      state.squadEl.remove();
    }

    const host = document.createElement(SQUAD_TAG);
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Quân Đoàn Cửu Trụ Hiệp Chiến');

    const banner = document.createElement('div');
    banner.className = 'agy-squad-banner-pill';
    const dot = document.createElement('span');
    dot.className = 'agy-squad-banner-dot';
    const bannerTxt = document.createElement('span');
    bannerTxt.textContent = '⚔️ Cửu Trụ Hiệp Chiến ×0';
    banner.appendChild(dot);
    banner.appendChild(bannerTxt);

    const unitsWrap = document.createElement('div');
    unitsWrap.className = 'agy-squad-units';

    host.appendChild(banner);
    host.appendChild(unitsWrap);
    composer.appendChild(host);

    state.composer = composer;
    state.squadEl = host;
    state.headerCountEl = bannerTxt;
    state.unitsWrapEl = unitsWrap;

    // Re-attach existing unit elements if composer re-mounted
    state.unitsById.forEach((u) => {
      if (u.wrapEl) unitsWrap.appendChild(u.wrapEl);
    });
    refreshSquadVisibility();
    return host;
  }

  function refreshSquadVisibility() {
    if (!state.squadEl) return;
    const totalVisible = state.unitsById.size;
    if (totalVisible > 0) {
      state.squadEl.dataset.active = '1';
      let workingCount = 0;
      state.unitsById.forEach((u) => {
        if (u.lifecycle === 'working') workingCount++;
      });
      const shownCount = workingCount > 0 ? workingCount : totalVisible;
      if (state.headerCountEl) {
        state.headerCountEl.textContent = workingCount > 0
          ? `⚔️ Cửu Trụ Hiệp Chiến ×${shownCount}`
          : '⚔️ Cửu Trụ Khải Hoàn';
      }
    } else {
      delete state.squadEl.dataset.active;
    }
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

  function clampKasugaiIntelPosition(wrapEl, intelEl) {
    if (!wrapEl || !intelEl || typeof wrapEl.getBoundingClientRect !== 'function') return;
    intelEl.style.left = '0px';
    intelEl.style.right = 'auto';
    const wrapRect = wrapEl.getBoundingClientRect();
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const comp = state.composer || resolveComposer();
    const boundRect = comp && typeof comp.getBoundingClientRect === 'function'
      ? comp.getBoundingClientRect()
      : { left: 8, right: vw - 8 };
    const availW = Math.max(196, Math.round((boundRect.right - boundRect.left) - 12));
    const cardW = Math.min(256, availW);
    intelEl.style.width = `${cardW}px`;

    const maxRight = Math.min(boundRect.right - 4, vw - 8);
    const minLeft = Math.max(8, boundRect.left + 2);
    let desiredLeft = wrapRect.left;
    if (desiredLeft + cardW > maxRight) {
      desiredLeft = maxRight - cardW;
    }
    if (desiredLeft < minLeft) {
      desiredLeft = minLeft;
    }
    intelEl.style.left = `${Math.round(desiredLeft - wrapRect.left)}px`;
  }

  function castUnitBreathingSkill(unit) {
    if (!unit || !unit.meta) return;
    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    if (!ext || typeof ext.castSkill !== 'function') return;

    const hero = unit.hero;
    const idx = (state.comboByHero[hero] || 0) % 4;
    state.comboByHero[hero] = (idx + 1) % 4;

    const rect = unit.btnEl && typeof unit.btnEl.getBoundingClientRect === 'function'
      ? unit.btnEl.getBoundingClientRect()
      : null;
    const muted = isSfxMutedNow();

    ext.castSkill(hero, idx, {
      charId: hero,
      originRect: rect,
      actionSticker: unit.actionUrl || '',
      composerEl: null,
      soundEnabled: !muted
    });
  }

  function createUnitDom(sub, heroKey) {
    const meta = HERO_ROSTER[heroKey] || HERO_ROSTER.rengoku;
    const ornamentUrl = safeAssetUrl(`assets/${meta.hero}_ornament.svg`);
    const avatarFallbackUrl = safeAssetUrl(`assets/${meta.hero}_avatar.jpg`);
    const actionUrl = safeAssetUrl(`assets/${meta.hero}_action.webp`);

    if (
      actionUrl &&
      typeof window !== 'undefined' &&
      window.__AGY_KNY_SKILLS__ &&
      typeof window.__AGY_KNY_SKILLS__.preloadActionSprite === 'function'
    ) {
      try {
        window.__AGY_KNY_SKILLS__.preloadActionSprite(meta.hero, actionUrl);
      } catch (_) {}
    }

    const wrap = document.createElement('div');
    wrap.className = 'agy-squad-unit-wrap';
    wrap.dataset.state = 'working';
    wrap.dataset.entering = '1';
    wrap.style.setProperty('--unit-color', meta.color);
    wrap.style.setProperty('--unit-accent', meta.accent);
    wrap.style.setProperty('--unit-glow', meta.glow);

    const beam = document.createElement('span');
    beam.className = 'agy-shunshin-beam';
    beam.setAttribute('aria-hidden', 'true');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'agy-squad-unit-btn';
    btn.setAttribute('aria-label', `${meta.titleVi} — Nhấn để tung tuyệt kỹ Hơi Thở`);

    const emblem = document.createElement('span');
    emblem.className = 'agy-squad-emblem';
    const bgUrl = ornamentUrl || avatarFallbackUrl;
    if (bgUrl) {
      emblem.style.backgroundImage = `url("${bgUrl}")`;
    } else if (typeof window !== 'undefined' && window.__AGY_KNY_ICONS__) {
      emblem.innerHTML = window.__AGY_KNY_ICONS__.getElementalSvg(meta.elem, 14);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'agy-squad-name';
    nameSpan.textContent = meta.shortVi;

    const stepTag = document.createElement('span');
    stepTag.className = 'agy-squad-step-tag';
    stepTag.textContent = `${sub.stepCount || 1}`;

    const kanSeal = document.createElement('span');
    kanSeal.className = 'agy-squad-kan-seal';
    kanSeal.setAttribute('lang', 'ja');
    kanSeal.textContent = '「完」';

    const slashArc = document.createElement('span');
    slashArc.className = 'agy-unit-farewell-slash';
    slashArc.setAttribute('aria-hidden', 'true');

    btn.appendChild(emblem);
    btn.appendChild(nameSpan);
    btn.appendChild(stepTag);
    btn.appendChild(kanSeal);
    btn.appendChild(slashArc);

    // Kasugai Intel Hover Card — 100% DOM textContent construction (Zero innerHTML with untrusted strings!)
    const intel = document.createElement('div');
    intel.className = 'agy-kasugai-intel';
    intel.setAttribute('role', 'tooltip');

    const intelHdr = document.createElement('div');
    intelHdr.className = 'agy-intel-hdr';
    const intelTitle = document.createElement('span');
    intelTitle.className = 'agy-intel-title';
    intelTitle.textContent = meta.titleVi;
    const intelBadge = document.createElement('span');
    intelBadge.className = 'agy-intel-badge';
    intelBadge.textContent = 'Đang hiệp chiến';
    intelHdr.appendChild(intelTitle);
    intelHdr.appendChild(intelBadge);

    const buildIntelRow = (label, initialVal) => {
      const r = document.createElement('div');
      r.className = 'agy-intel-row';
      const k = document.createElement('span');
      k.className = 'agy-intel-key';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = 'agy-intel-val';
      v.textContent = initialVal;
      r.appendChild(k);
      r.appendChild(v);
      return { row: r, valEl: v };
    };

    const roleRow = buildIntelRow('Nhiệm vụ:', sub.role || 'Thực thi chuyên biệt');
    const toolRow = buildIntelRow('Đang thi triển:', sub.lastTool || 'Đang vận khí suy luận...');
    const stepRow = buildIntelRow('Số bước:', `${sub.stepCount || 0} bước (${sub.typeName || 'self'})`);

    const hint = document.createElement('div');
    hint.className = 'agy-intel-hint';
    hint.textContent = '⚡ Nhấn chuột để triệu hồi Đại Trụ tung Hơi Thở!';

    intel.appendChild(intelHdr);
    intel.appendChild(roleRow.row);
    intel.appendChild(toolRow.row);
    intel.appendChild(stepRow.row);
    intel.appendChild(hint);

    wrap.appendChild(beam);
    wrap.appendChild(btn);
    wrap.appendChild(intel);

    const unitRecord = {
      id: sub.id,
      isSim: Boolean(sub.isSim || /^sim-|^showcase-/i.test(String(sub.id))),
      hero: meta.hero,
      meta,
      actionUrl,
      lifecycle: 'working',
      wrapEl: wrap,
      btnEl: btn,
      intelEl: intel,
      stepTagEl: stepTag,
      intelBadgeEl: intelBadge,
      roleValEl: roleRow.valEl,
      toolValEl: toolRow.valEl,
      stepValEl: stepRow.valEl,
      enterTimer: 0,
      retreatTimer: 0,
      removeTimer: 0
    };

    wrap.addEventListener('mouseenter', () => clampKasugaiIntelPosition(wrap, intel));
    btn.addEventListener('focus', () => clampKasugaiIntelPosition(wrap, intel));

    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      castUnitBreathingSkill(unitRecord);
    });

    unitRecord.enterTimer = setTimeout(() => {
      unitRecord.enterTimer = 0;
      if (wrap && wrap.dataset) delete wrap.dataset.entering;
    }, 580);

    return unitRecord;
  }

  function updateUnitDom(unit, sub) {
    if (!unit) return;
    if (unit.stepTagEl) {
      unit.stepTagEl.textContent = `${Math.max(1, sub.stepCount || 1)}`;
    }
    if (unit.roleValEl) {
      unit.roleValEl.textContent = sub.role || 'Kiếm sĩ Hiệp Chiến';
    }
    if (unit.toolValEl) {
      unit.toolValEl.textContent = sub.lastTool || 'Đang vận khí suy luận...';
    }
    if (unit.stepValEl) {
      unit.stepValEl.textContent = `${sub.stepCount || 0} bước (${sub.typeName || 'self'})`;
    }
  }

  function markUnitCompletedAndRetreat(unit, completedInfo) {
    if (!unit || unit.lifecycle === 'completed' || unit.lifecycle === 'retreating') return;
    unit.lifecycle = 'completed';
    state.seenCompletedIds.add(unit.id);
    if (state.seenCompletedIds.size > 150) {
      const first = state.seenCompletedIds.values().next().value;
      state.seenCompletedIds.delete(first);
    }

    if (completedInfo) {
      updateUnitDom(unit, completedInfo);
    }
    if (unit.intelBadgeEl) {
      unit.intelBadgeEl.textContent = '「完」 HOÀN TẤT';
    }
    if (unit.toolValEl && (!completedInfo || !completedInfo.lastTool)) {
      unit.toolValEl.textContent = 'Đã hoàn thành xuất sắc nhiệm vụ';
    }
    if (unit.wrapEl) {
      delete unit.wrapEl.dataset.entering;
      unit.wrapEl.dataset.state = 'completed';
    }

    clearTimeout(unit.retreatTimer);
    clearTimeout(unit.removeTimer);

    unit.retreatTimer = setTimeout(() => {
      unit.retreatTimer = 0;
      unit.lifecycle = 'retreating';
      if (unit.wrapEl) {
        unit.wrapEl.dataset.retreating = '1';
      }
      unit.removeTimer = setTimeout(() => {
        unit.removeTimer = 0;
        if (unit.wrapEl && unit.wrapEl.parentElement) {
          unit.wrapEl.remove();
        }
        state.unitsById.delete(unit.id);
        refreshSquadVisibility();
      }, 520);
    }, 2200);

    refreshSquadVisibility();
  }

  function lockActiveCid(nextCid) {
    const normCid = typeof nextCid === 'string' ? nextCid.trim() : '';
    state.activeCid = normCid;
    state.lockedCid = (normCid && normCid !== 'latest') ? normCid : '';
  }

  function resetConversation(nextCid) {
    const normCid = typeof nextCid === 'string' ? nextCid.trim() : '';
    state.activeCid = normCid;
    state.lockedCid = (normCid && normCid !== 'latest') ? normCid : '';
    state.seenCompletedIds.clear();
    state.lastSlashSeqHandled = 0;

    // Immediately remove real units of the previous conversation without false 「完」 victory celebration!
    const toRemove = [];
    state.unitsById.forEach((u, id) => {
      if (u && !u.isSim) {
        clearTimeout(u.enterTimer);
        clearTimeout(u.retreatTimer);
        clearTimeout(u.removeTimer);
        if (u.wrapEl && u.wrapEl.parentElement) {
          u.wrapEl.remove();
        }
        toRemove.push(id);
      }
    });
    toRemove.forEach((id) => state.unitsById.delete(id));
    refreshSquadVisibility();
  }

  function applySquadLists(activeRawList, completedRawList, isSimSync) {
    const simMode = Boolean(isSimSync);
    const activeList = Array.isArray(activeRawList)
      ? activeRawList.map((item, i) => normalizeSubEntry(item, i)).filter(Boolean)
      : [];
    const completedList = Array.isArray(completedRawList)
      ? completedRawList.map((item, i) => normalizeSubEntry(item, i + 100)).filter(Boolean)
      : [];

    if (activeList.length > 0 || completedList.length > 0 || state.unitsById.size > 0) {
      ensureMounted();
    }
    if (!state.unitsWrapEl || !state.unitsWrapEl.isConnected) return;

    const activeIds = new Set();

    activeList.forEach((sub) => {
      if (simMode) sub.isSim = true;
      activeIds.add(sub.id);
      state.seenCompletedIds.delete(sub.id);
      let unit = state.unitsById.get(sub.id);
      if (!unit) {
        const heroKey = assignHeroForSubagent(sub.id, sub.typeName, sub.role);
        unit = createUnitDom(sub, heroKey);
        state.unitsById.set(sub.id, unit);
        state.unitsWrapEl.appendChild(unit.wrapEl);
      } else {
        if (unit.lifecycle !== 'working') {
          clearTimeout(unit.retreatTimer);
          unit.retreatTimer = 0;
          clearTimeout(unit.removeTimer);
          unit.removeTimer = 0;
          unit.lifecycle = 'working';
          if (unit.wrapEl) {
            delete unit.wrapEl.dataset.retreating;
            unit.wrapEl.dataset.state = 'working';
          }
          if (unit.intelBadgeEl) {
            unit.intelBadgeEl.textContent = 'Đang hiệp chiến';
          }
        }
        updateUnitDom(unit, sub);
      }
    });

    // Newly completed subagents (strictly isolated by unit.isSim === simMode so simulation never touches real Hashira!)
    const completedMap = new Map();
    completedList.forEach((c) => {
      if (simMode) c.isSim = true;
      completedMap.set(c.id, c);
    });

    state.unitsById.forEach((unit, id) => {
      if (Boolean(unit.isSim) !== simMode) return;
      if (!activeIds.has(id) && unit.lifecycle === 'working') {
        markUnitCompletedAndRetreat(unit, completedMap.get(id) || null);
      }
    });

    // Also briefly celebrate recently completed subagents that finished inside a single fast tick
    completedList.forEach((cSub) => {
      if (activeIds.has(cSub.id) || state.unitsById.has(cSub.id) || state.seenCompletedIds.has(cSub.id)) {
        return;
      }
      const heroKey = assignHeroForSubagent(cSub.id, cSub.typeName, cSub.role);
      const unit = createUnitDom(cSub, heroKey);
      state.unitsById.set(cSub.id, unit);
      state.unitsWrapEl.appendChild(unit.wrapEl);
      markUnitCompletedAndRetreat(unit, cSub);
    });

    refreshSquadVisibility();
  }

  function sync(snap) {
    if (!snap || typeof snap !== 'object') return;
    const isSimSync = Boolean(snap.__fromSim);

    if (!isSimSync) {
      if (state.activeCid === 'idle' || state.lockedCid === 'idle') return;
      if (state.lockedCid && snap.cid && snap.cid !== state.lockedCid) return;
      if (snap.cid) {
        if (state.activeCid && state.activeCid !== 'latest' && snap.cid !== state.activeCid) {
          resetConversation(snap.cid);
        } else if (!state.activeCid || state.activeCid === 'latest') {
          state.activeCid = snap.cid;
        }
      }
    }

    applySquadLists(snap.activeSubagents, snap.recentCompletedSubagents, isSimSync);
  }

  /* ==========================================================================
   * VICTORY STAMP 「滅」 (ÁC QUỶ DIỆT SÁT) & KASUGAI CROW FLYBY
   * ========================================================================== */

  function formatVictoryReasonVi(rawReason) {
    const key = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (!key || key === 'bug_slashed') {
      return 'Đã chém đứt tà khí lỗi (Exit 0) • Rèn Hách Đao +25%';
    }
    if (key === 'git_pushed') {
      return 'Khải hoàn đẩy code lên kho lưu trữ (Git Push thành công)!';
    }
    return key.slice(0, 84);
  }

  function triggerVictoryStamp(rawOpts) {
    if (typeof document === 'undefined' || !document.body) return;
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    if (typeof opts.slashSeq === 'number' && opts.slashSeq > 0) {
      if (opts.slashSeq === state.lastSlashSeqHandled) return;
      state.lastSlashSeqHandled = opts.slashSeq;
    }

    ensureStyles();

    const prev = document.getElementById(VICTORY_HOST_ID);
    if (prev) prev.remove();
    document.querySelectorAll('.agy-kasugai-crow-flyby').forEach((el) => el.remove());
    clearTimeout(state.victoryTimer);
    state.victoryTimer = 0;
    clearTimeout(state.crowTimer);
    state.crowTimer = 0;

    const host = document.createElement('div');
    host.id = VICTORY_HOST_ID;
    host.setAttribute('aria-hidden', 'true');

    const card = document.createElement('div');
    card.className = 'agy-metsu-stamp-card';

    const seal = document.createElement('div');
    seal.className = 'agy-metsu-seal-circle';
    seal.setAttribute('lang', 'ja');
    seal.textContent = '滅';

    const col = document.createElement('div');
    col.className = 'agy-metsu-col';

    const headline = document.createElement('div');
    headline.className = 'agy-metsu-headline';
    headline.textContent = '「滅」 ÁC QUỶ DIỆT SÁT';

    const sub = document.createElement('div');
    sub.className = 'agy-metsu-sub';
    sub.textContent = formatVictoryReasonVi(opts.reason);

    col.appendChild(headline);
    col.appendChild(sub);
    card.appendChild(seal);
    card.appendChild(col);
    host.appendChild(card);
    document.body.appendChild(host);

    // Kasugai Crow flapping wings silhouette gliding gracefully across top right
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      const crowWrap = document.createElement('div');
      crowWrap.className = 'agy-kasugai-crow-flyby';
      crowWrap.setAttribute('aria-hidden', 'true');
      crowWrap.innerHTML =
        `<svg width="54" height="38" viewBox="0 0 54 38" fill="none" xmlns="http://www.w3.org/2000/svg">` +
        `<g class="agy-kasugai-crow-wings">` +
        `<path d="M25 20C18 8 6 4 2 9c7 2 12 7 16 12-5 1-9 4-11 7 5-1 11-2 18-4Z" fill="#0f172a" stroke="#fde047" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M27 20C35 6 46 3 52 8c-7 3-13 8-17 13 5 1 9 3 12 6-6-1-12-2-20-7Z" fill="#0f172a" stroke="#fde047" stroke-width="1.2" stroke-linejoin="round"/>` +
        `</g>` +
        `<ellipse cx="26" cy="21" rx="7" ry="3.2" fill="#09090b" stroke="#ef4444" stroke-width="1.1"/>` +
        `<circle cx="20.5" cy="20.2" r="1.2" fill="#ef4444"/>` +
        `<polygon points="18,21 13,22.2 18.2,22.8" fill="#fde047"/>` +
        `</svg>`;
      document.body.appendChild(crowWrap);
      state.crowTimer = setTimeout(() => {
        state.crowTimer = 0;
        if (crowWrap.parentElement) crowWrap.remove();
      }, 1850);
    }

    state.victoryTimer = setTimeout(() => {
      state.victoryTimer = 0;
      if (host.parentElement) host.remove();
    }, 1850);
  }

  /* ==========================================================================
   * CINEMA / DEMO MULTI-HASHIRA RAID SIMULATION
   * ========================================================================== */

  function clearSimulationTimers() {
    while (state.simTimers.length > 0) {
      clearTimeout(state.simTimers.pop());
    }
    state.simActive = false;
  }

  function stopSimulation() {
    clearSimulationTimers();
    const toRemove = [];
    state.unitsById.forEach((u, id) => {
      if (u && (u.isSim || /^sim-|^showcase-/i.test(String(id)))) {
        clearTimeout(u.enterTimer);
        clearTimeout(u.retreatTimer);
        clearTimeout(u.removeTimer);
        if (u.wrapEl && u.wrapEl.parentElement) {
          u.wrapEl.remove();
        }
        toRemove.push(id);
      }
    });
    toRemove.forEach((id) => {
      state.unitsById.delete(id);
      state.assignedHeroBySubId.delete(id);
      state.seenCompletedIds.delete(id);
    });
    Array.from(state.assignedHeroBySubId.keys()).forEach((k) => {
      if (/^sim-|^showcase-/i.test(String(k))) {
        state.assignedHeroBySubId.delete(k);
      }
    });
    refreshSquadVisibility();
  }

  function simulateRaid(rawOpts) {
    stopSimulation();
    state.simActive = true;
    ensureMounted();

    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    const durationMs = Math.max(2600, Math.min(18000, Number(opts.durationMs) || 6200));

    const baseSquad = Array.isArray(opts.subagents) && opts.subagents.length > 0
      ? opts.subagents
      : [
          {
            cid: 'sim-sec-audit-01',
            isSim: true,
            typeName: 'research',
            role: 'Kiểm toán Bảo mật & Lá chắn CWE-79',
            lastTool: 'Rà soát ranh giới bảo mật Enterprise',
            stepCount: 3
          },
          {
            cid: 'sim-ui-forge-02',
            isSim: true,
            typeName: 'image-generator',
            role: 'Chế tác Giao diện Đa Vũ Trụ .agytheme',
            lastTool: 'Đồng bộ bảng màu Nhật Luân & SVG',
            stepCount: 4
          },
          {
            cid: 'sim-cdp-verify-03',
            isSim: true,
            typeName: 'browser',
            role: 'Trinh sát Trình duyệt & Kiểm định 60fps',
            lastTool: 'Đo khung hình Canvas không giật lag',
            stepCount: 2
          },
          {
            cid: 'sim-core-daemon-04',
            isSim: true,
            typeName: 'self',
            role: 'Khai mở Luồng SSE Byte-Tailer < 30ms',
            lastTool: 'Truyền phát sự kiện thời gian thực',
            stepCount: 5
          }
        ];
    const demoSquad = baseSquad.map((s) => ({ ...s, isSim: true }));

    // Staggered Shunshin landing
    demoSquad.forEach((_, idx) => {
      const t = setTimeout(() => {
        sync({
          __fromSim: true,
          activeSubagents: demoSquad.slice(0, idx + 1),
          recentCompletedSubagents: []
        });
      }, idx * 240);
      state.simTimers.push(t);
    });

    // Mid-raid step progression
    const midTimer = setTimeout(() => {
      const progressed = demoSquad.map((s, i) => ({
        ...s,
        stepCount: (Number(s.stepCount) || 2) + 3 + i,
        lastTool: 'Hợp kích hoàn tất • Chuẩn bị thu kiếm'
      }));
      sync({
        __fromSim: true,
        activeSubagents: progressed,
        recentCompletedSubagents: []
      });
    }, Math.round(durationMs * 0.52));
    state.simTimers.push(midTimer);

    // Graceful completion & golden 「完」 mist retreat
    const endTimer = setTimeout(() => {
      const finished = demoSquad.map((s, i) => ({
        ...s,
        stepCount: (Number(s.stepCount) || 2) + 5 + i,
        lastTool: 'Nhiệm vụ hoàn thành xuất sắc'
      }));
      sync({
        __fromSim: true,
        activeSubagents: [],
        recentCompletedSubagents: finished
      });
      state.simActive = false;
    }, durationMs);
    state.simTimers.push(endTimer);

    return { ok: true, count: demoSquad.length, durationMs };
  }

  function teardown() {
    clearSimulationTimers();
    clearTimeout(state.victoryTimer);
    state.victoryTimer = 0;
    clearTimeout(state.crowTimer);
    state.crowTimer = 0;

    state.unitsById.forEach((u) => {
      clearTimeout(u.enterTimer);
      clearTimeout(u.retreatTimer);
      clearTimeout(u.removeTimer);
    });
    state.unitsById.clear();
    state.assignedHeroBySubId.clear();
    state.seenCompletedIds.clear();
    state.comboByHero = Object.create(null);
    state.simActive = false;
    state.lastSlashSeqHandled = 0;
    state.activeCid = '';
    state.lockedCid = '';

    if (typeof document !== 'undefined') {
      document.querySelectorAll(SQUAD_TAG).forEach((el) => el.remove());
      const vic = document.getElementById(VICTORY_HOST_ID);
      if (vic) vic.remove();
      document.querySelectorAll('.agy-kasugai-crow-flyby').forEach((el) => el.remove());
      const st = document.getElementById(STYLE_ID);
      if (st) st.remove();
    }

    state.composer = null;
    state.squadEl = null;
    state.headerCountEl = null;
    state.unitsWrapEl = null;
  }

  const api = {
    mount: ensureMounted,
    sync,
    resetConversation,
    lockActiveCid,
    simulateRaid,
    stopSimulation,
    triggerVictoryStamp,
    teardown,
    destroy: teardown
  };

  if (typeof window !== 'undefined') window.__AGY_SQUAD_RAID__ = api;
  if (typeof globalThis !== 'undefined') globalThis.__AGY_SQUAD_RAID__ = api;
})();
