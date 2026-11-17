export interface Point {
  x: number;
  y: number;
}

export interface GestureDelta {
  /** Multiply the starting scale by this. */
  scale: number;
  /** Add to the starting rotation (radians, clockwise on screen). */
  rotation: number;
  /** Screen-space move of the gesture's centre, px. */
  dx: number;
  dy: number;
}

const IDENTITY: GestureDelta = { scale: 1, rotation: 0, dx: 0, dy: 0 };

function angleOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Two-finger pinch: scale from spread, rotation from swing, move from midpoint. */
export function pinchTransform(start: { a: Point; b: Point }, now: { a: Point; b: Point }): GestureDelta {
  const d0 = Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y);
  if (d0 < 1) return IDENTITY;
  const d1 = Math.hypot(now.b.x - now.a.x, now.b.y - now.a.y);
  return {
    scale: d1 / d0,
    rotation: wrap(angleOf(now.a, now.b) - angleOf(start.a, start.b)),
    dx: (now.a.x + now.b.x) / 2 - (start.a.x + start.b.x) / 2,
    dy: (now.a.y + now.b.y) / 2 - (start.a.y + start.b.y) / 2,
  };
}

/** Corner handle dragged around the element's centre: scale and turn together. */
export function handleTransform(centre: Point, from: Point, to: Point): GestureDelta {
  const r0 = Math.hypot(from.x - centre.x, from.y - centre.y);
  if (r0 < 1) return IDENTITY;
  return {
    scale: Math.hypot(to.x - centre.x, to.y - centre.y) / r0,
    rotation: wrap(angleOf(centre, to) - angleOf(centre, from)),
    dx: 0,
    dy: 0,
  };
}
