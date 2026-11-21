import * as THREE from "three";
import { fontFamily } from "@/lib/card/textCanvas";
import type { Seal } from "@/lib/letter/model";
import { heightToNormal } from "@/lib/reliefCore";
import { WAX, type SealParts } from "./envelopeModel";
import { stampIsStroked, stampPath } from "./stamps";
import { waxHeight, waxOutline, type StampSampler } from "./waxHeight";

/** World size of one wax unit (the stamp's radius is ~0.92 units). */
export const WAX_SCALE = 0.27;
const SEED = 3;
const RINGS = 72;
const SEGMENTS = 192;
/** The baked maps cover ±MAP_SPAN wax units. */
const MAP_SPAN = 1.6;
const MAP_PX = 512;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable: cannot draw the wax seal");
  return [c, ctx];
}

/** The stamp's design as a soft-edged 0..1 sampler over the stamp face. */
function stampSampler(seal: Seal): StampSampler {
  const size = 256;
  const [, ctx] = canvas(size, size);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size * 0.1, size * 0.1);
  ctx.scale((size * 0.8) / 100, (size * 0.8) / 100);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  if (seal.stamp === "initials") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 52px ${fontFamily("serif")}`;
    ctx.fillText((seal.initials ?? "").toUpperCase(), 50, 53);
  } else {
    const path = new Path2D(stampPath(seal.stamp));
    if (stampIsStroked(seal.stamp)) {
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path);
    } else {
      ctx.fill(path);
    }
  }
  ctx.restore();
  // Soften: a die-struck edge is rounded, not a pixel step.
  ctx.filter = "blur(1.6px)";
  ctx.drawImage(ctx.canvas, 0, 0);
  const px = ctx.getImageData(0, 0, size, size).data;
  return (u, v) => {
    const x = Math.round(((u + 1) / 2) * (size - 1));
    const y = Math.round(((1 - v) / 2) * (size - 1));
    if (x < 0 || y < 0 || x >= size || y >= size) return 0;
    return px[(y * size + x) * 4] / 255;
  };
}

/** Height over the map's square, fully spread: the source for the normal and colour maps. */
function bakeHeight(stamp: StampSampler): Float32Array {
  const h = new Float32Array(MAP_PX * MAP_PX);
  for (let j = 0; j < MAP_PX; j += 1) {
    const y = MAP_SPAN - (j / (MAP_PX - 1)) * 2 * MAP_SPAN;
    for (let i = 0; i < MAP_PX; i += 1) {
      const x = (i / (MAP_PX - 1)) * 2 * MAP_SPAN - MAP_SPAN;
      h[j * MAP_PX + i] = waxHeight(x, y, 1, stamp, SEED);
    }
  }
  return h;
}

/**
 * Colour by thickness and shape: thin wax at the edge lets the light through
 * (lighter, warmer); recesses collect shadow; ridges catch a little bloom.
 */
function bakeColour(height: Float32Array, base: THREE.Color): HTMLCanvasElement {
  const [c, ctx] = canvas(MAP_PX, MAP_PX);
  const img = ctx.createImageData(MAP_PX, MAP_PX);
  const dark = base.clone().multiplyScalar(0.62);
  const thin = base.clone().lerp(new THREE.Color("#ff8a5c"), 0.35).multiplyScalar(1.12);
  const out = new THREE.Color();
  const at = (i: number, j: number) => height[Math.min(MAP_PX - 1, Math.max(0, j)) * MAP_PX + Math.min(MAP_PX - 1, Math.max(0, i))];
  for (let j = 0; j < MAP_PX; j += 1) {
    for (let i = 0; i < MAP_PX; i += 1) {
      const h = at(i, j);
      const k = (j * MAP_PX + i) * 4;
      if (h <= 0) {
        img.data[k + 3] = 0;
        continue;
      }
      // Curvature: negative in hollows, positive on ridges.
      const lap = (at(i - 3, j) + at(i + 3, j) + at(i, j - 3) + at(i, j + 3)) / 4 - h;
      const cavity = Math.min(1, Math.max(0, lap * 90));
      const thinness = 1 - Math.min(1, h / 0.11);
      out.copy(base).lerp(thin, thinness * 0.8).lerp(dark, cavity * 0.7);
      out.convertLinearToSRGB();
      img.data[k] = Math.round(Math.min(1, out.r) * 255);
      img.data[k + 1] = Math.round(Math.min(1, out.g) * 255);
      img.data[k + 2] = Math.round(Math.min(1, out.b) * 255);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function texture(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A polar grid, rings out to the irregular outline; positions set by setSpread. */
function buildGrid(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const count = 1 + RINGS * SEGMENTS;
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(count * 2);
  uv[0] = 0.5;
  uv[1] = 0.5;
  for (let r = 1; r <= RINGS; r += 1) {
    for (let s = 0; s < SEGMENTS; s += 1) {
      const th = (s / SEGMENTS) * Math.PI * 2;
      const rad = (r / RINGS) * waxOutline(th, 1, SEED);
      const k = 1 + (r - 1) * SEGMENTS + s;
      uv[k * 2] = 0.5 + (Math.cos(th) * rad) / (2 * MAP_SPAN);
      uv[k * 2 + 1] = 0.5 + (Math.sin(th) * rad) / (2 * MAP_SPAN);
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const index: number[] = [];
  for (let s = 0; s < SEGMENTS; s += 1) index.push(0, 1 + s, 1 + ((s + 1) % SEGMENTS));
  for (let r = 1; r < RINGS; r += 1) {
    for (let s = 0; s < SEGMENTS; s += 1) {
      const a = 1 + (r - 1) * SEGMENTS + s;
      const b = 1 + (r - 1) * SEGMENTS + ((s + 1) % SEGMENTS);
      const c = a + SEGMENTS;
      const d = b + SEGMENTS;
      index.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(index);
  return geo;
}

export interface WaxSealParts extends SealParts {
  /** 0 = nothing, 1 = fully pressed. Rebuilds the surface, so the outline and lip grow. */
  setSpread(spread: number): void;
}

/** A real-looking wax seal (spec §6 火漆): replaces buildSeal in the envelope scene. */
export function buildWaxSeal(seal: Seal): WaxSealParts {
  const stamp = stampSampler(seal);
  const baked = bakeHeight(stamp);
  const normalTex = texture(
    (() => {
      const [c, ctx] = canvas(MAP_PX, MAP_PX);
      ctx.putImageData(new ImageData(heightToNormal(baked, MAP_PX, MAP_PX, 26, false), MAP_PX, MAP_PX), 0, 0);
      return c;
    })(),
    false,
  );
  const wax = WAX[seal.color];
  const colourTex = texture(bakeColour(baked, new THREE.Color(wax.color)), true);

  const geometry = buildGrid();
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const setSpread = (spread: number) => {
    const s = Math.min(1, Math.max(0, spread));
    pos.setXYZ(0, 0, 0, waxHeight(0, 0, s, stamp, SEED) * WAX_SCALE);
    for (let r = 1; r <= RINGS; r += 1) {
      for (let k = 0; k < SEGMENTS; k += 1) {
        const th = (k / SEGMENTS) * Math.PI * 2;
        // Stay a hair inside the outline so the rim sits on the paper, not below it.
        const rad = (r / RINGS) * waxOutline(th, s, SEED) * 0.999;
        const x = Math.cos(th) * rad;
        const y = Math.sin(th) * rad;
        pos.setXYZ(1 + (r - 1) * SEGMENTS + k, x * WAX_SCALE, y * WAX_SCALE, waxHeight(x, y, s, stamp, SEED) * WAX_SCALE);
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  };
  setSpread(1);

  const planes: [THREE.Plane, THREE.Plane] = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
  ];
  const material = planes.map(
    (plane) =>
      new THREE.MeshPhysicalMaterial({
        map: colourTex,
        normalMap: normalTex,
        normalScale: new THREE.Vector2(1, 1),
        metalness: wax.metalness,
        roughness: 0.32,
        clearcoat: 1,
        clearcoatRoughness: 0.16,
        sheen: 0.3,
        sheenColor: new THREE.Color("#ffb08a"),
        sheenRoughness: 0.5,
        emissive: new THREE.Color("#c8361a"),
        emissiveIntensity: 0,
        clippingPlanes: [plane],
        transparent: true,
      }),
  );
  const halves: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(geometry, material[0]), new THREE.Mesh(geometry, material[1])];
  const group = new THREE.Group();
  for (const half of halves) {
    half.castShadow = true;
    half.receiveShadow = true;
    group.add(half);
  }
  return {
    group,
    halves,
    material,
    planes,
    setSpread,
    dispose() {
      geometry.dispose();
      normalTex.dispose();
      colourTex.dispose();
      for (const m of material) m.dispose();
    },
  };
}
