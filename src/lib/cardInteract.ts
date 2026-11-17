import * as THREE from "three";
import { GRAB_EDGE, OPEN_MAX } from "./cardBend";
import { CARD_H } from "./cardConstants";

export type DragMode = "none" | "tilt" | "open";

export interface PointerState {
  down: boolean;
  over: boolean;
  mode: DragMode;
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  vx: number;
  lastX: number;
  lastT: number;
  totalMoved: number;
}

export function createPointerState(): PointerState {
  return {
    down: false,
    over: false,
    mode: "none",
    x0: 0,
    y0: 0,
    x: 0,
    y: 0,
    t0: 0,
    vx: 0,
    lastX: 0,
    lastT: 0,
    totalMoved: 0,
  };
}

/** Map a DOM pointer event to card-local coordinates via raycast against the cover. */
export function pointerToCardLocal(
  event: PointerEvent,
  container: HTMLElement,
  camera: THREE.PerspectiveCamera,
  coverMesh: THREE.Object3D,
): { x: number; y: number } | null {
  const rect = container.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(2 * ((event.clientY - rect.top) / rect.height)) + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hits = raycaster.intersectObject(coverMesh, true);
  const hit = hits.find((h) => h.face);
  if (!hit) return null;

  const local = coverMesh.worldToLocal(hit.point.clone());
  // Cover geometry local x runs 0..CARD_W from the spine; y is centered.
  return { x: local.x, y: local.y };
}

/** true when the press lands in the free-edge zone that starts a drag-open. */
export function isGrabEdge(local: { x: number; y: number }, cardW: number): boolean {
  const edgeW = cardW * GRAB_EDGE;
  return local.x > cardW - edgeW && local.x <= cardW && Math.abs(local.y) <= CARD_H * 0.5;
}

/** Decide what a tap (press under the move threshold) should do. */
export function resolveTap(
  local: { x: number; y: number } | null,
  cardW: number,
): "toggle" | "none" {
  if (!local) return "none";
  if (local.x >= 0 && local.x <= cardW && Math.abs(local.y) <= CARD_H * 0.5) {
    return "toggle";
  }
  return "none";
}

/** Cover angle for a given open progress 0..1 (ease-in-out towards OPEN_MAX). */
export function openAngleFor(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const eased = t * t * (3 - 2 * t);
  return eased * OPEN_MAX;
}

/** Snap decision after a drag-release: spring fully open or fully shut. */
export function resolveRelease(
  dragProgress: number,
  velocityX: number,
): boolean {
  const flung = velocityX < -600;
  return flung || dragProgress > 0.5;
}

/** Velocity-fed spring impulse for lifted meshes (#8 inertia coupling). */
export function springImpulse(vx: number, lastVx: number): number {
  const delta = Math.abs(vx) - Math.abs(lastVx);
  return THREE.MathUtils.clamp(delta / 4000, 0, 0.5);
}
