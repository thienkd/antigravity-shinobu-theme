(() => {
  'use strict';

  /**
   * Semantic & Elemental Vector Icon System for Antigravity Custom Theme
   * Exposes window.__AGY_KNY_ICONS__:
   *  - buildSessionAvatar(docTitle, cid, size): Bespoke Session Emblem SVG representing the active workspace/conversation
   *  - getElementalSvg(modeOrChar, size): 16 Theme-specific Elemental Crest SVGs (Water, Flame, Thunder, Wisteria, etc.)
   *  - getFuncSvg(kind, size): Functional Swordsmanship & Telemetry SVGs matching exact button semantics
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
      ['#f97316', '#facc15'],
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
    let innerGlyph = '';

    if (info.archetype === 'media') {
      // Cinema play prism + lofi acoustic wave
      innerGlyph = `
        <polygon points="9.2,7.2 16.2,11.5 9.2,15.8" fill="#ffffff"/>
        <path d="M17.4 8.6c1.2 1.5 1.2 4.3 0 5.8" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      `;
    } else if (info.archetype === 'design') {
      // Architectural 3D isometric prism / diamond studio emblem
      innerGlyph = `
        <polygon points="12,5.6 17.8,9 17.8,15 12,18.4 6.2,15 6.2,9" fill="rgba(255,255,255,0.16)" stroke="#ffffff" stroke-width="1.45" stroke-linejoin="round"/>
        <path d="M12 5.6v12.8M6.2 9l5.8 3.2L17.8 9" stroke="#ffffff" stroke-width="1.25" stroke-linecap="round" fill="none"/>
      `;
    } else if (info.archetype === 'data') {
      // Neural / Data constellation nodes
      innerGlyph = `
        <circle cx="8" cy="12" r="1.9" fill="#ffffff"/>
        <circle cx="15.5" cy="8.2" r="1.8" fill="#ffffff"/>
        <circle cx="15.5" cy="15.8" r="1.8" fill="#ffffff"/>
        <path d="M9.6 11.2l4.3-2.2M9.6 12.8l4.3 2.2M15.5 10v4" stroke="#ffffff" stroke-width="1.35" stroke-linecap="round"/>
      `;
    } else if (info.archetype === 'forge') {
      // Code terminal brackets & spark
      innerGlyph = `
        <path d="M9.5 8.5L6.3 12l3.2 3.5M14.5 8.5l3.2 3.5-3.2 3.5" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <line x1="12.8" y1="7.5" x2="11.2" y2="16.5" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
      `;
    } else {
      // Crisp project monogram crest
      innerGlyph = `
        <text x="12" y="15.6" text-anchor="middle" fill="#ffffff" font-size="10.8" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Inter, Segoe UI, system-ui, Noto Sans, Ubuntu, Cantarell, Noto Sans CJK JP, sans-serif">${escapeXml(info.initial)}</text>
      `;
    }

    const svg = `<svg class="agy-sem-svg agy-session-emblem" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      `<defs><linearGradient id="${gid}" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0%" stop-color="${info.c1}"/><stop offset="100%" stop-color="${info.c2}"/>` +
      `</linearGradient></defs>` +
      `<circle cx="12" cy="12" r="10.2" fill="url(#${gid})" fill-opacity="0.32" stroke="url(#${gid})" stroke-width="1.9"/>` +
      `<circle cx="12" cy="12" r="8.1" fill="rgba(10, 12, 24, 0.55)"/>` +
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
    let body = '';

    switch (key) {
      case 'water': // Thủy Trụ: Ufotable spiraling water wave & crystal droplet
        body = `
          <path d="M12 2.6C8.2 7.2 5.2 10.4 5.2 14.1a6.8 6.8 0 0 0 13.6 0c0-3.7-3-6.9-6.8-11.5Z" fill="rgba(56,189,248,0.28)" stroke="#38bdf8" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M7.6 14.6c1.5 1.8 4.4 2.1 6.3.4 1.3-1.1 1.4-3 .2-4.1-1-.9-2.6-.7-3.2.4" stroke="#e0f2fe" stroke-width="1.55" stroke-linecap="round" fill="none"/>
          <circle cx="9.6" cy="9.4" r="1.15" fill="#ffffff"/>
        `;
        break;

      case 'flame': // Viêm Trụ: Blazing Rengoku Tsuba flame crest
        body = `
          <path d="M12 2.2c1.8 3.5 5.8 5.6 5.8 10.7a5.8 5.8 0 0 1-11.6 0c0-2.9 1.6-5.2 3.1-6.9-.2 2.1.8 3.2 2.1 3.5-.4-2.4.5-5.1.6-7.3Z" fill="rgba(249,115,22,0.34)" stroke="#f97316" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M12.2 9.8c1.3 1.5 2.4 2.8 2.4 4.7a2.5 2.5 0 0 1-5 0c0-1.5.9-2.8 2.6-4.7Z" fill="#fde047"/>
        `;
        break;

      case 'wisteria': // Trùng Trụ: Shinobu twin butterfly wings
        body = `
          <path d="M12 11.5C9.2 5.2 3.2 4.8 3.6 10.2c.2 2.4 2.6 3.5 5.6 3.1-2.4 1.4-3.1 4.5-.8 5.8 2.1 1.2 3.6-1.4 3.6-4.4" fill="rgba(192,132,252,0.32)" stroke="#c084fc" stroke-width="1.65" stroke-linejoin="round"/>
          <path d="M12 11.5c2.8-6.3 8.8-6.7 8.4-1.3-.2 2.4-2.6 3.5-5.6 3.1 2.4 1.4 3.1 4.5.8 5.8-2.1 1.2-3.6-1.4-3.6-4.4" fill="rgba(94,234,212,0.28)" stroke="#5eead4" stroke-width="1.65" stroke-linejoin="round"/>
          <line x1="12" y1="6.8" x2="12" y2="17.8" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
        `;
        break;

      case 'royal_wisteria': // Chúa Công: Imperial golden lantern & wisteria blossom
        body = `
          <rect x="6.5" y="6.2" width="11" height="11.6" rx="3.8" fill="rgba(250,204,21,0.25)" stroke="#facc15" stroke-width="1.7"/>
          <line x1="9" y1="4" x2="15" y2="4" stroke="#facc15" stroke-width="1.7" stroke-linecap="round"/>
          <line x1="9.2" y1="20" x2="14.8" y2="20" stroke="#e879f9" stroke-width="1.7" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="2.5" fill="#fef08a"/>
        `;
        break;

      case 'sound': // Âm Trụ: Flashy shinobi gem + acoustic burst rays
        body = `
          <polygon points="12,3 18.5,8.2 16,19.2 8,19.2 5.5,8.2" fill="rgba(244,114,182,0.28)" stroke="#facc15" stroke-width="1.75" stroke-linejoin="round"/>
          <polygon points="12,6.8 15.2,9.6 13.9,15.6 10.1,15.6 8.8,9.6" fill="#f472b6"/>
          <path d="M2.6 12h1.8M19.6 12h1.8" stroke="#fde047" stroke-width="1.6" stroke-linecap="round"/>
        `;
        break;

      case 'mist': // Hà Trụ: Layered drifting turquoise mist clouds
        body = `
          <path d="M4 9.2h10.5a2.4 2.4 0 1 0-2.2-3.3" stroke="#5eead4" stroke-width="1.8" stroke-linecap="round" fill="none"/>
          <path d="M3 13.2h15.2a2.5 2.5 0 1 1-2.2 3.6" stroke="#ccfbf1" stroke-width="1.8" stroke-linecap="round" fill="none"/>
          <path d="M6.2 17.2h7.6" stroke="#2dd4bf" stroke-width="1.8" stroke-linecap="round"/>
        `;
        break;

      case 'love': // Luyến Trụ: Sakura heart ribbon
        body = `
          <path d="M12 19.6s-7-4.3-7-9.5a4.1 4.1 0 0 1 7-2.8 4.1 4.1 0 0 1 7 2.8c0 5.2-7 9.5-7 9.5Z" fill="rgba(244,114,182,0.34)" stroke="#f472b6" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M9.5 11.2l2.5 2.4 2.6-2.4" stroke="#a3e635" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        `;
        break;

      case 'serpent': // Xà Trụ: Coiling white/violet serpent S-wave
        body = `
          <path d="M17.5 5.2c-4.2-1.8-9.2-.2-9.2 3.1 0 3.7 7.8 2.9 7.8 6.8 0 3.2-5.2 4.5-9.4 2.5" stroke="#a855f7" stroke-width="2.1" stroke-linecap="round" fill="none"/>
          <path d="M17.5 5.2c-4.2-1.8-9.2-.2-9.2 3.1 0 3.7 7.8 2.9 7.8 6.8" stroke="#f8fafc" stroke-width="1.05" stroke-linecap="round" fill="none"/>
          <circle cx="18" cy="5.2" r="1.6" fill="#34d399"/>
        `;
        break;

      case 'wind': // Phong Trụ: Emerald cyclone slash blades
        body = `
          <circle cx="12" cy="12" r="2.4" fill="#bbf7d0"/>
          <path d="M12 9.6c0-4.2 4.5-6.2 7.2-4.2M14.4 12c4.2 0 6.2 4.5 4.2 7.2M12 14.4c0 4.2-4.5 6.2-7.2 4.2M9.6 12c-4.2 0-6.2-4.5-4.2-7.2" stroke="#22c55e" stroke-width="1.9" stroke-linecap="round" fill="none"/>
        `;
        break;

      case 'stone': // Nham Trụ: Buddhist prayer beads ring & diamond rock core
        body = `
          <polygon points="12,7.2 16.4,12 12,16.8 7.6,12" fill="rgba(245,158,11,0.38)" stroke="#fde68a" stroke-width="1.5"/>
          <circle cx="12" cy="3.3" r="1.65" fill="#ef4444"/><circle cx="18.2" cy="5.8" r="1.65" fill="#f59e0b"/>
          <circle cx="20.7" cy="12" r="1.65" fill="#ef4444"/><circle cx="18.2" cy="18.2" r="1.65" fill="#f59e0b"/>
          <circle cx="12" cy="20.7" r="1.65" fill="#ef4444"/><circle cx="5.8" cy="18.2" r="1.65" fill="#f59e0b"/>
          <circle cx="3.3" cy="12" r="1.65" fill="#ef4444"/><circle cx="5.8" cy="5.8" r="1.65" fill="#f59e0b"/>
        `;
        break;

      case 'sun_water': // Tanjiro: Dual Hinokami Sun + Flowing Water crest
        body = `
          <circle cx="12" cy="12" r="5.2" fill="rgba(249,115,22,0.34)" stroke="#f97316" stroke-width="1.75"/>
          <path d="M12 2.4v2.5M12 19.1v2.5M2.4 12h2.5M19.1 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8" stroke="#fde047" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M5.2 15.2c2.2 2.4 6.2 2.8 9.6.8 2-.9 3.2-2.8 3.6-4.5" stroke="#38bdf8" stroke-width="1.95" stroke-linecap="round" fill="none"/>
        `;
        break;

      case 'nezuko': // Nezuko: Green bamboo node & exploding pink lotus flame
        body = `
          <rect x="4.5" y="9.4" width="15" height="5.2" rx="2.2" fill="rgba(74,222,128,0.28)" stroke="#4ade80" stroke-width="1.65"/>
          <line x1="9.5" y1="9.4" x2="9.5" y2="14.6" stroke="#bbf7d0" stroke-width="1.4"/>
          <line x1="14.5" y1="9.4" x2="14.5" y2="14.6" stroke="#bbf7d0" stroke-width="1.4"/>
          <path d="M12 3.2c1.8 2.2 3.2 3.8 2.2 5.6-1 .8-3.4.8-4.4 0-1-1.8.4-3.4 2.2-5.6Z" fill="#fb7185"/>
        `;
        break;

      case 'thunder': // Zenitsu: Thunderclap golden lightning bolt & triangle motif
        body = `
          <polygon points="13.4,2.2 5.4,13.2 11.4,13.2 10.2,21.8 18.8,10.6 12.8,10.6" fill="rgba(250,204,21,0.38)" stroke="#facc15" stroke-width="1.75" stroke-linejoin="round"/>
          <polyline points="12.9,5.8 8.4,12.2 12.4,12.2 11.3,18.2" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        `;
        break;

      case 'beast': // Inosuke: Twin serrated Nichirin blades crossed in X
        body = `
          <path d="M4.2 4.2l15.6 15.6M19.8 4.2L4.2 19.8" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="8.2" cy="8.2" r="1.2" fill="#e2e8f0"/><circle cx="15.8" cy="8.2" r="1.2" fill="#e2e8f0"/>
          <circle cx="12" cy="12" r="2.1" fill="#ffffff"/>
        `;
        break;

      case 'cosmic':
        body = `
          <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-28 12 12)" stroke="#38bdf8" stroke-width="1.6" fill="none"/>
          <path d="M12 4.2l1.8 5.8 5.8 1.8-5.8 1.8-1.8 5.8-1.8-5.8-5.8-1.8 5.8-1.8Z" fill="#e0f2fe"/>
        `;
        break;

      case 'obsidian':
        body = `
          <polygon points="12,2.5 19,8.5 16.2,20.5 7.8,20.5 5,8.5" fill="rgba(148,163,184,0.28)" stroke="#cbd5e1" stroke-width="1.7" stroke-linejoin="round"/>
          <polyline points="12,2.5 12,20.5 19,8.5" stroke="#f8fafc" stroke-width="1.15" fill="none"/>
        `;
        break;

      case 'moon': // Nguyệt Hô Hấp / Đế Vương Bóng Tối: Sharp Violet-Azure crescent moon & astral blade glint
        body = `
          <path d="M15.8 3.4a8.8 8.8 0 1 0 4.8 14.9A7.4 7.4 0 0 1 15.8 3.4Z" fill="rgba(168,85,247,0.34)" stroke="#c084fc" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M17.2 6.2l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9Z" fill="#38bdf8"/>
          <circle cx="14.2" cy="13.2" r="1.15" fill="#e0f2fe"/>
        `;
        break;

      default: // Yoriichi Sun Breathing Primordial Solar Halo
        body = `
          <circle cx="12" cy="12" r="5.3" fill="rgba(239,68,68,0.42)" stroke="#fde047" stroke-width="1.8"/>
          <path d="M12 2v2.8M12 19.2V22M2 12h2.8M19.2 12H22M4.9 4.9l2 2M17.1 17.1l2 2M19.1 4.9l-2 2M6.9 17.1l-2 2" stroke="#f97316" stroke-width="1.75" stroke-linecap="round"/>
        `;
        break;
    }

    return `<svg class="agy-sem-svg agy-elem-svg" data-elem="${key}" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  }

  function getFuncSvg(kind, size = 13) {
    const sz = safeIconSize(size, 13);
    let body = '';
    switch (kind) {
      case 'breathing_forms': // Katana Tsuba guard + Technique scroll
        body = `
          <circle cx="12" cy="12" r="8.6" fill="rgba(255,255,255,0.08)" stroke="currentColor" stroke-width="1.75"/>
          <circle cx="12" cy="12" r="3.2" stroke="var(--skill-primary, #fde047)" stroke-width="1.6"/>
          <path d="M12 3.4v3.4M12 17.2v3.4M3.4 12h3.4M17.2 12h3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        `;
        break;

      case 'katana_cast': // Crescent sword arc + piercing Nichirin blade
        body = `
          <path d="M4.5 18.8C9.8 19.5 18.8 14.2 19.6 4.8" stroke="var(--skill-primary, #fde047)" stroke-width="2.2" stroke-linecap="round" fill="none"/>
          <path d="M4.2 19.8L18.8 5.2" stroke="#ffffff" stroke-width="1.75" stroke-linecap="round"/>
          <path d="M6.2 14.6l3.2 3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        `;
        break;

      case 'nichirin_item': // Individual form katana tip
        body = `
          <path d="M4.5 19.5L19.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M7.2 13.6l3.2 3.2" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
        `;
        break;

      case 'sfx_on': // Kagura wind-chime bell resonating
        body = `
          <path d="M11 5L6.5 9H3.5v6h3L11 19V5Z" fill="rgba(255,255,255,0.16)" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M15 8.8a4.5 4.5 0 0 1 0 6.4M18 6.2a8 8 0 0 1 0 11.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>
        `;
        break;

      case 'sfx_off': // Muted Kagura chime
        body = `
          <path d="M11 5L6.5 9H3.5v6h3L11 19V5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="#fb7185" stroke-width="1.8" stroke-linecap="round"/>
        `;
        break;

      case 'kv_cache': // Stacked memory crystal layers
        body = `
          <polygon points="12,3.5 20,8 12,12.5 4,8" fill="rgba(56,189,248,0.25)" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
          <polyline points="4,12.5 12,17 20,12.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <polyline points="4,16.5 12,21 20,16.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        `;
        break;

      case 'draft_brush': // Japanese calligraphy brush writing draft
        body = `
          <path d="M17.8 3.8a2.2 2.2 0 0 1 3.1 3.1L10.5 17.3l-4.3 1.2 1.2-4.3L17.8 3.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M4 21h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        `;
        break;

      case 'session_sum': // Astral hourglass cumulative session output
        body = `
          <path d="M6.5 3.5h11M6.5 20.5h11M7.8 3.5c0 4.5 4.2 6.2 4.2 8.5s-4.2 4-4.2 8.5M16.2 3.5c0 4.5-4.2 6.2-4.2 8.5s4.2 4 4.2 8.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>
        `;
        break;

      case 'model_quota': // Octagonal Nichirin seal & gauge
        body = `
          <polygon points="8.5,3 15.5,3 21,8.5 21,15.5 15.5,21 8.5,21 3,15.5 3,8.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M12 12l4-3.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="1.8" fill="currentColor"/>
        `;
        break;

      case 'yoriichi_sun': // Primordial Sun Breathing Crest of the First Swordsman
        body = `
          <circle cx="12" cy="12" r="5" fill="#ef4444" stroke="#fde047" stroke-width="1.7"/>
          <path d="M12 2.2v2.8M12 19v2.8M2.2 12H5M19 12h2.8M5.1 5.1l2 2M16.9 16.9l2 2M18.9 5.1l-2 2M7.1 16.9l-2 2" stroke="#fde047" stroke-width="1.75" stroke-linecap="round"/>
        `;
        break;

      case 'kagura_bell': // Kagura Furin wind-chime bell + fluttering Tanzaku slip & acoustic waves
        body = `
          <line x1="12" y1="2" x2="12" y2="4.4" stroke="#fde047" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M6.6 11.2a5.4 5.4 0 0 1 10.8 0v2.1H6.6v-2.1Z" fill="rgba(250,204,21,0.24)" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
          <circle cx="12" cy="13.4" r="1.45" fill="#fde047"/>
          <path d="M12 14.8l-1.1 2.1h3.2l-1.3 4.8-3.1-.7 1.2-4.1" fill="rgba(239,68,68,0.72)" stroke="#fca5a5" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M4.2 8.2a7.5 7.5 0 0 0-.8 4.4M19.8 8.2a7.5 7.5 0 0 1 .8 4.4" stroke="#fde047" stroke-width="1.45" stroke-linecap="round" fill="none"/>
        `;
        break;

      case 'cinema_mask': // Urokodaki Warding Fox Mask (Kitsune Privacy & Cinema Director Shield)
        body = `
          <path d="M5.2 9.4L6.4 3.2l4.1 3.6h3l4.1-3.6 1.2 6.2c.4 5.2-2.9 9.4-6.8 11.4-3.9-2-7.2-6.2-6.8-11.4Z" fill="rgba(248,250,252,0.16)" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
          <circle cx="12" cy="9.4" r="1.75" fill="#ef4444" stroke="#fde047" stroke-width="0.9"/>
          <path d="M8.1 12.6c1-.9 2.2-.9 3 .1M15.9 12.6c-1-.9-2.2-.9-3 .1" stroke="#fde047" stroke-width="1.6" stroke-linecap="round" fill="none"/>
          <path d="M7.3 15.6l2.1.8M16.7 15.6l-2.1.8" stroke="#ef4444" stroke-width="1.45" stroke-linecap="round"/>
        `;
        break;

      default:
        body = `<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.8"/>`;
        break;
    }
    return `<svg class="agy-sem-svg" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
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
