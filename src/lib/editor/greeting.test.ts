import { describe, expect, it } from "vitest";
import { greetingFor, nameFromGreeting } from "./greeting";
import { createEditorState, createInitialDraft, editorReducer, slotText, type EditorAction, type EditorState } from "./editorState";

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const fresh = () => createEditorState(createInitialDraft("winter-moonlight"));
const greet = (text: string): EditorAction => ({ type: "set-slot-text", slot: "greeting", text });
const recipient = (name: string): EditorAction => ({ type: "set", patch: { recipientName: name } });

describe("nameFromGreeting", () => {
  it("takes the words between Dear and the comma", () => {
    expect(nameFromGreeting("Dear 小雨,")).toBe("小雨");
    expect(nameFromGreeting("dear  Anna Lee ，")).toBe("Anna Lee");
  });

  it("finds no name in a bare Dear or a greeting without Dear", () => {
    expect(nameFromGreeting("Dear ")).toBe("");
    expect(nameFromGreeting("亲爱的小雨")).toBe("");
  });

  it("greetingFor writes the greeting back", () => {
    expect(greetingFor("小雨")).toBe("Dear 小雨,");
  });
});

describe("greeting and recipient follow each other", () => {
  it("fills an empty recipient from the greeting and keeps following it", () => {
    const s = run(fresh(), greet("Dear 小"), greet("Dear 小雨,"));
    expect(s.draft.recipientName).toBe("小雨");
  });

  it("stops following once the recipient is typed by hand", () => {
    const s = run(fresh(), greet("Dear 小雨,"), recipient("雨姐"), greet("Dear 小雨同学,"));
    expect(s.draft.recipientName).toBe("雨姐");
  });

  it("writes the greeting from the recipient while the greeting is untouched", () => {
    const s = run(fresh(), recipient("阿树"));
    expect(slotText(s.draft, "greeting")).toBe("Dear 阿树,");
  });

  it("leaves a greeting the sender wrote alone", () => {
    const s = run(fresh(), greet("Hi 阿树!"), recipient("小林"));
    expect(slotText(s.draft, "greeting")).toBe("Hi 阿树!");
  });

  it("does not let an auto-filled recipient overwrite the greeting in a loop", () => {
    const s = run(fresh(), greet("Dear 小雨,"));
    expect(slotText(s.draft, "greeting")).toBe("Dear 小雨,");
  });
});
