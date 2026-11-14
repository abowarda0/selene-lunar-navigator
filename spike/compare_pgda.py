"""Compare our long-term Sun and Earth visibility with NASA's PGDA/LOLA maps.

NASA maps (Mazarico et al. 2011, PDS LOLA EXTRAS, AVGVISIB_65S_240M_201608):
fraction of time steps when ANY part of the Sun (or Earth) disc is visible,
over a full 18.6-year cycle, from an older LOLA DEM (LDEM_65S_240M).

We compute the same fraction: Horizons Sun/Earth directions every 2 hours for
18.6 years, against our own LOLA horizon, for the site and 4 points 30 km away.

Usage: python3 compare_pgda.py   (needs the DEM band from fetch_dem.py)
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from lunar.horizons import EARTH, SUN, Site, fetch
from lunar.terrain import (
    DemWindow,
    PolarGrid,
    destination,
    fetch_lines,
    horizon_fn_from_profile,
    horizon_profile,
)
from lunar.visibility import visible_fraction

log = logging.getLogger("compare_pgda")
BASE = Path(__file__).parent
PGDA_URL = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
            "extras/illumination/img/avgvisib_65s_240m_201608{suffix}.img")
PGDA_GRID = PolarGrid(n=6420, scale_m=240.0)
DEM_GRID = PolarGrid(n=7760, scale_m=240.0)
SITE_LAT, SITE_LON = -69.373, 32.319
NEIGHBOUR_KM = 30.0
START = datetime(2026, 1, 1, tzinfo=timezone.utc)
CYCLE_DAYS = 6794            # 18.6 years, one lunar nodal cycle
STEP_MIN = 120               # 81,529 steps: under the 90,000 limit, one request
MAX_DIST_M = 120_000.0       # stays inside the cached DEM band for all 5 points


def load_dem() -> DemWindow:
    band_path = next((BASE / "dem").glob("ldem_60s_240m_band_*.npy"))
    first = json.loads(band_path.with_suffix(".json").read_text())["first_line"]
    return DemWindow(grid=DEM_GRID, first_line=first, heights_m=np.load(band_path).astype(float))


def load_pgda(points: list[tuple[str, float, float]]) -> dict[str, DemWindow]:
    rows = [PGDA_GRID.latlon_to_pixel(lat, lon)[1] for _, lat, lon in points]
    first, last = int(min(rows)) - 3, int(max(rows)) + 4
    return {
        body: fetch_lines(PGDA_URL.format(suffix=suffix), PGDA_GRID, first, last, dtype="<i2", scale=0.00004)
        for body, suffix in (("sun", ""), ("earth", "_earth"))
    }


def map_value(window: DemWindow, lat: float, lon: float) -> dict:
    """Map value at the nearest pixel, plus the range over the 3x3 neighbourhood."""
    i, j = window.grid.latlon_to_pixel(lat, lon)
    ii, jj = np.meshgrid(np.round(i) + np.arange(-1, 2), np.round(j) + np.arange(-1, 2))
    block = window.sample_pixel(ii.ravel(), jj.ravel())
    centre = float(window.sample_pixel(np.array([np.round(i)]), np.array([np.round(j)]))[0])
    return {"value": round(centre, 4), "min_3x3": round(float(block.min()), 4), "max_3x3": round(float(block.max()), 4)}


def our_fractions(dem: DemWindow, name: str, lat: float, lon: float) -> dict:
    site = Site(name=name, lon_e=lon, lat=lat)
    stop = START + timedelta(days=CYCLE_DAYS)
    sun = fetch(SUN, site, START, stop, STEP_MIN)
    earth = fetch(EARTH, site, START, stop, STEP_MIN)
    result = {"samples": len(sun),
              "smooth_sun": round(visible_fraction(sun, lambda _az: 0.0), 4),
              "smooth_earth": round(visible_fraction(earth, lambda _az: 0.0), 4)}
    for obs in (0.0, 2.0):
        profile = horizon_profile(dem.sample_latlon, lat, lon, obs_height_m=obs, az_step_deg=0.5,
                                  max_dist_m=MAX_DIST_M, step_m=120.0, min_dist_m=480.0)
        horizon = horizon_fn_from_profile(profile)
        result[f"terrain_{obs:.0f}m_sun"] = round(visible_fraction(sun, horizon), 4)
        result[f"terrain_{obs:.0f}m_earth"] = round(visible_fraction(earth, horizon), 4)
        result[f"missing_dem_{obs:.0f}m"] = round(profile["missing_fraction"], 4)
    return result


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    points = [("site", SITE_LAT, SITE_LON)]
    for label, az in (("30km_N", 0.0), ("30km_E", 90.0), ("30km_S", 180.0), ("30km_W", 270.0)):
        lat, lon = destination(SITE_LAT, SITE_LON, az, NEIGHBOUR_KM * 1000)
        points.append((label, round(float(lat), 4), round(float(lon), 4)))

    dem = load_dem()
    pgda = load_pgda(points)
    rows = []
    for label, lat, lon in points:
        log.info("Computing %s (%.4f, %.4f)...", label, lat, lon)
        ours = our_fractions(dem, label, lat, lon)
        rows.append({"point": label, "lat": lat, "lon_e": lon,
                     "nasa_sun": map_value(pgda["sun"], lat, lon),
                     "nasa_earth": map_value(pgda["earth"], lat, lon), "ours": ours})

    out = BASE / "data" / "pgda_comparison.json"
    out.write_text(json.dumps({"period": f"{START:%Y-%m-%d} + {CYCLE_DAYS} days, {STEP_MIN}-min steps",
                               "rows": rows}, indent=1))
    log.info("\n%-8s | %-22s | %-24s | %s", "point", "SUN  nasa (3x3 range)", "ours terrain 0m / 2m", "smooth")
    for r in rows:
        n, o = r["nasa_sun"], r["ours"]
        log.info("%-8s | %.3f (%.3f-%.3f)    | %.3f / %.3f            | %.3f",
                 r["point"], n["value"], n["min_3x3"], n["max_3x3"], o["terrain_0m_sun"], o["terrain_2m_sun"], o["smooth_sun"])
    log.info("\n%-8s | %-22s | %-24s | %s", "point", "EARTH nasa (3x3 range)", "ours terrain 0m / 2m", "smooth")
    for r in rows:
        n, o = r["nasa_earth"], r["ours"]
        log.info("%-8s | %.3f (%.3f-%.3f)    | %.3f / %.3f            | %.3f",
                 r["point"], n["value"], n["min_3x3"], n["max_3x3"], o["terrain_0m_earth"], o["terrain_2m_earth"], o["smooth_earth"])
    log.info("Missing DEM fractions: %s", {r["point"]: r["ours"]["missing_dem_0m"] for r in rows})
    log.info("Wrote %s", out)


if __name__ == "__main__":
    main()
