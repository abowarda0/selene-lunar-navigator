import { describe, expect, test } from "vitest";
import { DEFAULT_LANDER, LANDER_PRESETS, type LanderPlan } from "./landers";
import { decodePlanLink, encodePlanLink } from "./shareLink";
import { DEFAULT_PLAN } from "../selene/plan";

describe("plan links", () => {
  test("a preset plan round-trips through the hash", () => {
    // Arrange
    const plan = { site: "haworth", date: "2027-05-02", time: "06:30", hours: 168 };
    const lander: LanderPlan = { preset: "small", spec: LANDER_PRESETS.small.spec, mast: true };
    // Act
    const hash = encodePlanLink(plan, lander);
    const back = decodePlanLink(hash);
    // Assert
    expect(hash.startsWith("plan?")).toBe(true);
    expect(back).toEqual({ plan, lander });
  });

  test("custom spacecraft values travel in the link", () => {
    const lander: LanderPlan = { preset: "custom", spec: { ...DEFAULT_LANDER.spec, batteryKWh: 12.5, panelW: 900 }, mast: false };
    expect(decodePlanLink(encodePlanLink(DEFAULT_PLAN, lander))?.lander).toEqual(lander);
  });

  test("returns null for a hash without plan values", () => {
    expect(decodePlanLink("plan")).toBeNull();
    expect(decodePlanLink("home")).toBeNull();
  });

  test("rejects malformed values", () => {
    expect(decodePlanLink("plan?s=haworth&d=2027-13-99&t=00:00&h=720&c=rover&m=0")).toBeNull();
    expect(decodePlanLink("plan?s=haworth&d=2027-05-02&t=00:00&h=-5&c=rover&m=0")).toBeNull();
    expect(decodePlanLink("plan?s=haworth&d=2027-05-02&t=00:00&h=720&c=jetpack&m=0")).toBeNull();
  });

  test("rejects custom values that fail the spacecraft checks", () => {
    const bad = encodePlanLink(DEFAULT_PLAN, { preset: "custom", spec: { ...DEFAULT_LANDER.spec, batteryKWh: 2 }, mast: false }).replace("bk=2", "bk=0");
    expect(decodePlanLink(bad)).toBeNull();
  });
});
