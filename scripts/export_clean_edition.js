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

  for (const dirName of ['daemon', 'engine', 'scripts', 'assets', 'skills']) {
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
    fs.writeFileSync(cleanPluginPath, JSON.stringify(pJson, null, 2) + '\n', 'utf8');
  }

  fs.writeFileSync(path.join(outDir, 'themes', 'assets', 'clean_corner.svg'), CLEAN_CORNER_SVG, 'utf8');
  // Provide procedural SVG placeholder for default Yoriichi crest key if referenced
  fs.writeFileSync(path.join(outDir, 'themes', 'assets', 'yoriichi_avatar.jpg'), CLEAN_CORNER_SVG, 'utf8');
  const cleanThemesObj = {};
  for (const [k, v] of Object.entries(CLEAN_THEMES)) {
    cleanThemesObj[k] = { ...v, userAvatar: 'assets/clean_corner.svg' };
  }
  const cleanThemesPath = path.join(outDir, 'themes', 'themes.json');
  fs.writeFileSync(cleanThemesPath, JSON.stringify(cleanThemesObj, null, 2) + '\n', 'utf8');

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
