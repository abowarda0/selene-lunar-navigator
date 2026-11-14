/** The plan's result in plain words: one power sentence, one contact sentence, and a fix when power fails. */
import type { LanderPlan, PresetId } from "./landers";
import type { PowerPlan } from "./powerPlan";
import type { CommsVerdict } from "./verdict";

const THREE_DAYS_H = 72;

const SPACECRAFT: Readonly<Record<PresetId, string>> = { small: "small lander", rover: "rover", large: "large lander", custom: "custom spacecraft" };

export interface Answer {
  readonly lead: string;
  readonly comms: string;
  /** What would fix a poor power result; null otherwise. */
  readonly fix: string | null;
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

export function answerSentence(pp: PowerPlan, lander: LanderPlan, days: number): Answer {
  const who = `Your ${SPACECRAFT[lander.preset]}`;
  const p = pp.chosen.power;
  const comms = commsSentence(pp.verdict.comms);
  const level = pp.verdict.power.level;
  if (level === "poor") {
    const when = p.firstFloor ? ` ${plainDuration(p.firstFloor.hoursAfter)} after landing` : "";
    return {
      lead: `${who} would run out of power${when}, because the Sun stays behind the terrain for ${plainDuration(pp.chosen.longestDarkH)} in a row.`,
      comms,
      fix: `Needs a battery of at least ${p.batteryNeededKWh.toFixed(1)} kWh, or a different landing date (see Best dates).`,
    };
  }
  if (level === "marginal") return { lead: `${who} survives, but only just: the battery drops to ${r0(p.lowestSocPct)}%.`, comms, fix: null };
  return { lead: `${who} keeps its power for all ${days} days. The battery never drops below ${r0(p.lowestSocPct)}%.`, comms, fix: null };
}
