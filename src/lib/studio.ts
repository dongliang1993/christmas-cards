import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

/**
 * The bright paper studio both the card and the envelope are shot in (spec
 * §7 共用摄影棚): one renderer setup and one set of lights, so the envelope
 * reads as the same world as the card.
 */

/** Studio softbox placement & strength; the card's pointer slides it about. */
export const SOFTBOX_POS = new THREE.Vector3(-2.6, 2.4, 3.4);
export const SOFTBOX_INTENSITY = 2.2;

export function createStudioRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Neutral keeps paper whites white and pigments true (ACES greys them).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

/**
 * Environment map: metal, foil and glossy wax need something to reflect,
 * otherwise they render dead black. Kept dim: reflection content, not light.
 */
export function addStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): { dispose(): void } {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.25;
  return {
    dispose() {
      envRT.dispose();
      pmrem.dispose();
    },
  };
}

export interface StudioLights {
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  keyTarget: THREE.Object3D;
  softbox: THREE.RectAreaLight;
  rim: THREE.DirectionalLight;
}

export function addStudioLights(scene: THREE.Scene, opts: { shadowMapSize?: number } = {}): StudioLights {
  const ambient = new THREE.AmbientLight(0xfff9f8, 1.3);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xfffaf6, 0xe0d2cc, 0.45);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff8f0, 1.45);
  key.position.set(6.8, 4.8, 3.2);
  key.castShadow = true;
  const size = opts.shadowMapSize ?? 1024;
  key.shadow.mapSize.set(size, size);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const keyTarget = new THREE.Object3D();
  scene.add(keyTarget);
  key.target = keyTarget;

  // Upper-left softbox: broad, so relief catches a smooth, continuous sheen.
  RectAreaLightUniformsLib.init();
  const softbox = new THREE.RectAreaLight(0xfffbf8, SOFTBOX_INTENSITY, 3.2, 2.4);
  softbox.position.copy(SOFTBOX_POS);
  softbox.lookAt(0, 0, 0);
  scene.add(softbox);

  const rim = new THREE.DirectionalLight(0xdce8ff, 0.65);
  rim.position.set(-5.5, -2.0, 2.8);
  scene.add(rim);

  return { ambient, hemi, key, keyTarget, softbox, rim };
}

/** The card's studio shadow plane is the card footprint padded by this much. */
export const CARD_SHADOW_PAD_X = 1.5;
export const CARD_SHADOW_PAD_Y = 1.35;
/** Where the shadow sits relative to the closed card: a finger's width off the sweep. */
export const CARD_SHADOW_OFFSET = { x: 0.06, y: -0.1, z: -0.12 } as const;

/** Card-shaped studio shadow: a tight contact core plus a wide soft falloff. */
export function createCardShadowTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const rw = size / CARD_SHADOW_PAD_X;
    const rh = size / CARD_SHADOW_PAD_Y;
    const rx = (size - rw) / 2;
    const ry = (size - rh) / 2;
    ctx.fillStyle = "rgba(48, 36, 28, 1)";
    ctx.filter = "blur(34px)";
    ctx.globalAlpha = 0.3;
    ctx.fillRect(rx + 6, ry + 14, rw, rh);
    ctx.filter = "blur(9px)";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(rx + 3, ry + 5, rw - 2, rh - 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
