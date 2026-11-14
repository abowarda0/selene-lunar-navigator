import type { ReactElement } from "react";
import { plainDuration } from "../lib/answer";
import type { LanderPlan } from "../lib/landers";
import type { DarkSpell } from "../lib/power";
import type { PowerPlan } from "../lib/powerPlan";
import { BatteryChart } from "./BatteryChart";
import { Icon } from "./Icon";
import { SpacecraftForm } from "./SpacecraftForm";

interface Props {
  readonly pp: PowerPlan;
  readonly lander: LanderPlan;
  readonly onLander: (l: Partial<LanderPlan>) => void;
  readonly hours: number;
  readonly dark: readonly DarkSpell[];
  readonly hasMast: boolean;
}

function MastCard({ pp, lander, onLander, hasMast }: Omit<Props, "hours" | "dark">): ReactElement {
  const deck = pp.chosen.mast ? pp.other : pp.chosen;
  const mast = pp.chosen.mast ? pp.chosen : pp.other;
  const usable = hasMast && deck != null && mast != null;
  return (
    <div className={`mast${lander.mast && usable ? " on" : ""}`}>
      <span className="mast-ic"><Icon name="pole" /></span>
      <div className="mast-body">
        <label className="mast-t" htmlFor="mast-sw">Put the solar panels on a 10 m pole</label>
        {usable
          ? <p className="sec">To see over nearby hills: {mast.sunHours - deck.sunHours >= 0 ? "+" : "−"}{Math.abs(Math.round(mast.sunHours - deck.sunHours))} h of sunlight, longest dark {plainDuration(deck.longestDarkH)} → {plainDuration(mast.longestDarkH)}.</p>
          : <p className="muted">Not available here: no 10 m pole data was computed for this site.</p>}
      </div>
      <input id="mast-sw" type="checkbox" role="switch" className="switch" checked={usable && lander.mast} disabled={!usable} onChange={(e) => onLander({ mast: e.target.checked })} />
    </div>
  );
}

/** Spacecraft inputs and the battery over the mission, always open. */
export function PowerSection({ pp, lander, onLander, hours, dark, hasMast }: Props): ReactElement {
  const p = pp.chosen.power;
  return (
    <section className="card power" aria-labelledby="pw-h">
      <h2 id="pw-h" className="sec-h"><Icon name="battery" fill={p.lowestSocPct} /> Power</h2>
      <div className="power-grid">
        <div className="power-left">
          <h3 className="sub-h">Your spacecraft</h3>
          <SpacecraftForm lander={lander} onLander={onLander} />
          <MastCard pp={pp} lander={lander} onLander={onLander} hasMast={hasMast} />
        </div>
        <div className="power-right">
          <h3 className="sub-h">Battery over the mission</h3>
          <BatteryChart series={p.series} hours={hours} reservePct={lander.spec.minSocPct} dark={dark}
            label={`Battery charge from landing to day ${hours / 24}; lowest ${Math.round(p.lowestSocPct)}%, safety reserve ${lander.spec.minSocPct}%`} />
          <p className="bat-key"><span className="sw-dark" aria-hidden="true" /> No Sun <span className="sw-res" aria-hidden="true" /> Safety reserve</p>
          <p className="sec">The battery drains fastest during the grey bands (no Sun). To survive this plan you would need at least a <b className="mono">{p.batteryNeededKWh.toFixed(1)} kWh</b> battery{p.batteryNeededKWh <= lander.spec.batteryKWh ? `; yours is ${lander.spec.batteryKWh} kWh.` : `; yours is only ${lander.spec.batteryKWh} kWh.`}</p>
          <p className="src">Simple energy model: no heating, no charge losses.</p>
        </div>
      </div>
    </section>
  );
}
