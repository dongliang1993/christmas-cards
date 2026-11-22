import { describe, expect, it } from "vitest";
import { halfExtent, keepOnFace, PAGE_BOX, scaleAcross, settle, shiftAcross } from "./elementBounds";
import { FACE_FRAMES } from "./elementLayout";

const square = { widthFraction: 0.3, aspect: 1 };

describe("halfExtent", () => {
  it("is half the element's width and height as face fractions", () => {
    const e = halfExtent("inside-left", square, 1, 0);
    const f = FACE_FRAMES["inside-left"];
    expect(e.x).toBeCloseTo(0.15);
    expect(e.y).toBeCloseTo((0.3 * f.width) / 2 / f.height);
  });

  it("grows with scale and with a turn off square", () => {
    expect(halfExtent("inside-left", square, 2, 0).x).toBeCloseTo(0.3);
    expect(halfExtent("inside-left", square, 1, Math.PI / 4).x).toBeGreaterThan(0.15);
  });
});

describe("keepOnFace", () => {
  it("pulls an element off the fold so its edge sits on the page", () => {
    expect(keepOnFace({ x: 0.98, y: 0.5 }, { x: 0.15, y: 0.1 })).toEqual({ x: 0.85, y: 0.5 });
    expect(keepOnFace({ x: 0.02, y: 0.5 }, { x: 0.15, y: 0.1 })).toEqual({ x: 0.15, y: 0.5 });
  });

  it("keeps top and bottom edges on the page too", () => {
    expect(keepOnFace({ x: 0.5, y: 0 }, { x: 0.1, y: 0.2 }).y).toBeCloseTo(0.2);
    expect(keepOnFace({ x: 0.5, y: 1 }, { x: 0.1, y: 0.2 }).y).toBeCloseTo(0.8);
  });

  it("centres an element larger than the page", () => {
    expect(keepOnFace({ x: 0.9, y: 0.5 }, { x: 0.7, y: 0.1 }).x).toBe(0.5);
  });

  it("leaves an element already on the page alone", () => {
    expect(keepOnFace({ x: 0.4, y: 0.6 }, { x: 0.1, y: 0.1 })).toEqual({ x: 0.4, y: 0.6 });
  });
});

describe("moving between pages", () => {
  it("keeps a sticker's real size when the pages differ in width", () => {
    const s = scaleAcross(1, "inside-left", "inside-right");
    expect(s * FACE_FRAMES["inside-right"].width).toBeCloseTo(FACE_FRAMES["inside-left"].width);
  });

  it("keeps the grab offset the same distance on the paper", () => {
    const d = shiftAcross({ x: 0.1, y: 0.1 }, "inside-left", "inside-right");
    expect(d.x * FACE_FRAMES["inside-right"].width).toBeCloseTo(0.1 * FACE_FRAMES["inside-left"].width);
    expect(d.y * FACE_FRAMES["inside-right"].height).toBeCloseTo(0.1 * FACE_FRAMES["inside-left"].height);
  });

  it("is a no-op on the same page", () => {
    expect(scaleAcross(1.3, "inside-left", "inside-left")).toBe(1.3);
  });
});

describe("settle", () => {
  const el = { face: "inside-left" as const, x: 0.2, y: 0.5, scale: 1, rotation: 0 };

  it("nudges an element that grew over the fold back onto its page", () => {
    const p = settle(el, square, { scale: 2 });
    expect(p.scale).toBe(2);
    expect(p.x).toBeCloseTo(0.3);
    expect(p.y).toBe(0.5);
  });

  it("keeps only the centre on the page while the size is unknown", () => {
    expect(settle({ ...el, x: 0.02 }, null, { rotation: 1 }).x).toBe(0.02);
  });
});

describe("PAGE_BOX", () => {
  it("is the whole left panel", () => {
    expect(PAGE_BOX["inside-left"]).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });

  it("reaches past the letter sheet to the right panel's edges", () => {
    const b = PAGE_BOX["inside-right"];
    const f = FACE_FRAMES["inside-right"];
    expect((b.x1 - b.x0) * f.width).toBeCloseTo(FACE_FRAMES["inside-left"].width);
    expect((b.y1 - b.y0) * f.height).toBeCloseTo(FACE_FRAMES["inside-left"].height);
    expect(b.x0).toBeLessThan(0);
    expect(b.x1).toBeGreaterThan(1);
  });

  it("lets a sticker sit in the right panel's margin, off the sheet", () => {
    const el = { face: "inside-right" as const, x: 1.05, y: 0.5, scale: 0.2, rotation: 0 };
    expect(settle(el, square, {}).x).toBeCloseTo(1.05);
  });

  it("still keeps it off the fold on the right page", () => {
    const el = { face: "inside-right" as const, x: PAGE_BOX["inside-right"].x0, y: 0.5, scale: 1, rotation: 0 };
    const half = halfExtent("inside-right", square, 1, 0).x;
    expect(settle(el, square, {}).x).toBeCloseTo(PAGE_BOX["inside-right"].x0 + half);
  });
});
