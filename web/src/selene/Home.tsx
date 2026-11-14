import { useCallback, useState, type ReactElement } from "react";
import { api } from "../api/client";
import type { Site } from "../api/types";
import { latText } from "../lib/format";
import { siteShort } from "./CompareTray";
import { DURATION_DAYS, type Plan } from "./plan";
import { isPolar, PolarChart } from "./PolarChart";
import { MoonGlobe3D } from "./MoonGlobe3D";

type Target = "sites" | "dates" | "plan";
type Mode = "both" | "site" | "date";
const MODES: readonly { id: Mode; label: string; action: string }[] = [
  { id: "both", label: "I have both", action: "Run analysis" },
  { id: "site", label: "I have a site", action: "Find the best dates" },
  { id: "date", label: "I have a date", action: "Find the best sites" },
];

interface Props {
  readonly sites: readonly Site[];
  readonly plan: Plan;
  readonly span: { readonly start: string; readonly stop: string } | null;
  readonly onGo: (p: Partial<Plan>, to: Target) => void;
}

interface Draft {
  readonly site: string;
  readonly date: string;
  readonly hours: number;
}

/** "What do you already know?": three ways in, the spacecraft, and the south pole at a glance. */
export function Home({ sites, plan, span, onGo }: Props): ReactElement {
  const [d, setD] = useState<Draft>({ site: plan.site, date: plan.date, hours: plan.hours });
  const [hover, setHover] = useState<string | null>(null);
  const [globeFailed, setGlobeFailed] = useState(false);
  const [mode, setMode] = useState<Mode>("both");
  const onGlobeFail = useCallback(() => setGlobeFailed(true), []);
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  const shown = sites.find((s) => s.id === (hover ?? d.site));
  const elsewhere = sites.filter((s) => !isPolar(s));

  const siteField = (
    <label className="f">Landing site
      <select value={d.site} onChange={(e) => set({ site: e.target.value })}>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
  const dateField = (
    <label className="f">Landing date (UTC)
      <input type="date" value={d.date} min={span?.start.slice(0, 10)} max={span?.stop.slice(0, 10)} required onChange={(e) => e.target.value && set({ date: e.target.value })} />
    </label>
  );
  const daysField = (
    <label className="f">Mission length
      <select value={d.hours} onChange={(e) => set({ hours: Number(e.target.value) })}>
        {DURATION_DAYS.map((n) => <option key={n} value={n * 24}>{n} days</option>)}
      </select>
    </label>
  );

  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  const run = () => {
    if (mode === "both") onGo({ site: d.site, date: d.date, hours: d.hours }, "plan");
    else if (mode === "site") onGo({ site: d.site, hours: d.hours }, "dates");
    else onGo({ date: d.date, hours: d.hours }, "sites");
  };
  return (
    <div className="home">
      <section className="hero2" aria-labelledby="home-h">
        <div className="hero2-in">
          <div className="hero2-left">
            <p className="s-kicker">SELENE / Lunar mission planning</p>
            <h1 id="home-h" className="s-h1">Your next landing.<br />In a new <span className="warm">light</span><span className="dot">.</span></h1>
            <p className="s-sub">Plan for sunlight. Stay in sight of Earth.</p>
            <form className="setup-card" aria-labelledby="setup-h" onSubmit={(e) => { e.preventDefault(); run(); }}>
              <div className="setup-head"><h2 id="setup-h" className="s-label-strong">Mission setup</h2><span className="mono muted">What do you already know?</span></div>
              <div className="seg" role="tablist" aria-label="What do you already know?">
                {MODES.map((m) => (
                  <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>
                ))}
              </div>
              <div className="setup-fields">
                {mode !== "date" && siteField}
                {mode !== "site" && dateField}
                {daysField}
              </div>
              <p className="src">You pick the spacecraft (solar panels, battery) on the next page.</p>
              <button type="submit" className="btn primary wide">{current.action} <span aria-hidden="true">↗</span></button>
              {span && <p className="src">Data covers {span.start.slice(0, 10)} to {span.stop.slice(0, 10)} (UTC). 12 ready-made sites.</p>}
            </form>
          </div>
          <div className="hero2-right">
            <p className="scene-tag mono">Interactive lunar scene · real NASA relief</p>
            {globeFailed
              ? <PolarChart sites={sites} selected={d.site} onPick={(id) => set({ site: id })} onHover={setHover} />
              : <MoonGlobe3D sites={sites} selected={d.site} onHover={setHover} onFail={onGlobeFail}
                  onOpen={(id) => onGo({ site: id, date: d.date, hours: d.hours }, "plan")} />}
            {shown && (
              <figure className="peek">
                {shown.terrain ? <img src={api.assetUrl(`terrain_${shown.id}.png`)} alt={`Shaded terrain around ${shown.name}`} width={96} height={96} /> : <span className="peek-none">No terrain map</span>}
                <figcaption><b>{siteShort(sites, shown.id)}</b><span className="mono">{latText(shown.lat)}</span><span className="src">Real terrain: NASA LRO LOLA</span></figcaption>
              </figure>
            )}
          </div>
        </div>
      </section>

      {elsewhere.length > 0 && (
        <div className="elsewhere" role="group" aria-label="Elsewhere on the Moon">
          <span className="muted">Elsewhere on the Moon:</span>
          {elsewhere.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={d.site === s.id} onClick={() => set({ site: s.id })}>{siteShort(sites, s.id)}</button>)}
        </div>
      )}

      <section className="why" aria-labelledby="why-h">
        <h2 id="why-h">Why the south pole?</h2>
        <p className="sec">Near the Moon's south pole the Sun never rises far above the horizon, so some ridges stay lit for most of the month while deep craters never see sunlight and hold water ice. That makes it the target for NASA's Artemis landings, but the low Sun also means a single hill can block it, or Earth, for days.</p>
      </section>
    </div>
  );
}
