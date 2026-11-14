"""Tests for the fine-resolution engine: windowed DEM download, layered skyline, 1-minute visibility."""
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from lunar.fine import (
    Layer,
    WindowedDem,
    clip_windows,
    fetch_window,
    interpolate_to_minutes,
    layered_horizon,
    disc_margin_deg,
    local_slope_deg,
    local_height_grid,
    margin_deg,
    parse_multipart,
    short_windows,
    windows_from_margin,
)
from lunar.terrain import PolarGrid, destination
from lunar.visibility import Window

UTC = timezone.utc


def _part(boundary: str, start: int, data: bytes, total: int = 999) -> bytes:
    end = start + len(data) - 1
    head = f"--{boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes {start}-{end}/{total}\r\n\r\n"
    return head.encode() + data + b"\r\n"


class TestMultipart:
    def test_parses_parts_in_order_with_their_offsets(self):
        body = _part("XX", 0, b"abcd") + _part("XX", 100, b"\r\n\r\nzz") + b"--XX--\r\n"
        parts = parse_multipart(body, "XX")
        assert parts == [(0, 3, b"abcd"), (100, 105, b"\r\n\r\nzz")]

    def test_rejects_a_part_whose_length_disagrees_with_its_range(self):
        bad = b"--XX\r\nContent-Range: bytes 0-9/99\r\n\r\nabc\r\n--XX--"
        with pytest.raises(ValueError):
            parse_multipart(bad, "XX")


class TestFetchWindow:
    def test_assembles_a_column_window_from_ranged_reads(self):
        n = 6
        image = np.arange(n * n, dtype="<f4").reshape(n, n)
        raw = image.tobytes()

        def getter(ranges):
            return [raw[a:b + 1] for a, b in ranges]

        heights = fetch_window("x", n, first_line=2, last_line=4, first_col=3, last_col=5, scale=1.0, batch=2, getter=getter)
        np.testing.assert_array_equal(heights, image[1:4, 2:5])

    def test_rejects_a_window_outside_the_image(self):
        with pytest.raises(ValueError):
            fetch_window("x", 6, 1, 7, 1, 2, getter=lambda r: [])


class TestWindowedDem:
    def test_samples_by_pixel_with_a_column_offset(self):
        grid = PolarGrid(n=101, scale_m=10.0)
        heights = np.array([[1.0, 2.0], [3.0, 4.0]])
        dem = WindowedDem(grid, first_line=10, first_sample=20, heights_m=heights)
        assert dem.sample_pixel(np.array([20.5]), np.array([10.5]))[0] == pytest.approx(2.5)
        assert np.isnan(dem.sample_pixel(np.array([5.0]), np.array([10.0]))[0])


class TestLayeredHorizon:
    def test_takes_the_highest_angle_across_layers(self):
        def flat(lat, lon):
            return np.zeros_like(np.asarray(lat, dtype=float))

        def wall(lat, lon):
            return np.full_like(np.asarray(lat, dtype=float), 500.0)

        layers = [Layer(flat, 10.0, 1000.0, 10.0), Layer(wall, 1000.0, 5000.0, 100.0)]
        prof = layered_horizon(layers, -89.0, 0.0, obs_height_m=2.0, az_step_deg=90.0)
        assert len(prof["elev"]) == 4
        assert all(e > 5.0 for e in prof["elev"])          # the 500 m wall 1 km away dominates
        assert all(1000.0 <= d <= 1100.0 for d in prof["dist_m"])

    def test_missing_terrain_counts_as_no_obstruction(self):
        layers = [Layer(lambda la, lo: np.full_like(np.asarray(la, dtype=float), np.nan), 10.0, 100.0, 10.0)]
        prof = layered_horizon(layers, -89.0, 0.0, 2.0, 180.0, site_height_m=0.0)
        assert prof["elev"] == [-90.0, -90.0]


def _samples(n: int, az0: float, daz: float, el0: float, del_: float):
    t0 = datetime(2027, 1, 1, tzinfo=UTC)
    return [{"t": t0 + timedelta(minutes=10 * k), "az": (az0 + daz * k) % 360, "el": el0 + del_ * k, "ang_diam_arcsec": 1800.0} for k in range(n)]


class TestMinuteTrack:
    def test_interpolates_ten_minute_samples_to_every_minute(self):
        tr = interpolate_to_minutes(_samples(3, 10.0, 1.0, 0.0, 1.0))
        assert len(tr["t"]) == 21
        assert tr["el"][5] == pytest.approx(0.5)
        assert tr["radius_deg"][0] == pytest.approx(0.25)

    def test_unwraps_azimuth_across_north(self):
        tr = interpolate_to_minutes(_samples(2, 359.5, 1.0, 0.0, 0.0))
        assert tr["az"][5] == pytest.approx(0.0, abs=1e-9)

    def test_margin_uses_the_upper_limb_and_wraps_the_skyline(self):
        tr = {"az": np.array([359.9, 0.1]), "el": np.array([0.0, 0.0]), "radius_deg": np.array([0.25, 0.25])}
        m = margin_deg(tr, [1.0, 0.0, 0.0, 1.0], step_deg=90.0)
        assert m[0] == pytest.approx(0.25 - 1.0)                 # between 270° (1°) and 360° (wraps to 0°: 1°)
        assert m[1] == pytest.approx(0.25 - (1.0 - 0.1 / 90))   # between 0° (1°) and 90° (0°)


def _notch_sky(step: float, notch_az: float, high: float = 1.0, low: float = -1.0) -> list[float]:
    """Skyline `high` everywhere except one sample at notch_az."""
    sky = [high] * int(round(360 / step))
    sky[int(round(notch_az / step)) % len(sky)] = low
    return sky


class TestDiscMargin:
    step = 0.01

    def test_equals_upper_limb_margin_over_a_flat_skyline(self):
        tr = {"az": np.array([10.0, 200.0]), "el": np.array([0.1, -0.4]), "radius_deg": np.array([0.27, 0.27])}
        sky = [0.2] * 36000
        np.testing.assert_allclose(disc_margin_deg(tr, sky, self.step), margin_deg(tr, sky, self.step), atol=1e-9)

    def test_disc_edge_in_a_notch_counts_as_visible_while_the_top_point_is_hidden(self):
        tr = {"az": np.array([100.0]), "el": np.array([0.0]), "radius_deg": np.array([0.27])}
        sky = _notch_sky(self.step, 100.2)            # notch 0.2° to the right of the centre, inside the disc
        assert margin_deg(tr, sky, self.step)[0] < 0
        assert disc_margin_deg(tr, sky, self.step)[0] > 0

    def test_notch_outside_the_disc_does_not_help(self):
        tr = {"az": np.array([100.0]), "el": np.array([0.0]), "radius_deg": np.array([0.27])}
        sky = _notch_sky(self.step, 100.5)
        assert disc_margin_deg(tr, sky, self.step)[0] < 0

    def test_disc_width_in_azimuth_grows_with_elevation(self):
        # At 60° elevation a 0.25° radius spans 0.5° of azimuth, so a notch 0.4° away is inside the disc.
        tr = {"az": np.array([100.0]), "el": np.array([60.0]), "radius_deg": np.array([0.25])}
        sky = _notch_sky(self.step, 100.4, high=61.0, low=0.0)
        assert disc_margin_deg(tr, sky, self.step)[0] > 0

    def test_wraps_across_north(self):
        tr = {"az": np.array([359.9]), "el": np.array([0.0]), "radius_deg": np.array([0.27])}
        sky = _notch_sky(self.step, 0.05)
        assert disc_margin_deg(tr, sky, self.step)[0] > 0

    def test_is_never_below_the_upper_limb_margin(self):
        rng = np.random.default_rng(1)
        tr = {"az": rng.uniform(0, 360, 200), "el": rng.uniform(-1, 1, 200), "radius_deg": np.full(200, 0.27)}
        sky = rng.uniform(-1, 1, 36000).tolist()
        assert np.all(disc_margin_deg(tr, sky, self.step) >= margin_deg(tr, sky, self.step) - 1e-9)


class TestWindows:
    t = np.arange(np.datetime64("2027-01-01T00:00"), np.datetime64("2027-01-01T00:10"), np.timedelta64(1, "m"))

    def test_crossings_are_interpolated_between_minutes(self):
        margin = np.array([-1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0])
        (w,) = windows_from_margin(self.t, margin)
        assert w.start == datetime(2027, 1, 1, 0, 1, 30, tzinfo=UTC)
        assert w.end == datetime(2027, 1, 1, 0, 5, 30, tzinfo=UTC)
        assert not w.open_start and not w.open_end

    def test_windows_touching_the_ends_are_open(self):
        margin = np.array([1.0] * 3 + [-1.0] * 4 + [1.0] * 3)
        a, b = windows_from_margin(self.t, margin)
        assert a.open_start and not a.open_end
        assert b.open_end and not b.open_start

    def test_clipping_marks_the_cut_edges_open(self):
        w = Window(datetime(2027, 1, 1, tzinfo=UTC), datetime(2027, 1, 10, tzinfo=UTC), False, False)
        (c,) = clip_windows([w], datetime(2027, 1, 5, tzinfo=UTC), datetime(2027, 2, 1, tzinfo=UTC))
        assert c.start == datetime(2027, 1, 5, tzinfo=UTC) and c.open_start and not c.open_end

    def test_clipping_drops_windows_outside_the_range(self):
        w = Window(datetime(2027, 1, 1, tzinfo=UTC), datetime(2027, 1, 2, tzinfo=UTC), False, False)
        assert clip_windows([w], datetime(2027, 3, 1, tzinfo=UTC), datetime(2027, 4, 1, tzinfo=UTC)) == []

    def test_short_windows_finds_flickers(self):
        t0 = datetime(2027, 1, 1, tzinfo=UTC)
        ws = [Window(t0, t0 + timedelta(minutes=20), False, False), Window(t0 + timedelta(hours=5), t0 + timedelta(hours=30), False, False)]
        assert short_windows(ws, max_hours=1.0) == [ws[0]]


class TestSlope:
    lat, lon = -85.0, 30.0

    def _tilted(self, slope_deg: float, toward_az: float):
        """Plane rising at slope_deg toward azimuth toward_az, through the site."""
        g = np.tan(np.radians(slope_deg))
        ux, uy = np.sin(np.radians(toward_az)), np.cos(np.radians(toward_az))

        def sampler(lat, lon):
            # local east/north offsets in metres from the site (small-area approximation)
            north = np.radians(np.asarray(lat) - self.lat) * 1737400.0
            east = np.radians(((np.asarray(lon) - self.lon + 180) % 360) - 180) * 1737400.0 * np.cos(np.radians(self.lat))
            return g * (east * ux + north * uy)
        return sampler

    @pytest.mark.parametrize("slope,az", [(0.0, 0.0), (5.0, 90.0), (12.0, 225.0)])
    def test_recovers_a_planar_slope(self, slope, az):
        s = local_slope_deg(self._tilted(slope, az), self.lat, self.lon, baseline_m=40.0, step_m=5.0)
        assert s == pytest.approx(slope, abs=0.05)

    def test_rejects_missing_terrain(self):
        with pytest.raises(ValueError):
            local_slope_deg(lambda la, lo: np.full(np.shape(la), np.nan), self.lat, self.lon, 40.0, 5.0)


class TestHeightGrid:
    lat, lon = -85.0, 30.0

    def test_north_up_grid_with_curvature_drop(self):
        # flat ground at 100 m: heights relative to the site are 0 at the centre and fall with distance (curvature)
        g = local_height_grid(lambda la, lo: np.full(np.shape(la), 100.0), self.lat, self.lon, half_m=10_000.0, n=5)
        assert g.shape == (5, 5)
        assert g[2, 2] == pytest.approx(0.0, abs=1e-6)
        corner_d = np.hypot(10_000.0, 10_000.0)
        assert g[0, 0] == pytest.approx(-corner_d ** 2 / (2 * 1737400.0), rel=1e-3)

    def test_row_zero_is_north(self):
        def ramp(lat, lon):            # higher toward the north (less negative latitude)
            return (np.asarray(lat) - self.lat) * 1e5
        g = local_height_grid(ramp, self.lat, self.lon, half_m=5_000.0, n=3)
        assert g[0, 1] > g[1, 1] > g[2, 1]

    def test_missing_terrain_becomes_nan(self):
        g = local_height_grid(lambda la, lo: np.full(np.shape(la), np.nan), self.lat, self.lon, 1000.0, 3)
        assert np.isnan(g).all()
