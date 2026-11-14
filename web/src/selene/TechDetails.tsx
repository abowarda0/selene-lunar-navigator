import { useState, type ReactElement } from "react";
import type { Site } from "../api/types";
import { SkyDome, type DomeData } from "../components/SkyDome";
import type { EventKind, SkyEvent } from "../lib/analysis";
import { fmtUtc } from "../lib/format";
import { Disclosure } from "./Disclosure";

const EVENT_NAME: Readonly<Record<EventKind, string>> = { sunrise: "Sunrise", sunset: "Sunset", earthrise: "Earth reachable", earthset: "Earth out of reach" };
const FIRST_EVENTS = 10;
const one = (v: number): string => v.toFixed(1);

interface Props {
  readonly site: Site;
  readonly dome: DomeData;
  readonly idx: number;
  readonly events: readonly SkyEvent[];
  readonly mast: boolean;
}

function Events({ events }: { readonly events: readonly SkyEvent[] }): ReactElement {
  const [all, setAll] = useState(false);
  const shown = all ? events : events.slice(0, FIRST_EVENTS);
  return (
    <>
      {events.length === 0 ? <p className="muted">Nothing rises or sets during the plan.</p> : (
        <table className="tbl">
          <thead><tr><th>Event</th><th>Time (UTC)</th><th className="num">After landing (h)</th></tr></thead>
          <tbody>{shown.map((e) => <tr key={`${e.kind}${e.t}`}><td>{EVENT_NAME[e.kind]}</td><td className="mono">{fmtUtc(e.t)}</td><td className="num">{e.hoursAfter.toFixed(1)}</td></tr>)}</tbody>
        </table>
      )}
      {events.length > FIRST_EVENTS && <button type="button" className="btn link-btn" onClick={() => setAll(!all)}>{all ? `Show first ${FIRST_EVENTS} events` : `Show all ${events.length} events`}</button>}
      <p className="src">Seen from 2 m above the ground. Times ±2 min from skyline sampling; up to 18 min on ridge tops.</p>
    </>
  );
}

/** Sky dome, sunrise/sunset list and sources, each in its own disclosure. */
export function TechDetails({ site, dome, idx, events, mast }: Props): ReactElement {
  const s = dome.series;
  return (
    <section className="tech" aria-labelledby="tech-h">
      <h2 id="tech-h" className="sec-h">Technical details</h2>
      <Disclosure title="The sky from the landing site">
        <div className="dome-box"><SkyDome layers={[{ data: dome, line: "solid" }]} idx={idx} crossings label={`Sky over ${site.name}: skyline, Sun and Earth paths for the plan`} /></div>
        <p className="readout mono">
          <span className="sun">Sun az {one(s.sun_az[idx])}° el {one(s.sun_el[idx])}°</span>
          <span className="link">Earth az {one(s.earth_az[idx])}° el {one(s.earth_el[idx])}°</span>
        </p>
        <p className="src">At the moment you point to on the timeline. LOLA skyline, 0.05° azimuth step · Sun/Earth: JPL Horizons (DE441), 30-minute track</p>
      </Disclosure>
      <Disclosure title="Sunrise and sunset list"><Events events={events} /></Disclosure>
      <Disclosure title="Sources and accuracy">
        <ul className="srcs">
          <li>Sun and Earth positions: NASA JPL Horizons (DE441).</li>
          <li>Hills and skyline: NASA LRO LOLA polar elevation maps, 5–240 m pixels.</li>
          <li>Contact with Earth: NASA Deep Space Network dishes at least 10° up for two-way contact, 6° for listen-only (DSN 810-005).</li>
          <li>Battery: our simple energy model, no heating and no charge losses.{mast ? " Panels on a 10 m pole change the sunlight only; contact is still computed at 2 m." : ""}</li>
          <li>Good / Marginal / Poor is our own rule of thumb, not an official NASA standard. Spacecraft values are illustrative classes.</li>
        </ul>
      </Disclosure>
    </section>
  );
}
