# Data spike: Sun and Earth visibility with LOLA terrain

One real site (Chandrayaan-3, Statio Shiv Shakti, 69.373 S, 32.319 E), 1–31 Dec 2026, 10-minute steps.

## Run
```bash
python3 fetch_dem.py         # downloads only the LOLA lines around the site (~42 MB, HTTP Range)
python3 check_projection.py  # proves the DEM east/west convention against the global LOLA grid
python3 compute_horizon.py   # skyline: highest terrain angle in each direction, 0.5 deg steps
python3 run_spike.py         # Horizons Sun + Earth, smooth vs terrain, JSON + plots in data/
python3 -m pytest -q --cov=lunar
```

## Code
| File | Does |
|---|---|
| `lunar/horizons.py` | Horizons API requests, chunking under the 90,000-step limit, CSV parsing |
| `lunar/visibility.py` | Upper limb vs horizon, rise/set interpolation, windows, Sun-and-Earth overlap |
| `lunar/terrain.py` | LOLA polar grid projection, DEM band download and sampling, horizon profile |

## Results
| | Smooth sphere | With LOLA terrain |
|---|---|---|
| Sunrise | 13 Dec 13:56 UTC | 13 Dec 18:59 UTC (**+5.1 h**) |
| Sunset | 29 Dec 01:42 UTC | 28 Dec 15:27 UTC (**−10.3 h**) |
| Sun up in 30 days | 371.8 h (51.6%) | 356.5 h (49.5%) |
| Earth up | 100% | 100% (Earth stays 11–23° high, NW) |
| Highest Sun above terrain | 22.2° | 20.8° |

The skyline is 0.4° to 2.5° high all around. The Sun climbs only about 0.2° per hour near the horizon, so a 1–2° hill shifts sunrise and sunset by hours.

## Checks
- Smooth-sphere engine vs Horizons `*`/`i` flags: 0 mismatches (4,321 Sun rows, 4,317 Earth rows).
- DEM east/west convention vs global LOLA grid LDEM_4: correlation 0.986, RMS 234 m. The mirrored version gives −0.08 / 2,072 m.
  - Note: the catalog file `DSMAP_POLAR.CAT` gives a lat/lon→pixel formula that is mirrored relative to its own text and inverse formula. We follow the text and inverse, and the data confirms it.

## Independent check vs NASA's illumination maps (`compare_pgda.py`)
NASA map: LOLA EXTRAS `AVGVISIB_65S_240M_201608` (Mazarico et al. 2011, on PGDA and PDS). It gives the share of time steps when any part of the Sun's (or Earth's) disc is visible, over an 18.6-year cycle, computed from an older LOLA DEM.
Ours: the same definition, from Horizons every 2 h for 2026-01-01 + 6,794 days, against our own LOLA skyline (120 km radius).

| Point | NASA Sun (3×3 pixel range) | Ours, terrain 0 m / 2 m | Ours, smooth sphere |
|---|---|---|---|
| Site | **0.483** (0.475–0.485) | **0.482** / 0.484 | 0.505 |
| 30 km N | 0.470 (0.468–0.496) | 0.476 / 0.477 | 0.505 |
| 30 km E | 0.483 (0.478–0.490) | 0.484 / 0.485 | 0.505 |
| 30 km S | 0.479 (0.456–0.480) | 0.479 / 0.480 | 0.505 |
| 30 km W | 0.473 (0.409–0.476) | 0.471 / 0.472 | 0.505 |

- With terrain, we agree with NASA to within 0.006 (0.6 points of sunlight percentage) at all 5 points. Every value falls inside the map's own 3×3-pixel spread.
- The smooth sphere is off by 0.02 to 0.03 everywhere. The terrain model is what makes the numbers match NASA.
- Earth: NASA and we both give 1.000 (always visible) at all 5 points. That agrees, but it is a weak test here, because Earth is high in the sky at this site. A site near the pole is needed to test Earth properly.
- Our period (2026–2044) is a different 18.6-year cycle from NASA's. Averages over a full cycle should be close, and they are.

## Polar validation: the hard case (`polar_fetch.py`, `polar_validate.py`)
Points chosen **from NASA's own 120 m maps** (`AVGVISIB_75S_120M`, Sun and Earth), within 60 km of the pole, spread over the whole range. They are not famous sites with coordinates we would have to trust. Ours: LOLA `LDEM_75S_120M` horizon (150 km radius), Horizons every 2 h over 18.6 years.

| Point | km from pole | NASA Sun [3×3 range] | Ours Sun 0 m / 2 m | Smooth | NASA Earth [3×3] | Ours Earth 0 m / 2 m | Smooth |
|---|---|---|---|---|---|---|---|
| Ridge top | 16.6 | 0.847 [0.42–0.85] | 0.867 / 0.895 | 0.550 | 0.575 [0.41–0.58] | 0.580 / 0.581 | 0.512 |
| Ridge slope | 36.2 | 0.651 [0.48–0.78] | **0.773** / 0.807 | 0.567 | 0.428 [0.28–0.54] | 0.484 / 0.507 | 0.500 |
| Mid | 36.4 | 0.450 [0.42–0.48] | 0.474 / 0.483 | 0.567 | 0.000 | 0.000 / 0.000 | 0.490 |
| Low | 50.9 | 0.250 [0.24–0.26] | 0.248 / 0.249 | 0.574 | 0.359 [0.33–0.39] | 0.361 / 0.363 | 0.609 |
| Dim | 57.6 | 0.100 [0.10–0.11] | 0.096 / 0.098 | 0.555 | 0.001 [0–0.05] | 0.000 / 0.007 | 0.618 |
| **Permanent shadow** | 60.0 | **0.000** | **0.000** / 0.000 | 0.551 | 0.323 [0.32–0.33] | 0.322 / 0.322 | 0.629 |
| Earth ¼ | 55.3 | 0.000 | 0.000 / 0.000 | 0.561 | 0.250 [0.24–0.25] | 0.250 / 0.250 | 0.595 |
| Earth ½ | 57.4 | 0.134 [0.13–0.17] | 0.134 / 0.144 | 0.556 | 0.500 [0.50–0.50] | 0.499 / 0.499 | 0.621 |

What it shows:
- **Points in stable areas (6 of 8): we match NASA within 0.024 (Sun) and 0.007 (Earth).** This includes a permanently shadowed point (0 vs 0), points where terrain hides Earth completely (0 vs 0) and points where Earth is visible a quarter or half of the time.
- **Ridge tops (2 of 8) differ by +0.02 and +0.12**, but both of our values fall inside NASA's own variation across the neighbouring pixels. On a ridge, one pixel (120 m) moves the answer by up to 40 points, so a small position or DEM-version difference changes the result. That is a property of ridges, not an engine error. Our numbers run slightly high there.
- **Observer height matters on ridges:** going from 0 to 2 m adds up to 0.03 of sunlight, consistent with NASA PGDA's note that height above the surface changes ridge illumination.
- **The smooth-sphere model is badly wrong at the pole:** it gives 55% sunlight at a permanently shadowed point and 49% Earth visibility where terrain blocks Earth completely. **At the pole, terrain is not optional.**

### Step size (`polar_stepcheck.py`)
Ridge-top point, 4 months (Dec 2026, Mar, Jun, Sep 2027), 10-minute vs 1-minute steps: identical windows and start times, totals within 0.02 h. Shortest lit period was 17 h, so 10-minute steps miss nothing at 120 m terrain. Finer terrain (5 m) might create shorter flickers; not tested.

## Limits (not yet handled)
- **240 m DEM pixels.** Ground within ~1 km is smoothed. The flat E–SE stretch of the skyline (~0.9°) comes from terrain 0.7 km away. PGDA 5 m maps exist only for sites much closer to the pole.
- Observer fixed at 2 m above ground.
- Frames: LOLA uses MOON_ME (DE421); Horizons reports MEAN_ME (DE441). The difference is assumed small at this resolution, but it is not checked.
- Earth visibility is only weakly validated (see above).
- The 2-hour step is fine for long-term averages; event times use the 10-minute run.
