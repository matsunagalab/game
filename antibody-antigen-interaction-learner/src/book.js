// The antibody and antigen as a hinged pair: open like a book for building,
// closed when they bind. Interface papers use the same "open-book" view.
import * as THREE from 'three';
import {PALETTES, makeCloud} from './stage.js';
import {buildAntibody, buildAntigen, makeSidechain, LOOP_SITES, EPITOPE_SITES} from './molecules.js';
import {LOOPS, RESIDUES} from './rules.js';

const OPEN_ANGLE = 1.34;
const OPEN_GAP = 2.15;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const X_BACK = new THREE.Vector3(-1, 0, 0);
export const IGG_CENTRE = new THREE.Vector3(-7.6, 3.3, -2.3);

const easeOut = t => 1 - Math.pow(1 - t, 3);

class Water {
  constructor(count) {
    this.count = count;
    const atoms = count * 3;
    this.pos = new Float32Array(atoms * 3);
    const rad = new Float32Array(atoms), col = new Float32Array(atoms * 3);
    for (let i = 0; i < count; i++) {
      rad[i * 3] = 0.105; rad[i * 3 + 1] = 0.066; rad[i * 3 + 2] = 0.066;
      col.set([0.86, 0.97, 1], i * 9);
      col.set([1, 1, 1], i * 9 + 3);
      col.set([1, 1, 1], i * 9 + 6);
    }
    this.mesh = makeCloud(this.pos, rad, col, {jitter: 0});
    this.mesh.geometry.attributes.iPos.setUsage(THREE.DynamicDrawUsage);
    this.items = Array.from({length: count}, () => this.spawn({}));
    this.spread = 1;
    this.scale = 1;
    this.burstTime = -1;
    this.hRef = new THREE.Vector3();
  }

  spawn(w) {
    w.p = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 3.0);
    w.v = new THREE.Vector3();
    w.phase = Math.random() * 6.28;
    w.axis = new THREE.Vector3().randomDirection();
    w.angle = Math.random() * 6;
    return w;
  }

  burst() {
    this.burstTime = 0;
    for (const w of this.items) {
      const out = new THREE.Vector3(w.p.x * 0.4, w.p.y, w.p.z).normalize();
      w.v.copy(out).multiplyScalar(5 + Math.random() * 9);
    }
  }

  reset() { this.burstTime = -1; this.items.forEach(w => this.spawn(w)); }

  tick(dt, time, openness) {
    const q = new THREE.Quaternion();
    const a = new THREE.Vector3(), o = new THREE.Vector3();
    const h1 = new THREE.Vector3(0.066, 0.05, 0), h2 = new THREE.Vector3(-0.066, 0.05, 0);
    const stretch = 1 + openness * 0.5;
    if (this.burstTime >= 0) this.burstTime += dt;
    this.items.forEach((w, i) => {
      if (this.burstTime >= 0) {
        w.p.addScaledVector(w.v, dt);
        w.v.multiplyScalar(Math.exp(-dt * 1.6));
      }
      w.angle += dt * 0.7;
      q.setFromAxisAngle(w.axis, w.angle);
      o.copy(w.p);
      o.x = o.x * stretch;
      o.z -= openness * 1.1;
      o.y += Math.sin(time * 0.5 + w.phase) * 0.16;
      o.z += Math.cos(time * 0.43 + w.phase) * 0.16;
      this.pos.set([o.x, o.y, o.z], i * 9);
      a.copy(h1).applyQuaternion(q).add(o);
      this.pos.set([a.x, a.y, a.z], i * 9 + 3);
      a.copy(h2).applyQuaternion(q).add(o);
      this.pos.set([a.x, a.y, a.z], i * 9 + 6);
    });
    this.mesh.geometry.attributes.iPos.needsUpdate = true;
  }
}

export class Book {
  constructor(stage, {waterCount = 34} = {}) {
    this.stage = stage;
    this.rig = new THREE.Group();
    this.left = new THREE.Group();
    this.right = new THREE.Group();
    this.antibody = buildAntibody();
    this.left.add(this.antibody);
    this.rig.add(this.left, this.right);
    this.free = false; // true while another scene poses the antibody directly
    this.water = new Water(waterCount);
    this.rig.add(this.water.mesh);
    stage.scene.add(this.rig);
    this.antigen = null;
    this.side = {para: {}, epi: {}};
    this.residues = {para: {}, epi: {}};
    this.openness = 1;
    this.heroBlend = 1; // 1 = free-floating antibody on the title screen
    this.spin = 0;
    this.shake = 0;
    this.drift = 0; // how far a weak antibody has fallen away
    this.portrait = innerWidth < innerHeight;
    this.setPortrait(this.portrait);
  }

  setPortrait(portrait) {
    this.portrait = portrait;
    this.rig.rotation.z = portrait ? Math.PI / 2 : 0;
  }

  setAntigen(spec, paletteName, visible = true) {
    if (this.antigen) {
      this.right.remove(this.antigen);
      this.antigen.geometry.dispose();
      this.antigen.material.dispose();
      this.antigen = null;
    }
    for (const l of LOOPS) this.setResidue('epi', l, null, false);
    if (!spec) return;
    this.antigen = buildAntigen(spec, PALETTES[paletteName]);
    this.antigen.visible = visible;
    this.right.add(this.antigen);
  }

  anchor(side, loop) {
    return side === 'para' ? LOOP_SITES[loop].base : EPITOPE_SITES[loop];
  }

  setResidue(side, loop, aa, animate = true) {
    const old = this.side[side][loop];
    const parent = side === 'para' ? this.antibody.armA.host : this.right;
    if (old) {
      parent.remove(old);
      old.geometry.dispose();
      old.material.dispose();
      delete this.side[side][loop];
    }
    this.residues[side][loop] = aa || null;
    if (!aa || !RESIDUES[aa] || aa === 'G') return;
    const hint = LOOP_SITES[loop].hint;
    const mesh = makeSidechain(aa, side === 'para' ? X_AXIS : X_BACK, hint);
    mesh.position.copy(this.anchor(side, loop));
    mesh.grow = animate ? 0 : 1;
    mesh.scale.setScalar(animate ? 0.001 : 1);
    parent.add(mesh);
    this.side[side][loop] = mesh;
  }

  setGlow(side, loop, value, color = '#ffffff') {
    const m = this.side[side][loop];
    if (!m) return;
    m.material.uniforms.uGlow.value = value;
    m.material.uniforms.uGlowColor.value.set(color);
  }

  clearGlow() {
    for (const s of ['para', 'epi']) for (const l of LOOPS) this.setGlow(s, l, 0);
  }

  // World position of the tip of a side chain, or of the bare loop.
  tipWorld(side, loop, out = new THREE.Vector3()) {
    const mesh = this.side[side][loop];
    const length = mesh ? mesh.tipLength : 0.1;
    out.copy(this.anchor(side, loop));
    out.x += side === 'para' ? length : -length;
    (side === 'para' ? this.antibody.armA.host : this.right).localToWorld(out);
    return out;
  }

  // Centre of a face, for orienting labels outward from it.
  faceWorld(side, out = new THREE.Vector3()) {
    out.set(0.2, 0.2, 0.15);
    (side === 'para' ? this.antibody.armA.host : this.right).localToWorld(out);
    return out;
  }

  tick(dt, time) {
    const open = this.openness;
    const a = OPEN_ANGLE * open;
    const gap = OPEN_GAP * open;
    const fall = this.drift;
    const shake = this.shake;
    this.shake = Math.max(0, shake - dt * 2.2);
    const wobble = shake * shake * 0.1;

    const hero = this.heroBlend;
    this.spin += dt * 0.12;
    if (this.free) { this.tickSidechains(dt); this.water.mesh.visible = false; return; }
    const heroQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25 * Math.sin(this.spin * 0.7), this.spin, 0));
    const leftQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    this.left.quaternion.copy(leftQ).slerp(heroQ, hero);
    this.left.position.set(-gap - fall * 3.2, 0, fall * 0.6).multiplyScalar(1 - hero);
    this.left.position.x += Math.sin(time * 41) * wobble;
    this.left.rotation.z += fall * 0.5 * (1 - hero);
    this.antibody.position.copy(IGG_CENTRE).multiplyScalar(-hero);

    this.right.rotation.set(0, a, 0);
    this.right.position.set(gap + fall * 0.6, Math.sin(time * 37) * wobble, 0);

    this.tickSidechains(dt);
    this.water.mesh.visible = hero < 0.5 && this.antigen !== null;
    this.water.tick(dt, time, open);
  }

  tickSidechains(dt) {
    for (const side of Object.values(this.side)) {
      for (const mesh of Object.values(side)) {
        if (mesh.grow < 1) {
          mesh.grow = Math.min(1, mesh.grow + dt * 3.6);
          const t = mesh.grow;
          mesh.scale.setScalar(0.001 + easeOut(t) * (1 + 0.45 * Math.sin(t * Math.PI) * (1 - t)));
        }
      }
    }
  }
}
