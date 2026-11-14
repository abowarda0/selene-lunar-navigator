/** Small site facts: data volume over the link and ground slope bands. */
import type { VerdictLevel } from "../api/types";

const SEC_PER_H = 3600;
const MBIT_PER_GB = 8000;
const SLOPE_OK_DEG = 8;
const SLOPE_CAUTION_DEG = 15;

/** Gigabytes a dish could receive if it listened every minute the link is open. */
export const dataVolumeGB = (linkHours: number, mbps: number): number => (linkHours * SEC_PER_H * mbps) / MBIT_PER_GB;

/** Bands commonly used in polar landing-site studies. */
export function slopeClass(deg: number): { level: VerdictLevel; label: string } {
  if (deg < SLOPE_OK_DEG) return { level: "good", label: `under ${SLOPE_OK_DEG}°: within typical lander limits` };
  if (deg <= SLOPE_CAUTION_DEG) return { level: "marginal", label: `${SLOPE_OK_DEG}–${SLOPE_CAUTION_DEG}°: caution` };
  return { level: "poor", label: `over ${SLOPE_CAUTION_DEG}°: too steep` };
}
