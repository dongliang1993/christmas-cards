"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { LIMITS, type FontId, type Ink } from "@/lib/letter/model";
import { INK_COLORS } from "@/lib/card/textCanvas";

const FONTS: { id: FontId; label: string; family: string }[] = [
  { id: "hand-en", label: "手写英文", family: "var(--font-caveat)" },
  { id: "hand-zh", label: "手写中文", family: "var(--font-hand-zh)" },
  { id: "serif", label: "衬线", family: 'Georgia, "Songti SC", serif' },
];
const INKS: { id: Ink; label: string }[] = [
  { id: "black", label: "黑墨" },
  { id: "red", label: "红墨" },
  { id: "gold", label: "烫金" },
];

interface Props {
  text: string;
  font: FontId;
  ink: Ink;
  autoFocus: boolean;
  onChange(patch: Partial<{ text: string; font: FontId; ink: Ink }>): void;
  onDelete(): void;
}

/** Editing panel for the selected text: words, face and ink. */
export function TextComposer({ text, font, ink, autoFocus, onChange, onDelete }: Props) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!autoFocus) return;
    // After the pointer sequence that created the text has finished.
    const frame = requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  return (
    <div className="space-y-3 px-4 pb-4">
      <textarea
        ref={area}
        value={text}
        maxLength={LIMITS.textLength}
        rows={3}
        onChange={(e) => onChange({ text: e.target.value })}
        className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-400 focus:bg-white"
        aria-label="文字内容"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange({ font: f.id })}
            aria-pressed={font === f.id}
            className={`rounded-lg px-2.5 py-1 text-sm transition ${font === f.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
            style={{ fontFamily: f.family }}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-stone-200" />
        {INKS.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onChange({ ink: i.id })}
            aria-pressed={ink === i.id}
            aria-label={i.label}
            title={i.label}
            className={`h-7 w-7 rounded-full ring-offset-2 transition ${ink === i.id ? "ring-2 ring-stone-900" : "ring-1 ring-stone-200"}`}
            style={{ background: INK_COLORS[i.id] }}
          />
        ))}
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> 删除
        </button>
      </div>
      <p className="text-[11px] text-stone-400">
        {text.length}/{LIMITS.textLength} · 在卡片上拖动文字可以调整位置
      </p>
    </div>
  );
}
