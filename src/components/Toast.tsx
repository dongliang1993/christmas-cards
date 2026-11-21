"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";

export interface ToastMessage {
  text: string;
  tone: "ok" | "error";
}

/** One short message at a time; a new one replaces the old and restarts the timer. */
export function useToast(durationMs = 1800) {
  const [toast, setToast] = useState<(ToastMessage & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (message: ToastMessage) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ ...message, id: Date.now() });
      timer.current = setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { toast, show };
}

/** A pill at the bottom centre, announced to screen readers. */
export function Toast({ toast }: { toast: (ToastMessage & { id: number }) | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg motion-safe:animate-[toast-in_180ms_ease-out]"
        >
          {toast.tone === "ok" ? <Check className="h-4 w-4 text-emerald-300" /> : <CircleAlert className="h-4 w-4 text-amber-300" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
