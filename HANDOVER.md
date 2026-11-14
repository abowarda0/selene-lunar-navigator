# SELENE: handover

Lunar Landing Site Navigator for **NASA Space Apps Cairo 2026, Challenge 11**. Written 14 Nov 2026 for whoever continues the project. Read this file first; everything else is linked from here.

---

## 1. What the project does, in one paragraph

Near the Moon's south pole the Sun skims the horizon, so a single hill can hide it, or hide Earth, for days. SELENE tells a planner, a teacher or a curious visitor, for any of 12 sites and any landing date from Dec 2026 to Jan 2028:
- **When the Sun is above the real horizon** (solar power), with the longest dark spell.
- **When Earth can be reached** through NASA's Deep Space Network, two-way or listen-only.
- **Time left at touchdown** until sunset and until Earth contact ends.
- **What a launch slip does**, the **best dates** for a site, the **best sites** for a date, and side-by-side **comparison**.

The verdict (Good / Marginal / Poor) asks **does the mission fit inside the sunlight, and can it talk to Earth**. Every page explains the colours in plain words. A battery simulator exists as an **optional** power check.

The challenge text is in `ref/nasachall11.pdf`. The code is in the private GitHub repo `yossefhady/selene-lunar-navigator` (branch `main`). Ask the owner to add you as a collaborator.

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
cd web && npx vitest run && npx tsc -b --noEmit && npx vite build     # 150 tests
cd spike && python3 -m pytest -q --cov=lunar                          # 85 tests, 88% coverage
```

**3D needs WebGL.** Use normal Chrome, Edge or Firefox. If WebGL is off, Home falls back to a flat polar map, and the 3D card shows a message instead.

### Optional: Luna's AI answers (free Gemini)
Put the key in `server/.env` as `GEMINI_API_KEY=...` (git-ignored), then run `node server/assistant.mjs` from the repo root, next to `npm run dev`.

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
| Verdict | Worse of **light**: does the mission fit inside the sunlight? (good: no dark spell of an hour or more; marginal: one gap up to 12 h, usually at the start or end; poor: longer darkness) and **contact** (good: link ≥ 30% and longest silence ≤ 24 h; marginal: ≥ 10% and ≤ 120 h) | Matches how real missions are planned (Chandrayaan-3 landed at local sunrise for one lunar day). Our own rule, labelled as such in the app. Not a NASA standard |
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
| `web/src/lib/` | Pure logic with tests: `analysis` (clip windows), `verdict` (light + contact; **the thresholds live here as exported constants: change them only here**), `answer` (plain sentences), `rank` (best dates/sites), `now` (time to the next sunrise/sunset), `power` + `suggest` (optional battery), `guide` (Luna + number guard), `heightmap` |
| `web/src/selene/` | Pages and components: `Home`, `PlanPage`, `BestDates`, `BestSites`, `ComparePage`, `MethodPage`, `Tiles`, `Terrain3D`, `MoonGlobe3D`, `Luna`, `VerdictKey` (the colour explanation, built from the verdict thresholds and checked by a test), `SuggestCard`, `SiteCards`, `theme.css` (look; loaded last) |
| `server/assistant.mjs` | Gemini proxy for Luna (no dependencies) |
| `design/UX_SPEC*.md` | The UX specs the app was built from |
| `ACHIEVEMENTS.md` | Every result with numbers |

### What each page shows
| Page | Contents |
|---|---|
| **Home** | Full-width hero with the Mission Setup card (tabs: I have both / I have a site / I have a date) and a real 3D Moon. Click a pin to fly to a site and open its plan. A small preview card shows the hovered site's real terrain |
| **Plan** ("Mission Analysis.") | 1. Plain answer about light, then contact, with a hint when the mission doesn't fit the sunlight. 2. "What do Good, Marginal and Poor mean?" (expandable). 3. Launch-slip comparison ("What if launch is late?"). 4. Four tiles: Sunlight, Contact with Earth, **Time left at touchdown** (sunrise/sunset and Earth contact, in minutes under an hour), Ground slope. 5. 3D landing site: 150 × 150 km of real terrain lit by the true Sun, with Earth at its true position, a play button, Overview and Lander's-eye cameras, and a height switch (True / ×2 / ×4, default ×2). 6. **Power check (optional)**, collapsed: battery chart, lander sliders, the 10 m pole switch, and Suggested setups that survive the plan. 7. Talking to Earth: two-way / listen-only / no-contact bar and a radio choice (0.1 / 1 / 10 Mbps, illustrative) for the data estimate. 8. The ground card. 9. Timeline. 10. Technical details |
| **Best dates** | 14-month calendar, one square per landing day at 00:00 UTC, coloured by verdict, with the colour key underneath. Ranked table: sunlight and darkness first, contact next, battery last as a check |
| **Best sites** | All 12 sites ranked for one date and length, with the colour key |
| **Compare** | Up to 3 plans side by side from the "+ Compare" buttons, best value per row marked, and "Choose this plan" |
| **How it works** | Method, sources, validation, what the colours mean, limits, glossary |

Older docs (`HANDOFF_PROMPT.md`, `FRONTEND_HANDOFF.md`, `APP_SCREENS.md`, `PRODUCT.md`, `DESIGN.md`) now live in `docs/archive/`. They describe earlier stages and are partly out of date. Trust this file and `ACHIEVEMENTS.md`.

---

## 7. Decisions made with the project owner (and why)
These came out of reviews with the owner. Keep them unless you agree a change with him.
- **The challenge is about light and Earth contact, not battery design.** The verdict, the headline and the rankings use sunlight and contact only. The battery simulator stays, collapsed, as an optional check.
- **"Good" means the whole mission fits inside the sunlight.** For example, at Chandrayaan-3 the Sun is up from 13 Dec 2026 20:31 to 28 Dec 15:18 UTC (14.8 days). A 14-day mission is Good only when landing on 14 Dec. Landing 15 Dec is Marginal (the last 8.7 h are after sunset), and the other days are Poor. That's why the Best dates calendar shows about one green day per month for a 14-day mission, and many more for a 7-day one.
- **Colours must always be explained:** the key appears under the calendar, on Best sites, on Plan (expandable) and on How it works.
- **The data rate is not a free number.** It's set by the antenna, the transmitter power and the distance (the link budget), so the app offers three antenna classes, labelled illustrative.
- **The look follows the teammate's SELENE design:** the S-orbit logo, the "Your next landing. In a new light." hero, the Mission Setup card and the big Moon. Spacecraft choice comes after planning (on Plan), not on Home. There's one 10 m pole switch, in the power check.
- **The 3D should be big and show mountains:** 150 km, heights ×2 by default, with True heights one click away. The Home Moon is side-lit for a real day/night edge, with small ringed pins.

## 8. Still open (most useful first)
1. **Gemini key:** Luna's free-text answers need a key (section 2). Not tested with a real key yet.
2. **Official region outlines:** download `A3_9regions-lonlat-simplified.zip` (622 KB) from the USGS ScienceBase item for DOI 10.5066/P1MEQ6UK (it needs a browser "verify you are human" click). Check each sample point falls inside its region, and re-pick any that don't (`pick_sites.py`). Our points come from LROC mosaic centres, so they're close but not proven to be inside.
3. **Re-validate the current engine** against NASA's maps (section 4 gap).
4. **Custom coordinates:** needs a small backend that runs the pipeline for one point (about 1.5–2 min the first time, then cached). Today only the 12 precomputed sites work, and the app says so.
5. **Deploy** (section 9).
6. **Clean-up:** `web/public/data/scenario_*.json` (660 files, 76 MB) and `sweep_*.json` are no longer used by the app and can be deleted, which roughly halves the data size. `year_nobile_rim.json` is a stale leftover from an old site id. `three` makes the JS bundle 744 KB, so consider code-splitting the 3D views.
7. **Phone layout** is not tested.
8. **Illustrative numbers:** lander classes and radio speeds are labelled illustrative. Replace them with sourced values if you want them in the main story.
9. **Two regions share one point each:** Mons Mouton with Nobile Rim 1, and Mons Mouton Plateau stands alone. Slater Plain has no LROC mosaic and is the least certain location.

---

## 9. Publishing on a real site: what it takes and how fast it is

**Easiest:** the app is a static site. Run `cd web && npx vite build`, then upload `web/dist/` (about 97 MB with data, about 20 MB after the clean-up in section 8, item 6) to any static host: GitHub Pages, Netlify, Cloudflare Pages or Vercel.
- **Setup time:** about 15–30 minutes the first time. Each later deploy is a 2-second build plus the upload.
- **For visitors:**
  - First load: about 0.8 MB of JavaScript, plus about 550 KB of data for the chosen site (about 150 KB compressed). Typically 1–3 s on a normal connection.
  - After that, every analysis, ranking and comparison runs in the browser: a few milliseconds, and about 0.5 s for "Best dates" (about 400 simulated landings).
- **Luna's AI:** host `server/assistant.mjs` on any free Node host (for example Render or Railway), with `GEMINI_API_KEY` set as a secret. Or run it with `STATIC_DIR=web/dist` so one server serves both the site and the AI. An AI answer takes about 1–3 s.
- **A brand-new location** would need the backend from section 8, item 4: about 1.5–2 min the first time, instant after caching.

---

## 9b. Final touches (14 Nov 2026, branch `final-touches`)
Review fixes before submission. All web tests, the typecheck and the build pass.
- **Demo default is now a Good plan with a slip story:** Mons Mouton Plateau, landing 17 Dec 2026 00:00 UTC, 14 days (`selene/plan.ts`). `+24 h` turns it Poor ("it now runs into 13.9 h of darkness"). The old 30-day default made every site Poor, because 30 days is longer than one lunar daylight (about 14.8 days). The 30-day option is now labelled "(meets night)".
- **Answer on the first screen:** Home shows the verdict, the reason, sunlight, Earth link and Sun height for the current setup before any click. The hero is smaller on short screens so the setup card and button fit at 1366×768. Luna moved bottom-right.
- **Solar elevation angle up front:** a new **Sun height** tile (elevation at touchdown, clearance over the hills, highest in the mission) and the Sun height in the 3D label (`lib/sunHeight.ts`, from the 30-min track and the LOLA skyline).
- **Earth visibility windows:** a thin **Earth in view** row on the timeline and an "Earth in view %" in the Contact tile, as plain line of sight next to the DSN link (`lib/earthView.ts`). Built from the year file's Earth track and skyline; edges ±15 min. Tested: at least 97% of the backend's DSN link time falls inside it at three sites. The verdict still uses the DSN link.
- **Launch-slip headline:** one line names what a slip does and why (`lib/slip.ts` `slipHeadline`); the slip table now shows the verdict's own figures (sunlight, longest dark, Earth link, longest silence) instead of battery.
- **ISO 24-hour UTC everywhere:** the browser date/time pickers (which showed "03/16/2027", "12:00 AM") are replaced by one text field, `YYYY-MM-DD HH:MM UTC` (`selene/UtcField.tsx`).
- **Stale wording fixed:** How it works (verdict no longer "power and link"), the Real NASA data tooltip (10-min positions, checked every minute), Luna's tips, `rank.ts` comment.
- **Phone:** no page scrolls sideways at 390 px (`.stack` grid column fix); "Talking to Earth" no longer stretches into empty space; the 3D view opens on the first sunlit moment instead of a black scene.
- **Size:** removed the unused `scenario_*.json`, `sweep_*.json` and stale `year_nobile_rim.json` (data 98 MB → 22 MB). Note: `spike/build_dataset.py` still writes those files; delete them again after a rebuild. three.js now loads only with a 3D view (first JS load 748 KB → 258 KB).
- **Luna AI:** key read from `server/.env` (git-ignored); default model `gemini-3.5-flash-lite` (about 2 s; `gemini-2.0-flash` is retired and the larger Flash models are too slow); rate-limit table no longer grows forever; `TRUST_PROXY=1` for hosting behind a proxy.
- Older docs moved to `docs/archive/`.
- **Calendar picker:** the date fields have a calendar button; the field still shows ISO `YYYY-MM-DD`. An empty or invalid date hides the Home answer and disables Run analysis.

## 10. Data sources (cite these)
- JPL Horizons API (DE441), ssd.jpl.nasa.gov.
- NASA LRO LOLA polar DEMs and illumination maps (PDS Geosciences; Mazarico et al. 2011).
- NASA DSN Telecommunications Link Design Handbook 810-005, modules 101 and 302 (copies in `ref/dsn/`).
- NAIF `earth_topo_260717.tf`: DSN antenna positions.
- NASA Artemis III candidate regions (Oct 2024 update).
- LROC low-Sun NAC region mosaics (region centres).
- USGS Gazetteer of Planetary Nomenclature.

AI use: the code, data pipeline and docs were developed with Claude (Anthropic) as a coding assistant. Luna's optional answers use Google Gemini. State both in the submission.
