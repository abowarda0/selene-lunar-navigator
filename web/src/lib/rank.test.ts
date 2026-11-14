import { describe, expect, test } from "vitest";
import type { Site, VisWindow, YearData } from "../api/types";
import { DEFAULT_LANDER } from "./landers";
import { compareMetrics, dailyStarts, evaluateDates, evaluatePlan, rankRows, rankSites, type PlanMetrics } from "./rank";

const w = (start: string, end: string): VisWindow => ({ start, end, hours: 0, open_start: false, open_end: false });
const site = (id: string): Site => ({ id, name: id.toUpperCase(), lat: -89, lon_e: 0, kind: "candidate", terrain: true, coord_source: "", verified: true });

const yearOf = (id: string, sun: VisWindow[], earth: VisWindow[]): YearData => ({
  site: site(id),
  span_start: "2027-01-01T00:00Z",
  span_stop: "2027-01-11T00:00Z",
  visibility_step_min: 1,
  source: { ephemeris: "", terrain: "", observer_height_m: 2 },
  windows: { sun, earth },
  track: { t0: "2027-01-01T00:00Z", step_min: 30, sun_az: [], sun_el: [], earth_az: [], earth_el: [] },
  horizon: { az_step_deg: 1, elev_deg: [] },
  notes: [],
});

const lit = yearOf("lit", [w("2027-01-01T00:00Z", "2027-01-11T00:00Z")], [w("2027-01-01T00:00Z", "2027-01-11T00:00Z")]);
const dark = yearOf("dark", [], []);

const m = (p: Partial<PlanMetrics>): PlanMetrics => ({
  start: "2027-01-01T00:00Z", verdict: "poor", lowestSocPct: 50, sunPct: 50, linkPct: 50, longestLinkGapH: 10, longestDarkH: 10, ...p,
});

describe("evaluatePlan", () => {
  test("returns Good with full battery when Sun and link are up the whole plan", () => {
    const r = evaluatePlan(lit, "2027-01-02T00:00Z", 72, DEFAULT_LANDER);
    expect(r).not.toBeNull();
    expect(r?.verdict).toBe("good");
    expect(r?.lowestSocPct).toBeCloseTo(100);
    expect(r?.sunPct).toBeCloseTo(100);
    expect(r?.linkPct).toBeCloseTo(100);
    expect(r?.longestLinkGapH).toBe(0);
    expect(r?.longestDarkH).toBe(0);
  });

  test("returns Poor with the whole plan dark when nothing is visible", () => {
    const r = evaluatePlan(dark, "2027-01-02T00:00Z", 72, DEFAULT_LANDER);
    expect(r?.verdict).toBe("poor");
    expect(r?.longestDarkH).toBe(72);
    expect(r?.longestLinkGapH).toBe(72);
  });

  test("returns null when the plan leaves the stored span", () => {
    expect(evaluatePlan(lit, "2027-01-10T00:00Z", 72, DEFAULT_LANDER)).toBeNull();
    expect(evaluatePlan(lit, "2026-12-31T00:00Z", 24, DEFAULT_LANDER)).toBeNull();
  });
});

describe("compareMetrics", () => {
  test("orders by verdict first", () => {
    expect(compareMetrics(m({ verdict: "good", lowestSocPct: 0 }), m({ verdict: "marginal", lowestSocPct: 99 }))).toBeLessThan(0);
    expect(compareMetrics(m({ verdict: "poor" }), m({ verdict: "marginal" }))).toBeGreaterThan(0);
  });
  test("then by shorter dark spell, then more sunlight (battery does not rank)", () => {
    expect(compareMetrics(m({ longestDarkH: 5 }), m({ longestDarkH: 40 }))).toBeLessThan(0);
    expect(compareMetrics(m({ sunPct: 90 }), m({ sunPct: 60 }))).toBeLessThan(0);
    expect(compareMetrics(m({ lowestSocPct: 80 }), m({ lowestSocPct: 40 }))).toBe(0);
  });
  test("then by shorter longest link gap", () => {
    expect(compareMetrics(m({ longestLinkGapH: 5 }), m({ longestLinkGapH: 30 }))).toBeLessThan(0);
  });
  test("then by larger link share", () => {
    expect(compareMetrics(m({ linkPct: 70 }), m({ linkPct: 20 }))).toBeLessThan(0);
  });
});

describe("rankRows", () => {
  test("sorts a copy and leaves the input order alone", () => {
    const rows = [m({ start: "a", verdict: "poor" }), m({ start: "b", verdict: "good" })];
    const ranked = rankRows(rows);
    expect(ranked.map((r) => r.start)).toEqual(["b", "a"]);
    expect(rows.map((r) => r.start)).toEqual(["a", "b"]);
  });
});

describe("dailyStarts", () => {
  test("gives one 00:00 UTC touchdown per day that keeps the plan inside the span", () => {
    expect(dailyStarts("2027-01-01T00:00Z", "2027-01-05T00:00Z", 48)).toEqual(["2027-01-01T00:00Z", "2027-01-02T00:00Z", "2027-01-03T00:00Z"]);
  });
  test("starts on the next midnight when the span starts mid-day", () => {
    expect(dailyStarts("2027-01-01T06:00Z", "2027-01-03T00:00Z", 24)[0]).toBe("2027-01-02T00:00Z");
  });
});

describe("evaluateDates", () => {
  test("evaluates each daily touchdown in date order", () => {
    const rows = evaluateDates(lit, 72, DEFAULT_LANDER);
    expect(rows).toHaveLength(8);
    expect(rows[0].start).toBe("2027-01-01T00:00Z");
    expect(rows.every((r) => r.verdict === "good")).toBe(true);
  });
});

describe("rankSites", () => {
  test("ranks sites by the shared sort key and lists sites outside the span apart", () => {
    const short = { ...lit, site: site("short"), span_stop: "2027-01-02T00:00Z" };
    const r = rankSites([{ site: dark.site, year: dark }, { site: lit.site, year: lit }, { site: short.site, year: short }], "2027-01-02T00:00Z", 72, DEFAULT_LANDER);
    expect(r.ranked.map((x) => x.site.id)).toEqual(["lit", "dark"]);
    expect(r.outside.map((s) => s.id)).toEqual(["short"]);
  });
});
