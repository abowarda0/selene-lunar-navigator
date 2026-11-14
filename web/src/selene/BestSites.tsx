import { VerdictKey } from "./VerdictKey";
import { useMemo, type ReactElement } from "react";
import type { Site } from "../api/types";
import { useDeferred, useYears } from "../hooks";
import { fmtUtc, latText } from "../lib/format";
import type { LanderPlan } from "../lib/landers";
import { rankSites, SORT_RULE, type SiteMetrics } from "../lib/rank";
import { FlatGlobe } from "./FlatGlobe";
import type { CompareState } from "../useCompare";
import { touchdownOf, type Plan } from "./plan";
import { RankTable } from "./RankTable";

interface Props {
  readonly sites: readonly Site[];
  readonly plan: Plan;
  readonly lander: LanderPlan;
  readonly onPick: (siteId: string) => void;
  readonly compare: CompareState;
}

const TEST_POINTS: ReadonlySet<string> = new Set(["ridge", "polar_mid"]);

function tags(s: Site): string[] {
  return [
    ...(s.kind === "landed" ? ["reference"] : []),
    ...(TEST_POINTS.has(s.id) ? ["test point"] : []),
    ...(s.custom ? ["your point"] : []),
    ...(!s.terrain ? ["no terrain, smooth Moon"] : []),
  ];
}

export function BestSites({ sites, plan, lander, onPick, compare }: Props): ReactElement {
  const ids = useMemo(() => sites.map((s) => s.id), [sites]);
  const years = useYears(ids);
  const start = touchdownOf(plan);
  const slope = useMemo(() => new Map((years.data ?? []).map((y) => [y.site.id, y.site_facts?.slope_deg ?? null])), [years.data]);
  const result = useDeferred(years.data ? () => {
    const entries = (years.data ?? []).flatMap((y) => {
      const s = sites.find((x) => x.id === y.site.id);
      return s ? [{ site: s, year: y }] : [];
    });
    return rankSites(entries, start, plan.hours, lander);
  } : null, [years.data, start, plan.hours, lander]);

  const lead = [
    {
      head: "Site",
      cell: (r: SiteMetrics) => <span className="site-cell">{r.site.name}{tags(r.site).map((t) => <span key={t} className="tag">{t}</span>)}</span>,
    },
    { head: "Lat", num: true, cell: (r: SiteMetrics) => <span className="mono">{latText(r.site.lat)}</span> },
    { head: "Ground slope (°)", num: true, cell: (r: SiteMetrics) => { const v = slope.get(r.site.id); return v == null ? "–" : v.toFixed(1); } },
  ];

  return (
    <div className="stack">
      <div>
        <h1 className="headline">Best sites for {fmtUtc(start)}, {plan.hours / 24} days.</h1>
        <p className="src">{SORT_RULE}</p>
        <VerdictKey compact />
      </div>
      <div className="sites-grid">
        <div>
          {!result ? <p className="muted" role="status">{years.loading ? `Loading ${sites.length} site files…` : `Computing ${sites.length} sites…`}</p> : (
            <RankTable caption="Sites ranked" lead={lead} rows={result.ranked.map((row) => ({ key: row.site.id, row }))} pickLabel={(r) => `Open ${r.site.name} in Plan`} onPick={(r) => onPick(r.site.id)} showAll
              onCompare={(r) => compare.toggle({ ...plan, site: r.site.id })} inCompare={(r) => compare.has({ ...plan, site: r.site.id })} />
          )}
          {result && result.outside.length > 0 && <p className="muted">Outside the stored data for this plan: {result.outside.map((s) => s.name).join(", ")}.</p>}
          {years.failed.length > 0 && <p className="alert" role="alert">Did not load: {years.failed.join(", ")}.</p>}
        </div>
        <figure className="locator">
          <FlatGlobe sites={sites} selected={plan.site} onPick={onPick} />
          <figcaption className="src">Site locator, south polar view. LOLA relief, not a photograph. Click a pin to open that site in Plan.</figcaption>
        </figure>
      </div>
    </div>
  );
}
