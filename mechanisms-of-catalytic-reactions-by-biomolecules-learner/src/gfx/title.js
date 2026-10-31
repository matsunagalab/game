// The title: the whole batik sheet, its great wheel gilded, a real enzyme at its hub, electrons running the arrows.
import * as THREE from 'three';
import { clothMaterial, bodyGeometry, bodyMaterial, textPlate, Sparks } from './kit.js';

const RING = 0.93, N = 150;

export class TitleScene {
  constructor(stage, bodies) {
    this.stage = stage;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0.004, 0.003, 0.01);
    const camera = this.camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
    camera.position.z = 15;
    this.sheetMat = clothMaterial(stage, { gild: [1, 0.0, 0.5], wax: 0.5, rect: [0, 0, 1, 1] });
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), this.sheetMat);
    this.far = clothMaterial(stage, { gild: [0, 0, 0], wax: 0.16, rect: [-5, -1, 11, 3], mirror: true });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(33, 18), this.far);
    this.wall.position.z = -0.02;
    this.root = new THREE.Group(); this.root.add(this.wall, this.sheet);
    scene.add(this.root);
    // The hub: triosephosphate isomerase, carved from its real surface, seen down the barrel.
    this.bodyMat = bodyMaterial(stage, { rim: 1.15 });
    this.body = new THREE.Mesh(bodyGeometry(bodies.tim), this.bodyMat);
    const pivot = this.pivot = new THREE.Group();
    this.body.geometry.computeBoundingSphere();
    const c = this.body.geometry.boundingSphere;
    this.body.position.copy(c.center).multiplyScalar(-1);
    pivot.add(this.body);
    const k = 0.56 / c.radius; pivot.scale.setScalar(k);
    pivot.position.z = 0.5;
    this.root.add(pivot);
    // A veil over the crown of the sheet, so the letters stand on dark cloth.
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: 'varying vec2 v; void main(){ v=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec2 v; uniform float uW; void main(){ float a=smoothstep(0.,.3,v.y)*smoothstep(1.2,.72,v.y); float e=mix(1.,smoothstep(0.,.14,v.x)*smoothstep(1.,.86,v.x),uW); gl_FragColor=vec4(.0035,.0028,.0085,a*.93*e); }', uniforms: { uW: { value: 0 } } }));
    this.veil.position.z = 0.2; this.veil.renderOrder = 4; this.root.add(this.veil);
    this.sparks = new Sparks(N);
    this.sparks.mesh.position.z = 0.02;
    this.root.add(this.sparks.mesh);
    this.seed = Array.from({ length: N }, (_, i) => ({ a: Math.random() * Math.PI * 2, s: 0.11 + Math.random() * 0.18, r: RING + (Math.random() - 0.5) * 0.08, sz: 0.008 + Math.random() * 0.018, b: 0.4 + Math.random() }));
    this.resize();
  }

  setTitle(lines, font) {
    if (this.plate) this.root.remove(this.plate);
    this.plate = textPlate(this.stage, lines, { font, size: 150, lineHeight: 0.98 });
    this.plate.renderOrder = 10;
    this.root.add(this.plate);
    this.layout();
  }

  resize() { this.layout(); }

  layout() {
    const { stage, camera } = this, aspect = stage.w / stage.h;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const tan = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
    const portrait = aspect < 0.9;
    const viewH = 2 * tan, viewW = viewH * aspect;
    const sheetK = portrait ? Math.max(viewW / 3, viewH / 6) * 1.02 : viewH / 6 * 1.04;
    this.root.scale.setScalar(sheetK);
    this.root.position.x = portrait ? 0 : viewW * 0.22;
    this.root.position.y = portrait ? viewH * 0.0 : 0;
    if (this.plate) {
      const p = this.plate;
      if (portrait) {
        const w = Math.min(2.75, (viewW / sheetK) * 0.93), h = w / p.userData.aspect;
        p.scale.set(w, h, 1);
        this.root.position.y = -viewH * 0.1;
        p.position.set(0, (viewH * 0.5 + viewH * 0.1) / sheetK - h * 0.56 - 0.1, 0.7);
        this.veil.scale.set(3.6, h * 1.5, 1); this.veil.position.y = p.position.y - h * 0.16; this.veil.position.x = 0; this.veil.material.uniforms.uW.value = 0;
      } else {
        const w = viewW * 0.42 / sheetK, h = w / p.userData.aspect;
        p.scale.set(w, h, 1);
        p.position.set(-viewW * 0.47 / sheetK, 0.4, 0.7);
        this.veil.scale.set(0.01, 0.01, 1);
      }
    }
  }

  update(t, dt, pointer) {
    const motion = this.stage.reduced ? 0 : 1;
    const a = t * 0.17 * motion;
    const L = new THREE.Vector3(Math.sin(a) * 0.75 + pointer.x * 0.5, Math.cos(a * 0.8) * 0.6 + pointer.y * 0.5, 0.86);
    for (const m of [this.sheetMat, this.far, this.bodyMat, this.plate?.material]) if (m) m.uniforms.uLight.value.copy(L);
    this.root.rotation.y = (Math.sin(t * 0.13) * 0.018 * motion + pointer.x * 0.03);
    this.root.rotation.x = (Math.cos(t * 0.11) * 0.012 * motion - pointer.y * 0.02);
    this.pivot.rotation.z = t * 0.04 * motion;
    this.pivot.rotation.x = Math.sin(t * 0.17) * 0.08 * motion;
    const s = this.sparks;
    this.seed.forEach((e, i) => {
      const ang = e.a - t * e.s * motion;
      const sp = 0.08 * ((((-ang) % (Math.PI * 2 / 9)) + Math.PI * 2 / 9) % (Math.PI * 2 / 9)) / (Math.PI * 2 / 9);
      const r = e.r + sp - 0.04;
      s.offset[i * 3] = Math.cos(ang) * r; s.offset[i * 3 + 1] = Math.sin(ang) * r; s.offset[i * 3 + 2] = 0.03;
      s.size[i] = e.sz; s.glow[i] = e.b * (0.7 + 0.3 * Math.sin(t * 3 + i));
    });
    s.flush();
  }
}
