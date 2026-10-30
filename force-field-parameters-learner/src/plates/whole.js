// The last part: a backbone map sculpted by hand, then the whole force field on a real chain.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Sticks, Sparks, Links, INK, Burst } from '../gfx.js';
import { REF, save, frcmod, PLATES, TIERS, persist } from '../save.js';
import { backbone, buildPolyAla, makePeptideSystem, hbonds } from '../physics/peptide.js';
import { GRID, STEP, BASINS, targetPopulation, startingPopulation, freeEnergy, populationOf, overlap, sample, ramaTerm } from '../physics/rama.js';
import { gauss, dihedral, DEG } from '../physics/md.js';
import { typeset } from '../ui.js';

const SIZE = 9, HEIGHT = 0.42;
const toX = phi => phi / 360 * SIZE, toZ = psi => -psi / 360 * SIZE;

function terrain() {
  const n = GRID + 1, g = new THREE.PlaneGeometry(SIZE, SIZE, GRID, GRID);
  g.rotateX(-Math.PI / 2);
  const c = g.attributes.position.count;
  g.setAttribute('aF', new THREE.BufferAttribute(new Float32Array(c), 1));
  g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(c), 1));
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uMorph: { value: 0 }, uGold: { value: INK.gold.clone() }, uWhite: { value: INK.white.clone() } },
    vertexShader: `
      attribute float aF, aT; uniform float uMorph; varying float vF, vT; varying vec3 vP;
      void main(){
        vF = aF; vT = aT;
        vec3 p = position; p.y = aF*${HEIGHT.toFixed(2)};
        float a = position.x/${SIZE.toFixed(1)}*6.28318, b = position.z/${SIZE.toFixed(1)}*6.28318;
        float R = 3.1, r = 1.5 + aF*.12;
        vec3 t = vec3((R+r*cos(b))*cos(a), r*sin(b), (R+r*cos(b))*sin(a));
        p = mix(p, t, uMorph);
        vP = p;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `
      uniform vec3 uGold, uWhite; varying float vF, vT; varying vec3 vP;
      float iso(float v, float step, float w){ float x = v/step, f = fwidth(x); float d = abs(fract(x-.5)-.5)/max(f,1e-4); return (1.-smoothstep(0.,w,d))*smoothstep(.003,.02,f); }
      void main(){
        float low = exp(-max(vF,0.)/.45);
        vec3 c = mix(vec3(.012,.05,.14), vec3(.03,.13,.3), smoothstep(0.,7.,vF));
        c = mix(c, uGold*.6, low*.8);
        c += uGold*iso(vF,.5,1.1)*.7;
        float tl = max(iso(vT,1.5,1.3)*step(vT,4.6), 0.);
        c = mix(c, uWhite*1.05, tl*.85);
        gl_FragColor = vec4(c,1.);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// A small chain with every residue at the same (φ,ψ): what a point on the map means in space.
class Preview {
  constructor(parent, n = 8) {
    this.n = n;
    this.atoms = new Atoms(4 * n, { detail: 3 });
    this.sticks = new Sticks(4 * n - 1, { radius: 0.09, color: INK.C });
    for (let i = 0; i < n; i++) {
      this.atoms.setColor(4 * i, INK.N); this.atoms.setColor(4 * i + 1, INK.C); this.atoms.setColor(4 * i + 2, INK.C); this.atoms.setColor(4 * i + 3, INK.O);
    }
    this.atoms.flush(true);
    this.group = new THREE.Group();
    this.group.add(this.sticks, this.atoms);
    parent.add(this.group);
    this.cur = [-120, 130];
  }
  set(phi, psi) {
    // Ease through angle space so the chain morphs instead of snapping.
    const wrap = a => ((a + 180) % 360 + 360) % 360 - 180;
    this.cur[0] = wrap(this.cur[0] + wrap(phi - this.cur[0]) * 0.18);
    this.cur[1] = wrap(this.cur[1] + wrap(psi - this.cur[1]) * 0.18);
    const b = backbone(Array(this.n).fill(this.cur));
    let cx = 0, cy = 0, cz = 0;
    for (const r of b) { cx += r.CA[0]; cy += r.CA[1]; cz += r.CA[2]; }
    cx /= this.n; cy /= this.n; cz /= this.n;
    const s = 0.145;
    const P = p => [(p[0] - cx) * s, (p[1] - cy) * s, (p[2] - cz) * s];
    let k = 0, st = 0, prev = null;
    b.forEach(r => {
      const N = P(r.N), CA = P(r.CA), C = P(r.C), O = P(r.O);
      this.atoms.setAtom(k++, ...N, 0.2); this.atoms.setAtom(k++, ...CA, 0.19); this.atoms.setAtom(k++, ...C, 0.19); this.atoms.setAtom(k++, ...O, 0.18);
      if (prev) this.sticks.setStick(st++, ...prev, ...N, 0.05);
      this.sticks.setStick(st++, ...N, ...CA, 0.05); this.sticks.setStick(st++, ...CA, ...C, 0.05); this.sticks.setStick(st++, ...C, ...O, 0.05);
      prev = C;
    });
    this.atoms.flush(); this.sticks.flush();
  }
}

export class MapPlate extends Plate {
  enter() {
    const r = this.root;
    this.T = freeEnergy(targetPopulation());
    this.Q = targetPopulation();
    this.F = save.ff.map ? Float64Array.from(save.ff.map, v => v / 100) : freeEnergy(startingPopulation());
    this.mesh = terrain();
    this.mesh.material.uniforms.uMorph.value = 1;
    this.mesh.position.y = -1.2;
    r.add(this.mesh);
    this.morph = 1;
    this.syncMesh(true);
    this.cdf = new Float64Array(GRID * GRID);
    this.N = this.game.mobile ? 90 : 170;
    this.walk = new Float32Array(this.N * 2);
    this.fire = new Sparks(this.N, { size: 0.16, color: INK.white });
    r.add(this.fire);
    this.rebuild();
    for (let i = 0; i < this.N; i++) this.spawn(i);
    this.prev = new Preview(r);
    this.prev.group.position.set(0, 1.9, -6.1);
    this.stage.frame(6.4, [0, 0.2, -0.7], { pitch: 0.86 });
    this.ui.note('φ and ψ wrap around, so this map is a doughnut, unrolled. White contours are real proteins, gold is yours. <b>Touch to see the shape, drag to sculpt.</b>');
    this.mode = 'dig';
    this.bDig = this.ui.button('Dig a valley', () => this.setMode('dig'), 'on');
    this.bRaise = this.ui.button('Raise a hill', () => this.setMode('raise'));
    this.rd = this.ui.readout('overlap with real proteins');
    this.rdA = this.ui.readout('helix');
    this.ui.sender(t => this.send(t));
    BASINS.slice(0, 4).forEach(b => this.ui.tag(b.name, () => this.morph < 0.05 ? [toX(b.phi + (b.name === 'β strand' ? -32 : b.name === 'PPII' ? 22 : 0)), 0.15, toZ(b.psi + 34)] : null));
    this.look = [-120, 130];
    this.press = false;
    this.score();
  }
  setMode(m) { this.mode = m; this.bDig.classList.toggle('on', m === 'dig'); this.bRaise.classList.toggle('on', m === 'raise'); }
  syncMesh(all) {
    const g = this.mesh.geometry, n = GRID + 1, f = g.attributes.aF, t = g.attributes.aT;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const q = i + n * j;
      const phi = -180 + i * STEP, psi = 180 - j * STEP;
      f.setX(q, Math.min(8, sample(this.F, phi, psi)));
      if (all) t.setX(q, sample(this.T, phi, psi));
    }
    f.needsUpdate = true;
    if (all) t.needsUpdate = true;
  }
  rebuild() {
    this.P = populationOf(this.F);
    let s = 0;
    for (let q = 0; q < this.P.length; q++) { s += this.P[q]; this.cdf[q] = s; }
    this.fit = overlap(this.P, this.Q);
  }
  spawn(i) {
    const u = Math.random();
    let lo = 0, hi = this.cdf.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cdf[m] < u) lo = m + 1; else hi = m; }
    this.walk[2 * i] = -180 + ((lo % GRID) + Math.random()) * STEP;
    this.walk[2 * i + 1] = -180 + ((lo / GRID | 0) + Math.random()) * STEP;
  }
  score() {
    const f = this.fit;
    this.ui.setTier(f >= 0.965 ? 3 : f >= 0.92 ? 2 : f >= 0.82 ? 1 : 0);
    this.rd.set(`${(f * 100).toFixed(0)}%`);
    let a = 0;
    const b = BASINS[0];
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const phi = -180 + (i + 0.5) * STEP, psi = -180 + (j + 0.5) * STEP;
      if (Math.abs(phi - b.phi) < 32 && Math.abs(psi - b.psi) < 32) a += this.P[i + GRID * j];
    }
    this.rdA.set(`${(a * 100).toFixed(0)}% <span class="ref">/ 46%</span>`);
  }
  update(dt) {
    if (this.morph > 0) {
      this.morphT = (this.morphT ?? 0) + dt;
      if (this.morphT > 1.4) {
        this.morph = Math.max(0, this.morph - dt / 1.8);
        const x = this.morph;
        this.mesh.material.uniforms.uMorph.value = x * x * (3 - 2 * x);
      }
    }
    const g = { phi: 0, psi: 0 };
    const rt = 0.596, sig = 3.2, drift = sig * sig / 2 / rt;
    for (let i = 0; i < this.N; i++) {
      let p = this.walk[2 * i], q = this.walk[2 * i + 1];
      sample(this.F, p, q, g);
      p += -drift * g.phi + sig * gauss(); q += -drift * g.psi + sig * gauss();
      this.walk[2 * i] = p; this.walk[2 * i + 1] = q;
      if (Math.random() < 0.012) this.spawn(i);
      const pw = ((p + 180) % 360 + 360) % 360 - 180, qw = ((q + 180) % 360 + 360) % 360 - 180;
      this.fire.put(i, toX(pw), sample(this.F, pw, qw) * HEIGHT - 1.2 + 0.08, toZ(qw));
    }
    this.fire.flush();
    this.fire.material.uniforms.uOpacity.value = this.morph < 0.3 ? 1 : 0;
    if (this.press && this.at) {
      const [phi, psi] = this.at, s = this.mode === 'dig' ? -1 : 1, F = this.F;
      for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
        let dp = -180 + (i + 0.5) * STEP - phi, dq = -180 + (j + 0.5) * STEP - psi;
        dp = ((dp + 180) % 360 + 360) % 360 - 180; dq = ((dq + 180) % 360 + 360) % 360 - 180;
        const d2 = (dp * dp + dq * dq) / (2 * 15 * 15);
        if (d2 < 6) F[i + GRID * j] = Math.min(9, Math.max(-7, F[i + GRID * j] + s * dt * 2.6 * Math.exp(-d2)));
      }
      this.syncMesh(false);
      this.dirty = true;
    }
    this.tk = (this.tk ?? 0) + dt;
    if (this.dirty && this.tk > 0.12) { this.tk = 0; this.dirty = false; this.rebuild(); this.score(); }
    const t = this.at ?? [this.walk[0], this.walk[1]];
    this.prev.set(t[0], t[1]);
    this.prev.group.rotation.y += dt * 0.25;
    this.atDirty = false;
  }
  pick(x, y) {
    if (this.morph > 0.2) return null;
    const ray = this.stage.ray(x, y).ray, plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.2 - 0.9);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit || Math.abs(hit.x) > SIZE / 2 + 0.5 || Math.abs(hit.z) > SIZE / 2 + 0.5) return null;
    return [THREE.MathUtils.clamp(hit.x / SIZE * 360, -180, 180), THREE.MathUtils.clamp(-hit.z / SIZE * 360, -180, 180)];
  }
  down(x, y) {
    const p = this.pick(x, y);
    if (!p) return false;
    this.at = p; this.press = true;
    return true;
  }
  move(x, y) { if (this.press) { const p = this.pick(x, y); if (p) this.at = p; } }
  up() { this.press = false; this.at = null; }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'It resembles a protein if you squint.', 2: 'A respectable map.', 3: 'That map could go in a force-field release.' }[tier],
      lesson: 'A grid of energy corrections on (φ,ψ) is a real force-field term, called CMAP. CHARMM added one in 2004 after simple torsions could not fix helix and sheet balance, and AMBER’s ff19SB uses one too. For decades force fields were tuned too helical or not helical enough: the map you just drew is where that argument happened.',
      apply: ff => { ff.map = Array.from(this.F, v => Math.round(v * 100)); },
    });
  }
  solve() { this.F = Float64Array.from(this.T); this.syncMesh(false); this.rebuild(); this.score(); }
}

// A smooth flat ribbon through the Cα trace, with its width set by the C=O direction.
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

const RES = 10, RADII = { N: 0.55, H: 0.3, CA: 0.56, CB: 0.62, C: 0.55, O: 0.52, CH3A: 0.62, CH3N: 0.62 };
const COLORS = { N: INK.N, H: INK.H, CA: INK.C, CB: INK.C, C: INK.C, O: INK.O, CH3A: INK.C, CH3N: INK.C };

export class Fold extends Plate {
  enter() {
    const r = this.root;
    const stored = save.ff.map ? Float64Array.from(save.ff.map, v => v / 100) : freeEnergy(targetPopulation());
    const low = stored.reduce((a, b) => Math.min(a, b), Infinity);
    this.F = stored.map(v => Math.min(v - low, 2.8));   // barriers capped so folding fits in a minute of screen time
    this.top = buildPolyAla(RES, Array(RES).fill([-120, 130]));
    const qs = Math.max(0.7, Math.min(1.3, (save.ff.q ?? REF.qO) / REF.qO));
    this.sys = makePeptideSystem(this.top, { rama: ramaTerm(this.F), dielectric: 3 });
    this.sys.chargeScale = qs;
    this.sys.sigmaScale = Math.max(0.93, Math.min(1.07, (save.ff.sigma ?? REF.sigmaAr) / REF.sigmaAr));
    this.sys.epsScale = Math.max(0.6, Math.min(1.5, (save.ff.eps ?? REF.epsAr) / REF.epsAr));
    this.sys.buildPairs();
    this.sys.minimize(150);
    this.T = 330;
    this.sys.setTemperature(this.T);
    const n = this.top.names.length;
    this.atoms = new Atoms(n, { detail: 4 });
    this.top.names.forEach((s, i) => { this.atoms.setColor(i, COLORS[s], s === 'H' ? 0.08 : 0); this.atoms.radii[i] = RADII[s]; });
    this.atoms.flush(true);
    this.sticks = new Sticks(this.top.bondList.length, { radius: 0.13, color: INK.C });
    this.links = new Links(24, { color: INK.gold, opacity: 1 });
    this.ribbon = new Ribbon(RES);
    this.ribbon.material.uniforms.uAlpha.value = 0;
    this.ribbon.renderOrder = 2;
    r.add(this.sticks, this.atoms, this.links, this.ribbon);
    this.burst = new Burst(r, 360, { color: INK.gold, size: 0.28 });
    this.stage.frame(17);
    this.ui.note('Ten alanines with your charges, van der Waals and map. <b>Real dynamics are running.</b> If it stalls, warm it up, then cool it.');
    this.rT = this.ui.ruler({ label: 'Temperature', unit: 'K', min: 250, max: 480, step: 5, value: this.T, digits: 0, major: 50, span: 2.2, onInput: v => { this.T = v; } });
    this.rdH = this.ui.readout('helical H-bonds'); this.rdA = this.ui.readout('residues in the helix valley');
    this.ui.sender(t => this.send(t));
    this.hb = new Int16Array(64);
    this.seen = new Set(); this.pn = 0;
    this.c = [0, 0, 0]; this.best = 0; this.hold = 0; this.elapsed = 0; this.done = false;
    this.ca = new Float64Array(RES * 3); this.gd = new Float64Array(RES * 3);
    this.alpha = 0;
    this.fold = 0;
  }
  update(dt) {
    const s = this.sys, top = this.top;
    this.budget(6, 240, () => s.stepLangevin(3, this.T, 0.001));
    this.elapsed += dt;
    const x = s.x, N = top.names.length;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
    cx /= N; cy /= N; cz /= N;
    this.c[0] += (cx - this.c[0]) * 0.12; this.c[1] += (cy - this.c[1]) * 0.12; this.c[2] += (cz - this.c[2]) * 0.12;
    if (this.first === undefined) { this.c = [cx, cy, cz]; this.first = false; }
    const [ox, oy, oz] = this.c, a = this.atoms;
    let far = 0;
    for (let i = 0; i < N; i++) {
      const px = x[3 * i] - ox, py = x[3 * i + 1] - oy, pz = x[3 * i + 2] - oz;
      a.setAtom(i, px, py, pz);
      far = Math.max(far, px * px + py * py + pz * pz);
    }
    a.flush();
    top.bondList.forEach((b, i) => {
      const A = 3 * b[0], B = 3 * b[1];
      this.sticks.setStick(i, x[A] - ox, x[A + 1] - oy, x[A + 2] - oz, x[B] - ox, x[B + 1] - oy, x[B + 2] - oz);
    });
    this.sticks.flush();
    this.stage.view.radius += (Math.max(8.5, Math.sqrt(far) + 1.6) - this.stage.view.radius) * 0.015;
    if (!this.done) this.stage.autoYaw += dt * 0.08; else this.stage.autoYaw += dt * 0.22;

    const h = hbonds(s, top, this.hb);
    for (let i = 0; i < Math.min(h.n, 24); i++) {
      const O = 3 * top.res[this.hb[2 * i]].O, H = 3 * top.res[this.hb[2 * i + 1]].H;
      this.links.set(i, x[O] - ox, x[O + 1] - oy, x[O + 2] - oz, x[H] - ox, x[H + 1] - oy, x[H + 2] - oz);
      const key = this.hb[2 * i] * 100 + this.hb[2 * i + 1];
      if (!this.seen.has(key)) { this.seen.add(key); this.sound.ping(this.pn++, 0.13); }
    }
    this.links.show(h.n);
    let inA = 0;
    top.res.forEach((r, i) => {
      const p = dihedral(x, r.prevC, r.N, r.CA, r.C) / DEG, q = dihedral(x, r.N, r.CA, r.C, r.nextN) / DEG;
      if (p > -100 && p < -30 && q > -80 && q < -5) inA++;
      this.ca[3 * i] = x[3 * r.CA] - ox; this.ca[3 * i + 1] = x[3 * r.CA + 1] - oy; this.ca[3 * i + 2] = x[3 * r.CA + 2] - oz;
      this.gd[3 * i] = x[3 * r.O] - x[3 * r.C]; this.gd[3 * i + 1] = x[3 * r.O + 1] - x[3 * r.C + 1]; this.gd[3 * i + 2] = x[3 * r.O + 2] - x[3 * r.C + 2];
    });
    this.fold += (h.helical - this.fold) * Math.min(1, dt * 3);
    const goal = THREE.MathUtils.smoothstep(this.fold, 1.5, 5);
    this.alpha += (goal - this.alpha) * Math.min(1, dt * 1.8);
    this.ribbon.update(this.ca, this.gd);
    this.ribbon.material.uniforms.uAlpha.value = this.alpha;
    this.ribbon.visible = this.alpha > 0.01;
    this.best = Math.max(this.best, h.helical);
    this.rdH.set(`${h.helical} <span class="ref">of 6</span>`);
    this.rdA.set(`${inA} <span class="ref">of ${RES}</span>`);
    // A helix flickers, so the win is judged on a short running average of its hydrogen bonds.
    this.hold += (h.helical - this.hold) * (1 - Math.exp(-dt / 0.6));
    this.ui.setTier(this.done ? 3 : this.best >= 4 ? 2 : this.best >= 3 ? 1 : 0);
    if (this.elapsed > 30 && !this.done && !this.saidStall) { this.saidStall = true; this.ui.note('Real simulations get stuck too. <b>Heat it to 420 K for a few seconds, then bring it back to 330 K.</b>'); }
    if (this.hold >= 3.8 && !this.done) this.triumph();
    this.burst.update(dt);
  }
  triumph() {
    this.done = true;
    this.burst.fire([0, 0, 0], 16);
    this.stage.pulse = 2;
    this.sound.accept(3);
    this.ui.note('A helix, and nobody told it to be one. Send it to me.');
    this.T = 300; this.rT.set(300);
  }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'A turn or two of helix. It is a start.', 2: 'Most of a helix.', 3: 'Accepted without further revision. I want it known this has never happened before.' }[tier],
      lesson: 'Bonds and angles held the geometry, your van der Waals packed it, your charges made the hydrogen bonds, and your map chose the shape. No one told the chain what a helix was. Every protein simulation works this way, with many more atoms.',
      nextLabel: 'Read your paper',
      onNext: () => showPaper(this.game),
    });
  }
  solve() { this.best = 5; this.done = true; }
}

export function showPaper(game) {
  const { ff, tiers } = save;
  const counts = [0, 0, 0, 0];
  PLATES.forEach(p => counts[tiers[p.id] ?? 0]++);
  const score = PLATES.reduce((s, p) => s + (tiers[p.id] ?? 0), 0);
  const cites = Math.round(40 * Math.exp(score / 5.2)) + 7;
  const row = (name, mine, ref, d = 3) => `<tr><td>${name}</td><td>${mine == null ? '—' : mine.toFixed(d).replace('-', '−')}</td><td>${ref.toFixed(d).replace('-', '−')}</td></tr>`;
  const anti = ff.antiShare == null ? '' : ` Butane is ${(ff.antiShare * 100).toFixed(0)}% anti at 300 K.`;
  const mu = ff.q != null ? (2 * (-ff.q / 2) * 0.9572 * Math.cos(52.26 * Math.PI / 180) * 4.8032).toFixed(2) : '2.35';
  const el = document.getElementById('paper');
  el.innerHTML = typeset(`<article>
    <p class="journal">Journal of Small Time Steps, volume 1, pages 1–13 (2026)</p>
    <h2>ff26: a force field tuned by hand</h2>
    <p class="author">You, with comments from Reviewer 2</p>
    <div class="stamp">${TIERS[Math.max(1, Math.round(score / PLATES.length))]}</div>
    <h3>Abstract</h3>
    <p>We report a force field built one term at a time. Bond constants were tuned by ear to vibrational frequencies. Angles reproduce the chord of water. Three cosines give the torsion profile of butane.${anti} Lennard-Jones parameters fitted to an argon liquid no longer fit the argon dimer, and charges fitted to a liquid (${mu} D) no longer fit the gas (1.85 D); we regard both as features. With a hand-drawn backbone map, the force field folds a ten-residue alanine chain into a helix with no further input.</p>
    <h3>Table 1. Your parameters and published ones</h3>
    <table><tr><th>Parameter</th><th>Yours</th><th>Published</th></tr>
      ${row('<i>k</i> C–H', ff.CH, 340, 1)}${row('<i>k</i> O–H', ff.OH, 553, 1)}${row('<i>k</i> C–C', ff.CC, 310, 1)}
      ${row('<i>r</i>₀ C–H (Å)', ff.r0CH, 1.09)}${row('<i>θ</i>₀ water (°)', ff.theta, 104.52, 2)}
      ${row('<i>V</i>₁', ff.V?.[0], 1.411)}${row('<i>V</i>₂', ff.V?.[1], -0.271)}${row('<i>V</i>₃', ff.V?.[2], 3.145)}
      ${row('σ argon (Å)', ff.sigma, 3.405)}${row('ε argon', ff.eps, 0.238)}${row('<i>q</i> oxygen (e)', ff.q, -0.834)}
    </table>
    <h3>What was simplified</h3>
    <p>Bond and angle notes are true vibrational frequencies moved down 37 octaves. All dynamics are real integration with AMBER functional forms, but the systems are small. Droplets float in a soft spherical wall with no periodic boundaries. The folding chain has united-atom Cα and Cβ, a dielectric constant of 3 in place of water, and barriers on the map capped at 2.8 kcal/mol so that folding fits in under a minute of screen time. Your σ, ε and charge scale its non-bonded terms relative to the published values.</p>
    <h3>Supporting information: ff26.frcmod</h3>
    <pre>${frcmod()}</pre>
    <p><i>${counts[3]} of ${PLATES.length} plates accepted. Cited by ${cites.toLocaleString('en-US')}.</i></p>
    <button id="p-copy">Copy the file</button><button id="p-back">Back to the equation</button>
  </article>`);
  el.classList.add('open');
  el.scrollTop = 0;
  document.getElementById('p-back').onclick = () => { el.classList.remove('open'); game.home(); };
  document.getElementById('p-copy').onclick = async e => {
    try { await navigator.clipboard.writeText(frcmod()); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select the text to copy it'; }
  };
}
