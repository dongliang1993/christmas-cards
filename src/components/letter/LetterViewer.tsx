"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TEMPLATE_ID } from "@/lib/templates";
import { Pause, Play } from "lucide-react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import { EnvelopeScene } from "@/components/envelope/EnvelopeScene";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { track } from "@/lib/analytics/track";
import { lettersApi } from "@/lib/client/lettersApi";
import { hideChristmasLoading } from "@/lib/loadingVeil";
import type { PublicLetter } from "@/lib/letter/model";
import { shouldRecordOpening, viewerStage } from "@/lib/letter/viewer";

/** Longest wait we arm a timer for; beyond it the page simply asks on reload. */
const MAX_TIMER_MS = 24 * 3600_000;

function deliverLabelFor(deliverAt: string): string {
  const d = new Date(deliverAt);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** The recipient's page (spec §5): envelope in transit → break the seal → the card. */
export function LetterViewer({ id }: { id: string }) {
  const [letter, setLetter] = useState<PublicLetter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // The card arrives shut, exactly as it left the envelope (envelope spec §5); the recipient opens it.
  const [open, setOpen] = useState(false);
  /** The card has drawn itself under the envelope: the envelope can go. */
  const [cardReady, setCardReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => {
    lettersApi
      .getLetter(id)
      .then((l) => {
        setLetter(l);
        setNow(new Date());
        // A letter already opened in an earlier visit goes straight to the card.
        if (l.status === "opened") setBroken(true);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "这封信打不开"));
  }, [id]);
  useEffect(load, [load]);

  const stage = letter ? viewerStage(letter, now, broken) : null;

  // Arrives while the page is open: wake up at delivery time and fetch the content.
  useEffect(() => {
    if (!letter || stage !== "transit") return;
    const wait = new Date(letter.deliverAt).getTime() - Date.now();
    if (wait > MAX_TIMER_MS) return;
    const t = setTimeout(() => setNow(new Date()), Math.max(0, wait) + 500);
    return () => clearTimeout(t);
  }, [letter, stage]);
  useEffect(() => {
    if (stage === "refetch") load();
  }, [stage, load]);

  const onOpened = () => {
    setBroken(true);
    if (shouldRecordOpening(window.sessionStorage, id)) {
      lettersApi.markOpened(id).catch(() => undefined); // best effort: the card is already showing
      track("letter_opened");
    }
  };

  if (error) return <Notice title="这封信找不到了" body={error} />;
  if (!letter || !stage || stage === "refetch") return <Notice title="" body="正在取信…" />;
  if (stage === "recalled") return <Notice title="这封信被寄件人收回了" body="也许他们想再写得好一点。" />;

  const content = letter.content;
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9] select-none">
      {/* The envelope stays on top until the card underneath has drawn its first frame. */}
      {(stage !== "card" || !content || !cardReady) && (
        <div className="absolute inset-0 z-10">
          <EnvelopeScene
            mode={stage === "transit" ? "transit" : "open"}
            envelopeColor={letter.envelopeColor}
            seal={letter.seal}
            coverSrc={CARD_ASSETS[content?.templateId ?? DEFAULT_TEMPLATE_ID].coverSrc}
            paper={content?.paper}
            deliverLabel={stage === "transit" ? deliverLabelFor(letter.deliverAt) : null}
            onOpened={onOpened}
          />
        </div>
      )}
      {stage === "card" && content && (
        <>
          <ChristmasCard3D
            templateId={content.templateId}
            message=""
            signature=""
            isOpen={open}
            isPaused={false}
            flyIn={false}
            elements={content.elements}
            paper={content.paper}
            onToggleOpen={() => setOpen((v) => !v)}
            onFirstFrame={() => {
              setCardReady(true);
              hideChristmasLoading();
            }}
          />
          {content.audioUrl && (
            <>
              <audio ref={audio} src={content.audioUrl} loop onEnded={() => setPlaying(false)} />
              <button
                type="button"
                aria-label={playing ? "暂停音乐" : "播放音乐"}
                onClick={() => {
                  const el = audio.current;
                  if (!el) return;
                  if (playing) el.pause();
                  else el.play().catch(() => undefined);
                  setPlaying(!playing);
                }}
                className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs text-stone-700 shadow"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {content.audioName ?? "音乐"}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex h-dvh items-center justify-center bg-[#fbfaf9] px-6 text-center">
      <div>
        {title && <h1 className="text-base font-semibold text-stone-900">{title}</h1>}
        <p className="mt-1 text-sm text-stone-500">{body}</p>
      </div>
    </main>
  );
}
