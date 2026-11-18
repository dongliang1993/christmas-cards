"use client";

import type { ReactNode } from "react";

/**
 * One stage for 信封, 封装 and 寄出 (envelope spec §4 steps 1, 7, 8): the
 * picture on the left (above on phones) and a side panel. The panel keeps its
 * content while it slides away, so the picture grows smoothly on every screen
 * size; the parent decides when it is open.
 */
export function EnvelopeStage({ open, panel, children }: { open: boolean; panel: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="relative min-h-[40%] min-w-0 flex-1 overflow-hidden">{children}</div>
      <aside
        aria-hidden={!open}
        inert={!open}
        className={`shrink-0 overflow-hidden bg-white/95 transition-[width,max-height,border-color] duration-700 ease-in-out lg:max-h-none ${
          open ? "max-h-[60dvh] border-t border-stone-200/80 lg:w-96 lg:border-l lg:border-t-0" : "max-h-0 border-transparent lg:w-0"
        }`}
      >
        <div className="h-full lg:w-96">{panel}</div>
      </aside>
    </div>
  );
}
