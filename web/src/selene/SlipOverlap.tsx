import { useMemo, useState, type ReactElement } from "react";
import type { YearData } from "../api/types";
import { useWidth } from "../hooks";
import { compareSlip, FIRST_HOURS, overlapHeadline, overlapWhy, spanHours, type Cause, type EarthMode, type Overlap72, type Span } from "../lib/overlap72";

interface Props {
  readonly year: YearData;
  readonly plannedStart: string;
  readonly lateStart: string;
  /** "24 h", "7 d" */
  readonly delayLabel: string;
}

const PAD_L = 84;
const PAD_R = 14;
const BAR_H = 16;
const STRIP_H = 4;
const ROW_H = BAR_H + 2 * (STRIP_H + 2) + 14;
/** Hours-after-touchdown → pixels, for a chart drawn at its real width (text never scales). */
interface Scale { readonly x: (h: number) => number; readonly wd: (s: Span) => number; readonly plot: number }
const scaleFor = (w: number): Scale => {
  const plot = Math.max(120, w - PAD_L - PAD_R);
  const x = (h: number): number => PAD_L + (h / FIRST_HOURS) * plot;
  return { x, wd: ([a, b]) => Math.max(1, x(b) - x(a)), plot };
};
const h1 = (h: number): string => h.toFixed(1);
const at = (h: number): string => `T+${Math.floor(h)}h${h % 1 ? ` ${String(Math.round((h % 1) * 60)).padStart(2, "0")}m` : ""}`;
const MISSING: Record<EarthMode, Record<Cause["missing"], string>> = {
  view: { sun: "Sun behind the hills", earth: "Earth out of sight", both: "Sun and Earth hidden" },
  link: { sun: "Sun behind the hills", earth: "no NASA dish in reach", both: "Sun down, no dish in reach" },
};

function Row({ y, label, o, marks, sc }: { y: number; label: string; o: Overlap72; marks: readonly Cause[]; sc: Scale }): ReactElement {
  const { x, wd, plot } = sc;
  const PLOT = plot;
  return (
    <g>
      <text x={PAD_L - 8} y={y + 12} textAnchor="end" className="so-lab">{label}</text>
      <rect x={PAD_L} y={y} width={PLOT} height={BAR_H} className="so-track" />
      {o.both.map((s) => <rect key={`b${s[0]}`} x={x(s[0])} y={y} width={wd(s)} height={BAR_H} fill="url(#so-both)" />)}
      {marks.map((c) => (
        <g key={`${c.kind}${c.span[0]}`}>
          <rect x={x(c.span[0])} y={y - 3} width={wd(c.span)} height={BAR_H + 6} className={`so-${c.kind}`} />
          {wd(c.span) > 64 && (
            <text x={x(c.span[0]) + wd(c.span) / 2} y={y + 12} textAnchor="middle" className={`so-mark so-mark-${c.kind}`}>
              {c.kind === "lost" ? "−" : "+"}{h1(c.span[1] - c.span[0])} h
            </text>
          )}
        </g>
      ))}
      <rect x={PAD_L} y={y + BAR_H + 2} width={PLOT} height={STRIP_H} className="so-track" />
      {o.sun.map((s) => <rect key={`s${s[0]}`} x={x(s[0])} y={y + BAR_H + 2} width={wd(s)} height={STRIP_H} fill="var(--accent-warm)" />)}
      <rect x={PAD_L} y={y + BAR_H + STRIP_H + 4} width={PLOT} height={STRIP_H} className="so-track" />
      {o.earth.map((s) => <rect key={`e${s[0]}`} x={x(s[0])} y={y + BAR_H + STRIP_H + 4} width={wd(s)} height={STRIP_H} fill="var(--accent-primary)" />)}
    </g>
  );
}

/**
 * The promise: hours of simultaneous sunlight (power) and Earth (comms) gained or lost in the first 72 h
 * after touchdown when the landing slips, and why. Two bars on one elapsed-hours axis, lost and gained marked.
 */
export function SlipOverlap({ year, plannedStart, lateStart, delayLabel }: Props): ReactElement | null {
  const [mode, setMode] = useState<EarthMode>("view");
  const [box, W] = useWidth<HTMLDivElement>(720);
  const sc = scaleFor(W);
  const { x } = sc;
  const s = useMemo(() => compareSlip(year, plannedStart, lateStart, mode), [year, plannedStart, lateStart, mode]);
  const other = useMemo(() => compareSlip(year, plannedStart, lateStart, mode === "view" ? "link" : "view"), [year, plannedStart, lateStart, mode]);
  if (!s) return <p className="muted">The first {FIRST_HOURS} h after one of the two landings fall outside the stored data.</p>;

  const a = spanHours(s.planned.both);
  const b = spanHours(s.late.both);
  const why = overlapWhy(s, mode);
  const ticks = sc.plot < 420 ? [0, 24, 48, 72] : [0, 12, 24, 36, 48, 60, 72];
  const H = 2 * ROW_H + 26;
  const otherLabel = mode === "view" ? "DSN two-way link" : "Earth in view";

  return (
    <section className="so" aria-labelledby="so-h">
      <div className="so-head">
        <h3 id="so-h" className="so-title">First {FIRST_HOURS} hours after touchdown</h3>
        <div className="seg so-seg" role="radiogroup" aria-label="What counts as Earth">
          <span className="so-seg-l">Earth =</span>
          {(["view", "link"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "view" ? "Line of sight" : "DSN link"}
            </button>
          ))}
        </div>
      </div>

      <p className={`so-headline ${s.deltaH < -0.05 ? "loss" : s.deltaH > 0.05 ? "gain" : ""}`} role="status">{overlapHeadline(delayLabel, s, mode)}</p>
      {why && <p className="so-why"><b>Why:</b> {why}</p>}

      <dl className="so-figs">
        <div><dt>Planned</dt><dd className="mono">{h1(a)} h</dd></div>
        <div><dt>Late by {delayLabel}</dt><dd className="mono">{h1(b)} h</dd></div>
        <div className={s.deltaH < -0.05 ? "loss" : s.deltaH > 0.05 ? "gain" : ""}><dt>Difference</dt><dd className="mono">{s.deltaH > 0.05 ? "+" : s.deltaH < -0.05 ? "−" : "±"}{h1(Math.abs(s.deltaH))} h</dd></div>
        {other && (
          <div className="so-other"><dt>With {otherLabel}</dt><dd className="mono">{h1(spanHours(other.planned.both))} → {h1(spanHours(other.late.both))} h ({Math.abs(other.deltaH) < 0.05 ? "±" : other.deltaH > 0 ? "+" : "−"}{h1(Math.abs(other.deltaH))})</dd></div>
        )}
      </dl>

      <div ref={box} className="so-box">
      <svg className="so-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Overlap in the first ${FIRST_HOURS} hours: planned ${h1(a)} hours, late ${h1(b)} hours. ${s.causes.map((c) => `${c.kind} ${h1(c.span[1] - c.span[0])} hours from ${at(c.span[0])}, ${MISSING[mode][c.missing]}`).join("; ")}`}>
        <defs>
          <pattern id="so-both" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="8" fill="var(--accent-warm)" /><rect x="4" width="4" height="8" fill="var(--accent-primary)" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={H - 18} className="so-grid" />
            <text x={x(t)} y={H - 4} textAnchor={t === 0 ? "start" : t === FIRST_HOURS ? "end" : "middle"} className="so-tick">+{t} h</text>
          </g>
        ))}
        <Row y={6} label="Planned" o={s.planned} marks={s.causes.filter((c) => c.kind === "gained")} sc={sc} />
        <Row y={6 + ROW_H} label={`Late +${delayLabel}`} o={s.late} marks={s.causes.filter((c) => c.kind === "lost")} sc={sc} />
      </svg>
      </div>

      <ul className="so-legend">
        <li><i className="sw both" aria-hidden="true" /> Overlap: Sun and Earth both available</li>
        <li><i className="sw sun" aria-hidden="true" /> Sun</li>
        <li><i className="sw earth" aria-hidden="true" /> Earth ({mode === "view" ? "line of sight" : "DSN link"})</li>
        <li><i className="sw lost" aria-hidden="true" /> Lost on the late date</li>
        <li><i className="sw gained" aria-hidden="true" /> Gained on the late date (shown on the planned bar, where it was missing)</li>
      </ul>
      {s.causes.length > 0 && (
        <ul className="so-causes">
          {s.causes.map((c) => (
            <li key={`${c.kind}${c.span[0]}`} className={c.kind}>
              <b>{c.kind === "lost" ? "Lost" : "Gained"} {h1(c.span[1] - c.span[0])} h</b> <span className="mono">{at(c.span[0])} – {at(c.span[1])}</span>: {c.kind === "lost" ? "on the late date, " : "on the planned date, "}{MISSING[mode][c.missing]}
            </li>
          ))}
        </ul>
      )}
      {mode === "view" && !year.windows.earth_view && <p className="src">Earth in view is read from the 30-minute sky track and the LOLA skyline (edges ±15 min); the DSN link is minute-accurate.</p>}
    </section>
  );
}
