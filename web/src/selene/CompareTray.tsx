import type { ReactElement } from "react";
import type { Site } from "../api/types";
import { fmtDate } from "../lib/format";
import { planKey } from "../lib/compare";
import type { Plan } from "./plan";

interface Props {
  readonly list: readonly Plan[];
  readonly sites: readonly Site[];
  readonly message: string | null;
  readonly onRemove: (p: Plan) => void;
  readonly onOpen: () => void;
}

export const siteShort = (sites: readonly Site[], id: string): string =>
  (sites.find((s) => s.id === id)?.name ?? id).replace(/ \(.*\)$/, "");

export const planLabel = (sites: readonly Site[], p: Plan): string => `${siteShort(sites, p.site)} · ${fmtDate(`${p.date}T${p.time}Z`)} · ${p.hours / 24} d`;

/** Sticky bottom bar with the plans picked for Compare. */
export function CompareTray({ list, sites, message, onRemove, onOpen }: Props): ReactElement | null {
  if (list.length === 0 && !message) return null;
  return (
    <aside className="tray" aria-label="Plans to compare">
      <div className="tray-in">
        <ul className="tray-list">
          {list.map((p) => (
            <li key={planKey(p)} className="tray-chip">
              <span className="mono">{planLabel(sites, p)}</span>
              <button type="button" className="x" aria-label={`Remove ${planLabel(sites, p)} from Compare`} onClick={() => onRemove(p)}>✕</button>
            </li>
          ))}
        </ul>
        <p className="tray-msg" role="status">{message ?? (list.length < 2 ? "Add one more plan to compare." : "")}</p>
        <button type="button" className="btn primary" disabled={list.length < 2} onClick={onOpen}>Compare ({list.length})</button>
      </div>
    </aside>
  );
}
