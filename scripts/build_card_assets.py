"""Build a layered (paper-cut) card's public assets from its sources.

    python3 scripts/build_card_assets.py src/lib/cards/winter-moonlight.layers.json

Sources live in assets-src/cards/<id>/: `base.png` (940x1316) and
`elements/<name>.png` (transparent, full resolution). The layout JSON names
the public files; this writes them:

- each element as WebP, sized for how it shows on the card: twice its widest
  use on the cover (retina, editor zoom), or the `px` an inside-page motif
  asks for in `motifs`, whichever is larger, never above 1024 px;
- the base sheet as WebP;
- the flat composite cover (base + elements, lowest lift first) as WebP,
  composed from the full-resolution sources. The 3D card raises the same
  elements as paper layers; the composite is what stand-ins, thumbnails and
  the envelope show, so the two line up face-on.
"""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MAX_ELEMENT_PX = 1024
ELEMENT_SCALE = 2.0
QUALITY = 90

def public(url: str) -> Path:
    return PUBLIC / url.lstrip("/")

def save_webp(img: Image.Image, url: str) -> None:
    out = public(url)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "WEBP", quality=QUALITY, method=6)
    print(f"  {url}  {img.size[0]}x{img.size[1]}  {out.stat().st_size // 1024}KB")

def main(layout_path: str) -> None:
    layout_file = Path(layout_path)
    layout = json.loads(layout_file.read_text())
    card_id = layout_file.name.split(".")[0]
    src = ROOT / "assets-src" / "cards" / card_id
    w, h = layout["size"]

    base = Image.open(src / "base.png").convert("RGBA")
    if base.size != (w, h):
        raise SystemExit(f"base is {base.size}, layout says {(w, h)}")

    # One file per element, sized for its widest use on the card.
    # Target pixel width per element: cover use x scale, or an inside motif's own ask.
    widest: dict[str, int] = {}
    for item in layout["items"]:
        widest[item["src"]] = max(widest.get(item["src"], 0), round(item["box"][2] * ELEMENT_SCALE))
    for motif in layout.get("motifs", []):
        widest[motif["src"]] = max(widest.get(motif["src"], 0), motif["px"])
    originals: dict[str, Image.Image] = {}
    print("elements:")
    for url, want_w in widest.items():
        name = Path(url).stem
        img = Image.open(src / "elements" / f"{name}.png").convert("RGBA")
        originals[url] = img
        tw = min(MAX_ELEMENT_PX, want_w, img.width)
        th = round(tw * img.height / img.width)
        save_webp(img.resize((tw, th), Image.LANCZOS), url)

    print("base:")
    save_webp(base, layout["base"])

    composite = base.copy()
    for item in sorted(layout["items"], key=lambda it: it["lift"]):
        el = originals[item["src"]]
        x, y, bw = item["box"]
        bh = round(bw * el.height / el.width)
        composite.alpha_composite(el.resize((bw, bh), Image.LANCZOS), (x, y))
    print("cover:")
    save_webp(composite.convert("RGB"), layout["cover"])

if __name__ == "__main__":
    main(sys.argv[1])
