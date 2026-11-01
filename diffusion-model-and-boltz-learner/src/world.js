// The world: coloured ink in clear water, photographed close up.
// Droplets are drawn as optical density into a floating-point buffer, so that overlapping pigments absorb light as real ink does
// (Beer-Lambert). A slow divergence-free flow curls their trails. Trails are for looks only. Droplet positions come from the chapters,
// from real data and the real field.
import * as THREE from 'three';

const QUAD = new THREE.BufferGeometry();
QUAD.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const quadVS = 'varying vec2 vUv; void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy,0.,1.); }';

const FLOW = /* glsl */`
  // A stream function: a sum of A sin(a.p + w t) cos(b.p - w t). Velocity is its curl, so the flow is divergence-free.
  vec2 wave(vec2 p, float t, vec2 a, vec2 b, float w, float A){
    float s = dot(a,p)+w*t, c = dot(b,p)-w*.8*t;
    vec2 g = a*cos(s)*cos(c) - b*sin(s)*sin(c);
    return A*vec2(g.y, -g.x);
  }
  vec2 flow(vec2 p, float t){
    return wave(p,t,vec2(2.1,1.3),vec2(-1.9,1.7),.2,.5) + wave(p,t,vec2(5.3,-3.1),vec2(3.7,4.3),-.31,.16) + wave(p,t,vec2(11.,7.),vec2(-8.,9.),.47,.035);
  }`;

const trailFS = /* glsl */`
  precision highp float; varying vec2 vUv;
  uniform sampler2D tPrev, tInk; uniform float uDecay, uFlow, uTime, uInject, uAspect, uScale;
  ${FLOW}
  void main(){
    vec2 p = (vUv-.5)*vec2(uAspect,1.);
    vec2 v = flow(p*1.15, uTime)*uFlow;
    vec2 q = vUv - v*vec2(1./uAspect,1.);
    vec3 prev = texture2D(tPrev, q).rgb;
    vec3 ink = texture2D(tInk, vUv).rgb;
    gl_FragColor = vec4(prev*uDecay + ink*uInject, 1.);
  }`;

const blurFS = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uStep;
  void main(){
    vec3 c = texture2D(tMap, vUv).rgb*.2941;
    c += (texture2D(tMap, vUv+uStep*1.3333).rgb + texture2D(tMap, vUv-uStep*1.3333).rgb)*.3529;
    gl_FragColor = vec4(c,1.);
  }`;

const finalFS = /* glsl */`
  precision highp float; varying vec2 vUv;
  uniform sampler2D tInk, tTrail, tGlow; uniform float uTime, uAspect, uTrail, uScale, uDepth; uniform vec2 uRes;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  vec3 water(vec2 uv, float t){
    vec2 p = (uv-.5)*vec2(uAspect,1.);
    // Pale pearl water, lit from above: warm at the surface, cool in the depth, with a faint iridescence.
    float l = smoothstep(-.05, 1.05, uv.y + .05*sin(p.x*2.1 + .04*t));
    vec3 c = mix(vec3(.84,.895,.915), vec3(.985,.975,.945), l*l*(3.-2.*l));
    c += vec3(.012,-.004,.016)*sin(p.x*3.1 - p.y*2.3 + .03*t);
    // Shafts of light, slanting down through the water.
    float s1 = sin(p.x*6.2 + p.y*2.2 + .07*t + 1.5*sin(.05*t)), s2 = sin(p.x*11. + p.y*3.6 - .05*t);
    float shaft = smoothstep(.15,1.,.5+.5*s1)*(.65+.35*s2);
    c += vec3(.03,.032,.028)*shaft*smoothstep(.05,1.,uv.y);
    // Slow soft caustics.
    vec2 a = p*5.5 + vec2(.13*t,-.09*t), b = p*7.3 + vec2(-.11*t,.14*t);
    float k = sin(a.x+sin(a.y*1.3))*sin(a.y+sin(a.x*1.1)) + sin(b.x-sin(b.y))*sin(b.y+sin(b.x*.9));
    c += vec3(.03,.036,.034)*smoothstep(.5,1.7,k);
    c *= 1. - .1*dot(p,p)*.6;
    return c;
  }
  void main(){
    vec3 glow = texture2D(tGlow, vUv).rgb;
    vec2 e = 1.5/uRes;
    float gx = dot(texture2D(tGlow, vUv+vec2(e.x*2.,0.)).rgb - texture2D(tGlow, vUv-vec2(e.x*2.,0.)).rgb, vec3(.33));
    float gy = dot(texture2D(tGlow, vUv+vec2(0.,e.y*2.)).rgb - texture2D(tGlow, vUv-vec2(0.,e.y*2.)).rgb, vec3(.33));
    vec2 uv = vUv + vec2(gx,gy)*.012;
    vec3 od = (texture2D(tInk, vUv).rgb + texture2D(tTrail, vUv).rgb*uTrail)*uScale;
    od = od/(1.+.2*dot(od,vec3(.33)));
    vec3 bg = water(uv, uTime);
    vec3 c = bg*exp(-od);
    // Light that has passed through thick ink glows in the ink's own colour around it.
    vec3 halo = exp(-glow*uScale*.55);
    c *= mix(vec3(1.), halo, .6);
    float sat = dot(glow, vec3(.33))*uScale;
    c += (exp(-glow*uScale*1.3)-exp(-glow*uScale*2.8))*.05*smoothstep(.0,.6,sat);
    c += (hash(vUv*uRes + fract(uTime))-.5)/255.;
    gl_FragColor = vec4(c,1.);
  }`;

const dropVS = /* glsl */`
  attribute vec3 aPos; attribute vec4 aInk; attribute float aSize;
  uniform float uPx, uMinPx; varying vec2 vC; varying vec4 vI;
  void main(){
    vec4 mv = modelViewMatrix * vec4(aPos, 1.);
    float s = aSize, m = aInk.a;
    float px = s*uPx/(-mv.z);
    if (px < uMinPx) { m *= (px*px)/(uMinPx*uMinPx); s *= uMinPx/px; }
    vC = position.xy; vI = vec4(aInk.rgb, m);
    mv.xy += position.xy*s;
    gl_Position = projectionMatrix*mv;
  }`;
const dropFS = /* glsl */`
  precision highp float; varying vec2 vC; varying vec4 vI;
  void main(){
    float r = dot(vC,vC);
    if (r > 1.) discard;
    float a = exp(-r*3.2) - .0407;
    gl_FragColor = vec4(vI.rgb*a*vI.a, a*vI.a);
  }`;

// Pigments, as absorbance in red, green and blue.
export const PIGMENT = {
  magenta: [0.16, 1.2, 0.5], ultra: [1.15, 0.86, 0.16], teal: [1.15, 0.26, 0.42], plum: [0.72, 1.05, 0.28], ink: [0.95, 0.9, 0.62], rose: [0.05, 0.62, 0.32],
};
export const mixPigment = (w, keys = ['magenta', 'ultra', 'teal']) => {
  const o = [0, 0, 0];
  w.forEach((v, i) => { const p = PIGMENT[keys[i]]; o[0] += v * p[0]; o[1] += v * p[1]; o[2] += v * p[2]; });
  return o;
};

export class Cloud {
  constructor(world, capacity, { parent = null } = {}) {
    this.world = world; this.capacity = capacity; this.count = 0;
    this.pos = new Float32Array(capacity * 3); this.ink = new Float32Array(capacity * 4); this.size = new Float32Array(capacity);
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aInk = new THREE.InstancedBufferAttribute(this.ink, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aInk', this.aInk); g.setAttribute('aSize', this.aSize);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, world.dropMaterial);
    this.mesh.frustumCulled = false;
    (parent ?? world.inkScene).add(this.mesh);
  }

  set(i, x, y, z, ink, mass, size) {
    const { pos, size: sz } = this, c = this.ink;
    pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z;
    c[4 * i] = ink[0]; c[4 * i + 1] = ink[1]; c[4 * i + 2] = ink[2]; c[4 * i + 3] = mass;
    sz[i] = size;
  }

  commit(n = this.count, all = true) {
    this.count = n; this.geo.instanceCount = n;
    this.aPos.needsUpdate = true;
    if (all) { this.aInk.needsUpdate = true; this.aSize.needsUpdate = true; }
  }

  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); }
}

export class World {
  constructor(canvas) {
    this.canvas = canvas; this.ticks = new Set(); this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
    r.autoClear = false; r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.LinearSRGBColorSpace;
    const gl = r.getContext();
    this.float = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this.phone = /iPhone|iPad|Android/.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 500;
    this.quality = this.phone ? 0.62 : 0.75;
    this.dropCount = this.phone ? 26000 : 60000;
    this.camera = new THREE.PerspectiveCamera(20, 1, 1, 80000);
    this.stage = { x: 0, y: 0, w: innerWidth, h: innerHeight };
    this.view = { cx: 0, cy: 0, scale: 1, tcx: 0, tcy: 0, tscale: 1 };
    this.inkScene = new THREE.Scene();
    this.dropMaterial = new THREE.ShaderMaterial({
      vertexShader: dropVS, fragmentShader: dropFS, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      uniforms: { uPx: { value: 1 }, uMinPx: { value: 1.3 } },
    });
    const pass = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: quadVS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.trailMat = pass(trailFS, { tPrev: { value: null }, tInk: { value: null }, uDecay: { value: 0.93 }, uFlow: { value: 0.0015 }, uTime: { value: 0 }, uInject: { value: 0.16 }, uAspect: { value: 1 }, uScale: { value: 1 } });
    this.blurMat = pass(blurFS, { tMap: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.finalMat = pass(finalFS, { tInk: { value: null }, tTrail: { value: null }, tGlow: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uTrail: { value: 1 }, uScale: { value: this.float ? 1 : 4 }, uDepth: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } });
    this.quad = new THREE.Mesh(QUAD, this.trailMat); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.Camera();
    this.mood = { flow: 0.0013, decay: 0.92, trail: 1 };
    this.over = document.getElementById('over');
    this.octx = this.over.getContext('2d');
    this.overlays = new Set();
    this.resize();
    this.last = 0; this.time = 0;
  }

  target(w, h, f = THREE.LinearFilter) {
    return new THREE.WebGLRenderTarget(w, h, { type: this.float ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: f, magFilter: f, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
  }

  resize() {
    const W = this.W = innerWidth, H = this.H = innerHeight, dpr = this.dpr = Math.min(devicePixelRatio || 1, this.phone ? 2 : 1.75);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(W, H, false);
    const iw = Math.max(2, Math.floor(W * dpr * this.quality)), ih = Math.max(2, Math.floor(H * dpr * this.quality));
    for (const k of ['rtInk', 'rtA', 'rtB', 'rtG1', 'rtG2']) this[k]?.dispose();
    this.rtInk = this.target(iw, ih); this.rtA = this.target(iw >> 1, ih >> 1); this.rtB = this.target(iw >> 1, ih >> 1);
    this.rtG1 = this.target(iw >> 2, ih >> 2); this.rtG2 = this.target(iw >> 2, ih >> 2);
    this.camera.aspect = W / H;
    this.over.width = W * Math.min(dpr, 2); this.over.height = H * Math.min(dpr, 2);
    this.finalMat.uniforms.uRes.value.set(iw, ih); this.finalMat.uniforms.uAspect.value = W / H; this.trailMat.uniforms.uAspect.value = W / H;
    this.dropMaterial.uniforms.uPx.value = (iw * 0.5) / (Math.tan(THREE.MathUtils.degToRad(10)) * (W / H));
    this.place();
  }

  setStage(x, y, w, h) { this.stage = { x, y, w, h }; this.place(); }

  // The view: a world point at the middle of the stage, and pixels per world unit there.
  look(cx, cy, scale, seconds = 0.6) {
    const v = this.view;
    v.tcx = cx; v.tcy = cy; v.tscale = scale;
    if (seconds <= 0 || this.reduce) { v.cx = cx; v.cy = cy; v.scale = scale; this.place(); }
    v.rate = 1 / Math.max(seconds, 0.05);
  }

  // Fit a world rectangle into the stage, with a margin in pixels.
  fit(x0, y0, x1, y1, margin = 14, seconds = 0.6) {
    const s = this.stage, k = Math.min((s.w - 2 * margin) / (x1 - x0), (s.h - 2 * margin) / (y1 - y0));
    this.look((x0 + x1) / 2, (y0 + y1) / 2, Math.max(k, 1e-3), seconds);
  }

  place() {
    const c = this.camera, { view: v, stage: s, W, H } = this;
    const dist = H / (2 * v.scale * Math.tan(THREE.MathUtils.degToRad(10)));
    c.position.set(v.cx, v.cy, dist); c.near = dist * 0.05; c.far = dist * 6;
    c.lookAt(v.cx, v.cy, 0);
    c.setViewOffset(W, H, -(s.x + s.w / 2 - W / 2), -(s.y + s.h / 2 - H / 2), W, H);
    c.updateMatrixWorld();
    this.dist = dist;
  }

  project(x, y, z = 0) {
    const p = World.v.set(x, y, z).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.W, y: (0.5 - p.y * 0.5) * this.H };
  }

  // Finger position to a point on the plane z = 0.
  unproject(px, py) {
    const v = this.view, s = this.stage;
    return { x: v.cx + (px - (s.x + s.w / 2)) / v.scale, y: v.cy - (py - (s.y + s.h / 2)) / v.scale };
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now; this.time += dt;
    const v = this.view;
    if (Math.abs(v.tscale - v.scale) > 1e-5 * v.scale || Math.abs(v.tcx - v.cx) > 1e-4 || Math.abs(v.tcy - v.cy) > 1e-4) {
      const k = 1 - Math.exp(-dt * (v.rate ?? 2) * 3);
      v.cx += (v.tcx - v.cx) * k; v.cy += (v.tcy - v.cy) * k;
      v.scale = Math.exp(Math.log(v.scale) + (Math.log(v.tscale) - Math.log(v.scale)) * k);
      this.place();
    }
    for (const f of this.ticks) f(dt, this.time);
    this.render();
    this.drawOver();
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render() {
    const r = this.renderer, t = this.reduce ? 0 : this.time, m = this.mood;
    r.setRenderTarget(this.rtInk); r.setClearColor(0x000000, 0); r.clear(true, false, false);
    r.render(this.inkScene, this.camera);
    const u = this.trailMat.uniforms;
    u.tPrev.value = this.rtA.texture; u.tInk.value = this.rtInk.texture; u.uTime.value = t; u.uFlow.value = this.reduce ? 0 : m.flow; u.uDecay.value = m.decay;
    u.uInject.value = (1 - m.decay) * 1.0;
    this.pass(this.trailMat, this.rtB);
    [this.rtA, this.rtB] = [this.rtB, this.rtA];
    const b = this.blurMat.uniforms;
    b.tMap.value = this.rtA.texture; b.uStep.value.set(1 / this.rtG1.width, 0); this.pass(this.blurMat, this.rtG1);
    b.tMap.value = this.rtG1.texture; b.uStep.value.set(0, 1 / this.rtG1.height); this.pass(this.blurMat, this.rtG2);
    const f = this.finalMat.uniforms;
    f.tInk.value = this.rtInk.texture; f.tTrail.value = this.rtA.texture; f.tGlow.value = this.rtG2.texture; f.uTime.value = t; f.uTrail.value = m.trail;
    this.quad.material = this.finalMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  // Hairlines, arrows and numbers are drawn on a 2-D canvas above the water.
  drawOver() {
    const g = this.octx, k = this.over.width / this.W;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    for (const f of this.overlays) f(g);
  }
}
World.v = new THREE.Vector3();
