import * as THREE from "three";

/** Max cover opening angle (radians), matching bubbbly's ~169deg settle. */
export const OPEN_MAX = Math.PI * 0.94;
/** Fraction of the cover width (from the free edge) that starts a drag-open. */
export const GRAB_EDGE = 0.26;
/** Peak bow angle (radians at the free edge) at mid-turn. */
export const BOW_AMP = 0.52;

/** Angle of the bow arc at distance x along a panel of given width. */
export function bowTheta(x: number, width: number, bend: number): number {
  return (bend / width) * x;
}

/** Arc-length-preserving x position of a point at distance x (bubbbly bow()). */
export function bowX(x: number, width: number, bend: number): number {
  if (Math.abs(bend) < 1e-4) return x;
  const k = bend / width;
  return Math.sin(k * x) / k;
}

/** Out-of-plane z displacement of a point at distance x (bubbbly bow()). */
export function bowZ(x: number, width: number, bend: number): number {
  if (Math.abs(bend) < 1e-4) return 0;
  const k = bend / width;
  return (1 - Math.cos(k * x)) / k;
}

export interface BendBuffers {
  basePositions: Float32Array;
  baseNormals: Float32Array;
}

/** Snapshot pristine positions/normals of a posed geometry for later bowing. */
export function captureBendBuffers(geo: THREE.BufferGeometry): BendBuffers {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  pos.setUsage(THREE.DynamicDrawUsage);
  nor.setUsage(THREE.DynamicDrawUsage);
  return {
    basePositions: new Float32Array(pos.array as Float32Array),
    baseNormals: new Float32Array(nor.array as Float32Array),
  };
}

/**
 * Bends a panel geometry whose local x runs -width/2..width/2 (BoxGeometry
 * default; the panel's spine side is at -width/2), porting bubbbly's GLSL
 * bow() to the CPU:
 *   th = bend * (x + width/2) / width
 *   x' = sin(th)/k - sin(th)*z;  z' = (1-cos(th))/k + cos(th)*z
 * Normals rotate by th around the local y axis. bend ~ 0 restores the base pose.
 */
export function applyBow(
  geo: THREE.BufferGeometry,
  width: number,
  bend: number,
  buffers: BendBuffers,
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const pa = pos.array as Float32Array;
  const na = nor.array as Float32Array;
  const { basePositions, baseNormals } = buffers;

  if (Math.abs(bend) < 5e-4) {
    let dirty = false;
    for (let i = 0; i < pa.length; i += 1) {
      if (pa[i] !== basePositions[i]) {
        pa[i] = basePositions[i];
        dirty = true;
      }
      na[i] = baseNormals[i];
    }
    if (dirty) {
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      geo.computeBoundingSphere();
    }
    return;
  }

  const k = bend / width;
  const half = width / 2;
  const count = pa.length / 3;
  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const x0 = basePositions[i3];
    const y0 = basePositions[i3 + 1];
    const z0 = basePositions[i3 + 2];
    const th = k * (x0 + half);
    const s = Math.sin(th);
    const c = Math.cos(th);
    pa[i3] = s / k - s * z0 - half;
    pa[i3 + 1] = y0;
    pa[i3 + 2] = (1 - c) / k + c * z0;

    const nx = baseNormals[i3];
    const ny = baseNormals[i3 + 1];
    const nz = baseNormals[i3 + 2];
    na[i3] = nx * c - nz * s;
    na[i3 + 1] = ny;
    na[i3 + 2] = nx * s + nz * c;
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingSphere();
}
