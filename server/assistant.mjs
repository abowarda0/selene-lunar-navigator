// Luna's free-text answers: a tiny proxy to Google's Gemini API (free tier).
// The key lives only here, in the GEMINI_API_KEY environment variable; the website never sees it.
// Run:  GEMINI_API_KEY=... node server/assistant.mjs      (optional: GEMINI_MODEL, PORT, STATIC_DIR)
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Optional server/.env (git-ignored) so the key need not be typed on every start. Real env vars win.
const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const PORT = Number(process.env.PORT ?? 8787);
const KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;
const MAX_QUESTION = 400;
const MAX_BODY = 8_000;
const RATE = { perMinute: 8 };
const hits = new Map();

const SYSTEM = [
  "You are Luna, the friendly guide inside SELENE, a lunar landing-site planner for NASA Space Apps.",
  "Explain in plain words for the public, in 2-4 short sentences.",
  "Use ONLY the numbers given in the context JSON. Never invent, estimate or round numbers differently. If the context does not contain the answer, say you don't know and point to the right page.",
  "Facts you may rely on: Sun and Earth positions come from NASA JPL Horizons; terrain from NASA LRO LOLA laser maps; Earth contact means one of NASA's three 70 m Deep Space Network dishes can reach the lander; verdicts Good/Marginal/Poor are the app's own rule of thumb, not a NASA standard.",
].join(" ");

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
};
const fail = (res, status, code, message) => send(res, status, { ok: false, data: null, error: { code, message } });

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.set(ip, [...recent, now]);
  return recent.length >= RATE.perMinute;
}
// Forget visitors idle for a minute, so the rate-limit table cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of hits) if (!ts.some((t) => now - t < 60_000)) hits.delete(ip);
}, 60_000).unref();

/** Visitor address; behind a hosting proxy (TRUST_PROXY=1) use the first X-Forwarded-For hop. */
const clientIp = (req) =>
  (process.env.TRUST_PROXY === "1" && String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim()) || req.socket.remoteAddress || "?";

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error("too_large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function ask(question, context) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Context JSON: ${JSON.stringify(context)}\n\nQuestion: ${question}` }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`gemini_${r.status}`);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("gemini_empty");
  return text;
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
async function serveStatic(req, res) {
  const url = new URL(req.url, "http://x");
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(STATIC_DIR, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(STATIC_DIR)) return fail(res, 403, "forbidden", "Not allowed.");
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    fail(res, 404, "not_found", "Not found.");
  }
}

http.createServer(async (req, res) => {
  if (req.url === "/api/assistant" && req.method === "POST") {
    const ip = clientIp(req);
    if (limited(ip)) return fail(res, 429, "rate_limited", "Too many questions, wait a minute.");
    let body;
    try { body = await readBody(req); } catch { return fail(res, 400, "bad_request", "Send a small JSON body."); }
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question || question.length > MAX_QUESTION) return fail(res, 400, "bad_request", `Ask a question of 1-${MAX_QUESTION} characters.`);
    const context = typeof body?.context === "object" && body.context !== null ? body.context : {};
    if (!KEY) return fail(res, 503, "not_configured", "The AI is not set up on this server; Luna's built-in explanations still work.");
    try {
      return send(res, 200, { ok: true, data: { text: await ask(question, context) }, error: null });
    } catch (e) {
      console.error("assistant error:", e.message);
      return fail(res, 502, "upstream_unavailable", "The AI did not answer. Try again.");
    }
  }
  if (STATIC_DIR && req.method === "GET") return serveStatic(req, res);
  fail(res, 404, "not_found", "Not found.");
}).listen(PORT, "127.0.0.1", () => console.log(`Luna assistant on http://127.0.0.1:${PORT} (model ${MODEL}, key ${KEY ? "set" : "missing"})`));
