"use client";

import type { DeliveryChoice } from "@/lib/letter/model";
import { DeliveryDatePicker } from "./DeliveryDatePicker";

const OPTIONS: { kind: DeliveryChoice["kind"]; label: string }[] = [
  { kind: "now", label: "立刻送达" },
  { kind: "christmas-eve", label: "平安夜 12/24" },
  { kind: "christmas", label: "圣诞节 12/25" },
  { kind: "date", label: "自选日期" },
];

interface Props {
  recipientName: string;
  delivery: DeliveryChoice;
  sending: boolean;
  error: string | null;
  onDelivery(choice: DeliveryChoice): void;
  onSend(): void;
}

/** Confirm who gets it and when, then send (spec §4.6, P1-07). */
export function SendPanel({ recipientName, delivery, sending, error, onDelivery, onSend }: Props) {
  const today = new Date().toLocaleDateString("en-CA");
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <div>
        <h2 className="text-base font-semibold text-stone-900">寄给 {recipientName || "…"}</h2>
        <p className="mt-1 text-xs text-stone-500">信封已经封好。选好什么时候送到，再寄出。</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-stone-600">什么时候送到</legend>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.map((d) => (
            <button
              key={d.kind}
              type="button"
              aria-pressed={delivery.kind === d.kind}
              onClick={() => onDelivery(d.kind === "date" ? { kind: "date", date: today } : ({ kind: d.kind } as DeliveryChoice))}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition ${delivery.kind === d.kind ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {delivery.kind === "date" && (
          <DeliveryDatePicker value={delivery.date} min={today} onChange={(date) => onDelivery({ kind: "date", date })} />
        )}
        <p className="mt-1.5 text-[11px] text-stone-400">在你所在时区的当天 0 点送达；送达前，朋友只能看到一封在路上的信。</p>
      </fieldset>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">{error}</p>}
      <button
        type="button"
        onClick={onSend}
        disabled={sending || recipientName.trim() === ""}
        className="rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {sending ? "寄出中…" : "寄出"}
      </button>
    </div>
  );
}
