"""Direct-to-Earth link through NASA's Deep Space Network (DSN).

A link to a dish exists when both ends see each other:
- on the Moon, the dish's position (a point on Earth's disc) is above the lander's terrain skyline;
- on Earth, the lander is at least MIN_DISH_ELEVATION_DEG above the dish's horizon.

Horizons gives both directions directly: a surface point can be the target ("g: lon,lat,alt @body"),
tested against real replies in tests/test_stations.py.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Sequence

import numpy as np

from .horizons import HorizonsError, _fmt, _get, _parse_time, split_range

# NASA DSN Telecommunications Link Design Handbook 810-005 (copies in ref/dsn/):
# - 101 Rev. G, sec. 2: "Transmission below 10 degrees elevation by any antenna at any frequency is not allowed."
# - 302 Rev. C, Table 1: elevation motion limits 6 - 89.5 deg for 70 m, 34 m HEF and 34 m BWG antennas.
TRANSMIT_FLOOR_DEG = 10.0       # Earth -> Moon commands need this: two-way link
POINTING_FLOOR_DEG = 6.0        # lowest the dish can point: Moon -> Earth data only (receive)
MIN_DISH_ELEVATION_DEG = TRANSMIT_FLOOR_DEG
BODIES = {301: "Moon", 399: "Earth"}


@dataclass(frozen=True)
class GroundStation:
    dss: int
    complex: str
    lon_e: float
    lat: float
    alt_km: float


# 70 m antennas. Planetodetic coordinates at epoch 2026-07-17 from NAIF kernel earth_topo_260717.tf
# (naif.jpl.nasa.gov/pub/naif/pds/wgc/kernels/fk/earth_topo_260717.tf); longitude converted to east-positive.
DSN_70M: tuple[GroundStation, ...] = (
    GroundStation(14, "Goldstone", 360.0 - 116.8895431330483, 35.4258999225138, 1.001384087429),
    GroundStation(43, "Canberra", 148.9812726938012, -35.4024141881635, 0.6888431941637),
    GroundStation(63, "Madrid", 360.0 - 4.2480020535013, 40.4312138842194, 0.8648448375319),
)


def _check(lon_e: float, lat: float, alt_km: float, body: int) -> None:
    if body not in BODIES:
        raise ValueError(f"body must be one of {sorted(BODIES)}")
    for name, v in (("lon_e", lon_e), ("lat", lat), ("alt_km", alt_km)):
        if not math.isfinite(v):
            raise ValueError(f"{name} must be finite")
    if not -360.0 <= lon_e <= 360.0 or not -90.0 <= lat <= 90.0 or not -20.0 <= alt_km <= 20.0:
        raise ValueError("coordinates out of range")


def surface_point_command(lon_e: float, lat: float, alt_km: float, body: int) -> str:
    """Horizons COMMAND for a point on a body's surface used as the target."""
    _check(lon_e, lat, alt_km, body)
    return f"g: {lon_e},{lat},{alt_km} @{body}"


def build_point_params(observer_body: int, lon_e: float, lat: float, alt_km: float, target: str,
                       start: datetime, stop: datetime, step_min: int) -> dict[str, str]:
    """Observer table (azimuth, elevation) from a surface site on observer_body to a target."""
    _check(lon_e, lat, alt_km, observer_body)
    return {
        "format": "json", "COMMAND": f"'{target}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": f"'coord@{observer_body}'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_e},{lat},{alt_km}'", "START_TIME": f"'{_fmt(start)}'", "STOP_TIME": f"'{_fmt(stop)}'",
        "STEP_SIZE": f"'{step_min} m'", "QUANTITIES": "'4'", "CSV_FORMAT": "'YES'",
    }


def parse_point_table(response: dict) -> list[dict]:
    """Rows of time, solar flag, flag/event, near-side flag, lit flag, azimuth, elevation."""
    if response.get("error"):
        raise HorizonsError(str(response["error"]).strip())
    result = response.get("result", "")
    a, b = result.find("$$SOE"), result.find("$$EOE")
    if a < 0 or b < 0:
        raise HorizonsError("no data table in Horizons response")
    rows = []
    try:
        for line in result[a + 5:b].strip().splitlines():
            c = [x.strip() for x in line.split(",")]
            rows.append({"t": _parse_time(c[0]), "near": c[3] == "N", "az": float(c[5]), "el": float(c[6])})
    except (IndexError, ValueError) as exc:
        raise HorizonsError(f"could not parse Horizons table: {exc}") from exc
    return rows


def fetch_points(observer_body: int, lon_e: float, lat: float, alt_km: float, target: str,
                 start: datetime, stop: datetime, step_min: int) -> list[dict]:
    rows: list[dict] = []
    for s, e in split_range(start, stop, step_min):
        rows.extend(parse_point_table(_get(build_point_params(observer_body, lon_e, lat, alt_km, target, s, e, step_min))))
    return rows


def resample_minutes(rows: Sequence[dict]) -> dict:
    """Linear 1-minute resampling of azimuth (unwrapped) and elevation."""
    t0 = rows[0]["t"]
    src = np.array([(r["t"] - t0).total_seconds() / 60.0 for r in rows])
    minutes = np.arange(0.0, src[-1] + 1e-9, 1.0)
    az = np.interp(minutes, src, np.degrees(np.unwrap(np.radians([r["az"] for r in rows])))) % 360.0
    el = np.interp(minutes, src, [r["el"] for r in rows])
    return {"t": [t0 + timedelta(minutes=float(m)) for m in minutes], "az": az, "el": el}


def link_margin_deg(from_lander: dict, lander_el_at_station: np.ndarray, skyline_elev: Sequence[float],
                    step_deg: float, min_dish_el_deg: float | None = None) -> np.ndarray:
    """Positive when the dish is above the lunar skyline AND the lander is high enough in the dish's sky."""
    sky = np.asarray(skyline_elev, dtype=float)
    grid = np.append(np.arange(len(sky)) * step_deg, 360.0)
    h = np.interp(np.mod(from_lander["az"], 360.0), grid, np.append(sky, sky[0]))
    terrain = np.asarray(from_lander["el"]) - h
    floor = MIN_DISH_ELEVATION_DEG if min_dish_el_deg is None else min_dish_el_deg
    dish = np.asarray(lander_el_at_station) - floor
    return np.minimum(terrain, dish)
