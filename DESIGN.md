---
name: Landing Site Navigator
description: A solar site-survey sheet for comparing lunar landing sites and dates against the real skyline.
colors:
  ink: "#0e1a24"
  ink-2: "#44535f"
  ink-3: "#6a7a86"
  paper: "#f8fafb"
  paper-2: "#eef3f5"
  desk: "#e4eaee"
  rule: "#c2ced5"
  rule-strong: "#8fa0ab"
  grid: "rgba(64, 120, 150, 0.08)"
  grid-major: "rgba(64, 120, 150, 0.15)"
  acetate: "rgba(255, 255, 255, 0.45)"
  sun: "#e8871e"
  sun-ink: "#9c520a"
  earth: "#2f6db5"
  earth-ink: "#235894"
  terrain: "#8b5a2b"
  terrain-fill: "rgba(139, 90, 43, 0.26)"
  both: "#2e8b57"
  both-fill: "rgba(46, 139, 87, 0.14)"
  smooth: "#9a9a9a"
  good: "#1f7346"
  good-bg: "#e2f1e8"
  marginal: "#8f5b06"
  marginal-bg: "#f8ecd2"
  poor: "#ad2a20"
  poor-bg: "#f8e1de"
  focus: "#2f6db5"
  night-desk: "#081018"
  night-paper: "#0f1923"
  night-paper-2: "#14212d"
  night-ink: "#e6edf2"
  night-ink-2: "#a6b6c2"
  night-rule: "#26384a"
  night-rule-strong: "#3d5468"
typography:
  display:
    fontFamily: "Barlow, Helvetica Neue, Arial, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow, Helvetica Neue, Arial, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  title:
    fontFamily: "Barlow, Helvetica Neue, Arial, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Barlow, Helvetica Neue, Arial, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  body-small:
    fontFamily: "Barlow, Helvetica Neue, Arial, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow Condensed, Barlow, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  drawing-label:
    fontFamily: "Barlow Condensed, Barlow, Arial Narrow, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  r: "4px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  segmented-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "6px 12px"
    height: "36px"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "0 12px"
    height: "44px"
  tag:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  verdict-good:
    backgroundColor: "{colors.good-bg}"
    textColor: "{colors.good}"
  verdict-marginal:
    backgroundColor: "{colors.marginal-bg}"
    textColor: "{colors.marginal}"
  verdict-poor:
    backgroundColor: "{colors.poor-bg}"
    textColor: "{colors.poor}"
  dome-card:
    backgroundColor: "{colors.acetate}"
    rounded: "{rounded.r}"
    padding: "16px"
---

# Design System: Landing Site Navigator

## Overview

**Creative North Star: "The Survey Sheet"**

Every screen is one sheet of cool white survey paper laid on a pale desk: a millimetre grid printed under everything, one blue-black ink for structure and words, and a small set of team inks that only ever mean something (Sun, Earth, terrain, both-up). Content is organised the way a surveyor organises a drawing: ruled sections under heavy ink rules, a title block with labelled cells, a drawn time scale, tables with condensed column heads. The sky dome, the view straight up from the lander with the real skyline traced around its rim, is drawn on a clear acetate overlay and is the one element that lifts off the sheet.

Density is planner-grade: tabular figures everywhere, exact numbers next to plain words, small condensed labels on drawings. Hierarchy comes from weight and rule thickness rather than boxes and fills. At night the same sheet becomes ink-blue paper with a lifted grid; the drawing does not change, only the paper and ink swap.

The system refuses the dark space-ops dashboard: no metric-tile grids, no glowing panels, no decorative colour.

**Key Characteristics:**
- Cool white paper (`paper`) with a 12px minor / 60px major grid on a slightly darker desk.
- One ink (`ink`) for text, rules, primary actions and selection.
- Team inks reserved for data meaning: Sun, Earth, terrain, both-up, smooth Moon.
- Sections ruled by a 2px ink top rule, never wrapped in cards.
- The acetate sky dome is the only element lifted at rest.
- Barlow at every level, Barlow Condensed for labels and drawing annotation, tabular lining figures.
- Light and night sheets are equal citizens.

## Colors

One structural ink on cool paper, with semantic inks that carry the team's figure palette and nothing else.

### Primary
- **Survey Ink** (`ink`): all text, 2px section rules, the title-block frame, primary buttons, selected chips and segmented options, the time-scale cursor. It is the only colour that may express emphasis without meaning.
- **Second Ink** (`ink-2`): secondary text, hints, column heads, drawing labels, primary-button hover.
- **Third Ink** (`ink-3`): non-text marks only (dashed no-data cell borders, neutral deltas at large size); it falls under 4.5:1 on paper, so it never carries small text.

### Secondary (team inks, meaning only)
- **Sun Orange** (`sun`): the Sun arc, Sun marker, Sun window lane and swatch. Never as text on paper (2.5:1); Sun text uses **Burnt Sun Ink** (`sun-ink`).
- **Earth Blue** (`earth`): the Earth arc, marker, window lane. Earth text uses **Deep Earth Ink** (`earth-ink`), which is also the link colour.
- **Terrain Brown** (`terrain`) and **Terrain Wash** (`terrain-fill`): the LOLA skyline line and the ground between skyline and rim on the dome; terrain lines on charts.
- **Both-up Green** (`both`) and **Both Wash** (`both-fill`): the both-up lane, swatch, chart band, and large readings values.
- **Smooth Moon Grey** (`smooth`): the dotted flat-horizon ring when a site has no terrain data.

### Tertiary (verdict states)
- **Good** (`good` on `good-bg`), **Marginal** (`marginal` on `marginal-bg`), **Poor** (`poor` on `poor-bg`): verdict cell, verdict pill, matrix cells, alerts, compare deltas. Always paired with a word and an icon.

### Neutral
- **Survey Paper** (`paper`): the sheet, inputs, buttons, the inside of the dome rim.
- **Paper Shade** (`paper-2`): hover fills, the time-scale lane beds, the scrub readout strip.
- **Desk** (`desk`): the page behind the sheet; the sheet's edges are visible on wide screens.
- **Grid / Grid Major** (`grid`, `grid-major`): the printed millimetre grid only.
- **Rule** (`rule`) and **Strong Rule** (`rule-strong`): table and row dividers; control borders and bearing ticks.
- **Acetate** (`acetate`): the translucent sheet the dome sits on.
- **Night sheet** (`night-*`): the dark theme swaps paper, desk, ink and rules for ink-blue equivalents; team and verdict inks shift lighter (defined in `tokens.css` under `prefers-color-scheme: dark` and `[data-theme="dark"]`).

### Named Rules
**The One Ink Rule.** Structure, emphasis and action are all drawn in Survey Ink. If an element is coloured, it must mean Sun, Earth, terrain, both-up, no-terrain, or a verdict level.

**The Ink-for-Text Rule.** Bright team inks draw lines, fills and markers; text in a team colour uses its `-ink` variant (Sun, Earth) or appears only at large bold sizes (both-up).

**The Never-Colour-Alone Rule.** Every coloured meaning also carries a word, an icon, or a line style (solid, dashed, dotted).

## Typography

**Display Font:** Barlow (with Helvetica Neue, Arial, system-ui)
**Body Font:** Barlow
**Label Font:** Barlow Condensed (with Barlow, Arial Narrow)

**Character:** A drafting-office grotesque used at every level, with its condensed cut doing the work of lettering on a drawing: field labels, axis labels, bearings, column heads. Tabular lining figures are on globally so numbers stack.

### Hierarchy
- **Display** (700, 2.5rem, 1.15): the first-screen page heading only; drops to 1.75rem at phone width.
- **Headline** (700, 1.75rem, 1.1): the site name in the title block, the verdict word (uppercase, 0.06em), readings values, the Explain answer heading.
- **Title** (700, 1.25rem): section headings under the ink rule, the product name in the header.
- **Body** (400, 1rem, 1.5): running text; lead paragraphs at 1.25rem capped at 62ch.
- **Body small** (400–600, 0.875rem): hints, meta lines, table cells, buttons in segmented controls and chips.
- **Label** (Condensed 600, 0.875rem, 0.04em): title-block field names, table column heads, the UTC note.
- **Drawing label** (Condensed 600, 11px, 0.04em): dome rings and bearings, chart axes, time-scale ticks. On phones the dome labels scale up (17–24px in the SVG viewBox) to stay legible.

### Named Rules
**The Lettering Rule.** Condensed type labels a field, an axis or a column; it never sets a sentence.

**The Tabular Rule.** Figures are always tabular and lining (`"tnum" 1, "lnum" 1`); never switch it off for a data surface.

## Layout

The sheet is centred at a 1440px maximum with 1px rule edges, padded `max(16px, 2.5vw)` with safe-area insets, and stacks its sections on a 32px gap. Spacing runs on a 4px base (`s1`–`s7`: 4, 8, 12, 16, 24, 32, 48). Section internals use 12px under the rule; columns separate at 24–32px.

Views split asymmetrically, map or dome against readings: Sites 5:7, Survey 6:5, Compare 5:6, data/notes 3:2. At 1100px all two-column splits stack and the survey title block reflows to two columns with site and verdict spanning full width. At 720px the header nav drops to its own scrollable row, the UTC note hides, buttons go full width, readings left-align, wide window tables become a ruled list, and grids collapse to one column. Touch targets are 44px for buttons, fields and nav (36px for chips and segmented options).

## Elevation & Depth

The sheet is flat. Depth is carried by rule weight (1px rule, 1px strong rule, 2px ink rule, 2px ink frame) and by the paper/desk contrast. One shadow token exists, a soft drafting-table lift.

### Shadow Vocabulary
- **Acetate lift** (`box-shadow: 0 1px 0 rgba(14, 26, 36, 0.05), 0 10px 28px -16px rgba(14, 26, 36, 0.45)`; night `0 1px 0 rgba(0,0,0,0.3), 0 12px 30px -16px rgba(0,0,0,0.85)`): at rest only on the sky-dome card. As state feedback it also marks the selected site row and a hovered compare preset.

### Named Rules
**The One Overlay Rule.** Only the sky dome sits on translucent acetate and lifts at rest. Everything else is drawn on the paper.

## Shapes

A drafting form language: a single small radius (4px) on controls, the dome card, alerts and verdict pills; full pills (999px) only for chips and tags; circles for site marks, swatches and the dome itself. Sections have no corners at all: they are open, marked only by a top rule. The survey title block is square-cornered, framed in 2px ink with 1px strong-rule cell dividers. Icons are one authored family on a 24px grid, 2px round-jointed stroke.

## Components

### Buttons
Drafted and firm.
- **Shape:** gently squared (4px), 44px tall, 16px horizontal padding, weight 600.
- **Primary:** Survey Ink fill with paper text ("Survey this site", "Play", "Slip the landing").
- **Secondary:** paper fill, strong-rule border; on hover the border inks in and the fill shades to `paper-2`.
- **Hover / Active / Focus:** primary hover lightens to `ink-2`; all buttons press down 1px on active; focus is a 2px `focus` outline offset 2px. Disabled drops to 45% opacity.
- **Icon button:** 40px square, strong-rule border (theme toggle).

### Segmented control
Planner/Explain register switch: strong-rule outline, 36px options divided by strong rules; the pressed option fills with ink.

### Chips and tags
- **Chips:** pill, strong-rule border, paper fill, 600 small type; pressed fills with ink.
- **Tags:** small pill, 12px, `ink-2`; the warning tag ("Unverified position") takes the marginal ink and wash.

### Sections (instead of cards)
- **Ruled section:** 2px ink top rule, 12px gap, then a heading row (title left, legend or hint right on the baseline).
- **Readings:** a ruled survey table, not tiles: each row has a label with a round team swatch, a large right-aligned value in the team's text ink, and a small sub-line; rows divided by 1px rules under a 2px ink head rule.

### Inputs / Fields
- **Style:** 44px, paper fill, strong-rule 1px border, 4px radius, label above in 600 small type.
- **Hover:** border darkens to `ink-2`. **Focus:** global 2px focus outline.

### Navigation
The header is a sticky drawing title strip on paper: cells divided by 1px rules, product mark and name, text nav links in 600 small `ink-2` that ink in on hover and carry a 3px ink underline when current, then the register switch, the condensed UTC note and the theme button.

### Survey title block (signature)
The answer strip at the top of a survey: a 2px-ink-framed row of labelled cells (Site, Position, Period UTC, Terrain) ending in the verdict cell, which fills with the verdict wash and carries the verdict icon, the uppercase verdict word and the reason. Field names use the label style; values use body.

### Sky dome (signature)
An SVG plan of the sky on an acetate card: paper disc inside a 1.5px ink rim, dashed elevation rings at 10°, 30°, 60°, bearing ticks every 10° (major every 30° with labels, N/E/S/W in bold), the LOLA skyline in terrain brown with terrain wash to the rim. Sun and Earth tracks are drawn faint for the whole path and bold (3.2px) where visible; the solid layer draws itself in over 700ms. Compare layers are distinguished by solid, dashed (8 6) and dotted (1 6) line styles. Rise/set crossings are paper-filled ringed markers with leader lines; the moving markers fill when up and go dashed-hollow when below the skyline.

### Drawn time scale (signature)
The scrubber is a drafted scale, not a slider: an ink baseline with day ticks (major every 1, 2 or 5 days), three 5px window lanes (Sun, Earth, both) on paper-shade beds, and a 2px ink cursor with a triangular foot. A transparent native range input sits on top for keyboard and touch; focus outlines the whole scale. A paper-shade readout strip under it states the instant in words and team inks.

### Verdict states
Verdict pill (uppercase 600–700, 4px, 1px currentColor border, wash fill), matrix cell buttons (same colouring, dashed ink-3 border for no data), and alerts (icon + bold lead sentence, currentColor border, wash fill) share the good / marginal / poor pairs.

## Do's and Don'ts

### Do:
- **Do** separate sections with a 2px Survey Ink top rule and 12px of space; let the grid show through.
- **Do** reserve Sun, Earth, terrain, both-up and smooth-Moon inks for those meanings, and pair each with a word, icon or line style.
- **Do** set Sun and Earth text in `sun-ink` and `earth-ink`; keep bright `sun` and `earth` for strokes and fills.
- **Do** use Barlow Condensed 600 with 0.04em tracking for field labels, column heads and drawing annotation.
- **Do** keep tabular lining figures on every number.
- **Do** distinguish compared scenarios by line style (solid, dashed, dotted) on one shared dome.
- **Do** define every new colour for both the light sheet and the night sheet.

### Don't:
- **Don't** wrap sections in shadowed cards or build metric-tile grids; the readings are a ruled table.
- **Don't** put anything but the sky dome on acetate or give it the lift at rest.
- **Don't** colour structure, headings or decoration with a team or verdict ink.
- **Don't** use bright `sun` orange for text on paper.
- **Don't** set sentences in the condensed cut.
- **Don't** introduce a second radius beyond 4px and the pill.
