import { createContext, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { hasServer, serverUrl } from "../api/client";
import { guideTips, safeAnswer, type GuideContext, type GuideFacts, type GuideView } from "../lib/guide";

interface Ctx { readonly ctx: GuideContext; readonly publish: (facts: GuideFacts, answer: string | null) => void }
const GuideCtx = createContext<Ctx | null>(null);

/** Holds what Luna knows about the current screen; pages publish their facts into it. */
export function GuideProvider({ view, children }: { readonly view: GuideView; readonly children: ReactNode }): ReactElement {
  const [state, setState] = useState<{ facts: GuideFacts; answer: string | null }>({ facts: {}, answer: null });
  const value = useMemo<Ctx>(() => ({ ctx: { view, ...state }, publish: (facts, answer) => setState({ facts, answer }) }), [view, state]);
  return <GuideCtx.Provider value={value}>{children}</GuideCtx.Provider>;
}

/** Pages call this so Luna can explain their numbers. */
export function usePublishGuide(facts: GuideFacts, answer: string | null): void {
  const g = useContext(GuideCtx);
  const key = JSON.stringify(facts) + (answer ?? "");
  useEffect(() => { g?.publish(facts, answer); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
}

function LunaFace({ talking }: { readonly talking: boolean }): ReactElement {
  return (
    <svg className={`luna-svg${talking ? " talk" : ""}`} viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <radialGradient id="luna-helm" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#f3f4f6" /><stop offset="1" stopColor="#9aa4b5" /></radialGradient>
        <linearGradient id="luna-visor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#13304f" /><stop offset="1" stopColor="#0b1626" /></linearGradient>
      </defs>
      <line x1="48" y1="14" x2="48" y2="4" stroke="#c9d1d9" strokeWidth="2.5" strokeLinecap="round" />
      <circle className="luna-beacon" cx="48" cy="4" r="3.5" fill="#f5b75b" />
      <circle cx="48" cy="50" r="36" fill="url(#luna-helm)" stroke="#3a4658" strokeWidth="2" />
      <rect x="21" y="34" width="54" height="34" rx="17" fill="url(#luna-visor)" stroke="#4da3ff" strokeWidth="1.5" />
      <ellipse className="luna-eye" cx="38" cy="50" rx="4" ry="5" fill="#8ec5ff" />
      <ellipse className="luna-eye" cx="58" cy="50" rx="4" ry="5" fill="#8ec5ff" />
      <path className="luna-mouth" d="M41 60q7 5 14 0" fill="none" stroke="#8ec5ff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M27 38q6-6 14-6" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      <circle cx="13" cy="52" r="5" fill="#f5b75b" stroke="#3a4658" />
      <circle cx="83" cy="52" r="5" fill="#4da3ff" stroke="#3a4658" />
    </svg>
  );
}

type Reply = { readonly kind: "tip" | "ai" | "note"; readonly text: string };

async function askLuna(question: string, ctx: GuideContext): Promise<Reply> {
  try {
    const r = await fetch(serverUrl("api/assistant"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, context: { page: ctx.view, ...ctx.facts, answer: ctx.answer } }) });
    const j = (await r.json()) as { ok: boolean; data: { text: string } | null; error: { message: string } | null };
    if (!j.ok || !j.data) return { kind: "note", text: j.error?.message ?? "I couldn't reach my AI helper. My built-in tips still work." };
    const check = safeAnswer(j.data.text, ctx);
    if (!check.ok) return { kind: "note", text: "My AI helper answered with numbers I can't confirm from this page, so I won't show it. Here is what the data says: " + (guideTips(ctx)[0] ?? "") };
    return { kind: "ai", text: j.data.text };
  } catch {
    return { kind: "note", text: "My AI helper is offline right now. My built-in tips still work." };
  }
}

/** Luna: a floating guide character that explains the current page from the app's own numbers. */
export function Luna(): ReactElement | null {
  const g = useContext(GuideCtx);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tips = useMemo(() => (g ? guideTips(g.ctx, hasServer) : []), [g]);
  useEffect(() => { setI(0); setReply(null); }, [g?.ctx.view, g?.ctx.answer]);
  if (!g) return null;
  const shown: Reply = reply ?? { kind: "tip", text: tips[i % Math.max(1, tips.length)] ?? "" };

  const submit = async () => {
    const question = q.trim();
    if (!question) { setErr("Type a question first."); return; }
    if (question.length > 400) { setErr("Keep it under 400 characters."); return; }
    setErr(null); setBusy(true);
    setReply(await askLuna(question, g.ctx));
    setBusy(false); setQ("");
  };

  return (
    <aside className={`luna${open ? " open" : ""}`} aria-label="Luna, your guide">
      {open && (
        <div className="luna-bubble" role="status" aria-live="polite">
          <p className="luna-name">Luna <span>{shown.kind === "ai" ? "· AI answer, checked against this page" : "· guide"}</span></p>
          <p className="luna-text">{busy ? "Thinking…" : shown.text}</p>
          <div className="luna-row">
            {tips.length > 1 && <button type="button" className="chip" onClick={() => { setReply(null); setI((n) => n + 1); }}>Next tip ({(i % tips.length) + 1}/{tips.length})</button>}
            <button type="button" className="chip" onClick={() => setOpen(false)}>Hide</button>
          </div>
          {hasServer && (
            <form className="luna-ask" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <input value={q} onChange={(e) => { setQ(e.target.value); setErr(null); }} placeholder="Ask Luna about this page" aria-label="Ask Luna a question" maxLength={400} />
              <button type="submit" className="btn primary" disabled={busy}>Ask</button>
            </form>
          )}
          {err && <p className="luna-err" role="alert">{err}</p>}
        </div>
      )}
      {!open && <button type="button" className="luna-teaser" onClick={() => setOpen(true)}>Need help? I'm Luna</button>}
      <button type="button" className="luna-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Hide Luna" : "Show Luna, your guide"}>
        <LunaFace talking={open && !busy} />
      </button>
    </aside>
  );
}
