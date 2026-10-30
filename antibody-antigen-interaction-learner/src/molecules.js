// Builds the antibody from real coordinates and the fictional antigens procedurally.
import * as THREE from 'three';
import {IGG_META, IGG_ATOMS} from './data/igg.js';
import {RESIDUES, LOOPS} from './rules.js';
import {makeCloud} from './stage.js';

export const CLASS_COLOR = {pos: '#2F5BFF', neg: '#F2293C', arom: '#FFB300', oily: '#8A5A34', polar: '#10B56B', tiny: '#FFFFFF'};

const ANTIBODY_COLORS = ['#EEF4FF', '#FFE2C2', '#BDEBFF', '#FFB9A6']; // heavy, light, sugar, loops
const UNIT = 0.1; // scene units per ångström
const RADII = [1.75, 1.6, 1.55, 1.85];

const rgb = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

function decodeAtoms() {
  const bytes = Uint8Array.from(atob(IGG_ATOMS), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const groups = {};
  let offset = 0;
  for (const [name, count] of Object.entries(IGG_META.groups)) {
    const pos = new Float32Array(count * 3), el = new Uint8Array(count), role = new Uint8Array(count);
    for (let i = 0; i < count; i++, offset += 7) {
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = view.getInt16(offset + k * 2, true) / 50 * UNIT;
      const b = view.getUint8(offset + 6);
      el[i] = b & 7;
      role[i] = b >> 3;
    }
    groups[name] = {pos, el, role, count};
  }
  return groups;
}

export const ATOMS = decodeAtoms();

function cloudFromGroup(group, step = 1, radiusScale = 1) {
  const n = Math.ceil(group.count / step);
  const pos = new Float32Array(n * 3), rad = new Float32Array(n), col = new Float32Array(n * 3);
  for (let i = 0, j = 0; i < group.count; i += step, j++) {
    pos.set(group.pos.subarray(i * 3, i * 3 + 3), j * 3);
    rad[j] = RADII[group.el[i]] * UNIT * radiusScale;
    const c = rgb(ANTIBODY_COLORS[group.role[i]]);
    const v = group.el[i] === 0 ? 1 : 0.965;
    col.set([c[0] * v, c[1] * v, c[2] * v], j * 3);
  }
  return makeCloud(pos, rad, col);
}

// Each arm and the stem swing around the hinge, so they sit in pivot groups.
export function buildAntibody(step = 1, radiusScale = 1) {
  const root = new THREE.Group();
  const pivot = group => {
    const outer = new THREE.Group();
    outer.position.copy(HINGE);
    const inner = new THREE.Group();
    inner.position.copy(HINGE).negate();
    inner.add(cloudFromGroup(group, step, radiusScale));
    outer.add(inner);
    outer.host = inner;
    root.add(outer);
    return outer;
  };
  root.armA = pivot(ATOMS.fabA);
  root.armB = pivot(ATOMS.fabB);
  root.stem = pivot(ATOMS.fc);
  return root;
}

export function stemDirection() {
  const g = ATOMS.fc, c = new THREE.Vector3();
  for (let i = 0; i < g.count; i++) c.add(new THREE.Vector3(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]));
  return c.multiplyScalar(1 / g.count).sub(HINGE).normalize();
}

export const HINGE = new THREE.Vector3(...IGG_META.hinge).multiplyScalar(UNIT);
export const TIP_B = new THREE.Vector3(...IGG_META.tipB).multiplyScalar(UNIT);

export const LOOP_SITES = Object.fromEntries(LOOPS.map(l => {
  const info = IGG_META.loops[l];
  const v = a => new THREE.Vector3(...a).multiplyScalar(UNIT);
  const ca = v(info.ca);
  return [l, {ca, base: ca.clone().add(new THREE.Vector3(0.24, 0, 0)), hint: v(info.n).sub(ca)}];
}));

const SIDE_SCALE = 1.45;
const CHAIN_LENGTH = {0: 0.12, 1: 0.36, 2: 0.62, 3: 0.9};

// Places the real side-chain shape of a residue along `axis`, starting at the origin.
export function makeSidechain(aa, axis, hint) {
  const info = RESIDUES[aa];
  const template = IGG_META.templates[aa] || [];
  const e1 = axis.clone().normalize();
  const e2 = hint.clone().addScaledVector(e1, -hint.dot(e1)).normalize();
  const e3 = new THREE.Vector3().crossVectors(e1, e2);
  const n = template.length;
  const pos = new Float32Array(n * 3), rad = new Float32Array(n), col = new Float32Array(n * 3);
  const base = rgb(CLASS_COLOR[info.cls]);
  const p = new THREE.Vector3();
  template.forEach(([a, b, c, el], i) => {
    p.set(0, 0, 0).addScaledVector(e1, a).addScaledVector(e2, b).addScaledVector(e3, c).multiplyScalar(UNIT * SIDE_SCALE);
    pos.set([p.x, p.y, p.z], i * 3);
    rad[i] = RADII[el] * UNIT * 1.12;
    const v = el === 0 ? 1 : 1.12;
    col.set([Math.min(1, base[0] * v), Math.min(1, base[1] * v), Math.min(1, base[2] * v)], i * 3);
  });
  const mesh = makeCloud(pos, rad, col);
  mesh.tipLength = CHAIN_LENGTH[info.reach] * SIDE_SCALE;
  return mesh;
}

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

const FACE_X = 0.8;

// A fictional globular antigen, built from residue-sized clumps of atoms. Its contact
// face is carved by the antibody itself, so the footprint is a true imprint of the loops.
export function buildAntigen({seed, stretch, lumps}, palette, residues = 330) {
  const c1 = rgb(palette.antigen), c2 = rgb(palette.antigen2);
  const radius = 2.7;
  const cx = FACE_X + radius - 0.75;
  const near = [];
  const fab = ATOMS.fabA;
  for (let i = 0; i < fab.count; i++) if (fab.pos[i * 3] > -0.5) near.push(fab.pos[i * 3], fab.pos[i * 3 + 1], fab.pos[i * 3 + 2]);
  const blocked = (x, y, z) => {
    for (let i = 0; i < near.length; i += 3) {
      const dx = near[i] - x, dy = near[i + 1] - y, dz = near[i + 2] - z;
      if (dx * dx + dy * dy + dz * dz < 0.13) return true;
    }
    return false;
  };
  let random = seed * 9301 + 49297;
  const rand = () => { random = (random * 9301 + 49297) % 233280; return random / 233280; };
  const golden = Math.PI * (3 - Math.sqrt(5));
  const s = seed * 1.37;
  const list = [];
  const v = new THREE.Vector3();
  const place = (dir, depth, tone) => {
    const n = noise3(dir.x * 1.7 + s, dir.y * 1.7, dir.z * 1.7 - s) - 0.5;
    const fine = noise3(dir.x * 4.3 - s, dir.y * 4.3 + s, dir.z * 4.3) - 0.5;
    const len = radius * (1 + n * lumps * 2.6 + fine * lumps * 1.1) - depth;
    let x = cx + dir.x * len * stretch[0];
    const y = dir.y * len * stretch[1], z = dir.z * len * stretch[2];
    if (x < FACE_X + depth) x = FACE_X + depth + (noise3(y * 3, z * 3, s) - 0.5) * 0.14;
    const count = 6 + Math.floor(rand() * 5);
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(0.1 + rand() * 0.2);
      const ax = x + v.x, ay = y + v.y, az = z + v.z;
      if (blocked(ax, ay, az)) continue;
      const c = tone ? c2 : c1;
      const shade = 0.97 + rand() * 0.06;
      list.push([ax, ay, az, 0.16 + rand() * 0.03, c[0] * shade, c[1] * shade, c[2] * shade]);
    }
  };
  for (let i = 0; i < residues; i++) {
    const y = 1 - 2 * (i + 0.5) / residues;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    dir.add(new THREE.Vector3((rand() - 0.5) * 0.09, (rand() - 0.5) * 0.09, (rand() - 0.5) * 0.09)).normalize();
    place(dir, 0, noise3(dir.x * 2.4 + 7, dir.y * 2.4 + s, dir.z * 2.4) > 0.57);
    if (i % 2 === 0) place(dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.07), 0.3, false);
  }
  const n = list.length;
  const pos = new Float32Array(n * 3), rad = new Float32Array(n), col = new Float32Array(n * 3);
  list.forEach((a, i) => {
    pos.set(a.slice(0, 3), i * 3);
    rad[i] = a[3];
    col.set(a.slice(4), i * 3);
  });
  return makeCloud(pos, rad, col);
}

export const EPITOPE_SITES = Object.fromEntries(LOOPS.map(l => {
  const ca = LOOP_SITES[l].ca;
  return [l, new THREE.Vector3(FACE_X - 0.02, ca.y, ca.z)];
}));

// Faint proteins drifting in the distance, for the crowded look of the cell.
export function buildCrowd(count, color) {
  const root = new THREE.Group();
  const tint = rgb(color);
  const blob = [];
  for (let k = 0; k < 4; k++) {
    const n = 34 + k * 26;
    const pos = new Float32Array(n * 3), rad = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar((0.4 + Math.random() * 0.6) * (0.9 + k * 0.32));
      pos.set([v.x * (1 + k * 0.2), v.y, v.z], i * 3);
      rad[i] = 0.34 + Math.random() * 0.2;
      col.set(tint, i * 3);
    }
    blob.push({pos, rad, col});
  }
  for (let i = 0; i < count; i++) {
    let mesh;
    const roll = i % 5;
    if (roll === 0) {
      mesh = buildAntibody(7, 1.75);
      mesh.traverse(o => {
        if (o.isMesh) { o.material.uniforms.uTint.value.set(color); o.material.uniforms.uTintAmount.value = 0.9; }
      });
      mesh.scale.setScalar(0.9);
    } else {
      const b = blob[i % blob.length];
      mesh = makeCloud(b.pos, b.rad, b.col, {jitter: 0});
    }
    const angle = Math.random() * Math.PI * 2, spread = 8 + Math.random() * 26;
    mesh.position.set(Math.cos(angle) * spread * 1.5, Math.sin(angle) * spread, -6 - Math.random() * 42);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    mesh.userData.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.05);
    mesh.userData.drift = (Math.random() - 0.5) * 0.12;
    root.add(mesh);
  }
  root.setColor = hex => {
    root.children.forEach(m => m.traverse(o => {
      if (o.isMesh) { o.material.uniforms.uTint.value.set(hex); o.material.uniforms.uTintAmount.value = 0.95; }
    }));
  };
  root.setColor(color);
  root.tick = dt => {
    for (const m of root.children) {
      m.rotation.x += m.userData.spin.x * dt;
      m.rotation.y += m.userData.spin.y * dt;
      m.rotation.z += m.userData.spin.z * dt;
      m.position.x += m.userData.drift * dt;
      if (m.position.x > 46) m.position.x = -46;
      if (m.position.x < -46) m.position.x = 46;
    }
  };
  return root;
}
