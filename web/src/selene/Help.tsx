import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { Icon } from "./Icon";

/** A "?" button that opens a short explanation; Escape or a click elsewhere closes it. */
export function Help({ topic, text }: { readonly topic: string; readonly text: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);
  return (
    <span className="help" ref={box}>
      <button type="button" className="help-btn" aria-label={`What is ${topic}?`} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen(!open)}>
        <Icon name="help" size={18} />
      </button>
      {open && <span id={id} role="tooltip" className="help-pop">{text}</span>}
    </span>
  );
}
