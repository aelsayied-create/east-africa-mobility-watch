import urllib.request, json, pathlib, gzip, collections, re
out = pathlib.Path("probe"); out.mkdir(exist_ok=True)
CID="IDMCWSHSOLO009"; H="https://helix-tools-api.idmcdb.org/external-api"
IGAD={"SDN","SSD","SOM","ETH","KEN","UGA","ERI","DJI"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"eamw","Accept-Encoding":"gzip"}),timeout=300) as r:
        b=r.read()
        return gzip.decompress(b) if b[:2]==b"\x1f\x8b" else b
d=json.loads(get(f"{H}/idus/all/?client_id={CID}"))
rows=[r for r in d if r.get("iso3") in IGAD]
rep={"total":len(d),"igad":len(rows),"keys":list(d[0].keys()),"samples":rows[:3]}
c=collections.Counter(); yrs=collections.Counter()
for r in rows:
    c[(r.get("displacement_type"),r.get("type") or r.get("category"))]+=1
    yrs[str(r.get("displacement_date") or r.get("displacement_start_date"))[:7]]+=r.get("figure") or 0
rep["types"]=str(c.most_common(20)); rep["months"]=sorted(yrs.items())[-40:]
rep["minmax"]=[min(yrs),max(yrs)]
html=get("https://data.chc.ucsb.edu/products/CHIRPS-2.0/africa_monthly/tifs/").decode()
f=re.findall(r'chirps-v2\.0\.(\d{4}\.\d{2})\.tif\.gz',html); rep["chirps_range"]=[f[0],f[-1],len(f)]
gb=json.loads(get("https://www.geoboundaries.org/api/current/gbOpen/ETH/ADM1/")); rep["gb_keys"]={k:v for k,v in gb.items() if "URL" in k or "Link" in k}
(out/"report2.json").write_text(json.dumps(rep,indent=1,default=str))
