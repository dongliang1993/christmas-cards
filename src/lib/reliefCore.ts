/**
 * Paper & paint surface (pure pixel maths, no DOM), baked on the CPU into maps that MeshStandardMaterial
 * already understands (normal + roughness/metalness), so the studio lights do
 * the rest:
 *
 *  - cold-press tooth on every sheet, coarse enough to read at card size
 *  - painted areas stand proud of the paper (embossed rim at their edge)
 *  - brush strokes that follow the forms of the picture (LIC along contours)
 *  - paint is glossy, paper is matte: the pointer lamp glints on wet paint only
 */

/** Strokes are traced at half resolution, then sampled bilinearly. */
const STROKE_DOWNSAMPLE = 2;
const STROKE_STEPS = 9;
const STROKE_STEP_PX = 1.4;

const ROUGH_PAPER = 0.92;
const ROUGH_PAINT = 0.34;

// ---------------------------------------------------------------- noise ----

function hash2(ix: number, iy: number): number {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Value noise, optionally periodic (period in lattice cells) for tiling. */
function valueNoise(x: number, y: number, period = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => (period > 0 ? ((v % period) + period) % period : v);
  const x0 = wrap(ix);
  const x1 = wrap(ix + 1);
  const y0 = wrap(iy);
  const y1 = wrap(iy + 1);
  const a = hash2(x0, y0);
  const b = hash2(x1, y0);
  const c = hash2(x0, y1);
  const d = hash2(x1, y1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Cold-press tooth: rounded bumps with soft valleys. `cell` is the bump
 * pitch in pixels; `period` (cells) makes it tile when > 0.
 */
function coldPress(x: number, y: number, cell: number, period = 0): number {
  const big = valueNoise(x / cell, y / cell, period);
  const small = valueNoise(x / (cell * 0.5) + 19.7, y / (cell * 0.5) + 7.3, period * 2);
  return smoothstep(0.18, 0.88, big * 0.68 + small * 0.32);
}

// --------------------------------------------------------------- fields ----

/** Separable box blur, run `passes` times (≈ gaussian at 3 passes). */
function blur(src: Float32Array, w: number, h: number, radius: number, passes = 2): Float32Array {
  let a = Float32Array.from(src);
  let b = new Float32Array(w * h);
  const r = Math.max(1, Math.round(radius));
  const norm = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p += 1) {
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let acc = 0;
      for (let k = -r; k <= r; k += 1) acc += a[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x += 1) {
        b[row + x] = acc * norm;
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let k = -r; k <= r; k += 1) acc += b[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y += 1) {
        a[y * w + x] = acc * norm;
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

function sampleBilinear(f: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(w - 1.001, Math.max(0, x));
  const cy = Math.min(h - 1.001, Math.max(0, y));
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const fx = cx - ix;
  const fy = cy - iy;
  const i = iy * w + ix;
  const top = f[i] + (f[i + 1] - f[i]) * fx;
  const bot = f[i + w] + (f[i + w + 1] - f[i + w]) * fx;
  return top + (bot - top) * fy;
}

/** Height field → tangent-space normal map pixels (RGBA). */
export function heightToNormal(
  height: Float32Array,
  w: number,
  h: number,
  strength: number,
  tile: boolean,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x: number, y: number) => {
    const cx = tile ? (x + w) % w : Math.min(w - 1, Math.max(0, x));
    const cy = tile ? (y + h) % h : Math.min(h - 1, Math.max(0, y));
    return height[cy * w + cx];
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      // Canvas rows run top-down while texture v runs bottom-up: flip y.
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * w + x) * 4;
      out[o] = (nx * inv * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------- paper ----

// ---------------------------------------------------------------- cover ----

/** Paper colour of the artwork, averaged from a margin strip at the top. */
function paperColour(px: Uint8ClampedArray, w: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 4; y < 40; y += 2) {
    for (let x = 4; x < w - 4; x += 3) {
      const i = (y * w + x) * 4;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

/** 1 where there is paint, 0 on bare paper (soft threshold on colour distance). */
function paintMask(px: Uint8ClampedArray, w: number, h: number): Float32Array {
  const [pr, pg, pb] = paperColour(px, w);
  const mask = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const dr = px[i * 4] - pr;
    const dg = px[i * 4 + 1] - pg;
    const db = px[i * 4 + 2] - pb;
    mask[i] = smoothstep(14, 34, Math.sqrt(dr * dr + dg * dg + db * db));
  }
  return mask;
}

function luminance(px: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  }
  return lum;
}

/**
 * Brush strokes by line-integral convolution: white noise smeared along
 * the contours of the picture, so strokes wrap around each shape the way
 * a painter's would. Returns a field in [-0.5, 0.5] at the given size.
 */
function brushStrokes(lum: Float32Array, w: number, h: number): Float32Array {
  const soft = blur(lum, w, h, 3, 2);
  const noise = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) noise[i] = hash2(i % w, Math.floor(i / w) + 0.5);

  // Contour direction = gradient rotated 90°. Flat regions fall back to a
  // slowly turning diagonal so washes still show a hand-laid texture.
  const dirX = new Float32Array(w * h);
  const dirY = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const gx = soft[Math.min(w - 1, x + 1) + y * w] - soft[Math.max(0, x - 1) + y * w];
      const gy = soft[x + Math.min(h - 1, y + 1) * w] - soft[x + Math.max(0, y - 1) * w];
      const mag = Math.hypot(gx, gy);
      const a = 0.7 + (valueNoise(x / 60, y / 60) - 0.5) * 1.6;
      // Only crisp edges steer strokes; soft glows would curl them into
      // vortices, so those fall back to the hand-laid diagonal.
      const t = smoothstep(0.02, 0.06, mag);
      const tx = (-gy / (mag || 1)) * t + Math.cos(a) * (1 - t);
      const ty = (gx / (mag || 1)) * t + Math.sin(a) * (1 - t);
      const tl = Math.hypot(tx, ty) || 1;
      dirX[i] = tx / tl;
      dirY[i] = ty / tl;
    }
  }

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let acc = noise[y * w + x];
      for (const sign of [1, -1]) {
        let px = x;
        let py = y;
        for (let s = 0; s < STROKE_STEPS; s += 1) {
          const j = Math.round(py) * w + Math.round(px);
          if (j < 0 || j >= w * h) break;
          px += dirX[j] * STROKE_STEP_PX * sign;
          py += dirY[j] * STROKE_STEP_PX * sign;
          acc += sampleBilinear(noise, w, h, px, py);
        }
      }
      out[y * w + x] = acc / (STROKE_STEPS * 2 + 1) - 0.5;
    }
  }
  return out;
}

// ------------------------------------------------------------ materials ----

export type StickerMaterial = "paint" | "foil" | "pearl";

/**
 * How each sticker material answers the lights: roughness and metalness are
 * baked into the surface map; iridescence is set on the material itself.
 */
export const MATERIAL_PRESETS: Record<StickerMaterial, { roughness: number; metalness: number; iridescence: number }> = {
  paint: { roughness: ROUGH_PAINT, metalness: 0, iridescence: 0 },
  foil: { roughness: 0.3, metalness: 0.9, iridescence: 0 },
  pearl: { roughness: 0.32, metalness: 0.12, iridescence: 0.7 },
};

/** Opacity as a 0..1 mask: what a transparent sticker counts as "paint". */
export function alphaMask(px: Uint8ClampedArray, w: number, h: number): Float32Array {
  const mask = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) mask[i] = px[i * 4 + 3] / 255;
  return mask;
}

/** Box-average downsample by an integer factor (RGBA). */
function downsample(px: Uint8ClampedArray, w: number, h: number, f: number) {
  const sw = Math.max(1, Math.floor(w / f));
  const sh = Math.max(1, Math.floor(h / f));
  const out = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        for (let dy = 0; dy < f; dy += 1) {
          for (let dx = 0; dx < f; dx += 1) acc += px[((y * f + dy) * w + x * f + dx) * 4 + c];
        }
        out[(y * sw + x) * 4 + c] = acc / (f * f);
      }
    }
  }
  return { px: out, w: sw, h: sh };
}

/** Tileable cold-press paper normal map pixels; `bumps` tooth bumps span the tile. */
export function paperNormalTilePixels(size: number, bumps: number): Uint8ClampedArray<ArrayBuffer> {
  const cell = size / bumps;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) height[y * size + x] = coldPress(x, y, cell, bumps);
  }
  return heightToNormal(height, size, size, 1.6, true);
}

export interface BakeOptions {
  relief?: number;
  /**
   * Paint coverage. Omitted: inferred from colour distance to the paper in
   * the top margin (cover art). Given: a transparent sticker's alpha — only
   * the sticker is raised, its surroundings stay flat.
   */
  mask?: Float32Array;
  /** Sticker material; only used together with `mask`. */
  material?: StickerMaterial;
}

export interface BakedPixels {
  /** Tangent-space normal map, RGBA. */
  normal: Uint8ClampedArray<ArrayBuffer>;
  /** G = roughness, B = metalness (three.js channel convention), RGBA. */
  surface: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * Bake normal and roughness/metalness maps from a painted sheet: the cover
 * artwork, or a sticker. ~0.4 s for a 940×1316 cover on a laptop.
 */
export function bakeSurfacePixels(px: Uint8ClampedArray, w: number, h: number, opts: BakeOptions = {}): BakedPixels {
  const relief = opts.relief ?? 1;
  const isSticker = Boolean(opts.mask);
  const mask = opts.mask ?? paintMask(px, w, h);
  const preset = MATERIAL_PRESETS[opts.material ?? "paint"];
  const lum = luminance(px, w, h);

  // Paint sits proud of the paper; the blur rounds its edge into a rim.
  const plateau = blur(mask, w, h, 3, 3);

  const small = downsample(px, w, h, STROKE_DOWNSAMPLE);
  const strokes = brushStrokes(luminance(small.px, small.w, small.h), small.w, small.h);
  // LIC flattens contrast; stretch it back so ridges read under the lamp.
  const strokeGain = 4.2;

  const height = new Float32Array(w * h);
  const surface = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const m = mask[i];
      const stroke = sampleBilinear(strokes, small.w, small.h, x / STROKE_DOWNSAMPLE, y / STROKE_DOWNSAMPLE) * strokeGain;
      const tooth = coldPress(x, y, 11);
      // A sticker carries no paper of its own: tooth only shows through its paint.
      const toothWeight = isSticker ? 0.16 * m : 0.42 - 0.26 * m;
      height[i] = plateau[i] * 1.7 + m * (stroke * 0.32 + lum[i] * 0.18) + tooth * toothWeight;

      const o = i * 4;
      let rough: number;
      let metal: number;
      if (isSticker) {
        rough = preset.roughness + (tooth - 0.5) * 0.06 * m;
        metal = preset.metalness * m;
      } else {
        const r = px[o] / 255;
        const g = px[o + 1] / 255;
        const b = px[o + 2] / 255;
        // Foil: only near-white warm highlights qualify (see bubbbly analysis).
        const warm = Math.max(0, r - b);
        const candidate = Math.min(1, (r * 0.299 + g * 0.587 + b * 0.114) * (0.55 + warm * 2.4));
        metal = Math.min(1, Math.max(0, candidate - 0.66)) ** 3 * 0.75;
        rough = (ROUGH_PAPER + (ROUGH_PAINT - ROUGH_PAPER) * m + (tooth - 0.5) * 0.06) * (1 - metal * 0.6);
      }
      surface[o] = 0;
      surface[o + 1] = Math.min(1, Math.max(0, rough)) * 255;
      surface[o + 2] = Math.min(1, Math.max(0, metal)) * 255;
      surface[o + 3] = 255;
    }
  }

  return { normal: heightToNormal(height, w, h, 2.6 * relief, false), surface };
}
