"""Moon texture for the web globe: shaded relief from NASA LOLA LDEM_4 (4 px/deg, PDS).

Usage: python3 make_moon_texture.py [out.png]
Equirectangular, line 1 = 90 N, sample 1 = 0 E (LDEM_4 runs 0..360 E). No imagery, no colour invented: grey from height and slope.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

BASE = Path(__file__).parent
LINES, SAMPLES = 720, 1440


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE.parent / "web/public/data/moon_ldem4.png"
    import matplotlib
    matplotlib.use("Agg")
    from matplotlib.colors import LightSource
    import matplotlib.pyplot as plt

    h = np.fromfile(BASE / "dem/ldem_4_float.img", dtype="<f4").reshape(LINES, SAMPLES).astype(float)
    shade = LightSource(azdeg=300, altdeg=40).hillshade(h, vert_exag=12, dx=7.6, dy=7.6)
    rel = (h - np.percentile(h, 1)) / (np.percentile(h, 99) - np.percentile(h, 1))
    grey = np.clip(0.30 + 0.25 * np.clip(rel, 0, 1) + 0.45 * shade - 0.18, 0, 1)
    plt.imsave(out, grey, cmap="gray", vmin=0, vmax=1)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
