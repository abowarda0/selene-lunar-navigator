import type { ReactElement } from "react";
import { LANDER_PRESETS, type LanderPlan, type PresetId } from "../lib/landers";

const CHOICES: readonly Exclude<PresetId, "custom">[] = ["small", "rover", "large"];

interface Props {
  readonly lander: LanderPlan;
  readonly onLander: (l: Partial<LanderPlan>) => void;
  readonly label: string;
}

/** Small lander / Rover / Large as toggle chips; "Custom" shows when the numbers were edited. */
export function PresetChips({ lander, onLander, label }: Props): ReactElement {
  return (
    <div className="chips" role="group" aria-label={label}>
      {CHOICES.map((id) => (
        <button key={id} type="button" className="chip big" aria-pressed={lander.preset === id} onClick={() => onLander({ preset: id, spec: LANDER_PRESETS[id].spec })}>
          {LANDER_PRESETS[id].label}
        </button>
      ))}
      {lander.preset === "custom" && <span className="chip big static on">Custom values</span>}
    </div>
  );
}
