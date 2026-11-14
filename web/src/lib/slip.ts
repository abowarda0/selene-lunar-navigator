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
