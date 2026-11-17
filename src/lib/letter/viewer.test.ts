import { describe, expect, it } from "vitest";
import type { PublicLetter } from "./model";
import { shouldRecordOpening, viewerStage } from "./viewer";

const base: PublicLetter = {
  id: "L1",
  status: "in-transit",
  recipientName: "小雪",
  envelopeColor: "ivory",
  seal: { color: "red", stamp: "star" },
  deliverAt: "2026-12-23T16:00:00.000Z",
  content: null,
};
const content = { templateId: "first-snow" as const, paper: "cold-press" as const, elements: [], audioUrl: null, audioName: null };

describe("viewerStage", () => {
  it("shows the travelling envelope before delivery", () => {
    expect(viewerStage(base, new Date("2026-12-20T00:00:00Z"), false)).toBe("transit");
  });

  it("asks to refetch once the delivery time passes while the page is open", () => {
    expect(viewerStage(base, new Date("2026-12-24T00:00:00Z"), false)).toBe("refetch");
  });

  it("shows the sealed envelope once the letter has arrived", () => {
    expect(viewerStage({ ...base, status: "delivered", content }, new Date("2026-12-24T00:00:00Z"), false)).toBe("sealed");
  });

  it("shows the card after the seal is broken", () => {
    expect(viewerStage({ ...base, status: "delivered", content }, new Date("2026-12-24T00:00:00Z"), true)).toBe("card");
  });

  it("says when the sender took the letter back", () => {
    expect(viewerStage({ ...base, status: "recalled" }, new Date("2026-12-24T00:00:00Z"), false)).toBe("recalled");
  });
});

describe("shouldRecordOpening", () => {
  it("records the first opening in a session only", () => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(shouldRecordOpening(storage, "L1")).toBe(true);
    expect(shouldRecordOpening(storage, "L1")).toBe(false);
    expect(shouldRecordOpening(storage, "L2")).toBe(true);
  });
});
