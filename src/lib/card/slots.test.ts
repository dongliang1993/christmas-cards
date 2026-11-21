import { describe, expect, it } from "vitest";
import { SLOT_FACE, SLOTS, TEXT_SLOTS, slotAt, slotPlacement } from "./slots";

describe("text slots", () => {
  it("are greeting, body and signature, in reading order", () => {
    expect(TEXT_SLOTS).toEqual(["greeting", "body", "signature"]);
  });

  it("all sit on the right inside page", () => {
    expect(SLOT_FACE).toBe("inside-right");
  });

  it("place a slot's text at the centre of its box, upright", () => {
    const box = SLOTS.body.box;
    expect(slotPlacement("body")).toMatchObject({
      face: "inside-right",
      x: (box.x0 + box.x1) / 2,
      y: (box.y0 + box.y1) / 2,
      scale: 1,
      rotation: 0,
    });
  });

  it("align the greeting and body left and the signature right", () => {
    expect(SLOTS.greeting.align).toBe("left");
    expect(SLOTS.body.align).toBe("left");
    expect(SLOTS.signature.align).toBe("right");
  });
});

describe("slotAt", () => {
  it("finds the slot whose box holds the point on the right page", () => {
    const b = SLOTS.body.box;
    expect(slotAt("inside-right", (b.x0 + b.x1) / 2, b.y1 - 0.01)).toBe("body");
    expect(slotAt("inside-right", SLOTS.signature.box.x1 - 0.01, SLOTS.signature.box.y0 + 0.01)).toBe("signature");
  });

  it("finds nothing on the left page or between the boxes", () => {
    expect(slotAt("inside-left", 0.5, 0.5)).toBeNull();
    expect(slotAt("inside-right", 0.02, 0.5)).toBeNull();
  });
});
