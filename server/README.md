# Luna's AI answers (free, Google Gemini)

Luna's built-in tips need nothing. Free-text questions go through this tiny server, so the API key never reaches the website.

1. Get a free key at Google AI Studio (aistudio.google.com → "Get API key"). No payment needed for the free tier.
2. Put the key in `server/.env` (git-ignored, never commit it):
   ```
   GEMINI_API_KEY=your-key
   ```
   then start the server (Node 18+) from the repo root:
   ```bash
   node server/assistant.mjs
   ```
   An environment variable (`GEMINI_API_KEY=... node server/assistant.mjs`) still works and wins over the file.
   Behind a hosting proxy, set `TRUST_PROXY=1` so the 8-questions-a-minute limit applies per visitor.
   Optional: `GEMINI_MODEL` (default `gemini-3.5-flash-lite`: answers in about 2 s; the larger Flash models are too slow for a chat guide), `PORT` (default 8787).
3. In development, Vite forwards `/api/assistant` to it (see `web/vite.config.ts`). For a single deployed server, build the web app and run
   `STATIC_DIR=web/dist GEMINI_API_KEY=... node server/assistant.mjs` to serve the site and the AI from one place.

Safety built in: input checked (1–400 characters, body ≤ 8 KB), 8 questions per minute per visitor, 20 s timeout, and the website rejects any AI answer containing a number that is not on the page (`web/src/lib/guide.ts`, `safeAnswer`).
