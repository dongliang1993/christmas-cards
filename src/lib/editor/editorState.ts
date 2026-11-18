import { nanoid } from "nanoid";
import { FIXED_SEAL } from "@/lib/envelope/fixedSeal";
import { LIMITS, type CardElement, type Face, type FontId, type Ink, type LetterDraft, type Placement } from "@/lib/letter/model";
import { TEMPLATE_MAP } from "@/lib/templates";
import type { CardTemplateId } from "@/lib/types";

/** Undo history depth (spec §4.3). */
export const UNDO_DEPTH = 20;

/** An element plus a stable id the editor selects and drags by. */
export type EditorElement = CardElement & { uid: string };

export type EditorDraft = Omit<LetterDraft, "elements"> & { elements: EditorElement[] };

/** One undo step: the elements, and the template if that step changed it. */
interface Snapshot {
  elements: EditorElement[];
  templateId?: CardTemplateId;
}

export interface EditorState {
  draft: EditorDraft;
  selected: string | null;
  /** Earlier snapshots, newest last. */
  past: Snapshot[];
  /** Snapshots undone, newest last; cleared by any new edit. */
  future: Snapshot[];
  /** The inside page new stickers and text land on (spec §13.4). */
  focusFace: Face;
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
  | { type: "duplicate"; uid: string; newUid: string }
  | { type: "remove"; uid: string }
  | { type: "select"; uid: string | null }
  | { type: "set"; patch: Partial<EnvelopeFields> }
  | { type: "set-template"; templateId: CardTemplateId }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "layer"; uid: string; dir: 1 | -1 }
  | { type: "focus-face"; face: Face }
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
    seal: { ...FIXED_SEAL },
    recipientName: "",
    elements: [messageElement(templateId)],
    audioUrl: null,
    audioName: null,
  };
}

export function createEditorState(draft: EditorDraft): EditorState {
  return { draft, selected: null, past: [], future: [], focusFace: "inside-right" };
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
  if (!record) return { ...state, draft: { ...state.draft, elements } };
  const past = [...state.past, { elements: state.draft.elements }].slice(-UNDO_DEPTH);
  return { ...state, past, future: [], draft: { ...state.draft, elements } };
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
      return { ...withElements(state, [...elements, added], true), selected: action.uid, focusFace: action.face };
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
      return { ...withElements(state, [...elements, added], true), selected: action.uid, focusFace: action.face };
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
    case "duplicate": {
      const el = elements.find((e) => e.uid === action.uid);
      if (!el) return state;
      if (countOn(elements, el.kind, el.face) >= (el.kind === "sticker" ? LIMITS.stickersPerFace : LIMITS.textsPerFace)) return state;
      const copy: EditorElement = {
        ...el,
        uid: action.newUid,
        x: clamp(el.x + 0.04, 0, 1),
        y: clamp(el.y + 0.04, 0, 1),
        z: topZ(elements, el.face),
      };
      return { ...withElements(state, [...elements, copy], true), selected: action.newUid, focusFace: el.face };
    }
    case "remove": {
      const next = elements.filter((e) => e.uid !== action.uid);
      return { ...withElements(state, next, true), selected: state.selected === action.uid ? null : state.selected };
    }
    case "select": {
      const face = elements.find((e) => e.uid === action.uid)?.face;
      return { ...state, selected: action.uid, focusFace: face ?? state.focusFace };
    }
    case "focus-face":
      return { ...state, focusFace: action.face };
    case "layer": {
      const el = elements.find((e) => e.uid === action.uid);
      if (!el) return state;
      const stack = elements.filter((e) => e.face === el.face).sort((a, b) => a.z - b.z);
      const i = stack.findIndex((e) => e.uid === el.uid);
      const other = stack[i + action.dir];
      if (!other) return state;
      // Swap places; equal z values get pulled apart so the order is explicit.
      const [lo, hi] = el.z === other.z ? [el.z, el.z + 1] : [Math.min(el.z, other.z), Math.max(el.z, other.z)];
      const next = elements.map((e) =>
        e.uid === el.uid ? { ...e, z: action.dir === 1 ? hi : lo } : e.uid === other.uid ? { ...e, z: action.dir === 1 ? lo : hi } : e,
      );
      return withElements(state, next, true);
    }
    case "set":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "set-template": {
      if (action.templateId === state.draft.templateId) return state;
      // The template only changes the cover; everything the sender placed stays
      // where it is, and the change itself can be undone.
      const past = [...state.past, { elements, templateId: state.draft.templateId }].slice(-UNDO_DEPTH);
      return {
        ...state,
        past,
        future: [],
        selected: null,
        draft: { ...state.draft, templateId: action.templateId },
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      const stillThere = previous.elements.some((e) => e.uid === state.selected);
      return {
        ...state,
        past: state.past.slice(0, -1),
        future: [...state.future, { elements, templateId: previous.templateId && state.draft.templateId }].slice(-UNDO_DEPTH),
        draft: {
          ...state.draft,
          elements: previous.elements,
          ...(previous.templateId ? { templateId: previous.templateId } : {}),
        },
        selected: stillThere ? state.selected : null,
      };
    }
    case "redo": {
      const next = state.future.at(-1);
      if (!next) return state;
      return {
        ...state,
        future: state.future.slice(0, -1),
        past: [...state.past, { elements, templateId: next.templateId && state.draft.templateId }].slice(-UNDO_DEPTH),
        draft: {
          ...state.draft,
          elements: next.elements,
          ...(next.templateId ? { templateId: next.templateId } : {}),
        },
        selected: next.elements.some((e) => e.uid === state.selected) ? state.selected : null,
      };
    }
    case "load":
      return createEditorState(action.draft);
  }
}
