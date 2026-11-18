import { wrappedOffset } from "./handLayout";

/** A slot this close to the front gets a real body (when one is free). */
export const BODY_ACQUIRE = 1.5;
/**
 * A body lets go of its slot only past this distance. The gap to
 * BODY_ACQUIRE keeps a card that sits right at the edge from flipping
 * between real and stand-in every frame.
 */
export const BODY_RELEASE = 1.6;

export interface AssignInput {
  /** The hand's position (fractional slot index of the front). */
  pos: number;
  slots: number;
  bodies: number;
  /** Body index -> the slot it is on, or null. */
  current: ReadonlyArray<number | null>;
  /** Which card a slot shows (a short hand repeats cards across two laps). */
  cardOf: (slot: number) => string;
}

/**
 * Which slots the real card bodies stand in for: the ones nearest the
 * front. A body keeps its slot until the slot is past BODY_RELEASE, so
 * only the body that has to move moves; freed bodies go to the nearest
 * slots without one. One card never gets two bodies.
 */
export function assignBodies({ pos, slots, bodies, current, cardOf }: AssignInput): Array<number | null> {
  const dist = (slot: number) => Math.abs(wrappedOffset(slot, pos, slots));
  const next = Array.from({ length: bodies }, (_, b) => {
    const slot = current[b] ?? null;
    return slot !== null && dist(slot) <= BODY_RELEASE ? slot : null;
  });
  const heldSlots = new Set(next.filter((s): s is number => s !== null));
  const heldCards = new Set([...heldSlots].map(cardOf));
  const wanted = Array.from({ length: slots }, (_, s) => s)
    .filter((s) => dist(s) < BODY_ACQUIRE && !heldSlots.has(s))
    .sort((a, b) => dist(a) - dist(b));
  for (const slot of wanted) {
    const free = next.indexOf(null);
    if (free < 0) break;
    if (heldCards.has(cardOf(slot))) continue;
    next[free] = slot;
    heldCards.add(cardOf(slot));
  }
  return next;
}
