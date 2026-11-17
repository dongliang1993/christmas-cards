"use client";

import type { Dispatch, ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { PAPER_STOCKS } from "@/lib/card/paperStocks";
import type { EditorAction, EditorElement, EditorState } from "@/lib/editor/editorState";
import { LIMITS, PAPER_STOCK_IDS, type FontId, type Ink } from "@/lib/letter/model";
import { CARD_TEMPLATES } from "@/lib/templates";
import type { CardTemplateId } from "@/lib/types";
import { StickerTray } from "./StickerTray";
import { TextComposer } from "./TextComposer";

export type Tool = "style" | "stickers" | "text" | "paper";

export const TOOL_LABELS: Record<Tool, string> = { style: "款式", stickers: "贴纸", text: "文字", paper: "纸张" };

interface Props {
  tool: Tool;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  freshText: string | null;
  onAddSticker(id: string, at?: { clientX: number; clientY: number }): void;
  onAddText(preset: { text: string; font: FontId; ink: Ink }): void;
  onTemplate(id: CardTemplateId): void;
}

const TEXT_PRESETS: { label: string; text: string; font: FontId; ink: Ink }[] = [
  { label: "圣诞快乐", text: "圣诞快乐", font: "hand-zh", ink: "red" },
  { label: "Merry Christmas", text: "Merry Christmas", font: "hand-en", ink: "gold" },
  { label: "落款", text: "— 你的名字", font: "serif", ink: "black" },
];

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] text-stone-400">{hint}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function StickerProps({ el, dispatch }: { el: EditorElement; dispatch: Dispatch<EditorAction> }) {
  const deg = Math.round((el.rotation * 180) / Math.PI);
  const set = (patch: { scale?: number; rotation?: number }) =>
    dispatch({ type: "transform", uid: el.uid, patch, record: true });
  return (
    <Section title="贴纸" hint="也可以直接在卡片上拖动、拉角上的手柄">
      <div className="space-y-4 px-4 pb-4">
        <label className="block text-xs text-stone-600">
          大小 · {Math.round(el.scale * 100)}%
          <input
            type="range"
            min={LIMITS.minScale}
            max={LIMITS.maxScale}
            step={0.05}
            value={el.scale}
            onChange={(e) => set({ scale: Number(e.target.value) })}
            className="mt-1 w-full accent-stone-900"
          />
        </label>
        <label className="block text-xs text-stone-600">
          旋转 · {deg}°
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={deg}
            onChange={(e) => set({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
            className="mt-1 w-full accent-stone-900"
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => dispatch({ type: "layer", uid: el.uid, dir: 1 })} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-stone-100 py-2 text-xs text-stone-700 hover:bg-stone-200">
            <ArrowUp className="h-3.5 w-3.5" /> 上移一层
          </button>
          <button type="button" onClick={() => dispatch({ type: "layer", uid: el.uid, dir: -1 })} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-stone-100 py-2 text-xs text-stone-700 hover:bg-stone-200">
            <ArrowDown className="h-3.5 w-3.5" /> 下移一层
          </button>
        </div>
        <button type="button" onClick={() => dispatch({ type: "remove", uid: el.uid })} className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs text-stone-500 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" /> 删除贴纸
        </button>
      </div>
    </Section>
  );
}

/** Right-hand panel: follows what the sender is doing (spec §13.2). */
export function ContextPanel({ tool, state, dispatch, freshText, onAddSticker, onAddText, onTemplate }: Props) {
  const selected = state.draft.elements.find((e) => e.uid === state.selected) ?? null;
  if (selected?.kind === "text") {
    return (
      <Section title="文字">
        <TextComposer
          text={selected.text}
          font={selected.font}
          ink={selected.ink}
          autoFocus={freshText === selected.uid}
          onChange={(patch) => dispatch({ type: "update-text", uid: selected.uid, patch })}
          onDelete={() => dispatch({ type: "remove", uid: selected.uid })}
        />
      </Section>
    );
  }
  if (selected?.kind === "sticker") return <StickerProps el={selected} dispatch={dispatch} />;

  const page = state.focusFace === "inside-left" ? "左页" : "右页";
  switch (tool) {
    case "style":
      return (
        <Section title="款式" hint="换封面插画，内页的内容会保留">
          <ul className="space-y-2 px-3 pb-4">
            {CARD_TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={state.draft.templateId === t.id}
                  onClick={() => onTemplate(t.id)}
                  className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${state.draft.templateId === t.id ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={CARD_ASSETS[t.id].coverSrc} alt="" className="h-14 w-10 rounded object-cover shadow-sm" />
                  <span>
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className={`block text-[11px] ${state.draft.templateId === t.id ? "text-stone-300" : "text-stone-500"}`}>{t.subtitle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      );
    case "stickers":
      return (
        <Section title="贴纸" hint={`点一下放到${page}，或者拖到卡片上`}>
          <StickerTray onTap={(id) => onAddSticker(id)} onDrop={(id, clientX, clientY) => onAddSticker(id, { clientX, clientY })} />
        </Section>
      );
    case "text":
      return (
        <Section title="文字" hint={`会放到${page}中央，之后可以拖动`}>
          <div className="space-y-2 px-4 pb-4">
            <button type="button" onClick={() => onAddText({ text: "写点什么", font: "hand-zh", ink: "black" })} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> 加一段文字
            </button>
            <p className="pt-2 text-[11px] text-stone-400">常用</p>
            {TEXT_PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => onAddText(p)} className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50">
                {p.label}
              </button>
            ))}
          </div>
        </Section>
      );
    case "paper":
      return (
        <Section title="纸张" hint="改变内页和纸边的质感">
          <ul className="space-y-2 px-3 pb-4">
            {PAPER_STOCK_IDS.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  aria-pressed={state.draft.paper === p}
                  onClick={() => dispatch({ type: "set", patch: { paper: p } })}
                  className={`flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm ${state.draft.paper === p ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
                >
                  <span className="h-9 w-9 rounded-lg ring-1 ring-stone-200" style={{ background: PAPER_STOCKS[p].tint }} />
                  {PAPER_STOCKS[p].label}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      );
  }
}
