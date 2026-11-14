"""LOLA terrain: read a polar DEM and compute the horizon seen from a site.

Projection follows the PDS catalog file DSMAP_POLAR.CAT for the LOLA polar
gridded products (spherical polar stereographic, R = 1737.4 km, south pole,
longitude 0 straight up, 90 E to the right). Lines and samples are 1-based.
"""
from __future__ import annotations

import math
import urllib.request
from dataclasses import dataclass
from typing import Callable

import numpy as np

MOON_RADIUS_M = 1_737_400.0
REQUEST_TIMEOUT_S = 300

HeightSampler = Callable[[np.ndarray, np.ndarray], np.ndarray]


@dataclass(frozen=True)
class PolarGrid:
    """South polar stereographic grid of a LOLA LDEM_xxS_yyyM product."""

    n: int            # LINES = LINE_SAMPLES (square image)
    scale_m: float    # MAP_SCALE

    @property
    def centre(self) -> float:
        return self.n / 2 + 0.5

    def latlon_to_pixel(self, lat, lon):
        """(sample i, line j), 1-based, fractional."""
        lat, lon = np.radians(lat), np.radians(lon)
        rho = 2 * MOON_RADIUS_M * np.tan((np.pi / 2 - np.abs(lat)) / 2)
        x_east = rho * np.sin(lon)
        y_up = rho * np.cos(lon)
        return x_east / self.scale_m + self.centre, self.centre - y_up / self.scale_m

    def pixel_to_latlon(self, i, j):
        x = (np.asarray(i) - self.centre) * self.scale_m
        y = -(np.asarray(j) - self.centre) * self.scale_m
        rho = np.hypot(x, y)
        lat = -90.0 + np.degrees(2 * np.arctan(0.5 * rho / MOON_RADIUS_M))
        lon = np.degrees(np.arctan2(x, y)) % 360.0
        return lat, lon


@dataclass(frozen=True)
class DemWindow:
    """A horizontal band of full image lines, heights in metres above 1737.4 km."""

    grid: PolarGrid
    first_line: int
    heights_m: np.ndarray

    @classmethod
    def from_bytes(
        cls, grid: PolarGrid, first_line: int, data: bytes, dtype: str = "<f4", scale: float = 1000.0
    ) -> "DemWindow":
        """Default: LDEM PC_REAL heights in km -> metres. PGDA maps: dtype '<i2', scale 0.00004."""
        values = np.frombuffer(data, dtype=dtype).astype(float)
        heights = values.reshape(-1, grid.n) * scale
        return cls(grid=grid, first_line=first_line, heights_m=heights)

    def sample_pixel(self, i: np.ndarray, j: np.ndarray) -> np.ndarray:
        """Bilinear sample at fractional (sample, line); NaN outside the band."""
        rows, cols = self.heights_m.shape
        r = np.asarray(j, dtype=float) - self.first_line
        c = np.asarray(i, dtype=float) - 1.0
        inside = (r >= 0) & (r <= rows - 1) & (c >= 0) & (c <= cols - 1)
        r0 = np.clip(np.floor(r).astype(int), 0, rows - 2)
        c0 = np.clip(np.floor(c).astype(int), 0, cols - 2)
        fr, fc = np.clip(r - r0, 0, 1), np.clip(c - c0, 0, 1)
        h = self.heights_m
        top = h[r0, c0] * (1 - fc) + h[r0, c0 + 1] * fc
        bottom = h[r0 + 1, c0] * (1 - fc) + h[r0 + 1, c0 + 1] * fc
        out = top * (1 - fr) + bottom * fr
        return np.where(inside, out, np.nan)

    def sample_latlon(self, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
        i, j = self.grid.latlon_to_pixel(lat, lon)
        return self.sample_pixel(i, j)


def fetch_lines(
    url: str, grid: PolarGrid, first_line: int, last_line: int, dtype: str = "<f4", scale: float = 1000.0
) -> DemWindow:
    """Download only lines first_line..last_line (1-based) with an HTTP Range request."""
    if not 1 <= first_line <= last_line <= grid.n:
        raise ValueError(f"lines {first_line}..{last_line} outside 1..{grid.n}")
    row_bytes = grid.n * np.dtype(dtype).itemsize
    start = (first_line - 1) * row_bytes
    end = last_line * row_bytes - 1
    req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
        if resp.status != 206:
            raise RuntimeError(f"server ignored the Range request (HTTP {resp.status})")
        data = resp.read()
    expected = end - start + 1
    if len(data) != expected:
        raise RuntimeError(f"expected {expected} bytes, got {len(data)}")
    return DemWindow.from_bytes(grid, first_line, data, dtype=dtype, scale=scale)


def destination(lat_deg, lon_deg, az_deg, dist_m):
    """Point reached by walking dist_m from (lat, lon) along azimuth az (from north)."""
    lat1, lon1 = np.radians(lat_deg), np.radians(lon_deg)
    az, delta = np.radians(az_deg), np.asarray(dist_m) / MOON_RADIUS_M
    lat2 = np.arcsin(np.sin(lat1) * np.cos(delta) + np.cos(lat1) * np.sin(delta) * np.cos(az))
    lon2 = lon1 + np.arctan2(np.sin(az) * np.sin(delta) * np.cos(lat1),
                             np.cos(delta) - np.sin(lat1) * np.sin(lat2))
    return np.degrees(lat2), np.degrees(lon2) % 360.0


def elevation_angle_deg(h_obs_m, h_target_m, dist_m):
    """Angle above the observer's local horizontal plane to a surface point, on a sphere."""
    theta = np.asarray(dist_m) / MOON_RADIUS_M
    r_obs = MOON_RADIUS_M + np.asarray(h_obs_m)
    r_tgt = MOON_RADIUS_M + np.asarray(h_target_m)
    return np.degrees(np.arctan2(r_tgt * np.cos(theta) - r_obs, r_tgt * np.sin(theta)))


def horizon_profile(
    sampler: HeightSampler,
    lat: float,
    lon: float,
    obs_height_m: float = 2.0,
    az_step_deg: float = 0.5,
    max_dist_m: float = 150_000.0,
    step_m: float = 120.0,
    min_dist_m: float | None = None,
) -> dict:
    """Highest terrain elevation angle in each azimuth direction.

    Returns {"az", "elev", "dist_m", "missing_fraction", ...} as plain lists.
    """
    az = np.arange(0.0, 360.0, az_step_deg)
    dists = np.arange(min_dist_m or step_m, max_dist_m + step_m / 2, step_m)
    h0 = float(sampler(np.array([lat]), np.array([lon]))[0]) + obs_height_m
    lats, lons = destination(lat, lon, az[:, None], dists[None, :])
    heights = sampler(lats, lons)
    elev = elevation_angle_deg(h0, heights, dists[None, :])
    elev_filled = np.where(np.isnan(elev), -np.inf, elev)
    best = np.argmax(elev_filled, axis=1)
    return {
        "az": az.tolist(),
        "elev": elev_filled[np.arange(len(az)), best].tolist(),
        "dist_m": dists[best].tolist(),
        "site_height_m": h0 - obs_height_m,
        "obs_height_m": obs_height_m,
        "max_dist_m": max_dist_m,
        "step_m": step_m,
        "missing_fraction": float(np.isnan(heights).mean()),
    }


def horizon_fn_from_profile(profile: dict) -> Callable[[float], float]:
    """Horizon elevation at any azimuth, linear between samples, wrapping at north."""
    az = np.asarray(profile["az"], dtype=float)
    elev = np.asarray(profile["elev"], dtype=float)
    az_ext = np.append(az, az[0] + 360.0)
    elev_ext = np.append(elev, elev[0])

    def horizon(az_deg: float) -> float:
        return float(np.interp(az_deg % 360.0, az_ext, elev_ext))

    return horizon
