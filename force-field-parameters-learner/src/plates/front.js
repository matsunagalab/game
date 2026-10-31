// Frontispiece: one ideal helix, a pale photogram until the player has folded it for real.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Sticks, INK } from '../gfx.js';
import { Ribbon } from './ribbon.js';
import { backbone } from '../physics/peptide.js';
import { save } from '../save.js';

const RES = 22;

export class Front extends Plate {
  enter() {
    const r = this.root;
    const won = !!save.tiers.meta;
    const b = backbone(Array(RES).fill([-60, -45]));
    let cx = 0, cy = 0, cz = 0;
    b.forEach(p => { cx += p.CA[0]; cy += p.CA[1]; cz += p.CA[2]; });
    cx /= RES; cy /= RES; cz /= RES;
    const pts = [], ca = new Float64Array(3 * RES), gd = new Float64Array(3 * RES);
    b.forEach((p, i) => {
      ca.set([p.CA[0] - cx, p.CA[1] - cy, p.CA[2] - cz], 3 * i);
      gd.set([p.O[0] - p.C[0], p.O[1] - p.C[1], p.O[2] - p.C[2]], 3 * i);
      for (const k of ['N', 'CA', 'C', 'O']) pts.push([p[k][0] - cx, p[k][1] - cy, p[k][2] - cz, k]);
    });
    this.ribbon = new Ribbon(RES, { color: won ? INK.gold : INK.pale, width: 1.4, thick: 0.2 });
    this.ribbon.update(ca, gd);
    this.atoms = new Atoms(pts.length, { detail: 3 });
    pts.forEach((p, i) => {
      this.atoms.setAtom(i, p[0], p[1], p[2], p[3] === 'O' ? 0.46 : 0.42);
      this.atoms.setColor(i, p[3] === 'O' ? INK.O : p[3] === 'N' ? INK.N : INK.C);
    });
    this.atoms.flush(true);
    const seq = pts.length - 1;
    this.sticks = new Sticks(seq, { radius: 0.1, color: INK.C });
    for (let i = 0; i < seq; i++) {
      const from = pts[pts[i + 1][3] === 'O' ? i : i], to = pts[i + 1];
      if (pts[i][3] === 'O') { const c = pts[i - 1]; this.sticks.setStick(i, c[0], c[1], c[2], to[0], to[1], to[2]); }
      else this.sticks.setStick(i, from[0], from[1], from[2], to[0], to[1], to[2]);
    }
    this.sticks.flush();
    // Stand the helix on its own axis, so it turns like a specimen on a pin.
    const first = ca.slice(0, 3), last = ca.slice(3 * RES - 3);
    const axis = new THREE.Vector3(last[0] - first[0], last[1] - first[1], last[2] - first[2]).normalize();
    this.pin = new THREE.Group();
    this.pin.add(this.sticks, this.atoms, this.ribbon);
    this.pin.quaternion.setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
    this.spin = new THREE.Group();
    this.spin.add(this.pin);
    r.add(this.spin);
    r.rotation.z = -0.2;
    this.fit();
  }
  fit() { this.stage.frame(18, [0, 0, 0], { pitch: 0.05 }); }
  update(dt) { this.spin.rotation.y += dt * 0.16; }
  down() { return false; }
  exit() { this.root.rotation.set(0, 0, 0); }
}
