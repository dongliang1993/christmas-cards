import * as THREE from "three";
import { MAX_MOVERS, type LiveRuntime, type MoverUniforms } from "./movers";

/**
 * Bends the cover's texture lookups so named patches of the painting turn
 * about their pivots (the skill's "movers"). Every map on the cover (colour,
 * impasto normals, foil) reads through the same warped UV, so the strokes and
 * the foil move with the paint. Each patch moves fully in its middle and eases
 * out toward its edge, so nothing tears.
 */
export interface MoverShaderHandle {
  /** Replace the patches (a different card). */
  setMovers(u: MoverUniforms): void;
  /** Copy this frame's angles and squashes into the shader. */
  writePose(rt: LiveRuntime): void;
}

const GLSL = /* glsl */ `
#define GC_MAX ${MAX_MOVERS}
uniform int uMvCount;
uniform vec2 uCoverPx;
uniform vec4 uMvPivot[GC_MAX];
uniform vec4 uMvGeo[GC_MAX];
uniform vec4 uMvPose[GC_MAX];

vec2 gcWarp(vec2 uv) {
  vec2 p = vec2(uv.x, 1.0 - uv.y) * uCoverPx;
  for (int i = 0; i < GC_MAX; i++) {
    if (i >= uMvCount) break;
    vec4 pv = uMvPivot[i];
    vec4 g = uMvGeo[i];
    vec4 pose = uMvPose[i];
    float d;
    if (pv.w < 0.5) {
      d = length((p - g.xy) / g.zw);
    } else {
      vec2 ab = g.xy - pv.xy;
      float h = clamp(dot(p - pv.xy, ab) / dot(ab, ab), 0.0, 1.0);
      d = length(p - pv.xy - ab * h) / g.z;
    }
    float w = 1.0 - smoothstep(1.0 - pv.z, 1.0, d);
    if (w <= 0.0) continue;
    // Inverse map: where did the paint now at p come from?
    float s = mix(1.0, pose.y, w);
    vec2 q = p - pv.xy;
    q = vec2(q.x * sqrt(s), q.y / s);
    float a = -pose.x * w;
    float c = cos(a);
    float sn = sin(a);
    p = pv.xy + vec2(c * q.x - sn * q.y, sn * q.x + c * q.y);
  }
  return vec2(p.x / uCoverPx.x, 1.0 - p.y / uCoverPx.y);
}
`;

const MAIN_PATCH = /* glsl */ `void main() {
#ifdef USE_MAP
  vec2 gcUv = gcWarp(vMapUv);
  #define vMapUv gcUv
  #define vNormalMapUv gcUv
  #define vMetalnessMapUv gcUv
  #define vRoughnessMapUv gcUv
#endif
`;

const vec4s = () => Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4());

export function installMoverShader(
  material: THREE.MeshStandardMaterial,
  coverW: number,
  coverH: number,
): MoverShaderHandle {
  const uniforms = {
    uMvCount: { value: 0 },
    uCoverPx: { value: new THREE.Vector2(coverW, coverH) },
    uMvPivot: { value: vec4s() },
    uMvGeo: { value: vec4s() },
    uMvPose: { value: vec4s() },
  };
  let names: string[] = [];

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GLSL}`)
      .replace("void main() {", MAIN_PATCH);
  };
  material.customProgramCacheKey = () => "card-cover-movers";
  material.needsUpdate = true;

  const fill = (target: THREE.Vector4[], flat: number[]) =>
    target.forEach((v, i) => v.fromArray(flat, i * 4));

  return {
    setMovers(u) {
      uniforms.uMvCount.value = u.count;
      fill(uniforms.uMvPivot.value, u.pivot);
      fill(uniforms.uMvGeo.value, u.geo);
      fill(uniforms.uMvPose.value, u.pose);
      names = [];
    },
    writePose(rt) {
      if (names.length === 0) names = Object.keys(rt.movers).slice(0, MAX_MOVERS);
      names.forEach((name, i) => {
        const s = rt.movers[name];
        uniforms.uMvPose.value[i].set((s.angle * Math.PI) / 180, s.scaleY, 0, 0);
      });
    },
  };
}
