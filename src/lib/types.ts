export type CardTemplateId =
  | "first-snow"
  | "home-christmas"
  | "sweet-dreams"
  | "lantern-light"
  | "winter-moonlight"
  | "forest-letter"
  | "gift-atelier"
  | "snow-town";

/**
 * Template ids still offered in the app (new letters pick from these).
 * The four legacy ids above stay in the union only so letters already
 * stored with them keep validating and rendering; their cover art was
 * retired from public/assets.
 */
export const ACTIVE_TEMPLATE_IDS = [
  "winter-moonlight",
  "forest-letter",
  "gift-atelier",
  "snow-town",
] as const;

export type ActiveTemplateId = (typeof ACTIVE_TEMPLATE_IDS)[number];

export interface CardTemplate {
  id: CardTemplateId;
  name: string;
  subtitle: string;
  accentColor: string;
  paperTint: string;
  insideTint: string;
  defaultMessage: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
