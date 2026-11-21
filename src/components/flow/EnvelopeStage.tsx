"use client";

import type { ReactNode } from "react";

/**
 * One stage for 封装 and 寄出 (envelope spec §4 steps 7, 8): the picture and a
 * side panel. On desktop the picture keeps its full size while the panel
 * slides in over the right and the picture glides left by half the panel's
 * width, so the envelope ends up centred in the space left without its canvas
 * ever resizing (a resizing canvas clears and re-fits every frame, which read
 * as the envelope being redrawn). On phones the panel rises from below.
 */
export function EnvelopeStage({ open, panel, children }: { open: boolean; panel: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col lg:relative lg:block lg:overflow-hidden">
      <div
        className={`relative min-h-[40%] min-w-0 flex-1 overflow-hidden lg:absolute lg:inset-0 lg:transition-transform lg:duration-700 lg:ease-in-out ${
          open ? "lg:-translate-x-48" : ""
        }`}
      >
        {children}
      </div>
      <aside
        aria-hidden={!open}
        inert={!open}
        className={`shrink-0 overflow-hidden bg-white/95 transition-[max-height,transform,border-color] duration-700 ease-in-out lg:absolute lg:inset-y-0 lg:right-0 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0 ${
          open
            ? "max-h-[60dvh] border-t border-stone-200/80 lg:translate-x-0"
            : "max-h-0 border-transparent lg:translate-x-full"
        }`}
      >
        <div className="h-full lg:w-96">{panel}</div>
      </aside>
    </div>
  );
}
