// Things in the cell: the crowd, the ribosome, mRNA, tRNA, and amino acid models.
import * as THREE from 'three';
import { crowdMaterial, dabMaterial, gouache, PAPER } from './render.js';
import { STRUCTURES } from './data/structures.js';

const hex = (s) => new THREE.Color(s);
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const ballCache = {};
function ball(detail) {
  if (!ballCache[detail]) ballCache[detail] = new THREE.IcosahedronGeometry(1, detail).attributes.position.array;
  return ballCache[detail];
}

// Collects spheres and sticks into one mesh, which keeps draw calls low on phones.
export class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; }

  sphere(x, y, z, r, color, detail = 2) {
    const u = ball(detail);
    for (let i = 0; i < u.length; i += 3) {
      this.p.push(x + u[i] * r, y + u[i + 1] * r, z + u[i + 2] * r);
      this.n.push(u[i], u[i + 1], u[i + 2]);
      this.c.push(color.r, color.g, color.b);
    }
  }

  stick(a, b, r, color, sides = 7) {
    const ax = new THREE.Vector3().subVectors(b, a).normalize();
    const e1 = new THREE.Vector3(Math.abs(ax.y) < 0.9 ? 0 : 1, Math.abs(ax.y) < 0.9 ? 1 : 0, 0).cross(ax).normalize();
    const e2 = new THREE.Vector3().crossVectors(ax, e1);
    const ring = (k) => {
      const t = (k / sides) * Math.PI * 2;
      return new THREE.Vector3().addScaledVector(e1, Math.cos(t)).addScaledVector(e2, Math.sin(t));
    };
    for (let k = 0; k < sides; k++) {
      const n0 = ring(k), n1 = ring(k + 1);
      const v = [[a, n0], [b, n0], [b, n1], [a, n0], [b, n1], [a, n1]];
      for (const [o, nn] of v) {
        this.p.push(o.x + nn.x * r, o.y + nn.y * r, o.z + nn.z * r);
        this.n.push(nn.x, nn.y, nn.z);
        this.c.push(color.r, color.g, color.b);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/* ---------- Amino acid models ---------- */

const ATOM = {
  C: hex('#3a4676'), N: hex('#2a66e8'), O: hex('#e6432c'), S: hex('#f2b411'),
  Cb: hex('#b5bcd0'), Nb: hex('#a8bff0'), Ob: hex('#f1b6a8'),
  stick: hex('#55618c'), stickB: hex('#c9cedc'),
};

const moleculeCache = {};

// One molecule in Å. Backbone is pale so the eye goes to the side chain.
export function moleculeGeometry(code) {
  if (moleculeCache[code]) return moleculeCache[code];
  const { atoms, bonds } = STRUCTURES.aminoAcids[code];
  const pts = atoms.map((a) => new THREE.Vector3(a[1], a[2], a[3]));
  const center = new THREE.Vector3();
  const box = new THREE.Box3().setFromPoints(pts);
  box.getCenter(center);
  pts.forEach((p) => p.sub(center));
  const radius = Math.max(...pts.map((p) => p.length()));
  const b = new Builder();
  bonds.forEach(([i, j, order]) => {
    const isSide = atoms[i][4] || atoms[j][4];
    const col = isSide ? ATOM.stick : ATOM.stickB;
    const r = isSide ? 0.17 : 0.1;
    if (order === 2) {
      const dir = new THREE.Vector3().subVectors(pts[j], pts[i]);
      const off = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.2);
      b.stick(pts[i].clone().add(off), pts[j].clone().add(off), r * 0.75, col);
      b.stick(pts[i].clone().sub(off), pts[j].clone().sub(off), r * 0.75, col);
    } else {
      b.stick(pts[i], pts[j], order === 1.5 ? r * 1.25 : r, col);
    }
  });
  atoms.forEach((a, i) => {
    const isSide = a[4];
    const el = a[0];
    const color = isSide ? ATOM[el] : ATOM[`${el}b`];
    const r = isSide ? (el === 'C' ? 0.42 : el === 'S' ? 0.62 : 0.5) : 0.27;
    b.sphere(pts[i].x, pts[i].y, pts[i].z, r, color, 2);
  });
  moleculeCache[code] = { geometry: b.build(), radius };
  return moleculeCache[code];
}

const moleculeMat = () => gouache({ vertexColors: true, gloss: 0.55, edge: 0.8 });
let sharedMolMat;
export function moleculeMesh(code) {
  sharedMolMat ||= moleculeMat();
  const { geometry, radius } = moleculeGeometry(code);
  const mesh = new THREE.Mesh(geometry, sharedMolMat);
  mesh.userData.radius = radius;
  return mesh;
}

export function dabMesh(color = PAPER) {
  return new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dabMaterial(color));
}

/* ---------- tRNA ---------- */

let trnaGeometry;
export function trnaMesh() {
  if (!trnaGeometry) {
    const b = new Builder();
    const body = hex('#f08fae'), tip = hex('#f2b632'), end = hex('#d9487a');
    const chainPts = [
      [0.8, 1.15, 0], [0.45, 1.1, 0.03], [0.08, 1.06, 0], [-0.3, 1.0, -0.03], [-0.62, 0.86, 0],
      [-0.72, 0.5, 0.03], [-0.58, 0.14, 0], [-0.4, -0.22, -0.03], [-0.24, -0.58, 0], [-0.1, -0.9, 0.02],
    ];
    chainPts.forEach(([x, y, z], i) => {
      b.sphere(x, y, z, i === 0 ? 0.3 : 0.32, i === 0 ? end : body, 1);
      b.sphere(x + 0.1, y + 0.08, z + 0.2, 0.2, body, 1);
    });
    b.sphere(-0.16, -1.08, 0.08, 0.26, tip, 1);
    b.sphere(0.12, -1.04, 0.08, 0.26, tip, 1);
    trnaGeometry = b.build();
  }
  return new THREE.Mesh(trnaGeometry, gouache({ vertexColors: true, edge: 1 }));
}

/* ---------- Ribosome ---------- */

function lumps(b, rng, n, c, r, colorFor, avoid) {
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const ring = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const k = 0.72 + rng() * 0.3;
    const p = [c[0] + Math.cos(a) * ring * r[0] * k, c[1] + y * r[1] * k, c[2] + Math.sin(a) * ring * r[2] * k];
    if (avoid(p)) continue;
    b.sphere(p[0], p[1], p[2], 0.62 + rng() * 0.32, colorFor(p, rng), 2);
  }
}

export function makeRibosome() {
  const rng = seeded(4242);
  // An open window in the front, so the tRNAs at work stay in view.
  const pocket = (p) => Math.abs(p[0]) < 2.75 && p[1] > -0.4 && p[1] < 2.25 && p[2] > -1.35;
  const big = new Builder();
  const small = new Builder();
  const paint = (a, b) => (p, r) => hex(r() < 0.3 ? b : a);
  lumps(big, rng, 210, [0, 1.75, 0], [3.5, 2.05, 2.5], paint('#c9396f', '#df6191'), pocket);
  lumps(big, rng, 120, [0, 1.0, -2.2], [3.2, 1.7, 0.7], paint('#8f2a5c', '#a8306a'), () => false);
  lumps(small, rng, 130, [0, -1.15, 0.2], [3.0, 1.05, 2.2], paint('#f09a9a', '#f5b6a6'), () => false);
  const mat = gouache({ vertexColors: true, edge: 1 });
  const bigMesh = new THREE.Mesh(big.build(), mat);
  const smallMesh = new THREE.Mesh(small.build(), mat);
  const group = new THREE.Group();
  group.add(bigMesh, smallMesh);
  return { group, big: bigMesh, small: smallMesh };
}

/* ---------- mRNA ---------- */

const BASE = { A: hex('#ef8a4c'), U: hex('#f6d774'), G: hex('#e9a02a'), C: hex('#f4bc4e') };
export const NT = 0.42; // distance between nucleotides

export class Messenger {
  constructor(scene) {
    const slots = 110;
    const bead = new THREE.IcosahedronGeometry(0.17, 1);
    const peg = new THREE.CapsuleGeometry(0.1, 0.34, 2, 6);
    this.beads = new THREE.InstancedMesh(bead, gouache({ tint: '#e39a1f' }), slots);
    this.pegs = new THREE.InstancedMesh(peg, gouache({}), slots);
    this.beads.frustumCulled = this.pegs.frustumCulled = false;
    this.slots = slots;
    this.head = 0;
    this.seq = 'AUG';
    this.reading = 0;
    this.y = 0;
    this.dummy = new THREE.Object3D();
    const white = new THREE.Color('#fff');
    for (let i = 0; i < slots; i++) this.pegs.setColorAt(i, white);
    scene.add(this.beads, this.pegs);
  }

  set(seq) {
    this.seq = seq;
    this.painted = -1;
  }

  // head is the nucleotide index sitting under the A site.
  update(time, sitesX) {
    const { dummy, slots, head, seq } = this;
    const whole = Math.floor(head);
    const first = whole - Math.floor(slots / 2);
    for (let i = 0; i < slots; i++) {
      const index = first + i;
      const x = sitesX + (index - head) * NT;
      const wave = Math.sin(x * 0.7 + time * 0.8) * 0.09 + Math.sin(x * 0.27 - time * 0.5) * 0.13;
      const reading = index >= this.reading && index < this.reading + 3;
      const y = this.y + wave;
      dummy.position.set(x, y, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.beads.setMatrixAt(i, dummy.matrix);
      dummy.position.y = y + 0.32 + (reading ? 0.12 : 0);
      dummy.scale.setScalar(reading ? 1.22 : 1);
      dummy.updateMatrix();
      this.pegs.setMatrixAt(i, dummy.matrix);
      if (whole !== this.painted) {
        const ch = seq[index] ?? 'AUGC'[(index * 7 + 1000 * 4) % 4];
        this.pegs.setColorAt(i, BASE[ch]);
      }
    }
    this.painted = whole;
    this.beads.instanceMatrix.needsUpdate = true;
    this.pegs.instanceMatrix.needsUpdate = true;
    this.pegs.instanceColor.needsUpdate = true;
  }

  show(on) { this.beads.visible = this.pegs.visible = on; }
}

/* ---------- The crowd ---------- */

function globule(b, rng, n, spread, color, detail) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const p = [(rng() - 0.5) * spread, (rng() - 0.5) * spread, (rng() - 0.5) * spread];
    c.push(p);
    b.sphere(p[0], p[1], p[2], 0.55 + rng() * 0.45, color, detail);
  }
}

const SPECIES = [
  { n: 520, size: [0.55, 1.2], shape: (b, r, c, d) => globule(b, r, 10, 2.2, c, d) },
  { n: 420, size: [0.45, 0.85], shape: (b, r, c, d) => { globule(b, r, 5, 1.2, c, d); b.sphere(1.3, 0.2, 0, 0.8, c, d); } },
  {
    n: 150, size: [0.75, 1.4], shape: (b, r, c, d) => {
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          b.sphere(Math.cos(a) * 1.5, k * 1.1 - 0.55, Math.sin(a) * 1.5, 0.58, c, d);
        }
      }
    },
  },
  {
    n: 260, size: [0.55, 1.0], shape: (b, r, c, d) => {
      for (let i = 0; i < 6; i++) b.sphere(i * 0.55, 0, 0, 0.42, c, d);
      for (let i = 1; i < 6; i++) b.sphere(0, i * 0.55, 0, 0.42, c, d);
    },
  },
  { n: 800, size: [0.3, 0.6], shape: (b, r, c, d) => globule(b, r, 3, 1.0, c, d) },
  {
    n: 40, size: [0.7, 1.1], shape: (b, r, c, d) => {
      for (let i = 0; i < 44; i++) {
        const a = i * 0.9, x = (i - 22) * 0.62;
        b.sphere(x, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.5, c, d);
      }
    },
  },
];

export class Crowd {
  // detail 0 keeps the whole crowd near 200k triangles on phones.
  constructor(scene, detail = 1) {
    this.material = crowdMaterial();
    this.meshes = SPECIES.map((sp, s) => {
      const rng = seeded(1000 + s * 77);
      const b = new Builder();
      sp.shape(b, rng, new THREE.Color('#fff'), detail);
      const base = b.build();
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', base.attributes.position);
      g.setAttribute('normal', base.attributes.normal);
      const pos = new Float32Array(sp.n * 3), axis = new Float32Array(sp.n * 4), size = new Float32Array(sp.n);
      for (let i = 0; i < sp.n; i++) {
        // Square root keeps the widening view evenly filled.
        const depth = Math.sqrt(rng());
        const z = -12 - 92 * depth;
        pos[i * 3] = (rng() - 0.5) * 170;
        pos[i * 3 + 1] = (rng() - 0.5) * (46 + 40 * depth);
        pos[i * 3 + 2] = z;
        const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        axis.set([v.x, v.y, v.z, rng() * 6.28], i * 4);
        size[i] = sp.size[0] + rng() * (sp.size[1] - sp.size[0]);
      }
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
      g.setAttribute('aAxis', new THREE.InstancedBufferAttribute(axis, 4));
      g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
      g.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(sp.n * 3), 3));
      g.instanceCount = sp.n;
      const mesh = new THREE.Mesh(g, this.material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });
  }

  palette(colors, seed = 9) {
    const rng = seeded(seed);
    const tmp = new THREE.Color();
    this.meshes.forEach((mesh, s) => {
      const attr = mesh.geometry.attributes.aColor;
      const home = colors[s % colors.length];
      for (let i = 0; i < attr.count; i++) {
        tmp.set(rng() < 0.65 ? home : colors[Math.floor(rng() * colors.length)]);
        const v = 0.94 + rng() * 0.12;
        attr.setXYZ(i, tmp.r * v, tmp.g * v, tmp.b * v);
      }
      attr.needsUpdate = true;
    });
  }

  quality(q) {
    SPECIES.forEach((sp, s) => { this.meshes[s].geometry.instanceCount = Math.round(sp.n * q); });
  }
}
