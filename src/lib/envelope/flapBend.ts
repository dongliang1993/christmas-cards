/**
 * The envelope's top flap as a strip of paper bending as it folds (spec §6):
 * flat when open (pointing up) and when shut (lying over the pocket), most
 * bent half-way, its root leading and its free end trailing. Coordinates are
 * relative to the hinge: y up the envelope, z toward the camera.
 */

/** How far the shut flap lies in front of the hinge: clear of the flaps below it. */
export const FLAP_SHUT_LIFT = 0.072;
/** Total turn across the strip half-way through the fold (radians). */
const BEND = 1.2;

export interface FlapPoint {
  y: number;
  z: number;
}

/** Row positions from the hinge (index 0) to the tip (index rows), length preserved. */
export function flapProfile(fold: number, rows: number, length: number): FlapPoint[] {
  const f = Math.min(1, Math.max(0, fold));
  const bend = BEND * Math.sin(Math.PI * f);
  const lift = FLAP_SHUT_LIFT * (1 - (1 - f) ** 3);
  const ds = length / rows;
  // The whole strip rides forward over the paper below, hinge included.
  const points: FlapPoint[] = [{ y: 0, z: lift }];
  let y = 0;
  let z = 0;
  for (let k = 0; k < rows; k += 1) {
    const s = (k + 0.5) / rows;
    const phi = Math.min(Math.PI, Math.max(0, Math.PI * f + bend * (0.5 - s)));
    y += Math.cos(phi) * ds;
    z += Math.sin(phi) * ds;
    points.push({ y, z: z + lift });
  }
  return points;
}
