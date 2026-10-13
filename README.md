# East Africa Mobility Watch — Demo

An interactive web map of **disaster displacement by hazard** (flood, drought, conflict) across the eight IGAD member states, built to show an end-to-end geospatial workflow: a Python data pipeline, a Leaflet web map with charts, Docker packaging and CI/CD deployment to GitHub Pages.

> ⚠️ **Illustrative sample data.** The displacement figures are synthetic, generated with realistic seasonal patterns for demonstration. Replace `data/raw/displacement.csv` with a real export (e.g. IOM DTM or IDMC) to use real figures.

> 💼 **About my production work.** This repo is a public sample. My real production dashboards for Riyadh Municipality run on Netlify behind password protection, because they belong to my employer. I can demonstrate them live during an interview.

**Live demo:** https://aelsayied-create.github.io/east-africa-mobility-watch/

![screenshot](docs/screenshot.png)

## Features
Three views:
- **Explore**: choropleth map of new displacements per country, filtered by hazard, with a monthly time slider (play animation) and a toggle between people and share of the region. Click a country or table row for its monthly trend by hazard. Light map / satellite imagery switch and CSV export.
- **Insights**: auto-generated key findings, a seasonal calendar (country × month heatmap), regional trend lines by hazard, and the hazard mix driving displacement in each country.
- **Story**: a six-step guided story (regional overview → Sudan's flood season → Somalia's Gu and Deyr rains → dry-season drought → year-round conflict → from data to early action). Each step zooms the map, recolours it for that hazard and period, and shows a focused chart. Arrow keys work too.
- Light/dark mode, responsive layout, colour-blind-checked palettes, no build step (libraries vendored).

## Architecture
```
data/raw/                 source data (boundaries + displacement table)
scripts/build_data.py     Python pipeline: validate → aggregate → web-ready JSON/GeoJSON
web/                      static front end (Leaflet, Chart.js, vanilla JS)
Dockerfile                multi-stage build: pipeline, then nginx
netlify.toml              optional Netlify build (runs the pipeline, publishes web/)
.github/workflows/        CI/CD: pipeline + Docker build check + GitHub Pages deploy
```

## Run locally
```bash
python scripts/build_data.py
cd web && python -m http.server 8000      # open http://localhost:8000
```

Or with Docker:
```bash
docker build -t eamw-demo .
docker run -p 8080:80 eamw-demo           # open http://localhost:8080
```

## Deploy
- **GitHub Pages:** every push to `main` runs the pipeline, checks the Docker build and deploys `web/` (`.github/workflows/pages.yml`).
- **Netlify (alternative):** import the repo in Netlify; `netlify.toml` handles the build.

## Data sources
- Country boundaries: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via `world-atlas`
- Basemaps: Esri World Light Gray Canvas & World Imagery, © OpenStreetMap contributors
- Displacement: illustrative sample data (see note above)

## Roadmap
- Load real IOM DTM / IDMC data through their APIs
- Admin-1 level boundaries and PostGIS backend with a REST API
- Overlay hazard forecasts (e.g. flood outlooks) for anticipatory action

## Author
**Amna Abdein** — GIS Specialist & Geospatial Web Developer
