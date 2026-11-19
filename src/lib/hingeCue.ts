/**
 * When to play the card's open / close sound.
 *
 * The sounds (scripts/sfx/paper_card.py) are rendered from the same hinge
 * spring as the 3D cover, so they only line up if they start on the frame
 * the hinge starts moving. That frame is not the click: the cover waits
 * until the card's inside is ready. The render loop asks this each frame
 * with the hinge's effective target.
 */

export type HingeCue = "open" | "close";

export interface HingeFrame {
  /** Effective hinge target last frame (0 shut, 1 open). */
  prevTarget: number;
  /** Effective hinge target this frame. */
  target: number;
  /** Where the cover is now (0 shut, 1 open). */
  progress: number;
}

/** A cover already within this of where it's going makes no audible swing. */
const SILENT_SWING = 0.1;

export function hingeCue({ prevTarget, target, progress }: HingeFrame): HingeCue | null {
  const wasOpen = prevTarget > 0.5;
  const opens = target > 0.5;
  if (wasOpen === opens) return null;
  if (opens) return progress < 1 - SILENT_SWING ? "open" : null;
  return progress > SILENT_SWING ? "close" : null;
}
