import { useEffect, useState } from "react";
import { api } from "./api/client";
import type { ApiError, Site } from "./api/types";

export interface Loaded<T> {
  readonly loading: boolean;
  /** Last good result; kept on screen when a later request fails. */
  readonly data: T | null;
  readonly error: ApiError | null;
}

export function useSites(): Loaded<readonly Site[]> {
  const [state, setState] = useState<Loaded<readonly Site[]>>({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    api.sites().then((r) => {
      if (live) setState(r.ok ? { loading: false, data: r.data, error: null } : { loading: false, data: null, error: r.error });
    });
    return () => { live = false; };
  }, []);
  return state;
}



/** Width of an element, for SVG charts that draw at real pixel width. */
export function useWidth<T extends HTMLElement>(fallback = 800): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

function useLoad<T>(load: (() => Promise<import("./api/types").Envelope<T>>) | null, key: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ loading: load != null, data: null, error: null });
  useEffect(() => {
    if (!load) { setState({ loading: false, data: null, error: null }); return; }
    let live = true;
    setState({ loading: true, data: null, error: null });
    load().then((r) => { if (live) setState(r.ok ? { loading: false, data: r.data, error: null } : { loading: false, data: null, error: r.error }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export const useTerrain = (site: string | null): Loaded<import("./api/types").TerrainMap> => useLoad(site ? () => api.terrain(site) : null, site ?? "");


export const useYear = (site: string | null): Loaded<import("./api/types").YearData> => useLoad(site ? () => api.year(site) : null, site ?? "");

/** Year files for several sites, loaded in parallel; data is null until every file has answered. */
export function useYears(ids: readonly string[]): Loaded<readonly import("./api/types").YearData[]> & { readonly failed: readonly string[] } {
  const key = ids.join(",");
  const [state, setState] = useState<Loaded<readonly import("./api/types").YearData[]> & { readonly failed: readonly string[] }>({ loading: true, data: null, error: null, failed: [] });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null, failed: [] });
    Promise.all(ids.map((id) => api.year(id))).then((rs) => {
      if (!live) return;
      const data = rs.flatMap((r) => (r.ok ? [r.data] : []));
      const failed = ids.filter((_, i) => !rs[i].ok);
      const firstErr = rs.find((r) => !r.ok);
      setState({ loading: false, data, error: firstErr && !firstErr.ok ? firstErr.error : null, failed });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Runs a heavy computation after the next paint so "Computing…" text shows first; null while pending. */
export function useDeferred<T>(compute: (() => T) | null, deps: readonly unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    setValue(null);
    if (!compute) return;
    const id = window.setTimeout(() => setValue(compute()), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
