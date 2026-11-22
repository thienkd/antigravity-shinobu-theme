(() => {
  'use strict';

  /**
   * Kimetsu no Yaiba — Full-Screen Breathing Forms & Cinematic VFX Engine
   * Exposes window.__AGY_KNY_SKILLS__ supporting all 14 characters × 4 iconic forms (56 skills),
   * Ufotable-inspired 60fps 2D Canvas compositing, cinematic anime banner, and Web Audio SFX.
   * Zero CPU idle footprint (rAF terminates cleanly upon completion).
   */

  const ROOT_SCOPE = typeof window !== 'undefined' ? window : globalThis;
  const TWO_PI = Math.PI * 2;
  const HALF_PI = Math.PI * 0.5;
  const STORAGE_SFX_MUTED = 'agy_kny_sfx_muted';

  /* ==========================================================================
   * 1. CHARACTER ALIAS & FXMODE RESOLUTION
   * ========================================================================== */

  const CHARACTER_IDS = [
    'ubuyashiki',
    'shinobu',
    'giyu',
    'rengoku',
    'uzui',
    'muichiro',
    'mitsuri',
    'obanai',
    'sanemi',
    'gyomei',
    'tanjiro',
    'nezuko',
    'zenitsu',
    'inosuke'
  ];

  const EXACT_ALIAS_MAP = {
    // Canonical IDs
    ubuyashiki: 'ubuyashiki',
    kagaya: 'ubuyashiki',
    oyakata: 'ubuyashiki',
    wisteria_royal: 'ubuyashiki',
    royal_wisteria: 'ubuyashiki',

    shinobu: 'shinobu',
    kocho: 'shinobu',
    wisteria: 'shinobu',
    insect: 'shinobu',

    giyu: 'giyu',
    giyuu: 'giyu',
    tomioka: 'giyu',
    water: 'giyu',

    rengoku: 'rengoku',
    kyojuro: 'rengoku',
    flame: 'rengoku',
    fire: 'rengoku',

    uzui: 'uzui',
    tengen: 'uzui',
    sound: 'uzui',

    muichiro: 'muichiro',
    tokito: 'muichiro',
    mist: 'muichiro',

    mitsuri: 'mitsuri',
    kanroji: 'mitsuri',
    love: 'mitsuri',

    obanai: 'obanai',
    iguro: 'obanai',
    serpent: 'obanai',
    snake: 'obanai',

    sanemi: 'sanemi',
    shinazugawa: 'sanemi',
    wind: 'sanemi',

    gyomei: 'gyomei',
    himejima: 'gyomei',
    stone: 'gyomei',
    rock: 'gyomei',

    tanjiro: 'tanjiro',
    tanjirou: 'tanjiro',
    kamado_tanjiro: 'tanjiro',
    sun_water: 'tanjiro',
    sun: 'tanjiro',
    hinokami: 'tanjiro',

    nezuko: 'nezuko',
    kamado_nezuko: 'nezuko',
    blood_blossom: 'nezuko',
    blood_demon: 'nezuko',

    zenitsu: 'zenitsu',
    agatsuma: 'zenitsu',
    thunder: 'zenitsu',
    lightning: 'zenitsu',

    inosuke: 'inosuke',
    hashibira: 'inosuke',
    beast: 'inosuke'
  };

  const SUBSTRING_MATCHERS = [
    { id: 'ubuyashiki', keys: ['ubuyashiki', 'chúa công', 'chua cong', 'kagaya', 'wisteria_royal', 'royal_wisteria'] },
    { id: 'shinobu', keys: ['shinobu', 'kocho', 'trùng trụ', 'trung tru'] },
    { id: 'giyu', keys: ['giyu', 'tomioka', 'thủy trụ', 'thuy tru'] },
    { id: 'rengoku', keys: ['rengoku', 'kyojuro', 'viêm trụ', 'viem tru'] },
    { id: 'uzui', keys: ['uzui', 'tengen', 'âm trụ', 'am tru'] },
    { id: 'muichiro', keys: ['muichiro', 'tokito', 'hà trụ', 'ha tru'] },
    { id: 'mitsuri', keys: ['mitsuri', 'kanroji', 'luyến trụ', 'luyen tru'] },
    { id: 'obanai', keys: ['obanai', 'iguro', 'xà trụ', 'xa tru'] },
    { id: 'sanemi', keys: ['sanemi', 'shinazugawa', 'phong trụ', 'phong tru'] },
    { id: 'gyomei', keys: ['gyomei', 'himejima', 'nham trụ', 'nham tru'] },
    { id: 'tanjiro', keys: ['tanjiro', 'nhật luân', 'nhat luan', 'sun_water', 'hinokami'] },
    { id: 'nezuko', keys: ['nezuko', 'hồng liên', 'hong lien', 'blood_blossom'] },
    { id: 'zenitsu', keys: ['zenitsu', 'agatsuma', 'lôi minh', 'loi minh'] },
    { id: 'inosuke', keys: ['inosuke', 'hashibira', 'dã thú', 'da thu'] }
  ];

  function resolveCharacterId(input) {
    if (!input) return null;
    if (typeof input === 'object') {
      const candidates = [input.charId, input.id, input.fxMode, input.themeName, input.name, input.key];
      for (let i = 0; i < candidates.length; i++) {
        const resolved = resolveCharacterId(candidates[i]);
        if (resolved) return resolved;
      }
      return null;
    }
    const norm = String(input).trim().toLowerCase();
    if (!norm) return null;
    if (EXACT_ALIAS_MAP[norm]) return EXACT_ALIAS_MAP[norm];

    for (let i = 0; i < SUBSTRING_MATCHERS.length; i++) {
      const entry = SUBSTRING_MATCHERS[i];
      for (let k = 0; k < entry.keys.length; k++) {
        if (norm.includes(entry.keys[k])) return entry.id;
      }
    }
    return null;
  }

  /* ==========================================================================
   * 2. CATALOG OF 56 CANONICAL BREATHING FORMS (14 CHARACTERS × 4 FORMS)
   * ========================================================================== */

  const SKILLS_DB = {
    giyu: [
      {
        id: 'giyu_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Thủy Diện Trảm',
        kanji: '水面斬り',
        breathingName: 'Thủy Chi Hô Hấp — Hơi Thở Của Nước',
        voiceLine: 'Mặt nước lặng thinh, một đường kiếm định đoạt.',
        vfxType: 'water_surface_slash',
        primaryColor: '#00b4d8',
        secondaryColor: '#0077b6',
        accentColor: '#e0fbfc',
        sfxElement: 'water',
        durationMs: 2650
      },
      {
        id: 'giyu_2',
        formNumber: 'Tứ Thức',
        nameVi: 'Tứ Thức: Đả Triều',
        kanji: '打ち潮',
        breathingName: 'Thủy Chi Hô Hấp — Hơi Thở Của Nước',
        voiceLine: 'Triều cường cuộn trào, vỗ tan bóng tối!',
        vfxType: 'striking_tide',
        primaryColor: '#0096c7',
        secondaryColor: '#023e8a',
        accentColor: '#caf0f8',
        sfxElement: 'water',
        durationMs: 2800
      },
      {
        id: 'giyu_3',
        formNumber: 'Thập Thức',
        nameVi: 'Thập Thức: Sinh Sinh Lưu Chuyển',
        kanji: '生生流転',
        breathingName: 'Thủy Chi Hô Hấp — Hơi Thở Của Nước',
        voiceLine: 'Xoáy nước nối tiếp không ngừng — Thủy Long xuất thế!',
        vfxType: 'water_dragon',
        primaryColor: '#38bdf8',
        secondaryColor: '#0369a1',
        accentColor: '#f0f9ff',
        sfxElement: 'water_dragon',
        durationMs: 3100
      },
      {
        id: 'giyu_4',
        formNumber: 'Thập Nhất Thức',
        nameVi: 'Thập Nhất Thức: Tĩnh',
        kanji: '凪 — Nagi',
        breathingName: 'Thủy Chi Hô Hấp — Hơi Thở Của Nước',
        voiceLine: 'Vạn vật quy tịnh... hóa giải mọi sát chiêu.',
        vfxType: 'dead_calm',
        primaryColor: '#48cae4',
        secondaryColor: '#03045e',
        accentColor: '#ade8f4',
        sfxElement: 'dead_calm',
        durationMs: 3000
      }
    ],

    ubuyashiki: [
      {
        id: 'ubuyashiki_1',
        formNumber: 'Đệ Nhất Lễ',
        nameVi: 'Đệ Nhất Lễ: Thiên Niên Tử Đằng Kết Giới',
        kanji: '千年藤結界',
        breathingName: 'Huyết Mạch Ubuyashiki — Gia Đình Chúa Công',
        voiceLine: 'Hương tử đằng ngàn năm che chở các con bình an.',
        vfxType: 'wisteria_sanctuary',
        primaryColor: '#c084fc',
        secondaryColor: '#6b21a8',
        accentColor: '#fde047',
        sfxElement: 'royal',
        durationMs: 2850
      },
      {
        id: 'ubuyashiki_2',
        formNumber: 'Đệ Nhị Lễ',
        nameVi: 'Đệ Nhị Lễ: Vạn Đăng Chúc Phúc',
        kanji: '万灯祝福',
        breathingName: 'Huyết Mạch Ubuyashiki — Gia Đình Chúa Công',
        voiceLine: 'Ngàn ánh đèn ấm áp soi sáng bước chân kiếm sĩ.',
        vfxType: 'sky_lanterns',
        primaryColor: '#fbbf24',
        secondaryColor: '#9333ea',
        accentColor: '#fef3c7',
        sfxElement: 'royal',
        durationMs: 3000
      },
      {
        id: 'ubuyashiki_3',
        formNumber: 'Đệ Tam Lễ',
        nameVi: 'Đệ Tam Lễ: Nguyệt Hạ Thanh Tâm',
        kanji: '月下清心',
        breathingName: 'Huyết Mạch Ubuyashiki — Gia Đình Chúa Công',
        voiceLine: 'Dưới ánh trăng thanh khiết, tâm hồn lại an nhiên.',
        vfxType: 'moonlight_serenity',
        primaryColor: '#a78bfa',
        secondaryColor: '#38bdf8',
        accentColor: '#fef08a',
        sfxElement: 'royal',
        durationMs: 2850
      },
      {
        id: 'ubuyashiki_4',
        formNumber: 'Tuyệt Lễ',
        nameVi: 'Tuyệt Lễ: Ý Chí Bất Diệt',
        kanji: '不滅の想い',
        breathingName: 'Huyết Mạch Ubuyashiki — Gia Đình Chúa Công',
        voiceLine: 'Ý chí con người là vĩnh cửu và bất diệt!',
        vfxType: 'eternal_will',
        primaryColor: '#facc15',
        secondaryColor: '#a855f7',
        accentColor: '#ffffff',
        sfxElement: 'royal_grand',
        durationMs: 3150
      }
    ],

    shinobu: [
      {
        id: 'shinobu_1',
        formNumber: 'Điệp Chi Vũ',
        nameVi: 'Điệp Chi Vũ: Du Hí',
        kanji: '蝶ノ舞 戯れ',
        breathingName: 'Trùng Chi Hô Hấp — Hơi Thở Của Côn Trùng',
        voiceLine: 'Moshi moshi~ Nhẹ nhàng như cánh bướm vờn hoa nhé!',
        vfxType: 'butterfly_caprice',
        primaryColor: '#c084fc',
        secondaryColor: '#2dd4bf',
        accentColor: '#fae8ff',
        sfxElement: 'insect',
        durationMs: 2700
      },
      {
        id: 'shinobu_2',
        formNumber: 'Phong Nha Chi Vũ',
        nameVi: 'Phong Nha Chi Vũ: Chân Mĩ',
        kanji: '蜂牙ノ舞 真靡き',
        breathingName: 'Trùng Chi Hô Hấp — Hơi Thở Của Côn Trùng',
        voiceLine: 'Một mũi kim tử đằng xuyên thấu trong chớp mắt.',
        vfxType: 'bee_sting_thrust',
        primaryColor: '#d946ef',
        secondaryColor: '#7e22ce',
        accentColor: '#5eead4',
        sfxElement: 'insect',
        durationMs: 2550
      },
      {
        id: 'shinobu_3',
        formNumber: 'Thanh Linh Chi Vũ',
        nameVi: 'Thanh Linh Chi Vũ: Phúc Nhãn Lục Giác',
        kanji: '蜻蛉ノ舞 複眼六角',
        breathingName: 'Trùng Chi Hô Hấp — Hơi Thở Của Côn Trùng',
        voiceLine: 'Sáu mũi châm tử đằng cùng lúc nở rộ!',
        vfxType: 'compound_eye_hexagon',
        primaryColor: '#a855f7',
        secondaryColor: '#14b8a6',
        accentColor: '#f5d0fe',
        sfxElement: 'insect',
        durationMs: 2750
      },
      {
        id: 'shinobu_4',
        formNumber: 'Ngô Công Chi Vũ',
        nameVi: 'Ngô Công Chi Vũ: Bách Túc Xà Phúc',
        kanji: '蜈蚣ノ舞 百足蛇腹',
        breathingName: 'Trùng Chi Hô Hấp — Hơi Thở Của Côn Trùng',
        voiceLine: 'Tốc độ cực hạn — không kẻ nào kịp nhìn theo!',
        vfxType: 'hundred_legged_zigzag',
        primaryColor: '#e879f9',
        secondaryColor: '#6d28d9',
        accentColor: '#99f6e4',
        sfxElement: 'insect',
        durationMs: 2900
      }
    ],

    rengoku: [
      {
        id: 'rengoku_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Bất Tri Hỏa',
        kanji: '壱ノ型 不知火',
        breathingName: 'Viêm Chi Hô Hấp — Hơi Thở Của Lửa',
        voiceLine: 'Ngọn lửa chính nghĩa bừng sáng trong một nhịp thở!',
        vfxType: 'unknowing_fire',
        primaryColor: '#f97316',
        secondaryColor: '#dc2626',
        accentColor: '#fef08a',
        sfxElement: 'flame',
        durationMs: 2600
      },
      {
        id: 'rengoku_2',
        formNumber: 'Nhị Thức',
        nameVi: 'Nhị Thức: Thăng Viêm Thiên',
        kanji: '弐ノ型 昇炎天',
        breathingName: 'Viêm Chi Hô Hấp — Hơi Thở Của Lửa',
        voiceLine: 'Chém vút lên trời cao như thái dương rực cháy!',
        vfxType: 'rising_scorching_sun',
        primaryColor: '#fb923c',
        secondaryColor: '#ef4444',
        accentColor: '#fde047',
        sfxElement: 'flame',
        durationMs: 2750
      },
      {
        id: 'rengoku_3',
        formNumber: 'Ngũ Thức',
        nameVi: 'Ngũ Thức: Viêm Hổ',
        kanji: '伍ノ型 炎虎',
        breathingName: 'Viêm Chi Hô Hấp — Hơi Thở Của Lửa',
        voiceLine: 'Mãnh hổ rực lửa càn quét mọi chướng ngại!',
        vfxType: 'flame_tiger',
        primaryColor: '#f59e0b',
        secondaryColor: '#b91c1c',
        accentColor: '#fffbeb',
        sfxElement: 'flame',
        durationMs: 2900
      },
      {
        id: 'rengoku_4',
        formNumber: 'Áo Nghĩa — Cửu Thức',
        nameVi: 'Áo Nghĩa — Cửu Thức: Luyện Ngục',
        kanji: '玖ノ型 煉獄',
        breathingName: 'Viêm Chi Hô Hấp — Hơi Thở Của Lửa',
        voiceLine: 'Hãy thắp sáng ngọn lửa trong tim — Luyện Ngục!',
        vfxType: 'rengoku_dragon',
        primaryColor: '#ef4444',
        secondaryColor: '#f59e0b',
        accentColor: '#fef9c3',
        sfxElement: 'flame_grand',
        durationMs: 3150
      }
    ],

    uzui: [
      {
        id: 'uzui_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Tỷ Điệu',
        kanji: '壱ノ型 轟',
        breathingName: 'Âm Chi Hô Hấp — Hơi Thở Của Âm Thanh',
        voiceLine: 'Nổ vang thật hào nhoáng nào!',
        vfxType: 'roar_blast',
        primaryColor: '#f43f5e',
        secondaryColor: '#fbbf24',
        accentColor: '#2dd4bf',
        sfxElement: 'sound',
        durationMs: 2650
      },
      {
        id: 'uzui_2',
        formNumber: 'Tứ Thức',
        nameVi: 'Tứ Thức: Hưởng Trảm Vô Gian',
        kanji: '肆ノ型 響斬無間',
        breathingName: 'Âm Chi Hô Hấp — Hơi Thở Của Âm Thanh',
        voiceLine: 'Lễ hội pháo hoa song đao bất tận bắt đầu!',
        vfxType: 'constant_resounding_slashes',
        primaryColor: '#fbbf24',
        secondaryColor: '#ec4899',
        accentColor: '#38bdf8',
        sfxElement: 'sound',
        durationMs: 2850
      },
      {
        id: 'uzui_3',
        formNumber: 'Ngũ Thức',
        nameVi: 'Ngũ Thức: Minh Huyền Tấu',
        kanji: '伍ノ型 鳴弦奏々',
        breathingName: 'Âm Chi Hô Hấp — Hơi Thở Của Âm Thanh',
        voiceLine: 'Giai điệu cuồng nhiệt nhất của Âm Trụ đây!',
        vfxType: 'string_performance',
        primaryColor: '#f59e0b',
        secondaryColor: '#d946ef',
        accentColor: '#fef08a',
        sfxElement: 'sound',
        durationMs: 2950
      },
      {
        id: 'uzui_4',
        formNumber: 'Tuyệt Kỹ',
        nameVi: 'Tuyệt Kỹ: Phổ Nhạc Hoàn Mỹ',
        kanji: '譜面完成',
        breathingName: 'Âm Chi Hô Hấp — Hơi Thở Của Âm Thanh',
        voiceLine: 'Bản phổ nhạc chiến thắng đã hoàn tất! Tiến lên!',
        vfxType: 'musical_score',
        primaryColor: '#fde047',
        secondaryColor: '#f43f5e',
        accentColor: '#5eead4',
        sfxElement: 'sound_score',
        durationMs: 3050
      }
    ],

    muichiro: [
      {
        id: 'muichiro_1',
        formNumber: 'Nhị Thức',
        nameVi: 'Nhị Thức: Bát Trùng Hà',
        kanji: '弐ノ型 八重霞',
        breathingName: 'Hà Chi Hô Hấp — Hơi Thở Của Sương Mù',
        voiceLine: 'Tám tầng sương mỏng khép lại trong tích tắc.',
        vfxType: 'eight_layered_mist',
        primaryColor: '#5eead4',
        secondaryColor: '#0f766e',
        accentColor: '#f0fdfa',
        sfxElement: 'mist',
        durationMs: 2650
      },
      {
        id: 'muichiro_2',
        formNumber: 'Tứ Thức',
        nameVi: 'Tứ Thức: Di Lưu Trảm',
        kanji: '肆ノ型 移流斬り',
        breathingName: 'Hà Chi Hô Hấp — Hơi Thở Của Sương Mù',
        voiceLine: 'Nhẹ tựa làn mây trôi qua đỉnh núi.',
        vfxType: 'shifting_flow_slash',
        primaryColor: '#2dd4bf',
        secondaryColor: '#115e59',
        accentColor: '#ccfbf1',
        sfxElement: 'mist',
        durationMs: 2650
      },
      {
        id: 'muichiro_3',
        formNumber: 'Ngũ Thức',
        nameVi: 'Ngũ Thức: Vân Hải Chi Mạt',
        kanji: '伍ノ型 霞雲の海',
        breathingName: 'Hà Chi Hô Hấp — Hơi Thở Của Sương Mù',
        voiceLine: 'Giữa biển mây mịt mù, lưỡi kiếm lấp lánh.',
        vfxType: 'sea_of_clouds',
        primaryColor: '#99f6e4',
        secondaryColor: '#0d9488',
        accentColor: '#ffffff',
        sfxElement: 'mist',
        durationMs: 2900
      },
      {
        id: 'muichiro_4',
        formNumber: 'Thất Thức',
        nameVi: 'Thất Thức: Oboro (Mông Lông)',
        kanji: '漆ノ型 朧',
        breathingName: 'Hà Chi Hô Hấp — Hơi Thở Của Sương Mù',
        voiceLine: 'Ẩn hiện trong sương khói... ngươi không thể chạm tới ta.',
        vfxType: 'oboro_haze',
        primaryColor: '#67e8f9',
        secondaryColor: '#134e4a',
        accentColor: '#ecfeff',
        sfxElement: 'mist',
        durationMs: 3050
      }
    ],

    mitsuri: [
      {
        id: 'mitsuri_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Sơ Luyến Lịch Đấu',
        kanji: '壱ノ型 初恋のわななき',
        breathingName: 'Luyến Chi Hô Hấp — Hơi Thở Của Tình Yêu',
        voiceLine: 'Nhịp tim rung động đầu đời nhanh như chớp!',
        vfxType: 'shivers_of_first_love',
        primaryColor: '#f472b6',
        secondaryColor: '#ec4899',
        accentColor: '#86efac',
        sfxElement: 'love',
        durationMs: 2650
      },
      {
        id: 'mitsuri_2',
        formNumber: 'Nhị Thức',
        nameVi: 'Nhị Thức: Áo Não Tuần Luyến',
        kanji: '弐ノ型 懊悩巡る恋',
        breathingName: 'Luyến Chi Hô Hấp — Hơi Thở Của Tình Yêu',
        voiceLine: 'Dải kiếm lụa mềm mại cuốn trôi mọi âu lo!',
        vfxType: 'love_pangs',
        primaryColor: '#fb7185',
        secondaryColor: '#34d399',
        accentColor: '#fce7f3',
        sfxElement: 'love',
        durationMs: 2750
      },
      {
        id: 'mitsuri_3',
        formNumber: 'Tam Thức',
        nameVi: 'Tam Thức: Luyến Miêu Thời Vũ',
        kanji: '参ノ型 恋猫しぐれ',
        breathingName: 'Luyến Chi Hô Hấp — Hơi Thở Của Tình Yêu',
        voiceLine: 'Mưa hoa anh đào rực rỡ bảo vệ mọi người!',
        vfxType: 'catlove_shower',
        primaryColor: '#f9a8d4',
        secondaryColor: '#db2777',
        accentColor: '#bbf7d0',
        sfxElement: 'love',
        durationMs: 2850
      },
      {
        id: 'mitsuri_4',
        formNumber: 'Lục Thức',
        nameVi: 'Lục Thức: Miêu Túc Luyến Phong',
        kanji: '陸ノ型 猫足恋風',
        breathingName: 'Luyến Chi Hô Hấp — Hơi Thở Của Tình Yêu',
        voiceLine: 'Cơn gió tình yêu cuốn bay hết muộn phiền nhé!',
        vfxType: 'cat_legged_winds',
        primaryColor: '#ec4899',
        secondaryColor: '#4ade80',
        accentColor: '#fdf2f8',
        sfxElement: 'love',
        durationMs: 3000
      }
    ],

    obanai: [
      {
        id: 'obanai_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Ủy Xà Trảm',
        kanji: '壱ノ型 委蛇斬り',
        breathingName: 'Xà Chi Hô Hấp — Hơi Thở Của Rắn',
        voiceLine: 'Đường kiếm uốn lượn không một góc chết.',
        vfxType: 'winding_serpent_slash',
        primaryColor: '#a855f7',
        secondaryColor: '#10b981',
        accentColor: '#e9d5ff',
        sfxElement: 'serpent',
        durationMs: 2650
      },
      {
        id: 'obanai_2',
        formNumber: 'Nhị Thức',
        nameVi: 'Nhị Thức: Hiệp Đầu Độc Nha',
        kanji: '弐ノ型 狭頭の毒牙',
        breathingName: 'Xà Chi Hô Hấp — Hơi Thở Của Rắn',
        voiceLine: 'Nanh độc Bạch Xà kết liễu từ điểm mù!',
        vfxType: 'venom_fangs',
        primaryColor: '#e2e8f0',
        secondaryColor: '#7e22ce',
        accentColor: '#34d399',
        sfxElement: 'serpent',
        durationMs: 2700
      },
      {
        id: 'obanai_3',
        formNumber: 'Tam Thức',
        nameVi: 'Tam Thức: Nhiễu Xà Chắt Thắt',
        kanji: '参ノ型 塒締め',
        breathingName: 'Xà Chi Hô Hấp — Hơi Thở Của Rắn',
        voiceLine: 'Vòng vây mãng xà siết chặt không lối thoát.',
        vfxType: 'coil_choke',
        primaryColor: '#8b5cf6',
        secondaryColor: '#059669',
        accentColor: '#f8fafc',
        sfxElement: 'serpent',
        durationMs: 2850
      },
      {
        id: 'obanai_4',
        formNumber: 'Ngũ Thức',
        nameVi: 'Ngũ Thức: Uyển Uyển Trường Xà',
        kanji: '伍ノ型 蜿蜿長蛇',
        breathingName: 'Xà Chi Hô Hấp — Hơi Thở Của Rắn',
        voiceLine: 'Đi nào Kaburamaru — Đại Bạch Xà xuất kích!',
        vfxType: 'slithering_serpent',
        primaryColor: '#f1f5f9',
        secondaryColor: '#9333ea',
        accentColor: '#6ee7b7',
        sfxElement: 'serpent',
        durationMs: 3050
      }
    ],

    sanemi: [
      {
        id: 'sanemi_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Trần Toàn Phong • Tước',
        kanji: '壱ノ型 塵旋風・削ぎ',
        breathingName: 'Phong Chi Hô Hấp — Hơi Thở Của Gió',
        voiceLine: 'Cơn lốc cuồng phong nghiền nát tất cả!',
        vfxType: 'dust_whirlwind_cutter',
        primaryColor: '#22c55e',
        secondaryColor: '#15803d',
        accentColor: '#dcfce7',
        sfxElement: 'wind',
        durationMs: 2650
      },
      {
        id: 'sanemi_2',
        formNumber: 'Nhị Thức',
        nameVi: 'Nhị Thức: Trảo • Khoa Hộ Phong',
        kanji: '弐ノ型 爪々・科戸風',
        breathingName: 'Phong Chi Hô Hấp — Hơi Thở Của Gió',
        voiceLine: 'Bốn lưỡi trảo cuồng phong xé toạc màn đêm!',
        vfxType: 'claws_purifying_wind',
        primaryColor: '#4ade80',
        secondaryColor: '#166534',
        accentColor: '#f0fdf4',
        sfxElement: 'wind',
        durationMs: 2650
      },
      {
        id: 'sanemi_3',
        formNumber: 'Thất Thức',
        nameVi: 'Thất Thức: Kính Phong • Đằng Quả Phong',
        kanji: '漆ノ型 勁風・天狗風',
        breathingName: 'Phong Chi Hô Hấp — Hơi Thở Của Gió',
        voiceLine: 'Bão lốc cuộn trào cuốn phăng lũ quỷ lên trời!',
        vfxType: 'gale_sudden_gusts',
        primaryColor: '#10b981',
        secondaryColor: '#065f46',
        accentColor: '#bbf7d0',
        sfxElement: 'wind',
        durationMs: 2900
      },
      {
        id: 'sanemi_4',
        formNumber: 'Bát Thức',
        nameVi: 'Bát Thức: Sơ Liệt Phong Trảm',
        kanji: '捌ノ型 初烈風斬り',
        breathingName: 'Phong Chi Hô Hấp — Hơi Thở Của Gió',
        voiceLine: 'Đừng hòng cản bước Phong Trụ — Chém tan hết đi!',
        vfxType: 'primary_gale_slash',
        primaryColor: '#86efac',
        secondaryColor: '#16a34a',
        accentColor: '#ffffff',
        sfxElement: 'wind',
        durationMs: 3000
      }
    ],

    gyomei: [
      {
        id: 'gyomei_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Xà Văn Nham • Song Cực',
        kanji: '壱ノ型 蛇紋岩・双極',
        breathingName: 'Nham Chi Hô Hấp — Hơi Thở Của Đá',
        voiceLine: 'Nam Mô A Di Đà Phật... Song binh hợp kích!',
        vfxType: 'serpentinite_bipolar',
        primaryColor: '#f59e0b',
        secondaryColor: '#78350f',
        accentColor: '#fef3c7',
        sfxElement: 'stone',
        durationMs: 2750
      },
      {
        id: 'gyomei_2',
        formNumber: 'Nhị Thức',
        nameVi: 'Nhị Thức: Thiên Diện Toái',
        kanji: '弐ノ型 天面砕き',
        breathingName: 'Nham Chi Hô Hấp — Hơi Thở Của Đá',
        voiceLine: 'Đòn giáng kim cang trấn áp tà ma!',
        vfxType: 'upper_smash',
        primaryColor: '#fbbf24',
        secondaryColor: '#92400e',
        accentColor: '#fffbeb',
        sfxElement: 'stone',
        durationMs: 2800
      },
      {
        id: 'gyomei_3',
        formNumber: 'Tứ Thức',
        nameVi: 'Tứ Thức: Lưu Văn Nham • Tốc Chinh',
        kanji: '肆ノ型 流紋岩・速征',
        breathingName: 'Nham Chi Hô Hấp — Hơi Thở Của Đá',
        voiceLine: 'Xích sắt kim cang hộ trì chúng sinh!',
        vfxType: 'rhyolite_rapid_conquest',
        primaryColor: '#d97706',
        secondaryColor: '#57534e',
        accentColor: '#fde68a',
        sfxElement: 'stone',
        durationMs: 2850
      },
      {
        id: 'gyomei_4',
        formNumber: 'Ngũ Thức',
        nameVi: 'Ngũ Thức: Vũ Lưu Văn Nham',
        kanji: '伍ノ型 瓦輪刑部',
        breathingName: 'Nham Chi Hô Hấp — Hơi Thở Của Đá',
        voiceLine: 'Nguyện ánh hào quang từ bi siêu độ linh hồn lầm lạc.',
        vfxType: 'arcs_of_justice',
        primaryColor: '#facc15',
        secondaryColor: '#b45309',
        accentColor: '#ffffff',
        sfxElement: 'stone_grand',
        durationMs: 3100
      }
    ],

    tanjiro: [
      {
        id: 'tanjiro_1',
        formNumber: 'Vũ Điệu Hỏa Thần',
        nameVi: 'Vũ Điệu Hỏa Thần: Viên Vũ',
        kanji: 'ヒノカミ神楽 円舞',
        breathingName: 'Nhật Chi Hô Hấp / Thủy Hô Hấp',
        voiceLine: 'Hơi thở không ngừng nghỉ — Hỏa Thần Viên Vũ!',
        vfxType: 'hinokami_waltz',
        primaryColor: '#ef4444',
        secondaryColor: '#f59e0b',
        accentColor: '#fef08a',
        sfxElement: 'sun',
        durationMs: 2750
      },
      {
        id: 'tanjiro_2',
        formNumber: 'Vũ Điệu Hỏa Thần',
        nameVi: 'Vũ Điệu Hỏa Thần: Bích La Thiên',
        kanji: 'ヒノカミ神楽 碧羅の天',
        breathingName: 'Nhật Chi Hô Hấp / Thủy Hô Hấp',
        voiceLine: 'Vầng mặt trời rực cháy giữa bầu trời xanh trong vắt!',
        vfxType: 'clear_blue_sky',
        primaryColor: '#f97316',
        secondaryColor: '#0ea5e9',
        accentColor: '#fef9c3',
        sfxElement: 'sun',
        durationMs: 2850
      },
      {
        id: 'tanjiro_3',
        formNumber: 'Tuyệt Kỹ Song Hợp',
        nameVi: 'Nhật Vựng Chi Long • Đầu Vũ',
        kanji: '日暈の龍 頭舞い',
        breathingName: 'Nhật Chi Hô Hấp / Thủy Hô Hấp',
        voiceLine: 'Lửa Mặt Trời và Sóng Nước cùng hòa làm một!',
        vfxType: 'solar_halo_dragon',
        primaryColor: '#fb923c',
        secondaryColor: '#38bdf8',
        accentColor: '#ffffff',
        sfxElement: 'sun_grand',
        durationMs: 3150
      },
      {
        id: 'tanjiro_4',
        formNumber: 'Thập Tam Thức',
        nameVi: 'Thập Tam Thức: Thập Nhị Liên Vũ',
        kanji: '拾参ノ型',
        breathingName: 'Nhật Chi Hô Hấp / Thủy Hô Hấp',
        voiceLine: 'Mười hai thức nối liền thành bình minh bất diệt!',
        vfxType: 'thirteenth_form',
        primaryColor: '#facc15',
        secondaryColor: '#dc2626',
        accentColor: '#fffbeb',
        sfxElement: 'sun_grand',
        durationMs: 3150
      }
    ],

    nezuko: [
      {
        id: 'nezuko_1',
        formNumber: 'Huyết Quỷ Thuật',
        nameVi: 'Huyết Quỷ Thuật: Bộc Huyết',
        kanji: '血鬼術 爆血',
        breathingName: 'Huyết Quỷ Thuật — Ngọn Lửa Hồng Liên',
        voiceLine: 'Ngọn lửa hồng thanh tẩy mọi tà độc bóng đêm!',
        vfxType: 'exploding_blood',
        primaryColor: '#fb7185',
        secondaryColor: '#e11d48',
        accentColor: '#ffe4e6',
        sfxElement: 'blood',
        durationMs: 2650
      },
      {
        id: 'nezuko_2',
        formNumber: 'Thức Tỉnh',
        nameVi: 'Hồng Liên Thiêu Đốt',
        kanji: '紅蓮爆血',
        breathingName: 'Huyết Quỷ Thuật — Ngọn Lửa Hồng Liên',
        voiceLine: 'Hoa lửa hồng sen rực sáng nhuộm thắm Hách Đao!',
        vfxType: 'crimson_lotus_blaze',
        primaryColor: '#f43f5e',
        secondaryColor: '#9f1239',
        accentColor: '#fbcfe8',
        sfxElement: 'blood',
        durationMs: 2850
      },
      {
        id: 'nezuko_3',
        formNumber: 'Huyết Quỷ Thuật',
        nameVi: 'Liễu Hồng Dây Leo',
        kanji: '紅柳連撃',
        breathingName: 'Huyết Quỷ Thuật — Ngọn Lửa Hồng Liên',
        voiceLine: 'Bảo vệ gia đình và những người thân yêu!',
        vfxType: 'crimson_willow_vines',
        primaryColor: '#f472b6',
        secondaryColor: '#15803d',
        accentColor: '#fce7f3',
        sfxElement: 'blood',
        durationMs: 2800
      },
      {
        id: 'nezuko_4',
        formNumber: 'Phúc Lành',
        nameVi: 'Ánh Trăng Hồng Chữa Lành',
        kanji: '癒しの紅炎',
        breathingName: 'Huyết Quỷ Thuật — Ngọn Lửa Hồng Liên',
        voiceLine: 'Hơi ấm dịu dàng xoa dịu mọi vết thương.',
        vfxType: 'healing_pink_moon',
        primaryColor: '#f9a8d4',
        secondaryColor: '#ec4899',
        accentColor: '#fff1f2',
        sfxElement: 'blood_heal',
        durationMs: 2950
      }
    ],

    zenitsu: [
      {
        id: 'zenitsu_1',
        formNumber: 'Nhất Thức',
        nameVi: 'Nhất Thức: Phích Lịch Nhất Thiểm',
        kanji: '壱ノ型 霹靂一閃',
        breathingName: 'Lôi Chi Hô Hấp — Hơi Thở Của Sấm Sét',
        voiceLine: 'Chỉ một chiêu duy nhất rèn giũa đến tận cùng!',
        vfxType: 'thunderclap_flash',
        primaryColor: '#facc15',
        secondaryColor: '#38bdf8',
        accentColor: '#ffffff',
        sfxElement: 'thunder',
        durationMs: 2550
      },
      {
        id: 'zenitsu_2',
        formNumber: 'Nhất Thức • Biến Thể',
        nameVi: 'Phích Lịch Nhất Thiểm • Lục Liên',
        kanji: '霹靂一閃 六連',
        breathingName: 'Lôi Chi Hô Hấp — Hơi Thở Của Sấm Sét',
        voiceLine: 'Sáu tiếng sấm rền vang dội khắp bầu trời đêm!',
        vfxType: 'sixfold_thunder',
        primaryColor: '#fde047',
        secondaryColor: '#0284c7',
        accentColor: '#fef9c3',
        sfxElement: 'thunder_six',
        durationMs: 2950
      },
      {
        id: 'zenitsu_3',
        formNumber: 'Nhất Thức • Cực Hạn',
        nameVi: 'Phích Lịch Nhất Thiểm • Thần Tốc',
        kanji: '霹靂一閃 神速',
        breathingName: 'Lôi Chi Hô Hấp — Hơi Thở Của Sấm Sét',
        voiceLine: 'Vượt qua giới hạn âm thanh — Thần Tốc!',
        vfxType: 'godspeed_thunder',
        primaryColor: '#fef08a',
        secondaryColor: '#a855f7',
        accentColor: '#38bdf8',
        sfxElement: 'thunder',
        durationMs: 2750
      },
      {
        id: 'zenitsu_4',
        formNumber: 'Thất Thức',
        nameVi: 'Thất Thức: Hỏa Lôi Thần',
        kanji: '漆ノ型 火雷神',
        breathingName: 'Lôi Chi Hô Hấp — Hơi Thở Của Sấm Sét',
        voiceLine: 'Thức thứ bảy của riêng ta — Hỏa Lôi Thần!',
        vfxType: 'flaming_thunder_god',
        primaryColor: '#facc15',
        secondaryColor: '#2563eb',
        accentColor: '#ffffff',
        sfxElement: 'thunder_god',
        durationMs: 3150
      }
    ],

    inosuke: [
      {
        id: 'inosuke_1',
        formNumber: 'Nhất Nha',
        nameVi: 'Nhất Nha: Xuyên Bạt',
        kanji: '壱ノ牙 穿ち抜き',
        breathingName: 'Thú Chi Hô Hấp — Hơi Thở Của Quái Thú',
        voiceLine: 'Song kiếm răng cưa xuyên thủng mục tiêu!',
        vfxType: 'pierce_fangs',
        primaryColor: '#38bdf8',
        secondaryColor: '#1d4ed8',
        accentColor: '#e0f2fe',
        sfxElement: 'beast',
        durationMs: 2550
      },
      {
        id: 'inosuke_2',
        formNumber: 'Tam Nha',
        nameVi: 'Tam Nha: Thực Liệt',
        kanji: '参ノ牙 喰い裂き',
        breathingName: 'Thú Chi Hô Hấp — Hơi Thở Của Quái Thú',
        voiceLine: 'Chúa Sơn Lâm Inosuke xé toạc tất cả! Hahaha!',
        vfxType: 'devour_slash',
        primaryColor: '#60a5fa',
        secondaryColor: '#1e3a8a',
        accentColor: '#f8fafc',
        sfxElement: 'beast',
        durationMs: 2650
      },
      {
        id: 'inosuke_3',
        formNumber: 'Ngũ Nha',
        nameVi: 'Ngũ Nha: Điên Nha Liệt Tế',
        kanji: '伍ノ牙 狂い裂き',
        breathingName: 'Thú Chi Hô Hấp — Hơi Thở Của Quái Thú',
        voiceLine: 'Chém tung bốn phương tám hướng — Tránh đường ra!',
        vfxType: 'crazy_cutting',
        primaryColor: '#7dd3fc',
        secondaryColor: '#0369a1',
        accentColor: '#ffffff',
        sfxElement: 'beast',
        durationMs: 2850
      },
      {
        id: 'inosuke_4',
        formNumber: 'Thất Thức',
        nameVi: 'Thất Thức: Không Gian Thức Giác',
        kanji: '漆ノ型 空間識覚',
        breathingName: 'Thú Chi Hô Hấp — Hơi Thở Của Quái Thú',
        voiceLine: 'Từng luồng gió khẽ lay động... tìm thấy ngươi rồi!',
        vfxType: 'spatial_awareness',
        primaryColor: '#22d3ee',
        secondaryColor: '#0f172a',
        accentColor: '#cffafe',
        sfxElement: 'beast_radar',
        durationMs: 2950
      }
    ]
  };

  function cloneSkill(skill, charId, index) {
    return {
      id: skill.id,
      charId: charId,
      index: index,
      formNumber: skill.formNumber,
      nameVi: skill.nameVi,
      kanji: skill.kanji,
      breathingName: skill.breathingName,
      voiceLine: skill.voiceLine,
      vfxType: skill.vfxType,
      primaryColor: skill.primaryColor,
      secondaryColor: skill.secondaryColor,
      accentColor: skill.accentColor,
      sfxElement: skill.sfxElement,
      durationMs: skill.durationMs || 2800
    };
  }

  function getSkillsForCharacter(charIdOrTheme) {
    const charId = resolveCharacterId(charIdOrTheme);
    if (!charId || !SKILLS_DB[charId]) return [];
    return SKILLS_DB[charId].map((s, idx) => cloneSkill(s, charId, idx));
  }

  function getAllSkills() {
    const list = [];
    for (let i = 0; i < CHARACTER_IDS.length; i++) {
      const cid = CHARACTER_IDS[i];
      const forms = SKILLS_DB[cid];
      for (let j = 0; j < forms.length; j++) {
        list.push(cloneSkill(forms[j], cid, j));
      }
    }
    return list;
  }

  /* ==========================================================================
   * 3. COLOR & MATH HELPERS
   * ========================================================================== */

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function easeOutCubic(t) {
    const inv = 1 - clamp(t, 0, 1);
    return 1 - inv * inv * inv;
  }

  function easeOutQuint(t) {
    const inv = 1 - clamp(t, 0, 1);
    return 1 - inv * inv * inv * inv * inv;
  }

  function bellCurve(p, peakAt) {
    const pk = peakAt || 0.25;
    if (p <= 0 || p >= 1) return 0;
    if (p < pk) return easeOutCubic(p / pk);
    const tail = (p - pk) / (1 - pk);
    return Math.max(0, 1 - tail * tail);
  }

  function hexToRgb(hex) {
    const clean = String(hex || '#ffffff').replace('#', '');
    const full = clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, 'f');
    const n = parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(n)) return '255, 255, 255';
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function seeded(i, salt) {
    const x = Math.sin((i + 1) * 12.9898 + (salt || 1) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ==========================================================================
   * 4. LIGHTWEIGHT WEB AUDIO API SWORD & ELEMENTAL SYNTHESIZER
   * ========================================================================== */

  let sharedAudioCtx = null;
  let sharedNoiseBuf = null;

  function safeReadStorage(key) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        return localStorage.getItem(key);
      }
    } catch (_) {}
    return null;
  }

  function safeWriteStorage(key, val) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(key, val);
      }
    } catch (_) {}
  }

  function isSoundMuted() {
    return safeReadStorage(STORAGE_SFX_MUTED) === 'true';
  }

  function setSoundMuted(muted) {
    const flag = Boolean(muted);
    safeWriteStorage(STORAGE_SFX_MUTED, flag ? 'true' : 'false');
    return flag;
  }

  function toggleSoundMute() {
    const next = !isSoundMuted();
    setSoundMuted(next);
    return next;
  }

  function getAudioContext() {
    if (sharedAudioCtx) return sharedAudioCtx;
    const Ctor = ROOT_SCOPE.AudioContext || ROOT_SCOPE.webkitAudioContext;
    if (typeof Ctor !== 'function') return null;
    try {
      sharedAudioCtx = new Ctor();
      return sharedAudioCtx;
    } catch (_) {
      return null;
    }
  }

  function getNoiseBuffer(actx) {
    if (sharedNoiseBuf && sharedNoiseBuf.sampleRate === actx.sampleRate) {
      return sharedNoiseBuf;
    }
    const len = Math.floor(actx.sampleRate * 1.6);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = clamp((b0 + b1 + b2 + white * 0.1848) * 0.22, -1, 1);
    }
    sharedNoiseBuf = buf;
    return buf;
  }

  function scheduleTone(actx, dest, freqStart, freqEnd, type, startTime, dur, peakGain) {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(Math.max(30, freqStart), startTime);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), startTime + dur);
    }
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.035, dur * 0.18));
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }

  function scheduleFilteredNoise(actx, dest, filterType, fStart, fEnd, qVal, startTime, dur, peakGain) {
    const src = actx.createBufferSource();
    src.buffer = getNoiseBuffer(actx);
    const filter = actx.createBiquadFilter();
    filter.type = filterType || 'bandpass';
    filter.Q.setValueAtTime(qVal || 1.8, startTime);
    filter.frequency.setValueAtTime(Math.max(60, fStart), startTime);
    if (fEnd && fEnd !== fStart) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, fEnd), startTime + dur);
    }
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.08, dur * 0.22));
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(startTime);
    src.stop(startTime + dur + 0.02);
  }

  function playSkillSfx(skillOrElement, options) {
    const opts = options || {};
    if (opts.soundEnabled === false || isSoundMuted()) return false;

    const actx = getAudioContext();
    if (!actx) return false;

    try {
      if (actx.state === 'suspended' && typeof actx.resume === 'function') {
        actx.resume().catch(() => {});
      }
      const now = actx.currentTime + 0.01;
      const elem = typeof skillOrElement === 'string'
        ? skillOrElement
        : (skillOrElement && (skillOrElement.sfxElement || skillOrElement.vfxType)) || 'water';

      // Master gain strictly capped <= 0.105 (well within <= 0.12 comfort rule)
      const master = actx.createGain();
      master.gain.setValueAtTime(0.10, now);
      master.connect(actx.destination);

      // Crisp Nichirin katana draw "shing" (unless pure ceremonial Ubuyashiki / healing)
      if (!elem.startsWith('royal') && elem !== 'blood_heal') {
        scheduleTone(actx, master, 1320, 3520, 'sine', now, 0.24, 0.26);
        scheduleTone(actx, master, 2640, 4680, 'triangle', now + 0.015, 0.18, 0.14);
        scheduleFilteredNoise(actx, master, 'bandpass', 2400, 5200, 3.2, now, 0.20, 0.22);
      }

      if (elem === 'dead_calm') {
        // Serene water droplet plink + deep tranquil ripple
        scheduleTone(actx, master, 988, 1480, 'sine', now + 0.22, 0.35, 0.42);
        scheduleTone(actx, master, 1976, 2480, 'sine', now + 0.23, 0.22, 0.18);
        scheduleFilteredNoise(actx, master, 'lowpass', 620, 220, 1.2, now + 0.26, 1.15, 0.35);
      } else if (elem.startsWith('water')) {
        // Flowing ocean tide & spiraling stream
        scheduleFilteredNoise(actx, master, 'bandpass', 420, 1280, 1.5, now + 0.05, 0.95, 0.55);
        scheduleTone(actx, master, 293.66, 440, 'sine', now + 0.08, 0.65, 0.24);
        if (elem === 'water_dragon') {
          scheduleFilteredNoise(actx, master, 'bandpass', 960, 360, 1.8, now + 0.45, 0.95, 0.48);
        }
      } else if (elem.startsWith('royal')) {
        // Sacred Kagura Suzu Japanese pentatonic chimes (D5 - F#5 - A5 - B5 - D6)
        const notes = elem === 'royal_grand'
          ? [587.33, 739.99, 880.0, 1174.66, 1479.98]
          : [587.33, 880.0, 1174.66, 1318.51];
        for (let i = 0; i < notes.length; i++) {
          scheduleTone(actx, master, notes[i], notes[i] * 1.002, 'sine', now + i * 0.09, 0.95, 0.28);
          scheduleTone(actx, master, notes[i] * 2, notes[i] * 2, 'sine', now + i * 0.09, 0.45, 0.09);
        }
      } else if (elem === 'insect') {
        // Fluttering shimmer + crystalline stinger
        const shimmer = [1046.5, 1318.5, 1567.98, 2093.0];
        for (let i = 0; i < shimmer.length; i++) {
          scheduleTone(actx, master, shimmer[i], shimmer[i] * 1.04, 'sine', now + 0.04 + i * 0.055, 0.36, 0.22);
        }
        scheduleFilteredNoise(actx, master, 'highpass', 3200, 6400, 2.0, now + 0.04, 0.42, 0.25);
      } else if (elem.startsWith('flame') || elem.startsWith('sun')) {
        // Warm heroic blaze roar + power fifth
        scheduleFilteredNoise(actx, master, 'lowpass', 920, 280, 0.9, now + 0.03, 1.05, 0.68);
        scheduleTone(actx, master, 146.83, 110.0, 'triangle', now + 0.04, 0.85, 0.34);
        scheduleTone(actx, master, 220.0, 293.66, 'sine', now + 0.06, 0.78, 0.25);
        if (elem.endsWith('grand')) {
          scheduleTone(actx, master, 440.0, 587.33, 'sine', now + 0.18, 0.95, 0.24);
        }
      } else if (elem.startsWith('sound')) {
        // Flashy festival fireworks & harmonic score
        const pops = elem === 'sound_score' ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 587.33, 783.99];
        for (let i = 0; i < pops.length; i++) {
          const t0 = now + 0.05 + i * 0.11;
          scheduleFilteredNoise(actx, master, 'bandpass', 1800, 620, 1.4, t0, 0.26, 0.38);
          scheduleTone(actx, master, pops[i], pops[i], 'triangle', t0, 0.35, 0.24);
        }
      } else if (elem === 'mist') {
        // Ethereal airy breeze
        scheduleFilteredNoise(actx, master, 'bandpass', 780, 1650, 3.8, now + 0.04, 1.05, 0.42);
        scheduleTone(actx, master, 659.25, 987.77, 'sine', now + 0.08, 0.85, 0.18);
      } else if (elem === 'love') {
        // Sweet harp ribbon arpeggio
        const harp = [523.25, 659.25, 783.99, 987.77, 1318.51];
        for (let i = 0; i < harp.length; i++) {
          scheduleTone(actx, master, harp[i], harp[i], 'sine', now + 0.04 + i * 0.065, 0.52, 0.24);
        }
      } else if (elem === 'serpent') {
        // Winding sibilant slither
        scheduleFilteredNoise(actx, master, 'bandpass', 2600, 1100, 4.5, now + 0.03, 0.78, 0.40);
        scheduleTone(actx, master, 311.13, 466.16, 'sine', now + 0.06, 0.62, 0.22);
      } else if (elem === 'wind') {
        // Fierce emerald cyclone slash
        scheduleFilteredNoise(actx, master, 'bandpass', 520, 2400, 2.4, now + 0.02, 0.55, 0.52);
        scheduleFilteredNoise(actx, master, 'bandpass', 2200, 680, 2.1, now + 0.28, 0.68, 0.46);
      } else if (elem.startsWith('stone')) {
        // Temple bronze bell + earth impact
        scheduleFilteredNoise(actx, master, 'lowpass', 380, 110, 1.1, now + 0.04, 0.75, 0.62);
        scheduleTone(actx, master, 196.0, 195.0, 'sine', now + 0.03, 1.15, 0.38);
        scheduleTone(actx, master, 587.33, 585.0, 'sine', now + 0.03, 0.85, 0.18);
      } else if (elem.startsWith('blood')) {
        // Warm sakura flame burst or gentle lullaby chime
        if (elem === 'blood_heal') {
          const lullaby = [440, 554.37, 659.25, 880];
          for (let i = 0; i < lullaby.length; i++) {
            scheduleTone(actx, master, lullaby[i], lullaby[i], 'sine', now + i * 0.10, 0.85, 0.24);
          }
        } else {
          scheduleFilteredNoise(actx, master, 'bandpass', 880, 360, 1.3, now + 0.04, 0.78, 0.48);
          scheduleTone(actx, master, 523.25, 783.99, 'sine', now + 0.06, 0.55, 0.24);
        }
      } else if (elem.startsWith('thunder')) {
        // Crisp lightning crackle + sonic boom
        const bolts = elem === 'thunder_six' ? 6 : (elem === 'thunder_god' ? 3 : 1);
        for (let b = 0; b < bolts; b++) {
          const tb = now + b * (elem === 'thunder_six' ? 0.12 : 0.18);
          scheduleFilteredNoise(actx, master, 'highpass', 2200, 900, 1.5, tb, 0.18, 0.42);
          scheduleTone(actx, master, 880, 120, 'sawtooth', tb, 0.16, 0.16);
        }
        scheduleFilteredNoise(actx, master, 'lowpass', 420, 95, 0.9, now + 0.05, 0.90, 0.48);
      } else if (elem.startsWith('beast')) {
        if (elem === 'beast_radar') {
          scheduleTone(actx, master, 740, 1480, 'sine', now + 0.05, 0.65, 0.28);
          scheduleTone(actx, master, 1480, 740, 'sine', now + 0.35, 0.65, 0.20);
        } else {
          // Twin serrated slashes
          scheduleFilteredNoise(actx, master, 'bandpass', 1500, 3800, 2.2, now + 0.02, 0.25, 0.45);
          scheduleFilteredNoise(actx, master, 'bandpass', 1800, 4200, 2.2, now + 0.16, 0.28, 0.45);
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ==========================================================================
   * 5. UFOTABLE ARTISTIC CANVAS PRIMITIVES
   * ========================================================================== */

  function drawGlowLine(ctx, x1, y1, x2, y2, width, colorHex, coreHex, alpha) {
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.globalAlpha = alpha * 0.28;
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = width * 3.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.72;
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = width * 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = coreHex || '#ffffff';
    ctx.lineWidth = Math.max(1.5, width * 0.45);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGlowArc(ctx, cx, cy, r, startAng, endAng, width, colorHex, coreHex, alpha) {
    if (alpha <= 0.005 || r <= 1) return;
    ctx.save();
    ctx.lineCap = 'round';

    ctx.globalAlpha = alpha * 0.26;
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = width * 2.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAng, endAng);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.78;
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAng, endAng);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = coreHex || '#ffffff';
    ctx.lineWidth = Math.max(1.5, width * 0.36);
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAng, endAng);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrb(ctx, x, y, r, rgb, alpha) {
    if (alpha <= 0.005 || r <= 0.4) return;
    ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.24).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
  }

  function drawPetal(ctx, x, y, r, rot, colorHex, alpha, notched) {
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.moveTo(-r * 1.2, 0);
    if (notched) {
      ctx.bezierCurveTo(-r * 0.5, -r, r * 0.7, -r, r * 1.3, -r * 0.35);
      ctx.lineTo(r * 0.88, 0);
      ctx.lineTo(r * 1.3, r * 0.35);
      ctx.bezierCurveTo(r * 0.7, r, -r * 0.5, r, -r * 1.2, 0);
    } else {
      ctx.bezierCurveTo(-r * 0.5, -r * 0.9, r * 0.8, -r * 0.85, r * 1.35, 0);
      ctx.bezierCurveTo(r * 0.8, r * 0.85, -r * 0.5, r * 0.9, -r * 1.2, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawButterfly(ctx, x, y, size, rot, flapPhase, wingColor, edgeColor, alpha) {
    if (alpha <= 0.005) return;
    const flap = 0.24 + 0.76 * Math.abs(Math.cos(flapPhase));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(flap, 1);
    ctx.globalAlpha = alpha;

    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.fillStyle = wingColor;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(size * 0.9, -size * 1.25, size * 1.65, -size * 0.45, size * 0.85, size * 0.15);
      ctx.bezierCurveTo(size * 1.35, size * 0.55, size * 0.7, size * 1.25, 0, size * 0.45);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = Math.max(1, size * 0.1);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHeart(ctx, x, y, size, rot, colorHex, alpha) {
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.45);
    ctx.bezierCurveTo(-size * 1.1, -size * 0.25, -size * 0.65, -size * 1.05, 0, -size * 0.35);
    ctx.bezierCurveTo(size * 0.65, -size * 1.05, size * 1.1, -size * 0.25, 0, size * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDragonHead(ctx, x, y, angle, scale, mainColor, jawColor, eyeColor, alpha) {
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // Antler / mane horns sweeping back
    ctx.strokeStyle = jawColor;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.quadraticCurveTo(-34, -34, -62, -26);
    ctx.moveTo(-6, 10);
    ctx.quadraticCurveTo(-30, 28, -54, 22);
    ctx.stroke();

    // Upper snout & fierce brow
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.moveTo(-26, -16);
    ctx.quadraticCurveTo(10, -22, 42, -7);
    ctx.lineTo(28, 2);
    ctx.lineTo(-18, 4);
    ctx.closePath();
    ctx.fill();

    // Open roaring lower jaw
    ctx.fillStyle = jawColor;
    ctx.beginPath();
    ctx.moveTo(-18, 5);
    ctx.lineTo(26, 17);
    ctx.lineTo(6, 22);
    ctx.lineTo(-24, 14);
    ctx.closePath();
    ctx.fill();

    // Fangs
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(28, -6);
    ctx.lineTo(34, 2);
    ctx.lineTo(23, -2);
    ctx.moveTo(19, 14);
    ctx.lineTo(24, 7);
    ctx.lineTo(15, 11);
    ctx.fill();

    // Glowing eye
    ctx.fillStyle = eyeColor || '#ffffff';
    ctx.beginPath();
    ctx.ellipse(2, -8, 6.5, 3.5, -0.2, 0, TWO_PI);
    ctx.fill();

    // Flowing whiskers
    ctx.strokeStyle = eyeColor || '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(28, -8);
    ctx.bezierCurveTo(44, -26, 18, -42, -16, -48);
    ctx.stroke();

    ctx.restore();
  }

  function drawLightningBolt(ctx, x1, y1, x2, y2, segments, jitter, colorHex, coreHex, width, alpha, seedBase) {
    if (alpha <= 0.005) return;
    const pts = [{ x: x1, y: y1 }];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    for (let i = 1; i < segments; i++) {
      const f = i / segments;
      const offset = (seeded(i, seedBase) - 0.5) * 2 * jitter;
      pts.push({
        x: x1 + dx * f + nx * offset,
        y: y1 + dy * f + ny * offset
      });
    }
    pts.push({ x: x2, y: y2 });

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';

    const strokePass = (w, col, a) => {
      ctx.globalAlpha = a;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    };

    strokePass(width * 3.2, colorHex, alpha * 0.25);
    strokePass(width * 1.35, colorHex, alpha * 0.85);
    strokePass(Math.max(1.5, width * 0.45), coreHex || '#ffffff', alpha);

    // Sub-branches
    for (let i = 2; i < pts.length - 2; i += 3) {
      if (seeded(i + 9, seedBase) > 0.45) {
        const bx = pts[i].x + (dx / len) * jitter * 1.4 + nx * (seeded(i, seedBase + 3) - 0.5) * jitter * 2.2;
        const by = pts[i].y + (dy / len) * jitter * 1.4 + ny * (seeded(i, seedBase + 7) - 0.5) * jitter * 2.2;
        drawGlowLine(ctx, pts[i].x, pts[i].y, bx, by, width * 0.45, colorHex, coreHex, alpha * 0.65);
      }
    }
    ctx.restore();
  }

  function drawSerratedSlash(ctx, x1, y1, x2, y2, width, primaryHex, accentHex, alpha, seed) {
    if (alpha <= 0.005) return;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const teeth = 18;

    ctx.save();
    ctx.globalAlpha = alpha * 0.82;
    ctx.fillStyle = primaryHex;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < teeth; i++) {
      const f = i / teeth;
      const env = Math.sin(f * Math.PI);
      const jag = (i % 2 === 0 ? 1.35 : 0.42) * width * env;
      ctx.lineTo(x1 + dx * f + nx * jag, y1 + dy * f + ny * jag);
    }
    ctx.lineTo(x2, y2);
    for (let i = teeth - 1; i >= 1; i--) {
      const f = i / teeth;
      const env = Math.sin(f * Math.PI);
      const jag = (i % 2 === 1 ? 1.25 : 0.38) * width * env;
      ctx.lineTo(x1 + dx * f - nx * jag, y1 + dy * f - ny * jag);
    }
    ctx.closePath();
    ctx.fill();

    drawGlowLine(ctx, x1, y1, x2, y2, width * 0.4, primaryHex, accentHex, alpha);
    ctx.restore();
  }

  /* ==========================================================================
   * 6. 56 SPECIALIZED BREATHING FORM RENDERERS
   * ========================================================================== */

  function renderSkillFrame(ctx, w, h, p, skill, origin) {
    const env = bellCurve(p, 0.22);
    const sweep = easeOutQuint(clamp(p * 1.45, 0, 1));
    const pRgb = hexToRgb(skill.primaryColor);
    const sRgb = hexToRgb(skill.secondaryColor);
    const aRgb = hexToRgb(skill.accentColor);
    const minDim = Math.min(w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const vfx = skill.vfxType;

    // Subtle cinematic vignette flash synchronized with breathing element
    const bgGrad = ctx.createRadialGradient(cx, cy, minDim * 0.1, cx, cy, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, `rgba(${pRgb}, ${(env * 0.10).toFixed(3)})`);
    bgGrad.addColorStop(0.65, `rgba(${sRgb}, ${(env * 0.16).toFixed(3)})`);
    bgGrad.addColorStop(1, `rgba(4, 6, 14, ${(env * 0.34).toFixed(3)})`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Origin burst aura from chibi / button when cast starts
    if (origin && p < 0.45) {
      const op = 1 - p / 0.45;
      const orad = 24 + easeOutCubic(p / 0.45) * minDim * 0.28;
      drawGlowArc(ctx, origin.x, origin.y, orad, 0, TWO_PI, 4 * op, skill.primaryColor, skill.accentColor, op * 0.75);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    switch (vfx) {
      /* ---------------- GIYU: WATER BREATHING ---------------- */
      case 'water_surface_slash': {
        const yMid = h * 0.48;
        const xEnd = w * (-0.05 + 1.1 * sweep);
        // Parting Hokusai foam waves above & below horizontal blade
        for (let side = -1; side <= 1; side += 2) {
          ctx.beginPath();
          ctx.strokeStyle = side < 0 ? skill.primaryColor : skill.secondaryColor;
          ctx.lineWidth = 10 * env;
          ctx.globalAlpha = env * 0.75;
          for (let x = 0; x <= xEnd; x += 18) {
            const spread = side * (12 + 38 * easeOutCubic(p)) * Math.sin((x / w) * Math.PI);
            const wave = Math.sin(x * 0.025 - p * 14 * side) * 10 * env;
            if (x === 0) ctx.moveTo(x, yMid + spread + wave);
            else ctx.lineTo(x, yMid + spread + wave);
          }
          ctx.stroke();
        }
        drawGlowLine(ctx, -20, yMid, xEnd, yMid, 12 * env, skill.primaryColor, '#ffffff', env);
        for (let i = 0; i < 65; i++) {
          const fx = seeded(i, 1) * xEnd;
          const dir = i % 2 === 0 ? 1 : -1;
          const fy = yMid + dir * (8 + seeded(i, 2) * 95 * easeOutCubic(p));
          drawOrb(ctx, fx, fy, 2 + seeded(i, 3) * 5, i % 3 === 0 ? aRgb : pRgb, env * 0.85);
        }
        break;
      }

      case 'striking_tide': {
        for (let waveIdx = 0; waveIdx < 5; waveIdx++) {
          const baseY = h * (0.22 + waveIdx * 0.14);
          const phase = p * 10 + waveIdx * 1.4;
          ctx.beginPath();
          ctx.strokeStyle = waveIdx % 2 === 0 ? skill.primaryColor : skill.accentColor;
          ctx.lineWidth = (18 - waveIdx * 2) * env;
          ctx.globalAlpha = env * 0.65;
          for (let x = -40; x <= w + 40; x += 20) {
            const crest = Math.sin(x * 0.012 - phase) * 36 + Math.cos(x * 0.028 - phase * 1.5) * 14;
            if (x === -40) ctx.moveTo(x, baseY + crest);
            else ctx.lineTo(x, baseY + crest);
          }
          ctx.stroke();
        }
        for (let i = 0; i < 110; i++) {
          const bx = ((seeded(i, 4) * w + p * w * (0.45 + seeded(i, 5) * 0.5)) % (w + 80)) - 40;
          const by = seeded(i, 6) * h + Math.sin(p * 8 + i) * 24;
          drawOrb(ctx, bx, by, 2.2 + seeded(i, 7) * 6.5, i % 2 === 0 ? aRgb : pRgb, env * 0.8);
        }
        break;
      }

      case 'water_dragon': {
        const segs = 46;
        const headT = easeOutCubic(clamp(p * 1.25, 0, 1)) * 1.15;
        let prevX = 0;
        let prevY = 0;
        let headX = cx;
        let headY = cy;
        let headAng = 0;

        for (let i = 0; i <= segs; i++) {
          const u = headT - (i / segs) * 0.68;
          const px = w * (-0.08 + u * 1.08);
          const py = cy + Math.sin(u * 7.2 - p * 4) * (h * 0.24) + Math.cos(u * 3.5) * (h * 0.08);
          if (i === 0) {
            headX = px;
            headY = py;
          } else {
            if (i === 1) headAng = Math.atan2(headY - py, headX - px);
            const taper = 1 - i / (segs + 4);
            const thick = (6 + 28 * taper) * env;
            drawGlowLine(ctx, prevX, prevY, px, py, thick, i % 3 === 0 ? skill.secondaryColor : skill.primaryColor, skill.accentColor, env * 0.88);
            if (i % 2 === 0) {
              drawOrb(ctx, px + Math.sin(i + p * 12) * 18, py - 14 * taper, 3 + 5 * taper, aRgb, env * 0.75);
            }
          }
          prevX = px;
          prevY = py;
        }
        drawDragonHead(ctx, headX, headY, headAng, 1.35, skill.primaryColor, skill.accentColor, '#ffffff', env);
        break;
      }

      case 'dead_calm': {
        // Mirror lake horizon + falling single droplet -> 9 concentric serene rings
        const dropPhase = clamp(p / 0.22, 0, 1);
        if (p < 0.24) {
          const dy = h * 0.1 + easeOutCubic(dropPhase) * (cy - h * 0.1);
          drawGlowLine(ctx, cx, dy - 26, cx, dy, 4, skill.accentColor, '#ffffff', 1 - dropPhase * 0.3);
          drawOrb(ctx, cx, dy, 6, aRgb, 0.95);
        } else {
          const rp = (p - 0.22) / 0.78;
          const maxR = Math.hypot(w, h) * 0.62;
          for (let rIdx = 0; rIdx < 9; rIdx++) {
            const local = clamp(rp * 1.35 - rIdx * 0.085, 0, 1);
            if (local <= 0) continue;
            const rad = easeOutCubic(local) * maxR;
            const fade = (1 - local) * (1 - p * 0.35);
            drawGlowArc(ctx, cx, cy, rad, 0, TWO_PI, 3.5 * (1 - local * 0.6), skill.primaryColor, skill.accentColor, fade * 0.85);
          }
          // Horizon mirror reflection shimmer
          drawGlowLine(ctx, w * (0.5 - 0.45 * easeOutCubic(rp)), cy, w * (0.5 + 0.45 * easeOutCubic(rp)), cy, 2.5, skill.primaryColor, '#ffffff', (1 - rp) * 0.65);
        }
        break;
      }

      /* ---------------- UBUYASHIKI: ROYAL WISTERIA ---------------- */
      case 'wisteria_sanctuary': {
        // Royal crest mandala + cascading wisteria curtains on top & sides
        const crestR = minDim * (0.22 + 0.06 * easeOutCubic(p));
        drawGlowArc(ctx, cx, cy, crestR, 0, TWO_PI, 4, skill.accentColor, '#ffffff', env * 0.85);
        drawGlowArc(ctx, cx, cy, crestR * 0.76, 0, TWO_PI, 2.5, skill.primaryColor, skill.accentColor, env * 0.75);
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * TWO_PI + p * 0.9;
          drawGlowLine(
            ctx,
            cx + Math.cos(ang) * crestR * 0.76,
            cy + Math.sin(ang) * crestR * 0.76,
            cx + Math.cos(ang) * crestR,
            cy + Math.sin(ang) * crestR,
            2.5,
            skill.accentColor,
            '#ffffff',
            env * 0.75
          );
        }
        for (let v = 0; v < 22; v++) {
          const vx = (v + 0.5) * (w / 22);
          const vLen = (90 + (v % 4) * 45) * easeOutCubic(clamp(p * 1.6, 0, 1));
          for (let b = 0; b < 7; b++) {
            const by = b * (vLen / 7) + Math.sin(p * 5 + v) * 4;
            drawPetal(ctx, vx + Math.sin(b + v + p * 4) * 7, by, 9 - b * 0.7, HALF_PI, b > 4 ? skill.accentColor : skill.primaryColor, env * 0.85, false);
          }
        }
        break;
      }

      case 'sky_lanterns': {
        for (let i = 0; i < 40; i++) {
          const lx = seeded(i, 11) * w + Math.sin(p * 3 + i) * 22;
          const startY = h * (0.65 + seeded(i, 12) * 0.45);
          const ly = startY - p * h * (0.45 + seeded(i, 13) * 0.38);
          const sz = 10 + seeded(i, 14) * 14;
          ctx.save();
          ctx.globalAlpha = env * 0.88;
          drawOrb(ctx, lx, ly, sz * 0.9, hexToRgb(skill.primaryColor), env * 0.75);
          ctx.fillStyle = skill.accentColor;
          ctx.fillRect(lx - sz * 0.42, ly - sz * 0.58, sz * 0.84, sz * 1.16);
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(lx - sz * 0.42, ly - sz * 0.58, sz * 0.84, sz * 1.16);
          ctx.restore();
        }
        break;
      }

      case 'moonlight_serenity': {
        const moonX = w * 0.72;
        const moonY = h * 0.22;
        drawOrb(ctx, moonX, moonY, minDim * 0.09, hexToRgb(skill.accentColor), env * 0.9);
        // Moonbeam shaft
        const beam = ctx.createLinearGradient(moonX, moonY, w * 0.22, h);
        beam.addColorStop(0, `rgba(${aRgb}, ${(env * 0.32).toFixed(3)})`);
        beam.addColorStop(1, `rgba(${sRgb}, 0)`);
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(moonX - 45, moonY);
        ctx.lineTo(moonX + 45, moonY);
        ctx.lineTo(w * 0.42, h);
        ctx.lineTo(w * 0.06, h);
        ctx.closePath();
        ctx.fill();

        for (let i = 0; i < 24; i++) {
          const t = (p * 0.8 + seeded(i, 15)) % 1;
          const bx = w * (0.15 + seeded(i, 16) * 0.7) + Math.sin(p * 6 + i) * 35;
          const by = h * (1 - t);
          drawButterfly(ctx, bx, by, 10 + (i % 4) * 3, -0.4 + Math.sin(i + p * 4) * 0.3, p * 26 + i, skill.primaryColor, skill.accentColor, env * 0.88);
        }
        break;
      }

      case 'eternal_will': {
        // Interconnected golden Slayer Corps threads + wisteria rain
        const nodes = [];
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * TWO_PI + p * 0.55;
          const rad = minDim * (0.18 + (i % 2) * 0.16) * easeOutCubic(clamp(p * 1.4, 0, 1));
          nodes.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
        }
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          const n2 = nodes[(i + 1) % nodes.length];
          const n3 = nodes[(i + 5) % nodes.length];
          drawGlowLine(ctx, n1.x, n1.y, n2.x, n2.y, 3, skill.primaryColor, '#ffffff', env * 0.8);
          drawGlowLine(ctx, n1.x, n1.y, n3.x, n3.y, 1.8, skill.secondaryColor, skill.primaryColor, env * 0.55);
          drawOrb(ctx, n1.x, n1.y, 6, pRgb, env);
        }
        for (let i = 0; i < 60; i++) {
          const px = seeded(i, 17) * w;
          const py = ((seeded(i, 18) * h + p * h * 0.85) % h);
          drawPetal(ctx, px, py, 7, p * 5 + i, i % 3 === 0 ? skill.primaryColor : skill.secondaryColor, env * 0.85, false);
        }
        break;
      }

      /* ---------------- SHINOBU: INSECT BREATHING ---------------- */
      case 'butterfly_caprice': {
        for (let i = 0; i < 34; i++) {
          const ang = i * 0.55 + p * 6.5;
          const rad = (20 + i * 11) * easeOutCubic(clamp(p * 1.35, 0, 1));
          const bx = cx + Math.cos(ang) * rad;
          const by = cy + Math.sin(ang) * rad * 0.72;
          drawButterfly(ctx, bx, by, 11 + (i % 3) * 4, ang + HALF_PI, p * 32 + i, i % 2 === 0 ? skill.primaryColor : skill.secondaryColor, skill.accentColor, env * 0.9);
        }
        for (let s = 0; s < 10; s++) {
          const sa = seeded(s, 21) * TWO_PI;
          const len = minDim * 0.36;
          drawGlowLine(ctx, cx - Math.cos(sa) * len, cy - Math.sin(sa) * len, cx + Math.cos(sa) * len, cy + Math.sin(sa) * len, 2.5, skill.secondaryColor, '#ffffff', env * 0.7);
        }
        break;
      }

      case 'bee_sting_thrust': {
        const x1 = w * 0.08;
        const y1 = h * 0.72;
        const x2 = x1 + (w * 0.84) * sweep;
        const y2 = y1 - (h * 0.48) * sweep;
        drawGlowLine(ctx, x1, y1, x2, y2, 10 * env, skill.primaryColor, '#ffffff', env);
        for (let c = 1; c <= 5; c++) {
          const f = c / 6;
          const rx = x1 + (x2 - x1) * f;
          const ry = y1 + (y2 - y1) * f;
          drawGlowArc(ctx, rx, ry, (18 + c * 16) * easeOutCubic(p), 0, TWO_PI, 3, skill.accentColor, '#ffffff', env * 0.75);
        }
        break;
      }

      case 'compound_eye_hexagon': {
        const hexR = minDim * 0.28 * easeOutCubic(clamp(p * 1.5, 0, 1));
        const verts = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TWO_PI - HALF_PI + p * 0.35;
          verts.push({ x: cx + Math.cos(a) * hexR, y: cy + Math.sin(a) * hexR });
        }
        for (let k = 0; k < 6; k++) {
          const v1 = verts[k];
          const v2 = verts[(k + 1) % 6];
          drawGlowLine(ctx, v1.x, v1.y, v2.x, v2.y, 4, skill.primaryColor, skill.accentColor, env * 0.85);
          drawGlowLine(ctx, cx, cy, v1.x, v1.y, 6, skill.secondaryColor, '#ffffff', env * 0.9);
          drawOrb(ctx, v1.x, v1.y, 10, pRgb, env);
        }
        break;
      }

      case 'hundred_legged_zigzag': {
        const nodes = 9;
        const maxIdx = Math.max(1, Math.floor(sweep * nodes));
        let px = w * 0.06;
        let py = h * 0.82;
        for (let i = 1; i <= maxIdx; i++) {
          const nx = w * (0.06 + (i / nodes) * 0.88);
          const ny = i % 2 === 1 ? h * 0.22 : h * 0.78;
          drawGlowLine(ctx, px, py, nx, ny, 9 * env, skill.primaryColor, skill.accentColor, env);
          drawButterfly(ctx, nx, ny, 14, i, p * 28 + i, skill.primaryColor, '#ffffff', env * 0.85);
          px = nx;
          py = ny;
        }
        break;
      }

      /* ---------------- RENGOKU: FLAME BREATHING ---------------- */
      case 'unknowing_fire': {
        const y0 = h * 0.54;
        const xEnd = w * (-0.05 + 1.12 * sweep);
        drawGlowLine(ctx, -30, y0 + 25, xEnd, y0 - 25, 22 * env, skill.secondaryColor, skill.accentColor, env);
        drawGlowLine(ctx, -30, y0 + 25, xEnd, y0 - 25, 10 * env, skill.primaryColor, '#ffffff', env);
        for (let i = 0; i < 85; i++) {
          const ex = seeded(i, 31) * xEnd;
          const ey = y0 - seeded(i, 32) * h * 0.42 * p + (seeded(i, 33) - 0.5) * 60;
          drawOrb(ctx, ex, ey, 2.5 + seeded(i, 34) * 6, i % 2 === 0 ? aRgb : pRgb, env * 0.9);
        }
        break;
      }

      case 'rising_scorching_sun': {
        const rad = minDim * 0.36;
        const startA = Math.PI * 0.85;
        const endA = startA + Math.PI * 1.45 * sweep;
        drawGlowArc(ctx, cx, cy + h * 0.08, rad, startA, endA, 28 * env, skill.secondaryColor, skill.accentColor, env);
        drawGlowArc(ctx, cx, cy + h * 0.08, rad * 0.92, startA, endA, 14 * env, skill.primaryColor, '#ffffff', env);
        drawOrb(ctx, cx, cy + h * 0.08, rad * 0.32 * env, pRgb, env * 0.55);
        break;
      }

      case 'flame_tiger': {
        const tx = w * (-0.1 + 1.05 * easeOutCubic(clamp(p * 1.2, 0, 1)));
        const ty = cy;
        // Blazing tiger body trail
        for (let b = 0; b < 24; b++) {
          const bx = tx - b * 28;
          const by = ty + Math.sin(b * 0.5 - p * 14) * 18;
          drawOrb(ctx, bx, by, (36 - b * 1.1) * env, b % 3 === 0 ? sRgb : pRgb, env * 0.72);
        }
        // Fierce Flame Tiger head & stripes
        drawDragonHead(ctx, tx, ty, 0, 1.85, skill.primaryColor, skill.secondaryColor, skill.accentColor, env);
        for (let c = -1; c <= 1; c++) {
          drawGlowLine(ctx, tx + 35, ty + c * 22, tx + 95, ty + c * 32, 6 * env, skill.accentColor, '#ffffff', env * 0.85);
        }
        break;
      }

      case 'rengoku_dragon': {
        const segs = 50;
        const headU = easeOutCubic(clamp(p * 1.22, 0, 1)) * 1.12;
        let prevX = 0;
        let prevY = 0;
        let hx = cx;
        let hy = cy;
        let hang = -0.4;
        for (let i = 0; i <= segs; i++) {
          const u = headU - (i / segs) * 0.75;
          const px = w * (0.08 + u * 0.84);
          const py = h * (0.86 - u * 0.72) + Math.sin(u * 10 - p * 8) * 52;
          if (i === 0) {
            hx = px;
            hy = py;
          } else {
            if (i === 1) hang = Math.atan2(hy - py, hx - px);
            const taper = 1 - i / (segs + 3);
            drawGlowLine(ctx, prevX, prevY, px, py, (10 + 38 * taper) * env, i % 2 === 0 ? skill.primaryColor : skill.secondaryColor, skill.accentColor, env * 0.92);
          }
          prevX = px;
          prevY = py;
        }
        drawDragonHead(ctx, hx, hy, hang, 1.75, skill.primaryColor, skill.secondaryColor, '#ffffff', env);
        for (let e = 0; e < 95; e++) {
          const ex = seeded(e, 35) * w;
          const ey = ((seeded(e, 36) * h - p * h * 0.75 + h) % h);
          drawOrb(ctx, ex, ey, 2.5 + seeded(e, 37) * 6.5, e % 2 === 0 ? aRgb : pRgb, env * 0.85);
        }
        break;
      }

      /* ---------------- UZUI: SOUND BREATHING ---------------- */
      case 'roar_blast': {
        drawGlowLine(ctx, w * 0.18, h * 0.18, w * 0.82, h * 0.82, 12 * env, skill.primaryColor, '#ffffff', env);
        drawGlowLine(ctx, w * 0.82, h * 0.18, w * 0.18, h * 0.82, 12 * env, skill.secondaryColor, '#ffffff', env);
        for (let r = 1; r <= 4; r++) {
          drawGlowArc(ctx, cx, cy, minDim * 0.12 * r * sweep, 0, TWO_PI, 5, r % 2 === 0 ? skill.accentColor : skill.primaryColor, '#ffffff', env * 0.8);
        }
        const gemColors = ['#f43f5e', '#fbbf24', '#2dd4bf', '#c084fc', '#ffffff'];
        for (let g = 0; g < 52; g++) {
          const ga = seeded(g, 41) * TWO_PI;
          const gd = easeOutCubic(p) * minDim * (0.1 + seeded(g, 42) * 0.48);
          const gx = cx + Math.cos(ga) * gd;
          const gy = cy + Math.sin(ga) * gd;
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(p * 8 + g);
          ctx.globalAlpha = env * 0.92;
          ctx.fillStyle = gemColors[g % gemColors.length];
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(6, 0);
          ctx.lineTo(0, 8);
          ctx.lineTo(-6, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        break;
      }

      case 'constant_resounding_slashes': {
        const bursts = 7;
        const palette = [skill.primaryColor, skill.secondaryColor, skill.accentColor, '#c084fc'];
        for (let b = 0; b < bursts; b++) {
          const bx = w * (0.16 + (b / (bursts - 1)) * 0.68);
          const by = cy + (b % 2 === 0 ? -1 : 1) * h * 0.14;
          const col = palette[b % palette.length];
          const rad = minDim * 0.16 * easeOutCubic(clamp(p * 1.6 - b * 0.08, 0, 1));
          drawGlowArc(ctx, bx, by, rad, p * 8, p * 8 + Math.PI * 1.5, 6, col, '#ffffff', env * 0.85);
          for (let ray = 0; ray < 12; ray++) {
            const ra = (ray / 12) * TWO_PI + b;
            drawGlowLine(ctx, bx + Math.cos(ra) * rad * 0.3, by + Math.sin(ra) * rad * 0.3, bx + Math.cos(ra) * rad * 1.25, by + Math.sin(ra) * rad * 1.25, 3, col, '#ffffff', env * 0.8);
          }
        }
        break;
      }

      case 'string_performance': {
        const leftX = w * (0.28 + Math.sin(p * 6) * 0.05);
        const rightX = w * (0.72 - Math.sin(p * 6) * 0.05);
        const wheelR = minDim * 0.18;
        // Golden chain connecting twin cleaver wheels
        drawGlowLine(ctx, leftX, cy, rightX, cy, 4, skill.primaryColor, '#ffffff', env * 0.9);
        [leftX, rightX].forEach((wx, idx) => {
          const dir = idx === 0 ? 1 : -1;
          drawGlowArc(ctx, wx, cy, wheelR, 0, TWO_PI, 10 * env, idx === 0 ? skill.primaryColor : skill.secondaryColor, skill.accentColor, env);
          for (let s = 0; s < 8; s++) {
            const a = (s / 8) * TWO_PI + p * 18 * dir;
            drawGlowLine(ctx, wx, cy, wx + Math.cos(a) * wheelR * 1.15, cy + Math.sin(a) * wheelR * 1.15, 4, skill.accentColor, '#ffffff', env * 0.8);
          }
        });
        break;
      }

      case 'musical_score': {
        // 5 luminous staff lines + glowing notes & precision beat slashes
        for (let line = -2; line <= 2; line++) {
          ctx.beginPath();
          ctx.strokeStyle = line === 0 ? skill.primaryColor : skill.secondaryColor;
          ctx.lineWidth = 2.2;
          ctx.globalAlpha = env * 0.72;
          for (let x = 0; x <= w * sweep; x += 24) {
            const y = cy + line * 22 + Math.sin(x * 0.008 - p * 6) * 20;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        for (let n = 0; n < 10; n++) {
          const nx = w * (0.1 + n * 0.085);
          if (nx > w * sweep) continue;
          const ny = cy + ((n * 3) % 5 - 2) * 22 + Math.sin(nx * 0.008 - p * 6) * 20;
          drawOrb(ctx, nx, ny, 9, n % 2 === 0 ? pRgb : aRgb, env * 0.95);
          drawGlowLine(ctx, nx + 7, ny, nx + 7, ny - 34, 3, skill.primaryColor, '#ffffff', env * 0.9);
          if (n % 3 === 1) {
            drawGlowLine(ctx, nx - 35, ny + 45, nx + 35, ny - 45, 5, skill.accentColor, '#ffffff', env * 0.85);
          }
        }
        break;
      }

      /* ---------------- MUICHIRO: MIST BREATHING ---------------- */
      case 'eight_layered_mist': {
        for (let k = 0; k < 8; k++) {
          const appear = clamp((p * 1.6 - k * 0.09) * 2.2, 0, 1);
          if (appear <= 0) continue;
          const ang = -0.9 + k * 0.42;
          const r = minDim * (0.18 + (k % 3) * 0.08);
          drawGlowArc(ctx, cx + (k - 3.5) * 28, cy, r, ang, ang + Math.PI * 0.95 * appear, 9 * env, skill.primaryColor, skill.accentColor, env * 0.88);
        }
        break;
      }

      case 'shifting_flow_slash': {
        ctx.beginPath();
        let prevX = -20;
        let prevY = cy;
        const maxX = w * sweep * 1.05;
        for (let x = 0; x <= maxX; x += 22) {
          const y = cy + Math.sin((x / w) * TWO_PI - p * 5) * (h * 0.16);
          drawGlowLine(ctx, prevX, prevY, x, y, 12 * env, skill.primaryColor, '#ffffff', env * 0.85);
          prevX = x;
          prevY = y;
        }
        for (let m = 0; m < 30; m++) {
          drawOrb(ctx, seeded(m, 51) * maxX, cy + (seeded(m, 52) - 0.5) * h * 0.4, 24 + seeded(m, 53) * 38, pRgb, env * 0.14);
        }
        break;
      }

      case 'sea_of_clouds': {
        for (let c = 0; c < 36; c++) {
          const mx = ((seeded(c, 54) * w + p * 120) % (w + 160)) - 80;
          const my = h * (0.2 + seeded(c, 55) * 0.65);
          drawOrb(ctx, mx, my, 45 + seeded(c, 56) * 55, pRgb, env * 0.16);
        }
        for (let s = 0; s < 16; s++) {
          const sx = seeded(s, 57) * w;
          const sy = seeded(s, 58) * h;
          const sa = -0.35 + (seeded(s, 59) - 0.5) * 0.5;
          const slen = 120 * sweep;
          drawGlowLine(ctx, sx, sy, sx + Math.cos(sa) * slen, sy + Math.sin(sa) * slen, 4, skill.primaryColor, '#ffffff', env * 0.85);
        }
        break;
      }

      case 'oboro_haze': {
        for (let c = 0; c < 42; c++) {
          const mx = seeded(c, 60) * w + Math.sin(p * 3 + c) * 40;
          const my = seeded(c, 61) * h;
          drawOrb(ctx, mx, my, 55 + seeded(c, 62) * 65, pRgb, env * 0.18);
        }
        if (p > 0.25) {
          const sp = clamp((p - 0.25) / 0.35, 0, 1);
          drawGlowLine(ctx, w * 0.08, h * 0.62, w * (0.08 + 0.84 * easeOutQuint(sp)), h * (0.62 - 0.24 * easeOutQuint(sp)), 6, skill.primaryColor, '#ffffff', env);
        }
        break;
      }

      /* ---------------- MITSURI: LOVE BREATHING ---------------- */
      case 'shivers_of_first_love': {
        let px = w * 0.08;
        let py = cy;
        const steps = 14;
        for (let i = 1; i <= steps; i++) {
          const f = i / steps;
          if (f > sweep) break;
          const nx = w * (0.08 + f * 0.84);
          const ny = cy + (i % 2 === 0 ? -1 : 1) * (h * 0.18) * Math.sin(f * Math.PI);
          drawGlowLine(ctx, px, py, nx, ny, 8 * env, skill.primaryColor, skill.accentColor, env * 0.9);
          drawHeart(ctx, nx, ny, 14, (i % 2 === 0 ? 0.2 : -0.2), i % 3 === 0 ? skill.accentColor : skill.primaryColor, env * 0.9);
          px = nx;
          py = ny;
        }
        break;
      }

      case 'love_pangs': {
        for (let strand = 0; strand < 2; strand++) {
          const col = strand === 0 ? skill.primaryColor : skill.secondaryColor;
          let prevX = 0;
          let prevY = cy;
          for (let x = 0; x <= w * sweep; x += 18) {
            const y = cy + Math.sin(x * 0.014 - p * 8 + strand * Math.PI) * (h * 0.2);
            if (x > 0) drawGlowLine(ctx, prevX, prevY, x, y, 9 * env, col, '#ffffff', env * 0.88);
            prevX = x;
            prevY = y;
          }
        }
        break;
      }

      case 'catlove_shower': {
        for (let a = 0; a < 6; a++) {
          const ax = w * (0.15 + a * 0.14);
          const ar = minDim * 0.16;
          drawGlowArc(ctx, ax, h * 0.62, ar, Math.PI, Math.PI + Math.PI * sweep, 8 * env, a % 2 === 0 ? skill.primaryColor : skill.accentColor, '#ffffff', env * 0.85);
        }
        for (let i = 0; i < 65; i++) {
          const sx = seeded(i, 71) * w;
          const sy = ((seeded(i, 72) * h + p * h * 0.85) % h);
          drawPetal(ctx, sx, sy, 8, p * 6 + i, i % 4 === 0 ? skill.accentColor : skill.primaryColor, env * 0.9, true);
        }
        break;
      }

      case 'cat_legged_winds': {
        const turns = 72;
        let px = cx;
        let py = cy;
        for (let i = 1; i <= turns; i++) {
          const f = i / turns;
          if (f > sweep) break;
          const ang = f * TWO_PI * 3.5 - p * 9;
          const rad = f * minDim * 0.44;
          const nx = cx + Math.cos(ang) * rad;
          const ny = cy + Math.sin(ang) * rad * 0.78;
          drawGlowLine(ctx, px, py, nx, ny, (4 + f * 10) * env, i % 3 === 0 ? skill.secondaryColor : skill.primaryColor, '#ffffff', env * 0.88);
          if (i % 7 === 0) drawHeart(ctx, nx, ny, 13, ang, skill.primaryColor, env * 0.9);
          px = nx;
          py = ny;
        }
        break;
      }

      /* ---------------- OBANAI: SERPENT BREATHING ---------------- */
      case 'winding_serpent_slash': {
        let px = -20;
        let py = cy;
        for (let x = 0; x <= w * sweep * 1.05; x += 16) {
          const y = cy + Math.sin(x * 0.022 - p * 10) * (h * 0.22) * Math.sin((x / w) * Math.PI + 0.2);
          drawGlowLine(ctx, px, py, x, y, 11 * env, skill.primaryColor, skill.accentColor, env * 0.9);
          px = x;
          py = y;
        }
        break;
      }

      case 'venom_fangs': {
        const bite = easeOutQuint(clamp(p * 1.6, 0, 1)) * h * 0.22;
        // Glowing serpent eyes in upper darkness
        drawOrb(ctx, cx - 75, cy - h * 0.22, 12, hexToRgb('#ef4444'), env * 0.95);
        drawOrb(ctx, cx + 75, cy - h * 0.22, 12, hexToRgb('#facc15'), env * 0.95);
        // Twin giant white/venomous fangs snapping shut
        drawGlowArc(ctx, cx, cy - h * 0.26 + bite, minDim * 0.28, 0.25, Math.PI - 0.25, 14 * env, skill.primaryColor, skill.accentColor, env);
        drawGlowArc(ctx, cx, cy + h * 0.26 - bite, minDim * 0.28, Math.PI + 0.25, TWO_PI - 0.25, 14 * env, skill.secondaryColor, '#ffffff', env);
        drawGlowLine(ctx, cx - 95, cy - h * 0.16, cx - 55, cy + 25, 10 * env, skill.primaryColor, '#ffffff', env);
        drawGlowLine(ctx, cx + 95, cy - h * 0.16, cx + 55, cy + 25, 10 * env, skill.primaryColor, '#ffffff', env);
        break;
      }

      case 'coil_choke': {
        for (let c = 0; c < 4; c++) {
          const squeeze = 1 - 0.28 * easeOutCubic(p);
          const r = minDim * (0.14 + c * 0.08) * squeeze;
          drawGlowArc(ctx, cx, cy, r, p * 7 * (c % 2 === 0 ? 1 : -1), p * 7 * (c % 2 === 0 ? 1 : -1) + Math.PI * 1.65, 11 * env, c % 2 === 0 ? skill.primaryColor : skill.secondaryColor, skill.accentColor, env * 0.9);
        }
        break;
      }

      case 'slithering_serpent': {
        const segs = 52;
        const headT = easeOutCubic(clamp(p * 1.25, 0, 1)) * 1.15;
        let px = 0;
        let py = 0;
        let hx = cx;
        let hy = cy;
        let hang = 0;
        for (let i = 0; i <= segs; i++) {
          const u = headT - (i / segs) * 0.78;
          const x = w * (-0.06 + u * 1.08);
          const y = cy + Math.sin(u * 11 - p * 6) * (h * 0.26);
          if (i === 0) {
            hx = x;
            hy = y;
          } else {
            if (i === 1) hang = Math.atan2(hy - y, hx - x);
            const taper = 1 - i / (segs + 4);
            drawGlowLine(ctx, px, py, x, y, (8 + 26 * taper) * env, skill.secondaryColor, skill.primaryColor, env * 0.92);
          }
          px = x;
          py = y;
        }
        drawDragonHead(ctx, hx, hy, hang, 1.3, '#f8fafc', skill.secondaryColor, '#ef4444', env);
        break;
      }

      /* ---------------- SANEMI: WIND BREATHING ---------------- */
      case 'dust_whirlwind_cutter': {
        const maxX = w * sweep * 1.08;
        for (let i = 0; i < 48; i++) {
          const f = i / 48;
          const x = f * maxX;
          const rad = (24 + Math.sin(f * 12) * 14 + f * 65) * env;
          const a = i * 0.9 - p * 22;
          drawGlowArc(ctx, x, cy, rad, a, a + Math.PI * 1.2, 5, skill.primaryColor, skill.accentColor, env * 0.82);
        }
        drawGlowLine(ctx, 0, cy, maxX, cy, 10 * env, skill.primaryColor, '#ffffff', env);
        break;
      }

      case 'claws_purifying_wind': {
        for (let claw = 0; claw < 4; claw++) {
          const offset = (claw - 1.5) * minDim * 0.11;
          const x1 = w * 0.15 + offset;
          const y1 = h * 0.10 - offset * 0.4;
          const x2 = x1 + w * 0.70 * sweep;
          const y2 = y1 + h * 0.76 * sweep;
          drawGlowLine(ctx, x1, y1, x2, y2, 14 * env, skill.primaryColor, '#ffffff', env * 0.95);
        }
        break;
      }

      case 'gale_sudden_gusts': {
        for (let lv = 0; lv < 36; lv++) {
          const fy = lv / 36;
          const y = h * (0.95 - fy * 0.88);
          const r = (28 + fy * fy * w * 0.28) * easeOutCubic(clamp(p * 1.4, 0, 1));
          const a = lv * 0.7 + p * 20;
          drawGlowArc(ctx, cx + Math.sin(fy * 6 + p * 8) * 28, y, r, a, a + Math.PI * 1.35, 5.5, skill.primaryColor, '#ffffff', env * 0.82);
        }
        break;
      }

      case 'primary_gale_slash': {
        for (let s = 0; s < 18; s++) {
          const ang = seeded(s, 81) * TWO_PI;
          const dist = easeOutCubic(p) * minDim * (0.08 + seeded(s, 82) * 0.36);
          const rx = cx + Math.cos(ang) * dist;
          const ry = cy + Math.sin(ang) * dist;
          drawGlowArc(ctx, rx, ry, minDim * 0.14, p * 16 + s, p * 16 + s + Math.PI * 1.4, 6 * env, skill.primaryColor, '#ffffff', env * 0.85);
        }
        break;
      }

      /* ---------------- GYOMEI: STONE BREATHING ---------------- */
      case 'serpentinite_bipolar': {
        const meet = easeOutQuint(clamp(p * 1.7, 0, 1));
        const fx = w * (0.1 + 0.38 * meet);
        const ax = w * (0.9 - 0.38 * meet);
        // Connecting chain
        drawGlowLine(ctx, fx, cy, ax, cy, 4, skill.accentColor, '#ffffff', env * 0.9);
        // Spiked iron flail on left
        drawOrb(ctx, fx, cy, 34, pRgb, env * 0.95);
        for (let sp = 0; sp < 10; sp++) {
          const sa = (sp / 10) * TWO_PI + p * 6;
          drawGlowLine(ctx, fx, cy, fx + Math.cos(sa) * 52, cy + Math.sin(sa) * 52, 4, skill.primaryColor, '#ffffff', env);
        }
        // Battle axe arc on right
        drawGlowArc(ctx, ax, cy, 52, HALF_PI, Math.PI * 1.5, 16 * env, skill.primaryColor, skill.accentColor, env);
        if (meet > 0.85) {
          drawGlowArc(ctx, cx, cy, minDim * 0.38 * easeOutCubic((p - 0.2) / 0.8), 0, TWO_PI, 8 * env, skill.primaryColor, '#ffffff', env);
        }
        break;
      }

      case 'upper_smash': {
        const impactY = h * 0.78;
        drawGlowLine(ctx, cx, 0, cx, impactY * sweep, 18 * env, skill.primaryColor, '#ffffff', env);
        if (p > 0.18) {
          for (let f = 0; f < 11; f++) {
            const fa = Math.PI + (f / 10) * Math.PI;
            const flen = (80 + seeded(f, 91) * minDim * 0.45) * easeOutCubic((p - 0.18) / 0.82);
            drawLightningBolt(ctx, cx, impactY, cx + Math.cos(fa) * flen * 1.5, impactY + Math.sin(fa) * flen * 0.35, 6, 16, skill.primaryColor, skill.accentColor, 5, env * 0.9, 90 + f);
          }
        }
        break;
      }

      case 'rhyolite_rapid_conquest': {
        const pts = 9;
        const ring = [];
        for (let i = 0; i < pts; i++) {
          const a = (i / pts) * TWO_PI + p * 3.2;
          const r = minDim * 0.34 * sweep;
          ring.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        for (let i = 0; i < pts; i++) {
          for (let j = i + 2; j < pts; j += 2) {
            drawGlowLine(ctx, ring[i].x, ring[i].y, ring[j].x, ring[j].y, 3.5, skill.primaryColor, skill.accentColor, env * 0.8);
          }
        }
        break;
      }

      case 'arcs_of_justice': {
        // Radiant Buddhist halo & prayer beads + falling golden meteors
        const haloR = minDim * 0.28;
        drawGlowArc(ctx, cx, cy, haloR, 0, TWO_PI, 8 * env, skill.primaryColor, '#ffffff', env * 0.9);
        for (let b = 0; b < 18; b++) {
          const ba = (b / 18) * TWO_PI + p * 1.2;
          drawOrb(ctx, cx + Math.cos(ba) * haloR * 1.18, cy + Math.sin(ba) * haloR * 1.18, 7, pRgb, env * 0.95);
        }
        for (let m = 0; m < 16; m++) {
          const mx = seeded(m, 95) * w;
          const my = ((seeded(m, 96) * h + p * h * 1.2) % (h + 100)) - 50;
          drawGlowLine(ctx, mx - 35, my - 70, mx, my, 8 * env, skill.secondaryColor, skill.primaryColor, env * 0.85);
          drawOrb(ctx, mx, my, 12, pRgb, env * 0.9);
        }
        break;
      }

      /* ---------------- TANJIRO: HINOKAMI KAGURA & WATER ---------------- */
      case 'hinokami_waltz': {
        const sunR = minDim * 0.30;
        drawGlowArc(ctx, cx, cy, sunR, -HALF_PI, -HALF_PI + TWO_PI * sweep, 24 * env, skill.primaryColor, skill.accentColor, env);
        for (let ray = 0; ray < 16; ray++) {
          const ra = (ray / 16) * TWO_PI + p * 2.5;
          drawGlowLine(ctx, cx + Math.cos(ra) * sunR, cy + Math.sin(ra) * sunR, cx + Math.cos(ra) * (sunR + 48 * env), cy + Math.sin(ra) * (sunR + 48 * env), 5, skill.secondaryColor, '#ffffff', env * 0.85);
        }
        break;
      }

      case 'clear_blue_sky': {
        drawOrb(ctx, cx, cy, minDim * 0.38, sRgb, env * 0.35);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(0.55, 1.05);
        drawGlowArc(ctx, 0, 0, minDim * 0.34, 0, TWO_PI * sweep, 22 * env, skill.primaryColor, '#ffffff', env);
        ctx.restore();
        break;
      }

      case 'solar_halo_dragon': {
        const segs = 48;
        const headT = easeOutCubic(clamp(p * 1.25, 0, 1)) * 1.12;
        let psx = 0;
        let psy = 0;
        let pwx = 0;
        let pwy = 0;
        let hx = cx;
        let hy = cy;
        let hang = 0;

        for (let i = 0; i <= segs; i++) {
          const u = headT - (i / segs) * 0.76;
          const baseX = w * (-0.06 + u * 1.08);
          const sunY = cy + Math.sin(u * 8 - p * 6) * (h * 0.22);
          const watY = cy - Math.sin(u * 8 - p * 6) * (h * 0.22);
          if (i === 0) {
            hx = baseX;
            hy = sunY;
          } else {
            if (i === 1) hang = Math.atan2(hy - sunY, hx - baseX);
            const taper = 1 - i / (segs + 4);
            drawGlowLine(ctx, psx, psy, baseX, sunY, (8 + 26 * taper) * env, '#ef4444', '#fef08a', env * 0.92);
            drawGlowLine(ctx, pwx, pwy, baseX, watY, (7 + 22 * taper) * env, '#0ea5e9', '#e0f2fe', env * 0.88);
          }
          psx = baseX;
          psy = sunY;
          pwx = baseX;
          pwy = watY;
        }
        drawDragonHead(ctx, hx, hy, hang, 1.5, '#f97316', '#dc2626', '#fef08a', env);
        break;
      }

      case 'thirteenth_form': {
        const ringR = minDim * 0.33;
        const unlocked = Math.max(1, Math.min(12, Math.floor(sweep * 13)));
        const pts = [];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TWO_PI - HALF_PI;
          pts.push({ x: cx + Math.cos(a) * ringR, y: cy + Math.sin(a) * ringR });
        }
        for (let i = 0; i < unlocked; i++) {
          const p1 = pts[(i * 5) % 12];
          const p2 = pts[((i + 1) * 5) % 12];
          drawGlowLine(ctx, p1.x, p1.y, p2.x, p2.y, 7 * env, skill.secondaryColor, skill.primaryColor, env * 0.92);
          drawOrb(ctx, p1.x, p1.y, 9, pRgb, env);
        }
        drawOrb(ctx, cx, cy, minDim * 0.12 * env, pRgb, env * 0.85);
        drawGlowArc(ctx, cx, cy, ringR, 0, TWO_PI * sweep, 8 * env, skill.primaryColor, '#ffffff', env);
        break;
      }

      /* ---------------- NEZUKO: BLOOD DEMON ART ---------------- */
      case 'exploding_blood': {
        for (let b = 0; b < 14; b++) {
          const ba = (b / 14) * TWO_PI;
          const blen = easeOutQuint(clamp(p * 1.4, 0, 1)) * minDim * (0.28 + (b % 3) * 0.12);
          drawLightningBolt(ctx, cx, cy, cx + Math.cos(ba) * blen, cy + Math.sin(ba) * blen, 6, 18, skill.primaryColor, skill.accentColor, 6, env * 0.9, 110 + b);
        }
        drawOrb(ctx, cx, cy, minDim * 0.16 * env, pRgb, env * 0.85);
        break;
      }

      case 'crimson_lotus_blaze': {
        const petals = 12;
        const maxR = minDim * 0.32 * easeOutCubic(clamp(p * 1.4, 0, 1));
        for (let k = 0; k < petals; k++) {
          const a = (k / petals) * TWO_PI + p * 2.2;
          drawPetal(ctx, cx + Math.cos(a) * maxR * 0.55, cy + Math.sin(a) * maxR * 0.55, maxR * 0.42, a, k % 2 === 0 ? skill.primaryColor : skill.secondaryColor, env * 0.65, false);
        }
        // Bright Crimson Nichirin blade igniting across center
        drawGlowLine(ctx, w * 0.2, h * 0.72, w * 0.8, h * 0.28, 14 * env, skill.secondaryColor, skill.accentColor, env);
        break;
      }

      case 'crimson_willow_vines': {
        for (let v = 0; v < 8; v++) {
          const yBase = h * (0.15 + v * 0.1);
          const dir = v % 2 === 0 ? 1 : -1;
          drawGlowLine(
            ctx,
            dir > 0 ? 0 : w,
            yBase,
            dir > 0 ? w * sweep : w * (1 - sweep),
            h - yBase,
            7 * env,
            v % 3 === 0 ? skill.secondaryColor : skill.primaryColor,
            skill.accentColor,
            env * 0.85
          );
        }
        for (let i = 0; i < 55; i++) {
          drawPetal(ctx, seeded(i, 121) * w, ((seeded(i, 122) * h + p * h * 0.75) % h), 8, p * 5 + i, skill.primaryColor, env * 0.9, true);
        }
        break;
      }

      case 'healing_pink_moon': {
        drawOrb(ctx, cx, cy - h * 0.06, minDim * 0.20, pRgb, env * 0.75);
        drawGlowArc(ctx, cx, cy - h * 0.06, minDim * 0.26 * (0.85 + 0.2 * p), 0, TWO_PI, 4, skill.primaryColor, '#ffffff', env * 0.8);
        for (let i = 0; i < 75; i++) {
          const x = seeded(i, 125) * w + Math.sin(p * 4 + i) * 24;
          const y = ((seeded(i, 126) * h - p * h * 0.55 + h) % h);
          drawOrb(ctx, x, y, 3 + seeded(i, 127) * 6, i % 2 === 0 ? aRgb : pRgb, env * 0.85);
        }
        break;
      }

      /* ---------------- ZENITSU: THUNDER BREATHING ---------------- */
      case 'thunderclap_flash': {
        const x1 = -20;
        const y1 = h * 0.62;
        const x2 = w * sweep * 1.06;
        const y2 = h * 0.36;
        drawGlowLine(ctx, x1, y1, x2, y2, 16 * env, skill.primaryColor, '#ffffff', env);
        drawLightningBolt(ctx, x1, y1, x2, y2, 14, 28, skill.secondaryColor, skill.primaryColor, 6, env * 0.95, Math.floor(p * 24));
        drawGlowArc(ctx, w * 0.16, h * 0.58, minDim * 0.22 * sweep, 0, TWO_PI, 5 * env, skill.secondaryColor, '#ffffff', env * 0.85);
        break;
      }

      case 'sixfold_thunder': {
        const bouncePts = [
          { x: w * 0.08, y: h * 0.75 },
          { x: w * 0.42, y: h * 0.06 },
          { x: w * 0.94, y: h * 0.42 },
          { x: w * 0.22, y: h * 0.94 },
          { x: w * 0.05, y: h * 0.26 },
          { x: w * 0.86, y: h * 0.88 },
          { x: w * 0.55, y: h * 0.18 }
        ];
        const segCount = Math.max(1, Math.min(6, Math.ceil(sweep * 6)));
        for (let i = 0; i < segCount; i++) {
          const a = bouncePts[i];
          const b = bouncePts[i + 1];
          drawLightningBolt(ctx, a.x, a.y, b.x, b.y, 10, 22, skill.primaryColor, '#ffffff', 7 * env, env, 200 + i + Math.floor(p * 18));
          drawOrb(ctx, b.x, b.y, 16, pRgb, env * 0.9);
        }
        break;
      }

      case 'godspeed_thunder': {
        const xEnd = w * sweep * 1.08;
        drawGlowLine(ctx, 0, cy + 20, xEnd, cy - 20, 22 * env, skill.secondaryColor, '#ffffff', env);
        drawLightningBolt(ctx, 0, cy + 20, xEnd, cy - 20, 16, 34, skill.primaryColor, '#ffffff', 8 * env, env, Math.floor(p * 30));
        // Twin sonic boom shockcones
        [0.26, 0.62].forEach((pos) => {
          if (sweep > pos) {
            ctx.save();
            ctx.translate(w * pos, cy);
            ctx.scale(0.38, 1);
            drawGlowArc(ctx, 0, 0, minDim * 0.36 * easeOutCubic(p), 0, TWO_PI, 8 * env, skill.accentColor, '#ffffff', env * 0.9);
            ctx.restore();
          }
        });
        break;
      }

      case 'flaming_thunder_god': {
        const segs = 44;
        const headT = easeOutCubic(clamp(p * 1.3, 0, 1)) * 1.14;
        let px = 0;
        let py = 0;
        let hx = cx;
        let hy = cy;
        let hang = -0.45;
        for (let i = 0; i <= segs; i++) {
          const u = headT - (i / segs) * 0.72;
          const x = w * (-0.05 + u * 1.08);
          const y = h * (0.86 - u * 0.74) + Math.sin(u * 9 - p * 12) * 38;
          if (i === 0) {
            hx = x;
            hy = y;
          } else {
            if (i === 1) hang = Math.atan2(hy - y, hx - x);
            const taper = 1 - i / (segs + 4);
            drawGlowLine(ctx, px, py, x, y, (8 + 28 * taper) * env, skill.primaryColor, '#ffffff', env * 0.95);
            if (i % 5 === 0) {
              drawLightningBolt(ctx, px, py, px + (seeded(i, 210) - 0.5) * 140, py + (seeded(i, 211) - 0.5) * 140, 5, 16, skill.secondaryColor, skill.primaryColor, 3.5, env * 0.85, i + Math.floor(p * 20));
            }
          }
          px = x;
          py = y;
        }
        drawDragonHead(ctx, hx, hy, hang, 1.7, skill.primaryColor, skill.secondaryColor, '#ffffff', env);
        break;
      }

      /* ---------------- INOSUKE: BEAST BREATHING ---------------- */
      case 'pierce_fangs': {
        const xEnd = w * (0.1 + 0.82 * sweep);
        drawSerratedSlash(ctx, w * 0.08, cy - 36, xEnd, cy - 18, 22 * env, skill.primaryColor, skill.accentColor, env, 1);
        drawSerratedSlash(ctx, w * 0.08, cy + 36, xEnd, cy + 18, 22 * env, skill.primaryColor, skill.accentColor, env, 2);
        break;
      }

      case 'devour_slash': {
        const dx = w * 0.38 * sweep;
        const dy = h * 0.34 * sweep;
        drawSerratedSlash(ctx, cx - dx, cy - dy, cx + dx, cy + dy, 28 * env, skill.primaryColor, '#ffffff', env, 3);
        drawSerratedSlash(ctx, cx + dx, cy - dy, cx - dx, cy + dy, 28 * env, skill.primaryColor, '#ffffff', env, 4);
        break;
      }

      case 'crazy_cutting': {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TWO_PI + (k % 2 === 0 ? 0.12 : -0.12);
          const r1 = minDim * 0.05;
          const r2 = minDim * (0.34 + (k % 3) * 0.1) * sweep;
          drawSerratedSlash(ctx, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, 15 * env, skill.primaryColor, skill.accentColor, env * 0.9, 10 + k);
        }
        break;
      }

      case 'spatial_awareness': {
        const maxR = Math.hypot(w, h) * 0.6;
        for (let wIdx = 0; wIdx < 4; wIdx++) {
          const lp = clamp(p * 1.4 - wIdx * 0.18, 0, 1);
          if (lp <= 0) continue;
          const rad = easeOutCubic(lp) * maxR;
          drawGlowArc(ctx, cx, cy, rad, 0, TWO_PI, 3.5, skill.primaryColor, skill.accentColor, (1 - lp) * 0.85);
        }
        // Detected spirit pulses across space
        const curRad = easeOutCubic(clamp(p * 1.4, 0, 1)) * maxR;
        for (let d = 0; d < 28; d++) {
          const dx = seeded(d, 231) * w;
          const dy = seeded(d, 232) * h;
          if (Math.hypot(dx - cx, dy - cy) <= curRad) {
            drawOrb(ctx, dx, dy, 5, pRgb, env * 0.85);
            drawGlowArc(ctx, dx, dy, 14 + Math.sin(p * 12 + d) * 4, 0, TWO_PI, 1.5, skill.primaryColor, '#ffffff', env * 0.65);
          }
        }
        break;
      }

      default: {
        drawGlowArc(ctx, cx, cy, minDim * 0.3 * sweep, 0, TWO_PI, 10 * env, skill.primaryColor, skill.accentColor, env);
      }
    }

    ctx.restore();
  }

  /* ==========================================================================
   * 6B. FULL-BODY ACTION CHIBI STAGE CHOREOGRAPHY (5-PHASE BALLISTIC & BLADE SYNC)
   * ========================================================================== */

  // Native facing of each extracted 384x384 <id>_action.png sprite (-1 = facing left, +1 = facing right)
  const ACTION_SPRITE_META = {
    ubuyashiki: { nativeFacing: -1, baseSize: 196, spinCapable: false },
    shinobu:    { nativeFacing: -1, baseSize: 204, spinCapable: true  },
    giyu:       { nativeFacing: -1, baseSize: 208, spinCapable: true  },
    rengoku:    { nativeFacing: -1, baseSize: 214, spinCapable: true  },
    uzui:       { nativeFacing:  1, baseSize: 218, spinCapable: true  },
    muichiro:   { nativeFacing: -1, baseSize: 204, spinCapable: true  },
    mitsuri:    { nativeFacing: -1, baseSize: 214, spinCapable: true  },
    obanai:     { nativeFacing: -1, baseSize: 206, spinCapable: true  },
    sanemi:     { nativeFacing: -1, baseSize: 210, spinCapable: true  },
    gyomei:     { nativeFacing:  1, baseSize: 224, spinCapable: false },
    tanjiro:    { nativeFacing: -1, baseSize: 208, spinCapable: true  },
    nezuko:     { nativeFacing: -1, baseSize: 202, spinCapable: true  },
    zenitsu:    { nativeFacing: -1, baseSize: 206, spinCapable: true  },
    inosuke:    { nativeFacing:  1, baseSize: 210, spinCapable: true  }
  };

  const actionSpriteCache = Object.create(null);

  function resolveActionSpriteUrl(charId, explicitUrl) {
    if (typeof explicitUrl === 'string' && explicitUrl.trim()) {
      const trimmed = explicitUrl.trim();
      if (
        trimmed.startsWith('data:') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('blob:')
      ) {
        return trimmed;
      }
      const base = (ROOT_SCOPE && ROOT_SCOPE.__AGY_ASSET_BASE__) || './themes/';
      return String(base).replace(/\/?$/, '/') + trimmed.replace(/^\/+/, '');
    }
    const safeId = resolveCharacterId(charId) || 'shinobu';
    const base = (ROOT_SCOPE && ROOT_SCOPE.__AGY_ASSET_BASE__) || './themes/';
    return String(base).replace(/\/?$/, '/') + `assets/${safeId}_action.png?v=act2`;
  }

  function preloadActionSprite(charId, explicitUrl) {
    const safeId = resolveCharacterId(charId) || 'shinobu';
    const url = resolveActionSpriteUrl(safeId, explicitUrl);
    const existing = actionSpriteCache[safeId];
    if (existing && existing.url === url && (existing.loaded || existing.loading)) {
      return existing;
    }
    if (typeof Image === 'undefined') return null;
    const entry = {
      charId: safeId,
      url,
      img: new Image(),
      loaded: false,
      loading: true,
      failed: false
    };
    entry.img.decoding = 'async';
    entry.img.crossOrigin = 'anonymous';
    entry.img.onload = () => {
      entry.loaded = true;
      entry.loading = false;
    };
    entry.img.onerror = () => {
      entry.loading = false;
      entry.failed = true;
    };
    entry.img.src = url;
    actionSpriteCache[safeId] = entry;
    return entry;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function evalParabolicArc(x0, y0, x1, y1, liftPx, t) {
    const u = clamp(t, 0, 1);
    const ease = 1 - Math.pow(1 - u, 2.4);
    const x = lerp(x0, x1, ease);
    const y = lerp(y0, y1, ease) - Math.sin(u * Math.PI) * liftPx;
    return { x, y };
  }

  // Subtle anime hit-stop compression around impact peak so slashes carry real physical weight
  function warpProgressForHitStop(rawP) {
    const p = clamp(rawP, 0, 1);
    const hsStart = 0.34;
    const hsEnd = 0.40;
    if (p < hsStart) {
      return (p / hsStart) * 0.36;
    }
    if (p <= hsEnd) {
      return 0.36 + ((p - hsStart) / (hsEnd - hsStart)) * 0.015;
    }
    return 0.375 + ((p - hsEnd) / (1 - hsEnd)) * 0.625;
  }

  function getChoreographyPattern(vfx) {
    switch (vfx) {
      // Type A: High-speed horizontal / diagonal blitz slash (Chibi leads exact blade tip!)
      case 'water_surface_slash':
      case 'bee_sting_thrust':
      case 'unknowing_fire':
      case 'shifting_flow_slash':
      case 'oboro_haze':
      case 'shivers_of_first_love':
      case 'winding_serpent_slash':
      case 'dust_whirlwind_cutter':
      case 'thunderclap_flash':
      case 'godspeed_thunder':
      case 'pierce_fangs':
        return 'blitz_slash';

      // Type B: Multi-point ricochet / zigzag combo across the viewport
      case 'hundred_legged_zigzag':
      case 'sixfold_thunder':
      case 'constant_resounding_slashes':
      case 'eight_layered_mist':
      case 'catlove_shower':
      case 'rhyolite_rapid_conquest':
        return 'zigzag_combo';

      // Type C: Dragon / Serpent / Tiger surge — Chibi surfs right alongside the elemental beast head
      case 'water_dragon':
      case 'striking_tide':
      case 'flame_tiger':
      case 'rengoku_dragon':
      case 'love_pangs':
      case 'slithering_serpent':
      case 'solar_halo_dragon':
      case 'flaming_thunder_god':
        return 'beast_surge';

      // Type D: Aerial 360° wheel / vortex spin in mid-air
      case 'butterfly_caprice':
      case 'rising_scorching_sun':
      case 'string_performance':
      case 'cat_legged_winds':
      case 'coil_choke':
      case 'primary_gale_slash':
      case 'hinokami_waltz':
      case 'clear_blue_sky':
      case 'thirteenth_form':
      case 'crazy_cutting':
        return 'aerial_wheel';

      // Type E: Sky-high leap -> meteoric downward X-cleave / earth-shattering slam
      case 'roar_blast':
      case 'claws_purifying_wind':
      case 'serpentinite_bipolar':
      case 'upper_smash':
      case 'crimson_lotus_blaze':
      case 'devour_slash':
        return 'meteor_slam';

      // Type F: Center-stage domain expansion / serene mastery (Nagi, Ubuyashiki, Oboro, Exploding Blood)
      default:
        return 'domain_center';
    }
  }

  // Evaluate the core combat trajectory during Phase 2-4 (u in [0, 1])
  function sampleCombatPoint(pattern, vfx, w, h, u) {
    const cx = w * 0.5;
    const cy = h * 0.47;
    const minDim = Math.min(w, h);
    const t = clamp(u, 0, 1);

    if (pattern === 'blitz_slash') {
      // Brief crouched iaijutsu charge (0..0.14) -> supersonic dash (0.14..0.76) -> brake slide (0.76..1.0)
      const yStart = vfx === 'bee_sting_thrust' ? h * 0.68 : (vfx === 'thunderclap_flash' ? h * 0.60 : h * 0.50);
      const yEnd = vfx === 'bee_sting_thrust' ? h * 0.28 : (vfx === 'thunderclap_flash' ? h * 0.36 : h * 0.46);
      if (t < 0.14) {
        const c = t / 0.14;
        return {
          x: w * 0.15 - c * 14,
          y: yStart + c * 8,
          rot: -0.18 * c,
          scaleMul: 1 - c * 0.06,
          facing: 1,
          charging: 1 - Math.abs(c - 0.7)
        };
      }
      if (t < 0.76) {
        const d = easeOutQuint((t - 0.14) / 0.62);
        const x = lerp(w * 0.14, w * 0.84, d);
        const wave = (vfx === 'winding_serpent_slash' || vfx === 'shifting_flow_slash' || vfx === 'shivers_of_first_love')
          ? Math.sin(d * Math.PI * 3) * (h * 0.11)
          : 0;
        const y = lerp(yStart, yEnd, d) + wave;
        return {
          x,
          y,
          rot: 0.16 * (1 - d * 0.5),
          scaleMul: 1.08,
          facing: 1,
          slashing: 1
        };
      }
      const b = easeOutCubic((t - 0.76) / 0.24);
      return {
        x: lerp(w * 0.84, w * 0.865, b),
        y: yEnd + b * 6,
        rot: lerp(0.08, 0, b),
        scaleMul: lerp(1.06, 1.0, b),
        facing: -1, // Turns back heroically toward center after slicing through!
        posing: 1
      };
    }

    if (pattern === 'zigzag_combo') {
      const pts = [
        { x: w * 0.16, y: h * 0.68 },
        { x: w * 0.40, y: h * 0.22 },
        { x: w * 0.78, y: h * 0.34 },
        { x: w * 0.26, y: h * 0.70 },
        { x: w * 0.82, y: h * 0.62 },
        { x: w * 0.54, y: h * 0.36 }
      ];
      if (t < 0.80) {
        const segFloat = (t / 0.80) * (pts.length - 1);
        const idx = Math.min(pts.length - 2, Math.floor(segFloat));
        const local = easeOutCubic(segFloat - idx);
        const a = pts[idx];
        const b = pts[idx + 1];
        const dx = b.x - a.x;
        return {
          x: lerp(a.x, b.x, local),
          y: lerp(a.y, b.y, local),
          rot: clamp(dx / w, -0.35, 0.35) * 0.55,
          scaleMul: 1.04 + Math.sin(local * Math.PI) * 0.08,
          facing: dx >= 0 ? 1 : -1,
          slashing: 1
        };
      }
      const hold = easeOutCubic((t - 0.80) / 0.20);
      const last = pts[pts.length - 1];
      return {
        x: last.x,
        y: last.y - Math.sin(hold * Math.PI) * 8,
        rot: 0,
        scaleMul: 1.04,
        facing: -1,
        posing: 1
      };
    }

    if (pattern === 'beast_surge') {
      const prog = easeOutCubic(clamp(t / 0.84, 0, 1));
      const x = lerp(w * 0.14, w * 0.80, prog);
      const baseRise = (vfx === 'rengoku_dragon' || vfx === 'flaming_thunder_god')
        ? lerp(h * 0.72, h * 0.30, prog)
        : cy;
      const wave = Math.sin(prog * Math.PI * 2.6) * (h * 0.15);
      const dy = Math.cos(prog * Math.PI * 2.6) * 0.22;
      return {
        x,
        y: baseRise + wave,
        rot: clamp(dy, -0.28, 0.28),
        scaleMul: t < 0.84 ? 1.10 : lerp(1.10, 1.02, (t - 0.84) / 0.16),
        facing: 1,
        slashing: t < 0.84 ? 1 : 0,
        posing: t >= 0.84 ? 1 : 0
      };
    }

    if (pattern === 'aerial_wheel') {
      const wheelR = minDim * 0.15;
      if (t < 0.76) {
        const s = easeOutCubic(t / 0.76);
        const ang = -HALF_PI + s * TWO_PI * 1.25;
        return {
          x: cx + Math.cos(ang) * wheelR * (1 - s * 0.45),
          y: cy + Math.sin(ang) * wheelR * 0.72 * (1 - s * 0.45),
          rot: s * TWO_PI,
          scaleMul: 1.08 + Math.sin(s * Math.PI) * 0.08,
          facing: Math.cos(ang) >= 0 ? 1 : -1,
          slashing: 1,
          allowFullSpin: true
        };
      }
      const pHold = easeOutCubic((t - 0.76) / 0.24);
      return {
        x: cx,
        y: cy + pHold * 8,
        rot: 0,
        scaleMul: lerp(1.10, 1.03, pHold),
        facing: -1,
        posing: 1
      };
    }

    if (pattern === 'meteor_slam') {
      if (t < 0.32) {
        // Soar to apex above battlefield
        const up = easeOutCubic(t / 0.32);
        return {
          x: lerp(cx + w * 0.08, cx, up),
          y: lerp(h * 0.46, h * 0.17, up),
          rot: -0.22 * up,
          scaleMul: lerp(1.0, 1.12, up),
          facing: -1,
          charging: up
        };
      }
      if (t < 0.56) {
        // Meteoric downward cleave!
        const slam = easeOutQuint((t - 0.32) / 0.24);
        return {
          x: cx,
          y: lerp(h * 0.17, h * 0.56, slam),
          rot: lerp(-0.22, 0.18, slam),
          scaleMul: lerp(1.12, 1.18, slam),
          facing: -1,
          slashing: 1,
          impactBurst: slam > 0.82 ? 1 : 0
        };
      }
      const rec = easeOutCubic((t - 0.56) / 0.44);
      return {
        x: cx,
        y: lerp(h * 0.56, h * 0.52, rec),
        rot: lerp(0.18, 0, rec),
        scaleMul: lerp(1.16, 1.04, rec),
        facing: -1,
        posing: 1
      };
    }

    // 'domain_center' (Dead Calm, Ubuyashiki Sanctuary, Oboro, Exploding Blood, Spatial Awareness)
    const floatBob = Math.sin(t * Math.PI * 2) * 8;
    return {
      x: cx,
      y: cy - 10 + floatBob,
      rot: Math.sin(t * Math.PI) * 0.04,
      scaleMul: 1.08 + Math.sin(t * Math.PI) * 0.05,
      facing: -1,
      slashing: t > 0.18 && t < 0.72 ? 0.7 : 0,
      posing: 1
    };
  }

  function computeFullStageActorState(w, h, rawP, skill, homeOrigin) {
    const meta = ACTION_SPRITE_META[skill.charId] || ACTION_SPRITE_META.shinobu;
    const home = homeOrigin || { x: w * 0.80, y: h * 0.84 };
    const pattern = getChoreographyPattern(skill.vfxType);
    const p = warpProgressForHitStop(rawP);

    const launchEnd = 0.15;
    const returnStart = 0.84;

    const entryTarget = sampleCombatPoint(pattern, skill.vfxType, w, h, 0);
    const exitSource = sampleCombatPoint(pattern, skill.vfxType, w, h, 1);

    let x = home.x;
    let y = home.y;
    let rot = 0;
    let size = meta.baseSize;
    let facing = entryTarget.facing || -1;
    let phase = 'combat';
    let slashing = 0;
    let charging = 0;
    let impactShake = 0;

    if (p < launchEnd) {
      // Phase 1: Parabolic Shunpo Launch out from the Composer Chibi corner!
      phase = 'launch';
      const lp = p / launchEnd;
      const arc = evalParabolicArc(home.x, home.y, entryTarget.x, entryTarget.y, Math.min(180, h * 0.22), lp);
      x = arc.x;
      y = arc.y;
      size = lerp(92, meta.baseSize, easeOutCubic(lp));
      facing = entryTarget.x >= home.x ? 1 : -1;
      rot = (facing > 0 ? 1 : -1) * Math.sin(lp * Math.PI) * 0.26;
      charging = lp;
    } else if (p < returnStart) {
      // Phase 2-4: Main Combat Slash, Hit-Stop & Heroic Pose Hold
      phase = 'combat';
      const cu = (p - launchEnd) / (returnStart - launchEnd);
      const pt = sampleCombatPoint(pattern, skill.vfxType, w, h, cu);
      x = pt.x;
      y = pt.y;
      rot = (pt.allowFullSpin && !meta.spinCapable) ? 0 : (pt.rot || 0);
      size = meta.baseSize * (pt.scaleMul || 1);
      facing = pt.facing || -1;
      slashing = pt.slashing || 0;
      charging = pt.charging || 0;
      if (rawP >= 0.33 && rawP <= 0.43) {
        impactShake = 1 - Math.abs(rawP - 0.38) / 0.05;
      }
    } else {
      // Phase 5: Agile Parabolic Somersault Return right back to the Composer corner!
      phase = 'return';
      const rp = (p - returnStart) / (1 - returnStart);
      const arc = evalParabolicArc(exitSource.x, exitSource.y, home.x, home.y, Math.min(155, h * 0.18), rp);
      x = arc.x;
      y = arc.y;
      size = lerp(meta.baseSize, 90, easeInOutQuad(rp));
      facing = home.x >= exitSource.x ? 1 : -1;
      rot = (meta.spinCapable ? 1 : 0.2) * Math.sin(rp * Math.PI) * 0.45 * (facing > 0 ? 1 : -1);
    }

    return {
      x,
      y,
      rot,
      size,
      facing,
      nativeFacing: meta.nativeFacing,
      phase,
      pattern,
      slashing,
      charging,
      impactShake,
      home
    };
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function drawShunpoTeleportRing(ctx, x, y, prog, primaryHex, accentHex) {
    const u = clamp(prog, 0, 1);
    const alpha = (1 - u) * 0.9;
    if (alpha <= 0.01) return;
    const rad = 14 + easeOutCubic(u) * 68;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlowArc(ctx, x, y, rad, 0, TWO_PI, 4.5 * (1 - u), primaryHex, accentHex, alpha);
    drawGlowArc(ctx, x, y, rad * 0.58, u * 4, u * 4 + Math.PI * 1.4, 2.5, accentHex, '#ffffff', alpha * 0.85);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TWO_PI + u * 1.6;
      const r1 = rad * 0.45;
      const r2 = rad * 1.18;
      drawGlowLine(
        ctx,
        x + Math.cos(a) * r1,
        y + Math.sin(a) * r1,
        x + Math.cos(a) * r2,
        y + Math.sin(a) * r2,
        2.4 * (1 - u),
        primaryHex,
        '#ffffff',
        alpha * 0.8
      );
    }
    ctx.restore();
  }

  function drawActionChibiOnStage(ctx, w, h, rawP, skill, homeOrigin, spriteEntry) {
    const actor = computeFullStageActorState(w, h, rawP, skill, homeOrigin);
    const pRgb = hexToRgb(skill.primaryColor);
    const aRgb = hexToRgb(skill.accentColor);

    // 1. Shunpo vanish burst at home corner on launch & landing ring on return
    if (rawP < 0.18) {
      drawShunpoTeleportRing(ctx, actor.home.x, actor.home.y, rawP / 0.18, skill.primaryColor, skill.accentColor);
    } else if (rawP > 0.86) {
      drawShunpoTeleportRing(ctx, actor.home.x, actor.home.y, 1 - (rawP - 0.86) / 0.14, skill.primaryColor, skill.accentColor);
    }

    // 2. Dynamic Sword-Follow Trail & Speed Lines linking Chibi directly to its Breathing Slash
    if (actor.slashing > 0.1 || actor.phase === 'launch') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let g = 5; g >= 1; g--) {
        const lagP = Math.max(0, rawP - g * 0.022);
        const ghost = computeFullStageActorState(w, h, lagP, skill, homeOrigin);
        const gAlpha = (1 - g / 6) * 0.42;

        // Luminous blade ribbon connecting ghost positions right through the Chibi's weapon path
        const nextGhost = g === 1 ? actor : computeFullStageActorState(w, h, Math.max(0, rawP - (g - 1) * 0.022), skill, homeOrigin);
        drawGlowLine(
          ctx,
          ghost.x,
          ghost.y,
          nextGhost.x,
          nextGhost.y,
          (18 - g * 2.4),
          skill.primaryColor,
          skill.accentColor,
          gAlpha * 1.25
        );

        // Chromatic anime afterimage silhouettes
        if (spriteEntry && spriteEntry.loaded && !spriteEntry.failed) {
          ctx.save();
          ctx.translate(ghost.x, ghost.y);
          ctx.rotate(ghost.rot);
          const flipX = ghost.facing * ghost.nativeFacing < 0 ? -1 : 1;
          ctx.scale(flipX, 1);
          ctx.globalAlpha = gAlpha * 0.55;
          const gs = ghost.size * 0.96;
          ctx.drawImage(spriteEntry.img, -gs * 0.5, -gs * 0.5, gs, gs);
          ctx.restore();
        } else {
          drawOrb(ctx, ghost.x, ghost.y, ghost.size * 0.22, pRgb, gAlpha);
        }
      }
      ctx.restore();
    }

    // 3. Elemental Aura Halo & Blade Charge Spark right behind the Full-Body Chibi
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const auraR = actor.size * (0.48 + actor.slashing * 0.14 + actor.charging * 0.10);
    const haloGrad = ctx.createRadialGradient(actor.x, actor.y, 6, actor.x, actor.y, auraR);
    haloGrad.addColorStop(0, `rgba(${aRgb}, 0.52)`);
    haloGrad.addColorStop(0.45, `rgba(${pRgb}, 0.34)`);
    haloGrad.addColorStop(1, `rgba(${pRgb}, 0)`);
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(actor.x, actor.y, auraR, 0, TWO_PI);
    ctx.fill();

    // Orbiting elemental slash ring around Chibi during active strike
    if (actor.slashing > 0.2 || actor.charging > 0.3) {
      const ringSpin = rawP * 18 * actor.facing;
      drawGlowArc(
        ctx,
        actor.x,
        actor.y,
        actor.size * 0.46,
        ringSpin,
        ringSpin + Math.PI * 1.25,
        5.5,
        skill.primaryColor,
        '#ffffff',
        0.82
      );
    }
    ctx.restore();

    // 4. Crisp Full-Body Action Chibi Sprite (<id>_action.png)
    if (spriteEntry && spriteEntry.loaded && !spriteEntry.failed) {
      ctx.save();
      ctx.translate(actor.x, actor.y);
      ctx.rotate(actor.rot);
      // Flip horizontally when actor's movement direction opposes the sprite's native artwork facing
      const scaleX = actor.facing * actor.nativeFacing < 0 ? -1 : 1;
      ctx.scale(scaleX, 1);

      // Subtle glowing rim shadow so the cel-shaded Chibi pops dramatically over bright 4K wallpapers & VFX
      ctx.shadowColor = skill.primaryColor;
      ctx.shadowBlur = 18 + actor.slashing * 14;
      const s = actor.size;
      ctx.drawImage(spriteEntry.img, -s * 0.5, -s * 0.5, s, s);
      ctx.restore();
    } else {
      // Instant glowing spirit silhouette fallback if PNG is still decoding on first millisecond
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawOrb(ctx, actor.x, actor.y, actor.size * 0.28, pRgb, 0.9);
      drawGlowArc(ctx, actor.x, actor.y, actor.size * 0.34, 0, TWO_PI, 4, skill.primaryColor, '#ffffff', 0.9);
      ctx.restore();
    }

    // 5. Impact Hit-Stop Starburst right at peak strike (p ~ 0.36)
    if (actor.impactShake > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const burstAlpha = actor.impactShake * 0.88;
      const burstLen = actor.size * (0.75 + (1 - actor.impactShake) * 0.65);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI + 0.25;
        drawGlowLine(
          ctx,
          actor.x - Math.cos(a) * burstLen,
          actor.y - Math.sin(a) * burstLen,
          actor.x + Math.cos(a) * burstLen,
          actor.y + Math.sin(a) * burstLen,
          (k % 2 === 0 ? 5.5 : 3.0) * actor.impactShake,
          skill.accentColor,
          '#ffffff',
          burstAlpha
        );
      }
      ctx.restore();
    }

    return actor;
  }

  /* ==========================================================================
   * 7. FULL-SCREEN OVERLAY DOM & UFOTABLE CINEMATIC BANNER
   * ========================================================================== */

  let overlayHost = null;
  let canvasEl = null;
  let bannerEl = null;
  let subLabelEl = null;
  let kanjiBgEl = null;
  let titleEl = null;
  let voiceEl = null;
  let activeRafId = 0;
  let activeBannerTimer = 0;
  let activeHideTimer = 0;
  let activeStageCleanup = null;

  function prefersReducedMotion() {
    try {
      if (typeof ROOT_SCOPE.matchMedia === 'function') {
        const mq = ROOT_SCOPE.matchMedia('(prefers-reduced-motion: reduce)');
        return Boolean(mq && mq.matches);
      }
    } catch (_) {}
    return false;
  }

  function requestFrame(cb) {
    if (typeof ROOT_SCOPE.requestAnimationFrame === 'function') {
      return ROOT_SCOPE.requestAnimationFrame(cb);
    }
    return setTimeout(() => cb(Date.now()), 16);
  }

  function cancelFrame(id) {
    if (!id) return;
    if (typeof ROOT_SCOPE.cancelAnimationFrame === 'function') {
      ROOT_SCOPE.cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  }

  function ensureOverlay() {
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') {
      return null;
    }
    if (overlayHost && overlayHost.isConnected) {
      return overlayHost;
    }
    const existing = typeof document.querySelector === 'function'
      ? document.querySelector('agy-skill-vfx')
      : null;

    overlayHost = existing || document.createElement('agy-skill-vfx');
    overlayHost.setAttribute('aria-hidden', 'true');
    overlayHost.style.cssText = [
      'position: fixed !important',
      'inset: 0 !important',
      'width: 100vw !important',
      'height: 100vh !important',
      'z-index: 99990 !important',
      'pointer-events: none !important',
      'overflow: hidden !important',
      'display: none'
    ].join('; ');

    overlayHost.innerHTML = '';

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      agy-skill-vfx .agy-kny-vfx-canvas {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
      }
      agy-skill-vfx .agy-kny-banner {
        position: absolute !important;
        left: 50% !important;
        bottom: 11vh !important;
        transform: translate3d(-50%, 24px, 0) scale(0.95);
        opacity: 0;
        min-width: min(560px, 88vw);
        max-width: 92vw;
        padding: 16px 38px 18px;
        text-align: center;
        border-radius: 14px;
        background: linear-gradient(90deg, rgba(8,10,20,0) 0%, rgba(8,10,22,0.82) 18%, rgba(10,12,26,0.90) 50%, rgba(8,10,22,0.82) 82%, rgba(8,10,20,0) 100%);
        border-top: 1px solid var(--kny-skill-primary, #38bdf8);
        border-bottom: 1px solid var(--kny-skill-accent, #e0f2fe);
        box-shadow: 0 14px 44px rgba(0,0,0,0.55), 0 0 32px var(--kny-skill-glow, rgba(56,189,248,0.28));
        transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.38s ease;
        pointer-events: none !important;
        overflow: hidden;
      }
      agy-skill-vfx .agy-kny-banner.is-visible {
        transform: translate3d(-50%, 0, 0) scale(1);
        opacity: 1;
      }
      agy-skill-vfx .agy-kny-banner.is-fading {
        transform: translate3d(-50%, -10px, 0) scale(1.02);
        opacity: 0;
      }
      agy-skill-vfx .agy-kny-kanji-bg {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        font-family: "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", Georgia, serif;
        font-size: clamp(46px, 6.5vw, 76px);
        font-weight: 800;
        letter-spacing: 0.16em;
        white-space: nowrap;
        color: var(--kny-skill-accent, #ffffff);
        opacity: 0.15;
        pointer-events: none;
        user-select: none;
      }
      agy-skill-vfx .agy-kny-sub {
        position: relative;
        font-size: 11.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: var(--kny-skill-accent, #e0f2fe);
        margin-bottom: 5px;
        text-shadow: 0 1px 8px rgba(0,0,0,0.85);
      }
      agy-skill-vfx .agy-kny-title {
        position: relative;
        font-family: "Cinzel", "Noto Serif", "Palatino Linotype", Georgia, serif;
        font-size: clamp(20px, 2.6vw, 30px);
        font-weight: 800;
        letter-spacing: 0.04em;
        background: linear-gradient(135deg, #ffffff 0%, var(--kny-skill-primary, #38bdf8) 55%, var(--kny-skill-accent, #e0f2fe) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        filter: drop-shadow(0 2px 12px var(--kny-skill-glow, rgba(56,189,248,0.55)));
        margin-bottom: 5px;
      }
      agy-skill-vfx .agy-kny-voice {
        position: relative;
        font-size: 12.5px;
        font-style: italic;
        color: rgba(248, 250, 252, 0.88);
        letter-spacing: 0.03em;
        text-shadow: 0 1px 6px rgba(0,0,0,0.9);
      }
    `;

    canvasEl = document.createElement('canvas');
    canvasEl.className = 'agy-kny-vfx-canvas';

    bannerEl = document.createElement('div');
    bannerEl.className = 'agy-kny-banner';

    kanjiBgEl = document.createElement('div');
    kanjiBgEl.className = 'agy-kny-kanji-bg';

    subLabelEl = document.createElement('div');
    subLabelEl.className = 'agy-kny-sub';

    titleEl = document.createElement('div');
    titleEl.className = 'agy-kny-title';

    voiceEl = document.createElement('div');
    voiceEl.className = 'agy-kny-voice';

    bannerEl.appendChild(kanjiBgEl);
    bannerEl.appendChild(subLabelEl);
    bannerEl.appendChild(titleEl);
    bannerEl.appendChild(voiceEl);

    overlayHost.appendChild(styleEl);
    overlayHost.appendChild(canvasEl);
    overlayHost.appendChild(bannerEl);

    const mountTarget = document.body || document.documentElement;
    if (mountTarget && typeof mountTarget.appendChild === 'function' && !overlayHost.parentNode) {
      mountTarget.appendChild(overlayHost);
    }
    return overlayHost;
  }

  function stopActiveSkill() {
    if (activeRafId) {
      cancelFrame(activeRafId);
      activeRafId = 0;
    }
    if (activeBannerTimer) {
      clearTimeout(activeBannerTimer);
      activeBannerTimer = 0;
    }
    if (activeHideTimer) {
      clearTimeout(activeHideTimer);
      activeHideTimer = 0;
    }
    if (typeof activeStageCleanup === 'function') {
      const fn = activeStageCleanup;
      activeStageCleanup = null;
      try { fn(); } catch (_) {}
    }
    if (canvasEl && typeof canvasEl.getContext === 'function') {
      const ctx = canvasEl.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasEl.width || 0, canvasEl.height || 0);
    }
    if (bannerEl && bannerEl.classList) {
      bannerEl.classList.remove('is-visible', 'is-fading');
    }
    if (overlayHost && overlayHost.style) {
      overlayHost.style.display = 'none';
    }
  }

  /* ==========================================================================
   * 8. MAIN ENTRYPOINT: castSkill(charId, skillIndexOrId, options)
   * ========================================================================== */

  function findSkill(charIdOrTheme, skillIndexOrId) {
    const charId = resolveCharacterId(charIdOrTheme);
    if (charId && SKILLS_DB[charId]) {
      const list = SKILLS_DB[charId];
      if (typeof skillIndexOrId === 'number') {
        const idx = clamp(Math.floor(skillIndexOrId), 0, list.length - 1);
        return cloneSkill(list[idx], charId, idx);
      }
      if (typeof skillIndexOrId === 'string') {
        const trimmed = skillIndexOrId.trim();
        if (/^\d+$/.test(trimmed)) {
          const idx = clamp(parseInt(trimmed, 10), 0, list.length - 1);
          return cloneSkill(list[idx], charId, idx);
        }
        const foundIdx = list.findIndex((s) => s.id === trimmed || s.vfxType === trimmed || s.nameVi === trimmed);
        if (foundIdx >= 0) return cloneSkill(list[foundIdx], charId, foundIdx);
      }
      return cloneSkill(list[0], charId, 0);
    }

    // Fallback: search by skillId across all 14 characters
    if (typeof skillIndexOrId === 'string') {
      for (let i = 0; i < CHARACTER_IDS.length; i++) {
        const cid = CHARACTER_IDS[i];
        const idx = SKILLS_DB[cid].findIndex((s) => s.id === skillIndexOrId || s.vfxType === skillIndexOrId);
        if (idx >= 0) return cloneSkill(SKILLS_DB[cid][idx], cid, idx);
      }
    }
    return null;
  }

  function castSkill(charId, skillIndexOrId, options) {
    const opts = options || {};
    const skill = findSkill(charId, skillIndexOrId);
    if (!skill) {
      return { ok: false, reason: 'unknown_character_or_skill' };
    }

    stopActiveSkill();
    playSkillSfx(skill, opts);

    const host = ensureOverlay();
    if (!host || !canvasEl) {
      return { ok: true, charId: skill.charId, skill: skill, durationMs: skill.durationMs, headless: true };
    }

    host.style.display = 'block';
    const pRgb = hexToRgb(skill.primaryColor);
    if (bannerEl && bannerEl.style) {
      bannerEl.style.setProperty('--kny-skill-primary', skill.primaryColor);
      bannerEl.style.setProperty('--kny-skill-accent', skill.accentColor);
      bannerEl.style.setProperty('--kny-skill-glow', `rgba(${pRgb}, 0.45)`);
    }
    if (kanjiBgEl) kanjiBgEl.textContent = skill.kanji;
    if (subLabelEl) subLabelEl.textContent = skill.breathingName;
    if (titleEl) titleEl.textContent = skill.nameVi;
    if (voiceEl) voiceEl.textContent = `“${skill.voiceLine}”`;

    if (bannerEl && bannerEl.classList) {
      bannerEl.classList.remove('is-fading');
      requestFrame(() => {
        if (bannerEl && bannerEl.classList) bannerEl.classList.add('is-visible');
      });
      activeBannerTimer = setTimeout(() => {
        if (bannerEl && bannerEl.classList) {
          bannerEl.classList.remove('is-visible');
          bannerEl.classList.add('is-fading');
        }
      }, 2350);
    }

    const vw = Math.max(320, Number(ROOT_SCOPE.innerWidth) || 1440);
    const vh = Math.max(240, Number(ROOT_SCOPE.innerHeight) || 900);
    const dpr = clamp(Number(ROOT_SCOPE.devicePixelRatio) || 1, 1, 2);
    canvasEl.width = Math.floor(vw * dpr);
    canvasEl.height = Math.floor(vh * dpr);

    const ctx = typeof canvasEl.getContext === 'function' ? canvasEl.getContext('2d') : null;
    if (!ctx) {
      activeHideTimer = setTimeout(stopActiveSkill, skill.durationMs);
      return { ok: true, charId: skill.charId, skill: skill, durationMs: skill.durationMs };
    }

    let origin = null;
    if (opts.originRect && typeof opts.originRect === 'object') {
      const r = opts.originRect;
      const ox = (Number(r.left) || 0) + (Number(r.width) || 0) * 0.5;
      const oy = (Number(r.top) || 0) + (Number(r.height) || 0) * 0.5;
      if (ox > 0 || oy > 0) origin = { x: ox, y: oy };
    } else if (typeof document !== 'undefined') {
      const hitEl = document.querySelector('.surface-composer > .agy-chibi-hitbox');
      if (hitEl && typeof hitEl.getBoundingClientRect === 'function') {
        const r = hitEl.getBoundingClientRect();
        if (r.width > 0) origin = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
      }
    }

    const explicitActionUrl = (opts.themeCfg && opts.themeCfg.actionSticker) || opts.actionSticker || '';
    const spriteEntry = preloadActionSprite(skill.charId, explicitActionUrl);

    // Hide the resting peeker Chibi on the chat frame while Full-Body Action Chibi leaps onto the stage!
    const stagePeekerEls = [];
    if (!prefersReducedMotion()) {
      const compEl = opts.composerEl || (typeof document !== 'undefined' ? document.querySelector('.surface-composer') : null);
      if (compEl && compEl.dataset) stagePeekerEls.push(compEl);
      if (opts.sourceFrameEl && opts.sourceFrameEl.dataset && opts.sourceFrameEl !== compEl) {
        stagePeekerEls.push(opts.sourceFrameEl);
      }
      stagePeekerEls.forEach((el) => {
        delete el.dataset.chibiLanding;
        el.dataset.chibiOutOnStage = '1';
      });
      if (typeof opts.onStageEnter === 'function') {
        try { opts.onStageEnter(skill); } catch (_) {}
      }
    }

    let returnedToCorner = false;
    const triggerCornerReturn = () => {
      if (returnedToCorner) return;
      returnedToCorner = true;
      stagePeekerEls.forEach((el) => {
        delete el.dataset.chibiOutOnStage;
        void el.offsetWidth;
        el.dataset.chibiLanding = '1';
        setTimeout(() => {
          if (el && el.dataset) delete el.dataset.chibiLanding;
        }, 420);
      });
      if (typeof opts.onStageReturn === 'function') {
        try { opts.onStageReturn(skill); } catch (_) {}
      }
    };
    activeStageCleanup = triggerCornerReturn;

    // Respect prefers-reduced-motion: render serene static illumination frame, zero motion shake, clean teardown
    if (prefersReducedMotion()) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      renderSkillFrame(ctx, vw, vh, 0.35, skill, origin);
      drawActionChibiOnStage(ctx, vw, vh, 0.48, skill, origin, spriteEntry);
      ctx.restore();
      activeHideTimer = setTimeout(stopActiveSkill, 2450);
      return { ok: true, charId: skill.charId, skill: skill, durationMs: 2450, reducedMotion: true };
    }

    const duration = clamp(Number(opts.durationMs) || skill.durationMs || 2750, 2350, 3150);
    const nowFn = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? () => performance.now()
      : () => Date.now();
    const startTs = nowFn();

    function tick(ts) {
      const cur = typeof ts === 'number' ? ts : nowFn();
      const elapsed = Math.max(0, cur - startTs);
      const p = elapsed / duration;

      if (p >= 0.96 && !returnedToCorner) {
        triggerCornerReturn();
      }

      if (p >= 1) {
        stopActiveSkill();
        return;
      }

      const warpedP = warpProgressForHitStop(p);
      // Crisp 4px camera impact micro-shake right at the Hit-Stop apex
      let shakeX = 0;
      let shakeY = 0;
      if (p >= 0.34 && p <= 0.42) {
        const mag = (1 - Math.abs(p - 0.38) / 0.04) * 5.5;
        shakeX = Math.sin(elapsed * 0.18) * mag;
        shakeY = Math.cos(elapsed * 0.23) * mag * 0.7;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, shakeX * dpr, shakeY * dpr);
      ctx.clearRect(-16, -16, vw + 32, vh + 32);
      renderSkillFrame(ctx, vw, vh, warpedP, skill, origin);
      drawActionChibiOnStage(ctx, vw, vh, p, skill, origin, spriteEntry);
      ctx.restore();

      activeRafId = requestFrame(tick);
    }

    activeRafId = requestFrame(tick);
    return { ok: true, charId: skill.charId, skill: skill, durationMs: duration };
  }

  /* ==========================================================================
   * 9. PUBLIC API EXPORT
   * ========================================================================== */

  const API = {
    CHARACTER_IDS,
    SKILLS_DB,
    resolveCharacterId,
    getSkillsForCharacter,
    getAllSkills,
    castSkill,
    stopActiveSkill,
    preloadActionSprite,
    playSkillSfx,
    isSoundMuted,
    setSoundMuted,
    toggleSoundMute
  };

  ROOT_SCOPE.__AGY_KNY_SKILLS__ = API;
})();
