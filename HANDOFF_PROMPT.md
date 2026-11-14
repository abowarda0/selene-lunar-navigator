# Continuation prompt: Lunar Landing Site Navigator

> Paste everything from "PROMPT START" to the end into a new chat. It is self-contained.
> State as of **Sat 14 Nov 2026, 00:45 Cairo time**. For the full record of what is built and proven, read `ACHIEVEMENTS.md` first.

---

## PROMPT START

You are continuing work on our team's entry for **NASA Space Apps Cairo 2026**, challenge **"Lunar Landing Site Navigator"** (Challenge 11). I am Engineer B: **backend, data and AI**, and I am now also doing the **UI/UX and frontend**. The project folder is `/home/yossef/nasa`. Read the files listed below before changing anything; don't assume what's in them.

How I want you to work:
- Verify, don't assume. When something can be tested (an API, a file format, a formula), test it with real data and say what you found.
- Test-first for code (pytest for Python, vitest for the web app), with 80%+ coverage.
- Explain in plain English. Be honest about what is not done or not verified.
- Work in order of the deadlines below. Hard and risky work before 12:30 AM; after 4:00 AM only low-risk fixes.

### 1. The challenge (official text, saved in `ref/nasachall11.pdf`)
Missions to the Moon's south pole face extreme lighting and communication limits. Build an intuitive tool that lets **mission planners, educators and the public compare landing sites and dates quickly**, showing **Sun and Earth positions relative to the horizon** to judge **solar power** and **direct-to-Earth communication windows**. Key ideas from the text:
- Rapid **scenario comparison**: when a launch slips or hardware is late, planners must check alternative dates at the same site or nearby sites on the same date.
- Show **time remaining until sunset or Earthset**.
- No atmosphere: the horizon is set by **local terrain and the curvature of the Moon**. Use **LOLA** topography. Consider **libration**.
- Official resources: **JPL Horizons** (the only computational source), **LROC Quickmap** (moved to `quickmap.lroc.im-ldi.com`), **Moon Trek**, and the **CSA Moon portal** (context only, no data).

### 2. Our solution (team whiteboard)
1. Get Sun and Earth azimuth and elevation from the **JPL Horizons API**.
2. Get the horizon line.
3. Get the mountain details from **LOLA** terrain data.
4. Fuse them to get the **real horizon** (skyline).
5. Analyse **when the Sun and Earth are up** (above the real skyline).
6. **Compare** more than one scenario and pick the best.
7. **Delay problem:** replan with a new date, as risk management.

### 3. What is DONE and VERIFIED
**Backend engine** (`spike/`, Python, 55 pytest tests, 87% coverage, `cd spike && python3 -m pytest -q --cov=lunar`):
- `lunar/horizons.py`: Horizons API client for an observer on the Moon. It splits long ranges under the 90,000-step limit and parses the CSV output.
- `lunar/visibility.py` (first engine, used for the NASA validation): visible when the disc's top point is above the horizon in its direction. The app data now uses the **whole-disc rule** (`fine.disc_margin_deg`: visible when any part of the disc clears the skyline). Computes rise/set times (interpolated), windows, Sun-and-Earth overlap and visible fraction.
- `lunar/terrain.py`: LOLA polar stereographic grid, HTTP-Range download of only the needed DEM lines, bilinear sampling, horizon profile (720 directions, up to 150 km, includes the Moon's curvature).
- `lunar/fine.py` (newer): layered terrain (5 m near the site to 120 m far away), skyline every 0.05°, visibility every minute. **Not yet validated against NASA's maps**; the validation below used the 120/240 m engine.
- `build_dataset.py`: builds the app data with the fine engine: 4 sites × 55 start dates (1 and 15 Dec 2026, every Friday of 2027), plus a sweep file and a terrain file per site, into `web/public/data/`. Cache in `spike/fine/` (190 MB).

**Horizons API facts (tested, see `spike/HORIZONS_API_FINDINGS.md`):**
- An observer on the Moon works: `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='E-lon,lat,alt_km'`.
- `QUANTITIES='4,13'` gives azimuth, elevation and angular diameter; use `CSV_FORMAT='YES'`.
- Airless, Moon = sphere of radius 1737.4 km, **no terrain**. Elevation is measured from the flat local plane.
- **No CORS header**: the browser cannot call it, so the backend must.
- At most 90,000 time steps per request. About 0.7 s per small request, about 6 s for 43k rows.
- Column 3 is the Earth-visible flag `i`, **but with steps under 30 min it holds the Sun's event letter (`r`/`e`/`t`/`s`) on the row after an event**. The parser handles this (`earth_flag=None`, `event=...`).
- Rise/set mode uses one cut-off angle for all directions, so it is useless with real terrain.

**LOLA facts:**
- Polar float DEMs on PDS (`pds-geosciences.wustl.edu/.../lola_gdr/polar/float_img/`): `ldem_60s_240m` (n=7760) and `ldem_75s_120m` (n=7624). Heights in km relative to 1737.4 km.
- **Trap:** the catalog `DSMAP_POLAR.CAT` has a lat/lon→pixel formula that is **mirrored** relative to its own text and inverse. We follow the text and inverse (south: lon 0 up, 90°E right). This is proven against the global LOLA grid: correlation 0.986, versus −0.08 mirrored.

**Validation (see `spike/README.md` and `figures/`):**
- Smooth-Moon visibility vs Horizons' own flags: **0 mismatches** in 8,638 rows.
- Chandrayaan-3 site (69.373°S, 32.319°E), Dec 2026: terrain moves sunrise **+5.1 h** and sunset **−10.3 h**; Sun up 356.5 h of 720.
- **Against NASA's long-term illumination maps** (Mazarico et al. 2011, `AVGVISIB_*`):
  - At 69°S, 5 points: within 0.006.
  - **Near the pole, 8 points picked from NASA's own map:** 6 of 8 within 2.4 percentage points, Sun and Earth, including permanent shadow (0 vs 0) and Earth fully blocked (0 vs 0).
  - The 2 ridge-top points differ by 2 and 12 points, both inside NASA's own neighbouring-pixel range.
- **Without terrain, the error near the pole reaches 62 points.** Terrain is essential.
- 10-minute steps vs 1-minute: identical windows over 4 months at a polar ridge.

**Contract and data:**
- `contract/CONTRACT.md` (API v1): `GET /api/sites`, `GET /api/scenario?site&start&days`. Envelope `{ok, data, error}`. Scenario data has `scenario, source, now, metrics, verdict, windows, horizon, series, notes`.
- Contract v1.1 (proposed, additive): `/api/sweep`, `/api/terrain`, flicker fields.
- `web/public/data/`: 220 scenarios, 4 sweeps, 3 terrain files. Ridge top: 33 good / 22 marginal weeks, both-up 9.8–60.0%. Polar plain: Earth never visible, all poor.

**Frontend** (`web/`, React 18 + Vite + TypeScript, 48 vitest tests passing):
- Views: `SitesView`, `SurveyView`, `CompareView`, `AboutView`.
- Components: `SkyDome`, `PolarPlat`, `Charts`, `Explain`.
- Reads static JSON from `web/public/data/`.
- Design system in `DESIGN.md` ("survey sheet" look) and product notes in `PRODUCT.md`.
- A clickable prototype is in `design/`.

**Docs:** `FRONTEND_HANDOFF.md` (field meanings, edge cases, glossary), `ref/RESOURCES_ANALYSIS.md`, team results page (private Claude artifact; share before others can open it): https://claude.ai/artifact/VRmK3hWDWUCYWwXxpiSAeD

### 4. What is OPEN (most urgent first)
1. **Nothing is in git.** Create the repo and push now: `spike/` (without `spike/dem`, `spike/polar`, `spike/raw`; about 210 MB of cached downloads that scripts re-fetch), `contract/`, `web/` (without `node_modules`, `dist`), the docs and `figures/`.
2. **Validate the fine engine** against NASA's maps at the 8 polar test points (reuse `polar_validate.py` with `lunar/fine.py`). Until then, the validation claims apply to the 120/240 m engine only.
3. **Backend API not built or deployed.** It must serve pre-computed files, `/api/sites` and `/api/scenario`, with input validation and rate limiting. The frontend currently reads static files, which is acceptable for the demo if deployment is short on time.
4. **New features from the whiteboard (not in contract v1):**
   - **Best location for a date:** rank curated sites by both-up hours (or the verdict) for a given start and duration.
   - **Best date for a location:** the sweep files already hold one row per start date; ranking them is a sort.
   - **Delay / replan:** take a scenario and a delay in days, recompute, and show the differences versus the original.
   - Proposed endpoints: `GET /api/best-sites?start&days`, `GET /api/best-dates?site&from&to&days`. Add them to `CONTRACT.md` first.
5. **Verdict thresholds are placeholders** (good = both-up ≥ 40% and longest both window ≥ 72 h). There is no Engineer C: the team is me and you, so we define them.
6. **Curated site list:** currently 4 sites, and two are test points from NASA's map, not named regions. Add **Artemis III candidate regions** and other south-pole targets with **sourced coordinates** (NASA Lunar Surface Data Book) and check each. For terrain coverage: the 120 m band covers points within about 60 km of the pole; other sites need their own DEM band (`fetch_dem.py` pattern).
7. **Custom latitude/longitude** (Should): needs an on-demand DEM band and horizon per point, about 40 s the first time. Cache it. Without terrain, show the smooth-Moon warning.
8. **AI brief** (Must 4): a plain-language summary **written only from the computed numbers**, key on the server, cached answers for demo presets, template fallback. **Enforce in code** that every number in the AI text appears in the input JSON; otherwise use the template. The `Explain` component exists; check whether it is template-only.
9. **"Power info" add-on** (whiteboard): only as an optional estimate with user-entered panel watts and battery size, with assumptions shown. We have no lander specs.
10. Map for visual analysis: a polar basemap with site pins (the NASA illumination map or a LOLA hillshade work as background; the bands are already cached in `spike/polar/`).
11. `LUNA-OPS-fixed.html` ("CLPS Mission Browser") is in the folder with unknown origin and is not referenced. Ask before using or deleting it.
12. Deployment (free host), README with run steps, AI-use disclosure, 30-second video, submission.

### 5. Deadlines (Sat 14 Nov, Cairo time)
| Time | Gate |
|---|---|
| 12:30 AM | Must-haves complete (site and date view, compare, sky view, AI brief) |
| 4:00 AM | Stretch features merged or dropped |
| 7:00 AM | Feature freeze |
| 8:30 AM | Code freeze, record the demo |
| 10:30 AM | Video exported (30 s) |
| **12:00 PM** | **Team submits** (official deadline 1:00 PM) |
| 2–6 PM | Judging |

### 6. How to run
```bash
cd /home/yossef/nasa/spike && python3 -m pytest -q --cov=lunar   # backend tests
cd /home/yossef/nasa/spike && python3 run_spike.py                 # Chandrayaan-3 scenario, smooth vs terrain
cd /home/yossef/nasa/spike && python3 polar_validate.py            # NASA-map validation near the pole (~2 min)
cd /home/yossef/nasa/spike && python3 make_figures.py              # team figures into ../figures
cd /home/yossef/nasa/web && npx vitest run                         # frontend tests
cd /home/yossef/nasa/web && npm run dev                            # frontend dev server
```
Notes: Playwright's Python package needs `executable_path` pointing to `~/.cache/ms-playwright/chromium_headless_shell-1243/...`, because the installed browser build differs. `spaceappschallenge.org` fails TLS verification on this machine, so don't disable verification; use the Wayback Machine or ask me to paste content.

### 7. Start here
First tell me in a few lines what you see in the folder and confirm the open list above. Then start with item 1 (git), then item 2 (validate the fine engine), unless I say otherwise.
