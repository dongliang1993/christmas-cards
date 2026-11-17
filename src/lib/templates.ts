import type { CardTemplate, CardTemplateId } from "./types";

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "first-snow",
    name: "First Snow",
    subtitle: "红围巾猫咪与窗前烛火",
    accentColor: "#b8322c",
    paperTint: "#f5efe9",
    insideTint: "#faf7f2",
    defaultMessage: "Snow outside,\nwarm inside,\nthinking of you.",
  },
  {
    id: "home-christmas",
    name: "Home for Christmas",
    subtitle: "雪夜亮灯的森林木屋",
    accentColor: "#2e5a44",
    paperTint: "#eef2ef",
    insideTint: "#f8faf8",
    defaultMessage: "May your home be filled\nwith warmth, laughter,\nand quiet winter magic.",
  },
  {
    id: "sweet-dreams",
    name: "Sweet Dreams",
    subtitle: "月光下的金色小鹿",
    accentColor: "#b58938",
    paperTint: "#f4f1ea",
    insideTint: "#fbf9f4",
    defaultMessage: "Wishing you peaceful nights,\nsoft starlight, and a\nvery Merry Christmas.",
  },
  {
    id: "lantern-light",
    name: "Lantern Light",
    subtitle: "提灯守候的冬日小猫",
    accentColor: "#c46b2d",
    paperTint: "#f2eee9",
    insideTint: "#faf6f0",
    defaultMessage: "May a warm little light\nguide every step you take\ninto the new year.",
  },
];

export const TEMPLATE_MAP: Record<CardTemplateId, CardTemplate> =
  CARD_TEMPLATES.reduce(
    (acc, item) => ({
      ...acc,
      [item.id]: item,
    }),
    {} as Record<CardTemplateId, CardTemplate>,
  );

export const PRESET_MESSAGES: string[] = [
  "Snow outside,\nwarm inside,\nthinking of you.",
  "愿这个冬天的风雪之外，\n总有一盏暖灯为你而亮。\n圣诞快乐，岁岁常安。",
  "Merry Christmas!\nThank you for making\nthis year so bright.",
  "平安喜乐，万事胜意。\n愿圣诞的星光\n照亮你所有的温柔梦境。",
];
