/** What holds at the timeline cursor: is a body up, and how long until that changes. */
import type { VisWindow } from "../api/types";
import { toMs } from "./format";
import type { SocPoint } from "./power";

const MS_PER_H = 3_600_000;

export interface BodyState {
  readonly up: boolean;
  /** Hours until it sets (when up) or rises (when down); null when nothing changes before the plan ends. */
  readonly hoursToChange: number | null;
}

export function bodyStateAt(windows: readonly VisWindow[], at: string, stop: string): BodyState {
  const t = toMs(at);
  const t1 = toMs(stop);
  const cur = windows.find((w) => toMs(w.start) <= t && t < toMs(w.end));
  if (cur) {
    const end = toMs(cur.end);
    return { up: true, hoursToChange: end < t1 ? (end - t) / MS_PER_H : null };
  }
  const next = windows.find((w) => toMs(w.start) > t && toMs(w.start) < t1);
  return { up: false, hoursToChange: next ? (toMs(next.start) - t) / MS_PER_H : null };
}

export const lowestPoint = (series: readonly SocPoint[]): SocPoint | null =>
  series.reduce<SocPoint | null>((lo, p) => (!lo || p.soc < lo.soc ? p : lo), null);
