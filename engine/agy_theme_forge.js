// ============================================================================
// Antigravity Custom Theme — Multiverse AI Theme Forge & Master Persona Engine
// Provides OKLCH 64x64 Perceptual Palette Extraction, WCAG AA Contrast Solver,
// 18 Master Personas (Yoriichi + 14 Hashira/Corps + 3 Original Multiverse Crests),
// and Standardized `.agytheme` (agytheme/2.0) Package Import/Export.
// ============================================================================

(() => {
  'use strict';

  const SEC = (typeof __AGY_SEC__ === 'object' && __AGY_SEC__) ? __AGY_SEC__ : {
    escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    stripProtoKeys: (o) => o,
    sanitizeCssUrl: (u) => (typeof u === 'string' && !/["'()\\;\r\n\0<>`{}]/.test(u) ? u.trim() : ''),
    sanitizeCssValue: (v, fb = '') => (typeof v === 'string' && !/[;{}<>\\`\r\n\0]/.test(v) ? v.trim() : fb),
    sanitizeSvgMarkup: (s) => (typeof s === 'string' && !/<script|<foreignobject|\bon[a-z]+\s*=/i.test(s) ? s.trim() : ''),
    sanitizeThemeDefinition: (t) => t,
    resolveAssetUrl: (u) => (typeof u === 'string' ? u.trim() : ''),
    getAssetBase: () => ''
  };

  const STORAGE_FORGED_THEMES = 'agy_forged_themes_v2';
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
  const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  const FX_MODE_OPTIONS = [
    { value: 'sun', label: '☀️ Nhật Chi Hô Hấp (Sun)' },
    { value: 'moon', label: '🌙 Nguyệt Tử Linh (Moon)' },
    { value: 'flame', label: '🔥 Viêm Nhiệt Lưu (Flame)' },
    { value: 'thunder', label: '⚡ Lôi Điện Thiểm (Thunder)' },
    { value: 'water', label: '🌊 Tĩnh Thủy Lưu (Water)' },
    { value: 'mist', label: '🌫️ Hà Vân Vô Cực (Mist)' },
    { value: 'wisteria', label: '🦋 Tử Đằng Nguyệt Dạ (Wisteria)' },
    { value: 'royal_wisteria', label: '👑 Dinh Thự Hoàng Kim (Royal)' },
    { value: 'wind', label: '🌪️ Cuồng Phong Trảm (Wind)' },
    { value: 'sound', label: '🎵 Kim Tuyến Hào Nhoáng (Sound)' },
    { value: 'love', label: '🌸 Anh Đào Luyến Khúc (Love)' },
    { value: 'serpent', label: '🐍 U Xà Tinh Thể (Serpent)' },
    { value: 'stone', label: '📿 Nham Thạch Minh Đăng (Stone)' },
    { value: 'nezuko', label: '🎋 Huyết Quỷ Hoa Lửa (Nezuko)' },
    { value: 'sun_water', label: '🎴 Hỏa Thần & Thủy Lưu (Dual)' },
    { value: 'beast', label: '🐗 Sơn Lâm Dã Thú (Beast)' }
  ];

  function strictPercentEncodeSvg(str) {
    return encodeURIComponent(str).replace(/[!'()*;]/g, (ch) =>
      '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
    );
  }

  function safeRasterDataUrl(raw) {
    if (typeof raw !== 'string') return '';
    const viaSec = SEC.sanitizeCssUrl(raw);
    if (viaSec) return viaSec;
    const trimmed = raw.trim();
    if (/^data:image\/(?:webp|png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return trimmed;
    }
    return '';
  }

  function svgToDataUri(rawSvg) {
    const clean = SEC.sanitizeSvgMarkup(rawSvg);
    if (!clean) return '';
    const encoded = strictPercentEncodeSvg(clean);
    if (!encoded) return '';
    return SEC.sanitizeCssUrl(`data:image/svg+xml,${encoded}`);
  }

  function resolveLocalAsset(relPath) {
    if (!relPath || typeof relPath !== 'string') return '';
    if (relPath.startsWith('data:')) return SEC.sanitizeCssUrl(relPath);
    const base = typeof SEC.getAssetBase === 'function' ? SEC.getAssetBase() : '';
    if (!base && /^assets\//.test(relPath)) {
      return SEC.resolveAssetUrl(`./themes/${relPath}`) || SEC.sanitizeCssUrl(`./themes/${relPath}`);
    }
    return SEC.resolveAssetUrl(relPath) || SEC.sanitizeCssUrl(relPath);
  }

  /* ==========================================================================
   * ORIGINAL COPYRIGHT-CLEAN VECTOR CRESTS FOR 3 MULTIVERSE MASTER PERSONAS
   * ========================================================================== */

  const MULTIVERSE_CRESTS = {
    shadow_monarch: {
      avatar: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
        `<defs><radialGradient id="smg" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#2e1065"/><stop offset="70%" stop-color="#090514"/><stop offset="100%" stop-color="#030108"/></radialGradient>` +
        `<linearGradient id="smc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c084fc"/><stop offset="50%" stop-color="#7e22ce"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient></defs>` +
        `<circle cx="32" cy="32" r="30" fill="url(#smg)" stroke="url(#smc)" stroke-width="2.2"/>` +
        `<path d="M14 40 L18 20 L26 29 L32 13 L38 29 L46 20 L50 40 Q32 47 14 40 Z" fill="#130929" stroke="url(#smc)" stroke-width="1.8" stroke-linejoin="round"/>` +
        `<path d="M19 34 L27 31 L24 37 Z" fill="#38bdf8"/><path d="M45 34 L37 31 L40 37 Z" fill="#38bdf8"/>` +
        `<path d="M32 18 L34.5 26 L32 30 L29.5 26 Z" fill="#e879f9"/>` +
        `<path d="M20 46 Q32 52 44 46" fill="none" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round" opacity="0.85"/></svg>`
      ),
      ornament: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 64">` +
        `<defs><linearGradient id="smo" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0"/><stop offset="28%" stop-color="#9333ea"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="72%" stop-color="#9333ea"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/></linearGradient></defs>` +
        `<path d="M16 54 Q44 44 72 54 Q100 44 128 54" fill="none" stroke="url(#smo)" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M46 52 L54 28 L64 38 L72 16 L80 38 L90 28 L98 52 Z" fill="#0f0722" stroke="#a855f7" stroke-width="1.8" stroke-linejoin="round"/>` +
        `<polygon points="61,41 68,38 65,44" fill="#38bdf8"/><polygon points="83,41 76,38 79,44" fill="#38bdf8"/>` +
        `<circle cx="72" cy="28" r="3" fill="#e879f9"/></svg>`
      ),
      corner: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
        `<path d="M2 24 L2 7 Q2 2 7 2 L24 2" fill="none" stroke="#a855f7" stroke-width="1.8"/>` +
        `<polygon points="6,6 13,6 6,13" fill="#38bdf8" opacity="0.9"/></svg>`
      )
    },
    six_eyes: {
      avatar: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
        `<defs><radialGradient id="seg" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#0c2d48"/><stop offset="68%" stop-color="#061024"/><stop offset="100%" stop-color="#030712"/></radialGradient>` +
        `<linearGradient id="sec" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="52%" stop-color="#e0f2fe"/><stop offset="100%" stop-color="#c084fc"/></linearGradient></defs>` +
        `<circle cx="32" cy="32" r="30" fill="url(#seg)" stroke="url(#sec)" stroke-width="2.2"/>` +
        `<circle cx="32" cy="32" r="22" fill="none" stroke="#38bdf8" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.65"/>` +
        `<path d="M15 32 C15 23, 27 23, 32 32 C37 41, 49 41, 49 32 C49 23, 37 23, 32 32 C27 41, 15 41, 15 32 Z" fill="none" stroke="url(#sec)" stroke-width="2.8"/>` +
        `<circle cx="22.5" cy="32" r="3.2" fill="#7dd3fc"/><circle cx="41.5" cy="32" r="3.2" fill="#d8b4fe"/>` +
        `<circle cx="32" cy="15" r="2.2" fill="#38bdf8"/><circle cx="32" cy="49" r="2.2" fill="#c084fc"/></svg>`
      ),
      ornament: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 64">` +
        `<defs><linearGradient id="seo" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0"/><stop offset="30%" stop-color="#38bdf8"/><stop offset="50%" stop-color="#f8fafc"/><stop offset="70%" stop-color="#c084fc"/><stop offset="100%" stop-color="#c084fc" stop-opacity="0"/></linearGradient></defs>` +
        `<path d="M12 53 L132 53" stroke="url(#seo)" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M48 38 C48 27, 64 27, 72 38 C80 49, 96 49, 96 38 C96 27, 80 27, 72 38 C64 49, 48 49, 48 38 Z" fill="#071329" stroke="url(#seo)" stroke-width="2.6"/>` +
        `<circle cx="59" cy="38" r="3" fill="#38bdf8"/><circle cx="85" cy="38" r="3" fill="#c084fc"/></svg>`
      ),
      corner: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
        `<path d="M2 22 L2 8 Q2 2 8 2 L22 2" fill="none" stroke="#38bdf8" stroke-width="1.7"/>` +
        `<circle cx="8" cy="8" r="3" fill="none" stroke="#c084fc" stroke-width="1.5"/></svg>`
      )
    },
    great_sage: {
      avatar: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
        `<defs><radialGradient id="gsg" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#451a03"/><stop offset="70%" stop-color="#170904"/><stop offset="100%" stop-color="#090402"/></radialGradient>` +
        `<linearGradient id="gsc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs>` +
        `<circle cx="32" cy="32" r="30" fill="url(#gsg)" stroke="url(#gsc)" stroke-width="2.2"/>` +
        `<path d="M16 18 Q24 8 31 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M48 18 Q40 8 33 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M13 34 Q22 26 32 33 Q42 26 51 34 Q42 42 32 37 Q22 42 13 34 Z" fill="none" stroke="url(#gsc)" stroke-width="2.6"/>` +
        `<circle cx="24" cy="39" r="2.7" fill="#ef4444"/><circle cx="40" cy="39" r="2.7" fill="#ef4444"/>` +
        `<circle cx="24" cy="39" r="1.2" fill="#fef08a"/><circle cx="40" cy="39" r="1.2" fill="#fef08a"/></svg>`
      ),
      ornament: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 64">` +
        `<defs><linearGradient id="gso" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ef4444"/><stop offset="22%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#451a03"/><stop offset="78%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs>` +
        `<rect x="18" y="44" width="108" height="7" rx="3.5" fill="url(#gso)" stroke="#fef08a" stroke-width="1"/>` +
        `<rect x="26" y="42.5" width="12" height="10" rx="2" fill="#fbbf24"/><rect x="106" y="42.5" width="12" height="10" rx="2" fill="#fbbf24"/>` +
        `<path d="M52 40 Q64 20 72 34 Q80 20 92 40" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/></svg>`
      ),
      corner: svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
        `<path d="M2 22 L2 7 Q2 2 7 2 L22 2" fill="none" stroke="#fbbf24" stroke-width="1.9"/>` +
        `<circle cx="7" cy="7" r="2.5" fill="#ef4444"/></svg>`
      )
    }
  };

  function makeMultiverseBackdropUri(presetKey) {
    if (presetKey === 'shadow_monarch') {
      return svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">` +
        `<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#05030d"/><stop offset="52%" stop-color="#0c061d"/><stop offset="100%" stop-color="#040b1a"/></linearGradient>` +
        `<radialGradient id="g1" cx="84%" cy="34%" r="44%"><stop offset="0%" stop-color="#7e22ce" stop-opacity="0.52"/><stop offset="55%" stop-color="#3b0764" stop-opacity="0.18"/><stop offset="100%" stop-color="#05030d" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="g2" cx="16%" cy="76%" r="40%"><stop offset="0%" stop-color="#0284c7" stop-opacity="0.38"/><stop offset="100%" stop-color="#05030d" stop-opacity="0"/></radialGradient></defs>` +
        `<rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#g1)"/><rect width="1920" height="1080" fill="url(#g2)"/>` +
        `<ellipse cx="1610" cy="370" rx="190" ry="310" fill="none" stroke="#a855f7" stroke-width="3" opacity="0.32"/>` +
        `<ellipse cx="1610" cy="370" rx="150" ry="260" fill="none" stroke="#38bdf8" stroke-width="1.6" opacity="0.28"/></svg>`
      );
    }
    if (presetKey === 'six_eyes') {
      return svgToDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">` +
        `<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#030712"/><stop offset="50%" stop-color="#071226"/><stop offset="100%" stop-color="#130924"/></linearGradient>` +
        `<radialGradient id="bh" cx="82%" cy="42%" r="36%"><stop offset="0%" stop-color="#000000"/><stop offset="26%" stop-color="#000000"/><stop offset="31%" stop-color="#e0f2fe" stop-opacity="0.72"/><stop offset="46%" stop-color="#38bdf8" stop-opacity="0.32"/><stop offset="72%" stop-color="#9333ea" stop-opacity="0.14"/><stop offset="100%" stop-color="#030712" stop-opacity="0"/></radialGradient></defs>` +
        `<rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#bh)"/></svg>`
      );
    }
    return svgToDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">` +
      `<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#090604"/><stop offset="55%" stop-color="#160d06"/><stop offset="100%" stop-color="#0c0705"/></linearGradient>` +
      `<radialGradient id="sun" cx="83%" cy="36%" r="38%"><stop offset="0%" stop-color="#fef08a" stop-opacity="0.44"/><stop offset="38%" stop-color="#d97706" stop-opacity="0.24"/><stop offset="72%" stop-color="#991b1b" stop-opacity="0.12"/><stop offset="100%" stop-color="#090604" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#sun)"/>` +
      `<circle cx="1590" cy="390" r="165" fill="none" stroke="#fbbf24" stroke-width="2.4" opacity="0.30"/></svg>`
    );
  }

  /* ==========================================================================
   * 18 MASTER PERSONAS (Yoriichi Default + 14 Corps/Hashira + 3 Multiverse)
   * ========================================================================== */

  const RAW_PERSONAS = [
    {
      id: 'yoriichi',
      label: '☀️ Khai Tổ Hỏa Thần — Yoriichi',
      shortLabel: '☀️ Yoriichi (Mặc định)',
      tagLabel: 'Khai Tổ Hỏa Thần (Anh)',
      group: 'origin',
      skillId: 'yoriichi',
      ringColor: '#fde047',
      glowColor: 'rgba(239, 68, 68, 0.52)',
      userAvatar: 'assets/yoriichi_avatar.jpg',
      userSticker: 'assets/yoriichi_ornament.svg',
      userCornerSvg: 'assets/yoriichi_corner.svg',
      actionSticker: 'assets/yoriichi_action.png'
    },
    {
      id: 'shadow_monarch',
      label: '🌌 Đế Vương Bóng Tối — Shadow Monarch',
      shortLabel: '🌌 Đế Vương Bóng Tối',
      tagLabel: 'Đế Vương Bóng Tối (Anh)',
      group: 'multiverse',
      skillId: 'serpent',
      ringColor: '#38bdf8',
      glowColor: 'rgba(168, 85, 247, 0.62)',
      userAvatar: MULTIVERSE_CRESTS.shadow_monarch.avatar,
      userSticker: MULTIVERSE_CRESTS.shadow_monarch.ornament,
      userCornerSvg: MULTIVERSE_CRESTS.shadow_monarch.corner,
      actionSticker: ''
    },
    {
      id: 'six_eyes',
      label: '♾️ Lục Nhãn Vô Hạ Hạn — Six Eyes',
      shortLabel: '♾️ Lục Nhãn Vô Hạ Hạn',
      tagLabel: 'Chủ Nhân Lục Nhãn (Anh)',
      group: 'multiverse',
      skillId: 'mist',
      ringColor: '#7dd3fc',
      glowColor: 'rgba(192, 132, 252, 0.58)',
      userAvatar: MULTIVERSE_CRESTS.six_eyes.avatar,
      userSticker: MULTIVERSE_CRESTS.six_eyes.ornament,
      userCornerSvg: MULTIVERSE_CRESTS.six_eyes.corner,
      actionSticker: ''
    },
    {
      id: 'great_sage',
      label: '🔥 Tề Thiên Đại Thánh — Great Sage',
      shortLabel: '🔥 Tề Thiên Đại Thánh',
      tagLabel: 'Tề Thiên Đại Thánh (Anh)',
      group: 'multiverse',
      skillId: 'yoriichi',
      ringColor: '#fbbf24',
      glowColor: 'rgba(239, 68, 68, 0.58)',
      userAvatar: MULTIVERSE_CRESTS.great_sage.avatar,
      userSticker: MULTIVERSE_CRESTS.great_sage.ornament,
      userCornerSvg: MULTIVERSE_CRESTS.great_sage.corner,
      actionSticker: ''
    },
    { id: 'ubuyashiki', label: '👑 Chúa Công — Ubuyashiki', shortLabel: '👑 Chúa Công', tagLabel: 'Chúa Công Ubuyashiki', group: 'kny', skillId: 'royal_wisteria', ringColor: '#facc15', glowColor: 'rgba(232, 121, 249, 0.5)' },
    { id: 'shinobu', label: '🦋 Trùng Trụ — Shinobu Kocho', shortLabel: '🦋 Shinobu', tagLabel: 'Trùng Trụ Shinobu', group: 'kny', skillId: 'wisteria', ringColor: '#c084fc', glowColor: 'rgba(94, 234, 212, 0.48)' },
    { id: 'giyu', label: '🌊 Thủy Trụ — Giyu Tomioka', shortLabel: '🌊 Giyu', tagLabel: 'Thủy Trụ Giyu', group: 'kny', skillId: 'water', ringColor: '#38bdf8', glowColor: 'rgba(56, 189, 248, 0.5)' },
    { id: 'rengoku', label: '🔥 Viêm Trụ — Kyojuro Rengoku', shortLabel: '🔥 Rengoku', tagLabel: 'Viêm Trụ Rengoku', group: 'kny', skillId: 'flame', ringColor: '#fbbf24', glowColor: 'rgba(249, 115, 22, 0.55)' },
    { id: 'uzui', label: '🎵 Âm Trụ — Tengen Uzui', shortLabel: '🎵 Uzui', tagLabel: 'Âm Trụ Uzui', group: 'kny', skillId: 'sound', ringColor: '#fde047', glowColor: 'rgba(244, 63, 94, 0.5)' },
    { id: 'muichiro', label: '🌫️ Hà Trụ — Muichiro Tokito', shortLabel: '🌫️ Muichiro', tagLabel: 'Hà Trụ Muichiro', group: 'kny', skillId: 'mist', ringColor: '#5eead4', glowColor: 'rgba(94, 234, 212, 0.48)' },
    { id: 'mitsuri', label: '🌸 Luyến Trụ — Mitsuri Kanroji', shortLabel: '🌸 Mitsuri', tagLabel: 'Luyến Trụ Mitsuri', group: 'kny', skillId: 'love', ringColor: '#f472b6', glowColor: 'rgba(163, 230, 53, 0.45)' },
    { id: 'obanai', label: '🐍 Xà Trụ — Obanai Iguro', shortLabel: '🐍 Obanai', tagLabel: 'Xà Trụ Obanai', group: 'kny', skillId: 'serpent', ringColor: '#a78bfa', glowColor: 'rgba(45, 212, 191, 0.48)' },
    { id: 'sanemi', label: '🌪️ Phong Trụ — Sanemi Shinazugawa', shortLabel: '🌪️ Sanemi', tagLabel: 'Phong Trụ Sanemi', group: 'kny', skillId: 'wind', ringColor: '#4ade80', glowColor: 'rgba(74, 222, 128, 0.5)' },
    { id: 'gyomei', label: '📿 Nham Trụ — Gyomei Himejima', shortLabel: '📿 Gyomei', tagLabel: 'Nham Trụ Gyomei', group: 'kny', skillId: 'stone', ringColor: '#fbbf24', glowColor: 'rgba(217, 119, 6, 0.48)' },
    { id: 'tanjiro', label: '🎴 Hỏa Thần — Tanjiro Kamado', shortLabel: '🎴 Tanjiro', tagLabel: 'Kiếm Sĩ Tanjiro', group: 'kny', skillId: 'sun_water', ringColor: '#fb923c', glowColor: 'rgba(45, 212, 191, 0.5)' },
    { id: 'nezuko', label: '🎋 Huyết Quỷ — Nezuko Kamado', shortLabel: '🎋 Nezuko', tagLabel: 'Huyết Quỷ Nezuko', group: 'kny', skillId: 'nezuko', ringColor: '#fb7185', glowColor: 'rgba(244, 114, 182, 0.5)' },
    { id: 'zenitsu', label: '⚡ Lôi Minh — Zenitsu Agatsuma', shortLabel: '⚡ Zenitsu', tagLabel: 'Kiếm Sĩ Zenitsu', group: 'kny', skillId: 'thunder', ringColor: '#facc15', glowColor: 'rgba(250, 204, 21, 0.55)' },
    { id: 'inosuke', label: '🐗 Dã Thú — Inosuke Hashibira', shortLabel: '🐗 Inosuke', tagLabel: ' Chúa Sơn Lâm Inosuke', group: 'kny', skillId: 'beast', ringColor: '#60a5fa', glowColor: 'rgba(96, 165, 250, 0.5)' }
  ];

  const PERSONA_MAP = Object.create(null);
  const PERSONA_LIST = RAW_PERSONAS.map((item) => {
    const isKny = item.group === 'kny';
    const resolved = {
      id: item.id,
      label: item.label,
      shortLabel: item.shortLabel,
      tagLabel: item.tagLabel.trim(),
      group: item.group,
      skillId: item.skillId,
      ringColor: SEC.sanitizeCssValue(item.ringColor, '#fde047'),
      glowColor: SEC.sanitizeCssValue(item.glowColor, 'rgba(239, 68, 68, 0.52)'),
      userAvatar: isKny ? resolveLocalAsset(`assets/${item.id}_user_avatar.svg`) : resolveLocalAsset(item.userAvatar),
      userSticker: isKny ? resolveLocalAsset(`assets/${item.id}_ornament.svg`) : resolveLocalAsset(item.userSticker),
      userCornerSvg: isKny ? resolveLocalAsset(`assets/${item.id}_corner.svg`) : resolveLocalAsset(item.userCornerSvg),
      actionSticker: isKny ? resolveLocalAsset(`assets/${item.id}_action.png`) : resolveLocalAsset(item.actionSticker || '')
    };
    PERSONA_MAP[resolved.id] = resolved;
    return resolved;
  });

  function getPersona(personaId) {
    const key = typeof personaId === 'string' ? personaId.trim() : 'yoriichi';
    return PERSONA_MAP[key] || PERSONA_MAP.yoriichi;
  }

  /* ==========================================================================
   * PERCEPTUAL OKLCH COLOR ENGINE & WCAG 2.1 AA CONTRAST SOLVER
   * ========================================================================== */

  function clamp(v, min, max) {
    if (!Number.isFinite(v)) return min;
    return v < min ? min : (v > max ? max : v);
  }

  function srgbToLinear(c) {
    const v = clamp(c / 255, 0, 1);
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function linearToSrgbByte(c) {
    const v = clamp(c, 0, 1);
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp(s * 255, 0, 255));
  }

  function rgbToOklch(r, g, b) {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);

    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const bk = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

    const C = Math.hypot(a, bk);
    let h = Math.atan2(bk, a) * (180 / Math.PI);
    if (h < 0) h += 360;
    return { L: clamp(L, 0, 1), C: clamp(C, 0, 0.4), h };
  }

  function oklchRawLinear(L, C, hDeg) {
    const rad = (hDeg * Math.PI) / 180;
    const a = C * Math.cos(rad);
    const bk = C * Math.sin(rad);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * bk;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * bk;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * bk;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    return {
      r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    };
  }

  function oklchToRgb(L, C, hDeg) {
    const safeL = clamp(L, 0, 1);
    const safeH = ((hDeg % 360) + 360) % 360;
    let lo = 0;
    let hi = clamp(C, 0, 0.38);
    let best = oklchRawLinear(safeL, 0, safeH);

    // Binary gamut-mapping search along chroma so hue & perceptual lightness stay faithful
    const full = oklchRawLinear(safeL, hi, safeH);
    const inGamut = (lin) =>
      lin.r >= -0.0005 && lin.r <= 1.0005 &&
      lin.g >= -0.0005 && lin.g <= 1.0005 &&
      lin.b >= -0.0005 && lin.b <= 1.0005;

    if (inGamut(full)) {
      best = full;
    } else {
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) * 0.5;
        const cand = oklchRawLinear(safeL, mid, safeH);
        if (inGamut(cand)) {
          best = cand;
          lo = mid;
        } else {
          hi = mid;
        }
      }
    }

    return {
      r: linearToSrgbByte(best.r),
      g: linearToSrgbByte(best.g),
      b: linearToSrgbByte(best.b)
    };
  }

  function rgbToHex(rgb) {
    const hex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
  }

  function rgbaStr(rgb, alpha) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1).toFixed(2)})`;
  }

  function relativeLuminance(rgb) {
    return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
  }

  function wcagContrast(fgRgb, bgRgb) {
    const l1 = relativeLuminance(fgRgb);
    const l2 = relativeLuminance(bgRgb);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function ensureReadableLightOklch(initL, C, h, darkBgRgb, minRatio) {
    let curL = clamp(initL, 0.45, 0.985);
    let rgb = oklchToRgb(curL, C, h);
    let guard = 0;
    while (wcagContrast(rgb, darkBgRgb) < minRatio && curL < 0.985 && guard < 24) {
      curL = Math.min(0.985, curL + 0.025);
      rgb = oklchToRgb(curL, C, h);
      guard++;
    }
    return rgb;
  }

  function suggestFxModeFromHue(hDeg) {
    const h = ((hDeg % 360) + 360) % 360;
    if (h < 22 || h >= 348) return 'sun';
    if (h < 48) return 'flame';
    if (h < 76) return 'thunder';
    if (h < 155) return 'wind';
    if (h < 195) return 'mist';
    if (h < 245) return 'water';
    if (h < 292) return 'moon';
    if (h < 322) return 'wisteria';
    return 'love';
  }

  function circularHueDistance(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  /**
   * Generates all 14 WCAG-AA-verified frosted glass color tokens + engine properties in OKLCH space.
   */
  function buildOklchThemeDefinition(opts) {
    const h1 = ((Number(opts.h1) || 275) % 360 + 360) % 360;
    const c1 = clamp(Number(opts.c1) || 0.17, 0.11, 0.24);
    const h2 = opts.h2 !== undefined
      ? (((Number(opts.h2) || (h1 + 48)) % 360) + 360) % 360
      : ((h1 + 52) % 360);
    const c2 = clamp(Number(opts.c2) || 0.15, 0.10, 0.22);

    const codeSurfaceRgb = oklchToRgb(0.155, Math.min(0.035, c1 * 0.22), h1);
    const sidebarSurfaceRgb = oklchToRgb(0.145, Math.min(0.038, c1 * 0.24), h1);
    const overlayBaseRgb = oklchToRgb(0.115, Math.min(0.032, c1 * 0.20), h1);
    const pillSurfaceRgb = oklchToRgb(0.19, Math.min(0.048, c1 * 0.30), h1);
    const pillHoverRgb = oklchToRgb(0.26, Math.min(0.062, c1 * 0.38), h1);
    const modalSurfaceRgb = oklchToRgb(0.15, Math.min(0.04, c1 * 0.25), h1);
    const modalHeaderRgb = oklchToRgb(0.20, Math.min(0.05, c1 * 0.32), h1);
    const bubbleA = oklchToRgb(0.25, Math.min(0.068, c1 * 0.42), h1);
    const bubbleB = oklchToRgb(0.18, Math.min(0.052, c2 * 0.35), h2);
    const compA = oklchToRgb(0.22, Math.min(0.055, c1 * 0.35), h1);
    const compB = oklchToRgb(0.16, Math.min(0.042, c2 * 0.28), h2);

    // Guarantee WCAG AA/AAA readability on dark glass surfaces
    const primaryRgb = ensureReadableLightOklch(0.76, c1, h1, codeSurfaceRgb, 4.6);
    const accentRgb = ensureReadableLightOklch(0.78, c2, h2, codeSurfaceRgb, 4.6);
    const textMainRgb = ensureReadableLightOklch(0.968, 0.012, h1, codeSurfaceRgb, 11.5);
    const textMutedRgb = ensureReadableLightOklch(0.81, 0.024, h1, sidebarSurfaceRgb, 4.7);

    const primaryHex = rgbToHex(primaryRgb);
    const accentHex = rgbToHex(accentRgb);
    const textMainHex = rgbToHex(textMainRgb);
    const textMutedHex = rgbToHex(textMutedRgb);

    const userBubbleGrad = `linear-gradient(135deg, ${rgbaStr(bubbleA, 0.91)} 0%, ${rgbaStr(bubbleB, 0.95)} 100%)`;
    const frameGrad = `linear-gradient(135deg, ${rgbaStr(primaryRgb, 0.88)} 0%, ${rgbaStr(accentRgb, 0.72)} 52%, ${rgbaStr(primaryRgb, 0.80)} 100%)`;
    const composerGrad = `linear-gradient(145deg, ${rgbaStr(compA, 0.90)} 0%, ${rgbaStr(compB, 0.94)} 100%)`;
    const sidebarBg = rgbaStr(sidebarSurfaceRgb, 0.74);
    const codeBg = rgbaStr(codeSurfaceRgb, 0.78);
    const borderColor = rgbaStr(primaryRgb, 0.44);
    const overlayRgb = `${overlayBaseRgb.r}, ${overlayBaseRgb.g}, ${overlayBaseRgb.b}`;
    const pillBg = rgbaStr(pillSurfaceRgb, 0.72);
    const pillBorder = rgbaStr(primaryRgb, 0.32);

    const fxMode = String(opts.fxMode || suggestFxModeFromHue(h1)).replace(/[^a-zA-Z0-9_-]/g, '');
    const wpUrl = opts.wallpaper ? SEC.sanitizeCssUrl(opts.wallpaper) : '';
    const persona = getPersona(opts.personaId || 'yoriichi');

    return {
      concept: String(opts.concept || `OKLCH Forged Universe • WCAG AA (${Math.round(h1)}° / ${Math.round(h2)}°)`).slice(0, 140),
      // Core 14 OKLCH WCAG-AA Variables
      primary: primaryHex,
      accent: accentHex,
      bg: userBubbleGrad,
      frameBg: frameGrad,
      composerBg: composerGrad,
      sidebarBg,
      codeBg,
      textMain: textMainHex,
      textMuted: textMutedHex,
      borderColor,
      userBubble: userBubbleGrad,
      overlayRgb,
      pillBg,
      pillBorder,
      // Engine Compatibility Mirrors
      secondary: accentHex,
      glow: rgbaStr(primaryRgb, 0.32),
      secondaryGlow: rgbaStr(accentRgb, 0.24),
      composerHeaderBg: `linear-gradient(90deg, ${rgbaStr(compA, 0.95)} 0%, ${rgbaStr(primaryRgb, 0.45)} 55%, ${rgbaStr(accentRgb, 0.42)} 100%)`,
      textColor: textMainHex,
      uiTextColor: textMainHex,
      uiMutedColor: textMutedHex,
      innerBorder: `1px solid ${rgbaStr(primaryRgb, 0.24)}`,
      clearBackdrop: true,
      defaultDimming: typeof opts.defaultDimming === 'number' ? clamp(Math.round(opts.defaultDimming), 18, 75) : 28,
      bgPosition: 'center center',
      sidebarBlur: '4px',
      sidebarHoverBg: rgbaStr(primaryRgb, 0.16),
      sidebarEnhanceText: true,
      aiCardBg: codeBg,
      aiCardBorder: rgbaStr(primaryRgb, 0.22),
      headerBg: rgbaStr(overlayBaseRgb, 0.60),
      headerBlur: '4px',
      headerBorder: rgbaStr(primaryRgb, 0.18),
      unifiedGlass: true,
      btnBg: rgbaStr(compA, 0.78),
      inputGlassBg: rgbaStr(compA, 0.68),
      inputCardBg: composerGrad,
      pillHoverBg: rgbaStr(pillHoverRgb, 0.88),
      pillTextColor: textMainHex,
      modalBg: rgbaStr(modalSurfaceRgb, 0.96),
      modalHeaderBg: rgbaStr(modalHeaderRgb, 0.92),
      cardBg: rgbaStr(compA, 0.84),
      fxMode,
      wallpaper: wpUrl,
      isOrnament: true,
      isChibiNpc: true,
      liveWallpaperFx: true,
      cornerSvg: persona.userCornerSvg,
      userCornerSvg: persona.userCornerSvg,
      sticker: persona.userSticker,
      userSticker: persona.userSticker,
      stickerW: 140,
      stickerH: 64,
      stickerTop: -56,
      stickerRight: 10,
      userAvatar: persona.userAvatar,
      agentAvatar: persona.userAvatar,
      wcagReport: {
        textContrast: Number(wcagContrast(textMainRgb, codeSurfaceRgb).toFixed(2)),
        mutedContrast: Number(wcagContrast(textMutedRgb, sidebarSurfaceRgb).toFixed(2)),
        primaryContrast: Number(wcagContrast(primaryRgb, codeSurfaceRgb).toFixed(2)),
        dominantHue: Math.round(h1),
        accentHue: Math.round(h2)
      }
    };
  }

  /**
   * Scans a 64x64 downsampled Canvas histogram in OKLCH space to extract primary & accent hues.
   */
  function analyzeImageHistogram64(imgEl) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { h1: 275, c1: 0.17, h2: 205, c2: 0.15, avgL: 0.35 };
    }
    ctx.drawImage(imgEl, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    const bucketCount = 24; // 15 deg per bucket
    const weights = new Float64Array(bucketCount);
    const sumSin = new Float64Array(bucketCount);
    const sumCos = new Float64Array(bucketCount);
    const sumC = new Float64Array(bucketCount);
    let totalLum = 0;
    let pixelCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 64) continue;
      const lch = rgbToOklch(data[i], data[i + 1], data[i + 2]);
      totalLum += lch.L;
      pixelCount++;

      if (lch.C < 0.022 || lch.L < 0.06 || lch.L > 0.96) continue;
      const w = Math.pow(lch.C, 1.35) * (0.35 + 0.65 * Math.sin(clamp(lch.L, 0.08, 0.94) * Math.PI));
      const bIdx = Math.min(bucketCount - 1, Math.floor(lch.h / 15));
      const rad = (lch.h * Math.PI) / 180;
      weights[bIdx] += w;
      sumSin[bIdx] += Math.sin(rad) * w;
      sumCos[bIdx] += Math.cos(rad) * w;
      sumC[bIdx] += lch.C * w;
    }

    let bestIdx = 0;
    for (let b = 1; b < bucketCount; b++) {
      if (weights[b] > weights[bestIdx]) bestIdx = b;
    }

    let h1 = 275;
    let c1 = 0.17;
    if (weights[bestIdx] > 0.0001) {
      h1 = Math.atan2(sumSin[bestIdx], sumCos[bestIdx]) * (180 / Math.PI);
      if (h1 < 0) h1 += 360;
      c1 = clamp((sumC[bestIdx] / weights[bestIdx]) * 1.25, 0.12, 0.23);
    }

    let secondIdx = -1;
    let secondBestW = 0;
    for (let b = 0; b < bucketCount; b++) {
      const centerHue = b * 15 + 7.5;
      if (circularHueDistance(centerHue, h1) < 36) continue;
      if (weights[b] > secondBestW) {
        secondBestW = weights[b];
        secondIdx = b;
      }
    }

    let h2 = (h1 + 48) % 360;
    let c2 = clamp(c1 * 0.92, 0.11, 0.21);
    if (secondIdx >= 0 && secondBestW > weights[bestIdx] * 0.12) {
      h2 = Math.atan2(sumSin[secondIdx], sumCos[secondIdx]) * (180 / Math.PI);
      if (h2 < 0) h2 += 360;
      c2 = clamp((sumC[secondIdx] / secondBestW) * 1.2, 0.11, 0.22);
    }

    const avgL = pixelCount > 0 ? totalLum / pixelCount : 0.35;
    return { h1, c1, h2, c2, avgL };
  }

  function compressBackdropToDataUrl(imgEl) {
    const maxW = 2560;
    const maxH = 1440;
    const natW = Math.max(1, imgEl.naturalWidth || imgEl.width || 1920);
    const natH = Math.max(1, imgEl.naturalHeight || imgEl.height || 1080);
    const scale = Math.min(1, maxW / natW, maxH / natH);
    const w = Math.max(64, Math.round(natW * scale));
    const h = Math.max(64, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(imgEl, 0, 0, w, h);
    let dataUrl = canvas.toDataURL('image/webp', 0.86);
    if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    }
    return safeRasterDataUrl(dataUrl);
  }

  function forgeFromWallpaperFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || typeof file.size !== 'number' || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
        reject(new Error('Ảnh vượt quá giới hạn 15MB hoặc trống.'));
        return;
      }
      if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
        reject(new Error('Chỉ hỗ trợ ảnh PNG, JPEG, WebP hoặc GIF.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
      reader.onload = () => {
        const rawUrl = String(reader.result || '');
        const img = new Image();
        img.onerror = () => reject(new Error('Dữ liệu ảnh không hợp lệ hoặc bị hỏng.'));
        img.onload = () => {
          try {
            const stats = analyzeImageHistogram64(img);
            const wpDataUrl = compressBackdropToDataUrl(img);
            if (!wpDataUrl) {
              reject(new Error('Không thể mã hóa ảnh nền an toàn.'));
              return;
            }
            const defaultDimming = stats.avgL > 0.58 ? 44 : (stats.avgL > 0.38 ? 32 : 24);
            const suggestedFx = suggestFxModeFromHue(stats.h1);
            const baseName = String(file.name || 'Custom 4K').replace(/\.[^.]+$/, '').slice(0, 36).trim() || 'Forged Universe';
            const themeDef = buildOklchThemeDefinition({
              h1: stats.h1,
              c1: stats.c1,
              h2: stats.h2,
              c2: stats.c2,
              defaultDimming,
              fxMode: suggestedFx,
              wallpaper: wpDataUrl,
              concept: `OKLCH 64×64 Forged • WCAG AA ${stats.avgL > 0.5 ? 'Bright-Balanced' : 'Deep-Focus'}`
            });
            resolve({
              suggestedName: `⚒️ ${baseName}`,
              fxMode: suggestedFx,
              stats,
              theme: themeDef
            });
          } catch (err) {
            reject(err);
          }
        };
        img.src = rawUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ==========================================================================
   * 3 BUILT-IN MULTIVERSE PRESETS
   * ========================================================================== */

  const MULTIVERSE_PRESETS = [
    {
      id: 'shadow_monarch',
      name: '🌌 Đế Vương Bóng Tối (Shadow Monarch)',
      shortLabel: '🌌 Đế Vương Bóng Tối',
      personaId: 'shadow_monarch',
      fxMode: 'moon',
      build() {
        const def = buildOklchThemeDefinition({
          h1: 286,
          c1: 0.20,
          h2: 206,
          c2: 0.17,
          defaultDimming: 24,
          fxMode: 'moon',
          personaId: 'shadow_monarch',
          wallpaper: makeMultiverseBackdropUri('shadow_monarch'),
          concept: 'Shadow Monarch Abyssal Violet & Necro-Azure • OKLCH WCAG AA'
        });
        def.npc = {
          badgeLabel: '🌌 Quân Đoàn Bóng Tối',
          title: 'Đế Vương Bóng Tối • Shadow Sovereign',
          placeholder: 'Ra lệnh cho Quân Đoàn Bóng Tối...',
          pills: [
            { key: 'act1', label: '🗡️ Trỗi Dậy (Arise)' },
            { key: 'act2', label: '🌌 Lãnh Địa Đế Vương' },
            { key: 'act3', label: '💠 Hồi Phục Mana' }
          ],
          dialogs: {
            welcome: [
              'Bóng tối tĩnh lặng đã bao phủ toàn bộ không gian code. Chỉ cần ngài ra lệnh: "Arise!" 🌌',
              'Quân đoàn kỵ sĩ bóng đêm đang canh gác từng dòng logic cho ngài, không một bug nào thoát khỏi tầm mắt! 🗡️💙'
            ],
            act1: ['"Arise!" — Mọi tiến trình và subagent đồng loạt thức tỉnh với hiệu suất cực đại! 🌌⚡'],
            act2: ['Lãnh Địa Đế Vương kích hoạt: Độ tương phản OKLCH sắc lẹm giúp ngài nhìn thấu mọi kiến trúc phức tạp! 💜'],
            act3: ['Bình tĩnh điều hòa hơi thở và uống một ngụm nước mát để hồi đầy thanh Mana nhé, Thống Soái! 🧪✨']
          }
        };
        return def;
      }
    },
    {
      id: 'six_eyes',
      name: '♾️ Vô Lượng Không Xứ (Six Eyes Domain)',
      shortLabel: '♾️ Vô Lượng Không Xứ',
      personaId: 'six_eyes',
      fxMode: 'mist',
      build() {
        const def = buildOklchThemeDefinition({
          h1: 222,
          c1: 0.18,
          h2: 304,
          c2: 0.19,
          defaultDimming: 24,
          fxMode: 'mist',
          personaId: 'six_eyes',
          wallpaper: makeMultiverseBackdropUri('six_eyes'),
          concept: 'Six Eyes Celestial Cyan & Hollow Purple Infinity • OKLCH WCAG AA'
        });
        def.npc = {
          badgeLabel: '♾️ Lục Nhãn',
          title: 'Lục Nhãn Vô Hạ Hạn • Six Eyes Domain',
          placeholder: 'Khai triển Lãnh Địa cùng Lục Nhãn...',
          pills: [
            { key: 'act1', label: '♾️ Vô Hạ Hạn' },
            { key: 'act2', label: '🟣 Tử Hư Thức' },
            { key: 'act3', label: '👁️ Lục Nhãn Quét Bug' }
          ],
          dialogs: {
            welcome: [
              'Đừng lo, giữa trời và đất này ngài đang nắm giữ không gian code sắc nét nhất! ♾️💙',
              'Lục Nhãn đã phân tích xong luồng dữ liệu — mọi tác vụ thừa đều bị chặn ngoài Vô Hạ Hạn! ✨'
            ],
            act1: ['Thuật thức Vô Hạ Hạn giữ khoảng cách tuyệt đối giữa sự xao nhãng và trạng thái Deep Flow của ngài! ♾️'],
            act2: ['Giao thoa Thương & Hách — Tử Hư Thức quét sạch toàn bộ nợ kỹ thuật cản đường! 🟣⚡'],
            act3: ['Dù có Lục Nhãn thì làm việc lâu cũng cần thả lỏng đôi mắt 20 giây đó nha! 😎✨']
          }
        };
        return def;
      }
    },
    {
      id: 'great_sage',
      name: '🔥 Hắc Thần Đại Thánh (Golden Sage)',
      shortLabel: '🔥 Hắc Thần Đại Thánh',
      personaId: 'great_sage',
      fxMode: 'sun',
      build() {
        const def = buildOklchThemeDefinition({
          h1: 72,
          c1: 0.18,
          h2: 26,
          c2: 0.19,
          defaultDimming: 26,
          fxMode: 'sun',
          personaId: 'great_sage',
          wallpaper: makeMultiverseBackdropUri('great_sage'),
          concept: 'Obsidian Gold & Fiery Golden Eyes • OKLCH WCAG AA'
        });
        def.npc = {
          badgeLabel: '🔥 Đại Thánh',
          title: 'Tề Thiên Đại Thánh • Destined Great Sage',
          placeholder: 'Đàm đạo cùng Đại Thánh...',
          pills: [
            { key: 'act1', label: '🔥 Hỏa Nhãn Kim Tinh' },
            { key: 'act2', label: '棍 Định Hải Thần Châm' },
            { key: 'act3', label: '☁️ Cân Đẩu Vân' }
          ],
          dialogs: {
            welcome: [
              'Hỏa Nhãn Kim Tinh đã bật sáng! Yêu ma hay bug ẩn hình kiểu gì cũng hiện nguyên hình dưới gậy Như Ý! 🔥💛',
              'Đường Thiên Mệnh do chính tay ngài viết nên từng dòng code — cứ vung thiết bảng tiến tới! ⚡'
            ],
            act1: ['Đôi mắt rèn trong lò bát quái nhìn xuyên thấu mọi race-condition và memory leak! 🔥👁️'],
            act2: ['Định Hải Thần Châm trấn giữ kiến trúc vững như bàn thạch trước mọi tải trọng! 💛'],
            act3: ['Nghỉ tay thưởng thức trái đào tiên và hớp trà nóng trước khi lộn một vòng Cân Đẩu Vân vạn dặm nhé! 🍑🍵']
          }
        };
        return def;
      }
    }
  ];

  /* ==========================================================================
   * SANITIZED `.agytheme` (agytheme/2.0) IMPORT / EXPORT & PERSISTENCE
   * ========================================================================== */

  function normalizeSvgUrlIfNeeded(rawUrl) {
    if (typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';
    if (/^data:image\/svg\+xml,/i.test(trimmed)) {
      try {
        const decoded = decodeURIComponent(trimmed.slice(trimmed.indexOf(',') + 1));
        return svgToDataUri(decoded);
      } catch (_) {
        return '';
      }
    }
    if (/^data:image\/svg\+xml;base64,/i.test(trimmed)) {
      try {
        const b64 = trimmed.slice(trimmed.indexOf(',') + 1);
        const bin = typeof atob === 'function' ? atob(b64) : '';
        const utf8 = decodeURIComponent(Array.from(bin).map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        return svgToDataUri(utf8);
      } catch (_) {
        return '';
      }
    }
    if (/^data:image\/(?:webp|png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return SEC.sanitizeCssUrl(trimmed) || trimmed;
    }
    return SEC.sanitizeCssUrl(trimmed);
  }

  function sanitizeFullThemeRecord(rawDef) {
    const cleanRoot = SEC.stripProtoKeys(rawDef);
    if (!cleanRoot || typeof cleanRoot !== 'object') return null;

    // Pre-normalize any SVG data URIs through sanitizeSvgMarkup -> base64
    const pre = Object.assign({}, cleanRoot);
    const assetKeys = ['wallpaper', 'sticker', 'userSticker', 'actionSticker', 'userActionSticker', 'cornerSvg', 'userCornerSvg', 'userAvatar', 'agentAvatar'];
    for (const ak of assetKeys) {
      if (typeof pre[ak] === 'string') {
        pre[ak] = normalizeSvgUrlIfNeeded(pre[ak]);
      }
    }

    const base = SEC.sanitizeThemeDefinition(pre);
    if (!base) return null;

    // Preserve extended visual glass fields after strict CSS value sanitization
    const extraCssKeys = [
      'secondary', 'glow', 'secondaryGlow', 'composerHeaderBg', 'textColor', 'uiTextColor',
      'uiMutedColor', 'innerBorder', 'bgPosition', 'sidebarHoverBg', 'aiCardBg', 'aiCardBorder',
      'headerBg', 'headerBorder', 'btnBg', 'inputGlassBg', 'inputCardBg', 'pillHoverBg',
      'pillTextColor', 'modalBg', 'modalHeaderBg', 'cardBg'
    ];
    for (const ek of extraCssKeys) {
      if (typeof pre[ek] === 'string') {
        const sv = SEC.sanitizeCssValue(pre[ek], '');
        if (sv) base[ek] = sv;
      }
    }

    // Backfill engine mirrors from the 14 standard OKLCH keys when importing lean `.agytheme` files
    if (!base.secondary && base.accent) base.secondary = base.accent;
    if (!base.textColor && base.textMain) base.textColor = base.textMain;
    if (!base.uiTextColor && base.textMain) base.uiTextColor = base.textMain;
    if (!base.uiMutedColor && base.textMuted) base.uiMutedColor = base.textMuted;
    if (!base.aiCardBg && base.codeBg) base.aiCardBg = base.codeBg;
    if (!base.inputCardBg && base.composerBg) base.inputCardBg = base.composerBg;
    if (!base.bg && base.userBubble) base.bg = base.userBubble;
    if (typeof pre.defaultDimming === 'number' && Number.isFinite(pre.defaultDimming)) {
      base.defaultDimming = clamp(Math.round(pre.defaultDimming), 15, 92);
    } else {
      base.defaultDimming = 28;
    }

    base.clearBackdrop = pre.clearBackdrop !== false;
    base.unifiedGlass = pre.unifiedGlass !== false;
    base.isOrnament = pre.isOrnament !== false;
    base.isChibiNpc = pre.isChibiNpc !== false;
    base.liveWallpaperFx = pre.liveWallpaperFx !== false;
    base.stickerW = clamp(Number(pre.stickerW) || 140, 24, 220);
    base.stickerH = clamp(Number(pre.stickerH) || 64, 18, 120);
    base.stickerTop = clamp(Number(pre.stickerTop) || -56, -96, 16);
    base.stickerRight = clamp(Number(pre.stickerRight) || 10, 0, 48);

    const fallbackPersona = getPersona('yoriichi');
    if (!base.cornerSvg) base.cornerSvg = fallbackPersona.userCornerSvg;
    if (!base.userCornerSvg) base.userCornerSvg = base.cornerSvg;
    if (!base.sticker) base.sticker = fallbackPersona.userSticker;
    if (!base.userSticker) base.userSticker = base.sticker;
    if (!base.userAvatar) base.userAvatar = fallbackPersona.userAvatar;

    return base;
  }

  function loadPersistedThemes() {
    try {
      const raw = localStorage.getItem(STORAGE_FORGED_THEMES);
      if (!raw) return {};
      const parsed = SEC.stripProtoKeys(JSON.parse(raw));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const cleanMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        const safeName = String(k || '').trim().slice(0, 68);
        if (!safeName) continue;
        const safeDef = sanitizeFullThemeRecord(v);
        if (safeDef) {
          safeDef.isForged = true;
          cleanMap[safeName] = safeDef;
        }
      }
      return cleanMap;
    } catch (_) {
      return {};
    }
  }

  function savePersistedTheme(name, themeDef) {
    const safeName = String(name || '').trim().slice(0, 68);
    if (!safeName) return null;
    const safeDef = sanitizeFullThemeRecord(themeDef);
    if (!safeDef) return null;
    safeDef.isForged = true;
    try {
      const current = loadPersistedThemes();
      current[safeName] = safeDef;
      localStorage.setItem(STORAGE_FORGED_THEMES, JSON.stringify(current));
    } catch (_) {
      // If quota exceeded due to huge custom wallpaper, still return sanitized in-memory theme
    }
    return { name: safeName, theme: safeDef };
  }

  function hydrateIntoThemesRegistry(themesRegistry, themeKeysArray) {
    if (!themesRegistry || typeof themesRegistry !== 'object') return;
    const persisted = loadPersistedThemes();
    for (const [name, def] of Object.entries(persisted)) {
      themesRegistry[name] = def;
      if (Array.isArray(themeKeysArray) && !themeKeysArray.includes(name)) {
        themeKeysArray.push(name);
      }
    }
  }

  function registerThemeIntoRegistry(themesRegistry, themeKeysArray, name, rawDef) {
    const saved = savePersistedTheme(name, rawDef);
    if (!saved) return null;
    if (themesRegistry && typeof themesRegistry === 'object') {
      themesRegistry[saved.name] = saved.theme;
    }
    if (Array.isArray(themeKeysArray) && !themeKeysArray.includes(saved.name)) {
      themeKeysArray.push(saved.name);
    }
    return saved;
  }

  function buildAgyThemePackage(name, themeDef, stateSnapshot) {
    const safeName = String(name || 'Forged Theme').trim().slice(0, 68);
    const cleanDef = sanitizeFullThemeRecord(themeDef) || {};
    const st = stateSnapshot || {};
    return {
      schema: 'agytheme/2.0',
      exportedAt: new Date().toISOString(),
      name: safeName,
      masterPersona: typeof st.masterPersona === 'string' ? st.masterPersona : 'yoriichi',
      settings: {
        dimming: clamp(Number(st.dimming) || cleanDef.defaultDimming || 28, 15, 92),
        glassBlur: clamp(Number(st.glassBlur) || 3, 0, 16),
        inputStyle: typeof st.inputStyle === 'string' ? st.inputStyle : 'sync',
        transparentWorld: st.transparentWorld !== false
      },
      theme: cleanDef
    };
  }

  function downloadAgyThemeFile(pkgObj) {
    const slug = String(pkgObj.name || 'antigravity-theme')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'forged-universe';
    const json = JSON.stringify(pkgObj, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.agytheme`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function importAgyThemeObject(rawObj, themesRegistry, themeKeysArray) {
    const clean = SEC.stripProtoKeys(rawObj);
    if (!clean || typeof clean !== 'object' || Array.isArray(clean)) {
      throw new Error('Gói .agytheme không đúng định dạng JSON Object.');
    }
    if (clean.schema && clean.schema !== 'agytheme/2.0' && clean.schema !== 'agytheme/1.0') {
      throw new Error('Phiên bản schema .agytheme không được hỗ trợ.');
    }
    const rawTheme = clean.theme && typeof clean.theme === 'object' ? clean.theme : clean;
    const rawName = String(clean.name || clean.themeName || '⚒️ Imported AgyTheme').trim().slice(0, 68);
    const registered = registerThemeIntoRegistry(themesRegistry, themeKeysArray, rawName, rawTheme);
    if (!registered) {
      throw new Error('Không thể xác thực bảo mật định nghĩa Theme trong gói .agytheme.');
    }
    const settings = (clean.settings && typeof clean.settings === 'object') ? clean.settings : {};
    return {
      name: registered.name,
      theme: registered.theme,
      masterPersona: PERSONA_MAP[clean.masterPersona] ? clean.masterPersona : undefined,
      settings: {
        dimming: typeof settings.dimming === 'number' ? clamp(Math.round(settings.dimming), 15, 92) : registered.theme.defaultDimming,
        glassBlur: typeof settings.glassBlur === 'number' ? clamp(Math.round(settings.glassBlur), 0, 16) : undefined,
        inputStyle: typeof settings.inputStyle === 'string' ? settings.inputStyle : undefined,
        transparentWorld: typeof settings.transparentWorld === 'boolean' ? settings.transparentWorld : undefined
      }
    };
  }

  const api = Object.freeze({
    FX_MODE_OPTIONS,
    PERSONA_LIST,
    MULTIVERSE_PRESETS,
    getPersona,
    rgbToOklch,
    oklchToRgb,
    wcagContrast,
    buildOklchThemeDefinition,
    forgeFromWallpaperFile,
    hydrateIntoThemesRegistry,
    registerThemeIntoRegistry,
    buildAgyThemePackage,
    downloadAgyThemeFile,
    importAgyThemeObject,
    svgToDataUri
  });

  if (typeof window !== 'undefined') {
    window.__AGY_THEME_FORGE__ = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__AGY_THEME_FORGE__ = api;
  }
})();
