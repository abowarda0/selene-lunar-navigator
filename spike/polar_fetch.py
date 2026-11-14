"""Download the pole-area bands for the polar validation (cached in polar/).

- LOLA LDEM_75S_120M (terrain), lines covering the pole +/- 213 km
- NASA AVGVISIB_75S_120M Sun and Earth maps, lines covering the pole +/- 62 km
Same 7624 x 7624 grid at 120 m, so pixels line up.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from lunar.terrain import PolarGrid, fetch_lines

log = logging.getLogger("polar_fetch")
OUT = Path(__file__).parent / "polar"
GRID = PolarGrid(n=7624, scale_m=120.0)
DEM_URL = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
           "data/lola_gdr/polar/float_img/ldem_75s_120m_float.img")
MAP_URL = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
           "extras/illumination/img/avgvisib_75s_120m_201608{suffix}.img")
DEM_HALF_LINES = 1780   # 60 km point radius + 150 km horizon + margin, at 120 m
MAP_HALF_LINES = 520    # 60 km point radius + margin

PRODUCTS = {
    "dem": (DEM_URL, DEM_HALF_LINES, "<f4", 1000.0),
    "nasa_sun": (MAP_URL.format(suffix=""), MAP_HALF_LINES, "<i2", 0.00004),
    "nasa_earth": (MAP_URL.format(suffix="_earth"), MAP_HALF_LINES, "<i2", 0.00004),
}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    OUT.mkdir(exist_ok=True)
    centre = int(GRID.centre)
    for name, (url, half, dtype, scale) in PRODUCTS.items():
        path = OUT / f"{name}.npy"
        if path.exists():
            log.info("cached: %s", path)
            continue
        first, last = centre - half, centre + half
        log.info("downloading %s lines %d..%d", name, first, last)
        window = fetch_lines(url, GRID, first, last, dtype=dtype, scale=scale)
        np.save(path, window.heights_m.astype(np.float32))
        path.with_suffix(".json").write_text(json.dumps({"source": url, "first_line": first, "last_line": last}))
        log.info("saved %s shape=%s min=%.3f max=%.3f", path, window.heights_m.shape,
                 float(np.nanmin(window.heights_m)), float(np.nanmax(window.heights_m)))


if __name__ == "__main__":
    main()
