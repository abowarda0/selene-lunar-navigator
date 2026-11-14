"""Does a 10-minute step miss short lit/dark gaps near the pole? Compare with 1-minute.

Uses the brightest test point from data/polar_validation.json (ridge top),
30 days, our LOLA 120 m horizon at 2 m observer height.
Usage: python3 polar_stepcheck.py   (after polar_validate.py)
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from lunar.horizons import EARTH, SUN, Site, fetch
from lunar.terrain import horizon_fn_from_profile, horizon_profile
from lunar.visibility import total_hours, visible_windows
from polar_validate import load

log = logging.getLogger("polar_stepcheck")
BASE = Path(__file__).parent
MONTHS = [datetime(2026, 12, 1, tzinfo=timezone.utc), datetime(2027, 3, 1, tzinfo=timezone.utc),
          datetime(2027, 6, 1, tzinfo=timezone.utc), datetime(2027, 9, 1, tzinfo=timezone.utc)]
DAYS = 30


def summarise(samples, horizon) -> dict:
    w = visible_windows(samples, horizon)
    return {"windows": len(w), "hours": round(total_hours(w), 2),
            "shortest_h": round(min((x.hours for x in w), default=0), 2),
            "starts": [x.start.strftime("%m-%d %H:%M") for x in w]}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    rows = json.loads((BASE / "data" / "polar_validation.json").read_text())
    p = max(rows, key=lambda r: r["nasa_sun"])
    site = Site(name="ridge", lon_e=p["lon_e"], lat=p["lat"])
    profile = horizon_profile(load("dem").sample_latlon, p["lat"], p["lon_e"], obs_height_m=2.0,
                              az_step_deg=0.5, max_dist_m=150_000.0, step_m=60.0, min_dist_m=240.0)
    horizon = horizon_fn_from_profile(profile)
    result = {"point": {"lat": p["lat"], "lon_e": p["lon_e"], "nasa_sun": p["nasa_sun"]}}
    for start in MONTHS:
        stop = start + timedelta(days=DAYS)
        for body, target in (("sun", SUN), ("earth", EARTH)):
            for step in (10, 1):
                result[f"{start:%Y-%m} {body} {step:>2}min"] = summarise(fetch(target, site, start, stop, step), horizon)
    (BASE / "data" / "polar_stepcheck.json").write_text(json.dumps(result, indent=1))
    for k, v in result.items():
        log.info("%-12s %s", k, json.dumps(v)[:400])


if __name__ == "__main__":
    main()
