(() => {
  'use strict';

  if (typeof window !== 'undefined' && window.__AGY_KNY_CHIBI_AURA__ && typeof window.__AGY_KNY_CHIBI_AURA__.teardown === 'function') {
    try { window.__AGY_KNY_CHIBI_AURA__.teardown(); } catch (_) {}
  }

  /**
   * Kimetsu no Yaiba — Direct Chibi Breathing Aura & Interactive Skill Trigger UI
   * Exposes window.__AGY_KNY_CHIBI_AURA__ for Antigravity Custom Theme Engine.
   *
   * Features:
   *  1. mountChibiAura(composerEl, themeCfg, charId)
   *     - Mounts <agy-chibi-aura> (162x84 mini 2D canvas, z-index: 29) directly behind/around
   *       the composer Chibi with 14 bespoke character elemental animations at 60fps zero-GC.
   *     - Adds subtle elemental wave accents beneath Chibi stickers on .agy-user-bubble-frame.
   *     - Auto-pauses when document.hidden, prefers-reduced-motion: reduce, or agy_fx_paused_v1 === '1'.
   *  2. playChibiAttackMotion(composerEl, themeCfg, skillInfo)
   *     - Smooth 60fps CSS transform & drop-shadow attack choreography on .surface-composer::before
   *       plus a 1.8s 2x luminance/particle surge on <agy-chibi-aura>.
   *  3. mountSkillTriggerUi(composerEl, npcWrapEl, themeCfg, charId, onSkillCast)
   *     - Floating pill bar (#agy-chibi-skill-bar) next to Chibi on top of Composer:
   *       "⚔️ Hơi Thở ▾" (4-Form selector + 🔊/🔇 SFX toggle) & "⚡ Xuất Chiêu" (1-click combo cast).
   *     - Integrated "⚔️ Các Thức" pill & expandable 4-Form drawer inside #agy-shinobu-npc-wrap.
   *  4. teardown()
   *     - Cleanly removes all injected DOM nodes, styles, observers, timers, and RAF loops.
   */

  const TWO_PI = Math.PI * 2;
  const AURA_W = 162;
  const AURA_H = 84;
  const STYLE_ID = 'antigravity-kny-chibi-aura-style';
  const SKILL_BAR_ID = 'agy-chibi-skill-bar';
  const SFX_MUTE_STORAGE_KEY = 'agy_kny_sfx_muted';
  const FX_PAUSE_STORAGE_KEY = 'agy_fx_paused_v1';
  const FINISHER_COOLDOWN_MS = 12000;

  function safeResolveAsset(val) {
    if (!val || typeof val !== 'string') return '';
    if (typeof __AGY_SEC__ !== 'undefined' && __AGY_SEC__) {
      return __AGY_SEC__.resolveAssetUrl(val) || __AGY_SEC__.sanitizeCssUrl(val);
    }
    return val;
  }

  /* ==========================================================================
   * CHARACTER & AURA MODE RESOLUTION + 56 BREATHING FORMS FALLBACK CATALOG
   * ========================================================================== */

  const CHAR_META = {
    ubuyashiki: {
      charId: 'ubuyashiki',
      auraMode: 'royal_wisteria',
      styleTitle: 'Thánh Lễ Dinh Thự Chúa Công',
      primary: '#facc15',
      secondary: '#e879f9',
      rgb1: '250, 204, 21',
      rgb2: '232, 121, 249'
    },
    shinobu: {
      charId: 'shinobu',
      auraMode: 'wisteria',
      styleTitle: 'Hơi Thở Của Côn Trùng • 蟲の呼吸',
      primary: '#c084fc',
      secondary: '#5eead4',
      rgb1: '192, 132, 252',
      rgb2: '94, 234, 212'
    },
    giyu: {
      charId: 'giyu',
      auraMode: 'water',
      styleTitle: 'Hơi Thở Của Nước • 水の呼吸',
      primary: '#38bdf8',
      secondary: '#bae6fd',
      rgb1: '56, 189, 248',
      rgb2: '186, 230, 253'
    },
    rengoku: {
      charId: 'rengoku',
      auraMode: 'flame',
      styleTitle: 'Hơi Thở Của Lửa • 炎の呼吸',
      primary: '#f97316',
      secondary: '#facc15',
      rgb1: '249, 115, 22',
      rgb2: '250, 204, 21'
    },
    uzui: {
      charId: 'uzui',
      auraMode: 'sound',
      styleTitle: 'Hơi Thở Của Âm Thanh • 音の呼吸',
      primary: '#facc15',
      secondary: '#f472b6',
      rgb1: '250, 204, 21',
      rgb2: '244, 114, 182'
    },
    muichiro: {
      charId: 'muichiro',
      auraMode: 'mist',
      styleTitle: 'Hơi Thở Của Sương Mù • 霞の呼吸',
      primary: '#5eead4',
      secondary: '#ccfbf1',
      rgb1: '94, 234, 212',
      rgb2: '204, 251, 241'
    },
    mitsuri: {
      charId: 'mitsuri',
      auraMode: 'love',
      styleTitle: 'Hơi Thở Của Tình Yêu • 恋の呼吸',
      primary: '#f472b6',
      secondary: '#a3e635',
      rgb1: '244, 114, 182',
      rgb2: '163, 230, 53'
    },
    obanai: {
      charId: 'obanai',
      auraMode: 'serpent',
      styleTitle: 'Hơi Thở Của Rắn • 蛇の呼吸',
      primary: '#a855f7',
      secondary: '#34d399',
      rgb1: '168, 85, 247',
      rgb2: '52, 211, 153'
    },
    sanemi: {
      charId: 'sanemi',
      auraMode: 'wind',
      styleTitle: 'Hơi Thở Của Gió • 風の呼吸',
      primary: '#22c55e',
      secondary: '#bbf7d0',
      rgb1: '34, 197, 94',
      rgb2: '187, 247, 208'
    },
    gyomei: {
      charId: 'gyomei',
      auraMode: 'stone',
      styleTitle: 'Hơi Thở Của Đá • 岩の呼吸',
      primary: '#f59e0b',
      secondary: '#fde68a',
      rgb1: '245, 158, 11',
      rgb2: '253, 230, 138'
    },
    tanjiro: {
      charId: 'tanjiro',
      auraMode: 'sun_water',
      styleTitle: 'Thủy Hô Hấp & Hỏa Thần Lạc Vũ',
      primary: '#f97316',
      secondary: '#38bdf8',
      rgb1: '249, 115, 22',
      rgb2: '56, 189, 248'
    },
    nezuko: {
      charId: 'nezuko',
      auraMode: 'nezuko',
      styleTitle: 'Huyết Quỷ Thuật • 爆血',
      primary: '#fb7185',
      secondary: '#f9a8d4',
      rgb1: '251, 113, 133',
      rgb2: '249, 168, 212'
    },
    zenitsu: {
      charId: 'zenitsu',
      auraMode: 'thunder',
      styleTitle: 'Hơi Thở Của Sấm Sét • 雷の呼吸',
      primary: '#facc15',
      secondary: '#38bdf8',
      rgb1: '250, 204, 21',
      rgb2: '56, 189, 248'
    },
    inosuke: {
      charId: 'inosuke',
      auraMode: 'beast',
      styleTitle: 'Hơi Thở Của Quái Thú • 獣の呼吸',
      primary: '#60a5fa',
      secondary: '#e2e8f0',
      rgb1: '96, 165, 250',
      rgb2: '226, 232, 240'
    }
  };

  const MODE_TO_CHAR = {
    royal_wisteria: 'ubuyashiki',
    wisteria_royal: 'ubuyashiki',
    ubuyashiki: 'ubuyashiki',
    wisteria: 'shinobu',
    insect: 'shinobu',
    shinobu: 'shinobu',
    water: 'giyu',
    giyu: 'giyu',
    flame: 'rengoku',
    fire: 'rengoku',
    rengoku: 'rengoku',
    sound: 'uzui',
    tengen: 'uzui',
    uzui: 'uzui',
    mist: 'muichiro',
    muichiro: 'muichiro',
    love: 'mitsuri',
    mitsuri: 'mitsuri',
    serpent: 'obanai',
    snake: 'obanai',
    obanai: 'obanai',
    wind: 'sanemi',
    sanemi: 'sanemi',
    stone: 'gyomei',
    rock: 'gyomei',
    gyomei: 'gyomei',
    sun_water: 'tanjiro',
    hinokami: 'tanjiro',
    sun: 'tanjiro',
    tanjiro: 'tanjiro',
    nezuko: 'nezuko',
    blood_blossom: 'nezuko',
    exploding_blood: 'nezuko',
    thunder: 'zenitsu',
    lightning: 'zenitsu',
    zenitsu: 'zenitsu',
    beast: 'inosuke',
    inosuke: 'inosuke'
  };

  const FALLBACK_SKILLS = {
    giyu: [
      { form: 'Thức I', name: 'Thủy Diện Trảm', kanji: '壱ノ型 水面斬り', color: '#38bdf8', quote: 'Hơi thở của Nước — Thức thứ Nhất: Thủy Diện Trảm! Nhát chém phẳng lặng dứt điểm gọn gàng mọi rắc rối! 🌊⚔️' },
      { form: 'Thức IV', name: 'Đả Triều', kanji: '肆ノ型 打ち潮', color: '#0ea5e9', quote: 'Hơi thở của Nước — Thức thứ Tư: Đả Triều! Con sóng cuộn trào liên hoàn cuốn phăng lũ bug! 🌊' },
      { form: 'Thức X', name: 'Sinh Sinh Lưu Chuyển', kanji: '拾ノ型 生生流転', color: '#7dd3fc', quote: 'Hơi thở của Nước — Thức thứ Mười: Sinh Sinh Lưu Chuyển! Thủy Long cuộn xoáy vạn trượng! 🐉🌊' },
      { form: 'Thức XI', name: 'Lặng (Tĩnh)', kanji: '拾壱ノ型 凪', color: '#bae6fd', quote: 'Hơi thở của Nước — Thức thứ Mười Một: Lặng... Mặt nước tĩnh như gương, hóa giải mọi hỗn loạn về hư không. 💧' }
    ],
    ubuyashiki: [
      { form: 'Ấn I', name: 'Tử Đằng Thánh Kết Giới', kanji: '壱ノ印 藤花の聖結界', color: '#e879f9', quote: 'Nguyện giàn hoa tử đằng ngàn năm rủ xuống kết giới bình an, che chở cho trí tuệ của con luôn sáng trong. 🌸👑' },
      { form: 'Ấn II', name: 'Thiên Đăng Khai Minh', kanji: '弐ノ印 天灯開明', color: '#facc15', quote: 'Amane, hãy cùng thắp sáng muôn vàn thiên đăng vàng kim soi rạng con đường phía trước cho các con của ta. 🏮✨' },
      { form: 'Ấn III', name: 'Bất Diệt Tâm Truyền', kanji: '参ノ印 不滅の想い', color: '#fde047', quote: 'Ý chí con người là bất diệt và vĩnh hằng! Ngọn lửa nhiệt huyết ấy không thử thách nào dập tắt được! 📜👑' },
      { form: 'Tuyệt Ấn', name: 'Cửu Trụ Tập Hợp Lệnh', kanji: '終ノ印 柱合招集', color: '#f59e0b', quote: 'Quạ Kasugai cất cánh! Toàn thể Cửu Trụ Sát Quỷ Đội hãy hội tụ tiếp thêm sức mạnh tối thượng cho con! 👑⚡' }
    ],
    shinobu: [
      { form: 'Thức I', name: 'Điệp Chi Vũ: Du Hí', kanji: '蝶ノ舞 戯れ', color: '#c084fc', quote: 'Ara ara~ Hơi thở của Côn Trùng — Điệp Chi Vũ: Du Hí! Nhẹ như cánh bướm lướt qua mà chuẩn xác tuyệt đối nhé! 🦋💜' },
      { form: 'Thức II', name: 'Phong Nha: Chân Thập', kanji: '蜂牙ノ舞 真靡き', color: '#5eead4', quote: 'Hơi thở của Côn Trùng — Phong Nha Chi Vũ: Chân Thập! Nhát đâm tốc độ ánh sáng xuyên thấu điểm yếu! 🦋✨' },
      { form: 'Thức III', name: 'Thanh Đình: Lục Giác', kanji: '蜻蛉ノ舞 複眼六角', color: '#e879f9', quote: 'Hơi thở của Côn Trùng — Thanh Đình Chi Vũ: Phức Nhãn Lục Giác! Sáu mũi công kích tử đằng dồn dập cùng lúc! 🌸⚔️' },
      { form: 'Thức IV', name: 'Ngô Công: Bách Túc', kanji: '蜈蚣ノ舞 百足蛇腹', color: '#a855f7', quote: 'Đừng hòng chạy thoát nhé~ Ngô Công Chi Vũ: Bách Túc Xà Phúc! Xé gió lao vút kết liễu ngay đây! 🦋⚡' }
    ],
    rengoku: [
      { form: 'Thức I', name: 'Bất Tri Hỏa', kanji: '壱ノ型 不知火', color: '#f97316', quote: 'Hơi thở của Lửa — Thức thứ Nhất: Bất Tri Hỏa! Lao tới với tốc độ rực cháy xuyên thủng mọi trở ngại! 🔥⚔️' },
      { form: 'Thức II', name: 'Thăng Viêm Thiên', kanji: '弐ノ型 昇り炎天', color: '#facc15', quote: 'Hơi thở của Lửa — Thức thứ Hai: Thăng Viêm Thiên! Vòng cung rực lửa vút thẳng lên bầu trời! 🔥' },
      { form: 'Thức V', name: 'Viêm Hổ', kanji: '伍ノ型 炎虎', color: '#fb923c', quote: 'Hơi thở của Lửa — Thức thứ Năm: Viêm Hổ! Mãnh hổ liệt hỏa gầm vang xé toạc bóng đêm! 🐯🔥' },
      { form: 'Thức IX', name: 'Luyện Ngục', kanji: '玖ノ型 煉獄', color: '#ef4444', quote: 'Hãy thắp sáng ngọn lửa trong tim!! Bí kỹ tối thượng — Thức thứ Chín: LUYỆN NGỤC!! 🔥🐉' }
    ],
    uzui: [
      { form: 'Thức I', name: 'Oanh', kanji: '壱ノ型 轟', color: '#facc15', quote: 'Hơi thở của Âm Thanh — Thức thứ Nhất: OANH!! Cú bổ song đao nổ vang rền rực rỡ như pháo hoa! 💎💥' },
      { form: 'Thức IV', name: 'Hưởng Trảm Vô Gian', kanji: '肆ノ型 響斬無間', color: '#f472b6', quote: 'Thức thứ Tư: Hưởng Trảm Vô Gian! Xoay song đao kèm chuỗi bom âm thanh cực kỳ hào nhoáng! 🎆⚔️' },
      { form: 'Thức V', name: 'Minh Huyền Tấu', kanji: '伍ノ型 鳴弦奏々', color: '#38bdf8', quote: 'Lên nhạc nào!! Thức thứ Năm: Minh Huyền Tấu! Vũ điệu song đao bùng nổ chói lòa cuốn phăng tất cả! 💎🎶' },
      { form: 'Tuyệt Kỹ', name: 'Phổ Nhạc Hoàn Tất', kanji: '譜面完成！！', color: '#fde047', quote: 'PHỔ NHẠC ĐÃ HOÀN TẤT!! Mọi nhịp điệu đã nằm gọn trong lòng bàn tay — chiến thắng hào nhoáng thôi!! 💎🎆' }
    ],
    muichiro: [
      { form: 'Thức II', name: 'Bát Trùng Hà', kanji: '弐ノ型 八重霞', color: '#5eead4', quote: 'Hơi thở của Sương Mù — Thức thứ Hai: Bát Trùng Hà! Tám tầng kiếm quang nối tiếp nhau nhanh như làn khói! 🌫️⚔️' },
      { form: 'Thức IV', name: 'Di Lưu Trảm', kanji: '肆ノ型 移流斬り', color: '#99f6e4', quote: 'Thức thứ Tư: Di Lưu Trảm... Rút kiếm lướt đi êm như dòng sương trôi không để lại dấu vết. 🌫️' },
      { form: 'Thức V', name: 'Hà Vân Hải', kanji: '伍ノ型 霞雲の海', color: '#2dd4bf', quote: 'Hơi thở của Sương Mù — Thức thứ Năm: Hà Vân Hải! Biển mây bạc hà bao phủ biến hóa khôn lường! ☁️✨' },
      { form: 'Thức VII', name: 'Lông (Mông Lung)', kanji: '漆ノ型 朧', color: '#ccfbf1', quote: 'Thức thứ Bảy: LÔNG... Ẩn hiện giữa màn sương mông lung, một nhát kiếm tĩnh lặng định đoạt tất cả. 🌫️🌙' }
    ],
    mitsuri: [
      { form: 'Thức I', name: 'Sơ Luyến Lịch Đấu', kanji: '壱ノ型 初恋のわななき', color: '#f472b6', quote: 'Kyaa~ Hơi thở của Tình Yêu — Thức thứ Nhất: Sơ Luyến Lịch Đấu! Đường kiếm mềm mại lướt nhanh như nhịp tim! 🌸💖' },
      { form: 'Thức II', name: 'Áo Não Tuần Luyến', kanji: '弐ノ型 懊悩巡る恋', color: '#fb7185', quote: 'Thức thứ Hai: Áo Não Tuần Luyến! Dải lụa kiếm hồng anh đào uốn lượn xoắn ốc cực kỳ uyển chuyển! 🌸⚔️' },
      { form: 'Thức V', name: 'Dao Luyến • Loạn Trảo', kanji: '伍ノ型 揺らめく恋情・乱れ爪', color: '#f9a8d4', quote: 'Thức thứ Năm: Dao Luyến Tình • Loạn Trảo! Nhào lộn giữa không trung tung trăm nhát chém hoa đào! 💖✨' },
      { form: 'Thức VI', name: 'Miêu Túc Luyến Phong', kanji: '陸ノ型 猫足の恋風', color: '#a3e635', quote: 'Thức thứ Sáu: Miêu Túc Luyến Phong~ Cơn gió xuân ngọt ngào quét sạch mọi âu lo cho bạn nè! 🐱🌸' }
    ],
    obanai: [
      { form: 'Thức I', name: 'Ủy Xà Trảm', kanji: '壱ノ型 委蛇斬り', color: '#a855f7', quote: 'Hơi thở của Rắn — Thức thứ Nhất: Ủy Xà Trảm! Đường kiếm lượn sóng luồn qua mọi khe hở phòng ngự! 🐍⚔️' },
      { form: 'Thức II', name: 'Hiệp Đầu Độc Nha', kanji: '弐ノ型 狭頭の毒牙', color: '#34d399', quote: 'Thức thứ Hai: Hiệp Đầu Độc Nha! Vòng ra sau chớp nhoáng tung cú đớp chí mạng chuẩn xác! 🐍✨' },
      { form: 'Thức III', name: 'Nhiễu Xà Lặc', kanji: '参ノ型 塒締め', color: '#c084fc', quote: 'Hơi thở của Rắn — Thức thứ Ba: Nhiễu Xà Lặc! Vòng xoáy kiếm tím–lục siết chặt không lối thoát! 🐍💜' },
      { form: 'Thức V', name: 'Uyển Uyển Trường Xà', kanji: '伍ノ型 蜿蜿長蛇', color: '#6ee7b7', quote: 'Kaburamaru, lên thôi! Thức thứ Năm: Uyển Uyển Trường Xà — Bạch Xà uốn lượn quét sạch mục tiêu! 🐍⚡' }
    ],
    sanemi: [
      { form: 'Thức I', name: 'Trần Toàn Phong • Tước', kanji: '壱ノ型 塵旋風・削ぎ', color: '#22c55e', quote: 'Hơi thở của Gió — Thức thứ Nhất: Trần Toàn Phong • Tước!! Mũi khoan cuồng phong lục bảo nghiền nát tất cả! 🌪️⚔️' },
      { form: 'Thức IV', name: 'Thăng Thượng Sa Trần Lam', kanji: '肆ノ型 昇上砂塵嵐', color: '#4ade80', quote: 'Thức thứ Tư: Thăng Thượng Sa Trần Lam! Bão lốc cuốn vút từ mặt đất hất tung mọi vật cản! 🌪️💥' },
      { form: 'Thức VII', name: 'Kính Phong • Thiên Cẩu', kanji: '漆ノ型 勁風・天狗風', color: '#86efac', quote: 'Bật cao xé gió!! Thức thứ Bảy: Kính Phong • Thiên Cẩu Phong! Lưỡi đao gió sắc lẹm chém tan màn đêm! 🍃⚡' },
      { form: 'Thức VIII', name: 'Sơ Liệt Phong Trảm', kanji: '捌ノ型 初烈風斬り', color: '#16a34a', quote: 'Tránh ra!! Thức thứ Tám: SƠ LIỆT PHONG TRẢM!! Vòng bão kiếm lục bảo chém vụn mọi rắc rối! 🌪️🗡️' }
    ],
    gyomei: [
      { form: 'Thức I', name: 'Xà Văn Nham • Song Cực', kanji: '壱ノ型 蛇紋岩・双極', color: '#f59e0b', quote: 'Nam Mô A Di Đà Phật... Hơi thở của Đá — Thức thứ Nhất: Xà Văn Nham • Song Cực! Chùy và rìu giáng sấm sét! 📿⛰️' },
      { form: 'Thức II', name: 'Thiên Diện Toái', kanji: '弐ノ型 天面砕き', color: '#fbbf24', quote: 'Thức thứ Hai: Thiên Diện Toái! Quả chùy kim cang giáng thẳng từ thiên đỉnh chấn động đại địa! ⛰️💥' },
      { form: 'Thức IV', name: 'Lưu Văn Nham • Tốc Chinh', kanji: '肆ノ型 流紋岩・速征', color: '#fde68a', quote: 'Hơi thở của Đá — Thức thứ Tư: Lưu Văn Nham • Tốc Chinh! Xích sắt vung rền công thủ toàn diện! 📿⚡' },
      { form: 'Thức V', name: 'Ngõa Luân Hình Bộ', kanji: '伍ノ型 瓦輪刑部', color: '#d97706', quote: 'Cầu nguyện cho linh hồn lầm lạc... Thức thứ Năm: NGÕA LUÂN HÌNH BỘ!! Mưa kim cang khuất phục tà ma! 📿🌟' }
    ],
    tanjiro: [
      { form: 'Thủy VIII', name: 'Lang Hồ', kanji: '水の呼吸 捌ノ型 滝壺', color: '#38bdf8', quote: 'Hơi thở của Nước — Thức thứ Tám: Lang Hồ! Thác nước đổ ập từ chín tầng mây cuốn sạch chướng ngại! 🌊⚔️' },
      { form: 'Nhật I', name: 'Hỏa Thần: Viên Vũ', kanji: 'ヒノカミ神楽 円舞', color: '#f97316', quote: 'Hỏa Thần Lạc Vũ: Viên Vũ!! Vòng cung mặt trời rực lửa chém tan bóng tối! ☀️🔥' },
      { form: 'Nhật IV', name: 'Bích La Thiên', kanji: 'ヒノカミ神楽 碧羅の天', color: '#fb923c', quote: 'Hỏa Thần Lạc Vũ: Bích La Thiên! Xoáy lửa thái dương rực sáng giữa bầu trời xanh thẳm! ☀️✨' },
      { form: 'Tuyệt Kỹ', name: 'Nhật Vựng Chi Long', kanji: '日暈の龍・頭舞い', color: '#ef4444', quote: 'Kết hợp Thủy và Nhật!! Hỏa Thần Lạc Vũ: NHẬT VỰNG CHI LONG — ĐẦU VŨ!! 🐉☀️🌊' }
    ],
    nezuko: [
      { form: 'Thức I', name: 'Bộc Huyết Hồng Liên', kanji: '血鬼術 爆血', color: '#fb7185', quote: 'Ưm ưm!! Huyết Quỷ Thuật: BỘC HUYẾT!! Ngọn lửa hồng ấm áp thiêu rụi tà độc nhưng chở che người thương! 🌸🔥' },
      { form: 'Thức II', name: 'Liễu Nha Tuyo Cước', kanji: '紅蓮の蹴撃', color: '#f43f5e', quote: 'Hừm!! Cú đá sấm sét rực lửa hồng anh đào phá tan mọi rào cản trước mặt! 🎋💥' },
      { form: 'Thức III', name: 'Hách Đao Cộng Hưởng', kanji: '爆血・赫刀共鳴', color: '#fda4af', quote: 'Cộng hưởng Bộc Huyết nhuộm đỏ thanh Nhật Luân Kiếm! Sức mạnh hai anh em bùng nổ! 🔥🗡️' },
      { form: 'Thức IV', name: 'Tịnh Hóa Hồng Viêm', kanji: '浄化の紅炎', color: '#f9a8d4', quote: 'Ưm~ ✨ Biển lửa hoa anh đào hồng ngọc thanh tẩy mọi mệt mỏi và tiếp đầy sinh lực! 🌸💖' }
    ],
    zenitsu: [
      { form: 'Thức I', name: 'Phích Lịch Nhất Thiểm', kanji: '壱ノ型 霹靂一閃', color: '#facc15', quote: 'Hơi thở của Sấm Sét — Thức thứ Nhất: Phích Lịch Nhất Thiểm!! Trong chớp mắt tia chớp vàng đã hạ màn! ⚡🗡️' },
      { form: 'Lục Liên', name: 'Nhất Thiểm • Lục Liên', kanji: '霹靂一閃・六連', color: '#fde047', quote: 'Sáu tiếng sấm rền vang xé toạc không gian — Phích Lịch Nhất Thiểm: LỤC LIÊN!! ⚡⚡' },
      { form: 'Thần Tốc', name: 'Nhất Thiểm • Thần Tốc', kanji: '霹靂一閃・神速', color: '#38bdf8', quote: 'Vượt qua cả giới hạn âm thanh!! Phích Lịch Nhất Thiểm — THẦN TỐC!! ⚡💨' },
      { form: 'Thức VII', name: 'Hỏa Lôi Thần', kanji: '漆ノ型 火雷神', color: '#fef08a', quote: 'Thức do chính mình sáng tạo — Thức thứ Bảy: HỎA LÔI THẦN!! Lôi Long kim quang xuyên phá màn đêm!! 🐉⚡' }
    ],
    inosuke: [
      { form: 'Nanh I', name: 'Xuyên Bạt', kanji: '壱ノ牙 穿ち抜き', color: '#60a5fa', quote: 'Hơi thở của Quái Thú — Nanh thứ Nhất: Xuyên Bạt!! Hai thanh kiếm răng cưa đâm xuyên tâm điểm! 🐗⚔️' },
      { form: 'Nanh III', name: 'Thực Liệt', kanji: '参ノ牙 喰い裂き', color: '#93c5fd', quote: 'Haha!! Nanh thứ Ba: Thực Liệt! Chém chéo xé toạc mọi con bug dám ngáng đường Đấng Inosuke! 🐗💥' },
      { form: 'Nanh V', name: 'Cuồng Liệt', kanji: '伍ノ牙 狂い裂き', color: '#38bdf8', quote: 'Tấn công tứ phương tám hướng!! Nanh thứ Năm: Cuồng Liệt! Không một góc khuất nào thoát khỏi song đao! 🐗🌪️' },
      { form: 'Thức VII', name: 'Không Gian Thức Giác', kanji: '漆ノ型 空間識覚', color: '#e2e8f0', quote: 'Hơi thở của Quái Thú — Thức thứ Bảy: Không Gian Thức Giác! Cảm nhận từng luồng gió nhỏ nhất để truy tận ổ lỗi! 🐗✨' }
    ]
  };

  function inferCharKeyFromRaw(rawStr) {
    if (!rawStr) return '';
    const s = String(rawStr).trim().toLowerCase();
    if (MODE_TO_CHAR[s]) return MODE_TO_CHAR[s];
    const keys = Object.keys(CHAR_META);
    for (let i = 0; i < keys.length; i++) {
      if (s.includes(keys[i])) return keys[i];
    }
    if (s.includes('chúa công') || s.includes('kagaya') || s.includes('amane')) return 'ubuyashiki';
    if (s.includes('trùng trụ')) return 'shinobu';
    if (s.includes('thủy trụ')) return 'giyu';
    if (s.includes('viêm trụ') || s.includes('kyojuro')) return 'rengoku';
    if (s.includes('âm trụ') || s.includes('tengen')) return 'uzui';
    if (s.includes('hà trụ') || s.includes('tokito')) return 'muichiro';
    if (s.includes('luyến trụ') || s.includes('kanroji')) return 'mitsuri';
    if (s.includes('xà trụ') || s.includes('iguro')) return 'obanai';
    if (s.includes('phong trụ') || s.includes('shinazugawa')) return 'sanemi';
    if (s.includes('nham trụ') || s.includes('himejima')) return 'gyomei';
    if (s.includes('nhật luân') || s.includes('kamado')) return 'tanjiro';
    if (s.includes('hồng liên')) return 'nezuko';
    if (s.includes('lôi minh') || s.includes('agatsuma')) return 'zenitsu';
    if (s.includes('dã thú') || s.includes('hashibira')) return 'inosuke';
    return '';
  }

  function resolveCharacterMeta(themeCfg, charId) {
    const cfg = themeCfg && typeof themeCfg === 'object' ? themeCfg : {};
    const key =
      inferCharKeyFromRaw(charId) ||
      inferCharKeyFromRaw(cfg.charId || cfg.id) ||
      inferCharKeyFromRaw(cfg.fxMode) ||
      inferCharKeyFromRaw(cfg.sticker) ||
      inferCharKeyFromRaw(cfg.npc && cfg.npc.title) ||
      inferCharKeyFromRaw(cfg.npc && cfg.npc.badgeLabel) ||
      'shinobu';
    const base = CHAR_META[key] || CHAR_META.shinobu;
    return {
      charId: base.charId,
      auraMode: base.auraMode,
      styleTitle: base.styleTitle,
      primary: cfg.primary || base.primary,
      secondary: cfg.secondary || base.secondary,
      borderColor: cfg.borderColor || `rgba(${base.rgb1}, 0.52)`,
      glow: cfg.glow || `rgba(${base.rgb1}, 0.32)`,
      surface: cfg.modalBg || 'rgba(15, 11, 30, 0.96)',
      rgb1: base.rgb1,
      rgb2: base.rgb2
    };
  }

  function stripDuplicateFormPrefix(formStr, nameStr) {
    if (!formStr || !nameStr) return nameStr || '';
    const f = String(formStr).trim();
    const n = String(nameStr).trim();
    if (n.toLowerCase().startsWith((f + ':').toLowerCase())) {
      return n.slice(f.length + 1).trim();
    }
    if (n.toLowerCase().startsWith((f + ' —').toLowerCase()) || n.toLowerCase().startsWith((f + ' -').toLowerCase())) {
      return n.slice(f.length + 2).trim();
    }
    return n;
  }

  function resolveSkillsForChar(charId, meta) {
    const fallbackList = FALLBACK_SKILLS[charId] || FALLBACK_SKILLS.shinobu;
    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    let rawList = null;

    if (ext) {
      try {
        if (typeof ext.getSkillsForCharacter === 'function') {
          rawList = ext.getSkillsForCharacter(charId);
        } else if (typeof ext.getSkills === 'function') {
          rawList = ext.getSkills(charId);
        } else if (typeof ext.getCharacterSkills === 'function') {
          rawList = ext.getCharacterSkills(charId);
        } else if (typeof ext.listSkills === 'function') {
          rawList = ext.listSkills(charId);
        } else if (ext.SKILLS_DB && Array.isArray(ext.SKILLS_DB[charId])) {
          rawList = ext.SKILLS_DB[charId];
        } else if (ext.skills && Array.isArray(ext.skills[charId])) {
          rawList = ext.skills[charId];
        } else if (ext.SKILLS && Array.isArray(ext.SKILLS[charId])) {
          rawList = ext.SKILLS[charId];
        } else if (ext.characters && ext.characters[charId] && Array.isArray(ext.characters[charId].skills)) {
          rawList = ext.characters[charId].skills;
        }
      } catch (_) {
        rawList = null;
      }
    }

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return fallbackList.map((item, idx) => ({
        ...item,
        index: idx,
        charId,
        formNumber: item.form,
        nameVi: `${item.form}: ${item.name}`,
        displayName: item.name,
        voiceLine: item.quote,
        primaryColor: item.color
      }));
    }

    return rawList.slice(0, 4).map((item, idx) => {
      const fb = fallbackList[idx] || fallbackList[0];
      const obj = item && typeof item === 'object' ? item : {};
      const formTag = obj.formNumber || obj.form || obj.formLabel || obj.num || obj.number || obj.badge || fb.form;
      const rawName = obj.nameVi || obj.name || obj.title || obj.label || fb.name;
      const cleanName = stripDuplicateFormPrefix(formTag, rawName) || rawName;
      const primaryColor = obj.primaryColor || obj.color || obj.primary || obj.accentColor || meta.primary || fb.color;
      const secondaryColor = obj.accentColor || obj.secondaryColor || obj.secondary || meta.secondary;
      const quote = obj.voiceLine || obj.quote || obj.line || obj.dialog || obj.battleCry || obj.shout || fb.quote;
      return {
        ...obj,
        index: idx,
        charId,
        form: formTag,
        formNumber: formTag,
        name: cleanName,
        displayName: cleanName,
        nameVi: obj.nameVi || `${formTag}: ${cleanName}`,
        kanji: obj.kanji || obj.jp || obj.jpName || obj.sub || obj.romaji || fb.kanji,
        color: primaryColor,
        primaryColor,
        secondary: secondaryColor,
        quote,
        voiceLine: quote
      };
    });
  }

  /* ==========================================================================
   * SOUND / MUTE SYNC WITH window.__AGY_KNY_SKILLS__ & FALLBACK BLADE SYNTH
   * ========================================================================== */

  function isSfxMuted() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SFX_MUTE_STORAGE_KEY) : null;
      if (raw === '1' || raw === 'true') return true;
      if (typeof window !== 'undefined' && window.__AGY_BIO_AUDIO__) {
        const bio = window.__AGY_BIO_AUDIO__;
        if (typeof bio.isEnabled === 'function' && !bio.isEnabled()) return true;
        if (typeof bio.getPrefs === 'function') {
          const prefs = bio.getPrefs();
          if (prefs && prefs.swordSfxEnabled === false) return true;
        }
      }
      const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
      if (ext && typeof ext.isSoundMuted === 'function') return Boolean(ext.isSoundMuted());
      return false;
    } catch (_) {
      return false;
    }
  }

  function setSfxMuted(muted) {
    const next = Boolean(muted);
    try {
      localStorage.setItem(SFX_MUTE_STORAGE_KEY, next ? '1' : '0');
    } catch (_) {}
    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    if (ext) {
      try {
        if (typeof ext.setSoundMuted === 'function') ext.setSoundMuted(next);
        else if (typeof ext.setMuted === 'function') ext.setMuted(next);
        else if (typeof ext.setSoundEnabled === 'function') ext.setSoundEnabled(!next);
        if ('muted' in ext) ext.muted = next;
        if ('soundEnabled' in ext) ext.soundEnabled = !next;
      } catch (_) {}
    }
    return next;
  }

  let fallbackAudioCtx = null;
  let fallbackSuspendTimer = 0;
  function playFallbackKatanaWhoosh() {
    if (isSfxMuted() || typeof window === 'undefined') return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    try {
      if (!fallbackAudioCtx) fallbackAudioCtx = new AudioCtor();
      if (fallbackAudioCtx.state !== 'running' && fallbackAudioCtx.state !== 'closed' && typeof fallbackAudioCtx.resume === 'function') {
        fallbackAudioCtx.resume().catch(() => {});
      }
      const now = fallbackAudioCtx.currentTime;

      const osc = fallbackAudioCtx.createOscillator();
      const gain = fallbackAudioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(1480, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.28);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.075, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.30);
      osc.connect(gain);
      gain.connect(fallbackAudioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.31);

      clearTimeout(fallbackSuspendTimer);
      fallbackSuspendTimer = setTimeout(() => {
        fallbackSuspendTimer = 0;
        if (fallbackAudioCtx && fallbackAudioCtx.state === 'running' && typeof fallbackAudioCtx.suspend === 'function') {
          try { fallbackAudioCtx.suspend().catch(() => {}); } catch (_) {}
        }
      }, 2500);
    } catch (_) {}
  }

  /* ==========================================================================
   * 14 MINI CANVAS ELEMENTAL BREATHING DRAWERS (162x84, ZERO-GC, 60FPS)
   * ========================================================================== */

  function frac(idx, a, b) {
    return ((idx * a + b) % 997) / 997;
  }

  function drawOrb(ctx, x, y, r, rgb, alpha) {
    if (alpha <= 0.008) return;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.26).toFixed(3)})`;
    ctx.arc(x, y, r * 2.5, 0, TWO_PI);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.fill();
  }

  function drawFourPointStar(ctx, x, y, r, rot, rgb, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.22).toFixed(3)})`;
    ctx.arc(0, 0, r * 2.0, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.6);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.2, r * 1.6, 0);
    ctx.quadraticCurveTo(r * 0.2, r * 0.2, 0, r * 1.6);
    ctx.quadraticCurveTo(-r * 0.2, r * 0.2, -r * 1.6, 0);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.2, 0, -r * 1.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha * 0.85).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawTinyHeart(ctx, x, y, size, rgb, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.65);
    ctx.bezierCurveTo(-size * 1.2, -size * 0.15, -size * 0.65, -size * 1.05, 0, -size * 0.38);
    ctx.bezierCurveTo(size * 0.65, -size * 1.05, size * 1.2, -size * 0.15, 0, size * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTinyButterfly(ctx, x, y, scale, flap, rgbTop, rgbBot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, alpha);
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.scale(s * flap, 1);
      ctx.fillStyle = `rgba(${rgbTop}, 0.88)`;
      ctx.beginPath();
      ctx.moveTo(0, -0.6);
      ctx.bezierCurveTo(3.5, -7.2, 9.5, -6.8, 8.2, -0.8);
      ctx.bezierCurveTo(7.2, 2.0, 3.2, 2.5, 0, 0.8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(${rgbBot}, 0.78)`;
      ctx.beginPath();
      ctx.moveTo(0, 0.8);
      ctx.bezierCurveTo(4.5, 2.5, 6.2, 6.5, 2.8, 6.8);
      ctx.bezierCurveTo(1.1, 6.5, 0.3, 4.0, 0, 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTinyPetal(ctx, x, y, r, rot, flip, rgb, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, 0.3 + 0.7 * Math.abs(Math.cos(flip)));
    ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(-r * 1.2, 0);
    ctx.bezierCurveTo(-r * 0.5, -r * 0.85, r * 0.7, -r * 0.85, r * 1.25, 0);
    ctx.bezierCurveTo(r * 0.7, r * 0.85, -r * 0.5, r * 0.85, -r * 1.2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function createChibiAuraScene(mode, meta) {
    const particles = [];
    for (let i = 0; i < 16; i++) {
      particles.push({
        u: frac(i, 73, 19),
        v: frac(i, 137, 53),
        r: 1.3 + frac(i, 41, 11) * 2.3,
        speed: 0.25 + frac(i, 89, 29) * 0.45,
        phase: frac(i, 193, 7) * TWO_PI,
        side: i % 2 === 0 ? -1 : 1
      });
    }

    function drawAmbientBacklight(ctx, cx, cy, rx, ry, rgb, alpha) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, rx);
      grad.addColorStop(0, `rgba(${rgb}, ${Math.min(0.95, alpha).toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(${rgb}, ${(alpha * 0.42).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    function drawSlashBurst(ctx, surgeProgress, rgb1, rgb2) {
      if (surgeProgress <= 0.01) return;
      const p = surgeProgress; // 1.0 down to 0.0 over 1.8s
      ctx.save();
      ctx.strokeStyle = `rgba(${rgb1}, ${(p * 0.72).toFixed(3)})`;
      ctx.lineWidth = 1.6 + p * 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(108, 48, 30 + (1 - p) * 22, -Math.PI * 0.92, -Math.PI * 0.08);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${rgb2}, ${(p * 0.65).toFixed(3)})`;
      ctx.lineWidth = 1.0 + p * 1.4;
      ctx.beginPath();
      ctx.arc(108, 48, 23 + (1 - p) * 26, -Math.PI * 0.84, -Math.PI * 0.16);
      ctx.stroke();
      ctx.restore();
    }

    function render(ctx, now, dt, surgeBoost, surgeProgress, isStatic) {
      ctx.clearRect(0, 0, AURA_W, AURA_H);
      const t = isStatic ? 1800 : now;
      const boost = surgeBoost || 1;
      const cx = mode === 'royal_wisteria' ? 104 : 109;
      const cy = 46;
      const edgeY = 73.5;

      if (mode === 'water') {
        drawAmbientBacklight(ctx, cx, 48, 44, 30, '56, 189, 248', 0.22 * boost);

        // Shimmering azure water surface right beneath Giyu's hands resting on the frame edge
        const waterGrad = ctx.createLinearGradient(0, edgeY - 3, 0, edgeY + 8);
        waterGrad.addColorStop(0, `rgba(56, 189, 248, ${(0.34 * boost).toFixed(3)})`);
        waterGrad.addColorStop(0.5, `rgba(2, 132, 199, ${(0.22 * boost).toFixed(3)})`);
        waterGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');
        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.moveTo(8, edgeY + 7);
        for (let x = 8; x <= 158; x += 5) {
          const wy = edgeY + Math.sin(x * 0.09 - t * 0.0042) * 1.65 + Math.cos(x * 0.16 + t * 0.0028) * 0.85;
          ctx.lineTo(x, wy);
        }
        ctx.lineTo(158, edgeY + 7);
        ctx.closePath();
        ctx.fill();

        // Crisp ufotable double water crest lines
        for (let layer = 0; layer < 2; layer++) {
          ctx.beginPath();
          ctx.strokeStyle = layer === 0
            ? `rgba(56, 189, 248, ${Math.min(1, 0.78 * boost).toFixed(3)})`
            : `rgba(224, 242, 254, ${Math.min(1, 0.86 * boost).toFixed(3)})`;
          ctx.lineWidth = layer === 0 ? 2.0 : 1.0;
          for (let x = 10; x <= 156; x += 4) {
            const wy = edgeY + (layer * 0.8) +
              Math.sin(x * 0.095 - t * 0.0045 + layer * 1.1) * (1.55 * Math.min(1.45, boost)) +
              Math.sin(x * 0.21 + t * 0.0031) * 0.65;
            if (x === 10) ctx.moveTo(x, wy);
            else ctx.lineTo(x, wy);
          }
          ctx.stroke();
        }

        // Expanding ripples spreading outward to both sides of the chat frame
        for (let rIdx = 0; rIdx < 3; rIdx++) {
          const prog = isStatic ? (0.25 + rIdx * 0.28) : (((t * 0.00048) + rIdx * 0.333) % 1);
          const rx = 16 + prog * 64;
          const ry = 1.6 + prog * 2.2;
          const rAlpha = (1 - prog) * 0.56 * boost;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(125, 211, 252, ${Math.min(1, rAlpha).toFixed(3)})`;
          ctx.lineWidth = 1.05;
          ctx.ellipse(cx - 4, edgeY + 0.6, rx, ry, 0, 0, TWO_PI);
          ctx.stroke();
        }

        // Crystal-clear water bubbles rising gently around Giyu's cheeks & shoulders
        for (let i = 0; i < 12; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.0052 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const bx = 72 + p.u * 72 + Math.sin(t * 0.003 + p.phase) * 3.6;
          const by = 16 + p.v * 55;
          const fade = Math.sin(p.v * Math.PI);
          const alpha = fade * 0.78 * boost;
          if (alpha > 0.04) {
            ctx.beginPath();
            ctx.fillStyle = `rgba(186, 230, 253, ${(alpha * 0.22).toFixed(3)})`;
            ctx.strokeStyle = `rgba(186, 230, 253, ${Math.min(1, alpha).toFixed(3)})`;
            ctx.lineWidth = 0.9;
            ctx.arc(bx, by, p.r, 0, TWO_PI);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha * 0.9).toFixed(3)})`;
            ctx.arc(bx - p.r * 0.34, by - p.r * 0.34, Math.max(0.55, p.r * 0.28), 0, TWO_PI);
            ctx.fill();
          }
        }
      } else if (mode === 'royal_wisteria') {
        // Warm imperial golden halo behind Kagaya & Amane Ubuyashiki
        const pulse = 0.92 + 0.08 * Math.sin(t * 0.0024);
        drawAmbientBacklight(ctx, cx, 44, 48 * pulse, 34 * pulse, '250, 204, 21', 0.30 * boost);
        drawAmbientBacklight(ctx, cx, 40, 36, 26, '232, 121, 249', 0.18 * boost);

        ctx.save();
        ctx.translate(cx, 45);
        ctx.rotate(t * 0.00025);
        ctx.strokeStyle = `rgba(253, 224, 71, ${Math.min(1, 0.56 * boost).toFixed(3)})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(0, 0, 33 * pulse, Math.PI * 0.96, Math.PI * 2.04);
        ctx.stroke();

        ctx.setLineDash([3, 3.5]);
        ctx.strokeStyle = `rgba(254, 240, 138, ${Math.min(1, 0.44 * boost).toFixed(3)})`;
        ctx.lineWidth = 0.95;
        ctx.beginPath();
        ctx.arc(0, 0, 38 * pulse, Math.PI * 0.92, Math.PI * 2.08);
        ctx.stroke();
        ctx.restore();

        // Floating golden lantern orbs & delicate wisteria petals
        for (let i = 0; i < 12; i++) {
          const p = particles[i];
          if (i < 5) {
            if (!isStatic) {
              p.v -= 0.0034 * p.speed * dt * boost;
              if (p.v < 0) p.v = 1;
            }
            const lx = 64 + p.u * 80 + Math.sin(t * 0.0018 + p.phase) * 4.5;
            const ly = 14 + p.v * 56;
            const lAlpha = Math.sin(p.v * Math.PI) * 0.85 * boost;
            drawOrb(ctx, lx, ly, 2.1 + (i % 2) * 0.6, '251, 191, 36', lAlpha);
            ctx.fillStyle = `rgba(254, 249, 195, ${Math.min(1, lAlpha).toFixed(3)})`;
            ctx.fillRect(lx - 1.1, ly - 1.5, 2.2, 3.0);
          } else {
            if (!isStatic) {
              p.v += 0.0038 * p.speed * dt * boost;
              if (p.v > 1) p.v = 0;
            }
            const px = 60 + p.u * 88 + Math.sin(t * 0.0024 + p.phase) * 5;
            const py = 10 + p.v * 62;
            const pAlpha = Math.sin(p.v * Math.PI) * 0.80 * boost;
            drawTinyPetal(ctx, px, py, 2.4, t * 0.002 + p.phase, t * 0.0035 + p.phase, i % 2 ? '232, 121, 249' : '253, 224, 71', pAlpha);
          }
        }
      } else if (mode === 'flame') {
        drawAmbientBacklight(ctx, cx, 50, 44, 30, '249, 115, 22', 0.30 * boost);

        // Blazing orange-gold flame tongues flickering around Rengoku's flame cape shoulders
        for (let i = 0; i < 9; i++) {
          const fx = 73 + i * 9.0;
          const distCenter = Math.abs(i - 4) / 4;
          const baseH = (18 + distCenter * 12) * Math.min(1.45, boost);
          const flick = Math.sin(t * 0.011 + i * 1.35) * 4.5 + Math.cos(t * 0.017 - i * 0.9) * 2.5;
          const topY = 71 - baseH - flick;
          const sway = Math.sin(t * 0.008 + i) * 3.8;

          ctx.beginPath();
          ctx.fillStyle = i % 2 === 0
            ? `rgba(249, 115, 22, ${Math.min(0.95, 0.66 * boost).toFixed(3)})`
            : `rgba(239, 68, 68, ${Math.min(0.95, 0.58 * boost).toFixed(3)})`;
          ctx.moveTo(fx - 5.2, 73);
          ctx.quadraticCurveTo(fx - 4.2 + sway * 0.5, 73 - baseH * 0.55, fx + sway, topY);
          ctx.quadraticCurveTo(fx + 4.2 + sway * 0.5, 73 - baseH * 0.55, fx + 5.2, 73);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.fillStyle = `rgba(253, 224, 71, ${Math.min(1, 0.72 * boost).toFixed(3)})`;
          ctx.moveTo(fx - 2.5, 73);
          ctx.quadraticCurveTo(fx + sway * 0.4, 73 - baseH * 0.45, fx + sway * 0.85, topY + 5.5);
          ctx.quadraticCurveTo(fx + 2.5, 73 - baseH * 0.45, fx + 2.5, 73);
          ctx.closePath();
          ctx.fill();
        }

        // Rising glowing embers
        for (let i = 0; i < 14; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.0085 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const ex = 70 + p.u * 78 + Math.sin(t * 0.005 + p.phase) * 4.2;
          const ey = 10 + p.v * 62;
          const alpha = Math.sin(p.v * Math.PI) * 0.88 * boost;
          drawOrb(ctx, ex, ey, p.r * 0.72, i % 3 === 0 ? '254, 240, 138' : '251, 146, 60', alpha);
        }
      } else if (mode === 'thunder') {
        drawAmbientBacklight(ctx, cx, 40, 42, 28, '250, 204, 21', 0.24 * boost);

        // Crackling yellow & cyan-blue lightning arcs around Zenitsu's blonde hair
        const arcCount = surgeBoost > 1.2 ? 8 : 5;
        for (let a = 0; a < arcCount; a++) {
          const seed = Math.floor(t * 0.022) + a * 31;
          const baseAng = -Math.PI * 0.98 + (a / Math.max(1, arcCount - 1)) * Math.PI * 0.96;
          const rStart = 21 + ((seed * 13) % 7);
          let px = cx + Math.cos(baseAng) * rStart;
          let py = 44 + Math.sin(baseAng) * (rStart * 0.82);

          const isCyan = a % 2 === 1;
          ctx.strokeStyle = isCyan
            ? `rgba(56, 189, 248, ${Math.min(1, 0.85 * boost).toFixed(3)})`
            : `rgba(253, 224, 71, ${Math.min(1, 0.92 * boost).toFixed(3)})`;
          ctx.lineWidth = isCyan ? 1.15 : 1.45;
          ctx.beginPath();
          ctx.moveTo(px, py);

          for (let seg = 1; seg <= 4; seg++) {
            const stepAng = baseAng + (frac(seed + seg, 61, 17) - 0.5) * 0.65;
            const rad = rStart + seg * 4.6 * Math.min(1.35, boost);
            px = cx + Math.cos(stepAng) * rad;
            py = 44 + Math.sin(stepAng) * (rad * 0.82);
            ctx.lineTo(px, py);
          }
          ctx.stroke();

          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.72 * boost).toFixed(3)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }

        for (let i = 0; i < 8; i++) {
          const p = particles[i];
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.012 + p.phase));
          const sx = 72 + p.u * 74;
          const sy = 16 + p.v * 50;
          drawFourPointStar(ctx, sx, sy, 1.5, t * 0.004, i % 2 ? '56, 189, 248' : '254, 240, 138', tw * 0.72 * boost);
        }
      } else if (mode === 'wisteria') {
        drawAmbientBacklight(ctx, cx, 44, 42, 29, '192, 132, 252', 0.25 * boost);

        // Shimmering violet pollen dust
        for (let i = 0; i < 13; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.0036 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const dx = 68 + p.u * 80 + Math.sin(t * 0.0026 + p.phase) * 4.5;
          const dy = 14 + p.v * 56;
          const alpha = Math.sin(p.v * Math.PI) * 0.76 * boost;
          drawOrb(ctx, dx, dy, p.r * 0.68, i % 3 === 0 ? '94, 234, 212' : '232, 121, 249', alpha);
        }

        // Luminous tiny butterflies fluttering around Shinobu's hair ornament
        for (let b = 0; b < 3; b++) {
          const ang = t * 0.0018 + b * 2.1;
          const bx = cx + Math.cos(ang) * (24 + b * 5);
          const by = 28 + Math.sin(ang * 1.4) * 10 + b * 4;
          const flap = 0.28 + 0.72 * Math.abs(Math.sin(t * 0.011 + b));
          drawTinyButterfly(ctx, bx, by, 0.72 + b * 0.08, flap, '216, 180, 254', '94, 234, 212', 0.86 * boost);
        }
      } else if (mode === 'mist') {
        drawAmbientBacklight(ctx, cx, 50, 46, 28, '94, 234, 212', 0.20 * boost);

        // Ethereal mint-silver mist ribbons drifting across Muichiro's wide sleeves
        for (let m = 0; m < 5; m++) {
          const drift = isStatic ? m * 14 : ((t * 0.018 * (m % 2 === 0 ? 1 : -0.8) + m * 28) % 86) - 43;
          const mx = cx - 4 + drift * 0.62;
          const my = 48 + m * 5.2 + Math.sin(t * 0.002 + m) * 2.2;
          const mw = 36 + (m % 3) * 10;
          const mh = 6.5 + (m % 2) * 2.5;

          const mGrad = ctx.createRadialGradient(mx, my, 2, mx, my, mw);
          mGrad.addColorStop(0, `rgba(153, 246, 228, ${Math.min(0.85, 0.34 * boost).toFixed(3)})`);
          mGrad.addColorStop(0.55, `rgba(94, 234, 212, ${Math.min(0.65, 0.18 * boost).toFixed(3)})`);
          mGrad.addColorStop(1, 'rgba(94, 234, 212, 0)');
          ctx.fillStyle = mGrad;
          ctx.beginPath();
          ctx.ellipse(mx, my, mw, mh, 0, 0, TWO_PI);
          ctx.fill();
        }

        // Soft mist dew motes
        for (let i = 0; i < 9; i++) {
          const p = particles[i];
          const mx = 58 + p.u * 92 + Math.sin(t * 0.0017 + p.phase) * 6;
          const my = 32 + p.v * 40;
          const alpha = (0.3 + 0.5 * Math.sin(t * 0.003 + p.phase)) * boost;
          drawOrb(ctx, mx, my, 1.4, '204, 251, 241', alpha);
        }
      } else if (mode === 'love') {
        drawAmbientBacklight(ctx, cx, 46, 44, 30, '244, 114, 182', 0.25 * boost);

        // Ribbon wave behind Mitsuri's braids
        ctx.beginPath();
        ctx.strokeStyle = `rgba(244, 114, 182, ${Math.min(1, 0.58 * boost).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        for (let x = 66; x <= 150; x += 4) {
          const ry = 54 + Math.sin(x * 0.11 - t * 0.005) * 6.5;
          if (x === 66) ctx.moveTo(x, ry);
          else ctx.lineTo(x, ry);
        }
        ctx.stroke();

        // Sakura-pink bubbles & glowing mini hearts floating up both braids (x ~ 76 and x ~ 140)
        for (let i = 0; i < 14; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.005 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const braidCenter = p.side < 0 ? 78 : 139;
          const hx = braidCenter + (p.u - 0.5) * 18 + Math.sin(t * 0.0035 + p.phase) * 3.2;
          const hy = 15 + p.v * 56;
          const alpha = Math.sin(p.v * Math.PI) * 0.85 * boost;
          if (i % 2 === 0) {
            drawTinyHeart(ctx, hx, hy, 2.5 + (i % 3) * 0.6, i % 4 === 0 ? '190, 242, 100' : '251, 113, 133', alpha);
          } else {
            ctx.beginPath();
            ctx.fillStyle = `rgba(249, 168, 212, ${(alpha * 0.30).toFixed(3)})`;
            ctx.strokeStyle = `rgba(244, 114, 182, ${Math.min(1, alpha).toFixed(3)})`;
            ctx.lineWidth = 0.85;
            ctx.arc(hx, hy, p.r * 0.9, 0, TWO_PI);
            ctx.fill();
            ctx.stroke();
          }
        }
      } else if (mode === 'serpent') {
        drawAmbientBacklight(ctx, cx, 46, 42, 28, '168, 85, 247', 0.22 * boost);

        // Sinuous violet-emerald aura coils weaving around Obanai's shoulders where Kaburamaru peeks
        for (let coil = 0; coil < 2; coil++) {
          ctx.beginPath();
          ctx.strokeStyle = coil === 0
            ? `rgba(192, 132, 252, ${Math.min(1, 0.78 * boost).toFixed(3)})`
            : `rgba(52, 211, 153, ${Math.min(1, 0.74 * boost).toFixed(3)})`;
          ctx.lineWidth = coil === 0 ? 2.1 : 1.5;
          ctx.lineCap = 'round';
          for (let s = 0; s <= 24; s++) {
            const u = s / 24;
            const sx = 68 + u * 80;
            const sy = 58 - Math.sin(u * Math.PI) * 24 + Math.sin(u * TWO_PI * 1.6 - t * 0.0055 + coil * Math.PI) * 5.8;
            if (s === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
        }

        for (let i = 0; i < 8; i++) {
          const p = particles[i];
          const u = ((isStatic ? 0.3 : t * 0.00045 * p.speed) + p.u) % 1;
          const sx = 70 + u * 78;
          const sy = 56 - Math.sin(u * Math.PI) * 24 + Math.sin(u * 9 - t * 0.005 + p.phase) * 5;
          drawOrb(ctx, sx, sy, 1.4, i % 2 ? '52, 211, 153' : '216, 180, 254', 0.72 * boost);
        }
      } else if (mode === 'wind') {
        drawAmbientBacklight(ctx, cx, 48, 44, 28, '34, 197, 94', 0.22 * boost);

        // Razor-sharp emerald cyclone rings swirling around Sanemi's shoulders
        for (let g = 0; g < 4; g++) {
          const spin = t * 0.0075 + g * 1.57;
          ctx.save();
          ctx.translate(cx, 50 - g * 3.5);
          ctx.rotate(-0.14 + Math.sin(t * 0.003 + g) * 0.08);
          ctx.strokeStyle = g % 2 === 0
            ? `rgba(74, 222, 128, ${Math.min(1, 0.80 * boost).toFixed(3)})`
            : `rgba(220, 252, 231, ${Math.min(1, 0.72 * boost).toFixed(3)})`;
          ctx.lineWidth = 1.35;
          ctx.beginPath();
          ctx.ellipse(0, 0, 34 + g * 3.5, 9 + g * 1.8, 0, spin, spin + Math.PI * 1.15);
          ctx.stroke();
          ctx.restore();
        }

        for (let i = 0; i < 8; i++) {
          const p = particles[i];
          const ang = t * 0.006 * p.speed + p.phase;
          const wx = cx + Math.cos(ang) * (28 + (i % 3) * 7);
          const wy = 48 + Math.sin(ang) * 12 - (i % 4) * 3;
          drawTinyPetal(ctx, wx, wy, 2.1, ang + 0.8, ang * 2, '134, 239, 172', 0.75 * boost);
        }
      } else if (mode === 'stone') {
        // Solemn vajra amber halo & ascending golden prayer beads behind Gyomei
        const pulse = 0.92 + 0.08 * Math.sin(t * 0.0028);
        drawAmbientBacklight(ctx, cx, 44, 45 * pulse, 32 * pulse, '245, 158, 11', 0.28 * boost);

        ctx.save();
        ctx.translate(cx, 45);
        ctx.rotate(t * 0.00035);
        ctx.strokeStyle = `rgba(251, 191, 36, ${Math.min(1, 0.58 * boost).toFixed(3)})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TWO_PI;
          const r = 32 * pulse;
          const vx = Math.cos(a) * r;
          const vy = Math.sin(a) * r * 0.82;
          if (k === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        for (let i = 0; i < 10; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.004 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const bx = 70 + p.u * 78 + Math.sin(t * 0.002 + p.phase) * 2.2;
          const by = 14 + p.v * 58;
          const alpha = Math.sin(p.v * Math.PI) * 0.86 * boost;
          drawOrb(ctx, bx, by, 2.2, '245, 158, 11', alpha);
          ctx.beginPath();
          ctx.fillStyle = `rgba(254, 243, 199, ${Math.min(1, alpha).toFixed(3)})`;
          ctx.arc(bx - 0.5, by - 0.5, 0.8, 0, TWO_PI);
          ctx.fill();
        }
      } else if (mode === 'sun_water') {
        // Dual elemental aura: Left half Water Breathing azure stream, Right half Hinokami Sun flames
        drawAmbientBacklight(ctx, cx - 16, 48, 30, 26, '56, 189, 248', 0.24 * boost);
        drawAmbientBacklight(ctx, cx + 16, 48, 30, 26, '249, 115, 22', 0.26 * boost);

        // Left half swirling water arcs
        for (let w = 0; w < 2; w++) {
          ctx.beginPath();
          ctx.strokeStyle = w === 0
            ? `rgba(56, 189, 248, ${Math.min(1, 0.84 * boost).toFixed(3)})`
            : `rgba(224, 242, 254, ${Math.min(1, 0.78 * boost).toFixed(3)})`;
          ctx.lineWidth = w === 0 ? 2.2 : 1.1;
          for (let s = 0; s <= 16; s++) {
            const u = s / 16;
            const wx = cx - 4 - Math.sin(u * Math.PI * 0.95) * (34 - w * 3);
            const wy = 72 - u * 48 + Math.sin(u * 8 - t * 0.006) * 2.5;
            if (s === 0) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
          }
          ctx.stroke();
        }

        // Right half blazing Hinokami sun fire arcs
        for (let f = 0; f < 5; f++) {
          const u = f / 4;
          const fx = cx + 8 + u * 30;
          const fh = (18 + (1 - Math.abs(u - 0.45)) * 16) * Math.min(1.4, boost);
          const flick = Math.sin(t * 0.012 + f * 1.4) * 4;
          ctx.beginPath();
          ctx.fillStyle = f % 2 === 0
            ? `rgba(239, 68, 68, ${Math.min(0.95, 0.68 * boost).toFixed(3)})`
            : `rgba(250, 204, 21, ${Math.min(0.95, 0.72 * boost).toFixed(3)})`;
          ctx.moveTo(fx - 4.5, 72);
          ctx.quadraticCurveTo(fx + 3, 72 - fh * 0.5, fx + Math.sin(t * 0.009 + f) * 3.5, 72 - fh - flick);
          ctx.quadraticCurveTo(fx + 5, 72 - fh * 0.45, fx + 4.5, 72);
          ctx.closePath();
          ctx.fill();
        }

        for (let i = 0; i < 12; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.006 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const isSun = i % 2 === 1;
          const px = isSun
            ? cx + 4 + p.u * 38 + Math.sin(t * 0.005 + p.phase) * 3
            : cx - 4 - p.u * 38 + Math.cos(t * 0.004 + p.phase) * 3;
          const py = 14 + p.v * 56;
          const alpha = Math.sin(p.v * Math.PI) * 0.84 * boost;
          drawOrb(ctx, px, py, 1.5, isSun ? '253, 224, 71' : '125, 211, 252', alpha);
        }
      } else if (mode === 'nezuko') {
        drawAmbientBacklight(ctx, cx, 48, 42, 29, '251, 113, 133', 0.26 * boost);

        // Gentle Exploding Blood rose-pink flame wisps flickering softly around Nezuko
        for (let i = 0; i < 12; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.0052 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const fx = 72 + p.u * 74 + Math.sin(t * 0.0038 + p.phase) * 4.2;
          const fy = 16 + p.v * 55;
          const alpha = Math.sin(p.v * Math.PI) * 0.86 * boost;
          const r = (2.2 + (i % 3) * 0.7) * Math.min(1.3, boost);

          ctx.save();
          ctx.translate(fx, fy);
          ctx.fillStyle = `rgba(244, 63, 94, ${(alpha * 0.76).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.7);
          ctx.quadraticCurveTo(r * 1.15, -r * 0.2, 0, r);
          ctx.quadraticCurveTo(-r * 1.15, -r * 0.2, 0, -r * 1.7);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = `rgba(252, 231, 243, ${Math.min(1, alpha * 0.88).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(0, r * 0.12, r * 0.42, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        }
      } else if (mode === 'beast') {
        drawAmbientBacklight(ctx, cx, 48, 40, 26, '96, 165, 250', 0.18 * boost);

        // Playful forest-mist breath puffs snorting gently from both sides of Inosuke's boar mask!
        const breathCycle = (t * 0.00115) % 1;
        for (let side = -1; side <= 1; side += 2) {
          const snoutX = cx + side * 12;
          const snoutY = 49;

          for (let k = 0; k < 4; k++) {
            const prog = isStatic ? (0.2 + k * 0.2) : ((breathCycle + k * 0.25) % 1);
            const px = snoutX + side * (6 + prog * 28 * Math.min(1.35, boost));
            const py = snoutY + prog * 7 - Math.sin(prog * Math.PI) * 4.5 + k * 0.8;
            const pr = 2.6 + prog * 6.2;
            const alpha = Math.sin(prog * Math.PI) * 0.66 * boost;

            ctx.beginPath();
            ctx.fillStyle = `rgba(241, 245, 249, ${Math.min(0.9, alpha).toFixed(3)})`;
            ctx.arc(px, py, pr, 0, TWO_PI);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = `rgba(186, 230, 253, ${(alpha * 0.45).toFixed(3)})`;
            ctx.arc(px + side * 1.5, py - 1.2, pr * 0.65, 0, TWO_PI);
            ctx.fill();
          }
        }

        // Jagged blue beast-fang glints
        for (let j = 0; j < 4; j++) {
          const side = j % 2 === 0 ? -1 : 1;
          const gx = cx + side * (26 + j * 4);
          const gy = 34 + (j % 2) * 12;
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.008 + j));
          drawFourPointStar(ctx, gx, gy, 1.8, 0.4, '147, 197, 253', tw * 0.70 * boost);
        }
      } else if (mode === 'sound') {
        drawAmbientBacklight(ctx, cx, 44, 44, 30, '250, 204, 21', 0.24 * boost);

        // Flashy resonant soundwave rings
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          const prog = isStatic ? 0.45 : (((t * 0.00075) + rIdx * 0.5) % 1);
          ctx.beginPath();
          ctx.strokeStyle = rIdx === 0
            ? `rgba(250, 204, 21, ${((1 - prog) * 0.55 * boost).toFixed(3)})`
            : `rgba(244, 114, 182, ${((1 - prog) * 0.55 * boost).toFixed(3)})`;
          ctx.lineWidth = 1.1;
          ctx.arc(cx, 38, 18 + prog * 28, Math.PI * 0.95, Math.PI * 2.05);
          ctx.stroke();
        }

        // Multi-colored 4-point diamond stars twinkling flamboyantly around Uzui's jeweled headband
        const jewelColors = ['250, 204, 21', '244, 114, 182', '56, 189, 248', '45, 212, 191', '255, 255, 255'];
        for (let i = 0; i < 11; i++) {
          const p = particles[i];
          const sx = 68 + p.u * 82;
          const sy = 13 + p.v * 46;
          const tw = isStatic ? 0.8 : (0.22 + 0.78 * Math.pow(Math.abs(Math.sin(t * 0.0055 * (1 + (i % 3) * 0.35) + p.phase)), 1.4));
          const rot = Math.sin(t * 0.002 + p.phase) * 0.25;
          const starR = (1.8 + (i % 3) * 0.95) * Math.min(1.3, boost);
          drawFourPointStar(ctx, sx, sy, starR, rot, jewelColors[i % jewelColors.length], tw * 0.92 * boost);
        }
      }

      if (surgeProgress > 0.01) {
        drawSlashBurst(ctx, surgeProgress, meta.rgb1, meta.rgb2);
      }
    }

    return { render };
  }

  /* ==========================================================================
   * STYLESHEET INJECTION (AURA, BUBBLE WAVE, ATTACK MOTION, SKILL TRIGGER UI)
   * ========================================================================== */

  function ensureStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      agy-chibi-aura {
        pointer-events: none !important;
        position: absolute !important;
        top: -74px !important;
        right: -4px !important;
        width: 162px !important;
        height: 84px !important;
        z-index: 29 !important;
        overflow: visible !important;
        display: block !important;
        transition: filter 0.24s ease;
      }
      agy-chibi-aura[data-aura-surge="1"] {
        filter: brightness(1.38) saturate(1.22) drop-shadow(0 0 9px var(--agy-aura-surge, rgba(250, 204, 21, 0.72)));
      }
      agy-chibi-aura > canvas {
        width: 162px !important;
        height: 84px !important;
        display: block !important;
        pointer-events: none !important;
      }

      /* Subtle elemental wave accent for Chibi on .agy-user-bubble-frame */
      .agy-user-chibi-aura-wave {
        pointer-events: none !important;
        position: absolute !important;
        top: -8px !important;
        right: 8px !important;
        width: 138px !important;
        height: 14px !important;
        z-index: 24 !important;
        border-radius: 9999px !important;
        background: radial-gradient(ellipse at 65% 65%, var(--agy-bwave-c1, rgba(56, 189, 248, 0.42)) 0%, var(--agy-bwave-c2, rgba(186, 230, 253, 0.18)) 48%, transparent 76%);
        opacity: 0.88;
      }
      .agy-user-chibi-aura-wave::after {
        content: "";
        position: absolute;
        left: 16px;
        right: 8px;
        bottom: 4px;
        height: 2px;
        border-radius: 9999px;
        background: linear-gradient(90deg, transparent 0%, var(--agy-bwave-line, #38bdf8) 38%, #ffffff 66%, transparent 100%);
        opacity: 0.78;
      }
      @media (prefers-reduced-motion: no-preference) {
        body:not([data-agy-fx-paused="1"]) .agy-user-chibi-aura-wave {
          animation: agyBubbleWavePulse 3.4s ease-in-out infinite;
        }
      }
      @keyframes agyBubbleWavePulse {
        0%, 100% { transform: scaleX(0.96) translateY(0); opacity: 0.74; }
        50% { transform: scaleX(1.05) translateY(-1px); opacity: 0.98; }
      }

      /* Hide resting corner peeker Chibi while Full-Body Action Chibi leaps onto the main stage! */
      .surface-composer[data-chibi-out-on-stage="1"]::before,
      .agy-user-bubble-frame[data-chibi-out-on-stage="1"]::before {
        opacity: 0 !important;
        transform: translateY(-18px) scale(0.62) !important;
        transition: opacity 0.08s ease-out, transform 0.11s cubic-bezier(0.22, 1, 0.36, 1) !important;
      }

      /* Elastic spring settle when Full-Body Chibi somersaults back onto the chat frame edge */
      .surface-composer[data-chibi-landing="1"]::before,
      .agy-user-bubble-frame[data-chibi-landing="1"]::before {
        animation: agyChibiSpringLanding 0.38s cubic-bezier(0.22, 1, 0.36, 1) both !important;
      }
      @keyframes agyChibiSpringLanding {
        0% {
          opacity: 0.4;
          transform: translateY(-16px) scale(0.86, 1.14);
          filter: drop-shadow(0 0 14px var(--agy-chibi-atk-c1, #38bdf8)) brightness(1.18);
        }
        42% {
          opacity: 1;
          transform: translateY(3.5px) scale(1.09, 0.89);
          filter: drop-shadow(0 0 10px var(--agy-chibi-atk-c1, #38bdf8));
        }
        72% {
          transform: translateY(-2px) scale(0.97, 1.03);
          filter: drop-shadow(0 0 4px var(--agy-chibi-atk-c1, #38bdf8));
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1, 1);
          filter: drop-shadow(0 0 0 transparent);
        }
      }

      /* Fallback Chibi Attack Motion when full-screen stage is unavailable */
      .surface-composer[data-chibi-attack="1"]::before {
        animation: agyChibiSkillAttack 0.82s cubic-bezier(0.22, 1, 0.36, 1) both !important;
      }
      @keyframes agyChibiSkillAttack {
        0% {
          transform: translateY(0) scale(1) rotate(0deg);
          filter: drop-shadow(0 0 0 transparent);
        }
        18% {
          transform: translateY(4px) scale(1.04, 0.93) rotate(-3deg);
          filter: drop-shadow(0 0 6px var(--agy-chibi-atk-c1, #38bdf8));
        }
        46% {
          transform: translateY(-19px) translateX(-7px) scale(1.14) rotate(-8deg);
          filter: drop-shadow(0 0 13px var(--agy-chibi-atk-c1, #38bdf8)) drop-shadow(0 0 22px var(--agy-chibi-atk-c2, #bae6fd)) brightness(1.14);
        }
        70% {
          transform: translateY(-8px) translateX(9px) scale(1.09) rotate(7deg);
          filter: drop-shadow(0 0 15px var(--agy-chibi-atk-c1, #38bdf8)) drop-shadow(0 0 24px var(--agy-chibi-atk-c2, #bae6fd)) brightness(1.1);
        }
        88% {
          transform: translateY(1.8px) translateX(0) scale(1.02, 0.97) rotate(-1deg);
          filter: drop-shadow(0 0 7px var(--agy-chibi-atk-c1, #38bdf8));
        }
        100% {
          transform: translateY(0) scale(1) rotate(0deg);
          filter: drop-shadow(0 0 0 transparent);
        }
      }

      /* Integrated 4-Form Drawer Header & Items inside #agy-shinobu-npc-wrap */
      .agy-skill-menu-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding-bottom: 5px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.10);
      }
      .agy-skill-menu-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--skill-primary, #e2e8f0);
        letter-spacing: 0.15px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agy-skill-sfx-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 2px 7px;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #f1f5f9;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        flex-shrink: 0;
        transition: background-color 0.14s ease, border-color 0.14s ease;
      }
      .agy-skill-sfx-btn:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: var(--skill-secondary, #5eead4);
      }

      .agy-skill-list {
        display: flex;
        flex-direction: column;
        gap: 4.5px;
      }
      .agy-skill-item-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 7px;
        width: 100%;
        text-align: left;
        padding: 5.5px 8px;
        border-radius: 8.5px;
        background: rgba(255, 255, 255, 0.055);
        border: 1px solid rgba(255, 255, 255, 0.11);
        color: #f8fafc;
        cursor: pointer;
        transition: background-color 0.14s ease, border-color 0.14s ease, transform 0.12s ease;
      }
      .agy-skill-item-btn:hover {
        background: rgba(255, 255, 255, 0.13);
        border-color: var(--item-accent, var(--skill-primary, #c084fc));
        transform: translateX(2px);
      }
      .agy-skill-item-main {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        flex: 1;
      }
      .agy-skill-form-tag {
        padding: 2px 5.5px;
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.10);
        border: 1px solid var(--item-accent, var(--skill-primary, #c084fc));
        color: #ffffff;
        font-size: 9.8px;
        font-weight: 700;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .agy-skill-names {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .agy-skill-vi {
        font-size: 11.4px;
        font-weight: 600;
        color: #f8fafc;
        line-height: 1.24;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agy-skill-kanji {
        font-family: 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP', 'Noto Serif JP', 'Source Han Serif JP', 'IPAPMincho', 'MS PMincho', 'Noto Serif', Georgia, serif;
        font-size: 9.8px;
        color: rgba(226, 232, 240, 0.74);
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agy-skill-go {
        font-size: 11px;
        color: var(--item-accent, var(--skill-secondary, #5eead4));
        opacity: 0.85;
        flex-shrink: 0;
      }

      /* Integrated 4-Form Drawer inside #agy-shinobu-npc-wrap */
      .agy-npc-skill-pill[data-active="1"] {
        background: rgba(255, 255, 255, 0.18) !important;
        border-color: var(--npc-primary, #c084fc) !important;
        box-shadow: 0 0 10px var(--npc-glow, rgba(192, 132, 252, 0.38));
      }
      .agy-npc-skills-drawer {
        display: none;
        flex-direction: column;
        gap: 5px;
        padding-top: 6px;
        margin-top: 2px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }
      .agy-npc-skills-drawer[data-open="1"] {
        display: flex;
      }
    `;
    document.head.appendChild(style);
  }

  /* ==========================================================================
   * RUNTIME STATE & LIFECYCLE MANAGEMENT
   * ========================================================================== */

  const state = {
    // Aura state
    auraComposer: null,
    auraHost: null,
    auraCanvas: null,
    auraCtx: null,
    auraDpr: 1,
    auraMode: '',
    auraCharId: '',
    auraMeta: null,
    auraScene: null,
    auraRaf: 0,
    auraLastNow: 0,
    auraSurgeUntil: 0,
    auraSurgeTotal: 1800,
    auraCleanups: [],
    bubbleObserver: null,
    bubbleSyncRaf: 0,
    attackTimer: 0,

    // Skill UI state
    uiComposer: null,
    uiNpcWrap: null,
    uiCharId: '',
    uiMeta: null,
    uiThemeCfg: null,
    uiOnSkillCast: null,
    uiSkills: [],
    comboIdxByChar: Object.create(null),
    lastFinisherAt: 0,
    dropdownOpen: false,
    npcDrawerOpen: false,
    badgeObserver: null,
    uiCleanups: []
  };

  function isMotionPaused() {
    if (typeof document === 'undefined') return true;
    if (document.hidden) return true;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true;
    }
    try {
      if (localStorage.getItem(FX_PAUSE_STORAGE_KEY) === '1') return true;
    } catch (_) {}
    const rt = typeof window !== 'undefined' ? window.__AGY_SHINOBU_RT__ : null;
    if (rt && rt.fxPaused) return true;
    return false;
  }

  function syncBubbleFrames() {
    if (typeof document === 'undefined' || !state.auraMeta) return;
    const meta = state.auraMeta;
    const paused = isMotionPaused();
    if (document.body) {
      if (paused) document.body.dataset.agyFxPaused = '1';
      else delete document.body.dataset.agyFxPaused;
    }

    document.querySelectorAll('.agy-user-bubble-frame').forEach((frame) => {
      let wave = frame.querySelector(':scope > .agy-user-chibi-aura-wave');
      if (!wave) {
        wave = document.createElement('span');
        wave.className = 'agy-user-chibi-aura-wave';
        wave.setAttribute('aria-hidden', 'true');
        // Never leave element :empty inside .agy-user-bubble-frame (Antigravity hides [&:has(>.agy-user-bubble-frame>:empty)])
        wave.innerHTML = '<i aria-hidden="true"></i>';
        frame.appendChild(wave);
      } else if (wave.children.length === 0) {
        wave.innerHTML = '<i aria-hidden="true"></i>';
      }
      wave.style.setProperty('--agy-bwave-c1', 'rgba(239, 68, 68, 0.48)');
      wave.style.setProperty('--agy-bwave-c2', 'rgba(253, 224, 71, 0.24)');
      wave.style.setProperty('--agy-bwave-line', '#fde047');
    });
  }

  function syncAuraCanvasDpr() {
    if (!state.auraCanvas || !state.auraCtx || typeof window === 'undefined') return;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(nextDpr - (state.auraDpr || 1)) > 0.01) {
      state.auraDpr = nextDpr;
      state.auraCanvas.width = Math.round(AURA_W * nextDpr);
      state.auraCanvas.height = Math.round(AURA_H * nextDpr);
      state.auraCtx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
    }
  }

  function drawStaticAuraFrame() {
    if (!state.auraCtx || !state.auraScene) return;
    syncAuraCanvasDpr();
    state.auraScene.render(state.auraCtx, 1800, 1, 1, 0, true);
  }

  function auraTick(now) {
    if (!state.auraHost || !state.auraCtx || !state.auraScene) {
      state.auraRaf = 0;
      return;
    }
    syncAuraCanvasDpr();
    if (isMotionPaused()) {
      state.auraRaf = 0;
      drawStaticAuraFrame();
      return;
    }

    const dt = state.auraLastNow > 0
      ? Math.max(0.35, Math.min(2.2, (now - state.auraLastNow) / 16.6667))
      : 1.0;
    state.auraLastNow = now;

    let surgeBoost = 1.0;
    let surgeProgress = 0;
    if (state.auraSurgeUntil > now) {
      surgeProgress = Math.max(0, Math.min(1, (state.auraSurgeUntil - now) / state.auraSurgeTotal));
      // Smooth 2.0x surge decaying gracefully over 1.8 seconds
      surgeBoost = 1.0 + Math.pow(surgeProgress, 0.72);
    } else if (state.auraHost.dataset.auraSurge === '1') {
      delete state.auraHost.dataset.auraSurge;
    }

    state.auraScene.render(state.auraCtx, now, dt, surgeBoost, surgeProgress, false);
    state.auraRaf = requestAnimationFrame(auraTick);
  }

  function resumeOrPauseAura() {
    syncBubbleFrames();
    if (!state.auraHost || !state.auraCtx || !state.auraScene) return;
    if (isMotionPaused()) {
      if (state.auraRaf) {
        cancelAnimationFrame(state.auraRaf);
        state.auraRaf = 0;
      }
      drawStaticAuraFrame();
    } else if (!state.auraRaf) {
      state.auraLastNow = 0;
      state.auraRaf = requestAnimationFrame(auraTick);
    }
  }

  function teardownAura() {
    if (state.auraRaf) {
      cancelAnimationFrame(state.auraRaf);
      state.auraRaf = 0;
    }
    if (state.bubbleSyncRaf) {
      cancelAnimationFrame(state.bubbleSyncRaf);
      state.bubbleSyncRaf = 0;
    }
    if (state.attackTimer) {
      clearTimeout(state.attackTimer);
      state.attackTimer = 0;
    }
    if (state.bubbleObserver) {
      state.bubbleObserver.disconnect();
      state.bubbleObserver = null;
    }
    while (state.auraCleanups.length > 0) {
      const fn = state.auraCleanups.pop();
      try { fn(); } catch (_) {}
    }
    if (state.auraComposer) {
      delete state.auraComposer.dataset.chibiAttack;
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('agy-chibi-aura').forEach((el) => el.remove());
      document.querySelectorAll('.agy-user-chibi-aura-wave').forEach((el) => el.remove());
      if (document.body) delete document.body.dataset.agyFxPaused;
    }
    state.auraComposer = null;
    state.auraHost = null;
    state.auraCanvas = null;
    state.auraCtx = null;
    state.auraMode = '';
    state.auraCharId = '';
    state.auraMeta = null;
    state.auraScene = null;
    state.auraSurgeUntil = 0;
  }

  /* ==========================================================================
   * 1. mountChibiAura & playChibiAttackMotion
   * ========================================================================== */

  function mountChibiAura(composerEl, themeCfg, charId) {
    if (typeof document === 'undefined') return null;
    const composer = composerEl || document.querySelector('.surface-composer');
    if (!composer) return null;

    if (themeCfg && themeCfg.isChibiNpc === false) {
      teardownAura();
      return null;
    }

    ensureStyles();
    const meta = resolveCharacterMeta(themeCfg, charId);

    // Preload Full-Body Action Chibi PNG sprite into memory so 1st click leaps with 0ms latency!
    if (typeof window !== 'undefined' && window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.preloadActionSprite === 'function') {
      try {
        const safeAct = safeResolveAsset(themeCfg && themeCfg.actionSticker);
        window.__AGY_KNY_SKILLS__.preloadActionSprite(meta.charId, safeAct);
      } catch (_) {}
    }

    // Idempotent fast-path when tick() re-invokes with identical composer & mode
    if (
      state.auraHost &&
      state.auraHost.parentElement === composer &&
      state.auraMode === meta.auraMode &&
      state.auraCharId === meta.charId
    ) {
      syncBubbleFrames();
      resumeOrPauseAura();
      return state.auraHost;
    }

    teardownAura();

    const host = document.createElement('agy-chibi-aura');
    host.setAttribute('aria-hidden', 'true');
    host.dataset.auraMode = meta.auraMode;
    host.dataset.charId = meta.charId;
    host.style.cssText =
      'pointer-events: none; position: absolute; top: -74px; right: -4px; width: 162px; height: 84px; z-index: 29; overflow: visible;';
    host.style.setProperty('--agy-aura-surge', meta.primary);

    const canvas = document.createElement('canvas');
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    canvas.width = Math.round(AURA_W * dpr);
    canvas.height = Math.round(AURA_H * dpr);
    canvas.style.cssText = 'width: 162px; height: 84px; display: block; pointer-events: none;';
    host.appendChild(canvas);
    composer.appendChild(host);

    const ctx = canvas.getContext('2d');
    if (!ctx) return host;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.auraComposer = composer;
    state.auraHost = host;
    state.auraCanvas = canvas;
    state.auraCtx = ctx;
    state.auraDpr = dpr;
    state.auraMode = meta.auraMode;
    state.auraCharId = meta.charId;
    state.auraMeta = meta;
    state.auraScene = createChibiAuraScene(meta.auraMode, meta);

    const onVis = () => resumeOrPauseAura();
    const onResizeDpr = () => {
      syncAuraCanvasDpr();
      if (isMotionPaused()) drawStaticAuraFrame();
    };
    document.addEventListener('visibilitychange', onVis);
    state.auraCleanups.push(() => document.removeEventListener('visibilitychange', onVis));
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResizeDpr, { passive: true });
      state.auraCleanups.push(() => window.removeEventListener('resize', onResizeDpr));
    }

    const reducedMq = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    if (reducedMq && typeof reducedMq.addEventListener === 'function') {
      reducedMq.addEventListener('change', onVis);
      state.auraCleanups.push(() => reducedMq.removeEventListener('change', onVis));
    }

    const onDocClickCapture = (ev) => {
      const t = ev.target;
      if (t && t.closest && t.closest('[data-npc-act="motion"]')) {
        setTimeout(resumeOrPauseAura, 0);
      }
    };
    document.addEventListener('click', onDocClickCapture, true);
    state.auraCleanups.push(() => document.removeEventListener('click', onDocClickCapture, true));

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onVis);
      state.auraCleanups.push(() => window.removeEventListener('storage', onVis));
    }

    if (typeof MutationObserver !== 'undefined' && document.body) {
      const obsTarget = document.querySelector('[data-main-content-body="true"]') || document.querySelector('.agy-shell') || document.body;
      state.bubbleObserver = new MutationObserver(() => {
        if (state.bubbleSyncRaf) return;
        state.bubbleSyncRaf = requestAnimationFrame(() => {
          state.bubbleSyncRaf = 0;
          syncBubbleFrames();
        });
      });
      state.bubbleObserver.observe(obsTarget, { childList: true, subtree: true });
    }

    syncBubbleFrames();
    resumeOrPauseAura();
    return host;
  }

  function playChibiAttackMotion(composerEl, themeCfg, skillInfo) {
    if (typeof document === 'undefined') return;
    const composer = composerEl || state.auraComposer || document.querySelector('.surface-composer');
    if (!composer) return;

    ensureStyles();
    const meta = resolveCharacterMeta(themeCfg || state.uiThemeCfg, skillInfo && skillInfo.charId ? skillInfo.charId : state.auraCharId);
    const atkColor1 = (skillInfo && (skillInfo.color || skillInfo.primary)) || meta.primary || '#38bdf8';
    const atkColor2 = (skillInfo && skillInfo.secondary) || meta.secondary || '#ffffff';

    composer.style.setProperty('--agy-chibi-atk-c1', atkColor1);
    composer.style.setProperty('--agy-chibi-atk-c2', atkColor2);

    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasStageLeap = Boolean(typeof window !== 'undefined' && window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.castSkill === 'function');
    if (!reduced && !hasStageLeap) {
      delete composer.dataset.chibiAttack;
      // Trigger reflow so rapid consecutive casts replay the 60fps CSS keyframe cleanly
      void composer.offsetWidth;
      composer.dataset.chibiAttack = '1';
      clearTimeout(state.attackTimer);
      state.attackTimer = setTimeout(() => {
        delete composer.dataset.chibiAttack;
      }, 860);
    }

    // Surge <agy-chibi-aura> at 2x intensity for 1.8 seconds
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    state.auraSurgeTotal = 1800;
    state.auraSurgeUntil = now + 1800;
    if (state.auraHost) {
      state.auraHost.style.setProperty('--agy-aura-surge', atkColor1);
      state.auraHost.dataset.auraSurge = '1';
      setTimeout(() => {
        if (state.auraHost && (typeof performance !== 'undefined' ? performance.now() : Date.now()) >= state.auraSurgeUntil) {
          delete state.auraHost.dataset.auraSurge;
        }
      }, 1820);
    }
    resumeOrPauseAura();
  }

  /* ==========================================================================
   * 2. mountSkillTriggerUi (INTEGRATED NPC DRAWER)
   * ========================================================================== */

  function iconMarkup(kind, size, elemHint) {
    const ic = typeof window !== 'undefined' ? window.__AGY_KNY_ICONS__ : null;
    if (ic) {
      if (kind === 'elemental' && typeof ic.getElementalSvg === 'function') {
        return ic.getElementalSvg(elemHint || 'yoriichi', size || 13);
      }
      if (typeof ic.getFuncSvg === 'function') {
        return ic.getFuncSvg(kind, size || 13);
      }
    }
    return '';
  }

  function refreshAllSfxButtons() {
    if (typeof document === 'undefined') return;
    const muted = isSfxMuted();
    const svg = iconMarkup(muted ? 'sfx_off' : 'sfx_on', 12);
    const text = muted ? 'Tắt tiếng' : 'Kiếm âm';
    const title = muted ? 'Bật âm thanh kiếm đạo' : 'Tắt âm thanh kiếm đạo';
    document.querySelectorAll('.agy-skill-sfx-btn').forEach((btn) => {
      btn.innerHTML = `${svg}<span>${text}</span>`;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    });
  }

  function setNpcSkillsDrawerOpen(open) {
    state.npcDrawerOpen = Boolean(open);
    const wrap = state.uiNpcWrap || (typeof document !== 'undefined' ? document.getElementById('agy-shinobu-npc-wrap') : null);
    if (!wrap) return;
    const drawer = wrap.querySelector('.agy-npc-skills-drawer');
    const pill = wrap.querySelector('.agy-npc-skill-pill');
    if (drawer) {
      if (state.npcDrawerOpen) drawer.dataset.open = '1';
      else delete drawer.dataset.open;
    }
    if (pill) {
      if (state.npcDrawerOpen) pill.dataset.active = '1';
      else delete pill.dataset.active;
      pill.setAttribute('aria-expanded', state.npcDrawerOpen ? 'true' : 'false');
    }
  }

  function speakFallbackIntoNpc(line) {
    if (!line || typeof document === 'undefined') return;
    const wrap = state.uiNpcWrap || document.getElementById('agy-shinobu-npc-wrap');
    if (!wrap) return;
    const popover = wrap.querySelector('.agy-npc-popover');
    const badge = wrap.querySelector('.agy-npc-badge');
    const textEl = wrap.querySelector('.agy-npc-dialog-text');
    const rt = typeof window !== 'undefined' ? window.__AGY_SHINOBU_RT__ : null;
    if (rt) {
      rt.npcCollapsed = false;
      if (rt.typeTimer) {
        clearInterval(rt.typeTimer);
        rt.typeTimer = 0;
      }
    }
    if (popover && badge) {
      popover.style.display = 'flex';
      badge.style.display = 'none';
    }
    if (textEl) {
      delete textEl.dataset.typing;
      textEl.textContent = line;
    }
  }

  function executeSkillCast(skillIdx, castOpts) {
    const opts = castOpts && typeof castOpts === 'object' ? castOpts : {};
    const charId = state.uiCharId || state.auraCharId || 'shinobu';
    const meta = state.uiMeta || state.auraMeta || resolveCharacterMeta(state.uiThemeCfg, charId);
    const skills = state.uiSkills && state.uiSkills.length > 0 ? state.uiSkills : resolveSkillsForChar(charId, meta);
    const safeIdx = ((skillIdx % skills.length) + skills.length) % skills.length;
    const skill = skills[safeIdx];

    // Advance sequential combo pointer for next Chibi click or "⚡ Xuất Chiêu" click
    state.comboIdxByChar[charId] = (safeIdx + 1) % skills.length;

    const composer = state.uiComposer || state.auraComposer || (typeof document !== 'undefined' ? document.querySelector('.surface-composer') : null);
    const muted = isSfxMuted();

    // 1. Trigger Full-Body Action Chibi Stage Leap + Breathing VFX + Katana SFX via window.__AGY_KNY_SKILLS__
    let originRect = null;
    try {
      const originNode =
        opts.originEl ||
        (composer && composer.querySelector && composer.querySelector(':scope > .agy-chibi-hitbox')) ||
        state.auraHost ||
        composer;
      if (originNode && typeof originNode.getBoundingClientRect === 'function') {
        originRect = originNode.getBoundingClientRect();
      }
    } catch (_) {}

    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    if (ext && typeof ext.castSkill === 'function') {
      try {
        ext.castSkill(charId, safeIdx, {
          charId,
          auraMode: meta.auraMode,
          skillIndex: safeIdx,
          skill,
          originRect,
          sourceFrameEl: opts.sourceFrameEl || null,
          themeCfg: state.uiThemeCfg,
          actionSticker: safeResolveAsset(state.uiThemeCfg && state.uiThemeCfg.actionSticker),
          composerEl: composer,
          soundEnabled: !muted,
          muted,
          sound: !muted,
          sfx: !muted
        });
      } catch (_) {}
    } else {
      playFallbackKatanaWhoosh();
    }

    // 2. Surge <agy-chibi-aura> at 2x intensity for 1.8s
    playChibiAttackMotion(composer, state.uiThemeCfg, skill);

    // 3. Notify caller quietly (without forcing huge chat popover open over the action stage if user collapsed it)
    if (typeof state.uiOnSkillCast === 'function') {
      try {
        state.uiOnSkillCast(skill, safeIdx, opts);
      } catch (_) {}
    } else if (skill && skill.quote) {
      speakFallbackIntoNpc(skill.quote);
    }

    return skill;
  }

  function castNextComboSkill(castOpts) {
    const charId = state.uiCharId || state.auraCharId || 'shinobu';
    const nextIdx = state.comboIdxByChar[charId] || 0;
    return executeSkillCast(nextIdx, castOpts);
  }

  function buildSkillItemsDom(skills, onPick) {
    const listEl = document.createElement('div');
    listEl.className = 'agy-skill-list';

    skills.forEach((sk, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agy-skill-item-btn';
      btn.style.setProperty('--item-accent', sk.color || '#c084fc');

      const main = document.createElement('div');
      main.className = 'agy-skill-item-main';

      const tag = document.createElement('span');
      tag.className = 'agy-skill-form-tag';
      tag.textContent = sk.form || `Thức ${idx + 1}`;

      const names = document.createElement('div');
      names.className = 'agy-skill-names';

      const vi = document.createElement('span');
      vi.className = 'agy-skill-vi';
      vi.textContent = sk.name;

      const kj = document.createElement('span');
      kj.className = 'agy-skill-kanji';
      kj.setAttribute('lang', 'ja');
      kj.textContent = sk.kanji;

      names.appendChild(vi);
      names.appendChild(kj);
      main.appendChild(tag);
      main.appendChild(names);

      const go = document.createElement('span');
      go.className = 'agy-skill-go';
      go.innerHTML = iconMarkup('nichirin_item', 13) || '⚔️';

      btn.appendChild(main);
      btn.appendChild(go);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onPick(idx);
      });

      listEl.appendChild(btn);
    });

    return listEl;
  }

  function createSfxToggleButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'agy-skill-sfx-btn';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setSfxMuted(!isSfxMuted());
      refreshAllSfxButtons();
    });
    return btn;
  }

  function teardownSkillUi() {
    if (state.badgeObserver) {
      state.badgeObserver.disconnect();
      state.badgeObserver = null;
    }
    while (state.uiCleanups.length > 0) {
      const fn = state.uiCleanups.pop();
      try { fn(); } catch (_) {}
    }
    if (state.uiComposer) {
      delete state.uiComposer.dataset.agySkillbar;
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll(`#${SKILL_BAR_ID}`).forEach((el) => el.remove());
      document.querySelectorAll('.agy-npc-skill-pill').forEach((el) => el.remove());
      document.querySelectorAll('.agy-npc-skills-drawer').forEach((el) => el.remove());
    }
    state.uiComposer = null;
    state.uiNpcWrap = null;
    state.uiCharId = '';
    state.uiMeta = null;
    state.uiThemeCfg = null;
    state.uiOnSkillCast = null;
    state.uiSkills = [];
    state.dropdownOpen = false;
    state.npcDrawerOpen = false;
  }

  function mountSkillTriggerUi(composerEl, npcWrapEl, themeCfg, charId, onSkillCast) {
    if (typeof document === 'undefined') return null;
    const composer = composerEl || document.querySelector('.surface-composer');
    if (!composer) return null;

    if (themeCfg && themeCfg.isChibiNpc === false) {
      teardownSkillUi();
      return null;
    }

    ensureStyles();
    const npcWrap = npcWrapEl || document.getElementById('agy-shinobu-npc-wrap');
    const meta = resolveCharacterMeta(themeCfg, charId);
    const skills = resolveSkillsForChar(meta.charId, meta);

    state.uiThemeCfg = themeCfg || state.uiThemeCfg;
    if (typeof onSkillCast === 'function') {
      state.uiOnSkillCast = onSkillCast;
    }
    state.uiSkills = skills;

    const existingBar = document.getElementById(SKILL_BAR_ID);
    if (existingBar) existingBar.remove();
    const existingNpcPill = npcWrap ? npcWrap.querySelector('.agy-npc-skill-pill') : null;
    const uiMatches = Boolean(
      state.uiComposer === composer &&
      state.uiCharId === meta.charId &&
      (!npcWrap || existingNpcPill)
    );

    if (uiMatches) {
      state.uiNpcWrap = npcWrap;
      refreshAllSfxButtons();
      return null;
    }

    teardownSkillUi();

    state.uiComposer = composer;
    state.uiNpcWrap = npcWrap;
    state.uiCharId = meta.charId;
    state.uiMeta = meta;
    state.uiThemeCfg = themeCfg || null;
    state.uiOnSkillCast = typeof onSkillCast === 'function' ? onSkillCast : null;
    state.uiSkills = skills;

    // Floating "Hơi Thở ▾" & "Xuất Chiêu" pill bar intentionally omitted:
    // Clicking the Chibi directly triggers castNextComboSkill() cleanly without button clutter.

    // Integrated "⚔️ Các Thức" Pill & Expandable 4-Form Drawer inside #agy-shinobu-npc-wrap (only when NPC dialog is expanded)
    if (npcWrap) {
      const pillsRow = npcWrap.querySelector('.agy-npc-pills');
      const popover = npcWrap.querySelector('.agy-npc-popover');
      const chatRow = npcWrap.querySelector('.agy-npc-chat-row');

      if (pillsRow && popover) {
        const npcSkillPill = document.createElement('button');
        npcSkillPill.type = 'button';
        npcSkillPill.className = 'agy-npc-pill agy-npc-skill-pill';
        npcSkillPill.dataset.npcAct = 'skills-toggle';
        npcSkillPill.setAttribute('aria-expanded', 'false');
        npcSkillPill.innerHTML = `${iconMarkup('breathing_forms', 12)}<span>Các Thức</span>`;

        const chatOpenBtn = pillsRow.querySelector('[data-npc-act="chat-open"]');
        if (chatOpenBtn) {
          pillsRow.insertBefore(npcSkillPill, chatOpenBtn);
        } else {
          pillsRow.appendChild(npcSkillPill);
        }

        const drawer = document.createElement('div');
        drawer.className = 'agy-npc-skills-drawer';
        drawer.style.setProperty('--skill-primary', meta.primary);
        drawer.style.setProperty('--skill-secondary', meta.secondary);

        const drawerHdr = document.createElement('div');
        drawerHdr.className = 'agy-skill-menu-hdr';
        const drawerTitle = document.createElement('span');
        drawerTitle.className = 'agy-skill-menu-title';
        drawerTitle.textContent = meta.styleTitle;
        drawerHdr.appendChild(drawerTitle);
        drawerHdr.appendChild(createSfxToggleButton());

        drawer.appendChild(drawerHdr);
        drawer.appendChild(buildSkillItemsDom(skills, (idx) => executeSkillCast(idx)));

        if (chatRow && chatRow.parentElement === popover) {
          popover.insertBefore(drawer, chatRow);
        } else {
          popover.appendChild(drawer);
        }

        npcSkillPill.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const freshSkills = resolveSkillsForChar(meta.charId, meta);
          state.uiSkills = freshSkills;
          const oldList = drawer.querySelector('.agy-skill-list');
          if (oldList) oldList.replaceWith(buildSkillItemsDom(freshSkills, (idx) => executeSkillCast(idx)));
          setNpcSkillsDrawerOpen(!state.npcDrawerOpen);
        });
      }
    }

    refreshAllSfxButtons();
    return null;
  }

  /* ==========================================================================
   * FULL TEARDOWN & PUBLIC API
   * ========================================================================== */

  /**
   * Safe public finisher trigger (with minimum 12s cooldown) for Crisis-to-Slash & Cinema Director.
   * Unleashes either the active Hashira's Ultimate Form or First Swordsman Yoriichi's Sun Breathing.
   */
  function triggerFinisher(rawOpts) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    const now = Date.now();
    if (now - state.lastFinisherAt < FINISHER_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        cooldownRemainingMs: FINISHER_COOLDOWN_MS - (now - state.lastFinisherAt)
      };
    }
    state.lastFinisherAt = now;

    const requestedHero = typeof opts.charId === 'string' ? opts.charId.trim().toLowerCase() : '';
    const hostHero = state.uiCharId || state.auraCharId || '';
    const useYoriichi =
      requestedHero === 'yoriichi' ||
      Boolean(opts.preferYoriichi) ||
      (!requestedHero && !hostHero);

    if (useYoriichi) {
      const hud = typeof window !== 'undefined' ? window.__AGY_TOKEN_HUD__ : null;
      if (hud && typeof hud.castYoriichiSunBreathing === 'function' && typeof opts.skillIndex !== 'number') {
        const crestBtn = typeof document !== 'undefined' ? document.querySelector('.agy-yoriichi-crest-btn') : null;
        hud.castYoriichiSunBreathing(opts.originEl || crestBtn || null);
        return { ok: true, charId: 'yoriichi', mode: 'sun_crest' };
      }
      const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
      if (ext && typeof ext.castSkill === 'function') {
        const muted = isSfxMuted();
        const fIdx = typeof opts.skillIndex === 'number' ? ((opts.skillIndex % 4) + 4) % 4 : 3;
        const crestBtn = typeof document !== 'undefined' ? document.querySelector('.agy-yoriichi-crest-btn') : null;
        const originNode = opts.originEl || crestBtn || null;
        const originRect = originNode && typeof originNode.getBoundingClientRect === 'function'
          ? originNode.getBoundingClientRect()
          : null;
        ext.castSkill('yoriichi', fIdx, {
          charId: 'yoriichi',
          originRect,
          actionSticker: safeResolveAsset('assets/yoriichi_action.png'),
          composerEl: null,
          soundEnabled: !muted
        });
        return { ok: true, charId: 'yoriichi', skillIndex: fIdx };
      }
      playFallbackKatanaWhoosh();
      return { ok: true, charId: 'yoriichi', fallback: true };
    }

    if (requestedHero && requestedHero !== hostHero) {
      const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
      if (ext && typeof ext.castSkill === 'function') {
        const muted = isSfxMuted();
        const fIdx = typeof opts.skillIndex === 'number' ? ((opts.skillIndex % 4) + 4) % 4 : 3;
        const originRect = opts.originEl && typeof opts.originEl.getBoundingClientRect === 'function'
          ? opts.originEl.getBoundingClientRect()
          : null;
        ext.castSkill(requestedHero, fIdx, {
          charId: requestedHero,
          originRect,
          actionSticker: safeResolveAsset(`assets/${requestedHero.replace(/[^a-z0-9_]/g, '')}_action.png`),
          composerEl: null,
          soundEnabled: !muted
        });
        return { ok: true, charId: requestedHero, skillIndex: fIdx };
      }
    }

    const finIdx = typeof opts.skillIndex === 'number' ? opts.skillIndex : 3;
    const castSkillObj = executeSkillCast(finIdx, {
      fromFinisher: true,
      originEl: opts.originEl || null
    });
    return { ok: true, charId: hostHero || 'shinobu', skill: castSkillObj };
  }

  function teardown() {
    teardownAura();
    teardownSkillUi();
    clearTimeout(fallbackSuspendTimer);
    fallbackSuspendTimer = 0;
    if (fallbackAudioCtx) {
      try {
        const p = fallbackAudioCtx.close();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
      fallbackAudioCtx = null;
    }
    if (typeof document !== 'undefined') {
      const st = document.getElementById(STYLE_ID);
      if (st) st.remove();
    }
  }

  const api = {
    mountChibiAura,
    playChibiAttackMotion,
    mountSkillTriggerUi,
    teardown,
    destroy: teardown,
    teardownAura,
    teardownSkillUi,
    castNextComboSkill,
    castSkillByIndex: executeSkillCast,
    triggerFinisher,
    resolveCharacterMeta,
    resumeOrPauseAura,
    isSfxMuted,
    setSfxMuted
  };

  if (typeof window !== 'undefined') {
    window.__AGY_KNY_CHIBI_AURA__ = api;
    window.__AGY_TRIGGER_FINISHER__ = triggerFinisher;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__AGY_KNY_CHIBI_AURA__ = api;
    globalThis.__AGY_TRIGGER_FINISHER__ = triggerFinisher;
  }
})();
