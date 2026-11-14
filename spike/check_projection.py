"""Settle the east/west convention of the polar DEM with independent data.

Samples the polar band at many pixels, converts each pixel to (lat, lon) with
our projection AND with the mirrored one (lon -> -lon), and compares heights
with the global simple-cylindrical LOLA grid LDEM_4 (no mirror ambiguity).
The right convention must agree much better.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from lunar.terrain import PolarGrid

log = logging.getLogger("check_projection")
DEM_DIR = Path(__file__).parent / "dem"
GRID = PolarGrid(n=7760, scale_m=240.0)
RES = 4  # LDEM_4: 4 pixels per degree, 720 x 1440, line 1 at the north edge, lon 0 at the left edge


def global_height_m(glob: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    row = np.clip(np.floor((90.0 - lat) * RES).astype(int), 0, glob.shape[0] - 1)
    col = np.clip(np.floor((lon % 360.0) * RES).astype(int), 0, glob.shape[1] - 1)
    return glob[row, col]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    band_path = next(DEM_DIR.glob("ldem_60s_240m_band_*.npy"))
    first_line = json.loads(band_path.with_suffix(".json").read_text())["first_line"]
    band = np.load(band_path).astype(float)
    glob = np.fromfile(DEM_DIR / "ldem_4_float.img", dtype="<f4").reshape(720, 1440) * 1000.0

    # Average 32x32 polar pixels (7.7 km) so both maps have similar resolution.
    block = 32
    rows, cols = (band.shape[0] // block) * block, (band.shape[1] // block) * block
    coarse = band[:rows, :cols].reshape(rows // block, block, cols // block, block).mean(axis=(1, 3))
    rr, cc = np.meshgrid(np.arange(coarse.shape[0]), np.arange(coarse.shape[1]), indexing="ij")
    j = first_line + rr * block + (block - 1) / 2
    i = 1 + cc * block + (block - 1) / 2
    lat, lon = GRID.pixel_to_latlon(i, j)
    keep = lat < -61.0  # stay inside the polar map's valid area

    results = {}
    for name, lon_used in [("ours (90E right)", lon), ("mirrored (90E left)", -lon)]:
        g = global_height_m(glob, lat[keep], lon_used[keep])
        p = coarse[keep]
        results[name] = {
            "points": int(keep.sum()),
            "rms_diff_m": round(float(np.sqrt(np.mean((g - p) ** 2))), 1),
            "correlation": round(float(np.corrcoef(g, p)[0, 1]), 4),
        }
    log.info(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
