import { TEXT_SLOTS, type Face, type Placement, type TextSlot } from "@/lib/letter/model";

export { TEXT_SLOTS };

/** Every slot is on the insert sheet; the left page holds stickers only. */
export const SLOT_FACE: Face = "inside-right";

/** A region of a face, 0..1 of its width and height, origin top-left. */
export interface FaceBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SlotSpec {
  box: FaceBox;
  align: "left" | "right";
  /** Whether the text wraps onto several lines inside the box. */
  multiline: boolean;
  /** Printed before what the sender writes, always in ink ("Dear ", "— "). */
  prefix: string;
  /** Printed after it ("," closing the greeting). */
  suffix: string;
  /** Grey stand-in for the sender's words while the slot is empty (editor only). */
  placeholder: string;
}

/** Where each slot sits (spec §6.1); starting values, tuned by eye. */
export const SLOTS: Record<TextSlot, SlotSpec> = {
  greeting: { box: { x0: 0.1, y0: 0.07, x1: 0.9, y1: 0.17 }, align: "left", multiline: false, prefix: "Dear ", suffix: ",", placeholder: "name" },
  body: { box: { x0: 0.1, y0: 0.24, x1: 0.9, y1: 0.78 }, align: "left", multiline: true, prefix: "", suffix: "", placeholder: "Your letter" },
  signature: { box: { x0: 0.3, y0: 0.83, x1: 0.9, y1: 0.93 }, align: "right", multiline: false, prefix: "— ", suffix: "", placeholder: "your name" },
};

/**
 * What the sender wrote, without the slot's printed prefix and suffix. Text
 * stored before the prefix was printed ("Dear 小雨,", "— 小林") reads the same.
 */
export function slotCore(slot: TextSlot, text: string): string {
  if (slot === "greeting") return text.replace(/^\s*dear\b\s*/i, "").replace(/[\s,，]+$/, "");
  if (slot === "signature") return text.replace(/^\s*[—–-]+\s*/, "").trimEnd();
  return text;
}

/** A slot's text is drawn centred on its box, upright and unscaled. */
export function slotPlacement(slot: TextSlot): Omit<Placement, "z"> {
  const { box } = SLOTS[slot];
  return { face: SLOT_FACE, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, scale: 1, rotation: 0 };
}

/** Tap target around each box, so a short greeting is still easy to hit. */
const HIT_PAD = 0.02;

/** The slot under a point on a face (0..1), or null. */
export function slotAt(face: Face, x: number, y: number): TextSlot | null {
  if (face !== SLOT_FACE) return null;
  for (const slot of TEXT_SLOTS) {
    const { box } = SLOTS[slot];
    if (x >= box.x0 - HIT_PAD && x <= box.x1 + HIT_PAD && y >= box.y0 - HIT_PAD && y <= box.y1 + HIT_PAD) return slot;
  }
  return null;
}
