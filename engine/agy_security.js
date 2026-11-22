// ============================================================================
// Antigravity Custom Theme — Enterprise Security & Closure Vault (agy_security.js)
// Shared lexical helper inside the Master Payload IIFE (never exposes secrets on window).
// ============================================================================

const __AGY_SEC__ = (() => {
    const boot = (typeof __AGY_BOOT__ === 'object' && __AGY_BOOT__) ? __AGY_BOOT__ : {};
    const _authToken = typeof boot.authToken === 'string' ? boot.authToken : '';
    const _syncFromDaemon = Boolean(boot && boot.syncFromDaemon);
    const _assetBase = typeof boot.assetBase === 'string'
        ? boot.assetBase
        : (typeof window !== 'undefined' && typeof window.__AGY_ASSET_BASE__ === 'string' ? window.__AGY_ASSET_BASE__ : '');
    const _initialConfig = (boot.initialConfig && typeof boot.initialConfig === 'object')
        ? boot.initialConfig
        : null;

    // Scrub any legacy globals if present
    if (typeof window !== 'undefined') {
        try { delete window.__AGY_ASSET_BASE__; } catch (_) {}
        try { delete window.__AGY_INITIAL_CONFIG__; } catch (_) {}
        try { delete window.__AGY_AUTH_TOKEN__; } catch (_) {}
    }

    const HTML_ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    function escapeHtml(raw) {
        return String(raw == null ? '' : raw).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
    }

    function stripProtoKeys(obj, depth = 0) {
        if (depth > 8 || !obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            return obj.slice(0, 200).map((item) => stripProtoKeys(item, depth + 1));
        }
        const clean = Object.create(null);
        for (const key of Object.keys(obj)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            clean[key] = stripProtoKeys(obj[key], depth + 1);
        }
        return Object.assign({}, clean);
    }

    /**
     * Strictly validates a URL before embedding inside CSS url("...") or HTML attributes.
     * Blocks CSS/HTML breakout characters and restricts schemes to local daemon assets, relative assets, or safe image data URIs.
     */
    function sanitizeCssUrl(raw) {
        if (typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        if (!trimmed || trimmed === 'none') return '';
        // Forbid any CSS/HTML string/url breakout or control characters
        if (/["'()\\\r\n\0<>`{}]/.test(trimmed)) return '';

        if (trimmed.startsWith('data:')) {
            // Allow only raster/SVG data URIs (optional ;charset=utf-8 / ;utf8 and/or ;base64 header) without script/event payloads
            if (!/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;charset=[A-Za-z0-9_-]+|;utf8)?(?:;base64)?,[A-Za-z0-9+/=%.,_~-]+$/i.test(trimmed)) {
                return '';
            }
            if (/^data:image\/svg\+xml/i.test(trimmed)) {
                try {
                    const commaIdx = trimmed.indexOf(',');
                    const body = trimmed.slice(commaIdx + 1);
                    const decoded = /;base64,/i.test(trimmed.slice(0, commaIdx + 1))
                        ? atob(body)
                        : decodeURIComponent(body);
                    if (/<script|<foreignobject|<iframe|<object|<embed|\bon[a-z]+\s*=|javascript:/i.test(decoded)) {
                        return '';
                    }
                } catch (_) {
                    return '';
                }
            }
            return trimmed;
        }

        if (trimmed.includes(';')) return '';

        if (/^https?:\/\/127\.0\.0\.1:\d+\/assets\/[A-Za-z0-9._~/-]+(?:\?v=[A-Za-z0-9_~-]+)?$/.test(trimmed)) {
            if (trimmed.includes('..')) return '';
            return trimmed;
        }

        if (/^(?:\.\/|\.\.\/)?(?:themes\/)?assets\/[A-Za-z0-9._~/-]+(?:\?v=[A-Za-z0-9_~-]+)?$/.test(trimmed)) {
            if (trimmed.slice(trimmed.indexOf('assets/')).includes('..')) return '';
            return trimmed;
        }

        return '';
    }

    /**
     * Validates a CSS color / gradient / numeric value so it can never break out of a CSS declaration.
     */
    function sanitizeCssValue(raw, fallback = '') {
        if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
        if (typeof raw !== 'string') return fallback;
        const trimmed = raw.trim();
        if (!trimmed || trimmed.length > 260) return fallback;
        if (/[;{}<>\\`\r\n\0]|\/\*|\*\/|@import|expression\s*\(|url\s*\(|javascript:/i.test(trimmed)) {
            return fallback;
        }
        return trimmed;
    }

    /**
     * Sanitizes raw SVG markup (for custom imported themes/stickers) using DOMParser when available.
     */
    function sanitizeSvgMarkup(svgText) {
        if (typeof svgText !== 'string') return '';
        const cleaned = svgText.replace(/^\uFEFF/, '').trim();
        if (!cleaned || cleaned.length > 1024 * 1024) return '';
        if (typeof DOMParser === 'function') {
            try {
                const doc = new DOMParser().parseFromString(cleaned, 'image/svg+xml');
                if (doc.querySelector('parsererror')) return '';
                const root = doc.documentElement;
                if (!root || root.tagName.toLowerCase() !== 'svg') return '';
                const blockedTags = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas']);
                const all = [root, ...Array.from(root.querySelectorAll('*'))];
                for (const el of all) {
                    const tag = el.tagName.toLowerCase();
                    if (blockedTags.has(tag)) {
                        el.remove();
                        continue;
                    }
                    for (const attr of Array.from(el.attributes)) {
                        const aName = attr.name.toLowerCase();
                        const aVal = String(attr.value || '').trim();
                        if (aName.startsWith('on')) {
                            el.removeAttribute(attr.name);
                        } else if ((aName === 'href' || aName === 'xlink:href') && !aVal.startsWith('#') && !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(aVal)) {
                            el.removeAttribute(attr.name);
                        } else if (/javascript:|data:text\/html/i.test(aVal)) {
                            el.removeAttribute(attr.name);
                        }
                    }
                }
                return new XMLSerializer().serializeToString(root);
            } catch (_) {
                return '';
            }
        }
        if (/<script|<foreignobject|<iframe|<object|<embed|\bon[a-z]+\s*=|javascript:/i.test(cleaned)) {
            return '';
        }
        return cleaned;
    }

    const COLOR_KEYS = [
        'primary', 'accent', 'bg', 'frameBg', 'composerBg', 'sidebarBg', 'codeBg',
        'textMain', 'textMuted', 'borderColor', 'userBubble', 'overlayRgb', 'pillBg', 'pillBorder'
    ];
    const EXTENDED_CSS_KEYS = [
        'secondary', 'glow', 'secondaryGlow', 'pureBg', 'composerHeaderBg', 'textColor',
        'uiTextColor', 'uiMutedColor', 'innerBorder', 'bgPosition', 'sidebarBlur',
        'sidebarHoverBg', 'aiCardBg', 'aiCardBorder', 'headerBg', 'headerBlur',
        'headerBorder', 'btnBg', 'inputGlassBg', 'inputCardBg', 'pillHoverBg',
        'pillTextColor', 'modalBg', 'modalHeaderBg', 'cardBg', 'cardSelectedBg',
        'arcColor1', 'arcColor2', 'accentParticleColor'
    ];
    const THEME_BOOL_KEYS = [
        'isLight', 'clearBackdrop', 'unifiedGlass', 'sidebarEnhanceText',
        'isOrnament', 'isChibiNpc', 'liveWallpaperFx', 'isScroll', 'isForged', 'isMultiversePreset'
    ];
    const ASSET_FIELD_KEYS = [
        'wallpaper', 'sticker', 'userSticker', 'actionSticker', 'userActionSticker',
        'cornerSvg', 'userCornerSvg', 'userAvatar', 'agentAvatar'
    ];

    function sanitizeNpcDialogs(rawDialogs) {
        if (Array.isArray(rawDialogs)) {
            return {
                welcome: rawDialogs.slice(0, 16).map((d) => String(d || '').slice(0, 280))
            };
        }
        if (rawDialogs && typeof rawDialogs === 'object') {
            const dOut = {};
            let keyCount = 0;
            for (const [dk, dv] of Object.entries(rawDialogs)) {
                if (keyCount >= 16) break;
                const safeKey = String(dk).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
                if (!safeKey) continue;
                if (Array.isArray(dv)) {
                    dOut[safeKey] = dv.slice(0, 16).map((line) => String(line || '').slice(0, 280));
                    keyCount++;
                } else if (typeof dv === 'string' && dv.trim()) {
                    dOut[safeKey] = [dv.slice(0, 280)];
                    keyCount++;
                }
            }
            return dOut;
        }
        return {};
    }

    function sanitizeNpcReplies(rawReplies) {
        if (!rawReplies || typeof rawReplies !== 'object' || Array.isArray(rawReplies)) {
            return {};
        }
        const rOut = {};
        let keyCount = 0;
        for (const [rk, rv] of Object.entries(rawReplies)) {
            if (keyCount >= 24) break;
            const safeKey = String(rk).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
            if (!safeKey) continue;
            if (Array.isArray(rv)) {
                rOut[safeKey] = rv.slice(0, 12).map((line) => String(line || '').slice(0, 280));
                keyCount++;
            } else if (typeof rv === 'string') {
                rOut[safeKey] = rv.slice(0, 280);
                keyCount++;
            }
        }
        return rOut;
    }

    function sanitizeThemeDefinition(rawTheme) {
        const src = stripProtoKeys(rawTheme);
        if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
        const out = {};
        for (const ck of COLOR_KEYS) {
            if (ck in src) out[ck] = sanitizeCssValue(src[ck], '');
        }
        for (const ek of EXTENDED_CSS_KEYS) {
            if (typeof src[ek] === 'string') {
                const sv = sanitizeCssValue(src[ek], '');
                if (sv) out[ek] = sv;
            }
        }
        for (const ak of ASSET_FIELD_KEYS) {
            if (ak in src) out[ak] = sanitizeCssUrl(String(src[ak] || ''));
        }
        for (const bk of THEME_BOOL_KEYS) {
            if (typeof src[bk] === 'boolean') out[bk] = src[bk];
        }
        if (typeof src.concept === 'string') out.concept = src.concept.slice(0, 140);
        if (typeof src.fxMode === 'string') out.fxMode = src.fxMode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
        if (typeof src.defaultDimming === 'number' && Number.isFinite(src.defaultDimming)) {
            const normalizedDim = (src.defaultDimming > 0 && src.defaultDimming < 1)
                ? Math.round(src.defaultDimming * 100)
                : Math.round(src.defaultDimming);
            out.defaultDimming = Math.max(15, Math.min(92, normalizedDim));
        } else {
            out.defaultDimming = 36;
        }
        if (typeof src.glassAlpha === 'number' && Number.isFinite(src.glassAlpha)) {
            out.glassAlpha = Math.max(0, Math.min(1, src.glassAlpha));
        }
        if (typeof src.stickerW === 'number' && Number.isFinite(src.stickerW)) {
            out.stickerW = Math.max(0, Math.min(240, Math.round(src.stickerW)));
        }
        if (typeof src.stickerH === 'number' && Number.isFinite(src.stickerH)) {
            out.stickerH = Math.max(0, Math.min(140, Math.round(src.stickerH)));
        }
        if (typeof src.stickerTop === 'number' && Number.isFinite(src.stickerTop)) {
            out.stickerTop = Math.max(-110, Math.min(24, Math.round(src.stickerTop)));
        }
        if (typeof src.stickerRight === 'number' && Number.isFinite(src.stickerRight)) {
            out.stickerRight = Math.max(0, Math.min(64, Math.round(src.stickerRight)));
        }
        if (src.npc && typeof src.npc === 'object' && !Array.isArray(src.npc)) {
            const n = src.npc;
            out.npc = {
                title: String(n.title || '').slice(0, 80),
                badgeLabel: String(n.badgeLabel || '').slice(0, 40),
                placeholder: String(n.placeholder || '').slice(0, 120),
                dialogs: sanitizeNpcDialogs(n.dialogs),
                pills: Array.isArray(n.pills)
                    ? n.pills.slice(0, 8).map((p) => ({
                        key: String((p && p.key) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
                        label: String((p && p.label) || '').slice(0, 48)
                    })).filter((p) => p.key && p.label)
                    : [],
                replies: sanitizeNpcReplies(n.replies)
            };
        }
        return out;
    }

    function sanitizeConfigObject(rawCfg) {
        const src = stripProtoKeys(rawCfg);
        if (!src || typeof src !== 'object' || Array.isArray(src)) return {};
        const out = {};
        if (typeof src.themeName === 'string') out.themeName = src.themeName.trim().slice(0, 80);
        if (typeof src.bubbleName === 'string') out.bubbleName = src.bubbleName.trim().slice(0, 80);
        if (typeof src.inputStyle === 'string') {
            out.inputStyle = src.inputStyle.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        }
        if (typeof src.masterPersona === 'string') {
            out.masterPersona = src.masterPersona.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'yoriichi';
        }
        if (typeof src.dimming === 'number' && Number.isFinite(src.dimming)) {
            const d = (src.dimming > 0 && src.dimming < 1) ? Math.round(src.dimming * 100) : Math.round(src.dimming);
            out.dimming = Math.max(15, Math.min(92, d));
        }
        if (typeof src.glassBlur === 'number' && Number.isFinite(src.glassBlur)) {
            out.glassBlur = Math.max(0, Math.min(16, Math.round(src.glassBlur)));
        }
        if (typeof src.avatarSize === 'number' && Number.isFinite(src.avatarSize)) {
            out.avatarSize = Math.max(22, Math.min(52, Math.round(src.avatarSize)));
        }
        if (typeof src.avatarRadius === 'number' && Number.isFinite(src.avatarRadius)) {
            out.avatarRadius = Math.max(0, Math.min(50, Math.round(src.avatarRadius)));
        }
        if (typeof src.wpEnabled === 'boolean') out.wpEnabled = src.wpEnabled;
        if (typeof src.transparentWorld === 'boolean') out.transparentWorld = src.transparentWorld;

        if (typeof src.customWp === 'string') {
            out.customWp = src.customWp.trim() === '' ? '' : sanitizeCssUrl(src.customWp);
        }
        if (typeof src.userAvatar === 'string') {
            const ua = src.userAvatar.trim();
            out.userAvatar = (ua === '' || ua === 'none') ? ua : sanitizeCssUrl(ua);
        }
        if (typeof src.agentAvatar === 'string') {
            const aa = src.agentAvatar.trim();
            out.agentAvatar = (aa === '' || aa === 'none') ? aa : sanitizeCssUrl(aa);
        }

        if (src.activeForgedTheme === null) {
            out.activeForgedTheme = null;
        } else if (src.activeForgedTheme && typeof src.activeForgedTheme === 'object' && !Array.isArray(src.activeForgedTheme)) {
            const cleanForged = sanitizeThemeDefinition(src.activeForgedTheme);
            if (cleanForged) {
                const forgedName = String(src.activeForgedTheme.name || out.themeName || '').trim().slice(0, 68);
                if (forgedName) cleanForged.name = forgedName;
                cleanForged.isForged = true;
                out.activeForgedTheme = cleanForged;
            }
        }
        return out;
    }

    function resolveAssetUrl(val) {
        if (!val || val === 'none' || typeof val !== 'string') return '';
        const trimmed = val.trim();
        let candidate = trimmed;
        if (_assetBase && /^(?:themes\/)?assets\//.test(trimmed)) {
            const relAsset = trimmed.replace(/^themes\//, '');
            candidate = _assetBase.replace(/\/?$/, '/') + relAsset;
        } else if (!_assetBase && /^assets\//.test(trimmed)) {
            candidate = './themes/' + trimmed;
        }
        return sanitizeCssUrl(candidate);
    }

    function authHeaders(extra = {}) {
        const h = Object.assign({}, extra);
        if (_authToken) {
            h['X-Agy-Token'] = _authToken;
        }
        return h;
    }

    function saveConfigSecure(cfgObj) {
        const cleanCfg = sanitizeConfigObject(cfgObj);
        if (typeof window !== 'undefined' && typeof window.agySaveThemeConfig === 'function') {
            try {
                window.agySaveThemeConfig(JSON.stringify({
                    __agyToken: _authToken,
                    config: cleanCfg
                }));
                return true;
            } catch (_) {
                return false;
            }
        }
        return false;
    }

    const publicSecApi = Object.freeze({
        getAssetBase: () => _assetBase,
        getInitialConfig: () => (_initialConfig ? sanitizeConfigObject(_initialConfig) : null),
        isSyncFromDaemon: () => _syncFromDaemon,
        escapeHtml,
        stripProtoKeys,
        sanitizeCssUrl,
        sanitizeCssValue,
        sanitizeSvgMarkup,
        sanitizeThemeDefinition,
        sanitizeConfigObject,
        resolveAssetUrl
    });

    // Expose secret-free sanitizer & sync helpers on window (never exposes _authToken or authHeaders)
    if (typeof window !== 'undefined') {
        try { window.__AGY_SEC__ = publicSecApi; } catch (_) {}
    }

    return Object.freeze({
        ...publicSecApi,
        getAuthToken: () => _authToken,
        authHeaders,
        saveConfigSecure
    });
})();
