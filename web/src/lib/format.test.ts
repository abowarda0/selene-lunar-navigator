import { describe, expect, test } from "vitest";
import { durParts, durText, fmtDate, fmtDateTime, fmtHours, fmtUtc, latText, lonText, plainShare, signed } from "./format";

describe("format", () => {
  test("formats an ISO minute timestamp as day month year in UTC", () => {
    expect(fmtDate("2026-12-13T18:59Z")).toBe("13 Dec 2026");
  });

  test("formats date and time with zero-padded hours", () => {
    expect(fmtDateTime("2026-12-01T04:05Z")).toBe("1 Dec 04:05");
  });

  test("short durations read as hours and minutes", () => {
    expect(durParts(14.3333)).toEqual({ big: "14 h 20 m", small: "" });
  });

  test("durations under an hour read as minutes", () => {
    expect(durParts(0.5)).toEqual({ big: "30 min", small: "" });
  });

  test("durations of two days or more read as days with the hours beside", () => {
    expect(durParts(307)).toEqual({ big: "12.8 days", small: "307.0 h" });
    expect(durText(307)).toBe("12.8 days (307.0 h)");
  });

  test("rounding 59.9 minutes carries into the hour", () => {
    expect(durParts(1.999)).toEqual({ big: "2 h 00 m", small: "" });
  });

  test("latitude and longitude carry hemisphere and east-positive labels", () => {
    expect(latText(-69.373)).toBe("69.373° S");
    expect(latText(0.674)).toBe("0.674° N");
    expect(lonText(32.319)).toBe("32.319° E");
  });

  test("signed numbers use a true minus sign", () => {
    expect(signed(-7.02)).toBe("−7.0");
    expect(signed(5.1)).toBe("+5.1");
    expect(signed(0)).toBe("±0.0");
  });

  test.each([
    [100, "all the time"],
    [92, "almost all the time"],
    [65, "most of the time"],
    [49.5, "about half the time"],
    [20, "some of the time"],
    [3, "rarely"],
    [0, "never"],
  ])("share %s%% reads as %s", (pct, words) => {
    expect(plainShare(pct)).toBe(words);
  });
});

describe("plan formats", () => {
  test("fmtUtc gives day, month, year, time and UTC", () => {
    expect(fmtUtc("2027-03-16T00:00Z")).toBe("16 Mar 2027 00:00 UTC");
  });
  test("fmtHours gives hours and minutes under 100 h", () => {
    expect(fmtHours(41.2)).toBe("41 h 12 m");
    expect(fmtHours(6.05)).toBe("6 h 03 m");
  });
  test("fmtHours gives whole hours and days from 100 h", () => {
    expect(fmtHours(253)).toBe("253 h (10.5 d)");
  });
});
