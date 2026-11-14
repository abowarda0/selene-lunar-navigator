import type { ReactElement } from "react";
import { useWidth } from "../hooks";
import type { DarkSpell, SocPoint } from "../lib/power";

const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 8;
const AXIS_H = 22;
const FULL_H = 220;
const SPARK_H = 64;
const PCT_TICKS: readonly number[] = [0, 50, 100];

interface Props {
  readonly series: readonly SocPoint[];
  readonly hours: number;
  readonly reservePct: number;
  readonly dark: readonly DarkSpell[];
  /** Small version without axes, for Compare. */
  readonly spark?: boolean;
  readonly label: string;
}

const dayStep = (hours: number): number => (hours <= 72 ? 12 : hours <= 240 ? 48 : 120);

/** Battery charge over the mission (0–100%), with the safety reserve and the stretches without Sun. */
export function BatteryChart({ series, hours, reservePct, dark, spark, label }: Props): ReactElement {
  const [ref, w] = useWidth<HTMLDivElement>(spark ? 280 : 640);
  const H = spark ? SPARK_H : FULL_H;
  const l = spark ? 2 : PAD_L;
  const r = spark ? 2 : PAD_R;
  const bottom = H - (spark ? 2 : AXIS_H);
  const top = spark ? 2 : PAD_T;
  const x = (h: number) => l + (Math.max(0, Math.min(hours, h)) / hours) * (w - l - r);
  const y = (pct: number) => top + (1 - pct / 100) * (bottom - top);
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(s.h).toFixed(1)} ${y(s.soc).toFixed(1)}`).join("");
  const area = series.length > 0 ? `${line}L${x(series[series.length - 1].h).toFixed(1)} ${bottom}L${x(series[0].h).toFixed(1)} ${bottom}Z` : "";
  const step = dayStep(hours);
  const ticks = Array.from({ length: Math.floor(hours / step) + 1 }, (_, k) => k * step);
  const low = series.reduce((m, s) => Math.min(m, s.soc), 100);
  const tone = low <= reservePct + 0.5 ? "var(--danger)" : "var(--success)";
  return (
    <div ref={ref} className={spark ? "bat spark" : "bat"}>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} role="img" aria-label={label}>
        {dark.map((d) => <rect key={d.startH} x={x(d.startH)} y={top} width={Math.max(1, x(d.endH) - x(d.startH))} height={bottom - top} className="bat-dark" />)}
        {!spark && PCT_TICKS.map((p) => (
          <g key={p}>
            <line x1={l} x2={w - r} y1={y(p)} y2={y(p)} className="bat-grid" />
            <text x={l - 6} y={y(p) + 4} textAnchor="end">{p}%</text>
          </g>
        ))}
        <path d={area} fill={tone} opacity={0.18} />
        <path d={line} fill="none" stroke={tone} strokeWidth={spark ? 1.5 : 2} />
        <line x1={l} x2={w - r} y1={y(reservePct)} y2={y(reservePct)} stroke="var(--danger)" strokeDasharray="5 4" />
        {!spark && <text x={w - r} y={y(reservePct) - 5} textAnchor="end" className="bat-res">safety reserve {reservePct}%</text>}
        {!spark && ticks.map((h) => <text key={h} x={x(h)} y={H - 6} textAnchor={h === 0 ? "start" : h === hours ? "end" : "middle"}>{h === 0 ? "landing" : `day ${Math.round(h / 24 * 10) / 10}`}</text>)}
      </svg>
    </div>
  );
}
