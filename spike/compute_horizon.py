"""Compute the terrain horizon (skyline) at the site from the cached LOLA band.

Usage: python3 compute_horizon.py
Writes data/<site>_horizon.json and data/<site>_horizon.png.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from lunar.terrain import DemWindow, PolarGrid, horizon_profile  # noqa: E402

log = logging.getLogger("compute_horizon")
BASE = Path(__file__).parent
GRID = PolarGrid(n=7760, scale_m=240.0)
SITE_NAME = "chandrayaan3_shiv_shakti"
SITE_LAT, SITE_LON = -69.373, 32.319
OBS_HEIGHT_M = 2.0          # roughly a lander deck / antenna height
MAX_DIST_M = 150_000.0      # beyond this, curvature hides almost everything
STEP_M = 120.0              # half a DEM pixel
MIN_DIST_M = 480.0          # skip the first 2 pixels: the site's own smoothed pixel


def load_window() -> DemWindow:
    band_path = next((BASE / "dem").glob("ldem_60s_240m_band_*.npy"))
    meta = json.loads(band_path.with_suffix(".json").read_text())
    return DemWindow(grid=GRID, first_line=meta["first_line"], heights_m=np.load(band_path).astype(float))


def plot(profile: dict, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 3.8))
    az, elev = np.array(profile["az"]), np.array(profile["elev"])
    ax.fill_between(az, -3, elev, color="saddlebrown", alpha=0.6, label="Terrain (LOLA)")
    ax.axhline(0, color="black", lw=0.8, ls="--", label="Smooth-sphere horizon (0 deg)")
    ax.set_xlim(0, 360)
    ax.set_ylim(-3, max(3.0, elev.max() + 0.5))
    ax.set_xticks(range(0, 361, 45))
    ax.set_xticklabels(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"])
    ax.set_ylabel("Elevation (deg)")
    ax.set_title(f"Skyline at {SITE_NAME} ({SITE_LAT}, {SITE_LON}E), observer {OBS_HEIGHT_M} m above ground")
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    window = load_window()
    profile = horizon_profile(window.sample_latlon, SITE_LAT, SITE_LON, obs_height_m=OBS_HEIGHT_M,
                              az_step_deg=0.5, max_dist_m=MAX_DIST_M, step_m=STEP_M, min_dist_m=MIN_DIST_M)
    profile["site"] = {"name": SITE_NAME, "lat": SITE_LAT, "lon_e": SITE_LON}
    profile["dem"] = "LOLA LDEM_60S_240M (PDS), polar stereographic, 240 m/pixel"
    out = BASE / "data" / f"{SITE_NAME}_horizon.json"
    out.write_text(json.dumps(profile, indent=1))
    plot(profile, out.with_suffix(".png"))

    elev = np.array(profile["elev"])
    top = int(np.argmax(elev))
    log.info("Site height: %.0f m above 1737.4 km", profile["site_height_m"])
    log.info("Missing DEM samples: %.2f%%", 100 * profile["missing_fraction"])
    log.info("Horizon min %.2f, mean %.2f, max %.2f deg (max at az %.1f, %.1f km away)",
             elev.min(), elev.mean(), elev.max(), profile["az"][top], profile["dist_m"][top] / 1000)
    for compass, az in [("N", 0), ("E", 90), ("S", 180), ("W", 270)]:
        k = int(az / 0.5)
        log.info("  %s: %.2f deg at %.1f km", compass, elev[k], profile["dist_m"][k] / 1000)
    log.info("Wrote %s and .png", out)


if __name__ == "__main__":
    main()
