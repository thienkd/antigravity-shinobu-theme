(() => {
  const THEMES = /*__THEMES_PLACEHOLDER__*/{};

  function resolveThemeAssetUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (
      !trimmed ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }
    const base = window.__AGY_ASSET_BASE__ || './themes/';
    return base.replace(/\/?$/, '/') + trimmed.replace(/^\/+/, '');
  }

  Object.values(THEMES).forEach((cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    ['wallpaper', 'sticker', 'actionSticker', 'userActionSticker', 'cornerSvg', 'userAvatar', 'agentAvatar'].forEach((k) => {
      if (typeof cfg[k] === 'string' && cfg[k]) {
        cfg[k] = resolveThemeAssetUrl(cfg[k]);
      }
    });
  });

  const THEME_KEYS = Object.keys(THEMES);
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

  function getState() {
    const init = window.__AGY_INITIAL_CONFIG__ || {};
    const rawTheme = localStorage.getItem(STORAGE_THEME) || init.themeName || DEFAULT_THEME_KEY;
    const themeName = THEMES[rawTheme] ? rawTheme : DEFAULT_THEME_KEY;
    const rawBubble = localStorage.getItem(STORAGE_BUBBLE) || init.bubbleName || themeName;
    const bubbleName = THEMES[rawBubble] ? rawBubble : themeName;
    const inputStyle = localStorage.getItem(STORAGE_INPUT) || init.inputStyle || 'sync';
    const presetDefaultDim = THEMES[themeName]?.defaultDimming !== undefined ? THEMES[themeName].defaultDimming : 69;
    const dimming = parseInt(localStorage.getItem(STORAGE_DIMMING) || (init.dimming !== undefined ? init.dimming : String(presetDefaultDim)), 10);
    const wpEnabled = localStorage.getItem(STORAGE_WP_ENABLED) !== null
      ? localStorage.getItem(STORAGE_WP_ENABLED) !== 'false'
      : (init.wpEnabled !== undefined ? init.wpEnabled : true);
    const customWp = localStorage.getItem(STORAGE_CUSTOM_WP) || init.customWp || '';
    const userAvatar = localStorage.getItem(STORAGE_USER_AVATAR) ?? init.userAvatar ?? '';
    const agentAvatar = localStorage.getItem(STORAGE_AGENT_AVATAR) ?? init.agentAvatar ?? '';
    const rawBlur = localStorage.getItem(STORAGE_GLASS_BLUR) ?? init.glassBlur;
    const glassBlur = rawBlur !== undefined && rawBlur !== null && rawBlur !== '' ? parseInt(rawBlur, 10) : 0;
    const rawAvSize = localStorage.getItem(STORAGE_AVATAR_SIZE) ?? init.avatarSize;
    const avatarSize = rawAvSize !== undefined && rawAvSize !== null && rawAvSize !== '' ? parseInt(rawAvSize, 10) : 32;
    const rawAvRad = localStorage.getItem(STORAGE_AVATAR_RADIUS) ?? init.avatarRadius;
    const avatarRadius = rawAvRad !== undefined && rawAvRad !== null && rawAvRad !== '' ? parseInt(rawAvRad, 10) : 50;
    return { themeName, bubbleName, inputStyle, dimming, wpEnabled, customWp, userAvatar, agentAvatar, glassBlur, avatarSize, avatarRadius };
  }

  // Downscale user/agent avatar uploads to 192x192 WebP once so theme_config.json stays tiny
  function compressAvatarFile(file, callback) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 192;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const natW = img.naturalWidth || size;
          const natH = img.naturalHeight || size;
          const side = Math.min(natW, natH);
          const sx = Math.max(0, Math.floor((natW - side) / 2));
          const sy = Math.max(0, Math.floor((natH - side) / 2));
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          const out = canvas.toDataURL('image/webp', 0.88);
          callback(out && out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/png'));
        } catch (e) {
          callback(String(reader.result || ''));
        }
      };
      img.onerror = () => callback(String(reader.result || ''));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  // Pre-bake L-shaped header/sidebar glass blur once per theme/dimming change to avoid per-frame GPU backdrop readback
  function syncPrebakedGlass(wpUrl, overlayRgb, overlayAlpha, tintBg, blurStr) {
    const shell = document.querySelector('.agy-shell');
    const pxMatch = String(blurStr !== undefined ? blurStr : '0px').match(/(\d+(?:\.\d+)?)/);
    const rawBlurNum = pxMatch ? parseFloat(pxMatch[1]) : 0;
    if (!wpUrl || rawBlurNum <= 0.2) {
      if (shell) shell.style.removeProperty('--agy-l-glass-bg');
      return;
    }
    const key = `${wpUrl.slice(0, 64)}|${wpUrl.length}|${overlayRgb}|${overlayAlpha.toFixed(3)}|${tintBg}|${blurStr}`;
    window.__AGY_BLUR_CACHE__ = window.__AGY_BLUR_CACHE__ || {};
    const cached = window.__AGY_BLUR_CACHE__[key];
    if (cached) {
      if (shell) shell.style.setProperty('--agy-l-glass-bg', 'url("' + cached + '")');
      return;
    }
    const img = new Image();
    if (/^https?:\/\//i.test(wpUrl)) {
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
        const baked = canvas.toDataURL('image/webp', 0.92);
        window.__AGY_BLUR_CACHE__[key] = baked;
        const curShell = document.querySelector('.agy-shell');
        if (curShell) curShell.style.setProperty('--agy-l-glass-bg', 'url("' + baked + '")');
      } catch (e) {}
    };
    img.src = wpUrl;
  }

  function applyTheme(overrides = {}) {
    const st = { ...getState(), ...overrides };
    try {
      localStorage.setItem(STORAGE_THEME, st.themeName);
      localStorage.setItem(STORAGE_BUBBLE, st.bubbleName);
      localStorage.setItem(STORAGE_INPUT, st.inputStyle);
      localStorage.setItem(STORAGE_DIMMING, String(st.dimming));
      localStorage.setItem(STORAGE_WP_ENABLED, String(st.wpEnabled));
      if (overrides.customWp !== undefined) {
        localStorage.setItem(STORAGE_CUSTOM_WP, overrides.customWp);
      }
      if (overrides.userAvatar !== undefined) {
        localStorage.setItem(STORAGE_USER_AVATAR, overrides.userAvatar);
      }
      if (overrides.agentAvatar !== undefined) {
        localStorage.setItem(STORAGE_AGENT_AVATAR, overrides.agentAvatar);
      }
      if (overrides.glassBlur !== undefined) {
        localStorage.setItem(STORAGE_GLASS_BLUR, String(overrides.glassBlur));
      }
      if (overrides.avatarSize !== undefined) {
        localStorage.setItem(STORAGE_AVATAR_SIZE, String(overrides.avatarSize));
      }
      if (overrides.avatarRadius !== undefined) {
        localStorage.setItem(STORAGE_AVATAR_RADIUS, String(overrides.avatarRadius));
      }
    } catch (e) {}

    if (window.agySaveThemeConfig) {
      try {
        window.agySaveThemeConfig(JSON.stringify(st));
      } catch (e) {}
    }

    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY];
    const bubbleTheme = THEMES[st.bubbleName] || mainTheme;
    const wpUrl = st.customWp || mainTheme.wallpaper || '';

    const oldLegacy = document.getElementById('antigravity-ho-ly-chibi-theme');
    if (oldLegacy) oldLegacy.remove();

    let styleEl = document.getElementById('antigravity-custom-theme-active');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'antigravity-custom-theme-active';
      document.head.appendChild(styleEl);
    }

    const overlayAlpha = mainTheme.clearBackdrop
      ? Math.min(0.92, Math.max(0.0, ((st.dimming - 10) / 82) * 0.85))
      : Math.min(0.92, Math.max(0.12, (st.dimming / 100) * 0.78));
    const overlayRgb = mainTheme.overlayRgb || '10, 7, 6';
    const bgPosition = mainTheme.bgPosition || 'center center';
    const secondaryGlowStop = mainTheme.secondaryGlow
      ? `, radial-gradient(circle at 22% 72%, ${mainTheme.secondaryGlow} 0%, transparent 55%)`
      : '';

    let bgLayers = '';
    if (wpUrl) {
      bgLayers = mainTheme.clearBackdrop
        ? `linear-gradient(180deg, rgba(${overlayRgb}, ${overlayAlpha}) 0%, rgba(${overlayRgb}, ${overlayAlpha}) 100%), url("${wpUrl}")`
        : `radial-gradient(circle at 75% 40%, ${mainTheme.glow} 0%, transparent 65%)${secondaryGlowStop}, linear-gradient(180deg, rgba(${overlayRgb}, ${overlayAlpha * 0.85}) 0%, rgba(${overlayRgb}, ${overlayAlpha}) 100%), url("${wpUrl}")`;
    } else {
      bgLayers = mainTheme.pureBg || `radial-gradient(circle at 75% 30%, ${mainTheme.glow} 0%, transparent 60%), linear-gradient(160deg, rgba(${overlayRgb}, 0.96) 0%, #070910 100%)`;
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

    const defaultCornerSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M2 20 L2 6 Q2 2 6 2 L20 2' stroke='%23fbbf24' stroke-width='1.5' fill='none' opacity='0.65'/%3E%3Ccircle cx='6' cy='6' r='2' fill='%23fbbf24' opacity='0.75'/%3E%3C/svg%3E";
    const cornerFiligreeUrl = bubbleTheme.cornerSvg || defaultCornerSvg;

    const bubblePadTop = Math.max(18, Math.abs(bubbleTheme.stickerTop || 0) + 8);
    const bubbleStickerCss = bubbleTheme.sticker ? (bubbleTheme.isOrnament ? `
      .group\\/user-input-step {
        padding-top: ${bubbleTheme.isChibiNpc ? bubblePadTop : 18}px !important;
        overflow: visible !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${bubbleTheme.stickerTop}px;
        right: ${bubbleTheme.stickerRight}px;
        width: ${bubbleTheme.stickerW}px;
        height: ${bubbleTheme.stickerH}px;
        background-image: url("${bubbleTheme.sticker}");
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
        padding-top: ${Math.max(36, Math.abs(bubbleTheme.stickerTop) + 8)}px !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${bubbleTheme.stickerTop}px;
        right: ${bubbleTheme.stickerRight}px;
        width: ${bubbleTheme.stickerW}px;
        height: ${bubbleTheme.stickerH}px;
        background-image: url("${bubbleTheme.sticker}");
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

    const showInputSticker = st.inputStyle !== 'minimal' && bubbleTheme.sticker;
    const composerMarginTop = Math.max(16, Math.abs(bubbleTheme.stickerTop || 0) + 8);
    const inputStickerCss = showInputSticker ? (bubbleTheme.isOrnament ? `
      .surface-composer {
        margin-top: ${bubbleTheme.isChibiNpc ? composerMarginTop : 16}px !important;
        overflow: visible !important;
      }
      .surface-composer::before {
        content: "";
        position: absolute;
        top: ${bubbleTheme.stickerTop}px;
        right: ${bubbleTheme.isChibiNpc ? (bubbleTheme.stickerRight ?? 10) : 16}px;
        width: ${bubbleTheme.isChibiNpc ? bubbleTheme.stickerW : (bubbleTheme.stickerW + 8)}px;
        height: ${bubbleTheme.isChibiNpc ? bubbleTheme.stickerH : (bubbleTheme.stickerH + 2)}px;
        background-image: url("${bubbleTheme.sticker}");
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
        top: ${bubbleTheme.stickerTop - 4}px;
        right: 16px;
        width: ${bubbleTheme.stickerW + 6}px;
        height: ${bubbleTheme.stickerH + 6}px;
        background-image: url("${bubbleTheme.sticker}");
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
        ? (bubbleTheme.inputGlassBg || 'rgba(20, 15, 13, 0.52)')
        : st.inputStyle === 'double_gold'
        ? 'linear-gradient(145deg, rgba(44, 28, 20, 0.90) 0%, rgba(24, 15, 12, 0.92) 100%)'
        : (bubbleTheme.inputCardBg || 'rgba(28, 19, 16, 0.88)');

    const inputOuterBorder =
      st.inputStyle === 'double_gold'
        ? 'linear-gradient(135deg, #f59e0b 0%, rgba(217, 119, 6, 0.35) 50%, #fbbf24 100%)'
        : bubbleTheme.frameBg;

    const sidebarBg = mainTheme.sidebarBg || 'rgba(14, 10, 8, 0.68)';
    const sidebarHoverBg = mainTheme.sidebarHoverBg || 'rgba(255, 255, 255, 0.08)';
    const btnBg = mainTheme.btnBg || 'rgba(48, 30, 22, 0.62)';
    const modalBg = mainTheme.modalBg || 'rgba(14, 12, 12, 0.96)';
    const innerBubbleBorder = bubbleTheme.isScroll
      ? '2px solid #78350f'
      : (bubbleTheme.innerBorder || '1px solid rgba(255, 255, 255, 0.06)');

    const isLight = Boolean(mainTheme.isLight);
    const uiInk = mainTheme.uiTextColor || (isLight ? '#0f172a' : 'rgba(248, 250, 252, 0.96)');
    const uiMutedInk = mainTheme.uiMutedColor || (isLight ? '#334155' : 'rgba(241, 245, 249, 0.92)');
    const uiShadow = isLight ? 'none' : '0 1px 4px rgba(0, 0, 0, 0.92), 0 0 8px rgba(0, 0, 0, 0.68)';
    const pillBg = mainTheme.pillBg || (isLight ? 'rgba(255, 255, 255, 0.78)' : 'rgba(6, 11, 24, 0.78)');
    const pillHoverBg = mainTheme.pillHoverBg || (isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(10, 18, 38, 0.92)');
    const pillText = mainTheme.pillTextColor || (isLight ? '#0f172a' : '#f8fafc');
    const pillBorder = mainTheme.pillBorder || (isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.16)');
    const preCodeBg = isLight ? `rgba(${overlayRgb}, 0.72)` : `rgba(${overlayRgb}, 0.56)`;

    const effectiveUserAvatar = st.userAvatar === 'none' ? '' : (st.userAvatar || mainTheme.userAvatar || '');
    const effectiveAgentAvatar = st.agentAvatar === 'none' ? '' : (st.agentAvatar || mainTheme.agentAvatar || '');
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
        border: 1.8px solid #fde047;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.55), 0 0 12px rgba(239, 68, 68, 0.52);
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
        border: 1.5px solid ${mainTheme.secondary || mainTheme.primary};
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4), 0 0 8px ${mainTheme.secondaryGlow || mainTheme.glow};
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

    const aiCardCss = mainTheme.aiCardBg ? `
      /* Translucent reading card for AI responses (zero live backdrop-filter for max 120fps scroll) */
      .agy-shell [data-testid="agent-response"] {
        background: ${mainTheme.aiCardBg} !important;
        ${isLight ? `color: ${uiInk} !important;` : ''}
        backdrop-filter: none !important;
        border: 1px solid ${mainTheme.aiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.1)')} !important;
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
      const effectiveBlur = Number.isFinite(st.glassBlur) ? `${st.glassBlur}px` : (mainTheme.headerBlur || '3px');
      syncPrebakedGlass(wpUrl, overlayRgb, overlayAlpha, mainTheme.headerBg || '', effectiveBlur);
    } else {
      syncPrebakedGlass(null);
    }

    const sidePanelCss = st.wpEnabled ? `
      /* Keep right-side Artifact / Text / Diff split panels crystal-clear over native 4K backdrop (never cover right character with blurred canvas) */
      body:not([data-has-browser-hole="true"]) .agy-shell [data-side-panel-body="true"]:not([data-has-browser-hole="true"]):not(:has([data-browser-hole]:not([data-browser-hole="false"]))) {
        background: ${mainTheme.aiCardBg || `rgba(${overlayRgb}, 0.72)`} !important;
        ${isLight ? `color: ${uiInk} !important;` : ''}
        backdrop-filter: none !important;
        border-left: 1px solid ${mainTheme.aiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)')} !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      }
      body:not([data-has-browser-hole="true"]) .agy-shell [data-side-panel-body="true"]:not([data-has-browser-hole="true"]):not(:has([data-browser-hole]:not([data-browser-hole="false"]))) pre {
        background: ${preCodeBg} !important;
        border: 1px solid ${mainTheme.aiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)')} !important;
        border-radius: 10px !important;
      }
      .agy-shell [data-side-panel-body="true"] :is(h1, h2, h3, h4) {
        ${isLight ? `color: ${uiInk} !important;` : ''}
        text-shadow: ${isLight ? 'none' : '0 1px 6px rgba(0, 0, 0, 0.85)'};
      }
    ` : '';

    const headerCss = mainTheme.headerBg ? `
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
        background-color: ${mainTheme.headerBg};
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
        border-bottom: 1px solid ${mainTheme.headerBorder || 'rgba(56, 189, 248, 0.10)'} !important;
      }
      ` : `
      .agy-shell [class*="@container/titlebar"] {
        background: ${mainTheme.headerBg} !important;
        backdrop-filter: none !important;
        border-bottom: 1px solid ${mainTheme.headerBorder || 'rgba(56, 189, 248, 0.15)'} !important;
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
        border-color: ${mainTheme.borderColor} !important;
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
        border-color: ${mainTheme.borderColor} !important;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3) !important;
      }

      /* User Chat Bubble Double-Border Frame & Ornament */
      .agy-user-bubble-frame {
        background: ${bubbleTheme.frameBg} !important;
        border-radius: ${bubbleTheme.isScroll ? '6px' : '14px'} !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45), 0 0 12px ${bubbleTheme.glow} !important;
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
        height: ${bubbleTheme.isOrnament ? '16px' : '14px'};
        background-image: url("${cornerFiligreeUrl}");
        background-size: contain;
        background-repeat: no-repeat;
        pointer-events: none;
        opacity: ${bubbleTheme.isOrnament ? '0.85' : '0.65'};
      }

      .agy-user-bubble {
        background: ${bubbleTheme.bg} !important;
        border-radius: ${bubbleTheme.isScroll ? '5px' : '13px'} !important;
        padding: 8px 16px !important;
        color: ${bubbleTheme.textColor} !important;
        border: ${innerBubbleBorder} !important;
        overflow: visible !important;
        font-weight: 450 !important;
      }

      .agy-user-bubble * {
        color: ${bubbleTheme.textColor} !important;
      }

      /* Double-Border Input Composer */
      .surface-composer {
        background: ${inputOuterBorder} !important;
        border-radius: 16px !important;
        padding: 1.5px !important;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5), 0 0 14px ${bubbleTheme.glow} !important;
        position: relative !important;
      }

      .surface-composer-card {
        background: ${inputCardBg} !important;
        backdrop-filter: none !important;
        border-radius: 14.5px !important;
        border: ${bubbleTheme.innerBorder || '1px solid rgba(255, 255, 255, 0.07)'} !important;
      }

      ${bubbleTheme.composerHeaderBg ? `
      .surface-composer > :first-child:not(.surface-composer-card):not(.agy-shinobu-npc-wrap):not(.agy-chibi-hitbox):not(#agy-token-context-bar):not(#agy-yoriichi-msg-echo):not(#agy-chibi-skill-bar):not(agy-chibi-aura) {
        background: ${bubbleTheme.composerHeaderBg} !important;
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
        border-color: ${mainTheme.borderColor} !important;
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
        border: 1px solid ${mainTheme.borderColor} !important;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.75), 0 0 24px ${mainTheme.glow} !important;
        backdrop-filter: none !important;
      }

      #agy-custom-theme-modal-dialog {
        background: ${modalBg} !important;
        border-color: ${mainTheme.borderColor} !important;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.9), 0 0 32px ${mainTheme.glow} !important;
      }
      #agy-custom-theme-modal-header {
        background: ${mainTheme.modalHeaderBg || 'rgba(22, 16, 14, 0.85)'} !important;
      }
      #agy-custom-theme-badge {
        color: ${mainTheme.primary} !important;
        border-color: ${mainTheme.borderColor} !important;
        background: ${mainTheme.glow} !important;
      }
      #agy-custom-theme-sidebar-btn svg {
        color: ${mainTheme.primary} !important;
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
    const body = backdrop.querySelector('#agy-theme-modal-body');
    renderThemePanels(body);
  }

  function renderThemePanels(container) {
    const st = getState();
    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY];
    const effUserAv = st.userAvatar === 'none' ? '' : (st.userAvatar || mainTheme.userAvatar || '');
    const effAgentAv = st.agentAvatar === 'none' ? '' : (st.agentAvatar || mainTheme.agentAvatar || '');

    container.innerHTML = `
      <div id="agy-theme-scroll-container" style="padding: 24px 32px 48px 32px; max-width: 860px; margin: 0 auto; overflow-y: auto; height: 100%; color: #f4f4f5;">
        <div style="border: 1px solid ${mainTheme.borderColor}; background: ${mainTheme.cardBg || 'rgba(22, 16, 14, 0.72)'}; border-radius: 12px; padding: 16px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 600; color: #f4f4f5; margin-bottom: 2px;">Wallpaper, Pre-Baked Blur & Config</div>
              <div style="font-size: 12.5px; color: #a1a1aa;">Balance artwork clarity, 120fps pre-baked frosted glass blur, or share config JSON.</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-wp-toggle" type="checkbox" ${st.wpEnabled ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                Backdrop
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Dim
                <input id="agy-dim-slider" type="range" min="15" max="92" value="${st.dimming}" style="width: 96px; cursor: pointer; accent-color: #ffffff; height: 5px;" />
                <span id="agy-dim-val" style="min-width: 32px; text-align: right;">${st.dimming}%</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Blur
                <input id="agy-blur-slider" type="range" min="0" max="16" value="${st.glassBlur}" style="width: 78px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
                <span id="agy-blur-val" style="min-width: 30px; text-align: right;">${st.glassBlur}px</span>
              </label>
              <label style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Custom Image
                <input id="agy-wp-upload" type="file" accept="image/*" style="display: none;" />
              </label>
              <button id="agy-export-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Export JSON
              </button>
              <button id="agy-import-toggle" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Import JSON
              </button>
              <button id="agy-reset-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Reset
              </button>
            </div>
          </div>
          <div id="agy-import-box" style="display: none; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
            <textarea id="agy-import-text" rows="3" placeholder='Paste exported theme config JSON here (e.g. {"themeName":"WLOP Cosmic","dimming":45,...})' style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); color: #f4f4f5; border: 1px solid ${mainTheme.borderColor}; border-radius: 8px; padding: 8px 10px; font-family: monospace; font-size: 12px; resize: vertical;"></textarea>
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
              <span id="agy-import-msg" style="font-size: 12px; color: #fca5a5;"></span>
              <button id="agy-import-apply" type="button" style="padding: 5px 12px; border-radius: 7px; background: ${mainTheme.primary}; color: #090d16; font-weight: 600; font-size: 12px; border: none; cursor: pointer;">Apply JSON</button>
            </div>
          </div>
        </div>

        <div style="border: 1px solid ${mainTheme.borderColor}; background: ${mainTheme.cardBg || 'rgba(22, 16, 14, 0.72)'}; border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size: 14px; font-weight: 600; color: #f4f4f5; margin-bottom: 2px;">Chat Avatars (User & AI Agent)</div>
              <div style="font-size: 12px; color: #a1a1aa;">Profile badges rendered beside chat messages (auto-compressed WebP).</div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-user-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${mainTheme.primary}; background: rgba(255,255,255,0.06) ${effUserAv ? `url('${effUserAv}') center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effUserAv ? '' : 'U'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  User
                  <input id="agy-user-av-upload" type="file" accept="image/*" style="display: none;" />
                </label>
                <button id="agy-user-av-clear" type="button" style="padding: 4px 8px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer;">Off</button>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-agent-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${mainTheme.secondary || mainTheme.primary}; background: rgba(255,255,255,0.06) ${effAgentAv ? `url('${effAgentAv}') center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effAgentAv ? '' : 'AI'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  Agent
                  <input id="agy-agent-av-upload" type="file" accept="image/*" style="display: none;" />
                </label>
                <button id="agy-agent-av-clear" type="button" style="padding: 4px 8px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer;">Off</button>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.07);">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Size
              <input id="agy-av-size" type="range" min="22" max="52" value="${st.avatarSize}" style="width: 100px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
              <span id="agy-av-size-val" style="min-width: 34px;">${st.avatarSize}px</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Corner Radius
              <input id="agy-av-rad" type="range" min="0" max="50" value="${st.avatarRadius}" style="width: 100px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
              <span id="agy-av-rad-val" style="min-width: 34px;">${st.avatarRadius}%</span>
            </label>
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">User Chat Bubble</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Mix and match bubble frame & ornament independently from the active wallpaper.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${THEME_KEYS.map(name => {
              const th = THEMES[name];
              const isSelected = name === st.bubbleName;
              const stickerTop = th.isOrnament ? Math.round((th.stickerTop || 0) * 0.85) : Math.round((th.stickerTop || 0) * 0.74);
              const stickerW = Math.round((th.stickerW || 0) * 0.78);
              const stickerH = th.isOrnament ? Math.round((th.stickerH || 0) * 0.8) : Math.round((th.stickerH || 0) * 0.78);
              return `
                <div class="agy-bubble-card" data-name="${name}" style="position: relative; border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 24px 18px 14px 18px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; min-height: 112px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-top: 6px; margin-bottom: 10px;">
                    <div style="position: relative; width: 192px; height: 46px; padding: 1.2px; border-radius: ${th.isScroll ? '6px' : '12px'}; background: ${th.frameBg}; box-shadow: 0 4px 14px rgba(0,0,0,0.45), 0 0 10px ${th.glow};">
                      <div style="position: relative; width: 100%; height: 100%; background: ${th.bg}; border: ${th.innerBorder || '1px solid ' + th.borderColor}; border-radius: ${th.isScroll ? '4px' : '11px'}; display: flex; align-items: center; padding: 0 16px;">
                        ${th.sticker ? `<div style="position: absolute; top: ${stickerTop}px; right: 8px; width: ${stickerW}px; height: ${stickerH}px; background-image: url('${th.sticker}'); background-size: contain; background-position: ${th.isOrnament ? 'center' : 'bottom center'}; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                        <span style="font-size: 13.5px; font-weight: 500; color: ${th.textColor};">Hello ✨</span>
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${name}</span>
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
              const previewInnerBg = key === 'glass'
                ? (activeBubbleTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
                : (activeBubbleTh.inputCardBg || 'rgba(26, 18, 15, 0.92)');
              return `
                <div class="agy-input-card" data-style="${key}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 16px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div class="agy-input-preview-outer" style="position: relative; margin-top: 8px; padding: 1.5px; border-radius: 10px; background: ${key === 'double_gold' ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : activeBubbleTh.frameBg};">
                    <div class="agy-input-preview-sticker" style="position: absolute; ${previewStickerStyle} background-image: url('${activeBubbleTh.sticker || ''}'); background-size: contain; background-repeat: no-repeat; display: ${key !== 'minimal' && activeBubbleTh.sticker ? 'block' : 'none'}; pointer-events: none;"></div>
                    <div class="agy-input-preview-inner" style="background: ${previewInnerBg}; border-radius: 9px; padding: 8px 12px; font-size: 12px; color: #a1a1aa; display: flex; justify-content: space-between; align-items: center;">
                      <span>Ask anything, @ to mention...</span>
                      <span class="agy-input-preview-turbo" style="color: ${activeBubbleTh.primary}; font-size: 11px;">Send →</span>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${item.label}</div>
                      <div style="font-size: 11.5px; color: #a1a1aa;">${item.desc}</div>
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
              <div style="font-size: 12.5px; color: #a1a1aa;">Bộ sưu tập Thanh Gươm Diệt Quỷ (Gia Đình Chúa Công, Cửu Trụ &amp; Bộ Tứ Chính) — 60fps Live Glass &amp; NPC.</div>
            </div>
            <div id="agy-preset-filter-bar" style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button type="button" class="agy-filter-chip" data-filter="all" style="padding: 4px 10px; border-radius: 999px; border: 1px solid ${mainTheme.primary}; background: rgba(255,255,255,0.12); color: #fff; font-size: 11.5px; font-weight: 600; cursor: pointer;">Tất cả (${THEME_KEYS.length})</button>
              <button type="button" class="agy-filter-chip" data-filter="royal" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(250,204,21,0.45); background: rgba(250,204,21,0.12); color: #fef08a; font-size: 11.5px; font-weight: 600; cursor: pointer;">👑 Chúa Công</button>
              <button type="button" class="agy-filter-chip" data-filter="hashira" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 11.5px; cursor: pointer;">⚔️ Cửu Trụ (9)</button>
              <button type="button" class="agy-filter-chip" data-filter="kamaboko" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 11.5px; cursor: pointer;">🔥 Nhân Vật Chính</button>
              <button type="button" class="agy-filter-chip" data-filter="classic" style="padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e4e4e7; font-size: 11.5px; cursor: pointer;">✨ Khác</button>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${THEME_KEYS.map(name => {
              const th = THEMES[name];
              const isSelected = name === st.themeName;
              const isRoyal = th.fxMode === 'royal_wisteria' || /Chúa Công|Ubuyashiki/i.test(name);
              const groupTag = isRoyal ? 'royal' : (/Trụ|Shinobu/i.test(name) ? 'hashira' : (/(Tanjiro|Nezuko|Zenitsu|Inosuke)/i.test(name) ? 'kamaboko' : 'classic'));
              const thumbBg = th.wallpaper
                ? `linear-gradient(180deg, rgba(0,0,0,0.10), rgba(10,8,18,0.86)), url('${th.wallpaper}')`
                : (th.pureBg || th.bg);
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
                <div class="agy-preset-card" data-name="${name}" data-group="${groupTag}" style="border-radius: 12px; border: ${borderStyle}; background: ${isRoyal ? 'linear-gradient(145deg, rgba(32, 18, 52, 0.92), rgba(18, 12, 32, 0.94))' : 'rgba(14, 12, 18, 0.84)'}; ${cardShadow} overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color 0.15s ease, transform 0.15s ease;">
                  <div style="height: 78px; width: 100%; background-image: ${thumbBg}; background-size: cover; background-position: ${th.bgPosition || 'center'}; position: relative; display: flex; align-items: flex-end; padding: 8px 14px;">
                    ${isRoyal ? `<span style="position:absolute; top:7px; left:10px; padding:2px 8px; border-radius:999px; background:linear-gradient(90deg, rgba(250,204,21,0.92), rgba(232,121,249,0.88)); color:#180d2c; font-size:10px; font-weight:800; letter-spacing:0.2px;">★ ĐẶC BIỆT</span>` : ''}
                    ${th.sticker ? `<div style="position: absolute; ${thumbOrnamentStyle} background-image: url('${th.sticker}'); background-size: contain; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                    <span style="font-size: 13.5px; font-weight: 600; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,0.92); padding-right: 78px;">${name}</span>
                  </div>
                  <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <span style="font-size: 12px; color: ${isRoyal ? '#fef08a' : '#a1a1aa'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${th.concept || ''}</span>
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
      const activeTh = THEMES[bName] || THEMES[DEFAULT_THEME_KEY];
      container.querySelectorAll('.agy-input-card').forEach(card => {
        const key = card.dataset.style;
        const outer = card.querySelector('.agy-input-preview-outer');
        if (outer) {
          outer.style.background = key === 'double_gold'
            ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
            : activeTh.frameBg;
        }
        const inner = card.querySelector('.agy-input-preview-inner');
        if (inner) {
          inner.style.background = key === 'glass'
            ? (activeTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
            : (activeTh.inputCardBg || 'rgba(26, 18, 15, 0.92)');
        }
        const sticker = card.querySelector('.agy-input-preview-sticker');
        if (sticker) {
          if (key !== 'minimal' && activeTh.sticker) {
            sticker.style.display = 'block';
            sticker.style.backgroundImage = `url('${activeTh.sticker}')`;
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
          turbo.style.color = activeTh.primary;
        }
      });
    }

    const slider = container.querySelector('#agy-dim-slider');
    const valLabel = container.querySelector('#agy-dim-val');
    slider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      valLabel.textContent = v + '%';
      applyTheme({ dimming: v });
    });

    const wpToggle = container.querySelector('#agy-wp-toggle');
    wpToggle.addEventListener('change', (e) => {
      applyTheme({ wpEnabled: e.target.checked });
    });

    const wpUpload = container.querySelector('#agy-wp-upload');
    wpUpload.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyTheme({ customWp: reader.result, wpEnabled: true });
        const toggle = container.querySelector('#agy-wp-toggle');
        if (toggle) toggle.checked = true;
      };
      reader.readAsDataURL(file);
    });

    const userAvUpload = container.querySelector('#agy-user-av-upload');
    const userAvPreview = container.querySelector('#agy-user-av-preview');
    const userAvClear = container.querySelector('#agy-user-av-clear');
    const agentAvUpload = container.querySelector('#agy-agent-av-upload');
    const agentAvPreview = container.querySelector('#agy-agent-av-preview');
    const agentAvClear = container.querySelector('#agy-agent-av-clear');

    function syncAvPreview(el, url, fallbackText) {
      if (!el) return;
      if (url) {
        el.style.backgroundImage = `url("${url}")`;
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
        const v = parseInt(e.target.value, 10);
        if (blurLabel) blurLabel.textContent = v + 'px';
        applyTheme({ glassBlur: v });
      });
    }

    const avSizeSlider = container.querySelector('#agy-av-size');
    const avSizeVal = container.querySelector('#agy-av-size-val');
    if (avSizeSlider) {
      avSizeSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (avSizeVal) avSizeVal.textContent = v + 'px';
        applyTheme({ avatarSize: v });
      });
    }

    const avRadSlider = container.querySelector('#agy-av-rad');
    const avRadVal = container.querySelector('#agy-av-rad-val');
    if (avRadSlider) {
      avRadSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
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
    const importApply = container.querySelector('#agy-import-apply');
    const importMsg = container.querySelector('#agy-import-msg');

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
    if (importApply && importText) {
      importApply.addEventListener('click', () => {
        try {
          const parsed = JSON.parse(importText.value.trim());
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Config must be a JSON object');
          }
          const allowed = {};
          const keys = ['themeName', 'bubbleName', 'inputStyle', 'dimming', 'wpEnabled', 'customWp', 'userAvatar', 'agentAvatar', 'glassBlur', 'avatarSize', 'avatarRadius'];
          keys.forEach((k) => {
            if (parsed[k] !== undefined) allowed[k] = parsed[k];
          });
          applyTheme(allowed);
          renderThemePanels(container);
        } catch (err) {
          if (importMsg) importMsg.textContent = 'Invalid JSON: ' + err.message;
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
        avatarRadius: 50
      });
      const defTh = THEMES[DEFAULT_THEME_KEY] || {};
      syncAvPreview(userAvPreview, defTh.userAvatar || '', 'U');
      syncAvPreview(agentAvPreview, defTh.agentAvatar || '', 'AI');
      if (userAvPreview) userAvPreview.style.borderRadius = '50%';
      if (agentAvPreview) agentAvPreview.style.borderRadius = '50%';
      if (slider) slider.value = 69;
      if (valLabel) valLabel.textContent = '69%';
      if (blurSlider) blurSlider.value = 3;
      if (blurLabel) blurLabel.textContent = '3px';
      if (avSizeSlider) avSizeSlider.value = 32;
      if (avSizeVal) avSizeVal.textContent = '32px';
      if (avRadSlider) avRadSlider.value = 50;
      if (avRadVal) avRadVal.textContent = '50%';
      if (wpToggle) wpToggle.checked = true;

      container.querySelectorAll('.agy-preset-card').forEach(c => {
        const isSel = c.dataset.name === DEFAULT_THEME_KEY;
        c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        const slot = c.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      container.querySelectorAll('.agy-bubble-card').forEach(b => {
        const isSel = b.dataset.name === DEFAULT_THEME_KEY;
        b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
        const slot = b.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      container.querySelectorAll('.agy-input-card').forEach(c => {
        const isSel = c.dataset.style === 'sync';
        c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        c.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
        const slot = c.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      updateInputPreviews(DEFAULT_THEME_KEY);
    });

    container.querySelectorAll('.agy-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.getAttribute('data-filter') || 'all';
        container.querySelectorAll('.agy-filter-chip').forEach(ch => {
          const active = ch === chip;
          ch.style.background = active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
          ch.style.borderColor = active ? (mainTheme.primary || '#c084fc') : 'rgba(255,255,255,0.16)';
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
        const pickedTh = THEMES[name] || {};
        const nextDim = pickedTh.defaultDimming !== undefined ? pickedTh.defaultDimming : 42;
        applyTheme({ themeName: name, bubbleName: name, dimming: nextDim, customWp: '' });
        if (slider) slider.value = nextDim;
        if (valLabel) valLabel.textContent = nextDim + '%';
        if (!localStorage.getItem(STORAGE_USER_AVATAR)) {
          syncAvPreview(userAvPreview, pickedTh.userAvatar || '', 'U');
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

  function getShinobuRuntime() {
    if (!window.__AGY_SHINOBU_RT__) {
      window.__AGY_SHINOBU_RT__ = {
        fxRaf: 0,
        fxPaused: localStorage.getItem('agy_fx_paused_v1') === '1',
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
    if (host && host.parentElement === shell && rt.activeFxMode === fxMode && (rt.fxRaf || rt.fxPaused)) {
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
      if (document.hidden || viewSkipped || rt.fxPaused) return false;
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

    const onResize = () => resize();
    const onVis = () => resumeOrPause();
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    rt.fxCleanups.push(() => window.removeEventListener('resize', onResize));
    rt.fxCleanups.push(() => document.removeEventListener('visibilitychange', onVis));

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

    document.querySelectorAll('.agy-user-bubble-frame').forEach(frame => {
      let hit = frame.querySelector(':scope > .agy-chibi-hitbox');
      if (!hit) {
        hit = document.createElement('button');
        hit.type = 'button';
        hit.className = 'agy-chibi-hitbox';
        hit.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.castNextComboSkill === 'function') {
            window.__AGY_KNY_CHIBI_AURA__.castNextComboSkill({
              originEl: e.currentTarget,
              sourceFrameEl: frame,
              fromChibiClick: true
            });
            return;
          }
          triggerChibiBounce(frame);
          const composerEl = document.querySelector('.surface-composer');
          if (composerEl) triggerChibiBounce(composerEl);
          const curText = document.querySelector('#agy-shinobu-npc-wrap .agy-npc-dialog-text')?.textContent || '';
          speakShinobuLine(pickRandomLine('act1', curText), true);
        });
        frame.appendChild(hit);
      }
      hit.title = `⚡ Nhấn vào ${prof.badgeLabel || 'Chibi'} để nhảy ra thi triển Hơi Thở!`;
      hit.setAttribute('aria-label', hit.title);
    });

    const composer = document.querySelector('.surface-composer');
    if (!composer) return;

    let mainHit = composer.querySelector(':scope > .agy-chibi-hitbox');
    if (!mainHit) {
      mainHit = document.createElement('button');
      mainHit.type = 'button';
      mainHit.className = 'agy-chibi-hitbox';
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

    let wrap = document.getElementById('agy-shinobu-npc-wrap');
    if (wrap && (wrap.parentElement !== composer || rt.activeNpcKey !== activeBubbleKey)) {
      wrap.remove();
      wrap = null;
    }

    if (!wrap) {
      rt.activeNpcKey = activeBubbleKey;
      wrap = document.createElement('div');
      wrap.id = 'agy-shinobu-npc-wrap';
      wrap.className = 'agy-shinobu-npc-wrap';
      const isRoyal = bTheme.fxMode === 'royal_wisteria';
      if (isRoyal) wrap.dataset.royal = '1';

      wrap.style.setProperty('--npc-primary', bTheme.primary || '#c084fc');
      wrap.style.setProperty('--npc-secondary', bTheme.secondary || '#5eead4');
      wrap.style.setProperty('--npc-border', bTheme.borderColor || 'rgba(192, 132, 252, 0.55)');
      wrap.style.setProperty('--npc-glow', bTheme.glow || 'rgba(192, 132, 252, 0.28)');
      wrap.style.setProperty('--npc-surface', bTheme.modalBg || 'rgba(18, 13, 34, 0.95)');
      wrap.style.setProperty('--npc-title-ink', isRoyal ? '#fef08a' : '#f8fafc');

      const fxPausedInit = Boolean(rt.fxPaused);
      const pillsHtml = prof.pills.map(p =>
        `<button type="button" class="agy-npc-pill" data-npc-cat="${p.key}">${p.label}</button>`
      ).join('');

      wrap.innerHTML = `
        <button type="button" class="agy-npc-badge" title="${prof.title}">${prof.badgeLabel}</button>
        <div class="agy-npc-popover" role="region" aria-label="${prof.title}">
          <div class="agy-npc-header">
            <div class="agy-npc-title-group">
              <span class="agy-npc-dot"></span>
              <span class="agy-npc-title">${prof.title}</span>
            </div>
            <div class="agy-npc-tools">
              <button type="button" class="agy-npc-icon-btn" data-npc-act="motion" title="${fxPausedInit ? 'Phát hiệu ứng nền' : 'Tạm dừng hiệu ứng nền'}" aria-label="${fxPausedInit ? 'Phát hiệu ứng nền' : 'Tạm dừng hiệu ứng nền'}">${fxPausedInit ? '▶' : '⏸'}</button>
              <button type="button" class="agy-npc-icon-btn" data-npc-act="random" title="Đổi câu thoại ngẫu nhiên" aria-label="Đổi câu thoại ngẫu nhiên">🎲</button>
              <button type="button" class="agy-npc-icon-btn" data-npc-act="chat-toggle" title="Trò chuyện riêng" aria-label="Trò chuyện riêng">💬</button>
              <button type="button" class="agy-npc-icon-btn" data-npc-act="close" title="Thu gọn hộp thoại" aria-label="Thu gọn hộp thoại">✕</button>
            </div>
          </div>
          <div class="agy-npc-user-sent">
            <span class="agy-npc-user-av" style="background-image: url('${bTheme.userAvatar || ''}')"></span>
            <div class="agy-npc-user-col">
              <span class="agy-npc-user-tag">Khai Tổ Hỏa Thần (Anh)</span>
              <span class="agy-npc-user-msg"></span>
            </div>
          </div>
          <div class="agy-npc-dialog-text"></div>
          <div class="agy-npc-pills">
            ${pillsHtml}
            <button type="button" class="agy-npc-pill" data-npc-act="chat-open">💬 Trò chuyện</button>
          </div>
          <form class="agy-npc-chat-row">
            <input type="text" class="agy-npc-chat-input" placeholder="${prof.placeholder}" autocomplete="off" />
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
  try { applyStyles(); } catch (e) {}

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
