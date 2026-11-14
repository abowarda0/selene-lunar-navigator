from hz import call
# Test point near the lunar south pole: lat -89.5, east lon 0, height 0 km
base = dict(EPHEM_TYPE="OBSERVER", CENTER="'coord@301'", COORD_TYPE="'GEODETIC'",
            SITE_COORD="'0,-89.5,0'", START_TIME="'2026-12-01'", STOP_TIME="'2026-12-02'",
            STEP_SIZE="'1 h'", QUANTITIES="'4'")
d, h, dt = call("q1_sun_basic", {**base, "COMMAND": "'10'"})
print("keys:", list(d.keys()), "time:", round(dt, 2), "s")
print(d.get("signature"))
print(d["result"][:6000])
