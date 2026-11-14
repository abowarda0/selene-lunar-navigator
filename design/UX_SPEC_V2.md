# SELENE UX spec v2: "Public-first, expert on demand" (Fable advisor, 14 Nov)

No new data or physics: every number comes from planPower, evaluatePlan, darkSpells, dataVolumeGB, slopeClass.

## 1. Flow
Routes: #home (new default), #plan, #dates, #sites, #compare, #method. Nav: Home · Plan · Best dates · Best sites · Compare (n) · How it works.

Home (Home.tsx): headline question "What do you already know?" + 3 large cards, each with its own inputs and one button:
- "I have a date": date + mission length → "Find the best sites" → #sites
- "I have a site": site select + mission length → "Find the best dates" → #dates
- "I have both": site + date + length → "Analyse my plan" → #plan
Below: "Your spacecraft" row with preset chips (Small lander / Rover / Large) + "You can change the solar panel and battery later." Also a short "Why the south pole?" paragraph for public readers (2–3 sentences, factual). PlanBar hidden on Home, shown on other pages.

Compare tray (CompareTray.tsx): compare: Plan[] (max 3) in App, persisted to sessionStorage. "+ Compare" next to the Plan headline and on every RankTable row (Best dates, Best sites). Sticky bottom bar when n ≥ 1: chips "Malapert · 16 Mar 2027 · 30 d ✕" and "Compare (2)" (disabled < 2). 4th add → "Remove one first (max 3)". Duplicate toggles off.

Compare page (ComparePage.tsx): 2–3 equal columns using the current lander (banner: "All plans use the same spacecraft: Rover, panels on deck."). Rows: verdict word; plain answer sentence; sunlight %; longest time without Sun; lowest battery %; contact with Earth %; longest silence; ground slope; data you could send home (GB). Battery sparkline per column on the same 0–100% axis. Best value per row: --success left border + "best" text label; rows where all equal are dimmed. "Choose this plan" per column → sets plan, goes to #plan. Empty/error state when fewer than 2 plans or a plan falls outside the data span.

## 2. Plan page, top to bottom
1. AnswerHero: verdict pill + one 26–30px sentence from a pure function answerSentence(pp, lander, days) in lib/answer.ts (unit-tested):
   - poor power: "Your {rover} would run out of power {N} days after landing, because the Sun stays behind the terrain for {longestDark} in a row."
   - marginal: "Your {rover} survives, but only just: the battery drops to {x}%."
   - good: "Your {rover} keeps its power for all {days} days. The battery never drops below {x}%."
   - second sentence from the comms verdict. Under it: "+ Compare", "Find better dates" (→ #dates), and the slip control relabelled "What if launch is late?".
   - "What would fix this" hint when power is poor: "Needs a battery of at least {batteryNeededKWh} kWh, or a different landing date (see Best dates)."
2. Four icon tiles (4 cols, 2 at ≤900px), each icon + label + big number + one line + "?" button popover (aria-describedby, not title): Sunlight "{sunPct}% of the time · longest dark {h}"; Contact with Earth "{linkPct}% · longest silence {h}"; Battery "lowest {x}% (reserve {min}%)"; Ground "Flat enough to land ({slope}°)" / "Sloped, caution" / "Too steep".
3. POWER section, always open (PowerSection.tsx, replaces nested AdjustLander details), two columns:
   - Left "Your spacecraft": preset chips; four range sliders each paired with a number box + unit (keep validateLander): Solar panel power (W) 50–3000; Battery size (kWh) 0.2–40; Power used in sunlight (W); Power used in the dark (W); "Advanced" disclosure: battery reserve %, radio W.
   - Left, mast switch card: "Put the solar panels on a 10 m pole to see over nearby hills: +{X} h of sunlight, longest dark {a} → {b}." From pp.other. Disabled with reason when sun_mast10 absent.
   - Right "Battery over the mission": SoC area chart, reserve line, dark spells shaded. Caption: "The battery drains fastest during the grey bands (no Sun). To survive this plan you would need at least a {batteryNeededKWh} kWh battery." Under: "Simple energy model: no heating, no charge losses."
4. Two EQUAL-HEIGHT cards: "Data you could send home" (LinkCard rephrased, rate slider) | "The ground" (slope + terrain thumbnail).
5. Timeline (unchanged) with NowStrip directly above, titled "At the moment you point to".
6. "Technical details": three separate disclosures: Sky dome · Sunrise/sunset list · Sources and accuracy.
7. Remove Validation() from PlanPage → MethodPage section "How we checked it". On Plan keep one muted link "How do we know this is right?" → #method.

Equal height CSS: .two { align-items: stretch } .two > .card { display:flex; flex-direction:column; height:100% } .two .src { margin-top:auto }; .dome-box and .thumb same aspect-ratio 1/1, max-height 340px.
Disclosures: summary { list-style:none; padding:10px 14px; border:1px solid var(--border-strong); border-radius:var(--r); background:var(--bg-card); display:flex; justify-content:space-between } hover --bg-hover; chevron SVG rotating 90° on [open]; right-aligned "Show"/"Hide".

## 3. Language: one plain voice (no Simple/Expert toggle). Numbers and units stay; jargon goes into "?" popovers and Technical details.
Rewrites: "Data volume upper bound" → "How much data you could send home"; "Up to X GB if a dish listened every minute the link is open." → "Up to X GB, if NASA's dishes listened every minute Earth is reachable. Real missions get less: dish time is shared."; "DSN link open · closes in 5 h" → "Can talk to Earth · contact ends in 5 h"; "Longest dark spell 240 h" → "Longest time without Sun: 10 days (240 h)"; "The battery reaches the 20% limit 336 h after touchdown." → "The battery hits its 20% safety reserve 14 days (336 h) after landing."; "Mast (10 m)" → "Solar panels on a 10 m pole"; "Load in the dark (W)" → "Power used in the dark (W)"; slope line → "Ground: flat enough to land (2.0°; landers typically accept under 8°)"; "Patchy contact: longest gap 60 h, link open 22%…" → "Patchy contact with Earth: reachable 22% of the time, longest silence 60 h."; "Verdict thresholds are our planning rule, not a NASA requirement." → "Good / Marginal / Poor is our own rule of thumb, not an official NASA standard."; "Receive-only extra" → "Extra listen-only time (Earth low on the horizon)"; "Sky at cursor" → "The sky from the landing site"; "Method" → "How it works".

## 4. Visual direction: "mission-control editorial"
- Home hero from REAL data: inline-SVG south-pole chart; plot sites from sites.json with r = (90+lat)/20·R, θ = lon_e, latitude rings at −85° and −80° (mono labels); pins coloured by kind; selected pin pulses. Beside it, the real terrain_<site>.png of the hovered/selected site in a circular mask (border-radius:50%, 1px --border-strong) captioned "Real terrain: NASA LRO LOLA". Apollo 11 / Chandrayaan-3 go in an "Elsewhere on the Moon" chip list (don't fake their positions). moon_ldem4.png only as an 8%-opacity background texture behind the hero.
- Colour: keep tokens; add --glow-sun: 0 0 24px rgb(245 183 91 / .25), --glow-earth: 0 0 24px rgb(77 163 255 / .25) for tile icons only. Sun amber, Earth blue, battery --success/--danger by state, ground --text-secondary. Card depth: background linear-gradient(180deg, #18202a, var(--bg-section)).
- Icons: inline SVG 24px, stroke 1.75, currentColor, round caps; one Icon.tsx: sun, earth, battery (fill width = SoC), terrain, pole, chevron, plus, help.
- Type: Inter body; headline clamp(1.5rem, 1rem + 1.6vw, 2rem) weight 650, -0.01em tracking; Plex Mono tabular-nums for numbers/units; tile numbers 28px.
- Motion (inside @media (prefers-reduced-motion: no-preference)): 150ms hover lift on choice cards (translateY(-2px) + border colour); tray slide-up 200ms; battery icon fill 300ms; pin pulse 2s opacity loop.
- Focus: outline 2px solid var(--accent-primary); outline-offset 2px on cards, chips, summaries.

## 5. Build list (~60 min)
P0: (1) routes, nav, Home.tsx with 3 cards + preset chips; (2) PowerSection with sliders/number boxes, mast switch with delta, battery chart + caption, lander fields removed from PlanDetails; (3) lib/answer.ts (tests first) + AnswerHero + 4 tiles + "what would fix this" hint; (4) compare state, "+ Compare" buttons, CompareTray, ComparePage; (5) equal-height cards + disclosure styling, Details split in three; (6) Validation → MethodPage; (7) string rewrites.
P1: (8) Home polar-chart hero with real terrain preview; (9) "?" popovers; (10) "Copy link to this plan" (site, date, hours, lander in the hash); (11) glossary on How it works (DSN, kWh, reserve, slope); (12) print/export Compare.
