# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React + Vite (user choice, 13 Nov 2026). Frontend lives in `web/`. Backend is Python (spike in `spike/`), reached over HTTP JSON per `contract/CONTRACT.md`; until it is deployed the app loads contract-shaped mock files.

## Users
Two audiences carry equal weight on the first screen:
- **Mission planners** (primary operator): need fast, precise answers. Is this site and date viable, how long until sunset or Earthset, what is the best alternative when a launch slips.
- **Hackathon judges, educators and the public**: watch the demo story ("our landing slipped two weeks; is the site still good, or should we move?") and must understand the screen without training.

## Product Purpose
Let someone compare lunar landing sites and dates in seconds and see why one is better: sunlight (power, heat) and Earth above the local terrain (direct radio contact without a relay). NASA Space Apps 2026 challenge "Lunar Landing Site Navigator". Success: a slipped-date or nearby-site question is answered in one or two clicks, with the reason visible.

## Positioning
Every number comes from NASA JPL Horizons ephemerides checked against real LOLA terrain skylines, validated against NASA's own long-term illumination maps (within 2.4 points at 6 of 8 polar test points; 0 mismatches vs Horizons flags in 8,638 rows). Quickmap, Moon Trek and Horizons have the data but need many interfaces; this tool puts site × date comparison in one place.

## Operating Context
- API: `GET /api/sites`, `GET /api/scenario?site&start&days` (1–60 days); compare = 2–3 parallel scenario calls. Envelope `{ok, data, error}`.
- All times UTC. Azimuth 0 = N clockwise. Longitude east-positive 0–360.
- Real step 10 min (~4,321 points per 30 days); mock 60 min.
- Demo presets: Chandrayaan-3 1 Dec vs 15 Dec 2026; polar ridge vs Chandrayaan-3; one polar site on two dates.

## Capabilities and Constraints
- The UI never computes or invents metrics; it formats backend values (and may subtract two to show a difference).
- Verdict levels good / marginal / poor; thresholds provisional.
- Must handle: no terrain (smooth-Moon warning, errors up to 62 points near the pole), unverified coordinates, Earth never visible (relay needed), open window edges, many short windows, backend errors (keep previous result), slow custom queries.
- Not offered: battery or energy estimates (no lander specs), full radio-link analysis.
- Undecided: custom lat/lon input UI, AI brief (Sprint 3), local-time toggle.

## Brand Commitments
- Name: **Landing Site Navigator**.
- Semantic palette shared with the team figures: Sun orange `#E8871E`, Earth blue `#2F6DB5`, terrain brown `#8B5A2B`, both-up green `#2E8B57`, smooth Moon / no-terrain grey `#9A9A9A`.
- Data credit: NASA JPL Horizons, LRO LOLA.

## Evidence on Hand
- `contract/mock/` (Chandrayaan-3, 1 Dec 2026) and `design/data/` (6 more real runs: Chandrayaan-3 15 Dec, polar ridge and polar plain on 1 and 15 Dec, Apollo 11 smooth Moon).
- Validation figures in `figures/`; method and numbers in `spike/README.md`.
- No testimonials, users or partner endorsements exist; do not fabricate any.

## Product Principles
1. Answer first, evidence one step below: verdict and key times before charts.
2. Show why: Sun and Earth always drawn against the real skyline, never alone.
3. Compare honestly: shared scales, explicit differences, no hidden normalisation.
4. Plain words beside exact numbers, so a judge and a planner read the same screen.
5. Say what the data cannot: no-terrain, provisional and unverified states are always visible.

## Accessibility & Inclusion
Never colour alone for verdicts or bodies (word + icon + line style). Both light and dark themes. Keyboard-operable time scrubbing. Phone width must work for the public.
