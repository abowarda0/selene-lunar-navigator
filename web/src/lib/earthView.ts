/**
 * Earth in view (line of sight), as the challenge asks: any part of Earth's disc above the real skyline.
 * This is geometry only, not a radio link. The verdict keeps using the stricter two-way DSN link.
 *
 * Built from the backend's own year file: the 30-minute Earth track (Horizons) and the terrain skyline
 * (LOLA). Crossings are placed by linear interpolation between track samples, so window edges are good
 * to about ±15 min. Nothing here invents data; it re-reads the same arrays the 3D view draws.
 */
import type { VisWindow, YearData } from "../api/types";

/** Earth's apparent radius seen from the Moon (about 1.9° across). */
export const EARTH_RADIUS_DEG = 0.95;
export const EARTH_VIEW_EDGE_MIN = 15;

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16) + "Z";
const roundMin = (ms: number): number => Math.round(ms / 60_000) * 60_000;

/** Skyline elevation (degrees) at an azimuth, interpolated between profile bins. */
export function skylineAt(horizon: YearData["horizon"], azDeg: number): number {
  const n = horizon.elev_deg.length;
  if (n === 0) return 0;
  const x = ((((azDeg % 360) + 360) % 360) / horizon.az_step_deg);
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return horizon.elev_deg[i] * (1 - f) + horizon.elev_deg[(i + 1) % n] * f;
}

const cache = new WeakMap<YearData, VisWindow[]>();

/** Windows when any part of Earth is above the skyline, over the whole year file. */
export function earthViewWindows(year: YearData): VisWindow[] {
  // Custom points carry the pipeline's own minute-accurate windows; use them as they are.
  if (year.windows.earth_view) return [...year.windows.earth_view];
  const hit = cache.get(year);
  if (hit) return hit;
  const tr = year.track;
  const step = tr.step_min * 60_000;
  const t0 = Date.parse(tr.t0);
  const n = Math.min(tr.earth_az.length, tr.earth_el.length);
  const margin = (i: number): number => tr.earth_el[i] + EARTH_RADIUS_DEG - skylineAt(year.horizon, tr.earth_az[i]);
  const out: VisWindow[] = [];
  let openAt: number | null = null;
  let openStart = false;
  for (let i = 0; i < n; i += 1) {
    const m = margin(i);
    const t = t0 + i * step;
    if (i === 0) {
      if (m > 0) { openAt = t; openStart = true; }
      continue;
    }
    const mPrev = margin(i - 1);
    if ((mPrev > 0) === (m > 0)) continue;
    const cross = roundMin(t - step + (mPrev / (mPrev - m)) * step);
    if (m > 0) { openAt = cross; openStart = false; }
    else if (openAt !== null) {
      if (cross > openAt) out.push({ start: iso(openAt), end: iso(cross), hours: Math.round(((cross - openAt) / 3_600_000) * 100) / 100, open_start: openStart, open_end: false });
      openAt = null;
    }
  }
  if (openAt !== null) {
    const end = t0 + (n - 1) * step;
    if (end > openAt) out.push({ start: iso(openAt), end: iso(end), hours: Math.round(((end - openAt) / 3_600_000) * 100) / 100, open_start: openStart, open_end: true });
  }
  cache.set(year, out);
  return out;
}
