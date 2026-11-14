/**
 * The team's promise for a launch slip: how many hours of simultaneous sunlight (power) and Earth
 * (direct-to-Earth comms) does the mission gain or lose in the first 72 h after touchdown, and why.
 *
 * Everything is read from the year file's windows (backend values); this only clips, intersects and
 * subtracts them on the shared "hours after touchdown" axis.
 */
import type { VisWindow, YearData } from "../api/types";
import { clip, intersect } from "./analysis";
import { earthViewWindows } from "./earthView";
import { toMs } from "./format";

export const FIRST_HOURS = 72;
/** Changes shorter than this are dish hand-overs or edge rounding, not a real gain or loss (line of sight is ±15 min). */
export const MIN_CHANGE_H = 0.25;
const MS_PER_H = 3_600_000;

/** "view": any part of Earth above the hills (line of sight, the promise); "link": a NASA DSN dish can talk. */
export type EarthMode = "view" | "link";

/** [start, end) in hours after touchdown. */
export type Span = readonly [number, number];

export interface Overlap72 {
  readonly start: string;
  readonly hours: number;
  /** Sun and Earth both available. */
  readonly both: readonly Span[];
  readonly sun: readonly Span[];
  readonly earth: readonly Span[];
}

export interface Cause {
  /** Elapsed hours where the change starts and ends. */
  readonly span: Span;
  readonly kind: "lost" | "gained";
  /** What is missing on the date that lacks overlap here. */
  readonly missing: "sun" | "earth" | "both";
}

export interface SlipOverlap {
  readonly planned: Overlap72;
  readonly late: Overlap72;
  readonly deltaH: number;
  readonly lost: readonly Span[];
  readonly gained: readonly Span[];
  readonly causes: readonly Cause[];
}

const rel = (ws: readonly VisWindow[], t0: number): Span[] => ws.map((w) => [(toMs(w.start) - t0) / MS_PER_H, (toMs(w.end) - t0) / MS_PER_H] as const);
export const spanHours = (xs: readonly Span[]): number => xs.reduce((h, [a, b]) => h + (b - a), 0);

export const earthWindows = (year: YearData, mode: EarthMode): readonly VisWindow[] => (mode === "view" ? earthViewWindows(year) : year.windows.earth);

/** Sun, Earth and their overlap in the first `hours` after a touchdown; null outside the stored span. */
export function overlapFirst(year: YearData, start: string, mode: EarthMode, hours = FIRST_HOURS): Overlap72 | null {
  const t0 = toMs(start);
  const t1 = t0 + hours * MS_PER_H;
  if (Number.isNaN(t0) || t0 < toMs(year.span_start) || t1 > toMs(year.span_stop)) return null;
  const stop = new Date(t1).toISOString().slice(0, 16) + "Z";
  const sun = clip(year.windows.sun, start, stop);
  const earth = clip(earthWindows(year, mode), start, stop);
  return { start, hours, sun: rel(sun, t0), earth: rel(earth, t0), both: rel(intersect(sun, earth), t0) };
}

/** Parts of `a` not covered by `b` (both sorted, non-overlapping). */
export function subtract(a: readonly Span[], b: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const [s0, e0] of a) {
    let s = s0;
    for (const [bs, be] of b) {
      if (be <= s || bs >= e0) continue;
      if (bs > s) out.push([s, Math.min(bs, e0)]);
      s = Math.max(s, be);
      if (s >= e0) break;
    }
    if (s < e0) out.push([s, e0]);
  }
  return out.filter(([s, e]) => e - s > 1 / 120);
}

const inside = (xs: readonly Span[], h: number): boolean => xs.some(([a, b]) => a <= h && h < b);

function missingAt(o: Overlap72, h: number): Cause["missing"] {
  const sun = inside(o.sun, h);
  const earth = inside(o.earth, h);
  return !sun && !earth ? "both" : !sun ? "sun" : "earth";
}

/** Planned against late: overlap totals, the difference, and what causes each lost or gained stretch. */
export function compareSlip(year: YearData, plannedStart: string, lateStart: string, mode: EarthMode): SlipOverlap | null {
  const planned = overlapFirst(year, plannedStart, mode);
  const late = overlapFirst(year, lateStart, mode);
  if (!planned || !late) return null;
  const lost = subtract(planned.both, late.both).filter(([a, b]) => b - a >= MIN_CHANGE_H);
  const gained = subtract(late.both, planned.both).filter(([a, b]) => b - a >= MIN_CHANGE_H);
  const causes: Cause[] = [
    ...lost.map((span) => ({ span, kind: "lost" as const, missing: missingAt(late, (span[0] + span[1]) / 2) })),
    ...gained.map((span) => ({ span, kind: "gained" as const, missing: missingAt(planned, (span[0] + span[1]) / 2) })),
  ].sort((x, y) => x.span[0] - y.span[0]);
  return { planned, late, deltaH: spanHours(late.both) - spanHours(planned.both), lost, gained, causes };
}

const h1 = (h: number): string => h.toFixed(1);
const at = (h: number): string => `T+${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}m`;
const WHAT: Record<EarthMode, string> = { view: "power + comms overlap (Sun and Earth both in view)", link: "power + DSN-link overlap" };
const MISSING: Record<Cause["missing"], string> = { sun: "the Sun is behind the hills", earth: "Earth is out of sight", both: "the Sun and Earth are both hidden" };
const MISSING_LINK: Record<Cause["missing"], string> = { sun: "the Sun is behind the hills", earth: "no NASA dish can reach the lander", both: "the Sun is down and no dish can reach the lander" };

/** "A 24 h delay loses 12.0 h of power + comms overlap in the first 72 h (36.0 → 24.0 h)." */
export function overlapHeadline(delayLabel: string, s: SlipOverlap, mode: EarthMode): string {
  const a = spanHours(s.planned.both);
  const b = spanHours(s.late.both);
  const what = WHAT[mode];
  if (Math.abs(s.deltaH) < 0.05) return `A ${delayLabel} delay keeps the same ${h1(a)} h of ${what} in the first ${FIRST_HOURS} h.`;
  return `A ${delayLabel} delay ${s.deltaH < 0 ? "loses" : "gains"} ${h1(Math.abs(s.deltaH))} h of ${what} in the first ${FIRST_HOURS} h (${h1(a)} → ${h1(b)} h).`;
}

/** The biggest change, in words: when it starts and what is missing. */
export function overlapWhy(s: SlipOverlap, mode: EarthMode): string | null {
  const main = [...s.causes].sort((x, y) => (y.span[1] - y.span[0]) - (x.span[1] - x.span[0]))[0];
  if (!main) return s.planned.both.length ? "Overlap falls at the same hours after touchdown on both dates." : null;
  const words = (mode === "link" ? MISSING_LINK : MISSING)[main.missing];
  const len = h1(main.span[1] - main.span[0]);
  return main.kind === "lost"
    ? `From ${at(main.span[0])} the late date loses ${len} h of overlap: ${words} then.`
    : `From ${at(main.span[0])} the late date gains ${len} h of overlap, while on the planned date ${words}.`;
}
