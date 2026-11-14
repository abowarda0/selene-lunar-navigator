import type { VisWindow, YearData } from "../api/types";
import type { DomeData } from "../components/SkyDome";
import type { Analysis } from "../lib/analysis";
import { toMs } from "../lib/format";

export interface Plan {
  readonly site: string;
  /** YYYY-MM-DD, UTC */
  readonly date: string;
  /** HH:MM, UTC */
  readonly time: string;
  readonly hours: number;
}

/**
 * Demo default: Mons Mouton Plateau (Artemis III region), landing 17 Dec 2026, 14 days. It is Good, and a
 * 24 h launch slip turns it Poor (the mission ends in about 14 h of darkness): the challenge's slip story.
 */
export const DEFAULT_PLAN: Plan = { site: "mons_mouton_plateau", date: "2026-12-17", time: "00:00", hours: 336 };
/** Plan durations offered in the plan bar, in days. */
export const DURATION_DAYS: readonly number[] = [3, 7, 14, 30];
/** Daylight at one spot lasts about 14.8 Earth days, so longer missions always meet the lunar night. */
export const durationLabel = (days: number): string => `${days} days${days > 14.8 ? " (meets night)" : ""}`;

export const touchdownOf = (p: Plan): string => `${p.date}T${p.time}Z`;

/** The plan with its touchdown moved to an ISO minute timestamp. */
export const atTouchdown = (p: Plan, iso: string): Plan => ({ ...p, date: iso.slice(0, 10), time: iso.slice(11, 16) });

export const shiftPlan = (p: Plan, hours: number): Plan => atTouchdown(p, new Date(toMs(touchdownOf(p)) + hours * 3_600_000).toISOString());

/** Sky positions for the analysed hours, cut from the year's 30-minute track, in the shape the dome draws. */
export function domeData(year: YearData, a: Extract<Analysis, { ok: true }>): DomeData {
  const tr = year.track;
  const step = tr.step_min * 60_000;
  const i0 = Math.max(0, Math.floor((toMs(a.start) - toMs(tr.t0)) / step));
  const i1 = Math.min(tr.sun_az.length - 1, Math.ceil((toMs(a.stop) - toMs(tr.t0)) / step));
  const t: string[] = [];
  for (let i = i0; i <= i1; i += 1) t.push(new Date(toMs(tr.t0) + i * step).toISOString().slice(0, 16) + "Z");
  const cut = (arr: readonly number[]) => arr.slice(i0, i1 + 1);
  const win = (ws: readonly VisWindow[]) => ws;
  return {
    scenario: { site: year.site, start: a.start },
    horizon: year.horizon,
    series: { t, sun_az: cut(tr.sun_az), sun_el: cut(tr.sun_el), earth_az: cut(tr.earth_az), earth_el: cut(tr.earth_el) },
    windows: { sun: win(a.sun), earth: win(a.earth) },
  };
}
