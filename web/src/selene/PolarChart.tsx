import type { ReactElement } from "react";
import type { Site } from "../api/types";

const SIZE = 340;
const C = SIZE / 2;
const R = 150;
/** Degrees of latitude from the pole to the chart edge (80° S); every polar site sits inside. */
const SPAN_DEG = 10;
const RINGS: readonly number[] = [-88, -85];
const RAD = Math.PI / 180;

/** Sites close enough to the pole to draw on the chart. */
export const isPolar = (s: Site): boolean => s.lat <= -90 + SPAN_DEG;

const pos = (s: Site): [number, number] => {
  const r = ((90 + s.lat) / SPAN_DEG) * R;
  // south polar view: 0° at the top, 90° E to the right
  return [C + r * Math.sin(s.lon_e * RAD), C - r * Math.cos(s.lon_e * RAD)];
};

interface Props {
  readonly sites: readonly Site[];
  readonly selected: string;
  readonly onPick: (id: string) => void;
  readonly onHover: (id: string | null) => void;
}

/** South pole chart from the real site coordinates; a pin per site, coloured by kind. */
export function PolarChart({ sites, selected, onPick, onHover }: Props): ReactElement {
  const polar = sites.filter(isPolar);
  return (
    <svg className="polar" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Landing sites around the lunar south pole">
      <circle cx={C} cy={C} r={R} className="p-edge" />
      {RINGS.map((lat) => {
        const r = ((90 + lat) / SPAN_DEG) * R;
        return (
          <g key={lat}>
            <circle cx={C} cy={C} r={r} className="p-ring" />
            <text x={C + 4} y={C - r - 4} className="p-lab">{Math.abs(lat)}° S</text>
          </g>
        );
      })}
      <line x1={C} x2={C} y1={C - R} y2={C + R} className="p-ring" />
      <line x1={C - R} x2={C + R} y1={C} y2={C} className="p-ring" />
      <text x={C + 4} y={C - R + 12} className="p-lab">80° S</text>
      <text x={C} y={C - R - 4} textAnchor="middle" className="p-lab">0°</text>
      <text x={C + R - 2} y={C - 4} textAnchor="end" className="p-lab">90° E</text>
      <text x={C + 4} y={C + 12} className="p-lab">pole</text>
      {polar.map((s) => {
        const [x, y] = pos(s);
        const on = s.id === selected;
        return (
          <g key={s.id} className={`pin ${s.kind}${on ? " sel" : ""}`} tabIndex={0} role="button" aria-pressed={on} aria-label={`${s.name}, ${Math.abs(s.lat).toFixed(2)}° S`}
            onClick={() => onPick(s.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(s.id); } }}
            onMouseEnter={() => onHover(s.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(s.id)} onBlur={() => onHover(null)}>
            {on && <circle cx={x} cy={y} r={10} className="pin-pulse" />}
            <circle cx={x} cy={y} r={on ? 6 : 4.5} className="pin-dot" />
          </g>
        );
      })}
    </svg>
  );
}
