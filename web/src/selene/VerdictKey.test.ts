import { describe, expect, test } from "vitest";
import { MARGINAL_DARK_H } from "../lib/verdict";
import { VERDICT_MEANING } from "./VerdictKey";

describe("VERDICT_MEANING", () => {
  test("explains each level with the thresholds the verdict actually uses", () => {
    expect(VERDICT_MEANING.good).toContain("fits inside the sunlight");
    expect(VERDICT_MEANING.marginal).toContain(`up to ${MARGINAL_DARK_H} hours`);
    expect(VERDICT_MEANING.poor).toContain(`more than ${MARGINAL_DARK_H} hours`);
    expect(VERDICT_MEANING.good).toContain("30%");
    expect(VERDICT_MEANING.marginal).toContain("5 days");
  });
});
