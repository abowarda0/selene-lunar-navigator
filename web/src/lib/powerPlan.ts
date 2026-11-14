/** Runs the power simulation for the analysed plan at deck height and, if stored, on the 10 m mast. */
import type { VisWindow, YearData } from "../api/types";
import { clip } from "./analysis";
import type { LanderPlan } from "./landers";
import { darkSpells, simulatePower, type PowerResult } from "./power";
import { visibleSunFactor } from "./sunFactor";
import type { SunFactor } from "./power";
import { planVerdict, type PlanVerdict } from "./verdict";

export interface PanelOption {
  readonly mast: boolean;
  readonly sun: readonly VisWindow[];
  readonly sunHours: number;
  readonly longestDarkH: number;
  readonly power: PowerResult;
  /** True when panel power is scaled by the visible share of the Sun's disc. */
  readonly partialSun: boolean;
}

export interface PowerPlan {
  readonly chosen: PanelOption;
  readonly other: PanelOption | null;
  readonly verdict: PlanVerdict;
  readonly link: readonly VisWindow[];
}

export interface PlanSpan {
  readonly start: string;
  readonly stop: string;
}

const hoursOf = (ws: readonly VisWindow[]): number => ws.reduce((h, w) => h + (Date.parse(w.end) - Date.parse(w.start)) / 3_600_000, 0);

const factorCache = new WeakMap<YearData, SunFactor>();
/** The visible-disc share depends only on the year file, so it is computed once per file. */
export function sunFactorOf(year: YearData): SunFactor {
  const hit = factorCache.get(year);
  if (hit) return hit;
  const f = visibleSunFactor(year);
  factorCache.set(year, f);
  return f;
}

export function panelOption(year: YearData, span: PlanSpan, lander: LanderPlan, mast: boolean, link: readonly VisWindow[]): PanelOption | null {
  const src = mast ? year.windows.sun_mast10 : year.windows.sun;
  if (!src) return null;
  const sun = clip(src, span.start, span.stop);
  // the track's skyline is the 2 m one, so the partial-disc share is only valid at deck height
  const partialSun = !mast && year.track.sun_el.length > 0 && year.horizon.elev_deg.length > 0;
  const power = simulatePower({ start: span.start, stop: span.stop, sun, link, lander: lander.spec, sunFactor: partialSun ? sunFactorOf(year) : undefined });
  const longestDarkH = darkSpells(sun, span.start, span.stop).reduce((m, g) => Math.max(m, g.hours), 0);
  return { mast, sun, sunHours: hoursOf(sun), longestDarkH, power, partialSun };
}

export function planPower(year: YearData, span: PlanSpan, lander: LanderPlan): PowerPlan {
  const link = clip(year.windows.earth, span.start, span.stop);
  const useMast = lander.mast && !!year.windows.sun_mast10;
  const chosen = panelOption(year, span, lander, useMast, link) as PanelOption;
  const other = panelOption(year, span, lander, !useMast, link);
  return { chosen, other, link, verdict: planVerdict(chosen.power, lander.spec.minSocPct, link, span.start, span.stop) };
}
