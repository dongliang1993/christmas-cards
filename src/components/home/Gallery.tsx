"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, BookOpenCheck, PenLine } from "lucide-react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { editorHref } from "@/lib/editor/editorLinks";
import { CARD_TEMPLATES, TEMPLATE_MAP } from "@/lib/templates";
import type { CardTemplateId } from "@/lib/types";

/**
 * Home (spec §13.1): browse the ready-made cards first, open them, and only
 * then start making one. No editing here.
 */
export function Gallery() {
  const [templateId, setTemplateId] = useState<CardTemplateId>(CARD_TEMPLATES[0].id);
  const [open, setOpen] = useState(false);
  const [flyIn, setFlyIn] = useState(0);
  const tpl = TEMPLATE_MAP[templateId];

  const choose = (id: CardTemplateId) => {
    if (id === templateId) return;
    setTemplateId(id);
    setOpen(false);
    setFlyIn((k) => k + 1);
  };

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9] select-none">
      <header className="pointer-events-none absolute left-5 top-4 z-10">
        <h1 className="text-sm font-semibold text-stone-900">圣诞信</h1>
        <p className="text-xs text-stone-500">
          {tpl.name} · {tpl.subtitle}
        </p>
      </header>

      <ChristmasCard3D
        templateId={templateId}
        message={tpl.defaultMessage}
        signature=""
        isOpen={open}
        isPaused={false}
        flyInKey={flyIn}
        onToggleOpen={() => setOpen((v) => !v)}
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
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-700 hover:bg-stone-100"
        >
          {open ? <BookOpenCheck className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </button>
        <Link
          href={editorHref(templateId)}
          className="ml-1 flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-stone-900 px-3 text-sm font-medium text-white hover:bg-stone-800 sm:px-4"
        >
          <PenLine className="h-4 w-4" /> 制作贺卡
        </Link>
      </nav>
    </main>
  );
}
