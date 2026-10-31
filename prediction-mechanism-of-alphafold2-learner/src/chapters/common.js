// Things several chapters share: the real family, its real structure, and a small paper model of the protein.
import * as THREE from 'three';
import { Flock, plddtStock, Quilt, ribbonGeometry, STOCK } from '../world.js';
import { closestAtoms, columnDistances, getModel, getPAE, getStructure, loadMSA } from '../science/data.js';
import { apc, compressColumns, miMatrix, precision, rankPairs, reweight } from '../science/msa.js';
import { localAtoms } from '../science/gas.js';

let family = null;
export function theFamily() {
  if (family) return family;
  const msa = loadMSA(), che = getStructure('che3'), D = columnDistances(msa, che), { N, L, X, col2res } = msa;
  const idx = [], posOf = new Map(), colOf = [];
  for (let c = 0; c < L; c += 1) if (col2res[c] >= 0) { posOf.set(c, idx.length); idx.push(col2res[c]); colOf.push(c); }
  const mapped = idx.length;
  const valid = (i, j) => D[i * L + j] >= 0, touching = (i, j) => D[i * L + j] < 8;
  const score = (S, sep = 6) => {
    const p = rankPairs(S, L, valid, sep);
    return { pairs: p, half: precision(p, mapped >> 1, touching), full: precision(p, mapped, touching), fifth: precision(p, Math.floor(mapped / 5), touching) };
  };
  const closest = closestAtoms();
  // The closest heavy atoms of two columns' residues, which can touch when their C-beta atoms do not.
  const atoms = (i, j) => closest(che.nums[col2res[i]], che.nums[col2res[j]]);
  family = { msa, che, D, N, L, X, col2res, idx, posOf, colOf, mapped, valid, touching, atoms, score, shape: localAtoms(che) };
  return family;
}
export const name = (f, c) => { const r = f.col2res[c]; return r < 0 ? `column ${c + 1}` : `${f.che.seq[r]}${f.che.nums[r]}`; };
export { apc, compressColumns, miMatrix, precision, rankPairs, reweight, getModel, getPAE, getStructure };

const Tm = new THREE.Matrix4();
// A paper protein: triangles and a ribbon, held above the table, turning slowly.
export class PaperProtein {
  constructor(world, st, { center = [0, 26, 0], scale = 1, stock = () => STOCK.high, ribbon = true, triangles = true, spin = 0.12, size = 1.7 } = {}) {
    this.world = world; this.st = st; this.center = new THREE.Vector3(...center); this.scale = scale; this.spin = spin;
    this.angle = 0; this.tiltX = 0.2;
    const n = st.ca.length, mean = [0, 0, 0];
    for (const p of st.ca) { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; }
    this.mean = mean;
    this.group = new THREE.Matrix4();
    this.base = new THREE.Matrix4().makeTranslation(-mean[0], -mean[1], -mean[2]);
    if (triangles) {
      this.flock = new Flock(world, n, st.shape ?? localAtoms(st), { size });
      this.flock.paint((i) => stock(i));
    }
    if (ribbon) {
      const colors = st.ca.map((_, i) => stock(i));
      this.ribbon = new THREE.Mesh(ribbonGeometry(st.ca, colors), world.paper({ vertexColors: true, glow: 0.45, repeat: 0.2, bump: 0.2 }));
      this.ribbon.castShadow = true;
      this.ribbon.matrixAutoUpdate = false;
      world.scene.add(this.ribbon);
    }
    this.update();
    this.tick = (dt) => { if (this.spin) { this.angle += dt * this.spin; this.update(); } };
    world.ticks.add(this.tick);
  }

  matrix() {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.tiltX, this.angle, 0, 'YXZ'));
    return Tm.compose(this.center, q, new THREE.Vector3(this.scale, this.scale, this.scale)).clone().multiply(this.base);
  }

  update() {
    const g = this.group.copy(this.matrix());
    if (this.flock) {
      this.st.frames.forEach((T, i) => this.flock.place(i, T.R, T.t, g));
      this.flock.commit();
    }
    if (this.ribbon) { this.ribbon.matrix.copy(g); this.world.shadowDirty = 2; }
  }

  // World position of a real point on this protein.
  world3(p) { return new THREE.Vector3(...p).applyMatrix4(this.group); }

  dispose() {
    this.world.ticks.delete(this.tick);
    this.flock?.dispose();
    if (this.ribbon) { this.world.scene.remove(this.ribbon); this.ribbon.geometry.dispose(); this.ribbon.material.dispose(); }
  }
}
export const stockFrom = (st) => (i) => plddtStock(st.plddt[i]);
export const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
export const pct = (v) => `${Math.round(v * 100)}%`;

// A contact map on a quilt: the lower triangle is the truth, the upper triangle is a method's best guesses.
export class ContactQuilt {
  constructor(run, f, opts = {}) {
    this.run = run; this.f = f;
    this.quilt = new Quilt(run.world, f.L, opts);
    this.colors = { empty: new THREE.Color('#fffdf8'), truth: new THREE.Color('#a9d8ee'), hit: STOCK.high, miss: STOCK.poor, faint: new THREE.Color('#e4ecef') };
    // Each guess is a raised chip of paper with its own shadow, so the quilt can be read at a glance and looks touchable.
    const chip = this.chips = new THREE.InstancedMesh(new THREE.BoxGeometry(1.62, 0.5, 1.62), run.world.paper({ glow: 0, bump: 0.2, repeat: 0.2 }), 240);
    chip.castShadow = true; chip.frustumCulled = false; chip.count = 0;
    run.world.scene.add(chip);
    this.paintTruth();
  }

  paintTruth() {
    const { f, quilt, colors } = this;
    for (let i = 0; i < f.L; i += 1) {
      for (let j = 0; j < f.L; j += 1) {
        const near = f.D[i * f.L + j] >= 0 && f.D[i * f.L + j] < 8 && Math.abs(i - j) >= 6;
        quilt.set(i, j, i > j && near ? colors.truth : i === j ? colors.faint : colors.empty);
      }
    }
    quilt.commit();
  }

  // Lay the top k guesses on the upper triangle. Returns counts of hits and misses.
  guesses(pairs, k) {
    const { f, quilt, colors } = this;
    this.paintTruth();
    const M = new THREE.Matrix4(), { chips } = this;
    let hit = 0, n = 0;
    for (const [, i, j] of pairs.slice(0, k)) {
      const good = f.touching(i, j);
      if (good) hit += 1;
      const p = quilt.center(i, j);
      M.makeTranslation(p.x, 0.95, p.z);
      chips.setMatrixAt(n, M);
      chips.setColorAt(n, good ? colors.hit : colors.miss);
      n += 1;
    }
    chips.count = n;
    chips.instanceMatrix.needsUpdate = true;
    if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
    quilt.commit();
    this.run.world.shadowDirty = 2;
    return { hit, miss: Math.min(k, pairs.length) - hit };
  }

  dispose() {
    this.quilt.dispose();
    this.run.world.scene.remove(this.chips);
    this.chips.geometry.dispose(); this.chips.material.dispose();
  }
}

// A small bar chart on a card, drawn at the screen's real resolution.
export function chart(ui, { height = 86 } = {}) {
  const c = document.createElement('canvas');
  c.className = 'chart';
  c.style.height = `${height}px`;
  const draw = (bars, { max = 1, line = null, label = null } = {}) => {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth || 300, h = height;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const n = bars.length, gap = 5, bw = (w - gap * (n - 1)) / Math.max(n, 1), base = h - 17;
    g.font = '12.5px "Alegreya Sans", sans-serif';
    g.textAlign = 'center';
    bars.forEach((b, i) => {
      const v = Math.max(0, b.value) / max, x = i * (bw + gap);
      g.fillStyle = b.color ?? '#0053d6';
      g.fillRect(x, base - v * (base - 13), bw, Math.max(1.5, v * (base - 13)));
      g.fillStyle = '#26343f';
      if (b.text) g.fillText(b.text, x + bw / 2, base - v * (base - 13) - 3);
      g.fillStyle = '#5a6b78';
      g.fillText(b.label ?? '', x + bw / 2, h - 3);
    });
    if (line !== null) {
      const y = base - (line / max) * (base - 13);
      g.strokeStyle = '#ff7d45'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      g.setLineDash([]);
      if (label) { g.fillStyle = '#b2491c'; g.textAlign = 'right'; g.fillText(label, w, y - 3); }
    }
  };
  c.draw = draw;
  return c;
}

// Frame a board of the given world size within the stage, looking nearly straight down.
export function frameBoard(run, w, h, { polar = 0.1, at = [0, 0, 0], seconds = 0.8 } = {}) {
  run.world.look({ target: at, dist: run.world.fitDist(w, h, polar), polar, az: 0 }, seconds);
  run.reframe = () => run.world.look({ target: at, dist: run.world.fitDist(w, h, polar), polar, az: 0 }, 0.5);
}

// A slowly turning paper CheY, for stages whose work happens on the card.
export function ambient(run, { stock = () => STOCK.good, st = null } = {}) {
  const model = st ?? theFamily().che;
  const m = run.scoped(new PaperProtein(run.world, model, { stock, scale: 1.25, center: [0, 18, 0], spin: 0.07, size: 1.6 }));
  frameBoard(run, 64, 68, { polar: 0.16, at: [0, 10, 0], seconds: 0.6 });
  return m;
}
