// The print. Washi and seigaiha behind, sumi-ink molecules in one instanced draw, brush strokes in another.
// Every frame is drawn in immediate mode: begin(), then water() / disk() / line() ..., then end().
import * as THREE from 'three';

const CAP = 1400;
const LINES = 1600;
export const KIND = { WATER: 0, DISK: 1, ION: 2, DIPOLE: 3, HALO: 4, RING: 5, BEAD: 6 };

// Fibres and baren marks, tiled in screen space so the grain never swims.
function paperTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const layer = (x, y, f) => Math.sin(x * f * 0.0245 + Math.sin(y * 0.05 * f) * 1.5) * Math.cos(y * f * 0.0245);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.random() * 0.5 + layer(x, y, 1) * 0.12 + layer(y, x, 2) * 0.1 + 0.5;
      const v = Math.max(0, Math.min(255, n * 255));
      const i = (x + y * size) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const BACK_FS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uRes;
  uniform vec4 uTank;
  uniform float uHeat, uTime, uFull, uSunX, uSunOn, uDpr, uPat;
  uniform sampler2D uPaper;
  // Seigaiha: overlapping fans of concentric arcs, the classic wave block.
  float seigaiha(vec2 p) {
    float line = 0.0;
    float cover = -1.0;
    for (int row = 3; row >= -1; row--) {
      float y = floor(p.y) + float(row) * 0.5;
      float off = mod(float(row), 2.0) * 0.5;
      float x = floor(p.x + off) - off;
      for (int k = 0; k <= 1; k++) {
        vec2 c = vec2(x + float(k) + 0.0, y);
        vec2 d = p - c;
        float r = length(d);
        if (r < 0.70 && d.y > -0.72) {
          float rings = abs(fract(r * 5.6) - 0.5);
          line = 1.0 - smoothstep(0.08, 0.17, rings);
          if (r > 0.655) line = 1.0;
          cover = 1.0;
        }
      }
    }
    return cover > 0.0 ? line : 0.0;
  }
  vec3 ramp(vec3 a, vec3 b, vec3 c, float t) { return t < .5 ? mix(a, b, t * 2.) : mix(b, c, t * 2. - 1.); }
  void main() {
    vec2 px = vec2(vUv.x * uRes.x, (1. - vUv.y) * uRes.y);
    float grain = texture2D(uPaper, gl_FragCoord.xy / 256.0).r;
    float fine = texture2D(uPaper, gl_FragCoord.xy / 97.0 + .3).g;
    vec3 washi = vec3(.925, .885, .800);
    vec3 col = washi;
    // A dark band wiped along the top of the block: the ichimonji bokashi.
    float top = smoothstep(uFull > .5 ? uRes.y * .52 : 120., 0., px.y + 18. * sin(vUv.x * 7.));
    vec3 ink = ramp(vec3(.07,.16,.32), vec3(.09,.19,.36), vec3(.43,.09,.06), uHeat);
    col = mix(col, ink, top * top * .98);
    vec4 t = uTank;
    vec2 q = (px - t.xy) / t.zw;
    float inside = step(0., q.x) * step(q.x, 1.) * step(0., q.y) * step(q.y, 1.);
    float aa = 1.0;
    if (inside > .5) {
      vec3 cold = vec3(.80,.87,.90), warm = vec3(.93,.86,.74), hot = vec3(.97,.78,.60);
      vec3 ground = ramp(cold, warm, hot, uHeat);
      ground = mix(ground, ramp(vec3(.43,.60,.74), vec3(.58,.70,.74), vec3(.86,.48,.33), uHeat), smoothstep(.45, 1.05, q.y) * .75);
      ground = mix(ground, ramp(vec3(.20,.34,.54), vec3(.30,.44,.56), vec3(.72,.22,.13), uHeat), smoothstep(.13, 0., q.y) * .85);
      if (uPat > .5) {
        float s = min(t.z, t.w) / 11.;
        float w = seigaiha((px - t.xy) / s);
        ground = mix(ground, ground * vec3(.88,.91,.95), w * .4);
      }
      col = ground;
      float dx = min(px.x - t.x, t.x + t.z - px.x);
      float dy = min(px.y - t.y, t.y + t.w - px.y);
      float e = min(dx, dy);
      col = mix(col, col * .86, 1. - smoothstep(0., 16., e));
    }
    // Key block: a double frame round the print.
    vec2 c = t.xy + t.zw * .5;
    vec2 h = t.zw * .5;
    vec2 d = abs(px - c) - h;
    float box = length(max(d, 0.)) + min(max(d.x, d.y), 0.);
    float frame = (1. - smoothstep(.0, 1.3, abs(box - 1.5))) + .6 * (1. - smoothstep(.0, .9, abs(box - 6.)));
    col = mix(col, vec3(.07,.11,.21), clamp(frame, 0., 1.) * (1. - uFull));
    if (uSunOn > .5) {
      vec2 s = vec2(t.x + uSunX * t.z, t.y + 26.);
      float r = length(px - s);
      vec3 disc = ramp(vec3(.96,.97,.92), vec3(.99,.84,.55), vec3(.93,.17,.08), uHeat);
      col = mix(col, disc, .32 * (1. - smoothstep(19., 52., r)));
      col = mix(col, disc, 1. - smoothstep(17., 18.4, r));
    }
    col *= .90 + .17 * grain;
    col *= .985 + .03 * fine;
    gl_FragColor = vec4(col, 1.);
  }`;

const PART_VS = /* glsl */`
  attribute vec4 aP;
  attribute vec4 aC;
  attribute vec3 aL;
  attribute float aK;
  uniform vec2 uRes;
  varying vec2 vQ;
  varying vec4 vC;
  varying vec3 vL;
  varying float vK, vA, vR;
  void main() {
    vQ = position.xy * 1.08;
    vC = aC; vL = aL; vK = aK; vA = aP.z; vR = aP.w;
    vec2 p = aP.xy + position.xy * 1.08 * aP.w;
    gl_Position = vec4(p.x / uRes.x * 2. - 1., 1. - p.y / uRes.y * 2., 0., 1.);
  }`;

const PART_FS = /* glsl */`
  precision highp float;
  varying vec2 vQ;
  varying vec4 vC;
  varying vec3 vL;
  varying float vK, vA, vR;
  uniform sampler2D uPaper;
  uniform float uDpr;
  float seg(vec2 p, float len, float w0, float w1) {
    float t = clamp(p.x / len, 0., 1.);
    return length(p - vec2(t * len, 0.)) - mix(w0, w1, t);
  }
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  void main() {
    float aa = 1.6 / max(vR * uDpr, 2.);
    float n = texture2D(uPaper, gl_FragCoord.xy / 128.).r - .5;
    vec3 col = vC.rgb;
    float a = 0.;
    float k = vK;
    vec2 q = vQ;
    if (k < .5) {
      // Water: a sumi body and three brushed arms. A bonded arm carries vermilion to its tip.
      float best = length(q) - .34;
      vec3 c = col;
      float arm = 0.;
      float glow = 0.;
      for (int i = 0; i < 3; i++) {
        vec2 r = rot(vA + float(i) * 2.0943951) * q;
        float d = seg(r, .90, .17, .045) + n * .025;
        float lit = i == 0 ? vL.x : i == 1 ? vL.y : vL.z;
        if (d < best + .02 && r.x > .1) { arm = max(arm, lit * smoothstep(.12, .62, r.x)); }
        best = min(best, d);
        glow = max(glow, lit * (1. - smoothstep(.0, .17, length(r - vec2(.86, 0.)))));
      }
      c = mix(c, vec3(.82,.20,.10), arm);
      c = mix(c, vec3(.98,.55,.16), glow * .85);
      a = 1. - smoothstep(-aa, aa, best);
      // Faint light in the belly, the way a loaded brush leaves it.
      c = mix(c, c * 1.0 + .17, (1. - smoothstep(.0, .25, length(q - vec2(-.07, .08)))) * .34);
      col = c;
    } else if (k < 1.5) {
      // Solute: an oil drop in ochre with a dark brushed rim.
      float r = length(q);
      float ang = atan(q.y, q.x);
      float w = .03 + .02 * sin(ang * 3. + vA) + n * .02;
      float rim = 1. - smoothstep(.0, aa + .02, abs(r - .90) - w - .02);
      a = 1. - smoothstep(.94 - aa, .94 + aa, r + n * .012);
      vec3 inner = mix(col * 1.22, col * .80, smoothstep(.0, .9, length(q - vec2(-.25, .3))));
      col = mix(inner, vec3(.07,.09,.17), rim * .95);
    } else if (k < 2.5) {
      // Ion: a seal. The sign is cut out of the block.
      vec2 p = abs(q);
      float box = max(p.x, p.y) - .78;
      a = 1. - smoothstep(-aa, aa, box + n * .02);
      float h = max(abs(q.y) - .11, abs(q.x) - .5);
      float v = max(abs(q.x) - .11, abs(q.y) - .5);
      float sign_ = vL.x > .5 ? min(h, v) : h;
      col = mix(col, vec3(.98,.94,.86), 1. - smoothstep(-aa, aa, sign_));
      col *= .92 + .22 * (n + .5);
    } else if (k < 3.5) {
      // Dipole: a two-lobed drop, indigo at the minus end and vermilion at the plus end.
      vec2 r = rot(vA) * q;
      r.y *= 1. + vL.y * 1.2;
      float d = seg(r + vec2(.62, 0.), 1.24, .27, .27) + n * .02;
      a = 1. - smoothstep(-aa, aa, d);
      col = mix(vec3(.11,.22,.42), vec3(.79,.22,.13), smoothstep(-.14, .14, r.x));
      col = mix(col, col + .22, (1. - smoothstep(.0, .22, length(r - vec2(.34, .08)))) * .5);
    } else if (k < 4.5) {
      // Soft halo for shells and depletion zones.
      float r = length(q);
      a = (1. - smoothstep(.72, 1., r)) * (.65 + n * .25);
    } else if (k < 5.5) {
      // Open ring.
      float r = length(q);
      a = 1. - smoothstep(0., aa * 1.2, abs(r - .95) - vL.x);
    } else {
      // Plain bead with a rim.
      float r = length(q);
      a = 1. - smoothstep(.92 - aa, .92 + aa, r);
      col = mix(col * 1.2, col * .7, smoothstep(.0, .95, length(q - vec2(-.3, .32))));
      col = mix(col, vec3(.07,.09,.17), smoothstep(.74, .80, r));
    }
    if (a <= .003) discard;
    gl_FragColor = vec4(col, a * vC.a);
  }`;

const LINE_VS = /* glsl */`
  attribute vec4 aAB;
  attribute vec4 aC;
  attribute float aW;
  uniform vec2 uRes;
  varying vec2 vUv;
  varying vec4 vC;
  void main() {
    vec2 a = aAB.xy, b = aAB.zw;
    vec2 d = b - a;
    float len = length(d) + 1e-3;
    vec2 u = d / len, n = vec2(-u.y, u.x);
    vec2 p = a + u * (position.x * .5 + .5) * len + n * position.y * aW;
    vUv = vec2(position.x * .5 + .5, position.y);
    vC = aC;
    gl_Position = vec4(p.x / uRes.x * 2. - 1., 1. - p.y / uRes.y * 2., 0., 1.);
  }`;

const LINE_FS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec4 vC;
  uniform sampler2D uPaper;
  void main() {
    float n = texture2D(uPaper, gl_FragCoord.xy / 90.).r;
    // A stroke that swells in the middle and thins at both ends.
    float w = .35 + .65 * sin(vUv.x * 3.14159);
    float a = 1. - smoothstep(w - .3, w, abs(vUv.y));
    gl_FragColor = vec4(vC.rgb, vC.a * a * (.7 + .4 * n));
  }`;

export class Printer {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: false, alpha: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.autoClear = false;
    this.renderer = r;
    this.canvas = canvas;
    this.paper = paperTexture();
    this.cam = new THREE.Camera();
    this.heat = { value: 0.35, target: 0.35 };
    const shared = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTank: { value: new THREE.Vector4(0, 0, 100, 100) },
      uHeat: { value: 0.35 },
      uTime: { value: 0 },
      uFull: { value: 0 },
      uSunX: { value: 0.5 },
      uSunOn: { value: 0 },
      uDpr: { value: 1 },
      uPat: { value: 1 },
      uPaper: { value: this.paper },
    };
    this.u = shared;
    this.backScene = new THREE.Scene();
    const backMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, uniforms: shared,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BACK_FS,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backMat);
    quad.frustumCulled = false;
    this.backScene.add(quad);
    // The paper is costly per pixel and rarely changes, so it is printed once into a texture and blitted.
    this.blitScene = new THREE.Scene();
    this.blitMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, uniforms: { uMap: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform sampler2D uMap; void main(){ gl_FragColor = texture2D(uMap, vUv); }',
    });
    const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat);
    blit.frustumCulled = false;
    this.blitScene.add(blit);

    // After a lost context the cached paper is gone, so print it again.
    canvas.addEventListener('webglcontextrestored', () => { this.backKey = ''; });

    this.scene = new THREE.Scene();
    // Lines first, so ink strokes sit under the molecules.
    this.buildLines();
    this.buildParts();
    this.resize();
  }

  buildParts() {
    const g = new THREE.PlaneGeometry(2, 2);
    const attr = (name, n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.aP = attr('aP', 4);
    this.aC = attr('aC', 4);
    this.aL = attr('aL', 3);
    this.aK = attr('aK', 1);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, uniforms: this.u,
      vertexShader: PART_VS, fragmentShader: PART_FS,
    });
    this.parts = new THREE.InstancedMesh(g, m, CAP);
    this.parts.frustumCulled = false;
    this.parts.renderOrder = 2;
    this.scene.add(this.parts);
    this.nP = 0;
  }

  buildLines() {
    const g = new THREE.PlaneGeometry(2, 2);
    const attr = (name, n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(LINES * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.lAB = attr('aAB', 4);
    this.lC = attr('aC', 4);
    this.lW = attr('aW', 1);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, uniforms: this.u,
      vertexShader: LINE_VS, fragmentShader: LINE_FS,
    });
    this.lines = new THREE.InstancedMesh(g, m, LINES);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;
    this.scene.add(this.lines);
    this.nL = 0;
  }

  begin() { this.nP = 0; this.nL = 0; }

  put(kind, x, y, angle, radius, r, g, b, a, l0 = 0, l1 = 0, l2 = 0) {
    const i = this.nP;
    if (i >= CAP) return;
    this.nP++;
    const P = this.aP.array, C = this.aC.array, L = this.aL.array;
    P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = angle; P[i * 4 + 3] = radius;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
    L[i * 3] = l0; L[i * 3 + 1] = l1; L[i * 3 + 2] = l2;
    this.aK.array[i] = kind;
  }

  water(x, y, angle, radius, r, g, b, a, l0, l1, l2) { this.put(KIND.WATER, x, y, angle, radius, r, g, b, a, l0, l1, l2); }

  disk(x, y, radius, col = [0.85, 0.66, 0.3], a = 1) { this.put(KIND.DISK, x, y, radius * 0.02, radius, col[0], col[1], col[2], a); }

  ion(x, y, radius, positive, a = 1, col = null) {
    const c = col ?? (positive ? [0.78, 0.22, 0.13] : [0.11, 0.24, 0.45]);
    this.put(KIND.ION, x, y, 0, radius, c[0], c[1], c[2], a, positive ? 1 : 0);
  }

  dipole(x, y, angle, radius, a = 1, squash = 0) { this.put(KIND.DIPOLE, x, y, angle, radius, 0, 0, 0, a, 0, squash); }

  halo(x, y, radius, col, a) { this.put(KIND.HALO, x, y, 0, radius, col[0], col[1], col[2], a); }

  ring(x, y, radius, col, a, thick = 0.03) { this.put(KIND.RING, x, y, 0, radius, col[0], col[1], col[2], a, thick); }

  bead(x, y, radius, col, a = 1) { this.put(KIND.BEAD, x, y, 0, radius, col[0], col[1], col[2], a); }

  line(ax, ay, bx, by, width, col, a = 1) {
    const i = this.nL;
    if (i >= LINES) return;
    this.nL++;
    const A = this.lAB.array, C = this.lC.array;
    A[i * 4] = ax; A[i * 4 + 1] = ay; A[i * 4 + 2] = bx; A[i * 4 + 3] = by;
    C[i * 4] = col[0]; C[i * 4 + 1] = col[1]; C[i * 4 + 2] = col[2]; C[i * 4 + 3] = a;
    this.lW.array[i] = width;
  }

  end() {
    this.parts.count = this.nP;
    this.lines.count = this.nL;
    for (const a of [this.aP, this.aC, this.aL, this.aK, this.lAB, this.lC, this.lW]) a.needsUpdate = true;
  }

  setTank(x, y, w, h, full = false) {
    this.u.uTank.value.set(x, y, w, h);
    this.u.uFull.value = full ? 1 : 0;
  }

  setSun(on, x = 0.5) { this.u.uSunOn.value = on ? 1 : 0; this.u.uSunX.value = x; }

  setPattern(on) { this.u.uPat.value = on ? 1 : 0; }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.u.uRes.value.set(w, h);
    this.u.uDpr.value = dpr;
    this.backRT?.dispose();
    this.backRT = new THREE.WebGLRenderTarget(Math.round(w * dpr), Math.round(h * dpr), { depthBuffer: false });
    this.blitMat.uniforms.uMap.value = this.backRT.texture;
    this.backKey = '';
  }

  frame(t) {
    this.heat.value += (this.heat.target - this.heat.value) * 0.08;
    this.u.uHeat.value = this.heat.value;
    this.u.uTime.value = t;
    const r = this.renderer;
    const u0 = this.u;
    const key = `${this.heat.value.toFixed(3)} ${u0.uTank.value.toArray()} ${u0.uFull.value} ${u0.uSunOn.value} ${u0.uSunX.value.toFixed(3)} ${u0.uPat.value}`;
    if (key !== this.backKey) {
      this.backKey = key;
      r.setRenderTarget(this.backRT);
      r.render(this.backScene, this.cam);
      r.setRenderTarget(null);
    }
    r.clear();
    r.render(this.blitScene, this.cam);
    // Molecules stay inside the frame of the print, except on the full-bleed title.
    const u = this.u.uTank.value;
    const clip = this.u.uFull.value < 0.5;
    r.setScissorTest(clip);
    if (clip) r.setScissor(u.x, innerHeight - u.y - u.w, u.z, u.w);
    r.render(this.scene, this.cam);
    r.setScissorTest(false);
  }

  // A small JPEG of the print as it stands now, for the album.
  snapshot(w = 220, rect = null) {
    const c = document.createElement('canvas');
    const h = Math.round(w * 1.3);
    c.width = w;
    c.height = h;
    const src = this.canvas;
    const dpr = src.width / innerWidth;
    const R = rect ?? { x: 0, y: 0, w: innerWidth, h: innerHeight };
    const sh = Math.min(R.h, R.w * 1.3) * dpr;
    const sw = sh / 1.3;
    const ox = (R.x + R.w / 2) * dpr - sw / 2;
    const oy = (R.y + R.h / 2) * dpr - sh / 2;
    c.getContext('2d').drawImage(src, ox, oy, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  }
}
