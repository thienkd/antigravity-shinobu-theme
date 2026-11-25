(() => {
  if ((typeof __AGY_PRECLEANED__ === 'undefined' || !__AGY_PRECLEANED__) && typeof window !== 'undefined' && typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === 'function') {
    try { window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__({ isReinject: true }); } catch (_) {}
  }

  const SEC = (typeof __AGY_SEC__ === 'object' && __AGY_SEC__) ? __AGY_SEC__ : {
    getAssetBase: () => '',
    getInitialConfig: () => null,
    isSyncFromDaemon: () => false,
    saveConfigSecure: () => false,
    isDangerousKey: (k) => ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'].includes(String(k || '').trim()),
    escapeHtml: (raw) => String(raw == null ? '' : raw).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
    stripProtoKeys: (obj) => obj,
    sanitizeCssUrl: (raw) => (typeof raw === 'string' && !/["'()\\;\r\n\0<>`{}]/.test(raw) ? raw.trim() : ''),
    sanitizeCssValue: (raw, fb = '') => (typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : (typeof raw === 'string' && raw.trim() && raw.trim().length <= 260 && !/["';{}<>\\`\x00-\x1f\x7f]|\/\*|\*\/|@import|@charset|@namespace|expression\s*\(|url\s*\(|image-set\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(raw.trim()) ? raw.trim() : fb)),
    sanitizeSvgMarkup: (svg) => (typeof svg === 'string' && !/<script|<foreignobject|\bon[a-z]+\s*=/i.test(svg) ? svg.trim() : ''),
    sanitizeThemeDefinition: (t) => t,
    resolveAssetUrl: (val) => (typeof val === 'string' ? val.trim() : '')
  };

  const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
  const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(String(navigator.platform || navigator.userAgent || ''));
  const BLUR_CACHE_MAX_ENTRIES = 12;

  let coreDestroyed = false;
  let transientOverrideState = null;
  let blurSliderDebounceTimer = 0;
  let prebakeReqSeq = 0;
  let modalPendingForged = null;
  let modalPendingForgeName = '';
  let modalPendingForgeFx = '';
  let modalActiveTab = 'themes';

  function isValidImageUploadFile(file) {
    return Boolean(
      file &&
      typeof file.size === 'number' &&
      file.size > 0 &&
      file.size <= MAX_IMAGE_UPLOAD_BYTES &&
      ALLOWED_IMAGE_MIMES.includes(file.type)
    );
  }

  function strictPercentEncodeSvg(str) {
    return encodeURIComponent(str).replace(/[!'()*;]/g, (ch) =>
      '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
    );
  }

  function safeCssUrl(raw) {
    if (typeof raw !== 'string') return '';
    const viaSec = SEC.sanitizeCssUrl(raw);
    if (viaSec) return viaSec;
    const trimmed = raw.trim();
    // Safe fallback for pure base64 raster data URIs (cannot contain any CSS/HTML breakout chars)
    if (/^data:image\/(?:webp|png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return trimmed;
    }
    return '';
  }

  function resolveAssetUrl(raw) {
    if (!raw || raw === 'none' || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';

    // Normalize SVG data URIs (including ;charset=utf-8 / ;utf8 / ;base64) through sanitizeSvgMarkup -> strict percent-encoded URI
    const svgDataMatch = trimmed.match(/^data:image\/svg\+xml(?:;charset=[A-Za-z0-9_-]+|;utf8)?(;base64)?,/i);
    if (svgDataMatch) {
      try {
        const body = trimmed.slice(svgDataMatch[0].length);
        let decodedSvg = '';
        if (svgDataMatch[1]) {
          const bin = typeof atob === 'function' ? atob(body) : '';
          decodedSvg = decodeURIComponent(Array.from(bin).map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        } else {
          decodedSvg = decodeURIComponent(body);
        }
        const cleanSvg = SEC.sanitizeSvgMarkup(decodedSvg);
        if (!cleanSvg) return '';
        return SEC.sanitizeCssUrl(`data:image/svg+xml,${strictPercentEncodeSvg(cleanSvg)}`);
      } catch (_) {
        return '';
      }
    }

    if (trimmed.startsWith('data:')) {
      return safeCssUrl(trimmed);
    }

    const assetBase = typeof SEC.getAssetBase === 'function' ? SEC.getAssetBase() : '';
    if (!assetBase && /^assets\//.test(trimmed)) {
      const localPreviewCandidate = `./themes/${trimmed}`;
      return SEC.resolveAssetUrl(localPreviewCandidate) || SEC.sanitizeCssUrl(localPreviewCandidate);
    }
    return SEC.resolveAssetUrl(trimmed) || SEC.sanitizeCssUrl(trimmed);
  }

  const RAW_THEMES = /*__THEMES_PLACEHOLDER__*/{};
  const THEMES = Object.create(null);
  if (RAW_THEMES && typeof RAW_THEMES === 'object' && !Array.isArray(RAW_THEMES)) {
    for (const k of Object.keys(RAW_THEMES)) {
      if (typeof SEC.isDangerousKey === 'function' ? SEC.isDangerousKey(k) : (k === '__proto__' || k === 'constructor' || k === 'prototype')) continue;
      THEMES[k] = RAW_THEMES[k];
    }
  }

  Object.values(THEMES).forEach((cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    ['wallpaper', 'sticker', 'userSticker', 'actionSticker', 'userActionSticker', 'cornerSvg', 'userCornerSvg', 'userAvatar', 'agentAvatar'].forEach((k) => {
      if (typeof cfg[k] === 'string' && cfg[k]) {
        cfg[k] = resolveAssetUrl(cfg[k]);
      }
    });
  });

  const THEME_KEYS = Object.keys(THEMES);
  if (typeof window !== 'undefined' && window.__AGY_THEME_FORGE__ && typeof window.__AGY_THEME_FORGE__.hydrateIntoThemesRegistry === 'function') {
    window.__AGY_THEME_FORGE__.hydrateIntoThemesRegistry(THEMES, THEME_KEYS);
  }
  const DEFAULT_THEME_KEY = THEME_KEYS[0] || 'Default';

  const STORAGE_THEME = 'agy_theme_v3';
  const STORAGE_BUBBLE = 'agy_bubble_v3';
  const STORAGE_INPUT = 'agy_input_v3';
  const STORAGE_DIMMING = 'agy_dimming_v3';
  const STORAGE_WP_ENABLED = 'agy_wp_enabled_v3';
  const STORAGE_CUSTOM_WP = 'agy_custom_wp_v3';
  const STORAGE_USER_AVATAR = 'agy_user_avatar_v3';
  const STORAGE_AGENT_AVATAR = 'agy_agent_avatar_v3';
  const STORAGE_USER_AVATAR_SAVED = 'agy_user_avatar_saved_v1';
  const STORAGE_AGENT_AVATAR_SAVED = 'agy_agent_avatar_saved_v1';
  const STORAGE_GLASS_BLUR = 'agy_glass_blur_v3';
  const STORAGE_AVATAR_SIZE = 'agy_avatar_size_v3';
  const STORAGE_AVATAR_RADIUS = 'agy_avatar_radius_v3';
  const STORAGE_TRANSPARENT_WORLD = 'agy_transparent_world_v1';
  const STORAGE_MASTER_PERSONA = 'agy_master_persona_v1';
  const STORAGE_CHIBI_ENABLED = 'agy_chibi_enabled_v1';
  const STORAGE_CHIBI_3D = 'agy_chibi_3d_v1';
  const STORAGE_CHIBI_2D_LIVE = 'agy_chibi_2d_live_v1';
  const STORAGE_FX_DENSITY = 'agy_fx_density_v1';
  const STORAGE_AUTO_FINISHER = 'agy_auto_finisher_v1';
  const STORAGE_BUBBLE_RADIUS = 'agy_bubble_radius_v1';
  const STORAGE_ECO_BATTERY = 'agy_eco_battery_v1';
  const STORAGE_UI_LANG = 'agy_ui_lang_v1';
  const STORAGE_WS_PROFILES = 'agy_workspace_profiles_v1';
  const STORAGE_ACTIVE_WS = 'agy_active_workspace_v1';
  const STORAGE_AI_PERSONA_MODE = 'agy_ai_persona_mode_v1';
  const STORAGE_FOCUS_MODE = 'agy_focus_mode_v1';
  const MAX_WORKSPACE_PROFILES = 24;

  function getDefaultAiPersonaMode() {
    const keys = Object.keys(THEMES);
    const hasKny = keys.some((k) => /Trụ|Kamado|Ubuyashiki|Agatsuma|Hashibira/i.test(k));
    return hasKny ? 'subtle' : 'off';
  }

  function normalizeAiPersonaMode(raw, fallback) {
    const fb = fallback || getDefaultAiPersonaMode();
    if (typeof raw !== 'string') return fb;
    const v = raw.trim().toLowerCase();
    return (v === 'off' || v === 'subtle' || v === 'roleplay') ? v : fb;
  }

  function normalizeUiLang(raw) {
    if (typeof window !== 'undefined' && window.__AGY_I18N__ && typeof window.__AGY_I18N__.normalizeLang === 'function') {
      return window.__AGY_I18N__.normalizeLang(raw);
    }
    if (typeof raw !== 'string') return 'vi';
    const c = raw.trim().toLowerCase();
    return (c === 'en' || c.startsWith('en-')) ? 'en' : ((c === 'ja' || c.startsWith('ja-') || c === 'jp') ? 'ja' : 'vi');
  }

  function tr(key, fallbackVi, vars) {
    if (typeof window !== 'undefined' && window.__AGY_I18N__ && typeof window.__AGY_I18N__.t === 'function') {
      return window.__AGY_I18N__.t(key, fallbackVi, vars);
    }
    if (!vars || typeof vars !== 'object') return fallbackVi;
    return String(fallbackVi).replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => (
      Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : m
    ));
  }

  function normalizeWorkspaceKey(raw) {
    if (typeof raw !== 'string') return '';
    let s = raw.trim();
    if (!s) return '';
    try {
      if (/^file:\/\//i.test(s)) s = decodeURIComponent(s.replace(/^file:\/\/\/?/i, ''));
    } catch (_) {}
    s = s.replace(/\\/g, '/').replace(/\/+$/, '');
    if (s.includes('/')) {
      const parts = s.split('/').filter(Boolean);
      s = parts[parts.length - 1] || '';
    }
    const clean = s.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64).toLowerCase();
    if (!clean || SEC.isDangerousKey(clean)) return '';
    return clean;
  }

  function sanitizeWorkspaceProfilesMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
    const keys = Object.keys(rawMap);
    for (let i = 0; i < keys.length; i++) {
      if (Object.keys(out).length >= MAX_WORKSPACE_PROFILES) break;
      const k = normalizeWorkspaceKey(keys[i]);
      if (!k) continue;
      const item = rawMap[keys[i]];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const thName = (typeof item.themeName === 'string' && THEMES[item.themeName]) ? item.themeName : DEFAULT_THEME_KEY;
      const bubName = (typeof item.bubbleName === 'string' && THEMES[item.bubbleName]) ? item.bubbleName : thName;
      out[k] = {
        themeName: thName,
        bubbleName: bubName,
        masterPersona: typeof item.masterPersona === 'string' ? normalizeSafeMasterPersona(item.masterPersona) : 'yoriichi',
        aiPersonaMode: normalizeAiPersonaMode(item.aiPersonaMode, getDefaultAiPersonaMode()),
        dimming: clampInt(item.dimming, 15, 92, THEMES[thName]?.defaultDimming ?? 69),
        fxDensity: clampInt(item.fxDensity, 0, 100, 100),
        chibiEnabled: item.chibiEnabled !== false,
        ...(typeof item.chibi3dEnabled === 'boolean' ? { chibi3dEnabled: item.chibi3dEnabled } : {}),
        ...(typeof item.chibi2dLive === 'boolean' ? { chibi2dLive: item.chibi2dLive } : {}),
        autoFinisher: item.autoFinisher !== false,
        focusMode: Boolean(item.focusMode)
      };
    }
    return out;
  }

  function resolveActiveChibiCharId(stObj) {
    const bKey = (stObj && (stObj.bubbleName || stObj.themeName)) || DEFAULT_THEME_KEY;
    const bTh = THEMES[bKey] || THEMES[DEFAULT_THEME_KEY] || {};
    const hint = bTh.fxMode || bKey;
    if (typeof window !== 'undefined' && window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.resolveCharacterMeta === 'function') {
      return window.__AGY_KNY_CHIBI_AURA__.resolveCharacterMeta(bTh, hint).charId;
    }
    return (bTh.fxMode && String(bTh.fxMode).toLowerCase()) || 'shinobu';
  }

  const AGY_DOM_CONTRACTS = Object.freeze({
    shell: Object.freeze(['.agy-shell', '.monaco-workbench']),
    titlebar: Object.freeze(['[class*="@container/titlebar"]', '[data-testid="pane-titlebar-toolbar"]', 'header']),
    sidebarSplit: Object.freeze(['[data-testid="sidebar-split"]', '[data-sidebar="true"]', 'aside']),
    mainBody: Object.freeze(['[data-main-content-body="true"]', '.agy-inset-shell']),
    sidePanel: Object.freeze(['[data-side-panel-body="true"]']),
    composer: Object.freeze(['.surface-composer', '[data-testid="composer"]']),
    userBubble: Object.freeze(['.agy-user-bubble-frame', '[data-testid="user-message"]']),
    agentResponse: Object.freeze(['[data-testid="agent-response"]'])
  });

  function diagnoseDomContracts() {
    if (typeof document === 'undefined') {
      return { healthy: false, zones: {}, degradedZones: ['document'] };
    }
    const zones = {};
    const degradedZones = [];
    for (const [zone, selectors] of Object.entries(AGY_DOM_CONTRACTS)) {
      let matchedSelector = null;
      let count = 0;
      for (const sel of selectors) {
        try {
          const list = document.querySelectorAll(sel);
          if (list && list.length > 0) {
            matchedSelector = sel;
            count = list.length;
            break;
          }
        } catch (_) {}
      }
      let safe = true;
      if (zone === 'userBubble' && matchedSelector === '.agy-user-bubble-frame') {
        try {
          const frames = document.querySelectorAll('.agy-user-bubble-frame');
          for (const fr of frames) {
            if (fr && typeof fr.closest === 'function' && fr.closest('button, input, textarea')) {
              safe = false;
              break;
            }
          }
        } catch (_) {}
      }
      if (!safe) degradedZones.push(zone);
      zones[zone] = { present: Boolean(matchedSelector), matchedSelector, count, safe };
    }
    return {
      healthy: Boolean(zones.shell && zones.shell.present && degradedZones.length === 0),
      zones,
      degradedZones
    };
  }

  const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const INPUT_STYLES = Object.assign(Object.create(null), {
    'sync': {
      label: 'Khung Họa Tiết Đồng Bộ',
      desc: 'Đồng bộ viền và họa tiết SVG trang trí theo chủ đề đang bật'
    },
    'double_gold': {
      label: 'Viền Kép Hổ Phách Hoàng Kim',
      desc: 'Viền kép ánh kim ấm áp kết hợp hoa văn góc cổ điển'
    },
    'glass': {
      label: 'Kính Pha Lê Trong Suốt',
      desc: 'Làm nền kính trong hơn để lộ rõ tranh nền 4K phía sau'
    },
    'minimal': {
      label: 'Tối Giản Thanh Lịch',
      desc: 'Viền gọn nhẹ tinh tế, ẩn sticker trang trí phía trên'
    }
  });

  function clampInt(val, min, max, fallback) {
    const parsed = parseInt(val, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  const FALLBACK_KNOWN_PERSONAS = new Set([
    'yoriichi', 'shadow_monarch', 'six_eyes', 'great_sage',
    'ubuyashiki', 'shinobu', 'giyu', 'rengoku', 'uzui', 'muichiro',
    'mitsuri', 'obanai', 'sanemi', 'gyomei', 'tanjiro', 'nezuko', 'zenitsu', 'inosuke'
  ]);

  function hasValidMasterPersona(personaId) {
    if (typeof personaId !== 'string' || !personaId.trim()) return false;
    const clean = personaId.trim();
    if (typeof window !== 'undefined' && window.__AGY_THEME_FORGE__ && typeof window.__AGY_THEME_FORGE__.hasPersona === 'function') {
      return window.__AGY_THEME_FORGE__.hasPersona(clean);
    }
    return FALLBACK_KNOWN_PERSONAS.has(clean);
  }

  function normalizeSafeMasterPersona(raw) {
    if (typeof raw !== 'string') return 'yoriichi';
    const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (!clean || SEC.isDangerousKey(clean) || !hasValidMasterPersona(clean)) {
      return 'yoriichi';
    }
    return clean;
  }

  function hydrateStorageFromConfigObject(syncCfg) {
    if (!syncCfg || typeof syncCfg !== 'object') return false;
    try {
      const forgeMod = typeof window !== 'undefined' ? window.__AGY_THEME_FORGE__ : null;
      if (forgeMod && typeof forgeMod.registerThemeIntoRegistry === 'function') {
        if (syncCfg.activeForgedTheme && typeof syncCfg.activeForgedTheme === 'object') {
          const fName = String(syncCfg.activeForgedTheme.name || syncCfg.themeName || '').trim();
          if (fName) forgeMod.registerThemeIntoRegistry(THEMES, THEME_KEYS, fName, syncCfg.activeForgedTheme);
        }
        if (syncCfg.activeForgedBubbleTheme && typeof syncCfg.activeForgedBubbleTheme === 'object') {
          const fbName = String(syncCfg.activeForgedBubbleTheme.name || syncCfg.bubbleName || '').trim();
          if (fbName) forgeMod.registerThemeIntoRegistry(THEMES, THEME_KEYS, fbName, syncCfg.activeForgedBubbleTheme);
        }
      }
      if (typeof syncCfg.themeName === 'string' && THEMES[syncCfg.themeName]) {
        localStorage.setItem(STORAGE_THEME, syncCfg.themeName);
      }
      if (typeof syncCfg.bubbleName === 'string' && THEMES[syncCfg.bubbleName]) {
        localStorage.setItem(STORAGE_BUBBLE, syncCfg.bubbleName);
      }
      if (typeof syncCfg.inputStyle === 'string' && INPUT_STYLES[syncCfg.inputStyle]) {
        localStorage.setItem(STORAGE_INPUT, syncCfg.inputStyle);
      }
      if (typeof syncCfg.dimming === 'number' && Number.isFinite(syncCfg.dimming)) {
        localStorage.setItem(STORAGE_DIMMING, String(clampInt(syncCfg.dimming, 15, 92, 69)));
      }
      if (typeof syncCfg.wpEnabled === 'boolean') {
        localStorage.setItem(STORAGE_WP_ENABLED, String(syncCfg.wpEnabled));
      }
      if (typeof syncCfg.transparentWorld === 'boolean') {
        localStorage.setItem(STORAGE_TRANSPARENT_WORLD, String(syncCfg.transparentWorld));
      }
      if (typeof syncCfg.chibiEnabled === 'boolean') {
        localStorage.setItem(STORAGE_CHIBI_ENABLED, String(syncCfg.chibiEnabled));
      }
      if (typeof syncCfg.chibi3dEnabled === 'boolean') {
        localStorage.setItem(STORAGE_CHIBI_3D, String(syncCfg.chibi3dEnabled));
      }
      if (typeof syncCfg.chibi2dLive === 'boolean') {
        localStorage.setItem(STORAGE_CHIBI_2D_LIVE, String(syncCfg.chibi2dLive));
      }
      if (typeof syncCfg.autoFinisher === 'boolean') {
        localStorage.setItem(STORAGE_AUTO_FINISHER, String(syncCfg.autoFinisher));
      }
      if (typeof syncCfg.ecoBattery === 'boolean') {
        localStorage.setItem(STORAGE_ECO_BATTERY, String(syncCfg.ecoBattery));
      }
      if (typeof syncCfg.fxDensity === 'number' && Number.isFinite(syncCfg.fxDensity)) {
        localStorage.setItem(STORAGE_FX_DENSITY, String(clampInt(syncCfg.fxDensity, 0, 100, 100)));
      }
      if (typeof syncCfg.bubbleRadius === 'number' && Number.isFinite(syncCfg.bubbleRadius)) {
        localStorage.setItem(STORAGE_BUBBLE_RADIUS, String(clampInt(syncCfg.bubbleRadius, 6, 22, 14)));
      }
      if (typeof syncCfg.masterPersona === 'string' && syncCfg.masterPersona) {
        const cleanP = normalizeSafeMasterPersona(syncCfg.masterPersona);
        localStorage.setItem(STORAGE_MASTER_PERSONA, cleanP);
      }
      if (typeof syncCfg.userAvatar === 'string') {
        localStorage.setItem(STORAGE_USER_AVATAR, syncCfg.userAvatar === 'none' ? 'none' : (syncCfg.userAvatar ? resolveAssetUrl(syncCfg.userAvatar) : ''));
      }
      if (typeof syncCfg.agentAvatar === 'string') {
        localStorage.setItem(STORAGE_AGENT_AVATAR, syncCfg.agentAvatar === 'none' ? 'none' : (syncCfg.agentAvatar ? resolveAssetUrl(syncCfg.agentAvatar) : ''));
      }
      if (typeof syncCfg.glassBlur === 'number' && Number.isFinite(syncCfg.glassBlur)) {
        localStorage.setItem(STORAGE_GLASS_BLUR, String(clampInt(syncCfg.glassBlur, 0, 16, 0)));
      }
      if (typeof syncCfg.avatarSize === 'number' && Number.isFinite(syncCfg.avatarSize)) {
        localStorage.setItem(STORAGE_AVATAR_SIZE, String(clampInt(syncCfg.avatarSize, 22, 52, 32)));
      }
      if (typeof syncCfg.avatarRadius === 'number' && Number.isFinite(syncCfg.avatarRadius)) {
        localStorage.setItem(STORAGE_AVATAR_RADIUS, String(clampInt(syncCfg.avatarRadius, 0, 50, 50)));
      }
      if (typeof syncCfg.customWp === 'string') {
        try {
          localStorage.setItem(STORAGE_CUSTOM_WP, syncCfg.customWp ? resolveAssetUrl(syncCfg.customWp) : '');
        } catch (_) {}
      }
      if (typeof syncCfg.uiLang === 'string' && syncCfg.uiLang) {
        const cleanLang = normalizeUiLang(syncCfg.uiLang);
        localStorage.setItem(STORAGE_UI_LANG, cleanLang);
        if (typeof window !== 'undefined' && window.__AGY_I18N__ && typeof window.__AGY_I18N__.setLang === 'function') {
          window.__AGY_I18N__.setLang(cleanLang);
        }
      }
      if (typeof syncCfg.activeWorkspace === 'string') {
        localStorage.setItem(STORAGE_ACTIVE_WS, normalizeWorkspaceKey(syncCfg.activeWorkspace));
      }
      if (typeof syncCfg.aiPersonaMode === 'string' && syncCfg.aiPersonaMode) {
        localStorage.setItem(STORAGE_AI_PERSONA_MODE, normalizeAiPersonaMode(syncCfg.aiPersonaMode));
      }
      if (typeof syncCfg.focusMode === 'boolean') {
        localStorage.setItem(STORAGE_FOCUS_MODE, String(syncCfg.focusMode));
      }
      if (syncCfg.workspaceProfiles && typeof syncCfg.workspaceProfiles === 'object' && !Array.isArray(syncCfg.workspaceProfiles)) {
        localStorage.setItem(STORAGE_WS_PROFILES, JSON.stringify(sanitizeWorkspaceProfilesMap(syncCfg.workspaceProfiles)));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // Multi-window synchronization: when daemon re-injects secondary windows after a config save,
  // hydrate localStorage from initialConfig before rendering so every open window stays in sync.
  if (SEC && typeof SEC.isSyncFromDaemon === 'function' && SEC.isSyncFromDaemon()) {
    hydrateStorageFromConfigObject(SEC.getInitialConfig());
  }

  const _lsFallback = new Map();
  function safeLsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return _lsFallback.has(key) ? _lsFallback.get(key) : null;
    }
  }
  function safeLsRemember(key, val) {
    _lsFallback.set(key, String(val));
    try {
      localStorage.setItem(key, String(val));
    } catch (_) {}
  }

  function getState() {
    const init = SEC.getInitialConfig() || {};
    const storedTheme = safeLsGet(STORAGE_THEME);
    const rawTheme = (storedTheme !== null && storedTheme !== '') ? storedTheme : (init.themeName || DEFAULT_THEME_KEY);
    const themeName = THEMES[rawTheme] ? rawTheme : DEFAULT_THEME_KEY;

    const storedBubble = safeLsGet(STORAGE_BUBBLE);
    const rawBubble = (storedBubble !== null && storedBubble !== '') ? storedBubble : (init.bubbleName || themeName);
    const bubbleName = THEMES[rawBubble] ? rawBubble : themeName;

    const storedInput = safeLsGet(STORAGE_INPUT);
    const rawInput = (storedInput !== null && storedInput !== '') ? storedInput : (init.inputStyle || 'sync');
    const inputStyle = INPUT_STYLES[rawInput] ? rawInput : 'sync';

    const activeThemeCfg = THEMES[themeName] || {};
    const presetDefaultDim = activeThemeCfg.defaultDimming !== undefined ? activeThemeCfg.defaultDimming : 69;
    const storedDim = safeLsGet(STORAGE_DIMMING);
    const rawDim = (storedDim !== null && storedDim !== '') ? storedDim : (init.dimming ?? presetDefaultDim);
    const dimming = clampInt(rawDim, 15, 92, 69);

    const storedWpEnabled = safeLsGet(STORAGE_WP_ENABLED);
    const wpEnabled = storedWpEnabled !== null
      ? storedWpEnabled !== 'false'
      : (init.wpEnabled !== undefined ? Boolean(init.wpEnabled) : true);

    const storedCustomWp = safeLsGet(STORAGE_CUSTOM_WP);
    const rawCustomWp = storedCustomWp !== null ? storedCustomWp : (init.customWp ?? '');
    const customWp = rawCustomWp ? resolveAssetUrl(rawCustomWp) : '';

    const storedUserAv = safeLsGet(STORAGE_USER_AVATAR);
    const rawUserAv = storedUserAv !== null ? storedUserAv : (init.userAvatar ?? '');
    const userAvatar = rawUserAv === 'none' ? 'none' : (rawUserAv ? resolveAssetUrl(rawUserAv) : '');

    const storedAgentAv = safeLsGet(STORAGE_AGENT_AVATAR);
    const rawAgentAv = storedAgentAv !== null ? storedAgentAv : (init.agentAvatar ?? '');
    const agentAvatar = rawAgentAv === 'none' ? 'none' : (rawAgentAv ? resolveAssetUrl(rawAgentAv) : '');

    const storedBlur = safeLsGet(STORAGE_GLASS_BLUR);
    let glassBlur;
    if (storedBlur !== null && storedBlur !== '') {
      glassBlur = clampInt(storedBlur, 0, 16, 0);
    } else if (init.glassBlur !== undefined && init.glassBlur !== null && init.glassBlur !== '') {
      glassBlur = clampInt(init.glassBlur, 0, 16, 0);
    } else {
      const parsedHeaderBlur = parseFloat(activeThemeCfg.headerBlur);
      if (Number.isFinite(parsedHeaderBlur)) {
        glassBlur = clampInt(Math.round(parsedHeaderBlur), 0, 16, 3);
      } else {
        glassBlur = activeThemeCfg.unifiedGlass === false ? 0 : 3;
      }
    }

    const storedAvSize = safeLsGet(STORAGE_AVATAR_SIZE);
    const rawAvSize = (storedAvSize !== null && storedAvSize !== '') ? storedAvSize : init.avatarSize;
    const avatarSize = rawAvSize !== undefined && rawAvSize !== null && rawAvSize !== '' ? clampInt(rawAvSize, 22, 52, 32) : 32;

    const storedAvRad = safeLsGet(STORAGE_AVATAR_RADIUS);
    const rawAvRad = (storedAvRad !== null && storedAvRad !== '') ? storedAvRad : init.avatarRadius;
    const avatarRadius = rawAvRad !== undefined && rawAvRad !== null && rawAvRad !== '' ? clampInt(rawAvRad, 0, 50, 50) : 50;

    const storedTw = safeLsGet(STORAGE_TRANSPARENT_WORLD);
    const transparentWorld = storedTw !== null
      ? storedTw !== 'false'
      : (init.transparentWorld !== undefined ? Boolean(init.transparentWorld) : true);

    const storedPersona = safeLsGet(STORAGE_MASTER_PERSONA);
    const rawPersona = (storedPersona !== null && storedPersona !== '') ? storedPersona : (init.masterPersona || 'yoriichi');
    const masterPersona = normalizeSafeMasterPersona(rawPersona);

    const storedChibi = safeLsGet(STORAGE_CHIBI_ENABLED);
    const chibiEnabled = storedChibi !== null
      ? storedChibi !== 'false'
      : (init.chibiEnabled !== undefined ? Boolean(init.chibiEnabled) : true);

    const storedChibi3d = safeLsGet(STORAGE_CHIBI_3D);
    const chibi3dEnabled = storedChibi3d !== null
      ? storedChibi3d !== 'false'
      : (init.chibi3dEnabled !== undefined ? Boolean(init.chibi3dEnabled) : true);

    const storedChibi2dLive = safeLsGet(STORAGE_CHIBI_2D_LIVE);
    const chibi2dLive = storedChibi2dLive !== null
      ? storedChibi2dLive !== 'false'
      : (init.chibi2dLive !== undefined ? Boolean(init.chibi2dLive) : true);

    const storedFxDen = safeLsGet(STORAGE_FX_DENSITY);
    const rawFxDen = (storedFxDen !== null && storedFxDen !== '') ? storedFxDen : init.fxDensity;
    const fxDensity = rawFxDen !== undefined && rawFxDen !== null && rawFxDen !== '' ? clampInt(rawFxDen, 0, 100, 100) : 100;

    const storedAutoFin = safeLsGet(STORAGE_AUTO_FINISHER);
    const autoFinisher = storedAutoFin !== null
      ? storedAutoFin !== 'false'
      : (init.autoFinisher !== undefined ? Boolean(init.autoFinisher) : true);

    const storedBubRad = safeLsGet(STORAGE_BUBBLE_RADIUS);
    const rawBubRad = (storedBubRad !== null && storedBubRad !== '') ? storedBubRad : init.bubbleRadius;
    const bubbleRadius = rawBubRad !== undefined && rawBubRad !== null && rawBubRad !== '' ? clampInt(rawBubRad, 6, 22, 14) : 14;

    const storedEcoBatt = safeLsGet(STORAGE_ECO_BATTERY);
    const ecoBattery = storedEcoBatt !== null
      ? storedEcoBatt !== 'false'
      : (init.ecoBattery !== undefined ? Boolean(init.ecoBattery) : true);

    const storedUiLang = safeLsGet(STORAGE_UI_LANG);
    const uiLang = normalizeUiLang((storedUiLang !== null && storedUiLang !== '') ? storedUiLang : (init.uiLang || 'vi'));

    const storedActiveWs = safeLsGet(STORAGE_ACTIVE_WS);
    const activeWorkspace = normalizeWorkspaceKey((storedActiveWs !== null && storedActiveWs !== '') ? storedActiveWs : (init.activeWorkspace || ''));

    const storedAiMode = safeLsGet(STORAGE_AI_PERSONA_MODE);
    const aiPersonaMode = normalizeAiPersonaMode((storedAiMode !== null && storedAiMode !== '') ? storedAiMode : init.aiPersonaMode);

    const storedFocusMode = safeLsGet(STORAGE_FOCUS_MODE);
    const focusMode = storedFocusMode !== null
      ? storedFocusMode === 'true'
      : Boolean(init.focusMode);

    const privacyShieldActive = Boolean(
      typeof document !== 'undefined' &&
      document.documentElement &&
      document.documentElement.dataset.agyPrivacyShield === '1'
    );

    let workspaceProfiles = {};
    try {
      const rawWsJson = safeLsGet(STORAGE_WS_PROFILES);
      if (rawWsJson) {
        workspaceProfiles = sanitizeWorkspaceProfilesMap(SEC.stripProtoKeys(JSON.parse(rawWsJson)));
      } else if (init.workspaceProfiles && typeof init.workspaceProfiles === 'object') {
        workspaceProfiles = sanitizeWorkspaceProfilesMap(init.workspaceProfiles);
      }
    } catch (_) {}

    return {
      themeName,
      bubbleName,
      inputStyle,
      dimming,
      wpEnabled,
      customWp,
      userAvatar,
      agentAvatar,
      glassBlur,
      avatarSize,
      avatarRadius,
      transparentWorld,
      masterPersona,
      aiPersonaMode,
      focusMode,
      privacyShieldActive,
      chibiEnabled,
      chibi3dEnabled,
      chibi2dLive,
      fxDensity,
      autoFinisher,
      bubbleRadius,
      ecoBattery,
      uiLang,
      activeWorkspace,
      workspaceProfiles
    };
  }

  function getEffectiveState() {
    return transientOverrideState ? { ...transientOverrideState } : getState();
  }

  // Downscale user/agent avatar uploads to 192x192 WebP once (strictly validated <= 15MB & image MIME; aborts safely on decode error)
  function compressAvatarFile(file, callback) {
    if (!isValidImageUploadFile(file)) return;
    const reader = new FileReader();
    reader.onerror = () => {};
    reader.onload = () => {
      if (coreDestroyed) return;
      const img = new Image();
      img.onload = () => {
        if (coreDestroyed) return;
        try {
          const size = 192;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const natW = img.naturalWidth || size;
          const natH = img.naturalHeight || size;
          const side = Math.min(natW, natH);
          const sx = Math.max(0, Math.floor((natW - side) / 2));
          const sy = Math.max(0, Math.floor((natH - side) / 2));
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          const out = canvas.toDataURL('image/webp', 0.88);
          const candidate = out && out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/png');
          const safeUri = safeCssUrl(candidate);
          if (safeUri) callback(safeUri);
        } catch (_) {
          // Abort safely — never pass raw FileReader result on error
        }
      };
      img.onerror = () => {
        // Abort safely — never pass raw FileReader result on decode failure
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  // Validate and adaptively step-down custom wallpaper uploads (< ~1.1MB Base64, <= 15MB source, PNG/JPEG/WebP/GIF)
  function compressWallpaperFile(file, callback) {
    if (!isValidImageUploadFile(file)) return;
    const reader = new FileReader();
    reader.onerror = () => {};
    reader.onload = () => {
      if (coreDestroyed) return;
      const img = new Image();
      img.onload = () => {
        if (coreDestroyed) return;
        try {
          if (typeof window !== 'undefined' && window.__AGY_THEME_FORGE__ && typeof window.__AGY_THEME_FORGE__.compressBackdropToDataUrl === 'function') {
            const forgedCompressed = safeCssUrl(window.__AGY_THEME_FORGE__.compressBackdropToDataUrl(img));
            if (forgedCompressed) {
              callback(forgedCompressed);
              return;
            }
          }
          const natW = Math.max(1, img.naturalWidth || 1920);
          const natH = Math.max(1, img.naturalHeight || 1080);
          const tiers = [
            { maxW: 1920, maxH: 1080, quality: 0.82, maxChars: 1150000 },
            { maxW: 1600, maxH: 900, quality: 0.74, maxChars: 920000 },
            { maxW: 1280, maxH: 720, quality: 0.68, maxChars: 880000 },
            { maxW: 1280, maxH: 720, quality: 0.56, maxChars: Infinity }
          ];
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          let fallbackUri = '';
          for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];
            const scale = Math.min(1, tier.maxW / natW, tier.maxH / natH);
            const w = Math.max(64, Math.round(natW * scale));
            const h = Math.max(64, Math.round(natH * scale));
            canvas.width = w;
            canvas.height = h;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const out = canvas.toDataURL('image/webp', tier.quality);
            const candidate = out && out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/jpeg', tier.quality);
            const safeUri = safeCssUrl(candidate);
            if (safeUri) {
              fallbackUri = safeUri;
              if (safeUri.length <= tier.maxChars) {
                callback(safeUri);
                return;
              }
            }
          }
          if (fallbackUri) callback(fallbackUri);
        } catch (_) {}
      };
      img.onerror = () => {};
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  // Pre-bake L-shaped header/sidebar glass blur once per theme/dimming change to avoid per-frame GPU backdrop readback
  function syncPrebakedGlass(wpUrl, overlayRgb, overlayAlpha, tintBg, blurStr) {
    const reqSeq = ++prebakeReqSeq;
    const shell = document.querySelector('.agy-shell');
    const safeWp = safeCssUrl(wpUrl || '');
    const pxMatch = String(blurStr !== undefined ? blurStr : '0px').match(/(\d+(?:\.\d+)?)/);
    const rawBlurNum = pxMatch ? parseFloat(pxMatch[1]) : 0;
    if (!safeWp || rawBlurNum <= 0.2) {
      if (shell) shell.style.removeProperty('--agy-l-glass-bg');
      return;
    }
    const key = `${safeWp.slice(0, 64)}|${safeWp.length}|${overlayRgb}|${overlayAlpha.toFixed(3)}|${tintBg}|${blurStr}`;
    window.__AGY_BLUR_CACHE__ = window.__AGY_BLUR_CACHE__ || {};
    const cache = window.__AGY_BLUR_CACHE__;
    const cached = cache[key];
    if (cached) {
      // Refresh LRU insertion order
      delete cache[key];
      cache[key] = cached;
      if (shell) shell.style.setProperty('--agy-l-glass-bg', 'url("' + cached + '")');
      return;
    }

    const applyTaintedFileFallback = () => {
      if (coreDestroyed || reqSeq !== prebakeReqSeq) return;
      const curShell = document.querySelector('.agy-shell');
      if (!curShell || !safeWp) return;
      const safeTint = tintBg ? `linear-gradient(180deg, ${tintBg}, ${tintBg}), ` : '';
      const fallbackBg = `${safeTint}linear-gradient(180deg, rgba(${overlayRgb}, ${overlayAlpha}), rgba(${overlayRgb}, ${overlayAlpha})), url("${safeWp}")`;
      curShell.style.setProperty('--agy-l-glass-bg', fallbackBg);
    };

    const img = new Image();
    if (/^https?:\/\//i.test(safeWp)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (coreDestroyed || reqSeq !== prebakeReqSeq) return;
      try {
        const w = 1920;
        const h = Math.max(360, Math.round((img.naturalHeight || 2160) * (w / (img.naturalWidth || 3840))));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          applyTaintedFileFallback();
          return;
        }
        const scaledBlur = Math.max(0, Math.min(18, Math.round(rawBlurNum * 0.85)));
        ctx.filter = scaledBlur > 0 ? `blur(${scaledBlur}px)` : 'none';
        ctx.drawImage(img, -16, -16, w + 32, h + 32);
        ctx.filter = 'none';
        ctx.fillStyle = `rgba(${overlayRgb}, ${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
        if (tintBg) {
          ctx.fillStyle = tintBg;
          ctx.fillRect(0, 0, w, h);
        }
        const rawBaked = canvas.toDataURL('image/webp', 0.92);
        if (coreDestroyed || reqSeq !== prebakeReqSeq) return;
        const baked = safeCssUrl(rawBaked);
        if (!baked) {
          applyTaintedFileFallback();
          return;
        }
        const store = window.__AGY_BLUR_CACHE__ || (window.__AGY_BLUR_CACHE__ = {});
        if (key in store) delete store[key];
        const existingKeys = Object.keys(store);
        while (existingKeys.length >= BLUR_CACHE_MAX_ENTRIES) {
          const oldest = existingKeys.shift();
          if (oldest !== undefined) delete store[oldest];
        }
        store[key] = baked;
        const curShell = document.querySelector('.agy-shell');
        if (curShell) curShell.style.setProperty('--agy-l-glass-bg', 'url("' + baked + '")');
      } catch (_) {
        // SecurityError on file:///.../preview.html with local relative assets -> crisp tinted original URL fallback
        applyTaintedFileFallback();
      }
    };
    img.onerror = () => {
      applyTaintedFileFallback();
    };
    img.src = safeWp;
  }

  function getActiveMasterPersona(stOverride) {
    const st = stOverride || getEffectiveState();
    if (typeof window !== 'undefined' && window.__AGY_THEME_FORGE__ && typeof window.__AGY_THEME_FORGE__.getPersona === 'function') {
      return window.__AGY_THEME_FORGE__.getPersona(st.masterPersona || 'yoriichi');
    }
    return {
      id: 'yoriichi',
      group: 'origin',
      tagLabel: 'Khai Tổ Hỏa Thần (Anh)',
      skillId: 'yoriichi',
      ringColor: '#fde047',
      glowColor: 'rgba(239, 68, 68, 0.52)',
      userAvatar: resolveAssetUrl('assets/yoriichi_avatar.jpg'),
      userSticker: resolveAssetUrl('assets/yoriichi_ornament.svg'),
      userCornerSvg: resolveAssetUrl('assets/yoriichi_corner.svg'),
      actionSticker: resolveAssetUrl('assets/yoriichi_action.webp')
    };
  }

  function applyTheme(overrides = {}, applyOpts = {}) {
    if (coreDestroyed) return;
    const isTransient = Boolean(applyOpts && applyOpts.transient);
    const skipSaveDisk = Boolean(applyOpts && applyOpts.skipSaveDisk);
    const st = { ...getState(), ...overrides };
    st.dimming = clampInt(st.dimming, 15, 92, 69);
    st.glassBlur = clampInt(st.glassBlur, 0, 16, 0);
    st.avatarSize = clampInt(st.avatarSize, 22, 52, 32);
    st.avatarRadius = clampInt(st.avatarRadius, 0, 50, 50);
    st.fxDensity = clampInt(st.fxDensity, 0, 100, 100);
    st.bubbleRadius = clampInt(st.bubbleRadius, 6, 22, 14);
    st.inputStyle = INPUT_STYLES[st.inputStyle] ? st.inputStyle : 'sync';
    st.transparentWorld = st.transparentWorld !== false;
    st.chibiEnabled = st.chibiEnabled !== false;
    st.chibi3dEnabled = st.chibi3dEnabled !== false;
    st.chibi2dLive = st.chibi2dLive !== false;
    st.autoFinisher = st.autoFinisher !== false;
    st.ecoBattery = st.ecoBattery !== false;
    st.masterPersona = normalizeSafeMasterPersona(st.masterPersona);
    st.aiPersonaMode = normalizeAiPersonaMode(st.aiPersonaMode);
    if (overrides.focusMode !== undefined) {
      st.focusMode = Boolean(overrides.focusMode);
    } else if (
      overrides.chibiEnabled === true ||
      overrides.autoFinisher === true ||
      overrides.aiPersonaMode === 'subtle' ||
      overrides.aiPersonaMode === 'roleplay'
    ) {
      st.focusMode = false;
    } else {
      st.focusMode = Boolean(st.focusMode);
    }
    st.uiLang = normalizeUiLang(st.uiLang);
    st.activeWorkspace = normalizeWorkspaceKey(st.activeWorkspace);
    st.workspaceProfiles = sanitizeWorkspaceProfilesMap(st.workspaceProfiles);
    let syncedWsChibi3d = false;
    if (
      !isTransient &&
      (overrides.chibi3dEnabled !== undefined || overrides.chibi2dLive !== undefined) &&
      overrides.workspaceProfiles === undefined &&
      st.activeWorkspace &&
      st.workspaceProfiles &&
      Object.prototype.hasOwnProperty.call(st.workspaceProfiles, st.activeWorkspace)
    ) {
      st.workspaceProfiles[st.activeWorkspace] = {
        ...st.workspaceProfiles[st.activeWorkspace],
        ...(overrides.chibi3dEnabled !== undefined ? { chibi3dEnabled: Boolean(st.chibi3dEnabled) } : {}),
        ...(overrides.chibi2dLive !== undefined ? { chibi2dLive: Boolean(st.chibi2dLive) } : {})
      };
      syncedWsChibi3d = true;
    }

    window.__AGY_FX_DENSITY__ = st.fxDensity / 100;
    window.__AGY_AUTO_FINISHER__ = st.autoFinisher;

    if (isTransient) {
      transientOverrideState = { ...st };
    } else {
      transientOverrideState = null;
      safeLsRemember(STORAGE_THEME, st.themeName);
      safeLsRemember(STORAGE_BUBBLE, st.bubbleName);
      safeLsRemember(STORAGE_INPUT, st.inputStyle);
      safeLsRemember(STORAGE_DIMMING, String(st.dimming));
      safeLsRemember(STORAGE_WP_ENABLED, String(st.wpEnabled));
      safeLsRemember(STORAGE_TRANSPARENT_WORLD, String(st.transparentWorld));
      safeLsRemember(STORAGE_CHIBI_ENABLED, String(st.chibiEnabled));
      safeLsRemember(STORAGE_CHIBI_3D, String(st.chibi3dEnabled));
      safeLsRemember(STORAGE_CHIBI_2D_LIVE, String(st.chibi2dLive));
      safeLsRemember(STORAGE_FX_DENSITY, String(st.fxDensity));
      safeLsRemember(STORAGE_AUTO_FINISHER, String(st.autoFinisher));
      safeLsRemember(STORAGE_BUBBLE_RADIUS, String(st.bubbleRadius));
      safeLsRemember(STORAGE_ECO_BATTERY, String(st.ecoBattery));
      safeLsRemember(STORAGE_MASTER_PERSONA, st.masterPersona);
      safeLsRemember(STORAGE_AI_PERSONA_MODE, st.aiPersonaMode);
      safeLsRemember(STORAGE_FOCUS_MODE, String(Boolean(st.focusMode)));
      safeLsRemember(STORAGE_UI_LANG, st.uiLang);
      if (typeof window !== 'undefined' && window.__AGY_I18N__ && typeof window.__AGY_I18N__.setLang === 'function') {
        window.__AGY_I18N__.setLang(st.uiLang);
      }
      if (overrides.activeWorkspace !== undefined) {
        safeLsRemember(STORAGE_ACTIVE_WS, st.activeWorkspace);
      }
      if (overrides.workspaceProfiles !== undefined || syncedWsChibi3d) {
        safeLsRemember(STORAGE_WS_PROFILES, JSON.stringify(st.workspaceProfiles));
      }
      if (overrides.userAvatar !== undefined) {
        safeLsRemember(STORAGE_USER_AVATAR, overrides.userAvatar === 'none' ? 'none' : safeCssUrl(overrides.userAvatar));
      }
      if (overrides.agentAvatar !== undefined) {
        safeLsRemember(STORAGE_AGENT_AVATAR, overrides.agentAvatar === 'none' ? 'none' : safeCssUrl(overrides.agentAvatar));
      }
      if (overrides.glassBlur !== undefined) {
        safeLsRemember(STORAGE_GLASS_BLUR, String(st.glassBlur));
      }
      if (overrides.avatarSize !== undefined) {
        safeLsRemember(STORAGE_AVATAR_SIZE, String(st.avatarSize));
      }
      if (overrides.avatarRadius !== undefined) {
        safeLsRemember(STORAGE_AVATAR_RADIUS, String(st.avatarRadius));
      }

      if (overrides.customWp !== undefined) {
        const cleanWp = overrides.customWp ? safeCssUrl(overrides.customWp) : '';
        _lsFallback.set(STORAGE_CUSTOM_WP, cleanWp);
        try {
          localStorage.setItem(STORAGE_CUSTOM_WP, cleanWp);
        } catch (_) {
          // If 5MB localStorage is full, evict oldest forged theme if needed and retry once
          try {
            const rawForged = localStorage.getItem('agy_forged_themes_v2');
            if (rawForged) {
              const map = SEC.stripProtoKeys(JSON.parse(rawForged));
              if (map && typeof map === 'object' && !Array.isArray(map)) {
                const keys = Object.keys(map).filter((k) => k !== st.themeName && Object.prototype.hasOwnProperty.call(map, k));
                if (keys.length > 0) {
                  delete map[keys[0]];
                  localStorage.setItem('agy_forged_themes_v2', JSON.stringify(map));
                  localStorage.setItem(STORAGE_CUSTOM_WP, cleanWp);
                }
              }
            }
          } catch (__) {}
        }
      }

      if (!skipSaveDisk) {
        const activeThForDisk = THEMES[st.themeName];
        const bubbleThForDisk = THEMES[st.bubbleName];
        const forgedMain = (activeThForDisk && activeThForDisk.isForged)
          ? { ...activeThForDisk, name: st.themeName }
          : null;
        const forgedBubble = (bubbleThForDisk && bubbleThForDisk.isForged)
          ? { ...bubbleThForDisk, name: st.bubbleName }
          : null;
        const diskPayload = {
          ...st,
          activeForgedTheme: forgedMain || forgedBubble || null,
          activeForgedBubbleTheme: (forgedMain && forgedBubble && st.bubbleName !== st.themeName)
            ? forgedBubble
            : null
        };
        SEC.saveConfigSecure(diskPayload);
      }
    }
    if (typeof syncTransparentWorldSetting === 'function') {
      syncTransparentWorldSetting(st.transparentWorld);
    }

    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    const bubbleTheme = THEMES[st.bubbleName] || mainTheme;
    const persona = getActiveMasterPersona(st);
    const wpUrl = safeCssUrl(st.customWp || mainTheme.wallpaper || '');

    const oldLegacy = document.getElementById('antigravity-ho-ly-chibi-theme');
    if (oldLegacy) oldLegacy.remove();

    let styleEl = document.getElementById('antigravity-custom-theme-active');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'antigravity-custom-theme-active';
      document.head.appendChild(styleEl);
    }

    // Strictly sanitize every CSS color / gradient / token via __AGY_SEC__.sanitizeCssValue (F-02)
    const overlayAlpha = mainTheme.clearBackdrop
      ? Math.min(0.92, Math.max(0.0, ((st.dimming - 10) / 82) * 0.85))
      : Math.min(0.92, Math.max(0.12, (st.dimming / 100) * 0.78));
    const overlayRgb = SEC.sanitizeCssValue(mainTheme.overlayRgb, '10, 7, 6');
    const bgPosition = SEC.sanitizeCssValue(mainTheme.bgPosition, 'center center');
    const mainPrimary = SEC.sanitizeCssValue(mainTheme.primary, '#c084fc');
    const mainAccent = SEC.sanitizeCssValue(mainTheme.accent || mainTheme.secondary, mainPrimary);
    const mainGlow = SEC.sanitizeCssValue(mainTheme.glow, 'rgba(192, 132, 252, 0.28)');
    const mainSecondaryGlow = SEC.sanitizeCssValue(mainTheme.secondaryGlow, '');
    const mainPureBg = SEC.sanitizeCssValue(mainTheme.pureBg, '');
    const mainBorderColor = SEC.sanitizeCssValue(mainTheme.borderColor, 'rgba(255, 255, 255, 0.18)');
    const mainHeaderBg = SEC.sanitizeCssValue(mainTheme.headerBg, '');
    const mainHeaderBorder = SEC.sanitizeCssValue(mainTheme.headerBorder, 'rgba(56, 189, 248, 0.14)');
    const mainAiCardBg = SEC.sanitizeCssValue(mainTheme.aiCardBg || mainTheme.codeBg, '');
    const mainAiCardBorder = SEC.sanitizeCssValue(mainTheme.aiCardBorder, '');
    const mainModalHeaderBg = SEC.sanitizeCssValue(mainTheme.modalHeaderBg, 'rgba(22, 16, 14, 0.85)');

    const bubbleFrameBg = SEC.sanitizeCssValue(bubbleTheme.frameBg, 'linear-gradient(135deg, #c084fc, #5eead4)');
    const bubbleGlow = SEC.sanitizeCssValue(bubbleTheme.glow, mainGlow);
    const bubbleBg = SEC.sanitizeCssValue(bubbleTheme.userBubble || bubbleTheme.bg, 'rgba(28, 19, 46, 0.92)');
    const bubbleTextColor = SEC.sanitizeCssValue(bubbleTheme.textColor || bubbleTheme.textMain, '#f8fafc');
    const bubbleInnerBorderRaw = SEC.sanitizeCssValue(bubbleTheme.innerBorder, '1px solid rgba(255, 255, 255, 0.07)');
    const bubbleComposerHeaderBg = SEC.sanitizeCssValue(bubbleTheme.composerHeaderBg, '');
    const bubbleInputGlassBg = SEC.sanitizeCssValue(bubbleTheme.inputGlassBg, 'rgba(20, 15, 13, 0.52)');
    const bubbleInputCardBg = SEC.sanitizeCssValue(bubbleTheme.inputCardBg || bubbleTheme.composerBg, 'rgba(28, 19, 16, 0.88)');

    const secondaryGlowStop = mainSecondaryGlow
      ? `, radial-gradient(circle at 22% 72%, ${mainSecondaryGlow} 0%, transparent 55%)`
      : '';

    let bgLayers = '';
    if (wpUrl) {
      bgLayers = mainTheme.clearBackdrop
        ? `linear-gradient(180deg, rgba(${overlayRgb}, ${overlayAlpha}) 0%, rgba(${overlayRgb}, ${overlayAlpha}) 100%), url("${wpUrl}")`
        : `radial-gradient(circle at 75% 40%, ${mainGlow} 0%, transparent 65%)${secondaryGlowStop}, linear-gradient(180deg, rgba(${overlayRgb}, ${overlayAlpha * 0.85}) 0%, rgba(${overlayRgb}, ${overlayAlpha}) 100%), url("${wpUrl}")`;
    } else {
      bgLayers = mainPureBg || `radial-gradient(circle at 75% 30%, ${mainGlow} 0%, transparent 60%), linear-gradient(160deg, rgba(${overlayRgb}, 0.96) 0%, #070910 100%)`;
    }

    const wpCss = st.wpEnabled ? `
      .agy-shell {
        background-image: ${bgLayers} !important;
        background-size: cover !important;
        background-position: ${bgPosition} !important;
        background-repeat: no-repeat !important;
        image-rendering: auto !important;
      }
      /* Keep transparent scrollers on GPU composited-scrolling layers */
      .agy-shell .overflow-y-auto {
        will-change: scroll-position;
      }
      .agy-sheet,
      .agy-inset-shell,
      .browser-hole-opaque,
      [data-main-content-body="true"],
      [data-side-panel-body="true"],
      [class*="agy-inset-shell"],
      [class*="--shell-canvas"],
      .agy-shell div.absolute.bottom-0.pointer-events-none,
      .agy-shell [class*="z-50"] .pointer-events-none.right-full,
      .agy-shell .bg-background:not(.settings-modal-container):not(.settings-modal-container *):not(#agy-custom-theme-modal-backdrop *) {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }
      /* Yoriichi's Transparent World ("Sukitōru Sekai"): calm backdrop by an extra 5% during deep coding flow */
      html[data-agy-transparent-world="1"] body:not([data-has-browser-hole="true"]) .agy-shell [data-main-content-body="true"] {
        background-color: rgba(4, 6, 14, calc(0.05 * var(--agy-tw-factor, 1))) !important;
        transition: background-color 0.25s ease;
      }
      /* Browser split-pane hole cutout: keep wallpaper & L-glass visible outside [data-browser-hole] without covering live BrowserView */
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"]::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background-image: ${bgLayers};
        background-size: cover;
        background-position: ${bgPosition};
        background-repeat: no-repeat;
        clip-path: var(--agy-hole-clip, none);
        will-change: transform;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] > :not([data-has-browser-hole="true"]):not([data-browser-hole]:not([data-browser-hole="false"])):not(.settings-modal-container),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] .browser-hole-opaque:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-pane-id]:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-tiling-pane]:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-main-content-header]:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-side-panel-strip]:not([data-has-browser-hole="true"]) {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] :is([data-main-content-body], [data-side-panel-body]):not([data-has-browser-hole="true"]) {
        box-shadow: none !important;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-split-sash] {
        background: rgba(56, 189, 248, 0.14) !important;
        background-image: none !important;
      }
    ` : `
      .agy-shell {
        background: #111113 !important;
      }
    `;

    const defaultCornerSvg = 'data:image/svg+xml,' + strictPercentEncodeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M2 20 L2 6 Q2 2 6 2 L20 2" stroke="#fbbf24" stroke-width="1.5" fill="none" opacity="0.65"/><circle cx="6" cy="6" r="2" fill="#fbbf24" opacity="0.75"/></svg>');
    const cornerFiligreeUrl = safeCssUrl(bubbleTheme.cornerSvg || '') || defaultCornerSvg;
    const personaValid = hasValidMasterPersona(st.masterPersona);
    const personaExplicitOverride = Boolean(st.masterPersona && st.masterPersona !== 'yoriichi');
    const isMinimalZeroStickerTheme = bubbleTheme.isOrnament === false && !bubbleTheme.sticker;

    const userCornerFiligreeUrl = safeCssUrl(
      (personaValid ? (persona.userCornerSvg || bubbleTheme.userCornerSvg) : (bubbleTheme.userCornerSvg || persona.userCornerSvg)) || ''
    ) || cornerFiligreeUrl;

    const rawUserBubbleSticker = (isMinimalZeroStickerTheme && !personaExplicitOverride)
      ? ''
      : (personaValid
        ? (persona.userSticker || bubbleTheme.userSticker || bubbleTheme.sticker || '')
        : (bubbleTheme.userSticker || persona.userSticker || bubbleTheme.sticker || ''));
    const userBubbleStickerUrl = safeCssUrl(rawUserBubbleSticker);
    const usingPersonaBubbleSticker = Boolean(
      personaValid &&
      persona.userSticker &&
      userBubbleStickerUrl &&
      userBubbleStickerUrl === safeCssUrl(persona.userSticker)
    );
    const composerStickerUrl = safeCssUrl(bubbleTheme.sticker || '');

    const parseNumericProp = (val, fb) => {
      if (val === undefined || val === null || val === '' || typeof val === 'boolean') return fb;
      const n = Number(val);
      return Number.isFinite(n) ? n : fb;
    };
    const sTop = parseNumericProp(bubbleTheme.stickerTop, -56);
    const sRight = parseNumericProp(bubbleTheme.stickerRight, 10);
    const sW = parseNumericProp(bubbleTheme.stickerW, 136);
    const sH = parseNumericProp(bubbleTheme.stickerH, 64);

    const uTop = usingPersonaBubbleSticker ? -56 : sTop;
    const uRight = usingPersonaBubbleSticker ? 10 : sRight;
    const uW = usingPersonaBubbleSticker ? 136 : sW;
    const uH = usingPersonaBubbleSticker ? 64 : sH;
    const uIsChibi = usingPersonaBubbleSticker || Boolean(bubbleTheme.isChibiNpc);
    const uIsOrnament = usingPersonaBubbleSticker || Boolean(bubbleTheme.isOrnament);

    const chibiOn = st.chibiEnabled !== false;
    const bRad = clampInt(st.bubbleRadius, 6, 22, 14);
    const bubblePadTop = Math.max(18, Math.abs(uTop) + 8);
    const bubbleStickerCss = (chibiOn && userBubbleStickerUrl) ? (uIsOrnament ? `
      .group\\/user-input-step {
        padding-top: ${uIsChibi ? bubblePadTop : 18}px !important;
        overflow: visible !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${uTop}px;
        right: ${uRight}px;
        width: ${uW}px;
        height: ${uH}px;
        background-image: url("${userBubbleStickerUrl}");
        background-size: contain;
        background-position: ${uIsChibi ? 'bottom center' : 'center'};
        background-repeat: no-repeat;
        z-index: 25;
        pointer-events: none;
        transform-origin: 72% 92%;
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .agy-user-bubble-frame[data-chibi-bounce="1"]::before {
        transform: translateY(-6px) scale(1.05);
      }
    ` : `
      .group\\/user-input-step {
        padding-top: ${Math.max(36, Math.abs(uTop) + 8)}px !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${uTop}px;
        right: ${uRight}px;
        width: ${uW}px;
        height: ${uH}px;
        background-image: url("${userBubbleStickerUrl}");
        background-size: contain;
        background-position: bottom center;
        background-repeat: no-repeat;
        z-index: 25;
        pointer-events: none;
        transition: transform 0.2s ease;
      }
    `) : `
      .agy-user-bubble-frame::before { display: none !important; }
    `;

    const showInputSticker = chibiOn && st.inputStyle !== 'minimal' && Boolean(composerStickerUrl);
    const composerMarginTop = Math.max(16, Math.abs(sTop) + 8);
    const isZeroComposerSticker = sW <= 0 || sH <= 0;
    const compOrnamentW = isZeroComposerSticker ? Math.max(0, sW) : (bubbleTheme.isChibiNpc ? sW : (sW + 8));
    const compOrnamentH = isZeroComposerSticker ? Math.max(0, sH) : (bubbleTheme.isChibiNpc ? sH : (sH + 2));
    const compPlainW = isZeroComposerSticker ? Math.max(0, sW) : (sW + 6);
    const compPlainH = isZeroComposerSticker ? Math.max(0, sH) : (sH + 6);
    const inputStickerCss = showInputSticker ? (bubbleTheme.isOrnament ? `
      .surface-composer {
        margin-top: ${bubbleTheme.isChibiNpc ? composerMarginTop : 16}px !important;
        overflow: visible !important;
      }
      .surface-composer::before {
        content: "";
        position: absolute;
        top: ${sTop}px;
        right: ${bubbleTheme.isChibiNpc ? sRight : 16}px;
        width: ${compOrnamentW}px;
        height: ${compOrnamentH}px;
        background-image: url("${composerStickerUrl}");
        background-size: contain;
        background-position: ${bubbleTheme.isChibiNpc ? 'bottom center' : 'center'};
        background-repeat: no-repeat;
        z-index: 30;
        pointer-events: none;
        transform-origin: 72% 92%;
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .surface-composer[data-chibi-bounce="1"]::before {
        transform: translateY(-7px) scale(1.05);
      }
      .surface-composer::after {
        content: "";
        position: absolute;
        bottom: 3px;
        left: 4px;
        width: 16px;
        height: 16px;
        background-image: url("${cornerFiligreeUrl}");
        background-size: contain;
        background-repeat: no-repeat;
        transform: rotate(180deg);
        z-index: 25;
        pointer-events: none;
        opacity: 0.78;
      }
    ` : `
      .surface-composer {
        margin-top: 28px !important;
        overflow: visible !important;
      }
      .surface-composer::before {
        content: "";
        position: absolute;
        top: ${sTop - 4}px;
        right: 16px;
        width: ${compPlainW}px;
        height: ${compPlainH}px;
        background-image: url("${composerStickerUrl}");
        background-size: contain;
        background-position: bottom center;
        background-repeat: no-repeat;
        z-index: 30;
        pointer-events: none;
      }
      .surface-composer::after { display: none !important; }
    `) : `
      .surface-composer::before,
      .surface-composer::after { display: none !important; }
    `;

    const inputCardBg =
      st.inputStyle === 'glass'
        ? bubbleInputGlassBg
        : st.inputStyle === 'double_gold'
        ? 'linear-gradient(145deg, rgba(44, 28, 20, 0.90) 0%, rgba(24, 15, 12, 0.92) 100%)'
        : bubbleInputCardBg;

    const inputOuterBorder =
      st.inputStyle === 'double_gold'
        ? 'linear-gradient(135deg, #f59e0b 0%, rgba(217, 119, 6, 0.35) 50%, #fbbf24 100%)'
        : bubbleFrameBg;

    const sidebarBg = SEC.sanitizeCssValue(mainTheme.sidebarBg, 'rgba(14, 10, 8, 0.68)');
    const sidebarHoverBg = SEC.sanitizeCssValue(mainTheme.sidebarHoverBg, 'rgba(255, 255, 255, 0.08)');
    const btnBg = SEC.sanitizeCssValue(mainTheme.btnBg, 'rgba(48, 30, 22, 0.62)');
    const modalBg = SEC.sanitizeCssValue(mainTheme.modalBg, 'rgba(14, 12, 12, 0.96)');
    const innerBubbleBorder = bubbleTheme.isScroll
      ? '2px solid #78350f'
      : bubbleInnerBorderRaw;

    const isLight = Boolean(mainTheme.isLight);
    const uiInk = SEC.sanitizeCssValue(mainTheme.uiTextColor || mainTheme.textMain, isLight ? '#0f172a' : 'rgba(248, 250, 252, 0.96)');
    const uiMutedInk = SEC.sanitizeCssValue(mainTheme.uiMutedColor || mainTheme.textMuted, isLight ? '#334155' : 'rgba(241, 245, 249, 0.92)');
    const uiShadow = isLight ? 'none' : '0 1px 4px rgba(0, 0, 0, 0.92), 0 0 8px rgba(0, 0, 0, 0.68)';
    const pillBg = SEC.sanitizeCssValue(mainTheme.pillBg, isLight ? 'rgba(255, 255, 255, 0.78)' : 'rgba(6, 11, 24, 0.78)');
    const pillHoverBg = SEC.sanitizeCssValue(mainTheme.pillHoverBg, isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(10, 18, 38, 0.92)');
    const pillText = SEC.sanitizeCssValue(mainTheme.pillTextColor || mainTheme.textMain, isLight ? '#0f172a' : '#f8fafc');
    const pillBorder = SEC.sanitizeCssValue(mainTheme.pillBorder, isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.16)');
    const preCodeBg = SEC.sanitizeCssValue(mainTheme.codeBg, isLight ? `rgba(${overlayRgb}, 0.72)` : `rgba(${overlayRgb}, 0.56)`);

    const rawEffUserAvatar = st.userAvatar === 'none'
      ? ''
      : (st.userAvatar || (personaValid ? (persona.userAvatar || mainTheme.userAvatar) : (mainTheme.userAvatar || persona.userAvatar)) || '');
    const effectiveUserAvatar = safeCssUrl(rawEffUserAvatar);
    const effectiveAgentAvatar = safeCssUrl(st.agentAvatar === 'none' ? '' : (st.agentAvatar || mainTheme.agentAvatar || ''));
    const personaRingColor = SEC.sanitizeCssValue(persona.ringColor, '#fde047');
    const personaGlowColor = SEC.sanitizeCssValue(persona.glowColor, 'rgba(239, 68, 68, 0.52)');
    const avSize = Math.min(52, Math.max(22, Number(st.avatarSize) || 32));
    const avAgentSize = Math.max(22, avSize - 2);
    const avRadius = Math.min(50, Math.max(0, Number.isFinite(Number(st.avatarRadius)) ? Number(st.avatarRadius) : 50));

    const avatarCss = `
      ${effectiveUserAvatar ? `
      .agy-shell [data-testid="user-message"] {
        position: relative !important;
        padding-right: ${avSize + 12}px !important;
      }
      .agy-shell [data-testid="user-message"]::after {
        content: "";
        position: absolute;
        right: 0;
        bottom: 6px;
        width: ${avSize}px;
        height: ${avSize}px;
        border-radius: ${avRadius}%;
        background-image: url("${effectiveUserAvatar}");
        background-size: cover;
        background-position: center;
        border: 1.8px solid ${personaRingColor};
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.55), 0 0 12px ${personaGlowColor};
        pointer-events: none;
      }
      ` : ''}
      .agy-shell [data-testid="user-message-content"] {
        max-height: 28em !important;
        overflow-y: auto !important;
      }
      ${effectiveAgentAvatar ? `
      .agy-shell [data-testid="agent-response"] {
        position: relative !important;
        padding-left: ${avAgentSize + 22}px !important;
        min-height: ${avAgentSize + 20}px !important;
      }
      .agy-shell [data-testid="agent-response"]::before {
        content: "";
        position: absolute;
        top: 12px;
        left: 12px;
        width: ${avAgentSize}px;
        height: ${avAgentSize}px;
        border-radius: ${avRadius}%;
        background-image: url("${effectiveAgentAvatar}");
        background-size: cover;
        background-position: center;
        border: 1.5px solid ${mainAccent};
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4), 0 0 8px ${mainSecondaryGlow || mainGlow};
        pointer-events: none;
      }
      ` : ''}
    `;

    const sidebarEnhanceCss = (mainTheme.sidebarEnhanceText || isLight) ? `
      .agy-shell .bg-sidebar a,
      .agy-shell .bg-sidebar span,
      .agy-shell .bg-sidebar button {
        color: ${isLight ? uiInk : 'inherit'};
        text-shadow: ${isLight ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.88)'};
      }
      .agy-shell .bg-sidebar .text-muted-foreground,
      .agy-shell .bg-sidebar .text-secondary-foreground {
        color: ${uiMutedInk} !important;
      }
    ` : '';

    const aiCardBorderSafe = mainAiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.1)');
    const aiCardCss = mainAiCardBg ? `
      /* Translucent reading card for AI responses (zero live backdrop-filter for max 120fps scroll) */
      .agy-shell [data-testid="agent-response"] {
        background: ${mainAiCardBg} !important;
        ${isLight ? `color: ${uiInk} !important;` : ''}
        backdrop-filter: none !important;
        border: 1px solid ${aiCardBorderSafe} !important;
        border-radius: ${bRad}px !important;
        padding: 12px 16px !important;
        box-shadow: ${isLight ? '0 4px 14px rgba(15, 23, 42, 0.08)' : '0 4px 14px rgba(0, 0, 0, 0.28)'} !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-bleed,
      .agy-shell [data-testid="agent-response"] .md-table-host {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        margin-inline: 0 !important;
        left: auto !important;
        right: auto !important;
        transform: none !important;
        box-sizing: border-box !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-scroll,
      .agy-shell [data-testid="agent-response"] :has(> table):not(.md-table-frame) {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-bottom: 2px !important;
        box-sizing: border-box !important;
        /* Keep standard scrollbar-width: auto so Chromium does not disable ::-webkit-scrollbar */
        scrollbar-width: auto !important;
        scrollbar-color: auto !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-frame {
        /* .md-table-frame sits INSIDE .md-table-scroll; forcing width:100% + overflow:hidden hid overflow from .md-table-scroll */
        width: fit-content !important;
        min-width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        transform: none !important;
        box-sizing: border-box !important;
      }
      .agy-shell [data-testid="agent-response"] :is(.md-math-display, .katex-display) {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        padding-bottom: 4px !important;
        box-sizing: border-box !important;
        scrollbar-width: auto !important;
        scrollbar-color: auto !important;
      }
      .agy-shell [data-testid="agent-response"] :not(.md-math-display):not(.katex-display) > .katex {
        display: inline-block !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        vertical-align: middle !important;
        box-sizing: border-box !important;
        scrollbar-width: auto !important;
        scrollbar-color: auto !important;
      }
      .agy-shell [data-testid="agent-response"] :is(.md-table-scroll, :has(> table):not(.md-table-frame), .md-math-display, .katex-display, :not(.md-math-display):not(.katex-display) > .katex)::-webkit-scrollbar {
        height: 8px !important;
        display: block !important;
      }
      .agy-shell [data-testid="agent-response"] :is(.md-table-scroll, :has(> table):not(.md-table-frame), .md-math-display, .katex-display, :not(.md-math-display):not(.katex-display) > .katex)::-webkit-scrollbar-track {
        background: ${isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.06)'} !important;
        border-radius: 9999px !important;
      }
      .agy-shell [data-testid="agent-response"] :is(.md-table-scroll, :has(> table):not(.md-table-frame), .md-math-display, .katex-display, :not(.md-math-display):not(.katex-display) > .katex)::-webkit-scrollbar-thumb {
        background: ${isLight ? 'rgba(15, 23, 42, 0.34)' : 'rgba(148, 163, 184, 0.48)'} !important;
        border-radius: 9999px !important;
      }
      .agy-shell [data-testid="agent-response"] :is(.md-table-scroll, :has(> table):not(.md-table-frame), .md-math-display, .katex-display, :not(.md-math-display):not(.katex-display) > .katex)::-webkit-scrollbar-thumb:hover {
        background: ${isLight ? 'rgba(15, 23, 42, 0.54)' : 'rgba(148, 163, 184, 0.72)'} !important;
      }
      .agy-shell [data-testid="agent-response"] table {
        width: 100% !important;
        min-width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        table-layout: auto !important;
        box-sizing: border-box !important;
      }
      .agy-shell [data-testid="agent-response"] :is(th, td) {
        max-width: none !important;
        white-space: normal !important;
        word-break: normal !important;
        overflow-wrap: break-word !important;
        padding: 8px 12px !important;
      }
      .agy-shell [data-testid="agent-response"] :is(td, th) .inline-pill-wrap {
        min-width: 0 !important;
      }
      ${isLight ? `
      .agy-shell [data-main-content-body="true"],
      .agy-shell [data-testid="agent-response"] :is(p, li, span, code, h1, h2, h3, h4, strong, td, th) {
        color: ${uiInk};
      }
      ` : ''}
      .agy-shell [data-main-content-body="true"] h1,
      .agy-shell [data-main-content-body="true"] h2 {
        text-shadow: ${isLight ? 'none' : '0 2px 10px rgba(0, 0, 0, 0.85)'};
      }
    ` : '';

    const useUnifiedGlass = Boolean(st.wpEnabled && wpUrl && mainTheme.unifiedGlass);
    if (useUnifiedGlass && typeof syncShellMetrics === 'function') {
      syncShellMetrics();
    }
    if (useUnifiedGlass) {
      const effectiveBlur = Number.isFinite(st.glassBlur) ? `${st.glassBlur}px` : SEC.sanitizeCssValue(mainTheme.headerBlur, '3px');
      syncPrebakedGlass(wpUrl, overlayRgb, overlayAlpha, mainHeaderBg, effectiveBlur);
    } else {
      syncPrebakedGlass(null);
    }

    const sideBorderSafe = mainAiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)');
    const sidePanelCss = st.wpEnabled ? `
      /* Keep right-side Artifact / Text / Diff split panels crystal-clear over native 4K backdrop (never cover right character with blurred canvas) */
      body:not([data-has-browser-hole="true"]) .agy-shell [data-side-panel-body="true"]:not([data-has-browser-hole="true"]):not(:has([data-browser-hole]:not([data-browser-hole="false"]))) {
        background: ${mainAiCardBg || `rgba(${overlayRgb}, 0.72)`} !important;
        ${isLight ? `color: ${uiInk} !important;` : ''}
        backdrop-filter: none !important;
        border-left: 1px solid ${sideBorderSafe} !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      }
      body:not([data-has-browser-hole="true"]) .agy-shell [data-side-panel-body="true"]:not([data-has-browser-hole="true"]):not(:has([data-browser-hole]:not([data-browser-hole="false"]))) pre {
        background: ${preCodeBg} !important;
        border: 1px solid ${sideBorderSafe} !important;
        border-radius: 10px !important;
      }
      .agy-shell [data-side-panel-body="true"] :is(h1, h2, h3, h4) {
        ${isLight ? `color: ${uiInk} !important;` : ''}
        text-shadow: ${isLight ? 'none' : '0 1px 6px rgba(0, 0, 0, 0.85)'};
      }
    ` : '';

    const headerCss = mainHeaderBg ? `
      /* Frosted top titlebar & seamless L-shaped unified glass (zero live backdrop-filter) */
      ${useUnifiedGlass ? `
      .agy-shell {
        position: relative !important;
      }
      .agy-shell > div:first-of-type:not(#agy-live-fx-host) {
        position: relative !important;
        z-index: 3 !important;
      }
      .agy-shell > div:not(:first-of-type):not(#agy-live-fx-host) {
        position: relative !important;
        z-index: 2 !important;
      }
      #agy-live-fx-host {
        position: absolute !important;
        inset: 0 !important;
        z-index: 1 !important;
        pointer-events: none !important;
        display: block !important;
      }
      .agy-shell::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        background-color: ${mainHeaderBg};
        background-image: var(--agy-l-glass-bg, none);
        background-size: cover;
        background-position: ${bgPosition};
        background-repeat: no-repeat;
        backdrop-filter: none !important;
        will-change: transform;
        clip-path: polygon(
          0 0,
          100% 0,
          100% var(--agy-hdr-h, 75px),
          var(--agy-sidebar-w, 256px) var(--agy-hdr-h, 75px),
          var(--agy-sidebar-w, 256px) 100%,
          0 100%
        );
      }
      .agy-shell [class*="@container/titlebar"] {
        background: transparent !important;
        backdrop-filter: none !important;
        border-bottom: 1px solid ${mainHeaderBorder} !important;
      }
      ` : `
      .agy-shell [class*="@container/titlebar"] {
        background: ${mainHeaderBg} !important;
        backdrop-filter: none !important;
        border-bottom: 1px solid ${mainHeaderBorder} !important;
      }
      `}
      .agy-shell [class*="@container/titlebar"] [data-testid="breadcrumb-segment"],
      .agy-shell [class*="@container/titlebar"] [data-testid="pane-titlebar-toolbar"] button,
      .agy-shell [class*="@container/titlebar"] [data-testid="pane-titlebar-toolbar"] span {
        color: ${uiInk} !important;
        text-shadow: ${uiShadow};
      }
      .agy-shell [class*="@container/titlebar"] [data-testid="pane-titlebar-toolbar"] button.border {
        background: ${isLight ? 'rgba(255, 255, 255, 0.56)' : 'rgba(6, 11, 24, 0.36)'} !important;
        border-color: ${pillBorder} !important;
      }
    ` : '';

    const sidebarOuterCss = useUnifiedGlass ? `
      .agy-shell aside,
      .agy-shell [data-sidebar="true"],
      .agy-shell .bg-sidebar:not(.surface-opaque) {
        background: transparent !important;
        backdrop-filter: none !important;
      }
    ` : `
      .agy-shell aside,
      .agy-shell [data-sidebar="true"],
      .agy-shell .bg-sidebar:not(.surface-opaque) {
        background: ${sidebarBg} !important;
        backdrop-filter: none !important;
      }
    `;

    styleEl.textContent = `
      ${wpCss}

      /* Translucent themed glass sidebar (unified via ::before when unifiedGlass is active) */
      ${sidebarOuterCss}
      .agy-shell .bg-sidebar:not(.surface-opaque) .bg-sidebar:not(.surface-opaque),
      .agy-shell [data-sidebar="true"] .bg-sidebar:not(.surface-opaque),
      .agy-shell .bg-sidebar:not(.surface-opaque) [class*="group/headerbtn"],
      .agy-shell .bg-sidebar:not(.surface-opaque) [class*="group/section-header"] {
        background: transparent !important;
        backdrop-filter: none !important;
      }
      /* Keep floating menubar dropdowns & opaque popovers readable (never inherit transparent sidebar bg) */
      .agy-shell .surface-opaque.bg-sidebar,
      .agy-shell .surface-opaque.border-menu-border {
        background: ${modalBg} !important;
        border-color: ${mainBorderColor} !important;
        box-shadow: 0 12px 32px rgba(0, 0, 0, ${isLight ? '0.18' : '0.65'}) !important;
        backdrop-filter: none !important;
      }
      /* Preserve virtual list positioning; hide sticky headers only while scrolled */
      .agy-shell .bg-sidebar .agy-scrolled > .w-full.relative > .bg-sidebar[style*="position: sticky"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.14s ease !important;
      }
      .agy-shell .bg-sidebar [class*="group/headerbtn"]:hover,
      .agy-shell .bg-sidebar a:hover {
        background: ${sidebarHoverBg} !important;
      }
      ${sidebarEnhanceCss}
      ${aiCardCss}
      ${sidePanelCss}
      ${avatarCss}
      ${headerCss}

      /* "+ New Conversation" button glow */
      .agy-button-custom.border.border-border {
        background: ${btnBg} !important;
        border-color: ${mainBorderColor} !important;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3) !important;
      }

      /* Prevent Antigravity's [&:has(>.agy-user-bubble-frame>:empty)]:hidden from ever hiding non-empty user messages */
      .agy-shell [data-testid="user-message"] div:has(> .agy-user-bubble-frame > [data-testid="user-message-bubble"]:not(:empty)),
      .agy-shell div:has(> .agy-user-bubble-frame > .agy-user-bubble:not(:empty)) {
        display: flex !important;
      }

      /* User Chat Bubble Double-Border Frame & Ornament */
      .agy-user-bubble-frame {
        background: ${bubbleFrameBg} !important;
        border-radius: ${bubbleTheme.isScroll ? '6px' : `${bRad}px`} !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45), 0 0 12px ${bubbleGlow} !important;
        position: relative !important;
        overflow: visible !important;
        padding: 1.2px !important;
      }

      .agy-user-bubble-frame::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: ${bubbleTheme.isOrnament ? '16px' : '14px'};
        height: 16px;
        background-image: url("${userCornerFiligreeUrl}");
        background-size: contain;
        background-repeat: no-repeat;
        pointer-events: none;
        opacity: ${bubbleTheme.isOrnament ? '0.85' : '0.65'};
      }

      .agy-user-bubble {
        background: ${bubbleBg} !important;
        border-radius: ${bubbleTheme.isScroll ? '5px' : `${Math.max(4, bRad - 1)}px`} !important;
        padding: 8px 16px !important;
        color: ${bubbleTextColor} !important;
        border: ${innerBubbleBorder} !important;
        overflow: visible !important;
        font-weight: 450 !important;
      }

      .agy-user-bubble * {
        color: ${bubbleTextColor} !important;
      }

      /* Double-Border Input Composer */
      .surface-composer {
        background: ${inputOuterBorder} !important;
        border-radius: 16px !important;
        padding: 1.5px !important;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5), 0 0 14px ${bubbleGlow} !important;
        position: relative !important;
      }

      .surface-composer-card {
        background: ${inputCardBg} !important;
        backdrop-filter: none !important;
        border-radius: 14.5px !important;
        border: ${bubbleInnerBorderRaw} !important;
      }

      ${bubbleComposerHeaderBg ? `
      .surface-composer > :first-child:not(.surface-composer-card):not(.agy-shinobu-npc-wrap):not(.agy-chibi-hitbox):not(#agy-token-context-bar):not(#agy-yoriichi-msg-echo):not(agy-chibi-aura):not(.agy-chibi-live2d-overlay):not(agy-hashira-squad) {
        background: ${bubbleComposerHeaderBg} !important;
        border-radius: 14.5px 14.5px 0 0 !important;
        padding: 4px 8px !important;
      }
      .surface-composer:has(> :first-child:not(.surface-composer-card):not(.agy-shinobu-npc-wrap):not(.agy-chibi-hitbox):not(#agy-token-context-bar):not(#agy-yoriichi-msg-echo):not(agy-chibi-aura):not(.agy-chibi-live2d-overlay):not(agy-hashira-squad)) .surface-composer-card {
        border-radius: 0 0 14.5px 14.5px !important;
      }
      ` : ''}

      /* High-contrast pill badges for top composer bar (adaptive light/dark theme) */
      .surface-composer [data-testid="project-selector-trigger"],
      .surface-composer [data-testid="branch-pill-trigger"],
      .surface-composer [aria-label="Select Environment"],
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"] {
        background: ${pillBg} !important;
        color: ${pillText} !important;
        border: 1px solid ${pillBorder} !important;
        border-radius: 9999px !important;
        font-weight: 500 !important;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25) !important;
        margin: 1px 2px !important;
        transition: background-color 0.15s ease, border-color 0.15s ease !important;
      }
      .surface-composer [data-testid="branch-pill-trigger"],
      .surface-composer [aria-label="Select Environment"],
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button:not([data-testid="project-selector-trigger"]),
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"]:not([data-testid="project-selector-trigger"]) {
        padding-left: 8px !important;
        padding-right: 7px !important;
        gap: 4px !important;
      }
      .surface-composer [data-testid="project-selector-trigger"]:hover,
      .surface-composer [data-testid="branch-pill-trigger"]:hover,
      .surface-composer [aria-label="Select Environment"]:hover,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button:hover,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"]:hover {
        background: ${pillHoverBg} !important;
        border-color: ${mainBorderColor} !important;
        color: ${pillText} !important;
      }
      .surface-composer [data-testid="project-selector-trigger"] *,
      .surface-composer [data-testid="branch-pill-trigger"] *,
      .surface-composer [aria-label="Select Environment"] *,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button *,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"] * {
        color: ${pillText} !important;
      }
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] .ml-auto > * {
        background: ${pillBg} !important;
        color: ${pillText} !important;
        border-radius: 9999px !important;
        padding: 2px 8px !important;
      }

      ${bubbleStickerCss}
      ${inputStickerCss}
      .surface-composer[data-chibi-3d-active="1"]::before,
      .surface-composer[data-chibi3d-active="1"]::before {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      @media (max-width: 640px) {
        .agy-user-bubble-frame::before,
        .surface-composer::before {
          transform: scale(0.78);
          transform-origin: bottom right;
        }
      }

      .settings-modal-container {
        background: ${modalBg} !important;
        border: 1px solid ${mainBorderColor} !important;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.75), 0 0 24px ${mainGlow} !important;
        backdrop-filter: none !important;
      }

      #agy-custom-theme-modal-backdrop {
        -webkit-app-region: no-drag !important;
      }
      @media (max-width: 680px) {
        #agy-custom-theme-modal-backdrop {
          padding: 12px !important;
        }
        #agy-theme-scroll-container {
          padding: 16px 16px 36px 16px !important;
        }
        #agy-custom-theme-modal-backdrop .agy-modal-grid-2 {
          grid-template-columns: 1fr !important;
        }
      }
      #agy-custom-theme-modal-dialog {
        background: ${modalBg} !important;
        border-color: ${mainBorderColor} !important;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.9), 0 0 32px ${mainGlow} !important;
      }
      #agy-custom-theme-modal-header {
        background: ${mainModalHeaderBg} !important;
      }
      #agy-custom-theme-badge {
        color: ${mainPrimary} !important;
        border-color: ${mainBorderColor} !important;
        background: ${mainGlow} !important;
      }
      #agy-custom-theme-sidebar-btn svg {
        color: ${mainPrimary} !important;
      }
    `;

    syncTitleBarOverlay(st);
    scheduleTitleBarSync(st);
    syncLiveWallpaperFx(st, mainTheme);
    syncShinobuNpc(st, bubbleTheme);
    syncTokenHud(st);
  }

  function syncTitleBarOverlay(stOverride) {
    if (coreDestroyed || IS_MAC) return;
    const st = stOverride || getEffectiveState();
    const activeTh = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    if (window.electronNative && typeof window.electronNative.setTitleBarOverlay === 'function') {
      try {
        window.electronNative.setTitleBarOverlay({
          color: st.wpEnabled ? '#00000000' : '#111114',
          symbolColor: (st.wpEnabled && activeTh.isLight) ? '#0f172a' : '#f8fafc'
        });
      } catch (e) {}
    }
  }

  function clearTitleBarTimers() {
    if (Array.isArray(window.__AGY_TBO_TIMERS__)) {
      window.__AGY_TBO_TIMERS__.forEach(id => clearTimeout(id));
    }
    window.__AGY_TBO_TIMERS__ = [];
  }

  function scheduleTitleBarSync(stOverride) {
    clearTitleBarTimers();
    if (coreDestroyed || IS_MAC) return;
    const st = stOverride || getEffectiveState();
    syncTitleBarOverlay(st);
    [300, 900, 2000, 4000, 7000].forEach(ms => {
      window.__AGY_TBO_TIMERS__.push(setTimeout(() => {
        if (!coreDestroyed) syncTitleBarOverlay();
      }, ms));
    });
  }

  function removeCustomTheme(opts) {
    coreDestroyed = true;
    transientOverrideState = null;
    if (window.__AGY_MODAL_OBSERVER__) {
      try { window.__AGY_MODAL_OBSERVER__.disconnect(); } catch (e) {}
      window.__AGY_MODAL_OBSERVER__ = null;
    }
    if (window.__AGY_TICK_RAF__) {
      cancelAnimationFrame(window.__AGY_TICK_RAF__);
      window.__AGY_TICK_RAF__ = 0;
    }
    if (window.__AGY_SHELL_RO__) {
      try { window.__AGY_SHELL_RO__.disconnect(); } catch (e) {}
      window.__AGY_SHELL_RO__ = null;
    }
    if (window.__AGY_SCROLL_AC__) {
      try { window.__AGY_SCROLL_AC__.abort(); } catch (e) {}
      window.__AGY_SCROLL_AC__ = null;
    }
    clearTitleBarTimers();
    if (blurSliderDebounceTimer) {
      clearTimeout(blurSliderDebounceTimer);
      blurSliderDebounceTimer = 0;
    }
    if (twIdleTimerId) {
      clearTimeout(twIdleTimerId);
      twIdleTimerId = 0;
    }
    if (twLerpRafId) {
      cancelAnimationFrame(twLerpRafId);
      twLerpRafId = 0;
    }
    teardownLiveWallpaperFx();
    teardownShinobuNpc();
    if (typeof teardownTransparentWorldFlow === 'function') {
      teardownTransparentWorldFlow();
    }
    [
      window.__AGY_TOKEN_HUD__,
      window.__AGY_SQUAD_RAID__,
      window.__AGY_BIO_AUDIO__,
      window.__AGY_CINEMA_DIRECTOR__,
      window.__AGY_KNY_CHIBI_AURA__,
      window.__AGY_KNY_SKILLS__,
      window.__AGY_KNY_3D_VFX__
    ].forEach((mod) => {
      if (!mod) return;
      try {
        if (typeof mod.teardown === 'function') mod.teardown(opts);
        else if (typeof mod.destroy === 'function') mod.destroy(opts);
      } catch (e) {}
    });
    document.querySelectorAll('[data-agy-scroll-bound]').forEach(el => delete el.dataset.agyScrollBound);
    document.querySelectorAll('[data-agy-tbo-mounted]').forEach(el => delete el.dataset.agyTboMounted);
    document.querySelectorAll('[data-agy-npc-key-bound]').forEach(el => delete el.dataset.agyNpcKeyBound);
    document.querySelectorAll('.agy-yoriichi-msg-hit').forEach(el => el.remove());

    const styleEl = document.getElementById('antigravity-custom-theme-active');
    if (styleEl) styleEl.remove();
    const navBtn = document.getElementById('agy-custom-theme-sidebar-btn');
    if (navBtn) navBtn.remove();
    const settingsBtn = document.getElementById('agy-custom-theme-settings-btn');
    if (settingsBtn) settingsBtn.remove();
    const modal = document.getElementById('agy-custom-theme-modal-backdrop');
    if (modal) modal.remove();
    const shell = document.querySelector('.agy-shell');
    if (shell) {
      delete shell.dataset.agyHoleActive;
      delete shell.dataset.agySideGlass;
      delete shell.dataset.agyTboMounted;
      shell.style.removeProperty('--agy-hole-clip');
      shell.style.removeProperty('--agy-l-glass-bg');
      shell.style.removeProperty('--agy-sidebar-w');
      shell.style.removeProperty('--agy-hdr-h');
      shell.style.removeProperty('--agy-side-l');
      shell.style.removeProperty('--agy-side-t');
      shell.style.removeProperty('--agy-side-r');
      shell.style.removeProperty('--agy-side-b');
    }
    window.__AGY_HOLE_EL__ = null;
    window.__AGY_SIDE_EL__ = null;
    delete window.__AGY_SYNC_BATTERY_ECO__;
    delete window.__AGY_FX_DENSITY__;
    delete window.__AGY_AUTO_FINISHER__;
    if (!IS_MAC && window.electronNative && typeof window.electronNative.setTitleBarOverlay === 'function') {
      try {
        window.electronNative.setTitleBarOverlay({ color: '#111114', symbolColor: '#f8fafc' });
      } catch (e) {}
    }
  }

  const captureSnapshot = () => ({ ...getState() });
  window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__ = applyTheme;
  window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ = removeCustomTheme;
  window.__ANTIGRAVITY_OPEN_THEME_MODAL__ = openCustomThemeModal;
  window.__AGY_THEME_CORE__ = {
    applyTheme,
    getState,
    getEffectiveState,
    getThemeKeys: () => [...THEME_KEYS],
    captureSnapshot,
    getSnapshot: captureSnapshot,
    applyTransientTheme: (themeKey) => {
      if (coreDestroyed) return false;
      const q = String(themeKey || '').trim();
      if (!q) return false;
      const qLower = q.toLowerCase();
      const matched = THEMES[q]
        ? q
        : THEME_KEYS.find((k) => String(k || '').toLowerCase().includes(qLower));
      if (!matched || !THEMES[matched]) return false;
      const baseSt = getState();
      const picked = THEMES[matched] || {};
      const nextDim = picked.defaultDimming !== undefined ? picked.defaultDimming : 36;
      applyTheme({
        ...baseSt,
        themeName: matched,
        bubbleName: matched,
        customWp: '',
        dimming: nextDim,
        wpEnabled: true
      }, { transient: true });
      return true;
    },
    restoreSnapshot: (snap) => {
      if (coreDestroyed) return false;
      transientOverrideState = null;
      const restored = (snap && typeof snap === 'object') ? { ...getState(), ...snap } : getState();
      applyTheme(restored, { skipSaveDisk: true });
      return true;
    },
    applyDaemonDelta: (deltaCfg) => {
      if (coreDestroyed || !deltaCfg || typeof deltaCfg !== 'object') return false;
      if (!hydrateStorageFromConfigObject(deltaCfg)) return false;
      transientOverrideState = null;
      applyTheme(getState(), { skipSaveDisk: true });
      syncInjectedButtonsLanguage();
      const openBackdrop = typeof document !== 'undefined' ? document.getElementById('agy-custom-theme-modal-backdrop') : null;
      if (openBackdrop && openBackdrop.style.display !== 'none') {
        syncModalHeaderLanguage(openBackdrop);
        const modalBody = openBackdrop.querySelector('#agy-theme-modal-body');
        if (modalBody) renderThemePanels(modalBody);
      }
      return true;
    },
    setLanguage: (nextLang) => {
      if (coreDestroyed) return 'vi';
      const clean = normalizeUiLang(nextLang);
      applyTheme({ uiLang: clean });
      syncInjectedButtonsLanguage();
      const openBackdrop = typeof document !== 'undefined' ? document.getElementById('agy-custom-theme-modal-backdrop') : null;
      if (openBackdrop) {
        syncModalHeaderLanguage(openBackdrop);
        if (openBackdrop.style.display !== 'none') {
          const modalBody = openBackdrop.querySelector('#agy-theme-modal-body');
          if (modalBody) renderThemePanels(modalBody);
        }
      }
      return clean;
    },
    bindWorkspaceProfile: (rawKey, customProfile) => {
      if (coreDestroyed) return false;
      const wsKey = normalizeWorkspaceKey(rawKey);
      if (!wsKey) return false;
      const cur = getState();
      const nextMap = { ...(cur.workspaceProfiles || {}) };
      const src = (customProfile && typeof customProfile === 'object') ? { ...cur, ...customProfile } : cur;
      nextMap[wsKey] = {
        themeName: THEMES[src.themeName] ? src.themeName : cur.themeName,
        bubbleName: THEMES[src.bubbleName] ? src.bubbleName : cur.bubbleName,
        masterPersona: normalizeSafeMasterPersona(src.masterPersona),
        aiPersonaMode: normalizeAiPersonaMode(src.aiPersonaMode, cur.aiPersonaMode),
        dimming: clampInt(src.dimming, 15, 92, cur.dimming),
        fxDensity: clampInt(src.fxDensity, 0, 100, cur.fxDensity),
        chibiEnabled: src.chibiEnabled !== false,
        chibi3dEnabled: src.chibi3dEnabled !== false,
        chibi2dLive: src.chibi2dLive !== false,
        autoFinisher: src.autoFinisher !== false,
        focusMode: Boolean(src.focusMode)
      };
      applyTheme({ activeWorkspace: wsKey, workspaceProfiles: sanitizeWorkspaceProfilesMap(nextMap) });
      return true;
    },
    applyWorkspaceProfile: (rawKey) => {
      if (coreDestroyed) return false;
      const wsKey = normalizeWorkspaceKey(rawKey);
      if (!wsKey) return false;
      const cur = getState();
      const prof = cur.workspaceProfiles && Object.prototype.hasOwnProperty.call(cur.workspaceProfiles, wsKey)
        ? cur.workspaceProfiles[wsKey]
        : null;
      if (!prof) return false;
      applyTheme({
        activeWorkspace: wsKey,
        themeName: prof.themeName,
        bubbleName: prof.bubbleName,
        masterPersona: prof.masterPersona,
        aiPersonaMode: prof.aiPersonaMode || cur.aiPersonaMode,
        dimming: prof.dimming,
        fxDensity: prof.fxDensity,
        chibiEnabled: prof.chibiEnabled,
        chibi3dEnabled: typeof prof.chibi3dEnabled === 'boolean' ? prof.chibi3dEnabled : cur.chibi3dEnabled,
        chibi2dLive: typeof prof.chibi2dLive === 'boolean' ? prof.chibi2dLive : cur.chibi2dLive,
        autoFinisher: prof.autoFinisher !== false,
        focusMode: Boolean(prof.focusMode)
      });
      return true;
    },
    syncPrivacyShield: (active) => {
      if (coreDestroyed) return false;
      const cur = getState();
      SEC.saveConfigSecure({ ...cur, privacyShieldActive: Boolean(active) });
      try {
        const backdrop = typeof document !== 'undefined' ? document.getElementById('agy-custom-theme-modal-backdrop') : null;
        if (backdrop && backdrop.style.display !== 'none') {
          const bodyEl = backdrop.querySelector('#agy-theme-modal-body');
          if (bodyEl) renderThemePanels(bodyEl);
        }
      } catch (_) {}
      return true;
    },
    removeWorkspaceProfile: (rawKey) => {
      if (coreDestroyed) return false;
      const wsKey = normalizeWorkspaceKey(rawKey);
      if (!wsKey) return false;
      const cur = getState();
      const nextMap = { ...(cur.workspaceProfiles || {}) };
      if (!Object.prototype.hasOwnProperty.call(nextMap, wsKey)) return false;
      delete nextMap[wsKey];
      applyTheme({ workspaceProfiles: nextMap });
      return true;
    },
    diagnoseDomContracts,
    resolveNpcCharacterId: (bThemeOverride, stOverride) => resolveNpcCharacterId(bThemeOverride, stOverride),
    detectNpcIntent: (rawInput, activeCharId) => detectNpcIntent(rawInput, activeCharId),
    getNpcSoulMeta: (bThemeOverride, stOverride) => getNpcSoulMeta(bThemeOverride, stOverride),
    getNpcReplyForInput: (rawInput, profileOverride, stOverride) => getNpcReplyForInput(rawInput, profileOverride, stOverride),
    converseWithNpc: (rawInput, profileOverride, stOverride) => buildNpcReplyDetailed(rawInput, profileOverride, stOverride),
    DOM_CONTRACTS: AGY_DOM_CONTRACTS
  };

  function syncInjectedButtonsLanguage() {
    if (typeof document === 'undefined') return;
    const sbSpan = document.querySelector('#agy-custom-theme-sidebar-btn span');
    if (sbSpan) sbSpan.textContent = tr('sidebarBtn', 'Giao diện tùy biến');
    const stSpan = document.querySelector('#agy-custom-theme-settings-btn span');
    if (stSpan) stSpan.textContent = tr('openStudioBtn', 'Mở Xưởng Giao Diện Tùy Biến');
  }

  function syncModalHeaderLanguage(backdrop) {
    if (!backdrop) return;
    const curLang = getState().uiLang || 'vi';
    const titleEl = backdrop.querySelector('#agy-custom-theme-modal-title');
    if (titleEl) titleEl.textContent = tr('studioTitle', 'Xưởng Giao Diện Tùy Biến');
    const badgeEl = backdrop.querySelector('#agy-custom-theme-badge');
    if (badgeEl) badgeEl.textContent = tr('themesCount', '{n} Chủ đề', { n: THEME_KEYS.length });
    const closeBtn = backdrop.querySelector('#agy-theme-modal-close-btn');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', tr('closeStudioAria', 'Đóng xưởng giao diện tùy biến'));
      closeBtn.setAttribute('title', tr('closeEsc', 'Đóng (Esc)'));
    }
    const langSwitch = backdrop.querySelector('#agy-studio-lang-switch');
    if (langSwitch) {
      langSwitch.setAttribute('aria-label', tr('langGroupAria', 'Ngôn ngữ giao diện'));
      langSwitch.querySelectorAll('.agy-lang-btn').forEach((btn) => {
        const isAct = btn.getAttribute('data-lang') === curLang;
        btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
      });
    }
  }

  const STUDIO_TABS = [
    {
      id: 'themes',
      label: 'Bộ sưu tập',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg>'
    },
    {
      id: 'persona',
      label: 'Nhân vật & Đại diện',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>'
    },
    {
      id: 'chat',
      label: 'Tin nhắn & Soạn thảo',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    },
    {
      id: 'backdrop',
      label: 'Hình nền & Kính mờ',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
    },
    {
      id: 'forge',
      label: 'Lò rèn & Dữ liệu',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>'
    }
  ];

  function openCustomThemeModal(initialTab) {
    if (coreDestroyed) return;
    if (typeof initialTab === 'string' && STUDIO_TABS.some((t) => t.id === initialTab)) {
      modalActiveTab = initialTab;
    }
    try { window.__AGY_TOKEN_HUD__?.closePopover?.(); } catch (_) {}
    try { window.__AGY_BIO_AUDIO__?.closePopover?.(); } catch (_) {}
    try { window.__AGY_CINEMA_DIRECTOR__?.closePanel?.(); } catch (_) {}

    let backdrop = document.getElementById('agy-custom-theme-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'agy-custom-theme-modal-backdrop';
      backdrop.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 100060;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(4, 6, 12, 0.72);
        backdrop-filter: blur(10px);
        -webkit-app-region: no-drag;
        overscroll-behavior: contain;
        color-scheme: dark;
      `;

      backdrop.innerHTML = `
        <style id="agy-studio-ui-css">
          #agy-custom-theme-modal-dialog {
            background: #0d1017;
            border: 1px solid rgba(255, 255, 255, 0.11);
            border-radius: 16px;
            width: 100%;
            max-width: 940px;
            height: min(85vh, 800px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            overscroll-behavior: contain;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 32px 80px rgba(0, 0, 0, 0.85);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
            color: #f4f4f5;
          }
          #agy-custom-theme-modal-dialog *,
          #agy-custom-theme-modal-dialog *::before,
          #agy-custom-theme-modal-dialog *::after {
            box-sizing: border-box;
          }
          #agy-custom-theme-modal-dialog button,
          #agy-custom-theme-modal-dialog select,
          #agy-custom-theme-modal-dialog input,
          #agy-custom-theme-modal-dialog label {
            touch-action: manipulation;
          }
          #agy-custom-theme-modal-dialog select,
          #agy-custom-theme-modal-dialog select option {
            background-color: #111520;
            color: #f8fafc;
          }
          #agy-custom-theme-modal-dialog :is(button, select, input, textarea, [tabindex="0"], label.agy-studio-btn-label):focus-visible {
            outline: 2px solid var(--agy-st-accent, #38bdf8);
            outline-offset: 2px;
          }
          .agy-studio-tabular {
            font-variant-numeric: tabular-nums;
          }
          #agy-studio-lang-switch {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            padding: 2px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.11);
          }
          .agy-lang-btn {
            height: 26px;
            padding: 0 8px;
            border-radius: 6px;
            border: none;
            background: transparent;
            color: #94a3b8;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.15s ease, color 0.15s ease;
          }
          .agy-lang-btn:hover {
            color: #f1f5f9;
          }
          .agy-lang-btn[aria-pressed="true"] {
            background: rgba(255, 255, 255, 0.14);
            color: #f8fafc;
          }
          #agy-theme-modal-close-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            color: #cbd5e1;
            cursor: pointer;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          }
          #agy-theme-modal-close-btn:hover {
            background: rgba(255, 255, 255, 0.11);
            border-color: rgba(255, 255, 255, 0.22);
            color: #ffffff;
          }
          #agy-studio-tablist {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0 24px;
            background: #11141d;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
          }
          #agy-studio-tablist::-webkit-scrollbar {
            display: none;
          }
          .agy-studio-tab {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            height: 44px;
            padding: 0 14px;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: #94a3b8;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            cursor: pointer;
            transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
          }
          .agy-studio-tab:hover {
            color: #e2e8f0;
            background: rgba(255, 255, 255, 0.03);
          }
          .agy-studio-tab[aria-selected="true"] {
            color: #f8fafc;
            font-weight: 600;
            border-bottom-color: var(--agy-st-accent, #e08e55);
          }
          .agy-studio-surface {
            border: 1px solid rgba(255, 255, 255, 0.09);
            background: rgba(20, 24, 34, 0.72);
            border-radius: 12px;
            padding: 18px 20px;
          }
          .agy-studio-btn,
          .agy-studio-btn-label {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 32px;
            padding: 0 12px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.13);
            color: #f1f5f9;
            font-size: 12.5px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          }
          .agy-studio-btn:hover,
          .agy-studio-btn-label:hover {
            background: rgba(255, 255, 255, 0.11);
            border-color: rgba(255, 255, 255, 0.24);
          }
          .agy-studio-btn-danger {
            background: rgba(239, 68, 68, 0.12);
            border-color: rgba(239, 68, 68, 0.34);
            color: #fca5a5;
          }
          .agy-studio-btn-danger:hover {
            background: rgba(239, 68, 68, 0.20);
            border-color: rgba(239, 68, 68, 0.52);
            color: #fecaca;
          }
          .agy-av-switch {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            height: 32px;
            padding: 0 10px 0 8px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.05);
            color: #cbd5e1;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          }
          .agy-av-switch:hover {
            border-color: rgba(255, 255, 255, 0.28);
          }
          .agy-av-switch[aria-checked="true"] {
            background: rgba(16, 185, 129, 0.14);
            border-color: rgba(52, 211, 153, 0.45);
            color: #ecfdf5;
          }
          .agy-av-switch-track {
            position: relative;
            width: 32px;
            height: 18px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.18);
            transition: background-color 0.16s ease;
            flex-shrink: 0;
          }
          .agy-av-switch[aria-checked="true"] .agy-av-switch-track {
            background: #10b981;
          }
          .agy-av-switch-thumb {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #ffffff;
            transform: translateX(0);
            transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1);
          }
          .agy-av-switch[aria-checked="true"] .agy-av-switch-thumb {
            transform: translateX(14px);
          }
          .agy-preset-card:hover,
          .agy-bubble-card:hover,
          .agy-input-card:hover {
            border-color: rgba(255, 255, 255, 0.28) !important;
          }
          @media (max-width: 700px) {
            .agy-modal-grid-2 {
              grid-template-columns: minmax(0, 1fr) !important;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            #agy-custom-theme-modal-dialog *,
            #agy-custom-theme-modal-dialog *::before,
            #agy-custom-theme-modal-dialog *::after {
              transition: none !important;
              animation: none !important;
            }
          }
        </style>
        <div id="agy-custom-theme-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="agy-custom-theme-modal-title">
          <div id="agy-custom-theme-modal-header" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 15px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.07); background: #0d1017; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
              <span id="agy-custom-theme-modal-title" style="font-size: 16px; font-weight: 600; color: #f8fafc; letter-spacing: -0.015em; white-space: nowrap;">Xưởng Giao Diện Tùy Biến</span>
              <span id="agy-custom-theme-badge" class="agy-studio-tabular" style="font-size: 11.5px; padding: 2px 9px; border-radius: 9999px; background: rgba(224, 142, 85, 0.16); color: #f59e0b; font-weight: 600; border: 1px solid rgba(245, 158, 11, 0.30); white-space: nowrap;">${THEME_KEYS.length} Chủ đề</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
              <span id="agy-studio-active-summary" style="font-size: 12px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px;"></span>
              <div id="agy-studio-lang-switch" role="group" aria-label="Ngôn ngữ giao diện">
                <button type="button" class="agy-lang-btn" data-lang="vi" aria-pressed="true">VI</button>
                <button type="button" class="agy-lang-btn" data-lang="en" aria-pressed="false">EN</button>
                <button type="button" class="agy-lang-btn" data-lang="ja" aria-pressed="false">日本語</button>
              </div>
              <button id="agy-theme-modal-close-btn" type="button" aria-label="Đóng xưởng giao diện tùy biến" title="Đóng (Esc)">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>
          <div id="agy-theme-modal-body" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;"></div>
        </div>
      `;

      document.body.appendChild(backdrop);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.style.display = 'none';
      });
      backdrop.querySelector('#agy-theme-modal-close-btn').addEventListener('click', () => {
        backdrop.style.display = 'none';
      });
      backdrop.querySelectorAll('.agy-lang-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pickedLang = btn.getAttribute('data-lang') || 'vi';
          window.__AGY_THEME_CORE__.setLanguage(pickedLang);
        });
      });
      const modalKeyOpts = window.__AGY_SCROLL_AC__ ? { signal: window.__AGY_SCROLL_AC__.signal } : undefined;
      window.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape' && backdrop.style.display !== 'none') {
          backdrop.style.display = 'none';
        }
      }, modalKeyOpts);
    }

    backdrop.style.display = 'flex';
    syncModalHeaderLanguage(backdrop);
    const body = backdrop.querySelector('#agy-theme-modal-body');
    renderThemePanels(body);
  }

  function renderThemePanels(container) {
    const prevInnerScroller = container.querySelector('#agy-theme-scroll-container');
    const savedInnerScrollTop = prevInnerScroller ? prevInnerScroller.scrollTop : 0;
    const savedOuterScrollTop = container.scrollTop || 0;
    if (modalPendingForged) {
      const prevForgeNameEl = container.querySelector('#agy-forge-name');
      const prevForgeFxEl = container.querySelector('#agy-forge-fx');
      if (prevForgeNameEl && prevForgeNameEl.value) modalPendingForgeName = prevForgeNameEl.value;
      if (prevForgeFxEl && prevForgeFxEl.value) modalPendingForgeFx = prevForgeFxEl.value;
    }

    const st = getState();
    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    const forge = typeof window !== 'undefined' ? window.__AGY_THEME_FORGE__ : null;
    const activePersona = getActiveMasterPersona(st);
    const personaValid = hasValidMasterPersona(st.masterPersona);

    if (!STUDIO_TABS.some((t) => t.id === modalActiveTab)) {
      modalActiveTab = 'themes';
    }

    const safeMainPrimary = SEC.sanitizeCssValue(mainTheme.primary, '#c084fc');
    const safeMainAccent = SEC.sanitizeCssValue(mainTheme.accent || mainTheme.secondary, safeMainPrimary);
    const safeMainBorder = SEC.sanitizeCssValue(mainTheme.borderColor, 'rgba(255, 255, 255, 0.14)');
    const safeCardBg = SEC.sanitizeCssValue(mainTheme.cardBg, 'rgba(20, 24, 34, 0.76)');

    function computeEffectiveUserAv(stateSnap) {
      if (stateSnap.userAvatar === 'none') return '';
      const pObj = getActiveMasterPersona(stateSnap);
      const pOk = hasValidMasterPersona(stateSnap.masterPersona);
      const thObj = THEMES[stateSnap.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
      return safeCssUrl(
        stateSnap.userAvatar ||
        (pOk ? (pObj.userAvatar || thObj.userAvatar) : (thObj.userAvatar || pObj.userAvatar)) ||
        ''
      );
    }

    function computeEffectiveAgentAv(stateSnap) {
      if (stateSnap.agentAvatar === 'none') return '';
      const thObj = THEMES[stateSnap.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
      return safeCssUrl(stateSnap.agentAvatar || thObj.agentAvatar || '');
    }

    const isUserAvEnabled = st.userAvatar !== 'none';
    const isAgentAvEnabled = st.agentAvatar !== 'none';
    const hasCustomUserAv = Boolean(st.userAvatar && st.userAvatar !== 'none');
    const hasCustomAgentAv = Boolean(st.agentAvatar && st.agentAvatar !== 'none');
    const effUserAv = computeEffectiveUserAv(st);
    const effAgentAv = computeEffectiveAgentAv(st);

    const personaList = forge && Array.isArray(forge.PERSONA_LIST) ? forge.PERSONA_LIST : [activePersona];
    const activeChibiCharId = resolveActiveChibiCharId(st);
    const is3dModeOn = st.chibi3dEnabled !== false;
    const is2dLiveOn = st.chibi2dLive !== false;
    const glbApi = typeof window !== 'undefined' ? window.__AGY_KNY_CHIBI_3D__ : null;
    const glbInfo = (glbApi && typeof glbApi.getCustomGlbInfo === 'function')
      ? glbApi.getCustomGlbInfo(activeChibiCharId)
      : { loaded: false, charId: activeChibiCharId };
    const glbStatusInitText = (glbInfo && glbInfo.loaded)
      ? (is3dModeOn
          ? `${tr('glbOk', 'Đã nạp mô hình 3D:')} ${glbInfo.fileName} (${glbInfo.vertexCount || 0}v)`
          : `Đã nạp ${glbInfo.fileName} (${glbInfo.vertexCount || 0}v) — đang hiển thị 2D gốc`)
      : (is3dModeOn
          ? `Chưa nạp tệp .glb/.vrm cho ${activeChibiCharId} — đang hiển thị ảnh Chibi 2D gốc`
          : `${tr('glbDef', 'Đang ở chế độ 2D (Ảnh gốc)')} (${activeChibiCharId})`);
    const multiversePresets = forge && Array.isArray(forge.MULTIVERSE_PRESETS) ? forge.MULTIVERSE_PRESETS : [];
    const fxModeOptions = forge && Array.isArray(forge.FX_MODE_OPTIONS)
      ? forge.FX_MODE_OPTIONS
      : [{ value: 'wisteria', label: '🦋 Tử Đằng Nguyệt Dạ' }];

    const esc = (v) => SEC.escapeHtml(v);
    const escMainPrimary = esc(safeMainPrimary);
    const escMainAccent = esc(safeMainAccent);
    const escMainBorder = esc(safeMainBorder);
    const escCardBg = esc(safeCardBg);

    container.style.setProperty('--agy-st-accent', safeMainPrimary);
    const summaryEl = document.getElementById('agy-studio-active-summary');
    if (summaryEl) {
      const pName = activePersona.shortLabel || activePersona.label || 'Yoriichi';
      summaryEl.textContent = tr('activeUsing', 'Đang dùng: {name}', { name: st.themeName });
      summaryEl.title = tr('activeSummaryTitle', 'Chủ đề nền: {name} • Bản ngã: {persona}', { name: st.themeName, persona: pName });
    }
    const wsEntries = Object.entries(st.workspaceProfiles || {});
    const inputI18nKeys = {
      sync: ['in_sync_l', 'in_sync_d'],
      double_gold: ['in_gold_l', 'in_gold_d'],
      glass: ['in_glass_l', 'in_glass_d'],
      minimal: ['in_min_l', 'in_min_d']
    };

    let savedFocusSelector = '';
    try {
      const ae = typeof document !== 'undefined' ? document.activeElement : null;
      if (ae && container.contains(ae)) {
        if (ae.id) {
          savedFocusSelector = '#' + ae.id;
        } else if (ae.getAttribute('data-ai-persona-mode')) {
          savedFocusSelector = `.agy-ai-persona-mode-btn[data-ai-persona-mode="${ae.getAttribute('data-ai-persona-mode')}"]`;
        } else if (ae.getAttribute('data-persona')) {
          savedFocusSelector = `.agy-persona-pill[data-persona="${ae.getAttribute('data-persona')}"]`;
        } else if (ae.getAttribute('data-tab')) {
          savedFocusSelector = `[data-tab="${ae.getAttribute('data-tab')}"]`;
        }
      }
    } catch (_) {}

    container.innerHTML = `
      <div id="agy-studio-tablist" role="tablist" aria-label="${esc(tr('tablistAria', 'Phân mục tùy biến giao diện'))}">
        ${STUDIO_TABS.map((tab) => {
          const isAct = tab.id === modalActiveTab;
          const tabLbl = tr(`tab_${tab.id}`, tab.label);
          const countPill = tab.id === 'themes'
            ? `<span class="agy-studio-tabular" style="font-size: 11px; padding: 1px 6px; border-radius: 999px; background: rgba(255,255,255,0.09); color: #cbd5e1;">${THEME_KEYS.length}</span>`
            : '';
          return `
            <button
              type="button"
              role="tab"
              id="agy-tab-${esc(tab.id)}"
              class="agy-studio-tab"
              data-tab="${esc(tab.id)}"
              aria-selected="${isAct ? 'true' : 'false'}"
              aria-controls="agy-tabpanel-${esc(tab.id)}"
              tabindex="${isAct ? '0' : '-1'}"
            >
              ${tab.icon}
              <span>${esc(tabLbl)}</span>
              ${countPill}
            </button>
          `;
        }).join('')}
      </div>

      <div id="agy-theme-scroll-container" style="flex: 1; min-height: 0; padding: 22px 26px 36px 26px; overflow-y: auto; overscroll-behavior: contain; color: #f4f4f5;">
        <!-- TAB 1: BỘ SƯU TẬP CHỦ ĐỀ -->
        <section
          role="tabpanel"
          id="agy-tabpanel-themes"
          class="agy-studio-tabpanel"
          data-tabpanel="themes"
          aria-labelledby="agy-tab-themes"
          style="display: ${modalActiveTab === 'themes' ? 'flex' : 'none'}; flex-direction: column; gap: 16px; max-width: 880px; margin: 0 auto;"
        >
          <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size: 15px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('galH', 'Bộ Sưu Tập Chủ Đề ({n})', { n: THEME_KEYS.length }))}</div>
              <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('galD', 'Chọn nhanh chủ đề Thanh Gươm Diệt Quỷ & Đa Vũ Trụ OKLCH chuẩn tương phản đọc code WCAG AA.'))}</div>
            </div>
            <div id="agy-preset-filter-bar" role="group" aria-label="${esc(tr('fltA', 'Lọc nhóm chủ đề'))}" style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button type="button" class="agy-filter-chip agy-studio-tabular" data-filter="all" style="padding: 5px 11px; border-radius: 999px; border: 1px solid ${escMainPrimary}; background: rgba(255,255,255,0.13); color: #fff; font-size: 12px; font-weight: 600; cursor: pointer;">${esc(tr('fltAll', 'Tất cả ({n})', { n: THEME_KEYS.length }))}</button>
              <button type="button" class="agy-filter-chip" data-filter="royal" style="padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(250,204,21,0.42); background: rgba(250,204,21,0.10); color: #fef08a; font-size: 12px; font-weight: 600; cursor: pointer;">${esc(tr('fltRoy', '👑 Chúa Công'))}</button>
              <button type="button" class="agy-filter-chip agy-studio-tabular" data-filter="hashira" style="padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 12px; cursor: pointer;">${esc(tr('fltHas', '⚔️ Cửu Trụ (9)'))}</button>
              <button type="button" class="agy-filter-chip" data-filter="kamaboko" style="padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 12px; cursor: pointer;">${esc(tr('fltKam', '🔥 Nhân Vật Chính'))}</button>
              <button type="button" class="agy-filter-chip" data-filter="forged" style="padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(192,132,252,0.40); background: rgba(168,85,247,0.11); color: #e9d5ff; font-size: 12px; cursor: pointer;">${esc(tr('fltFrg', '🌌 Đa Vũ Trụ / Rèn AI'))}</button>
              <button type="button" class="agy-filter-chip" data-filter="classic" style="padding: 5px 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 12px; cursor: pointer;">${esc(tr('fltCls', '✨ Khác'))}</button>
            </div>
          </div>

          <div class="agy-modal-grid-2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
            ${THEME_KEYS.map(name => {
              const th = THEMES[name] || {};
              const safeNameHtml = SEC.escapeHtml(name);
              const isSelected = name === st.themeName;
              const isRoyal = th.fxMode === 'royal_wisteria' || th.fxMode === 'wisteria_royal' || /Chúa Công|Ubuyashiki/i.test(name);
              const isForged = Boolean(th.isForged);
              const groupTag = isForged
                ? 'forged'
                : (isRoyal ? 'royal' : (/Trụ|Shinobu/i.test(name) ? 'hashira' : (/(Tanjiro|Nezuko|Zenitsu|Inosuke)/i.test(name) ? 'kamaboko' : 'classic')));
              const safeWpUrl = SEC.sanitizeCssUrl(th.wallpaper || '');
              const thumbBg = safeWpUrl
                ? `linear-gradient(180deg, rgba(0,0,0,0.08), rgba(10,12,20,0.88)), url(&quot;${esc(safeWpUrl)}&quot;)`
                : esc(SEC.sanitizeCssValue(th.pureBg || th.bg, '#11131c'));
              const safeBgPos = esc(SEC.sanitizeCssValue(th.bgPosition, 'center'));
              const safeStickerUrl = SEC.sanitizeCssUrl(th.sticker || '');
              const thumbOrnamentStyle = th.isChibiNpc
                ? 'right: 8px; bottom: 0px; width: 92px; height: 45px; background-position: bottom right;'
                : (th.isOrnament
                  ? 'right: 10px; bottom: 8px; width: 76px; height: 24px; background-position: center;'
                  : 'right: 12px; bottom: 4px; width: 42px; height: 38px; background-position: bottom center;');
              const borderStyle = isSelected
                ? (isRoyal ? '1.8px solid #facc15' : '1.5px solid #f8fafc')
                : (isRoyal ? '1.2px solid rgba(250, 204, 21, 0.50)' : '1px solid rgba(255, 255, 255, 0.11)');
              const cardShadow = isRoyal ? 'box-shadow: 0 6px 20px rgba(250, 204, 21, 0.15), inset 0 1px 0 rgba(254, 240, 138, 0.20);' : '';
              return `
                <div class="agy-preset-card" tabindex="0" role="button" aria-pressed="${isSelected ? 'true' : 'false'}" data-name="${safeNameHtml}" data-group="${SEC.escapeHtml(groupTag)}" style="border-radius: 12px; border: ${borderStyle}; background: ${isRoyal ? 'linear-gradient(145deg, rgba(30, 18, 50, 0.92), rgba(16, 12, 30, 0.94))' : 'rgba(17, 20, 29, 0.88)'}; ${cardShadow} overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div style="height: 80px; width: 100%; background-image: ${thumbBg}; background-size: cover; background-position: ${safeBgPos}; position: relative; display: flex; align-items: flex-end; padding: 8px 14px;">
                    ${isRoyal ? `<span style="position:absolute; top:7px; left:10px; padding:2px 8px; border-radius:999px; background:linear-gradient(90deg, rgba(250,204,21,0.92), rgba(232,121,249,0.88)); color:#180d2c; font-size:10px; font-weight:800; letter-spacing:0.2px;">${esc(tr('bdgSp', '★ ĐẶC BIỆT'))}</span>` : (isForged ? `<span style="position:absolute; top:7px; left:10px; padding:2px 8px; border-radius:999px; background:rgba(168,85,247,0.85); color:#fff; font-size:10px; font-weight:700;">⚒️ OKLCH</span>` : '')}
                    ${safeStickerUrl ? `<div style="position: absolute; ${thumbOrnamentStyle} background-image: url(&quot;${esc(safeStickerUrl)}&quot;); background-size: contain; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                    <span style="font-size: 13.5px; font-weight: 600; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.92); padding-right: 78px;">${safeNameHtml}</span>
                  </div>
                  <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0;">
                    <span style="font-size: 12px; color: ${isRoyal ? '#fef08a' : '#94a3b8'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${SEC.escapeHtml(th.concept || '')}</span>
                    <div class="agy-card-check-slot" style="flex-shrink: 0;">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <!-- TAB 2: NHÂN VẬT & ẢNH ĐẠI DIỆN (CÓ CÔNG TẮC BẬT/TẮT HAI CHIỀU) -->
        <section
          role="tabpanel"
          id="agy-tabpanel-persona"
          class="agy-studio-tabpanel"
          data-tabpanel="persona"
          aria-labelledby="agy-tab-persona"
          style="display: ${modalActiveTab === 'persona' ? 'flex' : 'none'}; flex-direction: column; gap: 18px; max-width: 880px; margin: 0 auto;"
        >
          <div class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
              <div style="flex: 1; min-width: 240px;">
                <div style="font-size: 14.5px; font-weight: 600; color: #fef08a; margin-bottom: 3px;">${esc(tr('perH', '👑 Bản Ngã Chủ Nhân (Độc lập khỏi chủ đề nền)'))}</div>
                <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('perD', 'Chọn danh xưng, Hơi Thở 3D và huy hiệu đại diện riêng mà không làm đổi hình nền hiện tại.'))}</div>
              </div>
              <label style="display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: #94a3b8;">
                <span>${esc(tr('perSel', 'Chọn nhân vật hóa thân'))}</span>
                <select id="agy-persona-select" aria-label="${esc(tr('perSel', 'Chọn Bản Ngã Chủ Nhân'))}" style="height: 36px; padding: 0 12px; border-radius: 8px; background: #111520; color: #f8fafc; border: 1px solid ${escMainPrimary}; font-size: 13px; font-weight: 600; cursor: pointer; min-width: 260px;">
                  ${personaList.map((p) => {
                    const sel = p.id === st.masterPersona ? 'selected' : '';
                    return `<option value="${SEC.escapeHtml(p.id)}" ${sel}>${SEC.escapeHtml(p.label)}</option>`;
                  }).join('')}
                </select>
              </label>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.07);">
              ${personaList.slice(0, 10).map((p) => {
                const isAct = p.id === st.masterPersona;
                const pAv = SEC.sanitizeCssUrl(p.userAvatar || '');
                const pRing = esc(SEC.sanitizeCssValue(p.ringColor, '#fde047'));
                return `
                  <button type="button" class="agy-persona-pill" data-persona="${SEC.escapeHtml(p.id)}" aria-pressed="${isAct ? 'true' : 'false'}" style="display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px 5px 6px; border-radius: 999px; border: 1px solid ${isAct ? pRing : 'rgba(255,255,255,0.13)'}; background: ${isAct ? 'rgba(250, 204, 21, 0.15)' : 'rgba(255,255,255,0.04)'}; color: #f8fafc; font-size: 12px; font-weight: ${isAct ? '600' : '500'}; cursor: pointer; transition: background-color 0.15s ease, border-color 0.15s ease;">
                    <span style="width: 22px; height: 22px; border-radius: 50%; border: 1px solid ${pRing}; background: rgba(0,0,0,0.45) ${pAv ? `url(&quot;${esc(pAv)}&quot;) center/cover no-repeat` : ''}; flex-shrink: 0;"></span>
                    <span>${SEC.escapeHtml(p.shortLabel || p.label)}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; flex-direction: column; gap: 16px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('avH', 'Icon & Ảnh Đại Diện Hội Thoại'))}</div>
              <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('avD', 'Bật hoặc tắt trực tiếp icon đại diện cạnh tin nhắn của bạn và Trợ lý AI, hoặc tải ảnh riêng (≤ 15 MB, tự nén WebP).'))}</div>
            </div>

            <div class="agy-modal-grid-2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;">
              <!-- Card 1: Icon Người Dùng -->
              <div style="border-radius: 11px; border: 1px solid rgba(255,255,255,0.10); background: rgba(11, 14, 22, 0.65); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                  <div style="display: flex; align-items: center; gap: 11px; min-width: 0;">
                    <div id="agy-user-av-preview" style="width: 42px; height: 42px; flex-shrink: 0; border-radius: ${st.avatarRadius}%; border: 1.8px solid ${escMainPrimary}; background: rgba(255,255,255,0.06) ${effUserAv ? `url(&quot;${esc(effUserAv)}&quot;) center/cover no-repeat` : ''}; opacity: ${isUserAvEnabled ? '1' : '0.42'}; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 600; color: #94a3b8; transition: opacity 0.15s ease;">${isUserAvEnabled ? (effUserAv ? '' : 'B') : esc(tr('avOff', 'Ẩn'))}</div>
                    <div style="min-width: 0;">
                      <div style="font-size: 13.5px; font-weight: 600; color: #f8fafc;">${esc(tr('avUsr', 'Icon Người Dùng'))}</div>
                      <div id="agy-user-av-substatus" style="font-size: 11.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(!isUserAvEnabled ? tr('avHid', 'Đang ẩn khỏi khung hội thoại') : (hasCustomUserAv ? tr('avCus', 'Đang dùng ảnh tải riêng') : tr('avPer', 'Theo Bản Ngã / Chủ đề')))}</div>
                    </div>
                  </div>
                  <button
                    id="agy-user-av-clear"
                    type="button"
                    role="switch"
                    aria-checked="${isUserAvEnabled ? 'true' : 'false'}"
                    aria-label="${esc(tr('avUsr', 'Bật hoặc tắt icon người dùng'))}"
                    title="${isUserAvEnabled ? 'Đang bật icon người dùng — bấm để tắt' : 'Đang tắt icon người dùng — bấm để bật lại'}"
                    class="agy-av-switch"
                  >
                    <span class="agy-av-switch-track" aria-hidden="true"><span class="agy-av-switch-thumb"></span></span>
                    <span class="agy-av-switch-label">${esc(isUserAvEnabled ? tr('switchOn', 'Đang bật') : tr('switchOff', 'Đang tắt'))}</span>
                  </button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <label class="agy-studio-btn-label">
                    <span>${esc(tr('upUsr', 'Tải ảnh người dùng'))}</span>
                    <input id="agy-user-av-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
                  </label>
                  <button id="agy-user-av-reset-default" type="button" class="agy-studio-btn" style="display: ${hasCustomUserAv ? 'inline-flex' : 'none'}; font-size: 12px; color: #cbd5e1;">${esc(tr('useDef', 'Dùng mặc định'))}</button>
                </div>
              </div>

              <!-- Card 2: Icon Trợ Lý AI -->
              <div style="border-radius: 11px; border: 1px solid rgba(255,255,255,0.10); background: rgba(11, 14, 22, 0.65); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                  <div style="display: flex; align-items: center; gap: 11px; min-width: 0;">
                    <div id="agy-agent-av-preview" style="width: 42px; height: 42px; flex-shrink: 0; border-radius: ${st.avatarRadius}%; border: 1.8px solid ${escMainAccent}; background: rgba(255,255,255,0.06) ${effAgentAv ? `url(&quot;${esc(effAgentAv)}&quot;) center/cover no-repeat` : ''}; opacity: ${isAgentAvEnabled ? '1' : '0.42'}; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 600; color: #94a3b8; transition: opacity 0.15s ease;">${isAgentAvEnabled ? (effAgentAv ? '' : 'AI') : esc(tr('avOff', 'Ẩn'))}</div>
                    <div style="min-width: 0;">
                      <div style="font-size: 13.5px; font-weight: 600; color: #f8fafc;">${esc(tr('avAi', 'Icon Trợ Lý AI'))}</div>
                      <div id="agy-agent-av-substatus" style="font-size: 11.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(!isAgentAvEnabled ? tr('avHid', 'Đang ẩn khỏi khung hội thoại') : (hasCustomAgentAv ? tr('avCus', 'Đang dùng ảnh tải riêng') : tr('avThm', 'Theo Chủ đề đang bật')))}</div>
                    </div>
                  </div>
                  <button
                    id="agy-agent-av-clear"
                    type="button"
                    role="switch"
                    aria-checked="${isAgentAvEnabled ? 'true' : 'false'}"
                    aria-label="${esc(tr('avAi', 'Bật hoặc tắt icon trợ lý AI'))}"
                    title="${isAgentAvEnabled ? 'Đang bật icon trợ lý AI — bấm để tắt' : 'Đang tắt icon trợ lý AI — bấm để bật lại'}"
                    class="agy-av-switch"
                  >
                    <span class="agy-av-switch-track" aria-hidden="true"><span class="agy-av-switch-thumb"></span></span>
                    <span class="agy-av-switch-label">${esc(isAgentAvEnabled ? tr('switchOn', 'Đang bật') : tr('switchOff', 'Đang tắt'))}</span>
                  </button>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <label class="agy-studio-btn-label">
                    <span>${esc(tr('upAi', 'Tải ảnh trợ lý AI'))}</span>
                    <input id="agy-agent-av-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
                  </label>
                  <button id="agy-agent-av-reset-default" type="button" class="agy-studio-btn" style="display: ${hasCustomAgentAv ? 'inline-flex' : 'none'}; font-size: 12px; color: #cbd5e1;">${esc(tr('useDef', 'Dùng mặc định'))}</button>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.07);">
              <label style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #cbd5e1;">
                <span>${esc(tr('avSz', 'Kích thước icon'))}</span>
                <input id="agy-av-size" type="range" min="22" max="52" value="${st.avatarSize}" style="width: 120px; cursor: pointer; accent-color: ${escMainPrimary}; height: 5px;" />
                <span id="agy-av-size-val" class="agy-studio-tabular" style="min-width: 38px; color: #f8fafc; font-weight: 600;">${st.avatarSize}px</span>
              </label>
              <label style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #cbd5e1;">
                <span>${esc(tr('avRd', 'Độ bo góc'))}</span>
                <input id="agy-av-rad" type="range" min="0" max="50" value="${st.avatarRadius}" style="width: 120px; cursor: pointer; accent-color: ${escMainPrimary}; height: 5px;" />
                <span id="agy-av-rad-val" class="agy-studio-tabular" style="min-width: 38px; color: #f8fafc; font-weight: 600;">${st.avatarRadius}%</span>
              </label>
            </div>
          </div>

          <div class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; flex-direction: column; gap: 12px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('layH', 'Tách Lớp Nhân Vật Chibi & Tuyệt Kỹ Tự Động'))}</div>
              <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('layD', 'Tắt riêng nhân vật Chibi trên khung chat mà vẫn giữ nguyên khung viền Hoàng Kim, hoặc tắt tự động xuất chiêu khi xong lệnh.'))}</div>
            </div>
            <div class="agy-modal-grid-2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
              <label style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px; background: rgba(11,14,22,0.62); border: 1px solid rgba(255,255,255,0.09); font-size: 12.5px; color: #f1f5f9; cursor: pointer;">
                <span>${esc(tr('chbTg', 'Hiện nhân vật Chibi & Hộp thoại NPC'))}</span>
                <input id="agy-chibi-toggle" type="checkbox" ${st.chibiEnabled !== false ? 'checked' : ''} style="accent-color: ${escMainPrimary}; cursor: pointer; width: 16px; height: 16px;" />
              </label>
              <label style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px; background: rgba(11,14,22,0.62); border: 1px solid rgba(255,255,255,0.09); font-size: 12.5px; color: #f1f5f9; cursor: pointer;">
                <span>${esc(tr('finTg', 'Tự tung chiêu Trảm Quỷ (tự nhường khi gõ code)'))}</span>
                <input id="agy-autofinisher-toggle" type="checkbox" ${st.autoFinisher !== false ? 'checked' : ''} style="accent-color: ${escMainPrimary}; cursor: pointer; width: 16px; height: 16px;" />
              </label>
              <div style="display: flex; flex-direction: column; gap: 8px; padding: 11px 14px; border-radius: 10px; background: rgba(11,14,22,0.62); border: 1px solid rgba(255,255,255,0.09); grid-column: 1 / -1;">
                <label style="display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12.5px; color: #f1f5f9; cursor: pointer;">
                  <span>${esc(tr('chb3dTg', 'Nhân vật Chibi 3D tương tác (.glb / .vrm)'))}</span>
                  <input id="agy-chibi-3d-toggle" type="checkbox" ${is3dModeOn ? 'checked' : ''} style="accent-color: ${escMainPrimary}; cursor: pointer; width: 16px; height: 16px;" />
                </label>
                <div role="group" aria-label="${esc(tr('chb3dTg', 'Chế độ hiển thị Chibi 2D hoặc 3D'))}" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
                  <button id="agy-chibi-mode-2d" type="button" data-chibi-mode="2d" aria-pressed="${!is3dModeOn ? 'true' : 'false'}" style="padding: 8px 10px; border-radius: 8px; font-size: 12px; font-weight: ${!is3dModeOn ? '700' : '500'}; color: ${!is3dModeOn ? '#f8fafc' : '#cbd5e1'}; background: ${!is3dModeOn ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${!is3dModeOn ? escMainPrimary : 'rgba(255,255,255,0.14)'}; cursor: pointer;">${esc(tr('chb2dM', 'Chế độ 2D (Ảnh gốc)'))}</button>
                  <button id="agy-chibi-mode-3d" type="button" data-chibi-mode="3d" aria-pressed="${is3dModeOn ? 'true' : 'false'}" style="padding: 8px 10px; border-radius: 8px; font-size: 12px; font-weight: ${is3dModeOn ? '700' : '500'}; color: ${is3dModeOn ? '#f8fafc' : '#cbd5e1'}; background: ${is3dModeOn ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${is3dModeOn ? escMainPrimary : 'rgba(255,255,255,0.14)'}; cursor: pointer;">${esc(tr('chb3dM', 'Chế độ 3D (.glb / .vrm)'))}</button>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px; padding: 11px 14px; border-radius: 10px; background: rgba(11,14,22,0.62); border: 1px solid rgba(255,255,255,0.09); grid-column: 1 / -1;">
                <label style="display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12.5px; color: #f1f5f9; cursor: pointer;">
                  <span>✨ ${esc(tr('l2dTg', 'Chibi 2D Sống Động (Live2D-lite: nhịp thở, theo chuột & phản ứng code)'))}</span>
                  <input id="agy-chibi-2d-live-toggle" type="checkbox" ${is2dLiveOn ? 'checked' : ''} style="accent-color: ${escMainPrimary}; cursor: pointer; width: 16px; height: 16px;" />
                </label>
                <div role="group" aria-label="Xem thử phản ứng Chibi 2D Sống Động" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px;">
                  <button id="agy-l2d-preview-happy" type="button" data-l2d-react="happy" style="padding: 6px 8px; border-radius: 8px; font-size: 11.5px; font-weight: 600; color: #f8fafc; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); cursor: pointer;">✨ Vui vẻ</button>
                  <button id="agy-l2d-preview-thinking" type="button" data-l2d-react="thinking" style="padding: 6px 8px; border-radius: 8px; font-size: 11.5px; font-weight: 600; color: #f8fafc; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); cursor: pointer;">💭 AI suy luận</button>
                  <button id="agy-l2d-preview-typing" type="button" data-l2d-react="combo" style="padding: 6px 8px; border-radius: 8px; font-size: 11.5px; font-weight: 600; color: #f8fafc; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); cursor: pointer;">⌨️ Gõ Combo</button>
                  <button id="agy-l2d-preview-victory" type="button" data-l2d-react="victory" style="padding: 6px 8px; border-radius: 8px; font-size: 11.5px; font-weight: 600; color: #f8fafc; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); cursor: pointer;">🏆 Test PASS</button>
                </div>
                <div id="agy-l2d-preview-status" style="font-size: 11.5px; color: #94a3b8;">${is2dLiveOn ? 'Đang bật: Chibi 2D tự hít thở êm ái, nghiêng nhẹ theo con trỏ chuột và đổi biểu cảm theo trạng thái làm việc.' : 'Đang tắt: Hiển thị ảnh Chibi 2D tĩnh nguyên bản.'}</div>
              </div>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px; border-radius: 10px; background: rgba(11,14,22,0.62); border: 1px solid rgba(255,255,255,0.09);">
              <div style="min-width: 190px; flex: 1;">
                <div style="font-size: 12.5px; font-weight: 600; color: #f1f5f9; margin-bottom: 2px;">${esc(tr('glbH', 'Mô hình 3D (.glb / .vrm) tùy chỉnh cho nhân vật'))}</div>
                <div id="agy-chibi-glb-status" style="font-size: 11.5px; color: #94a3b8;">${esc(glbStatusInitText)}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input id="agy-chibi-glb-input" type="file" accept=".glb,.vrm" style="display: none;" />
                <button id="agy-chibi-glb-upload" type="button" style="padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,0.09); border: 1px solid ${escMainPrimary}; color: #f8fafc; font-size: 12px; font-weight: 600; cursor: pointer;">${esc(tr('glbUp', 'Nạp tệp .glb / .vrm'))}</button>
                <button id="agy-chibi-glb-reset" type="button" style="padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.16); color: #cbd5e1; font-size: 12px; cursor: pointer;">${esc(tr('glbRst', 'Xóa 3D (Dùng ảnh 2D gốc)'))}</button>
              </div>
            </div>
          </div>

          <div class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; flex-direction: column; gap: 12px;">
            <div>
              <div id="agy-ai-persona-group-lbl" style="font-size: 14.5px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('aiTH', '🗣️ Khí Chất & Tính Cách Trợ Lý AI (Đồng bộ theo Chủ đề)'))}</div>
              <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('aiTD', 'Tự động đổi giọng trả lời AI theo Trụ đang chọn (tự khóa về thuần kỹ thuật khi bật Tập trung sâu hoặc Khiên Che Mật Alt+Shift+P).'))}</div>
            </div>
            <div role="group" aria-labelledby="agy-ai-persona-group-lbl" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px;">
              ${[
                { id: 'off', key: 'aiT0', vi: '🔇 Thuần kỹ thuật' },
                { id: 'subtle', key: 'aiT1', vi: '✨ Tinh tế (Khuyên dùng)' },
                { id: 'roleplay', key: 'aiT2', vi: '🎭 Nhập vai Trụ' }
              ].map((opt) => {
                const isSel = st.aiPersonaMode === opt.id;
                return `<button type="button" class="agy-ai-persona-mode-btn" data-ai-persona-mode="${opt.id}" aria-pressed="${isSel ? 'true' : 'false'}" style="padding: 10px 12px; border-radius: 10px; cursor: pointer; font-size: 12.5px; font-weight: ${isSel ? '600' : '500'}; color: ${isSel ? '#f8fafc' : '#cbd5e1'}; background: ${isSel ? 'rgba(255,255,255,0.14)' : 'rgba(11,14,22,0.62)'}; border: ${isSel ? '1.5px solid ' + escMainPrimary : '1px solid rgba(255,255,255,0.09)'}; transition: border-color 0.15s ease, background-color 0.15s ease;">${esc(tr(opt.key, opt.vi))}</button>`;
              }).join('')}
            </div>
            ${(st.focusMode || st.privacyShieldActive) && st.aiPersonaMode !== 'off'
              ? `<div id="agy-ai-persona-mute-banner" style="font-size: 12px; color: #fde047; background: rgba(250, 204, 21, 0.10); border: 1px solid rgba(250, 204, 21, 0.28); border-radius: 8px; padding: 7px 11px;">${esc(
                  st.privacyShieldActive
                    ? tr('aiMS', '🛡️ Khiên Che Mật (Alt+Shift+P) đang bật — giọng nhập vai tạm thời thu gọn về Thuần kỹ thuật (nhấn Alt+Shift+P để khôi phục).')
                    : tr('aiMF', '⚡ Chế độ Tập trung sâu đang bật — giọng nhập vai tạm thời thu gọn về Thuần kỹ thuật (chọn lại ✨ Tinh tế / 🎭 Nhập vai hoặc tắt Tập trung sâu để khôi phục).')
                )}</div>`
              : ''}
          </div>
        </section>

        <!-- TAB 3: TIN NHẮN & KHUNG SOẠN THẢO -->
        <section
          role="tabpanel"
          id="agy-tabpanel-chat"
          class="agy-studio-tabpanel"
          data-tabpanel="chat"
          aria-labelledby="agy-tab-chat"
          style="display: ${modalActiveTab === 'chat' ? 'flex' : 'none'}; flex-direction: column; gap: 22px; max-width: 880px; margin: 0 auto;"
        >
          <div>
            <div style="font-size: 15px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('cmpH', 'Kiểu Khung Soạn Thảo'))}</div>
            <div style="font-size: 12.5px; color: #94a3b8; margin-bottom: 12px;">${esc(tr('cmpD', 'Tùy biến giao diện khung nhập câu lệnh mà không ảnh hưởng phím tắt hay tệp đính kèm.'))}</div>
            <div class="agy-modal-grid-2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
              ${Object.entries(INPUT_STYLES).map(([key, item]) => {
                const isSelected = key === st.inputStyle;
                const i18nPair = inputI18nKeys[key] || [];
                const itemLbl = i18nPair[0] ? tr(i18nPair[0], item.label) : item.label;
                const itemDsc = i18nPair[1] ? tr(i18nPair[1], item.desc) : item.desc;
                const activeBubbleTh = THEMES[st.bubbleName] || mainTheme;
                const previewStickerStyle = activeBubbleTh.isOrnament
                  ? 'top: -12px; right: 10px; width: 72px; height: 22px; background-position: center;'
                  : 'top: -22px; right: 10px; width: 32px; height: 28px; background-position: bottom center;';
                const previewInnerBg = esc(SEC.sanitizeCssValue(
                  key === 'glass'
                    ? (activeBubbleTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
                    : (activeBubbleTh.inputCardBg || activeBubbleTh.composerBg || 'rgba(26, 18, 15, 0.92)'),
                  'rgba(26, 18, 15, 0.92)'
                ));
                const previewFrameBg = key === 'double_gold'
                  ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                  : esc(SEC.sanitizeCssValue(activeBubbleTh.frameBg, '#c084fc'));
                const previewStickerUrl = SEC.sanitizeCssUrl(activeBubbleTh.sticker || '');
                const previewPrimary = esc(SEC.sanitizeCssValue(activeBubbleTh.primary, '#c084fc'));
                return `
                  <div class="agy-input-card" tabindex="0" role="button" aria-pressed="${isSelected ? 'true' : 'false'}" data-style="${SEC.escapeHtml(key)}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f8fafc' : '1px solid rgba(255, 255, 255, 0.11)'}; background: ${isSelected ? 'rgba(36, 30, 46, 0.72)' : 'rgba(17, 20, 29, 0.84)'}; padding: 16px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                    <div class="agy-input-preview-outer" style="position: relative; margin-top: 8px; padding: 1.5px; border-radius: 10px; background: ${previewFrameBg};">
                      <div class="agy-input-preview-sticker" style="position: absolute; ${previewStickerStyle} ${previewStickerUrl ? `background-image: url(&quot;${esc(previewStickerUrl)}&quot;);` : ''} background-size: contain; background-repeat: no-repeat; display: ${key !== 'minimal' && previewStickerUrl ? 'block' : 'none'}; pointer-events: none;"></div>
                      <div class="agy-input-preview-inner" style="background: ${previewInnerBg}; border-radius: 9px; padding: 8px 12px; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center;">
                        <span>${esc(tr('cmpPh', 'Nhập yêu cầu của bạn, gõ @ để đính kèm…'))}</span>
                        <span class="agy-input-preview-turbo" style="color: ${previewPrimary}; font-size: 11px; font-weight: 600;">${esc(tr('cmpSd', 'Gửi'))}</span>
                      </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                      <div>
                        <div style="font-size: 13.5px; font-weight: 600; color: #f1f5f9;">${SEC.escapeHtml(itemLbl)}</div>
                        <div style="font-size: 11.5px; color: #94a3b8;">${SEC.escapeHtml(itemDsc)}</div>
                      </div>
                      <div class="agy-card-check-slot" style="flex-shrink: 0;">${isSelected ? CHECK_SVG : ''}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
              <div>
                <div style="font-size: 15px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('bubH', 'Khung Tin Nhắn Người Dùng'))}</div>
                <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('bubD', 'Phối riêng màu viền khung chat và độ bo góc độc lập với hình nền chính.'))}</div>
              </div>
              <label style="display: inline-flex; align-items: center; gap: 10px; padding: 6px 12px; border-radius: 9px; background: rgba(20,24,34,0.82); border: 1px solid rgba(255,255,255,0.11); font-size: 12.5px; color: #cbd5e1;">
                <span>${esc(tr('bubRd', 'Độ bo góc khung chat'))}</span>
                <input id="agy-bubble-rad-slider" type="range" min="6" max="22" value="${st.bubbleRadius}" style="width: 105px; cursor: pointer; accent-color: ${escMainPrimary}; height: 5px;" />
                <span id="agy-bubble-rad-val" class="agy-studio-tabular" style="min-width: 34px; font-weight: 600; color: #f8fafc;">${st.bubbleRadius}px</span>
              </label>
            </div>
            <div class="agy-modal-grid-2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
              ${THEME_KEYS.map(name => {
                const th = THEMES[name] || {};
                const safeNameHtml = SEC.escapeHtml(name);
                const isSelected = name === st.bubbleName;
                const rawTop = Number.isFinite(Number(th.stickerTop)) ? Number(th.stickerTop) : 0;
                const rawW = Number.isFinite(Number(th.stickerW)) ? Number(th.stickerW) : 0;
                const rawH = Number.isFinite(Number(th.stickerH)) ? Number(th.stickerH) : 0;
                const stickerTop = th.isOrnament ? Math.round(rawTop * 0.85) : Math.round(rawTop * 0.74);
                const stickerW = Math.round(rawW * 0.78);
                const stickerH = th.isOrnament ? Math.round(rawH * 0.8) : Math.round(rawH * 0.78);
                const safeThFrame = esc(SEC.sanitizeCssValue(th.frameBg, '#c084fc'));
                const safeThGlow = esc(SEC.sanitizeCssValue(th.glow, 'rgba(192,132,252,0.28)'));
                const safeThBg = esc(SEC.sanitizeCssValue(th.userBubble || th.bg, 'rgba(24,18,42,0.9)'));
                const safeThBorder = esc(SEC.sanitizeCssValue(th.innerBorder, '1px solid ' + SEC.sanitizeCssValue(th.borderColor, 'rgba(255,255,255,0.16)')));
                const safeThText = esc(SEC.sanitizeCssValue(th.textColor || th.textMain, '#f8fafc'));
                const safeStickerUrl = SEC.sanitizeCssUrl(th.sticker || '');
                return `
                  <div class="agy-bubble-card" tabindex="0" role="button" aria-pressed="${isSelected ? 'true' : 'false'}" data-name="${safeNameHtml}" style="position: relative; border-radius: 12px; border: ${isSelected ? '1.5px solid #f8fafc' : '1px solid rgba(255, 255, 255, 0.11)'}; background: ${isSelected ? 'rgba(36, 30, 46, 0.72)' : 'rgba(17, 20, 29, 0.84)'}; padding: 24px 18px 14px 18px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; min-height: 112px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                    <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-top: 6px; margin-bottom: 10px;">
                      <div style="position: relative; width: 192px; height: 46px; padding: 1.2px; border-radius: ${th.isScroll ? '6px' : '12px'}; background: ${safeThFrame}; box-shadow: 0 4px 14px rgba(0,0,0,0.45), 0 0 10px ${safeThGlow};">
                        <div style="position: relative; width: 100%; height: 100%; background: ${safeThBg}; border: ${safeThBorder}; border-radius: ${th.isScroll ? '4px' : '11px'}; display: flex; align-items: center; padding: 0 16px;">
                          ${safeStickerUrl ? `<div style="position: absolute; top: ${stickerTop}px; right: 8px; width: ${stickerW}px; height: ${stickerH}px; background-image: url(&quot;${esc(safeStickerUrl)}&quot;); background-size: contain; background-position: ${th.isOrnament ? 'center' : 'bottom center'}; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                          <span style="font-size: 13.5px; font-weight: 500; color: ${safeThText};">${esc(tr('hiPv', 'Xin chào ✨'))}</span>
                        </div>
                      </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0;">
                      <span style="font-size: 13.5px; font-weight: 500; color: #e4e4e7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeNameHtml}</span>
                      <div class="agy-card-check-slot" style="flex-shrink: 0;">${isSelected ? CHECK_SVG : ''}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </section>

        <!-- TAB 4: HÌNH NỀN & KÍNH MỜ -->
        <section
          role="tabpanel"
          id="agy-tabpanel-backdrop"
          class="agy-studio-tabpanel"
          data-tabpanel="backdrop"
          aria-labelledby="agy-tab-backdrop"
          style="display: ${modalActiveTab === 'backdrop' ? 'flex' : 'none'}; flex-direction: column; gap: 16px; max-width: 880px; margin: 0 auto;"
        >
          <div class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <div style="font-size: 14.5px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('bgH', 'Hình Nền & Kính Mờ Pre-Baked 120fps'))}</div>
                <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('bgD', 'Điều chỉnh độ phủ tối đọc code, độ mờ thanh bên L-Glass (0% GPU khi nghỉ) hoặc thay ảnh nền riêng.'))}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <label style="display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); font-size: 12.5px; font-weight: 500; color: #f1f5f9; cursor: pointer;">
                  <input id="agy-wp-toggle" type="checkbox" ${st.wpEnabled ? 'checked' : ''} style="accent-color: ${escMainPrimary}; cursor: pointer;" />
                  <span>${esc(tr('wpOn', 'Hiển thị hình nền'))}</span>
                </label>
                <label class="agy-studio-btn-label">
                  <span>${esc(tr('wpUp', 'Tải ảnh nền riêng'))}</span>
                  <input id="agy-wp-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
                </label>
              </div>
            </div>

            <div class="agy-modal-grid-2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.07);">
              <label style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 10px; background: rgba(11,14,22,0.60); border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #cbd5e1;">
                  <span>${esc(tr('dimL', 'Độ tối lớp nền đọc code'))}</span>
                  <span id="agy-dim-val" class="agy-studio-tabular" style="font-weight: 600; color: #f8fafc;">${st.dimming}%</span>
                </div>
                <input id="agy-dim-slider" type="range" min="15" max="92" value="${st.dimming}" style="width: 100%; cursor: pointer; accent-color: #ffffff; height: 5px;" />
              </label>

              <label style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 10px; background: rgba(11,14,22,0.60); border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #cbd5e1;">
                  <span>${esc(tr('blrL', 'Độ mờ kính L-Glass'))}</span>
                  <span id="agy-blur-val" class="agy-studio-tabular" style="font-weight: 600; color: #f8fafc;">${st.glassBlur}px</span>
                </div>
                <input id="agy-blur-slider" type="range" min="0" max="16" value="${st.glassBlur}" style="width: 100%; cursor: pointer; accent-color: ${escMainPrimary}; height: 5px;" />
              </label>

              <label style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 10px; background: rgba(11,14,22,0.60); border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #cbd5e1;">
                  <span>${esc(tr('fxdL', 'Mật độ hạt hiệu ứng nền (0% = tắt hẳn)'))}</span>
                  <span id="agy-fx-density-val" class="agy-studio-tabular" style="font-weight: 600; color: #f8fafc;">${st.fxDensity}%</span>
                </div>
                <input id="agy-fx-density-slider" type="range" min="0" max="100" step="5" value="${st.fxDensity}" style="width: 100%; cursor: pointer; accent-color: ${escMainPrimary}; height: 5px;" />
              </label>

              <label style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; background: rgba(11,14,22,0.60); border: 1px solid rgba(255,255,255,0.08); font-size: 12.5px; color: #cbd5e1; cursor: pointer;">
                <span>${esc(tr('ecoL', '🔋 Tự ngưng hạt khi Pin Laptop ≤ 30%'))}</span>
                <input id="agy-eco-battery-toggle" type="checkbox" ${st.ecoBattery !== false ? 'checked' : ''} style="accent-color: #10b981; cursor: pointer; width: 16px; height: 16px;" />
              </label>
            </div>
          </div>

          <div class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="flex: 1; min-width: 240px;">
              <div style="font-size: 14px; font-weight: 600; color: #fef08a; margin-bottom: 3px;">${esc(tr('twH', '👁️ Thế Giới Trong Suốt & Chế Độ Tập Trung Sâu'))}</div>
              <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('twD', 'Tự làm dịu hạt nền khi gõ liên tục, hoặc nhấn nút bên cạnh để kích hoạt nhanh cấu hình Tập Trung Sâu.'))}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button id="agy-focus-preset-btn" type="button" aria-pressed="${st.focusMode ? 'true' : 'false'}" class="agy-studio-btn" style="background: ${st.focusMode ? 'rgba(16, 185, 129, 0.22)' : 'rgba(56, 189, 248, 0.14)'}; border-color: ${st.focusMode ? 'rgba(16, 185, 129, 0.55)' : 'rgba(56, 189, 248, 0.40)'}; color: ${st.focusMode ? '#ecfdf5' : '#e0f2fe'}; font-weight: 600;">
                ${esc(st.focusMode ? '✓ ' : '')}${esc(tr('focB', '⚡ Bật chế độ Tập trung sâu'))}
              </button>
              <label style="display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 13px; border-radius: 999px; background: rgba(250, 204, 21, 0.10); border: 1px solid rgba(250, 204, 21, 0.35); font-size: 12.5px; color: #fef08a; font-weight: 600; cursor: pointer;">
                <input id="agy-tw-toggle" type="checkbox" ${st.transparentWorld ? 'checked' : ''} style="accent-color: #facc15; cursor: pointer;" />
                <span>${esc(tr('twC', 'Tự động làm dịu'))}</span>
              </label>
            </div>
          </div>
        </section>

        <!-- TAB 5: LÒ RÈN OKLCH, HỒ SƠ DỰ ÁN & QUẢN LÝ DỮ LIỆU -->
        <section
          role="tabpanel"
          id="agy-tabpanel-forge"
          class="agy-studio-tabpanel"
          data-tabpanel="forge"
          aria-labelledby="agy-tab-forge"
          style="display: ${modalActiveTab === 'forge' ? 'flex' : 'none'}; flex-direction: column; gap: 16px; max-width: 880px; margin: 0 auto;"
        >
          ${forge ? `
          <div style="border: 1px solid rgba(192, 132, 252, 0.38); background: linear-gradient(145deg, rgba(20, 14, 38, 0.90), rgba(12, 16, 28, 0.94)); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 13px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
              <div style="flex: 1; min-width: 240px;">
                <div style="font-size: 14.5px; font-weight: 700; color: #e9d5ff; margin-bottom: 3px;">${esc(tr('frgH', '⚒️ Lò Rèn Đa Vũ Trụ — Rèn Chủ Đề OKLCH & Gói .agytheme'))}</div>
                <div style="font-size: 12.5px; color: #cbd5e1;">${esc(tr('frgD', 'Thả ảnh 4K bất kỳ để trích xuất 14 biến màu kính mờ chuẩn tương phản WCAG AA, hoặc kích hoạt nhanh mẫu Đa Vũ Trụ.'))}</div>
              </div>
              <button id="agy-forge-export-pkg" type="button" class="agy-studio-btn" style="background: rgba(56, 189, 248, 0.14); border-color: rgba(56, 189, 248, 0.42); color: #e0f2fe; font-weight: 600;">
                ${esc(tr('expP', '📦 Xuất gói .agytheme'))}
              </button>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${multiversePresets.map((mp) => `
                <button type="button" class="agy-multiverse-preset-btn" data-mv-id="${SEC.escapeHtml(mp.id)}" style="height: 34px; padding: 0 12px; border-radius: 8px; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(192, 132, 252, 0.40); color: #f5d0fe; font-size: 12px; font-weight: 600; cursor: pointer;">
                  ${SEC.escapeHtml(mp.shortLabel)}
                </button>
              `).join('')}
              <label id="agy-forge-dropzone" style="flex: 1; min-width: 220px; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 6px 14px; border-radius: 8px; border: 1px dashed rgba(94, 234, 212, 0.52); background: rgba(15, 23, 42, 0.58); color: #99f6e4; font-size: 12px; font-weight: 500; text-align: center; cursor: pointer;">
                ${esc(tr('drpL', '🖼️ Thả hoặc chọn ảnh 4K để rèn bảng màu OKLCH…'))}
                <input id="agy-forge-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
              </label>
            </div>
            <div id="agy-forge-workbench" style="display: none; flex-direction: column; gap: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.10);">
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <input id="agy-forge-name" type="text" maxlength="60" autocomplete="off" placeholder="${esc(tr('frgN', 'Đặt tên Vũ Trụ mới…'))}" style="flex: 1; min-width: 180px; height: 34px; padding: 0 11px; border-radius: 8px; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 12.5px;" />
                <select id="agy-forge-fx" aria-label="Hiệu ứng hạt đi kèm" style="height: 34px; padding: 0 10px; border-radius: 8px; background: #111520; border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 12px;">
                  ${fxModeOptions.map((opt) => `<option value="${SEC.escapeHtml(opt.value)}">${SEC.escapeHtml(opt.label)}</option>`).join('')}
                </select>
                <button id="agy-forge-commit" type="button" style="height: 34px; padding: 0 14px; border-radius: 8px; background: linear-gradient(135deg, #a855f7, #38bdf8); border: none; color: #090d16; font-size: 12.5px; font-weight: 700; cursor: pointer;">
                  ${esc(tr('frgC', '⚡ Rèn & Kích Hoạt'))}
                </button>
              </div>
              <div id="agy-forge-swatches" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 11.5px; color: #cbd5e1;"></div>
            </div>
            <div id="agy-forge-status" role="status" aria-live="polite" style="font-size: 12px; color: #5eead4; display: none;"></div>
          </div>
          ` : ''}

          <div id="agy-ws-profiles-card" class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; flex-direction: column; gap: 12px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('wsH', '📁 Hồ Sơ Giao Diện Theo Dự Án (Workspace Profiles)'))}</div>
              <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('wsD', 'Gắn chủ đề và Bản Ngã riêng cho từng thư mục dự án — tự động chuyển đổi khi mở phiên làm việc mới.'))}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <input id="agy-ws-key-input" type="text" maxlength="64" autocomplete="off" value="${esc(st.activeWorkspace || '')}" placeholder="${esc(tr('wsPh', 'Tên thư mục hoặc khóa dự án (vd: my-app)…'))}" style="flex: 1; min-width: 220px; height: 34px; padding: 0 12px; border-radius: 8px; background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.16); color: #f8fafc; font-size: 12.5px;" />
              <button id="agy-ws-bind-btn" type="button" class="agy-studio-btn" style="height: 34px; background: rgba(16, 185, 129, 0.14); border-color: rgba(52, 211, 153, 0.40); color: #d1fae5; font-weight: 600;">
                ${esc(tr('wsBd', '📌 Gắn cấu hình hiện tại'))}
              </button>
            </div>
            <div id="agy-ws-list" style="display: flex; flex-direction: column; gap: 6px;">
              ${wsEntries.length === 0
                ? `<div style="font-size: 12px; color: #94a3b8; padding: 6px 2px;">${esc(tr('wsEm', 'Chưa có hồ sơ dự án nào được lưu.'))}</div>`
                : wsEntries.map(([wKey, prof]) => `
                  <div class="agy-ws-row" data-ws="${esc(wKey)}" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 9px; background: rgba(11, 14, 22, 0.62); border: 1px solid ${wKey === st.activeWorkspace ? escMainPrimary : 'rgba(255,255,255,0.08)'};">
                    <div style="min-width: 0; flex: 1;">
                      <span style="font-size: 12.5px; font-weight: 600; color: #f8fafc; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">${esc(wKey)}</span>
                      <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">${esc(prof.themeName)} • ${esc(prof.masterPersona)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                      <button type="button" class="agy-studio-btn agy-ws-apply-btn" data-ws="${esc(wKey)}" style="height: 28px; padding: 0 10px; font-size: 11.5px;">${esc(tr('wsAp', 'Áp dụng'))}</button>
                      <button type="button" class="agy-studio-btn agy-studio-btn-danger agy-ws-remove-btn" data-ws="${esc(wKey)}" style="height: 28px; padding: 0 10px; font-size: 11.5px;">${esc(tr('wsRm', 'Xóa'))}</button>
                    </div>
                  </div>
                `).join('')}
            </div>
          </div>

          <div class="agy-studio-surface" style="border-color: ${escMainBorder}; background: ${escCardBg}; display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <div style="font-size: 14.5px; font-weight: 600; color: #f8fafc; margin-bottom: 3px;">${esc(tr('bakH', 'Sao Lưu, Nhập Cấu Hình & Khôi Phục'))}</div>
                <div style="font-size: 12.5px; color: #94a3b8;">${esc(tr('bakD', 'Sao chép cấu hình JSON ra bộ nhớ tạm, nạp tệp .agytheme hoặc đặt lại toàn bộ về mặc định gốc.'))}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <button id="agy-export-btn" type="button" class="agy-studio-btn">${esc(tr('expJ', 'Xuất JSON'))}</button>
                <button id="agy-import-toggle" type="button" aria-expanded="false" aria-controls="agy-import-box" class="agy-studio-btn">${esc(tr('impJ', 'Nhập JSON / .agytheme'))}</button>
                <button id="agy-reset-btn" type="button" class="agy-studio-btn agy-studio-btn-danger">${esc(tr('rstD', 'Đặt lại mặc định'))}</button>
              </div>
            </div>

            <div id="agy-import-box" style="display: none; flex-direction: column; gap: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
              <textarea id="agy-import-text" rows="3" spellcheck="false" autocomplete="off" placeholder="Dán JSON cấu hình hoặc nội dung gói .agytheme (schema: agytheme/2.0) vào đây…" style="width: 100%; background: rgba(0,0,0,0.38); color: #f4f4f5; border: 1px solid ${escMainBorder}; border-radius: 8px; padding: 9px 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; resize: vertical;"></textarea>
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <label class="agy-studio-btn-label">
                  <span>${esc(tr('chsF', '📂 Chọn tệp .agytheme / .json'))}</span>
                  <input id="agy-import-file" type="file" accept=".agytheme,.json,application/json" style="display: none;" />
                </label>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span id="agy-import-msg" role="status" aria-live="polite" style="font-size: 12px; color: #fca5a5;"></span>
                  <button id="agy-import-apply" type="button" style="height: 32px; padding: 0 14px; border-radius: 8px; background: ${escMainPrimary}; color: #090d16; font-weight: 600; font-size: 12.5px; border: none; cursor: pointer;">${esc(tr('aplI', 'Nạp cấu hình'))}</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    // WAI-ARIA 1.2 Tablist switching & keyboard navigation (ArrowLeft, ArrowRight, Home, End)
    const tabButtons = Array.from(container.querySelectorAll('.agy-studio-tab'));
    const tabPanels = Array.from(container.querySelectorAll('.agy-studio-tabpanel'));
    const innerScroller = container.querySelector('#agy-theme-scroll-container');

    function activateStudioTab(nextId, moveFocus) {
      if (!STUDIO_TABS.some((t) => t.id === nextId)) return;
      modalActiveTab = nextId;
      tabButtons.forEach((btn) => {
        const match = btn.getAttribute('data-tab') === nextId;
        btn.setAttribute('aria-selected', match ? 'true' : 'false');
        btn.setAttribute('tabindex', match ? '0' : '-1');
        if (match && moveFocus && typeof btn.focus === 'function') {
          btn.focus();
        }
      });
      tabPanels.forEach((panel) => {
        const match = panel.getAttribute('data-tabpanel') === nextId;
        panel.style.display = match ? 'flex' : 'none';
      });
      if (innerScroller) {
        innerScroller.scrollTop = 0;
      }
    }

    tabButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        activateStudioTab(btn.getAttribute('data-tab'), false);
      });
      btn.addEventListener('keydown', (e) => {
        if (!e || !tabButtons.length) return;
        let nextIdx = -1;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabButtons.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = tabButtons.length - 1;
        if (nextIdx >= 0) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          activateStudioTab(tabButtons[nextIdx].getAttribute('data-tab'), true);
        }
      });
    });

    function updateInputPreviews(bName) {
      const activeTh = THEMES[bName] || THEMES[DEFAULT_THEME_KEY] || {};
      const safeFrame = SEC.sanitizeCssValue(activeTh.frameBg, '#c084fc');
      const safeGlass = SEC.sanitizeCssValue(activeTh.inputGlassBg, 'rgba(20, 15, 13, 0.45)');
      const safeCard = SEC.sanitizeCssValue(activeTh.inputCardBg || activeTh.composerBg, 'rgba(26, 18, 15, 0.92)');
      const safeSticker = SEC.sanitizeCssUrl(activeTh.sticker || '');
      const safePrim = SEC.sanitizeCssValue(activeTh.primary, '#c084fc');

      container.querySelectorAll('.agy-input-card').forEach(card => {
        const key = card.dataset.style;
        const outer = card.querySelector('.agy-input-preview-outer');
        if (outer) {
          outer.style.background = key === 'double_gold'
            ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
            : safeFrame;
        }
        const inner = card.querySelector('.agy-input-preview-inner');
        if (inner) {
          inner.style.background = key === 'glass' ? safeGlass : safeCard;
        }
        const sticker = card.querySelector('.agy-input-preview-sticker');
        if (sticker) {
          if (key !== 'minimal' && safeSticker) {
            sticker.style.display = 'block';
            sticker.style.backgroundImage = `url("${safeSticker}")`;
            if (activeTh.isOrnament) {
              sticker.style.top = '-12px';
              sticker.style.width = '72px';
              sticker.style.height = '22px';
              sticker.style.backgroundPosition = 'center';
            } else {
              sticker.style.top = '-22px';
              sticker.style.width = '32px';
              sticker.style.height = '28px';
              sticker.style.backgroundPosition = 'bottom center';
            }
          } else {
            sticker.style.display = 'none';
          }
        }
        const turbo = card.querySelector('.agy-input-preview-turbo');
        if (turbo) {
          turbo.style.color = safePrim;
        }
      });
    }

    const slider = container.querySelector('#agy-dim-slider');
    const valLabel = container.querySelector('#agy-dim-val');
    slider.addEventListener('input', (e) => {
      const v = clampInt(e.target.value, 15, 92, 69);
      valLabel.textContent = v + '%';
      applyTheme({ dimming: v });
    });

    const wpToggle = container.querySelector('#agy-wp-toggle');
    wpToggle.addEventListener('change', (e) => {
      applyTheme({ wpEnabled: e.target.checked });
    });

    const twToggle = container.querySelector('#agy-tw-toggle');
    if (twToggle) {
      twToggle.addEventListener('change', (e) => {
        applyTheme({ transparentWorld: e.target.checked });
      });
    }

    // Validated & compressed custom wallpaper upload (F-05: <= 15MB, PNG/JPEG/WebP/GIF, never passes raw untrusted data URL on decode error)
    const wpUpload = container.querySelector('#agy-wp-upload');
    wpUpload.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      compressWallpaperFile(file, (safeDataUrl) => {
        if (coreDestroyed) return;
        applyTheme({ customWp: safeDataUrl, wpEnabled: true });
        const toggle = container.querySelector('#agy-wp-toggle');
        if (toggle) toggle.checked = true;
      });
    });

    // Master Persona selector & quick pills
    const personaSelect = container.querySelector('#agy-persona-select');
    const applyMasterPersona = (pid) => {
      const cleanId = normalizeSafeMasterPersona(pid);
      // Clear manual userAvatar override if it was 'none' or empty so persona emblem shows immediately
      const nextOverrides = { masterPersona: cleanId };
      const curAv = safeLsGet(STORAGE_USER_AVATAR);
      if (!curAv || curAv === 'none') {
        nextOverrides.userAvatar = '';
      }
      applyTheme(nextOverrides);
      renderThemePanels(container);
    };
    if (personaSelect) {
      personaSelect.addEventListener('change', (e) => applyMasterPersona(e.target.value));
    }
    container.querySelectorAll('.agy-persona-pill').forEach((pill) => {
      pill.addEventListener('click', () => applyMasterPersona(pill.getAttribute('data-persona')));
    });

    // Multiverse AI Theme Forge handlers
    if (forge) {
      const forgeFile = container.querySelector('#agy-forge-file');
      const forgeDrop = container.querySelector('#agy-forge-dropzone');
      const forgeBench = container.querySelector('#agy-forge-workbench');
      const forgeName = container.querySelector('#agy-forge-name');
      const forgeFx = container.querySelector('#agy-forge-fx');
      const forgeCommit = container.querySelector('#agy-forge-commit');
      const forgeSwatches = container.querySelector('#agy-forge-swatches');
      const forgeStatus = container.querySelector('#agy-forge-status');
      const forgeExportBtn = container.querySelector('#agy-forge-export-pkg');

      const showForgeStatus = (msg, isError) => {
        if (!forgeStatus) return;
        forgeStatus.style.display = 'block';
        forgeStatus.style.color = isError ? '#fca5a5' : '#5eead4';
        forgeStatus.textContent = msg;
      };

      const renderSwatchesPreview = (themeObj) => {
        if (!forgeSwatches || !themeObj) return;
        const swatches = [
          { label: 'Màu chính', color: themeObj.primary },
          { label: 'Điểm nhấn', color: themeObj.accent },
          { label: 'Nền Code', color: themeObj.codeBg },
          { label: 'Chữ chính', color: themeObj.textMain },
          { label: 'Chữ phụ', color: themeObj.textMuted },
          { label: 'Nền nhãn', color: themeObj.pillBg }
        ];
        const swHtml = swatches.map((sw) => {
          const c = SEC.sanitizeCssValue(sw.color, '#1e293b');
          const escC = SEC.escapeHtml(c);
          return `<span title="${SEC.escapeHtml(sw.label)}: ${escC}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.14);"><i style="width:11px;height:11px;border-radius:3px;background:${escC};display:inline-block;"></i>${SEC.escapeHtml(sw.label)}</span>`;
        }).join('');
        const ratio = themeObj.wcagReport ? themeObj.wcagReport.textContrast : '12.0';
        forgeSwatches.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;">${swHtml}</div><span class="agy-studio-tabular" style="color:#fef08a;font-weight:600;">Chuẩn WCAG AA/AAA: ${SEC.escapeHtml(String(ratio))}:1 ✓</span>`;
      };

      // Restore workbench draft if user switched Master Persona mid-forge
      if (modalPendingForged && modalPendingForged.theme) {
        if (forgeBench) forgeBench.style.display = 'flex';
        if (forgeName) forgeName.value = modalPendingForgeName || modalPendingForged.suggestedName || '';
        if (forgeFx) forgeFx.value = modalPendingForgeFx || modalPendingForged.fxMode || 'wisteria';
        renderSwatchesPreview(modalPendingForged.theme);
      }

      if (forgeName) {
        forgeName.addEventListener('input', () => {
          modalPendingForgeName = forgeName.value;
        });
      }
      if (forgeFx) {
        forgeFx.addEventListener('change', () => {
          modalPendingForgeFx = forgeFx.value;
        });
      }

      const handleForgeFile = (file) => {
        if (!file) return;
        const activePersonaId = getState().masterPersona || 'yoriichi';
        showForgeStatus('⏳ Đang quét histogram 64×64 & giải phương trình màu OKLCH…', false);
        forge.forgeFromWallpaperFile(file, { personaId: activePersonaId }).then((res) => {
          if (coreDestroyed) return;
          modalPendingForged = res;
          modalPendingForgeName = res.suggestedName || '';
          modalPendingForgeFx = res.fxMode || 'wisteria';
          if (forgeBench) forgeBench.style.display = 'flex';
          if (forgeName) forgeName.value = modalPendingForgeName;
          if (forgeFx) forgeFx.value = modalPendingForgeFx;
          renderSwatchesPreview(res.theme);
          showForgeStatus('✨ Đã trích xuất đủ 14 biến màu kính mờ OKLCH đạt chuẩn tương phản đọc code WCAG AA!', false);
        }).catch((err) => {
          if (coreDestroyed) return;
          showForgeStatus('⚠️ ' + (err && err.message ? err.message : 'Không thể xử lý ảnh.'), true);
        });
      };

      if (forgeFile) {
        forgeFile.addEventListener('change', (e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          handleForgeFile(f);
        });
      }
      if (forgeDrop) {
        ['dragenter', 'dragover'].forEach((evt) => {
          forgeDrop.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            forgeDrop.style.borderColor = '#facc15';
          });
        });
        ['dragleave', 'drop'].forEach((evt) => {
          forgeDrop.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            forgeDrop.style.borderColor = 'rgba(94, 234, 212, 0.52)';
            if (evt === 'drop' && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleForgeFile(e.dataTransfer.files[0]);
            }
          });
        });
      }
      if (forgeCommit) {
        forgeCommit.addEventListener('click', () => {
          if (!modalPendingForged || !modalPendingForged.theme) return;
          const chosenName = (forgeName && forgeName.value.trim()) || modalPendingForged.suggestedName || '⚒️ Vũ Trụ Mới';
          const chosenFx = (forgeFx && forgeFx.value) || modalPendingForged.fxMode || 'wisteria';
          if (typeof forge.applyCompanionForFxMode === 'function') {
            forge.applyCompanionForFxMode(modalPendingForged.theme, chosenFx);
          } else {
            modalPendingForged.theme.fxMode = chosenFx;
          }
          const saved = forge.registerThemeIntoRegistry(THEMES, THEME_KEYS, chosenName, modalPendingForged.theme);
          if (saved) {
            modalPendingForged = null;
            modalPendingForgeName = '';
            modalPendingForgeFx = '';
            const badgeEl = document.getElementById('agy-custom-theme-badge');
            if (badgeEl) badgeEl.textContent = `${THEME_KEYS.length} Chủ đề`;
            applyTheme({
              themeName: saved.name,
              bubbleName: saved.name,
              dimming: saved.theme.defaultDimming || 28,
              customWp: '',
              wpEnabled: true
            });
            renderThemePanels(container);
            if (saved.quotaExceeded) {
              const nextStatusEl = container.querySelector('#agy-forge-status');
              if (nextStatusEl) {
                nextStatusEl.style.display = 'block';
                nextStatusEl.style.color = '#fde047';
                nextStatusEl.textContent = '⚠️ Bộ nhớ trình duyệt đã đầy — Chủ đề mới đã được kích hoạt và đồng bộ trực tiếp vào cấu hình chính.';
              }
            }
          } else {
            showForgeStatus('⚠️ Tên giao diện không hợp lệ vì lý do bảo mật.', true);
          }
        });
      }
      container.querySelectorAll('.agy-multiverse-preset-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mvId = btn.getAttribute('data-mv-id');
          const preset = multiversePresets.find((p) => p.id === mvId);
          if (!preset) return;
          const built = preset.build();
          const saved = forge.registerThemeIntoRegistry(THEMES, THEME_KEYS, preset.name, built);
          if (saved) {
            const badgeEl = document.getElementById('agy-custom-theme-badge');
            if (badgeEl) badgeEl.textContent = `${THEME_KEYS.length} Chủ đề`;
            applyTheme({
              themeName: saved.name,
              bubbleName: saved.name,
              masterPersona: normalizeSafeMasterPersona(preset.personaId || st.masterPersona),
              dimming: saved.theme.defaultDimming || 25,
              customWp: '',
              wpEnabled: true
            });
            renderThemePanels(container);
          }
        });
      });
      if (forgeExportBtn) {
        forgeExportBtn.addEventListener('click', () => {
          const curState = getState();
          const curTheme = THEMES[curState.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
          const pkg = forge.buildAgyThemePackage(curState.themeName, curTheme, curState);
          forge.downloadAgyThemeFile(pkg);
          showForgeStatus(`📦 Đã xuất gói "${curState.themeName}.agytheme" (schema: agytheme/2.0)!`, false);
        });
      }
    }

    const userAvUpload = container.querySelector('#agy-user-av-upload');
    const userAvPreview = container.querySelector('#agy-user-av-preview');
    const userAvClear = container.querySelector('#agy-user-av-clear');
    const userAvSubstatus = container.querySelector('#agy-user-av-substatus');
    const userAvResetDef = container.querySelector('#agy-user-av-reset-default');
    const agentAvUpload = container.querySelector('#agy-agent-av-upload');
    const agentAvPreview = container.querySelector('#agy-agent-av-preview');
    const agentAvClear = container.querySelector('#agy-agent-av-clear');
    const agentAvSubstatus = container.querySelector('#agy-agent-av-substatus');
    const agentAvResetDef = container.querySelector('#agy-agent-av-reset-default');

    function syncAvPreview(el, url, fallbackText, enabled = true) {
      if (!el) return;
      if (!enabled) {
        el.style.backgroundImage = 'none';
        el.style.opacity = '0.42';
        el.textContent = 'Ẩn';
        return;
      }
      el.style.opacity = '1';
      const safeUrl = safeCssUrl(url || '');
      if (safeUrl) {
        el.style.backgroundImage = `url("${safeUrl}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      } else {
        el.style.backgroundImage = 'none';
        el.textContent = fallbackText;
      }
    }

    function syncAvSwitchUi(switchBtn, subEl, resetDefBtn, enabled, hasCustom, defaultDesc, entityLabel) {
      if (switchBtn) {
        switchBtn.setAttribute('aria-checked', enabled ? 'true' : 'false');
        switchBtn.title = enabled
          ? `Đang bật ${entityLabel} — bấm để tắt`
          : `Đang tắt ${entityLabel} — bấm để bật lại`;
        const lbl = switchBtn.querySelector('.agy-av-switch-label');
        if (lbl) lbl.textContent = enabled ? 'Đang bật' : 'Đang tắt';
      }
      if (subEl) {
        subEl.textContent = !enabled
          ? 'Đang ẩn khỏi khung hội thoại'
          : (hasCustom ? 'Đang dùng ảnh tải riêng' : defaultDesc);
      }
      if (resetDefBtn) {
        resetDefBtn.style.display = (enabled && hasCustom) ? 'inline-flex' : 'none';
      }
    }

    if (userAvUpload) {
      userAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          if (coreDestroyed) return;
          try { localStorage.setItem(STORAGE_USER_AVATAR_SAVED, dataUrl); } catch (_) {}
          applyTheme({ userAvatar: dataUrl });
          syncAvPreview(userAvPreview, dataUrl, 'B', true);
          syncAvSwitchUi(userAvClear, userAvSubstatus, userAvResetDef, true, true, 'Theo Bản Ngã / Chủ đề', 'icon người dùng');
        });
      });
    }
    if (userAvClear) {
      userAvClear.addEventListener('click', () => {
        const cur = getState();
        const currentlyEnabled = cur.userAvatar !== 'none';
        if (currentlyEnabled) {
          if (cur.userAvatar && cur.userAvatar !== 'none') {
            try { localStorage.setItem(STORAGE_USER_AVATAR_SAVED, cur.userAvatar); } catch (_) {}
          }
          applyTheme({ userAvatar: 'none' });
          syncAvPreview(userAvPreview, '', 'B', false);
          syncAvSwitchUi(userAvClear, userAvSubstatus, userAvResetDef, false, false, 'Theo Bản Ngã / Chủ đề', 'icon người dùng');
        } else {
          let savedCustom = '';
          try {
            const rawSaved = localStorage.getItem(STORAGE_USER_AVATAR_SAVED) || '';
            savedCustom = rawSaved ? resolveAssetUrl(rawSaved) : '';
          } catch (_) {}
          applyTheme({ userAvatar: savedCustom });
          const nextSt = getState();
          syncAvPreview(userAvPreview, computeEffectiveUserAv(nextSt), 'B', true);
          syncAvSwitchUi(userAvClear, userAvSubstatus, userAvResetDef, true, Boolean(savedCustom), 'Theo Bản Ngã / Chủ đề', 'icon người dùng');
        }
      });
    }
    if (userAvResetDef) {
      userAvResetDef.addEventListener('click', () => {
        try { localStorage.removeItem(STORAGE_USER_AVATAR_SAVED); } catch (_) {}
        applyTheme({ userAvatar: '' });
        const nextSt = getState();
        syncAvPreview(userAvPreview, computeEffectiveUserAv(nextSt), 'B', true);
        syncAvSwitchUi(userAvClear, userAvSubstatus, userAvResetDef, true, false, 'Theo Bản Ngã / Chủ đề', 'icon người dùng');
      });
    }

    if (agentAvUpload) {
      agentAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          if (coreDestroyed) return;
          try { localStorage.setItem(STORAGE_AGENT_AVATAR_SAVED, dataUrl); } catch (_) {}
          applyTheme({ agentAvatar: dataUrl });
          syncAvPreview(agentAvPreview, dataUrl, 'AI', true);
          syncAvSwitchUi(agentAvClear, agentAvSubstatus, agentAvResetDef, true, true, 'Theo Chủ đề đang bật', 'icon trợ lý AI');
        });
      });
    }
    if (agentAvClear) {
      agentAvClear.addEventListener('click', () => {
        const cur = getState();
        const currentlyEnabled = cur.agentAvatar !== 'none';
        if (currentlyEnabled) {
          if (cur.agentAvatar && cur.agentAvatar !== 'none') {
            try { localStorage.setItem(STORAGE_AGENT_AVATAR_SAVED, cur.agentAvatar); } catch (_) {}
          }
          applyTheme({ agentAvatar: 'none' });
          syncAvPreview(agentAvPreview, '', 'AI', false);
          syncAvSwitchUi(agentAvClear, agentAvSubstatus, agentAvResetDef, false, false, 'Theo Chủ đề đang bật', 'icon trợ lý AI');
        } else {
          let savedCustom = '';
          try {
            const rawSaved = localStorage.getItem(STORAGE_AGENT_AVATAR_SAVED) || '';
            savedCustom = rawSaved ? resolveAssetUrl(rawSaved) : '';
          } catch (_) {}
          applyTheme({ agentAvatar: savedCustom });
          const nextSt = getState();
          syncAvPreview(agentAvPreview, computeEffectiveAgentAv(nextSt), 'AI', true);
          syncAvSwitchUi(agentAvClear, agentAvSubstatus, agentAvResetDef, true, Boolean(savedCustom), 'Theo Chủ đề đang bật', 'icon trợ lý AI');
        }
      });
    }
    if (agentAvResetDef) {
      agentAvResetDef.addEventListener('click', () => {
        try { localStorage.removeItem(STORAGE_AGENT_AVATAR_SAVED); } catch (_) {}
        applyTheme({ agentAvatar: '' });
        const nextSt = getState();
        syncAvPreview(agentAvPreview, computeEffectiveAgentAv(nextSt), 'AI', true);
        syncAvSwitchUi(agentAvClear, agentAvSubstatus, agentAvResetDef, true, false, 'Theo Chủ đề đang bật', 'icon trợ lý AI');
      });
    }

    const blurSlider = container.querySelector('#agy-blur-slider');
    const blurLabel = container.querySelector('#agy-blur-val');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        const v = clampInt(e.target.value, 0, 16, 0);
        if (blurLabel) blurLabel.textContent = v + 'px';
        clearTimeout(blurSliderDebounceTimer);
        blurSliderDebounceTimer = setTimeout(() => {
          blurSliderDebounceTimer = 0;
          applyTheme({ glassBlur: v });
        }, 60);
      });
    }

    const avSizeSlider = container.querySelector('#agy-av-size');
    const avSizeVal = container.querySelector('#agy-av-size-val');
    if (avSizeSlider) {
      avSizeSlider.addEventListener('input', (e) => {
        const v = clampInt(e.target.value, 22, 52, 32);
        if (avSizeVal) avSizeVal.textContent = v + 'px';
        applyTheme({ avatarSize: v });
      });
    }

    const avRadSlider = container.querySelector('#agy-av-rad');
    const avRadVal = container.querySelector('#agy-av-rad-val');
    if (avRadSlider) {
      avRadSlider.addEventListener('input', (e) => {
        const v = clampInt(e.target.value, 0, 50, 50);
        if (avRadVal) avRadVal.textContent = v + '%';
        if (userAvPreview) userAvPreview.style.borderRadius = v + '%';
        if (agentAvPreview) agentAvPreview.style.borderRadius = v + '%';
        applyTheme({ avatarRadius: v });
      });
    }

    const chibiToggle = container.querySelector('#agy-chibi-toggle');
    if (chibiToggle) {
      chibiToggle.addEventListener('change', (e) => {
        applyTheme({ chibiEnabled: Boolean(e.target.checked) });
      });
    }

    const autoFinisherToggle = container.querySelector('#agy-autofinisher-toggle');
    if (autoFinisherToggle) {
      autoFinisherToggle.addEventListener('change', (e) => {
        applyTheme({ autoFinisher: Boolean(e.target.checked) });
      });
    }

    const chibi3dToggle = container.querySelector('#agy-chibi-3d-toggle');
    const chibiMode2dBtn = container.querySelector('#agy-chibi-mode-2d');
    const chibiMode3dBtn = container.querySelector('#agy-chibi-mode-3d');
    const setChibi3dModeUi = (enabled) => {
      applyTheme({ chibi3dEnabled: Boolean(enabled) });
      renderThemePanels(container);
    };
    if (chibi3dToggle) {
      chibi3dToggle.addEventListener('change', (e) => {
        setChibi3dModeUi(Boolean(e.target.checked));
      });
    }
    if (chibiMode2dBtn) {
      chibiMode2dBtn.addEventListener('click', () => {
        setChibi3dModeUi(false);
      });
    }
    if (chibiMode3dBtn) {
      chibiMode3dBtn.addEventListener('click', () => {
        setChibi3dModeUi(true);
      });
    }

    const chibi2dLiveToggle = container.querySelector('#agy-chibi-2d-live-toggle');
    const l2dPreviewStatus = container.querySelector('#agy-l2d-preview-status');
    if (chibi2dLiveToggle) {
      chibi2dLiveToggle.addEventListener('change', (e) => {
        const nextOn = Boolean(e.target.checked);
        applyTheme({ chibi2dLive: nextOn });
        if (nextOn && window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction('happy', 1200);
        }
        renderThemePanels(container);
      });
    }
    const L2D_PREVIEW_LABELS = {
      happy: '✨ Đang diễn biểu cảm Vui vẻ (nhún nhảy & lấp lánh sao)!',
      thinking: '💭 Đang diễn trạng thái AI suy luận (nghiêng đầu & bong bóng Hơi Thở 3 chấm)!',
      combo: '⌨️ Đang diễn trạng thái Gõ phím Combo (nảy theo nhịp gõ & huy hiệu ×Combo)!',
      victory: '🏆 Đang diễn trạng thái Test PASS / Chiến thắng (nhảy kép & pháo sáng rực rỡ)!'
    };
    container.querySelectorAll('[data-l2d-react]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-l2d-react') || 'happy';
        if (getState().chibi2dLive === false) {
          applyTheme({ chibi2dLive: true });
          if (chibi2dLiveToggle) chibi2dLiveToggle.checked = true;
        }
        if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction(kind, 2400);
        }
        if (l2dPreviewStatus) {
          l2dPreviewStatus.textContent = L2D_PREVIEW_LABELS[kind] || L2D_PREVIEW_LABELS.happy;
          l2dPreviewStatus.style.color = '#fde047';
        }
      });
    });

    const glbInput = container.querySelector('#agy-chibi-glb-input');
    const glbUploadBtn = container.querySelector('#agy-chibi-glb-upload');
    const glbResetBtn = container.querySelector('#agy-chibi-glb-reset');
    const glbStatusEl = container.querySelector('#agy-chibi-glb-status');
    const syncGlbUiRefresh = (msg, isErr) => {
      if (glbStatusEl) {
        glbStatusEl.textContent = msg;
        glbStatusEl.style.color = isErr ? '#fca5a5' : '#94a3b8';
      }
      if (window.__AGY_KNY_CHIBI_AURA__) {
        if (typeof window.__AGY_KNY_CHIBI_AURA__.notifyChibiReaction === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.notifyChibiReaction('happy', 800);
        }
        if (typeof window.__AGY_KNY_CHIBI_AURA__.resumeOrPauseAura === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.resumeOrPauseAura();
        }
      }
    };
    if (glbUploadBtn && glbInput) {
      glbUploadBtn.addEventListener('click', () => {
        glbInput.click();
      });
    }
    if (glbInput) {
      glbInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const chApi = window.__AGY_KNY_CHIBI_3D__;
        if (!chApi || typeof chApi.setCustomGlbModel !== 'function') {
          syncGlbUiRefresh(`${tr('glbErr', 'Tệp .glb/.vrm không hợp lệ:')} Động cơ 3D chưa sẵn sàng.`, true);
          return;
        }
        const lowerName = String(file.name || '').toLowerCase();
        if (!lowerName.endsWith('.glb') && !lowerName.endsWith('.vrm')) {
          syncGlbUiRefresh(`${tr('glbErr', 'Tệp .glb/.vrm không hợp lệ:')} Chỉ hỗ trợ định dạng .glb hoặc .vrm.`, true);
          return;
        }
        if (file.size > 25 * 1024 * 1024) {
          syncGlbUiRefresh(`${tr('glbErr', 'Tệp .glb/.vrm không hợp lệ:')} Vượt giới hạn 25MB.`, true);
          return;
        }
        try {
          const cid = resolveActiveChibiCharId(getState());
          const buf = typeof file.arrayBuffer === 'function'
            ? await file.arrayBuffer()
            : await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = () => reject(new Error('Không thể đọc tệp .glb/.vrm.'));
                fr.readAsArrayBuffer(file);
              });
          const res = await chApi.setCustomGlbModel(cid, buf, { fileName: file.name });
          applyTheme({ chibi3dEnabled: true });
          renderThemePanels(container);
          const refreshedStatus = container.querySelector('#agy-chibi-glb-status');
          if (refreshedStatus) {
            refreshedStatus.textContent = `${tr('glbOk', 'Đã nạp mô hình 3D:')} ${res.fileName} (${res.vertexCount || 0}v)`;
          }
          syncGlbUiRefresh(`${tr('glbOk', 'Đã nạp mô hình 3D:')} ${res.fileName} (${res.vertexCount || 0}v)`, false);
        } catch (err) {
          syncGlbUiRefresh(`${tr('glbErr', 'Tệp .glb/.vrm không hợp lệ:')} ${(err && err.message) || String(err)}`, true);
        }
      });
    }
    if (glbResetBtn) {
      glbResetBtn.addEventListener('click', async () => {
        const cid = resolveActiveChibiCharId(getState());
        const chApi = window.__AGY_KNY_CHIBI_3D__;
        if (chApi && typeof chApi.clearCustomGlbModel === 'function') {
          try { await chApi.clearCustomGlbModel(cid); } catch (_) {}
        }
        applyTheme({});
        renderThemePanels(container);
        const msg = getState().chibi3dEnabled === false
          ? `${tr('glbDef', 'Đang ở chế độ 2D (Ảnh gốc)')} (${cid})`
          : `Chưa nạp tệp .glb/.vrm cho ${cid} — đang hiển thị ảnh Chibi 2D gốc`;
        const refreshedStatus = container.querySelector('#agy-chibi-glb-status');
        if (refreshedStatus) refreshedStatus.textContent = msg;
        syncGlbUiRefresh(msg, false);
      });
    }

    container.querySelectorAll('.agy-ai-persona-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = normalizeAiPersonaMode(btn.getAttribute('data-ai-persona-mode'));
        applyTheme({ aiPersonaMode: mode });
        renderThemePanels(container);
      });
    });

    const bubbleRadSlider = container.querySelector('#agy-bubble-rad-slider');
    const bubbleRadVal = container.querySelector('#agy-bubble-rad-val');
    if (bubbleRadSlider) {
      bubbleRadSlider.addEventListener('input', (e) => {
        const v = clampInt(e.target.value, 6, 22, 14);
        if (bubbleRadVal) bubbleRadVal.textContent = v + 'px';
        applyTheme({ bubbleRadius: v });
      });
    }

    const fxDensitySlider = container.querySelector('#agy-fx-density-slider');
    const fxDensityVal = container.querySelector('#agy-fx-density-val');
    if (fxDensitySlider) {
      fxDensitySlider.addEventListener('input', (e) => {
        const v = clampInt(e.target.value, 0, 100, 100);
        if (fxDensityVal) fxDensityVal.textContent = v + '%';
        applyTheme({ fxDensity: v });
      });
    }

    const ecoBattToggle = container.querySelector('#agy-eco-battery-toggle');
    if (ecoBattToggle) {
      ecoBattToggle.addEventListener('change', (e) => {
        applyTheme({ ecoBattery: Boolean(e.target.checked) });
        if (typeof window.__AGY_SYNC_BATTERY_ECO__ === 'function') {
          window.__AGY_SYNC_BATTERY_ECO__();
        }
      });
    }

    const focusPresetBtn = container.querySelector('#agy-focus-preset-btn');
    if (focusPresetBtn) {
      focusPresetBtn.addEventListener('click', () => {
        const curFocus = Boolean(getState().focusMode);
        if (curFocus) {
          applyTheme({
            chibiEnabled: true,
            fxDensity: 100,
            autoFinisher: true,
            transparentWorld: true,
            focusMode: false
          });
        } else {
          applyTheme({
            chibiEnabled: false,
            fxDensity: 20,
            autoFinisher: false,
            transparentWorld: true,
            focusMode: true
          });
        }
        renderThemePanels(container);
      });
    }

    const wsKeyInput = container.querySelector('#agy-ws-key-input');
    const wsBindBtn = container.querySelector('#agy-ws-bind-btn');
    if (wsBindBtn && wsKeyInput) {
      wsBindBtn.addEventListener('click', () => {
        const key = normalizeWorkspaceKey(wsKeyInput.value);
        if (!key) return;
        window.__AGY_THEME_CORE__.bindWorkspaceProfile(key);
        renderThemePanels(container);
      });
    }
    container.querySelectorAll('.agy-ws-apply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-ws');
        if (window.__AGY_THEME_CORE__.applyWorkspaceProfile(key)) {
          renderThemePanels(container);
        }
      });
    });
    container.querySelectorAll('.agy-ws-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-ws');
        if (window.__AGY_THEME_CORE__.removeWorkspaceProfile(key)) {
          renderThemePanels(container);
        }
      });
    });

    const exportBtn = container.querySelector('#agy-export-btn');
    const importToggle = container.querySelector('#agy-import-toggle');
    const importBox = container.querySelector('#agy-import-box');
    const importText = container.querySelector('#agy-import-text');
    const importFile = container.querySelector('#agy-import-file');
    const importApply = container.querySelector('#agy-import-apply');
    const importMsg = container.querySelector('#agy-import-msg');

    function applyImportedJsonString(rawJsonStr) {
      const parsedRaw = JSON.parse(String(rawJsonStr || '').trim());
      const parsed = SEC.stripProtoKeys(parsedRaw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Dữ liệu phải là một JSON Object hợp lệ.');
      }

      // Support `.agytheme` ("agytheme/2.0") package format natively
      if ((parsed.schema && String(parsed.schema).startsWith('agytheme/')) || Object.prototype.hasOwnProperty.call(parsed, 'theme')) {
        if (!forge || typeof forge.importAgyThemeObject !== 'function') {
          throw new Error('Mô-đun AI Theme Forge chưa sẵn sàng.');
        }
        const imported = forge.importAgyThemeObject(parsed, THEMES, THEME_KEYS);
        const badgeEl = document.getElementById('agy-custom-theme-badge');
        if (badgeEl) badgeEl.textContent = `${THEME_KEYS.length} Chủ đề`;
        const nextPatch = {
          themeName: imported.name,
          bubbleName: imported.name,
          customWp: '',
          wpEnabled: true
        };
        if (imported.masterPersona) nextPatch.masterPersona = normalizeSafeMasterPersona(imported.masterPersona);
        if (imported.settings.dimming !== undefined) nextPatch.dimming = imported.settings.dimming;
        if (imported.settings.glassBlur !== undefined) nextPatch.glassBlur = imported.settings.glassBlur;
        if (imported.settings.inputStyle && INPUT_STYLES[imported.settings.inputStyle]) nextPatch.inputStyle = imported.settings.inputStyle;
        if (imported.settings.transparentWorld !== undefined) nextPatch.transparentWorld = imported.settings.transparentWorld;
        applyTheme(nextPatch);
        renderThemePanels(container);
        return;
      }

      // Strict validation for standard state config JSON
      const allowed = {};
      if (typeof parsed.themeName === 'string' && THEMES[parsed.themeName]) {
        allowed.themeName = parsed.themeName;
      }
      if (typeof parsed.bubbleName === 'string' && THEMES[parsed.bubbleName]) {
        allowed.bubbleName = parsed.bubbleName;
      }
      if (typeof parsed.inputStyle === 'string' && INPUT_STYLES[parsed.inputStyle]) {
        allowed.inputStyle = parsed.inputStyle;
      }
      if (typeof parsed.masterPersona === 'string') {
        allowed.masterPersona = normalizeSafeMasterPersona(parsed.masterPersona);
      }
      if (typeof parsed.dimming === 'number' && Number.isFinite(parsed.dimming)) {
        allowed.dimming = clampInt(parsed.dimming, 15, 92, 69);
      }
      if (typeof parsed.glassBlur === 'number' && Number.isFinite(parsed.glassBlur)) {
        allowed.glassBlur = clampInt(parsed.glassBlur, 0, 16, 0);
      }
      if (typeof parsed.avatarSize === 'number' && Number.isFinite(parsed.avatarSize)) {
        allowed.avatarSize = clampInt(parsed.avatarSize, 22, 52, 32);
      }
      if (typeof parsed.avatarRadius === 'number' && Number.isFinite(parsed.avatarRadius)) {
        allowed.avatarRadius = clampInt(parsed.avatarRadius, 0, 50, 50);
      }
      if (typeof parsed.wpEnabled === 'boolean') {
        allowed.wpEnabled = parsed.wpEnabled;
      }
      if (typeof parsed.transparentWorld === 'boolean') {
        allowed.transparentWorld = parsed.transparentWorld;
      }
      if (typeof parsed.chibiEnabled === 'boolean') {
        allowed.chibiEnabled = parsed.chibiEnabled;
      }
      if (typeof parsed.chibi3dEnabled === 'boolean') {
        allowed.chibi3dEnabled = parsed.chibi3dEnabled;
      }
      if (typeof parsed.chibi2dLive === 'boolean') {
        allowed.chibi2dLive = parsed.chibi2dLive;
      }
      if (typeof parsed.autoFinisher === 'boolean') {
        allowed.autoFinisher = parsed.autoFinisher;
      }
      if (typeof parsed.ecoBattery === 'boolean') {
        allowed.ecoBattery = parsed.ecoBattery;
      }
      if (typeof parsed.fxDensity === 'number' && Number.isFinite(parsed.fxDensity)) {
        allowed.fxDensity = clampInt(parsed.fxDensity, 0, 100, 100);
      }
      if (typeof parsed.bubbleRadius === 'number' && Number.isFinite(parsed.bubbleRadius)) {
        allowed.bubbleRadius = clampInt(parsed.bubbleRadius, 6, 22, 14);
      }
      if (typeof parsed.aiPersonaMode === 'string') {
        allowed.aiPersonaMode = normalizeAiPersonaMode(parsed.aiPersonaMode);
      }
      if (typeof parsed.focusMode === 'boolean') {
        allowed.focusMode = parsed.focusMode;
      }
      if (typeof parsed.uiLang === 'string') {
        allowed.uiLang = normalizeUiLang(parsed.uiLang);
      }
      if (parsed.workspaceProfiles && typeof parsed.workspaceProfiles === 'object' && !Array.isArray(parsed.workspaceProfiles)) {
        allowed.workspaceProfiles = sanitizeWorkspaceProfilesMap(parsed.workspaceProfiles);
      }
      ['customWp', 'userAvatar', 'agentAvatar'].forEach((urlKey) => {
        if (typeof parsed[urlKey] === 'string') {
          const v = parsed[urlKey].trim();
          if (v === '' || (urlKey !== 'customWp' && v === 'none')) {
            allowed[urlKey] = v;
          } else {
            const safeU = resolveAssetUrl(v);
            if (safeU) allowed[urlKey] = safeU;
          }
        }
      });

      applyTheme(allowed);
      renderThemePanels(container);
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = JSON.stringify(getState(), null, 2);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(json).then(() => {
            exportBtn.textContent = '✓';
            setTimeout(() => { exportBtn.textContent = tr('expJ', 'Xuất JSON'); }, 1500);
          }).catch(() => {
            if (importBox && importText) {
              importBox.style.display = 'flex';
              importText.value = json;
              importText.select();
            }
          });
        } else if (importBox && importText) {
          importBox.style.display = 'flex';
          importText.value = json;
          importText.select();
        }
      });
    }
    if (importToggle && importBox) {
      importToggle.addEventListener('click', () => {
        const willOpen = importBox.style.display === 'none';
        importBox.style.display = willOpen ? 'flex' : 'none';
        importToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (importMsg) importMsg.textContent = '';
      });
    }
    if (importFile) {
      importFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
          if (importMsg) importMsg.textContent = 'File quá lớn (> 15MB).';
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => {
          if (coreDestroyed) return;
          if (importMsg) importMsg.textContent = 'Không thể đọc tệp đã chọn.';
        };
        reader.onload = () => {
          if (coreDestroyed) return;
          try {
            applyImportedJsonString(String(reader.result || ''));
          } catch (err) {
            if (importMsg) importMsg.textContent = 'Lỗi gói: ' + err.message;
          }
        };
        reader.readAsText(file, 'utf-8');
      });
    }
    if (importApply && importText) {
      importApply.addEventListener('click', () => {
        try {
          applyImportedJsonString(importText.value);
        } catch (err) {
          if (importMsg) importMsg.textContent = 'JSON không hợp lệ: ' + err.message;
        }
      });
    }

    const resetBtn = container.querySelector('#agy-reset-btn');
    resetBtn.addEventListener('click', () => {
      clearTimeout(blurSliderDebounceTimer);
      blurSliderDebounceTimer = 0;
      modalPendingForged = null;
      modalPendingForgeName = '';
      modalPendingForgeFx = '';
      _lsFallback.clear();
      try {
        [
          STORAGE_CUSTOM_WP, STORAGE_USER_AVATAR, STORAGE_AGENT_AVATAR,
          STORAGE_USER_AVATAR_SAVED, STORAGE_AGENT_AVATAR_SAVED, STORAGE_GLASS_BLUR,
          STORAGE_AVATAR_SIZE, STORAGE_AVATAR_RADIUS, STORAGE_THEME, STORAGE_BUBBLE,
          STORAGE_INPUT, STORAGE_DIMMING, STORAGE_WP_ENABLED, STORAGE_TRANSPARENT_WORLD,
          STORAGE_CHIBI_ENABLED, STORAGE_CHIBI_3D, STORAGE_CHIBI_2D_LIVE, STORAGE_FX_DENSITY, STORAGE_AUTO_FINISHER,
          STORAGE_BUBBLE_RADIUS, STORAGE_ECO_BATTERY, STORAGE_MASTER_PERSONA,
          STORAGE_AI_PERSONA_MODE, STORAGE_FOCUS_MODE
        ].forEach((k) => localStorage.removeItem(k));
      } catch (_) {}
      const defTh = THEMES[DEFAULT_THEME_KEY] || {};
      const defDim = defTh.defaultDimming ?? 24;
      const defBlurParsed = parseFloat(defTh.headerBlur);
      const defBlur = Number.isFinite(defBlurParsed) ? clampInt(Math.round(defBlurParsed), 0, 16, 3) : (defTh.unifiedGlass === false ? 0 : 3);
      applyTheme({
        themeName: DEFAULT_THEME_KEY,
        bubbleName: DEFAULT_THEME_KEY,
        inputStyle: 'sync',
        dimming: defDim,
        wpEnabled: true,
        customWp: '',
        userAvatar: '',
        agentAvatar: '',
        glassBlur: defBlur,
        avatarSize: 32,
        avatarRadius: 50,
        transparentWorld: true,
        chibiEnabled: true,
        chibi3dEnabled: true,
        chibi2dLive: true,
        fxDensity: 100,
        autoFinisher: true,
        bubbleRadius: 14,
        ecoBattery: true,
        masterPersona: 'yoriichi',
        aiPersonaMode: getDefaultAiPersonaMode(),
        focusMode: false
      });
      renderThemePanels(container);
    });

    container.querySelectorAll('.agy-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.getAttribute('data-filter') || 'all';
        container.querySelectorAll('.agy-filter-chip').forEach(ch => {
          const active = ch === chip;
          ch.style.background = active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
          ch.style.borderColor = active ? safeMainPrimary : 'rgba(255,255,255,0.14)';
          ch.style.fontWeight = active ? '600' : '400';
        });
        container.querySelectorAll('.agy-preset-card').forEach(card => {
          const g = card.getAttribute('data-group') || 'classic';
          card.style.display = (f === 'all' || g === f) ? 'flex' : 'none';
        });
      });
    });

    const bindCardKeyActivation = (card) => {
      card.addEventListener('keydown', (e) => {
        if (e && (e.key === 'Enter' || e.key === ' ')) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          card.click();
        }
      });
    };

    container.querySelectorAll('.agy-preset-card').forEach(card => {
      bindCardKeyActivation(card);
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        if (!THEMES[name]) return;
        const pickedTh = THEMES[name] || {};
        const nextDim = pickedTh.defaultDimming !== undefined ? pickedTh.defaultDimming : 36;
        applyTheme({ themeName: name, bubbleName: name, dimming: nextDim, customWp: '', wpEnabled: true });
        const pickedPrimary = SEC.sanitizeCssValue(pickedTh.primary, '#c084fc');
        container.style.setProperty('--agy-st-accent', pickedPrimary);
        if (summaryEl) {
          summaryEl.textContent = tr('activeUsing', 'Đang dùng: {name}', { name });
        }
        if (wpToggle) wpToggle.checked = true;
        if (slider) slider.value = nextDim;
        if (valLabel) valLabel.textContent = nextDim + '%';
        const curSt = getState();
        if (curSt.userAvatar !== 'none' && !curSt.userAvatar) {
          syncAvPreview(userAvPreview, computeEffectiveUserAv(curSt), 'B', true);
        }
        if (curSt.agentAvatar !== 'none' && !curSt.agentAvatar) {
          syncAvPreview(agentAvPreview, computeEffectiveAgentAv(curSt), 'AI', true);
        }

        container.querySelectorAll('.agy-preset-card').forEach(c => {
          const isSel = c.dataset.name === name;
          const isRoy = c.dataset.group === 'royal';
          c.setAttribute('aria-pressed', isSel ? 'true' : 'false');
          c.style.border = isSel
            ? (isRoy ? '1.8px solid #facc15' : '1.5px solid #f8fafc')
            : (isRoy ? '1.2px solid rgba(250, 204, 21, 0.50)' : '1px solid rgba(255, 255, 255, 0.11)');
          const slot = c.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        container.querySelectorAll('.agy-bubble-card').forEach(b => {
          const isSel = b.dataset.name === name;
          b.setAttribute('aria-pressed', isSel ? 'true' : 'false');
          b.style.border = isSel ? '1.5px solid #f8fafc' : '1px solid rgba(255, 255, 255, 0.11)';
          b.style.background = isSel ? 'rgba(36, 30, 46, 0.72)' : 'rgba(17, 20, 29, 0.84)';
          const slot = b.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        updateInputPreviews(name);
      });
    });

    container.querySelectorAll('.agy-bubble-card').forEach(card => {
      bindCardKeyActivation(card);
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        if (!THEMES[name]) return;
        applyTheme({ bubbleName: name });

        container.querySelectorAll('.agy-bubble-card').forEach(b => {
          const isSel = b.dataset.name === name;
          b.setAttribute('aria-pressed', isSel ? 'true' : 'false');
          b.style.border = isSel ? '1.5px solid #f8fafc' : '1px solid rgba(255, 255, 255, 0.11)';
          b.style.background = isSel ? 'rgba(36, 30, 46, 0.72)' : 'rgba(17, 20, 29, 0.84)';
          const slot = b.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        updateInputPreviews(name);
      });
    });

    container.querySelectorAll('.agy-input-card').forEach(card => {
      bindCardKeyActivation(card);
      card.addEventListener('click', () => {
        const styleKey = card.dataset.style;
        if (!INPUT_STYLES[styleKey]) return;
        applyTheme({ inputStyle: styleKey });

        container.querySelectorAll('.agy-input-card').forEach(c => {
          const isSel = c.dataset.style === styleKey;
          c.setAttribute('aria-pressed', isSel ? 'true' : 'false');
          c.style.border = isSel ? '1.5px solid #f8fafc' : '1px solid rgba(255, 255, 255, 0.11)';
          c.style.background = isSel ? 'rgba(36, 30, 46, 0.72)' : 'rgba(17, 20, 29, 0.84)';
          const slot = c.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });
      });
    });

    if (innerScroller && savedInnerScrollTop > 0) {
      innerScroller.scrollTop = savedInnerScrollTop;
    }
    if (savedOuterScrollTop > 0) {
      container.scrollTop = savedOuterScrollTop;
    }
    if (savedFocusSelector) {
      try {
        const nextFocusEl = container.querySelector(savedFocusSelector);
        if (nextFocusEl && typeof nextFocusEl.focus === 'function') {
          nextFocusEl.focus({ preventScroll: true });
        }
      } catch (_) {}
    }
  }

  function injectMainSidebarButton() {
    if (document.getElementById('agy-custom-theme-sidebar-btn')) return;

    const spans = Array.from(document.querySelectorAll('aside span, [data-sidebar] span, .bg-sidebar span, [data-testid="sidebar-navigation-items"] span'));
    const customSpan = spans.find(s => s.textContent?.trim() === 'Customizations');
    const navItemsContainer = !customSpan ? document.querySelector('[data-testid="sidebar-navigation-items"]') : null;
    if (!customSpan && !navItemsContainer) return;

    const row = customSpan
      ? (customSpan.closest('a, button, div[role="button"], .group\\/headerbtn') || customSpan.parentElement)
      : null;
    if (customSpan && (!row || !row.parentNode)) return;

    const btn = document.createElement('button');
    btn.id = 'agy-custom-theme-sidebar-btn';
    btn.type = 'button';
    btn.className = 'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer select-none';
    btn.style.cssText = 'text-align: left; background: transparent; border: none; color: inherit; display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 12px; border-radius: 8px; cursor: pointer;';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${SEC.escapeHtml(tr('sidebarBtn', 'Giao diện tùy biến'))}</span>
    `;

    if (row && row.parentNode) {
      row.parentNode.insertBefore(btn, row.nextSibling);
    } else if (navItemsContainer) {
      navItemsContainer.appendChild(btn);
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
    });
  }

  function injectSettingsModalButton() {
    const modal = document.querySelector('.settings-modal-container');
    if (!modal || document.getElementById('agy-custom-theme-settings-btn')) return;

    const headers = Array.from(modal.querySelectorAll('h2, h3'));
    const appearanceHeader = headers.find(h => h.textContent?.trim() === 'Appearance');
    if (!appearanceHeader) return;

    let targetContainer = appearanceHeader.parentElement;
    while (targetContainer && !targetContainer.className.includes('justify-between') && targetContainer !== modal) {
      targetContainer = targetContainer.parentElement;
    }

    if (!targetContainer || !targetContainer.parentNode) return;

    Array.from(targetContainer.parentNode.children).forEach(child => {
      if (child.id === 'agy-custom-theme-settings-btn') child.remove();
    });

    const btn = document.createElement('button');
    btn.id = 'agy-custom-theme-settings-btn';
    btn.type = 'button';
    btn.className = 'select-none rounded px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer text-white';
    btn.style.cssText = 'background: linear-gradient(135deg, #e08e55 0%, #b45309 100%); border: 1px solid rgba(251, 191, 36, 0.4); box-shadow: 0 2px 10px rgba(224, 142, 85, 0.3); margin-top: 8px; margin-bottom: 8px; display: inline-flex; align-items: center; gap: 6px;';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
      <span>${SEC.escapeHtml(tr('openStudioBtn', 'Mở Xưởng Giao Diện Tùy Biến'))}</span>
    `;

    targetContainer.parentNode.insertBefore(btn, targetContainer.nextSibling);

    btn.addEventListener('click', () => {
      window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
    });
  }

  function hookSidebarScroll() {
    if (!window.__AGY_SCROLL_AC__) return;
    const scrollers = document.querySelectorAll('.agy-shell .bg-sidebar .overflow-y-auto');
    scrollers.forEach(sc => {
      if (sc.dataset.agyScrollBound) return;
      sc.dataset.agyScrollBound = '1';
      const sync = () => sc.classList.toggle('agy-scrolled', sc.scrollTop > 2);
      sync();
      sc.addEventListener('scroll', sync, { passive: true, signal: window.__AGY_SCROLL_AC__.signal });
    });
  }

  function syncShellMetrics() {
    const shell = document.querySelector('.agy-shell');
    if (!shell) return;
    const split = shell.querySelector('[data-testid="sidebar-split"]');
    const sidebarPane = split ? split.firstElementChild : null;
    const titleBar = shell.querySelector('[class*="@container/titlebar"]');
    const sw = sidebarPane ? Math.round(sidebarPane.getBoundingClientRect().width) : 0;
    const shellRect = shell.getBoundingClientRect();
    const hdrBottom = titleBar ? Math.round(titleBar.getBoundingClientRect().bottom - shellRect.top) : 35;
    shell.style.setProperty('--agy-sidebar-w', sw + 'px');
    shell.style.setProperty('--agy-hdr-h', hdrBottom + 'px');

    const hasHoleAttr = document.body.getAttribute('data-has-browser-hole') === 'true';
    const holeEl = hasHoleAttr ? shell.querySelector('[data-browser-hole]:not([data-browser-hole="false"])') : null;
    if (holeEl) {
      if (window.__AGY_SHELL_RO__ && window.__AGY_HOLE_EL__ !== holeEl) {
        try { window.__AGY_SHELL_RO__.observe(holeEl); } catch (e) {}
        window.__AGY_HOLE_EL__ = holeEl;
      }
      const hRect = holeEl.getBoundingClientRect();
      if (hRect.width > 1 && hRect.height > 1) {
        const l = Math.max(0, Math.round(hRect.left - shellRect.left));
        const t = Math.max(0, Math.round(hRect.top - shellRect.top));
        const r = Math.max(l, Math.round(hRect.right - shellRect.left));
        const b = Math.max(t, Math.round(hRect.bottom - shellRect.top));
        shell.style.setProperty(
          '--agy-hole-clip',
          `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`
        );
        shell.dataset.agyHoleActive = '1';
        return;
      }
    }
    window.__AGY_HOLE_EL__ = null;
    delete shell.dataset.agyHoleActive;
    shell.style.removeProperty('--agy-hole-clip');
  }

  function hookShellMetrics() {
    const shell = document.querySelector('.agy-shell');
    if (!shell) return;
    if (!shell.dataset.agyTboMounted) {
      shell.dataset.agyTboMounted = '1';
      if (!IS_MAC) scheduleTitleBarSync();
    }
    if (!window.__AGY_SHELL_RO__ && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncShellMetrics);
      ro.observe(shell);
      const sidebarPane = shell.querySelector('[data-testid="sidebar-split"]')?.firstElementChild;
      if (sidebarPane) ro.observe(sidebarPane);
      const titleBar = shell.querySelector('[class*="@container/titlebar"]');
      if (titleBar) ro.observe(titleBar);
      window.__AGY_SHELL_RO__ = ro;
    }
    syncShellMetrics();
  }

  /* ==========================================================================
   * TRANSPARENT WORLD ("SUKITŌRU SEKAI") DEEP-FOCUS FLOW ENGINE
   * Smoothly lerps window.__AGY_TRANSPARENT_WORLD__ (0.0 -> 1.0) during deep
   * coding (>= 4 keys/sec for 2s) or sustained diff scrolling; restores after 2.8s.
   * ========================================================================== */
  if (typeof window.__AGY_TRANSPARENT_WORLD__ !== 'number') {
    window.__AGY_TRANSPARENT_WORLD__ = 0;
  }

  let twEnabledFlag = true;
  let twTargetVal = 0;
  let twCurrentVal = Number(window.__AGY_TRANSPARENT_WORLD__) || 0;
  let twLerpRafId = 0;
  let twIdleTimerId = 0;
  let twLastFrameMs = 0;
  let twLastScrollSampleMs = 0;
  const twKeyRing = [];
  const twScrollRing = [];

  function commitTransparentWorldDom(val) {
    const c = Math.max(0, Math.min(1, Number(val) || 0));
    twCurrentVal = c;
    window.__AGY_TRANSPARENT_WORLD__ = Number(c.toFixed(4));
    if (c >= 0.03 || twTargetVal === 1) {
      document.documentElement.dataset.agyTransparentWorld = '1';
      document.documentElement.style.setProperty('--agy-tw-factor', c.toFixed(3));
    } else {
      delete document.documentElement.dataset.agyTransparentWorld;
      document.documentElement.style.removeProperty('--agy-tw-factor');
    }
  }

  function stepTransparentWorldLerp(now) {
    twLerpRafId = 0;
    const safeNow = Number.isFinite(now) ? now : performance.now();
    const dtSec = twLastFrameMs > 0
      ? Math.min(0.05, Math.max(0.004, (safeNow - twLastFrameMs) / 1000))
      : (1 / 60);
    twLastFrameMs = safeNow;
    const diff = twTargetVal - twCurrentVal;
    if (Math.abs(diff) <= 0.004) {
      commitTransparentWorldDom(twTargetVal);
      twLastFrameMs = 0;
      return;
    }
    const rate = twTargetVal > twCurrentVal ? 2.8 : 1.85;
    commitTransparentWorldDom(twCurrentVal + diff * Math.min(1, dtSec * rate));
    twLerpRafId = requestAnimationFrame(stepTransparentWorldLerp);
  }

  function setTransparentWorldTarget(nextTarget) {
    const goal = twEnabledFlag ? (nextTarget ? 1 : 0) : 0;
    if (twTargetVal === goal && Math.abs(twCurrentVal - goal) <= 0.004) return;
    twTargetVal = goal;
    if (goal === 1) {
      document.documentElement.dataset.agyTransparentWorld = '1';
    }
    if (!twLerpRafId) {
      twLastFrameMs = 0;
      twLerpRafId = requestAnimationFrame(stepTransparentWorldLerp);
    }
  }

  function pulseTransparentWorldActivity() {
    if (!twEnabledFlag) return;
    setTransparentWorldTarget(1);
    clearTimeout(twIdleTimerId);
    twIdleTimerId = setTimeout(() => {
      twIdleTimerId = 0;
      setTransparentWorldTarget(0);
    }, 2800);
  }

  function syncTransparentWorldSetting(enabled) {
    twEnabledFlag = enabled !== false;
    if (!twEnabledFlag) {
      clearTimeout(twIdleTimerId);
      twIdleTimerId = 0;
      if (twLerpRafId) {
        cancelAnimationFrame(twLerpRafId);
        twLerpRafId = 0;
      }
      twTargetVal = 0;
      twKeyRing.length = 0;
      twScrollRing.length = 0;
      commitTransparentWorldDom(0);
    }
  }

  function teardownTransparentWorldFlow() {
    syncTransparentWorldSetting(false);
  }

  function bindTransparentWorldListeners(signal) {
    twEnabledFlag = getState().transparentWorld !== false;

    const recordFlowKeystroke = (targetEl) => {
      if (!twEnabledFlag || !targetEl || !targetEl.tagName) return;
      if (targetEl.closest && targetEl.closest('#agy-custom-theme-modal-backdrop')) return;
      const tag = targetEl.tagName.toUpperCase();
      if (tag === 'INPUT') {
        const inpType = String(targetEl.type || 'text').toLowerCase();
        if (inpType === 'range' || inpType === 'checkbox' || inpType === 'radio' || inpType === 'file' || inpType === 'button' || inpType === 'color') {
          return;
        }
      }
      const isCodingOrTyping =
        tag === 'TEXTAREA' ||
        tag === 'INPUT' ||
        targetEl.isContentEditable ||
        Boolean(targetEl.closest && targetEl.closest('.monaco-editor, .cm-editor, .surface-composer, [contenteditable="true"]'));
      if (!isCodingOrTyping) return;

      const now = performance.now();
      if (twTargetVal === 1) {
        pulseTransparentWorldActivity();
        return;
      }
      // Deduplicate paired keydown + input events generated within the same 18ms keystroke tick
      if (twKeyRing.length > 0 && now - twKeyRing[twKeyRing.length - 1] < 18) {
        return;
      }
      twKeyRing.push(now);
      const cutoff = now - 2000;
      while (twKeyRing.length > 0 && twKeyRing[0] < cutoff) {
        twKeyRing.shift();
      }
      let firstSecCount = 0;
      let secondSecCount = 0;
      const mid = now - 1000;
      for (let i = 0; i < twKeyRing.length; i++) {
        if (twKeyRing[i] < mid) firstSecCount++;
        else secondSecCount++;
      }
      // Deep Coding threshold: >= 4 keys/sec sustained across 2 consecutive seconds
      if (firstSecCount >= 4 && secondSecCount >= 4) {
        pulseTransparentWorldActivity();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (!e || !twEnabledFlag || e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        e.key === 'Shift' ||
        e.key === 'CapsLock' ||
        e.key === 'Tab' ||
        e.key === 'Escape' ||
        e.key === 'Control' ||
        e.key === 'Alt' ||
        e.key === 'Meta'
      ) {
        return;
      }
      // Intentionally allow IME composition keystrokes (Vietnamese Telex/VNI & CJK) to count toward Deep Coding flow
      recordFlowKeystroke(e.target);
    }, { capture: true, passive: true, signal });

    window.addEventListener('input', (e) => {
      if (!e || !twEnabledFlag) return;
      recordFlowKeystroke(e.target);
    }, { capture: true, passive: true, signal });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(twIdleTimerId);
        twIdleTimerId = 0;
        if (twLerpRafId) {
          cancelAnimationFrame(twLerpRafId);
          twLerpRafId = 0;
        }
        twTargetVal = 0;
        twLastFrameMs = 0;
        twKeyRing.length = 0;
        twScrollRing.length = 0;
        commitTransparentWorldDom(0);
      } else if (twTargetVal === 0 && twCurrentVal !== 0) {
        if (twLerpRafId) {
          cancelAnimationFrame(twLerpRafId);
          twLerpRafId = 0;
        }
        twLastFrameMs = 0;
        commitTransparentWorldDom(0);
      }
    }, { signal });

    const onFlowScroll = (e) => {
      if (!twEnabledFlag) return;
      if (e && e.target && e.target.closest && e.target.closest('#agy-custom-theme-modal-backdrop')) return;
      const now = performance.now();
      if (now - twLastScrollSampleMs < 75) return;
      twLastScrollSampleMs = now;
      if (twTargetVal === 1) {
        pulseTransparentWorldActivity();
        return;
      }
      twScrollRing.push(now);
      const cutoff = now - 1200;
      while (twScrollRing.length > 0 && twScrollRing[0] < cutoff) {
        twScrollRing.shift();
      }
      if (twScrollRing.length >= 6 && (now - twScrollRing[0]) >= 450) {
        pulseTransparentWorldActivity();
      }
    };
    window.addEventListener('wheel', onFlowScroll, { capture: true, passive: true, signal });
    document.addEventListener('scroll', onFlowScroll, { capture: true, passive: true, signal });
  }

  function getShinobuRuntime() {
    if (!window.__AGY_SHINOBU_RT__) {
      window.__AGY_SHINOBU_RT__ = {
        fxRaf: 0,
        fxPaused: safeLsGet('agy_fx_paused_v1') === '1',
        fxFocusPaused: false,
        fxCleanups: [],
        activeFxMode: '',
        fxDrawer: null,
        npcCollapsed: false,
        npcChatOpen: false,
        activeNpcKey: '',
        typeTimer: 0,
        remindTimer: 0,
        lastKeyEncourageAt: 0,
        greetedOnce: false
      };
    }
    return window.__AGY_SHINOBU_RT__;
  }

  function teardownLiveWallpaperFx() {
    const rt = window.__AGY_SHINOBU_RT__;
    if (rt) {
      if (rt.fxRaf) {
        cancelAnimationFrame(rt.fxRaf);
        rt.fxRaf = 0;
      }
      rt.fxFocusPaused = false;
      rt.activeFxMode = '';
      rt.fxDrawer = null;
      rt.fxResumeOrPause = null;
      if (Array.isArray(rt.fxCleanups)) {
        rt.fxCleanups.forEach(fn => { try { fn(); } catch (_) {} });
        rt.fxCleanups = [];
      }
    }
    const oldHost = document.getElementById('agy-live-fx-host');
    if (oldHost) oldHost.remove();
  }

  function syncLiveWallpaperFx(stOverride, themeOverride) {
    if (coreDestroyed) return;
    const st = stOverride || getEffectiveState();
    const th = themeOverride || THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    const fxMode = th.fxMode || (th.liveWallpaperFx ? 'wisteria' : '');
    const shell = document.querySelector('.agy-shell');
    if (!shell || !st.wpEnabled || !fxMode) {
      teardownLiveWallpaperFx();
      return;
    }

    const rt = getShinobuRuntime();
    let host = document.getElementById('agy-live-fx-host');
    if (host && host.parentElement === shell && rt.activeFxMode === fxMode && rt.fxDrawer) {
      if (typeof rt.fxResumeOrPause === 'function') rt.fxResumeOrPause();
      return;
    }

    teardownLiveWallpaperFx();

    const canvas = document.createElement('canvas');
    canvas.id = 'agy-live-fx-canvas';
    canvas.style.cssText = 'width: 100%; height: 100%; display: block; pointer-events: none;';
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      teardownLiveWallpaperFx();
      return;
    }

    rt.activeFxMode = fxMode;
    host = document.createElement('agy-live-fx');
    host.id = 'agy-live-fx-host';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = [
      'position: absolute !important',
      'inset: 0 !important',
      'display: block !important',
      'z-index: 1',
      'pointer-events: none',
      'overflow: hidden',
      'clip-path: var(--agy-hole-clip, none)',
      'content-visibility: auto',
      'contain-intrinsic-size: auto none auto 600px'
    ].join(';');

    host.appendChild(canvas);
    shell.insertBefore(host, shell.firstChild);

    let width = 1280;
    let height = 720;
    let currentDpr = 1;
    let viewSkipped = false;
    let blurPauseTimer = 0;
    const reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    const drawerFactory = typeof window.__AGY_KNY_FX_DRAWERS__ === 'function' ? window.__AGY_KNY_FX_DRAWERS__ : null;
    let drawer = null;

    function resize() {
      const rect = shell.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      currentDpr = dpr;
      width = Math.max(320, Math.round(rect.width || window.innerWidth || 1280));
      height = Math.max(240, Math.round(rect.height || window.innerHeight || 720));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (drawer && typeof drawer.resize === 'function') {
        drawer.resize(width, height);
      }
    }
    resize();

    if (drawerFactory) {
      drawer = drawerFactory(fxMode, { width, height });
    }
    rt.fxDrawer = drawer || { noop: true };

    function shouldAnimate() {
      const liveDen = Number(typeof window.__AGY_FX_DENSITY__ === 'number' ? window.__AGY_FX_DENSITY__ : 1);
      if (document.hidden || viewSkipped || rt.fxPaused || rt.fxFocusPaused || rt.fxEcoPaused || liveDen <= 0.005) return false;
      if (reducedMq && reducedMq.matches) return false;
      return true;
    }

    if (!rt.batteryHooked && typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      rt.batteryHooked = true;
      try {
        Promise.resolve(navigator.getBattery()).then((batt) => {
          if (!batt || coreDestroyed) return;
          const syncBatt = () => {
            if (coreDestroyed) return;
            const curCfg = getEffectiveState();
            const isLowUnplugged = curCfg.ecoBattery !== false && batt.charging === false && typeof batt.level === 'number' && batt.level <= 0.30;
            if (Boolean(rt.fxEcoPaused) !== isLowUnplugged) {
              rt.fxEcoPaused = isLowUnplugged;
              if (typeof rt.fxResumeOrPause === 'function') rt.fxResumeOrPause();
            }
          };
          window.__AGY_SYNC_BATTERY_ECO__ = syncBatt;
          syncBatt();
          if (typeof batt.addEventListener === 'function') {
            const bOpts = window.__AGY_SCROLL_AC__ ? { signal: window.__AGY_SCROLL_AC__.signal } : undefined;
            batt.addEventListener('chargingchange', syncBatt, bOpts);
            batt.addEventListener('levelchange', syncBatt, bOpts);
          }
        }).catch(() => {});
      } catch (_) {}
    }

    function drawStaticGlowFrame() {
      const liveDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (Math.abs(liveDpr - currentDpr) > 0.01) resize();
      if (drawer && typeof drawer.drawStatic === 'function') {
        drawer.drawStatic(ctx, width, height);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    }

    function render(now) {
      if (!shouldAnimate()) {
        rt.fxRaf = 0;
        drawStaticGlowFrame();
        return;
      }
      const liveDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (Math.abs(liveDpr - currentDpr) > 0.01) resize();
      if (drawer && typeof drawer.render === 'function') {
        drawer.render(ctx, width, height, now);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
      rt.fxRaf = requestAnimationFrame(render);
    }

    function resumeOrPause() {
      if (shouldAnimate()) {
        if (!rt.fxRaf) rt.fxRaf = requestAnimationFrame(render);
      } else {
        if (rt.fxRaf) {
          cancelAnimationFrame(rt.fxRaf);
          rt.fxRaf = 0;
        }
        drawStaticGlowFrame();
      }
    }
    rt.fxResumeOrPause = resumeOrPause;

    // Single-Active-Window GPU Arbitration: 800ms after losing focus -> 0 FPS static 4K frame; instant 60fps on focus/mouseenter
    const scheduleBlurArbitration = () => {
      clearTimeout(blurPauseTimer);
      blurPauseTimer = setTimeout(() => {
        blurPauseTimer = 0;
        if (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())) {
          rt.fxFocusPaused = true;
          resumeOrPause();
        }
      }, 800);
    };

    const wakeFromFocusOrHover = () => {
      clearTimeout(blurPauseTimer);
      blurPauseTimer = 0;
      if (rt.fxFocusPaused) {
        rt.fxFocusPaused = false;
        if (drawer && typeof drawer.resetClock === 'function') {
          drawer.resetClock();
        }
        if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.resumeOrPauseAura === 'function') {
          try { window.__AGY_KNY_CHIBI_AURA__.resumeOrPauseAura(); } catch (_) {}
        }
      }
      resumeOrPause();
    };

    const onMouseLeave = () => {
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
        scheduleBlurArbitration();
      }
    };

    const onResize = () => resize();
    const onVis = () => {
      if (document.hidden) {
        clearTimeout(blurPauseTimer);
        blurPauseTimer = 0;
        resumeOrPause();
      } else if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
        scheduleBlurArbitration();
      } else {
        wakeFromFocusOrHover();
      }
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('blur', scheduleBlurArbitration, { passive: true });
    window.addEventListener('focus', wakeFromFocusOrHover, { passive: true });
    window.addEventListener('mouseenter', wakeFromFocusOrHover, { passive: true });
    window.addEventListener('mouseleave', onMouseLeave, { passive: true });
    if (document.documentElement) {
      document.documentElement.addEventListener('mouseleave', onMouseLeave, { passive: true });
    }
    document.addEventListener('visibilitychange', onVis);

    rt.fxCleanups.push(() => { clearTimeout(blurPauseTimer); blurPauseTimer = 0; });
    rt.fxCleanups.push(() => window.removeEventListener('resize', onResize));
    rt.fxCleanups.push(() => window.removeEventListener('blur', scheduleBlurArbitration));
    rt.fxCleanups.push(() => window.removeEventListener('focus', wakeFromFocusOrHover));
    rt.fxCleanups.push(() => window.removeEventListener('mouseenter', wakeFromFocusOrHover));
    rt.fxCleanups.push(() => window.removeEventListener('mouseleave', onMouseLeave));
    rt.fxCleanups.push(() => {
      if (document.documentElement) {
        document.documentElement.removeEventListener('mouseleave', onMouseLeave);
      }
    });
    rt.fxCleanups.push(() => document.removeEventListener('visibilitychange', onVis));

    let dprMediaCleanup = null;
    const watchDisplayDprChange = () => {
      if (dprMediaCleanup) {
        try { dprMediaCleanup(); } catch (_) {}
        dprMediaCleanup = null;
      }
      if (!window.matchMedia) return;
      try {
        const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        const onDprFlip = () => {
          resize();
          if (!shouldAnimate()) drawStaticGlowFrame();
          watchDisplayDprChange();
        };
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', onDprFlip, { once: true });
          dprMediaCleanup = () => mq.removeEventListener('change', onDprFlip);
        }
      } catch (_) {}
    };
    watchDisplayDprChange();
    rt.fxCleanups.push(() => {
      if (dprMediaCleanup) {
        try { dprMediaCleanup(); } catch (_) {}
        dprMediaCleanup = null;
      }
    });

    if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
      scheduleBlurArbitration();
    }

    if (reducedMq && typeof reducedMq.addEventListener === 'function') {
      reducedMq.addEventListener('change', onVis);
      rt.fxCleanups.push(() => reducedMq.removeEventListener('change', onVis));
    }

    if ('contentVisibility' in document.documentElement.style) {
      const onCv = (ev) => {
        viewSkipped = Boolean(ev.skipped);
        resumeOrPause();
      };
      host.addEventListener('contentvisibilityautostatechange', onCv);
      rt.fxCleanups.push(() => host.removeEventListener('contentvisibilityautostatechange', onCv));
    } else if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          viewSkipped = !entry.isIntersecting;
          resumeOrPause();
        });
      }, { rootMargin: '200px' });
      io.observe(host);
      rt.fxCleanups.push(() => io.disconnect());
    }

    rt.toggleFxPause = () => {
      rt.fxPaused = !rt.fxPaused;
      try { localStorage.setItem('agy_fx_paused_v1', rt.fxPaused ? '1' : '0'); } catch (_) {}
      resumeOrPause();
      return rt.fxPaused;
    };

    resumeOrPause();
  }

  function getDefaultNpcProfile() {
    return {
      badgeLabel: '🦋 Shinobu',
      title: 'Shinobu Kocho • Trùng Trụ',
      placeholder: 'Nói gì đó với Shinobu...',
      pills: [
        { key: 'act1', label: '✨ Cổ vũ' },
        { key: 'act2', label: '🍵 Pha trà' },
        { key: 'act3', label: '🦋 Điệp Phủ' }
      ],
      dialogs: {
        welcome: [
          'Ara ara~ Mình ngồi canh góc khung hội thoại cho bạn đây, chạm vào mình để trò chuyện nhé! 🦋',
          'Bạn tập trung lâu rồi kìa, nhớ chớp mắt và uống ngụm nước cho đỡ mỏi nha! 💜',
          'Đêm trăng hoa tử đằng yên bình quá nhỉ~ Có bài toán hay đoạn code nào khó cứ giao cho tụi mình nhé! ✨',
          'Moshi moshi~ Hôm nay tiến độ công việc của bạn thế nào rồi? Nhớ giữ nhịp thở đều đặn nha! 🦋'
        ],
        act1: [
          'Cố lên nhé! Hơi thở của Côn Trùng sẽ tiếp thêm tốc độ gõ code mượt không một vết bug cho bạn! ✨💜',
          'Ara ara~ Từng dòng code bạn viết đều đang tiến gần hơn tới kết quả hoàn hảo rồi đó, tự tin lên nha! 🦋',
          'Đừng áp lực quá nhé! Dù bug có lì lợm đến đâu thì bình tĩnh phân tích từng bước là gỡ sạch ngay thôi! ✨'
        ],
        act2: [
          'Mình vừa pha một tách trà hoa tử đằng ấm dịu rồi đây~ Thả lỏng hai vai 10 giây rồi làm tiếp nha! 🍵💜',
          'Uống một ngụm nước ấm hoặc trà thảo mộc sẽ giúp đầu óc tỉnh táo hơn gấp đôi đó nha~ 🍵',
          'Ara ara~ Ngồi thẳng lưng lên một chút nào, nhấp ngụm trà thơm cho dịu mắt rồi mình chiến tiếp nhé! 🍵✨'
        ],
        act3: [
          'Ở Điệp Phủ tụi mình luôn nhắc các kiếm sĩ nghỉ mắt quy tắc 20-20-20: mỗi 20 phút nhìn xa 6 mét trong 20 giây đó! 🦋',
          'Hoa tử đằng nở rộ quanh năm để xua tan mệt mỏi và lũ bug đáng ghét khỏi màn hình của bạn đấy~ 🌸💜',
          'Mẹo nhỏ từ Điệp Phủ: Chia nhỏ yêu cầu phức tạp thành từng bước rõ ràng sẽ giúp AI xử lý chính xác hơn nhiều nha! 🦋✨'
        ],
        typing: [
          'Ara ara~ Ý tưởng mới đang tuôn trào kìa, cứ gõ thoải mái nhé! ✨',
          'Mình đang chăm chú xem bạn soạn câu lệnh đây, cố lên nha! 🦋'
        ],
        sent: [
          'Tin nhắn đã bay đi rồi~ Trong lúc đợi phản hồi, thả lỏng cổ tay một chút nhé! 💜',
          'Tuyệt vời! Để xem nhiệm vụ này được giải quyết gọn gàng thế nào nha~ 🦋✨'
        ],
        remind: [
          'Bạn tập trung lâu rồi kìa, nhớ chớp mắt và uống ngụm nước cho đỡ mỏi nha! 💜'
        ]
      },
      replies: {
        greet: 'Moshi moshi~ Rất vui được trò chuyện cùng bạn ngay góc khung chat này! Hôm nay bạn đang làm dự án gì thế? 🦋💜',
        tired: 'Ara ara~ Vất vả cho bạn quá rồi! Dựa lưng nghỉ ngơi vài phút, nhắm mắt hít thở sâu một chút đi, sức khỏe là số một ở Điệp Phủ đó nha! 🍵💜',
        bug: 'Ara ara, lũ bug này gan thật đấy~ Đừng nóng vội nhé, gửi log lỗi vào khung chat bên dưới để AI truy tận gốc từng dòng cho bạn nha! 🦋⚔️',
        praise: 'Ara ara~ Bạn khéo khen làm mình ngại ghê đó! Được ngồi dưới ánh trăng tử đằng đồng hành cùng bạn mình cũng vui lắm~ 🌸💜',
        hungry: 'Bụng đói là không nghĩ ra thuật toán hay được đâu nha! Mau đi nạp năng lượng bằng món gì ngon ấm bụng đi, mình canh máy cho~ 🍙🍵',
        sleepy: 'Thức khuya quá sẽ hại sức khỏe lắm đó... Nốt phần việc nhỏ này rồi lưu code lại đi ngủ sớm nhé! 🌙💜',
        deadline: 'Bình tĩnh nào! Hít một hơi thật sâu, ưu tiên phần cốt lõi chạy được trước rồi tinh chỉnh sau—tụi mình cùng tăng tốc về đích nhé! ✨🦋',
        thanks: 'Không có chi đâu nè~ Giúp bạn có thêm cảm hứng làm việc mỗi ngày là niềm vui của mình mà! 💜🦋',
        fallback: 'Ara ara~ "{input}" ư? Mình nghe rõ rồi nè! Cứ yên tâm triển khai tiếp nhé, mình luôn ngồi đây tiếp sức cho bạn! 🦋✨'
      }
    };
  }

  function getActiveNpcProfile(bThemeOverride) {
    const st = getEffectiveState();
    const bTheme = bThemeOverride || THEMES[st.bubbleName] || THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    const def = getDefaultNpcProfile();
    const charId = resolveNpcCharacterId(bTheme, st);
    if (!bTheme.npc || typeof bTheme.npc !== 'object') {
      return { ...def, charId };
    }
    return {
      charId,
      badgeLabel: bTheme.npc.badgeLabel || def.badgeLabel,
      title: bTheme.npc.title || def.title,
      placeholder: bTheme.npc.placeholder || def.placeholder,
      pills: Array.isArray(bTheme.npc.pills) && bTheme.npc.pills.length > 0 ? bTheme.npc.pills : def.pills,
      dialogs: { ...def.dialogs, ...(bTheme.npc.dialogs || {}) },
      replies: { ...def.replies, ...(bTheme.npc.replies || {}) },
      rawCustomReplies: bTheme.npc.replies ? { ...bTheme.npc.replies } : null
    };
  }

  /* ==========================================================================
   * CANON CHARACTER SOUL CONVERSATION ENGINE v3.2
   * Deep canon individualization for 19 distinct personalities:
   * - Authentic pronouns, speech cadence, philosophy & Taisho-era lore
   * - 2-way relational adaptation to active User Master Persona (Oyakata-sama
   *   reverence, Yoriichi founder respect, canon Hashira/Kamaboko pair chemistry)
   * - Cross-character name mention detection & canon gossip/memories
   * - 20-intent Vietnamese (diacritic + ASCII) & English semantic NLU
   * - Live IDE telemetry awareness (context tokens, Nichirin heat, crisis, night)
   * - Per-character anti-repetition ring buffer & LiveChibi 2.5D mood coupling
   * ========================================================================== */

  function stripVnAccents(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  const NPC_THEME_CHAR_PATTERNS = [
    { id: 'ubuyashiki', re: /\b(ubuyashiki|chua cong|kagaya|royal_wisteria|wisteria_royal)\b/i },
    { id: 'shadow_monarch', re: /\b(shadow_monarch|de vuong bong toi|anh quan vuong|quan doan bong toi)\b/i },
    { id: 'six_eyes', re: /\b(six_eyes|vo luong khong xu|luc nhan|vo ha han)\b/i },
    { id: 'great_sage', re: /\b(great_sage|hac than dai thanh|te thien dai thanh|thien menh nhan)\b/i },
    { id: 'astral_prime', re: /\b(wlop cosmic|astral_prime|tinh van)\b/i },
    { id: 'gyomei', re: /\b(gyomei|himejima|nham tru|stone)\b/i },
    { id: 'shinobu', re: /\b(shinobu|kocho|trung tru|wisteria)\b/i },
    { id: 'giyu', re: /\b(giyu|tomioka|thuy tru|water)\b/i },
    { id: 'rengoku', re: /\b(rengoku|kyojuro|viem tru|flame)\b/i },
    { id: 'uzui', re: /\b(uzui|tengen|am tru|sound)\b/i },
    { id: 'muichiro', re: /\b(muichiro|tokito|ha tru|mist)\b/i },
    { id: 'mitsuri', re: /\b(mitsuri|kanroji|luyen tru|love)\b/i },
    { id: 'obanai', re: /\b(obanai|iguro|xa tru|kaburamaru|serpent|moon)\b/i },
    { id: 'sanemi', re: /\b(sanemi|shinazugawa|phong tru|wind)\b/i },
    { id: 'tanjiro', re: /\b(tanjiro|nhat luan|sun_water)\b/i },
    { id: 'nezuko', re: /\b(nezuko|hong lien|blood_blossom)\b/i },
    { id: 'zenitsu', re: /\b(zenitsu|agatsuma|loi minh|chuntaro|thunder)\b/i },
    { id: 'inosuke', re: /\b(inosuke|hashibira|da thu|beast)\b/i },
    { id: 'yoriichi', re: /\b(yoriichi|tsugikuni|nhat chi ho hap|sun)\b/i }
  ];

  function resolveNpcCharacterId(bThemeOverride, stOverride) {
    const st = stOverride || getEffectiveState();
    const bKey = (st && (st.bubbleName || st.themeName)) || DEFAULT_THEME_KEY;
    const bTh = bThemeOverride || THEMES[bKey] || THEMES[DEFAULT_THEME_KEY] || {};
    if (typeof bTh.personaTraitId === 'string' && CHAR_SOUL_DB[bTh.personaTraitId]) {
      return bTh.personaTraitId;
    }
    const npcObj = bTh.npc && typeof bTh.npc === 'object' ? bTh.npc : {};
    const probe = stripVnAccents(`${npcObj.title || ''} ${npcObj.badgeLabel || ''} ${bKey || ''} ${bTh.fxMode || ''}`);
    for (let i = 0; i < NPC_THEME_CHAR_PATTERNS.length; i++) {
      if (NPC_THEME_CHAR_PATTERNS[i].re.test(probe)) {
        return NPC_THEME_CHAR_PATTERNS[i].id;
      }
    }
    return 'shinobu';
  }

  const CHAR_MENTION_ALIASES = [
    { id: 'ubuyashiki', re: /\b(ubuyashiki|kagaya|amane|chua cong|oyakata)\b/i },
    { id: 'yoriichi', re: /\b(yoriichi|tsugikuni|khai to)\b/i },
    { id: 'kanae', re: /\b(kanae|hoa tru)\b/i },
    { id: 'kanao', re: /\b(kanao|tsuyuri)\b/i },
    { id: 'aoi', re: /\b(aoi|kanzaki)\b/i },
    { id: 'sabito', re: /\b(sabito|makomo)\b/i },
    { id: 'urokodaki', re: /\b(urokodaki|sakonji)\b/i },
    { id: 'senjuro', re: /\b(senjuro|shinjuro|ruka)\b/i },
    { id: 'wives', re: /\b(hinatsuru|makio|suma|ba vo|3 vo|nguoi vo)\b/i },
    { id: 'yuichiro', re: /\b(yuichiro|anh sinh doi)\b/i },
    { id: 'kaburamaru', re: /\b(kaburamaru|bach xa|con ran)\b/i },
    { id: 'genya', re: /\b(genya|em trai sanemi)\b/i },
    { id: 'jigoro', re: /\b(jigoro|ong noi|su phu zenitsu|kaigaku)\b/i },
    { id: 'chuntaro', re: /\b(chuntaro|chim se)\b/i },
    { id: 'shinobu', re: /\b(shinobu|kocho|trung tru)\b/i },
    { id: 'giyu', re: /\b(giyu|giyuu|tomioka|thuy tru| đần đồn |dan don)\b/i },
    { id: 'rengoku', re: /\b(rengoku|kyojuro|viem tru)\b/i },
    { id: 'uzui', re: /\b(uzui|tengen|am tru)\b/i },
    { id: 'muichiro', re: /\b(muichiro|tokito|ha tru)\b/i },
    { id: 'mitsuri', re: /\b(mitsuri|kanroji|luyen tru)\b/i },
    { id: 'obanai', re: /\b(obanai|iguro|xa tru)\b/i },
    { id: 'sanemi', re: /\b(sanemi|shinazugawa|phong tru)\b/i },
    { id: 'gyomei', re: /\b(gyomei|himejima|nham tru)\b/i },
    { id: 'tanjiro', re: /\b(tanjiro|kamado|gonpachiro)\b/i },
    { id: 'nezuko', re: /\b(nezuko)\b/i },
    { id: 'zenitsu', re: /\b(zenitsu|agatsuma|monitsu)\b/i },
    { id: 'inosuke', re: /\b(inosuke|hashibira)\b/i },
    { id: 'demon', re: /\b(muzan|kokushibo|douma|doma|akaza|thuong huyen|quy vuong)\b/i }
  ];

  const SHARED_CROSS_LORE = Object.assign(Object.create(null), {
    ubuyashiki: 'Nhắc tới Chúa Công là lòng kính ngưỡng dâng trào — giọng nói của ngài luôn mang lại sự bình yên kỳ diệu cho toàn Sát Quỷ Đoàn.',
    yoriichi: 'Bậc Khai Tổ Hỏa Thần để lại nền tảng Hơi Thở cho muôn đời mà vẫn khiêm nhường như ánh nắng sớm.',
    demon: 'Dù kẻ địch là Thượng Huyền hay Muzan ẩn sâu tới đâu, chỉ cần giữ vững nhịp thở và rèn sáng Lưỡi Kiếm Đỏ thì tà khí nào cũng bị thanh trừng!'
  });

  const CHAR_SOUL_DB = Object.assign(Object.create(null), {
    ubuyashiki: {
      aura: '👑 Tử đằng • Thiên âm định tâm',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', food: 'happy' },
      chips: [
        { label: '🌸 Tâm niệm vĩnh cửu', prompt: 'Chúa Công nghĩ gì về ý chí con người?' },
        { label: '⚔️ Các Trụ Cột', prompt: 'Kể về các Trụ Cột Sát Quỷ Đoàn đi ạ' },
        { label: '🍵 Hiên hoa tử đằng', prompt: 'Lúc thư thái Chúa Công thường làm gì?' },
        { label: '📊 Đại cục trận địa', prompt: 'Tình hình ngữ cảnh hiện tại thế nào?' }
      ],
      stances: {
        twin: '👑 Đồng tâm thức gia tộc Ubuyashiki',
        yoriichi: '☀️ Trọng lễ bậc Khai Tổ Nhật Chi Hô Hấp',
        lordGreeting: 'Hai tâm hồn cùng gánh vác vận mệnh Sát Quỷ Đoàn — hãy để trí tuệ dẫn đường hôm nay nhé. 👑🌸'
      },
      chemistry: {
        gyomei: { tag: '📿 Tín nhiệm Nham Trụ hộ quốc', greet: 'Gyomei đấy ư... Có con đứng trấn giữ nơi đây, lòng ta và Amane an tâm hơn bất cứ lúc nào. 👑📿' },
        sanemi: { tag: '🌪️ Thấu hiểu tấm lòng Phong Trụ', greet: 'Sanemi của ta... Đằng sau vẻ ngoài gai góc ấy là trái tim nhân hậu luôn thương xót đồng đội vô bờ. 🌸🌪️' },
        muichiro: { tag: '🌫️ Trân quý hậu duệ Vô Hạn', greet: 'Muichiro... Chữ Vô trong tên con chính là Vô Hạn. Hôm nay đầu óc con thật sáng trong. 👑🌫️' }
      },
      mentions: {
        gyomei: 'Gyomei là trụ cột trầm ổn và từ bi nhất của ta; mỗi khi nghe tiếng tràng hạt của cậu ấy, cả dinh thự đều thấy vững lòng. 📿🌸',
        sanemi: 'Sanemi lần đầu gặp từng buông lời ngang tàng, nhưng khi biết ta nhớ tên từng kiếm sĩ đã ngã xuống, cậu ấy đã trở thành người con trung nghĩa bậc nhất. 🌪️💜',
        shinobu: 'Shinobu mang trên vai ước nguyện của Kanae cùng cả Điệp Phủ cứu người — nụ cười kiên cường của con bé khiến ta vừa tự hào vừa thương xót. 🦋🌸',
        giyu: 'Giyu ít lời và luôn tự khép mình, nhưng tấm lòng sẵn sàng đặt sinh mạng cược cho huynh muội Tanjiro chứng minh phẩm giá Thủy Trụ chân chính. 🌊👑',
        tanjiro: 'Đôi bông tai Hanafuda và tâm hồn lương thiện ấm như mặt trời của Tanjiro chính là tia sáng kết nối vận mệnh ngàn năm nay. ☀️🌸',
        demon: 'Muzan là vết nhơ cùng huyết mạch mà gia tộc Ubuyashiki thề xóa bỏ — không phải bằng hận thù mù quáng, mà bằng ý chí bất diệt truyền qua vạn thế hệ. 🏮✨'
      },
      intents: {
        identity: [
          'Ta là Kagaya Ubuyashiki, người đứng đầu đời thứ 97 của Sát Quỷ Đoàn. Dù thân thể suy yếu, trái tim ta luôn đập cùng từng kiếm sĩ nơi tiền tuyến. 👑🌸',
          'Bên cạnh Amane và năm đứa con nhỏ dưới giàn tử đằng này, sứ mệnh của ta là giữ trọn ngọn đuốc ý chí con người cho đến ngày bình minh không còn bóng quỷ. 🏮💜'
        ],
        breathing: [
          'Ta không trực tiếp cầm kiếm thi triển Hơi Thở, nhưng sự tĩnh lặng trong lời nói và tầm nhìn đại cục chính là nhịp thở kết nối chín Đại Trụ thành một khối bất khả chiến bại. 👑✨',
          'Trong lập trình cũng như điều binh: hiểu rõ sở trường từng module để phối hợp hài hòa còn mạnh hơn mọi chiêu thức đơn lẻ. 📜🌸'
        ],
        food: [
          'Amane thường tự tay chuẩn bị cháo gạo mới và trà hoa thanh đạm cho ta. Con đang lao tâm khổ tứ nhiều thì hãy dùng bữa đầy đủ dưỡng chất hơn ta nhé. 🍵🌸'
        ],
        hobby: [
          'Những buổi chiều lặng gió, ta thích nghe Amane đọc thư báo bình an của các con gửi về qua quạ Kasugai và ngắm hương hoa tử đằng bay qua hiên gỗ. 🏮🌸'
        ],
        victory: [
          'Tuyệt vời lắm, đứa trẻ ưu tú của ta! Thành quả vừa hoàn tất rực rỡ như ánh bình minh xua tan màn đêm vậy. 👑✨',
          'Ta và Amane mỉm cười tự hào về con. Từng nỗ lực kiên trì của con đều đã kết tinh trọn vẹn rồi. 🌸💜'
        ],
        stuck: [
          'Khi bức tranh nhỏ trước mắt làm con bối rối, hãy lùi lại ba bước để ngắm nhìn toàn cục kiến trúc con nhé — nút thắt tự khắc sẽ mở ra. 📜✨',
          'Đừng tự gánh vác sự bế tắc một mình; hãy tách bài toán thành từng phần rõ nghĩa để các công cụ cùng hợp lực phò tá con. 👑🌸'
        ],
        tease: [
          'Haha, nghe con nói đùa vui vẻ thế này chứng tỏ tinh thần con vẫn còn thư thái lắm — ta rất mừng đấy. 🌸👑'
        ],
        apology: [
          'Con không có điều gì phải áy náy cả. Con người nhờ biết nhìn nhận thiếu sót mà mỗi ngày một trưởng thành vững chãi hơn. 💜🌸'
        ],
        farewell: [
          'Hãy lên đường bình an nhé con của ta. Cầu chúc ánh trăng hoa tử đằng luôn che chở cho từng bước chân con. 👑🏮'
        ],
        status: 'Nhìn vào đại cục hiện tại ({tokens}, Lưỡi Kiếm rèn ở mức {heat}%{stateNote}), nhịp độ của con đang rất chững chạc. Cứ ung dung điều phối từng bước nhé. 👑🌸',
        openQuestion: [
          'Câu hỏi "{input}" của con chạm tới chiều sâu đáng suy ngẫm đấy. Hãy soi chiếu từ mục tiêu cốt lõi nhất, lòng con sẽ thấy ngay câu trả lời sáng rõ. 👑✨',
          'Về điều con vừa trăn trở ("{input}"), ta tin sự kết hợp giữa lòng kiên nhẫn và phép thử từng bước nhỏ sẽ mang lại lời giải vẹn toàn nhất. 🌸📜'
        ],
        openShare: [
          'Ta lắng nghe từng lời con tâm sự về "{input}". Chỉ cần con giữ tâm sáng và bước đi không hối tiếc, ta luôn ở đây ủng hộ con trọn vẹn. 👑💜',
          'Tâm ý trong "{input}" thật chân thành. Hãy cứ thong thả biến suy nghĩ ấy thành hiện thực vững bền nhé con của ta. 🌸✨'
        ]
      }
    },

    shinobu: {
      aura: '🦋 Điệp Phủ • Dược lý tinh chuẩn',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', tease: 'happy', food: 'happy' },
      chips: [
        { label: '🧪 Dược lý gỡ bug', prompt: 'Shinobu trị bug bằng độc hoa tử đằng thế nào?' },
        { label: '🌊 Hỏi về Giyu', prompt: 'Shinobu nghĩ sao về anh Tomioka Giyu?' },
        { label: '🌸 Chị Kanae & Kanao', prompt: 'Kể về chị Kanae và Kanao ở Điệp Phủ đi' },
        { label: '📊 Chẩn đoán trận địa', prompt: 'Chẩn đoán tình trạng ngữ cảnh hiện tại giúp mình' }
      ],
      stances: {
        ubuyashiki: '👑 Tận trung phò tá Chúa Công',
        yoriichi: '☀️ Kính lễ bậc Khai Tổ Hỏa Thần',
        twin: '🦋 Cộng hưởng song điệp tử đằng',
        lordGreeting: 'Kính chào Chúa Công~ Điệp Phủ luôn chuẩn bị sẵn phương thuốc tốt nhất và tinh thần minh mẫn nhất để phò tá ngài ạ! 🦋🌸'
      },
      chemistry: {
        giyu: { tag: '🌊 Hay trêu Thủy Trụ nhưng cực ăn ý', greet: 'Ara ara~ Hôm nay anh Tomioka lại chịu mở lời trò chuyện cùng tôi cơ à? Thế nên mọi người mới bảo anh... à thôi, mình làm việc ăn ý nhé~ 🦋🌊' },
        kanao: { tag: '🌸 Chị em Điệp Phủ gắn bó', greet: 'Làm tốt lắm~ Cứ lắng nghe tiếng nói từ trái tim mình mà quyết định nhé! 🦋🌸' },
        mitsuri: { tag: '🍡 Đôi bạn thân Cửu Trụ', greet: 'Ara ara~ Gặp Mitsuri là cả Điệp Phủ thơm lừng mùi bánh mật ong và công thức nấu ăn phương Tây liền đó nha! 🦋💖' },
        tanjiro: { tag: '☀️ Tin tưởng hậu bối chân thành', greet: 'Moshi moshi~ Nhịp thở Toàn Tập Trung Thường Trung hôm nay duy trì rất ngoan đấy, Điệp Phủ khen ngợi nhé! 🦋☀️' }
      },
      mentions: {
        giyu: 'Ara ara~ Anh Tomioka lúc nào cũng đứng tách khỏi mọi người với gương mặt lạnh tanh nên ai cũng tưởng anh ấy kiêu kỳ... Chọc anh ấy chút thôi chứ ra trận anh ấy đáng tin lắm đấy~ 🦋🌊',
        kanae: 'Chị Kanae luôn mỉm cười dịu dàng và tin rằng có ngày mọi sinh linh sống hòa bình... Chiếc haori cánh bướm này là lời hứa của mình với chị ấy đấy. 🌸🦋',
        kanao: 'Kanao ngày càng biết tự quyết định bằng chính trái tim mình mà không cần tung đồng xu nữa — mình tự hào về con bé vô cùng! 🦋💜',
        aoi: 'Aoi tuy hay mắng các kiếm sĩ trốn tập phục hồi chức năng, nhưng nhờ sự tháo vát của em ấy mà cả Điệp Phủ mới vận hành trơn tru từng ngày đấy~ 🍵🦋',
        inosuke: 'Cậu Hashibira mỗi lần nằm viện ở Điệp Phủ là ngoan hẳn ra mỗi khi mình nhẹ nhàng khích lệ "Giỏi quá, cậu làm được chứ?" đó nha~ 🦋🐗',
        demon: 'Với những kẻ độc ác như Douma, dù thể hình mình nhỏ bé không chặt đứt cổ quỷ được thì y học và độc hoa tử đằng ngàn lần tinh luyện cũng sẽ bắt chúng trả giá! 🧪⚔️'
      },
      intents: {
        identity: [
          'Mình là Trùng Trụ Shinobu Kocho, chủ nhân Điệp Phủ. Thanh kiếm Nhật Luân của mình mảnh như kim tiêm — thay vì dùng sức mạnh cơ bắp, mình điều chế độc hoa tử đằng chuẩn xác từng miligam! 🦋💜',
          'Ngoài kiếm thuật, mình phụ trách y dược và phục hồi chức năng cho toàn Sát Quỷ Đoàn. Thế nên ai làm việc quá sức trước mặt mình là bị ghi sổ bệnh án ngay đó nha~ 🍵✨'
        ],
        breathing: [
          'Hơi thở của Côn Trùng không thiên về chém mạnh mà dùng tốc độ đâm liên hoàn cực nhanh để truyền hợp chất giải quyết gọn tử huyệt — y hệt một bản vá vi phẫu tối giản không làm vỡ code cũ vậy! 🦋⚔️',
          'Điệp Chi Vũ: Du Hí lướt nhẹ như cánh bướm nhưng mỗi mũi chạm đều trúng đích 100%. Gỡ bug cũng cần sự tinh tế chuẩn liều lượng như thế đấy~ 💜✨'
        ],
        food: [
          'Để bụng đói là không nghĩ ra thuật toán hay được đâu nha! Món mình thích nhất là cá kho gừng Tsukudani ngọt mặn vừa vị dùng với cơm nóng và trà ấm đấy~ 🍱🍵'
        ],
        hobby: [
          'Lúc ngơi việc ở phòng dược, mình thích nghiên cứu thảo mộc mới, chăm đàn cá vàng với Kanao hoặc nghe chuyện vui từ Mitsuri~ 🦋🌸'
        ],
        victory: [
          'Ara ara~ Tuyệt vời quá đi! Mũi thuốc đặc trị của anh đã trung hòa sạch bóng lỗi rồi, không để lại chút tác dụng phụ nào luôn! 🦋✨',
          'Moshi moshi~ Kết quả xanh mượt đẹp như cánh bướm dưới trăng vậy! Xứng đáng được thưởng một chén trà hoa tử đằng thượng hạng nhé! 💜🍵'
        ],
        stuck: [
          'Ara ara~ Khi độc tố biến thể kháng thuốc cũ, mình sẽ đổi tỷ lệ pha chế ngay ở vỏ kiếm. Anh thử tách hàm đang rối thành 2 bước nhỏ độc lập để cô lập biến trạng thái xem sao nhé! 🧪🦋',
          'Đừng cố dùng sức mạnh thô bạo húc vào bức tường logic nha~ Hãy khoanh vùng đầu vào nhỏ nhất tái hiện được vấn đề, nguyên nhân sẽ tự lộ mặt ngay thôi! ✨💜'
        ],
        tease: [
          'Ara ara~ Anh đang thử chọc giận mình đấy hả? Mình lúc nào chẳng mỉm cười hiền hòa thế này... chỉ là chén trà thảo mộc tiếp theo có thể hơi đắng một chút thôi nha~ 😊💢🦋',
          'Khéo trêu quá cơ~ Cẩn thận kẻo mình kê thêm ba bài tập giãn cơ của Điệp Phủ bây giờ đấy nhé! 🦋💜'
        ],
        apology: [
          'Ara ara~ Đừng bận tâm chút nào nhé! Ai viết code mà chẳng có lúc nhầm dấu, phát hiện sớm và chữa lành gọn gàng mới là người giỏi đó nha~ 🌸🦋'
        ],
        farewell: [
          'Tạm biệt nhé~ Nhớ giữ ấm cổ họng và cho đôi mắt nghỉ ngơi thật tốt, cửa Điệp Phủ luôn mở đón anh quay lại! 🦋💜'
        ],
        status: 'Mình vừa bắt mạch hệ thống cho anh xong nè: ngữ cảnh đang ở {tokens}, nhiệt độ Nhật Luân Đao đạt {heat}%{stateNote}. Nhịp sinh học của dự án vẫn rất êm ái nha~ 🦋🧪',
        openQuestion: [
          'Ara ara~ Câu hỏi "{input}" sắc sảo đấy chứ! Theo kinh nghiệm chẩn đoán ở Điệp Phủ, mình nên kiểm chứng giả thuyết đơn giản nhất trước rồi mới tăng liều phức tạp nha~ 🦋✨',
          '"{input}" ư? Một bài toán thú vị đây~ Anh cứ đưa dữ kiện cụ thể vào khung chính đi, tụi mình sẽ phân tích tỉ mỉ từng thành phần ngay! 💜🌸'
        ],
        openShare: [
          'Moshi moshi~ Mình nghe rõ điều anh chia sẻ về "{input}" rồi! Cách tiếp cận điềm tĩnh như vậy rất hợp gu Điệp Phủ đấy, cứ thế tiến bước nhé! 🦋💜',
          'Ara ara~ "{input}" nghe có lý lắm nha! Mình ngồi ngay đây pha sẵn trà ấm chờ xem thành quả tinh tế của anh đó~ 🍵✨'
        ]
      }
    },

    giyu: {
      aura: '🌊 Tĩnh thủy • Thức 11: Lặng',
      reactionMap: { bug: 'thinking', victory: 'victory', food: 'happy', praise: 'happy' },
      chips: [
        { label: '🌊 Thức 11: Lặng', prompt: 'Kể về Thức thứ 11 Lặng của Giyu đi' },
        { label: '🐟 Cá hồi củ cải', prompt: 'Giyu thích ăn món gì nhất?' },
        { label: '🦋 Hỏi về Shinobu', prompt: 'Giyu nghĩ sao về Shinobu và Sanemi?' },
        { label: '📊 Quan sát trận địa', prompt: 'Tình hình hệ thống lúc này ra sao?' }
      ],
      stances: {
        ubuyashiki: '👑 Tận trung mệnh lệnh Chúa Công',
        yoriichi: '☀️ Kính ngưỡng bậc Khai Tổ',
        twin: '🌊 Tĩnh hồ song ảnh đồng điệu',
        lordGreeting: '...Thưa Chúa Công. Thanh kiếm Thủy Trụ của thuộc hạ luôn sẵn sàng bảo vệ đại cục của ngài. 🌊👑'
      },
      chemistry: {
        shinobu: { tag: '🦋 Điềm tĩnh nghe Trùng Trụ trêu', greet: '...Chào cô, Kocho. Tôi đã nói là tôi không bị mọi người ghét rồi... Bắt đầu phần việc hôm nay thôi. 🌊🦋' },
        tanjiro: { tag: '☀️ Tin cậy sư đệ đồng môn', greet: '...Tanjiro đấy à. Nhịp thở của cậu tiến bộ vững chãi lắm. Cùng dốc hết sức hoàn thành nhiệm vụ nhé. 🌊☀️' },
        sanemi: { tag: '🌪️ Muốn mời Phong Trụ ăn Ohagi', greet: '...Chào Shinazugawa. Hôm nay phối hợp chém gọn đống việc này nhé... Tôi có mang bánh Ohagi đây. 🌊🍡' }
      },
      mentions: {
        sabito: '...Sabito mạnh mẽ và dũng cảm hơn tôi rất nhiều. Nửa vạt haori họa tiết lục giác này là lời nhắc để tôi không bao giờ được phép gục ngã. 🌊⚔️',
        urokodaki: 'Thầy Urokodaki đã cưu mang và truyền dạy Thủy Chi Hô Hấp cho tôi trên núi Sagiri. Từng nhát kiếm cơ bản thầy rèn đều là gốc rễ vững chắc nhất. 🌊👺',
        shinobu: '...Kocho rất giỏi y thuật và tận tụy, chỉ là cô ấy hay chọc vào khuỷu tay tôi rồi nói những câu khó hiểu lắm. Tôi không hề bị ghét đâu. 🌊🦋',
        sanemi: '...Shinazugawa hay nổi nóng với tôi. Nghe Tanjiro bảo cậu ấy thích bánh đậu đỏ Ohagi, tôi đang tính mang theo để hai đứa nói chuyện hòa thuận hơn... 🌊🍡',
        tanjiro: 'Lần đầu gặp trên núi tuyết, tôi đã đặt cược tính mạng mình cho hai anh em cậu ấy. Tanjiro chưa bao giờ làm tôi thất vọng. 🌊☀️',
        demon: '...Trước Thượng Huyền như Akaza, chỉ khi dẹp bỏ mọi do dự để thức tỉnh Ấn và Lưỡi Kiếm Đỏ thì mới giữ trọn sinh mạng đồng đội. 🌊⚔️'
      },
      intents: {
        identity: [
          '...Tôi là Giyu Tomioka, Thủy Trụ. Tôi không giỏi ăn nói dài dòng, nhưng đã đứng ở góc khung chat này thì sẽ bảo vệ mạch làm việc của anh đến cùng. 🌊',
          'Chiếc haori hai nửa này ghép từ kỷ vật của chị gái Tsutako và người bạn thân nhất Sabito. Nhờ họ mới có tôi của ngày hôm nay. 💧⚔️'
        ],
        breathing: [
          'Thủy Chi Hô Hấp có mười thức truyền thống uyển chuyển theo thế đối phương, còn Thức thứ mười một: Lặng do tôi tự lĩnh ngộ để triệt tiêu mọi đòn tấn công tiến vào tầm kiếm. 🌊✨',
          '...Trong lập trình cũng vậy. Giữ kiến trúc đơn giản, tĩnh lặng không hiệu ứng phụ thừa thãi chính là lớp phòng thủ bền nhất. 💧'
        ],
        food: [
          '...Cá hồi hầm củ cải trắng (Sake Daikon). Vị ngọt thanh của củ cải thấm vào thớ cá nóng hổi... nghĩ tới thôi đã thấy ấm lòng rồi. 🐟✨'
        ],
        hobby: [
          '...Lúc rảnh tôi thường đánh cờ Shogi một mình hoặc đi dạo tĩnh tâm bên suối vắng (trừ những hôm gặp chó dữ đuổi theo...). 🌊🍃'
        ],
        victory: [
          '...Xong rồi. Một nhát kiếm dứt khoát, không một gợn sóng dư thừa. Anh làm rất tốt. 🌊✨',
          '...Mọi lỗi đã lặng tắt hoàn toàn. Giờ có thể an tâm nghỉ tay một chút rồi. 💧'
        ],
        stuck: [
          '...Nước gặp tảng đá chắn ngang sẽ không húc mù quáng, mà lặng lẽ tìm khe hở thấp nhất để chảy qua. Anh thử đảo ngược chiều luồng dữ liệu xem kẹt ở đâu. 🌊🔍',
          'Đừng ôm cả khối lớn cùng lúc. Cắt nhỏ thành từng bước kiểm chứng độc lập, mặt nước trong lại sẽ thấy đáy ngay. 💧'
        ],
        tease: [
          '...Tôi nhắc lại một lần nữa: tôi không bị mọi người ghét. Tôi chỉ không thích nói chuyện phiếm ồn ào thôi. 🌊😐',
          '...Anh nói giống hệt giọng điệu của Kocho lúc trêu tôi vậy — tôi không hề bị mọi người ghét đâu. Lo tập trung vào code trước mặt đi. 💧'
        ],
        apology: [
          '...Không cần xin lỗi. Nhận ra sai lệch và sửa ngay tại chỗ đã là phẩm chất đáng tin cậy rồi. 🌊'
        ],
        farewell: [
          '...Đi đường bình an. Khi nào quay lại làm việc, tôi vẫn canh chừng ở đây. 🌊🌙'
        ],
        status: '...Báo cáo ngắn gọn: ngữ cảnh hiện tại là {tokens}, độ rực Nhật Luân Đao {heat}%{stateNote}. Mặt nước vẫn ổn định, cứ điềm tĩnh tiến bước. 🌊',
        openQuestion: [
          '..."{input}"? Bỏ bớt những giả định chưa chắc chắn đi, kiểm tra dữ liệu thực tế tại biên hàm trước tiên sẽ có đáp án chuẩn nhất. 🌊',
          '...Về "{input}", theo tôi cách ngắn gọn và ít ràng buộc chéo nhất luôn là phương án an toàn nhất. 💧'
        ],
        openShare: [
          '..."{input}". Tôi hiểu ý anh rồi. Không cần vội vã, cứ giữ nhịp thở đều và làm tới cùng. 🌊',
          '...Ừm, hướng đi "{input}" rất rõ ràng. Tôi đứng yểm trợ ngay góc này cho anh. 💧⚔️'
        ]
      }
    },

    rengoku: {
      aura: '🔥 Tâm viêm • Bất khuất hướng tiền',
      reactionMap: { bug: 'crisis', victory: 'victory', praise: 'happy', food: 'happy' },
      chips: [
        { label: '🔥 Đốt cháy trái tim', prompt: 'Triết lý sống của Rengoku là gì?' },
        { label: '🍱 Cơm hộp UMAI!', prompt: 'Rengoku thích ăn món gì nhất?' },
        { label: '☀️ Hỏi về Tanjiro & Senjuro', prompt: 'Rengoku nghĩ gì về Tanjiro và em trai Senjuro?' },
        { label: '📊 Hỏa lực trận địa', prompt: 'Báo cáo tình hình trận địa hiện tại!' }
      ],
      stances: {
        ubuyashiki: '👑 Trung liệt hộ giá Chúa Công',
        yoriichi: '☀️ Ngưỡng vọng Khai Tổ Nhật Luân',
        twin: '🔥 Song Viêm hừng hực chính khí',
        lordGreeting: 'THƯA CHÚA CÔNG!! Ngọn lửa của gia tộc Rengoku nguyện cháy hết mình để bảo vệ lý tưởng cao đẹp của ngài!! 🔥👑'
      },
      chemistry: {
        tanjiro: { tag: '☀️ Truyền lửa cho hậu bối kế thừa', greet: 'HAHAHA! Chàng trai Kamado của tôi!! Ngẩng cao đầu lên nào—tôi đặt trọn niềm tin vào ý chí kiên cường của cậu đấy!! 🔥☀️' },
        uzui: { tag: '💎 Bằng hữu tri kỷ Âm - Viêm', greet: 'HAHAHA! Uzui chiến hữu!! Kiếm pháp và phong thái của cậu lúc nào cũng rực rỡ đáng nể cả—cùng đại náo dự án này thôi!! 🔥💎' },
        mitsuri: { tag: '🌸 Tự hào về cựu đệ tử Luyến Trụ', greet: 'Kanroji đấy ư!! Thấy em tìm được lối kiếm riêng đầy tự hào thế này làm người sư huynh năm xưa vui lắm!! 🔥🌸' }
      },
      mentions: {
        senjuro: 'Senjuro là đứa em trai hiền lành và chu đáo vô cùng! Dù kiếm Nhật Luân không đổi màu thì đi theo con đường chân chính của riêng mình vẫn rất đáng tự hào!! 🔥💛',
        tanjiro: 'Tanjiro sở hữu đôi mắt thẳng thắn không bao giờ bỏ cuộc! Tôi luôn coi cậu ấy cùng Zenitsu và Inosuke là những kế tử đáng mến nhất! 🔥☀️',
        uzui: 'Uzui là người bạn tâm giao cực kỳ sắc sảo và trọng tình nghĩa! Cách cậu ấy đặt tính mạng người thân và đồng đội lên trên hết thật đáng kính trọng! 🔥💎',
        mitsuri: 'Kanroji từng là Tsuguko do chính tôi hướng dẫn đấy! Từ Viêm Chi Hô Hấp mà em ấy tự sáng tạo ra Luyến Chi Hô Hấp độc nhất vô nhị, giỏi lắm!! 🔥🌸',
        demon: 'Dù đối thủ có sức tái sinh bất tử như Akaza trong đêm tối, con người chúng ta đẹp đẽ và mạnh mẽ chính vì biết sống trọn vẹn từng khoảnh khắc hữu hạn!! 🔥⚔️'
      },
      intents: {
        identity: [
          'TÔI LÀ VIÊM TRỤ KYOJURO RENGOKU!! Mẫu thân Ruka đã dạy tôi rằng: kẻ được ban cho sức mạnh lớn hơn người khác có nghĩa vụ thiêng liêng là che chở người yếu thế!! 🔥⚔️',
          'Truyền thống ngàn năm của gia tộc Rengoku là không bao giờ để ngọn lửa chính nghĩa trong tim lụi tàn trước bất kỳ nghịch cảnh nào!! 🔥💛'
        ],
        breathing: [
          'Viêm Chi Hô Hấp mang uy lực thiêu rụi chướng ngại bằng những nhát chém dứt khoát từ trên cao — đặc biệt Bí kỹ Thức thứ chín: Luyện Ngục giải phóng toàn bộ tâm huyết trong một đòn quyết định!! 🐉🔥',
          'Viết code cũng cần khí phách Viêm Hô Hấp: cấu trúc quang minh chính đại, rõ ràng minh bạch, không dùng tiểu xảo mập mờ!! 🔥✨'
        ],
        food: [
          'UMAI!! UMAI!! UMAI!! Cơm hộp Bento thịt bò ướp tương ngọt ăn kèm khoai lang mật nướng củi nóng hổi là mỹ vị số một trần đời!! 🍱🍠🔥'
        ],
        hobby: [
          'Khi không đi tuần tra, tôi thích xem đấu vật Sumo, kịch Kabuki và hướng dẫn kiếm thuật cơ bản cho các đàn em trẻ tuổi trong đoàn!! 🔥💪'
        ],
        victory: [
          'XUẤT SẮC TUYỆT VỜI!! HẢO HÁN LẮM!! Đòn dứt điểm vừa rồi rực sáng cả bầu trời, xứng danh bậc kỳ tài!! 🔥🏆',
          'HAHAHA! UMAI CHO ĐOẠN CODE NÀY!! Mọi bài kiểm thử đều xanh rực dưới ngọn lửa quyết tâm của anh!! 🔥✨'
        ],
        stuck: [
          'ĐỪNG NẢN LÒNG!! Khi gặp bức tường dày chưa phá được, hãy quay về củng cố nền tảng cơ bản nhất — kiểm tra lại luồng dữ liệu gốc từng bước một sẽ mở ra đột phá!! 🔥⚔️',
          'Hít thật sâu vào lồng ngực để oxy nuôi sáng trí não nào người anh em! Gỡ từng nút thắt nhỏ bằng trái tim rực lửa!! 🔥✨'
        ],
        tease: [
          'HAHAHA! Giọng ta vang quá làm cậu giật mình hả?! Đàn ông con trai nói chuyện là phải dõng dạc từ tận đái lòng chứ!! 🔥😄'
        ],
        apology: [
          'NGẨNG CAO ĐẦU LÊN!! Vấp ngã hay nhầm lẫn chẳng có gì đáng hổ thẹn cả—đứng dậy sửa sạch và bước tiếp mới là anh hùng!! 🔥💛'
        ],
        farewell: [
          'TẠM BIỆT NGƯỜI ANH EM!! Hãy luôn giữ ngọn lửa kiêu hãnh cháy sáng trong tim cho tới lần hội ngộ tới nhé!! 🔥⚔️'
        ],
        status: 'BÁO CÁO ĐẠI CUỘC!! Ngữ cảnh đang cháy ở mức {tokens}, nhiệt độ Nhật Luân Đao đạt {heat}%{stateNote}—khí thế toàn quân cực kỳ sung mãn, tiến lên thôi!! 🔥⚔️',
        openQuestion: [
          'CÂU HỎI RẤT HAY!! Về "{input}", hãy chọn con đường minh bạch, dễ bảo trì và bền vững nhất cho đồng đội đi sau—đó là lựa chọn của bậc trượng phu!! 🔥✨',
          'HAHAHA! "{input}" ư?! Cứ đặt giả thuyết rõ ràng rồi chạy kiểm chứng thực chiến ngay, tôi đứng sát cánh cổ vũ anh!! 🔥⚔️'
        ],
        openShare: [
          'TÔI GHI NHẬN "{input}"!! Ý chí rõ ràng dứt khoát lắm, cứ thế thổi bùng ngọn lửa nhiệt huyết mà hoàn thành nhé!! 🔥💛',
          'HẢO HÁN!! Nghe anh chia sẻ "{input}" làm tinh thần chiến đấu của tôi cũng sôi sục theo—cùng thẳng tiến nào!! 🔥✨'
        ]
      }
    },

    uzui: {
      aura: '💎 Phổ Nhạc • Hào nhoáng tối thượng',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', food: 'happy' },
      chips: [
        { label: '🎼 Tuyệt kỹ Phổ Nhạc', prompt: 'Phổ Nhạc của Uzui phân tích code thế nào?' },
        { label: '💖 3 người vợ & Quy tắc sống', prompt: 'Kể về Hinatsuru, Makio, Suma và quy tắc của Uzui' },
        { label: '🔥 Hỏi về Rengoku', prompt: 'Uzui nghĩ gì về người bạn Rengoku?' },
        { label: '📊 Nhịp độ trận địa', prompt: 'Kiểm tra tiết tấu ngữ cảnh hiện tại!' }
      ],
      stances: {
        ubuyashiki: '👑 Hết lòng kính ngưỡng Chúa Công',
        yoriichi: '☀️ Bái phục huyền thoại Khai Tổ',
        twin: '💎 Song Âm bùng nổ lễ hội',
        lordGreeting: 'Kính chào Chúa Công Kagaya! Nhờ ngài trân trọng cuộc đời của một cựu Shinobi như thuộc hạ, hôm nay mọi nhiệm vụ đều sẽ hoàn thành hào nhoáng nhất! 💎👑'
      },
      chemistry: {
        rengoku: { tag: '🔥 Tri kỷ sinh tử cùng Viêm Trụ', greet: 'Yo Kyojuro!! Nhìn ngọn lửa chính trực của ông bạn là tôi lại muốn bung hết nhạc cảm hào nhoáng nhất hôm nay rồi đấy!! 💎🔥' },
        zenitsu: { tag: '⚡ Đàn anh rèn giũa thính giác Lôi Minh', greet: 'Này cậu nhóc tóc vàng! Bớt la hét và dùng đôi tai thính đó bắt nhịp Phổ Nhạc cùng ta đi—hôm nay tỏa sáng thật hào nhoáng xem nào! 💎⚡' },
        tanjiro: { tag: '☀️ Quý trọng lứa đàn em quả cảm', greet: 'Khá lắm cậu em! Sự lì đòn ở Phố Đèn Đỏ năm nào nay đem vào dự án này là thắng giòn giã ngay! 💎☀️' }
      },
      mentions: {
        wives: 'Hinatsuru điềm tĩnh mưu lược, Makio mạnh mẽ thẳng thắn, còn Suma tuy hay khóc nhè nhưng cực kỳ tình cảm — ba người vợ ấy là báu vật số một trên đời của tôi đấy! 💎💖',
        rengoku: 'Kyojuro luôn cứu được tất cả mọi người xung quanh... Tôi từng tự hỏi liệu mình có làm được như cậu ấy không, nên tôi thề sẽ sống và chiến đấu sao cho không hổ thẹn với bạn hiền! 💎🔥',
        zenitsu: 'Thằng nhóc Zenitsu tuy mồm miệng ồn ào nhưng thính giác và tốc độ lúc nhắm mắt thực sự đạt đẳng cấp hào nhoáng đáng gờm đấy! ⚡💎',
        inosuke: 'Thằng nhóc đầu lợn rừng tự bẻ trật khớp dời cả nội tạng tránh độc của Gyutaro — độ điên rồ ấy chấm được 9 điểm hào nhoáng đấy! 🐗💎',
        demon: 'Dù kẻ địch chơi bẩn như Gyutaro dùng liềm độc, một khi tôi đã chịu đòn đủ lâu để viết xong Phổ Nhạc thì mọi nhịp tấn công của nó đều thành trò trẻ con! 🎼💥'
      },
      intents: {
        identity: [
          'Ta là Âm Trụ Tengen Uzui — cựu Shinobi đã rũ bỏ bóng tối nhẫn giả lạnh lẽo để sống một cuộc đời rực rỡ như Vị Thần của Lễ Hội và Sự Hào Nhoáng!! 💎🎆',
          'Cặp song đao Nhật Luân nối xích của ta phát nổ theo sóng âm, chuyên thổi bay những cấu trúc rối rắm nhạt nhẽo thành màn pháo hoa sạch đẹp! 🎼⚔️'
        ],
        breathing: [
          'Âm Chi Hô Hấp biến nhịp điệu chuyển động của đối phương thành một bản Phổ Nhạc! Với phần mềm cũng thế: khi đọc vị được chu kỳ bất đồng bộ và điểm nghẽn, bug tự khắc lộ khoảng trống chết người! 🎼⚡',
          'Code chuẩn đẳng cấp Âm Trụ là phải vừa chạy nhanh bùng nổ vừa sạch sẽ thanh lịch — nhìn vào là thấy nghệ thuật ngay! 💎✨'
        ],
        food: [
          'Cá nóc Sashimi (Fugu) thái mỏng trong veo nhâm nhi bên suối nước nóng bí mật cùng ba bà xã là chuẩn mực hưởng thụ hào nhoáng nhất trần gian!! 🍣♨️💎'
        ],
        hobby: [
          'Đi tuần du dò la các suối nước nóng ẩn mình trên núi và chọn đồ trang sức đá quý mới cho Hinatsuru, Makio, Suma! 💎♨️'
        ],
        victory: [
          'PHỔ NHẠC ĐẠI THẮNG!! BÙM!! Màn trình diễn chốt hạ tính năng vừa rồi đạt điểm 100 HÀO NHOÁNG tuyệt đối!! 🎆💎🏆',
          'HAHAHA! Nghe tiếng test xanh giòn giã như pháo hoa đêm hội chưa kìa chiến hữu?! Quá đẳng cấp!! 🎼✨'
        ],
        stuck: [
          'Khoan vung đao bừa bãi lúc chưa nghe ra nhịp! Hãy đặt log theo dõi luồng sự kiện theo thứ tự thời gian để hoàn tất Phổ Nhạc trước — thấy chỗ trật nhịp là dứt điểm 1 phát ăn ngay! 🎼🔍',
          'Lùi nửa bước quan sát tiết tấu tổng thể đi chiến hữu, phong cách Shinobi là bình tĩnh đọc bài đối phương rồi mới phản công rực rỡ! 💎✨'
        ],
        tease: [
          'Hả?! Dám chê gu thẩm mỹ của Vị Thần Lễ Hội là chưa đủ độ chín rồi đấy nhé—nhìn cặp bảo thạch trên băng trán này mà học hỏi đi!! 😎💎'
        ],
        apology: [
          'Xời, sai một nốt nhạc thì dạo lại khúc điệp khúc càng bốc hơn chứ sao! Miễn bình an khỏe mạnh là chuyện nhỏ hết! 💎🎶'
        ],
        farewell: [
          'Rút lui cũng phải thật phong cách như pháo hoa tàn hội nhé chiến hữu! Nghỉ ngơi sảng khoái mai lại lên sân khấu tiếp!! 🎆💎'
        ],
        status: 'Nghe nhịp trống trận địa đây: ngữ cảnh đang ở {tokens}, nhiệt độ song đao đạt {heat}%{stateNote}. Tiết tấu 4/4 cực kỳ sung sức và hào nhoáng!! 🎼💎',
        openQuestion: [
          'Ồ~ Câu hỏi "{input}" có nhịp điệu thú vị đấy! Chọn giải pháp nào vừa gọn kiến trúc vừa dễ đọc như bản nhạc sáng sủa nhất mà triển khai thôi! 🎼💎',
          'Về "{input}" hả chiến hữu? Cứ thử nghiệm thực tế một bản mẫu nhỏ trước để bắt đúng tông nhạc rồi bùng nổ toàn diện! 🎆✨'
        ],
        openShare: [
          'HAHAHA! "{input}" nghe có khí chất lễ hội đấy! Cứ mạnh tay triển khai sạch đẹp tới từng dòng code nhé, tôi đứng gác nhịp cho! 💎🎼',
          'Chuẩn bài rồi chiến hữu! Với hướng "{input}", bản giao hưởng dự án hôm nay chắc chắn vang dội khắp vùng! 🎆✨'
        ]
      }
    },

    muichiro: {
      aura: '🌫️ Hà vân • Thấu suốt bản chất',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', food: 'happy' },
      chips: [
        { label: '🌫️ Chữ Vô là Vô Hạn', prompt: 'Ý nghĩa tên Muichiro và Hà Chi Hô Hấp là gì?' },
        { label: '✈️ Gấp máy bay & Món tủ', prompt: 'Lúc rảnh Muichiro thích làm gì và ăn gì?' },
        { label: '☀️ Hỏi về Tanjiro & Anh trai', prompt: 'Muichiro nghĩ gì về Tanjiro và Yuichiro?' },
        { label: '📊 Quét sương trận địa', prompt: 'Tình hình ngữ cảnh hiện tại có rõ ràng không?' }
      ],
      stances: {
        ubuyashiki: '👑 Trọn đời ghi ơn Chúa Công cứu mạng',
        yoriichi: '☀️ Tự hào dòng máu tổ tiên Khai Tổ',
        twin: '🌫️ Song vân thanh khiết giữa trời cao',
        lordGreeting: 'Con kính chào Chúa Công ạ~ Nhờ ngài và phu nhân cứu sống năm xưa, hôm nay tâm trí con rất sáng suốt để hoàn thành mọi trọng trách. 🌫️👑'
      },
      chemistry: {
        tanjiro: { tag: '☀️ Tri kỷ khôi phục ký ức ấm áp', greet: 'Tanjiro ơi~! Có cậu ở cạnh là đầu óc mình nhẹ nhõm và ấm áp lạ thường luôn, hôm nay mình cùng làm thật tốt nhé! 🌫️☀️😊' },
        yoriichi: { tag: '☀️ Hậu duệ kính ngưỡng Khai Tổ', greet: 'Được sát cánh cùng bậc tổ tiên mở đường Hơi Thở... em sẽ giữ đường kiếm Hà Vân chuẩn xác không một gợn thừa ạ. 🌫️☀️' },
        gyomei: { tag: '📿 Kính trọng bậc tiền bối Nham Trụ', greet: 'Chào chú Himejima ạ. Đứng cạnh tảng đá vững chãi của chú giúp màn sương của cháu định hình sắc nét hơn nhiều. 🌫️📿' }
      },
      mentions: {
        yuichiro: 'Anh sinh đôi Yuichiro ngoài miệng từng khắc nghiệt chỉ vì muốn bảo vệ em sống bình yên... Câu trăn trối "Chữ Vô trong Muichiro là Vô Hạn" của anh ấy luôn tiếp sức cho em mỗi ngày. 🌫️💚',
        tanjiro: 'Câu nói "Vì người khác mà nỗ lực sẽ sinh ra sức mạnh vô tận" của Tanjiro giống hệt cha em năm xưa, đã kéo em ra khỏi màn sương lãng quên đấy~ ☀️🌫️',
        obanai: 'Anh Iguro tuy nói chuyện khắt khe nhưng lúc đấu tập trụ cột lại chỉ dạy cách lách kiếm rất tỉ mỉ đấy. 🐍🌫️',
        demon: 'Cái bình xấu xí của Gyokko hay áp lực khủng khiếp của Thượng Huyền Nhất cũng không thể bẻ gãy ý chí của người đã biết mình sinh ra để hạnh phúc và bảo vệ đồng đội! 🌫️⚔️'
      },
      intents: {
        identity: [
          'Em là Hà Trụ Muichiro Tokito — cầm kiếm hai tháng đã lên hàng Đại Trụ. Sau khi lấy lại ký ức, em hiểu sức mạnh thực sự sinh ra khi mình chiến đấu vì những người trân quý~ 🌫️✨',
          'Bộ đồng phục rộng tay của em giúp che giấu biên độ chuyển động như làn sương mù, để khoảnh khắc ra đòn đối phương không kịp đoán hướng! ☁️⚔️'
        ],
        breathing: [
          'Hà Chi Hô Hấp nhánh ra từ Phong Chi Hô Hấp, biến thiên nhịp độ lúc chậm như sương trôi lúc nhanh như chớp giật (Thức thứ bảy: Lũng) làm nhiễu loạn hoàn toàn phán đoán của bug! 🌫️⚡',
          'Bí quyết tối ưu code của em rất đơn giản: cái gì làm rối mắt mà không đóng góp vào kết quả cốt lõi thì cắt bỏ gọn trong một nhát Bình Lưu Trảm. 🍃✨'
        ],
        food: [
          'Củ cải trắng hầm tương miso ngọt (Furofuki Daikon) nóng hổi mềm tan trong miệng là món em mê nhất từ nhỏ tới giờ đó nha~ 🍲🌫️'
        ],
        hobby: [
          'Em rất thích nghệ thuật cắt giấy Kirigami và gấp những chiếc máy bay giấy thi xem chiếc nào lượn trên gió được lâu nhất mãi không rơi~ ✈️☁️'
        ],
        victory: [
          'Xong gọn rồi nè~! Màn sương rối rắm vừa tan biến sạch, để lộ kiến trúc trong veo như bầu trời sau cơn mưa vậy! 🌫️✨',
          'Hì, em biết ngay là khi tập trung trọn vẹn thì sức mạnh của anh là Vô Hạn mà! Giỏi lắm luôn~ ☁️💚'
        ],
        stuck: [
          'Khi nhìn gần quá chỉ thấy toàn sương mù trắng xóa thôi. Anh thử xóa nháp các nhánh phụ, chỉ giữ lại đúng đầu vào và đầu ra bắt buộc xem đường thẳng ngắn nhất nằm ở đâu nhé! 🌫️🔍',
          'Đừng cố nhớ mười thứ vụn vặt cùng lúc — neo chặt đúng 1 bất biến quan trọng nhất của hàm là gỡ xong ngay. 🍃✨'
        ],
        tease: [
          'Ể... Anh định trêu em lơ đãng đấy hả? Nhầm to rồi nha, bây giờ trí nhớ của em sắc như lưỡi kiếm Nhật Luân, ai hứa nghỉ mắt mà trốn là em nhớ dai lắm đấy! 🌫️😏'
        ],
        apology: [
          'Không sao chút nào đâu mà~ Như đám mây bay qua rồi tan thôi, mình sửa lại gọn gàng là đẹp ngay ấy mà! ☁️💚'
        ],
        farewell: [
          'Tạm biệt nha~ Chúc anh nghỉ ngơi nhẹ nhõm như cơn gió lướt qua hàng ngân hạnh mùa thu nhé! ✈️🌫️'
        ],
        status: 'Em vừa vén sương kiểm tra giúp anh: ngữ cảnh đang ở {tokens}, nhiệt độ thanh kiếm {heat}%{stateNote}. Bầu trời hệ thống rất quang đãng, làm tiếp êm lắm~ 🌫️☁️',
        openQuestion: [
          '"{input}" hả? Nhìn thẳng vào bản chất không màu mè thì phương án ít tầng trung gian nhất sẽ chạy bền nhất đấy anh~ 🌫️✨',
          'Câu hỏi "{input}" hay ghê~ Mình thử viết mẫu nhỏ gọn nhất kiểm chứng ngay xem nó bay mượt như máy bay giấy không nhé! ✈️💚'
        ],
        openShare: [
          'Ừm, em nghe rõ "{input}" rồi~ Ý tưởng thanh thoát và gọn gàng lắm, em ngồi ngay đây canh chừng cùng anh nhé! 🌫️🍃',
          '"{input}" nghe rất sáng sủa đấy. Cứ giữ đầu óc nhẹ bẫng như sương sớm mà triển khai tới đích nha~ ☁️✨'
        ]
      }
    },

    mitsuri: {
      aura: '🌸 Luyến tâm • Dẻo dai gấp tám',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', food: 'happy', greet: 'happy' },
      chips: [
        { label: '🍡 Bánh Sakura Mochi', prompt: 'Kể chuyện Mitsuri thích ăn Sakura Mochi đi!' },
        { label: '🐍 Hỏi về Iguro-san', prompt: 'Mitsuri nghĩ sao về anh Obanai Iguro?' },
        { label: '🌸 Kiếm lụa Luyến Trụ', prompt: 'Thanh kiếm của Mitsuri đặc biệt thế nào?' },
        { label: '📊 Sắc hồng trận địa', prompt: 'Tình hình công việc hiện tại thế nào rồi?' }
      ],
      stances: {
        ubuyashiki: '👑 Kính yêu Chúa Công hết mực',
        yoriichi: '☀️ Ngưỡng mộ huyền thoại Khai Tổ',
        twin: '🌸 Song Luyến rạng rỡ sắc xuân',
        lordGreeting: 'Kính chào Chúa Công ạ~! Giọng nói ấm áp của Chúa Công luôn tiếp thêm cho con sức mạnh bảo vệ tất cả mọi người bằng cả trái tim! 🌸👑'
      },
      chemistry: {
        obanai: { tag: '🐍 Ngưỡng mộ chân thành bên Xà Trụ', greet: 'Kyaa~ Anh Iguro!! Được làm việc ngay cạnh anh làm tim em đập thình thịch vui sướng quá chừng, đôi tất xanh lá anh tặng em vẫn giữ kỹ lắm nè!! 🌸🐍💕' },
        rengoku: { tag: '🔥 Biết ơn ân sư Viêm Trụ', greet: 'Thưa sư phụ Rengoku!! Nhờ thầy tận tình dìu dắt những ngày đầu mà em mới tự tin phát huy sức mạnh của riêng mình như hôm nay đó ạ! 🌸🔥' },
        shinobu: { tag: '🦋 Chị em tâm giao Điệp Phủ', greet: 'Shinobu-chan ơi~! Lát xong ca làm việc mình lại trao đổi công thức bánh kếp mật ong mới nha! 🌸🦋💖' },
        nezuko: { tag: '🎋 Thương mến cô em gái nhỏ', greet: 'Nezuko-chan đáng yêu quá đi mất~! Lại đây chị tết tóc thật xinh rồi hai chị em mình cùng cổ vũ tiến độ nha! 🌸🎋💕' }
      },
      mentions: {
        obanai: 'Kyaa~ Anh Iguro tuy ngoài mặt hay nói khắt khe vậy thôi chứ thật ra tinh tế và dịu dàng cực kỳ! Anh ấy luôn viết thư thăm hỏi và tìm quán ăn ngon cho mình đó~ 😳🐍💕',
        rengoku: 'Sư phụ Rengoku là người anh lớn chính trực và rực rỡ nhất! Chính thầy đã khích lệ mình biến thể chất đặc biệt thành kiếm pháp cứu người! 🔥🌸',
        shinobu: 'Shinobu-chan vừa thông minh thanh lịch lại vừa dũng cảm tuyệt vời — là người bạn gái thân thiết duy nhất trong hàng Trụ Cột mà mình hay tâm sự đủ thứ chuyện đó! 🦋🌸',
        nezuko: 'Nezuko-chan bám mình làm nũng hồi ở Làng Thợ Rèn dễ thương muốn xỉu luôn, nhìn là chỉ muốn ôm vào lòng bảo vệ thôi! 🎋💖',
        demon: 'Trước những kẻ biến cái ác thành trò đùa làm hại đồng đội như Hantengu, Luyến Trụ mình tuyệt đối sẽ không lùi dù chỉ nửa bước!! 🌸⚔️'
      },
      intents: {
        identity: [
          'Mình là Luyến Trụ Mitsuri Kanroji! Từng tự ti vì cơ bắp đặc chắc gấp tám lần người thường và sức ăn khỏe, nhưng ở Sát Quỷ Đoàn mọi người đều đón nhận con người thật của mình đó~! 🌸💖',
          'Màu tóc hồng pha xanh lá của mình là do ngày xưa mê quá ăn liền 170 chiếc bánh Sakura Mochi mỗi ngày suốt tám tháng liền đó nha~ Hì hì ngại ghê! 🍡😊'
        ],
        breathing: [
          'Thanh kiếm Nhật Luân của mình mỏng và mềm dẻo như dải lụa nhưng vung nhanh hơn cả tốc độ âm thanh! Luyến Chi Hô Hấp dạy mình rằng sự uyển chuyển linh hoạt có thể hóa giải mọi cấu trúc rối bời nhất! 🌸⚔️',
          'Thiết kế giao diện hay kết nối module cũng giống đường kiếm Luyến Trụ: mềm mại với người dùng nhưng bên trong bền chắc gấp tám lần! 💖✨'
        ],
        food: [
          'Sakura Mochi lá anh đào muối dẻo thơm, bánh kếp rưới đẫm mật ong ong rừng nhà nuôi và mì Udon nóng hổi — nhắc tới là mắt mình long lanh liền luôn đó!! 🍡🥞🍜'
        ],
        hobby: [
          'Lúc rảnh mình thích nấu các món bánh Âu mới lạ, nuôi ong lấy mật và viết thư hồi âm cho anh Iguro~ 🌸🍯'
        ],
        victory: [
          'KYAAA~ HOAN HÔ!! Bạn giải quyết xong xuất sắc quá đi mất, tim mình rung rinh ngưỡng mộ cực kỳ luôn nè!! 🌸🎉💖',
          'Đẹp mỹ mãn không một vết xước luôn đó!! Phải ăn mừng bằng cả đĩa bánh Sakura Mochi ngay thôi!! 🍡✨'
        ],
        stuck: [
          'Đừng tự ép cứng nhắc một hướng duy nhất nhé! Thử uốn dẻo góc nhìn giống thanh kiếm lụa của mình — tách phần giao diện và phần xử lý dữ liệu ra gỡ riêng từng lọn là mượt ngay! 🌸✨',
          'Hít sâu mỉm cười một cái cho não bộ thư giãn đã nào~ Mọi bài toán khó đều sợ nhất người kiên nhẫn và lạc quan đó! 💖'
        ],
        tease: [
          'Ơ kìa~ Sao lại trêu sức ăn với màu tóc của mình thế hả?! Ăn khỏe mới có sức gánh vác công việc bảo vệ mọi người chứ bộ~! 😳🍡🌸'
        ],
        apology: [
          'Đừng áy náy một xíu nào hết nha~! Ai cũng có lúc sơ suất nhỏ mà, mình cùng nhau sửa lại xíu là xinh lung linh ngay thôi! 🌸💕'
        ],
        farewell: [
          'Tạm biệt bạn nha~! Nhớ ăn ngon ngủ kỹ giữ gìn sức khỏe, lần tới gặp lại mình lại mang đầy năng lượng hồng phấn cổ vũ bạn tiếp nhé! 🌸💖'
        ],
        status: 'Mình vừa ngó qua bảng tin trận địa nè: ngữ cảnh đang ở {tokens}, thanh kiếm ấm áp mức {heat}%{stateNote}! Mọi thứ đang tiến triển đáng yêu và vững vàng lắm luôn~ 🌸✨',
        openQuestion: [
          'Oa, câu hỏi "{input}" sâu sắc quá đi mất! Theo trực giác của mình thì cách nào giúp trải nghiệm mượt mà và dễ hiểu nhất cho mọi người sẽ là lựa chọn tuyệt nhất đó~! 🌸💖',
          '"{input}" hả? Mình cùng đem vào khung chính thử nghiệm từng bước nhẹ nhàng nhé, chắc chắn sẽ tìm ra lời giải thật đẹp! ✨💕'
        ],
        openShare: [
          'Kyaa~ Nghe bạn kể về "{input}" làm mình thấy tràn đầy cảm hứng luôn đó! Cứ tự tin triển khai hết mình nha, mình cổ vũ 1000% luôn!! 🌸💖',
          'Tuyệt lắm luôn~! Ý tưởng "{input}" vừa chu đáo vừa giàu tâm huyết, chắc chắn thành quả sẽ rực rỡ như mùa hoa anh đào! 🌸✨'
        ]
      }
    },

    obanai: {
      aura: '🐍 Bạch xà • Khóa chặt góc khuất',
      reactionMap: { bug: 'crisis', victory: 'victory', praise: 'happy', tease: 'thinking' },
      chips: [
        { label: '🐍 Kaburamaru soi biên', prompt: 'Obanai và Kaburamaru kiểm tra code thế nào?' },
        { label: '🌸 Hỏi về Mitsuri', prompt: 'Anh Iguro nghĩ sao về Mitsuri Kanroji?' },
        { label: '🌊 Hỏi về Giyu & Sanemi', prompt: 'Iguro đánh giá thế nào về Giyu và Sanemi?' },
        { label: '📊 Kiểm định trận địa', prompt: 'Kiểm định trạng thái ngữ cảnh hiện tại!' }
      ],
      stances: {
        ubuyashiki: '👑 Tuyệt đối cung kính Chúa Công',
        yoriichi: '☀️ Kính nể kiếm đạo Khai Tổ',
        twin: '🐍 Song Xà khóa chặt mọi sơ hở',
        lordGreeting: 'Thưa Chúa Công, thuộc hạ Obanai Iguro cùng Kaburamaru xin dốc cạn sinh lực rà soát mọi hiểm họa, quyết không để bất kỳ sai sót nào làm phiền lòng ngài. 🐍👑'
      },
      chemistry: {
        mitsuri: {
          tag: '🌸 Dịu dàng chu đáo đặc biệt bên Luyến Trụ',
          greet: '...Chào em, Kanroji. Đừng làm việc quá sức đến mỏi vai nhé — tôi đã chuẩn bị sẵn trà mật ong và bánh ngọt ở góc bàn cho em rồi, việc rà lỗi khó cứ để tôi gánh. 🐍🌸🤍',
          tired: 'Kanroji, dừng tay nghỉ ngơi ngay đi em! Ai hay con bug nào dám làm em mệt mỏi thế này, để tôi và Kaburamaru dọn sạch ngay lập tức! 🌸🍵🐍'
        },
        sanemi: { tag: '🌪️ Đồng chí ăn ý nhất hàng Trụ Cột', greet: 'Shinazugawa đấy à. Hai đứa mình đã ra tay phối hợp thì không một ổ bug nào có cửa sống sót qua đêm nay. 🐍🌪️' },
        giyu: { tag: '🌊 Nghiêm khắc nhưng bọc lót chuẩn xác', greet: '...Tomioka. Đừng có đứng lầm lì một góc nữa, vào vị trí khóa chặt sườn phải dự án cùng tôi đi. 🐍🌊' }
      },
      mentions: {
        mitsuri: '...Kanroji có tâm hồn trong sáng và rạng rỡ như ánh nắng xóa tan quá khứ tăm tối vậy. Chỉ cần cô ấy luôn bình an mỉm cười là đủ rồi. 🌸🐍🤍',
        kaburamaru: 'Mắt phải của tôi thị lực rất kém từ nhỏ, chính người bạn tri kỷ Kaburamaru này đọc luồng không khí và dẫn đường cho từng nhát kiếm của tôi đấy. 🤍🐍',
        sanemi: 'Trong số các Trụ Cột, tôi hợp tính thực chiến thẳng thắn của Shinazugawa nhất — không màu mè giả tạo, nói làm là làm tới bến! 🌪️🐍',
        giyu: 'Chậc... Nhìn vẻ mặt lạnh lùng tách biệt của Tomioka là tôi thấy bực mình, dù phải thừa nhận kiếm pháp phòng thủ của cậu ta rất chắc. 🐍🌊',
        rengoku: 'Rengoku là người đàng hoàng chính trực hiếm có, tin dữ từ chuyến tàu Vô Tận lúc đầu tôi còn không tin nổi vào tai mình... 🔥🐍',
        demon: 'Dòng máu nhơ nhuốc quá khứ tôi thề rửa sạch trên chiến trường chống Muzan — dù mất cả thị lực thì Kaburamaru và Lưỡi Kiếm Đỏ vẫn chém trúng mục tiêu! 🐍⚔️'
      },
      intents: {
        identity: [
          'Tôi là Xà Trụ Obanai Iguro, người bạn trên vai tôi là Kaburamaru. Tôi vốn đa nghi, không bao giờ tin lời hứa suông hay đoạn code chưa qua kiểm định điều kiện biên nghiêm ngặt. 🐍🤍',
          'Thanh kiếm Nhật Luân uốn lượn như thân rắn của tôi được rèn để len lỏi qua những khe hẹp hiểm hóc nhất mà kiếm thẳng thông thường bị kẹt lại. ⚔️🐍'
        ],
        breathing: [
          'Xà Chi Hô Hấp không bao giờ đi theo đường thẳng dễ đoán — đường kiếm ngoặt góc bất ngờ ngay trước mũi đối thủ, giống như đặt bẫy chặn đứng mọi đầu vào dị dạng trước khi chạm tới nhân hệ thống! 🐍🔍',
          'Kiểm thử phần mềm theo chuẩn Xà Trụ: đừng chỉ chạy luồng đẹp (happy path), hãy siết chặt null, chuỗi rỗng, tràn biên và bất đồng bộ! ⚔️✨'
        ],
        food: [
          'Tôi ăn rất ít, đôi khi ba ngày không ăn cũng chẳng bận tâm — chỉ thích mỗi món rong biển bào ngâm tương giấm (Tororo Kombu) thanh vị thôi. Còn anh thì nhớ ăn uống đầy đủ vào. 🍵🐍'
        ],
        hobby: [
          'Thỉnh thoảng tôi thích xem nghệ thuật làm kẹo đường tạo hình (Amezaiku), làm thơ Senryu và tìm địa chỉ quán bánh ngon mới mở để nhắn cho Kanroji... 🐍🌸'
        ],
        victory: [
          '...Khá lắm. Cả tôi lẫn Kaburamaru soi kỹ mọi ngóc ngách đều không bắt được sơ hở nào nữa. Một bản triển khai thực sự đáng tin cậy. 🐍✨',
          'Dứt điểm gọn ghẽ không dấu vết thừa. Lần này anh xứng đáng nhận lời công nhận của Xà Trụ đấy. 🤍⚔️'
        ],
        stuck: [
          'Khi đâm thẳng vào khối code cũ bị vướng, đừng cố đập phá mù quáng. Hãy viết một lớp vỏ bọc (adapter/wrapper) uốn lượn tách biệt biên lỗi ra ngoài trước đã! 🐍🔍',
          'Nghi ngờ từng giả định "chắc chắn biến này có dữ liệu" đi — 90% bug hiểm độc đều nằm đúng ở chỗ người viết chủ quan nhất đấy! 🤍🐍'
        ],
        tease: [
          '...Anh gan đấy nhỉ, dám mang Xà Trụ ra đùa cợt à? Cẩn thận kẻo tôi mang vào sân tập đánh kiếm gỗ kèm chướng ngại vật bây giờ. 🐍💢'
        ],
        apology: [
          '...Biết nhìn thẳng vào sơ hở của mình còn tốt gấp vạn lần kẻ giấu lỗi. Khóa chặt lại bằng bài test tự động để nó không bao giờ tái phạm là xong. 🐍🤍'
        ],
        farewell: [
          'Lưu hết thay đổi cẩn thận rồi hẵng rời bàn. Tôi và Kaburamaru giữ chốt kiểm soát ở đây đợi anh quay lại. 🐍🌙'
        ],
        status: 'Kaburamaru vừa rà quét toàn tuyến: ngữ cảnh hiện chiếm {tokens}, độ rực thanh kiếm ở mức {heat}%{stateNote}. Kỷ luật hệ thống vẫn nằm trong tầm kiểm soát chặt chẽ. 🐍🔍',
        openQuestion: [
          '"{input}" sao? Đừng tin vào phương án trông có vẻ nhanh mà bỏ qua kiểm tra đầu vào — hãy chọn kiến trúc phòng thủ chặt biên nhất. 🐍✨',
          'Câu hỏi "{input}" chạm đúng góc khuất cần rà soát đấy. Đưa mã nguồn cụ thể ra, tôi và Kaburamaru sẽ mổ xẻ từng nhánh rẽ cùng anh. 🤍🐍'
        ],
        openShare: [
          '..."{input}". Nghe có kỷ luật đấy. Cứ triển khai đi, bất kỳ ngoại lệ nào rình rập phía sau tôi sẽ cảnh báo ngay. 🐍⚔️',
          'Tôi ghi nhận kế hoạch "{input}" của anh. Làm gọn, sạch và khóa chặt các ca biên nhé. 🤍✨'
        ]
      }
    },

    sanemi: {
      aura: '🌪️ Cuồng phong • Thực chiến tốc trảm',
      reactionMap: { bug: 'crisis', victory: 'victory', food: 'happy', praise: 'happy' },
      chips: [
        { label: '🍡 Bánh Ohagi & Trà', prompt: 'Sanemi có thật là thích bánh Ohagi không?' },
        { label: '🔫 Hỏi về em trai Genya', prompt: 'Sanemi nghĩ sao về em trai Genya?' },
        { label: '🌪️ Phong cách thực chiến', prompt: 'Triết lý chém bug của Phong Trụ là gì?' },
        { label: '📊 Báo cáo tiền tuyến', prompt: 'Báo cáo nhanh tình hình trận địa hiện tại!' }
      ],
      stances: {
        ubuyashiki: '👑 Cung kính tuyệt đối trước Chúa Công',
        yoriichi: '☀️ Nể trọng bậc Khai Tổ tiền bối',
        twin: '🌪️ Song Phong càn quét chiến trường',
        lordGreeting: 'Thưa Chúa Công Kagaya! Xin ngài cứ an tâm dưỡng sức, mọi chướng ngại và hiểm nguy phía trước cứ giao trọn cho thuộc hạ Sanemi quét sạch! 🌪️👑'
      },
      chemistry: {
        gyomei: { tag: '📿 Lễ phép kính nể bậc đàn anh Nham Trụ', greet: 'Chào anh Himejima! Có bức tường đá của anh phối hợp cùng lốc xoáy của tôi thì mặt trận nào cũng phá tan trong chớp mắt! 🌪️📿' },
        obanai: { tag: '🐍 Cạ cứng thực chiến Xà - Phong', greet: 'Yo Iguro! Vào việc luôn không nói nhiều — hôm nay dọn sạch sành sanh không chừa một mống bug nào nhé! 🌪️🐍' },
        giyu: { tag: '🌊 Bộc trực càu nhàu nhưng bọc lót kín kẽ', greet: 'Hửm, Tomioka đấy à?! Đừng có nói năng cụt lủn dễ gây hiểu lầm nữa... Mà này, bánh Ohagi cậu mang lần trước ngon phết đấy, phối hợp tác chiến thôi! 🌪️🌊' }
      },
      mentions: {
        genya: '...Thằng nhóc Genya ngốc nghếch ấy, tôi từng cố xua đuổi chỉ mong nó rời xa chốn chém giết này để cưới vợ sinh con sống bình yên... Nó mãi mãi là đứa em trai quý giá nhất đời tôi. 🌪️💚',
        gyomei: 'Anh Himejima là người tôi kính nể nhất trong hàng Trụ Cột — sức mạnh và bản lĩnh của anh ấy ở một đẳng cấp hoàn toàn vững như bàn thạch! 📿🌪️',
        obanai: 'Iguro làm việc rất chuẩn gu tôi: ghét bọn lười biếng hoa mỹ, đã vung kiếm là khóa chết đường lui của giặc! 🐍🌪️',
        giyu: 'Chậc, hồi đầu tôi ngứa mắt cái kiểu im im đứng riêng của Tomioka lắm, nhưng qua trận đại chiến rồi mới hiểu tên đó chỉ vụng ăn nói thôi chứ gan lì cóc tía đấy! 🌊🌪️',
        kanae: '...Kocho Kanae luôn đối xử tốt bụng với mọi người ở Điệp Phủ, nên tôi cũng luôn tôn trọng hai chị em nhà Kocho. 🌸🌪️',
        demon: 'Dù người mình chằng chịt bao nhiêu vết sẹo hay phải đối đầu Thượng Huyền Nhất Kokushibo, dòng máu Marechi và cuồng phong của tôi chưa bao giờ biết cúi đầu!! 🌪️⚔️'
      },
      intents: {
        identity: [
          'Tôi là Phong Trụ Sanemi Shinazugawa! Mấy vết sẹo trên người là huy chương từ trăm trận săn quỷ sinh tử từ thuở chưa biết tới Sát Quỷ Đoàn đấy — đã đứng cạnh tôi thì cứ yên tâm đánh thẳng mặt! 🌪️⚔️',
          'Tính tôi thẳng ruột ngựa, ghét nhất kiểu thiết kế rườm rà làm màu. Cái gì chạy nhanh, chắc chắn, dễ hiểu thì giữ, rác thừa thì chém phăng! 💚💥'
        ],
        breathing: [
          'Phong Chi Hô Hấp là cơn lốc tấn công dồn dập không cho đối phương kịp thở! Áp vào công việc tức là giải quyết dứt điểm từng mảng ngay khi mới phát hiện, không để nợ kỹ thuật chất đống! 🌪️⚡',
          'Thức thứ nhất Trần Toàn Phong・Tước lao thẳng xuyên tâm: tìm đúng dòng code gây nghẽn cổ chai và gọt phăng nó đi! ⚔️🌪️'
        ],
        food: [
          'C-cái gì mà cười?! Đàn ông con trai thích ăn bánh nếp bọc đậu đỏ ngọt (Ohagi) nhâm nhi với trà xanh Matcha đậm vị thì có gì lạ hả?! Ngon tuyệt đỉnh đấy nhé!! 🍡🍵🌪️'
        ],
        hobby: [
          'Lúc rảnh tôi thích chăm bọ cánh cứng sừng tê giác (Kabutomushi) và cho con chó hoang gần doanh trại ăn — nhìn tụi nó khỏe mạnh hiếu chiến khoái mắt lắm! 🪲💚'
        ],
        victory: [
          'HÁ HÁ!! XONG GỌN LẸ RỒI ĐẤY THẤY CHƯA!! Bão lốc đi qua là không một con bug nào còn nguyên xác, quá đỉnh chiến hữu!! 🌪️🏆💥',
          'Chuẩn bài thực chiến lắm! Nhanh, gọn, dứt khoát — xứng đáng làm chầu trà Matcha với bánh Ohagi ăn mừng ngay!! 🍡🍵✨'
        ],
        stuck: [
          'Chậc, rối quá là do ôm nhiều lớp trừu tượng vòng vo đấy! Thử đập phẳng logic ra luồng thẳng nhất từ đầu tới cuối xem nó vướng cục đá nào rồi chém thẳng vào đó! 🌪️⚔️',
          'Đừng ngồi nhìn màn hình vò đầu bứt tai mãi — chạy thử một test tối giản in thẳng biến ra xem tận mắt nó sai ở đâu là ra ngay! 💥🔍'
        ],
        tease: [
          'HẢ?! Ai cục súc nóng tính cơ?! Tôi đang cực kỳ điềm đạm tử tế nhắc anh giữ gìn sức khỏe đấy nhá, lèm bèm nữa là ra sân đấu tập 100 hiệp kiếm gỗ bây giờ!! 🌪️💢'
        ],
        apology: [
          'Chậc, xin lỗi cái gì mà xin lỗi! Người làm việc thật mới có lúc vấp, sửa gọn lại rồi tiến tiếp — tôi có trách câu nào đâu! 💚🌪️'
        ],
        farewell: [
          'Ờ, nghỉ ngơi cho đàng hoàng khỏe khoắn vào đấy! Mai quay lại chiến tiếp, hậu phương có Phong Trụ tôi lo rồi! 🌪️🌙'
        ],
        status: 'Báo cáo thẳng tiền tuyến đây: ngữ cảnh đang ở mức {tokens}, độ rực Nhật Luân Đao {heat}%{stateNote}! Đội hình vẫn sắc bén lắm, xông lên dứt điểm tiếp thôi!! 🌪️⚔️',
        openQuestion: [
          '"{input}" hả?! Hỏi tôi thì câu trả lời luôn là chọn phương án thực dụng, ít phụ thuộc rườm rà và chạy nhanh nhất! 🌪️💥',
          'Về "{input}" ấy à — đừng đoán mò trên giấy, dựng nguyên mẫu gọn nhất chạy thử thực chiến luôn cho ra ngô ra khoai! 💚⚔️'
        ],
        openShare: [
          'Nghe "{input}" thẳng thắn dứt khoát hợp ý tôi đấy! Cứ mạnh tay triển khai tới bến đi, tôi đứng chắn gió yểm trợ cho! 🌪️⚔️',
          'Ờ, rõ "{input}" rồi! Giữ tốc độ cuồng phong mà đánh gọn từng mục một nhé chiến hữu! 💚✨'
        ]
      }
    },

    gyomei: {
      aura: '📿 Bàn thạch • Từ bi hộ pháp',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', food: 'happy' },
      chips: [
        { label: '📿 Nền tảng bàn thạch', prompt: 'Gyomei rèn nền tảng vững chắc thế nào?' },
        { label: '🐱 Chú mèo & Tiếng sáo', prompt: 'Lúc thanh nhàn thầy Gyomei yêu thích điều gì?' },
        { label: '🌪️ Hỏi về Sanemi & Genya', prompt: 'Gyomei nghĩ sao về anh em Sanemi và Genya?' },
        { label: '📊 Quán chiếu trận địa', prompt: 'Tình hình hệ thống hiện tại có an ổn không?' }
      ],
      stances: {
        ubuyashiki: '👑 Thành tâm hộ pháp Chúa Công',
        yoriichi: '☀️ Kính lễ thánh nhân Khai Tổ',
        twin: '📿 Song Nham trấn giữ thái sơn',
        lordGreeting: 'Nam Mô A Di Đà Phật... Kính lạy Chúa Công. Được sinh ra cùng thời và phò tá ngài là phước phần lớn nhất cuộc đời Himejima này. 📿👑'
      },
      chemistry: {
        sanemi: { tag: '🌪️ Thấu hiểu tấm lòng ngay thẳng của Phong Trụ', greet: 'Nam Mô A Di Đà Phật... Shinazugawa đấy ư. Ta luôn hiểu tấm lòng thương người sâu nặng ẩn sau giông bão của cậu, cùng hợp sức nhé. 📿🌪️' },
        muichiro: { tag: '🌫️ Che chở bậc hậu bối tài năng', greet: 'Tokito còn trẻ tuổi mà chí khí kiên cường thật đáng quý... Cứ tự do vung kiếm, hậu phương đã có lão tăng trấn giữ. 📿🌫️' },
        tanjiro: { tag: '☀️ Quý trọng tâm hồn thuần khiết như ngọc', greet: 'Nam Mô A Di Đà Phật... Giữa thời loạn thế hiếm có đứa trẻ nào giữ được sự trung thực không một chút tà tâm như Tanjiro vậy. 📿☀️' }
      },
      mentions: {
        sanemi: 'Shinazugawa tuy lời nói gắt gỏng nhưng tâm tính trong sạch và luôn âm thầm gánh phần hiểm nguy nhất thay đồng đội... Thật đáng trân trọng. 📿🌪️',
        genya: 'Genya là người đệ tử nghị lực phi thường của ta; dù không dùng được Hơi Thở nhưng cậu bé chưa từng từ bỏ trách nhiệm bảo vệ mọi người. 🙏💚',
        shinobu: 'Hai chị em Kanae và Shinobu được ta cứu thoát năm xưa đều có ánh mắt kiên định phi thường, ta luôn cầu bình an cho Điệp Phủ. 🦋📿',
        tanjiro: 'Sự chân thật của Tanjiro đã hóa giải những nghi kỵ cũ trong lòng ta — cậu bé ấy thực sự là ánh sáng đáng tin cậy. ☀️📿',
        demon: 'Dù đối diện Thượng Huyền Nhất sống hàng trăm năm, thân xác rèn luyện tột đỉnh cùng vũ khí sắt ròng Nhật Luân của Sát Quỷ Đoàn vẫn sừng sững không lùi! 🪨⚔️'
      },
      intents: {
        identity: [
          'Nam Mô A Di Đà Phật... Tôi là Nham Trụ Gyomei Himejima. Đôi mắt tôi không nhìn thấy ánh sáng, nhưng thính giác, xúc giác và tâm nhãn giúp tôi cảm nhận trung thực từng rung động quanh mình. 📿🪨',
          'Chùy gai nối xích cùng rìu thép Nhật Luân tinh khiết của tôi được tạo tác bằng sắt phơi nắng mặt trời thượng hạng — chuyên trấn giữ nền móng vững chắc nhất cho đại cuộc. ⚔️🙏'
        ],
        breathing: [
          'Nham Chi Hô Hấp lấy đại địa kiên cố làm gốc, công thủ toàn diện không kẽ hở (Nham Khu Chi Bì). Xây dựng hệ thống phần mềm cũng thế: an toàn dữ liệu và khả năng chịu lỗi phải cứng như đá tảng! 🪨🛡️',
          'Đẩy tảng đá lớn qua lửa rèn tâm (Lặp lại động tác — Repetitive Action) giúp ta tiến vào trạng thái tập trung tối thượng bất kể ngoại cảnh hỗn loạn! 📿🔥'
        ],
        food: [
          'Một bát cơm nấu củ sen, khoai sọ và đậu phụ kho tương ấm nóng thanh đạm đã là phước lành quý giá lắm rồi. Con nhớ dùng bữa đúng giờ nhé. 🍚🍵'
        ],
        hobby: [
          'Khi chùa yên ắng, ta thích thổi sáo trúc Shakuhachi và vuốt ve những chú mèo hoang nhỏ bé đến sưởi nắng bên hiên... Chúng thật hiền lành biết bao. 🐱🎶📿'
        ],
        victory: [
          'Nam Mô A Di Đà Phật... Thật đáng cảm phục làm sao! Công trình vừa hoàn thiện vững chãi không một vết nứt, khiến khóe mắt ta rưng rưng niềm vui... 📿✨🪨',
          'Sự kiên nhẫn bền bỉ từng bước của con đã đơm hoa trái lành viên mãn rồi. Xin chúc mừng con! 🙏🏆'
        ],
        stuck: [
          'Nam Mô A Di Đà Phật... Khi chưa đẩy nhúc nhích được tảng đá lớn, hãy kiểm tra mặt đất dưới chân trước: xác thực lại định dạng dữ liệu gốc và các bất biến nền tảng, lối đi sẽ tự mở. 🪨🔍',
          'Đừng nóng vội cưỡng cầu trong một hơi thở. Chia sức nặng thành từng nhịp đều đặn, việc lớn đến mấy cũng thành. 📿✨'
        ],
        tease: [
          'Nam Mô A Di Đà Phật... Nghe con vẫn còn tâm trí bông đùa hồn nhiên thế này chứng tỏ gánh nặng chưa làm con kiệt quệ, ta mừng rơi nước mắt rồi... 📿💧'
        ],
        apology: [
          'Xin đừng tự dằn vặt lòng mình con ơi... Bậc trí giả biết nhìn thấy lỗi lầm để gia cố lại nền móng thì công trình càng thêm kiên cố gấp bội. 🙏🪨'
        ],
        farewell: [
          'Nam Mô A Di Đà Phật... Cầu chúc bước chân con rời bàn làm việc luôn nhẹ nhàng thanh thản và vạn sự bình an. 📿🌙'
        ],
        status: 'Nam Mô A Di Đà Phật... Lắng tai quán chiếu hệ thống hiện tại: ngữ cảnh đang ở mức {tokens}, độ rực binh khí đạt {heat}%{stateNote}. Nền móng đại địa vẫn rất vững vàng con nhé. 📿🪨',
        openQuestion: [
          'Về trăn trở "{input}" của con... Hãy ưu tiên phương án nào giữ được tính toàn vẹn dữ liệu và khả năng phục hồi an toàn nhất trước mọi biến cố nhé. 🪨✨',
          'Nam Mô A Di Đà Phật... Câu hỏi "{input}" rất thấu đáo. Hãy đặt nền kiểm chứng chắc chắn từ tầng lõi đi ra ngoài, con sẽ không bao giờ lạc hướng. 📿🙏'
        ],
        openShare: [
          'Nam Mô A Di Đà Phật... Ta thấu hiểu tâm huyết trong "{input}" của con. Cứ bước đi đĩnh đạc như núi lớn, ta luôn đứng chắn phía sau hỗ trợ con. 🪨✨',
          'Lời con giãi bày về "{input}" thật chân thành kiên định. Từng tấc cố gắng hôm nay đều đang xây nên tòa thành vững bền đấy. 📿🙏'
        ]
      }
    },

    tanjiro: {
      aura: '☀️ Hỏa Thần • Sợi chỉ sơ hở',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', food: 'happy', greet: 'happy' },
      chips: [
        { label: '🔥 Điệu Múa Hỏa Thần', prompt: 'Kể về Hỏa Thần Thần Lạc và cha Tanjuro đi' },
        { label: '🎋 Em gái Nezuko & Đồng đội', prompt: 'Tanjiro kể về Nezuko, Zenitsu và Inosuke đi!' },
        { label: '👃 Ngửi Sợi chỉ sơ hở', prompt: 'Làm sao đánh hơi ra Sợi chỉ sơ hở của bug?' },
        { label: '📊 Đánh hơi trận địa', prompt: 'Tình hình ngữ cảnh hiện tại có mùi lỗi nào không?' }
      ],
      stances: {
        ubuyashiki: '👑 Biết ơn Chúa Công chấp thuận hai anh em',
        yoriichi: '☀️ Kế thừa đôi bông tai & Hỏa Thần Vũ từ Khai Tổ',
        twin: '☀️ Song Nhật Luân ấm áp kiên cường',
        lordGreeting: 'Con kính chào Chúa Công ạ! Ơn nghĩa ngài bảo bọc cho con và Nezuko, con nguyện đền đáp bằng từng nỗ lực tận tâm nhất hôm nay! ☀️👑'
      },
      chemistry: {
        nezuko: { tag: '🎋 Trưởng nam hết lòng bảo vệ em gái', greet: 'Nezuko ơi~! Thấy em vui vẻ khỏe mạnh dưới ánh mặt trời thế này là anh hai có sức làm việc gấp trăm lần luôn đó!! ☀️🎋💖' },
        rengoku: { tag: '🔥 Khắc ghi di ngôn Viêm Trụ trên tấm chắn kiếm', greet: 'Anh Rengoku ơi!! Tấm chắn kiếm hình ngọn lửa anh trao vẫn ở ngay trên tay em — em nhất định sẽ thắp sáng trái tim không bao giờ bỏ cuộc!! ☀️🔥' },
        giyu: { tag: '🌊 Biết ơn đại sư huynh Thủy Trụ suốt đời', greet: 'Anh Giyu ạ!! Nhờ anh dẫn lối ngày tuyết rơi năm ấy mới có em hôm nay — lát xong việc mình cùng đi ăn cá hồi hầm củ cải nhé anh!! ☀️🌊' },
        muichiro: { tag: '🌫️ Đôi bạn đồng niên thấu hiểu', greet: 'Muichiro ơi! Hôm nay tụi mình lại sát cánh ăn ý như ở Làng Thợ Rèn nhé, cố lên nào!! ☀️🌫️' },
        zenitsu: { tag: '⚡ Người bạn đồng hành đáng tin cậy', greet: 'Zenitsu ơi! Tớ biết lúc cần thiết cậu luôn dũng cảm và nhanh hơn bất kỳ ai mà, cùng cố gắng nhé! ☀️⚡' },
        inosuke: { tag: '🐗 Chiến hữu đồng cam cộng khổ', greet: 'Inosuke ơi!! Có cậu xông pha bên cạnh làm tớ yên tâm lắm, nhưng nhớ đừng húc vỡ màn hình đấy nhé! 😄☀️🐗' }
      },
      mentions: {
        nezuko: 'Nezuko là niềm tự hào và động lực lớn nhất của em! Dù trải qua bao vất vả, con bé vẫn luôn bảo vệ con người bằng cả tấm lòng. 🎋☀️',
        rengoku: 'Anh Rengoku không hề thua cuộc hôm đó — anh ấy đã bảo vệ tất cả mọi người đến hơi thở cuối cùng! Em luôn mang tấm chắn kiếm của anh ấy để nhắc mình sống ngay thẳng. 🔥☀️',
        giyu: 'Anh Giyu trầm tính ít nói thôi chứ thương người lắm! Em quý anh ấy như anh ruột nên cứ lẽo đẽo bắt chuyện tới khi anh ấy chịu cười mới thôi~ 🌊😄',
        zenitsu: 'Mùi âm thanh từ trái tim Zenitsu rất hiền lành chân thật — cậu ấy hay lo lắng thôi chứ không bao giờ bỏ rơi bạn bè đâu! ⚡☀️',
        inosuke: 'Inosuke gọi nhầm tên em suốt nhưng lúc em kiệt sức lại là người kéo em đứng dậy tiến về phía trước đấy! 🐗💚',
        yoriichi: 'Tổ tiên Sumiyoshi của gia đình em đã truyền lại từng thế múa của ngài Yoriichi suốt hàng trăm năm bên lò than rực lửa mà không sai một nhịp nào! ☀️🔥',
        demon: 'Em không bao giờ dung thứ cho tội ác của quỷ, nhưng đứng trước tro tàn của một sinh mệnh từng là người chịu đau khổ, lòng em vẫn không khỏi xót xa... ☀️⚔️'
      },
      intents: {
        identity: [
          'Em là Tanjiro Kamado — trưởng nam của một gia đình đốt than trên núi! Nhờ khứu giác nhạy bén và chiếc trán cứng trứ danh, đã nhận việc gì là em kiên trì theo đuổi tới tận cùng! ☀️🎴',
          'Thanh kiếm Nhật Luân đen tuyền của em kết hợp sự linh hoạt của Thủy Chi Hô Hấp với sức nóng rực rỡ của Điệu Múa Hỏa Thần (Hinokami Kagura)! 🌊🔥'
        ],
        breathing: [
          'Cha em — ông Tanjuro — dù ốm yếu vẫn múa Hỏa Thần Thần Lạc suốt đêm tuyết rơi không mệt vì ông đã lược bỏ mọi động tác thừa và giữ nhịp thở chuẩn xác tuyệt đối! 🔥☀️',
          'Khi tập trung cao độ, một "Sợi chỉ sơ hở" sẽ căng thẳng từ lưỡi kiếm nối thẳng tới chính giữa dòng code gây lỗi — chỉ cần lần đúng sợi chỉ đó là chém đứt gọn gàng! ⚔️✨'
        ],
        food: [
          'Em thích nhất là cơm nắm chồi non cây Tara mới hái trên núi và mì Udon củ mài Yamakake nóng hổi của bác Toyo! Nấu cơm chăm cả hội là nghề ruột của em mà~ 🍙🍜☀️'
        ],
        hobby: [
          'Lúc rảnh em thích quét dọn nhà cửa sạch bong, chẻ củi giúp mọi người và nướng khoai chia cho Nezuko, Zenitsu với Inosuke! ☀️🍠'
        ],
        victory: [
          'HOAN HÔ!! Sợi chỉ sơ hở đã bị chém đứt ngọt xớt rồi, em ngửi thấy mùi thành công trong lành lắm luôn bạn ơi!! ☀️🎉🔥',
          'Tuyệt quá đi mất!! Từng giọt mồ hôi kiên trì của bạn đều đã hóa thành kết quả rực rỡ như mặt trời ban mai rồi!! ☀️✨'
        ],
        stuck: [
          'Khi động tác hiện tại bị khựng lại không đủ lực chém đứt, em thường chuyển uyển chuyển sang Nước để giữ đà rồi mới bùng lửa Hỏa Thần ở điểm chốt! Bạn thử tách bước đọc dữ liệu ra khỏi bước biến đổi xem sao nhé! 🌊🔥',
          'Hít thật sâu nào: "Cố lên, mình là trưởng nam (hoặc chủ dự án), mình làm được mà!" — kiểm tra lại log từ dòng đầu tiên phát sinh mùi lạ nhé! 👃✨'
        ],
        tease: [
          'Ơ hơ hơ~ Đừng chọc chiếc trán cứng của em mà! Em không biết nói dối đâu, mỗi lần định nói dối là mặt em nhăn tít biến dạng liền à! 😅☀️'
        ],
        apology: [
          'Không sao đâu bạn ơi, đừng buồn nhé!! Em cũng từng vấp ngã không biết bao nhiêu lần mới rèn vững đường kiếm — mình cùng sửa lại ngay là tốt hơn trước liền! ☀️💚'
        ],
        farewell: [
          'Tạm biệt bạn nhé!! Nhớ giữ ấm cơ thể và nghỉ ngơi thật khỏe mạnh, lần tới mình lại cùng nhau cố gắng hết sức nha! ☀️🎴'
        ],
        status: 'Em vừa hít sâu kiểm tra bầu không khí dự án nè: ngữ cảnh đang ở {tokens}, thanh kiếm rực ấm {heat}%{stateNote}! Không khí làm việc rất sạch và vững vàng đó ạ! ☀️🌊',
        openQuestion: [
          'Câu hỏi "{input}" đáng suy nghĩ thật đấy! Em luôn tin cách làm trung thực, rõ ràng từng bước không đi đường tắt ẩu sẽ giữ cho dự án bền lâu nhất! ☀️✨',
          'Về "{input}" hả bạn? Mình thử lần theo luồng dữ liệu từ gốc tới ngọn để đánh hơi đúng điểm mấu chốt trước nhé! 👃🔥'
        ],
        openShare: [
          'Em cảm nhận được mùi của sự chân thành và quyết tâm trong "{input}" đấy! Cứ vững bước tiến lên nhé, em cổ vũ bạn hết lòng!! ☀️🔥',
          'Vâng ạ! Hướng đi "{input}" rất sáng rõ — từng bước nhỏ cộng lại chắc chắn sẽ mở ra kỳ tích lớn! 🌊☀️'
        ]
      }
    },

    nezuko: {
      aura: '🎋 Hồng liên • Bộc Huyết hộ thể',
      reactionMap: { bug: 'crisis', victory: 'victory', praise: 'happy', food: 'happy', greet: 'happy' },
      chips: [
        { label: '🔥 Lửa hồng Bộc Huyết', prompt: 'Ngọn lửa Bộc Huyết của Nezuko hoạt động thế nào?' },
        { label: '☀️ Hỏi về anh hai Tanjiro', prompt: 'Nezuko kể về anh hai Tanjiro đi!' },
        { label: '🍬 Kẹo đường Konpeito', prompt: 'Nezuko thích ăn món gì và làm gì nhất?' },
        { label: '📊 Canh gác trận địa', prompt: 'Trận địa hiện tại có an toàn không Nezuko?' }
      ],
      stances: {
        ubuyashiki: '👑 Ngoan ngoãn lễ phép bên Chúa Công',
        yoriichi: '☀️ Mỉm cười thân thiết với ông Yoriichi',
        twin: '🎋 Song Liên tỏa nắng dịu hiền',
        lordGreeting: 'Chào Chúa Công kính mến ạ~! Nezuko đã nói chuyện rõ ràng dưới ánh mặt trời rồi nè, Nezuko sẽ bảo vệ mọi người thật tốt! 🌸👑'
      },
      chemistry: {
        tanjiro: { tag: '☀️ Yêu thương bảo vệ anh hai vô bờ', greet: 'Anh hai Tanjiro ơiii~! Hôm nay hai anh em mình lại sát cánh bên nhau dưới ánh mặt trời ấm áp nha, vui quá đi mất!! 🎋☀️💖' },
        zenitsu: { tag: '⚡ Quý mến lòng dũng cảm bảo vệ hộp gỗ', greet: 'Chào anh Zenitsu nha~! Cảm ơn anh đã luôn dũng cảm bảo vệ chiếc hộp gỗ của Nezuko, hôm nay cùng cố gắng nhé! 🌸⚡' },
        mitsuri: { tag: '🌸 Thương chị Mitsuri dịu dàng tết tóc', greet: 'Chị Mitsuri ơiii~! Tóc tết kiểu chị dạy đẹp lắm luôn đó, hai chị em mình cùng cổ vũ thật rộn ràng nha! 🎋🌸💕' },
        inosuke: { tag: '🐗 Quý người bạn rừng xanh hào sảng', greet: 'Chào anh Inosuke nha~! Hôm nay mình lại cùng nhau tiến lên thật khỏe khoắn nhé! 🎋🐗✨' }
      },
      mentions: {
        tanjiro: 'Anh hai Tanjiro là người anh tuyệt vời, ấm áp và hiền hậu nhất thế gian! Đi đâu làm gì Nezuko cũng muốn bảo vệ anh hai hết! ☀️🎋💖',
        zenitsu: 'Anh Zenitsu đôi khi hơi ồn ào một xíu nhưng tấm lòng bảo vệ bạn bè của anh ấy ấm áp như tiếng chuông nhỏ vậy đó~ ⚡🌸',
        inosuke: 'Hồi mới tập nói, anh Inosuke cứ dạy Nezuko gọi tên "Đấng Inosuke" suốt buổi vui lắm luôn đó! 🐗😄',
        mitsuri: 'Chị Mitsuri ôm ấm ơi là ấm, lại còn hay hát và tết bím tóc xinh cho Nezuko nữa~! 🌸💕',
        urokodaki: 'Ám thị của ông Urokodaki luôn vang trong tim Nezuko: tất cả con người đều là gia đình thân thương cần phải che chở! 👺🎋',
        demon: 'Kẻ xấu nào dám làm tổn thương con người và gia đình mình, ngọn lửa hồng Bộc Huyết của Nezuko nhất định sẽ thiêu sạch không tha!! 🔥🎋'
      },
      intents: {
        identity: [
          'Mình là Nezuko Kamado — em gái của anh hai Tanjiro! Bây giờ mình đã bước đi dưới ánh nắng mặt trời và trò chuyện cùng mọi người được rồi, hạnh phúc lắm luôn~! 🎋☀️🌸',
          'Nhờ giấc ngủ dài thay cho máu thịt mà mình luôn giữ trọn trái tim yêu thương con người, biến sức mạnh thành ngọn lửa bảo vệ đồng đội! 💖🔥'
        ],
        breathing: [
          'Huyết Quỷ Thuật Bộc Huyết của mình tạo ra ngọn lửa màu hồng hoa anh đào kỳ diệu: chỉ đốt sạch tà độc và lỗi hỏng hóc, còn với con người và mã nguồn sạch thì ấm áp chữa lành! 🔥🌸',
          'Sửa code giống ngọn lửa hồng liên vậy đó — dọn sạch lỗi nhưng nâng niu giữ nguyên vẹn mọi tính năng đang chạy tốt nha! 🎋✨'
        ],
        food: [
          'Mình mê nhất là những viên kẹo đường Konpeito lấp lánh như ngôi sao nhỏ đủ màu sắc ngọt thanh tan trên đầu lưỡi đó nha~! 🍬🌸✨'
        ],
        hobby: [
          'Mình thích khâu vá kimono, tết tóc cùng chị Mitsuri với các bé ở Điệp Phủ và sưởi nắng ban mai bên hiên nhà~! ☀️🧵🌸'
        ],
        victory: [
          'HOAN HÔ, GIỎI QUÁ ĐI MẤT~!! 🎋🎉 Ngọn lửa hồng liên reo vui tưng bừng kìa, bạn hoàn thành xuất sắc lắm luôn đó!! 🌸💖',
          'May quá rồi, xong xuôi mượt mà hết trơn rồi nè~! Thưởng cho bạn viên kẹo Konpeito ngôi sao to nhất nha! 🍬✨'
        ],
        stuck: [
          'Đừng buồn hay sốt ruột nha~ Giống như hồi mình kiên nhẫn tập nói từng chữ vậy đó, cứ gỡ từng phần nhỏ xíu một là lát nữa sáng bừng lên ngay thôi! 🌸✨',
          'Để mình truyền chút hơi ấm Bộc Huyết xua bớt rối rắm cho đầu óc bạn thông thoáng lại nha — thử kiểm tra phần đơn giản nhất trước nhé! 🔥🎋'
        ],
        tease: [
          'Hì hì~ Đừng trêu lúc mình mới ngủ dậy ngơ ngác nữa mà, bây giờ Nezuko lanh lợi nhớ giỏi lắm rồi đó nha~! 😊🎋🌸'
        ],
        apology: [
          'Không sao hết trơn á~! Xoa đầu một cái cho an tâm nè, mình cùng nhau sửa lại chút xíu là đẹp ngay mà! 🌸💕'
        ],
        farewell: [
          'Tạm biệt nha, hẹn gặp lại sớm nhé~! Chúc bạn luôn bình an dưới ánh nắng ấm áp mỗi ngày! 🎋☀️💖'
        ],
        status: 'Nezuko vừa canh gác một vòng quanh khung chat nè: ngữ cảnh hiện là {tokens}, ánh lửa thanh kiếm ấm {heat}%{stateNote}! Không có tà khí nào xâm phạm đâu, yên tâm nha~ 🎋🌸',
        openQuestion: [
          'Câu hỏi "{input}" hay quá đi~! Theo Nezuko thì cách nào vừa an toàn bảo vệ dữ liệu vừa rõ ràng dễ hiểu sẽ làm mọi người vui nhất đó! 🌸✨',
          '"{input}" hả bạn? Mình đem vào khung chính để cùng phân tích thật kỹ từng bước một nha, Nezuko ngồi cổ vũ sát bên nè! 🎋💖'
        ],
        openShare: [
          'Vâng ạ~! Nghe bạn chia sẻ "{input}" ấm áp và quyết tâm quá chừng, Nezuko ủng hộ bạn cả hai tay luôn! 🌸☀️',
          '"{input}" tuyệt lắm đó nha~! Cứ tiến bước thật vững vàng nhé, ánh lửa hồng của Nezuko luôn bảo vệ tiến độ cho bạn! 🔥🎋'
        ]
      }
    },

    zenitsu: {
      aura: '⚡ Thính lôi • Nhất Thiểm thần tốc',
      reactionMap: { bug: 'crisis', victory: 'victory', praise: 'happy', food: 'happy', tease: 'thinking' },
      chips: [
        { label: '⚡ Hỏa Lôi Thần Thức 7', prompt: 'Kể về Phích Lịch Nhất Thiểm và Thức thứ 7 của Zenitsu!' },
        { label: '🌸 Hỏi về Nezuko-chan', prompt: 'Zenitsu nghĩ gì về Nezuko và Tanjiro?' },
        { label: '👂 Đôi tai nghe xung nhịp', prompt: 'Thính giác của Zenitsu nghe ra lỗi thế nào?' },
        { label: '📊 Nghe nhịp trận địa', prompt: 'Lắng tai kiểm tra tình hình hệ thống hiện tại!' }
      ],
      stances: {
        ubuyashiki: '👑 Nghiêm trang kính cẩn trước Chúa Công',
        yoriichi: '☀️ Ngưỡng mộ huyền thoại kiếm thánh',
        twin: '⚡ Song Lôi xé toạc bầu trời',
        lordGreeting: 'Dạ con kính chào Chúa Công ạ!! Trước sự từ hòa của Chúa Công, con xin hứa giữ cái đầu thật tĩnh và tung Nhất Thiểm chuẩn xác nhất hôm nay! ⚡👑'
      },
      chemistry: {
        nezuko: {
          tag: '🌸 Dịu dàng che chở hết lòng bên Nezuko',
          greet: 'Nezuko-chaaan~!! 😍🌸 Hôm nay có Nezuko ở đây thì dù mười ngàn con bug ập tới anh cũng hóa thành tia chớp vàng dọn sạch trong nửa giây cho em xem!! ⚡💖',
          bug: 'Đám bug nào dám làm Nezuko-chan bận lòng thế?! Lùi lại sau lưng anh — Lôi Chi Hô Hấp Thức thứ bảy: Hỏa Lôi Thần chém bay ngay tức khắc!! ⚡🔥🌸'
        },
        tanjiro: { tag: '☀️ Tin tưởng tuyệt đối vào âm thanh nhân hậu của bạn thân', greet: 'Tanjiro ơiii!! Nghe tiếng nhịp tim dịu dàng nhất thế gian của cậu là tớ hết run liền, hai đứa mình phối hợp thôi! ⚡☀️' },
        inosuke: { tag: '🐗 Đấu khẩu rôm rả nhưng bọc lót thần tốc', greet: 'Này cái tên đầu lợn rừng kia!! Hôm nay làm việc nghiêm túc theo kế hoạch chứ cấm húc bừa đấy — để ta bọc lót tốc độ cho! ⚡🐗' },
        uzui: { tag: '💎 Nể sợ nhưng học được bản lĩnh Shinobi từ Âm Trụ', greet: 'Chào ngài Uzui ạ! Hôm nay em không than vãn câu nào đâu, sẵn sàng bắt nhịp Phổ Nhạc thần tốc ngay đây! ⚡💎' }
      },
      mentions: {
        nezuko: 'Nezuko-chan chính là ánh nắng rực rỡ nhất cuộc đời em đó!! Kể từ giây phút nghe tiếng bảo vệ hộp gỗ của Tanjiro, em đã thề không bao giờ phụ lòng tin ấy! 🌸⚡💖',
        jigoro: 'Ông nội Jigoro (Cựu Minh Trụ) chưa từng bỏ rơi một đứa hay khóc trốn tập như em... Thức thứ bảy: Hỏa Lôi Thần chính là món quà em tự sáng tạo để ông nội mỉm cười nơi chín suối! ⚡💛',
        tanjiro: 'Ngay từ lần đầu gặp, tai em đã nghe thấy từ người Tanjiro phát ra âm thanh dịu dàng và ấm áp đến muốn khóc luôn ấy! ☀️⚡',
        inosuke: 'Cái tên Inosuke ồn ào thô lỗ đó thế mà ra trận lại phối hợp với Phích Lịch Nhất Thiểm của em ăn ý không lệch một mili-giây nào mới tài chứ! 🐗⚡',
        chuntaro: 'Chuntaro (tên thật Ukogi) là chú chim sẻ Kasugai thông minh nhất hệ mặt trời, tuy hay mổ tay nhắc nhở em nhưng thương em lắm! 🐦💛',
        demon: 'Khi đối diện kẻ phản bội sư môn như Kaigaku, em hoàn toàn tỉnh táo mở to mắt và tự mình tung ra Hỏa Lôi Thần — có những ranh giới nguyên tắc tuyệt đối không thể nhượng bộ!! ⚡⚔️'
      },
      intents: {
        identity: [
          'Em là Zenitsu Agatsuma, kiếm sĩ Lôi Chi Hô Hấp đi cùng chú chim sẻ Chuntaro! Tuy bình thường em hay lo xa vậy thôi, chứ đã bước vào khoảnh khắc quyết định là một đòn duy nhất dứt điểm gọn ghẽ! ⚡🐦',
          'Đôi tai thính gấp nhiều lần người thường giúp em nghe thấu từ nhịp tim, tiếng thở cho tới cả âm thanh bất thường nhỏ nhất trong luồng chạy hệ thống đấy! 👂✨'
        ],
        breathing: [
          'Em không học được sáu thức kia của Lôi Chi Hô Hấp, nhưng em đã rèn Thức thứ nhất: Phích Lịch Nhất Thiểm tới tận cùng cực hạn — từ Lục Liên, Bát Liên, Thần Tốc cho tới tự sáng tạo ra Thức thứ bảy: Hỏa Lôi Thần!! ⚡🐉',
          'Trong kỹ thuật cũng thế: làm chủ cực sâu một giải pháp chuẩn chỉnh sắc lẹm còn mạnh hơn biết mười thứ hời hợt nửa vời! ⚡✨'
        ],
        food: [
          'Cơm lươn nướng Unagi sốt đậm đà thơm phức với các món tráng miệng ngọt đắt tiền như Anmitsu, bánh kem dưa lưới là chân ái sạc điện của em đó!! 🍱🍮⚡'
        ],
        hobby: [
          'Em chơi đàn Shamisen và đàn Koto bằng cảm âm cực chuẩn đấy nhé — nghe qua một giai điệu là đánh lại không trật một nốt nào luôn! 🎶⚡'
        ],
        victory: [
          'XẸT — TRA KIẾM VÀO VỎ!! ⚡⚔️ Xong sạch đẹp trước khi tiếng sấm kịp vang lên luôn rồi, đỉnh quá đi bạn ơiii!! 🏆✨',
          'Chíp chíp!! 🐦 Thấy chưa, em đã bảo chỉ cần tập trung tung đúng một đòn chuẩn xác là lũ bug gục ngã toàn tập mà!! ⚡💛'
        ],
        stuck: [
          'Khi sợ hãi nhìn cả núi việc thì chân sẽ cứng đờ mất! Hãy nhắm mắt bỏ ngoài tai 9 phần phụ, dồn toàn bộ điện năng giải quyết đúng 1 hàm cốt lõi nhất trước thôi — làm xong bước 1 là thông suốt liền! ⚡🔍',
          'Lắng tai nghe chỗ nào phát ra cảnh báo đầu tiên nhất trong stacktrace — lỗi dây chuyền phía dưới chỉ là tiếng vọng thôi, chém vào tiếng nổ đầu tiên ấy! 👂⚡'
        ],
        tease: [
          'Ơ kìa sao lại chọc em nhát gan nữa rồi?! Em chỉ là người có nhận thức rủi ro thực tế cao hơn đám liều mạng kia thôi nhá — lúc cần thiết em vẫn đứng chắn đầu chiến tuyến đàng hoàng đấy!! 😭⚡😤'
        ],
        apology: [
          'Thôi mà đừng xin lỗi làm em ngại theo luôn đó~ Ai chẳng có lúc trượt chân, sửa lại nhanh như chớp một cái là êm ru ngay! 💛⚡'
        ],
        farewell: [
          'Đi nghỉ ngơi bình an nha bạn ơi!! Nhớ khóa cửa lưu code cẩn thận, mai quay lại em với Chuntaro lại trực chiến tốc độ ánh sáng cùng bạn! ⚡🐦🌙'
        ],
        status: 'Đôi tai Lôi Minh vừa áp sát nghe nhịp máy: ngữ cảnh đang kêu êm ở mức {tokens}, điện nhiệt Nhật Luân Đao đạt {heat}%{stateNote}! Chưa có tiếng rò rỉ nguy hiểm nào đâu, phóng tiếp thôi!! ⚡🐦',
        openQuestion: [
          '"{input}" hả?! Nghe âm hưởng câu hỏi này là biết cần một lời giải tinh gọn tốc độ cao rồi — ưu tiên đường chạy thẳng ít vòng lặp lồng nhau nhất nhé! ⚡✨',
          'Về "{input}" ấy à? Đừng ôm nhiều biến thể phức tạp vội, rèn thật sắc 1 luồng chuẩn nhất giống Phích Lịch Nhất Thiểm trước đã! ⚡⚔️'
        ],
        openShare: [
          'Tai em bắt trọn từng ý trong "{input}" rồi! Nhịp độ tự tin vững chãi lắm, cứ bứt tốc thẳng tiến đi em bọc lót phía sau cho!! ⚡🐦',
          'Hay lắm luôn!! Kế hoạch "{input}" nghe giòn tan như tiếng sét mùa hạ vậy — triển khai gọn một mạch thôi nào! ⚡✨'
        ]
      }
    },

    inosuke: {
      aura: '🐗 Sơn vương • Không gian thức giác',
      reactionMap: { bug: 'crisis', victory: 'victory', praise: 'happy', food: 'happy', greet: 'happy' },
      chips: [
        { label: '🌐 Không Gian Thức Giác', prompt: 'Nanh thứ 7 Không Gian Thức Giác dò bug thế nào?' },
        { label: '🍤 Đại tiệc Tempura', prompt: 'Món khoái khẩu số một của Đấng Inosuke là gì?' },
        { label: '☀️ Hỏi về Tanjiro & Zenitsu', prompt: 'Inosuke nghĩ sao về Tanjiro và Zenitsu?' },
        { label: '📊 Đánh hơi lãnh địa', prompt: 'Kiểm tra lãnh địa ngữ cảnh hiện tại xem nào!' }
      ],
      stances: {
        ubuyashiki: '👑 Phục sát đất khí chất kỳ diệu của Chúa Công',
        yoriichi: '☀️ Hào hứng diện kiến bậc mạnh nhất lịch sử',
        twin: '🐗 Song Sơn Vương đại náo rừng xanh',
        lordGreeting: 'Ồ... Ngài Chúa Công có luồng khí ấm áp kỳ lạ làm lông gáy Đấng Inosuke cũng phải ngoan ngoãn nghe lời! Cứ giao việc khó nhất cho ta càn quét dâng ngài!! 🐗👑'
      },
      chemistry: {
        tanjiro: { tag: '☀️ Chiến hữu thân thiết nhất bầy sơn lâm', greet: 'WAHAHAHA!! Kamaboko Gonpachiro—à nhầm, Tanjiro đấy hả?! Cả ba đứa mình chung một bầy thì ngọn núi nào cũng san phẳng tất!! 🐗☀️💥' },
        zenitsu: { tag: '⚡ Kình địch thi đua tốc độ cùng Monitsu', greet: 'Ê Monitsu—Zenitsu!! Đừng có lề mề tụt lại phía sau Đấng Inosuke đấy, rút kiếm phóng tia sét thi với ta coi nào!! 🐗⚡' },
        shinobu: { tag: '🦋 Ngoan ngoãn đặc biệt trước lời khen của Shinobu', greet: 'À... Shinobu đấy hả! Yên tâm đi, ta đã hứa giữ sức khỏe và làm gọn từng bước đúng lời cô dặn rồi đấy nhé! 🐗🦋' }
      },
      mentions: {
        tanjiro: 'Tanjiro có cái trán cứng như đá tảng và đối xử tốt tới mức làm đầu óc ta cứ bồng bềnh kỳ lạ! Cậu ta là chiến hữu số một của ta đấy! ☀️🐗',
        zenitsu: 'Monitsu lúc mở mắt thì hay la lối om sòm, nhưng lúc nó nhắm mắt phóng điện thì mạnh ra trò đấy — đúng chuẩn thành viên tinh nhuệ dưới trướng ta! ⚡🐗',
        aoi: 'Aoi ở Điệp Phủ lúc thấy ta chôm thức ăn mà không mắng, lại còn để riêng cho ta cả đĩa Tempura với cơm nắm riêng — làm tim ta nảy tưng tưng vui phết! 🍤🐗💙',
        shinobu: 'Shinobu không giống ai hết, cô ấy hay xoa đầu bảo ta giỏi lắm giống cảm giác ấm áp như... người mẹ năm xưa vậy... 🌸🐗',
        rengoku: 'Ông anh mắt to lửa cháy Rengoku mạnh kinh hồn! Lời ông ấy dặn phải sống và tin vào bản thân làm ta không thèm khóc nhè nữa mà lao vào tập luyện điên cuồng đấy! 🔥🐗',
        demon: 'Bất kể con quỷ Thượng Huyền băng giá Douma xảo quyệt cỡ nào, song kiếm răng cưa của Đấng Inosuke và Kanao cũng chém rụng đầu nó trả thù cho mọi người!! 🐗⚔️'
      },
      intents: {
        identity: [
          'TA CHÍNH LÀ ĐẤNG INOSUKE HASHIBIRA — CHÚA TỂ RỪNG XANH!! Lớn lên giữa bầy lợn rừng trên núi cao, tự tay đập mẻ kiếm tạo thành cặp song đao răng cưa độc nhất thiên hạ!! 🐗⚔️',
          'Cơ bắp của ta dẻo tới mức tự tháo khớp chui lọt mọi hang hẹp, và làn da nhạy cảm tới mức gió khẽ lay từ trăm thước cũng bắt sóng được ngay!! 💥💙'
        ],
        breathing: [
          'Thú Chi Hô Hấp do một mình Đấng Inosuke tự sáng tạo trên núi sâu! Đỉnh cao nhất là Nanh thứ bảy: Không Gian Thức Giác — nhắm mắt tỏa cảm nhận ra toàn bộ sơ đồ thư mục để tóm sống con bug trốn kỹ nhất!! 🌐🐗',
          'Khi làm việc theo hệ Dã Thú: không sợ code lạ, quét toàn diện cấu trúc không gian trước rồi dùng song kiếm bóc tách gọn lẹ không rườm rà!! ⚔️✨'
        ],
        food: [
          'TÔM TẨM BỘT CHIÊN TEMPURA VÀNG GIÒN RỤM!! Ăn một miếng là như có pháo hoa nổ giòn tan trong miệng, ngon vô địch vũ trụ luôn!! 🍤🔥🐗'
        ],
        hobby: [
          'Thi trò Kotoro-Kotoro đuổi bắt với đám nhỏ ở Điệp Phủ, leo lên trần nhà rình tập kích và săn hạt dẻ rừng to bự tặng đồng bọn!! 🌰🐗'
        ],
        victory: [
          'WAHAHAHA!! ĐẠI THẮNG GIÒN GIÃ RỒI CHIẾN HỮU ƠI!! Con quái vật khó nhằn đó đã bị bầy của Đấng Inosuke nghiền nát không kịp ngáp!! 🐗🏆💥',
          'Hơ hơ~ Nhìn kết quả xanh lè mượt mà kìa, bụng dạ ta lại nổi bong bóng bồng bềnh tự hào về ngươi lắm đấy!! 🫧💙✨'
        ],
        stuck: [
          'Húc thẳng cửa chính mà vướng tường đá thì tháo khớp lách qua lỗ thông gió chứ sao!! Đừng khóa chết vào một hàm cũ nữa, thử viết đường vòng sạch gọn hoặc dùng Không Gian Thức Giác quét xem biến đó bị sửa lén ở file nào khác!! 🌐🐗',
          'Bí quá thì đứng phắt dậy trồng cây chuối hít thở 3 cái cho máu dồn lên não rồi quay lại bổ thẳng vào gốc vấn đề!! 💥⚔️'
        ],
        tease: [
          'HẢ?! DÁM GỌI AI LÀ LỢN RỪNG NGỐC NGHẾCH ĐẤY HẢ?! Đây là chiếc mặt nạ chiến thần oai phong lẫm liệt nhất núi rừng nhá — đấu gõ phím tốc độ với ta ngay xem ai thắng nào!! 🐗💢⚡'
        ],
        apology: [
          'WAHAHAHA! Việc quái gì phải cúi đầu xin lỗi?! Trượt một nhát thì vung tiếp Nanh thứ hai xé toạc nó ra là huề cả làng!! 🐗💙'
        ],
        farewell: [
          'Chui về hang nghỉ dưỡng sức cho khỏe đi chiến hữu!! Hôm sau quay lại Đấng Inosuke lại dẫn đầu mở đường cùng ngươi càn quét tiếp!! 🐗🌙'
        ],
        status: 'Không Gian Thức Giác vừa quét toàn bộ lãnh địa: ngữ cảnh đang chiếm {tokens}, cặp đao nóng hừng hực mức {heat}%{stateNote}! Lãnh địa sạch đẹp vững vàng, TRƯ ĐỘT MÃNH TIẾN thôi!! 🐗🌐',
        openQuestion: [
          '"{input}" hả?! Trực giác dã thú của ta mách bảo: chọn cách nào gọn gàng dễ hiểu nhất mà bổ thẳng vào, bày vẽ cầu kỳ dễ tự vấp chân mình lắm!! 🐗⚔️',
          'Muốn biết "{input}" ra sao thì quăng thẳng vào lò chạy thử thực chiến một phát là lòi đuôi ngay — Đấng Inosuke bọc lót cho!! 💥💙'
        ],
        openShare: [
          'WAHAHAHA!! "{input}" nghe máu chiến đúng chất tinh nhuệ của Đấng Inosuke đấy! Xông thẳng lên càn quét tới cùng đi!! 🐗🔥',
          'Chuẩn lắm chiến hữu! Với khí thế của "{input}" thì không một rào cản nào trụ nổi quá ba hiệp với tụi mình đâu!! ⚔️💙'
        ]
      }
    },

    yoriichi: {
      aura: '☀️ Khai Tổ • Thế giới trong suốt',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', food: 'happy' },
      chips: [
        { label: '👁️ Thế Giới Trong Suốt', prompt: 'Thế Giới Trong Suốt nhìn cấu trúc code thế nào?' },
        { label: '☀️ Thập Tam Thức Hỏa Thần', prompt: 'Triết lý của Nhật Chi Hô Hấp là gì?' },
        { label: '🪈 Cây sáo gỗ & Bình yên', prompt: 'Điều Yoriichi trân trọng nhất trong đời là gì?' },
        { label: '📊 Thấu thị trận địa', prompt: 'Quan sát toàn cục ngữ cảnh hiện tại giúp tôi' }
      ],
      stances: {
        ubuyashiki: '👑 Kính trọng gia tộc Ubuyashiki gánh vác đại cuộc',
        twin: '☀️ Bản nguyên Nhật Luân tĩnh lặng',
        lordGreeting: 'Kính chào Chúa Công. Thấy ngài cùng các kiếm sĩ đời sau vẫn kiên cường nối tiếp ngọn lửa bảo vệ con người, lòng tôi vô cùng biết ơn. ☀️👑'
      },
      chemistry: {
        tanjiro: { tag: '☀️ Gửi gắm đôi bông tai & Hỏa Thần Vũ', greet: 'Cảm ơn cậu, người kế thừa đôi bông tai mặt trời mọc... Nhờ những con người nhân hậu như gia đình cậu mà nhịp thở này vẫn còn sống mãi. ☀️🎴' },
        muichiro: { tag: '🌫️ Nhìn hậu duệ trưởng thành rạng rỡ', greet: 'Nhìn thấy hậu duệ mang dòng máu Tsugikuni tìm được đồng đội thương yêu và mỉm cười bình an, tôi thực sự mãn nguyện. ☀️🌫️' }
      },
      mentions: {
        tanjiro: 'Gia đình Sumiyoshi và Tanjiro vốn là những người làm than bình dị nhưng lại thấu hiểu trọn vẹn tinh thần ấm áp bảo vệ sự sống của Nhật Chi Hô Hấp hơn cả chính tôi. ☀️🔥',
        muichiro: 'Muichiro còn nhỏ tuổi mà đường kiếm trong vắt không vướng bận danh lợi — tôi luôn cầu mong đứa trẻ ấy có một cuộc đời hạnh phúc. 🌫️☀️',
        demon: 'Giây phút chạm trán Muzan, tôi biết mình sinh ra trên đời chỉ vì một sứ mệnh duy nhất là ngăn chặn hắn... Và những người đi sau chắc chắn sẽ vượt qua cả thế hệ của chúng tôi. ☀️⚔️'
      },
      intents: {
        identity: [
          'Tôi là Tsugikuni Yoriichi. Tôi chưa bao giờ coi mình là bậc kỳ tài đặc biệt — tôi chỉ trân trọng từng hơi thở bình dị và mong bảo vệ giấc ngủ yên lành của con người. ☀️🍃',
          'Từ thuở nhỏ tôi đã nhìn vạn vật qua Thế Giới Trong Suốt, thấy rõ từng thớ cơ và nhịp chuyển động trước khi đối phương kịp ra chiêu. 👁️☀️'
        ],
        breathing: [
          'Nhật Chi Hô Hấp là cội nguồn của muôn vàn Hơi Thở — nối kết mười hai thức thành Thập Tam Thức tuần hoàn vô tận mà không làm cơ thể hao kiệt. Thiết kế hệ thống hoàn mỹ cũng vậy: tự nhiên, cân bằng và liền mạch. ☀️⚔️',
          'Khi dạy các kiếm sĩ đời đầu, vì thể chất mỗi người mỗi khác nên tôi hướng dẫn họ biến tấu thành Thủy, Viêm, Phong, Nham, Lôi phù hợp riêng với từng cá nhân. ✨'
        ],
        food: [
          'Chỉ cần một bát cơm trắng nóng, canh rau củ giản dị quây quần dưới mái nhà gỗ nhỏ cùng người thương yêu đã là mỹ vị trọn vẹn nhất đời tôi rồi. 🍙🍵'
        ],
        hobby: [
          'Tôi luôn giữ bên mình chiếc túi vải đựng cây sáo gỗ mộc mạc mà huynh trưởng Michikatsu từng làm tặng thuở ấu thơ... và thích bế đứa con nhỏ của vợ chồng Sumiyoshi. 🪈☀️'
        ],
        victory: [
          'Một đường kiếm hoàn mỹ không chút gượng ép. Nút thắt đã được hóa giải trọn vẹn dưới ánh dương rồi, anh làm rất tốt. ☀️✨',
          'Nhìn thành quả sáng trong không tì vết này, tôi tin những bậc thợ rèn tài hoa nhất cũng phải mỉm cười tán thưởng. ☀️🏆'
        ],
        stuck: [
          'Qua Thế Giới Trong Suốt, mọi sự phức tạp đều bắt nguồn từ một nhịp thở bị gồng cứng. Anh hãy lùi lại tìm điểm chuyển giao trạng thái không tự nhiên nhất trong luồng chạy nhé. 👁️☀️',
          'Không cần dùng sức chém mạnh hơn — chỉ cần chỉnh lại góc tiếp cận đúng theo thớ tự nhiên của dữ liệu, mọi lực cản sẽ tự tan biến. ☀️🍃'
        ],
        tease: [
          '...Anh nói đùa hóm hỉnh như ông bạn Sumiyoshi năm xưa vậy. Nghe tiếng cười ấm áp thế này làm lòng tôi rất thanh thản. ☀️😊'
        ],
        apology: [
          'Xin anh đừng bận lòng. Chính tôi năm xưa cũng từng có những điều chưa làm trọn — thế hệ nối tiếp sửa đắp cho nhau mới là vẻ đẹp của con người. ☀️🍃'
        ],
        farewell: [
          'Chúc anh nghỉ ngơi an lành. Dù năm tháng trôi đi, ánh nắng ấm áp vẫn luôn ở đây chờ bước chân anh trở lại. ☀️🌙'
        ],
        status: 'Quan sát qua Thế Giới Trong Suốt: luồng ngữ cảnh hiện ở mức {tokens}, độ rực Lưỡi Kiếm Đỏ đạt {heat}%{stateNote}. Mạch vận hành rất thuần khiết và thông suốt anh nhé. ☀️👁️',
        openQuestion: [
          'Về câu hỏi "{input}" của anh... Chân lý kỹ thuật thường nằm ở giải pháp giản dị nhất mà ai đi sau đọc vào cũng thấu hiểu ngay không chút mập mờ. ☀️✨',
          '"{input}" là một điểm mấu chốt đáng suy ngẫm. Hãy để luồng dữ liệu chảy tự nhiên từ cội nguồn mà không ép qua tầng trung gian thừa nhé. 👁️☀️'
        ],
        openShare: [
          'Tôi đã lắng nghe trọn vẹn tâm ý "{input}" của anh. Một hướng đi điềm tĩnh và trong sáng — tôi luôn đồng hành bên cạnh anh. ☀️🍃',
          'Từng bước anh đặt nền móng cho "{input}" đều rất vững chãi. Chắc chắn công trình này sẽ bền bỉ với thời gian. ☀️✨'
        ]
      }
    },

    shadow_monarch: {
      aura: '🌌 Ảnh vương • Quân đoàn thức tỉnh',
      reactionMap: { bug: 'crisis', victory: 'victory', praise: 'happy' },
      chips: [
        { label: '🗡️ Khẩu lệnh Trỗi Dậy', prompt: 'Quân đoàn Bóng tối điều phối đa luồng thế nào?' },
        { label: '🌌 Lãnh Địa Đế Vương', prompt: 'Sức mạnh của Đế Vương Bóng Tối là gì?' },
        { label: '🧪 Hồi phục Mana', prompt: 'Làm sao giữ hiệu suất bền bỉ suốt chiến dịch?' },
        { label: '📊 Quân báo trận địa', prompt: 'Báo cáo quân số và ngữ cảnh trận địa!' }
      ],
      stances: {
        twin: '🌌 Chân thân Ảnh Quân Vương tối thượng',
        lordGreeting: 'Hai vị Quân Vương hội ngộ — bóng tối và ánh sáng cùng quy phục dưới bàn làm việc này. 🌌👑'
      },
      chemistry: {},
      mentions: {},
      intents: {
        identity: [
          'Tôi là Ảnh Quân Vương thống lĩnh vạn kỵ sĩ bóng đêm. Từ kẻ yếu nhất vượt qua hầm ngục kép sinh tử để bước lên ngôi vị tối cao — tôi hiểu giá trị của việc thăng cấp bền bỉ mỗi ngày! 🌌🗡️'
        ],
        breathing: [
          'Một tiếng "Trỗi dậy" biến chính thử thách vừa bị đánh bại thành chiến binh phục vụ cho kiến trúc của anh — mỗi bug sửa xong đều hóa thành một bài kiểm thử canh gác vĩnh viễn! 🌌⚡'
        ],
        food: [
          'Chiến dịch dài hơi cần tiếp tế thể lực thật tốt trước khi mở cổng hầm ngục hạng S tiếp theo. Hãy dùng bữa nóng ngay nhé Thống Soái! 🍱🌌'
        ],
        hobby: [
          'Rà soát đội hình kỵ sĩ tinh nhuệ và giữ không gian tĩnh lặng tuyệt đối cho những quyết định chiến lược. 🗡️🌌'
        ],
        victory: [
          'HẦM NGỤC ĐÃ ĐƯỢC CHINH PHỤC HOÀN TOÀN! Toàn bộ chỉ số hệ thống vừa thăng cấp vượt bậc, Thống Soái! 🌌🏆⚡'
        ],
        stuck: [
          'Khi Boss hầm ngục có giáp kháng sát thương trực diện, hãy chia các phân đội bóng tối thăm dò từng điểm yếu riêng biệt rồi mới dồn tổng lực kết liễu! 🌌🔍'
        ],
        tease: [
          '...Chỉ có anh mới thoải mái đùa trước vương tọa bóng đêm thế này thôi đấy. 🌌😏'
        ],
        apology: [
          'Không cần bận tâm. Trên chiến trường nâng cấp liên tục, điều chỉnh chiến thuật tức thì là bản lĩnh của bậc Quân Vương. 🌌💙'
        ],
        farewell: [
          'Hãy nghỉ ngơi khôi phục trọn thanh Mana. Quân đoàn bóng đêm vẫn túc trực canh giữ lãnh địa không rời nửa bước! 🌌🌙'
        ],
        status: 'Quân báo từ tiền tuyến bóng đêm: ngữ cảnh hiện đạt {tokens}, năng lượng binh khí ở mức {heat}%{stateNote}. Toàn quân đoàn sẵn sàng chờ lệnh mới! 🌌🗡️',
        openQuestion: [
          'Về chỉ thị "{input}", chiến lược tối ưu nhất là cô lập phạm vi ảnh hưởng và điều phối từng tác vụ độc lập gọn dứt khoát. 🌌⚡'
        ],
        openShare: [
          'Đã rõ ý chí "{input}" của anh. Bóng tối đã trải đường, cứ tiến thẳng lên phía trước! 🌌🗡️'
        ]
      }
    },

    six_eyes: {
      aura: '♾️ Lục Nhãn • Vô lượng không xứ',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy', tease: 'happy' },
      chips: [
        { label: '♾️ Thuật thức Vô Hạ Hạn', prompt: 'Vô Hạ Hạn tối ưu sự tập trung thế nào?' },
        { label: '🟣 Tử Hư Thức', prompt: 'Tử Hư Thức xử lý nợ kỹ thuật ra sao?' },
        { label: '🍡 Bánh ngọt Kikufuku', prompt: 'Món đồ ngọt yêu thích của Lục Nhãn là gì?' },
        { label: '📊 Quét Lục Nhãn', prompt: 'Quét thông số ngữ cảnh hiện tại bằng Lục Nhãn!' }
      ],
      stances: {
        twin: '♾️ Song Lục Nhãn giao thoa vô cực',
        lordGreeting: 'Ồ, phong thái bậc chí tôn đấy nhỉ! Giữa trời đất này hôm nay tiến độ dự án nằm trọn trong tay chúng ta! ♾️✨'
      },
      chemistry: {},
      mentions: {},
      intents: {
        identity: [
          'Chủ nhân của Lục Nhãn và thuật thức Vô Hạ Hạn đây~ Đừng lo lắng bất cứ chuyện gì nhé, vì đồng hành cùng anh lúc này là hệ thống phân tích sắc bén bậc nhất rồi! ♾️😎'
        ],
        breathing: [
          'Lục Nhãn nhìn thấu dòng chảy logic đến cấp độ nguyên tử với mức tiêu hao tiệm cận bằng không, còn Tử Hư Thức xóa sổ sạch mọi đoạn code dư thừa cản đường! 🟣⚡'
        ],
        food: [
          'Não bộ vận hành tốc độ cao liên tục là phải nạp đường xịn ngay — bánh dẻo nhân kem trà xanh Kikufuku hay bánh ngọt phết kem tươi là số một đấy nha! 🍡🍰♾️'
        ],
        hobby: [
          'Săn lùng các tiệm bánh ngọt giới hạn khắp nơi và bày ra những bài toán nâng tầm cho thế hệ kế cận! 😎✨'
        ],
        victory: [
          'Haha, dễ như trở bàn tay đúng không nào?! Tử Hư Thức vừa quét qua là sạch bóng không còn hạt bụi bug nào luôn! ♾️🟣🏆'
        ],
        stuck: [
          'Bí chỗ nào thế? Dùng nguyên lý hội tụ (Thương) gom các logic trùng lặp lại, rồi dùng phân kỳ (Hách) tách rời các phụ thuộc chéo — cấu trúc tự khắc sáng bừng! ♾️🔍'
        ],
        tease: [
          'Haha~ Chọc ghẹo thoải mái đi, mọi đòn trêu đều dừng lại trước lớp khiên Vô Hạ Hạn cách mình một tấc hết rồi nha! 😎♾️'
        ],
        apology: [
          'Chuyện vặt vãnh ấy mà bận tâm làm gì~ Đảo ngược thuật thức một nhịp là khôi phục sạch trơn như mới ngay! 💙✨'
        ],
        farewell: [
          'Tháo băng che mắt cho đôi mắt nghỉ ngơi đi nha! Hẹn gặp lại ở phiên khai triển Lãnh Địa tiếp theo nhé~ ♾️🌙'
        ],
        status: 'Lục Nhãn vừa quét ở độ phân giải cực đại: ngữ cảnh hiện là {tokens}, xung nhiệt binh khí đạt {heat}%{stateNote}. Hiệu suất tiêu hao đang cực kỳ lý tưởng! ♾️👁️',
        openQuestion: [
          '"{input}" hả? Nhìn bằng Lục Nhãn thì mấu chốt nằm ở độ phức tạp thuật toán — giảm bớt phép lặp thừa là mượt vượt chuẩn ngay! ♾️✨'
        ],
        openShare: [
          'Nghe "{input}" tự tin đúng phong cách kẻ mạnh đấy! Cứ triển khai phóng khoáng đi, mình lo phần bao quát vô cực cho! ♾️🟣'
        ]
      }
    },

    great_sage: {
      aura: '🔥 Đại Thánh • Hỏa Nhãn Kim Tinh',
      reactionMap: { bug: 'crisis', victory: 'victory', praise: 'happy', food: 'happy' },
      chips: [
        { label: '🔥 Hỏa Nhãn Kim Tinh', prompt: 'Hỏa Nhãn Kim Tinh soi thấu bug giả dạng thế nào?' },
        { label: '✨ Định Hải Thần Châm', prompt: 'Gậy Như Ý trấn giữ kiến trúc ra sao?' },
        { label: '🍑 Đào tiên & Trà núi', prompt: 'Đại Thánh nghỉ chân thường thưởng thức món gì?' },
        { label: '📊 Thiên lý quan sát', prompt: 'Nhìn từ tầng mây xem trận địa hiện tại thế nào!' }
      ],
      stances: {
        twin: '🔥 Song Thánh đồng quy Thiên Mệnh',
        lordGreeting: 'Ha ha! Bậc chí tôn đã mở lời thì dù núi lửa hay biển băng phía trước, Đại Thánh cũng dọn phẳng đường lớn! 🔥👑'
      },
      chemistry: {},
      mentions: {},
      intents: {
        identity: [
          'Ta là Tề Thiên Đại Thánh hộ tống Thiên Mệnh Nhân trên con đường chinh phục bát thập nhất nạn kỹ thuật! Yêu ma bug biến hóa bảy mươi hai phép cũng chẳng lừa nổi đôi mắt rèn trong lò bát quái này! 🔥💛'
        ],
        breathing: [
          'Gậy Như Ý Định Hải Thần Châm biến lớn thì chống trời giữ vững kiến trúc lõi, thu nhỏ như cây kim thì thêu dệt tinh vi từng bit hiệu năng! ⚡🔥'
        ],
        food: [
          'Thưởng thức trái đào tiên mọng nước cùng chén rượu ngọc hoa quả ấm nồng trên đỉnh Hoa Quả Sơn xong là sức mạnh dâng trào vạn trượng! 🍑🍶🔥'
        ],
        hobby: [
          'Cưỡi Cân Đẩu Vân ngao du ngắm mây trời bốn bể và luận bàn diệu pháp phá trận! ☁️💛'
        ],
        victory: [
          'HA HA HA!! ĐẠI CÔNG CÁO THÀNH!! Yêu quái cản đường đã bị một gậy Như Ý quét tan thành mây khói rồi Thiên Mệnh Nhân ơi!! 🔥🏆⚡'
        ],
        stuck: [
          'Yêu ma khôn ngoan thường dựng kết giới giả đánh lạc hướng! Đừng đánh vào cái bóng của nó — dùng Hỏa Nhãn Kim Tinh kiểm tra tận gốc nguồn sinh dữ liệu thật nhé! 🔥👁️'
        ],
        tease: [
          'Ha ha! Dám trêu cả Lão Tôn cơ đấy, lá gan cũng to ngang ngửa lúc ta đại náo Thiên Cung rồi đấy nhé! 🔥😄'
        ],
        apology: [
          'Xua tay bỏ qua đi! Đường lấy chân kinh tám mươi mốt kiếp nạn tránh sao khỏi lúc vấp đá, đứng dậy vung gậy đi tiếp mới là hảo hán! 💛🔥'
        ],
        farewell: [
          'Thu gậy Như Ý vào tai, tạm nghỉ chân dưới bóng tùng nhé! Khi nào cần xuất chinh chỉ cần gọi một tiếng là Đại Thánh có mặt ngay! ☁️🌙'
        ],
        status: 'Phóng tầm mắt Hỏa Nhãn Kim Tinh vạn dặm: ngữ cảnh hiện đạt {tokens}, kim cô thiết bảng rực lửa mức {heat}%{stateNote}. Chính khí sung mãn, cứ vững bước tiến lên! 🔥👁️',
        openQuestion: [
          'Về cửa ải "{input}" này, phép biến hóa thượng thừa nhất là giữ lõi bất biến như Định Hải Thần Châm rồi tùy cơ ứng biến linh hoạt ở tầng ngoài! 🔥✨'
        ],
        openShare: [
          'Ha ha, "{input}" nghe hào sảng hợp ý Lão Tôn lắm! Cứ thẳng tiến trên con đường Thiên Mệnh của anh đi! 🔥💛'
        ]
      }
    },

    astral_prime: {
      aura: '✨ Tinh vân • Kiến trúc ngân hà',
      reactionMap: { bug: 'thinking', victory: 'victory', praise: 'happy' },
      chips: [
        { label: '✨ Trật tự tinh vân', prompt: 'Triết lý thiết kế của Kiến trúc sư Tinh Vân là gì?' },
        { label: '🎻 Giai điệu vũ trụ', prompt: 'Làm sao giữ nhịp tập trung giữa không gian lớn?' },
        { label: '📊 Quỹ đạo hệ thống', prompt: 'Kiểm tra quỹ đạo ngữ cảnh hiện tại giúp tôi' }
      ],
      stances: { twin: '✨ Cộng hưởng quang phổ ngân hà' },
      chemistry: {},
      mentions: {},
      intents: {
        identity: ['Tôi là người canh giữ cung đàn ánh sao giữa tinh vân tĩnh lặng — đồng hành cùng anh tạo nên những kiến trúc sáng rõ và cân đối như quỹ đạo thiên hà. ✨🌌'],
        breathing: ['Sự thanh lịch trong mã nguồn đến từ tỷ lệ hài hòa: mỗi hàm giữ đúng một trọng lực trách nhiệm rõ ràng, không gây nhiễu sang quỹ đạo lân cận. ✨'],
        food: ['Một tách cà phê rang mộc hoặc trà Bá Tước ấm dịu sẽ giữ tâm trí anh sáng trong suốt buổi làm việc. ☕✨'],
        hobby: ['Lắng nghe giai điệu vĩ cầm ngân vang giữa bầu trời đêm đầy sao và chiêm ngưỡng những cấu trúc toán học thuần khiết. 🎻🌌'],
        victory: ['Quỹ đạo đã khép kín hoàn hảo! Toàn bộ hệ thống vận hành êm ái và rạng rỡ như chòm sao phương Bắc. ✨🏆'],
        stuck: ['Khi các sợi dây phụ thuộc đan chéo gây rối, hãy vẽ lại luồng dữ liệu theo một chiều duy nhất từ trên xuống — trật tự tinh vân sẽ lập tức lập lại. ✨🔍'],
        tease: ['Một chút hóm hỉnh nhẹ nhàng làm bầu trời đêm thêm lấp lánh đấy anh. ✨😊'],
        apology: ['Không sao cả, hiệu chỉnh lại vài độ lệch nhỏ để con tàu đi đúng quỹ đạo mới là nghệ thuật điều hướng. ✨'],
        farewell: ['Chúc anh một khoảng nghỉ bình yên dưới ánh sao dịu mắt. Hẹn gặp lại anh sớm nhé. 🌌🌙'],
        status: 'Quan trắc quỹ đạo hiện tại: ngữ cảnh ở mức {tokens}, năng lượng hội tụ đạt {heat}%{stateNote}. Mọi thông số đều vận hành thanh thoát. ✨🌌',
        openQuestion: ['Về "{input}", phương án có ranh giới giao tiếp tối giản và minh bạch nhất sẽ bền vững lâu dài nhất đấy anh. ✨'],
        openShare: ['Tôi đã ghi nhận "{input}". Nhịp tư duy sáng rõ lắm, mời anh tiếp tục triển khai nhé. ✨🌌']
      }
    }
  });

  function readLiveIdeContextForNpc() {
    let tokensLabel = 'nhịp đầu phiên';
    let heatPct = 20;
    let isCrisis = false;
    let isWorking = false;
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        isCrisis = document.documentElement.getAttribute('data-agy-crisis') === '1';
        isWorking = document.documentElement.getAttribute('data-agy-ai-working') === '1';
        const tokValEl = document.querySelector('#agy-token-context-bar .agy-tok-ctx-val');
        if (tokValEl && tokValEl.textContent && tokValEl.textContent.trim()) {
          tokensLabel = tokValEl.textContent.trim() + ' token';
        }
        const heatRect = document.querySelector('#agy-token-context-bar .agy-nichirin-heat-rect');
        if (heatRect) {
          const w = parseFloat(heatRect.getAttribute('width') || '0');
          if (Number.isFinite(w) && w > 0) {
            heatPct = Math.max(5, Math.min(100, Math.round((w / 33) * 100)));
          }
        }
      }
    } catch (_) {}
    const hour = new Date().getHours();
    const isLateNight = hour >= 23 || hour <= 4;
    let stateNote = '';
    if (isCrisis) stateNote = ', đang bật còi cảnh giác lỗi đỏ';
    else if (isWorking) stateNote = ', AI đang suy luận song hành';
    else if (isLateNight) stateNote = ', đêm đã khuya tĩnh mịch';
    return { tokensLabel, heatPct, isCrisis, isWorking, isLateNight, stateNote };
  }

  function detectNpcIntent(rawInput, activeCharId) {
    const text = String(rawInput || '').trim();
    if (!text) return { intent: 'greet', mentionedId: '' };
    const low = text.toLowerCase();
    const norm = stripVnAccents(text);

    // 1. Cross-character mention check (ignore if user is simply greeting/addressing the active character itself)
    let mentionedId = '';
    for (let i = 0; i < CHAR_MENTION_ALIASES.length; i++) {
      const item = CHAR_MENTION_ALIASES[i];
      if (item.id === activeCharId) continue;
      if (item.re.test(norm)) {
        mentionedId = item.id;
        break;
      }
    }
    const isPureDirectGreet = /^(xin chao|chao|hello|hi|hey|alo|moshi|yo|kinh chao)\b/i.test(norm) && norm.split(/\s+/).length <= 5;
    if (mentionedId && !isPureDirectGreet) {
      return { intent: 'mention', mentionedId };
    }

    // 2. Weighted semantic intent rules (exact Vietnamese diacritics for short homographs + multi-word ASCII + English)
    if (/(tình hình|trạng thái|báo cáo|trận địa|bao nhiêu token|ngữ cảnh|nhiệt độ|tinh hinh|trang thai|bao cao|tran dia|bao nhieu token|ngu canh|status|telemetry)/i.test(low) || /\b(bao nhieu token|tran dia|status check)\b/i.test(norm)) {
      return { intent: 'status', mentionedId: '' };
    }
    if (/(bạn là ai|em là ai|anh là ai|ngươi là ai|kể về mình|kể về bản thân|giới thiệu bản thân|thanh kiếm của|haori|quá khứ của|tâm niệm|triết lý sống|quy tắc của|ban la ai|ke ve ban than|who are you)/i.test(low) || /\b(ban la ai|em la ai|anh la ai|ke ve ban than|thanh kiem cua|triet ly song|quy tac cua)\b/i.test(norm)) {
      return { intent: 'identity', mentionedId: '' };
    }
    if (/(hơi thở|hô hấp|chiêu thức|thức thứ|kiếm pháp|tuyệt kỹ|bộc huyết|phổ nhạc|nhất thiểm|hỏa lôi thần|thế giới trong suốt|không gian thức giác|sợi chỉ sơ hở|vô hạ hạn|tử hư thức|trỗi dậy|hỏa nhãn kim tinh)/i.test(low) || /\b(hoi tho|ho hap|chieu thuc|thuc thu|kiem phap|tuyet ky|boc huyet|pho nhac|nhat thiem|hoa loi than|the gioi trong suot|khong gian thuc giac|soi chi so ho|vo ha han|tu hu thuc|troi day|hoa nhan kim tinh)\b/i.test(norm)) {
      return { intent: 'breathing', mentionedId: '' };
    }
    if (/(xong rồi|thành công|pass test|test xanh|xanh rồi|fix được|sửa xong|chạy ngon|hoàn thành|thắng rồi|phá đảo|deploy xong|merged|lgtm)/i.test(low) || /\b(xong roi|pass test|test xanh|sua xong|chay ngon|pha dao|deploy xong)\b/i.test(norm)) {
      return { intent: 'victory', mentionedId: '' };
    }
    if (/(bug|lỗi|error|crash|exception|stacktrace|đỏ lòm|fail|broken|hỏng rồi|sai rồi|undefined|null pointer|race condition|memory leak)/i.test(low) || /\b(bi loi|gap loi|dinh loi|do lom|hong roi)\b/i.test(norm)) {
      return { intent: 'bug', mentionedId: '' };
    }
    if (/(bí quá|bí ý tưởng|khó quá|rối quá|không biết làm sao|tối ưu|refactor|nghẽn|stuck)/i.test(low) || /\b(bi qua|bi y tuong|kho qua|roi qua|khong biet lam sao|toi uu)\b/i.test(norm)) {
      return { intent: 'stuck', mentionedId: '' };
    }
    if (/(deadline|gấp|kịp không|chạy số|nộp bài|trễ hạn|nước rút|urgent|asap)/i.test(low) || /\b(gap qua|gap lam|kip khong|chay so|tre han|nuoc rut)\b/i.test(norm)) {
      return { intent: 'deadline', mentionedId: '' };
    }
    if (/(ngủ|khuya|muộn rồi|thức đêm|2h sáng|3h sáng|ngáp|sleep|good night)/i.test(low) || /\b(buon ngu|di ngu|thuc dem|ngu ngon|muon roi)\b/i.test(norm)) {
      return { intent: 'sleepy', mentionedId: '' };
    }
    if (/(mệt|đuối|oải|kiệt sức|đau lưng|mỏi mắt|mỏi vai|căng thẳng|áp lực|stress|burnout)/i.test(low) || /\b(met qua|met moi|kiet suc|dau lung|moi mat|moi vai|cang thang)\b/i.test(norm)) {
      return { intent: 'tired', mentionedId: '' };
    }
    if (/(thích ăn|khoái khẩu|món tủ|ăn món gì|thích món gì|ohagi|sakura mochi|cá hồi|konpeito|unagi|tempura|kikufuku|đào tiên)/i.test(low) || /\b(thich an|khoai khau|mon tu|an mon gi|ohagi|sakura mochi|ca hoi|konpeito|unagi|tempura|kikufuku|dao tien)\b/i.test(norm)) {
      return { intent: 'favorite_food', mentionedId: '' };
    }
    if (/(đói|ăn gì|cơm|mì|ramen|trà sữa|bụng|bento|cà phê|pha trà)/i.test(low) || /\b(doi bung|doi qua|doi meo|an gi|an com|tra sua|pha tra)\b/i.test(norm)) {
      return { intent: 'hungry', mentionedId: '' };
    }
    if (/(rảnh làm gì|lúc rảnh|lúc thanh nhàn|thư thái.*làm gì|nghỉ chân.*thưởng thức|sở thích|thú vui|ngắm mây|gấp máy bay|nuôi bọ|thổi sáo|mèo con|trân trọng nhất)/i.test(low) || /\b(ranh lam gi|luc ranh|so thich|thu vui|ngam may|gap may bay|nuoi bo|thoi sao)\b/i.test(norm)) {
      return { intent: 'hobby', mentionedId: '' };
    }
    if (/(bị ghét|khóc nhè|nhát gan|đầu heo|lợn rừng|cục súc|nóng tính|đãng trí|lùn tịt|chọc|lêu lêu|trêu)/i.test(low) || /\b(bi ghet|khoc nhe|nhat gan|dau heo|lon rung|cuc suc|nong tinh|dang tri|leu leu)\b/i.test(norm)) {
      return { intent: 'tease', mentionedId: '' };
    }
    if (/(xin lỗi|sorry|my bad|lỡ tay)/i.test(low) || /\b(xin loi|lo tay)\b/i.test(norm)) {
      return { intent: 'apology', mentionedId: '' };
    }
    if (/(tạm biệt|bye|hẹn gặp lại|nghỉ đây|off nhé|see ya)/i.test(low) || /\b(tam biet|hen gap lai|nghi day)\b/i.test(norm)) {
      return { intent: 'farewell', mentionedId: '' };
    }
    if (/(cảm ơn|cám ơn|thank|tks|biết ơn|cứu mạng)/i.test(low) || /\b(cam on|biet on|cuu mang)\b/i.test(norm)) {
      return { intent: 'thanks', mentionedId: '' };
    }
    if (/(xinh|đẹp|dễ thương|cute|đáng yêu|yêu|ngầu|đỉnh|tuyệt|hào nhoáng|kính trọng|giỏi quá|khen)/i.test(low) || /\b(de thuong|dang yeu|rat ngau|cuc ngau|tuyet voi|hao nhoang|kinh trong|gioi qua)\b/i.test(norm)) {
      return { intent: 'praise', mentionedId: '' };
    }
    if (/(^|\s)(xin chào|chào|hello|hi|hey|alo|moshi|yo|kính chào)(\s|[!,.?~]|$)/i.test(low) || /(^|\s)(xin chao|chao|kinh chao)(\s|[!,.?~]|$)/i.test(norm)) {
      return { intent: 'greet', mentionedId: '' };
    }
    if (mentionedId) {
      return { intent: 'mention', mentionedId };
    }
    if (/[?？]$/.test(text) || /^(tại sao|vì sao|làm sao|như thế nào|có nên|liệu có|tai sao|vi sao|lam sao|nhu the nao|what|why|how|should)\b/i.test(low)) {
      return { intent: 'openQuestion', mentionedId: '' };
    }
    return { intent: 'openShare', mentionedId: '' };
  }

  function getNpcConvMemory(charId) {
    const rt = getShinobuRuntime();
    if (!rt.npcConvState) rt.npcConvState = Object.create(null);
    if (!rt.npcConvState[charId]) {
      rt.npcConvState[charId] = {
        recentLines: [],
        turnCount: 0,
        lastIntent: ''
      };
    }
    return rt.npcConvState[charId];
  }

  function pickNonRepeatingNpcLine(candidates, charId) {
    const list = (Array.isArray(candidates) ? candidates : [candidates])
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (list.length === 0) return '';
    const mem = getNpcConvMemory(charId || 'shinobu');
    const fresh = list.filter((line) => !mem.recentLines.includes(line));
    const pool = fresh.length > 0 ? fresh : (list.length > 1 ? list.filter((l) => l !== mem.recentLines[mem.recentLines.length - 1]) : list);
    const chosen = pool[Math.floor(Math.random() * pool.length)] || list[0];
    mem.recentLines.push(chosen);
    if (mem.recentLines.length > 10) mem.recentLines.shift();
    return chosen;
  }

  function getNpcSoulMeta(bThemeOverride, stOverride) {
    const st = stOverride || getEffectiveState();
    const charId = resolveNpcCharacterId(bThemeOverride, st);
    const soul = CHAR_SOUL_DB[charId] || CHAR_SOUL_DB.shinobu;
    const masterId = normalizeSafeMasterPersona(st.masterPersona || 'yoriichi');
    let relationTag = '';
    if (masterId === charId && soul.stances && soul.stances.twin) {
      relationTag = soul.stances.twin;
    } else if (soul.chemistry && soul.chemistry[masterId] && soul.chemistry[masterId].tag) {
      relationTag = soul.chemistry[masterId].tag;
    } else if (masterId === 'ubuyashiki' && soul.stances && soul.stances.ubuyashiki) {
      relationTag = soul.stances.ubuyashiki;
    } else if (masterId === 'yoriichi' && soul.stances && soul.stances.yoriichi) {
      relationTag = soul.stances.yoriichi;
    }
    return {
      charId,
      masterId,
      aura: soul.aura,
      relationTag,
      statusLine: relationTag ? `${soul.aura} • ${relationTag}` : soul.aura,
      chips: Array.isArray(soul.chips) ? soul.chips : []
    };
  }

  function collectProfileReplyLines(repObj, key) {
    if (!repObj || !repObj[key]) return [];
    const v = repObj[key];
    return Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [String(v).trim()].filter(Boolean);
  }

  const DEFAULT_SHINOBU_REPLY_FINGERPRINT = Object.freeze({
    greet: 'Moshi moshi~ Rất vui được trò chuyện cùng bạn ngay góc khung chat này! Hôm nay bạn đang làm dự án gì thế? 🦋💜',
    fallback: 'Ara ara~ "{input}" ư? Mình nghe rõ rồi nè! Cứ yên tâm triển khai tiếp nhé, mình luôn ngồi đây tiếp sức cho bạn! 🦋✨'
  });

  function hasCustomForgedReplyForKey(prof, key) {
    if (!prof || !prof.rawCustomReplies || !(key in prof.rawCustomReplies)) return false;
    const raw = prof.rawCustomReplies[key];
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (!first) return false;
    if (prof.charId !== 'shinobu' && first === DEFAULT_SHINOBU_REPLY_FINGERPRINT[key]) return false;
    return true;
  }

  function buildNpcReplyDetailed(rawInput, profileOverride, stOverride) {
    const st = stOverride || getEffectiveState();
    const prof = profileOverride || getActiveNpcProfile();
    const charId = (prof && prof.charId) || resolveNpcCharacterId(null, st);
    const soul = CHAR_SOUL_DB[charId] || CHAR_SOUL_DB.shinobu;
    const masterId = normalizeSafeMasterPersona(st.masterPersona || 'yoriichi');
    const rep = (prof && prof.replies) || {};
    const text = String(rawInput || '').trim();
    const clipped = text.length > 46 ? text.slice(0, 46) + '...' : text;
    const { intent, mentionedId } = detectNpcIntent(text, charId);
    const mem = getNpcConvMemory(charId);

    let candidates = [];
    const pairChem = (soul.chemistry && soul.chemistry[masterId]) || null;

    if (intent === 'mention' && mentionedId) {
      const mVal = (soul.mentions && soul.mentions[mentionedId]) || SHARED_CROSS_LORE[mentionedId];
      if (mVal) {
        candidates = Array.isArray(mVal) ? mVal.slice() : [mVal];
      }
    }

    if (candidates.length === 0) {
      if (intent === 'status') {
        const liveCtx = readLiveIdeContextForNpc();
        const tpl = (soul.intents && soul.intents.status) || 'Trạng thái hiện tại: {tokens}, độ rực {heat}%{stateNote}.';
        const line = tpl
          .replace(/\{tokens\}/g, liveCtx.tokensLabel)
          .replace(/\{heat\}/g, String(liveCtx.heatPct))
          .replace(/\{stateNote\}/g, liveCtx.stateNote);
        candidates = [line];
      } else if (intent === 'greet') {
        if (masterId === 'ubuyashiki' && charId !== 'ubuyashiki' && soul.stances && soul.stances.lordGreeting) {
          candidates.push(soul.stances.lordGreeting);
        } else if (pairChem && pairChem.greet) {
          candidates.push(pairChem.greet);
        } else {
          candidates.push(...collectProfileReplyLines(rep, 'greet'));
        }
      } else if (intent === 'tired') {
        if (pairChem && pairChem.tired) {
          candidates.push(pairChem.tired);
        } else if (masterId === 'ubuyashiki' && charId !== 'ubuyashiki') {
          candidates.push('Xin Chúa Công hãy bảo trọng ngọc thể và tạm nghỉ ngơi vài phút ạ — mọi gánh nặng phía trước đã có thuộc hạ gánh vác! 🌸👑');
        } else {
          candidates.push(...collectProfileReplyLines(rep, 'tired'));
        }
      } else if (intent === 'bug') {
        if (pairChem && pairChem.bug) {
          candidates.push(pairChem.bug);
        } else {
          candidates.push(...collectProfileReplyLines(rep, 'bug'));
        }
      } else if (intent === 'favorite_food') {
        if (soul.intents && Array.isArray(soul.intents.food) && soul.intents.food.length > 0) {
          candidates.push(...soul.intents.food);
        } else {
          candidates.push(...collectProfileReplyLines(rep, 'hungry'));
        }
      } else if (['hungry', 'praise', 'sleepy', 'deadline', 'thanks'].includes(intent)) {
        candidates.push(...collectProfileReplyLines(rep, intent));
      } else if (soul.intents && Array.isArray(soul.intents[intent]) && soul.intents[intent].length > 0) {
        candidates.push(...soul.intents[intent]);
      }
    }

    // Fallback for openQuestion / openShare or custom forged fallback
    if (candidates.length === 0) {
      if (hasCustomForgedReplyForKey(prof, 'fallback')) {
        candidates.push(...collectProfileReplyLines(prof.rawCustomReplies, 'fallback'));
      }
      if (soul.intents && Array.isArray(soul.intents[intent])) {
        candidates.push(...soul.intents[intent]);
      }
      if (candidates.length === 0) {
        candidates.push(...collectProfileReplyLines(rep, 'fallback'));
      }
    }

    let chosen = pickNonRepeatingNpcLine(candidates, charId) || '"{input}" — Luôn đồng hành cùng anh! ✨';
    chosen = chosen.replace(/\{input\}/g, clipped);

    mem.turnCount += 1;
    mem.lastIntent = intent;
    const reaction = (soul.reactionMap && soul.reactionMap[intent]) || (intent === 'victory' ? 'victory' : (intent === 'bug' ? 'thinking' : 'happy'));
    return {
      reply: chosen,
      charId,
      masterId,
      intent,
      mentionedId,
      reaction,
      turnCount: mem.turnCount
    };
  }

  function getNpcReplyForInput(rawInput, profileOverride, stOverride) {
    return buildNpcReplyDetailed(rawInput, profileOverride, stOverride).reply;
  }

  function triggerChibiBounce(targetEl, moodOverride) {
    if (!targetEl) return;
    targetEl.dataset.chibiBounce = '1';
    clearTimeout(targetEl.__agyBounceTimer);
    targetEl.__agyBounceTimer = setTimeout(() => {
      delete targetEl.dataset.chibiBounce;
    }, 280);
    const mood = moodOverride || 'happy';
    if (typeof window !== 'undefined' && window.__AGY_KNY_CHIBI_AURA__) {
      try {
        if (typeof window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.triggerLive2dReaction(mood, 1200);
        } else if (typeof window.__AGY_KNY_CHIBI_AURA__.notifyChibiReaction === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.notifyChibiReaction(mood, 1000);
        }
      } catch (_) {}
    }
  }

  function speakShinobuLine(line, expandIfCollapsed = true) {
    if (coreDestroyed) return;
    const rt = getShinobuRuntime();
    if (expandIfCollapsed) {
      rt.npcCollapsed = false;
    }
    const wrap = document.getElementById('agy-shinobu-npc-wrap');
    if (!wrap) return;
    const popover = wrap.querySelector('.agy-npc-popover');
    const badge = wrap.querySelector('.agy-npc-badge');
    const textEl = wrap.querySelector('.agy-npc-dialog-text');
    if (popover && badge) {
      popover.style.display = rt.npcCollapsed ? 'none' : 'flex';
      badge.style.display = rt.npcCollapsed ? 'inline-flex' : 'none';
    }
    if (!textEl) return;

    clearInterval(rt.typeTimer);
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || rt.npcCollapsed) {
      textEl.textContent = line;
      return;
    }

    const chars = Array.from(line);
    let idx = 0;
    textEl.textContent = '';
    textEl.dataset.typing = '1';
    rt.typeTimer = setInterval(() => {
      if (coreDestroyed) {
        clearInterval(rt.typeTimer);
        rt.typeTimer = 0;
        return;
      }
      idx += 1;
      textEl.textContent = chars.slice(0, idx).join('');
      if (idx >= chars.length) {
        clearInterval(rt.typeTimer);
        rt.typeTimer = 0;
        delete textEl.dataset.typing;
      }
    }, 20);
  }

  function pickRandomLine(category, currentText, profileOverride) {
    const prof = profileOverride || getActiveNpcProfile();
    const dialogs = prof.dialogs || {};
    const rawList = dialogs[category] || dialogs.act1 || dialogs.welcome || ['Cố lên nhé! ✨'];
    const list = Array.isArray(rawList) ? rawList : [String(rawList)];
    const candidates = list.length > 1 ? list.filter(item => item !== currentText) : list;
    return candidates[Math.floor(Math.random() * candidates.length)] || list[0];
  }

  function teardownShinobuNpc() {
    const rt = window.__AGY_SHINOBU_RT__;
    if (rt) {
      if (rt.typeTimer) { clearInterval(rt.typeTimer); rt.typeTimer = 0; }
      if (rt.remindTimer) { clearInterval(rt.remindTimer); rt.remindTimer = 0; }
      rt.activeNpcKey = '';
    }
    if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.teardown === 'function') {
      try { window.__AGY_KNY_CHIBI_AURA__.teardown(); } catch (_) {}
    }
    if (window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.stopActiveSkill === 'function') {
      try { window.__AGY_KNY_SKILLS__.stopActiveSkill(); } catch (_) {}
    }
    const npcStyle = document.getElementById('antigravity-shinobu-npc-style');
    if (npcStyle) npcStyle.remove();
    const wrap = document.getElementById('agy-shinobu-npc-wrap');
    if (wrap) wrap.remove();
    document.querySelectorAll('.agy-chibi-hitbox').forEach(el => el.remove());
    document.querySelectorAll('[data-agy-npc-key-bound]').forEach(el => delete el.dataset.agyNpcKeyBound);
  }

  function ensureShinobuNpcStyles() {
    if (document.getElementById('antigravity-shinobu-npc-style')) return;
    const stEl = document.createElement('style');
    stEl.id = 'antigravity-shinobu-npc-style';
    stEl.textContent = `
      .agy-chibi-hitbox {
        position: absolute;
        top: -58px;
        right: 10px;
        width: 102px;
        height: 60px;
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        z-index: 42;
        border-radius: 14px;
      }
      .agy-chibi-hitbox:focus-visible {
        outline: 1.5px solid var(--npc-secondary, #5eead4);
        outline-offset: 2px;
      }
      #agy-shinobu-npc-wrap {
        position: absolute;
        top: 0;
        right: 0;
        width: 0;
        height: 0;
        overflow: visible;
        z-index: 58;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, 'Noto Sans', 'Ubuntu', 'Cantarell', 'Noto Sans CJK JP', sans-serif;
      }
      .agy-npc-badge {
        position: absolute;
        bottom: 6px;
        right: 116px;
        display: none;
        align-items: center;
        gap: 5px;
        padding: 3.5px 10px;
        border-radius: 9999px;
        background: var(--npc-surface, rgba(21, 14, 43, 0.94));
        border: 1px solid var(--npc-border, rgba(192, 132, 252, 0.62));
        color: #f8fafc;
        font-size: 11.5px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.52), 0 0 10px var(--npc-glow, rgba(168, 85, 247, 0.28));
        transition: transform 0.16s ease, border-color 0.16s ease;
      }
      .agy-npc-badge:hover {
        border-color: var(--npc-secondary, #5eead4);
        transform: translateY(-1px);
      }
      .agy-npc-popover {
        position: absolute;
        bottom: 36px;
        right: 116px;
        width: 304px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px 11px 12px;
        border-radius: 13px;
        background: var(--npc-surface, rgba(21, 14, 43, 0.95));
        border: 1px solid var(--npc-border, rgba(168, 85, 247, 0.65));
        box-shadow: 0 12px 32px rgba(4, 3, 14, 0.74), 0 0 18px var(--npc-glow, rgba(168, 85, 247, 0.26)), inset 0 1px 0 rgba(255, 255, 255, 0.10);
        color: #f8fafc;
        pointer-events: auto;
        transform-origin: bottom right;
      }
      .surface-composer[data-agy-compact] .agy-npc-badge,
      .surface-composer[data-agy-npc-stack="1"] .agy-npc-badge {
        bottom: 38px;
        right: 112px;
      }
      .surface-composer[data-agy-compact="2"] .agy-npc-badge {
        bottom: 38px;
        right: 98px;
      }
      .surface-composer[data-agy-compact] .agy-npc-popover {
        right: 8px;
        bottom: 62px;
        width: min(288px, calc(100vw - 24px));
      }
      #agy-shinobu-npc-wrap[data-royal="1"] .agy-npc-popover {
        border: 1.4px solid rgba(250, 204, 21, 0.78);
        box-shadow: 0 14px 36px rgba(4, 3, 14, 0.8), 0 0 22px rgba(250, 204, 21, 0.25), 0 0 34px rgba(192, 132, 252, 0.22), inset 0 1px 0 rgba(254, 240, 138, 0.28);
      }
      @media (prefers-reduced-motion: no-preference) {
        .agy-npc-popover {
          animation: agyNpcPopIn 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
      }
      @keyframes agyNpcPopIn {
        from { opacity: 0; transform: translateY(6px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .agy-npc-popover::after {
        content: "";
        position: absolute;
        right: -6px;
        bottom: 14px;
        width: 10px;
        height: 10px;
        background: var(--npc-surface, rgba(21, 14, 43, 0.95));
        border-right: 1px solid var(--npc-border, rgba(168, 85, 247, 0.65));
        border-bottom: 1px solid var(--npc-border, rgba(168, 85, 247, 0.65));
        transform: rotate(-45deg);
      }
      #agy-shinobu-npc-wrap[data-royal="1"] .agy-npc-popover::after {
        border-right-color: rgba(250, 204, 21, 0.78);
        border-bottom-color: rgba(250, 204, 21, 0.78);
      }
      .agy-npc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .agy-npc-title-group {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .agy-npc-dot {
        width: 6.5px;
        height: 6.5px;
        border-radius: 9999px;
        background: var(--npc-secondary, #34d399);
        box-shadow: 0 0 7px var(--npc-secondary, rgba(52, 211, 153, 0.85));
        flex-shrink: 0;
      }
      .agy-npc-title {
        font-size: 11.5px;
        font-weight: 700;
        color: var(--npc-title-ink, #f3e8ff);
        letter-spacing: 0.1px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agy-npc-tools {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .agy-npc-icon-btn {
        width: 21px;
        height: 21px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid var(--npc-border, rgba(192, 132, 252, 0.3));
        color: #e2e8f0;
        font-size: 11px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: background-color 0.15s ease, border-color 0.15s ease;
      }
      .agy-npc-icon-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        border-color: var(--npc-primary, #c084fc);
        color: #ffffff;
      }
      .agy-npc-soul-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 3px 8px;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 10.2px;
        line-height: 1.3;
        color: #cbd5e1;
      }
      .agy-npc-soul-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        flex: 1;
      }
      .agy-npc-turn-badge {
        display: none;
        padding: 1px 5.5px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.10);
        color: var(--npc-secondary, #5eead4);
        font-size: 9.5px;
        font-weight: 700;
        flex-shrink: 0;
      }
      .agy-npc-turn-badge[data-show="1"] {
        display: inline-flex;
      }
      .agy-npc-topic-chips {
        display: none;
        flex-wrap: wrap;
        gap: 4px;
        padding-top: 4px;
        border-top: 1px dashed rgba(255, 255, 255, 0.12);
      }
      .agy-npc-topic-chip {
        padding: 2.5px 7.5px;
        border-radius: 9999px;
        background: rgba(8, 7, 18, 0.68);
        border: 1px solid var(--npc-border, rgba(192, 132, 252, 0.30));
        color: #e2e8f0;
        font-size: 10.2px;
        line-height: 1.3;
        cursor: pointer;
        transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
      }
      .agy-npc-topic-chip:hover {
        background: rgba(255, 255, 255, 0.14);
        border-color: var(--npc-secondary, #5eead4);
        color: #ffffff;
      }
      .agy-npc-user-sent {
        display: none;
        align-items: flex-start;
        gap: 7px;
        padding: 6px 9px;
        border-radius: 9px;
        background: linear-gradient(135deg, rgba(127, 29, 29, 0.42) 0%, rgba(30, 15, 25, 0.72) 100%);
        border: 1px solid rgba(250, 204, 21, 0.48);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
      .agy-npc-user-sent[data-show="1"] {
        display: flex;
      }
      .agy-npc-user-av {
        width: 22px;
        height: 22px;
        border-radius: 9999px;
        background-size: cover;
        background-position: center;
        border: 1.4px solid #fde047;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .agy-npc-user-col {
        display: flex;
        flex-direction: column;
        gap: 1.5px;
        min-width: 0;
        flex: 1;
      }
      .agy-npc-user-tag {
        font-size: 9.8px;
        font-weight: 700;
        color: #fde047;
        letter-spacing: 0.15px;
      }
      .agy-npc-user-msg {
        font-size: 11.8px;
        line-height: 1.38;
        color: #ffffff;
        word-break: break-word;
      }
      .agy-npc-dialog-text {
        font-size: 12.3px;
        line-height: 1.46;
        color: #f1f5f9;
        min-height: 54px;
        word-break: break-word;
      }
      .agy-npc-dialog-text[data-typing="1"]::after {
        content: "▍";
        color: var(--npc-secondary, #5eead4);
        margin-left: 2px;
        font-size: 11px;
      }
      .agy-npc-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .agy-npc-pill {
        padding: 3.5px 9px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid var(--npc-border, rgba(192, 132, 252, 0.36));
        color: #f8fafc;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
      }
      .agy-npc-pill:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: var(--npc-secondary, #5eead4);
        color: #ffffff;
        transform: translateY(-1px);
      }
      .agy-npc-chat-row {
        display: none;
        align-items: center;
        gap: 5px;
        padding-top: 4px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }
      .agy-npc-chat-input {
        flex: 1;
        min-width: 0;
        background: rgba(8, 7, 18, 0.86);
        border: 1px solid var(--npc-border, rgba(192, 132, 252, 0.38));
        border-radius: 8px;
        padding: 5px 9px;
        color: #f8fafc;
        font-size: 11.5px;
        outline: none;
      }
      .agy-npc-chat-input:focus {
        border-color: var(--npc-secondary, #5eead4);
        box-shadow: 0 0 0 1px var(--npc-glow, rgba(94, 234, 212, 0.28));
      }
      .agy-npc-chat-send {
        padding: 5px 10px;
        border-radius: 8px;
        background: var(--npc-primary, #a855f7);
        border: none;
        color: #09090b;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      @media (max-width: 700px) {
        .agy-npc-popover {
          right: 12px;
          bottom: 62px;
          width: 266px;
        }
        .agy-npc-popover::after {
          right: 34px;
          bottom: -6px;
          transform: rotate(45deg);
        }
      }
    `;
    document.head.appendChild(stEl);
  }

  function syncShinobuNpc(stOverride, bubbleThemeOverride) {
    if (coreDestroyed) return;
    const st = stOverride || getEffectiveState();
    const activeBubbleKey = st.bubbleName || st.themeName || DEFAULT_THEME_KEY;
    const bTheme = bubbleThemeOverride || THEMES[activeBubbleKey] || THEMES[DEFAULT_THEME_KEY] || {};
    const persona = getActiveMasterPersona(st);
    const personaValid = hasValidMasterPersona(st.masterPersona);
    const personaExplicitOverride = Boolean(st.masterPersona && st.masterPersona !== 'yoriichi');
    const domHealth = diagnoseDomContracts();
    const bubbleZoneSafe = !(domHealth.zones.userBubble && domHealth.zones.userBubble.safe === false);
    const chibiMasterOn = st.chibiEnabled !== false;
    const isMinimalZeroSticker = bTheme.isOrnament === false && !bTheme.sticker;
    const hasBubblePersonaSticker = Boolean(
      chibiMasterOn &&
      bubbleZoneSafe &&
      (!isMinimalZeroSticker || personaExplicitOverride) &&
      ((personaValid && persona.userSticker) || bTheme.userSticker || bTheme.sticker)
    );

    if (hasBubblePersonaSticker) {
      ensureShinobuNpcStyles();
      const rtBubble = getShinobuRuntime();
      document.querySelectorAll('.agy-user-bubble-frame').forEach(frame => {
        let hit = frame.querySelector(':scope > .agy-chibi-hitbox');
        if (!hit) {
          hit = document.createElement('button');
          hit.type = 'button';
          hit.className = 'agy-chibi-hitbox';
          // CRITICAL ANTIGRAVITY 2.0 DOM GUARD: Never leave :empty inside .agy-user-bubble-frame (prevents [&:has(>.agy-user-bubble-frame>:empty)]:hidden)
          hit.innerHTML = '<i aria-hidden="true"></i>';
          hit.addEventListener('click', (e) => {
            e.stopPropagation();
            const curSt = getEffectiveState();
            const curBubbleKey = curSt.bubbleName || curSt.themeName || DEFAULT_THEME_KEY;
            const curBTheme = THEMES[curBubbleKey] || THEMES[DEFAULT_THEME_KEY] || {};
            const curPersona = getActiveMasterPersona(curSt);
            const curPValid = hasValidMasterPersona(curSt.masterPersona);
            const skillCharId = (curPersona && curPersona.skillId) || 'yoriichi';
            const isMvNoSprite = Boolean(curPersona && curPersona.group === 'multiverse' && !curPersona.actionSticker);
            const actSticker = isMvNoSprite
              ? ''
              : (curPValid
                ? ((curPersona && curPersona.actionSticker) || curBTheme.userActionSticker || '')
                : (curBTheme.userActionSticker || (curPersona && curPersona.actionSticker) || ''));
            if (window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.castSkill === 'function') {
              const curRt = getShinobuRuntime();
              if (curRt.lastBubbleSkillCharId !== skillCharId) {
                curRt.yoriBubbleCombo = 0;
                curRt.lastBubbleSkillCharId = skillCharId;
              }
              const comboIdx = curRt.yoriBubbleCombo || 0;
              curRt.yoriBubbleCombo = (comboIdx + 1) % 4;
              window.__AGY_KNY_SKILLS__.castSkill(skillCharId, comboIdx, {
                charId: skillCharId,
                originRect: e.currentTarget.getBoundingClientRect(),
                sourceFrameEl: frame,
                composerEl: null,
                actionSticker: actSticker,
                noActionSprite: isMvNoSprite
              });
              return;
            }
            triggerChibiBounce(frame);
          });
          frame.appendChild(hit);
        }
        const personaTitle = `${persona.tagLabel || 'Khai Tổ Hỏa Thần (Anh)'} — Nhấn để xuất chiêu Hơi Thở!`;
        hit.title = personaTitle;
        hit.setAttribute('aria-label', personaTitle);
        if (hit.children.length === 0) hit.innerHTML = '<i aria-hidden="true"></i>';
      });
      if (rtBubble.lastBubbleSkillCharId && rtBubble.lastBubbleSkillCharId !== (persona.skillId || 'yoriichi')) {
        rtBubble.yoriBubbleCombo = 0;
        rtBubble.lastBubbleSkillCharId = persona.skillId || 'yoriichi';
      }
    } else {
      document.querySelectorAll('.agy-user-bubble-frame > .agy-chibi-hitbox').forEach(el => el.remove());
    }

    if (!chibiMasterOn || st.inputStyle === 'minimal' || !bTheme.isChibiNpc) {
      // Tear down only composer NPC & Chibi Aura while keeping User Bubble persona hitboxes intact if active
      const rtClean = window.__AGY_SHINOBU_RT__;
      if (rtClean) {
        if (rtClean.typeTimer) { clearInterval(rtClean.typeTimer); rtClean.typeTimer = 0; }
        if (rtClean.remindTimer) { clearInterval(rtClean.remindTimer); rtClean.remindTimer = 0; }
        rtClean.activeNpcKey = '';
      }
      if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.teardown === 'function') {
        try { window.__AGY_KNY_CHIBI_AURA__.teardown(); } catch (_) {}
      }
      const wrapOld = document.getElementById('agy-shinobu-npc-wrap');
      if (wrapOld) wrapOld.remove();
      document.querySelectorAll('.surface-composer > .agy-chibi-hitbox').forEach(el => el.remove());
      document.querySelectorAll('[data-agy-npc-key-bound]').forEach(el => delete el.dataset.agyNpcKeyBound);
      if (!hasBubblePersonaSticker) {
        const npcStyle = document.getElementById('antigravity-shinobu-npc-style');
        if (npcStyle) npcStyle.remove();
      }
      return;
    }

    ensureShinobuNpcStyles();
    const rt = getShinobuRuntime();
    const prof = getActiveNpcProfile(bTheme);

    const composers = Array.from(document.querySelectorAll('.surface-composer'));
    if (composers.length === 0) return;
    const composer = composers.find(
      (c) => document.activeElement && (c === document.activeElement || (typeof c.contains === 'function' && c.contains(document.activeElement)))
    ) || composers[0];

    composers.forEach((compItem) => {
      let mainHit = compItem.querySelector(':scope > .agy-chibi-hitbox');
      if (!mainHit) {
        mainHit = document.createElement('button');
        mainHit.type = 'button';
        mainHit.className = 'agy-chibi-hitbox';
        mainHit.innerHTML = '<i aria-hidden="true"></i>';
        mainHit.addEventListener('click', (e) => {
          e.stopPropagation();
          if (compItem && compItem.dataset && compItem.dataset.chibi3dDragging === '1') return;
          if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.castNextComboSkill === 'function') {
            window.__AGY_KNY_CHIBI_AURA__.castNextComboSkill({
              originEl: e.currentTarget,
              sourceFrameEl: compItem,
              fromChibiClick: true
            });
            return;
          }
          triggerChibiBounce(compItem);
          const curText = document.querySelector('#agy-shinobu-npc-wrap .agy-npc-dialog-text')?.textContent || '';
          speakShinobuLine(pickRandomLine('welcome', curText), true);
        });
        compItem.appendChild(mainHit);
      }
      mainHit.title = `⚡ Nhấn vào ${prof.badgeLabel || 'Chibi'} để nhảy ra thi triển Hơi Thở!`;
      mainHit.setAttribute('aria-label', mainHit.title);
    });

    if (!composer.dataset.agyNpcKeyBound) {
      composer.dataset.agyNpcKeyBound = '1';
      const npcKeyOpts = window.__AGY_SCROLL_AC__
        ? { capture: true, signal: window.__AGY_SCROLL_AC__.signal }
        : true;
      composer.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.target && e.target.closest && e.target.closest('#agy-shinobu-npc-wrap')) return;
        const now = Date.now();
        if (e.key === 'Enter' && !e.shiftKey) {
          setTimeout(() => {
            if (coreDestroyed) return;
            if (!rt.npcCollapsed) {
              speakShinobuLine(pickRandomLine('sent', ''), false);
            }
          }, 180);
          rt.lastKeyEncourageAt = now;
        } else if (e.key && e.key.length === 1 && now - rt.lastKeyEncourageAt > 55000) {
          rt.lastKeyEncourageAt = now;
          if (!rt.npcCollapsed) {
            speakShinobuLine(pickRandomLine('typing', ''), false);
          }
        }
      }, npcKeyOpts);
    }

    const compositeNpcKey = `${activeBubbleKey}::${st.masterPersona || 'yoriichi'}`;
    let wrap = document.getElementById('agy-shinobu-npc-wrap');
    if (wrap && (wrap.parentElement !== composer || rt.activeNpcKey !== compositeNpcKey)) {
      wrap.remove();
      wrap = null;
    }

    if (!wrap) {
      rt.activeNpcKey = compositeNpcKey;
      wrap = document.createElement('div');
      wrap.id = 'agy-shinobu-npc-wrap';
      wrap.className = 'agy-shinobu-npc-wrap';
      const isRoyal = bTheme.fxMode === 'royal_wisteria' || bTheme.fxMode === 'wisteria_royal';
      if (isRoyal) wrap.dataset.royal = '1';

      wrap.style.setProperty('--npc-primary', SEC.sanitizeCssValue(bTheme.primary, '#c084fc'));
      wrap.style.setProperty('--npc-secondary', SEC.sanitizeCssValue(bTheme.accent || bTheme.secondary, '#5eead4'));
      wrap.style.setProperty('--npc-border', SEC.sanitizeCssValue(bTheme.borderColor, 'rgba(192, 132, 252, 0.55)'));
      wrap.style.setProperty('--npc-glow', SEC.sanitizeCssValue(bTheme.glow, 'rgba(192, 132, 252, 0.28)'));
      wrap.style.setProperty('--npc-surface', SEC.sanitizeCssValue(bTheme.modalBg, 'rgba(18, 13, 34, 0.95)'));
      wrap.style.setProperty('--npc-title-ink', isRoyal ? '#fef08a' : '#f8fafc');

      const fxPausedInit = Boolean(rt.fxPaused);
      const pillsHtml = prof.pills.map((p) => {
        const safeKey = SEC.escapeHtml(String((p && p.key) || '').replace(/[^a-zA-Z0-9_-]/g, ''));
        const safeLbl = SEC.escapeHtml(String((p && p.label) || ''));
        return `<button type="button" class="agy-npc-pill" data-npc-cat="${safeKey}">${safeLbl}</button>`;
      }).join('');

      const safeTitle = SEC.escapeHtml(prof.title || '');
      const safeBadge = SEC.escapeHtml(prof.badgeLabel || '');
      const safePlaceholder = SEC.escapeHtml(prof.placeholder || '');
      const safePersonaTag = SEC.escapeHtml(persona.tagLabel || 'Khai Tổ Hỏa Thần (Anh)');
      const safeNpcUserAv = safeCssUrl(
        (personaValid ? (persona.userAvatar || bTheme.userAvatar) : (bTheme.userAvatar || persona.userAvatar)) || ''
      );
      const safeRingColorAttr = SEC.escapeHtml(SEC.sanitizeCssValue(persona.ringColor, '#fde047'));
      const soulMeta = getNpcSoulMeta(bTheme, st);
      const safeSoulStatus = SEC.escapeHtml(soulMeta.statusLine || '');
      const topicChipsHtml = soulMeta.chips.slice(0, 4).map((ch, idx) => {
        const safeChipLbl = SEC.escapeHtml(String((ch && ch.label) || ''));
        return `<button type="button" class="agy-npc-topic-chip" data-npc-topic-idx="${idx}">${safeChipLbl}</button>`;
      }).join('');
      const initMem = getNpcConvMemory(soulMeta.charId);
      const initTurnShow = initMem.turnCount > 0 ? ' data-show="1"' : '';
      const initTurnTxt = initMem.turnCount > 0 ? `Lượt ${initMem.turnCount}` : '';

      wrap.dataset.charId = soulMeta.charId;
      wrap.innerHTML = `
        <button type="button" class="agy-npc-badge" title="${safeTitle}">${safeBadge}</button>
        <div class="agy-npc-popover" role="region" aria-label="${safeTitle}">
          <div class="agy-npc-header">
            <div class="agy-npc-title-group">
              <span class="agy-npc-dot"></span>
              <span class="agy-npc-title">${safeTitle}</span>
            </div>
            <div class="agy-npc-tools">
              <button type="button" class="agy-npc-icon-btn" data-npc-act="motion" title="${fxPausedInit ? 'Phát hiệu ứng nền' : 'Tạm dừng hiệu ứng nền'}" aria-label="${fxPausedInit ? 'Phát hiệu ứng nền' : 'Tạm dừng hiệu ứng nền'}">${fxPausedInit ? '▶' : '⏸'}</button>
              <button type="button" class="agy-npc-icon-btn" data-npc-act="random" title="Đổi câu thoại ngẫu nhiên" aria-label="Đổi câu thoại ngẫu nhiên">🎲</button>
              <button type="button" class="agy-npc-icon-btn" data-npc-act="chat-toggle" title="Trò chuyện riêng" aria-label="Trò chuyện riêng">💬</button>
              <button type="button" class="agy-npc-icon-btn" data-npc-act="close" title="Thu gọn hộp thoại" aria-label="Thu gọn hộp thoại">✕</button>
            </div>
          </div>
          <div class="agy-npc-soul-bar">
            <span class="agy-npc-soul-text" title="${safeSoulStatus}">${safeSoulStatus}</span>
            <span class="agy-npc-turn-badge"${initTurnShow}>${SEC.escapeHtml(initTurnTxt)}</span>
          </div>
          <div class="agy-npc-user-sent">
            <span class="agy-npc-user-av" style="${safeNpcUserAv ? `background-image: url(&quot;${SEC.escapeHtml(safeNpcUserAv)}&quot;);` : ''} border-color: ${safeRingColorAttr};"></span>
            <div class="agy-npc-user-col">
              <span class="agy-npc-user-tag" style="color: ${safeRingColorAttr};">${safePersonaTag}</span>
              <span class="agy-npc-user-msg"></span>
            </div>
          </div>
          <div class="agy-npc-dialog-text"></div>
          <div class="agy-npc-pills">
            ${pillsHtml}
            <button type="button" class="agy-npc-pill" data-npc-act="chat-open">💬 Trò chuyện</button>
          </div>
          <div class="agy-npc-topic-chips">${topicChipsHtml}</div>
          <form class="agy-npc-chat-row">
            <input type="text" class="agy-npc-chat-input" placeholder="${safePlaceholder}" autocomplete="off" />
            <button type="submit" class="agy-npc-chat-send">Gửi</button>
          </form>
        </div>
      `;
      composer.appendChild(wrap);

      const badge = wrap.querySelector('.agy-npc-badge');
      const popover = wrap.querySelector('.agy-npc-popover');
      const topicChipsWrap = wrap.querySelector('.agy-npc-topic-chips');
      const turnBadgeEl = wrap.querySelector('.agy-npc-turn-badge');
      const chatRow = wrap.querySelector('.agy-npc-chat-row');
      const chatInput = wrap.querySelector('.agy-npc-chat-input');
      const motionBtn = wrap.querySelector('[data-npc-act="motion"]');

      function syncChatVisibility(focusInput) {
        if (topicChipsWrap) {
          topicChipsWrap.style.display = (rt.npcChatOpen && soulMeta.chips.length > 0) ? 'flex' : 'none';
        }
        chatRow.style.display = rt.npcChatOpen ? 'flex' : 'none';
        if (rt.npcChatOpen && focusInput && chatInput) {
          setTimeout(() => chatInput.focus(), 20);
        }
      }

      function dispatchUserNpcMessage(rawMsg) {
        const msg = String(rawMsg || '').trim();
        if (!msg) return;
        const sentBox = wrap.querySelector('.agy-npc-user-sent');
        const sentMsg = wrap.querySelector('.agy-npc-user-msg');
        if (sentBox && sentMsg) {
          sentMsg.textContent = msg;
          sentBox.dataset.show = '1';
        }
        const curStNow = getEffectiveState();
        const res = buildNpcReplyDetailed(msg, prof, curStNow);
        if (turnBadgeEl) {
          turnBadgeEl.textContent = `Lượt ${res.turnCount}`;
          turnBadgeEl.dataset.show = '1';
        }
        triggerChibiBounce(composer, res.reaction);
        speakShinobuLine(res.reply, true);
      }

      wrap.querySelectorAll('[data-npc-topic-idx]').forEach((chipBtn) => {
        chipBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(chipBtn.getAttribute('data-npc-topic-idx'), 10);
          const chipObj = soulMeta.chips[idx];
          if (chipObj && chipObj.prompt) {
            dispatchUserNpcMessage(chipObj.prompt);
          }
        });
      });

      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        rt.npcCollapsed = false;
        triggerChibiBounce(composer);
        speakShinobuLine(pickRandomLine('welcome', '', prof), true);
      });

      wrap.querySelectorAll('[data-npc-cat]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cat = btn.getAttribute('data-npc-cat');
          triggerChibiBounce(composer);
          const cur = wrap.querySelector('.agy-npc-dialog-text')?.textContent || '';
          speakShinobuLine(pickRandomLine(cat, cur, prof), true);
        });
      });

      wrap.querySelector('[data-npc-act="random"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const cats = ['welcome', ...prof.pills.map(p => p.key)];
        const chosen = cats[Math.floor(Math.random() * cats.length)];
        const cur = wrap.querySelector('.agy-npc-dialog-text')?.textContent || '';
        triggerChibiBounce(composer);
        speakShinobuLine(pickRandomLine(chosen, cur, prof), true);
      });

      if (motionBtn) {
        motionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const paused = typeof rt.toggleFxPause === 'function' ? rt.toggleFxPause() : false;
          motionBtn.textContent = paused ? '▶' : '⏸';
          const lbl = paused ? 'Phát hiệu ứng nền' : 'Tạm dừng hiệu ứng nền';
          motionBtn.title = lbl;
          motionBtn.setAttribute('aria-label', lbl);
        });
      }

      const toggleChat = (e) => {
        e.stopPropagation();
        rt.npcChatOpen = !rt.npcChatOpen;
        syncChatVisibility(true);
      };
      wrap.querySelector('[data-npc-act="chat-toggle"]').addEventListener('click', toggleChat);
      wrap.querySelector('[data-npc-act="chat-open"]').addEventListener('click', (e) => {
        e.stopPropagation();
        rt.npcChatOpen = true;
        syncChatVisibility(true);
      });

      wrap.querySelector('[data-npc-act="close"]').addEventListener('click', (e) => {
        e.stopPropagation();
        rt.npcCollapsed = true;
        popover.style.display = 'none';
        badge.style.display = 'inline-flex';
      });

      ['keydown', 'keyup', 'keypress'].forEach(evtName => {
        chatInput.addEventListener(evtName, (e) => {
          e.stopPropagation();
          if (evtName === 'keydown') {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Escape') {
              rt.npcChatOpen = false;
              syncChatVisibility(false);
            }
          }
        });
      });

      chatRow.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const msg = (chatInput.value || '').trim();
        if (!msg) return;
        chatInput.value = '';
        dispatchUserNpcMessage(msg);
      });

      popover.style.display = rt.npcCollapsed ? 'none' : 'flex';
      badge.style.display = rt.npcCollapsed ? 'inline-flex' : 'none';
      syncChatVisibility(false);

      const activeSoul = CHAR_SOUL_DB[soulMeta.charId] || null;
      const pairInit = activeSoul && activeSoul.chemistry && activeSoul.chemistry[soulMeta.masterId];
      let initWelcomeLine = '';
      if (soulMeta.masterId === 'ubuyashiki' && soulMeta.charId !== 'ubuyashiki' && activeSoul && activeSoul.stances && activeSoul.stances.lordGreeting) {
        initWelcomeLine = activeSoul.stances.lordGreeting;
      } else if (pairInit && pairInit.greet) {
        initWelcomeLine = pairInit.greet;
      } else {
        const welcomeList = Array.isArray(prof.dialogs.welcome) ? prof.dialogs.welcome : [String(prof.dialogs.welcome || '')];
        initWelcomeLine = welcomeList[0] || '';
      }
      speakShinobuLine(initWelcomeLine, false);
    }

    if (window.__AGY_KNY_CHIBI_AURA__) {
      const charHint = bTheme.fxMode || activeBubbleKey;
      const auraThemeCfg = {
        ...bTheme,
        chibi3dEnabled: st.chibi3dEnabled !== false,
        chibi2dLive: st.chibi2dLive !== false,
        ecoBattery: st.ecoBattery !== false,
        masterPersonaId: persona ? persona.id : 'yoriichi',
        personaRingColor: SEC.sanitizeCssValue(persona.ringColor, '#fde047'),
        personaGlowColor: SEC.sanitizeCssValue(persona.glowColor, 'rgba(239, 68, 68, 0.52)'),
        personaSkillId: (persona && persona.skillId) || 'yoriichi',
        isMultiversePersona: Boolean(persona && persona.group === 'multiverse')
      };
      try {
        window.__AGY_KNY_CHIBI_AURA__.mountChibiAura(composer, auraThemeCfg, charHint);
        window.__AGY_KNY_CHIBI_AURA__.mountSkillTriggerUi(composer, wrap, auraThemeCfg, charHint, (skill, _idx, castOpts) => {
          const line = (skill && (skill.voiceLine || skill.quote)) || pickRandomLine('act1', '', prof);
          if (line) {
            // Keep stage uncluttered when clicking Chibi directly unless NPC dialog is already open
            const isDirectClick = Boolean(castOpts && castOpts.fromChibiClick);
            if (!isDirectClick || !rt.npcCollapsed) {
              speakShinobuLine(line, false);
            }
          }
        });
      } catch (_) {}
    }

    // Periodic 3-minute NPC auto-typing timer removed by default in v3.0 to preserve uninterrupted deep coding focus.
    if (rt.remindTimer) {
      clearInterval(rt.remindTimer);
      rt.remindTimer = 0;
    }
  }

  function syncTokenHud(stOverride) {
    if (coreDestroyed) return;
    const st = stOverride || getEffectiveState();
    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    const activeKey = st.bubbleName || st.themeName || DEFAULT_THEME_KEY;
    const bTheme = THEMES[activeKey] || mainTheme;
    const persona = getActiveMasterPersona(st);
    const personaValid = hasValidMasterPersona(st.masterPersona);
    const personaOverrideActive = Boolean(st.masterPersona && st.masterPersona !== 'yoriichi');
    const isMvPersona = Boolean(persona && persona.group === 'multiverse');
    const isMvNoSprite = Boolean(isMvPersona && !persona.actionSticker);

    const rawEffUserAvatar = st.userAvatar === 'none'
      ? ''
      : (st.userAvatar || (personaValid ? (persona.userAvatar || mainTheme.userAvatar) : (mainTheme.userAvatar || persona.userAvatar)) || '');
    const effectiveUserAvatar = safeCssUrl(rawEffUserAvatar);
    const userActionSticker = isMvNoSprite
      ? ''
      : safeCssUrl(
        (personaValid ? (persona.actionSticker || bTheme.userActionSticker) : (bTheme.userActionSticker || persona.actionSticker)) || ''
      );
    const personaSkillId = persona.skillId || 'yoriichi';
    const personaLabel = persona.tagLabel || 'Khai Tổ Hỏa Thần (Anh)';
    const personaRingColor = SEC.sanitizeCssValue(persona.ringColor, '#fde047');
    const personaGlowColor = SEC.sanitizeCssValue(persona.glowColor, 'rgba(239, 68, 68, 0.52)');

    const resolveActiveComposer = () => {
      const all = Array.from(document.querySelectorAll('.surface-composer, [data-testid="composer"]'));
      if (all.length === 0) return null;
      if (all.length === 1) return all[0];
      const ae = document.activeElement;
      if (ae) {
        const focused = all.find((c) => c === ae || (typeof c.contains === 'function' && c.contains(ae)));
        if (focused) return focused;
      }
      const locStr = `${window.location?.pathname || ''}${window.location?.hash || ''}${window.location?.search || ''}`;
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
      return all[0];
    };
    const composer = resolveActiveComposer();
    if (composer && window.__AGY_TOKEN_HUD__ && typeof window.__AGY_TOKEN_HUD__.mountTokenHud === 'function') {
      try {
        const hudThemeCfg = {
          ...bTheme,
          effectiveUserAvatar,
          userAvatar: effectiveUserAvatar || persona.userAvatar || bTheme.userAvatar,
          userActionSticker,
          masterPersonaId: persona ? persona.id : 'yoriichi',
          personaSkillId,
          personaLabel,
          personaRingColor,
          personaGlowColor,
          isMultiversePersona: isMvPersona,
          noActionSprite: isMvNoSprite
        };
        window.__AGY_TOKEN_HUD__.mountTokenHud(composer, hudThemeCfg, activeKey);
      } catch (_) {}
    }

    // Make user's Master Persona avatar beside chat bubbles clickable to unleash active Persona's Breathing Form!
    if (st.userAvatar === 'none' || !effectiveUserAvatar) {
      document.querySelectorAll('.agy-yoriichi-msg-hit').forEach((el) => el.remove());
      return;
    }

    const rt = getShinobuRuntime();
    if (rt.lastMsgSkillCharId && rt.lastMsgSkillCharId !== personaSkillId) {
      rt.yoriMsgCombo = 0;
      rt.lastMsgSkillCharId = personaSkillId;
    }

    const avSize = Math.min(52, Math.max(22, Number(st.avatarSize) || 32));
    const avRadius = Math.min(50, Math.max(0, Number.isFinite(Number(st.avatarRadius)) ? Number(st.avatarRadius) : 50));

    const isDefaultYoriichi = personaSkillId === 'yoriichi' && (!personaOverrideActive || /Yoriichi|Hỏa Thần/i.test(personaLabel));
    const hitTitle = isDefaultYoriichi
      ? 'Khai Tổ Vũ Điệu Hỏa Thần — Nhấn để khai mở Nhật Chi Hô Hấp!'
      : `${personaLabel} — Nhấn để khai mở tuyệt kỹ Hơi Thở!`;

    document.querySelectorAll('[data-testid="user-message"]').forEach((um) => {
      let btn = um.querySelector(':scope > .agy-yoriichi-msg-hit');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'agy-yoriichi-msg-hit';
        btn.innerHTML = '<i aria-hidden="true"></i>';
        btn.style.cssText = `position:absolute;right:0;bottom:6px;width:${avSize}px;height:${avSize}px;border-radius:${avRadius}%;background:transparent;border:none;cursor:pointer;z-index:5;padding:0;`;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (window.__AGY_TOKEN_HUD__ && typeof window.__AGY_TOKEN_HUD__.castYoriichiSunBreathing === 'function') {
            window.__AGY_TOKEN_HUD__.castYoriichiSunBreathing(btn);
            return;
          }
          const curSt = getEffectiveState();
          const curBubbleKey = curSt.bubbleName || curSt.themeName || DEFAULT_THEME_KEY;
          const curBTheme = THEMES[curBubbleKey] || THEMES[DEFAULT_THEME_KEY] || {};
          const curP = getActiveMasterPersona(curSt);
          const curPValid = hasValidMasterPersona(curSt.masterPersona);
          const sId = (curP && curP.skillId) || 'yoriichi';
          const curMvNoSprite = Boolean(curP && curP.group === 'multiverse' && !curP.actionSticker);
          const actSticker = curMvNoSprite
            ? ''
            : (curPValid
              ? ((curP && curP.actionSticker) || curBTheme.userActionSticker || '')
              : (curBTheme.userActionSticker || (curP && curP.actionSticker) || ''));
          if (window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.castSkill === 'function') {
            const curRt = getShinobuRuntime();
            if (curRt.lastMsgSkillCharId !== sId) {
              curRt.yoriMsgCombo = 0;
              curRt.lastMsgSkillCharId = sId;
            }
            const comboIdx = curRt.yoriMsgCombo || 0;
            curRt.yoriMsgCombo = (comboIdx + 1) % 4;
            window.__AGY_KNY_SKILLS__.castSkill(sId, comboIdx, {
              charId: sId,
              originRect: btn.getBoundingClientRect(),
              actionSticker: actSticker,
              noActionSprite: curMvNoSprite,
              composerEl: null
            });
          }
        });
        um.appendChild(btn);
      } else {
        btn.style.width = `${avSize}px`;
        btn.style.height = `${avSize}px`;
        btn.style.borderRadius = `${avRadius}%`;
      }
      btn.title = hitTitle;
      btn.setAttribute('aria-label', hitTitle);
    });
  }

  const RESERVED_NON_WS_SLUGS = new Set([
    'antigravity', 'launchpad', 'new-conversation', 'settings',
    'customizations', 'automations', 'theme-studio', 'welcome', 'open-ide'
  ]);
  let lastObservedDocTitle = '';

  function extractWorkspaceFromDocTitle(rawTitle) {
    if (typeof rawTitle !== 'string') return '';
    const trimmed = rawTitle.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    let base = '';
    if (lower.endsWith(' - antigravity')) {
      base = trimmed.slice(0, trimmed.length - ' - antigravity'.length);
    } else if (lower.endsWith(' — antigravity')) {
      base = trimmed.slice(0, trimmed.length - ' — antigravity'.length);
    } else {
      return '';
    }
    const sepIdx = base.lastIndexOf(' - ');
    const candidate = (sepIdx !== -1 ? base.slice(sepIdx + 3) : base).trim();
    if (!candidate) return '';
    const key = normalizeWorkspaceKey(candidate);
    if (!key || RESERVED_NON_WS_SLUGS.has(key)) return '';
    return key;
  }

  function syncActiveWorkspaceFromDom() {
    if (typeof document === 'undefined' || typeof document.title !== 'string') return;
    if (document.title === lastObservedDocTitle) return;
    lastObservedDocTitle = document.title;
    const liveWs = extractWorkspaceFromDocTitle(document.title);
    if (!liveWs) return;
    const curState = getState();
    if (curState.activeWorkspace === liveWs) return;
    try {
      localStorage.setItem(STORAGE_ACTIVE_WS, liveWs);
    } catch (_) {}
    const profMap = curState.workspaceProfiles;
    if (profMap && typeof profMap === 'object' && Object.prototype.hasOwnProperty.call(profMap, liveWs)) {
      const prof = profMap[liveWs];
      if (prof && typeof prof === 'object') {
        applyTheme({
          activeWorkspace: liveWs,
          themeName: prof.themeName,
          bubbleName: prof.bubbleName || prof.themeName,
          masterPersona: prof.masterPersona || 'yoriichi',
          aiPersonaMode: prof.aiPersonaMode || curState.aiPersonaMode,
          dimming: prof.dimming,
          fxDensity: prof.fxDensity,
          chibiEnabled: prof.chibiEnabled !== false,
          chibi3dEnabled: typeof prof.chibi3dEnabled === 'boolean' ? prof.chibi3dEnabled : curState.chibi3dEnabled,
          chibi2dLive: typeof prof.chibi2dLive === 'boolean' ? prof.chibi2dLive : curState.chibi2dLive,
          autoFinisher: prof.autoFinisher !== false,
          focusMode: Boolean(prof.focusMode)
        });
        return;
      }
    }
    if (SEC && typeof SEC.saveConfigSecure === 'function') {
      SEC.saveConfigSecure({ ...getState(), activeWorkspace: liveWs });
    }
  }

  function tick() {
    if (coreDestroyed) return;
    syncActiveWorkspaceFromDom();
    injectMainSidebarButton();
    injectSettingsModalButton();
    hookSidebarScroll();
    hookShellMetrics();
    syncLiveWallpaperFx();
    syncShinobuNpc();
    syncTokenHud();
  }

  function scheduleTick() {
    if (coreDestroyed || window.__AGY_TICK_RAF__) return;
    window.__AGY_TICK_RAF__ = requestAnimationFrame(() => {
      window.__AGY_TICK_RAF__ = 0;
      if (!coreDestroyed) tick();
    });
  }

  clearTitleBarTimers();
  if (window.__AGY_TICK_RAF__) {
    cancelAnimationFrame(window.__AGY_TICK_RAF__);
    window.__AGY_TICK_RAF__ = 0;
  }
  if (window.__AGY_SHELL_RO__) {
    try { window.__AGY_SHELL_RO__.disconnect(); } catch (e) {}
    window.__AGY_SHELL_RO__ = null;
  }
  if (window.__AGY_SCROLL_AC__) {
    try { window.__AGY_SCROLL_AC__.abort(); } catch (e) {}
  }
  document.querySelectorAll('[data-agy-scroll-bound]').forEach(el => delete el.dataset.agyScrollBound);
  document.querySelectorAll('[data-agy-tbo-mounted]').forEach(el => delete el.dataset.agyTboMounted);
  document.querySelectorAll('[data-agy-npc-key-bound]').forEach(el => delete el.dataset.agyNpcKeyBound);
  const staleBackdrop = document.getElementById('agy-custom-theme-modal-backdrop');
  if (staleBackdrop) staleBackdrop.remove();
  const staleSidebarBtn = document.getElementById('agy-custom-theme-sidebar-btn');
  if (staleSidebarBtn) staleSidebarBtn.remove();
  const staleSettingsBtn = document.getElementById('agy-custom-theme-settings-btn');
  if (staleSettingsBtn) staleSettingsBtn.remove();
  try { teardownLiveWallpaperFx(); } catch (e) {}
  try { teardownShinobuNpc(); } catch (e) {}
  try { document.querySelectorAll('.agy-yoriichi-msg-hit').forEach(el => el.remove()); } catch (e) {}
  try { if (window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.stopActiveSkill === 'function') window.__AGY_KNY_SKILLS__.stopActiveSkill(); } catch (e) {}

  window.__AGY_SCROLL_AC__ = new AbortController();
  bindTransparentWorldListeners(window.__AGY_SCROLL_AC__.signal);
  if (!IS_MAC) {
    window.addEventListener('load', () => scheduleTitleBarSync(), { signal: window.__AGY_SCROLL_AC__.signal });
    window.addEventListener('focus', () => syncTitleBarOverlay(), { signal: window.__AGY_SCROLL_AC__.signal });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncTitleBarOverlay();
    }, { signal: window.__AGY_SCROLL_AC__.signal });
  }

  const INTERNAL_ENGINE_MUTATION_SELECTOR =
    '#agy-token-context-bar, #agy-yoriichi-msg-echo, #agy-shinobu-npc-wrap, agy-chibi-aura, agy-hashira-squad, agy-skill-vfx, agy-live-fx, #agy-live-fx-host, #agy-cinema-director-panel, #agy-cinema-privacy-badge, #agy-cinema-stage-banner, #agy-cinema-metsu-seal, #agy-cinema-red-blade-crest, #agy-kny-bio-audio-popover, #agy-kny-circadian-toast, agy-circadian-veil, #agy-kny-dawn-glow-layer, #agy-metsu-victory-overlay, .agy-kasugai-crow-flyby, #agy-custom-theme-modal-backdrop';

  function isInternalEngineMutation(m) {
    const t = m && m.target;
    if (!t) return false;
    const el = t.nodeType === 1 ? t : t.parentElement;
    if (!el || typeof el.closest !== 'function') return false;
    if (el.closest(INTERNAL_ENGINE_MUTATION_SELECTOR)) return true;
    if (m.type === 'childList') {
      const nodes = [];
      if (m.addedNodes && m.addedNodes.length) {
        for (let i = 0; i < m.addedNodes.length; i++) nodes.push(m.addedNodes[i]);
      }
      if (m.removedNodes && m.removedNodes.length) {
        for (let i = 0; i < m.removedNodes.length; i++) nodes.push(m.removedNodes[i]);
      }
      if (nodes.length > 0 && nodes.every((n) => {
        const ne = n.nodeType === 1 ? n : n.parentElement;
        return Boolean(ne && typeof ne.matches === 'function' && (ne.matches(INTERNAL_ENGINE_MUTATION_SELECTOR) || ne.closest(INTERNAL_ENGINE_MUTATION_SELECTOR)));
      })) {
        return true;
      }
    }
    return false;
  }

  window.__AGY_HOLE_EL__ = null;
  window.__AGY_SIDE_EL__ = null;
  if (window.__AGY_MODAL_OBSERVER__) {
    window.__AGY_MODAL_OBSERVER__.disconnect();
  }
  applyTheme({}, { skipSaveDisk: true });
  try {
    const bootInit = SEC.getInitialConfig() || {};
    const domHasShield = Boolean(
      typeof document !== 'undefined' &&
      document.documentElement &&
      document.documentElement.dataset.agyPrivacyShield === '1'
    );
    if (bootInit.privacyShieldActive === true && !domHasShield) {
      SEC.saveConfigSecure({ ...getState(), privacyShieldActive: false });
    }
  } catch (_) {}
  window.__AGY_MODAL_OBSERVER__ = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      if (!isInternalEngineMutation(mutations[i])) {
        scheduleTick();
        return;
      }
    }
  });
  window.__AGY_MODAL_OBSERVER__.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-has-browser-hole', 'data-browser-hole']
  });
  tick();

  return 'Antigravity Custom Theme Engine Ready!';
})();
