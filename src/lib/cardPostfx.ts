import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** Luminance-gated film grain, ported from bubbbly's grain pass:
 * lifts mid-tones only, keeps lights & darks clean, like paper stock. */
const grainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAmount: { value: 0.03 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      float n = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5;
      c.rgb += n * uAmount * smoothstep(0.02, 0.3, l) * (1.0 - smoothstep(0.85, 1.0, l));
      gl_FragColor = c;
    }
  `,
};

export interface PostfxStack {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grain: ShaderPass;
  setSize(width: number, height: number): void;
  render(deltaTime: number): void;
  dispose(): void;
}

/**
 * Output chain: scene -> bloom (lights/stars bloom when bright) -> film grain
 * (mid-tones only, bubbbly's paper feel) -> output pass (tone mapping).
 */
export function createPostfxStack(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): PostfxStack {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    0.6, // strength
    0.3, // radius
    // threshold sits above the studio backdrop (linear lum ~2.2) and lit
    // paper, so only HDR emitters — the candle core — bloom.
    2.4,
  );
  composer.addPass(bloom);

  const grain = new ShaderPass(grainShader);
  composer.addPass(grain);

  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    grain,
    setSize(width: number, height: number) {
      // composer.setSize forwards to every pass, bloom included.
      composer.setSize(width, height);
    },
    render(deltaTime: number) {
      const u = grain.uniforms.uTime as { value: number };
      u.value += Math.max(deltaTime, 0);
      composer.render(deltaTime);
    },
    dispose() {
      composer.dispose();
    },
  };
}
