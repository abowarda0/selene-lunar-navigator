"""Luna's free-text answers (Google Gemini), for the hosted point server. Same rules as server/assistant.mjs.

The key stays on the server (GEMINI_API_KEY). Input is checked (1-400 characters, body <= 8 KB), each visitor
gets 8 questions a minute, and the website still rejects any answer containing a number not on the page
(web/src/lib/guide.ts, safeAnswer).
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request

# Local runs: read server/.env (git-ignored) like assistant.mjs does. Real environment variables win.
_ENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_ENV):
    for _line in open(_ENV, encoding="utf-8").read().splitlines():
        _k, _, _v = _line.partition("=")
        if _k.strip() and _v and _k.strip() not in os.environ and not _k.strip().startswith("#"):
            os.environ[_k.strip()] = _v.strip().strip("'\"")

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
MAX_QUESTION = 400
MAX_BODY = 8_000
PER_MINUTE = 8
SYSTEM = " ".join([
    "You are Luna, the friendly guide inside SELENE, a lunar landing-site planner for NASA Space Apps.",
    "Explain in plain words for the public, in 2-4 short sentences.",
    "Use ONLY the numbers given in the context JSON. Never invent, estimate or round numbers differently. If the context does not contain the answer, say you don't know and point to the right page.",
    "Facts you may rely on: Sun and Earth positions come from NASA JPL Horizons; terrain from NASA LRO LOLA laser maps; Earth contact means one of NASA's three 70 m Deep Space Network dishes can reach the lander; verdicts Good/Marginal/Poor are the app's own rule of thumb, not a NASA standard.",
])

_hits: dict[str, list[float]] = {}
_lock = threading.Lock()


def key() -> str:
    return os.environ.get("GEMINI_API_KEY", "")


def limited(ip: str) -> bool:
    now = time.time()
    with _lock:
        recent = [t for t in _hits.get(ip, []) if now - t < 60]
        _hits[ip] = recent + [now]
        for k in [k for k, ts in _hits.items() if not any(now - t < 60 for t in ts)]:
            del _hits[k]
        return len(recent) >= PER_MINUTE


def ask(question: str, context: dict) -> str:
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": f"Context JSON: {json.dumps(context)}\n\nQuestion: {question}"}]}],
        "generationConfig": {"maxOutputTokens": 300, "temperature": 0.2},
    }).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=body, method="POST", headers={"content-type": "application/json", "x-goog-api-key": key()})
    with urllib.request.urlopen(req, timeout=20) as r:
        j = json.loads(r.read())
    text = "".join(p.get("text", "") for p in (j.get("candidates") or [{}])[0].get("content", {}).get("parts", [])).strip()
    if not text:
        raise RuntimeError("gemini_empty")
    return text


def handle(raw: bytes, ip: str) -> tuple[int, dict]:
    """(HTTP status, envelope) for one POST /api/assistant body."""
    fail = lambda status, code, msg: (status, {"ok": False, "data": None, "error": {"code": code, "message": msg}})  # noqa: E731
    if limited(ip):
        return fail(429, "rate_limited", "Too many questions, wait a minute.")
    if not raw or len(raw) > MAX_BODY:
        return fail(400, "bad_request", "Send a small JSON body.")
    try:
        body = json.loads(raw)
    except ValueError:
        return fail(400, "bad_request", "Send a small JSON body.")
    question = body.get("question").strip() if isinstance(body.get("question"), str) else ""
    if not question or len(question) > MAX_QUESTION:
        return fail(400, "bad_request", f"Ask a question of 1-{MAX_QUESTION} characters.")
    context = body.get("context") if isinstance(body.get("context"), dict) else {}
    if not key():
        return fail(503, "not_configured", "The AI is not set up on this server; Luna's built-in explanations still work.")
    try:
        return 200, {"ok": True, "data": {"text": ask(question, context)}, "error": None}
    except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError, KeyError, IndexError) as e:
        print("assistant error:", e)
        return fail(502, "upstream_unavailable", "The AI did not answer. Try again.")
