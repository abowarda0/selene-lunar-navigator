/**
 * Energy bookkeeping for a lander over the analysed plan: panels in Sun windows, loads, a radio
 * while the link is open, and a battery clamped between its floor and full. Integrated exactly
 * between window edges (net power is constant between them), so no minute loop is needed.
 * No thermal model, charge losses or cold capacity loss.
 */
import type { VisWindow } from "../api/types";
import { toMs } from "./format";

const MS_PER_H = 3_600_000;
const SAMPLE_MS = 30 * 60_000;

export interface Lander {
  readonly panelW: number;
  readonly batteryKWh: number;
  /** Lowest charge the battery may reach, percent of capacity. */
  readonly minSocPct: number;
  readonly sunLoadW: number;
  readonly darkLoadW: number;
  readonly commsW: number;
}

/** Share of panel power per track step (0..1), piecewise constant from t0. */
export interface SunFactor {
  readonly t0: string;
  readonly stepMin: number;
  readonly values: readonly number[];
}

export interface PowerInput {
  readonly start: string;
  readonly stop: string;
  readonly sun: readonly VisWindow[];
  readonly link: readonly VisWindow[];
  readonly lander: Lander;
  readonly sunFactor?: SunFactor;
}

export interface SocPoint {
  readonly h: number;
  readonly soc: number;
}

export interface PowerResult {
  readonly survives: boolean;
  readonly firstFloor: { readonly t: string; readonly hoursAfter: number } | null;
  readonly lowestSocPct: number;
  readonly batteryNeededKWh: number;
  readonly loadMetPct: number;
  readonly series: readonly SocPoint[];
}

export interface DarkSpell {
  readonly startH: number;
  readonly endH: number;
  readonly hours: number;
}

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16) + "Z";
type Span = readonly [number, number];
const spans = (ws: readonly VisWindow[]): Span[] => ws.map((w) => [toMs(w.start), toMs(w.end)] as const);
const inside = (ws: readonly Span[], ms: number): boolean => ws.some(([a, b]) => a <= ms && ms < b);

function breakpoints(input: PowerInput, t0: number, t1: number): number[] {
  const edges = [...input.sun, ...input.link].flatMap((w) => [toMs(w.start), toMs(w.end)]);
  const f = input.sunFactor;
  const steps: number[] = [];
  if (f) {
    const step = f.stepMin * 60_000;
    // a value holds for half a step either side of its sample
    const f0 = toMs(f.t0);
    const first = Math.ceil((t0 - f0 - step / 2) / step);
    for (let k = first; f0 + (k + 0.5) * step < t1; k += 1) steps.push(f0 + (k + 0.5) * step);
  }
  const all = [t0, t1, ...edges, ...steps].filter((t) => t >= t0 && t <= t1);
  return [...new Set(all)].sort((a, b) => a - b);
}

function factorAt(f: SunFactor | undefined, ms: number, f0: number): number {
  if (!f) return 1;
  const k = Math.round((ms - f0) / (f.stepMin * 60_000));
  const v = f.values[Math.max(0, Math.min(f.values.length - 1, k))];
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/** Net power in watts for each piece of the plan between window edges. */
function segments(input: PowerInput): { a: number; b: number; p: number }[] {
  const t0 = toMs(input.start);
  const t1 = toMs(input.stop);
  const pts = breakpoints(input, t0, t1);
  const L = input.lander;
  const sunSpans = spans(input.sun);
  const f0 = input.sunFactor ? toMs(input.sunFactor.t0) : 0;
  const linkSpans = spans(input.link);
  return pts.slice(1).map((b, i) => {
    const a = pts[i];
    const mid = (a + b) / 2;
    const sun = inside(sunSpans, mid);
    const link = inside(linkSpans, mid);
    const p = (sun ? L.panelW * factorAt(input.sunFactor, mid, f0) : 0) - (sun ? L.sunLoadW : L.darkLoadW) - (link ? L.commsW : 0);
    return { a, b, p };
  });
}

/** Usable energy needed so a battery that starts full never goes below zero: deepest drawdown from a running peak. */
function deepestDrawdownWh(segs: readonly { a: number; b: number; p: number }[]): number {
  let cum = 0;
  let peak = 0;
  let worst = 0;
  for (const s of segs) {
    cum += (s.p * (s.b - s.a)) / MS_PER_H;
    peak = Math.max(peak, cum);
    worst = Math.max(worst, peak - cum);
  }
  return worst;
}

export function simulatePower(input: PowerInput): PowerResult {
  const t0 = toMs(input.start);
  const t1 = toMs(input.stop);
  const L = input.lander;
  const cap = Math.max(0, L.batteryKWh) * 1000;
  const floor = (cap * L.minSocPct) / 100;
  const segs = segments(input);
  const pct = (e: number) => (cap > 0 ? (e / cap) * 100 : 0);
  const series: SocPoint[] = [];
  let e = cap;
  let lowest = cap;
  let unmetMs = 0;
  let firstFloorMs: number | null = null;
  let nextSample = t0;
  for (const s of segs) {
    const at = (t: number) => Math.min(cap, Math.max(floor, e + (s.p * (t - s.a)) / MS_PER_H));
    while (nextSample <= s.b) {
      series.push({ h: (nextSample - t0) / MS_PER_H, soc: pct(at(nextSample)) });
      nextSample += SAMPLE_MS;
    }
    if (s.p < 0) {
      const toFloorMs = ((e - floor) / -s.p) * MS_PER_H;
      if (toFloorMs < s.b - s.a) {
        unmetMs += s.b - s.a - toFloorMs;
        if (firstFloorMs == null) firstFloorMs = s.a + toFloorMs;
      }
    }
    e = at(s.b);
    lowest = Math.min(lowest, e);
  }
  if (segs.length === 0) series.push({ h: 0, soc: 100 });
  const usable = 1 - L.minSocPct / 100;
  const total = t1 - t0;
  return {
    survives: firstFloorMs == null,
    firstFloor: firstFloorMs == null ? null : { t: iso(firstFloorMs), hoursAfter: Math.round(((firstFloorMs - t0) / MS_PER_H) * 100) / 100 },
    lowestSocPct: pct(lowest),
    batteryNeededKWh: usable > 0 ? deepestDrawdownWh(segs) / usable / 1000 : Infinity,
    loadMetPct: total > 0 ? ((total - unmetMs) / total) * 100 : 100,
    series,
  };
}

/** Stretches without Sun inside the plan, in hours after the start. */
export function darkSpells(sun: readonly VisWindow[], start: string, stop: string): DarkSpell[] {
  const t0 = toMs(start);
  const t1 = toMs(stop);
  const h = (ms: number) => (ms - t0) / MS_PER_H;
  const lit = sun
    .map((w) => [Math.max(t0, toMs(w.start)), Math.min(t1, toMs(w.end))] as const)
    .filter(([a, b]) => a < b)
    .sort((x, y) => x[0] - y[0]);
  const out: DarkSpell[] = [];
  let cur = t0;
  for (const [a, b] of lit) {
    if (a > cur) out.push({ startH: h(cur), endH: h(a), hours: h(a) - h(cur) });
    cur = Math.max(cur, b);
  }
  if (cur < t1) out.push({ startH: h(cur), endH: h(t1), hours: h(t1) - h(cur) });
  return out;
}

/** Longest stretch with no window, in hours, inside [start, stop]. */
export const longestGap = (ws: readonly VisWindow[], start: string, stop: string): number =>
  darkSpells(ws, start, stop).reduce((m, g) => Math.max(m, g.hours), 0);
