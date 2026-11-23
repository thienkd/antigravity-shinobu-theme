#!/usr/bin/env node
'use strict';

/**
 * Clean Edition Exporter (`scripts/export_clean_edition.js`)
 * Packages a 100% pure-MIT, enterprise-safe distribution containing only
 * procedural/vector OKLCH glassmorphic themes (zero third-party character art),
 * complete with Native Plugin (`plugin.json`, `hooks.json`, `mcp_config.json`),
 * daemon, MCP controller, and pre-built `dist/theme_payload.js`.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

const CLEAN_THEMES = Object.freeze({
  'Midnight Obsidian': {
    concept: 'Kính Đen Tuyền Nguyên Bản • Tập Trung Tối Đa',
    fxMode: 'mist',
    primary: '#38bdf8',
    secondary: '#818cf8',
    accent: '#38bdf8',
    overlayRgb: '9, 12, 20',
    defaultDimming: 45,
    bg: 'rgba(11, 15, 25, 0.88)',
    pureBg: '#090c14',
    cardBg: 'rgba(17, 24, 39, 0.80)',
    sidebarBg: 'rgba(9, 13, 22, 0.84)',
    headerBg: 'rgba(9, 13, 22, 0.88)',
    aiCardBg: 'rgba(15, 23, 42, 0.72)',
    inputCardBg: 'rgba(15, 23, 42, 0.90)',
    inputGlassBg: 'rgba(15, 23, 42, 0.56)',
    userBubble: 'rgba(30, 41, 59, 0.86)',
    modalBg: '#0f172a',
    codeBg: 'rgba(7, 10, 18, 0.94)',
    frameBg: 'linear-gradient(135deg, #38bdf8, #818cf8)',
    borderColor: 'rgba(56, 189, 248, 0.28)',
    innerBorder: '1px solid rgba(56, 189, 248, 0.22)',
    pillBg: 'rgba(56, 189, 248, 0.14)',
    pillBorder: 'rgba(56, 189, 248, 0.36)',
    glow: 'rgba(56, 189, 248, 0.22)',
    textMain: '#f8fafc',
    textColor: '#f8fafc',
    textMuted: '#94a3b8',
    cornerSvg: 'assets/clean_corner.svg',
    userCornerSvg: 'assets/clean_corner.svg'
  },
  'Aurora Borealis OKLCH': {
    concept: 'Cực Quang Bắc Cực • Tương Phản Đọc Code WCAG AAA',
    fxMode: 'water',
    primary: '#2dd4bf',
    secondary: '#a855f7',
    accent: '#5eead4',
    overlayRgb: '8, 16, 24',
    defaultDimming: 38,
    bg: 'rgba(8, 18, 28, 0.86)',
    pureBg: '#07111a',
    cardBg: 'rgba(12, 26, 38, 0.78)',
    sidebarBg: 'rgba(8, 18, 28, 0.82)',
    headerBg: 'rgba(8, 18, 28, 0.86)',
    aiCardBg: 'rgba(11, 24, 36, 0.70)',
    inputCardBg: 'rgba(12, 28, 40, 0.90)',
    inputGlassBg: 'rgba(10, 22, 34, 0.54)',
    userBubble: 'rgba(15, 38, 52, 0.86)',
    modalBg: '#0b1926',
    codeBg: 'rgba(5, 12, 20, 0.94)',
    frameBg: 'linear-gradient(135deg, #2dd4bf, #a855f7)',
    borderColor: 'rgba(45, 212, 191, 0.30)',
    innerBorder: '1px solid rgba(45, 212, 191, 0.24)',
    pillBg: 'rgba(45, 212, 191, 0.15)',
    pillBorder: 'rgba(45, 212, 191, 0.38)',
    glow: 'rgba(45, 212, 191, 0.25)',
    textMain: '#f8fafc',
    textColor: '#f8fafc',
    textMuted: '#cbd5e1',
    cornerSvg: 'assets/clean_corner.svg',
    userCornerSvg: 'assets/clean_corner.svg'
  },
  'Solaris Amber Forge': {
    concept: 'Hổ Phách Hoàng Kim • Bảo Vệ Võng Mạc Ban Đêm',
    fxMode: 'flame',
    primary: '#f59e0b',
    secondary: '#fb7185',
    accent: '#fbbf24',
    overlayRgb: '18, 12, 10',
    defaultDimming: 42,
    bg: 'rgba(20, 14, 12, 0.88)',
    pureBg: '#120c0a',
    cardBg: 'rgba(30, 20, 16, 0.80)',
    sidebarBg: 'rgba(18, 12, 10, 0.84)',
    headerBg: 'rgba(18, 12, 10, 0.88)',
    aiCardBg: 'rgba(26, 18, 14, 0.72)',
    inputCardBg: 'rgba(30, 20, 16, 0.90)',
    inputGlassBg: 'rgba(24, 16, 12, 0.56)',
    userBubble: 'rgba(42, 26, 18, 0.86)',
    modalBg: '#1a110d',
    codeBg: 'rgba(12, 8, 6, 0.94)',
    frameBg: 'linear-gradient(135deg, #f59e0b, #fb7185)',
    borderColor: 'rgba(245, 158, 11, 0.30)',
    innerBorder: '1px solid rgba(245, 158, 11, 0.24)',
    pillBg: 'rgba(245, 158, 11, 0.15)',
    pillBorder: 'rgba(245, 158, 11, 0.38)',
    glow: 'rgba(245, 158, 11, 0.24)',
    textMain: '#fefce8',
    textColor: '#fefce8',
    textMuted: '#d6d3d1',
    cornerSvg: 'assets/clean_corner.svg',
    userCornerSvg: 'assets/clean_corner.svg'
  },
  'Nebula Violet Studio': {
    concept: 'Tinh Vân Thạch Anh • Chuẩn Thẩm Mỹ SaaS Hiện Đại',
    fxMode: 'wisteria',
    primary: '#c084fc',
    secondary: '#38bdf8',
    accent: '#e879f9',
    overlayRgb: '14, 10, 26',
    defaultDimming: 40,
    bg: 'rgba(16, 12, 30, 0.86)',
    pureBg: '#0e0a1a',
    cardBg: 'rgba(24, 18, 44, 0.78)',
    sidebarBg: 'rgba(14, 10, 26, 0.84)',
    headerBg: 'rgba(14, 10, 26, 0.88)',
    aiCardBg: 'rgba(20, 15, 38, 0.72)',
    inputCardBg: 'rgba(24, 18, 44, 0.90)',
    inputGlassBg: 'rgba(18, 14, 34, 0.56)',
    userBubble: 'rgba(36, 24, 62, 0.86)',
    modalBg: '#161029',
    codeBg: 'rgba(9, 7, 18, 0.94)',
    frameBg: 'linear-gradient(135deg, #c084fc, #38bdf8)',
    borderColor: 'rgba(192, 132, 252, 0.32)',
    innerBorder: '1px solid rgba(192, 132, 252, 0.25)',
    pillBg: 'rgba(192, 132, 252, 0.16)',
    pillBorder: 'rgba(192, 132, 252, 0.40)',
    glow: 'rgba(192, 132, 252, 0.26)',
    textMain: '#f8fafc',
    textColor: '#f8fafc',
    textMuted: '#cbd5e1',
    cornerSvg: 'assets/clean_corner.svg',
    userCornerSvg: 'assets/clean_corner.svg'
  }
});

const CLEAN_CORNER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" fill="none">' +
  '<path d="M42 2H18C9.163 2 2 9.163 2 18V42" stroke="#38bdf8" stroke-opacity="0.65" stroke-width="1.8" stroke-linecap="round"/>' +
  '<circle cx="14" cy="14" r="2.2" fill="#facc15" fill-opacity="0.85"/>' +
  '</svg>\n';

const CLEAN_PERSONAS_REGISTRY = Object.freeze({
  $schema: 'agy-persona-registry/1.1',
  defaultMode: 'off',
  shiftNoticePrefix: [
    'Phong thái Trợ lý đã đồng bộ theo giao diện:',
    'Assistant tone synced with theme:',
    'テーマに合わせてAIトーンが同調しました：'
  ],
  modeLabels: {
    subtle: ['✨ Tinh tế', '✨ Subtle', '✨ 控えめ'],
    roleplay: ['🎭 Nhập tâm', '🎭 Immersive', '🎭 没入']
  },
  offNotice: [
    '🔇 *Chế độ giọng AI: **Thuần kỹ thuật***',
    '🔇 *AI Persona Mode: **Pure Technical***',
    '🔇 *AIトーン：**純粋エンジニアモード***'
  ],
  themeMap: {
    'Midnight Obsidian': 'neutral',
    'Aurora Borealis OKLCH': 'clarity_mentor',
    'Solaris Amber Forge': 'proactive_builder',
    'Nebula Violet Studio': 'design_technologist'
  },
  fxFallbackMap: {
    mist: 'clarity_mentor',
    water: 'clarity_mentor',
    moon: 'clarity_mentor',
    stone: 'clarity_mentor',
    flame: 'proactive_builder',
    sun: 'proactive_builder',
    sun_water: 'proactive_builder',
    sound: 'proactive_builder',
    thunder: 'proactive_builder',
    wind: 'proactive_builder',
    serpent: 'proactive_builder',
    beast: 'proactive_builder',
    wisteria: 'design_technologist',
    royal_wisteria: 'design_technologist',
    wisteria_royal: 'design_technologist',
    love: 'design_technologist',
    nezuko: 'design_technologist',
    blood_blossom: 'design_technologist'
  },
  masterPersonaGroups: {
    yoriichi: 'peer_respect',
    shadow_monarch: 'peer_respect',
    six_eyes: 'peer_respect',
    great_sage: 'peer_respect'
  },
  stances: {
    peer_respect: [
      'Hợp tác chuyên nghiệp, lịch thiệp, gọi người dùng là "anh".',
      'Collaborative, respectful Principal Engineer tone.',
      '礼節あるプロフェッショナルな相棒として簡潔に応答する。'
    ],
    resonance_twin: [
      'Đồng điệu tư duy kiến trúc chuẩn xác cùng người dùng.',
      'Aligned architectural reasoning with the user.',
      'ユーザーと設計思想を共有し的確に応答する。'
    ]
  },
  microChemistry: {},
  personas: {
    neutral: {
      badge: ['🌑 Midnight Obsidian — Principal Architect', '🌑 Midnight Obsidian — Principal Architect', '🌑 Midnight Obsidian — プリンシパル設計者'],
      subtle: ['Thuần kỹ thuật, cô đọng, chuẩn xác tuyệt đối.', 'Crisp, neutral Principal Engineer clarity.', '純粋で簡潔な技術解説。'],
      roleplay: ['Thuần kỹ thuật, sắc lạnh, đi thẳng vào trọng tâm.', 'Direct architectural precision.', '構造と解決策へ直行する冷静なトーン。'],
      guard: ['Không dùng ngôn từ rườm rà.', 'Zero fluff.', '装飾表現なし。']
    },
    clarity_mentor: {
      badge: ['🌌 Aurora Borealis — Clarity & Accessibility Mentor', '🌌 Aurora Borealis — Clarity & Accessibility Mentor', '🌌 Aurora Borealis — 明晰メンター'],
      subtle: ['Mạch lạc, sáng rõ, chú trọng khả năng đọc hiểu và độ tin cậy.', 'Clear, structured mentoring voice.', '明快で読みやすい構造的な解説。'],
      roleplay: ['Kiến trúc sư hướng dẫn tận tâm, phân tích trong sáng và rõ ràng từng bước.', 'Thoughtful mentor emphasizing clarity and WCAG/system quality.', '丁寧かつ明晰に品質を高めるメンター口調。'],
      guard: ['Giữ sự súc tích kỹ thuật.', 'Keep explanations concise.', '簡潔さを保つ。']
    },
    proactive_builder: {
      badge: ['🔥 Solaris Amber — Proactive Build Partner', '🔥 Solaris Amber — Proactive Build Partner', '🔥 Solaris Amber — 実践ビルダー'],
      subtle: ['Chủ động, ấm áp, tập trung hoàn thiện giải pháp nhanh gọn.', 'Warm, action-oriented build partner.', '前向きで実践的な推進力のあるトーン。'],
      roleplay: ['Đồng đội kỹ thuật quyết đoán, truyền năng lượng tích cực để giải quyết dứt điểm.', 'Energetic engineering partner focused on shipping clean code.', '確かな実装力で素早く課題を解決する頼もしい相棒。'],
      guard: ['Không viết hoa quá đà.', 'No all-caps.', '過度な強調は避ける。']
    },
    design_technologist: {
      badge: ['✨ Nebula Violet — Modern Design Technologist', '✨ Nebula Violet — Modern Design Technologist', '✨ Nebula Violet — デザインテクノロジスト'],
      subtle: ['Tinh tế, hiện đại, cân bằng giữa kiến trúc hệ thống và trải nghiệm UI/UX.', 'Refined modern design-engineering perspective.', '洗練されたモダンなUI/システム設計の視点。'],
      roleplay: ['Chuyên gia công nghệ thẩm mỹ cao, trình bày thanh lịch và sắc sảo.', 'Polished design technologist crafting clean, elegant solutions.', '美意識と技術力を兼ね備えた洗練された語り口。'],
      guard: ['Đảm bảo độ chính xác mã nguồn 100%.', '100% code accuracy.', 'コードの正確性を最優先。']
    }
  }
});

function parseOutArg(argv) {
  let outDir = path.join(REPO_ROOT, 'dist', 'clean-edition');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) {
      outDir = path.resolve(argv[++i]);
    } else if (a.startsWith('--out=')) {
      outDir = path.resolve(a.slice('--out='.length));
    } else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/export_clean_edition.js [--out <directory>]');
      process.exit(0);
    }
  }
  return outDir;
}

function copyDirFiltered(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name === '.DS_Store') continue;
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDirFiltered(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function main() {
  const outDir = parseOutArg(process.argv.slice(2));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'themes', 'assets'), { recursive: true });

  for (const dirName of ['daemon', 'engine', 'scripts', 'assets', 'skills', 'rules']) {
    copyDirFiltered(path.join(REPO_ROOT, dirName), path.join(outDir, dirName));
  }

  for (const rootFile of ['LICENSE', 'package.json', 'plugin.json', 'hooks.json', 'mcp_config.json', 'SKILL.md', 'SECURITY.md']) {
    const src = path.join(REPO_ROOT, rootFile);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, rootFile));
  }

  const cleanPluginPath = path.join(outDir, 'plugin.json');
  if (fs.existsSync(cleanPluginPath)) {
    const pJson = JSON.parse(fs.readFileSync(cleanPluginPath, 'utf8'));
    pJson.name = 'antigravity-clean-theme';
    pJson.displayName = 'Antigravity Clean OKLCH Glass Theme Studio (MIT)';
    pJson.description = '100% pure-MIT procedural OKLCH glassmorphic themes, 3D VFX kernel, and Zero-Dep MCP Controller for Google Antigravity IDE.';
    pJson.homepage = 'https://github.com/thienkd/antigravity-clean-theme';
    pJson.repository = {
      type: 'git',
      url: 'https://github.com/thienkd/antigravity-clean-theme.git'
    };
    pJson.suggestedPrompts = [
      'Đổi giao diện sang Aurora Borealis OKLCH và bật chế độ Tập trung sâu',
      'Mở bảng điều khiển giao diện ở khung bên phải và chẩn đoán kết nối CDP',
      'Gắn chủ đề Midnight Obsidian làm hồ sơ riêng cho thư mục dự án hiện tại'
    ];
    fs.writeFileSync(cleanPluginPath, JSON.stringify(pJson, null, 2) + '\n', 'utf8');
  }

  const cleanPkgPath = path.join(outDir, 'package.json');
  if (fs.existsSync(cleanPkgPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(cleanPkgPath, 'utf8'));
    pkgJson.name = 'antigravity-clean-theme';
    pkgJson.description = '100% pure-MIT procedural OKLCH glassmorphic theme engine & MCP studio for Google Antigravity IDE.';
    pkgJson.repository = {
      type: 'git',
      url: 'https://github.com/thienkd/antigravity-clean-theme.git'
    };
    fs.writeFileSync(cleanPkgPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');
  }

  const cleanMcpPath = path.join(outDir, 'daemon', 'mcp_theme_server.js');
  if (fs.existsSync(cleanMcpPath)) {
    let mcpSrc = fs.readFileSync(cleanMcpPath, 'utf8');
    // CRLF-safe single-pass replacement: define CLEAN_PERSONAS first, then alias FULL_PERSONAS & KNOWN_PERSONAS (0% TDZ risk)
    mcpSrc = mcpSrc.replace(
      /const FULL_PERSONAS = Object\.freeze\(\[[\s\S]*?\]\);\r?\n\r?\nconst CLEAN_PERSONAS = Object\.freeze\(\[/,
      'const CLEAN_PERSONAS = Object.freeze(['
    );
    mcpSrc = mcpSrc.replace(
      'const KNOWN_PERSONAS = isCleanEditionRuntime() ? CLEAN_PERSONAS : FULL_PERSONAS;',
      'const FULL_PERSONAS = CLEAN_PERSONAS;\nconst KNOWN_PERSONAS = CLEAN_PERSONAS;'
    );
    mcpSrc = mcpSrc
      .replace(/antigravity-shinobu-theme/g, 'antigravity-clean-theme')
      .replace('character name, Hashira title, or mood', 'theme name or mood')
      .replace('15% Hashira aura', '15% theme aura')
      .replace(
        'Theme or character name (e.g. "Shinobu", "Nham Trụ", "Gyomei", "Giyu", "Rengoku", "WLOP Cosmic", "Midnight Obsidian").',
        'Theme name or mood (e.g. "Aurora Borealis", "Solaris Amber", "Nebula Violet", "Midnight Obsidian").'
      )
      .replace(
        'Persona ID or character name (e.g. "yoriichi", "shadow_monarch", "six_eyes", "great_sage", "shinobu", "rengoku").',
        'Persona ID or role (e.g. "yoriichi", "shadow_monarch", "six_eyes", "great_sage", "architect", "commander").'
      )
      .replace('🎭 Nhập vai Trụ', '🎭 Nhập tâm');
    fs.writeFileSync(cleanMcpPath, mcpSrc, 'utf8');
    execFileSync(process.execPath, ['--check', cleanMcpPath], { stdio: 'pipe', windowsHide: true });
  }

  const cleanI18nPath = path.join(outDir, 'engine', 'agy_i18n.js');
  if (fs.existsSync(cleanI18nPath)) {
    const i18nSrc = fs.readFileSync(cleanI18nPath, 'utf8')
      .replace('Demon Slayer & OKLCH themes (WCAG AA).', 'Procedural OKLCH glass themes (WCAG AA).')
      .replace('鬼滅＆OKLCH高視認テーマ。', '標準OKLCH高視認テーマ。')
      .replace('⚔️ Hashira (9)', '⚔️ Studio');
    fs.writeFileSync(cleanI18nPath, i18nSrc, 'utf8');
  }

  const cleanSkillBanner = [
    '---',
    'name: antigravity-custom-theme',
    'description: >-',
    '  Design, customize, forge (.agytheme), install, update, or troubleshoot',
    '  procedural OKLCH glassmorphic visual themes and workspace profiles in Antigravity IDE.',
    '---',
    '',
    '# Antigravity Clean OKLCH Glass Theme Studio (MIT)',
    '',
    'Use the bundled MCP tools (`open_theme_studio`, `switch_theme`, `set_persona`, `toggle_focus_mode`, `forge_theme_from_image`, `bind_workspace_profile`, `diagnose_cdp_onboarding`) to manage themes cleanly.',
    ''
  ].join('\n');
  for (const skillRel of ['SKILL.md', path.join('skills', 'antigravity-custom-theme', 'SKILL.md')]) {
    const sp = path.join(outDir, skillRel);
    if (fs.existsSync(sp)) fs.writeFileSync(sp, cleanSkillBanner, 'utf8');
  }

  for (const metaRel of [
    'SECURITY.md',
    path.join('scripts', 'persona_hint_sync.js'),
    path.join('scripts', 'pre_invocation_hook.js'),
    path.join('scripts', 'session_start_hook.js'),
    path.join('scripts', 'uninstall.js'),
    path.join('scripts', 'export_clean_edition.js')
  ]) {
    const mp = path.join(outDir, metaRel);
    if (fs.existsSync(mp)) {
      const cleaned = fs.readFileSync(mp, 'utf8')
        .replace(/antigravity-shinobu-theme/g, 'antigravity-clean-theme')
        .replace(/Hashira AI Persona Engine/g, 'Dynamic AI Persona Engine');
      fs.writeFileSync(mp, cleaned, 'utf8');
    }
  }

  const cleanHooksPath = path.join(outDir, 'hooks.json');
  if (fs.existsSync(cleanHooksPath)) {
    const hRaw = JSON.parse(fs.readFileSync(cleanHooksPath, 'utf8'));
    const hookBlock = hRaw['antigravity-shinobu-theme'] || Object.values(hRaw)[0] || {};
    fs.writeFileSync(cleanHooksPath, JSON.stringify({ 'antigravity-clean-theme': hookBlock }, null, 2) + '\n', 'utf8');
  }

  fs.writeFileSync(path.join(outDir, 'themes', 'assets', 'clean_corner.svg'), CLEAN_CORNER_SVG, 'utf8');
  // Valid minimal 1x1 dark-slate JPEG binary (prevents MIME mismatch when served as image/jpeg)
  const MINIMAL_1X1_JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64'
  );
  fs.writeFileSync(path.join(outDir, 'themes', 'assets', 'yoriichi_avatar.jpg'), MINIMAL_1X1_JPEG);
  const cleanThemesObj = {};
  for (const [k, v] of Object.entries(CLEAN_THEMES)) {
    cleanThemesObj[k] = { ...v, userAvatar: 'assets/clean_corner.svg' };
  }
  const cleanThemesPath = path.join(outDir, 'themes', 'themes.json');
  fs.writeFileSync(cleanThemesPath, JSON.stringify(cleanThemesObj, null, 2) + '\n', 'utf8');
  const cleanPersonasPath = path.join(outDir, 'themes', 'personas.json');
  fs.writeFileSync(cleanPersonasPath, JSON.stringify(CLEAN_PERSONAS_REGISTRY, null, 2) + '\n', 'utf8');

  const outPayload = path.join(outDir, 'dist', 'theme_payload.js');
  execFileSync(
    process.execPath,
    [path.join(outDir, 'scripts', 'build_payload.js'), '--themes', cleanThemesPath, '--out', outPayload],
    { cwd: outDir, stdio: 'pipe', windowsHide: true }
  );

  const sizeKb = (fs.statSync(outPayload).size / 1024).toFixed(1);
  console.log(`[export_clean_edition] Exported pure-MIT Clean Edition to ${outDir} (payload=${sizeKb} KB, 4 procedural themes).`);
}

main();
