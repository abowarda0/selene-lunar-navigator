# Lunar Landing Site Navigator: resource analysis

Prepared 13 Nov 2026 for the backend, data and AI work. Pages were opened with Playwright; raw text and screenshots are in `ref/resources/`.

## 0. The official Resources tab (published 13 Nov 2026, pasted by the team)

**NASA Data & Resources**
| Resource | What NASA says it is for | Data or tool? |
|---|---|---|
| [LROC Quickmap](https://quickmap.lroc.im-ldi.com/) | LRO imagery and topography; explore landing sites; south-pole terrain | Tool (map). Topography visible, no bulk download built for us |
| [Moon Trek](https://trek.nasa.gov/moon/) | 3D terrain; "how terrain affects horizon positions" | Tool (3D). Basemap, layers, terrain view |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | Sun and Earth angles "as seen from any location on the Moon"; "the foundation" for power and comms | **The only computational source listed** |

**Space Agency Partner Resources**
| Resource | Content | Use for us |
|---|---|---|
| [CSA Moon exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/) | Artemis, Gateway and Canadarm3, Canadian utility rover, LEAP programme, infographics, speakers' kit | **No data.** Context and storytelling only, see 2.8 |

What this tells us:
- **Horizons is the official engine source.** NASA calls it "the foundation." The pitch should say clearly that Sun and Earth angles come from Horizons. If we compute locally with SPICE, present it as "the same JPL ephemerides, validated against Horizons."
- **NASA's own descriptions point at terrain.** Quickmap's ("complex topography of south pole regions") and Moon Trek's ("how terrain affects horizon positions") both stress it. The official list has no raw DEM link, but the Details tab names LOLA for "accurate horizon calculations." PGDA and PDS (sections 2.2 to 2.4) are where LOLA data can actually be downloaded.
- **Quickmap and Moon Trek are the tools the challenge calls hard for non-specialists.** They are our "before" picture in the pitch, not our data pipeline.

## 1. What the challenge text itself names (official, from the Details tab)

| Resource | Named for | Our use |
|---|---|---|
| JPL Horizons | Ephemeris, "or pre-computed datasets" | Sun and Earth direction from a lunar site; validation source |
| LOLA topography | "Realistic surface visualizations and accurate horizon calculations" | Terrain horizon per site; 3D surface |
| Quickmap, Moon Trek | Existing tools that are "difficult for non-specialists" | Competitor baseline for the newcomer test; basemap and layers |

The text also asks teams to consider: no atmospheric refraction, terrain and lunar-sphere horizon, Earth libration, steep south-pole terrain.

## 2. Each resource, opened and checked

Sections 2.1, 2.5, 2.6 and 2.8 are official. Sections 2.2 to 2.4 are the LOLA data behind the Details tab's mention of LOLA. Section 2.7 is extra.

### 2.1 JPL Horizons (API doc, manual, web app)
Facts from the docs:
- An observer can be placed at user coordinates: `CENTER='coord@<body>'` with `SITE_COORD` and `COORD_TYPE=GEODETIC` (API doc lines 52-53, 178). For the Moon the body is 301. *Not yet run by us: confirm in the T06 manual query.*
- Quantity 4 gives apparent azimuth and elevation. **Elevation is measured from the plane perpendicular to the local zenith, "not necessarily the visible horizon"** (manual line 300). Horizons has no terrain.
- Refraction is applied for Earth observers only, so lunar output is airless. That is correct for the Moon.
- Rise and set use the upper limb of the Sun or Moon and **one cut-off elevation for all directions** (`ELEV_CUT`, manual lines 2651-2661). A real horizon changes with azimuth, so Horizons rise/set times cannot be used as our sunrise and sunset.
- Rise/transit/set-only mode searches at 1 to 9 minute resolution. `TLIST` accepts up to 10,000 discrete times.

Verdict: good for Sun and Earth directions and for validation. It cannot answer "is the Sun above the real horizon" on its own.

### 2.2 PGDA product 78: high-resolution LOLA topography for south-pole sites
- 5 m/pixel elevation (LDEM), slope, height uncertainty and 100 statistical clones per site. GeoTIFF, south polar stereographic, MOON_ME frame (DE421).
- 27 named sites, including Site01 Connecting ridge, Site04 Shackleton rim, Site07 Peak near Shackleton, Site11 de Gerlache rim, Site23 Malapert massif, Haworth, Shoemaker, Nobile and Amundsen rims.
- Height error about 0.3 to 0.5 m RMS; slope error about 1.5 to 2.5°.
- The page reports that between 2024 and 2026, Site 1 (Connecting ridge) had the most area with average illumination above 70% at 1 m height.

Limit (our inference): each DEM covers a small region around the site. A horizon is set by terrain tens to hundreds of km away, so a coarser regional DEM is needed for the far field.

Verdict: best source for the near field and for the curated south-pole site list. Its site names line up with the Artemis-era candidates.

### 2.3 PGDA product 69: lunar polar illumination (Mazarico et al. 2011)
- Maps of average solar illumination, permanent shadow, average Earth visibility and sky visibility. 60, 120 and 240 m/pixel, polar stereographic, 1737.4 km sphere.
- Averages over an 18.6-year cycle at hourly steps. **Not date-specific.**
- Earth counts as visible if any part of its disc shows, which the page calls slightly optimistic for radio links.
- Formats: IMG, JP2, GeoTIFF and Cloud-Optimised GeoTIFF (added 2025-03-20). COGs can be read without downloading the whole file.

Verdict: two uses. (1) A map layer that shows why site choice matters. (2) **Validation:** our long-run sunlit fraction at a site should be close to this map's value at that pixel. That gives an independent check for the "Validity" judging criterion.

### 2.4 PDS Geosciences: LRO LOLA archive
Entry point for the gridded LDEM products, such as LDEM_80S_80M or LDEM_85S_20M. Use these for the far-field horizon. The site may be down on Thursdays 7:00 to 9:30 pm US Central.

### 2.5 LROC Quickmap
- **It has moved to https://quickmap.lroc.im-ldi.com.** The old ASU address will be retired. Use the new link in the README and pitch.
- It has a built-in **Visibility Analysis** tool. That is the closest existing competitor. Study it in the hour-1 hands-on (T05) and be ready to explain to judges how we differ: date comparison, plain-language verdict, speed.

### 2.6 Moon Trek
A JavaScript map app; Playwright got no readable text from it. Its role is basemap and layers. Check its imagery and tile use terms during T05.

### 2.8 CSA Moon exploration portal (official partner resource)
- Opened with Playwright. It is an information portal with no datasets or APIs.
- Useful pages: Canadian utility rover, the Artemis campaign, Gateway and Canadarm3, "From Apollo to Artemis", and the speakers' kit and infographics (check their use terms before putting them in the video).
- **Best use:** a concrete user story for the pitch. A rover operator needs to know how many hours of Sun and Earth contact remain at a site. That links a partner agency's real programme to our numbers. It also helps the educators-and-public audience.

### 2.7 Not official, from another team's source list (useful)
- NASA Lunar Surface Data Book: region coordinates and descriptions of illumination and Earth-visibility products.
- JPL NAIF SPICE (`spiceypy`): local Sun and Earth geometry for any site and time, with no network or rate limit.

## 3. What this means for the backend

1. **Visibility needs two parts.** Sun or Earth direction (Horizons or SPICE), plus the terrain horizon at that azimuth (LOLA). No single resource gives both for a chosen date.
2. **Horizon profile per site:** from the site, step outward along each azimuth (1° or finer) through the DEM. Keep the highest elevation angle, including lunar curvature. Use 5 m PGDA-78 data near the site and LDEM 80 m or 20 m data far away. Pre-compute once per curated site and save as 360 numbers.
3. **Visible** when the upper limb is above the horizon at that azimuth. Upper limb = centre elevation + angular radius: about 0.27° for the Sun and about 0.95° for Earth.
4. **Validation table:**
   - our engine vs Horizons, for angles;
   - our long-run sunlit and Earth-visible fraction vs the PGDA-69 maps, for the terrain model.
5. **Custom coordinates:** without a DEM horizon, fall back to the smooth-sphere horizon and say so on screen.

## 4. Open questions for the technical mentor
- Does Horizons accept a lunar surface site exactly as above, and which lunar frame does it use?
- What minimum Earth elevation should count as a usable direct-to-Earth link?
- Which DEM resolution and radius are good enough for a horizon at the curated sites?
