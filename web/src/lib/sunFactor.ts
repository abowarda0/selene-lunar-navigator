/** Visible share of the Sun's disc at each 30-minute track point, against the 2 m skyline. */
import type { SunFactor } from "./power";

const SUN_RADIUS_DEG = 0.266;
const SUN_DIAMETER_DEG = 0.533;

export interface TrackAndHorizon {
  readonly track: { readonly t0: string; readonly step_min: number; readonly sun_az: readonly number[]; readonly sun_el: readonly number[] };
  readonly horizon: { readonly az_step_deg: number; readonly elev_deg: readonly number[] };
}

export function skylineAt(h: TrackAndHorizon["horizon"], az: number): number {
  const n = h.elev_deg.length;
  if (n === 0 || !(h.az_step_deg > 0)) return 0;
  const pos = ((((az % 360) + 360) % 360) / h.az_step_deg);
  const i = Math.floor(pos) % n;
  const f = pos - Math.floor(pos);
  return h.elev_deg[i] * (1 - f) + h.elev_deg[(i + 1) % n] * f;
}

export function visibleSunFactor(y: TrackAndHorizon): SunFactor {
  const values = y.track.sun_el.map((el, k) => {
    const v = (el + SUN_RADIUS_DEG - skylineAt(y.horizon, y.track.sun_az[k])) / SUN_DIAMETER_DEG;
    return Math.max(0, Math.min(1, v));
  });
  return { t0: y.track.t0, stepMin: y.track.step_min, values };
}
