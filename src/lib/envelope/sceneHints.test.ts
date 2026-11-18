import { describe, expect, it } from "vitest";
import { envelopeHint } from "./sceneHints";

describe("envelopeHint", () => {
  it("in transit, says when it arrives (the envelope no longer carries a postmark)", () => {
    expect(envelopeHint({ mode: "transit", stage: "sealed", ready: true, deliverLabel: "12月24日" })).toBe("这封信还在路上，12月24日送达");
    expect(envelopeHint({ mode: "transit", stage: "sealed", ready: true, deliverLabel: null })).toBe("这封信还在路上");
  });

  it("sealing: asks for the press only once the flap is shut and nothing is pressed yet", () => {
    expect(envelopeHint({ mode: "seal", stage: "idle", ready: true, deliverLabel: null })).toBe("按住火漆处 1 秒，盖上印章");
    expect(envelopeHint({ mode: "seal", stage: "idle", ready: false, deliverLabel: null })).toBeNull();
    expect(envelopeHint({ mode: "seal", stage: "cooling", ready: true, deliverLabel: null })).toBeNull();
  });

  it("opening: invites a tap on the seal while it is whole", () => {
    expect(envelopeHint({ mode: "open", stage: "sealed", ready: true, deliverLabel: null })).toBe("点一下火漆，拆开这封信");
    expect(envelopeHint({ mode: "open", stage: "breaking", ready: true, deliverLabel: null })).toBeNull();
  });
});
