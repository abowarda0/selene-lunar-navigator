import { describe, expect, test } from "vitest";
import type { VisWindow } from "../api/types";
import { darkSpells, simulatePower, type Lander } from "./power";

const w = (start: string, end: string): VisWindow => ({ start, end, hours: 0, open_start: false, open_end: false });
const T0 = "2027-01-01T00:00Z";
const lander: Lander = { panelW: 100, batteryKWh: 1, minSocPct: 20, sunLoadW: 50, darkLoadW: 100, commsW: 0 };
const sun = [w("2027-01-01T00:00Z", "2027-01-01T04:00Z")];

describe("simulatePower", () => {
  test("survives a short dark spell and reports the lowest charge", () => {
    const r = simulatePower({ start: T0, stop: "2027-01-01T10:00Z", sun, link: [], lander });
    expect(r.survives).toBe(true);
    expect(r.firstFloor).toBeNull();
    expect(r.lowestSocPct).toBeCloseTo(40);
    expect(r.batteryNeededKWh).toBeCloseTo(0.75);
    expect(r.loadMetPct).toBeCloseTo(100);
  });

  test("samples the charge every 30 minutes from full", () => {
    const r = simulatePower({ start: T0, stop: "2027-01-01T10:00Z", sun, link: [], lander });
    expect(r.series).toHaveLength(21);
    expect(r.series[0]).toEqual({ h: 0, soc: 100 });
    expect(r.series[20].h).toBe(10);
    expect(r.series[20].soc).toBeCloseTo(40);
  });

  test("hits the floor at the exact time and leaves the load unmet after that", () => {
    const r = simulatePower({ start: T0, stop: "2027-01-01T14:00Z", sun, link: [], lander });
    expect(r.survives).toBe(false);
    expect(r.firstFloor).toEqual({ t: "2027-01-01T12:00Z", hoursAfter: 12 });
    expect(r.lowestSocPct).toBeCloseTo(20);
    expect(r.loadMetPct).toBeCloseTo((12 / 14) * 100);
    expect(r.batteryNeededKWh).toBeCloseTo(1.25);
  });

  test("adds the radio load while the link is open", () => {
    const link = [w("2027-01-01T04:00Z", "2027-01-01T06:00Z")];
    const r = simulatePower({ start: T0, stop: "2027-01-01T10:00Z", sun, link, lander: { ...lander, commsW: 50 } });
    expect(r.lowestSocPct).toBeCloseTo(30);
  });

  test("recharges from the floor when the Sun returns", () => {
    const sun2 = [...sun, w("2027-01-01T14:00Z", "2027-01-01T18:00Z")];
    const r = simulatePower({ start: T0, stop: "2027-01-01T18:00Z", sun: sun2, link: [], lander });
    expect(r.series[r.series.length - 1].soc).toBeCloseTo(40);
    expect(r.survives).toBe(false);
  });

  test("battery needed uses the deepest drawdown after recharging to full", () => {
    const s = [w("2027-01-01T03:00Z", "2027-01-01T13:00Z")];
    // dark 0-3 h: -300 Wh; sun 3-13 h: +500 (back to full); dark 13-17 h: -400
    const r = simulatePower({ start: T0, stop: "2027-01-01T17:00Z", sun: s, link: [], lander: { ...lander, batteryKWh: 10 } });
    expect(r.batteryNeededKWh).toBeCloseTo(0.4 / 0.8);
  });

  test("scales panel power by the visible share of the Sun", () => {
    const factor = { t0: T0, stepMin: 60, values: Array.from({ length: 12 }, () => 0.5) };
    const r = simulatePower({ start: T0, stop: "2027-01-01T04:00Z", sun, link: [], lander, sunFactor: factor });
    // panel 50 W against 50 W load: flat
    expect(r.lowestSocPct).toBeCloseTo(100);
    const r2 = simulatePower({ start: T0, stop: "2027-01-01T04:00Z", sun, link: [], lander: { ...lander, sunLoadW: 75 }, sunFactor: factor });
    expect(r2.lowestSocPct).toBeCloseTo(90);
  });
});

describe("darkSpells", () => {
  test("lists the gaps between Sun windows inside the plan", () => {
    const s = [w("2027-01-01T02:00Z", "2027-01-01T04:00Z")];
    const gaps = darkSpells(s, T0, "2027-01-01T10:00Z");
    expect(gaps.map((g) => [g.startH, g.endH])).toEqual([[0, 2], [4, 10]]);
  });
});
