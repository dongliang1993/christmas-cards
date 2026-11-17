import * as THREE from "three";
import type { EnvelopeColor, Seal, SealColor } from "@/lib/letter/model";
import { heightToNormal } from "@/lib/reliefCore";
import { fontFamily } from "@/lib/card/textCanvas";
import { stampIsStroked, stampPath } from "./stamps";

/** Portrait envelope that takes the 2.6×3.64 card with a margin. */
export const ENV_W = 3.0;
export const ENV_H = 4.0;
/** How far down the body the closed flap's tip reaches (from the top edge). */
const FLAP_DEPTH = 1.75;
export const SEAL_RADIUS = 0.34;
/** Seal centre, sitting on the flap tip. */
export const SEAL_POS = new THREE.Vector3(0, ENV_H / 2 - FLAP_DEPTH + 0.12, 0.03);

export const ENVELOPE_PAPER: Record<EnvelopeColor, { paper: string; ink: string }> = {
  ivory: { paper: "#f1e9dc", ink: "#3a2f28" },
  kraft: { paper: "#c6a682", ink: "#3b2a1c" },
  sage: { paper: "#b7c4ad", ink: "#2c3a2a" },
  midnight: { paper: "#2d3a52", ink: "#efe6d4" },
};

export const WAX: Record<SealColor, { color: string; metalness: number }> = {
  red: { color: "#8f1d1d", metalness: 0.05 },
  green: { color: "#2c5639", metalness: 0.05 },
  gold: { color: "#b8892e", metalness: 0.75 },
  navy: { color: "#22324f", metalness: 0.05 },
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable: cannot draw the envelope");
  return [c, ctx];
}

function texture(c: HTMLCanvasElement, color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface EnvelopeText {
  recipientName: string;
  /** Postmark line, e.g. "在路上 · 12月24日送达". */
  postmark: string | null;
}

/** The back panel's face: paper, the recipient's name and a round postmark. */
function drawBody(color: EnvelopeColor, text: EnvelopeText): HTMLCanvasElement {
  const { paper, ink } = ENVELOPE_PAPER[color];
  const [c, ctx] = canvas(900, 1200);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, c.width, c.height);
  // Paper fibres: faint speckle so the flat colour reads as paper.
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = `500 92px ${fontFamily("hand-zh")}`;
  ctx.fillText(`致 ${text.recipientName}`, c.width / 2, c.height * 0.8);

  if (text.postmark) {
    ctx.save();
    // Top right, just below the closed flap's edge so the flap never covers it.
    ctx.translate(c.width - 160, 380);
    ctx.rotate(-0.25);
    ctx.strokeStyle = "rgba(150, 40, 40, 0.65)";
    ctx.fillStyle = "rgba(150, 40, 40, 0.75)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 84, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `600 30px ${fontFamily("serif")}`;
    const [first, second] = text.postmark.split(" · ");
    ctx.fillText(first, 0, -6);
    if (second) ctx.fillText(second, 0, 34);
    ctx.restore();
  }
  return c;
}

export interface EnvelopeParts {
  group: THREE.Group;
  /** Rotate about x: 0 closed, ~π open (folded back over the top). */
  flapPivot: THREE.Group;
  dispose(): void;
}

export function buildEnvelope(color: EnvelopeColor, text: EnvelopeText): EnvelopeParts {
  const group = new THREE.Group();
  const paper = ENVELOPE_PAPER[color].paper;
  const bodyTex = texture(drawBody(color, text));
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(ENV_W, ENV_H, 0.03),
    [
      new THREE.MeshStandardMaterial({ color: paper, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: paper, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: paper, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: paper, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: paper, roughness: 0.9 }),
    ],
  );
  group.add(body);

  // Triangular flap hinged on the top edge; pointing down when closed.
  const shape = new THREE.Shape();
  shape.moveTo(-ENV_W / 2, 0);
  shape.lineTo(ENV_W / 2, 0);
  shape.quadraticCurveTo(0.25, -FLAP_DEPTH * 0.9, 0, -FLAP_DEPTH);
  shape.quadraticCurveTo(-0.25, -FLAP_DEPTH * 0.9, -ENV_W / 2, 0);
  const flapPaper = new THREE.Color(paper).multiplyScalar(0.96);
  const flap = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 24),
    new THREE.MeshStandardMaterial({ color: flapPaper, roughness: 0.88, side: THREE.DoubleSide }),
  );
  flap.position.z = 0.018;
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, ENV_H / 2, 0);
  flapPivot.add(flap);
  group.add(flapPivot);

  return {
    group,
    flapPivot,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      bodyTex.dispose();
    },
  };
}

/** Height map of the stamp design, debossed: design pixels are low. */
function stampHeight(seal: Seal, size: number): Float32Array {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  const k = size / 100;
  // Raised rim around the impression.
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4 * k;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 40 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(size * 0.2, size * 0.2);
  ctx.scale(0.6 * k, 0.6 * k);
  if (seal.stamp === "initials") {
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 54px ${fontFamily("serif")}`;
    ctx.fillText((seal.initials ?? "").toUpperCase(), 50, 52);
  } else {
    const path = new Path2D(stampPath(seal.stamp));
    if (stampIsStroked(seal.stamp)) {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.stroke(path);
    } else {
      ctx.fillStyle = "#000";
      ctx.fill(path);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.stroke(path);
    }
  }
  ctx.restore();
  ctx.filter = "blur(2px)";
  ctx.drawImage(c, 0, 0);
  const px = ctx.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i += 1) h[i] = px[i * 4] / 255;
  return h;
}

function waxShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const n = 56;
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    // Molten edge: a few slow lobes, never a perfect circle.
    const r = radius * (1 + 0.05 * Math.sin(a * 3 + 1.3) + 0.035 * Math.sin(a * 7 + 0.4));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

export interface SealParts {
  group: THREE.Group;
  halves: [THREE.Mesh, THREE.Mesh];
  material: THREE.MeshPhysicalMaterial[];
  /** Splitting planes in world space; re-aim when the seal moves. */
  planes: [THREE.Plane, THREE.Plane];
  dispose(): void;
}

export function buildSeal(seal: Seal): SealParts {
  const size = 256;
  const normalPx = heightToNormal(stampHeight(seal, size), size, size, 3.2, false);
  const normalCanvas = canvas(size, size);
  normalCanvas[1].putImageData(new ImageData(normalPx, size, size), 0, 0);
  const normalTex = texture(normalCanvas[0], false);
  // Extrude caps take UVs from x/y: map the disc's ±R box onto the texture.
  normalTex.repeat.set(1 / (SEAL_RADIUS * 2.2), 1 / (SEAL_RADIUS * 2.2));
  normalTex.offset.set(0.5, 0.5);

  const geometry = new THREE.ExtrudeGeometry(waxShape(SEAL_RADIUS), {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.05,
    bevelSegments: 4,
    curveSegments: 48,
  });
  const wax = WAX[seal.color];
  const planes: [THREE.Plane, THREE.Plane] = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
  ];
  const material = planes.map(
    (plane) =>
      new THREE.MeshPhysicalMaterial({
        color: wax.color,
        metalness: wax.metalness,
        roughness: 0.4,
        clearcoat: 0.5,
        clearcoatRoughness: 0.35,
        normalMap: normalTex,
        normalScale: new THREE.Vector2(1.4, 1.4),
        emissive: new THREE.Color("#ff6a1f"),
        emissiveIntensity: 0,
        clippingPlanes: [plane],
        transparent: true,
      }),
  );
  const halves: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(geometry, material[0]), new THREE.Mesh(geometry, material[1])];
  const group = new THREE.Group();
  for (const half of halves) group.add(half);
  return {
    group,
    halves,
    material,
    planes,
    dispose() {
      geometry.dispose();
      normalTex.dispose();
      for (const m of material) m.dispose();
    },
  };
}
