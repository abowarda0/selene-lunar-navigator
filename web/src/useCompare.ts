import { useCallback, useEffect, useState } from "react";
import { parseCompare, planKey, toggleCompare } from "./lib/compare";
import type { Plan } from "./selene/plan";

const STORE_KEY = "selene.compare";
const MESSAGE_MS = 4000;

const read = (): Plan[] => {
  try {
    return parseCompare(window.sessionStorage.getItem(STORE_KEY));
  } catch {
    return [];
  }
};

export interface CompareState {
  readonly list: readonly Plan[];
  readonly message: string | null;
  readonly toggle: (p: Plan) => void;
  readonly has: (p: Plan) => boolean;
}

/** Up to three plans to compare, kept for the browser tab's session. */
export function useCompare(): CompareState {
  const [list, setList] = useState<readonly Plan[]>(read);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch {
      // storage blocked (private mode): the tray still works for this page view
    }
  }, [list]);
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => window.clearTimeout(id);
  }, [message]);
  const toggle = useCallback((p: Plan) => {
    const r = toggleCompare(list, p);
    setList(r.list);
    setMessage(r.error);
  }, [list]);
  const has = useCallback((p: Plan) => list.some((x) => planKey(x) === planKey(p)), [list]);
  return { list, message, toggle, has };
}
