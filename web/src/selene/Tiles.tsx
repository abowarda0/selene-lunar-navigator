import type { ReactElement } from "react";
import type { VerdictLevel } from "../api/types";
import { plainDuration } from "../lib/answer";
import { slopeClass } from "../lib/facts";
import type { PowerPlan } from "../lib/powerPlan";
import { Help } from "./Help";
import { Icon, type IconName } from "./Icon";
import type { BodyState } from "../lib/now";
import type { SunHeight } from "../lib/sunHeight";

const deg1 = (v: number): string => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}°`;

const soon = (h: number): string => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : plainDuration(h));
/** Compact form for the big tile number: "23 min", "13 h", "14.4 days". */
const soonShort = (h: number): string => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 72 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);

interface TileProps {
  readonly icon: IconName;
  readonly tone: string;
  readonly label: string;
  readonly big: string;
  readonly line: string;
  readonly help: string;
  readonly fill?: number;
}

function Tile({ icon, tone, label, big, line, help, fill }: TileProps): ReactElement {
  return (
    <li className={`tile ${tone}`}>
      <div className="tile-top">
        <span className="tile-ic"><Icon name={icon} fill={fill} /></span>
        <span className="tile-l">{label}</span>
        <Help topic={label.toLowerCase()} text={help} />
      </div>
      <span className="tile-n mono">{big}</span>
      <span className="tile-line">{line}</span>
    </li>
  );
}

const GROUND: Readonly<Record<VerdictLevel, string>> = { good: "Flat enough to land", marginal: "Sloped, caution", poor: "Too steep" };

interface Props {
  readonly pp: PowerPlan;
  readonly hours: number;
  readonly slopeDeg: number | null;
  /** Sun and two-way link at touchdown, with hours to the next change (from the full-year windows). */
  readonly sunNow: BodyState;
  readonly linkNow: BodyState;
  /** Solar elevation at touchdown and the highest it gets during the mission (from the sky track). */
  readonly sunHeight: SunHeight | null;
  readonly maxSunElDeg: number | null;
  /** Share of the mission with any part of Earth above the skyline (line of sight, not a link). */
  readonly earthViewPct: number;
}

/** Sunlight, contact with Earth, time left at touchdown and ground, each as one big number. */
export function Tiles({ pp, hours, slopeDeg, sunNow, linkNow, sunHeight, maxSunElDeg, earthViewPct }: Props): ReactElement {
  const sunPct = (pp.chosen.sunHours / hours) * 100;
  const c = pp.verdict.comms;
  const slope = slopeDeg != null && Number.isFinite(slopeDeg) ? slopeClass(slopeDeg) : null;
  return (
    <ul className="tiles" aria-label="Key figures">
      <Tile icon="sun" tone="t-sun" label="Sunlight" big={`${Math.round(sunPct)}%`} line={`of the time · longest dark ${plainDuration(pp.chosen.longestDarkH)}`}
        help="Share of the mission when part of the Sun is above the real hills around the site. Solar panels only work then." />
      <Tile icon="sun" tone="t-sun" label="Sun height"
        big={sunHeight ? deg1(sunHeight.elDeg) : "–"}
        line={sunHeight
          ? `${sunHeight.clearanceDeg >= 0 ? `clears the hills by ${deg1(sunHeight.clearanceDeg)}` : `${deg1(-sunHeight.clearanceDeg)} behind the hills`} at touchdown${maxSunElDeg != null ? ` · highest ${deg1(maxSunElDeg)}` : ""}`
          : "Outside the stored sky track"}
        help="Solar elevation angle: how high the centre of the Sun is above a flat horizon. Near the pole it stays within a few degrees, so panels must stand almost upright and a nearby hill can hide the Sun. From JPL Horizons, against the LOLA skyline." />
      <Tile icon="earth" tone="t-earth" label="Contact with Earth" big={`${Math.round(c.sharePct)}%`} line={`two-way link · longest silence ${plainDuration(c.longestGapH)} · Earth in view ${Math.round(earthViewPct)}%`}
        help="Two-way link: Earth is above the hills and one of NASA's three big Deep Space Network dishes is high enough to talk. 'Earth in view' is plain line of sight (any part of Earth above the hills), which is the upper limit for direct-to-Earth contact." />
      <Tile icon="sun" tone="t-sun" label="Time left at touchdown"
        big={sunNow.hoursToChange == null ? (sunNow.up ? "No sunset" : "No sunrise") : `${sunNow.up ? "Sunset" : "Sunrise"} in ${soonShort(sunNow.hoursToChange)}`}
        line={linkNow.hoursToChange == null ? (linkNow.up ? "Earth contact holds through the data" : "No Earth contact in the data") : linkNow.up ? `Earth contact ends in ${soon(linkNow.hoursToChange)}` : `Earth contact starts in ${soon(linkNow.hoursToChange)}`}
        help="Counted from the landing moment. Sunset means the last of the Sun's disc drops behind the real hills; Earth contact ends when no NASA dish can hold a two-way link." />
      <Tile icon="terrain" tone="t-ground" label="Ground" big={slope ? `${slopeDeg?.toFixed(1)}°` : "–"} line={slope ? GROUND[slope.level] : "Slope not measured here"}
        help="How steep the ground is at the sample point, from NASA's elevation maps. Landers typically accept under 8°. Small rocks are not visible in these maps." />
    </ul>
  );
}
