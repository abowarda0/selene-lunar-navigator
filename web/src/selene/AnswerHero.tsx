import { useState, type ReactElement, type ReactNode } from "react";
import type { VerdictLevel } from "../api/types";
import type { Answer } from "../lib/answer";
import { VERDICT_WORD } from "../lib/slip";
import { Icon } from "./Icon";

interface Props {
  readonly level: VerdictLevel;
  readonly answer: Answer;
  /** "Malapert Massif · 16 Mar 2027 00:00 UTC · 30 days" */
  readonly context: string;
  readonly inCompare: boolean;
  readonly onCompare: () => void;
  readonly onFindDates: () => void;
  readonly slip: ReactNode;
  readonly shareHash: string;
}

type CopyState = "idle" | "copied" | "failed";

/** Puts the plan in the address bar and copies the link. */
function CopyLink({ hash }: { readonly hash: string }): ReactElement {
  const [state, setState] = useState<CopyState>("idle");
  const copy = () => {
    window.history.replaceState(null, "", `#${hash}`);
    const url = window.location.href;
    if (!navigator.clipboard) { setState("failed"); return; }
    navigator.clipboard.writeText(url).then(() => setState("copied"), () => setState("failed"));
  };
  return (
    <>
      <button type="button" className="btn" onClick={copy}>Copy link to this plan</button>
      <span className="muted" role="status">{state === "copied" ? "Link copied." : state === "failed" ? "Could not copy; the link is in the address bar." : ""}</span>
    </>
  );
}

/** The verdict in one plain sentence, what to do next, and what would fix a power failure. */
export function AnswerHero({ level, answer, context, inCompare, onCompare, onFindDates, slip, shareHash }: Props): ReactElement {
  return (
    <section className="hero-a" aria-labelledby="ans-h">
      <p className="ctx mono">{context}</p>
      <div className="ans-row">
        <span className={`pill ${level}`}><i aria-hidden="true" />{VERDICT_WORD[level]}</span>
        <h1 id="ans-h" className="answer">{answer.lead}</h1>
      </div>
      <p className="ans-2">{answer.comms}</p>
      {answer.fix && <p className="fix" role="note"><b>What would fix this:</b> {answer.fix}</p>}
      <div className="ans-act">
        <button type="button" className="btn" aria-pressed={inCompare} onClick={onCompare}><Icon name="plus" size={16} />{inCompare ? "In Compare" : "Compare"}</button>
        <button type="button" className="btn" onClick={onFindDates}>Find better dates</button>
        <CopyLink hash={shareHash} />
        {slip}
      </div>
    </section>
  );
}
