import { VerdictKey } from "./VerdictKey";
import type { ReactElement } from "react";
import { fmtDate, toMs } from "../lib/format";
import type { PlanMetrics } from "../lib/rank";
import { VERDICT_WORD } from "../lib/slip";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAYS_IN_ROW = 31;

interface Props {
  readonly rows: readonly PlanMetrics[];
  readonly selected: string;
  readonly onPick: (r: PlanMetrics) => void;
}

/** One cell per daily touchdown, one line per month, coloured by verdict. */
export function VerdictStrip({ rows, selected, onPick }: Props): ReactElement {
  const months = new Map<string, PlanMetrics[]>();
  for (const r of rows) {
    const k = r.start.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), r]);
  }
  return (
    <div className="vstrip" role="group" aria-label="Verdict for each daily touchdown">
      {[...months.entries()].map(([k, list]) => (
        <div key={k} className="vs-row">
          <span className="vs-lab mono">{MONTHS[Number(k.slice(5, 7)) - 1]} {k.slice(0, 4)}</span>
          <div className="vs-cells" style={{ gridTemplateColumns: `repeat(${DAYS_IN_ROW}, minmax(0, 1fr))` }}>
            {list.map((r) => {
              const day = new Date(toMs(r.start)).getUTCDate();
              const text = `${fmtDate(r.start)}: ${VERDICT_WORD[r.verdict]}, lowest battery ${Math.round(r.lowestSocPct)}%`;
              return <button key={r.start} type="button" tabIndex={-1} className={`vs-cell ${r.verdict}${r.start.slice(0, 10) === selected ? " sel" : ""}`} style={{ gridColumn: day }} title={text} aria-label={text} onClick={() => onPick(r)} />;
            })}
          </div>
        </div>
      ))}
      <VerdictKey compact />
      <p className="src">Each square is one landing day at 00:00 UTC with your mission length. Click a day to open it in Plan.</p>
    </div>
  );
}
