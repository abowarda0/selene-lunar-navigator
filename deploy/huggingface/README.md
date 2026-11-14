---
title: SELENE Server
emoji: 🌙
colorFrom: indigo
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Custom lunar points and Luna AI for SELENE
---

# SELENE server

Backend for the SELENE Lunar Landing Site Navigator (NASA Space Apps Cairo 2026):

- `POST /api/points` computes a typed latitude/longitude with the same NASA pipeline as the ready-made sites
  (JPL Horizons Sun, Earth and DSN dishes; NASA LOLA terrain skyline). About 2.5–3.5 min per new point.
- `POST /api/assistant` answers questions for Luna, the in-app guide (needs the `GEMINI_API_KEY` secret).
- `GET /healthz` reports the service state.

Settings (Space → Settings → Variables and secrets):

| Name | Kind | Value |
|---|---|---|
| `GEMINI_API_KEY` | Secret | Google AI Studio key (optional; Luna's built-in tips work without it) |
| `CORS_ORIGINS` | Variable | The website's origin, e.g. `https://abowarda0.github.io` (comma-separated for several) |
| `TRUST_PROXY` | Variable | `1` (Spaces sit behind a proxy; rate limits then apply per visitor) |

Computed points are kept until the Space restarts (free Spaces have no persistent disk).
Source: the SELENE repository, folders `server/` and `spike/`.
