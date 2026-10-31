// The Shell chapter: what matters where two proteins meet, and how many kinds of contact a shell needs. Every number here is either computed from the real
// coordinates in tools/, or a measured value checked against its source and quoted as measured.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER } from '../press.js';
import { Atoms } from '../ribbon.js';
import { protein, indexOf, atomBytes, classOf, TONE } from '../proteins.js';
import { candidates, surfaceNonpolar, ruleMean } from '../science/patch.js';
import { components, identityOf, orderOf, rotationOf, indexOfOp, compose, powersOf } from '../science/symmetry.js';
import { coulomb, debyeLength } from '../science/electro.js';
import { buzz } from '../sound.js';
import { $, button, clamp, ease } from '../ui.js';
import { Surface, INK_OF, patchFacts } from './surface.js';
import { Assembly } from './shell.js';

const CALL = [['Mostly +', 'plus'], ['Mostly −', 'minus'], ['Neither', 'neither']];
// Counts of charged residues in the seam, so that the call needs no threshold on a percentage.
const chargeOf = (f) => (f.plus - f.minus >= 2 ? 'plus' : f.minus - f.plus >= 2 ? 'minus' : 'neither');
const WORD = { plus: 'positive', minus: 'negative', neither: 'neither charge' };

// Closest approach of two side chains, in angstroms, heavy atoms only.
function closest(p, a, b) {
  let d2 = Infinity;
  for (let i = 0; i < p.atomRes.length; i++) {
    if (p.atomRes[i] !== a || p.atomSide[i] !== '1') continue;
    for (let j = 0; j < p.atomRes.length; j++) {
      if (p.atomRes[j] !== b || p.atomSide[j] !== '1') continue;
      d2 = Math.min(d2, (p.atomXYZ[i * 3] - p.atomXYZ[j * 3]) ** 2 + (p.atomXYZ[i * 3 + 1] - p.atomXYZ[j * 3 + 1]) ** 2 + (p.atomXYZ[i * 3 + 2] - p.atomXYZ[j * 3 + 2]) ** 2);
    }
  }
  return Math.sqrt(d2);
}

const pct = (x) => `${Math.round(x * 100)}%`;
const card = (rows, head) => {
  const t = $('table', 'facts');
  if (head) {
    const tr = $('tr');
    for (const h of head) tr.append($('th', '', h));
    t.append(tr);
  }
  for (const row of rows) {
    const tr = $('tr');
    for (const c of row) tr.append($('td', '', c));
    t.append(tr);
  }
  return t;
};

// Stage: three surfaces, and what is on them.
class PatchHunt {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound });
    this.s = new Surface(ctx, stage, { onFound: (f) => this.found(f) });
    this.at = 0;
    this.wrong = 0;
    this.sweep = [];
    this.rows = [];
    this.next();
  }

  target(c) {
    const p = protein(c.protein);
    const f = p.iface[c.iface ?? 0];
    return { protein: c.protein, chain: c.side === 'B' ? f.b : f.a, lost: c.side === 'B' ? f.lostB : f.lostA, partner: { chain: c.side === 'B' ? f.a : f.b } };
  }

  next() {
    const c = (this.c = this.stage.cases[this.at]);
    this.s.dockGone();
    this.s.load(this.target(c));
    this.hud.setGoal(`${c.name}. Rub the surface with a finger. The detector sings over the patch. Drag the paper to turn it.`);
  }

  found(f) {
    this.sweep.push(this.s.swept());
    this.answer = chargeOf(f);
    this.hud.setGoal(`Found: ${f.residues} residues, one region. ${pct(f.nonpolar)} of it is non-polar, ${pct(f.whole)} for the whole surface. Count the pink and blue: what is its charge?`);
    this.s.chips(CALL.map(([label, k]) => [label, () => this.call(k)]));
  }

  call(k) {
    const { c, s } = this;
    const f = s.facts;
    const ok = k === this.answer;
    if (!ok) this.wrong++;
    this.sound[ok ? 'clunk' : 'bump']();
    s.dockGone();
    this.rows.push([c.name, `${f.area} Å²`, pct(f.nonpolar), pct(f.whole), `${f.plus}+ ${f.minus}−`]);
    this.hud.setGoal(`${ok ? 'Yes' : 'Look again'}: ${f.plus} + and ${f.minus} − residues, so ${WORD[this.answer]}. ${f.area} Å² on this side alone.`);
    s.bringPartner(() => {
      setTimeout(() => {
        this.at++;
        if (this.at < this.stage.cases.length) this.next();
        else this.finish();
      }, 1500);
    });
  }

  finish() {
    const { ctx, stage } = this;
    ctx.earn(0);
    if (this.wrong === 0) ctx.earn(1);
    if (this.sweep.every((v) => v <= stage.limit)) ctx.earn(2);
    ctx.resultExtra = card(this.rows, ['Side', 'Buried, this side', 'Non-polar', 'Whole surface', 'Charged']);
    ctx.finishSoon('The seam is hardly oilier than the rest. A patch is defined by its partner, not by its grease.', 300);
  }

  update(dt) {
    this.s.update(dt);
  }

  dispose() {
    this.s.dispose();
  }
}

// Stage: one chain, two kinds of seam.
class TwoFaces extends PatchHunt {
  found(f) {
    this.sweep.push(this.s.swept());
    const { c } = this;
    this.rows.push([c.name, `${f.area} Å²`, pct(f.nonpolar), pct(f.whole)]);
    this.hud.setGoal(`${c.name}: ${f.area} Å² on this chain, ${pct(f.nonpolar)} non-polar, against ${pct(f.whole)} for the whole surface.`);
    this.s.bringPartner(() => {
      setTimeout(() => {
        this.at++;
        if (this.at < this.stage.cases.length) this.next();
        else this.quiz();
      }, 1200);
    });
  }

  quiz() {
    this.ctx.hud.setGoal('When oxygen binds, one of these seams stays put and the other shifts as the molecule switches state. Which one shifts?');
    this.s.chips([['α1β1, the larger', () => this.pick(false)], ['α1β2, the smaller', () => this.pick(true)]]);
  }

  pick(right) {
    const { ctx } = this;
    this.sound[right ? 'clunk' : 'bump']();
    this.s.dockGone();
    ctx.earn(0);
    if (right) ctx.earn(1);
    if (this.sweep.every((v) => v <= this.stage.limit)) ctx.earn(2);
    ctx.resultExtra = card(this.rows, ['Seam', 'Buried, this chain', 'Non-polar', 'Whole surface']);
    ctx.finishSoon('The α1β1 seam is larger and holds the dimer. The α1β2 seam is a switching contact.', 300);
  }
}

// Stage: several same-size patches, one real. Read the profiles and bet.
const PATCH_INK = [[1, 0, 0], [0, 1, 0], [0, 0, 0.92], [0.34, 1, 0]];
const PATCH_NAME = ['Pink', 'Yellow', 'Blue', 'Orange'];
const PATCH_CSS = ['#ff4a9e', '#ffd21f', '#1f2aa6', '#ff9a1f'];

class ScorePatch {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound, press: ctx.press, rig: ctx.rig });
    ctx.press.setPaper(PAPER.yellow);
    ctx.press.setFlood([0, 0, 0]);
    ctx.press.clearDisc();
    ctx.press.uniforms.uShadow.value = 0.14;
    this.panel = $('div', 'scorepanel');
    ctx.layer.append(this.panel);
    this.at = 0;
    this.right = 0;
    this.results = [];
    this.done = [false, false, false];
    ctx.onLayout = () => this.layout();
    this.next();
  }

  layout() {
    const { cssW: w, cssH: h } = this.press;
    const landscape = w > h * 1.15;
    const top = 112 + this.ctx.safeTop();
    const box = this.panel.getBoundingClientRect();
    if (landscape) {
      this.panel.style.cssText = `right:12px;bottom:12px;width:${Math.min(w * 0.46, 520)}px`;
      this.press.setFocus(0.27, 0.56);
      this.viewPx = Math.min(w * 0.5, h - 100);
    } else {
      this.panel.style.cssText = `left:8px;right:8px;bottom:${8 + this.ctx.safeBottom()}px`;
      const free = h - box.height - 16 - top;
      this.press.setFocus(0.5, (top + free / 2) / h);
      this.viewPx = Math.min(w, free);
    }
    this.rig.distTarget = ((this.radius / Math.tan((this.press.camera.fov * Math.PI) / 360)) * h) / this.viewPx;
  }

  // other: atoms of any other known binding site. A patch there is not a decoy, it is a second answer.
  target(c) {
    const p = protein(c.protein);
    if (c.face !== undefined) {
      const atoms = Array.from({ length: p.atomEl.length }, (_, i) => i);
      return { p, atoms, lost: atomBytes(p.faces[c.face].lost), other: null };
    }
    const f = p.iface[c.iface ?? 0];
    const chain = c.side === 'B' ? f.b : f.a;
    const atoms = [];
    for (let i = 0; i < p.atomEl.length; i++) if (p.chain[p.atomRes[i]] === chain) atoms.push(i);
    const site = c.side === 'A' && f.secondSite ? new Set(f.secondSite) : null;
    let other = site ? Uint8Array.from(atoms, (a) => (site.has(p.resno[p.atomRes[a]]) ? 1 : 0)) : null;
    // A chain with a second interface in this entry, as hemoglobin has.
    if (c.otherIface !== undefined) other = atomBytes(p.iface[c.otherIface].lostA);
    return { p, atoms, lost: atomBytes(c.side === 'B' ? f.lostB : f.lostA), other };
  }

  next() {
    this.clear();
    const c = (this.c = this.stage.cases[this.at]);
    const { p, atoms, lost, other } = this.target(c);
    this.p = p;
    const free = Float32Array.from(atoms, (a) => p.freeArea[a]);
    const found = (this.found = candidates(p, atoms, free, lost, this.stage.seed + this.at, other));
    // The real patch must not always sit in the same row.
    const order = [0, 1, 2, 3].sort((x, y) => ((x * 7 + this.at * 3) % 4) - ((y * 7 + this.at * 3) % 4));
    this.shown = order.map((k) => found.list[k]);
    const inkOf = new Map();
    this.shown.forEach((patch, k) => {
      for (const m of patch.members) inkOf.set(found.s.residues[m].r, k);
    });
    const mid = [0, 1, 2].map((k) => atoms.reduce((t, a) => t + p.atomXYZ[a * 3 + k], 0) / atoms.length);
    const mesh = (this.mesh = new Atoms(atoms.length));
    let rad = 0;
    atoms.forEach((a, i) => {
      const x = p.atomXYZ[a * 3] - mid[0], y = p.atomXYZ[a * 3 + 1] - mid[1], z = p.atomXYZ[a * 3 + 2] - mid[2];
      rad = Math.max(rad, Math.hypot(x, y, z));
      const k = inkOf.get(p.atomRes[a]);
      mesh.set(i, x, y, z, 1.75, k === undefined ? [0, 0, 0.13] : PATCH_INK[k], 1 + (p.atomRes[a] % 250));
    });
    mesh.commit(atoms.length);
    this.press.scene.add(mesh.mesh);
    this.radius = rad + 3;
    this.rig.target.set(0, 0, 0);
    this.rig.targetGoal.set(0, 0, 0);
    this.rig.yaw = 0.6;
    this.rig.pitch = 0.2;
    this.rig.spin = 0.25;
    this.drawTable();
    this.layout();
    this.rig.dist = this.rig.distTarget;
    this.hud.setGoal(`${this.at + 1} of ${this.stage.cases.length}. ${c.name}. Four patches of about ${Math.round(found.size / 100) * 100} Å². One lies on the interface seen in this crystal. Which?`);
  }

  drawTable() {
    const t = $('table', 'facts patchtable');
    const head = $('tr');
    for (const h of ['', 'Non-polar', 'Roughness', 'Sticks out', 'Charged']) head.append($('th', '', h));
    t.append(head);
    this.shown.forEach((x, k) => {
      const tr = $('tr');
      const name = $('td');
      name.append(button('chip pick', PATCH_NAME[k], () => this.bet(k)));
      name.firstChild.style.boxShadow = `inset 0 0 0 4px ${PATCH_CSS[k]}`;
      tr.append(name, $('td', '', pct(x.nonpolar)), $('td', '', `${x.flatness.toFixed(1)} Å`), $('td', '', x.stickOut.toFixed(1)), $('td', '', `${x.plus}+ ${x.minus}−`));
      t.append(tr);
    });
    this.panel.replaceChildren(t);
  }

  bet(k) {
    if (this.spent) return;
    this.spent = true;
    const { found, c } = this;
    const real = this.shown.indexOf(found.real);
    const ok = k === real;
    if (ok) this.right++;
    this.sound[ok ? 'clunk' : 'bump']();
    buzz(14);
    const n = found.patches.length;
    const best = Math.min(found.ranks.nonpolar, found.ranks.flatness, found.ranks.stickOut);
    this.results.push({ name: c.name, kind: c.kind, n, ranks: found.ranks, real: found.real, pool: found.pool, shown: this.shown, standout: best / n, best });
    this.hud.setGoal(`${ok ? 'Yes' : 'No'}: ${PATCH_NAME[real]} lies on the interface in this crystal. Of ${n} patches it ranks ${found.ranks.nonpolar} for non-polar, ${found.ranks.flatness} for flatness, ${found.ranks.stickOut} for sticking out.`);
    this.panel.append(button('btn pink', this.at + 1 < this.stage.cases.length ? 'Next protein' : 'Test some rules', () => {
      this.spent = false;
      this.at++;
      if (this.at < this.stage.cases.length) this.next();
      else this.rules();
    }));
    this.layout();
  }

  // Could one simple rule have done better?
  rules() {
    this.tested = new Set();
    this.hud.setGoal('Could one simple rule do better than you? Test each rule on all the proteins.');
    const wins = (pick) => this.results.filter((r) => r.shown.reduce((a, b) => (pick(b) > pick(a) ? b : a)) === r.real).length;
    const rules = [['Most non-polar', (x) => x.nonpolar], ['Flattest', (x) => -x.flatness], ['Sticks out most', (x) => x.stickOut]];
    const row = $('div', 'row');
    const said = $('p', 'gridread');
    rules.forEach(([label, pick], i) => {
      row.append(button('chip', label, () => {
        this.tested.add(i);
        this.sound.tick(0.14);
        said.textContent = `${label}: ${wins(pick)} of ${this.results.length} in this game, ${ruleMean(this.results, pick).toFixed(1)} on average over 500 fresh draws of decoys. Blind chance: ${(this.results.length / 4).toFixed(2)}.`;
        if (this.tested.size === rules.length) this.stamp(1);
      }));
    });
    const list = $('table', 'facts');
    const head = $('tr');
    for (const h of ['Which real patch stands out most?', 'Kind']) head.append($('th', '', h));
    list.append(head);
    this.results.forEach((r) => {
      const tr = $('tr');
      const td = $('td');
      td.append(button('chip pick', r.name, () => this.standOut(r)));
      tr.append(td, $('td', '', r.kind));
      list.append(tr);
    });
    this.panel.replaceChildren(said, row, list);
    this.layout();
    this.stamp(0);
    this.ctx.hud.offerFinish();
    this.buildResult();
  }

  standOut(r) {
    if (this.answered) return;
    this.answered = true;
    const top = this.results.reduce((a, b) => (b.standout < a.standout ? b : a));
    const ok = r === top;
    this.sound[ok ? 'clunk' : 'bump']();
    if (ok) this.stamp(2);
    const tops = this.results.filter((x) => x.best === 1).length;
    this.hud.setGoal(`${ok ? 'Yes' : 'No'}: ${top.name}, ranked ${top.best} of ${top.n} on its best property. ${tops === 0 ? 'None tops any list.' : `${tops} of ${this.results.length} top a list.`}`);
    this.ctx.finishSoon('No single property decides. A patch is a region with a profile that only shifts the odds, and these bury 800 to 1800 Å² per side.', 2600);
  }

  // Obligate partners against chains that fold alone: all computed here, atom by atom.
  buildResult() {
    const rows = this.stage.compare.map((c) => {
      const p = protein(c.protein);
      if (c.face !== undefined) {
        const f = p.faces[c.face];
        const atoms = Array.from({ length: p.atomEl.length }, (_, i) => i);
        const all = surfaceNonpolar(p, atoms, Float32Array.from(atoms, (a) => p.freeArea[a]));
        return [c.name, c.kind, `${f.area} Å²`, `${f.nonpolar}%`, pct(all)];
      }
      const f = p.iface[0];
      const atoms = [];
      for (let i = 0; i < p.atomEl.length; i++) if (p.chain[p.atomRes[i]] === f.a || p.chain[p.atomRes[i]] === f.b) atoms.push(i);
      const all = surfaceNonpolar(p, atoms, Float32Array.from(atoms, (a) => p.freeArea[a]));
      return [c.name, c.kind, `${Math.round(f.area / 2)} Å²`, `${f.nonpolar}%`, pct(all)];
    });
    this.ctx.resultExtra = card(rows, ['Pair', 'Kind', 'Buried, one side', 'Non-polar', 'Whole surface']);
  }

  stamp(i) {
    if (!this.done[i]) {
      this.done[i] = true;
      this.ctx.earn(i);
    }
  }

  clear() {
    if (this.mesh) {
      this.press.scene.remove(this.mesh.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  update() {}

  dispose() {
    this.clear();
    this.panel.remove();
    this.rig.spin = 0;
    this.press.setFocus(0.5, 0.5, true);
  }
}

// The interface laid open like a book: each bead is a real residue at its real place on the plane of the seam.
export class Book {
  constructor(layer, onTap) {
    this.el = $('div', 'book');
    this.c = $('canvas');
    this.el.append(this.c);
    layer.append(this.el);
    this.g = this.c.getContext('2d');
    this.beads = [];
    this.onTap = onTap;
    this.el.addEventListener('pointerdown', (e) => {
      const b = this.at(e);
      this.held = b;
      this.px = this.pt(e);
      this.el.setPointerCapture?.(e.pointerId);
      this.hooks?.down?.(b, this.px);
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!this.held) return;
      this.px = this.pt(e);
      this.hooks?.move?.(this.held, this.at(e), this.px);
    });
    this.el.addEventListener('pointerup', (e) => {
      const h = this.held;
      this.held = null;
      if (!h) return;
      const over = this.at(e);
      if (this.hooks?.up) this.hooks.up(h, over);
      else if (over === h) this.onTap?.(h);
    });
  }

  pt(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  at(e) {
    const { x, y } = this.pt(e);
    let best = null;
    let d = 1e9;
    for (const b of this.beads) {
      const q = Math.hypot(b.px - x, b.py - y);
      if (q < d && q < Math.max(24, b.size + 6)) {
        d = q;
        best = b;
      }
    }
    return best;
  }

  size() {
    const r = Math.min(2, devicePixelRatio || 1);
    this.w = this.el.clientWidth;
    this.h = this.el.clientHeight;
    this.c.width = this.w * r;
    this.c.height = this.h * r;
    this.g.setTransform(r, 0, 0, r, 0, 0);
  }

  bead(b, ring) {
    const { g } = this;
    g.beginPath();
    g.arc(b.px, b.py, b.size, 0, 7);
    g.fillStyle = b.ink;
    g.fill();
    g.lineWidth = b.bold ? 3.5 : 2;
    g.strokeStyle = '#1f2aa6';
    g.stroke();
    if (ring) {
      g.beginPath();
      g.arc(b.px, b.py, b.size + 5, 0, 7);
      g.strokeStyle = ring;
      g.lineWidth = 3;
      g.stroke();
    }
    g.fillStyle = b.text ?? '#1f2aa6';
    g.font = `800 ${clamp(b.size * 0.8, 11, 14)}px Bricolage, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(b.label, b.px, b.py + 0.5);
  }

  dispose() {
    this.el.remove();
  }
}

// Interface plane of a pair of chains: its centre, normal and two axes, from the buried atoms of chain A.
function planeOf(p, atoms, lost, towards) {
  const pts = [];
  atoms.forEach((a, k) => {
    if (lost[k] > 3) pts.push([p.atomXYZ[a * 3], p.atomXYZ[a * 3 + 1], p.atomXYZ[a * 3 + 2], lost[k]]);
  });
  const W = pts.reduce((s, q) => s + q[3], 0);
  const c = [0, 1, 2].map((k) => pts.reduce((s, q) => s + q[k] * q[3], 0) / W);
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] += (q[3] * (q[a] - c[a]) * (q[b] - c[b])) / W;
  const power = (skip) => {
    let v = [0.31, 0.77, 0.56];
    for (let it = 0; it < 50; it++) {
      let w = [0, 1, 2].map((a) => M[a][0] * v[0] + M[a][1] * v[1] + M[a][2] * v[2]);
      for (const s of skip) {
        const d = w[0] * s[0] + w[1] * s[1] + w[2] * s[2];
        w = w.map((x, k) => x - d * s[k]);
      }
      const l = Math.hypot(...w) || 1;
      v = w.map((x) => x / l);
    }
    return v;
  };
  const e1 = power([]);
  const e2 = power([e1]);
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * (towards[0] - c[0]) + n[1] * (towards[1] - c[1]) + n[2] * (towards[2] - c[2]) < 0) n = n.map((x) => -x);
  return { c, e1, e2, n };
}

const atomsOfChain = (p, chain) => {
  const out = [];
  for (let i = 0; i < p.atomEl.length; i++) if (p.chain[p.atomRes[i]] === chain) out.push(i);
  return out;
};
const centreOf = (p, atoms) => [0, 1, 2].map((k) => atoms.reduce((s, a) => s + p.atomXYZ[a * 3 + k], 0) / atoms.length);
const sideTip = (p, res) => {
  // The atom of the side chain furthest from its alpha carbon: where a charge or a ring ends.
  let best = null;
  let far = -1;
  for (let a = 0; a < p.atomEl.length; a++) {
    if (p.atomRes[a] !== res) continue;
    const q = [p.atomXYZ[a * 3], p.atomXYZ[a * 3 + 1], p.atomXYZ[a * 3 + 2]];
    if (p.atomSide[a] !== '1') continue;
    const d = Math.hypot(q[0] - p.caXYZ[res * 3], q[1] - p.caXYZ[res * 3 + 1], q[2] - p.caXYZ[res * 3 + 2]);
    if (d > far) {
      far = d;
      best = q;
    }
  }
  return best ?? [p.caXYZ[res * 3], p.caXYZ[res * 3 + 1], p.caXYZ[res * 3 + 2]];
};

class TwoChains {
  constructor(ctx, stage, key, ifaceIndex = 0) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound, press: ctx.press, rig: ctx.rig });
    const p = (this.p = protein(key));
    ctx.press.setPaper(PAPER.yellow);
    ctx.press.setFlood([0, 0, 0]);
    ctx.press.clearDisc();
    ctx.press.uniforms.uShadow.value = 0.14;
    const f = (this.f = p.iface[ifaceIndex]);
    this.A = atomsOfChain(p, f.a);
    this.B = atomsOfChain(p, f.b);
    this.lostA = atomBytes(f.lostA);
    this.lostB = atomBytes(f.lostB);
    this.cA = centreOf(p, this.A);
    this.cB = centreOf(p, this.B);
    this.plane = planeOf(p, this.B, this.lostB, this.cA);
    // Model centred on the seam, with the seam's normal lying across the screen.
    const c = this.plane.c;
    this.origin = c;
    this.meshA = new Atoms(this.A.length);
    this.meshB = new Atoms(this.B.length);
    ctx.press.scene.add(this.meshA.mesh, this.meshB.mesh);
    this.hiddenSide = new Set();
    this.paintChains();
    const n = this.plane.n;
    rigSide(ctx.rig, n);
    this.gap = 0;
    this.gapGoal = 0;
    this.gapV = 0;
    let rad = 0;
    for (const a of [...this.A, ...this.B]) rad = Math.max(rad, Math.hypot(p.atomXYZ[a * 3] - c[0], p.atomXYZ[a * 3 + 1] - c[1], p.atomXYZ[a * 3 + 2] - c[2]));
    this.radius = rad + 2;
    this.book = new Book(ctx.layer, (b) => this.tap?.(b));
    ctx.onLayout = () => this.layout();
  }

  layout() {
    const { cssW: w, cssH: h } = this.press;
    const landscape = w > h * 1.15;
    const safe = this.ctx.safeBottom();
    const top = 112 + this.ctx.safeTop();
    const bookH = this.bookHeight();
    const el = this.book.el;
    if (landscape) {
      const bw = Math.min(w * 0.48, h - 120, 560);
      el.style.cssText = `right:14px;bottom:${safe + 14}px;width:${bw}px;height:${Math.min(bw, h - 120)}px`;
      this.press.setFocus(0.5 * (1 - (bw + 28) / w), 0.56);
      this.viewPx = Math.min(w - bw - 28, h - 90);
    } else {
      el.style.cssText = `left:10px;right:10px;bottom:${safe + 10}px;height:${bookH}px`;
      const free = h - bookH - safe - 10 - top;
      this.press.setFocus(0.5, (top + free / 2) / h);
      this.viewPx = Math.min(w, free);
    }
    this.book.size();
    this.placeBeads();
    const fov = this.press.camera.fov;
    this.rig.distTarget = this.rig.dist = (((this.radius + 4) / Math.tan((fov * Math.PI) / 360)) * h) / this.viewPx;
  }

  paintChains() {
    const { p, origin: c } = this;
    const put = (mesh, list, tone) => {
      let n = 0;
      for (const a of list) {
        if (this.hiddenSide.has(a)) continue;
        const ink = tone(a);
        mesh.set(n++, p.atomXYZ[a * 3] - c[0], p.atomXYZ[a * 3 + 1] - c[1], p.atomXYZ[a * 3 + 2] - c[2], 1.75, ink, 1 + (p.atomRes[a] % 250));
      }
      mesh.commit(n);
    };
    put(this.meshA, this.A, (a) => this.toneA(a));
    put(this.meshB, this.B, (a) => this.toneB(a));
  }

  toneA() {
    return [0, 0, 0.3];
  }

  toneB(a) {
    return INK_OF(this.p, a);
  }

  beadPlace(point, flip = 1) {
    const { c, e1, e2 } = this.plane;
    const d = [point[0] - c[0], point[1] - c[1], point[2] - c[2]];
    return [flip * (d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2]), d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]];
  }

  update(dt) {
    // The seam loosens like a spring that has just lost a pin.
    const k = 60;
    const damp = 8;
    this.gapV += (k * (this.gapGoal - this.gap) - damp * this.gapV) * dt;
    this.gap += this.gapV * dt;
    const n = this.plane.n;
    this.meshA.mesh.position.set(n[0] * this.gap, n[1] * this.gap, n[2] * this.gap);
    this.onFrame?.(dt);
  }

  dispose() {
    const { press } = this;
    press.scene.remove(this.meshA.mesh, this.meshB.mesh);
    this.meshA.dispose();
    this.meshB.dispose();
    this.book.dispose();
    press.setFocus(0.5, 0.5, true);
    this.rig.spin = 0;
  }
}

function rigSide(rig, n) {
  // Look along the seam, so that one partner sits left and the other right.
  const side = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(...n)).normalize();
  rig.target.set(0, 0, 0);
  rig.targetGoal.set(0, 0, 0);
  rig.yaw = Math.atan2(side.x, side.z);
  rig.pitch = Math.asin(clamp(side.y, -1, 1)) + 0.12;
  rig.spin = 0;
}

// Stage: drop a side chain and feel the complex let go.
class HotSpots extends TwoChains {
  constructor(ctx, stage) {
    super(ctx, stage, stage.protein);
    const { p } = this;
    this.done = [false, false, false];
    this.left = stage.drops;
    this.hot = 0;
    const side = new Map();
    this.B.forEach((a, k) => side.set(p.atomRes[a], (side.get(p.atomRes[a]) ?? 0) + this.lostB[k]));
    this.scan = stage.scan.map(([no, ddg, more, why]) => {
      const res = indexOf(p, no + stage.offset, 1);
      return { res, no, aa: p.seq[res], ddg, more, why, buried: side.get(res) ?? 0 };
    });
    this.book.beads = this.scan.map((s) => {
      const [x, y] = this.beadPlace(sideTip(p, s.res));
      return { s, x, y, size: clamp(9 + Math.sqrt(s.buried) * 1.05, 11, 22), ink: '#ffffff', label: `${s.aa}${s.no}` };
    });
    this.layout();
    this.hud.setGoal(`The growth hormone receptor's face, opened like a book. Bigger bead, more area buried. You have ${this.left} drops: find the residues that carry the binding energy.`);
    this.paintBook();
  }

  bookHeight() {
    return clamp(this.press.cssH * 0.42, 300, 390);
  }

  placeBeads() {
    const { w, h } = this.book;
    const bs = this.book.beads;
    if (!bs.length) return;
    const R = Math.max(...bs.map((b) => Math.hypot(b.x, b.y)));
    const s = (Math.min(w, h) / 2 - 22) / R;
    for (const b of bs) {
      b.px = w / 2 + b.x * s;
      b.py = h / 2 - b.y * s;
    }
    // Beads nudge apart, or thumbs cannot find them.
    for (let it = 0; it < 80; it++)
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const A = bs[i], B = bs[j];
          let dx = B.px - A.px, dy = B.py - A.py;
          const d = Math.hypot(dx, dy) || 1;
          const need = A.size + B.size + 3;
          if (d < need) {
            dx *= (need - d) / d / 2;
            dy *= (need - d) / d / 2;
            A.px -= dx; A.py -= dy; B.px += dx; B.py += dy;
          }
        }
    for (const b of bs) {
      b.px = clamp(b.px, b.size + 3, w - b.size - 3);
      b.py = clamp(b.py, b.size + 3, h - b.size - 3);
    }
    this.paintBook();
  }

  paintBook() {
    const { book } = this;
    const { g } = book;
    if (!g || !book.w) return;
    g.clearRect(0, 0, book.w, book.h);
    if (this.ring) {
      const bs = book.beads;
      const hot = bs.filter((b) => b.s.ddg >= 2);
      const cx = hot.reduce((s, b) => s + b.px, 0) / hot.length;
      const cy = hot.reduce((s, b) => s + b.py, 0) / hot.length;
      // The ring holds most of them, not all: one hot spot always strays toward the rim.
      const R = hot.map((b) => Math.hypot(b.px - cx, b.py - cy)).sort((x, y) => y - x)[1] + 24;
      g.beginPath();
      g.arc(cx, cy, R, 0, 7);
      g.fillStyle = 'rgba(255,74,158,.2)';
      g.fill();
      g.setLineDash([2, 8]);
      g.lineCap = 'round';
      g.lineWidth = 4;
      g.strokeStyle = '#1f2aa6';
      g.stroke();
      g.setLineDash([]);
    }
    for (const b of book.beads) book.bead(b);
  }

  tap(b) {
    if (b.spent || this.left <= 0) return;
    this.drop(b);
  }

  drop(b) {
    const { s } = b;
    const { p } = this;
    b.spent = true;
    this.left--;
    const hot = s.ddg >= 2;
    b.ink = hot ? '#ff4a9e' : s.ddg >= 1 ? '#ffd21f' : '#a9b6ea';
    b.bold = hot;
    // The side chain goes: only the first carbon stays, as in alanine.
    let keep = null;
    let near = 1e9;
    for (const a of this.B) {
      if (p.atomRes[a] !== s.res || p.atomSide[a] !== '1') continue;
      const d = Math.hypot(p.atomXYZ[a * 3] - p.caXYZ[s.res * 3], p.atomXYZ[a * 3 + 1] - p.caXYZ[s.res * 3 + 1], p.atomXYZ[a * 3 + 2] - p.caXYZ[s.res * 3 + 2]);
      if (d < near) {
        near = d;
        keep = a;
      }
    }
    for (const a of this.B) if (p.atomRes[a] === s.res && p.atomSide[a] === '1' && a !== keep) this.hiddenSide.add(a);
    this.paintChains();
    this.gapGoal += Math.max(0, s.ddg) * 1.1;
    this.gapV += Math.max(0.4, s.ddg) * 5;
    if (hot) {
      this.hot++;
      this.sound.bump();
      this.sound.clunk(0.34);
      buzz(36);
      if (!this.done[0]) {
        this.done[0] = true;
        this.ctx.earn(0);
        this.ctx.hud.offerFinish();
      }
    } else this.sound.pluck(this.sound.note(3), 0.12);
    const worth = `${s.more ? 'more than ' : ''}${s.ddg.toFixed(1)} kcal/mol`;
    const cold = s.buried < 8 ? 'Cold: it barely touches the hormone.' : 'Cold: buried, yet it hardly matters.';
    const verdict = s.why ?? (hot ? 'A hot spot.' : s.ddg >= 1 ? 'Warm.' : cold);
    this.hud.setGoal(`${s.aa}${s.no} to alanine costs ${worth}. ${verdict} ${this.left} left.`);
    this.paintBook();
    if (this.left === 0) setTimeout(() => this.finish(), 1100);
  }

  finish() {
    const { ctx, stage } = this;
    if (this.hot >= 3) ctx.earn(1);
    if (this.hot >= stage.tier3) ctx.earn(2);
    // Every result, spent or not, is shown before the sheet rises.
    for (const b of this.book.beads) {
      b.ink = b.s.ddg >= 2 ? '#ff4a9e' : b.s.ddg >= 1 ? '#ffd21f' : '#a9b6ea';
      b.bold = b.s.ddg >= 2;
    }
    this.ring = true;
    this.paintBook();
    this.hud.setGoal('Pink is hot: mostly a hydrophobic centre around two tryptophans, with colder residues toward the polar rim. That rim is not extra glue.');
    ctx.resultExtra = scatter(this.scan);
    ctx.finishSoon(`${this.hot} hot spots in ${stage.drops} drops.`, 3200);
  }
}

// Measured energy against computed burial: the point is that burial alone predicts little.
function scatter(scan) {
  const c = $('canvas', 'scatter');
  const W = 340, H = 180;
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const L = 36, B = 28;
  const maxA = Math.max(...scan.map((s) => s.buried));
  const X = (a) => L + (a / maxA) * (W - L - 12);
  const Y = (d) => H - B - (Math.max(0, d) / 5.2) * (H - B - 10);
  g.strokeStyle = '#1f2aa6';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(L, 8);
  g.lineTo(L, H - B);
  g.lineTo(W - 6, H - B);
  g.stroke();
  g.setLineDash([3, 5]);
  g.beginPath();
  g.moveTo(L, Y(2));
  g.lineTo(W - 6, Y(2));
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#1f2aa6';
  g.font = '700 12px Bricolage, sans-serif';
  g.textAlign = 'center';
  g.fillText('Area buried, computed (Å²)', L + (W - L) / 2, H - 8);
  g.save();
  g.translate(12, (H - B) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText('Measured ΔΔG', 0, 0);
  g.restore();
  for (const s of scan) {
    g.beginPath();
    g.arc(X(s.buried), Y(s.ddg), s.ddg >= 2 ? 5.5 : 4, 0, 7);
    g.fillStyle = s.ddg >= 2 ? '#ff4a9e' : '#a9b6ea';
    g.fill();
    g.strokeStyle = '#1f2aa6';
    g.lineWidth = 1.5;
    g.stroke();
    if (s.ddg >= 2) {
      g.fillStyle = '#1f2aa6';
      g.fillText(`${s.aa}${s.no}${s.more ? '>' : ''}`, X(s.buried), Y(s.ddg) - 9);
    }
  }
  return c;
}

// Stage: charges reach across the seam, and steer the partner in from far away.
class Steering extends TwoChains {
  constructor(ctx, stage) {
    super(ctx, stage, stage.protein);
    const { p } = this;
    this.done = [false, false, false];
    this.misses = 0;
    this.zipped = [];
    const lefts = stage.left.map((no) => this.chargeBead(no, 0, -1));
    const rights = stage.right.map((no) => this.chargeBead(no, 1, 1));
    this.book.beads = [...lefts, ...rights];
    this.want = stage.pairs.map(([a, b, e]) => ({ a, b, e }));
    this.book.hooks = {
      down: (b) => b && this.grab(b),
      move: () => {},
      up: (h, over) => this.drop(h, over),
    };
    this.layout();
    this.hud.setGoal('Barnase on the left, barstar on the right, opened like a book. Drag a + onto the − it meets in the real complex.');
    this.frame = true;
    this.charges = this.allCharges();
    void p;
  }

  chargeBead(no, chain, side) {
    const { p } = this;
    const res = indexOf(p, no, chain);
    const [x, y] = this.beadPlace(sideTip(p, res), chain === 0 ? -1 : 1);
    const cls = classOf(p.seq[res]);
    return { res, no, chain, x, y, side, size: 21, ink: cls === 'plus' ? '#ff4a9e' : cls === 'minus' ? '#1f2aa6' : '#a9b6ea', text: cls === 'minus' ? '#fff' : '#1f2aa6', label: `${p.seq[res]}${no}` };
  }

  // Real charged groups of both chains, for the screened sum.
  allCharges() {
    const { p, f } = this;
    const out = [];
    for (let r = 0; r < p.n; r++) {
      const aa = p.seq[r];
      const q = 'KR'.includes(aa) ? 1 : 'DE'.includes(aa) ? -1 : 0;
      if (q && (p.chain[r] === f.a || p.chain[r] === f.b)) out.push({ q, xyz: sideTip(p, r), res: r, chain: p.chain[r] });
    }
    return out;
  }

  bookHeight() {
    return clamp(this.press.cssH * 0.37, 270, 340);
  }

  placeBeads() {
    const { w, h } = this.book;
    const bs = this.book.beads;
    if (!bs?.length) return;
    const span = Math.max(...bs.map((b) => Math.abs(b.y))) || 1;
    const spanX = Math.max(...bs.map((b) => Math.abs(b.x))) || 1;
    for (const b of bs) {
      const mid = b.side < 0 ? w * 0.25 : w * 0.75;
      b.px = mid + (b.x / spanX) * (w * 0.2);
      b.py = h * 0.5 - (b.y / span) * (h * 0.5 - 30);
    }
    for (let it = 0; it < 40; it++)
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const A = bs[i], B = bs[j];
          if (A.side !== B.side) continue;
          const d = Math.hypot(B.px - A.px, B.py - A.py) || 1;
          const need = A.size + B.size + 4;
          if (d < need) {
            const u = (need - d) / d / 2;
            const dy = (B.py - A.py) * u;
            A.py -= dy + 1;
            B.py += dy + 1;
          }
        }
    for (const b of bs) b.py = clamp(b.py, 24, h - 24);
  }

  grab(b) {
    if (this.salt) return;
    this.sound.tick(0.14);
  }

  drop(h, over) {
    if (this.salt || !over || over === h || over.side === h.side) return;
    const [L, R] = h.side < 0 ? [h, over] : [over, h];
    const w = this.want.find((x) => x.a === L.no && x.b === R.no);
    if (this.zipped.includes(w)) return;
    const { p } = this;
    const dist = closest(p, L.res, R.res);
    if (w) {
      this.zipped.push(w);
      this.sound.zip(this.zipped.length + 3);
      this.sound.ratchet(0.1);
      buzz(16);
      this.hud.setGoal(`${L.label} and ${R.label}: closest atoms ${dist.toFixed(1)} Å apart. Mutating both shows a coupling of ${w.e.toFixed(1)} kcal/mol: these two are not independent.`);
      if (this.zipped.length === 3 && !this.done[0]) {
        this.done[0] = true;
        this.ctx.earn(0);
        this.ctx.hud.offerFinish();
      }
      if (this.zipped.length === this.want.length) {
        if (this.misses <= 2) this.ctx.earn(1);
        if (this.misses === 0) this.ctx.earn(2);
        setTimeout(() => this.saltPhase(), 1500);
      }
    } else {
      this.misses++;
      this.sound.bump();
      this.hud.setGoal(`${L.label} and ${R.label}: closest atoms ${dist.toFixed(1)} Å apart in the complex. Not partners.`);
    }
  }

  // Energy between the two chains as barstar waits a little way off, with salt screening it.
  rate() {
    const I = this.ionic;
    const n = this.plane.n;
    const lifted = this.charges.map((c) => (c.chain === this.f.a ? { q: c.q, x: c.xyz[0] + n[0] * 5, y: c.xyz[1] + n[1] * 5, z: c.xyz[2] + n[2] * 5, chain: 0 } : { q: c.q, x: c.xyz[0], y: c.xyz[1], z: c.xyz[2], chain: 1 }));
    return { U: coulomb(lifted, I), debye: debyeLength(I) };
  }

  saltPhase() {
    this.salt = true;
    this.ionic = 0.05;
    this.book.hooks = null;
    const dock = (this.dock = $('div', 'dock salt-dock'));
    const s = $('input', 'salt');
    s.type = 'range';
    s.min = 0;
    s.max = 100;
    s.value = 43;
    s.setAttribute('aria-label', 'Salt concentration');
    this.saltInput = s;
    s.addEventListener('input', () => {
      this.ionic = 0.005 * 200 ** (s.value / 100);
      this.reading();
    });
    this.readLine = $('p', 'saltread');
    const go = button('btn pink cmp', 'Let it land', () => this.land());
    dock.append(this.readLine, s, go);
    this.ctx.layer.append(dock);
    this.gapGoal = 16;
    this.layoutSalt();
    this.reading();
    this.hud.setGoal('Those charges also reach out through water. Slide the salt and read the pull. Then let barnase land.');
  }

  layoutSalt() {
    const r = this.book.el.getBoundingClientRect();
    const h = this.dock.getBoundingClientRect().height;
    this.dock.style.bottom = `${innerHeight - r.top + 6}px`;
    void h;
  }

  reading() {
    const { U, debye } = this.rate();
    this.nowU = U;
    this.readLine.textContent = `${Math.round(this.ionic * 1000)} mM salt, reach ${debye.toFixed(0)} Å, pull ${U.toFixed(2)} kcal/mol (computed)`;
    this.paintSalt();
  }

  land() {
    this.landT = 0;
    this.landDur = clamp(1.1 + this.nowU * 0.8, 0.45, 2.4);
    this.sound.squeeze();
    this.startGap = this.gap;
    this.landing = true;
  }

  onFrame(dt) {
    if (this.frame) this.paintSalt();
    if (this.landing) {
      this.landT += dt;
      const e = ease(clamp(this.landT / this.landDur, 0, 1));
      this.gap = this.gapGoal = this.startGap * (1 - e);
      this.gapV = 0;
      if (this.landT >= this.landDur) {
        this.landing = false;
        this.sound.clunk(0.36);
        buzz(24);
        this.finish();
      }
    }
  }

  paintSalt() {
    const { book } = this;
    const { g } = book;
    if (!book.w) return;
    g.clearRect(0, 0, book.w, book.h);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath();
    g.roundRect(4, 4, book.w / 2 - 8, book.h - 8, 12);
    g.roundRect(book.w / 2 + 4, 4, book.w / 2 - 8, book.h - 8, 12);
    g.fill();
    const { p } = this;
    for (const w of this.zipped) {
      const L = book.beads.find((b) => b.no === w.a && b.chain === 0);
      const R = book.beads.find((b) => b.no === w.b && b.chain === 1);
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(L.px, L.py);
      g.lineTo(R.px, R.py);
      g.stroke();
      g.lineWidth = 3.5;
      g.strokeStyle = '#ff4a9e';
      g.stroke();
    }
    if (book.held && book.px && !this.salt) {
      g.setLineDash([2, 7]);
      g.lineCap = 'round';
      g.lineWidth = 3;
      g.strokeStyle = '#1f2aa6';
      g.beginPath();
      g.moveTo(book.held.px, book.held.py);
      g.lineTo(book.px.x, book.px.y);
      g.stroke();
      g.setLineDash([]);
    }
    for (const b of book.beads) book.bead(b);
    g.fillStyle = '#1f2aa6';
    g.font = '750 13px Bricolage, sans-serif';
    g.textAlign = 'center';
    g.fillText('Barnase', book.w * 0.25, 16);
    g.fillText('Barstar', book.w * 0.75, 16);
    void p;
  }

  finish() {
    const { ctx } = this;
    this.frame = false;
    this.showWaters();
    ctx.finishSoon('Salt hides the pull. Across the three copies of this complex in the crystal, about 11 to 18 water molecules stay in the seam, touching both proteins. These are one copy\'s.', 2600);
  }

  // Real waters of the crystal that touch both partners: an interface is not all protein.
  showWaters() {
    const list = this.f.waters ?? [];
    if (!list.length) return;
    const c = this.origin;
    const a = (this.water = new Atoms(list.length / 3));
    for (let i = 0; i < list.length / 3; i++) a.set(i, list[i * 3] - c[0], list[i * 3 + 1] - c[1], list[i * 3 + 2] - c[2], 1.9, [1, 1, 0], 251);
    a.commit(list.length / 3);
    this.press.scene.add(a.mesh);
    this.meshB.mesh.visible = false;
    this.rig.spin = 0.25;
  }

  dispose() {
    super.dispose();
    this.dock?.remove();
    if (this.water) {
      this.press.scene.remove(this.water.mesh);
      this.water.dispose();
    }
  }
}

// Stage: a double-mutant test. Affinity is how tight the right pair binds. Specificity is how much worse anything else does.
class RightPartner {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound, press: ctx.press });
    ctx.press.setPaper(PAPER.yellow);
    ctx.press.setFlood([0, 0, 0]);
    ctx.press.clearDisc();
    const p = (this.p = protein(stage.protein));
    this.left = stage.tests;
    this.done = [false, false, false];
    this.panel = $('div', 'cycle');
    ctx.layer.append(this.panel);
    ctx.onLayout = null;
    this.best = stage.pairs.reduce((a, b) => (this.coupling(b) > this.coupling(a) ? b : a));
    this.draw();
    this.hud.setGoal(`Barnase across, barstar down, with the distance between the closest atoms of each pair. Spend ${this.left} tests. Each mutates both partners.`);
  }

  coupling([a, b, both]) {
    return this.stage.singles[a] + this.stage.singles[b] - both;
  }

  draw() {
    const { stage, p } = this;
    const t = $('table', 'cyc');
    const head = $('tr');
    head.append($('th', '', ''));
    for (const b of stage.right) head.append($('th', '', `${p.seq[indexOf(p, b, 1)]}${b}`));
    t.append(head);
    this.cells = new Map();
    for (const a of stage.left) {
      const tr = $('tr');
      tr.append($('th', '', `${p.seq[indexOf(p, a, 0)]}${a}`));
      for (const b of stage.right) {
        const td = $('td');
        const row = stage.pairs.find((x) => x[0] === a && x[1] === b);
        if (row) {
          const d = closest(p, indexOf(p, a, 0), indexOf(p, b, 1));
          const btn = button('cell2', `${d.toFixed(0)} Å`, () => this.test(row, btn));
          td.append(btn);
          this.cells.set(row, btn);
        }
        tr.append(td);
      }
      t.append(tr);
    }
    this.read = $('div', 'cycread');
    this.read.innerHTML = '<p>Pick a pair.</p>';
    this.panel.replaceChildren(t, this.read);
  }

  test(row, btn) {
    if (this.left <= 0 || btn.classList.contains('spent')) return;
    const [a, b, both] = row;
    const { singles } = this.stage;
    this.left--;
    btn.classList.add('spent');
    const c = this.coupling(row);
    btn.textContent = c.toFixed(1);
    btn.style.background = c >= 3 ? '#ff4a9e' : c >= 1 ? '#ffd21f' : '#fff';
    const worst = Math.max(singles[a], singles[b]);
    const helps = worst - both >= 0.4; // smaller differences sit inside the error of these measurements
    this.sound[c >= 3 ? 'clunk' : 'pluck'](c >= 3 ? 0.3 : this.sound.note(3));
    buzz(12);
    this.read.innerHTML = `<p><b>Lose one:</b> ${singles[a].toFixed(1)} or ${singles[b].toFixed(1)} kcal/mol. <b>Lose both:</b> ${both.toFixed(1)}. <b>Coupling:</b> ${c.toFixed(1)}.</p>`;
    this.stamp(0);
    if (helps) {
      this.stamp(1);
      this.ctx.hud.offerFinish();
      this.hud.setGoal('Losing both costs less than losing one alone. A charge left without its partner does harm: that is specificity.');
    } else this.hud.setGoal(`${this.left} tests left. Coupling ${c.toFixed(1)} kcal/mol: ${c >= 3 ? 'these two are tied together.' : c >= 1 ? 'these two are weakly coupled.' : 'these two act independently.'}`);
    if (row === this.best) {
      this.foundBest = true;
      this.stamp(2);
    }
    if (this.left === 0) this.end();
  }

  end() {
    const { stage } = this;
    const keep = stage.pairs.map((x) => [x, this.coupling(x)]).sort((x, y) => y[1] - x[1]).slice(0, 3);
    const { p } = this;
    this.ctx.resultExtra = card(keep.map(([[a, b, both], c]) => [`${p.seq[indexOf(p, a, 0)]}${a} – ${p.seq[indexOf(p, b, 1)]}${b}`, stage.singles[a].toFixed(1), stage.singles[b].toFixed(1), both.toFixed(1), c.toFixed(1)]), ['Pair', 'One', 'Other', 'Both', 'Coupling']);
    this.ctx.finishSoon('Affinity is how tight the right pair binds. Specificity is how much worse a wrong partner does.', 1800);
  }

  stamp(i) {
    if (!this.done[i]) {
      this.done[i] = true;
      this.ctx.earn(i);
    }
  }

  update() {}

  dispose() {
    this.panel.remove();
  }
}

// Stage Two: one patch that meets itself across a two-fold axis.
class SelfMeeting {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound, press: ctx.press });
    const p = (this.p = protein(stage.protein));
    this.face = p.faces[0];
    this.s = new Surface(ctx, stage, { onFound: (f) => this.found(f) });
    this.s.load({ protein: stage.protein, chain: null, lost: this.face.lost, partner: { op: this.face.op } });
    this.hud.setGoal(stage.ask);
  }

  found(f) {
    const { ctx, stage } = this;
    ctx.earn(0);
    if (this.s.swept() <= stage.limit) ctx.earn(1);
    ctx.hud.offerFinish();
    this.facts = f;
    this.hud.setGoal(`${f.residues} residues, ${this.face.area} Å² on this copy. Here comes its partner: the very same chain.`);
    this.s.bringPartner(() => setTimeout(() => this.flipStep(), 900));
  }

  // The patch laid flat: rotating it 180 degrees about the two-fold axis lands it on its own copy.
  flipStep() {
    const { p, ctx, face } = this;
    const lost = atomBytes(face.lost);
    const { axis } = rotationOf(p.sym[face.op]);
    const byRes = new Map();
    for (let a = 0; a < p.atomEl.length; a++) if (lost[a]) byRes.set(p.atomRes[a], (byRes.get(p.atomRes[a]) ?? 0) + lost[a]);
    const c = [0, 1, 2].map((k) => { let t = 0; for (let a = 0; a < p.atomEl.length; a++) t += p.atomXYZ[a * 3 + k] / p.atomEl.length; return t; });
    const dotU = c[0] * axis[0] + c[1] * axis[1] + c[2] * axis[2];
    let n = c.map((v, k) => v - dotU * axis[k]);
    const nl = Math.hypot(...n) || 1;
    n = n.map((v) => v / nl);
    const v = [axis[1] * n[2] - axis[2] * n[1], axis[2] * n[0] - axis[0] * n[2], axis[0] * n[1] - axis[1] * n[0]];
    const beads = [...byRes.entries()].filter(([, l]) => l >= 25).map(([res, l]) => {
      const t = sideTip(p, res);
      const x = t[0] * v[0] + t[1] * v[1] + t[2] * v[2];
      const y = t[0] * axis[0] + t[1] * axis[1] + t[2] * axis[2];
      const out = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
      // Each bead sits at its true distance from the axis, so what barely moves on screen really is on the axis.
      const off = Math.hypot(x, out);
      return { res, x: (x < 0 || (x === 0 && out < 0) ? -1 : 1) * off, y, off, size: 15, ink: '#ff9a1f', label: `${p.seq[res]}${p.resno[res]}` };
    });
    const my = beads.reduce((t, b) => t + b.y, 0) / beads.length;
    beads.forEach((b) => (b.y -= my));
    this.onAxis = beads.filter((b) => b.off < 2.5);
    this.book = new Book(ctx.layer, (b) => this.tapAxis(b));
    this.book.el.classList.add('flipbook');
    this.book.beads = beads;
    this.turn = 0;
    const dock = (this.dock = $('div', 'dock salt-dock'));
    const s = $('input', 'salt');
    s.type = 'range';
    s.min = 0;
    s.max = 180;
    s.value = 0;
    s.setAttribute('aria-label', 'Turn the patch about its axis');
    s.addEventListener('input', () => {
      this.turn = +s.value;
      this.paint();
      if (this.turn >= 174) this.turned();
    });
    this.dockRead = $('p', 'saltread', 'Turn the blue copy about the axis');
    dock.append(this.dockRead, s);
    ctx.layer.append(dock);
    this.slider = s;
    this.s.dockGone();
    // This step always ends by closing the pair, and the book needs that corner on a wide screen.
    ctx.hud.el.querySelector('.finish')?.remove();
    this.sizeBook();
    this.hud.setGoal('These are the residues of the patch. Blue is the same patch on the other copy. Turn it about the two-fold axis, the dashed line.');
    this.paint();
  }

  sizeBook() {
    const { book } = this;
    const { cssH: h, cssW: w } = this.press;
    const landscape = w > h * 1.15;
    const wide = landscape ? Math.min(w * 0.46, 520) : Math.min(w - 20, 520);
    const tall = landscape ? h - 150 : clamp(h * 0.4, 280, 400);
    book.el.style.cssText = landscape ? `right:12px;width:${wide}px;height:${tall}px;bottom:${74 + this.ctx.safeBottom()}px` : `left:50%;margin-left:${-wide / 2}px;width:${wide}px;height:${tall}px;bottom:${74 + this.ctx.safeBottom()}px`;
    if (landscape) this.dock.style.cssText = `left:auto;right:12px;width:${wide}px`;
    this.dock.style.bottom = `${8 + this.ctx.safeBottom()}px`;
    book.size();
    const X = Math.max(...book.beads.map((b) => Math.abs(b.x))) || 1;
    const Y = Math.max(...book.beads.map((b) => Math.abs(b.y))) || 1;
    this.scaleX = (wide / 2 - 24) / X;
    this.scaleY = (tall / 2 - 20) / Y;
    for (const b of book.beads) {
      b.px = wide / 2 + b.x * this.scaleX;
      b.py = tall / 2 - b.y * this.scaleY;
    }
    // The pair moves up and back to leave the book room.
    const top = 112 + this.ctx.safeTop();
    const free = landscape ? Math.min(w - wide - 30, h - 110) : Math.min(w, h - tall - 74 - top);
    if (landscape) this.press.setFocus(0.5 * (1 - (wide + 24) / w), 0.56);
    else this.press.setFocus(0.5, (top + (h - tall - 74 - top) / 2) / h);
    this.s.meter.style.display = 'none';
    this.ctx.rig.distTarget = ((this.s.radius / Math.tan((this.press.camera.fov * Math.PI) / 360)) * h) / free;
  }

  paint() {
    const { book } = this;
    const { g } = book;
    g.clearRect(0, 0, book.w, book.h);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath();
    g.roundRect(0, 0, book.w, book.h, 12);
    g.fill();
    g.strokeStyle = '#1f2aa6';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.setLineDash([2, 8]);
    g.beginPath();
    g.moveTo(book.w / 2, 6);
    g.lineTo(book.w / 2, book.h - 6);
    g.stroke();
    g.setLineDash([]);
    const c = Math.cos((this.turn * Math.PI) / 180);
    for (const b of book.beads) book.bead({ ...b, px: book.w / 2 + b.x * c * this.scaleX, ink: '#1f2aa6', text: '#fff', size: 13 });
    for (const b of book.beads) book.bead({ ...b, bold: b.picked });
    this.dockRead.textContent = `Turned ${this.turn}° about the axis`;
  }

  turned() {
    if (this.isTurned) return;
    this.isTurned = true;
    this.sound.clunk(0.3);
    buzz(20);
    this.hud.setGoal('At 180° the patch lands on itself: each residue meets its partner on the other copy. Which residue barely moved? It meets its own twin on the axis. Tap it.');
  }

  tapAxis(b) {
    if (!this.isTurned || this.tapped) return;
    this.tapped = true;
    const ok = this.onAxis.includes(b);
    this.sound[ok ? 'clunk' : 'bump']();
    if (ok) this.ctx.earn(2);
    for (const x of this.onAxis) x.picked = true;
    this.paint();
    this.hud.setGoal(`${ok ? 'Yes' : 'Not that one'}: ${this.onAxis.map((x) => x.label).join(' and ')} lie on the axis, each meeting its own twin. Thr 26 sits beside the catalytic Asp 25, where the two chains interlock. Could a third copy join?`);
    this.dock.replaceChildren(button('btn pink', 'Try a third copy', () => this.third()));
  }

  // A third copy comes in, finds no free patch, and leaves.
  third() {
    const { p, s } = this;
    const n = p.atomEl.length;
    const a = (this.ghost = new Atoms(n));
    for (let i = 0; i < n; i++) a.set(i, p.atomXYZ[i * 3] - s.c[0], p.atomXYZ[i * 3 + 1] - s.c[1], p.atomXYZ[i * 3 + 2] - s.c[2], 1.75, [1, 0, 0.2], 200);
    a.commit(n);
    this.press.scene.add(a.mesh);
    this.ghostT = 0;
    this.ghostDir = s.startGap.clone().normalize().negate();
    this.dock.replaceChildren();
    this.hud.setGoal('Here comes a third copy.');
  }

  ghostStep(dt) {
    if (this.ghostT === undefined) return;
    this.ghostT += dt / 1.3;
    const t = this.ghostT;
    // In, a bump against the pair, and away again.
    const d = t < 0.5 ? 70 - 44 * ease(t * 2) : 26 + 80 * ease((t - 0.5) * 2);
    this.ghost.mesh.position.copy(this.ghostDir).multiplyScalar(d);
    if (t >= 0.5 && !this.bumped) {
      this.bumped = true;
      this.sound.bounce();
      buzz(20);
    }
    if (t >= 1) {
      this.ghostT = undefined;
      this.dropGhost();
      this.hud.setGoal('It bounces off. Both patches are taken, each by the other, so a two-fold pair seals itself and stops at two.');
      this.dock.replaceChildren(button('btn pink', 'Close the pair', () => this.close()));
    }
  }

  dropGhost() {
    if (!this.ghost) return;
    this.press.scene.remove(this.ghost.mesh);
    this.ghost.dispose();
    this.ghost = null;
  }

  close() {
    const { ctx, stage } = this;
    this.book.dispose();
    this.dock.remove();
    this.book = null;
    this.dock = null;
    this.s.dispose();
    this.s = null;
    ctx.press.setPaper(PAPER.yellow);
    this.shell = new Assembly(ctx, stage, (line, ms) => ctx.finishSoon(line, ms));
    this.shell.snap();
  }

  update(dt) {
    this.ghostStep(dt);
    (this.s ?? this.shell).update(dt);
  }

  dispose() {
    this.dropGhost();
    this.book?.dispose();
    this.dock?.remove();
    (this.s ?? this.shell)?.dispose();
  }
}

// Stage Five: two different faces, front of one on back of the next.
class Ring {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound, press: ctx.press });
    const p = (this.p = protein(stage.protein));
    this.faces = p.faces;
    this.step = 0;
    this.s = new Surface(ctx, stage, { onFound: (f) => this.found(f) });
    this.load();
  }

  load() {
    const f = this.faces[this.step];
    this.s.dockGone();
    this.s.load({ protein: this.stage.protein, chain: null, lost: f.lost, partner: { op: f.op } });
    this.hud.setGoal(this.step === 0 ? this.stage.ask : 'That copy is in place, but one face reaches only one neighbour. To go on, a copy needs a different face. Find it.');
  }

  found(f) {
    const { ctx } = this;
    const face = this.faces[this.step];
    ctx.earn(this.step);
    if (this.step === 0) ctx.hud.offerFinish();
    this.hud.setGoal(`${f.residues} residues, ${face.area} Å² on this copy.`);
    this.s.bringPartner(() => {
      setTimeout(() => {
        this.step++;
        if (this.step < 2) this.load();
        else this.dial();
      }, 900);
    });
  }

  // Front on back, again and again. The turn per copy decides whether the chain closes.
  dial() {
    const { ctx, stage, p } = this;
    this.s.dispose();
    this.s = null;
    ctx.press.setPaper(PAPER.yellow);
    this.shell = new Assembly(ctx, stage, (line, ms) => ctx.finishSoon(line, ms), { free: true, spread: 1.3 });
    ctx.rig.pitch += 0.6; // from the side a wrong turn shows as a rising helix
    this.order = powersOf(p.sym, this.faces[0].op);
    this.axis = rotationOf(p.sym[this.faces[0].op]).axis;
    const dock = (this.dock = $('div', 'dock salt-dock'));
    const s = $('input', 'salt');
    s.type = 'range';
    s.min = 500;
    s.max = 900;
    s.value = 600;
    s.setAttribute('aria-label', 'Turn per copy in degrees');
    this.read = $('p', 'saltread');
    s.addEventListener('input', () => this.setTurn(s.value / 10));
    s.addEventListener('change', () => this.released(s.value / 10));
    dock.append(this.read, s);
    ctx.layer.append(dock);
    this.slider = s;
    this.tries = 0;
    this.setTurn(60);
    this.hud.setGoal('Each copy sits on the last, front on back, turned the same way. Set the turn per copy so that the fifth meets the first.');
  }

  setTurn(deg) {
    const { shell, order, axis } = this;
    const [x, y, z] = axis;
    const miss = deg - 72;
    this.deg = deg;
    order.forEach((copy, k) => {
      const a = (k * (deg - 72) * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
      const R = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
      const m = this.p.sym[copy];
      // Extra twist about the ring axis, and a rise, so that a wrong turn opens into a helix.
      const rise = k * miss * 0.45;
      const out = [
        R[0] * m[0] + R[1] * m[4] + R[2] * m[8], R[0] * m[1] + R[1] * m[5] + R[2] * m[9], R[0] * m[2] + R[1] * m[6] + R[2] * m[10], R[0] * m[3] + R[1] * m[7] + R[2] * m[11] + x * rise,
        R[3] * m[0] + R[4] * m[4] + R[5] * m[8], R[3] * m[1] + R[4] * m[5] + R[5] * m[9], R[3] * m[2] + R[4] * m[6] + R[5] * m[10], R[3] * m[3] + R[4] * m[7] + R[5] * m[11] + y * rise,
        R[6] * m[0] + R[7] * m[4] + R[8] * m[8], R[6] * m[1] + R[7] * m[5] + R[8] * m[9], R[6] * m[2] + R[7] * m[6] + R[8] * m[10], R[6] * m[3] + R[7] * m[7] + R[8] * m[11] + z * rise,
      ];
      shell.setMatrix(copy, out);
    });
    const gap = 360 - 5 * deg;
    this.read.textContent = `${deg.toFixed(1)}° per copy. After five copies: ${(5 * deg).toFixed(0)}°, ${Math.abs(gap) < 7.5 ? 'nearly closed' : gap > 0 ? 'open' : 'overshot into a helix'}.`;
  }

  released(deg) {
    this.tries++;
    if (Math.abs(deg - 72) > this.stage.close) {
      this.hud.setGoal('A wrong turn gives an open chain, a helix that never closes. Only one turn comes home.');
      return;
    }
    if (this.tries === 1) this.ctx.earn(2);
    this.setTurn(72);
    this.slider.disabled = true;
    this.dock.remove();
    this.dock = null;
    this.sound.clunk(0.34);
    this.hud.setGoal('');
    const { shell } = this;
    for (const k of this.order) shell.setMatrix(k, this.p.sym[k]);
    shell.snap();
  }

  update(dt) {
    (this.s ?? this.shell).update(dt);
  }

  dispose() {
    this.dock?.remove();
    (this.s ?? this.shell)?.dispose();
  }
}

// Stages Twenty-four and Sixty: a shell is counted in kinds of contact. Turn them on and see what they build.
const KIND_INK = [[0.34, 1, 0, 1], [1, 0, 0, 1], [0, 0, 0.95, 1], [0, 1, 0, 1]];
const QUIET = [0, 0, 0.3, 1];

class Cage {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage, hud: ctx.hud, sound: ctx.sound, press: ctx.press, rig: ctx.rig });
    const p = (this.p = protein(stage.protein));
    this.ops = p.sym;
    const home = identityOf(this.ops);
    // Faces related by an inverse are two sides of one contact.
    const kinds = [];
    for (const f of p.faces) {
      if (kinds.some((k) => k.faces.some((g) => g.inverse === f.op))) {
        kinds.find((k) => k.faces.some((g) => g.inverse === f.op)).faces.push({ ...f, inverse: -1 });
        continue;
      }
      let inverse = -1;
      for (let j = 0; j < this.ops.length; j++) if (indexOfOp([this.ops[home]], compose(this.ops[f.op], this.ops[j])) === 0) inverse = j;
      kinds.push({ faces: [{ ...f, inverse }], op: f.op, order: orderOf(this.ops, f.op) });
    }
    this.kinds = kinds.filter((k) => k.order <= 5).slice(0, 3);
    this.kinds.forEach((k, i) => {
      k.i = i;
      k.area = k.faces.reduce((t, f) => t + f.area, 0); // both faces of a contact, as one copy has them
      k.name = `${k.order}-fold`;
      const by = new Map();
      for (const f of k.faces) {
        const lost = atomBytes(f.lost);
        for (let a = 0; a < p.atomEl.length; a++) if (lost[a]) by.set(p.atomRes[a], (by.get(p.atomRes[a]) ?? 0) + lost[a]);
      }
      k.res = new Set([...by.entries()].filter(([, l]) => l >= 8).map(([r]) => r));
    });
    this.on = new Set();
    this.shell = new Assembly(ctx, stage, (line, ms) => ctx.finishSoon(line, ms), { free: true, spread: 1.7 });
    this.farView = this.rig.distTarget;
    this.spot = this.ops.map((m) => {
      const c = this.shell.com;
      return [m[0] * c.x + m[1] * c.y + m[2] * c.z + m[3], m[4] * c.x + m[5] * c.y + m[6] * c.z + m[7], m[8] * c.x + m[9] * c.y + m[10] * c.z + m[11]];
    });
    this.reach = Math.hypot(...this.spot[0]) * stage.spread;
    this.now = this.ops.map(() => [0, 0, 0]);
    this.goal = this.ops.map(() => [0, 0, 0]);
    this.tried = new Set();
    this.pairs = new Set();
    this.done = [false, false, false];
    this.rig.spin = 0.12;
    this.dock = $('div', 'dock cage-dock');
    ctx.layer.append(this.dock);
    this.read = $('p', 'saltread');
    this.row = $('div', 'row');
    this.dock.append(this.read, this.row);
    this.applyContacts(true);
    if (stage.rna) this.rnaStep();
    else this.chips();
  }

  rnaStep() {
    this.read.textContent = 'Sixty copies, none joined.';
    this.row.replaceChildren(button('btn pink', 'Add RNA', () => this.addRna()));
    this.hud.setGoal('Without RNA this coat protein stays apart, probably because the charged arms of the copies repel. Those arms are not in this crystal model.');
  }

  addRna() {
    const k = this.kinds.find((x) => x.order === 3);
    this.sound.bloom();
    this.rna = true;
    this.chips();
    this.toggle(k);
    this.stamp(0);
    this.hud.setGoal('RNA helps the first contact form: threes, a likely way in. Now add one more kind of contact.');
  }

  chips() {
    this.row.replaceChildren();
    this.chipOf = this.kinds.map((k) => {
      const b = button('chip kind', `${k.name}, ${k.area.toFixed(0)} Å²`, () => this.toggle(k));
      this.row.append(b);
      return b;
    });
    if (!this.stage.rna) this.hud.setGoal('Every copy is apart. Each contact is a real seam, area per copy shown. Turn them on one at a time.');
  }

  toggle(k) {
    if (this.on.has(k)) this.on.delete(k);
    else this.on.add(k);
    this.sound.ratchet(0.16);
    buzz(10);
    this.applyContacts();
  }

  applyContacts(first = false) {
    const { ops, kinds, shell } = this;
    const gens = [...this.on].flatMap((k) => k.faces.map((f) => f.op));
    const label = components(ops, gens);
    const count = new Map();
    label.forEach((v) => count.set(v, (count.get(v) ?? 0) + 1));
    const piece = Math.max(...count.values());
    const closed = piece === ops.length;
    this.closed = closed;
    this.rig.distTarget = this.farView * (closed ? 0.68 : 1);
    const mid = new Map();
    label.forEach((v, i) => {
      const m = mid.get(v) ?? [0, 0, 0];
      for (let q = 0; q < 3; q++) m[q] += this.spot[i][q] / count.get(v);
      mid.set(v, m);
    });
    label.forEach((v, i) => {
      const m = mid.get(v);
      const l = Math.hypot(...m) || 1;
      const out = closed ? 0 : this.reach;
      this.goal[i] = m.map((x) => (x / l) * out);
    });
    if (first) {
      this.now = this.goal.map((g) => [...g]);
      this.ops.forEach((m, k) => shell.shift(k, m, ...this.now[k]));
    }
    // The contacts the geometry has made, whether switched on or not.
    const lit = closed ? kinds : [...this.on];
    shell.setInks((r) => {
      for (const k of lit) if (k.res.has(r)) return KIND_INK[k.i];
      return QUIET;
    });
    this.chipOf?.forEach((b, i) => {
      b.classList.toggle('on', this.on.has(kinds[i]));
      b.classList.toggle('self', closed && !this.on.has(kinds[i]));
    });
    if (first) return;
    this.read.textContent = closed ? `All ${ops.length} copies joined, from ${this.on.size} ${this.on.size === 1 ? 'kind' : 'kinds'} of contact.` : `Largest piece: ${piece} ${piece === 1 ? 'copy' : 'copies'}.`;
    if (this.on.size === 1 && !closed) {
      const [k] = this.on;
      this.tried.add(k);
      this.hud.setGoal(`One kind of contact, repeated: a closed ring of ${k.order}. It can never grow past ${k.order}.`);
    }
    this.judge(closed);
  }

  judge(closed) {
    const { stage, kinds } = this;
    if (!stage.rna && this.tried.size === kinds.length) this.stamp(0);
    if (!closed) return;
    this.stamp(1);
    this.ctx.hud.offerFinish();
    const third = kinds.find((k) => !this.on.has(k));
    this.hud.setGoal(third ? `Two kinds of contact joined all ${this.ops.length} copies. The ${third.name} contact formed by itself: the geometry brought those faces together.` : `All ${this.ops.length} copies, every contact made.`);
    if (this.on.size === 2) {
      this.pairs.add([...this.on].map((k) => k.i).sort().join());
      if (stage.rna ? this.pairs.size === 3 : !this.on.has(kinds[0])) this.stamp(2);
    }
    if (!this.sealBtn) {
      this.sealBtn = button('btn pink', 'Seal the shell', () => this.seal());
      this.dock.append(this.sealBtn);
    }
  }

  seal() {
    if (!this.closed) {
      this.hud.setGoal('It is not closed yet: at least two kinds of contact are needed.');
      return;
    }
    this.dock.remove();
    this.dock = null;
    this.sealed = true;
    this.hud.setGoal('');
    this.ops.forEach((m, k) => this.shell.setMatrix(k, m));
    this.shell.snap();
  }

  stamp(i) {
    if (!this.done[i]) {
      this.done[i] = true;
      this.ctx.earn(i);
    }
  }

  update(dt) {
    const { now, goal, shell, ops } = this;
    if (!this.sealed) {
      const k = 1 - Math.exp(-dt * 4);
      for (let i = 0; i < ops.length; i++) {
        let moved = false;
        for (let q = 0; q < 3; q++) {
          const d = goal[i][q] - now[i][q];
          if (Math.abs(d) > 0.02) {
            now[i][q] += d * k;
            moved = true;
          }
        }
        if (moved) shell.shift(i, ops[i], ...now[i]);
      }
    }
    shell.update(dt);
  }

  dispose() {
    this.dock?.remove();
    this.shell.dispose();
  }
}

export function startShell(ctx, stage) {
  const Cls = { patch: PatchHunt, score: ScorePatch, 'hot-spots': HotSpots, steering: Steering, partner: RightPartner, 'two-faces': TwoFaces, protease: SelfMeeting, toxin: Ring }[stage.id] ?? Cage;
  return new Cls(ctx, stage);
}
