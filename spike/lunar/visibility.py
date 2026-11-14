"""Visibility engine: is the Sun or Earth above the local horizon, and when.

A body counts as visible when its upper limb is at or above the horizon in
its direction. The horizon is a function of azimuth: 0 deg for a smooth
sphere, or a terrain profile from LOLA later.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Sequence

HorizonFn = Callable[[float], float]
ARCSEC_PER_DEG = 3600.0


@dataclass(frozen=True)
class Window:
    """A continuous period of visibility. Open ends touch the edge of the data."""

    start: datetime
    end: datetime
    open_start: bool
    open_end: bool

    @property
    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0


def upper_limb_el(el_deg: float, ang_diam_arcsec: float) -> float:
    """Elevation of the top edge of the disc, from centre elevation and diameter."""
    return el_deg + ang_diam_arcsec / 2.0 / ARCSEC_PER_DEG


def _margin(sample: dict, horizon: HorizonFn) -> float:
    top = upper_limb_el(sample["el"], sample.get("ang_diam_arcsec", 0.0))
    return top - horizon(sample["az"])


def find_events(samples: Sequence[dict], horizon: HorizonFn) -> list[dict]:
    """Rise and set times, linearly interpolated between samples."""
    events: list[dict] = []
    margins = [_margin(s, horizon) for s in samples]
    for prev, cur, m0, m1 in zip(samples, samples[1:], margins, margins[1:]):
        rose = m0 < 0.0 <= m1
        set_ = m0 >= 0.0 > m1
        if not (rose or set_):
            continue
        fraction = m0 / (m0 - m1)
        t = prev["t"] + (cur["t"] - prev["t"]) * fraction
        events.append({"t": t, "kind": "rise" if rose else "set", "az": cur["az"]})
    return events


def visible_windows(samples: Sequence[dict], horizon: HorizonFn) -> list[Window]:
    """Periods when the body is visible, clipped to the sampled range."""
    if not samples:
        return []
    first, last = samples[0]["t"], samples[-1]["t"]
    windows: list[Window] = []
    is_up = _margin(samples[0], horizon) >= 0.0
    opened_at, opened_by_edge = (first, True) if is_up else (None, False)
    for event in find_events(samples, horizon):
        if event["kind"] == "rise":
            opened_at, opened_by_edge = event["t"], False
        elif opened_at is not None:
            windows.append(Window(opened_at, event["t"], opened_by_edge, False))
            opened_at = None
    if opened_at is not None:
        windows.append(Window(opened_at, last, opened_by_edge, True))
    return windows


def intersect_windows(a: Sequence[Window], b: Sequence[Window]) -> list[Window]:
    """Times covered by both lists, for example Sun up AND Earth up."""
    result: list[Window] = []
    i = j = 0
    while i < len(a) and j < len(b):
        wa, wb = a[i], b[j]
        start, end = max(wa.start, wb.start), min(wa.end, wb.end)
        if start < end:
            open_start = (start == wa.start and wa.open_start) or (start == wb.start and wb.open_start)
            open_end = (end == wa.end and wa.open_end) or (end == wb.end and wb.open_end)
            result.append(Window(start, end, open_start, open_end))
        if wa.end <= wb.end:
            i += 1
        else:
            j += 1
    return result


def visible_fraction(samples: Sequence[dict], horizon: HorizonFn) -> float:
    """Share of time steps when any part of the disc is above the horizon.

    Same definition as the LOLA/PGDA average-visibility maps.
    """
    if not samples:
        return 0.0
    return sum(_margin(s, horizon) >= 0.0 for s in samples) / len(samples)


def total_hours(windows: Sequence[Window]) -> float:
    return sum(w.hours for w in windows)
