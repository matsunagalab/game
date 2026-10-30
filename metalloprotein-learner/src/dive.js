// Powers of ten: from a plate on the bench down to a single metal site, in one continuous fall.
import * as THREE from 'three';
import { gemMaterial } from './plate.js';
import { ribbonGeometry, ribbonMaterial } from './ribbon.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const lerpLog = (a, b, t) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);

const STOPS = [[0, 1e-1], [0.2, 1e-2], [0.4, 1e-3], [0.56, 1e-4], [0.72, 2e-7], [0.88, 1e-8], [1, 2e-9]];
const widthAt = (u) => {
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (u <= STOPS[i + 1][0]) return lerpLog(STOPS[i][1], STOPS[i + 1][1], (u - STOPS[i][0]) / (STOPS[i + 1][0] - STOPS[i][0]));
  }
  return STOPS[STOPS.length - 1][1];
};
const label = (m) => {
  const units = [[1e-2, 'cm', 1e2], [1e-3, 'mm', 1e3], [1e-6, 'µm', 1e6], [1e-9, 'nm', 1e9]];
  for (const [limit, unit, k] of units) if (m >= limit) return `${Math.round(m * k)} ${unit}`;
  return `${(m * 1e10).toFixed(0)} Å`;
};

export class Dive {
  constructor(app, wellId, view, finish) {
    this.app = app;
    this.view = view;
    this.finish = finish;
    this.t = 0;
    this.length = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.01 : 3.7;
    const { stage, plate } = app;
    this.start = plate.wellWorld(wellId).clone();
    this.base = plate.group.position.clone();
    this.d0 = plate.viewDist;
    this.dEnd = app.orbit.dist;
    this.crystalTint = view.well ? view.tint : new THREE.Color('#ffffff');

    // A little crystal in the drop.
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(1, 1.5, 0.8);
    geo.rotateZ(0.35);
    this.crystal = new THREE.Mesh(geo, gemMaterial(this.crystalTint));
    this.crystal.material.uniforms.uPower.value = 0.34;
    this.crystal.frustumCulled = false;
    stage.scene.add(this.crystal);

    // Copies of the molecule packed in a lattice.
    this.latticeGeo = ribbonGeometry(view.data, { perResidue: 2, radial: 4 });
    this.latticeMat = ribbonMaterial('#ffffff');
    this.latticeMat.uniforms.uFogNear.value = 1e5;
    this.latticeMat.uniforms.uFogFar.value = 2e5;
    const span = this.latticeGeo.boundingSphere.radius * 1.9 + 8;
    const copies = [];
    const wide = matchMedia('(pointer: coarse)').matches ? 1 : 2;
    for (let x = -wide; x <= wide; x++) for (let y = -wide - 1; y <= wide + 1; y++) for (let z = -wide; z <= 1; z++) if (x || y || z) copies.push(new THREE.Matrix4().makeTranslation(x * span, y * span, z * span));
    this.lattice = new THREE.InstancedMesh(this.latticeGeo, this.latticeMat, copies.length);
    copies.forEach((m, i) => this.lattice.setMatrixAt(i, m));
    this.lattice.frustumCulled = false;
    stage.scene.add(this.lattice);

    view.group.visible = false;
    this.lattice.visible = false;
    this.scale = document.createElement('div');
    this.scale.className = 'scalebar';
    this.scale.innerHTML = '<i></i><span></span>';
    document.getElementById('ui').append(this.scale);
    this.update(0);
  }

  skip() {
    this.t = this.length;
  }

  update(dt) {
    this.t = Math.min(this.length, this.t + dt);
    const u = this.t / this.length;
    const { app, view } = this;
    const { plate, stage } = app;
    const cam = stage.camera;
    cam.quaternion.identity();
    this.scale.lastChild.textContent = label(widthAt(u) / 5);

    // Plate and drop: the plate grows around the chosen well.
    const a = clamp(0, 0.46, u);
    const s = Math.exp(a * a * Math.log(70));
    plate.group.scale.setScalar(s);
    plate.group.position.copy(this.base).multiplyScalar(1 - a).sub(this.start.clone().sub(this.base).multiplyScalar(s * smooth(Math.min(1, a * 2.4))));
    plate.group.position.add(this.base.clone().multiplyScalar(a));
    plate.fade = 1 - clamp(0.28, 0.44, u);
    cam.position.set(0, 0, this.d0);

    // The crystal swells until we fall into it.
    const b = clamp(0.2, 0.62, u);
    this.crystal.visible = b > 0 && b < 1;
    this.crystal.scale.setScalar(Math.exp(Math.log(2.5) + b * b * Math.log(90)));
    this.crystal.rotation.set(0.4 + u * 1.2, u * 2.1, 0);
    this.crystal.material.uniforms.uAlpha.value = clamp(0.2, 0.34, u) * (1 - clamp(0.54, 0.62, u));
    this.crystal.material.uniforms.uTime.value = this.t;

    // The lattice, then one molecule, then one site.
    const c = clamp(0.54, 1, u);
    const dist = lerpLog(this.d0 * 11, this.dEnd, smooth(c) * 0.4 + c * 0.6);
    const inSite = u > 0.54;
    view.group.visible = inSite;
    this.lattice.visible = inSite && u < 0.9;
    if (inSite) cam.position.set(0, 0, dist).applyQuaternion(app.orbit.quat);
    if (inSite) cam.quaternion.copy(app.orbit.quat);
    const fadeIn = clamp(0.54, 0.64, u);
    this.latticeMat.uniforms.uFade.value = fadeIn * (1 - clamp(0.76, 0.9, u)) * 1.6;
    view.ribbonMat.uniforms.uFade.value = fadeIn;
    view.ribbonMat.uniforms.uFogNear.value = Math.max(16, dist * 0.8);
    view.ribbonMat.uniforms.uFogFar.value = Math.max(70, dist * 1.8);
    view.fog.uFade.value = clamp(0.84, 1, u);
    if (this.t >= this.length) this.done();
  }

  done() {
    if (this.finished) return;
    this.finished = true;
    const { app, view } = this;
    app.plate.fade = 0;
    app.plate.group.scale.setScalar(1);
    app.plate.group.position.copy(this.base);
    this.dispose();
    view.setFog(this.dEnd);
    view.ribbonMat.uniforms.uFade.value = 1;
    view.fog.uFade.value = 1;
    this.finish();
  }

  dispose() {
    const { scene } = this.app.stage;
    scene.remove(this.crystal, this.lattice);
    this.crystal.geometry.dispose();
    this.crystal.material.dispose();
    this.latticeGeo.dispose();
    this.latticeMat.dispose();
    this.lattice.dispose();
    this.scale.remove();
  }
}
