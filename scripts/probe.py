import urllib.request, json, pathlib, ssl
out = pathlib.Path("probe"); out.mkdir(exist_ok=True)
CID = "IDMCWSHSOLO009"
H = "https://helix-tools-api.idmcdb.org/external-api"
urls = {
 "idu_180": f"{H}/idus/last-180-days/?client_id={CID}",
 "idu_all": f"{H}/idus/all/?client_id={CID}",
 "gidd_dis": f"{H}/gidd/disasters/?client_id={CID}&iso3__in=SDN&start_year=2024&end_year=2025&limit=3",
 "gidd_dis_export": f"{H}/gidd/disasters/disaster-export/?client_id={CID}&iso3__in=SDN,SSD&start_year=2024&end_year=2025",
 "gidd_disp": f"{H}/gidd/displacements/?client_id={CID}&iso3__in=SDN&start_year=2023&end_year=2025&limit=3",
 "hdx_pkg": "https://data.humdata.org/api/3/action/package_search?q=idmc%20sudan&rows=8",
 "chirps_month": "https://data.chc.ucsb.edu/products/CHIRPS-2.0/africa_monthly/tifs/",
 "chirps_2025": "https://data.chc.ucsb.edu/products/CHIRPS-2.0/africa_monthly/tifs/chirps-v2.0.2025.08.tif.gz",
 "gb_sdn": "https://www.geoboundaries.org/api/current/gbOpen/SDN/ADM1/",
}
rep = {}
for k, u in urls.items():
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "eamw-probe"})
        with urllib.request.urlopen(req, timeout=120) as r:
            b = r.read()
            rep[k] = {"status": r.status, "type": r.headers.get("content-type"), "bytes": len(b)}
            if "tif" not in u:
                (out / f"{k}.txt").write_bytes(b[:6000])
    except Exception as e:
        rep[k] = {"error": repr(e)[:300]}
(out / "report.json").write_text(json.dumps(rep, indent=1))
print(json.dumps(rep, indent=1))
