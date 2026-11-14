import { useEffect, useRef, useState, type ReactElement } from "react";
import { api } from "../api/client";
import type { PointJob, Site } from "../api/types";
import { NEAR_KM, nearestSites, parseLat, parseLon, TERRAIN_NOTE, terrainLevel, type NearSite } from "../lib/customPoint";
import { latText, lonText } from "../lib/format";

interface Props {
  readonly sites: readonly Site[];
  /** Open a site (ready-made or computed) in Plan. */
  readonly onOpen: (siteId: string) => void;
  /** A custom point finished computing: add it to the site list. */
  readonly onComputed: (site: Site) => void;
}

/** Closer than this, the typed point is the ready-made sample point itself (coordinates rounded). */
const SAME_KM = 0.5;
const POLL_MS = 2000;
/** Our server's own error codes; anything else means the point service is not reachable. */
const SERVER_CODES = new Set(["bad_request", "busy", "rate_limited", "not_found"]);
const km = (v: number): string => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
const short = (s: Site): string => s.name.replace(/ \(sample point\)$/, "");

type Run =
  | { readonly kind: "idle" }
  | { readonly kind: "job"; readonly job: PointJob }
  | { readonly kind: "down" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * "Have your own coordinates?" Runs the real pipeline for a typed point through server/point_server.py
 * (Horizons + DSN + LOLA, a few minutes the first time). No numbers are invented while it runs: until the
 * point is computed the panel only offers the nearest ready-made sites, with their distance.
 */
export function CustomPoint({ sites, onOpen, onComputed }: Props): ReactElement {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [result, setResult] = useState<{ lat: number; lon: number; near: NearSite[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const timer = useRef<number | null>(null);
  const stop = () => { if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  const check = () => {
    const la = parseLat(lat);
    const lo = parseLon(lon);
    stop();
    setRun({ kind: "idle" });
    if (la === null || lo === null) {
      setResult(null);
      setError(`${la === null ? "Latitude: −90 to 90, e.g. −85.3 or 85.3 S." : ""}${la === null && lo === null ? " " : ""}${lo === null ? "Longitude: 0–360 east or −180 to 180, e.g. 31.2 or 137.4 W." : ""}`);
      return;
    }
    setError(null);
    setResult({ lat: la, lon: lo, near: nearestSites(sites.filter((s) => !s.custom), la, lo) });
  };

  const follow = (job: PointJob) => {
    setRun({ kind: "job", job });
    if (job.status === "done" && job.site) { onComputed(job.site); return; }
    if (job.status === "error") return;
    timer.current = window.setTimeout(async () => {
      const r = await api.points.status(job.id);
      if (r.ok) follow(r.data);
      else setRun(SERVER_CODES.has(r.error.code) ? { kind: "failed", message: r.error.message } : { kind: "down" });
    }, POLL_MS);
  };

  const compute = async () => {
    if (!result) return;
    stop();
    setRun({ kind: "job", job: { id: "", status: "queued", step: 0, steps: 7, message: "Sending the point to the server…" } });
    const r = await api.points.create(result.lat, result.lon);
    if (r.ok) follow(r.data);
    else setRun(SERVER_CODES.has(r.error.code) ? { kind: "failed", message: r.error.message } : { kind: "down" });
  };

  const best = result?.near[0];
  const same = best && best.km <= SAME_KM;
  const job = run.kind === "job" ? run.job : null;
  const busy = job != null && (job.status === "queued" || job.status === "running");

  return (
    <details className="disc custom-pt">
      <summary><span>Have your own coordinates?</span></summary>
      <form className="custom-body" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <div className="custom-fields">
          <label className="f">Latitude
            <input type="text" inputMode="decimal" className="mono" placeholder="−85.30" value={lat} onChange={(e) => setLat(e.target.value)} disabled={busy} />
          </label>
          <label className="f">Longitude (east)
            <input type="text" inputMode="decimal" className="mono" placeholder="31.20" value={lon} onChange={(e) => setLon(e.target.value)} disabled={busy} />
          </label>
          <button type="submit" className="btn" disabled={busy}>Check this point</button>
        </div>
        {error && <p className="utc-err" role="alert">{error}</p>}

        {result && best && same && (
          <div className="custom-out" role="status">
            <p className="custom-ok">This is the ready-made site <b>{best.site.name}</b> ({km(best.km)} km away), so it can be analysed at once.</p>
            <button type="button" className="btn primary" onClick={() => onOpen(best.site.id)}>Analyse {short(best.site)}</button>
          </div>
        )}

        {result && best && !same && (
          <div className="custom-out">
            <p><b>{latText(result.lat)}, {lonText(result.lon)}</b> is not one of the ready-made sites. SELENE can compute it now with the same NASA data and rules: 14 months of Sun, Earth and NASA dish positions from JPL Horizons, and the terrain skyline from NASA LOLA. The first time takes a few minutes; after that it is instant.</p>
            <p className={`custom-note ${terrainLevel(result.lat)}`}>{TERRAIN_NOTE[terrainLevel(result.lat)]}</p>

            {run.kind === "idle" && <button type="button" className="btn primary" onClick={compute}>Compute this point</button>}

            {job && (
              <div className="custom-job" role="status" aria-live="polite">
                {job.status === "done" && job.site ? (
                  <>
                    <p className="custom-ok">Ready: <b>{job.site.name}</b> is now in the site list.</p>
                    <button type="button" className="btn primary" onClick={() => job.site && onOpen(job.site.id)}>Open the analysis</button>
                  </>
                ) : job.status === "error" ? (
                  <>
                    <p className="custom-warn">{job.message}</p>
                    <button type="button" className="btn" onClick={compute}>Try again</button>
                  </>
                ) : (
                  <>
                    <div className="custom-bar" aria-hidden="true"><i style={{ width: `${Math.round((100 * Math.max(0.5, job.step)) / job.steps)}%` }} /></div>
                    <p className="mono custom-step">
                      {job.status === "queued" ? (job.ahead ? `Waiting: ${job.ahead} point${job.ahead > 1 ? "s" : ""} ahead` : job.message) : `Step ${job.step} of ${job.steps}: ${job.message}`}
                    </p>
                    <p className="src">You can keep using the app; the point appears in the site list when it is ready.</p>
                  </>
                )}
              </div>
            )}

            {run.kind === "down" && (
              <p className="custom-warn">The custom-point service is not running here, so this point cannot be computed now. The nearest ready-made sites are below. (For the team: start it with <code>python server/point_server.py</code>.)</p>
            )}
            {run.kind === "failed" && <p className="custom-warn">{run.message}</p>}

            <p className={best.km <= NEAR_KM ? "custom-ok" : "custom-warn"}>
              {best.km <= NEAR_KM
                ? `Nearest ready-made site: ${km(best.km)} km away, a fair stand-in while you wait.`
                : `Nearest ready-made site: ${km(best.km)} km away. Near the pole a few kilometres change the hills around you, so it is only a rough guide for this point.`}
            </p>
            <ul className="custom-near">
              {result.near.map((n) => (
                <li key={n.site.id}>
                  <span><b>{n.site.name}</b> <span className="mono muted">{km(n.km)} km · {latText(n.site.lat)}</span></span>
                  <button type="button" className="btn" onClick={() => onOpen(n.site.id)}>Analyse this site</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </details>
  );
}
