/** Suggested spacecraft setups: panel size, pole, and the smallest battery that survives this plan. */
import type { YearData } from "../api/types";
import type { LanderPlan } from "./landers";
import { planPower, type PlanSpan } from "./powerPlan";

export interface Suggestion {
  readonly lander: LanderPlan;
  readonly survives: boolean;
  readonly lowestSocPct: number;
  /** Batteries this large are beyond today's lunar landers (illustrative threshold). */
  readonly unrealistic: boolean;
}

const PANEL_OPTIONS_W = [200, 450, 1000, 2000];
const MARGIN = 1.15;            // 15% spare capacity on top of the bare minimum
const MAX_TRIES = 6;
const UNREALISTIC_KWH = 40;
const MAX_SUGGESTIONS = 4;

const roundUp = (kwh: number): number => Math.ceil(kwh * 10) / 10;

function sized(year: YearData, span: PlanSpan, base: LanderPlan, panelW: number, mast: boolean): Suggestion {
  let lander: LanderPlan = { preset: "custom", mast, spec: { ...base.spec, panelW } };
  const need = planPower(year, span, lander).chosen.power.batteryNeededKWh;
  let kwh = roundUp(Math.max(0.1, need * MARGIN));
  for (let i = 0; i < MAX_TRIES; i += 1) {
    lander = { ...lander, spec: { ...lander.spec, batteryKWh: kwh } };
    const p = planPower(year, span, lander).chosen.power;
    if (p.survives) return { lander, survives: true, lowestSocPct: p.lowestSocPct, unrealistic: kwh > UNREALISTIC_KWH };
    kwh = roundUp(kwh * 1.25);
  }
  return { lander, survives: false, lowestSocPct: 0, unrealistic: true };
}

/** Each panel size, on the deck and (where computed) on the 10 m pole, with the smallest battery that survives. */
export function suggestSetups(year: YearData, span: PlanSpan, current: LanderPlan): Suggestion[] {
  const panels = [...new Set([current.spec.panelW, ...PANEL_OPTIONS_W])].sort((a, b) => a - b);
  const masts = year.windows.sun_mast10 ? [false, true] : [false];
  const all = panels.flatMap((w) => masts.map((m) => sized(year, span, current, w, m)));
  return all
    .filter((s) => s.survives)
    .sort((a, b) => a.lander.spec.batteryKWh - b.lander.spec.batteryKWh || a.lander.spec.panelW - b.lander.spec.panelW)
    .slice(0, MAX_SUGGESTIONS);
}
