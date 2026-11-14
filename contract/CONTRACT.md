# API contract v1: Lunar Landing Site Navigator

Owner: Engineer B (backend). Consumer: Engineer A (frontend). Status: **v1 for Gate 3**. Changes only at gates.

Mock files (real numbers from the validated spike, Chandrayaan-3 site, Dec 2026):
- `mock/sites.json`: response of `GET /api/sites`
- `mock/scenario_chandrayaan3_2026-12-01.json`: response of `GET /api/scenario`

## Architecture
```
Browser (A)  ──HTTP JSON──>  Backend (B)  ──>  pre-computed site files (Horizons + LOLA, built offline)
                                    └──────>  JPL Horizons API (custom coordinates only, cached)
```
- The browser never calls Horizons. Horizons sends no CORS header, so the browser would block it.
- Every number is computed by backend code. The AI brief (Sprint 3) only rewrites these numbers in words.

## Conventions
| Thing | Rule |
|---|---|
| Envelope | Every response is `{"ok": true, "data": ..., "error": null}` or `{"ok": false, "data": null, "error": {"code": "...", "message": "..."}}` |
| Time | ISO 8601 UTC strings, minute precision: `"2026-12-13T18:59Z"` |
| Angles | Degrees. Azimuth clockwise from north (0 = N, 90 = E). Elevation above the local horizontal plane. |
| Durations | Hours, 1 decimal |
| Longitude | East-positive, 0 to 360 |
| "Never in range" | `null` plus a reason in `notes`, never a fake number |
| Visible | Any part of the disc is above the terrain skyline (whole-disc rule, NASA's illumination-map definition). Since 14 Nov; before, only the point above the disc's centre was tested |

## `GET /api/sites`
```json
{"ok": true, "error": null, "data": [
  {"id": "chandrayaan3", "name": "Chandrayaan-3 (Statio Shiv Shakti)", "lat": -69.373, "lon_e": 32.319,
   "kind": "landed", "terrain": true, "coord_source": "Wikipedia: Shiv Shakti Point", "verified": true}
]}
```
| Field | Meaning |
|---|---|
| `kind` | `"landed"` (past mission) or `"candidate"` (future target region) |
| `terrain` | `true` if a LOLA skyline is available (south of 60° S); `false` = smooth-sphere horizon |
| `verified` | We have checked the coordinate against its source |

## `GET /api/scenario?site=<id>&start=<ISO>&days=<1..60>`
Custom coordinates (Should): `GET /api/scenario?lat=&lon_e=&start=&days=`, smooth horizon only, slower.

The response `data`:

### `scenario`
`{"site": {...as in /sites...}, "start": "...", "stop": "...", "step_min": 10}`

### `source`
`{"ephemeris": "JPL Horizons API 1.2 (DE441)", "terrain": "LOLA LDEM_60S_240M (PDS)", "observer_height_m": 2.0}`

### `now`: the state at `start` (metric cards)
| Field | Type | Meaning |
|---|---|---|
| `sun_visible`, `earth_visible` | bool | Visible at `start` |
| `sun_el_deg`, `earth_el_deg` | number | Centre elevation at `start` |
| `sun_clearance_deg` | number | How far the highest visible part of the Sun's disc is above the terrain (negative = fully hidden) |
| `hours_to_sunset`, `hours_to_earthset` | number or null | If visible now: hours until it disappears. `null` = stays visible to the end of the range |
| `hours_to_sunrise`, `hours_to_earthrise` | number or null | If hidden now: hours until it appears. `null` = stays hidden |

### `metrics`: the whole range
| Field | Meaning |
|---|---|
| `sun_up_hours`, `sun_up_percent` | Total sunlit time |
| `earth_up_hours`, `earth_up_percent` | Total Earth-visible time |
| `both_up_hours`, `both_up_percent` | Sun and Earth visible together (power and comms) |
| `max_sun_clearance_deg` | Highest the Sun gets above the terrain |
| `longest_both_window_hours` | Longest continuous Sun-and-Earth window |

### `verdict`: provisional
`{"level": "good" | "marginal" | "poor", "reasons": ["..."], "rules": "..."}`
The thresholds are **provisional; we define the final rule**. Do not design around the exact rule, only the three levels.

### `windows`
`{"sun": [W], "earth": [W], "both": [W]}` where `W = {"start", "end", "hours", "open_start", "open_end"}`.
`open_start`/`open_end` = the window touches the edge of the range (it may continue outside it).

### `horizon`: for the sky view
`{"az_step_deg": 0.5, "elev_deg": [720 numbers]}`. `elev_deg[k]` is the terrain at azimuth `k * az_step_deg`. All zeros when `terrain` is false.

### `series`: for the timeline chart, columnar arrays of equal length
| Key | Meaning |
|---|---|
| `t` | Times |
| `sun_az`, `sun_el`, `earth_az`, `earth_el` | Positions, degrees |
| `terrain_under_sun`, `terrain_under_earth` | Horizon height in the direction of each body (draw it under the elevation line) |

The mock uses 60-minute steps (721 points) to keep it small. The real API uses 10 minutes.

### `notes`
List of strings: assumptions and caveats to show in the UI, for example "Terrain from 240 m LOLA map; ground within ~1 km is smoothed".

## Errors
| `code` | When |
|---|---|
| `bad_request` | Missing or invalid parameter (lat outside −90..90, days outside 1..60, bad date) |
| `unknown_site` | `site` id not in `/api/sites` |
| `upstream_unavailable` | Horizons did not answer (custom coordinates only) |

## Compare view
v1 has no compare endpoint: the frontend calls `/api/scenario` once per scenario (2 or 3) and shows the results side by side. Add an endpoint later only if this proves slow.

---

## Proposed v1.1 (for review by Engineer B; the frontend reads these when present)

Produced today by `spike/build_dataset.py` (fine engine, `spike/lunar/fine.py`). All v1 fields stay as they are; everything below is additive.

### Finer inputs
- Skyline every **0.05°** of azimuth from layered LOLA DEMs: 5 m (`LDEM_875S_5M`) to 6 km and 20 m (`LDEM_875S_20M`) to 30 km near the pole; 60 m (`LDEM_60S_60M`) to 30 km at Chandrayaan-3; then 120 m / 240 m to 150 km. Only a square window around each site is downloaded (HTTP multi-range).
- Visibility checked **every minute**: Horizons positions every 10 min, linearly interpolated to 1 min (Sun moves ~0.004°/min in elevation near the pole, so the interpolation error is far below the skyline error). Rise and set are interpolated to the second.

### `GET /api/scenario` additions
| Field | Meaning |
|---|---|
| `scenario.visibility_step_min` | Step used for windows and metrics (1). `scenario.step_min` stays the step of `series` (drawing only). |
| `metrics.sun_window_count`, `metrics.earth_window_count` | Number of separate windows in the range |
| `metrics.shortest_sun_window_hours` | Shortest closed Sun window, or `null` |
| `metrics.short_window_count` | Closed Sun or Earth windows shorter than 1 hour |
| `short_windows[]` | `{body, start, end, minutes}` for each of those short flashes |

### `GET /api/sweep?site=<id>&days=<n>` (new)
`{"site", "days", "rows": [{"start", "verdict", "sun_up_percent", "earth_up_percent", "both_up_percent", "sun_up_hours", "both_up_hours", "longest_both_window_hours", "sun_window_count", "earth_window_count", "short_window_count"}]}`, one row per start date (stored build: 1 and 15 Dec 2026, then every Friday of 2027).

### `GET /api/terrain?site=<id>` (new)
`{"site", "image", "half_width_m", "px", "height_min_m", "height_max_m", "dem": [...], "skyline_points": [{"az", "dist_m", "elev_deg"}], "provenance"}`. `image` is a north-up shaded-relief PNG centred on the site; `skyline_points` (every 1°) give where along each azimuth the skyline-forming terrain sits.

---

## v1.2 (14 Nov): Earth = a real link to NASA's Deep Space Network

Built by `spike/build_dataset.py` with `spike/lunar/stations.py` (15 tests, real Horizons replies as fixtures).

- **`earth_*` fields and `windows.earth` now mean a direct-to-Earth link**, not "Earth visible". A link exists when at least one DSN 70 m dish (DSS-14 Goldstone, DSS-43 Canberra, DSS-63 Madrid; coordinates from NAIF `earth_topo_260717.tf`) is **above the lander's terrain skyline** (the dish is a point on Earth's disc; Horizons gives its exact position with `COMMAND='g: lon,lat,alt @399'`) **and** the lander is at least **10°** above that dish's horizon. Source: NASA DSN Telecommunications Link Design Handbook 810-005, module 101 Rev. G, section 2: *"Transmission below 10 degrees elevation by any antenna at any frequency is not allowed."* (copy in `ref/dsn/101G.pdf`).
- The **Sun** keeps the whole-disc rule (any part of the disc gives power).
- `series.earth_az`/`earth_el` stay the **centre of Earth's disc**, for drawing.

| New field | Meaning |
|---|---|
| `source.earth_link_rule` | The rule above in words |
| `metrics.earth_view_percent` | Any part of Earth's disc above the skyline (context only) |
| `metrics.receive_only_percent` | Data from the lander can still be received (dish at least **6°**, the lowest it can point: module 302 Rev. C, Table 1, `ref/dsn/302C.pdf`), but no commands can be sent |
| `metrics.relay_needed_hours`, `relay_needed_percent` | Time with no direct DSN link: a relay satellite would be needed |
| `metrics.link_hours_by_station` | `{"DSS-14 Goldstone": h, ...}`; dishes overlap, so these can add to more than `earth_up_hours` |
| sweep rows: `earth_view_percent`, `receive_only_percent`, `relay_needed_percent` | Same, per start date |

Known effect: with the 10° floor the link has short handover gaps between dishes (median 8–14 min), so `longest_both_window_hours` is at most about 25 h and the provisional verdict rule (needs 72 h) never gives "good".

---

## v1.3 (14 Nov): yearly file additions for power planning

`year_<site>.json` (whole span, minute-accurate) gains:

| Field | Meaning |
|---|---|
| `windows.receive_only` | Moon→Earth data only: a DSN dish ≥ 6° (its lowest pointing angle) and above the lander's skyline |
| `windows.sun_mast10` | Sun visible (whole-disc rule) for solar panels on a **10 m mast** instead of 2 m. Terrain sites only |
| `site_facts.slope_deg` | Ground slope at the sample point: best-fit plane over a 40 m × 40 m patch of the finest LOLA DEM |
| `site_facts.slope_baseline_m`, `slope_dem_m` | Patch size and DEM pixel size used for the slope |
| `site_facts.observer_height_m`, `mast_height_m` | 2 m (lander) and 10 m (mast) |

### `height_<site>.json` (3D terrain, v1.3)
Built by `spike/export_heightmaps.py` from the same LOLA DEM windows as the skyline. `{site, half_width_m: 15000, n: 257, step_m: 117.2, h_min_m, h_max_m, missing_fraction, dem: [...], heights_b64, provenance}`. `heights_b64` = base64 little-endian int16 metres, row 0 = north edge, column 0 = west edge, heights relative to the site with the Moon's curvature drop included. Terrain sites only.
