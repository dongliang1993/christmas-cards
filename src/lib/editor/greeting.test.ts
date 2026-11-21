import { describe, expect, it } from "vitest";
import { greetingFor, nameFromGreeting } from "./greeting";
import { createEditorState, createInitialDraft, editorReducer, slotText, type EditorAction, type EditorState } from "./editorState";

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const fresh = () => createEditorState(createInitialDraft("winter-moonlight"));
const greet = (text: string): EditorAction => ({ type: "set-slot-text", slot: "greeting", text });

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

describe("the recipient comes from the greeting", () => {
  it("follows the name as it is typed", () => {
    const s = run(fresh(), greet("Dear 小"), greet("Dear 小雨,"));
    expect(s.draft.recipientName).toBe("小雨");
  });

  it("is empty while the greeting has no name", () => {
    const s = run(fresh(), greet("Hi 阿树!"));
    expect(s.draft.recipientName).toBe("");
  });

  it("leaves the greeting as the sender wrote it", () => {
    const s = run(fresh(), greet("Dear 小雨,"));
    expect(slotText(s.draft, "greeting")).toBe("Dear 小雨,");
  });
});
