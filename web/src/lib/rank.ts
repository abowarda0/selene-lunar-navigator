/**
 * Ranking plans by date or by site. Sort key (SORT_RULE): verdict (Good > Marginal > Poor), then the
 * shortest dark spell, then the most sunlight, then the shortest silence from Earth, then the most contact.
 */
import type { Site, VerdictLevel, YearData } from "../api/types";
import { clip } from "./analysis";
import { toMs } from "./format";
import type { LanderPlan } from "./landers";
import { panelOption } from "./powerPlan";
import { planVerdict } from "./verdict";

const MS_PER_H = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_H;
const RANK: Readonly<Record<VerdictLevel, number>> = { good: 0, marginal: 1, poor: 2 };

export const SORT_RULE = "Good plans first, then Marginal, then Poor. Within each: the shortest dark spell, then the most sunlight, then the shortest silence from Earth, then the most contact.";

export interface PlanMetrics {
  readonly start: string;
  readonly verdict: VerdictLevel;
  readonly lowestSocPct: number;
  readonly sunPct: number;
  readonly linkPct: number;
  readonly longestLinkGapH: number;
  readonly longestDarkH: number;
}

export interface SiteMetrics extends PlanMetrics {
  readonly site: Site;
}

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16) + "Z";

/** Verdict and headline figures for one plan; null when the plan leaves the stored span. */
export function evaluatePlan(year: YearData, start: string, hours: number, lander: LanderPlan): PlanMetrics | null {
  const t0 = toMs(start);
  const t1 = t0 + hours * MS_PER_H;
  if (Number.isNaN(t0) || hours <= 0 || t0 < toMs(year.span_start) || t1 > toMs(year.span_stop)) return null;
  const span = { start: iso(t0), stop: iso(t1) };
  const link = clip(year.windows.earth, span.start, span.stop);
  const useMast = lander.mast && !!year.windows.sun_mast10;
  const o = panelOption(year, span, lander, useMast, link);
  if (!o) return null;
  const v = planVerdict(o.power, lander.spec.minSocPct, o.sun, link, span.start, span.stop);
  return {
    start: span.start,
    verdict: v.level,
    lowestSocPct: o.power.lowestSocPct,
    sunPct: (o.sunHours / hours) * 100,
    linkPct: v.comms.sharePct,
    longestLinkGapH: v.comms.longestGapH,
    longestDarkH: o.longestDarkH,
  };
}

export function compareMetrics(a: PlanMetrics, b: PlanMetrics): number {
  return RANK[a.verdict] - RANK[b.verdict]
    || a.longestDarkH - b.longestDarkH
    || b.sunPct - a.sunPct
    || a.longestLinkGapH - b.longestLinkGapH
    || b.linkPct - a.linkPct;
}

export const rankRows = <T extends PlanMetrics>(rows: readonly T[]): T[] => [...rows].sort(compareMetrics);

/** One 00:00 UTC touchdown per day, keeping touchdown + hours inside the span. */
export function dailyStarts(spanStart: string, spanStop: string, hours: number): string[] {
  const first = Math.ceil(toMs(spanStart) / MS_PER_DAY) * MS_PER_DAY;
  const last = toMs(spanStop) - hours * MS_PER_H;
  const out: string[] = [];
  for (let t = first; t <= last; t += MS_PER_DAY) out.push(iso(t));
  return out;
}

/** Every daily touchdown at one site, in date order. */
export function evaluateDates(year: YearData, hours: number, lander: LanderPlan): PlanMetrics[] {
  return dailyStarts(year.span_start, year.span_stop, hours).flatMap((s) => {
    const r = evaluatePlan(year, s, hours, lander);
    return r ? [r] : [];
  });
}

export function rankSites(entries: readonly { readonly site: Site; readonly year: YearData }[], start: string, hours: number, lander: LanderPlan): { ranked: SiteMetrics[]; outside: Site[] } {
  const rows: SiteMetrics[] = [];
  const outside: Site[] = [];
  for (const e of entries) {
    const r = evaluatePlan(e.year, start, hours, lander);
    if (r) rows.push({ ...r, site: e.site });
    else outside.push(e.site);
  }
  return { ranked: rankRows(rows), outside };
}
