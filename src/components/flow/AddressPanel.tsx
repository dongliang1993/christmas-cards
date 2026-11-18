"use client";

import { ENVELOPE_COLORS, LIMITS, type EnvelopeColor } from "@/lib/letter/model";
import { ENVELOPE_PAPER } from "@/lib/envelope/envelopeModel";

interface Props {
  recipientName: string;
  envelopeColor: EnvelopeColor;
  error: string | null;
  onChange(patch: { recipientName?: string; envelopeColor?: EnvelopeColor }): void;
}

/** Who it's for and the envelope's colour. The seal is fixed; when it arrives is chosen at send time. */
export function AddressPanel(props: Props) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-stone-600">收件人</span>
        <input
          value={props.recipientName}
          maxLength={LIMITS.recipientLength}
          onChange={(e) => props.onChange({ recipientName: e.target.value })}
          placeholder="朋友的名字"
          className="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-3.5 py-2 text-sm outline-none focus:border-stone-400 focus:bg-white"
        />
      </label>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-stone-600">信封</legend>
        <div className="flex gap-2">
          {ENVELOPE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`信封颜色 ${c}`}
              aria-pressed={props.envelopeColor === c}
              onClick={() => props.onChange({ envelopeColor: c })}
              className={`h-8 w-8 rounded-full ring-offset-2 ${props.envelopeColor === c ? "ring-2 ring-stone-900" : "ring-1 ring-stone-200"}`}
              style={{ background: ENVELOPE_PAPER[c].paper }}
            />
          ))}
        </div>
      </fieldset>


      {props.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">{props.error}</p>}

    </div>
  );
}
