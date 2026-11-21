"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { CardHandle } from "@/components/ChristmasCard3D";
import { SLOT_FACE, SLOTS } from "@/lib/card/slots";
import { layoutSlotText, SLOT_FONT_FRACTION, SLOT_LINE_HEIGHT } from "@/lib/card/slotText";
import { fontFamily, INK_COLORS } from "@/lib/card/textCanvas";
import { FACE_FRAMES } from "@/lib/card/elementLayout";
import { LIMITS, type FontId, type TextSlot } from "@/lib/letter/model";

/** The caret: a warm nib on the paper (spec §8 signature detail). */
const CARET = "#c2410c";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  card: RefObject<CardHandle | null>;
  slot: TextSlot;
  text: string;
  font: FontId;
  onChange(text: string): void;
  onDone(): void;
}

/** Follow the slot's box on screen while the card settles or the view zooms. */
function useSlotRect(card: RefObject<CardHandle | null>, slot: TextSlot): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const pts = card.current?.projectFace(SLOT_FACE, SLOTS[slot].box);
      if (pts) {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const next = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        setRect((prev) =>
          prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.width - next.width) < 0.5 ? prev : next,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [card, slot]);
  return rect;
}

/** The share of the slot's starting size the text fits at, measured like the card draws it. */
function useFontScale(slot: TextSlot, text: string, font: FontId): number {
  return useMemo(() => {
    if (typeof document === "undefined") return 1;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return 1;
    ctx.font = `500 100px ${fontFamily(font)}`;
    const frame = FACE_FRAMES[SLOT_FACE];
    return layoutSlotText(text, slot, { measure: (l) => ctx.measureText(l).width / 100, faceAspect: frame.width / frame.height }).fontScale;
  }, [slot, text, font]);
}

/**
 * Writing straight onto the card (spec §6.2): a borderless field laid over the
 * slot's box, in the slot's own hand and size, so typing looks like the page.
 * The card hides that slot's drawn text while this is open.
 */
export function SlotEditor({ card, slot, text, font, onChange, onDone }: Props) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const rect = useSlotRect(card, slot);
  const scale = useFontScale(slot, text, font);
  const { box, align, multiline, hint } = SLOTS[slot];
  const limit = multiline ? LIMITS.textLength : LIMITS.slotLineLength;

  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !rect) return;
    if (document.activeElement !== el) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [rect, slot]);

  if (!rect) return null;
  const fontPx = (rect.height / (box.y1 - box.y0)) * SLOT_FONT_FRACTION[slot] * scale;
  const lineH = fontPx * SLOT_LINE_HEIGHT;
  return (
    <textarea
      ref={area}
      data-slot-editor
      aria-label={hint}
      placeholder={hint}
      value={text}
      maxLength={limit}
      spellCheck={false}
      onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\r?\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (!multiline && e.key === "Enter" && !e.nativeEvent.isComposing)) {
          e.preventDefault();
          onDone();
        }
      }}
      onBlur={onDone}
      className="absolute resize-none overflow-hidden rounded-sm bg-transparent p-0 outline-dashed outline-1 outline-offset-4 outline-stone-400/70 placeholder:text-stone-400/80"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        paddingTop: multiline ? 0 : Math.max(0, (rect.height - lineH) / 2),
        fontFamily: fontFamily(font),
        fontWeight: 500,
        fontSize: fontPx,
        lineHeight: SLOT_LINE_HEIGHT,
        textAlign: align,
        color: INK_COLORS.black,
        caretColor: CARET,
        whiteSpace: multiline ? "pre-wrap" : "nowrap",
      }}
    />
  );
}
