/** Shapes from contract/CONTRACT.md (API contract v1). */

export type SiteKind = "landed" | "candidate";
export type VerdictLevel = "good" | "marginal" | "poor";
export type Body = "sun" | "earth";

export interface Site {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon_e: number;
  readonly kind: SiteKind;
  readonly terrain: boolean;
  readonly coord_source: string;
  readonly verified: boolean;
  /** NASA Artemis III candidate region this sample point stands for. */
  readonly artemis_region?: string;
  /** A point a user typed in, computed on demand by server/point_server.py. */
  readonly custom?: boolean;
}

/** A custom-point job on the point server. */
export interface PointJob {
  readonly id: string;
  readonly status: "queued" | "running" | "done" | "error";
  readonly step: number;
  readonly steps: number;
  readonly message: string;
  /** Jobs ahead of this one while queued. */
  readonly ahead?: number;
  readonly site?: Site;
}

export interface VisWindow {
  readonly start: string;
  readonly end: string;
  readonly hours: number;
  readonly open_start: boolean;
  readonly open_end: boolean;
}

export interface Now {
  readonly sun_visible: boolean;
  readonly earth_visible: boolean;
  readonly sun_el_deg: number;
  readonly earth_el_deg: number;
  readonly sun_clearance_deg: number;
  readonly hours_to_sunset: number | null;
  readonly hours_to_earthset: number | null;
  readonly hours_to_sunrise: number | null;
  readonly hours_to_earthrise: number | null;
}

export interface Metrics {
  readonly sun_up_hours: number;
  readonly sun_up_percent: number;
  readonly earth_up_hours: number;
  readonly earth_up_percent: number;
  readonly both_up_hours: number;
  readonly both_up_percent: number;
  readonly max_sun_clearance_deg: number;
  readonly longest_both_window_hours: number;
  /** v1.1 (fine engine) */
  readonly sun_window_count?: number;
  readonly earth_window_count?: number;
  readonly shortest_sun_window_hours?: number | null;
  readonly short_window_count?: number;
}

/** A window shorter than one hour: a brief flash of sunlight or of Earth. */
export interface ShortWindow {
  readonly body: Body;
  readonly start: string;
  readonly end: string;
  readonly minutes: number;
}

export interface Series {
  readonly t: readonly string[];
  readonly sun_az: readonly number[];
  readonly sun_el: readonly number[];
  readonly earth_az: readonly number[];
  readonly earth_el: readonly number[];
  readonly terrain_under_sun: readonly number[];
  readonly terrain_under_earth: readonly number[];
}

export interface ScenarioData {
  readonly scenario: { readonly site: Site; readonly start: string; readonly stop: string; readonly step_min: number; readonly visibility_step_min?: number };
  readonly source: { readonly ephemeris: string; readonly terrain: string; readonly observer_height_m: number };
  readonly now: Now;
  readonly metrics: Metrics;
  readonly verdict: { readonly level: VerdictLevel; readonly reasons: readonly string[]; readonly rules: string };
  readonly windows: { readonly sun: readonly VisWindow[]; readonly earth: readonly VisWindow[]; readonly both: readonly VisWindow[] };
  readonly horizon: { readonly az_step_deg: number; readonly elev_deg: readonly number[] };
  readonly series: Series;
  readonly notes: readonly string[];
  readonly short_windows?: readonly ShortWindow[];
}

export interface SweepRow {
  readonly start: string;
  readonly verdict: VerdictLevel;
  readonly sun_up_percent: number;
  readonly earth_up_percent: number;
  readonly both_up_percent: number;
  readonly sun_up_hours: number;
  readonly both_up_hours: number;
  readonly longest_both_window_hours: number;
  readonly sun_window_count: number;
  readonly earth_window_count: number;
  readonly short_window_count: number;
}

/** Every start date for one site, same mission length. */
export interface Sweep {
  readonly site: string;
  readonly days: number;
  readonly rows: readonly SweepRow[];
}

export interface SkylinePoint {
  readonly az: number;
  readonly dist_m: number;
  readonly elev_deg: number;
}

/** North-up shaded relief around a site and the terrain that forms its skyline. */
export interface TerrainMap {
  readonly site: string;
  readonly image: string;
  readonly half_width_m: number;
  readonly px: number;
  readonly height_min_m: number;
  readonly height_max_m: number;
  readonly dem: readonly string[];
  readonly skyline_points: readonly SkylinePoint[];
  readonly provenance: string;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export type Envelope<T> =
  | { readonly ok: true; readonly data: T; readonly error: null }
  | { readonly ok: false; readonly data: null; readonly error: ApiError };

export interface ScenarioQuery {
  readonly site: string;
  /** YYYY-MM-DD, 00:00 UTC */
  readonly start: string;
  readonly days: number;
}

/** One site over the whole stored span: minute-accurate windows and a 30-minute sky track (proposed GET /api/year). */
export interface YearData {
  readonly site: Site;
  readonly span_start: string;
  readonly span_stop: string;
  readonly visibility_step_min: number;
  readonly source: { readonly ephemeris: string; readonly terrain: string; readonly observer_height_m: number };
  readonly windows: {
    /** Sun visible from a 2 m lander (any part of the disc). */
    readonly sun: readonly VisWindow[];
    /** v1.2: two-way link to a DSN 70 m dish (dish at least 10°). */
    readonly earth: readonly VisWindow[];
    /** v1.3: Moon-to-Earth data only (dish at least 6°). */
    readonly receive_only?: readonly VisWindow[];
    /** v1.3: Sun for panels on a 10 m mast; terrain sites only. */
    readonly sun_mast10?: readonly VisWindow[];
    /** Custom points: any part of Earth above the skyline (line of sight), minute-accurate from the pipeline. */
    readonly earth_view?: readonly VisWindow[];
  };
  readonly site_facts?: SiteFacts;
  readonly track: {
    readonly t0: string;
    readonly step_min: number;
    readonly sun_az: readonly number[];
    readonly sun_el: readonly number[];
    readonly earth_az: readonly number[];
    readonly earth_el: readonly number[];
  };
  readonly horizon: { readonly az_step_deg: number; readonly elev_deg: readonly number[] };
  readonly notes: readonly string[];
}

/** v1.3: facts about the sample point. */
export interface SiteFacts {
  readonly observer_height_m?: number;
  readonly mast_height_m?: number;
  readonly slope_deg?: number;
  readonly slope_baseline_m?: number;
  readonly slope_dem_m?: number;
}
