import { describe, expect, test } from "vitest";
import { slipHeadline, slipLabel, slipSentence } from "./slip";

describe("slipLabel", () => {
  test("hours below two days, days for whole days above", () => {
    expect(slipLabel(6)).toBe("6 h");
    expect(slipLabel(24)).toBe("24 h");
    expect(slipLabel(168)).toBe("7 d");
    expect(slipLabel(50)).toBe("50 h");
  });
});

describe("slipSentence", () => {
  test("names the change in verdict", () => {
    expect(slipSentence(24, "poor", "marginal")).toBe("A 24 h slip moves the verdict from Poor to Marginal.");
  });
  test("says when the verdict holds", () => {
    expect(slipSentence(168, "poor", "poor")).toBe("A 7 d slip does not change the verdict (Poor).");
  });
});

describe("slipHeadline", () => {
  const base = { verdict: "good" as const, sunPct: 100, longestDarkH: 0, linkPct: 98, longestLinkGapH: 10 };
  test("names the new darkness when a slip pushes the mission past sunset", () => {
    expect(slipHeadline(24, base, { ...base, verdict: "poor", sunPct: 96, longestDarkH: 13.9 }))
      .toBe("Launching 24 h late turns a Good plan Poor: it now runs into 13.9 h of darkness.");
  });
  test("falls back to the silence from Earth when the light does not change", () => {
    expect(slipHeadline(168, base, { ...base, verdict: "marginal", longestLinkGapH: 118 }))
      .toBe("Launching 7 d late turns a Good plan Marginal: the longest silence from Earth goes from 10.0 h to 4.9 days.");
  });
  test("says when nothing changes", () => {
    expect(slipHeadline(6, base, base)).toBe("Launching 6 h late keeps the plan Good.");
  });
});
