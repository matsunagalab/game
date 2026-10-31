// Chapter two: a hydrogen bond is the definition of secondary structure.
// The player plays DSSP on real proteins: join a C=O to an N-H and the game computes the DSSP energy.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER } from '../press.js';
import { Ribbon } from '../ribbon.js';
import { foldOf, indexOf, TONE } from '../proteins.js';
import { hbEnergy, hbAngle, q3, torsions, HB_CUTOFF } from '../science/dssp.js';
import { Track, colsOf, SS_INK, GAP_INK } from '../track.js';
import { CardChain } from './chain.js';
import { $, button, clamp } from '../ui.js';
import { buzz } from '../sound.js';
import rama from '../data/rama.json';

// fmt is used in hud text as well as on the rails.
const fmt = (e) => `${e < 0 ? '−' : '+'}${Math.abs(e).toFixed(1)}`;
const NAME = { 3: '3₁₀ helix', 4: 'α helix', 5: 'π helix' };

// Principal axis of a point list, by power iteration.
function axisOf(pts) {
  const c = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] += (p[a] - c[a]) * (p[b] - c[b]);
  let v = [1, 0.3, 0.2];
  for (let it = 0; it < 30; it++) {
    const w = [0, 1, 2].map((a) => M[a][0] * v[0] + M[a][1] * v[1] + M[a][2] * v[2]);
    const l = Math.hypot(...w) || 1;
    v = w.map((x) => x / l);
  }
  return { c, v };
}

class Bench {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage });
    const { press, rig, layer, hud } = ctx;
    this.press = press;
    this.rig = rig;
    this.hud = hud;
    this.sound = ctx.sound;
    this.overlay = ctx.overlay;
    press.setPaper(PAPER.sky);
    press.setFlood([0, 0, 0]);
    press.clearDisc();
    press.uniforms.uShadow.value = 0.16;
    rig.spin = 0;
    this.done = [false, false, false];
    this.bonds = []; // { a, d, e, t }
    this.misses = 0;
    this.q = new THREE.Quaternion();
    this.meter = true;
    this.track = new Track(layer, {
      down: (rail, i) => this.grab(rail, i),
      move: (drag, i, rail) => this.dragOver(drag, i, rail),
      up: (drag, i, rail) => this.release(drag, i, rail),
      cancel: () => this.letGo(),
    });
    this.track.bar = { e: null, text: 'Energy, kcal/mol' };
    this.bindCanvas();
    ctx.onLayout = () => this.layout();
  }

  // ranges are residue index ranges, inclusive.
  load(key, ranges, { view = 0.5 } = {}) {
    this.clearScene();
    const f = (this.f = foldOf(key));
    const { p, bb, d } = f;
    this.key = key;
    this.p = p;
    this.bb = bb;
    this.d = d;
    this.ranges = ranges;
    this.window = ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k));
    this.inWindow = new Set(this.window);
    this.bonds = [];
    this.track.setCols(colsOf(p, ranges));

    // Stand the longest straight run of the window on end: it reads best on a tall phone.
    const v3 = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
    const cas = this.window.map((i) => v3(bb.caXYZ, i));
    const { c, v } = axisOf(cas);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...v), new THREE.Vector3(0, 1, 0));
    const t = new THREE.Vector3();
    const X = (this.X = (pt) => {
      t.set(pt[0] - c[0], pt[1] - c[1], pt[2] - c[2]).applyQuaternion(q);
      return [t.x, t.y, t.z];
    });
    const hAt = (i) => {
      const h = v3(d.hXYZ, i);
      return Number.isNaN(h[0]) ? null : h;
    };
    this.atomAt = new Map();
    let radius = 6;
    const chains = ranges.map(([a, b]) => {
      const res = [];
      for (let i = a; i <= b; i++) {
        const n = X(v3(bb.nXYZ, i));
        const ca = X(v3(bb.caXYZ, i));
        const cc = X(v3(bb.cXYZ, i));
        const o = X(v3(bb.oXYZ, i));
        const hRaw = hAt(i);
        const h = hRaw ? X(hRaw) : n;
        const u = [n[0] - ca[0], n[1] - ca[1], n[2] - ca[2]];
        const w = [cc[0] - ca[0], cc[1] - ca[1], cc[2] - ca[2]];
        const bx = [-u[0], -u[1], -u[2]];
        const A = [bx[1] * w[2] - bx[2] * w[1], bx[2] * w[0] - bx[0] * w[2], bx[0] * w[1] - bx[1] * w[0]];
        const cb = [0, 1, 2].map((k) => -0.58273431 * A[k] + 0.56802827 * bx[k] - 0.54067466 * w[k] + ca[k]);
        const ha2 = [0, 1, 2].map((k) => ca[k] + (cb[k] - ca[k]) * 0.7);
        const kind = p.seq[i] === 'G' ? 'G' : p.seq[i] === 'P' ? 'P' : 'A';
        res.push({ n, h, ca, c: cc, o, cb, ha2, ha: ha2, kind });
        this.atomAt.set(i, { n, h, o, ca, c: cc, hasH: !!hRaw });
        radius = Math.max(radius, Math.hypot(...ca) + 3);
      }
      const before = Math.max(0, a - 1);
      const after = Math.min(p.n - 1, b + 1);
      const hAfter = hAt(after);
      const cap = { ch3a: X(v3(bb.caXYZ, before)), c0: X(v3(bb.cXYZ, before)), o0: X(v3(bb.oXYZ, before)), n: X(v3(bb.nXYZ, after)), h: hAfter ? X(hAfter) : X(v3(bb.nXYZ, after)), ch3b: X(v3(bb.caXYZ, after)) };
      return { res, cap };
    });
    this.radius = radius;
    this.cards = new CardChain(this.press.scene, Math.max(...ranges.map(([a, b]) => b - a + 1)), { chains: ranges.length, heavy: 0.42, hydrogen: 0.26 });
    this.cards.begin();
    chains.forEach((ch, k) => this.cards.addChain(ch, (x) => x, 10 + k * 40));
    this.cards.commit();
    this.rig.target.set(0, 0, 0);
    this.rig.targetGoal.set(0, 0, 0);
    this.rig.yaw = view;
    this.rig.pitch = 0.12;
    this.layout();
    this.rig.dist = this.rig.distTarget;
  }

  clearScene() {
    if (this.cards) {
      this.cards.dispose();
      this.cards = null;
    }
    if (this.ribbon) {
      this.press.scene.remove(this.ribbon.mesh);
      this.ribbon.dispose();
      this.ribbon = null;
    }
  }

  panelHeight() {
    const { cssH: h } = this.press;
    return clamp(h * 0.27, 172, 236);
  }

  layout() {
    const { cssW: w, cssH: h } = this.press;
    const landscape = w > h * 1.15;
    const safeB = this.ctx.safeBottom();
    const dockH = this.dock ? this.dock.getBoundingClientRect().height + 6 : 0;
    const panel = this.panelHeight();
    const top = 112 + this.ctx.safeTop();
    const el = this.track.el;
    if (landscape) {
      const pw = Math.min(w * 0.5, 620);
      el.style.cssText = `right:${10 + this.ctx.safeRight()}px;width:${pw}px;bottom:${safeB + dockH + 10}px;height:${Math.min(panel + 60, h - 90 - dockH)}px`;
      if (this.dock) this.dock.style.cssText = `left:auto;right:${10 + this.ctx.safeRight()}px;width:${pw}px;bottom:${safeB + 8}px`;
      this.hud.el.style.right = '';
      this.press.setFocus(0.5 * (1 - (pw + 20) / w), 0.56);
      this.viewPx = Math.min(w - pw - 20, h - 90);
    } else {
      el.style.cssText = `left:8px;right:8px;bottom:${safeB + dockH + 8}px;height:${panel}px`;
      if (this.dock) this.dock.style.cssText = '';
      const free = h - panel - safeB - dockH - 8 - top;
      this.press.setFocus(0.5, (top + free * 0.5) / h);
      this.viewPx = Math.min(w, free);
    }
    this.track.layout();
    const fov = this.press.camera.fov;
    this.rig.distTarget = Math.max(24, ((this.radius / Math.tan((fov * Math.PI) / 360)) * h) / this.viewPx);
  }

  // Grabbing an atom in the 3D view starts a bond, exactly as the rails do.
  bindCanvas() {
    const el = this.press.canvas;
    this.canvasDown = (e) => {
      if (this.locked || !this.atomAt) return;
      const hit = this.pick(e.clientX, e.clientY, 30);
      if (!hit) return;
      e.stopImmediatePropagation();
      this.rig.dragging = false;
      this.held3d = { rail: hit.rail, i: hit.i };
      el.setPointerCapture?.(e.pointerId);
      this.grab(hit.rail, hit.i);
    };
    this.canvasMove = (e) => {
      if (!this.held3d) return;
      const other = this.held3d.rail === 'O' ? 'H' : 'O';
      const hit = this.pick(e.clientX, e.clientY, 44, other);
      this.dragPoint = { x: e.clientX, y: e.clientY };
      this.dragOver({ rail: this.held3d.rail, i: this.held3d.i }, hit ? hit.i : null, other);
    };
    this.canvasUp = (e) => {
      if (!this.held3d) return;
      const h = this.held3d;
      this.held3d = null;
      this.dragPoint = null;
      const other = h.rail === 'O' ? 'H' : 'O';
      const hit = this.pick(e.clientX, e.clientY, 44, other);
      this.release({ rail: h.rail, i: h.i, moved: true }, hit ? hit.i : null, other);
    };
    el.addEventListener('pointerdown', this.canvasDown, { capture: true });
    el.addEventListener('pointermove', this.canvasMove);
    el.addEventListener('pointerup', this.canvasUp);
    el.addEventListener('pointercancel', this.canvasUp);
  }

  pick(x, y, reach, only) {
    let best = null;
    let d2 = reach * reach;
    for (const [i, a] of this.atomAt) {
      for (const rail of only ? [only] : ['O', 'H']) {
        if (rail === 'H' && !a.hasH) continue;
        const s = this.screen(rail === 'O' ? a.o : a.h);
        const q = (s.x - x) ** 2 + (s.y - y) ** 2;
        if (q < d2) {
          d2 = q;
          best = { rail, i };
        }
      }
    }
    return best;
  }

  screen(p) {
    return this.overlay.project(new THREE.Vector3(p[0], p[1], p[2]));
  }

  grab(rail, i) {
    if (this.locked) return;
    this.sound.tick(0.12);
    this.held = { rail, i };
    this.track.lightCol = i;
    this.track.pegOn = `${rail}${i}`;
    this.hover = null;
    this.setBar(null);
  }

  // The pair held: acceptor a, donor d.
  pair(rail, i, j) {
    return rail === 'O' ? { a: i, d: j } : { a: j, d: i };
  }

  measure(a, d) {
    const { bb, d: fold } = this;
    if (a === d || a + 1 === d) return { e: 0, on: Infinity, self: true };
    const m = hbEnergy(bb, fold.hXYZ, a, d);
    return Number.isFinite(m.on) ? { ...m, ang: hbAngle(bb, fold.hXYZ, a, d) } : m;
  }

  dragOver(drag, j, rail) {
    if (this.locked || !this.held) return;
    const start = this.held;
    const other = start.rail === 'O' ? 'H' : 'O';
    if (j === null || rail !== other) {
      this.hover = null;
      this.track.preview = null;
      this.track.lightCol = start.i;
      this.setBar(null);
      return;
    }
    const { a, d } = this.pair(start.rail, start.i, j);
    const m = this.measure(a, d);
    const ok = m.e < HB_CUTOFF;
    if (ok && !this.hover?.ok) this.sound.tick(0.2);
    this.hover = { a, d, ok, m };
    this.track.lightCol = j;
    this.track.preview = { a, d, ok: this.meter && ok };
    this.setBar(m);
  }

  setBar(m) {
    const t = this.track;
    if (!m) t.bar = { e: null, text: this.meter ? 'Energy, kcal/mol' : 'Meter off' };
    else if (!this.meter) t.bar = { e: null, text: 'Meter off', off: true };
    else t.bar = { e: m.e, text: Number.isFinite(m.on) ? `${fmt(m.e)} kcal/mol, ${m.on.toFixed(1)} Å, ${Math.round(m.ang)}°` : 'No N–H here' };
  }

  release(drag, j, rail) {
    const start = this.held;
    this.letGo();
    if (this.locked || !start) return;
    const other = start.rail === 'O' ? 'H' : 'O';
    if (j === null || rail !== other) return;
    if (j === start.i && !drag.moved) return;
    const { a, d } = this.pair(start.rail, start.i, j);
    if (this.bonds.some((b) => b.a === a && b.d === d)) return;
    const m = this.measure(a, d);
    if (m.e < HB_CUTOFF) this.zip(a, d, m);
    else this.miss(a, d, m);
  }

  letGo() {
    this.held = null;
    this.hover = null;
    this.track.preview = null;
    this.track.lightCol = null;
    this.track.pegOn = null;
    this.setBar(null);
  }

  zip(a, d, m) {
    const bond = { a, d, e: m.e, t: 0 };
    this.bonds.push(bond);
    this.track.lines.push({ a, d });
    const n = this.bonds.length;
    this.sound.zip(n % 12);
    this.sound.ratchet(0.1);
    setTimeout(() => this.sound.zip((n % 12) + 2), 70);
    buzz(14);
    this.track.bar = { e: m.e, text: `${fmt(m.e)} kcal/mol, ${m.on.toFixed(1)} Å, ${Math.round(m.ang)}°, i${d > a ? '+' : '−'}${Math.abs(d - a)}` };
    this.onZip?.(bond, m);
  }

  miss(a, d, m) {
    this.misses++;
    this.sound.bump();
    buzz(10);
    this.track.bar = { e: m.e, text: `${fmt(m.e)} kcal/mol is not a bond` };
    this.onMiss?.(a, d, m);
  }

  stampIf(i, ok) {
    if (ok && !this.done[i]) {
      this.done[i] = true;
      this.ctx.earn(i);
      if (i === 0) this.hud.offerFinish();
      return true;
    }
    return false;
  }

  // Bonds found so far, as the longest run of the same gap with neighbouring acceptors.
  runOf(gap) {
    const set = new Set(this.bonds.filter((b) => b.d - b.a === gap).map((b) => b.a));
    let best = 0;
    for (const a of set) {
      let n = 1;
      while (set.has(a + n)) n++;
      best = Math.max(best, n);
    }
    return best;
  }

  // The drawing on every textbook page is shorthand for bonds like these.
  showRibbon() {
    if (this.ribbon) return;
    const { window: win, p, d } = this;
    const ss = win.map((i) => q3(d.ss[i])).join('');
    const ends = [];
    let k = 0;
    this.ranges.forEach(([a, b], s) => {
      k += b - a + 1;
      if (s < this.ranges.length - 1) ends.push(k - 1);
    });
    const r = new Ribbon(ss, ends, { helixWidth: 1.15, strandWidth: 1.5, coil: 0.3, thickness: 0.3 });
    const ca = new Float32Array(win.length * 3);
    const o = new Float32Array(win.length * 3);
    win.forEach((i, q) => {
      ca.set(this.X([this.bb.caXYZ[i * 3], this.bb.caXYZ[i * 3 + 1], this.bb.caXYZ[i * 3 + 2]]), q * 3);
      o.set(this.X([this.bb.oXYZ[i * 3], this.bb.oXYZ[i * 3 + 1], this.bb.oXYZ[i * 3 + 2]]), q * 3);
    });
    r.setCoords(ca, o);
    r.paint((q) => (ss[q] === 'H' ? TONE.helix : ss[q] === 'E' ? TONE.strand : TONE.loop), (q) => 5 + ((q / 6) | 0));
    this.press.scene.add(r.mesh);
    this.ribbon = r;
    this.cards.atoms.mesh.visible = false;
    this.cards.bonds.visible = false;
    this.cards.plates.visible = false;
    void p;
  }

  update(dt) {
    this.track.draw(dt);
    this.paintOverlay(dt);
    this.onFrame?.(dt);
  }

  paintOverlay(dt) {
    if (!this.atomAt) return;
    const { overlay: o } = this;
    const g = o.g;
    for (const b of this.bonds) {
      b.t = Math.min(1, b.t + dt / 0.22);
      const A = this.atomAt.get(b.a);
      const D = this.atomAt.get(b.d);
      if (!A || !D) continue;
      const s = this.screen(A.o);
      const e = this.screen(D.h);
      this.dots(g, s, { x: s.x + (e.x - s.x) * b.t, y: s.y + (e.y - s.y) * b.t }, '#ff4a9e');
    }
    const h = this.hover;
    const held = this.held;
    if (held) {
      const at = this.atomAt.get(held.i);
      if (at) {
        const s = this.screen(held.rail === 'O' ? at.o : at.h);
        if (h) {
          const other = this.atomAt.get(held.rail === 'O' ? h.d : h.a);
          if (other) this.dots(g, s, this.screen(held.rail === 'O' ? other.h : other.o), this.meter && h.ok ? '#ff4a9e' : '#1f2aa6');
        } else if (this.dragPoint) this.dots(g, s, this.dragPoint, '#1f2aa6');
        g.beginPath();
        g.arc(s.x, s.y, 12, 0, 7);
        g.strokeStyle = '#ff4a9e';
        g.lineWidth = 3.5;
        g.stroke();
      }
    }
    this.paintExtra?.(g);
  }

  dots(g, a, b, ink) {
    g.lineCap = 'round';
    g.setLineDash([1, 8]);
    g.lineWidth = 6;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.lineWidth = 3.5;
    g.strokeStyle = ink;
    g.stroke();
    g.setLineDash([]);
  }

  // The chips under the rails.
  chips(rows) {
    this.dockGone();
    const dock = (this.dock = $('div', 'dock bond-dock'));
    this.chipOf = {};
    for (const row of rows) {
      const r = $('div', 'row');
      for (const [id, label, fn, cls] of row) {
        const b = button(cls ?? 'chip', label, fn);
        this.chipOf[id] = b;
        r.append(b);
      }
      dock.append(r);
    }
    this.ctx.layer.append(dock);
    this.layout();
    return dock;
  }

  dockGone() {
    this.dock?.remove();
    this.dock = null;
  }

  dispose() {
    this.clearScene();
    this.track.dispose();
    this.dockGone();
    const el = this.press.canvas;
    el.removeEventListener('pointerdown', this.canvasDown, { capture: true });
    el.removeEventListener('pointermove', this.canvasMove);
    el.removeEventListener('pointerup', this.canvasUp);
    el.removeEventListener('pointercancel', this.canvasUp);
    this.press.setFocus(0.5, 0.5, true);
    this.hud.el.style.right = '';
  }
}

const rangeOf = (p, a, b, chain = 0) => [indexOf(p, a, chain), indexOf(p, b, chain)];

// Stage 1: one helix, one rule.
class FirstBond extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { p } = foldOf(stage.protein);
    this.load(stage.protein, stage.windows.map(([a, b]) => rangeOf(p, a, b)));
    this.want = this.d.hbonds.filter((h) => this.inWindow.has(h.a) && this.inWindow.has(h.d) && h.d - h.a === 4);
    this.hud.setGoal('Drag from a red C=O on the top rail to a white N–H on the bottom rail. Watch the DSSP energy, the O to N distance and the N–H to O angle.');
  }

  onZip(b) {
    const n = this.bonds.filter((x) => x.d - x.a === 4).length;
    if (this.stampIf(0, true)) this.hud.setGoal(`That is a hydrogen bond, ${fmt(b.e)} kcal/mol. It joins residue i to i+${b.d - b.a}. Try the next C=O along.`);
    else if (n >= 2 && n < 6) this.hud.setGoal(`${n} bonds. Do you see the slant? Same gap each time.`);
    if (this.stampIf(1, n >= 6)) {
      this.meter = false;
      this.afterMeter = this.misses;
      this.setBar(null);
      this.hud.setGoal('You know the rule, so the meter is off. Finish the helix with no bad drop.');
    } else if (this.done[1] && n < this.want.length) this.hud.setGoal(`${this.want.length - n} left. Meter off.`);
    if (n >= this.want.length) {
      this.stampIf(2, this.misses === this.afterMeter);
      this.locked = true;
      this.showRibbon();
      this.sound.bloom();
      this.hud.setGoal('Every bond in place: that is what the ribbon means.');
      this.ctx.finishSoon(`${this.want.length} bonds, each from i to i+4. The pattern, not the coil, is the helix.`, 2600);
    }
  }

  onMiss(a, d, m) {
    if (!this.done[1]) this.hud.setGoal(`${fmt(m.e)} kcal/mol is weaker than −0.5, so DSSP says no bond. Try another N–H.`);
    else this.hud.setGoal('No bond there. Count from the last tooth.');
  }
}

// Stage 2: three stretches, three gaps. No meter until the drop.
class Gaps extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.cases = stage.cases;
    this.at = 0;
    this.meter = false;
    this.wrong = 0;
    this.next();
  }

  next() {
    const c = this.cases[this.at];
    const { p } = foldOf(c.protein);
    this.load(c.protein, [rangeOf(p, c.from, c.to)]);
    this.locked = false;
    this.called = false;
    this.dockGone();
    this.layout();
    this.setBar(null);
    this.hud.setGoal(`${c.name}. Zip two bonds in a row: neighbouring C=Os, same gap. The energy shows after you drop.`);
  }

  onZip(b) {
    const gap = b.d - b.a;
    if (![3, 4, 5].includes(gap)) return;
    if (this.runOf(gap) >= 2 && !this.called) {
      this.called = true;
      this.locked = true;
      this.hud.setGoal(`Two turns in a row, each i → i+${gap}. What is this helix?`);
      const pick = (n) => () => this.name(n, gap);
      this.chips([[[3, '3₁₀ (i+3)', pick(3)], [4, 'α (i+4)', pick(4)], [5, 'π (i+5)', pick(5)]]]);
    }
  }

  onMiss(a, d, m) {
    this.hud.setGoal(`${fmt(m.e)} kcal/mol: no bond. Try a different gap.`);
  }

  name(n, gap) {
    if (n !== gap) {
      this.wrong++;
      this.sound.bump();
      this.hud.setGoal('Read the gap off the rails: how many residues does each tooth jump?');
      return;
    }
    this.sound.chord([5, 7, 9], 0.13);
    this.at++;
    if (this.at < this.cases.length) {
      this.showRibbon();
      this.dockGone();
      this.hud.setGoal(`${NAME[gap]}: a helix needs two ${gap}-turns in a row. Next stretch.`);
      setTimeout(() => this.next(), 1400);
      return;
    }
    this.showRibbon();
    this.dockGone();
    this.stampIf(0, true);
    this.stampIf(1, this.wrong === 0);
    this.stampIf(2, this.misses <= this.stage.par);
    this.sound.bloom();
    this.hud.setGoal('');
    this.ctx.finishSoon(`${this.misses} bad ${this.misses === 1 ? 'drop' : 'drops'}. Three helices, told apart only by the gap.`, 1800);
  }
}

// Stage 3: every bond is drawn. What is left over?
class LooseEnds extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { p } = foldOf(stage.protein);
    this.load(stage.protein, [rangeOf(p, stage.from, stage.to)]);
    this.meter = false;
    this.locked = true;
    this.first = indexOf(p, stage.helix[0]);
    this.last = indexOf(p, stage.helix[1]);
    const bonded = this.d.hbonds.filter((h) => this.inWindow.has(h.a) && this.inWindow.has(h.d));
    this.pending = bonded.map((h) => ({ a: h.a, d: h.d, m: this.measure(h.a, h.d) }));
    // Free groups: backbone groups of the helix with no backbone partner at all, anywhere in the protein.
    const taken = (rail, i) => this.d.hbonds.some((h) => (rail === 'O' ? h.a === i : h.d === i));
    this.free = new Set();
    for (let i = this.first; i <= this.last; i++) {
      if (!taken('O', i)) this.free.add(`O${i}`);
      if (!taken('H', i) && !Number.isNaN(this.d.hXYZ[i * 3])) this.free.add(`H${i}`);
    }
    this.found = new Set();
    this.wrongs = 0;
    this.phase = 'zipping';
    this.t = 0;
    this.hud.setGoal('The helix zips itself.');
  }

  onFrame(dt) {
    if (this.phase === 'zipping') {
      this.t += dt;
      if (this.pending.length && this.t > 0.13) {
        this.t = 0;
        const b = this.pending.shift();
        this.bonds.push({ a: b.a, d: b.d, e: b.m.e, t: 0 });
        this.track.lines.push({ a: b.a, d: b.d });
        this.sound.zip(this.bonds.length % 12);
      }
      if (!this.pending.length) {
        this.phase = 'mark';
        this.hud.setGoal(`Some groups in this helix found no partner. Tap every free C=O and N–H: ${this.free.size} in all.`);
        this.track.hooks.down = (rail, i) => this.tapPeg(rail, i);
        this.track.hooks.up = () => {};
        this.track.hooks.move = () => {};
      }
    }
    if (this.dipole !== undefined) this.dipole = Math.min(1, this.dipole + dt / 0.8);
  }

  tapPeg(rail, i) {
    const key = `${rail}${i}`;
    if (this.phase === 'cap') {
      this.tapCap(i);
      return;
    }
    if (this.phase !== 'mark' || this.found.has(key)) return;
    if (this.free.has(key)) {
      this.found.add(key);
      this.track.marks.set(key, rail === 'O' ? '#ff4a9e' : '#ff4a9e');
      this.sound.pluck(this.sound.note(this.found.size + 5), 0.16);
      buzz(8);
      if (this.found.size === this.free.size) this.allFree();
    } else {
      this.wrongs++;
      this.sound.bump();
      this.hud.setGoal('That group has a partner: a line reaches it. Look for pegs with no line.');
    }
  }

  allFree() {
    this.stampIf(0, true);
    this.stampIf(1, this.wrongs <= this.stage.par);
    this.dipole = 0;
    this.phase = 'cap';
    const nFree = [...this.free].filter((k) => k[0] === 'H').length;
    this.hud.setGoal(`${nFree} free N–H at the start, a row of + charge. Free C=Os at the end, −. One side chain just before the helix reaches back to cover a free N–H. Tap its letter.`);
  }

  tapCap(i) {
    if (i === indexOf(this.p, this.stage.cap)) {
      this.capped = true;
      this.locked = true;
      this.stampIf(2, !this.capWrong);
      this.sound.bloom();
      this.track.lightCol = i;
      this.phase = 'done';
      this.showRibbon();
      this.hud.setGoal('');
      this.ctx.finishSoon(`${this.p.seq[i]}${this.stage.cap} is the N-cap: its side chain does the job a missing backbone cannot.`, 2000);
    } else {
      this.capWrong = true;
      this.sound.bump();
      this.hud.setGoal('Not that one. The cap sits just before the first turn, and needs an oxygen in its side chain: Ser, Thr, Asp or Asn.');
    }
  }

  // The helix dipole: small charges at each end, an arrow between them.
  paintExtra(g) {
    if (this.dipole === undefined || !this.atomAt) return;
    const A = this.atomAt.get(this.first + 1);
    const B = this.atomAt.get(this.last - 1);
    if (!A || !B) return;
    const a = this.screen(A.n);
    const b = this.screen(B.o);
    const t = this.dipole;
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.strokeStyle = '#1f2aa6';
    g.beginPath();
    g.moveTo(b.x, b.y);
    g.lineTo(b.x + (a.x - b.x) * t, b.y + (a.y - b.y) * t);
    g.stroke();
    for (const [s, ch, ink] of [[a, '+', '#ff4a9e'], [b, '−', '#1f2aa6']]) {
      g.beginPath();
      g.arc(s.x, s.y, 15, 0, 7);
      g.fillStyle = ink;
      g.fill();
      g.fillStyle = ch === '+' ? '#1f2aa6' : '#fff';
      g.font = '800 22px Bricolage, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, s.x, s.y + 1);
    }
  }
}

// Stage 4: two strands on the rails, and what the lines between them look like.
class Ladders extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.cases = stage.cases;
    this.at = 0;
    this.wrong = 0;
    this.total = 0;
    this.next();
  }

  next() {
    const c = (this.c = this.cases[this.at]);
    const { p } = foldOf(this.stage.protein);
    this.load(this.stage.protein, c.strands.map(([a, b]) => rangeOf(p, a, b)), { view: 0.9 });
    this.locked = false;
    this.dockGone();
    this.layout();
    const inter = this.d.hbonds.filter((h) => this.crossing(h.a, h.d));
    this.need = Math.min(c.need, inter.length);
    this.hud.setGoal(this.at === 0 ? 'Two strands of Protein G. Zip bonds between them: the C=O of one to the N–H of the other. Bonds inside one strand do not count.' : `Next pair of strands. Zip ${this.need} bonds across the gap.`);
  }

  crossing(a, d) {
    const [r0, r1] = this.ranges;
    const on = (x, r) => x >= r[0] && x <= r[1];
    return (on(a, r0) && on(d, r1)) || (on(a, r1) && on(d, r0));
  }

  onZip(b) {
    if (!this.crossing(b.a, b.d)) return;
    this.total++;
    const count = this.bonds.filter((x) => this.crossing(x.a, x.d)).length;
    if (count >= this.need) {
      this.locked = true;
      this.hud.setGoal('Read the lines on the rails. Which way do these two strands run?');
      this.chips([[['A', 'Antiparallel', () => this.call('A')], ['P', 'Parallel', () => this.call('P')]]]);
    } else this.hud.setGoal(`${count} of ${this.need}. Each residue reaches one partner, or two.`);
  }

  onMiss(a, d, m) {
    this.hud.setGoal(`${fmt(m.e)} kcal/mol: no bond. In a sheet every other residue faces the neighbour strand.`);
  }

  call(k) {
    if (k !== this.c.type) {
      this.wrong++;
      this.sound.bump();
      this.hud.setGoal(k === 'A' ? 'Antiparallel strands pair two residues with two bonds, and the lines cross in X shapes.' : 'Parallel strands bond in a steady slant: i to j, then j to i+2.');
      return;
    }
    this.sound.chord([5, 7, 9, 12], 0.13);
    this.at++;
    this.showRibbon();
    this.dockGone();
    if (this.at < this.cases.length) {
      this.hud.setGoal(k === 'A' ? 'Antiparallel: pairs of bonds join the same two residues, so the lines cross.' : 'Parallel: a residue bonds to two partners, one on each side, in a slant.');
      setTimeout(() => this.next(), 1700);
      return;
    }
    this.stampIf(0, true);
    this.stampIf(1, this.wrong === 0);
    this.stampIf(2, this.misses <= this.stage.par && this.wrong === 0);
    this.sound.bloom();
    this.hud.setGoal('');
    this.ctx.finishSoon('A strand is not defined by being straight. It is defined by having a partner.', 1900);
  }
}

// Stage: a C=O and an N-H with DSSP's own bond lengths. Pull them apart and tilt them, and watch the same sum.
class Tilt extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.dist = 3.6;
    this.tilt = 45;
    this.radius = 6;
    this.atomAt = null;
    this.cards = new CardChain(this.press.scene, 2, { chains: 1, heavy: 0.5, hydrogen: 0.32 });
    this.rig.target.set(1.5, 0, 0);
    this.rig.targetGoal.set(1.5, 0, 0);
    this.rig.yaw = 0.2;
    this.rig.pitch = 0.25;
    this.track.setCols([]);
    this.track.el.style.pointerEvents = 'none';
    const dock = (this.dock = $('div', 'dock bond-dock tilt-dock'));
    const slider = (label, min, max, val, on) => {
      const row = $('label', 'tiltrow');
      const s = $('input', 'salt');
      s.type = 'range';
      s.min = min;
      s.max = max;
      s.value = val;
      s.setAttribute('aria-label', label);
      s.addEventListener('input', () => on(+s.value));
      row.append($('span', '', label), s);
      dock.append(row);
      return s;
    };
    this.distSlider = slider('O to N', 250, 430, 360, (v) => {
      this.dist = v / 100;
      this.redraw();
    });
    this.tiltSlider = slider('Tilt', 0, 90, 45, (v) => {
      this.tilt = v;
      this.redraw();
    });
    ctx.layer.append(dock);
    this.layout();
    this.rig.dist = this.rig.distTarget;
    this.redraw();
  }

  panelHeight() {
    return 62;
  }

  // Where the donor sits for the present sliders. The group turns about N, so O to N stays what the slider says.
  donor() {
    const th = (this.tilt * Math.PI) / 180;
    const turn = ([x, y, z]) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th), z];
    const N = [this.dist, 0, 0];
    // Start from an ideal straight N-H pointing back at O, then tilt.
    const hDir = turn([-1, 0, 0]);
    const caDir = turn([1.2, 0.9, 0]);
    return { N, H: N.map((v, k) => v + hDir[k]), CA: N.map((v, k) => v + caDir[k]) };
  }

  redraw() {
    const { N, H, CA } = this.donor();
    const C = [-1.23, 0, 0];
    const O = [0, 0, 0];
    const CA0 = [-1.9, 1.3, 0];
    const bb = { nXYZ: Float32Array.from(N), cXYZ: Float32Array.from(C), oXYZ: Float32Array.from(O) };
    const h = Float32Array.from(H);
    const m = hbEnergy(bb, h, 0, 0);
    const ang = hbAngle(bb, h, 0, 0);
    const c = this.cards;
    c.begin();
    c.atom(C, 'C');
    c.atom(O, 'O');
    c.atom(CA0, 'C');
    c.atom(N, 'N');
    c.atom(H, 'H');
    c.atom(CA, 'C');
    c.bond(CA0, C);
    c.bond(C, O, TONE.oxygen);
    c.bond(N, H, TONE.hydrogen);
    c.bond(N, CA, TONE.nitrogen);
    c.commit();
    this.m = { ...m, ang };
    const ok = m.e < HB_CUTOFF;
    this.track.bar = { e: m.e, text: `${fmt(m.e)} kcal/mol, ${m.on.toFixed(1)} Å, ${Math.round(ang)}°` };
    if (ok !== this.wasOk) {
      this.wasOk = ok;
      if (ok) {
        this.sound.zip(4);
        this.sound.ratchet(0.1);
        buzz(10);
      } else this.sound.bump();
    }
    this.stampIf(0, ok);
    this.stampIf(1, m.e <= this.stage.strong);
    const short = m.on < 3 && !ok;
    if (short) {
      this.hud.setGoal(`Only ${m.on.toFixed(1)} Å apart, and still no bond at ${Math.round(ang)}°. Distance alone does not make a hydrogen bond.`);
      if (this.stampIf(2, true)) this.ctx.finishSoon('The sum has four distances in it, so it is sensitive to angle. Lined up, the same two groups hold; tilted, they do not.', 2300);
    } else if (!this.done[0]) this.hud.setGoal('Bring the groups close and line them up until the energy crosses −0.5.');
    else if (!this.done[1]) this.hud.setGoal(`Good. Now find a line-up of ${fmt(this.stage.strong)} kcal/mol or stronger.`);
    else if (!this.done[2]) this.hud.setGoal('Now make O to N shorter than 3.0 Å, and still no bond.');
  }

  paintOverlay() {
    const { H } = this.donor();
    const g = this.overlay.g;
    if (this.m?.e < HB_CUTOFF) this.dots(g, this.screen([0, 0, 0]), this.screen(H), '#ff4a9e');
  }

}

// The map again: real residues, plotted where their angles put them.
class MiniMap {
  constructor(parent) {
    this.size = 112;
    const c = (this.el = $('canvas', 'minimap'));
    const r = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = this.size * r;
    this.g = c.getContext('2d');
    this.g.scale(r, r);
    parent.append(c);
    const n = rama.cells;
    const base = document.createElement('canvas');
    base.width = base.height = n;
    const b = base.getContext('2d');
    const img = b.createImageData(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const land = rama.A[(n - 1 - y) * n + x] !== '0';
        img.data.set(land ? [255, 210, 31, 255] : [31, 42, 166, 255], (y * n + x) * 4);
      }
    b.putImageData(img, 0, 0);
    this.base = base;
  }

  draw(points) {
    const { g, size: s } = this;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, s, s);
    g.drawImage(this.base, 0, 0, s, s);
    for (const [phi, psi] of points) {
      if (phi === null || psi === null) continue;
      const x = ((phi + 180) / 360) * s;
      const y = (1 - (psi + 180) / 360) * s;
      g.beginPath();
      g.arc(x, y, 4.5, 0, 7);
      g.fillStyle = '#ff4a9e';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#fff';
      g.stroke();
    }
  }
}

// Stage 5: the angles look like a helix. Are they one?
class SameAngles extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.cases = stage.cases;
    this.at = 0;
    this.right = 0;
    this.drops = 0;
    this.mini = new MiniMap(ctx.layer);
    this.next();
  }

  layout() {
    super.layout();
    if (!this.mini) return;
    this.mini.el.style.cssText = `right:12px;top:${this.press.cssW > 900 ? 118 : 128}px`;
  }

  next() {
    const c = (this.c = this.cases[this.at]);
    const { p } = foldOf(c.protein);
    this.load(c.protein, [rangeOf(p, c.from, c.to, c.chain ?? 0)]);
    this.locked = false;
    this.layout();
    const { phi, psi } = torsions(this.bb);
    this.mini.draw(c.dots.map((r) => {
      const i = indexOf(p, r, c.chain ?? 0);
      return [phi[i], psi[i]];
    }));
    this.chips([[['H', 'Helix', () => this.call(true)], ['N', 'Not a helix', () => this.call(false)]]]);
    this.hud.setGoal(`${this.at + 1} of ${this.cases.length}. ${c.dots.length} residues sit on the α island. Test them with bonds, then call it.`);
  }

  onZip(b) {
    this.drops++;
    const gap = b.d - b.a;
    if (gap >= 3 && gap <= 5) {
      const run = this.runOf(gap);
      this.hud.setGoal(run >= 2 ? `Two i+${gap} bonds in a row.` : `One i+${gap} bond. A single turn is not a helix. Is there a neighbour?`);
    }
  }

  onMiss() {
    this.drops++;
  }

  // DSSP's own answer for this stretch.
  truth() {
    const { p, c, d } = this;
    return c.dots.every((r) => 'HGI'.includes(d.ss[indexOf(p, r, c.chain ?? 0)]));
  }

  call(says) {
    const ok = says === this.truth();
    if (ok) this.right++;
    this.sound[ok ? 'clunk' : 'bump']();
    if (ok) this.sound.chord([5, 7], 0.12);
    this.at++;
    this.dockGone();
    this.locked = true;
    // Show the true bonds in the window before moving on.
    for (const h of this.d.hbonds) {
      if (!this.inWindow.has(h.a) || !this.inWindow.has(h.d) || this.bonds.some((b) => b.a === h.a && b.d === h.d)) continue;
      this.bonds.push({ a: h.a, d: h.d, e: h.e, t: 0 });
      this.track.lines.push({ a: h.a, d: h.d });
    }
    const is = this.truth();
    this.hud.setGoal(`${ok ? 'Right' : 'Not quite'}: ${is ? 'the bonds run on, so DSSP calls it a helix.' : 'the angles fit, but the bonds do not run on, so DSSP says no helix.'}`);
    setTimeout(() => {
      if (this.at < this.cases.length) this.next();
      else this.finish();
    }, 2100);
  }

  finish() {
    const n = this.cases.length;
    this.stampIf(0, true);
    this.stampIf(1, this.right >= n - 1);
    this.stampIf(2, this.right === n);
    this.sound.bloom();
    this.hud.setGoal('');
    this.ctx.finishSoon(`${this.right} of ${n}. Helix angles are needed, but they are not enough.`, 900);
  }

  dispose() {
    super.dispose();
    this.mini.el.remove();
  }
}

// Stage 6: the rails are full. Paint the assignment, then compare with DSSP.
class BeDssp extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.cases = stage.cases;
    this.at = 0;
    this.scores = [];
    this.tool = 'H';
    this.locked = true;
    this.track.hooks.down = (rail, i) => this.brush(i);
    this.track.hooks.move = (drag, i) => i !== null && this.brush(i);
    this.track.hooks.up = () => {};
    this.track.bar = null;
    this.next();
  }

  panelHeight() {
    return clamp(this.press.cssH * 0.24, 164, 214);
  }

  next() {
    const c = (this.c = this.cases[this.at]);
    const { p } = foldOf(c.protein);
    this.load(c.protein, [rangeOf(p, c.from, c.to, c.chain ?? 0)]);
    this.locked = true;
    this.track.bar = null;
    this.track.paint = new Map();
    this.checked = false;
    for (const h of this.d.hbonds) {
      if (!this.inWindow.has(h.a) || !this.inWindow.has(h.d)) continue;
      this.track.lines.push({ a: h.a, d: h.d, t: 1 });
      this.bonds.push({ a: h.a, d: h.d, e: h.e, t: 1 });
    }
    const pick = (k) => () => this.pickTool(k);
    this.chips([
      [['H', 'α', pick('H')], ['G', '3₁₀', pick('G')], ['I', 'π', pick('I')], ['E', 'Strand', pick('E')], ['C', 'Rub out', pick('C')]],
      [['go', 'Compare with DSSP', () => this.check(), 'btn pink cmp']],
    ]);
    this.pickTool(this.tool);
    this.hud.setGoal(`${this.at + 1} of ${this.cases.length}, ${c.name}. Paint each residue by its bonds. A helix starts one residue after its first C=O, and needs two teeth in a row.`);
  }

  pickTool(k) {
    this.tool = k;
    for (const [id, b] of Object.entries(this.chipOf)) if (id !== 'go') b.classList.toggle('on', id === k);
  }

  brush(i) {
    if (this.checked) return;
    const cur = this.track.paint.get(i) ?? 'C';
    if (cur === this.tool) return;
    if (this.tool === 'C') this.track.paint.delete(i);
    else this.track.paint.set(i, this.tool);
    this.sound.tick(0.08);
  }

  check() {
    if (this.checked) {
      this.at++;
      if (this.at < this.cases.length) this.next();
      else this.finish();
      return;
    }
    this.checked = true;
    const truth = new Map(this.window.map((i) => [i, 'HGIE'.includes(this.d.ss[i]) ? this.d.ss[i] : this.d.ss[i] === 'B' ? 'E' : 'C']));
    let right = 0;
    for (const [i, t] of truth) if ((this.track.paint.get(i) ?? 'C') === t) right++;
    const pct = Math.round((100 * right) / truth.size);
    this.scores.push(pct);
    this.track.paint = new Map([...truth].filter(([, v]) => v !== 'C'));
    this.showRibbon();
    this.sound[pct >= 90 ? 'clunk' : 'bump']();
    if (pct >= 90) this.sound.chord([5, 7, 9], 0.13);
    this.chipOf.go.textContent = this.at + 1 < this.cases.length ? 'Next stretch' : 'Finish';
    this.hud.setGoal(`You matched DSSP on ${right} of ${truth.size} residues, ${pct}%. These are the true colours.`);
  }

  finish() {
    const mean = this.scores.reduce((s, v) => s + v, 0) / this.scores.length;
    this.stampIf(0, true);
    this.stampIf(1, mean >= 85);
    this.stampIf(2, this.scores.every((v) => v >= 95));
    this.ctx.finishSoon(`Average match with DSSP: ${Math.round(mean)}%.`, 300);
  }
}

export function startBond(ctx, stage) {
  const Cls = { 'first-bond': FirstBond, tilt: Tilt, gaps: Gaps, 'loose-ends': LooseEnds, ladders: Ladders, 'same-angles': SameAngles, 'be-dssp': BeDssp }[stage.id];
  return new Cls(ctx, stage);
}
void SS_INK;
void GAP_INK;
void hbAngle;
