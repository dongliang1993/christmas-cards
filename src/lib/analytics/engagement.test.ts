import { describe, expect, it } from "vitest";
import { createActiveClock, dueMilestones, msToNextMilestone } from "./engagement";

describe("createActiveClock", () => {
  it("counts only the time the page is on screen", () => {
    const clock = createActiveClock(true, 0);
    clock.hide(10_000); // 10s watched
    expect(clock.seconds(70_000)).toBe(10); // a minute in another app does not count
    clock.show(70_000);
    expect(clock.seconds(75_000)).toBe(15);
  });

  it("starts paused when the page loads in the background", () => {
    const clock = createActiveClock(false, 0);
    expect(clock.seconds(5_000)).toBe(0);
    clock.show(5_000);
    expect(clock.seconds(8_000)).toBe(3);
  });

  it("ignores repeated show and hide signals", () => {
    const clock = createActiveClock(true, 0);
    clock.show(4_000);
    clock.hide(5_000);
    clock.hide(9_000);
    expect(clock.seconds(20_000)).toBe(5);
  });
});

describe("milestones", () => {
  it("reports each reached milestone once", () => {
    expect(dueMilestones(31, new Set()).map((m) => m.event)).toEqual(["engaged_15s", "engaged_30s"]);
    expect(dueMilestones(31, new Set(["engaged_15s"])).map((m) => m.event)).toEqual(["engaged_30s"]);
    expect(dueMilestones(14.9, new Set())).toEqual([]);
  });

  it("waits for the next unreported milestone", () => {
    expect(msToNextMilestone(10, new Set())).toBe(5_000);
    expect(msToNextMilestone(16, new Set(["engaged_15s"]))).toBe(14_000);
    expect(msToNextMilestone(300, new Set(["engaged_15s", "engaged_30s", "engaged_1m", "engaged_2m", "engaged_4m"]))).toBeNull();
  });
});
