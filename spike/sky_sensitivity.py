"""Sensitivity of visibility windows to (a) skyline direction spacing and (b) centre-only vs whole-disc rule."""
import sys, json, time
import numpy as np
sys.path.insert(0, '/home/yossef/nasa/spike')
import build_dataset as B
from lunar.fine import interpolate_to_minutes, windows_from_margin
from lunar.horizons import SUN, EARTH

OUT = sys.argv[1]
SITES = sys.argv[2].split(',')
OFFSETS = np.linspace(-1.0, 1.0, 41)  # fractions of the disc radius across its width

def sky_at(site, step):
    B.SKY_STEP_DEG = step
    t = time.time(); prof, _ = B.skyline(site)
    print(f'  skyline {site} at {step}°: {time.time()-t:.0f}s', flush=True)
    return np.asarray(prof['elev'])

def h_at(sky, step, az):
    grid = np.append(np.arange(len(sky)) * step, 360.0)
    return np.interp(np.mod(az, 360.0), grid, np.append(sky, sky[0]))

def margin_centre(tr, sky, step):
    return tr['el'] + tr['radius_deg'] - h_at(sky, step, tr['az'])

def margin_disc(tr, sky, step):
    """Any part of the disc above the skyline: max over points along the disc's upper edge."""
    r = tr['radius_deg']; best = np.full(r.shape, -np.inf)
    cosel = np.maximum(np.cos(np.radians(tr['el'])), 1e-3)
    for f in OFFSETS:
        x = f * r
        top = tr['el'] + np.sqrt(np.maximum(r * r - x * x, 0.0))
        best = np.maximum(best, top - h_at(sky, step, tr['az'] + x / cosel))
    return best

def summ(ws):
    closed = [w for w in ws if not (w.open_start or w.open_end)]
    gaps = [(b.start - a.end).total_seconds() / 60 for a, b in zip(ws, ws[1:])]
    return {'windows': len(ws), 'hours': round(sum(w.hours for w in ws), 2),
            'short_lit_min': sorted(round(w.hours * 60, 1) for w in closed if w.hours < 1),
            'short_dark_min': sorted(round(g, 1) for g in gaps if g < 60),
            'events': [e for w in ws for e in ((w.start, 'rise') if not w.open_start else None, (w.end, 'set') if not w.open_end else None) if e]}

def shifts(ref, other):
    """Per reference event, minutes to the nearest event of the same kind in other."""
    out = []
    for t, k in ref['events']:
        c = [abs((t - u).total_seconds()) / 60 for u, kk in other['events'] if kk == k]
        out.append(min(c) if c else float('inf'))
    return out

res = {}
for site in SITES:
    print('==', site, flush=True)
    skies = {0.05: sky_at(site, 0.05), 0.01: sky_at(site, 0.01)}
    for body, tgt in (('sun', SUN), ('earth', EARTH)):
        tr = interpolate_to_minutes(B.ephemeris(site, tgt, body))
        runs = {
            'A centre, 0.05°': windows_from_margin(tr['t'], margin_centre(tr, skies[0.05], 0.05)),
            'B centre, 0.01°': windows_from_margin(tr['t'], margin_centre(tr, skies[0.01], 0.01)),
            'C whole disc, 0.01°': windows_from_margin(tr['t'], margin_disc(tr, skies[0.01], 0.01)),
        }
        sm = {k: summ(v) for k, v in runs.items()}
        ref = sm['A centre, 0.05°']
        row = {}
        for k, s in sm.items():
            sh = shifts(ref, s) if k != 'A centre, 0.05°' else []
            fin = [x for x in sh if np.isfinite(x)]
            row[k] = {kk: vv for kk, vv in s.items() if kk != 'events'}
            if sh:
                row[k]['events_unmatched'] = len(sh) - len(fin)
                row[k]['median_shift_min'] = round(float(np.median(fin)), 1) if fin else None
                row[k]['max_shift_min'] = round(max(fin), 1) if fin else None
            print(f'  {body:5} {k:20} {row[k]}', flush=True)
        res[f'{site}_{body}'] = row
json.dump(res, open(OUT, 'w'), indent=1, default=str)
