import { useRef, useState, type PointerEvent, type ReactElement } from "react";
import type { VisWindow } from "../api/types";
import { useWidth } from "../hooks";
import { fmtDay, fmtUtc, toMs } from "../lib/format";
import type { DarkSpell, SocPoint, SunFactor } from "../lib/power";

const MS_PER_H = 3_600_000;
const PAD_L = 92;
const PAD_R = 12;
const TOP = 26;
const ROW = 20;
const GHOST = 6;
const GAP = 10;
const VIEW_H = 10;
const BAT_H = 110;
const AXIS_H = 40;
const MIN_TICK_PX = 90;
const OPACITY_STEPS = 10;
const MIN_OPACITY = 0.15;

export interface Ghost {
  readonly start: string;
  readonly sun: readonly VisWindow[];
  readonly link: readonly VisWindow[];
}

interface Props {
  readonly start: string;
  readonly hours: number;
  readonly sun: readonly VisWindow[];
  /** Visible share of the Sun's disc; omitted when it does not apply (mast panels). */
  readonly sunFactor?: SunFactor;
  readonly link: readonly VisWindow[];
  readonly receiveOnly: readonly VisWindow[];
  /** Earth in view (line of sight, any part of the disc above the skyline); drawn as a thin row above the link. */
  readonly earthView?: readonly VisWindow[];
  readonly battery: readonly SocPoint[];
  readonly floorPct: number;
  readonly dark: readonly DarkSpell[];
  readonly ghost?: Ghost;
  readonly cursor: number;
  readonly onCursor: (h: number) => void;
}

function tickStep(hours: number, plotPx: number): number {
  for (const s of [6, 12, 24, 48, 72, 168]) if ((s / hours) * plotPx >= MIN_TICK_PX) return s;
  return 336;
}

/** Sun runs split where the visible share changes, so each piece gets one opacity. */
function sunPieces(sun: readonly VisWindow[], f: SunFactor | undefined): { a: number; b: number; o: number }[] {
  if (!f) return sun.map((w) => ({ a: toMs(w.start), b: toMs(w.end), o: 1 }));
  const step = f.stepMin * 60_000;
  const t0 = toMs(f.t0);
  const out: { a: number; b: number; o: number }[] = [];
  for (const w of sun) {
    const a0 = toMs(w.start);
    const b0 = toMs(w.end);
    let a = a0;
    while (a < b0) {
      const k = Math.round((a - t0) / step);
      const b = Math.min(b0, t0 + (k + 0.5) * step);
      const v = f.values[Math.max(0, Math.min(f.values.length - 1, k))] ?? 1;
      const o = Math.max(MIN_OPACITY, Math.round(v * OPACITY_STEPS) / OPACITY_STEPS);
      const last = out[out.length - 1];
      if (last && last.b === a && last.o === o) out[out.length - 1] = { ...last, b };
      else if (b > a) out.push({ a, b, o });
      a = b > a ? b : a + step;
    }
  }
  return out;
}

const inside = (ws: readonly VisWindow[], ms: number): boolean => ws.some((w) => toMs(w.start) <= ms && ms < toMs(w.end));

/** Sun, two-way DSN link and battery on one hours-after-touchdown axis. */
export function PlanTimeline(p: Props): ReactElement {
  const [ref, W] = useWidth<HTMLDivElement>(900);
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const t0 = toMs(p.start);
  const plotW = W - PAD_L - PAD_R;
  const x = (h: number) => PAD_L + (h / p.hours) * plotW;
  const xm = (ms: number) => x((ms - t0) / MS_PER_H);
  const ghostH = p.ghost ? GHOST + 4 : 0;
  const ySun = TOP;
  const yView = ySun + ROW + ghostH + GAP;
  const yLink = p.earthView ? yView + VIEW_H + 6 : yView;
  const yBat = yLink + ROW + ghostH + GAP;
  const yAxis = yBat + BAT_H;
  const H = yAxis + AXIS_H;
  const yPct = (pct: number) => yBat + (1 - pct / 100) * BAT_H;
  const step = tickStep(p.hours, plotW);
  const ticks = Array.from({ length: Math.floor(p.hours / step) + 1 }, (_, k) => k * step);
  const line = p.battery.map((s, i) => `${i ? "L" : "M"}${x(s.h).toFixed(1)} ${yPct(s.soc).toFixed(1)}`).join("");

  const hoursAt = (e: PointerEvent<SVGSVGElement>): number | null => {
    if (!svg.current) return null;
    const r = svg.current.getBoundingClientRect();
    const h = ((((e.clientX - r.left) / r.width) * W - PAD_L) / plotW) * p.hours;
    return h < 0 || h > p.hours ? null : Math.round(h * 2) / 2;
  };
  const socAt = (h: number) => p.battery.reduce<SocPoint | null>((best, s) => (!best || Math.abs(s.h - h) < Math.abs(best.h - h) ? s : best), null)?.soc;
  const hv = hover;
  const hvMs = hv == null ? 0 : t0 + hv * MS_PER_H;
  const hvText = hv == null ? "" : `${fmtUtc(new Date(hvMs).toISOString())} · +${hv} h · Sun ${inside(p.sun, hvMs) ? "up" : "down"} ·${p.earthView ? ` Earth ${inside(p.earthView, hvMs) ? "in view" : "hidden"} ·` : ""} link ${inside(p.link, hvMs) ? "open" : "closed"} · battery ${Math.round(socAt(hv) ?? 0)}%`;

  const ghostBars = (ws: readonly VisWindow[], y: number, color: string) => {
    if (!p.ghost) return null;
    const g0 = toMs(p.ghost.start);
    return ws.map((w) => <rect key={`g${w.start}`} x={x((toMs(w.start) - g0) / MS_PER_H)} y={y} width={Math.max(1, ((toMs(w.end) - toMs(w.start)) / MS_PER_H / p.hours) * plotW)} height={GHOST} fill={color} opacity={0.45} />);
  };

  return (
    <div ref={ref} className="tl">
      <p className="tl-hover mono" aria-live="off">{hvText || "Hover for exact values; click to move the cursor."}</p>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sun, contact with Earth and battery over the ${p.hours} hours after touchdown`}
        onPointerMove={(e) => { const h = hoursAt(e); setHover(h); if (e.buttons && h != null) p.onCursor(h); }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => { const h = hoursAt(e); if (h != null) p.onCursor(h); }}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--accent-primary)" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent-primary)" strokeWidth="2" opacity="0.4" />
          </pattern>
        </defs>
        {ticks.map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={TOP} y2={yAxis} stroke="var(--border)" />
            <text x={x(h)} y={yAxis + 16} textAnchor={h === 0 ? "start" : "middle"}>+{h} h</text>
            <text x={x(h)} y={yAxis + 32} textAnchor={h === 0 ? "start" : "middle"}>{fmtDay(new Date(t0 + h * MS_PER_H).toISOString())}</text>
          </g>
        ))}
        <text x={PAD_L - 8} y={ySun + 14} textAnchor="end" className="lane sun">Sun</text>
        <rect x={PAD_L} y={ySun} width={plotW} height={ROW} fill="var(--bg-card)" />
        {sunPieces(p.sun, p.sunFactor).map((s) => <rect key={s.a} x={xm(s.a)} y={ySun} width={Math.max(1, xm(s.b) - xm(s.a))} height={ROW} fill="var(--accent-warm)" opacity={s.o} />)}
        {ghostBars(p.ghost?.sun ?? [], ySun + ROW + 4, "var(--accent-warm)")}

        {p.earthView && (
          <g>
            <text x={PAD_L - 8} y={yView + 9} textAnchor="end" className="lane link small">Earth in view</text>
            <rect x={PAD_L} y={yView} width={plotW} height={VIEW_H} fill="var(--bg-card)" />
            {p.earthView.map((w) => <rect key={`v${w.start}`} x={xm(toMs(w.start))} y={yView} width={Math.max(1, xm(toMs(w.end)) - xm(toMs(w.start)))} height={VIEW_H} fill="var(--accent-soft)" opacity={0.55} />)}
          </g>
        )}
        <text x={PAD_L - 8} y={yLink + 14} textAnchor="end" className="lane link">Earth link</text>
        <rect x={PAD_L} y={yLink} width={plotW} height={ROW} fill="var(--bg-card)" />
        {p.receiveOnly.map((w) => <rect key={`r${w.start}`} x={xm(toMs(w.start))} y={yLink} width={Math.max(1, xm(toMs(w.end)) - xm(toMs(w.start)))} height={ROW} fill="url(#hatch)" />)}
        {p.link.map((w) => <rect key={w.start} x={xm(toMs(w.start))} y={yLink} width={Math.max(1, xm(toMs(w.end)) - xm(toMs(w.start)))} height={ROW} fill="var(--accent-primary)" />)}
        {ghostBars(p.ghost?.link ?? [], yLink + ROW + 4, "var(--accent-primary)")}

        <text x={PAD_L - 8} y={yBat + 12} textAnchor="end" className="lane">Battery</text>
        {p.dark.map((d) => <rect key={d.startH} x={x(d.startH)} y={yBat} width={Math.max(1, x(d.endH) - x(d.startH))} height={BAT_H} fill="var(--text-muted)" opacity={0.12} />)}
        {[0, 50, 100].map((v) => (
          <g key={v}><line x1={PAD_L} x2={W - PAD_R} y1={yPct(v)} y2={yPct(v)} stroke="var(--border)" /><text x={PAD_L - 8} y={yPct(v) + 4} textAnchor="end">{v}%</text></g>
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={yPct(p.floorPct)} y2={yPct(p.floorPct)} stroke="var(--danger)" strokeDasharray="5 4" />
        <text x={W - PAD_R} y={yPct(p.floorPct) - 4} textAnchor="end" style={{ fill: "var(--danger)" }}>reserve {p.floorPct}%</text>
        <path d={line} fill="none" stroke="var(--text-primary)" strokeWidth={1.5} />

        <line x1={x(p.cursor)} x2={x(p.cursor)} y1={TOP - 8} y2={yAxis} stroke="var(--accent-soft)" strokeWidth={2} />
        {hv != null && <line x1={x(hv)} x2={x(hv)} y1={TOP} y2={yAxis} stroke="var(--text-muted)" strokeDasharray="2 3" />}
      </svg>
      <input className="tl-range" type="range" min={0} max={p.hours} step={0.5} value={p.cursor} aria-label="Cursor, hours after touchdown" aria-valuetext={`+${p.cursor} h, ${fmtUtc(new Date(t0 + p.cursor * MS_PER_H).toISOString())}`} onChange={(e) => p.onCursor(Number(e.target.value))} />
    </div>
  );
}
