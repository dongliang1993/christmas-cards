"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type React from "react";
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

/** Measures text in the slot's face, like the card draws it. */
function useMeasure(font: FontId): (text: string, px: number) => number {
  return useMemo(() => {
    const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    return (text: string, px: number) => {
      if (!ctx) return text.length * px * 0.6;
      ctx.font = `500 ${px}px ${fontFamily(font)}`;
      return ctx.measureText(text).width;
    };
  }, [font]);
}

/**
 * Writing straight onto the card (spec §6.2): the sender types where the grey
 * placeholder sits, in the slot's own hand and size, with no frame around it.
 * "Dear " and "— " are printed and cannot be edited. The card hides that
 * slot's drawn text while this is open.
 */
export function SlotEditor({ card, slot, text, font, onChange, onDone }: Props) {
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const rect = useSlotRect(card, slot);
  const measure = useMeasure(font);
  const { box, align, multiline, prefix, suffix, placeholder } = SLOTS[slot];
  const limit = multiline ? LIMITS.textLength : LIMITS.slotLineLength;
  const shown = prefix + (text || placeholder) + suffix;
  const scale = useMemo(() => {
    const frame = FACE_FRAMES[SLOT_FACE];
    return layoutSlotText(shown, slot, { measure: (l) => measure(l, 100) / 100, faceAspect: frame.width / frame.height }).fontScale;
  }, [shown, slot, measure]);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el || !rect || document.activeElement === el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [rect, slot]);

  if (!rect) return null;
  const fontPx = (rect.height / (box.y1 - box.y0)) * SLOT_FONT_FRACTION[slot] * scale;
  const type: React.CSSProperties = {
    fontFamily: fontFamily(font),
    fontWeight: 500,
    fontSize: fontPx,
    lineHeight: SLOT_LINE_HEIGHT,
    color: INK_COLORS.black,
    caretColor: CARET,
  };
  const common = {
    value: text,
    maxLength: limit,
    spellCheck: false,
    placeholder,
    "aria-label": placeholder,
    onBlur: onDone,
    className: "border-0 bg-transparent p-0 outline-none placeholder:text-stone-400/80",
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || (!multiline && e.key === "Enter" && !e.nativeEvent.isComposing)) {
      e.preventDefault();
      onDone();
    }
  };

  if (multiline) {
    return (
      <textarea
        ref={field}
        data-slot-editor
        {...common}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={keyDown}
        className={`${common.className} absolute resize-none overflow-hidden`}
        style={{ ...type, left: rect.left, top: rect.top, width: rect.width, height: rect.height, textAlign: align, whiteSpace: "pre-wrap" }}
      />
    );
  }
  const fieldWidth = Math.ceil(measure(text || placeholder, fontPx)) + 3;
  return (
    <div
      data-slot-editor
      // A click on "Dear " or beside the name still writes the name.
      onMouseDown={(e) => {
        if (e.target !== field.current) {
          e.preventDefault();
          field.current?.focus();
        }
      }}
      className={`absolute flex items-center whitespace-nowrap ${align === "right" ? "justify-end" : "justify-start"}`}
      style={{ ...type, left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      {prefix && <span>{prefix.replace(/ $/, "\u00a0")}</span>}
      <input
        ref={field}
        {...common}
        onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, " "))}
        onKeyDown={keyDown}
        style={{ ...type, width: fieldWidth, minWidth: 0 }}
      />
      {suffix && <span style={{ color: text ? INK_COLORS.black : "rgb(168 162 158 / 0.8)" }}>{suffix}</span>}
    </div>
  );
}
