// ============================================================================
// Antigravity Custom Theme — Enterprise Security & Closure Vault (agy_security.js)
// Shared lexical helper inside the Master Payload IIFE (never exposes secrets on window).
// ============================================================================

const __AGY_SEC__ = (() => {
    const boot = (typeof __AGY_BOOT__ === 'object' && __AGY_BOOT__) ? __AGY_BOOT__ : {};
    const _authToken = typeof boot.authToken === 'string' ? boot.authToken : '';
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
            // Allow only raster/SVG data URIs (optional ;charset=utf-8 and/or ;base64 header) without script/event payloads
            if (!/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;charset=[A-Za-z0-9_-]+)?(?:;base64)?,[A-Za-z0-9+/=%.,_~-]+$/i.test(trimmed)) {
                return '';
            }
            if (/^data:image\/svg\+xml/i.test(trimmed)) {
                try {
                    const commaIdx = trimmed.indexOf(',');
                    const body = trimmed.slice(commaIdx + 1);
                    const decoded = trimmed.includes(';base64,')
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

        if (/^https?:\/\/127\.0\.0\.1:\d+\/assets\/[A-Za-z0-9._/-]+(?:\?v=[A-Za-z0-9_-]+)?$/.test(trimmed)) {
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
    const ASSET_FIELD_KEYS = [
        'wallpaper', 'sticker', 'userSticker', 'actionSticker', 'userActionSticker',
        'cornerSvg', 'userCornerSvg', 'userAvatar', 'agentAvatar'
    ];

    function sanitizeThemeDefinition(rawTheme) {
        const src = stripProtoKeys(rawTheme);
        if (!src || typeof src !== 'object') return null;
        const out = {};
        for (const ck of COLOR_KEYS) {
            if (ck in src) out[ck] = sanitizeCssValue(src[ck], '');
        }
        for (const ak of ASSET_FIELD_KEYS) {
            if (ak in src) out[ak] = sanitizeCssUrl(String(src[ak] || ''));
        }
        if (typeof src.concept === 'string') out.concept = src.concept.slice(0, 140);
        if (typeof src.fxMode === 'string') out.fxMode = src.fxMode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
        if (typeof src.isLight === 'boolean') out.isLight = src.isLight;
        if (typeof src.defaultDimming === 'number' && Number.isFinite(src.defaultDimming)) {
            out.defaultDimming = Math.max(0, Math.min(0.95, src.defaultDimming));
        }
        if (typeof src.glassAlpha === 'number' && Number.isFinite(src.glassAlpha)) {
            out.glassAlpha = Math.max(0, Math.min(1, src.glassAlpha));
        }
        if (src.npc && typeof src.npc === 'object') {
            const n = src.npc;
            out.npc = {
                title: String(n.title || '').slice(0, 80),
                badgeLabel: String(n.badgeLabel || '').slice(0, 40),
                placeholder: String(n.placeholder || '').slice(0, 120),
                dialogs: Array.isArray(n.dialogs) ? n.dialogs.slice(0, 24).map((d) => String(d || '').slice(0, 280)) : [],
                pills: Array.isArray(n.pills)
                    ? n.pills.slice(0, 8).map((p) => ({
                        key: String((p && p.key) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
                        label: String((p && p.label) || '').slice(0, 48)
                    })).filter((p) => p.key && p.label)
                    : [],
                replies: (n.replies && typeof n.replies === 'object') ? (() => {
                    const rOut = {};
                    for (const [rk, rv] of Object.entries(n.replies)) {
                        const safeKey = String(rk).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
                        if (safeKey && Array.isArray(rv)) {
                            rOut[safeKey] = rv.slice(0, 12).map((line) => String(line || '').slice(0, 280));
                        }
                    }
                    return rOut;
                })() : {}
            };
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
        const cleanCfg = stripProtoKeys(cfgObj);
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

    return Object.freeze({
        getAssetBase: () => _assetBase,
        getAuthToken: () => _authToken,
        getInitialConfig: () => (_initialConfig ? stripProtoKeys(_initialConfig) : null),
        authHeaders,
        saveConfigSecure,
        escapeHtml,
        stripProtoKeys,
        sanitizeCssUrl,
        sanitizeCssValue,
        sanitizeSvgMarkup,
        sanitizeThemeDefinition,
        resolveAssetUrl
    });
})();
