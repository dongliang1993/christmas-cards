import { describe, expect, it } from "vitest";
import { createInitialDraft } from "@/lib/editor/editorState";
import { isSealValid, sealKey } from "./sealFlow";

const draft = createInitialDraft("winter-moonlight");

describe("a seal belongs to what was put in the envelope", () => {
  it("stays valid when only the recipient's name changes", () => {
    const key = sealKey(draft);
    expect(isSealValid(key, { ...draft, recipientName: "小雪" })).toBe(true);
  });

  it("is void once the card, its paper, its music or the envelope changes", () => {
    const key = sealKey(draft);
    expect(isSealValid(key, { ...draft, templateId: "snow-town" })).toBe(false);
    expect(isSealValid(key, { ...draft, paper: "kraft" })).toBe(false);
    expect(isSealValid(key, { ...draft, envelopeColor: "midnight" })).toBe(false);
    expect(isSealValid(key, { ...draft, audioUrl: "/u/song.mp3" })).toBe(false);
    expect(isSealValid(key, { ...draft, elements: [] })).toBe(draft.elements.length === 0);
  });

  it("nothing sealed yet is never valid", () => {
    expect(isSealValid(null, draft)).toBe(false);
  });
});
