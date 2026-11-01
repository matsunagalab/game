// The game's model against real-water MD, by the same definitions as tools/md_analyse.py and tools/md_pull_analyse.py.
//   node tools/compare_md.mjs <homeodomain md json> <gb1 md json> [folder of pull-*.json] > compare.json
// Native state: occupancy of every hydrogen bond and salt bridge, partner turnover, and how many partners a site has.
// Pull: which backbone bonds break, and which come back, for the same residues pulled the same distance.
// The native numbers helped choose a few parameters, so they are a fit. The pull numbers were not used for anything, so they are a test.
import { readFileSync, readdirSync } from 'node:fs';
import { buildModel, step, holdStill, holdTurn, hbonds, oilContacts, saltBridges, atomLabel, rmsd, Watch, bondName } from '../src/science/pull.js';

const ROOT = new URL('..', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('src/data/proteins.json', ROOT)));
const params = JSON.parse(readFileSync(new URL('src/data/grab-params.json', ROOT)));
const coords = (s) => { const b = Buffer.from(s, 'base64'); return Float32Array.from(new Int16Array(b.buffer, b.byteOffset, b.length / 2), (v) => v / 100); };
const u16 = (s) => { const b = Buffer.from(s, 'base64'); return new Uint16Array(b.buffer, b.byteOffset, b.length / 2); };
const load = (key) => { const p = raw.find((x) => x.key === key); return { ...p, n: p.seq.length, atomXYZ: coords(p.atoms.xyz), atomRes: u16(p.atoms.res) }; };
const STEPS = 12;
const SEEDS = +(process.env.SEEDS ?? 6);
const FRAMES = +(process.env.FRAMES ?? 1500);
const LAGS = [6, 30, 60, 120, 240, 480];
const OPTS = JSON.parse(process.env.OPTS ?? '{}');

const mean = (l) => l.reduce((t, v) => t + v, 0) / l.length;
const pearson = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let s = 0, u = 0, v = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); u += (a[i] - ma) ** 2; v += (b[i] - mb) ** 2; }
  return s / Math.sqrt(u * v);
};
const ranks = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
const spearman = (a, b) => pearson(ranks(a), ranks(b));
const isBackbone = (k) => /:N-.*:O$/.test(k);

function native(key, md) {
  const p = load(key);
  const occ = {};
  for (const r of md.runs) for (const [k, v] of Object.entries(r.hbonds)) occ[k] = (occ[k] ?? 0) + v / md.runs.length;
  const seen = new Map();
  const salts = new Map();
  let samples = 0, oilSum = 0, ca = 0, heavyR = 0, nr = 0;
  const keep = {};
  const partners = new Map();
  const oilPartners = new Map();
  for (let s = 1; s <= SEEDS; s++) {
    const m = buildModel(p, params, { seed: s * 7919 + 1, ...OPTS });
    const heavy = [];
    m.atoms.forEach((a, i) => { if (a.el !== 'H') heavy.push(i); });
    step(m, 2400);
    const hist = [];
    for (let f = 0; f < FRAMES; f++) {
      step(m, STEPS);
      holdStill(m);
      holdTurn(m, 0.1);
      if (f % 6 === 0) {
        const hb = hbonds(m);
        const oil = oilContacts(m);
        samples++;
        oilSum += oil.length;
        for (const k of hb) {
          const [d, a] = k.split('-').map(Number);
          const l = `${atomLabel(m, d)}-${atomLabel(m, a)}`;
          seen.set(l, (seen.get(l) ?? 0) + 1);
          (partners.get(d) ?? partners.set(d, new Map()).get(d)).set(a, ((partners.get(d)?.get(a)) ?? 0) + 1);
        }
        for (const k of oil) {
          const i = Math.floor(k / 100000), j = k % 100000;
          for (const [x, y] of [[i, j], [j, i]]) (oilPartners.get(x) ?? oilPartners.set(x, new Map()).get(x)).set(y, ((oilPartners.get(x)?.get(y)) ?? 0) + 1);
        }
        for (const k of saltBridges(m)) {
          const a = Math.floor(k / 1000), b = k % 1000;
          const l = `${p.seq[a]}${p.resno[a]}-${p.seq[b]}${p.resno[b]}`;
          salts.set(l, (salts.get(l) ?? 0) + 1);
        }
        const bb = hb.filter((k) => { const [d, a] = k.split('-').map(Number); return m.atoms[d].name === 'N' && m.atoms[a].name === 'O'; });
        const res = new Set(oil.map((k) => { const a = m.atoms[Math.floor(k / 100000)].res, b = m.atoms[k % 100000].res; return a * 1000 + b; }));
        hist.push({ bb: new Set(bb), side: new Set(hb.filter((k) => !bb.includes(k))), oil: new Set(oil), res });
      }
      if (f % 30 === 0) { ca += rmsd(m.X, m.X0, m.ca); heavyR += rmsd(m.X, m.X0, heavy); nr++; }
    }
    for (const lag of LAGS) {
      const d = Math.round(lag / 6);
      for (const name of ['bb', 'side', 'oil', 'res']) {
        let hit = 0, all = 0;
        for (let i = 0; i + d < hist.length; i++) { for (const k of hist[i][name]) { all++; if (hist[i + d][name].has(k)) hit++; } }
        (keep[name] ??= {});
        (keep[name][lag] ??= []).push(hit / all);
      }
    }
  }
  const neff = (groups) => {
    const out = [];
    for (const m of groups.values()) {
      const v = [...m.values()];
      const t = v.reduce((a, b) => a + b, 0);
      if (t / samples < 0.2) continue;
      out.push(Math.exp(-v.reduce((s, x) => s + (x / t) * Math.log(x / t), 0)));
    }
    return mean(out);
  };
  const mo = {};
  for (const [k, v] of seen) mo[k] = v / samples;
  const keys = [...new Set([...Object.keys(occ), ...Object.keys(mo)])];
  const bb = keys.filter(isBackbone);
  const sc = keys.filter((k) => !isBackbone(k));
  const col = (ks, o) => ks.map((k) => o[k] ?? 0);
  // Salt bridges: MD names them base first or acid first by file order, so they are compared as an unordered pair.
  const unordered = (k) => k.split('-').sort().join('-');
  const sm = {};
  for (const r of md.runs) for (const [k, v] of Object.entries(r.salt)) sm[unordered(k)] = (sm[unordered(k)] ?? 0) + v / md.runs.length;
  const sg = {};
  for (const [k, v] of salts) sg[unordered(k)] = v / samples;
  const sk = [...new Set([...Object.keys(sm), ...Object.keys(sg)])];
  const sum = (o, f) => Object.entries(o).filter(([k]) => f(k)).reduce((t, [, v]) => t + v, 0);
  const mdMean = (k) => mean(md.runs.map(k));
  return {
    key,
    md: {
      ns: md.runs.map((r) => r.ns), ca: mdMean((r) => r.rmsdCa), core: mdMean((r) => r.rmsdCore), heavy: mdMean((r) => r.rmsdHeavy), backbone: sum(occ, isBackbone), side: sum(occ, (k) => !isBackbone(k)), oil: mdMean((r) => r.oilTotalMean),
      neffDonor: mdMean((r) => r.neffHbondDonor), neffOil: mdMean((r) => r.neffOilAtom), controlOilKeep: md.runs.map((r) => r.controlOilKeep), controlBackbone: md.runs.map((r) => r.controlBackbone), controlSide: md.runs.map((r) => r.controlSide),
      keep: { backbone: md.runs.map((r) => r.keepHbondBackbone), side: md.runs.map((r) => r.keepHbondSide), oilAtom: md.runs.map((r) => r.keepOilAtom), oilResidue: md.runs.map((r) => r.keepOilResidue) },
      salt: sm,
    },
    game: {
      ca: ca / nr, heavy: heavyR / nr, backbone: sum(mo, isBackbone), side: sum(mo, (k) => !isBackbone(k)), oil: oilSum / samples, neffDonor: neff(partners), neffOil: neff(oilPartners),
      keep: Object.fromEntries(Object.entries(keep).map(([n, v]) => [n, Object.fromEntries(Object.entries(v).map(([l, x]) => [l, +mean(x).toFixed(3)]))])), salt: sg,
    },
    r: { backbone: pearson(col(bb, occ), col(bb, mo)), side: pearson(col(sc, occ), col(sc, mo)), spearmanBackbone: spearman(col(bb, occ), col(bb, mo)), salt: pearson(col(sk, sm), col(sk, sg)) },
  };
}

// The rest control, by the same two windows as the MD one: held over 70% in the first, present over 50% in the second, 4 s apart.
function control(key) {
  const p = load(key);
  const out = { backbone: [], side: [], oil: [] };
  for (let s = 1; s <= SEEDS; s++) {
    const m = buildModel(p, params, { seed: s * 2003, ...OPTS });
    step(m, 240);
    holdStill(m);
    const win = () => {
      const c = new Map(), o = new Map();
      let n = 0;
      for (let f = 0; f < 60; f++) {
        step(m, STEPS);
        holdStill(m);
        holdTurn(m, 0.1);
        if (f % 3 === 0) {
          n++;
          for (const k of hbonds(m)) c.set(k, (c.get(k) ?? 0) + 1);
          for (const k of oilContacts(m)) o.set(k, (o.get(k) ?? 0) + 1);
        }
      }
      return { c, o, n };
    };
    const bb = (k) => { const [d, a] = k.split('-').map(Number); return m.atoms[d].name === 'N' && m.atoms[a].name === 'O'; };
    for (let w = 0; w < 4; w++) {
      const a = win();
      for (let f = 0; f < 180; f++) { step(m, STEPS); holdStill(m); holdTurn(m, 0.1); }
      const b = win();
      const on = [...a.c].filter(([, v]) => v / a.n > 0.7).map(([k]) => k);
      const keep = (l) => l.filter((k) => (b.c.get(k) ?? 0) / b.n > 0.5).length / Math.max(1, l.length);
      out.backbone.push(keep(on.filter(bb)));
      out.side.push(keep(on.filter((k) => !bb(k))));
      const ol = [...a.o].filter(([, v]) => v / a.n > 0.5).map(([k]) => k);
      out.oil.push(ol.filter((k) => (b.o.get(k) ?? 0) / b.n > 0.5).length / Math.max(1, ol.length));
    }
  }
  return { backbone: mean(out.backbone), side: mean(out.side), oil: mean(out.oil) };
}

// The game's pull on the residues and distance of the MD pull. Reference, held and end windows mirror the MD ones.
function pull(key, no, side, seed) {
  const p = load(key);
  const m = buildModel(p, params, { seed: seed * 6113 + no, ...OPTS });
  step(m, 240);
  holdStill(m);
  const take = (frames, fn) => {
    const c = new Map(), oil = new Map();
    let n = 0;
    for (let f = 0; f < frames; f++) {
      fn?.(f);
      step(m, STEPS);
      holdStill(m);
      if (!m.pull) holdTurn(m, 0.1);
      if (f % 3 === 0) {
        n++;
        for (const k of hbonds(m)) c.set(k, (c.get(k) ?? 0) + 1);
        for (const k of oilContacts(m)) oil.set(k, (oil.get(k) ?? 0) + 1);
      }
    }
    return { hb: new Map([...c].map(([k, v]) => [k, v / n])), oil: new Map([...oil].map(([k, v]) => [k, v / n])) };
  };
  const ref = take(60);
  const steady = [...ref.hb].filter(([, v]) => v > 0.7).map(([k]) => k);
  const watch = new Watch(m, new Map(steady.map((k) => [k, ref.hb.get(k)])));
  const order = [];
  const r = p.resno.indexOf(no);
  const grp = [];
  m.atoms.forEach((a, i) => {
    if (side ? a.res === r && a.el !== 'H' && !['N', 'CA', 'C', 'O', 'CB'].includes(a.name) : Math.abs(a.res - r) <= 1 && ['N', 'CA', 'C', 'O', 'CB'].includes(a.name)) grp.push(i);
  });
  const cen = (l) => [0, 1, 2].map((k) => l.reduce((t, i) => t + m.X[i * 3 + k], 0) / l.length);
  const g = cen(grp), c = cen([...Array(m.N).keys()]);
  const o = [0, 1, 2].map((k) => g[k] - c[k]);
  const L = Math.hypot(...o);
  m.pull = { atoms: grp, k: 6, cap: 45, x: g[0], y: g[1], z: g[2] };
  // The hand moves until the grip has really travelled as far as in the MD pulls, about 5.2 A. Its spring is softer than the MD one, so its target runs ahead.
  let reach = 0;
  let ticks = 0;
  const follow = () => {
    const at = m.pull.at ?? g;
    const moved = ((at[0] - g[0]) * o[0] + (at[1] - g[1]) * o[1] + (at[2] - g[2]) * o[2]) / L;
    if (moved < 5.2) reach += 0.2;
    if (++ticks % 2 === 0) for (const e of watch.check(m.X, Math.hypot(at[0] - g[0], at[1] - g[1], at[2] - g[2]))) if (e.type === 'snap' && e.bond.backbone) order.push(bondName(m, e.bond));
    m.pull.x = g[0] + (o[0] / L) * reach;
    m.pull.y = g[1] + (o[1] / L) * reach;
    m.pull.z = g[2] + (o[2] / L) * reach;
  };
  take(90, follow);
  const held = take(40, follow);
  m.pull = null;
  take(240);
  const end = take(60);
  const bb = (k) => { const [d, a] = k.split('-').map(Number); return m.atoms[d].name === 'N' && m.atoms[a].name === 'O'; };
  const name = (k) => { const [d, a] = k.split('-').map(Number); const one = (i) => `${p.seq[m.atoms[i].res]}${p.resno[m.atoms[i].res]}`; return `${one(d)}-${one(a)}`; };
  const broke = steady.filter((k) => (held.hb.get(k) ?? 0) < 0.2);
  const oilRef = [...ref.oil].filter(([, v]) => v > 0.5).map(([k]) => k);
  return {
    order: order.map((n) => n.replace('–', '-')), steady: steady.length, steadyBackbone: steady.filter(bb).length, broke: broke.length, brokeBackbone: broke.filter(bb).length, backSame: broke.filter((k) => (end.hb.get(k) ?? 0) > 0.5).length,
    backSameBackbone: broke.filter((k) => bb(k) && (end.hb.get(k) ?? 0) > 0.5).length, brokeNames: broke.filter(bb).map(name).sort(),
    oilKeep: oilRef.filter((k) => (end.oil.get(k) ?? 0) > 0.5).length / Math.max(1, oilRef.length), oilRef: [...ref.oil.values()].reduce((a, b) => a + b, 0), oilHeld: [...held.oil.values()].reduce((a, b) => a + b, 0), oilEnd: [...end.oil.values()].reduce((a, b) => a + b, 0),
  };
}

const [enh, gb, folder] = process.argv.slice(2);
const out = { native: [native('homeodomain', JSON.parse(readFileSync(enh))), native('gb1', JSON.parse(readFileSync(gb)))], pulls: [] };
for (const n of out.native) n.game.control = control(n.key);
if (folder) {
  for (const f of readdirSync(folder).filter((x) => x.startsWith('pull-') && x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(`${folder}/${f}`));
    if (!d.runs?.length) continue;
    const key = d.tag === 'enh' ? 'homeodomain' : 'gb1';
    const no = parseInt(d.site, 10);
    const side = d.site.endsWith('sc');
    const game = Array.from({ length: 8 }, (_, i) => pull(key, no, side, i + 1));
    const counts = (rows) => { const c = {}; for (const r of rows) for (const n of new Set(r.brokeNames)) c[n] = (c[n] ?? 0) + 1 / rows.length; return c; };
    const a = counts(d.runs), b = counts(game);
    const meanRank = (rows) => {
      const r = {};
      for (const o of rows) (o.order ?? []).forEach((n, i) => (r[n] ??= []).push(i / Math.max(1, o.order.length - 1)));
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, mean(v)]));
    };
    const ra = meanRank(d.runs), rb = meanRank(game);
    const both = Object.keys(ra).filter((k) => k in rb);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    out.pulls.push({ key, site: d.site, runs: d.runs.length, md: {
      brokeBackbone: mean(d.runs.map((r) => r.brokeBackbone)), back: mean(d.runs.map((r) => r.backSameBackbone / Math.max(1, r.brokeBackbone))), steady: mean(d.runs.map((r) => r.steady)), oilKeep: mean(d.runs.map((r) => r.oilKeep)), oilRatioHeld: mean(d.runs.map((r) => r.oilHeld / r.oilRef)), oilRatioEnd: mean(d.runs.map((r) => r.oilEnd / r.oilRef)), newPartner: mean(d.runs.map((r) => r.newPartner)), broke: a,
    }, game: {
      brokeBackbone: mean(game.map((r) => r.brokeBackbone)), back: mean(game.map((r) => r.backSameBackbone / Math.max(1, r.brokeBackbone))), steady: mean(game.map((r) => r.steady)), oilKeep: mean(game.map((r) => r.oilKeep)), oilRatioHeld: mean(game.map((r) => r.oilHeld / r.oilRef)), oilRatioEnd: mean(game.map((r) => r.oilEnd / r.oilRef)), broke: b,
    }, overlap: keys.length ? pearson(keys.map((k) => a[k] ?? 0), keys.map((k) => b[k] ?? 0)) : null, sameBonds: both.length, orderR: both.length >= 3 ? spearman(both.map((k) => ra[k]), both.map((k) => rb[k])) : null, firstMD: Object.keys(ra).sort((x, y) => ra[x] - ra[y]), firstGame: Object.keys(rb).sort((x, y) => rb[x] - rb[y]) });
  }
}
console.log(JSON.stringify(out));
