import type { ReactElement } from "react";
import { fmtUtc } from "../lib/format";
import type { PlanMetrics } from "../lib/rank";
import { slipLabel, slipSentence } from "../lib/slip";
import { VerdictWord } from "./VerdictWord";

const QUICK_SLIPS: readonly number[] = [6, 24, 168];
const MAX_SLIP_H = 24 * 60;

/** "Launch slips by [n] h" with quick picks. */
export function SlipInput({ slip, onSlip }: { readonly slip: number; readonly onSlip: (h: number) => void }): ReactElement {
  return (
    <div className="slip" role="group" aria-label="What if launch is late?">
      <label htmlFor="slip-h">What if launch is late?</label>
      <input id="slip-h" type="number" min={0} max={MAX_SLIP_H} step={1} value={slip} onChange={(e) => onSlip(Math.max(0, Math.min(MAX_SLIP_H, Math.round(Number(e.target.value) || 0))))} />
      <span>h</span>
      {QUICK_SLIPS.map((h) => <button key={h} type="button" className="chip" aria-pressed={slip === h} onClick={() => onSlip(h)}>+{slipLabel(h)}</button>)}
    </div>
  );
}

const pct = (v: number): string => `${Math.round(v)}%`;

function Row({ label, m, start }: { readonly label: string; readonly m: PlanMetrics | null; readonly start: string }): ReactElement {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="mono">{fmtUtc(start)}</td>
      {m ? (
        <>
          <td><VerdictWord level={m.verdict} /></td>
          <td className="num">{pct(m.lowestSocPct)}</td>
          <td className="num">{pct(m.linkPct)}</td>
          <td className="num">{Math.round(m.longestLinkGapH)}</td>
        </>
      ) : <td colSpan={4} className="muted">Outside the stored data</td>}
    </tr>
  );
}

interface Props {
  readonly slip: number;
  readonly planned: PlanMetrics | null;
  readonly slipped: PlanMetrics | null;
  readonly plannedStart: string;
  readonly slippedStart: string;
  readonly onAdopt: () => void;
  readonly onFindGood: () => void;
}

/** Planned against slipped, one sentence on what changed, and what to do about it. */
export function SlipCompare({ slip, planned, slipped, plannedStart, slippedStart, onAdopt, onFindGood }: Props): ReactElement {
  return (
    <div className="slip-compare">
      <table className="tbl">
        <thead><tr><th /><th>Landing (UTC)</th><th>Verdict</th><th className="num">Lowest battery</th><th className="num">Contact with Earth</th><th className="num">Longest silence (h)</th></tr></thead>
        <tbody>
          <Row label="Planned" m={planned} start={plannedStart} />
          <Row label={`Late by ${slipLabel(slip)}`} m={slipped} start={slippedStart} />
        </tbody>
      </table>
      {planned && slipped && <p className="slip-say">{slipSentence(slip, planned.verdict, slipped.verdict)}</p>}
      <div className="actions">
        {slipped && <button type="button" className="btn" onClick={onAdopt}>Use the late date</button>}
        <button type="button" className="btn" onClick={onFindGood}>Find the next Good date at this site</button>
      </div>
    </div>
  );
}
