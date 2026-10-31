// Chapter 4. Real bound smoothing on real contacts, then how the same geometry is wired into the Evoformer.
import * as THREE from 'three';
import { Quilt, Threads, STOCK } from '../world.js';
import { copyBounds, makeBounds, meanOverestimate, restrain, smooth, violatedByTruth } from '../science/bounds.js';
import { meanFieldDCA } from '../science/dca.js';
import { uniformWeights } from '../science/msa.js';
import { vec } from '../science/frames.js';
import { ambient, apc, chart, compressColumns, fmt, frameBoard, pct, PaperProtein, theFamily } from './common.js';

const BUDGET = 12;

export default {
  id: 'triangles',
  title: 'Triangles',
  tease: 'Three distances must close a triangle. Watch a few contacts bring a whole map\'s ceilings down.',
  principle: 'A table of pairs only describes a real shape if every three residues close a triangle. So one fact about a pair says something about many others. AlphaFold2 lets each pair read the other two sides of all its triangles. Nothing forces consistency: the wiring gives training the chance to learn it.',
  goals: ['Bring the mean overshoot under 45 Å using 12 contacts.', 'Bring it under 42 Å using only 6.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>Bound smoothing</b> keeps a ceiling U and a floor L on every distance. For any third residue k, U(i,j) ≤ U(i,k) + U(k,j), and L(i,j) ≥ L(i,k) − U(k,j). The classic algorithm (Crippen; Dress and Havel) repeats this over all k, in about a million steps for this chain, and it runs live here. The chain gives 3.8 Å between neighbouring C-alpha atoms, with a floor of 2.9 Å for a cis peptide bond, and residues missing from the alignment count as extra steps. A contact sets a ceiling of 10 Å on C-alpha, and every other pair has a floor of 3.2 Å.</p>
    <p><b>The score.</b> The mean of (ceiling − real distance) over all pairs of the 109 residues, measured against 3CHY, with a ceiling below the real distance counted as zero. So a false contact is never penalised here, and the best-scoring picks include false ones: the best single pin on this map is a false contact. Even at the end the ceilings sit far above the real distances, whose mean is about 17 Å. The real structure is used only to score you.</p>
    <p><b>The candidates</b> are the 40 best pairs from chapter 2, live: mean-field DCA with APC. Some are wrong, as they are in real use. A wrong contact tightens the map too, so the score improves even though the contact is false.</p>
    <p><b>In AlphaFold2.</b> There are four triangle operations in each of the 48 Evoformer blocks: multiplicative updates using outgoing and incoming edges (Algorithms 11 and 12), and attention around the starting and ending node (Algorithms 13 and 14), with 4 heads. An update to edge ij reads edges ik and jk, or ki and kj, summed over all k.</p>
    <p><b>The on and off chips</b> are a teaching model with values of 0 or 1 and a fixed sharpness. The multiplicative sum is Σ<sub>k</sub> a<sub>ik</sub> b<sub>jk</sub>. AlphaFold2's line is g<sub>ij</sub> ⊙ Linear(LayerNorm(Σ<sub>k</sub> a<sub>ik</sub> ⊙ b<sub>jk</sub>)) (Algorithms 11 and 12, line 4), so a normalising step and a learned gate follow the sum, and a and b are signed numbers that can cancel. The game leaves those out. Attention shares come from a softmax over k of a bias from side jk, and the result is the shares times side ik (Algorithm 13, with the query-key term left out).</p>
    <p><b>Nothing is enforced.</b> AF2 does not compute a minimum, and it does not check the inequality. The paper says the updates are "inspired by the necessity of consistency" and arranged "in terms of triangles of edges". Whether the result obeys the inequality comes from training. The "axial attention" ablation, which removes triangles, pair bias and gating together, lowered lDDT-Cα by about 1 to 3 at most depths, read by eye from Supplementary Fig. 10.</p>
    <p class="small">Sources: Jumper et al., Nature 2021, main text and Supplement 1.6.5, 1.6.6, 1.13. Crippen 1977. Dress and Havel 1988.</p>`,

  async setup(run) {
    const f = run.state.f = theFamily();
    const c = compressColumns(f.X, f.N, f.L, 6);
    const S = apc(await run.budget(meanFieldDCA(c.Y, f.N, f.L, c.qi, uniformWeights(f.N).w, 0.5)), f.L);
    const n = run.state.n = f.mapped, ca = run.state.ca = f.idx.map((r) => f.che.ca[r]);
    const D = run.state.D = new Float32Array(n * n);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) D[i * n + j] = vec.dist(ca[i], ca[j]);
    run.state.cand = f.score(S).pairs.slice(0, 40).map(([, i, j]) => ({ i: f.posOf.get(i), j: f.posOf.get(j), good: f.touching(i, j) }));
    run.state.base = makeBounds(n, { nums: f.idx.map((r) => f.che.nums[r]) });
    smooth(run.state.base);
  },
  stages: [one, snap, repair, wiring, ways, check],
};

async function one(run) {
  const { ui, world, sound } = run, { f } = run.state;
  const col = (num) => f.idx.findIndex((r) => f.che.nums[r] === num);
  const [a, b, c] = [13, 57, 109].map(col).map((i) => f.idx[i]), che = f.che;
  const m = run.scoped(new PaperProtein(world, che, { stock: () => STOCK.good, scale: 1.5, center: [0, 22, 0], spin: 0.05, size: 1.6 }));
  m.angle = 0.6; m.update();
  frameBoard(run, 70, 74, { polar: 0.14, at: [0, 12, 0], seconds: 0 });
  world.shadowSpan(110);
  run.scoped({ dispose: () => world.shadowSpan(80) });
  const th = run.scoped(new Threads(world, 4, { width: 0.5 }));
  const p = [che.cb[a], che.cb[b], che.cb[c]];
  const ab = vec.dist(p[0], p[1]), bc = vec.dist(p[1], p[2]), ac = vec.dist(p[0], p[2]);
  let shown = false;
  const paint = () => { th.clear(); th.add(p[0], p[1], '#0053d6', 0.55, m.group); th.add(p[1], p[2], '#0053d6', 0.55, m.group); if (shown) th.add(p[0], p[2], '#ff7d45', 0.45, m.group); };
  run.tick(paint);
  ui.tags('real');
  ui.reads([{ value: `${fmt(ab, 1)} Å`, label: 'D13 to D57' }, { value: `${fmt(bc, 1)} Å`, label: 'D57 to K109' }]);
  await run.line('Three real residues at the working heart of CheY. Two of the distances are measured here.');
  const box = document.createElement('canvas');
  box.className = 'chart'; box.style.height = '110px';
  const draw = (x) => {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = box.clientWidth || 300, H = 110;
    box.width = W * dpr; box.height = H * dpr;
    const g = box.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = 6, ox = W / 2 - (x * s) / 2, oy = 96, closes = x <= ab + bc && x >= Math.abs(ab - bc);
    const A = [ox, oy], C = [ox + x * s, oy];
    g.lineWidth = 3; g.lineCap = 'round';
    g.strokeStyle = closes ? '#ff7d45' : '#c33b12';
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(C[0], C[1]); g.stroke();
    g.strokeStyle = '#0053d6';
    if (closes) {
      const cos = (ab * ab + x * x - bc * bc) / (2 * ab * x), sin = Math.sqrt(Math.max(0, 1 - cos * cos)), B = [ox + ab * s * cos, oy - ab * s * sin];
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.stroke();
    } else {
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(A[0] + ab * s * 0.8, oy - ab * s * 0.6); g.stroke();
      g.beginPath(); g.moveTo(C[0], C[1]); g.lineTo(C[0] - bc * s * 0.8, oy - bc * s * 0.6); g.stroke();
    }
    g.fillStyle = '#26343f'; g.font = '13px "Alegreya Sans", sans-serif'; g.textAlign = 'center';
    g.fillText(closes ? 'It closes' : 'It cannot close', W / 2, 13);
  };
  ui.say('Drag the third side and try to break the triangle: how far can D13 be from K109?');
  let tooLong = false, ok = false;
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const s = ui.slider({ label: 'D13 to K109', min: 0, max: 30, step: 0.2, value: 8, format: (v) => `${v.toFixed(1)} Å`, onInput: (v) => { draw(v); sound.pick(Math.floor(v / 3)); if (v > ab + bc) tooLong = true; if (v <= ab + bc && v >= Math.abs(ab - bc)) ok = true; if (tooLong && ok) nxt.disabled = false; } });
    ui.ctrl(box, s, nxt);
    draw(8);
  });
  ui.ctrl();
  shown = true;
  ui.reads([{ value: `${fmt(ab + bc, 1)} Å`, label: 'the longest it could be' }, { value: `${fmt(ac, 1)} Å`, label: 'the real distance' }]);
  await run.line('This is the <b>triangle inequality</b>. No side can be longer than the other two together. You never measured that third distance, and you still knew a limit on it.');
}

// Colour for a distance ceiling: dark where the map is sure two residues are close, white where it knows nothing.
function shade(c, u) {
  const t = Math.min(1, Math.max(0, (Math.log(u) - Math.log(6)) / (Math.log(150) - Math.log(6))));
  if (t < 0.5) c.copy(STOCK.high).lerp(STOCK.good, t * 2); else c.copy(STOCK.good).lerp(STOCK.white, (t - 0.5) * 2);
  return c;
}

async function snap(run) {
  const { ui, world, sound } = run, { f, n, D, cand, base } = run.state;
  const quilt = run.scoped(new Quilt(world, n, {}));
  frameBoard(run, n + 5, n + 5);
  let b = copyBounds(base);
  const picks = [];
  const col = new THREE.Color();
  const paintAll = () => {
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) quilt.set(i, j, i === j ? STOCK.ink : shade(col, b.U[i * n + j]));
    quilt.commit();
  };
  paintAll();
  // Pins mark the candidates. They are large on purpose, and a tap snaps to the nearest one.
  const pins = run.scoped(new THREE.InstancedMesh(new THREE.CircleGeometry(1.25, 18).rotateX(-Math.PI / 2), world.paper({ glow: 0, bump: 0 }), cand.length));
  pins.frustumCulled = false; pins.castShadow = true;
  const place = () => {
    const M = new THREE.Matrix4();
    cand.forEach((c, k) => {
      const p = quilt.center(Math.min(c.i, c.j), Math.max(c.i, c.j));
      M.makeTranslation(p.x, 1.2, p.z);
      pins.setMatrixAt(k, M);
      pins.setColorAt(k, picks.includes(k) ? STOCK.poor : new THREE.Color('#fffdf8'));
    });
    pins.instanceMatrix.needsUpdate = true;
    pins.instanceColor.needsUpdate = true;
    world.shadowDirty = 2;
  };
  place();
  world.scene.add(pins);
  run.scoped({ dispose: () => { world.scene.remove(pins); pins.geometry.dispose(); pins.material.dispose(); } });
  const score = () => meanOverestimate(b, D);
  const start = score();
  const status = () => ui.reads([{ value: `${fmt(score(), 1)} Å`, label: 'mean overshoot of the map' }, { value: `${picks.length} of ${BUDGET}`, label: 'contacts used' }]);
  ui.tags('real', 'game');
  status();
  await run.line('This quilt holds a ceiling on the distance of every pair of 109 residues. Dark means the pair must be close, and white means the map knows little. So far it knows only that the chain is a chain.');
  await run.line('The white pins are the 40 best pairs from chapter 2. Tap one to say: these two touch.');
  run.probe.pin = (k) => { const c = cand[k]; return world.project(quilt.center(Math.min(c.i, c.j), Math.max(c.i, c.j))); };
  run.probe.cand = cand;
  const rebuild = () => {
    b = copyBounds(base);
    for (const k of picks) restrain(b, cand[k].i, cand[k].j, 3.2, 10);
    smooth(b);
  };
  const apply = (k, undo = false) => {
    const before = b.U.slice();
    if (undo) picks.splice(picks.indexOf(k), 1); else picks.push(k);
    rebuild();
    place();
    sound.fold();
    sound.rustle(4, 0.03);
    // The change spreads out across the quilt from the pair you touched.
    const c = cand[k], t0 = world.time, after = b.U;
    const wave = run.tick(() => {
      const r = (world.time - t0) * 140;
      for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const d = Math.min(Math.hypot(i - c.i, j - c.j), Math.hypot(i - c.j, j - c.i));
        quilt.set(i, j, shade(col, d < r ? after[i * n + j] : before[i * n + j]));
      }
      quilt.commit();
      if (r > n * 1.5) run.untick(wave);
    });
    status();
    if (score() <= 45 && picks.length <= BUDGET) run.reach(1);
    if (score() <= 42 && picks.length <= 6) run.reach(2);
    nxt.disabled = picks.length < 3;
    undoB.disabled = picks.length === 0;
  };
  const nxt = ui.button('Done', () => run.state.finish?.(), { id: 'next' });
  const undoB = ui.button('Undo', () => { if (picks.length) apply(picks[picks.length - 1], true); }, { quiet: true, id: 'undo' });
  nxt.disabled = true; undoB.disabled = true;
  ui.say('Get the overshoot under 45 Å, and then try it with only six pins: which pairs would pull furthest?');
  const off = run.pointer({ up: (x, y) => {
    let bestK = -1, bestD = 44;
    cand.forEach((c, k) => {
      const q = world.project(quilt.center(Math.min(c.i, c.j), Math.max(c.i, c.j))), d = Math.hypot(q.x - x, q.y - y);
      if (d < bestD) { bestD = d; bestK = k; }
    });
    if (bestK < 0) return;
    if (picks.includes(bestK)) apply(bestK, true);
    else if (picks.length < BUDGET) apply(bestK);
    else ui.say('That is all twelve, so undo one to swap it.');
  } });
  await run.until((done) => { run.state.finish = done; ui.ctrl(undoB, nxt); });
  off();
  ui.ctrl();
  const wrong = picks.filter((k) => !cand[k].good).length, out = violatedByTruth(b, D, 0.5) - violatedByTruth(base, D, 0.5);
  cand.forEach((c, k) => pins.setColorAt(k, c.good ? STOCK.high : STOCK.poor));
  pins.instanceColor.needsUpdate = true;
  ui.reads([{ value: `${fmt(start, 1)} to ${fmt(score(), 1)} Å`, label: 'overshoot, start to finish' }, { value: `${wrong} of ${picks.length}`, label: 'of your contacts were beyond 8 Å' }, { value: `${out}`, label: 'pairs now shut out from their true distance' }]);
  await run.line('Orange pins are pairs beyond our 8 Å C-beta rule. Some of them touch by their side chains, and some are truly false. A false contact pulls the map too, and can shut pairs out of their true distance. The score above cannot see that, so consistency needs a check.');
}

async function repair(run) {
  const { ui, sound } = run, { f, n, D } = run.state;
  ambient(run);
  ui.reads([]);
  ui.tags('real', 'game');
  const picks = [8, 26, 44, 60, 78, 100].map((i) => Math.min(n - 1, i));
  const label = picks.map((i) => `${f.che.seq[f.idx[i]]}${f.che.nums[f.idx[i]]}`);
  const T = picks.map((i) => picks.map((j) => D[i * n + j]));
  const bad = [1, 4];
  const shift = 21;
  T[bad[0]][bad[1]] += shift; T[bad[1]][bad[0]] += shift;
  const k = T.length;
  const broken = [];
  for (let a = 0; a < k; a += 1) for (let b = a + 1; b < k; b += 1) for (let c = 0; c < k; c += 1) {
    if (c === a || c === b) continue;
    if (T[a][b] > T[a][c] + T[c][b] + 1e-6) broken.push([a, b, c]);
  }
  await run.line('Real distances, six residues of CheY. One number in this table has been raised by the game, far enough that some triangles using it cannot close.');
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:42px repeat(${k},1fr);gap:2px;flex:1 1 100%;font-size:13.5px`;
  const cell = (t, attrs = '') => `<div style="display:grid;place-items:center;min-height:34px;${attrs}">${t}</div>`;
  grid.innerHTML = cell('') + label.map((l) => cell(`<b>${l}</b>`)).join('');
  let wrongFirst = false;
  const answered = run.until((done) => {
    T.forEach((row, a) => {
      grid.insertAdjacentHTML('beforeend', cell(`<b>${label[a]}</b>`));
      row.forEach((v, b) => {
        if (b <= a) { grid.insertAdjacentHTML('beforeend', cell('')); return; }
        const t = document.createElement('button');
        t.className = 'opt';
        t.dataset.cell = `${a},${b}`;
        t.style.cssText = 'padding:2px;min-height:36px;text-align:center;font-size:14px';
        t.textContent = v.toFixed(0);
        t.addEventListener('click', () => {
          sound.tap();
          const here = broken.filter(([x, y, z]) => (x === a && y === b) || [[x, z], [z, y]].some(([p, q]) => Math.min(p, q) === a && Math.max(p, q) === b));
          if (a === bad[0] && b === bad[1]) {
            t.classList.add('right');
            sound.good(1);
            done();
          } else {
            wrongFirst = true;
            t.classList.add('wrong');
            sound.soft();
            ui.say(here.length ? `That number sits in ${here.length} broken triangle${here.length > 1 ? 's' : ''}, but it also closes others, so look for the one in all of them.` : 'That number closes every triangle it is part of.');
          }
        });
        grid.append(t);
      });
    });
  });
  ui.say('Check some triangles, then tap the number that cannot be right.');
  ui.ctrl(grid);
  await answered;
  ui.ctrl();
  ui.say(`Found: the real value is ${(T[bad[0]][bad[1]] - shift).toFixed(0)} Å, and the game had added ${shift}.`);
  run.state.repairClean = !wrongFirst;
  const small = T.map((row) => row.slice());
  small[bad[0]][bad[1]] += 5 - shift; small[bad[1]][bad[0]] += 5 - shift;
  let still = 0;
  for (let c = 0; c < k; c += 1) if (c !== bad[0] && c !== bad[1] && small[bad[0]][bad[1]] > small[bad[0]][c] + small[c][bad[1]] + 1e-6) still += 1;
  await run.until((done) => { ui.ctrl(ui.button('Next', () => { ui.ctrl(); done(); }, { id: 'next' })); });
  await run.line(`A large error showed up because other pairs disagreed with it. A small one need not: add 5 Å to that cell in place of ${shift}, and ${still === 0 ? 'every triangle still closes' : `only ${still} would break`}.`);
}

async function wiring(run) {
  const { ui, world, sound } = run, { n, f } = run.state;
  const quilt = run.scoped(new Quilt(world, n, {}));
  frameBoard(run, n + 5, n + 5);
  // Three raised squares carry the lesson, because a single cell is too small to see on a phone.
  const chips = run.scoped(new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 0.7, 4.4), world.paper({ glow: 0, bump: 0.2 }), 3));
  chips.castShadow = true; chips.frustumCulled = false;
  world.scene.add(chips);
  run.scoped({ dispose: () => { world.scene.remove(chips); chips.geometry.dispose(); chips.material.dispose(); } });
  const col = new THREE.Color();
  const clear = () => { for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) quilt.set(i, j, col.set(i === j ? '#d4dde2' : '#fbf6ea')); };
  const I = 20, J = 75;
  let mode = 'out', K = 45;
  const paint = () => {
    clear();
    const set = (a, b, c) => quilt.set(a, b, c);
    for (let k = 0; k < n; k += 1) {
      if (mode === 'out') { set(I, k, STOCK.good); set(J, k, STOCK.good); } else { set(k, I, STOCK.good); set(k, J, STOCK.good); }
    }
    if (mode === 'out') { set(I, K, STOCK.poor); set(J, K, STOCK.poor); } else { set(K, I, STOCK.poor); set(K, J, STOCK.poor); }
    set(I, J, STOCK.high);
    quilt.commit();
    const M = new THREE.Matrix4();
    [[I, J, STOCK.high], ...(mode === 'out' ? [[I, K, STOCK.poor], [J, K, STOCK.poor]] : [[K, I, STOCK.poor], [K, J, STOCK.poor]])].forEach(([a, b, c], k) => {
      const p = quilt.center(a, b);
      M.makeTranslation(p.x, 1.2, p.z);
      chips.setMatrixAt(k, M);
      chips.setColorAt(k, c);
    });
    chips.instanceMatrix.needsUpdate = true;
    chips.instanceColor.needsUpdate = true;
    world.shadowDirty = 2;
  };
  paint();
  const nm = (i) => `${f.che.seq[f.idx[i]]}${f.che.nums[f.idx[i]]}`;
  ui.reads([]);
  ui.tags('paper');
  await run.line(`AlphaFold2 has no ruler. It has a table of numbers, one square per pair. Take the dark square: the pair ${nm(I)} and ${nm(J)}.`);
  await run.line('In the language of graphs, a residue is a <b>node</b> and a pair is an <b>edge</b> joining two nodes.');
  await run.line('Before updating that square, AlphaFold2 lets it read two others, one for each other side of a triangle with a third residue, k.');
  ui.tags('model');
  ui.say('Drag k along the chain: the two orange squares are what the dark square reads for that k.');
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    let moved = 0;
    const s = ui.slider({ label: 'Third residue', min: 0, max: n - 1, step: 1, value: K, format: (v) => nm(v), onInput: (v) => { K = v; paint(); sound.pick(v % 6); moved += 1; } });
    const tog = ui.button('Outgoing edges', (b) => { mode = mode === 'out' ? 'in' : 'out'; b.textContent = mode === 'out' ? 'Outgoing edges' : 'Incoming edges'; paint(); }, { quiet: true, id: 'edges' });
    ui.ctrl(s, tog, nxt);
  });
  ui.ctrl();
  ui.tags('paper');
  await run.line('The two versions read rows, <b>outgoing</b> edges, or columns, <b>incoming</b> edges, because the pair table has a direction: square ij need not equal square ji.');
  await run.line('Nothing here computes a minimum, and nothing forces the triangle inequality. AlphaFold2 only gets the wiring to look at triangles. Training teaches it what to do with them.');
}

// The two ways AlphaFold2 reads a triangle. Same six triangles, two formulas: the bare sum inside Algorithm 11 line 4,
// without its gate and normalising step, and Algorithm 13 lines 5 and 6.
async function ways(run) {
  const { ui, sound } = run, K = 6, SHARP = 3;
  ambient(run);
  ui.reads([]);
  ui.tags('model');
  await run.line('Each pair reads its triangles in two ways, the <b>triangle multiplicative update</b> and <b>triangle attention</b>. Try both on six third residues.');
  const a = new Array(K).fill(false), b = new Array(K).fill(false);
  const measure = () => {
    const mult = a.reduce((s, v, k) => s + (v && b[k] ? 1 : 0), 0);
    const logits = b.map((v) => (v ? SHARP : 0)), top = Math.max(...logits), raw = logits.map((v) => Math.exp(v - top)), z = raw.reduce((x, y) => x + y, 0), share = raw.map((v) => v / z);
    return { mult, share, att: share.reduce((s, v, k) => s + (a[k] ? v : 0), 0) };
  };
  const c = chart(ui, { height: 58 });
  const paint = () => {
    const m = measure();
    run.state.ways = m;
    ui.reads([{ value: `${m.mult}`, label: 'multiplicative: sum of products' }, { value: fmt(m.att), label: 'attention: shares times side i–k' }]);
    c.draw(m.share.map((v, k) => ({ value: v, label: `k${k + 1}`, text: pct(v), color: a[k] ? '#0053d6' : '#b8c9d4' })), { max: 1 });
    return m;
  };
  const grid = document.createElement('div');
  grid.className = 'sides';
  const row = (label, arr, key) => {
    grid.insertAdjacentHTML('beforeend', `<span>${label}</span>`);
    arr.forEach((_, k) => {
      const t = document.createElement('button');
      t.textContent = `k${k + 1}`;
      t.dataset.side = `${key}${k}`;
      t.addEventListener('click', () => { const before = measure().att; arr[k] = !arr[k]; t.classList.toggle('on', arr[k]); sound.pick(k); run.state.onChange?.(paint(), key, k, before); });
      grid.append(t);
    });
  };
  row('side i–k', a, 'a');
  row('side j–k', b, 'b');
  const setChips = (full) => { for (let k = 0; k < K; k += 1) { a[k] = b[k] = full.includes(k); grid.querySelector(`[data-side="a${k}"]`).classList.toggle('on', a[k]); grid.querySelector(`[data-side="b${k}"]`).classList.toggle('on', b[k]); } paint(); };
  const stepUntil = (text, test) => run.until((done) => {
    ui.say(text);
    run.state.onChange = (...args) => { if (test(...args)) { run.state.onChange = null; done(); } };
    ui.ctrl(c, grid);
    c.draw(measure().share.map((v, k) => ({ value: v, label: `k${k + 1}`, text: pct(v), color: a[k] ? '#0053d6' : '#b8c9d4' })), { max: 1 });
  });
  paint();
  await stepUntil('A chip is one side of a triangle with third residue k, so switch on both sides of one k.', (m) => m.mult >= 1);
  await run.sleep(500);
  await stepUntil('Keep going, and make the multiplicative sum reach 4.', (m) => m.mult >= 4);
  const read = (text) => run.until((done) => { ui.say(text); ui.ctrl(c, grid, ui.button('Next', () => done(), { id: 'next' })); paint(); });
  await read('The sum grows with every full triangle, but attention never goes above 1, because its shares add up to 100%.');
  ui.tags('model', 'paper');
  await read('In AlphaFold2 a normalising step follows this sum, so its output does not keep growing.');
  await read('What remains true is that multiplication has no shared budget across k, and attention does.');
  ui.tags('model');
  setChips([0, 1, 2, 3]);
  await stepUntil('Here are four full triangles, with k5 and k6 empty. Switch on side j–k of k5 or k6, and leave its side i–k off.', (m, key, k, before) => key === 'b' && b[k] && !a[k] && m.att < before);
  await run.until((done) => { ui.say('The sum did not move, since that triangle is incomplete, but attention fell: side j–k spent some of its share on a residue with nothing to offer.'); ui.ctrl(c, grid, ui.button('Next', () => done(), { id: 'next' })); paint(); });
  ui.ctrl();
  await run.choose('So what is the difference?', [
    { text: 'Multiplication sums over every k with no shared budget. In attention the third side steers a fixed 100%.', right: true, why: 'Right. The first counts evidence from all third residues. The second chooses whom to listen to, then averages.' },
    { text: 'Multiplication picks one third residue. Attention uses them all equally.', right: false, why: 'It is the other way round: multiplication sums over every k, and attention concentrates its shares.' },
    { text: 'They are the same formula.', right: false, why: 'Your numbers parted when you added triangles: one grew and the other never went above 1.' },
  ]);
  ui.tags('model', 'paper');
  await run.line('Attention comes in two versions, around the <b>starting node</b> or the <b>ending node</b>, like outgoing and incoming. AlphaFold2 runs all four in every block, with learned numbers in place of these on and off chips.');
}

async function check(run) {
  const { ui } = run;
  ambient(run);
  ui.tags('model');
  const first = await run.choose('A new case. A network says residue A is 6 Å from B, B is 7 Å from C, and A is 40 Å from C. What do you conclude?', [
    { text: 'A is far from C, as it said.', right: false, why: '6 + 7 is only 13. No shape in space can have that third side at 40.' },
    { text: 'No shape can do this, so at least one number is wrong.', right: true, why: 'Right. The three cannot close. The table is inconsistent, and something in it must change.' },
    { text: 'B must be in a loop.', right: false, why: 'Loops are still in space. The triangle has to close in any fold.' },
  ]);
  const second = await run.choose('You may add one more contact to a map. Which tells you the most?', [
    { text: 'Two residues 5 apart in the sequence.', right: false, why: 'The chain already limits those two to within 19 Å. You gain little.' },
    { text: 'Two residues 80 apart in the sequence.', right: true, why: 'Yes. It is a long shortcut, and it shortens the path between all the residues on both sides. Your own run showed that.' },
    { text: 'They all tell you the same.', right: false, why: 'Your overshoot number moved far more for some pins than for others.' },
  ]);
  if (first && second) run.reach(3);
}
