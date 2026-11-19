import { describe, expect, it } from "vitest";
import { hingeCue } from "./hingeCue";

describe("hingeCue", () => {
  it("cues open on the frame the hinge is first told to open", () => {
    expect(hingeCue({ prevTarget: 0, target: 1, progress: 0 })).toBe("open");
  });

  it("cues close on the frame the hinge is first told to shut", () => {
    expect(hingeCue({ prevTarget: 1, target: 0, progress: 1 })).toBe("close");
  });

  it("stays quiet while the target holds", () => {
    expect(hingeCue({ prevTarget: 1, target: 1, progress: 0.4 })).toBeNull();
    expect(hingeCue({ prevTarget: 0, target: 0, progress: 0 })).toBeNull();
  });

  it("does not cue a close for a cover that is still (nearly) shut", () => {
    expect(hingeCue({ prevTarget: 1, target: 0, progress: 0.05 })).toBeNull();
  });

  it("does not cue an open for a cover that is already (nearly) open", () => {
    expect(hingeCue({ prevTarget: 0, target: 1, progress: 0.95 })).toBeNull();
  });
});
