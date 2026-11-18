import * as THREE from "three";

/** Candle glow sprite size relative to the template spec, and its HDR gain. */
export const GLOW_SIZE = 0.5;
export const GLOW_HDR = 4.2;

/** Shared radial glow sprite: the real card's candle and the hand's stand-ins. */
export function createGlowSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
    grad.addColorStop(0, "rgba(255, 245, 200, 0.95)");
    grad.addColorStop(0.28, "rgba(255, 208, 110, 0.55)");
    grad.addColorStop(0.62, "rgba(255, 180, 75, 0.16)");
    grad.addColorStop(1, "rgba(255, 180, 75, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
