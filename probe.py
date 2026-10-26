import urllib.request, json, gzip, pathlib, io, csv, zipfile
out = pathlib.Path("out"); out.mkdir(exist_ok=True)
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "sudan-dashboard", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=300) as r:
        b = r.read(); return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b
HDX = "https://data.humdata.org/api/3/action/package_show?id="
rep = {}
def heads(pkg, maxres=40, rows=4):
    p = json.loads(get(HDX + pkg))["result"]; res = []
    for r in p["resources"][:maxres]:
        e = {"name": r["name"], "fmt": r["format"], "url": r["url"], "mod": (r.get("last_modified") or "")[:10]}
        try:
            b = get(r["url"]); e["bytes"] = len(b)
            if r["format"].upper() == "CSV":
                t = b.decode("utf-8-sig", "replace").splitlines(); e["head"] = t[:rows]; e["nrows"] = len(t)
            elif r["format"].upper() in ("XLSX", "XLS"):
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(b), read_only=True, data_only=True)
                e["sheets"] = {}
                for ws in wb.worksheets[:6]:
                    e["sheets"][ws.title] = [[str(c)[:40] for c in row] for row in ws.iter_rows(max_row=rows + 3, values_only=True)]
            elif "zip" in r["format"].lower() or r["url"].endswith(".zip"):
                z = zipfile.ZipFile(io.BytesIO(b)); e["files"] = [(i.filename, i.file_size) for i in z.infolist()]
            elif r["format"].lower() == "geojson":
                g = json.loads(b); e["nfeat"] = len(g["features"]); e["props"] = g["features"][0]["properties"]
        except Exception as ex:
            e["err"] = repr(ex)[:200]
        res.append(e)
    return res
for pkg, mx in [("hdx-hapi-sdn", 40), ("cod-ab-sdn", 3), ("new-arrivals-from-sudan", 2), ("sudan-humanitarian-needs", 1),
                ("sudan-acute-food-insecurity-classification-april-2023-september-2023", 2), ("wfp-food-prices-for-sudan", 2),
                ("sudan-acled-conflict-data", 2), ("sudan-acute-food-insecurity-country-data", 4), ("cod-ps-sdn", 3),
                ("sudan-displacement-situation-countrywide-idps-iom-dtm", 1), ("sudan-operational-presence", 1)]:
    try: rep[pkg] = heads(pkg, mx)
    except Exception as ex: rep[pkg] = repr(ex)
(out / "report2.json").write_text(json.dumps(rep, indent=1, default=str))
