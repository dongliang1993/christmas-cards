import * as THREE from "three";

/**
 * Snow falling inside a card's window, after the reference card's flakes
 * (docs/references/bubbbly-christmas-cards.md): real six-armed flakes from a
 * small atlas, each its own size and slow spin, and blown along by the
 * pointer: a sweep across the card carries the snow with it.
 */
export interface SnowBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface CardSnow {
  points: THREE.Points;
  /**
   * Advance one frame. `wind` is the pointer's sweep velocity across the card
   * (card units / s, y up); `motion` the reduced-motion factor.
   */
  update(dt: number, elapsed: number, bounds: SnowBounds, wind: { x: number; y: number }, motion: number): void;
  dispose(): void;
}

const ATLAS_CELLS = 4;
const CELL_PX = 96;
/** Share of the pointer's sweep a flake takes on, across and down (the reference's 0.2 / 0.08). */
const WIND_CARRY_X = 0.2;
const WIND_CARRY_Y = 0.08;

/** Four six-armed flakes side by side, white on transparent. */
function createFlakeAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CELL_PX * ATLAS_CELLS;
  canvas.height = CELL_PX;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 3;
    // [arm length, branch at, branch length, branch angle, line width] per variant (share of the cell).
    const variants = [
      [0.4, [0.55, 0.78], 0.16, 0.9, 0.055],
      [0.38, [0.45], 0.2, 0.75, 0.065],
      [0.42, [0.35, 0.6, 0.82], 0.11, 1.0, 0.045],
      [0.34, [], 0, 0, 0.09],
    ] as const;
    variants.forEach(([arm, at, branch, angle, width], c) => {
      const r = CELL_PX * arm;
      ctx.save();
      ctx.translate(CELL_PX * (c + 0.5), CELL_PX / 2);
      ctx.lineWidth = CELL_PX * width;
      for (let k = 0; k < 6; k += 1) {
        ctx.save();
        ctx.rotate((k * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r);
        for (const t of at) {
          const b = CELL_PX * branch * (1 - t * 0.4);
          ctx.moveTo(0, -r * t);
          ctx.lineTo(Math.sin(angle) * b, -r * t - Math.cos(angle) * b);
          ctx.moveTo(0, -r * t);
          ctx.lineTo(-Math.sin(angle) * b, -r * t - Math.cos(angle) * b);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, CELL_PX * width * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Points with a per-flake size, spin and atlas cell. */
function flakeMaterial(atlas: THREE.Texture, size: number): THREE.PointsMaterial {
  const mat = new THREE.PointsMaterial({ size, map: atlas, transparent: true, depthWrite: false, opacity: 0.92 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aSize;\nattribute float aRot;\nattribute float aCell;\nvarying float vRot;\nvarying float vCell;",
      )
      .replace("gl_PointSize = size;", "gl_PointSize = size * aSize;\n\tvRot = aRot;\n\tvCell = aCell;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vRot;\nvarying float vCell;")
      .replace(
        "#include <map_particle_fragment>",
        `vec2 pc = gl_PointCoord - 0.5;
float cr = cos( vRot ), sr = sin( vRot );
pc = mat2( cr, -sr, sr, cr ) * pc + 0.5;
if ( pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0 ) discard;
diffuseColor *= texture2D( map, vec2( ( pc.x + vCell ) / ${ATLAS_CELLS.toFixed(1)}, 1.0 - pc.y ) );`,
      );
  };
  mat.customProgramCacheKey = () => "card-snow-flakes";
  return mat;
}

export function createCardSnow(opts: { count: number; size: number; z: number }): CardSnow {
  const { count, size, z } = opts;
  const pos = new Float32Array(count * 3);
  const aSize = new Float32Array(count);
  const aRot = new Float32Array(count);
  const aCell = new Float32Array(count);
  const fall = new Float32Array(count);
  const phase = new Float32Array(count);
  const spin = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = 0.5 + Math.random() * 1.6;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
    pos[i * 3 + 2] = z + Math.random() * 0.08;
    // Bigger flakes fall a touch faster, as in the reference.
    const s = Math.random();
    aSize[i] = 0.6 + s * 0.9;
    fall[i] = (0.14 + s * 0.2) * (0.85 + Math.random() * 0.3);
    aCell[i] = Math.floor(Math.random() * ATLAS_CELLS);
    aRot[i] = Math.random() * Math.PI * 2;
    spin[i] = (Math.random() - 0.5) * 0.8;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
  const rotAttr = new THREE.BufferAttribute(aRot, 1);
  geo.setAttribute("aRot", rotAttr);
  geo.setAttribute("aCell", new THREE.BufferAttribute(aCell, 1));
  const atlas = createFlakeAtlas();
  const mat = flakeMaterial(atlas, size);
  const points = new THREE.Points(geo, mat);
  const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;

  return {
    points,
    update(dt, elapsed, b, wind, motion) {
      const w = b.xMax - b.xMin;
      for (let i = 0; i < count; i += 1) {
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        y -= fall[i] * dt * motion - WIND_CARRY_Y * wind.y * dt;
        x += Math.sin(elapsed * 1.4 + phase[i]) * 0.05 * dt * motion + WIND_CARRY_X * wind.x * dt;
        if (y < b.yMin) {
          y = b.yMax;
          x = b.xMin + Math.random() * w;
        } else if (y > b.yMax) {
          y = b.yMin;
        }
        // Blown out one side, come back in on the other.
        if (x > b.xMax) x -= w;
        else if (x < b.xMin) x += w;
        posAttr.setXY(i, x, y);
        aRot[i] += spin[i] * dt * motion;
      }
      posAttr.needsUpdate = true;
      rotAttr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      atlas.dispose();
    },
  };
}
