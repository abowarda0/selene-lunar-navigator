# Luna's AI answers (free, Google Gemini)

Luna's built-in tips need nothing. Free-text questions go through this tiny server, so the API key never reaches the website.

1. Get a free key at Google AI Studio (aistudio.google.com → "Get API key"). No payment needed for the free tier.
2. Start the server (Node 18+):
   ```bash
   GEMINI_API_KEY=your-key node server/assistant.mjs
   ```
   Optional: `GEMINI_MODEL` (default `gemini-2.0-flash`; set it to whichever free Flash model AI Studio lists), `PORT` (default 8787).
3. In development, Vite forwards `/api/assistant` to it (see `web/vite.config.ts`). For a single deployed server, build the web app and run
   `STATIC_DIR=web/dist GEMINI_API_KEY=... node server/assistant.mjs` to serve the site and the AI from one place.

Safety built in: input checked (1–400 characters, body ≤ 8 KB), 8 questions per minute per visitor, 20 s timeout, and the website rejects any AI answer containing a number that is not on the page (`web/src/lib/guide.ts`, `safeAnswer`).
