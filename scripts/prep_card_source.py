"""Prepare a layered card's raw sources so build_card_assets.py can consume them.

    python3 scripts/prep_card_source.py <card-id>

Works on assets-src/cards/<card-id>/, in place and idempotent:

- base.png: fitted to 940x1316. The raw render scales to 940x1410, so the
  fit is a seam operation, not a crop: a thin pad of paper texture is
  prepended (flipped) to push the top border below the paperColour sample
  band, and empty interior paper bands are removed. The row bands are a
  per-card SEAMS entry below; a base already on target size is skipped.
- elements/*.png: the magenta backdrop is cut out (alpha from min(R,B)-G),
  the fringe is despilled by normalized interior colour propagation, then
  cropped to the subject and capped at 1024 px. A file that is already
  RGBA at <= 1024 px is skipped.

Also writes /tmp/<card-id>_base_grid.png: the fitted base under a 100 px
grid, for reading element placement coordinates into the layout JSON.

Requires: numpy, Pillow.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

TARGET_SIZE = (940, 1316)
MAX_ELEMENT_PX = 1024

# Per-card seam plan, keyed by card id. The raw render scales to 940 wide;
# each plan names row bands of that scaled sheet (all [start, end)):
#   top_pad: rows duplicated (flipped) onto the top, pushing the top border
#            below the paperColour sample band
#   drops:   empty interior paper bands removed so the sheet fits 1316 rows
SEAMS: dict[str, dict] = {
    "gift-atelier": {
        "top_pad": [6, 14],
        "drops": [[175, 230], [1200, 1247]],
    },
    "snow-town": {
        # top border sits at scaled rows 65-80, already below the y=4..40
        # paperColour band: no pad. 94 rows drop from the blank lower half
        # (scaled 845..1295 holds only sparse snow dots; 1244+ has the
        # bottom corner sprigs, which stay).
        "top_pad": [0, 0],
        "drops": [[900, 994]],
    },
}


def scaled_rows(base: Image.Image) -> np.ndarray:
    """Scale the raw render to 940 wide; rows are in scaled coordinates."""
    w, _h = TARGET_SIZE
    scaled = base.resize((w, round(w * base.height / base.width)), Image.LANCZOS)
    return np.asarray(scaled)


def print_bands(base: Image.Image, card_id: str) -> None:
    """Report uniform row bands of the scaled render, to find empty paper
    bands worth dropping. A band row is one where every pixel stays close
    to the sheet's dominant colour."""
    arr = scaled_rows(base)
    med = np.median(arr.reshape(-1, 3), axis=0)
    print(f"[{card_id}] scaled sheet {arr.shape[1]}x{arr.shape[0]}, paper colour ~{med.round().astype(int).tolist()}")
    row = np.abs(arr.astype(np.float32) - med).max(axis=(1, 2))  # worst pixel per row
    uniform = row < 24
    bands: list[tuple[int, int]] = []
    start = None
    for y, ok in enumerate(uniform):
        if ok and start is None:
            start = y
        elif not ok and start is not None:
            if y - start >= 8:
                bands.append((start, y))
            start = None
    if start is not None and len(uniform) - start >= 8:
        bands.append((start, len(uniform)))
    for s, e in bands:
        print(f"  uniform band rows {s}..{e} ({e - s} rows)")


def fit_base(base: Image.Image, card_id: str) -> Image.Image:
    """Fit the raw base render to TARGET_SIZE by seam surgery, not a crop."""
    if base.size == TARGET_SIZE:
        return base
    arr = scaled_rows(base)
    plan = SEAMS.get(card_id)
    if not plan:
        raise SystemExit(f"no SEAMS entry for '{card_id}': add one (run print_bands to measure)")
    top_pad = plan["top_pad"]
    drops = sorted(plan["drops"])
    dropped = sum(e - s for s, e in drops)
    expected_h = arr.shape[0] + (top_pad[1] - top_pad[0]) - dropped
    if expected_h != TARGET_SIZE[1]:
        raise SystemExit(
            f"[{card_id}] seam plan leaves {expected_h} rows, need {TARGET_SIZE[1]} "
            f"(scaled {arr.shape[0]} + pad {top_pad[1] - top_pad[0]} - drops {dropped}): adjust drops"
        )
    keep: list[np.ndarray] = [arr[top_pad[0]:top_pad[1]][::-1]]  # pad, flipped
    prev = 0
    for s, e in drops:
        keep.append(arr[prev:s])
        prev = e
    keep.append(arr[prev:])
    out = np.vstack(keep)
    if out.shape[:2] != TARGET_SIZE[::-1]:
        raise SystemExit(f"[{card_id}] seam fit produced {out.shape[:2]}: overlapping drops?")
    return Image.fromarray(out)


def grid_overlay(base: Image.Image, card_id: str) -> None:
    """Write the fitted base under a 100 px grid, for layout coordinates."""
    grid = base.copy()
    draw = ImageDraw.Draw(grid)
    w, h = grid.size
    for x in range(0, w, 100):
        draw.line([(x, 0), (x, h)], fill=(80, 255, 120), width=1)
        draw.text((x + 4, 6), str(x), fill=(80, 255, 120))
    for y in range(0, h, 100):
        draw.line([(0, y), (w, y)], fill=(80, 255, 120), width=1)
        draw.text((6, y + 4), str(y), fill=(80, 255, 120))
    out = Path(f"/tmp/{card_id}_base_grid.png")
    grid.save(out)
    print(f"grid: {out}")


def cutout_magenta(path: Path) -> Image.Image:
    """Cut the magenta backdrop out of an element; skip already-processed files."""
    im = Image.open(path)
    if im.mode == "RGBA" and max(im.size) <= MAX_ELEMENT_PX:
        return im
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Magenta has high R AND high B with low G; crimson red has high R, low G, low B.
    mag = np.minimum(r, b) - g
    alpha = np.clip((130.0 - mag) / (130.0 - 30.0), 0.0, 1.0)

    # Despill the fringe: propagate normalised solid-interior colour outward.
    solid = (alpha > 0.96).astype(np.float32)
    w_map = solid.copy()
    c_map = rgb * solid[..., None]
    for _ in range(8):
        pad_w = np.pad(w_map, 1, mode="edge")
        pad_c = np.pad(c_map, ((1, 1), (1, 1), (0, 0)), mode="edge")
        nw = sum(pad_w[dy:dy + w_map.shape[0], dx:dx + w_map.shape[1]] for dy in range(3) for dx in range(3)) / 9.0
        nc = sum(pad_c[dy:dy + c_map.shape[0], dx:dx + c_map.shape[1]] for dy in range(3) for dx in range(3)) / 9.0
        w_map, c_map = nw, nc
    filled = np.where(w_map[..., None] > 1e-4, c_map / np.maximum(w_map[..., None], 1e-4), rgb)
    out_rgb = np.where((alpha < 0.98)[..., None] & (w_map > 1e-4)[..., None], filled, rgb)

    rgba = np.dstack([out_rgb.clip(0, 255), (alpha * 255.0).clip(0, 255)]).round().astype(np.uint8)
    ys, xs = np.nonzero(rgba[..., 3] > 2)
    cropped = Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")
    scale = min(1.0, MAX_ELEMENT_PX / max(cropped.width, cropped.height))
    if scale < 1.0:
        cropped = cropped.resize(
            (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))), Image.LANCZOS
        )
    return cropped


def main(card_id: str) -> int:
    src = ROOT / "assets-src" / "cards" / card_id
    if not src.is_dir():
        print(f"no source folder: {src}", file=sys.stderr)
        return 1

    base_path = src / "base.png"
    base = Image.open(base_path).convert("RGB")
    if "--bands" in sys.argv:
        print_bands(base, card_id)
        return 0
    fitted = fit_base(base, card_id)
    if fitted is base:
        print(f"base: already {TARGET_SIZE}")
    else:
        fitted.save(base_path, optimize=True)
        print(f"base: seam-fitted and saved {fitted.size}")
    grid_overlay(fitted, card_id)

    print("elements:")
    for path in sorted((src / "elements").glob("*.png")):
        im = Image.open(path)
        processed = not (im.mode == "RGBA" and max(im.size) <= MAX_ELEMENT_PX)
        out = cutout_magenta(path)
        if processed:
            out.save(path, optimize=True)
        a = np.asarray(out)[..., 3]
        note = "cut+saved" if processed else "skip (already RGBA)"
        print(f"  {path.name:20s} size={str(out.size):12s} opaque={(a >= 245).mean() * 100:4.1f}% trans={(a <= 5).mean() * 100:4.1f}%  {note}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
