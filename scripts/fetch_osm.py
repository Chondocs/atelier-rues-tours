import sys, json, time, math, threading, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
OUT = sys.argv[1]
S, W, N, E = 47.300, 0.460, 47.470, 0.820
STEP = 0.01
KEEP = {"motorway","motorway_link","trunk","trunk_link","primary","primary_link","secondary","secondary_link","tertiary","tertiary_link","unclassified","residential","living_street","pedestrian","cycleway","busway"}
UA = "tours-reseau-transport-prototype/0.2 (personal project)"
LAT0, LON0 = 47.3945, 0.693
KX = math.cos(math.radians(LAT0)) * 111320; KY = 110540
ways, rels, stops, pois, bld = {}, {}, {}, {}, {}
seen_b = set(); failed = []; nreq = 0; lock = threading.Lock()

def cat(t):
    if not t.get('name'): return None
    if t.get('railway') == 'tram_stop': return 'T'
    if t.get('railway') in ('station','halt') and t.get('station') != 'subway': return 'G'
    if t.get('amenity') == 'bus_station': return 'G'
    if t.get('aeroway') == 'aerodrome': return 'A'
    if t.get('amenity') == 'hospital': return 'H'
    if t.get('amenity') in ('university','college'): return 'U'
    if t.get('amenity') == 'townhall': return 'M'
    if t.get('historic') == 'castle' or t.get('tourism') == 'museum' or t.get('building') == 'cathedral' or t.get('amenity') == 'theatre': return 'C'
    nm = t['name'].lower()
    if t.get('amenity') == 'place_of_worship' and ('cathédrale' in nm or 'basilique' in nm): return 'C'
    if ('vinci' in nm or 'zénith' in nm or 'zenith' in nm or 'congrès' in nm or 'congres' in nm) and (t.get('amenity') or t.get('building') or t.get('leisure')): return 'L'
    if t.get('leisure') == 'ice_rink' or (t.get('leisure') in ('swimming_pool','sports_centre') and ('olympique' in nm or 'aquatique' in nm or 'palais des sports' in nm)): return 'L'
    if t.get('shop') == 'mall': return 'S'
    if t.get('leisure') == 'stadium' or t.get('amenity') in ('exhibition_centre','conference_centre'): return 'L'
    return None

def parse(data):
    root = ET.fromstring(data)
    nodes = {}
    L = []
    for nd in root.iter("node"):
        la, lo = float(nd.get("lat")), float(nd.get("lon"))
        nodes[nd.get("id")] = (la, lo)
        tg = nd.findall("tag")
        if tg:
            tags = {t.get("k"): t.get("v") for t in tg}
            if tags.get("highway") == "bus_stop" and tags.get("name"):
                L.append(("s", nd.get("id"), (la, lo, tags["name"])))
            c = cat(tags)
            if c: L.append(("p", (c, tags["name"]), (la, lo)))
    for wy in root.iter("way"):
        wid = wy.get("id")
        tags = {t.get("k"): t.get("v") for t in wy.findall("tag")}
        if not tags: continue
        refs = [nr.get("ref") for nr in wy.findall("nd")]
        pts = [nodes[r] for r in refs if r in nodes]
        if tags.get("building") and len(pts) >= 4 and refs[0] == refs[-1]:
            L.append(("b", wid, pts))
        c = cat(tags)
        if c and pts: L.append(("p", (c, tags["name"]), (sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts))))
        hw = tags.get("highway"); is_tram = tags.get("railway") == "tram"
        extra = None
        if tags.get("waterway") in ("river","canal"): extra = "river"
        elif tags.get("natural") == "water" or tags.get("waterway") == "riverbank": extra = "water"
        elif tags.get("railway") == "rail" and tags.get("service") is None: extra = "rail"
        if hw not in KEEP and not is_tram and not extra: continue
        if len(pts) < 2: continue
        cyc = any(k.startswith("cycleway") and v not in ("no","none") for k, v in tags.items()) or tags.get("bicycle") == "designated"
        L.append(("w", wid, {"id": int(wid), "c": extra or ("tram" if is_tram else hw), "n": tags.get("name",""),
            "o": 1 if tags.get("oneway") in ("yes","1","true") else (-1 if tags.get("oneway") == "-1" else 0),
            "l": tags.get("lanes",""), "m": tags.get("maxspeed",""), "w": tags.get("width",""),
            "b": 1 if tags.get("bridge") not in (None,"no") else 0, "y": 1 if cyc else 0,
            "p": [[round(a,5), round(b,5)] for a, b in pts]}))
    for r in root.iter("relation"):
        tags = {t.get("k"): t.get("v") for t in r.findall("tag")}
        if tags.get("type") != "route" or tags.get("route") not in ("bus","tram","trolleybus"): continue
        mem = [(m.get("type"), m.get("ref"), m.get("role")) for m in r.findall("member")]
        L.append(("r", r.get("id"), {"t": tags["route"], "ref": tags.get("ref",""), "name": tags.get("name",""), "col": tags.get("colour",""), "net": tags.get("network",""), "from": tags.get("from",""), "to": tags.get("to",""), "m": mem}))
    return L

def merge(L):
    with lock:
        for k, a, b in L:
            if k == "w": ways.setdefault(a, b)
            elif k == "p": pois.setdefault(a, b)
            elif k == "s": stops.setdefault(a, b)
            elif k == "r":
                if a in rels: rels[a]["m"] = list(set(map(tuple, rels[a]["m"])) | set(map(tuple, b["m"])))
                else: rels[a] = b
            elif k == "b":
                if a in seen_b: continue
                seen_b.add(a)
                xs = [(lo-LON0)*KX for la, lo in b]; ys = [(la-LAT0)*KY for la, lo in b]
                ar = 0
                for i in range(len(xs)-1): ar += xs[i]*ys[i+1]-xs[i+1]*ys[i]
                ar = abs(ar)/2
                cx = sum(xs)/len(xs); cy = sum(ys)/len(ys)
                key = (int(cx//100), int(cy//100))
                bld[key] = bld.get(key, 0) + ar

def fetch(s, w, n, e, depth=0):
    global nreq
    url = f"https://api.openstreetmap.org/api/0.6/map?bbox={w:.5f},{s:.5f},{e:.5f},{n:.5f}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            nreq += 1
            with urllib.request.urlopen(req, timeout=90) as r: data = r.read()
            merge(parse(data)); time.sleep(0.2); return
        except urllib.error.HTTPError as ex:
            if ex.code == 400 and depth < 4:
                ms, mw = (s+n)/2, (w+e)/2
                for a in ((s,w,ms,mw),(s,mw,ms,e),(ms,w,n,mw),(ms,mw,n,e)): fetch(*a, depth+1)
                return
            if ex.code in (429,509): time.sleep(20*(attempt+1)); continue
            time.sleep(3)
        except Exception: time.sleep(3)
    failed.append((s,w,n,e))

cells = []; lat = S
while lat < N - 1e-9:
    lon = W
    while lon < E - 1e-9:
        cells.append((lat, lon, min(lat+STEP,N), min(lon+STEP,E))); lon += STEP
    lat += STEP
done = 0
def job(c):
    global done
    fetch(*c); done += 1
    if done % 20 == 0: print(f"{done}/{len(cells)} ways {len(ways)} rels {len(rels)} stops {len(stops)} pois {len(pois)} bld {len(bld)} req {nreq} failed {len(failed)}", flush=True)
with ThreadPoolExecutor(4) as ex: list(ex.map(job, cells))
json.dump({"bbox":[S,W,N,E],"ways":list(ways.values()),"rels":[dict(v, id=k) for k,v in rels.items()],
  "stops":[[la,lo,n] for la,lo,n in stops.values()],"pois":[[c,n,la,lo] for (c,n),(la,lo) in pois.items()],
  "bld":[[k[0],k[1],round(v)] for k,v in bld.items()],"failed":failed}, open(OUT,"w"), ensure_ascii=False, separators=(",",":"))
print("DONE", len(ways), len(rels), len(stops), len(pois), len(bld), "failed", len(failed), flush=True)
