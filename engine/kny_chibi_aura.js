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
   *       the composer Chibi with 16 bespoke character elemental animations at 60fps zero-GC.
   *     - Adds subtle elemental wave accents beneath Chibi stickers on .agy-user-bubble-frame.
   *     - Auto-pauses when document.hidden, prefers-reduced-motion: reduce, or agy_fx_paused_v1 === '1'.
   *  2. playChibiAttackMotion(composerEl, themeCfg, skillInfo)
   *     - Smooth 60fps CSS transform & drop-shadow attack choreography on .surface-composer::before
   *       plus a 1.8s 2x luminance/particle surge on <agy-chibi-aura>.
   *  3. mountSkillTriggerUi(composerEl, npcWrapEl, themeCfg, charId, onSkillCast)
   *     - Integrated "⚔️ Các Thức" pill & expandable 4-Form drawer inside #agy-shinobu-npc-wrap
   *       (direct Chibi click casts sequential Breathing Forms without floating bar clutter).
   *  4. teardown()
   *     - Cleanly removes all injected DOM nodes, styles, observers, timers, and RAF loops.
   */

  const TWO_PI = Math.PI * 2;
  const AURA_W = 162;
  const AURA_H = 84;
  const CHIBI_3D_W = 136;
  const CHIBI_3D_H = 112;
  const LIVE2D_W = 188;
  const LIVE2D_H = 124;
  const LIVE2D_TOP = -106;
  const LIVE2D_RIGHT = -10;
  const CHIBI_3D_STORAGE_KEY = 'agy_chibi_3d_v1';
  const CHIBI_2D_LIVE_STORAGE_KEY = 'agy_chibi_2d_live_v1';
  const STYLE_ID = 'antigravity-kny-chibi-aura-style';
  const SKILL_BAR_ID = 'agy-chibi-skill-bar';
  const SFX_MUTE_STORAGE_KEY = 'agy_kny_sfx_muted';
  const FX_PAUSE_STORAGE_KEY = 'agy_fx_paused_v1';
  const FINISHER_COOLDOWN_MS = 12000;

  function getChibi3dApi() {
    if (typeof window === 'undefined') return null;
    return window.__AGY_KNY_CHIBI_3D__ || (window.__AGY_KNY_3D_VFX__ && window.__AGY_KNY_3D_VFX__.chibi3d) || null;
  }

  function isChibi3dExplicitlyEnabled(themeCfg) {
    if (!getChibi3dApi()) return false;
    if (themeCfg && themeCfg.isChibiNpc === false) return false;
    if (themeCfg && themeCfg.isMultiversePreset) return false;
    if (themeCfg && themeCfg.chibi3dEnabled === false) return false;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(CHIBI_3D_STORAGE_KEY) === 'false') {
        return false;
      }
    } catch (_) {}
    return true;
  }

  function isChibi3dActiveForConfig(themeCfg, charId) {
    if (!isChibi3dExplicitlyEnabled(themeCfg)) return false;
    if (themeCfg && themeCfg.allowProcedural3d === true) return true;
    const c3d = getChibi3dApi();
    if (!c3d || typeof c3d.hasRealGlbModel !== 'function') return false;
    const cid = charId || (themeCfg && (themeCfg.fxMode || themeCfg.charId)) || 'shinobu';
    return Boolean(c3d.hasRealGlbModel(cid));
  }

  function isChibi2dLiveEnabled(themeCfg) {
    if (themeCfg && themeCfg.isChibiNpc === false) return false;
    if (themeCfg && themeCfg.isMultiversePreset) return false;
    if (themeCfg && typeof themeCfg.chibi2dLive === 'boolean') return themeCfg.chibi2dLive;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(CHIBI_2D_LIVE_STORAGE_KEY) === 'false') {
        return false;
      }
    } catch (_) {}
    return true;
  }

  function setChibi2dLiveEnabled(enabled) {
    const next = Boolean(enabled);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CHIBI_2D_LIVE_STORAGE_KEY, String(next));
      }
    } catch (_) {}
    if (next && typeof window !== 'undefined' && window.__AGY_SHINOBU_RT__ && window.__AGY_SHINOBU_RT__.fxPaused) {
      try {
        if (typeof window.__AGY_SHINOBU_RT__.toggleFxPause === 'function') {
          window.__AGY_SHINOBU_RT__.toggleFxPause();
        } else {
          window.__AGY_SHINOBU_RT__.fxPaused = false;
          if (typeof localStorage !== 'undefined') localStorage.setItem(FX_PAUSE_STORAGE_KEY, '0');
        }
        const mBtn = typeof document !== 'undefined' ? document.querySelector('#agy-shinobu-npc-wrap [data-npc-act="motion"]') : null;
        if (mBtn) {
          mBtn.textContent = '⏸';
          mBtn.title = 'Tạm dừng hiệu ứng nền';
          mBtn.setAttribute('aria-label', 'Tạm dừng hiệu ứng nền');
        }
      } catch (_) {}
    }
    if (state.themeCfg && typeof state.themeCfg === 'object') {
      state.themeCfg = { ...state.themeCfg, chibi2dLive: next };
    }
    if (state.uiThemeCfg && typeof state.uiThemeCfg === 'object') {
      state.uiThemeCfg = { ...state.uiThemeCfg, chibi2dLive: next };
    }
    const comp = state.auraComposer || state.uiComposer || (typeof document !== 'undefined' ? document.querySelector('.surface-composer') : null);
    const cid = state.auraCharId || state.uiCharId || 'shinobu';
    if (typeof window !== 'undefined' && typeof window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__ === 'function') {
      try {
        window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__({ chibi2dLive: next });
      } catch (_) {}
    }
    if (comp && state.live2dActive !== Boolean(!state.chibi3dActive && next)) {
      mountChibiAura(comp, state.themeCfg || state.uiThemeCfg, cid);
    }
    return next;
  }

  function safeResolveAsset(val) {
    if (!val || typeof val !== 'string') return '';
    if (typeof __AGY_SEC__ !== 'undefined' && __AGY_SEC__) {
      return __AGY_SEC__.resolveAssetUrl(val) || __AGY_SEC__.sanitizeCssUrl(val);
    }
    return val;
  }

  /* ==========================================================================
   * CHARACTER & AURA MODE RESOLUTION + 60 BREATHING FORMS FALLBACK CATALOG
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
    },
    yoriichi: {
      charId: 'yoriichi',
      auraMode: 'sun',
      styleTitle: 'Nhật Chi Hô Hấp • 日の呼吸',
      primary: '#ef4444',
      secondary: '#fde047',
      rgb1: '239, 68, 68',
      rgb2: '253, 224, 71'
    },
    moon: {
      charId: 'obanai',
      auraMode: 'moon',
      styleTitle: 'Hơi Thở Của Rắn (Nguyệt Ảnh) • 蛇の呼吸',
      primary: '#a855f7',
      secondary: '#38bdf8',
      rgb1: '168, 85, 247',
      rgb2: '56, 189, 248'
    }
  };

  const MODE_TO_CHAR = {
    royal_wisteria: 'ubuyashiki',
    wisteria_royal: 'ubuyashiki',
    ubuyashiki: 'ubuyashiki',
    wisteria: 'shinobu',
    insect: 'shinobu',
    shinobu: 'shinobu',
    kanao: 'shinobu',
    water: 'giyu',
    giyu: 'giyu',
    flame: 'rengoku',
    fire: 'rengoku',
    rengoku: 'rengoku',
    akaza: 'rengoku',
    sound: 'uzui',
    tengen: 'uzui',
    uzui: 'uzui',
    mist: 'muichiro',
    muichiro: 'muichiro',
    six_eyes: 'muichiro',
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
    tanjiro: 'tanjiro',
    sun: 'yoriichi',
    solar: 'yoriichi',
    sun_origin: 'yoriichi',
    yoriichi: 'yoriichi',
    tsugikuni: 'yoriichi',
    great_sage: 'yoriichi',
    moon: 'moon',
    shadow: 'moon',
    shadow_monarch: 'moon',
    kokushibo: 'moon',
    nezuko: 'nezuko',
    blood_blossom: 'nezuko',
    exploding_blood: 'nezuko',
    muzan: 'nezuko',
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
      { form: 'Thức III', name: 'Nhiễu Xà Chắt Thắt', kanji: '参ノ型 塒締め', color: '#c084fc', quote: 'Hơi thở của Rắn — Thức thứ Ba: Nhiễu Xà Chắt Thắt! Vòng xoáy kiếm tím–lục siết chặt không lối thoát! 🐍💜' },
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
    ],
    yoriichi: [
      { form: 'Nhất Thức', name: 'Viên Vũ Nhất Thiểm', kanji: '日の呼吸 円舞一閃', color: '#ef4444', quote: 'Nhật Chi Hô Hấp: Viên Vũ Nhất Thiểm! Một đường thái dương khép vòng hoàn mỹ định đoạt tất cả! ☀️🗡️' },
      { form: 'Lục Thức', name: 'Chước Cốt Viêm Dương', kanji: '日の呼吸 灼骨炎陽', color: '#f97316', quote: 'Hách Đao rực đỏ thiêu rụi mọi tà chướng trong chớp mắt — Chước Cốt Viêm Dương! 🔥☀️' },
      { form: 'Thập Nhất', name: 'Nhật Vựng Chi Long', kanji: '日暈の龍・頭舞い', color: '#fde047', quote: 'Thái Dương Chi Long uốn lượn khai sáng vạn vật!! 🐉☀️' },
      { form: 'Bí Kỹ', name: 'Thập Tam Thức Khởi Nguyên', kanji: '日の呼吸 拾参ノ型', color: '#facc15', quote: 'Mười hai thức nối liền thành vòng Thái Dương vĩnh hằng — Thập Tam Thức!! ☀️⚡' }
    ]
  };
  FALLBACK_SKILLS.moon = FALLBACK_SKILLS.obanai;

  const EXPLICIT_HERO_KEYS = [
    'yoriichi',
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

  function inferCharKeyFromRaw(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') return '';
    const trimmed = rawStr.trim();
    if (!trimmed || /^data:/i.test(trimmed)) return '';
    const s = trimmed.toLowerCase();
    if (MODE_TO_CHAR[s]) return MODE_TO_CHAR[s];
    for (let i = 0; i < EXPLICIT_HERO_KEYS.length; i++) {
      if (s.includes(EXPLICIT_HERO_KEYS[i])) return EXPLICIT_HERO_KEYS[i];
    }
    if (/(?:^|[^a-z0-9])(moon|shadow_monarch|kokushibo)(?:$|[^a-z0-9])/.test(s)) return 'moon';
    if (/(?:^|[^a-z0-9])(sun_origin|solar|great_sage|tsugikuni)(?:$|[^a-z0-9])/.test(s)) return 'yoriichi';
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
    if (s.includes('khai tổ') || s.includes('hỏa thần khởi nguyên')) return 'yoriichi';
    if (s.includes('nguyệt') || s.includes('bóng tối')) return 'moon';
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
      inferCharKeyFromRaw(cfg.sticker) ||
      inferCharKeyFromRaw(cfg.actionSticker) ||
      inferCharKeyFromRaw(cfg.fxMode) ||
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
    const canonicalCharId = (CHAR_META[charId] && CHAR_META[charId].charId) || charId;
    const fallbackList = FALLBACK_SKILLS[canonicalCharId] || FALLBACK_SKILLS.shinobu;
    const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
    let rawList = null;

    if (ext) {
      try {
        if (typeof ext.getSkillsForCharacter === 'function') {
          rawList = ext.getSkillsForCharacter(canonicalCharId);
        } else if (typeof ext.getSkills === 'function') {
          rawList = ext.getSkills(canonicalCharId);
        } else if (typeof ext.getCharacterSkills === 'function') {
          rawList = ext.getCharacterSkills(canonicalCharId);
        } else if (typeof ext.listSkills === 'function') {
          rawList = ext.listSkills(canonicalCharId);
        } else if (ext.SKILLS_DB && Array.isArray(ext.SKILLS_DB[canonicalCharId])) {
          rawList = ext.SKILLS_DB[canonicalCharId];
        } else if (ext.skills && Array.isArray(ext.skills[canonicalCharId])) {
          rawList = ext.skills[canonicalCharId];
        } else if (ext.SKILLS && Array.isArray(ext.SKILLS[canonicalCharId])) {
          rawList = ext.SKILLS[canonicalCharId];
        } else if (ext.characters && ext.characters[canonicalCharId] && Array.isArray(ext.characters[canonicalCharId].skills)) {
          rawList = ext.characters[canonicalCharId].skills;
        }
      } catch (_) {
        rawList = null;
      }
    }

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return fallbackList.map((item, idx) => ({
        ...item,
        index: idx,
        charId: canonicalCharId,
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
        charId: canonicalCharId,
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
    const bio = typeof window !== 'undefined' ? window.__AGY_BIO_AUDIO__ : null;
    if (bio && typeof bio.setSwordSfxEnabled === 'function') {
      try { bio.setSwordSfxEnabled(!next); } catch (_) {}
    }
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
  function canActivateFallbackAudio() {
    if (typeof window !== 'undefined' && window.__AGY_AUDIO_UNLOCKED__) return true;
    if (typeof navigator !== 'undefined' && navigator && navigator.userActivation) {
      return Boolean(navigator.userActivation.hasBeenActive || navigator.userActivation.isActive);
    }
    return false;
  }

  function playFallbackKatanaWhoosh() {
    if (isSfxMuted() || typeof window === 'undefined' || !canActivateFallbackAudio()) return false;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    try {
      if (!fallbackAudioCtx || fallbackAudioCtx.state === 'closed') {
        fallbackAudioCtx = new AudioCtor();
      }
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
   * 16 MINI CANVAS ELEMENTAL BREATHING DRAWERS (162x84, ZERO-GC, 60FPS)
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
      } else if (mode === 'sun') {
        // Primordial Sun Breathing crimson-gold solar halo & ascending solar embers (Yoriichi / Sun themes)
        const pulse = 0.92 + 0.08 * Math.sin(t * 0.0032);
        drawAmbientBacklight(ctx, cx, 44, 47 * pulse, 33 * pulse, '239, 68, 68', 0.30 * boost);
        drawAmbientBacklight(ctx, cx, 42, 34 * pulse, 24 * pulse, '253, 224, 71', 0.24 * boost);

        ctx.save();
        ctx.translate(cx, 44);
        ctx.rotate(t * 0.00042);
        ctx.strokeStyle = `rgba(253, 224, 71, ${Math.min(1, 0.72 * boost).toFixed(3)})`;
        ctx.lineWidth = 1.45;
        ctx.beginPath();
        ctx.arc(0, 0, 32 * pulse, Math.PI * 0.94, Math.PI * 2.06);
        ctx.stroke();

        ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(1, 0.58 * boost).toFixed(3)})`;
        ctx.lineWidth = 1.0;
        for (let r = 0; r < 7; r++) {
          const a = Math.PI * (1.02 + (r / 6) * 0.96);
          const r1 = 33 * pulse;
          const r2 = (38 + (r % 2) * 3.5) * pulse;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.85);
          ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2 * 0.85);
          ctx.stroke();
        }
        ctx.restore();

        for (let i = 0; i < 14; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.0068 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const sx = 66 + p.u * 84 + Math.sin(t * 0.0042 + p.phase) * 3.8;
          const sy = 12 + p.v * 58;
          const alpha = Math.sin(p.v * Math.PI) * 0.88 * boost;
          const rgb = i % 3 === 0 ? '254, 240, 138' : (i % 3 === 1 ? '249, 115, 22' : '239, 68, 68');
          drawOrb(ctx, sx, sy, p.r * 0.75, rgb, alpha);
        }
      } else if (mode === 'moon') {
        // Abyssal violet-cyan Moon / Shadow Monarch halo & drifting crescent shards
        const pulse = 0.93 + 0.07 * Math.sin(t * 0.0025);
        drawAmbientBacklight(ctx, cx, 44, 46 * pulse, 31 * pulse, '168, 85, 247', 0.28 * boost);
        drawAmbientBacklight(ctx, cx, 41, 33 * pulse, 23 * pulse, '56, 189, 248', 0.19 * boost);

        // Glowing crescent moon arc behind Chibi
        ctx.save();
        ctx.translate(cx + 2, 41);
        ctx.rotate(-0.22 + Math.sin(t * 0.0014) * 0.05);
        ctx.fillStyle = `rgba(216, 180, 254, ${Math.min(0.88, 0.42 * boost).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(0, 0, 29 * pulse, -Math.PI * 0.85, Math.PI * 0.35, false);
        ctx.quadraticCurveTo(8, -6, 29 * pulse * Math.cos(-Math.PI * 0.85), 29 * pulse * Math.sin(-Math.PI * 0.85));
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        for (let i = 0; i < 12; i++) {
          const p = particles[i];
          if (!isStatic) {
            p.v -= 0.0044 * p.speed * dt * boost;
            if (p.v < 0) p.v = 1;
          }
          const mx = 66 + p.u * 84 + Math.sin(t * 0.0028 + p.phase) * 4.2;
          const my = 12 + p.v * 58;
          const alpha = Math.sin(p.v * Math.PI) * 0.84 * boost;
          const rgb = i % 2 === 0 ? '192, 132, 252' : '56, 189, 248';
          if (i % 3 === 0) {
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(t * 0.003 + p.phase);
            ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
            const cr = 2.4 + (i % 2) * 0.8;
            ctx.beginPath();
            ctx.arc(0, 0, cr, -0.75 * Math.PI, 0.75 * Math.PI, false);
            ctx.quadraticCurveTo(cr * 0.2, 0, cr * Math.cos(-0.75 * Math.PI), cr * Math.sin(-0.75 * Math.PI));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else {
            drawFourPointStar(ctx, mx, my, 1.5 + (i % 2) * 0.5, t * 0.0025 + p.phase, rgb, alpha * 0.88);
          }
        }
      }

      if (surgeProgress > 0.01) {
        drawSlashBurst(ctx, surgeProgress, meta.rgb1, meta.rgb2);
      }
    }

    return { render };
  }

  /* ==========================================================================
   * LIVE2D-LITE FOREGROUND PARTICLE & ANIME EMOTE RENDERER (162x96, ZERO-GC)
   * ========================================================================== */

  function drawMiniMusicNote(ctx, x, y, size, rgb, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.2, size * 0.24);
    ctx.beginPath();
    ctx.ellipse(-size * 0.25, size * 0.35, size * 0.38, size * 0.28, -0.35, 0, TWO_PI);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.06, size * 0.28);
    ctx.lineTo(size * 0.06, -size * 0.68);
    ctx.quadraticCurveTo(size * 0.56, -size * 0.45, size * 0.48, -size * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  function drawMiniBolt(ctx, x, y, size, rgb, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(size * 0.18, -size * 0.95);
    ctx.lineTo(-size * 0.48, size * 0.06);
    ctx.lineTo(size * 0.02, size * 0.06);
    ctx.lineTo(-size * 0.22, size * 0.95);
    ctx.lineTo(size * 0.52, -size * 0.12);
    ctx.lineTo(0, -size * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ==========================================================================
   * TRUE LIVE2D-GRADE 2.5D ARTICULATED MESH DEFORMER & EYE-GAZE ENGINE (v3.4)
   * - Calibrated per-character eye sockets, 3D spherical face foreshortening,
   *   pinned resting hands, spring-damper hair physics & specular catchlights.
   * ========================================================================== */

  const CHIBI_ANATOMY_MAP = {
    nezuko: {
      eyes: [
        { u: 0.361, v: 0.530, ru: 0.086, rv: 0.082 },
        { u: 0.638, v: 0.530, ru: 0.086, rv: 0.082 }
      ],
      faces: [{ u: 0.500, v: 0.520, ru: 0.34, rv: 0.30, neckU: 0.50, neckV: 0.78 }]
    },
    shinobu: {
      eyes: [
        { u: 0.350, v: 0.578, ru: 0.072, rv: 0.098 },
        { u: 0.586, v: 0.576, ru: 0.076, rv: 0.098 }
      ],
      faces: [{ u: 0.472, v: 0.560, ru: 0.31, rv: 0.32, neckU: 0.48, neckV: 0.79 }]
    },
    mitsuri: {
      eyes: [
        { u: 0.334, v: 0.419, ru: 0.096, rv: 0.068 },
        { u: 0.662, v: 0.419, ru: 0.096, rv: 0.068 }
      ],
      faces: [{ u: 0.498, v: 0.425, ru: 0.34, rv: 0.27, neckU: 0.50, neckV: 0.68 }],
      hairSwayBoost: 1.35
    },
    giyu: {
      eyes: [
        { u: 0.320, v: 0.466, ru: 0.085, rv: 0.064 },
        { u: 0.589, v: 0.466, ru: 0.085, rv: 0.064 }
      ],
      faces: [{ u: 0.458, v: 0.465, ru: 0.32, rv: 0.28, neckU: 0.48, neckV: 0.72 }]
    },
    rengoku: {
      eyes: [
        { u: 0.374, v: 0.443, ru: 0.084, rv: 0.074 },
        { u: 0.624, v: 0.443, ru: 0.084, rv: 0.074 }
      ],
      faces: [{ u: 0.500, v: 0.450, ru: 0.33, rv: 0.29, neckU: 0.50, neckV: 0.73 }],
      hairSwayBoost: 1.2
    },
    uzui: {
      eyes: [
        { u: 0.344, v: 0.490, ru: 0.090, rv: 0.072 },
        { u: 0.634, v: 0.494, ru: 0.090, rv: 0.072 }
      ],
      faces: [{ u: 0.492, v: 0.485, ru: 0.33, rv: 0.29, neckU: 0.50, neckV: 0.74 }],
      hairSwayBoost: 1.25
    },
    muichiro: {
      eyes: [
        { u: 0.345, v: 0.446, ru: 0.082, rv: 0.068 },
        { u: 0.614, v: 0.448, ru: 0.084, rv: 0.068 }
      ],
      faces: [{ u: 0.482, v: 0.455, ru: 0.32, rv: 0.28, neckU: 0.49, neckV: 0.71 }],
      hairSwayBoost: 1.3
    },
    obanai: {
      eyes: [
        { u: 0.347, v: 0.522, ru: 0.090, rv: 0.068 },
        { u: 0.641, v: 0.522, ru: 0.090, rv: 0.068 }
      ],
      faces: [{ u: 0.494, v: 0.520, ru: 0.33, rv: 0.29, neckU: 0.50, neckV: 0.76 }],
      hairSwayBoost: 1.18
    },
    sanemi: {
      eyes: [
        { u: 0.341, v: 0.502, ru: 0.094, rv: 0.064 },
        { u: 0.660, v: 0.500, ru: 0.094, rv: 0.064 }
      ],
      faces: [{ u: 0.500, v: 0.495, ru: 0.34, rv: 0.27, neckU: 0.50, neckV: 0.73 }]
    },
    gyomei: {
      blindEyes: true,
      eyes: [
        { u: 0.398, v: 0.328, ru: 0.068, rv: 0.050 },
        { u: 0.597, v: 0.328, ru: 0.068, rv: 0.050 }
      ],
      faces: [{ u: 0.498, v: 0.355, ru: 0.29, rv: 0.25, neckU: 0.50, neckV: 0.58 }]
    },
    tanjiro: {
      eyes: [
        { u: 0.337, v: 0.575, ru: 0.090, rv: 0.070 },
        { u: 0.660, v: 0.575, ru: 0.092, rv: 0.070 }
      ],
      faces: [{ u: 0.498, v: 0.560, ru: 0.34, rv: 0.28, neckU: 0.50, neckV: 0.80 }],
      hairSwayBoost: 1.22
    },
    zenitsu: {
      eyes: [
        { u: 0.338, v: 0.663, ru: 0.090, rv: 0.072 },
        { u: 0.660, v: 0.663, ru: 0.092, rv: 0.072 }
      ],
      faces: [{ u: 0.499, v: 0.640, ru: 0.35, rv: 0.27, neckU: 0.50, neckV: 0.84 }],
      hairSwayBoost: 1.25
    },
    inosuke: {
      maskEyes: true,
      eyes: [
        { u: 0.346, v: 0.326, ru: 0.092, rv: 0.092 },
        { u: 0.653, v: 0.326, ru: 0.092, rv: 0.092 }
      ],
      faces: [{ u: 0.500, v: 0.380, ru: 0.36, rv: 0.32, neckU: 0.50, neckV: 0.72 }]
    },
    yoriichi: {
      eyes: [
        { u: 0.314, v: 0.572, ru: 0.076, rv: 0.058 },
        { u: 0.565, v: 0.570, ru: 0.082, rv: 0.058 }
      ],
      faces: [{ u: 0.445, v: 0.555, ru: 0.31, rv: 0.28, neckU: 0.47, neckV: 0.79 }],
      hairSwayBoost: 1.28
    },
    ubuyashiki: {
      dualFaces: true,
      eyes: [
        { u: 0.186, v: 0.500, ru: 0.058, rv: 0.058, faceIdx: 0 },
        { u: 0.347, v: 0.500, ru: 0.056, rv: 0.058, faceIdx: 0 },
        { u: 0.668, v: 0.537, ru: 0.061, rv: 0.061, faceIdx: 1 },
        { u: 0.835, v: 0.538, ru: 0.061, rv: 0.061, faceIdx: 1 }
      ],
      faces: [
        { u: 0.266, v: 0.495, ru: 0.21, rv: 0.28, neckU: 0.27, neckV: 0.74 },
        { u: 0.751, v: 0.528, ru: 0.21, rv: 0.28, neckU: 0.75, neckV: 0.76 }
      ]
    }
  };
  CHIBI_ANATOMY_MAP.moon = CHIBI_ANATOMY_MAP.obanai;

  const L2D_GRID_U = new Float32Array([0, 0.12, 0.22, 0.29, 0.35, 0.42, 0.50, 0.58, 0.65, 0.71, 0.78, 0.88, 1.0]);
  const L2D_GRID_V = new Float32Array([0, 0.14, 0.25, 0.35, 0.44, 0.52, 0.60, 0.69, 0.78, 0.88, 1.0]);
  const L2D_COLS = L2D_GRID_U.length;
  const L2D_ROWS = L2D_GRID_V.length;
  const L2D_VERT_COUNT = L2D_COLS * L2D_ROWS;
  const _svgTextCache = new Map();

  function smooth01(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6)));
    return t * t * (3 - 2 * t);
  }

  function decodeInlineSvgDataUri(uri) {
    const commaIdx = uri.indexOf(',');
    if (commaIdx < 0) return '';
    const metaPart = uri.slice(0, commaIdx).toLowerCase();
    const bodyPart = uri.slice(commaIdx + 1);
    try {
      if (metaPart.includes(';base64')) {
        return typeof atob === 'function' ? atob(bodyPart) : '';
      }
      return decodeURIComponent(bodyPart);
    } catch (_) {
      return '';
    }
  }

  function parseSvgChibiDescriptor(svgText) {
    if (!svgText || typeof svgText !== 'string') return null;
    const vbMatch = svgText.match(/viewBox\s*=\s*["']\s*([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)\s*["']/i);
    const vbW = vbMatch ? (parseFloat(vbMatch[3]) || 180) : 180;
    const vbH = vbMatch ? (parseFloat(vbMatch[4]) || 88) : 88;

    const groupIdx = svgText.indexOf('chibi-group');
    const searchSlice = groupIdx >= 0 ? svgText.slice(groupIdx) : svgText;
    const imgTagMatch = searchSlice.match(/<image\b([^>]+)>/i);
    if (!imgTagMatch) return null;
    const attrs = imgTagMatch[1];
    const hrefMatch = attrs.match(/(?:xlink:)?href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch || !hrefMatch[1]) return null;
    const numAttr = (name, fb) => {
      const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([0-9.+-]+)["']`, 'i'));
      return m ? (parseFloat(m[1]) || fb) : fb;
    };
    const ix = numAttr('x', 80);
    const iy = numAttr('y', 5.5);
    const iw = numAttr('width', 96);
    const ih = numAttr('height', 75);
    return {
      vbW,
      vbH,
      ix,
      iy,
      iw,
      ih,
      hasPedestal: groupIdx >= 0 && ix > 24,
      imgHref: hrefMatch[1]
    };
  }

  function readComposerStickerMetrics(composer, themeCfg) {
    const cfg = themeCfg && typeof themeCfg === 'object' ? themeCfg : {};
    const parseNum = (v, fb) => {
      if (v === undefined || v === null || v === '' || typeof v === 'boolean') return fb;
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    };
    const isChibiNpc = cfg.isChibiNpc !== false;
    let sTop = parseNum(cfg.stickerTop, -56);
    let sRight = isChibiNpc ? parseNum(cfg.stickerRight, 10) : 16;
    let sW = parseNum(cfg.stickerW, 136);
    let sH = parseNum(cfg.stickerH, 64);
    if (!isChibiNpc && cfg.isOrnament) {
      sW += 8;
      sH += 2;
    }
    if (composer && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      try {
        const cs = window.getComputedStyle(composer, '::before');
        if (cs && cs.display !== 'none') {
          const cw = parseFloat(cs.width);
          const ch = parseFloat(cs.height);
          const ct = parseFloat(cs.top);
          const cr = parseFloat(cs.right);
          if (cw > 24 && ch > 16) {
            sW = cw;
            sH = ch;
          }
          if (Number.isFinite(ct)) sTop = ct;
          if (Number.isFinite(cr)) sRight = cr;
        }
      } catch (_) {}
    }
    return { sTop, sRight, sW, sH };
  }

  function createLive2dMeshRig(charId, themeCfg, meta, onReady) {
    const canonicalChar = (CHAR_META[charId] && CHAR_META[charId].charId) || charId || 'shinobu';
    const anatomy = CHIBI_ANATOMY_MAP[canonicalChar] || CHIBI_ANATOMY_MAP.shinobu;
    const dstX = new Float32Array(L2D_VERT_COUNT);
    const dstY = new Float32Array(L2D_VERT_COUNT);
    const activeCells = new Uint8Array((L2D_COLS - 1) * (L2D_ROWS - 1));
    activeCells.fill(1);

    const rig = {
      ready: false,
      disposed: false,
      img: null,
      imgW: 240,
      imgH: 240,
      svgDesc: null,
      isDirectRaster: false,
      clipRightPx: 0,
      lastHeadTopX: 128,
      lastHeadTopY: 24,
      eyeScreenPts: anatomy.eyes.map(() => ({ x: 0, y: 0, r: 6 }))
    };

    function populateNonEmptyCells(imgEl) {
      if (typeof document === 'undefined') return;
      try {
        const probeCv = document.createElement('canvas');
        const pw = Math.max(1, imgEl.naturalWidth || imgEl.width || 240);
        const ph = Math.max(1, imgEl.naturalHeight || imgEl.height || 240);
        probeCv.width = pw;
        probeCv.height = ph;
        const pCtx = probeCv.getContext('2d');
        if (!pCtx) return;
        pCtx.drawImage(imgEl, 0, 0, pw, ph);
        const data = pCtx.getImageData(0, 0, pw, ph).data;
        for (let r = 0; r < L2D_ROWS - 1; r++) {
          const y0 = Math.max(0, Math.floor(L2D_GRID_V[r] * ph) - 1);
          const y1 = Math.min(ph - 1, Math.ceil(L2D_GRID_V[r + 1] * ph) + 1);
          for (let c = 0; c < L2D_COLS - 1; c++) {
            const x0 = Math.max(0, Math.floor(L2D_GRID_U[c] * pw) - 1);
            const x1 = Math.min(pw - 1, Math.ceil(L2D_GRID_U[c + 1] * pw) + 1);
            let hasPixel = 0;
            for (let py = y0; py <= y1 && !hasPixel; py += 2) {
              const rowBase = py * pw;
              for (let px = x0; px <= x1; px += 2) {
                if (data[(rowBase + px) * 4 + 3] > 6) {
                  hasPixel = 1;
                  break;
                }
              }
            }
            activeCells[r * (L2D_COLS - 1) + c] = hasPixel;
          }
        }
      } catch (_) {
        activeCells.fill(1);
      }
    }

    function finalizeImageLoad(imgEl, svgDesc, isDirectRaster) {
      if (rig.disposed) return;
      const nw = imgEl.naturalWidth || imgEl.width || 0;
      const nh = imgEl.naturalHeight || imgEl.height || 0;
      if (!(nw > 8 && nh > 8)) return;
      rig.img = imgEl;
      rig.imgW = nw;
      rig.imgH = nh;
      rig.svgDesc = svgDesc;
      rig.isDirectRaster = Boolean(isDirectRaster);
      populateNonEmptyCells(imgEl);
      rig.ready = true;
      if (typeof onReady === 'function') {
        try { onReady(rig); } catch (_) {}
      }
    }

    function mountImageFromHref(href, svgDesc, isDirectRaster) {
      if (!href || typeof Image !== 'function' || rig.disposed) return;
      const img = new Image();
      if (!href.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => finalizeImageLoad(img, svgDesc, isDirectRaster);
      img.src = href;
      if (img.complete && (img.naturalWidth || 0) > 8) {
        finalizeImageLoad(img, svgDesc, isDirectRaster);
      }
    }

    const rawSticker = themeCfg && themeCfg.sticker ? String(themeCfg.sticker).trim() : '';
    const stickerUrl = safeResolveAsset(rawSticker);
    if (stickerUrl && typeof Image === 'function') {
      const lowerUrl = stickerUrl.toLowerCase();
      if (lowerUrl.startsWith('data:image/svg+xml')) {
        const svgText = decodeInlineSvgDataUri(stickerUrl);
        const desc = parseSvgChibiDescriptor(svgText);
        if (desc && desc.imgHref) {
          mountImageFromHref(desc.imgHref, desc, false);
        }
      } else if (/\.svg(?:$|\?)/i.test(lowerUrl)) {
        if (_svgTextCache.has(stickerUrl)) {
          const desc = parseSvgChibiDescriptor(_svgTextCache.get(stickerUrl));
          if (desc && desc.imgHref) mountImageFromHref(desc.imgHref, desc, false);
        } else if (typeof fetch === 'function' && (/^https?:\/\/127\.0\.0\.1:/i.test(stickerUrl) || /^https?:\/\/localhost:/i.test(stickerUrl) || stickerUrl.startsWith('./') || stickerUrl.startsWith('/'))) {
          fetch(stickerUrl, { mode: 'cors', credentials: 'omit' })
            .then((r) => (r && r.ok ? r.text() : ''))
            .then((txt) => {
              if (!txt || rig.disposed) return;
              if (_svgTextCache.size >= 24) {
                const oldest = _svgTextCache.keys().next().value;
                _svgTextCache.delete(oldest);
              }
              _svgTextCache.set(stickerUrl, txt);
              const desc = parseSvgChibiDescriptor(txt);
              if (desc && desc.imgHref) mountImageFromHref(desc.imgHref, desc, false);
            })
            .catch(() => {});
        }
      } else if (/^(?:data:image\/(?:png|webp|jpeg|gif)|https?:\/\/127\.0\.0\.1:)/i.test(lowerUrl) || /\.(?:png|webp|jpg|jpeg)(?:$|\?)/i.test(lowerUrl)) {
        mountImageFromHref(stickerUrl, null, true);
      }
    }

    function computePlacement(composer) {
      const { sTop, sRight, sW, sH } = readComposerStickerMetrics(composer, themeCfg);
      // Overlay canvas sits at top: LIVE2D_TOP (-106), right: LIVE2D_RIGHT (-10), width: LIVE2D_W (188)
      // Left edge of overlay in composer coords = W_comp + LIVE2D_RIGHT - LIVE2D_W = W_comp - 178
      // Left edge of ::before in composer coords = W_comp - sRight - sW
      const relBeforeX = (LIVE2D_W - LIVE2D_RIGHT) - sRight - sW;
      const relBeforeY = sTop - LIVE2D_TOP;

      if (rig.svgDesc) {
        const d = rig.svgDesc;
        const svgScale = Math.min(sW / d.vbW, sH / d.vbH);
        const svgDrawW = d.vbW * svgScale;
        const svgDrawH = d.vbH * svgScale;
        const svgX = (sW - svgDrawW) * 0.5;
        const svgY = sH - svgDrawH;
        const imgScale = Math.min(d.iw / rig.imgW, d.ih / rig.imgH);
        const chibiSvgW = rig.imgW * imgScale;
        const chibiSvgH = rig.imgH * imgScale;
        const chibiSvgX = d.ix + (d.iw - chibiSvgW) * 0.5;
        const chibiSvgY = d.iy + (d.ih - chibiSvgH);
        const keepPedestalW = d.hasPedestal ? Math.max(0, svgX + (d.ix - 2.0) * svgScale) : 0;
        rig.clipRightPx = Math.max(0, sW - keepPedestalW);
        return {
          drawX: relBeforeX + svgX + chibiSvgX * svgScale,
          drawY: relBeforeY + svgY + chibiSvgY * svgScale,
          drawW: chibiSvgW * svgScale,
          drawH: chibiSvgH * svgScale
        };
      }

      const rScale = Math.min(sW / rig.imgW, sH / rig.imgH);
      const rW = rig.imgW * rScale;
      const rH = rig.imgH * rScale;
      rig.clipRightPx = sW + 8;
      return {
        drawX: relBeforeX + (sW - rW) * 0.5,
        drawY: relBeforeY + (sH - rH),
        drawW: rW,
        drawH: rH
      };
    }

    function deformPoint(u, v, drawX, drawY, drawW, drawH, p) {
      // Pin resting hands cleanly onto the chat frame ledge (v -> 1.0 => bodyFree = 0)
      const bodyFree = 1 - smooth01(0.84, 0.985, v);
      const headWeight = smooth01(0.81, 0.60, v) * bodyFree;

      const faces = anatomy.faces;
      let face = faces[0];
      if (faces.length > 1) {
        face = u < 0.5 ? faces[0] : faces[1];
      }

      // 1. Organic chest breathing & reactive bounce (preserving pinned hands!)
      let x = drawX + u * drawW;
      let y = drawY + v * drawH;

      const breathLift = -p.breath * 1.35 * bodyFree;
      const breathExpand = (u - face.u) * p.breath * 1.1 * bodyFree * (1 - headWeight * 0.4);
      x += breathExpand + (u - face.u) * (p.squashX - 1) * drawW * bodyFree;
      y += breathLift + p.bounceY * bodyFree - (1 - v) * (p.stretchY - 1) * drawH * bodyFree;

      // 2. Upper-body lean + Neck-pivoted Head Roll (tilt)
      const bodyLeanX = p.headLookX * (drawW * (anatomy.dualFaces ? 0.036 : 0.058)) * bodyFree * (1 - v * 0.35);
      x += bodyLeanX;

      const rollAngle = (p.headLookX * 0.092 + p.moodRoll) * headWeight;
      if (Math.abs(rollAngle) > 1e-4) {
        const pivX = drawX + face.neckU * drawW + bodyLeanX * 0.65;
        const pivY = drawY + face.neckV * drawH;
        const rx = x - pivX;
        const ry = y - pivY;
        const cs = Math.cos(rollAngle);
        const sn = Math.sin(rollAngle);
        x = pivX + rx * cs - ry * sn;
        y = pivY + rx * sn + ry * cs;
      }

      // 3. True 2.5D Spherical Face Foreshortening (Live2D ParamAngleX / ParamAngleY)
      const fdu = (u - face.u) / (face.ru || 0.33);
      const fdv = (v - face.v) / (face.rv || 0.29);
      const rSq = fdu * fdu + fdv * fdv;
      const zFront = rSq < 1 ? Math.pow(1 - rSq, 0.72) : 0;
      const yawScale = anatomy.dualFaces ? 0.62 : 1.0;

      // Center face shifts strongly toward cursor while back skull/hair shifts less -> 3D head rotation illusion!
      x += p.headLookX * drawW * (0.042 + 0.122 * zFront) * yawScale * headWeight;
      y += p.headLookY * drawH * (0.030 + 0.095 * zFront) * headWeight;
      if (zFront <= 0.01 && v < face.v) {
        // Subtle counter-parallax on back crown when nodding up/down
        y -= p.headLookY * drawH * 0.024 * headWeight;
      }

      // 4. Secondary Spring-Damper Physics on Side Hair / Braids / Hanafuda Earrings
      const sideDist = Math.abs(u - face.u);
      if (sideDist > face.ru * 0.55 && v > 0.12 && v < 0.90) {
        const wHair = smooth01(face.ru * 0.55, face.ru * 1.12, sideDist) * smooth01(0.10, 0.42, v) * bodyFree;
        const boost = anatomy.hairSwayBoost || 1.0;
        x += p.hairSwing * drawW * 0.082 * boost * wHair;
        y += Math.abs(p.hairSwing) * drawH * 0.016 * wHair;
      }

      // 5. Local Eye-Socket Iris Gaze Shift + Biomimetic Eyelid Blink
      const eyes = anatomy.eyes;
      for (let ei = 0; ei < eyes.length; ei++) {
        const eye = eyes[ei];
        const edu = (u - eye.u) / (eye.ru * 1.24);
        const edv = (v - eye.v) / (eye.rv * 1.28);
        const eDistSq = edu * edu + edv * edv;
        if (eDistSq < 1) {
          const wIris = (1 - eDistSq) * (1 - eDistSq);
          const irisGain = anatomy.blindEyes ? 0.22 : 0.62;
          x += p.eyeLookX * (eye.ru * drawW * irisGain) * wIris;
          y += p.eyeLookY * (eye.rv * drawH * (irisGain * 0.92)) * wIris;
        }
        if (p.blinkAmt > 0.01 && !anatomy.maskEyes) {
          const bdu = (u - eye.u) / (eye.ru * 1.38);
          const bdv = (v - eye.v) / (eye.rv * 1.48);
          const bSq = bdu * bdu + bdv * bdv;
          if (bSq < 1) {
            const wLid = Math.pow(1 - bSq, 1.45);
            const closedV = eye.v + eye.rv * 0.28;
            y += (closedV - v) * drawH * p.blinkAmt * 0.92 * wLid;
          }
        }
      }

      return [x, y];
    }

    function drawTrianglePiece(ctx, dpr, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2, sx, sy, sw, sh) {
      // Expand clip triangle outward by 0.58px from centroid to eliminate 100% of anti-aliasing seams!
      const cx = (x0 + x1 + x2) * 0.333333;
      const cy = (y0 + y1 + y2) * 0.333333;
      const expand = (px, py) => {
        const dx = px - cx;
        const dy = py - cy;
        const len = Math.hypot(dx, dy) || 1;
        return [px + (dx / len) * 0.58, py + (dy / len) * 0.58];
      };
      const [cx0, cy0] = expand(x0, y0);
      const [cx1, cy1] = expand(x1, y1);
      const [cx2, cy2] = expand(x2, y2);

      const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
      if (Math.abs(det) < 1e-5) return;
      const invDet = 1 / det;
      const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) * invDet;
      const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) * invDet;
      const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) * invDet;
      const d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) * invDet;
      const e = x0 - a * u0 - c * v0;
      const f = y0 - b * u0 - d * v0;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx1, cy1);
      ctx.lineTo(cx2, cy2);
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * e, dpr * f);
      ctx.drawImage(rig.img, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.restore();
    }

    function renderCharacterMesh(ctx, dpr, composer, p) {
      if (!rig.ready || !rig.img || !composer) return false;
      const { drawX, drawY, drawW, drawH } = computePlacement(composer);
      if (!(drawW > 12 && drawH > 12)) return false;

      for (let r = 0; r < L2D_ROWS; r++) {
        const v = L2D_GRID_V[r];
        const rowOff = r * L2D_COLS;
        for (let c = 0; c < L2D_COLS; c++) {
          const pt = deformPoint(L2D_GRID_U[c], v, drawX, drawY, drawW, drawH, p);
          dstX[rowOff + c] = pt[0];
          dstY[rowOff + c] = pt[1];
        }
      }

      // Track live crown position for foreground thought/combo emote anchor
      const topFace = anatomy.faces[anatomy.faces.length - 1];
      const crownPt = deformPoint(topFace.u + 0.14, 0.08, drawX, drawY, drawW, drawH, p);
      rig.lastHeadTopX = crownPt[0];
      rig.lastHeadTopY = crownPt[1];

      if (p.glowRadius > 0.5) {
        ctx.save();
        const gCx = drawX + drawW * 0.5 + p.headLookX * 4;
        const gCy = drawY + drawH * 0.52 + p.headLookY * 2;
        const gR = Math.max(drawW, drawH) * 0.56;
        const grad = ctx.createRadialGradient(gCx, gCy, gR * 0.18, gCx, gCy, gR);
        grad.addColorStop(0, p.glowColor);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gCx, gCy, gR, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }

      const iw = rig.imgW;
      const ih = rig.imgH;
      for (let r = 0; r < L2D_ROWS - 1; r++) {
        const v0 = L2D_GRID_V[r] * ih;
        const v1 = L2D_GRID_V[r + 1] * ih;
        const sy = Math.max(0, Math.floor(v0) - 1);
        const sh = Math.min(ih - sy, Math.ceil(v1 - sy) + 2);
        const r0 = r * L2D_COLS;
        const r1 = (r + 1) * L2D_COLS;
        const cellRow = r * (L2D_COLS - 1);

        for (let c = 0; c < L2D_COLS - 1; c++) {
          if (!activeCells[cellRow + c]) continue;
          const u0 = L2D_GRID_U[c] * iw;
          const u1 = L2D_GRID_U[c + 1] * iw;
          const sx = Math.max(0, Math.floor(u0) - 1);
          const sw = Math.min(iw - sx, Math.ceil(u1 - sx) + 2);

          const i00 = r0 + c;
          const i10 = i00 + 1;
          const i01 = r1 + c;
          const i11 = i01 + 1;

          drawTrianglePiece(
            ctx, dpr,
            dstX[i00], dstY[i00], dstX[i10], dstY[i10], dstX[i01], dstY[i01],
            u0, v0, u1, v0, u0, v1,
            sx, sy, sw, sh
          );
          drawTrianglePiece(
            ctx, dpr,
            dstX[i11], dstY[i11], dstX[i01], dstY[i01], dstX[i10], dstY[i10],
            u1, v1, u0, v1, u1, v0,
            sx, sy, sw, sh
          );
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Specular crystalline catchlights & smooth blink lash accent on eyes
      const eyes = anatomy.eyes;
      for (let ei = 0; ei < eyes.length; ei++) {
        const eye = eyes[ei];
        const ePt = deformPoint(eye.u, eye.v, drawX, drawY, drawW, drawH, p);
        const er = Math.max(2.4, eye.ru * drawW * 0.72);
        rig.eyeScreenPts[ei].x = ePt[0];
        rig.eyeScreenPts[ei].y = ePt[1];
        rig.eyeScreenPts[ei].r = er;

        if (p.blinkAmt > 0.62 && !anatomy.maskEyes) {
          ctx.save();
          ctx.strokeStyle = 'rgba(20, 14, 28, 0.76)';
          ctx.lineWidth = 1.25;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ePt[0] - er * 0.85, ePt[1] + 0.3);
          ctx.quadraticCurveTo(ePt[0], ePt[1] + er * 0.36, ePt[0] + er * 0.85, ePt[1] + 0.3);
          ctx.stroke();
          ctx.restore();
        } else if (!anatomy.blindEyes && p.blinkAmt < 0.45) {
          const gx = ePt[0] + p.eyeLookX * er * 0.46 - er * 0.22;
          const gy = ePt[1] + p.eyeLookY * er * 0.42 - er * 0.26;
          const sparkAlpha = 0.56 + p.proximity * 0.28;
          ctx.save();
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.92, sparkAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(gx, gy, Math.max(0.95, er * 0.24), 0, TWO_PI);
          ctx.fill();
          // Secondary lower iris gleam tinted with character's Breathing color
          ctx.fillStyle = `rgba(${meta.rgb2}, ${(0.28 + p.proximity * 0.22).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(
            ePt[0] + p.eyeLookX * er * 0.36 + er * 0.20,
            ePt[1] + p.eyeLookY * er * 0.34 + er * 0.26,
            Math.max(0.65, er * 0.15),
            0,
            TWO_PI
          );
          ctx.fill();
          ctx.restore();
        }
      }

      return true;
    }

    function dispose() {
      rig.disposed = true;
      rig.ready = false;
      rig.img = null;
    }

    return {
      rig,
      renderCharacterMesh,
      computePlacement,
      dispose
    };
  }

  function createLive2dForegroundRenderer(auraMode, meta) {
    const fgParticles = [];
    for (let i = 0; i < 9; i++) {
      fgParticles.push({
        seedX: frac(i + 3, 137, 29),
        seedY: frac(i + 5, 193, 71),
        speed: 0.42 + frac(i + 7, 89, 17) * 0.58,
        phase: frac(i + 11, 251, 43) * TWO_PI,
        scale: 0.72 + frac(i + 13, 113, 19) * 0.55
      });
    }

    function drawLive2dEmote(ctx, t, mood, typingCombo, lookX, lookY, anchorX, anchorY) {
      if (!mood || mood === 'idle') return;
      const baseEx = Number.isFinite(anchorX) ? anchorX + 10 : (136 + lookX * 4.2);
      const baseEy = Number.isFinite(anchorY) ? Math.max(14, anchorY - 8) : (22 + lookY * 2.0);
      const ex = Math.max(24, Math.min(LIVE2D_W - 26, baseEx));
      const ey = baseEy + Math.sin(t * 0.0045) * 1.8;

      if (mood === 'thinking') {
        ctx.save();
        ctx.translate(ex, ey);
        ctx.fillStyle = `rgba(${meta.rgb1}, 0.85)`;
        ctx.beginPath();
        ctx.arc(-6, 15, 2.1, 0, TWO_PI);
        ctx.arc(-3, 11, 2.9, 0, TWO_PI);
        ctx.fill();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = `rgba(${meta.rgb1}, 0.90)`;
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-17, -9, 34, 18, 9);
        } else {
          ctx.rect(-17, -9, 34, 18);
        }
        ctx.fill();
        ctx.stroke();

        for (let d = 0; d < 3; d++) {
          const wave = Math.max(0, Math.sin(t * 0.0065 - d * 0.85));
          const dy = 0.5 - wave * 2.8;
          const r = 2.1 + wave * 0.75;
          ctx.fillStyle = d === 1 ? `rgba(${meta.rgb2}, 0.98)` : `rgba(${meta.rgb1}, 0.98)`;
          ctx.beginPath();
          ctx.arc(-7 + d * 7, dy, r, 0, TWO_PI);
          ctx.fill();
        }
        drawFourPointStar(ctx, 20, -7, 3.2, t * 0.0028, meta.rgb2, 0.94);
        ctx.restore();
        return;
      }

      if (mood === 'typing' || mood === 'combo') {
        const bounce = Math.abs(Math.sin(t * 0.011)) * 3.2;
        drawMiniMusicNote(ctx, ex + 18, ey + 4 - bounce, 5.4, meta.rgb1, 0.94);
        drawFourPointStar(ctx, ex - 18, ey + 6 - bounce * 0.5, 2.9, t * 0.004, meta.rgb2, 0.88);
        if (typingCombo >= 3) {
          ctx.save();
          ctx.translate(ex, ey - bounce * 0.4);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.strokeStyle = `rgba(${meta.rgb1}, 0.92)`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(-15, -7, 30, 14, 7);
          } else {
            ctx.rect(-15, -7, 30, 14);
          }
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#f8fafc';
          ctx.font = '700 9.5px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`×${Math.min(99, typingCombo)}`, 0, 0.5);
          ctx.restore();
        }
        return;
      }

      if (mood === 'crisis') {
        const jitter = Math.sin(t * 0.032) * 1.4;
        ctx.save();
        ctx.translate(ex + jitter, ey);
        ctx.fillStyle = 'rgba(127, 29, 29, 0.90)';
        ctx.strokeStyle = 'rgba(251, 113, 133, 0.96)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 9.5, 0, TWO_PI);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.font = '800 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 0.5);
        ctx.restore();
        drawMiniBolt(ctx, ex + 15, ey - 5, 5.2, '250, 204, 21', 0.94);
        return;
      }

      if (mood === 'victory' || mood === 'happy') {
        const pulse = 0.86 + Math.sin(t * 0.010) * 0.18;
        drawFourPointStar(ctx, ex, ey - 2, 4.5 * pulse, t * 0.0035, '250, 204, 21', 0.96);
        drawFourPointStar(ctx, ex + 18, ey + 6, 3.2 * pulse, -t * 0.003, meta.rgb1, 0.92);
        drawTinyHeart(ctx, ex - 15, ey + 5, 3.9 * pulse, meta.rgb1, 0.94);
        if (mood === 'victory') {
          drawFourPointStar(ctx, ex - 8, ey - 6, 3.6 * pulse, t * 0.004, meta.rgb2, 0.94);
        }
      }
    }

    function render(ctx, now, mood, typingCombo, lookX, lookY, surgeProgress, meshCtrl, dpr, composer, meshPose) {
      ctx.setTransform(dpr || 1, 0, 0, dpr || 1, 0, 0);
      ctx.clearRect(0, 0, LIVE2D_W, LIVE2D_H);
      let meshDrawn = false;
      let anchorX = NaN;
      let anchorY = NaN;
      if (meshCtrl && composer && meshPose) {
        meshDrawn = meshCtrl.renderCharacterMesh(ctx, dpr || 1, composer, meshPose);
        if (meshDrawn) {
          anchorX = meshCtrl.rig.lastHeadTopX;
          anchorY = meshCtrl.rig.lastHeadTopY;
        }
      }

      const t = now;
      const energy = (mood === 'victory' || mood === 'happy') ? 1.45
        : (mood === 'combo' || mood === 'typing' || mood === 'thinking') ? 1.22
        : 1.0;
      const count = (mood === 'victory' || surgeProgress > 0.1) ? 9 : 6;

      for (let i = 0; i < count; i++) {
        const p = fgParticles[i];
        const cyc = ((t * 0.00034 * p.speed * energy + p.seedY) % 1);
        const py = LIVE2D_H - 12 - cyc * (LIVE2D_H - 24);
        const sway = Math.sin(t * 0.0022 * p.speed + p.phase) * (7 + (i % 3) * 2.5);
        const px = 58 + p.seedX * 114 + sway + lookX * 4.5;
        const fade = Math.sin(cyc * Math.PI);
        const alpha = Math.max(0, Math.min(0.95, fade * 0.76 * energy));
        if (alpha <= 0.02) continue;
        const rgb = (i % 2 === 0) ? meta.rgb1 : meta.rgb2;

        if (auraMode === 'wisteria' || auraMode === 'royal_wisteria') {
          if (i % 3 === 0) {
            const flap = 0.35 + Math.abs(Math.sin(t * 0.009 + p.phase)) * 0.65;
            drawTinyButterfly(ctx, px, py, 0.56 * p.scale, flap, meta.rgb1, meta.rgb2, alpha);
          } else {
            drawOrb(ctx, px, py, 1.5 * p.scale, rgb, alpha * 0.85);
          }
        } else if (auraMode === 'love' || auraMode === 'nezuko') {
          if (i % 2 === 0) {
            drawTinyHeart(ctx, px, py, 2.7 * p.scale, rgb, alpha * 0.9);
          } else {
            drawFourPointStar(ctx, px, py, 1.9 * p.scale, t * 0.0024 + p.phase, rgb, alpha * 0.86);
          }
        } else if (auraMode === 'thunder') {
          if (i % 2 === 0) {
            drawMiniBolt(ctx, px, py, 3.6 * p.scale, rgb, alpha * 0.9);
          } else {
            drawFourPointStar(ctx, px, py, 1.8 * p.scale, t * 0.004 + p.phase, rgb, alpha * 0.85);
          }
        } else if (auraMode === 'flame' || auraMode === 'sun' || auraMode === 'sun_water') {
          if (i % 3 === 0) {
            drawFourPointStar(ctx, px, py, 2.1 * p.scale, t * 0.003 + p.phase, '253, 224, 71', alpha * 0.9);
          } else {
            drawOrb(ctx, px, py, 1.8 * p.scale, rgb, alpha * 0.9);
          }
        } else if (auraMode === 'sound') {
          drawFourPointStar(ctx, px, py, 2.2 * p.scale, t * 0.0035 + p.phase, rgb, alpha * 0.92);
        } else {
          if (i % 3 === 0) {
            drawFourPointStar(ctx, px, py, 1.9 * p.scale, t * 0.0022 + p.phase, rgb, alpha * 0.84);
          } else {
            drawOrb(ctx, px, py, 1.6 * p.scale, rgb, alpha * 0.84);
          }
        }
      }

      drawLive2dEmote(ctx, t, mood, typingCombo, lookX, lookY, anchorX, anchorY);
      return meshDrawn;
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
      agy-chibi-aura > canvas:not(.agy-chibi-3d-canvas) {
        width: 162px !important;
        height: 84px !important;
        display: block !important;
        pointer-events: none !important;
      }
      agy-chibi-aura > canvas.agy-chibi-3d-canvas {
        position: absolute !important;
        right: 2px !important;
        bottom: -2px !important;
        width: 136px !important;
        height: 112px !important;
        z-index: 3 !important;
        display: block !important;
        pointer-events: none !important;
        transition: opacity 220ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .surface-composer[data-chibi-out-on-stage="1"] agy-chibi-aura > canvas.agy-chibi-3d-canvas {
        opacity: 0 !important;
        transform: translateY(-18px) scale(0.75) !important;
        transition: opacity 0.08s ease-out, transform 0.11s cubic-bezier(0.22, 1, 0.36, 1) !important;
      }
      .surface-composer[data-chibi-landing="1"] agy-chibi-aura > canvas.agy-chibi-3d-canvas {
        animation: agyChibiSpringLanding 0.38s cubic-bezier(0.22, 1, 0.36, 1) both !important;
      }
      .surface-composer[data-chibi3d-active="1"] > .agy-chibi-hitbox,
      .surface-composer[data-chibi-3d-active="1"] > .agy-chibi-hitbox {
        width: 112px !important;
        height: 92px !important;
        top: -88px !important;
        cursor: grab !important;
      }
      .surface-composer[data-chibi3d-active="1"] > .agy-chibi-hitbox:active,
      .surface-composer[data-chibi-3d-active="1"] > .agy-chibi-hitbox:active,
      .surface-composer[data-chibi3d-dragging="1"] > .agy-chibi-hitbox,
      .surface-composer[data-chibi-3d-dragging="1"] > .agy-chibi-hitbox {
        cursor: grabbing !important;
      }

      /* Live2D 2.5D Articulated Chibi Mesh & Foreground Emote Layer */
      .agy-chibi-live2d-overlay {
        pointer-events: none !important;
        position: absolute !important;
        top: -106px !important;
        right: -10px !important;
        width: 188px !important;
        height: 124px !important;
        z-index: 31 !important;
        display: block !important;
        transition: opacity 0.16s ease;
      }
      .surface-composer[data-chibi-out-on-stage="1"] > .agy-chibi-live2d-overlay,
      .surface-composer[data-chibi-3d-active="1"] > .agy-chibi-live2d-overlay,
      .surface-composer[data-chibi-landing="1"] > .agy-chibi-live2d-overlay,
      .surface-composer[data-chibi-attack="1"] > .agy-chibi-live2d-overlay {
        opacity: 0 !important;
      }
      /* When 2.5D Mesh Rig is active: keep left ornament pedestal rock-solid while hiding static Chibi sprite */
      .surface-composer[data-chibi-live2d="1"][data-chibi-live2d-mesh="1"]:not([data-chibi-3d-active="1"]):not([data-chibi-out-on-stage="1"]):not([data-chibi-landing="1"]):not([data-chibi-attack="1"]):not([data-chibi-bounce="1"])::before {
        transition: none !important;
        transform: none !important;
        filter: none !important;
        clip-path: inset(-16px var(--agy-l2d-clip-right, 100%) -16px -16px) !important;
      }
      /* Instant CSS parallax fallback before mesh bitmap resolves or in headless VM */
      .surface-composer[data-chibi-live2d="1"]:not([data-chibi-live2d-mesh="1"]):not([data-chibi-3d-active="1"]):not([data-chibi-out-on-stage="1"]):not([data-chibi-landing="1"]):not([data-chibi-attack="1"]):not([data-chibi-bounce="1"])::before {
        transform-origin: 72% 94% !important;
        transition: none !important;
        will-change: transform, filter;
        transform: translate3d(var(--agy-l2d-tx, 0px), var(--agy-l2d-ty, 0px), 0) rotate(var(--agy-l2d-rot, 0deg)) scale(var(--agy-l2d-sx, 1), var(--agy-l2d-sy, 1)) !important;
        filter: drop-shadow(0 0 var(--agy-l2d-glow-r, 0px) var(--agy-l2d-glow-c, rgba(255, 255, 255, 0)));
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

      /* Integrated 4-Form Drawer & 2D/3D Mode Toggle inside #agy-shinobu-npc-wrap */
      .agy-npc-skill-pill[data-active="1"],
      .agy-npc-mode-pill[data-mode="3d"],
      .agy-npc-live2d-pill[data-active="1"] {
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
        max-height: 196px;
        overflow-y: auto;
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
    themeCfg: null,
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
    surgeTimer: 0,
    focusSyncTimer: 0,

    // 3D Chibi companion state
    chibi3dCanvas: null,
    chibi3dCtx: null,
    chibi3dActive: false,
    chibi3dDpr: 1,
    chibi3dLookYaw: 0,
    chibi3dLookPitch: 0,
    chibi3dTargetLookYaw: 0,
    chibi3dTargetLookPitch: 0,
    chibi3dOrbitYaw: 0,
    chibi3dOrbitPitch: 0,
    chibi3dReaction: 'idle',
    chibi3dReactionUntil: 0,
    chibi3dDragging: false,
    chibi3dMoved: false,
    chibi3dSpringBackAt: 0,
    chibi3dDragReleaseTimer: 0,
    chibi3dFrameCount: 0,
    chibi3dLastMode: '',
    chibi3dRectCacheAt: 0,
    chibi3dRectCache: null,

    // Live2D 2.5D Articulated Chibi companion state
    live2dCanvas: null,
    live2dCtx: null,
    live2dRenderer: null,
    live2dMeshCtrl: null,
    live2dMeshActive: false,
    live2dActive: false,
    live2dDpr: 1,
    l2dEyeLookX: 0,
    l2dEyeLookY: 0,
    l2dLookX: 0,
    l2dLookY: 0,
    l2dTargetLookX: 0,
    l2dTargetLookY: 0,
    l2dHairSwing: 0,
    l2dHairVel: 0,
    l2dPrevLookX: 0,
    l2dBlinkAmt: 0,
    l2dBlinkStartAt: 0,
    l2dBlinkDuration: 155,
    l2dNextBlinkAt: 0,
    l2dDoubleBlinkPending: false,
    l2dLastPointerAt: 0,
    l2dPointerProximity: 0,
    l2dTypingImpulse: 0,
    l2dTypingCombo: 0,
    l2dLastKeyAt: 0,
    l2dAiWorking: false,
    l2dInCrisis: false,
    l2dBladeHeat: 0,
    l2dReaction: 'idle',
    l2dReactionUntil: 0,
    l2dLastHoverAt: 0,
    l2dTx: 0,
    l2dTy: 0,
    l2dRot: 0,
    l2dSx: 1,
    l2dSy: 1,
    l2dEffectiveMood: 'idle',
    l2dFrameCount: 0,
    l2dLastUpdateAt: 0,
    l2dRectCacheAt: 0,
    l2dRectCache: null,

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

  function colorToAlphaRgba(rawColor, targetAlpha, fallbackRgba) {
    if (!rawColor || typeof rawColor !== 'string') return fallbackRgba;
    const c = rawColor.trim();
    const hexMatch = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      let h = hexMatch[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${targetAlpha})`;
    }
    const rgbMatch = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${targetAlpha})`;
    }
    return fallbackRgba;
  }

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
    if (rt && (rt.fxPaused || rt.fxFocusPaused)) return true;
    return false;
  }

  function syncBubbleFrames() {
    if (typeof document === 'undefined' || !state.auraMeta) return;
    const paused = isMotionPaused();
    if (document.body) {
      if (paused) document.body.dataset.agyFxPaused = '1';
      else delete document.body.dataset.agyFxPaused;
    }

    const cfg = state.themeCfg || state.uiThemeCfg || {};
    const masterId = typeof cfg.masterPersonaId === 'string' ? cfg.masterPersonaId.trim().toLowerCase() : '';
    const isCustomMaster = Boolean(masterId && masterId !== 'yoriichi' && (cfg.personaGlowColor || cfg.personaRingColor));

    const bwaveC1 = isCustomMaster
      ? colorToAlphaRgba(cfg.personaGlowColor || cfg.personaRingColor, 0.48, 'rgba(239, 68, 68, 0.48)')
      : 'rgba(239, 68, 68, 0.48)';
    const bwaveC2 = isCustomMaster
      ? colorToAlphaRgba(cfg.personaRingColor || cfg.personaGlowColor, 0.24, 'rgba(253, 224, 71, 0.24)')
      : 'rgba(253, 224, 71, 0.24)';
    const bwaveLine = isCustomMaster
      ? (cfg.personaRingColor || cfg.personaGlowColor || '#fde047')
      : '#fde047';

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
      wave.style.setProperty('--agy-bwave-c1', bwaveC1);
      wave.style.setProperty('--agy-bwave-c2', bwaveC2);
      wave.style.setProperty('--agy-bwave-line', bwaveLine);
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
    if (state.chibi3dCanvas && state.chibi3dCtx && Math.abs(nextDpr - (state.chibi3dDpr || 1)) > 0.01) {
      state.chibi3dDpr = nextDpr;
      state.chibi3dCanvas.width = Math.round(CHIBI_3D_W * nextDpr);
      state.chibi3dCanvas.height = Math.round(CHIBI_3D_H * nextDpr);
      if (typeof state.chibi3dCtx.setTransform === 'function') {
        state.chibi3dCtx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
      }
    }
    if (state.live2dCanvas && state.live2dCtx && Math.abs(nextDpr - (state.live2dDpr || 1)) > 0.01) {
      state.live2dDpr = nextDpr;
      state.live2dCanvas.width = Math.round(LIVE2D_W * nextDpr);
      state.live2dCanvas.height = Math.round(LIVE2D_H * nextDpr);
      if (typeof state.live2dCtx.setTransform === 'function') {
        state.live2dCtx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
      }
    }
  }

  function triggerLive2dReaction(kind, durationMs) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const normKind = String(kind || 'happy').trim().toLowerCase();
    if (normKind === 'typing' || normKind === 'combo') {
      state.l2dTypingImpulse = 1.0;
      state.l2dTypingCombo = normKind === 'combo' ? Math.max(5, state.l2dTypingCombo + 1) : (state.l2dTypingCombo + 1);
      state.l2dLastKeyAt = now;
    }
    state.l2dReaction = normKind || 'happy';
    state.l2dReactionUntil = now + Math.max(250, Number(durationMs) || 1200);
    if (state.live2dActive && !state.chibi3dActive && !isMotionPaused()) {
      updateAndRenderLive2d(now, 1, 0, false);
      resumeOrPauseAura();
    }
    return state.l2dReaction;
  }

  function setLive2dWorkState(workObj) {
    if (!workObj || typeof workObj !== 'object') return;
    const prevWorking = state.l2dAiWorking;
    const prevCrisis = state.l2dInCrisis;
    if (typeof workObj.working === 'boolean') {
      state.l2dAiWorking = workObj.working;
    }
    if (typeof workObj.crisis === 'boolean') {
      state.l2dInCrisis = workObj.crisis;
    }
    if (typeof workObj.bladeHeat === 'number' && Number.isFinite(workObj.bladeHeat)) {
      state.l2dBladeHeat = Math.max(0, Math.min(100, workObj.bladeHeat));
    }
    if ((prevWorking !== state.l2dAiWorking || prevCrisis !== state.l2dInCrisis) && state.live2dActive && !state.chibi3dActive && !isMotionPaused()) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      updateAndRenderLive2d(now, 1, 0, false);
      resumeOrPauseAura();
    }
  }

  function clearComposerLive2dVars(comp) {
    if (!comp) return;
    delete comp.dataset.chibiLive2d;
    delete comp.dataset.chibiLive2dMesh;
    delete comp.dataset.chibiLive2dMood;
    if (typeof comp.removeAttribute === 'function') {
      comp.removeAttribute('data-chibi-live2d');
      comp.removeAttribute('data-chibi-live2d-mesh');
      comp.removeAttribute('data-chibi-live2d-mood');
    }
    if (comp.style && typeof comp.style.removeProperty === 'function') {
      comp.style.removeProperty('--agy-l2d-tx');
      comp.style.removeProperty('--agy-l2d-ty');
      comp.style.removeProperty('--agy-l2d-rot');
      comp.style.removeProperty('--agy-l2d-sx');
      comp.style.removeProperty('--agy-l2d-sy');
      comp.style.removeProperty('--agy-l2d-glow-r');
      comp.style.removeProperty('--agy-l2d-glow-c');
      comp.style.removeProperty('--agy-l2d-clip-right');
    }
  }

  function updateAndRenderLive2d(now, dt, surgeProgress, isStatic) {
    if (!state.auraComposer) return;
    if (!state.live2dActive || state.chibi3dActive) {
      if (state.auraComposer.dataset && state.auraComposer.dataset.chibiLive2d) {
        clearComposerLive2dVars(state.auraComposer);
      }
      if (state.live2dCtx) {
        state.live2dCtx.setTransform(state.live2dDpr || 1, 0, 0, state.live2dDpr || 1, 0, 0);
        state.live2dCtx.clearRect(0, 0, LIVE2D_W, LIVE2D_H);
      }
      state.live2dMeshActive = false;
      state.l2dEffectiveMood = 'idle';
      return;
    }

    if (isStatic) {
      // When paused/reduced-motion: release mesh clip so native sharp static SVG renders at 0% GPU
      if (state.auraComposer.dataset && state.auraComposer.dataset.chibiLive2d) {
        clearComposerLive2dVars(state.auraComposer);
      }
      if (state.live2dCtx) {
        state.live2dCtx.setTransform(state.live2dDpr || 1, 0, 0, state.live2dDpr || 1, 0, 0);
        state.live2dCtx.clearRect(0, 0, LIVE2D_W, LIVE2D_H);
      }
      state.live2dMeshActive = false;
      state.l2dEffectiveMood = 'idle';
      return;
    }

    state.l2dFrameCount++;
    if (now > state.l2dReactionUntil && state.l2dReaction !== 'idle') {
      state.l2dReaction = 'idle';
    }
    if (state.l2dTypingCombo > 0 && now - state.l2dLastKeyAt > 2200) {
      state.l2dTypingCombo = 0;
    }
    state.l2dTypingImpulse *= Math.pow(0.84, dt);
    if (state.l2dTypingImpulse < 0.01) state.l2dTypingImpulse = 0;

    state.l2dLastUpdateAt = state.l2dLastUpdateAt || now;
    const elapsedMs = Math.max(4, Math.min(200, now - state.l2dLastUpdateAt));
    state.l2dLastUpdateAt = now;
    const dtSec = elapsedMs * 0.001;

    let mood = 'idle';
    if (now < state.l2dReactionUntil && state.l2dReaction !== 'idle') {
      mood = state.l2dReaction;
    } else if (state.l2dInCrisis || (state.auraComposer.dataset && state.auraComposer.dataset.agyCrisis === '1')) {
      mood = 'crisis';
    } else if (state.l2dAiWorking) {
      mood = 'thinking';
    } else if (now - state.l2dLastKeyAt < 1400) {
      mood = state.l2dTypingCombo >= 4 ? 'combo' : 'typing';
    }
    state.l2dEffectiveMood = mood;

    // Mouse gaze ALWAYS has absolute priority whenever cursor moved recently (< 2600ms).
    // Only when cursor has been completely idle during AI thinking does Chibi glance thoughtfully upward!
    const pointerIdleMs = now - (state.l2dLastPointerAt || 0);
    let targetX = state.l2dTargetLookX;
    let targetY = state.l2dTargetLookY;
    if (mood === 'thinking' && pointerIdleMs > 2600 && state.l2dLastPointerAt > 0) {
      targetX = state.l2dTargetLookX * 0.45 + Math.sin(now * 0.0014) * 0.22;
      targetY = -0.36 + Math.sin(now * 0.0022) * 0.08;
    } else if (state.l2dPointerOutside && pointerIdleMs > 5200) {
      const relax = Math.max(0.28, Math.exp(-(pointerIdleMs - 5200) / 3600));
      targetX *= relax;
      targetY *= relax;
    }

    // 3-Tier Biomimetic Kinematics:
    //  1) Eyes saccade rapidly toward cursor (tau = 36ms)
    //  2) Head follows smoothly with natural mass (tau = 102ms)
    //  3) Hair & accessories swing via damped harmonic spring
    const eyeLerp = 1 - Math.exp(-elapsedMs / 36);
    const headLerp = 1 - Math.exp(-elapsedMs / 102);
    state.l2dEyeLookX += (targetX - state.l2dEyeLookX) * eyeLerp;
    state.l2dEyeLookY += (targetY - state.l2dEyeLookY) * eyeLerp;

    const prevHeadX = state.l2dLookX;
    state.l2dLookX += (targetX - state.l2dLookX) * headLerp;
    state.l2dLookY += (targetY - state.l2dLookY) * headLerp;
    const headVelX = (state.l2dLookX - prevHeadX) / Math.max(0.008, dtSec);

    // Damped spring oscillator for hair/braids/earrings
    const springStep = Math.min(0.032, dtSec);
    const hairAcc = -140 * state.l2dHairSwing - 13.5 * state.l2dHairVel - headVelX * 0.48;
    state.l2dHairVel += hairAcc * springStep;
    state.l2dHairSwing = Math.max(-1.25, Math.min(1.25, state.l2dHairSwing + state.l2dHairVel * springStep));

    // Biomimetic Natural Eyelid Blink + Occasional Double-Blink
    if (!state.l2dNextBlinkAt) {
      state.l2dNextBlinkAt = now + 2200 + ((now * 17) % 2400);
    }
    if (state.l2dBlinkStartAt === 0 && now >= state.l2dNextBlinkAt) {
      state.l2dBlinkStartAt = now;
      state.l2dBlinkDuration = state.l2dDoubleBlinkPending ? 135 : 158;
    }
    if (state.l2dBlinkStartAt > 0) {
      const bp = (now - state.l2dBlinkStartAt) / state.l2dBlinkDuration;
      if (bp >= 1) {
        state.l2dBlinkStartAt = 0;
        state.l2dBlinkAmt = 0;
        if (state.l2dDoubleBlinkPending) {
          state.l2dDoubleBlinkPending = false;
          state.l2dNextBlinkAt = now + 3400 + ((state.l2dFrameCount * 193) % 2600);
        } else if ((state.l2dFrameCount % 5) === 0) {
          state.l2dDoubleBlinkPending = true;
          state.l2dNextBlinkAt = now + 130;
        } else {
          state.l2dNextBlinkAt = now + 3200 + ((state.l2dFrameCount * 157) % 2700);
        }
      } else {
        state.l2dBlinkAmt = Math.sin(bp * Math.PI);
      }
    } else {
      state.l2dBlinkAmt = (mood === 'happy' || mood === 'victory') ? 0.22 : 0;
    }

    const eco = Boolean(state.themeCfg && state.themeCfg.ecoBattery);
    if (
      eco &&
      mood === 'idle' &&
      state.l2dBlinkAmt === 0 &&
      Math.abs(targetX - state.l2dLookX) < 0.012 &&
      Math.abs(targetY - state.l2dLookY) < 0.012 &&
      (state.l2dFrameCount % 2 === 1)
    ) {
      return;
    }

    // Compute pose parameters for both 2.5D Mesh Rig and CSS fallback diagnostics
    const breath = Math.sin(now * 0.00205);
    let tx = state.l2dLookX * 7.2;
    let ty = -Math.max(0, breath) * 1.8 + state.l2dLookY * 4.2;
    let rot = state.l2dLookX * 5.2;
    let sx = 1.0 - breath * 0.009;
    let sy = 1.0 + breath * 0.020;
    let bounceY = 0;
    let moodRoll = 0;
    let glowR = state.l2dPointerProximity > 0.2 ? state.l2dPointerProximity * 5.5 : 0;
    const meta = state.auraMeta || CHAR_META.shinobu;
    let glowC = `rgba(${meta.rgb1}, 0.42)`;

    if (mood === 'thinking') {
      // Gentle meditative nod that NEVER overrides or fights horizontal cursor gaze!
      const thinkBob = Math.sin(now * 0.0036);
      bounceY -= 0.9 + thinkBob * 0.85;
      ty -= 0.9 + thinkBob * 0.85;
      if (pointerIdleMs > 1800) {
        moodRoll = Math.sin(now * 0.0026) * 0.025;
        rot += moodRoll * 35;
      }
      glowR = Math.max(glowR, 7);
      glowC = `rgba(${meta.rgb1}, 0.50)`;
    } else if (mood === 'typing' || mood === 'combo') {
      const imp = state.l2dTypingImpulse;
      bounceY -= imp * 4.6;
      ty -= imp * 4.6;
      sy += imp * 0.042;
      sx -= imp * 0.022;
      moodRoll = Math.sin(now * 0.014) * 0.024;
      rot += moodRoll * 40;
      glowR = Math.max(glowR, 5 + Math.min(8, state.l2dTypingCombo * 0.7));
      glowC = `rgba(${meta.rgb1}, 0.55)`;
    } else if (mood === 'crisis') {
      moodRoll = Math.sin(now * 0.030) * 0.032;
      bounceY -= 1.2;
      ty -= 1.2;
      rot += moodRoll * 45;
      glowR = 10;
      glowC = 'rgba(248, 113, 113, 0.68)';
    } else if (mood === 'victory' || mood === 'happy' || mood === 'focus') {
      const hop = Math.abs(Math.sin(now * 0.0086));
      bounceY -= hop * 6.4;
      ty -= hop * 6.4;
      sy = 1.0 + hop * 0.048 - (1 - hop) * 0.016;
      sx = 1.0 - hop * 0.022 + (1 - hop) * 0.012;
      moodRoll = Math.sin(now * 0.0086) * 0.052;
      rot += moodRoll * 48;
      glowR = mood === 'victory' ? 13 : 9;
      glowC = mood === 'victory' ? 'rgba(250, 204, 21, 0.68)' : `rgba(${meta.rgb1}, 0.56)`;
    }

    state.l2dTx = tx;
    state.l2dTy = ty;
    state.l2dRot = rot;
    state.l2dSx = sx;
    state.l2dSy = sy;

    const comp = state.auraComposer;
    if (comp.dataset.chibiLive2d !== '1') {
      comp.dataset.chibiLive2d = '1';
      if (typeof comp.setAttribute === 'function') comp.setAttribute('data-chibi-live2d', '1');
    }
    if (comp.dataset.chibiLive2dMood !== mood) {
      comp.dataset.chibiLive2dMood = mood;
    }

    let meshDrawn = false;
    if (state.live2dCtx && state.live2dRenderer) {
      const meshPose = {
        breath,
        eyeLookX: state.l2dEyeLookX,
        eyeLookY: state.l2dEyeLookY,
        headLookX: state.l2dLookX,
        headLookY: state.l2dLookY,
        hairSwing: state.l2dHairSwing,
        blinkAmt: state.l2dBlinkAmt,
        bounceY,
        squashX: sx,
        stretchY: sy,
        moodRoll,
        proximity: state.l2dPointerProximity,
        glowRadius: glowR,
        glowColor: glowC
      };
      meshDrawn = Boolean(
        state.live2dRenderer.render(
          state.live2dCtx,
          now,
          mood,
          state.l2dTypingCombo,
          state.l2dLookX,
          state.l2dLookY,
          surgeProgress,
          state.live2dMeshCtrl,
          state.live2dDpr || 1,
          comp,
          meshPose
        )
      );
    }

    state.live2dMeshActive = meshDrawn;
    if (meshDrawn && state.live2dMeshCtrl) {
      const clipPx = `${state.live2dMeshCtrl.rig.clipRightPx.toFixed(2)}px`;
      if (comp.dataset.chibiLive2dMesh !== '1') {
        comp.dataset.chibiLive2dMesh = '1';
        if (typeof comp.setAttribute === 'function') comp.setAttribute('data-chibi-live2d-mesh', '1');
      }
      if (comp.style && typeof comp.style.setProperty === 'function') {
        comp.style.setProperty('--agy-l2d-clip-right', clipPx);
      }
    } else if (comp.dataset.chibiLive2dMesh) {
      delete comp.dataset.chibiLive2dMesh;
      if (typeof comp.removeAttribute === 'function') comp.removeAttribute('data-chibi-live2d-mesh');
      if (comp.style && typeof comp.style.removeProperty === 'function') {
        comp.style.removeProperty('--agy-l2d-clip-right');
      }
    }

    if (comp.style && typeof comp.style.setProperty === 'function') {
      comp.style.setProperty('--agy-l2d-tx', `${tx.toFixed(2)}px`);
      comp.style.setProperty('--agy-l2d-ty', `${ty.toFixed(2)}px`);
      comp.style.setProperty('--agy-l2d-rot', `${rot.toFixed(2)}deg`);
      comp.style.setProperty('--agy-l2d-sx', sx.toFixed(3));
      comp.style.setProperty('--agy-l2d-sy', sy.toFixed(3));
      comp.style.setProperty('--agy-l2d-glow-r', `${glowR.toFixed(1)}px`);
      comp.style.setProperty('--agy-l2d-glow-c', glowC);
    }
  }

  function getChibi2dLiveState() {
    return {
      active: Boolean(state.live2dActive && !state.chibi3dActive),
      enabled: isChibi2dLiveEnabled(state.themeCfg || state.uiThemeCfg),
      meshActive: Boolean(state.live2dMeshActive),
      charId: state.auraCharId || '',
      mood: state.l2dEffectiveMood || 'idle',
      typingCombo: state.l2dTypingCombo || 0,
      eyeLookX: state.l2dEyeLookX || 0,
      eyeLookY: state.l2dEyeLookY || 0,
      lookX: state.l2dLookX || 0,
      lookY: state.l2dLookY || 0,
      targetLookX: state.l2dTargetLookX || 0,
      targetLookY: state.l2dTargetLookY || 0,
      hairSwing: state.l2dHairSwing || 0,
      blinkAmt: state.l2dBlinkAmt || 0,
      tx: state.l2dTx || 0,
      ty: state.l2dTy || 0,
      rot: state.l2dRot || 0,
      sx: state.l2dSx || 1,
      sy: state.l2dSy || 1,
      aiWorking: Boolean(state.l2dAiWorking),
      inCrisis: Boolean(state.l2dInCrisis),
      frameCount: state.l2dFrameCount || 0
    };
  }

  function notifyChibiReaction(kind, durationMs) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cleanKind = String(kind || 'happy');
    state.chibi3dReaction = cleanKind;
    state.chibi3dReactionUntil = now + Math.max(200, Number(durationMs) || 1000);
    triggerLive2dReaction(cleanKind === 'focus' ? 'typing' : cleanKind, durationMs);
    if (state.chibi3dActive && isMotionPaused()) {
      drawStaticAuraFrame();
    }
  }

  function getChibi3dState() {
    return {
      active: Boolean(state.chibi3dActive),
      mode: state.chibi3dLastMode || '',
      charId: state.auraCharId || '',
      reaction: state.chibi3dReaction || 'idle',
      orbitYaw: state.chibi3dOrbitYaw || 0,
      orbitPitch: state.chibi3dOrbitPitch || 0,
      lookYaw: state.chibi3dLookYaw || 0,
      lookPitch: state.chibi3dLookPitch || 0,
      dragging: Boolean(state.chibi3dDragging)
    };
  }

  function renderChibi3dFrame(now, dt, surgeProgress, isStatic) {
    if (!state.chibi3dActive || !state.chibi3dCtx) return;
    const c3d = getChibi3dApi();
    if (!c3d || typeof c3d.renderChibiTo2D !== 'function') return;

    if (now > state.chibi3dReactionUntil && state.chibi3dReaction !== 'idle') {
      state.chibi3dReaction = 'idle';
    }
    const lerpRate = Math.min(0.45, 0.14 * dt);
    state.chibi3dLookYaw += (state.chibi3dTargetLookYaw - state.chibi3dLookYaw) * lerpRate;
    state.chibi3dLookPitch += (state.chibi3dTargetLookPitch - state.chibi3dLookPitch) * lerpRate;

    if (!isStatic && !state.chibi3dDragging && state.chibi3dSpringBackAt > 0 && now >= state.chibi3dSpringBackAt) {
      let yawDiff = -state.chibi3dOrbitYaw;
      yawDiff = ((yawDiff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(yawDiff) < 0.01 && Math.abs(state.chibi3dOrbitPitch) < 0.01) {
        state.chibi3dOrbitYaw = 0;
        state.chibi3dOrbitPitch = 0;
        state.chibi3dSpringBackAt = 0;
      } else {
        state.chibi3dOrbitYaw += yawDiff * Math.min(0.35, 0.10 * dt);
        state.chibi3dOrbitPitch += (0 - state.chibi3dOrbitPitch) * Math.min(0.35, 0.10 * dt);
      }
    }

    const activeReaction = surgeProgress > 0.22 ? 'attack' : state.chibi3dReaction;
    const eco = Boolean(state.themeCfg && state.themeCfg.ecoBattery);
    if (eco && !isStatic && !state.chibi3dDragging && activeReaction === 'idle' && (state.chibi3dFrameCount % 2 === 1)) {
      return;
    }

    const cycle = now % 4200;
    const blinkAmt = (!isStatic && cycle > 4020) ? Math.sin(((cycle - 4020) / 180) * Math.PI) : 0;
    const res = c3d.renderChibiTo2D(
      state.chibi3dCtx,
      CHIBI_3D_W,
      CHIBI_3D_H,
      state.auraCharId || 'shinobu',
      {
        timeSec: now * 0.001,
        isStatic: Boolean(isStatic),
        lookYaw: state.chibi3dLookYaw,
        lookPitch: state.chibi3dLookPitch,
        orbitYaw: state.chibi3dOrbitYaw,
        orbitPitch: state.chibi3dOrbitPitch,
        reaction: activeReaction,
        blinkAmt,
        surge: surgeProgress,
        allowProcedural3d: Boolean(state.themeCfg && state.themeCfg.allowProcedural3d)
      },
      { dpr: state.chibi3dDpr || state.auraDpr || 1 }
    );
    if (res && res.mode) state.chibi3dLastMode = res.mode;
  }

  function drawStaticAuraFrame() {
    if (!state.auraCtx || !state.auraScene) return;
    syncAuraCanvasDpr();
    state.auraScene.render(state.auraCtx, 1800, 1, 1, 0, true);
    renderChibi3dFrame(1800, 1, 0, true);
    updateAndRenderLive2d(1800, 1, 0, true);
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
    state.chibi3dFrameCount++;

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
    renderChibi3dFrame(now, dt, surgeProgress, false);
    updateAndRenderLive2d(now, dt, surgeProgress, false);
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
    if (state.surgeTimer) {
      clearTimeout(state.surgeTimer);
      state.surgeTimer = 0;
    }
    if (state.focusSyncTimer) {
      clearTimeout(state.focusSyncTimer);
      state.focusSyncTimer = 0;
    }
    if (state.chibi3dDragReleaseTimer) {
      clearTimeout(state.chibi3dDragReleaseTimer);
      state.chibi3dDragReleaseTimer = 0;
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
      delete state.auraComposer.dataset.chibi3dActive;
      delete state.auraComposer.dataset.chibi3dDragging;
      clearComposerLive2dVars(state.auraComposer);
      if (typeof state.auraComposer.removeAttribute === 'function') {
        state.auraComposer.removeAttribute('data-chibi-3d-active');
        state.auraComposer.removeAttribute('data-chibi-3d-dragging');
      }
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('agy-chibi-aura').forEach((el) => el.remove());
      document.querySelectorAll('.agy-chibi-live2d-overlay').forEach((el) => el.remove());
      document.querySelectorAll('.agy-user-chibi-aura-wave').forEach((el) => el.remove());
      if (document.body) delete document.body.dataset.agyFxPaused;
    }
    state.auraComposer = null;
    state.auraHost = null;
    state.auraCanvas = null;
    state.auraCtx = null;
    state.chibi3dCanvas = null;
    state.chibi3dCtx = null;
    state.chibi3dActive = false;
    state.chibi3dDpr = 1;
    state.chibi3dLookYaw = 0;
    state.chibi3dLookPitch = 0;
    state.chibi3dTargetLookYaw = 0;
    state.chibi3dTargetLookPitch = 0;
    state.chibi3dOrbitYaw = 0;
    state.chibi3dOrbitPitch = 0;
    state.chibi3dReaction = 'idle';
    state.chibi3dReactionUntil = 0;
    state.chibi3dDragging = false;
    state.chibi3dMoved = false;
    state.chibi3dSpringBackAt = 0;
    state.chibi3dFrameCount = 0;
    state.chibi3dLastMode = '';
    state.chibi3dRectCacheAt = 0;
    state.chibi3dRectCache = null;
    if (state.live2dMeshCtrl && typeof state.live2dMeshCtrl.dispose === 'function') {
      try { state.live2dMeshCtrl.dispose(); } catch (_) {}
    }
    state.live2dCanvas = null;
    state.live2dCtx = null;
    state.live2dRenderer = null;
    state.live2dMeshCtrl = null;
    state.live2dMeshActive = false;
    state.live2dActive = false;
    state.live2dDpr = 1;
    state.l2dEyeLookX = 0;
    state.l2dEyeLookY = 0;
    state.l2dLookX = 0;
    state.l2dLookY = 0;
    state.l2dTargetLookX = 0;
    state.l2dTargetLookY = 0;
    state.l2dHairSwing = 0;
    state.l2dHairVel = 0;
    state.l2dPrevLookX = 0;
    state.l2dBlinkAmt = 0;
    state.l2dBlinkStartAt = 0;
    state.l2dNextBlinkAt = 0;
    state.l2dDoubleBlinkPending = false;
    state.l2dLastPointerAt = 0;
    state.l2dPointerProximity = 0;
    state.l2dTypingImpulse = 0;
    state.l2dTypingCombo = 0;
    state.l2dTx = 0;
    state.l2dTy = 0;
    state.l2dRot = 0;
    state.l2dSx = 1;
    state.l2dSy = 1;
    state.l2dEffectiveMood = 'idle';
    state.l2dFrameCount = 0;
    state.l2dLastUpdateAt = 0;
    state.l2dRectCacheAt = 0;
    state.l2dRectCache = null;
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
    if (themeCfg && typeof themeCfg === 'object') {
      state.themeCfg = themeCfg;
    }
    const meta = resolveCharacterMeta(themeCfg, charId);
    const want3d = isChibi3dActiveForConfig(themeCfg, meta.charId);
    if (!want3d && isChibi3dExplicitlyEnabled(themeCfg)) {
      const c3dProbe = getChibi3dApi();
      const targetCharId = meta.charId;
      const tryRemountIfRealGlbReady = () => {
        if (
          c3dProbe &&
          typeof c3dProbe.hasRealGlbModel === 'function' &&
          c3dProbe.hasRealGlbModel(targetCharId) &&
          state.auraComposer === composer &&
          composer.isConnected &&
          state.auraCharId === targetCharId &&
          !state.chibi3dActive &&
          isChibi3dExplicitlyEnabled(state.themeCfg || themeCfg)
        ) {
          mountChibiAura(composer, state.themeCfg || themeCfg, targetCharId);
        }
      };
      if (c3dProbe && typeof c3dProbe.hydrateCustomModelsFromDb === 'function') {
        try {
          Promise.resolve(c3dProbe.hydrateCustomModelsFromDb()).then(tryRemountIfRealGlbReady).catch(() => {});
        } catch (_) {}
      }
      if (c3dProbe && typeof c3dProbe.preloadAssetGlb === 'function') {
        try {
          c3dProbe.preloadAssetGlb(targetCharId, tryRemountIfRealGlbReady);
        } catch (_) {}
      }
    }

    // Preload Full-Body Action Chibi PNG sprite into memory when 2D sprite mode or fallback
    if (typeof window !== 'undefined' && window.__AGY_KNY_SKILLS__ && typeof window.__AGY_KNY_SKILLS__.preloadActionSprite === 'function') {
      try {
        const safeAct = safeResolveAsset(themeCfg && themeCfg.actionSticker);
        window.__AGY_KNY_SKILLS__.preloadActionSprite(meta.charId, safeAct);
      } catch (_) {}
    }

    // Idempotent fast-path when tick() re-invokes with identical composer, mode, and 3D/Live2D state
    const want2dLive = !want3d && isChibi2dLiveEnabled(themeCfg);
    if (
      state.auraHost &&
      state.auraHost.parentElement === composer &&
      state.auraMode === meta.auraMode &&
      state.auraCharId === meta.charId &&
      state.chibi3dActive === want3d &&
      state.live2dActive === want2dLive
    ) {
      syncBubbleFrames();
      resumeOrPauseAura();
      return state.auraHost;
    }

    teardownAura();
    if (themeCfg && typeof themeCfg === 'object') {
      state.themeCfg = themeCfg;
    }

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

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    host.appendChild(canvas);

    let chibi3dCanvas = null;
    let chibi3dCtx = null;
    if (want3d) {
      chibi3dCanvas = document.createElement('canvas');
      chibi3dCanvas.className = 'agy-chibi-3d-canvas';
      chibi3dCanvas.width = Math.round(CHIBI_3D_W * dpr);
      chibi3dCanvas.height = Math.round(CHIBI_3D_H * dpr);
      chibi3dCanvas.style.cssText =
        'position: absolute; right: 2px; bottom: -2px; width: 136px; height: 112px; z-index: 3; display: block; pointer-events: none;';
      chibi3dCtx = chibi3dCanvas.getContext('2d');
      if (chibi3dCtx) {
        if (typeof chibi3dCtx.setTransform === 'function') chibi3dCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        host.appendChild(chibi3dCanvas);
      } else {
        chibi3dCanvas = null;
      }
    }

    let live2dCanvas = null;
    let live2dCtx = null;
    if (want2dLive) {
      live2dCanvas = document.createElement('canvas');
      live2dCanvas.className = 'agy-chibi-live2d-overlay';
      live2dCanvas.setAttribute('aria-hidden', 'true');
      live2dCanvas.width = Math.round(LIVE2D_W * dpr);
      live2dCanvas.height = Math.round(LIVE2D_H * dpr);
      live2dCanvas.style.cssText =
        `pointer-events: none; position: absolute; top: ${LIVE2D_TOP}px; right: ${LIVE2D_RIGHT}px; width: ${LIVE2D_W}px; height: ${LIVE2D_H}px; z-index: 31; display: block;`;
      live2dCtx = live2dCanvas.getContext('2d');
      if (live2dCtx) {
        if (typeof live2dCtx.setTransform === 'function') live2dCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else {
        live2dCanvas = null;
      }
    }

    composer.appendChild(host);
    if (live2dCanvas) {
      composer.appendChild(live2dCanvas);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.auraComposer = composer;
    state.auraHost = host;
    state.auraCanvas = canvas;
    state.auraCtx = ctx;
    state.auraDpr = dpr;
    state.chibi3dCanvas = chibi3dCanvas;
    state.chibi3dCtx = chibi3dCtx;
    state.chibi3dActive = Boolean(chibi3dCanvas && chibi3dCtx);
    state.chibi3dDpr = dpr;
    state.live2dCanvas = live2dCanvas;
    state.live2dCtx = live2dCtx;
    state.live2dActive = Boolean(!state.chibi3dActive && live2dCanvas && live2dCtx);
    state.live2dDpr = dpr;
    state.live2dRenderer = state.live2dActive ? createLive2dForegroundRenderer(meta.auraMode, meta) : null;
    state.live2dMeshCtrl = state.live2dActive
      ? createLive2dMeshRig(meta.charId, state.themeCfg || themeCfg, meta, () => {
          if (state.live2dActive && !state.chibi3dActive && !isMotionPaused()) {
            const nowR = typeof performance !== 'undefined' ? performance.now() : Date.now();
            updateAndRenderLive2d(nowR, 1, 0, false);
          }
        })
      : null;
    if (state.chibi3dActive) {
      composer.dataset.chibi3dActive = '1';
      if (typeof composer.setAttribute === 'function') composer.setAttribute('data-chibi-3d-active', '1');
      const c3d = getChibi3dApi();
      if (c3d && typeof c3d.hydrateCustomModelsFromDb === 'function') {
        try { Promise.resolve(c3d.hydrateCustomModelsFromDb()).catch(() => {}); } catch (_) {}
      }
    } else {
      delete composer.dataset.chibi3dActive;
      if (typeof composer.removeAttribute === 'function') composer.removeAttribute('data-chibi-3d-active');
    }
    state.auraMode = meta.auraMode;
    state.auraCharId = meta.charId;
    state.auraMeta = meta;
    state.auraScene = createChibiAuraScene(meta.auraMode, meta);

    /**
     * Compute normalized gaze vector [-1..+1] anchored directly at the Chibi's anatomical eye center
     * on the top-right corner of `.surface-composer`, with smooth asymmetric viewport spans so
     * looking left, right (even near right screen edge), up (code/chat), and down (composer input)
     * all feel crisp, proportional, and dead-zone free.
     */
    const computeEyeAnchoredGaze = (cx, cy, now) => {
      const refComp = state.auraComposer || composer;
      if ((!state.l2dRectCache || now - state.l2dRectCacheAt > 180) && refComp && typeof refComp.getBoundingClientRect === 'function') {
        state.l2dRectCache = refComp.getBoundingClientRect();
        state.l2dRectCacheAt = now;
      }
      const rect = state.l2dRectCache;
      if (!rect || !(rect.width > 0)) return null;

      const { sTop, sRight, sW, sH } = readComposerStickerMetrics(refComp, state.themeCfg || themeCfg);
      // Chibi sits in the right ~56% of the 180x88 ornament box -> eye midpoint is ~28% of sW inward from right edge
      const eyeAnchorX = rect.right - sRight - sW * 0.28;
      const eyeAnchorY = rect.top + sTop + sH * 0.48;
      const vw = (typeof window !== 'undefined' && window.innerWidth) || Math.max(960, rect.right + 24);
      const vh = (typeof window !== 'undefined' && window.innerHeight) || Math.max(680, rect.bottom + 24);

      const dx = cx - eyeAnchorX;
      const dy = cy - eyeAnchorY;

      // 3D Optical Viewing-Cone (atan2 perspective with virtual focal depth Z from iris to glass plane)
      // Gives crisp, natural angular sensitivity right around the Chibi's face while smoothly saturating toward screen edges.
      const rightRoom = Math.max(46, vw - eyeAnchorX - 6);
      const downRoom = Math.max(64, vh - eyeAnchorY - 6);
      const focalLeft = 175;
      const focalRight = Math.min(165, Math.max(48, rightRoom * 0.72));
      const focalUp = 165;
      const focalDown = Math.min(145, Math.max(55, downRoom * 0.65));
      const invConeHalfAngle = 1 / (Math.PI * 0.38);

      const rawNx = (dx < 0 ? Math.atan2(dx, focalLeft) : Math.atan2(dx, focalRight)) * invConeHalfAngle;
      const rawNy = (dy < 0 ? Math.atan2(dy, focalUp) : Math.atan2(dy, focalDown)) * invConeHalfAngle;
      const gazeX = Math.tanh(rawNx * 1.08);
      const gazeY = Math.tanh(rawNy * 1.08);
      const dist = Math.hypot(dx, dy);
      const proximity = Math.max(0, Math.min(1, 1 - dist / 185));
      return { gazeX, gazeY, proximity };
    };

    const wakeUnfocusedPointerIfNeeded = () => {
      if (typeof document !== 'undefined' && !document.hidden && typeof window !== 'undefined' && window.__AGY_SHINOBU_RT__ && window.__AGY_SHINOBU_RT__.fxFocusPaused) {
        window.__AGY_SHINOBU_RT__.fxFocusPaused = false;
        resumeOrPauseAura();
      }
    };

    const bindSameOriginIframePointerForwarder = (onClientPoint) => {
      if (typeof document === 'undefined') return () => {};
      const hookedFrames = new Set();
      const cleanups = [];
      let lastScanAt = 0;
      const scanFrames = () => {
        const frames = document.querySelectorAll('iframe');
        frames.forEach((fr) => {
          if (hookedFrames.has(fr)) return;
          try {
            const cw = fr.contentWindow;
            const cd = fr.contentDocument;
            if (!cw || !cd) return;
            hookedFrames.add(fr);
            const onFrameMove = (fev) => {
              if (!fr.isConnected) return;
              const fRect = fr.getBoundingClientRect();
              onClientPoint((Number(fev.clientX) || 0) + fRect.left, (Number(fev.clientY) || 0) + fRect.top);
            };
            cw.addEventListener('pointermove', onFrameMove, { capture: true, passive: true });
            cleanups.push(() => {
              try { cw.removeEventListener('pointermove', onFrameMove, true); } catch (_) {}
            });
          } catch (_) {
            // Cross-origin or sandboxed iframe — safely ignore without throwing
            hookedFrames.add(fr);
          }
        });
      };
      const maybeRescan = () => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - lastScanAt < 2500) return;
        lastScanAt = now;
        scanFrames();
      };
      maybeRescan();
      document.addEventListener('focusin', maybeRescan, { passive: true });
      return () => {
        document.removeEventListener('focusin', maybeRescan);
        while (cleanups.length > 0) {
          const fn = cleanups.pop();
          fn();
        }
        hookedFrames.clear();
      };
    };

    if (state.chibi3dActive) {
      let dragStartX = 0;
      let dragStartY = 0;
      let dragBaseYaw = 0;
      let dragBasePitch = 0;
      const nowFn = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

      const handlePoint3d = (cx, cy) => {
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
        wakeUnfocusedPointerIfNeeded();
        if (state.chibi3dDragging) {
          const dx = cx - dragStartX;
          const dy = cy - dragStartY;
          if (!state.chibi3dMoved && Math.hypot(dx, dy) >= 6) {
            state.chibi3dMoved = true;
            if (state.auraComposer) {
              state.auraComposer.dataset.chibi3dDragging = '1';
              if (typeof state.auraComposer.setAttribute === 'function') {
                state.auraComposer.setAttribute('data-chibi-3d-dragging', '1');
              }
            }
          }
          if (state.chibi3dMoved) {
            state.chibi3dOrbitYaw = dragBaseYaw + dx * 0.016;
            state.chibi3dOrbitPitch = Math.max(-0.55, Math.min(0.55, dragBasePitch + dy * 0.01));
          }
          return;
        }
        const g = computeEyeAnchoredGaze(cx, cy, nowFn());
        if (g) {
          state.chibi3dTargetLookYaw = g.gazeX * 0.56;
          state.chibi3dTargetLookPitch = -g.gazeY * 0.42;
        }
      };

      const onComposerPointerDown = (ev) => {
        const tgt = ev.target;
        if (!tgt || typeof tgt.closest !== 'function' || !tgt.closest('.agy-chibi-hitbox')) return;
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        if (state.chibi3dDragReleaseTimer) {
          clearTimeout(state.chibi3dDragReleaseTimer);
          state.chibi3dDragReleaseTimer = 0;
        }
        dragStartX = Number(ev.clientX) || 0;
        dragStartY = Number(ev.clientY) || 0;
        dragBaseYaw = state.chibi3dOrbitYaw;
        dragBasePitch = state.chibi3dOrbitPitch;
        state.chibi3dDragging = true;
        state.chibi3dMoved = false;
      };
      let lastEv3d = null;
      const onWinPointer3d = (ev) => {
        if (!ev || ev === lastEv3d) return;
        lastEv3d = ev;
        handlePoint3d(Number(ev.clientX), Number(ev.clientY));
      };
      const finishDrag = () => {
        if (!state.chibi3dDragging) return;
        const hadMoved = state.chibi3dMoved;
        state.chibi3dDragging = false;
        state.chibi3dMoved = false;
        state.chibi3dSpringBackAt = nowFn() + 2200;
        if (hadMoved) {
          clearTimeout(state.chibi3dDragReleaseTimer);
          state.chibi3dDragReleaseTimer = setTimeout(() => {
            state.chibi3dDragReleaseTimer = 0;
            if (state.auraComposer) {
              delete state.auraComposer.dataset.chibi3dDragging;
              if (typeof state.auraComposer.removeAttribute === 'function') {
                state.auraComposer.removeAttribute('data-chibi-3d-dragging');
              }
            }
          }, 60);
        } else if (state.auraComposer) {
          delete state.auraComposer.dataset.chibi3dDragging;
          if (typeof state.auraComposer.removeAttribute === 'function') {
            state.auraComposer.removeAttribute('data-chibi-3d-dragging');
          }
        }
      };
      const onComposerDblClick = (ev) => {
        const tgt = ev.target;
        if (!tgt || typeof tgt.closest !== 'function' || !tgt.closest('.agy-chibi-hitbox')) return;
        state.chibi3dOrbitYaw = 0;
        state.chibi3dOrbitPitch = 0;
        state.chibi3dSpringBackAt = 0;
        notifyChibiReaction('happy', 1200);
      };
      const onComposerKeyDown = (ev) => {
        if (ev && ev.key === 'Enter' && !ev.shiftKey) {
          notifyChibiReaction('happy', 900);
        } else {
          notifyChibiReaction('focus', 700);
        }
      };

      composer.addEventListener('pointerdown', onComposerPointerDown, true);
      composer.addEventListener('dblclick', onComposerDblClick, true);
      composer.addEventListener('keydown', onComposerKeyDown, { passive: true });
      document.addEventListener('pointermove', onWinPointer3d, { capture: true, passive: true });
      document.addEventListener('mousemove', onWinPointer3d, { capture: true, passive: true });
      document.addEventListener('dragover', onWinPointer3d, { capture: true, passive: true });
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pointermove', onWinPointer3d, { capture: true, passive: true });
        window.addEventListener('mousemove', onWinPointer3d, { capture: true, passive: true });
        window.addEventListener('dragover', onWinPointer3d, { capture: true, passive: true });
        state.auraCleanups.push(() => window.removeEventListener('pointermove', onWinPointer3d, true));
        state.auraCleanups.push(() => window.removeEventListener('mousemove', onWinPointer3d, true));
        state.auraCleanups.push(() => window.removeEventListener('dragover', onWinPointer3d, true));
      }
      document.addEventListener('pointerup', finishDrag, { passive: true });
      document.addEventListener('pointercancel', finishDrag, { passive: true });
      state.auraCleanups.push(bindSameOriginIframePointerForwarder(handlePoint3d));
      state.auraCleanups.push(() => composer.removeEventListener('pointerdown', onComposerPointerDown, true));
      state.auraCleanups.push(() => composer.removeEventListener('dblclick', onComposerDblClick, true));
      state.auraCleanups.push(() => composer.removeEventListener('keydown', onComposerKeyDown));
      state.auraCleanups.push(() => document.removeEventListener('pointermove', onWinPointer3d, true));
      state.auraCleanups.push(() => document.removeEventListener('mousemove', onWinPointer3d, true));
      state.auraCleanups.push(() => document.removeEventListener('dragover', onWinPointer3d, true));
      state.auraCleanups.push(() => document.removeEventListener('pointerup', finishDrag));
      state.auraCleanups.push(() => document.removeEventListener('pointercancel', finishDrag));
    } else if (state.live2dActive) {
      const nowFn2d = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);

      const handlePoint2d = (cx, cy) => {
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
        wakeUnfocusedPointerIfNeeded();
        const now = nowFn2d();
        state.l2dLastPointerAt = now;
        state.l2dPointerOutside = false;
        const g = computeEyeAnchoredGaze(cx, cy, now);
        if (g) {
          state.l2dTargetLookX = g.gazeX;
          state.l2dTargetLookY = g.gazeY;
          state.l2dPointerProximity = g.proximity;
          if (state.live2dActive && !state.chibi3dActive && !isMotionPaused() && now - (state.l2dLastUpdateAt || 0) > 20) {
            updateAndRenderLive2d(now, 1, 0, false);
          }
        }
      };

      let lastEv2d = null;
      const onWinPointer2d = (ev) => {
        if (!ev || ev === lastEv2d) return;
        lastEv2d = ev;
        handlePoint2d(Number(ev.clientX), Number(ev.clientY));
      };

      const onDocMouseLeave2d = (ev) => {
        if (ev && Number.isFinite(ev.clientX) && Number.isFinite(ev.clientY)) {
          const g = computeEyeAnchoredGaze(ev.clientX, ev.clientY, nowFn2d());
          if (g) {
            state.l2dTargetLookX = g.gazeX;
            state.l2dTargetLookY = g.gazeY;
          }
        }
        state.l2dPointerOutside = true;
        state.l2dPointerProximity = 0;
      };

      const onComposerPointerOver2d = (ev) => {
        const tgt = ev.target;
        if (!tgt || typeof tgt.closest !== 'function' || !tgt.closest('.agy-chibi-hitbox')) return;
        const now = nowFn2d();
        if (now - state.l2dLastHoverAt > 2400 && state.l2dEffectiveMood === 'idle') {
          state.l2dLastHoverAt = now;
          triggerLive2dReaction('happy', 850);
        }
      };

      const onDocKeyDown2d = (ev) => {
        if (!ev || MODIFIER_ONLY_KEYS.has(ev.key)) return;
        const tgt = ev.target;
        if (!tgt) return;
        const tag = String(tgt.tagName || '').toUpperCase();
        const isEditable =
          tag === 'TEXTAREA' ||
          tag === 'INPUT' ||
          Boolean(tgt.isContentEditable) ||
          Boolean(typeof tgt.closest === 'function' && tgt.closest('.surface-composer, .monaco-editor, .xterm, [contenteditable="true"]'));
        if (!isEditable) return;
        const inComposer = Boolean(typeof tgt.closest === 'function' && tgt.closest('.surface-composer'));
        if (inComposer && ev.key === 'Enter' && !ev.shiftKey) {
          triggerLive2dReaction('happy', 1150);
          return;
        }
        const now = nowFn2d();
        if (now - state.l2dLastKeyAt > 2200) {
          state.l2dTypingCombo = 1;
        } else {
          state.l2dTypingCombo = Math.min(99, state.l2dTypingCombo + 1);
        }
        state.l2dLastKeyAt = now;
        state.l2dTypingImpulse = 1.0;

        // Caret-following gaze when hands are on keyboard (> 1200ms since last mouse move)
        if (now - (state.l2dLastPointerAt || 0) > 1200 && typeof window !== 'undefined' && typeof window.getSelection === 'function') {
          try {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const cr = sel.getRangeAt(0).getBoundingClientRect();
              if (cr && (cr.left > 0 || cr.top > 0)) {
                const cg = computeEyeAnchoredGaze(cr.left + cr.width * 0.5, cr.top + cr.height * 0.5, now);
                if (cg) {
                  state.l2dTargetLookX = cg.gazeX;
                  state.l2dTargetLookY = cg.gazeY;
                }
              }
            } else if (typeof tgt.getBoundingClientRect === 'function') {
              const tr = tgt.getBoundingClientRect();
              if (tr && tr.width > 0) {
                const cg = computeEyeAnchoredGaze(tr.left + Math.min(tr.width * 0.45, 220), tr.top + 18, now);
                if (cg) {
                  state.l2dTargetLookX = cg.gazeX;
                  state.l2dTargetLookY = cg.gazeY;
                }
              }
            }
          } catch (_) {}
        }
      };

      document.addEventListener('pointermove', onWinPointer2d, { capture: true, passive: true });
      document.addEventListener('mousemove', onWinPointer2d, { capture: true, passive: true });
      document.addEventListener('pointerdown', onWinPointer2d, { capture: true, passive: true });
      document.addEventListener('dragover', onWinPointer2d, { capture: true, passive: true });
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pointermove', onWinPointer2d, { capture: true, passive: true });
        window.addEventListener('mousemove', onWinPointer2d, { capture: true, passive: true });
        window.addEventListener('pointerdown', onWinPointer2d, { capture: true, passive: true });
        window.addEventListener('dragover', onWinPointer2d, { capture: true, passive: true });
        state.auraCleanups.push(() => window.removeEventListener('pointermove', onWinPointer2d, true));
        state.auraCleanups.push(() => window.removeEventListener('mousemove', onWinPointer2d, true));
        state.auraCleanups.push(() => window.removeEventListener('pointerdown', onWinPointer2d, true));
        state.auraCleanups.push(() => window.removeEventListener('dragover', onWinPointer2d, true));
      }
      document.addEventListener('keydown', onDocKeyDown2d, { passive: true });
      composer.addEventListener('pointerover', onComposerPointerOver2d, { passive: true });
      state.auraCleanups.push(bindSameOriginIframePointerForwarder(handlePoint2d));
      if (document.documentElement) {
        document.documentElement.addEventListener('mouseleave', onDocMouseLeave2d, { passive: true });
        state.auraCleanups.push(() => document.documentElement.removeEventListener('mouseleave', onDocMouseLeave2d));
      }
      state.auraCleanups.push(() => document.removeEventListener('pointermove', onWinPointer2d, true));
      state.auraCleanups.push(() => document.removeEventListener('mousemove', onWinPointer2d, true));
      state.auraCleanups.push(() => document.removeEventListener('pointerdown', onWinPointer2d, true));
      state.auraCleanups.push(() => document.removeEventListener('dragover', onWinPointer2d, true));
      state.auraCleanups.push(() => document.removeEventListener('keydown', onDocKeyDown2d));
      state.auraCleanups.push(() => composer.removeEventListener('pointerover', onComposerPointerOver2d));
    }

    const onVis = () => resumeOrPauseAura();
    const onFocusArbiterSync = () => {
      clearTimeout(state.focusSyncTimer);
      state.focusSyncTimer = setTimeout(() => {
        state.focusSyncTimer = 0;
        resumeOrPauseAura();
      }, 0);
    };
    const onResizeDpr = () => {
      syncAuraCanvasDpr();
      if (isMotionPaused()) drawStaticAuraFrame();
    };
    document.addEventListener('visibilitychange', onVis);
    state.auraCleanups.push(() => document.removeEventListener('visibilitychange', onVis));
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResizeDpr, { passive: true });
      window.addEventListener('blur', onFocusArbiterSync, { passive: true });
      window.addEventListener('focus', onFocusArbiterSync, { passive: true });
      state.auraCleanups.push(() => window.removeEventListener('resize', onResizeDpr));
      state.auraCleanups.push(() => window.removeEventListener('blur', onFocusArbiterSync));
      state.auraCleanups.push(() => window.removeEventListener('focus', onFocusArbiterSync));
    }
    if (document.documentElement) {
      const docEl = document.documentElement;
      docEl.addEventListener('mouseleave', onFocusArbiterSync, { passive: true });
      docEl.addEventListener('mouseenter', onFocusArbiterSync, { passive: true });
      state.auraCleanups.push(() => docEl.removeEventListener('mouseleave', onFocusArbiterSync));
      state.auraCleanups.push(() => docEl.removeEventListener('mouseenter', onFocusArbiterSync));
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
        onFocusArbiterSync();
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
        state.attackTimer = 0;
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
      clearTimeout(state.surgeTimer);
      state.surgeTimer = setTimeout(() => {
        state.surgeTimer = 0;
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

    // Advance sequential combo pointer for next Chibi click (do NOT overwrite user combo progress during automated Finisher!)
    if (!opts.fromFinisher) {
      state.comboIdxByChar[charId] = (safeIdx + 1) % skills.length;
    }

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
      const castCfg = state.uiThemeCfg || state.themeCfg;
      const active3dCast = isChibi3dActiveForConfig(castCfg, charId);
      try {
        ext.castSkill(charId, safeIdx, {
          charId,
          auraMode: meta.auraMode,
          skillIndex: safeIdx,
          skill,
          originRect,
          sourceFrameEl: opts.sourceFrameEl || null,
          themeCfg: state.uiThemeCfg,
          chibi3dEnabled: active3dCast,
          allowProcedural3d: Boolean(castCfg && castCfg.allowProcedural3d),
          actionSticker: safeResolveAsset(state.uiThemeCfg && state.uiThemeCfg.actionSticker),
          noActionSprite: Boolean(state.uiThemeCfg && (state.uiThemeCfg.isMultiversePreset || (!active3dCast && state.uiThemeCfg.isForged && !state.uiThemeCfg.actionSticker))),
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

  function refreshNpcModePill(pillEl, themeCfg, charId) {
    if (!pillEl) return;
    const explicitOn = isChibi3dExplicitlyEnabled(themeCfg);
    const active3d = isChibi3dActiveForConfig(themeCfg, charId);
    pillEl.dataset.mode = explicitOn ? '3d' : '2d';
    pillEl.setAttribute('aria-pressed', explicitOn ? 'true' : 'false');
    const lbl = pillEl.querySelector('.agy-npc-mode-label');
    const modeLabel = explicitOn ? 'Chibi 3D' : 'Chibi 2D';
    if (lbl) {
      lbl.textContent = modeLabel;
    } else {
      pillEl.textContent = modeLabel;
    }
    if (explicitOn && !active3d) {
      pillEl.title = 'Đang dùng ảnh Chibi 2D gốc (chưa nạp .glb/.vrm) — bấm để chuyển về chế độ 2D';
    } else if (explicitOn) {
      pillEl.title = 'Chế độ Chibi 3D (.glb/.vrm) — bấm để chuyển về ảnh 2D gốc';
    } else {
      pillEl.title = 'Đang ở chế độ ảnh Chibi 2D gốc — bấm để bật chế độ Chibi 3D';
    }
  }

  function refreshNpcLive2dPill(pillEl, themeCfg, charId) {
    if (!pillEl) return;
    const active3d = isChibi3dActiveForConfig(themeCfg, charId);
    const liveOn = isChibi2dLiveEnabled(themeCfg);
    pillEl.style.display = active3d ? 'none' : '';
    if (liveOn && !active3d) {
      pillEl.dataset.active = '1';
      pillEl.setAttribute('aria-pressed', 'true');
      pillEl.innerHTML = '<span class="agy-npc-live2d-label">✨ Live 2D</span>';
      pillEl.title = 'Chibi 2D Sống Động đang bật (nhịp thở, theo chuột & phản ứng code) — bấm để chuyển sang 2D tĩnh';
    } else {
      delete pillEl.dataset.active;
      pillEl.setAttribute('aria-pressed', 'false');
      pillEl.innerHTML = '<span class="agy-npc-live2d-label">2D Tĩnh</span>';
      pillEl.title = 'Chibi 2D đang ở chế độ tĩnh — bấm để bật Chibi 2D Sống Động (Live2D-lite)';
    }
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
      document.querySelectorAll('.agy-npc-mode-pill').forEach((el) => el.remove());
      document.querySelectorAll('.agy-npc-live2d-pill').forEach((el) => el.remove());
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
    const existingModePill = npcWrap ? npcWrap.querySelector('.agy-npc-mode-pill') : null;
    const existingLive2dPill = npcWrap ? npcWrap.querySelector('.agy-npc-live2d-pill') : null;
    const uiMatches = Boolean(
      state.uiComposer === composer &&
      state.uiCharId === meta.charId &&
      (!npcWrap || (existingNpcPill && existingModePill && existingLive2dPill))
    );

    if (uiMatches) {
      state.uiNpcWrap = npcWrap;
      state.uiMeta = meta;
      if (npcWrap) {
        if (existingModePill) {
          refreshNpcModePill(existingModePill, state.uiThemeCfg || state.themeCfg, meta.charId);
        }
        if (existingLive2dPill) {
          refreshNpcLive2dPill(existingLive2dPill, state.uiThemeCfg || state.themeCfg, meta.charId);
        }
        const drawer = npcWrap.querySelector('.agy-npc-skills-drawer');
        if (drawer) {
          drawer.style.setProperty('--skill-primary', meta.primary);
          drawer.style.setProperty('--skill-secondary', meta.secondary);
          const drawerTitle = drawer.querySelector('.agy-skill-menu-title');
          if (drawerTitle) drawerTitle.textContent = meta.styleTitle;
          if (state.npcDrawerOpen) {
            const oldList = drawer.querySelector('.agy-skill-list');
            if (oldList) oldList.replaceWith(buildSkillItemsDom(skills, (idx) => executeSkillCast(idx)));
          }
        }
      }
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

        const npcModePill = document.createElement('button');
        npcModePill.type = 'button';
        npcModePill.className = 'agy-npc-pill agy-npc-mode-pill';
        npcModePill.dataset.npcAct = 'toggle-chibi-mode';
        npcModePill.innerHTML = '<span class="agy-npc-mode-label">Chibi 2D</span>';
        refreshNpcModePill(npcModePill, state.uiThemeCfg || state.themeCfg, meta.charId);

        const npcLive2dPill = document.createElement('button');
        npcLive2dPill.type = 'button';
        npcLive2dPill.className = 'agy-npc-pill agy-npc-live2d-pill';
        npcLive2dPill.dataset.npcAct = 'toggle-live2d';
        refreshNpcLive2dPill(npcLive2dPill, state.uiThemeCfg || state.themeCfg, meta.charId);

        const chatOpenBtn = pillsRow.querySelector('[data-npc-act="chat-open"]');
        if (chatOpenBtn) {
          pillsRow.insertBefore(npcSkillPill, chatOpenBtn);
          pillsRow.insertBefore(npcModePill, chatOpenBtn);
          pillsRow.insertBefore(npcLive2dPill, chatOpenBtn);
        } else {
          pillsRow.appendChild(npcSkillPill);
          pillsRow.appendChild(npcModePill);
          pillsRow.appendChild(npcLive2dPill);
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
          const activeCharId = state.uiCharId || meta.charId;
          const activeMeta = state.uiMeta || meta;
          const freshSkills = resolveSkillsForChar(activeCharId, activeMeta);
          state.uiSkills = freshSkills;
          const oldList = drawer.querySelector('.agy-skill-list');
          if (oldList) oldList.replaceWith(buildSkillItemsDom(freshSkills, (idx) => executeSkillCast(idx)));
          setNpcSkillsDrawerOpen(!state.npcDrawerOpen);
        });

        npcModePill.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const curCfg = state.uiThemeCfg || state.themeCfg;
          const nextEnabled = !isChibi3dExplicitlyEnabled(curCfg);
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(CHIBI_3D_STORAGE_KEY, String(nextEnabled));
            }
          } catch (_) {}
          const activeCid = state.uiCharId || meta.charId;
          const patchedCfg = curCfg && typeof curCfg === 'object' ? { ...curCfg, chibi3dEnabled: nextEnabled } : { chibi3dEnabled: nextEnabled };
          state.themeCfg = patchedCfg;
          state.uiThemeCfg = patchedCfg;
          if (typeof window !== 'undefined' && typeof window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__ === 'function') {
            try {
              window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__({ chibi3dEnabled: nextEnabled });
            } catch (_) {}
          } else if (state.uiComposer || state.auraComposer) {
            mountChibiAura(state.uiComposer || state.auraComposer, patchedCfg, activeCid);
          }
          const liveWrap = state.uiNpcWrap || (typeof document !== 'undefined' ? document.getElementById('agy-shinobu-npc-wrap') : null);
          const livePill = (liveWrap && liveWrap.querySelector('.agy-npc-mode-pill')) || npcModePill;
          const live2dPill = (liveWrap && liveWrap.querySelector('.agy-npc-live2d-pill')) || npcLive2dPill;
          refreshNpcModePill(livePill, state.uiThemeCfg || patchedCfg, activeCid);
          refreshNpcLive2dPill(live2dPill, state.uiThemeCfg || patchedCfg, activeCid);
          const dialogEl = liveWrap ? liveWrap.querySelector('.agy-npc-dialog-text') : null;
          if (dialogEl) {
            if (typeof window !== 'undefined' && window.__AGY_SHINOBU_RT__ && window.__AGY_SHINOBU_RT__.typeTimer) {
              clearInterval(window.__AGY_SHINOBU_RT__.typeTimer);
              window.__AGY_SHINOBU_RT__.typeTimer = 0;
            }
            const active3dNow = isChibi3dActiveForConfig(state.uiThemeCfg || patchedCfg, activeCid);
            if (!nextEnabled) {
              dialogEl.textContent = 'Đã chuyển về chế độ ảnh Chibi 2D gốc sắc nét!';
            } else if (active3dNow) {
              dialogEl.textContent = 'Đã kích hoạt mô hình Chibi 3D tương tác!';
            } else {
              dialogEl.textContent = 'Chưa nạp tệp .glb/.vrm cho nhân vật này — đang giữ ảnh Chibi 2D gốc (mở Giao diện tùy biến → Nhân vật để nạp mô hình 3D).';
            }
          }
        });

        npcLive2dPill.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const curCfg = state.uiThemeCfg || state.themeCfg;
          const nextLive = !isChibi2dLiveEnabled(curCfg);
          const activeCid = state.uiCharId || meta.charId;
          setChibi2dLiveEnabled(nextLive);
          if (nextLive) {
            triggerLive2dReaction('happy', 1300);
          }
          const liveWrap = state.uiNpcWrap || (typeof document !== 'undefined' ? document.getElementById('agy-shinobu-npc-wrap') : null);
          const live2dPillNow = (liveWrap && liveWrap.querySelector('.agy-npc-live2d-pill')) || npcLive2dPill;
          refreshNpcLive2dPill(live2dPillNow, state.uiThemeCfg || state.themeCfg, activeCid);
          const dialogEl = liveWrap ? liveWrap.querySelector('.agy-npc-dialog-text') : null;
          if (dialogEl) {
            if (typeof window !== 'undefined' && window.__AGY_SHINOBU_RT__ && window.__AGY_SHINOBU_RT__.typeTimer) {
              clearInterval(window.__AGY_SHINOBU_RT__.typeTimer);
              window.__AGY_SHINOBU_RT__.typeTimer = 0;
            }
            dialogEl.textContent = nextLive
              ? 'Đã bật Chibi 2D Sống Động — nhân vật sẽ hít thở, dõi theo chuột và phản ứng cùng lúc anh gõ code!'
              : 'Đã chuyển Chibi 2D về chế độ ảnh tĩnh nguyên bản.';
          }
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

    const requestedHeroRaw = typeof opts.charId === 'string' ? opts.charId.trim().toLowerCase() : '';
    const mappedReqHero = MODE_TO_CHAR[requestedHeroRaw] || requestedHeroRaw;
    const requestedHero = (CHAR_META[mappedReqHero] && CHAR_META[mappedReqHero].charId) || requestedHeroRaw;
    const hostHero = state.uiCharId || state.auraCharId || '';

    // v3.5 Dual Hashira Combo Finisher: when both right-corner NPC and left-corner Master Persona are active and distinct!
    if (!opts.singleOnly && !requestedHero && hostHero) {
      let partnerRaw = typeof opts.dualPartnerId === 'string' ? opts.dualPartnerId.trim().toLowerCase() : '';
      if (!partnerRaw && typeof window !== 'undefined' && window.__AGY_THEME_CORE__ && typeof window.__AGY_THEME_CORE__.getEffectiveState === 'function') {
        try {
          const effSt = window.__AGY_THEME_CORE__.getEffectiveState();
          partnerRaw = String((effSt && effSt.masterPersona) || '').trim().toLowerCase();
        } catch (_) {}
      }
      if (partnerRaw && partnerRaw !== hostHero) {
        const extDual = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
        if (extDual && typeof extDual.castDualSkill === 'function') {
          const muted = isSfxMuted();
          const dualRes = extDual.castDualSkill(hostHero, partnerRaw, {
            soundEnabled: !muted
          });
          if (dualRes && dualRes.ok) {
            return { ok: true, dual: true, charA: dualRes.charA, charB: dualRes.charB, spec: dualRes.spec };
          }
        }
      }
    }

    const useYoriichi =
      requestedHero === 'yoriichi' ||
      Boolean(opts.preferYoriichi) ||
      (!requestedHero && !hostHero);

    if (useYoriichi) {
      const fIdx = typeof opts.skillIndex === 'number' ? ((opts.skillIndex % 4) + 4) % 4 : 3;
      const crestBtn = typeof document !== 'undefined' ? document.querySelector('.agy-yoriichi-crest-btn') : null;
      const yoriOriginNode = opts.originEl || opts.fallbackOriginEl || crestBtn || null;
      const hud = typeof window !== 'undefined' ? window.__AGY_TOKEN_HUD__ : null;
      if (hud && typeof hud.castYoriichiSunBreathing === 'function') {
        hud.castYoriichiSunBreathing(fIdx, yoriOriginNode);
        return { ok: true, charId: 'yoriichi', skillIndex: fIdx, mode: 'sun_crest' };
      }
      const ext = typeof window !== 'undefined' ? window.__AGY_KNY_SKILLS__ : null;
      if (ext && typeof ext.castSkill === 'function') {
        const muted = isSfxMuted();
        const originRect = yoriOriginNode && typeof yoriOriginNode.getBoundingClientRect === 'function'
          ? yoriOriginNode.getBoundingClientRect()
          : null;
        ext.castSkill('yoriichi', fIdx, {
          charId: 'yoriichi',
          originRect,
          actionSticker: safeResolveAsset('assets/yoriichi_action.webp'),
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
        const reqOrigin = opts.originEl || opts.fallbackOriginEl || null;
        const originRect = reqOrigin && typeof reqOrigin.getBoundingClientRect === 'function'
          ? reqOrigin.getBoundingClientRect()
          : null;
        ext.castSkill(requestedHero, fIdx, {
          charId: requestedHero,
          originRect,
          actionSticker: safeResolveAsset(`assets/${requestedHero.replace(/[^a-z0-9_]/g, '')}_action.webp`),
          composerEl: null,
          soundEnabled: !muted
        });
        return { ok: true, charId: requestedHero, skillIndex: fIdx };
      }
    }

    // Active hostHero on right composer corner: never pass left-corner fallbackOriginEl so Chibi leaps & lands on right corner!
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
    notifyChibiReaction,
    triggerLive2dReaction,
    setLive2dWorkState,
    isChibi2dLiveEnabled,
    setChibi2dLiveEnabled,
    getChibi2dLiveState,
    getChibi3dState,
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
