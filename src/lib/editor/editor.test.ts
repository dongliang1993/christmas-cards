import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/letter/model";
import {
  createEditorState,
  createInitialDraft,
  duplicateDraft,
  editorReducer,
  toLetterDraft,
  UNDO_DEPTH,
  type EditorAction,
  type EditorState,
} from "./editorState";
import { DRAFT_STORAGE_KEY, loadDraft, saveDraft } from "./draftStorage";
import { FIXED_SEAL } from "@/lib/envelope/fixedSeal";

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

const fresh = () => createEditorState(createInitialDraft("winter-moonlight"));

function addSticker(face: "inside-left" | "inside-right", uid: string): EditorAction {
  return { type: "add-sticker", stickerId: "holly", face, uid };
}

describe("createInitialDraft", () => {
  it("starts with the template's message on the inside-right page", () => {
    const draft = createInitialDraft("winter-moonlight");
    const texts = draft.elements.filter((e) => e.kind === "text");
    expect(texts).toHaveLength(1);
    expect(texts[0].face).toBe("inside-right");
    expect(texts[0].kind === "text" && texts[0].text).toContain("Under the same winter moon");
  });
});

describe("editorReducer", () => {
  it("adds a sticker at the face centre and selects it", () => {
    const s = run(fresh(), addSticker("inside-left", "a"));
    const added = s.draft.elements.find((e) => e.uid === "a");
    expect(added).toMatchObject({ kind: "sticker", face: "inside-left", x: 0.5, y: 0.5 });
    expect(s.selected).toBe("a");
  });

  it("stacks a new sticker on top of the others", () => {
    const s = run(fresh(), addSticker("inside-left", "a"), addSticker("inside-left", "b"));
    const z = (uid: string) => s.draft.elements.find((e) => e.uid === uid)?.z ?? -1;
    expect(z("b")).toBeGreaterThan(z("a"));
  });

  it("ignores a sticker beyond the per-face limit", () => {
    const adds = Array.from({ length: LIMITS.stickersPerFace + 1 }, (_, i) => addSticker("inside-left", `s${i}`));
    const s = run(fresh(), ...adds);
    expect(s.draft.elements.filter((e) => e.kind === "sticker")).toHaveLength(LIMITS.stickersPerFace);
  });

  it("ignores text beyond the per-face limit", () => {
    const adds: EditorAction[] = Array.from({ length: LIMITS.textsPerFace + 1 }, (_, i) => ({
      type: "add-text",
      face: "inside-left",
      uid: `t${i}`,
      x: 0.5,
      y: 0.5,
      text: "hi",
      font: "serif",
      ink: "black",
    }));
    const s = run(fresh(), ...adds);
    expect(s.draft.elements.filter((e) => e.kind === "text" && e.face === "inside-left")).toHaveLength(LIMITS.textsPerFace);
  });

  it("clamps a transform to the face and the scale range", () => {
    const s = run(fresh(), addSticker("inside-left", "a"), {
      type: "transform",
      uid: "a",
      patch: { x: 1.4, y: -0.2, scale: 9 },
      record: true,
    });
    expect(s.draft.elements.find((e) => e.uid === "a")).toMatchObject({ x: 1, y: 0, scale: LIMITS.maxScale });
  });

  it("wraps rotation into one turn", () => {
    const s = run(fresh(), addSticker("inside-left", "a"), {
      type: "transform",
      uid: "a",
      patch: { rotation: Math.PI * 3 },
      record: true,
    });
    expect(s.draft.elements.find((e) => e.uid === "a")?.rotation).toBeCloseTo(Math.PI, 5);
  });

  it("removes an element and clears the selection", () => {
    const s = run(fresh(), addSticker("inside-left", "a"), { type: "remove", uid: "a" });
    expect(s.draft.elements.some((e) => e.uid === "a")).toBe(false);
    expect(s.selected).toBeNull();
  });

  it("undoes the last recorded edit", () => {
    const before = run(fresh(), addSticker("inside-left", "a"));
    const after = run(before, { type: "transform", uid: "a", patch: { x: 0.1 }, record: true }, { type: "undo" });
    expect(after.draft.elements).toEqual(before.draft.elements);
  });

  it("does not record unrecorded (mid-gesture) transforms", () => {
    const s = run(
      fresh(),
      addSticker("inside-left", "a"),
      { type: "transform", uid: "a", patch: { x: 0.2 }, record: true },
      { type: "transform", uid: "a", patch: { x: 0.25 }, record: false },
      { type: "transform", uid: "a", patch: { x: 0.3 }, record: false },
      { type: "undo" },
    );
    expect(s.draft.elements.find((e) => e.uid === "a")?.x).toBe(0.5);
  });

  it(`keeps at most ${UNDO_DEPTH} undo steps`, () => {
    const moves: EditorAction[] = Array.from({ length: UNDO_DEPTH + 5 }, (_, i) => ({
      type: "transform",
      uid: "a",
      patch: { x: i / 100 },
      record: true,
    }));
    const s = run(fresh(), addSticker("inside-left", "a"), ...moves);
    expect(s.past).toHaveLength(UNDO_DEPTH);
  });

  it("edits text content, font and ink", () => {
    const s0 = fresh();
    const uid = s0.draft.elements[0].uid;
    const s = run(s0, { type: "update-text", uid, patch: { text: "Hi", font: "serif", ink: "gold" } });
    expect(s.draft.elements[0]).toMatchObject({ text: "Hi", font: "serif", ink: "gold" });
  });

  it("sets envelope fields without touching elements", () => {
    const s = run(fresh(), { type: "set", patch: { recipientName: "阿树", paper: "kraft" } });
    expect(s.draft).toMatchObject({ recipientName: "阿树", paper: "kraft" });
  });

  it("copies a sticker slightly offset, on top, and selects the copy", () => {
    const s = run(fresh(), addSticker("inside-left", "a"), { type: "duplicate", uid: "a", newUid: "b" });
    const copy = s.draft.elements.find((e) => e.uid === "b");
    expect(copy).toMatchObject({ kind: "sticker", face: "inside-left", x: 0.54, y: 0.54 });
    expect(s.selected).toBe("b");
  });

  it("changing the template keeps everything placed and can be undone", () => {
    const before = run(fresh(), addSticker("inside-left", "a"), {
      type: "update-text",
      uid: fresh().draft.elements[0].uid,
      patch: { text: "改过的祝福" },
    });
    const after = run(before, { type: "set-template", templateId: "snow-town" });
    expect(after.draft.templateId).toBe("snow-town");
    expect(after.draft.elements).toEqual(before.draft.elements);
    expect(after.selected).toBeNull();
    const undone = run(after, { type: "undo" });
    expect(undone.draft.templateId).toBe("winter-moonlight");
    expect(undone.draft.elements).toEqual(before.draft.elements);
  });

  it("ignores switching to the template already in use", () => {
    const s = run(fresh(), { type: "set-template", templateId: "winter-moonlight" });
    expect(s.past).toHaveLength(0);
  });
});

describe("toLetterDraft", () => {
  it("strips editor-only ids", () => {
    const draft = toLetterDraft(run(fresh(), addSticker("inside-left", "a")).draft);
    expect(JSON.stringify(draft)).not.toContain('"uid"');
  });
});

describe("duplicateDraft", () => {
  it("keeps the design and clears who it is for", () => {
    const s = run(
      fresh(),
      addSticker("inside-left", "a"),
      { type: "set", patch: { recipientName: "阿树", paper: "pearl" } },
      { type: "update-text", uid: fresh().draft.elements[0].uid, patch: { text: "给阿树的话" } },
    );
    const copy = duplicateDraft(s.draft);
    expect(copy.recipientName).toBe("");
    expect(copy.paper).toBe("pearl");
    expect(copy.elements.filter((e) => e.kind === "sticker")).toHaveLength(1);
    const message = copy.elements.find((e) => e.kind === "text" && e.face === "inside-right");
    expect(message?.kind === "text" && message.text).toContain("Under the same winter moon");
  });

  it("gives every element a new id", () => {
    const s = run(fresh(), addSticker("inside-left", "a"));
    const copy = duplicateDraft(s.draft);
    expect(copy.elements.some((e) => e.uid === "a")).toBe(false);
  });
});

describe("draft storage", () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      clear: () => map.clear(),
      key: (i) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    };
  }

  it("round-trips a draft in progress, even without a recipient yet", () => {
    const storage = memoryStorage();
    const draft = run(fresh(), addSticker("inside-left", "a")).draft;
    saveDraft(storage, draft);
    const loaded = loadDraft(storage);
    expect(loaded && toLetterDraft(loaded)).toEqual(toLetterDraft(draft));
  });

  it("returns null for corrupt JSON", () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, "{oops");
    expect(loadDraft(storage)).toBeNull();
  });

  it("returns null for a draft that fails validation", () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ v: 1, draft: { templateId: "nope" } }));
    expect(loadDraft(storage)).toBeNull();
  });

  it("resets a stored seal to the fixed red snowflake: the picker is gone", () => {
    const storage = memoryStorage();
    const draft = { ...fresh().draft, seal: { color: "green" as const, stamp: "initials" as const, initials: "LD" } };
    saveDraft(storage, draft);
    expect(loadDraft(storage)?.seal).toEqual(FIXED_SEAL);
  });

  it("the fixed seal is red wax with the snowflake stamp", () => {
    expect(FIXED_SEAL).toEqual({ color: "red", stamp: "snowflake" });
    expect(createInitialDraft("winter-moonlight").seal).toEqual(FIXED_SEAL);
  });

  it("returns null when storage throws", () => {
    const storage = { getItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    expect(loadDraft(storage)).toBeNull();
  });
});
