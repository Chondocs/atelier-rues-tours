import json, re, math, collections
d = json.load(open('data/metro.json'))

# ---------- Lieux ----------
U_KEEP = re.compile(r"^(Faculté|UFR|IUT de Tours|Institut Universitaire de Technologie de Tours|Polytech Tours - Aménagement|Université de Tours - Site|Université François Rabelais|Excelia|EBM Business|Skolae|École supérieure d'art|École Supérieure de Cinéma|Institut National Supérieure du Professorat)", re.I)
C_KEEP = {"Château de Tours", "Musée des Beaux-Arts", "Opéra de Tours", "Musée Saint-Martin", "Muséum d'Histoire Naturelle", "Musée du Compagnonnage", "Centre de Création Contemporaine Olivier Debré", "Comédie de Tours", "Château de Plessis-lèz-Tours", "Château de Luynes", "Château de Villandry", "Prieuré de Saint-Cosme", "Cloître Saint-Gatien dit de la Psalette", "Ancienne abbaye de Saint-Julien", "Théâtre Olympia", "Le Petit Faucheux", "Le Nouvel Atrium", "Musée des Vins de Touraine"}
G_DROP = {'La Douzillère', 'Cinq-Mars-la-Pile', 'Montlouis', 'Veretz - Montlouis'}
M_DROP = re.compile(r"annexe|Larçay|Vouvray|Cinq-Mars|Ville-aux-Dames|Saint-Roch|Gués de Veigné|^Mairie$|Mairie de Tours", re.I)
L_KEEP = {'Palais Des Congrès de Tours', 'Le Vinci', 'Palais des sports Marcel Cerdan', 'Centre aquatique du Lac - piscines et saunas', 'Patinoire Municipale de Tours', 'Patinoire municipale de Joué-lès-Tours', 'Stade de Grandmont', 'Parc des Expositions de Tours', 'Stade de la Vallée du Cher'}
S_DROP = {'Passage du Palais', 'Ma Petite Madelaine', 'La Galerie', 'Complexe des Drouets'}
RENAME = {"Polytech Tours - Aménagement et Environement": "Polytech Tours", "Hôtel de Ville": "Hôtel de ville de Tours", "Le Vinci": "Palais des congrès Vinci", "Palais Des Congrès de Tours": "Palais des congrès Vinci", "Halte Routière": "Gare routière", "Tours": "Gare de Tours", "Joué-les-Tours": "Gare de Joué-lès-Tours", "Saint-Pierre-des-Corps": "Gare de Saint-Pierre-des-Corps", "Fondettes - Saint-Cyr-sur-Loire": "Gare de Fondettes - Saint-Cyr", "La Membrolle-sur-Choisille": "Gare de La Membrolle", "Ballan": "Gare de Ballan-Miré", "Druye": "Gare de Druye", "Notre-Dame-d'Oé": "Gare de Notre-Dame-d'Oé", "Saint-Genouph": "Gare de Saint-Genouph", "Savonnières": "Gare de Savonnières"}
def keep(cat, name):
    if cat == 'G': return name not in G_DROP
    if cat == 'L': return name in L_KEEP
    if cat == 'U': return bool(U_KEEP.search(name))
    if cat == 'C': return name in C_KEEP or bool(re.search(r"cathédrale|basilique", name, re.I))
    if cat == 'H': return bool(re.match(r"^(Hôpital|Clinique)", name))
    if cat == 'M': return not M_DROP.search(name)
    if cat == 'S': return name not in S_DROP
    return True
pois = []
for cat, name, la, lo in d['pois']:
    if not keep(cat, name): continue
    name = RENAME.get(name, name)
    if cat == 'T': name = re.sub(r"\s+\d$", "", name)
    pois.append([cat, name, la, lo])
out_p = []
for cat, name, la, lo in pois:
    dup = False
    for c2, n2, la2, lo2 in out_p:
        dx = (lo - lo2) * 75400; dy = (la - la2) * 110540
        if c2 == cat and (n2 == name or math.hypot(dx, dy) < 90): dup = True; break
    if not dup: out_p.append([cat, name, la, lo])
pois = out_p

# ---------- Rues ----------
classes = sorted({w['c'] for w in d['ways']})
cidx = {c: i for i, c in enumerate(classes)}
names = ['']; nidx = {'': 0}
def nid(n):
    if n not in nidx: nidx[n] = len(names); names.append(n)
    return nidx[n]
out = []
wid_set = set(); editable = {'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','pedestrian','cycleway','busway'}
tram_ids = set()
for w in d['ways']:
    flat = []; pla = plo = 0
    for la, lo in w['p']:
        a, b = round(la * 1e5), round(lo * 1e5)
        flat += [a - pla, b - plo]; pla, plo = a, b
    lanes = int(w['l']) if re.fullmatch(r'\d', w['l'] or '') else 0
    sp = int(w['m']) if re.fullmatch(r'\d{2,3}', w['m'] or '') else 0
    o = 2 if w['o'] == -1 else w['o']
    out.append([w['id'], cidx[w['c']], nid(w['n']), o, lanes, sp, w['b'], w['y'], flat])
    if w['c'] in editable: wid_set.add(w['id'])
    if w['c'] == 'tram': tram_ids.add(w['id'])

P = [[round(la * 1e5), round(lo * 1e5), cat, nid(name)] for cat, name, la, lo in pois]

# ---------- Arrêts de bus (dédoublonnés) ----------
bs = []; seen = {}
for la, lo, n in sorted(d['stops'], key=lambda s: s[2]):
    kx, ky = int(lo * 75400 // 60), int(la * 110540 // 60)
    if any(n == n2 and math.hypot((lo - lo2) * 75400, (la - la2) * 110540) < 60 for i in (-1, 0, 1) for j in (-1, 0, 1) for la2, lo2, n2 in seen.get((kx + i, ky + j), [])): continue
    seen.setdefault((kx, ky), []).append((la, lo, n)); bs.append([la, lo, n])
BS = [[round(la * 1e5), round(lo * 1e5), nid(n)] for la, lo, n in bs]

# ---------- Lignes ----------
def ways_of(rs, ids):
    s = set()
    for r in rs:
        for t, ref, role in r['m']:
            if t == 'way' and int(ref) in ids: s.add(int(ref))
    return sorted(s)
bus_groups = collections.OrderedDict()
tram_groups = collections.OrderedDict()
for r in sorted(d['rels'], key=lambda r: (len(r['ref']), r['ref'])):
    if r['net'] != 'Fil Bleu': continue
    if r['t'] == 'tram': tram_groups.setdefault(r['ref'], []).append(r)
    elif r['name'].startswith('Résabus'): continue
    else: bus_groups.setdefault(r['ref'], []).append(r)
def short(n):
    return re.sub(r'^(Bus de Nuit|Bus Tempo|Bus|Car)\s+', '', n)
BL = []
for ref, rs in bus_groups.items():
    ids = ways_of(rs, wid_set)
    if len(ids) < 3: continue
    nm = rs[0]['name']
    nm = re.sub(r'\s*→.*$', '', nm) if False else nm
    BL.append([ref, nid(nm), rs[0]['col'] or '', ids])
TL = []
for ref, rs in tram_groups.items():
    TL.append([ref, nid('Tram ' + ref), rs[0]['col'] or '#bf1950', ways_of(rs, tram_ids)])

# ---------- Bâti ----------
BD = [[ix, iy, a] for ix, iy, a in d['bld'] if a >= 40]

data = json.dumps({'c': classes, 'n': names, 'w': out, 'p': P, 'bs': BS, 'bl': BL, 'tl': TL, 'bd': BD, 'pop': 298000}, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
html = open('build/template.html', encoding='utf-8').read().replace('__DATA__', data)
open('index.html', 'w', encoding='utf-8').write(html)
print(round(len(html) / 1e6, 2), 'MB', len(out), 'ways', len(P), 'pois', dict(collections.Counter(p[2] for p in P)), len(BS), 'bus stops', len(BL), 'bus lines', len(TL), 'tram lines', len(BD), 'bld cells')
m = re.search(r'<script>\n.*?\n</script>', html, re.S)
open('build/app.js', 'w').write(m.group(0)[len('<script>\n'):-len('</script>')])
