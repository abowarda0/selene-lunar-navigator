/** Wording for a launch slip. */
import type { VerdictLevel } from "../api/types";

const TWO_DAYS_H = 48;
export const VERDICT_WORD: Readonly<Record<VerdictLevel, string>> = { good: "Good", marginal: "Marginal", poor: "Poor" };

export const slipLabel = (hours: number): string => (hours >= TWO_DAYS_H && hours % 24 === 0 ? `${hours / 24} d` : `${hours} h`);

export function slipSentence(hours: number, planned: VerdictLevel, slipped: VerdictLevel): string {
  const what = `A ${slipLabel(hours)} slip`;
  return planned === slipped
    ? `${what} does not change the verdict (${VERDICT_WORD[planned]}).`
    : `${what} moves the verdict from ${VERDICT_WORD[planned]} to ${VERDICT_WORD[slipped]}.`;
}

/** The figures a slip headline compares (a subset of rank's PlanMetrics). */
export interface SlipFigures {
  readonly verdict: VerdictLevel;
  readonly sunPct: number;
  readonly longestDarkH: number;
  readonly linkPct: number;
  readonly longestLinkGapH: number;
}

const h1 = (h: number): string => (h >= 72 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);

/**
 * One line for the slip story: what the verdict does and the biggest reason, in the verdict's own order
 * (darkness first, then silence from Earth). Only restates the two plans' computed figures.
 */
export function slipHeadline(hours: number, a: SlipFigures, b: SlipFigures): string {
  const what = `Launching ${slipLabel(hours)} late`;
  const verdict = a.verdict === b.verdict
    ? `keeps the plan ${VERDICT_WORD[a.verdict]}`
    : `turns a ${VERDICT_WORD[a.verdict]} plan ${VERDICT_WORD[b.verdict]}`;
  const dDark = b.longestDarkH - a.longestDarkH;
  const dGap = b.longestLinkGapH - a.longestLinkGapH;
  let why = "";
  if (Math.abs(dDark) >= 0.5) {
    why = a.longestDarkH < 0.5 ? `: it now runs into ${h1(b.longestDarkH)} of darkness`
      : b.longestDarkH < 0.5 ? `: it no longer runs into darkness (was ${h1(a.longestDarkH)})`
      : `: the longest dark spell goes from ${h1(a.longestDarkH)} to ${h1(b.longestDarkH)}`;
  } else if (Math.abs(dGap) >= 1) {
    why = `: the longest silence from Earth goes from ${h1(a.longestLinkGapH)} to ${h1(b.longestLinkGapH)}`;
  } else if (Math.abs(b.sunPct - a.sunPct) >= 1 || Math.abs(b.linkPct - a.linkPct) >= 1) {
    why = `: sunlight ${Math.round(a.sunPct)}% → ${Math.round(b.sunPct)}%, Earth link ${Math.round(a.linkPct)}% → ${Math.round(b.linkPct)}%`;
  }
  return `${what} ${verdict}${why}.`;
}
