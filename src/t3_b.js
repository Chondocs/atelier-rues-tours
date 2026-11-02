<script>
(() => {
'use strict';
const $ = s => document.querySelector(s);
const RAW = JSON.parse($('#data').textContent);

/* ---------- Projection locale en mètres ---------- */
const LAT0 = 47.3945, LON0 = 0.693;
const KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KY = 110540;
const toX = lo5 => (lo5 / 1e5 - LON0) * KX, toY = la5 => -(la5 / 1e5 - LAT0) * KY;

/* ---------- Tables ---------- */
const EDITABLE = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','pedestrian','cycleway','busway']);
const WIDTH = { motorway:18, motorway_link:8, trunk:14, trunk_link:8, primary:12, primary_link:7, secondary:10, secondary_link:6, tertiary:8, tertiary_link:6, unclassified:6, residential:6, living_street:5, pedestrian:5, cycleway:3.5, busway:7 };
const MINPX = { motorway:2.6, motorway_link:1.6, trunk:2.4, trunk_link:1.5, primary:2.0, primary_link:1.4, secondary:1.6, secondary_link:1.2, tertiary:1.3, tertiary_link:1.1, unclassified:1, residential:1, living_street:1, pedestrian:1.2, cycleway:1.1, busway:1.4 };
const ORDER = ['living_street','residential','unclassified','pedestrian','cycleway','tertiary_link','tertiary','secondary_link','secondary','primary_link','primary','trunk_link','trunk','motorway_link','motorway','busway'];
const LABEL_MIN = { motorway:.2, trunk:.22, primary:.22, secondary:.3, tertiary:.5, unclassified:.9, residential:.9, living_street:.9, pedestrian:.9, cycleway:1.4, busway:.9 };
const CLASS_MINZ = { motorway:0, motorway_link:.05, trunk:0, trunk_link:.05, primary:0, primary_link:.06, secondary:.018, secondary_link:.08, tertiary:.04, tertiary_link:.1, unclassified:.09, residential:.09, living_street:.12, pedestrian:.1, cycleway:.09, busway:.03 };
const CLS_MULT = { motorway_link:1.3, trunk:1, trunk_link:1.3, primary:1, primary_link:1.3, secondary:1, secondary_link:1.3, tertiary:1, tertiary_link:1.3, unclassified:1.15, residential:1.15, living_street:1.25, pedestrian:1.2, cycleway:1.8, busway:.9, tram:.8 };
const SMALL = new Set(['residential','living_street','unclassified']);
const CLASS_NAME = { motorway:'Autoroute', trunk:'Voie rapide', primary:'Axe principal', secondary:'Axe secondaire', tertiary:'Rue collectrice', unclassified:'Rue', residential:'Rue résidentielle', living_street:'Zone de rencontre', pedestrian:'Rue piétonne', cycleway:'Piste cyclable', busway:'Voie de bus' };
const MODES = ['car','bus','bike','ped'];
const MODE_CODE = { car:0, bus:1, bike:2, ped:3 };
const MODE_LABEL = { car:'Voiture', bus:'Bus', bike:'Vélo', ped:'Piéton' };
const MODE_TEXT = { car:'voiture', bus:'bus', bike:'vélo', ped:'piéton' };
const MODE0 = { pedestrian:'ped', cycleway:'bike', busway:'bus' };
const MAJOR = new Set(['motorway','motorway_link','trunk','trunk_link']);

const CAT = { A:'Aéroport', G:'Gare ou pôle d’échange', H:'Hôpital', U:'Enseignement supérieur', M:'Mairie', C:'Culture et patrimoine', S:'Centre commercial', L:'Équipement ou loisirs', T:'Arrêt de tram', N:'Arrêt de tram créé', B:'Arrêt de bus', Q:'Arrêt de bus créé' };
const CAT_PRIO = { A:1, G:2, H:3, U:4, C:5, S:6, L:7, M:8, T:9, N:9, B:10, Q:10 };
const MARK_MIN = { A:.012, G:.012, H:.03, U:.05, C:.06, S:.06, L:.06, M:.12, T:.08, N:0, B:.5, Q:0 };
const LAB_MIN = { A:.02, G:.06, H:.08, U:.12, C:.14, S:.14, L:.14, M:.2, T:.45, N:.3, B:1.1, Q:.3 };
const LINE_COLORS = ['#D32F2F','#00838F','#6A1B9A','#EF6C00','#2E7D32','#AD1457'];
const IMPORTANT = ['A','G','H','U','M','C','S','L'];

/* ---------- Décodage des données ---------- */
const ways = [], tramWays = [];
const extra = { river: [], water: [], rail: [], tram: [] };
const byId = new Map(), byName = new Map(), tramById = new Map();
const TILE = 1500;
for (const r of RAW.w) {
  const cls = RAW.c[r[1]], p = r[8], n = (p.length / 2) | 0;
  const xy = new Float64Array(n * 2), keys = new Array(n);
  let la = 0, lo = 0, len = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    la += p[2*i]; lo += p[2*i+1];
    const x = toX(lo), y = toY(la);
    xy[2*i] = x; xy[2*i+1] = y; keys[i] = la * 400000 + lo;
    if (i) len += Math.hypot(x - xy[2*i-2], y - xy[2*i-1]);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const w = { id: r[0], c: cls, name: RAW.n[r[2]], o: r[3] === 2 ? -1 : r[3], lanes: r[4], speed: r[5], bridge: r[6], xy, keys, len, bb: [x0, y0, x1, y1], mode0: MODE0[cls] || 'car', idx: -1,
              tk: (Math.floor((x0 + x1) / 2 / TILE) + 500) * 1000 + Math.floor((y0 + y1) / 2 / TILE) + 500 };
  if (EDITABLE.has(cls)) {
    w.idx = ways.length; ways.push(w); byId.set(w.id, w.idx);
    if (w.name) { let l = byName.get(w.name); if (!l) byName.set(w.name, l = []); l.push(w.idx); }
  } else if (cls === 'tram') { w.ti = tramWays.length; tramWays.push(w); tramById.set(w.id, w); extra.tram.push(w); }
  else if (extra[cls]) extra[cls].push(w);
}
const mkPoi = (r, cat) => ({ cat, name: RAW.n[r[cat === 'B' ? 2 : 3]], la: r[0], lo: r[1], x: toX(r[1]), y: toY(r[0]), lines: [], near: null });
const pois = RAW.p.map(r => mkPoi(r, r[2]));
const bstops = RAW.bs.map(r => mkPoi(r, 'B'));
let newStops = [];

function addPoly(path, xy, close) {
  path.moveTo(xy[0], xy[1]);
  for (let i = 2; i < xy.length; i += 2) path.lineTo(xy[i], xy[i+1]);
  if (close) path.closePath();
}
const waterFill = new Path2D(), railPath = new Path2D();
let tramPath = new Path2D();
const rivers = [{ m: 170, p: new Path2D() }, { m: 70, p: new Path2D() }, { m: 30, p: new Path2D() }, { m: 8, p: new Path2D() }];
for (const w of extra.water) addPoly(waterFill, w.xy, true);
for (const w of extra.river) addPoly(rivers[/^La Loire$/.test(w.name) ? 0 : /^Le Cher$/.test(w.name) ? 1 : /^Le Petit Cher$/.test(w.name) ? 2 : 3].p, w.xy);
for (const w of extra.rail) addPoly(railPath, w.xy);

/* ---------- Grilles de recherche ---------- */
const CELL = 120, grid = new Map(), tgrid = new Map();
const gkey = (i, j) => i * 100003 + j;
function gridAdd(g, w, id) {
  const xy = w.xy;
  for (let i = 2; i < xy.length; i += 2) {
    const i0 = Math.floor(Math.min(xy[i-2], xy[i]) / CELL), i1 = Math.floor(Math.max(xy[i-2], xy[i]) / CELL);
    const j0 = Math.floor(Math.min(xy[i-1], xy[i+1]) / CELL), j1 = Math.floor(Math.max(xy[i-1], xy[i+1]) / CELL);
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
      const k = gkey(a, b); let l = g.get(k); if (!l) g.set(k, l = []);
      if (l[l.length - 1] !== id) l.push(id);
    }
  }
}
for (const w of ways) gridAdd(grid, w, w.idx);
for (const w of tramWays) gridAdd(tgrid, w, w.ti);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function wayDist(xy, wx, wy) { let d = 1e9; for (let i = 2; i < xy.length; i += 2) { const e = segDist(wx, wy, xy[i-2], xy[i-1], xy[i], xy[i+1]); if (e < d) d = e; } return d; }
/* ids des voies à moins de tol mètres */
function near(g, arr, wx, wy, tol, vis) {
  const seen = new Set(), out = [];
  for (let a = Math.floor((wx - tol) / CELL); a <= Math.floor((wx + tol) / CELL); a++)
    for (let b = Math.floor((wy - tol) / CELL); b <= Math.floor((wy + tol) / CELL); b++) {
      const l = g.get(gkey(a, b)); if (!l) continue;
      for (const id of l) { if (seen.has(id)) continue; seen.add(id); if (vis && !vis(arr[id])) continue; const d = wayDist(arr[id].xy, wx, wy); if (d <= tol) out.push([id, d]); }
    }
  return out;
}
for (const p of bstops) p.near = near(grid, ways, p.x, p.y, 28).map(a => a[0]);

/* tram existant : rues longées */
const tramStreets = new Map();   // id voie tram -> idx de rues
for (const tw of tramWays) {
  const s = new Set(), xy = tw.xy;
  for (let i = 0; i < xy.length; i += 2) {
    for (const [id] of near(grid, ways, xy[i], xy[i+1], 12, w => w.c !== 'cycleway')) s.add(id);
    if (i + 2 < xy.length) { const mx = (xy[i] + xy[i+2]) / 2, my = (xy[i+1] + xy[i+3]) / 2; for (const [id] of near(grid, ways, mx, my, 12, w => w.c !== 'cycleway')) s.add(id); }
  }
  tramStreets.set(tw.id, [...s]);
}

/* ---------- Lignes ---------- */
let lines = [];
for (const [ref, ni, col, ids] of RAW.tl) {
  const tws = ids.map(id => tramById.get(id)).filter(Boolean);
  lines.push({ id: 't:' + ref, type: 'tram', exist: true, ref, name: RAW.n[ni], col: col || '#bf1950', tw: new Set(tws.map(w => w.id)), len: tws.reduce((a, w) => a + w.len, 0) / 2, deleted: false, ways: new Set(), stops: [] });
}
for (const [ref, ni, col, ids] of RAW.bl) {
  const s = new Set(ids.map(id => byId.get(id)).filter(i => i !== undefined));
  lines.push({ id: 'b:' + ref, type: 'bus', exist: true, ref, name: RAW.n[ni], col: col || '#7B3FC4', ways: s, orig: new Set(s), deleted: false, stops: [] });
}
/* voies de tram absentes de la relation : rattachées à la ligne voisine */
for (let pass = 0; pass < 3; pass++) {
  const owner = new Map(); for (const l of lines) if (l.exist && l.type === 'tram') for (const id of l.tw) owner.set(id, l);
  for (const tw of tramWays) {
    if (owner.has(tw.id)) continue;
    const k = tw.xy.length / 4 | 0, mx = tw.xy[2 * k], my = tw.xy[2 * k + 1];
    const r = near(tgrid, tramWays, mx, my, 70).filter(([i]) => owner.has(tramWays[i].id)).sort((a, c) => a[1] - c[1]);
    if (r.length) owner.get(tramWays[r[0][0]].id).tw.add(tw.id);
  }
}
for (const l of lines) if (l.type === 'bus') l.len = [...l.ways].reduce((a, i) => a + ways[i].len, 0);

/* ---------- État ---------- */
const ov = new Map();
const undoStack = [];
let sel = null, selPoi = null, drawMode = null, activeLine = null, tab = 'map';
let profiles = {};
const FL = { poi: true, tram: true, bus: false, small: true, arrows: true, cov: false, stops: true, cats: { A:1, G:1, H:1, U:1, M:1, C:1, S:1, L:1 }, busRef: null };
const STORE = 'atelier-rues-tours-v1', STORE_L = 'atelier-rues-tours-lignes-v2', STORE_T = 'atelier-rues-tours-trams-v1', STORE_C = 'atelier-rues-tours-coupes-v1', STORE_F = 'atelier-rues-tours-calques-v1';
const modeArr = new Uint8Array(ways.length);
const modeOf = w => { const e = ov.get(w.idx); return e ? e.m : w.mode0; };
const onewayOf = w => { const e = ov.get(w.idx); return e ? e.o : w.o; };
const idsOfSel = () => sel ? (sel.scope === 'street' ? sel.cluster : [sel.anchor]) : [];
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const classOn = c => view.s >= CLASS_MINZ[c] && (FL.small || !SMALL.has(c));

/* ---------- Couleurs ---------- */
let C = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  C = { bg: g('--m-bg'), water: g('--m-water'), rail: g('--m-rail'), casing: g('--m-casing'), car: g('--m-car'), major: g('--m-major'),
        bus: g('--m-bus'), bike: g('--m-bike'), ped: g('--m-ped'), sel: g('--m-sel'), mod: g('--m-mod'), tram: g('--m-tram'),
        arrow: g('--m-arrow'), label: g('--m-label'), halo: g('--m-halo'), busl: g('--m-busl'), newbus: g('--m-newbus'), cov: g('--m-cov'), fg: g('--fg'), pbg: g('--bg') };
}

/* ---------- Tracés groupés par tuiles ---------- */
let tiles = new Map(), modB = {}, selB = {};
function rebuildPaths() {
  tiles = new Map(); modB = {};
  for (const w of ways) {
    const m = modeOf(w); modeArr[w.idx] = MODE_CODE[m];
    let t = tiles.get(w.tk); if (!t) tiles.set(w.tk, t = { bb: [1e9, 1e9, -1e9, -1e9], b: {} });
    const bb = w.bb; if (bb[0] < t.bb[0]) t.bb[0] = bb[0]; if (bb[1] < t.bb[1]) t.bb[1] = bb[1]; if (bb[2] > t.bb[2]) t.bb[2] = bb[2]; if (bb[3] > t.bb[3]) t.bb[3] = bb[3];
    const k = w.c + '|' + m;
    (t.b[k] || (t.b[k] = new Path2D())); addPoly(t.b[k], w.xy);
    if (ov.has(w.idx)) { (modB[k] || (modB[k] = new Path2D())); addPoly(modB[k], w.xy); }
  }
  rebuildSel();
}
function rebuildSel() {
  selB = {};
  for (const i of idsOfSel()) {
    const w = ways[i], k = w.c + '|' + modeOf(w);
    (selB[k] || (selB[k] = new Path2D())); addPoly(selB[k], w.xy);
  }
}
function wpx(c, m, s) {
  const f = m === 'bike' ? .6 : m === 'ped' ? .7 : 1;
  const min = m === 'car' ? MINPX[c] : Math.max(MINPX[c], 2);
  return Math.max(WIDTH[c] * f * s, min);
}
const fillColor = (c, m) => m === 'car' ? (MAJOR.has(c) ? C.major : C.car) : C[m];

/* ---------- Dérivés des lignes ---------- */
let busCount = new Map(), busAll = new Path2D(), tramNew = new Map(), tramOld = new Set();
const linePath = l => {
  if (!l._p) {
    const p = new Path2D();
    if (l.type === 'bus') for (const i of l.ways) addPoly(p, ways[i].xy);
    else if (l.exist) for (const id of l.tw) addPoly(p, tramById.get(id).xy);
    else for (const s of l.segs || []) if (s.length >= 4) addPoly(p, s);
    l._p = p;
  }
  return l._p;
};
const alive = l => !l.deleted;
function refreshLines() {
  busCount = new Map(); tramNew = new Map(); tramOld = new Set();
  const dead = new Set(), live = new Set();
  for (const l of lines) {
    l._p = null;
    if (l.exist && l.type === 'tram') for (const id of l.tw) (l.deleted ? dead : live).add(id);
    if (l.deleted) continue;
    if (l.type === 'bus') for (const i of l.ways) busCount.set(i, (busCount.get(i) || 0) + 1);
    else if (!l.exist) for (const i of l.ways) { let s = tramNew.get(i); if (!s) tramNew.set(i, s = new Set()); s.add(l.id); }
  }
  busAll = new Path2D(); for (const i of busCount.keys()) addPoly(busAll, ways[i].xy);
  tramPath = new Path2D();
  for (const w of extra.tram) if (!dead.has(w.id) || live.has(w.id)) { addPoly(tramPath, w.xy); for (const i of tramStreets.get(w.id) || []) tramOld.add(i); }
  rebuildStops();
}
function nameAt(x, y) {
  const r = near(grid, ways, x, y, 35, w => !!w.name); r.sort((a, b) => a[1] - b[1]);
  return r.length ? ways[r[0][0]].name : '';
}
function rebuildStops() {
  for (const p of pois) p.lines = []; for (const p of bstops) p.lines = [];
  const ek = new Map(); for (const p of pois) if (p.cat === 'T') ek.set('t' + p.la * 400000 + p.lo, p);
  for (const p of bstops) ek.set('b' + p.la * 400000 + p.lo, p);
  const nk = new Map(); newStops = [];
  for (const l of lines) {
    if (l.exist || l.deleted) continue;
    for (const [la, lo, nme, via] of l.stops) {
      if (via) continue;
      const key = (l.type === 'tram' ? 't' : 'b') + la * 400000 + lo;
      let p = ek.get(key) || nk.get(key);
      if (!p) {
        p = { cat: l.type === 'tram' ? 'N' : 'Q', name: 'Arrêt', la, lo, x: toX(lo), y: toY(la), lines: [], near: null };
        const nm = nameAt(p.x, p.y); p.name = nme || (nm ? 'Arrêt ' + nm : 'Arrêt créé');
        nk.set(key, p); newStops.push(p);
      }
      if (!p.lines.includes(l)) p.lines.push(l);
    }
  }
}
const stopServed = p => p.near.some(i => busCount.has(i));

/* ---------- Vue ---------- */
const canvas = $('#map'), ctx = canvas.getContext('2d');
const HOME = { cx: 180, cy: -150, s: 0.11 }, WIDE = { cx: 1500, cy: 0, s: 0.0145 };
const view = { cx: HOME.cx, cy: HOME.cy, s: HOME.s, w: 300, h: 300, dpr: 1 };
let raf = 0;
const requestDraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
const clampScale = s => Math.min(4, Math.max(0.011, s));
const toWorld = (x, y) => [view.cx + (x - view.w / 2) / view.s, view.cy + (y - view.h / 2) / view.s];
const toScreen = (x, y) => [(x - view.cx) * view.s + view.w / 2, (y - view.cy) * view.s + view.h / 2];
function zoomAt(x, y, factor) {
  const [wx, wy] = toWorld(x, y);
  view.s = clampScale(view.s * factor);
  view.cx = wx - (x - view.w / 2) / view.s;
  view.cy = wy - (y - view.h / 2) / view.s;
  requestDraw();
}
function resize() {
  const r = canvas.getBoundingClientRect();
  view.w = Math.max(50, r.width); view.h = Math.max(50, r.height);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
  requestDraw();
}

/* ---------- Dessin ---------- */
const textW = new Map();
function strokeLine(path, color, px, alpha, dash) {
  const s = view.s;
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  ctx.strokeStyle = C.halo; ctx.lineWidth = (px + 3) / s; ctx.globalAlpha = Math.min(1, alpha + .2); ctx.stroke(path);
  ctx.strokeStyle = color; ctx.lineWidth = px / s; ctx.globalAlpha = alpha;
  if (dash) ctx.setLineDash([dash / s, dash * .6 / s]);
  ctx.stroke(path); ctx.setLineDash([]); ctx.globalAlpha = 1;
}
function draw() {
  raf = 0;
  const { w: W, h: H, dpr, s } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - view.cx * s), dpr * (H / 2 - view.cy * s));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
  const x0 = view.cx - W / 2 / s, x1 = view.cx + W / 2 / s, y0 = view.cy - H / 2 / s, y1 = view.cy + H / 2 / s;

  ctx.fillStyle = C.water; ctx.fill(waterFill);
  ctx.strokeStyle = C.water;
  for (const r of rivers) { ctx.lineWidth = Math.max(r.m, 2 / s); ctx.stroke(r.p); }
  ctx.strokeStyle = C.rail; ctx.lineWidth = 1.4 / s; ctx.stroke(railPath);

  if (FL.cov) drawCoverage();

  const vt = [];
  for (const t of tiles.values()) if (t.bb[2] >= x0 && t.bb[0] <= x1 && t.bb[3] >= y0 && t.bb[1] <= y1) vt.push(t);
  for (const c of ORDER) {
    if (!classOn(c)) continue;
    for (const m of MODES) {
      const wp = wpx(c, m, s), k = c + '|' + m; let first = true;
      for (const t of vt) { const p = t.b[k]; if (!p) continue; if (first) { ctx.strokeStyle = C.casing; ctx.lineWidth = (wp + (wp < 3 ? .9 : 1.4)) / s; first = false; } ctx.stroke(p); }
    }
    for (const m of MODES) {
      const wp = wpx(c, m, s), k = c + '|' + m; let first = true;
      for (const t of vt) { const p = t.b[k]; if (!p) continue; if (first) { ctx.strokeStyle = fillColor(c, m); ctx.lineWidth = wp / s; first = false; } ctx.stroke(p); }
    }
  }

  overlay(modB, 3.2, C.mod);
  overlay(selB, 7, C.sel);

  if (FL.bus) {
    const dim = activeLine && activeLine.type === 'bus' || FL.busRef;
    strokeLine(busAll, C.busl, view.s < .03 ? 2.2 : 4, dim ? .28 : .8);
    const hl = FL.busRef && lines.find(l => l.id === FL.busRef);
    if (hl && alive(hl)) strokeLine(linePath(hl), hl.col, 6, 1);
  }
  if (FL.tram) {
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.strokeStyle = C.halo; ctx.lineWidth = 7 / s; ctx.stroke(tramPath);
    ctx.strokeStyle = C.tram; ctx.lineWidth = 3.4 / s; ctx.stroke(tramPath);
  }
  for (const l of lines) if (!l.exist && alive(l) && (l.type === 'tram' ? FL.tram : FL.bus)) strokeLine(linePath(l), l.col, 5, 1);
  if (activeLine && alive(activeLine) && (activeLine.exist || activeLine.type === 'tram') && !(activeLine.type === 'bus' && FL.busRef === activeLine.id)) strokeLine(linePath(activeLine), activeLine.type === 'bus' ? activeLine.col : (activeLine.exist ? C.sel : activeLine.col), 7, .95);
  if (drawMode) {
    const dp = new Path2D(); for (const sg of drawMode.segs) if (sg.length >= 4) addPoly(dp, sg);
    strokeLine(dp, drawMode.col, 5, 1, 10);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vis = [];
  if (s >= 0.12) for (const w of ways) { const b = w.bb; if (b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1 && classOn(w.c)) vis.push(w); }
  if (s >= 0.35 && FL.arrows) arrows(vis);
  const boxes = poiLayout();
  labels(vis, boxes);
  drawPois();
  drawScale();
}
function drawCoverage() {
  const p = new Path2D();
  for (const q of stopsOf('tram')) { p.moveTo(q.x + 500, q.y); p.arc(q.x, q.y, 500, 0, 7); }
  ctx.globalAlpha = .13; ctx.fillStyle = C.cov; ctx.fill(p);
  ctx.globalAlpha = .5; ctx.strokeStyle = C.cov; ctx.lineWidth = 1 / view.s; ctx.stroke(p); ctx.globalAlpha = 1;
}
function stopsOf(kind) {
  if (kind === 'tram') {
    const list = pois.filter(p => p.cat === 'T' && (p.lines.length || tramAliveNear(p))).concat(newStops.filter(p => p.cat === 'N'));
    return list;
  }
  return bstops.filter(stopServed).concat(newStops.filter(p => p.cat === 'Q'));
}
const tramNearCache = new Map();
function tramAliveNear(p) {
  let ids = tramNearCache.get(p);
  if (!ids) { ids = near(tgrid, tramWays, p.x, p.y, 80).map(a => tramWays[a[0]].id); tramNearCache.set(p, ids); }
  const ls = lines.filter(l => l.exist && l.type === 'tram' && ids.some(id => l.tw.has(id)));
  return !ls.length || ls.some(alive);
}

function overlay(buckets, extraPx, color) {
  const s = view.s, keys = Object.keys(buckets);
  if (!keys.length) return;
  ctx.strokeStyle = color;
  for (const k of keys) { const [c, m] = k.split('|'); ctx.lineWidth = (wpx(c, m, s) + extraPx) / s; ctx.stroke(buckets[k]); }
  for (const k of keys) { const [c, m] = k.split('|'); ctx.strokeStyle = fillColor(c, m); ctx.lineWidth = wpx(c, m, s) / s; ctx.stroke(buckets[k]); }
}

function arrows(vis) {
  const s = view.s, W = view.w, H = view.h; let n = 0;
  ctx.fillStyle = C.arrow;
  for (const w of vis) {
    const o = onewayOf(w); if (!o) continue;
    const m = modeOf(w); if (m !== 'car' && m !== 'bus') continue;
    if (w.len * s < 30) continue;
    const xy = w.xy, size = Math.min(6, Math.max(3, wpx(w.c, m, s) * .45));
    let cum = 0, next = Math.min(35, w.len * s / 2);
    for (let i = 2; i < xy.length; i += 2) {
      const ax = (xy[i-2] - view.cx) * s + W / 2, ay = (xy[i-1] - view.cy) * s + H / 2;
      const bx = (xy[i] - view.cx) * s + W / 2, by = (xy[i+1] - view.cy) * s + H / 2;
      const sl = Math.hypot(bx - ax, by - ay); if (sl < 0.01) continue;
      while (cum + sl >= next) {
        const t = (next - cum) / sl, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        let a = Math.atan2(by - ay, bx - ax); if (o < 0) a += Math.PI;
        if (px > -10 && px < W + 10 && py > -10 && py < H + 10) {
          ctx.save(); ctx.translate(px, py); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * .8, -size * .8); ctx.lineTo(-size * .8, size * .8); ctx.closePath(); ctx.fill(); ctx.restore();
          if (++n > 1500) return;
        }
        next += 80;
      }
      cum += sl;
    }
  }
}

/* lieux et arrêts : marqueurs et étiquettes */
let poiVis = [];
function poiLayout() {
  poiVis = []; const boxes = [];
  const s = view.s, W = view.w, H = view.h;
  ctx.font = "600 12px 'Barlow Semi Condensed','Barlow',sans-serif";
  const list = [];
  if (FL.poi) for (const p of pois) if (p.cat !== 'T' && FL.cats[p.cat] && s >= MARK_MIN[p.cat]) list.push(p);
  if (FL.stops) {
    if (FL.tram) { for (const p of stopsOf('tram')) if (s >= MARK_MIN[p.cat]) list.push(p); }
    else for (const p of newStops) if (p.cat === 'N') list.push(p);
    if (FL.bus && s >= MARK_MIN.B) for (const p of stopsOf('bus')) list.push(p);
  } else for (const p of newStops) list.push(p);
  list.sort((a, b) => CAT_PRIO[a.cat] - CAT_PRIO[b.cat]);
  for (const p of list) {
    const [sx, sy] = toScreen(p.x, p.y);
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    const small = p.cat === 'T' || p.cat === 'N' || p.cat === 'B' || p.cat === 'Q';
    const r = p.cat === 'B' ? 3.2 : small ? 4.8 : 8;
    const item = { p, sx, sy, r, label: false };
    boxes.push([sx, sy, r + 2, r + 2]);
    if (s >= LAB_MIN[p.cat]) {
      let tw = textW.get(p.name); if (tw === undefined) textW.set(p.name, tw = ctx.measureText(p.name).width);
      const cx = sx + r + 4 + tw / 2, hw = tw / 2 + 3;
      let clash = false;
      for (const b of boxes) { if (b !== boxes[boxes.length - 1] && Math.abs(b[0] - cx) < b[2] + hw && Math.abs(b[1] - sy) < b[3] + 9) { clash = true; break; } }
      if (!clash) { item.label = true; item.tw = tw; boxes.push([cx, sy, hw, 8]); }
    }
    poiVis.push(item);
  }
  return boxes;
}
function drawPois() {
  ctx.textBaseline = 'middle';
  for (const it of poiVis) {
    const { p, sx, sy, r } = it;
    const on = selPoi === p;
    let ring = C.fg, fill = C.fg;
    const multi = p.lines.length > 1 || (p.cat === 'T' && p.lines.length);
    if (p.cat === 'N') { ring = p.lines[0] ? p.lines[0].col : C.fg; }
    if (p.cat === 'Q') { ring = p.lines[0] ? p.lines[0].col : C.newbus; }
    if (p.cat === 'B') { ring = C.busl; }
    ctx.beginPath(); ctx.arc(sx, sy, r + (on ? 3.5 : 2) + (multi ? 2 : 0), 0, 7); ctx.fillStyle = on ? C.sel : C.halo; ctx.fill();
    if (p.cat === 'N' || p.cat === 'Q' || p.cat === 'B') {
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = p.cat === 'B' ? ring : C.halo; ctx.fill();
      if (p.cat !== 'B') { ctx.lineWidth = 2.6; ctx.strokeStyle = ring; ctx.stroke(); }
      if (multi) { ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, 7); ctx.lineWidth = 1.6; ctx.strokeStyle = C.fg; ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = fill; ctx.fill();
      if (p.cat === 'T') { ctx.beginPath(); ctx.arc(sx, sy, r - 2.4, 0, 7); ctx.fillStyle = C.halo; ctx.fill(); if (multi) { ctx.beginPath(); ctx.arc(sx, sy, r + 3.5, 0, 7); ctx.lineWidth = 1.6; ctx.strokeStyle = C.fg; ctx.stroke(); } }
      else { ctx.font = "700 11px 'Barlow Condensed','Barlow',sans-serif"; ctx.textAlign = 'center'; ctx.fillStyle = C.pbg; ctx.fillText(p.cat, sx, sy + .5); }
    }
    if (it.label) {
      ctx.font = "600 12px 'Barlow Semi Condensed','Barlow',sans-serif"; ctx.textAlign = 'left';
      ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = C.halo; ctx.strokeText(p.name, sx + r + 4, sy);
      ctx.fillStyle = C.label; ctx.fillText(p.name, sx + r + 4, sy);
    }
  }
  if (drawMode) {
    for (const st of drawMode.stops) {
      const [sx, sy] = toScreen(toX(st.lo), toY(st.la));
      if (sx < -10 || sx > view.w + 10 || sy < -10 || sy > view.h + 10) continue;
      ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, 7); ctx.fillStyle = C.halo; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = drawMode.col; ctx.stroke();
    }
  }
}

function labels(vis, seed) {
  const s = view.s, W = view.w, H = view.h;
  const cands = vis.filter(w => w.name && s >= LABEL_MIN[w.c]).sort((a, b) => b.len - a.len);
  if (!cands.length) return;
  ctx.font = "600 12px 'Barlow Semi Condensed','Barlow',sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const boxes = seed.slice(), same = new Map(); let count = 0;
  for (const w of cands) {
    if (count >= 140) break;
    let tw = textW.get(w.name); if (tw === undefined) textW.set(w.name, tw = ctx.measureText(w.name).width);
    if (w.len * s < tw + 24) continue;
    const half = w.len / 2; let cum = 0, px = 0, py = 0, a = 0;
    for (let i = 2; i < w.xy.length; i += 2) {
      const sl = Math.hypot(w.xy[i] - w.xy[i-2], w.xy[i+1] - w.xy[i-1]);
      if (cum + sl >= half) {
        const t = sl ? (half - cum) / sl : 0;
        px = (w.xy[i-2] + (w.xy[i] - w.xy[i-2]) * t - view.cx) * s + W / 2;
        py = (w.xy[i-1] + (w.xy[i+1] - w.xy[i-1]) * t - view.cy) * s + H / 2;
        a = Math.atan2(w.xy[i+1] - w.xy[i-1], w.xy[i] - w.xy[i-2]); break;
      }
      cum += sl;
    }
    if (px < 20 || px > W - 20 || py < 14 || py > H - 14) continue;
    if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
    const hw = (Math.abs(Math.cos(a)) * tw + Math.abs(Math.sin(a)) * 12) / 2 + 3, hh = (Math.abs(Math.sin(a)) * tw + Math.abs(Math.cos(a)) * 12) / 2 + 3;
    let clash = false;
    for (const b of boxes) { if (Math.abs(b[0] - px) < b[2] + hw && Math.abs(b[1] - py) < b[3] + hh) { clash = true; break; } }
    if (clash) continue;
    const sm = same.get(w.name) || [];
    if (sm.some(p => Math.hypot(p[0] - px, p[1] - py) < 260)) continue;
    sm.push([px, py]); same.set(w.name, sm);
    boxes.push([px, py, hw, hh]); count++;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.lineWidth = 3.5; ctx.strokeStyle = C.halo; ctx.strokeText(w.name, 0, 0);
    ctx.fillStyle = C.label; ctx.fillText(w.name, 0, 0); ctx.restore();
  }
}

function drawScale() {
  const target = 80 / view.s, pow = Math.pow(10, Math.floor(Math.log10(target)));
  let m = pow; for (const k of [1, 2, 5, 10]) { if (pow * k <= target) m = pow * k; }
  $('#scale').innerHTML = '<i style="width:' + Math.round(m * view.s) + 'px"></i>' + (m >= 1000 ? (m / 1000) + ' km' : m + ' m');
}
