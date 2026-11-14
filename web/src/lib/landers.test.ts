import { describe, expect, test } from "vitest";
import { dataVolumeGB, slopeClass } from "./facts";
import { LANDER_PRESETS, validateLander } from "./landers";
import { visibleSunFactor } from "./sunFactor";

describe("lander presets", () => {
  test("rover dark endurance is about 50 h", () => {
    const r = LANDER_PRESETS.rover.spec;
    const usableWh = r.batteryKWh * 1000 * (1 - r.minSocPct / 100);
    expect(usableWh / r.darkLoadW).toBeGreaterThan(45);
    expect(usableWh / r.darkLoadW).toBeLessThan(60);
  });
});

describe("validateLander", () => {
  test("accepts a preset", () => {
    expect(validateLander({ ...LANDER_PRESETS.small.spec })).toEqual({});
  });
  test("rejects non-positive numbers and a minimum charge outside 0 to 90", () => {
    const errs = validateLander({ ...LANDER_PRESETS.small.spec, panelW: 0, batteryKWh: Number.NaN, minSocPct: 95 });
    expect(Object.keys(errs).sort()).toEqual(["batteryKWh", "minSocPct", "panelW"]);
  });
  test("allows zero comms power", () => {
    expect(validateLander({ ...LANDER_PRESETS.small.spec, commsW: 0 })).toEqual({});
  });
});

describe("dataVolumeGB", () => {
  test("converts link hours and Mbps to gigabytes", () => {
    expect(dataVolumeGB(10, 1)).toBeCloseTo(4.5);
  });
});

describe("slopeClass", () => {
  test("bands slope at 8 and 15 degrees", () => {
    expect(slopeClass(3.6).level).toBe("good");
    expect(slopeClass(8).level).toBe("marginal");
    expect(slopeClass(15).level).toBe("marginal");
    expect(slopeClass(15.1).level).toBe("poor");
  });
});

describe("visibleSunFactor", () => {
  test("is the share of the disc above the interpolated skyline", () => {
    const f = visibleSunFactor({
      track: { t0: "2027-01-01T00:00Z", step_min: 30, sun_az: [0, 45, 90], sun_el: [2, 0.5, 0] },
      horizon: { az_step_deg: 90, elev_deg: [1, 0, -1, 0] },
    });
    expect(f.stepMin).toBe(30);
    expect(f.values[0]).toBe(1);
    // skyline at 45 deg = 0.5, centre on it: half the disc
    expect(f.values[1]).toBeCloseTo(0.5, 2);
    expect(f.values[2]).toBeCloseTo(0.5, 2);
  });
});
