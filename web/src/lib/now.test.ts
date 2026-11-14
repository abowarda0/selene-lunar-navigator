import { describe, expect, test } from "vitest";
import type { VisWindow } from "../api/types";
import { bodyStateAt, lowestPoint } from "./now";

const w = (start: string, end: string): VisWindow => ({ start, end, hours: 0, open_start: false, open_end: false });
const ws = [w("2027-01-01T00:00Z", "2027-01-01T10:30Z"), w("2027-01-02T00:00Z", "2027-01-03T00:00Z")];
const STOP = "2027-01-04T00:00Z";

describe("bodyStateAt", () => {
  test("up with hours until the window closes", () => {
    expect(bodyStateAt(ws, "2027-01-01T02:00Z", STOP)).toEqual({ up: true, hoursToChange: 8.5 });
  });
  test("down with hours until the next window opens", () => {
    expect(bodyStateAt(ws, "2027-01-01T12:00Z", STOP)).toEqual({ up: false, hoursToChange: 12 });
  });
  test("no change before the plan ends gives null", () => {
    expect(bodyStateAt(ws, "2027-01-03T06:00Z", STOP)).toEqual({ up: false, hoursToChange: null });
    expect(bodyStateAt([w("2027-01-01T00:00Z", "2027-01-05T00:00Z")], "2027-01-01T00:00Z", STOP)).toEqual({ up: true, hoursToChange: null });
  });
});

describe("lowestPoint", () => {
  test("finds the first sample with the lowest charge", () => {
    expect(lowestPoint([{ h: 0, soc: 100 }, { h: 1, soc: 40 }, { h: 2, soc: 40 }, { h: 3, soc: 60 }])).toEqual({ h: 1, soc: 40 });
  });
  test("returns null for an empty series", () => {
    expect(lowestPoint([])).toBeNull();
  });
});
