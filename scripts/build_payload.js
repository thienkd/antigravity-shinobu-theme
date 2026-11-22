#!/usr/bin/env node
'use strict';

/**
 * Zero-dependency Node.js payload compiler (matches scripts/build_payload.py).
 * Default mode: Hybrid Asset URLs — inlines tiny assets (< 12 KB cornerSvg/userAvatar/small ornaments)
 * while keeping heavy wallpapers, > 12 KB Chibi SVG stickers, and agentAvatars as clean "assets/<file>"
 * relative paths for instant HTTP loading via theme_daemon.js or preview.html.
 * Pass --inline-all to embed every asset as a self-contained data: URI.
 */

const fs = require('fs');
const path = require('path');

const ASSET_KEYS = ['wallpaper', 'sticker', 'cornerSvg', 'userAvatar', 'agentAvatar'];
const HYBRID_INLINE_CANDIDATES = new Set(['cornerSvg', 'userAvatar', 'sticker']);
const HYBRID_INLINE_MAX_BYTES = 12 * 1024;
const PLACEHOLDER = '/*__THEMES_PLACEHOLDER__*/{}';

const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function encodeFileAsDataUri(assetPath) {
  const ext = path.extname(assetPath).toLowerCase();
  if (ext === '.svg') {
    const svgText = fs.readFileSync(assetPath, 'utf8');
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

  if (inlineAll) {
    return encodeFileAsDataUri(assetPath);
  }

  const relPosix = toPosixRelativeIfInside(assetPath, themesDir);
  if (!relPosix) {
    return encodeFileAsDataUri(assetPath);
  }

  const st = fs.statSync(assetPath);
  const fileSize = st.size;
  if (HYBRID_INLINE_CANDIDATES.has(key) && fileSize < HYBRID_INLINE_MAX_BYTES) {
    return encodeFileAsDataUri(assetPath);
  }

  const ver = Math.floor(st.mtimeMs).toString(36);
  return `${relPosix}?v=${ver}`;
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

  const themesRaw = JSON.parse(fs.readFileSync(themesPath, 'utf8'));
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

  const engineSrc = fs.readFileSync(enginePath, 'utf8');
  if (!engineSrc.includes(PLACEHOLDER)) {
    throw new Error(`Placeholder ${PLACEHOLDER} not found in ${enginePath}`);
  }

  let compiled = engineSrc.replace(PLACEHOLDER, () => JSON.stringify(resolved));

  const extraModules = ['kny_fx_modes.js', 'kny_breathing_skills.js', 'kny_chibi_aura.js'];
  const prepends = [];
  for (const modName of extraModules) {
    const modPath = path.join(path.dirname(enginePath), modName);
    if (fs.existsSync(modPath)) {
      prepends.push(fs.readFileSync(modPath, 'utf8'));
    }
  }
  if (prepends.length > 0) {
    compiled = `${prepends.join('\n')}\n${compiled}`;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, compiled, 'utf8');

  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  const modeLabel = inlineAll ? 'inline-all' : 'hybrid';
  console.log(
    `[build_payload.js] Built ${outPath} (${sizeKb} KB, mode=${modeLabel}) with ${Object.keys(resolved).length} theme(s): ${Object.keys(resolved).join(', ')}`
  );
}

main();
