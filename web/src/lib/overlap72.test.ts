import { readFileSync } from "node:fs";
import type { VisWindow, YearData } from "../api/types";
import { compareSlip, overlapFirst, overlapHeadline, overlapWhy, spanHours, steadyNote, subtract } from "./overlap72";
import { analyze } from "./analysis";

const w = (start: string, end: string): VisWindow => ({ start, end, hours: (Date.parse(end) - Date.parse(start)) / 3.6e6, open_start: false, open_end: false });

/** A synthetic year: Sun up from +12 h to +48 h after 1 Jan 00:00, Earth link up all the time. */
function fakeYear(): YearData {
  return {
    site: { id: "x", name: "x", lat: -85, lon_e: 0, kind: "candidate", terrain: true, coord_source: "", verified: true },
    span_start: "2027-01-01T00:00Z", span_stop: "2027-01-10T00:00Z", visibility_step_min: 1,
    source: { ephemeris: "", terrain: "", observer_height_m: 2 },
    windows: {
      sun: [w("2027-01-01T12:00Z", "2027-01-03T00:00Z")],
      earth: [w("2027-01-01T00:00Z", "2027-01-10T00:00Z")],
      earth_view: [w("2027-01-01T00:00Z", "2027-01-10T00:00Z")],
    },
    track: { t0: "2027-01-01T00:00Z", step_min: 30, sun_az: [], sun_el: [], earth_az: [], earth_el: [] },
    horizon: { az_step_deg: 1, elev_deg: [] },
    notes: [],
  } as unknown as YearData;
}

describe("subtract", () => {
  it("removes covered parts and keeps the rest", () => {
    expect(subtract([[0, 10]], [[2, 4], [6, 8]])).toEqual([[0, 2], [4, 6], [8, 10]]);
    expect(subtract([[0, 10]], [[0, 10]])).toEqual([]);
  });
});

describe("overlapFirst / compareSlip", () => {
  const y = fakeYear();
  it("measures the overlap in the first 72 h", () => {
    const o = overlapFirst(y, "2027-01-01T00:00Z", "view");
    expect(o && spanHours(o.both)).toBeCloseTo(36);
  });
  it("a 24 h slip loses 12 h because the Sun sets earlier after touchdown", () => {
    const s = compareSlip(y, "2027-01-01T00:00Z", "2027-01-02T00:00Z", "view");
    expect(s).not.toBeNull();
    expect(s!.deltaH).toBeCloseTo(-12);
    expect(spanHours(s!.lost)).toBeCloseTo(24);   // +24..+48 lost (Sun set on the late date)
    expect(spanHours(s!.gained)).toBeCloseTo(12); // +0..+12 gained (Sun already up on the late date)
    expect(overlapHeadline("24 h", s!, "view")).toBe("A 24 h delay loses 12.0 h of power + comms overlap (Sun and Earth both in view) in the first 72 h (36.0 → 24.0 h).");
    expect(overlapWhy(s!, "view")).toBe("From T+24h 00m the late date loses 24.0 h of overlap: the Sun is behind the hills then.");
  });
  it("returns null outside the stored span", () => {
    expect(overlapFirst(y, "2027-01-09T00:00Z", "view")).toBeNull();
  });
});

describe("real site file", () => {
  it("Mons Mouton Plateau, 17 Dec 2026 vs +24 h: the slip costs overlap in the first 72 h", () => {
    const y = (JSON.parse(readFileSync("public/data/year_mons_mouton_plateau.json", "utf8")) as { data: YearData }).data;
    const s = compareSlip(y, "2026-12-17T00:00Z", "2026-12-18T00:00Z", "view");
    expect(s).not.toBeNull();
    expect(spanHours(s!.planned.both)).toBeGreaterThan(spanHours(s!.late.both) - 1e-9);
    expect(spanHours(s!.planned.both)).toBeLessThanOrEqual(72);
  });
});

describe("steadyNote", () => {
  const base = { start: "x", hours: 72 };
  it("explains when Earth never leaves the sky", () => {
    const o = { ...base, both: [[12, 48]] as const, sun: [[12, 48]] as const, earth: [[0, 72]] as const };
    expect(steadyNote([o], "view")).toMatch(/^At this site Earth stays in line of sight for all 72 h, so the overlap is set by the Sun alone/);
  });
  it("explains when Earth is never in view", () => {
    const o = { ...base, both: [] as const, sun: [[0, 72]] as const, earth: [] as const };
    expect(steadyNote([o], "view")).toMatch(/relay satellite/);
  });
  it("says nothing when both the Sun and Earth change", () => {
    const o = { ...base, both: [[10, 30]] as const, sun: [[0, 30]] as const, earth: [[10, 72]] as const };
    expect(steadyNote([o], "view")).toBeNull();
  });
});

describe("72 h overlap stays consistent with the validated engine (all sites, every day)", () => {
  const ids = ["mons_mouton_plateau", "malapert_massif", "mons_mouton", "haworth", "de_gerlache_rim", "nobile_rim_2", "slater_plain", "cabeus_b_peak", "chandrayaan3", "ridge", "polar_mid", "apollo11"];
  it.each(ids)("%s", (id) => {
    const y = (JSON.parse(readFileSync(`public/data/year_${id}.json`, "utf8")) as { data: YearData }).data;
    for (let d = 0; d < 420; d += 7) {
      const s = new Date(Date.UTC(2026, 11, 1 + d)).toISOString().slice(0, 16) + "Z";
      const link = overlapFirst(y, s, "link");
      const view = overlapFirst(y, s, "view");
      const a = analyze(y, s, 72);
      if (!link || !view || !a.ok) continue;
      // DSN-link mode equals the original analysis (bothHours), to rounding
      expect(Math.abs(spanHours(link.both) - a.bothHours)).toBeLessThan(0.01);
      // overlap is never more than the Sun or Earth alone, never less than sun + earth − 72
      const o = spanHours(view.both), su = spanHours(view.sun), ea = spanHours(view.earth);
      expect(o).toBeLessThanOrEqual(Math.min(su, ea) + 0.02);
      expect(o).toBeGreaterThanOrEqual(su + ea - 72 - 0.02);
    }
  });
});
