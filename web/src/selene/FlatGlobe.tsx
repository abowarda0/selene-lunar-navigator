import { useEffect, useRef, type ReactElement } from "react";
import { api } from "../api/client";
import type { Site } from "../api/types";

const RAD = Math.PI / 180;
const SIZE = 640;
const VIEW_LAT = -62;   // tilt toward the south pole, like the 3D view

interface Props {
  readonly sites: readonly Site[];
  readonly selected: string;
  readonly onPick: (id: string) => void;
}

/** Orthographic projection of lat/lon (degrees) seen from (lat0, lon0); null when on the far side. */
function project(lat: number, lon: number, lat0: number, lon0: number): [number, number] | null {
  const p = lat * RAD;
  const l = (lon - lon0) * RAD;
  const p0 = lat0 * RAD;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  if (cosc < 0) return null;
  return [Math.cos(p) * Math.sin(l), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)];
}

/** Same LOLA relief as the 3D globe, drawn on a 2D canvas for browsers without WebGL. */
export function FlatGlobe({ sites, selected, onPick }: Props): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lon0 = sites.find((s) => s.id === selected)?.lon_e ?? 0;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = canvas.current;
      if (!c) return;
      const src = document.createElement("canvas");
      src.width = img.width;
      src.height = img.height;
      const sctx = src.getContext("2d");
      const ctx = c.getContext("2d");
      if (!sctx || !ctx) return;
      sctx.drawImage(img, 0, 0);
      const tex = sctx.getImageData(0, 0, img.width, img.height).data;
      const out = ctx.createImageData(SIZE, SIZE);
      const p0 = VIEW_LAT * RAD;
      for (let py = 0; py < SIZE; py += 1) {
        for (let px = 0; px < SIZE; px += 1) {
          const x = (px / SIZE) * 2 - 1;
          const y = 1 - (py / SIZE) * 2;
          const rho = Math.hypot(x, y);
          if (rho > 1) continue;
          const c0 = Math.asin(rho);
          const lat = rho === 0 ? p0 : Math.asin(Math.cos(c0) * Math.sin(p0) + (y * Math.sin(c0) * Math.cos(p0)) / rho);
          const lon = lon0 * RAD + Math.atan2(x * Math.sin(c0), rho * Math.cos(c0) * Math.cos(p0) - y * Math.sin(c0) * Math.sin(p0));
          const u = ((((lon / RAD) % 360) + 360) % 360) / 360;
          const v = (90 - lat / RAD) / 180;
          const si = (Math.min(img.height - 1, Math.floor(v * img.height)) * img.width + Math.min(img.width - 1, Math.floor(u * img.width))) * 4;
          const shade = 0.35 + 0.65 * Math.cos(c0) ** 0.6;   // limb darkening
          const o = (py * SIZE + px) * 4;
          out.data[o] = tex[si] * shade;
          out.data[o + 1] = tex[si + 1] * shade;
          out.data[o + 2] = tex[si + 2] * shade;
          out.data[o + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
    };
    img.src = api.assetUrl("moon_ldem4.png");
  }, [lon0]);

  return (
    <div className="globe-wrap">
      <canvas ref={canvas} width={SIZE} height={SIZE} role="img" aria-label="The Moon seen from above the south polar region, from NASA LOLA relief" style={{ cursor: "default" }} />
      <svg viewBox="-1 -1 2 2" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {sites.map((s) => {
          const p = project(s.lat, s.lon_e, VIEW_LAT, lon0);
          if (!p) return null;
          const sel = s.id === selected;
          return (
            <g key={s.id} role="button" tabIndex={0} aria-label={`Choose ${s.name}`} style={{ cursor: "pointer" }} onClick={() => onPick(s.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPick(s.id); }}>
              <circle cx={p[0]} cy={-p[1]} r={0.045} fill="transparent" />
              {sel && <circle cx={p[0]} cy={-p[1]} r={0.035} fill="none" stroke="var(--accent-warm)" strokeWidth={0.008} />}
              <circle cx={p[0]} cy={-p[1]} r={0.016} fill={sel ? "var(--accent-warm)" : "var(--accent-soft)"} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
