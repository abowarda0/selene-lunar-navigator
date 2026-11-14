import json, time, urllib.parse, urllib.request
from hz import call, API
def table(res, n=1500):
    s=res.find("$$SOE"); return res[s-300:s+n] if s>0 else res[-1500:]
apollo = dict(EPHEM_TYPE="OBSERVER", CENTER="'coord@301'", COORD_TYPE="'GEODETIC'", SITE_COORD="'23.473,0.674,0'")
pole   = dict(EPHEM_TYPE="OBSERVER", CENTER="'coord@301'", COORD_TYPE="'GEODETIC'", SITE_COORD="'0,-89.5,0'")

# D: rise/set-only mode, Apollo 11 site, Sun, 60 days
d,_,dt = call("q3d_rts_apollo_sun", {**apollo, "COMMAND":"'10'", "START_TIME":"'2026-12-01'", "STOP_TIME":"'2027-01-30'",
      "STEP_SIZE":"'5 m'", "QUANTITIES":"'4'", "R_T_S_ONLY":"'TVH'", "CSV_FORMAT":"'YES'"})
print("=== D RTS Apollo11 Sun (%.2fs)"%dt); print(table(d["result"]))
# E: rise/set with an elevation cut-off of 2 deg (one value for all azimuths)
d,_,dt = call("q3e_rts_elevcut", {**apollo, "COMMAND":"'10'", "START_TIME":"'2026-12-01'", "STOP_TIME":"'2027-01-30'",
      "STEP_SIZE":"'5 m'", "QUANTITIES":"'4'", "R_T_S_ONLY":"'TVH'", "ELEV_CUT":"'2'", "CSV_FORMAT":"'YES'"})
print("=== E RTS with ELEV_CUT=2 (%.2fs)"%dt); print(table(d["result"],700))
# F: big table: 1-minute steps over 30 days (43,201 rows)
d,_,dt = call("q3f_1min_30d", {**pole, "COMMAND":"'10'", "START_TIME":"'2026-12-01'", "STOP_TIME":"'2026-12-31'",
      "STEP_SIZE":"'1 m'", "QUANTITIES":"'4'", "CSV_FORMAT":"'YES'"})
r=d.get("result",""); rows=r.count("\n",r.find("$$SOE"),r.find("$$EOE")) if "$$SOE" in r else 0
print("=== F 1-min x 30 days: %.2fs, %d chars, rows=%d, error=%s"%(dt,len(r),rows,d.get("error","")[:300]))
# G: limit: 1-minute steps over 120 days (172,801 rows)
d,_,dt = call("q3g_1min_120d", {**pole, "COMMAND":"'10'", "START_TIME":"'2026-12-01'", "STOP_TIME":"'2027-03-31'",
      "STEP_SIZE":"'1 m'", "QUANTITIES":"'4'", "CSV_FORMAT":"'YES'"})
r=d.get("result",""); print("=== G 1-min x 120 days: %.2fs, error=%s"%(dt,(d.get("error") or r[-600:])[:600]))
