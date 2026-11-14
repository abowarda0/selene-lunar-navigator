import { describe, expect, test } from "vitest";
import { bestOf, MAX_COMPARE, parseCompare, planKey, toggleCompare } from "./compare";
import type { Plan } from "../selene/plan";

const p = (site: string, date = "2027-03-16", hours = 720): Plan => ({ site, date, time: "00:00", hours });

describe("planKey", () => {
  test("is the same for equal plans and differs when any field differs", () => {
    expect(planKey(p("a"))).toBe(planKey(p("a")));
    expect(planKey(p("a"))).not.toBe(planKey(p("a", "2027-03-17")));
    expect(planKey(p("a"))).not.toBe(planKey(p("a", "2027-03-16", 168)));
  });
});

describe("toggleCompare", () => {
  test("adds a new plan without changing the old list", () => {
    // Arrange
    const before: readonly Plan[] = [p("a")];
    // Act
    const r = toggleCompare(before, p("b"));
    // Assert
    expect(r.list.map((x) => x.site)).toEqual(["a", "b"]);
    expect(r.error).toBeNull();
    expect(before).toHaveLength(1);
  });

  test("removes a plan that is already in the list", () => {
    const r = toggleCompare([p("a"), p("b")], p("a"));
    expect(r.list.map((x) => x.site)).toEqual(["b"]);
  });

  test("refuses a fourth plan with a message", () => {
    const full = [p("a"), p("b"), p("c")];
    const r = toggleCompare(full, p("d"));
    expect(MAX_COMPARE).toBe(3);
    expect(r.list).toBe(full);
    expect(r.error).toBe("Remove one first (max 3)");
  });

  test("still lets a full list remove one", () => {
    expect(toggleCompare([p("a"), p("b"), p("c")], p("b")).list).toHaveLength(2);
  });
});

describe("parseCompare", () => {
  test("reads a stored list", () => {
    expect(parseCompare(JSON.stringify([p("a"), p("b")]))).toEqual([p("a"), p("b")]);
  });
  test("returns an empty list for missing or broken text", () => {
    expect(parseCompare(null)).toEqual([]);
    expect(parseCompare("{nope")).toEqual([]);
    expect(parseCompare(JSON.stringify({ site: "a" }))).toEqual([]);
  });
  test("drops malformed entries and keeps at most three", () => {
    const raw = JSON.stringify([p("a"), { site: 3 }, p("b"), p("c"), p("d")]);
    expect(parseCompare(raw).map((x) => x.site)).toEqual(["a", "b", "c"]);
  });
});

describe("bestOf", () => {
  test("marks the highest value when higher is better", () => {
    expect(bestOf([10, 30, 20], "high")).toEqual({ best: [false, true, false], allEqual: false });
  });
  test("marks the lowest value when lower is better, ties included", () => {
    expect(bestOf([5, 9, 5], "low")).toEqual({ best: [true, false, true], allEqual: false });
  });
  test("ignores missing values and flags rows where all are equal", () => {
    expect(bestOf([4, null, 4], "high")).toEqual({ best: [false, false, false], allEqual: true });
  });
  test("no best when fewer than two values are known", () => {
    expect(bestOf([4, null], "high").best).toEqual([false, false]);
  });
});
