"""Polar validation: our engine vs NASA's LOLA illumination maps near the south pole.

Points are chosen FROM NASA's 120 m maps (Sun and Earth average visibility),
within 60 km of the pole, spread over the full range and in stable patches.
For each point we compute the same quantity: share of 2-hour steps over one
18.6-year cycle when any part of the disc is above our LOLA 120 m horizon.

Usage: python3 polar_fetch.py && python3 polar_validate.py
Writes data/polar_validation.json
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from lunar.horizons import EARTH, SUN, Site, fetch
from lunar.terrain import DemWindow, PolarGrid, horizon_fn_from_profile, horizon_profile
from lunar.visibility import visible_fraction

log = logging.getLogger("polar_validate")
BASE = Path(__file__).parent
GRID = PolarGrid(n=7624, scale_m=120.0)
POINT_RADIUS_PX = 500          # 60 km from the pole
MIN_SEPARATION_PX = 40         # 4.8 km between chosen points
STABILITY_TIERS = (0.02, 0.05, 0.10, np.inf)  # 5x5 neighbourhood std of the map value
TARGET_TOLERANCE = 0.03        # accept a point within 0.03 of the target value
START = datetime(2026, 1, 1, tzinfo=timezone.utc)
CYCLE_DAYS = 6794              # 18.6 years
STEP_MIN = 120
SUN_TARGETS = [0.85, 0.65, 0.45, 0.25, 0.10, 0.0]
EARTH_TARGETS = [0.25, 0.50, 0.75]


def load(name: str) -> DemWindow:
    meta = json.loads((BASE / "polar" / f"{name}.json").read_text())
    return DemWindow(GRID, meta["first_line"], np.load(BASE / "polar" / f"{name}.npy").astype(float))


def local_std(a: np.ndarray, k: int = 2) -> np.ndarray:
    """Standard deviation over a (2k+1)^2 neighbourhood (edges NaN)."""
    out = np.full(a.shape, np.nan)
    stack = [a[k + dy:a.shape[0] - k + dy, k + dx:a.shape[1] - k + dx]
             for dy in range(-k, k + 1) for dx in range(-k, k + 1)]
    out[k:-k, k:-k] = np.std(np.stack(stack), axis=0)
    return out


def choose_points(sun: DemWindow, earth: DemWindow) -> list[dict]:
    rows, cols = sun.heights_m.shape
    jj, ii = np.meshgrid(sun.first_line + np.arange(rows), 1 + np.arange(cols), indexing="ij")
    near_pole = np.hypot(ii - GRID.centre, jj - GRID.centre) <= POINT_RADIUS_PX
    sun_std, earth_std = local_std(sun.heights_m), local_std(earth.heights_m)
    chosen: list[dict] = []

    def pick(kind: str, target: float, values: np.ndarray, std: np.ndarray) -> None:
        # Bright ridge tops are never in flat patches: relax stability only if needed.
        for limit in STABILITY_TIERS:
            ok = near_pole & (std <= limit)
            for c in chosen:
                ok &= np.hypot(ii - c["i"], jj - c["j"]) >= MIN_SEPARATION_PX
            cost = np.where(ok, np.abs(values - target), np.inf)
            r, c = np.unravel_index(np.argmin(cost), cost.shape)
            if np.isfinite(cost[r, c]) and cost[r, c] <= TARGET_TOLERANCE:
                chosen.append({"kind": kind, "target": target, "stability_limit": limit,
                               "i": int(ii[r, c]), "j": int(jj[r, c])})
                return

    for t in SUN_TARGETS:
        pick("sun", t, sun.heights_m, sun_std)
    for t in EARTH_TARGETS:
        pick("earth", t, earth.heights_m, np.fmax(earth_std, sun_std))
    return chosen


def map_range(window: DemWindow, i: int, j: int) -> list[float]:
    ii, jj = np.meshgrid(i + np.arange(-1, 2), j + np.arange(-1, 2))
    block = window.sample_pixel(ii.ravel().astype(float), jj.ravel().astype(float))
    return [round(float(block.min()), 3), round(float(block.max()), 3)]


def our_fractions(dem: DemWindow, lat: float, lon: float) -> dict:
    site = Site(name="p", lon_e=lon, lat=lat)
    stop = START + timedelta(days=CYCLE_DAYS)
    sun, earth = fetch(SUN, site, START, stop, STEP_MIN), fetch(EARTH, site, START, stop, STEP_MIN)
    out = {"smooth_sun": visible_fraction(sun, lambda _a: 0.0), "smooth_earth": visible_fraction(earth, lambda _a: 0.0)}
    for obs in (0.0, 2.0):
        profile = horizon_profile(dem.sample_latlon, lat, lon, obs_height_m=obs, az_step_deg=0.5,
                                  max_dist_m=150_000.0, step_m=60.0, min_dist_m=240.0)
        h = horizon_fn_from_profile(profile)
        out[f"sun_{obs:.0f}m"] = visible_fraction(sun, h)
        out[f"earth_{obs:.0f}m"] = visible_fraction(earth, h)
        out["missing_dem"] = profile["missing_fraction"]
        out[f"horizon_max_{obs:.0f}m"] = max(profile["elev"])
    return {k: round(v, 4) for k, v in out.items()}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    dem, sun_map, earth_map = load("dem"), load("nasa_sun"), load("nasa_earth")
    points = choose_points(sun_map, earth_map)
    rows = []
    for p in points:
        lat, lon = GRID.pixel_to_latlon(p["i"], p["j"])
        lat, lon = round(float(lat), 5), round(float(lon), 5)
        nasa_sun = float(sun_map.sample_pixel(np.array([p["i"]]), np.array([p["j"]]))[0])
        nasa_earth = float(earth_map.sample_pixel(np.array([p["i"]]), np.array([p["j"]]))[0])
        dist_km = float(np.hypot(p["i"] - GRID.centre, p["j"] - GRID.centre) * 0.12)
        log.info("point %s target %.2f at (%.4f, %.4f), %.1f km from pole ...", p["kind"], p["target"], lat, lon, dist_km)
        ours = our_fractions(dem, lat, lon)
        rows.append({**p, "lat": lat, "lon_e": lon, "km_from_pole": round(dist_km, 1),
                     "nasa_sun": round(nasa_sun, 4), "nasa_sun_3x3": map_range(sun_map, p["i"], p["j"]),
                     "nasa_earth": round(nasa_earth, 4), "nasa_earth_3x3": map_range(earth_map, p["i"], p["j"]),
                     "ours": ours})
        (BASE / "data" / "polar_validation.json").write_text(json.dumps(rows, indent=1))

    log.info("\n%-6s %-6s %7s | %-7s %-15s %-7s | %-7s %-15s %-7s", "pick", "target", "km",
             "NASA S", "ours S 0m/2m", "smooth", "NASA E", "ours E 0m/2m", "smooth")
    for r in rows:
        o = r["ours"]
        log.info("%-6s %-6.2f %7.1f | %-7.3f %.3f / %.3f   %-7.3f | %-7.3f %.3f / %.3f   %-7.3f",
                 r["kind"], r["target"], r["km_from_pole"], r["nasa_sun"], o["sun_0m"], o["sun_2m"], o["smooth_sun"],
                 r["nasa_earth"], o["earth_0m"], o["earth_2m"], o["smooth_earth"])
    d_sun = [r["ours"]["sun_0m"] - r["nasa_sun"] for r in rows]
    d_earth = [r["ours"]["earth_0m"] - r["nasa_earth"] for r in rows]
    log.info("Sun   diff (ours 0m - NASA): mean %+.3f, max |diff| %.3f", np.mean(d_sun), np.max(np.abs(d_sun)))
    log.info("Earth diff (ours 0m - NASA): mean %+.3f, max |diff| %.3f", np.mean(d_earth), np.max(np.abs(d_earth)))


if __name__ == "__main__":
    main()
