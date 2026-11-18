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
import { isSealValid, sealKey } from "@/lib/envelope/sealFlow";
import { createEditorState, createInitialDraft, duplicateDraft, editorReducer, toLetterDraft } from "@/lib/editor/editorState";
import { resolveDeliverAt } from "@/lib/letter/delivery";
import type { DeliveryChoice } from "@/lib/letter/model";
import type { CardTemplateId } from "@/lib/types";
import { letterDraftSchema } from "@/lib/letter/schema";
import { AddressPanel } from "./AddressPanel";
import { EnvelopeStage } from "./EnvelopeStage";
import { SendPanel } from "./SendPanel";
import { SentPanel } from "./SentPanel";

type Step = "make" | "address" | "seal" | "send" | "sent";

const STEPS: { id: Exclude<Step, "sent">; label: string }[] = [
  { id: "make", label: "做卡" },
  { id: "address", label: "信封" },
  { id: "seal", label: "封装" },
];

/** 做卡 → 写收件人、选信封 → 封装 → 寄出 (spec §4, §13; envelope spec §4). */
export function SenderFlow({ initialTemplate }: { initialTemplate: CardTemplateId }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(createInitialDraft(initialTemplate)));
  const [step, setStep] = useState<Step>("make");
  const [delivery, setDelivery] = useState<DeliveryChoice>({ kind: "christmas-eve" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** What the wax was pressed over; editing the card voids it (spec §4 step 8). */
  const [sealedKey, setSealedKey] = useState<string | null>(null);
  /** The envelope scene has drawn its first frame: the card it replaces can go. */
  const [envelopeReady, setEnvelopeReady] = useState(false);
  const [sent, setSent] = useState<(SentLetter & { recipientName: string }) | null>(null);
  const [restored, setRestored] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
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
    const t = setTimeout(() => setSaveFailed(!saveDraft(window.localStorage, draft)), 400);
    return () => clearTimeout(t);
  }, [draft, restored]);

  const toSeal = () => {
    const parsed = letterDraftSchema.safeParse(toLetterDraft(draft));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "还有内容没填好");
    setError(null);
    setEnvelopeReady(false);
    setStep("seal");
  };

  /** The wax is on: ask when it should arrive before actually sending. */
  const sealed = () => {
    setSealedKey(sealKey(draft));
    setStep("send");
  };
  const alreadySealed = isSealValid(sealedKey, draft);

  const send = async () => {
    setSending(true);
    try {
      const deliverAt = resolveDeliverAt(delivery, new Date(), new Date().getTimezoneOffset());
      const result = await lettersApi.send(toLetterDraft(draft), deliverAt, readOutbox(window.localStorage));
      rememberOutbox(window.localStorage, result.outboxId);
      setSent({ ...result, recipientName: draft.recipientName });
      setError(null);
      setStep("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "寄出失败，请重试");
    } finally {
      setSending(false);
    }
  };

  const restart = (next: typeof draft) => {
    dispatch({ type: "load", draft: next });
    // A new letter is sealed afresh, even when it starts out identical to the last one.
    setSealedKey(null);
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
          <button type="button" onClick={() => setStep("address")} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800">
            下一步
          </button>
        )}
        {step === "address" && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStep("make")} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
              上一步
            </button>
            <button type="button" onClick={toSeal} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800">
              下一步
            </button>
          </div>
        )}
        {(step === "seal" || step === "send") && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStep(step === "send" ? "seal" : "address")} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
              上一步
            </button>
            {step === "seal" && alreadySealed && (
              <button type="button" onClick={() => setStep("send")} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800">
                下一步
              </button>
            )}
          </div>
        )}
        {step === "sent" && <span className="w-[76px]" />}
      </header>

      {saveFailed && (
        <p role="alert" className="shrink-0 bg-red-50 px-3 py-1.5 text-center text-xs text-red-600">
          没能自动保存，这次的改动刷新后会丢失。
          <button type="button" onClick={() => setSaveFailed(!saveDraft(window.localStorage, draft))} className="ml-2 underline">
            重试
          </button>
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        {step === "make" && <EditorShell state={state} dispatch={dispatch} initialTool="style" />}
        {(step === "address" || step === "seal" || step === "send") && (
          <EnvelopeStage
            open={step !== "seal" || !envelopeReady}
            panel={
              step === "send" ? (
                <div className="flex h-full items-center">
                  <SendPanel recipientName={draft.recipientName} delivery={delivery} sending={sending} error={error} onDelivery={setDelivery} onSend={send} />
                </div>
              ) : (
                <AddressPanel
                  recipientName={draft.recipientName}
                  envelopeColor={draft.envelopeColor}
                  error={error}
                  onChange={(p) =>
                    dispatch({
                      type: "set",
                      patch: {
                        ...(p.recipientName !== undefined ? { recipientName: p.recipientName } : {}),
                        ...(p.envelopeColor ? { envelopeColor: p.envelopeColor } : {}),
                      },
                    })
                  }
                />
              )
            }
          >
            {step !== "address" && (
              <EnvelopeScene
                mode="seal"
                envelopeColor={draft.envelopeColor}
                seal={draft.seal}
                coverSrc={CARD_ASSETS[draft.templateId].coverSrc}
                paper={draft.paper}
                startSealed={alreadySealed}
                onSealed={sealed}
                onFirstFrame={() => setEnvelopeReady(true)}
              />
            )}
            {/* The 信封 step's card stays on top until the envelope has drawn its first frame. */}
            {(step === "address" || !envelopeReady) && (
              <div className="absolute inset-0 z-10">
                <ChristmasCard3D templateId={draft.templateId} message="" signature="" isOpen={false} isPaused={false} elements={draft.elements} paper={draft.paper} />
              </div>
            )}
          </EnvelopeStage>
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
