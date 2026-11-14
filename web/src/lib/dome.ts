/**
 * Sky-dome projection: the view straight up from the lander.
 * Rim = horizon (0°), centre = zenith (90°). Square-root radial scale gives the low sky,
 * where polar Sun and Earth live, most of the room. North up, east right (compass style).
 */
import { toMs } from "./format";

const RAD = Math.PI / 180;

export function domeRadius(elDeg: number, rim: number): number {
  const e = Math.min(90, Math.max(0, elDeg));
  return rim * (1 - Math.sqrt(e / 90));
}

export function domePoint(azDeg: number, elDeg: number, cx: number, cy: number, rim: number): readonly [number, number] {
  const r = domeRadius(elDeg, rim);
  return [cx + r * Math.sin(azDeg * RAD), cy - r * Math.cos(azDeg * RAD)];
}

/** Index ranges [from, to] where elevation stays at or above the horizon, two samples or more. */
export function trackSegments(az: readonly number[], el: readonly number[]): ReadonlyArray<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  let from = -1;
  for (let i = 0; i <= el.length; i += 1) {
    const up = i < el.length && el[i] >= 0;
    if (up && from < 0) from = i;
    if (!up && from >= 0) {
      if (i - 1 > from) out.push([from, i - 1]);
      from = -1;
    }
  }
  return az.length ? out : [];
}

export function trackPath(az: readonly number[], el: readonly number[], cx: number, cy: number, rim: number): string {
  return trackSegments(az, el)
    .map(([a, b]) => {
      let d = "";
      for (let i = a; i <= b; i += 1) {
        const [x, y] = domePoint(az[i], el[i], cx, cy, rim);
        d += `${i === a ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return d;
    })
    .join("");
}

/** Closed path of the terrain skyline, one vertex per azimuth sample. */
export function skylinePath(elev: readonly number[], stepDeg: number, cx: number, cy: number, rim: number): string {
  return (
    elev
      .map((e, k) => {
        const [x, y] = domePoint(k * stepDeg, e, cx, cy, rim);
        return `${k === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join("") + "Z"
  );
}

export function nearestIndex(times: readonly string[], iso: string): number {
  const t = toMs(iso);
  let lo = 0;
  let hi = times.length - 1;
  if (t <= toMs(times[lo])) return lo;
  if (t >= toMs(times[hi])) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (toMs(times[mid]) <= t) lo = mid;
    else hi = mid;
  }
  return t - toMs(times[lo]) <= toMs(times[hi]) - t ? lo : hi;
}
