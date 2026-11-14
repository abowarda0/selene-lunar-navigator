"""Pick one sample landing point inside each NASA Artemis III candidate region.

NASA names nine regions (~15 x 15 km each, Oct 2024 update) but publishes no coordinates.
We anchor each region on the official IAU feature it is named after (USGS Gazetteer of Planetary
Nomenclature: centre, diameter), search a ring or disc around it, and take the 120 m pixel with
the highest NASA average sunlight (LOLA AVGVISIB_75S_120M, Mazarico et al. 2011) among pixels where
NASA's Earth-visibility map is at least MIN_EARTH. The result is a *sample point*, not NASA's site.

Usage: python3 pick_sites.py  -> writes data/named_sites.json
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import numpy as np

from lunar.fine import fetch_window
from lunar.terrain import PolarGrid

log = logging.getLogger("pick")
BASE = Path(__file__).parent
CACHE = BASE / "fine"
MAP = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/avgvisib_75s_120m_201608{}.img"
GRID = PolarGrid(n=7624, scale_m=120.0)
SCALE = 0.00004          # int16 -> fraction of time (label SCALING_FACTOR)
MIN_EARTH = 0.3
R_MOON_M = 1737400.0
GAZETTEER = "USGS Gazetteer of Planetary Nomenclature (planetarynames.wr.usgs.gov), accessed 14 Nov 2026"

# (id, NASA region name, anchor, centre lat, centre lon_e, search ring inner/outer km)
# Anchor = centre of the LROC low-Sun NAC mosaic titled with the region's name (LROC RDR products,
# data.lroc.im-ldi.com, see data/lroc_region_mosaics.json); search within 8 km (~half a 15 km region).
# Slater Plain has no LROC region mosaic: anchored on Slater crater (USGS Gazetteer) instead.
LROC = "LROC NAC mosaic "
REGIONS = [
    ("malapert_massif", "Malapert Massif", LROC + "NAC_ROI_MALAPERTLO1_P860S0003", -86.0, 0.3, 0, 8),
    ("mons_mouton", "Mons Mouton / Nobile Rim 1", LROC + "NAC_ROI_MTMOUTONLO1_P854S0353", -85.4, 35.3, 0, 8),
    ("mons_mouton_plateau", "Mons Mouton Plateau", LROC + "NAC_ROI_MOUTNPLTLO1_P843S0306", -84.3, 30.6, 0, 8),
    ("nobile_rim_2", "Nobile Rim 2", LROC + "NAC_ROI_NOBILE02LO1_P839S0587", -83.9, 58.7, 0, 8),
    ("haworth", "Haworth", LROC + "NAC_ROI_HAWORTH_LO1_P867S3363", -86.7, 336.3, 0, 8),
    ("cabeus_b_peak", "Peak near Cabeus B", LROC + "NAC_ROI_CABEUSPKLO1_P836S2912", -83.6, 291.2, 0, 8),
    ("de_gerlache_rim", "de Gerlache Rim 2", LROC + "NAC_ROI_DEGERRIMLO1_P885S2933 (titled 'de Gerlache Rim')", -88.5, 293.3, 0, 8),
    ("slater_plain", "Slater Plain", "Slater (crater, D 25.1 km), USGS Gazetteer: no LROC region mosaic found", -88.08, 111.29, 10, 35),
]


def gc_km(lat1, lon1, lat2, lon2):
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(np.asarray(lon2) - lon1)
    c = np.sin(p1) * np.sin(p2) + np.cos(p1) * np.cos(p2) * np.cos(dl)
    return R_MOON_M / 1000 * np.arccos(np.clip(c, -1, 1))


def window(suffix: str, tag: str, lat: float, lon: float, half_px: int):
    i, j = GRID.latlon_to_pixel(lat, lon)
    l0, l1 = int(j) - half_px, int(j) + half_px
    c0, c1 = int(i) - half_px, int(i) + half_px
    path = CACHE / f"avgvisib{suffix or '_sun'}_{tag}_{l0}_{c0}.npy"
    if not path.exists():
        arr = fetch_window(MAP.format(suffix), GRID.n, l0, l1, c0, c1, dtype="<i2", scale=SCALE)
        np.save(path, arr.astype(np.float32))
    return np.load(path), l0, c0


MIN_SEPARATION_KM = 15.0   # regions overlap (Nobile Rim 1 lies on Mons Mouton); keep sample points apart


def pick(region, taken: list[tuple[float, float]]) -> dict:
    rid, name, feature, lat, lon, r_in, r_out = region
    half = int(r_out * 1000 / GRID.scale_m) + 2
    sun, l0, c0 = window("", rid, lat, lon, half)
    earth, _, _ = window("_earth", rid, lat, lon, half)
    jj, ii = np.mgrid[l0:l0 + sun.shape[0], c0:c0 + sun.shape[1]]
    plat, plon = GRID.pixel_to_latlon(ii.astype(float), jj.astype(float))
    d = gc_km(lat, lon, plat, plon)
    ring = (d >= r_in) & (d <= r_out)
    for tl, tn in taken:
        ring &= gc_km(tl, tn, plat, plon) >= MIN_SEPARATION_KM
    ok = ring & (earth >= MIN_EARTH)
    pool = ok if ok.any() else ring
    k = np.unravel_index(np.argmax(np.where(pool, sun, -1)), sun.shape)
    out = {"id": rid, "nasa_region": name, "anchor_feature": feature, "anchor_lat": lat, "anchor_lon_e": lon % 360,
           "search_km": [r_in, r_out], "lat": round(float(plat[k]), 5), "lon_e": round(float(plon[k]) % 360, 5),
           "nasa_avg_sun": round(float(sun[k]), 3), "nasa_avg_earth": round(float(earth[k]), 3),
           "km_from_anchor": round(float(d[k]), 1), "earth_filter_applied": bool(ok.any())}
    log.info("%-16s %8.4f %9.4f  sun %.2f earth %.2f  (%.1f km from %s)", rid, out["lat"], out["lon_e"],
             out["nasa_avg_sun"], out["nasa_avg_earth"], out["km_from_anchor"], feature)
    return out


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    rows: list[dict] = []
    for r in REGIONS:
        rows.append(pick(r, [(x['lat'], x['lon_e']) for x in rows]))
    meta = {"method": __doc__.strip().splitlines()[0], "gazetteer": GAZETTEER,
            "illumination_map": "NASA LOLA AVGVISIB_75S_120M_201608 (sun) and _EARTH (PDS LOLA EXTRAS)",
            "nasa_regions_source": "NASA, 'NASA Provides Update on Artemis III Moon Landing Regions', Oct 2024",
            "anchor_source": "LROC low-Sun NAC region mosaics (data.lroc.im-ldi.com RDR products), centre lat/lon; USGS Gazetteer for Slater",
            "min_earth_fraction": MIN_EARTH, "sites": rows}
    (BASE / "data/named_sites.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
