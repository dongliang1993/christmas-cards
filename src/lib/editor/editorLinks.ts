import { CARD_TEMPLATES } from "@/lib/templates";
import type { CardTemplateId } from "@/lib/types";

export function editorHref(templateId: CardTemplateId): string {
  return `/editor?template=${encodeURIComponent(templateId)}`;
}

/** The ?template= value if it names a real template, else the first one. */
export function templateFromParam(value: string | null | undefined): CardTemplateId {
  return CARD_TEMPLATES.find((t) => t.id === value)?.id ?? CARD_TEMPLATES[0].id;
}
