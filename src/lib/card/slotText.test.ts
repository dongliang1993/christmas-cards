import { describe, expect, it } from "vitest";
import { layoutSlotText, SLOT_MIN_SCALE } from "./slotText";

/** Every character is 1em wide: easy to reason about. */
const mono = (line: string) => [...line].length;
const FACE_ASPECT = 0.7;

describe("layoutSlotText", () => {
  it("keeps a short body on one line at full size", () => {
    const r = layoutSlotText("圣诞快乐", "body", { measure: mono, faceAspect: FACE_ASPECT });
    expect(r.lines).toEqual(["圣诞快乐"]);
    expect(r.fontScale).toBe(1);
    expect(r.overflow).toBe(false);
  });

  it("wraps a long body to the box width", () => {
    const r = layoutSlotText("愿".repeat(30), "body", { measure: mono, faceAspect: FACE_ASPECT });
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.lines.join("")).toBe("愿".repeat(30));
  });

  it("wraps English between words, not inside them", () => {
    const r = layoutSlotText("Wrapped with warmth and cheer may every little surprise brighten", "body", {
      measure: mono,
      faceAspect: FACE_ASPECT,
    });
    expect(r.lines.length).toBeGreaterThan(1);
    for (const line of r.lines) expect(line).toBe(line.trim());
    expect(r.lines.join(" ")).toBe("Wrapped with warmth and cheer may every little surprise brighten");
  });

  it("keeps the sender's own line breaks", () => {
    const r = layoutSlotText("Dear\nfriend", "body", { measure: mono, faceAspect: FACE_ASPECT });
    expect(r.lines).toEqual(["Dear", "friend"]);
  });

  it("shrinks the type before the body overflows, but not below the minimum", () => {
    const r = layoutSlotText("好".repeat(200), "body", { measure: mono, faceAspect: FACE_ASPECT });
    expect(r.fontScale).toBeLessThan(1);
    expect(r.fontScale).toBeGreaterThanOrEqual(SLOT_MIN_SCALE);
  });

  it("reports overflow when even the smallest size cannot hold the body", () => {
    const r = layoutSlotText("好".repeat(2000), "body", { measure: mono, faceAspect: FACE_ASPECT });
    expect(r.fontScale).toBe(SLOT_MIN_SCALE);
    expect(r.overflow).toBe(true);
  });

  it("never wraps the greeting; a long one shrinks instead", () => {
    const r = layoutSlotText("Dear " + "x".repeat(30) + ",", "greeting", { measure: mono, faceAspect: FACE_ASPECT });
    expect(r.lines).toHaveLength(1);
    expect(r.fontScale).toBeLessThan(1);
  });
});
