import { describe, expect, test } from "vitest";
import { domePoint, domeRadius, nearestIndex, skylinePath, trackSegments } from "./dome";

describe("dome projection", () => {
  test("the horizon sits on the rim and the zenith at the centre", () => {
    expect(domeRadius(0, 100)).toBe(100);
    expect(domeRadius(90, 100)).toBe(0);
  });

  test("low elevations get more room than a linear scale gives them", () => {
    const linear = 100 * (1 - 5 / 90);
    expect(100 - domeRadius(5, 100)).toBeGreaterThan(100 - linear);
  });

  test("elevations outside 0..90 clamp to the rim or the centre", () => {
    expect(domeRadius(-4, 100)).toBe(100);
    expect(domeRadius(120, 100)).toBe(0);
  });

  test("north is up and east is right, like a compass", () => {
    const [nx, ny] = domePoint(0, 0, 0, 0, 100);
    const [ex, ey] = domePoint(90, 0, 0, 0, 100);
    expect(nx).toBeCloseTo(0);
    expect(ny).toBeCloseTo(-100);
    expect(ex).toBeCloseTo(100);
    expect(ey).toBeCloseTo(0);
  });

  test("a track splits where the body goes below the horizon", () => {
    const segs = trackSegments([0, 10, 20, 30, 40], [2, 1, -1, 1, 2]);
    expect(segs).toEqual([[0, 1], [3, 4]]);
  });

  test("a single visible sample is not a segment", () => {
    expect(trackSegments([0, 10, 20], [-1, 3, -1])).toEqual([]);
  });

  test("the skyline path closes and has one vertex per azimuth sample", () => {
    const d = skylinePath([1, 1, 1, 1], 90, 0, 0, 100);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/L/g)?.length).toBe(3);
  });

  test("nearestIndex finds the sample closest in time", () => {
    const t = ["2026-12-01T00:00Z", "2026-12-01T01:00Z", "2026-12-01T02:00Z"];
    expect(nearestIndex(t, "2026-12-01T01:20Z")).toBe(1);
    expect(nearestIndex(t, "2026-12-01T01:40Z")).toBe(2);
    expect(nearestIndex(t, "2026-11-30T00:00Z")).toBe(0);
    expect(nearestIndex(t, "2027-01-01T00:00Z")).toBe(2);
  });
});
