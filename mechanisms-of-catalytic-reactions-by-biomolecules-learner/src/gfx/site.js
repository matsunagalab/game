// The active site. Atoms are jewels at measured positions; bonds are gold; every electron is one gold spark.
import * as THREE from 'three';
import { clothMaterial, bodyGeometry, bodyMaterial, Sparks } from './kit.js';
import { GOLD_LIB } from './shaders.js';
import { charge, neighbours } from '../chem/engine.js';
import { relax } from '../chem/relax.js';

const R = { H: 0.14, C: 0.25, N: 0.3, O: 0.3, P: 0.38, S: 0.36, Zn: 0.5, F: 0.28 };
const COL = { H: [0.92, 0.88, 0.82], C: [0.62, 0.47, 0.3], N: [0.18, 0.8, 0.62], O: [1.0, 0.25, 0.14], P: [1.0, 0.56, 0.14], S: [0.95, 0.8, 0.24], Zn: [0.5, 0.88, 0.8], F: [0.6, 0.95, 0.6] };

const JEWEL_VERT = /* glsl */`
in vec3 iPos; in float iR; in vec3 iCol; in float iGlow; out vec3 vW; out vec3 vL; out vec3 vC; out float vG; out vec3 vO;
void main(){ vO=position; vC=iCol; vG=iGlow; vec4 mv=modelViewMatrix*vec4(iPos+position*iR,1.); vW=mv.xyz; gl_Position=projectionMatrix*mv; }`;
const JEWEL_FRAG = /* glsl */`
precision highp float; in vec3 vW; in vec3 vC; in float vG; in vec3 vO; uniform vec3 uLight; uniform float uTime; out vec4 o;
void main(){ vec3 N=normalize(cross(dFdx(vW),dFdy(vW))); vec3 V=normalize(-vW); vec3 L=normalize(uLight);
 float nv=max(dot(N,V),0.); vec3 r=reflect(-V,N);
 float s=pow(max(dot(r,L),0.),26.)*2.4+pow(max(dot(r,normalize(L+vec3(-1.,.2,.1))),0.),12.)*.5;
 float inner=.5+.5*sin(dot(vO,vec3(9.,5.,7.))+uTime*.6);
 vec3 c=vC*(.08+.5*pow(nv,2.)*(.4+.6*inner)+.5*pow(1.-nv,2.)); c+=mix(vC,vec3(1.),.65)*s; c+=vC*vG*1.3; o=vec4(c,1.); }`;

const GOLDROD_VERT = /* glsl */`
in vec3 iA; in vec3 iB; in float iRad; in float iTone; out vec3 vN; out vec3 vW; out float vT; out float vS; 
void main(){ vec3 d=iB-iA; float l=length(d); vec3 a=d/max(l,1e-4); vec3 u=normalize(cross(a,abs(a.z)<.9?vec3(0.,0.,1.):vec3(1.,0.,0.))); vec3 v=cross(a,u);
 vec3 P=iA+a*position.y*l+(u*position.x+v*position.z)*iRad; vec3 Nn=normalize(u*position.x+v*position.z);
 vec4 mv=modelViewMatrix*vec4(P,1.); vW=mv.xyz; vN=normalMatrix*Nn; vT=iTone; vS=position.y*l; gl_Position=projectionMatrix*mv; }`;
const GOLDROD_FRAG = /* glsl */`
precision highp float; in vec3 vN; in vec3 vW; in float vT; in float vS; uniform vec3 uLight; out vec4 o;
void main(){ vec3 N=normalize(vN); vec3 V=normalize(-vW); vec3 L=normalize(uLight); vec3 H=normalize(L+V);
 float nv=max(dot(N,V),0.); float s=pow(max(dot(N,H),0.),28.); float d=max(dot(N,L),0.);
 vec3 g=vec3(1.,.68,.25); vec3 c=g*(.05+.34*d)+g*s*.9+g*pow(1.-nv,3.)*.25; c*=mix(.2,1.,vT); o=vec4(c,1.); }`;

const RIBBON_VERT = /* glsl */`
in vec2 ribbon; out vec2 vR; out vec3 vW; void main(){ vR=ribbon; vec4 mv=modelViewMatrix*vec4(position,1.); vW=mv.xyz; gl_Position=projectionMatrix*mv; }`;
const RIBBON_FRAG = /* glsl */`
precision highp float; in vec2 vR; in vec3 vW; uniform vec3 uLight; uniform float uAlpha; uniform float uHot; uniform float uBreak; uniform float uFlow;
${GOLD_LIB}
out vec4 o;
void main(){ float cr=0.; vec3 N=normalize(vec3((vR.y-.5)*1.1,0.2*sin(vR.x*18.),1.)); vec3 V=normalize(-vW);
 vec3 c=goldLeaf(vR*vec2(.12,.05)+vec2(.2,.1),N,V,normalize(uLight),vec2(1.,0.),1.,cr);
 c*=1.35; float run=exp(-pow((vR.x-uFlow)*7.,2.))*uHot; c+=vec3(1.6,1.0,.4)*run;
 float a=uAlpha*(1.-smoothstep(.0,.22,cr-.2+uBreak*.9)*uBreak);
 if(uBreak>0.){ c=mix(c,vec3(.32,.17,.09),uBreak*.7); }
 if(a<.02) discard; o=vec4(c*a,a); }`;

class Ribbon {
  constructor(stage) {
    this.N = 44;
    const n = this.N, vcount = (n + 1) * 2 + 3;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(vcount * 3); this.rib = new Float32Array(vcount * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('ribbon', new THREE.BufferAttribute(this.rib, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const h = (n + 1) * 2; idx.push(h, h + 1, h + 2);
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { tLeaf: { value: stage.leaf }, uLight: { value: new THREE.Vector3(0.3, 0.5, 1) }, uAlpha: { value: 1 }, uHot: { value: 0 }, uBreak: { value: 0 }, uFlow: { value: -1 } } });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8;
  }

  // a, c, b are points in the site's frame, drawn in the plane z.
  shape(a, c, b, width = 0.075, head = true) {
    const n = this.N, { pos, rib } = this;
    const P = (t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]; };
    const D = (t) => [2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];
    let len = 0, prev = P(0);
    for (let i = 1; i <= 12; i++) { const q = P(i / 12); len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
    const headLen = head ? Math.min(0.42, len * 0.3) : 0, tEnd = 1 - headLen / Math.max(len, 0.01);
    for (let i = 0; i <= n; i++) {
      const t = i / n * tEnd, p = P(t), d = D(t), l = Math.hypot(d[0], d[1]) || 1, nx = -d[1] / l, ny = d[0] / l;
      const w = width * (0.25 + 0.75 * Math.min(1, t * 2.4)) * (1 + 0.12 * Math.sin(t * 9));
      pos.set([p[0] + nx * w, p[1] + ny * w, p[2], p[0] - nx * w, p[1] - ny * w, p[2]], i * 6);
      rib.set([t, 0, t, 1], i * 4);
    }
    const h = (n + 1) * 2, e = P(tEnd), d = D(tEnd), l = Math.hypot(d[0], d[1]) || 1, nx = -d[1] / l, ny = d[0] / l, hw = head ? 0.2 : 0, tip = head ? P(1) : e;
    pos.set([e[0] + nx * hw, e[1] + ny * hw, e[2], e[0] - nx * hw, e[1] - ny * hw, e[2], tip[0], tip[1], tip[2]], h * 3);
    rib.set([1, 0, 1, 1, 1.05, 0.5], h * 2);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.ribbon.needsUpdate = true;
    this.curve = P; this.a = a; this.b = b; this.c = c;
  }
}

export class SiteScene {
  constructor(stage, bodies) {
    this.stage = stage; this.bodies = bodies;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0.004, 0.003, 0.01);
    this.camera = new THREE.PerspectiveCamera(11, 1, 1, 400);
    this.light = new THREE.Vector3(0.3, 0.5, 1);
    this.wallMat = clothMaterial(stage, { gild: [0, 0, 0], wax: 0.5, mirror: true, dim: 0.8 });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.wallMat);
    scene.add(this.wall);
    this.root = new THREE.Group(); scene.add(this.root);
    this.bodyMat = bodyMaterial(stage, { rim: 1.15 });
    this.body = new THREE.Mesh(new THREE.BufferGeometry(), this.bodyMat); this.root.add(this.body);
    // The sculpture is scenery. Once it is drawn, the jewels go on top of it, always in reach of a finger.
    this.wall.renderOrder = -3; this.body.renderOrder = -2;
    this.body.onAfterRender = (r) => r.clearDepth();
    this.body.frustumCulled = false;
    this.ribbons = [];
    this.pool = [];
    this.zoom = 1;
    this.pad = { top: 90, bottom: 260, left: 0, right: 0 };
  }

  // ---------------------------------------------------------------- building
  load(key, mech, site, cell) {
    this.key = key; this.site = site; this.mech = mech;
    const { root } = this;
    for (const o of [this.jewels, this.rods, this.ctx, this.sparks?.mesh, this.threadSparks?.mesh]) if (o) { root.remove(o); o.geometry?.dispose(); }
    for (const r of this.ribbons) root.remove(r.mesh);
    this.ribbons = [];
    if (this.bodies[key]) { this.body.geometry.dispose(); this.body.geometry = bodyGeometry(this.bodies[key]); this.body.visible = true; } else this.body.visible = false;
    const cx = cell % 3, cy = 2 - Math.floor(cell / 3);
    this.wallMat.uniforms.uRect.value.set(cx / 3, cy / 3, 1 / 3, 1 / 3);
    // Jewels.
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.IcosahedronGeometry(1, 1).toNonIndexed());
    delete geo.attributes.uv;
    const nAtoms = mech.atoms.length;
    this.iPos = new Float32Array(nAtoms * 3); this.iR = new Float32Array(nAtoms); this.iCol = new Float32Array(nAtoms * 3); this.iGlow = new Float32Array(nAtoms);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.iPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iR', new THREE.InstancedBufferAttribute(this.iR, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.iCol, 3));
    geo.setAttribute('iGlow', new THREE.InstancedBufferAttribute(this.iGlow, 1).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = nAtoms;
    mech.atoms.forEach((a, i) => this.iCol.set(COL[a.el], i * 3));
    this.jewels = new THREE.Mesh(geo, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: JEWEL_VERT, fragmentShader: JEWEL_FRAG, uniforms: { uLight: { value: this.light }, uTime: { value: 0 } } }));
    this.jewels.frustumCulled = false; root.add(this.jewels);
    // Gold rods: the bonds of the reactive atoms. Up to two per bond.
    const rodGeo = () => {
      const g = new THREE.InstancedBufferGeometry().copy(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0));
      delete g.attributes.uv; delete g.attributes.normal; return g;
    };
    const maxRods = 110;
    this.iA = new Float32Array(maxRods * 3); this.iB = new Float32Array(maxRods * 3); this.iRad = new Float32Array(maxRods); this.iTone = new Float32Array(maxRods);
    const rg = rodGeo();
    rg.setAttribute('iA', new THREE.InstancedBufferAttribute(this.iA, 3).setUsage(THREE.DynamicDrawUsage));
    rg.setAttribute('iB', new THREE.InstancedBufferAttribute(this.iB, 3).setUsage(THREE.DynamicDrawUsage));
    rg.setAttribute('iRad', new THREE.InstancedBufferAttribute(this.iRad, 1).setUsage(THREE.DynamicDrawUsage));
    rg.setAttribute('iTone', new THREE.InstancedBufferAttribute(this.iTone, 1).setUsage(THREE.DynamicDrawUsage));
    rg.instanceCount = 0;
    const rodMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: GOLDROD_VERT, fragmentShader: GOLDROD_FRAG, uniforms: { uLight: { value: this.light } } });
    this.rods = new THREE.Mesh(rg, rodMat); this.rods.frustumCulled = false; root.add(this.rods);
    // Context sticks: dim, thin, and they never move.
    const cg = rodGeo(), cb = site.ctxBonds, nc = cb.length;
    const cA = new Float32Array(nc * 3), cB = new Float32Array(nc * 3), cR = new Float32Array(nc).fill(0.042), cT = new Float32Array(nc).fill(0.3);
    cb.forEach(([p, q], i) => { cA.set(p, i * 3); cB.set(q, i * 3); });
    cg.setAttribute('iA', new THREE.InstancedBufferAttribute(cA, 3)); cg.setAttribute('iB', new THREE.InstancedBufferAttribute(cB, 3));
    cg.setAttribute('iRad', new THREE.InstancedBufferAttribute(cR, 1)); cg.setAttribute('iTone', new THREE.InstancedBufferAttribute(cT, 1));
    cg.instanceCount = nc;
    this.ctx = new THREE.Mesh(cg, rodMat); this.ctx.frustumCulled = false; root.add(this.ctx);
    this.sparks = new Sparks(260); root.add(this.sparks.mesh);
    this.threadSparks = new Sparks(160); root.add(this.threadSparks.mesh);
    this.electrons = []; this.slots = new Map(); this.movers = [];
    this.pos = {}; this.want = {};
    for (const a of mech.atoms) { this.pos[a.id] = site.pos[a.id].slice(); this.want[a.id] = site.pos[a.id].slice(); }
    this.fade = {}; for (const a of mech.atoms) this.fade[a.id] = 0;
    this.st = null; this.override = null; this.loopPts = null; this.glowWant = null; this.snap = true;
    this.fit();
  }

  fit() {
    const { stage, camera, site, mech } = this, { w, h } = stage;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const absent = new Set(mech.absent || []);
    const list = mech.atoms.filter((a) => !absent.has(a.id)).map((a) => site.pos[a.id]);
    const xs = list.map((p) => p[0]), ys = list.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const bx = (x0 + x1) / 2, by = (y0 + y1) / 2, bw = x1 - x0 + 2.0, bh = y1 - y0 + 2.2;
    const { top, bottom, left, right } = this.pad;
    const freeW = w - left - right, freeH = h - top - bottom;
    const scale = Math.min(freeW / bw, freeH / bh, 60);      // pixels per Å
    this.pxPerA = scale;
    const viewH = h / scale, D = viewH / (2 * Math.tan(camera.fov * Math.PI / 360));
    const sx = (left + freeW / 2 - w / 2) / scale, sy = (h / 2 - (top + freeH / 2)) / scale;
    this.camWant = [bx - sx, by - sy, D];
    if (!this.camNow || this.snap) { this.camNow = this.camWant.slice(); this.snap = false; }
    this.placeCamera();
    const wh = viewH * 2.2;
    this.wall.scale.set(wh * camera.aspect * 1.1, wh * camera.aspect * 2.2, 1);
    this.wall.position.set(camera.position.x, camera.position.y, -40);
    const zs = list.map((p) => p[2]);
    this.bodyMat.uniforms.uClip.value = Math.max(...zs) + 1.2;
    this.bodyMat.uniforms.uFocus.value.set(bx, by, 0);
  }

  placeCamera() {
    const { camera } = this, c = this.camNow;
    camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[0], c[1], 0); camera.updateMatrixWorld();
  }

  setPad(p) { Object.assign(this.pad, p); if (this.site) this.fit(); }

  // ---------------------------------------------------------------- state
  setState(st, arrow) {
    this.st = st;
    this.want = relax(st, this.site.pos, this.want);
    this.rebuildSlots(st, arrow);
    this.refreshRods = true;
  }

  // One slot for every electron pair the state holds.
  slotKeys(st) {
    const { spec } = st, { n, atoms } = spec, keys = [];
    for (let i = 0; i < n; i++) {
      if (!st.on[i]) continue;
      for (let k = 0; k < st.lp[i]; k++) keys.push(`L${i}:${k}`);
      for (let j = i + 1; j < n; j++) { if (!st.on[j]) continue; for (let o = 0; o < st.b[i * n + j]; o++) keys.push(`B${i}:${j}:${o}`); }
    }
    return keys;
  }

  rebuildSlots(st, arrow) {
    const keys = this.slotKeys(st), old = this.slots, next = new Map();
    const free = [];
    const fresh = keys.filter((k) => !old.has(k));
    for (const [k, v] of old) if (!keys.includes(k)) free.push(...v); else next.set(k, v);
    for (const k of fresh) {
      const pair = [free.pop() ?? this.newElectron(), free.pop() ?? this.newElectron()];
      next.set(k, pair);
      if (arrow) pair.forEach((e, i) => { e.fly = { t: -i * 0.09, curve: arrow, dur: 0.75 }; });
    }
    for (const e of free) e.dead = true;
    for (const [k, v] of next) { v[0].slot = k; v[0].side = -1; v[1].slot = k; v[1].side = 1; }
    this.slots = next;
    this.electrons = this.electrons.filter((e) => !e.dead);
  }

  newElectron() { const e = { p: [0, 0, 0], phase: Math.random() * 6.28, born: 0 }; this.electrons.push(e); return e; }

  lonePairDirs(i) {
    // Lone pairs sit in the widest gaps around the atom, as seen on the screen.
    const { st, spec } = { st: this.st, spec: this.st.spec };
    const id = spec.atoms[i].id, p = this.pos[id];
    const nb = neighbours(st, i).map((j) => this.pos[spec.atoms[j].id]).filter(Boolean).map((q) => Math.atan2(q[1] - p[1], q[0] - p[0]));
    const k = st.lp[i], out = [];
    let gaps = nb.length ? [...nb].sort((a, b) => a - b).map((a, n, l) => { const b = n + 1 < l.length ? l[n + 1] : l[0] + Math.PI * 2; return { a, w: b - a }; }) : [{ a: -0.6, w: Math.PI * 2 }];
    for (let c = 0; c < k; c++) {
      gaps.sort((x, y) => y.w / (y.n || 1) - x.w / (x.n || 1));
      gaps[0].n = (gaps[0].n || 1) + 1;
    }
    for (const g of gaps) { const m = (g.n || 1) - 1; for (let q = 1; q <= m; q++) out.push(g.a + g.w * q / (m + 1)); }
    return out;
  }

  slotPos(key, side, t, e) {
    const { spec } = this.st, { atoms } = spec;
    if (key[0] === 'L') {
      const [i, k] = key.slice(1).split(':').map(Number);
      const dirs = this.lpCache[i] || (this.lpCache[i] = this.lonePairDirs(i));
      const a = atoms[i], p = this.pos[a.id], ang = dirs[k] ?? 0, r = R[a.el] + 0.2;
      const spin = Math.sin(t * 1.6 + e.phase) * 0.05;
      const cx = p[0] + Math.cos(ang) * r, cy = p[1] + Math.sin(ang) * r;
      return [cx - Math.sin(ang) * (0.085 + spin) * side, cy + Math.cos(ang) * (0.085 + spin) * side, p[2] + 0.3];
    }
    const [i, j, o] = key.slice(1).split(':').map(Number);
    const p = this.pos[atoms[i].id], q = this.pos[atoms[j].id];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const order = this.st.b[i * spec.n + j];
    const lane = order === 1 ? 0 : (o === 0 ? -0.075 : 0.075);
    const f = 0.5 + side * 0.17 + 0.09 * Math.sin(t * 0.9 + e.phase);
    return [p[0] + dx * f + nx * lane, p[1] + dy * f + ny * lane, p[2] + (q[2] - p[2]) * f + 0.12];
  }

  // ---------------------------------------------------------------- frame
  update(t, dt, pointer) {
    const { camera, stage } = this;
    const m = stage.reduced ? 0 : 1, a = t * 0.2 * m;
    this.light.set(Math.sin(a) * 0.6 + pointer.x * 0.4, 0.5 + Math.cos(a * 0.7) * 0.3 + pointer.y * 0.3, 1);
    if (!this.site) return;
    if (this.camWant) { for (let i = 0; i < 3; i++) this.camNow[i] += (this.camWant[i] - this.camNow[i]) * Math.min(1, dt * 6); this.placeCamera(); }
    this.wallMat.uniforms.uLight.value.copy(this.light); this.bodyMat.uniforms.uLight.value.copy(this.light);
    this.root.rotation.y = Math.sin(t * 0.21) * 0.012 * m * (this.frozen ? 0 : 1);
    this.root.rotation.x = Math.cos(t * 0.17) * 0.009 * m * (this.frozen ? 0 : 1);
    this.root.updateMatrixWorld();
    if (!this.st) return;
    const { spec } = this.st, { atoms } = spec, k = Math.min(1, dt * 5.5);
    let moving = false;
    atoms.forEach((a0, i) => {
      const p = this.pos[a0.id], q = (this.override && this.override[a0.id]) || this.want[a0.id];
      for (let c = 0; c < 3; c++) { const d = q[c] - p[c]; if (Math.abs(d) > 0.002) moving = true; p[c] += d * k; }
      this.fade[a0.id] += ((this.st.on[i] ? 1 : 0) - this.fade[a0.id]) * Math.min(1, dt * 4);
      this.iPos.set(p, i * 3);
      this.iR[i] = R[a0.el] * this.fade[a0.id];
      this.iGlow[i] += ((this.glowWant?.[i] || 0) - this.iGlow[i]) * Math.min(1, dt * 10);
    });
    const ga = this.jewels.geometry.attributes; ga.iPos.needsUpdate = ga.iR.needsUpdate = ga.iGlow.needsUpdate = true;
    this.jewels.material.uniforms.uTime.value = t;
    this.lpCache = [];
    // Bonds.
    let r = 0;
    const n = spec.n;
    const rod = (p, q, rad, tone) => { this.iA.set(p, r * 3); this.iB.set(q, r * 3); this.iRad[r] = rad; this.iTone[r] = tone; r += 1; };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!this.st.on[i] || !this.st.on[j]) continue;
        const o = this.st.b[i * n + j], p = this.pos[atoms[i].id], q = this.pos[atoms[j].id];
        const h = atoms[i].el === 'H' || atoms[j].el === 'H';
        if (o === 1) rod(p, q, h ? 0.034 : 0.05, 0.85);
        if (o >= 2) {
          const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.075, ny = dx / l * 0.075;
          rod([p[0] + nx, p[1] + ny, p[2]], [q[0] + nx, q[1] + ny, q[2]], 0.04, 0.95);
          rod([p[0] - nx, p[1] - ny, p[2]], [q[0] - nx, q[1] - ny, q[2]], 0.04, 0.95);
        }
        if (this.st.c[i * n + j]) rod(p, q, 0.025, 0.45);
      }
    }
    if (this.loopPts) {
      // A smooth curve through the real Cα positions of the loop.
      const L = this.loopPts, cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      let prev = L[1];
      for (let i = 1; i + 2 < L.length; i++) for (let k = 1; k <= 4 && r < 88; k++) {
        const t = k / 4, q = [0, 1, 2].map((c2) => cr(L[i - 1][c2], L[i][c2], L[i + 1][c2], L[i + 2][c2], t));
        rod(prev, q, 0.1, 0.62); prev = q;
      }
    }
    const rg = this.rods.geometry; rg.instanceCount = r; for (const nm of ['iA', 'iB', 'iRad', 'iTone']) rg.attributes[nm].needsUpdate = true;
    // Electrons, one spark each. The ones in flight run along the arrow.
    const S = this.sparks; let c = 0;
    for (const e of this.electrons) {
      if (c >= S.count) break;
      const home = e.slot ? this.slotPos(e.slot, e.side, t, e) : e.p;
      let p = home, glow = 1.15, size = 0.075;
      if (e.fly) {
        e.fly.t += dt / e.fly.dur;
        const u = Math.min(1, Math.max(0, e.fly.t)), ease = u * u * (3 - 2 * u), q = e.fly.curve(ease);
        p = [q[0] + (home[0] - q[0]) * ease * ease, q[1] + (home[1] - q[1]) * ease * ease, q[2] + (home[2] - q[2]) * ease * ease];
        glow = 2.6; size = 0.12;
        if (e.fly.t >= 1) e.fly = null;
      }
      e.p = p;
      S.offset.set(p, c * 3); S.size[c] = size; S.glow[c] = glow; c += 1;
    }
    for (const f of this.movers) {
      f.t += dt; if (f.t > f.life || c >= S.count) continue;
      f.v[1] -= dt * 1.6;
      const q = f.p; q[0] += f.v[0] * dt; q[1] += f.v[1] * dt;
      S.offset.set(q, c * 3); S.size[c] = 0.05 * (1 - f.t / f.life); S.glow[c] = f.g * (1 - f.t / f.life); c += 1;
    }
    this.movers = this.movers.filter((f) => f.t < f.life);
    for (let i = c; i < S.count; i++) { S.size[i] = 0; }
    S.flush();
    // Threads: hydrogen bonds and metal ligands, as lines of tiny dots.
    const T = this.threadSparks; let d = 0;
    for (const th of this.site.threads) {
      const a0 = typeof th.a === 'string' ? this.pos[th.a] : th.a, b0 = typeof th.b === 'string' ? this.pos[th.b] : th.b;
      if (typeof th.a === 'string' && this.fade[th.a] < 0.5) continue;
      if (typeof th.b === 'string' && this.fade[th.b] < 0.5) continue;
      if (Math.hypot(a0[0] - b0[0], a0[1] - b0[1], a0[2] - b0[2]) > 3.5) continue;
      const L = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]), N = Math.min(9, Math.max(3, Math.round(L / 0.3)));
      for (let k2 = 1; k2 < N && d < T.count; k2++) { const f = k2 / N; T.offset.set([a0[0] + (b0[0] - a0[0]) * f, a0[1] + (b0[1] - a0[1]) * f, a0[2] + (b0[2] - a0[2]) * f], d * 3); T.size[d] = 0.028; T.glow[d] = 0.42; d += 1; }
    }
    for (let i = d; i < T.count; i++) T.size[i] = 0;
    T.flush();
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const rb = this.ribbons[i];
      if (rb.life !== undefined) {
        rb.life -= dt;
        rb.mat.uniforms.uFlow.value = Math.min(1.3, rb.mat.uniforms.uFlow.value + dt * 1.8);
        if (rb.broken) { rb.mat.uniforms.uBreak.value = Math.min(1, rb.mat.uniforms.uBreak.value + dt * 2.6); this.shakeRibbon(rb, dt); }
        if (rb.life < 0.5) rb.mat.uniforms.uAlpha.value = Math.max(0, rb.life / 0.5);
        if (rb.life <= 0) { this.root.remove(rb.mesh); this.ribbons.splice(i, 1); this.pool.push(rb); }
      }
    }
    this.moving = moving;
  }

  shakeRibbon(rb, dt) { rb.mesh.position.y -= dt * 0.7; }

  // ---------------------------------------------------------------- touch and arrows
  toScreen(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.root.matrixWorld).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.stage.w, (0.5 - v.y * 0.5) * this.stage.h];
  }

  // From a screen point to the plane in front of the atoms.
  toWorld(x, y, z) {
    const v = new THREE.Vector3(x / this.stage.w * 2 - 1, 1 - y / this.stage.h * 2, 0.5).unproject(this.camera);
    const d = v.sub(this.camera.position).normalize(), s = (z - this.camera.position.z) / d.z;
    return [this.camera.position.x + d.x * s, this.camera.position.y + d.y * s, z];
  }

  atomScreen(i) { return this.toScreen(this.pos[this.st.spec.atoms[i].id]); }

  ribbon() {
    const r = this.pool.pop() || new Ribbon(this.stage);
    Object.assign(r.mat.uniforms.uAlpha, { value: 1 }); r.mat.uniforms.uBreak.value = 0; r.mat.uniforms.uFlow.value = -1; r.mat.uniforms.uHot.value = 1; r.mat.uniforms.uLight.value = this.light;
    r.life = undefined; r.broken = false; r.mesh.position.set(0, 0, 0);
    this.root.add(r.mesh); this.ribbons.push(r);
    return r;
  }

  burst(p, n = 14, g = 1.6) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 0.5 + Math.random() * 1.4; this.movers.push({ p: p.slice(), v: [Math.cos(a) * s, Math.sin(a) * s + 0.5, 0], t: 0, life: 0.5 + Math.random() * 0.6, g }); }
  }
}
