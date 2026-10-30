// Ribbon diagrams built once from the trace, drawn as if between crossed polarizers.
// Every vertex knows its distance from the metal, so colour can flood outward from the site.
import * as THREE from 'three';
import { OPTICS_GLSL } from './optics.js';

const smooth = (t) => t * t * (3 - 2 * t);
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);

class Mesher {
  constructor(perResidue, radial) {
    this.perResidue = perResidue;
    this.radial = radial;
    this.position = [];
    this.normal = [];
    this.along = [];
    this.index = [];
    this.vertices = 0;
  }

  ring(P, S, N, w, h, along) {
    const { radial } = this;
    for (let k = 0; k < radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const x = Math.sign(c) * Math.abs(c) ** 0.55 * w;
      const y = Math.sign(s) * Math.abs(s) ** 0.55 * h;
      this.position.push(P[0] + S[0] * x + N[0] * y, P[1] + S[1] * x + N[1] * y, P[2] + S[2] * x + N[2] * y);
      let mx = (Math.sign(c) * Math.abs(c) ** 1.45) / Math.max(w, 0.05);
      let my = (Math.sign(s) * Math.abs(s) ** 1.45) / Math.max(h, 0.05);
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml;
      my /= ml;
      this.normal.push(S[0] * mx + N[0] * my, S[1] * mx + N[1] * my, S[2] * mx + N[2] * my);
      this.along.push(along);
    }
    this.vertices += radial;
  }

  stitch(rings) {
    const { radial } = this;
    const first = this.vertices - rings * radial;
    for (let r = 0; r < rings - 1; r++) {
      for (let k = 0; k < radial; k++) {
        const k2 = (k + 1) % radial;
        const a = first + r * radial + k;
        const b = first + r * radial + k2;
        const c = a + radial;
        const d = b + radial;
        this.index.push(a, b, c, b, d, c);
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    const position = new Float32Array(this.position);
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.normal), 3));
    g.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(this.along), 1));
    const dist = new Float32Array(position.length / 3);
    for (let i = 0; i < dist.length; i++) dist[i] = Math.hypot(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
    g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
    g.setIndex(this.vertices > 65000 ? new THREE.BufferAttribute(new Uint32Array(this.index), 1) : new THREE.BufferAttribute(new Uint16Array(this.index), 1));
    g.computeBoundingSphere();
    return g;
  }
}

function profile(ss, res, f, first, last, atEnd) {
  if (atEnd) return [0.02, 0.02];
  const coil = 0.26;
  const thick = 0.3;
  const kind = ss[res];
  const before = res > first ? ss[res - 1] : 'C';
  const after = res < last ? ss[res + 1] : 'C';
  const width = kind === 'H' ? 1.55 : kind === 'E' ? 1.5 : coil;
  if (kind === 'E' && after !== 'E') {
    const w = 2.5 * (1 - f) + coil * f;
    return [Math.max(coil, w), thick + (coil - thick) * f];
  }
  if (kind !== 'C' && before !== kind && f < 0.6) {
    const k = smooth(f / 0.6);
    return [coil + (width - coil) * k, coil + (thick - coil) * k];
  }
  if (kind === 'H' && after !== 'H' && f > 0.4) {
    const k = smooth((1 - f) / 0.6);
    return [coil + (width - coil) * k, coil + (thick - coil) * k];
  }
  return kind === 'C' ? [coil, coil] : [width, thick];
}

function addSegment(m, ca, o, ss, a, b, alongStart, alongTotal) {
  const n = b - a + 1;
  if (n < 2) return;
  const v = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  const pts = new Float32Array((n + 1) * 3);
  const sides = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const P = v(ca, a + Math.max(0, i - 1));
    const Q = v(ca, a + Math.min(n - 1, i));
    for (let k = 0; k < 3; k++) pts[i * 3 + k] = (P[k] + Q[k]) / 2;
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
  const { perResidue } = m;
  const count = n * perResidue + 1;
  const posAt = (u, out) => {
    const seg = Math.min(n - 1, Math.floor(u));
    const t = u - seg;
    const i0 = Math.max(0, seg - 1);
    const i2 = seg + 1;
    const i3 = Math.min(n, seg + 2);
    for (let k = 0; k < 3; k++) out[k] = cr(pts[i0 * 3 + k], pts[seg * 3 + k], pts[i2 * 3 + k], pts[i3 * 3 + k], t);
  };
  const P = [0, 0, 0];
  const Pa = [0, 0, 0];
  const Pb = [0, 0, 0];
  for (let r = 0; r < count; r++) {
    const u = r / perResidue;
    posAt(u, P);
    posAt(Math.max(0, u - 0.05), Pa);
    posAt(Math.min(n, u + 0.05), Pb);
    const T = [Pb[0] - Pa[0], Pb[1] - Pa[1], Pb[2] - Pa[2]];
    const tl = Math.hypot(...T) || 1;
    T[0] /= tl; T[1] /= tl; T[2] /= tl;
    const seg = Math.min(n - 1, Math.floor(u));
    const f = smooth(u - seg);
    const S = [0, 1, 2].map((k) => sides[seg * 3 + k] * (1 - f) + sides[seg * 3 + 3 + k] * f);
    const dot = S[0] * T[0] + S[1] * T[1] + S[2] * T[2];
    for (let k = 0; k < 3; k++) S[k] -= dot * T[k];
    const sl = Math.hypot(...S) || 1;
    S[0] /= sl; S[1] /= sl; S[2] /= sl;
    const N = [T[1] * S[2] - T[2] * S[1], T[2] * S[0] - T[0] * S[2], T[0] * S[1] - T[1] * S[0]];
    const [w, h] = profile(ss, a + seg, u - seg, a, b, r === 0 || r === count - 1);
    m.ring(P, S, N, w, h, (alongStart + u) / alongTotal);
  }
  m.stitch(count);
}

// A smooth tube through phosphates, for DNA.
function addTube(m, p, radius, alongTotal, alongStart) {
  const n = p.length / 3;
  if (n < 2) return;
  const { perResidue } = m;
  const count = (n - 1) * perResidue + 1;
  const at = (i, k) => p[Math.max(0, Math.min(n - 1, i)) * 3 + k];
  let S = [1, 0, 0];
  const ca = [0, 0, 0];
  const next = [0, 0, 0];
  for (let r = 0; r < count; r++) {
    const u = r / perResidue;
    const seg = Math.min(n - 2, Math.floor(u));
    const t = u - seg;
    const t2 = Math.min(1, t + 0.05);
    for (let k = 0; k < 3; k++) {
      ca[k] = cr(at(seg - 1, k), at(seg, k), at(seg + 1, k), at(seg + 2, k), t);
      next[k] = cr(at(seg - 1, k), at(seg, k), at(seg + 1, k), at(seg + 2, k), t2) + at(seg + 1, k) * (t === 1 ? 0.01 : 0);
    }
    const T = [next[0] - ca[0], next[1] - ca[1], next[2] - ca[2]];
    const tl = Math.hypot(...T) || 1;
    T[0] /= tl; T[1] /= tl; T[2] /= tl;
    const dot = S[0] * T[0] + S[1] * T[1] + S[2] * T[2];
    S = [S[0] - dot * T[0], S[1] - dot * T[1], S[2] - dot * T[2]];
    const sl = Math.hypot(...S) || 1;
    S = [S[0] / sl, S[1] / sl, S[2] / sl];
    const N = [T[1] * S[2] - T[2] * S[1], T[2] * S[0] - T[0] * S[2], T[0] * S[1] - T[1] * S[0]];
    m.ring(ca, S, N, radius, radius, (alongStart + u) / alongTotal);
  }
  m.stitch(count);
}

export function ribbonGeometry(site, { perResidue = 6, radial = 9 } = {}) {
  const m = new Mesher(perResidue, radial);
  let total = 0;
  for (const c of site.chains) total += c.ss.length;
  let start = 0;
  for (const c of site.chains) {
    const ends = [...new Set([...c.ends, c.ss.length - 1])].sort((p, q) => p - q);
    let a = 0;
    for (const e of ends) {
      addSegment(m, c.ca, c.o, c.ss, a, e, start + a, total);
      a = e + 1;
    }
    start += c.ss.length;
  }
  for (const p of site.nucleic) addTube(m, p, 0.42, Math.max(total, 1), 0);
  return m.geometry();
}

export function ribbonMaterial(tint) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFront: { value: 0 },
      uTint: { value: new THREE.Color(tint) },
      uFade: { value: 1 },
      uDim: { value: 1 },
      uFogNear: { value: 16 },
      uFogFar: { value: 70 },
      uTime: { value: 0 },
      uSlab: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aAlong;
      attribute float aDist;
      varying vec3 vN;
      varying vec3 vV;
      varying float vAlong;
      varying float vDist;
      void main() {
        vec4 world = vec4(position, 1.0);
#ifdef USE_INSTANCING
        world = instanceMatrix * world;
        vN = normalMatrix * mat3(instanceMatrix) * normal;
#else
        vN = normalMatrix * normal;
#endif
        vec4 mv = modelViewMatrix * world;
        vV = -mv.xyz;
        vAlong = aAlong;
        vDist = aDist;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFront, uFade, uDim, uFogNear, uFogFar, uTime, uSlab;
      uniform vec3 uTint;
      varying vec3 vN;
      varying vec3 vV;
      varying float vAlong;
      varying float vDist;
      ${OPTICS_GLSL}
      void main() {
        // Whatever sits between the camera and the site dissolves, like a clipping slab.
        float z = length(vV);
        if (uSlab > 0.0) {
          float keep = smoothstep(uSlab - 3.0, uSlab + 1.5, z);
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (keep < dither) discard;
        }
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(vV);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 2.4);
        float diff = 0.3 + 0.7 * max(dot(n, normalize(vec3(0.35, 0.8, 0.55))), 0.0);
        vec3 apo = vec3(0.016, 0.017, 0.022) * diff + vec3(0.13, 0.135, 0.16) * pow(rim, 1.3);
        float g = 420.0 + 1100.0 * pow(1.0 - ndv, 1.4) + 140.0 * sin(vAlong * 90.0 + uTime * 0.25);
        vec3 film = birefringence(g) * mix(vec3(1.0), uTint * 1.6, 0.72);
        vec3 holo = uTint * uTint * (0.03 + 0.3 * diff * diff) + film * (0.03 + 1.2 * rim);
        float wave = 1.0 - smoothstep(uFront - 6.0, uFront, vDist);
        vec3 c = mix(apo, holo, wave);
        float d = (vDist - uFront) / 2.4;
        c += exp(-d * d) * step(0.5, uFront) * (uTint + 0.2) * 1.1;
        float fog = 1.0 - smoothstep(uFogNear, uFogFar, z);
        gl_FragColor = vec4(c * fog * uFade * uDim, 1.0);
      }`,
  });
}
