import { describe, expect, test } from "vitest";
import { slipLabel, slipSentence } from "./slip";

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
