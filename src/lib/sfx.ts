/**
 * Card sound effects: slices of a paper-friction recording
 * (public/uploads/纸张摩擦.mp3), cut where its silences fall.
 *
 * Playback is fire-and-forget: browsers only allow audio after a user
 * gesture, and both triggers (tap-to-open, gallery switch) are gestures.
 */

const SFX_DIR = "/assets/sfx";

/** [start, seconds] of each cut in the source recording. */
export const SWIPE_FILES = {
  /** A short paper rub: brisk, boosted, no dragging tail. */
  open: `${SFX_DIR}/rub-a.m4a`,
  /** Slightly shorter rub for switching cards. */
  switch: `${SFX_DIR}/rub-b.m4a`,
} as const;

export type SwipeName = keyof typeof SWIPE_FILES;

const VOLUMES: Record<SwipeName, number> = {
  open: 0.9,
  switch: 0.85,
};

const audioCache = new Map<string, HTMLAudioElement>();

function elementFor(src: string): HTMLAudioElement {
  let el = audioCache.get(src);
  if (!el) {
    el = new Audio(src);
    el.preload = "auto";
    audioCache.set(src, el);
  }
  return el;
}

/** Play a paper swipe. Never throws: no audio hardware, just skip it. */
export function playSwipe(name: SwipeName): void {
  try {
    const el = elementFor(SWIPE_FILES[name]);
    el.volume = VOLUMES[name];
    el.currentTime = 0;
    el.play().catch(() => undefined);
  } catch {
    // No audio support: the card works fine silent.
  }
}
