import re
from hz import call
base = dict(EPHEM_TYPE="OBSERVER", CENTER="'coord@301'", COORD_TYPE="'GEODETIC'",
            SITE_COORD="'0,-89.5,0'", START_TIME="'2026-12-01'", STOP_TIME="'2026-12-01 03:00'",
            STEP_SIZE="'1 h'")
def table(res):
    return res[res.find("$$SOE")-400:res.find("$$EOE")+5]

# A: Earth, extra quantities, CSV
d,_,dt = call("q2a_earth_csv", {**base, "COMMAND":"'399'", "QUANTITIES":"'4,13,20'", "CSV_FORMAT":"'YES'"})
print("=== A Earth az/el + angular diameter + range, CSV  (%.2fs)"%dt); print(table(d["result"]))
# B: Sun, same, CSV
d,_,dt = call("q2b_sun_csv", {**base, "COMMAND":"'10'", "QUANTITIES":"'4,13,20'", "CSV_FORMAT":"'YES'"})
print("=== B Sun (%.2fs)"%dt); print(table(d["result"]))
# C: meaning of the marker columns
r = d["result"]; i = r.find("Column meaning")
for kw in ["solar presence","Daylight","lunar presence","*  "]:
    j=r.find(kw, i)
    if j>0: print("=== C marker text near:",kw); print(r[j-200:j+900]); break
