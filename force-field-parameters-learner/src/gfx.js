// Scene pieces. White means the reference, gold means the player's model.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

export const INK = {
  white: new THREE.Color(0xeaf3f4), gold: new THREE.Color(0xf0bb45), red: new THREE.Color(0xff8a70),
  aqua: new THREE.Color(0x63e6da), blue: new THREE.Color(0x7fb2e8),
  pale: new THREE.Color(0xa9c7de), H: new THREE.Color(0xf4f8f8), C: new THREE.Color(0x9fb8d2), O: new THREE.Color(0xff6f5e), N: new THREE.Color(0x63c7ee), Ar: new THREE.Color(0xa7dcf5),
};
for (const k of Object.keys(INK)) INK[k].convertSRGBToLinear?.();

const pearlVert = `
  attribute vec3 aColor; attribute float aGlow;
  varying vec3 vN, vV, vC; varying float vDepth, vGlow;
  void main(){
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vV = normalize(-mv.xyz); vC = aColor; vDepth = -mv.z; vGlow = aGlow;
    gl_Position = projectionMatrix * mv;
  }`;
const pearlFrag = `
  uniform vec2 uFog; uniform vec3 uFogColor;
  varying vec3 vN, vV, vC; varying float vDepth, vGlow;
  void main(){
    vec3 N = normalize(vN), V = normalize(vV), L = normalize(vec3(-.45,.8,.55));
    float ndv = max(dot(N,V),0.), rim = pow(1.-ndv,2.4);
    float wrap = .5+.5*dot(N,L);
    float spec = pow(max(dot(N,normalize(L+V)),0.),90.);
    float back = pow(max(dot(N,-L),0.),2.);
    vec3 c = vC*(.13+.8*wrap*wrap) + vC*vec3(.45,.6,.9)*back*.22;
    c += (vC*.55+vec3(.34,.42,.5))*rim*1.05 + vec3(1.)*spec*1.5 + vC*vGlow;
    float f = smoothstep(uFog.x,uFog.y,vDepth);
    gl_FragColor = vec4(mix(c,uFogColor,f),1.);
  }`;

export function pearlMaterial(fog = [1e4, 2e4]) {
  return new THREE.ShaderMaterial({
    vertexShader: pearlVert, fragmentShader: pearlFrag,
    uniforms: { uFog: { value: new THREE.Vector2(...fog) }, uFogColor: { value: new THREE.Color(0.012, 0.05, 0.14) } },
  });
}

// A set of spheres. Colours and radii live per instance so thousands stay cheap.
export class Atoms extends THREE.InstancedMesh {
  constructor(n, { detail = 4, fog } = {}) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    super(g, pearlMaterial(fog), n);
    this.frustumCulled = false;
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.radii = new Float32Array(n).fill(1);
    this.count = n;
    this.m = this.instanceMatrix.array;
    for (let i = 0; i < n; i++) this.m[16 * i + 15] = 1;
  }
  // Fade into the paper with distance, measured from the camera's current target.
  fog(dist, near, far) { this.material.uniforms.uFog.value.set(dist + near, dist + far); }
  setAtom(i, x, y, z, r = this.radii[i]) {
    const m = this.m, q = 16 * i;
    this.radii[i] = r;
    m[q] = r; m[q + 5] = r; m[q + 10] = r;
    m[q + 12] = x; m[q + 13] = y; m[q + 14] = z;
  }
  setColor(i, c, glow = 0) {
    const a = this.geometry.attributes.aColor.array;
    a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b;
    this.geometry.attributes.aGlow.array[i] = glow;
  }
  flush(colors = false) {
    this.instanceMatrix.needsUpdate = true;
    if (colors) { this.geometry.attributes.aColor.needsUpdate = true; this.geometry.attributes.aGlow.needsUpdate = true; }
  }
}

const UP = new THREE.Vector3(0, 1, 0), TMP = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), MAT = new THREE.Matrix4(), POS = new THREE.Vector3();

// Rods between atoms.
export class Sticks extends THREE.InstancedMesh {
  constructor(n, { radius = 0.12, color = INK.C, glow = 0, fog } = {}) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(glow), 1));
    super(g, pearlMaterial(fog), n);
    for (let i = 0; i < n; i++) g.attributes.aColor.setXYZ(i, color.r, color.g, color.b);
    this.frustumCulled = false;
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rad = radius;
  }
  setStick(i, ax, ay, az, bx, by, bz, r = this.rad) {
    TMP.set(bx - ax, by - ay, bz - az);
    const l = TMP.length();
    Q.setFromUnitVectors(UP, TMP.divideScalar(l || 1));
    POS.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    S.set(r, l, r);
    MAT.compose(POS, Q, S);
    this.setMatrixAt(i, MAT);
  }
  setStickColor(i, c) { this.geometry.attributes.aColor.setXYZ(i, c.r, c.g, c.b); }
  flush(colors = false) { this.instanceMatrix.needsUpdate = true; if (colors) this.geometry.attributes.aColor.needsUpdate = true; }
}

// A coil spring between two points, gold because the player sets its stiffness.
export class Spring extends THREE.Mesh {
  constructor({ turns = 9, radius = 0.17, wire = 0.026, color = INK.gold } = {}) {
    class Coil extends THREE.Curve {
      getPoint(t, out = new THREE.Vector3()) {
        const a = t * turns * Math.PI * 2;
        const e = Math.min(1, Math.min(t, 1 - t) * 14);
        return out.set(radius * e * Math.cos(a), t - 0.5, radius * e * Math.sin(a));
      }
    }
    super(new THREE.TubeGeometry(new Coil(), turns * 28, wire, 7, false),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color.clone() }, uHeat: { value: 0 } },
        vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uHeat; varying vec3 vN, vV;
          void main(){ vec3 N=normalize(vN), V=normalize(vV); float l=.35+.65*max(dot(N,normalize(vec3(-.4,.8,.5))),0.); float s=pow(max(dot(N,normalize(V+vec3(-.4,.8,.5))),0.),30.);
          gl_FragColor=vec4(uColor*(l*(1.5+uHeat*2.5))+vec3(1.,.88,.62)*s*.9,1.); }`,
      }));
    this.frustumCulled = false;
  }
  stretch(ax, ay, az, bx, by, bz) {
    TMP.set(bx - ax, by - ay, bz - az);
    const l = TMP.length();
    this.quaternion.setFromUnitVectors(UP, TMP.divideScalar(l || 1));
    this.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.scale.set(1, l, 1);
  }
}

// Screen-width lines for curves.
export class Curve extends Line2 {
  constructor({ color = INK.gold, width = 2.2, n = 120, opacity = 1 } = {}) {
    const g = new LineGeometry();
    g.setPositions(new Float32Array(n * 3));
    const m = new LineMaterial({ color: color.getHex(THREE.LinearSRGBColorSpace), linewidth: width, transparent: opacity < 1, opacity, worldUnits: false });
    m.color.copy(color);
    super(g, m);
    this.n = n; this.frustumCulled = false;
    this.buf = new Float32Array(n * 3);
  }
  setFrom(fn) {
    const b = this.buf, n = this.n;
    for (let i = 0; i < n; i++) { const p = fn(i / (n - 1)); b[3 * i] = p[0]; b[3 * i + 1] = p[1]; b[3 * i + 2] = p[2]; }
    this.geometry.setPositions(b);
  }
}

// Reference points: small white marks.
export class Dots extends Atoms {
  constructor(n, r = 0.05) {
    super(n, { detail: 2 });
    this.r0 = r;
    for (let i = 0; i < n; i++) this.setColor(i, INK.white, 1.2);
    this.flush(true);
  }
  place(i, x, y, z) { this.setAtom(i, x, y, z, this.r0); }
}

// Additive points for fireflies, sparks and long exposures.
export class Sparks extends THREE.Points {
  constructor(n, { size = 0.14, color = INK.white, opacity = 1 } = {}) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3).fill(1e6);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: color.clone() }, uSize: { value: size }, uOpacity: { value: opacity }, uH: { value: 800 } },
      vertexShader: `uniform float uSize, uH; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = clamp(uSize*uH/(-mv.z)*2.4, 1.5, 64.); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; void main(){ vec2 p = gl_PointCoord-.5; float a = smoothstep(.5,.0,length(p)); gl_FragColor = vec4(uColor*a*a*uOpacity*2., a*uOpacity); }`,
    });
    super(g, m);
    this.frustumCulled = false; this.cap = n; this.head = 0;
    this.material.uniforms.uH.value = innerHeight * Math.min(devicePixelRatio, 2);
  }
  put(i, x, y, z) { const a = this.geometry.attributes.position.array; a[3 * i] = x; a[3 * i + 1] = y; a[3 * i + 2] = z; }
  push(x, y, z) { this.put(this.head, x, y, z); this.head = (this.head + 1) % this.cap; }
  flush() { this.geometry.attributes.position.needsUpdate = true; }
}

// A burst of sparks that fly and fade, used for success and for explosions.
export class Burst {
  constructor(parent, n = 240, { color = INK.gold, size = 0.1 } = {}) {
    this.p = new Sparks(n, { size, color });
    parent.add(this.p);
    this.v = new Float32Array(n * 3); this.x = new Float32Array(n * 3); this.life = 0; this.n = n;
  }
  fire(at, speed = 8) {
    for (let i = 0; i < this.n; i++) {
      const a = Math.random() * 6.283, c = 2 * Math.random() - 1, s = Math.sqrt(1 - c * c), v = speed * (0.3 + Math.random());
      this.x[3 * i] = at[0]; this.x[3 * i + 1] = at[1]; this.x[3 * i + 2] = at[2];
      this.v[3 * i] = v * s * Math.cos(a); this.v[3 * i + 1] = v * s * Math.sin(a); this.v[3 * i + 2] = v * c;
    }
    this.life = 1;
  }
  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt * 0.9;
    const f = Math.exp(-dt * 2.2);
    for (let i = 0; i < this.n * 3; i++) { this.v[i] *= f; this.x[i] += this.v[i] * dt; }
    const a = this.p.geometry.attributes.position.array;
    a.set(this.x);
    this.p.geometry.attributes.position.needsUpdate = true;
    this.p.material.uniforms.uOpacity.value = Math.max(0, this.life);
    if (this.life <= 0) { a.fill(1e6); this.p.geometry.attributes.position.needsUpdate = true; }
  }
}

// Thin additive lines between pairs of points, for hydrogen bonds.
export class Links extends THREE.LineSegments {
  constructor(n, { color = INK.white, opacity = 0.8 } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
    super(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.frustumCulled = false; this.cap = n;
    g.setDrawRange(0, 0);
  }
  set(i, ax, ay, az, bx, by, bz) { this.geometry.attributes.position.array.set([ax, ay, az, bx, by, bz], 6 * i); }
  show(count) { this.geometry.setDrawRange(0, 2 * Math.min(count, this.cap)); this.geometry.attributes.position.needsUpdate = true; }
}

export function ring(radius, ticks, len, color, opacity = 1) {
  const p = [];
  for (let i = 0; i < ticks; i++) {
    const a = i / ticks * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    p.push(radius * c, radius * s, 0, (radius + len) * c, (radius + len) * s, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

export function axisLine(points, color = INK.white, opacity = 0.32) {
  const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
