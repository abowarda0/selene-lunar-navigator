import type { ReactElement } from "react";
import { api } from "../api/client";
import type { TerrainMap as TerrainMapData } from "../api/types";

const VIEW = 600;
const RAD = Math.PI / 180;

interface Props {
  readonly map: TerrainMapData;
  readonly siteName: string;
  /** directions to draw, degrees from north */
  readonly sunAz: number;
  readonly earthAz: number;
}

function niceKm(halfM: number): number {
  for (const km of [1, 2, 5, 10, 20]) if (km * 1000 >= halfM / 3) return km;
  return 50;
}

/** North-up shaded relief around the site; dots mark the terrain that forms the skyline, rays point at the Sun and Earth. */
export function TerrainMap({ map, siteName, sunAz, earthAz }: Props): ReactElement {
  const c = VIEW / 2;
  const k = c / map.half_width_m;
  const inside = map.skyline_points.filter((p) => p.dist_m > 0 && p.dist_m <= map.half_width_m);
  const outside = map.skyline_points.filter((p) => p.dist_m > map.half_width_m);
  const edge = (az: number) => c / Math.max(Math.abs(Math.sin(az * RAD)), Math.abs(Math.cos(az * RAD)));
  const ray = (az: number, color: string, label: string) => {
    const x = c + Math.sin(az * RAD) * c * 0.96;
    const y = c - Math.cos(az * RAD) * c * 0.96;
    return (
      <g>
        <line x1={c} y1={c} x2={x} y2={y} stroke={color} strokeWidth={2.5} strokeDasharray="10 5" />
        <circle cx={x} cy={y} r={9} fill={color} stroke="#0b0f14" strokeWidth={2} />
        <text x={x} y={y + 24} textAnchor="middle" className="maplab" style={{ fill: "#fff" }}>{label}</text>
      </g>
    );
  };
  const km = niceKm(map.half_width_m);
  const bar = km * 1000 * k;
  return (
    <figure className="terrain-map">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={`Shaded relief ${Math.round((map.half_width_m * 2) / 1000)} km across around ${siteName}, with the terrain that forms its skyline`}>
        <image href={api.assetUrl(map.image)} x={0} y={0} width={VIEW} height={VIEW} preserveAspectRatio="none" />
        {inside.map((p) => (
          <circle key={p.az} cx={c + Math.sin(p.az * RAD) * p.dist_m * k} cy={c - Math.cos(p.az * RAD) * p.dist_m * k} r={2.6} fill="#ffd9a8" stroke="#1a0f05" strokeWidth={0.8}>
            <title>{`Skyline point at ${p.az}°: ${(p.dist_m / 1000).toFixed(1)} km away, ${p.elev_deg}° up`}</title>
          </circle>
        ))}
        {outside.map((p) => (
          // tick on the square frame where this azimuth leaves the map
          <line key={`o${p.az}`} x1={c + Math.sin(p.az * RAD) * edge(p.az) * 0.96} y1={c - Math.cos(p.az * RAD) * edge(p.az) * 0.96} x2={c + Math.sin(p.az * RAD) * edge(p.az)} y2={c - Math.cos(p.az * RAD) * edge(p.az)} stroke="#ffd9a8" strokeWidth={2.5} />
        ))}
        {ray(earthAz, "var(--earth)", "Earth")}
        {ray(sunAz, "var(--sun)", "Sun")}
        <circle cx={c} cy={c} r={7} fill="#fff" stroke="#0e1a24" strokeWidth={2.5} />
        <path d={`M${VIEW - 34} 52l12 -32l12 32l-12 -8z`} fill="#fff" stroke="#0e1a24" strokeWidth={1.5} />
        <text x={VIEW - 22} y={70} textAnchor="middle" className="maplab" style={{ fill: "#fff" }}>N</text>
        <rect x={20} y={VIEW - 40} width={bar} height={6} fill="#fff" stroke="#0e1a24" />
        <text x={20} y={VIEW - 48} className="maplab" style={{ fill: "#fff" }}>{km} km</text>
      </svg>
      <figcaption className="small muted">
        {map.dem[0]}. Heights {map.height_min_m.toLocaleString("en")} to {map.height_max_m.toLocaleString("en")} m. Dots: the ridges that set the skyline; ticks on the edge: skyline ridges farther than {Math.round(map.half_width_m / 1000)} km ({outside.length} of {map.skyline_points.length} directions).
      </figcaption>
    </figure>
  );
}
