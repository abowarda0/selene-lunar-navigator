import type { Site } from "../api/types";
import { moonDistanceKm, MOON_RADIUS_KM, nearestSites, parseLat, parseLon, terrainLevel } from "./customPoint";

const site = (id: string, lat: number, lon_e: number): Site =>
  ({ id, name: id, lat, lon_e, kind: "sample", terrain: true, coord_source: "", verified: true }) as unknown as Site;

describe("parseLat / parseLon", () => {
  it("reads signed degrees and hemisphere letters", () => {
    expect(parseLat("-85.3")).toBe(-85.3);
    expect(parseLat("85.3 S")).toBe(-85.3);
    expect(parseLat("85.3°S")).toBe(-85.3);
    expect(parseLat("0.674 N")).toBe(0.674);
    expect(parseLon("222.6")).toBeCloseTo(222.6);
    expect(parseLon("-137.4")).toBeCloseTo(222.6);
    expect(parseLon("137.4 W")).toBeCloseTo(222.6);
    expect(parseLon("32.3°E")).toBeCloseTo(32.3);
  });
  it("rejects out-of-range values and swapped hemisphere letters", () => {
    expect(parseLat("-91")).toBeNull();
    expect(parseLat("10 E")).toBeNull();
    expect(parseLon("400")).toBeNull();
    expect(parseLon("10 S")).toBeNull();
    expect(parseLat("abc")).toBeNull();
  });
});

describe("moonDistanceKm", () => {
  it("is zero for the same point and a quarter circumference from pole to equator", () => {
    expect(moonDistanceKm(-85, 30, -85, 30)).toBeCloseTo(0);
    expect(moonDistanceKm(-90, 0, 0, 123)).toBeCloseTo((Math.PI / 2) * MOON_RADIUS_KM, 3);
  });
  it("treats longitude across the 0/360 seam correctly", () => {
    expect(moonDistanceKm(-89, 359.5, -89, 0.5)).toBeLessThan(1);
  });
});

describe("nearestSites", () => {
  it("sorts the ready-made sites by distance", () => {
    const sites = [site("far", 0, 0), site("near", -85.3, 31), site("mid", -80, 31)];
    expect(nearestSites(sites, -85.3, 31.2, 2).map((s) => s.site.id)).toEqual(["near", "mid"]);
  });
});

describe("terrainLevel", () => {
  it("matches the point builder's latitude bands", () => {
    expect(terrainLevel(-85.3)).toBe("full");
    expect(terrainLevel(-80.5)).toBe("full");
    expect(terrainLevel(-75)).toBe("near");
    expect(terrainLevel(-60)).toBe("near");
    expect(terrainLevel(-40)).toBe("none");
    expect(terrainLevel(10)).toBe("none");
  });
});
