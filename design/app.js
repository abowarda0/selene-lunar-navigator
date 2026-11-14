/* Landing Site Navigator: UI/UX design prototype.
   Reads API-contract v1 envelopes from window.LSN_DATA through a mock API with the real
   endpoints' shape. The page never derives a metric; it only formats values and, in Compare,
   subtracts two backend values to show a difference. */
(() => {
  "use strict";
  const DATA = window.LSN_DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = (iso) => Date.parse(iso);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const LETTERS = ["A", "B", "C"];
  const LEVEL_WORD = { good: "Good", marginal: "Marginal", poor: "Poor" };
  const API_DELAY_MS = 320;

  /* ── formatting ── */
  const fmtDate = (iso) => { const d = new Date(T(iso)); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const fmtDT = (iso) => { const d = new Date(T(iso)); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
  const n1 = (v) => (v == null ? "–" : Number(v).toFixed(1));
  const sign = (v, digits = 1) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(digits);
  function fmtHM(h) {
    const total = Math.round(h * 60), hh = Math.floor(total / 60), mm = total % 60;
    return hh === 0 ? `${mm} min` : `${hh} h ${String(mm).padStart(2, "0")} m`;
  }
  /** Big + small parts for a duration in hours: days when long, h/m when short. */
  function durParts(h) {
    if (h >= 48) return { big: `${(h / 24).toFixed(1)} days`, small: `${n1(h)} h` };
    return { big: fmtHM(h), small: "" };
  }
  const durText = (h) => { const p = durParts(h); return p.small ? `${p.big} (${p.small})` : p.big; };
  const lonText = (lon) => `${Number(lon).toFixed(3)}° E`;
  const latText = (lat) => `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}`;
  const tip = (text) => `<button type="button" class="tip" data-tip="${esc(text)}" aria-label="${esc(text)}">?</button>`;

  const TIPS = {
    clearance: "How far the Sun's top edge is above the mountains in its direction. Below zero means hidden by that many degrees.",
    elevation: "Height above a flat horizon in degrees. 0° is on the horizon, 90° is straight up.",
    sunlit: "Share of the period with any part of the Sun above the real skyline. Drives solar power and heat.",
    earth: "Share of the period with Earth above the skyline: direct radio contact is possible without a relay satellite.",
    both: "Time with Sun and Earth up together: power and direct contact at once. The best operating time.",
    verdict: "Good, Marginal or Poor from the backend. The thresholds are provisional until the team fixes the metric definitions.",
    skyline: "The line where ground meets sky around the site, from NASA LOLA elevation maps.",
    open: "This window touches the edge of the date range, so it may continue outside it.",
  };

  /* ── mock API with the contract's envelope ── */
  const ok = (data) => ({ ok: true, data, error: null });
  const fail = (code, message) => ({ ok: false, data: null, error: { code, message } });
  const wait = (v) => new Promise((res) => setTimeout(() => res(v), API_DELAY_MS));
  const SITES = DATA.sites.data;
  const siteById = (id) => SITES.find((s) => s.id === id);
  const datesFor = (id) => Object.keys(DATA.scenarios).filter((k) => k.startsWith(id + "|")).map((k) => k.split("|")[1]).sort();
  const ALL_DATES = [...new Set(Object.keys(DATA.scenarios).map((k) => k.split("|")[1]))].sort();

  const API = {
    scenario({ site, start, days }) {
      const s = siteById(site);
      if (!s) return wait(fail("unknown_site", `No site called “${site}”. Pick one from the site list.`));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return wait(fail("bad_request", "Start date is missing or not a valid date. Use the date picker."));
      if (!Number.isInteger(days) || days < 1 || days > 60) return wait(fail("bad_request", "Mission length must be a whole number from 1 to 60 days."));
      const env = DATA.scenarios[`${site}|${start}|${days}`];
      if (!env) {
        const have = datesFor(site).map(fmtDate).join(" and ");
        return wait(fail("not_in_prototype", `This prototype has no run for ${s.name} starting ${fmtDate(start + "T00:00Z")} for ${days} days. Computed runs: ${have}, 30 days. The live API computes any date.`));
      }
      return wait(env);
    },
  };

  /* ── state ── */
  const PRESETS = [
    { id: "slip", title: "Our landing slipped 2 weeks", sub: "Chandrayaan-3 site: 1 Dec vs 15 Dec", cols: [["chandrayaan3", "2026-12-01"], ["chandrayaan3", "2026-12-15"]] },
    { id: "pole", title: "Pole vs mid-latitude", sub: "Polar ridge vs Chandrayaan-3 (69° S), same date", cols: [["chandrayaan3", "2026-12-01"], ["ridge", "2026-12-01"]] },
    { id: "polar-dates", title: "One polar site, two dates", sub: "Ridge top: Earth comes and goes", cols: [["ridge", "2026-12-01"], ["ridge", "2026-12-15"]] },
    { id: "nearby", title: "Nearby site, same date", sub: "Ridge top vs a plain 20 km away", cols: [["ridge", "2026-12-01"], ["polar_mid", "2026-12-01"]] },
  ];
  const S = {
    view: "scenario",
    q: { site: "chandrayaan3", start: "2026-12-01", days: 30 },
    res: null, err: null, loading: false, idx: 0, timer: null,
    cmp: { preset: "slip", cols: PRESETS[0].cols.map(([site, start]) => ({ site, start, days: 30 })), res: [] },
  };

  /* ── chart helpers ── */
  let uid = 0;
  const visAt = (wins, iso) => { const t = T(iso); return wins.some((w) => t >= T(w.start) && (t < T(w.end) || (w.open_end && t <= T(w.end)))); };
  function niceStep(span) { for (const s of [0.5, 1, 2, 5, 10, 20]) if (span / s <= 6) return s; return 30; }
  function dayStep(pxPerDay) { for (const k of [1, 2, 5, 7, 10, 15]) if (k * pxPerDay >= 62) return k; return 30; }
  function seriesRange(list) {
    let lo = Infinity, hi = -Infinity;
    for (const d of list) for (const key of ["sun_el", "earth_el", "terrain_under_sun", "terrain_under_earth"]) for (const v of d.series[key]) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const step = niceStep(hi - lo);
    return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
  }
  const pathOf = (xs, ys) => xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join("");

  function timeAxis(d, W, padL, padR) {
    const t0 = T(d.scenario.start), t1 = T(d.scenario.stop);
    const x = (t) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
    const days = (t1 - t0) / 864e5;
    const k = dayStep((W - padL - padR) / days);
    const ticks = [];
    for (let i = 0; i <= days + 1e-9; i += k) { const t = t0 + i * 864e5; const dt = new Date(t); ticks.push({ x: x(t), label: `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}` }); }
    return { x, t0, t1, ticks };
  }

  /** Timeline: elevation vs time, terrain under each body, Sun+Earth windows shaded. */
  function timelineSVG(d, { W, H, yr, idx, mini }) {
    const id = ++uid, s = d.series;
    const padL = mini ? 38 : 56, padR = 10, padT = 8, padB = mini ? 18 : 24;
    const ax = timeAxis(d, W, padL, padR);
    const y = (v) => padT + ((yr[1] - v) / (yr[1] - yr[0])) * (H - padT - padB);
    const xs = s.t.map((t) => ax.x(T(t)));
    const clip = (wins, name) => `<clipPath id="${name}${id}">${wins.map((w) => `<rect x="${ax.x(T(w.start))}" y="0" width="${Math.max(1, ax.x(T(w.end)) - ax.x(T(w.start)))}" height="${H}"/>`).join("")}</clipPath>`;
    const step = niceStep(yr[1] - yr[0]);
    let grid = "";
    for (let v = yr[0]; v <= yr[1] + 1e-9; v += step) grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(1)}°</text>`;
    const xt = ax.ticks.map((tk) => `<line x1="${tk.x}" x2="${tk.x}" y1="${H - padB}" y2="${H - padB + 4}" stroke="var(--muted)"/><text x="${tk.x}" y="${H - padB + (mini ? 14 : 17)}" text-anchor="middle">${tk.label}</text>`).join("");
    const bands = d.windows.both.map((w) => `<rect x="${ax.x(T(w.start))}" y="${padT}" width="${Math.max(1, ax.x(T(w.end)) - ax.x(T(w.start)))}" height="${H - padT - padB}" fill="var(--both-fill)"/>`).join("");
    const sunP = pathOf(xs, s.sun_el.map(y)), earthP = pathOf(xs, s.earth_el.map(y));
    let scrub = "";
    if (idx != null) {
      const sx = xs[idx];
      scrub = `<line x1="${sx}" x2="${sx}" y1="${padT}" y2="${H - padB}" stroke="var(--ink)" stroke-width="1.2"/>
        <circle cx="${sx}" cy="${y(s.sun_el[idx])}" r="4.5" fill="var(--sun)" stroke="var(--surface)" stroke-width="1.5"/>
        <circle cx="${sx}" cy="${y(s.earth_el[idx])}" r="4.5" fill="var(--earth)" stroke="var(--surface)" stroke-width="1.5"/>`;
    }
    const zero = yr[0] < 0 && yr[1] > 0 ? `<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-dasharray="4 4"/>${mini ? "" : `<text x="${W - padR - 4}" y="${y(0) - 5}" text-anchor="end">flat horizon 0°</text>`}` : "";
    const startMark = mini ? "" : `<line x1="${padL}" x2="${padL}" y1="${padT}" y2="${H - padB}" stroke="var(--ink)" stroke-width="2"/><text class="lab" x="${padL + 5}" y="${padT + 11}" fill="var(--ink)" style="fill:var(--ink)">start</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sun and Earth elevation over time, with the terrain height under each">
      <defs>${clip(d.windows.sun, "cs")}${clip(d.windows.earth, "ce")}</defs>
      ${bands}${grid}${zero}
      <path d="${pathOf(xs, s.terrain_under_sun.map(y))}" fill="none" stroke="var(--terrain)" stroke-width="1.6"/>
      <path d="${pathOf(xs, s.terrain_under_earth.map(y))}" fill="none" stroke="var(--terrain)" stroke-width="1.6" stroke-dasharray="5 3"/>
      <path d="${sunP}" fill="none" stroke="var(--sun)" stroke-width="1.4" opacity=".35"/>
      <path d="${earthP}" fill="none" stroke="var(--earth)" stroke-width="1.4" opacity=".35"/>
      <path d="${sunP}" fill="none" stroke="var(--sun)" stroke-width="${mini ? 2 : 2.6}" clip-path="url(#cs${id})"/>
      <path d="${earthP}" fill="none" stroke="var(--earth)" stroke-width="${mini ? 2 : 2.6}" clip-path="url(#ce${id})"/>
      ${startMark}${xt}${scrub}
      <rect class="hit" x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="transparent"/>
    </svg>`;
  }

  /** Window strip: one row per body; bars are backend windows; open edges get an arrow. */
  function ganttSVG(d, { W, mini, idx }) {
    const padL = mini ? 38 : 56, padR = 10, row = mini ? 12 : 16, gap = mini ? 5 : 7;
    const ax = timeAxis(d, W, padL, padR);
    const rows = [["Sun", "sun", "var(--sun)"], ["Earth", "earth", "var(--earth)"], ["Both", "both", "var(--both)"]];
    const H = rows.length * (row + gap);
    const body = rows.map(([label, key, color], r) => {
      const yy = r * (row + gap);
      const bars = d.windows[key].map((w) => {
        const x0 = ax.x(T(w.start)), x1 = ax.x(T(w.end)), wd = Math.max(1.5, x1 - x0);
        const edge = (w.open_start ? `<text x="${x0 + 3}" y="${yy + row - 3}" style="fill:var(--surface);font-size:${mini ? 9 : 11}px">◂</text>` : "") + (w.open_end ? `<text x="${x1 - 3}" y="${yy + row - 3}" text-anchor="end" style="fill:var(--surface);font-size:${mini ? 9 : 11}px">▸</text>` : "");
        const t = `${label}: ${fmtDT(w.start)} → ${fmtDT(w.end)} UTC, ${n1(w.hours)} h${w.open_start ? ", continues before the start" : ""}${w.open_end ? ", continues after the end" : ""}`;
        return `<g><title>${esc(t)}</title><rect x="${x0}" y="${yy}" width="${wd}" height="${row}" rx="2" fill="${color}"/>${edge}</g>`;
      }).join("");
      return `<rect x="${padL}" y="${yy}" width="${W - padL - padR}" height="${row}" fill="var(--sunken)" rx="2"/>${bars}<text x="${padL - 6}" y="${yy + row - (mini ? 2 : 4)}" text-anchor="end" class="lab" style="fill:${color}">${label}</text>`;
    }).join("");
    const scrub = idx != null ? `<line x1="${ax.x(T(d.series.t[idx]))}" x2="${ax.x(T(d.series.t[idx]))}" y1="0" y2="${H - gap}" stroke="var(--ink)" stroke-width="1.2"/>` : "";
    return `<svg viewBox="0 0 ${W} ${H - gap}" role="img" aria-label="Visibility windows for Sun, Earth and both">${body}${scrub}</svg>`;
  }

  /** Sky view: compass panorama with the terrain silhouette and the Sun and Earth paths. */
  function skySVG(d, { W, H, idx }) {
    const s = d.series, hz = d.horizon.elev_deg, step = d.horizon.az_step_deg;
    const padL = 40, padR = 10, padT = 10, padB = 26;
    const all = [...hz, ...s.sun_el, ...s.earth_el];
    let lo = Math.max(Math.min(...all), -12), hi = Math.max(...all);
    const ys = niceStep(hi - lo); lo = Math.floor(lo / ys) * ys - (lo % ys === 0 ? ys / 2 : 0); hi = Math.ceil(hi / ys) * ys;
    const x = (az) => padL + (az / 360) * (W - padL - padR);
    const y = (v) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
    const bottom = H - padB, id = ++uid;
    let grid = "";
    for (let v = Math.ceil(lo / ys) * ys; v <= hi + 1e-9; v += ys) grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(1)}°</text>`;
    const card = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"].map((c, i) => `<line x1="${x(i * 45)}" x2="${x(i * 45)}" y1="${padT}" y2="${bottom}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${x(i * 45)}" y="${bottom + 17}" text-anchor="middle" class="lab">${c}</text>`).join("");
    const terr = `M${x(0)} ${bottom}` + hz.map((e, k) => `L${x(k * step).toFixed(1)} ${y(e).toFixed(1)}`).join("") + `L${x(360)} ${y(hz[0])}L${x(360)} ${bottom}Z`;
    const ridge = hz.map((e, k) => `${k ? "L" : "M"}${x(k * step).toFixed(1)} ${y(e).toFixed(1)}`).join("") + `L${x(360)} ${y(hz[0])}`;
    const track = (az, el) => { let p = "", prev = null; az.forEach((a, i) => { p += `${prev == null || Math.abs(a - prev) > 180 ? "M" : "L"}${x(a).toFixed(1)} ${y(el[i]).toFixed(1)}`; prev = a; }); return p; };
    const body = (key, color, label, r) => {
      const a = s[`${key}_az`][idx], e = s[`${key}_el`][idx], up = visAt(d.windows[key], s.t[idx]);
      const cx = x(a), cy = Math.min(Math.max(y(e), padT + r), bottom - r);
      const right = cx > W - 140;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${up ? color : "var(--surface)"}" stroke="${color}" stroke-width="2" ${up ? "" : 'stroke-dasharray="3 2"'}/>
        <text x="${cx + (right ? -r - 6 : r + 6)}" y="${cy + 4}" text-anchor="${right ? "end" : "start"}" class="lab" style="fill:${color}">${label} ${e.toFixed(1)}° ${up ? "visible" : "hidden"}</text>`;
    };
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sky view: terrain skyline by compass direction, with the paths of the Sun and Earth">
      <defs><clipPath id="sk${id}"><rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${bottom - padT}"/></clipPath></defs>
      ${grid}${card}
      <g clip-path="url(#sk${id})">
        <path d="${track(s.sun_az, s.sun_el)}" fill="none" stroke="var(--sun)" stroke-width="1.6" opacity=".55"/>
        <path d="${track(s.earth_az, s.earth_el)}" fill="none" stroke="var(--earth)" stroke-width="1.6" opacity=".7"/>
        <path d="${terr}" fill="var(--terrain-fill)" opacity=".88"/>
        <path d="${ridge}" fill="none" stroke="var(--terrain)" stroke-width="1.5"/>
      </g>
      ${idx != null ? body("sun", "var(--sun)", "Sun", 8) + body("earth", "var(--earth)", "Earth", 6.5) : ""}
    </svg>`;
  }

  /* ── site map (south polar stereographic) ── */
  function mapSVG(selected) {
    const C = 130, R = 112, I = { cx: 222, cy: 228, r: 34 };
    const rad = (lat) => (R * Math.tan(((90 + lat) / 2) * Math.PI / 180)) / Math.tan((15 * Math.PI) / 180);
    const irad = (lat) => (I.r * Math.tan(((90 + lat) / 2) * Math.PI / 180)) / Math.tan((1 * Math.PI) / 180);
    const pt = (lat, lon, r, cx, cy) => [cx + r * Math.sin((lon * Math.PI) / 180), cy - r * Math.cos((lon * Math.PI) / 180)];
    const rings = [-60, -70, -80].map((l) => `<circle cx="${C}" cy="${C}" r="${rad(l)}" fill="none" stroke="var(--line)"/><text x="${C + 3}" y="${C - rad(l) + 11}">${-l}°S</text>`).join("");
    const spokes = [0, 90, 180, 270].map((lo) => { const [a, b] = pt(0, lo, R, C, C); const [lx, ly] = pt(0, lo, R + 10, C, C); return `<line x1="${C}" y1="${C}" x2="${a}" y2="${b}" stroke="var(--line)"/><text x="${lx}" y="${ly + 3}" text-anchor="middle">${lo}°</text>`; }).join("");
    const pin = (s, x, y) => {
      const sel = s.id === selected;
      return `<g class="mpin" data-site="${s.id}" style="cursor:pointer"><title>${esc(s.name)}</title>${sel ? `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="var(--ink)" stroke-width="1.5"/>` : ""}<circle cx="${x}" cy="${y}" r="4" fill="${s.kind === "landed" ? "var(--ink)" : "var(--surface)"}" stroke="var(--ink)" stroke-width="2"/></g>`;
    };
    let pins = "", ipins = "";
    for (const s of SITES) {
      if (s.lat > -60) continue;
      if (s.lat < -88) { const [x, y] = pt(s.lat, s.lon_e, irad(s.lat), I.cx, I.cy); ipins += pin(s, x, y); }
      else { const [x, y] = pt(s.lat, s.lon_e, rad(s.lat), C, C); pins += pin(s, x, y); }
    }
    const zr = rad(-88);
    return `<svg viewBox="0 0 260 266" role="img" aria-label="Map of the lunar south pole region with site pins">
      <circle cx="${C}" cy="${C}" r="${R}" fill="var(--sunken)" stroke="var(--line)"/>${rings}${spokes}
      <circle cx="${C}" cy="${C}" r="${zr}" fill="none" stroke="var(--muted)" stroke-dasharray="2 2"/>
      <line x1="${C + zr * 0.7}" y1="${C + zr * 0.7}" x2="${I.cx - I.r * 0.7}" y2="${I.cy - I.r * 0.7}" stroke="var(--muted)" stroke-dasharray="2 2"/>
      ${pins}
      <circle cx="${I.cx}" cy="${I.cy}" r="${I.r}" fill="var(--surface)" stroke="var(--muted)"/>
      <circle cx="${I.cx}" cy="${I.cy}" r="1.5" fill="var(--muted)"/>
      <text x="${I.cx - I.r}" y="${I.cy - I.r - 4}">pole, 88–90°S</text>
      ${ipins}
    </svg>`;
  }

  /* ── scenario view ── */
  function renderRail() {
    $("#map").innerHTML = mapSVG(S.q.site);
    $("#sitelist").innerHTML = SITES.map((s) => `<button type="button" class="siteitem" data-site="${s.id}" aria-pressed="${s.id === S.q.site}">
        <span class="pin ${s.kind}"></span><b>${esc(s.name)}</b>
        <span class="meta">${latText(s.lat)} · ${lonText(s.lon_e)}${s.lat > -60 ? " · off this map" : ""}</span>
        <span class="meta">${s.kind === "landed" ? "Landed mission" : "Candidate"}${s.terrain ? "" : " · no terrain data"}${s.verified ? "" : " · unverified"}</span>
      </button>`).join("");
    $("#start").value = S.q.start;
    $("#days").value = S.q.days;
    $("#datechips").innerHTML = datesFor(S.q.site).map((d) => `<button type="button" class="chip" data-date="${d}" aria-pressed="${d === S.q.start}">${fmtDate(d + "T00:00Z")}</button>`).join("");
  }

  async function runScenario() {
    S.loading = true; stopPlay(); renderResults();
    const env = await API.scenario(S.q);
    S.loading = false;
    if (env.ok) { S.res = env.data; S.err = null; S.idx = 0; } else { S.err = env.error; }
    renderResults();
  }

  const verdictIcon = (level, size = 34) => ({
    good: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    marginal: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5L22 20.5H2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5.5M12 17.2v.3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    poor: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  }[level]);

  /** Card text for one body at the start: up/hidden and time to the next change. */
  function bodyNow(now, key) {
    const vis = now[`${key}_visible`];
    const h = vis ? now[`hours_to_${key}set`] : now[`hours_to_${key}rise`];
    const word = key === "sun" ? (vis ? "sets" : "rises") : (vis ? "sets" : "rises");
    if (vis && h == null) return { up: true, big: "Up all period", small: "never sets in this range" };
    if (!vis && h == null) return { up: false, big: "Hidden all period", small: "never rises in this range" };
    const p = durParts(h);
    return { up: vis, big: `${word === "sets" ? "Sets" : "Rises"} in ${p.big}`, small: p.small };
  }

  function cardsHTML(d) {
    const m = d.metrics, now = d.now, sun = bodyNow(now, "sun"), earth = bodyNow(now, "earth");
    const noEarth = m.earth_up_percent === 0;
    const longest = d.windows.both.reduce((a, w) => (!a || w.hours > a.hours ? w : a), null);
    return `<div class="cards">
      <article class="card sun">
        <div class="k"><i style="background:var(--sun)"></i>Sun at start ${tip(TIPS.clearance)}</div>
        <span class="state ${sun.up ? "up" : "down"}" style="color:var(--sun-ink)">${sun.up ? "Up" : "Hidden"}</span>
        <div class="v">${sun.big} ${sun.small ? `<small>${sun.small}</small>` : ""}</div>
        <div class="s num">el ${n1(now.sun_el_deg)}° · clearance ${sign(now.sun_clearance_deg)}°</div>
      </article>
      <article class="card earth">
        <div class="k"><i style="background:var(--earth)"></i>Earth at start ${tip(TIPS.earth)}</div>
        <span class="state ${earth.up ? "up" : "down"}" style="color:var(--earth-ink)">${earth.up ? "Up" : "Hidden"}</span>
        <div class="v">${noEarth ? "No direct contact" : `${earth.big} ${earth.small ? `<small>${earth.small}</small>` : ""}`}</div>
        <div class="s num">${noEarth ? "Needs a relay satellite" : `el ${n1(now.earth_el_deg)}° · in view ${n1(m.earth_up_percent)}% of the period`}</div>
      </article>
      <article class="card">
        <div class="k"><i style="background:var(--sun)"></i>Sunlight over the period ${tip(TIPS.sunlit)}</div>
        <div class="v num">${n1(m.sun_up_hours)} h <small>${n1(m.sun_up_percent)}%</small></div>
        <div class="meter"><span style="width:${m.sun_up_percent}%;background:var(--sun)"></span></div>
        <div class="s">${d.windows.sun.length} window${d.windows.sun.length === 1 ? "" : "s"} · Sun peaks ${n1(m.max_sun_clearance_deg)}° above the skyline</div>
      </article>
      <article class="card">
        <div class="k"><i style="background:var(--both)"></i>Sun and Earth together ${tip(TIPS.both)}</div>
        <div class="v num">${n1(m.both_up_hours)} h <small>${n1(m.both_up_percent)}%</small></div>
        <div class="meter"><span style="width:${m.both_up_percent}%;background:var(--both)"></span></div>
        <div class="s">${longest ? `Longest unbroken: <b class="num">${durText(m.longest_both_window_hours)}</b>, from ${fmtDT(longest.start)}` : "Never together in this range"}</div>
      </article>
    </div>`;
  }

  function briefHTML(d) {
    const m = d.metrics, s = d.scenario.site, sun = bodyNow(d.now, "sun");
    const parts = [];
    parts.push(`<b>${esc(s.name)}</b>, ${fmtDate(d.scenario.start)} to ${fmtDate(d.scenario.stop)}: <b>${LEVEL_WORD[d.verdict.level].toLowerCase()}</b>.`);
    parts.push(sun.up ? `The Sun is up at the start${d.now.hours_to_sunset == null ? " and stays up all period" : ` and sets in ${durText(d.now.hours_to_sunset)}`}.`
      : d.now.hours_to_sunrise == null ? "The Sun stays behind the terrain for the whole period." : `The Sun is behind the terrain at the start and rises in ${durText(d.now.hours_to_sunrise)}.`);
    parts.push(`Sunlight reaches the site for ${n1(m.sun_up_hours)} h (${n1(m.sun_up_percent)}%) in ${d.windows.sun.length} window${d.windows.sun.length === 1 ? "" : "s"}.`);
    parts.push(m.earth_up_percent === 0 ? "Earth never clears the skyline, so the lander would need a relay satellite to talk to Earth." :
      m.earth_up_percent === 100 ? "Earth stays above the skyline the whole time, so direct radio contact is always possible." :
      `Earth is above the skyline ${n1(m.earth_up_percent)}% of the time.`);
    if (m.both_up_hours > 0) parts.push(`Power and direct contact overlap for ${n1(m.both_up_hours)} h; the longest unbroken stretch is ${durText(m.longest_both_window_hours)}.`);
    return `<p class="brief">${parts.join(" ")}</p>`;
  }

  function windowsTable(d) {
    const rows = ["both", "sun", "earth"].flatMap((k) => d.windows[k].map((w) => ({ k, ...w }))).sort((a, b) => T(a.start) - T(b.start) || a.k.localeCompare(b.k));
    const name = { sun: ["Sun", "var(--sun-ink)"], earth: ["Earth", "var(--earth-ink)"], both: ["Sun + Earth", "var(--both)"] };
    return `<div class="tablewrap"><table><thead><tr><th>Window</th><th>Starts (UTC)</th><th>Ends (UTC)</th><th class="num">Length</th><th>Range edge ${tip(TIPS.open)}</th></tr></thead><tbody>
      ${rows.map((w) => `<tr><td style="color:${name[w.k][1]};font-weight:600">${name[w.k][0]}</td><td class="num">${fmtDT(w.start)}</td><td class="num">${fmtDT(w.end)}</td><td class="num">${durText(w.hours)}</td>
        <td class="edge">${[w.open_start ? "◂ continues before" : "", w.open_end ? "continues after ▸" : ""].filter(Boolean).join(" · ") || "–"}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function renderResults() {
    const el = $("#results");
    const d = S.res;
    const status = S.loading ? `<div class="status"><span class="spinner"></span>Getting Sun and Earth positions and the skyline for this scenario…</div>` : "";
    const error = S.err ? `<div class="alert error" role="alert">${verdictIcon("poor", 22)}<p><b>Could not load this scenario.</b> ${esc(S.err.message)}${d ? " The last result stays below." : ""} <span class="tag src">${esc(S.err.code)}</span></p></div>` : "";
    if (!d) { el.innerHTML = status + error; return; }
    const site = d.scenario.site;
    el.classList.toggle("loading", S.loading);
    el.innerHTML = `${status}${error}
      <div class="sitehead">
        <div>
          <div class="eyebrow">${site.kind === "landed" ? "Landed mission site" : "Candidate site"}</div>
          <h1>${esc(site.name)}</h1>
          <div class="coords"><span>${latText(site.lat)}, ${lonText(site.lon_e)}</span>
            ${site.verified ? "" : `<span class="tag warn" title="The team has not checked this coordinate against its source yet">Unverified coordinates</span>`}
            ${site.terrain ? `<span class="tag">Terrain: LOLA</span>` : `<span class="tag warn">Smooth Moon</span>`}</div>
        </div>
        <div class="coords"><span>${fmtDT(d.scenario.start)} → ${fmtDT(d.scenario.stop)} UTC</span><span class="tag">${Math.round((T(d.scenario.stop) - T(d.scenario.start)) / 864e5)} days</span></div>
      </div>
      ${site.terrain ? "" : `<div class="alert terrain" role="note">${verdictIcon("marginal", 22)}<p><b>No terrain data for this site.</b> Results use a smooth Moon with no mountains. Near the pole this can be badly wrong: without terrain we measured errors of up to 62 percentage points.</p></div>`}
      <section class="verdict ${d.verdict.level}" aria-label="Verdict">
        <div class="word">${verdictIcon(d.verdict.level)}${LEVEL_WORD[d.verdict.level]}</div>
        <ul>${d.verdict.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}<li class="rule">Provisional rule from the backend ${tip(d.verdict.rules)}</li></ul>
        <button class="btn ghost" type="button" data-act="slip">What if we slip 2 weeks?</button>
      </section>
      ${d.metrics.earth_up_percent === 0 ? `<div class="alert relay" role="note">${verdictIcon("poor", 22)}<p><b>No direct contact with Earth.</b> Earth stays behind the terrain for the whole period. The lander needs a relay satellite.</p></div>` : ""}
      ${cardsHTML(d)}
      <section class="chartpanel" aria-label="Timeline">
        <header><h2>Timeline</h2>
          <div class="legend"><span><i style="border-color:var(--sun)"></i>Sun</span><span><i style="border-color:var(--earth)"></i>Earth</span>
            <span><i style="border-color:var(--terrain)"></i>Terrain under the Sun</span><span><i class="dash" style="border-color:var(--terrain)"></i>Terrain under Earth</span>
            <span><i class="box"></i>Sun + Earth both up</span><span>Faded line = hidden</span></div></header>
        <div class="svgbox" id="gantt"></div>
        <div class="svgbox" id="tl"></div>
        <div class="playbar"><button class="btn" type="button" id="play" aria-label="Play through the period">▶ Play</button>
          <input type="range" id="scrub" min="0" max="${d.series.t.length - 1}" value="${S.idx}" aria-label="Time in the period"></div>
        <div class="readout" id="readout"></div>
      </section>
      <div class="two">
        <section class="chartpanel" aria-label="Sky view">
          <header><h2>Sky view ${tip(TIPS.skyline)}</h2><div class="legend"><span><i style="border-color:var(--sun)"></i>Sun path</span><span><i style="border-color:var(--earth)"></i>Earth path</span><span><i style="border-color:var(--terrain);border-top-width:8px"></i>Skyline</span></div></header>
          <div class="svgbox" id="sky"></div>
          <div class="hint">Looking out from the lander, all the way round the compass. Heights are stretched so the low skyline is visible. The time slider moves the Sun and Earth.</div>
        </section>
        <section class="chartpanel" aria-label="Summary in words">
          <header><h2>In plain words</h2><span class="tag">Draft · written only from the numbers on this page</span></header>
          ${briefHTML(d)}
          <div class="eyebrow" style="margin-top:6px">Notes and sources</div>
          <ul class="notes">${d.notes.map((n) => `<li>${esc(n)}</li>`).join("")}
            <li>Ephemeris: ${esc(d.source.ephemeris)} · Terrain: ${esc(d.source.terrain)} · Lander height ${d.source.observer_height_m} m · ${d.scenario.step_min}-minute steps.</li></ul>
        </section>
      </div>
      <section class="chartpanel" aria-label="Visibility windows"><header><h2>Every window</h2><span class="hint">${d.windows.sun.length} Sun · ${d.windows.earth.length} Earth · ${d.windows.both.length} together</span></header>${windowsTable(d)}</section>`;
    drawScenarioCharts();
  }

  function drawScenarioCharts() {
    const d = S.res; if (!d) return;
    const W = Math.max(320, $("#tl").clientWidth || 800);
    const yr = seriesRange([d]);
    $("#gantt").innerHTML = ganttSVG(d, { W, idx: S.idx });
    $("#tl").innerHTML = timelineSVG(d, { W, H: W < 600 ? 230 : 280, yr, idx: S.idx });
    const sw = Math.max(300, $("#sky").clientWidth || 600);
    $("#sky").innerHTML = skySVG(d, { W: sw, H: sw < 500 ? 220 : 260, idx: S.idx });
    renderReadout();
  }

  function renderReadout() {
    const d = S.res, s = d.series, i = S.idx, t = s.t[i];
    const su = visAt(d.windows.sun, t), eu = visAt(d.windows.earth, t), bu = visAt(d.windows.both, t);
    $("#readout").innerHTML = `<b>${fmtDT(t)} UTC</b>
      <span class="sun">Sun ${s.sun_el[i].toFixed(2)}° · skyline ${s.terrain_under_sun[i].toFixed(2)}° · ${su ? "visible" : "hidden"}</span>
      <span class="earth">Earth ${s.earth_el[i].toFixed(2)}° · skyline ${s.terrain_under_earth[i].toFixed(2)}° · ${eu ? "visible" : "hidden"}</span>
      <span class="both">${bu ? "● Both up: power and contact" : "○ Not both up"}</span>`;
    const r = $("#scrub"); if (r) r.value = i;
  }

  function setIdx(i) {
    const d = S.res; if (!d) return;
    S.idx = Math.max(0, Math.min(d.series.t.length - 1, i));
    drawScenarioCharts();
  }
  function stopPlay() { if (S.timer) { clearInterval(S.timer); S.timer = null; const b = $("#play"); if (b) b.textContent = "▶ Play"; } }
  function togglePlay() {
    if (S.timer) return stopPlay();
    const n = S.res.series.t.length;
    if (S.idx >= n - 1) S.idx = 0;
    $("#play").textContent = "❚❚ Pause";
    S.timer = setInterval(() => { if (S.idx >= n - 1) return stopPlay(); setIdx(S.idx + Math.max(1, Math.round(n / 240))); const b = $("#play"); if (b) b.textContent = "❚❚ Pause"; }, 50);
  }

  /* ── compare view ── */
  async function runCompare() {
    S.cmp.res = S.cmp.cols.map(() => null);
    renderCompare();
    const envs = await Promise.all(S.cmp.cols.map((q) => API.scenario(q)));
    S.cmp.res = envs;
    renderCompare();
  }

  function deltaHTML(a, b, unit = "h") {
    if (a == null || b == null) return "";
    const v = +(b - a).toFixed(1);
    const cls = v > 0 ? "better" : v < 0 ? "worse" : "same";
    return `<span class="delta ${cls}">${v === 0 ? "same as A" : `${sign(v)} ${unit} vs A`}</span>`;
  }

  function summaryHTML() {
    const res = S.cmp.res, A = res[0]?.ok ? res[0].data : null;
    if (!A) return "";
    const items = res.slice(1).map((env, i) => {
      const L = LETTERS[i + 1];
      if (!env) return "";
      if (!env.ok) return `<li><span class="letter">${L}</span><span>No result: ${esc(env.error.message)}</span></li>`;
      const B = env.data, ma = A.metrics, mb = B.metrics, out = [];
      const say = (dv, more, less) => (Math.abs(dv) < 0.05 ? null : `<b class="num">${Math.abs(dv).toFixed(1)} h</b> ${dv > 0 ? more : less}`);
      [say(mb.sun_up_hours - ma.sun_up_hours, "more sunlight", "less sunlight"),
       say(mb.earth_up_hours - ma.earth_up_hours, "more Earth contact", "less Earth contact"),
       say(mb.both_up_hours - ma.both_up_hours, "more time with both up", "less time with both up"),
       say(mb.longest_both_window_hours - ma.longest_both_window_hours, "longer best window", "shorter best window")].forEach((x) => x && out.push(x));
      const vchange = B.verdict.level !== A.verdict.level ? ` Verdict changes from <b>${LEVEL_WORD[A.verdict.level]}</b> to <b>${LEVEL_WORD[B.verdict.level]}</b>.` : ` Verdict stays <b>${LEVEL_WORD[B.verdict.level]}</b>.`;
      const relay = mb.earth_up_percent === 0 && ma.earth_up_percent > 0 ? " Earth is never in view: needs a relay satellite." : "";
      return `<li><span class="letter">${L}</span><span>${out.length ? `Compared with A: ${out.join(", ")}.` : "Same numbers as A."}${vchange}${relay}</span></li>`;
    }).join("");
    return `<section class="panel" aria-label="What changes"><div class="eyebrow" style="margin-bottom:8px">What changes</div><ul class="summary">${items}</ul></section>`;
  }

  function colHTML(q, env, i, yr) {
    const L = LETTERS[i], A = S.cmp.res[0]?.ok ? S.cmp.res[0].data.metrics : null;
    const siteOpts = SITES.map((s) => `<option value="${s.id}" ${s.id === q.site ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const dateOpts = ALL_DATES.map((dd) => `<option value="${dd}" ${dd === q.start ? "selected" : ""}>${fmtDate(dd + "T00:00Z")}${datesFor(q.site).includes(dd) ? "" : " (not computed)"}</option>`).join("");
    const head = `<div class="colhead">
        <div class="row"><span class="letter">${L}</span>${i === 0 ? `<span class="hint">Baseline</span>` : ""}<span style="flex:1"></span>
          ${S.cmp.cols.length > 2 ? `<button class="btn ghost" type="button" data-rm="${i}" aria-label="Remove scenario ${L}">Remove</button>` : ""}</div>
        <label class="hint" for="cs${i}">Site</label><select id="cs${i}" data-col="${i}" data-f="site">${siteOpts}</select>
        <label class="hint" for="cd${i}">Start (00:00 UTC), 30 days</label><select id="cd${i}" data-col="${i}" data-f="start">${dateOpts}</select>
      </div>`;
    if (!env) return `<article class="col">${head}<div class="status"><span class="spinner"></span>Loading…</div></article>`;
    if (!env.ok) return `<article class="col">${head}<div><div class="alert error">${verdictIcon("poor", 20)}<p>${esc(env.error.message)}</p></div></div></article>`;
    const d = env.data, m = d.metrics, sun = bodyNow(d.now, "sun");
    const row = (label, val, a, b, unit) => `<div class="mrow"><span class="lbl">${label}</span><span class="val">${val}</span>${i > 0 && A ? deltaHTML(a, b, unit) : ""}</div>`;
    return `<article class="col">${head}
      <div class="miniverdict ${d.verdict.level}">${verdictIcon(d.verdict.level, 20)}${LEVEL_WORD[d.verdict.level]}</div>
      ${d.scenario.site.terrain ? "" : `<div><span class="tag warn">No terrain data: smooth Moon</span></div>`}
      <div class="mrows">
        ${row("Sun at start", `${sun.up ? "Up" : "Hidden"} · ${sun.big.replace(/^(Sets|Rises) in /, (x) => x.toLowerCase())}`, null, null)}
        ${row("Sunlight", `${n1(m.sun_up_hours)} h · ${n1(m.sun_up_percent)}%`, A?.sun_up_hours, m.sun_up_hours)}
        ${row("Earth in view", m.earth_up_percent === 0 ? "Never: relay needed" : `${n1(m.earth_up_hours)} h · ${n1(m.earth_up_percent)}%`, A?.earth_up_hours, m.earth_up_hours)}
        ${row("Sun + Earth together", `${n1(m.both_up_hours)} h · ${n1(m.both_up_percent)}%`, A?.both_up_hours, m.both_up_hours)}
        ${row("Longest Sun + Earth window", durText(m.longest_both_window_hours), A?.longest_both_window_hours, m.longest_both_window_hours)}
      </div>
      <div class="svgbox" data-mini="${i}"></div>
      <div class="quick">
        <button class="btn ghost" type="button" data-shift="${i}">Same site, +14 days</button>
        <button class="btn ghost" type="button" data-nearby="${i}">Nearby site, same date</button>
        <button class="btn ghost" type="button" data-open="${i}">Open in detail →</button>
      </div>
    </article>`;
  }

  function matrixHTML() {
    const cell = (s, dd) => {
      const env = DATA.scenarios[`${s.id}|${dd}|30`];
      if (!env) return `<td class="cell"><span class="pill none">not computed</span></td>`;
      const d = env.data;
      return `<td class="cell"><button type="button" class="pill ${d.verdict.level}" data-goto="${s.id}|${dd}" aria-label="Open ${esc(s.name)}, ${fmtDate(dd + "T00:00Z")}">${LEVEL_WORD[d.verdict.level]} · ${n1(d.metrics.both_up_percent)}% both</button></td>`;
    };
    return `<section class="chartpanel" aria-label="All computed runs"><header><h2>Every computed run</h2><span class="hint">30-day runs · share of time with Sun and Earth both up · click to open</span></header>
      <div class="tablewrap"><table class="matrix"><thead><tr><th>Site</th>${ALL_DATES.map((dd) => `<th style="text-align:center">${fmtDate(dd + "T00:00Z")}</th>`).join("")}</tr></thead>
      <tbody>${SITES.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="hint num">${latText(s.lat)} · ${lonText(s.lon_e)}</div></td>${ALL_DATES.map((dd) => cell(s, dd)).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderCompare() {
    const el = $("#view-compare");
    const okData = S.cmp.res.filter((e) => e && e.ok).map((e) => e.data);
    const yr = okData.length ? seriesRange(okData) : [0, 1];
    el.innerHTML = `
      <div style="display:grid;gap:6px"><h2>Compare scenarios</h2>
        <p class="hint" style="margin:0;max-width:70ch;font-size:14px">Line up 2 or 3 site-and-date choices. Every chart uses the same scale, so taller really means higher. Start from a common question:</p></div>
      <div class="presets">${PRESETS.map((p) => `<button type="button" class="preset" data-preset="${p.id}" aria-pressed="${S.cmp.preset === p.id}"><b>${p.title}</b><span>${p.sub}</span></button>`).join("")}</div>
      ${summaryHTML()}
      <div class="cmpgrid" style="--n:${Math.min(3, S.cmp.cols.length + (S.cmp.cols.length < 3 ? 1 : 0))}">
        ${S.cmp.cols.map((q, i) => colHTML(q, S.cmp.res[i], i, yr)).join("")}
        ${S.cmp.cols.length < 3 ? `<button type="button" class="addcol" data-add>+ Add scenario C</button>` : ""}
      </div>
      <div class="legend"><span><i style="border-color:var(--sun)"></i>Sun</span><span><i style="border-color:var(--earth)"></i>Earth</span><span><i style="border-color:var(--terrain)"></i>Terrain under each</span><span><i class="box"></i>Both up</span><span>Shared scale: ${yr[0]}° to ${yr[1]}°</span></div>
      ${matrixHTML()}`;
    el.querySelectorAll("[data-mini]").forEach((box) => {
      const env = S.cmp.res[+box.dataset.mini]; if (!env?.ok) return;
      const W = Math.max(260, box.clientWidth || 360);
      box.innerHTML = ganttSVG(env.data, { W, mini: true }) + timelineSVG(env.data, { W, H: 150, yr, mini: true });
    });
  }

  function nearbySite(id, start) {
    const order = SITES.map((s) => s.id);
    for (let k = 1; k < order.length; k++) {
      const c = order[(order.indexOf(id) + k) % order.length];
      if (DATA.scenarios[`${c}|${start}|30`] && siteById(c).terrain) return c;
    }
    return id;
  }
  const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00Z") + n * 864e5).toISOString().slice(0, 10);

  /* ── about view ── */
  function renderAbout() {
    const sample = DATA.scenarios["ridge|2026-12-01|30"].data;
    $("#view-about").innerHTML = `
      <div class="prose"><h2 style="font-size:28px">About the data</h2>
        <p>Sun and Earth positions come from <b>NASA JPL Horizons</b> (DE441 ephemeris). The skyline around each site comes from <b>NASA LRO LOLA</b> elevation maps (240 m and 120 m pixels). A body counts as visible when the top edge of its disc is above the real skyline in its direction.</p></div>
      <div class="cards">
        <article class="card"><div class="k">Horizons visibility flags</div><div class="v num">0 <small>mismatches</small></div><div class="s">in 8,638 rows: our parsing matches Horizons' own flags exactly.</div></article>
        <article class="card"><div class="k">Against NASA illumination maps</div><div class="v num">6 of 8 <small>points</small></div><div class="s">within 2.4 percentage points near the pole, including permanent shadow and blocked Earth.</div></article>
        <article class="card"><div class="k">Ridge tops</div><div class="v num">+2, +12 <small>pts</small></div><div class="s">inside NASA's own pixel-to-pixel spread: one 120 m pixel moves a ridge by up to 40 points.</div></article>
        <article class="card"><div class="k">Without terrain</div><div class="v num" style="color:var(--poor)">62 <small>pts error</small></div><div class="s">A smooth Moon gives 55% sunlight to a crater floor that never sees the Sun.</div></article>
      </div>
      <div class="two">
        <section class="panel prose"><div class="eyebrow">Limits</div>
          <p>Terrain pixels are 120–240 m, so small rocks and slopes near the lander are smoothed out.</p>
          <p>The lander's eye height is fixed at 2 m. On ridges, height changes sunlight by up to 3 points.</p>
          <p>"Earth visible" means line of sight only, not a full radio-link analysis.</p>
          <p>Verdict thresholds are provisional until the team fixes the metric definitions.</p>
          <p>Battery charging and energy are not shown: they need lander panel and battery specs we don't have.</p></section>
        <section class="panel prose"><div class="eyebrow">Where each number comes from</div>
          <div class="tablewrap"><table><thead><tr><th>On screen</th><th>API field</th></tr></thead><tbody>
            <tr><td>Verdict banner</td><td class="mono">verdict.level, reasons, rules</td></tr>
            <tr><td>Sun / Earth at start</td><td class="mono">now.*_visible, hours_to_*, sun_clearance_deg</td></tr>
            <tr><td>Sunlight, together</td><td class="mono">metrics.*_hours, *_percent</td></tr>
            <tr><td>Window strip, table</td><td class="mono">windows.sun / earth / both</td></tr>
            <tr><td>Timeline</td><td class="mono">series.*_el, terrain_under_*</td></tr>
            <tr><td>Sky view</td><td class="mono">horizon.elev_deg, series.*_az</td></tr>
            <tr><td>Notes</td><td class="mono">notes[], source</td></tr></tbody></table></div></section>
      </div>
      <section class="section"><h2>Words used here</h2><dl class="gloss">
        ${[["Elevation", TIPS.elevation], ["Azimuth", "Compass direction: 0° north, 90° east, 180° south, 270° west."], ["Skyline", "The line where the ground meets the sky, set by the real mountains around the site."], ["Clearance", "How far above the mountains the Sun's top edge is. Below zero means hidden."], ["Earthset / Earthrise", "When Earth goes behind or comes out from the terrain. From the Moon, Earth barely moves, so this mostly happens near the pole."], ["Libration", "The Moon's slight wobble, which makes Earth drift a few degrees up and down in the lunar sky."], ["Lunar day", "About 29.5 Earth days from one sunrise to the next."], ["Permanently shadowed region", "Crater floors near the pole that never see the Sun."], ["Direct-to-Earth (DTE)", "Radio straight to Earth, possible only when Earth is above the skyline."]]
          .map(([t, dd]) => `<div><dt>${t}</dt><dd>${dd}</dd></div>`).join("")}</dl></section>
      <section class="section"><h2>Designed states</h2>
        <p class="hint" style="margin:0">Each case the backend can return, and what the screen does with it.</p>
        <div class="states">
          <div class="panel statecard"><h3>No terrain for this site</h3><div class="alert terrain">${verdictIcon("marginal", 20)}<p><b>No terrain data for this site.</b> Results use a smooth Moon. Near the pole this can be badly wrong.</p></div><span class="hint mono">site.terrain = false</span></div>
          <div class="panel statecard"><h3>Earth never visible</h3><div class="alert relay">${verdictIcon("poor", 20)}<p><b>No direct contact with Earth.</b> The lander needs a relay satellite.</p></div><span class="hint mono">metrics.earth_up_percent = 0</span></div>
          <div class="panel statecard"><h3>Error from the backend</h3><div class="alert error">${verdictIcon("poor", 20)}<p><b>Could not load this scenario.</b> Mission length must be a whole number from 1 to 60 days. The last result stays below. <span class="tag src">bad_request</span></p></div><span class="hint mono">ok = false → error.message</span></div>
          <div class="panel statecard"><h3>Slow custom-coordinate query</h3><div class="status"><span class="spinner"></span>Getting Sun and Earth positions from JPL Horizons… this can take several seconds.</div><span class="hint mono">pending request</span></div>
          <div class="panel statecard"><h3>Window touches the range edge</h3><div class="svgbox" id="edgeDemo"></div><span class="hint mono">open_start / open_end → ◂ ▸</span></div>
          <div class="panel statecard"><h3>Up or hidden all period</h3><div><span class="state up" style="color:var(--sun-ink)">Up</span><div class="card" style="box-shadow:none;margin-top:6px"><div class="v">Up all period <small>never sets in this range</small></div></div></div><span class="hint mono">visible + hours_to_set = null</span></div>
          <div class="panel statecard"><h3>Unverified coordinates</h3><div><span class="tag warn">Unverified coordinates</span></div><span class="hint mono">site.verified = false</span></div>
        </div></section>`;
    const box = $("#edgeDemo");
    box.innerHTML = ganttSVG(sample, { W: Math.max(260, box.clientWidth || 300), mini: true });
  }

  /* ── routing and events ── */
  function show(view) {
    S.view = ["scenario", "compare", "about"].includes(view) ? view : "scenario";
    for (const v of ["scenario", "compare", "about"]) $(`#view-${v}`).hidden = v !== S.view;
    document.querySelectorAll("nav.tabs a").forEach((a) => {
      if (a.dataset.view === S.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (S.view !== "scenario") stopPlay();
    if (S.view === "compare" && !S.cmp.res.length) runCompare();
    else if (S.view === "compare") renderCompare();
    if (S.view === "about") renderAbout();
    if (S.view === "scenario") drawScenarioCharts();
  }

  function selectSite(id) {
    const have = datesFor(id);
    S.q = { ...S.q, site: id, start: have.includes(S.q.start) || !have.length ? S.q.start : have[0] };
    renderRail(); runScenario();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, g.mpin");
    if (!t) return;
    if (t.matches("[data-site]")) return selectSite(t.dataset.site);
    if (t.matches("[data-date]")) { S.q = { ...S.q, start: t.dataset.date }; renderRail(); return runScenario(); }
    if (t.id === "play") return togglePlay();
    if (t.id === "theme") {
      const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem("lsn-theme", document.documentElement.dataset.theme); } catch (_) { /* storage blocked: theme still applies for this visit */ }
      return;
    }
    if (t.id === "toCompare" || t.dataset.act === "slip") {
      const base = { ...S.q };
      const other = t.dataset.act === "slip" ? { ...base, start: addDays(base.start, 14) } : { ...base, site: nearbySite(base.site, base.start) };
      S.cmp = { preset: null, cols: [base, other], res: [] };
      location.hash = "compare"; return;
    }
    if (t.dataset.preset) { const p = PRESETS.find((x) => x.id === t.dataset.preset); S.cmp = { preset: p.id, cols: p.cols.map(([site, start]) => ({ site, start, days: 30 })), res: [] }; return runCompare(); }
    if (t.dataset.rm != null) { const i = +t.dataset.rm; S.cmp = { preset: null, cols: S.cmp.cols.filter((_, k) => k !== i), res: S.cmp.res.filter((_, k) => k !== i) }; return renderCompare(); }
    if (t.matches("[data-add]")) { const last = S.cmp.cols[S.cmp.cols.length - 1]; S.cmp = { preset: null, cols: [...S.cmp.cols, { ...last, site: nearbySite(last.site, last.start) }], res: S.cmp.res }; return refreshCol(S.cmp.cols.length - 1); }
    if (t.dataset.shift != null) { const i = +t.dataset.shift; return updateCol(i, { start: addDays(S.cmp.cols[i].start, 14) }); }
    if (t.dataset.nearby != null) { const i = +t.dataset.nearby; return updateCol(i, { site: nearbySite(S.cmp.cols[i].site, S.cmp.cols[i].start) }); }
    if (t.dataset.open != null) { S.q = { ...S.cmp.cols[+t.dataset.open] }; renderRail(); runScenario(); location.hash = "scenario"; return; }
    if (t.dataset.goto) { const [site, start] = t.dataset.goto.split("|"); S.q = { site, start, days: 30 }; renderRail(); runScenario(); location.hash = "scenario"; }
  });

  function updateCol(i, patch) { S.cmp = { ...S.cmp, preset: null, cols: S.cmp.cols.map((q, k) => (k === i ? { ...q, ...patch } : q)) }; refreshCol(i); }
  async function refreshCol(i) {
    S.cmp.res = S.cmp.cols.map((_, k) => (k === i ? null : S.cmp.res[k] ?? null));
    renderCompare();
    const env = await API.scenario(S.cmp.cols[i]);
    S.cmp.res = S.cmp.res.map((r, k) => (k === i ? env : r));
    renderCompare();
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "start") { S.q = { ...S.q, start: t.value }; renderRail(); return runScenario(); }
    if (t.id === "days") { S.q = { ...S.q, days: Number(t.value) }; return runScenario(); }
    if (t.dataset.col != null) updateCol(+t.dataset.col, { [t.dataset.f]: t.value });
  });
  document.addEventListener("input", (e) => { if (e.target.id === "scrub") { stopPlay(); setIdx(+e.target.value); } });
  document.addEventListener("pointermove", (e) => {
    const svg = e.target.closest("#tl svg"); if (!svg || !S.res || (e.pointerType !== "mouse" && e.buttons === 0)) return;
    const rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, padL = 56, padR = 10;
    const x = ((e.clientX - rect.left) / rect.width) * vb.width;
    const frac = (x - padL) / (vb.width - padL - padR);
    if (frac < 0 || frac > 1) return;
    stopPlay(); setIdx(Math.round(frac * (S.res.series.t.length - 1)));
  });
  document.addEventListener("keydown", (e) => {
    if (S.view !== "scenario" || !S.res || e.target.matches("input, select, textarea")) return;
    if (e.key === "ArrowRight") { setIdx(S.idx + 6); e.preventDefault(); }
    if (e.key === "ArrowLeft") { setIdx(S.idx - 6); e.preventDefault(); }
  });
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => (S.view === "compare" ? renderCompare() : S.view === "about" ? renderAbout() : drawScenarioCharts()), 120); });
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));

  try { const th = localStorage.getItem("lsn-theme"); if (th) document.documentElement.dataset.theme = th; } catch (_) { /* storage blocked: follow system theme */ }
  renderRail();
  show(location.hash.slice(1));
  runScenario();
})();
