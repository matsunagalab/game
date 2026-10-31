// A patch is a region with a character. The brush sweeps a real surface, atom by atom, and the detector sings
// when it passes over the true interface, which was measured with Shrake-Rupley from the real complex.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER } from '../press.js';
import { Atoms } from '../ribbon.js';
import { protein, atomBytes, classOf, TONE } from '../proteins.js';
import { surfaceNonpolar } from '../science/patch.js';
import { buzz } from '../sound.js';
import { $, button, clamp, ease } from '../ui.js';

const BLANK = [0, 0, 0.13];
const REACH = 15; // angstroms: a brush this wide covers about one standard interface, per side

export const INK_OF = (p, atom) => {
  const aa = p.seq[p.atomRes[atom]];
  if (p.atomSide[atom] !== '1') return TONE.polar.map((v) => v * 0.6);
  return TONE[classOf(aa)];
};

// target: { protein, chain: index or null for a whole subunit, lost: base64 per atom, partner: { chain } or { op } }
// Non-polar share counts atoms, carbon and sulfur, and is always given beside the same share for the whole surface.
export function patchFacts(p, atoms, lost, free) {
  let area = 0;
  let nonpolar = 0;
  const seen = new Map();
  atoms.forEach((a, k) => {
    const l = lost[k];
    if (!l) return;
    area += l;
    if ('CS'.includes(p.atomEl[a])) nonpolar += l;
    const r = p.atomRes[a];
    seen.set(r, (seen.get(r) ?? 0) + l);
  });
  let plus = 0;
  let minus = 0;
  for (const [r, l] of seen) {
    if (l < 8) continue;
    if ('KR'.includes(p.seq[r])) plus++;
    if ('DE'.includes(p.seq[r])) minus++;
  }
  return { area, nonpolar: nonpolar / (area || 1), whole: surfaceNonpolar(p, atoms, free), plus, minus, residues: [...seen.values()].filter((l) => l >= 8).length };
}

export class Surface {
  constructor(ctx, stage, { onFound, paper = PAPER.yellow } = {}) {
    Object.assign(this, { ctx, stage, onFound });
    this.press = ctx.press;
    this.rig = ctx.rig;
    this.hud = ctx.hud;
    this.sound = ctx.sound;
    this.overlay = ctx.overlay;
    this.press.setPaper(paper);
    this.press.setFlood([0, 0, 0]);
    this.press.clearDisc();
    this.press.uniforms.uShadow.value = 0.14;
    this.rig.spin = 0;
    this.meter = $('div', 'fit detector');
    this.fill = $('i');
    this.label = $('span', '', 'Detector');
    this.meter.append(this.fill, this.label);
    ctx.layer.append(this.meter);
    this.shown = 0;
    this.touch = 0;
    this.ring = null;
    this.mode = 'sweep';
    this.sweptTotal = 0;
    this.bind();
    ctx.onLayout = () => this.layout();
  }

  load(t) {
    this.clear();
    const p = (this.p = protein(t.protein));
    this.t = t;
    const atoms = (this.atoms = []);
    for (let i = 0; i < p.atomEl.length; i++) if (t.chain === null || t.chain === undefined || p.chain[p.atomRes[i]] === t.chain) atoms.push(i);
    this.lost = atomBytes(t.lost);
    const free = p.freeArea;
    const n = atoms.length;
    const c = [0, 0, 0];
    for (const a of atoms) for (let k = 0; k < 3; k++) c[k] += p.atomXYZ[a * 3 + k] / n;
    this.c = c;
    this.xyz = new Float32Array(n * 3);
    let rad = 0;
    atoms.forEach((a, i) => {
      for (let k = 0; k < 3; k++) this.xyz[i * 3 + k] = p.atomXYZ[a * 3 + k] - c[k];
      rad = Math.max(rad, Math.hypot(this.xyz[i * 3], this.xyz[i * 3 + 1], this.xyz[i * 3 + 2]));
    });
    this.radius = rad + 3;
    this.free = Float32Array.from(atoms, (a) => free[a]);
    this.total = this.free.reduce((s, v) => s + v, 0);
    this.totalLost = this.lost.reduce((s, v) => s + v, 0);
    this.seen = new Uint8Array(n);
    this.mesh = new Atoms(n);
    this.press.scene.add(this.mesh.mesh);
    this.paintAll();
    // The best a brush could score here sets what counts as found: long thin interfaces never fill it.
    let best = 0;
    let at = 0;
    for (let c0 = 0; c0 < n; c0 += 6) {
      if (this.free[c0] <= 4) continue;
      const u = this.under(this.xyz[c0 * 3], this.xyz[c0 * 3 + 1], this.xyz[c0 * 3 + 2]);
      if (u > best) {
        best = u;
        at = c0;
      }
    }
    this.need = best * 0.72;
    // Start looking away from the patch, so that it has to be hunted.
    this.bestPoint = new THREE.Vector3(this.xyz[at * 3], this.xyz[at * 3 + 1], this.xyz[at * 3 + 2]);
    // Outward at the patch: away from the atoms packed around it, which on a lumpy chain is not simply radial.
    const round = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < n; i++) {
      const dx = this.xyz[i * 3] - this.bestPoint.x, dy = this.xyz[i * 3 + 1] - this.bestPoint.y, dz = this.xyz[i * 3 + 2] - this.bestPoint.z;
      if (dx * dx + dy * dy + dz * dz < 100) {
        round.add(new THREE.Vector3(dx, dy, dz));
        count++;
      }
    }
    const away = round.divideScalar(count || 1).negate().normalize();
    this.patchDir = away.clone();
    this.rig.target.set(0, 0, 0);
    this.rig.targetGoal.set(0, 0, 0);
    this.rig.yaw = Math.atan2(-away.x, -away.z) + 0.9;
    this.rig.pitch = 0.2;
    this.mode = 'sweep';
    this.shown = 0;
    this.ring = null;
    this.layout();
    this.rig.dist = this.rig.distTarget;
    this.fits();
  }

  // Fraction of the interface under a brush centred here.
  under(x, y, z) {
    let s = 0;
    const R2 = REACH * REACH;
    const { xyz, lost } = this;
    for (let i = 0; i < lost.length; i++) {
      if (!lost[i]) continue;
      const dx = xyz[i * 3] - x, dy = xyz[i * 3 + 1] - y, dz = xyz[i * 3 + 2] - z;
      if (dx * dx + dy * dy + dz * dz < R2) s += lost[i];
    }
    return s / this.totalLost;
  }

  fits() {
    this.fill.style.transform = 'scaleX(0)';
    this.label.textContent = 'Detector';
  }

  paintAll() {
    const { mesh, p, atoms, xyz, seen } = this;
    atoms.forEach((a, i) => {
      const ink = this.inkOf(a, i, seen[i]);
      mesh.set(i, xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2], 1.75, ink, 1 + (p.atomRes[a] % 250));
    });
    mesh.commit(atoms.length);
  }

  inkOf(a, i, seen) {
    if (this.mode === 'found' || this.mode === 'read') {
      const on = this.lost[i] > 0;
      const base = INK_OF(this.p, a);
      return on ? base : [base[0] * 0.18, base[1] * 0.18, 0.06 + base[2] * 0.1];
    }
    return seen ? INK_OF(this.p, a) : BLANK;
  }

  layout() {
    const { cssW: w, cssH: h } = this.press;
    const landscape = w > h * 1.15;
    const top = 112 + this.ctx.safeTop();
    const dock = this.dock ? this.dock.getBoundingClientRect().height + 8 : 0;
    const bottom = 70 + dock + this.ctx.safeBottom();
    const free = h - top - bottom;
    this.press.setFocus(0.5, (top + free / 2) / h);
    this.viewPx = landscape ? Math.min(w * 0.7, free) : Math.min(w, free);
    const fov = this.press.camera.fov;
    this.rig.distTarget = ((this.radius / Math.tan((fov * Math.PI) / 360)) * h) / this.viewPx;
    if (this.dock) this.dock.style.bottom = `${64 + this.ctx.safeBottom()}px`;
  }

  // Closest atom under the finger, as a point in the model.
  hit(x, y) {
    const cam = this.press.camera;
    const o = cam.position;
    const ndc = new THREE.Vector3((x / this.press.cssW) * 2 - 1, -(y / this.press.cssH) * 2 + 1, 0.5).unproject(cam);
    const d = ndc.sub(o).normalize();
    const { xyz } = this;
    let best = 1e9;
    for (let i = 0; i < this.seen.length; i++) {
      const lx = xyz[i * 3] - o.x, ly = xyz[i * 3 + 1] - o.y, lz = xyz[i * 3 + 2] - o.z;
      const b = lx * d.x + ly * d.y + lz * d.z;
      const q = lx * lx + ly * ly + lz * lz - b * b;
      if (q < 3.06 && b < best) best = b;
    }
    if (best > 1e8) return null;
    return new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best);
  }

  bind() {
    const el = this.press.canvas;
    this.down = (e) => {
      if (this.mode !== 'sweep') return;
      const h = this.hit(e.clientX, e.clientY);
      if (!h) return; // off the protein, the finger turns it
      e.stopImmediatePropagation();
      this.rig.dragging = false;
      this.painting = true;
      el.setPointerCapture?.(e.pointerId);
      this.sweep(h);
    };
    this.move = (e) => {
      if (!this.painting) return;
      const h = this.hit(e.clientX, e.clientY);
      if (h) this.sweep(h);
    };
    this.up = () => {
      this.painting = false;
    };
    el.addEventListener('pointerdown', this.down, { capture: true });
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
  }

  sweep(h) {
    const { xyz, atoms, seen, mesh, p } = this;
    const R2 = 8 * 8; // the ink it lays down is narrower than the area it listens to
    let changed = false;
    for (let i = 0; i < seen.length; i++) {
      if (seen[i]) continue;
      const dx = xyz[i * 3] - h.x, dy = xyz[i * 3 + 1] - h.y, dz = xyz[i * 3 + 2] - h.z;
      if (dx * dx + dy * dy + dz * dz < R2) {
        seen[i] = 1;
        this.sweptNow = (this.sweptNow ?? 0) + this.free[i];
        mesh.set(i, xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2], 1.75, this.inkOf(atoms[i], i, 1), 1 + (p.atomRes[atoms[i]] % 250));
        changed = true;
      }
    }
    if (changed) mesh.commit(atoms.length);
    const v = this.under(h.x, h.y, h.z) / (this.need || 1);
    this.ring = h.clone();
    this.touch = v;
    const step = Math.floor(clamp(v, 0, 1) * 10);
    if (step !== this.lastStep) {
      if (step > 0) this.sound.pluck(this.sound.note(step + 2), 0.05 + step * 0.012, this.sound.t, 0.3);
      this.lastStep = step;
    }
    this.label.textContent = v >= 1 ? 'Patch!' : `Detector ${Math.round(clamp(v, 0, 1) * 100)}%`;
    if (v >= 1) this.found();
  }

  swept() {
    return (this.sweptNow ?? 0) / this.total;
  }

  found() {
    this.mode = 'found';
    this.painting = false;
    this.sound.clunk(0.34);
    this.sound.chord([5, 7, 9, 12], 0.12);
    buzz(24);
    this.paintAll();
    const f = patchFacts(this.p, this.atoms, this.lost, this.free);
    this.facts = f;
    this.onFound?.(f);
  }

  // The partner arrives, and the patch explains itself.
  bringPartner(onLanded) {
    const { p, t, c } = this;
    const list = [];
    if (t.partner.chain !== undefined) {
      for (let i = 0; i < p.atomEl.length; i++) if (p.chain[p.atomRes[i]] === t.partner.chain) list.push([p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2], i]);
    } else {
      const m = p.sym[t.partner.op];
      for (let i = 0; i < p.atomEl.length; i++) {
        const [x, y, z] = [p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2]];
        list.push([m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11], i]);
      }
    }
    const a = new Atoms(list.length);
    list.forEach((q, i) => a.set(i, q[0] - c[0], q[1] - c[1], q[2] - c[2], 1.75, [0, 0, 0.36], 1 + (p.atomRes[q[3]] % 250)));
    a.commit(list.length);
    this.press.scene.add(a.mesh);
    this.partner = a;
    this.landT = 0;
    this.onLanded = onLanded;
    const mid = new THREE.Vector3();
    for (const q of list) mid.add(new THREE.Vector3(q[0] - c[0], q[1] - c[1], q[2] - c[2]));
    this.startGap = mid.normalize().multiplyScalar(60);
    a.mesh.position.copy(this.startGap);
    this.rig.yaw = Math.atan2(mid.z, -mid.x);
    this.radius = this.radius * 1.5;
    this.layout();
  }

  update(dt) {
    const v = this.mode === 'sweep' ? this.touch : 1;
    this.shown += (clamp(v, 0, 1) - this.shown) * Math.min(1, dt * 12);
    this.fill.style.transform = `scaleX(${this.shown})`;
    if (this.mode === 'sweep' && this.ring && this.painting) {
      const s = this.overlay.project(this.ring);
      const r = (REACH * this.press.cssH) / (2 * Math.tan((this.press.camera.fov * Math.PI) / 360) * this.rig.dist);
      const g = this.overlay.g;
      g.beginPath();
      g.arc(s.x, s.y, r, 0, 7);
      g.lineWidth = 3;
      g.setLineDash([2, 7]);
      g.lineCap = 'round';
      g.strokeStyle = '#1f2aa6';
      g.stroke();
      g.setLineDash([]);
    }
    if (this.partner && this.landT < 1) {
      this.landT = Math.min(1, this.landT + dt / 0.75);
      this.partner.mesh.position.copy(this.startGap).multiplyScalar(1 - ease(this.landT));
      if (this.landT === 1) {
        this.sound.clunk(0.36);
        buzz(26);
        this.onLanded?.();
      }
    }
  }

  clear() {
    if (this.mesh) {
      this.press.scene.remove(this.mesh.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
    if (this.partner) {
      this.press.scene.remove(this.partner.mesh);
      this.partner.dispose();
      this.partner = null;
    }
  }

  chips(row) {
    this.dockGone();
    const dock = (this.dock = $('div', 'dock surf-dock'));
    const r = $('div', 'row');
    for (const [label, fn, cls] of row) r.append(button(cls ?? 'chip', label, fn));
    dock.append(r);
    this.ctx.layer.append(dock);
    this.layout();
  }

  dockGone() {
    this.dock?.remove();
    this.dock = null;
  }

  dispose() {
    this.clear();
    this.dockGone();
    this.meter.remove();
    const el = this.press.canvas;
    el.removeEventListener('pointerdown', this.down, { capture: true });
    el.removeEventListener('pointermove', this.move);
    el.removeEventListener('pointerup', this.up);
    el.removeEventListener('pointercancel', this.up);
    this.press.setFocus(0.5, 0.5, true);
  }
}
