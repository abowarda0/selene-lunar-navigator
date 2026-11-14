"""Fine-resolution engine.

- Download only a square window of a LOLA polar DEM, with HTTP multi-range requests.
- Build a skyline from several DEM layers (finest near the site, coarser far away).
- Resample Horizons positions to 1 minute and find visibility windows to the second.
"""
from __future__ import annotations

import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Sequence

import numpy as np

from .terrain import MOON_RADIUS_M, PolarGrid, destination, elevation_angle_deg
from .visibility import ARCSEC_PER_DEG, Window

REQUEST_TIMEOUT_S = 300
DEFAULT_BATCH = 150          # byte ranges per HTTP request
DEFAULT_WORKERS = 6          # parallel requests to the archive
AZ_CHUNK = 360               # azimuths per ray batch, bounds memory use
NO_TERRAIN_DEG = -90.0
UTC = timezone.utc

Sampler = Callable[[np.ndarray, np.ndarray], np.ndarray]
Getter = Callable[[list[tuple[int, int]]], list[bytes]]

_RANGE_RE = re.compile(rb"Content-Range:\s*bytes\s+(\d+)-(\d+)/", re.IGNORECASE)


def parse_multipart(body: bytes, boundary: str) -> list[tuple[int, int, bytes]]:
    """Split a multipart/byteranges body into (start, end, data) parts, in body order."""
    marker = b"--" + boundary.encode()
    parts: list[tuple[int, int, bytes]] = []
    pos = body.find(marker)
    while pos >= 0:
        head_start = pos + len(marker)
        if body[head_start:head_start + 2] == b"--":
            break
        head_end = body.find(b"\r\n\r\n", head_start)
        if head_end < 0:
            raise ValueError("multipart part without a header terminator")
        m = _RANGE_RE.search(body[head_start:head_end])
        if not m:
            raise ValueError("multipart part without Content-Range")
        start, end = int(m.group(1)), int(m.group(2))
        data_start = head_end + 4
        data = body[data_start:data_start + end - start + 1]
        if len(data) != end - start + 1 or body[data_start + len(data):data_start + len(data) + 2] != b"\r\n":
            raise ValueError(f"part {start}-{end} has the wrong length")
        parts.append((start, end, data))
        pos = body.find(marker, data_start + len(data))
    return parts


def _http_getter(url: str) -> Getter:
    def get(ranges: list[tuple[int, int]]) -> list[bytes]:
        spec = ",".join(f"{a}-{b}" for a, b in ranges)
        req = urllib.request.Request(url, headers={"Range": f"bytes={spec}"})
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            if resp.status != 206:
                raise RuntimeError(f"server ignored the Range request (HTTP {resp.status})")
            ctype = resp.headers.get("Content-Type", "")
            body = resp.read()
        if len(ranges) == 1 and "multipart" not in ctype:
            return [body]
        m = re.search(r"boundary=([^;]+)", ctype)
        if not m:
            raise RuntimeError("multipart reply without a boundary")
        by_start = {a: data for a, _, data in parse_multipart(body, m.group(1).strip().strip('"'))}
        missing = [a for a, _ in ranges if a not in by_start]
        if missing:
            raise RuntimeError(f"server omitted {len(missing)} ranges")
        return [by_start[a] for a, _ in ranges]

    return get


def fetch_window(
    url: str, n: int, first_line: int, last_line: int, first_col: int, last_col: int,
    dtype: str = "<f4", scale: float = 1000.0, batch: int = DEFAULT_BATCH, getter: Getter | None = None,
    workers: int = DEFAULT_WORKERS,
) -> np.ndarray:
    """Heights (lines x cols, metres) of a square-image DEM window; lines and cols are 1-based."""
    if not (1 <= first_line <= last_line <= n and 1 <= first_col <= last_col <= n):
        raise ValueError(f"window {first_line}..{last_line} x {first_col}..{last_col} outside 1..{n}")
    item = np.dtype(dtype).itemsize
    ranges = [((ln - 1) * n * item + (first_col - 1) * item, (ln - 1) * n * item + last_col * item - 1)
              for ln in range(first_line, last_line + 1)]
    get = getter or _http_getter(url)
    batches = [ranges[k:k + batch] for k in range(0, len(ranges), batch)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(get, batches))   # map keeps batch order
    chunks = [part for res in results for part in res]
    cols = last_col - first_col + 1
    values = np.frombuffer(b"".join(chunks), dtype=dtype).astype(float)
    return values.reshape(last_line - first_line + 1, cols) * scale


@dataclass(frozen=True)
class WindowedDem:
    """A rectangular window of a polar DEM: lines from first_line, samples from first_sample (1-based)."""

    grid: PolarGrid
    first_line: int
    first_sample: int
    heights_m: np.ndarray

    def sample_pixel(self, i: np.ndarray, j: np.ndarray) -> np.ndarray:
        rows, cols = self.heights_m.shape
        r = np.asarray(j, dtype=float) - self.first_line
        c = np.asarray(i, dtype=float) - self.first_sample
        inside = (r >= 0) & (r <= rows - 1) & (c >= 0) & (c <= cols - 1)
        r0 = np.clip(np.floor(r).astype(int), 0, rows - 2)
        c0 = np.clip(np.floor(c).astype(int), 0, cols - 2)
        fr, fc = np.clip(r - r0, 0, 1), np.clip(c - c0, 0, 1)
        h = self.heights_m
        out = (h[r0, c0] * (1 - fc) + h[r0, c0 + 1] * fc) * (1 - fr) + (h[r0 + 1, c0] * (1 - fc) + h[r0 + 1, c0 + 1] * fc) * fr
        return np.where(inside, out, np.nan)

    def sample_latlon(self, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
        i, j = self.grid.latlon_to_pixel(lat, lon)
        return self.sample_pixel(i, j)


@dataclass(frozen=True)
class Layer:
    """One DEM used between min_dist_m and max_dist_m from the site, marched every step_m."""

    sampler: Sampler
    min_dist_m: float
    max_dist_m: float
    step_m: float


def layered_horizon(
    layers: Sequence[Layer], lat: float, lon: float, obs_height_m: float, az_step_deg: float,
    site_height_m: float | None = None,
) -> dict:
    """Highest terrain angle per azimuth over all layers. The first layer gives the site height."""
    az = np.arange(0.0, 360.0, az_step_deg)
    if site_height_m is None:
        site_height_m = float(layers[0].sampler(np.array([lat]), np.array([lon]))[0])
    h0 = site_height_m + obs_height_m
    best = np.full(az.shape, -np.inf)
    best_d = np.zeros(az.shape)
    missing: list[float] = []
    for layer in layers:
        dists = np.arange(layer.min_dist_m, layer.max_dist_m + layer.step_m / 2, layer.step_m)
        nan_count = 0
        for k in range(0, len(az), AZ_CHUNK):
            a = az[k:k + AZ_CHUNK]
            lats, lons = destination(lat, lon, a[:, None], dists[None, :])
            heights = layer.sampler(lats, lons)
            nan_count += int(np.isnan(heights).sum())
            elev = np.where(np.isnan(heights), -np.inf, elevation_angle_deg(h0, heights, dists[None, :]))
            idx = np.argmax(elev, axis=1)
            top = elev[np.arange(len(a)), idx]
            better = top > best[k:k + AZ_CHUNK]
            best[k:k + AZ_CHUNK] = np.where(better, top, best[k:k + AZ_CHUNK])
            best_d[k:k + AZ_CHUNK] = np.where(better, dists[idx], best_d[k:k + AZ_CHUNK])
        missing.append(nan_count / (len(az) * len(dists)))
    best = np.where(np.isfinite(best), best, NO_TERRAIN_DEG)
    return {"az": az.tolist(), "elev": best.tolist(), "dist_m": best_d.tolist(),
            "site_height_m": site_height_m, "obs_height_m": obs_height_m, "missing_fraction": missing}


def interpolate_to_minutes(samples: Sequence[dict]) -> dict:
    """Linear 1-minute resampling of Horizons samples (azimuth unwrapped first)."""
    t0 = samples[0]["t"]
    src = np.array([(s["t"] - t0).total_seconds() / 60.0 for s in samples])
    minutes = np.arange(0.0, src[-1] + 1e-9, 1.0)
    az = np.interp(minutes, src, np.degrees(np.unwrap(np.radians([s["az"] for s in samples])))) % 360.0
    az = np.where(np.isclose(az, 360.0), 0.0, az)
    el = np.interp(minutes, src, [s["el"] for s in samples])
    radius = np.interp(minutes, src, [s["ang_diam_arcsec"] / 2.0 / ARCSEC_PER_DEG for s in samples])
    base = np.datetime64(t0.astimezone(UTC).replace(tzinfo=None), "m")
    return {"t": base + minutes.astype("timedelta64[m]"), "az": az, "el": el, "radius_deg": radius}


def margin_deg(track: dict, skyline_elev: Sequence[float], step_deg: float) -> np.ndarray:
    """Upper limb minus skyline, per sample. Positive = visible."""
    sky = np.asarray(skyline_elev, dtype=float)
    grid = np.append(np.arange(len(sky)) * step_deg, 360.0)
    h = np.interp(np.asarray(track["az"]) % 360.0, grid, np.append(sky, sky[0]))
    return np.asarray(track["el"]) + np.asarray(track["radius_deg"]) - h


def local_slope_deg(sampler: Sampler, lat: float, lon: float, baseline_m: float, step_m: float) -> float:
    """Slope of the best-fit plane over a baseline_m x baseline_m patch centred on the site, in degrees."""
    half = baseline_m / 2.0
    offs = np.arange(-half, half + step_m / 2, step_m)
    east, north = np.meshgrid(offs, offs)
    dist = np.hypot(east, north)
    az = np.degrees(np.arctan2(east, north))
    plat, plon = destination(lat, lon, az, dist)
    h = np.asarray(sampler(np.asarray(plat), np.asarray(plon)), dtype=float)
    ok = np.isfinite(h)
    if ok.sum() < 3:
        raise ValueError("no terrain under the site")
    a = np.column_stack([east[ok], north[ok], np.ones(ok.sum())])
    (gx, gy, _), *_ = np.linalg.lstsq(a, h[ok], rcond=None)
    return float(np.degrees(np.arctan(np.hypot(gx, gy))))


def local_height_grid(sampler: Sampler, lat: float, lon: float, half_m: float, n: int) -> np.ndarray:
    """n x n heights (m) on a north-up local grid around the site: row 0 = north edge, column 0 = west edge.

    Heights are relative to the site and include the drop of the Moon's curvature (d^2 / 2R), so a 3D view
    built on a flat plane shows the same horizon the engine sees.
    """
    offs = np.linspace(-half_m, half_m, n)
    east, north = np.meshgrid(offs, offs[::-1])
    dist = np.hypot(east, north)
    az = np.degrees(np.arctan2(east, north))
    plat, plon = destination(lat, lon, az, dist)
    h = np.asarray(sampler(np.asarray(plat), np.asarray(plon)), dtype=float)
    h0 = float(np.asarray(sampler(np.array([lat]), np.array([lon])))[0])
    return h - h0 - dist ** 2 / (2.0 * MOON_RADIUS_M)


MIN_COS_EL = 0.05          # bounds the azimuth width of a disc near the zenith (el < ~87°)


def disc_margin_deg(track: dict, skyline_elev: Sequence[float], step_deg: float) -> np.ndarray:
    """Highest point of the disc's upper edge above the skyline, over the whole disc width. Positive = visible.

    A body counts as visible when any part of its disc clears the terrain (NASA's illumination-map
    definition), not only the point above its centre. The upper edge is sampled every half skyline step
    in azimuth, so a notch one skyline sample wide is never skipped.
    """
    sky = np.asarray(skyline_elev, dtype=float)
    grid = np.append(np.arange(len(sky)) * step_deg, 360.0)
    ring = np.append(sky, sky[0])
    az = np.asarray(track["az"], dtype=float)
    el = np.asarray(track["el"], dtype=float)
    r = np.asarray(track["radius_deg"], dtype=float)
    cos_el = np.maximum(np.cos(np.radians(el)), MIN_COS_EL)
    half_width_az = r / cos_el
    dx = step_deg / 2.0
    k_max = int(np.ceil(float(half_width_az.max(initial=0.0)) / dx))
    best = np.full(az.shape, -np.inf)
    for k in range(-k_max, k_max + 1):
        off_az = k * dx
        x = off_az * cos_el                              # angular offset across the disc
        inside = np.abs(x) <= r
        top = el + np.sqrt(np.clip(r * r - x * x, 0.0, None))
        h = np.interp(np.mod(az + off_az, 360.0), grid, ring)
        best = np.where(inside, np.maximum(best, top - h), best)
    return best


def _dt(t64: np.datetime64, frac_min: float = 0.0) -> datetime:
    base = t64.astype("datetime64[s]").astype(datetime).replace(tzinfo=UTC)
    return base + timedelta(seconds=round(frac_min * 60.0))


def windows_from_margin(t: np.ndarray, margin: np.ndarray) -> list[Window]:
    """Visible windows with rise and set interpolated between 1-minute samples."""
    up = margin >= 0.0
    if not up.any():
        return []
    windows: list[Window] = []
    change = np.flatnonzero(up[1:] != up[:-1])
    opened: datetime | None = _dt(t[0]) if up[0] else None
    opened_edge = bool(up[0])
    for k in change:
        frac = margin[k] / (margin[k] - margin[k + 1])
        when = _dt(t[k], float(frac))
        if up[k + 1]:
            opened, opened_edge = when, False
        elif opened is not None:
            windows.append(Window(opened, when, opened_edge, False))
            opened = None
    if opened is not None:
        windows.append(Window(opened, _dt(t[-1]), opened_edge, True))
    return windows


def clip_windows(windows: Sequence[Window], start: datetime, stop: datetime) -> list[Window]:
    """Windows inside [start, stop]; an edge that was cut, or that was already open, stays open."""
    out: list[Window] = []
    for w in windows:
        s, e = max(w.start, start), min(w.end, stop)
        if s >= e:
            continue
        out.append(Window(s, e, w.open_start or s > w.start or s == start and w.start <= start,
                          w.open_end or e < w.end or e == stop and w.end >= stop))
    return out


def short_windows(windows: Sequence[Window], max_hours: float) -> list[Window]:
    """Closed windows shorter than max_hours: brief flashes of sunlight or Earth."""
    return [w for w in windows if w.hours < max_hours and not (w.open_start or w.open_end)]
