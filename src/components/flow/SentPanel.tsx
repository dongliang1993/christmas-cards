"use client";

import { useState } from "react";
import { Check, Copy, Inbox, Share2 } from "lucide-react";

interface Props {
  letterUrl: string;
  outboxUrl: string;
  recipientName: string;
  deliverAt: string;
  onDuplicate(): void;
  onNew(): void;
}

function formatDelivery(iso: string): string {
  const d = new Date(iso);
  if (d.getTime() <= Date.now() + 60_000) return "已经送达，现在就能拆开";
  return `会在 ${d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 送达`;
}

/** The letter is on its way: its link, and what to do next (spec §4.7–4.8). */
export function SentPanel(props: Props) {
  const [copied, setCopied] = useState<"letter" | "outbox" | null>(null);
  const copy = async (text: string, which: "letter" | "outbox") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      window.prompt("复制这个链接", text);
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">寄给 {props.recipientName} 的信已经寄出</h2>
        <p className="mt-1 text-sm text-stone-500">{formatDelivery(props.deliverAt)}。把下面的链接发给 {props.recipientName}。</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2">
        <input readOnly value={props.letterUrl} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-stone-700 outline-none" aria-label="信件链接" />
        <button type="button" onClick={() => copy(props.letterUrl, "letter")} className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
          {copied === "letter" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "letter" ? "已复制" : "复制"}
        </button>
        {canShare && (
          <button
            type="button"
            aria-label="分享"
            onClick={() => navigator.share({ title: "给你的一封圣诞信", url: props.letterUrl }).catch(() => undefined)}
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-200"
          >
            <Share2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          <Inbox className="h-3.5 w-3.5" /> 你的寄件箱
        </div>
        这是只有你知道的链接，可以看到每封信有没有送达、拆开。换设备时用它找回寄件箱。
        <button type="button" onClick={() => copy(props.outboxUrl, "outbox")} className="mt-1.5 block underline underline-offset-2">
          {copied === "outbox" ? "已复制寄件箱链接" : "复制寄件箱链接"}
        </button>
        <a href={props.outboxUrl} className="mt-1 block underline underline-offset-2">
          打开寄件箱
        </a>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={props.onDuplicate} className="flex-1 rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800">
          复制一封，寄给下一位
        </button>
        <button type="button" onClick={props.onNew} className="rounded-xl px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-100">
          从头写一封
        </button>
      </div>
    </div>
  );
}
