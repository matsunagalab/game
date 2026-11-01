// The Core chapter: hydrophobicity keeps the fold, and shapes that combine set stability, structure and helix count.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER, YELLOW_INK, GREEN_INK } from '../press.js';
import { Ribbon, Atoms } from '../ribbon.js';
import { foldOf, indexOf, classOf, TONE } from '../proteins.js';
import { q3 } from '../science/dssp.js';
import { sideContacts, coupling, packing, packingAngles, median, VOLUME, SHAPE, SHAPE_NAME } from '../science/packing.js';
import { makeFolder, superpose } from '../science/rigidfold.js';
import { buzz } from '../sound.js';
import { $, button, clamp, ease } from '../ui.js';
import { Book } from './ppi.js';

// Ribbons need a carbonyl to tell them which way is up; a free chain gets one from its own bend.
function fakeO(ca, n, out) {
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const u = [ca[b * 3] - ca[i * 3], ca[b * 3 + 1] - ca[i * 3 + 1], ca[b * 3 + 2] - ca[i * 3 + 2]];
    const v = [ca[a * 3] - ca[i * 3], ca[a * 3 + 1] - ca[i * 3 + 1], ca[a * 3 + 2] - ca[i * 3 + 2]];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...c) || 1;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = ca[i * 3 + k] + (c[k] / l) * 1.2;
  }
}

export class Bay {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound, press: ctx.press, rig: ctx.rig, overlay: ctx.overlay });
    ctx.press.setPaper(PAPER.pink);
    ctx.press.setFlood([0, 0, 0]);
    ctx.press.clearDisc();
    ctx.press.uniforms.uShadow.value = 0.16;
    ctx.rig.spin = 0;
    ctx.rig.target.set(0, 0, 0);
    ctx.rig.targetGoal.set(0, 0, 0);
    this.radius = 22;
    this.done = [false, false, false];
    this.meshes = [];
    ctx.onLayout = () => this.layout();
  }

  add(obj) {
    this.press.scene.add(obj.mesh);
    this.meshes.push(obj);
    return obj;
  }

  clearMeshes() {
    for (const m of this.meshes) {
      this.press.scene.remove(m.mesh);
      m.dispose();
    }
    this.meshes = [];
  }

  // Free pixels for the 3D view: above the panel on a phone, left of it on a wide screen.
  layout() {
    const { cssW: w, cssH: h } = this.press;
    const landscape = w > h * 1.15;
    const top = 112 + this.ctx.safeTop();
    const panel = this.panelHeight();
    const safe = this.ctx.safeBottom();
    if (landscape) {
      const pw = Math.min(w * 0.48, 600);
      this.press.setFocus(0.5 * (1 - (pw + 24) / w), 0.56);
      this.viewPx = Math.min(w - pw - 24, h - 90);
      this.placePanel({ right: 12, bottom: safe + 12, width: pw, height: Math.min(h - 96, panel + 80) });
    } else {
      this.placePanel({ left: 8, right: 8, bottom: safe + 8, height: panel });
      const free = h - panel - safe - 8 - top;
      this.press.setFocus(0.5, (top + free / 2) / h);
      this.viewPx = Math.min(w, free);
    }
    const fov = this.press.camera.fov;
    this.rig.distTarget = ((this.radius / Math.tan((fov * Math.PI) / 360)) * h) / this.viewPx;
  }

  placePanel(box) {
    if (!this.panel) return;
    const s = this.panel.style;
    s.left = 'auto';
    s.right = s.top = s.width = '';
    for (const [k, v] of Object.entries(box)) s[k] = `${v}px`;
    this.panelMoved?.();
  }

  stamp(i, ok = true) {
    if (ok && !this.done[i]) {
      this.done[i] = true;
      this.ctx.earn(i);
      if (i === 0) this.hud.offerFinish();
    }
  }

  dispose() {
    this.clearMeshes();
    this.panel?.remove();
    this.press.setFocus(0.5, 0.5, true);
    this.rig.spin = 0;
  }
}

// Stage: contact map battleships. The helices are known; how they sit is not. Each hit is fed to a small solver
// that searches from random arrangements, so the fold really does come from the contacts found.
class Contacts extends Bay {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { p, d } = foldOf(stage.protein);
    this.p = p;
    const groups = [];
    for (const m of d.ss.matchAll(/H+|E+/g)) if (m[0].length >= 3) groups.push([m.index, m.index + m[0].length - 1]);
    this.groups = groups;
    const piece = (i) => groups.findIndex(([a, b]) => i >= a && i <= b);
    this.piece = piece;
    this.core = [];
    for (let i = 0; i < p.n; i++) if (piece(i) >= 0 && p.rsa[i] <= 45 && 'AVILMFWYC'.includes(p.seq[i])) this.core.push(i);
    this.truth = sideContacts(p, { within: new Set(this.core) });
    this.pairsThere = [...this.truth.keys()].filter((k) => {
      const [a, b] = k.split(',').map(Number);
      return piece(a) !== piece(b);
    }).length;
    this.ss = Array.from(d.ss, q3).join('');
    this.ribbon = this.add(new Ribbon(this.ss, [], { helixWidth: 1.3, strandWidth: 1.3, coil: 0.3, thickness: 0.3 }));
    this.ribbon.paint((i) => (this.ss[i] === 'H' ? TONE.helix : TONE.loop), (i) => 2 + (i >> 3));
    this.beads = this.add(new Atoms(this.core.length));
    this.ca = new Float32Array(p.n * 3);
    this.o = new Float32Array(p.n * 3);
    this.tips = this.sideCentres();
    this.folder = makeFolder(p.caXYZ, this.tips, groups);
    this.pieceOf = new Map();
    this.shots = new Map();
    this.hitPairs = [];
    this.missPairs = [];
    this.hits = 0;
    this.misses = 0;
    this.solve(0);
    this.ca.set(this.goal);
    this.from = Float32Array.from(this.goal);
    this.t = 1;
    this.rig.yaw = 0.5;
    this.rig.pitch = 0.2;
    this.panel = $('div', 'grid');
    this.canvas = $('canvas');
    this.readout = $('p', 'gridread');
    this.panel.append(this.readout, this.canvas);
    ctx.layer.append(this.panel);
    this.canvas.addEventListener('pointerup', (e) => this.tap(e));
    this.layout();
    this.rig.dist = this.rig.distTarget;
    this.hud.setGoal('Three helices, shape known, arrangement unknown. Tap a pair of oily residues that you think touch. Each hit is a clue for a real search.');
    this.say();
    this.pose();
  }

  sideCentres() {
    const { p } = this;
    const tips = Float64Array.from(p.caXYZ);
    const count = new Array(p.n).fill(0);
    const sum = new Float64Array(p.n * 3);
    for (let a = 0; a < p.atomRes.length; a++) {
      if (p.atomSide[a] !== '1') continue;
      const r = p.atomRes[a];
      count[r]++;
      for (let k = 0; k < 3; k++) sum[r * 3 + k] += p.atomXYZ[a * 3 + k];
    }
    for (let r = 0; r < p.n; r++) if (count[r]) for (let k = 0; k < 3; k++) tips[r * 3 + k] = sum[r * 3 + k] / count[r];
    return tips;
  }

  // Runs the search, then lays the helices out in the frame of the real fold so that the camera stays put.
  solve(seed, pairs = this.hitPairs) {
    const { folder, p } = this;
    const real = pairs === this.hitPairs;
    // The best arrangement so far stands unless the new search beats it, so a new clue cannot undo the last one.
    const out = folder.solve(pairs, { seed: seed + 1, restarts: 10, steps: 2400, keep: real ? this.bestState : null });
    if (real) this.bestState = out.state;
    const found = folder.coordsOf(out.state);
    const fit = superpose(found, folder.nativeRigid);
    const goal = new Float32Array(p.n * 3);
    const known = new Array(p.n).fill(false);
    folder.rigidIndex.forEach((r, k) => {
      for (let q = 0; q < 3; q++) goal[r * 3 + q] = fit.moved[k * 3 + q];
      known[r] = true;
    });
    // Loops and tails are not part of the search: they are simply drawn between the pieces.
    let i = 0;
    while (i < p.n) {
      if (known[i]) {
        i++;
        continue;
      }
      let e = i;
      while (e < p.n && !known[e]) e++;
      for (let q = i; q < e; q++) {
        const before = i - 1, after = e;
        for (let k = 0; k < 3; k++) {
          if (before >= 0 && after < p.n) goal[q * 3 + k] = goal[before * 3 + k] + ((goal[after * 3 + k] - goal[before * 3 + k]) * (q - before)) / (after - before);
          else if (after < p.n) goal[q * 3 + k] = goal[after * 3 + k] + (after - q) * (k === 0 ? 2.8 : 0.6);
          else goal[q * 3 + k] = goal[before * 3 + k] + (q - before) * (k === 0 ? -2.8 : 0.6);
        }
      }
      i = e;
    }
    // Keep the whole chain in view, wherever the search has put it.
    const mid = [0, 0, 0];
    for (let i = 0; i < p.n; i++) for (let k = 0; k < 3; k++) mid[k] += goal[i * 3 + k] / p.n;
    let far = 0;
    for (let i = 0; i < p.n; i++) {
      for (let k = 0; k < 3; k++) goal[i * 3 + k] -= mid[k];
      far = Math.max(far, Math.hypot(goal[i * 3], goal[i * 3 + 1], goal[i * 3 + 2]));
    }
    this.radius = clamp(far + 3, 20, 44);
    if (this.panel) this.layout();
    this.goal = goal;
    this.rmsd = fit.rmsd;
    this.from = Float32Array.from(this.ca);
    this.t = 0;
  }

  say() {
    this.readout.textContent = `${this.rmsd.toFixed(1)} Å from the real fold. ${this.hits} hits, ${this.misses} misses.`;
  }

  panelHeight() {
    return clamp(Math.min(this.press.cssW, this.press.cssH * 0.46), 320, 420);
  }

  panelMoved() {
    const r = Math.min(2, devicePixelRatio || 1);
    const box = this.panel.getBoundingClientRect();
    const size = Math.max(100, Math.min(box.width, box.height - 26));
    this.size = size;
    this.canvas.width = this.canvas.height = size * r;
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    this.g = this.canvas.getContext('2d');
    this.g.setTransform(r, 0, 0, r, 0, 0);
    this.paint();
  }

  cell() {
    const n = this.core.length;
    return { m: 26, c: (this.size - 26) / n, n };
  }

  // A pair inside one helix tells the search nothing, so only pairs across helices are on offer.
  live(i, k) {
    return k > i && this.piece(this.core[i]) !== this.piece(this.core[k]);
  }

  paint() {
    const { g, core, p } = this;
    if (!g) return;
    const { m, c, n } = this.cell();
    g.clearRect(0, 0, this.size, this.size);
    g.font = `800 ${clamp(c * 0.42, 10, 13)}px Bricolage, sans-serif`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      g.fillStyle = '#1f2aa6';
      g.fillText(p.seq[core[i]], m + (i + 0.5) * c, 12);
      g.fillText(p.seq[core[i]], 12, m + (i + 0.5) * c);
      for (let k = i + 1; k < n; k++) {
        if (!this.live(i, k)) continue;
        const x = m + k * c + 1;
        const y = m + i * c + 1;
        const state = this.shots.get(`${i},${k}`);
        g.fillStyle = state === 1 ? '#ff4a9e' : state === 0 ? 'rgba(31,42,166,.5)' : 'rgba(255,255,255,.75)';
        g.beginPath();
        g.roundRect(x, y, c - 2, c - 2, 4);
        g.fill();
      }
    }
  }

  tap(e) {
    const r = this.canvas.getBoundingClientRect();
    const { m, c } = this.cell();
    const k = Math.floor((e.clientX - r.left - m) / c);
    const i = Math.floor((e.clientY - r.top - m) / c);
    if (i < 0 || k >= this.core.length || !this.live(i, k) || this.over) return;
    this.shoot(i, k);
  }

  shoot(i, k) {
    const key = `${i},${k}`;
    if (this.shots.has(key)) return;
    const { core, p } = this;
    const pair = [core[i], core[k]];
    const hit = this.truth.has(`${pair[0]},${pair[1]}`);
    this.shots.set(key, hit ? 1 : 0);
    const name = (x) => `${p.seq[core[x]]}${p.resno[core[x]]}`;
    if (hit) {
      this.hits++;
      this.hitPairs.push(pair);
      this.sound.zip(this.hits % 12);
      this.sound.ratchet(0.1);
      buzz(16);
      this.solve(this.hits);
      this.hud.setGoal(`${name(i)} touches ${name(k)}. The search ran again from random starts.`);
      if (this.hits === 3) this.stamp(0);
      this.judge();
    } else {
      this.misses++;
      this.missPairs.push(pair);
      this.sound.bump();
      this.hud.setGoal(`${name(i)} and ${name(k)} do not touch.`);
    }
    this.say();
    this.paint();
  }

  judge() {
    if (this.over) return;
    const close = this.hits >= this.stage.least && this.rmsd <= this.stage.target;
    const all = this.hits >= this.pairsThere;
    if (!close && !all) return;
    this.over = true;
    this.stamp(1);
    this.stamp(2, this.misses <= this.stage.par);
    this.sound.bloom();
    if (!close) this.hud.setGoal(`That is every contact on the grid. The search still sits ${this.rmsd.toFixed(1)} Å away: a short list of contacts does not always settle the arrangement.`);
    const score = this.rmsd;
    const hits = this.hits;
    setTimeout(() => this.falseTest(score, hits), close ? 1700 : 3000);
  }

  // The same search, the same number of clues, all of them false.
  falseTest(score, hits) {
    const { core, truth, tips } = this;
    // False means truly far apart: a near miss would be a fair clue, not a false one.
    const far = [];
    for (let i = 0; i < core.length; i++)
      for (let k = i + 1; k < core.length; k++) {
        const [a, b] = [core[i], core[k]];
        if (!this.live(i, k) || truth.has(`${a},${b}`)) continue;
        const d = Math.hypot(tips[a * 3] - tips[b * 3], tips[a * 3 + 1] - tips[b * 3 + 1], tips[a * 3 + 2] - tips[b * 3 + 2]);
        far.push([d, a, b]);
      }
    far.sort((x, y) => y[0] - x[0]);
    this.solve(99, far.slice(0, hits).map(([, a, b]) => [a, b]));
    this.say();
    this.hitPairs = [];
    this.shots.clear();
    this.paint();
    this.hud.setGoal(`Now the same search with ${hits} false pairs: ${this.rmsd.toFixed(1)} Å from the real fold.`);
    this.ctx.finishSoon(`${hits} true contacts: ${score.toFixed(1)} Å. ${hits} false ones: ${this.rmsd.toFixed(1)} Å. One run each, and runs vary.`, 3000);
  }

  pose() {
    const { ca, o, p } = this;
    fakeO(ca, p.n, o);
    this.ribbon.setCoords(ca, o);
    this.core.forEach((r, i) => this.beads.set(i, ca[r * 3], ca[r * 3 + 1], ca[r * 3 + 2], 2.3, TONE.oil, 100 + i));
    this.beads.commit(this.core.length);
  }

  update(dt) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 0.7);
      const e = ease(this.t);
      for (let i = 0; i < this.ca.length; i++) this.ca[i] = this.from[i] + (this.goal[i] - this.from[i]) * e;
      this.pose();
    }
    const g = this.overlay.g;
    for (const [ra, rb] of this.hitPairs) {
      const a = this.overlay.project(new THREE.Vector3(this.ca[ra * 3], this.ca[ra * 3 + 1], this.ca[ra * 3 + 2]));
      const b = this.overlay.project(new THREE.Vector3(this.ca[rb * 3], this.ca[rb * 3 + 1], this.ca[rb * 3 + 2]));
      g.lineCap = 'round';
      g.setLineDash([1, 7]);
      g.lineWidth = 3.5;
      g.strokeStyle = '#1f2aa6';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.setLineDash([]);
    }
  }
}

const HELICES = { gcn4: 2, gcn4tri: 3, gcn4tet: 4 };
const kindOf = (deg) => (deg < 40 ? 'parallel' : deg > 70 ? 'perpendicular' : 'acute');

// Stage: measure the packing in real bundles, derive the rule, then predict cores you have not seen.
class Knobs extends Bay {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.wrong = 0;
    this.bets = 0;
    this.seen = new Set();
    this.panel = $('div', 'dock core-chips knob-dock');
    this.table = $('div', 'knobtable');
    ctx.layer.append(this.table, this.panel);
    this.rows = [];
    this.at = 0;
    this.measure();
  }

  panelHeight() {
    return 62;
  }

  panelMoved() {
    const r = this.panel.getBoundingClientRect();
    this.table.style.cssText = `left:${Math.max(8, r.left)}px;width:${Math.min(innerWidth - 16, r.width || innerWidth - 16)}px;bottom:${innerHeight - r.top + 4}px`;
  }

  angles(protein) {
    const { p } = foldOf(protein);
    const { a, d } = this.stage;
    const A = packingAngles(p, a, 'a');
    const D = packingAngles(p, d, 'd');
    return { a: median(A.map((x) => x.angle)), d: median(D.map((x) => x.angle)), A, D, letters: { a: p.seq[A[1]?.knob ?? 0], d: p.seq[D[1]?.knob ?? 0] } };
  }

  // Step one: two real bundles, both layers.
  measure() {
    const c = this.stage.seen[this.at];
    this.clearMeshes();
    this.pitchGoal = 1.42;
    this.gap = this.gapGoal = 0;
    this.build(c);
    this.layer = null;
    this.got = new Set();
    this.c = c;
    this.ang = this.angles(c.protein);
    const row = $('div', 'row');
    for (const pos of ['a', 'd']) row.append(button('chip big', `Measure ${pos}`, () => this.show(pos)));
    this.panel.replaceChildren(row);
    this.layout();
    this.rig.dist = this.rig.distTarget;
    this.drawTable();
    this.hud.setGoal(`${c.title}: ${HELICES[c.protein]} helices, seen from the end. Measure how each knob enters its hole.`);
  }

  show(pos) {
    this.layerOn = pos;
    this.sound.tick(0.14);
    this.got.add(pos);
    const deg = this.ang[pos];
    this.paintLayer(pos);
    this.hud.setGoal(`Position ${pos}: the knob's first bond lies at ${Math.round(deg)}° to the base of its hole, which is ${kindOf(deg)} packing.`);
    this.drawTable();
    if (this.got.size === 2) {
      this.rows.push({ title: this.c.title, n: HELICES[this.c.protein], a: this.ang.a, d: this.ang.d, la: this.c.a, ld: this.c.d });
      this.got = new Set(['done']);
      this.panel.replaceChildren(button('btn pink', this.at + 1 < this.stage.seen.length ? 'Next bundle' : 'What is the rule?', () => this.nextMeasure()));
      this.drawTable();
    }
  }

  nextMeasure() {
    this.at++;
    if (this.at < this.stage.seen.length) this.measure();
    else this.ask(0);
  }

  drawTable() {
    const head = '<tr><th>Bundle</th><th>a</th><th>d</th></tr>';
    const rows = this.rows.map((r) => `<tr><td>${r.n} helices</td><td>${r.la} ${Math.round(r.a)}° ${kindOf(r.a)}</td><td>${r.ld} ${Math.round(r.d)}° ${kindOf(r.d)}</td></tr>`).join('');
    this.table.innerHTML = rows ? `<table class="facts">${head}${rows}</table>` : '';
    this.panelMoved();
  }

  // Step two: read the rule off the table.
  ask(i) {
    const q = this.stage.rule[i];
    if (!q) return this.predict(0);
    this.hud.setGoal(q.ask);
    const row = $('div', 'row');
    for (const [label, right] of q.options) {
      row.append(button('chip big', label, () => {
        if (right) {
          this.sound.chord([5, 7], 0.12);
          this.ask(i + 1);
        } else {
          this.wrong++;
          this.sound.bump();
          this.hud.setGoal(`Look at the table again. ${q.ask}`);
        }
      }));
    }
    this.panel.replaceChildren(row);
    this.layout();
  }

  // Step three: cores you have not measured.
  predict(i) {
    const c = this.stage.unseen[i];
    if (!c) return this.finish();
    this.clearMeshes();
    this.gap = this.gapGoal = 16;
    this.pitchGoal = 0.25;
    this.build(c);
    this.rig.pitch = 0.25;
    const row = $('div', 'row');
    for (const n of [2, 3, 4]) row.append(button('chip big', `${n} helices`, () => this.bet(c, n, i)));
    this.panel.replaceChildren(row);
    this.layout();
    this.rig.dist = this.rig.distTarget;
    this.hud.setGoal(`New core: a is ${c.a}, d is ${c.d}. Use the rule: how many helices?`);
  }

  bet(c, n, i) {
    const ok = n === c.n;
    if (ok) this.bets++;
    this.panel.replaceChildren();
    this.sound.squeeze();
    this.gapGoal = 0;
    this.pitchGoal = 1.42;
    this.radius = 22;
    this.layout();
    setTimeout(() => {
      this.sound[ok ? 'clunk' : 'bump']();
      buzz(24);
      this.paintLayer(null);
      this.hud.setGoal(`${ok ? 'Yes' : 'No'}: ${c.n} helices. ${c.after}`);
      this.panel.append(button('btn pink', i + 1 < this.stage.unseen.length ? 'Next core' : 'Finish', () => this.predict(i + 1)));
      this.layout();
    }, 800);
  }

  finish() {
    const { ctx } = this;
    this.panel.replaceChildren();
    this.table.innerHTML = '';
    this.stamp(0);
    this.stamp(1, this.wrong === 0);
    this.stamp(2, this.bets === this.stage.unseen.length);
    ctx.finishSoon('Oil keeps the helices together. The shapes in the holes decide how many.', 400);
  }

  build(c) {
    const { p, d } = foldOf(c.protein);
    this.p = p;
    const chains = [...new Set(p.chain)];
    // Stand the bundle on its axis, then look down it.
    const idx = (ch) => Array.from({ length: p.n }, (_, i) => i).filter((i) => p.chain[i] === ch);
    const cA = idx(chains[0]);
    const first = [0, 1, 2].map((k) => (p.caXYZ[cA[0] * 3 + k] + p.caXYZ[cA[1] * 3 + k] + p.caXYZ[cA[2] * 3 + k] + p.caXYZ[cA[3] * 3 + k]) / 4);
    const L = cA.length - 4;
    const last = [0, 1, 2].map((k) => (p.caXYZ[cA[L] * 3 + k] + p.caXYZ[cA[L + 1] * 3 + k] + p.caXYZ[cA[L + 2] * 3 + k] + p.caXYZ[cA[L + 3] * 3 + k]) / 4);
    const axis = new THREE.Vector3(last[0] - first[0], last[1] - first[1], last[2] - first[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
    const c0 = [0, 1, 2].map((k) => { let s = 0; for (let i = 0; i < p.n; i++) s += p.caXYZ[i * 3 + k]; return s / p.n; });
    const v = new THREE.Vector3();
    const X = (this.X = (x, y, z) => v.set(x - c0[0], y - c0[1], z - c0[2]).applyQuaternion(q).toArray());
    const at = (arr, i) => X(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
    this.groups = chains.map((ch) => {
      const list = idx(ch);
      const ss = list.map((i) => q3(d.ss[i])).join('');
      const r = this.add(new Ribbon(ss, [], { helixWidth: 1.25, coil: 0.3, thickness: 0.3 }));
      const ca = new Float32Array(list.length * 3);
      const o = new Float32Array(list.length * 3);
      let mx = 0, mz = 0;
      list.forEach((i, s) => {
        ca.set(at(p.caXYZ, i), s * 3);
        o.set(at(p.oXYZ, i), s * 3);
        mx += ca[s * 3] / list.length;
        mz += ca[s * 3 + 2] / list.length;
      });
      r.setCoords(ca, o);
      r.paint(() => [0, 0, 0.3], () => 2);
      const a = this.add(new Atoms(600));
      const l = Math.hypot(mx, mz) || 1;
      return { r, a, ch, dir: [mx / l, 0, mz / l] };
    });
    this.radius = 26;
    this.rig.yaw = 0.35;
    if (this.pitchGoal > 1) this.rig.pitch = this.pitchGoal;
    this.paintLayer(null);
    this.applyGap();
  }

  // Knobs: one layer in full ink, the other quiet. With no layer chosen, both print.
  paintLayer(pos) {
    const { p, X } = this;
    this.layerOn = pos;
    const { a: A, d: D } = this.stage;
    for (const g of this.groups) {
      let n = 0;
      for (let t = 0; t < p.atomRes.length; t++) {
        const res = p.atomRes[t];
        if (p.chain[res] !== g.ch || p.atomSide[t] !== '1') continue;
        const kind = A.includes(p.resno[res]) ? 'a' : D.includes(p.resno[res]) ? 'd' : '';
        if (!kind) continue;
        const w = X(p.atomXYZ[t * 3], p.atomXYZ[t * 3 + 1], p.atomXYZ[t * 3 + 2]);
        const base = kind === 'a' ? TONE.oil : TONE.helix;
        const quiet = pos && kind !== pos;
        g.a.set(n++, w[0], w[1], w[2], quiet ? 1.2 : 1.7, quiet ? base.map((v) => v * 0.25) : base, 40 + (res % 200));
      }
      g.a.commit(n);
    }
  }

  applyGap() {
    for (const g of this.groups) {
      g.r.mesh.position.set(g.dir[0] * this.gap, 0, g.dir[2] * this.gap);
      g.a.mesh.position.copy(g.r.mesh.position);
    }
  }

  // One knob and the base of its hole, drawn on the model.
  paintVector() {
    if (!this.layerOn || !this.ang) return;
    const list = this.layerOn === 'a' ? this.ang.A : this.ang.D;
    const k = list[Math.min(1, list.length - 1)];
    if (!k) return;
    const P = (q) => this.overlay.project(new THREE.Vector3(...this.X(q[0], q[1], q[2])));
    const g = this.overlay.g;
    const line = (u, w, ink) => {
      const a = P(u), b = P(w);
      g.lineCap = 'round';
      g.lineWidth = 7;
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.lineWidth = 3.5;
      g.strokeStyle = ink;
      g.stroke();
    };
    line(k.base[0], k.base[1], '#1f2aa6');
    line(k.ca, k.cb, '#ff4a9e');
  }

  update(dt) {
    this.gap += (this.gapGoal - this.gap) * (1 - Math.exp(-dt * 7));
    this.rig.pitch += (this.pitchGoal - this.rig.pitch) * (1 - Math.exp(-dt * 3));
    this.applyGap();
    this.paintVector();
  }

  dispose() {
    super.dispose();
    this.table.remove();
  }
}

const LEFT = (s) => `${s.toFixed(1)} kcal/mol`;

// Stage: pull a leucine, pay for the hole, then fill it.
class Cavity extends Bay {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { p, d } = foldOf('t4l');
    this.p = p;
    const ss = Array.from(d.ss, q3).join('');
    const r = this.add(new Ribbon(ss, [], { helixWidth: 1.2, strandWidth: 1.3, coil: 0.28, thickness: 0.3 }));
    r.setCoords(p.caXYZ, p.oXYZ);
    r.paint((i) => [0, 0, this.ssTone(ss[i])], (i) => 2 + (i >> 4));
    this.atoms = this.add(new Atoms(p.atomRes.length + 12));
    this.gone = new Set();
    const c = [0, 0, 0];
    for (let i = 0; i < p.n; i++) for (let k = 0; k < 3; k++) c[k] += p.caXYZ[i * 3 + k] / p.n;
    this.centre = c;
    this.rig.target.set(...c);
    this.rig.targetGoal.set(...c);
    this.rig.yaw = 0.8;
    this.rig.pitch = 0.2;
    this.radius = 29;
    this.spots = stage.spots.map((s) => ({ ...s, res: indexOf(p, s.no) }));
    this.buriedSet = new Set();
    for (let i = 0; i < p.n; i++) if (p.rsa[i] <= 10) this.buriedSet.add(i);
    this.paintAtoms();
    this.panel = $('div', 'dock core-chips');
    this.bar = $('div', 'fit cost');
    this.fill = $('i');
    this.text = $('span', '', 'Stability lost');
    this.bar.append(this.fill, this.text);
    ctx.layer.append(this.bar, this.panel);
    this.step = 0;
    this.nextStep();
    this.layout();
    this.rig.dist = this.rig.distTarget;
  }

  ssTone(s) {
    return s === 'H' ? 0.3 : 0.2;
  }

  panelHeight() {
    return 138;
  }

  panelMoved() {
    const r = this.panel.getBoundingClientRect();
    if (r.height > 200) {
      // Wide screens give the panel a whole column; the meter sits at its foot.
      this.panel.style.height = 'auto';
    }
    const h = this.panel.getBoundingClientRect();
    this.bar.style.cssText = `left:${h.left + 4}px;right:auto;width:${h.width - 8}px;margin-left:0;bottom:${innerHeight - h.top + 10}px`;
  }

  paintAtoms(benzene = 0) {
    const { p } = this;
    let n = 0;
    for (let a = 0; a < p.atomRes.length; a++) {
      const r = p.atomRes[a];
      if (p.atomSide[a] !== '1' || !this.buriedSet.has(r) || this.gone.has(r)) continue;
      const spot = this.spots.some((s) => s.res === r);
      this.atoms.set(n++, p.atomXYZ[a * 3], p.atomXYZ[a * 3 + 1], p.atomXYZ[a * 3 + 2], spot ? 1.75 : 1.6, spot ? TONE.helix : [0.34 * 0.6, 0.6, 0.05], 40 + (r % 200));
    }
    if (benzene) for (let i = 0; i < p.hetEl.length; i++) this.atoms.set(n++, p.hetXYZ[i * 3], p.hetXYZ[i * 3 + 1] + (1 - benzene) * 40, p.hetXYZ[i * 3 + 2], 1.75, [0, 1, 0], 250);
    this.atoms.commit(n);
  }

  nextStep() {
    const s = this.spots[this.step];
    this.panel.replaceChildren();
    if (this.step < 2) {
      this.hud.setGoal(this.step === 0 ? `Three leucines in the core of T4 lysozyme, all the same size. Pull ${s.name}: it becomes alanine.` : `Now ${s.name}. Same swap, same residue.`);
      this.panel.append(button('btn pink', `Pull ${s.name}`, () => this.pull(s)));
    } else {
      this.hud.setGoal(`${s.name} leaves a cavity of ${s.cavity} Å³. Empty space costs about 24 cal/mol per Å³, on top of about 2 kcal/mol for the lost oil. Set your prediction.`);
      const slider = $('input', 'salt');
      slider.type = 'range';
      slider.min = 10;
      slider.max = 80;
      slider.value = 30;
      slider.setAttribute('aria-label', 'Predicted cost in kcal per mole');
      const read = $('p', 'saltread', '3.0 kcal/mol');
      slider.addEventListener('input', () => (read.textContent = `${(slider.value / 10).toFixed(1)} kcal/mol`));
      this.slider = slider;
      this.panel.append(read, slider, button('btn pink', `Pull ${s.name}`, () => this.pull(s, slider.value / 10)));
    }
    this.layout();
  }

  pull(s, guess) {
    this.gone.add(s.res);
    this.paintAtoms();
    this.sound.bump();
    this.sound.clunk(0.34);
    buzz(30);
    this.shown = 0;
    this.goal = s.ddg;
    this.holes = [...(this.holes ?? []), s];
    this.panel.replaceChildren();
    if (this.step === 1) this.stamp(0);
    let line = `${s.name}: measured ${LEFT(s.ddg)} lost, cavity ${s.cavity ? `${s.cavity} Å³` : 'not in our sources'}.`;
    if (guess !== undefined) {
      const off = Math.abs(guess - s.ddg);
      this.stamp(1, off <= this.stage.near);
      this.stamp(2, off <= this.stage.close);
      line = `You said ${LEFT(guess)}. Measured: ${LEFT(s.ddg)}. The extra cost of a hole is real, and it is why cores pack tight.`;
    }
    this.hud.setGoal(line);
    this.step++;
    setTimeout(() => (this.step < 3 ? this.nextStep() : this.fillIt()), 1900);
  }

  fillIt() {
    this.hud.setGoal('A cavity is a real place. One benzene molecule takes up about 85 Å³. Where can it go?');
    this.panel.replaceChildren();
    const row = $('div', 'row');
    row.append(button('chip big', 'L46A, 24 Å³', () => this.tryBenzene(false)), button('chip big', 'L99A, 150 Å³', () => this.tryBenzene(true)));
    this.panel.append(row);
    this.layout();
  }

  tryBenzene(ok) {
    if (!ok) {
      this.sound.bump();
      this.hud.setGoal('Far too small: one benzene is more than three times the size of that hole.');
      return;
    }
    this.panel.replaceChildren();
    this.benzeneT = 0;
    this.sound.squeeze();
    this.hud.setGoal('');
  }

  update(dt) {
    if (this.goal !== undefined) {
      this.shown += (this.goal - this.shown) * Math.min(1, dt * 6);
      this.fill.style.transform = `scaleX(${clamp(this.shown / 6, 0, 1)})`;
      this.text.textContent = `Stability lost: ${this.shown.toFixed(1)} kcal/mol`;
    }
    const g = this.overlay.g;
    for (const s of this.holes ?? []) {
      const p = this.p;
      const a = this.overlay.project(new THREE.Vector3(p.caXYZ[s.res * 3], p.caXYZ[s.res * 3 + 1], p.caXYZ[s.res * 3 + 2]));
      g.beginPath();
      g.arc(a.x, a.y, 7 + (s.cavity ?? 40) ** 0.5 * 1.2, 0, 7);
      g.setLineDash([2, 6]);
      g.lineCap = 'round';
      g.lineWidth = 3.5;
      g.strokeStyle = '#1f2aa6';
      g.stroke();
      g.setLineDash([]);
    }
    if (this.benzeneT !== undefined && this.benzeneT < 1) {
      this.benzeneT = Math.min(1, this.benzeneT + dt / 1);
      this.paintAtoms(ease(this.benzeneT));
      if (this.benzeneT === 1) {
        this.sound.bloom();
        this.ctx.finishSoon('Benzene fills the L99A hole and raises the melting temperature by 6 °C: filling a cavity pays back.', 1600);
      }
    }
  }

  dispose() {
    super.dispose();
    this.bar.remove();
  }
}

const TILES = 'AVLIMFW';
const FIT_INK = { fit: '#ffd21f', hole: '#a9b6ea', clash: '#ff4a9e', shape: '#ffffff' };

// Stage: real sites and volumes, a rule of our own, then the lab's verdict on that rule.
class Repack extends Bay {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { p, d } = foldOf('t4l');
    this.p = p;
    this.sites = stage.sites.map((no) => {
      const res = indexOf(p, no);
      return { res, no, wt: p.seq[res], inHelix: q3(d.ss[res]) === 'H' };
    });
    const index = new Map(this.sites.map((s, i) => [s.res, i]));
    const rawLinks = sideContacts(p, { within: new Set(index.keys()) });
    const links = new Map();
    for (const [k, v] of rawLinks) {
      const [a, b] = k.split(',').map(Number);
      links.set(`${index.get(a)},${index.get(b)}`, v);
    }
    this.links = links;
    this.c = coupling(this.sites, links);
    // Each site's centre, from the real side chain.
    this.centres = this.sites.map((s) => {
      let n = 0;
      const c = [0, 0, 0];
      for (let a = 0; a < p.atomRes.length; a++) {
        if (p.atomRes[a] !== s.res || p.atomSide[a] !== '1') continue;
        for (let k = 0; k < 3; k++) c[k] += p.atomXYZ[a * 3 + k];
        n++;
      }
      return c.map((v) => v / n);
    });
    const m = [0, 1, 2].map((k) => this.centres.reduce((t, c) => t + c[k], 0) / this.centres.length);
    this.mid = m;
    // Only the lobe that holds these sites: the rest would hide them.
    const from = indexOf(p, 80);
    const ss = Array.from(d.ss, q3).join('').slice(from);
    const r = this.add(new Ribbon(ss, [], { helixWidth: 1.1, strandWidth: 1.2, coil: 0.26, thickness: 0.28 }));
    r.setCoords(p.caXYZ.slice(from * 3), p.oXYZ.slice(from * 3));
    r.paint((i) => [0, 0, ss[i] === 'H' ? 0.22 : 0.16], (i) => 2 + (i >> 4));
    this.balls = this.add(new Atoms(this.sites.length));
    this.rig.target.set(...m);
    this.rig.targetGoal.set(...m);
    this.rig.yaw = 2.4;
    this.rig.pitch = 0.1;
    this.radius = 25;
    this.panel = $('div', 'jig');
    this.bookHost = $('div', 'jighost');
    this.total = $('p', 'gridread');
    this.tray = $('div', 'tray');
    this.panel.append(this.total, this.bookHost, this.tray);
    ctx.layer.append(this.panel);
    this.book = new Book(this.bookHost, (b) => this.select(b));
    this.book.el.style.cssText = 'position:absolute;inset:0';
    for (const a of TILES) {
      const t = button('tile', a, () => this.place(a));
      t.dataset.aa = a;
      this.tray.append(t);
    }
    this.book.beads = this.sites.map((s, i) => {
      const c = this.centres[i];
      return { i, x: c[0] - m[0], y: c[1] - m[1], size: 21, ink: '#fff', label: s.wt };
    });
    this.letters = this.sites.map(() => 'A');
    this.moves = 0;
    this.chosen = null;
    this.hud.setGoal('This core has been emptied: every site is Ala. Refill it. Tap a site to read its pocket, then a tile. Our rule scores volume and shape. Yellow fits.');
    this.read();
    this.layout();
    this.rig.dist = this.rig.distTarget;
  }

  panelHeight() {
    return clamp(this.press.cssH * 0.45, 340, 400);
  }

  panelMoved() {
    this.book.size();
    this.placeBeads();
  }

  placeBeads() {
    const { w, h } = this.book;
    const bs = this.book.beads;
    const sx = Math.max(...bs.map((b) => Math.abs(b.x))) || 1;
    const sy = Math.max(...bs.map((b) => Math.abs(b.y))) || 1;
    for (const b of bs) {
      b.px = w / 2 + (b.x / sx) * (w / 2 - 28);
      b.py = h / 2 - (b.y / sy) * (h / 2 - 26);
    }
    for (let it = 0; it < 60; it++)
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const A = bs[i], B = bs[j];
          let dx = B.px - A.px, dy = B.py - A.py;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 50) {
            dx *= (50 - d) / d / 2;
            dy *= (50 - d) / d / 2;
            A.px -= dx; A.py -= dy; B.px += dx; B.py += dy;
          }
        }
    for (const b of bs) {
      b.px = clamp(b.px, 24, w - 24);
      b.py = clamp(b.py, 24, h - 24);
    }
    this.paint();
  }

  read() {
    const s = (this.state = packing(this.sites, this.c, this.letters));
    s.mismatch.forEach((m, i) => {
      const b = this.book.beads[i];
      const kind = s.fit[i] ? 'fit' : !s.shaped[i] && s.sized[i] ? 'shape' : m < 0 ? 'hole' : 'clash';
      b.kind = kind;
      b.ink = FIT_INK[kind];
      b.label = this.letters[i];
      b.bold = this.chosen === i;
      const c = this.centres[i];
      const r = Math.cbrt((3 * (VOLUME[this.letters[i]] - 50)) / (4 * Math.PI)) * 1.25;
      this.balls.set(i, c[0], c[1], c[2], r, kind === 'clash' ? TONE.helix : kind === 'hole' ? [0.1, 0.3, 0.1] : kind === 'shape' ? [0, 0, 0.3] : TONE.oil, 60 + i);
    });
    this.balls.commit(this.sites.length);
    const sum = s.total;
    this.total.textContent = `Volume ${sum > 0 ? '+' : ''}${Math.round(sum)} Å³ against natural. ${s.foldKept ? 'Our rule: the fold holds.' : 'Our rule: too far off.'} ${s.fit.filter(Boolean).length} of ${s.fit.length} sites fit.`;
    this.paint();
  }

  paint() {
    const { book } = this;
    const { g } = book;
    if (!g || !book.w || !book.beads[0]?.px) return;
    g.clearRect(0, 0, book.w, book.h);
    for (const [k, v] of this.links) {
      const [a, b] = k.split(',').map(Number);
      const A = book.beads[a], B = book.beads[b];
      g.strokeStyle = 'rgba(31,42,166,.45)';
      g.lineWidth = 1 + v * 0.6;
      g.beginPath();
      g.moveTo(A.px, A.py);
      g.lineTo(B.px, B.py);
      g.stroke();
    }
    for (const b of book.beads) book.bead(b, this.chosen === b.i ? '#1f2aa6' : null);
  }

  select(b) {
    if (this.bench) return;
    this.chosen = b.i;
    this.sound.tick(0.14);
    this.read();
    this.hud.setGoal(`The pocket at site ${this.sites[b.i].no} is shaped for a side chain that is ${SHAPE_NAME[SHAPE[this.sites[b.i].wt]]}. Now pick a tile.`);
  }

  place(a) {
    if (this.bench) return;
    if (this.chosen === null) {
      this.hud.setGoal('Tap a site first.');
      return;
    }
    const i = this.chosen;
    if (this.letters[i] === a) return;
    const before = this.state.fit[i];
    this.letters[i] = a;
    this.moves++;
    this.read();
    if (this.state.fit[i] && !before) {
      this.sound.clunk(0.26);
      buzz(10);
    } else this.sound.ratchet(0.12);
    const s = this.state;
    const kind = this.book.beads[i].kind;
    if (kind === 'shape') this.hud.setGoal(`The size fits, but ${a} is ${SHAPE_NAME[SHAPE[a]]}, the wrong shape for this site. White means wrong shape.`);
    else if (kind === 'hole') this.hud.setGoal('Pale blue: too empty here.');
    else if (kind === 'clash') this.hud.setGoal('Pink: too full here.');
    if (s.foldKept) this.stamp(0);
    if (s.allFit) {
      this.stamp(1);
      this.stamp(2, this.moves <= this.stage.par);
      this.sound.chord([5, 7, 9], 0.13);
      this.benchTest(0);
    }
  }

  // The rule meets the lab. Each case is set on the board, the rule gives its verdict, and the measurement answers.
  benchTest(i) {
    this.bench = true;
    const c = this.stage.bench[i];
    if (!c) return this.finish();
    this.letters = this.sites.map((s) => c.set[s.no] ?? s.wt);
    this.read();
    const misfits = this.state.fit.filter((v) => !v).length;
    this.hud.setGoal(`${c.name}. Our rule flags ${misfits} ${misfits === 1 ? 'site' : 'sites'}. What did the lab measure?`);
    const row = $('div', 'row');
    row.style.gridColumn = '1 / -1';
    for (const [label, val] of [['More stable', 1], ['Less stable', -1]]) {
      row.append(button('chip big', label, () => {
        this.sound[val === c.real ? 'clunk' : 'bump']();
        this.hud.setGoal(c.after);
        this.tray.replaceChildren(button('btn pink', i + 1 < this.stage.bench.length ? 'Next test' : 'Done', () => this.benchTest(i + 1)));
      }));
    }
    this.tray.className = 'tray bench';
    this.tray.replaceChildren(row);
  }

  finish() {
    this.tray.replaceChildren();
    this.ctx.finishSoon('Hydrophobicity keeps the fold. Shape sets stability, and even a good rule misses strain.', 300);
  }

  dispose() {
    super.dispose();
    this.book.dispose();
  }
}

// Stage: oil is not all there is. Every buried polar group has a partner.
class Buried extends Bay {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { p, d } = foldOf('gfp');
    this.p = p;
    const ss = Array.from(d.ss, q3).join('');
    this.ss = ss;
    const r = (this.ribbon = this.add(new Ribbon(ss, [], { helixWidth: 1.15, strandWidth: 1.3, coil: 0.28, thickness: 0.3 })));
    r.setCoords(p.caXYZ, p.oXYZ);
    r.paint((i) => (ss[i] === 'E' ? TONE.strand : [0, 0, 0.2]), (i) => 2 + (i >> 4));
    const c = [0, 0, 0];
    for (let i = 0; i < p.n; i++) for (let k = 0; k < 3; k++) c[k] += p.caXYZ[i * 3 + k] / p.n;
    this.centre = c;
    this.rig.target.set(...c);
    this.rig.targetGoal.set(...c);
    this.rig.yaw = 0.3;
    this.rig.pitch = 0.2;
    this.radius = 30;
    this.side = stage.polar.map((no) => indexOf(p, no));
    this.atoms = this.add(new Atoms(400));
    this.paintAtoms();
    this.panel = $('div', 'jig');
    this.bookHost = $('div', 'jighost full');
    this.panel.append(this.bookHost);
    ctx.layer.append(this.panel);
    this.book = new Book(this.bookHost, null);
    this.book.el.style.cssText = 'position:absolute;inset:0';
    const axisPts = stage.polar.map((no) => this.tip(indexOf(p, no)));
    const m = [0, 1, 2].map((k) => axisPts.reduce((t, q) => t + q[k], 0) / axisPts.length);
    this.book.beads = stage.polar.map((no, i) => {
      const res = indexOf(p, no);
      const cls = classOf(p.seq[res]);
      const x = res === indexOf(p, 66);
      return { res, no, i, x: axisPts[i][0] - m[0], y: axisPts[i][1] - m[1], size: 21, ink: x ? '#ffd21f' : cls === 'plus' ? '#ff4a9e' : cls === 'minus' ? '#1f2aa6' : '#a9b6ea', text: cls === 'minus' && !x ? '#fff' : '#1f2aa6', label: `${x ? 'Glow' : p.seq[res] + no}` };
    });
    this.book.hooks = { down: () => this.sound.tick(0.12), move: () => this.paint(), up: (h, o) => this.drop(h, o) };
    this.pairs = [];
    this.misses = 0;
    this.paired = new Set();
    this.layout();
    this.rig.dist = this.rig.distTarget;
    const buried = p.rsa.filter((v) => v <= 10).length;
    let polar = 0;
    p.rsa.forEach((v, i) => {
      if (v <= 10 && 'STNQHDEKR'.includes(p.seq[i])) polar++;
    });
    this.hud.setGoal(`${Math.round((100 * buried) / p.n)}% of GFP is buried, and ${Math.round((100 * polar) / buried)}% of that is polar. Almost none of those groups stays unpaired. Drag each to its real partner.`);
  }

  tip(res) {
    const { p } = this;
    const pts = [];
    for (let a = 0; a < p.atomRes.length; a++) if (p.atomRes[a] === res && p.atomSide[a] === '1') pts.push([p.atomXYZ[a * 3], p.atomXYZ[a * 3 + 1], p.atomXYZ[a * 3 + 2]]);
    return [0, 1, 2].map((k) => pts.reduce((t, q) => t + q[k], 0) / pts.length);
  }

  paintAtoms() {
    const { p } = this;
    let n = 0;
    for (let a = 0; a < p.atomRes.length; a++) {
      const r = p.atomRes[a];
      if (!this.side.includes(r) || p.atomSide[a] !== '1') continue;
      const x = p.seq[r] === 'X';
      this.atoms.set(n++, p.atomXYZ[a * 3], p.atomXYZ[a * 3 + 1], p.atomXYZ[a * 3 + 2], 1.6, x ? [0, 1, 0.3] : TONE[classOf(p.seq[r])], 40 + (r % 200));
    }
    this.atoms.commit(n);
  }

  panelHeight() {
    return clamp(this.press.cssH * 0.42, 320, 390);
  }

  panelMoved() {
    this.book.size();
    const { w, h } = this.book;
    const bs = this.book.beads;
    const sx = Math.max(...bs.map((b) => Math.abs(b.x))) || 1;
    const sy = Math.max(...bs.map((b) => Math.abs(b.y))) || 1;
    for (const b of bs) {
      b.px = w / 2 + (b.x / sx) * (w / 2 - 28);
      b.py = h / 2 - (b.y / sy) * (h / 2 - 26);
    }
    for (let it = 0; it < 60; it++)
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const A = bs[i], B = bs[j];
          let dx = B.px - A.px, dy = B.py - A.py;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 50) {
            dx *= (50 - d) / d / 2;
            dy *= (50 - d) / d / 2;
            A.px -= dx; A.py -= dy; B.px += dx; B.py += dy;
          }
        }
    for (const b of bs) {
      b.px = clamp(b.px, 24, w - 24);
      b.py = clamp(b.py, 24, h - 24);
    }
    this.paint();
  }

  // True when a polar side-chain atom of one residue reaches a polar atom of the other.
  bonded(a, b) {
    const { p } = this;
    for (let i = 0; i < p.atomRes.length; i++) {
      if (p.atomRes[i] !== a || p.atomSide[i] !== '1' || !'NO'.includes(p.atomEl[i])) continue;
      for (let j = 0; j < p.atomRes.length; j++) {
        if (p.atomRes[j] !== b || !'NO'.includes(p.atomEl[j])) continue;
        if (Math.hypot(p.atomXYZ[i * 3] - p.atomXYZ[j * 3], p.atomXYZ[i * 3 + 1] - p.atomXYZ[j * 3 + 1], p.atomXYZ[i * 3 + 2] - p.atomXYZ[j * 3 + 2]) < 3.5) return true;
      }
    }
    return false;
  }

  drop(h, o) {
    if (!o || o === h || this.over) return this.paint();
    if (this.pairs.some(([x, y]) => (x === h && y === o) || (x === o && y === h))) return this.paint();
    const ok = this.bonded(h.res, o.res) || this.bonded(o.res, h.res);
    if (ok) {
      this.pairs.push([h, o]);
      this.paired.add(h);
      this.paired.add(o);
      h.bold = o.bold = true;
      this.sound.zip(this.pairs.length % 12);
      this.sound.ratchet(0.1);
      buzz(14);
      if (this.pairs.length === 3) this.stamp(0);
      const left = this.book.beads.length - this.paired.size;
      this.hud.setGoal(left ? `${h.label} and ${o.label} share a hydrogen bond. ${left} still unpaired.` : '');
      if (!left) this.win();
    } else {
      this.misses++;
      this.sound.bump();
      this.hud.setGoal(`${h.label} and ${o.label} do not reach each other.`);
    }
    this.paint();
  }

  win() {
    this.over = true;
    this.stamp(1, this.misses <= 3);
    this.stamp(2, this.misses === 0);
    this.sound.bloom();
    this.panel.style.display = 'none';
    document.body.classList.add('night');
    this.press.setFlood([0, 0, 1]);
    this.press.uniforms.uShadow.value = 0;
    this.ribbon.paint((i) => (this.ss[i] === 'C' ? [0, 0.6, 0.15] : [0, 1, 0]), (i) => 2 + (i >> 4));
    this.night = 0;
    this.glow = 0;
    this.rig.spin = 0.18;
    this.press.setFocus(0.5, 0.52);
    this.ctx.finishSoon('Sealed from bulk water, with its polar net holding it still, the chromophore lights up.', 3400);
  }

  paint() {
    const { book } = this;
    const { g } = book;
    if (!g || !book.w) return;
    g.clearRect(0, 0, book.w, book.h);
    g.lineCap = 'round';
    for (const [a, b] of this.pairs) {
      g.lineWidth = 6;
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(a.px, a.py);
      g.lineTo(b.px, b.py);
      g.stroke();
      g.lineWidth = 3.5;
      g.strokeStyle = '#ff4a9e';
      g.stroke();
    }
    if (book.held && book.px) {
      g.setLineDash([2, 7]);
      g.lineWidth = 3;
      g.strokeStyle = '#1f2aa6';
      g.beginPath();
      g.moveTo(book.held.px, book.held.py);
      g.lineTo(book.px.x, book.px.y);
      g.stroke();
      g.setLineDash([]);
    }
    for (const b of book.beads) book.bead(b);
  }

  update(dt) {
    if (this.night !== undefined) {
      this.night = Math.min(1, this.night + dt / 1.1);
      const e = ease(this.night);
      this.press.uniforms.uYellow.value.set(...YELLOW_INK.map((v, i) => v + (GREEN_INK[i] - v) * e));
      this.glow = Math.min(1, this.glow + dt / 1.5);
      const { p } = this;
      const x = indexOf(p, 66);
      const c = this.overlay.project(new THREE.Vector3(p.caXYZ[x * 3], p.caXYZ[x * 3 + 1], p.caXYZ[x * 3 + 2]));
      this.press.uniforms.uGlow.value.set(c.x / this.press.cssW, 1 - c.y / this.press.cssH, ease(this.glow));
    }
  }

  dispose() {
    super.dispose();
    this.book.dispose();
    this.press.uniforms.uYellow.value.set(...YELLOW_INK);
  }
}

export function startCore(ctx, stage) {
  return new { contacts: Contacts, knobs: Knobs, cavity: Cavity, repack: Repack, buried: Buried }[stage.id](ctx, stage);
}
