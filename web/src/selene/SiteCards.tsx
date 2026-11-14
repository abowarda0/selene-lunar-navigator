import { useState, type ReactElement } from "react";
import type { Site, SiteFacts, VerdictLevel, VisWindow } from "../api/types";
import { TerrainMap } from "../components/TerrainMap";
import { useTerrain } from "../hooks";
import { dataVolumeGB, slopeClass } from "../lib/facts";
import { latText, lonText } from "../lib/format";
import { Help } from "./Help";

const CLS: Record<VerdictLevel, string> = { good: "ok", marginal: "warn", poor: "bad" };
const GROUND: Readonly<Record<VerdictLevel, string>> = { good: "flat enough to land", marginal: "sloped, land with caution", poor: "too steep to land safely" };
const gb = (v: number): string => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
const hoursOf = (ws: readonly VisWindow[]): number => ws.reduce((h, w) => h + (Date.parse(w.end) - Date.parse(w.start)) / 3_600_000, 0);

interface DataProps {
  readonly link: readonly VisWindow[];
  readonly receiveOnly: readonly VisWindow[] | null;
  readonly missionHours: number;
}

/** How much data could come home while Earth is reachable, at a rate the reader picks. */
/** Radio choices: the rate is set by the antenna and transmitter, not picked freely (illustrative class values). */
const RADIOS = [
  { id: "low", label: "Small antenna", mbps: 0.1, note: "low-gain antenna, small lander" },
  { id: "mid", label: "Medium antenna", mbps: 1, note: "medium-gain antenna, rover class" },
  { id: "high", label: "Dish antenna", mbps: 10, note: "steerable high-gain dish, large lander" },
] as const;
type RadioId = (typeof RADIOS)[number]["id"];
const RADIO_FOR: Record<string, RadioId> = { small: "low", rover: "mid", large: "high" };

export function DataCard({ link, receiveOnly, missionHours, preset }: DataProps & { readonly preset?: string }): ReactElement {
  const [radio, setRadio] = useState<RadioId>(RADIO_FOR[preset ?? ""] ?? "mid");
  const r = RADIOS.find((x) => x.id === radio) ?? RADIOS[1];
  const linkH = hoursOf(link);
  const total = dataVolumeGB(linkH, r.mbps);
  const extra = receiveOnly ? Math.max(0, hoursOf(receiveOnly) - linkH) : 0;
  const silent = Math.max(0, missionHours - linkH - extra);
  return (
    <section className="card" aria-labelledby="data-h">
      <h2 id="data-h" className="sec-h">Talking to Earth <Help topic="contact with Earth" text="NASA's three 70 m dishes (California, Spain, Australia) must see the Moon, and the lander must see the dish over the hills. Dishes may send commands only when the Moon is at least 10° up; between 6° and 10° they can only listen (NASA DSN handbook 810-005)." /></h2>
      <ul className="contact-bars" aria-label="Contact over the mission">
        <li><span className="cb two" style={{ flexGrow: linkH }} /><span className="cb rx" style={{ flexGrow: extra }} /><span className="cb none" style={{ flexGrow: silent }} /></li>
      </ul>
      <ul className="facts">
        <li><i className="sw two" /> Two-way: send commands and get data <b className="mono">{Math.round(linkH)} h</b></li>
        <li><i className="sw rx" /> Listen-only: data comes home, no commands (dish 6–10° up) <b className="mono">+{Math.round(extra)} h</b></li>
        <li><i className="sw none" /> No contact: needs a relay satellite <b className="mono">{Math.round(silent)} h</b></li>
      </ul>
      <div className="sc-field">
        <span className="sc-label">Radio on the spacecraft</span>
        <div className="seg seg3" role="radiogroup" aria-label="Radio on the spacecraft">
          {RADIOS.map((x) => <button key={x.id} type="button" role="radio" aria-checked={radio === x.id} className={radio === x.id ? "on" : ""} onClick={() => setRadio(x.id)}>{x.label}<small className="mono"> {x.mbps} Mbps</small></button>)}
        </div>
      </div>
      <p className="big-n mono">{gb(total)} GB</p>
      <p className="sec">The most data a {r.note} could send home in this mission at {r.mbps} Mbps, if a NASA dish listened every two-way hour. Real missions get less, because dish time is shared.</p>
      <p className="src">Why the speed is limited: it depends on the antenna size, the transmitter power and the 384,000 km to Earth (the "link budget"). A bigger antenna or more power is faster. Rates here are illustrative class values.</p>
    </section>
  );
}

interface GroundProps {
  readonly site: Site;
  readonly facts?: SiteFacts;
  readonly sunAz: number;
  readonly earthAz: number;
}

/** Slope at the sample point and the real terrain around it. */
export function GroundCard({ site, facts, sunAz, earthAz }: GroundProps): ReactElement {
  const terrain = useTerrain(site.id);
  const deg = facts?.slope_deg;
  const c = deg != null && Number.isFinite(deg) ? slopeClass(deg) : null;
  return (
    <section className="card" aria-labelledby="gr-h">
      <h2 id="gr-h" className="sec-h">The ground <Help topic="slope" text="Slope is how tilted the ground is. Landers typically accept under 8°; 8–15° needs caution; steeper risks tipping over. Measured from NASA LRO laser-altimeter maps, which do not show small rocks." /></h2>
      {c && deg != null
        ? <p><span className={`s-status ${CLS[c.level]}`}>Ground: {GROUND[c.level]} ({deg.toFixed(1)}°; landers typically accept under 8°)</span></p>
        : <p className="muted">Slope not measured at this point.</p>}
      <p className="mono muted">{latText(site.lat)} · {lonText(site.lon_e)}</p>
      {terrain.data
        ? <div className="thumb"><TerrainMap map={terrain.data} siteName={site.name} sunAz={sunAz} earthAz={earthAz} /></div>
        : <p className="muted">{terrain.loading ? "Loading the terrain map…" : site.terrain ? "No terrain map stored for this site." : "No terrain data for this site: smooth Moon."}</p>}
      <p className="src">{facts?.slope_baseline_m != null && facts.slope_dem_m != null ? `Slope over a ${facts.slope_baseline_m} m patch of a ${facts.slope_dem_m} m map, not a hazard check. ` : ""}{site.artemis_region ? "Sample point for the NASA region, not an official landing site." : site.coord_source}</p>
    </section>
  );
}
