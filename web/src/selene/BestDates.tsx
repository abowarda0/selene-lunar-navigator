import { useMemo, type ReactElement } from "react";
import type { Site } from "../api/types";
import { useDeferred, useYear } from "../hooks";
import { fmtUtc, toMs } from "../lib/format";
import type { LanderPlan } from "../lib/landers";
import { evaluateDates, rankRows, SORT_RULE, type PlanMetrics } from "../lib/rank";
import type { CompareState } from "../useCompare";
import { atTouchdown, type Plan } from "./plan";
import { RankTable } from "./RankTable";
import { VerdictStrip } from "./VerdictStrip";

interface Props {
  readonly site: Site | undefined;
  readonly plan: Plan;
  readonly lander: LanderPlan;
  /** Only touchdowns after this time, when set. */
  readonly after: string | null;
  readonly onClearAfter: () => void;
  readonly onPick: (startIso: string) => void;
  readonly compare: CompareState;
}

const LEAD = [{ head: "Landing (UTC)", cell: (r: PlanMetrics) => <span className="mono">{fmtUtc(r.start)}</span> }];

export function BestDates({ site, plan, lander, after, onClearAfter, onPick, compare }: Props): ReactElement {
  const year = useYear(plan.site);
  const y = year.data;
  const all = useDeferred(y ? () => evaluateDates(y, plan.hours, lander) : null, [y, plan.hours, lander]);
  const ranked = useMemo(() => {
    if (!all) return null;
    const pool = after ? all.filter((r) => toMs(r.start) > toMs(after)) : all;
    return rankRows(pool).map((row) => ({ key: row.start, row }));
  }, [all, after]);
  const days = plan.hours / 24;
  const nextGood = after && all ? all.find((r) => toMs(r.start) > toMs(after) && r.verdict === "good") ?? null : null;

  return (
    <div className="stack">
      <div>
        <h1 className="headline">Best dates at {site?.name.replace(/ \(sample point\)$/, "") ?? plan.site}, {days} days.</h1>
        <p className="src">{SORT_RULE} One landing per day at 00:00 UTC; the Plan page is accurate to the minute.</p>
      </div>
      {after && (
        <div className="filter">
          <p>Touchdowns after {fmtUtc(after)} only.</p>
          {all && (nextGood
            ? <button type="button" className="btn" onClick={() => onPick(nextGood.start)}>Open next Good date: {fmtUtc(nextGood.start)}</button>
            : <p className="muted">No Good date after it at this site for this lander and duration.</p>)}
          <button type="button" className="btn link-btn" onClick={onClearAfter}>Show all dates</button>
        </div>
      )}
      {year.error && <div className="alert" role="alert">The data for this site did not load: {year.error.message}</div>}
      {!ranked ? <p className="muted" role="status">{y ? "Computing one plan per day…" : "Loading site data…"}</p> : ranked.length === 0 ? <p className="muted">No daily touchdown fits inside the stored data for this duration.</p> : (
        <>
          <section className="card" aria-labelledby="strip-h">
            <h2 id="strip-h">Verdict for each landing day</h2>
            <VerdictStrip rows={all ?? []} selected={plan.date} onPick={(r) => onPick(r.start)} />
          </section>
          <RankTable caption="Daily touchdowns ranked" lead={LEAD} rows={ranked} pickLabel={(r) => `Open ${fmtUtc(r.start)} in Plan`} onPick={(r) => onPick(r.start)}
            onCompare={(r) => compare.toggle(atTouchdown(plan, r.start))} inCompare={(r) => compare.has(atTouchdown(plan, r.start))} />
        </>
      )}
    </div>
  );
}
