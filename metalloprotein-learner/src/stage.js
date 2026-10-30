// Renderer, camera and the final picture: bloom, then the interference figure, then the grade.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OPTICS_GLSL } from './optics.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uField: { value: 0 }, // Strength of the figure used as a backdrop.
    uFieldCentre: { value: new THREE.Vector2(0.5, 0.5) },
    uBurst: { value: 0 }, // Strength of the figure that blooms when a metal seats.
    uBurstCentre: { value: new THREE.Vector2(0.5, 0.5) },
    uBurstRadius: { value: 0.1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFlash: { value: 0 },
    uFade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uField, uBurst, uBurstRadius, uFlash, uFade;
    uniform vec2 uFieldCentre, uBurstCentre;
    uniform vec3 uTint;
    varying vec2 vUv;
    ${OPTICS_GLSL}
    // A uniaxial crystal seen down its optic axis: rings of retardation crossed by a black cross.
    vec3 figure(vec2 p, float scale, float turn) {
      float r2 = dot(p, p) * scale;
      float t = atan(p.y, p.x) + turn;
      float cross = sin(2.0 * t);
      return birefringence(r2 * 2400.0) * cross * cross;
    }
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    float grain(vec2 uv) { return fract(sin(dot(uv + fract(uTime), vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 asp = vec2(max(uAspect, 1.0), max(1.0 / uAspect, 1.0));
      if (uField > 0.001) {
        vec2 p = (vUv - uFieldCentre) * asp;
        float fall = 1.0 - smoothstep(0.25, 1.0, length(p));
        c += figure(p, 3.6, uTime * 0.035) * fall * uField;
      }
      if (uBurst > 0.001) {
        vec2 p = (vUv - uBurstCentre) * asp;
        float r = length(p);
        float edge = 1.0 - smoothstep(uBurstRadius * 0.55, uBurstRadius, r);
        c += figure(p, 2.6 / (uBurstRadius * uBurstRadius), 0.0) * edge * uBurst * 0.72 * mix(vec3(1.0), uTint, 0.3);
      }
      c += uFlash * uTint;
      float v = length((vUv - 0.5) * vec2(1.0, 1.1));
      c *= 1.0 - smoothstep(0.42, 0.86, v) * 0.5;
      c = aces(c * 1.12);
      c = pow(c, vec3(1.0 / 2.2));
      c += (grain(vUv) - 0.5) * 0.018;
      gl_FragColor = vec4(c * uFade, 1.0);
    }`,
};

const coarse = matchMedia('(pointer: coarse)').matches;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0, 0, 0);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 6000);
    this.dpr = Math.min(window.devicePixelRatio || 1, coarse ? 2 : 2);
    this.w = 1;
    this.h = 1;

    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.7, 0.72);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.u = this.final.uniforms;

    this.samples = [];
    this.lift = 0;
    this.liftGoal = 0;
    this.shift = 0;
    this.shiftGoal = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }

  get portrait() {
    return this.h > this.w;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.w && h === this.h && this.renderer.getPixelRatio() === this.dpr) return;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    const small = Math.round(Math.min(w, h) * this.dpr * (coarse ? 0.3 : 0.45));
    this.bloom.setSize(Math.max(160, Math.round((small * w) / Math.min(w, h))), Math.max(160, Math.round((small * h) / Math.min(w, h))));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.u.uAspect.value = w / h;
    this.onResize?.();
  }

  // Lifts the picture so the subject clears the tray at the bottom of the screen.
  setLift(y, x = 0) {
    this.liftGoal = y;
    this.shiftGoal = x;
  }

  easeLift(dt) {
    const k = 1 - Math.exp(-dt * 5);
    this.lift += (this.liftGoal - this.lift) * k;
    this.shift += (this.shiftGoal - this.shift) * k;
    if (Math.abs(this.lift) + Math.abs(this.shift) < 0.5 && !this.liftGoal && !this.shiftGoal) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.w, this.h, this.shift, this.lift, this.w, this.h);
  }

  // Drops resolution when frames run long, so a phone stays smooth.
  watch(ms) {
    this.samples.push(ms);
    if (this.samples.length < 50) return;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    if (mean > 26 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.resize();
    }
  }

  project(v, out) {
    const p = out.copy(v).project(this.camera);
    p.x = ((p.x + 1) / 2) * this.w;
    p.y = ((1 - p.y) / 2) * this.h;
    return p;
  }

  render(t) {
    this.u.uTime.value = t;
    this.composer.render();
  }
}
