import type { ReactElement } from "react";
import type { Site } from "../api/types";
import { fmtDate } from "../lib/format";
import { LANDER_PRESETS, PRESET_ORDER, type LanderPlan, type PresetId } from "../lib/landers";
import { DURATION_DAYS, type Plan } from "./plan";

interface Props {
  readonly sites: readonly Site[];
  readonly plan: Plan;
  readonly onPlan: (p: Partial<Plan>) => void;
  readonly lander: LanderPlan;
  readonly onLander: (l: Partial<LanderPlan>) => void;
  readonly span: { readonly start: string; readonly stop: string } | null;
}

const labelOf = (id: PresetId): string => (id === "custom" ? "Custom" : LANDER_PRESETS[id].label);

/** The plan every view answers for. Any change recomputes at once. */
export function PlanBar({ sites, plan, onPlan, lander, onLander, span }: Props): ReactElement {
  const pickLander = (id: PresetId) => onLander(id === "custom" ? { preset: id } : { preset: id, spec: LANDER_PRESETS[id].spec });
  return (
    <form className="planbar" aria-label="Plan" onSubmit={(e) => e.preventDefault()}>
      <div className="pb-field pb-site">
        <label htmlFor="pb-site">Landing site</label>
        <select id="pb-site" value={plan.site} onChange={(e) => onPlan({ site: e.target.value })}>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="pb-field">
        <label htmlFor="pb-date">Landing date and time (UTC)</label>
        <span className="pb-pair">
          <input id="pb-date" type="date" value={plan.date} min={span?.start.slice(0, 10)} max={span?.stop.slice(0, 10)} onChange={(e) => e.target.value && onPlan({ date: e.target.value })} />
          <input aria-label="Landing time (UTC)" type="time" step={60} value={plan.time} onChange={(e) => e.target.value && onPlan({ time: e.target.value })} />
        </span>
      </div>
      <div className="pb-field">
        <label htmlFor="pb-dur">Mission length</label>
        <select id="pb-dur" value={plan.hours} onChange={(e) => onPlan({ hours: Number(e.target.value) })}>
          {DURATION_DAYS.map((d) => <option key={d} value={d * 24}>{d} days</option>)}
        </select>
      </div>
      <div className="pb-field">
        <label htmlFor="pb-lander">Spacecraft</label>
        <select id="pb-lander" value={lander.preset} onChange={(e) => pickLander(e.target.value as PresetId)}>
          {PRESET_ORDER.map((id) => <option key={id} value={id}>{labelOf(id)}</option>)}
        </select>
      </div>
      <p className="pb-note">
        {sites.length} ready-made sites.{span && <> Dates from {fmtDate(span.start)} to {fmtDate(span.stop)} (UTC).</>}
      </p>
    </form>
  );
}
