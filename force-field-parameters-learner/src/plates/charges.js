// Part five: partial charges. The gas-phase answer is correct, and it fails in the liquid.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Sticks, Sparks, Links, INK } from '../gfx.js';
import { REF, save } from '../save.js';
import { WaterDrop, dipoleDebye } from '../physics/droplets.js';

const R0 = 0.9572, TH = 104.52 * Math.PI / 180;
const H1 = [R0 * Math.sin(TH / 2), -R0 * Math.cos(TH / 2), 0], H2 = [-H1[0], H1[1], 0];
const CY = 0.3;                 // lift the molecule so its centre sits near the origin
const SITES = [[0, CY, 0], [H1[0], H1[1] + CY, 0], [H2[0], H2[1] + CY, 0]];
const VDW = [1.52, 1.1, 1.1];

// Van der Waals surface, painted by potential. The picture is linear in the charge, so only a uniform changes.
function espSurface() {
  const g = new THREE.SphereGeometry(1, 128, 88);
  const p = g.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const d = [p.getX(i), p.getY(i), p.getZ(i)];
    let t = 0;
    SITES.forEach((c, k) => {
      const dc = d[0] * c[0] + d[1] * c[1] + d[2] * c[2], cc = c[0] ** 2 + c[1] ** 2 + c[2] ** 2;
      const disc = dc * dc - (cc - VDW[k] ** 2);
      if (disc >= 0) t = Math.max(t, dc + Math.sqrt(disc));
    });
    const P = [d[0] * t, d[1] * t, d[2] * t];
    p.setXYZ(i, P[0], P[1], P[2]);
    const dist = c => Math.hypot(P[0] - c[0], P[1] - c[1], P[2] - c[2]);
    a[i] = 1 / dist(SITES[0]) - 0.5 / dist(SITES[1]) - 0.5 / dist(SITES[2]);
  }
  g.setAttribute('aEsp', new THREE.BufferAttribute(a, 1));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: { uQ: { value: 0.5 }, uNeg: { value: INK.O.clone() }, uPos: { value: INK.aqua.clone() } },
    vertexShader: `attribute float aEsp; varying float vE; varying vec3 vN, vV;
      void main(){ vE = aEsp; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uQ; uniform vec3 uNeg, uPos; varying float vE; varying vec3 vN, vV;
      void main(){ float s = clamp(-vE*uQ*3.4, -1., 1.); vec3 c = mix(vec3(.72,.82,.9), s<0. ? uNeg : uPos, pow(abs(s),.7));
      float f = 1.-max(dot(normalize(vN),normalize(vV)),0.); float rim = pow(f,2.2);
      gl_FragColor = vec4(c*(.75+rim*1.2), .3+rim*.55); }`,
  }));
}

function arrow(parent, color, glow) {
  const stick = new Sticks(1, { radius: 0.03, color, glow });
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 18), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1 + glow) }));
  parent.add(stick, head);
  return {
    set(len, x = 0) {
      const y0 = CY - 1.05 - 0.2, y1 = y0 + len;
      stick.setStick(0, x, y0, 1.72, x, y1, 1.72); stick.flush();
      head.position.set(x, y1 + 0.14, 1.72);
    },
  };
}

export class Dipole extends Plate {
  enter() {
    const r = this.root;
    this.q = -0.32;
    this.atoms = new Atoms(3, { detail: 6 });
    this.atoms.setColor(0, INK.O); this.atoms.setColor(1, INK.H, 0.1); this.atoms.setColor(2, INK.H, 0.1);
    SITES.forEach((c, i) => this.atoms.setAtom(i, ...c, i ? 0.3 : 0.5));
    this.atoms.flush(true);
    this.sticks = new Sticks(2, { radius: 0.09, color: INK.C });
    this.sticks.setStick(0, ...SITES[0], ...SITES[1]); this.sticks.setStick(1, ...SITES[0], ...SITES[2]); this.sticks.flush();
    this.surface = espSurface();
    r.add(this.atoms, this.sticks, this.surface);
    this.mine = arrow(r, INK.gold, 0.6); this.ref = arrow(r, INK.white, 0.5);
    this.flow = new Sparks(this.game.mobile ? 320 : 700, { size: 0.045, color: INK.gold, opacity: 0.8 });
    r.add(this.flow);
    this.fx = new Float32Array(this.flow.cap * 3); this.life = new Float32Array(this.flow.cap);
    for (let i = 0; i < this.flow.cap; i++) this.spawn(i);
    this.stage.frame(2.5);
    this.ui.note('No one can measure an atom’s charge, but a molecule’s dipole can be measured. <b>Match the gold arrow to the white one.</b> Red is negative, aqua positive.');
    this.rQ = this.ui.ruler({ label: 'Charge on oxygen <i>q</i><sub>O</sub>', unit: 'e', min: -1.2, max: -0.1, step: 0.001, value: this.q, digits: 3, major: 0.1, span: 3.4, onInput: v => { this.q = v; } });
    this.rdD = this.ui.readout('your dipole'); this.rdT = this.ui.readout('measured');
    this.rdT.set(`<span class="ref">${REF.muGas.toFixed(3)} D</span>`);
    this.rdH = this.ui.readout('each hydrogen');
    this.ui.sender(t => this.send(t));
    this.ref.set(REF.muGas * 0.72, -0.1);
  }
  spawn(i) {
    const c = SITES[1 + (i & 1)];
    const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), R = 1.15 + Math.random() * 0.2;
    this.fx[3 * i] = c[0] + R * Math.sin(b) * Math.cos(a);
    this.fx[3 * i + 1] = c[1] + R * Math.sin(b) * Math.sin(a);
    this.fx[3 * i + 2] = c[2] + R * Math.cos(b);
    this.life[i] = 0.4 + Math.random() * 2.5;
  }
  update(dt) {
    const q = this.q, qs = [q, -q / 2, -q / 2], f = this.fx, speed = 1.2 * Math.abs(q) + 0.15;
    for (let i = 0; i < this.flow.cap; i++) {
      const j = 3 * i;
      let ex = 0, ey = 0, ez = 0, min = 1e9;
      for (let k = 0; k < 3; k++) {
        const c = SITES[k], dx = f[j] - c[0], dy = f[j + 1] - c[1], dz = f[j + 2] - c[2], r2 = dx * dx + dy * dy + dz * dz;
        const m = qs[k] / (r2 * Math.sqrt(r2));
        ex += m * dx; ey += m * dy; ez += m * dz;
        const rr = r2 / VDW[k] ** 2;
        if (rr < min) min = rr;
      }
      const n = Math.hypot(ex, ey, ez) + 1e-9, v = speed * dt;
      f[j] += ex / n * v; f[j + 1] += ey / n * v; f[j + 2] += ez / n * v;
      this.life[i] -= dt;
      if (this.life[i] < 0 || min < 0.92 || f[j] ** 2 + f[j + 1] ** 2 + f[j + 2] ** 2 > 12) this.spawn(i);
      this.flow.put(i, f[j], f[j + 1], f[j + 2]);
    }
    this.flow.flush();
    this.surface.material.uniforms.uQ.value = -q;
    const mu = dipoleDebye(q);
    this.mine.set(mu * 0.72, 0.1);
    this.rdD.set(`${mu.toFixed(3)} D`);
    this.rdH.set(`${(-q / 2).toFixed(3)} e`);
    const d = Math.abs(mu - REF.muGas);
    this.ui.setTier(d <= 0.012 ? 3 : d <= 0.04 ? 2 : d <= 0.12 ? 1 : 0);
  }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'A dipole, roughly.', 2: 'Close to the gas-phase value.', 3: 'Exactly the gas-phase dipole. This is the correct answer. Keep it. You will see.' }[tier],
      lesson: 'Partial charges are not observables. They are a choice of point charges that reproduces the electric field outside the molecule, which is why charges are fitted to the potential around it. The two hydrogens each carry −½ of the oxygen so the molecule stays neutral.',
      apply: ff => { ff.qGas = this.q; },
    });
  }
  solve() { this.q = REF.qGas; this.rQ.set(this.q); }
}

const M = 90, COHESION = 9.2;

export class Liquid extends Plate {
  enter() {
    const r = this.root;
    this.d = new WaterDrop(M);
    this.d.qO = save.ff.qGas ?? REF.qGas;
    this.atoms = new Atoms(3 * M, { detail: 3 });
    for (let i = 0; i < M; i++) {
      this.atoms.setColor(3 * i, INK.O); this.atoms.setColor(3 * i + 1, INK.H, 0.05); this.atoms.setColor(3 * i + 2, INK.H, 0.05);
    }
    this.atoms.flush(true);
    this.links = new Links(400, { color: INK.white, opacity: 0.9 });
    r.add(this.atoms, this.links);
    this.stage.frame(17);
    this.ui.note('The same molecule, 90 of them, at room temperature, with the charges you just got exactly right.');
    setTimeout(() => { if (this.game.plate === this) this.ui.note('Your water is boiling away at 27 °C. It should be a liquid. <b>Change the charge.</b> I know it was correct. Change it.'); }, 7000);
    this.rQ = this.ui.ruler({
      label: 'Charge on oxygen <i>q</i><sub>O</sub>', unit: 'e', min: -1.1, max: -0.4, step: 0.001, value: this.d.qO, digits: 3, major: 0.05, span: 3.2,
      onInput: v => { this.d.qO = v; }, onRelease: () => { this.squeeze = 3.5; },
    });
    this.rdH = this.ui.readout('H-bonds per molecule');
    this.rdC = this.ui.readout('cohesive energy');
    this.rdB = this.ui.readout('in the drop');
    this.rdD = this.ui.readout('dipole');
    this.ui.sender(t => this.send(t));
    this.avg = null; this.warm = 0; this.squeeze = 0; this.prev = new Set();
    this.off = [0, 0, 0]; this.pingT = 0; this.pn = 0;
    this.sound.startWash();
  }
  update(dt) {
    const d = this.d;
    this.squeeze = Math.max(0, this.squeeze - dt);
    d.wall += ((this.squeeze > 0 ? 11 : 24) - d.wall) * Math.min(1, dt * 1.5);
    this.budget(5.5, 10, () => d.step(2, 300));
    this.stage.autoYaw += dt * 0.06;
    const m = d.measure();
    const k = 1 - Math.exp(-dt / 2);
    if (!this.avg) this.avg = { ...m }; else for (const key of ['hbPerMol', 'cohesion', 'bound']) this.avg[key] += (m[key] - this.avg[key]) * k;
    this.off = this.off.map((v, i) => v + (m.center[i] - v) * 0.05);
    const [ox, oy, oz] = this.off, { x } = d, a = this.atoms;
    a.fog(this.stage.dist, -5, 34);
    for (let i = 0; i < M; i++) {
      const q = 9 * i;
      a.setAtom(3 * i, x[q] - ox, x[q + 1] - oy, x[q + 2] - oz, 1.05);
      a.setAtom(3 * i + 1, x[q + 3] - ox, x[q + 4] - oy, x[q + 5] - oz, 0.55);
      a.setAtom(3 * i + 2, x[q + 6] - ox, x[q + 7] - oy, x[q + 8] - oz, 0.55);
    }
    a.flush();
    const now = new Set();
    for (let i = 0; i < d.nHb && i < 400; i++) {
      const A = 9 * d.hb[2 * i], B = 9 * d.hb[2 * i + 1];
      this.links.set(i, x[A] - ox, x[A + 1] - oy, x[A + 2] - oz, x[B] - ox, x[B + 1] - oy, x[B + 2] - oz);
      now.add(A * 1000 + B);
    }
    this.links.show(d.nHb);
    this.pingT -= dt;
    if (this.pingT <= 0) for (const key of now) if (!this.prev.has(key)) { this.sound.ping(this.pn++, 0.05); this.pingT = 0.09; break; }
    this.prev = now;
    const A = this.avg;
    this.rdH.set(`${A.hbPerMol.toFixed(2)}`);
    this.rdC.set(`${A.cohesion.toFixed(1)} <span class="ref">/ ${COHESION}</span> <small>kcal/mol</small>`);
    this.rdB.set(`${(A.bound * 100).toFixed(0)}%`);
    this.rdD.set(`${dipoleDebye(d.qO).toFixed(2)} D`);
    this.sound.setWash(0.5 + (1 - A.bound) * 1.5, 3000 - A.bound * 1400);
    this.warm += dt;
    const c = Math.abs(A.cohesion - COHESION);
    const tier = this.warm < 4 || A.bound < 0.85 ? 0 : c <= 0.7 ? 3 : c <= 1.5 ? 2 : c <= 3 ? 1 : 0;
    this.ui.setTier(tier);
    if (A.cohesion > COHESION + 3.5 && !this.saidHigh) { this.saidHigh = true; this.ui.note('Now it is sticky, almost a glass. Back off a little.'); }
    if (tier === 3 && !this.saidOk) { this.saidOk = true; this.ui.note(`A real hydrogen-bond network. Now look at your dipole: ${dipoleDebye(d.qO).toFixed(2)} D. The correct value was 1.85.`); }
  }
  down(x, y) {
    if (y > this.stage.height - this.stage.insets.bottom) return false;
    this.stir(x, y); return true;
  }
  stir(x, y) {
    const p = this.stage.pointerToWorld(x, y, new THREE.Vector3(), new THREE.Vector3());
    this.d.tweezer = { x: p.x + this.off[0], y: p.y + this.off[1], z: p.z + this.off[2], k: 0.5 };
  }
  move(x, y) { if (this.d.tweezer) this.stir(x, y); }
  up() { this.d.tweezer = null; }
  send(tier) {
    const q = this.d.qO, mu = dipoleDebye(q);
    this.game.finish(this, tier, {
      comment: { 1: 'It holds together. Barely.', 2: 'A respectable liquid.', 3: 'You have made your molecule wrong on purpose, for the right reason. Welcome to the field.' }[tier],
      lesson: `You raised the dipole from 1.86 D to ${mu.toFixed(2)} D, ${((mu / 1.855 - 1) * 100).toFixed(0)}% above the true gas-phase value. In a liquid, each molecule’s electrons are pulled by its neighbours, and the real dipole rises. A fixed charge cannot respond, so it has to wear that polarization all the time. TIP3P does exactly this: <i>q</i><sub>O</sub> = −0.834, 2.35 D.`,
      apply: ff => { ff.q = q; },
    });
  }
  solve() { this.d.qO = REF.qO; this.rQ.set(REF.qO); this.squeeze = 3; this.warm = 8; }
  exit() { this.sound.stopWash(); }
}
