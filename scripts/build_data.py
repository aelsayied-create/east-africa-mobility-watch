"""
Data pipeline for East Africa Mobility Watch (offline step, no network).

Inputs  (data/raw/, refreshed monthly by scripts/fetch_real_data.py in CI):
  idu_igad.csv              IDMC Internal Displacement Updates, IGAD, last 12 months
  igad_adm1.geojson         geoBoundaries ADM1
  igad_countries.geojson    Natural Earth country outlines
  chirps_window.npz         CHIRPS monthly rainfall + 1991-2020 normal, 0.1 deg grid

Steps
  1. Validate the event table (country, hazard, month, figure, coordinates).
  2. Assign every event to an admin-1 unit (point in polygon, nearest unit in the
     same country as fallback for coastal / border points).
  3. Aggregate displacement by country and admin-1 x month x hazard.
  4. Turn rainfall into % of the 1991-2020 normal: coloured PNG overlays per month
     plus zonal means per country and admin-1.
  5. Write web-ready JSON / GeoJSON / PNG to web/data/.
"""
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image
from shapely import STRtree, contains_xy, set_precision
from shapely.geometry import Point, mapping, shape

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "data"
HAZARDS = ["Flood", "Drought", "Conflict", "Other disasters"]
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DRY_MM = 20            # months with a normal below this are "dry season" (no anomaly shown)
EVENT_MIN = 100        # smallest event shown as a point on the map

# % of normal classes -> RGBA (brown = drier, teal = wetter); checked for CVD contrast
RAIN_BREAKS = [50, 75, 90, 110, 125, 150]
RAIN_COLORS = [(140, 81, 10), (201, 137, 59), (236, 205, 150), (245, 245, 240),
               (150, 210, 200), (53, 151, 143), (1, 92, 85)]


def label(m):
    y, mm = m.split("-")
    return f"{MON[int(mm) - 1]} {y}"


def load_events(names):
    good, bad = [], 0
    with (RAW / "idu_igad.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                r["figure"] = int(r["figure"])
                r["lat"] = float(r["lat"]) if r["lat"] else None
                r["lon"] = float(r["lon"]) if r["lon"] else None
            except ValueError:
                bad += 1
                continue
            if r["iso3"] not in names or r["hazard"] not in HAZARDS or r["figure"] <= 0:
                bad += 1
                continue
            good.append(r)
    return good, bad


def assign_adm1(events, adm1):
    geoms = [shape(f["geometry"]) for f in adm1]
    tree = STRtree(geoms)
    by_iso = defaultdict(list)
    for i, f in enumerate(adm1):
        by_iso[f["properties"]["iso3"]].append(i)
    hit = near = miss = 0
    for e in events:
        e["adm1"] = None
        if e["lat"] is None:
            miss += 1
            continue
        p = Point(e["lon"], e["lat"])
        cand = [i for i in tree.query(p, predicate="intersects")
                if adm1[i]["properties"]["iso3"] == e["iso3"]]
        if cand:
            e["adm1"] = adm1[cand[0]]["properties"]["id"]
            hit += 1
            continue
        same = by_iso.get(e["iso3"], [])
        if same:
            j = min(same, key=lambda k: geoms[k].distance(p))
            if geoms[j].distance(p) < 0.5:          # ~50 km
                e["adm1"] = adm1[j]["properties"]["id"]
                near += 1
                continue
        miss += 1
    return {"inside": hit, "nearest": near, "unassigned": miss}


def rain_layers(win, countries, adm1, months):
    obs, clim = win["obs"], win["clim"]
    lon0, lat0, lon1, lat1 = [float(x) for x in win["bbox"]]
    n, h, w = obs.shape
    res = (lon1 - lon0) / w
    xs = lon0 + res * (np.arange(w) + 0.5)
    ys = lat1 - res * (np.arange(h) + 0.5)
    X, Y = np.meshgrid(xs, ys)

    def mask_of(geom):
        return contains_xy(geom, X, Y)

    cmask = {f["properties"]["iso3"]: mask_of(shape(f["geometry"])) for f in countries}
    amask = {f["properties"]["id"]: mask_of(shape(f["geometry"])) for f in adm1}
    land = np.any(np.stack(list(cmask.values())), axis=0)

    # index n = the whole 12-month window (sum of rain / sum of normal)
    obs = np.concatenate([obs, np.nansum(obs, axis=0, keepdims=True)])
    clim = np.concatenate([clim, np.nansum(clim, axis=0, keepdims=True)])
    dry = [DRY_MM] * n + [DRY_MM * 12]
    keys = months + ["all"]

    def zonal(m):
        out = []
        for k in range(n + 1):
            if not m.any():
                out.append(None)
                continue
            o, c = np.nanmean(obs[k][m]), np.nanmean(clim[k][m])
            out.append(None if not np.isfinite(c) or c < dry[k] else round(float(o / c * 100), 1))
        return out

    (OUT / "rain").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "rain").glob("*.png"):
        old.unlink()
    pal = np.array(RAIN_COLORS, dtype=np.uint8)
    for k, m in enumerate(keys):
        with np.errstate(invalid="ignore", divide="ignore"):
            pct = obs[k] / clim[k] * 100
        cls = np.digitize(np.nan_to_num(pct, nan=100), RAIN_BREAKS)
        rgba = np.zeros((h, w, 4), dtype=np.uint8)
        rgba[..., :3] = pal[cls]
        ok = land & np.isfinite(pct) & (clim[k] >= dry[k])
        rgba[..., 3] = np.where(ok, 235, 0)
        rgba[land & ~ok] = (190, 190, 185, 90)       # dry season: light grey veil
        Image.fromarray(rgba, "RGBA").save(OUT / "rain" / f"{m}.png", optimize=True)

    return {
        "bounds": [[lat0, lon0], [lat1, lon1]],
        "breaks": RAIN_BREAKS,
        "colors": ["#%02x%02x%02x" % c for c in RAIN_COLORS],
        "country": {k: zonal(v) for k, v in cmask.items()},
        "adm1": {k: zonal(v) for k, v in amask.items()},
    }


def main():
    countries = json.loads((RAW / "igad_countries.geojson").read_text())["features"]
    names = {f["properties"]["iso3"]: f["properties"]["name"] for f in countries}
    adm1 = json.loads((RAW / "igad_adm1.geojson").read_text())["features"]
    win = np.load(RAW / "chirps_window.npz")
    months = [str(m) for m in win["months"]]
    midx = {m: i for i, m in enumerate(months)}
    sources = json.loads((RAW / "SOURCES.json").read_text()) if (RAW / "SOURCES.json").exists() else {}

    # 1-2. validate + locate
    events, rejected = load_events(names)
    events = [e for e in events if e["month"] in midx]
    located = assign_adm1(events, adm1)

    # 3. aggregate
    zero = lambda: [[0] * len(HAZARDS) for _ in months]  # noqa: E731
    cval = {iso: zero() for iso in names}
    aval = {f["properties"]["id"]: zero() for f in adm1}
    for e in events:
        k, j = midx[e["month"]], HAZARDS.index(e["hazard"])
        cval[e["iso3"]][k][j] += e["figure"]
        if e["adm1"]:
            aval[e["adm1"]][k][j] += e["figure"]

    # 4. rainfall
    rain = rain_layers(win, countries, adm1, months)

    # 5. write
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "displacement.json").write_text(json.dumps({
        "months": months, "labels": [label(m) for m in months], "hazards": HAZARDS,
        "countries": names, "values": cval,
        "adm1": {f["properties"]["id"]: {"n": f["properties"]["name"], "c": f["properties"]["iso3"],
                                         "v": aval[f["properties"]["id"]]} for f in adm1},
        "rain": rain,
        "meta": {"records": len(events), "rejected": rejected, "located": located,
                 "fetched": sources.get("fetched"), "built": date.today().isoformat(),
                 "source": "IDMC Internal Displacement Updates (IDU); CHIRPS v2.0; geoBoundaries"},
    }, separators=(",", ":")))
    (OUT / "igad_countries.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": countries}, separators=(",", ":")))
    (OUT / "igad_adm1.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": f["properties"],
         "geometry": mapping(set_precision(shape(f["geometry"]), 0.001))}
        for f in adm1]}, separators=(",", ":")))
    pts = [e for e in events if e["lat"] is not None and e["figure"] >= EVENT_MIN]
    (OUT / "events.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(e["lon"], 3), round(e["lat"], 3)]},
         "properties": {"m": midx[e["month"]], "d": e["date"], "h": HAZARDS.index(e["hazard"]), "f": e["figure"],
                        "c": e["iso3"], "loc": e["locations"][:140], "src": e["source"][:90],
                        "ev": e["event_name"][:140]}} for e in pts]}, separators=(",", ":")))

    tot = sum(e["figure"] for e in events)
    print(f"OK: {len(events)} events ({tot:,} displacements), {rejected} rejected, "
          f"located {located}, {len(pts)} map points, {len(months)} months -> {OUT}")


if __name__ == "__main__":
    main()
