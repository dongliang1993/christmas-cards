/**
 * Card sound effects.
 *
 *   open / close - the cover's hinge, rendered by scripts/sfx/paper_card.py
 *                  from the same spring as the 3D cover (variant "b-textured").
 *                  Cued by the render loop on the frame the hinge starts
 *                  moving (lib/hingeCue), so sound and swing start together.
 *   switch       - a short paper rub when another card comes to the front.
 *
 * Played through Web Audio from buffers decoded up front: an <audio>
 * element starts 50-200 ms late on phones, which is the whole swing's
 * first half. Browsers keep the context suspended until a user gesture,
 * so the first pointer/key press resumes it; every cue follows a gesture.
 */

const SFX_DIR = "/assets/sfx";

export const SFX_FILES = {
  open: `${SFX_DIR}/card-open.m4a`,
  close: `${SFX_DIR}/card-close.m4a`,
  switch: `${SFX_DIR}/rub-b.m4a`,
} as const;

export type SfxName = keyof typeof SFX_FILES;

const VOLUMES: Record<SfxName, number> = {
  open: 0.9,
  close: 0.9,
  switch: 0.85,
};

let ctx: AudioContext | null = null;
const buffers = new Map<SfxName, Promise<AudioBuffer | null>>();
/** Decoded and ready to start this instant. */
const ready = new Map<SfxName, AudioBuffer>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = typeof window === "undefined" ? undefined : window.AudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null; // No audio hardware: the card works fine silent.
  }
  return ctx;
}

function bufferFor(name: SfxName): Promise<AudioBuffer | null> {
  const hit = buffers.get(name);
  if (hit) return hit;
  const ac = context();
  const p: Promise<AudioBuffer | null> = !ac
    ? Promise.resolve(null)
    : fetch(SFX_FILES[name])
        .then((res) => {
          if (!res.ok) throw new Error(`音效加载失败 ${name} (${res.status})`);
          return res.arrayBuffer();
        })
        .then((data) => ac.decodeAudioData(data))
        .then((buffer) => {
          ready.set(name, buffer);
          return buffer;
        })
        .catch(() => {
          buffers.delete(name); // let a later cue retry
          return null;
        });
  buffers.set(name, p);
  return p;
}

/** Decode every sound now, so a cue never waits on the network. */
export function preloadSfx(): void {
  for (const name of Object.keys(SFX_FILES) as SfxName[]) void bufferFor(name);
}

/** Play a sound. Never throws; a sound that isn't decoded yet is skipped, not played late. */
export function playSfx(name: SfxName): void {
  const ac = context();
  const buffer = ready.get(name);
  if (!ac || ac.state === "closed") return;
  if (!buffer) {
    void bufferFor(name);
    return;
  }
  try {
    const source = ac.createBufferSource();
    const gain = ac.createGain();
    gain.gain.value = VOLUMES[name];
    source.buffer = buffer;
    source.connect(gain).connect(ac.destination);
    source.start();
  } catch {
    // Audio graph refused (rare, e.g. a torn-down context): stay silent.
  }
}

/** Kept for the card-switch call sites. */
export function playSwipe(name: "switch"): void {
  playSfx(name);
}

function unlock(): void {
  const ac = context();
  if (ac && ac.state === "suspended") void ac.resume().catch(() => undefined);
}

if (typeof window !== "undefined") {
  // Capture phase: resume before the click handler that cues the sound runs.
  for (const type of ["pointerdown", "keydown", "touchend"] as const) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}
