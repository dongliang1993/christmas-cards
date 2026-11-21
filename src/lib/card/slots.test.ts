import { describe, expect, it } from "vitest";
import { SLOT_FACE, SLOTS, TEXT_SLOTS, slotPlacement } from "./slots";

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
