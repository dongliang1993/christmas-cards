#!/usr/bin/env python3
"""Bake paper & paint relief maps (normal + surface) for a 3d-card-master card.

Faithful Python/NumPy port of src/lib/reliefCore.ts (bakeSurfacePixels),
producing the exact packed textures scene.js expects under <card>/art/baked/:
  - *-normal.webp:  tangent-space normal map (cold-press cotton tooth +
                    embossed paint plateau + LIC contour brush strokes)
  - *-surface.webp: packed G = roughness (matte paper ~0.92, wet ink ~0.34,
                    gold foil ~0.34), B = metalness (gold foil ~0.70)
  - manifest.json:  entries for "base" and every "layer-<id>" in layout.json

Usage:
    python3 bake_card.py <card-dir> [--tooth 1.4] [--relief 1.0] [--no-gold-foil]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROUGH_PAPER = 0.92
ROUGH_PAINT = 0.34
ROUGH_GOLD = 0.34
METAL_GOLD = 0.70
STROKE_DOWNSAMPLE = 2
STROKE_STEPS = 9
STROKE_STEP_PX = 1.4


def _hash2(ix: np.ndarray, iy: np.ndarray) -> np.ndarray:
    s = np.sin(ix * 127.1 + iy * 311.7) * 43758.5453
    return s - np.floor(s)


def _smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _value_noise(x: np.ndarray, y: np.ndarray, period: int = 0) -> np.ndarray:
    ix = np.floor(x)
    iy = np.floor(y)
    fx = x - ix
    fy = y - iy
    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    if period > 0:
        x0 = np.mod(ix, period)
        x1 = np.mod(ix + 1.0, period)
        y0 = np.mod(iy, period)
        y1 = np.mod(iy + 1.0, period)
    else:
        x0, x1, y0, y1 = ix, ix + 1.0, iy, iy + 1.0
    a = _hash2(x0, y0)
    b = _hash2(x1, y0)
    c = _hash2(x0, y1)
    d = _hash2(x1, y1)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


def cold_press_field(w: int, h: int, cell: float = 11.0) -> np.ndarray:
    xs = np.arange(w, dtype=np.float32)[None, :]
    ys = np.arange(h, dtype=np.float32)[:, None]
    big = _value_noise(xs / cell, ys / cell)
    small = _value_noise(xs / (cell * 0.5) + 19.7, ys / (cell * 0.5) + 7.3)
    return _smoothstep(0.18, 0.88, big * 0.68 + small * 0.32).astype(np.float32)


def _box_blur(src: np.ndarray, radius: int, passes: int = 2) -> np.ndarray:
    r = max(1, int(round(radius)))
    a = src.astype(np.float32, copy=True)
    k = 2 * r + 1
    for _ in range(passes):
        # Horizontal pass via cumulative sum
        pad = np.pad(a, ((0, 0), (r, r)), mode="edge")
        cs = np.cumsum(np.pad(pad, ((0, 0), (1, 0))), axis=1)
        b = (cs[:, k:] - cs[:, :-k]) / k
        # Vertical pass
        pad = np.pad(b, ((r, r), (0, 0)), mode="edge")
        cs = np.cumsum(np.pad(pad, ((1, 0), (0, 0))), axis=0)
        a = (cs[k:, :] - cs[:-k, :]) / k
    return a


def _sample_bilinear(field: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    h, w = field.shape
    cx = np.clip(x, 0.0, w - 1.001)
    cy = np.clip(y, 0.0, h - 1.001)
    ix = np.floor(cx).astype(np.int32)
    iy = np.floor(cy).astype(np.int32)
    fx = cx - ix
    fy = cy - iy
    top = field[iy, ix] + (field[iy, ix + 1] - field[iy, ix]) * fx
    bot = field[iy + 1, ix] + (field[iy + 1, ix + 1] - field[iy + 1, ix]) * fx
    return top + (bot - top) * fy


def _brush_strokes(lum: np.ndarray) -> np.ndarray:
    sh, sw = lum.shape
    soft = _box_blur(lum, 3, 2)
    xs = np.arange(sw, dtype=np.float32)[None, :]
    ys = np.arange(sh, dtype=np.float32)[:, None]
    noise = _hash2(xs, ys + 0.5).astype(np.float32)

    gx = np.pad(soft, ((0, 0), (1, 1)), mode="edge")[:, 2:] - np.pad(soft, ((0, 0), (1, 1)), mode="edge")[:, :-2]
    gy = np.pad(soft, ((1, 1), (0, 0)), mode="edge")[2:, :] - np.pad(soft, ((1, 1), (0, 0)), mode="edge")[:-2, :]
    mag = np.hypot(gx, gy)
    safe_mag = np.where(mag > 1e-6, mag, 1.0)
    a = 0.7 + (_value_noise(xs / 60.0, ys / 60.0) - 0.5) * 1.6
    t = _smoothstep(0.02, 0.06, mag)
    tx = (-gy / safe_mag) * t + np.cos(a) * (1.0 - t)
    ty = (gx / safe_mag) * t + np.sin(a) * (1.0 - t)
    tl = np.hypot(tx, ty)
    tl = np.where(tl > 1e-6, tl, 1.0)
    dir_x = (tx / tl).astype(np.float32)
    dir_y = (ty / tl).astype(np.float32)

    acc = noise.copy()
    for sign in (1.0, -1.0):
        px = np.broadcast_to(xs, (sh, sw)).astype(np.float32, copy=True)
        py = np.broadcast_to(ys, (sh, sw)).astype(np.float32, copy=True)
        for _ in range(STROKE_STEPS):
            ix = np.clip(np.round(px).astype(np.int32), 0, sw - 1)
            iy = np.clip(np.round(py).astype(np.int32), 0, sh - 1)
            px = px + dir_x[iy, ix] * STROKE_STEP_PX * sign
            py = py + dir_y[iy, ix] * STROKE_STEP_PX * sign
            acc += _sample_bilinear(noise, px, py)
    return (acc / (STROKE_STEPS * 2 + 1) - 0.5).astype(np.float32)


def _goldness(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    delta = mx - mn
    safe_mx = np.where(mx > 0, mx, 1.0)
    safe_d = np.where(delta > 0, delta, 1.0)
    v = mx / 255.0
    sat = np.where(mx > 0, delta / safe_mx, 0.0)
    hue = np.where(
        mx == r,
        np.mod(60.0 * ((g - b) / safe_d) + 360.0, 360.0),
        np.where(
            mx == g,
            60.0 * ((b - r) / safe_d) + 120.0,
            60.0 * ((r - g) / safe_d) + 240.0,
        ),
    )
    hue_w = _smoothstep(22.0, 30.0, hue) * (1.0 - _smoothstep(55.0, 62.0, hue))
    sat_w = _smoothstep(0.24, 0.34, sat)
    val_w = _smoothstep(0.38, 0.48, v) * (1.0 - _smoothstep(0.94, 0.98, v))
    return np.where(delta > 0, hue_w * sat_w * val_w, 0.0).astype(np.float32)


def _height_to_normal(height: np.ndarray, strength: float) -> Image.Image:
    pad_x = np.pad(height, ((0, 0), (1, 1)), mode="edge")
    pad_y = np.pad(height, ((1, 1), (0, 0)), mode="edge")
    nx = -(pad_x[:, 2:] - pad_x[:, :-2]) * strength
    ny = (pad_y[2:, :] - pad_y[:-2, :]) * strength
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    out = np.empty((height.shape[0], height.shape[1], 3), dtype=np.uint8)
    out[..., 0] = np.clip((nx * inv * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    out[..., 1] = np.clip((ny * inv * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    out[..., 2] = np.clip((inv * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB")


def bake_image(
    img: Image.Image,
    *,
    is_layer: bool,
    gold_foil: bool = True,
    tooth: float = 1.4,
    relief: float = 1.0,
) -> tuple[Image.Image, Image.Image]:
    """Bake tangent-space normal and packed surface (G=rough, B=metal) maps."""
    rgba = np.asarray(img.convert("RGBA"), dtype=np.float32)
    h, w, _ = rgba.shape
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]

    if is_layer:
        mask = (a / 255.0).astype(np.float32)
    else:
        strip = rgba[4 : min(40, h), 4 : max(5, w - 4), :3]
        pr, pg, pb = strip.mean(axis=(0, 1))
        dist = np.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2)
        mask = _smoothstep(14.0, 34.0, dist).astype(np.float32)

    lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
    plateau = _box_blur(mask, 3, 3)

    sw = max(2, w // STROKE_DOWNSAMPLE)
    sh = max(2, h // STROKE_DOWNSAMPLE)
    small_lum = np.asarray(
        Image.fromarray(np.clip(lum * 255.0, 0, 255).astype(np.uint8)).resize((sw, sh), Image.BILINEAR),
        dtype=np.float32,
    ) / 255.0
    strokes_small = _brush_strokes(small_lum)
    xs = np.arange(w, dtype=np.float32)[None, :] / STROKE_DOWNSAMPLE
    ys = np.arange(h, dtype=np.float32)[:, None] / STROKE_DOWNSAMPLE
    strokes = _sample_bilinear(strokes_small, xs, ys) * 4.2

    tooth_field = cold_press_field(w, h, 11.0)
    tooth_weight = (0.16 * mask if is_layer else 0.42 - 0.26 * mask) * tooth
    height = plateau * 1.7 + mask * (strokes * 0.32 + lum * 0.18) + tooth_field * tooth_weight

    if is_layer:
        base_rough = ROUGH_PAINT + (tooth_field - 0.5) * 0.06 * mask
    else:
        base_rough = ROUGH_PAPER + (ROUGH_PAINT - ROUGH_PAPER) * mask + (tooth_field - 0.5) * 0.06

    if gold_foil:
        gold = _goldness(r, g, b) * (mask if is_layer else 1.0)
        metal = gold * METAL_GOLD
        rough = base_rough + (ROUGH_GOLD - base_rough) * gold
    else:
        metal = np.zeros_like(base_rough)
        rough = base_rough

    normal_im = _height_to_normal(height, 2.6 * relief)
    surf = np.zeros((h, w, 3), dtype=np.uint8)
    surf[..., 1] = np.clip(rough * 255.0, 0, 255).astype(np.uint8)
    surf[..., 2] = np.clip(metal * 255.0, 0, 255).astype(np.uint8)
    surface_im = Image.fromarray(surf, "RGB")
    return normal_im, surface_im


def bake_card(
    card_dir: Path,
    *,
    gold_foil: bool = True,
    tooth: float = 1.4,
    relief: float = 1.0,
) -> int:
    art_dir = card_dir / "art"
    layout_path = art_dir / "layout.json"
    if not layout_path.is_file():
        print(f"error: layout.json not found at {layout_path}", file=sys.stderr)
        return 2

    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    baked_dir = art_dir / "baked"
    baked_dir.mkdir(parents=True, exist_ok=True)

    def resolve_art(rel: str) -> Path:
        return (card_dir / rel.lstrip("./")).resolve()

    entries: list[dict[str, str]] = []

    base_path = resolve_art(layout["base"])
    base_img = Image.open(base_path)
    n_img, s_img = bake_image(base_img, is_layer=False, gold_foil=gold_foil, tooth=tooth, relief=relief)
    n_img.save(baked_dir / "base-normal.webp", "WEBP", quality=88, method=5)
    s_img.save(baked_dir / "base-surface.webp", "WEBP", quality=92, method=5)
    entries.append(
        {
            "key": f"base|{card_dir.name}|{relief}|{tooth}",
            "name": "base",
            "normal": "base-normal.webp",
            "surface": "base-surface.webp",
        }
    )

    for item in layout.get("items", []):
        item_id = item["id"]
        src_path = resolve_art(item["src"])
        img = Image.open(src_path)
        # Bake at up to 360px longest side, matching LAYER_BAKE_SCALE in cardBakes.ts
        scale = min(1.0, 360.0 / max(img.width, img.height))
        if scale < 1.0:
            img = img.resize(
                (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                Image.LANCZOS,
            )
        n_im, s_im = bake_image(img, is_layer=True, gold_foil=gold_foil, tooth=1.0, relief=relief)
        n_name = f"layer-{item_id}-normal.webp"
        s_name = f"layer-{item_id}-surface.webp"
        n_im.save(baked_dir / n_name, "WEBP", quality=88, method=5)
        s_im.save(baked_dir / s_name, "WEBP", quality=92, method=5)
        entries.append(
            {
                "key": f"layer|{item['src']}|360",
                "name": f"layer-{item_id}",
                "normal": n_name,
                "surface": s_name,
            }
        )

    manifest = {"version": 1, "card": card_dir.name, "entries": entries}
    (baked_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Baked {len(entries)} relief surfaces into {baked_dir}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bake paper & foil relief maps for a card.")
    parser.add_argument("card_dir", help="path to generated card directory")
    parser.add_argument("--tooth", type=float, default=1.4, help="cold-press cotton tooth strength")
    parser.add_argument("--relief", type=float, default=1.0, help="normal relief strength")
    parser.add_argument("--no-gold-foil", action="store_true", help="disable automatic gold-foil detection")
    args = parser.parse_args(argv)
    return bake_card(
        Path(args.card_dir).resolve(),
        gold_foil=not args.no_gold_foil,
        tooth=args.tooth,
        relief=args.relief,
    )


if __name__ == "__main__":
    raise SystemExit(main())
