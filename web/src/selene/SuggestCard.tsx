import { useMemo, type ReactElement } from "react";
import type { YearData } from "../api/types";
import type { LanderPlan } from "../lib/landers";
import type { PlanSpan } from "../lib/powerPlan";
import { suggestSetups } from "../lib/suggest";

interface Props {
  readonly year: YearData;
  readonly span: PlanSpan;
  readonly lander: LanderPlan;
  readonly onLander: (l: Partial<LanderPlan>) => void;
}

const kwh = (v: number): string => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

/** Spacecraft setups that survive this exact plan: panel size, pole, and the smallest battery needed. */
export function SuggestCard({ year, span, lander, onLander }: Props): ReactElement {
  const list = useMemo(() => suggestSetups(year, span, lander), [year, span, lander]);
  return (
    <section className="card suggest" aria-labelledby="sg-h">
      <h2 id="sg-h" className="sec-h">Suggested setups that survive this plan</h2>
      <p className="sec">Same power use as your spacecraft. For each panel size we found the smallest battery (plus 15% spare) that never hits the safety reserve.</p>
      {list.length === 0 ? (
        <p className="alert">No setup we tried survives this plan. Try a different landing date (Best dates) or a site with shorter dark spells.</p>
      ) : (
        <ul className="sg-list">
          {list.map((s) => {
            const sp = s.lander.spec;
            const same = sp.panelW === lander.spec.panelW && sp.batteryKWh === lander.spec.batteryKWh && s.lander.mast === lander.mast;
            return (
              <li key={`${sp.panelW}-${s.lander.mast}`} className={s.unrealistic ? "sg-far" : ""}>
                <span className="sg-main"><b className="mono">{sp.panelW} W</b> panels {s.lander.mast ? "on the 10 m pole" : "on the deck"} + <b className="mono">{kwh(sp.batteryKWh)} kWh</b> battery</span>
                <span className="sg-note">{s.unrealistic ? "bigger than today's lunar landers carry" : `lowest charge ${Math.round(s.lowestSocPct)}%`}</span>
                <button type="button" className="btn" disabled={same} onClick={() => onLander({ preset: "custom", spec: sp, mast: s.lander.mast })}>{same ? "In use" : "Use this"}</button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="src">Energy model only (no heating details or battery ageing). Illustrative sizing, not a spacecraft design.</p>
    </section>
  );
}
