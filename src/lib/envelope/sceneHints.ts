import type { SealStage } from "./sealPress";

export type EnvelopeMode = "seal" | "transit" | "open";

interface HintState {
  mode: EnvelopeMode;
  stage: SealStage;
  /** The sequence has reached the moment the seal can be touched. */
  ready: boolean;
  /** e.g. "12月24日"; the envelope itself carries no postmark any more. */
  deliverLabel: string | null;
}

/** The one line of help under the envelope, or null for none. */
export function envelopeHint({ mode, stage, ready, deliverLabel }: HintState): string | null {
  if (mode === "transit") return deliverLabel ? `这封信还在路上，${deliverLabel}送达` : "这封信还在路上";
  if (!ready) return null;
  if (mode === "seal") return stage === "idle" ? "按住火漆处 1 秒，盖上印章" : null;
  return stage === "sealed" ? "点一下火漆，拆开这封信" : null;
}
