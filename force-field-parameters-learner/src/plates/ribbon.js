// A flat ribbon drawn through a chain of Cα positions.
import * as THREE from 'three';
import { INK } from '../gfx.js';

export class Ribbon extends THREE.Mesh {
  constructor(nRes, { color = INK.gold, width = 1.25, thick = 0.2, seg = 10, ring = 10 } = {}) {
    const n = (nRes - 1) * seg + 1, V = n * ring;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    super(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: true,
      uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 1 } },
      vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN, vV;
        void main(){ vec3 N = normalize(vN), V = normalize(vV), L = normalize(vec3(-.45,.8,.55));
        if(!gl_FrontFacing) N = -N; float f = pow(1.-max(dot(N,V),0.),2.); float d = .5+.5*dot(N,L);
        float s = pow(max(dot(N,normalize(L+V)),0.),40.);
        gl_FragColor = vec4(uColor*(.2+.5*d*d)+uColor*f*.55+vec3(1.)*s*.35, uAlpha); }`,
    }));
    Object.assign(this, { nRes, seg, ringN: ring, w: width, t: thick, n });
    this.frustumCulled = false;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    this.guide = Array.from({ length: n }, () => new THREE.Vector3());
  }
  // ca, gd: flat arrays of Cα positions and guide vectors (C=O), one per residue.
  update(ca, gd) {
    const { nRes, seg, n, ringN, w, t, pts, guide } = this;
    const cv = [], gv = [];
    for (let i = 0; i < nRes; i++) { cv.push(new THREE.Vector3(ca[3 * i], ca[3 * i + 1], ca[3 * i + 2])); gv.push(new THREE.Vector3(gd[3 * i], gd[3 * i + 1], gd[3 * i + 2])); }
    for (let i = 1; i < nRes; i++) if (gv[i].dot(gv[i - 1]) < 0) gv[i].negate();
    const curve = new THREE.CatmullRomCurve3(cv, false, 'centripetal');
    curve.getPoints(n - 1).forEach((p, i) => pts[i].copy(p));
    for (let i = 0; i < n; i++) {
      const u = i / seg, a = Math.min(nRes - 2, Math.floor(u)), f = u - a;
      guide[i].copy(gv[a]).lerp(gv[a + 1], f);
    }
    const P = this.geometry.attributes.position.array, N = this.geometry.attributes.normal.array;
    const T = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      T.copy(pts[Math.min(n - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize();
      B.copy(guide[i]).addScaledVector(T, -guide[i].dot(T)).normalize();
      M.crossVectors(T, B);
      const end = Math.min(1, Math.min(i, n - 1 - i) / 5 + 0.15);
      for (let j = 0; j < ringN; j++) {
        const a = j / ringN * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), q = 3 * (i * ringN + j);
        const ww = w * end;
        P[q] = pts[i].x + B.x * c * ww + M.x * s * t; P[q + 1] = pts[i].y + B.y * c * ww + M.y * s * t; P[q + 2] = pts[i].z + B.z * c * ww + M.z * s * t;
        const nb = c / ww, nm = s / t, l = Math.hypot(nb, nm);
        N[q] = (B.x * nb + M.x * nm) / l; N[q + 1] = (B.y * nb + M.y * nm) / l; N[q + 2] = (B.z * nb + M.z * nm) / l;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}
