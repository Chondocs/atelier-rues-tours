
/* ---------- Sélection ---------- */
function hitTest(wx, wy, tolPx) {
  const tol = Math.min(120, Math.max(6, (tolPx || 18) / view.s));
  const seen = new Set(); let best = -1, bd = tol;
  for (let a = Math.floor((wx - tol) / CELL); a <= Math.floor((wx + tol) / CELL); a++)
    for (let b = Math.floor((wy - tol) / CELL); b <= Math.floor((wy + tol) / CELL); b++) {
      const l = grid.get(gkey(a, b)); if (!l) continue;
      for (const idx of l) {
        if (seen.has(idx)) continue; seen.add(idx);
        if (!classOn(ways[idx].c)) continue;
        const d = wayDist(ways[idx].xy, wx, wy);
        if (d < bd) { bd = d; best = idx; }
      }
    }
  return best;
}
function clusterOf(idx) {
  const w = ways[idx]; if (!w.name) return [idx];
  const cand = (byName.get(w.name) || []).filter(i => ways[i].mode0 === w.mode0);
  if (cand.length < 2) return [idx];
  const pm = new Map();
  for (const i of cand) for (const k of ways[i].keys) { let l = pm.get(k); if (!l) pm.set(k, l = []); l.push(i); }
  const seen = new Set([idx]), q = [idx];
  while (q.length) { const i = q.pop(); for (const k of ways[i].keys) for (const j of pm.get(k)) if (!seen.has(j)) { seen.add(j); q.push(j); } }
  return [...seen];
}
function select(idx, scope) {
  const cluster = clusterOf(idx);
  selPoi = null;
  sel = { anchor: idx, cluster, scope: scope || (cluster.length > 1 ? 'street' : 'segment') };
  rebuildSel(); renderSheet(); requestDraw();
}
function clearSel() { if (!sel && !selPoi) return; sel = null; selPoi = null; rebuildSel(); renderSheet(); requestDraw(); }
function selectPoi(p) { sel = null; selPoi = p; rebuildSel(); renderSheet(); requestDraw(); }

/* ---------- Modifications des usages ---------- */
function commit(changes) {
  const op = [];
  for (const [i, next] of changes) {
    const prev = ov.get(i); op.push([i, prev ? { ...prev } : null]);
    if (next) ov.set(i, next); else ov.delete(i);
  }
  if (!op.length) return;
  undoStack.push({ k: 'ov', op }); afterChange();
}
function afterChange() { rebuildPaths(); saveState(); renderSheet(); requestDraw(); }
const entry = (w, m, o) => (m === w.mode0 && o === w.o) ? null : { m, o };
function setMode(mode) {
  const ch = new Map();
  for (const i of idsOfSel()) { const w = ways[i]; ch.set(i, entry(w, mode, onewayOf(w))); }
  commit(ch);
}
function orient(ids, anchor) {
  const dir = new Map([[anchor, onewayOf(ways[anchor]) || 1]]), pm = new Map();
  for (const i of ids) for (const k of ways[i].keys) { let l = pm.get(k); if (!l) pm.set(k, l = []); l.push(i); }
  const q = [anchor];
  while (q.length) {
    const i = q.shift(), w = ways[i], d = dir.get(i), f = w.keys[0], l = w.keys[w.keys.length - 1];
    for (const [k, role] of [[d > 0 ? l : f, 'exit'], [d > 0 ? f : l, 'entry']]) {
      for (const j of pm.get(k) || []) {
        if (dir.has(j)) continue;
        const b = ways[j], bf = b.keys[0], bl = b.keys[b.keys.length - 1];
        dir.set(j, role === 'exit' ? (bf === k ? 1 : bl === k ? -1 : 1) : (bl === k ? 1 : bf === k ? -1 : 1));
        q.push(j);
      }
    }
  }
  for (const i of ids) if (!dir.has(i)) dir.set(i, 1);
  return dir;
}
function setOneway(on) {
  const ids = idsOfSel(), ch = new Map(), dir = on ? orient(ids, sel.anchor) : null;
  for (const i of ids) { const w = ways[i]; ch.set(i, entry(w, modeOf(w), on ? dir.get(i) : 0)); }
  commit(ch);
}
function invertOneway() {
  const ch = new Map();
  for (const i of idsOfSel()) { const w = ways[i], o = onewayOf(w); if (o) ch.set(i, entry(w, modeOf(w), -o)); }
  commit(ch);
}

/* ---------- Instantanés (lignes + coupes) pour annuler ---------- */
const cloneLine = l => ({ ...l, ways: new Set(l.ways), tw: l.tw && new Set(l.tw), stops: l.stops.slice(), segs: l.segs && l.segs.slice(), orig: l.orig, _p: null });
const snapshot = () => ({ lines: lines.map(cloneLine), profiles: JSON.parse(JSON.stringify(profiles)) });
function pushSnap() { undoStack.push({ k: 'lines', snap: snapshot() }); }
function restoreSnap(sn) {
  lines = sn.lines.map(cloneLine); profiles = JSON.parse(JSON.stringify(sn.profiles));
  if (activeLine) activeLine = lines.find(l => l.id === activeLine.id) || null;
  if (FL.busRef && !lines.some(l => l.id === FL.busRef)) FL.busRef = null;
  refreshLines(); saveLines(); saveProfiles();
}
function undo() {
  const u = undoStack.pop(); if (!u) return;
  if (u.k === 'ov') { for (const [i, prev] of u.op) { if (prev) ov.set(i, prev); else ov.delete(i); } afterChange(); }
  else if (u.k === 'lines') { restoreSnap(u.snap); renderSheet(); requestDraw(); }
  else if (u.k === 'reset') { for (const [i, e] of u.op) ov.set(i, e); restoreSnap(u.snap); afterChange(); }
}
function resetAll() {
  if (!ov.size && !linesChanged() && !Object.keys(profiles).length) return;
  undoStack.push({ k: 'reset', op: [...ov].map(([i, e]) => [i, { ...e }]), snap: snapshot() });
  ov.clear(); profiles = {}; saveProfiles();
  lines = lines.filter(l => l.exist || l.plan).map(l => { const c = cloneLine(l); c.deleted = !!c.defDel; if (c.orig) c.ways = new Set(c.orig); return c; });
  activeLine = null; FL.busRef = null; refreshLines(); saveLines(); afterChange(); renderFilters();
}
const linesChanged = () => lines.some(l => (!l.exist && !l.plan) || l.deleted !== !!l.defDel || (l.orig && (l.ways.size !== l.orig.size || [...l.ways].some(i => !l.orig.has(i)))));

/* ---------- Réseau pour les lignes de tram et de bus ---------- */
let G = null;
function buildGraph() {
  if (G) return G;
  const id = new Map(), X = [], Y = [], eF = [], eT = [], eL = [], eW = [], eC = [], eK = [], eA = [];
  const cn = Object.keys(CLS_MULT), ccode = c => cn.indexOf(c);
  const mult = cn.map(c => CLS_MULT[c]);
  const nid = (k, x, y) => { let i = id.get(k); if (i === undefined) { i = X.length; id.set(k, i); X.push(x); Y.push(y); } return i; };
  const addEdge = (a, b, wref, c, kind) => {
    const dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy), an = Math.atan2(dy, dx);
    eF.push(a); eT.push(b); eL.push(l); eW.push(wref); eC.push(c); eK.push(kind); eA.push(an);
    eF.push(b); eT.push(a); eL.push(l); eW.push(wref); eC.push(c); eK.push(kind); eA.push(an > 0 ? an - Math.PI : an + Math.PI);
  };
  const roadNodes = new Map(), ck = (x, y) => Math.floor(x / 25) * 100003 + Math.floor(y / 25);
  for (const w of ways) {
    if (w.c.startsWith('motorway')) continue;
    const c = ccode(w.c); let prev = -1;
    for (let j = 0; j < w.keys.length; j++) {
      const i = nid(w.keys[j], w.xy[2*j], w.xy[2*j+1]);
      const kk = ck(X[i], Y[i]); let l = roadNodes.get(kk); if (!l) roadNodes.set(kk, l = []); if (!l.includes(i)) l.push(i);
      if (prev >= 0 && prev !== i) addEdge(prev, i, w.idx, c, 0);
      prev = i;
    }
  }
  const nRoad = X.length, tc = ccode('tram'), tnodes = new Set();
  for (const w of tramWays) {
    let prev = -1;
    for (let j = 0; j < w.keys.length; j++) {
      const i = nid(w.keys[j], w.xy[2*j], w.xy[2*j+1]); if (i >= nRoad) tnodes.add(i);
      if (prev >= 0 && prev !== i) addEdge(prev, i, -2 - w.ti, tc, 1);
      prev = i;
    }
  }
  for (const i of tnodes) {   // raccords voie de tram <-> rue
    let best = -1, bd = 22;
    const cx = Math.floor(X[i] / 25), cy = Math.floor(Y[i] / 25);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const r of roadNodes.get((cx + a) * 100003 + cy + b) || []) { const d = Math.hypot(X[r] - X[i], Y[r] - Y[i]); if (d < bd) { bd = d; best = r; } }
    if (best >= 0) addEdge(i, best, -1, tc, 2);
  }
  const n = X.length, E = eF.length, first = new Int32Array(n + 1), out = new Int32Array(E);
  for (let e = 0; e < E; e++) first[eF[e] + 1]++;
  for (let i = 0; i < n; i++) first[i + 1] += first[i];
  const pos = first.slice(0, n);
  for (let e = 0; e < E; e++) out[pos[eF[e]]++] = e;
  return (G = { id, X, Y, n, E, first, out, eF: Int32Array.from(eF), eT: Int32Array.from(eT), eL: Float64Array.from(eL), eW: Int32Array.from(eW), eC: Int16Array.from(eC), eK: Uint8Array.from(eK), eA: Float64Array.from(eA), mult: Float64Array.from(mult) });
}
function edgeCost(g, e, kind) {
  const k = g.eK[e], l = g.eL[e];
  if (kind === 'bus') {
    if (k) return Infinity;
    const m = modeArr[g.eW[e]];
    return l * g.mult[g.eC[e]] * (m >= 2 ? 8 : m === 1 ? .9 : 1);
  }
  if (k) return l * (k === 1 ? .8 : 1);
  const m = modeArr[g.eW[e]];
  return l * g.mult[g.eC[e]] * (m === 2 ? 1.4 : 1);
}
function route(a, b, kind) {
  const g = buildGraph();
  if (a === b) return { xy: new Float64Array([g.X[a], g.Y[a]]), ways: new Set(), len: 0 };
  const dist = new Float64Array(g.E).fill(Infinity), prev = new Int32Array(g.E).fill(-1), bx = g.X[b], by = g.Y[b];
  const sc = kind === 'bus' ? .25 : 1, h = e => .75 * Math.hypot(g.X[g.eT[e]] - bx, g.Y[g.eT[e]] - by);
  const hd = [], hn = [];
  const push = (d, v) => { let i = hd.length; hd.push(d); hn.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; [hd[p], hd[i]] = [hd[i], hd[p]]; [hn[p], hn[i]] = [hn[i], hn[p]]; i = p; } };
  const pop = () => {
    const d = hd[0], v = hn[0], ld = hd.pop(), lv = hn.pop();
    if (hd.length) { hd[0] = ld; hn[0] = lv; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < hd.length && hd[l] < hd[m]) m = l; if (r < hd.length && hd[r] < hd[m]) m = r; if (m === i) break; [hd[m], hd[i]] = [hd[i], hd[m]]; [hn[m], hn[i]] = [hn[i], hn[m]]; i = m; } }
    return [d, v];
  };
  for (let j = g.first[a]; j < g.first[a + 1]; j++) { const e = g.out[j], c = edgeCost(g, e, kind); if (isFinite(c)) { dist[e] = c; push(c + h(e), e); } }
  let end = -1;
  while (hd.length) {
    const [f, e] = pop(); const d = dist[e];
    if (f > d + h(e) + 1e-6) continue;
    const v = g.eT[e];
    if (v === b) { end = e; break; }
    for (let j = g.first[v]; j < g.first[v + 1]; j++) {
      const q = g.out[j], c = edgeCost(g, q, kind); if (!isFinite(c)) continue;
      let da = Math.abs(g.eA[q] - g.eA[e]); if (da > Math.PI) da = 2 * Math.PI - da;
      const pen = (da > 2.6 ? 3000 : da > 1.9 ? 250 * sc : da > 1.2 ? 60 * sc : da > .7 ? 10 * sc : 0);
      const nd = d + c + pen;
      if (nd < dist[q]) { dist[q] = nd; prev[q] = e; push(nd + h(q), q); }
    }
  }
  if (end < 0) return null;
  const edges = []; for (let e = end; e !== -1; e = prev[e]) edges.push(e);
  edges.reverse();
  const xy = new Float64Array((edges.length + 1) * 2), wset = new Set(); let len = 0;
  xy[0] = g.X[g.eF[edges[0]]]; xy[1] = g.Y[g.eF[edges[0]]];
  edges.forEach((e, i) => { xy[2*i+2] = g.X[g.eT[e]]; xy[2*i+3] = g.Y[g.eT[e]]; len += g.eL[e]; if (g.eW[e] >= 0) wset.add(g.eW[e]); });
  return { xy, ways: wset, len };
}
const vertexOf = (w, wx, wy) => { let best = -1, bd = Infinity; for (let j = 0; j < w.keys.length; j++) { const d = Math.hypot(w.xy[2*j] - wx, w.xy[2*j+1] - wy); if (d < bd) { bd = d; best = j; } } return [best, bd]; };
/* sommet du réseau le plus proche, selon le type de ligne */
function nearestNode(wx, wy, tolM, kind) {
  const g = buildGraph(); let best = null, bd = Infinity;
  const test = (w) => { const [j, d] = vertexOf(w, wx, wy); if (d < bd && d <= tolM + 40) { const k = w.keys[j], id = g.id.get(k); if (id !== undefined) { bd = d; best = { id, la: Math.floor(k / 400000), lo: k % 400000 }; } } };
  for (const [i] of near(grid, ways, wx, wy, tolM, w => !w.c.startsWith('motorway'))) test(ways[i]);
  if (kind === 'tram') for (const [i] of near(tgrid, tramWays, wx, wy, tolM)) test(tramWays[i]);
  return best;
}
const nodeOfStop = (la, lo, kind) => { const g = buildGraph(), id = g.id.get(la * 400000 + lo); return id !== undefined ? id : (nearestNode(toX(lo), toY(la), 80, kind) || {}).id; };
const colorFor = type => { const used = new Set(lines.filter(l => !l.exist && l.type === type).map(l => l.col)); const pal = type === 'tram' ? LINE_COLORS : ['#E0267A', '#F57C00', '#009688', '#5E35B1', '#C0CA33', '#455A64']; return pal.find(c => !used.has(c)) || pal[lines.length % pal.length]; };
const lbl = l => l.exist ? (l.type === 'tram' ? l.name : 'Bus ' + l.ref) : l.name;

function computeSegs(l) {
  l.segs = []; l.len = 0; l.ways = new Set();
  const nodes = l.stops.map(([la, lo]) => nodeOfStop(la, lo, l.type));
  for (let i = 1; i < l.stops.length; i++) {
    const r = (!l.stops[i-1][4] && nodes[i-1] !== undefined && nodes[i] !== undefined) ? route(nodes[i-1], nodes[i], l.type) : null;
    const xy = r ? r.xy : new Float64Array([toX(l.stops[i-1][1]), toY(l.stops[i-1][0]), toX(l.stops[i][1]), toY(l.stops[i][0])]);
    l.segs.push(xy); l.len += r ? r.len : Math.hypot(xy[2] - xy[0], xy[3] - xy[1]);
    if (r) for (const w of r.ways) l.ways.add(w);
  }
}
/* Ligne 2 du tram (en construction), points relevés sur la carte officielle lignes2tram.fr ; 3e valeur : nom, 4e : simple point de passage, 5e : tronçon suivant tracé en ligne droite */
const PLAN_L2 = [[4738653, 65083, "Prieuré Saint-Cosme", 0], [4738723, 65556, "La Pléiade", 0], [4738912, 66030, "La Riche Centre", 0], [4738641, 66438, "Château Plessis", 0, 1], [4738625, 66757, "CHRU Bretonneau", 0], [4738266, 67068, "Maryse Bastié", 0], [4738282, 67616, "Les Beaumonts", 0], [4738180, 68132, "Strasbourg", 0], [4738052, 68795, "George Sand", 0], [4737991, 69399, "Liberté", 0], [4737757, 69396, "Charcot", 0], [4737378, 69450, "Verdun", 0], [4736787, 69995, "Piscine du Lac", 0], [4736800, 70686, "Les Fontaines", 0], [4736601, 70847, "", 1], [4736519, 70429, "Françoise Maral", 0], [4736379, 70175, "", 1], [4736283, 69652, "", 1], [4735976, 69759, "Bergeonnerie", 0], [4735618, 69875, "Campus Grandmont", 0], [4735025, 70063, "Les Perriers", 0], [4734717, 70631, "Porte des Arts", 0], [4734609, 70932, "CHRU Trousseau", 0], [4734270, 71852, "Chambray Centre", 0], [4733892, 72864, "Lycée agricole", 0], [4733543, 73802, "Papoterie", 0]];
/* BHNS (ex-ligne de bus 2), points relevés sur la carte officielle lignes2tram.fr */
const PLAN_BHNS = [[4737978, 71819, "Atlantes", 0], [4737817, 71097, "Leccia", 0], [4738029, 70797, "Champ Joli", 0], [4738190, 70531, "Rotonde", 0], [4738153, 70255, "Mermoz", 0], [4738128, 69735, "Saint-Paul", 0], [4737992, 69399, "Liberté", 0], [4738383, 69078, "Boisdenier", 0], [4738647, 68975, "Salengro", 0], [4738911, 68931, "Jean Jaurès", 0], [4739082, 69306, "Gare de Tours", 0], [4739178, 69930, "Mirabeau", 0], [4739548, 69956, "Ursulines", 0], [4740006, 70031, "", 1], [4740597, 70290, "Passerelle", 0], [4740858, 70319, "IUT", 0], [4741213, 70294, "Chopin", 0], [4741785, 70399, "Maréchal Juin", 0], [4742211, 70601, "Lycée Vaucanson", 0], [4742370, 70958, "Vaucanson", 0], [4742600, 70850, "Méliès", 0], [4742761, 70558, "Aérogare", 0], [4742783, 70104, "Torricelli", 0], [4742721, 69731, "Petite Arche", 0], [4742435, 69730, "Luxembourg", 0], [4742338, 69112, "Coppée", 0], [4742687, 69111, "LP Clouet", 0], [4742921, 69105, "Thalès", 0], [4743198, 68700, "Abbaye Gatines", 0], [4743380, 68644, "Lycée Choiseul", 0], [4743615, 68493, "Les Douets", 0]];
const STORE_LIGNES = () => ({
  cr: lines.filter(l => !l.exist && !l.plan).map(l => ({ t: l.type, n: l.name, c: l.col, s: l.stops })),
  ed: lines.filter(l => l.exist || l.plan).map(l => ({ id: l.id, d: l.deleted ? 1 : 0, ch: l.deleted !== !!l.defDel, rm: l.orig ? [...l.orig].filter(i => !l.ways.has(i)).map(i => ways[i].id) : [], ad: l.orig ? [...l.ways].filter(i => !l.orig.has(i)).map(i => ways[i].id) : [] })).filter(e => e.ch || e.rm.length || e.ad.length)
});
const saveLines = () => lsSet(STORE_L, STORE_LIGNES());

/* tracé d'une ligne : démarrage, arrêts, fin */
function startLine(type, first, edit) {
  clearSel(); activeLine = null;
  if (type === 'tram') FL.tram = true; else FL.bus = true;
  FL.stops = true; renderFilters();
  drawMode = { type, col: edit ? edit.col : colorFor(type), stops: [], segs: [], len: 0, ways: new Set(), edit: edit || null };
  if (edit) {
    const nodes = edit.stops.map(([la, lo]) => nodeOfStop(la, lo, type));
    drawMode.stops = edit.stops.map(([la, lo], i) => ({ id: nodes[i], la, lo }));
    drawMode.segs = edit.segs.slice(); drawMode.len = edit.len; drawMode.ways = new Set(edit.ways);
    $('#tName').value = edit.name;
  } else $('#tName').value = (type === 'tram' ? 'Tram ' : 'Bus ') + (lines.filter(l => !l.exist && !l.plan && l.type === type).length + 1);
  $('#tramBtn').classList.toggle('on', type === 'tram'); $('#busBtn').classList.toggle('on', type === 'bus');
  if (first) addStop(first);
  renderSheet(); requestDraw();
}
function addStop(nd) {
  const m = drawMode, last = m.stops[m.stops.length - 1];
  if (last && last.id === nd.id) return;
  if (last) {
    const r = route(last.id, nd.id, m.type);
    if (!r) { toast('Aucun chemin entre ces deux arrêts'); return; }
    m.segs.push(r.xy); m.len += r.len; for (const w of r.ways) m.ways.add(w);
  }
  m.stops.push({ id: nd.id, la: nd.la, lo: nd.lo });
  renderSheet(); requestDraw();
}
function popStop() {
  const m = drawMode; if (!m || !m.stops.length) return;
  m.stops.pop();
  if (m.segs.length) { const s = m.segs.pop(); m.len -= segLen(s); }
  // recalcul des rues touchées
  m.ways = new Set(); const nodes = m.stops.map(s => s.id);
  for (let i = 1; i < nodes.length; i++) { const r = route(nodes[i-1], nodes[i], m.type); if (r) for (const w of r.ways) m.ways.add(w); }
  renderSheet(); requestDraw();
}
function segLen(xy) { let l = 0; for (let i = 2; i < xy.length; i += 2) l += Math.hypot(xy[i] - xy[i-2], xy[i+1] - xy[i-1]); return l; }
function endLine(save) {
  const m = drawMode; if (!m) return;
  drawMode = null; $('#tramBtn').classList.remove('on'); $('#busBtn').classList.remove('on');
  if (save && m.stops.length >= 2) {
    pushSnap();
    const name = $('#tName').value.trim() || (m.type === 'tram' ? 'Tram' : 'Bus');
    let l = m.edit;
    if (l) Object.assign(l, { name, stops: m.stops.map(s => [s.la, s.lo]), segs: m.segs, len: m.len, ways: m.ways, _p: null });
    else { l = { id: 'c' + Date.now(), type: m.type, exist: false, ref: '', name, col: m.col, stops: m.stops.map(s => [s.la, s.lo]), segs: m.segs, len: m.len, ways: m.ways, deleted: false }; lines.push(l); }
    refreshLines(); saveLines();
    let msg = name + ' enregistrée';
    if (m.type === 'tram') { const n = tramIntoProfiles(m.ways); if (n) msg += ' · tram ajouté à ' + n + (n > 1 ? ' coupes' : ' coupe'); }
    activeLine = l; tab = 'lines'; toast(msg);
  }
  renderSheet(); requestDraw();
}
/* le tram entre dans les coupes des rues qu'il emprunte */
function tramIntoProfiles(wset) {
  const done = new Set(); let n = 0;
  for (const i of wset) {
    const cl = clusterOf(i), key = profKey(cl); if (done.has(key)) continue; done.add(key);
    const pr = profiles[key];
    if (!pr) continue;
    if (pr.est) { delete profiles[key]; continue; }
    if (pr.items.some(t => t.t === 'tram' || t.t === 'tramcar')) continue;
    const mid = Math.max(1, Math.floor(pr.items.length / 2));
    pr.items.splice(mid, 0, { t: 'tram', w: 3 }, { t: 'tram', w: 3 });
    const f = fitItems(pr.items, pr.W);       /* la largeur de la rue ne change pas */
    pr.items = f.items; pr.dropped = (pr.dropped || 0) + f.dropped.filter(x => x === 'car').length; pr.shared = (pr.shared || 0) + f.dropped.filter(x => x === 'shared').length; n++;
  }
  saveProfiles(); return n;
}
const tramTracks = cluster => cluster.some(i => tramOld.has(i) || tramNew.has(i)) ? 2 : 0;
