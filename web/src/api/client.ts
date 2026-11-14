import type { ApiError, Envelope, PointJob, ScenarioData, ScenarioQuery, Site, Sweep, TerrainMap, YearData } from "./types";
import { fmtDate } from "../lib/format";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DAYS = 1;
const MAX_DAYS = 60;
/** The precomputed files hold 30-day runs. */
const MOCK_DAYS = 30;
const WEEKLY_2027 = 53;
/** Stored start dates: the Dec 2026 demo pair, then every week of 2027 (spike/build_dataset.py). */
export const MOCK_DATES: readonly string[] = [
  "2026-12-01",
  "2026-12-15",
  ...Array.from({ length: WEEKLY_2027 }, (_, k) => new Date(Date.UTC(2027, 0, 1 + 7 * k)).toISOString().slice(0, 10)),
];

export interface ClientOptions {
  /** Live backend origin, e.g. https://api.example. When set, the client calls the real API. */
  readonly apiBase?: string;
  /** Folder of contract-shaped JSON files used until the backend is deployed. */
  readonly dataBase?: string;
  readonly fetchImpl?: typeof fetch;
  /** Custom-point service (server/point_server.py); default "api/points" on the same origin. */
  readonly pointsBase?: string;
}

export interface Client {
  /** Dates with stored runs (mock files); empty when the live API computes any date. */
  readonly suggestedDates: readonly string[];
  readonly days: number;
  sites(): Promise<Envelope<readonly Site[]>>;
  scenario(q: ScenarioQuery): Promise<Envelope<ScenarioData>>;
  /** Every start date for one site (proposed GET /api/sweep). */
  sweep(site: string): Promise<Envelope<Sweep>>;
  /** Shaded relief and skyline-making terrain around a site (proposed GET /api/terrain). */
  terrain(site: string): Promise<Envelope<TerrainMap>>;
  /** Whole-span windows and sky track for one site (proposed GET /api/year). */
  year(site: string): Promise<Envelope<YearData>>;
  /** URL of a file the API names, such as a terrain image. */
  assetUrl(name: string): string;
  /** Custom points computed on demand by server/point_server.py. */
  readonly points: {
    list(): Promise<Envelope<readonly Site[]>>;
    create(lat: number, lonE: number): Promise<Envelope<PointJob>>;
    status(id: string): Promise<Envelope<PointJob>>;
  };
}

/** Files of custom points (ids like pt_s85300_e031200) live on the point server, not in the static data. */
export const CUSTOM_FILE_RE = /_pt_[ns]\d{5}_e\d{6}\./;
export const isCustomSite = (id: string): boolean => /^pt_[ns]\d{5}_e\d{6}$/.test(id);

const fail = (code: string, message: string): Envelope<never> => ({ ok: false, data: null, error: { code, message } });

function isEnvelope(v: unknown): v is Envelope<unknown> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.ok === true) return "data" in o && o.data !== null;
  if (o.ok === false) {
    const e = o.error as ApiError | null | undefined;
    return typeof e?.code === "string" && typeof e?.message === "string";
  }
  return false;
}

function validate(q: ScenarioQuery): Envelope<never> | null {
  if (!DATE_RE.test(q.start) || Number.isNaN(Date.parse(`${q.start}T00:00Z`))) return fail("bad_request", "Start date is missing or not a real date. Pick one with the date field.");
  if (!Number.isInteger(q.days) || q.days < MIN_DAYS || q.days > MAX_DAYS) return fail("bad_request", `Mission length must be a whole number from ${MIN_DAYS} to ${MAX_DAYS} days.`);
  return null;
}

export function createClient(opts: ClientOptions = {}): Client {
  const doFetch = opts.fetchImpl ?? fetch.bind(globalThis);
  const dataBase = opts.dataBase ?? "data/";
  const pointsBase = opts.pointsBase ?? "api/points";
  /** Static data file, or the point server for a custom point's files. */
  const fileUrl = (name: string): string => (CUSTOM_FILE_RE.test(name) ? `${pointsBase}/files/${name}` : `${dataBase}${name}`);
  let sitesCache: Promise<Envelope<readonly Site[]>> | null = null;

  async function getJson<T>(url: string, init?: RequestInit): Promise<Envelope<T>> {
    let res: Response;
    try {
      res = await doFetch(url, init);
    } catch {
      return fail("network", "Could not reach the server. Check the connection and try again.");
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return res.status === 404 ? fail("not_found", "That data file does not exist.") : fail("bad_response", `The server answered ${res.status} without readable data.`);
    }
    return isEnvelope(body) ? (body as Envelope<T>) : fail("bad_response", "The server answered in an unexpected format.");
  }

  const sites = (): Promise<Envelope<readonly Site[]>> => {
    if (!sitesCache) {
      sitesCache = getJson<readonly Site[]>(opts.apiBase ? `${opts.apiBase}/api/sites` : `${dataBase}sites.json`);
      sitesCache.then((r) => { if (!r.ok) sitesCache = null; });
    }
    return sitesCache;
  };

  async function scenario(q: ScenarioQuery): Promise<Envelope<ScenarioData>> {
    const invalid = validate(q);
    if (invalid) return invalid;
    if (opts.apiBase) {
      const params = new URLSearchParams({ site: q.site, start: `${q.start}T00:00Z`, days: String(q.days) });
      return getJson<ScenarioData>(`${opts.apiBase}/api/scenario?${params.toString()}`);
    }
    const list = await sites();
    if (!list.ok) return list;
    const site = list.data.find((s) => s.id === q.site);
    if (!site) return fail("unknown_site", `No site called “${q.site}”. Pick one from the list.`);
    const missing = fail("not_precomputed", `No run is stored yet for ${site.name} starting ${fmtDate(`${q.start}T00:00Z`)} for ${q.days} days. The live service computes any date; this build holds 30-day runs starting 1 and 15 Dec 2026 and every Friday of 2027.`);
    if (q.days !== MOCK_DAYS) return missing;
    const res = await getJson<ScenarioData>(`${dataBase}scenario_${q.site}_${q.start}.json`);
    return !res.ok && res.error.code === "not_found" ? missing : res;
  }

  const sweep = (site: string): Promise<Envelope<Sweep>> =>
    getJson<Sweep>(opts.apiBase ? `${opts.apiBase}/api/sweep?${new URLSearchParams({ site, days: String(MOCK_DAYS) }).toString()}` : `${dataBase}sweep_${site}.json`);
  const terrain = (site: string): Promise<Envelope<TerrainMap>> =>
    getJson<TerrainMap>(opts.apiBase && !isCustomSite(site) ? `${opts.apiBase}/api/terrain?${new URLSearchParams({ site }).toString()}` : fileUrl(`terrain_${site}.json`));
  const yearCache = new Map<string, Promise<Envelope<YearData>>>();
  const year = (site: string): Promise<Envelope<YearData>> => {
    const hit = yearCache.get(site);
    if (hit) return hit;
    const p = getJson<YearData>(opts.apiBase && !isCustomSite(site) ? `${opts.apiBase}/api/year?${new URLSearchParams({ site }).toString()}` : fileUrl(`year_${site}.json`));
    yearCache.set(site, p);
    p.then((r) => { if (!r.ok) yearCache.delete(site); });
    return p;
  };
  const assetUrl = (name: string): string => (opts.apiBase && !CUSTOM_FILE_RE.test(name) ? `${opts.apiBase}/api/files/${encodeURIComponent(name)}` : fileUrl(name));

  const points = {
    list: () => getJson<readonly Site[]>(pointsBase),
    create: (lat: number, lonE: number) => getJson<PointJob>(pointsBase, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat, lon_e: lonE }),
    }),
    status: (id: string) => getJson<PointJob>(`${pointsBase}/${encodeURIComponent(id)}`),
  };

  return { suggestedDates: opts.apiBase ? [] : MOCK_DATES, days: MOCK_DAYS, sites, scenario, sweep, terrain, year, assetUrl, points };
}

const env = import.meta.env as Record<string, string | undefined>;
/**
 * Where the hosted SELENE server lives (custom points + Luna's AI), e.g. https://user-selene.hf.space.
 * Empty in development: Vite forwards /api/* to the local servers.
 */
const SERVER = (env.VITE_SERVER_URL ?? "").replace(/\/+$/, "");
export const serverUrl = (path: string): string => (SERVER ? `${SERVER}/${path}` : path);
/**
 * Features that need the SELENE server (custom coordinates, Luna's free-text AI) are shown only when one is
 * configured (VITE_SERVER_URL / VITE_POINTS_BASE) or in development, where Vite forwards /api to local servers.
 * The static GitHub Pages build has none, so those features stay hidden there instead of failing.
 */
export const hasServer: boolean = !!SERVER || !!env.VITE_POINTS_BASE || !!import.meta.env.DEV;

export const api = createClient({ apiBase: env.VITE_API_BASE || undefined, dataBase: `${env.BASE_URL ?? "./"}data/`, pointsBase: env.VITE_POINTS_BASE || serverUrl("api/points") });
