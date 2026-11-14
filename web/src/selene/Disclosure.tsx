import type { ReactElement, ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** A bordered, obviously clickable disclosure with a rotating chevron and Show/Hide text. */
export function Disclosure({ title, children, className }: Props): ReactElement {
  return (
    <details className={`disc${className ? ` ${className}` : ""}`}>
      <summary>
        <span className="disc-t"><Icon name="chevron" size={18} />{title}</span>
        <span className="disc-sh" aria-hidden="true"><span className="d-show">Show</span><span className="d-hide">Hide</span></span>
      </summary>
      <div className="disc-body">{children}</div>
    </details>
  );
}
