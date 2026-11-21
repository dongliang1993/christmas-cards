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
  /** Grey hint shown in the editor while the slot is empty. */
  hint: string;
}

/** Where each slot sits (spec §6.1); starting values, tuned by eye. */
export const SLOTS: Record<TextSlot, SlotSpec> = {
  greeting: { box: { x0: 0.1, y0: 0.07, x1: 0.9, y1: 0.17 }, align: "left", multiline: false, hint: "Dear 收件人," },
  body: { box: { x0: 0.1, y0: 0.24, x1: 0.9, y1: 0.78 }, align: "left", multiline: true, hint: "写下你想说的话…" },
  signature: { box: { x0: 0.3, y0: 0.83, x1: 0.9, y1: 0.93 }, align: "right", multiline: false, hint: "— 你的名字" },
};

/** A slot's text is drawn centred on its box, upright and unscaled. */
export function slotPlacement(slot: TextSlot): Omit<Placement, "z"> {
  const { box } = SLOTS[slot];
  return { face: SLOT_FACE, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, scale: 1, rotation: 0 };
}
