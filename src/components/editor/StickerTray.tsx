"use client";

import { useEffect, useRef, useState } from "react";
import { loadStickerManifest } from "@/lib/stickers/stickerSurface";
import type { StickerEntry } from "@/lib/stickers/stickerManifest";

interface Props {
  /** Tap: drop the sticker in the middle of the current page. */
  onTap(id: string): void;
  /** Drag released at a screen point (desktop). */
  onDrop(id: string, clientX: number, clientY: number): void;
}

const DRAG_THRESHOLD = 6;

export function StickerTray({ onTap, onDrop }: Props) {
  const [stickers, setStickers] = useState<StickerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number } | null>(null);
  const press = useRef<{ id: string; src: string; x: number; y: number; dragging: boolean } | null>(null);

  useEffect(() => {
    loadStickerManifest()
      .then((m) => setStickers(m.stickers))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "贴纸加载失败"));
  }, []);

  if (error) return <p className="px-4 py-3 text-xs text-red-600">{error}</p>;

  return (
    <div className="grid grid-cols-3 gap-2 px-3 pb-4" role="listbox" aria-label="贴纸">
      {stickers.map((s) => (
        <button
          key={s.id}
          type="button"
          title={s.label}
          aria-label={`添加贴纸：${s.label}`}
          className="aspect-square w-full touch-none rounded-xl bg-stone-50 p-1.5 ring-1 ring-stone-200 transition hover:bg-stone-100"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press.current = { id: s.id, src: s.src, x: e.clientX, y: e.clientY, dragging: false };
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (!p) return;
            if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) p.dragging = true;
            if (p.dragging) setGhost({ src: p.src, x: e.clientX, y: e.clientY });
          }}
          onPointerUp={(e) => {
            const p = press.current;
            press.current = null;
            setGhost(null);
            if (!p) return;
            if (p.dragging) onDrop(p.id, e.clientX, e.clientY);
            else onTap(p.id);
          }}
          onPointerCancel={() => {
            press.current = null;
            setGhost(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt="" className="h-full w-full object-contain" draggable={false} />
        </button>
      ))}
      {ghost && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ghost.src}
          alt=""
          className="pointer-events-none fixed z-50 h-24 w-24 -translate-x-1/2 -translate-y-1/2 object-contain opacity-90 drop-shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
        />
      )}
    </div>
  );
}
