"""Tests for the Horizons client: request building, chunking and parsing.

Fixtures are real API responses saved during the API investigation.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from lunar.horizons import (
    HorizonsError,
    Site,
    build_params,
    parse_response,
    split_range,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text())


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


# --- parsing ---------------------------------------------------------------

def test_parses_csv_rows_into_samples():
    # Arrange
    response = load("q2b_sun_csv.json")

    # Act
    samples = parse_response(response)

    # Assert
    assert len(samples) == 4
    first = samples[0]
    assert first["t"] == utc(2026, 12, 1, 0, 0)
    assert first["az"] == pytest.approx(280.050784)
    assert first["el"] == pytest.approx(1.557451)
    assert first["ang_diam_arcsec"] == pytest.approx(1945.048)
    assert first["sun_flag"] is True
    assert first["earth_flag"] is False


def test_parses_times_with_seconds_from_tlist_output():
    # Arrange
    response = load("q4k_tlist.json")

    # Act
    samples = parse_response(response)

    # Assert
    assert [s["t"] for s in samples] == [
        utc(2026, 12, 1, 0, 0),
        utc(2026, 12, 15, 12, 0),
        utc(2027, 6, 1, 6, 30),
    ]
    assert samples[1]["earth_flag"] is True
    assert samples[2]["sun_flag"] is False


def test_event_markers_replace_the_earth_flag_with_unknown():
    # Arrange: with steps under 30 min, column 3 holds r/e/t/s instead of 'i'
    response = load("sun_event_markers.json")

    # Act
    samples = parse_response(response)

    # Assert
    assert [s["event"] for s in samples] == [None, "max_elevation", "transit", "set", "rise"]
    assert samples[0]["earth_flag"] is True
    assert all(s["earth_flag"] is None for s in samples[1:])


def test_api_error_raises_with_horizons_message():
    # Arrange
    response = load("q4l_bad_lat.json")

    # Act / Assert
    with pytest.raises(HorizonsError, match="latitude not in the range"):
        parse_response(response)


def test_response_without_table_raises():
    with pytest.raises(HorizonsError, match="no data table"):
        parse_response({"result": "nothing here"})


# --- request building ------------------------------------------------------

def test_build_params_places_observer_on_the_moon():
    # Arrange
    site = Site(name="test", lon_e=32.319, lat=-69.373, alt_km=0.0)

    # Act
    params = build_params("10", site, utc(2026, 12, 1), utc(2026, 12, 2), step_min=10)

    # Assert
    assert params["CENTER"] == "'coord@301'"
    assert params["SITE_COORD"] == "'32.319,-69.373,0.0'"
    assert params["COMMAND"] == "'10'"
    assert params["QUANTITIES"] == "'4,13'"
    assert params["CSV_FORMAT"] == "'YES'"
    assert params["STEP_SIZE"] == "'10 m'"
    assert params["START_TIME"] == "'2026-12-01 00:00'"


@pytest.mark.parametrize("lat,lon", [(-91, 0), (91, 0), (0, -181), (0, 361)])
def test_site_rejects_out_of_range_coordinates(lat, lon):
    with pytest.raises(ValueError):
        Site(name="bad", lon_e=lon, lat=lat)


def test_site_rejects_non_numeric_coordinates():
    with pytest.raises(ValueError):
        Site(name="bad", lon_e="0'; DROP", lat=0)


# --- chunking --------------------------------------------------------------

def test_short_range_is_one_chunk():
    chunks = split_range(utc(2026, 12, 1), utc(2026, 12, 31), step_min=10)
    assert chunks == [(utc(2026, 12, 1), utc(2026, 12, 31))]


def test_long_range_is_split_under_the_90000_step_limit():
    # Arrange: 120 days at 1-minute steps = 172,800 steps
    start, stop = utc(2026, 12, 1), utc(2026, 12, 1) + timedelta(days=120)

    # Act
    chunks = split_range(start, stop, step_min=1)

    # Assert
    assert chunks[0][0] == start
    assert chunks[-1][1] == stop
    for a, b in chunks:
        assert (b - a) / timedelta(minutes=1) + 1 <= 90_000
    for (_, b), (a2, _) in zip(chunks, chunks[1:]):
        assert a2 == b + timedelta(minutes=1)  # no overlap, no gap
