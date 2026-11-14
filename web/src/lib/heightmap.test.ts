import { describe, expect, it } from "vitest";
import { decodeHeights, sunVector, isInside } from "./heightmap";

const b64 = (vals: number[]): string => {
  const buf = new Int16Array(vals);
  let s = "";
  new Uint8Array(buf.buffer).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
};

describe("decodeHeights", () => {
  it("decodes little-endian int16 metres in row order", () => {
    const h = decodeHeights(b64([0, -5, 120, 32767]), 2);
    expect(Array.from(h)).toEqual([0, -5, 120, 32767]);
  });
  it("rejects a grid of the wrong size", () => {
    expect(() => decodeHeights(b64([1, 2, 3]), 2)).toThrow();
  });
});

describe("sunVector", () => {
  it("points north for azimuth 0 on the horizon (north is -z)", () => {
    const [x, y, z] = sunVector(0, 0);
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(0); expect(z).toBeCloseTo(-1);
  });
  it("points east for azimuth 90 and up for elevation 90", () => {
    expect(sunVector(90, 0)[0]).toBeCloseTo(1);
    expect(sunVector(123, 90)[1]).toBeCloseTo(1);
  });
});

describe("isInside", () => {
  const ws = [{ start: "2027-01-01T00:00Z", end: "2027-01-01T10:00Z", hours: 10, open_start: false, open_end: false }];
  it("is true inside a window and false outside", () => {
    expect(isInside(ws, "2027-01-01T05:00Z")).toBe(true);
    expect(isInside(ws, "2027-01-01T11:00Z")).toBe(false);
  });
});
