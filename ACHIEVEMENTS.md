# What we have achieved: Lunar Landing Site Navigator

State checked on **Sat 14 Nov 2026, 00:45 Cairo time**. Every number here was re-read from the files or re-run tonight. This file covers the engine, the data and the proof. The screens are in `docs/archive/APP_SCREENS.md` (older; see `HANDOVER.md` for the current pages).

---

## 1. In one paragraph
We built an engine that answers: **"Standing at this spot on the Moon, when can I see the Sun (power) and the Earth (radio link)?"** It takes the Sun and Earth positions from **NASA JPL Horizons**, builds the real skyline from **NASA LOLA** terrain maps, and calls a body visible when any part of its disc clears that skyline. We checked it against Horizons' own visibility flags (0 mismatches) and against **NASA's published polar illumination maps** (6 of 8 test points within 2.4 percentage points). We also showed that ignoring terrain near the pole is wrong by up to 62 points. A second, finer version of the engine has already produced **220 ready-to-use scenarios** for 4 sites across Dec 2026 to Jan 2028.

---

## 2. What we understood (the problem, verified)
| Question | What we found | How we know |
|---|---|---|
| Can Horizons place an observer on the Moon? | Yes: `CENTER='coord@301'`, geodetic lon/lat/alt | Tested with real calls; raw replies in `spike/raw/` |
| Does Horizons know about mountains? | **No.** It treats the Moon as a smooth ball (1737.4 km) | Its "visible" flag matched our smooth-ball maths on all 8,638 rows |
| Can the browser call Horizons directly? | **No.** No CORS header | Tested; so the backend must call it |
| Limits | 90,000 steps per request; about 0.7 s per small call, 6 s for 43k rows | Measured |
| Hidden trap 1 | With steps under 30 min, column 3 holds the Sun's rise/set letter instead of the Earth flag | Found as 4 "mismatches", fixed in the parser with a test |
| Hidden trap 2 | NASA's own LOLA catalog gives a **mirrored** map formula | Correlation with the global LOLA map: 0.986 our way, −0.08 the catalog's way |
| Why terrain matters | At the pole the Sun skims the horizon, so a 1° hill decides light or dark | Smooth-ball error vs NASA reaches 62 points |

Full write-up: `spike/HORIZONS_API_FINDINGS.md`, `ref/RESOURCES_ANALYSIS.md`.

---

## 3. The engine (code)
Python package `spike/lunar/`. **55 tests pass, 87% coverage** (`cd spike && python3 -m pytest -q --cov=lunar`).

| Module | What it does | Coverage |
|---|---|---|
| `horizons.py` | Horizons client for a lunar observer: validates input, splits long ranges under the step limit, parses CSV, handles the event-letter trap | 83% |
| `terrain.py` | LOLA polar grid maths, downloads only the needed rows (HTTP Range), bilinear height sampling, skyline in 720 directions out to 150 km including the Moon's curvature | 84% |
| `visibility.py` | Upper-limb rule, rise/set times by interpolation, windows, Sun-and-Earth overlap, visible fraction | 99% |
| `fine.py` (newer) | Downloads only a square around the site (multi-range), stacks terrain layers from 5 m near the site to 120 m far away, skyline every 0.05°, visibility every minute, rise/set to the second, finds short "flicker" windows | 86% |

Whiteboard steps covered: 1 (Sun/Earth from Horizons), 2–4 (skyline from LOLA, fused), 5 (when both are up). Steps 6 (compare) and 7 (replan) have their **data** ready (section 5); the screens and endpoints for them are still open.

---

## 4. The proof (validation)
| Check | Against | Result |
|---|---|---|
| Smooth-ball visibility, 30 days | Horizons' own Sun and Earth flags | **0 mismatches** in 8,638 rows |
| Map orientation | LOLA global map | correlation **0.986** (mirrored: −0.08) |
| Sunlight at 69° S, 5 points | NASA average-sunlight map (18.6-year average) | within **0.6 points** |
| Sun **and** Earth near the pole, 8 points picked from NASA's map | NASA average-visibility maps | **6 of 8 within 2.4 points**, including permanent shadow (0 vs 0) and fully blocked Earth (0 vs 0) |
| The 2 ridge-top points | Same | off by 2 and 12 points, both **inside NASA's own neighbouring-pixel range** (up to 40 points on a ridge) |
| Same, terrain ignored | Same | wrong by up to **62 points** |
| 10-minute vs 1-minute steps, ridge, 4 months | Our own engine | same windows, ±0.02 h |
| Short Sun flips at the ridge with 5 m terrain (15 Apr and 14 Jun 2027) | True 1-minute Horizons vs 10-minute interpolated | **identical to the second** (40.1-min flash; 52-min dark gap then 22.6-min flash) |
| Skyline every 0.01° instead of 0.05°, 14 months, 3 sites | Our own engine | same windows; rise/set times move at most **1.8 min** (median 0) |
| Whole Sun/Earth disc instead of its centre-top point, same span | Our own engine | same totals (within 0.2%), but at the ridge flip times move up to **18 min** (median 5.6); flashes get longer (22.6→28.9, 40.1→45.1 min); at the polar plain a 33-min dark gap disappears. Chandrayaan-3 unchanged (≤0.3 min). Script: `spike/sky_sensitivity.py`, results `spike/data/sky_sensitivity.json`. **Adopted:** the app data now uses the whole-disc rule (`fine.disc_margin_deg`, 6 tests). Rebuild changed no verdicts; percentages moved at most 0.2 points; ridge flashes are now 44.9 and 26.9 min |
| Chandrayaan-3 site, Dec 2026 | Smooth vs terrain | terrain delays sunrise **5.1 h** and brings sunset **10.3 h** earlier |

Figures for the team (`figures/`): validation scatter, error bars terrain vs smooth, test points on NASA's map, a month on a polar ridge, Chandrayaan-3 sky view. Team page (private artifact, share before others can open it): https://claude.ai/artifact/VRmK3hWDWUCYWwXxpiSAeD

**Not yet validated:** the newer fine engine (5 m terrain, 1-minute steps). The checks above used the 120 m / 240 m engine. Re-running `polar_validate.py` logic with `fine.py` is the honest next check.

---

## 5. The data we have (ready for the app)
Built by `spike/build_dataset.py` (fine engine) into `web/public/data/`. Downloads are cached in `spike/fine/` (190 MB), so a rerun only recomputes.

| Site | Where | Terrain used | Scenarios | Verdicts over 55 start dates | Sun-and-Earth-up range |
|---|---|---|---|---|---|
| **Polar ridge top** | 89.45° S, 16.6 km from pole | 5 m to 6 km, 20 m to 30 km, 120 m to 150 km | 55 | 33 good, 22 marginal | **9.8%** (11 Jun 2027) to **60.0%** (15 Oct 2027) |
| **Polar plain** | 88.80° S, 36.4 km from pole | same layers | 55 | 55 poor | **0%**: Earth never visible |
| **Chandrayaan-3** | 69.37° S | 60 m to 30 km, then coarser | 55 | 55 good | 45.3% to 51.1% |
| **Apollo 11** | 0.67° N | none (smooth ball, flagged) | 55 | 55 good | 49.3% to 51.1% |

Each site has:
- **55 scenarios** of 30 days each: 1 and 15 Dec 2026, then every Friday of 2027.
- **A sweep file** (`sweep_<site>.json`): one summary row per start date. This is the raw material for "best date for this location" and for replanning after a delay.
- **A terrain file** (`terrain_<site>.json` + `.png`, polar and Chandrayaan-3 only): a shaded-relief image of the area and where along each direction the skyline-forming ground sits.

Example, 30 days from 1 Dec 2026:
- **Ridge top:** Sun 97.2%, Earth 47.3%, both 47.3%, longest both window 340.6 h → good.
- **Polar plain:** Sun 53.4%, Earth 0% → poor.

**The demo story:** the two polar sites are 36 km apart, and one gets Sun and Earth together for half the month while the other never sees Earth.

API contract: `contract/CONTRACT.md` v1 (`/api/sites`, `/api/scenario`) plus a proposed v1.1 (`/api/sweep`, `/api/terrain`, flicker fields). All fields are additive.

---

## 6. Frontend (for completeness)
`web/`: React + Vite + TypeScript, **48 vitest tests pass**. It reads the static files above. Screen plan: `docs/archive/APP_SCREENS.md` (older).

---

## 7. What is honestly still open
1. **Nothing is in git.** All of this exists only on this laptop.
2. **Fine engine not validated** against NASA's maps (section 4).
3. **Only 4 sites, and 2 are test points**, not named targets. Apollo 11's coordinates are unverified and it has no terrain.
4. **Verdict thresholds are placeholders** (ours to define). Chandrayaan-3 and Apollo 11 get "good" every week, which says the rule is too loose for non-polar sites.
5. **No backend server.** The app reads static files. That's fine for the demo; the API is not deployed.
6. **"Best location for a date"** has no ranking code yet. With 4 sites it is a sort over the sweep files.
7. **Custom lat/lon**, **AI brief with a number check**, the optional **power estimate**, the README, deploy and video are not done.

---

## Update 14 Nov, 03:35: real ground stations and NASA's named regions

**Earth = a real link to NASA's Deep Space Network.** A link exists when a 70 m dish (Goldstone, Canberra, Madrid; positions from NASA's NAIF station file) is above the lander's mountain skyline **and** the Moon is high enough in that dish's sky. Horizons gives both directions: the dish's exact spot on Earth's disc as seen from the lander, and the lander as seen from the dish.
- **Two-way (commands and data): dish ≥ 10°.** NASA DSN handbook 810-005, module 101 Rev. G: transmission below 10° is not allowed (`ref/dsn/101G.pdf`).
- **Receive-only (data from the lander): dish ≥ 6°.** Module 302 Rev. C, Table 1: the dishes cannot point below 6° (`ref/dsn/302C.pdf`).
- **Relay needed** = hours with no two-way link.
- Code: `spike/lunar/stations.py`, 17 tests on real Horizons replies.

**Eight NASA Artemis III regions** (Oct 2024 list; Mons Mouton and Nobile Rim 1 share one) now have one *sample point* each. NASA publishes names only. Locations come from the **LROC team's low-Sun NAC mosaics titled with each region's name** (centre and bounds, `spike/data/lroc_region_mosaics.json`); the point is the best-lit 120 m pixel on NASA's sunlight map within 8 km of the mosaic centre (`spike/pick_sites.py`). Slater Plain has no LROC mosaic and is anchored on Slater crater (USGS Gazetteer), so it is the least certain. Official USGS region outlines exist (DOI 10.5066/P1MEQ6UK) but the download sits behind a human check; not yet compared. Each site has its own terrain: 5–20 m LOLA near the site, 240 m out to 150 km.

Averages over 55 start dates (30 days each):

| Site | Lat | Sun % | NASA 18.6-yr sun % | Two-way link % | Sun + link % | Relay needed % |
|---|---|---|---|---|---|---|
| Malapert Massif | −85.97 | 79.4 | 84 | 69.6 | 51.2 | 30.4 |
| Mons Mouton / Nobile Rim 1 | −85.30 | 91.0 | 86 | 55.3 | 48.3 | 44.7 |
| Mons Mouton Plateau | −84.28 | 54.4 | 54 | 98.0 | 53.3 | 2.0 |
| Nobile Rim 2 | −83.72 | 54.4 | 54 | 70.8 | 39.0 | 29.2 |
| Haworth | −86.95 | 69.9 | 69 | 52.6 | 36.8 | 47.4 |
| Peak near Cabeus B | −83.62 | 66.1 | 68 | 66.4 | 41.1 | 33.6 |
| de Gerlache Rim 2 | −88.70 | 80.7 | 80 | 55.2 | 44.9 | 44.8 |
| Slater Plain | −88.81 | 87.4 | 78 | 51.3 | 48.4 | 48.7 |

Our 14-month sunlight is within 5 points of NASA's 18.6-year average at 7 of 8 points (6 within 2). Slater (+9) is the exception and also the least certain location.

**Open:** with the 10° rule the link has short handovers between dishes, so no 30-day plan has a 72 h unbroken Sun-and-link window and every verdict is "marginal" or "poor". The provisional verdict rule is ours to redefine.

---

## Update 14 Nov, 05:00: "Can my lander survive here?"

- **Power and battery simulator** (`web/src/lib/power.ts`): the user picks a lander (Small / Rover / Large, all illustrative class values, or Custom) and the app tracks battery charge over the plan from the minute-accurate Sun windows. Panels get the visible share of the Sun's disc. Outputs: survives or not, when the battery hits its limit, lowest charge, battery needed, share of time the load is met.
- **New verdict** (`web/src/lib/verdict.ts`): the worse of Power (battery margin) and Comms (longest gap without a two-way DSN link, and link share). This replaces the 72 h rule.
- **10 m solar mast** option: separate Sun windows computed with the skyline at 10 m. Ridge +2,070 h of Sun over 14 months; Malapert +727 h.
- **Link and data:** link hours × data rate gives an upper bound in GB, with the caveat that DSN time is scheduled.
- **Landing slope** at each sample point: best-fit plane over 40 m on the finest LOLA map. All polar sample points are 0.1–4.9°.
- Example: Malapert Massif, Rover, 30 days from 16 Mar 2027. The battery hits 20% after 335 h, in a 253 h dark spell; it would need 53 kWh. The mast cuts that dark spell to 126 h.
- Tests: 82 backend, 81 frontend. Built by an Opus subagent from a Fable design review; checked in the browser.
