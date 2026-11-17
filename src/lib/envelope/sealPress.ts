/** Hold the stamp this long to commit the seal (spec §4.5). */
export const SEAL_HOLD_MS = 1000;
export const SPREAD_MS = 650;
export const COOL_MS = 1100;
export const BREAK_MS = 700;

export type SealStage = "idle" | "pressing" | "spreading" | "cooling" | "sealed" | "breaking" | "broken";

export interface SealState {
  stage: SealStage;
  /** ms spent in the current stage (held time while pressing). */
  t: number;
}

export type SealEvent = { type: "press" } | { type: "release" } | { type: "break" } | { type: "tick"; dt: number };

export function initialSeal(stage: "idle" | "sealed"): SealState {
  return { stage, t: 0 };
}

const at = (stage: SealStage): SealState => ({ stage, t: 0 });

/**
 * Press-and-hold wax seal: letting go before SEAL_HOLD_MS cancels; once the
 * wax starts to spread the seal is committed. Reduced motion skips straight
 * to the end of each animation.
 */
export function sealPressStep(state: SealState, event: SealEvent, reducedMotion = false): SealState {
  switch (event.type) {
    case "press":
      return state.stage === "idle" ? at("pressing") : state;
    case "release":
      return state.stage === "pressing" ? at("idle") : state;
    case "break":
      if (state.stage !== "sealed") return state;
      return reducedMotion ? at("broken") : at("breaking");
    case "tick": {
      const t = state.t + event.dt;
      switch (state.stage) {
        case "pressing":
          if (t < SEAL_HOLD_MS) return { stage: "pressing", t };
          return reducedMotion ? at("sealed") : at("spreading");
        case "spreading":
          return t < SPREAD_MS ? { stage: "spreading", t } : at("cooling");
        case "cooling":
          return t < COOL_MS ? { stage: "cooling", t } : at("sealed");
        case "breaking":
          return t < BREAK_MS ? { stage: "breaking", t } : at("broken");
        default:
          return state;
      }
    }
  }
}

export interface SealVisual {
  /** 0..1 while holding: drives the progress ring. */
  press: number;
  /** 0..1 how far the wax has spread (1 once sealed). */
  spread: number;
  /** 0 hot and glossy → 1 set. */
  cool: number;
  /** 0..1 how far the broken halves have fallen away. */
  crack: number;
}

export function sealVisual(s: SealState): SealVisual {
  const done = { press: 1, spread: 1, cool: 1, crack: 0 };
  switch (s.stage) {
    case "idle":
      return { press: 0, spread: 0, cool: 0, crack: 0 };
    case "pressing":
      return { press: Math.min(1, s.t / SEAL_HOLD_MS), spread: 0, cool: 0, crack: 0 };
    case "spreading":
      return { press: 1, spread: s.t / SPREAD_MS, cool: 0, crack: 0 };
    case "cooling":
      return { press: 1, spread: 1, cool: s.t / COOL_MS, crack: 0 };
    case "sealed":
      return done;
    case "breaking":
      return { ...done, crack: s.t / BREAK_MS };
    case "broken":
      return { ...done, crack: 1 };
  }
}
