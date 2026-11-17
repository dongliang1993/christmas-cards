"use client";

import { useState } from "react";
import { Music, X } from "lucide-react";
import {
  ENVELOPE_COLORS,
  LIMITS,
  SEAL_COLORS,
  STAMP_IDS,
  type DeliveryChoice,
  type EnvelopeColor,
  type Seal,
  type SealColor,
  type StampId,
} from "@/lib/letter/model";
import { ENVELOPE_PAPER, WAX } from "@/lib/envelope/envelopeModel";

const STAMP_LABELS: Record<StampId, string> = {
  snowflake: "雪花",
  star: "星星",
  holly: "冬青",
  reindeer: "驯鹿",
  gift: "礼物",
  initials: "首字母",
};

const DELIVERY: { kind: DeliveryChoice["kind"]; label: string }[] = [
  { kind: "now", label: "立刻送达" },
  { kind: "christmas-eve", label: "平安夜 12/24" },
  { kind: "christmas", label: "圣诞节 12/25" },
  { kind: "date", label: "自选日期" },
];

interface Props {
  recipientName: string;
  envelopeColor: EnvelopeColor;
  seal: Seal;
  delivery: DeliveryChoice;
  audioName: string | null;
  error: string | null;
  onChange(patch: { recipientName?: string; envelopeColor?: EnvelopeColor; seal?: Seal; audio?: { url: string; name: string } | null }): void;
  onDelivery(choice: DeliveryChoice): void;
  onBack(): void;
  onSeal(): void;
}

function Chip({ active, onClick, children, label }: { active: boolean; onClick(): void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs transition ${active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
    >
      {children}
    </button>
  );
}

/** Who it's for, how it is sealed and when it arrives (spec §4.4–4.6). */
export function AddressPanel(props: Props) {
  const { seal, delivery } = props;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const today = new Date().toLocaleDateString("en-CA");

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "上传失败");
      props.onChange({ audio: { url: body.data.url, name: file.name } });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-stone-600">收件人</span>
        <input
          value={props.recipientName}
          maxLength={LIMITS.recipientLength}
          onChange={(e) => props.onChange({ recipientName: e.target.value })}
          placeholder="朋友的名字，会写在信封上"
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

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-stone-600">火漆</legend>
        <div className="mb-2 flex gap-2">
          {SEAL_COLORS.map((c: SealColor) => (
            <button
              key={c}
              type="button"
              aria-label={`火漆颜色 ${c}`}
              aria-pressed={seal.color === c}
              onClick={() => props.onChange({ seal: { ...seal, color: c } })}
              className={`h-8 w-8 rounded-full ring-offset-2 ${seal.color === c ? "ring-2 ring-stone-900" : "ring-1 ring-stone-200"}`}
              style={{ background: WAX[c].color }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STAMP_IDS.map((s) => (
            <Chip key={s} active={seal.stamp === s} onClick={() => props.onChange({ seal: { ...seal, stamp: s } })}>
              {STAMP_LABELS[s]}
            </Chip>
          ))}
        </div>
        {seal.stamp === "initials" && (
          <input
            value={seal.initials ?? ""}
            maxLength={2}
            onChange={(e) => props.onChange({ seal: { ...seal, initials: e.target.value.trim() || undefined } })}
            placeholder="1–2 个字母"
            aria-label="印章首字母"
            className="mt-2 w-28 rounded-lg border border-stone-200 px-3 py-1.5 text-sm uppercase outline-none focus:border-stone-400"
          />
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-stone-600">什么时候送到</legend>
        <div className="flex flex-wrap gap-1.5">
          {DELIVERY.map((d) => (
            <Chip
              key={d.kind}
              active={delivery.kind === d.kind}
              onClick={() => props.onDelivery(d.kind === "date" ? { kind: "date", date: today } : ({ kind: d.kind } as DeliveryChoice))}
            >
              {d.label}
            </Chip>
          ))}
        </div>
        {delivery.kind === "date" && (
          <input
            type="date"
            min={today}
            value={delivery.date}
            onChange={(e) => props.onDelivery({ kind: "date", date: e.target.value })}
            aria-label="送达日期"
            className="mt-2 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-stone-400"
          />
        )}
        <p className="mt-1.5 text-[11px] text-stone-400">在你所在时区的当天 0 点送达；送达前，朋友只能看到一封在路上的信。</p>
      </fieldset>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-stone-600">配一首歌（可选）</span>
        {props.audioName ? (
          <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm">
            <Music className="h-4 w-4 text-stone-500" />
            <span className="min-w-0 flex-1 truncate">{props.audioName}</span>
            <button type="button" aria-label="移除歌曲" onClick={() => props.onChange({ audio: null })} className="text-stone-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-stone-200 px-4 py-4 text-xs text-stone-500 hover:border-stone-300">
            {uploading ? "上传中…" : "选择一个音频文件"}
            <input type="file" accept="audio/*" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
        {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
      </div>

      {props.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">{props.error}</p>}

      <div className="mt-auto flex gap-2">
        <button type="button" onClick={props.onBack} className="rounded-xl px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-100">
          返回修改卡片
        </button>
        <button type="button" onClick={props.onSeal} className="flex-1 rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800">
          装进信封
        </button>
      </div>
    </div>
  );
}
