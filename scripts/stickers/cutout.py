"""Sticker intake: raw generated images -> clean transparent PNGs + manifest.

Reads   assets-src/stickers/<set>/*.png   (raw images straight from the image model)
Writes  public/assets/stickers/<set>/*.png (1024x1024 RGBA, subject centred)
        public/assets/stickers/<set>/manifest.json

Image models often fake transparency (a painted checkerboard) or use a dark or
grey backdrop. Each image is cut out by one of two modes:

  flood  (default) background = pixels connected to the border whose lightness
         and saturation fall inside the range sampled from the border. Interior
         whites (snow, icing) survive because they never touch the border.
  glow   for luminous subjects on dark ground (sparkles): alpha from lightness.

Usage: python3 scripts/stickers/cutout.py [set]     (default set: winter)
Requires: numpy, Pillow.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_SIZE = 1024
PAD = 0.06  # empty margin around the subject, as a fraction of the canvas
BORDER = 8  # px ring sampled for the background model
SPECK_RADIUS = 5  # erosion radius that drops isolated dots before regrowing

# id -> (Chinese label, material, cut-out mode). Material drives the shader
# preset: paint = glossy impasto, foil = metallic gold, pearl = iridescent white.
CATALOGUE: dict[str, tuple[str, str, str]] = {
    "star-gold": ("金色星星", "foil", "flood"),
    "sparkles": ("闪光", "foil", "glow"),
    "bell": ("铃铛", "foil", "flood"),
    "moon": ("弯月", "foil", "flood"),
    "snowflake": ("雪花", "pearl", "flood"),
    "cloud": ("云朵", "pearl", "flood"),
    "holly": ("冬青", "paint", "flood"),
    "pine-tree": ("小松树", "paint", "flood"),
    "gift": ("礼物", "paint", "flood"),
    "bow": ("蝴蝶结", "paint", "flood"),
    "gingerbread": ("姜饼人", "paint", "flood"),
    "stocking": ("圣诞袜", "paint", "flood"),
}


def lightness_saturation(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    return lum, sat


def shift_or(mask: np.ndarray) -> np.ndarray:
    """4-neighbour binary dilation."""
    out = mask.copy()
    out[1:, :] |= mask[:-1, :]
    out[:-1, :] |= mask[1:, :]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


def reconstruct(seed: np.ndarray, limit: np.ndarray) -> np.ndarray:
    """Grow `seed` inside `limit` until stable (geodesic reconstruction)."""
    current = seed & limit
    while True:
        grown = shift_or(current) & limit
        if np.array_equal(grown, current):
            return current
        current = grown


def erode(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(radius):
        inner = out.copy()
        inner[1:, :] &= out[:-1, :]
        inner[:-1, :] &= out[1:, :]
        inner[:, 1:] &= out[:, :-1]
        inner[:, :-1] &= out[:, 1:]
        out = inner
    return out


def box_blur(a: np.ndarray, passes: int = 2) -> np.ndarray:
    out = a.astype(np.float64)
    for _ in range(passes):
        p = np.pad(out, 1, mode="edge")
        out = sum(p[dy : dy + out.shape[0], dx : dx + out.shape[1]] for dy in range(3) for dx in range(3)) / 9
    return out


def border_ring(a: np.ndarray) -> np.ndarray:
    return np.concatenate(
        [a[:BORDER].ravel(), a[-BORDER:].ravel(), a[:, :BORDER].ravel(), a[:, -BORDER:].ravel()]
    )


def alpha_flood(rgb: np.ndarray) -> np.ndarray:
    lum, sat = lightness_saturation(rgb)
    ring_l, ring_s = border_ring(lum), border_ring(sat)
    lo, hi = np.percentile(ring_l, 1) - 10, np.percentile(ring_l, 99) + 12
    sat_max = np.percentile(ring_s, 99) + 0.06
    candidate = (lum >= lo) & (lum <= hi) & (sat <= sat_max)

    seed = np.zeros_like(candidate)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    background = reconstruct(seed, candidate)

    # Also clear large enclosed backdrop holes (e.g. inside a ribbon loop),
    # keeping tighter colour tolerance so painted grey details stay untouched.
    hole_lo, hole_hi = np.percentile(ring_l, 1) - 8, np.percentile(ring_l, 99) + 8
    hole_cand = (lum >= hole_lo) & (lum <= hole_hi) & (sat <= np.percentile(ring_s, 99) + 0.04) & ~background
    hole_core = erode(hole_cand, max(SPECK_RADIUS + 3, min(rgb.shape[:2]) // 360))
    if hole_core.any():
        background |= reconstruct(hole_core, candidate & ~background)

    subject = ~background
    # Drop specks (painted dust, stray dots) but keep thin parts of the
    # main shape: erode to the solid core, then regrow inside the subject.
    core = erode(subject, SPECK_RADIUS)
    if core.any():
        subject = reconstruct(core, subject)
    # Shave the 1 px fringe that still carries backdrop colour, then soften.
    subject = erode(subject, 1)
    return np.clip(box_blur(subject, 2), 0, 1)


def alpha_glow(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lum, _ = lightness_saturation(rgb)
    floor = np.percentile(border_ring(lum), 99) + 10
    t = np.clip((lum - floor) / max(1.0, 255 - floor), 0, 1)
    alpha = t * t * (3 - 2 * t)
    # Un-premultiply against black so glowing halos stay luminous on light paper.
    safe_a = np.maximum(alpha[..., None], 1e-3)
    unpremul = np.where(alpha[..., None] > 0.02, np.clip(rgb / safe_a, 0, 255), 0)
    return unpremul, alpha


def fit_square(rgba: np.ndarray) -> Image.Image:
    alpha = rgba[..., 3]
    ys, xs = np.nonzero(alpha > 8)
    if len(xs) == 0:
        raise ValueError("cut-out removed everything: check the background")
    crop = Image.fromarray(rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1])
    inner = int(OUT_SIZE * (1 - 2 * PAD))
    scale = inner / max(crop.width, crop.height)
    crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    canvas.paste(crop, ((OUT_SIZE - crop.width) // 2, (OUT_SIZE - crop.height) // 2))
    return canvas


def process(src: Path, mode: str) -> Image.Image:
    img = Image.open(src).convert("RGBA")
    rgba = np.asarray(img).astype(np.float64)
    rgb = rgba[..., :3]
    if rgba[..., 3].min() < 250:  # already truly transparent: keep it
        alpha = rgba[..., 3] / 255
    elif mode == "glow":
        rgb, alpha = alpha_glow(rgb)
    else:
        alpha = alpha_flood(rgb)
    out = np.dstack([rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    return fit_square(out)


def main() -> int:
    sticker_set = sys.argv[1] if len(sys.argv) > 1 else "winter"
    src_dir = ROOT / "assets-src" / "stickers" / sticker_set
    out_dir = ROOT / "public" / "assets" / "stickers" / sticker_set
    if not src_dir.is_dir():
        print(f"no source folder: {src_dir}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    for src in sorted(src_dir.glob("*.png")):
        sid = src.stem
        if sid not in CATALOGUE:
            print(f"skip {src.name}: not in CATALOGUE (add it with a label and material)", file=sys.stderr)
            continue
        label, material, mode = CATALOGUE[sid]
        try:
            process(src, mode).save(out_dir / f"{sid}.png", optimize=True)
        except (OSError, ValueError) as err:
            print(f"failed {src.name}: {err}", file=sys.stderr)
            continue
        entries.append({"id": sid, "label": label, "material": material, "src": f"/assets/stickers/{sticker_set}/{sid}.png"})
        print(f"ok   {src.name} -> {sid}.png ({material}, {mode})")

    order = list(CATALOGUE)
    entries.sort(key=lambda e: order.index(e["id"]))
    manifest = {"set": sticker_set, "stickers": entries}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manifest: {len(entries)} stickers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
