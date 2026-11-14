"""Export a north-up terrain height grid around each site for the 3D view in the web app.

Same LOLA DEM windows the skyline uses (cached in fine/): finest layer first, the next layer where the
finest one has no data. Heights are relative to the site and include the Moon's curvature drop.

Usage: python3 export_heightmaps.py [--half-km 15] [--n 257]
Output: ../web/public/data/height_<site>.json  {site, half_width_m, n, step_m, h_min_m, h_max_m, heights_b64}
heights_b64 = base64 of little-endian int16 metres, row 0 = north edge, column 0 = west edge.
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
from pathlib import Path

import numpy as np

import build_dataset as B
from lunar.fine import local_height_grid

log = logging.getLogger("heightmaps")
OUT = B.BASE.parent / "web/public/data"


def combined_sampler(site_id: str):
    cfg = B.SITES[site_id]
    wins = [B.fine_window(d, cfg["lat"], cfg["lon_e"], site_id) for d, *_ in cfg["near"]]
    samplers = [w.sample_latlon for w in wins]
    names = [d.product.upper() for d, *_ in cfg["near"]]
    far = cfg.get("far")
    if isinstance(far, B.FineDem):                      # wider, coarser map for the edges of a larger view
        samplers.append(B.fine_window(far, cfg["lat"], cfg["lon_e"], site_id).sample_latlon)
        names.append(far.product.upper())
    elif far:
        samplers.append(B.far_sampler(far)[0])
        names.append("LDEM_60S_240M" if far == "band240" else "LDEM_75S_120M")

    def sample(lat, lon):
        out = np.full(np.shape(lat), np.nan)
        for f in samplers:
            v = f(lat, lon)
            out = np.where(np.isnan(out), v, out)
        return out
    return sample, names


def export(site_id: str, half_m: float, n: int) -> Path | None:
    cfg = B.SITES[site_id]
    if not cfg["near"]:
        return None
    sampler, products = combined_sampler(site_id)
    g = local_height_grid(sampler, cfg["lat"], cfg["lon_e"], half_m, n)
    filled = np.where(np.isnan(g), np.nanmin(g), g)
    q = np.clip(np.round(filled), -32768, 32767).astype("<i2")
    payload = {"site": site_id, "half_width_m": half_m, "n": n, "step_m": 2 * half_m / (n - 1),
               "h_min_m": float(q.min()), "h_max_m": float(q.max()), "missing_fraction": float(np.isnan(g).mean()),
               "dem": products, "heights_b64": base64.b64encode(q.tobytes()).decode(),
               "provenance": "NASA LRO LOLA polar DEMs (PDS), sampled on a north-up grid; heights relative to the site, Moon curvature included."}
    path = OUT / f"height_{site_id}.json"
    path.write_text(json.dumps({"ok": True, "error": None, "data": payload}, separators=(",", ":")))
    log.info("%s: %d x %d, %.0f m step, heights %d..%d m, %.1f%% missing", site_id, n, n, payload["step_m"],
             payload["h_min_m"], payload["h_max_m"], 100 * payload["missing_fraction"])
    return path


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser()
    ap.add_argument("--half-km", type=float, default=40.0)
    ap.add_argument("--n", type=int, default=321)
    a = ap.parse_args()
    for site_id in B.SITES:
        export(site_id, a.half_km * 1000, a.n)


if __name__ == "__main__":
    main()
