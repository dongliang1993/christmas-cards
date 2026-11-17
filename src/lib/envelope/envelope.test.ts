import { describe, expect, it } from "vitest";
import { BREAK_MS, COOL_MS, initialSeal, SEAL_HOLD_MS, sealPressStep, sealVisual, SPREAD_MS, type SealState } from "./sealPress";
import { STAMP_IDS } from "@/lib/letter/model";
import { stampPath } from "./stamps";

const tick = (s: SealState, ms: number, reduced = false) => sealPressStep(s, { type: "tick", dt: ms }, reduced);

describe("sealPressStep", () => {
  it("returns to idle when released before the hold time", () => {
    let s = sealPressStep(initialSeal("idle"), { type: "press" });
    s = tick(s, SEAL_HOLD_MS - 100);
    s = sealPressStep(s, { type: "release" });
    expect(s.stage).toBe("idle");
  });

  it("spreads once held long enough, then cools and seals", () => {
    let s = sealPressStep(initialSeal("idle"), { type: "press" });
    s = tick(s, SEAL_HOLD_MS);
    expect(s.stage).toBe("spreading");
    s = sealPressStep(s, { type: "release" }); // committed: letting go no longer cancels
    s = tick(s, SPREAD_MS);
    expect(s.stage).toBe("cooling");
    s = tick(s, COOL_MS);
    expect(s.stage).toBe("sealed");
  });

  it("only breaks a sealed seal", () => {
    expect(sealPressStep(initialSeal("idle"), { type: "break" }).stage).toBe("idle");
    let s = sealPressStep(initialSeal("sealed"), { type: "break" });
    expect(s.stage).toBe("breaking");
    s = tick(s, BREAK_MS);
    expect(s.stage).toBe("broken");
  });

  it("skips the animations under reduced motion", () => {
    let s = sealPressStep(initialSeal("idle"), { type: "press" }, true);
    s = tick(s, SEAL_HOLD_MS, true);
    expect(s.stage).toBe("sealed");
    expect(sealPressStep(s, { type: "break" }, true).stage).toBe("broken");
  });

  it("reports press progress for the hold ring", () => {
    let s = sealPressStep(initialSeal("idle"), { type: "press" });
    s = tick(s, SEAL_HOLD_MS / 2);
    expect(sealVisual(s).press).toBeCloseTo(0.5);
  });
});

describe("stampPath", () => {
  it("has a design for every stamp except initials", () => {
    for (const id of STAMP_IDS) {
      if (id === "initials") continue;
      expect(stampPath(id).length).toBeGreaterThan(10);
    }
  });
});
