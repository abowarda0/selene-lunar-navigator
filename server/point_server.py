"""Custom-point service for SELENE: runs the real pipeline (Horizons + DSN + LOLA) for a typed lat/lon.

  POST /api/points            {"lat": -85.3, "lon_e": 31.2}  -> job (queued / running / done / error)
  GET  /api/points/<id>       job status with step, message and, when done, the site record
  GET  /api/points            every finished point (so the app can list them again after a reload)
  GET  /api/points/files/<f>  year_/terrain_/height_<id>.json and terrain_<id>.png for finished points

Jobs run one at a time in a background thread (JPL Horizons asks for polite use); results and downloads are
cached, so a point is computed once. Standard library only, plus numpy/matplotlib for the pipeline itself.

Run from the repo root:  python server/point_server.py      (PORT, default 8790; POINTS_DIR, default server/points)
In development, Vite forwards /api/points to it (web/vite.config.ts).
"""
from __future__ import annotations

import json
import logging
import os
import queue
import re
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import point_builder as P

log = logging.getLogger("points")
PORT = int(os.environ.get("PORT", "8790"))
OUT = Path(os.environ.get("POINTS_DIR", str(P.ROOT / "server/points"))).resolve()
MAX_QUEUE = 6
PER_IP_PER_HOUR = 8
MAX_BODY = 2_000
FILE_RE = re.compile(r"^(year|terrain|height)_pt_[ns]\d{5}_e\d{6}\.(json|png)$")
ID_RE = re.compile(r"^pt_[ns]\d{5}_e\d{6}$")
TYPES = {".json": "application/json", ".png": "image/png"}

jobs: dict[str, dict] = {}
lock = threading.RLock()  # re-entrant: handlers call public() while holding it
work: "queue.Queue[tuple[str, float, float]]" = queue.Queue()
hits: dict[str, list[float]] = {}


def load_finished() -> None:
    """Points computed in earlier runs are ready at once."""
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("site_pt_*.json"):
        try:
            site = json.loads(f.read_text())["data"]
            if (OUT / f"year_{site['id']}.json").exists():
                jobs[site["id"]] = {"id": site["id"], "status": "done", "step": P.STEPS, "steps": P.STEPS, "message": "Ready", "site": site}
        except (OSError, ValueError, KeyError):
            continue


def worker() -> None:
    while True:
        pid, lat, lon = work.get()
        with lock:
            jobs[pid].update(status="running", started=time.time())

        def progress(k: int, msg: str, pid: str = pid) -> None:
            with lock:
                jobs[pid].update(step=k, message=msg)

        try:
            site = P.build_point(lat, lon, OUT, progress)
            with lock:
                jobs[pid].update(status="done", step=P.STEPS, message="Ready", site=site, seconds=round(time.time() - jobs[pid]["started"]))
            log.info("%s done in %ss", pid, jobs[pid]["seconds"])
        except Exception as e:  # noqa: BLE001 - any pipeline failure becomes a readable job error
            traceback.print_exc()
            msg = str(e) or e.__class__.__name__
            friendly = ("A NASA data service did not answer. Try again in a minute." if any(s in msg.lower() for s in ("timed out", "urlopen", "connection", "http error", "horizons"))
                        else f"The computation failed: {msg[:200]}")
            with lock:
                jobs[pid].update(status="error", message=friendly)
        finally:
            work.task_done()


def public(job: dict) -> dict:
    with lock:
        out = {k: job[k] for k in ("id", "status", "step", "steps", "message") if k in job}
        if job.get("site"):
            out["site"] = job["site"]
        if job["status"] == "queued":
            out["ahead"] = sum(1 for j in jobs.values() if j["status"] in ("queued", "running") and j.get("queued_at", 0) < job.get("queued_at", 0))
        return out


def limited(ip: str) -> bool:
    now = time.time()
    recent = [t for t in hits.get(ip, []) if now - t < 3600]
    hits[ip] = recent + [now]
    return len(recent) >= PER_IP_PER_HOUR


class Handler(BaseHTTPRequestHandler):
    server_version = "SelenePoints/1"

    def log_message(self, fmt: str, *args) -> None:  # quieter than the default
        log.debug(fmt, *args)

    def send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def fail(self, status: int, code: str, message: str) -> None:
        self.send(status, {"ok": False, "data": None, "error": {"code": code, "message": message}})

    def ok(self, data) -> None:
        self.send(200, {"ok": True, "data": data, "error": None})

    def client_ip(self) -> str:
        fwd = self.headers.get("x-forwarded-for", "") if os.environ.get("TRUST_PROXY") == "1" else ""
        return fwd.split(",")[0].strip() or self.client_address[0]

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]
        if path == "/api/points":
            with lock:
                done = [j["site"] for j in jobs.values() if j["status"] == "done"]
            return self.ok(done)
        if path.startswith("/api/points/files/"):
            name = path.rsplit("/", 1)[-1]
            if not FILE_RE.match(name):
                return self.fail(404, "not_found", "No such file.")
            f = OUT / name
            if not f.exists():
                return self.fail(404, "not_found", "That point has not been computed.")
            data = f.read_bytes()
            self.send_response(200)
            self.send_header("content-type", TYPES[f.suffix])
            self.send_header("cache-control", "public, max-age=3600")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return None
        pid = path.removeprefix("/api/points/")
        if ID_RE.match(pid):
            job = jobs.get(pid)
            return self.ok(public(job)) if job else self.fail(404, "not_found", "Unknown point.")
        return self.fail(404, "not_found", "Not found.")

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/api/points":
            return self.fail(404, "not_found", "Not found.")
        size = int(self.headers.get("content-length") or 0)
        if size <= 0 or size > MAX_BODY:
            return self.fail(400, "bad_request", "Send {\"lat\": ..., \"lon_e\": ...}.")
        try:
            body = json.loads(self.rfile.read(size))
            lat, lon = float(body["lat"]), float(body["lon_e"])
        except (ValueError, KeyError, TypeError):
            return self.fail(400, "bad_request", "lat and lon_e must be numbers.")
        if not (-90 <= lat <= 90 and -180 <= lon <= 360):
            return self.fail(400, "bad_request", "Latitude -90 to 90, longitude 0 to 360 east.")
        pid = P.point_id(lat, lon)
        with lock:
            job = jobs.get(pid)
            if job and job["status"] in ("done", "queued", "running"):
                return self.ok(public(job))
            if sum(1 for j in jobs.values() if j["status"] in ("queued", "running")) >= MAX_QUEUE:
                return self.fail(503, "busy", "Several points are being computed. Try again in a few minutes.")
        if limited(self.client_ip()):
            return self.fail(429, "rate_limited", f"At most {PER_IP_PER_HOUR} new points an hour per visitor.")
        with lock:
            jobs[pid] = {"id": pid, "status": "queued", "step": 0, "steps": P.STEPS, "message": "Waiting to start", "queued_at": time.time()}
        work.put((pid, lat, lon % 360))
        return self.ok(public(jobs[pid]))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    load_finished()
    threading.Thread(target=worker, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    log.info("SELENE custom points on http://127.0.0.1:%d (%d ready, files in %s)", PORT, sum(j["status"] == "done" for j in jobs.values()), OUT)
    srv.serve_forever()


if __name__ == "__main__":
    main()
