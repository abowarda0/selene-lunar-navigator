"""Build SELENE's data for one custom point with the same engine as the ready-made sites.

Same steps and rules as spike/build_dataset.py (whole-disc Sun rule, DSN two-way link, LOLA layered skyline),
for a latitude/longitude typed by a user. Writes, into an output folder:
  year_<id>.json     windows over the whole span + 30-min sky track (what Plan, Best dates and Compare read)
  terrain_<id>.json  shaded-relief map + skyline ridges (terrain points only), with terrain_<id>.png
  height_<id>.json   north-up height grid for the 3D view (terrain points only)

Terrain by latitude (LOLA products the pipeline already uses):
  south of 80.5 S   the polar layers of the Artemis sites (5-20 m near, 240 m out to 150 km)
  60 S to 80.5 S    LDEM_60S_60M out to 30 km (like Chandrayaan-3, without the far band)
  elsewhere         smooth Moon (no terrain), labelled as such in the app

Usage (CLI): python server/point_builder.py -85.3 31.2 [--out server/points]
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import sys
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "spike"))

# Use the operating system's certificate store when available. Python's own bundle cannot verify NASA PDS
# (pds-geosciences.wustl.edu) on some machines; the OS store can. Verification stays on either way.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

import numpy as np  # noqa: E402

import build_dataset as B  # noqa: E402
import export_heightmaps as H  # noqa: E402
from lunar.fine import disc_margin_deg, interpolate_to_minutes, local_height_grid, local_slope_deg, short_windows, windows_from_margin  # noqa: E402
from lunar.horizons import EARTH, SUN  # noqa: E402
from lunar.stations import MIN_DISH_ELEVATION_DEG, POINTING_FLOOR_DEG  # noqa: E402
from lunar.visibility import total_hours  # noqa: E402

log = logging.getLogger("point")
Progress = Callable[[int, str], None]

POLAR_LIMIT = -80.5     # LDEM_80S_20M covers the cap south of 80 S; keep a margin for the 30 km window
SOUTH_60_LIMIT = -60.0  # LDEM_60S_60M covers south of 60 S
HEIGHT_HALF_M = 75_000.0
HEIGHT_N = 401
STEPS = 7


def point_id(lat: float, lon_e: float) -> str:
    """Stable id for a point rounded to 0.001 deg (about 30 m), e.g. pt_s85300_e031200."""
    ns = "s" if lat < 0 else "n"
    return f"pt_{ns}{round(abs(lat) * 1000):05d}_e{round((lon_e % 360) * 1000):06d}"


def terrain_plan(lat: float) -> tuple[list, object, str]:
    """(near layers, far layer, wording) for a latitude."""
    if lat <= POLAR_LIMIT:
        return B.polar_layers(lat), B.FAR_240, "LOLA polar maps, 5-20 m near the point and 240 m out to 150 km"
    if lat <= SOUTH_60_LIMIT:
        return [(B.FineDem("ldem_60s_60m", 31040, 60.0, 30.0), 60.0, 30_000.0, 30.0)], None, "LOLA 60 m map out to 30 km (no farther terrain)"
    return [], None, "no fine LOLA map here: smooth Moon, terrain ignored"


def site_record(pid: str, lat: float, lon_e: float, terrain: bool, wording: str) -> dict:
    hemi = "S" if lat < 0 else "N"
    return {
        "id": pid,
        "name": f"Custom point {abs(lat):.3f}° {hemi}, {lon_e % 360:.3f}° E",
        "lat": round(lat, 5), "lon_e": round(lon_e % 360, 5),
        "kind": "candidate", "terrain": terrain, "verified": False,
        "coord_source": f"Entered by the user. Computed on demand with the same engine as the ready-made sites; terrain: {wording}.",
        "custom": True,
    }


def write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"ok": True, "error": None, "data": data}, separators=(",", ":")))
    tmp.replace(path)


def build_point(lat: float, lon_e: float, out: Path, progress: Progress | None = None) -> dict:
    """Runs the pipeline for one point and returns its site record. Downloads are cached in spike/fine/."""
    say = progress or (lambda k, msg: log.info("[%d/%d] %s", k, STEPS, msg))
    if not -90.0 <= lat <= 90.0:
        raise ValueError("Latitude must be from -90 to 90.")
    lon_e = lon_e % 360.0
    pid = point_id(lat, lon_e)
    near, far, wording = terrain_plan(lat)
    site = site_record(pid, lat, lon_e, bool(near), wording)
    B.SITES[pid] = {"lat": lat, "lon_e": lon_e, "near": near, "far": far}
    B.SITE_META[pid] = {k: v for k, v in site.items() if k != "custom"}
    out.mkdir(parents=True, exist_ok=True)
    B.CACHE.mkdir(exist_ok=True)

    say(1, "Terrain: reading NASA LOLA maps and computing the skyline in every direction" if near else "No fine terrain map here: using a smooth Moon")
    sky, wins = B.skyline(pid)

    tracks: dict = {}
    all_w: dict = {}
    for k, (name, target) in enumerate((("sun", SUN), ("earth", EARTH))):
        say(2 + k, f"JPL Horizons: {name.capitalize()} position every 10 minutes for 14 months")
        tr = interpolate_to_minutes(B.ephemeris(pid, target, name))
        tracks[name] = tr
        tr["margin"] = disc_margin_deg(tr, sky["elev"], B.SKY_STEP_DEG)
        all_w[name] = windows_from_margin(tr["t"], tr["margin"])
    tracks["t"] = tracks["sun"]["t"]

    facts: dict = {"observer_height_m": B.OBS_HEIGHT_M}
    if wins:
        say(4, "10 m mast skyline and ground slope")
        sky_mast, _ = B.skyline(pid, B.MAST_HEIGHT_M)
        all_w["sun_mast10"] = windows_from_margin(tracks["t"], disc_margin_deg(tracks["sun"], sky_mast["elev"], B.SKY_STEP_DEG))
        finest = near[0][0].scale_m
        facts.update({"mast_height_m": B.MAST_HEIGHT_M,
                      "slope_deg": round(local_slope_deg(wins[0].sample_latlon, lat, lon_e, B.SLOPE_BASELINE_M, finest), 1),
                      "slope_baseline_m": B.SLOPE_BASELINE_M, "slope_dem_m": finest})
    all_w["facts"] = facts
    earth_view = all_w["earth"]

    say(5, "JPL Horizons: NASA's three 70 m dishes, seen from the point and the point seen from them")
    links, receive = B.station_links(pid, sky, len(tracks["t"]))
    all_w["receive_only"] = windows_from_margin(tracks["t"], receive)
    all_w["earth"] = windows_from_margin(tracks["t"], np.max(np.vstack(list(links.values())), axis=0))

    say(6, "Writing the analysis files")
    source = {"ephemeris": "JPL Horizons API (DE441), 10-min steps interpolated to 1 min",
              "visibility_rule": "Sun: visible when any part of the disc is above the terrain skyline",
              "earth_link_rule": f"Earth link (two-way): a NASA DSN 70 m dish is above the lander's terrain skyline and the lander is at least {MIN_DISH_ELEVATION_DEG:.0f} deg above the dish's horizon. Receive-only uses {POINTING_FLOOR_DEG:.0f} deg",
              "terrain": "; ".join(sky["sources"]), "observer_height_m": B.OBS_HEIGHT_M}
    year = B.year_payload(pid, sky, tracks, all_w, source)["data"]
    year["site"] = site
    year["windows"]["earth_view"] = B.wj(earth_view)   # any part of Earth above the skyline (line of sight)
    write_json(out / f"year_{pid}.json", year)

    if wins:
        say(7, "Terrain map and 3D height grid")
        tmap = B.terrain_map(pid, wins, sky, out)
        if tmap:
            write_json(out / f"terrain_{pid}.json", tmap)
        sampler, products = H.combined_sampler(pid)
        g = local_height_grid(sampler, lat, lon_e, HEIGHT_HALF_M, HEIGHT_N)
        filled = np.where(np.isnan(g), np.nanmin(g), g)
        q = np.clip(np.round(filled), -32768, 32767).astype("<i2")
        write_json(out / f"height_{pid}.json", {
            "site": pid, "half_width_m": HEIGHT_HALF_M, "n": HEIGHT_N, "step_m": 2 * HEIGHT_HALF_M / (HEIGHT_N - 1),
            "h_min_m": float(q.min()), "h_max_m": float(q.max()), "missing_fraction": float(np.isnan(g).mean()),
            "dem": products, "heights_b64": base64.b64encode(q.tobytes()).decode(),
            "provenance": "NASA LRO LOLA DEMs (PDS), sampled on a north-up grid; heights relative to the point, Moon curvature included."})
    log.info("%s: Sun %.0f h, DSN link %.0f h, %d short Sun windows", pid, total_hours(all_w["sun"]), total_hours(all_w["earth"]), len(short_windows(all_w["sun"], B.FLICKER_HOURS)))
    write_json(out / f"site_{pid}.json", site)
    return site


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser()
    ap.add_argument("lat", type=float)
    ap.add_argument("lon_e", type=float)
    ap.add_argument("--out", default=str(ROOT / "server/points"))
    a = ap.parse_args()
    print(json.dumps(build_point(a.lat, a.lon_e, Path(a.out))))


if __name__ == "__main__":
    main()
