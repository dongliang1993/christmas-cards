"use client";

import { useEffect, useReducer, useState } from "react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import { CardEditor } from "@/components/editor/CardEditor";
import { EnvelopeScene } from "@/components/envelope/EnvelopeScene";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { PAPER_STOCKS } from "@/lib/card/paperStocks";
import { lettersApi, type SentLetter } from "@/lib/client/lettersApi";
import { readOutbox, rememberOutbox } from "@/lib/client/outboxStorage";
import { clearDraft, loadDraft, saveDraft } from "@/lib/editor/draftStorage";
import { createEditorState, createInitialDraft, duplicateDraft, editorReducer, toLetterDraft } from "@/lib/editor/editorState";
import { resolveDeliverAt } from "@/lib/letter/delivery";
import { PAPER_STOCK_IDS, type DeliveryChoice } from "@/lib/letter/model";
import { letterDraftSchema } from "@/lib/letter/schema";
import { CARD_TEMPLATES } from "@/lib/templates";
import { AddressPanel } from "./AddressPanel";
import { SentPanel } from "./SentPanel";

type Step = "make" | "address" | "seal" | "sent";

/** 做卡 → 写收件人和火漆 → 封装 → 寄出 (spec §4). */
export function SenderFlow() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(createInitialDraft("first-snow")));
  const [step, setStep] = useState<Step>("make");
  const [delivery, setDelivery] = useState<DeliveryChoice>({ kind: "christmas-eve" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<(SentLetter & { recipientName: string }) | null>(null);
  const [restored, setRestored] = useState(false);
  const draft = state.draft;

  // Restore the draft in progress once, then keep saving it.
  useEffect(() => {
    const saved = loadDraft(window.localStorage);
    if (saved) dispatch({ type: "load", draft: saved });
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => saveDraft(window.localStorage, draft), 400);
    return () => clearTimeout(t);
  }, [draft, restored]);

  const toSeal = () => {
    const parsed = letterDraftSchema.safeParse(toLetterDraft(draft));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "还有内容没填好");
    try {
      resolveDeliverAt(delivery, new Date(), new Date().getTimezoneOffset());
    } catch (e) {
      return setError(e instanceof Error ? e.message : "送达时间不正确");
    }
    setError(null);
    setStep("seal");
  };

  const send = async () => {
    try {
      const deliverAt = resolveDeliverAt(delivery, new Date(), new Date().getTimezoneOffset());
      const result = await lettersApi.send(toLetterDraft(draft), deliverAt, readOutbox(window.localStorage));
      rememberOutbox(window.localStorage, result.outboxId);
      setSent({ ...result, recipientName: draft.recipientName });
      setStep("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "寄出失败，请重试");
      setStep("address");
    }
  };

  const restart = (next: typeof draft) => {
    dispatch({ type: "load", draft: next });
    setSent(null);
    setStep("make");
  };

  return (
    <main className="flex h-dvh w-screen flex-col overflow-hidden bg-[#fbfaf9] select-none">
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-200/70 px-4 py-2.5">
        <h1 className="text-sm font-semibold text-stone-900">圣诞信</h1>
        <ol className="flex items-center gap-1.5 text-[11px] text-stone-400">
          {(["make", "address", "seal", "sent"] as const).map((s, i) => (
            <li key={s} className={step === s ? "font-medium text-stone-900" : ""}>
              {i > 0 && <span className="mx-1">·</span>}
              {{ make: "做卡", address: "信封", seal: "封装", sent: "寄出" }[s]}
            </li>
          ))}
        </ol>
        {step === "make" && (
          <div className="ml-auto flex items-center gap-1.5 overflow-x-auto">
            {CARD_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.name}
                aria-label={`模板：${t.name}`}
                aria-pressed={draft.templateId === t.id}
                onClick={() => dispatch({ type: "set", patch: { templateId: t.id } })}
                className={`shrink-0 rounded-md p-0.5 ${draft.templateId === t.id ? "ring-2 ring-stone-900" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CARD_ASSETS[t.id].coverSrc} alt="" className="h-8 w-6 rounded-[3px] object-cover" />
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-stone-200" />
            {PAPER_STOCK_IDS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={draft.paper === p}
                onClick={() => dispatch({ type: "set", patch: { paper: p } })}
                className={`shrink-0 rounded-lg px-2 py-1 text-[11px] ${draft.paper === p ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"}`}
              >
                {PAPER_STOCKS[p].label}
              </button>
            ))}
            <button type="button" onClick={() => setStep("address")} className="ml-1 shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
              下一步
            </button>
          </div>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        {step === "make" && <CardEditor state={state} dispatch={dispatch} paper={draft.paper} />}
        {step === "address" && (
          <div className="flex h-full flex-col lg:flex-row">
            <div className="relative min-h-[40%] flex-1">
              <ChristmasCard3D templateId={draft.templateId} message="" signature="" isOpen={false} isPaused={false} elements={draft.elements} paper={draft.paper} />
            </div>
            <aside className="shrink-0 border-t border-stone-200/80 bg-white/95 lg:w-96 lg:border-l lg:border-t-0">
              <AddressPanel
                recipientName={draft.recipientName}
                envelopeColor={draft.envelopeColor}
                seal={draft.seal}
                delivery={delivery}
                audioName={draft.audioName}
                error={error}
                onChange={(p) =>
                  dispatch({
                    type: "set",
                    patch: {
                      ...(p.recipientName !== undefined ? { recipientName: p.recipientName } : {}),
                      ...(p.envelopeColor ? { envelopeColor: p.envelopeColor } : {}),
                      ...(p.seal ? { seal: p.seal } : {}),
                      ...(p.audio !== undefined ? { audioUrl: p.audio?.url ?? null, audioName: p.audio?.name ?? null } : {}),
                    },
                  })
                }
                onDelivery={setDelivery}
                onBack={() => setStep("make")}
                onSeal={toSeal}
              />
            </aside>
          </div>
        )}
        {step === "seal" && (
          <EnvelopeScene
            mode="seal"
            envelopeColor={draft.envelopeColor}
            seal={draft.seal}
            recipientName={draft.recipientName}
            coverSrc={CARD_ASSETS[draft.templateId].coverSrc}
            postmark={null}
            onSealed={send}
          />
        )}
        {step === "sent" && sent && (
          <div className="flex h-full items-center">
            <SentPanel
              letterUrl={`${window.location.origin}/letter/${sent.id}`}
              outboxUrl={`${window.location.origin}/outbox/${sent.outboxId}`}
              recipientName={sent.recipientName}
              deliverAt={sent.deliverAt}
              onDuplicate={() => restart(duplicateDraft(draft))}
              onNew={() => {
                clearDraft(window.localStorage);
                restart(createInitialDraft(draft.templateId));
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}
