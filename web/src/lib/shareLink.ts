/** A plan and spacecraft as a "#plan?..." hash, so a plan can be shared as a link. */
import type { Plan } from "../selene/plan";
import { LANDER_PRESETS, validateLander, type LanderPlan, type PresetId } from "./landers";
import type { Lander } from "./power";

const PRESETS: readonly PresetId[] = ["small", "rover", "large", "custom"];
const SPEC_KEYS: readonly (readonly [keyof Lander, string])[] = [
  ["panelW", "pw"], ["batteryKWh", "bk"], ["minSocPct", "rs"], ["sunLoadW", "ls"], ["darkLoadW", "ld"], ["commsW", "rw"],
];

export function encodePlanLink(plan: Plan, lander: LanderPlan): string {
  const q = new URLSearchParams({ s: plan.site, d: plan.date, t: plan.time, h: String(plan.hours), c: lander.preset, m: lander.mast ? "1" : "0" });
  if (lander.preset === "custom") for (const [k, short] of SPEC_KEYS) q.set(short, String(lander.spec[k]));
  return `plan?${q.toString()}`;
}

function validDate(d: string): boolean {
  const ms = Date.parse(`${d}T00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === d;
}
const validTime = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function specOf(q: URLSearchParams, preset: PresetId): Lander | null {
  if (preset !== "custom") return LANDER_PRESETS[preset].spec;
  const raw = SPEC_KEYS.map(([k, short]) => [k, Number(q.get(short) ?? Number.NaN)] as const);
  const spec = Object.fromEntries(raw) as unknown as Lander;
  return Object.keys(validateLander(spec)).length === 0 ? spec : null;
}

/** The plan and spacecraft in a hash (without "#"); null when it has none or any value is invalid. */
export function decodePlanLink(hash: string): { plan: Plan; lander: LanderPlan } | null {
  const [view, query] = hash.split("?");
  if (view !== "plan" || !query) return null;
  const q = new URLSearchParams(query);
  const site = q.get("s") ?? "";
  const date = q.get("d") ?? "";
  const time = q.get("t") ?? "";
  const hours = Number(q.get("h"));
  const preset = PRESETS.find((p) => p === q.get("c"));
  if (!site || !validDate(date) || !validTime(time) || !Number.isInteger(hours) || hours <= 0 || !preset) return null;
  const spec = specOf(q, preset);
  if (!spec) return null;
  return { plan: { site, date, time, hours }, lander: { preset, spec, mast: q.get("m") === "1" } };
}
