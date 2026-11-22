#!/usr/bin/env node
'use strict';

/**
 * Zero-dependency Node.js payload compiler (matches scripts/build_payload.py).
 * - Strips UTF-8 BOM across JSON, JS, and SVG sources
 * - Enforces build-time SVG security sanitization check (blocks active scripts/handlers)
 * - Uses reproducible 8-char SHA-256 content hashes (?v=<hash8>) instead of local mtime timestamps
 * - Wraps output inside Master IIFE Closure receiving lexical __AGY_BOOT__
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ASSET_KEYS = [
  'wallpaper',
  'sticker',
  'userSticker',
  'actionSticker',
  'userActionSticker',
  'cornerSvg',
  'userCornerSvg',
  'userAvatar',
  'agentAvatar'
];
const HYBRID_INLINE_CANDIDATES = new Set(['cornerSvg', 'userCornerSvg', 'userAvatar', 'sticker', 'userSticker']);
const HYBRID_INLINE_MAX_BYTES = 12 * 1024;
const PLACEHOLDER = '/*__THEMES_PLACEHOLDER__*/{}';

const EXTRA_MODULES = [
  'agy_security.js',
  'kny_semantic_icons.js',
  'kny_bio_audio.js',
  'kny_fx_modes.js',
  'kny_breathing_skills.js',
  'kny_chibi_aura.js',
  'kny_squad_raid.js',
  'kny_token_hud.js',
  'agy_theme_forge.js',
  'kny_cinema_director.js'
];

const UNSAFE_SVG_PATTERN = /<script|<foreignobject|<iframe|\bon[a-z]+\s*=|javascript:/i;

const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function readUtf8NoBom(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function assertSafeSvgContent(svgText, assetPath) {
  if (UNSAFE_SVG_PATTERN.test(svgText)) {
    throw new Error(`Security violation: unsafe executable markup detected in SVG asset: ${assetPath}`);
  }
}

function encodeFileAsDataUri(assetPath) {
  const ext = path.extname(assetPath).toLowerCase();
  if (ext === '.svg') {
    const svgText = readUtf8NoBom(assetPath);
    assertSafeSvgContent(svgText, assetPath);
    return 'data:image/svg+xml,' + encodeURIComponent(svgText);
  }
  const raw = fs.readFileSync(assetPath);
  const mime = MIME_BY_EXT[ext] || 'image/png';
  return `data:${mime};base64,${raw.toString('base64')}`;
}

function toPosixRelativeIfInside(assetPath, themesDir) {
  const resolvedThemes = path.resolve(themesDir);
  const resolvedAsset = path.resolve(assetPath);
  const safePrefix = resolvedThemes.endsWith(path.sep) ? resolvedThemes : resolvedThemes + path.sep;
  if (!resolvedAsset.startsWith(safePrefix)) {
    return null;
  }
  return path.relative(resolvedThemes, resolvedAsset).split(path.sep).join('/');
}

function resolveAssetValue(key, value, themesDir, inlineAll) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const assetPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(themesDir, trimmed);
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    throw new Error(`Theme asset not found: ${trimmed} (resolved: ${assetPath})`);
  }

  if (path.extname(assetPath).toLowerCase() === '.svg') {
    assertSafeSvgContent(readUtf8NoBom(assetPath), assetPath);
  }

  if (inlineAll) {
    return encodeFileAsDataUri(assetPath);
  }

  const relPosix = toPosixRelativeIfInside(assetPath, themesDir);
  if (!relPosix) {
    return encodeFileAsDataUri(assetPath);
  }

  const rawBytes = fs.readFileSync(assetPath);
  if (HYBRID_INLINE_CANDIDATES.has(key) && rawBytes.length < HYBRID_INLINE_MAX_BYTES) {
    return encodeFileAsDataUri(assetPath);
  }

  const hash8 = crypto.createHash('sha256').update(rawBytes).digest('hex').slice(0, 8);
  return `${relPosix}?v=${hash8}`;
}

function parseArgs(argv, repoRoot) {
  const opts = {
    themesPath: path.join(repoRoot, 'themes', 'themes.json'),
    enginePath: path.join(repoRoot, 'engine', 'core.js'),
    outPath: path.join(repoRoot, 'dist', 'theme_payload.js'),
    inlineAll: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--inline-all') {
      opts.inlineAll = true;
    } else if (arg === '--themes' && argv[i + 1]) {
      opts.themesPath = path.resolve(argv[++i]);
    } else if (arg === '--engine' && argv[i + 1]) {
      opts.enginePath = path.resolve(argv[++i]);
    } else if (arg === '--out' && argv[i + 1]) {
      opts.outPath = path.resolve(argv[++i]);
    }
  }
  return opts;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const { themesPath, enginePath, outPath, inlineAll } = parseArgs(process.argv.slice(2), repoRoot);

  const themesRaw = JSON.parse(readUtf8NoBom(themesPath));
  const themesDir = path.dirname(themesPath);
  const resolved = {};

  for (const [name, cfg] of Object.entries(themesRaw)) {
    const copied = { ...cfg };
    for (const key of ASSET_KEYS) {
      if (key in copied) {
        copied[key] = resolveAssetValue(key, copied[key], themesDir, inlineAll);
      }
    }
    resolved[name] = copied;
  }

  const engineSrc = readUtf8NoBom(enginePath);
  if (!engineSrc.includes(PLACEHOLDER)) {
    throw new Error(`Placeholder ${PLACEHOLDER} not found in ${enginePath}`);
  }

  let compiled = engineSrc.replace(PLACEHOLDER, () => JSON.stringify(resolved));

  const prepends = [];
  const engineDir = path.dirname(enginePath);
  for (const modName of EXTRA_MODULES) {
    const modPath = path.join(engineDir, modName);
    if (fs.existsSync(modPath)) {
      prepends.push(readUtf8NoBom(modPath));
    }
  }
  if (prepends.length > 0) {
    compiled = `${prepends.join('\n')}\n${compiled}`;
  }

  compiled = `(function(__AGY_BOOT__) {\n${compiled}\n})(typeof __AGY_INJECT_BOOT__ !== "undefined" ? __AGY_INJECT_BOOT__ : null);\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, compiled, 'utf8');

  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  const modeLabel = inlineAll ? 'inline-all' : 'hybrid';
  console.log(
    `[build_payload.js] Built ${outPath} (${sizeKb} KB, mode=${modeLabel}) with ${Object.keys(resolved).length} theme(s): ${Object.keys(resolved).join(', ')}`
  );
}

main();
