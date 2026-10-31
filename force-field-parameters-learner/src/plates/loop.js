// The end of the game: the real development loop. The player sees finite samples only.
// Plate XI asks whether a missing state is the force field's fault or the run's.
// Plate XII is the loop itself: simulate, reweight, fit, simulate, and face a test the fit never saw.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Burst, Links, INK } from '../gfx.js';
import { INKS } from '../panel.js';
import { Ribbon } from './ribbon.js';
import { stats, meltingT, RIVAL, CORE, NAMES, MISFOLDED, NATIVE_F, MISFOLD, EXTENDED, KNOBS, STOCK_P, classify } from '../physics/fold.js';
import { Run, Project, gaps, targets, judge, misses, TOL, RUN_STEPS, PULLS, SAMPLE_EVERY, TRAPPED_HOPS, SALT, DENATURANT } from '../physics/reweight.js';
import { CaseBook } from '../physics/cases.js';

const COLS = ['#f0bb45', '#7fb2e8', '#63e6da', '#ff8a70', '#eaf3f4'];
const INKC = [INK.gold, INK.blue, INK.aqua, INK.red, INK.white];
const CN = 16;

// Everything the game knows about a chain conformation, centred, as a smooth tube with beads on it.
class Chain3D {
  constructor(parent, color, { tube = 0.17, bead = 0.24 } = {}) {
    this.g = new THREE.Group();
    this.ribbon = new Ribbon(CN, { color, width: tube, thick: tube, seg: 6, ring: 8 });
    this.atoms = new Atoms(CN, { detail: 2 });
    this.beadR = bead;
    for (let i = 0; i < CN; i++) this.atoms.setColor(i, color, 0.12);
    this.atoms.flush(true);
    this.water = new Atoms(6, { detail: 2 });
    for (let i = 0; i < 6; i++) { this.water.setColor(i, INK.aqua, 0.9); this.water.setAtom(i, 0, 0, -99, 0.001); }
    this.water.flush(true);
    this.g.add(this.ribbon, this.atoms, this.water);
    parent.add(this.g);
    this.ca = new Float64Array(3 * CN); this.gd = new Float64Array(3 * CN);
    this.at = new Float64Array(3 * CN);
    this.started = false;
  }
  set(x, y, z, wet, u = 1) {
    let ax = 0, ay = 0, az = 0;
    for (let i = 0; i < CN; i++) { ax += x[i]; ay += y[i]; az += z[i]; }
    ax /= CN; ay /= CN; az /= CN;
    const { at, ca, gd } = this, k = this.started ? u : 1;
    for (let i = 0; i < CN; i++) {
      at[3 * i] += (x[i] - ax - at[3 * i]) * k; at[3 * i + 1] += (y[i] - ay - at[3 * i + 1]) * k; at[3 * i + 2] += (z[i] - az - at[3 * i + 2]) * k;
      ca[3 * i] = at[3 * i]; ca[3 * i + 1] = at[3 * i + 1]; ca[3 * i + 2] = at[3 * i + 2];
      gd[3 * i] = 0.3; gd[3 * i + 1] = 0.9; gd[3 * i + 2] = 0.3;
      this.atoms.setAtom(i, at[3 * i], at[3 * i + 1], at[3 * i + 2], this.beadR);
    }
    this.started = true;
    this.atoms.flush();
    this.ribbon.update(ca, gd);
    for (let i = 0; i < 6; i++) {
      const w = wet?.[i];
      if (w) this.water.setAtom(i, w[0] - ax, w[1] - ay, w[2] - az, 0.3);
      else this.water.setAtom(i, 0, 0, -99, 0.001);
    }
    this.water.flush();
  }
  color(c) { this.ribbon.material.uniforms.uColor.value.copy(c); for (let i = 0; i < CN; i++) this.atoms.setColor(i, c, 0.12); this.atoms.flush(true); }
}

// What Plate XI says about each chain. Every sentence reports the evidence the player has just produced.
const TEXT = {
  trapped: {
    open: 'A long run from the native fold. <b>Is what it shows the force field, or did the run not cross?</b> Two checks first: run longer, and start in the misfold.',
    right: e => `Right. Replicas from different starts disagree by ${e.spread.toFixed(0)} points, so the populations mean nothing yet.`,
    wrong: x => `The referee finds ${x}%. Replicas from different starts disagree, so no run here can say.`,
  },
  absent: {
    open: 'A new force field. <b>Same question, same two checks.</b>',
    right: e => `Right. ${e.hops} hops and ${e.arrivals} ${e.arrivals === 1 ? 'arrival' : 'arrivals'} at the misfold: the chain moves freely and does not go there.`,
    wrong: x => `The referee finds ${x}%. The chain hops freely and does not go there: this one was the force field.`,
  },
  rare: {
    open: 'A short run on a chain that hops freely. <b>Same two checks, then count the arrivals.</b>',
    right: e => `Right. ${e.arrivals} arrivals, and the replicas agree. It is rare, and it is there.`,
    wrong: x => `The referee finds ${x}%. Rare is not absent: count the arrivals.`,
  },
};
const pctOf = p => { const v = p * 100; return v < 0.1 ? v.toFixed(3) : v.toFixed(1); };
const LONGER = 400000;

export class Sampling extends Plate {
  enter() {
    this.usePanel();
    this.chain = new Chain3D(this.root, INK.gold, { tube: 0.2, bead: 0.27 });
    this.stage.frame(3.4);
    this.root.rotation.x = 0.35;
    this.book = new CaseBook();
    this.ui.goals(['Decide the first chain, on evidence.', 'Decide the second chain.', 'Decide all three without a wrong call.']);
    this.L = this.ui.lights([['s', 'steps'], ['h', 'hops, all states'], ['a', 'arrivals, misfold'], ['r', 'replicas agree']]);
    this.bLong = this.ui.button('Run longer', () => this.longer());
    this.bM = this.ui.button('Start in misfold', () => this.replica(MISFOLD, 'misfold'));
    this.bU = this.ui.button('Start unfolded', () => this.replica(EXTENDED, 'unfolded'));
    document.getElementById('actions').classList.add('acts-mini');
    this.bA = this.ui.button('Really absent', () => this.verdict('absent'));
    this.bC = this.ui.button('Not converged', () => this.verdict('unconverged'));
    this.bR = this.ui.button('Present, rare', () => this.verdict('rare'));
    this.ui.sender(t => this.send(t));
    this.load();
  }
  load() {
    this.reps = [];
    this.addRep(NATIVE_F, 'native', this.book.cs.steps);
    this.ui.note(TEXT[this.book.cs.name].open);
    this.lock(true);
  }
  addRep(start, label, steps) {
    const r = new Run(this.book.cs.p, { steps, start });
    r.label = label; r.color = COLS[[0, 3, 4][this.reps.length % 3]];
    this.reps.push(r);
    this.active = r;
  }
  lock(on) { for (const b of [this.bA, this.bC, this.bR]) { b.disabled = on; b.style.opacity = on ? 0.45 : 1; } }
  longer() { for (const r of this.reps) r.total += LONGER; this.book.longer = true; this.sound.tick(1.1); }
  replica(start, label) {
    if (this.reps.length >= 3) { this.ui.note('Three replicas are enough here. <b>Run longer, or decide.</b>'); return; }
    this.addRep(start, label, this.reps[0].total);
    if (start === MISFOLD) this.book.fromMisfold = true;
    this.sound.tick(1.3);
  }
  get finished() { return this.reps.every(r => r.finished); }
  evidence() {
    const R = this.reps, f = R.map(r => r.fractions()[MISFOLDED] * 100);
    return { arrivals: R.reduce((s, r) => s + r.entries[MISFOLDED], 0), hops: R.reduce((s, r) => s + r.hops, 0), spread: R.length > 1 ? Math.max(...f) - Math.min(...f) : null, steps: R.reduce((s, r) => s + r.done, 0) };
  }
  verdict(v) {
    const res = this.book.verdict(v, this.finished);
    if (!res) return;
    const t = TEXT[this.book.cs.name], x = pctOf(stats(this.book.cs.p).p[MISFOLDED]);
    if (res.right) {
      this.sound.snap(2);
      this.ui.setTier(res.tier);
      this.ui.note(`${t.right(this.evidence())} Referee: ${x}%.`);
      this.lock(true);
      setTimeout(() => { if (this.game.plate === this && this.book.next()) this.load(); }, 3200);
    } else {
      this.sound.tick(0.4);
      this.ui.note(t.wrong(x));
    }
  }
  update(dt) {
    const end = performance.now() + (this.game.mobile ? 4 : 6);
    for (const r of this.reps) {
      let n = 0;
      while (!r.finished && n < 12000 && performance.now() < end) { r.advance(1500); n += 1500; }
    }
    const open = this.book.ready(this.finished);
    if (open === this.bA.disabled) this.lock(!open);
    const m = this.active.mc;
    this.chain.set(m.x, m.y, m.z, m.w ? m.wetSites() : null, Math.min(1, dt * 9));
    this.chain.color(INKC[m.state()]);
    this.root.rotation.y += dt * 0.2;
    this.board();
    this.redraw();
  }
  board() {
    const { arrivals, hops, spread, steps } = this.evidence();
    this.L.s.set(`${(steps / 1e6).toFixed(2)} M`, 1);
    this.L.h.set(`${hops}`, hops >= 100 ? 2 : hops >= 20 ? 1 : 0);
    this.L.a.set(`${arrivals}`, arrivals >= 5 ? 2 : arrivals || hops >= 100 ? 1 : 0);
    this.L.r.set(spread == null ? 'one run' : spread < 5 ? `yes, ${spread.toFixed(0)} pts` : `no, ${spread.toFixed(0)} pts`, spread == null ? 1 : spread < 5 ? 2 : 0);
  }
  arrange(F) { return this.split(F, 0.56); }
  redraw() {
    const p = this.panel, c = p.begin(), { x, y, w, h } = p.rect;
    if (!w || !this.reps) return;
    const R = this.reps, n = 5, rh = h / n, lw = Math.max(70, Math.min(92, w * 0.25)), bw = (w - lw) * 0.3, tx = x + lw + bw + 10, tw = x + w - tx - 2;
    for (let i = 0; i < n; i++) {
      const y0 = y + i * rh, m = y0 + rh / 2, fr = R.map(r => r.fractions()[i]), mean = fr.reduce((a, b) => a + b, 0) / fr.length;
      const seen = R.some(r => r.seen[i]);
      const sem = R.length > 1 ? Math.sqrt(fr.reduce((a, b) => a + (b - mean) ** 2, 0) / (R.length - 1) / R.length) : blockError(R[0], i);
      p.text(NAMES[i], x + 2, m - 8, { color: i === MISFOLDED ? COLS[i] : INKS.dim, size: 13 });
      p.text(seen ? `${(mean * 100).toFixed(1)} ± ${(sem * 100).toFixed(1)}%` : 'never seen', x + 2, m + 8, { color: seen ? INKS.white : INKS.red, size: 12, italic: !seen });
      const bx = x + lw, bh = Math.min(14, rh * 0.36);
      c.fillStyle = INKS.faint; c.fillRect(bx, m - 0.5, bw, 1);
      if (seen) {
        c.fillStyle = COLS[i]; c.fillRect(bx, m - bh / 2, bw * Math.min(1, mean), bh);
        if (sem > 0) { c.strokeStyle = INKS.white; c.lineWidth = 1.5; const a = Math.max(0, mean - sem), b = Math.min(1, mean + sem); c.beginPath(); c.moveTo(bx + bw * a, m); c.lineTo(bx + bw * b, m); c.moveTo(bx + bw * a, m - 4); c.lineTo(bx + bw * a, m + 4); c.moveTo(bx + bw * b, m - 4); c.lineTo(bx + bw * b, m + 4); c.stroke(); }
      }
    }
    // Each replica's walk through the states, in time.
    const longest = Math.max(...R.map(r => r.total));
    R.forEach((r, k) => {
      const T = r.trace, step = Math.max(1, T.length / tw | 0), pts = [];
      for (let j = 0; j < T.length; j += step) {
        const X = tx + j * SAMPLE_EVERY / longest * tw, Y = y + (T[j] + 0.5) * rh + (k - (R.length - 1) / 2) * 5;
        if (pts.length) pts.push([X, pts[pts.length - 1][1]]);
        pts.push([X, Y]);
      }
      if (pts.length > 1) p.line(pts, { color: r.color, width: 1.3, glow: 3 });
    });
    p.text('time →', x + w - 2, y + 7, { align: 'right', size: 11, color: INKS.dim });
  }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'One right call. Two more chains are waiting.', 2: 'You told a bad run from a bad force field.', 3: 'Three chains, three right calls, each on evidence.' }[tier],
      lesson: 'Count independent transitions, not steps. A long run that never leaves its basin has tiny error bars and tells you nothing about the other states. A state seen zero times has no error bar at all. Replicas from different starts are the cheapest test: if they disagree, the populations are not converged. Metastable states are the hard case because their whole nature is to be slow to leave (Noé et al. 2009 found misfolded traps this way, with many short runs).',
    });
  }
  exit() { this.root.rotation.set(0, 0, 0); document.getElementById('actions').classList.remove('acts-mini'); }
}
// Block error of one run: the spread of a state's share between the run's blocks. It cannot see what the run never reached.
function blockError(r, s) {
  const h = r.hist.map(b => { let a = 0, z = 0; for (const [key, [c]] of b ?? []) { z += c; if (STATE_OF(key) === s) a += c; } return z ? a / z : null; }).filter(v => v != null);
  if (h.length < 2) return 0;
  const m = h.reduce((a, b) => a + b, 0) / h.length;
  return Math.sqrt(h.reduce((a, b) => a + (b - m) ** 2, 0) / (h.length - 1) / h.length);
}
const STATE_OF = k => classify(k & 15, k >> 4 & 15, k >> 8 & 15, k >> 20 & 7);

// ---------- Plate XII: Metastable ----------

const BUDGET = 8, REFEREES = 3, STEPS = RUN_STEPS;
// Where each state's structure stands in the gallery, and where its label goes.
const SPOTS = [[0, 3.75], [-3.5, 1.35], [3.5, 1.35], [-2.75, -2.55], [2.75, -2.55]];

function circleTexture(soft) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (soft) {
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.35, 'rgba(255,255,255,.34)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  } else {
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2.5; x.setLineDash([6, 8]);
    x.beginPath(); x.arc(64, 64, 58, 0, 6.2832); x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

class Exhibit {
  constructor(parent, i, glowTex, ringTex) {
    this.i = i; this.pos = SPOTS[i];
    this.g = new THREE.Group();
    this.g.position.set(this.pos[0], this.pos[1], 0);
    parent.add(this.g);
    const mk = (tex, op) => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: INKC[i], transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow = mk(glowTex, 0); this.ring = mk(ringTex, 0.34);
    this.glow.scale.setScalar(3); this.ring.scale.setScalar(1.7);
    this.g.add(this.glow, this.ring);
    this.pivot = new THREE.Group();
    this.g.add(this.pivot);
    this.chain = new Chain3D(this.pivot, INKC[i], { tube: 0.2, bead: 0.27 });
    this.chain.g.visible = false;
    this.seen = false; this.s = 0; this.target = 0.2; this.flash = 0;
  }
  reveal(conf) {
    this.seen = true;
    this.chain.g.visible = true;
    this.chain.set(conf.x, conf.y, conf.z, conf.wet);
    let r = 0;
    const a = this.chain.at;
    for (let k = 0; k < 3 * CN; k += 3) r = Math.max(r, Math.hypot(a[k], a[k + 1], a[k + 2]));
    this.norm = 1.5 / Math.max(1.5, r);
    this.flash = 1;
    this.ring.material.opacity = 0;
  }
  update(dt, pop) {
    const p = this.seen ? pop : 0;
    this.target = this.norm ? this.norm * (0.5 + 0.7 * Math.sqrt(p)) : 0;
    this.s += (this.target - this.s) * Math.min(1, dt * 5);
    this.flash *= Math.exp(-dt * 1.8);
    this.pivot.scale.setScalar(this.s * (1 + 0.5 * this.flash));
    this.pivot.rotation.y += dt * (0.25 + 0.05 * this.i);
    this.glow.material.opacity = (this.seen ? 0.12 + 0.75 * Math.sqrt(p) : 0) + 0.9 * this.flash;
    this.glow.scale.setScalar(2 + 2.2 * Math.sqrt(p) + 2.5 * this.flash);
  }
}

export class Meta extends Plate {
  enter() {
    const r = this.root;
    this.usePanel();
    this.P = { ...STOCK_P };
    this.proj = new Project();
    this.store = this.proj.store;
    this.left = BUDGET; this.referees = REFEREES;
    this.G = targets();
    this.data = this.G.data; this.sealed = this.G.sealed;
    this.W = { pop: [1, 1, 1, 1, 1], rg: 0, salt: 0, den: 0 };
    this.lambda = PULLS.medium;
    this.fitted = null; this.refereeSeen = false; this.blind = false;
    this.seen = [false, false, false, false, false];
    this.miss = null;
    this.group = new THREE.Group();
    r.add(this.group);
    const glow = circleTexture(true), ring = circleTexture(false);
    this.exhibits = NAMES.map((_, i) => new Exhibit(this.group, i, glow, ring));
    this.walker = new Chain3D(this.group, INK.white, { tube: 0.13, bead: 0.18 });
    this.walker.g.scale.setScalar(0.5);
    this.walker.g.position.set(0, 0.95, 1);
    this.walker.g.visible = false;
    this.link = new Links(1, { color: INK.gold, opacity: 0.8 });
    this.group.add(this.link);
    this.burst = new Burst(r, 200, { color: INK.gold, size: 0.13 });
    this.stage.frame(5.9, [0, 0.5, 0]);
    this.ui.note('You cannot see the truth, only runs. <b>Run this stock force field and see what appears.</b> Targets are a hidden teaching set.');
    this.ui.goals(['See all five states in your own runs.', 'Referee: populations at 300 K within 3.5 points.', 'Referee: also pass the three sealed tests your fit never saw.']);
    this.L = this.ui.lights([['n', 'Neff'], ['s', 'states seen'], ['m', 'last miss'], ['t', 'from stuck runs']]);
    this.tags = NAMES.map((n, i) => this.ui.tag('', () => [SPOTS[i][0], SPOTS[i][1] - (i ? 1.8 : 1.5), 0]));
    this.tags.forEach(t => t.el.classList.add('state'));
    const k = (tab, label, key, unit, major) => ({ tab, label, unit, min: KNOBS[key][0], max: KNOBS[key][1], step: 0.005, value: this.P[key], digits: 3, major, span: 2.2, onInput: v => { this.P[key] = v; this.dirty = true; } });
    this.fitPane = this.makeFitPane();
    this.R = this.ui.knobs([
      k('vdW', 'Protein-protein ×', 'E', '', 0.1),
      k('water', 'Protein-water ×', 'gamma', '', 0.1),
      k('charge', 'Charge scale ×', 'q', '', 0.1),
      k('torsion', 'Helix over strand, <i>k</i>', 'k', 'kcal/mol', 0.1),
      k('wet', 'Buried water, <i>w</i>', 'w', 'kcal/mol', 0.2),
    ], { tab: 'fit', el: this.fitPane });
    this.bRun = this.ui.button(`Run, ${BUDGET} left`, () => this.startRun(), 'go');
    this.bFit = this.ui.button('Fit', () => this.fit());
    this.bRef = this.ui.button('Referee', () => this.referee());
    this.ui.sender(t => this.send(t));
    this.best = 0;
    this.show();
    this.dirty = false;
  }
  // Which data the fit may use, with the player's weights, and how hard it is pulled back to the start.
  makeFitPane() {
    const d = document.createElement('div');
    d.className = 'fit-pane';
    const chips = [['N', 'pop', 0], ['I', 'pop', 1], ['W', 'pop', 2], ['M', 'pop', 3], ['U', 'pop', 4], ['Rg', 'rg'], ['salt', 'salt'], ['denat.', 'den']];
    d.innerHTML = `<div class="fit-row"><span class="fit-tag">Fit on</span>${chips.map((c, i) => `<button class="chip" data-i="${i}">${c[0]}</button>`).join('')}</div>
      <div class="fit-row"><span class="fit-tag">Pull to start</span><button class="chip wide" data-l="${PULLS.light}">light</button><button class="chip wide" data-l="${PULLS.medium}">medium</button><button class="chip wide" data-l="${PULLS.heavy}">heavy</button></div>
      <div class="fit-seal">Sealed: two mutants and melting T. Never fitted.</div>`;
    const paint = () => {
      d.querySelectorAll('.chip[data-i]').forEach(b => {
        const c = chips[+b.dataset.i], w = c[1] === 'pop' ? this.W.pop[c[2]] : this.W[c[1]];
        b.dataset.w = w; b.textContent = w > 1 ? `${c[0]} ×${w}` : c[0];
      });
      d.querySelectorAll('.chip[data-l]').forEach(b => b.classList.toggle('on', +b.dataset.l === this.lambda));
    };
    d.addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      if (b.dataset.l) this.lambda = +b.dataset.l;
      else {
        const c = chips[+b.dataset.i], next = w => (w === 0 ? 1 : w === 1 ? 3 : 0);
        if (c[1] === 'pop') this.W.pop[c[2]] = next(this.W.pop[c[2]]); else this.W[c[1]] = next(this.W[c[1]]);
      }
      this.sound.tick(1.2);
      paint();
    });
    paint();
    this.paintChips = paint;
    return d;
  }
  startRun() {
    if (this.run || this.left <= 0) return;
    this.predBefore = this.store.runs.length ? this.store.predict(this.P) : null;
    this.run = this.proj.begin(this.P);
    this.walker.g.visible = true;
    this.left--;
    this.sound.snap(0);
    for (const b of [this.bRun, this.bFit, this.bRef]) b.disabled = true;
  }
  finishRun() {
    const r = this.run;
    this.run = null;
    this.proj.end(r);
    this.moved = false;
    const got = r.fractions(), before = this.predBefore;
    if (before) {
      this.miss = { v: Math.max(...got.map((v, i) => Math.abs(v - before.p[i]))) * 100, neff: before.neff / before.samples, i: got.map((v, i) => Math.abs(v - before.p[i])).reduce((b, v, i, a) => (v > a[b] ? i : b), 0), pred: before.p, got };
      const s = this.miss.i;
      if (this.miss.v > 10) this.ui.note(`Predicted ${NAMES[s]} ${(before.p[s] * 100).toFixed(0)}%, the run measured ${(got[s] * 100).toFixed(0)}%. <b>Stored samples could not see this far.</b>`);
      else if (this.left >= 0) this.ui.note(`Predicted and measured agree within ${this.miss.v.toFixed(0)} points. <b>That is what overlap buys.</b>`);
    } else if (!r.seen.every(Boolean)) {
      const miss = NAMES.filter((_, i) => !r.seen[i]);
      this.ui.note(`${miss.join(' and ')}: never seen. <b>Turn a knob: their bars stay empty. Reweighting cannot invent a state.</b>`);
    }
    for (const b of [this.bRun, this.bFit, this.bRef]) b.disabled = false;
    this.bRun.textContent = this.left > 0 ? `Run, ${this.left} left` : 'No runs left';
    if (this.left <= 0) this.bRun.disabled = true;
    this.show();
    if (this.seen.every(Boolean) && this.best < 1) {
      this.best = 1; this.ui.setTier(1);
      this.ui.note('All five exist. A 3% state is only about 3.5 <i>kT</i> up: <b>that small gap is what a force field must get right.</b>');
    }
  }
  // Reweighted prediction: the only thing the player ever sees between runs.
  show() {
    const pr = this.store.runs.length ? this.store.predict(this.P) : null;
    this.pr = pr;
    const nSeen = this.seen.filter(Boolean).length;
    this.L.s.set(`${nSeen} of 5`, nSeen === 5 ? 2 : nSeen >= 3 ? 1 : 0);
    if (pr) {
      const f = pr.neff / pr.samples;
      this.L.n.set(`${fmtN(pr.neff)} <span class="ref">of ${fmtN(pr.samples)}</span>`, f > 0.25 ? 2 : pr.neff > 60 ? 1 : 0);
      this.L.t.set(`${(pr.trapped * 100).toFixed(0)}%`, pr.trapped < 0.2 ? 2 : pr.trapped < 0.4 ? 1 : 0);
      if (pr.trapped >= 0.4 && this.store.runs.length > 1 && !this.warned) {
        this.warned = true;
        this.ui.note('This estimate leans on a run that never crossed. <b>As in Plate XI, its ± can be small and wrong.</b>');
      }
    } else { this.L.n.set('no runs yet', 0); this.L.t.set('—', 1); }
    this.L.m.set(this.miss ? `${this.miss.v.toFixed(0)} pts` : '—', !this.miss ? 1 : this.miss.v <= 5 ? 2 : this.miss.v <= 12 ? 1 : 0);
    const g = pr ? gaps(pr.p, pr.err) : [];
    this.tags.forEach((t, i) => {
      const tar = this.data.p300[i] * 100;
      if (!pr || !this.seen[i]) { t.el.innerHTML = `<b style="color:${COLS[i]}">${NAMES[i]}</b>${meter(0, 0, tar, COLS[i])}<small>never seen</small>`; return; }
      const v = pr.p[i] * 100, e = pr.err[i] * 100, q = g[i];
      t.el.innerHTML = `<b style="color:${COLS[i]}">${NAMES[i]}</b> ${v.toFixed(0)} ± ${e < 1 ? '&lt;1' : e.toFixed(0)}%${meter(v, e, tar, COLS[i])}<small>${q ? `+${q.g.toFixed(1)} ± ${q.e < 0.05 ? '&lt;0.1' : q.e.toFixed(1)} <i>kT</i>` : ''}</small>`;
    });
  }
  fit() {
    if (!this.store.runs.length) { this.ui.note('The fit works on stored samples. <b>Run first.</b>'); return; }
    const missing = NAMES.filter((_, i) => !this.seen[i] && this.W.pop[i]);
    const f = this.proj.fit(this.P, this.data, this.W, this.lambda);
    Object.assign(this.P, f.x);
    this.fitted = { W: JSON.parse(JSON.stringify(this.W)), x: { ...f.x } };
    ['E', 'gamma', 'q', 'k', 'w'].forEach((k, i) => this.R[i].set(this.P[k]));
    this.sound.snap(1);
    this.moved = true;
    this.show();
    const pr = this.pr;
    if (missing.length) this.ui.note(`The fit cannot reach ${missing.join(' or ')}: no sample there. <b>Run somewhere softer first.</b>`);
    else if (f.blocked) this.ui.note('The fit stopped at the edge of its overlap. <b>Spend a run here, then fit again.</b>');
    else this.ui.note(`Fit done, Neff ${fmtN(pr.neff)}. <b>A prediction, until a run confirms it. Rates need a new run too.</b>`);
  }
  referee() {
    if (!this.store.runs.length) { this.ui.note('The referee wants a force field you have at least run. <b>Run first.</b>'); return; }
    if (this.referees <= 0) { this.ui.note('The referee has seen enough. <b>Send what you have.</b>'); return; }
    this.referees--;
    const x = this.P, j = judge(x, this.G), first = !this.refereeSeen;
    this.refereeSeen = true;
    const seenAll = this.seen.every(Boolean), rows = NAMES.map((n, i) => ({ n, y: j.p[i] * 100, t: this.data.p300[i] * 100 }));
    const tier = j.fitOk && j.sealedOk && seenAll ? 3 : j.fitOk && seenAll ? 2 : this.best;
    if (tier === 3 && this.best < 3) this.blind = first;
    this.best = Math.max(this.best, tier);
    this.ui.setTier(this.best);
    this.lastReport = { ...j, first, x: { ...x } };
    const ok = v => `<b class="${v ? 'pass' : 'fail'}">${v ? 'pass' : 'fail'}</b>`;
    const hint = !j.coreOk && !j.mutOk ? 'Neither the charges nor the overall vdW scale are pinned down.' : !j.coreOk ? 'The overall vdW scale is not pinned down.' : !j.mutOk ? 'The charges are not pinned down.' : 'The balance of energy and entropy is off.';
    const msg = j.fitOk && !j.sealedOk
      ? `It fits beautifully and fails a test it never saw. ${hint} Which data would pin it? Add them to the fit.`
      : j.fitOk ? (first ? 'Fit and sealed tests both pass, on one parameter set.' : 'Fit and tests both pass, on a retest.')
        : 'The exact answer differs from your prediction. Where was your overlap weakest?';
    const m = misses(RIVAL, this.G), used = this.fitted?.W ?? {}, extra = [used.salt && `high salt ${m.salt.toFixed(1)}`, used.den && `denaturant ${m.den.toFixed(1)}`].filter(Boolean);
    const rCore = judge(RIVAL, this.G).coreOff;
    const box = document.getElementById('report');
    document.getElementById('report-body').innerHTML = `<p class="r-who">Referee: the long run you never had</p>
      <h3>Targets at 300 K <small>${this.fitLine()}</small></h3>
      <table>${rows.map(r => `<tr><td>${r.n}</td><td>${r.y.toFixed(1)}%</td><td>${r.t.toFixed(1)}%</td></tr>`).join('')}</table>
      <p>Populations at 300 K ${ok(j.fitOk)} <small>(within ${TOL.pop} points)</small></p>
      <h3>${first ? 'Sealed tests' : 'Tests seen before'} <small>${first ? 'your fit never used these, and you have not seen them' : 'your fit never used these, but you saw them on your last call: a pass now is a retest, not a blind test'}</small></h3>
      <p>Charge-free mutant ${ok(j.mutOk)} <small>worst state off by ${j.mutOff.toFixed(1)} points</small></p>
      <p>Core mutant ${ok(j.coreOk)} <small>protein-protein strength × ${CORE}, worst state off by ${j.coreOff.toFixed(1)} points</small></p>
      <p>Melting T ${ok(j.tmOk)} <small>${j.tm.toFixed(0)} K, target ${this.sealed.tm.toFixed(0)} K</small></p>
      <p class="r-msg">${msg}</p>
      <p><small>A rival set fits the same 300 K populations (worst state ${m.p300.toFixed(1)} points off) with very different numbers: vdW ×${RIVAL.E}, water ×${RIVAL.gamma}, charge ×${RIVAL.q}, <i>k</i> ${RIVAL.k}, <i>w</i> ${RIVAL.w}. ${extra.length ? `On the other data you fitted it misses: ${extra.join(', ')} points. ` : ''}It misses the core mutant by ${rCore.toFixed(1)}. ${extra.length ? 'Your extra data would reject it.' : '300 K populations alone cannot tell such sets apart.'}</small></p>
      <p class="r-left"><small>Referee calls left: ${this.referees}. Melting here means native and unfolded are equal. Salt: charges ×${SALT}. Denaturant: protein-water ×${DENATURANT}. All in this teaching model.</small></p>`;
    box.classList.add('open');
    document.getElementById('report-close').onclick = () => { box.classList.remove('open'); if (this.best === 3 && !this.done3) { this.done3 = true; this.triumph(); } };
  }
  // Exactly what the last fit used, not what the chips say now.
  fitLine() {
    const f = this.fitted;
    if (!f) return 'you have not run Fit: these knobs were set by hand, so no data were fitted';
    const pops = NAMES.filter((_, i) => f.W.pop[i]), parts = [pops.length ? (pops.length === 5 ? 'all five populations at 300 K' : `${pops.join(', ')} at 300 K`) : null, f.W.rg && 'coil Rg', f.W.salt && 'high-salt populations', f.W.den && 'denaturant populations'].filter(Boolean);
    const moved = ['E', 'gamma', 'q', 'k', 'w'].some(k => Math.abs(this.P[k] - f.x[k]) > 1e-9);
    return `your last fit used ${parts.length ? parts.join(', ') : 'no data, only the pull to the start'}${moved ? '; you have moved knobs by hand since' : ''}`;
  }
  triumph() {
    this.ui.note(this.blind ? 'Five states, one parameter set, and tests it had never met. <b>That is a force field.</b>' : 'Five states, one parameter set, and a retest passed. <b>Now find fresh tests.</b>');
    this.burst.fire([0, 0.5, 0], 6);
    this.stage.pulse = 1.2;
    [0, 1, 2, 3, 4].forEach(i => setTimeout(() => { this.exhibits[i].flash = 1; this.sound.ping(i, 0.16); }, i * 180));
  }
  arrange(F) {
    const h = 54, w = F.right - F.left, x = F.left + 8;
    this.panel.place({ x, y: F.bottom - h, w: w - 16, h });
    return { top: F.top, bottom: innerHeight - (F.bottom - h - 2), left: F.left, right: innerWidth - F.right };
  }
  // The chain's walk through the states, during the current run.
  redraw() {
    const p = this.panel, c = p.begin(), { x, y, w, h } = p.rect;
    if (!w) return;
    const lane = h / 5;
    for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(234,243,244,.06)'; c.fillRect(x, y + i * lane + lane / 2, w, 1); }
    const T = this.run?.trace ?? this.lastTrace;
    if (!T?.length) return;
    this.lastTrace = T;
    const n = T.length, total = STEPS / SAMPLE_EVERY, step = Math.max(1, n / (w * 1.2) | 0), old = !this.run && this.moved;
    c.globalAlpha = old ? 0.35 : 1;
    for (let j = 0; j < n; j += step) { c.fillStyle = COLS[T[j]]; c.fillRect(x + j / total * w, y + T[j] * lane + 1, Math.max(1.2, step / total * w), lane - 2); }
    c.globalAlpha = 1;
    if (old) p.text('dwell times need a new run', x + w / 2, y + h / 2, { align: 'center', size: 13 });
  }
  update(dt) {
    if (this.dirty && !this.run) { this.dirty = false; this.moved = true; this.show(); }
    const r = this.run;
    if (r) {
      // At least three seconds a run, so the chain can be watched. Slow phones take longer.
      const end = performance.now() + (this.game.mobile ? 5 : 7), cap = STEPS / 180 * Math.max(1, dt * 60);
      let n = 0;
      while (!r.finished && n < cap && performance.now() < end) { r.advance(1000); n += 1000; }
      const m = r.mc, s = m.state();
      this.walker.set(m.x, m.y, m.z, m.w ? m.wetSites() : null, Math.min(1, dt * 10));
      this.walker.color(INKC[s]);
      const q = SPOTS[s];
      this.link.set(0, 0, 0.95, 1, q[0], q[1], 0); this.link.material.color.copy(INKC[s]); this.link.show(1);
      for (const f of r.fresh) this.discover(f, r);
      r.fresh.length = 0;
      // Live evidence: what this run has counted so far.
      const fr = r.fractions();
      this.exhibits.forEach((e, i) => { if (!this.seen[i] && r.seen[i]) this.discover(i, r); e.update(dt, this.seen[i] ? Math.max(fr[i], (this.pr?.p[i] ?? 0) * 0.5) : 0); });
      if (r.finished) { this.finishRun(); this.link.show(0); this.walker.g.visible = false; }
    } else {
      const p = this.pr?.p ?? [0, 0, 0, 0, 0];
      this.exhibits.forEach((e, i) => e.update(dt, p[i]));
    }
    this.burst.update(dt);
    this.redraw();
  }
  discover(i, r) {
    if (this.seen[i]) return;
    this.seen[i] = true;
    this.exhibits[i].reveal(r.first[i]);
    this.sound.ping(i, 0.18);
    setTimeout(() => this.sound.ping(i + 2, 0.12), 120);
    this.burst.fire([SPOTS[i][0], SPOTS[i][1], 0], 3);
    this.stage.pulse = 0.5;
    this.show();
  }
  send(tier) {
    const P = this.P, a = stats(P);
    this.game.finish(this, tier, {
      comment: { 1: 'All five states exist in your runs. The numbers do not yet stand.', 2: 'It fits. A referee would ask what it predicts.', 3: this.blind ? 'It fits, and it passed tests it never saw. I have no further comments.' : 'It fits, and it passed on a retest. You had seen those tests, so say so in your paper.' }[tier],
      lesson: 'High effective sample size does not make up for an unvisited state. Because U is a sum of terms, stored samples can be re-scored at new parameters instantly. MBAR can use those energies to reweight a simulation, as long as the old and new ensembles overlap. It says nothing about rates: dwell times need new simulations. A real 3% state, in T4 lysozyme L99A, sits 2.0 kcal/mol up, about 3.5 <i>kT</i> (Mulder et al. 2001), and lives about 1 ms (Bouvignies et al. 2011). Different sets can pass the same fit, so a force field needs tests it never saw. This chain is a teaching model.',
      apply: ff => { ff.meta = { ...P }; ff.card = { p: a.p, tm: meltingT(P), rg: a.rgU, target: this.data.p300, tmT: this.sealed.tm, rgT: this.data.rg, runs: BUDGET - this.left }; },
    });
  }
  exit() { document.getElementById('report').classList.remove('open'); }
  // For tests: run to the end at once.
  fastRun() {
    if (this.left <= 0) return;
    this.predBefore = this.store.runs.length ? this.store.predict(this.P) : null;
    this.run = this.proj.begin(this.P);
    this.left--;
    this.run.advance(Infinity);
    for (let i = 0; i < 5; i++) if (this.run.seen[i]) this.discover(i, this.run);
    this.lastTrace = this.run.trace;
    this.finishRun();
  }
  setKnobs(o) { Object.assign(this.P, o); ['E', 'gamma', 'q', 'k', 'w'].forEach((k, i) => this.R[i].set(this.P[k])); this.dirty = true; }
}

const fmtN = n => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));
// A small population bar: gold for the estimate, a whisker for its error, a white tick for the target.
function meter(v, e, t, col) {
  const W = 100 / 60, x = Math.min(100, v * W), a = Math.max(0, (v - e) * W), b = Math.min(100, (v + e) * W), tick = Math.min(100, t * W);
  return `<span class="mini"><i style="width:${x}%;background:${col}"></i><u style="left:${a}%;width:${b - a}%"></u><s style="left:${tick}%"></s></span>`;
}
