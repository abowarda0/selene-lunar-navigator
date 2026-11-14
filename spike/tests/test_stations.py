"""Direct-to-Earth link through NASA's Deep Space Network: tests on real Horizons replies."""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest

from lunar.horizons import HorizonsError, Site
from lunar.stations import (
    DSN_70M,
    MIN_DISH_ELEVATION_DEG,
    POINTING_FLOOR_DEG,
    TRANSMIT_FLOOR_DEG,
    build_point_params,
    link_margin_deg,
    parse_point_table,
    resample_minutes,
    surface_point_command,
)

FIX = Path(__file__).parent / "fixtures"
UTC = timezone.utc
RIDGE = Site(name="ridge", lon_e=222.65072, lat=-89.45388)


def _fixture(name: str) -> dict:
    return json.loads((FIX / name).read_text())


class TestStations:
    def test_three_70m_dishes_one_per_complex(self):
        assert [s.dss for s in DSN_70M] == [14, 43, 63]
        assert {s.complex for s in DSN_70M} == {"Goldstone", "Canberra", "Madrid"}

    def test_coordinates_from_naif_kernel(self):
        gold = DSN_70M[0]
        assert gold.lon_e == pytest.approx(243.1104569, abs=1e-6)   # -116.8895431 east-positive
        assert gold.lat == pytest.approx(35.4258999, abs=1e-6)


class TestCommand:
    def test_surface_point_on_earth(self):
        assert surface_point_command(243.11, 35.43, 1.0, 399) == "g: 243.11,35.43,1.0 @399"

    @pytest.mark.parametrize("lon,lat", [(400.0, 0.0), (10.0, 91.0), (float("nan"), 0.0)])
    def test_rejects_bad_coordinates(self, lon, lat):
        with pytest.raises(ValueError):
            surface_point_command(lon, lat, 0.0, 399)

    def test_rejects_unknown_body(self):
        with pytest.raises(ValueError):
            surface_point_command(10.0, 10.0, 0.0, 499)


class TestParams:
    def test_lander_looking_at_a_station(self):
        p = build_point_params(301, RIDGE.lon_e, RIDGE.lat, 0.0, "g: 1,2,3 @399",
                               datetime(2027, 1, 1, tzinfo=UTC), datetime(2027, 1, 2, tzinfo=UTC), 10)
        assert p["CENTER"] == "'coord@301'" and p["COMMAND"] == "'g: 1,2,3 @399'"
        assert p["QUANTITIES"] == "'4'" and p["STEP_SIZE"] == "'10 m'"
        assert p["SITE_COORD"] == f"'{RIDGE.lon_e},{RIDGE.lat},0.0'"

    def test_station_looking_at_the_lander(self):
        p = build_point_params(399, 243.11, 35.43, 1.0, "g: 5,6,0 @301",
                               datetime(2027, 1, 1, tzinfo=UTC), datetime(2027, 1, 2, tzinfo=UTC), 10)
        assert p["CENTER"] == "'coord@399'"


class TestParse:
    def test_station_seen_from_lander_has_near_side_flag(self):
        rows = parse_point_table(_fixture("station_from_lander_10min.json"))
        assert len(rows) == 145
        first = rows[0]
        assert first["t"] == datetime(2026, 12, 1, tzinfo=UTC)
        assert first["az"] == pytest.approx(143.929429) and first["el"] == pytest.approx(-2.771429)
        assert first["near"] is False                     # Goldstone faces away from the Moon at 00:00 UTC
        assert any(r["near"] for r in rows)

    def test_event_letters_in_column_three_do_not_shift_columns(self):
        rows = parse_point_table(_fixture("lander_from_station_10min.json"))
        rise = next(r for r in rows if r["t"] == datetime(2026, 12, 1, 7, 30, tzinfo=UTC))
        assert rise["el"] == pytest.approx(-1.296595)

    def test_near_side_flag_agrees_with_the_moon_being_up_at_the_station(self):
        a = parse_point_table(_fixture("station_from_lander_10min.json"))
        b = parse_point_table(_fixture("lander_from_station_10min.json"))
        agree = sum((x["near"]) == (y["el"] > 0) for x, y in zip(a, b))
        assert agree >= len(a) - 2                        # may differ only at the moment of rise/set

    def test_error_reply_raises(self):
        with pytest.raises(HorizonsError):
            parse_point_table({"error": "bad site"})


class TestLink:
    t0 = datetime(2027, 1, 1, tzinfo=UTC)

    def _rows(self, values):
        return [{"t": self.t0.replace(minute=10 * i), "az": az, "el": el, "near": True} for i, (az, el) in enumerate(values)]

    def test_resample_to_minutes(self):
        tr = resample_minutes(self._rows([(10.0, 0.0), (11.0, 1.0)]))
        assert len(tr["t"]) == 11
        assert tr["el"][5] == pytest.approx(0.5) and tr["az"][5] == pytest.approx(10.5)

    def test_link_needs_both_clear_sky_on_the_moon_and_the_dish_pointing_high_enough(self):
        sky = [1.0] * 7200                                # 1° skyline everywhere, 0.05° step
        from_lander = {"az": np.array([90.0, 90.0, 90.0]), "el": np.array([2.0, 0.5, 2.0])}
        at_station = np.array([30.0, 30.0, MIN_DISH_ELEVATION_DEG - 1.0])
        m = link_margin_deg(from_lander, at_station, sky, 0.05)
        assert m[0] > 0          # clear on both ends
        assert m[1] < 0          # blocked by lunar terrain
        assert m[2] < 0          # Moon too low for the dish

    def test_receive_only_floor_is_lower_than_two_way(self):
        sky = [0.0] * 7200
        from_lander = {"az": np.array([90.0]), "el": np.array([2.0])}
        at_station = np.array([8.0])                      # between the 6 deg pointing and 10 deg transmit limits
        assert link_margin_deg(from_lander, at_station, sky, 0.05, TRANSMIT_FLOOR_DEG)[0] < 0
        assert link_margin_deg(from_lander, at_station, sky, 0.05, POINTING_FLOOR_DEG)[0] > 0

    def test_floors_match_the_dsn_handbook(self):
        assert (POINTING_FLOOR_DEG, TRANSMIT_FLOOR_DEG, MIN_DISH_ELEVATION_DEG) == (6.0, 10.0, 10.0)
