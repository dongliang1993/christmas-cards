"use client";

import { CARD_ASSETS } from "@/lib/cardAssets";
import type { CardTemplateId } from "@/lib/types";

export function TemplateThumb({ templateId }: { templateId: CardTemplateId }) {
  return (
    <img
      src={CARD_ASSETS[templateId].coverSrc}
      alt={templateId}
      className="h-10 w-7 rounded-[4px] object-cover shadow-xs"
    />
  );
}
