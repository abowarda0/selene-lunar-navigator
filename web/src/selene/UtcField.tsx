import { useEffect, useId, useRef, useState, type ReactElement } from "react";

/**
 * One ISO, 24-hour UTC text field ("2026-12-17 00:00"), instead of the browser's date and time pickers,
 * which show local formats such as "12/17/2026" and "12:00 AM". Commits on Enter or when focus leaves.
 */
interface Props {
  readonly label: string;
  /** YYYY-MM-DD */
  readonly date: string;
  /** HH:MM; ignored when dateOnly */
  readonly time?: string;
  readonly dateOnly?: boolean;
  /** Inclusive bounds, YYYY-MM-DD */
  readonly min?: string;
  readonly max?: string;
  readonly onCommit: (date: string, time: string) => void;
  /** Told whenever the typed text becomes valid or invalid, so callers can hide stale results. */
  readonly onValidity?: (valid: boolean) => void;
  readonly className?: string;
}

const RE = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?\s*(?:Z|UTC)?\s*$/i;

/** Parses "YYYY-MM-DD[ HH:MM]" as UTC. Returns null for anything that is not a real date and time. */
export function parseUtcField(text: string, dateOnly: boolean): { date: string; time: string } | null {
  const m = RE.exec(text);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "00"] = m;
  if (!dateOnly && m[4] === undefined) return null;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  const back = new Date(ms);
  if (back.getUTCMonth() !== +mo - 1 || back.getUTCDate() !== +d || +h > 23 || +mi > 59) return null;
  const iso = back.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function UtcField({ label, date, time = "00:00", dateOnly = false, min, max, onCommit, onValidity, className }: Props): ReactElement {
  const shown = dateOnly ? date : `${date} ${time}`;
  const [draft, setDraft] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(shown); setError(null); }, [shown]);
  useEffect(() => { onValidity?.(error === null); }, [error]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Opens the browser's calendar; the chosen day keeps the current time and is shown back in ISO form. */
  const openCalendar = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  const pickDate = (value: string) => {
    if (!value) return;
    setError(null);
    setDraft(dateOnly ? value : `${value} ${time}`);
    if (value !== date) onCommit(value, time);
  };

  const commit = () => {
    const v = parseUtcField(draft, dateOnly);
    if (!v) { setError(dateOnly ? "Use YYYY-MM-DD." : "Use YYYY-MM-DD HH:MM (24-hour, UTC)."); return; }
    if ((min && v.date < min) || (max && v.date > max)) { setError(`Choose a date from ${min} to ${max}.`); return; }
    setError(null);
    setDraft(dateOnly ? v.date : `${v.date} ${v.time}`);
    if (v.date !== date || (!dateOnly && v.time !== time)) onCommit(v.date, v.time);
  };

  return (
    <label className={`f utc-f${className ? ` ${className}` : ""}`} htmlFor={id}>
      {label}
      <span className={`utc-in${error ? " bad" : ""}`}>
        <input id={id} type="text" inputMode="numeric" spellCheck={false} autoComplete="off" className="mono"
          placeholder={dateOnly ? "YYYY-MM-DD" : "YYYY-MM-DD HH:MM"} value={draft} aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
        <span className="utc-suffix mono" aria-hidden="true">UTC</span>
        <button type="button" className="utc-cal" onClick={openCalendar} aria-label={`Pick ${label.toLowerCase()} from a calendar`} title="Pick from a calendar">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
        {/* Hidden native date input: only its calendar popup is used; the visible field stays ISO. */}
        <input ref={picker} className="utc-picker" type="date" tabIndex={-1} aria-hidden="true" value={parseUtcField(draft, dateOnly)?.date ?? date}
          min={min} max={max} onChange={(e) => pickDate(e.target.value)} />
      </span>
      {error && <span id={`${id}-err`} className="utc-err" role="alert">{error}</span>}
    </label>
  );
}
