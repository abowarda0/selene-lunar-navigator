import { describe, expect, test } from "vitest";
import type { VisWindow, YearData } from "../api/types";
import { DEFAULT_LANDER } from "./landers";
import { suggestSetups } from "./suggest";

const w = (start: string, end: string): VisWindow => ({ start, end, hours: 0, open_start: false, open_end: false });
const base = {
  site: { id: "x", name: "X", lat: -89, lon_e: 0, kind: "candidate", terrain: true, coord_source: "", verified: true },
  span_start: "2027-01-01T00:00Z", span_stop: "2027-02-01T00:00Z", visibility_step_min: 1,
  source: { ephemeris: "", terrain: "", observer_height_m: 2 },
  track: { t0: "2027-01-01T00:00Z", step_min: 30, sun_az: [], sun_el: [], earth_az: [], earth_el: [] },
  horizon: { az_step_deg: 1, elev_deg: [] }, notes: [],
} as const;
const span = { start: "2027-01-01T00:00Z", stop: "2027-01-05T00:00Z" };
// Sun for the first day only, then 3 days dark; the mast sees one more day of Sun.
const year: YearData = { ...base, windows: {
  sun: [w("2027-01-01T00:00Z", "2027-01-02T00:00Z")],
  sun_mast10: [w("2027-01-01T00:00Z", "2027-01-03T00:00Z")],
  earth: [w("2027-01-01T00:00Z", "2027-01-05T00:00Z")],
} };

describe("suggestSetups", () => {
  test("every suggestion survives the plan with its own battery", () => {
    const out = suggestSetups(year, span, DEFAULT_LANDER);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) expect(s.survives).toBe(true);
  });

  test("the mast needs a smaller battery than the deck for the same panels", () => {
    const out = suggestSetups(year, span, DEFAULT_LANDER);
    const deck = out.find((s) => !s.lander.mast && s.lander.spec.panelW === DEFAULT_LANDER.spec.panelW);
    const mast = out.find((s) => s.lander.mast && s.lander.spec.panelW === DEFAULT_LANDER.spec.panelW);
    expect(deck && mast).toBeTruthy();
    expect(mast!.lander.spec.batteryKWh).toBeLessThan(deck!.lander.spec.batteryKWh);
  });

  test("is sorted by battery size, lightest first, and keeps the loads", () => {
    const out = suggestSetups(year, span, DEFAULT_LANDER);
    const kwh = out.map((s) => s.lander.spec.batteryKWh);
    expect([...kwh].sort((a, b) => a - b)).toEqual(kwh);
    expect(out.every((s) => s.lander.spec.darkLoadW === DEFAULT_LANDER.spec.darkLoadW)).toBe(true);
  });
});
