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

# Custom coordinates (point server)

A latitude/longitude typed on Home ("Have your own coordinates?" → **Compute this point**) runs the same pipeline
as the 12 ready-made sites, on demand: JPL Horizons Sun, Earth and the three DSN 70 m dishes for 14 months, and
the LOLA terrain skyline. The result is saved, so each point is computed once.

1. Python 3.11+ with the packages in `server/requirements.txt`:
   ```bash
   python -m pip install -r server/requirements.txt
   ```
2. Start it from the repo root (port 8790; `PORT` and `POINTS_DIR` change it):
   ```bash
   python server/point_server.py
   ```
   In development Vite forwards `/api/points` to it (`web/vite.config.ts`). For a deployed site, point
   `VITE_POINTS_BASE` at it (for example `https://points.example.org/api/points`) or put both behind one proxy.

| Call | What it does |
|---|---|
| `POST /api/points` `{"lat": -85.3, "lon_e": 31.2}` | Starts (or returns) the job for that point, rounded to 0.001° |
| `GET /api/points/<id>` | `queued` / `running` (step 1–7 with a message) / `done` (with the site) / `error` |
| `GET /api/points` | Every finished point, so the app lists them again after a reload |
| `GET /api/points/files/<name>` | `year_`, `terrain_`, `height_<id>.json` and `terrain_<id>.png` only |

Terrain by latitude: south of 80.5° S the full polar layers (5–20 m near the point, 240 m to 150 km); 60–80.5° S the
LOLA 60 m map to 30 km; elsewhere a smooth Moon, which the app labels. Jobs run one at a time (polite use of JPL
Horizons), at most 6 waiting, 8 new points per visitor per hour. Downloads are cached in `spike/fine/`, results in
`server/points/` (both git-ignored). A first point in a new polar area downloads tens of MB of LOLA terrain.

The command line works too: `python server/point_builder.py -85.3 31.2`.
