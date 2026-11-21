"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast, useToast } from "@/components/Toast";
import { copyText } from "@/lib/client/clipboard";
import { lettersApi } from "@/lib/client/lettersApi";
import { rememberOutbox } from "@/lib/client/outboxStorage";
import { hideChristmasLoading } from "@/lib/loadingVeil";
import type { LetterStatus, OutboxEntry } from "@/lib/letter/model";

const STATUS: Record<LetterStatus, { label: string; className: string }> = {
  "in-transit": { label: "在路上", className: "bg-amber-50 text-amber-800" },
  delivered: { label: "已送达", className: "bg-sky-50 text-sky-800" },
  opened: { label: "已拆封", className: "bg-emerald-50 text-emerald-800" },
  recalled: { label: "已撤回", className: "bg-stone-100 text-stone-500" },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** The sender's outbox (spec §6): where each letter is, plus copy / recall. */
export function OutboxView({ outboxId }: { outboxId: string }) {
  const [letters, setLetters] = useState<OutboxEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast, show } = useToast();

  // No 3D scene on this page: drop the loading veil as soon as React mounts.
  useEffect(() => {
    hideChristmasLoading();
  }, []);

  const load = useCallback(() => {
    lettersApi
      .getOutbox(outboxId)
      .then((r) => {
        setLetters(r.letters);
        rememberOutbox(window.localStorage, outboxId);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "寄件箱加载失败"));
  }, [outboxId]);
  useEffect(load, [load]);

  const copy = async (id: string) => {
    const url = `${window.location.origin}/letter/${id}`;
    if (await copyText(url)) {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
      show({ tone: "ok", text: "链接已复制" });
    } else {
      show({ tone: "error", text: "没能自动复制，请打开这封信后复制地址" });
    }
  };

  const recall = async (id: string) => {
    try {
      await lettersApi.recall(id, outboxId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤回失败");
    }
  };

  return (
    <main className="min-h-dvh bg-[#fbfaf9] px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">寄件箱</h1>
            <p className="text-xs text-stone-500">只有知道这个链接的人能看到这里。</p>
          </div>
          <a href="/" className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">再写一封</a>
        </div>
        {error && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">{error}</p>}
        {letters === null && !error && <p className="text-sm text-stone-400">加载中…</p>}
        {letters?.length === 0 && <p className="text-sm text-stone-500">还没有寄出的信。</p>}
        <ul className="divide-y divide-stone-200/70 rounded-2xl border border-stone-200/70 bg-white">
          {letters?.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="text-sm font-medium text-stone-900">{l.recipientName}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[l.status].className}`}>{STATUS[l.status].label}</span>
              <span className="text-[11px] text-stone-400">
                {l.status === "opened" && l.openedAt ? `${fmt(l.openedAt)} 拆开` : `${fmt(l.deliverAt)} 送达`}
              </span>
              <span className="ml-auto flex gap-1">
                {l.status !== "recalled" && (
                  <button type="button" onClick={() => copy(l.id)} className="rounded-lg px-2 py-1 text-xs text-stone-600 hover:bg-stone-100">
                    {copied === l.id ? "已复制" : "复制链接"}
                  </button>
                )}
                {l.status === "in-transit" && (
                  <button type="button" onClick={() => recall(l.id)} className="rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-red-50 hover:text-red-600">
                    撤回
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Toast toast={toast} />
    </main>
  );
}
