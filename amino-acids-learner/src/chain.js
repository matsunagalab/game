// The polypeptide. It trails from the ribosome as a floppy rope, then folds onto the
// real alpha-carbon coordinates. Side chains ride on each residue's local frame, so once
// the rope reaches the native trace every atom lands exactly where the PDB file has it.
import * as THREE from 'three';
import { gouache } from './render.js';
import { STRUCTURES } from './data/structures.js';
import { AA, FAMILIES } from './data/amino.js';

const BEAD = 3.8; // Å between alpha carbons; one chain unit
const RINGS = 6; // ribbon cross-sections per residue
const SIDES = 8;

const CPK = { N: new THREE.Color('#2a66e8'), O: new THREE.Color('#e6432c'), S: new THREE.Color('#f2b411') };
const SS_YELLOW = new THREE.Color('#f2b411');
// The ribbon runs through these colours from its first residue to its last.
const RUN = ['#f2b632', '#ef8560', '#e0507f', '#a956c4', '#4f6fdc'].map((c) => new THREE.Color(c));

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Orthonormal frame at b from neighbours a and c, written into out[0..8].
function frame(pos, ia, ib, ic, out, hint) {
  const ax = pos[ic * 3] - pos[ia * 3], ay = pos[ic * 3 + 1] - pos[ia * 3 + 1], az = pos[ic * 3 + 2] - pos[ia * 3 + 2];
  const tl = Math.hypot(ax, ay, az) || 1;
  const tx = ax / tl, ty = ay / tl, tz = az / tl;
  const ux = pos[ib * 3] - pos[ia * 3], uy = pos[ib * 3 + 1] - pos[ia * 3 + 1], uz = pos[ib * 3 + 2] - pos[ia * 3 + 2];
  const vx = pos[ic * 3] - pos[ib * 3], vy = pos[ic * 3 + 1] - pos[ib * 3 + 1], vz = pos[ic * 3 + 2] - pos[ib * 3 + 2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-3) {
    nx = hint ? hint[3] : 0; ny = hint ? hint[4] : 1; nz = hint ? hint[5] : 0;
  } else { nx /= nl; ny /= nl; nz /= nl; }
  const d = nx * tx + ny * ty + nz * tz;
  nx -= d * tx; ny -= d * ty; nz -= d * tz;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  out[0] = tx; out[1] = ty; out[2] = tz;
  out[3] = nx; out[4] = ny; out[5] = nz;
  out[6] = ty * nz - tz * ny; out[7] = tz * nx - tx * nz; out[8] = tx * ny - ty * nx;
}

export class Chain {
  constructor(seq, proteinId = null, { painted = 1 } = {}) {
    const data = proteinId ? STRUCTURES.proteins[proteinId] : null;
    this.seq = seq;
    this.n = seq.length;
    this.data = data;
    this.count = 0;
    this.fold = 0;
    this.cartoon = 0;
    const n = this.n;
    this.p = new Float32Array(n * 3);
    this.q = new Float32Array(n * 3);
    this.native = data ? new Float32Array(n * 3) : null;
    this.ss = new Uint8Array(n);
    this.breaks = new Set(data ? data.breaks : []);
    this.frames = new Float32Array(n * 9);
    this.group = new THREE.Group();

    this.sideAtoms = [];
    this.sideBonds = [];
    this.residueAtomStart = new Int32Array(n + 1);
    const f = new Float32Array(9);
    if (data) {
      data.residues.forEach((r, i) => this.native.set(r.ca.map((v) => v / BEAD), i * 3));
      for (let i = 0; i < n; i++) this.ss[i] = +data.ss[i];
    }
    for (let i = 0; i < n; i++) {
      this.residueAtomStart[i] = this.sideAtoms.length;
      const fam = FAMILIES[AA[seq[i]].family];
      const carbon = new THREE.Color(fam.color);
      if (data) {
        const r = data.residues[i];
        const c = Math.min(n - 2, Math.max(1, i));
        frame(this.native, c - 1, c, c + 1, f);
        const start = this.sideAtoms.length;
        r.atoms.forEach(([el, x, y, z]) => {
          const dx = x / BEAD - this.native[i * 3], dy = y / BEAD - this.native[i * 3 + 1], dz = z / BEAD - this.native[i * 3 + 2];
          this.sideAtoms.push({
            res: i, lx: dx * f[0] + dy * f[1] + dz * f[2], ly: dx * f[3] + dy * f[4] + dz * f[5], lz: dx * f[6] + dy * f[7] + dz * f[8],
            color: CPK[el] || carbon, r: el === 'C' ? 0.17 : 0.2,
          });
        });
        r.bonds.forEach(([a, b]) => {
          this.sideBonds.push({ res: i, a: a === 0 ? -1 : start + a - 1, b: b === 0 ? -1 : start + b - 1 });
        });
      } else {
        // Practice chains have no PDB entry, so side chains come from the free amino acid.
        const { atoms, bonds } = STRUCTURES.aminoAcids[seq[i]];
        const map = new Map();
        atoms.forEach((a, k) => {
          if (!a[4]) return;
          map.set(k, this.sideAtoms.length);
          this.sideAtoms.push({ res: i, lx: a[3] / BEAD, ly: a[2] / BEAD, lz: a[1] / BEAD, color: CPK[a[0]] || carbon, r: a[0] === 'C' ? 0.17 : 0.2 });
        });
        bonds.forEach(([a, b]) => {
          const ia = a === 1 ? -1 : map.get(a), ib = b === 1 ? -1 : map.get(b);
          if (ia !== undefined && ib !== undefined) this.sideBonds.push({ res: i, a: ia, b: ib });
        });
      }
    }
    this.residueAtomStart[n] = this.sideAtoms.length;

    this.disulfides = [];
    if (data) {
      for (const [ri, ai, rj, aj] of data.ssbonds) {
        this.disulfides.push([this.residueAtomStart[ri] + ai - 1, this.residueAtomStart[rj] + aj - 1]);
      }
    }

    // Contacts in the folded state drive folding, near neighbours in the sequence first.
    this.contacts = [];
    if (data) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 3; j < n; j++) {
          const d = Math.hypot(this.native[i * 3] - this.native[j * 3], this.native[i * 3 + 1] - this.native[j * 3 + 1], this.native[i * 3 + 2] - this.native[j * 3 + 2]);
          if (d < 2.6) this.contacts.push({ i, j, d, on: 0.05 + 0.5 * Math.min(1, (j - i) / 30) });
        }
      }
    }

    this.buildMeshes(painted);
  }

  buildMeshes(painted) {
    const n = this.n;
    const verts = (n - 1) * RINGS + 1;
    this.rings = verts;
    const positions = new Float32Array(verts * SIDES * 3);
    const normals = new Float32Array(verts * SIDES * 3);
    const colors = new Float32Array(verts * SIDES * 3);
    const index = new Uint32Array((verts - 1) * SIDES * 6);
    let k = 0;
    for (let r = 0; r < verts - 1; r++) {
      for (let s = 0; s < SIDES; s++) {
        const a = r * SIDES + s, b = r * SIDES + (s + 1) % SIDES, c = a + SIDES, d = b + SIDES;
        index[k++] = a; index[k++] = b; index[k++] = c;
        index[k++] = b; index[k++] = d; index[k++] = c;
      }
    }
    const tint = new THREE.Color();
    for (let i = 0; i < verts; i++) {
      const k = i / Math.max(1, verts - 1) * (RUN.length - 1);
      const a = Math.min(RUN.length - 2, Math.floor(k));
      tint.copy(RUN[a]).lerp(RUN[a + 1], k - a);
      for (let s = 0; s < SIDES; s++) colors.set([tint.r, tint.g, tint.b], (i * SIDES + s) * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    this.ribbon = new THREE.Mesh(g, gouache({ vertexColors: true, painted, edge: 0.9, gloss: 0.1 }));
    this.ribbon.frustumCulled = false;

    const atoms = this.sideAtoms.length, bonds = this.sideBonds.length + this.disulfides.length;
    const ballGeo = new THREE.IcosahedronGeometry(1, 2);
    const stickGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.balls = new THREE.InstancedMesh(ballGeo, gouache({ painted, gloss: 0.45, edge: 0.8 }), Math.max(1, atoms));
    this.sticks = new THREE.InstancedMesh(stickGeo, gouache({ painted, edge: 0.7 }), Math.max(1, bonds));
    this.balls.frustumCulled = this.sticks.frustumCulled = false;
    this.sideAtoms.forEach((a, i) => this.balls.setColorAt(i, a.color));
    const family = (res) => new THREE.Color(FAMILIES[AA[this.seq[res]].family].color);
    this.sideBonds.forEach((b, i) => this.sticks.setColorAt(i, family(b.res)));
    for (let i = this.sideBonds.length; i < bonds; i++) this.sticks.setColorAt(i, SS_YELLOW);
    this.atomWorld = new Float32Array(atoms * 3);
    this.group.add(this.ribbon, this.balls, this.sticks);
  }

  setPainted(on) {
    for (const m of [this.ribbon, this.balls, this.sticks]) m.material.uniforms.uFlag.value = on;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of [this.ribbon, this.balls, this.sticks]) { m.geometry.dispose(); m.material.dispose(); }
    this.balls.dispose();
    this.sticks.dispose();
  }

  /* ----- rope ----- */

  addResidue(ax, ay, az) {
    const i = this.count;
    this.p.set([ax, ay + (i ? 0.02 : 0), az], i * 3);
    this.q.set([ax, ay, az], i * 3);
    this.count += 1;
    this.anchor = [ax, ay, az];
  }

  // The chain leaves the ribosome upward and gathers loosely above it.
  stepRope(h, center, radius, anchor) {
    const { p, q, count } = this;
    if (!count) return;
    this.anchor = anchor;
    const wind = 2.6;
    for (let i = 0; i < count; i++) {
      const a = i * 3;
      const vx = (p[a] - q[a]) * 0.94, vy = (p[a + 1] - q[a + 1]) * 0.94, vz = (p[a + 2] - q[a + 2]) * 0.94;
      q[a] = p[a]; q[a + 1] = p[a + 1]; q[a + 2] = p[a + 2];
      let fx = (Math.random() - 0.5) * 14, fy = (Math.random() - 0.5) * 14 + wind, fz = (Math.random() - 0.5) * 14;
      const dx = p[a] - center[0], dy = p[a + 1] - center[1], dz = p[a + 2] - center[2];
      const r = Math.hypot(dx, dy, dz) || 1;
      if (r > radius) {
        const k = -22 * (r - radius) / r;
        fx += dx * k; fy += dy * k; fz += dz * k;
      }
      fz += -(p[a + 2] - center[2]) * 3;
      p[a] += vx + fx * h * h;
      p[a + 1] += vy + fy * h * h;
      p[a + 2] += vz + fz * h * h;
    }
    this.separate();
    for (let it = 0; it < 5; it++) {
      for (let i = 0; i < count - 1; i++) this.link(i, 1);
      const a = (count - 1) * 3;
      p[a] = anchor[0]; p[a + 1] = anchor[1]; p[a + 2] = anchor[2];
    }
  }

  // Keep beads from sitting on each other.
  separate() {
    const { p, count } = this;
    for (let i = 0; i < count; i++) {
      const ax = p[i * 3], ay = p[i * 3 + 1], az = p[i * 3 + 2];
      for (let j = i + 2; j < count; j++) {
        const dx = p[j * 3] - ax, dy = p[j * 3 + 1] - ay, dz = p[j * 3 + 2] - az;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1.2 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (1.1 - d) * 0.25 / d;
          if (push > 0) {
            p[i * 3] -= dx * push; p[i * 3 + 1] -= dy * push; p[i * 3 + 2] -= dz * push;
            p[j * 3] += dx * push; p[j * 3 + 1] += dy * push; p[j * 3 + 2] += dz * push;
          }
        }
      }
    }
  }

  link(i, rest) {
    if (this.fold > 0.85 && this.breaks.has(i + 1)) return;
    const { p } = this;
    const a = i * 3, b = a + 3;
    let dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
    let d = Math.hypot(dx, dy, dz);
    if (d < 1e-5) { dy = 1e-3; d = 1e-3; }
    const c = (d - rest) / d * 0.5;
    p[a] += dx * c; p[a + 1] += dy * c; p[a + 2] += dz * c;
    p[b] -= dx * c; p[b + 1] -= dy * c; p[b + 2] -= dz * c;
  }

  // Move the origin to the middle of the chain. Returns the shift in chain units.
  recenter() {
    const { p, q, count } = this;
    const c = [0, 0, 0];
    for (let i = 0; i < count; i++) { c[0] += p[i * 3]; c[1] += p[i * 3 + 1]; c[2] += p[i * 3 + 2]; }
    c[0] /= count; c[1] /= count; c[2] /= count;
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) { p[i * 3 + k] -= c[k]; q[i * 3 + k] -= c[k]; }
    }
    return c;
  }

  // f runs from 0 to 1 as the player holds. Helices form first, then the whole chain packs.
  stepFold(h, f) {
    const { p, q, count, native, contacts } = this;
    this.fold = f;
    const heat = 0.05 * (1 - smooth(0, 0.9, f)) + 0.0018;
    for (let i = 0; i < count; i++) {
      const a = i * 3;
      const vx = (p[a] - q[a]) * 0.86, vy = (p[a + 1] - q[a + 1]) * 0.86, vz = (p[a + 2] - q[a + 2]) * 0.86;
      q[a] = p[a]; q[a + 1] = p[a + 1]; q[a + 2] = p[a + 2];
      p[a] += vx + (Math.random() - 0.5) * heat;
      p[a + 1] += vy + (Math.random() - 0.5) * heat;
      p[a + 2] += vz + (Math.random() - 0.5) * heat;
    }
    for (const c of contacts) {
      if (f < c.on) continue;
      const k = Math.min(1, (f - c.on) / 0.25) * 0.05;
      const dx = p[c.j * 3] - p[c.i * 3], dy = p[c.j * 3 + 1] - p[c.i * 3 + 1], dz = p[c.j * 3 + 2] - p[c.i * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 1;
      const m = (d - c.d) / d * k;
      p[c.i * 3] += dx * m; p[c.i * 3 + 1] += dy * m; p[c.i * 3 + 2] += dz * m;
      p[c.j * 3] -= dx * m; p[c.j * 3 + 1] -= dy * m; p[c.j * 3 + 2] -= dz * m;
    }
    for (let it = 0; it < 4; it++) for (let i = 0; i < count - 1; i++) this.link(i, 1);
    const pull = smooth(0.55, 1, f) ** 2 * 0.3;
    if (pull > 0) {
      for (let i = 0; i < count * 3; i++) p[i] += (native[i] - p[i]) * pull;
    }
  }

  snapNative() {
    this.p.set(this.native);
    this.q.set(this.native);
    this.count = this.n;
    this.fold = 1;
    this.cartoon = 1;
  }

  /* ----- drawing ----- */

  draw() {
    const { count, p, frames } = this;
    if (count < 1) {
      this.ribbon.visible = this.balls.visible = this.sticks.visible = false;
      return;
    }
    this.ribbon.visible = this.balls.visible = this.sticks.visible = true;
    for (let i = 0; i < count; i++) {
      const c = Math.min(count - 2, Math.max(1, i));
      if (count >= 3) {
        const hint = i > 0 ? frames.subarray((i - 1) * 9, i * 9) : null;
        frame(p, c - 1, c, c + 1, frames.subarray(i * 9, i * 9 + 9), hint);
      } else {
        frames.set([1, 0, 0, 0, 1, 0, 0, 0, 1], i * 9);
      }
    }
    this.drawRibbon();
    this.drawSides();
  }

  drawRibbon() {
    const { count, p, frames, ss, ribbon, cartoon, breaks } = this;
    const pos = ribbon.geometry.attributes.position.array;
    const nor = ribbon.geometry.attributes.normal.array;
    const last = count - 1;
    // Strands zigzag through their alpha carbons. Smooth them so arrows lie flat.
    if (!this.ribbonP) this.ribbonP = new Float32Array(this.n * 3);
    const rp = this.ribbonP;
    for (let i = 0; i <= last; i++) {
      const on = ss[i] === 2 && i > 0 && i < last ? cartoon * 0.5 : 0;
      for (let k = 0; k < 3; k++) {
        rp[i * 3 + k] = on ? p[i * 3 + k] * (1 - on) + (p[(i - 1) * 3 + k] + p[(i + 1) * 3 + k]) * 0.5 * on : p[i * 3 + k];
      }
    }
    const px = (i, k) => rp[Math.max(0, Math.min(last, i)) * 3 + k];
    // Normal carried along the chain, flipped when needed so it never twists by 180°.
    if (!this.smoothN || this.smoothN.length !== this.n * 3) this.smoothN = new Float32Array(this.n * 3);
    const N = this.smoothN;
    for (let i = 0; i < count; i++) {
      let x = frames[i * 9 + 3], y = frames[i * 9 + 4], z = frames[i * 9 + 5];
      if (i > 0 && x * N[(i - 1) * 3] + y * N[(i - 1) * 3 + 1] + z * N[(i - 1) * 3 + 2] < 0) { x = -x; y = -y; z = -z; }
      N[i * 3] = x; N[i * 3 + 1] = y; N[i * 3 + 2] = z;
    }
    const rings = last * RINGS + 1;
    for (let r = 0; r < rings; r++) {
      const s = r / RINGS;
      const i = Math.min(last - 1, Math.floor(s)), t = s - i;
      if (last < 1) break;
      const t2 = t * t, t3 = t2 * t;
      const c0 = -0.5 * t3 + t2 - 0.5 * t, c1 = 1.5 * t3 - 2.5 * t2 + 1, c2 = -1.5 * t3 + 2 * t2 + 0.5 * t, c3 = 0.5 * t3 - 0.5 * t2;
      const d0 = -1.5 * t2 + 2 * t - 0.5, d1 = 4.5 * t2 - 5 * t, d2 = -4.5 * t2 + 4 * t + 0.5, d3 = 1.5 * t2 - t;
      const x = c0 * px(i - 1, 0) + c1 * px(i, 0) + c2 * px(i + 1, 0) + c3 * px(i + 2, 0);
      const y = c0 * px(i - 1, 1) + c1 * px(i, 1) + c2 * px(i + 1, 1) + c3 * px(i + 2, 1);
      const z = c0 * px(i - 1, 2) + c1 * px(i, 2) + c2 * px(i + 1, 2) + c3 * px(i + 2, 2);
      let tx = d0 * px(i - 1, 0) + d1 * px(i, 0) + d2 * px(i + 1, 0) + d3 * px(i + 2, 0);
      let ty = d0 * px(i - 1, 1) + d1 * px(i, 1) + d2 * px(i + 1, 1) + d3 * px(i + 2, 1);
      let tz = d0 * px(i - 1, 2) + d1 * px(i, 2) + d2 * px(i + 1, 2) + d3 * px(i + 2, 2);
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let nx = N[i * 3] * (1 - t) + N[(i + 1) * 3] * t, ny = N[i * 3 + 1] * (1 - t) + N[(i + 1) * 3 + 1] * t, nz = N[i * 3 + 2] * (1 - t) + N[(i + 1) * 3 + 2] * t;
      const dn = nx * tx + ny * ty + nz * tz;
      nx -= dn * tx; ny -= dn * ty; nz -= dn * tz;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;

      const res = Math.round(s);
      const kind = ss[res];
      let w = 0.26, h = 0.26;
      if (kind === 1) { w = 0.6; h = 0.13; } else if (kind === 2) {
        w = 0.58; h = 0.13;
        if (res + 1 < this.n && ss[res + 1] !== 2) w = Math.max(0.05, 1.0 * (1 - Math.min(1, Math.max(0, s - res + 0.5))));
      }
      w = 0.26 + (w - 0.26) * cartoon;
      h = 0.26 + (h - 0.26) * cartoon;
      if (breaks.has(i + 1) && this.fold > 0.85) {
        const gap = Math.max(0.02, 1 - Math.sin(t * Math.PI));
        w *= gap; h *= gap;
      }
      for (let k = 0; k < SIDES; k++) {
        const a = (k / SIDES) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const o = (r * SIDES + k) * 3;
        pos[o] = x + nx * ca * w + bx * sa * h;
        pos[o + 1] = y + ny * ca * w + by * sa * h;
        pos[o + 2] = z + nz * ca * w + bz * sa * h;
        const ex = nx * ca / w + bx * sa / h, ey = ny * ca / w + by * sa / h, ez = nz * ca / w + bz * sa / h;
        const el = Math.hypot(ex, ey, ez) || 1;
        nor[o] = ex / el; nor[o + 1] = ey / el; nor[o + 2] = ez / el;
      }
    }
    ribbon.geometry.setDrawRange(0, Math.max(0, rings - 1) * SIDES * 6);
    ribbon.geometry.attributes.position.needsUpdate = true;
    ribbon.geometry.attributes.normal.needsUpdate = true;
  }

  drawSides() {
    const { p, frames, sideAtoms, sideBonds, atomWorld, residueAtomStart, count, balls, sticks } = this;
    const shown = residueAtomStart[count];
    const ib = balls.instanceMatrix.array;
    const fade = 1 - this.cartoon * 0.5;
    for (let i = 0; i < shown; i++) {
      const a = sideAtoms[i];
      const ar = a.r * fade;
      const f = a.res * 9, c = a.res * 3;
      const x = p[c] + a.lx * frames[f] + a.ly * frames[f + 3] + a.lz * frames[f + 6];
      const y = p[c + 1] + a.lx * frames[f + 1] + a.ly * frames[f + 4] + a.lz * frames[f + 7];
      const z = p[c + 2] + a.lx * frames[f + 2] + a.ly * frames[f + 5] + a.lz * frames[f + 8];
      atomWorld[i * 3] = x; atomWorld[i * 3 + 1] = y; atomWorld[i * 3 + 2] = z;
      const o = i * 16;
      ib[o] = ar; ib[o + 1] = 0; ib[o + 2] = 0; ib[o + 3] = 0;
      ib[o + 4] = 0; ib[o + 5] = ar; ib[o + 6] = 0; ib[o + 7] = 0;
      ib[o + 8] = 0; ib[o + 9] = 0; ib[o + 10] = ar; ib[o + 11] = 0;
      ib[o + 12] = x; ib[o + 13] = y; ib[o + 14] = z; ib[o + 15] = 1;
    }
    balls.count = shown;
    balls.instanceMatrix.needsUpdate = true;
    if (balls.instanceColor) balls.instanceColor.needsUpdate = false;

    const sb = sticks.instanceMatrix.array;
    let drawn = 0;
    const put = (ax, ay, az, bx, by, bz, r) => {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const len = Math.hypot(dx, dy, dz) || 1e-3;
      dx /= len; dy /= len; dz /= len;
      // Basis with the cylinder's Y along the bond.
      const sx = Math.abs(dy) < 0.9 ? dz : -dy, sy = Math.abs(dy) < 0.9 ? 0 : dx, sz = Math.abs(dy) < 0.9 ? -dx : 0;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const ux = sx / sl, uy = sy / sl, uz = sz / sl;
      const wx = uy * dz - uz * dy, wy = uz * dx - ux * dz, wz = ux * dy - uy * dx;
      const o = drawn * 16;
      sb[o] = ux * r; sb[o + 1] = uy * r; sb[o + 2] = uz * r; sb[o + 3] = 0;
      sb[o + 4] = dx * len; sb[o + 5] = dy * len; sb[o + 6] = dz * len; sb[o + 7] = 0;
      sb[o + 8] = wx * r; sb[o + 9] = wy * r; sb[o + 10] = wz * r; sb[o + 11] = 0;
      sb[o + 12] = (ax + bx) / 2; sb[o + 13] = (ay + by) / 2; sb[o + 14] = (az + bz) / 2; sb[o + 15] = 1;
      drawn += 1;
    };
    for (let i = 0; i < sideBonds.length; i++) {
      const s = sideBonds[i];
      if (s.res >= count) { drawn = i; break; }
      const ax = s.a < 0 ? p[s.res * 3] : atomWorld[s.a * 3], ay = s.a < 0 ? p[s.res * 3 + 1] : atomWorld[s.a * 3 + 1], az = s.a < 0 ? p[s.res * 3 + 2] : atomWorld[s.a * 3 + 2];
      const bx = s.b < 0 ? p[s.res * 3] : atomWorld[s.b * 3], by = s.b < 0 ? p[s.res * 3 + 1] : atomWorld[s.b * 3 + 1], bz = s.b < 0 ? p[s.res * 3 + 2] : atomWorld[s.b * 3 + 2];
      put(ax, ay, az, bx, by, bz, 0.075 * fade);
    }
    if (this.fold > 0.9 && count === this.n) {
      drawn = sideBonds.length;
      for (const [a, b] of this.disulfides) {
        put(atomWorld[a * 3], atomWorld[a * 3 + 1], atomWorld[a * 3 + 2], atomWorld[b * 3], atomWorld[b * 3 + 1], atomWorld[b * 3 + 2], 0.13);
      }
    }
    sticks.count = drawn;
    sticks.instanceMatrix.needsUpdate = true;
  }
}
