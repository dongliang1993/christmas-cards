"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";
import { createActiveClock, dueMilestones, msToNextMilestone } from "@/lib/analytics/engagement";

/** Reports on-screen time to Umami (see lib/analytics/engagement.ts). Renders nothing. */
export function EngagementTracker() {
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const clock = createActiveClock(visible(), performance.now());
    const reported = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastLeave = -1;

    const reportMilestones = () => {
      for (const m of dueMilestones(clock.seconds(performance.now()), reported)) {
        reported.add(m.event);
        track(m.event, { path: location.pathname });
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      const wait = msToNextMilestone(clock.seconds(performance.now()), reported);
      if (wait === null || !visible()) return;
      timer = setTimeout(() => {
        reportMilestones();
        schedule();
      }, wait);
    };
    const leave = () => {
      clearTimeout(timer);
      clock.hide(performance.now());
      reportMilestones();
      const seconds = Math.round(clock.seconds(performance.now()));
      if (seconds === lastLeave) return; // pagehide right after hidden: already reported
      lastLeave = seconds;
      track("leave", { seconds, path: location.pathname });
    };
    const onVisibility = () => {
      if (visible()) {
        clock.show(performance.now());
        schedule();
      } else {
        leave();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

  return null;
}
