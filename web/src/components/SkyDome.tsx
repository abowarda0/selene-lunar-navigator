import { useMemo, type ReactElement } from "react";
import type { Series, Site, VisWindow } from "../api/types";
import { domePoint, domeRadius, nearestIndex, skylinePath, trackPath } from "../lib/dome";
import { fmtDateTime } from "../lib/format";
import { isVisibleAt } from "../lib/windows";

export type LineStyle = "solid" | "dash" | "dot";

/** What the dome draws: a stored scenario or a touchdown analysis both fit. */
export interface DomeData {
  readonly scenario: { readonly site: Site; readonly start: string };
  readonly horizon: { readonly az_step_deg: number; readonly elev_deg: readonly number[] };
  readonly series: Pick<Series, "t" | "sun_az" | "sun_el" | "earth_az" | "earth_el">;
  readonly windows: { readonly sun: readonly VisWindow[]; readonly earth: readonly VisWindow[] };
}
export interface DomeLayer {
  readonly data: DomeData;
  readonly line: LineStyle;
}

interface Props {
  readonly layers: readonly DomeLayer[];
  /** Series index for the moving Sun and Earth markers (first layer). */
  readonly idx?: number;
  readonly size?: number;
  readonly crossings?: boolean;
  readonly label: string;
}

const DASH: Record<LineStyle, string | undefined> = { solid: undefined, dash: "8 6", dot: "1 6" };
const RINGS = [10, 30, 60] as const;
const MAX_CROSSINGS = 6;

function visibility(d: DomeData) {
  const t = d.series.t;
  return {
    sun: t.map((iso) => isVisibleAt(d.windows.sun, iso)),
    earth: t.map((iso) => isVisibleAt(d.windows.earth, iso)),
  };
}

function Bearings({ c, rim }: { c: number; rim: number }): ReactElement {
  const ticks = [];
  for (let a = 0; a < 360; a += 10) {
    const major = a % 30 === 0;
    const [x1, y1] = domePoint(a, 0, c, c, rim);
    const [x2, y2] = domePoint(a, 0, c, c, rim + (major ? 9 : 5));
    ticks.push(<line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--rule-strong)" strokeWidth={major ? 1.4 : 1} />);
    if (major) {
      const card = { 0: "N", 90: "E", 180: "S", 270: "W" }[a];
      const [lx, ly] = domePoint(a, 0, c, c, rim + 22);
      ticks.push(<text key={`l${a}`} x={lx} y={ly + 4} textAnchor="middle" className={card ? "lab-big" : "lab"}>{card ?? `${a}°`}</text>);
    }
  }
  return <g>{ticks}</g>;
}

function Crossings({ d, c, rim, body }: { d: DomeData; c: number; rim: number; body: "sun" | "earth" }): ReactElement | null {
  const wins: VisWindow[] = d.windows[body].slice(0, MAX_CROSSINGS);
  const color = body === "sun" ? "var(--sun-ink)" : "var(--earth-ink)";
  const marks = wins.flatMap((w) => [
    w.open_start ? null : { iso: w.start, kind: "rise" },
    w.open_end ? null : { iso: w.end, kind: "set" },
  ]).filter((m): m is { iso: string; kind: string } => m !== null);
  if (!marks.length) return null;
  const labelled = marks.length <= 2;
  return (
    <g>
      {marks.map((m) => {
        const i = nearestIndex(d.series.t, m.iso);
        const [x, y] = domePoint(d.series[`${body}_az`][i], Math.max(0, d.series[`${body}_el`][i]), c, c, rim);
        // a short leader runs inward from the ring so the label clears the rim and the bearing letters
        const len = Math.hypot(c - x, c - y) || 1;
        const lx = x + ((c - x) / len) * 34;
        const ly = y + ((c - y) / len) * 34 + (y > c ? -10 : 10);
        const right = x >= c;
        return (
          <g key={`${body}${m.iso}`}>
            <circle cx={x} cy={y} r={4.5} fill="var(--paper)" stroke={color} strokeWidth={2} />
            {labelled && <path d={`M${x + ((c - x) / len) * 6} ${y + ((c - y) / len) * 6}L${lx} ${ly}`} stroke={color} strokeWidth={1} />}
            {labelled && (
              <text x={lx + (right ? -3 : 3)} y={ly + (y > c ? -4 : 12)} textAnchor={right ? "end" : "start"} className="tick-lab" style={{ fill: color }}>
                {body === "sun" ? "Sun" : "Earth"}{m.kind === "rise" ? "rise" : "set"} {fmtDateTime(m.iso)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function SkyDome({ layers, idx, size = 560, crossings = false, label }: Props): ReactElement {
  const c = size / 2;
  const rim = size / 2 - 40;
  const vis = useMemo(() => layers.map((l) => visibility(l.data)), [layers]);
  const skylines = useMemo(() => {
    const seen = new Set<string>();
    return layers.filter((l) => {
      const id = l.data.scenario.site.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [layers]);
  const rimCircle = `M${c - rim} ${c}a${rim} ${rim} 0 1 0 ${2 * rim} 0a${rim} ${rim} 0 1 0 ${-2 * rim} 0Z`;
  const first = layers[0]?.data;

  const marker = (body: "sun" | "earth", r: number) => {
    if (!first || idx == null) return null;
    const az = first.series[`${body}_az`][idx];
    const el = first.series[`${body}_el`][idx];
    const up = vis[0][body][idx];
    const [x, y] = domePoint(az, Math.max(0, el), c, c, el < 0 ? rim + 14 : rim);
    const color = body === "sun" ? "var(--sun)" : "var(--earth)";
    return (
      <g>
        <circle cx={x} cy={y} r={r} fill={up ? color : "var(--paper)"} stroke={color} strokeWidth={2.5} strokeDasharray={up ? undefined : "3 2.5"} />
      </g>
    );
  };

  return (
    <svg className="dome" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={c} cy={c} r={rim} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
      {RINGS.map((e) => (
        <g key={e}>
          <circle cx={c} cy={c} r={domeRadius(e, rim)} fill="none" stroke="var(--rule)" strokeDasharray="3 4" />
          <text x={c + 4} y={c - domeRadius(e, rim) + 12} className="lab">{e}°</text>
        </g>
      ))}
      <path d={`M${c - 6} ${c}h12M${c} ${c - 6}v12`} stroke="var(--rule-strong)" />
      <Bearings c={c} rim={rim} />
      {skylines.map((l, k) =>
        l.data.scenario.site.terrain ? (
          <g key={l.data.scenario.site.id}>
            <path d={rimCircle + skylinePath(l.data.horizon.elev_deg, l.data.horizon.az_step_deg, c, c, rim)} fill="var(--terrain-fill)" fillRule="evenodd" />
            <path d={skylinePath(l.data.horizon.elev_deg, l.data.horizon.az_step_deg, c, c, rim)} fill="none" stroke="var(--terrain)" strokeWidth={1.6} strokeDasharray={k ? DASH[l.line] : undefined} />
          </g>
        ) : (
          <circle key={l.data.scenario.site.id} cx={c} cy={c} r={rim - 3} fill="none" stroke="var(--smooth)" strokeDasharray="2 5" strokeWidth={2} />
        ),
      )}
      {layers.map((l, k) => {
        const s = l.data.series;
        const sunVisEl = s.sun_el.map((e, i) => (vis[k].sun[i] ? e : -1));
        const earthVisEl = s.earth_el.map((e, i) => (vis[k].earth[i] ? e : -1));
        const dash = DASH[l.line];
        return (
          <g key={`${l.data.scenario.site.id}${l.data.scenario.start}${k}`}>
            <path className="arc" d={trackPath(s.sun_az, s.sun_el, c, c, rim)} stroke="var(--sun)" strokeWidth={1.5} opacity={0.32} strokeDasharray={dash} />
            <path className="arc" d={trackPath(s.earth_az, s.earth_el, c, c, rim)} stroke="var(--earth)" strokeWidth={1.5} opacity={0.32} strokeDasharray={dash} />
            <path className="arc" d={trackPath(s.sun_az, sunVisEl, c, c, rim)} stroke="var(--sun)" strokeWidth={3.2} strokeDasharray={dash} />
            <path className="arc" d={trackPath(s.earth_az, earthVisEl, c, c, rim)} stroke="var(--earth)" strokeWidth={3.2} strokeDasharray={dash} />
          </g>
        );
      })}
      {crossings && first && <Crossings d={first} c={c} rim={rim} body="sun" />}
      {crossings && first && <Crossings d={first} c={c} rim={rim} body="earth" />}
      {marker("sun", 10)}
      {marker("earth", 8)}
    </svg>
  );
}
