// The press: every frame is printed with three inks instead of being lit like a photo.
// Materials write ink amounts, not colours: red = pink, green = yellow, blue = blue, alpha = object id.
// The final pass screens each ink into dots, shifts it slightly out of register and multiplies it onto the paper.
import * as THREE from '../vendor/three/three.module.js';

export const INK = {
  pink: new THREE.Color('#ff4a9e').convertLinearToSRGB(),
  yellow: new THREE.Color('#ffd21f').convertLinearToSRGB(),
  blue: new THREE.Color('#1f2aa6').convertLinearToSRGB(),
};

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const PAPER = {
  white: hex('#f6f8f7'),
  aqua: hex('#d7f0ee'),
  pink: hex('#ffe0ec'),
  yellow: hex('#fff3a8'),
  sky: hex('#dfe9ff'),
};

export const YELLOW_INK = [1, 0.82, 0.12];
export const GREEN_INK = [0.22, 0.93, 0.42];

const FULLSCREEN_VS = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PRINT_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tInk, tDepth, tNoise;
uniform vec2 uRes;        // device pixels
uniform float uCss;       // device pixels per css pixel
uniform float uNear, uFar, uFogNear, uFogFar;
uniform vec3 uPaper, uPink, uYellow, uBlue;
uniform vec3 uFloodA, uFloodB;   // background ink, bottom and top
uniform vec3 uDiscInk;
uniform vec3 uDisc;       // centre in css px from bottom left, radius in css px
uniform float uWipe, uBoil, uShadow, uFog, uDot;
uniform vec3 uGlow;       // x, y in uv, strength: a light that lifts ink away

float linearDepth(float z) {
  float n = z * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - n * (uFar - uNear));
}
float tone(vec2 p, float angle, float cell, float d, float grain) {
  if (d < 0.015) return 0.0;
  if (d > 0.965) return 1.0 - step(0.992, grain) * 0.55;
  float c = cos(angle), s = sin(angle);
  vec2 q = mat2(c, -s, s, c) * p / cell;
  vec2 f = fract(q) - 0.5;
  float r = sqrt(d) * 0.80;
  float w = 0.75 / (cell * uCss);
  return 1.0 - smoothstep(r - w, r + w, length(f) + (grain - 0.5) * 0.10);
}
void main() {
  vec2 css = gl_FragCoord.xy / uCss;
  vec2 texel = 1.0 / uRes;
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);

  // The hand: a slow, small wobble so no edge is mechanically straight.
  vec2 wob = texture(tNoise, vUv * aspect * 0.9 + uBoil).rg - 0.5;
  vec2 uv = vUv + wob * texel * 2.4 * uCss;

  // Key line from depth and id.
  float w = 0.95 * uCss;
  vec2 dx = vec2(w, 0.0) * texel, dy = vec2(0.0, w) * texel;
  vec4 c0 = texture(tInk, uv);
  float d0 = linearDepth(texture(tDepth, uv).r);
  float dl = linearDepth(texture(tDepth, uv - dx).r);
  float dr = linearDepth(texture(tDepth, uv + dx).r);
  float du = linearDepth(texture(tDepth, uv + dy).r);
  float dd = linearDepth(texture(tDepth, uv - dy).r);
  float ia = texture(tInk, uv - dx).a, ib = texture(tInk, uv + dx).a;
  float ic = texture(tInk, uv + dy).a, id = texture(tInk, uv - dy).a;
  float lap = max(abs(dl + dr - 2.0 * d0), abs(du + dd - 2.0 * d0));
  float idJump = max(max(abs(ia - c0.a), abs(ib - c0.a)), max(abs(ic - c0.a), abs(id - c0.a)));
  float scale = max(d0, 1.0) * 0.0035;
  float line = smoothstep(scale * 1.6, scale * 3.0, lap);
  line = max(line, step(0.5 / 255.0, idJump) * 0.9);
  float anything = max(max(c0.a, ia), max(ib, max(ic, id)));
  line *= step(0.5 / 255.0, anything);

  float grain = texture(tNoise, gl_FragCoord.xy / 256.0).b;

  // Fog in print is less ink, not grey.
  float fog = smoothstep(uFogNear, uFogFar, d0) * uFog;

  // Each ink is sampled out of register.
  vec2 off = vec2(1.1, -0.8) * uCss * texel;
  vec4 p = texture(tInk, uv + off);
  vec4 y = texture(tInk, uv - off.yx);
  vec4 b = c0;
  float t = vUv.y;
  vec3 flood = mix(uFloodA, uFloodB, t);
  // A printed disc sits behind the subject.
  float disc = 1.0 - smoothstep(uDisc.z - 0.8, uDisc.z + 0.8, distance(css, uDisc.xy));
  vec3 bg = mix(flood, uDiscInk, disc);

  // Hard shadow, one block offset, printed as a tint of whatever blue is free.
  float sa = texture(tInk, uv + vec2(-7.0, 9.0) * uCss * texel).a;
  float shadow = step(0.5 / 255.0, sa) * uShadow;
  bg.z = max(bg.z, shadow);

  float cp = step(0.5 / 255.0, p.a), cy = step(0.5 / 255.0, y.a), cb = step(0.5 / 255.0, b.a);
  vec3 dens = vec3(mix(bg.x, p.r, cp), mix(bg.y, y.g, cy), mix(bg.z, b.b, cb));
  dens = mix(dens, bg, fog * vec3(cp, cy, cb));
  dens.z = max(dens.z, line * (1.0 - fog * 0.55));

  if (uGlow.z > 0.0) {
    // The lantern: a disc of green with a dotted edge, printed where the blue has been held back.
    float dist = distance(vUv * aspect, uGlow.xy * aspect);
    float k = clamp((uGlow.z * 0.62 - dist) / 0.34, 0.0, 1.0);
    dens.z = max(dens.z * (1.0 - k), line * 0.9);
    dens.y = max(dens.y, k);
    dens.x *= 1.0 - k;
  }

  float cell = uDot;
  float inkP = tone(css, 0.26, cell, dens.x, grain);
  float inkY = tone(css, 1.31, cell, dens.y, grain);
  float inkB = tone(css, 0.78, cell, dens.z, grain);

  vec3 col = uPaper;
  col *= mix(vec3(1.0), uYellow, inkY);
  col *= mix(vec3(1.0), uPink, inkP);
  col *= mix(vec3(1.0), uBlue, inkB);

  // Page change: large dots of blue grow until the sheet is solid.
  if (uWipe > 0.0) {
    float big = tone(css, 0.78, 26.0, clamp(uWipe * (1.25 - 0.25 * t), 0.0, 1.0), 0.5);
    if (uWipe > 0.97) big = 1.0;
    col = mix(col, uBlue * uPaper, big);
  }
  // Paper tooth.
  col *= 0.985 + 0.03 * texture(tNoise, gl_FragCoord.xy / 512.0).a;
  fragColor = vec4(col, 1.0);
}`;

// Shared by every material: turns a base ink and a normal into printed tone.
export const SHADE_GLSL = /* glsl */ `
uniform float uShade;
vec3 printTone(vec3 ink, vec3 n) {
  vec3 L = normalize(vec3(-0.42, 0.72, 0.55));
  float l = dot(n, L);
  float shadow = smoothstep(0.02, -0.42, l);
  float lit = smoothstep(0.62, 0.96, l);
  vec3 d = ink;
  // Yellow shades toward orange, everything else toward blue: mud is what happens otherwise.
  float warm = d.g * (1.0 - d.r);
  d.r += shadow * uShade * 1.1 * warm;
  d.b += shadow * uShade * (1.0 - d.b * 0.6) * (1.0 - warm * 0.85);
  d.rg *= 1.0 - lit * 0.5;
  d.b *= 1.0 - lit * 0.7;
  return d;
}`;

function makeNoiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  // Fill with several tileable layers of smooth value noise plus fine grain.
  const lattice = (cells, seed) => {
    const g = new Float32Array(cells * cells);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 16807) % 2147483647;
      g[i] = s / 2147483647;
    }
    return (x, y) => {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (a, b) => g[((b + cells) % cells) * cells + ((a + cells) % cells)];
      return (
        at(ix, iy) * (1 - sx) * (1 - sy) + at(ix + 1, iy) * sx * (1 - sy) +
        at(ix, iy + 1) * (1 - sx) * sy + at(ix + 1, iy + 1) * sx * sy
      );
    };
  };
  const a = lattice(24, 11);
  const b = lattice(24, 977);
  let s = 1234567;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = a(x, y) * 255;
      data[i + 1] = b(x, y) * 255;
      data[i + 2] = rand() * 255;
      data[i + 3] = rand() * 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Press {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 2, 2000);
    this.focus = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    this.quality = Math.min(2, window.devicePixelRatio || 1);
    this.maxQuality = this.quality;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const depth = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: depth,
      depthBuffer: true,
      samples: 0,
    });
    this.target.texture.colorSpace = THREE.NoColorSpace;

    const u = (this.uniforms = {
      tInk: { value: this.target.texture },
      tDepth: { value: depth },
      tNoise: { value: makeNoiseTexture() },
      uRes: { value: new THREE.Vector2(4, 4) },
      uCss: { value: 1 },
      uNear: { value: 2 },
      uFar: { value: 2000 },
      uFogNear: { value: 100 },
      uFogFar: { value: 200 },
      uPaper: { value: new THREE.Vector3(...PAPER.white) },
      uPink: { value: new THREE.Vector3(1, 0.29, 0.62) },
      uYellow: { value: new THREE.Vector3(...YELLOW_INK) },
      uBlue: { value: new THREE.Vector3(0.122, 0.165, 0.65) },
      uFloodA: { value: new THREE.Vector3() },
      uFloodB: { value: new THREE.Vector3() },
      uDiscInk: { value: new THREE.Vector3() },
      uDisc: { value: new THREE.Vector3(0, 0, 0) },
      uWipe: { value: 0 },
      uBoil: { value: 0 },
      uShadow: { value: 0.22 },
      uFog: { value: 0.75 },
      uDot: { value: 3.4 },
      uGlow: { value: new THREE.Vector3() },
    });

    this.printScene = new THREE.Scene();
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const quad = new THREE.Mesh(
      tri,
      new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FULLSCREEN_VS, fragmentShader: PRINT_FS, uniforms: u, depthTest: false, depthWrite: false }),
    );
    quad.frustumCulled = false;
    this.printScene.add(quad);
    this.printCamera = new THREE.Camera();

    this.frameTimes = [];
    this.boilClock = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => this.resize());
    visualViewport?.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.cssW = w;
    this.cssH = h;
    const q = this.quality;
    const pw = Math.round(w * q);
    const ph = Math.round(h * q);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(pw, ph, false);
    this.target.setSize(pw, ph);
    this.uniforms.uRes.value.set(pw, ph);
    this.uniforms.uCss.value = q;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyFocus();
    this.onResize?.(w, h);
  }

  // Where on screen the camera's aim point should land, as fractions of the view.
  setFocus(x, y, instant = false) {
    this.focus.tx = x;
    this.focus.ty = y;
    if (instant) {
      this.focus.x = x;
      this.focus.y = y;
      this.applyFocus();
    }
  }

  applyFocus() {
    const { cssW: w, cssH: h } = this;
    this.camera.setViewOffset(w, h, (0.5 - this.focus.x) * w, (0.5 - this.focus.y) * h, w, h);
  }

  setPaper(rgb) {
    this.uniforms.uPaper.value.set(...rgb);
  }

  // Background ink, as [pink, yellow, blue] amounts at the bottom and top of the sheet.
  setFlood(bottom, top = bottom) {
    this.uniforms.uFloodA.value.set(...bottom);
    this.uniforms.uFloodB.value.set(...top);
  }

  // x, y in fractions of the view from the top left, r in fractions of the shorter side.
  setDisc(x, y, r, ink) {
    const s = Math.min(this.cssW, this.cssH);
    this.uniforms.uDisc.value.set(x * this.cssW, (1 - y) * this.cssH, r * s);
    this.uniforms.uDiscInk.value.set(...ink);
  }

  clearDisc() {
    this.uniforms.uDisc.value.set(0, 0, 0);
  }

  render(dt) {
    const u = this.uniforms;
    this.focus.x += (this.focus.tx - this.focus.x) * Math.min(1, dt * 7);
    this.focus.y += (this.focus.ty - this.focus.y) * Math.min(1, dt * 7);
    if (Math.abs(this.focus.tx - this.focus.x) + Math.abs(this.focus.ty - this.focus.y) > 1e-4) this.applyFocus();
    this.boilClock += dt;
    if (!this.reduced && this.boilClock > 0.16) {
      this.boilClock = 0;
      u.uBoil.value = Math.random();
    }
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;

    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.printScene, this.printCamera);
    this.watchSpeed(dt);
  }

  // Phones vary a lot: lower the resolution when frames run long, raise it again when there is room.
  watchSpeed(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 50) return;
    const mid = [...this.frameTimes].sort((a, b) => a - b)[25];
    this.frameTimes.length = 0;
    if (document.hidden) return;
    if (mid > 1 / 40 && this.quality > 1) {
      this.quality = Math.max(1, this.quality - 0.25);
      this.resize();
    } else if (mid < 1 / 58 && this.quality < this.maxQuality && this.calm > 6) {
      this.quality = Math.min(this.maxQuality, this.quality + 0.25);
      this.calm = 0;
      this.resize();
    }
    this.calm = (this.calm ?? 0) + 1;
  }
}

// Orbiting camera with inertia. One finger turns the subject.
export class Rig {
  constructor(press, dom) {
    this.press = press;
    this.dom = dom;
    this.yaw = 0.4;
    this.pitch = 0.2;
    this.dist = 120;
    this.distTarget = 120;
    this.target = new THREE.Vector3();
    this.targetGoal = new THREE.Vector3();
    this.vy = 0;
    this.vp = 0;
    this.spin = 0;
    this.enabled = true;
    this.dragging = false;
    this.handlers = {
      down: (e) => {
        if (!this.enabled || e.button > 0) return;
        this.dragging = true;
        this.lx = e.clientX;
        this.ly = e.clientY;
        this.vy = this.vp = 0;
        dom.setPointerCapture?.(e.pointerId);
      },
      move: (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.lx;
        const dy = e.clientY - this.ly;
        this.lx = e.clientX;
        this.ly = e.clientY;
        this.vy = dx * 0.0075;
        this.vp = dy * 0.0075;
        this.yaw -= this.vy;
        this.pitch += this.vp;
      },
      up: () => (this.dragging = false),
    };
    dom.addEventListener('pointerdown', this.handlers.down);
    dom.addEventListener('pointermove', this.handlers.move);
    dom.addEventListener('pointerup', this.handlers.up);
    dom.addEventListener('pointercancel', this.handlers.up);
  }

  update(dt) {
    if (this.manual) return;
    if (!this.dragging) {
      this.yaw -= this.vy;
      this.pitch += this.vp;
      const damp = Math.exp(-dt * 4);
      this.vy *= damp;
      this.vp *= damp;
      if (!this.press.reduced) this.yaw += this.spin * dt;
    }
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    this.dist += (this.distTarget - this.dist) * Math.min(1, dt * 5);
    this.target.lerp(this.targetGoal, Math.min(1, dt * 5));
    const cam = this.press.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.near = Math.max(1, this.dist * 0.2);
    cam.far = this.dist * 4 + 200;
    cam.updateProjectionMatrix();
    const u = this.press.uniforms;
    u.uFogNear.value = this.dist * 0.92;
    u.uFogFar.value = this.dist * 1.35;
  }

  dispose() {
    const { dom, handlers } = this;
    dom.removeEventListener('pointerdown', handlers.down);
    dom.removeEventListener('pointermove', handlers.move);
    dom.removeEventListener('pointerup', handlers.up);
    dom.removeEventListener('pointercancel', handlers.up);
  }
}
