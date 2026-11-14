import { useMemo, type ReactElement } from "react";
import type { Site, VerdictLevel, YearData } from "../api/types";
import { useYears } from "../hooks";
import { analyze } from "../lib/analysis";
import { answerSentence, plainDuration } from "../lib/answer";
import { bestOf, planKey } from "../lib/compare";
import { dataVolumeGB } from "../lib/facts";
import { LANDER_PRESETS, type LanderPlan } from "../lib/landers";
import { darkSpells } from "../lib/power";
import { planPower, type PowerPlan } from "../lib/powerPlan";
import { BatteryChart } from "./BatteryChart";
import { planLabel } from "./CompareTray";
import { touchdownOf, type Plan } from "./plan";
import { VerdictWord } from "./VerdictWord";

const RATE_MBPS = 1;
const RANK: Readonly<Record<VerdictLevel, number>> = { good: 0, marginal: 1, poor: 2 };
const hoursOf = (ws: readonly { start: string; end: string }[]): number => ws.reduce((h, w) => h + (Date.parse(w.end) - Date.parse(w.start)) / 3_600_000, 0);

interface Column {
  readonly plan: Plan;
  readonly result: { readonly pp: PowerPlan; readonly start: string; readonly stop: string; readonly slope: number | null } | null;
  readonly error: string | null;
}

interface Row {
  readonly label: string;
  readonly dir: "high" | "low";
  readonly value: (c: NonNullable<Column["result"]>, hours: number) => number | null;
  readonly show: (v: number) => string;
}

const ROWS: readonly Row[] = [
  { label: "Sunlight", dir: "high", value: (r, h) => (r.pp.chosen.sunHours / h) * 100, show: (v) => `${Math.round(v)}%` },
  { label: "Longest time without Sun", dir: "low", value: (r) => r.pp.chosen.longestDarkH, show: plainDuration },
  { label: "Lowest battery", dir: "high", value: (r) => r.pp.chosen.power.lowestSocPct, show: (v) => `${Math.round(v)}%` },
  { label: "Contact with Earth", dir: "high", value: (r) => r.pp.verdict.comms.sharePct, show: (v) => `${Math.round(v)}%` },
  { label: "Longest silence", dir: "low", value: (r) => r.pp.verdict.comms.longestGapH, show: plainDuration },
  { label: "Ground slope", dir: "low", value: (r) => r.slope, show: (v) => `${v.toFixed(1)}°` },
  { label: `Data you could send home (at ${RATE_MBPS} Mbps)`, dir: "high", value: (r) => dataVolumeGB(hoursOf(r.pp.link), RATE_MBPS), show: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} GB` },
];

function plainWords(pp: PowerPlan, lander: LanderPlan, hours: number): string {
  const a = answerSentence(pp, lander, hours / 24);
  return `${a.lead} ${a.comms}`;
}

function columnOf(plan: Plan, year: YearData | undefined, lander: LanderPlan): Column {
  if (!year) return { plan, result: null, error: "The data for this site did not load." };
  const a = analyze(year, touchdownOf(plan), plan.hours);
  if (!a.ok) return { plan, result: null, error: "This plan falls outside the stored data." };
  return { plan, error: null, result: { pp: planPower(year, { start: a.start, stop: a.stop }, lander), start: a.start, stop: a.stop, slope: year.site_facts?.slope_deg ?? null } };
}

interface Props {
  readonly sites: readonly Site[];
  readonly plans: readonly Plan[];
  readonly lander: LanderPlan;
  readonly onRemove: (p: Plan) => void;
  readonly onChoose: (p: Plan) => void;
}

/** Two or three plans side by side with the same spacecraft; the best value in each row is marked. */
export function ComparePage({ sites, plans, lander, onRemove, onChoose }: Props): ReactElement {
  const ids = useMemo(() => [...new Set(plans.map((p) => p.site))], [plans]);
  const years = useYears(ids);
  const cols = useMemo(() => (years.data ? plans.map((p) => columnOf(p, years.data?.find((y) => y.site.id === p.site), lander)) : null), [years.data, plans, lander]);
  const craft = lander.preset === "custom" ? "Custom values" : LANDER_PRESETS[lander.preset].label;

  if (plans.length < 2) {
    return (
      <div className="stack">
        <h1 className="headline">Compare plans</h1>
        <p className="sec">Add at least two plans with the “Compare” button on the Plan page, or on any row of Best dates and Best sites. You can compare up to three.</p>
        <p><a href="#home">Start from Home</a> · <a href="#dates">Best dates</a> · <a href="#sites">Best sites</a></p>
      </div>
    );
  }
  if (!cols) return <p className="muted" role="status">{years.error ? `The data did not load: ${years.error.message}` : "Loading the plans…"}</p>;

  const grid = { gridTemplateColumns: `minmax(140px, 0.8fr) repeat(${cols.length}, minmax(0, 1fr))` };
  return (
    <div className="stack">
      <div>
        <h1 className="headline">Compare plans</h1>
        <p className="banner">All plans use the same spacecraft: {craft}, panels {lander.mast ? "on a 10 m pole where available" : "on deck"}. Change it in the plan bar above.</p>
      </div>
      <div className="cmp" role="table" aria-label="Plans side by side">
        <div className="cmp-row head" role="row" style={grid}>
          <span role="columnheader" />
          {cols.map((c) => (
            <div key={planKey(c.plan)} role="columnheader" className="cmp-h">
              <b>{planLabel(sites, c.plan)}</b>
              <button type="button" className="btn link-btn" onClick={() => onRemove(c.plan)}>Remove</button>
            </div>
          ))}
        </div>
        {(() => {
          const b = bestOf(cols.map((c) => (c.result ? RANK[c.result.pp.verdict.level] : null)), "low");
          return (
            <div className={`cmp-row${b.allEqual ? " same" : ""}`} role="row" style={grid}>
              <span role="rowheader">Verdict</span>
              {cols.map((c, i) => (
                <span key={planKey(c.plan)} role="cell" className={b.best[i] ? "best" : undefined}>
                  {c.result ? <VerdictWord level={c.result.pp.verdict.level} /> : <span className="s-err">{c.error}</span>}{b.best[i] && <em className="best-t">best</em>}
                </span>
              ))}
            </div>
          );
        })()}
        <div className="cmp-row" role="row" style={grid}>
          <span role="rowheader">In plain words</span>
          {cols.map((c) => <span key={planKey(c.plan)} role="cell" className="cmp-say">{c.result ? plainWords(c.result.pp, lander, c.plan.hours) : <span className="muted">–</span>}</span>)}
        </div>
        {ROWS.map((row) => {
          const vals = cols.map((c) => (c.result ? row.value(c.result, c.plan.hours) : null));
          const b = bestOf(vals, row.dir);
          return (
            <div key={row.label} className={`cmp-row${b.allEqual ? " same" : ""}`} role="row" style={grid}>
              <span role="rowheader">{row.label}</span>
              {cols.map((c, i) => (
                <span key={planKey(c.plan)} role="cell" className={`mono${b.best[i] ? " best" : ""}`}>
                  {vals[i] == null ? "–" : row.show(vals[i] as number)}{b.best[i] && <em className="best-t">best</em>}
                </span>
              ))}
            </div>
          );
        })}
        <div className="cmp-row" role="row" style={grid}>
          <span role="rowheader">Battery over the mission</span>
          {cols.map((c) => (
            <span key={planKey(c.plan)} role="cell">
              {c.result ? <BatteryChart spark series={c.result.pp.chosen.power.series} hours={c.plan.hours} reservePct={lander.spec.minSocPct}
                dark={darkSpells(c.result.pp.chosen.sun, c.result.start, c.result.stop)} label={`Battery for ${planLabel(sites, c.plan)}, 0 to 100%`} /> : "–"}
            </span>
          ))}
        </div>
        <div className="cmp-row" role="row" style={grid}>
          <span role="rowheader" />
          {cols.map((c) => <span key={planKey(c.plan)} role="cell"><button type="button" className="btn primary" onClick={() => onChoose(c.plan)}>Choose this plan</button></span>)}
        </div>
      </div>
      <p className="src">The best value in each row is marked (ties all count); rows where every plan is equal are dimmed.</p>
    </div>
  );
}
