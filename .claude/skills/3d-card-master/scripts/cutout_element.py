#!/usr/bin/env python3
"""Cut magenta (#FF00FF) or drawn-checkerboard backdrops out of paper-cut elements.

Ported from scripts/prep_card_source.py + scripts/unchecker.py so 3d-card-master
users can cleanly isolate AI-generated paper elements on their own machine.

Usage:
    python3 cutout_element.py INPUT OUTPUT [--mode magenta|checker] [--max-px 1024]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def cutout_magenta(im: Image.Image, max_px: int = 1024) -> Image.Image:
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mag = np.minimum(r, b) - g
    alpha = np.clip((130.0 - mag) / (130.0 - 30.0), 0.0, 1.0)

    # Despill fringe by propagating solid interior colour outward.
    solid = (alpha > 0.96).astype(np.float32)
    w_map = solid.copy()
    c_map = rgb * solid[..., None]
    for _ in range(8):
        pad_w = np.pad(w_map, 1, mode="edge")
        pad_c = np.pad(c_map, ((1, 1), (1, 1), (0, 0)), mode="edge")
        nw = sum(
            pad_w[dy : dy + w_map.shape[0], dx : dx + w_map.shape[1]]
            for dy in range(3)
            for dx in range(3)
        ) / 9.0
        nc = sum(
            pad_c[dy : dy + c_map.shape[0], dx : dx + c_map.shape[1]]
            for dy in range(3)
            for dx in range(3)
        ) / 9.0
        w_map, c_map = nw, nc
    filled = np.where(w_map[..., None] > 1e-4, c_map / np.maximum(w_map[..., None], 1e-4), rgb)
    out_rgb = np.where((alpha < 0.98)[..., None] & (w_map > 1e-4)[..., None], filled, rgb)
    rgba = np.dstack([out_rgb.clip(0, 255), (alpha * 255.0).clip(0, 255)]).round().astype(np.uint8)
    return _crop_and_cap(rgba, max_px)


def cutout_checker(im: Image.Image, max_px: int = 1024) -> Image.Image:
    """Remove neutral grey/white checkerboard pixels flood-filled from image edges."""
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    h, w, _ = rgb.shape
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    bg_like = (chroma < 16.0) & (lum > 180.0)

    visited = np.zeros((h, w), dtype=bool)
    stack: list[tuple[int, int]] = []
    for x in range(w):
        if bg_like[0, x]:
            stack.append((0, x))
        if bg_like[h - 1, x]:
            stack.append((h - 1, x))
    for y in range(h):
        if bg_like[y, 0]:
            stack.append((y, 0))
        if bg_like[y, w - 1]:
            stack.append((y, w - 1))

    while stack:
        y, x = stack.pop()
        if visited[y, x]:
            continue
        visited[y, x] = True
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and bg_like[ny, nx]:
                stack.append((ny, nx))

    alpha = np.where(visited, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb.round().astype(np.uint8), alpha])
    return _crop_and_cap(rgba, max_px)


def _crop_and_cap(rgba: np.ndarray, max_px: int) -> Image.Image:
    ys, xs = np.nonzero(rgba[..., 3] > 2)
    if len(ys) == 0:
        return Image.fromarray(rgba, "RGBA")
    cropped = Image.fromarray(rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1], "RGBA")
    scale = min(1.0, max_px / max(cropped.width, cropped.height))
    if scale < 1.0:
        cropped = cropped.resize(
            (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
            Image.LANCZOS,
        )
    return cropped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cut backdrop out of a paper-cut element.")
    parser.add_argument("input", help="source image path")
    parser.add_argument("output", help="output WebP/PNG path")
    parser.add_argument("--mode", choices=("magenta", "checker"), default="magenta")
    parser.add_argument("--max-px", type=int, default=1024)
    args = parser.parse_args(argv)

    im = Image.open(args.input)
    out = cutout_magenta(im, args.max_px) if args.mode == "magenta" else cutout_checker(im, args.max_px)
    dest = Path(args.output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.suffix.lower() == ".webp":
        out.save(dest, "WEBP", quality=92, method=6)
    else:
        out.save(dest, optimize=True)
    print(f"Cutout saved: {dest} ({out.width}x{out.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
