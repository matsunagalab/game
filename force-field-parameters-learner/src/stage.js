// Renderer, cyanotype post-processing, and a camera that keeps the specimen inside the free part of the screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const PRUSSIAN = 0x0d2c5e;

// Baked noise, so the print effect costs a few texture reads even on a phone.
// R fine grain, G long paper fibres, B soft wash, A development pattern.
function paperTexture() {
  const S = 512, d = new Uint8Array(S * S * 4);
  const lattice = (seed) => {
    const n = 512, g = new Float32Array(n * n);
    let v = seed;
    for (let i = 0; i < g.length; i++) { v = (v * 16807) % 2147483647; g[i] = v / 2147483647; }
    // px, py are the wrap periods, so every octave tiles exactly.
    return (x, y, px, py) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
      const at = (a, b) => g[(a % px) + n * (b % py)];
      return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - w) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * w;
    };
  };
  const a = lattice(17), b = lattice(91), c = lattice(233);
  const fbm = (fn, u, v, oct, fx, fy) => {
    let s = 0, w = 0.5, t = 0;
    for (let o = 0; o < oct; o++) {
      const k = 1 << o, px = fx * k, py = fy * k;
      s += w * fn(u * px, v * py, px, py); t += w; w *= 0.5;
    }
    return s / t;
  };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S, q = 4 * (i + S * j);
    d[q] = 255 * Math.random();
    d[q + 1] = 255 * fbm(a, u, v, 5, 8, 32);
    d[q + 2] = 255 * fbm(b, u, v, 4, 4, 4);
    d[q + 3] = 255 * Math.min(1, Math.max(0, (fbm(c, u, v, 5, 5, 2) - 0.28) * 2.2));
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const PrintShader = {
  uniforms: {
    tDiffuse: { value: null }, tPaper: { value: null }, uAspect: { value: 1 }, uReveal: { value: 1 },
    uEdge: { value: 0.016 }, uWob: { value: 1 }, uPulse: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse, tPaper; uniform float uAspect, uReveal, uEdge, uWob, uPulse;
    varying vec2 vUv;
    vec3 tone(vec3 x){ return 1.-exp(-x*1.55); }
    void main(){
      vec2 p = vec2(vUv.x*uAspect, vUv.y);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = tone(c*(1.+uPulse*.5));
      vec4 fine = texture2D(tPaper, gl_FragCoord.xy/512.);
      vec4 broad = texture2D(tPaper, p*vec2(.55,1.1));
      float fibre = texture2D(tPaper, p*vec2(.9,2.6)).g;
      c = pow(c, vec3(1./2.2));
      c *= .93 + .13*fibre;
      c += (fine.r-.5)*.022;
      vec2 d = min(vUv, 1.-vUv)*vec2(uAspect,1.);
      float e = min(d.x, d.y);
      float wob = ((broad.b-.5)*.05 + (fibre-.5)*.03)*uWob;
      float coat = smoothstep(uEdge*.4, uEdge*.4+.008, e+wob*.8);
      float dev = smoothstep(broad.a-.12, broad.a+.12, uReveal*1.3-.15);
      vec3 paper = vec3(.905,.92,.90)*(.96+.05*fibre) + (fine.r-.5)*.015;
      gl_FragColor = vec4(mix(paper, c, coat*dev), 1.);
    }`,
};

export class Stage {
  constructor(canvas, { mobile }) {
    this.mobile = mobile;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.setClearColor(PRUSSIAN);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the print pass does its own display transform
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 2000);
    this.root = new THREE.Group();     // everything belonging to the current plate
    this.scene.add(this.root);
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.view = { radius: 10, target: new THREE.Vector3(), yaw: 0, pitch: 0 };
    this.tilt = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
    this.autoYaw = 0;
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 2 : 2);
    this.quality = 0;

    const paper = paperTexture();
    this.paper = paper;
    this.addBackdrop(paper);
    this.addDust();

    // Phones have enough pixels to skip multisampling. Very old GPUs fall back to 8-bit buffers.
    const gl = renderer.getContext();
    const hdr = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: mobile ? 0 : 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.print = new ShaderPass(PrintShader);
    this.print.uniforms.tPaper.value = paper;
    this.print.material.toneMapped = false;
    this.composer.addPass(this.print);

    this.reveal = 0; this.revealTo = 1; this.pulse = 0;
    this.frameTimes = [];
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }

  addBackdrop(paper) {
    const g = new THREE.PlaneGeometry(2, 2);
    const m = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tPaper: { value: paper }, uAspect: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, .9999, 1.); }`,
      fragmentShader: `
        uniform sampler2D tPaper; uniform float uAspect; varying vec2 vUv;
        void main(){
          vec2 p = vec2(vUv.x*uAspect, vUv.y);
          float wash = texture2D(tPaper, p*vec2(.32,.8)).b;
          float streak = texture2D(tPaper, p*vec2(.22,1.3)).a;
          float r = length((vUv-vec2(.5,.56))*vec2(1.,1.15));
          vec3 deep = vec3(.0085,.033,.105), mid = vec3(.018,.078,.215), lift = vec3(.042,.145,.33);
          vec3 c = mix(mid, deep, smoothstep(.12,.82,r));
          c = mix(c, lift, (wash-.42)*1.1*(1.-smoothstep(.1,.9,r)));
          c *= .9+.2*streak;
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    const q = new THREE.Mesh(g, m);
    q.frustumCulled = false; q.renderOrder = -10;
    this.backdrop = q;
    this.scene.add(q);
  }

  // Dust that really does a random walk: the first Brownian motion anyone saw.
  addDust() {
    const n = this.mobile ? 70 : 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 60;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.09, color: 0xbfd8ee, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  setInsets(ins) { Object.assign(this.insets, ins); this.resize(); }

  // Fit a sphere of this radius into the free part of the screen.
  frame(radius, target = [0, 0, 0], { yaw = 0, pitch = 0 } = {}) {
    this.view.radius = radius;
    this.view.target.set(...target);
    this.view.yaw = yaw; this.view.pitch = pitch;
    this.placeCamera(true);
  }

  placeCamera(snap) {
    const { radius, target, yaw, pitch } = this.view;
    const w = this.width, h = this.height;
    // Insets glide, so a longer note never makes the specimen jump.
    const I = this.ins ??= { ...this.insets };
    for (const k in I) I[k] = snap ? this.insets[k] : I[k] + (this.insets[k] - I[k]) * 0.1;
    const fh = Math.max(40, h - I.top - I.bottom);
    const fw = Math.max(40, w - I.left - I.right);
    const t = Math.tan(this.camera.fov * Math.PI / 360);
    const dist = Math.max(radius / t * (h / fh), radius / (t * this.camera.aspect) * (w / fw));
    this.targetDist = dist;
    if (snap || this.dist === undefined) this.dist = dist;
    this.dist += (dist - this.dist) * 0.08;
    const y = yaw + this.tilt.yaw + (this.still ? 0 : this.autoYaw), p = pitch + this.tilt.pitch;
    const c = this.camera;
    c.position.set(
      target.x + this.dist * Math.sin(y) * Math.cos(p),
      target.y + this.dist * Math.sin(p),
      target.z + this.dist * Math.cos(y) * Math.cos(p));
    c.up.set(0, 1, 0);
    c.lookAt(target);
    // Shift the picture so the specimen sits in the middle of the free area.
    const ox = (I.right - I.left) / 2, oy = (I.bottom - I.top) / 2;
    c.setViewOffset(w, h, ox, oy, w, h);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const a = w / h;
    this.print.uniforms.uAspect.value = a;
    this.print.uniforms.uEdge.value = Math.min(0.016, 0.012 * Math.min(1, a));
    this.print.uniforms.uWob.value = Math.min(1, 0.32 + 0.45 * a);
    this.backdrop.material.uniforms.uAspect.value = a;
    this.placeCamera(true);
  }

  // Lower the resolution rather than the frame rate on slower devices.
  adapt(ms) {
    const f = this.frameTimes;
    f.push(ms);
    if (f.length < 60) return;
    f.sort((a, b) => a - b);
    const med = f[30];
    f.length = 0;
    if (med > 24 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.resize();
    }
  }

  clear() {
    const r = this.root;
    while (r.children.length) {
      const o = r.children.pop();
      o.traverse?.(c => {
        c.geometry?.dispose?.();
        if (c.material && !c.material.userData?.shared) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose?.());
      });
      o.dispose?.();
    }
    this.tilt.yaw = this.tilt.pitch = 0;
    this.autoYaw = 0;
  }

  develop(from = 0) { this.reveal = this.still ? 1 : from; this.revealTo = 1; }
  wash() { this.revealTo = 0; }

  render(dt) {
    const rv = 1 - Math.exp(-dt * 2.1);
    this.reveal += (this.revealTo - this.reveal) * rv;
    if (this.revealTo === 1 && this.reveal > 0.995) this.reveal = 1;
    this.pulse *= Math.exp(-dt * 3.5);
    this.print.uniforms.uReveal.value = this.reveal;
    this.print.uniforms.uPulse.value = this.pulse;

    // A tilt from dragging springs back, so a lost camera is not possible.
    const k = dt * 30;
    this.tilt.vy += (-this.tilt.yaw * 0.12 - this.tilt.vy * 0.5) * k * 0.3;
    this.tilt.vp += (-this.tilt.pitch * 0.12 - this.tilt.vp * 0.5) * k * 0.3;
    if (!this.dragging) { this.tilt.yaw += this.tilt.vy * k * 0.1; this.tilt.pitch += this.tilt.vp * k * 0.1; }
    this.placeCamera(false);

    const p = this.dust.geometry.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i++) a[i] += (Math.random() - 0.5) * 0.018;
    p.needsUpdate = true;
    this.composer.render(dt);
  }

  project(v, out) {
    const p = out.copy(v).project(this.camera);
    p.x = (p.x + 1) / 2 * this.width; p.y = (1 - p.y) / 2 * this.height;
    return p;
  }

  // Point on the plane through the target, facing the camera, under a screen position.
  pointerToWorld(x, y, target, out) {
    const ndc = new THREE.Vector3((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const n = this.camera.getWorldDirection(new THREE.Vector3());
    const t = target.clone().sub(this.camera.position).dot(n) / dir.dot(n);
    return out.copy(this.camera.position).addScaledVector(dir, t);
  }

  ray(x, y) {
    const r = new THREE.Raycaster();
    r.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.camera);
    return r;
  }
}
