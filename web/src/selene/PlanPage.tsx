import { lazy, Suspense, useEffect, useMemo, useState, type ReactElement } from "react";
import type { Site } from "../api/types";
import { useYear } from "../hooks";
import { analyze, clip } from "../lib/analysis";
import { fmtUtc, toMs } from "../lib/format";
import type { LanderPlan } from "../lib/landers";
import { darkSpells } from "../lib/power";
import { planPower, sunFactorOf } from "../lib/powerPlan";
import { evaluatePlan } from "../lib/rank";
import { answerSentence } from "../lib/answer";
import { AnswerHero } from "./AnswerHero";
import { NowStrip } from "./NowStrip";
import { PlanTimeline } from "./PlanTimeline";
import { domeData, shiftPlan, touchdownOf, type Plan } from "./plan";
import { PowerSection } from "./PowerSection";
import { DataCard, GroundCard } from "./SiteCards";
import { SlipCompare, SlipInput } from "./SlipPanel";
import { OverlapStart } from "./SlipOverlap";
import { TechDetails } from "./TechDetails";
import { Tiles } from "./Tiles";
import { SuggestCard } from "./SuggestCard";
import { VerdictKey } from "./VerdictKey";
// three.js is large: load the 3D view only when a Plan page shows it.
const Terrain3D = lazy(() => import("./Terrain3D").then((m) => ({ default: m.Terrain3D })));
import { usePublishGuide } from "./Luna";
import { isInside } from "../lib/heightmap";
import { bodyStateAt } from "../lib/now";
import { earthViewWindows } from "../lib/earthView";
import { maxSunElevation, sunHeightAt } from "../lib/sunHeight";

const MS_PER_H = 3_600_000;
const shortName = (s: Site): string => s.name.replace(/ \(sample point\)$/, "");

interface Props {
  readonly sites: readonly Site[];
  readonly plan: Plan;
  readonly onPlan: (p: Partial<Plan>) => void;
  readonly lander: LanderPlan;
  readonly onLander: (l: Partial<LanderPlan>) => void;
  /** Open Best dates, for touchdowns after this time when given. */
  readonly onFindGood: (afterIso: string | null) => void;
  readonly inCompare: boolean;
  readonly onCompare: () => void;
  /** "plan?..." hash that reopens this plan. */
  readonly shareHash: string;
}

export function PlanPage({ sites, plan, onPlan, lander, onLander, onFindGood, inCompare, onCompare, shareHash }: Props): ReactElement {
  const year = useYear(plan.site);
  const site = sites.find((s) => s.id === plan.site);
  const [slip, setSlip] = useState(0);
  const [cursor, setCursor] = useState(0);
  const active = slip > 0 ? shiftPlan(plan, slip) : plan;
  const touchdown = touchdownOf(active);
  // Open the 3D view and cursor on the first sunlit moment, so a plan that lands in darkness does not start on a black scene.
  useEffect(() => {
    const yd = year.data;
    if (!yd) { setCursor(0); return; }
    const t0 = toMs(touchdown);
    const first = yd.windows.sun.find((w) => toMs(w.end) > t0 && toMs(w.start) < t0 + plan.hours * MS_PER_H);
    const h = first ? Math.max(0, (toMs(first.start) - t0) / MS_PER_H) : 0;
    setCursor(Math.min(plan.hours, Math.ceil(h * 2) / 2));
  }, [touchdown, plan.site, plan.hours, year.data]);

  const y = year.data;
  const a = useMemo(() => (y ? analyze(y, touchdown, active.hours) : null), [y, touchdown, active.hours]);
  const pp = useMemo(() => (y && a?.ok ? planPower(y, { start: a.start, stop: a.stop }, lander) : null), [y, a, lander]);
  const dome = useMemo(() => (y && a?.ok ? domeData(y, a) : null), [y, a]);
  const sunFactor = useMemo(() => (y && pp?.chosen.partialSun ? sunFactorOf(y) : undefined), [y, pp?.chosen.partialSun]);
  const plannedStart = touchdownOf(plan);
  const slipRows = useMemo(() => (y && slip > 0
    ? { planned: evaluatePlan(y, plannedStart, plan.hours, lander), slipped: evaluatePlan(y, touchdown, plan.hours, lander) }
    : null), [y, slip, plannedStart, touchdown, plan.hours, lander]);
  const ghost = useMemo(() => {
    if (!y || slip === 0) return undefined;
    const g = analyze(y, plannedStart, plan.hours);
    if (!g.ok) return undefined;
    const gp = planPower(y, { start: g.start, stop: g.stop }, lander);
    return { start: g.start, sun: gp.chosen.sun, link: gp.link };
  }, [y, slip, plannedStart, plan.hours, lander]);

  usePublishGuide(pp && a?.ok ? {
    site: site ? shortName(site) : undefined, days: active.hours / 24, verdict: pp.verdict.level, lander: lander.preset,
    sunPct: Math.round(100 * pp.chosen.sunHours / a.hours), linkPct: Math.round(100 * pp.link.reduce((h, w) => h + w.hours, 0) / a.hours),
    lowestBatteryPct: Math.round(pp.chosen.power.lowestSocPct), longestDarkH: Math.round(pp.chosen.longestDarkH),
    batteryNeededKWh: Math.round(pp.chosen.power.batteryNeededKWh * 10) / 10,
  } : {}, pp && a?.ok ? answerSentence(pp, lander, active.hours / 24).lead : null);
  if (!site) return <p className="muted">Pick a site in the plan bar.</p>;
  if (year.error) return <div className="alert" role="alert">The data for {site.name} did not load: {year.error.message}</div>;
  if (!y || !a) return <p className="muted">Loading Sun, Earth and skyline data for {site.name}…</p>;

  const slipControls = <SlipInput slip={slip} onSlip={setSlip} />;
  const slipBlock = slip > 0 && slipRows && (
    <SlipCompare slip={slip} planned={slipRows.planned} slipped={slipRows.slipped} plannedStart={plannedStart} slippedStart={touchdown} year={y}
      onAdopt={() => { onPlan({ date: active.date, time: active.time }); setSlip(0); }}
      onFindGood={() => onFindGood(touchdown)} />
  );
  if (!a.ok || !pp || !dome) {
    return (
      <div className="stack">
        <div className="head-row"><h1 className="headline">No result for this plan.</h1>{slipControls}</div>
        {slipBlock}
        <div className="alert" role="alert">{a.ok ? "The power model could not run." : a.error}</div>
      </div>
    );
  }

  const days = active.hours / 24;
  const cursorIso = new Date(toMs(a.start) + cursor * MS_PER_H).toISOString().slice(0, 16) + "Z";
  const idx = Math.max(0, Math.min(dome.series.t.length - 1, Math.round((toMs(cursorIso) - toMs(dome.series.t[0])) / (y.track.step_min * 60_000))));
  const receiveOnly = y.windows.receive_only ? clip(y.windows.receive_only, a.start, a.stop) : null;
  const earthView = clip(earthViewWindows(y), a.start, a.stop);
  const earthViewPct = (100 * earthView.reduce((h, w) => h + (toMs(w.end) - toMs(w.start)) / MS_PER_H, 0)) / a.hours;
  const sunHeight = sunHeightAt(y, a.start);
  const cursorSun = sunHeightAt(y, cursorIso);
  const dark = darkSpells(pp.chosen.sun, a.start, a.stop);
  const context = `${shortName(site)} · ${fmtUtc(a.start)} · ${days} days${slip > 0 ? ` · launch late by ${slip} h` : ""}`;

  return (
    <div className="stack plan">
      <div className="s-pagehead">
        <h1 className="s-h1 page">Mission Analysis<span className="dot">.</span></h1>
        <a className="btn" href="#home">Edit setup <span aria-hidden="true">→</span></a>
      </div>
      <AnswerHero level={pp.verdict.level} answer={answerSentence(pp, lander, days)} context={context}
        inCompare={inCompare} onCompare={onCompare} onFindDates={() => onFindGood(null)} slip={slipControls} shareHash={shareHash} />
      {slipBlock}
      {slip === 0 && <OverlapStart year={y} plannedStart={plannedStart} onPickDelay={setSlip} />}
      <details className="disc vkey-disc">
        <summary><span>What do Good, Marginal and Poor mean?</span></summary>
        <VerdictKey />
      </details>
      {!site.terrain && <div className="alert" role="note">No terrain data for this site: times assume a smooth Moon. Near the pole that is wrong by up to 62 pts.</div>}

      <Tiles pp={pp} hours={a.hours} slopeDeg={y.site_facts?.slope_deg ?? null}
        sunNow={bodyStateAt(y.windows.sun, a.start, y.span_stop)} linkNow={bodyStateAt(y.windows.earth, a.start, y.span_stop)}
        sunHeight={sunHeight} maxSunElDeg={maxSunElevation(y, a.start, a.stop)} earthViewPct={earthViewPct} />
      {site.terrain && (
        <Suspense fallback={<section className="t3d card" aria-busy="true"><p className="muted">Loading the 3D landing site…</p></section>}>
        <Terrain3D siteId={site.id} siteName={shortName(site)} sunAz={dome.series.sun_az[idx]} sunEl={dome.series.sun_el[idx]}
          earthAz={dome.series.earth_az[idx]} earthEl={dome.series.earth_el[idx]} sunUp={isInside(pp.chosen.sun, cursorIso)}
          linkUp={isInside(pp.link, cursorIso)} whenLabel={`Day ${(cursor / 24).toFixed(1)} · ${fmtUtc(cursorIso)}${cursorSun ? ` · Sun ${cursorSun.elDeg.toFixed(1)}° high` : ""}`}
          cursor={cursor} hours={a.hours} onCursor={setCursor} />
        </Suspense>
      )}
      <details className="disc power-check">
        <summary><span><b>Power check (optional)</b> · {answerSentence(pp, lander, days).power}</span></summary>
        <PowerSection pp={pp} lander={lander} onLander={onLander} hours={a.hours} dark={dark} hasMast={!!y.windows.sun_mast10} />
        <SuggestCard year={y} span={{ start: a.start, stop: a.stop }} lander={lander} onLander={onLander} />
      </details>

      <div className="two">
        <DataCard link={pp.link} receiveOnly={receiveOnly} missionHours={a.hours} preset={lander.preset} />
        <GroundCard site={site} facts={y.site_facts} sunAz={dome.series.sun_az[idx]} earthAz={dome.series.earth_az[idx]} />
      </div>

      <NowStrip at={cursorIso} stop={a.stop} sun={pp.chosen.sun} link={pp.link} battery={pp.chosen.power.series} longestDarkH={pp.chosen.longestDarkH} />
      <section className="card" aria-labelledby="tl-h">
        <h2 id="tl-h" className="sec-h">Timeline{slip > 0 ? ", late launch (thin rows: as planned)" : ""}</h2>
        <PlanTimeline start={a.start} hours={a.hours} sun={pp.chosen.sun} sunFactor={sunFactor} link={pp.link} receiveOnly={receiveOnly ?? []}
          earthView={earthView}
          battery={pp.chosen.power.series} floorPct={lander.spec.minSocPct} dark={dark} ghost={ghost} cursor={cursor} onCursor={setCursor} />
        <p className="src">Drag or use the slider to point at a moment. Earth in view: any part of Earth above the hills (line of sight, from the 30-minute sky track, ±15 min). Earth link: a NASA dish can hold a two-way link. Hatched: listen-only contact (Earth low for the dish).</p>
      </section>

      <TechDetails site={site} dome={dome} idx={idx} events={a.events} mast={pp.chosen.mast} />
      <p className="muted"><a className="quiet" href="#method">How do we know this is right?</a></p>
    </div>
  );
}
