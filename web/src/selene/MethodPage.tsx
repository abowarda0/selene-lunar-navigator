import { VerdictKey } from "./VerdictKey";
import type { ReactElement } from "react";

const GLOSSARY = [
  ["DSN (Deep Space Network)", "NASA's three big radio dish stations in California, Spain and Australia. A Moon spacecraft can only talk to Earth when one of them can see it."],
  ["kWh (kilowatt-hour)", "A unit of stored energy. A 4 kWh battery can run a 60 W heater for about 67 hours."],
  ["Safety reserve", "Battery charge that is never used, to protect the battery. Reaching it counts as running out of power."],
  ["Slope", "How tilted the ground is, in degrees. Landers typically need under 8°; above 15° risks tipping over."],
  ["Two-way DSN link", "A 70 m dish is at least 10° above its horizon and Earth is above the lunar skyline."],
  ["Skyline", "Where the ground meets the sky around the lander, set by the real mountains up to 150 km away."],
  ["Sunrise / sunset", "The moment any part of the Sun's disc clears, or the last of it drops behind, the real skyline. Not the flat horizon."],
  ["Earthrise / earthset", "The same for Earth. Earth barely moves in the lunar sky, so near the pole a ridge can hide it for days."],
  ["Short flash", "A sunlit or Earth-visible period under 1 hour, usually the Sun grazing a ridge. Too short to rely on."],
  ["+h", "Hours after touchdown."],
  ["pts", "Percentage points: the difference between two percentages."],
] as const;

/** What SELENE computes, from what, and how far to trust it. */
export function MethodPage(): ReactElement {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="s-pagehead">
        <div style={{ display: "grid", gap: 8, maxWidth: "68ch" }}>
          <h1 className="headline">How it works</h1>
          <span className="sec">What is calculated, the data behind it, and how it was checked against NASA.</span>
        </div>
      </div>

      <div className="meth">
        <section className="s-card">
          <div className="s-card-head"><h2>What is computed</h2></div>
          <p>For each site we know the position of the Sun and of Earth in its sky every minute, and the height of the real skyline in every direction. The Sun counts as visible when any part of its disc is above the skyline (as in NASA's illumination maps). Earth counts as reachable when one of NASA's three 70 m Deep Space Network dishes is above the skyline and the Moon is at least 10° up in that dish's sky (two-way link).</p>
          <p>For a touchdown time the visible periods are cut to the plan duration. The verdict is the worse of two checks: does the mission fit inside the sunlight, and can a NASA dish hold a two-way link often enough. The battery model is a separate, optional check and does not set the verdict.</p>
        </section>
        <section className="s-card">
          <div className="s-card-head"><h2>Sources</h2></div>
          <p><b>Sun and Earth positions:</b> NASA JPL Horizons (DE441), every 10 minutes, interpolated to every minute. Near the pole the Sun climbs about 0.004° a minute, so the interpolation error is far below the terrain error.</p>
          <p><b>Terrain:</b> NASA LRO LOLA elevation maps. Near the pole: 5 m pixels within 6 km, 20 m to 30 km, 120 m to 150 km. At 69° S: 60 m to 30 km, then 240 m. Only a window around each site is downloaded.</p>
          <p><b>Site locator:</b> the global LOLA map at 4 pixels per degree, shaded. It shows relief, not a photograph.</p>
          <p><b>Not yet re-checked:</b> the 5 m / 1-minute engine used for this data has not yet been re-checked against NASA's maps; the validation below used the 120/240 m engine.</p>
        </section>
      </div>

      <section className="s-card" aria-labelledby="vk-h">
        <div className="s-card-head"><h2 id="vk-h">What Good, Marginal and Poor mean</h2></div>
        <VerdictKey />
      </section>
      <section className="s-card" id="validation">
        <div className="s-card-head"><h2>How we checked it</h2></div>
        <ul className="checked">
          <li><b className="mono">0 mismatches</b> against the Sun and Earth visibility flags NASA JPL Horizons prints itself, over 8,638 rows (smooth-Moon check).</li>
          <li><b className="mono">Within 2.4 pts</b> of NASA's illumination maps at 6 of 8 polar points (120/240 m engine).</li>
          <li><b className="mono">Up to 62 pts</b>: how wrong the answer gets if the hills are ignored.</li>
        </ul>
        <p className="src">The 5 m engine used for this data has not yet been re-checked against NASA's maps.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="ledger">
            <thead><tr><th>Check</th><th>Result</th><th>Against</th></tr></thead>
            <tbody>
              <tr><td>Our reading of Sun and Earth visibility</td><td>0 mismatches</td><td>The visibility flags JPL Horizons prints itself, 8,638 rows</td></tr>
              <tr><td>Long-term sunlight and Earth time near the pole</td><td>6 of 8 within 2.4 pts</td><td>NASA's LOLA illumination maps, including permanent shadow and blocked Earth</td></tr>
              <tr><td>The two ridge-top test points</td><td>+2 and +12 pts</td><td>Inside NASA's own spread between neighbouring pixels</td></tr>
              <tr><td>The same points with a flat horizon</td><td style={{ color: "var(--danger)" }}>up to 62 pts off</td><td>A flat horizon puts 55% sunlight on a crater floor that never sees the Sun</td></tr>
              <tr><td>1-minute vs 10-minute steps, ridge top, 4 months</td><td>identical windows</td><td>At 120 m terrain; the 5 m terrain is what reveals the short flashes</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="s-card" aria-label="Power model limits">
        <div className="s-card-head"><h2>Power model limits</h2></div>
        <p>The battery chart is energy bookkeeping only: panel watts in sunlight, minus the loads, minus the radio while the link is open, starting fully charged. It has no thermal model, no charge or discharge losses and no loss of capacity in the cold, so real batteries do worse.</p>
        <p>Everything is for one sample point, not the whole landing region; a few metres away the skyline and the dark spells can differ. The stored data covers about 14 months, so touchdowns near its end cannot be analysed for long windows.</p>
        <p>Lander presets are illustrative class values. The 10 m pole option changes only the Sun windows; the radio link is still computed at 2 m, so the mast result is indicative. Good / Marginal / Poor is our own rule of thumb (for contact: silences under 24 h and Earth reachable at least 30% of the time), not an official NASA standard.</p>
      </section>

      <div className="meth">
        <section className="s-card">
          <div className="s-card-head"><h2>What it does not tell you</h2></div>
          <p>Boulders smaller than the terrain pixels (5–60 m) are not in the maps. The lander's eye height is fixed at 2 m; on ridges, height changes sunlight by up to 3 points.</p>
          <p>The two-way DSN link is geometry only (dish elevation and skyline), not a full link budget or a booked pass. The power and battery card uses illustrative lander classes, not real vehicle specifications.</p>
          <p>Sites without LOLA polar terrain (for example near the equator) use a smooth Moon and are marked.</p>
        </section>
        <section className="s-card">
          <div className="s-card-head"><h2>Words used here</h2></div>
          <dl style={{ margin: 0, display: "grid", gap: 10 }}>
            {GLOSSARY.map(([t, d]) => <div key={t}><dt style={{ fontWeight: 500 }}>{t}</dt><dd className="sec" style={{ margin: 0 }}>{d}</dd></div>)}
          </dl>
        </section>
      </div>
    </div>
  );
}
