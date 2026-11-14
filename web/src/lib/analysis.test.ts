import { describe, expect, test } from "vitest";
import type { VisWindow } from "../api/types";
import { analyze, clip, intersect, type YearWindows } from "./analysis";

const w = (start: string, end: string, open_start = false, open_end = false): VisWindow => ({ start, end, hours: 0, open_start, open_end });

const year: YearWindows = {
  span_start: "2027-01-01T00:00Z",
  span_stop: "2027-02-01T00:00Z",
  windows: {
    sun: [w("2027-01-01T00:00Z", "2027-01-02T06:00Z", true), w("2027-01-03T12:00Z", "2027-01-05T00:00Z")],
    earth: [w("2027-01-01T18:00Z", "2027-01-04T00:00Z")],
  },
};

describe("clip", () => {
  test("cuts windows to the range and marks cut edges open", () => {
    const out = clip(year.windows.sun, "2027-01-01T12:00Z", "2027-01-04T00:00Z");
    expect(out).toEqual([
      { start: "2027-01-01T12:00Z", end: "2027-01-02T06:00Z", hours: 18, open_start: true, open_end: false },
      { start: "2027-01-03T12:00Z", end: "2027-01-04T00:00Z", hours: 12, open_start: false, open_end: true },
    ]);
  });
});

describe("intersect", () => {
  test("returns the overlap of two window lists", () => {
    const a = [w("2027-01-01T00:00Z", "2027-01-01T10:00Z")];
    const b = [w("2027-01-01T05:00Z", "2027-01-01T20:00Z")];
    expect(intersect(a, b)).toEqual([{ start: "2027-01-01T05:00Z", end: "2027-01-01T10:00Z", hours: 5, open_start: false, open_end: false }]);
  });
});

describe("analyze", () => {
  const a = analyze(year, "2027-01-01T12:00Z", 72);

  test("totals sunlight, Earth and overlap over the window", () => {
    if (!a.ok) throw new Error(a.error);
    expect(a.sunHours).toBe(42);       // 18 h, then 3 Jan 12:00 → T+72 (4 Jan 12:00) = 24 h
    expect(a.earthHours).toBe(54);     // 1 Jan 18:00 → 4 Jan 00:00
    expect(a.bothHours).toBe(24);      // 1 Jan 18:00→2 Jan 06:00 (12) + 3 Jan 12:00→4 Jan 00:00 (12)
  });

  test("lists rise and set events with hours after touchdown, open edges excluded", () => {
    if (!a.ok) throw new Error(a.error);
    expect(a.events.map((e) => `${e.kind}@${e.hoursAfter}`)).toEqual([
      "earthrise@6", "sunset@18", "sunrise@48", "earthset@60",
    ]);
  });

  test("reports the state at touchdown and the next change of each body", () => {
    if (!a.ok) throw new Error(a.error);
    expect(a.atTouchdown).toEqual({ sun: true, earth: false });
    expect(a.next.sun?.kind).toBe("sunset");
    expect(a.next.earth?.kind).toBe("earthrise");
  });

  test("rejects a touchdown outside the stored span", () => {
    const bad = analyze(year, "2027-01-30T00:00Z", 72);
    expect(bad.ok).toBe(false);
  });
});
