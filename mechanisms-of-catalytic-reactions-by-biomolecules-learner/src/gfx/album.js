// The folding album: nine panels of one sheet. Swipe along it. Finished panels are gilded.
// When every panel holds gold, the album leaves its line and the panels meet as one figure.
import * as THREE from 'three';
import { clothMaterial } from './kit.js';

const FOLD = 1.02;   // radians, the fold of a closed pleat

export class AlbumScene {
  constructor(stage) {
    this.stage = stage;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0.004, 0.003, 0.009);
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
    this.camera.position.z = 12;
    this.dive = 0;
    this.panels = [];
    this.group = new THREE.Group(); this.scene.add(this.group);
    const geo = new THREE.PlaneGeometry(1, 2);
    for (let i = 0; i < 9; i++) {
      const cx = i % 3, cy = 2 - Math.floor(i / 3);
      const rect = [cx / 3, cy / 3, 1 / 3, 1 / 3];
      const m = clothMaterial(stage, { rect, gild: [0, 0, 0], wax: 1 });
      const p = new THREE.Mesh(geo, m);
      p.userData = { i, gild: new THREE.Vector3(), target: new THREE.Vector3() };
      this.group.add(p); this.panels.push(p);
    }
    this.scroll = 0; this.want = 0; this.joined = 0; this.joinWant = 0;
    this.resize();
  }

  setGold(tiers) { tiers.forEach((tier, i) => { this.panels[i].userData.target.set(tier >= 1 ? 1 : 0, tier >= 2 ? 1 : 0, tier >= 3 ? 1 : 0); }); }

  resize() {
    const { stage, camera } = this;
    camera.aspect = stage.w / stage.h; camera.updateProjectionMatrix();
    const viewH = 2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
    this.viewH = viewH; this.viewW = viewH * camera.aspect;
    this.portrait = camera.aspect < 0.9;
    this.size = this.portrait ? Math.min(this.viewW * 0.66, this.viewH * 0.3) : Math.min(this.viewH * 0.31, this.viewW * 0.17);
  }

  // Lays the strip out from the panel nearest the middle, so its hinges always meet.
  update(t, dt, pointer) {
    this.scroll += (this.want - this.scroll) * Math.min(1, dt * 7);
    this.joined += (this.joinWant - this.joined) * Math.min(1, dt * 1.1);
    const s = this.scroll, S = this.size, J = this.joined;
    const flat = (d) => Math.exp(-d * d * 3.2);
    const pose = [];
    const mid = Math.round(s);
    const ang = (i) => (i % 2 ? 1 : -1) * FOLD * (1 - flat(i - s));
    pose[mid] = { x: (mid - s) * S * Math.cos(ang(mid)) * 1.0, z: 0, a: ang(mid) };
    for (let i = mid + 1; i < 9; i++) { const p = pose[i - 1], a = ang(i), hx = p.x + Math.cos(p.a) * S / 2, hz = p.z - Math.sin(p.a) * S / 2; pose[i] = { x: hx + Math.cos(a) * S / 2, z: hz - Math.sin(a) * S / 2, a }; }
    for (let i = mid - 1; i >= 0; i--) { const p = pose[i + 1], a = ang(i), hx = p.x - Math.cos(p.a) * S / 2, hz = p.z + Math.sin(p.a) * S / 2; pose[i] = { x: hx - Math.cos(a) * S / 2, z: hz + Math.sin(a) * S / 2, a }; }
    this.camera.position.z = 12 - this.dive * 7;
    const G = this.portrait ? Math.min(this.viewW / 3, this.viewH / 6.9) : this.viewH / 6.6;
    const a = t * 0.2;
    const L = new THREE.Vector3(Math.sin(a) * 0.7 + pointer.x * 0.5, 0.45 + pointer.y * 0.4, 0.9).normalize();
    this.panels.forEach((p, i) => {
      const q = pose[i], u = p.userData, gx = (i % 3 - 1) * G, gy = (1 - Math.floor(i / 3)) * 2 * G;
      p.position.set(q.x + (gx - q.x) * J, (this.portrait ? 0.45 : 0.25) * (1 - J) + (gy + (this.portrait ? 0.32 : 0.1)) * J, q.z * (1 - J));
      p.rotation.y = q.a * (1 - J);
      const sc = S + (G - S) * J; p.scale.set(sc, sc, 1);
      u.gild.lerp(u.target, Math.min(1, dt * 0.8));
      p.material.uniforms.uGild.value.copy(u.gild);
      p.material.uniforms.uLight.value.copy(L);
    });
  }

  // Which panel a tap hit, by real rays through the folded album.
  pick(nx, ny) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = ray.intersectObjects(this.panels)[0];
    return hit ? hit.object.userData.i : -1;
  }
}
