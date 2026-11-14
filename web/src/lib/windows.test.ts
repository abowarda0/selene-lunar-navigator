import { describe, expect, test } from "vitest";
import type { VisWindow } from "../api/types";
import { bodyNow, isVisibleAt, longestWindow } from "./windows";

const w = (start: string, end: string, hours: number, open_start = false, open_end = false): VisWindow => ({ start, end, hours, open_start, open_end });

describe("windows", () => {
  const sun = [w("2026-12-13T18:59Z", "2026-12-28T15:27Z", 356.46)];

  test("a time inside a window is visible, the end instant is not", () => {
    expect(isVisibleAt(sun, "2026-12-20T00:00Z")).toBe(true);
    expect(isVisibleAt(sun, "2026-12-28T15:27Z")).toBe(false);
    expect(isVisibleAt(sun, "2026-12-01T00:00Z")).toBe(false);
  });

  test("an open-ended window includes the end of the range", () => {
    const earth = [w("2026-12-01T00:00Z", "2026-12-31T00:00Z", 720, true, true)];
    expect(isVisibleAt(earth, "2026-12-31T00:00Z")).toBe(true);
  });

  test("longestWindow returns null for no windows and the longest otherwise", () => {
    expect(longestWindow([])).toBeNull();
    const a = w("2026-12-01T00:00Z", "2026-12-02T00:00Z", 24);
    const b = w("2026-12-05T00:00Z", "2026-12-08T00:00Z", 72);
    expect(longestWindow([a, b])).toBe(b);
  });

  const now = {
    sun_visible: false, earth_visible: true, sun_el_deg: -6.28, earth_el_deg: 16.93, sun_clearance_deg: -7.02,
    hours_to_sunset: null, hours_to_earthset: null, hours_to_sunrise: 307, hours_to_earthrise: null,
  };

  test("a hidden body with a known rise reads as rising", () => {
    expect(bodyNow(now, "sun")).toEqual({ up: false, label: "Rises in", hours: 307, whole: false });
  });

  test("a visible body that never sets reads as up all period", () => {
    expect(bodyNow(now, "earth")).toEqual({ up: true, label: "Up all period", hours: null, whole: true });
  });

  test("a hidden body that never rises reads as hidden all period", () => {
    expect(bodyNow({ ...now, hours_to_sunrise: null }, "sun")).toEqual({ up: false, label: "Hidden all period", hours: null, whole: true });
  });

  test("a visible body with a known set reads as setting", () => {
    expect(bodyNow({ ...now, sun_visible: true, hours_to_sunset: 14.3 }, "sun")).toEqual({ up: true, label: "Sets in", hours: 14.3, whole: false });
  });
});
