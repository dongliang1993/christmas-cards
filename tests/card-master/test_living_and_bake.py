"""Tests for bake_card.py (relief + gold-foil baking) and living-card scene hooks."""
import json
import shutil
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import numpy as np
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

SKILL_DIR = Path(__file__).resolve().parents[2] / ".claude/skills/3d-card-master"
BAKE_SCRIPT = SKILL_DIR / "scripts/bake_card.py"
CUTOUT_SCRIPT = SKILL_DIR / "scripts/cutout_element.py"
CREATE_SCRIPT = SKILL_DIR / "scripts/create_card.py"


def test_bake_card_produces_relief_and_gold_foil_maps(tmp_path):
    card_dir = tmp_path / "custom-card"
    subprocess.run([sys.executable, str(CREATE_SCRIPT), str(card_dir)], check=True)
    art = card_dir / "art"
    shutil.rmtree(art / "baked")

    # Cotton-cream paper base with a gold-foil emblem in the center.
    base = Image.new("RGB", (240, 336), (243, 237, 227))
    draw = ImageDraw.Draw(base)
    draw.rectangle((40, 60, 200, 220), fill=(62, 74, 102))
    draw.ellipse((95, 110, 145, 160), fill=(208, 168, 84))  # gold foil
    base.save(art / "cover-base.webp", "WEBP", quality=95)

    # Transparent element with gold foil.
    elem = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
    ed = ImageDraw.Draw(elem)
    ed.ellipse((20, 20, 100, 100), fill=(214, 174, 88, 255))
    elem.save(art / "elements/emblem.webp", "WEBP", lossless=True)

    (art / "layout.json").write_text(
        json.dumps(
            {
                "size": [240, 336],
                "base": "./art/cover-base.webp",
                "cover": "./art/cover-base.webp",
                "items": [
                    {
                        "id": "emblem",
                        "src": "./art/elements/emblem.webp",
                        "box": [60, 100, 120],
                        "lift": 0.02,
                    }
                ],
                "motifs": [],
                "winterEffects": False,
            }
        ),
        encoding="utf-8",
    )

    res = subprocess.run([sys.executable, str(BAKE_SCRIPT), str(card_dir)], capture_output=True, text=True)
    assert res.returncode == 0, res.stderr

    manifest = json.loads((art / "baked/manifest.json").read_text(encoding="utf-8"))
    names = {e["name"] for e in manifest["entries"]}
    assert names == {"base", "layer-emblem"}

    base_surf = np.asarray(Image.open(art / "baked/base-surface.webp").convert("RGB"))
    # Bare paper margin at top-left: high roughness (G ~ 230), near-zero metalness (B ~ 0)
    assert base_surf[10, 10, 1] > 200
    assert base_surf[10, 10, 2] < 15
    # Gold circle at center (120, 135): metallic (B > 120) and smoother than paper
    assert base_surf[135, 120, 2] > 120
    assert base_surf[135, 120, 1] < 140

    elem_surf = np.asarray(Image.open(art / "baked/layer-emblem-surface.webp").convert("RGB"))
    assert elem_surf[60, 60, 2] > 120


def test_cutout_magenta_produces_clean_transparent_crop(tmp_path):
    raw = Image.new("RGB", (200, 200), (255, 0, 255))
    ImageDraw.Draw(raw).ellipse((50, 50, 150, 150), fill=(210, 175, 92))
    src = tmp_path / "raw.png"
    dst = tmp_path / "clean.webp"
    raw.save(src)

    res = subprocess.run([sys.executable, str(CUTOUT_SCRIPT), str(src), str(dst)], capture_output=True, text=True)
    assert res.returncode == 0, res.stderr
    out = Image.open(dst).convert("RGBA")
    assert 95 <= out.width <= 110 and 95 <= out.height <= 110
    arr = np.asarray(out)
    assert arr[0, 0, 3] == 0
    assert arr[out.height // 2, out.width // 2, 3] > 240


def test_living_scene_handles_pointer_orbit_and_hotspot_tap(tmp_path):
    card_dir = tmp_path / "live-card"
    subprocess.run([sys.executable, str(CREATE_SCRIPT), str(card_dir)], check=True)
    layout_path = card_dir / "art/layout.json"
    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    layout["winterEffects"] = False
    layout["glow"] = {"at": [470, 658], "color": "#ffd27a", "size": 0.45, "intensity": 0.7, "flicker": True}
    layout["particles"] = {"kind": "gold", "area": [180, 140, 580, 660], "count": 24, "size": 0.14}
    layout["live"] = {
        "movers": {
            "flame": {"pivot": [470, 658], "area": [470, 640, 40, 45], "flicker": 0.18, "kick": 14, "wind": 0.8}
        },
        "taps": [],
        "glowTap": [470, 658, 120],
        "glowKick": ["flame"],
        "greet": ["flame"],
    }
    layout_path.write_text(json.dumps(layout), encoding="utf-8")

    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        partial(SimpleHTTPRequestHandler, directory=str(card_dir)),
    )
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--enable-unsafe-swiftshader", "--use-angle=swiftshader"])
            page = browser.new_page(viewport={"width": 600, "height": 760})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.set_content(
                '<div id="host" style="position:relative;width:600px;height:760px">'
                '<canvas id="gl" style="display:block;width:100%;height:100%"></canvas></div>'
            )
            res = page.evaluate(
                """
                async () => {
                  const { createScene } = await import('./scene.js');
                  const canvas = document.getElementById('gl');
                  const h = await createScene(canvas, { title: 'Test', greeting: 'Hi', message: 'Ok', signature: 'Me' });
                  await new Promise((r) => setTimeout(r, 250));
                  const rect = canvas.getBoundingClientRect();
                  h.setPointer(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5, true, 120, -40);
                  h.setOrbit(0.15, 0.35, true);
                  const orb = h.getOrbit();
                  h.releaseOrbit(200, 0);
                  const hitCenter = h.tapAt(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
                  const hitCorner = h.tapAt(rect.left + 8, rect.top + 8);
                  await new Promise((r) => setTimeout(r, 200));
                  h.dispose();
                  return { orb, hitCenter, hitCorner };
                }
                """
            )
            assert not errors, errors
            assert abs(res["orb"]["x"] - 0.15) < 1e-6
            assert abs(res["orb"]["y"] - 0.35) < 1e-6
            assert res["hitCenter"] is True
            assert res["hitCorner"] is False
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
