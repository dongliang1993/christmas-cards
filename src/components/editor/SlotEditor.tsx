"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type React from "react";
import type { CardHandle } from "@/components/ChristmasCard3D";
import { SLOT_FACE, SLOTS } from "@/lib/card/slots";
import { layoutSlotText, SLOT_FONT_FRACTION, SLOT_LINE_HEIGHT } from "@/lib/card/slotText";
import { slotFontFamily } from "@/lib/card/textCanvas";
import { FACE_FRAMES } from "@/lib/card/elementLayout";
import { LIMITS, type FontId, type TextSlot } from "@/lib/letter/model";

/** The caret: a warm nib on the paper (spec §8 signature detail). */
const CARET = "#c2410c";
/**
 * Ink and hint as they come out on the lit paper (sampled from the rendered
 * card), so the field reads the same as the drawn text it stands in for.
 */
const FIELD_INK = "rgb(75 66 60)";
const FIELD_HINT = "rgb(205 197 189)";

type Pt = { x: number; y: number };

interface Quad {
  /** The box's own size on screen (top edge, left edge), before the perspective warp. */
  w: number;
  h: number;
  /** CSS matrix3d that lays a w×h box exactly onto the projected corners. */
  transform: string;
}

interface Props {
  card: RefObject<CardHandle | null>;
  slot: TextSlot;
  text: string;
  font: FontId;
  /** The slot being written in: it takes the caret and the pointer. */
  active: boolean;
  onChange(text: string): void;
  onDone(): void;
}

/**
 * The projective map from a w×h box onto four screen corners (tl, tr, br, bl),
 * so the field sits on the page with the page's own perspective.
 */
function quadTransform([p0, p1, p2, p3]: Pt[], w: number, h: number): string {
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, k = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + k * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + k * p3.y, f = p0.y;
  return `matrix3d(${[a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, c, f, 0, 1].join(",")})`;
}

/** Follow the slot's corners on screen while the card settles or the view zooms. */
function measureQuad(card: RefObject<CardHandle | null>, slot: TextSlot): (Quad & { key: string }) | null {
  const pts = card.current?.projectFace(SLOT_FACE, SLOTS[slot].box);
  if (!pts) return null;
  const w = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const h = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  return { w, h, transform: quadTransform(pts, w, h), key: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") };
}

function useSlotQuad(card: RefObject<CardHandle | null>, slot: TextSlot): Quad | null {
  // Measured during the first render, so the field is there in the same frame
  // the card stops drawing the slot: no blank frame in between.
  const [quad, setQuad] = useState(() => measureQuad(card, slot));
  useEffect(() => {
    let frame = 0;
    let last = quad?.key ?? "";
    const tick = () => {
      const next = measureQuad(card, slot);
      if (next && next.key !== last) {
        last = next.key;
        setQuad(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [card, slot]);
  return quad;
}

/** Measures text in the slot's face, exactly as the card draws it. */
function useMeasure(font: FontId): (text: string, px: number) => number {
  return useMemo(() => {
    const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    return (text: string, px: number) => {
      if (!ctx) return text.length * px * 0.6;
      ctx.font = `500 ${px}px ${slotFontFamily(font)}`;
      return ctx.measureText(text).width;
    };
  }, [font]);
}

/**
 * One text slot on the card while editing (spec §6.2): always drawn by the
 * page, laid onto the card in its perspective, so taking the caret changes
 * nothing on screen. The sender types where the grey placeholder sits;
 * "Dear " and "— " are printed and cannot be edited.
 */
export function SlotEditor({ card, slot, text, font, active, onChange, onDone }: Props) {
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const quad = useSlotQuad(card, slot);
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
    if (!active || !el || !quad || document.activeElement === el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [active, quad, slot]);

  if (!quad) return null;
  const fontPx = (quad.h / (box.y1 - box.y0)) * SLOT_FONT_FRACTION[slot] * scale;
  const type: React.CSSProperties = {
    fontFamily: slotFontFamily(font),
    fontWeight: 500,
    fontSize: fontPx,
    lineHeight: SLOT_LINE_HEIGHT,
    color: FIELD_INK,
    caretColor: CARET,
  };
  const frame: React.CSSProperties & Record<"--hint", string> = {
    ...type,
    position: "absolute",
    left: 0,
    top: 0,
    width: quad.w,
    height: quad.h,
    transform: quad.transform,
    transformOrigin: "0 0",
    // Idle slots let taps through to the card, so a sticker on top of one
    // still wins; the card's own hit test then opens the slot.
    pointerEvents: active ? undefined : "none",
    "--hint": FIELD_HINT,
  };
  const common = {
    value: text,
    maxLength: limit,
    spellCheck: false,
    placeholder,
    "aria-label": placeholder,
    tabIndex: active ? undefined : -1,
    onBlur: () => active && onDone(),
    className: "m-0 border-0 bg-transparent p-0 outline-none placeholder:[color:var(--hint)]",
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
        className={`${common.className} resize-none overflow-hidden`}
        style={{ ...frame, textAlign: align, whiteSpace: "pre-wrap" }}
      />
    );
  }
  const fieldWidth = Math.ceil(measure(text || placeholder, fontPx)) + 2;
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
      className={`flex items-center whitespace-nowrap ${align === "right" ? "justify-end" : "justify-start"}`}
      style={frame}
    >
      {prefix && <span style={{ whiteSpace: "pre" }}>{prefix}</span>}
      <input
        ref={field}
        {...common}
        onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, " "))}
        onKeyDown={keyDown}
        style={{ ...type, width: fieldWidth, minWidth: 0, height: "100%" }}
      />
      {suffix && <span style={{ color: text ? FIELD_INK : FIELD_HINT }}>{suffix}</span>}
    </div>
  );
}
