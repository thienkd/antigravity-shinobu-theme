#!/usr/bin/env python3
"""
Compile themes/themes.json + engine/core.js (+ engine/kny_fx_modes.js) into dist/theme_payload.js.
Default mode: Hybrid Asset URLs — inlines tiny assets (< 12 KB cornerSvg/userAvatar/small ornaments)
while keeping heavy wallpapers, > 12 KB Chibi SVG stickers, and agentAvatars as clean "assets/<file>"
relative paths for instant HTTP loading via theme_daemon.js or preview.html.
Pass --inline-all to embed every asset (compressing >2560px rasters to WebP when Pillow is available)
into a single self-contained payload.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import mimetypes
import sys
import urllib.parse
from pathlib import Path

ASSET_KEYS = ("wallpaper", "sticker", "cornerSvg", "userAvatar", "agentAvatar")
HYBRID_INLINE_CANDIDATES = {"cornerSvg", "userAvatar", "sticker"}
HYBRID_INLINE_MAX_BYTES = 12 * 1024
AVATAR_KEYS = {"userAvatar", "agentAvatar"}
AVATAR_MAX_DIM = 256
PLACEHOLDER = "/*__THEMES_PLACEHOLDER__*/{}"
DEFAULT_MAX_DIM = 2560
WEBP_QUALITY = 88


def encode_svg(svg_path: Path) -> str:
    svg_text = svg_path.read_text(encoding="utf-8")
    return "data:image/svg+xml," + urllib.parse.quote(svg_text)


def encode_raster(img_path: Path, max_dim: int) -> str:
    try:
        from PIL import Image, ImageOps
    except ImportError:
        raw = img_path.read_bytes()
        mime, _ = mimetypes.guess_type(str(img_path))
        if not mime:
            mime = "image/png"
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

        # Keep existing small WebP bytes untouched if already within budget and not resized.
        if img_path.suffix.lower() == ".webp" and longest <= max_dim:
            raw = img_path.read_bytes()
            if len(raw) <= 1.2 * 1024 * 1024:
                return f"data:image/webp;base64,{base64.b64encode(raw).decode('ascii')}"

        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=4)
        encoded = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/webp;base64,{encoded}"


def encode_asset_inline(asset_path: Path, max_dim: int) -> str:
    if asset_path.suffix.lower() == ".svg":
        return encode_svg(asset_path)
    return encode_raster(asset_path, max_dim)


def to_posix_relative_if_inside(asset_path: Path, themes_dir: Path) -> str | None:
    try:
        rel = asset_path.resolve().relative_to(themes_dir.resolve())
        return rel.as_posix()
    except ValueError:
        return None


def resolve_asset_value(
    key: str,
    value: object,
    themes_dir: Path,
    max_dim: int,
    inline_all: bool,
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

    if inline_all:
        return encode_asset_inline(asset_path, max_dim)

    rel_posix = to_posix_relative_if_inside(asset_path, themes_dir)
    if rel_posix is None:
        return encode_asset_inline(asset_path, max_dim)

    file_size = asset_path.stat().st_size
    if key in HYBRID_INLINE_CANDIDATES and file_size < HYBRID_INLINE_MAX_BYTES:
        return encode_asset_inline(asset_path, max_dim)

    return rel_posix


def build_payload(
    themes_path: Path,
    engine_path: Path,
    out_path: Path,
    max_dim: int,
    inline_all: bool = False,
) -> None:
    if not themes_path.is_file():
        raise FileNotFoundError(f"themes.json not found: {themes_path}")
    if not engine_path.is_file():
        raise FileNotFoundError(f"core.js not found: {engine_path}")

    themes_raw = json.loads(themes_path.read_text(encoding="utf-8"))
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
                    key, copied[key], themes_dir, target_dim, inline_all
                )
        resolved_themes[name] = copied

    engine_src = engine_path.read_text(encoding="utf-8")
    count = engine_src.count(PLACEHOLDER)
    if count != 1:
        raise ValueError(
            f"Expected exactly 1 '{PLACEHOLDER}' placeholder in {engine_path}, found {count}."
        )

    themes_json = json.dumps(resolved_themes, ensure_ascii=False)
    compiled = engine_src.replace(PLACEHOLDER, themes_json, 1)

    extra_modules = ["kny_fx_modes.js", "kny_breathing_skills.js", "kny_chibi_aura.js"]
    prepends: list[str] = []
    for mod_name in extra_modules:
        mod_path = engine_path.parent / mod_name
        if mod_path.is_file():
            prepends.append(mod_path.read_text(encoding="utf-8"))
    if prepends:
        compiled = "\n".join(prepends) + "\n" + compiled

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(compiled, encoding="utf-8")

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
    args = parser.parse_args()

    build_payload(args.themes, args.engine, args.out, args.max_dim, args.inline_all)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
