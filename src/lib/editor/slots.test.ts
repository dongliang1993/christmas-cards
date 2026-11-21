import { describe, expect, it } from "vitest";
import {
  createEditorState,
  createInitialDraft,
  displayElements,
  duplicateDraft,
  editorReducer,
  GREETING_PREFIX,
  slotFont,
  slotText,
  toLetterDraft,
  type EditorAction,
  type EditorState,
} from "./editorState";
import { LIMITS } from "@/lib/letter/model";

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const fresh = () => createEditorState(createInitialDraft("winter-moonlight"));
const type = (slot: "greeting" | "body" | "signature", text: string): EditorAction => ({ type: "set-slot-text", slot, text });

describe("a fresh card's text", () => {
  it("does not bring the template's message along", () => {
    const d = createInitialDraft("winter-moonlight");
    expect(slotText(d, "body")).toBe("");
    expect(JSON.stringify(d.elements)).not.toContain("winter moon");
  });

  it("starts the greeting with Dear and leaves the signature empty", () => {
    const d = createInitialDraft("winter-moonlight");
    expect(slotText(d, "greeting")).toBe(GREETING_PREFIX);
    expect(slotText(d, "signature")).toBe("");
  });

  it("writes in the hand that suits the template's language", () => {
    expect(slotFont(createInitialDraft("winter-moonlight"), "body")).toBe("hand-en");
  });
});

describe("typing into a slot", () => {
  it("puts the text in that slot, in black ink, on the right page", () => {
    const s = run(fresh(), type("body", "今年也辛苦啦"));
    const body = s.draft.elements.find((e) => e.kind === "text" && e.slot === "body");
    expect(body).toMatchObject({ kind: "text", text: "今年也辛苦啦", ink: "black", face: "inside-right" });
  });

  it("keeps one element per slot however often it is typed into", () => {
    const s = run(fresh(), type("body", "a"), type("body", "ab"));
    expect(s.draft.elements.filter((e) => e.kind === "text" && e.slot === "body")).toHaveLength(1);
    expect(slotText(s.draft, "body")).toBe("ab");
  });

  it("caps the body at the text limit and one-line slots at the line limit", () => {
    const s = run(fresh(), type("body", "x".repeat(LIMITS.textLength + 5)), type("signature", "y".repeat(LIMITS.slotLineLength + 5)));
    expect(slotText(s.draft, "body")).toHaveLength(LIMITS.textLength);
    expect(slotText(s.draft, "signature")).toHaveLength(LIMITS.slotLineLength);
  });

  it("can be undone", () => {
    const s = run(fresh(), type("body", "hi"), { type: "undo" });
    expect(slotText(s.draft, "body")).toBe("");
  });

  it("changes only that slot's font", () => {
    const s = run(fresh(), type("body", "hi"), { type: "set-slot-font", slot: "body", font: "serif" });
    expect(slotFont(s.draft, "body")).toBe("serif");
    expect(slotFont(s.draft, "signature")).toBe("hand-en");
  });

  it("does not let a slot be dragged, copied or restacked", () => {
    const s1 = run(fresh(), type("body", "hi"));
    const uid = s1.draft.elements.find((e) => e.kind === "text" && e.slot === "body")!.uid;
    const s2 = run(s1, { type: "transform", uid, patch: { x: 0.1 }, record: true }, { type: "duplicate", uid, newUid: "copy" });
    expect(s2.draft.elements).toEqual(s1.draft.elements);
  });
});

describe("what gets sent", () => {
  it("leaves out empty slots and a greeting that is only Dear", () => {
    const sent = toLetterDraft(fresh().draft);
    expect(sent.elements.filter((e) => e.kind === "text")).toHaveLength(0);
  });

  it("keeps slots with words in them, without editor ids", () => {
    const sent = toLetterDraft(run(fresh(), type("greeting", "Dear 小雨,"), type("body", "hi")).draft);
    expect(sent.elements.map((e) => e.kind === "text" && e.slot)).toEqual(["greeting", "body"]);
    expect(sent.elements.every((e) => !("uid" in e))).toBe(true);
  });
});

describe("hints in the editor", () => {
  it("shows a grey hint for each empty slot, and for a bare Dear", () => {
    const hints = displayElements(fresh().draft).filter((e) => e.hint);
    expect(hints.map((e) => e.kind === "text" && e.slot)).toEqual(["greeting", "body", "signature"]);
  });

  it("drops the hint once the slot has words", () => {
    const shown = displayElements(run(fresh(), type("body", "hi")).draft);
    expect(shown.some((e) => e.hint && e.kind === "text" && e.slot === "body")).toBe(false);
  });
});

describe("duplicateDraft", () => {
  it("clears the greeting and the body but keeps the signature", () => {
    const s = run(fresh(), type("greeting", "Dear 阿树,"), type("body", "给阿树的话"), type("signature", "— 小林"));
    const copy = duplicateDraft(s.draft);
    expect(slotText(copy, "greeting")).toBe(GREETING_PREFIX);
    expect(slotText(copy, "body")).toBe("");
    expect(slotText(copy, "signature")).toBe("— 小林");
  });
});
