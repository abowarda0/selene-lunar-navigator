"""Data spike: Sun and Earth visibility at one real site for 30 days.

Usage: python3 run_spike.py
Needs data/<site>_horizon.json from compute_horizon.py for the terrain case.
Writes data/<site>_<start>.json, a time-series plot and a sky-view plot.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from lunar.horizons import EARTH, SUN, Site, fetch  # noqa: E402
from lunar.terrain import horizon_fn_from_profile  # noqa: E402
from lunar.visibility import (  # noqa: E402
    find_events,
    intersect_windows,
    total_hours,
    upper_limb_el,
    visible_windows,
)

log = logging.getLogger("spike")

# Statio Shiv Shakti, Chandrayaan-3 landing site.
# Source: Wikipedia "Shiv Shakti Point" (69.373 S, 32.319 E). Other sources give
# 69.3676 S, 32.3481 E (~0.03 deg difference in longitude).
SITE = Site(name="chandrayaan3_shiv_shakti", lon_e=32.319, lat=-69.373, alt_km=0.0)
START = datetime(2026, 12, 1, tzinfo=timezone.utc)
DAYS = 30
STEP_MIN = 10
OUT_DIR = Path(__file__).parent / "data"


def smooth_horizon(_az: float) -> float:
    return 0.0


def iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%MZ")


def windows_json(windows):
    return [
        {"start": iso(w.start), "end": iso(w.end), "hours": round(w.hours, 2),
         "open_start": w.open_start, "open_end": w.open_end}
        for w in windows
    ]


def scenario(sun, earth, horizon) -> dict:
    """All metrics for one horizon model."""
    sun_w, earth_w = visible_windows(sun, horizon), visible_windows(earth, horizon)
    both_w = intersect_windows(sun_w, earth_w)
    span_h = DAYS * 24.0
    first_set = {
        name: next((iso(e["t"]) for e in find_events(samples, horizon) if e["kind"] == "set"), None)
        for name, samples in (("sun", sun), ("earth", earth))
    }
    clearance = [upper_limb_el(s["el"], s["ang_diam_arcsec"]) - horizon(s["az"]) for s in sun]
    return {
        "summary": {
            "sun_up_hours": round(total_hours(sun_w), 1),
            "sun_up_percent": round(100 * total_hours(sun_w) / span_h, 1),
            "earth_up_hours": round(total_hours(earth_w), 1),
            "earth_up_percent": round(100 * total_hours(earth_w) / span_h, 1),
            "both_up_hours": round(total_hours(both_w), 1),
            "max_sun_clearance_deg": round(max(clearance), 2),
            "first_sunset": first_set["sun"],
            "first_earthset": first_set["earth"],
        },
        "windows": {"sun": windows_json(sun_w), "earth": windows_json(earth_w), "both": windows_json(both_w)},
        "_both": both_w,
    }


def validate_against_flags(sun, earth) -> dict:
    """Smooth-sphere visibility must match the Horizons '*' and 'i' flags."""
    def engine_up(s):
        return upper_limb_el(s["el"], s["ang_diam_arcsec"]) >= 0.0

    earth_by_t = {s["t"]: s for s in earth}
    earth_checked = [f for f in sun if f["earth_flag"] is not None and f["t"] in earth_by_t]
    return {
        "sun_samples_checked": len(sun),
        "sun_mismatches": sum(engine_up(s) != s["sun_flag"] for s in sun),
        "earth_samples_checked": len(earth_checked),
        "earth_mismatches": sum(engine_up(earth_by_t[f["t"]]) != f["earth_flag"] for f in earth_checked),
    }


def plot_time(path: Path, sun, earth, horizon, both) -> None:
    t = [s["t"] for s in sun]
    fig, ax = plt.subplots(figsize=(12, 4.5))
    for w in both:
        ax.axvspan(w.start, w.end, color="tab:green", alpha=0.12, lw=0)
    ax.plot(t, [s["el"] for s in sun], color="tab:orange", label="Sun elevation")
    ax.plot(t, [horizon(s["az"]) for s in sun], color="saddlebrown", lw=1, label="Terrain under the Sun")
    ax.plot(t, [s["el"] for s in earth], color="tab:blue", label="Earth elevation")
    ax.axhline(0, color="black", lw=0.8, ls="--", label="Smooth horizon")
    ax.set_title(f"{SITE.name} ({SITE.lat}, {SITE.lon_e}E): green = Sun and Earth both above the terrain")
    ax.set_ylabel("Elevation (deg)")
    ax.legend(loc="upper right", fontsize=8)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def plot_sky(path: Path, sun, earth, profile) -> None:
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.fill_between(profile["az"], -5, profile["elev"], color="saddlebrown", alpha=0.6, label="Terrain (LOLA)")
    ax.scatter([s["az"] for s in sun], [s["el"] for s in sun], s=2, color="tab:orange", label="Sun path")
    ax.scatter([s["az"] for s in earth], [s["el"] for s in earth], s=2, color="tab:blue", label="Earth path")
    ax.set_xlim(0, 360)
    ax.set_ylim(-5, 25)
    ax.set_xticks(range(0, 361, 45))
    ax.set_xticklabels(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"])
    ax.set_ylabel("Elevation (deg)")
    ax.set_title(f"Sky view at {SITE.name}, {START:%d %b} to {START + timedelta(days=DAYS):%d %b %Y}")
    ax.legend(loc="upper right", fontsize=8, markerscale=4)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    stop = START + timedelta(days=DAYS)
    sun = fetch(SUN, SITE, START, stop, STEP_MIN)
    earth = fetch(EARTH, SITE, START, stop, STEP_MIN)

    profile = json.loads((OUT_DIR / f"{SITE.name}_horizon.json").read_text())
    terrain_horizon = horizon_fn_from_profile(profile)
    smooth = scenario(sun, earth, smooth_horizon)
    terrain = scenario(sun, earth, terrain_horizon)

    out = {
        "site": {"name": SITE.name, "lon_e": SITE.lon_e, "lat": SITE.lat, "alt_km": SITE.alt_km,
                 "coord_source": "Wikipedia, Shiv Shakti Point; other sources differ by ~0.03 deg lon"},
        "range": {"start": iso(START), "stop": iso(stop), "step_min": STEP_MIN},
        "source": {"ephemeris": "JPL Horizons API 1.2 (DE441)", "terrain": profile["dem"],
                   "observer_height_m": profile["obs_height_m"]},
        "validation_vs_horizons_flags": validate_against_flags(sun, earth),
        "smooth_sphere": {k: v for k, v in smooth.items() if not k.startswith("_")},
        "terrain": {k: v for k, v in terrain.items() if not k.startswith("_")},
        "horizon_profile": {"az": profile["az"], "elev": [round(e, 3) for e in profile["elev"]]},
        "samples": [
            {"t": iso(s["t"]),
             "sun": {"az": s["az"], "el": s["el"], "radius_deg": round(s["ang_diam_arcsec"] / 7200, 4)},
             "earth": {"az": e["az"], "el": e["el"], "radius_deg": round(e["ang_diam_arcsec"] / 7200, 4)}}
            for s, e in zip(sun, earth)
        ],
    }
    stem = OUT_DIR / f"{SITE.name}_{START:%Y-%m-%d}"
    stem.with_suffix(".json").write_text(json.dumps(out, indent=1))
    plot_time(Path(f"{stem}.png"), sun, earth, terrain_horizon, terrain["_both"])
    plot_sky(Path(f"{stem}_sky.png"), sun, earth, profile)

    log.info("Validation: %s", json.dumps(out["validation_vs_horizons_flags"]))
    log.info("Smooth sphere: %s", json.dumps(smooth["summary"]))
    log.info("Terrain:       %s", json.dumps(terrain["summary"]))
    log.info("Terrain Sun windows: %s", json.dumps(terrain["windows"]["sun"]))
    log.info("Wrote %s.json, .png and _sky.png", stem)


if __name__ == "__main__":
    main()
