# SELENE: handover

Lunar Landing Site Navigator for **NASA Space Apps Cairo 2026, Challenge 11**. Written 14 Nov 2026 for whoever continues the project. Read this file first; everything else is linked from here.

---

## 1. What the project does, in one paragraph

Near the Moon's south pole the Sun skims the horizon, so a single hill can hide it, or hide Earth, for days. SELENE tells a planner, a teacher or a curious visitor, for any of 12 sites and any landing date from Dec 2026 to Jan 2028:
- **When the Sun is above the real horizon** (solar power), with the longest dark spell.
- **When Earth can be reached** through NASA's Deep Space Network, two-way or listen-only.
- **Time left at touchdown** until sunset and until Earth contact ends.
- **What a launch slip does**, the **best dates** for a site, the **best sites** for a date, and side-by-side **comparison**.

The verdict (Good / Marginal / Poor) is based on **light and Earth contact only**. A battery simulator exists as an **optional** power check.

The challenge text is in `ref/nasachall11.pdf`.

---

## 2. Start it on your machine (about 5 minutes)

You need Node 18+ and npm. Python 3.12 is needed only to rebuild data (section 5).

```bash
git clone https://github.com/yossefhady/selene-lunar-navigator.git
cd selene-lunar-navigator/web
npm install
npm run dev            # open the printed http://localhost:5173
```

The app runs fully from the data files already in `web/public/data/`. No downloads and no keys are needed.

Checks:
```bash
cd web && npx vitest run && npx tsc -b --noEmit && npx vite build     # 149 tests
cd spike && python3 -m pytest -q --cov=lunar                          # 85 tests, 88% coverage
```

**3D needs WebGL.** Use normal Chrome, Edge or Firefox. If WebGL is off, Home falls back to a flat polar map, and the 3D card shows a message instead.

### Optional: Luna's AI answers (free Gemini)
Luna, the guide character in the bottom-left corner, works without any AI. Her tips come from the page's own numbers. To let her answer free-text questions:
1. Get a free key at Google AI Studio (aistudio.google.com → "Get API key").
2. Run `GEMINI_API_KEY=your-key node server/assistant.mjs` (port 8787). The Vite dev server forwards `/api/assistant` to it.
3. If the default model name `gemini-2.0-flash` no longer exists, set `GEMINI_MODEL` to a free Flash model that AI Studio lists.

Details are in `server/README.md`. The key stays on the server. The server checks input, limits each visitor to 8 questions a minute, and the website **refuses any AI answer that contains a number not shown on the page** (`web/src/lib/guide.ts`, `safeAnswer`).

---

## 3. How it works

```
 JPL Horizons API ──► Sun & Earth az/el every 10 min, from each site on the Moon ─┐
 NASA DSN dishes  ──► Horizons again: each 70 m dish seen from the site, and the site from the dish ─┤
 NASA LOLA DEMs   ──► real skyline, 0.05° steps, 5 m near the site to 240 m out to 150 km ─┤
                                                                                     ▼
            spike/build_dataset.py  (Python, offline, cached)  ──►  web/public/data/year_<site>.json
            spike/export_heightmaps.py                          ──►  web/public/data/height_<site>.json
                                                                                     ▼
            web/ (React + three.js) loads one ~550 KB file per site; all analysis runs in the browser
```

### The rules the engine uses, and why
| Rule | Choice | Why |
|---|---|---|
| Sun visible | **Any part of the disc** above the terrain skyline | NASA's illumination maps use the same rule, and a panel gets power from a partly visible Sun. A test showed the old "top point above centre" rule moved polar sunrise and sunset times by up to 18 min |
| Earth contact | A NASA DSN 70 m dish (Goldstone, Canberra, Madrid; positions from the NAIF kernel) is above the lander's skyline **and** the Moon is ≥ 10° up at the dish | DSN handbook 810-005 module 101: no transmission below 10°. Two-way link |
| Listen-only | Dish 6–10° up | Module 302: dishes cannot point below 6°. Data comes home, but no commands can be sent |
| Verdict | Worse of **light** (good: Sun ≥ 80% and longest dark ≤ 24 h; marginal: ≥ 50% and ≤ 72 h) and **contact** (good: link ≥ 30% and longest silence ≤ 24 h; marginal: ≥ 10% and ≤ 120 h) | Our own rule of thumb, labelled as such in the app. Not a NASA standard |
| Battery | Optional energy bookkeeping with illustrative lander classes | The challenge asks for Sun and Earth windows, not battery design. Kept as an optional check |
| Lander height | 2 m (deck); a separate 10 m "mast" skyline exists | NASA plans solar masts at the pole; a mast sees over nearby hills |

### Traps we found (don't fall in again)
- **Horizons column 3:** with steps under 30 min it holds the Sun's rise/transit/set letter, not the Earth flag. The parser handles it (`spike/lunar/horizons.py`).
- **LOLA polar formula is mirrored** in the catalog `DSMAP_POLAR.CAT`. We follow its text and inverse instead, which we proved against the global map (correlation 0.986 vs −0.08 mirrored).
- **Horizons treats the Moon as a smooth ball.** Terrain is our job. Without terrain, polar results are wrong by up to 62 points.
- **Horizons has no CORS header,** so the browser can't call it. That's why we precompute.
- **A surface point can be a Horizons target:** `COMMAND='g: lon,lat,alt @399'`. That's how the DSN dishes are done.

---

## 4. What was checked and how (validation)
- Smooth-Moon visibility vs Horizons' own flags: **0 mismatches** in 8,638 rows.
- vs NASA's 18.6-year illumination maps (Mazarico et al. 2011): **6 of 8 polar test points within 2.4 points**, including permanent shadow and fully blocked Earth. The two ridge-top points (off by 2 and 12 points) are within NASA's own pixel-to-pixel range.
- The 8 Artemis sample points: our 14-month sunlight is within 5 points of NASA's map at 7 of 8. Slater Plain is the exception (+9) and also the least certain location.
- Time step: 10-min vs true 1-min Horizons positions give identical flip times. A skyline every 0.01° vs 0.05° moves times by ≤ 1.8 min.

Full numbers are in `ACHIEVEMENTS.md`, figures in `figures/`, and scripts in `spike/` (`polar_validate.py`, `sky_sensitivity.py`, `flip_check.py`).

**Honest gap:** the NASA-map comparison was run with the first engine (120/240 m terrain, centre-point rule). The current engine (5–20 m terrain, whole-disc rule) has not been re-run against the NASA maps.

---

## 5. What is NOT in the repo, and how to get it back

| Missing | Size | How to regenerate |
|---|---|---|
| `spike/fine/` (LOLA DEM windows + Horizons/DSN tables) | ~1.2 GB | `cd spike && python3 build_dataset.py` downloads only what it needs from NASA PDS and JPL. First run takes about 30–60 min depending on the connection; later runs take about 3 min from cache |
| `spike/polar/`, `spike/dem/` (first-engine bands used by validation) | ~210 MB | `python3 polar_fetch.py`, `python3 fetch_dem.py` |
| `node_modules/`, `web/dist/` | | `npm install`, `npx vite build` |
| `ref/c.html`, the saved ScienceBase page | | Saved third-party pages. One has an embedded Google key that isn't ours, so they were left out on purpose |
| `LUNA-OPS-fixed.html` | | Unknown origin. Never used. Ask the owner before using it |

Python packages for `spike/`: `numpy`, `matplotlib`, `pytest`, `pytest-cov` (plus `playwright` only for the screenshot scripts).

Rebuild order after changing the engine:
```bash
cd spike
python3 pick_sites.py          # sample points for the Artemis regions (data/named_sites.json)
python3 build_dataset.py       # year_*.json, sweep_*.json, terrain_*.json/png
python3 export_heightmaps.py   # height_*.json for the 3D view (150 km, 401 x 401)
```

---

## 6. Where things live

| Path | What |
|---|---|
| `spike/lunar/` | Engine: `horizons.py` (API client), `terrain.py` (LOLA grid), `fine.py` (layered skyline, whole-disc rule, slope, height grid), `visibility.py` (windows), `stations.py` (DSN link) |
| `spike/build_dataset.py` | Builds all site data. Site list and terrain layers are at the top |
| `spike/pick_sites.py` | Artemis III sample points: anchor = centre of LROC's region mosaic, then the best-lit 120 m pixel within 8 km |
| `contract/CONTRACT.md` | Data format, v1 → v1.3 (latest sections at the bottom) |
| `web/src/lib/` | Pure logic with tests: `analysis` (clip windows), `verdict` (light + contact), `answer` (plain sentences), `rank` (best dates/sites), `power` + `suggest` (optional battery), `guide` (Luna + number guard), `heightmap` |
| `web/src/selene/` | Pages and components: `Home`, `PlanPage`, `BestDates`, `BestSites`, `ComparePage`, `MethodPage`, `Terrain3D`, `MoonGlobe3D`, `Luna`, `theme.css` (look) |
| `server/assistant.mjs` | Gemini proxy for Luna (no dependencies) |
| `design/UX_SPEC*.md` | The UX specs the app was built from |
| `ACHIEVEMENTS.md` | Every result with numbers |

Older docs (`HANDOFF_PROMPT.md`, `FRONTEND_HANDOFF.md`, `APP_SCREENS.md`, `PRODUCT.md`, `DESIGN.md`) describe earlier stages and are partly out of date. Trust this file and `ACHIEVEMENTS.md`.

---

## 7. Still open (most useful first)
1. **Gemini key:** Luna's free-text answers need a key (section 2). Not tested with a real key yet.
2. **Official region outlines:** download `A3_9regions-lonlat-simplified.zip` (622 KB) from the USGS ScienceBase item for DOI 10.5066/P1MEQ6UK (it needs a browser "verify you are human" click). Check each sample point falls inside its region, and re-pick any that don't (`pick_sites.py`). Our points come from LROC mosaic centres, so they're close but not proven to be inside.
3. **Re-validate the current engine** against NASA's maps (section 4 gap).
4. **Custom coordinates:** needs a small backend that runs the pipeline for one point (about 1.5–2 min the first time, then cached). Today only the 12 precomputed sites work, and the app says so.
5. **Deploy** (section 8).
6. **Clean-up:** `web/public/data/scenario_*.json` (660 files, 76 MB) and `sweep_*.json` are no longer used by the app and can be deleted, which roughly halves the data size. `year_nobile_rim.json` is a stale leftover from an old site id. `three` makes the JS bundle 744 KB, so consider code-splitting the 3D views.
7. **Phone layout** is not tested.
8. **Illustrative numbers:** lander classes and radio speeds are labelled illustrative. Replace them with sourced values if you want them in the main story.
9. **Two regions share one point each:** Mons Mouton with Nobile Rim 1, and Mons Mouton Plateau stands alone. Slater Plain has no LROC mosaic and is the least certain location.

---

## 8. Publishing on a real site: what it takes and how fast it is

**Easiest:** the app is a static site. Run `cd web && npx vite build`, then upload `web/dist/` (about 97 MB with data, about 20 MB after the clean-up in item 6) to any static host: GitHub Pages, Netlify, Cloudflare Pages or Vercel.
- **Setup time:** about 15–30 minutes the first time. Each later deploy is a 2-second build plus the upload.
- **For visitors:**
  - First load: about 0.8 MB of JavaScript, plus about 550 KB of data for the chosen site (about 150 KB compressed). Typically 1–3 s on a normal connection.
  - After that, every analysis, ranking and comparison runs in the browser: a few milliseconds, and about 0.5 s for "Best dates" (about 400 simulated landings).
- **Luna's AI:** host `server/assistant.mjs` on any free Node host (for example Render or Railway), with `GEMINI_API_KEY` set as a secret. Or run it with `STATIC_DIR=web/dist` so one server serves both the site and the AI. An AI answer takes about 1–3 s.
- **A brand-new location** would need the backend from open item 4: about 1.5–2 min the first time, instant after caching.

---

## 9. Data sources (cite these)
- JPL Horizons API (DE441), ssd.jpl.nasa.gov.
- NASA LRO LOLA polar DEMs and illumination maps (PDS Geosciences; Mazarico et al. 2011).
- NASA DSN Telecommunications Link Design Handbook 810-005, modules 101 and 302 (copies in `ref/dsn/`).
- NAIF `earth_topo_260717.tf`: DSN antenna positions.
- NASA Artemis III candidate regions (Oct 2024 update).
- LROC low-Sun NAC region mosaics (region centres).
- USGS Gazetteer of Planetary Nomenclature.

AI use: the code, data pipeline and docs were developed with Claude (Anthropic) as a coding assistant. Luna's optional answers use Google Gemini. State both in the submission.
