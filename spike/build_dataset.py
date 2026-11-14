"""Build the app's data with the fine engine: fine terrain, 1-minute visibility, weekly start dates for 2027.

Usage: python3 build_dataset.py [--out ../web/public/data] [--sites chandrayaan3,ridge,polar_mid,apollo11]
Downloads are cached in fine/ (DEM windows, Horizons tables), so a rerun only recomputes.
"""
from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from lunar.fine import Layer, WindowedDem, clip_windows, fetch_window, interpolate_to_minutes, layered_horizon, local_slope_deg, disc_margin_deg, short_windows, windows_from_margin
from lunar.horizons import EARTH, SUN, Site, fetch
from lunar.terrain import DemWindow, PolarGrid, destination
from lunar.visibility import Window, intersect_windows, total_hours
import make_mock
from lunar.stations import DSN_70M, MIN_DISH_ELEVATION_DEG, POINTING_FLOOR_DEG, fetch_points, link_margin_deg, resample_minutes, surface_point_command

log = logging.getLogger("build")
BASE = Path(__file__).parent
CACHE = BASE / "fine"
UTC = timezone.utc
PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/"

SPAN_START = datetime(2026, 12, 1, tzinfo=UTC)
SPAN_STOP = datetime(2028, 2, 1, tzinfo=UTC)
EPHEM_STEP_MIN = 10
RUN_DAYS = 30
SERIES_EVERY_MIN = 30
SKY_STEP_DEG = 0.05
SCENARIO_SKY_STEP_DEG = 0.1
OBS_HEIGHT_M = 2.0
MAST_HEIGHT_M = 10.0      # solar panels on a mast see over nearby hills
SLOPE_BASELINE_M = 40.0   # lander-footprint scale for the landing-slope check
FLICKER_HOURS = 1.0
MAP_PX = 900


@dataclass(frozen=True)
class FineDem:
    product: str
    n: int
    scale_m: float
    half_km: float


SITES = {
    "chandrayaan3": {"lat": -69.373, "lon_e": 32.319, "near": [(FineDem("ldem_60s_60m", 31040, 60.0, 30.0), 60.0, 30_000.0, 30.0)], "far": "band240"},
    "ridge": {"lat": -89.45388, "lon_e": 222.65072, "near": [(FineDem("ldem_875s_5m", 30336, 5.0, 6.0), 5.0, 6_000.0, 5.0), (FineDem("ldem_875s_20m", 7584, 20.0, 30.0), 6_000.0, 30_000.0, 20.0)], "far": "polar120"},
    "polar_mid": {"lat": -88.79926, "lon_e": 136.33532, "near": [(FineDem("ldem_875s_5m", 30336, 5.0, 6.0), 5.0, 6_000.0, 5.0), (FineDem("ldem_875s_20m", 7584, 20.0, 30.0), 6_000.0, 30_000.0, 20.0)], "far": "polar120"},
    "apollo11": {"lat": 0.674, "lon_e": 23.473, "near": [], "far": None},
}

# Named NASA Artemis III regions: one sample point each, picked by pick_sites.py.
FAR_240 = FineDem("ldem_75s_240m", 3812, 240.0, 152.0)


def polar_layers(lat: float) -> list:
    """Finest LOLA polar DEMs that cover a site: (dem, from_m, to_m, step_m)."""
    if lat <= -87.6:
        return [(FineDem("ldem_875s_5m", 30336, 5.0, 6.0), 5.0, 6_000.0, 5.0), (FineDem("ldem_875s_20m", 7584, 20.0, 30.0), 6_000.0, 30_000.0, 20.0)]
    if lat <= -85.25:
        return [(FineDem("ldem_85s_10m", 30336, 10.0, 6.0), 10.0, 6_000.0, 10.0), (FineDem("ldem_80s_20m", 30400, 20.0, 30.0), 6_000.0, 30_000.0, 20.0)]
    return [(FineDem("ldem_80s_20m", 30400, 20.0, 30.0), 20.0, 30_000.0, 20.0)]


_NAMED = BASE / "data/named_sites.json"
if _NAMED.exists():
    for _s in json.loads(_NAMED.read_text())["sites"]:
        SITES[_s["id"]] = {"lat": _s["lat"], "lon_e": _s["lon_e"], "near": polar_layers(_s["lat"]), "far": FAR_240}
SITE_META = {s["id"]: s for s in json.loads((BASE.parent / "web/public/data/sites.json").read_text())["data"]}


def start_dates() -> list[datetime]:
    weekly = [datetime(2027, 1, 1, tzinfo=UTC) + timedelta(days=7 * k) for k in range(53)]
    return [SPAN_START, datetime(2026, 12, 15, tzinfo=UTC)] + [d for d in weekly if d.year == 2027]


def iso(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%MZ")


# ── terrain ──────────────────────────────────────────────────────────────

def fine_window(dem: FineDem, lat: float, lon: float, tag: str) -> WindowedDem:
    grid = PolarGrid(n=dem.n, scale_m=dem.scale_m)
    i, j = grid.latlon_to_pixel(lat, lon)
    half = int(dem.half_km * 1000 / dem.scale_m)
    l0, l1 = max(1, int(j) - half), min(dem.n, int(j) + half)
    c0, c1 = max(1, int(i) - half), min(dem.n, int(i) + half)
    path = CACHE / f"{dem.product}_{tag}_{l0}_{c0}_{l1}_{c1}.npy"
    if path.exists():
        heights = np.load(path)
    else:
        log.info("downloading %s lines %d-%d cols %d-%d (%.0f MB)", dem.product, l0, l1, c0, c1, (l1 - l0 + 1) * (c1 - c0 + 1) * 4 / 1e6)
        heights = fetch_window(PDS + f"{dem.product}_float.img", dem.n, l0, l1, c0, c1)
        np.save(path, heights.astype(np.float32))
    return WindowedDem(grid, l0, c0, heights.astype(float))


def far_sampler(kind: str):
    if kind == "band240":
        meta = json.loads((BASE / "dem/ldem_60s_240m_band_974_2334.json").read_text())
        return DemWindow(PolarGrid(n=7760, scale_m=240.0), meta["first_line"], np.load(BASE / "dem/ldem_60s_240m_band_974_2334.npy")).sample_latlon, 240.0
    meta = json.loads((BASE / "polar/dem.json").read_text())
    return DemWindow(PolarGrid(n=7624, scale_m=120.0), meta["first_line"], np.load(BASE / "polar/dem.npy").astype(float)).sample_latlon, 120.0


def skyline(site_id: str, obs_height_m: float = OBS_HEIGHT_M) -> tuple[dict, list[WindowedDem]]:
    cfg = SITES[site_id]
    if not cfg["near"]:
        n = int(360 / SKY_STEP_DEG)
        return {"az": [k * SKY_STEP_DEG for k in range(n)], "elev": [0.0] * n, "dist_m": [0.0] * n, "sources": ["smooth Moon"]}, []
    wins = [fine_window(d, cfg["lat"], cfg["lon_e"], site_id) for d, *_ in cfg["near"]]
    layers = [Layer(w.sample_latlon, lo, hi, st) for w, (_, lo, hi, st) in zip(wins, cfg["near"])]
    if cfg["far"] is None:
        # No far layer (custom points between 60 and 80.5 deg S): the skyline stops where the near maps end.
        log.info("%s: skyline at %.2f° from %d layers (no far layer)", site_id, SKY_STEP_DEG, len(layers))
        prof = layered_horizon(layers, cfg["lat"], cfg["lon_e"], obs_height_m, SKY_STEP_DEG)
        prof["sources"] = [f"LOLA {d.product.upper()} to {hi / 1000:.0f} km" for d, _, hi, _ in cfg["near"]]
        return prof, wins
    if isinstance(cfg["far"], FineDem):
        far_win = fine_window(cfg["far"], cfg["lat"], cfg["lon_e"], site_id)
        far, far_scale, far_name = far_win.sample_latlon, cfg["far"].scale_m, cfg["far"].product.upper()
    else:
        far, far_scale = far_sampler(cfg["far"])
        far_name = "LDEM_60S_240M" if far_scale == 240 else "LDEM_75S_120M"
    layers.append(Layer(far, cfg["near"][-1][2], 150_000.0, far_scale / 2))
    log.info("%s: skyline at %.2f° from %d layers", site_id, SKY_STEP_DEG, len(layers))
    prof = layered_horizon(layers, cfg["lat"], cfg["lon_e"], obs_height_m, SKY_STEP_DEG)
    prof["sources"] = [f"LOLA {d.product.upper()} to {hi / 1000:.0f} km" for d, _, hi, _ in cfg["near"]] + [f"LOLA {far_name} to 150 km"]
    return prof, wins


# ── ephemeris ────────────────────────────────────────────────────────────

def ephemeris(site_id: str, target: str, name: str) -> list[dict]:
    path = CACHE / f"eph_{site_id}_{name}.json"
    if path.exists():
        rows = json.loads(path.read_text())
        return [{**r, "t": datetime.fromisoformat(r["t"])} for r in rows]
    cfg = SITES[site_id]
    log.info("Horizons: %s from %s, %s to %s every %d min", name, site_id, SPAN_START.date(), SPAN_STOP.date(), EPHEM_STEP_MIN)
    rows = fetch(target, Site(name=site_id, lon_e=cfg["lon_e"], lat=cfg["lat"]), SPAN_START, SPAN_STOP, EPHEM_STEP_MIN)
    path.write_text(json.dumps([{"t": r["t"].isoformat(), "az": r["az"], "el": r["el"], "ang_diam_arcsec": r["ang_diam_arcsec"]} for r in rows]))
    return rows


# ── scenarios ────────────────────────────────────────────────────────────

def wj(ws: list[Window]) -> list[dict]:
    return [{"start": iso(w.start), "end": iso(w.end), "hours": round(w.hours, 3), "open_start": w.open_start, "open_end": w.open_end} for w in ws]


def scenario(site_id: str, start: datetime, sky: dict, tracks: dict, all_w: dict, source: dict) -> dict:
    stop = start + timedelta(days=RUN_DAYS)
    span_h = RUN_DAYS * 24.0
    sun_w, earth_w = clip_windows(all_w["sun"], start, stop), clip_windows(all_w["earth"], start, stop)
    both_w = intersect_windows(sun_w, earth_w)
    wins = {"sun": wj(sun_w), "earth": wj(earth_w), "both": wj(both_w)}
    i0 = int((start - SPAN_START).total_seconds() // 60)
    i1 = i0 + RUN_DAYS * 24 * 60
    sl = slice(i0, i1 + 1, SERIES_EVERY_MIN)
    step = SKY_STEP_DEG
    sky_e = np.asarray(sky["elev"])
    under = lambda az: np.interp(np.asarray(az) % 360.0, np.append(np.arange(len(sky_e)) * step, 360.0), np.append(sky_e, sky_e[0]))
    s, e = tracks["sun"], tracks["earth"]
    clearance = s["margin"][i0:i1 + 1]          # highest part of the Sun's disc above the skyline
    s0 = iso(start)
    sun_now, earth_now = make_mock.state_at_start(wins["sun"], s0), make_mock.state_at_start(wins["earth"], s0)
    flick = short_windows(sun_w, FLICKER_HOURS) + short_windows(earth_w, FLICKER_HOURS)
    metrics = {
        "sun_up_hours": round(total_hours(sun_w), 1), "sun_up_percent": round(100 * total_hours(sun_w) / span_h, 1),
        "earth_up_hours": round(total_hours(earth_w), 1), "earth_up_percent": round(100 * total_hours(earth_w) / span_h, 1),
        "both_up_hours": round(total_hours(both_w), 1), "both_up_percent": round(100 * total_hours(both_w) / span_h, 1),
        "max_sun_clearance_deg": round(float(clearance.max()), 2),
        "longest_both_window_hours": round(max((w.hours for w in both_w), default=0.0), 1),
        "sun_window_count": len(sun_w), "earth_window_count": len(earth_w),
        "shortest_sun_window_hours": round(min((w.hours for w in sun_w if not (w.open_start or w.open_end)), default=0.0), 3) or None,
        "short_window_count": len(flick),
        "earth_view_percent": round(100 * total_hours(clip_windows(all_w["earth_view"], start, stop)) / span_h, 1),
        "receive_only_percent": round(100 * total_hours(clip_windows(all_w["receive_only"], start, stop)) / span_h, 1),
        "relay_needed_hours": round(span_h - total_hours(earth_w), 1),
        "relay_needed_percent": round(100 * (span_h - total_hours(earth_w)) / span_h, 1),
        "link_hours_by_station": {n: round(total_hours(clip_windows(all_w[n], start, stop)), 1) for n in all_w["stations"]},
    }
    every = int(round(SCENARIO_SKY_STEP_DEG / SKY_STEP_DEG))
    t_series = tracks["t"][sl]
    return {"ok": True, "error": None, "data": {
        "scenario": {"site": SITE_META[site_id], "start": s0, "stop": iso(stop), "step_min": SERIES_EVERY_MIN, "visibility_step_min": 1},
        "source": source,
        "now": {"sun_visible": sun_now["visible"], "earth_visible": earth_now["visible"],
                "sun_el_deg": round(float(s["el"][i0]), 2), "earth_el_deg": round(float(e["el"][i0]), 2),
                "sun_clearance_deg": round(float(clearance[0]), 2),
                "hours_to_sunset": sun_now["to_set"], "hours_to_earthset": earth_now["to_set"],
                "hours_to_sunrise": sun_now["to_rise"], "hours_to_earthrise": earth_now["to_rise"]},
        "metrics": metrics, "verdict": make_mock.verdict(metrics), "windows": wins,
        "short_windows": [{"body": "sun" if w in sun_w else "earth", "start": iso(w.start), "end": iso(w.end), "minutes": round(w.hours * 60, 1)} for w in flick],
        "horizon": {"az_step_deg": SCENARIO_SKY_STEP_DEG, "elev_deg": [round(v, 3) for v in sky["elev"][::every]]},
        "series": {
            "t": [str(x)[:16] + "Z" for x in t_series],
            "sun_az": np.round(s["az"][sl], 3).tolist(), "sun_el": np.round(s["el"][sl], 3).tolist(),
            "earth_az": np.round(e["az"][sl], 3).tolist(), "earth_el": np.round(e["el"][sl], 3).tolist(),
            "terrain_under_sun": np.round(under(s["az"][sl]), 3).tolist(), "terrain_under_earth": np.round(under(e["az"][sl]), 3).tolist()},
        "notes": [
            f"Skyline every {SKY_STEP_DEG}° from: " + "; ".join(sky["sources"]) + ".",
            f"Visibility checked every minute: Horizons positions every {EPHEM_STEP_MIN} min, interpolated to 1 min; rise and set times are interpolated to the second.",
            "Windows shorter than 1 hour are listed as short windows (brief flashes of light or Earth).",
            "Verdict thresholds are provisional.",
        ]}}


def sweep_row(env: dict) -> dict:
    d = env["data"]
    m = d["metrics"]
    return {"start": d["scenario"]["start"], "verdict": d["verdict"]["level"], **{k: m[k] for k in (
        "sun_up_percent", "earth_up_percent", "both_up_percent", "sun_up_hours", "both_up_hours",
        "longest_both_window_hours", "sun_window_count", "earth_window_count", "short_window_count",
        "earth_view_percent", "receive_only_percent", "relay_needed_percent")}}


def year_payload(site_id: str, sky: dict, tracks: dict, all_w: dict, source: dict) -> dict:
    """Every window over the whole span (to the second) plus a 30-minute sky track: enough to analyse any touchdown time."""
    every = int(round(SCENARIO_SKY_STEP_DEG / SKY_STEP_DEG))
    sl = slice(0, None, SERIES_EVERY_MIN)
    s, e = tracks["sun"], tracks["earth"]
    return {"ok": True, "error": None, "data": {
        "site": SITE_META[site_id], "span_start": iso(SPAN_START), "span_stop": iso(SPAN_STOP),
        "visibility_step_min": 1, "source": source,
        "windows": {"sun": wj(all_w["sun"]), "earth": wj(all_w["earth"]), "receive_only": wj(all_w["receive_only"]),
                    **({"sun_mast10": wj(all_w["sun_mast10"])} if "sun_mast10" in all_w else {})},
        "site_facts": all_w["facts"],
        "track": {"t0": iso(SPAN_START), "step_min": SERIES_EVERY_MIN,
                  "sun_az": np.round(s["az"][sl], 2).tolist(), "sun_el": np.round(s["el"][sl], 2).tolist(),
                  "earth_az": np.round(e["az"][sl], 2).tolist(), "earth_el": np.round(e["el"][sl], 2).tolist()},
        "horizon": {"az_step_deg": SCENARIO_SKY_STEP_DEG, "elev_deg": [round(v, 3) for v in sky["elev"][::every]]},
        "notes": [f"Skyline every {SKY_STEP_DEG}° from: " + "; ".join(sky["sources"]) + ".",
                  f"Visibility checked every minute; Horizons positions every {EPHEM_STEP_MIN} min interpolated to 1 min."]}}


# ── terrain map ──────────────────────────────────────────────────────────

def terrain_map(site_id: str, wins: list[WindowedDem], sky: dict, out: Path) -> dict | None:
    """North-up shaded relief around the site from the finest DEM, plus the skyline-making terrain."""
    if not wins:
        return None
    import matplotlib
    matplotlib.use("Agg")
    from matplotlib.colors import LightSource
    import matplotlib.pyplot as plt

    cfg = SITES[site_id]
    dem, (_, _, reach, _) = (wins[-1], cfg["near"][-1])
    # the downloaded square is aligned with the polar grid, not with local north; keep the north-up map inside it
    half = reach * 0.98 / np.sqrt(2.0)
    xs = np.linspace(-half, half, MAP_PX)
    xx, yy = np.meshgrid(xs, xs[::-1])
    lat, lon = destination(cfg["lat"], cfg["lon_e"], np.degrees(np.arctan2(xx, yy)) % 360.0, np.hypot(xx, yy))
    h = dem.sample_latlon(lat, lon)
    if len(wins) > 1:
        fine = wins[0].sample_latlon(lat, lon)
        h = np.where(np.isnan(fine), h, fine)
    h = np.where(np.isnan(h), np.nanmin(h), h)
    shade = LightSource(azdeg=315, altdeg=35).hillshade(h, vert_exag=1.5, dx=xs[1] - xs[0], dy=xs[1] - xs[0])
    rel = (h - h.min()) / max(1.0, h.max() - h.min())
    rgb = np.stack([0.30 + 0.55 * rel, 0.27 + 0.45 * rel, 0.22 + 0.36 * rel], -1) * (0.45 + 0.55 * shade[..., None])
    png = out / f"terrain_{site_id}.png"
    plt.imsave(png, np.clip(rgb, 0, 1))
    pts = [{"az": round(a, 1), "dist_m": round(d), "elev_deg": round(e, 2)}
           for a, d, e in zip(sky["az"][::20], sky["dist_m"][::20], sky["elev"][::20])]
    return {"site": site_id, "image": png.name, "half_width_m": round(half), "px": MAP_PX,
            "height_min_m": round(float(h.min())), "height_max_m": round(float(h.max())),
            "dem": [s for s in sky["sources"]], "skyline_points": pts,
            "provenance": "Shaded relief rendered by spike/build_dataset.py from NASA LRO LOLA DEM windows (PDS); north up, light from the north-west."}


# ── main ─────────────────────────────────────────────────────────────────

def _cached_points(path: Path, fetcher) -> list[dict]:
    if path.exists():
        return [{**r, "t": datetime.fromisoformat(r["t"])} for r in json.loads(path.read_text())]
    rows = fetcher()
    path.write_text(json.dumps([{**r, "t": r["t"].isoformat()} for r in rows]))
    return rows


def station_links(site_id: str, sky: dict, n_minutes: int) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """Per DSN dish: two-way link margin per minute (dish above the lunar skyline, lander >= 10 deg in the
    dish's sky); plus the receive-only margin of the best dish (>= 6 deg, the lowest a dish can point)."""
    cfg = SITES[site_id]
    lander_cmd = surface_point_command(cfg["lon_e"], cfg["lat"], 0.0, 301)
    out: dict[str, np.ndarray] = {}
    receive: list[np.ndarray] = []
    for st in DSN_70M:
        log.info("Horizons: DSS-%d (%s) <-> %s, both directions", st.dss, st.complex, site_id)
        seen = _cached_points(CACHE / f"dss{st.dss}_from_{site_id}.json", lambda: fetch_points(
            301, cfg["lon_e"], cfg["lat"], 0.0, surface_point_command(st.lon_e, st.lat, st.alt_km, 399),
            SPAN_START, SPAN_STOP, EPHEM_STEP_MIN))
        sees = _cached_points(CACHE / f"{site_id}_from_dss{st.dss}.json", lambda: fetch_points(
            399, st.lon_e, st.lat, st.alt_km, lander_cmd, SPAN_START, SPAN_STOP, EPHEM_STEP_MIN))
        a, b = resample_minutes(seen), resample_minutes(sees)
        if a["t"][0] != SPAN_START or b["t"][0] != SPAN_START or min(len(a["t"]), len(b["t"])) < n_minutes:
            raise RuntimeError(f"DSS-{st.dss} tables for {site_id} do not cover the span")
        cut = {"az": a["az"][:n_minutes], "el": a["el"][:n_minutes]}
        out[f"DSS-{st.dss} {st.complex}"] = link_margin_deg(cut, b["el"][:n_minutes], sky["elev"], SKY_STEP_DEG)
        receive.append(link_margin_deg(cut, b["el"][:n_minutes], sky["elev"], SKY_STEP_DEG, POINTING_FLOOR_DEG))
    return out, np.max(np.vstack(receive), axis=0)


def build_site(site_id: str, out: Path) -> None:
    sky, wins = skyline(site_id)
    tracks: dict = {}
    all_w: dict = {}
    for name, target in (("sun", SUN), ("earth", EARTH)):
        tr = interpolate_to_minutes(ephemeris(site_id, target, name))
        tracks[name] = tr
        tr["margin"] = disc_margin_deg(tr, sky["elev"], SKY_STEP_DEG)
        all_w[name] = windows_from_margin(tr["t"], tr["margin"])
        log.info("%s %s: %d windows over the span, %d shorter than 1 h", site_id, name, len(all_w[name]), len(short_windows(all_w[name], FLICKER_HOURS)))
    tracks["t"] = tracks["sun"]["t"]
    facts: dict = {"observer_height_m": OBS_HEIGHT_M}
    if wins:
        sky_mast, _ = skyline(site_id, MAST_HEIGHT_M)
        all_w["sun_mast10"] = windows_from_margin(tracks["t"], disc_margin_deg(tracks["sun"], sky_mast["elev"], SKY_STEP_DEG))
        finest = cfg_scale = SITES[site_id]["near"][0][0].scale_m
        facts.update({"mast_height_m": MAST_HEIGHT_M,
                      "slope_deg": round(local_slope_deg(wins[0].sample_latlon, SITES[site_id]["lat"], SITES[site_id]["lon_e"], SLOPE_BASELINE_M, finest), 1),
                      "slope_baseline_m": SLOPE_BASELINE_M, "slope_dem_m": cfg_scale})
        log.info("%s: slope %.1f deg; Sun with %g m mast %.0f h vs %.0f h at %g m", site_id, facts["slope_deg"], MAST_HEIGHT_M,
                 total_hours(all_w["sun_mast10"]), total_hours(all_w["sun"]), OBS_HEIGHT_M)
    all_w["facts"] = facts
    all_w["earth_view"] = all_w["earth"]          # any part of Earth's disc above the skyline
    links, receive = station_links(site_id, sky, len(tracks["t"]))
    all_w["receive_only"] = windows_from_margin(tracks["t"], receive)
    for name, m in links.items():
        all_w[name] = windows_from_margin(tracks["t"], m)
    all_w["earth"] = windows_from_margin(tracks["t"], np.max(np.vstack(list(links.values())), axis=0))
    all_w["stations"] = list(links)
    log.info("%s DSN link: %d windows, %.0f h of %.0f h", site_id, len(all_w["earth"]), total_hours(all_w["earth"]), len(tracks["t"]) / 60)
    source = {"ephemeris": "JPL Horizons API (DE441), 10-min steps interpolated to 1 min",
              "visibility_rule": "Sun: visible when any part of the disc is above the terrain skyline",
              "earth_link_rule": f"Earth link (two-way): a NASA DSN 70 m dish (Goldstone, Canberra, Madrid) is above the lander's terrain skyline and the lander is at least {MIN_DISH_ELEVATION_DEG:.0f} deg above the dish's horizon (DSN 810-005 module 101: no transmission below 10 deg). Receive-only uses {POINTING_FLOOR_DEG:.0f} deg (module 302: lowest pointing angle)",
              "terrain": "; ".join(sky["sources"]), "observer_height_m": OBS_HEIGHT_M}
    rows = []
    for d in start_dates():
        env = scenario(site_id, d, sky, tracks, all_w, source)
        (out / f"scenario_{site_id}_{d:%Y-%m-%d}.json").write_text(json.dumps(env, separators=(",", ":")))
        rows.append(sweep_row(env))
    (out / f"sweep_{site_id}.json").write_text(json.dumps({"ok": True, "error": None, "data": {"site": site_id, "days": RUN_DAYS, "rows": rows}}, separators=(",", ":")))
    (out / f"year_{site_id}.json").write_text(json.dumps(year_payload(site_id, sky, tracks, all_w, source), separators=(",", ":")))
    tmap = terrain_map(site_id, wins, sky, out)
    if tmap:
        (out / f"terrain_{site_id}.json").write_text(json.dumps({"ok": True, "error": None, "data": tmap}, separators=(",", ":")))
    log.info("%s: %d scenarios written", site_id, len(rows))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(BASE.parent / "web/public/data"))
    ap.add_argument("--sites", default=",".join(SITES))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    for site_id in args.sites.split(","):
        build_site(site_id, out)


if __name__ == "__main__":
    main()
