# Lunar Landing Site Navigator: frontend and UX handoff

Everything the frontend needs: the problem, the users, what the backend gives you, what each number means, the screens to build, and the edge cases.

- Backend contract (source of truth for field names): [`contract/CONTRACT.md`](contract/CONTRACT.md)
- Mock responses with **real** numbers: [`contract/mock/sites.json`](contract/mock/sites.json), [`contract/mock/scenario_chandrayaan3_2026-12-01.json`](contract/mock/scenario_chandrayaan3_2026-12-01.json)
- Validation figures (PNG): [`figures/`](figures/)
- Backend results and method: [`spike/README.md`](spike/README.md)

---

## 1. The problem in one paragraph

Missions to the Moon's south pole need two things at the landing site: **sunlight** (solar power, heat) and **Earth above the horizon** (direct radio contact without a relay satellite). Near the pole the Sun skims the horizon and mountains hide it for hours or days. Earth also hides behind terrain. Small changes in **place** or **date** flip a site from good to useless. NASA's tools (Quickmap, Moon Trek, JPL Horizons) have this information, but they are built for specialists. Comparing "site A on date X" with "site B on date Y" takes many interfaces and raw tables.

**Our job:** let someone compare landing sites and dates **in seconds** and see **why** one is better.

The challenge text names this case: a mission slips (hardware delay, launch delay), and planners must quickly check alternative dates at the same site, or nearby sites on the same date.

## 2. Users (from the challenge)

| User | Wants | Design for them by |
|---|---|---|
| **Mission planner** (primary) | Fast, precise answers: is this site/date viable, how long until sunset/Earthset, what's the best alternative | Numbers up front, comparison, exact times |
| **Educator** | Explain why the Moon is hard | Sky view and terrain visuals, glossary |
| **Public** | Curiosity, "wow" | Clear visuals, plain words, the verdict |

The planner is the main user. Educators and the public must still understand the screen without training.

**The demo story:** "Our landing slipped two weeks. Is the site still good, or should we move?"

## 3. Inputs and outputs (agreed on the whiteboard, then refined)

### Inputs
| Input | Notes |
|---|---|
| **Site** | From a curated list (map pins plus list). Custom lat/lon later (Should). A specific point, not a whole region, because small moves change the answer |
| **Start date and time** | UTC |
| **Duration** | 1 to 60 days (mission length) |
| **2 or 3 scenarios** | Each scenario = (site, start, duration). This is the compare feature |
| *Advanced, later* | Lander height above ground, minimum Earth elevation for a link |

### Outputs
| Output | Where it comes from |
|---|---|
| Is the Sun up now, and is Earth up now | `now.sun_visible`, `now.earth_visible` |
| Time to sunset / Earthset (or to sunrise / Earthrise if hidden) | `now.hours_to_*` |
| How high the Sun is above the terrain | `now.sun_clearance_deg` |
| Total sunlit, Earth-visible and both-up hours and % | `metrics.*` |
| Longest window with Sun and Earth both up | `metrics.longest_both_window_hours` |
| When exactly each is up | `windows.sun`, `windows.earth`, `windows.both` |
| Verdict: good, marginal or poor, with reasons | `verdict` |
| Sky view: the skyline and where Sun and Earth move | `horizon` + `series` |
| Timeline: positions over time vs the terrain | `series` |

Not an output: **battery charging time**. It needs lander specs we don't have. If added later, it is an optional estimate where the user types panel watts and battery size, with the assumptions shown.

## 4. Architecture you are building against

```
Browser (your app) ──HTTP JSON──> Backend ──> pre-computed site files (Horizons + LOLA, built offline)
                                       └────> JPL Horizons API (custom coordinates only)
```
- **Never call JPL Horizons from the browser.** It sends no CORS header, so the browser blocks it. Tested.
- Until the backend is deployed, **load the mock JSON files** directly. They have the exact shape of the real responses.
- **Every number comes from the backend.** The UI and the AI brief never compute or invent numbers.

## 5. API (summary; full detail in CONTRACT.md)

Every response is wrapped:
```json
{"ok": true, "data": { ... }, "error": null}
{"ok": false, "data": null, "error": {"code": "bad_request", "message": "days must be 1..60"}}
```

### `GET /api/sites`
```json
{"id": "chandrayaan3", "name": "Chandrayaan-3 (Statio Shiv Shakti)", "lat": -69.373, "lon_e": 32.319,
 "kind": "landed", "terrain": true, "coord_source": "Wikipedia: Shiv Shakti Point", "verified": true}
```
- `kind`: `landed` (past mission) or `candidate` (future target).
- `terrain: false` means no terrain data for that site. Results use a smooth Moon and **must show a warning** (section 9).
- `verified: false` means the coordinate is not checked yet. Show a small "unverified" tag.

### `GET /api/scenario?site=<id>&start=<ISO>&days=<1..60>`
Top-level keys of `data`: `scenario`, `source`, `now`, `metrics`, `verdict`, `windows`, `horizon`, `series`, `notes`.

Real values from the mock (Chandrayaan-3, start 2026-12-01 00:00 UTC, 30 days):
```json
"now": {"sun_visible": false, "earth_visible": true, "sun_el_deg": -6.28, "earth_el_deg": 16.93,
        "sun_clearance_deg": -7.02, "hours_to_sunset": null, "hours_to_earthset": null,
        "hours_to_sunrise": 307.0, "hours_to_earthrise": null},
"metrics": {"sun_up_hours": 356.5, "sun_up_percent": 49.5, "earth_up_hours": 720.0, "earth_up_percent": 100.0,
            "both_up_hours": 356.5, "both_up_percent": 49.5, "max_sun_clearance_deg": 20.77,
            "longest_both_window_hours": 356.5},
"windows": {"sun": [{"start": "2026-12-13T18:59Z", "end": "2026-12-28T15:27Z", "hours": 356.46,
                     "open_start": false, "open_end": false}], "earth": [...], "both": [...]}
```

### Compare
No compare endpoint in v1. Call `/api/scenario` once per scenario (2 or 3) and show the results side by side.

## 6. What every field means (show these meanings in tooltips)

| Field | Plain meaning | Unit / format |
|---|---|---|
| `sun_visible` | Any part of the Sun is above the mountains in its direction | yes / no |
| `sun_el_deg` | Sun's height above a flat horizon (not the mountains) | degrees |
| `sun_clearance_deg` | How far the highest part of the Sun's disc is **above the mountains**. Negative = fully hidden by that many degrees | degrees |
| `hours_to_sunset` | Hours until the Sun goes behind the terrain. `null` = stays up until the end of the period | hours |
| `hours_to_sunrise` | Hours until the Sun appears. `null` = stays hidden the whole period | hours |
| `hours_to_earthset` / `hours_to_earthrise` | Same for Earth | hours |
| `sun_up_percent` | Share of the period with sunlight | % |
| `earth_up_percent` | Share of the period when Earth is visible (direct-comms possible) | % |
| `both_up_percent` | Share with **both** together: the best operating time | % |
| `longest_both_window_hours` | Longest unbroken stretch with both up | hours |
| `windows.*[]` | Each visibility period with start, end and length | UTC times, hours |
| `open_start` / `open_end` | The period touches the start or end of the date range, so it may continue outside it. Draw a fade or arrow at that edge | boolean |
| `verdict.level` | `good` / `marginal` / `poor` | enum |
| `horizon.elev_deg[k]` | Height of the mountains at compass direction `k × 0.5°` (k = 0..719, 0 = North, 90 = East) | degrees |
| `series.*` | Columns of equal length: `t`, `sun_az`, `sun_el`, `earth_az`, `earth_el`, `terrain_under_sun`, `terrain_under_earth` | ISO time, degrees |

Conventions: all times **UTC** (ISO `2026-12-13T18:59Z`). Azimuth is a compass direction (0 = N, 90 = E, 180 = S, 270 = W). Longitude is east-positive, 0–360.

## 7. Screens to build

### 7.1 Main screen: one scenario
Top to bottom, in priority order:

1. **Scenario bar:** site picker (map with pins, plus a searchable list), start date and time, duration. Show the site's lat/lon and an "unverified" tag if needed.
2. **Verdict banner:** Good / Marginal / Poor, with one-line reasons. Colour **and** an icon or word, never colour alone.
3. **Metric cards** (the "right now at start" plus totals):
   - Sun: up or hidden; "sets in 14 h 20 m" or "rises in 307 h (12.8 days)"
   - Earth: up or hidden; time to Earthset or Earthrise
   - Sunlight over the period: `356.5 h (49.5%)`
   - Sun and Earth together: `both_up_hours`, `longest_both_window_hours`
4. **Timeline chart** (the core view): x = time, y = degrees.
   - Sun line (`series.sun_el`) and Earth line (`series.earth_el`)
   - **Terrain line under each body** (`terrain_under_sun`, `terrain_under_earth`). The body is visible when its line is above its terrain line.
   - Shaded bands for `windows.both` (best operating time)
   - A "now" marker at the start
5. **Sky view:** x = compass direction (N, E, S, W, N), y = degrees.
   - Filled terrain silhouette from `horizon.elev_deg`
   - Sun path and Earth path from `series` (az, el)
   - Optional time slider moving a Sun and Earth dot along the paths (stretch)
6. **AI brief** (Sprint 3): a plain-language paragraph written from these numbers.
7. **Notes and sources:** `notes[]`, plus "Data: NASA JPL Horizons, LRO LOLA".

### 7.2 Compare screen: 2 or 3 scenarios
- One column per scenario: verdict, key metrics, mini timeline.
- **Highlight the differences** ("+5.1 h more sunlight", "Earth hidden 12 days vs 0").
- Quick actions for the slip story: "**Same site, +14 days**" and "**Nearby site, same date**" duplicate a scenario with one change.
- Keep the same y-axis range across columns so the charts compare honestly.

### 7.3 Demo presets (one click each; needed for the video)
1. Chandrayaan-3, 1 Dec 2026 vs 15 Dec 2026 (same site, slipped date)
2. A polar ridge site vs Chandrayaan-3 (pole vs 69°S)
3. One polar site on two dates (light comes and goes)

Polar sites: see `web/public/data/sites.json` (NASA Artemis III regions with sample points).

## 8. Visual language (keep consistent with the team figures)

| Thing | Colour | Note |
|---|---|---|
| Sun | orange `#E8871E` | Use for everything Sun: lines, icons, sunlit bands |
| Earth | blue `#2F6DB5` | Everything Earth |
| Terrain | brown `#8B5A2B` | Filled silhouette, terrain lines |
| Both up (best time) | green `#2E8B57`, light fill | Shaded windows |
| Smooth Moon / no terrain | grey `#9A9A9A` | Only for warnings and comparisons |

- Verdict colours (good / marginal / poor) are semantic. Pair them with words and icons for colour-blind users.
- Both light and dark themes must keep Sun, Earth and terrain readable.
- The figures in `figures/` use the same palette. Reuse them in the video and pitch.

## 9. Edge cases the UI must handle

| Case | What it looks like in data | UI |
|---|---|---|
| Sun or Earth never sets in the period | `hours_to_sunset: null` while `sun_visible: true` | "Up for the whole period" |
| Never rises | `hours_to_sunrise: null` while visible is false | "Hidden for the whole period", likely with verdict `poor` |
| **Earth never visible** (far side, or behind mountains) | `earth_up_percent: 0` | "No direct contact with Earth: needs a relay satellite" |
| Window touches the range edge | `open_start` or `open_end` true | Fade or arrow: "continues before / after" |
| Many short windows (near the pole) | Many entries in `windows.sun` | Timeline bands must stay readable; consider a count plus total |
| **No terrain for this site** | `site.terrain: false`, `horizon.elev_deg` all 0 | **Warning banner:** "No terrain data. Near the pole this can be badly wrong." (We measured errors up to 62 points without terrain.) |
| Unverified coordinates | `verified: false` | Small tag |
| Error from backend | `ok: false` | Show `error.message` and how to fix it; keep the previous result visible |
| Slow custom-coordinate query | several seconds | Loading state with progress text |
| Times | UTC | Label "UTC" everywhere; optional local-time toggle |

## 10. Words for tooltips and the glossary

| Term | Simple explanation |
|---|---|
| Elevation | How high something is above the horizon, in degrees. 0° = on the horizon, 90° = straight up |
| Azimuth | Compass direction: 0° north, 90° east, 180° south, 270° west |
| Horizon / skyline | The line where the ground meets the sky, set by the real mountains around the site |
| Clearance | How far above the mountains the highest part of the Sun's disc is. Below zero = fully hidden |
| Earthset / Earthrise | When Earth goes behind or comes out from the terrain. From the Moon, Earth barely moves in the sky, so this mostly happens near the pole |
| Libration | The Moon's slight wobble, which makes Earth drift a few degrees up and down in the lunar sky |
| Lunar day | About 29.5 Earth days from one sunrise to the next |
| Permanently shadowed region | Crater floors near the pole that never see the Sun |
| Direct-to-Earth (DTE) | Radio straight to Earth, possible only when Earth is above the horizon |

## 11. Accuracy: what you can claim in the UI and pitch

- Sun and Earth positions: **NASA JPL Horizons** (DE441). Our parsing matches Horizons' own visibility flags exactly (0 mismatches in 8,638 rows).
- Terrain: **NASA LRO LOLA** elevation maps (240 m and 120 m).
- **Checked against NASA's own long-term illumination maps:** within 2.4 percentage points at 6 of 8 test points near the pole, including permanent shadow and blocked Earth. Two ridge-top points differ by 2 and 12 points, inside NASA's own pixel-to-pixel spread.
- Without terrain, errors near the pole reach **62 points**. This is why the "no terrain" warning matters.

Limits to state honestly (an "About the data" panel):
- Terrain pixels are 120–240 m, so nearby small rocks and slopes are smoothed.
- Lander height assumed 2 m.
- "Earth visible" means line of sight only, not a full radio-link analysis.

## 12. Build order and what's ready

| When | Build | Data |
|---|---|---|
| Now → Gate 4 (6:30 PM) | App shell, deployed URL, timeline chart from the mock | `mock/scenario_chandrayaan3_2026-12-01.json` |
| Sprint 2 (→ 9:00 PM) | Site picker, date control, metric cards, verdict | Mock now, real API when ready |
| Sprint 3 (→ 12:30 AM) | Compare view, sky view, AI brief panel | Real API |
| Stretch | Time slider / animation, 3D | Same data |

Ready now: contract, mock files (real numbers), figures.
Not ready yet: deployed backend, polar site list, real verdict thresholds (the current rule is a placeholder until C defines it), AI brief.

**Mock vs real API:** the mock uses 60-minute steps (721 points). The real API uses 10-minute steps (about 4,321 points for 30 days). Make charts handle a few thousand points smoothly; downsample for display if needed.
