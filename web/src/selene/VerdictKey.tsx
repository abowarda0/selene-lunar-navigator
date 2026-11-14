import type { ReactElement } from "react";
import { GOOD_DARK_H, GOOD_GAP_H, GOOD_SHARE, MARGINAL_DARK_H, MARGINAL_GAP_H, MARGINAL_SHARE } from "../lib/verdict";

const pct = (f: number): string => `${Math.round(f * 100)}%`;
const days = (h: number): string => (h >= 48 ? `${Math.round(h / 24)} days` : h === 24 ? "a day" : `${h} hours`);

/** What Good / Marginal / Poor mean, built from the same thresholds the verdict uses. */
export const VERDICT_MEANING = {
  good: `The whole mission fits inside the sunlight (no dark spell of ${GOOD_DARK_H} hour or more), and Earth can be reached at least ${pct(GOOD_SHARE)} of the time with no silence longer than ${days(GOOD_GAP_H)}.`,
  marginal: `Almost: one dark gap of up to ${MARGINAL_DARK_H} hours, usually right at the start or end, or Earth contact is patchy (at least ${pct(MARGINAL_SHARE)} of the time, silences up to ${days(MARGINAL_GAP_H)}).`,
  poor: `The mission runs into the lunar night (more than ${MARGINAL_DARK_H} hours of darkness), or Earth can hardly be reached and a relay satellite would be needed.`,
} as const;

const ROWS = [
  { level: "good", label: "Good" },
  { level: "marginal", label: "Marginal" },
  { level: "poor", label: "Poor" },
] as const;

/** The colour key with a one-sentence meaning for each level. */
export function VerdictKey({ compact = false }: { readonly compact?: boolean }): ReactElement {
  return (
    <div className={`vkey${compact ? " compact" : ""}`}>
      <ul>
        {ROWS.map((r) => (
          <li key={r.level}>
            <span className={`vw ${r.level}`}><i />{r.label}</span>
            <span className="vkey-t">{VERDICT_MEANING[r.level]}</span>
          </li>
        ))}
      </ul>
      <p className="src">The colour is the worse of two checks: sunlight above the real hills, and a two-way link to a NASA dish. Our own rule of thumb, not a NASA standard. The battery is a separate, optional check.</p>
    </div>
  );
}
