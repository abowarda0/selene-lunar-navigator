import { describe, expect, test, vi } from "vitest";
import { createClient } from "./client";

const site = { id: "chandrayaan3", name: "Chandrayaan-3", lat: -69.373, lon_e: 32.319, kind: "landed", terrain: true, coord_source: "x", verified: true };
const sitesEnv = { ok: true, data: [site], error: null };
const scenarioEnv = { ok: true, data: { scenario: { site, start: "2026-12-01T00:00Z", stop: "2026-12-31T00:00Z", step_min: 60 } }, error: null };

function fakeFetch(routes: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([k]) => url.endsWith(k));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit[1].body), { status: hit[1].status });
  }) as unknown as typeof fetch;
}

describe("mock-file client", () => {
  test("loads sites from the data folder", async () => {
    const api = createClient({ dataBase: "data/", fetchImpl: fakeFetch({ "data/sites.json": { status: 200, body: sitesEnv } }) });
    const res = await api.sites();
    expect(res.ok && res.data[0].id).toBe("chandrayaan3");
  });

  test("maps a scenario query to its precomputed file", async () => {
    const f = fakeFetch({ "data/sites.json": { status: 200, body: sitesEnv }, "data/scenario_chandrayaan3_2026-12-01.json": { status: 200, body: scenarioEnv } });
    const api = createClient({ dataBase: "data/", fetchImpl: f });
    const res = await api.scenario({ site: "chandrayaan3", start: "2026-12-01", days: 30 });
    expect(res.ok).toBe(true);
  });

  test("rejects a mission length outside 1..60 before any request", async () => {
    const f = fakeFetch({});
    const api = createClient({ dataBase: "data/", fetchImpl: f });
    const res = await api.scenario({ site: "chandrayaan3", start: "2026-12-01", days: 61 });
    expect(res.ok ? "" : res.error.code).toBe("bad_request");
    expect(f).not.toHaveBeenCalled();
  });

  test("rejects a malformed start date", async () => {
    const api = createClient({ dataBase: "data/", fetchImpl: fakeFetch({}) });
    const res = await api.scenario({ site: "chandrayaan3", start: "12/01/2026", days: 30 });
    expect(res.ok ? "" : res.error.code).toBe("bad_request");
  });

  test("an unknown site id returns unknown_site", async () => {
    const api = createClient({ dataBase: "data/", fetchImpl: fakeFetch({ "data/sites.json": { status: 200, body: sitesEnv } }) });
    const res = await api.scenario({ site: "nowhere", start: "2026-12-01", days: 30 });
    expect(res.ok ? "" : res.error.code).toBe("unknown_site");
  });

  test("a combination with no precomputed file explains what exists", async () => {
    const api = createClient({ dataBase: "data/", fetchImpl: fakeFetch({ "data/sites.json": { status: 200, body: sitesEnv } }) });
    const res = await api.scenario({ site: "chandrayaan3", start: "2026-12-07", days: 30 });
    expect(res.ok ? "" : res.error.code).toBe("not_precomputed");
    expect(res.ok ? "" : res.error.message).toMatch(/7 Dec 2026/);
  });

  test("a network failure becomes a readable error, not an exception", async () => {
    const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const api = createClient({ dataBase: "data/", fetchImpl: f });
    const res = await api.sites();
    expect(res.ok ? "" : res.error.code).toBe("network");
  });

  test("a body that is not a contract envelope is reported as bad_response", async () => {
    const api = createClient({ dataBase: "data/", fetchImpl: fakeFetch({ "data/sites.json": { status: 200, body: { hello: 1 } } }) });
    const res = await api.sites();
    expect(res.ok ? "" : res.error.code).toBe("bad_response");
  });
});

describe("live API client", () => {
  test("calls /api/scenario with the contract's query parameters", async () => {
    const f = fakeFetch({});
    (f as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => new Response(JSON.stringify(scenarioEnv), { status: 200 }));
    const api = createClient({ apiBase: "https://api.test", fetchImpl: f });
    await api.scenario({ site: "chandrayaan3", start: "2026-12-01", days: 30 });
    const url = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toBe("https://api.test/api/scenario?site=chandrayaan3&start=2026-12-01T00%3A00Z&days=30");
  });

  test("passes a backend error envelope through unchanged", async () => {
    const err = { ok: false, data: null, error: { code: "upstream_unavailable", message: "Horizons did not answer" } };
    const f = vi.fn(async () => new Response(JSON.stringify(err), { status: 502 })) as unknown as typeof fetch;
    const api = createClient({ apiBase: "https://api.test", fetchImpl: f });
    const res = await api.scenario({ site: "chandrayaan3", start: "2026-12-01", days: 30 });
    expect(res).toEqual(err);
  });
});

describe("suggested dates", () => {
  test("mock mode offers the stored start dates, live mode none", () => {
    const dates = createClient({ dataBase: "data/" }).suggestedDates;
    expect(dates.slice(0, 3)).toEqual(["2026-12-01", "2026-12-15", "2027-01-01"]);
    expect(dates[dates.length - 1]).toBe("2027-12-31");
    expect(dates).toHaveLength(55);
    expect(createClient({ apiBase: "https://api.test" }).suggestedDates).toEqual([]);
  });
});

describe("sweep and terrain", () => {
  const sweepEnv = { ok: true, error: null, data: { site: "ridge", days: 30, rows: [] } };
  test("mock mode reads sweep and terrain files by site", async () => {
    const f = fakeFetch({ "data/sweep_ridge.json": { status: 200, body: sweepEnv }, "data/terrain_ridge.json": { status: 200, body: { ok: true, error: null, data: { site: "ridge" } } } });
    const api = createClient({ dataBase: "data/", fetchImpl: f });
    expect((await api.sweep("ridge")).ok).toBe(true);
    expect((await api.terrain("ridge")).ok).toBe(true);
  });

  test("a site without a terrain map reports not_found", async () => {
    const api = createClient({ dataBase: "data/", fetchImpl: fakeFetch({}) });
    const res = await api.terrain("apollo11");
    expect(res.ok ? "" : res.error.code).toBe("not_found");
  });

  test("live mode calls the proposed sweep endpoint", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(sweepEnv), { status: 200 })) as unknown as typeof fetch;
    const api = createClient({ apiBase: "https://api.test", fetchImpl: f });
    await api.sweep("ridge");
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("https://api.test/api/sweep?site=ridge&days=30");
  });

  test("terrain image URLs resolve against the data folder in mock mode", () => {
    const api = createClient({ dataBase: "data/" });
    expect(api.assetUrl("terrain_ridge.png")).toBe("data/terrain_ridge.png");
  });
});

describe("year", () => {
  test("loads the year file once per site and caches it", async () => {
    const env = { ok: true, error: null, data: { site: { id: "ridge" } } };
    const f = fakeFetch({ "data/year_ridge.json": { status: 200, body: env } });
    const api = createClient({ dataBase: "data/", fetchImpl: f });
    await api.year("ridge");
    await api.year("ridge");
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  test("a failed load is not cached", async () => {
    const f = fakeFetch({});
    const api = createClient({ dataBase: "data/", fetchImpl: f });
    expect((await api.year("ridge")).ok).toBe(false);
    await api.year("ridge");
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });
});
