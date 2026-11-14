import { describe, expect, it } from "vitest";
import { guideTips, numbersIn, safeAnswer, type GuideContext } from "./guide";

const plan: GuideContext = {
  view: "plan",
  facts: { site: "Malapert Massif", days: 30, verdict: "poor", sunPct: 49, linkPct: 71, lowestBatteryPct: 20, longestDarkH: 253, batteryNeededKWh: 52.7 },
  answer: "Your rover would run out of power 13.9 days (335 h) after landing.",
};

describe("guideTips", () => {
  it("explains the plan page from its own numbers", () => {
    const tips = guideTips(plan);
    expect(tips.length).toBeGreaterThan(1);
    expect(tips.join(" ")).toContain("Malapert Massif");
    expect(tips.join(" ")).toContain("253 h");
  });

  it("has tips for every page", () => {
    for (const view of ["home", "plan", "dates", "sites", "compare", "method"] as const) {
      expect(guideTips({ view, facts: {}, answer: null }).length).toBeGreaterThan(0);
    }
  });
});

describe("number guard", () => {
  it("finds numbers including decimals and percents", () => {
    expect(numbersIn("49% of 253 h, needs 52.7 kWh, 1,200 W")).toEqual(["49", "253", "52.7", "1200"]);
  });

  it("accepts an AI answer whose numbers all come from the context", () => {
    const r = safeAnswer("The battery hits 20% after 335 h because of a 253 h dark spell.", plan);
    expect(r.ok).toBe(true);
  });

  it("rejects an AI answer that invents a number", () => {
    const r = safeAnswer("The battery lasts 400 h.", plan);
    expect(r.ok).toBe(false);
    expect(r.invented).toEqual(["400"]);
  });

  it("allows small counting words and common constants", () => {
    expect(safeAnswer("There are 2 reasons and 3 dishes.", plan).ok).toBe(true);
  });
});
