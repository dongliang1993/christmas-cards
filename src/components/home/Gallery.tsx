"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, BookOpenCheck, PenLine } from "lucide-react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { editorHref } from "@/lib/editor/editorLinks";
import { playSwipe } from "@/lib/sfx";
import { CARD_TEMPLATES, TEMPLATE_MAP } from "@/lib/templates";
import type { CardTemplateId } from "@/lib/types";

const TEMPLATE_IDS = CARD_TEMPLATES.map((t) => t.id);

/**
 * Home (spec §13.1): browse the ready-made cards first, open them, and only
 * then start making one. No editing here. The cards lie fanned out as a
 * dealt hand: drag or swipe to deal through it; tap the front card to focus
 * it (the rest step aside, drag to turn and look at the cover); tap it again
 * to open it; tap empty space (or Esc) to go back to the hand.
 */
export function Gallery() {
  const [templateId, setTemplateId] = useState<CardTemplateId>(CARD_TEMPLATES[0].id);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const tpl = TEMPLATE_MAP[templateId];

  const choose = (id: CardTemplateId) => {
    if (id === templateId) return;
    playSwipe("switch");
    setTemplateId(id);
    setOpen(false);
    setFocus(false);
  };
  // Opening always happens on a focused card (the rest of the hand steps aside).
  const toggleOpen = () => {
    setFocus(true);
    setOpen((v) => {
      if (!v) playSwipe("open");
      return !v;
    });
  };
  // Stable for the card's lifetime (it reads the hand once at mount), so it
  // must not close over `templateId`: set state directly.
  const hand = useMemo(
    () => ({
      templateIds: TEMPLATE_IDS,
      onIndex: (i: number) => {
        setTemplateId(TEMPLATE_IDS[i]);
        setOpen(false);
        setFocus(false);
        playSwipe("switch");
      },
      onFocus: (f: boolean) => {
        setFocus(f);
        if (!f) setOpen(false);
      },
    }),
    [],
  );

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9] select-none">
      <header className="pointer-events-none absolute left-5 top-4 z-10">
        <h1 className="font-semibold text-stone-900">圣诞信</h1>
      </header>

      <ChristmasCard3D
        templateId={templateId}
        message={tpl.defaultMessage}
        signature=""
        isOpen={open}
        isPaused={false}
        flyIn={false}
        hand={hand}
        handFocus={focus}
        onToggleOpen={toggleOpen}
      />

      <nav
        aria-label="挑选贺卡"
        className="absolute inset-x-0 bottom-5 z-20 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/90 px-2.5 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl"
      >
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {CARD_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.name}
              aria-label={`看看「${t.name}」`}
              aria-pressed={templateId === t.id}
              onClick={() => choose(t.id)}
              className={`relative shrink-0 rounded-lg p-1 transition ${templateId === t.id ? "bg-stone-100" : "opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CARD_ASSETS[t.id].coverSrc} alt="" className="h-9 w-[26px] rounded-[4px] object-cover shadow-sm sm:h-11 sm:w-8" />
              {templateId === t.id && <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-stone-900" />}
            </button>
          ))}
        </div>
        <span className="mx-1 h-7 w-px shrink-0 bg-stone-200" />
        <button
          type="button"
          aria-label={open ? "合上贺卡" : "翻开贺卡"}
          title={open ? "合上" : "翻开"}
          onClick={toggleOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100"
        >
          {open ? <BookOpenCheck className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </button>
        {/* <Link
          href={editorHref(templateId)}
          className="ml-1 flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 text-xs font-medium text-white hover:bg-stone-800"
        >
          <PenLine className="h-3.5 w-3.5" /> 制作贺卡
        </Link> */}
      </nav>
    </main>
  );
}
