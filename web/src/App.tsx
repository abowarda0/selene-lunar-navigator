import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useSites, useYear } from "./hooks";
import { DEFAULT_LANDER, type LanderPlan } from "./lib/landers";
import { decodePlanLink, encodePlanLink } from "./lib/shareLink";
import { BestDates } from "./selene/BestDates";
import { BestSites } from "./selene/BestSites";
import { ComparePage } from "./selene/ComparePage";
import { CompareTray } from "./selene/CompareTray";
import { GuideProvider, Luna } from "./selene/Luna";
import { Home } from "./selene/Home";
import { MethodPage } from "./selene/MethodPage";
import { atTouchdown, DEFAULT_PLAN, type Plan } from "./selene/plan";
import { PlanBar } from "./selene/PlanBar";
import { PlanPage } from "./selene/PlanPage";
import { useCompare } from "./useCompare";

type View = "home" | "plan" | "dates" | "sites" | "compare" | "method";
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "plan", label: "Plan" },
  { id: "dates", label: "Best dates" },
  { id: "sites", label: "Best sites" },
  { id: "compare", label: "Compare" },
  { id: "method", label: "How it works" },
];

const readHash = (): string => window.location.hash.replace(/^#\/?/, "");
const readView = (): View => {
  const h = readHash().split("?")[0];
  return VIEWS.find((v) => v.id === h)?.id ?? "home";
};
const linked = decodePlanLink(readHash());

export function App(): ReactElement {
  const [view, setView] = useState<View>(readView);
  const [plan, setPlan] = useState<Plan>(linked?.plan ?? DEFAULT_PLAN);
  const [lander, setLander] = useState<LanderPlan>(linked?.lander ?? DEFAULT_LANDER);
  const [datesAfter, setDatesAfter] = useState<string | null>(null);
  const sites = useSites();
  const year = useYear(plan.site);
  const compare = useCompare();

  useEffect(() => {
    const onHash = () => {
      setView(readView());
      const l = decodePlanLink(readHash());
      if (l) { setPlan(l.plan); setLander(l.lander); }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [view]);

  const go = useCallback((v: View) => { window.location.hash = v; }, []);
  const onPlan = useCallback((p: Partial<Plan>) => setPlan((cur) => ({ ...cur, ...p })), []);
  const onLander = useCallback((l: Partial<LanderPlan>) => setLander((cur) => ({ ...cur, ...l })), []);
  const list = sites.data ?? [];
  const site = list.find((s) => s.id === plan.site);
  const span = year.data ? { start: year.data.span_start, stop: year.data.span_stop } : null;
  const ready = list.length > 0;

  return (
    <GuideProvider view={view}>
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top s-top">
        <div className="top-in s-top-in">
          <a className="s-brand" href="#home" aria-label="SELENE home">
            <svg className="s-logo" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
              <rect x="1" y="1" width="38" height="38" rx="10" fill="#1d2530" stroke="#3a4658" />
              <circle cx="20" cy="20" r="8.5" fill="#f3f4f6" />
              <circle cx="17" cy="17" r="2" fill="#c9d1d9" />
              <circle cx="23" cy="23" r="1.4" fill="#c9d1d9" />
              <path d="M30.5 9.5C24 6 11 10.5 9.5 17.5c-1 4.5 6 4 10.5 2.5s11.5-.5 10.5 4c-1.5 7-14.5 11.5-21 8" fill="none" stroke="#4da3ff" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <b>SELENE</b>
            <small>Lunar Landing Site Navigator</small>
          </a>
          <nav className="s-nav" aria-label="Views">
            {VIEWS.map((v) => (
              <a key={v.id} href={`#${v.id}`} aria-current={view === v.id ? "page" : undefined}>
                {v.label}{v.id === "compare" && compare.list.length > 0 ? ` (${compare.list.length})` : ""}
              </a>
            ))}
          </nav>
          <span className="s-pill" title="JPL Horizons + NASA LOLA + NASA DSN, 1-minute steps">Real NASA data</span>
        </div>
        {ready && view !== "home" && <PlanBar sites={list} plan={plan} onPlan={onPlan} lander={lander} onLander={onLander} span={span} />}
      </header>

      <main id="main" tabIndex={-1} className={`main${compare.list.length > 0 ? " with-tray" : ""}`}>
        {sites.error && <div className="alert" role="alert">The site list did not load: {sites.error.message}</div>}
        {!ready && !sites.error && <p className="muted" role="status">Loading the landing sites…</p>}
        {view === "home" && ready && (
          <Home sites={list} plan={plan} span={span}
            onGo={(p, to) => { onPlan(p); setDatesAfter(null); go(to); }} />
        )}
        {view === "plan" && ready && (
          <PlanPage sites={list} plan={plan} onPlan={onPlan} lander={lander} onLander={onLander}
            onFindGood={(after) => { setDatesAfter(after); go("dates"); }}
            inCompare={compare.has(plan)} onCompare={() => compare.toggle(plan)} shareHash={encodePlanLink(plan, lander)} />
        )}
        {view === "dates" && ready && (
          <BestDates site={site} plan={plan} lander={lander} after={datesAfter} onClearAfter={() => setDatesAfter(null)}
            onPick={(start) => { setPlan((cur) => atTouchdown(cur, start)); setDatesAfter(null); go("plan"); }}
            compare={compare} />
        )}
        {view === "sites" && ready && <BestSites sites={list} plan={plan} lander={lander} onPick={(id) => { onPlan({ site: id }); go("plan"); }} compare={compare} />}
        {view === "compare" && ready && (
          <ComparePage sites={list} plans={compare.list} lander={lander} onRemove={compare.toggle}
            onChoose={(p) => { setPlan(p); go("plan"); }} />
        )}
        {view === "method" && <MethodPage />}
      </main>
      {view !== "compare" && <CompareTray list={compare.list} sites={list} message={compare.message} onRemove={compare.toggle} onOpen={() => go("compare")} />}
      <footer className="foot">NASA Space Apps 2026 · JPL Horizons DE441 · NASA LRO LOLA terrain · DSN 810-005</footer>
      <Luna />
    </>
    </GuideProvider>
  );
}
