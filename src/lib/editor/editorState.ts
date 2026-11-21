import { nanoid } from "nanoid";
import { FIXED_SEAL } from "@/lib/envelope/fixedSeal";
import { SLOTS, slotPlacement, TEXT_SLOTS } from "@/lib/card/slots";
import { LIMITS, type CardElement, type Face, type FontId, type Ink, type LetterDraft, type Placement, type TextSlot } from "@/lib/letter/model";
import { TEMPLATE_MAP } from "@/lib/templates";
import { greetingFor, nameFromGreeting } from "./greeting";
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
  | { type: "set-slot-text"; slot: TextSlot; text: string }
  | { type: "set-slot-font"; slot: TextSlot; font: FontId }
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

/** The greeting a card starts with; the name after it is the sender's to write. */
export const GREETING_PREFIX = "Dear ";

function fontFor(text: string): FontId {
  return /[㐀-鿿]/.test(text) ? "hand-zh" : "hand-en";
}

/** New text is written in the hand that suits the template's language. */
function defaultFont(templateId: CardTemplateId): FontId {
  return fontFor(TEMPLATE_MAP[templateId].defaultMessage);
}

type SlotElement = Extract<EditorElement, { kind: "text" }> & { slot: TextSlot };

function slotElement(elements: EditorElement[], slot: TextSlot): SlotElement | undefined {
  return elements.find((e): e is SlotElement => e.kind === "text" && e.slot === slot);
}

function newSlotElement(slot: TextSlot, text: string, font: FontId): SlotElement {
  return { kind: "text", slot, text, font, ink: "black", uid: nanoid(8), ...slotPlacement(slot), z: 0 };
}

export function slotText(draft: Pick<EditorDraft, "elements">, slot: TextSlot): string {
  return slotElement(draft.elements, slot)?.text ?? "";
}

export function slotFont(draft: Pick<EditorDraft, "elements" | "templateId">, slot: TextSlot): FontId {
  return slotElement(draft.elements, slot)?.font ?? defaultFont(draft.templateId);
}

/** A slot with nothing of the sender's in it: empty, or a greeting that is only "Dear". */
export function isBlankSlot(slot: TextSlot, text: string): boolean {
  const t = text.trim();
  return t === "" || (slot === "greeting" && /^dear[\s,，]*$/i.test(t));
}

const slotLimit = (slot: TextSlot) => (SLOTS[slot].multiline ? LIMITS.textLength : LIMITS.slotLineLength);

/** Set a slot's text or font, creating its element on first use. */
function writeSlot(draft: EditorDraft, slot: TextSlot, patch: { text?: string; font?: FontId }): EditorElement[] {
  const existing = slotElement(draft.elements, slot);
  const text = patch.text === undefined ? undefined : patch.text.slice(0, slotLimit(slot));
  if (existing) {
    return draft.elements.map((e) =>
      e === existing ? { ...existing, ...(text === undefined ? {} : { text }), ...(patch.font ? { font: patch.font } : {}) } : e,
    );
  }
  return [...draft.elements, newSlotElement(slot, text ?? "", patch.font ?? defaultFont(draft.templateId))];
}

/** The card as the editor draws it: empty slots get a grey hint (never sent). */
export function displayElements(draft: Pick<EditorDraft, "elements" | "templateId">): (EditorElement & { hint?: boolean })[] {
  const shown = draft.elements.filter((e) => !(e.kind === "text" && e.slot && isBlankSlot(e.slot, e.text)));
  const hints = TEXT_SLOTS.filter((slot) => isBlankSlot(slot, slotText(draft, slot))).map((slot) => ({
    ...newSlotElement(slot, SLOTS[slot].hint, slotFont(draft, slot)),
    uid: `hint-${slot}`,
    hint: true,
  }));
  return [...shown, ...hints];
}

/**
 * Bring a stored draft onto the slots (spec §7): the first free text on the
 * right page becomes the body, other free text is dropped (a local draft
 * only — sent letters are untouched), and the greeting gets its "Dear " back
 * since a bare greeting is never saved.
 */
export function migrateDraftText(draft: EditorDraft): EditorDraft {
  const firstFree = draft.elements.find((e) => e.kind === "text" && !e.slot && e.face === "inside-right");
  let elements = draft.elements.filter((e) => e.kind !== "text" || e.slot !== undefined);
  if (firstFree?.kind === "text" && !slotElement(elements, "body")) {
    elements = [...elements, { ...newSlotElement("body", firstFree.text.slice(0, LIMITS.textLength), firstFree.font), uid: firstFree.uid }];
  }
  const greeting = slotElement(elements, "greeting");
  const fromRecipient = draft.recipientName.trim() ? greetingFor(draft.recipientName) : GREETING_PREFIX;
  if (!greeting) {
    elements = [...elements, newSlotElement("greeting", fromRecipient, defaultFont(draft.templateId))];
  } else if (isBlankSlot("greeting", greeting.text)) {
    elements = elements.map((e) => (e === greeting ? { ...greeting, text: fromRecipient } : e));
  }
  const migrated = { ...draft, elements, envelopeColor: "ivory" as const };
  return { ...migrated, recipientName: nameFromGreeting(slotText(migrated, "greeting")) };
}

export function createInitialDraft(templateId: CardTemplateId): EditorDraft {
  return {
    templateId,
    paper: "cold-press",
    envelopeColor: "ivory",
    seal: { ...FIXED_SEAL },
    recipientName: "",
    elements: [newSlotElement("greeting", GREETING_PREFIX, defaultFont(templateId))],
    audioUrl: null,
    audioName: null,
  };
}

export function createEditorState(draft: EditorDraft): EditorState {
  return { draft, selected: null, past: [], future: [], focusFace: "inside-right" };
}

/** The draft as the API and storage see it, without editor ids. */
export function toLetterDraft(draft: EditorDraft): LetterDraft {
  const kept = draft.elements.filter((e) => !(e.kind === "text" && e.slot && isBlankSlot(e.slot, e.text)));
  return { ...draft, elements: kept.map(({ uid: _uid, ...element }) => element as CardElement) };
}

export function withEditorIds(draft: LetterDraft): EditorDraft {
  return { ...draft, elements: draft.elements.map((e) => ({ ...e, uid: nanoid(8) })) };
}

/**
 * "复制一封" (spec §4.8): same paper, stickers, seal, timing and signature;
 * the recipient, the greeting's name and the body start over.
 */
export function duplicateDraft(draft: EditorDraft): EditorDraft {
  const elements = draft.elements
    .filter((e) => !(e.kind === "text" && e.slot === "body"))
    .map((e) => ({ ...e, uid: nanoid(8), ...(e.kind === "text" && e.slot === "greeting" ? { text: GREETING_PREFIX } : {}) }));
  return { ...draft, recipientName: "", elements };
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

/** Slots stay where they are: no dragging, copying or restacking. */
function isSlot(elements: EditorElement[], uid: string): boolean {
  return elements.some((e) => e.uid === uid && e.kind === "text" && e.slot !== undefined);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const next = reduce(state, action);
  // The recipient is the name in the greeting (spec §6.4): there is no other place to write it.
  const recipientName = nameFromGreeting(slotText(next.draft, "greeting"));
  return recipientName === next.draft.recipientName ? next : { ...next, draft: { ...next.draft, recipientName } };
}

function reduce(state: EditorState, action: EditorAction): EditorState {
  const elements = state.draft.elements;
  if ((action.type === "transform" || action.type === "duplicate" || action.type === "layer") && isSlot(elements, action.uid)) {
    return state;
  }
  switch (action.type) {
    case "set-slot-text":
      return withElements(state, writeSlot(state.draft, action.slot, { text: action.text }), true);
    case "set-slot-font":
      return withElements(state, writeSlot(state.draft, action.slot, { font: action.font }), true);
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
