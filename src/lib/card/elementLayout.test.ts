import { describe, expect, it } from "vitest";
import { CARD_H, CARD_W } from "@/lib/cardConstants";
import { FACE_FRAMES, localToPlacement, placementToLocal, quadCorners, splitTextLines } from "./elementLayout";

describe("placementToLocal", () => {
  it("puts the centre of the insert sheet at its mesh origin", () => {
    const p = placementToLocal("inside-right", 0.5, 0.5);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it("mirrors the inside-left page, whose back face is seen once the cover swings open", () => {
    // Top-left as the reader sees it is the cover's free edge, local +x.
    const p = placementToLocal("inside-left", 0, 0);
    expect(p.x).toBeCloseTo(CARD_W / 2);
    expect(p.y).toBeCloseTo(CARD_H / 2);
  });

  it("puts inside-left elements just behind the cover's back face", () => {
    expect(placementToLocal("inside-left", 0.5, 0.5).z).toBeLessThan(0);
    expect(placementToLocal("inside-right", 0.5, 0.5).z).toBeGreaterThan(0);
  });

  it("round-trips through localToPlacement on both faces", () => {
    for (const face of ["inside-left", "inside-right"] as const) {
      const local = placementToLocal(face, 0.3, 0.8);
      const back = localToPlacement(face, local.x, local.y);
      expect(back.x).toBeCloseTo(0.3);
      expect(back.y).toBeCloseTo(0.8);
    }
  });
});

describe("quadCorners", () => {
  it("sizes a sticker relative to its face width", () => {
    const [tl, tr] = quadCorners({ face: "inside-right", x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 }, 0.3, 1);
    expect(tr.x - tl.x).toBeCloseTo(FACE_FRAMES["inside-right"].width * 0.3);
  });

  it("rotates clockwise as the reader sees it for a positive angle", () => {
    const [tl, tr] = quadCorners({ face: "inside-right", x: 0.5, y: 0.5, scale: 1, rotation: Math.PI / 2, z: 0 }, 0.3, 1);
    // The top edge, turned a quarter clockwise, now runs top to bottom.
    expect(tr.y).toBeLessThan(tl.y);
    expect(tr.x).toBeCloseTo(tl.x);
  });
});

describe("splitTextLines", () => {
  it("splits on newlines and drops trailing blank lines", () => {
    expect(splitTextLines("Snow outside,\nwarm inside,\n\n")).toEqual(["Snow outside,", "warm inside,"]);
  });

  it("keeps at least one line", () => {
    expect(splitTextLines("")).toEqual([""]);
  });
});
