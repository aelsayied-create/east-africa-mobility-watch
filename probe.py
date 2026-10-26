import urllib.request, json, gzip, pathlib, urllib.parse
out = pathlib.Path("out"); out.mkdir(exist_ok=True)
def get(u, n=None):
    req = urllib.request.Request(u, headers={"User-Agent": "sudan-dashboard", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=180) as r:
        b = r.read(); return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
rep = {}
HDX = "https://data.humdata.org/api/3/action/"
for q in ["sudan dtm idps", "sudan acled", "sudan ipc acute food insecurity", "wfp food prices sudan",
          "sudan operational presence 3w", "sudan subnational population cod-ps", "sudan administrative boundaries",
          "unhcr sudan", "sudan health facilities", "sudan cholera", "sudan humanitarian needs", "sudan refugees returnees chad south sudan"]:
    try:
        d = json.loads(get(HDX + "package_search?rows=6&q=" + urllib.parse.quote(q)))
        rep[q] = [{"name": p["name"], "title": p["title"], "org": (p.get("organization") or {}).get("title"),
                   "modified": p.get("metadata_modified", "")[:10], "license": p.get("license_title"),
                   "res": [{"n": r.get("name"), "f": r.get("format"), "u": r.get("url"), "m": (r.get("last_modified") or "")[:10]} for r in p.get("resources", [])][:8]}
                  for p in d["result"]["results"]]
    except Exception as e:
        rep[q] = repr(e)
for k, u in {"fts_plans": "https://api.hpc.tools/v1/public/plan/country/SDN",
             "unhcr_pop": "https://api.unhcr.org/population/v1/population/?limit=50&coo=SDN&yearFrom=2023&yearTo=2025&coa_all=true",
             "unhcr_sit": "https://data.unhcr.org/population/get/sublocation?widget_id=283559&sv_id=100&population_group=5460&forcesublocation=0&fromDate=1900-01-01",
             "ipc_api": "https://api.ipcinfo.org/population?country=SD&format=json",
             "worldpop": "https://hub.worldpop.org/rest/data/pop/wpgpunadj?iso3=SDN"}.items():
    try:
        b = get(u); rep[k] = b[:3000].decode("utf-8", "replace")
    except Exception as e:
        rep[k] = repr(e)
(out / "report.json").write_text(json.dumps(rep, indent=1))
