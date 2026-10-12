"""
Data pipeline for the East Africa Mobility Watch demo.

1. Reads (or generates) a tidy displacement table:
   iso3, month, hazard, new_displacements
2. Validates it against the IGAD country boundaries.
3. Aggregates it and writes web-ready JSON + GeoJSON to web/data/.

The bundled table is ILLUSTRATIVE SAMPLE DATA, not official figures.
Swap data/raw/displacement.csv for a real export (e.g. IOM DTM or IDMC)
with the same columns and re-run:  python scripts/build_data.py
"""
import csv
import json
import random
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "data"
HAZARDS = ["Flood", "Drought", "Conflict"]
MONTHS = [f"2025-{m:02d}" for m in range(1, 13)]


def generate_sample(path: Path, countries: list[str]) -> None:
    """Create a reproducible synthetic dataset with seasonal patterns."""
    rnd = random.Random(42)
    scale = {"SDN": 9, "SSD": 5, "SOM": 6, "ETH": 6, "KEN": 2.5,
             "UGA": 1.5, "ERI": 0.6, "DJI": 0.3}
    flood_peak = {"SDN": [7, 8, 9], "SSD": [7, 8, 9, 10], "SOM": [4, 5, 10, 11],
                  "ETH": [7, 8], "KEN": [4, 5, 11], "UGA": [4, 5, 10],
                  "ERI": [7, 8], "DJI": [11]}
    rows = []
    for iso in countries:
        for i, month in enumerate(MONTHS, start=1):
            for hz in HAZARDS:
                base = scale[iso] * 1000
                if hz == "Flood":
                    v = base * (4 if i in flood_peak[iso] else 0.3)
                elif hz == "Drought":
                    v = base * (1.6 if i in (1, 2, 3, 12) else 0.6)
                else:
                    v = base * 1.2
                v *= rnd.uniform(0.6, 1.4)
                rows.append({"iso3": iso, "month": month, "hazard": hz,
                             "new_displacements": int(v)})
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    boundaries = json.loads((RAW / "igad_countries.geojson").read_text())
    names = {f["properties"]["iso3"]: f["properties"]["name"]
             for f in boundaries["features"]}

    csv_path = RAW / "displacement.csv"
    if not csv_path.exists():
        generate_sample(csv_path, list(names))

    # Load + validate
    records, rejected = [], 0
    with csv_path.open() as f:
        for r in csv.DictReader(f):
            if r["iso3"] not in names or r["hazard"] not in HAZARDS:
                rejected += 1
                continue
            r["new_displacements"] = int(r["new_displacements"])
            records.append(r)

    # Aggregate: country -> month -> hazard
    agg = defaultdict(lambda: defaultdict(dict))
    for r in records:
        agg[r["iso3"]][r["month"]][r["hazard"]] = r["new_displacements"]

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "displacement.json").write_text(json.dumps({
        "months": MONTHS,
        "hazards": HAZARDS,
        "countries": names,
        "values": agg,
        "note": "Illustrative sample data for demonstration only.",
    }, separators=(",", ":")))
    (OUT / "igad_countries.geojson").write_text(
        json.dumps(boundaries, separators=(",", ":")))

    print(f"OK: {len(records)} records, {rejected} rejected, "
          f"{len(names)} countries -> {OUT}")


if __name__ == "__main__":
    main()
