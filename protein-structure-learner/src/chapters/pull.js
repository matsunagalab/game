// The Pull stages: a real protein under a finger. It stretches, bonds snap and it comes back, and the board says what was holding that part.
// The physics is in src/science/pull.js, and nothing here decides whether a bond breaks or which partner it finds. Two things here do steer the protein:
// the hand's spring, and in Squish the line the ring leaves along, at the MD's speed once it is past the first 3 A.
import * as THREE from '../../vendor/three/three.module.js';
import { Ribbon, Atoms } from '../ribbon.js';
import { foldOf, TONE } from '../proteins.js';
import { q3 } from '../science/dssp.js';
import { buildModel, computeForces, step, holdStill, holdTurn, boardFrom, Watch, Advance, Pocket, HoleRead, HOLE_MIN, angleAt, oilAtoms, oilTouch, placeOf, saltNow, crowding, levelOf, memoryOf, bondEnergy, bondName, atomLabel } from '../science/pull.js';
import params from '../data/grab-params.json';
import measured from '../data/pull-md.json';
import restTable from '../data/pull-rest.json';
import { buzz } from '../sound.js';
import { $, clamp } from '../ui.js';
import { Bay } from './core.js';

const SUBSTEPS = 12;
const GRIP = 6;          // spring from the finger, kcal/mol per A
const CAP = 45;          // the most the hand can pull with: past this it stretches no further, so play stays recoverable
const RING = 104;        // px: in the last stage a pull past this takes the side chain out
const STOP = 8.5;        // A from home where the hand stops. The ring lags the spring and ends near 6 A, as far as the MD pull took it
const SLIDE = 3;         // A at the finger's own speed. Past this the ring slides on by itself, because a slow pull lets the neighbours follow it in
const SLIDE_RATE = 0.2;  // A per frame of that slide, so that a fast finger and a slow one read the same hole
const OUT = 5;           // A off home: the ring has left its sphere
const HOME = 1;          // A off home: back. Real water's home is 0.4 to 0.6 A, and this model rests at about 0.5 A
const READ_EVERY = 1 / 15; // s of model time between pocket reads, so that a slow phone or a 120 Hz screen reads the same thing
const OIL = 'AVLIMFWYP';
const HAND = new Path2D('M11 30c-3-3-6-7-7-10-1-2 1-3 3-2l3 3V6a2.2 2.2 0 0 1 4.4 0v7.6a2.2 2.2 0 0 1 4.3 0v1a2.2 2.2 0 0 1 4.3 0v1a2.2 2.2 0 0 1 4.3 0V23c0 3-1 5-2 7z');

const tag = (kind, text) => $('span', `tag ${kind}`, text);

// Stability lost, from a measured change. Nisthal's sign: positive gains. Under 0.6 a gain is inside the disagreement between datasets, so it reads as nothing.
const lostText = (v) => (v === null ? 'unstable' : v > 0.6 ? `gain ${v.toFixed(1)}` : v > 0 ? 'about 0' : (-v).toFixed(1));

// Two angle curves from real-water MD, on one scale: how much more often a contact sits at each angle than on an even sphere.
// A dot is the player's own contact, on the board only while that contact exists, so that a dot never stands for a bond that has gone.
class Curves {
  constructor(data) {
    this.data = data;
    this.el = $('div', 'plot');
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d');
    this.el.append(this.canvas, tag('real', 'Real-water MD'));
    this.h = null;
    this.o = null;
  }

  curve(g, ys, left, width, top, height) {
    const { ang, top: most } = this.data;
    const X = (a) => left + ((a - 60) / 120) * width;
    const Y = (v) => top + height - (v / most) * height;
    g.beginPath();
    ang.forEach((a, i) => (i ? g.lineTo(X(a), Y(ys[i])) : g.moveTo(X(a), Y(ys[i]))));
    g.stroke();
    return { X, Y };
  }

  at(ys, a) {
    const { ang } = this.data;
    const i = ang.findIndex((x) => x >= a);
    if (i <= 0) return ys[Math.max(0, i)];
    return ys[i - 1] + ((ys[i] - ys[i - 1]) * (a - ang[i - 1])) / (ang[i] - ang[i - 1]);
  }

  draw(h = this.h, o = this.o) {
    const { canvas, g, data } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.el.clientWidth;
    const ht = this.el.clientHeight;
    if (!w || !ht) return;
    const resized = canvas.width !== Math.round(w * dpr);
    const same = (a, b) => (a === null) === (b === null) && Math.abs((a ?? 0) - (b ?? 0)) < 1;
    // Nothing to redraw unless a dot has really moved.
    if (!resized && same(h, this.h) && same(o, this.o)) return;
    this.h = h;
    this.o = o;
    if (resized) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(ht * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, ht);
    const gap = 16;
    const each = (w - gap) / 2;
    const top = 18, foot = 13;
    const height = ht - top - foot;
    g.lineWidth = 2.5;
    g.strokeStyle = '#1f2aa6';
    g.lineJoin = 'round';
    const A = this.curve(g, data.hb, 0, each, top, height);
    const B = this.curve(g, data.oil, each + gap, each, top, height);
    g.fillStyle = '#1f2aa6';
    g.font = '800 12px Bricolage, sans-serif';
    g.textAlign = 'left';
    g.fillText('H-bond: straight', 0, 12);
    g.fillText('Oil: any angle', each + gap, 12);
    g.font = '700 10.5px Bricolage, sans-serif';
    for (const P of [A, B]) {
      g.textAlign = 'left';
      g.fillText('60', P.X(60), ht - 2);
      g.textAlign = 'center';
      g.fillText('120', P.X(120), ht - 2);
      g.textAlign = 'right';
      g.fillText('180°', P.X(180), ht - 2);
    }
    const dot = (P, ys, a) => {
      if (a === null) return;
      const x = clamp(a, 60, 180);
      g.beginPath();
      g.arc(P.X(x), P.Y(this.at(ys, x)), 5.5, 0, 7);
      g.fillStyle = '#ff4a9e';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#fff';
      g.stroke();
    };
    dot(A, data.hb, h);
    dot(B, data.oil, o);
  }
}

// Turns the whole model so that one residue points up the screen, where the finger has room.
function turnUp(m, res) {
  const c = [0, 0, 0];
  for (let i = 0; i < m.N; i++) for (let k = 0; k < 3; k++) c[k] += m.X0[i * 3 + k] / m.N;
  const a = m.ca[res] * 3;
  const from = new THREE.Vector3(m.X0[a] - c[0], m.X0[a + 1] - c[1], m.X0[a + 2] - c[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(from, new THREE.Vector3(0.28, 0.96, 0).normalize());
  const v = new THREE.Vector3();
  for (const X of [m.X0, m.X]) {
    for (let i = 0; i < m.N; i++) {
      v.set(X[i * 3] - c[0], X[i * 3 + 1] - c[1], X[i * 3 + 2] - c[2]).applyQuaternion(q);
      X[i * 3] = v.x;
      X[i * 3 + 1] = v.y;
      X[i * 3 + 2] = v.z;
    }
  }
  computeForces(m, true);
}

class Bench extends Bay {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { p, d } = foldOf(stage.sim);
    this.p = p;
    this.md = measured[stage.sim];
    this.m = buildModel(p, params, { seed: ((Math.random() * 4e9) >>> 0) || 1 });
    const { m } = this;
    if (stage.grip) turnUp(m, p.resno.indexOf(stage.grip[1]));
    // A short relaxation out of the crystal. The board holds bonds formed most of the time in long resting runs of this model, which real water also keeps.
    step(m, 300);
    holdStill(m);
    const board = boardFrom(m, restTable[stage.sim], this.md.bonds);
    this.watch = new Watch(m, board.rest, board.known);

    this.ss = Array.from(d.ss, q3).join('');
    this.ribbon = this.add(new Ribbon(this.ss, [], { helixWidth: 1.2, strandWidth: 1.25, coil: 0.26, thickness: 0.28 }));
    this.ribbon.paint((i) => (this.ss[i] === 'H' ? [0.55, 0, 0.06] : this.ss[i] === 'E' ? [0, 0.34, 0.16] : [0, 0, 0.5]), (i) => 2 + (i >> 3));
    this.show = Float64Array.from(m.X);
    this.ca = new Float32Array(p.n * 3);
    this.o = new Float32Array(p.n * 3);
    this.caOf = m.ca;
    this.oOf = Array.from({ length: p.n }, (_, r) => m.of.get(`${r}:O`).i);
    this.sideAtoms = [];
    m.atoms.forEach((a, i) => {
      if (a.el !== 'H' && !['N', 'CA', 'C', 'O', 'OXT'].includes(a.name)) this.sideAtoms.push(i);
    });
    this.beads = this.add(new Atoms(this.sideAtoms.length));

    this.radius = stage.view ?? 16;
    this.rig.yaw = stage.yaw ?? 0;
    this.rig.pitch = stage.pitchStart ?? 0.1;

    this.panel = $('div', 'pullpanel');
    this.tags = $('div', 'tagline');
    this.tags.append(tag('model', 'Teaching model'));
    this.hold = $('div', 'pullrow');
    this.pay = $('div', 'pullrow');
    this.board = $('div', 'pullrow');
    this.panel.append(this.hold, this.pay, this.board, this.tags);
    this.paying = true;
    this.restMem = memoryOf(m);
    for (const b of this.watch.bonds) b.worth = bondEnergy(m, b);
    this.calm = 99;
    ctx.layer.append(this.panel);

    this.grip = null;
    this.hover = null;
    this.idle = 0;
    this.tick = 0;
    this.cost = 2;
    this.pace = 1;
    this.pulls = 0;
    this.fx = [];
    this.marks = [];
    this.hintFrom = null;
    this.vec = new THREE.Vector3();
    this.canvas = ctx.press.canvas;
    this.handlers = { down: (e) => this.down(e), move: (e) => this.moved(e), up: (e) => this.up(e) };
    document.addEventListener('pointerdown', this.handlers.down, true);
    document.addEventListener('pointermove', this.handlers.move, true);
    document.addEventListener('pointerup', this.handlers.up, true);
    document.addEventListener('pointercancel', this.handlers.up, true);
    this.layout();
    this.rig.dist = this.rig.distTarget;
    this.pose();
    this.paintBeads();
  }

  // Share of the time a bond held in real-water MD, or undefined if it never did.
  held(key) {
    const [d, a] = key.split('-').map(Number);
    return this.md.bonds[`${atomLabel(this.m, d)}-${atomLabel(this.m, a)}`]?.[0];
  }

  panelHeight() {
    return 136;
  }

  // A wide screen gives the protein the room: this panel is small.
  layout() {
    const { cssW: w, cssH: h, camera } = this.press;
    if (w <= h * 1.15) return super.layout();
    const pw = Math.min(380, w * 0.42);
    const safe = this.ctx.safeBottom();
    this.press.setFocus(0.5 * (1 - (pw + 24) / w), 0.56);
    this.viewPx = Math.min(w - pw - 24, h - 100);
    this.placePanel({ right: 12, bottom: safe + 12, width: pw, height: Math.min(h - 96, this.panelHeight() + 40) });
    this.rig.distTarget = (((this.radius * 1.3) / Math.tan((camera.fov * Math.PI) / 360)) * h) / this.viewPx;
  }

  stamp(i, ok = true) {
    if (ok && !this.done[i]) {
      this.done[i] = true;
      this.ctx.earn(i);
    }
  }

  // A timer that dies with the stage, so that leaving mid-pause cannot touch the next stage's camera.
  later(fn, ms) {
    setTimeout(() => {
      if (!this.closed) fn();
    }, ms);
  }

  dispose() {
    this.closed = true;
    const h = this.handlers;
    document.removeEventListener('pointerdown', h.down, true);
    document.removeEventListener('pointermove', h.move, true);
    document.removeEventListener('pointerup', h.up, true);
    document.removeEventListener('pointercancel', h.up, true);
    this.canvas.classList.remove('pull-grab', 'pull-held');
    this.rig.enabled = true;
    super.dispose();
  }

  // ---- The hand ----

  screen(x, y, z) {
    const v = this.vec.set(x, y, z).project(this.press.camera);
    return { x: (v.x * 0.5 + 0.5) * this.overlay.w, y: (-v.y * 0.5 + 0.5) * this.overlay.h, z: v.z };
  }

  sideCentre(r, X = this.show) {
    const c = [0, 0, 0];
    let n = 0;
    this.m.atoms.forEach((a, i) => {
      if (a.res === r && a.el !== 'H' && !['N', 'CA', 'C', 'O', 'OXT', 'CB'].includes(a.name)) {
        c[0] += X[i * 3];
        c[1] += X[i * 3 + 1];
        c[2] += X[i * 3 + 2];
        n++;
      }
    });
    return n ? c.map((v) => v / n) : null;
  }

  // The nearest thing under the finger: a side chain, or the chain at a C-alpha.
  pick(x, y, reach) {
    const { p, m } = this;
    let best = null;
    let bestD = reach;
    for (let r = 0; r < p.n; r++) {
      const i = m.ca[r] * 3;
      const s = this.screen(this.show[i], this.show[i + 1], this.show[i + 2]);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) {
        bestD = d;
        best = { res: r, side: false };
      }
      const c = this.sideCentre(r);
      if (c) {
        const q = this.screen(c[0], c[1], c[2]);
        const e = Math.hypot(q.x - x, q.y - y) * (this.bigRes?.has(r) ? 0.55 : 0.9);
        if (e < bestD) {
          bestD = e;
          best = { res: r, side: true };
        }
      }
    }
    return best;
  }

  group(hit) {
    const { m } = this;
    const out = [];
    m.atoms.forEach((a, i) => {
      if (hit.side) {
        if (a.res === hit.res && a.el !== 'H' && !['N', 'CA', 'C', 'O', 'OXT', 'CB'].includes(a.name)) out.push(i);
      } else if (Math.abs(a.res - hit.res) <= 1 && ['N', 'CA', 'C', 'O', 'CB'].includes(a.name)) out.push(i);
    });
    return out;
  }

  // Finger to a point on the plane through the grip, facing the camera.
  point(x, y, at) {
    const cam = this.press.camera;
    const a = new THREE.Vector3((x / this.overlay.w) * 2 - 1, -(y / this.overlay.h) * 2 + 1, 0.5).unproject(cam);
    const dir = a.sub(cam.position).normalize();
    const n = new THREE.Vector3();
    cam.getWorldDirection(n);
    const c = new THREE.Vector3(at[0], at[1], at[2]).sub(cam.position);
    const t = c.dot(n) / dir.dot(n);
    return dir.multiplyScalar(t).add(cam.position);
  }

  down(e) {
    if (e.target !== this.canvas || (e.button ?? 0) > 0 || this.pointer !== undefined) return;
    this.idle = 0;
    if (this.locked) return;
    const hit = this.pick(e.clientX, e.clientY, e.pointerType === 'mouse' ? 26 : 40);
    if (!hit) return;
    this.rig.enabled = false;
    this.rig.vy = this.rig.vp = 0;
    this.pointer = e.pointerId;
    const atoms = this.group(hit);
    if (!atoms.length) {
      this.rig.enabled = true;
      this.pointer = undefined;
      return;
    }
    const X = this.m.X;
    const g = [0, 0, 0];
    for (const i of atoms) for (let k = 0; k < 3; k++) g[k] += X[i * 3 + k] / atoms.length;
    this.grip = { ...hit, atoms, start: g, from: { x: e.clientX, y: e.clientY }, finger: { x: e.clientX, y: e.clientY }, moved: 0, force: 0, advance: new Advance() };
    this.m.pull = { atoms, k: GRIP, cap: CAP, x: g[0], y: g[1], z: g[2] };
    this.pulls++;
    this.sound.tick(0.14);
    buzz(8);
    this.canvas.classList.add('pull-held');
    this.tellHold(hit.res);
    this.startPaying();
    this.onGrab?.(this.grip);
  }

  moved(e) {
    this.idle = 0;
    if (this.grip && e.pointerId === this.pointer) {
      this.grip.finger = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'mouse' && e.buttons === 0 && e.target === this.canvas) {
      const hit = this.pick(e.clientX, e.clientY, 26);
      const name = hit ? `${hit.res}${hit.side}` : '';
      if (name !== this.hoverName) {
        this.hoverName = name;
        this.hover = hit;
        this.canvas.classList.toggle('pull-grab', !!hit);
        this.paintBeads();
        if (hit && !this.grip && !this.locked) this.tellHold(hit.res);
      }
    }
  }

  up(e) {
    if (e.pointerId !== this.pointer) return;
    this.pointer = undefined;
    this.rig.enabled = true;
    this.canvas.classList.remove('pull-held');
    const g = this.grip;
    this.grip = null;
    this.m.pull = null;
    this.calm = 0;
    this.paintBeads();
    this.onLetGo?.(g);
  }

  // ---- The board ----

  // What holds one residue right now, all read live from the model, so that a pull that breaks a salt bridge takes its chip away.
  holding(res, side = false) {
    const { m, watch } = this;
    const own = (i) => m.atoms[i].res === res && (!side || !['N', 'O', 'H'].includes(m.atoms[i].name));
    const bonds = watch.bonds.filter((b) => b.on && (own(b.d) || own(b.a)) && !this.isSalt(b));
    return { hb: bonds.length, salt: saltNow(m, res), oil: oilTouch(m, res), level: levelOf(crowding(m, res)) };
  }

  nameOf(res) {
    return `${this.p.seq[res]}${this.p.resno[res]}`;
  }

  isSalt(b) {
    const { m } = this;
    const q = (i) => {
      const a = m.atoms[i];
      return /^(NZ|NH1|NH2|NE|OD1|OD2|OE1|OE2)$/.test(a.name) && 'KRDE'.includes(m.p.seq[a.res]);
    };
    return q(b.d) && q(b.a) && 'KR'.includes(m.p.seq[b.resD]) && 'DE'.includes(m.p.seq[b.resA]);
  }

  chipsFor(res, side) {
    const h = this.holding(res, side);
    const out = [];
    if (h.hb) out.push(`H-bonds ${h.hb}`);
    if (h.salt) out.push('Salt bridge');
    if (h.oil) out.push(`${h.oil} oil`);
    out.push(h.level);
    return out;
  }

  tellHold(res, side = this.grip?.side ?? this.hover?.side ?? false) {
    this.hold.replaceChildren($('span', '', this.nameOf(res)), ...this.chipsFor(res, side).map((t) => $('span', 'pullchip', t)));
  }

  // ---- What paid for the pull ----

  // Which named bonds count just now. The memory always does.
  namedBonds() {
    return [];
  }

  startPaying() {
    if (!this.paying) return;
    this.calm = 0;
    this.memPaid = 0;
    this.namePaid = 0;
    this.memChip = $('span', 'pullchip pay top', 'Memory so far 0');
    this.nameChip = $('span', 'pullchip pay', 'Bonds 0');
    this.pay.replaceChildren(this.memChip, this.nameChip);
    this.nameChip.hidden = true;
  }

  // In kcal/mol against rest. Contacts and charges are left to the note: a 1 s mean of contacts strays by 8, and its baseline by 14, against a signal of
  // 15 to 20, so a live number there would be noise. The memory strays by 2.
  account(dt) {
    this.calm += dt;
    if (!this.paying || this.tick % 6) return;
    const mem = memoryOf(this.m);
    if (!this.grip && this.calm > 6) {
      this.restMem += (mem - this.restMem) * 0.05;
      for (const b of this.watch.bonds) if (b.on) b.worth += (bondEnergy(this.m, b) - b.worth) * 0.05;
      if (this.memChip) {
        this.memChip = null;
        this.pay.replaceChildren();
      }
      return;
    }
    if (!this.memChip) return;
    this.memPaid += (mem - this.restMem - this.memPaid) * 0.5;
    const named = this.namedBonds();
    this.namePaid = named.reduce((t, b) => t + bondEnergy(this.m, b) - b.worth, 0);
    this.memChip.textContent = `Memory so far ${Math.round(this.memPaid)}`;
    this.nameChip.textContent = `Bonds ${Math.round(this.namePaid)}`;
    this.nameChip.hidden = !named.length;
  }

  // One bond's snap or return, on the board and in sound.
  bondEvent(e) {
    const { m } = this;
    const b = e.bond;
    const at = [m.X[b.d * 3], m.X[b.d * 3 + 1], m.X[b.d * 3 + 2]];
    this.fx.push({ at, t: 0, label: bondName(m, b) });
    this.sound.ratchet(0.16);
    buzz(14);
  }

  // Thermal flicker far from the finger is not the hand's doing, so only a backbone bond near the pull counts, once.
  counts(b) {
    return b.backbone && !!this.m.pull && !!this.grip?.at && this.near(b, this.grip.at, 13) && !this.snapped.includes(b);
  }

  // The wrong part was taken: the board says so at once.
  wrongGrip() {
    this.nudge = 1;
    this.sound.bump();
    buzz(20);
  }

  bondRow(list) {
    this.board.replaceChildren(...list.map((b) => this.chip(b, b.on ? 'back' : 'off')));
  }

  // Each chip is a real bond, with how much of the time it held in real water. A broken donor that sits on another acceptor says so.
  chip(b, cls) {
    if (!b.on && b.other !== null) return $('span', 'pullchip moved', `${this.nameOf(b.resD)}–${this.nameOf(this.m.atoms[b.other].res)} new`);
    return $('span', `pullchip ${cls}`, `${bondName(this.m, b)} ${Math.round((this.held(b.key) ?? 0) * 100)}%`);
  }

  // ---- The frame ----

  update(dt) {
    const { m } = this;
    const t0 = performance.now();
    if (!Number.isFinite(m.X[0])) {
      m.X.set(m.X0);
      m.V.fill(0);
      m.pull = null;
    }
    this.frames = Math.min(1.5, dt * 60);
    if (this.grip) this.steer();
    const n = clamp(Math.round(dt * 60 * SUBSTEPS * this.pace), 3, 18);
    step(m, n);
    holdStill(m);
    if (!m.pull) holdTurn(m, 0.1);
    const spent = performance.now() - t0;
    this.cost += (spent - this.cost) * 0.1;
    // A slow phone runs the protein slower instead of dropping frames.
    if (this.cost > 7) this.pace = Math.max(0.35, this.pace * 0.97);
    else if (this.cost < 5) this.pace = Math.min(1, this.pace * 1.01);

    this.tick++;
    const hand = this.grip ? this.grip.advance.update(this.grip.moved, dt) : 0;
    if (this.tick % 2 === 0) for (const e of this.watch.check(m.X, hand)) this.onBond?.(e);
    if (this.grip && this.tick % 8 === 0) this.tellHold(this.grip.res);
    this.account(dt);
    this.onFrame?.(dt);

    const S = this.show;
    const k = 1 - Math.exp(-dt * 28);
    for (let i = 0, e = m.N * 3; i < e; i++) S[i] += (m.X[i] - S[i]) * k;
    this.pose();
    this.idle += dt;
    this.draw(dt);
  }

  steer() {
    const g = this.grip;
    const { m } = this;
    const P = m.pull;
    if (P.at) {
      g.at = P.at;
      g.moved = Math.hypot(P.at[0] - g.start[0], P.at[1] - g.start[1], P.at[2] - g.start[2]);
      g.force = P.force ?? 0;
    }
    const c = g.at ?? g.start;
    const t = this.point(g.finger.x, g.finger.y, c);
    P.x = t.x;
    P.y = t.y;
    P.z = t.z;
    this.onSteer?.(g, P, t);
  }

  pose() {
    const { p, ca, o, show: S } = this;
    for (let r = 0; r < p.n; r++) {
      const a = this.caOf[r] * 3, b = this.oOf[r] * 3;
      for (let k = 0; k < 3; k++) {
        ca[r * 3 + k] = S[a + k];
        o[r * 3 + k] = S[b + k];
      }
    }
    this.ribbon.setCoords(ca, o);
    this.placeBeads();
  }

  inkOf(a) {
    const aa = this.p.seq[a.res];
    if (OIL.includes(aa) && a.el === 'C') return TONE.oil;
    if (a.el === 'N') return 'KR'.includes(aa) ? TONE.plus : TONE.polar;
    if (a.el === 'O') return 'DE'.includes(aa) ? TONE.minus : TONE.polar;
    return [0, 0, 0.14];
  }

  paintBeads() {
    this.beadInk = this.sideAtoms.map((i) => this.inkOf(this.m.atoms[i]));
    this.placeBeads();
  }

  placeBeads() {
    const { beads, sideAtoms, show: S, m } = this;
    const held = this.grip?.res ?? this.hover?.res;
    let n = 0;
    sideAtoms.forEach((i, s) => {
      if (m.gone[i]) return;
      const a = m.atoms[i];
      const oil = this.beadInk?.[s] === TONE.oil;
      const r = a.res === held ? 1.45 : this.bigRes?.has(a.res) ? 1.4 : oil ? 1.05 : a.el === 'C' ? 0.5 : 0.78;
      beads.set(n++, S[i * 3], S[i * 3 + 1], S[i * 3 + 2], r, this.beadInk?.[s] ?? [0, 0, 0.2], 40 + (a.res % 200));
    });
    beads.commit(n);
  }

  draw(dt) {
    const g = this.overlay.g;
    const { show: S, watch } = this;
    g.lineCap = 'round';
    // Bonds that hold: blue dashes. Drawn thin, so that the ribbon stays readable.
    const focus = this.focus();
    for (const b of watch.bonds) {
      if (!b.on) continue;
      if (focus && !this.near(b, focus, 15)) continue;
      const A = this.screen(S[b.d * 3], S[b.d * 3 + 1], S[b.d * 3 + 2]);
      const B = this.screen(S[b.a * 3], S[b.a * 3 + 1], S[b.a * 3 + 2]);
      g.setLineDash([]);
      g.lineWidth = 4.5;
      g.strokeStyle = 'rgba(255,255,255,.75)';
      g.beginPath();
      g.moveTo(A.x, A.y);
      g.lineTo(B.x, B.y);
      g.stroke();
      g.setLineDash([3, 4]);
      g.lineWidth = 2.5;
      g.strokeStyle = '#1f2aa6';
      g.stroke();
    }
    g.setLineDash([]);
    // Marked parts. A grab that is not the task makes the mark jump.
    this.nudge = Math.max(0, (this.nudge ?? 0) - dt * 2.2);
    for (const mark of this.marks) this.drawMark(mark);
    // The band from the grip to the finger.
    if (this.grip) {
      const { finger, at, start, force } = this.grip;
      const c = at ?? start;
      const a = this.screen(c[0], c[1], c[2]);
      const strain = force / this.m.pull.cap;
      g.lineWidth = 3 + strain * 4;
      g.strokeStyle = strain > 0.97 ? '#ff4a9e' : '#1f2aa6';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(finger.x, finger.y);
      g.stroke();
      g.fillStyle = strain > 0.97 ? '#ff4a9e' : '#1f2aa6';
      g.beginPath();
      g.arc(finger.x, finger.y, 7, 0, 7);
      g.fill();
    }
    // Snaps: a burst and a name, on the bond.
    this.fx = this.fx.filter((f) => (f.t += dt) < 1.5);
    for (const f of this.fx) {
      const q = this.screen(f.at[0], f.at[1], f.at[2]);
      const w = Math.max(0, 1 - f.t / 0.28);
      if (w > 0) this.overlay.burst(q.x, q.y, 10 + 12 * w, f.t * 4);
      if (f.label) {
        g.font = '800 15px Bricolage, sans-serif';
        g.textAlign = 'center';
        g.lineWidth = 5;
        g.strokeStyle = '#fff';
        g.fillStyle = '#1f2aa6';
        g.globalAlpha = Math.min(1, (1.5 - f.t) * 2);
        g.strokeText(f.label, q.x, q.y - 16);
        g.fillText(f.label, q.x, q.y - 16);
        g.globalAlpha = 1;
      }
    }
    // After 6 s without a touch, a hand shows the move.
    // Only when a pull is what the stage is waiting for.
    const hint = ['pull', 'strand', 'core', 'choose'].includes(this.state) ? this.hintFrom?.() : null;
    if (hint && this.idle > 6 && !this.grip) {
      const u = ((this.idle - 6) % 1.8) / 1.4;
      const t = Math.min(1, u);
      const e = t * t * (3 - 2 * t);
      const x = hint.x + hint.dx * e;
      const y = hint.y + hint.dy * e;
      g.save();
      g.globalAlpha = u > 1 ? Math.max(0, 1 - (u - 1) * 4) : 1;
      g.translate(x - 11, y - 3);
      g.fillStyle = '#fff';
      g.strokeStyle = '#1f2aa6';
      g.lineWidth = 1.6;
      g.fill(HAND);
      g.stroke(HAND);
      g.restore();
    }
  }

  // Where the player is working: the hand, or else the mark.
  focus() {
    if (this.grip) return this.grip.at ?? this.grip.start;
    return this.marks[0]?.at() ?? null;
  }

  near(b, c, r) {
    const X = this.m.X;
    const a = b.d * 3;
    return (X[a] - c[0]) ** 2 + (X[a + 1] - c[1]) ** 2 + (X[a + 2] - c[2]) ** 2 < r * r;
  }

  drawMark(mark) {
    const g = this.overlay.g;
    const p = mark.at();
    if (!p) return;
    const q = this.screen(p[0], p[1], p[2]);
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 260) + (this.nudge ?? 0) * 0.6;
    g.lineWidth = 3 + (this.nudge ?? 0) * 3;
    g.strokeStyle = this.nudge > 0 ? '#ff4a9e' : '#1f2aa6';
    g.beginPath();
    g.arc(q.x, q.y, (mark.r ?? 18) * pulse, 0, 7);
    g.stroke();
    if (mark.text) {
      g.font = '800 14px Bricolage, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 4.5;
      g.strokeStyle = '#fff';
      g.fillStyle = '#1f2aa6';
      g.strokeText(mark.text, q.x, q.y - 24);
      g.fillText(mark.text, q.x, q.y - 24);
    }
  }

  markAtRes(res, side = false) {
    return () => {
      const S = this.show;
      if (side) return this.sideCentre(res);
      const i = this.m.ca[res] * 3;
      return [S[i], S[i + 1], S[i + 2]];
    };
  }

  // A hand hint that starts on a point and pulls away from the protein.
  hintAt(atFn) {
    return () => {
      const p = atFn();
      if (!p) return null;
      const q = this.screen(p[0], p[1], p[2]);
      const c = this.screen(0, 0, 0);
      const l = Math.hypot(q.x - c.x, q.y - c.y) || 1;
      return { x: q.x, y: q.y, dx: ((q.x - c.x) / l) * 90, dy: ((q.y - c.y) / l) * 90 };
    };
  }

  // Testing hooks. Coordinates are css pixels.
  get probe() {
    const self = this;
    return {
      residue: (no) => {
        const r = self.p.resno.indexOf(no);
        const i = self.m.ca[r] * 3;
        return self.screen(self.show[i], self.show[i + 1], self.show[i + 2]);
      },
      side: (no) => {
        const c = self.sideCentre(self.p.resno.indexOf(no));
        return c ? self.screen(c[0], c[1], c[2]) : null;
      },
      centre: () => self.screen(0, 0, 0),
      state: () => self.state,
      cost: () => self.cost,
      pace: () => self.pace,
      tracked: () => self.watch.bonds.length,
      extra: () => self.report?.(),
    };
  }
}

// Stage: pull the end of a helix. Hydrogen bonds snap, each with its name, and the board shows whether the same pairs meet again.
class Snap extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.state = 'pull';
    this.snapped = [];
    this.tags.append(tag('real', 'Real-water MD'));
    const end = this.p.resno.indexOf(stage.grip[1]);
    this.marks = [{ at: this.markAtRes(end) }];
    this.hintFrom = this.hintAt(this.markAtRes(end));
    this.tell();
  }

  namedBonds() {
    return this.snapped;
  }

  tell() {
    const { need } = this.stage;
    if (this.state === 'pull') this.hud.setGoal(`Snap ${need} H-bonds: ${this.snapped.length}/${need}`);
    else if (this.state === 'release') this.hud.setGoal('Let go.');
    else if (this.state === 'back') this.hud.setGoal(`Same partner: ${this.snapped.filter((b) => b.on).length}/${this.snapped.length}`);
    this.bondRow(this.snapped);
  }

  onBond(e) {
    if (this.over) return;
    const b = e.bond;
    if (e.type === 'snap' && this.counts(b) && this.state === 'pull') {
      this.bondEvent(e);
      this.snapped.push(b);
      if (this.snapped.length >= this.stage.need) {
        this.stamp(0);
        this.state = 'release';
        this.onePull = this.pulls === 1;
      }
      this.tell();
    } else if (e.type === 'back' && this.snapped.includes(b)) {
      this.sound.zip(this.snapped.filter((x) => x.on).length);
      buzz(10);
      this.tell();
      if (this.state === 'back' && this.snapped.every((x) => x.on)) this.win(true);
    }
  }

  onGrab(g) {
    if (this.state === 'pull' && g.side) this.wrongGrip();
  }

  onLetGo() {
    if (this.state !== 'release') return;
    this.state = 'back';
    this.waited = 0;
    this.tell();
  }

  // Waits run in model time, so that a slow phone gives the chain the same chance to come back.
  onFrame(dt) {
    if (this.state === 'back' && !this.over && !this.grip) {
      this.waited += dt * this.pace;
      if (this.tick % 20 === 0) this.bondRow(this.snapped);
      if (this.waited > 8) this.win(false);
    }
  }

  win(all) {
    if (this.over) return;
    this.over = true;
    this.state = 'done';
    const on = this.snapped.filter((b) => b.on).length;
    this.bondRow(this.snapped);
    this.hud.setGoal(`Same partner: ${on}/${this.snapped.length}`);
    this.stamp(1, all);
    this.stamp(2, all && this.onePull);
    this.sound.chord([5, 7, 9], 0.13);
    this.ctx.finishSoon('', 1400);
  }

  report() {
    return { snapped: this.snapped.map((b) => bondName(this.m, b)), back: this.snapped.filter((b) => b.on).length, moved: this.snapped.filter((b) => !b.on && b.other !== null).length, memory: this.memPaid, named: this.namePaid };
  }
}

// Stage: a strand snaps by name, then a core side chain slides out. A hydrogen bond has to be straight, oil touches at any angle, and the hole is counted.
class Squish extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    const { m, p } = this;
    this.state = 'strand';
    this.snapped = [];
    this.core = p.resno.indexOf(stage.core);
    this.gripRes = p.resno.indexOf(stage.grip[1]);
    this.marks = [{ at: this.markAtRes(this.gripRes) }];
    this.hintFrom = this.hintAt(this.markAtRes(this.gripRes));
    this.bigRes = new Set();
    this.pocket = new Pocket(m, this.core);
    this.restSum = 0;
    this.restN = 0;
    for (let i = 0; i < 16; i++) {
      step(m, 12);
      holdStill(m);
      this.sampleRest();
    }
    this.seen = [];
    this.readClock = 0;
    this.plot = new Curves(this.md.angles);
    this.say = $('div', 'pullsay');
    this.panel.insertBefore(this.say, this.tags);
    this.panel.insertBefore(this.plot.el, this.tags);
    this.tell();
    this.later(() => this.panelMoved(), 60);
  }

  panelHeight() {
    return 256;
  }

  panelMoved() {
    if (!this.plot) return;
    this.plot.canvas.width = 0;
    this.plot.draw();
  }

  // The pocket at rest. Atoms come and go at the edge of the sphere, so this runs for as long as the protein is left alone.
  sampleRest() {
    this.pocket.rest();
    this.restSum += this.pocket.read().all;
    this.restN++;
    this.restAtoms = this.restSum / this.restN;
  }

  namedBonds() {
    return this.state.startsWith('strand') ? this.snapped : [];
  }

  // The closest pair of oily carbons between this ring and another residue, as the plot defines a contact, with an atom bonded to the ring carbon and the distance.
  closestOil() {
    const { m, core } = this;
    const X = m.X;
    let best = null, low = 1e9;
    for (const i of this.pocket.side) {
      if (m.atoms[i].el !== 'C') continue;
      for (const j of oilAtoms(m)) {
        if (m.atoms[j].res === core || m.atoms[j].name === 'CA') continue;
        const r = (X[i * 3] - X[j * 3]) ** 2 + (X[i * 3 + 1] - X[j * 3 + 1]) ** 2 + (X[i * 3 + 2] - X[j * 3 + 2]) ** 2;
        if (r < low) {
          low = r;
          best = [i, j];
        }
      }
    }
    return [best[0], best[1], m.adj[best[0]].find((k) => m.atoms[k].el !== 'H'), Math.sqrt(low)];
  }

  tell() {
    const { need } = this.stage;
    const on = this.snapped.filter((b) => b.on).length;
    if (this.state === 'strand') this.hud.setGoal(`Snap ${need} H-bonds: ${this.snapped.length}/${need}`);
    if (this.state === 'strand-go') this.hud.setGoal('Let go.');
    if (this.state === 'strand-back') this.hud.setGoal(`Same partner: ${on}/${this.snapped.length}`);
    if (this.state === 'core') this.hud.setGoal(`Pull ${this.nameOf(this.core)} out: ${(this.off ?? 0).toFixed(1)}/${OUT} Å`);
    if (this.state === 'core-go') this.hud.setGoal(`${this.holeLine()} Let go.`);
    if (this.state === 'core-back' || this.state === 'done') this.hud.setGoal(`${this.nameOf(this.core)} off: ${(this.off ?? 0).toFixed(1)} Å`);
    if (this.state.startsWith('strand')) this.bondRow(this.snapped);
  }

  holeLine() {
    return `Hole: ${this.short} short.`;
  }

  // The ring leaves the way the MD pull took it, straight out from the centre of the protein. The hand stays on that line.
  startCore() {
    const { m } = this;
    this.state = 'core';
    this.marks = [{ at: this.markAtRes(this.core, true) }];
    const h = this.pocket.home();
    const c = [0, 0, 0];
    for (let i = 0; i < m.N; i++) for (let k = 0; k < 3; k++) c[k] += m.X[i * 3 + k] / m.N;
    const l = Math.hypot(h[0] - c[0], h[1] - c[1], h[2] - c[2]);
    this.way = [(h[0] - c[0]) / l, (h[1] - c[1]) / l, (h[2] - c[2]) / l];
    this.hintFrom = () => {
      const p = this.pocket.home();
      const a = this.screen(p[0], p[1], p[2]);
      const b = this.screen(p[0] + this.way[0] * STOP, p[1] + this.way[1] * STOP, p[2] + this.way[2] * STOP);
      return { x: a.x, y: a.y, dx: b.x - a.x, dy: b.y - a.y };
    };
    this.aim = this.yawFor(this.way);
    this.bigRes = new Set([this.core]);
    this.placeBeads();
    this.hold.replaceChildren();
    this.bar = this.meter('Pocket');
    this.board.replaceChildren(this.bar.el);
    this.board.style.flexWrap = 'nowrap';
    this.bar.set(1, `${Math.round(this.restAtoms)}`);
    this.seen = [];
    this.tell();
    this.layout();
  }

  // Turns the view so that the way out lies across the screen, where the finger can see it.
  yawFor(u) {
    const { pitch, yaw } = this.rig;
    const a = u[0] * Math.cos(pitch), b = u[2] * Math.cos(pitch), c = u[1] * Math.sin(pitch);
    const r = Math.hypot(a, b) || 1;
    const q = Math.asin(clamp(-c / r, -1, 1));
    const f = Math.atan2(b, a);
    const near = (y) => y + Math.round((yaw - y) / (2 * Math.PI)) * 2 * Math.PI;
    const one = near(q - f), two = near(Math.PI - q - f);
    return Math.abs(one - yaw) < Math.abs(two - yaw) ? one : two;
  }

  meter(label) {
    const el = $('div', 'pullbar');
    const fill = $('i');
    const name = $('span', '', label);
    const val = $('b', '', '');
    el.append(fill, name, val);
    return { el, name, set: (v, text) => {
      fill.style.transform = `scaleX(${clamp(v, 0, 1)})`;
      val.textContent = text;
    } };
  }

  onGrab(g) {
    if ((this.state === 'strand' && g.side) || (this.state === 'core' && !(g.res === this.core && g.side))) this.wrongGrip();
    if (this.state === 'strand' && !g.side) this.dotBond = this.nearestBond(g.start);
  }

  nearestBond(c) {
    let best = null, low = 1e9;
    for (const b of this.watch.bonds) {
      if (!b.backbone || !b.on) continue;
      const d = (this.m.X[b.d * 3] - c[0]) ** 2 + (this.m.X[b.d * 3 + 1] - c[1]) ** 2 + (this.m.X[b.d * 3 + 2] - c[2]) ** 2;
      if (d < low) {
        low = d;
        best = b;
      }
    }
    return best;
  }

  // On the line out, however the finger wanders.
  onSteer(g, P, t) {
    if (!this.way || !g.side || g.res !== this.core) return;
    const h = this.pocket.home();
    const reach = clamp((t.x - h[0]) * this.way[0] + (t.y - h[1]) * this.way[1] + (t.z - h[2]) * this.way[2], 0, STOP);
    if (reach >= SLIDE && this.along === undefined) {
      this.along = SLIDE;
      this.say.textContent = 'Pulled at the MD speed';
    }
    if (this.along !== undefined) this.along = Math.min(STOP, this.along + SLIDE_RATE * this.pace * this.frames);
    const s = this.along ?? reach;
    P.x = h[0] + this.way[0] * s;
    P.y = h[1] + this.way[1] * s;
    P.z = h[2] + this.way[2] * s;
  }

  onBond(e) {
    if (this.over || !this.state.startsWith('strand')) return;
    const b = e.bond;
    if (e.type === 'snap' && this.counts(b) && this.state === 'strand') {
      this.bondEvent(e);
      this.snapped.push(b);
      if (this.snapped.length >= this.stage.need) this.state = 'strand-go';
      this.tell();
    } else if (e.type === 'back' && this.snapped.includes(b)) {
      this.sound.zip(this.snapped.filter((x) => x.on).length);
      buzz(10);
      this.tell();
      if (this.state === 'strand-back' && this.snapped.every((x) => x.on)) this.strandDone(true);
    }
  }

  strandDone(all) {
    this.stamp(0, all);
    this.sound.chord([5, 7], 0.12);
    this.state = 'wait';
    this.later(() => this.startCore(), 900);
  }

  onLetGo(g) {
    this.along = undefined;
    // Let go on the way out: start over, since nothing has been read.
    if (this.state === 'core') {
      this.hole = undefined;
      this.say.textContent = '';
    }
    if (this.state === 'strand-go') {
      this.state = 'strand-back';
      this.waited = 0;
      this.tell();
    } else if (this.state === 'core-go' && g.res === this.core && g.side) {
      this.state = 'core-back';
      this.waited = 0;
      this.tell();
    }
  }

  // A running mean over the last half second of model frames, so that one thermal frame cannot decide.
  mean(key) {
    return this.seen.reduce((t, r) => t + r[key], 0) / this.seen.length;
  }

  onFrame(dt) {
    if (this.aim !== undefined) {
      const k = 1 - Math.exp(-dt * 5);
      this.rig.yaw += (this.aim - this.rig.yaw) * k;
      if (Math.abs(this.aim - this.rig.yaw) < 0.005 || this.grip) this.aim = undefined;
    }
    if (this.state === 'strand-back' && !this.grip) {
      this.waited += dt * this.pace;
      if (this.tick % 20 === 0) this.bondRow(this.snapped);
      if (this.waited > 8) this.strandDone(false);
    }
    this.follow();
    if (this.state !== 'core-go' && this.state !== 'core-back' && !this.grip && !this.hole && this.calm > 1.5 && this.tick % 4 === 0) this.sampleRest();
    if (!this.way) return;
    this.readClock += dt * this.pace;
    if (this.readClock >= READ_EVERY) {
      this.readClock -= READ_EVERY;
      this.readPocket();
    }
    if (this.state === 'core-back' && !this.grip) {
      this.waited += dt * this.pace;
      if (this.waited > 1 && this.off < HOME) this.settle(true);
      else if (this.waited > 9) this.settle(false);
    }
  }

  // The bar is always the live count, so the player sees the pocket fill.
  readPocket() {
    const r = this.pocket.read();
    this.seen.push(r);
    if (this.seen.length > 8) this.seen.shift();
    this.off = this.mean('off');
    const now = this.mean('all');
    if (this.state !== 'done') this.bar.set(now / this.restAtoms, `${Math.round(now)} · C ${Math.round(this.mean('carbon') + this.mean('own'))} · N/O ${Math.round(this.mean('polar'))}`);
    if (this.state === 'core' || this.state === 'core-back') this.tell();
    if (this.state === 'core' && this.grip?.side && this.grip.res === this.core && this.off >= OUT) {
      this.hole ??= new HoleRead();
      if (this.hole.add(r)) this.readHole();
    }
  }

  // The dots on the MD curves are the bond and the contact in hand. Each is on the plot only while that contact exists.
  follow() {
    if (this.tick % 2) return;
    const X = this.m.X;
    let b = this.dotBond;
    if (b && !b.seen[(b.now + b.seen.length - 1) % b.seen.length] && this.grip && !this.grip.side) b = this.dotBond = this.nearestBond(this.grip.at ?? this.grip.start);
    const formed = b && b.seen[(b.now + b.seen.length - 1) % b.seen.length];
    const h = formed ? angleAt(X, b.d, b.hs[0], b.a) : null;
    let o = null;
    if (this.way) {
      const [i, j, x, reach] = this.closestOil();
      if (reach < 4.5) o = angleAt(X, x, i, j);
    }
    this.plot.draw(h, o);
  }

  // A plain mean over the half second after the ring arrives. Past this the model fills the hole within a second, and the bar shows it.
  readHole() {
    this.state = 'core-go';
    this.atoms = this.hole.mean('all');
    this.short = Math.max(0, Math.round(this.restAtoms - this.atoms));
    this.holeOpen = this.restAtoms - this.atoms >= HOLE_MIN;
    this.say.textContent = 'Game fills in 1 s; real water does not.';
    this.stamp(1, this.holeOpen);
    this.sound.tick(0.3);
    buzz(16);
    this.tell();
  }

  settle(home) {
    this.over = true;
    this.state = 'done';
    this.isHome = home;
    this.stamp(2, home);
    this.sound.chord([5, 7, 9], 0.13);
    this.tell();
    this.ctx.resultExtra = this.measured();
    this.ctx.finishSoon('', 2400);
  }

  // The two real measurements under this stage's lesson, every swap shown.
  measured() {
    const box = $('div', 'lab swaps');
    const head = (text, label) => {
      const row = $('div', 'headrow');
      row.append($('span', '', text), tag('real', label));
      return row;
    };
    box.append(head(this.stage.mdLine, 'Real-water MD'), head('Stability lost, kcal/mol', 'Real data'));
    for (const [name, list] of this.stage.swaps) {
      const row = list.map(([aa, v]) => `${aa} ${lostText(v)}`).join(' · ');
      box.append($('span', 'name', name), $('span', 'list', row));
    }
    box.append($('span', 'wide', this.stage.oilLine));
    return box;
  }

  draw(dt) {
    super.draw(dt);
    if (this.state !== 'core' || !this.way) return;
    // The way out, as far as the stop.
    const g = this.overlay.g;
    const h = this.pocket.home(this.show);
    const a = this.screen(h[0], h[1], h[2]);
    const b = this.screen(h[0] + this.way[0] * 6, h[1] + this.way[1] * 6, h[2] + this.way[2] * 6);
    g.setLineDash([2, 7]);
    g.lineWidth = 3;
    g.strokeStyle = '#ff4a9e';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.setLineDash([]);
  }

  report() {
    const h = this.way && this.pocket.home();
    const tip = h && this.screen(h[0] + this.way[0] * STOP, h[1] + this.way[1] * STOP, h[2] + this.way[2] * STOP);
    return { snapped: this.snapped.length, back: this.snapped.filter((b) => b.on).length, short: this.short, atoms: this.atoms, holeOpen: this.holeOpen, restAtoms: this.restAtoms, off: this.off, isHome: this.isHome, tip, memory: this.memPaid, named: this.namePaid };
  }
}

// Stage: read a part, predict the mutation that costs most, then see the measured value.
class ReadIt extends Bench {
  constructor(ctx, stage) {
    super(ctx, stage);
    this.attempt = 1;
    this.paying = false;
    this.tags.append(tag('real', 'Real-water MD'), tag('real', 'Real data'));
    // Burial and oil neighbours as a mean, so that the reading does not flicker with one thermal frame.
    const { m, p } = this;
    this.crowdMean = new Float64Array(p.n);
    this.oilMean = new Float64Array(p.n);
    const n = 10;
    for (let s = 0; s < n; s++) {
      step(m, 15);
      holdStill(m);
      for (let r = 0; r < p.n; r++) {
        this.crowdMean[r] += crowding(m, r) / n;
        this.oilMean[r] += oilTouch(m, r) / n;
      }
    }
    this.deal();
  }

  panelHeight() {
    return 190;
  }

  // What the place says, in the order a reader weighs it.
  chipsFor(res) {
    const q = placeOf(this.md.ties, this.nameOf(res));
    const out = [];
    if (q.cap) out.push('Turn cap');
    if (q.salt) out.push('Salt bridge');
    if (q.hb) out.push(`H-bonds ${q.hb}`);
    const oil = Math.round(this.oilMean[res]);
    if (oil) out.push(`${oil} oil`);
    out.push(levelOf(this.crowdMean[res]));
    return out;
  }

  deal() {
    const all = this.stage.rounds;
    const trap = all.filter((r) => r.trap);
    const rest = all.filter((r) => !r.trap).map((r) => [Math.random(), r]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    this.deck = [...rest.slice(0, this.stage.play - trap.length), ...trap];
    this.at = 0;
    this.right = 0;
    this.nextRound();
  }

  nextRound() {
    const round = (this.round = this.deck[this.at]);
    this.state = 'choose';
    this.locked = false;
    this.m.gone.fill(0);
    const cost = (v) => (v === null ? 99 : -v);
    this.best = round.set.reduce((a, b) => (cost(b[1]) > cost(a[1]) ? b : a))[0];
    // Shuffled, so that neither the order nor the hand gives the answer away.
    this.options = round.set.map(([name, ddg]) => ({ name, ddg, res: this.p.resno.indexOf(+name.slice(1, -1)), key: Math.random() })).sort((a, b) => a.key - b.key);
    this.marks = this.options.map((o) => ({ at: this.markAtRes(o.res, true), text: o.name, r: 15 }));
    this.bigRes = new Set(this.options.map((o) => o.res));
    this.hintFrom = this.hintAt(this.markAtRes(this.options[0].res, true));
    this.placeBeads();
    this.board.replaceChildren();
    this.board.style.display = '';
    this.hold.replaceChildren();
    this.tell();
  }

  tell() {
    this.hud.setGoal(`Pull the costliest: ${this.at + 1}/${this.stage.play}`);
  }

  onFrame(dt) {
    const g = this.grip;
    if (!g || this.state !== 'choose') return;
    const far = Math.hypot(g.finger.x - g.from.x, g.finger.y - g.from.y);
    const o = this.options.find((x) => x.res === g.res);
    if (!o || !g.side || far < RING) {
      g.hold = 0;
      return;
    }
    // Time, not frames, so that a slow phone asks the same of the finger.
    g.hold = (g.hold ?? 0) + dt;
    if (g.hold > 0.16) this.choose(o);
  }

  draw(dt) {
    super.draw(dt);
    const g = this.grip;
    if (g && this.state === 'choose' && this.options.some((x) => x.res === g.res) && g.side) {
      // The line the finger has to cross to take the side chain out.
      const ctx = this.overlay.g;
      ctx.setLineDash([2, 8]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ff4a9e';
      ctx.beginPath();
      ctx.arc(g.from.x, g.from.y, RING, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  choose(o) {
    this.state = 'shown';
    this.locked = true;
    const g = this.grip;
    if (g) {
      this.pointer = undefined;
      this.rig.enabled = true;
      this.canvas.classList.remove('pull-held');
      this.grip = null;
      this.m.pull = null;
    }
    const { m } = this;
    m.atoms.forEach((a, i) => {
      if (a.res === o.res && !['N', 'CA', 'C', 'O', 'OXT', 'CB', 'H'].includes(a.name)) m.gone[i] = 1;
    });
    const c = this.sideCentre(o.res, m.X) ?? [0, 0, 0];
    this.fx.push({ at: c, t: 0 });
    const ok = o.name === this.best;
    if (ok) this.right++;
    this.sound[ok ? 'clunk' : 'bump']();
    buzz(ok ? 16 : 30);
    this.showBars(o);
    this.marks = [];
    const next = () => {
      this.at++;
      if (this.at < this.stage.play) this.nextRound();
      else this.end();
    };
    this.later(next, this.round.warn ? 5200 : 2300);
  }

  showBars(mine) {
    const lab = $('div', 'lab');
    const lost = (v) => (v === null ? 1 : clamp(-v / 4, 0.015, 1));
    const list = [...this.options].sort((a, b) => (a.ddg ?? -9) - (b.ddg ?? -9));
    const fills = [];
    for (const o of list) {
      const track = $('div', 'track');
      const fill = $('i', o.name === this.best ? 'best' : o === mine ? 'mine' : '');
      const text = $('em', '', lostText(o.ddg));
      track.append(fill, text);
      lab.append($('span', '', o.name), track);
      fills.push([fill, lost(o.ddg)]);
    }
    this.hold.replaceChildren($('span', '', 'Stability lost, kcal/mol'));
    this.board.replaceChildren(lab);
    this.board.style.display = 'block';
    if (this.round.warn) this.board.append($('p', 'warn', this.round.warn));
    requestAnimationFrame(() => fills.forEach(([f, w]) => (f.style.width = `${w * 100}%`)));
  }

  end() {
    const { pass, play } = this.stage;
    this.m.gone.fill(0);
    if (this.right >= pass) {
      this.over = true;
      this.state = 'done';
      this.stamp(0);
      this.stamp(1, this.right === play);
      this.stamp(2, this.attempt === 1);
      this.sound.bloom();
      this.hud.setGoal(`${this.right} of ${play}`);
      this.ctx.finishSoon('', 900);
      return;
    }
    this.state = 'again';
    this.lastRight = this.right;
    this.hud.setGoal(`${this.right} of ${play}`);
    this.attempt++;
    if (this.attempt > 2) this.hud.offerFinish();
    this.later(() => this.deal(), 1800);
  }

  report() {
    return { right: this.right, lastRight: this.lastRight, at: this.at, attempt: this.attempt, best: this.best, options: this.options?.map((o) => o.name) };
  }
}

export function startPull(ctx, stage) {
  return new { snap: Snap, squish: Squish, 'read-lab': ReadIt }[stage.id](ctx, stage);
}
