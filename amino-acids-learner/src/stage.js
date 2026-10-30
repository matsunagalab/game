// The ribosome on its mRNA, and where everything sits on a given screen.
import * as THREE from 'three';
import { makeRibosome, Messenger, NT, trnaMesh } from './world.js';
import { gouache, shared } from './render.js';

const FOV_TAN = Math.tan((13 * Math.PI) / 180);
const SITE = [NT * 3, 0, -NT * 3]; // A, P and E sites
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

// All layout comes from here, so portrait phones, landscape phones and desktops share one game.
export function measure(width, height, askBottom) {
  const aspect = width / height;
  const H = aspect >= 1 ? 20 : Math.max(20, 12.4 / aspect);
  const W = H * aspect;
  const perPx = H / height;
  const dist = H / 2 / FOV_TAN;
  const rs = Math.min(W * 0.56 / 7.4, H * 0.27 / 6.4, 1.1);
  const bottom = -H / 2;
  const riboY = bottom + (height < 480 ? 0.9 : 1.9) * rs + (aspect >= 1 ? 0 : 0.6);
  const zoneTop = H / 2 - askBottom * perPx - 0.1;
  const zoneBottom = riboY + (height < 480 ? 2.5 : 3.55) * rs;
  return { width, height, aspect, H, W, perPx, dist, rs, riboY, zoneTop, zoneBottom, landscape: aspect >= 1.15, short: height < 480 && aspect >= 1 };
}

// Where n molecules hover. Thumbs reach the lower rows, so nothing goes above the prompt.
export function slotsFor(L, n) {
  const zoneH = Math.max(3, L.zoneTop - L.zoneBottom);
  const midY = (L.zoneTop + L.zoneBottom) / 2;
  const out = [];
  if (n === 1) {
    // On a short screen the name buttons take the right side, so the molecule moves left.
    if (L.short) out.push({ x: -L.W * 0.23, y: (L.zoneTop - L.H / 2) / 2, r: Math.min(L.W * 0.2, (L.zoneTop + L.H / 2) * 0.46) });
    else out.push({ x: 0, y: midY, r: Math.min(zoneH * 0.48, L.W * 0.4) });
    return out;
  }
  if (L.landscape || L.aspect >= 1) {
    const cell = Math.min((L.W * 0.84) / n, 8);
    const r = Math.min(cell * 0.47, zoneH * 0.47);
    for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * cell, y: midY, r });
    return out;
  }
  // With three, the pair goes low where thumbs rest, and the chain rises between them.
  const rows = 2, top = Math.floor(n / 2);
  const cellH = zoneH / rows, cellW = L.W / 2;
  const r = Math.min(cellW * 0.46, cellH * 0.47);
  const dx = Math.min(cellW * 0.5, L.W * 0.25);
  for (let i = 0; i < n; i++) {
    const row = i < top ? 0 : 1;
    const inRow = row === 0 ? top : n - top;
    const k = row === 0 ? i : i - top;
    const x = inRow === 1 ? 0 : (k === 0 ? -dx : dx);
    out.push({ x, y: midY + (row === 0 ? cellH / 2 : -cellH / 2), r });
  }
  return out;
}

export class Stage {
  constructor(scene) {
    this.scene = scene;
    const r = makeRibosome();
    this.ribosome = r.group;
    this.big = r.big;
    this.small = r.small;
    scene.add(this.ribosome);
    this.mrna = new Messenger(scene);
    this.trnas = [];
    this.split = 0;
    this.headTarget = 0;
    this.scrollTarget = 0;
    this.kick = 0;
    this.L = null;
    this.drops = Array.from({ length: 56 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, age: 1, r: 0 }));
    this.nextDrop = 0;
    this.dropColor = new THREE.Color();
    this.dropDummy = new THREE.Object3D();
    this.dropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), gouache({ gloss: 0.3, edge: 0.5 }), this.drops.length);
    this.dropMesh.frustumCulled = false;
    this.dropMesh.setColorAt(0, this.dropColor);
    scene.add(this.dropMesh);
  }

  layout(L) {
    this.L = L;
    this.ribosome.position.set(0, L.riboY, 0);
    this.ribosome.scale.setScalar(L.rs);
    this.mrna.y = L.riboY + 0.02;
  }

  show(on) {
    this.ribosome.visible = on;
    this.mrna.show(on);
    this.trnas.forEach((t) => { t.mesh.visible = on; });
  }

  reset(rna, head) {
    this.trnas.forEach((t) => t.mesh.removeFromParent());
    this.trnas = [];
    this.split = 0;
    this.big.position.set(0, 0, 0);
    this.small.position.set(0, 0, 0);
    this.mrna.set(rna);
    this.mrna.head = head;
    this.mrna.reading = head;
    this.headTarget = head;
  }

  siteWorld(i) {
    const { L } = this;
    return new THREE.Vector3(SITE[i], L.riboY + 1.0 * L.rs, 1.1);
  }

  exitWorld() {
    const { L } = this;
    return new THREE.Vector3(-0.3, L.riboY + 3.1 * L.rs, -1.4);
  }

  // A tRNA lands in the A site, the others shuffle along, and the oldest drifts away.
  dock() {
    for (const t of this.trnas) t.site += 1;
    const mesh = trnaMesh();
    mesh.scale.setScalar(0.9 * this.L.rs);
    mesh.position.copy(this.siteWorld(0));
    this.scene.add(mesh);
    this.trnas.push({ mesh, site: 0 });
    this.kick = 1;
  }

  // A spray of paint drops where the amino acid joins.
  splash(color) {
    const site = this.siteWorld(0);
    for (let i = 0; i < 14; i++) {
      const d = this.drops[this.nextDrop];
      this.nextDrop = (this.nextDrop + 1) % this.drops.length;
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 8;
      d.life = 0.5 + Math.random() * 0.3;
      d.age = 0;
      d.r = 0.1 + Math.random() * 0.17;
      d.p.set(site.x, site.y + 1, 3);
      d.v.set(Math.cos(a) * s, Math.abs(Math.sin(a)) * s + 2, 0);
      this.dropMesh.setColorAt(this.drops.indexOf(d), this.dropColor.set(color));
    }
    this.dropMesh.instanceColor.needsUpdate = true;
  }

  advance(codons = 1) {
    this.headTarget += 3 * codons;
    this.mrna.reading = this.headTarget;
    this.scrollTarget += 5;
  }

  update(dt, time) {
    this.mrna.head += (this.headTarget - this.mrna.head) * damp(11, dt);
    shared.uScroll.value += (this.scrollTarget - shared.uScroll.value) * damp(5, dt);
    this.kick *= Math.exp(-dt * 7);
    const wob = Math.sin(time * 1.2) * 0.04;
    this.big.position.y = wob + this.kick * 0.14 + this.split * 15;
    this.small.position.y = -wob * 0.5 - this.kick * 0.09 - this.split * 11;
    this.mrna.update(time, SITE[0]);
    this.drops.forEach((d, i) => {
      d.age += dt;
      const k = d.age / d.life;
      d.v.y -= dt * 22;
      d.p.addScaledVector(d.v, dt);
      this.dropDummy.position.copy(d.p);
      this.dropDummy.scale.setScalar(k < 1 ? d.r * (1 - k * k) : 0);
      this.dropDummy.updateMatrix();
      this.dropMesh.setMatrixAt(i, this.dropDummy.matrix);
    });
    this.dropMesh.instanceMatrix.needsUpdate = true;
    for (let i = this.trnas.length - 1; i >= 0; i--) {
      const t = this.trnas[i];
      if (t.site > 2) {
        t.mesh.position.x -= dt * 7;
        t.mesh.position.y += dt * 5;
        t.mesh.rotation.z += dt * 2;
        if (t.mesh.position.y > this.L.riboY + 10) {
          t.mesh.removeFromParent();
          this.trnas.splice(i, 1);
        }
      } else {
        t.mesh.position.lerp(this.siteWorld(t.site), damp(12, dt));
        t.mesh.position.y += this.split * 0.2;
      }
    }
  }

  clearTrnas() {
    this.trnas.forEach((t) => { t.site = 3; });
  }
}
