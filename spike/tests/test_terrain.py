"""Tests for terrain: polar stereographic grid, DEM sampling, horizon profile."""
import math

import numpy as np
import pytest

from lunar.terrain import (
    MOON_RADIUS_M,
    DemWindow,
    PolarGrid,
    destination,
    elevation_angle_deg,
    horizon_fn_from_profile,
    horizon_profile,
)

GRID = PolarGrid(n=7760, scale_m=240.0)  # LDEM_60S_240M
SITE_LAT, SITE_LON = -69.373, 32.319


# --- projection (PDS DSMAP_POLAR.CAT, south pole) ---------------------------

def test_pole_is_the_centre_pixel():
    i, j = GRID.latlon_to_pixel(-90.0, 0.0)
    assert (i, j) == pytest.approx((3880.5, 3880.5))


def test_longitude_zero_is_straight_up_from_the_centre():
    # "In the south, Longitude 0 extends straight up from the center"
    i, j = GRID.latlon_to_pixel(-80.0, 0.0)
    assert i == pytest.approx(3880.5)
    assert j < 3880.5


def test_longitude_90_east_is_to_the_right():
    # "...and Longitude 90 East extends to the right."
    i, j = GRID.latlon_to_pixel(-80.0, 90.0)
    assert i > 3880.5
    assert j == pytest.approx(3880.5)


@pytest.mark.parametrize("lat,lon", [(-69.373, 32.319), (-85.0, 200.0), (-61.0, 315.5), (-89.9, 10.0)])
def test_pixel_latlon_round_trip(lat, lon):
    i, j = GRID.latlon_to_pixel(lat, lon)
    lat2, lon2 = GRID.pixel_to_latlon(i, j)
    assert lat2 == pytest.approx(lat, abs=1e-9)
    assert lon2 % 360 == pytest.approx(lon % 360, abs=1e-9)


# --- spherical geometry -----------------------------------------------------

def test_destination_north_increases_latitude_by_arc_angle():
    d = 10_000.0
    lat, lon = destination(SITE_LAT, SITE_LON, az_deg=0.0, dist_m=d)
    assert lat == pytest.approx(SITE_LAT + math.degrees(d / MOON_RADIUS_M), abs=1e-9)
    assert lon == pytest.approx(SITE_LON, abs=1e-9)


def test_destination_east_increases_longitude():
    lat, lon = destination(SITE_LAT, SITE_LON, az_deg=90.0, dist_m=10_000.0)
    assert lon > SITE_LON
    assert lat == pytest.approx(SITE_LAT, abs=0.01)


def test_flat_sphere_point_dips_by_half_the_arc_angle():
    # Same height on a sphere: elevation = -theta / 2 exactly
    d = 50_000.0
    expected = -math.degrees(d / MOON_RADIUS_M) / 2
    assert elevation_angle_deg(0.0, 0.0, d) == pytest.approx(expected, rel=1e-9)


def test_nearby_wall_elevation_is_close_to_flat_trigonometry():
    # 1 km high, 10 km away: atan(0.1) = 5.71 deg, minus a little curvature
    elev = elevation_angle_deg(h_obs_m=0.0, h_target_m=1000.0, dist_m=10_000.0)
    assert elev == pytest.approx(math.degrees(math.atan(0.1)), abs=0.2)
    assert elev < math.degrees(math.atan(0.1))


# --- DEM window sampling ----------------------------------------------------

def make_window(values, first_line=101):
    return DemWindow(grid=GRID, first_line=first_line, heights_m=np.asarray(values, dtype=float))


def test_window_returns_value_at_pixel_centre():
    win = make_window(np.arange(12.0).reshape(3, 4))  # lines 101..103, samples 1..4
    assert win.sample_pixel(np.array([2.0]), np.array([102.0]))[0] == pytest.approx(5.0)


def test_window_interpolates_between_pixels():
    win = make_window(np.arange(12.0).reshape(3, 4))
    assert win.sample_pixel(np.array([2.5]), np.array([102.5]))[0] == pytest.approx(7.5)


def test_window_from_scaled_int16_bytes():
    # PGDA illumination maps: LSB int16, value = DN * 0.00004
    grid = PolarGrid(n=2, scale_m=240.0)
    data = np.array([[0, 25000], [12500, 5000]], dtype="<i2").tobytes()
    win = DemWindow.from_bytes(grid, first_line=1, data=data, dtype="<i2", scale=0.00004)
    np.testing.assert_allclose(win.heights_m, [[0.0, 1.0], [0.5, 0.2]])


def test_window_outside_coverage_is_nan():
    win = make_window(np.zeros((3, 4)))
    assert np.isnan(win.sample_pixel(np.array([2.0]), np.array([50.0]))[0])


# --- horizon profile ----------------------------------------------------------

def flat(lat, lon):
    return np.zeros_like(lat)


def test_flat_moon_horizon_is_slightly_below_zero_everywhere():
    profile = horizon_profile(flat, SITE_LAT, SITE_LON, obs_height_m=2.0,
                              az_step_deg=10.0, max_dist_m=20_000.0, step_m=200.0)
    assert len(profile["az"]) == 36
    assert all(-0.5 < e < 0.0 for e in profile["elev"])


def test_wall_to_the_east_raises_only_the_eastern_horizon():
    def east_wall(lat, lon):
        # 1 km plateau starting ~10 km east of the site
        east_km = (lon - SITE_LON) * math.cos(math.radians(SITE_LAT)) * math.radians(1) * MOON_RADIUS_M / 1000
        return np.where(east_km > 10.0, 1000.0, 0.0)

    profile = horizon_profile(east_wall, SITE_LAT, SITE_LON, obs_height_m=0.0,
                              az_step_deg=90.0, max_dist_m=20_000.0, step_m=100.0)
    elev = dict(zip(profile["az"], profile["elev"]))
    assert elev[90.0] == pytest.approx(math.degrees(math.atan(1000 / 10_000)), abs=0.4)
    assert elev[270.0] < 0.0


def test_horizon_fn_interpolates_and_wraps_around_north():
    fn = horizon_fn_from_profile({"az": [0.0, 90.0, 180.0, 270.0], "elev": [1.0, 3.0, 5.0, 3.0]})
    assert fn(45.0) == pytest.approx(2.0)
    assert fn(315.0) == pytest.approx(2.0)   # between 270 (3.0) and 360 (= 0, 1.0)
    assert fn(359.0) == pytest.approx(1.0 + 2.0 / 90.0)
