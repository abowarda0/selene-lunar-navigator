/**
 * Plan verdict: the worse of a power axis and a comms axis.
 * Comms thresholds are our planning rule, not a NASA requirement.
 */
import type { VerdictLevel, VisWindow } from "../api/types";
import { commsSentence, plainDuration } from "./answer";
import { toMs } from "./format";
import { longestGap, type PowerResult } from "./power";

const POWER_MARGIN_PTS = 10;
const GOOD_GAP_H = 24;
const MARGINAL_GAP_H = 120;
const GOOD_SHARE = 0.3;
const MARGINAL_SHARE = 0.1;
const MS_PER_H = 3_600_000;
const RANK: Record<VerdictLevel, number> = { good: 0, marginal: 1, poor: 2 };

export const COMMS_RULE = "our planning rule, not a NASA requirement";

export interface AxisVerdict {
  readonly level: VerdictLevel;
  readonly reason: string;
}

export interface CommsVerdict extends AxisVerdict {
  readonly linkAtTouchdown: boolean;
  readonly longestGapH: number;
  readonly sharePct: number;
}

export interface PlanVerdict {
  readonly level: VerdictLevel;
  readonly power: AxisVerdict;
  readonly comms: CommsVerdict;
  readonly warnings: readonly string[];
}

const r0 = (v: number): string => String(Math.round(v));

export function powerVerdict(p: PowerResult, minSocPct: number): AxisVerdict {
  if (!p.survives) {
    const at = p.firstFloor ? ` ${plainDuration(p.firstFloor.hoursAfter)} after landing` : "";
    return { level: "poor", reason: `The battery hits its ${r0(minSocPct)}% safety reserve${at}.` };
  }
  if (p.lowestSocPct >= minSocPct + POWER_MARGIN_PTS) {
    return { level: "good", reason: `The battery never drops below ${r0(p.lowestSocPct)}%, well clear of the ${r0(minSocPct)}% safety reserve.` };
  }
  return { level: "marginal", reason: `The battery gets down to ${r0(p.lowestSocPct)}%, within ${POWER_MARGIN_PTS} pts of the ${r0(minSocPct)}% safety reserve.` };
}

export function commsVerdict(link: readonly VisWindow[], start: string, stop: string): CommsVerdict {
  const t0 = toMs(start);
  const t1 = toMs(stop);
  const missionH = (t1 - t0) / MS_PER_H;
  const linkH = link.reduce((h, w) => h + Math.max(0, Math.min(t1, toMs(w.end)) - Math.max(t0, toMs(w.start))) / MS_PER_H, 0);
  const share = missionH > 0 ? linkH / missionH : 0;
  const gap = longestGap(link, start, stop);
  const linkAtTouchdown = link.some((w) => toMs(w.start) <= t0 && t0 < toMs(w.end));
  const base = { linkAtTouchdown, longestGapH: gap, sharePct: share * 100 };
  const level: VerdictLevel = linkH === 0 ? "poor"
    : gap <= Math.min(GOOD_GAP_H, missionH) && share >= GOOD_SHARE ? "good"
    : gap <= Math.min(MARGINAL_GAP_H, missionH) && share >= MARGINAL_SHARE ? "marginal"
    : "poor";
  return { ...base, level, reason: commsSentence({ ...base, level }) };
}

export function planVerdict(power: PowerResult, minSocPct: number, link: readonly VisWindow[], start: string, stop: string): PlanVerdict {
  const p = powerVerdict(power, minSocPct);
  const c = commsVerdict(link, start, stop);
  return {
    level: RANK[p.level] >= RANK[c.level] ? p.level : c.level,
    power: p,
    comms: c,
    warnings: c.linkAtTouchdown ? [] : ["No link at touchdown"],
  };
}
