/**
 * Touchdown analysis: the backend's minute-accurate windows clipped to touchdown + N hours.
 * Mirrors spike/lunar/fine.py clip_windows and visibility.intersect_windows exactly, so the
 * static demo and the proposed /api/analysis endpoint give the same numbers.
 */
import type { VisWindow } from "../api/types";
import { toMs } from "./format";

const MS_PER_H = 3_600_000;

export interface YearWindows {
  readonly span_start: string;
  readonly span_stop: string;
  readonly windows: { readonly sun: readonly VisWindow[]; readonly earth: readonly VisWindow[] };
}

export type EventKind = "sunrise" | "sunset" | "earthrise" | "earthset";
export interface SkyEvent {
  readonly kind: EventKind;
  readonly t: string;
  readonly hoursAfter: number;
}

export type Analysis =
  | {
      readonly ok: true;
      readonly start: string;
      readonly stop: string;
      readonly hours: number;
      readonly sun: readonly VisWindow[];
      readonly earth: readonly VisWindow[];
      readonly both: readonly VisWindow[];
      readonly sunHours: number;
      readonly earthHours: number;
      readonly bothHours: number;
      readonly events: readonly SkyEvent[];
      readonly atTouchdown: { readonly sun: boolean; readonly earth: boolean };
      readonly next: { readonly sun: SkyEvent | null; readonly earth: SkyEvent | null };
    }
  | { readonly ok: false; readonly error: string };

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16) + "Z";
const round = (h: number): number => Math.round(h * 100) / 100;
const mk = (a: number, b: number, os: boolean, oe: boolean): VisWindow => ({ start: iso(a), end: iso(b), hours: round((b - a) / MS_PER_H), open_start: os, open_end: oe });

export function clip(windows: readonly VisWindow[], start: string, stop: string): VisWindow[] {
  const s0 = toMs(start);
  const s1 = toMs(stop);
  const out: VisWindow[] = [];
  for (const w of windows) {
    const a = Math.max(toMs(w.start), s0);
    const b = Math.min(toMs(w.end), s1);
    if (a >= b) continue;
    out.push(mk(a, b, w.open_start || a > toMs(w.start), w.open_end || b < toMs(w.end)));
  }
  return out;
}

export function intersect(a: readonly VisWindow[], b: readonly VisWindow[]): VisWindow[] {
  const out: VisWindow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(toMs(a[i].start), toMs(b[j].start));
    const e = Math.min(toMs(a[i].end), toMs(b[j].end));
    if (s < e) {
      const os = (s === toMs(a[i].start) && a[i].open_start) || (s === toMs(b[j].start) && b[j].open_start);
      const oe = (e === toMs(a[i].end) && a[i].open_end) || (e === toMs(b[j].end) && b[j].open_end);
      out.push(mk(s, e, os, oe));
    }
    if (toMs(a[i].end) <= toMs(b[j].end)) i += 1;
    else j += 1;
  }
  return out;
}

const total = (ws: readonly VisWindow[]): number => round(ws.reduce((h, w) => h + (toMs(w.end) - toMs(w.start)) / MS_PER_H, 0));

function events(ws: readonly VisWindow[], body: "sun" | "earth", t0: number): SkyEvent[] {
  const ev = (t: string, kind: EventKind): SkyEvent => ({ kind, t, hoursAfter: round((toMs(t) - t0) / MS_PER_H) });
  return ws.flatMap((w) => [
    ...(w.open_start ? [] : [ev(w.start, body === "sun" ? "sunrise" : "earthrise")]),
    ...(w.open_end ? [] : [ev(w.end, body === "sun" ? "sunset" : "earthset")]),
  ]);
}

/** Sun, Earth and overlap for the hours after a touchdown. */
export function analyze(year: YearWindows, touchdown: string, hours: number): Analysis {
  const t0 = toMs(touchdown);
  const t1 = t0 + hours * MS_PER_H;
  if (Number.isNaN(t0) || hours <= 0) return { ok: false, error: "Pick a touchdown date, time and a window longer than 0 hours." };
  if (t0 < toMs(year.span_start) || t1 > toMs(year.span_stop)) {
    return { ok: false, error: `This build covers touchdowns from ${year.span_start.slice(0, 10)} until ${hours} h before ${year.span_stop.slice(0, 10)}.` };
  }
  const stop = iso(t1);
  const sun = clip(year.windows.sun, touchdown, stop);
  const earth = clip(year.windows.earth, touchdown, stop);
  const both = intersect(sun, earth);
  const all = [...events(sun, "sun", t0), ...events(earth, "earth", t0)].sort((a, b) => toMs(a.t) - toMs(b.t));
  const up = (ws: readonly VisWindow[]) => ws.some((w) => toMs(w.start) <= t0 && t0 < toMs(w.end));
  const firstOf = (kinds: readonly EventKind[]) => all.find((e) => kinds.includes(e.kind)) ?? null;
  return {
    ok: true, start: iso(t0), stop, hours, sun, earth, both,
    sunHours: total(sun), earthHours: total(earth), bothHours: total(both),
    events: all,
    atTouchdown: { sun: up(sun), earth: up(earth) },
    next: { sun: firstOf(["sunrise", "sunset"]), earth: firstOf(["earthrise", "earthset"]) },
  };
}
