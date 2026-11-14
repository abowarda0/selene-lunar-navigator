const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const TWO_DAYS_H = 48;

export const toMs = (iso: string): number => Date.parse(iso);

export function fmtDate(iso: string): string {
  const d = new Date(toMs(iso));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(toMs(iso));
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm}`;
}

export function fmtDay(iso: string): string {
  const d = new Date(toMs(iso));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const one = (v: number): string => v.toFixed(1);

export interface DurParts {
  readonly big: string;
  readonly small: string;
}

/** A duration in hours as a headline part and an optional exact part. */
export function durParts(hours: number): DurParts {
  if (hours >= TWO_DAYS_H) return { big: `${(hours / 24).toFixed(1)} days`, small: `${hours.toFixed(1)} h` };
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return { big: h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")} m`, small: "" };
}

export function durText(hours: number): string {
  const p = durParts(hours);
  return p.small ? `${p.big} (${p.small})` : p.big;
}

export const latText = (lat: number): string => `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}`;
export const lonText = (lon: number): string => `${lon.toFixed(3)}° E`;

export function signed(v: number, digits = 1): string {
  const s = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${s}${Math.abs(v).toFixed(digits)}`;
}

/** Percent of time in everyday words, for Explain mode. */
export function plainShare(percent: number): string {
  if (percent >= 99.95) return "all the time";
  if (percent >= 90) return "almost all the time";
  if (percent >= 60) return "most of the time";
  if (percent >= 40) return "about half the time";
  if (percent >= 10) return "some of the time";
  if (percent > 0) return "rarely";
  return "never";
}

export function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00Z`) + days * 864e5).toISOString().slice(0, 10);
}

/** "16 Mar 2027 00:00 UTC" */
export function fmtUtc(iso: string): string {
  const d = new Date(toMs(iso));
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${fmtDate(iso)} ${hh}:${mm} UTC`;
}

const LONG_H = 100;

/** "41 h 12 m" under 100 h; "253 h (10.5 d)" from 100 h. */
export function fmtHours(hours: number): string {
  if (hours >= LONG_H) return `${Math.round(hours)} h (${(hours / 24).toFixed(1)} d)`;
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} m`;
}
