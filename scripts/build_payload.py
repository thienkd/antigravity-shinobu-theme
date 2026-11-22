#!/usr/bin/env python3
"""
Compile themes/themes.json + engine/core.js (+ engine modules) into dist/theme_payload.js.
- Exact byte-for-byte parity with scripts/build_payload.js by default
- Strips UTF-8 BOM and normalizes CRLF -> LF across JSON, JS, and SVG sources
- Enforces build-time SVG security checks (rejects <script, <foreignobject, <iframe, <object, <embed, on*=, javascript:)
- Uses reproducible 8-character SHA-256 content hashes (?v=<hash8>) instead of local mtime timestamps
- Wraps final bundle inside Master IIFE Closure receiving lexical __AGY_BOOT__
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

ASSET_KEYS = (
    "wallpaper",
    "sticker",
    "userSticker",
    "actionSticker",
    "userActionSticker",
    "cornerSvg",
    "userCornerSvg",
    "userAvatar",
    "agentAvatar",
)
HYBRID_INLINE_CANDIDATES = {"cornerSvg", "userCornerSvg", "userAvatar", "sticker", "userSticker"}
HYBRID_INLINE_MAX_BYTES = 12 * 1024
AVATAR_KEYS = {"userAvatar", "agentAvatar"}
AVATAR_MAX_DIM = 256
PLACEHOLDER = "/*__THEMES_PLACEHOLDER__*/{}"
DEFAULT_MAX_DIM = 2560
WEBP_QUALITY = 88

EXTRA_MODULES = [
    "agy_security.js",
    "kny_semantic_icons.js",
    "kny_bio_audio.js",
    "kny_fx_modes.js",
    "kny_3d_vfx_kernel.js",
    "kny_breathing_skills.js",
    "kny_chibi_aura.js",
    "kny_squad_raid.js",
    "kny_token_hud.js",
    "agy_theme_forge.js",
    "kny_cinema_director.js",
]

UNSAFE_SVG_RE = re.compile(
    r"<script|<foreignobject|<iframe|<object|<embed|\bon[a-z]+\s*=|javascript:",
    re.IGNORECASE,
)

MIME_BY_EXT = {
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
}


def read_utf8_no_bom(path: Path) -> str:
    raw_text = path.read_bytes().decode("utf-8")
    if raw_text.startswith("\ufeff"):
        raw_text = raw_text[1:]
    return re.sub(r"\r\n?", "\n", raw_text)


def assert_safe_svg(svg_text: str, svg_path: Path) -> None:
    if UNSAFE_SVG_RE.search(svg_text):
        raise ValueError(
            f"Security violation: unsafe executable markup detected in SVG asset: {svg_path}"
        )


def encode_strict_svg_data_uri(svg_text: str) -> str:
    encoded = urllib.parse.quote(svg_text, safe="-_.").replace("~", "%7E")
    return "data:image/svg+xml," + encoded


def encode_svg(svg_path: Path) -> str:
    svg_text = read_utf8_no_bom(svg_path)
    assert_safe_svg(svg_text, svg_path)
    return encode_strict_svg_data_uri(svg_text)


def encode_raster(img_path: Path, max_dim: int, compress_webp: bool = False) -> str:
    ext = img_path.suffix.lower()
    mime = MIME_BY_EXT.get(ext, "image/png")

    if not compress_webp:
        raw = img_path.read_bytes()
        return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

    try:
        from PIL import Image, ImageOps
    except ImportError:
        raw = img_path.read_bytes()
        if len(raw) > 2 * 1024 * 1024:
            print(
                f"[build_payload] Warning: Pillow not installed; embedding raw {img_path.name} "
                f"({len(raw) // 1024} KB). Install Pillow to auto-compress to 2K WebP.",
                file=sys.stderr,
            )
        return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

    with Image.open(img_path) as img:
        img = ImageOps.exif_transpose(img)
        has_alpha = img.mode in ("RGBA", "LA", "PA") or (
            img.mode == "P" and "transparency" in img.info
        )
        img = img.convert("RGBA" if has_alpha else "RGB")

        w, h = img.size
        longest = max(w, h)
        if max_dim > 0 and longest > max_dim:
            scale = max_dim / float(longest)
            new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
            resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
            img = img.resize(new_size, resample)

        if ext == ".webp" and longest <= max_dim:
            raw = img_path.read_bytes()
            if len(raw) <= 1.2 * 1024 * 1024:
                return f"data:image/webp;base64,{base64.b64encode(raw).decode('ascii')}"

        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=4)
        encoded = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/webp;base64,{encoded}"


def encode_asset_inline(asset_path: Path, max_dim: int, compress_webp: bool = False) -> str:
    if asset_path.suffix.lower() == ".svg":
        return encode_svg(asset_path)
    return encode_raster(asset_path, max_dim, compress_webp=compress_webp)


def to_posix_relative_if_inside(asset_path: Path, themes_dir: Path) -> str | None:
    resolved_themes = str(themes_dir.resolve())
    resolved_asset = str(asset_path.resolve())
    if os.name == "nt":
        if len(resolved_themes) >= 2 and resolved_themes[1] == ":":
            resolved_themes = resolved_themes[0].upper() + resolved_themes[1:]
        if len(resolved_asset) >= 2 and resolved_asset[1] == ":":
            resolved_asset = resolved_asset[0].upper() + resolved_asset[1:]
    try:
        rel = os.path.relpath(resolved_asset, resolved_themes)
    except ValueError:
        return None
    if not rel or rel == "." or rel.startswith("..") or os.path.isabs(rel):
        return None
    return rel.replace("\\", "/")


def resolve_asset_value(
    key: str,
    value: object,
    themes_dir: Path,
    max_dim: int,
    inline_all: bool,
    compress_webp: bool = False,
) -> object:
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if (
        not trimmed
        or trimmed.startswith("data:")
        or trimmed.startswith("http://")
        or trimmed.startswith("https://")
    ):
        return trimmed

    asset_path = Path(trimmed)
    if not asset_path.is_absolute():
        asset_path = (themes_dir / asset_path).resolve()
    if not asset_path.is_file():
        raise FileNotFoundError(f"Theme asset not found: {trimmed} (resolved: {asset_path})")

    ext = asset_path.suffix.lower()
    normalized_svg: str | None = None
    if ext == ".svg":
        normalized_svg = read_utf8_no_bom(asset_path)
        assert_safe_svg(normalized_svg, asset_path)

    if inline_all:
        if normalized_svg is not None:
            return encode_strict_svg_data_uri(normalized_svg)
        return encode_asset_inline(asset_path, max_dim, compress_webp=compress_webp)

    rel_posix = to_posix_relative_if_inside(asset_path, themes_dir)
    if rel_posix is None:
        if normalized_svg is not None:
            return encode_strict_svg_data_uri(normalized_svg)
        return encode_asset_inline(asset_path, max_dim, compress_webp=compress_webp)

    raw_bytes = (
        normalized_svg.encode("utf-8") if normalized_svg is not None else asset_path.read_bytes()
    )
    if key in HYBRID_INLINE_CANDIDATES and len(raw_bytes) < HYBRID_INLINE_MAX_BYTES:
        if normalized_svg is not None:
            return encode_strict_svg_data_uri(normalized_svg)
        return encode_asset_inline(asset_path, max_dim, compress_webp=compress_webp)

    hash8 = hashlib.sha256(raw_bytes).hexdigest()[:8]
    return f"{rel_posix}?v={hash8}"


def build_payload(
    themes_path: Path,
    engine_path: Path,
    out_path: Path,
    max_dim: int,
    inline_all: bool = False,
    compress_webp: bool = False,
) -> None:
    if not themes_path.is_file():
        raise FileNotFoundError(f"themes.json not found: {themes_path}")
    if not engine_path.is_file():
        raise FileNotFoundError(f"core.js not found: {engine_path}")

    themes_raw = json.loads(read_utf8_no_bom(themes_path))
    if not isinstance(themes_raw, dict) or not themes_raw:
        raise ValueError("themes.json must be a non-empty JSON object keyed by theme name.")

    themes_dir = themes_path.parent
    resolved_themes: dict[str, dict] = {}
    for name, cfg in themes_raw.items():
        if not isinstance(cfg, dict):
            raise ValueError(f"Theme '{name}' must be a JSON object.")
        copied = dict(cfg)
        for key in ASSET_KEYS:
            if key in copied:
                target_dim = min(max_dim, AVATAR_MAX_DIM) if key in AVATAR_KEYS else max_dim
                copied[key] = resolve_asset_value(
                    key,
                    copied[key],
                    themes_dir,
                    target_dim,
                    inline_all,
                    compress_webp=compress_webp,
                )
        resolved_themes[name] = copied

    engine_src = read_utf8_no_bom(engine_path)
    count = engine_src.count(PLACEHOLDER)
    if count != 1:
        raise ValueError(
            f"Expected exactly 1 '{PLACEHOLDER}' placeholder in {engine_path}, found {count}."
        )

    themes_json = json.dumps(resolved_themes, ensure_ascii=False, separators=(",", ":"))
    compiled = engine_src.replace(PLACEHOLDER, themes_json, 1)

    prepends: list[str] = []
    for mod_name in EXTRA_MODULES:
        mod_path = engine_path.parent / mod_name
        if not mod_path.is_file():
            raise FileNotFoundError(f"Required engine module missing: {mod_path}")
        prepends.append(read_utf8_no_bom(mod_path))
    if prepends:
        compiled = "\n".join(prepends) + "\n" + compiled

    compiled = "\n".join(
        [
            "(function(__AGY_BOOT__) {",
            "let __AGY_PRECLEANED__ = false;",
            'if (typeof window !== "undefined" && typeof window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ === "function") {',
            "  try { window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__({ isReinject: true }); } catch (_) {}",
            "  __AGY_PRECLEANED__ = true;",
            "}",
            compiled,
            '})(typeof __AGY_INJECT_BOOT__ !== "undefined" ? __AGY_INJECT_BOOT__ : null);',
            "",
        ]
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(compiled, encoding="utf-8", newline="\n")

    size_kb = out_path.stat().st_size / 1024.0
    mode_label = "inline-all" if inline_all else "hybrid"
    print(
        f"[build_payload] Built {out_path} ({size_kb:.1f} KB, mode={mode_label}) with {len(resolved_themes)} theme(s): "
        + ", ".join(resolved_themes.keys())
    )


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Compile themes.json + engine/core.js -> dist/theme_payload.js"
    )
    parser.add_argument("--themes", type=Path, default=repo_root / "themes" / "themes.json")
    parser.add_argument("--engine", type=Path, default=repo_root / "engine" / "core.js")
    parser.add_argument("--out", type=Path, default=repo_root / "dist" / "theme_payload.js")
    parser.add_argument("--max-dim", type=int, default=DEFAULT_MAX_DIM)
    parser.add_argument(
        "--inline-all",
        action="store_true",
        help="Embed all assets (including 2K wallpapers and large Chibi SVGs) as data: URIs.",
    )
    parser.add_argument(
        "--compress-webp",
        action="store_true",
        help="Optionally re-encode inline raster assets to WebP via Pillow (disabled by default for byte parity with Node).",
    )
    args = parser.parse_args()

    build_payload(
        args.themes,
        args.engine,
        args.out,
        args.max_dim,
        inline_all=args.inline_all,
        compress_webp=args.compress_webp,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
