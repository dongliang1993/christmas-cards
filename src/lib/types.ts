export type CardTemplateId =
  | "first-snow"
  | "home-christmas"
  | "sweet-dreams"
  | "lantern-light";

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
