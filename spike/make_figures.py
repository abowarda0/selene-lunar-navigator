"""Team figures for the validation results.

Usage: python3 make_figures.py   (after run_spike.py, compare_pgda.py, polar_fetch.py, polar_validate.py)
Writes ../figures/*.png
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from lunar.horizons import EARTH, SUN, Site, fetch  # noqa: E402
from lunar.terrain import horizon_fn_from_profile, horizon_profile  # noqa: E402
from lunar.visibility import upper_limb_el, visible_windows  # noqa: E402
from polar_validate import GRID, load  # noqa: E402

log = logging.getLogger("figures")
BASE = Path(__file__).parent
DATA = BASE / "data"
OUT = BASE.parent / "figures"

SUN_C, EARTH_C, TERRAIN_C, NASA_C, SMOOTH_C, GOOD_C = "#E8871E", "#2F6DB5", "#8B5A2B", "#222222", "#9A9A9A", "#2E8B57"
COMPASS = (range(0, 361, 45), ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"])
POLAR_LABELS = ["Ridge top", "Ridge slope", "Mid", "Low", "Dim", "Perm. shadow", "Earth 1/4", "Earth 1/2"]

plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.titleweight": "bold", "axes.titlesize": 13, "figure.dpi": 110})


def save(fig, name: str) -> None:
    fig.savefig(OUT / name, bbox_inches="tight")
    plt.close(fig)
    log.info("wrote %s", OUT / name)


def load_points() -> list[dict]:
    """All validation points: 5 at Chandrayaan-3 (240 m) + 8 near the pole (120 m)."""
    points = []
    for r in json.loads((DATA / "pgda_comparison.json").read_text())["rows"]:
        o = r["ours"]
        points.append({"group": "69°S (Chandrayaan-3 area)", "label": r["point"],
                       "nasa_sun": r["nasa_sun"]["value"], "sun_rng": [r["nasa_sun"]["min_3x3"], r["nasa_sun"]["max_3x3"]],
                       "nasa_earth": r["nasa_earth"]["value"], "earth_rng": [r["nasa_earth"]["min_3x3"], r["nasa_earth"]["max_3x3"]],
                       "sun": o["terrain_0m_sun"], "earth": o["terrain_0m_earth"],
                       "smooth_sun": o["smooth_sun"], "smooth_earth": o["smooth_earth"]})
    for r, label in zip(json.loads((DATA / "polar_validation.json").read_text()), POLAR_LABELS):
        o = r["ours"]
        points.append({"group": "Near the pole (<60 km)", "label": label,
                       "nasa_sun": r["nasa_sun"], "sun_rng": r["nasa_sun_3x3"],
                       "nasa_earth": r["nasa_earth"], "earth_rng": r["nasa_earth_3x3"],
                       "sun": o["sun_0m"], "earth": o["earth_0m"],
                       "smooth_sun": o["smooth_sun"], "smooth_earth": o["smooth_earth"]})
    return points


def fig_validation(points: list[dict]) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(13, 6.2))
    for ax, body, color in ((axes[0], "sun", SUN_C), (axes[1], "earth", EARTH_C)):
        ax.plot([0, 1], [0, 1], color=NASA_C, lw=1, ls="--", zorder=1)
        ax.fill_between([0, 1], [-0.03, 0.97], [0.03, 1.03], color=GOOD_C, alpha=0.08, zorder=0)
        for p in points:
            x, rng = p[f"nasa_{body}"], p[f"{body}_rng"]
            marker = "o" if p["group"].startswith("Near") else "s"
            ax.errorbar(x, p[body], xerr=[[max(0.0, x - rng[0])], [max(0.0, rng[1] - x)]], fmt=marker, color=color,
                        ms=8, mec="white", mew=1, ecolor=color, elinewidth=1, alpha=0.95, zorder=3)
            ax.scatter(x, p[f"smooth_{body}"], marker=marker, s=50, facecolors="none", edgecolors=SMOOTH_C, zorder=2)
        ax.set_xlim(-0.03, 1.03)
        ax.set_ylim(-0.03, 1.03)
        ax.set_xlabel(f"NASA map: share of time {body.title()} visible")
        ax.set_ylabel("Our engine")
        ax.set_aspect("equal")
        ax.set_title("Sun (power)" if body == "sun" else "Earth (direct comms)")
    handles = [
        plt.Line2D([], [], marker="o", ls="", color="#555", ms=8, label="Ours with LOLA terrain, near the pole"),
        plt.Line2D([], [], marker="s", ls="", color="#555", ms=8, label="Ours with LOLA terrain, 69°S"),
        plt.Line2D([], [], marker="o", ls="", mfc="none", mec=SMOOTH_C, ms=8, label="Smooth Moon, no terrain"),
        plt.Line2D([], [], color=NASA_C, ls="--", label="Perfect agreement"),
        plt.Line2D([], [], color=SUN_C, lw=1, label="Bars: NASA value range over neighbouring pixels"),
    ]
    fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, bbox_to_anchor=(0.5, -0.06))
    fig.suptitle("With terrain, our engine lands on NASA's numbers. Without it, it does not.",
                 fontsize=15, fontweight="bold", y=1.0)
    save(fig, "1_validation_vs_nasa.png")


def fig_error_bars(points: list[dict]) -> None:
    polar = [p for p in points if p["group"].startswith("Near")]
    labels = [p["label"] for p in polar]
    y = np.arange(len(polar))
    fig, axes = plt.subplots(1, 2, figsize=(13, 5), sharey=True)
    for ax, body, color in ((axes[0], "sun", SUN_C), (axes[1], "earth", EARTH_C)):
        err_t = [100 * abs(p[body] - p[f"nasa_{body}"]) for p in polar]
        err_s = [100 * abs(p[f"smooth_{body}"] - p[f"nasa_{body}"]) for p in polar]
        ax.barh(y + 0.2, err_s, height=0.38, color=SMOOTH_C, label="Smooth Moon (no terrain)")
        ax.barh(y - 0.2, err_t, height=0.38, color=color, label="With LOLA terrain")
        for yi, v in zip(y, err_t):
            ax.text(v + 0.8, yi - 0.2, f"{v:.1f}", va="center", fontsize=9, color=color)
        for yi, v in zip(y, err_s):
            ax.text(v + 0.8, yi + 0.2, f"{v:.0f}", va="center", fontsize=9, color=SMOOTH_C)
        ax.set_xlabel("Error vs NASA (percentage points of time)")
        ax.set_title("Sun visibility error" if body == "sun" else "Earth visibility error")
        ax.set_xlim(0, 70)
        ax.legend(frameon=False, loc="upper right", fontsize=9)
    axes[0].set_yticks(y, labels)
    axes[0].invert_yaxis()
    worst = max(100 * abs(p[f"smooth_{b}"] - p[f"nasa_{b}"]) for p in polar for b in ("sun", "earth"))
    fig.suptitle(f"Near the pole, ignoring terrain is wrong by up to {worst:.0f} points. "
                 "With terrain: under 3 at 6 of 8 points.",
                 fontsize=14, fontweight="bold", y=1.02)
    save(fig, "2_error_terrain_vs_smooth.png")


def fig_map(points: list[dict]) -> None:
    sun_map = load("nasa_sun")
    rows = json.loads((DATA / "polar_validation.json").read_text())
    half = 520
    c0 = int(GRID.centre) - half
    crop = sun_map.heights_m[:, c0 - 1:c0 - 1 + 2 * half + 1]
    km = (np.array([0, crop.shape[1], crop.shape[0], 0]) - half) * 0.12
    fig, ax = plt.subplots(figsize=(8.5, 8))
    im = ax.imshow(crop, cmap="inferno", vmin=0, vmax=0.9,
                   extent=[km[0], km[1], (sun_map.first_line + crop.shape[0] - GRID.centre) * 0.12 * -1,
                           (sun_map.first_line - GRID.centre) * -0.12])
    for r, label in zip(rows, POLAR_LABELS):
        x = (r["i"] - GRID.centre) * 0.12
        yv = -(r["j"] - GRID.centre) * 0.12
        ax.scatter(x, yv, s=90, facecolors="none", edgecolors="#4FD1FF", linewidths=2)
        offset = (6, -14) if yv > 55 else (6, 6)  # keep labels near the top edge inside the map
        ax.annotate(label, (x, yv), xytext=offset, textcoords="offset points", color="white", fontsize=9,
                    fontweight="bold")
    ax.scatter(0, 0, marker="+", s=150, color="white")
    ax.annotate("South pole", (0, 0), xytext=(6, -14), textcoords="offset points", color="white", fontsize=9)
    ax.set_xlabel("km (0° longitude is up)")
    ax.set_ylabel("km")
    cb = fig.colorbar(im, ax=ax, shrink=0.8)
    cb.set_label("NASA: share of time in sunlight (18.6-year average)")
    ax.set_title("Test points were picked from NASA's own illumination map,\nfrom permanent shadow (black) to bright ridges")
    save(fig, "3_test_points_on_nasa_map.png")


def fig_ridge(points: list[dict]) -> None:
    rows = json.loads((DATA / "polar_validation.json").read_text())
    ridge = max(rows, key=lambda r: r["nasa_sun"])
    lat, lon = ridge["lat"], ridge["lon_e"]
    profile = horizon_profile(load("dem").sample_latlon, lat, lon, obs_height_m=2.0, az_step_deg=0.5,
                              max_dist_m=150_000.0, step_m=60.0, min_dist_m=240.0)
    horizon = horizon_fn_from_profile(profile)
    start = datetime(2027, 6, 1, tzinfo=timezone.utc)
    stop = start + timedelta(days=30)
    site = Site(name="ridge", lon_e=lon, lat=lat)
    sun, earth = fetch(SUN, site, start, stop, 10), fetch(EARTH, site, start, stop, 10)

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 9), gridspec_kw={"height_ratios": [1, 1]})
    ax1.fill_between(profile["az"], -6, profile["elev"], color=TERRAIN_C, alpha=0.65, label="Terrain (LOLA 120 m)")
    ax1.scatter([s["az"] for s in sun], [s["el"] for s in sun], s=3, color=SUN_C, label="Sun path")
    ax1.scatter([e["az"] for e in earth], [e["el"] for e in earth], s=3, color=EARTH_C, label="Earth path")
    ax1.axhline(0, color="black", lw=0.8, ls="--", label="Smooth-Moon horizon")
    ax1.set_xlim(0, 360)
    ax1.set_ylim(-6, 8)
    ax1.set_xticks(*COMPASS)
    ax1.set_ylabel("Elevation (deg)")
    sun_el = [s["el"] for s in sun]
    ax1.set_title(f"Sky view from a ridge 17 km from the pole ({lat:.2f}°, {lon:.1f}°E), June 2027:\n"
                  f"the Sun circles the whole horizon between {min(sun_el):.1f}° and {max(sun_el):.1f}°, "
                  "below the flat horizon, yet the ridge still sees it over lower terrain")
    ax1.legend(loc="upper right", fontsize=9, markerscale=4, ncol=2)

    t = [s["t"] for s in sun]
    sun_clear = [upper_limb_el(s["el"], s["ang_diam_arcsec"]) - horizon(s["az"]) for s in sun]
    earth_clear = [upper_limb_el(e["el"], e["ang_diam_arcsec"]) - horizon(e["az"]) for e in earth]
    for w in visible_windows(sun, horizon):
        ax2.axvspan(w.start, w.end, color=SUN_C, alpha=0.12, lw=0)
    ax2.plot(t, sun_clear, color=SUN_C, label="Sun: height above the terrain")
    ax2.plot(t, earth_clear, color=EARTH_C, label="Earth: height above the terrain")
    ax2.axhline(0, color=TERRAIN_C, lw=1.5, label="Terrain line (below = hidden)")
    ax2.set_ylabel("Clearance above terrain (deg)")
    ax2.set_title("Same month over time: light comes and goes as the Sun passes behind peaks (shaded = sunlit)")
    ax2.legend(loc="upper right", fontsize=9)
    plt.setp(ax2.get_xticklabels(), rotation=30, ha="right")
    fig.tight_layout()
    save(fig, "4_polar_ridge_sky_and_timeline.png")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    OUT.mkdir(exist_ok=True)
    points = load_points()
    fig_validation(points)
    fig_error_bars(points)
    fig_map(points)
    fig_ridge(points)


if __name__ == "__main__":
    main()
