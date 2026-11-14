import type { ReactElement } from "react";
import type { VisWindow } from "../api/types";
import { plainDuration } from "../lib/answer";
import { fmtHours } from "../lib/format";
import { bodyStateAt, lowestPoint } from "../lib/now";
import type { SocPoint } from "../lib/power";

interface Props {
  readonly at: string;
  readonly stop: string;
  readonly sun: readonly VisWindow[];
  readonly link: readonly VisWindow[];
  readonly battery: readonly SocPoint[];
  readonly longestDarkH: number;
}

/** Four figures at the timeline cursor. */
export function NowStrip({ at, stop, sun, link, battery, longestDarkH }: Props): ReactElement {
  const s = bodyStateAt(sun, at, stop);
  const l = bodyStateAt(link, at, stop);
  const low = lowestPoint(battery);
  const sunText = s.up
    ? `Sun up · ${s.hoursToChange == null ? "up to plan end" : `sets in ${fmtHours(s.hoursToChange)}`}`
    : `Sun down · ${s.hoursToChange == null ? "down to plan end" : `rises in ${fmtHours(s.hoursToChange)}`}`;
  const linkText = l.up
    ? `Can talk to Earth · ${l.hoursToChange == null ? "until the plan ends" : `contact ends in ${fmtHours(l.hoursToChange)}`}`
    : `Out of contact with Earth · ${l.hoursToChange == null ? "until the plan ends" : `contact in ${fmtHours(l.hoursToChange)}`}`;
  return (
    <section aria-labelledby="now-h">
    <h2 id="now-h" className="sec-h">At the moment you point to</h2>
    <ul className="now">
      <li className={s.up ? "sun" : undefined}>{sunText}</li>
      <li className={l.up ? "link" : undefined}>{linkText}</li>
      <li>{low ? `Lowest battery ${Math.round(low.soc)}%, ${Math.round(low.h)} h after landing` : "Lowest battery not computed"}</li>
      <li>{longestDarkH > 0 ? `Longest time without Sun: ${plainDuration(longestDarkH)}` : "The Sun never sets during the plan"}</li>
    </ul>
    </section>
  );
}
