/**
 * Solar elevation angle, the challenge's key power metric, read from the backend's 30-minute sky track
 * (Horizons) and the LOLA skyline. Display only: Sun visibility itself still comes from the minute-accurate
 * backend windows.
 */
import type { YearData } from "../api/types";
import { skylineAt } from "./earthView";
import { toMs } from "./format";

export interface SunHeight {
  /** Elevation of the Sun's centre above the flat (astronomical) horizon, degrees. */
  readonly elDeg: number;
  /** Terrain skyline at the Sun's azimuth, degrees. */
  readonly skylineDeg: number;
  /** elDeg − skylineDeg: how far the Sun's centre clears the hills (negative = behind them). */
  readonly clearanceDeg: number;
  readonly azDeg: number;
}

const lerpAz = (a: number, b: number, f: number): number => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * f) % 360) + 360) % 360;
};

/** Sun elevation, azimuth and clearance over the skyline at one moment (linear between track samples). */
export function sunHeightAt(year: YearData, at: string): SunHeight | null {
  const tr = year.track;
  const step = tr.step_min * 60_000;
  const x = (toMs(at) - toMs(tr.t0)) / step;
  const n = tr.sun_el.length;
  if (!Number.isFinite(x) || x < 0 || x > n - 1) return null;
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  const elDeg = tr.sun_el[i] + (tr.sun_el[i + 1] - tr.sun_el[i]) * f;
  const azDeg = lerpAz(tr.sun_az[i], tr.sun_az[i + 1], f);
  const skylineDeg = skylineAt(year.horizon, azDeg);
  return { elDeg, skylineDeg, clearanceDeg: elDeg - skylineDeg, azDeg };
}

/** Highest solar elevation between two moments, from the track samples. */
export function maxSunElevation(year: YearData, start: string, stop: string): number | null {
  const tr = year.track;
  const step = tr.step_min * 60_000;
  const i0 = Math.max(0, Math.ceil((toMs(start) - toMs(tr.t0)) / step));
  const i1 = Math.min(tr.sun_el.length - 1, Math.floor((toMs(stop) - toMs(tr.t0)) / step));
  if (i1 < i0) return null;
  let max = -Infinity;
  for (let i = i0; i <= i1; i += 1) max = Math.max(max, tr.sun_el[i]);
  return max;
}
