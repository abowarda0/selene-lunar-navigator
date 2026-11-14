# SELENE UX redesign spec (Fable advisor, 14 Nov 05:25)

Principle: one metric (Power + Comms verdict), one screen that answers, two rankings that feed it. Every number carries its source. Anything the app cannot do is removed, not disabled.

## A. Information architecture
- Views (top nav, plain text links): Plan · Best dates · Best sites · Method. No landing page.
- Persistent PLAN BAR under the nav on every view: Site ▾ | Touchdown (UTC) date+time | Duration ▾ (e.g. 3 d, 7 d, 14 d, 30 d) | Lander ▾ (Small / Rover / Large / Custom) | Mast ☐ (10 m). Changing anything recomputes instantly (no Run button). Default plan on load: Malapert Massif, Rover, 30 d, 16 Mar 2027 00:00 UTC.
- DELETE: hero + SetupPage as a page (controls become the plan bar); "01 / 03" counters, pills, the dot after h1; Coordinates mode; overlap-hours metric, 36 h minimum, "next touchdown that meets the minimum"; ComparePage as a page; rise/set tables as default content; MoonGlobe (WebGL) — keep FlatGlobe only as a small site locator (Best sites or next to the Site dropdown); "delay example" button.

## B. Plan view, top to bottom
1. Headline, one sentence, 22 px, verdict word coloured: "**Poor** for a Rover at Malapert Massif, 16 Mar 2027 00:00 UTC, 30 days." One line under it with both axis reasons from verdict.ts. Small grey line: "Verdict thresholds are our planning rule, not a NASA requirement. Lander values are illustrative class values."
2. Now strip, 4 mono figures at the timeline cursor (default touchdown): "Sun up · sets in 41 h 12 m" | "DSN link open · closes in 6 h 03 m" | "Lowest battery 20% at +335 h" | "Longest dark spell 253 h". If down: "Sun down · rises in …".
3. Timeline = the single main chart, shared x-axis (hours after touchdown + UTC dates on a 2nd tick row), 3 stacked rows: Sun (amber, opacity = visible disc share), Two-way DSN link (blue; receive-only hatched/40%), Battery % line with dashed red limit and dark spells shaded. Fold PowerChart into it. Hover cursor shows exact UTC + values. Source line under it: "Sun/Earth: JPL Horizons (DE441) · Skyline: LOLA polar DEM 5–240 m · Link: DSN 810-005, dish ≥10° two-way, ≥6° receive · Battery: our energy model, no thermal".
4. Two columns: Sky at cursor (SkyDome; az/el readout; source "LOLA skyline, 0.05° azimuth step") | Site facts (lat/lon, slope + class, terrain thumbnail, "sample point for the NASA region, not an official landing site").
5. Details (collapsed <details>): rise/set events (first 10, "show all N"), lander parameters (AdjustLander), data volume upper bound.
6. Validation footer, 3 facts linking to Method: "0 mismatches vs Horizons visibility flags in 8,638 rows (smooth-Moon check)" · "Within 2.4 pts of NASA illumination maps at 6 of 8 polar points (120/240 m engine)" · "Ignoring terrain is wrong by up to 62 pts". Plus: "The 5 m engine used for this data has not yet been re-checked against NASA's maps."
Drop: DelayCurve in overlap form, separate PowerCard/LinkCard headline blocks, KPI tiles about overlap.
Conventions: UTC everywhere "16 Mar 2027 00:00 UTC"; durations "41 h 12 m" under 100 h, "253 h (10.5 d)" above; percent 0 decimals; angles 1 decimal; energy kWh; "pts" for percentage-point differences; never "LOS" → "two-way DSN link". Uncertainty as text: "Rise/set times ±2 min from skyline sampling; up to 18 min on ridge tops".

## C. Rankings
Sort key: verdict (Good > Marginal > Poor), then lowest battery % desc, then longest link gap asc, then link share desc. State it in one line above the table.
- Best dates (site/duration/lander from plan bar): one touchdown per day at 00:00 UTC across the span (~400 runs; clip windows per plan). Above the table a 14-month strip, one cell per day coloured by verdict (hover: date + lowest battery; click selects). Table top 10 + "show all": Touchdown (UTC) | Verdict | Lowest battery % | Sun % | Link % | Longest link gap h | Longest dark spell h. Note: "Daily steps at 00:00 UTC; the Plan view is minute-accurate."
- Best sites (date/duration/lander from plan bar): all 12 rows, columns as above with Site | Lat instead of touchdown, plus Slope °. Grey tags: "reference" (Chandrayaan-3, Apollo 11), "test point" (ridge, polar_mid); Apollo 11 also "no terrain, smooth Moon". Load 12 year files in parallel; text "Computing 12 sites…".
- Row click sets the plan bar and switches to Plan (whole row is the link).

## D. Replan after a slip (inside Plan view)
Right of the headline: "Launch slips by [0] h   +6 h  +24 h  +7 d". When non-zero, the headline becomes a 2-row table: Planned / Slipped +X | Touchdown | Verdict | Lowest battery | Link % | Longest gap; then one sentence "A 24 h slip moves the verdict from Poor to Marginal." / "…does not change the verdict (Poor)." Timeline shows the slipped plan with planned Sun/link as a thin ghost row. Actions: "Adopt slipped date", "Find the next Good date at this site" (→ Best dates filtered to dates after the slip).

## E. Copy rules
Declarative; number, unit, reference. No second person, no exclamation marks, no "unlock/explore/journey/in a new light". Name the model for every modelled value. "Sample point" for Artemis regions. Every button = verb + object and does that thing.
Replacements: hero → remove (page title "Lunar Landing Site Navigator"); "SELENE / Lunar mission planning" → remove; "Mission Analysis." → "Plan"; "Compare Scenarios." → "Launch slip"; "Earth LOS…" → "Two-way DSN link: a 70 m dish is ≥10° above its horizon and above the lunar skyline"; "Stored data: touchdowns from 1 Dec 00:00 to 2 Jan 00:00 UTC" → "Data covers 1 Dec 2026 – 2 Jan 2028 (UTC)"; Coordinates tab → footnote under Site: "12 precomputed sites. A new coordinate needs the offline terrain pipeline (about 2 min); not available in this build."; "Where these numbers come from" → "Sources".

## F. Visual rules
Keep dark theme + selene.css tokens; simplify usage. Type: Inter for text, IBM Plex Mono for every number/timestamp (tabular numerals); 22 headline / 15 body / 13 labels / 12 source lines; no letter-spaced uppercase brand, no display h1. Colour semantic only: Sun = --accent-warm, Earth/link = --accent-primary, verdict green/amber/red always word + small square swatch. Everything else greyscale. 8 px grid, cards 16 px padding, 1 px --border, radius 8, no shadows/gradients/entrance animation. Tables 32 px rows, right-aligned mono numbers, units in header. Charts flat SVG, 1 px grid in --border, direct labels on the left, axis text 12 px --text-muted, a source line under every chart. Visible 2 px blue focus outline.

## G. Build order (~70 min)
P0: (1) deletions + string replacements; (2) plan bar, auto-recompute, default plan; (3) headline, Now strip, source lines, validation footer; (4) lib/rank.ts rankDates/rankSites (tests first) + two table views with row click → Plan.
P1: (5) slip input + 2-row comparison + adopt; (6) 14-month verdict strip on Best dates; (7) collapse event tables, merge battery into timeline. If short on time skip 7 before 5.
