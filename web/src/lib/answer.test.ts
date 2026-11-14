import { describe, expect, test } from "vitest";
import type { VerdictLevel } from "../api/types";
import { DEFAULT_LANDER, type LanderPlan } from "./landers";
import { answerSentence, commsSentence, lightSentence, plainDuration } from "./answer";
import type { PowerResult } from "./power";
import type { PowerPlan } from "./powerPlan";
import type { CommsVerdict, LightVerdict } from "./verdict";

const power = (over: Partial<PowerResult>): PowerResult => ({
  survives: true, firstFloor: null, lowestSocPct: 60, batteryNeededKWh: 2.5, loadMetPct: 100, series: [], ...over,
});
const comms = (level: VerdictLevel, sharePct = 50, longestGapH = 10): CommsVerdict => ({
  level, reason: "", linkAtTouchdown: true, sharePct, longestGapH,
});
const light = (level: VerdictLevel, sunPct = 60, longestDarkH = 240): LightVerdict => ({ level, reason: "", sunPct, longestDarkH, sunAtTouchdown: true });
const plan = (p: PowerResult, level: VerdictLevel, c: CommsVerdict = comms("good"), l: LightVerdict = light(level)): PowerPlan => ({
  chosen: { mast: false, sun: [], sunHours: 100, longestDarkH: l.longestDarkH, power: p, partialSun: false },
  other: null,
  link: [],
  verdict: { level, light: l, power: { level, reason: "" }, comms: c, warnings: [] },
});
const rover: LanderPlan = DEFAULT_LANDER;

describe("plainDuration", () => {
  test("shows hours alone under three days", () => {
    expect(plainDuration(30)).toBe("30 h");
    expect(plainDuration(60)).toBe("60 h");
  });
  test("shows days with the exact hours from three days up", () => {
    expect(plainDuration(240)).toBe("10 days (240 h)");
  });
  test("rounds fractional days to one decimal", () => {
    expect(plainDuration(84)).toBe("3.5 days (84 h)");
  });
});

describe("answerSentence", () => {
  test("leads with the light, not the battery", () => {
    // Arrange
    const pp = plan(power({ survives: false, firstFloor: { t: "2027-03-30T00:00Z", hoursAfter: 336 }, lowestSocPct: 20, batteryNeededKWh: 9.4 }), "poor", comms("good"), light("poor", 45, 240));
    // Act
    const a = answerSentence(pp, rover, 30);
    // Assert
    expect(a.lead).toBe("The Sun stays behind the terrain for 10 days (240 h) in a row during your 30 days (up 45% of the time).");
    expect(a.fix).toMatch(/another landing date/);
    expect(a.power).toBe("A rover would run out of power 14 days (336 h) after landing; it would need a battery of at least 9.4 kWh.");
  });

  test("no hint when the light is good", () => {
    const a = answerSentence(plan(power({}), "good", comms("good"), light("good", 95, 10)), rover, 14);
    expect(a.lead).toBe("Sunlight for 95% of your 14 days; the longest dark spell is only 10 h.");
    expect(a.fix).toBeNull();
  });

  test("power line for a lander that keeps its charge", () => {
    const a = answerSentence(plan(power({ lowestSocPct: 71.2 }), "good"), { ...rover, preset: "small" }, 14);
    expect(a.power).toBe("A small lander keeps its power for all 14 days; the battery never drops below 71%.");
  });

  test("second sentence comes from the comms verdict", () => {
    const pp = plan(power({}), "marginal", comms("marginal", 22.4, 60));
    expect(answerSentence(pp, rover, 30).comms).toBe("Patchy contact with Earth: reachable 22% of the time, longest silence 60 h.");
  });
});

describe("lightSentence", () => {
  test("Sun never sets", () => {
    expect(lightSentence(light("good", 100, 0), 14)).toBe("The Sun stays up for all 14 days: it never drops behind the terrain.");
  });
  test("Sun never rises", () => {
    expect(lightSentence(light("poor", 0, 720), 30)).toBe("The Sun never clears the terrain during your 30 days.");
  });
  test("patchy light", () => {
    expect(lightSentence(light("marginal", 62, 50), 30)).toBe("Patchy sunlight: the Sun is up 62% of your 30 days, with a dark spell of 50 h.");
  });
});

describe("commsSentence", () => {
  test("good contact", () => {
    expect(commsSentence(comms("good", 64, 12))).toBe("Regular contact with Earth: reachable 64% of the time, longest silence 12 h.");
  });
  test("no contact at all asks for a relay", () => {
    expect(commsSentence(comms("poor", 0, 720))).toBe("Earth cannot be reached from here during this plan; a relay satellite would be needed.");
  });
  test("sparse contact", () => {
    expect(commsSentence(comms("poor", 6, 200))).toBe("Contact with Earth is not reliable enough: reachable 6% of the time, longest silence 8.3 days (200 h).");
  });
});
