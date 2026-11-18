import { describe, expect, it } from "vitest";
import { handleTransform, pinchTransform } from "./gestures";
import { createEditorState, createInitialDraft, editorReducer } from "./editorState";

describe("pinchTransform", () => {
  const start = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };

  it("doubles the scale when the fingers spread to twice the distance", () => {
    const t = pinchTransform(start, { a: { x: 50, y: 100 }, b: { x: 250, y: 100 } });
    expect(t.scale).toBeCloseTo(2);
    expect(t.rotation).toBeCloseTo(0);
  });

  it("turns by the angle the second finger swings through", () => {
    const t = pinchTransform(start, { a: { x: 100, y: 100 }, b: { x: 100, y: 200 } });
    // Screen y points down: swinging from east to south is clockwise, +π/2.
    expect(t.rotation).toBeCloseTo(Math.PI / 2);
    expect(t.scale).toBeCloseTo(1);
  });

  it("moves with the midpoint of the two fingers", () => {
    const t = pinchTransform(start, { a: { x: 110, y: 130 }, b: { x: 210, y: 130 } });
    expect(t.dx).toBeCloseTo(10);
    expect(t.dy).toBeCloseTo(30);
  });

  it("ignores a degenerate start", () => {
    const t = pinchTransform({ a: { x: 1, y: 1 }, b: { x: 1, y: 1 } }, start);
    expect(t.scale).toBe(1);
  });
});

describe("handleTransform", () => {
  const centre = { x: 0, y: 0 };

  it("scales by how far the handle moves out from the centre", () => {
    const t = handleTransform(centre, { x: 100, y: 0 }, { x: 150, y: 0 });
    expect(t.scale).toBeCloseTo(1.5);
  });

  it("rotates as the handle swings around the centre", () => {
    const t = handleTransform(centre, { x: 100, y: 0 }, { x: 0, y: 100 });
    expect(t.rotation).toBeCloseTo(Math.PI / 2);
  });
});

describe("add-sticker at a drop point", () => {
  it("places the sticker where it was dropped", () => {
    const s = editorReducer(createEditorState(createInitialDraft("winter-moonlight")), {
      type: "add-sticker",
      stickerId: "holly",
      face: "inside-left",
      uid: "d",
      at: { x: 0.2, y: 0.8 },
    });
    expect(s.draft.elements.find((e) => e.uid === "d")).toMatchObject({ x: 0.2, y: 0.8 });
  });
});
