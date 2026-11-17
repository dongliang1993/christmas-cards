"use client";

import { useMemo, useState } from "react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import type { LayerElement } from "@/lib/card/elementMeshes";
import { PAPER_STOCK_IDS, type PaperStock } from "@/lib/letter/model";

const ELEMENTS: LayerElement[] = [
  { uid: "star", kind: "sticker", stickerId: "star-gold", face: "inside-left", x: 0.3, y: 0.25, scale: 1, rotation: -0.2, z: 0 },
  { uid: "ginger", kind: "sticker", stickerId: "gingerbread", face: "inside-left", x: 0.65, y: 0.7, scale: 1.1, rotation: 0.25, z: 1 },
  { uid: "zh", kind: "text", text: "圣诞快乐", font: "hand-zh", ink: "red", face: "inside-left", x: 0.5, y: 0.47, scale: 1.2, rotation: 0, z: 2 },
  { uid: "msg", kind: "text", text: "Snow outside,\nwarm inside,\nthinking of you.", font: "hand-en", ink: "black", face: "inside-right", x: 0.5, y: 0.34, scale: 1, rotation: 0, z: 0 },
  { uid: "tree", kind: "sticker", stickerId: "pine-tree", face: "inside-right", x: 0.5, y: 0.74, scale: 0.9, rotation: 0, z: 1 },
  { uid: "gold", kind: "text", text: "— Leon", font: "serif", ink: "gold", face: "inside-right", x: 0.7, y: 0.55, scale: 0.9, rotation: 0, z: 2 },
];

export function ElementsPreview() {
  const [open, setOpen] = useState(true);
  const [paper, setPaper] = useState<PaperStock>("cold-press");
  const elements = useMemo(() => ELEMENTS, []);
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9]">
      <ChristmasCard3D
        templateId="first-snow"
        message=""
        signature=""
        isOpen={open}
        isPaused={false}
        elements={elements}
        paper={paper}
        onToggleOpen={() => setOpen((v) => !v)}
      />
      <div className="absolute left-4 top-4 flex gap-2">
        {PAPER_STOCK_IDS.map((id) => (
          <button key={id} type="button" onClick={() => setPaper(id)} className="rounded-lg bg-white px-3 py-1.5 text-xs shadow">
            {id}
          </button>
        ))}
      </div>
    </main>
  );
}
