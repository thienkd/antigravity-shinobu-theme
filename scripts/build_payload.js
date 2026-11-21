#!/usr/bin/env node
'use strict';

/**
 * Zero-dependency Node.js payload compiler fallback (matches scripts/build_payload.py).
 * Allows installing on a fresh machine with only Node.js >= 22 even when Python is not installed.
 */

const fs = require('fs');
const path = require('path');

const ASSET_KEYS = ['wallpaper', 'sticker', 'cornerSvg', 'userAvatar', 'agentAvatar'];
const PLACEHOLDER = '/*__THEMES_PLACEHOLDER__*/{}';

const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function resolveAssetValue(value, themesDir) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const assetPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(themesDir, trimmed);
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    throw new Error(`Theme asset not found: ${trimmed} (resolved: ${assetPath})`);
  }
  const ext = path.extname(assetPath).toLowerCase();
  if (ext === '.svg') {
    const svgText = fs.readFileSync(assetPath, 'utf8');
    return 'data:image/svg+xml,' + encodeURIComponent(svgText);
  }
  const raw = fs.readFileSync(assetPath);
  const mime = MIME_BY_EXT[ext] || 'image/png';
  return `data:${mime};base64,${raw.toString('base64')}`;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const themesPath = path.join(repoRoot, 'themes', 'themes.json');
  const enginePath = path.join(repoRoot, 'engine', 'core.js');
  const outPath = path.join(repoRoot, 'dist', 'theme_payload.js');

  const themesRaw = JSON.parse(fs.readFileSync(themesPath, 'utf8'));
  const themesDir = path.dirname(themesPath);
  const resolved = {};

  for (const [name, cfg] of Object.entries(themesRaw)) {
    const copied = { ...cfg };
    for (const key of ASSET_KEYS) {
      if (key in copied) {
        copied[key] = resolveAssetValue(copied[key], themesDir);
      }
    }
    resolved[name] = copied;
  }

  const engineSrc = fs.readFileSync(enginePath, 'utf8');
  if (!engineSrc.includes(PLACEHOLDER)) {
    throw new Error(`Placeholder ${PLACEHOLDER} not found in ${enginePath}`);
  }
  const compiled = engineSrc.replace(PLACEHOLDER, () => JSON.stringify(resolved));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, compiled, 'utf8');

  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[build_payload.js] Built ${outPath} (${sizeKb} KB) with ${Object.keys(resolved).length} theme(s): ${Object.keys(resolved).join(', ')}`);
}

main();
