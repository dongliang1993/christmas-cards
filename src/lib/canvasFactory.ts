/**
 * Canvas creation that works in both baking environments: the DOM on the main
 * thread, OffscreenCanvas inside the bake worker (no `document` there).
 */
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function createCanvas(w: number, h: number): CanvasLike {
  if (typeof document === "undefined") return new OffscreenCanvas(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
