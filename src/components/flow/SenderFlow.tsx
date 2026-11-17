"use client";

import { useEffect, useReducer, useState } from "react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EditorShell } from "@/components/editor/EditorShell";
import { EnvelopeScene } from "@/components/envelope/EnvelopeScene";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { lettersApi, type SentLetter } from "@/lib/client/lettersApi";
import { readOutbox, rememberOutbox } from "@/lib/client/outboxStorage";
import { clearDraft, loadDraft, saveDraft } from "@/lib/editor/draftStorage";
import { createEditorState, createInitialDraft, duplicateDraft, editorReducer, toLetterDraft } from "@/lib/editor/editorState";
import { resolveDeliverAt } from "@/lib/letter/delivery";
import type { DeliveryChoice } from "@/lib/letter/model";
import type { CardTemplateId } from "@/lib/types";
import { letterDraftSchema } from "@/lib/letter/schema";
import { AddressPanel } from "./AddressPanel";
import { SentPanel } from "./SentPanel";

type Step = "make" | "address" | "seal" | "sent";

const STEPS: { id: Exclude<Step, "sent">; label: string }[] = [
  { id: "make", label: "做卡" },
  { id: "address", label: "信封" },
  { id: "seal", label: "封装" },
];

/** 做卡 → 写收件人和火漆 → 封装 → 寄出 (spec §4, §13). */
export function SenderFlow({ initialTemplate }: { initialTemplate: CardTemplateId }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(createInitialDraft(initialTemplate)));
  const [step, setStep] = useState<Step>("make");
  const [delivery, setDelivery] = useState<DeliveryChoice>({ kind: "christmas-eve" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<(SentLetter & { recipientName: string }) | null>(null);
  const [restored, setRestored] = useState(false);
  const draft = state.draft;

  // Restore the draft in progress once, then keep saving it.
  useEffect(() => {
    // Resume the draft only for the card picked in the gallery; another card starts fresh.
    const saved = loadDraft(window.localStorage);
    if (saved && saved.templateId === initialTemplate) dispatch({ type: "load", draft: saved });
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {/* Flow only (spec §13.2): back · steps · the step's one primary action. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-200/70 px-3 py-2.5">
        <a href="/" className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold text-stone-900 hover:bg-stone-100">
          <ChevronLeft className="h-4 w-4" /> 圣诞信
        </a>
        <ol className="mx-auto flex items-center gap-1 text-xs">
          {STEPS.map((s, i) => {
            const done = STEPS.findIndex((x) => x.id === step) > i || step === "sent";
            return (
              <li key={s.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-stone-300" />}
                <button
                  type="button"
                  disabled={!done || step === "seal" || step === "sent"}
                  onClick={() => setStep(s.id)}
                  aria-current={step === s.id ? "step" : undefined}
                  className={`rounded-md px-1.5 py-0.5 ${step === s.id ? "font-semibold text-stone-900" : done ? "text-stone-600 hover:bg-stone-100" : "text-stone-400"}`}
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
        {step === "make" && (
          <button type="button" onClick={() => setStep("address")} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">
            下一步
          </button>
        )}
        {step === "address" && (
          <button type="button" onClick={toSeal} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">
            装进信封
          </button>
        )}
        {(step === "seal" || step === "sent") && <span className="w-[92px]" />}
      </header>

      <div className="relative min-h-0 flex-1">
        {step === "make" && <EditorShell state={state} dispatch={dispatch} />}
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
