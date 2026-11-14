"""JPL Horizons API client for an observer on the lunar surface.

Behaviour is based on tested API responses; see HORIZONS_API_FINDINGS.md.
"""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
MAX_STEPS_PER_REQUEST = 90_000  # API error: "max. is 90000"
REQUEST_TIMEOUT_S = 120
SUN = "10"
EARTH = "399"

_TIME_FORMATS = ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S.%f")


class HorizonsError(RuntimeError):
    """Horizons returned an error or a response we cannot read."""


def _as_number(value: object, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a number, got {value!r}")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{field} must be finite")
    return number


@dataclass(frozen=True)
class Site:
    """A point on the Moon. Longitude is east-positive, as Horizons expects."""

    name: str
    lon_e: float
    lat: float
    alt_km: float = 0.0

    def __post_init__(self) -> None:
        lon = _as_number(self.lon_e, "lon_e")
        lat = _as_number(self.lat, "lat")
        alt = _as_number(self.alt_km, "alt_km")
        if not -90.0 <= lat <= 90.0:
            raise ValueError(f"lat {lat} outside -90..90")
        if not -180.0 <= lon <= 360.0:
            raise ValueError(f"lon_e {lon} outside -180..360")
        if not -20.0 <= alt <= 20.0:
            raise ValueError(f"alt_km {alt} outside -20..20")


def _fmt(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")


def build_params(
    target: str, site: Site, start: datetime, stop: datetime, step_min: int
) -> dict[str, str]:
    """Query parameters for an observer table: azimuth, elevation, angular diameter."""
    return {
        "format": "json",
        "COMMAND": f"'{target}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{site.lon_e},{site.lat},{site.alt_km}'",
        "START_TIME": f"'{_fmt(start)}'",
        "STOP_TIME": f"'{_fmt(stop)}'",
        "STEP_SIZE": f"'{step_min} m'",
        "QUANTITIES": "'4,13'",
        "CSV_FORMAT": "'YES'",
    }


def split_range(
    start: datetime, stop: datetime, step_min: int, max_steps: int = MAX_STEPS_PER_REQUEST
) -> list[tuple[datetime, datetime]]:
    """Split [start, stop] into back-to-back chunks within the API step limit."""
    step = timedelta(minutes=step_min)
    span = step * (max_steps - 1)
    chunks: list[tuple[datetime, datetime]] = []
    chunk_start = start
    while chunk_start <= stop:
        chunk_stop = min(chunk_start + span, stop)
        chunks.append((chunk_start, chunk_stop))
        chunk_start = chunk_stop + step
    return chunks


def _parse_time(text: str) -> datetime:
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise HorizonsError(f"unrecognised time format: {text!r}")


# With steps under 30 minutes, Horizons writes the target's rise/transit/set
# markers into the same column as the Earth ("interfering body") flag.
_EVENT_MARKERS = {"r": "rise", "e": "max_elevation", "t": "transit", "s": "set"}


def _earth_flag(marker: str) -> bool | None:
    """True/False from 'i'/blank; None when the column holds an event marker."""
    if marker in _EVENT_MARKERS:
        return None
    return marker == "i"


def _parse_row(line: str) -> dict:
    cols = [c.strip() for c in line.split(",")]
    sample = {
        "t": _parse_time(cols[0]),
        "sun_flag": cols[1] == "*",
        "earth_flag": _earth_flag(cols[2]),
        "event": _EVENT_MARKERS.get(cols[2]),
        "az": float(cols[3]),
        "el": float(cols[4]),
    }
    if len(cols) > 5 and cols[5]:
        sample["ang_diam_arcsec"] = float(cols[5])
    return sample


def parse_response(response: dict) -> list[dict]:
    """Turn a Horizons JSON response (CSV observer table) into sample dicts."""
    if response.get("error"):
        raise HorizonsError(response["error"].strip())
    result = response.get("result", "")
    start, end = result.find("$$SOE"), result.find("$$EOE")
    if start < 0 or end < 0:
        raise HorizonsError("no data table in Horizons response")
    lines = result[start + len("$$SOE"):end].strip().splitlines()
    try:
        return [_parse_row(line) for line in lines if line.strip()]
    except (IndexError, ValueError) as exc:
        raise HorizonsError(f"could not parse Horizons table: {exc}") from exc


def _get(params: dict[str, str]) -> dict:
    url = API_URL + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode())
    except (OSError, json.JSONDecodeError) as exc:
        raise HorizonsError(f"Horizons request failed: {exc}") from exc


def fetch(target: str, site: Site, start: datetime, stop: datetime, step_min: int) -> list[dict]:
    """Fetch samples for one target, splitting long ranges into several requests."""
    samples: list[dict] = []
    for chunk_start, chunk_stop in split_range(start, stop, step_min):
        params = build_params(target, site, chunk_start, chunk_stop, step_min)
        samples.extend(parse_response(_get(params)))
    return samples
