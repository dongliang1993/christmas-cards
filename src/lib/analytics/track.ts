import type { Milestone } from "./engagement";

/**
 * Custom events for the Umami dashboard (the funnel beyond page views).
 * Fire-and-forget: before the tracker loads, under an ad blocker, or off the
 * production domain this is a no-op, and it never throws into the UI.
 */
export type AnalyticsEvent =
  | "card_open" // a visitor opened a card on the home page
  | "card_make" // a visitor chose a card on the home page and started making it
  | "letter_sent" // a letter was sealed and sent
  | "link_copied" // the sender copied the letter link
  | "link_shared" // the sender used the system share sheet
  | "letter_opened" // the recipient opened their letter
  | "leave" // the page was hidden or closed, with the seconds it was on screen
  | Milestone["event"]; // on screen this long (engagement.ts)

type EventData = Record<string, string | number | boolean>;

interface UmamiGlobal {
  track(event: string, data?: EventData): void;
}

export function track(event: AnalyticsEvent, data?: EventData): void {
  try {
    const umami = (globalThis as { umami?: UmamiGlobal }).umami;
    umami?.track(event, data);
  } catch {
    /* analytics must never break the page */
  }
}
