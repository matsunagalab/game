// The 24-well crystallization plate: the level select, and the thing every drop lives in.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { OPTICS_GLSL } from './optics.js';
import { site } from './sites.js';
import { METALS, WELLS } from './content.js';

const PITCH = 19.3;
const RADIUS = 7.8;
const rowOf = (id) => 'ABCD'.indexOf(id[0]);
const colOf = (id) => Number(id[1]) - 1;

export const gemMaterial = (tint) => new THREE.ShaderMaterial({
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(tint) }, uAlpha: { value: 1 }, uPower: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec3 vP;
    varying vec3 vW;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vP = mv.xyz;
      vW = position;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime, uAlpha, uPower;
    uniform vec3 uTint;
    varying vec3 vP;
    varying vec3 vW;
    ${OPTICS_GLSL}
    void main() {
      vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
      float ndv = abs(dot(n, normalize(-vP)));
      float g = 420.0 + 1500.0 * (1.0 - ndv) + 150.0 * sin(dot(vW, vec3(0.5, 0.4, 0.6)) + uTime * 0.6);
      vec3 c = birefringence(g);
      c = mix(c, c * uTint * 1.5, 0.45);
      c *= (0.5 + 1.8 * pow(1.0 - ndv, 2.0)) * uPower;
      gl_FragColor = vec4(c * uAlpha, 1.0);
    }`,
});

// A crystal for each solved well: the real coordination polyhedron of that site.
function gemGeometry(id) {
  const w = WELLS[id];
  const d = site(w.site);
  const st = d.stages[d.stages.length - 1];
  let pts;
  if (d.hull) pts = d.hull.map((i) => d.atoms[i]);
  else pts = [...st.tap, ...st.given].map((x) => d.atoms[x.i]);
  let v = pts.map((a) => new THREE.Vector3(a.x, a.y, a.z));
  const c = new THREE.Vector3();
  v.forEach((p) => c.add(p));
  c.divideScalar(v.length);
  if (v.length < 4) v.push(new THREE.Vector3().copy(c).add(new THREE.Vector3(0.3, 0.4, 1)));
  const r = Math.max(...v.map((p) => p.distanceTo(c))) || 1;
  v = v.map((p) => p.clone().sub(c).multiplyScalar(4.1 / r));
  return new ConvexGeometry(v);
}

export class Plate {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    stage.scene.add(this.group);
    this.wells = {};
    this.fade = 1;
    this.selected = null;
    this.next = null;

    const ring = new THREE.TorusGeometry(RADIUS, 0.14, 8, 72);
    const hole = new THREE.RingGeometry(RADIUS * 0.985, RADIUS * 1.2, 64);
    const dropGeo = new THREE.SphereGeometry(RADIUS * 0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    dropGeo.rotateX(Math.PI / 2);
    dropGeo.scale(1, 1, 0.34);
    this.mats = [];
    for (const row of ['A', 'B', 'C', 'D']) {
      for (let c = 1; c <= 6; c++) {
        const id = `${row}${c}`;
        const well = WELLS[id];
        const tint = METALS[well.metal].glow;
        const g = new THREE.Group();
        g.position.copy(this.home(id));
        const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.33, 0.37), transparent: true });
        const r = new THREE.Mesh(ring, ringMat);
        const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.007, 0.0075, 0.01), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const h = new THREE.Mesh(hole, haloMat);
        const dropMat = new THREE.ShaderMaterial({
          blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
          uniforms: { uColor: { value: new THREE.Color(tint) }, uLit: { value: 0 }, uAlpha: { value: 1 } },
          vertexShader: /* glsl */ `
            varying vec3 vN;
            varying vec3 vV;
            void main() {
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vN = normalMatrix * normal;
              vV = -mv.xyz;
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            uniform float uLit, uAlpha;
            varying vec3 vN;
            varying vec3 vV;
            void main() {
              float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
              vec3 c = mix(vec3(0.26, 0.28, 0.33), uColor * 0.8, uLit) * (0.07 + rim * 0.5);
              gl_FragColor = vec4(c * uAlpha, 1.0);
            }`,
        });
        const drop = new THREE.Mesh(dropGeo, dropMat);
        g.add(h, r, drop);
        let gem = null;
        if (well.kind === 'site') {
          gem = new THREE.Mesh(gemGeometry(id), gemMaterial(tint));
          gem.visible = false;
          gem.position.z = 1.2;
          g.add(gem);
        } else {
          const mark = new THREE.Mesh(new THREE.TorusGeometry(RADIUS * 0.34, 0.1, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.3, 0.55), transparent: true }));
          g.add(mark);
          this.mats.push(mark.material);
        }
        this.inner.add(g);
        this.mats.push(ringMat, haloMat);
        this.wells[id] = { id, g, ring: r, ringMat, drop, dropMat, gem, lit: 0, pulse: 0 };
      }
    }
    this.layout();
  }

  // Rows run across on a wide screen. On a tall phone they run down, which gives bigger wells.
  home(id) {
    const r = rowOf(id);
    const c = colOf(id);
    if (this.stage.portrait) return new THREE.Vector3((r - 1.5) * PITCH, (2.5 - c) * PITCH, 0);
    return new THREE.Vector3((c - 2.5) * PITCH, (1.5 - r) * PITCH, 0);
  }

  layout() {
    const portrait = this.stage.portrait;
    for (const id of Object.keys(this.wells)) this.wells[id].g.position.copy(this.home(id));
    const halfW = portrait ? 2.3 * PITCH : 3.2 * PITCH;
    const halfH = portrait ? 3.05 * PITCH : 2.3 * PITCH;
    const tan = Math.tan((this.stage.camera.fov * Math.PI) / 360);
    const dist = Math.max(halfH / tan, halfW / (tan * this.stage.camera.aspect)) * (portrait ? 1.3 : 1.42);
    this.viewDist = dist;
    const short = !portrait && this.stage.h < 480;
    this.group.position.set(portrait ? 0 : short ? -46 : 30, portrait ? 13 : short ? -2 : 4, 0);
    this.pitch = PITCH;
  }

  // World position of a well, after the plate has been turned.
  wellWorld(id, out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    return this.wells[id].g.getWorldPosition(out);
  }

  setSolved(id, on) {
    const w = this.wells[id];
    if (w.gem) w.gem.visible = on;
    w.lit = on ? 1 : 0;
  }

  update(dt, t) {
    for (const w of Object.values(this.wells)) {
      const sel = this.selected === w.id;
      const nxt = this.next === w.id;
      w.pulse += ((sel ? 1 : nxt ? 0.35 + 0.35 * Math.sin(t * 3) : 0) - w.pulse) * Math.min(1, dt * 9);
      const v = 0.3 + w.pulse * 1.6 + w.lit * 0.25;
      w.ringMat.color.setRGB(v, v * 1.02, v * 1.1);
      w.ringMat.opacity = this.fade;
      w.dropMat.uniforms.uLit.value = w.lit;
      w.dropMat.uniforms.uAlpha.value = this.fade;
      if (w.gem && w.gem.visible) {
        w.gem.rotation.x = t * 0.2 + w.g.position.x;
        w.gem.rotation.y = t * 0.31 + w.g.position.y;
        const u = w.gem.material.uniforms;
        u.uTime.value = t;
        u.uAlpha.value = this.fade;
      }
    }
    for (const m of this.mats) if (m !== undefined) m.opacity = this.fade;
    this.group.visible = this.fade > 0.003;
  }

  pick(x, y) {
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    let best = null;
    let bd = Infinity;
    for (const id of Object.keys(this.wells)) {
      this.stage.project(this.wellWorld(id, v), p);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    const pitchPx = this.pitchPx();
    return bd < pitchPx * 0.62 ? best : null;
  }

  pitchPx() {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const v = new THREE.Vector3();
    this.stage.project(this.wellWorld('A1', v), a);
    this.stage.project(this.wellWorld('A2', v), b);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
