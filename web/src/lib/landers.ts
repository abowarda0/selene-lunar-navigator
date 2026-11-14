/** Lander presets (illustrative class values) and input checks. */
import type { Lander } from "./power";

export type PresetId = "small" | "rover" | "large" | "custom";
export const DEFAULT_MIN_SOC = 20;
const MAX_MIN_SOC = 90;

export interface LanderPreset {
  readonly label: string;
  readonly note: string;
  readonly spec: Lander;
}

export const LANDER_PRESETS: Readonly<Record<Exclude<PresetId, "custom">, LanderPreset>> = {
  small: { label: "Small lander", note: "Nova-C class", spec: { panelW: 200, batteryKWh: 0.7, minSocPct: DEFAULT_MIN_SOC, sunLoadW: 150, darkLoadW: 50, commsW: 30 } },
  rover: { label: "Rover", note: "VIPER class; dark endurance about 50 h, matching NASA's stated darkness tolerance", spec: { panelW: 450, batteryKWh: 4, minSocPct: DEFAULT_MIN_SOC, sunLoadW: 250, darkLoadW: 60, commsW: 40 } },
  large: { label: "Large", note: "Night survivor, illustrative, no real vehicle", spec: { panelW: 2000, batteryKWh: 30, minSocPct: DEFAULT_MIN_SOC, sunLoadW: 1000, darkLoadW: 150, commsW: 100 } },
};

export const PRESET_ORDER: readonly PresetId[] = ["small", "rover", "large", "custom"];

/** What the user has chosen: a preset (or custom values) and where the panels sit. */
export interface LanderPlan {
  readonly preset: PresetId;
  readonly spec: Lander;
  readonly mast: boolean;
}

export const DEFAULT_LANDER: LanderPlan = { preset: "rover", spec: LANDER_PRESETS.rover.spec, mast: false };

export type LanderErrors = Partial<Record<keyof Lander, string>>;

const POSITIVE: readonly (keyof Lander)[] = ["panelW", "batteryKWh", "sunLoadW", "darkLoadW"];

export function validateLander(l: Lander): LanderErrors {
  const errs: Record<string, string> = {};
  for (const k of POSITIVE) if (!Number.isFinite(l[k]) || l[k] <= 0) errs[k] = "Enter a number above 0.";
  if (!Number.isFinite(l.commsW) || l.commsW < 0) errs.commsW = "Enter 0 or more.";
  if (!Number.isFinite(l.minSocPct) || l.minSocPct < 0 || l.minSocPct > MAX_MIN_SOC) errs.minSocPct = `Enter 0 to ${MAX_MIN_SOC}.`;
  return errs;
}
