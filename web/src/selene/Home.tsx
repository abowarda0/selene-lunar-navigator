import { lazy, Suspense, useCallback, useMemo, useState, type ReactElement } from "react";
import { api } from "../api/client";
import type { Site, VerdictLevel } from "../api/types";
import { useYear } from "../hooks";
import { analyze } from "../lib/analysis";
import { answerSentence } from "../lib/answer";
import { latText } from "../lib/format";
import { DEFAULT_LANDER } from "../lib/landers";
import { planPower } from "../lib/powerPlan";
import { sunHeightAt } from "../lib/sunHeight";
import { CustomPoint } from "./CustomPoint";
import { hasServer } from "../api/client";
import { UtcField } from "./UtcField";
import { VerdictWord } from "./VerdictWord";
import { siteShort } from "./CompareTray";
import { DURATION_DAYS, durationLabel, type Plan } from "./plan";
import { isPolar, PolarChart } from "./PolarChart";
// three.js is large: the globe loads after the page, with the flat polar chart's spot reserved meanwhile.
const MoonGlobe3D = lazy(() => import("./MoonGlobe3D").then((m) => ({ default: m.MoonGlobe3D })));

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
  /** A custom point finished computing on the point server. */
  readonly onCustomSite: (site: Site) => void;
}

interface Draft {
  readonly site: string;
  readonly date: string;
  readonly hours: number;
}

/** "What do you already know?": three ways in, the spacecraft, and the south pole at a glance. */
export function Home({ sites, plan, span, onGo, onCustomSite }: Props): ReactElement {
  const [d, setD] = useState<Draft>({ site: plan.site, date: plan.date, hours: plan.hours });
  const [hover, setHover] = useState<string | null>(null);
  const [globeFailed, setGlobeFailed] = useState(false);
  const [mode, setMode] = useState<Mode>("both");
  const [dateOk, setDateOk] = useState(true);
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
    <UtcField label="Landing date (UTC)" dateOnly date={d.date} min={span?.start.slice(0, 10)} max={span?.stop.slice(0, 10)} onCommit={(date) => set({ date })} onValidity={setDateOk} />
  );
  const daysField = (
    <label className="f">Mission length
      <select value={d.hours} onChange={(e) => set({ hours: Number(e.target.value) })}>
        {DURATION_DAYS.map((n) => <option key={n} value={n * 24}>{durationLabel(n)}</option>)}
      </select>
    </label>
  );

  const current = MODES.find((m) => m.id === mode) ?? MODES[0];

  // Live answer for the current setup, so the first screen already says Good, Marginal or Poor and why.
  const year = useYear(mode === "both" ? d.site : null);
  const preview = useMemo((): { level: VerdictLevel; lead: string; sun: number; link: number; el: number | null } | { error: string } | null => {
    if (mode !== "both" || !year.data) return null;
    const a = analyze(year.data, `${d.date}T${plan.time}Z`, d.hours);
    if (!a.ok) return { error: a.error };
    const pp = planPower(year.data, { start: a.start, stop: a.stop }, DEFAULT_LANDER);
    const h = (ws: readonly { hours: number }[]) => ws.reduce((s, w) => s + w.hours, 0);
    return {
      level: pp.verdict.level,
      lead: answerSentence(pp, DEFAULT_LANDER, d.hours / 24).lead,
      sun: (100 * h(pp.chosen.sun)) / a.hours,
      link: (100 * h(pp.link)) / a.hours,
      el: sunHeightAt(year.data, a.start)?.elDeg ?? null,
    };
  }, [mode, year.data, d.date, d.hours, plan.time]);
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
              {mode === "both" && (
                <div className={`quick ${dateOk && preview && "level" in preview ? preview.level : ""}`} aria-live="polite">
                  {!dateOk ? <p className="muted">Pick a landing date to see the answer.</p>
                    : !preview ? <p className="muted">Checking sunlight and contact…</p>
                    : "error" in preview ? <p className="muted">{preview.error}</p>
                    : (
                      <>
                        <p className="quick-lead"><VerdictWord level={preview.level} /> {preview.lead}</p>
                        <p className="quick-stats mono">Sun up {Math.round(preview.sun)}% · Earth link {Math.round(preview.link)}%{preview.el != null ? ` · Sun ${preview.el.toFixed(1)}° high at landing` : ""}</p>
                      </>
                    )}
                </div>
              )}
              <button type="submit" className="btn primary wide" disabled={!dateOk && mode !== "site"}>{current.action} <span aria-hidden="true">↗</span></button>
              {span && <p className="src">Data covers {span.start.slice(0, 10)} to {span.stop.slice(0, 10)} (UTC). 12 ready-made sites.</p>}
            </form>
            {hasServer && <CustomPoint sites={sites} onOpen={(id) => onGo({ site: id, date: d.date, hours: d.hours }, "plan")} onComputed={onCustomSite} />}
          </div>
          <div className="hero2-right">
            <p className="scene-tag mono">Interactive lunar scene · real NASA relief</p>
            {globeFailed
              ? <PolarChart sites={sites} selected={d.site} onPick={(id) => set({ site: id })} onHover={setHover} />
              : (
                <Suspense fallback={<div className="globe3d" aria-busy="true"><p className="muted">Loading the Moon…</p></div>}>
                  <MoonGlobe3D sites={sites} selected={d.site} onHover={setHover} onFail={onGlobeFail}
                    onOpen={(id) => onGo({ site: id, date: d.date, hours: d.hours }, "plan")} />
                </Suspense>
              )}
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
