"use client";

import { useCallback, useEffect, useRef, type Dispatch, type RefObject } from "react";
import type { CardHandle } from "@/components/ChristmasCard3D";
import type { EditorAction } from "@/lib/editor/editorState";

/** After this the element is put exactly on its page. */
const GLIDE_MS = 260;
/** Ease-out time constant: each frame closes 1 - e^(-dt/τ) of the remaining gap. */
const TAU_MS = 55;

/**
 * While a gesture runs, an element may hang over the fold or the card's edge;
 * on release it glides back so the whole of it sits on its page. Each frame
 * asks the reducer to close part of the gap, so it always starts from the
 * gesture's last move even before React has rendered it.
 */
export function useSettleGlide(
  card: RefObject<CardHandle | null>,
  dispatch: Dispatch<EditorAction>,
  /** Called once it has landed on its page. */
  onLanded: () => void,
) {
  const frame = useRef(0);

  const stop = useCallback(() => cancelAnimationFrame(frame.current), []);
  useEffect(() => stop, [stop]);

  const glide = useCallback(
    (uid: string) => {
      stop();
      const start = performance.now();
      let last = start;
      const step = (now: number) => {
        const done = now - start >= GLIDE_MS;
        const amount = done ? 1 : 1 - Math.exp(-Math.max(0, now - last) / TAU_MS);
        last = now;
        dispatch({ type: "settle", uid, shape: card.current?.shapeOf(uid) ?? null, amount });
        if (done) onLanded();
        else frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [card, dispatch, onLanded, stop],
  );

  return { glide, stop };
}
