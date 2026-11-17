"use client";

import { useMemo, useState } from "react";
import { EnvelopeScene, type EnvelopeMode } from "@/components/envelope/EnvelopeScene";
import type { Seal } from "@/lib/letter/model";

export function EnvelopePreview() {
  const [mode, setMode] = useState<EnvelopeMode>("seal");
  const [log, setLog] = useState<string[]>([]);
  const seal = useMemo<Seal>(() => ({ color: "red", stamp: "snowflake" }), []);
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9]">
      <EnvelopeScene
        key={mode}
        mode={mode}
        envelopeColor="ivory"
        seal={seal}
        recipientName="小雪"
        coverSrc="/assets/cards/first-snow/cover.png"
        postmark={mode === "transit" ? "在路上 · 12月24日送达" : null}
        onSealed={() => setLog((l) => [...l, "sealed"])}
        onOpened={() => setLog((l) => [...l, "opened"])}
      />
      <div className="absolute left-4 top-4 flex gap-2">
        {(["seal", "transit", "open"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className="rounded-lg bg-white px-3 py-1.5 text-xs shadow">
            {m}
          </button>
        ))}
        <span data-testid="log" className="px-2 py-1.5 text-xs text-stone-500">{log.join(",")}</span>
      </div>
    </main>
  );
}
