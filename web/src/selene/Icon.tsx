import type { ReactElement } from "react";

export type IconName = "sun" | "earth" | "battery" | "terrain" | "pole" | "chevron" | "plus" | "help";

interface Props {
  readonly name: IconName;
  /** Battery fill, 0..100; only used by the battery icon. */
  readonly fill?: number;
  readonly size?: number;
}

const BATTERY_INNER_W = 14;

function paths(name: IconName, fill: number): ReactElement {
  switch (name) {
    case "sun":
      return (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
    case "earth":
      return (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>);
    case "battery":
      return (<><rect x="2.5" y="7" width="17" height="10" rx="2" /><path d="M21.5 10.5v3" /><rect className="ic-fill" x="4.5" y="9" width={(BATTERY_INNER_W * Math.max(0, Math.min(100, fill))) / 100} height="6" rx="0.5" fill="currentColor" stroke="none" /></>);
    case "terrain":
      return <path d="M2 19l6-9 4 5 3-4 7 8H2z" />;
    case "pole":
      return (<><path d="M12 22V8M8 22h8" /><rect x="6" y="3" width="12" height="5" rx="1" /></>);
    case "chevron":
      return <path d="M9 6l6 6-6 6" />;
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "help":
      return (<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></>);
  }
}

/** 24px line icon in the current text colour. */
export function Icon({ name, fill = 100, size = 24 }: Props): ReactElement {
  return (
    <svg className={`ic ic-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths(name, fill)}
    </svg>
  );
}
