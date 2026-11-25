(() => {
  'use strict';

  /**
   * Semantic & Elemental Forged Medallion Icon System for Antigravity Custom Theme (v3.5)
   * Crafted with Ufotable-inspired multi-stop metallic gradients, specular rim highlights,
   * and O(1) memoized functional vector glyphs.
   *
   * Exposes window.__AGY_KNY_ICONS__:
   *  - parseSessionIdentity(docTitle, cid)
   *  - buildSessionAvatar(docTitle, cid, size): Bespoke Tsuba-rimmed Session Medallion SVG
   *  - normalizeElementKey(modeOrChar)
   *  - getElementalSvg(modeOrChar, size): 18 Multi-layer Elemental Crest SVGs
   *  - getFuncSvg(kind, size): Precision Swordsmanship & Context Telemetry SVGs
   */

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || 'antigravity');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  let avatarGradientSeq = 0;
  const elemSvgCache = new Map();
  const funcSvgCache = new Map();
  const SVG_CACHE_LIMIT = 96;

  function cacheSetBounded(map, key, val) {
    if (map.size >= SVG_CACHE_LIMIT) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, val);
    return val;
  }

  function safeIconSize(size, fallback) {
    const n = Number(size);
    return (Number.isFinite(n) && n > 0 && n <= 512) ? Math.round(n * 100) / 100 : fallback;
  }

  function escapeXml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseSessionIdentity(rawTitle, cid) {
    const clean = String(rawTitle || '')
      .replace(/\s*[-–—]\s*Antigravity\s*$/i, '')
      .trim();
    const parts = clean.split(/\s*[-–—]\s*/).filter(Boolean);
    const sessionName = parts[0] || 'Phiên làm việc hiện tại';
    const projectName = parts.length > 1 ? parts[parts.length - 1] : sessionName;
    const lower = clean.toLowerCase();

    let archetype = 'monogram';
    if (/youtube|video|music|lofi|audio|stream|film|media|studio/.test(lower)) {
      archetype = 'media';
    } else if (/archviz|3d|render|villa|design|theme|ui|css|canvas|figma|art/.test(lower)) {
      archetype = 'design';
    } else if (/colab|ipynb|notebook|bigquery|sql|data|ml|train|gpu|python/.test(lower)) {
      archetype = 'data';
    } else if (/git|deploy|server|daemon|api|build|bug|fix|test/.test(lower)) {
      archetype = 'forge';
    }

    // Extract clean Unicode letter/number monogram initial (supports CJK & Vietnamese, excludes × / ÷)
    const alphaMatch = projectName.match(/[\p{L}\p{N}]/u);
    const initial = alphaMatch ? alphaMatch[0].toUpperCase() : 'A';

    const PALETTES = [
      ['#38bdf8', '#818cf8'],
      ['#f97316', '#fde047'],
      ['#c084fc', '#2dd4bf'],
      ['#fb7185', '#f472b6'],
      ['#34d399', '#38bdf8'],
      ['#facc15', '#f43f5e'],
      ['#a78bfa', '#f472b6'],
      ['#22c55e', '#fde047']
    ];
    const h = hashStr((cid || '') + '|' + projectName);
    const [c1, c2] = PALETTES[h % PALETTES.length];

    return {
      sessionName,
      projectName,
      displayLabel: parts.length > 1 ? `${sessionName} • ${projectName}` : sessionName,
      archetype,
      initial,
      c1,
      c2,
      uid: (h % 99991).toString(36)
    };
  }

  function buildSessionAvatar(rawTitle, cid, size = 15) {
    const sz = safeIconSize(size, 15);
    const info = parseSessionIdentity(rawTitle, cid);
    avatarGradientSeq = (avatarGradientSeq + 1) >>> 0;
    const gid = `agy_ses_${info.uid}_${sz}_${avatarGradientSeq}`;
    const coreGid = `${gid}_core`;
    let innerGlyph = '';

    if (info.archetype === 'media') {
      // Crystal play prism + dual harmonic Koto acoustic arcs
      innerGlyph =
        `<path d="M9.0 7.5c0-.55.6-.88 1.08-.6l6.1 3.6c.46.28.46.94 0 1.22l-6.1 3.6c-.48.28-1.08-.05-1.08-.6V7.5Z" fill="#ffffff" fill-opacity="0.96"/>` +
        `<path d="M9.6 8.3l4.6 2.7-4.6 1.1V8.3Z" fill="${info.c1}" fill-opacity="0.35"/>` +
        `<path d="M17.2 8.8c1.15 1.45 1.15 4.95 0 6.4" stroke="#ffffff" stroke-width="1.35" stroke-linecap="round" fill="none"/>` +
        `<circle cx="18.9" cy="12" r="0.85" fill="${info.c2}"/>`;
    } else if (info.archetype === 'design') {
      // Faceted isometric jewel & 4-point specular glint
      innerGlyph =
        `<polygon points="12,5.3 17.8,8.7 17.8,15.3 12,18.7 6.2,15.3 6.2,8.7" fill="url(#${gid})" fill-opacity="0.28" stroke="#ffffff" stroke-width="1.35" stroke-linejoin="round"/>` +
        `<polygon points="12,5.3 17.8,8.7 12,12 6.2,8.7" fill="#ffffff" fill-opacity="0.32"/>` +
        `<path d="M12 12v6.7M6.2 8.7L12 12l5.8-3.3" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
        `<circle cx="12" cy="12" r="1.35" fill="#ffffff"/>`;
    } else if (info.archetype === 'data') {
      // Luminous neural constellation matrix
      innerGlyph =
        `<path d="M8.2 12L14.8 8.2M8.2 12l6.6 3.8M14.8 8.2v7.6M11.6 10.1l3.2 5.7" stroke="rgba(255,255,255,0.72)" stroke-width="1.2" stroke-linecap="round"/>` +
        `<circle cx="8.1" cy="12" r="2.1" fill="#ffffff"/>` +
        `<circle cx="8.1" cy="12" r="0.95" fill="${info.c1}"/>` +
        `<circle cx="15.2" cy="8.1" r="1.75" fill="#ffffff"/>` +
        `<circle cx="15.2" cy="15.9" r="1.75" fill="${info.c2}" stroke="#ffffff" stroke-width="0.9"/>`;
    } else if (info.archetype === 'forge') {
      // Nichirin forged code blades & central anvil spark
      innerGlyph =
        `<path d="M9.3 8.3L5.9 12l3.4 3.7M14.7 8.3l3.4 3.7-3.4 3.7" stroke="#ffffff" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
        `<path d="M12 7.4l1.05 3.55L15.6 12l-2.55 1.05L12 16.6l-1.05-3.55L8.4 12l2.55-1.05Z" fill="#ffffff"/>`;
    } else {
      // Royal Tsuba monogram seal with top diamond pip
      innerGlyph =
        `<polygon points="12,4.8 13.1,6.0 12,7.2 10.9,6.0" fill="${info.c2}" fill-opacity="0.9"/>` +
        `<text x="12" y="15.8" text-anchor="middle" fill="#ffffff" font-size="10.4" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Inter, Segoe UI, system-ui, Noto Sans, Ubuntu, Cantarell, Noto Sans CJK JP, sans-serif">${escapeXml(info.initial)}</text>`;
    }

    const svg =
      `<svg class="agy-sem-svg agy-session-emblem" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      `<defs>` +
      `<linearGradient id="${gid}" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0%" stop-color="${info.c1}"/><stop offset="100%" stop-color="${info.c2}"/>` +
      `</linearGradient>` +
      `<radialGradient id="${coreGid}" cx="50%" cy="38%" r="65%">` +
      `<stop offset="0%" stop-color="#1e293b" stop-opacity="0.88"/>` +
      `<stop offset="100%" stop-color="#060813" stop-opacity="0.96"/>` +
      `</radialGradient>` +
      `</defs>` +
      // Outer Tsuba metallic halo ring (preserves fill="url(#gid)" and stroke="url(#gid)" contract)
      `<circle cx="12" cy="12" r="10.4" fill="url(#${gid})" fill-opacity="0.26" stroke="url(#${gid})" stroke-width="1.75"/>` +
      // Cardinal Tsuba notches
      `<path d="M12 1.6v1.7M12 20.7v1.7M1.6 12h1.7M20.7 12h1.7" stroke="rgba(255,255,255,0.52)" stroke-width="1.1" stroke-linecap="round"/>` +
      // Deep obsidian enamel core + top specular arc
      `<circle cx="12" cy="12" r="8.35" fill="url(#${coreGid})"/>` +
      `<path d="M5.4 8.2a7.8 7.8 0 0 1 13.2 0" stroke="rgba(255,255,255,0.34)" stroke-width="0.9" stroke-linecap="round" fill="none"/>` +
      innerGlyph +
      `</svg>`;

    return { svg, info };
  }

  function normalizeElementKey(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return 'yoriichi';
    if (s.includes('sun_water') || s.includes('tanjiro') || s.includes('nhật luân')) return 'sun_water';
    if (s.includes('royal') || s.includes('ubuyashiki') || s.includes('chúa công')) return 'royal_wisteria';
    if (s.includes('wisteria') || s.includes('insect') || s.includes('shinobu') || s.includes('trùng trụ')) return 'wisteria';
    if (s.includes('moon') || s.includes('shadow') || s.includes('nguyệt') || s.includes('kokushibo')) return 'moon';
    if (s.includes('water') || s.includes('giyu') || s.includes('thủy trụ')) return 'water';
    if (s.includes('flame') || s.includes('rengoku') || s.includes('viêm trụ')) return 'flame';
    if (s.includes('sound') || s.includes('uzui') || s.includes('âm trụ')) return 'sound';
    if (s.includes('mist') || s.includes('muichiro') || s.includes('hà trụ')) return 'mist';
    if (s.includes('love') || s.includes('mitsuri') || s.includes('luyến trụ')) return 'love';
    if (s.includes('serpent') || s.includes('snake') || s.includes('obanai') || s.includes('xà trụ')) return 'serpent';
    if (s.includes('wind') || s.includes('sanemi') || s.includes('phong trụ')) return 'wind';
    if (s.includes('stone') || s.includes('rock') || s.includes('gyomei') || s.includes('nham trụ')) return 'stone';
    if (s.includes('blood') || s.includes('nezuko') || s.includes('hồng liên') || s.includes('huyết quỷ')) return 'nezuko';
    if (s.includes('thunder') || s.includes('zenitsu') || s.includes('lôi minh')) return 'thunder';
    if (s.includes('beast') || s.includes('inosuke') || s.includes('dã thú')) return 'beast';
    if (s.includes('cosmic') || s.includes('wlop')) return 'cosmic';
    if (s.includes('obsidian') || s.includes('midnight')) return 'obsidian';
    return 'yoriichi';
  }

  function getElementalSvg(rawModeOrTheme, size = 14) {
    const sz = safeIconSize(size, 14);
    const key = normalizeElementKey(rawModeOrTheme);
    const cacheKey = `${key}|${sz}`;
    if (elemSvgCache.has(cacheKey)) return elemSvgCache.get(cacheKey);

    const g1 = `agy_el_${key}_a`;
    const g2 = `agy_el_${key}_b`;
    let body = '';

    switch (key) {
      case 'water': // Thủy Trụ: Ufotable spiraling wave crest + foam pearls
        body =
          `<defs><linearGradient id="${g1}" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#bae6fd"/><stop offset="48%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>` +
          `<circle cx="12" cy="12" r="9.6" fill="rgba(14,116,144,0.24)" stroke="rgba(56,189,248,0.42)" stroke-width="1.0"/>` +
          `<path d="M12 2.5C7.9 7.1 4.8 10.5 4.8 14.3a7.2 7.2 0 0 0 14.4 0c0-3.8-3.1-7.2-7.2-11.8Z" fill="url(#${g1})" fill-opacity="0.38" stroke="url(#${g1})" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<path d="M7.4 14.4c1.4 2.3 4.8 2.8 6.8 1.0 1.6-1.4 1.6-3.7.1-4.9-1.2-1.0-3.0-.7-3.6.6-.4.9.1 2.0 1.2 2.2" stroke="#f0f9ff" stroke-width="1.5" stroke-linecap="round" fill="none"/>` +
          `<circle cx="9.3" cy="8.9" r="1.15" fill="#ffffff"/><circle cx="15.8" cy="10.4" r="0.75" fill="#e0f2fe"/>`;
        break;

      case 'flame': // Viêm Trụ: Rengoku Kyojuro iconic blazing Tsuba flame crest
        body =
          `<defs><linearGradient id="${g1}" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="45%" stop-color="#f97316"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs>` +
          `<path d="M12 1.8c2.1 3.4 6.7 5.8 6.7 11.3a6.7 6.7 0 0 1-13.4 0c0-3.3 1.8-5.9 3.6-7.8-.2 2.2.8 3.4 2.1 3.7-.5-2.5.4-5.1 1.0-7.2Z" fill="url(#${g1})" fill-opacity="0.36" stroke="url(#${g1})" stroke-width="1.7" stroke-linejoin="round"/>` +
          `<path d="M12.2 8.4c1.6 1.8 3.1 3.4 3.1 5.7a3.2 3.2 0 0 1-6.4 0c0-1.8 1.1-3.4 3.3-5.7Z" fill="url(#${g1})"/>` +
          `<path d="M12.1 12.1c.7.9 1.3 1.7 1.3 2.8a1.4 1.4 0 0 1-2.8 0c0-.9.5-1.7 1.5-2.8Z" fill="#ffffff"/>`;
        break;

      case 'wisteria': // Trùng Trụ: Shinobu Kocho dual-tone butterfly hairpin ornament
        body =
          `<defs><linearGradient id="${g1}" x1="3" y1="5" x2="21" y2="19" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f5d0fe"/><stop offset="52%" stop-color="#c084fc"/><stop offset="100%" stop-color="#5eead4"/></linearGradient></defs>` +
          `<path d="M12 11.4C9.0 4.6 2.5 4.4 3.1 10.2c.2 2.4 2.7 3.6 5.8 3.1-2.6 1.4-3.3 4.7-.9 6.0 2.2 1.2 3.9-1.4 4.0-4.6" fill="url(#${g1})" fill-opacity="0.36" stroke="#e879f9" stroke-width="1.55" stroke-linejoin="round"/>` +
          `<path d="M12 11.4c3.0-6.8 9.5-7.0 8.9-1.2-.2 2.4-2.7 3.6-5.8 3.1 2.6 1.4 3.3 4.7.9 6.0-2.2 1.2-3.9-1.4-4.0-4.6" fill="url(#${g1})" fill-opacity="0.34" stroke="#5eead4" stroke-width="1.55" stroke-linejoin="round"/>` +
          `<circle cx="6.8" cy="9.4" r="1.0" fill="#fefcff"/><circle cx="17.2" cy="9.4" r="1.0" fill="#ccfbf1"/>` +
          `<path d="M12 6.6v11.2M10.2 4.5c.9.7 1.5 1.5 1.8 2.4.3-.9.9-1.7 1.8-2.4" stroke="#ffffff" stroke-width="1.35" stroke-linecap="round" fill="none"/>`;
        break;

      case 'royal_wisteria': // Chúa Công: Imperial Ubuyashiki Kamon crest & golden lantern
        body =
          `<defs><linearGradient id="${g1}" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="55%" stop-color="#facc15"/><stop offset="100%" stop-color="#e879f9"/></linearGradient></defs>` +
          `<circle cx="12" cy="12" r="9.6" fill="rgba(234,179,8,0.16)" stroke="url(#${g1})" stroke-width="1.45"/>` +
          `<rect x="7.0" y="6.6" width="10" height="10.8" rx="3.6" fill="rgba(250,204,21,0.26)" stroke="#fde047" stroke-width="1.5"/>` +
          `<path d="M9.2 4.5h5.6M9.4 19.5h5.2" stroke="#facc15" stroke-width="1.6" stroke-linecap="round"/>` +
          `<path d="M12 8.5l1.1 2.4 2.4 1.1-2.4 1.1-1.1 2.4-1.1-2.4-2.4-1.1 2.4-1.1Z" fill="#ffffff"/>` +
          `<circle cx="8.8" cy="18.2" r="0.85" fill="#e879f9"/><circle cx="15.2" cy="18.2" r="0.85" fill="#e879f9"/>`;
        break;

      case 'sound': // Âm Trụ: Tengen Uzui flamboyant faceted shinobi jewel & soundburst
        body =
          `<defs><linearGradient id="${g1}" x1="5" y1="3" x2="19" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fde047"/><stop offset="52%" stop-color="#f472b6"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient></defs>` +
          `<polygon points="12,2.4 19.0,7.8 16.4,19.6 7.6,19.6 5.0,7.8" fill="url(#${g1})" fill-opacity="0.32" stroke="#fde047" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<polygon points="12,5.8 15.8,9.0 14.3,16.2 9.7,16.2 8.2,9.0" fill="url(#${g1})"/>` +
          `<path d="M12 2.4v3.4M19 7.8l-3.2 1.2M5 7.8l3.2 1.2M2.3 12h1.9M19.8 12h1.9" stroke="#ffffff" stroke-width="1.25" stroke-linecap="round"/>` +
          `<circle cx="12" cy="11.2" r="1.35" fill="#ffffff"/>`;
        break;

      case 'mist': // Hà Trụ: Muichiro layered silver-mint kasumi mist & crescent haze
        body =
          `<defs><linearGradient id="${g1}" x1="3" y1="6" x2="21" y2="18" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f0fdfa"/><stop offset="55%" stop-color="#5eead4"/><stop offset="100%" stop-color="#0d9488"/></linearGradient></defs>` +
          `<circle cx="12" cy="12" r="9.2" fill="rgba(45,212,191,0.16)" stroke="rgba(94,234,212,0.38)" stroke-width="1.05"/>` +
          `<path d="M4.2 9.0h10.6a2.3 2.3 0 1 0-2.1-3.2" stroke="url(#${g1})" stroke-width="1.8" stroke-linecap="round" fill="none"/>` +
          `<path d="M3.0 12.8h15.4a2.4 2.4 0 1 1-2.1 3.5" stroke="#ccfbf1" stroke-width="1.85" stroke-linecap="round" fill="none"/>` +
          `<path d="M5.6 16.6h8.2" stroke="#2dd4bf" stroke-width="1.75" stroke-linecap="round"/>` +
          `<circle cx="17.5" cy="7.2" r="1.05" fill="#ffffff"/>`;
        break;

      case 'love': // Luyến Trụ: Mitsuri sakura heart-whip blade & lime clover accent
        body =
          `<defs><linearGradient id="${g1}" x1="5" y1="5" x2="19" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fbcfe8"/><stop offset="55%" stop-color="#f472b6"/><stop offset="100%" stop-color="#a3e635"/></linearGradient></defs>` +
          `<path d="M12 20.1s-7.4-4.5-7.4-9.9a4.3 4.3 0 0 1 7.4-3.0 4.3 4.3 0 0 1 7.4 3.0c0 5.4-7.4 9.9-7.4 9.9Z" fill="url(#${g1})" fill-opacity="0.38" stroke="#f472b6" stroke-width="1.7" stroke-linejoin="round"/>` +
          `<path d="M8.3 10.6c1.2-1.6 3.7-.9 3.7 1.1 0-2.0 2.5-2.7 3.7-1.1 1.0 1.4-.4 3.6-3.7 5.8-3.3-2.2-4.7-4.4-3.7-5.8Z" fill="rgba(255,255,255,0.22)"/>` +
          `<path d="M9.3 11.5l2.7 2.5 2.7-2.5" stroke="#bef264" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
          `<circle cx="12" cy="8.8" r="0.95" fill="#ffffff"/>`;
        break;

      case 'serpent': // Xà Trụ: Obanai coiling white serpent Kaburamaru with emerald eye
        body =
          `<defs><linearGradient id="${g1}" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f8fafc"/><stop offset="55%" stop-color="#c084fc"/><stop offset="100%" stop-color="#7e22ce"/></linearGradient></defs>` +
          `<path d="M17.8 5.4c-4.4-2.0-9.8-.3-9.8 3.1 0 3.8 8.2 3.0 8.2 6.9 0 3.3-5.5 4.6-9.8 2.5" stroke="url(#${g1})" stroke-width="2.35" stroke-linecap="round" fill="none"/>` +
          `<path d="M17.8 5.4c-4.4-2.0-9.8-.3-9.8 3.1 0 3.8 8.2 3.0 8.2 6.9" stroke="#ffffff" stroke-width="1.0" stroke-linecap="round" fill="none"/>` +
          `<circle cx="18.1" cy="5.4" r="1.95" fill="#f8fafc" stroke="#a855f7" stroke-width="0.9"/>` +
          `<circle cx="18.3" cy="5.3" r="0.95" fill="#10b981"/>`;
        break;

      case 'wind': // Phong Trụ: Sanemi razor-sharp emerald kamaitachi cyclone blades
        body =
          `<defs><linearGradient id="${g1}" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#dcfce7"/><stop offset="55%" stop-color="#4ade80"/><stop offset="100%" stop-color="#15803d"/></linearGradient></defs>` +
          `<path d="M12 9.2c-.3-4.6 4.6-6.9 7.8-4.4-2.4.6-4.1 2.2-4.6 4.8M14.8 12c4.6-.3 6.9 4.6 4.4 7.8-.6-2.4-2.2-4.1-4.8-4.6M12 14.8c.3 4.6-4.6 6.9-7.8 4.4 2.4-.6 4.1-2.2 4.6-4.8M9.2 12c-4.6.3-6.9-4.6-4.4-7.8.6 2.4 2.2 4.1 4.8 4.6" fill="url(#${g1})" fill-opacity="0.34" stroke="url(#${g1})" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<circle cx="12" cy="12" r="2.5" fill="#ffffff" stroke="#22c55e" stroke-width="1.1"/>`;
        break;

      case 'stone': // Nham Trụ: Gyomei sacred crimson-amber Juzu prayer beads & vajra core
        body =
          `<defs><linearGradient id="${g1}" x1="6" y1="6" x2="18" y2="18" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#d97706"/></linearGradient></defs>` +
          `<circle cx="12" cy="12" r="8.7" stroke="rgba(251,191,36,0.38)" stroke-width="0.95" stroke-dasharray="2 2"/>` +
          `<polygon points="12,7.0 17.0,12 12,17.0 7.0,12" fill="url(#${g1})" fill-opacity="0.42" stroke="#fde68a" stroke-width="1.45" stroke-linejoin="round"/>` +
          `<circle cx="12" cy="12" r="1.4" fill="#ffffff"/>` +
          `<circle cx="12" cy="3.1" r="1.75" fill="#ef4444" stroke="#fca5a5" stroke-width="0.55"/><circle cx="18.3" cy="5.7" r="1.7" fill="#f59e0b" stroke="#fde68a" stroke-width="0.55"/>` +
          `<circle cx="20.9" cy="12" r="1.75" fill="#ef4444" stroke="#fca5a5" stroke-width="0.55"/><circle cx="18.3" cy="18.3" r="1.7" fill="#f59e0b" stroke="#fde68a" stroke-width="0.55"/>` +
          `<circle cx="12" cy="20.9" r="1.75" fill="#ef4444" stroke="#fca5a5" stroke-width="0.55"/><circle cx="5.7" cy="18.3" r="1.7" fill="#f59e0b" stroke="#fde68a" stroke-width="0.55"/>` +
          `<circle cx="3.1" cy="12" r="1.75" fill="#ef4444" stroke="#fca5a5" stroke-width="0.55"/><circle cx="5.7" cy="5.7" r="1.7" fill="#f59e0b" stroke="#fde68a" stroke-width="0.55"/>`;
        break;

      case 'sun_water': // Tanjiro: Hinokami Solar Disk intertwined with Flowing Water Dragon arc
        body =
          `<defs><linearGradient id="${g1}" x1="4" y1="3" x2="20" y2="14" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#ef4444"/></linearGradient><linearGradient id="${g2}" x1="4" y1="12" x2="20" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#e0f2fe"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs>` +
          `<circle cx="12" cy="10.8" r="4.9" fill="url(#${g1})" fill-opacity="0.45" stroke="url(#${g1})" stroke-width="1.65"/>` +
          `<circle cx="12" cy="10.8" r="2.0" fill="#fef9c3"/>` +
          `<path d="M12 2.2v2.4M4.8 4.8l1.8 1.8M19.2 4.8l-1.8 1.8M2.5 10.8h2.3M19.2 10.8h2.3" stroke="#fde047" stroke-width="1.55" stroke-linecap="round"/>` +
          `<path d="M3.8 15.6c2.4 3.4 7.6 4.2 11.8 1.8 2.4-1.3 4.0-3.6 4.4-6.0" stroke="url(#${g2})" stroke-width="2.2" stroke-linecap="round" fill="none"/>` +
          `<path d="M6.2 18.8c2.8 1.5 6.8 1.3 9.6-.6" stroke="#bae6fd" stroke-width="1.25" stroke-linecap="round" fill="none"/>`;
        break;

      case 'nezuko': // Nezuko: Emerald bamboo muzzle + Crimson-Rose Blood Demon lotus flame
        body =
          `<defs><linearGradient id="${g1}" x1="12" y1="2" x2="12" y2="12" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffe4e6"/><stop offset="55%" stop-color="#fb7185"/><stop offset="100%" stop-color="#e11d48"/></linearGradient></defs>` +
          `<path d="M12 2.2c2.2 2.4 3.8 4.4 2.6 6.6-1.2 1.0-4.0 1.0-5.2 0-1.2-2.2.4-4.2 2.6-6.6Z" fill="url(#${g1})" stroke="#fda4af" stroke-width="1.1" stroke-linejoin="round"/>` +
          `<path d="M8.2 5.4c1.2 1.1 1.9 2.2 1.6 3.5M15.8 5.4c-1.2 1.1-1.9 2.2-1.6 3.5" stroke="#fb7185" stroke-width="1.25" stroke-linecap="round" fill="none"/>` +
          `<rect x="3.8" y="10.4" width="16.4" height="5.6" rx="2.5" fill="rgba(34,197,94,0.34)" stroke="#4ade80" stroke-width="1.6"/>` +
          `<line x1="8.8" y1="10.4" x2="8.8" y2="16.0" stroke="#bbf7d0" stroke-width="1.35"/><line x1="15.2" y1="10.4" x2="15.2" y2="16.0" stroke="#bbf7d0" stroke-width="1.35"/>` +
          `<path d="M6.5 18.6c3.4 1.2 7.6 1.2 11.0 0" stroke="#f472b6" stroke-width="1.35" stroke-linecap="round" fill="none"/>`;
        break;

      case 'thunder': // Zenitsu: Godspeed golden thunderbolt + azure plasma arc
        body =
          `<defs><linearGradient id="${g1}" x1="6" y1="2" x2="18" y2="22" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffffff"/><stop offset="42%" stop-color="#fde047"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient></defs>` +
          `<path d="M4.8 9.2c1.8-3.6 5.6-5.8 9.8-5.4M19.2 14.8c-1.8 3.6-5.6 5.8-9.8 5.4" stroke="#38bdf8" stroke-width="1.2" stroke-linecap="round" fill="none"/>` +
          `<polygon points="13.8,1.8 5.2,13.0 11.4,13.0 10.0,22.2 19.0,10.6 12.8,10.6" fill="url(#${g1})" fill-opacity="0.45" stroke="url(#${g1})" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<polyline points="13.1,5.2 8.2,12.1 12.4,12.1 11.2,18.5" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
        break;

      case 'beast': // Inosuke: Crossed serrated dual Nichirin blades with chipped fangs
        body =
          `<defs><linearGradient id="${g1}" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f8fafc"/><stop offset="52%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>` +
          `<path d="M4.0 19.8L19.6 4.2M4.4 4.2l15.6 15.6" stroke="url(#${g1})" stroke-width="2.35" stroke-linecap="round"/>` +
          // Serrated fang notches along blades
          `<circle cx="9.2" cy="9.2" r="1.05" fill="#090d16" stroke="#93c5fd" stroke-width="0.8"/><circle cx="14.8" cy="9.2" r="1.05" fill="#090d16" stroke="#93c5fd" stroke-width="0.8"/>` +
          `<circle cx="9.2" cy="14.8" r="1.05" fill="#090d16" stroke="#93c5fd" stroke-width="0.8"/><circle cx="14.8" cy="14.8" r="1.05" fill="#090d16" stroke="#93c5fd" stroke-width="0.8"/>` +
          `<path d="M12 9.1l1.1 1.8 1.8 1.1-1.8 1.1-1.1 1.8-1.1-1.8-1.8-1.1 1.8-1.1Z" fill="#ffffff"/>`;
        break;

      case 'cosmic': // WLOP Cosmic: Dual orbital rings & astral polaris star
        body =
          `<defs><linearGradient id="${g1}" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#e0f2fe"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs>` +
          `<ellipse cx="12" cy="12" rx="9.8" ry="4.0" transform="rotate(-28 12 12)" stroke="url(#${g1})" stroke-width="1.5" fill="none"/>` +
          `<ellipse cx="12" cy="12" rx="9.8" ry="4.0" transform="rotate(32 12 12)" stroke="rgba(192,132,252,0.52)" stroke-width="1.1" fill="none"/>` +
          `<path d="M12 3.4l1.9 6.7 6.7 1.9-6.7 1.9-1.9 6.7-1.9-6.7-6.7-1.9 6.7-1.9Z" fill="#ffffff"/>`;
        break;

      case 'obsidian': // Midnight Obsidian: Cut dark-prism crystal & silver bevels
        body =
          `<defs><linearGradient id="${g1}" x1="5" y1="2" x2="19" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f8fafc"/><stop offset="50%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/></linearGradient></defs>` +
          `<polygon points="12,2.2 19.2,8.4 16.4,20.8 7.6,20.8 4.8,8.4" fill="rgba(148,163,184,0.24)" stroke="url(#${g1})" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<polygon points="12,2.2 19.2,8.4 12,12.4" fill="rgba(255,255,255,0.28)"/>` +
          `<path d="M12 2.2v18.6M4.8 8.4L12 12.4l7.2-4.0" stroke="#f8fafc" stroke-width="1.15" stroke-linejoin="round" fill="none"/>`;
        break;

      case 'moon': // Nguyệt Hô Hấp: Crimson-violet crescent moon & swirling Kokushibo moon-blades
        body =
          `<defs><linearGradient id="${g1}" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f3e8ff"/><stop offset="52%" stop-color="#c084fc"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient></defs>` +
          `<path d="M15.8 3.1a9.0 9.0 0 1 0 5.0 15.2A7.5 7.5 0 0 1 15.8 3.1Z" fill="url(#${g1})" fill-opacity="0.38" stroke="url(#${g1})" stroke-width="1.7" stroke-linejoin="round"/>` +
          `<path d="M17.4 5.8l1.0 2.4 2.4 1.0-2.4 1.0-1.0 2.4-1.0-2.4-2.4-1.0 2.4-1.0Z" fill="#38bdf8"/>` +
          `<path d="M13.2 12.0c.9-.5 2.0-.4 2.7.3-.9.2-1.8.9-2.1 1.9-.6-.7-.9-1.5-.6-2.2Z" fill="#fef08a"/>` +
          `<circle cx="19.2" cy="13.2" r="0.95" fill="#ffffff"/>`;
        break;

      default: // Yoriichi: Primordial Sun Breathing 12-Ray Hanafuda Solar Halo
        body =
          `<defs><radialGradient id="${g1}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fef9c3"/><stop offset="55%" stop-color="#f97316"/><stop offset="100%" stop-color="#dc2626"/></radialGradient></defs>` +
          `<circle cx="12" cy="12" r="9.4" stroke="rgba(251,146,60,0.34)" stroke-width="1.0"/>` +
          `<circle cx="12" cy="12" r="5.3" fill="url(#${g1})" stroke="#fde047" stroke-width="1.65"/>` +
          `<circle cx="12" cy="12" r="2.1" fill="#ffffff"/>` +
          `<path d="M12 1.8v2.9M12 19.3V22.2M1.8 12h2.9M19.3 12h2.9M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M19.2 4.8l-2.1 2.1M6.9 17.1l-2.1 2.1" stroke="#fde047" stroke-width="1.65" stroke-linecap="round"/>`;
        break;
    }

    const out = `<svg class="agy-sem-svg agy-elem-svg" data-elem="${key}" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
    return cacheSetBounded(elemSvgCache, cacheKey, out);
  }

  function getFuncSvg(kind, size = 13) {
    const sz = safeIconSize(size, 13);
    const cleanKind = String(kind || '');
    const cacheKey = `${cleanKind}|${sz}`;
    if (funcSvgCache.has(cacheKey)) return funcSvgCache.get(cacheKey);

    let body = '';
    switch (cleanKind) {
      case 'breathing_forms': // Ornate Nichirin Tsuba guard with 4-lobed swordsmith cutouts
        body =
          `<circle cx="12" cy="12" r="9.2" fill="rgba(255,255,255,0.09)" stroke="currentColor" stroke-width="1.65"/>` +
          `<circle cx="12" cy="12" r="6.4" stroke="var(--skill-primary, #fde047)" stroke-width="1.05" stroke-dasharray="2.6 1.8"/>` +
          `<rect x="10.4" y="8.8" width="3.2" height="6.4" rx="0.9" fill="var(--skill-primary, #fde047)" fill-opacity="0.28" stroke="var(--skill-primary, #fde047)" stroke-width="1.35"/>` +
          `<path d="M12 2.8v2.8M12 18.4v2.8M2.8 12h2.8M18.4 12h2.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>`;
        break;

      case 'katana_cast': // Blazing crescent sword slash + gleaming Nichirin blade
        body =
          `<path d="M3.8 18.4C10.2 20.2 19.6 14.0 19.8 4.2" stroke="var(--skill-primary, #fde047)" stroke-width="2.35" stroke-linecap="round" fill="none"/>` +
          `<path d="M4.0 20.0L19.2 4.8" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>` +
          `<path d="M6.0 14.4l3.6 3.6" stroke="currentColor" stroke-width="1.95" stroke-linecap="round"/>` +
          `<circle cx="18.6" cy="5.4" r="1.25" fill="#ffffff"/>`;
        break;

      case 'nichirin_item': // Precision curved katana blade for individual technique row
        body =
          `<path d="M4.2 19.8C9.8 14.6 14.8 9.6 19.8 4.2" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" fill="none"/>` +
          `<path d="M6.8 13.8l3.4 3.4" stroke="#ffffff" stroke-width="1.85" stroke-linecap="round"/>` +
          `<circle cx="5.2" cy="18.8" r="1.0" fill="currentColor"/>`;
        break;

      case 'sfx_on': // Resonating Kagura acoustic chime & dual soundwaves
        body =
          `<path d="M11.2 4.8L6.6 8.8H3.4v6.4h3.2l4.6 4.0V4.8Z" fill="rgba(255,255,255,0.20)" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<path d="M14.8 8.6a4.6 4.6 0 0 1 0 6.8M17.8 5.8a8.4 8.4 0 0 1 0 12.4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" fill="none"/>`;
        break;

      case 'sfx_off': // Muted acoustic chime with crimson cross slash
        body =
          `<path d="M11.2 4.8L6.6 8.8H3.4v6.4h3.2l4.6 4.0V4.8Z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<path d="M15.2 9.2l5.2 5.6M20.4 9.2l-5.2 5.6" stroke="#fb7185" stroke-width="1.85" stroke-linecap="round"/>`;
        break;

      case 'kv_cache': // 3-Tier Crystalline KV Memory Vault with glowing core
        body =
          `<polygon points="12,3.0 20.5,7.6 12,12.2 3.5,7.6" fill="rgba(56,189,248,0.32)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
          `<polyline points="3.5,12.0 12,16.6 20.5,12.0" stroke="#38bdf8" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
          `<polyline points="3.5,16.2 12,20.8 20.5,16.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
          `<circle cx="12" cy="7.6" r="1.3" fill="#ffffff"/>`;
        break;

      case 'draft_brush': // Traditional Shodo calligraphy brush & ink stroke
        body =
          `<path d="M17.9 3.5a2.3 2.3 0 0 1 3.2 3.2L10.8 17.0l-4.6 1.4 1.4-4.6L17.9 3.5Z" fill="rgba(255,255,255,0.14)" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<path d="M15.4 6.0l2.6 2.6" stroke="#fde047" stroke-width="1.4" stroke-linecap="round"/>` +
          `<path d="M4.0 20.8c2.8-.6 5.8-.2 8.8 0" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" fill="none"/>`;
        break;

      case 'session_sum': // Celestial sandglass of cumulative session output
        body =
          `<path d="M6.0 3.2h12.0M6.0 20.8h12.0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>` +
          `<path d="M7.6 3.2c0 4.6 4.4 6.2 4.4 8.8s-4.4 4.2-4.4 8.8M16.4 3.2c0 4.6-4.4 6.2-4.4 8.8s4.4 4.2 4.4 8.8" fill="rgba(250,204,21,0.16)" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
          `<circle cx="12" cy="12" r="1.15" fill="#fde047"/>` +
          `<path d="M9.4 18.4h5.2" stroke="#fde047" stroke-width="1.6" stroke-linecap="round"/>`;
        break;

      case 'model_quota': // Octagonal Nichirin chronometer & precision needle
        body =
          `<polygon points="8.4,2.8 15.6,2.8 21.2,8.4 21.2,15.6 15.6,21.2 8.4,21.2 2.8,15.6 2.8,8.4" fill="rgba(255,255,255,0.08)" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>` +
          `<path d="M7.2 14.8a5.6 5.6 0 1 1 9.6 0" stroke="rgba(253,224,71,0.65)" stroke-width="1.25" stroke-linecap="round" fill="none"/>` +
          `<path d="M12 12.4l4.2-3.6" stroke="#fde047" stroke-width="1.85" stroke-linecap="round"/>` +
          `<circle cx="12" cy="12.4" r="1.75" fill="currentColor"/>`;
        break;

      case 'yoriichi_sun': // Primordial Sun Crest with Hanafuda solar rays
        body =
          `<circle cx="12" cy="12" r="5.1" fill="#ef4444" stroke="#fde047" stroke-width="1.7"/>` +
          `<circle cx="12" cy="12" r="1.9" fill="#fef08a"/>` +
          `<path d="M12 2.0v2.9M12 19.1V22M2.0 12h2.9M19.1 12H22M4.9 4.9l2.1 2.1M17.0 17.0l2.1 2.1M19.1 4.9l-2.1 2.1M7.0 17.0l-2.1 2.1" stroke="#fde047" stroke-width="1.7" stroke-linecap="round"/>`;
        break;

      case 'kagura_bell': // Edo Glass Furin Wind-Chime + fluttering vermilion Tanzaku slip
        body =
          `<line x1="12" y1="1.8" x2="12" y2="4.3" stroke="#fde047" stroke-width="1.6" stroke-linecap="round"/>` +
          `<path d="M6.3 10.8a5.7 5.7 0 0 1 11.4 0c0 1.4-.4 2.3-1.1 2.6H7.4c-.7-.3-1.1-1.2-1.1-2.6Z" fill="rgba(250,204,21,0.24)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
          `<path d="M8.4 8.2a4.0 4.0 0 0 1 4.6-2.2" stroke="#ffffff" stroke-width="1.05" stroke-linecap="round" fill="none"/>` +
          `<circle cx="12" cy="13.5" r="1.4" fill="#fde047"/>` +
          `<path d="M12 14.9l-.6 1.5h2.7l-1.4 5.2-3.2-.8 1.4-4.4" fill="rgba(239,68,68,0.82)" stroke="#fda4af" stroke-width="1.15" stroke-linejoin="round"/>` +
          `<path d="M3.8 8.0a7.6 7.6 0 0 0-.7 4.5M20.2 8.0a7.6 7.6 0 0 1 .7 4.5" stroke="#fde047" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
        break;

      case 'cinema_mask': // Urokodaki Warding Kitsune Fox Mask with Solar Forehead & Cheek Stripes
        body =
          `<path d="M5.0 9.6L6.3 2.8l4.2 3.8h3.0l4.2-3.8 1.3 6.8c.4 5.3-3.0 9.6-7.0 11.6-4.0-2.0-7.4-6.3-7.0-11.6Z" fill="rgba(248,250,252,0.18)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
          `<circle cx="12" cy="9.0" r="1.8" fill="#ef4444" stroke="#fde047" stroke-width="0.95"/>` +
          `<path d="M7.9 12.4c1.0-1.0 2.3-1.0 3.2.1M16.1 12.4c-1.0-1.0-2.3-1.0-3.2.1" stroke="#fde047" stroke-width="1.6" stroke-linecap="round" fill="none"/>` +
          `<path d="M6.9 15.1l2.4.7M7.4 16.9l2.1.6M17.1 15.1l-2.4.7M16.6 16.9l-2.1.6" stroke="#ef4444" stroke-width="1.35" stroke-linecap="round"/>`;
        break;

      case 'context_scroll': // Wisteria Estate Imperial Scroll (Ngữ cảnh Phiên)
        body =
          `<rect x="3.2" y="4.5" width="2.8" height="15" rx="1.3" fill="rgba(250,204,21,0.32)" stroke="currentColor" stroke-width="1.5"/>` +
          `<rect x="18.0" y="4.5" width="2.8" height="15" rx="1.3" fill="rgba(250,204,21,0.32)" stroke="currentColor" stroke-width="1.5"/>` +
          `<path d="M6.0 6.2h12.0v11.6H6.0Z" fill="rgba(255,255,255,0.10)" stroke="currentColor" stroke-width="1.45"/>` +
          `<path d="M8.6 9.8h6.8M8.6 12.6h4.8M8.6 15.2h6.0" stroke="#fde047" stroke-width="1.35" stroke-linecap="round"/>`;
        break;

      case 'compact_seal': // Nichirin Compression Seal (/compact)
        body =
          `<circle cx="12" cy="12" r="8.8" fill="rgba(56,189,248,0.14)" stroke="currentColor" stroke-width="1.55" stroke-dasharray="3.2 2"/>` +
          `<path d="M7.2 7.2L10.4 10.4M10.4 7.4v3.0H7.4M16.8 16.8l-3.2-3.2M13.6 16.6v-3.0h3.0M16.8 7.2l-3.2 3.2M16.6 10.4h-3.0V7.4M7.2 16.8l3.2-3.2M7.4 13.6h3.0v3.0" stroke="#fde047" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
          `<circle cx="12" cy="12" r="1.45" fill="#ffffff"/>`;
        break;

      case 'burn_velocity': // Forge Flame Velocity Spark (Tốc độ rèn Token)
        body =
          `<path d="M13.2 2.6L6.0 13.0h5.6l-1.2 8.4L18.4 11.0h-5.6l.4-8.4Z" fill="rgba(250,204,21,0.32)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
          `<circle cx="18.6" cy="6.2" r="1.15" fill="#fde047"/>`;
        break;

      case 'task_scroll': // Kasugai Mission Checklist Plaque (Tiến độ nhiệm vụ)
        body =
          `<rect x="4.2" y="3.4" width="15.6" height="17.2" rx="2.8" fill="rgba(255,255,255,0.09)" stroke="currentColor" stroke-width="1.6"/>` +
          `<path d="M7.6 9.2l1.6 1.6 3.0-3.0M7.6 15.0l1.6 1.6 3.0-3.0" stroke="#4ade80" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
          `<path d="M14.2 9.4h2.8M14.2 15.2h2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
        break;

      default:
        body = `<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.8"/>`;
        break;
    }

    const out = `<svg class="agy-sem-svg" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
    return cacheSetBounded(funcSvgCache, cacheKey, out);
  }

  const API = {
    parseSessionIdentity,
    buildSessionAvatar,
    normalizeElementKey,
    getElementalSvg,
    getFuncSvg
  };

  if (typeof window !== 'undefined') window.__AGY_KNY_ICONS__ = API;
  if (typeof globalThis !== 'undefined') globalThis.__AGY_KNY_ICONS__ = API;
})();
