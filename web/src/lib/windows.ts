import type { Body, Now, VisWindow } from "../api/types";
import { toMs } from "./format";

export function isVisibleAt(windows: readonly VisWindow[], iso: string): boolean {
  const t = toMs(iso);
  return windows.some((w) => t >= toMs(w.start) && (t < toMs(w.end) || (w.open_end && t <= toMs(w.end))));
}

export function longestWindow(windows: readonly VisWindow[]): VisWindow | null {
  return windows.reduce<VisWindow | null>((best, w) => (!best || w.hours > best.hours ? w : best), null);
}

export interface BodyNow {
  readonly up: boolean;
  readonly label: "Sets in" | "Rises in" | "Up all period" | "Hidden all period";
  readonly hours: number | null;
  /** true when the state holds for the whole range */
  readonly whole: boolean;
}

/** Reads the contract's `now` block for one body without computing anything new. */
export function bodyNow(now: Now, body: Body): BodyNow {
  const up = body === "sun" ? now.sun_visible : now.earth_visible;
  const toSet = body === "sun" ? now.hours_to_sunset : now.hours_to_earthset;
  const toRise = body === "sun" ? now.hours_to_sunrise : now.hours_to_earthrise;
  if (up) return toSet == null ? { up, label: "Up all period", hours: null, whole: true } : { up, label: "Sets in", hours: toSet, whole: false };
  return toRise == null ? { up, label: "Hidden all period", hours: null, whole: true } : { up, label: "Rises in", hours: toRise, whole: false };
}
