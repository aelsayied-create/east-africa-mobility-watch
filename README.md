# East Africa Mobility Watch — Demo

An interactive web map of **displacement × climate hazards** across the eight IGAD member states, built on **real open data** and an end-to-end geospatial workflow: automated data ingestion from public APIs, a Python processing pipeline (vector + raster), a Leaflet web map with an EAHW-style layer catalogue, charts and a guided story, unit tests, Docker packaging and CI/CD to GitHub Pages.

> ✅ **Real data.** Displacement figures come from the IDMC Internal Displacement Updates (preliminary, event-based figures that IDMC later validates), rainfall from CHIRPS v2.0, admin-1 boundaries from geoBoundaries. The window is the last 12 complete months and refreshes monthly. This is a portfolio sample, **not an official ICPAC/IGAD product**.

> 💼 **About my production work.** My real production dashboards for Riyadh Municipality run on Netlify behind password protection, because they belong to my employer. I can demonstrate them live during an interview.

**Live demo:** https://aelsayied-create.github.io/east-africa-mobility-watch/

![screenshot](docs/screenshot.png)

## Features
- **Layer catalogue (EAHW-style):** toggle the displacement choropleth, IDMC event points (size = people, popup with date, location and original source), the **CHIRPS rainfall anomaly** raster (% of the 1991–2020 normal, opacity slider), country and admin-1 outlines, light map or satellite imagery.
- **Country or admin-1 level:** switch between 8 countries and ~120 states / regions; click any unit for its monthly trend by hazard **with rainfall vs normal on a second axis**.
- **Filters:** hazard (flood, drought, conflict, other disasters), month slider with play animation, people or share of region, CSV export of the current view (including rainfall).
- **Insights:** findings computed from the data, a seasonal calendar (country × month), rainfall-vs-displacement chart per country, top-10 admin-1 hotspots, regional trends and hazard mix.
- **Story:** a guided, data-driven narrative (regional picture → conflict as main driver → the top admin-1 hotspot → failed rains and drought in Somalia → Kenya's flood rains → from data to early action). Every number in the text is computed from the current data.
- Light/dark mode, responsive layout, colour-blind-checked palettes, no front-end build step (libraries vendored).

## Architecture
```
scripts/fetch_real_data.py   ingestion (runs in GitHub Actions, monthly):
                             IDMC IDU API -> events CSV; geoBoundaries API -> ADM1 GeoJSON;
                             CHIRPS monthly GeoTIFFs -> cropped 0.1° grids + 1991-2020 normal
data/raw/                    versioned raw inputs written by the fetcher
scripts/build_data.py        processing (offline): validate -> point-in-polygon to admin-1 ->
                             aggregate country/admin-1 x month x hazard -> rainfall % of normal
                             (PNG overlays + zonal means) -> web/data/
tests/                       pytest unit tests (time window, hazard mapping, admin-1 assignment)
web/                         static front end (Leaflet, Chart.js, vanilla JS)
Dockerfile                   multi-stage build: pipeline, then nginx
.github/workflows/           refresh-data.yml (monthly ingestion) · pages.yml (tests, pipeline,
                             Docker build check, GitHub Pages deploy)
```

## Run locally
```bash
pip install -r requirements.txt
python scripts/build_data.py              # uses the committed data/raw/
cd web && python -m http.server 8000      # open http://localhost:8000
# to refresh the raw data yourself: pip install rasterio && python scripts/fetch_real_data.py
```

Or with Docker:
```bash
docker build -t eamw-demo .
docker run -p 8080:80 eamw-demo           # open http://localhost:8080
```

## Method notes and limits
- IDU figures are preliminary and event-based; one record can cover several locations. Each record is placed at IDMC's centroid and assigned to the admin-1 unit containing it (or the nearest unit in the same country within ~50 km). Records under 100 people are counted but not drawn as points.
- Rainfall % of normal = monthly CHIRPS total / 1991–2020 mean for that month. Months with a normal below 20 mm are shown as dry season, because percentages there are not meaningful. Zonal values use the ratio of area means.
- Floods in the Sudd and along the Nile are driven by river flows from upstream, so local rainfall alone does not explain them; a production system would add hydrological forecasts.

## Data sources
- Displacement: [IDMC](https://www.internal-displacement.org/) Internal Displacement Updates (IDU), CC BY-IGO
- Rainfall: [CHIRPS v2.0](https://www.chc.ucsb.edu/data/chirps), UCSB Climate Hazards Center
- Admin-1 boundaries: [geoBoundaries](https://www.geoboundaries.org/) gbOpen
- Country boundaries: [Natural Earth](https://www.naturalearthdata.com/) (public domain)
- Basemaps: Esri World Light Gray Canvas & World Imagery, © OpenStreetMap contributors

## Roadmap
- Serve the layers as OGC services (GeoServer WMS/WFS) or vector tiles from PostGIS
- Add IOM DTM site-level data and population exposure (WorldPop)
- Add rainfall forecasts (ICPAC seasonal outlooks) for anticipatory action triggers

## Author
**Amna Abdein** — GIS Specialist & Geospatial Web Developer
