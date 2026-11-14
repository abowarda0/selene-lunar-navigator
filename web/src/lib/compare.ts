/** Compare tray state: up to three plans, toggled in and out, stored as JSON. */
import type { Plan } from "../selene/plan";

export const MAX_COMPARE = 3;
export const COMPARE_FULL = `Remove one first (max ${MAX_COMPARE})`;

export const planKey = (p: Plan): string => `${p.site}|${p.date}|${p.time}|${p.hours}`;

export interface ToggleResult {
  readonly list: readonly Plan[];
  readonly error: string | null;
}

/** Removes the plan if present, otherwise adds it unless the tray is full. */
export function toggleCompare(list: readonly Plan[], plan: Plan): ToggleResult {
  const k = planKey(plan);
  if (list.some((p) => planKey(p) === k)) return { list: list.filter((p) => planKey(p) !== k), error: null };
  if (list.length >= MAX_COMPARE) return { list, error: COMPARE_FULL };
  return { list: [...list, plan], error: null };
}

const isPlan = (v: unknown): v is Plan => {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.site === "string" && typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date)
    && typeof o.time === "string" && /^\d{2}:\d{2}$/.test(o.time)
    && typeof o.hours === "number" && Number.isFinite(o.hours) && o.hours > 0;
};

/** Stored tray text to plans; anything unreadable gives an empty tray. */
export function parseCompare(raw: string | null): Plan[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(isPlan).map((p) => ({ site: p.site, date: p.date, time: p.time, hours: p.hours })).slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

export interface Best {
  readonly best: readonly boolean[];
  /** Every known value is the same (and at least two are known). */
  readonly allEqual: boolean;
}

/** Which columns hold the best value of a row; ties all count as best, missing values never do. */
export function bestOf(values: readonly (number | null)[], dir: "high" | "low"): Best {
  const known = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (known.length < 2) return { best: values.map(() => false), allEqual: false };
  const top = dir === "high" ? Math.max(...known) : Math.min(...known);
  const allEqual = known.every((v) => v === known[0]);
  return { best: values.map((v) => !allEqual && v === top), allEqual };
}
