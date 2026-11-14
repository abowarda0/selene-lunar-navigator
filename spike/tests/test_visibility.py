"""Tests for the visibility engine: upper limb, crossings, windows, overlap."""
from datetime import datetime, timedelta, timezone

import pytest

from lunar.visibility import (
    Window,
    find_events,
    intersect_windows,
    total_hours,
    upper_limb_el,
    visible_fraction,
    visible_windows,
)

T0 = datetime(2026, 12, 1, tzinfo=timezone.utc)


def hours(h):
    return T0 + timedelta(hours=h)


def flat(_az):
    return 0.0


def test_upper_limb_adds_half_the_angular_diameter():
    # Sun: 1945 arcsec across -> radius ~0.270 deg
    assert upper_limb_el(1.0, 1945.0) == pytest.approx(1.0 + 1945.0 / 7200.0)


def test_rise_time_is_interpolated_between_samples():
    # Arrange: upper-limb margin goes -1 -> +1 between hour 0 and hour 1
    samples = [
        {"t": hours(0), "az": 90.0, "el": -1.0, "ang_diam_arcsec": 0.0},
        {"t": hours(1), "az": 90.0, "el": 1.0, "ang_diam_arcsec": 0.0},
    ]

    # Act
    events = find_events(samples, flat)

    # Assert
    assert len(events) == 1
    assert events[0]["kind"] == "rise"
    assert events[0]["t"] == hours(0.5)


def test_terrain_horizon_delays_rise():
    # Arrange: same Sun path, but a 0.5 deg wall to the east
    samples = [
        {"t": hours(0), "az": 90.0, "el": -1.0, "ang_diam_arcsec": 0.0},
        {"t": hours(1), "az": 90.0, "el": 1.0, "ang_diam_arcsec": 0.0},
    ]

    # Act
    events = find_events(samples, lambda az: 0.5)

    # Assert: margin -1.5 -> +0.5, crosses zero at 0.75 h
    assert events[0]["t"] == hours(0.75)


def test_set_event_is_detected():
    samples = [
        {"t": hours(0), "az": 270.0, "el": 2.0, "ang_diam_arcsec": 0.0},
        {"t": hours(2), "az": 270.0, "el": -2.0, "ang_diam_arcsec": 0.0},
    ]
    events = find_events(samples, flat)
    assert [(e["kind"], e["t"]) for e in events] == [("set", hours(1))]


def test_windows_cover_visible_time_and_mark_open_ends():
    # Arrange: visible at start, sets at 1h, rises at 3h, visible at end
    samples = [
        {"t": hours(0), "az": 0, "el": 1.0, "ang_diam_arcsec": 0},
        {"t": hours(2), "az": 0, "el": -1.0, "ang_diam_arcsec": 0},
        {"t": hours(4), "az": 0, "el": 1.0, "ang_diam_arcsec": 0},
    ]

    # Act
    windows = visible_windows(samples, flat)

    # Assert
    assert windows == [
        Window(start=hours(0), end=hours(1), open_start=True, open_end=False),
        Window(start=hours(3), end=hours(4), open_start=False, open_end=True),
    ]
    assert total_hours(windows) == pytest.approx(2.0)


def test_never_visible_gives_no_windows():
    samples = [
        {"t": hours(h), "az": 0, "el": -40.0, "ang_diam_arcsec": 6988} for h in range(5)
    ]
    assert visible_windows(samples, flat) == []


def test_overlap_of_sun_and_earth_windows():
    # Arrange
    sun = [Window(hours(0), hours(10), True, False)]
    earth = [Window(hours(2), hours(4), False, False), Window(hours(8), hours(12), False, True)]

    # Act
    both = intersect_windows(sun, earth)

    # Assert
    assert [(w.start, w.end) for w in both] == [(hours(2), hours(4)), (hours(8), hours(10))]
    assert total_hours(both) == pytest.approx(4.0)


def test_visible_fraction_counts_time_steps_with_upper_limb_up():
    # Arrange: 4 steps; centre below but upper limb above in step 2
    samples = [
        {"t": hours(0), "az": 0, "el": 1.0, "ang_diam_arcsec": 1800},
        {"t": hours(1), "az": 0, "el": -0.2, "ang_diam_arcsec": 1800},  # top at +0.05
        {"t": hours(2), "az": 0, "el": -1.0, "ang_diam_arcsec": 1800},
        {"t": hours(3), "az": 0, "el": -2.0, "ang_diam_arcsec": 1800},
    ]

    # Act / Assert
    assert visible_fraction(samples, flat) == pytest.approx(0.5)
    assert visible_fraction([], flat) == 0.0


def test_inputs_are_not_mutated():
    samples = [{"t": hours(0), "az": 0, "el": 1.0, "ang_diam_arcsec": 0}]
    before = [dict(s) for s in samples]
    visible_windows(samples, flat)
    assert samples == before
