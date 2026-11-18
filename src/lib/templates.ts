import type { ActiveTemplateId, CardTemplate, CardTemplateId } from "./types";
import { ACTIVE_TEMPLATE_IDS } from "./types";

/** Templates still offered in the app; legacy covers were retired. */
export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "winter-moonlight",
    name: "",
    subtitle: "",
    accentColor: "#b8954f",
    paperTint: "#f3ede3",
    insideTint: "#fbf8f2",
    defaultMessage: "Under the same winter moon,\nsending you warm wishes\nand quiet starlight.",
  },
  {
    id: "forest-letter",
    name: "",
    subtitle: "",
    accentColor: "#5b7561",
    paperTint: "#dde4da",
    insideTint: "#f7f9f5",
    defaultMessage: "A little letter from the woods,\nwishing you quiet mornings\nand gentle winter magic.",
  },
  {
    id: "gift-atelier",
    name: "",
    subtitle: "",
    accentColor: "#8b3232",
    paperTint: "#f4ece4",
    insideTint: "#fbf8f2",
    defaultMessage: "Wrapped with warmth and cheer,\nmay every little surprise\nbrighten your winter days.",
  },
  {
    id: "snow-town",
    name: "",
    subtitle: "",
    accentColor: "#32445c",
    paperTint: "#eef2f6",
    insideTint: "#fbf8f2",
    defaultMessage: "From a little town under snow,\nmay warm lights find you\nwherever this winter goes.",
  },
];

export const TEMPLATE_MAP: Record<CardTemplateId, CardTemplate> =
  CARD_TEMPLATES.reduce(
    (acc, item) => ({
      ...acc,
      [item.id]: item,
    }),
    // Legacy covers are retired: old letters still validate, they just
    // render with the default template's look.
    Object.fromEntries(
      (["first-snow", "home-christmas", "sweet-dreams", "lantern-light"] as const).map((id) => [
        id,
        CARD_TEMPLATES[0],
      ]),
    ) as Record<CardTemplateId, CardTemplate>,
  );

/** The template a fresh letter starts from (the first active one). */
export const DEFAULT_TEMPLATE_ID: ActiveTemplateId = ACTIVE_TEMPLATE_IDS[0];

export const PRESET_MESSAGES: string[] = [
  "Snow outside,\nwarm inside,\nthinking of you.",
  "愿这个冬天的风雪之外，\n总有一盏暖灯为你而亮。\n圣诞快乐，岁岁常安。",
  "Merry Christmas!\nThank you for making\nthis year so bright.",
  "平安喜乐，万事胜意。\n愿圣诞的星光\n照亮你所有的温柔梦境。",
];
