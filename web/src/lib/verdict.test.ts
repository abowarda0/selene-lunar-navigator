import { describe, expect, test } from "vitest";
import type { VisWindow } from "../api/types";
import { commsVerdict, planVerdict, powerVerdict } from "./verdict";
import type { PowerResult } from "./power";

const w = (start: string, end: string): VisWindow => ({ start, end, hours: 0, open_start: false, open_end: false });
const T0 = "2027-01-01T00:00Z";
const pr = (lowestSocPct: number, survives: boolean): PowerResult => ({
  survives, firstFloor: survives ? null : { t: "2027-01-02T00:00Z", hoursAfter: 24 }, lowestSocPct, batteryNeededKWh: 1, loadMetPct: 100, series: [],
});

describe("powerVerdict", () => {
  test("good when the lowest charge stays 10 points above the floor", () => {
    expect(powerVerdict(pr(35, true), 20).level).toBe("good");
  });
  test("marginal when it never reaches the floor but comes within 10 points", () => {
    expect(powerVerdict(pr(25, true), 20).level).toBe("marginal");
  });
  test("poor when the battery reaches the floor", () => {
    const v = powerVerdict(pr(20, false), 20);
    expect(v.level).toBe("poor");
    expect(v.reason).toMatch(/24 h/);
  });
});

describe("commsVerdict", () => {
  test("good with short gaps and a large link share", () => {
    const link = [w("2027-01-01T00:00Z", "2027-01-01T20:00Z"), w("2027-01-02T06:00Z", "2027-01-03T00:00Z")];
    const v = commsVerdict(link, T0, "2027-01-03T00:00Z");
    expect(v.level).toBe("good");
    expect(v.linkAtTouchdown).toBe(true);
  });
  test("marginal when the longest gap is over a day but under 120 h", () => {
    const link = [w("2027-01-01T00:00Z", "2027-01-01T12:00Z"), w("2027-01-03T12:00Z", "2027-01-04T00:00Z")];
    expect(commsVerdict(link, T0, "2027-01-04T00:00Z").level).toBe("marginal");
  });
  test("poor with no link at all, and flags no link at touchdown", () => {
    const v = commsVerdict([], T0, "2027-01-04T00:00Z");
    expect(v.level).toBe("poor");
    expect(v.linkAtTouchdown).toBe(false);
  });
  test("a gap equal to a short mission still counts against the mission length", () => {
    const link = [w("2027-01-01T06:00Z", "2027-01-01T12:00Z")];
    expect(commsVerdict(link, T0, "2027-01-01T12:00Z").level).toBe("good");
  });
});

describe("planVerdict", () => {
  test("takes the worse of power and comms", () => {
    const link = [w("2027-01-01T00:00Z", "2027-01-04T00:00Z")];
    const v = planVerdict(pr(25, true), 20, link, T0, "2027-01-04T00:00Z");
    expect(v.level).toBe("marginal");
    expect(v.comms.level).toBe("good");
    expect(v.warnings).toEqual([]);
  });
  test("warns when there is no link at touchdown", () => {
    const v = planVerdict(pr(50, true), 20, [w("2027-01-01T02:00Z", "2027-01-04T00:00Z")], T0, "2027-01-04T00:00Z");
    expect(v.warnings).toEqual(["No link at touchdown"]);
  });
});
