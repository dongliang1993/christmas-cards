import * as THREE from "three";

/**
 * Keep the pointer lamp off bare paper. The lamp that follows the pointer is
 * meant to make the things on the card glint (painted motifs, stickers,
 * raised paper pieces, gold foil); lighting the plain sheet as well only
 * washes the card out. three.js lights every material alike, so this patches
 * the standard shader: when the lamp's light reaches a fragment, it is scaled
 * by how much that fragment is "a thing" rather than paper, read from the
 * material's own finish (smooth paint / metal = a thing; rough paper = not).
 *
 * The lamp is told apart from the other point lights by its view-space
 * position, which `update` hands the shader every frame.
 */
export interface LampGate {
  /** Gate a material. `floor` 1 = always fully lit by the lamp (a raised piece). */
  install(material: THREE.Material, floor?: number): void;
  /** Call once per frame before rendering. */
  update(lamp: THREE.Object3D, camera: THREE.Camera): void;
}

/** Rough paper sits at ~0.9, paint at ~0.34: the lamp fades in between. */
const PAPER_ROUGH = 0.86;
const PAINT_ROUGH = 0.5;

/**
 * How much of the lamp's diffuse light a lit thing keeps. The lamp is there
 * for the glint (its specular); its diffuse share only lifted the ink's darks
 * towards the paper and flattened the relief (measured: the darkest 5% of a
 * sticker rose 154 -> 177 under the lamp while its brightest barely moved).
 */
export const LAMP_DIFFUSE = 0.15;

/**
 * Ink is baked at roughness ~0.3-0.4: under GGX that is a broad, dim sheen.
 * Wet paint (the reference's pow(n.h, 220) glint) is far sharper, so ink's
 * roughness is scaled by this; paper (~0.9) is left as it is.
 */
export const INK_GLOSS = 0.45;

/**
 * The most the lamp may add to a pixel's specular. Above the bloom threshold a
 * glint turns into a wide haze; capped, it stays a crisp white spot.
 */
const LAMP_SPECULAR_MAX = 0.6;

const POINT_INFO = "getPointLightInfo( pointLight, geometryPosition, directLight );";
const RE_DIRECT = "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";

const UNROLL = "#pragma unroll_loop_start";

/** The point-light loop with the lamp gated and held to (mostly) specular. */
function gatedLights(): string {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const loop = chunk.indexOf("NUM_POINT_LIGHTS > 0");
  const unroll = chunk.indexOf(UNROLL, loop);
  const info = chunk.indexOf(POINT_INFO, unroll);
  const direct = chunk.indexOf(RE_DIRECT, info);
  // If three.js ever reshapes that loop, nothing matches and the lamp simply
  // stays ungated: shading is never broken by this patch.
  if (loop < 0 || unroll < 0 || info < 0 || direct < 0) return chunk;
  // Declared once before the loop: three unrolls it into repeated bodies
  // without braces, so a declaration inside would be redefined.
  const decl = `float lampDiffuseKeep;
	vec3 lampDiffuseBefore;
	vec3 lampSpecularBefore;
	${UNROLL}`;
  const gate = `${POINT_INFO}
		lampDiffuseKeep = 1.0;
		if ( distance( pointLight.position, uLampView ) < 0.01 ) {
			directLight.color *= lampMask;
			lampDiffuseKeep = ${LAMP_DIFFUSE.toFixed(2)};
		}
		lampDiffuseBefore = reflectedLight.directDiffuse;
		lampSpecularBefore = reflectedLight.directSpecular;`;
  // The lamp: most of its diffuse rolled back, its specular capped below bloom.
  const roll = `${RE_DIRECT}
		if ( lampDiffuseKeep < 1.0 ) {
			reflectedLight.directDiffuse = mix( lampDiffuseBefore, reflectedLight.directDiffuse, lampDiffuseKeep );
			reflectedLight.directSpecular = lampSpecularBefore + min( reflectedLight.directSpecular - lampSpecularBefore, vec3( ${LAMP_SPECULAR_MAX.toFixed(2)} ) );
		}`;
  return (
    chunk.slice(0, unroll) +
    decl +
    chunk.slice(unroll + UNROLL.length, info) +
    gate +
    chunk.slice(info + POINT_INFO.length, direct) +
    roll +
    chunk.slice(direct + RE_DIRECT.length)
  );
}

export function createLampGate(): LampGate {
  const lampView = { value: new THREE.Vector3(1e6, 1e6, 1e6) };
  const lights = gatedLights();

  return {
    install(material, floor = 0) {
      const prev = material.onBeforeCompile;
      const prevKey = material.customProgramCacheKey.bind(material);
      const lampFloor = { value: floor };
      material.onBeforeCompile = (shader, renderer) => {
        prev.call(material, shader, renderer);
        shader.uniforms.uLampView = lampView;
        shader.uniforms.uLampFloor = lampFloor;
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 uLampView;\nuniform float uLampFloor;")
          .replace(
            "#include <metalnessmap_fragment>",
            `#include <metalnessmap_fragment>
float lampMask = max( uLampFloor, clamp( max( metalnessFactor * 1.6, smoothstep( ${PAPER_ROUGH.toFixed(2)}, ${PAINT_ROUGH.toFixed(2)}, roughnessFactor ) ), 0.0, 1.0 ) );
roughnessFactor = mix( roughnessFactor * ${INK_GLOSS.toFixed(2)}, roughnessFactor, smoothstep( ${PAINT_ROUGH.toFixed(2)}, ${PAPER_ROUGH.toFixed(2)}, roughnessFactor ) );`,
          )
          .replace("#include <lights_fragment_begin>", lights);
      };
      material.customProgramCacheKey = () => `${prevKey()}|lamp-gate-spec-gloss`;
      material.needsUpdate = true;
    },
    update(lamp, camera) {
      lamp.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      lampView.value.setFromMatrixPosition(lamp.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    },
  };
}
