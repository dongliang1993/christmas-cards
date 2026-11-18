import { describe, expect, it } from "vitest";
import { assignBodies } from "./bodyAssign";

const cards = ["a", "b", "c", "d", "e", "f", "g", "h"];
const cardOf = (slot: number) => cards[slot % cards.length];
const base = { slots: 8, bodies: 3, cardOf };
const slotsOf = (a: Array<number | null>) => a.filter((s): s is number => s !== null).sort((x, y) => x - y);

describe("assignBodies: the real cards go to the slots nearest the front", () => {
  it("at rest gives the front card and its two neighbours a body", () => {
    const out = assignBodies({ ...base, pos: 0, current: [null, null, null] });
    expect(slotsOf(out)).toEqual([0, 1, 7]);
  });

  it("keeps a body on its slot while the slot is still near, so nothing swaps back and forth", () => {
    const current = assignBodies({ ...base, pos: 0, current: [null, null, null] });
    const out = assignBodies({ ...base, pos: 0.55, current });
    // Slot 7 is now 1.55 out: past acquiring (1.5) but not yet released (1.6).
    expect(out).toEqual(current);
  });

  it("frees a body once its slot is past the release distance and gives it to the newly near slot", () => {
    const current = assignBodies({ ...base, pos: 0, current: [null, null, null] });
    const at7 = current.indexOf(7);
    const out = assignBodies({ ...base, pos: 0.7, current });
    expect(out[at7]).toBe(2);
    expect(slotsOf(out)).toEqual([0, 1, 2]);
  });

  it("only moves the body that has to move", () => {
    const current: Array<number | null> = [7, 0, 1];
    const out = assignBodies({ ...base, pos: 1, current });
    expect(out).toEqual([2, 0, 1]);
  });

  it("never gives one card two bodies (a two-lap hand repeats cards)", () => {
    const twoLap = (slot: number) => ["a", "b", "c"][slot % 3];
    const out = assignBodies({ slots: 6, bodies: 3, cardOf: twoLap, pos: 0, current: [null, null, null] });
    const shown = slotsOf(out).map(twoLap);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("wraps round the end of the hand", () => {
    const out = assignBodies({ ...base, pos: 7, current: [null, null, null] });
    expect(slotsOf(out)).toEqual([0, 6, 7]);
  });
});
