import { describe, expect, it } from "vitest";
import { changeGate } from "./changeGate";

describe("changeGate: rebuild the wax only when its spread moves", () => {
  it("lets the first value through, then only real changes", () => {
    const gate = changeGate();
    expect(gate(1)).toBe(true);
    expect(gate(1)).toBe(false);
    expect(gate(1)).toBe(false);
    expect(gate(0.5)).toBe(true);
    expect(gate(0.5 + 1e-7)).toBe(false);
  });
});
