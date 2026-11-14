"""Build contract v1 mock files from the real spike output.

Usage: python3 make_mock.py   (after run_spike.py)
Writes ../contract/mock/sites.json and ../contract/mock/scenario_chandrayaan3_2026-12-01.json
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from lunar.terrain import horizon_fn_from_profile

log = logging.getLogger("make_mock")
BASE = Path(__file__).parent
SPIKE = BASE / "data" / "chandrayaan3_shiv_shakti_2026-12-01.json"
OUT = BASE.parent / "contract" / "mock"
MOCK_STEP_MIN = 60

SITES = [
    {"id": "chandrayaan3", "name": "Chandrayaan-3 (Statio Shiv Shakti)", "lat": -69.373, "lon_e": 32.319,
     "kind": "landed", "terrain": True, "coord_source": "Wikipedia: Shiv Shakti Point", "verified": True},
    {"id": "apollo11", "name": "Apollo 11 (Tranquility Base)", "lat": 0.674, "lon_e": 23.473,
     "kind": "landed", "terrain": False, "coord_source": "to be checked by C (T37)", "verified": False},
]


def ok(data) -> dict:
    return {"ok": True, "data": data, "error": None}


def parse(t: str) -> datetime:
    return datetime.strptime(t, "%Y-%m-%dT%H:%MZ")


def hours_between(a: str, b: str) -> float:
    return round((parse(b) - parse(a)).total_seconds() / 3600, 1)


def state_at_start(windows: list[dict], start: str) -> dict:
    """Visible now + hours to the next change, from the window list."""
    current = next((w for w in windows if w["start"] <= start < w["end"] or (w["open_start"] and w["start"] == start)), None)
    if current:
        return {"visible": True, "to_set": None if current["open_end"] else hours_between(start, current["end"]), "to_rise": None}
    upcoming = next((w for w in windows if w["start"] > start), None)
    return {"visible": False, "to_set": None, "to_rise": hours_between(start, upcoming["start"]) if upcoming else None}


def verdict(metrics: dict) -> dict:
    rule = "PROVISIONAL until T26: good if both-up >= 40% and longest both-window >= 72 h; marginal if any both-up time; else poor"
    if metrics["both_up_percent"] >= 40 and metrics["longest_both_window_hours"] >= 72:
        level, reasons = "good", ["Long continuous window with sunlight and Earth contact"]
    elif metrics["both_up_hours"] > 0:
        level, reasons = "marginal", ["Some sunlight with Earth contact, but limited"]
    else:
        level, reasons = "poor", ["No time with both sunlight and Earth contact in this range"]
    return {"level": level, "reasons": reasons, "rules": rule}


def build_scenario(spike: dict) -> dict:
    terrain, summary = spike["terrain"], spike["terrain"]["summary"]
    horizon = horizon_fn_from_profile(spike["horizon_profile"])
    every = MOCK_STEP_MIN // spike["range"]["step_min"]
    samples = spike["samples"][::every]
    first, start = spike["samples"][0], spike["range"]["start"]
    span_h = hours_between(start, spike["range"]["stop"])
    sun_now = state_at_start(terrain["windows"]["sun"], start)
    earth_now = state_at_start(terrain["windows"]["earth"], start)
    both = terrain["windows"]["both"]
    metrics = {
        "sun_up_hours": summary["sun_up_hours"], "sun_up_percent": summary["sun_up_percent"],
        "earth_up_hours": summary["earth_up_hours"], "earth_up_percent": summary["earth_up_percent"],
        "both_up_hours": summary["both_up_hours"],
        "both_up_percent": round(100 * summary["both_up_hours"] / span_h, 1),
        "max_sun_clearance_deg": summary["max_sun_clearance_deg"],
        "longest_both_window_hours": round(max((w["hours"] for w in both), default=0.0), 1),
    }
    site = next(s for s in SITES if s["id"] == "chandrayaan3")
    return {
        "scenario": {"site": site, "start": start, "stop": spike["range"]["stop"], "step_min": MOCK_STEP_MIN},
        "source": spike["source"],
        "now": {
            "sun_visible": sun_now["visible"], "earth_visible": earth_now["visible"],
            "sun_el_deg": round(first["sun"]["el"], 2), "earth_el_deg": round(first["earth"]["el"], 2),
            "sun_clearance_deg": round(first["sun"]["el"] + first["sun"]["radius_deg"] - horizon(first["sun"]["az"]), 2),
            "hours_to_sunset": sun_now["to_set"], "hours_to_earthset": earth_now["to_set"],
            "hours_to_sunrise": sun_now["to_rise"], "hours_to_earthrise": earth_now["to_rise"],
        },
        "metrics": metrics,
        "verdict": verdict(metrics),
        "windows": terrain["windows"],
        "horizon": {"az_step_deg": 0.5, "elev_deg": spike["horizon_profile"]["elev"]},
        "series": {
            "t": [s["t"] for s in samples],
            "sun_az": [round(s["sun"]["az"], 3) for s in samples],
            "sun_el": [round(s["sun"]["el"], 3) for s in samples],
            "earth_az": [round(s["earth"]["az"], 3) for s in samples],
            "earth_el": [round(s["earth"]["el"], 3) for s in samples],
            "terrain_under_sun": [round(horizon(s["sun"]["az"]), 3) for s in samples],
            "terrain_under_earth": [round(horizon(s["earth"]["az"]), 3) for s in samples],
        },
        "notes": [
            "Terrain from the LOLA 240 m map; ground within about 1 km of the site is smoothed.",
            "Sun visibility validated against NASA's LOLA illumination map (within 0.006 at 5 points).",
            "Verdict thresholds are provisional.",
        ],
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    OUT.mkdir(parents=True, exist_ok=True)
    spike = json.loads(SPIKE.read_text())
    (OUT / "sites.json").write_text(json.dumps(ok(SITES), indent=1))
    scenario = build_scenario(spike)
    (OUT / "scenario_chandrayaan3_2026-12-01.json").write_text(json.dumps(ok(scenario), indent=1))
    log.info("now: %s", json.dumps(scenario["now"]))
    log.info("metrics: %s", json.dumps(scenario["metrics"]))
    log.info("verdict: %s", scenario["verdict"]["level"])
    log.info("series points: %d", len(scenario["series"]["t"]))
    log.info("Wrote %s", OUT)


if __name__ == "__main__":
    main()
