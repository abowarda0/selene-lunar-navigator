/**
 * Custom coordinates. The full analysis needs the offline pipeline (Horizons + DSN + LOLA, about 2 min per
 * new point on a server), so the app does not invent results for a typed point. It reads the point, says
 * why, and points to the nearest ready-made sites with their distance over the lunar surface.
 */
import type { Site } from "../api/types";

/** Mean lunar radius, km (IAU). */
export const MOON_RADIUS_KM = 1737.4;
/** Beyond this, near the pole a ready-made site is not a stand-in: hills and skyline differ. */
export const NEAR_KM = 10;

const NUM = /^\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?\s*$/i;

/** "-85.3", "85.3 S", "85.3°S" → -85.3. Null when not a latitude. */
export function parseLat(text: string): number | null {
  const m = NUM.exec(text);
  if (!m) return null;
  let v = Number(m[1]);
  const h = m[2]?.toUpperCase();
  if (h === "E" || h === "W") return null;
  if (h === "S") v = -Math.abs(v);
  if (h === "N") v = Math.abs(v);
  return v >= -90 && v <= 90 ? v : null;
}

/** East-positive 0–360: "222.6", "-137.4", "137.4 W", "32.3°E" all accepted. Null when not a longitude. */
export function parseLon(text: string): number | null {
  const m = NUM.exec(text);
  if (!m) return null;
  let v = Number(m[1]);
  const h = m[2]?.toUpperCase();
  if (h === "N" || h === "S") return null;
  if (h === "W") v = -Math.abs(v);
  if (h === "E") v = Math.abs(v);
  if (v < -180 || v > 360) return null;
  return ((v % 360) + 360) % 360;
}

/** Great-circle distance over the Moon's surface, km. */
export function moonDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface NearSite {
  readonly site: Site;
  readonly km: number;
}

/** Ready-made sites by distance from a point, closest first. */
export function nearestSites(sites: readonly Site[], lat: number, lonE: number, n = 3): NearSite[] {
  return sites
    .map((site) => ({ site, km: moonDistanceKm(lat, lonE, site.lat, site.lon_e) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

/** What terrain a computed point gets, by latitude (mirrors server/point_builder.py terrain_plan). */
export type TerrainLevel = "full" | "near" | "none";
export const POLAR_LIMIT = -80.5;
export const SOUTH_60_LIMIT = -60;

export function terrainLevel(lat: number): TerrainLevel {
  return lat <= POLAR_LIMIT ? "full" : lat <= SOUTH_60_LIMIT ? "near" : "none";
}

export const TERRAIN_NOTE: Readonly<Record<TerrainLevel, string>> = {
  full: "Full terrain: NASA LOLA polar maps, 5–20 m near the point and 240 m out to 150 km, the same as the Artemis sites.",
  near: "Terrain to 30 km only (LOLA 60 m map). Mountains farther away are not included, so sunrise and sunset can be a little off.",
  none: "No fine terrain map here: the result assumes a smooth Moon. Fine away from the pole, but hills can still shift the times.",
};
