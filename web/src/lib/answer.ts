/** The plan's result in plain words: light first, then contact, a hint when the light is poor, and the optional power line. */
import type { LanderPlan, PresetId } from "./landers";
import type { PowerPlan } from "./powerPlan";
import type { CommsVerdict, LightVerdict } from "./verdict";

const THREE_DAYS_H = 72;

const SPACECRAFT: Readonly<Record<PresetId, string>> = { small: "small lander", rover: "rover", large: "large lander", custom: "custom spacecraft" };

export interface Answer {
  readonly lead: string;
  readonly comms: string;
  /** What to try when the light is not good; null otherwise. */
  readonly fix: string | null;
  /** Battery result for the optional power check. */
  readonly power: string;
}

const r0 = (v: number): string => String(Math.round(v));
const days1 = (h: number): string => String(Math.round((h / 24) * 10) / 10);

/** "30 h" under three days; "10 days (240 h)" from three days. */
export function plainDuration(hours: number): string {
  return hours >= THREE_DAYS_H ? `${days1(hours)} days (${r0(hours)} h)` : `${r0(hours)} h`;
}

export function commsSentence(c: Pick<CommsVerdict, "level" | "sharePct" | "longestGapH">): string {
  const facts = `reachable ${r0(c.sharePct)}% of the time, longest silence ${plainDuration(c.longestGapH)}`;
  if (c.sharePct <= 0) return "Earth cannot be reached from here during this plan; a relay satellite would be needed.";
  if (c.level === "good") return `Regular contact with Earth: ${facts}.`;
  if (c.level === "marginal") return `Patchy contact with Earth: ${facts}.`;
  return `Contact with Earth is not reliable enough: ${facts}.`;
}

export function lightSentence(l: Pick<LightVerdict, "level" | "sunPct" | "longestDarkH">, days: number): string {
  const pct = r0(l.sunPct);
  if (l.sunPct <= 0) return `The Sun never clears the terrain during your ${days} days.`;
  if (l.longestDarkH <= 0) return `The Sun stays up for all ${days} days: it never drops behind the terrain.`;
  if (l.level === "good") return `Sunlight for ${pct}% of your ${days} days; the longest dark spell is only ${plainDuration(l.longestDarkH)}.`;
  if (l.level === "marginal") return `Patchy sunlight: the Sun is up ${pct}% of your ${days} days, with a dark spell of ${plainDuration(l.longestDarkH)}.`;
  return `The Sun stays behind the terrain for ${plainDuration(l.longestDarkH)} in a row during your ${days} days (up ${pct}% of the time).`;
}

/** The battery result in words, for the optional power check. */
export function powerSentence(pp: PowerPlan, lander: LanderPlan, days: number): string {
  const who = `A ${SPACECRAFT[lander.preset]}`;
  const p = pp.chosen.power;
  if (pp.verdict.power.level === "poor") {
    const when = p.firstFloor ? ` ${plainDuration(p.firstFloor.hoursAfter)} after landing` : "";
    return `${who} would run out of power${when}; it would need a battery of at least ${p.batteryNeededKWh.toFixed(1)} kWh.`;
  }
  if (pp.verdict.power.level === "marginal") return `${who} gets through, but only just: the battery drops to ${r0(p.lowestSocPct)}%.`;
  return `${who} keeps its power for all ${days} days; the battery never drops below ${r0(p.lowestSocPct)}%.`;
}

export function answerSentence(pp: PowerPlan, lander: LanderPlan, days: number): Answer {
  const l = pp.verdict.light;
  const fix = l.level === "good" ? null : "Try another landing date (Best dates) or a nearby site with shorter dark spells (Best sites).";
  return { lead: lightSentence(l, days), comms: commsSentence(pp.verdict.comms), fix, power: powerSentence(pp, lander, days) };
}
