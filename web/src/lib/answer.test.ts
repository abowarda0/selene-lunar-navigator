import { describe, expect, test } from "vitest";
import type { VerdictLevel } from "../api/types";
import { DEFAULT_LANDER, type LanderPlan } from "./landers";
import { answerSentence, commsSentence, plainDuration } from "./answer";
import type { PowerResult } from "./power";
import type { PowerPlan } from "./powerPlan";
import type { CommsVerdict } from "./verdict";

const power = (over: Partial<PowerResult>): PowerResult => ({
  survives: true, firstFloor: null, lowestSocPct: 60, batteryNeededKWh: 2.5, loadMetPct: 100, series: [], ...over,
});
const comms = (level: VerdictLevel, sharePct = 50, longestGapH = 10): CommsVerdict => ({
  level, reason: "", linkAtTouchdown: true, sharePct, longestGapH,
});
const plan = (p: PowerResult, level: VerdictLevel, c: CommsVerdict = comms("good"), longestDarkH = 240): PowerPlan => ({
  chosen: { mast: false, sun: [], sunHours: 100, longestDarkH, power: p, partialSun: false },
  other: null,
  link: [],
  verdict: { level, power: { level, reason: "" }, comms: c, warnings: [] },
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
  test("poor power says when the battery runs out and why", () => {
    // Arrange
    const pp = plan(power({ survives: false, firstFloor: { t: "2027-03-30T00:00Z", hoursAfter: 336 }, lowestSocPct: 20, batteryNeededKWh: 9.4 }), "poor");
    // Act
    const a = answerSentence(pp, rover, 30);
    // Assert
    expect(a.lead).toBe("Your rover would run out of power 14 days (336 h) after landing, because the Sun stays behind the terrain for 10 days (240 h) in a row.");
    expect(a.fix).toBe("Needs a battery of at least 9.4 kWh, or a different landing date (see Best dates).");
  });

  test("marginal power says it survives only just", () => {
    const pp = plan(power({ lowestSocPct: 24.6 }), "marginal");
    const a = answerSentence(pp, rover, 30);
    expect(a.lead).toBe("Your rover survives, but only just: the battery drops to 25%.");
    expect(a.fix).toBeNull();
  });

  test("good power gives the mission length and lowest charge", () => {
    const pp = plan(power({ lowestSocPct: 71.2 }), "good");
    const a = answerSentence(pp, { ...rover, preset: "small" }, 14);
    expect(a.lead).toBe("Your small lander keeps its power for all 14 days. The battery never drops below 71%.");
  });

  test("uses the power axis even when comms makes the overall verdict poor", () => {
    const pp = plan(power({ lowestSocPct: 71 }), "poor", comms("poor", 5, 300));
    const good = { ...pp, verdict: { ...pp.verdict, power: { level: "good" as const, reason: "" } } };
    expect(answerSentence(good, rover, 30).lead).toMatch(/keeps its power/);
  });

  test("second sentence comes from the comms verdict", () => {
    const pp = plan(power({}), "marginal", comms("marginal", 22.4, 60));
    expect(answerSentence(pp, rover, 30).comms).toBe("Patchy contact with Earth: reachable 22% of the time, longest silence 60 h.");
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
