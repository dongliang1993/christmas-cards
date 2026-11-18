import { describe, expect, it } from "vitest";
import { bakePlanForCard } from "./bakePlan";

describe("bakePlanForCard: every surface a card needs", () => {
  it("a card needs cover, snow mask and the two sticker bakes first", () => {
    const tasks = bakePlanForCard("snow-town");
    expect(tasks.slice(0, 4).map((t) => t.kind)).toEqual(["cover", "snow", "left-stickers", "sheet-stickers"]);
    expect(tasks.slice(0, 4).map((t) => t.name)).toEqual(["cover", "snow-mask", "left", "sheet"]);
  });

  it("a layered card also needs its base and one task per distinct layer bake", () => {
    const tasks = bakePlanForCard("snow-town");
    const kinds = tasks.map((t) => t.kind);
    expect(kinds).toContain("base");
    // 13 layer items, but star-icicle/star-icicle-b share src and width: 12 distinct bakes.
    expect(kinds.filter((k) => k === "layer")).toHaveLength(12);
  });

  it("layer tasks carry the source and the 1.5x bake width", () => {
    const tasks = bakePlanForCard("snow-town");
    const cloud = tasks.find((t) => t.name === "layer-snowman");
    expect(cloud).toMatchObject({
      kind: "layer",
      src: "/assets/cards/snow-town/elements/snowman.webp",
      width: 300,
      key: "layer|/assets/cards/snow-town/elements/snowman.webp|300",
    });
  });

  it("task keys are unique within a card", () => {
    for (const id of ["snow-town", "gift-atelier"] as const) {
      const keys = bakePlanForCard(id).map((t) => t.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
