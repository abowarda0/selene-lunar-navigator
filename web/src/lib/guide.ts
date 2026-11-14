/**
 * Luna, the in-app guide: page-aware explanations built only from the app's own numbers,
 * plus a guard that rejects any AI answer containing a number the app did not compute.
 */
export type GuideView = "home" | "plan" | "dates" | "sites" | "compare" | "method";

export interface GuideFacts {
  readonly site?: string;
  readonly days?: number;
  readonly verdict?: string;
  readonly sunPct?: number;
  readonly linkPct?: number;
  readonly lowestBatteryPct?: number;
  readonly longestDarkH?: number;
  readonly longestSilenceH?: number;
  readonly batteryNeededKWh?: number;
  readonly lander?: string;
}

export interface GuideContext {
  readonly view: GuideView;
  readonly facts: GuideFacts;
  /** The plain-language answer currently on screen, if any. */
  readonly answer: string | null;
}

const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function planTips(f: GuideFacts, answer: string | null): string[] {
  const tips: string[] = [];
  if (answer) tips.push(`Here is the short version: ${answer}`);
  if (f.site && has(f.sunPct) && has(f.longestDarkH)) {
    tips.push(`At ${f.site} the Sun is up ${f.sunPct}% of the time, but the worst stretch without Sun is ${f.longestDarkH} h. The battery has to survive that stretch, not the average.`);
  }
  if (has(f.linkPct)) {
    tips.push(`Talking to Earth: one of NASA's three big dishes can reach the lander ${f.linkPct}% of the time.${has(f.longestSilenceH) ? ` The longest silence is ${f.longestSilenceH} h.` : ""}`);
  }
  if (has(f.batteryNeededKWh)) {
    tips.push(`To get through this plan the battery would need about ${f.batteryNeededKWh} kWh. Try a different date in Best dates, or put the panels on the 10 m pole.`);
  }
  tips.push("Not sure what spacecraft to bring? The Suggested setups card lists panel and battery sizes that survive this exact plan; press Use this to try one.");
  tips.push("Press Play the mission in the 3D view to watch the Sun and shadows move over the real terrain.");
  return tips;
}

const STATIC: Record<Exclude<GuideView, "plan">, readonly string[]> = {
  home: [
    "Hi, I'm Luna. Tell me what you already know: a landing date, a site, or both, and I'll check sunlight, battery and contact with Earth.",
    "The pins on the Moon are real candidate landing areas near the south pole. Click one to fly there.",
    "Everything here comes from NASA data: JPL Horizons for the Sun and Earth, LOLA laser maps for the mountains.",
  ],
  dates: [
    "Each square is one landing day. Green is good, amber marginal, red poor, for the spacecraft you picked.",
    "Click a day to open its full analysis.",
  ],
  sites: [
    "These are all the sites ranked for the same landing date and spacecraft. Grey tags mark reference and test sites.",
    "Click a row to see why a site ranks where it does.",
  ],
  compare: [
    "Plans side by side, same spacecraft. The best value in each row is marked.",
    "Use Choose this plan to open it in full.",
  ],
  method: [
    "This page shows how we checked the numbers against NASA's own maps.",
  ],
};

export function guideTips(ctx: GuideContext): string[] {
  return ctx.view === "plan" ? planTips(ctx.facts, ctx.answer) : [...STATIC[ctx.view]];
}

/** Numbers in a text, normalised: "1,200" -> "1200", "49%" -> "49". */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")).map((n) => String(Number(n)));
}

/** Counting words and fixed facts the guide may always use (three dishes, 10 m pole, 70 m dishes...). */
const ALLOWED = new Set(["0", "1", "2", "3", "4", "5", "10", "70", "24", "100", "15", "150"]);

export function safeAnswer(text: string, ctx: GuideContext): { ok: boolean; invented: string[] } {
  const known = new Set([...numbersIn(JSON.stringify(ctx.facts)), ...numbersIn(ctx.answer ?? "")]);
  const invented = numbersIn(text).filter((n) => !known.has(n) && !ALLOWED.has(n));
  return { ok: invented.length === 0, invented };
}
