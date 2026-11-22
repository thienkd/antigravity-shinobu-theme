(() => {
  const SEC = (typeof __AGY_SEC__ === 'object' && __AGY_SEC__) ? __AGY_SEC__ : {
    getAssetBase: () => '',
    getInitialConfig: () => null,
    saveConfigSecure: () => false,
    escapeHtml: (raw) => String(raw == null ? '' : raw).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
    stripProtoKeys: (obj) => obj,
    sanitizeCssUrl: (raw) => (typeof raw === 'string' && !/["'()\\;\r\n\0<>`{}]/.test(raw) ? raw.trim() : ''),
    sanitizeCssValue: (raw, fb = '') => (typeof raw === 'string' && !/[;{}<>\\`\r\n\0]/.test(raw) ? raw.trim() : (typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : fb)),
    sanitizeSvgMarkup: (svg) => (typeof svg === 'string' && !/<script|<foreignobject|\bon[a-z]+\s*=/i.test(svg) ? svg.trim() : ''),
    sanitizeThemeDefinition: (t) => t,
    resolveAssetUrl: (val) => (typeof val === 'string' ? val.trim() : '')
  };

  const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
  const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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

    // Normalize SVG data URIs through sanitizeSvgMarkup -> strict percent-encoded URI so __AGY_SEC__.sanitizeCssUrl passes 100%
    if (/^data:image\/svg\+xml,/i.test(trimmed)) {
      try {
        const decoded = decodeURIComponent(trimmed.slice(trimmed.indexOf(',') + 1));
        const cleanSvg = SEC.sanitizeSvgMarkup(decoded);
        if (!cleanSvg) return '';
        return SEC.sanitizeCssUrl(`data:image/svg+xml,${strictPercentEncodeSvg(cleanSvg)}`);
      } catch (_) {
        return '';
      }
    }

    if (/^data:image\/svg\+xml;base64,/i.test(trimmed)) {
      try {
        const b64 = trimmed.slice(trimmed.indexOf(',') + 1);
        const bin = typeof atob === 'function' ? atob(b64) : '';
        const utf8 = decodeURIComponent(Array.from(bin).map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        const cleanSvg = SEC.sanitizeSvgMarkup(utf8);
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

  const THEMES = /*__THEMES_PLACEHOLDER__*/{};

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
  const STORAGE_GLASS_BLUR = 'agy_glass_blur_v3';
  const STORAGE_AVATAR_SIZE = 'agy_avatar_size_v3';
  const STORAGE_AVATAR_RADIUS = 'agy_avatar_radius_v3';
  const STORAGE_TRANSPARENT_WORLD = 'agy_transparent_world_v1';
  const STORAGE_MASTER_PERSONA = 'agy_master_persona_v1';

  const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const INPUT_STYLES = {
    'sync': {
      label: 'Synced Ornament Frame',
      desc: 'Follows the active theme borders & decorative SVG ornament'
    },
    'double_gold': {
      label: 'Amber Gold Double Border',
      desc: 'Warm metallic double border with corner filigree'
    },
    'glass': {
      label: 'Translucent Crystal Glass',
      desc: 'Lets more of your background artwork shine through'
    },
    'minimal': {
      label: 'Minimal Clean',
      desc: 'Sleek subtle border without top decorative stickers'
    }
  };

  function clampInt(val, min, max, fallback) {
    const parsed = parseInt(val, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function getState() {
    const init = SEC.getInitialConfig() || {};
    const rawTheme = localStorage.getItem(STORAGE_THEME) || init.themeName || DEFAULT_THEME_KEY;
    const themeName = THEMES[rawTheme] ? rawTheme : DEFAULT_THEME_KEY;
    const rawBubble = localStorage.getItem(STORAGE_BUBBLE) || init.bubbleName || themeName;
    const bubbleName = THEMES[rawBubble] ? rawBubble : themeName;
    const rawInput = localStorage.getItem(STORAGE_INPUT) || init.inputStyle || 'sync';
    const inputStyle = INPUT_STYLES[rawInput] ? rawInput : 'sync';
    const presetDefaultDim = THEMES[themeName]?.defaultDimming !== undefined ? THEMES[themeName].defaultDimming : 69;
    const dimming = clampInt(localStorage.getItem(STORAGE_DIMMING) ?? init.dimming ?? presetDefaultDim, 15, 92, 69);
    const wpEnabled = localStorage.getItem(STORAGE_WP_ENABLED) !== null
      ? localStorage.getItem(STORAGE_WP_ENABLED) !== 'false'
      : (init.wpEnabled !== undefined ? Boolean(init.wpEnabled) : true);
    const rawCustomWp = localStorage.getItem(STORAGE_CUSTOM_WP) || init.customWp || '';
    const customWp = rawCustomWp ? resolveAssetUrl(rawCustomWp) : '';
    const rawUserAv = localStorage.getItem(STORAGE_USER_AVATAR) ?? init.userAvatar ?? '';
    const userAvatar = rawUserAv === 'none' ? 'none' : (rawUserAv ? resolveAssetUrl(rawUserAv) : '');
    const rawAgentAv = localStorage.getItem(STORAGE_AGENT_AVATAR) ?? init.agentAvatar ?? '';
    const agentAvatar = rawAgentAv === 'none' ? 'none' : (rawAgentAv ? resolveAssetUrl(rawAgentAv) : '');
    const rawBlur = localStorage.getItem(STORAGE_GLASS_BLUR) ?? init.glassBlur;
    const glassBlur = rawBlur !== undefined && rawBlur !== null && rawBlur !== '' ? clampInt(rawBlur, 0, 16, 0) : 0;
    const rawAvSize = localStorage.getItem(STORAGE_AVATAR_SIZE) ?? init.avatarSize;
    const avatarSize = rawAvSize !== undefined && rawAvSize !== null && rawAvSize !== '' ? clampInt(rawAvSize, 22, 52, 32) : 32;
    const rawAvRad = localStorage.getItem(STORAGE_AVATAR_RADIUS) ?? init.avatarRadius;
    const avatarRadius = rawAvRad !== undefined && rawAvRad !== null && rawAvRad !== '' ? clampInt(rawAvRad, 0, 50, 50) : 50;
    const transparentWorld = localStorage.getItem(STORAGE_TRANSPARENT_WORLD) !== null
      ? localStorage.getItem(STORAGE_TRANSPARENT_WORLD) !== 'false'
      : (init.transparentWorld !== undefined ? Boolean(init.transparentWorld) : true);
    const masterPersona = String(localStorage.getItem(STORAGE_MASTER_PERSONA) || init.masterPersona || 'yoriichi').replace(/[^a-zA-Z0-9_-]/g, '') || 'yoriichi';
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
      masterPersona
    };
  }

  // Downscale user/agent avatar uploads to 192x192 WebP once (strictly validated <= 15MB & image MIME; aborts safely on decode error)
  function compressAvatarFile(file, callback) {
    if (!isValidImageUploadFile(file)) return;
    const reader = new FileReader();
    reader.onerror = () => {};
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
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

  // Validate and re-encode custom wallpaper uploads safely (<= 15MB, PNG/JPEG/WebP/GIF, never passes raw untrusted data URL on error)
  function compressWallpaperFile(file, callback) {
    if (!isValidImageUploadFile(file)) return;
    const reader = new FileReader();
    reader.onerror = () => {};
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxW = 2560;
          const maxH = 1440;
          const natW = Math.max(1, img.naturalWidth || 1920);
          const natH = Math.max(1, img.naturalHeight || 1080);
          const scale = Math.min(1, maxW / natW, maxH / natH);
          const w = Math.max(64, Math.round(natW * scale));
          const h = Math.max(64, Math.round(natH * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, w, h);
          const out = canvas.toDataURL('image/webp', 0.88);
          const candidate = out && out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/jpeg', 0.88);
          const safeUri = safeCssUrl(candidate);
          if (safeUri) callback(safeUri);
        } catch (_) {}
      };
      img.onerror = () => {};
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  // Pre-bake L-shaped header/sidebar glass blur once per theme/dimming change to avoid per-frame GPU backdrop readback
  function syncPrebakedGlass(wpUrl, overlayRgb, overlayAlpha, tintBg, blurStr) {
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
    const cached = window.__AGY_BLUR_CACHE__[key];
    if (cached) {
      if (shell) shell.style.setProperty('--agy-l-glass-bg', 'url("' + cached + '")');
      return;
    }
    const img = new Image();
    if (/^https?:\/\//i.test(safeWp)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const w = 1920;
        const h = Math.max(360, Math.round((img.naturalHeight || 2160) * (w / (img.naturalWidth || 3840))));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
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
        const baked = safeCssUrl(rawBaked);
        if (!baked) return;
        window.__AGY_BLUR_CACHE__[key] = baked;
        const curShell = document.querySelector('.agy-shell');
        if (curShell) curShell.style.setProperty('--agy-l-glass-bg', 'url("' + baked + '")');
      } catch (e) {}
    };
    img.src = safeWp;
  }

  function getActiveMasterPersona(stOverride) {
    const st = stOverride || getState();
    if (typeof window !== 'undefined' && window.__AGY_THEME_FORGE__ && typeof window.__AGY_THEME_FORGE__.getPersona === 'function') {
      return window.__AGY_THEME_FORGE__.getPersona(st.masterPersona || 'yoriichi');
    }
    return {
      id: 'yoriichi',
      tagLabel: 'Khai Tổ Hỏa Thần (Anh)',
      skillId: 'yoriichi',
      ringColor: '#fde047',
      glowColor: 'rgba(239, 68, 68, 0.52)',
      userAvatar: resolveAssetUrl('assets/yoriichi_avatar.jpg'),
      userSticker: resolveAssetUrl('assets/yoriichi_ornament.svg'),
      userCornerSvg: resolveAssetUrl('assets/yoriichi_corner.svg'),
      actionSticker: resolveAssetUrl('assets/yoriichi_action.png')
    };
  }

  function applyTheme(overrides = {}) {
    const st = { ...getState(), ...overrides };
    st.dimming = clampInt(st.dimming, 15, 92, 69);
    st.glassBlur = clampInt(st.glassBlur, 0, 16, 0);
    st.avatarSize = clampInt(st.avatarSize, 22, 52, 32);
    st.avatarRadius = clampInt(st.avatarRadius, 0, 50, 50);
    st.inputStyle = INPUT_STYLES[st.inputStyle] ? st.inputStyle : 'sync';
    st.transparentWorld = st.transparentWorld !== false;
    st.masterPersona = String(st.masterPersona || 'yoriichi').replace(/[^a-zA-Z0-9_-]/g, '') || 'yoriichi';

    try {
      localStorage.setItem(STORAGE_THEME, st.themeName);
      localStorage.setItem(STORAGE_BUBBLE, st.bubbleName);
      localStorage.setItem(STORAGE_INPUT, st.inputStyle);
      localStorage.setItem(STORAGE_DIMMING, String(st.dimming));
      localStorage.setItem(STORAGE_WP_ENABLED, String(st.wpEnabled));
      localStorage.setItem(STORAGE_TRANSPARENT_WORLD, String(st.transparentWorld));
      localStorage.setItem(STORAGE_MASTER_PERSONA, st.masterPersona);
      if (overrides.customWp !== undefined) {
        localStorage.setItem(STORAGE_CUSTOM_WP, overrides.customWp ? safeCssUrl(overrides.customWp) : '');
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

    SEC.saveConfigSecure(st);
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
    const personaOverrideActive = st.masterPersona && st.masterPersona !== 'yoriichi';
    const userCornerFiligreeUrl = safeCssUrl(
      (personaOverrideActive ? persona.userCornerSvg : (bubbleTheme.userCornerSvg || persona.userCornerSvg)) || ''
    ) || cornerFiligreeUrl;
    const userBubbleStickerUrl = safeCssUrl(
      (personaOverrideActive ? persona.userSticker : (bubbleTheme.userSticker || persona.userSticker || bubbleTheme.sticker)) || ''
    );
    const composerStickerUrl = safeCssUrl(bubbleTheme.sticker || '');

    const sTop = Number(bubbleTheme.stickerTop) || -56;
    const sRight = Number(bubbleTheme.stickerRight ?? 10) || 10;
    const sW = Number(bubbleTheme.stickerW) || 136;
    const sH = Number(bubbleTheme.stickerH) || 64;

    const bubblePadTop = Math.max(18, Math.abs(sTop) + 8);
    const bubbleStickerCss = userBubbleStickerUrl ? (bubbleTheme.isOrnament ? `
      .group\\/user-input-step {
        padding-top: ${bubbleTheme.isChibiNpc ? bubblePadTop : 18}px !important;
        overflow: visible !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${sTop}px;
        right: ${sRight}px;
        width: ${sW}px;
        height: ${sH}px;
        background-image: url("${userBubbleStickerUrl}");
        background-size: contain;
        background-position: ${bubbleTheme.isChibiNpc ? 'bottom center' : 'center'};
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
        padding-top: ${Math.max(36, Math.abs(sTop) + 8)}px !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${sTop}px;
        right: ${sRight}px;
        width: ${sW}px;
        height: ${sH}px;
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

    const showInputSticker = st.inputStyle !== 'minimal' && Boolean(composerStickerUrl);
    const composerMarginTop = Math.max(16, Math.abs(sTop) + 8);
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
        width: ${bubbleTheme.isChibiNpc ? sW : (sW + 8)}px;
        height: ${bubbleTheme.isChibiNpc ? sH : (sH + 2)}px;
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
        width: ${sW + 6}px;
        height: ${sH + 6}px;
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
      : (st.userAvatar || (personaOverrideActive ? persona.userAvatar : (mainTheme.userAvatar || persona.userAvatar)) || '');
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
        border-radius: 14px !important;
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
        border-radius: ${bubbleTheme.isScroll ? '6px' : '14px'} !important;
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
        border-radius: ${bubbleTheme.isScroll ? '5px' : '13px'} !important;
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
      .surface-composer > :first-child:not(.surface-composer-card):not(.agy-shinobu-npc-wrap):not(.agy-chibi-hitbox):not(#agy-token-context-bar):not(#agy-yoriichi-msg-echo):not(#agy-chibi-skill-bar):not(agy-chibi-aura) {
        background: ${bubbleComposerHeaderBg} !important;
        border-radius: 14.5px 14.5px 0 0 !important;
        padding: 4px 8px !important;
      }
      .surface-composer:has(> :first-child:not(.surface-composer-card):not(.agy-shinobu-npc-wrap):not(.agy-chibi-hitbox):not(#agy-token-context-bar):not(#agy-yoriichi-msg-echo):not(#agy-chibi-skill-bar):not(agy-chibi-aura)) .surface-composer-card {
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
  }

  function syncTitleBarOverlay(stOverride) {
    const st = stOverride || getState();
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
    const st = stOverride || getState();
    syncTitleBarOverlay(st);
    [300, 900, 2000, 4000, 7000].forEach(ms => {
      window.__AGY_TBO_TIMERS__.push(setTimeout(() => syncTitleBarOverlay(), ms));
    });
  }

  function removeCustomTheme() {
    clearTitleBarTimers();
    teardownLiveWallpaperFx();
    teardownShinobuNpc();
    if (typeof teardownTransparentWorldFlow === 'function') {
      teardownTransparentWorldFlow();
    }
    if (window.__AGY_SCROLL_AC__) {
      try { window.__AGY_SCROLL_AC__.abort(); } catch (e) {}
    }
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
      shell.style.removeProperty('--agy-hole-clip');
      shell.style.removeProperty('--agy-l-glass-bg');
    }
    if (window.electronNative && typeof window.electronNative.setTitleBarOverlay === 'function') {
      try {
        window.electronNative.setTitleBarOverlay({ color: '#111114', symbolColor: '#f8fafc' });
      } catch (e) {}
    }
  }

  window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__ = applyTheme;
  window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ = removeCustomTheme;
  window.__ANTIGRAVITY_OPEN_THEME_MODAL__ = openCustomThemeModal;

  teardownLiveWallpaperFx();
  teardownShinobuNpc();
  applyTheme();

  function openCustomThemeModal() {
    let backdrop = document.getElementById('agy-custom-theme-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'agy-custom-theme-modal-backdrop';
      backdrop.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(10px);
      `;

      backdrop.innerHTML = `
        <div id="agy-custom-theme-modal-dialog" style="background: rgba(16, 12, 11, 0.97); border: 1.2px solid rgba(212, 148, 106, 0.35); border-radius: 18px; width: 100%; max-width: 900px; height: 86vh; max-height: 860px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.9), 0 0 32px rgba(224, 142, 85, 0.25); font-family: system-ui, -apple-system, sans-serif;">
          <div id="agy-custom-theme-modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 18px 26px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(22, 16, 14, 0.85);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 17px; font-weight: 600; color: #f4f4f5; letter-spacing: -0.2px;">Custom Theme Studio</span>
              <span id="agy-custom-theme-badge" style="font-size: 11.5px; padding: 2.5px 9px; border-radius: 9999px; background: rgba(224, 142, 85, 0.2); color: #e08e55; font-weight: 500; border: 1px solid rgba(224, 142, 85, 0.3);">${THEME_KEYS.length} Preset${THEME_KEYS.length > 1 ? 's' : ''}</span>
            </div>
            <button id="agy-theme-modal-close-btn" type="button" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #d4d4d8; cursor: pointer; width: 30px; height: 30px; border-radius: 8px; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;">✕</button>
          </div>
          <div id="agy-theme-modal-body" style="flex: 1; overflow-y: auto; height: 100%;"></div>
        </div>
      `;

      document.body.appendChild(backdrop);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.style.display = 'none';
      });
      backdrop.querySelector('#agy-theme-modal-close-btn').addEventListener('click', () => {
        backdrop.style.display = 'none';
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && backdrop.style.display !== 'none') {
          backdrop.style.display = 'none';
        }
      });
    }

    backdrop.style.display = 'flex';
    const badgeEl = backdrop.querySelector('#agy-custom-theme-badge');
    if (badgeEl) {
      badgeEl.textContent = `${THEME_KEYS.length} Preset${THEME_KEYS.length > 1 ? 's' : ''}`;
    }
    const body = backdrop.querySelector('#agy-theme-modal-body');
    renderThemePanels(body);
  }

  function renderThemePanels(container) {
    const st = getState();
    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    const forge = typeof window !== 'undefined' ? window.__AGY_THEME_FORGE__ : null;
    const activePersona = getActiveMasterPersona(st);

    const safeMainPrimary = SEC.sanitizeCssValue(mainTheme.primary, '#c084fc');
    const safeMainAccent = SEC.sanitizeCssValue(mainTheme.accent || mainTheme.secondary, safeMainPrimary);
    const safeMainBorder = SEC.sanitizeCssValue(mainTheme.borderColor, 'rgba(255, 255, 255, 0.16)');
    const safeCardBg = SEC.sanitizeCssValue(mainTheme.cardBg, 'rgba(22, 16, 14, 0.72)');

    const personaOverrideActive = st.masterPersona && st.masterPersona !== 'yoriichi';
    const effUserAv = safeCssUrl(
      st.userAvatar === 'none'
        ? ''
        : (st.userAvatar || (personaOverrideActive ? activePersona.userAvatar : (mainTheme.userAvatar || activePersona.userAvatar)) || '')
    );
    const effAgentAv = safeCssUrl(
      st.agentAvatar === 'none' ? '' : (st.agentAvatar || mainTheme.agentAvatar || '')
    );

    const personaList = forge && Array.isArray(forge.PERSONA_LIST) ? forge.PERSONA_LIST : [activePersona];
    const multiversePresets = forge && Array.isArray(forge.MULTIVERSE_PRESETS) ? forge.MULTIVERSE_PRESETS : [];
    const fxModeOptions = forge && Array.isArray(forge.FX_MODE_OPTIONS)
      ? forge.FX_MODE_OPTIONS
      : [{ value: 'wisteria', label: '🦋 Tử Đằng Nguyệt Dạ' }];

    container.innerHTML = `
      <div id="agy-theme-scroll-container" style="padding: 24px 32px 48px 32px; max-width: 860px; margin: 0 auto; overflow-y: auto; height: 100%; color: #f4f4f5;">
        <div style="border: 1px solid ${safeMainBorder}; background: ${safeCardBg}; border-radius: 12px; padding: 16px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 600; color: #f4f4f5; margin-bottom: 2px;">Wallpaper, Pre-Baked Blur &amp; Deep-Focus</div>
              <div style="font-size: 12.5px; color: #a1a1aa;">120fps pre-baked glass, Single-Window GPU 0% idle &amp; Thế Giới Trong Suốt.</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-wp-toggle" type="checkbox" ${st.wpEnabled ? 'checked' : ''} style="accent-color: ${safeMainPrimary}; cursor: pointer;" />
                Backdrop
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Dim
                <input id="agy-dim-slider" type="range" min="15" max="92" value="${st.dimming}" style="width: 90px; cursor: pointer; accent-color: #ffffff; height: 5px;" />
                <span id="agy-dim-val" style="min-width: 32px; text-align: right;">${st.dimming}%</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Blur
                <input id="agy-blur-slider" type="range" min="0" max="16" value="${st.glassBlur}" style="width: 72px; cursor: pointer; accent-color: ${safeMainPrimary}; height: 5px;" />
                <span id="agy-blur-val" style="min-width: 30px; text-align: right;">${st.glassBlur}px</span>
              </label>
              <label style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${safeMainBorder}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Custom Image
                <input id="agy-wp-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
              </label>
              <button id="agy-export-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Export JSON
              </button>
              <button id="agy-import-toggle" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Import JSON / .agytheme
              </button>
              <button id="agy-reset-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Reset
              </button>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.07);">
            <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: #fef08a; font-weight: 500; cursor: pointer;">
              <input id="agy-tw-toggle" type="checkbox" ${st.transparentWorld ? 'checked' : ''} style="accent-color: #facc15; cursor: pointer;" />
              <span>👁️ Thế Giới Trong Suốt (Tự dịu khi gõ code)</span>
            </label>
            <span style="font-size: 11.5px; color: #a1a1aa;">Tự làm chậm hạt nền 20% &amp; giảm chói 35% khi gõ sâu (&ge; 4 phím/giây) hoặc đọc diff.</span>
          </div>
          <div id="agy-import-box" style="display: none; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
            <textarea id="agy-import-text" rows="3" placeholder="Dán JSON cấu hình hoặc nội dung gói .agytheme (schema: agytheme/2.0) vào đây..." style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); color: #f4f4f5; border: 1px solid ${safeMainBorder}; border-radius: 8px; padding: 8px 10px; font-family: monospace; font-size: 12px; resize: vertical;"></textarea>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <label style="padding: 5px 10px; border-radius: 7px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); color: #e4e4e7; font-size: 12px; cursor: pointer;">
                📂 Chọn file .agytheme / .json
                <input id="agy-import-file" type="file" accept=".agytheme,.json,application/json" style="display: none;" />
              </label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="agy-import-msg" style="font-size: 12px; color: #fca5a5;"></span>
                <button id="agy-import-apply" type="button" style="padding: 5px 12px; border-radius: 7px; background: ${safeMainPrimary}; color: #090d16; font-weight: 600; font-size: 12px; border: none; cursor: pointer;">Nạp cấu hình</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Master Persona Selector (Independent from Active Theme) -->
        <div style="border: 1px solid ${safeMainBorder}; background: ${safeCardBg}; border-radius: 12px; padding: 14px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 14px; font-weight: 600; color: #fef08a; margin-bottom: 2px;">👑 Bản Ngã Chủ Nhân (Master Persona — Độc lập khỏi Theme nền)</div>
              <div style="font-size: 12px; color: #a1a1aa;">Mặc định Khai Tổ Hỏa Thần Yoriichi, hoặc hóa thân thành 14 Đại Trụ / Kiếm sĩ &amp; 3 Đế Vương Đa Vũ Trụ!</div>
            </div>
            <select id="agy-persona-select" style="padding: 6px 12px; border-radius: 8px; background: rgba(10, 10, 20, 0.88); color: #f8fafc; border: 1px solid ${safeMainPrimary}; font-size: 12.5px; font-weight: 600; cursor: pointer; min-width: 250px;">
              ${personaList.map((p) => {
                const sel = p.id === st.masterPersona ? 'selected' : '';
                return `<option value="${SEC.escapeHtml(p.id)}" ${sel}>${SEC.escapeHtml(p.label)}</option>`;
              }).join('')}
            </select>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 7px; padding-top: 4px;">
            ${personaList.slice(0, 8).map((p) => {
              const isAct = p.id === st.masterPersona;
              const pAv = SEC.sanitizeCssUrl(p.userAvatar || '');
              const pRing = SEC.sanitizeCssValue(p.ringColor, '#fde047');
              return `
                <button type="button" class="agy-persona-pill" data-persona="${SEC.escapeHtml(p.id)}" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 5px; border-radius: 999px; border: 1px solid ${isAct ? pRing : 'rgba(255,255,255,0.14)'}; background: ${isAct ? 'rgba(250, 204, 21, 0.16)' : 'rgba(255,255,255,0.05)'}; color: #f8fafc; font-size: 11.5px; font-weight: ${isAct ? '600' : '400'}; cursor: pointer;">
                  <span style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid ${pRing}; background: rgba(0,0,0,0.4) ${pAv ? `url("${pAv}") center/cover no-repeat` : ''}; flex-shrink: 0;"></span>
                  <span>${SEC.escapeHtml(p.shortLabel || p.label)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Multiverse AI Theme Forge (OKLCH 64x64 + .agytheme) -->
        ${forge ? `
        <div style="border: 1px solid rgba(192, 132, 252, 0.42); background: linear-gradient(145deg, rgba(20, 12, 38, 0.88), rgba(11, 15, 30, 0.92)); border-radius: 12px; padding: 15px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 11px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 700; color: #e9d5ff; margin-bottom: 2px;">⚒️ Lò Rèn Đa Vũ Trụ — AI Theme Forge (OKLCH &amp; .agytheme)</div>
              <div style="font-size: 12px; color: #cbd5e1;">Thả ảnh 4K bất kỳ để trích xuất 14 biến màu kính mờ chuẩn tương phản đọc code WCAG AA, hoặc mở rộng Đa Vũ Trụ ngay!</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button id="agy-forge-export-pkg" type="button" style="padding: 5px 11px; border-radius: 8px; background: rgba(56, 189, 248, 0.16); border: 1px solid rgba(56, 189, 248, 0.45); color: #e0f2fe; font-size: 12px; font-weight: 600; cursor: pointer;">
                📦 Xuất gói .agytheme
              </button>
            </div>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${multiversePresets.map((mp) => `
              <button type="button" class="agy-multiverse-preset-btn" data-mv-id="${SEC.escapeHtml(mp.id)}" style="padding: 6px 12px; border-radius: 9px; background: rgba(168, 85, 247, 0.16); border: 1px solid rgba(192, 132, 252, 0.42); color: #f5d0fe; font-size: 12px; font-weight: 600; cursor: pointer;">
                ${SEC.escapeHtml(mp.shortLabel)}
              </button>
            `).join('')}
            <label id="agy-forge-dropzone" style="flex: 1; min-width: 210px; padding: 6px 12px; border-radius: 9px; border: 1px dashed rgba(94, 234, 212, 0.55); background: rgba(15, 23, 42, 0.55); color: #99f6e4; font-size: 12px; font-weight: 500; text-align: center; cursor: pointer;">
              🖼️ Thả hoặc Chọn ảnh 4K để rèn bảng màu OKLCH...
              <input id="agy-forge-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
            </label>
          </div>
          <div id="agy-forge-workbench" style="display: none; flex-direction: column; gap: 9px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.10);">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <input id="agy-forge-name" type="text" maxlength="60" placeholder="Đặt tên Vũ Trụ mới..." style="flex: 1; min-width: 180px; padding: 6px 10px; border-radius: 8px; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 12.5px;" />
              <select id="agy-forge-fx" style="padding: 6px 10px; border-radius: 8px; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 12px;">
                ${fxModeOptions.map((opt) => `<option value="${SEC.escapeHtml(opt.value)}">${SEC.escapeHtml(opt.label)}</option>`).join('')}
              </select>
              <button id="agy-forge-commit" type="button" style="padding: 6px 14px; border-radius: 8px; background: linear-gradient(135deg, #a855f7, #38bdf8); border: none; color: #090d16; font-size: 12.5px; font-weight: 700; cursor: pointer;">
                ⚡ Rèn &amp; Kích Hoạt
              </button>
            </div>
            <div id="agy-forge-swatches" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 11.5px; color: #cbd5e1;"></div>
          </div>
          <div id="agy-forge-status" style="font-size: 11.5px; color: #5eead4; display: none;"></div>
        </div>
        ` : ''}

        <div style="border: 1px solid ${safeMainBorder}; background: ${safeCardBg}; border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size: 14px; font-weight: 600; color: #f4f4f5; margin-bottom: 2px;">Chat Avatars (User &amp; AI Agent)</div>
              <div style="font-size: 12px; color: #a1a1aa;">Profile badges rendered beside chat messages (auto-compressed WebP, &le; 15MB).</div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-user-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${safeMainPrimary}; background: rgba(255,255,255,0.06) ${effUserAv ? `url("${effUserAv}") center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effUserAv ? '' : 'U'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${safeMainBorder}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  User
                  <input id="agy-user-av-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
                </label>
                <button id="agy-user-av-clear" type="button" style="padding: 4px 8px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer;">Off</button>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-agent-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${safeMainAccent}; background: rgba(255,255,255,0.06) ${effAgentAv ? `url("${effAgentAv}") center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effAgentAv ? '' : 'AI'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${safeMainBorder}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  Agent
                  <input id="agy-agent-av-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
                </label>
                <button id="agy-agent-av-clear" type="button" style="padding: 4px 8px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer;">Off</button>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.07);">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Size
              <input id="agy-av-size" type="range" min="22" max="52" value="${st.avatarSize}" style="width: 100px; cursor: pointer; accent-color: ${safeMainPrimary}; height: 5px;" />
              <span id="agy-av-size-val" style="min-width: 34px;">${st.avatarSize}px</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Corner Radius
              <input id="agy-av-rad" type="range" min="0" max="50" value="${st.avatarRadius}" style="width: 100px; cursor: pointer; accent-color: ${safeMainPrimary}; height: 5px;" />
              <span id="agy-av-rad-val" style="min-width: 34px;">${st.avatarRadius}%</span>
            </label>
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">User Chat Bubble</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Mix and match bubble frame &amp; ornament independently from the active wallpaper.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${THEME_KEYS.map(name => {
              const th = THEMES[name] || {};
              const safeNameHtml = SEC.escapeHtml(name);
              const isSelected = name === st.bubbleName;
              const stickerTop = th.isOrnament ? Math.round((Number(th.stickerTop) || 0) * 0.85) : Math.round((Number(th.stickerTop) || 0) * 0.74);
              const stickerW = Math.round((Number(th.stickerW) || 0) * 0.78);
              const stickerH = th.isOrnament ? Math.round((Number(th.stickerH) || 0) * 0.8) : Math.round((Number(th.stickerH) || 0) * 0.78);
              const safeThFrame = SEC.sanitizeCssValue(th.frameBg, '#c084fc');
              const safeThGlow = SEC.sanitizeCssValue(th.glow, 'rgba(192,132,252,0.28)');
              const safeThBg = SEC.sanitizeCssValue(th.userBubble || th.bg, 'rgba(24,18,42,0.9)');
              const safeThBorder = SEC.sanitizeCssValue(th.innerBorder, '1px solid ' + SEC.sanitizeCssValue(th.borderColor, 'rgba(255,255,255,0.16)'));
              const safeThText = SEC.sanitizeCssValue(th.textColor || th.textMain, '#f8fafc');
              const safeStickerUrl = SEC.sanitizeCssUrl(th.sticker || '');
              return `
                <div class="agy-bubble-card" data-name="${safeNameHtml}" style="position: relative; border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 24px 18px 14px 18px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; min-height: 112px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-top: 6px; margin-bottom: 10px;">
                    <div style="position: relative; width: 192px; height: 46px; padding: 1.2px; border-radius: ${th.isScroll ? '6px' : '12px'}; background: ${safeThFrame}; box-shadow: 0 4px 14px rgba(0,0,0,0.45), 0 0 10px ${safeThGlow};">
                      <div style="position: relative; width: 100%; height: 100%; background: ${safeThBg}; border: ${safeThBorder}; border-radius: ${th.isScroll ? '4px' : '11px'}; display: flex; align-items: center; padding: 0 16px;">
                        ${safeStickerUrl ? `<div style="position: absolute; top: ${stickerTop}px; right: 8px; width: ${stickerW}px; height: ${stickerH}px; background-image: url(&quot;${safeStickerUrl}&quot;); background-size: contain; background-position: ${th.isOrnament ? 'center' : 'bottom center'}; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                        <span style="font-size: 13.5px; font-weight: 500; color: ${safeThText};">Hello ✨</span>
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${safeNameHtml}</span>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">Composer Style</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Customize the chat input frame without affecting keyboard shortcuts or attachments.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${Object.entries(INPUT_STYLES).map(([key, item]) => {
              const isSelected = key === st.inputStyle;
              const activeBubbleTh = THEMES[st.bubbleName] || mainTheme;
              const previewStickerStyle = activeBubbleTh.isOrnament
                ? 'top: -12px; right: 10px; width: 72px; height: 22px; background-position: center;'
                : 'top: -22px; right: 10px; width: 32px; height: 28px; background-position: bottom center;';
              const previewInnerBg = SEC.sanitizeCssValue(
                key === 'glass'
                  ? (activeBubbleTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
                  : (activeBubbleTh.inputCardBg || activeBubbleTh.composerBg || 'rgba(26, 18, 15, 0.92)'),
                'rgba(26, 18, 15, 0.92)'
              );
              const previewFrameBg = key === 'double_gold'
                ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                : SEC.sanitizeCssValue(activeBubbleTh.frameBg, '#c084fc');
              const previewStickerUrl = SEC.sanitizeCssUrl(activeBubbleTh.sticker || '');
              const previewPrimary = SEC.sanitizeCssValue(activeBubbleTh.primary, '#c084fc');
              return `
                <div class="agy-input-card" data-style="${SEC.escapeHtml(key)}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 16px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div class="agy-input-preview-outer" style="position: relative; margin-top: 8px; padding: 1.5px; border-radius: 10px; background: ${previewFrameBg};">
                    <div class="agy-input-preview-sticker" style="position: absolute; ${previewStickerStyle} ${previewStickerUrl ? `background-image: url(&quot;${previewStickerUrl}&quot;);` : ''} background-size: contain; background-repeat: no-repeat; display: ${key !== 'minimal' && previewStickerUrl ? 'block' : 'none'}; pointer-events: none;"></div>
                    <div class="agy-input-preview-inner" style="background: ${previewInnerBg}; border-radius: 9px; padding: 8px 12px; font-size: 12px; color: #a1a1aa; display: flex; justify-content: space-between; align-items: center;">
                      <span>Ask anything, @ to mention...</span>
                      <span class="agy-input-preview-turbo" style="color: ${previewPrimary}; font-size: 11px;">Send →</span>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${SEC.escapeHtml(item.label)}</div>
                      <div style="font-size: 11.5px; color: #a1a1aa;">${SEC.escapeHtml(item.desc)}</div>
                    </div>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 3px;">Theme Presets (${THEME_KEYS.length})</div>
              <div style="font-size: 12.5px; color: #a1a1aa;">Bộ sưu tập Thanh Gươm Diệt Quỷ &amp; Đa Vũ Trụ OKLCH — 60fps Live Glass &amp; NPC.</div>
            </div>
            <div id="agy-preset-filter-bar" style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button type="button" class="agy-filter-chip" data-filter="all" style="padding: 4px 10px; border-radius: 999px; border: 1px solid ${safeMainPrimary}; background: rgba(255,255,255,0.12); color: #fff; font-size: 11.5px; font-weight: 600; cursor: pointer;">Tất cả (${THEME_KEYS.length})</button>
              <button type="button" class="agy-filter-chip" data-filter="royal" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(250,204,21,0.45); background: rgba(250,204,21,0.12); color: #fef08a; font-size: 11.5px; font-weight: 600; cursor: pointer;">👑 Chúa Công</button>
              <button type="button" class="agy-filter-chip" data-filter="hashira" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 11.5px; cursor: pointer;">⚔️ Cửu Trụ (9)</button>
              <button type="button" class="agy-filter-chip" data-filter="kamaboko" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 11.5px; cursor: pointer;">🔥 Nhân Vật Chính</button>
              <button type="button" class="agy-filter-chip" data-filter="forged" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(192,132,252,0.42); background: rgba(168,85,247,0.12); color: #e9d5ff; font-size: 11.5px; cursor: pointer;">🌌 Đa Vũ Trụ / Rèn AI</button>
              <button type="button" class="agy-filter-chip" data-filter="classic" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 11.5px; cursor: pointer;">✨ Khác</button>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
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
                ? `linear-gradient(180deg, rgba(0,0,0,0.10), rgba(10,8,18,0.86)), url(&quot;${safeWpUrl}&quot;)`
                : SEC.sanitizeCssValue(th.pureBg || th.bg, '#111118');
              const safeBgPos = SEC.sanitizeCssValue(th.bgPosition, 'center');
              const safeStickerUrl = SEC.sanitizeCssUrl(th.sticker || '');
              const thumbOrnamentStyle = th.isChibiNpc
                ? 'right: 8px; bottom: 0px; width: 92px; height: 45px; background-position: bottom right;'
                : (th.isOrnament
                  ? 'right: 10px; bottom: 8px; width: 76px; height: 24px; background-position: center;'
                  : 'right: 12px; bottom: 4px; width: 42px; height: 38px; background-position: bottom center;');
              const borderStyle = isSelected
                ? (isRoyal ? '1.8px solid #facc15' : '1.5px solid #f4f4f5')
                : (isRoyal ? '1.2px solid rgba(250, 204, 21, 0.55)' : '1px solid rgba(255, 255, 255, 0.12)');
              const cardShadow = isRoyal ? 'box-shadow: 0 6px 22px rgba(250, 204, 21, 0.18), inset 0 1px 0 rgba(254, 240, 138, 0.22);' : '';
              return `
                <div class="agy-preset-card" data-name="${safeNameHtml}" data-group="${SEC.escapeHtml(groupTag)}" style="border-radius: 12px; border: ${borderStyle}; background: ${isRoyal ? 'linear-gradient(145deg, rgba(32, 18, 52, 0.92), rgba(18, 12, 32, 0.94))' : 'rgba(14, 12, 18, 0.84)'}; ${cardShadow} overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color 0.15s ease, transform 0.15s ease;">
                  <div style="height: 78px; width: 100%; background-image: ${thumbBg}; background-size: cover; background-position: ${safeBgPos}; position: relative; display: flex; align-items: flex-end; padding: 8px 14px;">
                    ${isRoyal ? `<span style="position:absolute; top:7px; left:10px; padding:2px 8px; border-radius:999px; background:linear-gradient(90deg, rgba(250,204,21,0.92), rgba(232,121,249,0.88)); color:#180d2c; font-size:10px; font-weight:800; letter-spacing:0.2px;">★ ĐẶC BIỆT</span>` : (isForged ? `<span style="position:absolute; top:7px; left:10px; padding:2px 8px; border-radius:999px; background:rgba(168,85,247,0.85); color:#fff; font-size:10px; font-weight:700;">⚒️ OKLCH</span>` : '')}
                    ${safeStickerUrl ? `<div style="position: absolute; ${thumbOrnamentStyle} background-image: url(&quot;${safeStickerUrl}&quot;); background-size: contain; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                    <span style="font-size: 13.5px; font-weight: 600; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.92); padding-right: 78px;">${safeNameHtml}</span>
                  </div>
                  <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <span style="font-size: 12px; color: ${isRoyal ? '#fef08a' : '#a1a1aa'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${SEC.escapeHtml(th.concept || '')}</span>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

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
      if (!file) return;
      compressWallpaperFile(file, (safeDataUrl) => {
        applyTheme({ customWp: safeDataUrl, wpEnabled: true });
        const toggle = container.querySelector('#agy-wp-toggle');
        if (toggle) toggle.checked = true;
      });
    });

    // Master Persona selector & quick pills
    const personaSelect = container.querySelector('#agy-persona-select');
    const applyMasterPersona = (pid) => {
      const cleanId = String(pid || 'yoriichi').replace(/[^a-zA-Z0-9_-]/g, '') || 'yoriichi';
      // Clear manual userAvatar override if it was 'none' or empty so persona emblem shows immediately
      const nextOverrides = { masterPersona: cleanId };
      if (!localStorage.getItem(STORAGE_USER_AVATAR)) {
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
      let pendingForged = null;
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
          { label: 'Primary', color: themeObj.primary },
          { label: 'Accent', color: themeObj.accent },
          { label: 'CodeBg', color: themeObj.codeBg },
          { label: 'TextMain', color: themeObj.textMain },
          { label: 'TextMuted', color: themeObj.textMuted },
          { label: 'PillBg', color: themeObj.pillBg }
        ];
        const swHtml = swatches.map((sw) => {
          const c = SEC.sanitizeCssValue(sw.color, '#1e293b');
          return `<span title="${SEC.escapeHtml(sw.label)}: ${SEC.escapeHtml(c)}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:6px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.14);"><i style="width:11px;height:11px;border-radius:3px;background:${c};display:inline-block;"></i>${SEC.escapeHtml(sw.label)}</span>`;
        }).join('');
        const ratio = themeObj.wcagReport ? themeObj.wcagReport.textContrast : '12.0';
        forgeSwatches.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;">${swHtml}</div><span style="color:#fef08a;font-weight:600;">WCAG AA/AAA: ${SEC.escapeHtml(String(ratio))}:1 ✓</span>`;
      };

      const handleForgeFile = (file) => {
        if (!file) return;
        showForgeStatus('⏳ Đang quét histogram 64×64 & giải phương trình màu OKLCH...', false);
        forge.forgeFromWallpaperFile(file).then((res) => {
          pendingForged = res;
          if (forgeBench) forgeBench.style.display = 'flex';
          if (forgeName) forgeName.value = res.suggestedName;
          if (forgeFx) forgeFx.value = res.fxMode;
          renderSwatchesPreview(res.theme);
          showForgeStatus('✨ Đã trích xuất đủ 14 biến màu kính mờ OKLCH đạt chuẩn tương phản đọc code WCAG AA!', false);
        }).catch((err) => {
          showForgeStatus('⚠️ ' + (err && err.message ? err.message : 'Không thể xử lý ảnh.'), true);
        });
      };

      if (forgeFile) {
        forgeFile.addEventListener('change', (e) => {
          const f = e.target.files && e.target.files[0];
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
            forgeDrop.style.borderColor = 'rgba(94, 234, 212, 0.55)';
            if (evt === 'drop' && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleForgeFile(e.dataTransfer.files[0]);
            }
          });
        });
      }
      if (forgeCommit) {
        forgeCommit.addEventListener('click', () => {
          if (!pendingForged || !pendingForged.theme) return;
          const chosenName = (forgeName && forgeName.value.trim()) || pendingForged.suggestedName || '⚒️ Forged Universe';
          const chosenFx = (forgeFx && forgeFx.value) || pendingForged.fxMode || 'wisteria';
          pendingForged.theme.fxMode = chosenFx;
          const saved = forge.registerThemeIntoRegistry(THEMES, THEME_KEYS, chosenName, pendingForged.theme);
          if (saved) {
            const badgeEl = document.getElementById('agy-custom-theme-badge');
            if (badgeEl) badgeEl.textContent = `${THEME_KEYS.length} Presets`;
            applyTheme({
              themeName: saved.name,
              bubbleName: saved.name,
              dimming: saved.theme.defaultDimming || 28,
              customWp: '',
              wpEnabled: true
            });
            renderThemePanels(container);
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
            if (badgeEl) badgeEl.textContent = `${THEME_KEYS.length} Presets`;
            applyTheme({
              themeName: saved.name,
              bubbleName: saved.name,
              masterPersona: preset.personaId || st.masterPersona,
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
    const agentAvUpload = container.querySelector('#agy-agent-av-upload');
    const agentAvPreview = container.querySelector('#agy-agent-av-preview');
    const agentAvClear = container.querySelector('#agy-agent-av-clear');

    function syncAvPreview(el, url, fallbackText) {
      if (!el) return;
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

    if (userAvUpload) {
      userAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          applyTheme({ userAvatar: dataUrl });
          syncAvPreview(userAvPreview, dataUrl, 'U');
        });
      });
    }
    if (userAvClear) {
      userAvClear.addEventListener('click', () => {
        applyTheme({ userAvatar: 'none' });
        syncAvPreview(userAvPreview, '', 'U');
      });
    }
    if (agentAvUpload) {
      agentAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          applyTheme({ agentAvatar: dataUrl });
          syncAvPreview(agentAvPreview, dataUrl, 'AI');
        });
      });
    }
    if (agentAvClear) {
      agentAvClear.addEventListener('click', () => {
        applyTheme({ agentAvatar: 'none' });
        syncAvPreview(agentAvPreview, '', 'AI');
      });
    }

    const blurSlider = container.querySelector('#agy-blur-slider');
    const blurLabel = container.querySelector('#agy-blur-val');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        const v = clampInt(e.target.value, 0, 16, 0);
        if (blurLabel) blurLabel.textContent = v + 'px';
        applyTheme({ glassBlur: v });
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
      if ((parsed.schema && String(parsed.schema).startsWith('agytheme/')) || (parsed.theme && typeof parsed.theme === 'object')) {
        if (!forge || typeof forge.importAgyThemeObject !== 'function') {
          throw new Error('Mô-đun AI Theme Forge chưa sẵn sàng.');
        }
        const imported = forge.importAgyThemeObject(parsed, THEMES, THEME_KEYS);
        const badgeEl = document.getElementById('agy-custom-theme-badge');
        if (badgeEl) badgeEl.textContent = `${THEME_KEYS.length} Presets`;
        const nextPatch = {
          themeName: imported.name,
          bubbleName: imported.name,
          customWp: '',
          wpEnabled: true
        };
        if (imported.masterPersona) nextPatch.masterPersona = imported.masterPersona;
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
        allowed.masterPersona = parsed.masterPersona.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'yoriichi';
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
            exportBtn.textContent = 'Copied ✓';
            setTimeout(() => { exportBtn.textContent = 'Export JSON'; }, 1500);
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
        importBox.style.display = importBox.style.display === 'none' ? 'flex' : 'none';
        if (importMsg) importMsg.textContent = '';
      });
    }
    if (importFile) {
      importFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
          if (importMsg) importMsg.textContent = 'File quá lớn (> 15MB).';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
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
      localStorage.removeItem(STORAGE_CUSTOM_WP);
      localStorage.removeItem(STORAGE_USER_AVATAR);
      localStorage.removeItem(STORAGE_AGENT_AVATAR);
      localStorage.removeItem(STORAGE_GLASS_BLUR);
      localStorage.removeItem(STORAGE_AVATAR_SIZE);
      localStorage.removeItem(STORAGE_AVATAR_RADIUS);
      localStorage.removeItem(STORAGE_THEME);
      localStorage.removeItem(STORAGE_BUBBLE);
      localStorage.removeItem(STORAGE_INPUT);
      localStorage.removeItem(STORAGE_DIMMING);
      localStorage.removeItem(STORAGE_WP_ENABLED);
      localStorage.removeItem(STORAGE_TRANSPARENT_WORLD);
      localStorage.removeItem(STORAGE_MASTER_PERSONA);
      applyTheme({
        themeName: DEFAULT_THEME_KEY,
        bubbleName: DEFAULT_THEME_KEY,
        inputStyle: 'sync',
        dimming: 69,
        wpEnabled: true,
        customWp: '',
        userAvatar: '',
        agentAvatar: '',
        glassBlur: 3,
        avatarSize: 32,
        avatarRadius: 50,
        transparentWorld: true,
        masterPersona: 'yoriichi'
      });
      renderThemePanels(container);
    });

    container.querySelectorAll('.agy-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.getAttribute('data-filter') || 'all';
        container.querySelectorAll('.agy-filter-chip').forEach(ch => {
          const active = ch === chip;
          ch.style.background = active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
          ch.style.borderColor = active ? safeMainPrimary : 'rgba(255,255,255,0.16)';
          ch.style.fontWeight = active ? '600' : '400';
        });
        container.querySelectorAll('.agy-preset-card').forEach(card => {
          const g = card.getAttribute('data-group') || 'classic';
          card.style.display = (f === 'all' || g === f) ? 'flex' : 'none';
        });
      });
    });

    container.querySelectorAll('.agy-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        if (!THEMES[name]) return;
        const pickedTh = THEMES[name] || {};
        const nextDim = pickedTh.defaultDimming !== undefined ? pickedTh.defaultDimming : 42;
        applyTheme({ themeName: name, bubbleName: name, dimming: nextDim, customWp: '' });
        if (slider) slider.value = nextDim;
        if (valLabel) valLabel.textContent = nextDim + '%';
        if (!localStorage.getItem(STORAGE_USER_AVATAR)) {
          const curP = getActiveMasterPersona();
          const pOverride = getState().masterPersona !== 'yoriichi';
          syncAvPreview(userAvPreview, pOverride ? curP.userAvatar : (pickedTh.userAvatar || curP.userAvatar || ''), 'U');
        }
        if (!localStorage.getItem(STORAGE_AGENT_AVATAR)) {
          syncAvPreview(agentAvPreview, pickedTh.agentAvatar || '', 'AI');
        }

        container.querySelectorAll('.agy-preset-card').forEach(c => {
          const isSel = c.dataset.name === name;
          const isRoy = c.dataset.group === 'royal';
          c.style.border = isSel
            ? (isRoy ? '1.8px solid #facc15' : '1.5px solid #f4f4f5')
            : (isRoy ? '1.2px solid rgba(250, 204, 21, 0.55)' : '1px solid rgba(255, 255, 255, 0.12)');
          const slot = c.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        container.querySelectorAll('.agy-bubble-card').forEach(b => {
          const isSel = b.dataset.name === name;
          b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = b.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        updateInputPreviews(name);
      });
    });

    container.querySelectorAll('.agy-bubble-card').forEach(card => {
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        if (!THEMES[name]) return;
        applyTheme({ bubbleName: name });

        container.querySelectorAll('.agy-bubble-card').forEach(b => {
          const isSel = b.dataset.name === name;
          b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = b.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        updateInputPreviews(name);
      });
    });

    container.querySelectorAll('.agy-input-card').forEach(card => {
      card.addEventListener('click', () => {
        const styleKey = card.dataset.style;
        if (!INPUT_STYLES[styleKey]) return;
        applyTheme({ inputStyle: styleKey });

        container.querySelectorAll('.agy-input-card').forEach(c => {
          const isSel = c.dataset.style === styleKey;
          c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          c.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = c.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });
      });
    });
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
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Custom theme</span>
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
      <span>Open Custom Theme Studio</span>
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
        delete shell.dataset.agySideGlass;
        return;
      }
    }
    window.__AGY_HOLE_EL__ = null;
    delete shell.dataset.agyHoleActive;
    shell.style.removeProperty('--agy-hole-clip');

    const sideBody = shell.querySelector('[data-side-panel-body="true"]');
    if (sideBody) {
      if (window.__AGY_SHELL_RO__ && window.__AGY_SIDE_EL__ !== sideBody) {
        try { window.__AGY_SHELL_RO__.observe(sideBody); } catch (e) {}
        window.__AGY_SIDE_EL__ = sideBody;
      }
      const sRect = sideBody.getBoundingClientRect();
      const hasContent = sideBody.children.length > 0;
      if (hasContent && sRect.width > 24 && sRect.height > 24 && sRect.left < shellRect.right - 8 && sRect.right > shellRect.left + 8) {
        const sl = Math.max(sw, Math.round(sRect.left - shellRect.left));
        const st = Math.max(hdrBottom, Math.round(sRect.top - shellRect.top));
        const sr = Math.min(Math.round(shellRect.width), Math.max(sl, Math.round(sRect.right - shellRect.left)));
        const sb = Math.min(Math.round(shellRect.height), Math.max(st, Math.round(sRect.bottom - shellRect.top)));
        if (sr - sl > 20 && sb - st > 20) {
          shell.style.setProperty('--agy-side-l', sl + 'px');
          shell.style.setProperty('--agy-side-t', st + 'px');
          shell.style.setProperty('--agy-side-r', sr + 'px');
          shell.style.setProperty('--agy-side-b', sb + 'px');
          shell.dataset.agySideGlass = '1';
          return;
        }
      }
    }
    delete shell.dataset.agySideGlass;
  }

  function hookShellMetrics() {
    const shell = document.querySelector('.agy-shell');
    if (!shell) return;
    if (!shell.dataset.agyTboMounted) {
      shell.dataset.agyTboMounted = '1';
      scheduleTitleBarSync();
    }
    if (!window.__AGY_SHELL_RO__ && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncShellMetrics);
      ro.observe(shell);
      const sidebarPane = shell.querySelector('[data-testid="sidebar-split"]')?.firstElementChild;
      if (sidebarPane) ro.observe(sidebarPane);
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
    window.addEventListener('keydown', (e) => {
      if (!twEnabledFlag || !e || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Shift' || e.key === 'CapsLock' || e.key === 'Tab' || e.key === 'Escape') return;
      const t = e.target;
      if (!t || !t.tagName) return;
      if (t.closest && t.closest('#agy-custom-theme-modal-backdrop')) return;
      const tag = t.tagName.toUpperCase();
      const isCodingOrTyping =
        tag === 'TEXTAREA' ||
        tag === 'INPUT' ||
        t.isContentEditable ||
        Boolean(t.closest && t.closest('.monaco-editor, .cm-editor, .surface-composer, [contenteditable="true"]'));
      if (!isCodingOrTyping) return;

      const now = performance.now();
      if (twTargetVal === 1) {
        pulseTransparentWorldActivity();
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
    }, { capture: true, passive: true, signal });

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
      if (Array.isArray(rt.fxCleanups)) {
        rt.fxCleanups.forEach(fn => { try { fn(); } catch (_) {} });
        rt.fxCleanups = [];
      }
    }
    const oldHost = document.getElementById('agy-live-fx-host');
    if (oldHost) oldHost.remove();
  }

  function syncLiveWallpaperFx(stOverride, themeOverride) {
    const st = stOverride || getState();
    const th = themeOverride || THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    const fxMode = th.fxMode || (th.liveWallpaperFx ? 'wisteria' : '');
    const shell = document.querySelector('.agy-shell');
    if (!shell || !st.wpEnabled || !fxMode) {
      teardownLiveWallpaperFx();
      return;
    }

    const rt = getShinobuRuntime();
    let host = document.getElementById('agy-live-fx-host');
    if (host && host.parentElement === shell && rt.activeFxMode === fxMode && (rt.fxRaf || rt.fxPaused || rt.fxFocusPaused)) {
      return;
    }

    teardownLiveWallpaperFx();
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

    const canvas = document.createElement('canvas');
    canvas.id = 'agy-live-fx-canvas';
    canvas.style.cssText = 'width: 100%; height: 100%; display: block; pointer-events: none;';
    host.appendChild(canvas);
    shell.insertBefore(host, shell.firstChild);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 1280;
    let height = 720;
    let viewSkipped = false;
    let blurPauseTimer = 0;
    const reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    const drawerFactory = typeof window.__AGY_KNY_FX_DRAWERS__ === 'function' ? window.__AGY_KNY_FX_DRAWERS__ : null;
    let drawer = null;

    function resize() {
      const rect = shell.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
      rt.fxDrawer = drawer;
    }

    function shouldAnimate() {
      if (document.hidden || viewSkipped || rt.fxPaused || rt.fxFocusPaused) return false;
      if (reducedMq && reducedMq.matches) return false;
      return true;
    }

    function drawStaticGlowFrame() {
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
    document.addEventListener('visibilitychange', onVis);

    rt.fxCleanups.push(() => { clearTimeout(blurPauseTimer); blurPauseTimer = 0; });
    rt.fxCleanups.push(() => window.removeEventListener('resize', onResize));
    rt.fxCleanups.push(() => window.removeEventListener('blur', scheduleBlurArbitration));
    rt.fxCleanups.push(() => window.removeEventListener('focus', wakeFromFocusOrHover));
    rt.fxCleanups.push(() => window.removeEventListener('mouseenter', wakeFromFocusOrHover));
    rt.fxCleanups.push(() => document.removeEventListener('visibilitychange', onVis));

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
    const st = getState();
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
        font-family: 'Segoe UI', Inter, system-ui, -apple-system, sans-serif;
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
        bottom: 10px;
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
    const st = stOverride || getState();
    const activeBubbleKey = st.bubbleName || st.themeName || DEFAULT_THEME_KEY;
    const bTheme = bubbleThemeOverride || THEMES[activeBubbleKey] || THEMES[DEFAULT_THEME_KEY] || {};
    if (st.inputStyle === 'minimal' || !bTheme.isChibiNpc) {
      teardownShinobuNpc();
      return;
    }

    ensureShinobuNpcStyles();
    const rt = getShinobuRuntime();
    const prof = getActiveNpcProfile(bTheme);
    const persona = getActiveMasterPersona(st);
    const personaOverrideActive = st.masterPersona && st.masterPersona !== 'yoriichi';

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
          const curSt = getState();
          const curPersona = getActiveMasterPersona(curSt);
          const skillCharId = curPersona.skillId || 'yoriichi';
          const actSticker = (curSt.masterPersona && curSt.masterPersona !== 'yoriichi')
            ? curPersona.actionSticker
            : (bTheme.userActionSticker || curPersona.actionSticker);
          if (window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.castSkill === 'function') {
            rt.yoriBubbleCombo = ((rt.yoriBubbleCombo || 0) + 1) % 4;
            window.__AGY_KNY_SKILLS__.castSkill(skillCharId, rt.yoriBubbleCombo, {
              charId: skillCharId,
              originRect: e.currentTarget.getBoundingClientRect(),
              sourceFrameEl: frame,
              composerEl: frame,
              actionSticker: actSticker
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
      composer.addEventListener('keydown', (e) => {
        if (e.target && e.target.closest && e.target.closest('#agy-shinobu-npc-wrap')) return;
        const now = Date.now();
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          setTimeout(() => {
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
      }, true);
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
        (personaOverrideActive ? persona.userAvatar : (bTheme.userAvatar || persona.userAvatar)) || ''
      );

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
            <span class="agy-npc-user-av" style="${safeNpcUserAv ? `background-image: url(&quot;${safeNpcUserAv}&quot;);` : ''} border-color: ${SEC.sanitizeCssValue(persona.ringColor, '#fde047')};"></span>
            <div class="agy-npc-user-col">
              <span class="agy-npc-user-tag" style="color: ${SEC.sanitizeCssValue(persona.ringColor, '#fde047')};">${safePersonaTag}</span>
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
          if (evtName === 'keydown' && e.key === 'Escape') {
            rt.npcChatOpen = false;
            syncChatVisibility(false);
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
      try {
        window.__AGY_KNY_CHIBI_AURA__.mountChibiAura(composer, bTheme, charHint);
        window.__AGY_KNY_CHIBI_AURA__.mountSkillTriggerUi(composer, wrap, bTheme, charHint, (skill, _idx, castOpts) => {
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

    if (!rt.remindTimer) {
      rt.remindTimer = setInterval(() => {
        if (!document.hidden && !rt.npcCollapsed) {
          const curProf = getActiveNpcProfile();
          speakShinobuLine(pickRandomLine('remind', '', curProf), false);
        }
      }, 180000);
    }
  }

  function syncTokenHud() {
    const composer = document.querySelector('.surface-composer') || document.querySelector('[data-testid="composer"]');
    if (!composer || !window.__AGY_TOKEN_HUD__ || typeof window.__AGY_TOKEN_HUD__.mountTokenHud !== 'function') {
      return;
    }
    const st = getState();
    const activeKey = st.bubbleName || st.themeName || DEFAULT_THEME_KEY;
    const bTheme = THEMES[activeKey] || THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    try {
      window.__AGY_TOKEN_HUD__.mountTokenHud(composer, bTheme, activeKey);
    } catch (_) {}

    // Make user's Yoriichi avatar beside chat bubbles clickable to unleash Primordial Sun Breathing!
    document.querySelectorAll('[data-testid="user-message"]').forEach((um) => {
      if (um.querySelector(':scope > .agy-yoriichi-msg-hit')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agy-yoriichi-msg-hit';
      btn.innerHTML = '<i aria-hidden="true"></i>';
      btn.title = 'Khai Tổ Vũ Điệu Hỏa Thần — Nhấn để khai mở Nhật Chi Hô Hấp!';
      btn.setAttribute('aria-label', btn.title);
      btn.style.cssText = 'position:absolute;right:0;bottom:6px;width:34px;height:34px;border-radius:50%;background:transparent;border:none;cursor:pointer;z-index:5;padding:0;';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (window.__AGY_TOKEN_HUD__ && typeof window.__AGY_TOKEN_HUD__.castYoriichiSunBreathing === 'function') {
          window.__AGY_TOKEN_HUD__.castYoriichiSunBreathing(btn);
        }
      });
      um.appendChild(btn);
    });
  }

  function tick() {
    injectMainSidebarButton();
    injectSettingsModalButton();
    hookSidebarScroll();
    hookShellMetrics();
    syncLiveWallpaperFx();
    syncShinobuNpc();
    syncTokenHud();
  }

  function scheduleTick() {
    if (window.__AGY_TICK_RAF__) return;
    window.__AGY_TICK_RAF__ = requestAnimationFrame(() => {
      window.__AGY_TICK_RAF__ = 0;
      tick();
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
  window.__AGY_SCROLL_AC__ = new AbortController();
  bindTransparentWorldListeners(window.__AGY_SCROLL_AC__.signal);
  window.addEventListener('load', () => scheduleTitleBarSync(), { signal: window.__AGY_SCROLL_AC__.signal });
  window.addEventListener('focus', () => syncTitleBarOverlay(), { signal: window.__AGY_SCROLL_AC__.signal });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncTitleBarOverlay();
  }, { signal: window.__AGY_SCROLL_AC__.signal });
  document.querySelectorAll('[data-agy-scroll-bound]').forEach(el => delete el.dataset.agyScrollBound);
  document.querySelectorAll('[data-agy-tbo-mounted]').forEach(el => delete el.dataset.agyTboMounted);
  const staleBackdrop = document.getElementById('agy-custom-theme-modal-backdrop');
  if (staleBackdrop) staleBackdrop.remove();
  const staleSidebarBtn = document.getElementById('agy-custom-theme-sidebar-btn');
  if (staleSidebarBtn) staleSidebarBtn.remove();
  const staleSettingsBtn = document.getElementById('agy-custom-theme-settings-btn');
  if (staleSettingsBtn) staleSettingsBtn.remove();
  try { teardownLiveWallpaperFx(); } catch (e) {}
  try { teardownShinobuNpc(); } catch (e) {}
  try { document.querySelectorAll('.agy-yoriichi-msg-hit').forEach(el => el.remove()); } catch (e) {}
  try { if (window.__AGY_TOKEN_HUD__ && typeof window.__AGY_TOKEN_HUD__.teardown === 'function') window.__AGY_TOKEN_HUD__.teardown(); } catch (e) {}
  try { if (window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.stopActiveSkill === 'function') window.__AGY_KNY_SKILLS__.stopActiveSkill(); } catch (e) {}

  window.__AGY_HOLE_EL__ = null;
  if (window.__AGY_MODAL_OBSERVER__) {
    window.__AGY_MODAL_OBSERVER__.disconnect();
  }
  window.__AGY_MODAL_OBSERVER__ = new MutationObserver(scheduleTick);
  window.__AGY_MODAL_OBSERVER__.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-has-browser-hole', 'data-browser-hole']
  });
  tick();

  return 'Antigravity Custom Theme Engine Ready!';
})();
