# Landing Site Navigator: app screens

Based on the team whiteboard (13 Nov) and what already exists in `web/`.
Field names refer to `contract/CONTRACT.md`. Colours and type follow `DESIGN.md`.

Status key: ✅ exists in `web/` · 🟡 partly there · ❌ to build · 🔌 needs a new backend endpoint

---

## Navigation map

```
                 ┌───────────────────────────── 1. Plan (main screen) ─────────────────────────────┐
User ──────────► │  "I have a DATE"      "I have BOTH"           "I have a LOCATION"               │
                 │   → best locations     → 2–3 scenarios          → best dates & times             │
                 └───────────┬───────────────────┬──────────────────────────┬────────────────────┘
                             └───────────► 2. Analysis (one scenario) ◄─────┘
                                                 │
                         ┌───────────────────────┼────────────────────────┐
                         ▼                       ▼                        ▼
                  3. Compare            4. Delay / Replan          5. Map view
                (choose a plan)        (risk management)        (analysis by eye)

  Always reachable: 6. Sites list · 7. About the data (method + validation)
```

The whiteboard's three entry paths are the core idea: the user starts from **what they already know**.

---

## 1. Plan: the main screen
**Job:** let the user start from what they know and get candidate scenarios in one step.

**Layout:** three mode tabs (segmented control) at the top, the same result list below.

| Mode | Input | Output | Data |
|---|---|---|---|
| **I have a date** (time frame) | Start date and time (UTC), mission length (1–60 days) | **Best locations**: curated sites ranked for that period | 🔌 `GET /api/best-sites?start&days` |
| **I have a location** | A main place (curated site) **or** latitude/longitude, a search range of dates, mission length | **Best dates and times**: start dates ranked | 🔌 `GET /api/best-dates?site&from&to&days` |
| **I have both** | Site + date + length, add 2–3 scenarios | **Best options**: the scenarios, ranked | ✅ `GET /api/scenario` × 2–3 |

**Each result row shows:**
- Verdict pill (Good / Marginal / Poor, with word and icon)
- Site name and date
- **Sun and Earth both up:** hours and %
- Longest both-up window
- Time to first sunset or sunrise
- A small sparkline of the timeline
- Buttons: **Analyse** (→ screen 2) and **Add to compare** (→ screen 3)

**Add-ons for better options** (whiteboard), shown as an expandable panel:
- **Power info:** optional. The user enters panel power (W) and battery size (Wh); we show an *estimate* with the assumptions stated. Not computed without user input, because we have no lander specs.
- Advanced: lander height (default 2 m), minimum Earth elevation for a usable link.

**States:**
- Empty: show the three demo presets as cards (section 8).
- Loading (best-dates can take seconds): progress text.
- No result above Marginal: say so, and suggest widening the date range.

**Status:** ❌ New screen. Today `SitesView` and `SurveyView` cover "pick a site and date" only. The two ranking modes need the new endpoints.

---

## 2. Analysis: one scenario (the whiteboard's "second screen")
**Job:** answer "is this scenario good, and why" for one site, date and length.

Top to bottom:
1. **Title block:** site name, lat/lon, `kind`, terrain yes/no, "unverified" tag, start, length. Edit buttons.
2. **Verdict** with reasons (`verdict`).
3. **Key times** (whiteboard: "time of sunrise and Earthrise above the horizon"):
   - Sun: up now? Sets in X h or rises in X h (`now.hours_to_*`)
   - Earth: up now? Earthset in X h or Earthrise in X h
   - Next sunrise and Earthrise as **UTC date-times** (from `windows.sun[*].start`, `windows.earth[*].start`)
4. **Readings:** Sun-up, Earth-up and both-up hours and %, longest both window, max Sun clearance (`metrics`).
5. **Timeline:** Sun and Earth elevation over time, each with **its terrain line underneath** (`series.terrain_under_*`). Shaded lanes for Sun, Earth and both windows. A time scrubber moves a cursor; the readout shows values at that time.
6. **Sky dome:** the view straight up with the real skyline around the rim (`horizon.elev_deg`), and the Sun and Earth paths (`series`). The cursor dot follows the scrubber.
7. **Explain:** plain-language summary from the same numbers (template now; AI brief later, Must 4).
8. **Actions:** **Delay this plan** (→ screen 4), **Add to compare** (→ screen 3), **Show on map** (→ screen 5).
9. Notes and sources (`notes`, `source`).

**Edge cases:** see `FRONTEND_HANDOFF.md` section 9 (never sets or rises, Earth never visible, open window edges, many short windows, no terrain warning).

**Status:** ✅ Mostly exists as `SurveyView` + `SkyDome` + `Charts` + `Explain`. Check the "next sunrise/Earthrise as UTC date-time" line and the action buttons.

---

## 3. Compare: choose the plan (whiteboard: "plan choice from the scenarios that have been created")
**Job:** put 2–3 scenarios side by side and pick one.

- One column per scenario: verdict, key times, readings, mini timeline, mini dome.
- **Differences highlighted** against the first column, for example "+5.1 h sunlight", "Earth hidden 12 days vs 0". The UI may subtract two backend values; it never computes new metrics.
- **Same scales** in every column.
- A **"Choose this plan"** button marks the selected scenario. It is used by Delay/Replan and the summary.
- Quick add: "Same site +14 days", "Nearby site, same date".

**Status:** ✅ `CompareView` exists. ❌ "Choose this plan" and a chosen-plan state.

---

## 4. Delay / Replan: risk management (whiteboard step 7)
**Job:** "our launch slipped N days; what now?"

**Input:** the chosen plan + a **delay** (days, or a new date).

**Output, three answers side by side:**
1. **Same site, delayed date:** a new scenario, with the difference vs the original.
2. **Best date near the delayed date at the same site:** from best-dates within ± a few days.
3. **Best other site for the delayed date:** from best-sites.

Plus one line saying which option keeps the most both-up time.

**Data:** 1 works with `/api/scenario` today. 2 and 3 need 🔌 `best-dates` and `best-sites`.

**Status:** ❌ New screen. For the demo it can start with option 1 only: "Chandrayaan-3, 1 Dec → 15 Dec" exists in the data.

---

## 5. Map view: analysis by eye (whiteboard: "map for easy analysis with eye")
**Job:** see where the sites are and why location matters.

- Polar map of the south pole (about 120 km around it), background = **NASA average-sunlight map** (bright = often lit, black = permanent shadow) or a LOLA terrain hillshade. Toggle between them.
- Pins for curated sites, coloured by the verdict for the current date and length.
- Click a pin → small card → **Analyse**.
- Chandrayaan-3 (69°S) and Apollo 11 are far outside this area; list them beside the map with an arrow, or use a second zoomed-out map.

**Data:** the NASA map and terrain bands are already downloaded in `spike/polar/` (120 m). Export a reduced PNG or tile for the web; don't ship the raw arrays.

**Status:** 🟡 `PolarPlat` component exists (check what it draws). ❌ Basemap image export.

---

## 6. Sites list
**Job:** browse every curated site with its facts.

Columns: name, kind (landed / candidate), lat/lon, terrain yes/no, verified yes/no, coordinate source. Filter: near pole / all. Row click → Analysis.

**Status:** ✅ `SitesView`. Needs more sites (Artemis III candidate regions, with sources).

---

## 7. About the data: method and trust
**Job:** answer the judges' "why should we believe these numbers?"

- How it works in 3 steps: Horizons → LOLA skyline → visible when any part of the disc clears the skyline.
- **Validation:** figures 1–3 from `figures/`.
  - 0 mismatches vs Horizons in 8,638 rows.
  - Within 2.4 points of NASA at 6 of 8 polar points.
  - Smooth Moon wrong by up to 62.
- Limits:
  - Terrain pixels are 120–240 m.
  - Lander height is 2 m.
  - "Earth visible" means line of sight, not a full radio-link analysis.
  - Verdict thresholds are provisional.
- Data credits: NASA JPL Horizons (DE441), LRO LOLA, Mazarico et al. 2011.
- AI-use disclosure (required for submission).

**Status:** ✅ `AboutView` exists. Check that it includes the figures and limits.

---

## 8. Demo presets (one click each; used in the 30-second video)
| Preset | Story | Data ready? |
|---|---|---|
| Chandrayaan-3: 1 Dec vs 15 Dec 2026 | "Launch slipped two weeks" | ✅ both files |
| Polar ridge top vs polar plain, 1 Dec 2026 | "36 km apart: one gets Sun and Earth, the other gets no Earth at all" | ✅ (ridge both-up 50.0%, plain 0.0%, verdict good vs poor) |
| Polar ridge top: 1 Dec vs 15 Dec | "Same site, two dates" | ✅ (50.0% vs 59.1%) |
| Apollo 11 (no terrain) | "Shows the no-terrain warning" | ✅ |

---

## Build priority (to the 12:30 AM must-have gate)
1. Analysis screen complete (2): key times line and action buttons.
2. Compare with "Choose this plan" (3).
3. Delay / Replan, option 1 only (4), which uses existing data.
4. Plan screen (1) in **"I have both"** mode first, using existing scenarios. The two ranking modes come after the backend endpoints exist.
5. Map view (5) with the NASA sunlight map as background.
6. AI brief inside Explain.

Ranking ("best location", "best date") is the whiteboard's main new idea. It is a **backend task first** (pre-computed long series plus two endpoints). Without it, the Plan screen shows only the "both" mode.
