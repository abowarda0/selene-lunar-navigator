import { parseUtcField } from "./UtcField";

describe("parseUtcField", () => {
  it("reads ISO 24-hour UTC date and time", () => {
    expect(parseUtcField("2026-12-17 06:30", false)).toEqual({ date: "2026-12-17", time: "06:30" });
    expect(parseUtcField("2026-12-17T18:05Z", false)).toEqual({ date: "2026-12-17", time: "18:05" });
    expect(parseUtcField(" 2026-12-17 7:00 UTC ", false)).toEqual({ date: "2026-12-17", time: "07:00" });
  });
  it("reads a date alone in date-only mode", () => {
    expect(parseUtcField("2027-01-15", true)).toEqual({ date: "2027-01-15", time: "00:00" });
  });
  it("rejects impossible dates, 12-hour times and a missing time", () => {
    expect(parseUtcField("2027-02-30 00:00", false)).toBeNull();
    expect(parseUtcField("2027-01-15 24:00", false)).toBeNull();
    expect(parseUtcField("2027-01-15 7:00 PM", false)).toBeNull();
    expect(parseUtcField("01/15/2027", true)).toBeNull();
    expect(parseUtcField("2027-01-15", false)).toBeNull();
  });
});
