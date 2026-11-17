import { nanoid } from "nanoid";
import { LIMITS, type CardElement, type Face, type FontId, type Ink, type LetterDraft, type Placement } from "@/lib/letter/model";
import { TEMPLATE_MAP } from "@/lib/templates";
import type { CardTemplateId } from "@/lib/types";

/** Undo history depth (spec §4.3). */
export const UNDO_DEPTH = 20;

/** An element plus a stable id the editor selects and drags by. */
export type EditorElement = CardElement & { uid: string };

export type EditorDraft = Omit<LetterDraft, "elements"> & { elements: EditorElement[] };

export interface EditorState {
  draft: EditorDraft;
  selected: string | null;
  /** Earlier element lists, newest last. */
  past: EditorElement[][];
}

type EnvelopeFields = Pick<
  LetterDraft,
  "templateId" | "paper" | "envelopeColor" | "seal" | "recipientName" | "audioUrl" | "audioName"
>;

export type EditorAction =
  | { type: "add-sticker"; stickerId: string; face: Face; uid: string; at?: { x: number; y: number } }
  | { type: "add-text"; face: Face; uid: string; x: number; y: number; text: string; font: FontId; ink: Ink }
  | { type: "transform"; uid: string; patch: Partial<Pick<Placement, "x" | "y" | "scale" | "rotation">>; record: boolean }
  | { type: "update-text"; uid: string; patch: Partial<{ text: string; font: FontId; ink: Ink }> }
  | { type: "remove"; uid: string }
  | { type: "select"; uid: string | null }
  | { type: "set"; patch: Partial<EnvelopeFields> }
  | { type: "undo" }
  | { type: "load"; draft: EditorDraft };

/** Where the template's own message sits on the inside-right sheet. */
const MESSAGE_PLACEMENT = { face: "inside-right" as const, x: 0.5, y: 0.36, scale: 1, rotation: 0, z: 0 };

function fontFor(text: string): FontId {
  return /[㐀-鿿]/.test(text) ? "hand-zh" : "hand-en";
}

function messageElement(templateId: CardTemplateId): EditorElement {
  const text = TEMPLATE_MAP[templateId].defaultMessage;
  return { kind: "text", text, font: fontFor(text), ink: "black", uid: nanoid(8), ...MESSAGE_PLACEMENT };
}

export function createInitialDraft(templateId: CardTemplateId): EditorDraft {
  return {
    templateId,
    paper: "cold-press",
    envelopeColor: "ivory",
    seal: { color: "red", stamp: "snowflake" },
    recipientName: "",
    elements: [messageElement(templateId)],
    audioUrl: null,
    audioName: null,
  };
}

export function createEditorState(draft: EditorDraft): EditorState {
  return { draft, selected: null, past: [] };
}

/** The draft as the API and storage see it, without editor ids. */
export function toLetterDraft(draft: EditorDraft): LetterDraft {
  return { ...draft, elements: draft.elements.map(({ uid: _uid, ...element }) => element as CardElement) };
}

export function withEditorIds(draft: LetterDraft): EditorDraft {
  return { ...draft, elements: draft.elements.map((e) => ({ ...e, uid: nanoid(8) })) };
}

/**
 * "复制一封" (spec §4.8): same paper, stickers, seal and timing; recipient
 * blank and the inside-right message back to the template's default.
 */
export function duplicateDraft(draft: EditorDraft): EditorDraft {
  const firstMessage = draft.elements.find((e) => e.kind === "text" && e.face === "inside-right");
  const reset = TEMPLATE_MAP[draft.templateId].defaultMessage;
  return {
    ...draft,
    recipientName: "",
    elements: draft.elements.map((e) => ({
      ...e,
      uid: nanoid(8),
      ...(e === firstMessage && e.kind === "text" ? { text: reset, font: fontFor(reset) } : {}),
    })),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Wrap an angle into (-π, π]. */
function wrapAngle(a: number): number {
  const turn = Math.PI * 2;
  const r = ((((a + Math.PI) % turn) + turn) % turn) - Math.PI;
  return r === -Math.PI ? Math.PI : r;
}

function countOn(elements: EditorElement[], kind: CardElement["kind"], face: Face): number {
  return elements.filter((e) => e.kind === kind && e.face === face).length;
}

function topZ(elements: EditorElement[], face: Face): number {
  return elements.filter((e) => e.face === face).reduce((max, e) => Math.max(max, e.z + 1), 0);
}

function withElements(state: EditorState, elements: EditorElement[], record: boolean): EditorState {
  const past = record ? [...state.past, state.draft.elements].slice(-UNDO_DEPTH) : state.past;
  return { ...state, past, draft: { ...state.draft, elements } };
}

function mapElement(state: EditorState, uid: string, fn: (e: EditorElement) => EditorElement): EditorElement[] {
  return state.draft.elements.map((e) => (e.uid === uid ? fn(e) : e));
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const elements = state.draft.elements;
  switch (action.type) {
    case "add-sticker": {
      if (countOn(elements, "sticker", action.face) >= LIMITS.stickersPerFace) return state;
      const added: EditorElement = {
        kind: "sticker",
        stickerId: action.stickerId,
        uid: action.uid,
        face: action.face,
        x: clamp(action.at?.x ?? 0.5, 0, 1),
        y: clamp(action.at?.y ?? 0.5, 0, 1),
        scale: 1,
        rotation: 0,
        z: topZ(elements, action.face),
      };
      return { ...withElements(state, [...elements, added], true), selected: action.uid };
    }
    case "add-text": {
      if (countOn(elements, "text", action.face) >= LIMITS.textsPerFace) return state;
      const added: EditorElement = {
        kind: "text",
        text: action.text,
        font: action.font,
        ink: action.ink,
        uid: action.uid,
        face: action.face,
        x: clamp(action.x, 0, 1),
        y: clamp(action.y, 0, 1),
        scale: 1,
        rotation: 0,
        z: topZ(elements, action.face),
      };
      return { ...withElements(state, [...elements, added], true), selected: action.uid };
    }
    case "transform": {
      const { x, y, scale, rotation } = action.patch;
      const next = mapElement(state, action.uid, (e) => ({
        ...e,
        ...(x === undefined ? {} : { x: clamp(x, 0, 1) }),
        ...(y === undefined ? {} : { y: clamp(y, 0, 1) }),
        ...(scale === undefined ? {} : { scale: clamp(scale, LIMITS.minScale, LIMITS.maxScale) }),
        ...(rotation === undefined ? {} : { rotation: wrapAngle(rotation) }),
      }));
      return withElements(state, next, action.record);
    }
    case "update-text": {
      const next = mapElement(state, action.uid, (e) =>
        e.kind === "text" ? { ...e, ...action.patch, text: (action.patch.text ?? e.text).slice(0, LIMITS.textLength) } : e,
      );
      return withElements(state, next, true);
    }
    case "remove": {
      const next = elements.filter((e) => e.uid !== action.uid);
      return { ...withElements(state, next, true), selected: state.selected === action.uid ? null : state.selected };
    }
    case "select":
      return { ...state, selected: action.uid };
    case "set":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      const stillThere = previous.some((e) => e.uid === state.selected);
      return {
        ...state,
        past: state.past.slice(0, -1),
        draft: { ...state.draft, elements: previous },
        selected: stillThere ? state.selected : null,
      };
    }
    case "load":
      return createEditorState(action.draft);
  }
}
