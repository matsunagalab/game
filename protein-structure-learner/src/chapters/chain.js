// Chapter one: steer the backbone from the Ramachandran map.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER } from '../press.js';
import { buildChain, clashesOf, DEG, hydrogenBonds, mapValue } from '../peptide.js';
import { inkMaterial, Atoms } from '../ribbon.js';
import { TONE } from '../proteins.js';
import { $, button, wrapDeg } from '../ui.js';
import { buzz } from '../sound.js';
import { IslandMap, PLACES, landShare } from './map.js';

const ELEMENT_INK = { C: TONE.carbon, N: TONE.nitrogen, O: TONE.oxygen, H: TONE.hydrogen };

// A chain of peptide cards, the way Pauling folded his on paper.
class CardChain {
  constructor(scene, nRes, { chains = 1, heavy = 0.4, hydrogen = 0.24, stick = 0.15 } = {}) {
    this.scene = scene;
    this.heavy = heavy;
    this.hydrogen = hydrogen;
    this.stick = stick;
    const nAtoms = (nRes * 7 + 6) * chains;
    this.atoms = new Atoms(nAtoms + 8);
    scene.add(this.atoms.mesh);

    const maxBonds = (nRes * 7 + 6) * chains;
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const inst = new THREE.InstancedBufferGeometry().copy(cyl);
    inst.instanceCount = maxBonds;
    this.bondInk = new Float32Array(maxBonds * 3);
    this.bondId = new Float32Array(maxBonds);
    inst.setAttribute('aInk', new THREE.InstancedBufferAttribute(this.bondInk, 3));
    inst.setAttribute('aId', new THREE.InstancedBufferAttribute(this.bondId, 1));
    this.bonds = new THREE.InstancedMesh(inst, inkMaterial(), maxBonds);
    this.bonds.frustumCulled = false;
    this.bonds.count = 0;
    scene.add(this.bonds);

    const units = (nRes + 1) * chains;
    this.platePos = new Float32Array(units * 6 * 3 * 3);
    this.plateNorm = new Float32Array(units * 6 * 3 * 3);
    this.plateInk = new Float32Array(units * 6 * 3 * 3);
    this.plateId = new Float32Array(units * 6 * 3);
    const g = (this.plateGeo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.platePos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.plateNorm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInk', new THREE.BufferAttribute(this.plateInk, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aId', new THREE.BufferAttribute(this.plateId, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.plates = new THREE.Mesh(g, inkMaterial({ side: THREE.DoubleSide }));
    this.plates.frustumCulled = false;
    scene.add(this.plates);
    this.m = new THREE.Matrix4();
    this.up = new THREE.Vector3(0, 1, 0);
    this.q = new THREE.Quaternion();
    this.sv = new THREE.Vector3();
    this.tv = new THREE.Vector3();
  }

  begin() {
    this.a = 0;
    this.b = 0;
    this.p = 0;
  }

  atom(pos, el, ink = ELEMENT_INK[el], id = 2) {
    const r = el === 'H' ? this.hydrogen : this.heavy;
    this.atoms.set(this.a++, pos[0], pos[1], pos[2], r, ink, id);
  }

  bond(p, q, ink = TONE.carbon, width = this.stick, id = 3) {
    const { sv, tv, up } = this;
    tv.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const len = tv.length();
    this.q.setFromUnitVectors(up, tv.divideScalar(len || 1));
    this.m.compose(sv.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2), this.q, new THREE.Vector3(width, len, width));
    this.bonds.setMatrixAt(this.b, this.m);
    this.bondInk.set(ink, this.b * 3);
    this.bondId[this.b] = id;
    this.b++;
  }

  // A flat card through the four corners of one peptide unit. It stays rigid; only the corners at CA hinge.
  plate(points, ink, id) {
    const c = [0, 0, 0];
    for (const p of points) for (let k = 0; k < 3; k++) c[k] += p[k] / points.length;
    const u = [points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]];
    const v = [points[3][0] - points[1][0], points[3][1] - points[1][1], points[3][2] - points[1][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    n[0] /= l;
    n[1] /= l;
    n[2] /= l;
    for (let i = 0; i < points.length; i++) {
      for (const pt of [c, points[i], points[(i + 1) % points.length]]) {
        this.platePos.set(pt, this.p * 3);
        this.plateNorm.set(n, this.p * 3);
        this.plateInk.set(ink, this.p * 3);
        this.plateId[this.p] = id;
        this.p++;
      }
    }
  }

  // Adds one chain. Optional transform xf(point) applies a rigid placement.
  addChain(built, xf = (p) => p, firstId = 10) {
    const { res, cap } = built;
    let id = firstId;
    const P = (p) => xf(p);
    this.atom(P(cap.ch3a), 'C');
    this.atom(P(cap.c0), 'C');
    this.atom(P(cap.o0), 'O');
    this.bond(P(cap.ch3a), P(cap.c0));
    this.bond(P(cap.c0), P(cap.o0), TONE.oxygen);
    for (let i = 0; i < res.length; i++) {
      const r = res[i];
      const prevC = i ? res[i - 1].c : cap.c0;
      const prevCA = i ? res[i - 1].ca : cap.ch3a;
      const prevO = i ? res[i - 1].o : cap.o0;
      this.plate([P(prevCA), P(prevO), P(r.ca), P(r.h)], TONE.strand, id++);
      this.atom(P(r.n), 'N');
      this.atom(P(r.h), 'H');
      this.atom(P(r.ca), 'C');
      if (r.kind !== 'G') this.atom(P(r.cb), 'C', r.kind === 'P' ? TONE.helix : TONE.oil);
      else this.atom(P(r.ha2), 'H');
      this.atom(P(r.c), 'C');
      this.atom(P(r.o), 'O');
      this.bond(P(prevC), P(r.n), TONE.nitrogen);
      this.bond(P(r.n), P(r.h), TONE.hydrogen);
      this.bond(P(r.n), P(r.ca), TONE.helix, this.stick * 1.25);
      this.bond(P(r.ca), P(r.c), TONE.minus, this.stick * 1.25);
      this.bond(P(r.ca), P(r.kind === 'G' ? r.ha2 : r.cb));
      this.bond(P(r.c), P(r.o), TONE.oxygen);
    }
    const last = res[res.length - 1];
    this.plate([P(last.ca), P(last.o), P(cap.ch3b), P(cap.h)], TONE.strand, id++);
    this.atom(P(cap.n), 'N');
    this.atom(P(cap.h), 'H');
    this.atom(P(cap.ch3b), 'C');
    this.bond(P(last.c), P(cap.n), TONE.nitrogen);
    this.bond(P(cap.n), P(cap.h), TONE.hydrogen);
    this.bond(P(cap.n), P(cap.ch3b));
  }

  commit() {
    this.atoms.commit(this.a);
    this.bonds.count = this.b;
    this.bonds.instanceMatrix.needsUpdate = true;
    this.bonds.geometry.attributes.aInk.needsUpdate = true;
    this.bonds.geometry.attributes.aId.needsUpdate = true;
    const g = this.plateGeo;
    g.setDrawRange(0, this.p);
    for (const k of ['position', 'normal', 'aInk', 'aId']) g.attributes[k].needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.atoms.mesh, this.bonds, this.plates);
    this.atoms.dispose();
    this.bonds.geometry.dispose();
    this.plateGeo.dispose();
  }
}

// Rigid fit of one point list onto another, so the chain does not fly about as its angles change.
function fitQuaternion(P, Q, q) {
  const n = P.length;
  const cp = [0, 0, 0];
  const cq = [0, 0, 0];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      cp[k] += P[i][k] / n;
      cq[k] += Q[i][k] / n;
    }
  let xx = 0, xy = 0, xz = 0, yx = 0, yy = 0, yz = 0, zx = 0, zy = 0, zz = 0;
  for (let i = 0; i < n; i++) {
    const a = [P[i][0] - cp[0], P[i][1] - cp[1], P[i][2] - cp[2]];
    const b = [Q[i][0] - cq[0], Q[i][1] - cq[1], Q[i][2] - cq[2]];
    xx += a[0] * b[0]; xy += a[0] * b[1]; xz += a[0] * b[2];
    yx += a[1] * b[0]; yy += a[1] * b[1]; yz += a[1] * b[2];
    zx += a[2] * b[0]; zy += a[2] * b[1]; zz += a[2] * b[2];
  }
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  // Power iteration on a shifted matrix, starting from last frame's answer.
  let shift = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) shift += Math.abs(N[i][j]);
  let v = [q.w, q.x, q.y, q.z];
  for (let it = 0; it < 40; it++) {
    const w = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) w[i] += N[i][j] * v[j];
      w[i] += shift * v[i];
    }
    const l = Math.hypot(...w) || 1;
    v = w.map((x) => x / l);
  }
  q.set(v[1], v[2], v[3], v[0]);
  return { cp, cq };
}

const ALL_ATOMS = (built) => built.res.flatMap((r) => [r.n, r.ca, r.c]);

// Applies a rotation and translation to every coordinate of a built chain.
function moveChain(built, fn) {
  const { res, cap } = built;
  for (const r of res) for (const k of ['n', 'h', 'ca', 'ha', 'cb', 'ha2', 'c', 'o']) r[k] = fn(r[k]);
  for (const k of ['ch3a', 'c0', 'o0', 'n', 'h', 'ch3b']) cap[k] = fn(cap[k]);
}

class ChainStage {
  constructor(ctx, stage, config) {
    Object.assign(this, { ctx, stage, config });
    const { press, rig, layer, hud, save } = ctx;
    this.press = press;
    this.rig = rig;
    this.hud = hud;
    this.layer = layer;
    press.setPaper(PAPER.aqua);
    press.setFlood([0, 0, 0]);
    press.clearDisc();
    press.uniforms.uShadow.value = 0.18;
    rig.yaw = config.yaw ?? 0.5;
    rig.pitch = config.pitch ?? 0.25;
    rig.spin = 0;
    rig.target.set(0, 0, 0);
    rig.targetGoal.set(0, 0, 0);

    this.n = config.residues;
    this.phi = new Array(this.n).fill(config.start[0]);
    this.psi = new Array(this.n).fill(config.start[1]);
    this.goal = [...config.start];
    this.cards = new CardChain(press.scene, this.n, { chains: config.chains ?? 1, heavy: config.heavy ?? 0.4, hydrogen: config.hydrogen ?? 0.24 });
    this.hb = [];
    this.lastBonds = 0;
    this.q = new THREE.Quaternion();
    this.prev = null;
    this.burstClock = 0;
    this.wasHard = false;
    this.done = [false, false, false];

    this.map = new IslandMap(layer, { kind: 'A', fogged: config.fog ?? true });
    if (save.mapVisited) this.map.visited.set(save.mapVisited);
    this.map.onMove = (phi, psi) => this.steer(phi, psi);
    this.map.onRelease = () => save.persistMap?.(this.map.visited);
    this.map.setCursor(...config.start);
    for (const k of config.known ?? []) this.map.mark(PLACES[k]);
    ctx.onLayout = () => this.layout();
    this.layout();
    this.map.reveal(...config.start);
    this.dirty = true;
    this.overlay = ctx.overlay;
  }

  layout() {
    const { cssW: w, cssH: h } = this.press;
    const pad = 12;
    const landscape = w > h * 1.15;
    const safeB = this.ctx.safeBottom();
    const extra = this.config.dockHeight ?? 0;
    if (landscape) {
      const s = Math.min(h - 2 * pad - safeB - extra, w * 0.46);
      this.map.layout(w - s - pad - this.ctx.safeRight(), h - s - pad - safeB - extra, s);
      this.press.setFocus(0.5 * (1 - (s + pad) / w), 0.56);
      this.viewSize = Math.min(w - s - pad, h);
      this.hud.el.style.right = `${s + pad}px`;
    } else {
      const s = Math.min(w - 2 * pad, h * (extra ? 0.37 : 0.44));
      this.map.layout((w - s) / 2, h - s - pad - safeB - extra, s);
      this.hud.el.style.right = '';
      const top = 118 + this.ctx.safeTop();
      const free = h - s - pad - safeB - extra - top;
      this.press.setFocus(0.5, (top + free * 0.5) / h);
      this.viewSize = Math.min(w, free);
    }
    this.frame();
  }

  // Distance that fits a sphere of the given radius in the free part of the screen.
  frame(radius = this.radius ?? 10) {
    const { camera, cssH } = this.press;
    const px = this.viewSize ?? 300;
    const need = radius / Math.tan((camera.fov * DEG) / 2);
    this.rig.distTarget = Math.max(16, (need * cssH) / px);
  }

  steer(phi, psi) {
    const c = this.config;
    let p = wrapDeg(phi);
    let q = wrapDeg(psi);
    this.map.reveal(p, q);
    this.goal = this.applyWells(p, q);
    this.map.setCursor(p, q);
    this.dirty = true;
    this.onSteer?.(p, q);
    if (c.hinge) this.ctx.sound.tick(0.03);
  }

  applyWells(p, q) {
    for (const w of this.config.wells ?? []) {
      const d = Math.hypot(wrapDeg(p - w.phi), wrapDeg(q - w.psi));
      if (d < w.r) return [w.phi, w.psi];
    }
    return [p, q];
  }

  smoothAngles(dt) {
    const k = 1 - Math.exp(-dt * 14);
    let moved = false;
    for (let i = 0; i < this.n; i++) {
      const dp = wrapDeg(this.goal[0] - this.phi[i]);
      const dq = wrapDeg(this.goal[1] - this.psi[i]);
      if (Math.abs(dp) + Math.abs(dq) > 0.02) moved = true;
      // A little delay along the chain makes it feel like a chain.
      const lag = k * (1 - (0.35 * i) / this.n);
      this.phi[i] += dp * lag;
      this.psi[i] += dq * lag;
    }
    return moved;
  }

  build() {
    const built = buildChain(this.phi.map((x) => x * DEG), this.psi.map((x) => x * DEG));
    const pts = ALL_ATOMS(built);
    if (this.config.hinge) {
      // Pin the middle residue so that the two cards swing from it.
      const r = built.res[0];
      if (!this.frameRef) this.frameRef = [[-1.2, 0.3, 0.2], [0, 0, 0], [1.2, 0.6, 0.0]];
      const { cp, cq } = fitQuaternion([r.n, r.ca, r.c], this.frameRef, this.q);
      const v = new THREE.Vector3();
      moveChain(built, (p) => {
        v.set(p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]).applyQuaternion(this.q);
        return [v.x + cq[0], v.y + cq[1], v.z + cq[2]];
      });
    } else {
      if (this.prev) {
        const { cp, cq } = fitQuaternion(pts, this.prev, this.q);
        const v = new THREE.Vector3();
        moveChain(built, (p) => {
          v.set(p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]).applyQuaternion(this.q);
          return [v.x + cq[0], v.y + cq[1], v.z + cq[2]];
        });
      }
      const again = ALL_ATOMS(built);
      const c = [0, 0, 0];
      for (const p of again) for (let k = 0; k < 3; k++) c[k] += p[k] / again.length;
      moveChain(built, (p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
      this.prev = ALL_ATOMS(built).map((p) => [...p]);
    }
    return built;
  }

  draw(built) {
    this.cards.begin();
    this.cards.addChain(built);
    this.cards.commit();
    let r = 0;
    for (const p of ALL_ATOMS(built)) r = Math.max(r, Math.hypot(...p));
    this.radius = Math.max(this.config.minRadius ?? 8, r + 3);
    this.frame();
  }

  update(dt) {
    if (this.smoothAngles(dt) || this.dirty) {
      this.dirty = false;
      this.built = this.build();
      this.draw(this.built);
      this.afterBuild?.(this.built);
    }
    this.paintOverlay(dt);
  }

  paintOverlay(dt) {
    const { overlay: o } = this;
    this.burstClock += dt;
    const spin = Math.floor(this.burstClock * 10) * 0.35;
    for (const b of this.bursts ?? []) {
      const s = o.project(b.pos);
      o.burst(s.x, s.y, b.r ?? 16, spin);
    }
    const g = o.g;
    for (const h of this.hbDraw ?? []) {
      const a = o.project(h.a);
      const b = o.project(h.b);
      g.lineCap = 'round';
      g.setLineDash([]);
      g.lineWidth = 6;
      g.strokeStyle = '#ffffff';
      g.setLineDash([1, 8]);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.lineWidth = 3.5;
      g.strokeStyle = '#ff4a9e';
      g.stroke();
      g.setLineDash([]);
    }
  }

  stampIf(i, ok) {
    if (ok && !this.done[i]) {
      this.done[i] = true;
      this.ctx.earn(i);
      return true;
    }
    return false;
  }

  dispose() {
    this.cards.dispose();
    this.map.dispose();
    this.ctx.save.persistMap?.(this.map.visited);
  }
}

class Hinges extends ChainStage {
  constructor(ctx, stage) {
    super(ctx, stage, { residues: 1, start: [-20, -10], hinge: true, heavy: 0.46, hydrogen: 0.27, minRadius: 4.6, yaw: 0.2, pitch: 0.15 });
    this.stick = 0;
    ctx.hud.setGoal('Drag across the dark map. Atoms collide in the sea. Find the land.');
    this.seen = {};
  }

  // The two hinges are named on the model itself.
  paintOverlay(dt) {
    super.paintOverlay(dt);
    const b = this.built;
    if (!b) return;
    const r = b.res[0];
    const { overlay: o } = this;
    const tag = (p, q, text, fill, ink) => {
      const s = o.project(new THREE.Vector3((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2));
      const g = o.g;
      g.beginPath();
      g.arc(s.x, s.y, 13, 0, 7);
      g.fillStyle = fill;
      g.fill();
      g.fillStyle = ink;
      g.font = '800 17px Bricolage, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, s.x, s.y);
    };
    tag(r.n, r.ca, 'φ', '#ff4a9e', '#1f2aa6');
    tag(r.ca, r.c, 'ψ', '#1f2aa6', '#ffffff');
  }

  afterBuild(b) {
    const hits = clashesOf(this.phi[0] * DEG, this.psi[0] * DEG).filter((c) => c.hard);
    // clashesOf builds its own copy, so bursts are placed on atoms of the drawn chain by matching order.
    this.bursts = [];
    if (hits.length) {
      const local = buildChain([this.phi[0] * DEG], [this.psi[0] * DEG]);
      const r = local.res[0];
      const { cp, cq } = fitQuaternion([r.n, r.ca, r.c], this.frameRef, new THREE.Quaternion().copy(this.q));
      const v = new THREE.Vector3();
      for (const c of hits.slice(0, 3)) {
        const mid = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2];
        v.set(mid[0] - cp[0], mid[1] - cp[1], mid[2] - cp[2]).applyQuaternion(this.q);
        this.bursts.push({ pos: new THREE.Vector3(v.x + cq[0], v.y + cq[1], v.z + cq[2]), r: 15 + Math.max(0, 2.6 - c.d) * 10 });
      }
    }
    const hard = hits.length > 0;
    if (hard && !this.wasHard) {
      this.ctx.sound.bump();
      buzz(12);
    }
    if (!hard && this.wasHard) this.ctx.sound.pluck(this.ctx.sound.note(5), 0.1);
    this.wasHard = hard;
    this.map.el.classList.toggle('jolt', hard);
  }

  onSteer(p, q) {
    const near = (pl) => Math.hypot(wrapDeg(p - pl.phi), wrapDeg(q - pl.psi)) < pl.r;
    for (const k of ['alpha', 'beta', 'left']) {
      if (!this.seen[k] && near(PLACES[k]) && mapValue(p, q, 'A') > 0) {
        this.seen[k] = true;
        this.map.mark(PLACES[k]);
        this.ctx.sound.chord([5, 7, 9], 0.12);
        if (this.seen.alpha && !this.seen.beta) this.ctx.hud.setGoal('That is the α island. One more big island lies to the north west.');
        if (this.seen.beta && !this.seen.alpha) this.ctx.hud.setGoal('That is the β island. One more big island lies to the south.');
      }
    }
    if (this.stampIf(0, this.seen.alpha && this.seen.beta)) this.ctx.hud.setGoal(this.stage.goals[1] + ' (' + Math.round(this.map.coverage() * 100) + '%)');
    if (this.done[0] && !this.done[1]) this.ctx.hud.setGoal(`${this.stage.goals[1]}: ${Math.round(this.map.coverage() * 100)}% so far`);
    this.stampIf(1, this.map.coverage() >= 0.6);
    if (this.done[1] && !this.done[2]) this.ctx.hud.setGoal(this.stage.goals[2]);
    this.stampIf(2, this.seen.left);
    this.checkAll();
  }

  checkAll() {
    if (this.done[0]) this.ctx.hud.offerFinish();
    if (this.done.every(Boolean)) this.ctx.finishSoon(`Land covers only ${Math.round(landShare('A') * 100)}% of this map.`);
  }
}

class Coil extends ChainStage {
  constructor(ctx, stage) {
    super(ctx, stage, {
      residues: 12, start: [-125, 135], fog: true, known: ['alpha', 'beta'], minRadius: 11,
      wells: [
        { phi: -49, psi: -26, r: 9, name: 'three10' },
        { phi: -57, psi: -47, r: 15, name: 'alpha' },
        { phi: 57, psi: 47, r: 17, name: 'left' },
      ],
    });
    ctx.hud.setGoal('Steer the whole chain to the α island and let it coil.');
    this.state = '';
    this.zipT = 0;
  }

  afterBuild(b) {
    const stack = [{ o: b.cap.o0, n: [1e3, 0, 0], h: [1e3, 0, 1] }, ...b.res, { o: [1e3, 1e3, 0], n: b.cap.n, h: b.cap.h }];
    const bonds = hydrogenBonds(stack);
    const best = {};
    for (const h of bonds) best[h.gap] = (best[h.gap] ?? 0) + 1;
    const near = (x, y) => Math.abs(wrapDeg(this.phi[0] - x)) + Math.abs(wrapDeg(this.psi[0] - y)) < 6;
    const inAlpha = near(-57, -47);
    const in310 = near(-49, -26);
    const inLeft = near(57, 47);
    const live = inAlpha || in310 || inLeft ? bonds.filter((h) => h.gap === (in310 ? 3 : 4)) : [];
    this.hbDraw = live.map((h) => ({ a: new THREE.Vector3(...stack[h.i].o), b: new THREE.Vector3(...stack[h.j].n) }));
    const state = inAlpha ? 'alpha' : in310 ? 'three10' : inLeft ? 'left' : '';
    if (state && state !== this.state) {
      live.forEach((_, i) => setTimeout(() => this.ctx.sound.zip(i), i * 55));
      buzz(20);
      if (state === 'alpha') {
        this.map.mark(PLACES.alpha);
        if (this.stampIf(0, true)) this.ctx.hud.setGoal(`${live.length} bonds, each from residue i to i+4. Now find a tighter helix just east of here.`);
      } else if (state === 'three10') {
        this.map.mark(PLACES.three10);
        if (this.stampIf(1, true)) this.ctx.hud.setGoal('Bonds now reach i+3. Next, find the mirror image on the far side of the map.');
      } else {
        this.map.mark(PLACES.left);
        this.stampIf(2, true);
      }
      if (this.done[0]) this.ctx.hud.offerFinish();
      if (this.done.every(Boolean)) this.ctx.finishSoon('Left-handed helices exist, but they push every side chain into the backbone. Nearly all natural helices twist right.');
    }
    this.state = state;
  }
}

class Pleat extends ChainStage {
  constructor(ctx, stage) {
    super(ctx, stage, {
      residues: 6, chains: 3, start: [-57, -47], known: ['alpha', 'beta'], heavy: 0.36, hydrogen: 0.2, minRadius: 13, pitch: 0.75, yaw: 0.1,
      wells: [
        { phi: -75, psi: 145, r: 7, name: 'ppii' },
        { phi: -139, psi: 135, r: 18, name: 'beta' },
        { phi: 180, psi: 180, r: 14, name: 'straight' },
      ],
    });
    ctx.hud.setGoal('Steer to the β island until the three strands zip together.');
    this.arrangement = solveSheet();
  }

  build() {
    return buildChain(this.phi.map((x) => x * DEG), this.psi.map((x) => x * DEG));
  }

  draw(built) {
    const { placeCentre, placeLeft, placeRight } = sheetPlacers(built, this.arrangement);
    this.cards.begin();
    this.cards.addChain(built, placeCentre, 10);
    this.cards.addChain(built, placeLeft, 40);
    this.cards.addChain(built, placeRight, 70);
    this.cards.commit();
    this.placers = { placeCentre, placeLeft, placeRight };
    this.radius = 13;
    this.frame();
  }

  afterBuild(b) {
    const { placeCentre, placeLeft, placeRight } = this.placers;
    const makeRes = (fn) => b.res.map((r) => ({ o: fn(r.o), n: fn(r.n), h: fn(r.h) }));
    const M = makeRes(placeCentre);
    const L = makeRes(placeLeft);
    const R = makeRes(placeRight);
    const near = (x, y) => Math.abs(wrapDeg(this.phi[0] - x)) + Math.abs(wrapDeg(this.psi[0] - y)) < 6;
    const inBeta = near(-139, 135);
    this.hbDraw = [];
    if (inBeta) {
      for (const [A, B] of [[M, L], [L, M], [M, R], [R, M]])
        for (const h of hydrogenBonds(A, B, false)) this.hbDraw.push({ a: new THREE.Vector3(...A[h.i].o), b: new THREE.Vector3(...B[h.j].n) });
    }
    const state = inBeta ? 'beta' : near(-75, 145) ? 'ppii' : near(180, 180) ? 'straight' : '';
    if (state && state !== this.state) {
      if (state === 'beta') {
        this.hbDraw.forEach((_, i) => setTimeout(() => this.ctx.sound.zip(i), i * 45));
        buzz(20);
        this.map.mark(PLACES.beta);
        if (this.stampIf(0, true)) this.ctx.hud.setGoal('A sheet. Now find polyproline II, just east of the β island.');
      } else if (state === 'ppii') {
        this.ctx.sound.chord([5, 7], 0.12);
        this.map.mark(PLACES.ppii);
        if (this.stampIf(1, true)) this.ctx.hud.setGoal('No bonds, yet stretched: collagen is built this way. Now pull the chain straight, in the far corner.');
      } else {
        this.ctx.sound.chord([7, 9], 0.12);
        this.map.mark(PLACES.straight);
        this.stampIf(2, true);
      }
      if (this.done[0]) this.ctx.hud.offerFinish();
      if (this.done.every(Boolean)) this.ctx.finishSoon('At φ = ψ = 180° each residue adds 3.6 Å, the most a chain can reach. An α helix adds only 1.5 Å.');
    }
    this.state = state;
  }
}

// Works out once how three strands must sit so that the ladders of bonds line up at the ideal angles.
let sheetCache = null;
function strandFrame(res) {
  const a = res[0].ca;
  const b = res[res.length - 1].ca;
  const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const toY = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
  return { mid, toY };
}
function strandPlacer(res, spin, flip, x, y) {
  const { mid, toY } = strandFrame(res);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin).multiply(toY);
  if (flip) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
  const v = new THREE.Vector3();
  return (p) => {
    v.set(p[0] - mid.x, p[1] - mid.y, p[2] - mid.z).applyQuaternion(q);
    return [v.x + x, v.y + y, v.z];
  };
}
function solveSheet() {
  if (sheetCache) return sheetCache;
  const n = 6;
  const built = buildChain(new Array(n).fill(-139 * DEG), new Array(n).fill(135 * DEG));
  const res = built.res;
  const map = (fn) => res.map((r) => ({ o: fn(r.o), n: fn(r.n), h: fn(r.h) }));
  // Turn the centre strand so that its C=O bonds lie in the plane of the sheet.
  let spin0 = 0;
  let best = -1;
  for (let s = 0; s < 36; s++) {
    const f = strandPlacer(res, (s / 36) * Math.PI * 2, false, 0, 0);
    let score = 0;
    for (const r of res) {
      const o = f(r.o);
      const c = f(r.c);
      score += Math.abs(o[0] - c[0]) - Math.abs(o[2] - c[2]);
    }
    if (score > best) {
      best = score;
      spin0 = (s / 36) * Math.PI * 2;
    }
  }
  const centre = map(strandPlacer(res, spin0, false, 0, 0));
  const search = (side) => {
    let top = { c: -1 };
    for (let s = 0; s < 36; s++)
      for (let y = -3.6; y <= 3.6; y += 0.3) {
        const spin = (s / 36) * Math.PI * 2;
        const other = map(strandPlacer(res, spin, true, side * 4.8, y));
        const c = hydrogenBonds(centre, other, false).length + hydrogenBonds(other, centre, false).length;
        if (c > top.c) top = { c, spin, y };
      }
    return top;
  };
  sheetCache = { spin0, left: search(-1), right: search(1) };
  return sheetCache;
}
function sheetPlacers(built, a) {
  return {
    placeCentre: strandPlacer(built.res, a.spin0, false, 0, 0),
    placeLeft: strandPlacer(built.res, a.left.spin, true, -4.8, a.left.y),
    placeRight: strandPlacer(built.res, a.right.spin, true, 4.8, a.right.y),
  };
}

const STRAND = [-105, 100];
const TURNS = {
  one: { name: 'I′', a: [45, 43], b: [112, 10] },
  two: { name: 'II′', a: [45, -116], b: [-81, -7] },
};

class Hairpin extends ChainStage {
  constructor(ctx, stage) {
    super(ctx, stage, {
      residues: 12, start: STRAND, minRadius: 11, known: ['alpha', 'beta'], fog: false, pitch: 0.6, dockHeight: 112,
    });
    ctx.hud.setGoal('Set the two turn residues on the flags. Watch for clashes.');
    this.turn = [{ goal: [...STRAND], kind: 'A' }, { goal: [...STRAND], kind: 'A' }];
    this.active = 0;
    this.closed = {};
    this.buildDock();
    this.syncMap();
  }

  buildDock() {
    const dock = (this.dock = $('div', 'dock hairpin-dock'));
    this.turnButtons = [0, 1].map((i) => {
      const b = button('chip', `Turn ${i + 1}`, () => {
        this.active = i;
        this.syncMap();
      });
      return b;
    });
    this.kindButtons = [['A', 'Alanine'], ['G', 'Glycine'], ['P', 'Proline']].map(([k, label]) =>
      button('chip', label, () => {
        this.turn[this.active].kind = k;
        if (k === 'P') {
          this.turn[this.active].goal[0] = -63;
          this.triedPro = true;
        }
        this.ctx.sound.ratchet(0.12);
        this.syncMap();
        this.dirty = true;
      }),
    );
    const rowA = $('div', 'row');
    rowA.append(...this.turnButtons);
    const rowB = $('div', 'row');
    rowB.append(...this.kindButtons);
    dock.append(rowA, rowB);
    this.layer.append(dock);
  }

  syncMap() {
    const t = this.turn[this.active];
    this.turnButtons.forEach((b, i) => b.classList.toggle('on', i === this.active));
    this.kindButtons.forEach((b, i) => b.classList.toggle('on', 'AGP'[i] === t.kind));
    this.map.setKind(t.kind);
    this.map.locked = t.kind === 'P' ? -63 : null;
    const key = this.active ? 'b' : 'a';
    this.map.flags = Object.values(TURNS).map((x) => ({ phi: x[key][0], psi: x[key][1], label: x.name }));
    this.map.setCursor(t.goal[0], t.goal[1]);
  }

  steer(phi, psi) {
    const t = this.turn[this.active];
    let p = wrapDeg(phi);
    const q = wrapDeg(psi);
    if (t.kind === 'P') p = -63;
    const key = this.active ? 'b' : 'a';
    let g = [p, q];
    for (const x of Object.values(TURNS)) {
      if (Math.hypot(wrapDeg(p - x[key][0]), wrapDeg(q - x[key][1])) < 17 && t.kind !== 'P') g = [...x[key]];
    }
    t.goal = g;
    this.map.setCursor(p, q);
    this.dirty = true;
  }

  smoothAngles(dt) {
    const k = 1 - Math.exp(-dt * 12);
    let moved = false;
    for (const i of [5, 6]) {
      const t = this.turn[i - 5];
      const dp = wrapDeg(t.goal[0] - this.phi[i]);
      const dq = wrapDeg(t.goal[1] - this.psi[i]);
      if (Math.abs(dp) + Math.abs(dq) > 0.02) moved = true;
      this.phi[i] += dp * k;
      this.psi[i] += dq * k;
    }
    return moved;
  }

  build() {
    const kinds = Array(12).fill('A');
    kinds[5] = this.turn[0].kind;
    kinds[6] = this.turn[1].kind;
    const built = buildChain(this.phi.map((x) => x * DEG), this.psi.map((x) => x * DEG), kinds);
    const pts = ALL_ATOMS(built);
    if (this.prev) {
      const { cp, cq } = fitQuaternion(pts, this.prev, this.q);
      const v = new THREE.Vector3();
      moveChain(built, (p) => {
        v.set(p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]).applyQuaternion(this.q);
        return [v.x + cq[0], v.y + cq[1], v.z + cq[2]];
      });
    }
    const again = ALL_ATOMS(built);
    const c = [0, 0, 0];
    for (const p of again) for (let k = 0; k < 3; k++) c[k] += p[k] / again.length;
    moveChain(built, (p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    this.prev = ALL_ATOMS(built).map((p) => [...p]);
    return built;
  }

  afterBuild(b) {
    const hard = [5, 6].map((i, k) => mapValue(this.phi[i], this.psi[i], this.turn[k].kind) === 0);
    this.bursts = [];
    hard.forEach((h, k) => {
      if (h) this.bursts.push({ pos: new THREE.Vector3(...b.res[5 + k].ca), r: 18 });
    });
    const anyHard = hard.some(Boolean);
    if (anyHard && !this.wasHard) {
      this.ctx.sound.bump();
      buzz(12);
    }
    this.wasHard = anyHard;

    const close = (i, target) => Math.abs(wrapDeg(this.phi[i] - target[0])) + Math.abs(wrapDeg(this.psi[i] - target[1])) < 5;
    const which = Object.entries(TURNS).find(([, x]) => close(5, x.a) && close(6, x.b));
    let bonds = [];
    if (which) bonds = hydrogenBonds(b.res, b.res, true, 3).filter((h) => Math.abs(h.i + h.j - 11) <= 1);
    this.hbDraw = bonds.map((h) => ({ a: new THREE.Vector3(...b.res[h.i].o), b: new THREE.Vector3(...b.res[h.j].n) }));
    const key = which && !anyHard ? which[0] : '';
    if (key && key !== this.closedKey) {
      bonds.forEach((_, i) => setTimeout(() => this.ctx.sound.zip(i), i * 55));
      buzz(20);
      this.closed[key] = true;
      const count = Object.keys(this.closed).length;
      if (this.stampIf(0, true)) this.ctx.hud.setGoal('Closed, because glycine has no side chain to clash. Now close it with the other flags.');
      if (count === 2 && this.stampIf(1, true) && !this.done[2]) this.ctx.hud.setGoal('Two ways to turn. Now try proline in the turn.');
      this.ctx.hud.offerFinish();
    }
    if (which && anyHard && !this.hinted) {
      this.hinted = true;
      this.ctx.hud.setGoal('The hairpin fits, but a side chain clashes. Swap that residue for glycine.');
    }
    this.closedKey = key;
    if (this.triedPro && this.stampIf(2, true)) {
      if (this.done[0]) this.ctx.hud.setGoal('Proline’s ring pins φ at −63°, so it cannot reach either flag at Turn 1.');
    }
    if (this.done.every(Boolean)) this.ctx.finishSoon('Glycine turns the chain. Proline stiffens it. Most residues do neither.');
  }

  dispose() {
    super.dispose();
    this.dock.remove();
  }
}

export function startChain(ctx, stage) {
  const Cls = { hinges: Hinges, coil: Coil, pleat: Pleat, hairpin: Hairpin }[stage.id];
  return new Cls(ctx, stage);
}
