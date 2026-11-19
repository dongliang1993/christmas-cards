/**
 * How long a visitor really looked at the page.
 *
 * The site is one page, so Umami sees a single page view per visit and its
 * own "visit duration" (last report minus first) reads 0 for most people.
 * We count only the time the page is on screen (paused while the visitor is
 * in another app or tab) and report it:
 * - once each time the page is hidden ("leave", with the seconds so far):
 *   on phones, being hidden is the last thing a page reliably hears before
 *   it is closed or swiped away;
 * - at a few milestones while it is watched (15s, 30s, 1m, 2m, 4m), so a lost
 *   final report costs at most the gap since the last milestone, and the
 *   milestone counts read directly as "how many visitors stayed this long".
 */

export interface Milestone {
  seconds: number;
  event: "engaged_15s" | "engaged_30s" | "engaged_1m" | "engaged_2m" | "engaged_4m";
}

export const MILESTONES: readonly Milestone[] = [
  { seconds: 15, event: "engaged_15s" },
  { seconds: 30, event: "engaged_30s" },
  { seconds: 60, event: "engaged_1m" },
  { seconds: 120, event: "engaged_2m" },
  { seconds: 240, event: "engaged_4m" },
];

/** Time on screen only: a stopwatch that runs while the page is visible. */
export interface ActiveClock {
  show(nowMs: number): void;
  hide(nowMs: number): void;
  seconds(nowMs: number): number;
}

export function createActiveClock(visible: boolean, nowMs: number): ActiveClock {
  let banked = 0;
  let since: number | null = visible ? nowMs : null;
  return {
    show(now) {
      if (since === null) since = now;
    },
    hide(now) {
      if (since !== null) {
        banked += Math.max(0, now - since);
        since = null;
      }
    },
    seconds(now) {
      const running = since === null ? 0 : Math.max(0, now - since);
      return (banked + running) / 1000;
    },
  };
}

/** Milestones reached by `seconds` that have not been reported yet, in order. */
export function dueMilestones(seconds: number, reported: ReadonlySet<string>): Milestone[] {
  return MILESTONES.filter((m) => m.seconds <= seconds && !reported.has(m.event));
}

/** Milliseconds of on-screen time until the next unreported milestone, or null when all are done. */
export function msToNextMilestone(seconds: number, reported: ReadonlySet<string>): number | null {
  const next = MILESTONES.find((m) => !reported.has(m.event) && m.seconds > seconds);
  return next ? Math.ceil((next.seconds - seconds) * 1000) : null;
}
