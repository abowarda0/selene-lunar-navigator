import { readFileSync } from "node:fs";
import type { VisWindow, YearData } from "../api/types";
import { clip } from "./analysis";
import { earthViewWindows, skylineAt } from "./earthView";

const load = (id: string): YearData => (JSON.parse(readFileSync(`public/data/year_${id}.json`, "utf8")) as { data: YearData }).data;
const hours = (ws: readonly VisWindow[]): number => ws.reduce((h, w) => h + (Date.parse(w.end) - Date.parse(w.start)) / 3_600_000, 0);

/** Hours of `a` that fall inside `b`. */
function overlapHours(a: readonly VisWindow[], b: readonly VisWindow[]): number {
  return a.reduce((h, w) => h + hours(clip(b, w.start, w.end)), 0);
}

describe("skylineAt", () => {
  const h = { az_step_deg: 90, elev_deg: [0, 10, 20, 30] };
  it("interpolates between bins and wraps at 360°", () => {
    expect(skylineAt(h, 45)).toBeCloseTo(5);
    expect(skylineAt(h, 315)).toBeCloseTo(15);
    expect(skylineAt(h, -45)).toBeCloseTo(15);
  });
});

describe("earthViewWindows", () => {
  it.each(["malapert_massif", "mons_mouton_plateau", "chandrayaan3"])("%s: the DSN link sits inside Earth-in-view time", (id) => {
    const y = load(id);
    const view = earthViewWindows(y);
    const link = y.windows.earth;
    expect(view.length).toBeGreaterThan(0);
    // A two-way link needs Earth above the skyline, so almost all link time must be Earth-in-view time
    // (the small rest is the ±15 min edge error of the 30-minute track).
    expect(overlapHours(link, view) / hours(link)).toBeGreaterThan(0.97);
    // And Earth is in view at least as long as the link is open.
    expect(hours(view)).toBeGreaterThanOrEqual(hours(link) * 0.97);
  });

  it("returns sorted, non-overlapping windows inside the year span", () => {
    const y = load("malapert_massif");
    const view = earthViewWindows(y);
    for (let i = 0; i < view.length; i += 1) {
      expect(Date.parse(view[i].end)).toBeGreaterThan(Date.parse(view[i].start));
      if (i > 0) expect(Date.parse(view[i].start)).toBeGreaterThanOrEqual(Date.parse(view[i - 1].end));
    }
    expect(Date.parse(view[0].start)).toBeGreaterThanOrEqual(Date.parse(y.span_start));
  });
});
