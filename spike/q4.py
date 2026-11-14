import json, urllib.request, urllib.parse
from hz import call, API
def rows(res):
    s=res.find("$$SOE"); e=res.find("$$EOE"); return res[s+6:e].strip().splitlines() if s>0 else []
m=json.load(open("raw/q1_sun_basic.meta.json")); print("=== H response headers:", json.dumps({k:v for k,v in m["headers"].items()}, indent=0))
# H2: CORS preflight-like GET with an Origin header
req=urllib.request.Request(API+"?format=json&COMMAND='10'&OBJ_DATA='NO'&MAKE_EPHEM='NO'", headers={"Origin":"https://example.org"})
with urllib.request.urlopen(req,timeout=60) as r: print("=== H2 with Origin -> ACAO:", r.headers.get("Access-Control-Allow-Origin"))
base=dict(EPHEM_TYPE="OBSERVER", CENTER="'coord@301'", COORD_TYPE="'GEODETIC'", QUANTITIES="'4'", CSV_FORMAT="'YES'", OBJ_DATA="'NO'")
# I: altitude effect at the pole point, 0 km vs 1 km vs 5 km
for alt in ["0","1","5"]:
    d,_,_=call(f"q4i_alt_{alt}", {**base,"COMMAND":"'10'","SITE_COORD":f"'0,-89.5,{alt}'","START_TIME":"'2026-12-01'","STOP_TIME":"'2026-12-01 00:01'","STEP_SIZE":"'1 m'"})
    print(f"=== I alt {alt} km:", rows(d["result"])[0])
# J: far-side site (Chang'e-4 area, 177.6E, -45.4) - Earth elevation over 30 days
d,_,_=call("q4j_farside_earth", {**base,"COMMAND":"'399'","SITE_COORD":"'177.6,-45.4,0'","START_TIME":"'2026-12-01'","STOP_TIME":"'2026-12-31'","STEP_SIZE":"'1 d'"})
el=[float(r.split(",")[4]) for r in rows(d["result"])]; print("=== J far side Earth elev min/max:", min(el), max(el))
# K: explicit time list (TLIST)
d,_,_=call("q4k_tlist", {**base,"COMMAND":"'10'","SITE_COORD":"'0,-89.5,0'","TLIST":"'2026-12-01 00:00' '2026-12-15 12:00' '2027-06-01 06:30'","TLIST_TYPE":"'CAL'"})
print("=== K TLIST:"); print("\n".join(rows(d["result"])))
# L: bad input (latitude out of range) -> what does an error look like
d,_,_=call("q4l_bad_lat", {**base,"COMMAND":"'10'","SITE_COORD":"'0,-95,0'","START_TIME":"'2026-12-01'","STOP_TIME":"'2026-12-02'","STEP_SIZE":"'1 h'"})
print("=== L bad latitude keys:", list(d.keys())); print((d.get("error") or d.get("result",""))[-500:])
# M: how far ahead can we go
d,_,_=call("q4m_2035", {**base,"COMMAND":"'10'","SITE_COORD":"'0,-89.5,0'","START_TIME":"'2035-01-01'","STOP_TIME":"'2035-01-02'","STEP_SIZE":"'12 h'"})
print("=== M year 2035:", rows(d["result"])[:2] or (d.get("error") or d["result"][-300:]))
