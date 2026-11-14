import { useEffect, useState, type ReactElement } from "react";
import { validateLander, type LanderPlan } from "../lib/landers";
import type { Lander } from "../lib/power";
import { Disclosure } from "./Disclosure";
import { PresetChips } from "./PresetChips";

type Key = keyof Lander;
interface FieldDef {
  readonly k: Key;
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly hint: string;
}

const MAIN: readonly FieldDef[] = [
  { k: "panelW", label: "Solar panel power", unit: "W", min: 50, max: 3000, step: 10, hint: "What the panels make in full sunlight." },
  { k: "batteryKWh", label: "Battery size", unit: "kWh", min: 0.2, max: 40, step: 0.1, hint: "Energy stored for the time without Sun." },
  { k: "sunLoadW", label: "Power used in sunlight", unit: "W", min: 10, max: 2000, step: 10, hint: "Driving, instruments and heaters while lit." },
  { k: "darkLoadW", label: "Power used in the dark", unit: "W", min: 5, max: 1000, step: 5, hint: "Keeping warm and alive while waiting for the Sun." },
];
const ADVANCED: readonly FieldDef[] = [
  { k: "minSocPct", label: "Battery safety reserve", unit: "%", min: 0, max: 90, step: 1, hint: "Charge never to be used; below it counts as running out." },
  { k: "commsW", label: "Radio power while talking to Earth", unit: "W", min: 0, max: 500, step: 5, hint: "Extra power drawn while Earth is reachable." },
];

type Draft = Record<Key, string>;
const KEYS: readonly Key[] = ["panelW", "batteryKWh", "minSocPct", "sunLoadW", "darkLoadW", "commsW"];
const toDraft = (l: Lander): Draft => Object.fromEntries(KEYS.map((k) => [k, String(l[k])])) as Draft;
// an empty box is invalid, not zero
const num = (v: string): number => (v.trim() === "" ? Number.NaN : Number(v));
const parse = (d: Draft): Lander => Object.fromEntries(KEYS.map((k) => [k, num(d[k])])) as unknown as Lander;
const same = (a: Lander, b: Lander): boolean => KEYS.every((k) => a[k] === b[k]);

interface Props {
  readonly lander: LanderPlan;
  readonly onLander: (l: Partial<LanderPlan>) => void;
}

/** Presets plus a slider and a number box per value; valid edits switch the preset to Custom. */
export function SpacecraftForm({ lander, onLander }: Props): ReactElement {
  const [draft, setDraft] = useState<Draft>(() => toDraft(lander.spec));
  useEffect(() => {
    setDraft((d) => (same(parse(d), lander.spec) ? d : toDraft(lander.spec)));
  }, [lander.spec]);
  const errs = validateLander(parse(draft));
  const set = (k: Key, v: string) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    const spec = parse(next);
    if (Object.keys(validateLander(spec)).length === 0) onLander({ preset: "custom", spec });
  };
  const field = (f: FieldDef) => {
    const v = num(draft[f.k]);
    const id = `sc-${f.k}`;
    return (
      <div className="sc-field" key={f.k}>
        <label className="sc-label" htmlFor={id}>{f.label} <span className="muted">({f.unit})</span></label>
        <div className="sc-pair">
          <input type="range" aria-label={`${f.label} slider`} min={f.min} max={f.max} step={f.step} value={Number.isFinite(v) ? Math.max(f.min, Math.min(f.max, v)) : f.min} onChange={(e) => set(f.k, e.target.value)} />
          <span className="sc-box">
            <input id={id} className="s-input" inputMode="decimal" value={draft[f.k]} aria-invalid={!!errs[f.k]} aria-describedby={`${id}-n`} onChange={(e) => set(f.k, e.target.value)} />
            <span className="sc-unit">{f.unit}</span>
          </span>
        </div>
        <span id={`${id}-n`} className={errs[f.k] ? "s-err" : "s-note"}>{errs[f.k] ?? f.hint}</span>
      </div>
    );
  };
  return (
    <div className="sc">
      <PresetChips lander={lander} onLander={onLander} label="Spacecraft type" />
      <div className="sc-grid">{MAIN.map(field)}</div>
      <Disclosure title="Advanced">
        <div className="sc-grid">{ADVANCED.map(field)}</div>
      </Disclosure>
      <p className="s-note">Preset values are illustrative for each class of spacecraft, not a real vehicle.</p>
    </div>
  );
}
