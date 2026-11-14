import type { ReactElement } from "react";
import type { VerdictLevel } from "../api/types";
import { VERDICT_WORD } from "../lib/slip";

/** Verdict as a coloured word with a small square swatch; colour never carries it alone. */
export function VerdictWord({ level }: { readonly level: VerdictLevel }): ReactElement {
  return <span className={`vw ${level}`}><i aria-hidden="true" />{VERDICT_WORD[level]}</span>;
}
