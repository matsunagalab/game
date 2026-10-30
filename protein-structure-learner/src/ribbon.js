// Ribbon diagrams and space-filling atoms, written for the press: they output ink amounts and an object id.
import * as THREE from '../vendor/three/three.module.js';
import { SHADE_GLSL } from './press.js';

const shared = { uShade: { value: 0.42 } };

const MESH_VS = /* glsl */ `
in vec3 aInk;
in float aId;
out vec3 vN;
out vec3 vInk;
flat out float vId;
void main() {
  mat4 mv = modelViewMatrix;
  mat3 nm = normalMatrix;
#ifdef USE_INSTANCING
  mv = modelViewMatrix * instanceMatrix;
  nm = mat3(mv);
#endif
  vN = normalize(nm * normal);
  vInk = aInk;
  vId = aId;
  gl_Position = projectionMatrix * mv * vec4(position, 1.0);
}`;

const MESH_FS = /* glsl */ `
precision highp float;
in vec3 vN;
in vec3 vInk;
flat in float vId;
out vec4 fragColor;
${SHADE_GLSL}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  fragColor = vec4(printTone(vInk, n), vId / 255.0);
}`;

export function inkMaterial(options = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: MESH_VS,
    fragmentShader: MESH_FS,
    uniforms: { ...shared },
    side: options.side ?? THREE.FrontSide,
  });
}

const smooth = (t) => t * t * (3 - 2 * t);

// A ribbon through one or more chains. Rebuilt in place whenever the coordinates change.
export class Ribbon {
  // ss: string of H, E, C. chainEnds: indices after which the chain breaks.
  constructor(ss, chainEnds = [], { perResidue = 6, radial = 10, helixWidth = 1.55, strandWidth = 1.5, coil = 0.34, thickness = 0.36 } = {}) {
    this.ss = ss;
    this.n = ss.length;
    this.perResidue = perResidue;
    this.radial = radial;
    this.helixWidth = helixWidth;
    this.strandWidth = strandWidth;
    this.coil = coil;
    this.thickness = thickness;
    const ends = [...new Set([...chainEnds, this.n - 1])].sort((a, b) => a - b);
    this.segments = [];
    let start = 0;
    for (const e of ends) {
      if (e >= start) this.segments.push([start, e]);
      start = e + 1;
    }
    let rings = 0;
    for (const [a, b] of this.segments) rings += (b - a + 1) * perResidue + 1;
    this.rings = rings;
    const verts = rings * radial;
    this.position = new Float32Array(verts * 3);
    this.normal = new Float32Array(verts * 3);
    this.ink = new Float32Array(verts * 3);
    this.id = new Float32Array(verts);
    this.ringResidue = new Int32Array(rings);
    const index = [];
    let ring = 0;
    for (const [a, b] of this.segments) {
      const count = (b - a + 1) * perResidue + 1;
      for (let r = 0; r < count - 1; r++) {
        for (let k = 0; k < radial; k++) {
          const k2 = (k + 1) % radial;
          const p0 = (ring + r) * radial + k;
          const p1 = (ring + r) * radial + k2;
          const p2 = (ring + r + 1) * radial + k;
          const p3 = (ring + r + 1) * radial + k2;
          index.push(p0, p2, p1, p1, p2, p3);
        }
      }
      for (let r = 0; r < count; r++) this.ringResidue[ring + r] = Math.min(b, a + Math.floor(r / perResidue));
      ring += count;
    }
    const g = (this.geometry = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.normal, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInk', new THREE.BufferAttribute(this.ink, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aId', new THREE.BufferAttribute(this.id, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(index);
    this.mesh = new THREE.Mesh(g, inkMaterial());
    this.mesh.frustumCulled = false;

    this.px = new Float32Array((this.n + 2) * 3);
    this.sx = new Float32Array((this.n + 2) * 3);
    this.prevSide = new Float32Array((this.n + 2) * 3);
  }

  // ca, o: flat coordinate arrays, 3 values per residue.
  setCoords(ca, o) {
    let vertex = 0;
    for (const [a, b] of this.segments) vertex = this.buildSegment(ca, o, a, b, vertex);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }

  buildSegment(ca, o, a, b, vStart) {
    const n = b - a + 1;
    const pts = new Float32Array((n + 1) * 3);
    const sides = new Float32Array((n + 1) * 3);
    const v = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
    const ss = this.ss;
    // Control points sit between residues; the first and last sit on the end residues.
    for (let i = 0; i <= n; i++) {
      const ra = a + Math.max(0, i - 1);
      const rb = a + Math.min(n - 1, i);
      const P = v(ca, ra);
      const Q = v(ca, rb);
      pts[i * 3] = (P[0] + Q[0]) / 2;
      pts[i * 3 + 1] = (P[1] + Q[1]) / 2;
      pts[i * 3 + 2] = (P[2] + Q[2]) / 2;
    }
    let last = null;
    for (let i = 0; i <= n; i++) {
      const r = a + Math.min(n - 1, i);
      const next = Math.min(b, r + 1);
      const prev = next === r ? r - 1 : r;
      const P = v(ca, prev);
      const Q = v(ca, next);
      const O = v(o, prev);
      const A = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
      let D;
      if (ss[r] === 'H' && r > a && r < b) {
        // On a helix the broad face looks outward, so the band wraps the cylinder cleanly.
        const before = v(ca, r - 1);
        const here = v(ca, r);
        const after = v(ca, r + 1);
        const out = [2 * here[0] - before[0] - after[0], 2 * here[1] - before[1] - after[1], 2 * here[2] - before[2] - after[2]];
        const T = [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
        D = [T[1] * out[2] - T[2] * out[1], T[2] * out[0] - T[0] * out[2], T[0] * out[1] - T[1] * out[0]];
      } else {
        const B = [O[0] - P[0], O[1] - P[1], O[2] - P[2]];
        const C = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
        D = [C[1] * A[2] - C[2] * A[1], C[2] * A[0] - C[0] * A[2], C[0] * A[1] - C[1] * A[0]];
      }
      const l = Math.hypot(...D) || 1;
      D = [D[0] / l, D[1] / l, D[2] / l];
      if (last && D[0] * last[0] + D[1] * last[1] + D[2] * last[2] < 0) D = [-D[0], -D[1], -D[2]];
      last = D;
      sides.set(D, i * 3);
    }
    // Pleats are smoothed out of strands; helices are pushed out to the true radius.
    const copy = pts.slice();
    for (let i = 1; i < n; i++) {
      const r = a + i;
      if (ss[r] === 'E' && ss[r - 1] === 'E') {
        for (let k = 0; k < 3; k++) pts[i * 3 + k] = (copy[(i - 1) * 3 + k] + 2 * copy[i * 3 + k] + copy[(i + 1) * 3 + k]) / 4;
      } else if (ss[r] === 'H' && ss[r - 1] === 'H') {
        const out = [0, 1, 2].map((k) => 2 * copy[i * 3 + k] - copy[(i - 1) * 3 + k] - copy[(i + 1) * 3 + k]);
        const l = Math.hypot(...out) || 1;
        for (let k = 0; k < 3; k++) pts[i * 3 + k] += (out[k] / l) * 0.45;
      }
    }

    const { perResidue, radial } = this;
    const count = n * perResidue + 1;
    let vtx = vStart;
    const cr = (p0, p1, p2, p3, t) =>
      0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    const posAt = (u, out) => {
      const seg = Math.min(n - 1, Math.floor(u));
      const t = u - seg;
      const i0 = Math.max(0, seg - 1);
      const i1 = seg;
      const i2 = seg + 1;
      const i3 = Math.min(n, seg + 2);
      for (let k = 0; k < 3; k++) out[k] = cr(pts[i0 * 3 + k], pts[i1 * 3 + k], pts[i2 * 3 + k], pts[i3 * 3 + k], t);
    };
    const P = [0, 0, 0];
    const Pa = [0, 0, 0];
    const Pb = [0, 0, 0];
    for (let r = 0; r < count; r++) {
      const u = r / perResidue;
      posAt(u, P);
      posAt(Math.max(0, u - 0.05), Pa);
      posAt(Math.min(n, u + 0.05), Pb);
      let tx = Pb[0] - Pa[0];
      let ty = Pb[1] - Pa[1];
      let tz = Pb[2] - Pa[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const seg = Math.min(n - 1, Math.floor(u));
      const f = smooth(u - seg);
      let sx = sides[seg * 3] * (1 - f) + sides[seg * 3 + 3] * f;
      let sy = sides[seg * 3 + 1] * (1 - f) + sides[seg * 3 + 4] * f;
      let sz = sides[seg * 3 + 2] * (1 - f) + sides[seg * 3 + 5] * f;
      const d = sx * tx + sy * ty + sz * tz;
      sx -= d * tx;
      sy -= d * ty;
      sz -= d * tz;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl;
      sy /= sl;
      sz /= sl;
      const nx = ty * sz - tz * sy;
      const ny = tz * sx - tx * sz;
      const nz = tx * sy - ty * sx;

      const res = a + seg;
      const [w, h] = this.profile(res, u - seg, a, b, r === 0 || r === count - 1);
      for (let k = 0; k < radial; k++) {
        const th = (k / radial) * Math.PI * 2;
        const c = Math.cos(th);
        const s = Math.sin(th);
        const ex = Math.sign(c) * Math.abs(c) ** 0.55;
        const ey = Math.sign(s) * Math.abs(s) ** 0.55;
        const x = ex * w;
        const y = ey * h;
        const pos = this.position;
        pos[vtx * 3] = P[0] + sx * x + nx * y;
        pos[vtx * 3 + 1] = P[1] + sy * x + ny * y;
        pos[vtx * 3 + 2] = P[2] + sz * x + nz * y;
        let mx = (Math.sign(c) * Math.abs(c) ** 1.45) / Math.max(w, 0.05);
        let my = (Math.sign(s) * Math.abs(s) ** 1.45) / Math.max(h, 0.05);
        const ml = Math.hypot(mx, my) || 1;
        mx /= ml;
        my /= ml;
        const nrm = this.normal;
        nrm[vtx * 3] = sx * mx + nx * my;
        nrm[vtx * 3 + 1] = sy * mx + ny * my;
        nrm[vtx * 3 + 2] = sz * mx + nz * my;
        vtx++;
      }
    }
    return vtx;
  }

  profile(res, f, first, last, isEnd) {
    if (isEnd) return [0.02, 0.02];
    const ss = this.ss;
    const kind = ss[res];
    const before = res > first ? ss[res - 1] : 'C';
    const after = res < last ? ss[res + 1] : 'C';
    const widthOf = (k) => (k === 'H' ? this.helixWidth : k === 'E' ? this.strandWidth : this.coil);
    const t = this.thickness;
    if (kind === 'E' && after !== 'E') {
      // Arrow head on the last residue of a strand.
      const w = 2.5 * (1 - f) + this.coil * f;
      return [Math.max(this.coil, w), t + (this.coil - t) * f];
    }
    if (kind !== 'C' && before !== kind && f < 0.6) {
      const k = smooth(f / 0.6);
      return [this.coil + (widthOf(kind) - this.coil) * k, this.coil + (t - this.coil) * k];
    }
    if (kind === 'H' && after !== 'H' && f > 0.4) {
      const k = smooth((1 - f) / 0.6);
      return [this.coil + (widthOf(kind) - this.coil) * k, this.coil + (t - this.coil) * k];
    }
    return kind === 'C' ? [this.coil, this.coil] : [widthOf(kind), t];
  }

  // inkOf(residue) gives [pink, yellow, blue]; idOf(residue) gives a small integer.
  paint(inkOf, idOf) {
    const { radial, ringResidue, ink, id, rings } = this;
    let v = 0;
    for (let r = 0; r < rings; r++) {
      const res = ringResidue[r];
      const c = inkOf(res);
      const i = idOf(res);
      for (let k = 0; k < radial; k++) {
        ink[v * 3] = c[0];
        ink[v * 3 + 1] = c[1];
        ink[v * 3 + 2] = c[2];
        id[v] = i;
        v++;
      }
    }
    this.geometry.attributes.aInk.needsUpdate = true;
    this.geometry.attributes.aId.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}

const ATOM_VS = /* glsl */ `
in vec2 corner;
in vec4 iPos;
in vec3 iInk;
in float iId;
out vec3 vCenter;
out vec3 vRay;
out float vR;
out vec3 vInk;
flat out float vId;
void main() {
  vec4 c = modelViewMatrix * vec4(iPos.xyz, 1.0);
  float r = iPos.w;
  vec3 p = c.xyz + vec3(corner * r * 1.35, 0.0);
  vCenter = c.xyz;
  vRay = p;
  vR = r;
  vInk = iInk;
  vId = iId;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;

const ATOM_FS = /* glsl */ `
precision highp float;
in vec3 vCenter;
in vec3 vRay;
in float vR;
in vec3 vInk;
flat in float vId;
out vec4 fragColor;
uniform mat4 projectionMatrix;
${SHADE_GLSL}
void main() {
  vec3 dir = normalize(vRay);
  float b = dot(dir, vCenter);
  float h = b * b - dot(vCenter, vCenter) + vR * vR;
  if (h < 0.0) discard;
  float t = b - sqrt(h);
  vec3 hit = dir * t;
  vec3 n = (hit - vCenter) / vR;
  vec4 clip = projectionMatrix * vec4(hit, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  fragColor = vec4(printTone(vInk, n), vId / 255.0);
}`;

// Spheres drawn as flat cards that are solved per pixel, so a thousand atoms stay cheap on a phone.
export class Atoms {
  constructor(capacity) {
    this.capacity = capacity;
    this.count = 0;
    this.pos = new Float32Array(capacity * 4);
    this.ink = new Float32Array(capacity * 3);
    this.ids = new Float32Array(capacity);
    const g = (this.geometry = new THREE.InstancedBufferGeometry());
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iInk', new THREE.InstancedBufferAttribute(this.ink, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iId', new THREE.InstancedBufferAttribute(this.ids, 1).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: ATOM_VS,
      fragmentShader: ATOM_FS,
      uniforms: { ...shared },
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
  }

  set(i, x, y, z, r, ink, id) {
    const { pos, ids } = this;
    pos[i * 4] = x;
    pos[i * 4 + 1] = y;
    pos[i * 4 + 2] = z;
    pos[i * 4 + 3] = r;
    this.ink[i * 3] = ink[0];
    this.ink[i * 3 + 1] = ink[1];
    this.ink[i * 3 + 2] = ink[2];
    ids[i] = id;
  }

  commit(count) {
    this.count = count;
    const g = this.geometry;
    g.instanceCount = count;
    g.attributes.iPos.needsUpdate = true;
    g.attributes.iInk.needsUpdate = true;
    g.attributes.iId.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
