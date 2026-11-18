"""Remove a painted-in grey checkerboard ("fake transparency") from a PNG.

Background = near-neutral pixels close to one of the two checker greys.
Small foreground specks are dropped (ImageMagick connected components),
the edge is feathered, and edge colours are pulled from the interior so
no grey fringe is left. Writes an RGBA PNG.
"""
import subprocess, sys, tempfile, os
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
LIGHT, DARK, TOL, NEUTRAL = 190.0, 128.0, 16.0, 12.0

img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
v = img.mean(axis=2)
chroma = img.max(axis=2) - img.min(axis=2)
# Both greys and the anti-aliased seams between squares (any neutral tone in between).
bg = (chroma <= NEUTRAL) & (v >= DARK - TOL) & (v <= LIGHT + TOL)
# Close the background over thin leftovers (seam lines) that sit between checker squares.
bgimg = Image.fromarray((bg * 255).astype(np.uint8))
bgimg = bgimg.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
fg = 255 - np.asarray(bgimg)

# Drop specks and fill pinholes: merge tiny components into their surroundings.
with tempfile.TemporaryDirectory() as d:
    a, b = os.path.join(d, "m.png"), os.path.join(d, "c.png")
    Image.fromarray(fg).save(a)
    subprocess.run(["magick", a, "-define", "connected-components:area-threshold=1500",
                    "-define", "connected-components:mean-color=true",
                    "-connected-components", "8", b], check=True)
    fg = np.asarray(Image.open(b).convert("L"))

mask = Image.fromarray(np.where(fg > 127, 255, 0).astype(np.uint8))
# Pull the edge in by 1px (the outermost ring is mixed with the checker), then feather.
alpha = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))

# Decontaminate edge colour: normalised blur of the solid interior.
core = np.asarray(mask.filter(ImageFilter.MinFilter(7))).astype(np.float32) / 255.0
def box(a, r, axis):
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
    hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
    lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
    return (hi - lo) / (2 * r + 1)

def blur(ch, r=3):
    out = ch.astype(np.float64)
    for _ in range(3):  # three box passes ~ a Gaussian
        out = box(box(out, r, 0), r, 1)
    return out
w = blur(core * 255.0) / 255.0 + 1e-6
fill = np.stack([blur(img[..., c] * core) / w for c in range(3)], axis=2)
edge = (core < 0.999)[..., None]
rgb = np.where(edge, fill, img).clip(0, 255).astype(np.uint8)

out = np.dstack([rgb, np.asarray(alpha)])
Image.fromarray(out, "RGBA").save(dst, optimize=True)
print(dst, "fg%", round(100 * (np.asarray(alpha) > 127).mean(), 1))
