"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import type { CardHandle } from "@/components/ChristmasCard3D";
import { handleTransform, type Point } from "@/lib/editor/gestures";

interface Props {
  card: RefObject<CardHandle | null>;
  uid: string;
  /** Scale and rotation at the moment a handle drag starts. */
  current: { scale: number; rotation: number };
  onTransform(patch: { scale: number; rotation: number }, record: boolean): void;
  onDelete(): void;
}

/**
 * Dashed outline, a corner handle (scale + rotate) and a delete button for
 * the selected element, kept on it every frame as the card breathes.
 */
export function SelectionOverlay({ card, uid, current, onTransform, onDelete }: Props) {
  const [corners, setCorners] = useState<Point[] | null>(null);
  const drag = useRef<{ centre: Point; from: Point; scale: number; rotation: number; recorded: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setCorners(card.current?.project(uid) ?? null);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [card, uid]);

  if (!corners) return null;
  const [, tr, br] = corners;
  const centre = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };

  const local = (e: React.PointerEvent): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  return (
    <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke="#1c1917"
        strokeOpacity={0.55}
        strokeWidth={1.2}
        strokeDasharray="5 4"
      />
      <circle
        cx={br.x}
        cy={br.y}
        r={10}
        fill="#fff"
        stroke="#1c1917"
        strokeWidth={1.5}
        className="pointer-events-auto cursor-nwse-resize touch-none"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { centre, from: local(e), ...current, recorded: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const t = handleTransform(d.centre, d.from, local(e));
          onTransform({ scale: d.scale * t.scale, rotation: d.rotation + t.rotation }, !d.recorded);
          d.recorded = true;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
      <foreignObject x={tr.x - 14} y={tr.y - 30} width={28} height={28} className="pointer-events-auto">
        <button
          type="button"
          aria-label="删除"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-white shadow"
        >
          <X className="h-4 w-4" />
        </button>
      </foreignObject>
    </svg>
  );
}
