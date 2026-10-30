// The 3D site: sticks, tethers, the growing crystal, difference density and the metal itself.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { OPTICS_GLSL } from './optics.js';
import { ribbonGeometry, ribbonMaterial } from './ribbon.js';

const ELEMENT = { C: '#b9b3a4', N: '#6d8dff', O: '#ff5b5e', S: '#ffd23d', P: '#ff9b3d', FE: '#ff8a4a', MO: '#9fd8ff', MN: '#b58cff', CA: '#ffd98a', ZN: '#d9e4ff', CU: '#2f8bff', NI: '#57d98a', CO: '#ff4f9a', MG: '#9df7c0', K: '#c9a2ff' };
const STICK = 0.13;
const BALL = 0.2;

const STICK_VS = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vC;
  void main() {
    mat4 m = modelViewMatrix * instanceMatrix;
    vN = normalize(mat3(m) * normal);
    vec4 mv = m * vec4(position, 1.0);
    vV = -mv.xyz;
    vC = instanceColor;
    gl_Position = projectionMatrix * mv;
  }`;
const STICK_FS = /* glsl */ `
  uniform float uFade, uFogNear, uFogFar;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vC;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float diff = 0.34 + 0.66 * max(dot(n, normalize(vec3(0.4, 0.75, 0.5))), 0.0);
    float rim = pow(1.0 - ndv, 3.0);
    float spec = pow(max(dot(n, normalize(v + vec3(0.4, 0.75, 0.5))), 0.0), 40.0);
    vec3 c = vC * diff * 0.62 + vC * rim * 0.5 + spec * 0.45;
    float fog = 1.0 - smoothstep(uFogNear, uFogFar, length(vV));
    gl_FragColor = vec4(c * fog * uFade, 1.0);
  }`;

const TETHER_FS = /* glsl */ `
  uniform float uTime, uFade;
  uniform vec3 uColor;
  varying vec2 vUv2;
  varying vec3 vC;
  void main() {
    float flow = 0.55 + 0.45 * sin(vUv2.y * 16.0 - uTime * 5.0);
    gl_FragColor = vec4(uColor * vC * flow * 0.8 * uFade, 1.0);
  }`;
const TETHER_VS = /* glsl */ `
  varying vec2 vUv2;
  varying vec3 vC;
  void main() {
    vUv2 = uv;
    vC = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;

const GEM_VS = /* glsl */ `
  varying vec3 vP;
  varying vec3 vW;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vW = position;
    gl_Position = projectionMatrix * mv;
  }`;
const GEM_FS = /* glsl */ `
  uniform float uIgnite, uTime, uAlpha;
  uniform vec3 uTint;
  varying vec3 vP;
  varying vec3 vW;
  ${OPTICS_GLSL}
  void main() {
    vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
    vec3 v = normalize(-vP);
    float ndv = abs(dot(n, v));
    float fres = pow(1.0 - ndv, 2.2);
    float g = 190.0 + uIgnite * (300.0 + 1300.0 * (1.0 - ndv) + 150.0 * sin(dot(vW, vec3(2.1, 1.3, 1.7)) + uTime * 0.5));
    vec3 c = birefringence(g);
    c = mix(c, c * uTint * 1.5, uIgnite * 0.4);
    c *= mix(0.05 + 0.2 * fres, 0.16 + 0.8 * fres, uIgnite);
    gl_FragColor = vec4(c * uAlpha, 1.0);
  }`;

const FLOAT_V = new THREE.Vector3();
const A = new THREE.Vector3();
const B = new THREE.Vector3();
const Q = new THREE.Quaternion();
const M = new THREE.Matrix4();
const S = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class Rods {
  constructor(max, material, radial = 7) {
    const g = new THREE.CylinderGeometry(1, 1, 1, radial, 1, true);
    g.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(g, material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  set(i, a, b, r, color) {
    A.copy(b).sub(a);
    const len = A.length();
    Q.setFromUnitVectors(UP, A.divideScalar(len || 1));
    S.set(r, len, r);
    M.compose(a, Q, S);
    this.mesh.setMatrixAt(i, M);
    if (color) this.mesh.setColorAt(i, color);
  }

  commit(n) {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const GLOW = { tex: null, ring: null };
const glow = () => (GLOW.tex ??= glowTexture());

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(64, 64, 52, 0, Math.PI * 2);
  x.stroke();
  return new THREE.CanvasTexture(c);
}

// Lines where a smooth field crosses a level, on three stacks of planes: the mesh crystallographers look at.
function contourLines(field, min, max, step, stride, level) {
  const nx = Math.round((max.x - min.x) / step) + 1;
  const ny = Math.round((max.y - min.y) / step) + 1;
  const nz = Math.round((max.z - min.z) / step) + 1;
  const grid = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) grid[at(i, j, k)] = field(min.x + i * step, min.y + j * step, min.z + k * step);
  const out = [];
  const slice = (u, v, w, nu, nv, nw) => {
    for (let c = 0; c < nw; c += stride) {
      for (let b = 0; b < nv - 1; b++) {
        for (let a = 0; a < nu - 1; a++) {
          const idx = (p, q) => { const t = [0, 0, 0]; t[u] = p; t[v] = q; t[w] = c; return at(t[0], t[1], t[2]); };
          const d = [grid[idx(a, b)], grid[idx(a + 1, b)], grid[idx(a + 1, b + 1)], grid[idx(a, b + 1)]];
          const pts = [];
          const edge = (p0, q0, f0, p1, q1, f1) => {
            if ((f0 >= level) === (f1 >= level)) return;
            const t = (level - f0) / (f1 - f0);
            pts.push([p0 + (p1 - p0) * t, q0 + (q1 - q0) * t]);
          };
          edge(a, b, d[0], a + 1, b, d[1]);
          edge(a + 1, b, d[1], a + 1, b + 1, d[2]);
          edge(a + 1, b + 1, d[2], a, b + 1, d[3]);
          edge(a, b + 1, d[3], a, b, d[0]);
          for (let i = 0; i + 1 < pts.length; i += 2) {
            for (const [p, q] of [pts[i], pts[i + 1]]) {
              const t = [0, 0, 0];
              t[u] = p; t[v] = q; t[w] = c;
              out.push(min.x + t[0] * step, min.y + t[1] * step, min.z + t[2] * step);
            }
          }
        }
      }
    }
  };
  slice(0, 1, 2, nx, ny, nz);
  slice(0, 2, 1, nx, nz, ny);
  slice(1, 2, 0, ny, nz, nx);
  return new Float32Array(out);
}

export class SiteView {
  constructor(stage, data, well) {
    this.stage = stage;
    this.data = data;
    this.well = well;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.tint = new THREE.Color(well.tint);
    this.atoms = data.atoms.map((a, i) => ({ ...a, i, pos: new THREE.Vector3(a.x, a.y, a.z), now: new THREE.Vector3(a.x, a.y, a.z), seed: Math.random() * 100, glow: 0, hidden: false, tug: 0 }));
    this.metalSet = new Set(data.stages.flatMap((s) => s.metals));
    this.isCluster = !!data.hull;
    this.bound = new Set();
    this.tethers = []; // { from, atom, age }
    this.seated = new Set();
    this.lights = [];
    this.ringSize = 1;
    this.jitter = 0.01;
    this.front = 0;
    this.time = 0;

    this.geometry = ribbonGeometry(data);
    this.ribbonMat = ribbonMaterial(well.tint);
    this.ribbon = new THREE.Mesh(this.geometry, this.ribbonMat);
    this.ribbon.frustumCulled = false;
    this.group.add(this.ribbon);

    this.fog = { uFade: { value: 1 }, uFogNear: { value: 14 }, uFogFar: { value: 46 } };
    const stickMat = new THREE.ShaderMaterial({ vertexShader: STICK_VS, fragmentShader: STICK_FS, uniforms: this.fog });
    this.ballGeo = new THREE.IcosahedronGeometry(1, 2);
    this.balls = new THREE.InstancedMesh(this.ballGeo, stickMat, this.atoms.length);
    this.balls.frustumCulled = false;
    this.balls.setColorAt(0, new THREE.Color());
    this.group.add(this.balls);
    const bondMat = stickMat.clone();
    bondMat.uniforms = this.fog;
    this.sticks = new Rods(data.bonds.length * 2 + 4, bondMat, 8);
    this.group.add(this.sticks.mesh);

    this.tetherMat = new THREE.ShaderMaterial({
      vertexShader: TETHER_VS, fragmentShader: TETHER_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: this.tint.clone() }, uFade: { value: 1 } },
    });
    this.rods = new Rods(64, this.tetherMat, 6);
    this.group.add(this.rods.mesh);

    this.edgeMat = new THREE.ShaderMaterial({
      vertexShader: TETHER_VS,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying vec3 vC; void main() { gl_FragColor = vec4(uColor * vC, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) } },
    });

    this.haloMat = new THREE.SpriteMaterial({ map: (GLOW.ring ??= ringTexture()), color: new THREE.Color(0.95, 0.9, 0.62), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5, depthTest: false });
    this.halos = new Map();
    this.gems = data.stages.map(() => null);
    this.ions = [];
    this.fitLines = null;
    this.buildMotes();
    this.buildDensity();
    this.colors = this.atoms.map((a) => new THREE.Color(ELEMENT[a.el] ?? '#ffffff'));
    if (this.isCluster) this.buildClusterGem();
    this.step(0, 0);
  }

  buildMotes() {
    const n = 220;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p[i] = (Math.random() - 0.5) * 70;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.moteMat = new THREE.PointsMaterial({ size: 0.34, map: glow(), color: new THREE.Color(0.32, 0.34, 0.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.motes = new THREE.Points(g, this.moteMat);
    this.group.add(this.motes);
  }

  // Green difference density where the model explains nothing: the empty metal site.
  buildDensity() {
    this.density = this.data.stages.map((st) => {
      const pts = st.metals.map((i) => this.atoms[i].pos);
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (const p of pts) { min.min(p); max.max(p); }
      const margin = 1.5;
      min.subScalar(margin);
      max.addScalar(margin);
      const sigma = 0.58;
      const field = (x, y, z) => {
        let f = 0;
        for (const p of pts) {
          const d2 = (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2;
          f += Math.exp(-d2 / (2 * sigma * sigma));
        }
        return f + 0.05 * Math.sin(x * 3.1 + y * 1.7) * Math.cos(y * 2.3 - z * 2.9);
      };
      const positions = contourLines(field, min, max, 0.16, 2, 0.42);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const m = new THREE.LineBasicMaterial({ color: new THREE.Color(0.2, 1.35, 0.55), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      const lines = new THREE.LineSegments(g, m);
      lines.frustumCulled = false;
      this.group.add(lines);
      return { lines, material: m, strength: 1, target: 1, flip: 0 };
    });
  }

  buildClusterGem() {
    const pts = this.data.hull.map((i) => this.atoms[i].pos).filter((p) => p);
    this.setGem(0, pts);
  }

  stageCentre(k, out = new THREE.Vector3()) {
    const ms = this.data.stages[k].metals;
    out.set(0, 0, 0);
    for (const i of ms) out.add(this.atoms[i].pos);
    return out.divideScalar(ms.length);
  }

  setGem(k, points) {
    if (points.length < 3) return;
    const pts = points.map((p) => p.clone());
    if (pts.length < 4) pts.push(this.stageCentre(k));
    let geo;
    try { geo = new ConvexGeometry(pts); } catch { return; }
    let gem = this.gems[k];
    if (!gem) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: GEM_VS, fragmentShader: GEM_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uIgnite: { value: 0 }, uTime: { value: 0 }, uAlpha: { value: 0 }, uTint: { value: this.tint.clone() } },
      });
      gem = { mesh: new THREE.Mesh(geo, mat), mat, rods: new Rods(96, this.edgeMat.clone(), 5), alpha: 0, ignite: 0, target: 0 };
      gem.rods.mesh.material.uniforms = { uColor: { value: new THREE.Color(0.8, 0.82, 0.86) } };
      this.group.add(gem.mesh, gem.rods.mesh);
      this.gems[k] = gem;
    } else {
      gem.mesh.geometry.dispose();
      gem.mesh.geometry = geo;
    }
    const edges = new THREE.EdgesGeometry(geo, 1);
    const p = edges.attributes.position;
    const count = Math.min(p.count / 2, 96);
    for (let i = 0; i < count; i++) {
      gem.rods.set(i, FLOAT_V.fromBufferAttribute(p, i * 2).clone(), B.fromBufferAttribute(p, i * 2 + 1), 0.024);
    }
    gem.rods.commit(count);
    edges.dispose();
  }

  // A tether from the empty site to a donor atom. The gem grows from the donors found so far.
  bind(k, atomIndex, instant = false) {
    const a = this.atoms[atomIndex];
    if (this.bound.has(`${k}:${atomIndex}`)) return;
    this.bound.add(`${k}:${atomIndex}`);
    this.tethers.push({ stage: k, atom: atomIndex, age: instant ? 1 : 0 });
    a.glow = Math.max(a.glow, 1);
    if (!this.isCluster) {
      const pts = this.tethers.filter((t) => t.stage === k).map((t) => this.atoms[t.atom].pos);
      this.setGem(k, pts);
    }
  }

  // Ghost of an ideal polyhedron laid over the real donors.
  showFit(verts) {
    if (this.fitLines) {
      this.group.remove(this.fitLines);
      this.fitLines.geometry.dispose();
      this.fitLines.material.dispose();
      this.fitLines = null;
    }
    if (!verts) return;
    const pts = verts.map((v) => new THREE.Vector3(...v));
    const g = new ConvexGeometry(pts);
    const e = new THREE.EdgesGeometry(g, 1);
    g.dispose();
    this.fitLines = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color: new THREE.Color(1.5, 1.45, 1.1), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.group.add(this.fitLines);
  }

  spawnIon(k, color, radius, startWorld) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4) });
    const mesh = new THREE.Mesh(this.ballGeo, mat);
    mesh.scale.setScalar(radius);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    halo.scale.setScalar(radius * 9);
    const ion = new THREE.Group();
    ion.add(mesh, halo);
    ion.position.copy(startWorld);
    this.group.add(ion);
    return { group: ion, mesh, halo, stage: k };
  }

  removeIon(ion) {
    this.group.remove(ion.group);
    ion.mesh.material.dispose();
    ion.halo.material.dispose();
  }

  // Candidates near a screen point. Returns the closest atom index, or -1.
  pick(x, y, list, reach = 34) {
    let best = -1;
    let bestD = reach;
    const p = new THREE.Vector3();
    for (const i of list) {
      this.stage.project(this.atoms[i].now, p);
      if (p.z > 1) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // A soft ring on every atom you can tap, so nothing depends on hovering.
  setHalos(list) {
    for (const i of list) {
      if (this.halos.has(i)) continue;
      const h = new THREE.Sprite(this.haloMat);
      h.scale.setScalar(this.ringSize);
      h.position.copy(this.atoms[i].pos);
      this.group.add(h);
      this.halos.set(i, h);
    }
  }

  dropHalos(list) {
    for (const i of list) {
      const h = this.halos.get(i);
      if (!h) continue;
      this.group.remove(h);
      this.halos.delete(i);
    }
  }

  flashWrong(i) {
    this.atoms[i].glow = -1;
  }

  setDifference(k, kind) {
    const d = this.density[k];
    if (kind === 'none') { d.target = 0; return; }
    d.flip = 1;
    d.material.color.setRGB(...(kind === 'green' ? [0.2, 1.35, 0.55] : kind === 'red' ? [1.6, 0.22, 0.25] : [0.5, 0.5, 0.55]));
  }

  seatMetals(k, color) {
    for (const i of this.data.stages[k].metals) {
      this.seated.add(i);
      this.colors[i].set(color);
    }
    const g = this.gems[k];
    if (g) g.target = 1;
    this.density[k].target = 0;
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    light.position.copy(this.stageCentre(k));
    light.scale.setScalar(5.5);
    this.group.add(light);
    this.lights.push(light);
  }

  // Keeps sticks and ribbon legible at any viewing distance.
  setFog(dist) {
    this.fog.uFogNear.value = dist + 1;
    this.fog.uFogFar.value = dist + 26;
    this.ribbonMat.uniforms.uFogNear.value = dist + 1;
    this.ribbonMat.uniforms.uFogFar.value = dist + 44;
  }

  step(dt, t) {
    this.time = t;
    const J = this.jitter;
    const { atoms, data } = this;
    const c = new THREE.Color();
    let ballN = 0;
    for (const a of atoms) {
      const b = Math.sqrt(Math.max(a.b, 4)) * J;
      a.now.set(
        a.pos.x + Math.sin(t * 9.1 + a.seed) * b,
        a.pos.y + Math.sin(t * 7.3 + a.seed * 1.7) * b,
        a.pos.z + Math.sin(t * 8.2 + a.seed * 2.3) * b,
      );
      if (a.glow > 0) a.glow = Math.max(0.3, a.glow - dt * 0.9);
      else if (a.glow < 0) a.glow = Math.min(0, a.glow + dt * 1.2);
      const isMetal = this.metalSet.has(a.i);
      if (isMetal && !this.seated.has(a.i) && !this.isCluster) continue;
      const water = a.res === 'HOH';
      const size = isMetal ? 0.42 : water ? 0.3 : a.el === 'C' ? BALL * 0.82 : BALL * 1.1;
      S.setScalar(size);
      M.compose(a.now, Q.identity(), S);
      this.balls.setMatrixAt(ballN, M);
      c.copy(this.colors[a.i]);
      if (isMetal && !this.seated.has(a.i)) c.lerp(new THREE.Color(0.5, 0.52, 0.56), 0.75);
      if (a.glow > 0) c.multiplyScalar(1 + a.glow * 1.6);
      if (a.glow < 0) c.lerp(new THREE.Color(2.2, 0.15, 0.15), -a.glow);
      if (this.seated.has(a.i)) c.multiplyScalar(1.5);
      this.balls.setColorAt(ballN, c);
      ballN++;
    }
    this.balls.count = ballN;
    this.balls.instanceMatrix.needsUpdate = true;
    this.balls.instanceColor.needsUpdate = true;

    let n = 0;
    const mid = new THREE.Vector3();
    for (const [i, j] of data.bonds) {
      const p = atoms[i];
      const q = atoms[j];
      mid.copy(p.now).add(q.now).multiplyScalar(0.5);
      this.sticks.set(n++, p.now, mid, STICK, this.colors[i]);
      this.sticks.set(n++, mid, q.now, STICK, this.colors[j]);
    }
    this.sticks.commit(n);

    n = 0;
    const white = new THREE.Color(1, 1, 1);
    const end = new THREE.Vector3();
    for (const th of this.tethers) {
      th.age = Math.min(1, th.age + dt * 4.5);
      const from = this.stageCentreOfTether(th, A.clone());
      const to = atoms[th.atom].now;
      end.copy(from).lerp(to, 1 - (1 - th.age) ** 3);
      this.rods.set(n++, from.clone(), end, 0.032, white);
    }
    this.rods.commit(n);
    this.tetherMat.uniforms.uTime.value = t;

    for (const g of this.gems) {
      if (!g) continue;
      g.alpha = Math.min(1, g.alpha + dt * 2);
      g.ignite += (g.target - g.ignite) * Math.min(1, dt * 3.2);
      g.mat.uniforms.uAlpha.value = g.alpha;
      g.mat.uniforms.uIgnite.value = g.ignite;
      g.mat.uniforms.uTime.value = t;
    }
    for (const d of this.density) {
      d.strength += (d.target - d.strength) * Math.min(1, dt * 4);
      d.flip = Math.max(0, d.flip - dt * 0.4);
      d.material.opacity = d.strength * (0.5 + 0.12 * Math.sin(t * 2.2)) + d.flip * 0.6;
      d.lines.visible = d.strength > 0.01;
    }
    this.haloMat.opacity = 0.5 + 0.22 * Math.sin(t * 3);
    this.ribbonMat.uniforms.uTime.value = t;
    this.ribbonMat.uniforms.uFront.value = this.front;
    this.motes.rotation.y = t * 0.012;
    this.motes.rotation.x = t * 0.007;
  }

  stageCentreOfTether(th, out) {
    const ms = this.data.stages[th.stage].metals;
    if (ms.length === 1) return out.copy(this.atoms[ms[0]].pos);
    // In a cluster, each donor tethers to its nearest metal.
    let best = null;
    let bd = Infinity;
    for (const i of ms) {
      const d = this.atoms[i].pos.distanceTo(this.atoms[th.atom].pos);
      if (d < bd) { bd = d; best = this.atoms[i].pos; }
    }
    return out.copy(best);
  }

  dispose() {
    this.stage.scene.remove(this.group);
    this.showFit(null);
    this.geometry.dispose();
    this.ribbonMat.dispose();
    this.ballGeo.dispose();
    this.balls.material.dispose();
    this.balls.dispose();
    this.sticks.dispose();
    this.rods.dispose();
    this.edgeMat.dispose();
    for (const g of this.gems) {
      if (!g) continue;
      g.mesh.geometry.dispose();
      g.mat.dispose();
      g.rods.dispose();
    }
    for (const d of this.density) {
      d.lines.geometry.dispose();
      d.material.dispose();
    }
    for (const l of this.lights) l.material.dispose();
    this.motes.geometry.dispose();
    this.moteMat.dispose();
    this.haloMat.dispose();
  }
}
