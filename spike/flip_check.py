"""True 1-min Horizons vs 10-min interpolated, 5 m skyline, ridge, around the two flicker events."""
import sys, json
from datetime import datetime, timedelta, timezone
sys.path.insert(0, '/home/yossef/nasa/spike')
import build_dataset as B
from lunar.fine import interpolate_to_minutes, margin_deg, windows_from_margin
from lunar.horizons import SUN, Site, fetch
U = timezone.utc
sky, _ = B.skyline('ridge')
step = B.SKY_STEP_DEG
s = json.load(open('/home/yossef/nasa/web/public/data/sites.json'))
s = [x for x in s.get('data', s) if x['id'] == 'ridge'][0]
site = Site('ridge', s['lon_e'], s['lat'], 0.0)
elev = sky['elev']
for c in [datetime(2027,4,15,17,tzinfo=U), datetime(2027,6,14,0,30,tzinfo=U)]:
    a, b = c - timedelta(hours=12), c + timedelta(hours=12)
    res = {}
    for st in (10, 1):
        rows = fetch(SUN, site, a, b, st)
        tr = interpolate_to_minutes(rows)
        m = margin_deg(tr, elev, step)
        res[st] = windows_from_margin(tr['t'], m)
    print('==', c.isoformat())
    for st in (10, 1):
        print(f' {st:>2}-min Horizons:', [(w.start.strftime('%H:%M:%S'), w.end.strftime('%H:%M:%S'), round(w.hours*60,1)) for w in res[st]])
