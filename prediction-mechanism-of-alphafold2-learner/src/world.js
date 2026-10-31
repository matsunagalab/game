// The paper world: one renderer, one low sun, a studio sweep of warm paper rising into pale sky.
// Every object is cut paper: matte, faintly fibrous, and a little translucent when the sun is behind it.
import * as THREE from 'three';

export const STOCK = {
  high: new THREE.Color('#0053d6'), good: new THREE.Color('#65cbf3'), low: new THREE.Color('#ffdb13'), poor: new THREE.Color('#ff7d45'),
  white: new THREE.Color('#fbf7ef'), sky: new THREE.Color('#d9ecf6'), ink: new THREE.Color('#26343f'), mist: new THREE.Color('#e7e2d6'),
};
// AlphaFold's confidence colours, as paper. Bands from Varadi et al. 2022.
export const plddtStock = (v) => (v >= 90 ? STOCK.high : v >= 70 ? STOCK.good : v >= 50 ? STOCK.low : STOCK.poor);

function grain(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const im = g.createImageData(size, size), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 34; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  // Long fibres laid in every direction give the sheet its tooth.
  for (let k = 0; k < 900; k += 1) {
    const x = Math.random() * size, y = Math.random() * size, a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 18;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,40'},${0.04 + Math.random() * 0.08})`;
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * r * 0.6 + 3, y + Math.sin(a) * r * 0.6 - 3, x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function softDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(60,70,84,1)'); r.addColorStop(0.5, 'rgba(60,70,84,.42)'); r.addColorStop(1, 'rgba(60,70,84,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 is needed');
    this.phone = Math.min(innerWidth, innerHeight) < 600 || navigator.maxTouchPoints > 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.phone ? 2 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9f2f6');
    this.camera = new THREE.PerspectiveCamera(24, 1, 2, 3000);
    this.grain = grain();
    this.disc = softDisc();
    this.buildLight();
    this.buildSet();
    this.view = { target: new THREE.Vector3(0, 0, 0), dist: 150, polar: 0.3, az: 0 };
    this.goal = null;
    this.stage = { x: 0, y: 0, w: 1, h: 1 };
    this.ticks = new Set();
    this.reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.ray = new THREE.Raycaster();
    this.clock = performance.now();
    this.time = 0;
    this.shadowDirty = 3;
    this.resize();
  }

  buildLight() {
    const hemi = new THREE.HemisphereLight('#f7fbff', '#fbf1dc', 2.25);
    const sun = this.sun = new THREE.DirectionalLight('#fff6e8', 2.3);
    sun.position.set(-70, 120, 60);
    sun.castShadow = true;
    const size = this.phone ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.radius = this.phone ? 2.5 : 3.5;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.25;
    this.shadowSpan(80);
    this.scene.add(hemi, sun, sun.target);
    this.sunDir = sun.position.clone().normalize();
    this.sunUniform = { value: new THREE.Vector3() };
  }

  shadowSpan(s) {
    const c = this.sun.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 20; c.far = 420;
    c.updateProjectionMatrix();
    this.shadowDirty = 3;
  }

  // Sweep: a floor that curves up into a wall, from warm paper to pale sky. It is unlit, so daylight stays exactly this
  // colour, and a separate invisible sheet on the floor catches the shadows.
  buildSet() {
    const g = new THREE.PlaneGeometry(1600, 1100, 1, 120), p = g.attributes.position, col = new Float32Array(p.count * 3), uv = g.attributes.uv;
    const c = new THREE.Color(), radius = 150, floor = new THREE.Color('#fdfaf3'), haze = new THREE.Color('#f3f4ee'), sky = new THREE.Color('#bfe0f2'), high = new THREE.Color('#a9d3ee');
    for (let i = 0; i < p.count; i += 1) {
      const v = (p.getY(i) + 550) / 1100, s = v * 1100 - 420;
      let y = 0, z;
      if (s < 0) { z = 300 - v * 1100; } else if (s < radius * Math.PI / 2) { const a = s / radius; z = -120 - Math.sin(a) * radius; y = radius - Math.cos(a) * radius; } else { z = -120 - radius; y = radius + (s - radius * Math.PI / 2); }
      p.setXYZ(i, p.getX(i), y, z);
      if (y < 60) c.copy(floor).lerp(haze, THREE.MathUtils.smoothstep(y, 0, 60));
      else if (y < 240) c.copy(haze).lerp(sky, THREE.MathUtils.smoothstep(y, 60, 240));
      else c.copy(sky).lerp(high, THREE.MathUtils.smoothstep(y, 240, 520));
      c.toArray(col, i * 3);
      uv.setXY(i, p.getX(i) / 60, v * 18);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tooth = this.toothTexture();
    this.sweep = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: tooth, toneMapped: false }));
    this.scene.add(this.sweep);
    // The floor runs on past the camera however far back it stands.
    const near = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: floor, map: tooth, toneMapped: false }));
    near.position.set(0, -0.02, 1700);
    near.material.map = tooth.clone();
    near.material.map.repeat.set(100, 50);
    near.material.map.needsUpdate = true;
    this.scene.add(near);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: '#46586b', opacity: 0.3 }));
    catcher.position.y = 0.02;
    catcher.receiveShadow = true;
    this.scene.add(catcher);
  }

  // Paper tooth for the sweep: very nearly white, so it multiplies the colour without dulling it.
  toothTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d'), im = g.createImageData(256, 256);
    for (let i = 0; i < im.data.length; i += 4) { const v = 244 + Math.random() * 11; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // The one paper material. "glow" is how much sunlight comes through a sheet seen from its shaded side.
  paper({ color = '#ffffff', side = THREE.DoubleSide, vertexColors = false, repeat = 1, bump = 0.8, glow = 0.42, transparent = false, opacity = 1, map = null } = {}) {
    const tex = this.grain.clone();
    tex.repeat.set(repeat, repeat);
    tex.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ color, side, vertexColors, roughness: 0.94, metalness: 0, bumpMap: tex, bumpScale: bump, transparent, opacity, map });
    const sun = this.sunUniform;
    m.onBeforeCompile = (s) => {
      s.uniforms.sunView = sun;
      s.uniforms.paperGlow = { value: glow };
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 sunView; uniform float paperGlow;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float through = clamp(-dot(normal, sunView), 0.0, 1.0);
          totalEmissiveRadiance += diffuseColor.rgb * through * paperGlow;`);
    };
    m.customProgramCacheKey = () => `paper${glow}`;
    return m;
  }

  // The part of the canvas not under the card. The camera shifts so the target sits at its centre.
  setStage(x, y, w, h) { this.stage = { x, y, w: Math.max(40, w), h: Math.max(40, h) }; this.applyOffset(); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.size = { w, h };
    this.camera.aspect = w / h;
    this.applyOffset();
  }

  // The camera slides to keep the stage centred when the card grows or shrinks, so a longer sentence never makes the scene jump.
  applyOffset(snap = !this.offset) {
    const { w, h } = this.size ?? { w: 1, h: 1 }, s = this.stage;
    this.offsetGoal = { x: s.x + s.w / 2 - w / 2, y: s.y + s.h / 2 - h / 2 };
    if (snap) this.offset = { ...this.offsetGoal };
    this.camera.setViewOffset(w, h, -this.offset.x, -this.offset.y, w, h);
  }

  // Distance that fits a span (in world units) across the stage's narrow fit.
  fitDist(spanX, spanZ, polar = 0) {
    const { h, } = this.size, s = this.stage, tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const ppu = (d) => (h / 2) / (d * tan); // pixels per unit at distance d
    const need = Math.max(spanX / s.w, (spanZ * Math.cos(polar)) / s.h);
    return (h / 2) * need / tan;
  }

  look(view, seconds = 1.2) {
    const v = { target: (view.target ?? this.view.target).clone?.() ?? new THREE.Vector3(...view.target), dist: view.dist ?? this.view.dist, polar: view.polar ?? this.view.polar, az: view.az ?? this.view.az };
    if (seconds <= 0 || this.reduce) { Object.assign(this.view, v); this.goal = null; return; }
    this.goal = { from: { target: this.view.target.clone(), dist: this.view.dist, polar: this.view.polar, az: this.view.az }, to: v, t: 0, d: seconds };
  }

  placeCamera() {
    const { target, dist, polar, az } = this.view;
    const c = this.camera;
    c.position.set(target.x + Math.sin(polar) * Math.sin(az) * dist, target.y + Math.cos(polar) * dist, target.z + Math.sin(polar) * Math.cos(az) * dist);
    c.up.set(0, polar < 0.02 ? 0 : 1, polar < 0.02 ? -1 : 0);
    c.lookAt(target);
    c.updateMatrixWorld();
    this.sunUniform.value.copy(this.sunDir).transformDirection(c.matrixWorldInverse);
  }

  frame(now = performance.now()) {
    const dt = Math.min(0.05, (now - this.clock) / 1000);
    this.clock = now;
    this.time += dt;
    if (this.goal) {
      const g = this.goal;
      g.t = Math.min(1, g.t + dt / g.d);
      const e = g.t * g.t * (3 - 2 * g.t);
      this.view.target.lerpVectors(g.from.target, g.to.target, e);
      this.view.dist = THREE.MathUtils.lerp(g.from.dist, g.to.dist, e);
      this.view.polar = THREE.MathUtils.lerp(g.from.polar, g.to.polar, e);
      this.view.az = THREE.MathUtils.lerp(g.from.az, g.to.az, e);
      if (g.t >= 1) this.goal = null;
    }
    const o = this.offset, g = this.offsetGoal;
    if (o && g && (Math.abs(o.x - g.x) > 0.3 || Math.abs(o.y - g.y) > 0.3)) {
      const k = Math.min(1, dt * 7);
      o.x += (g.x - o.x) * k; o.y += (g.y - o.y) * k;
      this.camera.setViewOffset(this.size.w, this.size.h, -o.x, -o.y, this.size.w, this.size.h);
    }
    this.placeCamera();
    for (const f of this.ticks) f(dt, this.time);
    const r = this.renderer;
    r.shadowMap.autoUpdate = false;
    if (this.shadowDirty > 0 || this.liveShadows) { r.shadowMap.needsUpdate = true; this.shadowDirty -= 1; }
    r.render(this.scene, this.camera);
  }

  // Screen position of a world point, in CSS pixels, for overlays and for the test bots.
  project(v) {
    const p = (v.clone ? v.clone() : new THREE.Vector3(...v)).project(this.camera);
    return { x: (p.x + 1) / 2 * this.size.w, y: (1 - p.y) / 2 * this.size.h };
  }

  // Where a screen point meets a horizontal plane.
  onPlane(x, y, height = 0) {
    const n = new THREE.Vector2((x / this.size.w) * 2 - 1, 1 - (y / this.size.h) * 2);
    this.ray.setFromCamera(n, this.camera);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), hit) ? hit : null;
  }
}

const M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), BASIS = new THREE.Matrix4();

// Residues as paper triangles. The shape is the real N-CA-C triangle, with a light crease from CA to the far edge.
export class Flock {
  constructor(world, n, shape, { size = 1.7, shadows = true } = {}) {
    this.world = world; this.n = n; this.size = size;
    const a = shape.n, c = shape.c, o = [0, 0, 0], mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0.16];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...o, ...mid, ...a, ...o, ...c, ...mid]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0.5, 0.5, 0, 1, 0, 0, 1, 0, 0.5, 0.5]), 2));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, world.paper({ glow: 0.55, repeat: 0.5, bump: 0.3 }), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = shadows;
    this.mesh.frustumCulled = false;
    this.mesh.count = n;
    this.color = new THREE.Color('#ffffff');
    for (let i = 0; i < n; i += 1) this.mesh.setColorAt(i, this.color);
    world.scene.add(this.mesh);
    // A soft dark smudge on the table under each triangle stands in for ambient occlusion, at almost no cost.
    const blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: world.disc, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }), n);
    blob.frustumCulled = false;
    blob.renderOrder = 1;
    this.blob = blob;
    world.scene.add(blob);
    this.group = new THREE.Matrix4();
    this.tableY = 0.03;
  }

  // Set instance i from a frame (R by rows, t) plus an optional spin for the flock's flutter.
  place(i, R, t, group = this.group) {
    BASIS.set(R[0] * this.size, R[1] * this.size, R[2] * this.size, t[0], R[3] * this.size, R[4] * this.size, R[5] * this.size, t[1], R[6] * this.size, R[7] * this.size, R[8] * this.size, t[2], 0, 0, 0, 1);
    M.multiplyMatrices(group, BASIS);
    this.mesh.setMatrixAt(i, M);
    V.setFromMatrixPosition(M);
    const h = Math.max(0, V.y), s = 3.2 + h * 0.5, fade = 1 / (1 + h * 0.06);
    M.makeScale(s * fade + 1, 1, s * fade + 1).setPosition(V.x + 0.2 * h * 0.4, this.tableY, V.z - 0.1 * h * 0.4);
    this.blob.setMatrixAt(i, M);
  }

  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.blob.instanceMatrix.needsUpdate = true;
    this.world.shadowDirty = 2;
  }

  paint(fn) {
    for (let i = 0; i < this.n; i += 1) this.mesh.setColorAt(i, fn(i));
    this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.world.scene.remove(this.mesh, this.blob);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.blob.geometry.dispose(); this.blob.material.dispose();
    this.world.shadowDirty = 2;
  }
}

// The pair map as a quilt: a square of paper for every residue pair, lying on a backing sheet.
export class Quilt {
  constructor(world, n, { cell = 1, gap = 0.1, y = 0.25, origin = [0, 0] } = {}) {
    this.world = world; this.n = n; this.cell = cell; this.y = y;
    this.origin = origin;
    const g = new THREE.PlaneGeometry(cell - gap, cell - gap).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, world.paper({ glow: 0, bump: 0.2, repeat: 0.15 }), n * n);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.lift = new Float32Array(n * n);
    this.color = new THREE.Color();
    for (let i = 0; i < n * n; i += 1) this.mesh.setColorAt(i, STOCK.white);
    this.layout();
    const side = n * cell + 1.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(side, 0.2, side), world.paper({ color: '#ffffff', glow: 0, repeat: 2 }));
    back.position.set(origin[0], 0.1, origin[1]);
    back.castShadow = true; back.receiveShadow = true;
    this.back = back;
    world.scene.add(back, this.mesh);
    world.shadowDirty = 3;
  }

  layout() {
    const { n, cell, y, origin } = this, half = (n * cell) / 2;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        M.makeTranslation(origin[0] - half + (j + 0.5) * cell, y + this.lift[i * n + j], origin[1] - half + (i + 0.5) * cell);
        this.mesh.setMatrixAt(i * n + j, M);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  set(i, j, color) { this.mesh.setColorAt(i * this.n + j, color); }
  commit() { this.mesh.instanceColor.needsUpdate = true; }

  // World point at the centre of a cell, and the cell under a world point.
  center(i, j) { const h = (this.n * this.cell) / 2; return new THREE.Vector3(this.origin[0] - h + (j + 0.5) * this.cell, this.y + 0.2, this.origin[1] - h + (i + 0.5) * this.cell); }
  cellAt(p) {
    const h = (this.n * this.cell) / 2, j = Math.floor((p.x - this.origin[0] + h) / this.cell), i = Math.floor((p.z - this.origin[1] + h) / this.cell);
    return i >= 0 && j >= 0 && i < this.n && j < this.n ? [i, j] : null;
  }

  dispose() {
    this.world.scene.remove(this.mesh, this.back);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.back.geometry.dispose(); this.back.material.dispose();
    this.world.shadowDirty = 3;
  }
}

// Thin strips of paper between two points. Used for contacts and for peptide bonds that the gas has stretched.
export class Threads {
  constructor(world, count, { width = 0.22, color = '#ffffff', shadows = false } = {}) {
    this.world = world; this.width = width;
    const g = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(g, world.paper({ color, glow: 0.2, bump: 0 }), count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.count = 0;
    this.max = count;
    this.c = new THREE.Color();
    world.scene.add(this.mesh);
  }
  clear() { this.mesh.count = 0; }
  add(a, b, color, width = this.width, group = null) {
    if (this.mesh.count >= this.max) return;
    const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b);
    if (group) { p.applyMatrix4(group); q.applyMatrix4(group); }
    const d = q.clone().sub(p), len = d.length() || 1e-3;
    Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len));
    M.compose(p, Q, S.set(width, len, width));
    const i = this.mesh.count;
    this.mesh.setMatrixAt(i, M);
    this.mesh.setColorAt(i, this.c.set(color));
    this.mesh.count = i + 1;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.world.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// A paper ribbon along a chain, wide in helices and sheets and narrow in loops.
export function ribbonGeometry(ca, colors, { steps = 7, wide = 1.15, narrow = 0.34 } = {}) {
  const n = ca.length, pts = ca.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const count = (n - 1) * steps + 1, pos = new Float32Array(count * 6), col = new Float32Array(count * 6), uv = new Float32Array(count * 4), idx = [];
  const width = pts.map((p, i) => { // helices and strands, read from C-alpha spacing alone
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)], d = a.distanceTo(b);
    return d < 6.2 || d > 11 ? wide : narrow;
  });
  let prev = null;
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), B = new THREE.Vector3(), c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let k = 0; k < count; k += 1) {
    const u = k / (count - 1), f = u * (n - 1), i = Math.min(n - 2, Math.floor(f)), t = f - i;
    const p = curve.getPoint(u);
    curve.getTangent(u, T);
    const a = curve.getPoint(Math.max(0, u - 1 / (n - 1))), b = curve.getPoint(Math.min(1, u + 1 / (n - 1)));
    Nn.copy(a).add(b).addScaledVector(p, -2);
    if (Nn.lengthSq() < 1e-6) Nn.set(0, 1, 0);
    B.crossVectors(T, Nn).normalize();
    if (prev && prev.dot(B) < 0) B.negate();
    prev = (prev ?? new THREE.Vector3()).copy(B);
    const w = THREE.MathUtils.lerp(width[i], width[i + 1], t);
    p.addScaledVector(B, w).toArray(pos, k * 6);
    p.addScaledVector(B, -2 * w).toArray(pos, k * 6 + 3);
    c0.copy(colors[i]).lerp(c1.copy(colors[i + 1]), t);
    c0.toArray(col, k * 6); c0.toArray(col, k * 6 + 3);
    uv.set([u * n * 0.2, 0, u * n * 0.2, 1], k * 4);
    if (k < count - 1) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Cut-paper clouds, hung in the sky behind the title.
export function cloud(world, x, y, z, s = 1) {
  const shape = new THREE.Shape();
  const lobes = 4 + Math.floor(Math.random() * 3), w = 34 * s;
  shape.moveTo(-w, 0);
  for (let i = 0; i < lobes; i += 1) {
    const x0 = -w + (2 * w * i) / lobes, x1 = -w + (2 * w * (i + 1)) / lobes, h = (10 + Math.random() * 12) * s * (1 - Math.abs(i + 0.5 - lobes / 2) / lobes);
    shape.bezierCurveTo(x0, h * 1.5, x1, h * 1.5, x1, 0);
  }
  shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10), new THREE.MeshBasicMaterial({ color: '#fffefa', side: THREE.DoubleSide, toneMapped: false }));
  m.position.set(x, y, z);
  world.scene.add(m);
  return m;
}
