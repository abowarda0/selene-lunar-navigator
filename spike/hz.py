"""Small helper to call the JPL Horizons API and save raw responses."""
import json, sys, time, urllib.parse, urllib.request

API = "https://ssd.jpl.nasa.gov/api/horizons.api"

def call(name, params, out_dir="raw"):
    q = {"format": "json", **params}
    url = API + "?" + urllib.parse.urlencode(q)
    t0 = time.time()
    with urllib.request.urlopen(url, timeout=120) as r:
        body = r.read().decode()
        headers = dict(r.headers)
        status = r.status
    dt = time.time() - t0
    with open(f"{out_dir}/{name}.json", "w") as f:
        f.write(body)
    with open(f"{out_dir}/{name}.meta.json", "w") as f:
        json.dump({"url": url, "status": status, "seconds": round(dt, 2), "headers": headers, "bytes": len(body)}, f, indent=1)
    return json.loads(body), headers, dt
