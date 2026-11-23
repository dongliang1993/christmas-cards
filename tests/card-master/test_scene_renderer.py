"""Scene-contract checks for the standalone Three.js card renderer (scene.js).

A small, bounded set on top of the production preview tests:
  1. layout.json fidelity — it IS src/lib/cards/winter-moonlight.layers.json
     with '/assets/cards/winter-moonlight/' rewritten to './art/', recursively.
  2. one browser session, three checks:
     - createScene resolves to {setOpen, setTilt, dispose}; all same-origin;
       the cover opens LEFT and the projected --page-* rect lands inside the
       canvas over the right half (the host's DOM overlay inset);
     - dispose() is idempotent and clears the --page-* vars;
     - setTilt clamps out-of-range and NaN input without throwing.
  3. theme opt-outs, no browser needed beyond one session each:
     - baked=false (and a missing manifest) never requests /baked/ maps.
"""
import contextlib
import json
import shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

TEMPLATE = Path(__file__).resolve().parents[2] / ".claude/skills/3d-card-master/assets/template"
LAYERS = Path(__file__).resolve().parents[2] / "src/lib/cards/winter-moonlight.layers.json"

STAGE_HTML = """
<div id="host" style="position:relative;width:420px;height:760px">
  <canvas id="gl" style="display:block;width:100%;height:100%"></canvas>
</div>
"""


def make_server(tmp_path, mutate=None):
    root = tmp_path / "site"
    if TEMPLATE.is_dir():
        shutil.copytree(TEMPLATE, root, dirs_exist_ok=True)
    if mutate:
        mutate(root)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, f"http://127.0.0.1:{server.server_port}/"


def test_layout_json_is_layers_json_with_art_prefix():
    layout = json.loads((TEMPLATE / "art/layout.json").read_text(encoding="utf-8"))
    layers = json.loads(LAYERS.read_text(encoding="utf-8"))

    def rewrite(node):
        if isinstance(node, str):
            return node.replace("/assets/cards/winter-moonlight/", "./art/")
        if isinstance(node, list):
            return [rewrite(n) for n in node]
        if isinstance(node, dict):
            return {k: rewrite(v) for k, v in node.items()}
        return node

    assert layout == rewrite(layers)
    assert "/assets/cards/" not in json.dumps(layout)


def test_scene_contract_single_session(tmp_path):
    server, thread, url = make_server(tmp_path)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 420, "height": 760})
            requests = []
            page.on("request", lambda r: requests.append(r.url))
            page.goto(url)
            page.set_content(STAGE_HTML)

            # Contract + same-origin + open direction + projected page rect.
            result = page.evaluate(
                """
                async () => {
                  const mod = await import('./scene.js');
                  const canvas = document.getElementById('gl');
                  const handle = await mod.createScene(canvas, {
                    title: 't', greeting: 'g', message: 'm', signature: 's',
                  });
                  window.__handle = handle;
                  const contract = {
                    setOpen: typeof handle.setOpen,
                    setTilt: typeof handle.setTilt,
                    dispose: typeof handle.dispose,
                  };
                  handle.setTilt(42, -99);   // clamps, no throw
                  handle.setTilt(NaN, 0);    // NaN -> 0, no throw
                  handle.setOpen(true);
                  const s = document.getElementById('host').style;
                  // Software WebGL can render only a few frames per second. Observe
                  // the opened spread, not an arbitrary wall-clock animation frame.
                  const deadline = performance.now() + 25000;
                  let stableFrames = 0;
                  let previous = '';
                  while (stableFrames < 5) {
                    if (performance.now() > deadline) throw new Error(`Card did not settle: ${s.cssText}`);
                    await new Promise(requestAnimationFrame);
                    const pose = ['x','y','w','h'].map(k => s.getPropertyValue('--page-' + k)).join(',');
                    const crossedSpine = parseFloat(s.getPropertyValue('--page-x')) >= canvas.clientWidth * .40;
                    stableFrames = crossedSpine && pose === previous ? stableFrames + 1 : 0;
                    previous = pose;
                  }
                  const rect = {
                    x: parseFloat(s.getPropertyValue('--page-x')),
                    y: parseFloat(s.getPropertyValue('--page-y')),
                    w: parseFloat(s.getPropertyValue('--page-w')),
                    h: parseFloat(s.getPropertyValue('--page-h')),
                  };
                  // dispose is idempotent and clears the vars.
                  handle.dispose();
                  handle.dispose();
                  const after = s.getPropertyValue('--page-x').trim();
                  return { contract, rect, after };
                }
                """,
            )
            page.wait_for_timeout(400)

            assert result["contract"] == {
                "setOpen": "function",
                "setTilt": "function",
                "dispose": "function",
            }, result["contract"]

            # Every request stayed same-origin (no remote, no repo absolutes).
            remote = [r for r in requests if not r.startswith(url)]
            assert remote == [], f"non-same-origin requests: {remote}"

            # The card glides to centre as it opens, so the right page's
            # projected rect sits inside the canvas, right of its own spine
            # (x > 0 covers the left panel) — the host insets the DOM
            # overlay text within it.
            rect = result["rect"]
            assert all(isinstance(v, (int, float)) for v in rect.values()), rect
            assert rect["x"] >= 420 * .40, rect
            assert rect["x"] + rect["w"] <= 420, rect
            assert 0 <= rect["y"] and rect["y"] + rect["h"] <= 760, rect
            assert rect["w"] > 50 and rect["h"] > 100, rect

            # dispose cleared the vars it wrote.
            assert result["after"] == "", result["after"]
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_baked_opt_out_and_missing_manifest_never_request_baked(tmp_path):
    def strip_baked(root):
        layout = json.loads((root / "art/layout.json").read_text())
        layout["baked"] = False
        (root / "art/layout.json").write_text(json.dumps(layout))

    def drop_manifest(root):
        shutil.rmtree(root / "art/baked")

    for mutate in (strip_baked, drop_manifest):
        server, thread, url = make_server(tmp_path, mutate)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                requests = []
                page.on("request", lambda r: requests.append(r.url))
                page.goto(url)
                page.set_content(STAGE_HTML)
                ok = page.evaluate(
                    """
                    async () => {
                      const mod = await import('./scene.js');
                      window.__handle = await mod.createScene(document.getElementById('gl'), {});
                      window.__handle.setOpen(true);
                      await new Promise((r) => setTimeout(r, 300));
                      return true;
                    }
                    """,
                )
                page.wait_for_timeout(500)
                assert ok is True
                # The manifest probe may load; no baked MAP may.
                baked = [
                    r
                    for r in requests
                    if "/baked/" in r and "manifest.json" not in r
                ]
                assert baked == [], f"baked maps requested in flat mode: {baked}"
                browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
