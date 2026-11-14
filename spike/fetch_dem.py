"""Download the band of LOLA LDEM_60S_240M lines around a site and cache it.

Usage: python3 fetch_dem.py
Writes dem/ldem_60s_240m_band_<first>_<last>.npy (heights in metres).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from lunar.terrain import PolarGrid, fetch_lines

log = logging.getLogger("fetch_dem")

URL = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
       "data/lola_gdr/polar/float_img/ldem_60s_240m_float.img")
GRID = PolarGrid(n=7760, scale_m=240.0)
SITE_LAT, SITE_LON = -69.373, 32.319
HALF_BAND_LINES = 680  # 150 km horizon radius * ~1.03 map scale factor / 240 m, plus margin
OUT_DIR = Path(__file__).parent / "dem"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    _, j = GRID.latlon_to_pixel(SITE_LAT, SITE_LON)
    first = max(1, int(round(j)) - HALF_BAND_LINES)
    last = min(GRID.n, int(round(j)) + HALF_BAND_LINES)
    out = OUT_DIR / f"ldem_60s_240m_band_{first}_{last}.npy"
    if out.exists():
        log.info("Already cached: %s", out)
        return
    log.info("Downloading lines %d..%d (%.1f MB)", first, last, (last - first + 1) * GRID.n * 4 / 1e6)
    window = fetch_lines(URL, GRID, first, last)
    np.save(out, window.heights_m.astype(np.float32))
    meta = {"source": URL, "first_line": first, "last_line": last, "units": "m above 1737.4 km",
            "min_m": float(np.nanmin(window.heights_m)), "max_m": float(np.nanmax(window.heights_m))}
    out.with_suffix(".json").write_text(json.dumps(meta, indent=1))
    log.info("Saved %s  %s", out, json.dumps(meta))


if __name__ == "__main__":
    main()
