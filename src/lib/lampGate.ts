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

const POINT_INFO = "getPointLightInfo( pointLight, geometryPosition, directLight );";

export function createLampGate(): LampGate {
  const lampView = { value: new THREE.Vector3(1e6, 1e6, 1e6) };
  const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
    POINT_INFO,
    `${POINT_INFO}\n\t\tif ( distance( pointLight.position, uLampView ) < 0.01 ) directLight.color *= lampMask;`,
  );
  // If three.js ever reshapes that loop, the replace finds nothing and the
  // lamp simply stays ungated: shading is never broken by this patch.

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
float lampMask = max( uLampFloor, clamp( max( metalnessFactor * 1.6, smoothstep( ${PAPER_ROUGH.toFixed(2)}, ${PAINT_ROUGH.toFixed(2)}, roughnessFactor ) ), 0.0, 1.0 ) );`,
          )
          .replace("#include <lights_fragment_begin>", lights);
      };
      material.customProgramCacheKey = () => `${prevKey()}|lamp-gate`;
      material.needsUpdate = true;
    },
    update(lamp, camera) {
      lamp.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      lampView.value.setFromMatrixPosition(lamp.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    },
  };
}
