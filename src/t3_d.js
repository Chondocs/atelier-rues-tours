
/* ---------- Coupe de rue ---------- */
const ITEM = {
  walk:   { label: 'Trottoir',          w: 2.5,  col: '--m-ped' },
  bike:   { label: 'Piste cyclable',    w: 2.0,  col: '--m-bike' },
  bike2:  { label: 'Piste bidirectionnelle', w: 3.0, col: '--m-bike' },
  car:    { label: 'Voie de circulation', w: 3.0, col: '--m-carsw' },
  bus:    { label: 'Voie de bus',       w: 3.25, col: '--m-bus' },
  tram:   { label: 'Voie de tram',      w: 3.0,  col: '--fg' },
  tramcar: { label: 'Voie partagée tram + voiture', w: 3.5, col: '--fg' },
  park:   { label: 'Stationnement',     w: 2.0,  col: '--m-casing' },
  green:  { label: 'Plantations',       w: 1.5,  col: '--m-green' },
  median: { label: 'Terre-plein',       w: 1.0,  col: '--m-casing' },
};
const fmtM = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
const q4 = v => Math.round(v * 4) / 4;
const sumW = p => p.items.reduce((a, i) => a + i.w, 0);
const profKey = cluster => String(Math.min(...cluster.map(i => ways[i].id)));
let cp = null;

/* Largeur entre façades : estimée d'après le type de rue, jamais agrandie par un ajout */
const FACADE = { motorway: 25, trunk: 22, primary: 20, secondary: 16, tertiary: 13, unclassified: 11, residential: 10, living_street: 9, pedestrian: 8, cycleway: 4, busway: 8, motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 7 };
const KNOWN_W = { 'Pont Mirabeau': 13 };
function estimateW(w) {
  if (KNOWN_W[w.name]) return KNOWN_W[w.name];
  let W = FACADE[w.c] || 10;
  if (w.bridge) W = Math.min(W, 14);
  if (w.lanes) W = Math.max(W, w.lanes * 3 + (MAJOR.has(w.c) ? 2 : 4));
  return Math.round(W * 2) / 2;
}
const nTypes = (items, t) => items.filter(i => i.t === t).length;
/* fait entrer les éléments dans W : rogne trottoirs, voies, puis retire des voies de voiture. Renvoie les retraits. */
function fitItems(items, W) {
  items = items.map(i => ({ ...i })); const out = { items, dropped: [] }, sum = () => items.reduce((a, i) => a + i.w, 0);
  const shrink = (types, min) => {
    const over = sum() - W; if (over <= 0.001) return;
    const cand = items.filter(i => types.includes(i.t) && i.w > min + 0.001), room = cand.reduce((a, i) => a + i.w - min, 0);
    if (!room) return; const k = Math.min(1, over / room);
    for (const i of cand) i.w = Math.max(min, Math.round((i.w - (i.w - min) * k) * 100) / 100);
  };
  shrink(['walk'], 1.5); shrink(['park', 'green', 'median'], 0.5);
  for (let g = 0; g < 8 && sum() > W + 0.001; g++) {
    shrink(['car', 'bus'], 2.75); shrink(['bike', 'bike2'], 1.5); shrink(['walk'], 1.0);
    if (sum() <= W + 0.001) break;
    const i = items.findIndex(x => x.t === 'park' || x.t === 'green' || x.t === 'median');
    if (i >= 0) { items.splice(i, 1); continue; }
    const tr = items.findIndex(x => x.t === 'tram'), ca = items.map(x => x.t).lastIndexOf('car');
    if (tr >= 0 && ca >= 0) { items.splice(ca, 1); items[ca < tr ? tr - 1 : tr] = { t: 'tramcar', w: 3.25 }; out.dropped.push('shared'); continue; }
    if (nTypes(items, 'car') > 1) { items.splice(ca, 1); out.dropped.push('car'); continue; }
    break;
  }
  return out;
}
/* le surplus de largeur va aux trottoirs */
function fillWalk(items, W) {
  const walks = items.filter(i => i.t === 'walk'), left = W - items.reduce((a, i) => a + i.w, 0);
  if (!walks.length || left <= 0.01) return items;
  const add = Math.min(left / walks.length, 4);
  for (const i of walks) i.w = Math.round((i.w + add) * 100) / 100;
  return items;
}
function estimateItems(w, cluster, W) {
  W = W || estimateW(w);
  const c = w.c, tr = cluster ? tramTracks(cluster) : 0, T = () => [{ t: 'tram', w: 3 }, { t: 'tram', w: 3 }];
  let items;
  if (c === 'pedestrian' || c === 'living_street') items = tr ? [{ t: 'walk', w: 2.5 }, ...T(), { t: 'walk', w: 2.5 }] : [{ t: 'walk', w: W }];
  else if (c === 'cycleway') items = [{ t: 'bike2', w: Math.min(3, W) }];
  else if (c === 'busway') items = [{ t: 'bus', w: 3.5 }];
  else {
    const L = w.lanes || (onewayOf(w) ? 1 : 2), lw = MAJOR.has(c) ? 3.5 : 3.0, left = tr ? Math.floor(L / 2) : L;
    items = [];
    if (!MAJOR.has(c)) items.push({ t: 'walk', w: 2.0 });
    for (let i = 0; i < left; i++) items.push({ t: 'car', w: lw });
    if (tr) { items.push(...T()); for (let i = left; i < L; i++) items.push({ t: 'car', w: lw }); }
    if (!MAJOR.has(c)) items.push({ t: 'walk', w: 2.0 });
  }
  const f = fitItems(items, W);
  return { items: fillWalk(f.items, W), dropped: f.dropped, W };
}
function presetItems(kind, W, w, cluster) {
  const flex = fixed => q4(Math.max(1.5, (W - fixed) / 2));
  let items;
  if (kind === 'est') return estimateItems(w, cluster, W);
  if (kind === 'car') { const L = w.lanes || 2, f = flex(L * 3); items = [{ t: 'walk', w: f }, ...Array.from({ length: L }, () => ({ t: 'car', w: 3 })), { t: 'walk', w: f }]; }
  else if (kind === 'bus') { const f = flex(2 * 2 + 2 * 3.25); items = [{ t: 'walk', w: f }, { t: 'bike', w: 2 }, { t: 'bus', w: 3.25 }, { t: 'bus', w: 3.25 }, { t: 'bike', w: 2 }, { t: 'walk', w: f }]; }
  else if (kind === 'tram') { const f = flex(2 * 2 + 2 * 3); items = [{ t: 'walk', w: f }, { t: 'bike', w: 2 }, { t: 'tram', w: 3 }, { t: 'tram', w: 3 }, { t: 'bike', w: 2 }, { t: 'walk', w: f }]; }
  else { const f = flex(3 + 1.5); items = [{ t: 'walk', w: f }, { t: 'green', w: 1.5 }, { t: 'bike2', w: 3 }, { t: 'walk', w: f }]; }
  const r = fitItems(items, W); return { items: r.items, dropped: r.dropped, W };
}
function profileFor(anchorIdx, cluster) {
  const key = profKey(cluster);
  if (!profiles[key] || profiles[key].est) {
    const r = estimateItems(ways[anchorIdx], cluster);
    profiles[key] = { W: r.W, items: r.items, est: true, dropped: r.dropped.filter(x => x === 'car').length, shared: r.dropped.filter(x => x === 'shared').length };
  }
  return profiles[key];
}
const saveProfiles = () => lsSet(STORE_C, profiles);

const GL = {
  walk: (cx, y, w) => { let s = ''; const n = Math.max(1, Math.min(4, Math.floor(w / 2.2))); for (let k = 0; k < n; k++) { const x = cx - w / 2 + w * (k + .5) / n; s += `<circle cx="${x}" cy="${y-1.65}" r=".34" style="fill:var(--fg)"/><path d="M${x} ${y-1.3}V${y-.6}M${x-.32} ${y-.1}L${x} ${y-.6}L${x+.32} ${y-.1}M${x-.4} ${y-1.0}L${x} ${y-1.25}L${x+.4} ${y-1.0}" style="stroke:var(--fg);fill:none;stroke-width:.15;stroke-linecap:round"/>`; } return s; },
  bike: (cx, y) => `<g style="stroke:var(--fg);fill:none;stroke-width:.14;stroke-linecap:round"><circle cx="${cx-.55}" cy="${y-.42}" r=".4"/><circle cx="${cx+.55}" cy="${y-.42}" r=".4"/><path d="M${cx-.55} ${y-.42}L${cx-.1} ${y-1.05}L${cx+.4} ${y-1.05}L${cx+.55} ${y-.42}M${cx-.1} ${y-1.05}L${cx+.1} ${y-.42}"/></g><circle cx="${cx}" cy="${y-1.75}" r=".3" style="fill:var(--fg)"/>`,
  car: (cx, y, w, op) => `<g opacity="${op || .85}"><rect x="${cx-.9}" y="${y-1.35}" width="1.8" height=".85" rx=".25" style="fill:var(--fg)"/><rect x="${cx-.55}" y="${y-1.85}" width="1.1" height=".6" rx=".2" style="fill:var(--fg)"/><circle cx="${cx-.55}" cy="${y-.5}" r=".22" style="fill:var(--bg);stroke:var(--fg);stroke-width:.1"/><circle cx="${cx+.55}" cy="${y-.5}" r=".22" style="fill:var(--bg);stroke:var(--fg);stroke-width:.1"/></g>`,
  bus: (cx, y) => `<rect x="${cx-1.25}" y="${y-2.7}" width="2.5" height="2.2" rx=".3" style="fill:var(--m-bus)"/><rect x="${cx-1.05}" y="${y-2.45}" width="2.1" height=".75" rx=".1" style="fill:var(--bg)" opacity=".85"/><circle cx="${cx-.7}" cy="${y-.5}" r=".28" style="fill:var(--fg)"/><circle cx="${cx+.7}" cy="${y-.5}" r=".28" style="fill:var(--fg)"/>`,
  tram: (cx, y) => `<rect x="${cx-1.2}" y="${y-3.3}" width="2.4" height="2.8" rx=".4" style="fill:var(--fg)" opacity=".88"/><rect x="${cx-1}" y="${y-3.0}" width="2" height=".85" rx=".1" style="fill:var(--bg)" opacity=".85"/><path d="M${cx-.7} ${y}V${y-.5}M${cx+.7} ${y}V${y-.5}" style="stroke:var(--fg);stroke-width:.14"/>`,
  green: (cx, y, w) => { let s = ''; const n = Math.max(1, Math.min(4, Math.floor(w / 2.4))); for (let k = 0; k < n; k++) { const x = cx - w / 2 + w * (k + .5) / n, r = Math.min(w / n * .6, 1.3); s += `<rect x="${x-.1}" y="${y-1.3}" width=".2" height="1.3" style="fill:var(--m-casing)"/><circle cx="${x}" cy="${y-1.9}" r="${r}" style="fill:var(--m-green)"/>`; } return s; },
  median: (cx, y) => `<circle cx="${cx}" cy="${y-.5}" r=".5" style="fill:var(--m-green)" opacity=".8"/>`,
};
GL.bike2 = (cx, y) => GL.bike(cx - .75, y) + GL.bike(cx + .75, y);
GL.park = (cx, y, w) => GL.car(cx, y, w, .4);
GL.tramcar = (cx, y, w) => '<g opacity=".4">' + GL.tram(cx, y) + '</g>' + GL.car(cx, y, w, 1) + `<path d="M${cx-.9} ${y}H${cx+.9}" style="stroke:var(--fg);stroke-width:.14;stroke-dasharray:.3 .2"/>`;

function coupeSvg(p) {
  const sum = sumW(p), Wt = Math.max(p.W, sum), pad = 3, H = 10.4, g = 6.4;
  let s = `<svg viewBox="0 0 ${(Wt + 2 * pad).toFixed(2)} ${H}" role="img" aria-label="Coupe de la rue à l'échelle" style="width:100%;height:auto;display:block">`;
  s += `<rect x="0" y="${g-5.8}" width="${pad}" height="5.8" style="fill:var(--m-casing)" opacity=".55"/><rect x="${pad+p.W}" y="${g-5.8}" width="${pad}" height="5.8" style="fill:var(--m-casing)" opacity=".55"/>`;
  s += `<rect x="0" y="${g}" width="${Wt + 2 * pad}" height="1.2" style="fill:var(--m-casing)" opacity=".4"/>`;
  let x = pad;
  for (const it of p.items) {
    const d = ITEM[it.t], cx = x + it.w / 2;
    s += `<rect x="${x}" y="${g-.4}" width="${it.w}" height=".4" style="fill:var(${d.col})"/>`;
    s += (GL[it.t] || (() => ''))(cx, g - .4, it.w);
    if (it.w >= 1.2) s += `<text x="${cx}" y="${g+1.0}" text-anchor="middle" style="fill:var(--muted);font:.85px 'Barlow',sans-serif">${fmtM(it.w)}</text>`;
    s += `<path d="M${x} ${g}V${g+.25}" style="stroke:var(--bg);stroke-width:.06"/>`;
    x += it.w;
  }
  if (sum < p.W - .01) s += `<rect x="${pad+sum}" y="${g-1.2}" width="${p.W-sum}" height="1.2" style="fill:none;stroke:var(--muted);stroke-width:.08;stroke-dasharray:.3 .25"/>`;
  const ty = g + 2.7;
  s += `<path d="M${pad} ${ty-.3}V${ty+.3}M${pad} ${ty}H${pad+p.W}M${pad+p.W} ${ty-.3}V${ty+.3}" style="stroke:var(--fg);stroke-width:.08;fill:none"/>`;
  s += `<text x="${pad+p.W/2}" y="${ty-.5}" text-anchor="middle" style="fill:var(--fg);font:600 1px 'Barlow',sans-serif">${fmtM(p.W)} m</text></svg>`;
  return s;
}
function openCoupe() {
  if (!sel) return;
  cp = profileFor(sel.anchor, sel.cluster);
  $('#cName').textContent = ways[sel.anchor].name || 'Rue sans nom';
  $('#coupe').hidden = false; renderCoupe(true);
  $('#coupe .coupe-body').scrollTop = 0;
}
function closeCoupe() { $('#coupe').hidden = true; cp = null; }
function renderCoupe(full) {
  $('#cSvg').innerHTML = coupeSvg(cp);
  const sum = sumW(cp), diff = cp.W - sum, el = $('#cSum');
  el.className = 'impact' + (diff < -0.01 ? ' warn' : '');
  const note = (cp.est ? ' · largeur estimée, corrigez-la si vous la connaissez' : '') + (cp.shared ? ' · tram en voie partagée avec la voiture sur ' + cp.shared + (cp.shared > 1 ? ' voies' : ' voie') : '') + (cp.dropped ? ' · ' + cp.dropped + (cp.dropped > 1 ? ' voies de voiture retirées' : ' voie de voiture retirée') + ' pour faire entrer le tram' : '');
  el.textContent = 'Éléments : ' + fmtM(sum) + ' m sur ' + fmtM(cp.W) + ' m' + (diff > 0.01 ? ' · il reste ' + fmtM(diff) + ' m' : diff < -0.01 ? ' · dépasse de ' + fmtM(-diff) + ' m' : ' · largeur utilisée en totalité') + note;
  if (full) {
    $('#cW').value = cp.W;
    $('#cItems').innerHTML = cp.items.map((it, i) =>
      '<div class="it" data-i="' + i + '"><div class="l1"><i class="sw" style="--c:var(' + ITEM[it.t].col + ')"></i><select data-act="type" aria-label="Type d\'élément ' + (i + 1) + '">' +
      Object.keys(ITEM).map(k => '<option value="' + k + '"' + (k === it.t ? ' selected' : '') + '>' + ITEM[k].label + '</option>').join('') + '</select></div>' +
      '<button class="btn ico" data-act="del" type="button" aria-label="Supprimer l\'élément ' + (i + 1) + '">×</button>' +
      '<div class="l2"><button class="btn ico" data-act="minus" type="button" aria-label="Moins">−</button><input type="number" inputmode="decimal" step="0.05" min="0.3" max="40" value="' + it.w + '" data-act="w" aria-label="Largeur en mètres"><span>m</span><button class="btn ico" data-act="plus" type="button" aria-label="Plus">+</button></div>' +
      '<div class="ops"><button class="btn ico" data-act="up" type="button" aria-label="Déplacer vers la gauche"' + (i === 0 ? ' disabled' : '') + '>←</button><button class="btn ico" data-act="down" type="button" aria-label="Déplacer vers la droite"' + (i === cp.items.length - 1 ? ' disabled' : '') + '>→</button></div></div>'
    ).join('') || '<p class="sub">Aucun élément. Ajoutez-en ci-dessous.</p>';
  }
  const mode = modeFromProfile(cp);
  $('#cApplyNote').textContent = 'La rue passera en ' + MODE_TEXT[mode] + ' sur la carte (' + (sel && sel.scope === 'street' ? 'toute la rue' : 'ce tronçon') + ').';
}
function touchProfile(full) { cp.est = false; saveProfiles(); renderCoupe(full); }
function modeFromProfile(p) {
  const t = new Set(p.items.map(i => i.t));
  if (t.has('car') || t.has('tramcar')) return 'car';
  if (t.has('bus') || t.has('tram')) return 'bus';
  if (t.has('bike') || t.has('bike2')) return 'bike';
  return 'ped';
}
function initCoupeUi() {
  $('#cAdds').innerHTML = Object.keys(ITEM).map(k => '<button class="btn" type="button" data-add="' + k + '">+ ' + ITEM[k].label + '</button>').join('');
  $('#cPresets').innerHTML = [['est', 'Profil estimé'], ['car', 'Voitures et trottoirs'], ['bus', 'Bus et vélos'], ['tram', 'Tram, vélos, piétons'], ['soft', 'Sans voiture']].map(([k, l]) => '<button class="btn" type="button" data-preset="' + k + '">' + l + '</button>').join('');
  $('#cBack').addEventListener('click', closeCoupe);
  $('#cAdds').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cp.items.push({ t: b.dataset.add, w: ITEM[b.dataset.add].w }); touchProfile(true); });
  $('#cPresets').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const r = presetItems(b.dataset.preset, cp.W, ways[sel.anchor], sel.cluster); cp.items = r.items; cp.dropped = r.dropped.filter(x => x === 'car').length; cp.shared = r.dropped.filter(x => x === 'shared').length; touchProfile(true); if (b.dataset.preset === 'est') { cp.est = true; saveProfiles(); } });
  $('#cW').addEventListener('input', e => { const v = parseFloat(e.target.value); if (v >= 3 && v <= 80) { cp.W = v; touchProfile(false); } });
  $('#cFit').addEventListener('click', () => { cp.W = Math.round(sumW(cp) * 20) / 20; touchProfile(true); });
  $('#cItems').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.closest('.it').dataset.i, it = cp.items[i], a = b.dataset.act;
    if (a === 'del') cp.items.splice(i, 1);
    else if (a === 'minus') it.w = Math.max(0.3, Math.round((it.w - 0.25) * 100) / 100);
    else if (a === 'plus') it.w = Math.min(40, Math.round((it.w + 0.25) * 100) / 100);
    else if (a === 'up' && i > 0) [cp.items[i-1], cp.items[i]] = [cp.items[i], cp.items[i-1]];
    else if (a === 'down' && i < cp.items.length - 1) [cp.items[i+1], cp.items[i]] = [cp.items[i], cp.items[i+1]];
    else return;
    touchProfile(true);
  });
  $('#cItems').addEventListener('change', e => {
    const row = e.target.closest('.it'); if (!row) return; const it = cp.items[+row.dataset.i];
    if (e.target.dataset.act === 'type') { const keep = it.w === ITEM[it.t].w; it.t = e.target.value; if (keep) it.w = ITEM[it.t].w; touchProfile(true); }
    else if (e.target.dataset.act === 'w') { const v = parseFloat(e.target.value); if (v >= 0.3 && v <= 40) { it.w = v; touchProfile(true); } }
  });
  $('#cApply').addEventListener('click', () => {
    if (!sel) return; const mode = modeFromProfile(cp);
    setMode(mode); closeCoupe(); toast('Rue passée en ' + MODE_TEXT[mode]);
  });
}

/* ---------- Impact ---------- */
const BN = RAW.bd.length, bX = new Float32Array(BN), bY = new Float32Array(BN), bA = new Float32Array(BN);
let bTot = 0;
RAW.bd.forEach(([ix, iy, a], i) => { bX[i] = ix * 100 + 50; bY[i] = -(iy * 100 + 50); bA[i] = a; bTot += a; });
function coverMask(list, R) {
  const m = new Uint8Array(BN); if (!list.length) return m;
  const h = new Map(), key = (a, b) => a * 100003 + b;
  for (const p of list) { const k = key(Math.floor(p.x / R), Math.floor(p.y / R)); let l = h.get(k); if (!l) h.set(k, l = []); l.push(p); }
  for (let i = 0; i < BN; i++) {
    const cx = Math.floor(bX[i] / R), cy = Math.floor(bY[i] / R); let hit = false;
    for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) { const l = h.get(key(cx + a, cy + b)); if (!l) continue; for (const p of l) if (Math.hypot(p.x - bX[i], p.y - bY[i]) <= R) { hit = true; break; } }
    m[i] = hit ? 1 : 0;
  }
  return m;
}
function impactFor(tramStops, busStops) {
  const mt = coverMask(tramStops, 500), mb = coverMask(busStops, 300);
  let at = 0, ab = 0, aa = 0;
  for (let i = 0; i < BN; i++) { if (mt[i]) at += bA[i]; if (mb[i]) ab += bA[i]; if (mt[i] || mb[i]) aa += bA[i]; }
  const k = RAW.pop / bTot, place = pois.filter(p => IMPORTANT.includes(p.cat));
  const pm = coverMask(tramStops, 500);
  const near_ = place.filter(p => tramStops.some(s => Math.hypot(s.x - p.x, s.y - p.y) <= 500)).length;
  return { tram: at * k, bus: ab * k, any: aa * k, places: near_, nPlaces: place.length };
}
const sumModes = () => { const t = { car: 0, bus: 0, bike: 0, ped: 0 }; for (const w of ways) t[modeOf(w)] += w.len; return t; };
let baseImpact = null, baseModes = null, baseBusKm = 0, baseTramKm = 0;
function ensureBase() {
  if (baseImpact) return;
  baseModes = {}; for (const m of MODES) baseModes[m] = 0; for (const w of ways) baseModes[w.mode0] += w.len;
  const origWays = new Set(); for (const l of lines) if (l.exist && l.type === 'bus') for (const i of l.orig) origWays.add(i);
  baseBusKm = [...origWays].reduce((a, i) => a + ways[i].len, 0);
  baseTramKm = lines.filter(l => l.exist && l.type === 'tram').reduce((a, l) => a + l.len, 0);
  baseImpact = impactFor(pois.filter(p => p.cat === 'T'), bstops.filter(p => p.near.some(i => origWays.has(i))));
}
const fmtN = n => (Math.round(n / 100) * 100).toLocaleString('fr-FR');
const fmtKm1 = m => (m / 1000).toFixed(1).replace('.', ',') + ' km';
function kpi(label, before, after, fmt, goodUp, fmtD) {
  const d = after - before, same = Math.abs(d) < (fmt === fmtN ? 50 : 0.5), fd = fmtD || fmt;
  const dtxt = same ? 'inchangé' : (d > 0 ? '+' : '−') + fd(Math.abs(d));
  const cls = same ? '' : ((d > 0) === (goodUp !== false) ? 'up' : 'dn');
  return '<div class="kpi"><span>' + label + '</span><b>' + fmt(after) + '</b><small>avant : ' + fmt(before) + ' · <span class="' + cls + '" style="font-size:inherit">' + dtxt + '</span></small></div>';
}
const nSt = l => l.stops.filter(s => !s[3]).length;
function lineTime(l) {
  const speed = l.type === 'tram' || l.plan ? 20 : 15, stops = Math.max(0, nSt(l) - 1);
  return Math.round((l.len / (speed / 3.6) + stops * 25) / 60);
}
function renderImpact() {
  ensureBase();
  const cur = impactFor(stopsOf('tram'), stopsOf('bus')), md = sumModes();
  const busKm = [...busCount.keys()].reduce((a, i) => a + ways[i].len, 0);
  const tramKm = lines.filter(l => l.type === 'tram' && alive(l)).reduce((a, l) => a + l.len, 0);
  const nonCar = o => o.bus + o.bike + o.ped, mods = ov.size > 0;
  let html = '<div class="col" style="gap:10px"><div><h2>Impact de mon plan</h2><p class="sub">Comparé au réseau actuel. Habitants estimés d’après le bâti.</p></div><div class="kpis">';
  html += kpi('Habitants à 500 m d’un arrêt de tram', baseImpact.tram, cur.tram, fmtN);
  html += kpi('Habitants à 300 m d’un arrêt de bus', baseImpact.bus, cur.bus, fmtN);
  html += kpi('Habitants desservis (tram ou bus)', baseImpact.any, cur.any, fmtN);
  html += kpi('Lieux importants à 500 m du tram', baseImpact.places, cur.places, n => Math.round(n) + ' / ' + cur.nPlaces, true, n => String(Math.round(n)));
  html += kpi('Réseau de tram', baseTramKm, tramKm, fmtKm1);
  html += kpi('Réseau de bus (km de rues)', baseBusKm, busKm, fmtKm1);
  html += kpi('Rues ouvertes aux voitures', baseModes.car, md.car, fmtKm1, false);
  html += kpi('Rues sans voiture (bus, vélo, piéton)', nonCar(baseModes), nonCar(md), fmtKm1);
  html += '</div>';
  const made = lines.filter(l => !l.exist && alive(l));
  if (made.length) {
    html += '<div class="col" style="gap:6px"><h3>Lignes créées</h3>';
    for (const l of made) {
      const cost = l.type === 'tram' && !l.plan ? ' · ≈ ' + Math.round(l.len / 1000 * 20) + ' à ' + Math.round(l.len / 1000 * 30) + ' M€' : '';
      html += '<div class="trow"><i class="sw" style="--c:' + l.col + '"></i><span class="tname">' + esc(l.name) + '</span><small>' + fmtKm1(l.len) + ' · ' + nSt(l) + ' arrêts · ≈ ' + lineTime(l) + ' min' + (l.plan ? ' · en construction' : cost) + '</small></div>';
    }
    html += '</div>';
  }
  html += '<p class="note">Ordres de grandeur : population de la métropole (≈ ' + RAW.pop.toLocaleString('fr-FR') + ' hab.) répartie selon l’emprise du bâti OpenStreetMap ; distances à vol d’oiseau ; trajets à 20 km/h (tram) et 15 km/h (bus) arrêts compris ; coût du tram de 20 à 30 M€ par km, fourchette courante en France. Pas une étude de trafic.</p></div>';
  $('#impactBox').innerHTML = html;
}

/* ---------- Interface ---------- */
const fmtLen = m => m < 1000 ? (Math.max(10, Math.round(m / 10) * 10)) + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
const fmtKm = m => Math.round(m / 1000).toLocaleString('fr-FR') + ' km';
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

function renderStats() {
  const tot = sumModes();
  let html = MODES.map(m => '<li><i class="sw" style="--c:' + (m === 'car' ? 'var(--m-carsw)' : 'var(--m-' + m + ')') + '"></i><div><b>' + fmtKm(tot[m]) + '</b> <span>' + (m === 'bus' ? 'Réservé bus' : MODE_LABEL[m]) + '</span></div></li>').join('');
  const tl = lines.filter(l => l.type === 'tram' && alive(l)).reduce((a, l) => a + l.len, 0);
  html += '<li><i class="sw" style="--c:var(--fg)"></i><div><b>' + (tl / 1000).toFixed(1).replace('.', ',') + ' km</b> <span>Tram</span></div></li>';
  const bk = [...busCount.keys()].reduce((a, i) => a + ways[i].len, 0);
  html += '<li><i class="sw" style="--c:var(--m-busl)"></i><div><b>' + Math.round(bk / 1000) + ' km</b> <span>Lignes de bus</span></div></li>';
  $('#stats').innerHTML = html;
  const n = ov.size, len = [...ov.keys()].reduce((a, i) => a + ways[i].len, 0), made = lines.filter(l => !l.exist).length;
  const parts = [];
  if (n) parts.push(n + (n > 1 ? ' tronçons modifiés' : ' tronçon modifié') + ' · ' + fmtLen(len));
  if (made) parts.push(made + (made > 1 ? ' lignes créées' : ' ligne créée'));
  const edited = lines.filter(l => l.exist && (l.deleted || (l.orig && (l.ways.size !== l.orig.size || [...l.ways].some(i => !l.orig.has(i)))))).length;
  if (edited) parts.push(edited + (edited > 1 ? ' lignes modifiées' : ' ligne modifiée'));
  $('#modcount').textContent = parts.length ? parts.join(' · ') : 'Aucune modification';
  const any = parts.length > 0;
  $('#copy').disabled = !any; $('#undo').disabled = !undoStack.length; $('#reset').disabled = !any && !Object.keys(profiles).length;
}

const busSort = (a, b) => (parseInt(a.ref) || 999) - (parseInt(b.ref) || 999) || a.ref.localeCompare(b.ref);
function chipFor(l) { return '<button class="chip sm' + (l.deleted ? ' off' : '') + (activeLine === l ? ' on' : '') + '" type="button" data-id="' + l.id + '" style="--c:' + l.col + '"><i class="dot"></i>' + esc(l.exist ? (l.type === 'tram' ? l.name : l.ref) : l.name) + '</button>'; }
function renderLinesTab() {
  const tr = lines.filter(l => l.type === 'tram'), bu = lines.filter(l => l.type === 'bus' && l.exist).sort(busSort), bn = lines.filter(l => l.type === 'bus' && !l.exist);
  $('#lnTram').innerHTML = tr.map(chipFor).join('') || '<span class="sub">Aucune ligne</span>';
  $('#lnBus').innerHTML = bn.map(chipFor).join('') + bu.map(chipFor).join('');
  const l = activeLine, card = $('#lineCard');
  card.hidden = !l;
  if (!l) return;
  const info = [];
  const km = l.type === 'bus' || !l.exist ? [...l.ways].reduce((a, i) => a + ways[i].len, 0) : l.len;
  if (l.type === 'bus' && l.exist) info.push(fmtLen(km) + ' de rues · ' + l.ways.size + ' tronçons'); else info.push(fmtLen(l.len) + (l.stops.length ? ' · ' + nSt(l) + ' arrêts · ≈ ' + lineTime(l) + ' min' : ''));
  if (l.exist) info.push(l.type === 'tram' ? 'Tram existant' : 'Fil Bleu, existant'); else if (l.plan) info.push('En construction' + (l.type === 'tram' ? ', mise en service prévue vers 2028' : ', remplace la ligne de bus 2'));
  if (l.defDel) info.push('remplacée par le BHNS');
  const modified = l.orig && (l.ways.size !== l.orig.size || [...l.ways].some(i => !l.orig.has(i)));
  let btns = '<button class="btn sm" data-act="view" type="button">Voir sur la carte</button>';
  if (l.type === 'bus') btns += '<button class="btn sm" data-act="iso" type="button">' + (FL.busRef === l.id ? 'Afficher toutes' : 'Isoler') + '</button>';
  if (!l.exist && !l.plan) btns += '<button class="btn sm" data-act="ext" type="button">Prolonger</button>';
  if (modified) btns += '<button class="btn sm" data-act="orig" type="button">Rétablir le tracé</button>';
  btns += '<button class="btn sm" data-act="del" type="button">' + (l.deleted ? 'Rétablir la ligne' : 'Supprimer') + '</button>';
  card.innerHTML = '<div class="card"><h4><i class="dot" style="--c:' + l.col + '"></i>' + esc(lbl(l)) + (l.exist && l.type === 'bus' ? ' <small style="font:400 13px var(--f-body);color:var(--muted)">' + esc(l.name.replace(/^Bus (Tempo )?\S+ ?: ?/, '')) + '</small>' : '') + '</h4><p class="impact">' + esc(info.join(' · ')) + (l.deleted ? (l.defDel ? ' · retirée du réseau (remplacée par le BHNS)' : ' · supprimée') : '') + (modified ? ' · tracé modifié' : '') + '</p><div class="row">' + btns + '</div></div>';
}
function setActive(l, zoom) {
  activeLine = l;
  if (l && l.type === 'bus') { FL.bus = true; FL.busRef = l.id; } else if (l && l.type === 'tram') FL.tram = true;
  if (l && zoom) fitLine(l);
  renderFilters(); renderSheet(); requestDraw();
}
function fitLine(l) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const pts = []; for (const i of l.ways) pts.push(ways[i].bb);
  if (l.exist && l.type === 'tram') for (const id of l.tw) pts.push(tramById.get(id).bb);
  for (const s of l.segs || []) for (let j = 0; j < s.length; j += 2) pts.push([s[j], s[j+1], s[j], s[j+1]]);
  for (const b of pts) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  if (x0 > 1e8) return;
  view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
  view.s = clampScale(Math.min(view.w / (x1 - x0 + 600), view.h / (y1 - y0 + 600)));
}

function renderSheet() {
  renderStats();
  const v = drawMode ? 'tramdraw' : sel ? 'edit' : selPoi ? 'poi' : 'idle';
  for (const x of ['idle', 'edit', 'poi', 'tramdraw']) $('#' + x).hidden = x !== v;
  if (v === 'idle') {
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === tab));
    for (const t of ['map', 'lines', 'impact']) $('#tab-' + t).hidden = t !== tab;
    if (tab === 'lines') renderLinesTab();
    if (tab === 'impact') renderImpact();
  } else if (v === 'tramdraw') {
    const m = drawMode, n = m.type === 'tram' ? 'tram' : 'bus';
    $('#tTitle').textContent = (m.edit ? 'Prolonger la ligne de ' : 'Nouvelle ligne de ') + n;
    $('#tInfo').textContent = m.stops.length + (m.stops.length > 1 ? ' arrêts' : ' arrêt') + (m.len ? ' · ' + fmtLen(m.len) + ' · ≈ ' + Math.max(1, Math.round((m.len / ((n === 'tram' ? 20 : 15) / 3.6) + (m.stops.length - 1) * 25) / 60)) + ' min' : '');
    $('#tDone').disabled = m.stops.length < 2; $('#tUndo').disabled = !m.stops.length || (m.edit && m.stops.length <= m.edit.stops.length && false);
    $('#tHint').textContent = m.stops.length ? 'Touchez l’arrêt suivant, ou un arrêt existant pour y raccorder la ligne. Le tracé suit les rues, sans tenir compte des sens.' : 'Touchez le premier arrêt : une rue, un lieu ou un arrêt existant.';
  } else if (v === 'poi') {
    $('#pName').textContent = selPoi.name; $('#pCat').textContent = CAT[selPoi.cat];
    const ls = linesAtStop(selPoi), el = $('#pLines');
    el.hidden = !ls.length; el.textContent = ls.length ? 'Lignes : ' + ls.map(lbl).join(', ') : '';
  } else if (v === 'edit') {
    const w = ways[sel.anchor], ids = idsOfSel();
    $('#name').textContent = w.name || 'Rue sans nom';
    const meta = [CLASS_NAME[w.c] || 'Rue'];
    if (w.lanes) meta.push(w.lanes + (w.lanes > 1 ? ' voies' : ' voie'));
    if (w.speed) meta.push(w.speed + ' km/h');
    if (w.bridge) meta.push('pont');
    $('#meta').textContent = meta.join(' · ');
    const segLen_ = w.len, stLen = sel.cluster.reduce((a, i) => a + ways[i].len, 0);
    const [b0, b1] = document.querySelectorAll('#scope button');
    b0.textContent = 'Ce tronçon · ' + fmtLen(segLen_);
    b1.textContent = 'Toute la rue · ' + fmtLen(stLen);
    b1.disabled = sel.cluster.length < 2;
    b0.setAttribute('aria-pressed', sel.scope === 'segment'); b1.setAttribute('aria-pressed', sel.scope === 'street');
    const modes = new Set(ids.map(i => modeOf(ways[i])));
    document.querySelectorAll('#modes .mode').forEach(b => b.setAttribute('aria-pressed', modes.size === 1 && modes.has(b.dataset.mode)));
    const roadish = ids.some(i => { const m = modeOf(ways[i]); return m === 'car' || m === 'bus'; });
    $('#wayrow').hidden = !roadish;
    const allOne = ids.every(i => onewayOf(ways[i]) !== 0), someOne = ids.some(i => onewayOf(ways[i]) !== 0);
    $('#oneway').checked = allOne; $('#invert').hidden = !someOne;
    const total = ids.reduce((a, i) => a + ways[i].len, 0), changed = ids.filter(i => ov.has(i)).length;
    $('#impact').textContent = ids.length + (ids.length > 1 ? ' tronçons' : ' tronçon') + ' · ' + fmtLen(total) + (changed ? ' · ' + changed + ' modifié' + (changed > 1 ? 's' : '') : '');
    const pr = profiles[profKey(sel.cluster)];
    $('#openCoupe').textContent = pr && !pr.est ? 'Modifier la coupe de la rue' : 'Dessiner la coupe de la rue';
    renderOnStreet(ids);
  }
}
function renderOnStreet(ids) {
  const set = new Set(ids), tn = [];
  for (const l of lines) {
    if (l.type !== 'tram' || !alive(l)) continue;
    if (l.exist ? [...l.tw].some(id => (tramStreets.get(id) || []).some(i => set.has(i))) : [...l.ways].some(i => set.has(i))) tn.push(l.name);
  }
  const bl = lines.filter(l => l.type === 'bus' && alive(l) && ids.some(i => l.ways.has(i))).sort(busSort);
  const addable = lines.filter(l => l.type === 'bus' && alive(l) && !ids.every(i => l.ways.has(i))).sort(busSort);
  $('#tramOn').hidden = !tn.length; $('#tramOn').textContent = tn.length ? 'Tram : ' + tn.join(', ') + ' · visible dans la coupe' : '';
  $('#busOn').innerHTML = bl.map(l => '<button class="chip sm" type="button" data-id="' + l.id + '" style="--c:' + l.col + '" aria-label="Retirer ' + esc(lbl(l)) + ' de cette rue"><i class="dot"></i>' + esc(l.exist ? l.ref : l.name) + ' ×</button>').join('');
  $('#busAdd').innerHTML = '<option value="">+ Ajouter une ligne de bus ici…</option>' + addable.map(l => '<option value="' + l.id + '">' + esc(lbl(l)) + (l.exist ? ' · ' + esc(l.name.replace(/^[^:]*: ?/, '')) : '') + '</option>').join('');
  $('#onStreet').hidden = !tn.length && !bl.length && !addable.length;
}
function editBus(id, add) {
  const l = lines.find(x => x.id === id); if (!l || !sel) return;
  pushSnap();
  for (const i of idsOfSel()) { if (add) l.ways.add(i); else l.ways.delete(i); }
  l.len = [...l.ways].reduce((a, i) => a + ways[i].len, 0);
  if (!l.exist) { /* ligne créée : les arrêts restent, le tracé suit les tronçons */ }
  FL.bus = true; refreshLines(); saveLines(); renderFilters(); renderSheet(); requestDraw();
}
function linesAtStop(p) {
  const out = new Set(p.lines);
  if (p.cat === 'T') for (const l of lines) if (l.exist && l.type === 'tram' && alive(l) && near(tgrid, tramWays, p.x, p.y, 60).some(([i]) => l.tw.has(tramWays[i].id))) out.add(l);
  if (p.cat === 'B') for (const l of lines) if (l.type === 'bus' && alive(l) && p.near.some(i => l.ways.has(i))) out.add(l);
  return [...out].sort((a, b) => (a.type === b.type ? 0 : a.type === 'tram' ? -1 : 1) || busSort(a, b));
}

function fitTo(ids) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const i of ids) { const b = ways[i].bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
  view.s = clampScale(Math.min(view.w / (x1 - x0 + 300), view.h / (y1 - y0 + 300)));
}
function flyTo(x, y, s) { view.cx = x; view.cy = y; view.s = clampScale(Math.max(view.s, s)); requestDraw(); }

/* ---------- Calques ---------- */
function renderFilters() {
  $('#lyPoi').checked = FL.poi; $('#lyTram').checked = FL.tram; $('#lyBus').checked = FL.bus; $('#lySmall').checked = FL.small;
  $('#lyArrows').checked = FL.arrows; $('#lyCov').checked = FL.cov; $('#lyStops').checked = FL.stops;
  const nb = lines.filter(l => l.type === 'bus' && alive(l)).length;
  $('#lyBusN').textContent = nb + ' lignes'; $('#lyTramN').textContent = lines.filter(l => l.type === 'tram' && alive(l)).length + ' ligne(s)';
  const bf = $('#busFilter'); bf.hidden = !FL.bus;
  if (FL.bus) bf.innerHTML = '<button class="chip sm' + (FL.busRef ? '' : ' on') + '" type="button" data-id="">Toutes</button>' + lines.filter(l => l.type === 'bus').sort(busSort).map(l => '<button class="chip sm' + (FL.busRef === l.id ? ' on' : '') + (l.deleted ? ' off' : '') + '" type="button" data-id="' + l.id + '" style="--c:' + l.col + '"><i class="dot"></i>' + esc(l.exist ? l.ref : l.name) + '</button>').join('');
  $('#catFilter').innerHTML = IMPORTANT.map(c => '<button class="chip sm' + (FL.cats[c] ? ' on' : '') + '" type="button" data-cat="' + c + '" aria-pressed="' + !!FL.cats[c] + '"><b>' + c + '</b>' + CAT[c].replace('Gare ou pôle d’échange', 'Gares').replace('Enseignement supérieur', 'Enseignement').replace('Culture et patrimoine', 'Culture').replace('Équipement ou loisirs', 'Équipements').replace('Centre commercial', 'Commerces').replace('Aéroport', 'Aéroport').replace('Hôpital', 'Hôpitaux') + '</button>').join('');
  $('#fltBtn').classList.toggle('on', !$('#flt').hidden);
  lsSet(STORE_F, { poi: FL.poi, tram: FL.tram, bus: FL.bus, small: FL.small, arrows: FL.arrows, cov: FL.cov, stops: FL.stops, cats: FL.cats });
}

/* recherche : rues et lieux */
const streetList = [...byName].map(([n, l]) => ({ kind: 's', n, k: norm(n), l, tot: l.reduce((a, i) => a + ways[i].len, 0) }));
const poiList = pois.map(p => ({ kind: 'p', n: p.name, k: norm(p.name), p }));
$('#q').addEventListener('input', e => {
  const q = norm(e.target.value.trim()), box = $('#res');
  if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  const hits = [...poiList, ...streetList].filter(x => x.k.includes(q))
    .sort((a, b) => (b.k.startsWith(q) - a.k.startsWith(q)) || ((a.kind === 'p') !== (b.kind === 'p') ? (a.kind === 'p' ? -1 : 1) : 0) || ((b.tot || 0) - (a.tot || 0))).slice(0, 7);
  box.innerHTML = '';
  for (const h of hits) {
    const b = document.createElement('button'); b.type = 'button';
    const n = document.createElement('span'); n.textContent = h.n;
    const s = document.createElement('small'); s.textContent = h.kind === 'p' ? CAT[h.p.cat] : 'Rue · ' + fmtLen(h.tot);
    b.append(n, s);
    b.addEventListener('click', () => {
      if (h.kind === 'p') { FL.poi = true; renderFilters(); selectPoi(h.p); flyTo(h.p.x, h.p.y, 0.7); }
      else { const anchor = h.l.reduce((a, i) => ways[i].len > ways[a].len ? i : a, h.l[0]); FL.small = true; renderFilters(); select(anchor); fitTo(sel.cluster); requestDraw(); }
      $('#q').value = ''; box.hidden = true; box.innerHTML = '';
    });
    box.append(b);
  }
  box.hidden = !hits.length;
});

/* raccourcis vers les lieux importants */
function renderPlaces() {
  const top = pois.filter(p => IMPORTANT.includes(p.cat)).sort((a, b) => CAT_PRIO[a.cat] - CAT_PRIO[b.cat]).slice(0, 14);
  $('#places').innerHTML = top.map(p => '<button class="chip" type="button" data-i="' + pois.indexOf(p) + '"><b>' + p.cat + '</b>' + esc(p.name) + '</button>').join('');
  const cats = IMPORTANT.filter(c => pois.some(p => p.cat === c));
  $('#legend').innerHTML = cats.map(c => '<b>' + c + '</b> ' + CAT[c].toLowerCase()).join(' · ');
}
$('#places').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const p = pois[+b.dataset.i]; FL.poi = true; FL.cats[p.cat] = 1; renderFilters();
  selectPoi(p); flyTo(p.x, p.y, 0.6);
});

/* copie du plan */
function planText() {
  const g = new Map(), out = ['Mon plan, Atelier des rues de Tours'];
  for (const [i, e] of ov) {
    const w = ways[i], what = [];
    if (e.m !== w.mode0) what.push(MODE_TEXT[e.m]);
    if ((e.m === 'car' || e.m === 'bus') && e.o !== w.o) what.push(e.o ? 'sens unique' : 'double sens');
    if (!what.length) continue;
    const k = (w.name || 'Rue sans nom') + ' : ' + what.join(', ');
    g.set(k, (g.get(k) || 0) + w.len);
  }
  const rl = [...g].sort((a, b) => b[1] - a[1]).map(([k, l]) => '- ' + k + ' (' + fmtLen(l) + ')');
  if (rl.length) out.push('Rues', ...rl);
  const made = lines.filter(l => !l.exist && !l.plan);
  if (made.length) out.push('Lignes créées', ...made.map(l => '- ' + l.name + ' (' + l.type + ') : ' + fmtLen(l.len) + ', ' + nSt(l) + ' arrêts, ≈ ' + lineTime(l) + ' min'));
  const ed = [];
  for (const l of lines) {
    if (!l.exist) continue;
    if (l.deleted) { ed.push('- ' + lbl(l) + ' supprimée'); continue; }
    if (l.orig) { const add = [...l.ways].filter(i => !l.orig.has(i)), rm = [...l.orig].filter(i => !l.ways.has(i)); if (add.length || rm.length) ed.push('- ' + lbl(l) + ' : +' + fmtLen(add.reduce((a, i) => a + ways[i].len, 0)) + ', −' + fmtLen(rm.reduce((a, i) => a + ways[i].len, 0))); }
  }
  if (ed.length) out.push('Lignes existantes modifiées', ...ed);
  const cps = [];
  for (const [key, p] of Object.entries(profiles)) {
    if (p.est) continue;
    const i = byId.get(+key); if (i === undefined) continue;
    cps.push('- ' + (ways[i].name || 'Rue sans nom') + ' (' + fmtM(p.W) + ' m) : ' + p.items.map(it => ITEM[it.t].label.toLowerCase() + ' ' + fmtM(it.w)).join(', '));
  }
  if (cps.length) out.push('Coupes de rue', ...cps);
  return out.join('\n');
}
$('#copy').addEventListener('click', async () => {
  const text = planText(), box = $('#copybox');
  try { await navigator.clipboard.writeText(text); box.hidden = true; toast('Plan copié'); }
  catch (e) { box.value = text; box.hidden = false; box.focus(); box.select(); }
});

/* ---------- Événements ---------- */
$('#undo').addEventListener('click', undo);
$('#reset').addEventListener('click', resetAll);
$('#close').addEventListener('click', clearSel);
$('#pClose').addEventListener('click', clearSel);
$('#pZoom').addEventListener('click', () => { if (selPoi) flyTo(selPoi.x, selPoi.y, 1.0); });
function poiStart(type) {
  const p = selPoi; if (!p) return;
  const own = type === 'tram' ? (p.cat === 'T' || p.cat === 'N') : (p.cat === 'B' || p.cat === 'Q');
  let first = null;
  if (own) { const id = nodeOfStop(p.la, p.lo, type); if (id !== undefined) first = { id, la: p.la, lo: p.lo }; }
  else first = nearestNode(p.x, p.y, 90, type);
  if (!first) { toast('Aucune rue proche de ce lieu'); return; }
  startLine(type, first);
}
$('#pTram').addEventListener('click', () => poiStart('tram'));
$('#pBus').addEventListener('click', () => poiStart('bus'));
$('#scope').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled || !sel) return; sel.scope = b.dataset.scope; rebuildSel(); renderSheet(); requestDraw(); });
$('#modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b && sel) setMode(b.dataset.mode); });
$('#oneway').addEventListener('change', e => { if (sel) setOneway(e.target.checked); });
$('#invert').addEventListener('click', invertOneway);
$('#openCoupe').addEventListener('click', openCoupe);
$('#busOn').addEventListener('click', e => { const b = e.target.closest('button'); if (b) editBus(b.dataset.id, false); });
$('#busAdd').addEventListener('change', e => { if (e.target.value) editBus(e.target.value, true); });
$('#zin').addEventListener('click', () => zoomAt(view.w / 2, view.h / 2, 1.6));
$('#zout').addEventListener('click', () => zoomAt(view.w / 2, view.h / 2, 1 / 1.6));
$('#home').addEventListener('click', () => { view.cx = HOME.cx; view.cy = HOME.cy; view.s = HOME.s; requestDraw(); });
$('#wide').addEventListener('click', () => { view.cx = WIDE.cx; view.cy = WIDE.cy; view.s = clampScale(Math.min(WIDE.s, view.w / 30000)); requestDraw(); });
function fitFlt() { $('#flt').style.maxHeight = Math.max(160, $('#stage').clientHeight - 16) + 'px'; }
$('#fltBtn').addEventListener('click', () => { $('#flt').hidden = !$('#flt').hidden; fitFlt(); renderFilters(); });
$('#fltClose').addEventListener('click', () => { $('#flt').hidden = true; renderFilters(); });
const bindLy = (id, key) => $(id).addEventListener('change', e => { FL[key] = e.target.checked; if (key === 'poi' && !FL.poi && selPoi) { selPoi = null; renderSheet(); } if (key === 'small' && !FL.small && sel && SMALL.has(ways[sel.anchor].c)) clearSel(); if (key === 'bus' && !FL.bus) FL.busRef = null; renderFilters(); requestDraw(); });
bindLy('#lyPoi', 'poi'); bindLy('#lyTram', 'tram'); bindLy('#lyBus', 'bus'); bindLy('#lySmall', 'small'); bindLy('#lyArrows', 'arrows'); bindLy('#lyCov', 'cov'); bindLy('#lyStops', 'stops');
$('#catFilter').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; FL.cats[b.dataset.cat] = FL.cats[b.dataset.cat] ? 0 : 1; renderFilters(); requestDraw(); });
$('#busFilter').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (!b.dataset.id) { FL.busRef = null; activeLine = activeLine && activeLine.type === 'bus' ? null : activeLine; renderFilters(); renderSheet(); requestDraw(); }
  else setActive(lines.find(l => l.id === b.dataset.id), false);
});
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; renderSheet(); });
$('#tramBtn').addEventListener('click', () => { if (drawMode && drawMode.type === 'tram') endLine(false); else { if (drawMode) endLine(false); startLine('tram'); } });
$('#busBtn').addEventListener('click', () => { if (drawMode && drawMode.type === 'bus') endLine(false); else { if (drawMode) endLine(false); startLine('bus'); } });
$('#newTram').addEventListener('click', () => startLine('tram'));
$('#newBus').addEventListener('click', () => startLine('bus'));
$('#tUndo').addEventListener('click', popStop);
$('#tDone').addEventListener('click', () => endLine(true));
$('#tCancel').addEventListener('click', () => endLine(false));
function lineChipClick(e) { const b = e.target.closest('button'); if (!b) return; const l = lines.find(x => x.id === b.dataset.id); if (l) setActive(activeLine === l ? null : l, true); }
$('#lnTram').addEventListener('click', lineChipClick);
$('#lnBus').addEventListener('click', lineChipClick);
$('#lineCard').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !activeLine) return; const l = activeLine, a = b.dataset.act;
  if (a === 'view') fitLine(l);
  else if (a === 'iso') { FL.busRef = FL.busRef === l.id ? null : l.id; FL.bus = true; renderFilters(); }
  else if (a === 'ext') { startLine(l.type, null, l); return; }
  else if (a === 'orig') { pushSnap(); l.ways = new Set(l.orig); l.len = [...l.ways].reduce((s, i) => s + ways[i].len, 0); refreshLines(); saveLines(); }
  else if (a === 'del') { pushSnap(); l.deleted = !l.deleted; if (l.deleted && FL.busRef === l.id) FL.busRef = null; if (!l.exist && !l.plan && l.deleted) { lines = lines.filter(x => x !== l); activeLine = null; } refreshLines(); saveLines(); toast(l.deleted ? lbl(l) + ' supprimée' : lbl(l) + ' rétablie'); renderFilters(); }
  renderSheet(); requestDraw();
});
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#coupe').hidden) closeCoupe(); else if (drawMode) endLine(false); else if (!$('#flt').hidden) { $('#flt').hidden = true; renderFilters(); } else clearSel();
});

/* ---------- Gestes ---------- */
const ptrs = new Map(); let down = null, pinch = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (ptrs.size === 1) down = { x: e.offsetX, y: e.offsetY, cx: view.cx, cy: view.cy, moved: false, t: performance.now() };
  else if (ptrs.size === 2) {
    down = null;
    const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s, w: toWorld(mx, my) };
  }
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  p.x = e.offsetX; p.y = e.offsetY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.s = clampScale(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
    view.cx = pinch.w[0] - (mx - view.w / 2) / view.s; view.cy = pinch.w[1] - (my - view.h / 2) / view.s;
    requestDraw();
  } else if (ptrs.size === 1 && down) {
    const dx = p.x - down.x, dy = p.y - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 6) down.moved = true;
    if (down.moved) { view.cx = down.cx - dx / view.s; view.cy = down.cy - dy / view.s; requestDraw(); }
  }
});
function poiAt(x, y, kinds) {
  let best = null, bd = 1e9;
  for (const it of poiVis) { if (kinds && !kinds.includes(it.p.cat)) continue; const d = Math.hypot(it.sx - x, it.sy - y); if (d <= it.r + 9 && d < bd) { bd = d; best = it.p; } }
  return best;
}
function tap(x, y) {
  const [wx, wy] = toWorld(x, y), tolM = Math.min(120, Math.max(8, 26 / view.s));
  if (drawMode) {
    const kind = drawMode.type, sp = poiAt(x, y, kind === 'tram' ? ['T', 'N'] : ['B', 'Q']), p = sp ? null : poiAt(x, y);
    let nd = null;
    if (sp) { const id = nodeOfStop(sp.la, sp.lo, kind); if (id !== undefined) nd = { id, la: sp.la, lo: sp.lo }; }
    else if (p) nd = nearestNode(p.x, p.y, 90, kind);
    else nd = nearestNode(wx, wy, tolM, kind);
    if (!nd) { toast('Touchez une rue, un lieu ou un arrêt'); return; }
    addStop(nd); return;
  }
  const p = poiAt(x, y);
  if (p) { selectPoi(p); return; }
  const hit = hitTest(wx, wy);
  if (hit >= 0) select(hit); else clearSel();
}
function endPtr(e, cancel) {
  const had = ptrs.delete(e.pointerId);
  if (had && ptrs.size === 0 && down && !down.moved && !cancel && performance.now() - down.t < 700) tap(down.x, down.y);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) down = null;
}
canvas.addEventListener('pointerup', e => endPtr(e, false));
canvas.addEventListener('pointercancel', e => endPtr(e, true));
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

/* ---------- Démarrage ---------- */
function loadState() {
  for (const [id, m, o] of lsGet(STORE) || []) {
    const i = byId.get(id); if (i === undefined || !MODES.includes(m)) continue;
    ov.set(i, { m, o: o === 1 || o === -1 ? o : 0 });
  }
  for (const w of ways) modeArr[w.idx] = MODE_CODE[modeOf(w)];
  const c = lsGet(STORE_C); if (c && typeof c === 'object') profiles = c;
  const f = lsGet(STORE_F); if (f && typeof f === 'object') { for (const k of ['poi', 'tram', 'bus', 'small', 'arrows', 'cov', 'stops']) if (typeof f[k] === 'boolean') FL[k] = f[k]; if (f.cats) for (const c2 of IMPORTANT) if (c2 in f.cats) FL.cats[c2] = f.cats[c2] ? 1 : 0; }
  { const l = { id: 'plan-l2', type: 'tram', exist: false, plan: true, ref: '', name: 'Ligne 2 (en construction)', col: '#00838F', stops: PLAN_L2.map(s => s.slice()), segs: [], len: 0, ways: new Set(), deleted: false }; computeSegs(l); lines.push(l); }
  { const l = { id: 'plan-bhns', type: 'bus', exist: false, plan: true, ref: '', name: 'BHNS (ex-ligne 2, en construction)', col: '#6FB50F', stops: PLAN_BHNS.map(s => s.slice()), segs: [], len: 0, ways: new Set(), deleted: false }; computeSegs(l); lines.push(l); const b2 = lines.find(x => x.id === 'b:2'); if (b2) { b2.defDel = true; b2.deleted = true; } }
  const L = lsGet(STORE_L);
  if (L) {
    for (const e of L.ed || []) {
      const l = lines.find(x => x.id === e.id); if (!l) continue;
      l.deleted = !!e.d;
      if (l.orig) { for (const id of e.rm || []) { const i = byId.get(id); if (i !== undefined) l.ways.delete(i); } for (const id of e.ad || []) { const i = byId.get(id); if (i !== undefined) l.ways.add(i); } l.len = [...l.ways].reduce((a, i) => a + ways[i].len, 0); }
    }
    for (const c2 of L.cr || []) {
      if (!c2 || !Array.isArray(c2.s) || c2.s.length < 2) continue;
      const l = { id: 'c' + Math.random().toString(36).slice(2, 8), type: c2.t === 'bus' ? 'bus' : 'tram', exist: false, ref: '', name: String(c2.n || 'Ligne'), col: c2.c || '#D32F2F', stops: c2.s.filter(s => Array.isArray(s) && s.length === 2), segs: [], len: 0, ways: new Set(), deleted: false };
      computeSegs(l); lines.push(l);
    }
  } else {
    for (const t of lsGet(STORE_T) || []) {    // anciennes lignes de tram (v1)
      if (!t || !Array.isArray(t.s) || t.s.length < 2) continue;
      const l = { id: 'c' + Math.random().toString(36).slice(2, 8), type: 'tram', exist: false, ref: '', name: String(t.n || 'Ligne'), col: colorFor('tram'), stops: t.s.filter(s => Array.isArray(s) && s.length === 2), segs: [], len: 0, ways: new Set(), deleted: false };
      computeSegs(l); lines.push(l);
    }
  }
}
const saveState = () => lsSet(STORE, [...ov].map(([i, e]) => [ways[i].id, e.m, e.o]));
readColors(); loadState(); rebuildPaths(); refreshLines(); renderPlaces(); initCoupeUi(); renderFilters();
renderSheet();
new ResizeObserver(resize).observe($('#stage')); resize();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); requestDraw(); });
new MutationObserver(() => { readColors(); requestDraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { textW.clear(); requestDraw(); });
window.__atelier = { poiVisList: () => poiVis.map(i => [i.p.cat, i.p.name, i.r]), requestDraw, select, selectPoi, profiles: () => profiles, lines: () => lines, FL, view, ways, pois, toScreen, route, buildGraph, nodeOfStop, newStops: () => newStops };
})();
</script>
