"use client";

import { useState } from "react";
import type { SurfaceImage } from "@/lib/cardRelief";
import { CARD_TEMPLATES } from "@/lib/templates";
import type { CardTemplateId } from "@/lib/types";
import { bakeCardEntries, saveCardBakes } from "./bakeEntries";

interface CardStatus {
  phase: "idle" | "working" | "done" | "error";
  detail?: string;
}

function previewUrl(source: SurfaceImage): string {
  const canvas = document.createElement("canvas");
  const scale = 240 / source.height;
  canvas.width = Math.round(source.width * scale);
  canvas.height = 240;
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * /dev/bake: regenerate a card's prebaked surfaces (baked/*.webp + manifest).
 * Run it after changing the artwork or any bake parameter, then commit the
 * assets. The runtime loads them instead of baking on the main thread.
 */
export function BakeStudio() {
  const [status, setStatus] = useState<Partial<Record<CardTemplateId, CardStatus>>>({});
  const [previews, setPreviews] = useState<Partial<Record<CardTemplateId, string[]>>>({});
  const [busy, setBusy] = useState(false);

  const runOne = async (id: CardTemplateId) => {
    setStatus((s) => ({ ...s, [id]: { phase: "working", detail: "加载图片并烘焙…" } }));
    try {
      const entries = await bakeCardEntries(id);
      setStatus((s) => ({ ...s, [id]: { phase: "working", detail: `已烘焙 ${entries.length} 项，编码保存中…` } }));
      const saved = await saveCardBakes(id, entries);
      setStatus((s) => ({ ...s, [id]: { phase: "done", detail: `${saved.files.length} 个文件 → ${saved.directory}` } }));
      const cover = entries.find((e) => e.task.kind === "cover");
      const normal = cover?.normal;
      const surface = cover?.surface;
      if (normal && surface) {
        const shots = [previewUrl(normal), previewUrl(surface)];
        setPreviews((p) => ({ ...p, [id]: shots }));
      }
    } catch (error) {
      setStatus((s) => ({ ...s, [id]: { phase: "error", detail: error instanceof Error ? error.message : String(error) } }));
    }
  };

  const runAll = async () => {
    setBusy(true);
    // Serial on purpose: each bake is main-thread CPU, one card at a time.
    for (const t of CARD_TEMPLATES) {
      // eslint-disable-next-line no-await-in-loop
      await runOne(t.id);
    }
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-stone-800">
      <h1 className="text-xl font-semibold">离线预烘焙</h1>
      <p className="mt-2 text-sm text-stone-500">
        用与运行时完全相同的管线生成每张卡的浮雕/材质贴图，保存到 <code>public/assets/cards/&lt;id&gt;/baked/</code>。
        换了封面图或调整烘焙参数后重新生成即可；运行时只加载产物，不再占用主线程烘焙。
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={runAll}
        className="mt-5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
      >
        {busy ? "烘焙中…" : "全部烘焙并保存"}
      </button>

      <ul className="mt-8 space-y-4">
        {CARD_TEMPLATES.map((t) => {
          const s = status[t.id];
          const shots = previews[t.id];
          return (
            <li key={t.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-medium">{t.id}</div>
                  <div
                    className={`mt-1 break-all text-xs ${
                      s?.phase === "error" ? "text-red-600" : s?.phase === "done" ? "text-green-700" : "text-stone-500"
                    }`}
                  >
                    {s?.detail ?? "未烘焙"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || s?.phase === "working"}
                  onClick={() => runOne(t.id)}
                  className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 disabled:opacity-40"
                >
                  {s?.phase === "working" ? "处理中…" : s?.phase === "done" ? "重新生成" : "烘焙并保存"}
                </button>
              </div>
              {shots && (
                <div className="mt-3 flex gap-3">
                  {shots.map((src, i) => (
                    <figure key={src.slice(-24)} className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={i === 0 ? "cover normal" : "cover surface"} className="rounded border border-stone-200" />
                      <figcaption className="mt-1 text-[10px] text-stone-400">{i === 0 ? "cover-normal" : "cover-surface"}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
