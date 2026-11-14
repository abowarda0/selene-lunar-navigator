import { describe, expect, test } from "vitest";
import type { VisWindow, YearData } from "../api/types";
import { DEFAULT_LANDER } from "./landers";
import { planPower } from "./powerPlan";

const w = (start: string, end: string): VisWindow => ({ start, end, hours: 0, open_start: false, open_end: false });

const base = {
  site: { id: "x", name: "X", lat: -89, lon_e: 0, kind: "candidate", terrain: true, coord_source: "", verified: true },
  span_start: "2027-01-01T00:00Z",
  span_stop: "2027-02-01T00:00Z",
  visibility_step_min: 1,
  source: { ephemeris: "", terrain: "", observer_height_m: 2 },
  track: { t0: "2027-01-01T00:00Z", step_min: 30, sun_az: [], sun_el: [], earth_az: [], earth_el: [] },
  horizon: { az_step_deg: 1, elev_deg: [] },
  notes: [],
} as const;

const span = { start: "2027-01-01T00:00Z", stop: "2027-01-04T00:00Z" };

describe("planPower", () => {
  test("uses the mast windows when asked and reports the deck as the other option", () => {
    const year: YearData = {
      ...base,
      windows: {
        sun: [w("2027-01-01T00:00Z", "2027-01-02T00:00Z")],
        earth: [w("2027-01-01T00:00Z", "2027-01-04T00:00Z")],
        sun_mast10: [w("2027-01-01T00:00Z", "2027-01-03T00:00Z")],
      },
    };
    const p = planPower(year, span, { ...DEFAULT_LANDER, mast: true });
    expect(p.chosen.mast).toBe(true);
    expect(p.chosen.sunHours).toBe(48);
    expect(p.other?.mast).toBe(false);
    expect(p.other?.longestDarkH).toBe(48);
    expect(p.verdict.comms.level).toBe("good");
  });

  test("falls back to deck height and offers no other option without mast data", () => {
    const year: YearData = { ...base, windows: { sun: [w("2027-01-01T00:00Z", "2027-01-02T00:00Z")], earth: [] } };
    const p = planPower(year, span, { ...DEFAULT_LANDER, mast: true });
    expect(p.chosen.mast).toBe(false);
    expect(p.other).toBeNull();
    expect(p.verdict.comms.level).toBe("poor");
  });
});
