/** Helpers for the 3D terrain view: decode the LOLA height grid, place the Sun, test a moment against windows. */
import type { VisWindow } from "../api/types";
import { toMs } from "./format";

export interface HeightGrid {
  readonly site: string;
  readonly half_width_m: number;
  readonly n: number;
  readonly step_m: number;
  readonly h_min_m: number;
  readonly h_max_m: number;
  readonly dem: readonly string[];
  readonly heights_b64: string;
  readonly provenance: string;
}

/** Little-endian int16 metres, row 0 = north edge, column 0 = west edge. */
export function decodeHeights(b64: string, n: number): Int16Array {
  const bin = atob(b64);
  if (bin.length !== n * n * 2) throw new Error(`height grid has ${bin.length / 2} values, expected ${n * n}`);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Unit vector toward a body: x = east, y = up, z = south (north is -z). */
export function sunVector(azDeg: number, elDeg: number): readonly [number, number, number] {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

export function isInside(windows: readonly VisWindow[], iso: string): boolean {
  const t = toMs(iso);
  return windows.some((w) => toMs(w.start) <= t && t < toMs(w.end));
}
