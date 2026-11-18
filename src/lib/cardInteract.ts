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
  // Cover geometry is centred: local x runs -CARD_W/2 (spine) .. CARD_W/2 (free edge).
  return { x: local.x, y: local.y };
}

/** true when the press lands in the free-edge zone that starts a drag-open. */
export function isGrabEdge(local: { x: number; y: number }, cardW: number): boolean {
  const half = cardW / 2;
  const edgeW = cardW * GRAB_EDGE;
  return local.x > half - edgeW && local.x <= half && Math.abs(local.y) <= CARD_H * 0.5;
}

/** Decide what a tap (press under the move threshold) should do. */
export function resolveTap(
  local: { x: number; y: number } | null,
  cardW: number,
): "toggle" | "none" {
  if (!local) return "none";
  if (Math.abs(local.x) <= cardW / 2 && Math.abs(local.y) <= CARD_H * 0.5) {
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

/** Fling speed (px/s) that decides a release on its own, either way. */
const FLING = 600;

/** Snap decision after a drag-release: spring fully open or fully shut. */
export function resolveRelease(
  dragProgress: number,
  velocityX: number,
): boolean {
  if (velocityX < -FLING) return true;
  if (velocityX > FLING) return false;
  return dragProgress > 0.5;
}

/** Velocity-fed spring impulse for lifted meshes (#8 inertia coupling). */
export function springImpulse(vx: number, lastVx: number): number {
  const delta = Math.abs(vx) - Math.abs(lastVx);
  return THREE.MathUtils.clamp(delta / 4000, 0, 0.5);
}

/* ── View orbit: a click opens the card, press-and-drag turns it to look at. ── */

/** Most a drag may move (px) and still count as a click. */
const TAP_MOVE_PX = 7;
/** Longest press (ms) that still counts as a click. */
const TAP_MAX_MS = 600;

export function isTapGesture(movedPx: number, heldMs: number): boolean {
  return movedPx < TAP_MOVE_PX && heldMs < TAP_MAX_MS;
}

export interface Orbit {
  /** pitch (rad) */
  x: number;
  /** yaw (rad) */
  y: number;
}

/** How far the view may turn: yaw shows the card's edge, pitch its top/bottom. */
export const ORBIT_LIMIT = { yaw: 1.15, pitch: 0.6 } as const;
/** Radians per dragged pixel. */
const ORBIT_PER_PX = { yaw: 0.0065, pitch: 0.005 } as const;
/** Fling slow-down rate (1/s). */
const COAST_DAMPING = 5;

const clampYaw = (v: number) => Math.min(ORBIT_LIMIT.yaw, Math.max(-ORBIT_LIMIT.yaw, v));
const clampPitch = (v: number) => Math.min(ORBIT_LIMIT.pitch, Math.max(-ORBIT_LIMIT.pitch, v));

/** Orbit after dragging (dx, dy) px from the press point, starting at `base`. */
export function orbitFromDrag(base: Orbit, dx: number, dy: number): Orbit {
  return {
    x: clampPitch(base.x + dy * ORBIT_PER_PX.pitch),
    y: clampYaw(base.y + dx * ORBIT_PER_PX.yaw),
  };
}

/** One frame of release inertia: drift with the fling (px/s), slowing, stopping at the limits. */
export function coastOrbit(
  rot: Orbit,
  vel: { vx: number; vy: number },
  dt: number,
): { rot: Orbit; vel: { vx: number; vy: number } } {
  const next = orbitFromDrag(rot, vel.vx * dt, vel.vy * dt);
  const decay = Math.exp(-COAST_DAMPING * dt);
  const stuckX = Math.abs(next.y) >= ORBIT_LIMIT.yaw && Math.sign(vel.vx) === Math.sign(next.y);
  const stuckY = Math.abs(next.x) >= ORBIT_LIMIT.pitch && Math.sign(vel.vy) === Math.sign(next.x);
  return {
    rot: next,
    vel: { vx: stuckX ? 0 : vel.vx * decay, vy: stuckY ? 0 : vel.vy * decay },
  };
}

