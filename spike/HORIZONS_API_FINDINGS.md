# JPL Horizons API: what it can do (tested, not assumed)

Tested 13 Nov 2026 against `https://ssd.jpl.nasa.gov/api/horizons.api` (API version 1.2). Every claim below comes from a real response saved in `spike/raw/`. Scripts: `q1.py` to `q4.py`, helper `hz.py`.

Test points: `(lon 0°E, lat -89.5°)`, a south-pole test point and **not** a real landing site; Apollo 11 `(23.473°E, 0.674°N)`; a far-side point `(177.6°E, -45.4°)`.

## 1. What works

| Need | Works? | How | Evidence |
|---|---|---|---|
| Observer standing on the Moon | Yes | `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='E-lon,lat,alt_km'` | q1 |
| Sun azimuth and elevation | Yes | `COMMAND='10'`, `QUANTITIES='4'` | q1 |
| Earth azimuth and elevation | Yes | `COMMAND='399'`, `QUANTITIES='4'` | q2a |
| Sun up / Earth up flag | Yes, smooth sphere only | Marker columns, see section 3 | q2, q4i |
| Angular size, distance | Yes | `QUANTITIES='4,13,20'` | q2a, q2b |
| CSV instead of fixed-width columns | Yes | `CSV_FORMAT='YES'` | q2 |
| Rise, transit and set events only | Yes | `R_T_S_ONLY='TVH'` with `STEP_SIZE` 1 to 9 min | q3d |
| Custom rise/set angle | Yes, **one angle for all directions** | `ELEV_CUT='2'` | q3e |
| Specific times instead of a range | Yes | `TLIST='2026-12-01 00:00' '...'`, `TLIST_TYPE='CAL'` | q4k |
| Far future dates | Yes, 2035 tested | Ephemeris DE441 | q4m |
| Clear error for bad input | Yes | JSON gets an `error` key | q4l |

## 2. What it does NOT do

| Limitation | Evidence | Consequence for us |
|---|---|---|
| **No terrain.** The Moon is a sphere of radius 1737.4 km (header: `Center radii`). | q1 header | Real sunrise and sunset behind mountains need our own horizon from LOLA. |
| **Elevation is measured from the flat local plane.** Raising the site from 0 to 5 km changed Sun elevation by only 0.000001°. | q4i | Elevation alone cannot say "visible". We compare it with a horizon we compute. |
| **Rise/set cut-off is one angle for every azimuth.** | q3e | It cannot model a horizon that is higher in some directions than others. |
| **No CORS header** (`Access-Control-Allow-Origin` absent, even with an `Origin` header). | q4 H2 | **The browser cannot call Horizons.** The backend must proxy it, or we serve pre-computed files. |
| **At most 90,000 time steps per request.** Error text: `Output length exceeded, 131400 times requested, max. is 90000` | q3g | Split long ranges into chunks, for example 30 days at 1-minute steps (43,201 rows). |
| One target per request | design of the API | Sun and Earth need 2 requests per site and range. A Sun request does carry an Earth-up flag. |
| No battery, power or comms model | n/a | Power and comms metrics are ours to define and compute. |

## 3. The data shape

### 3.1 The HTTP response
```json
{
  "signature": {"source": "NASA/JPL Horizons API", "version": "1.2"},
  "result": "<one large text block>"
}
```
On error there is also `"error": "Geodetic latitude not in the range -90 to 90 degrees"`. Content-Type is `application/json`.

### 3.2 Inside `result`
1. Body description, which can be turned off with `OBJ_DATA='NO'`.
2. A header block. Useful lines:
   - `Center geodetic : 0.0, -89.5, 0.0 {E-lon(deg),Lat(deg),Alt(km)}` echoes our input;
   - `Center pole/equ : MEAN_ME`, `Center radii : 1737.4, 1737.4, 1737.4 km`;
   - `Atmos refraction: NO (AIRLESS)`, `Target body name: Sun (10) {source: DE441}`.
3. The data table between the lines `$$SOE` and `$$EOE`.
4. A "Column meaning" footer.

### 3.3 Table rows (CSV, `QUANTITIES='4,13,20'`)
```
 Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app),  Ang-diam,             delta,     deldot,
$$SOE
 2026-Dec-01 00:00,*, , 280.050784,     1.557451,  1945.048,  0.98633151817890, -1.2237800,
$$EOE
```

| # | Column | Meaning | Unit |
|---|---|---|---|
| 1 | `Date__(UT)__HR:MN` | Time, UTC. Format `YYYY-Mon-DD HH:MM`; TLIST output adds `:SS.fff` | UTC |
| 2 | solar marker | `*` = **Sun upper limb on or above the horizon**; blank = night | flag |
| 3 | interferer marker | `i` = **Earth upper limb on or above the horizon** (Earth is the "interfering body" for a Moon observer) | flag |
| 4 | `Azi_(a-app)` | Azimuth of the target **centre**, clockwise from north | degrees |
| 5 | `Elev_(a-app)` | Elevation of the target **centre** above the local horizontal plane, airless | degrees |
| 6 | `Ang-diam` | Angular diameter (quantity 13) | **arcseconds** |
| 7 | `delta` | Distance (quantity 20) | au |
| 8 | `deldot` | Range rate | km/s |

Parsing notes:
- Rows start with a space and end with a trailing comma.
- Marker columns are single characters or blank.
- In rise/set mode, column 3 holds the event letter (`r` rise, `t` transit, `s` set) instead of the Earth flag.
- **Also in normal tables with steps under 30 minutes:** on the row just after a target event, column 3 holds `r`, `e` (max elevation), `t` or `s` *instead of* the Earth flag. Found in the spike run (4 of 4,321 rows). The parser reports `earth_flag = None` and puts the event in `event`.

### 3.4 How the flags behave (measured)
- The flags are the smooth-sphere answer **including the horizon dip from height**. At 0 km the Earth flag was blank. At 1 km and 5 km it became `i` while the elevation numbers stayed the same (q4i).
- Rise/set uses the upper limb. Apollo 11 sunrise was reported at centre elevation -0.24°, about the Sun's angular radius (q3d).

### 3.5 Values we measured
| Item | Value |
|---|---|
| Sun angular diameter from the Moon | ~1945″ = 0.54° (radius 0.27°) |
| Earth angular diameter from the Moon | ~6988″ = 1.94° (radius 0.97°) |
| Sun elevation at the test point, 1 Dec 2026 | +1.56° and falling slowly, azimuth moving about 0.5° per hour |
| Earth elevation at the test point, 1 Dec 2026 | -1.1° to -1.3° (below the horizon) |
| Sun at the test point, 1 Jun 2027 | -1.77° (south-pole winter) |
| Earth at the far-side point, Dec 2026 | -38° to -51°: **never visible**, as expected |
| Apollo 11 lunar day | Sunrise 14 Dec, transit 22 Dec at 88°, sunset 29 Dec 2026 |

## 4. Speed (from this machine)

| Request | Rows | Size | Time |
|---|---|---|---|
| 1 day, 1-hour steps | 25 | small | 0.65 to 0.76 s |
| 60 days, rise/set only | 6 events | small | 0.95 s |
| 30 days, 1-minute steps | 43,202 | 2.1 MB | 5.85 s |

A per-request round trip is fast, but large tables take seconds. For the app's "rapid comparison" goal, pre-compute curated sites and cache any custom query.

No rate-limit headers were returned. We did not test heavy parallel use and should not.

## 5. What this means for our design
1. **Backend proxy is required.** No CORS means the browser cannot call Horizons. This answers risk 1 in the plan.
2. **Two requests per (site, time range):** Sun (10) and Earth (399), with `QUANTITIES='4,13'` and `CSV_FORMAT='YES'`. Chunk ranges at 90,000 steps or fewer.
3. **Step size:** the Sun moves about 0.5° of azimuth per hour near the pole. A 10-minute step keeps sunset error under 10 minutes before interpolation.
4. **Visibility rule, ours:** `upper_limb_elev = Elev + Ang-diam/2/3600`. A body is visible when `upper_limb_elev > horizon(azimuth)`. For the smooth sphere, `horizon = 0`, which matches the Horizons flags and is our first unit test. For real terrain, `horizon(az)` comes from LOLA.
5. **Validation:** our smooth-sphere visibility must equal the `*` and `i` flags row by row.
6. **Rise/set mode** is useful as a cross-check only, because of the single cut-off angle.

## 6. Proposed normalized shape (what our backend would send to the UI)
A proposal for the JSON contract (T18). Not final.
```json
{
  "site": {"name": "test-point", "lon_e": 0.0, "lat": -89.5, "alt_km": 0.0},
  "range": {"start": "2026-12-01T00:00Z", "stop": "2026-12-31T00:00Z", "step_min": 10},
  "source": {"ephemeris": "JPL Horizons API 1.2, DE441", "terrain": "none (smooth sphere)"},
  "samples": [
    {"t": "2026-12-01T00:00Z",
     "sun":   {"az": 280.0508, "el": 1.5575, "radius_deg": 0.270, "visible": true},
     "earth": {"az": 6.6684,   "el": -1.1136, "radius_deg": 0.970, "visible": false}}
  ]
}
```

## 7. Still to check
- Pick real curated site coordinates and re-run. The test point is synthetic.
- Confirm with a mentor that the Horizons frame (MEAN_ME) and LOLA's frame (MOON_ME, DE421) agree well enough at our accuracy.
- Measure how long the full pre-compute for all curated sites takes.
