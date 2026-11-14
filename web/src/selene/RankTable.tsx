import { useState, type ReactElement, type ReactNode } from "react";
import type { PlanMetrics } from "../lib/rank";
import { VerdictWord } from "./VerdictWord";

const TOP_N = 10;

export interface RankRow<T extends PlanMetrics> {
  readonly key: string;
  readonly row: T;
}

interface Props<T extends PlanMetrics> {
  readonly caption: string;
  /** Leading column headers and cells (touchdown, or site and latitude). */
  readonly lead: readonly { readonly head: string; readonly num?: boolean; readonly cell: (r: T) => ReactNode }[];
  readonly rows: readonly RankRow<T>[];
  /** Label for the button inside each row, read by screen readers. */
  readonly pickLabel: (r: T) => string;
  readonly onPick: (r: T) => void;
  readonly showAll?: boolean;
  /** Adds or removes the row's plan in Compare. */
  readonly onCompare: (r: T) => void;
  readonly inCompare: (r: T) => boolean;
}

const r0 = (v: number): string => String(Math.round(v));

/** Ranked plans; the whole row opens it in the Plan view. */
export function RankTable<T extends PlanMetrics>({ caption, lead, rows, pickLabel, onPick, showAll, onCompare, inCompare }: Props<T>): ReactElement {
  const [all, setAll] = useState(!!showAll);
  const shown = all ? rows : rows.slice(0, TOP_N);
  return (
    <div className="rank">
      <div className="tbl-wrap">
        <table className="tbl rows">
          <caption className="sr">{caption}</caption>
          <thead>
            <tr>
              {lead.map((c) => <th key={c.head} className={c.num ? "num" : undefined}>{c.head}</th>)}
              <th>Verdict</th><th className="num">Sunlight (%)</th><th className="num">Longest without Sun (h)</th><th className="num">Contact with Earth (%)</th><th className="num">Longest silence (h)</th><th className="num">Battery check (%)</th><th><span className="sr">Compare</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ key, row }) => (
              <tr key={key} onClick={() => onPick(row)}>
                {lead.map((c, i) => (
                  <td key={c.head} className={c.num ? "num" : undefined}>
                    {i === 0 ? <button type="button" className="row-btn" aria-label={pickLabel(row)} onClick={(e) => { e.stopPropagation(); onPick(row); }}>{c.cell(row)}</button> : c.cell(row)}
                  </td>
                ))}
                <td><VerdictWord level={row.verdict} /></td>
                <td className="num">{r0(row.sunPct)}</td>
                <td className="num">{r0(row.longestDarkH)}</td>
                <td className="num">{r0(row.linkPct)}</td>
                <td className="num">{r0(row.longestLinkGapH)}</td>
                <td className="num muted">{r0(row.lowestSocPct)}</td>
                <td>
                  <button type="button" className="chip" aria-pressed={inCompare(row)} onClick={(e) => { e.stopPropagation(); onCompare(row); }}>
                    {inCompare(row) ? "✓ Compare" : "+ Compare"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > TOP_N && !showAll && <button type="button" className="btn link-btn" onClick={() => setAll(!all)}>{all ? `Show top ${TOP_N}` : `Show all ${rows.length}`}</button>}
    </div>
  );
}
