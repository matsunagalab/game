// The assembly renderer. Every copy is one symmetry operator, drawn from one set of atoms, so that a virus of sixty
// stays cheap. The stages in ppi.js decide which contacts form, and this file closes the shell.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER, SHADE_GLSL } from '../press.js';
import { Atoms } from '../ribbon.js';
import { protein } from '../proteins.js';
import { buzz } from '../sound.js';
import { clamp, ease } from '../ui.js';

const VS = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 corner;
uniform sampler2D uAtoms, uInks, uCopies;
uniform int uCount;
uniform vec4 uQuat;
uniform vec3 uCom;
uniform float uGap, uRadius, uHeld, uFull;
out vec3 vCenter;
out vec3 vRay;
out float vR;
out vec3 vInk;
flat out float vId;
vec3 rotate(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  int atom = gl_InstanceID % uCount;
  int copy = gl_InstanceID / uCount;
  vec4 a = texelFetch(uAtoms, ivec2(atom, 0), 0);
  vec4 c0 = texelFetch(uCopies, ivec2(0, copy), 0);
  vec4 c1 = texelFetch(uCopies, ivec2(1, copy), 0);
  vec4 c2 = texelFetch(uCopies, ivec2(2, copy), 0);
  vec4 st = texelFetch(uCopies, ivec2(3, copy), 0);
  vec3 finalInk = texelFetch(uCopies, ivec2(4, copy), 0).rgb;
  vec3 local = rotate(uQuat, a.xyz) + uCom * (1.0 + st.x);
  vec3 world = vec3(dot(c0.xyz, local) + c0.w, dot(c1.xyz, local) + c1.w, dot(c2.xyz, local) + c2.w);
  vec4 c = modelViewMatrix * vec4(world, 1.0);
  float r = uRadius * a.w * st.y;
  vec3 p = c.xyz + vec3(corner * r * 1.35, 0.0);
  vCenter = c.xyz;
  vRay = p;
  vR = r;
  vec4 ink = texelFetch(uInks, ivec2(atom, 0), 0);
  // The piece in hand is pink; its copies print lighter until the shell closes.
  bool held = abs(float(copy) - uHeld) < 0.5;
  vec3 body = uFull > 0.5 ? ink.rgb : held ? mix(vec3(1.0, 0.0, 0.0), ink.rgb, ink.a) : ink.rgb * 0.5;
  vInk = mix(body, finalInk, st.w);
  vId = 1.0 + float(copy % 200);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;

const FS = /* glsl */ `
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

const floatTexture = (data, w, h) => {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
};

export class Assembly {
  // free: the copies are placed by the caller, with no starting twist.
  constructor(ctx, stage, onDone, { free = false, spread = 1 } = {}) {
    this.onDone = onDone;
    this.free = free;
    this.spread = spread;
    Object.assign(this, { ctx, stage });
    const { press, rig, hud } = ctx;
    this.press = press;
    this.rig = rig;
    this.sound = ctx.sound;
    press.setPaper(PAPER.yellow);
    press.setFlood([0, 0, 0]);
    press.clearDisc();
    press.uniforms.uShadow.value = 0.14;

    const p = (this.p = protein(stage.protein));
    const ops = (this.ops = p.sym);
    this.nCopies = ops.length;

    // Coordinates relative to the subunit's own centre, so that it turns on the spot.
    const com = new THREE.Vector3();
    for (let i = 0; i < p.n; i++) com.add(new THREE.Vector3(p.caXYZ[i * 3], p.caXYZ[i * 3 + 1], p.caXYZ[i * 3 + 2]));
    com.divideScalar(p.n);
    this.com = com;
    const ca = (this.ca = []);
    for (let i = 0; i < p.n; i++) ca.push(new THREE.Vector3(p.caXYZ[i * 3], p.caXYZ[i * 3 + 1], p.caXYZ[i * 3 + 2]).sub(com));

    this.findContacts();

    // Large assemblies use residue-sized beads: tens of thousands of atoms are too many for a phone.
    const coarse = this.nCopies > 6;
    this.coarse = coarse;
    const beads = [];
    const patch = this.patches();
    if (coarse) {
      for (let r = 0; r < p.n; r++) {
        beads.push({ x: ca[r].x, y: ca[r].y, z: ca[r].z, s: 1.55, r });
        const c = this.sideOf(r);
        if (c) beads.push({ x: c.x - com.x, y: c.y - com.y, z: c.z - com.z, s: 1.3, r });
      }
    } else {
      for (let i = 0; i < p.atomEl.length; i++) {
        beads.push({ x: p.atomXYZ[i * 3] - com.x, y: p.atomXYZ[i * 3 + 1] - com.y, z: p.atomXYZ[i * 3 + 2] - com.z, s: 1, r: p.atomRes[i] });
      }
    }
    this.beads = beads;
    const N = (this.count = beads.length);
    const atomData = new Float32Array(N * 4);
    const inkData = new Float32Array(N * 4);
    beads.forEach((b, i) => {
      atomData.set([b.x, b.y, b.z, b.s], i * 4);
      const ink = patch[b.r];
      inkData.set([ink[0], ink[1], ink[2], ink[3]], i * 4);
    });
    this.atomTex = floatTexture(atomData, N, 1);
    this.inkTex = floatTexture(inkData, N, 1);
    this.copyData = new Float32Array(this.nCopies * 5 * 4);
    const tones = this.closingInks();
    ops.forEach((m, k) => {
      this.copyData.set(m, k * 20);
      this.copyData.set([0, 1, 0.5, 0], k * 20 + 12);
      this.copyData.set([...tones[k], 1], k * 20 + 16);
    });
    this.copyTex = floatTexture(this.copyData, 5, this.nCopies);

    const g = (this.geometry = new THREE.InstancedBufferGeometry());
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.instanceCount = N * this.nCopies;
    this.quat = new THREE.Quaternion();
    this.uniforms = {
      uAtoms: { value: this.atomTex },
      uInks: { value: this.inkTex },
      uCopies: { value: this.copyTex },
      uCount: { value: N },
      uQuat: { value: new THREE.Vector4(0, 0, 0, 1) },
      uCom: { value: com.clone() },
      uGap: { value: 0 },
      uHeld: { value: this.identity },
      uFull: { value: free ? 1 : 0 },
      uRadius: { value: coarse ? 2.05 : 1.7 },
      uShade: { value: 0.42 },
    };
    this.material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    press.scene.add(this.mesh);

    // Start the piece turned away by a set angle, about an axis that keeps the patches in view.
    const axis = new THREE.Vector3(0.62, 0.71, 0.33).normalize();
    if (!free) this.quat.setFromAxisAngle(axis, (stage.start * Math.PI) / 180);
    this.setCameraFor();
    this.state = free ? 'free' : 'turn';
    this.clock = 0;
    this.fit = 0;
    this.shownFit = 0;
    ctx.onLayout = () => this.layout();
    this.layout();
    rig.enabled = false;
    this.refit();
    this.fit = free ? 1 : 0.15;
    if (free) {
      this.rig.enabled = true;
      for (let k = 0; k < this.nCopies; k++) this.copyData[k * 20 + 12] = 0;
      this.copyTex.needsUpdate = true;
    }
    void hud;
  }

  // Ink for every bead, from a residue: [pink, yellow, blue, alpha].
  setInks(of) {
    const d = this.inkTex.image.data;
    this.beads.forEach((b, i) => d.set(of(b.r), i * 4));
    this.inkTex.needsUpdate = true;
  }

  // Replaces where a copy sits: a flat 3x4 matrix.
  setMatrix(k, m) {
    this.copyData.set(m, k * 20);
    this.copyTex.needsUpdate = true;
  }

  shift(k, base, x, y, z) {
    const d = this.copyData;
    d[k * 20 + 3] = base[3] + x;
    d[k * 20 + 7] = base[7] + y;
    d[k * 20 + 11] = base[11] + z;
    this.copyTex.needsUpdate = true;
  }

  setVisible(k, on) {
    this.copyData[k * 20 + 13] = on ? 1 : 0;
    this.copyTex.needsUpdate = true;
  }

  // When the shell closes, each ring of the symmetry takes its own ink, so that the geometry shows at a glance.
  // A virus has twelve fivefold rings, a ferritin six fourfold rings. The axes come from the operators themselves.
  closingInks() {
    const { ops, com, nCopies } = this;
    const palette = [[1, 0, 0], [0, 1, 0], [0, 0, 0.34], [0.34, 1, 0]];
    const fold = { 60: 5, 24: 4 }[nCopies];
    if (!fold) {
      const ring = [[1, 0, 0], [0, 1, 0], [0, 0, 0.34], [0.34, 1, 0], [0, 1, 0]];
      return ops.map((_, k) => ring[k % ring.length]);
    }
    const want = Math.cos((2 * Math.PI) / fold);
    const axes = [];
    for (const m of ops) {
      if (Math.abs((m[0] + m[5] + m[10] - 1) / 2 - want) > 0.02) continue;
      const v = new THREE.Vector3(m[9] - m[6], m[2] - m[8], m[4] - m[1]).normalize();
      for (const a of [v, v.clone().negate()]) if (!axes.some((x) => x.dot(a) > 0.99)) axes.push(a);
    }
    const spots = ops.map((m) => new THREE.Vector3(
      m[0] * com.x + m[1] * com.y + m[2] * com.z,
      m[4] * com.x + m[5] * com.y + m[6] * com.z,
      m[8] * com.x + m[9] * com.y + m[10] * com.z,
    ).normalize());
    const group = spots.map((v) => {
      let best = 0;
      axes.forEach((a, i) => {
        if (a.dot(v) > axes[best].dot(v)) best = i;
      });
      return best;
    });
    // Neighbouring axes must differ, as in colouring a map.
    let nearest = -1;
    for (let a = 1; a < axes.length; a++) nearest = Math.max(nearest, axes[0].dot(axes[a]));
    const colour = new Array(axes.length).fill(-1);
    axes.forEach((a, i) => {
      const used = new Set();
      axes.forEach((b, j) => {
        if (colour[j] >= 0 && a.dot(b) > nearest - 0.02) used.add(colour[j]);
      });
      let c = 0;
      while (used.has(c)) c++;
      colour[i] = c % palette.length;
    });
    return group.map((g) => palette[colour[g]]);
  }

  sideOf(r) {
    const { p } = this;
    let n = 0;
    const c = new THREE.Vector3();
    for (let i = 0; i < p.atomEl.length; i++) {
      if (p.atomRes[i] === r && p.atomSide[i] === '1') {
        c.add(new THREE.Vector3(p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2]));
        n++;
      }
    }
    return n ? c.divideScalar(n) : null;
  }

  // Residue pairs that touch in the real assembly, between copy 0 and each neighbour.
  findContacts() {
    const { p, ops, com, ca } = this;
    const world = (m, v) => new THREE.Vector3(
      m[0] * v.x + m[1] * v.y + m[2] * v.z + m[3],
      m[4] * v.x + m[5] * v.y + m[6] * v.z + m[7],
      m[8] * v.x + m[9] * v.y + m[10] * v.z + m[11],
    );
    const pairs = [];
    this.neighbours = new Set();
    const home = ca.map((v) => v.clone().add(com));
    // Which copy is copy zero's identity? Whichever leaves the centre in place.
    this.identity = ops.findIndex((m) => world(m, com).distanceTo(com) < 0.5);
    ops.forEach((m, k) => {
      if (k === this.identity) return;
      if (world(m, com).distanceTo(com) > 70) return;
      for (let i = 0; i < p.n; i++)
        for (let j = 0; j < p.n; j++) {
          const d = home[i].distanceTo(world(m, home[j]));
          if (d < 7.5) {
            pairs.push({ i, j, k, d });
            this.neighbours.add(k);
          }
        }
    });
    const keep = Math.max(1, Math.floor(pairs.length / 220));
    this.pairs = pairs.filter((_, i) => i % keep === 0);
    this.allPairs = pairs;
  }

  // Each subunit gets two coloured faces: the one that reaches toward its busiest neighbour, and the one
  // that receives the same neighbour's reach. Orange on one copy always meets blue on the next.
  patches() {
    const { p, allPairs, ops } = this;
    const ink = new Array(p.n).fill(null).map(() => [0.12, 0.12, 0.1, 0]);
    const faces = new Map();
    for (const c of allPairs) faces.set(c.k, (faces.get(c.k) ?? 0) + 1);
    const main = [...faces.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (main === undefined) return ink;
    for (const c of allPairs) {
      if (c.k !== main) continue;
      ink[c.i] = [0.34, 1, 0, 1];
      if (ink[c.j][3] === 0) ink[c.j] = [0, 0, 0.95, 1];
    }
    void ops;
    return ink;
  }

  isInverse(a, b) {
    const A = this.ops[a];
    const B = this.ops[b];
    let e = 0;
    // The rotation part of A times B should be the identity.
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += A[i * 4 + k] * B[k * 4 + j];
        e += Math.abs(s - (i === j ? 1 : 0));
      }
    return e < 0.05;
  }

  // HIV protease closes around its drug, which arrives once the seam exists.
  showLigand() {
    const { p } = this;
    if (!p.hetXYZ) return;
    const a = new Atoms(p.hetEl.length);
    for (let i = 0; i < p.hetEl.length; i++) a.set(i, p.hetXYZ[i * 3], p.hetXYZ[i * 3 + 1], p.hetXYZ[i * 3 + 2], 1.6, [0, 1, 0], 240);
    a.commit(p.hetEl.length);
    a.mesh.scale.setScalar(0.001);
    this.press.scene.add(a.mesh);
    this.ligand = a;
    this.ligandT = 0;
  }

  // Look down the symmetry axis of a ring; otherwise look straight at the piece.
  setCameraFor() {
    const { ops, com, rig } = this;
    let view = com.clone().normalize();
    if (this.nCopies <= 6) {
      const k = (this.identity + 1) % this.nCopies;
      const m = ops[k];
      const axis = new THREE.Vector3(m[9] - m[6], m[2] - m[8], m[4] - m[1]);
      if (axis.lengthSq() > 1e-6) view = axis.normalize();
      if (view.dot(new THREE.Vector3(0, 0, 1)) < 0) view.negate();
    }
    this.view = view;
    rig.target.set(0, 0, 0);
    rig.targetGoal.set(0, 0, 0);
    rig.yaw = Math.atan2(view.x, view.z);
    rig.pitch = Math.asin(clamp(view.y, -1, 1));
    rig.spin = 0;
  }

  layout() {
    const { press, rig, p, com } = this;
    const { cssW: w, cssH: h } = press;
    const landscape = w > h * 1.15;
    let radius = 0;
    for (const v of this.ca) radius = Math.max(radius, v.length());
    const shell = (com.length() + radius + 6) * this.spread;
    const room = landscape ? h - 70 : Math.min(w, h - 230);
    press.setFocus(0.5, landscape ? 0.56 : (116 + (h - 230) / 2) / h);
    rig.dist = rig.distTarget = ((shell * 1.28) / Math.tan((press.camera.fov * Math.PI) / 360)) * (h / room);
    void p;
  }

  angle() {
    return (2 * Math.acos(clamp(Math.abs(this.quat.w), 0, 1)) * 180) / Math.PI;
  }

  // How much of the real interface is in place, as a smooth score from 0 to 1.
  refit() {
    const { pairs, ca, ops, com, quat } = this;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let s = 0;
    for (const c of pairs) {
      a.copy(ca[c.i]).applyQuaternion(quat).add(com);
      b.copy(ca[c.j]).applyQuaternion(quat).add(com);
      const m = ops[c.k];
      const x = m[0] * b.x + m[1] * b.y + m[2] * b.z + m[3];
      const y = m[4] * b.x + m[5] * b.y + m[6] * b.z + m[7];
      const z = m[8] * b.x + m[9] * b.y + m[10] * b.z + m[11];
      const d = Math.hypot(a.x - x, a.y - y, a.z - z) - c.d;
      s += Math.exp(-(d * d) / 50);
    }
    // Contacts alone leave false summits for a small interface, so the score also rises with
    // overall alignment. That gives one smooth funnel, like the energy landscape of real binding.
    const contact = s / pairs.length;
    const align = quat.w * quat.w;
    this.fit = clamp((0.55 * contact + 0.45 * align - 0.2) / 0.8, 0, 1);
  }

  snap() {
    this.state = 'snap';
    this.t = 0;
    this.from = this.quat.clone();
    this.sound.clunk(0.4);
    buzz(30);
    this.endTime = this.clock;
    // Copies lock in order of distance from the first.
    const { ops, com } = this;
    const c = ops.map((m, k) => ({
      k,
      d: new THREE.Vector3(m[0] * com.x + m[1] * com.y + m[2] * com.z, m[4] * com.x + m[5] * com.y + m[6] * com.z, m[8] * com.x + m[9] * com.y + m[10] * com.z).distanceTo(com),
    }));
    c.sort((x, y) => x.d - y.d);
    const span = Math.min(1.5, 0.11 * this.nCopies);
    this.order = c.map((x, i) => ({ k: x.k, at: 0.45 + (i / this.nCopies) * span, done: false }));
    this.ctx.hud.setGoal('');
  }

  win() {
    const { stage } = this;
    this.state = 'won';
    this.sound.bloom();
    this.rig.enabled = true;
    this.rig.spin = 0.2;
    this.floodT = 0;
    this.rig.distTarget = this.rig.dist * 0.82;
    document.body.classList.add('night');
    this.showLigand();
    this.onDone?.(stage.closing, stage.id === 'virus' ? 3400 : 2300);
  }

  update(dt) {
    this.clock += dt;
    const u = this.uniforms;
    const data = this.copyData;
    const closing = clamp((this.fit - 0.3) / 0.6, 0, 1);
    const openGap = 0.34 * (1 - ease(closing));
    if (this.state === 'turn') {
      for (let k = 0; k < this.nCopies; k++) data[k * 20 + 12] = openGap;
      this.copyTex.needsUpdate = true;
    } else if (this.state === 'snap') {
      this.t += dt;
      const e = ease(clamp(this.t / 0.42, 0, 1));
      this.quat.copy(this.from).slerp(new THREE.Quaternion(), e);
      for (const c of this.order) {
        const x = clamp((this.t - c.at + 0.25) / 0.25, 0, 1);
        data[c.k * 20 + 12] = (openGap + 0.05) * (1 - ease(x));
        data[c.k * 20 + 15] = x;
        if (!c.done && this.t >= c.at) {
          c.done = true;
          this.sound.ratchet(0.1);
        }
      }
      this.copyTex.needsUpdate = true;
      if (this.t > this.order[this.order.length - 1].at + 0.4) this.win();
    }
    if (this.floodT !== undefined && this.floodT < 1) {
      // The sheet floods with blue, dots first, the way the cover was printed.
      this.floodT = Math.min(1, this.floodT + dt / 0.9);
      const e = ease(this.floodT);
      this.press.setFlood([0, 0, e]);
      this.press.uniforms.uShadow.value = 0.14 * (1 - e);
      this.press.setPaper(PAPER.yellow.map((v, i) => v + (PAPER.white[i] - v) * e));
    }
    if (this.ligand) {
      this.ligandT = Math.min(1, this.ligandT + dt / 0.5);
      this.ligand.mesh.scale.setScalar(ease(this.ligandT));
    }
    const q = this.quat;
    u.uQuat.value.set(q.x, q.y, q.z, q.w);
  }

  dispose() {
    const { press } = this;
    press.scene.remove(this.mesh);
    if (this.ligand) {
      press.scene.remove(this.ligand.mesh);
      this.ligand.dispose();
    }
    this.geometry.dispose();
    this.material.dispose();
    this.atomTex.dispose();
    this.inkTex.dispose();
    this.copyTex.dispose();
    this.rig.spin = 0;
    this.rig.enabled = true;
    press.setFocus(0.5, 0.5, true);
  }
}

