"""
Fetch REAL open data for East Africa Mobility Watch (runs in GitHub Actions).

Sources (all public, attribution in README):
  * IDMC Internal Displacement Updates (IDU) API  -> displacement events
  * geoBoundaries gbOpen ADM1                       -> admin-1 boundaries
  * CHIRPS v2.0 Africa monthly rainfall (UCSB CHC)  -> rainfall % of normal

Outputs (committed to data/raw/, then processed by build_data.py):
  idu_igad.csv, igad_adm1.geojson, chirps_window.npz, chirps_clim_1991_2020.npz
"""
import csv
import gzip
import io
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
IGAD = ["DJI", "ERI", "ETH", "KEN", "SOM", "SSD", "SDN", "UGA"]
# Personal IDMC API key, stored as the GitHub Actions secret IDMC_CLIENT_ID (never in code)
IDU = "https://helix-tools-api.idmcdb.org/external-api/idus/all/?client_id={cid}"
GB = "https://www.geoboundaries.org/api/current/gbOpen/{iso}/ADM1/"
CHIRPS = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/africa_monthly/tifs/chirps-v2.0.{y}.{m:02d}.tif.gz"
BBOX = (21.0, -5.0, 52.0, 23.5)          # lon_min, lat_min, lon_max, lat_max (IGAD)
BASE = range(1991, 2021)                  # WMO climate normal 1991-2020


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "eamw-pipeline", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=300) as r:
                b = r.read()
            return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print("retry", url, e)
            time.sleep(5 * (i + 1))


def window_months(today=None):
    """Last 12 complete months for which CHIRPS is published (it lags ~1 month)."""
    today = today or date.today()
    y, m = today.year, today.month - 1          # previous month
    if m == 0:
        y, m = y - 1, 12
    out = []
    for _ in range(12):
        out.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


def hazard_of(r):
    if r["displacement_type"] == "Conflict":
        return "Conflict"
    if r["displacement_type"] == "Disaster":
        return r["type"] if r["type"] in ("Flood", "Drought") else "Other disasters"
    return None


def fetch_idu(months):
    cid = os.environ.get("IDMC_CLIENT_ID", "").strip()
    if not cid:
        print("IDMC_CLIENT_ID not set: keeping the committed idu_igad.csv")
        return
    keep = {f"{y}-{m:02d}" for y, m in months}
    data = json.loads(get(IDU.format(cid=cid)))
    rows = []
    for r in data:
        if r.get("iso3") not in IGAD or r.get("role") != "Recommended figure":
            continue
        d = (r.get("displacement_date") or "")[:10]
        hz = hazard_of(r)
        if d[:7] not in keep or not hz or not r.get("figure"):
            continue
        rows.append({
            "id": r["id"], "event_id": r["event_id"], "iso3": r["iso3"], "date": d, "month": d[:7],
            "hazard": hz, "type": r.get("type") or "", "figure": int(r["figure"]),
            "lat": r.get("latitude"), "lon": r.get("longitude"),
            "locations": r.get("locations_name") or "", "accuracy": r.get("locations_accuracy") or "",
            "source": r.get("sources") or "", "event_name": r.get("event_name") or "",
        })
    rows.sort(key=lambda x: (x["date"], x["id"]))
    with (RAW / "idu_igad.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"IDU: {len(rows)} IGAD records in window")


def fetch_adm1():
    from shapely.geometry import mapping, shape
    feats = []
    for iso in IGAD:
        meta = json.loads(get(GB.format(iso=iso)))
        url = meta.get("simplifiedGeometryGeoJSON") or meta["gjDownloadURL"]
        gj = json.loads(get(url))
        for f in gj["features"]:
            p = f["properties"]
            g = shape(f["geometry"]).simplify(0.01, preserve_topology=True)
            feats.append({"type": "Feature",
                          "properties": {"id": p.get("shapeID") or f"{iso}-{len(feats)}", "iso3": iso,
                                         "name": p.get("shapeName", "?")},
                          "geometry": mapping(g)})
        print("ADM1", iso, len(gj["features"]))
    (RAW / "igad_adm1.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))


def chirps_grid(y, m):
    """Read one CHIRPS month, crop to BBOX, aggregate 0.05 deg -> 0.1 deg (mean)."""
    import rasterio
    from rasterio.windows import from_bounds
    raw = get(CHIRPS.format(y=y, m=m))
    with rasterio.MemoryFile(raw) as mem, mem.open() as ds:
        a = ds.read(1, window=from_bounds(*BBOX, ds.transform)).astype("float32")
    a[a < 0] = np.nan
    h, w = (a.shape[0] // 2) * 2, (a.shape[1] // 2) * 2
    a = a[:h, :w].reshape(h // 2, 2, w // 2, 2)
    return np.nanmean(a, axis=(1, 3))


def fetch_chirps(months):
    clim_path = RAW / "chirps_clim_1991_2020.npz"
    if clim_path.exists():
        clim = np.load(clim_path)["clim"]
    else:
        jobs = [(y, m) for m in range(1, 13) for y in BASE]
        with ThreadPoolExecutor(12) as ex:
            grids = list(ex.map(lambda ym: chirps_grid(*ym), jobs))
        clim = np.stack([np.nanmean(np.stack(grids[i * len(BASE):(i + 1) * len(BASE)]), axis=0)
                         for i in range(12)])
        np.savez_compressed(clim_path, clim=clim.astype("float32"), bbox=np.array(BBOX))
        print("CHIRPS climatology", clim.shape)
    with ThreadPoolExecutor(6) as ex:
        obs = np.stack(list(ex.map(lambda ym: chirps_grid(*ym), months)))
    np.savez_compressed(RAW / "chirps_window.npz", obs=obs.astype("float32"),
                        clim=np.stack([clim[m - 1] for _, m in months]).astype("float32"),
                        months=np.array([f"{y}-{m:02d}" for y, m in months]), bbox=np.array(BBOX))
    print("CHIRPS window", obs.shape)


if __name__ == "__main__":
    RAW.mkdir(parents=True, exist_ok=True)
    win = window_months()
    print("Window:", win[0], "->", win[-1])
    fetch_idu(win)
    fetch_adm1()
    fetch_chirps(win)
    (RAW / "SOURCES.json").write_text(json.dumps({
        "fetched": date.today().isoformat(),
        "window": [f"{y}-{m:02d}" for y, m in win],
        "idu": IDU.split("?")[0], "adm1": "geoBoundaries gbOpen ADM1", "rain": "CHIRPS v2.0 Africa monthly",
    }, indent=1))
