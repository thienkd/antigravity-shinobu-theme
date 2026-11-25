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

    const DANGEROUS_KEYS = new Set([
        '__proto__', 'constructor', 'prototype',
        'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
        'propertyIsEnumerable', 'toLocaleString',
        '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
    ]);

    function isDangerousKey(key) {
        const s = String(key == null ? '' : key);
        return DANGEROUS_KEYS.has(s) || DANGEROUS_KEYS.has(s.trim());
    }

    function stripProtoKeys(obj, depth = 0) {
        if (!obj || typeof obj !== 'object') return obj;
        if (depth > 8) return Array.isArray(obj) ? [] : {};
        if (Array.isArray(obj)) {
            return obj.slice(0, 200).map((item) => stripProtoKeys(item, depth + 1));
        }
        const clean = Object.create(null);
        for (const key of Object.keys(obj)) {
            if (isDangerousKey(key)) continue;
            clean[key] = stripProtoKeys(obj[key], depth + 1);
        }
        return Object.assign({}, clean);
    }

    const B64_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function decodeBase64Utf8(b64Raw) {
        const cleanB64 = String(b64Raw || '').replace(/\s+/g, '');
        if (!cleanB64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleanB64)) {
            throw new Error('Invalid base64');
        }
        let bin = '';
        if (typeof atob === 'function') {
            bin = atob(cleanB64);
        } else {
            let bits = 0;
            let val = 0;
            for (let i = 0; i < cleanB64.length; i++) {
                const ch = cleanB64[i];
                if (ch === '=') break;
                const idx = B64_ALPHA.indexOf(ch);
                if (idx < 0) throw new Error('Invalid base64 char');
                val = (val << 6) | idx;
                bits += 6;
                if (bits >= 8) {
                    bits -= 8;
                    bin += String.fromCharCode((val >> bits) & 0xff);
                }
            }
        }
        try {
            const pct = Array.from(bin).map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
            return decodeURIComponent(pct);
        } catch (_) {
            return bin;
        }
    }

    function decodeXmlEntities(str) {
        let cur = String(str == null ? '' : str);
        for (let pass = 0; pass < 2; pass++) {
            const next = cur
                .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
                    const cp = parseInt(hex, 16);
                    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
                })
                .replace(/&#([0-9]+);?/g, (_, dec) => {
                    const cp = parseInt(dec, 10);
                    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
                })
                .replace(/&(lt|gt|quot|apos|amp|colon|tab|newline);/gi, (_, name) => ({
                    lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', colon: ':', tab: '\t', newline: '\n'
                }[name.toLowerCase()] || ''));
            if (next === cur) break;
            cur = next;
        }
        return cur;
    }

    function normalizeControlAndWs(str) {
        return decodeXmlEntities(str).replace(/[\s\x00-\x1f\x7f]+/g, '').toLowerCase();
    }

    function isSafeSvgCss(cssText, allowAtRules) {
        const raw = String(cssText || '');
        const decoded = decodeXmlEntities(raw);
        const variants = raw === decoded ? [raw] : [raw, decoded];
        for (const text of variants) {
            if (/<!--|-->|\/\*|\*\/|[<>\\\0]|@import|@charset|@namespace|expression\s*\(|(?:-\w+-)?image-set\s*\(|cross-fade\s*\(|(?:-\w+-)?element\s*\(|\bimage\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|\bdata:/i.test(text)) {
                return false;
            }
            if (!allowAtRules && /@[a-z-]/i.test(text)) {
                return false;
            }
            const urlMatches = text.matchAll(/url\s*\(([^)]*)\)/gi);
            for (const m of urlMatches) {
                let inner = String(m[1] || '').trim();
                if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
                    inner = inner.slice(1, -1).trim();
                }
                const compact = inner.replace(/[\s\x00-\x1f\x7f]+/g, '');
                if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(compact)) {
                    return false;
                }
            }
            if (/url\s*\(/i.test(text.replace(/url\s*\(([^)]*)\)/gi, ''))) {
                return false;
            }
        }
        return true;
    }

    function isSafeSvgUrlRef(rawVal, tagLocalName) {
        const trimmed = String(rawVal || '').trim();
        if (!trimmed) return false;
        const decoded = decodeXmlEntities(trimmed).trim();
        const compact = decoded.replace(/[\s\x00-\x1f\x7f]+/g, '');
        if (/javascript:|vbscript:|data:text\/html|data:image\/svg\+xml/i.test(compact)) {
            return false;
        }
        const isLocalFragment = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(compact);
        if (tagLocalName === 'use') {
            return isLocalFragment;
        }
        if (tagLocalName === 'image' || tagLocalName === 'feimage') {
            if (isLocalFragment) return true;
            return /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(compact);
        }
        return isLocalFragment;
    }

    const BLOCKED_SVG_TAGS = new Set([
        'script', 'foreignobject', 'iframe', 'object', 'embed',
        'audio', 'video', 'canvas', 'set', 'animate',
        'animatemotion', 'animatetransform', 'animatecolor',
        'handler', 'listener', 'link', 'meta', 'base'
    ]);

    const BLOCKED_SVG_ATTRS = new Set([
        'attributename', 'formaction', 'action', 'poster', 'background', 'srcdoc'
    ]);

    function hasDangerousAttrValue(val, tagLocal, localAttr) {
        if (localAttr === 'href' || localAttr === 'src') {
            return !isSafeSvgUrlRef(val, tagLocal);
        }
        if (localAttr === 'style') {
            return !isSafeSvgCss(val, false);
        }
        const compact = normalizeControlAndWs(val);
        if (/javascript:|vbscript:|data:text\/html|data:image\/svg\+xml|expression\s*\(|behavior\s*:|-moz-binding/i.test(compact)) {
            return true;
        }
        if (/url\s*\(/i.test(String(val || '')) || /url\s*\(/i.test(decodeXmlEntities(val))) {
            if (!isSafeSvgCss(val, false)) return true;
        }
        return false;
    }

    function findTagCloseOutsideQuotes(str, startIdx) {
        let inQuote = '';
        for (let i = startIdx; i < str.length; i++) {
            const ch = str[i];
            if (ch === '<') return -1;
            if (inQuote) {
                if (ch === inQuote) inQuote = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                inQuote = ch;
            } else if (ch === '>') {
                return i;
            }
        }
        return -1;
    }

    function stripXmlCommentsOutsideTags(str) {
        let out = '';
        let i = 0;
        let inTag = false;
        let inQuote = '';
        const len = str.length;
        while (i < len) {
            if (!inTag) {
                if (str.startsWith('<!--', i)) {
                    const endIdx = str.indexOf('-->', i + 4);
                    if (endIdx === -1) return null;
                    i = endIdx + 3;
                    continue;
                }
                if (str.startsWith('<![CDATA[', i) || str.startsWith('<?', i)) {
                    const isPi = str.startsWith('<?', i);
                    const endToken = isPi ? '?>' : ']]>';
                    const endIdx = str.indexOf(endToken, i + (isPi ? 2 : 9));
                    if (endIdx === -1) return null;
                    out += str.slice(i, endIdx + endToken.length);
                    i = endIdx + endToken.length;
                    continue;
                }
                if (str[i] === '<') {
                    const styleOpenMatch = str.slice(i).match(/^<\s*(?:[a-zA-Z0-9_-]+:)?style\b/i);
                    if (styleOpenMatch) {
                        const gt = findTagCloseOutsideQuotes(str, i + styleOpenMatch[0].length);
                        if (gt === -1) return null;
                        const tagRaw = str.slice(i, gt + 1);
                        out += tagRaw;
                        i = gt + 1;
                        if (!/\/\s*>$/.test(tagRaw)) {
                            const nameMatch = tagRaw.slice(1).match(/^\s*([a-zA-Z0-9_:-]+)/);
                            if (!nameMatch) return null;
                            const closeRe = new RegExp('<\\/\\s*' + nameMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*>', 'i');
                            const rest = str.slice(i);
                            const cm = closeRe.exec(rest);
                            if (!cm) return null;
                            const styleInner = rest.slice(0, cm.index);
                            if (/<!--|-->/.test(styleInner)) return null;
                            out += rest.slice(0, cm.index + cm[0].length);
                            i += cm.index + cm[0].length;
                        }
                        continue;
                    }
                    inTag = true;
                    out += '<';
                    i++;
                    continue;
                }
                out += str[i];
                i++;
            } else {
                const ch = str[i];
                if (inQuote) {
                    if (ch === inQuote) inQuote = '';
                    out += ch;
                    i++;
                } else {
                    if (ch === '"' || ch === "'") {
                        inQuote = ch;
                        out += ch;
                        i++;
                    } else if (ch === '<') {
                        return null;
                    } else if (ch === '>') {
                        inTag = false;
                        out += ch;
                        i++;
                    } else {
                        out += ch;
                        i++;
                    }
                }
            }
        }
        if (inTag || inQuote) return null;
        return out;
    }

    function inspectAndSanitizeSvg(svgText, rejectOnDangerous) {
        if (typeof svgText !== 'string') return '';
        const cleaned = svgText.replace(/^\uFEFF/, '').trim();
        if (!cleaned || cleaned.length > 1024 * 1024) return '';

        const strippedComments = stripXmlCommentsOutsideTags(cleaned);
        if (strippedComments === null) return '';

        const withoutDeclAndComments = strippedComments
            .trim()
            .replace(/^\s*<\?xml(?:\s+[^?]*|\s*)\?>/i, '')
            .trim();
        if (!withoutDeclAndComments || /<\?/i.test(withoutDeclAndComments) || /<!(?:DOCTYPE|ENTITY|ELEMENT|ATTLIST|\[CDATA\[)/i.test(withoutDeclAndComments)) {
            return '';
        }

        if (typeof DOMParser === 'function') {
            try {
                const doc = new DOMParser().parseFromString(strippedComments, 'image/svg+xml');
                if (doc.querySelector('parsererror')) return '';
                const root = doc.documentElement;
                if (!root) return '';
                const rootLocal = String(root.localName || root.tagName || '').split(':').pop().toLowerCase();
                if (rootLocal !== 'svg') return '';

                // Reject or scrub ProcessingInstruction (7), Comment (8), CDATASection (4) across the whole DOM tree
                const scrubSpecialNodes = (parentNode) => {
                    const kids = Array.from(parentNode.childNodes || parentNode.children || []);
                    for (const child of kids) {
                        if (child.nodeType === 7 || child.nodeType === 4) {
                            return false;
                        }
                        if (child.nodeType === 8) {
                            if (typeof child.remove === 'function') {
                                child.remove();
                            } else if (typeof parentNode.removeChild === 'function') {
                                parentNode.removeChild(child);
                            }
                            continue;
                        }
                        if (child.nodeType === 1 && !scrubSpecialNodes(child)) {
                            return false;
                        }
                    }
                    return true;
                };
                if (!scrubSpecialNodes(doc)) return '';

                const all = [root, ...Array.from(root.querySelectorAll('*'))];
                for (const el of all) {
                    const tagLocal = String(el.localName || el.tagName || '').split(':').pop().toLowerCase();
                    if (BLOCKED_SVG_TAGS.has(tagLocal)) {
                        if (rejectOnDangerous) return '';
                        el.remove();
                        continue;
                    }
                    if (tagLocal === 'style') {
                        if (!isSafeSvgCss(el.textContent || '', true)) {
                            if (rejectOnDangerous) return '';
                            el.remove();
                            continue;
                        }
                    }
                    for (const attr of Array.from(el.attributes)) {
                        const fullAttr = String(attr.name || '').toLowerCase();
                        const localAttr = String(attr.localName || fullAttr.split(':').pop() || '').toLowerCase();
                        const aVal = String(attr.value || '').trim();
                        if (
                            localAttr.startsWith('on') ||
                            fullAttr.startsWith('on') ||
                            BLOCKED_SVG_ATTRS.has(localAttr) ||
                            localAttr === 'data'
                        ) {
                            if (rejectOnDangerous) return '';
                            el.removeAttribute(attr.name);
                            continue;
                        }
                        if (hasDangerousAttrValue(aVal, tagLocal, localAttr)) {
                            if (rejectOnDangerous) return '';
                            el.removeAttribute(attr.name);
                        }
                    }
                }
                return new XMLSerializer().serializeToString(root);
            } catch (_) {
                return '';
            }
        }

        // Strict fallback parser when DOMParser is unavailable (e.g. Node VM)
        if (!/^<\s*(?:[a-zA-Z0-9_-]+:)?svg\b/i.test(withoutDeclAndComments) || !/<\/\s*(?:[a-zA-Z0-9_-]+:)?svg\s*>$/i.test(withoutDeclAndComments)) {
            return '';
        }

        // Reject entity-encoded hidden tags (e.g. &#x3c;script, &lt;svg:script)
        const decodedWhole = decodeXmlEntities(withoutDeclAndComments);
        if (decodedWhole !== withoutDeclAndComments) {
            if (/<\s*(?:[a-zA-Z0-9_-]+:)?(?:script|foreignobject|iframe|object|embed|set|animate|animatemotion|animatetransform|animatecolor|handler|listener|link|meta|base)\b/i.test(decodedWhole)) {
                return '';
            }
        }

        // Scan every tag (including <style> blocks) without breaking on '>' inside quoted attributes
        let pos = 0;
        while (pos < withoutDeclAndComments.length) {
            const lt = withoutDeclAndComments.indexOf('<', pos);
            if (lt === -1) break;
            const afterLt = withoutDeclAndComments.slice(lt + 1);
            const headMatch = afterLt.match(/^\s*(\/?)\s*([a-zA-Z0-9_:-]+)/);
            if (!headMatch) return '';
            const isClosing = Boolean(headMatch[1]);
            const rawTag = headMatch[2];
            const tagLocal = rawTag.split(':').pop().toLowerCase();
            if (BLOCKED_SVG_TAGS.has(tagLocal)) return '';

            const attrStart = lt + 1 + headMatch[0].length;
            const gt = findTagCloseOutsideQuotes(withoutDeclAndComments, attrStart);
            if (gt === -1) return '';

            let attrStr = withoutDeclAndComments.slice(attrStart, gt);
            const selfClosing = /\/\s*$/.test(attrStr);
            if (selfClosing) attrStr = attrStr.replace(/\/\s*$/, '');

            if (isClosing) {
                if (attrStr.trim() !== '') return '';
                pos = gt + 1;
                continue;
            }

            if (attrStr.trim()) {
                if (/(?:^|\s)on[a-z0-9_-]+(?=\s|=|$)/i.test(attrStr)) return '';

                const attrRe = /\s+([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
                let lastEnd = 0;
                let am;
                while ((am = attrRe.exec(attrStr)) !== null) {
                    if (attrStr.slice(lastEnd, am.index).trim() !== '') return '';
                    lastEnd = attrRe.lastIndex;
                    const fullAttr = am[1].toLowerCase();
                    const localAttr = fullAttr.split(':').pop().toLowerCase();
                    const val = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] || ''));
                    if (
                        localAttr.startsWith('on') ||
                        fullAttr.startsWith('on') ||
                        BLOCKED_SVG_ATTRS.has(localAttr) ||
                        localAttr === 'data'
                    ) {
                        return '';
                    }
                    if (hasDangerousAttrValue(val, tagLocal, localAttr)) {
                        return '';
                    }
                }
                if (attrStr.slice(lastEnd).trim() !== '') return '';
            }

            if (tagLocal === 'style' && !selfClosing) {
                const rest = withoutDeclAndComments.slice(gt + 1);
                const closeRe = new RegExp('<\\/\\s*' + rawTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*>', 'i');
                const cm = closeRe.exec(rest);
                if (!cm) return '';
                const cssContent = rest.slice(0, cm.index);
                if (!isSafeSvgCss(cssContent, true)) return '';
                pos = gt + 1 + cm.index + cm[0].length;
                continue;
            }

            pos = gt + 1;
        }

        return strippedComments.trim();
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
                    const header = trimmed.slice(0, commaIdx + 1);
                    const body = trimmed.slice(commaIdx + 1);
                    const isB64 = /;base64,/i.test(header);
                    const decoded = isB64 ? decodeBase64Utf8(body) : decodeURIComponent(body);
                    if (!inspectAndSanitizeSvg(decoded, true)) {
                        return '';
                    }
                    if (!isB64 && /%[0-9a-f]{2}/i.test(decoded)) {
                        try {
                            const decodedTwice = decodeURIComponent(decoded);
                            if (decodedTwice !== decoded && !inspectAndSanitizeSvg(decodedTwice, true)) {
                                return '';
                            }
                        } catch (_) {}
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
        if (/["';{}<>\\`\x00-\x1f\x7f]|\/\*|\*\/|@import|@charset|@namespace|expression\s*\(|url\s*\(|(?:-\w+-)?image-set\s*\(|cross-fade\s*\(|(?:-\w+-)?element\s*\(|\bimage\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(trimmed)) {
            return fallback;
        }
        let parenDepth = 0;
        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (ch === '(') parenDepth++;
            else if (ch === ')') {
                parenDepth--;
                if (parenDepth < 0) return fallback;
            }
        }
        if (parenDepth !== 0) return fallback;
        return trimmed;
    }

    /**
     * Sanitizes raw SVG markup (for custom imported themes/stickers) using DOMParser when available.
     */
    function sanitizeSvgMarkup(svgText) {
        return inspectAndSanitizeSvg(svgText, false);
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
            const dOut = Object.create(null);
            let keyCount = 0;
            for (const [dk, dv] of Object.entries(rawDialogs)) {
                if (keyCount >= 16) break;
                const safeKey = String(dk).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
                if (!safeKey || isDangerousKey(safeKey)) continue;
                if (Array.isArray(dv)) {
                    dOut[safeKey] = dv.slice(0, 16).map((line) => String(line || '').slice(0, 280));
                    keyCount++;
                } else if (typeof dv === 'string' && dv.trim()) {
                    dOut[safeKey] = [dv.slice(0, 280)];
                    keyCount++;
                }
            }
            return Object.assign({}, dOut);
        }
        return {};
    }

    function sanitizeNpcReplies(rawReplies) {
        if (!rawReplies || typeof rawReplies !== 'object' || Array.isArray(rawReplies)) {
            return {};
        }
        const rOut = Object.create(null);
        let keyCount = 0;
        for (const [rk, rv] of Object.entries(rawReplies)) {
            if (keyCount >= 24) break;
            const safeKey = String(rk).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
            if (!safeKey || isDangerousKey(safeKey)) continue;
            if (Array.isArray(rv)) {
                rOut[safeKey] = rv.slice(0, 12).map((line) => String(line || '').slice(0, 280));
                keyCount++;
            } else if (typeof rv === 'string') {
                rOut[safeKey] = rv.slice(0, 280);
                keyCount++;
            }
        }
        return Object.assign({}, rOut);
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
        if (typeof src.fxMode === 'string') {
            const fx = src.fxMode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
            if (fx && !isDangerousKey(fx)) out.fxMode = fx;
        }
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
        if (typeof src.personaTraitId === 'string') {
            const pt = src.personaTraitId.trim().toLowerCase();
            if (/^[a-z0-9_]{1,36}$/.test(pt) && !isDangerousKey(pt)) {
                out.personaTraitId = pt;
            }
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
                    })).filter((p) => p.key && p.label && !isDangerousKey(p.key))
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
        if (typeof src.themeName === 'string') {
            const tn = src.themeName.trim().slice(0, 80);
            if (tn && !isDangerousKey(tn)) out.themeName = tn;
        }
        if (typeof src.bubbleName === 'string') {
            const bn = src.bubbleName.trim().slice(0, 80);
            if (bn && !isDangerousKey(bn)) out.bubbleName = bn;
        }
        if (typeof src.inputStyle === 'string') {
            const ist = src.inputStyle.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
            if (ist && !isDangerousKey(ist)) out.inputStyle = ist;
        }
        if (typeof src.masterPersona === 'string') {
            const mp = src.masterPersona.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
            out.masterPersona = (mp && !isDangerousKey(mp)) ? mp : 'yoriichi';
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
        if (typeof src.fxDensity === 'number' && Number.isFinite(src.fxDensity)) {
            out.fxDensity = Math.max(0, Math.min(100, Math.round(src.fxDensity)));
        }
        if (typeof src.bubbleRadius === 'number' && Number.isFinite(src.bubbleRadius)) {
            out.bubbleRadius = Math.max(6, Math.min(22, Math.round(src.bubbleRadius)));
        }
        if (typeof src.wpEnabled === 'boolean') out.wpEnabled = src.wpEnabled;
        if (typeof src.transparentWorld === 'boolean') out.transparentWorld = src.transparentWorld;
        if (typeof src.chibiEnabled === 'boolean') out.chibiEnabled = src.chibiEnabled;
        if (typeof src.chibi3dEnabled === 'boolean') out.chibi3dEnabled = src.chibi3dEnabled;
        if (typeof src.chibi2dLive === 'boolean') out.chibi2dLive = src.chibi2dLive;
        if (typeof src.autoFinisher === 'boolean') out.autoFinisher = src.autoFinisher;
        if (typeof src.ecoBattery === 'boolean') out.ecoBattery = src.ecoBattery;
        if (typeof src.focusMode === 'boolean') out.focusMode = src.focusMode;
        if (typeof src.privacyShieldActive === 'boolean') out.privacyShieldActive = src.privacyShieldActive;
        if (typeof src.aiPersonaMode === 'string') {
            const apm = src.aiPersonaMode.trim().toLowerCase();
            if (apm === 'off' || apm === 'subtle' || apm === 'roleplay') out.aiPersonaMode = apm;
        }
        if (typeof src.uiLang === 'string') {
            const ul = src.uiLang.trim().toLowerCase();
            if (ul === 'vi' || ul === 'en' || ul === 'ja') out.uiLang = ul;
        }
        if (typeof src.activeWorkspace === 'string') {
            const aws = src.activeWorkspace.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 64).toLowerCase();
            if (!isDangerousKey(aws)) out.activeWorkspace = aws;
        }
        if (src.workspaceProfiles && typeof src.workspaceProfiles === 'object' && !Array.isArray(src.workspaceProfiles)) {
            const cleanProfiles = {};
            const rawKeys = Object.keys(src.workspaceProfiles);
            for (let i = 0; i < rawKeys.length; i++) {
                if (Object.keys(cleanProfiles).length >= 48) break;
                const wk = String(rawKeys[i] || '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 64).toLowerCase();
                if (!wk || isDangerousKey(wk)) continue;
                const item = src.workspaceProfiles[rawKeys[i]];
                if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
                const entry = {};
                if (typeof item.themeName === 'string') {
                    const tn = item.themeName.replace(/[\x00-\x1f\x7f<>`{}]/g, '').trim().slice(0, 80);
                    if (tn && !isDangerousKey(tn)) entry.themeName = tn;
                }
                if (typeof item.bubbleName === 'string') {
                    const bn = item.bubbleName.replace(/[\x00-\x1f\x7f<>`{}]/g, '').trim().slice(0, 80);
                    if (bn && !isDangerousKey(bn)) entry.bubbleName = bn;
                }
                if (typeof item.masterPersona === 'string') {
                    const mp = item.masterPersona.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36).toLowerCase();
                    if (mp && !isDangerousKey(mp)) entry.masterPersona = mp;
                }
                if (typeof item.aiPersonaMode === 'string') {
                    const m = item.aiPersonaMode.trim().toLowerCase();
                    if (m === 'off' || m === 'subtle' || m === 'roleplay') entry.aiPersonaMode = m;
                }
                if (typeof item.dimming === 'number' && Number.isFinite(item.dimming)) {
                    entry.dimming = Math.max(15, Math.min(92, Math.round(item.dimming)));
                }
                if (typeof item.fxDensity === 'number' && Number.isFinite(item.fxDensity)) {
                    entry.fxDensity = Math.max(0, Math.min(100, Math.round(item.fxDensity)));
                }
                if (typeof item.chibiEnabled === 'boolean') entry.chibiEnabled = item.chibiEnabled;
                if (typeof item.chibi3dEnabled === 'boolean') entry.chibi3dEnabled = item.chibi3dEnabled;
                if (typeof item.chibi2dLive === 'boolean') entry.chibi2dLive = item.chibi2dLive;
                if (typeof item.autoFinisher === 'boolean') entry.autoFinisher = item.autoFinisher;
                if (typeof item.focusMode === 'boolean') entry.focusMode = item.focusMode;
                if (Object.keys(entry).length > 0) cleanProfiles[wk] = entry;
            }
            out.workspaceProfiles = cleanProfiles;
        }

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
                if (!forgedName || !isDangerousKey(forgedName)) {
                    if (forgedName) cleanForged.name = forgedName;
                    cleanForged.isForged = true;
                    out.activeForgedTheme = cleanForged;
                }
            }
        }
        if (src.activeForgedBubbleTheme === null) {
            out.activeForgedBubbleTheme = null;
        } else if (src.activeForgedBubbleTheme && typeof src.activeForgedBubbleTheme === 'object' && !Array.isArray(src.activeForgedBubbleTheme)) {
            const cleanForgedBubble = sanitizeThemeDefinition(src.activeForgedBubbleTheme);
            if (cleanForgedBubble) {
                const forgedBubbleName = String(src.activeForgedBubbleTheme.name || out.bubbleName || '').trim().slice(0, 68);
                if (forgedBubbleName && !isDangerousKey(forgedBubbleName)) {
                    cleanForgedBubble.name = forgedBubbleName;
                    cleanForgedBubble.isForged = true;
                    out.activeForgedBubbleTheme = cleanForgedBubble;
                }
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
        isDangerousKey,
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
