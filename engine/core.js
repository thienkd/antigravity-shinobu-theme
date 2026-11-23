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
  const STORAGE_FX_DENSITY = 'agy_fx_density_v1';
  const STORAGE_AUTO_FINISHER = 'agy_auto_finisher_v1';
  const STORAGE_BUBBLE_RADIUS = 'agy_bubble_radius_v1';
  const STORAGE_ECO_BATTERY = 'agy_eco_battery_v1';
  const STORAGE_UI_LANG = 'agy_ui_lang_v1';
  const STORAGE_WS_PROFILES = 'agy_workspace_profiles_v1';
  const STORAGE_ACTIVE_WS = 'agy_active_workspace_v1';
  const MAX_WORKSPACE_PROFILES = 24;

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
        dimming: clampInt(item.dimming, 15, 92, THEMES[thName]?.defaultDimming ?? 69),
        fxDensity: clampInt(item.fxDensity, 0, 100, 100),
        chibiEnabled: item.chibiEnabled !== false
      };
    }
    return out;
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

  function getState() {
    const init = SEC.getInitialConfig() || {};
    const storedTheme = localStorage.getItem(STORAGE_THEME);
    const rawTheme = (storedTheme !== null && storedTheme !== '') ? storedTheme : (init.themeName || DEFAULT_THEME_KEY);
    const themeName = THEMES[rawTheme] ? rawTheme : DEFAULT_THEME_KEY;

    const storedBubble = localStorage.getItem(STORAGE_BUBBLE);
    const rawBubble = (storedBubble !== null && storedBubble !== '') ? storedBubble : (init.bubbleName || themeName);
    const bubbleName = THEMES[rawBubble] ? rawBubble : themeName;

    const storedInput = localStorage.getItem(STORAGE_INPUT);
    const rawInput = (storedInput !== null && storedInput !== '') ? storedInput : (init.inputStyle || 'sync');
    const inputStyle = INPUT_STYLES[rawInput] ? rawInput : 'sync';

    const activeThemeCfg = THEMES[themeName] || {};
    const presetDefaultDim = activeThemeCfg.defaultDimming !== undefined ? activeThemeCfg.defaultDimming : 69;
    const storedDim = localStorage.getItem(STORAGE_DIMMING);
    const rawDim = (storedDim !== null && storedDim !== '') ? storedDim : (init.dimming ?? presetDefaultDim);
    const dimming = clampInt(rawDim, 15, 92, 69);

    const storedWpEnabled = localStorage.getItem(STORAGE_WP_ENABLED);
    const wpEnabled = storedWpEnabled !== null
      ? storedWpEnabled !== 'false'
      : (init.wpEnabled !== undefined ? Boolean(init.wpEnabled) : true);

    const storedCustomWp = localStorage.getItem(STORAGE_CUSTOM_WP);
    const rawCustomWp = storedCustomWp !== null ? storedCustomWp : (init.customWp ?? '');
    const customWp = rawCustomWp ? resolveAssetUrl(rawCustomWp) : '';

    const storedUserAv = localStorage.getItem(STORAGE_USER_AVATAR);
    const rawUserAv = storedUserAv !== null ? storedUserAv : (init.userAvatar ?? '');
    const userAvatar = rawUserAv === 'none' ? 'none' : (rawUserAv ? resolveAssetUrl(rawUserAv) : '');

    const storedAgentAv = localStorage.getItem(STORAGE_AGENT_AVATAR);
    const rawAgentAv = storedAgentAv !== null ? storedAgentAv : (init.agentAvatar ?? '');
    const agentAvatar = rawAgentAv === 'none' ? 'none' : (rawAgentAv ? resolveAssetUrl(rawAgentAv) : '');

    const storedBlur = localStorage.getItem(STORAGE_GLASS_BLUR);
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

    const storedAvSize = localStorage.getItem(STORAGE_AVATAR_SIZE);
    const rawAvSize = (storedAvSize !== null && storedAvSize !== '') ? storedAvSize : init.avatarSize;
    const avatarSize = rawAvSize !== undefined && rawAvSize !== null && rawAvSize !== '' ? clampInt(rawAvSize, 22, 52, 32) : 32;

    const storedAvRad = localStorage.getItem(STORAGE_AVATAR_RADIUS);
    const rawAvRad = (storedAvRad !== null && storedAvRad !== '') ? storedAvRad : init.avatarRadius;
    const avatarRadius = rawAvRad !== undefined && rawAvRad !== null && rawAvRad !== '' ? clampInt(rawAvRad, 0, 50, 50) : 50;

    const storedTw = localStorage.getItem(STORAGE_TRANSPARENT_WORLD);
    const transparentWorld = storedTw !== null
      ? storedTw !== 'false'
      : (init.transparentWorld !== undefined ? Boolean(init.transparentWorld) : true);

    const storedPersona = localStorage.getItem(STORAGE_MASTER_PERSONA);
    const rawPersona = (storedPersona !== null && storedPersona !== '') ? storedPersona : (init.masterPersona || 'yoriichi');
    const masterPersona = normalizeSafeMasterPersona(rawPersona);

    const storedChibi = localStorage.getItem(STORAGE_CHIBI_ENABLED);
    const chibiEnabled = storedChibi !== null
      ? storedChibi !== 'false'
      : (init.chibiEnabled !== undefined ? Boolean(init.chibiEnabled) : true);

    const storedFxDen = localStorage.getItem(STORAGE_FX_DENSITY);
    const rawFxDen = (storedFxDen !== null && storedFxDen !== '') ? storedFxDen : init.fxDensity;
    const fxDensity = rawFxDen !== undefined && rawFxDen !== null && rawFxDen !== '' ? clampInt(rawFxDen, 0, 100, 100) : 100;

    const storedAutoFin = localStorage.getItem(STORAGE_AUTO_FINISHER);
    const autoFinisher = storedAutoFin !== null
      ? storedAutoFin !== 'false'
      : (init.autoFinisher !== undefined ? Boolean(init.autoFinisher) : true);

    const storedBubRad = localStorage.getItem(STORAGE_BUBBLE_RADIUS);
    const rawBubRad = (storedBubRad !== null && storedBubRad !== '') ? storedBubRad : init.bubbleRadius;
    const bubbleRadius = rawBubRad !== undefined && rawBubRad !== null && rawBubRad !== '' ? clampInt(rawBubRad, 6, 22, 14) : 14;

    const storedEcoBatt = localStorage.getItem(STORAGE_ECO_BATTERY);
    const ecoBattery = storedEcoBatt !== null
      ? storedEcoBatt !== 'false'
      : (init.ecoBattery !== undefined ? Boolean(init.ecoBattery) : true);

    const storedUiLang = localStorage.getItem(STORAGE_UI_LANG);
    const uiLang = normalizeUiLang((storedUiLang !== null && storedUiLang !== '') ? storedUiLang : (init.uiLang || 'vi'));

    const storedActiveWs = localStorage.getItem(STORAGE_ACTIVE_WS);
    const activeWorkspace = normalizeWorkspaceKey((storedActiveWs !== null && storedActiveWs !== '') ? storedActiveWs : (init.activeWorkspace || ''));

    let workspaceProfiles = {};
    try {
      const rawWsJson = localStorage.getItem(STORAGE_WS_PROFILES);
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
      chibiEnabled,
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
    st.autoFinisher = st.autoFinisher !== false;
    st.ecoBattery = st.ecoBattery !== false;
    st.masterPersona = normalizeSafeMasterPersona(st.masterPersona);
    st.uiLang = normalizeUiLang(st.uiLang);
    st.activeWorkspace = normalizeWorkspaceKey(st.activeWorkspace);
    st.workspaceProfiles = sanitizeWorkspaceProfilesMap(st.workspaceProfiles);

    window.__AGY_FX_DENSITY__ = st.fxDensity / 100;
    window.__AGY_AUTO_FINISHER__ = st.autoFinisher;

    if (isTransient) {
      transientOverrideState = { ...st };
    } else {
      transientOverrideState = null;
      try {
        localStorage.setItem(STORAGE_THEME, st.themeName);
        localStorage.setItem(STORAGE_BUBBLE, st.bubbleName);
        localStorage.setItem(STORAGE_INPUT, st.inputStyle);
        localStorage.setItem(STORAGE_DIMMING, String(st.dimming));
        localStorage.setItem(STORAGE_WP_ENABLED, String(st.wpEnabled));
        localStorage.setItem(STORAGE_TRANSPARENT_WORLD, String(st.transparentWorld));
        localStorage.setItem(STORAGE_CHIBI_ENABLED, String(st.chibiEnabled));
        localStorage.setItem(STORAGE_FX_DENSITY, String(st.fxDensity));
        localStorage.setItem(STORAGE_AUTO_FINISHER, String(st.autoFinisher));
        localStorage.setItem(STORAGE_BUBBLE_RADIUS, String(st.bubbleRadius));
        localStorage.setItem(STORAGE_ECO_BATTERY, String(st.ecoBattery));
        localStorage.setItem(STORAGE_MASTER_PERSONA, st.masterPersona);
        localStorage.setItem(STORAGE_UI_LANG, st.uiLang);
        if (typeof window !== 'undefined' && window.__AGY_I18N__ && typeof window.__AGY_I18N__.setLang === 'function') {
          window.__AGY_I18N__.setLang(st.uiLang);
        }
        if (overrides.activeWorkspace !== undefined) {
          localStorage.setItem(STORAGE_ACTIVE_WS, st.activeWorkspace);
        }
        if (overrides.workspaceProfiles !== undefined) {
          localStorage.setItem(STORAGE_WS_PROFILES, JSON.stringify(st.workspaceProfiles));
        }
        if (overrides.userAvatar !== undefined) {
          localStorage.setItem(STORAGE_USER_AVATAR, overrides.userAvatar === 'none' ? 'none' : safeCssUrl(overrides.userAvatar));
        }
        if (overrides.agentAvatar !== undefined) {
          localStorage.setItem(STORAGE_AGENT_AVATAR, overrides.agentAvatar === 'none' ? 'none' : safeCssUrl(overrides.agentAvatar));
        }
        if (overrides.glassBlur !== undefined) {
          localStorage.setItem(STORAGE_GLASS_BLUR, String(st.glassBlur));
        }
        if (overrides.avatarSize !== undefined) {
          localStorage.setItem(STORAGE_AVATAR_SIZE, String(st.avatarSize));
        }
        if (overrides.avatarRadius !== undefined) {
          localStorage.setItem(STORAGE_AVATAR_RADIUS, String(st.avatarRadius));
        }
      } catch (e) {}

      if (overrides.customWp !== undefined) {
        const cleanWp = overrides.customWp ? safeCssUrl(overrides.customWp) : '';
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
      .surface-composer > :first-child:not(.surface-composer-card):not(.agy-shinobu-npc-wrap):not(.agy-chibi-hitbox):not(#agy-token-context-bar):not(#agy-yoriichi-msg-echo):not(agy-chibi-aura):not(agy-hashira-squad) {
        background: ${bubbleComposerHeaderBg} !important;
        border-radius: 14.5px 14.5px 0 0 !important;
        padding: 4px 8px !important;
      }
      .surface-composer:has(> :first-child:not(.surface-composer-card):not(.agy-shinobu-npc-wrap):not(.agy-chibi-hitbox):not(#agy-token-context-bar):not(#agy-yoriichi-msg-echo):not(agy-chibi-aura):not(agy-hashira-squad)) .surface-composer-card {
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
        dimming: clampInt(src.dimming, 15, 92, cur.dimming),
        fxDensity: clampInt(src.fxDensity, 0, 100, cur.fxDensity),
        chibiEnabled: src.chibiEnabled !== false
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
        dimming: prof.dimming,
        fxDensity: prof.fxDensity,
        chibiEnabled: prof.chibiEnabled
      });
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
            </div>
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
              <button id="agy-focus-preset-btn" type="button" class="agy-studio-btn" style="background: rgba(56, 189, 248, 0.14); border-color: rgba(56, 189, 248, 0.40); color: #e0f2fe; font-weight: 600;">
                ${esc(tr('focB', '⚡ Bật chế độ Tập trung sâu'))}
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
      const curAv = localStorage.getItem(STORAGE_USER_AVATAR);
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
        applyTheme({
          chibiEnabled: false,
          fxDensity: 20,
          autoFinisher: false,
          transparentWorld: true
        });
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
            exportBtn.textContent = 'Đã chép ✓';
            setTimeout(() => { exportBtn.textContent = 'Xuất JSON'; }, 1500);
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
      localStorage.removeItem(STORAGE_CUSTOM_WP);
      localStorage.removeItem(STORAGE_USER_AVATAR);
      localStorage.removeItem(STORAGE_AGENT_AVATAR);
      localStorage.removeItem(STORAGE_USER_AVATAR_SAVED);
      localStorage.removeItem(STORAGE_AGENT_AVATAR_SAVED);
      localStorage.removeItem(STORAGE_GLASS_BLUR);
      localStorage.removeItem(STORAGE_AVATAR_SIZE);
      localStorage.removeItem(STORAGE_AVATAR_RADIUS);
      localStorage.removeItem(STORAGE_THEME);
      localStorage.removeItem(STORAGE_BUBBLE);
      localStorage.removeItem(STORAGE_INPUT);
      localStorage.removeItem(STORAGE_DIMMING);
      localStorage.removeItem(STORAGE_WP_ENABLED);
      localStorage.removeItem(STORAGE_TRANSPARENT_WORLD);
      localStorage.removeItem(STORAGE_CHIBI_ENABLED);
      localStorage.removeItem(STORAGE_FX_DENSITY);
      localStorage.removeItem(STORAGE_AUTO_FINISHER);
      localStorage.removeItem(STORAGE_BUBBLE_RADIUS);
      localStorage.removeItem(STORAGE_ECO_BATTERY);
      localStorage.removeItem(STORAGE_MASTER_PERSONA);
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
        fxDensity: 100,
        autoFinisher: true,
        bubbleRadius: 14,
        ecoBattery: true,
        masterPersona: 'yoriichi'
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
          summaryEl.textContent = `Đang dùng: ${name}`;
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
  }

  function injectMainSidebarButton() {
    if (document.getElementById('agy-custom-theme-sidebar-btn')) return;

    const spans = Array.from(document.querySelectorAll('aside span, [data-sidebar] span, .bg-sidebar span'));
    const customSpan = spans.find(s => s.textContent?.trim() === 'Customizations');
    if (!customSpan) return;

    const row = customSpan.closest('a, button, div[role="button"], .group\\/headerbtn') || customSpan.parentElement;
    if (!row || !row.parentNode) return;

    const btn = document.createElement('button');
    btn.id = 'agy-custom-theme-sidebar-btn';
    btn.type = 'button';
    btn.className = 'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer select-none';
    btn.style.cssText = 'text-align: left; background: transparent; border: none; color: inherit; display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 12px; border-radius: 8px; cursor: pointer;';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${SEC.escapeHtml(tr('sidebarBtn', 'Giao diện tùy biến'))}</span>
    `;

    row.parentNode.insertBefore(btn, row.nextSibling);

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
        fxPaused: localStorage.getItem('agy_fx_paused_v1') === '1',
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
    if (!bTheme.npc || typeof bTheme.npc !== 'object') return def;
    return {
      badgeLabel: bTheme.npc.badgeLabel || def.badgeLabel,
      title: bTheme.npc.title || def.title,
      placeholder: bTheme.npc.placeholder || def.placeholder,
      pills: Array.isArray(bTheme.npc.pills) && bTheme.npc.pills.length > 0 ? bTheme.npc.pills : def.pills,
      dialogs: { ...def.dialogs, ...(bTheme.npc.dialogs || {}) },
      replies: { ...def.replies, ...(bTheme.npc.replies || {}) }
    };
  }

  function pickReplyVariant(val) {
    if (Array.isArray(val) && val.length > 0) {
      return val[Math.floor(Math.random() * val.length)];
    }
    return String(val || '');
  }

  function getNpcReplyForInput(rawInput, profileOverride) {
    const prof = profileOverride || getActiveNpcProfile();
    const rep = prof.replies || {};
    const text = String(rawInput || '').trim();
    const low = text.toLowerCase();
    if (!text) {
      return pickReplyVariant(rep.greet);
    }
    if (/(^|\s)(xin chào|chào|chao|hello|hi|hey|alo|moshi|kính chào)(\s|[!,.?~]|$)/i.test(low)) {
      return pickReplyVariant(rep.greet);
    }
    if (/(mệt|met|đuối|duoi|oải|oai|kiệt sức|đau lưng|mỏi mắt|moi mat)/i.test(low)) {
      return pickReplyVariant(rep.tired);
    }
    if (/(bug|lỗi|loi|error|crash|đỏ lòm|khó quá|kho qua|sai)/i.test(low)) {
      return pickReplyVariant(rep.bug);
    }
    if (/(xinh|đẹp|dep|dễ thương|de thuong|cute|đáng yêu|dang yeu|yêu|ngầu|đỉnh|tuyệt|hào nhoáng|kính trọng)/i.test(low)) {
      return pickReplyVariant(rep.praise);
    }
    if (/(đói|doi|ăn gì|an gi|cơm|mì|trà sữa|bụng|bento|tempura)/i.test(low)) {
      return pickReplyVariant(rep.hungry);
    }
    if (/(ngủ|ngu|khuya|muộn|thức đêm|buồn ngủ)/i.test(low)) {
      return pickReplyVariant(rep.sleepy);
    }
    if (/(deadline|gấp|gap|kịp không|chạy số|nộp bài)/i.test(low)) {
      return pickReplyVariant(rep.deadline);
    }
    if (/(cảm ơn|cam on|thank|tks|cám ơn|hay quá|xịn)/i.test(low)) {
      return pickReplyVariant(rep.thanks);
    }
    const clipped = text.length > 46 ? text.slice(0, 46) + '...' : text;
    const tpl = pickReplyVariant(rep.fallback) || '"{input}" — Mình luôn đồng hành cùng bạn! ✨';
    return tpl.replace(/\{input\}/g, clipped);
  }

  function triggerChibiBounce(targetEl) {
    if (!targetEl) return;
    targetEl.dataset.chibiBounce = '1';
    clearTimeout(targetEl.__agyBounceTimer);
    targetEl.__agyBounceTimer = setTimeout(() => {
      delete targetEl.dataset.chibiBounce;
    }, 280);
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
        min-height: 36px;
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

    const composer = document.querySelector('.surface-composer');
    if (!composer) return;

    let mainHit = composer.querySelector(':scope > .agy-chibi-hitbox');
    if (!mainHit) {
      mainHit = document.createElement('button');
      mainHit.type = 'button';
      mainHit.className = 'agy-chibi-hitbox';
      mainHit.innerHTML = '<i aria-hidden="true"></i>';
      mainHit.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.castNextComboSkill === 'function') {
          window.__AGY_KNY_CHIBI_AURA__.castNextComboSkill({
            originEl: e.currentTarget,
            sourceFrameEl: composer,
            fromChibiClick: true
          });
          return;
        }
        triggerChibiBounce(composer);
        const curText = document.querySelector('#agy-shinobu-npc-wrap .agy-npc-dialog-text')?.textContent || '';
        speakShinobuLine(pickRandomLine('welcome', curText), true);
      });
      composer.appendChild(mainHit);
    }
    mainHit.title = `⚡ Nhấn vào ${prof.badgeLabel || 'Chibi'} để nhảy ra thi triển Hơi Thở!`;
    mainHit.setAttribute('aria-label', mainHit.title);

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
          <form class="agy-npc-chat-row">
            <input type="text" class="agy-npc-chat-input" placeholder="${safePlaceholder}" autocomplete="off" />
            <button type="submit" class="agy-npc-chat-send">Gửi</button>
          </form>
        </div>
      `;
      composer.appendChild(wrap);

      const badge = wrap.querySelector('.agy-npc-badge');
      const popover = wrap.querySelector('.agy-npc-popover');
      const chatRow = wrap.querySelector('.agy-npc-chat-row');
      const chatInput = wrap.querySelector('.agy-npc-chat-input');
      const motionBtn = wrap.querySelector('[data-npc-act="motion"]');

      function syncChatVisibility(focusInput) {
        chatRow.style.display = rt.npcChatOpen ? 'flex' : 'none';
        if (rt.npcChatOpen && focusInput && chatInput) {
          setTimeout(() => chatInput.focus(), 20);
        }
      }

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
        const sentBox = wrap.querySelector('.agy-npc-user-sent');
        const sentMsg = wrap.querySelector('.agy-npc-user-msg');
        if (sentBox && sentMsg) {
          sentMsg.textContent = msg;
          sentBox.dataset.show = '1';
        }
        triggerChibiBounce(composer);
        speakShinobuLine(getNpcReplyForInput(msg, prof), true);
      });

      popover.style.display = rt.npcCollapsed ? 'none' : 'flex';
      badge.style.display = rt.npcCollapsed ? 'inline-flex' : 'none';
      syncChatVisibility(false);

      const welcomeList = Array.isArray(prof.dialogs.welcome) ? prof.dialogs.welcome : [String(prof.dialogs.welcome || '')];
      speakShinobuLine(welcomeList[0] || '', false);
    }

    if (window.__AGY_KNY_CHIBI_AURA__) {
      const charHint = bTheme.fxMode || activeBubbleKey;
      const auraThemeCfg = {
        ...bTheme,
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

    const composer = document.querySelector('.surface-composer') || document.querySelector('[data-testid="composer"]');
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

  function tick() {
    if (coreDestroyed) return;
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
