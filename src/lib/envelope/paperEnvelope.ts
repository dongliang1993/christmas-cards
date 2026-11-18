import * as THREE from "three";
import { buildPaperNormalTile } from "@/lib/cardRelief";
import type { CanvasLike } from "@/lib/canvasFactory";
import type { EnvelopeColor } from "@/lib/letter/model";
import { ENVELOPE_PAPER } from "./envelopeModel";
import { ENVELOPE_LAYOUT as L } from "./envelopeLayout";
import { flapProfile } from "./flapBend";

/**
 * A real paper envelope (spec §2, §6): a lined back panel, two side flaps and
 * a bottom flap forming the pocket and its V-shaped mouth, a top flap that
 * bends like paper as it folds, soft shadows along every paper edge, and a
 * drop shadow. Same paper tooth as the card.
 */

const FLAP_ROWS = 32;
type Poly = [number, number][];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable: cannot draw the envelope");
  return [c, ctx];
}

/** Fibres and faint mottling, so a flat colour reads as paper stock. */
function paperCanvas(color: string, size = 768): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i += 1) {
    const g = ctx.createRadialGradient(Math.random() * size, Math.random() * size, 0, Math.random() * size, Math.random() * size, 180 + Math.random() * 260);
    g.addColorStop(0, `rgba(${Math.random() > 0.5 ? "255,255,255" : "120,90,60"},0.035)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * Math.PI;
    const l = 4 + Math.random() * 14;
    ctx.strokeStyle = Math.random() > 0.6 ? "rgba(255,255,255,0.18)" : "rgba(90,70,50,0.07)";
    ctx.lineWidth = 0.6 + Math.random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return c;
}

/** The liner inside the flap and the pocket: deep red, gold snowflakes. */
function linerCanvas(size = 1024): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = "#8c2b26";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = 0; y < size; y += 18) ctx.fillRect(0, y, size, 1);
  ctx.strokeStyle = "#e7c27a";
  ctx.lineWidth = 3;
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      ctx.save();
      ctx.translate((col + (row % 2) * 0.5) * (size / 10) + 20, row * (size / 14) + 30);
      for (let k = 0; k < 3; k += 1) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(14, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  return c;
}

/**
 * One paper layer in envelope space (w × h) with the shadows the layers above
 * throw along their edges baked in: light from the upper right, so each edge
 * shadows down and to the left.
 */
function layerCanvas(base: HTMLCanvasElement, edges: Poly[], px = 512): HTMLCanvasElement {
  const ph = Math.round((px * L.h) / L.w);
  const [c, ctx] = canvas(px, ph);
  ctx.drawImage(base, 0, 0, px, ph);
  const toPx = ([x, y]: [number, number]): [number, number] => [((x + L.w / 2) / L.w) * px, ((L.h / 2 - y) / L.h) * ph];
  for (const [blur, alpha, dx, dy, width] of [
    [18, 0.16, -8, 10, 22],
    [3, 0.22, -2, 3, 3],
  ] as const) {
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.strokeStyle = `rgba(60, 42, 30, ${alpha})`;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    for (const edge of edges) {
      ctx.beginPath();
      edge.forEach((p, i) => {
        const [x, y] = toPx(p);
        if (i === 0) ctx.moveTo(x + dx, y + dy);
        else ctx.lineTo(x + dx, y + dy);
      });
      ctx.stroke();
    }
    ctx.restore();
  }
  return c;
}

/** The top flap's outline as alpha: hinge along the bottom, rounded tip at the top. */
function flapAlphaCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, 512);
  ctx.lineTo(512, 512);
  ctx.quadraticCurveTo(470, 200, 300, 26);
  ctx.quadraticCurveTo(256, 0, 212, 26);
  ctx.quadraticCurveTo(42, 200, 0, 512);
  ctx.fill();
  return c;
}

function dropShadowCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 512);
  const rw = 512 / 1.5;
  const rh = 512 / 1.35;
  const rx = (512 - rw) / 2;
  const ry = (512 - rh) / 2;
  ctx.fillStyle = "rgba(48, 36, 28, 1)";
  ctx.filter = "blur(34px)";
  ctx.globalAlpha = 0.3;
  ctx.fillRect(rx - 10, ry + 18, rw, rh);
  ctx.filter = "blur(8px)";
  ctx.globalAlpha = 0.55;
  ctx.fillRect(rx - 3, ry + 5, rw - 2, rh - 2);
  return c;
}

function texture(c: CanvasLike, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Extrude caps take UVs from x/y: map envelope space onto the w × h canvas. */
function envelopeSpace(t: THREE.Texture): THREE.Texture {
  t.repeat.set(1 / L.w, 1 / L.h);
  t.offset.set(0.5, 0.5);
  return t;
}

function paperShape(points: Poly, curveAt?: { index: number; control: [number, number] }): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    if (curveAt && i === curveAt.index) s.quadraticCurveTo(curveAt.control[0], curveAt.control[1], points[i][0], points[i][1]);
    else s.lineTo(points[i][0], points[i][1]);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
}

export interface PaperEnvelope {
  group: THREE.Group;
  /** 0 open (pointing up), 1 shut over the pocket. */
  setFold(fold: number): void;
  /** The point on the shut flap's tip where the seal sits, in envelope space. */
  sealAt: THREE.Vector3;
  dispose(): void;
}

export function buildPaperEnvelope(color: EnvelopeColor, maxAnisotropy = 8): PaperEnvelope {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const tooth = keep(texture(buildPaperNormalTile(512, 24), false));
  tooth.wrapS = THREE.RepeatWrapping;
  tooth.wrapT = THREE.RepeatWrapping;
  tooth.repeat.set(2.2, 2.2);

  const basePaper = paperCanvas(ENVELOPE_PAPER[color].paper);
  const halfW = L.w / 2;
  const halfH = L.h / 2;
  const bottomEdge: Poly = [[-halfW, -halfH + 0.25], [-0.3, L.apexY + 0.22], [0, L.apexY + 0.35], [0.3, L.apexY + 0.22], [halfW, -halfH + 0.25]];
  const leftEdge: Poly = [[-halfW, halfH - L.sideTopInset], [-L.sideApexX, L.apexY], [-halfW, -halfH + L.sideTopInset]];
  const rightEdge: Poly = [[halfW, halfH - L.sideTopInset], [L.sideApexX, L.apexY], [halfW, -halfH + L.sideTopInset]];

  const paperMaterial = (map: THREE.Texture, tint = 1) =>
    keep(
      new THREE.MeshPhysicalMaterial({
        map,
        color: new THREE.Color(tint, tint * 0.995, tint * 0.99),
        normalMap: tooth,
        normalScale: new THREE.Vector2(1, 1),
        roughness: 0.86,
        sheen: 0.35,
        sheenColor: new THREE.Color(0xffffff),
        sheenRoughness: 0.8,
      }),
    );
  const plainPaper = paperMaterial(keep(texture(basePaper)));
  const sidePaper = paperMaterial(keep(envelopeSpace(texture(layerCanvas(basePaper, [bottomEdge])))));
  const bottomPaper = paperMaterial(keep(envelopeSpace(texture(basePaper))), 0.985);

  const liner = linerCanvas();
  const linerTex = keep(texture(liner));
  const pocketLiner = keep(
    new THREE.MeshStandardMaterial({ map: keep(texture(layerCanvas(liner, [leftEdge, rightEdge]))), normalMap: tooth, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.75 }),
  );
  for (const t of [linerTex]) t.anisotropy = maxAnisotropy;

  const drop = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(L.w * 1.5, L.h * 1.35)),
    keep(new THREE.MeshBasicMaterial({ map: keep(texture(dropShadowCanvas())), transparent: true, depthWrite: false, opacity: 0.85 })),
  );
  drop.position.z = -0.05;
  group.add(drop);

  const back = new THREE.Mesh(keep(new THREE.BoxGeometry(L.w, L.h, L.backThickness)), [plainPaper, plainPaper, plainPaper, plainPaper, pocketLiner, plainPaper]);
  back.position.z = L.backZ;
  const left = new THREE.Mesh(keep(paperShape(leftEdge)), sidePaper);
  const right = new THREE.Mesh(keep(paperShape([rightEdge[0], rightEdge[2], rightEdge[1]])), sidePaper);
  left.position.z = L.sideZ;
  right.position.z = L.sideZ;
  const bottom = new THREE.Mesh(
    keep(paperShape([[-halfW, -halfH], [halfW, -halfH], [halfW, -halfH + 0.25], [0, L.apexY + 0.35], [-halfW, -halfH + 0.25]], { index: 3, control: [0.45, L.apexY + 0.05] })),
    bottomPaper,
  );
  bottom.position.z = L.bottomZ;
  for (const m of [back, left, right, bottom]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // Top flap: a strip of rows bent by flapProfile; liner inside, paper outside.
  const flapGeo = keep(new THREE.PlaneGeometry(L.w, L.flapDepth, 1, FLAP_ROWS));
  const flapPos = flapGeo.attributes.position as THREE.BufferAttribute;
  flapPos.setUsage(THREE.DynamicDrawUsage);
  const flapAlpha = keep(texture(flapAlphaCanvas(), false));
  const flapInside = keep(
    new THREE.MeshStandardMaterial({ map: linerTex, alphaMap: flapAlpha, alphaTest: 0.5, normalMap: tooth, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.75, side: THREE.FrontSide }),
  );
  const flapOutside = paperMaterial(keep(texture(basePaper)), 0.99);
  flapOutside.alphaMap = flapAlpha;
  flapOutside.alphaTest = 0.5;
  flapOutside.side = THREE.BackSide;
  const flapA = new THREE.Mesh(flapGeo, flapInside);
  const flapB = new THREE.Mesh(flapGeo, flapOutside);
  flapA.customDepthMaterial = keep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: flapAlpha, alphaTest: 0.5 }));
  flapA.castShadow = true;
  for (const m of [flapA, flapB]) {
    m.receiveShadow = true;
    group.add(m);
  }

  const setFold = (fold: number) => {
    const pts = flapProfile(fold, FLAP_ROWS, L.flapDepth);
    for (let r = 0; r <= FLAP_ROWS; r += 1) {
      // PlaneGeometry rows run from its top (v = 1, the tip here) down to the hinge.
      const row = FLAP_ROWS - r;
      for (const i of [row * 2, row * 2 + 1]) {
        flapPos.setY(i, halfH + pts[r].y);
        flapPos.setZ(i, L.flapHingeZ + pts[r].z);
      }
    }
    flapPos.needsUpdate = true;
    flapGeo.computeVertexNormals();
    flapGeo.computeBoundingSphere();
  };
  setFold(0);

  const tipY = halfH - L.flapDepth;
  return {
    group,
    setFold,
    sealAt: new THREE.Vector3(0, tipY + 0.22, L.flapHingeZ + 0.078),
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
