import type { ReactElement } from "react";
import type { VerdictLevel } from "../api/types";
import { plainDuration } from "../lib/answer";
import { slopeClass } from "../lib/facts";
import type { PowerPlan } from "../lib/powerPlan";
import { Help } from "./Help";
import { Icon, type IconName } from "./Icon";
import type { BodyState } from "../lib/now";

const soon = (h: number): string => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : plainDuration(h));

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
}

/** Sunlight, contact with Earth, time left at touchdown and ground, each as one big number. */
export function Tiles({ pp, hours, slopeDeg, sunNow, linkNow }: Props): ReactElement {
  const sunPct = (pp.chosen.sunHours / hours) * 100;
  const c = pp.verdict.comms;
  const slope = slopeDeg != null && Number.isFinite(slopeDeg) ? slopeClass(slopeDeg) : null;
  return (
    <ul className="tiles" aria-label="Key figures">
      <Tile icon="sun" tone="t-sun" label="Sunlight" big={`${Math.round(sunPct)}%`} line={`of the time · longest dark ${plainDuration(pp.chosen.longestDarkH)}`}
        help="Share of the mission when part of the Sun is above the real hills around the site. Solar panels only work then." />
      <Tile icon="earth" tone="t-earth" label="Contact with Earth" big={`${Math.round(c.sharePct)}%`} line={`of the time · longest silence ${plainDuration(c.longestGapH)}`}
        help="Earth is reachable when it is above the hills and one of NASA's three big Deep Space Network dishes can see the Moon. In between, the spacecraft cannot talk to anyone." />
      <Tile icon="sun" tone="t-sun" label="Time left at touchdown"
        big={sunNow.hoursToChange == null ? (sunNow.up ? "No sunset" : "No sunrise") : `${sunNow.up ? "Sunset" : "Sunrise"} in ${soon(sunNow.hoursToChange)}`}
        line={linkNow.hoursToChange == null ? (linkNow.up ? "Earth contact holds through the data" : "No Earth contact in the data") : linkNow.up ? `Earth contact ends in ${soon(linkNow.hoursToChange)}` : `Earth contact starts in ${soon(linkNow.hoursToChange)}`}
        help="Counted from the landing moment. Sunset means the last of the Sun's disc drops behind the real hills; Earth contact ends when no NASA dish can hold a two-way link." />
      <Tile icon="terrain" tone="t-ground" label="Ground" big={slope ? `${slopeDeg?.toFixed(1)}°` : "–"} line={slope ? GROUND[slope.level] : "Slope not measured here"}
        help="How steep the ground is at the sample point, from NASA's elevation maps. Landers typically accept under 8°. Small rocks are not visible in these maps." />
    </ul>
  );
}
