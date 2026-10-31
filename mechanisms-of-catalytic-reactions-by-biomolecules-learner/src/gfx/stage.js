// The renderer and its post chain: scene, bloom, tone map, grain.
import * as THREE from 'three';
import { FULL_VERT, LEAF_FRAG, BATIK_FRAG } from './shaders.js';

const quadGeo = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)); return g; };

const strip = (s) => s.replace('#version 300 es', '');
const pass = (frag, uniforms = {}) => new THREE.RawShaderMaterial({ vertexShader: strip(FULL_VERT), fragmentShader: strip(frag), uniforms, depthTest: false, depthWrite: false, glslVersion: THREE.GLSL3 });

const DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D t; uniform vec2 px; uniform float th;
void main(){ vec3 c=vec3(0.); 
 c+=texture(t,vUv+px*vec2(-1,-1)).rgb; c+=texture(t,vUv+px*vec2(1,-1)).rgb; c+=texture(t,vUv+px*vec2(-1,1)).rgb; c+=texture(t,vUv+px*vec2(1,1)).rgb; c*=.25;
 if(th>0.){ float l=max(c.r,max(c.g,c.b)); c*=smoothstep(th,th*2.2,l); c=min(c,vec3(6.)); } o=vec4(c,1.); }`;
const UP = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D t; uniform vec2 px;
void main(){ vec3 c=vec3(0.); float k=1.3;
 c+=texture(t,vUv+px*vec2(-k,0.)).rgb; c+=texture(t,vUv+px*vec2(k,0.)).rgb; c+=texture(t,vUv+px*vec2(0.,k)).rgb; c+=texture(t,vUv+px*vec2(0.,-k)).rgb;
 c+=(texture(t,vUv+px*vec2(k,k)).rgb+texture(t,vUv+px*vec2(-k,k)).rgb+texture(t,vUv+px*vec2(k,-k)).rgb+texture(t,vUv+px*vec2(-k,-k)).rgb)*.5; o=vec4(c/6.,1.); }`;
const FINAL = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D t,b; uniform float time,bloom,exposure,veil; uniform vec2 res;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
float rnd(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 c=texture(t,vUv).rgb+texture(b,vUv).rgb*bloom; 
 vec2 q=vUv-.5; float v=1.-dot(q,q)*.9; c*=v*exposure; c=aces(c); c=pow(c,vec3(1./2.2));
 float g=rnd(vUv*res+fract(time)*91.)-.5; c+=g*(1.6/255.)+g*.006*(1.-c);
 c=mix(c,vec3(.005,.004,.012),veil); o=vec4(c,1.); }`;

export class Stage {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl2');
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, context: gl });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.autoClear = false;
    this.quad = new THREE.Mesh(quadGeo()); this.quad.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(this.quad);
    this.qc = new THREE.Camera();
    this.hf = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.mDown = pass(DOWN, { t: { value: null }, px: { value: new THREE.Vector2() }, th: { value: 0 } });
    this.mUp = pass(UP, { t: { value: null }, px: { value: new THREE.Vector2() } });
    this.mUp.blending = THREE.AdditiveBlending; this.mUp.transparent = true;
    this.mFinal = pass(FINAL, { t: { value: null }, b: { value: null }, time: { value: 0 }, bloom: { value: 0.3 }, exposure: { value: 1.0 }, veil: { value: 0 }, res: { value: new THREE.Vector2() } });
    this.scale = 1;
    this.resize();
    this.bake();
  }

  target(w, h, opts = {}) {
    return new THREE.WebGLRenderTarget(w, h, { type: this.hf ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...opts });
  }

  // Gold leaf and batik are drawn once, on the GPU, then only looked up.
  bake() {
    const { renderer: r } = this;
    const draw = (frag, w, h, mip) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: mip, minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
      this.quad.material = pass(frag);
      r.setRenderTarget(rt); r.render(this.qs, this.qc); r.setRenderTarget(null);
      if (mip) rt.texture.anisotropy = Math.min(4, r.capabilities.getMaxAnisotropy());
      return rt.texture;
    };
    this.leaf = draw(LEAF_FRAG, 1024, 1024, true);
    const big = Math.min(r.capabilities.maxTextureSize, 3000);
    this.pattern = draw(BATIK_FRAG, Math.floor(big / 2), big, true);
    this.pattern.wrapS = this.pattern.wrapT = THREE.ClampToEdgeWrapping;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.scale;
    this.w = w; this.h = h; this.dpr = dpr;
    const { renderer: r } = this;
    r.setPixelRatio(dpr); r.setSize(w, h, false);
    const W = Math.max(2, Math.floor(w * dpr)), H = Math.max(2, Math.floor(h * dpr));
    this.main?.dispose(); this.chain?.forEach((t) => t.dispose());
    this.main = this.target(W, H, { depthBuffer: true, samples: 4 });
    this.chain = [];
    for (let i = 1; i <= 5; i++) this.chain.push(this.target(Math.max(2, W >> i), Math.max(2, H >> i)));
    this.mFinal.uniforms.res.value.set(W, H);
  }

  render(scene, camera, time) {
    const { renderer: r, qs, qc, quad, chain } = this;
    r.setRenderTarget(this.main); r.clear(); r.render(scene, camera);
    let src = this.main.texture;
    this.mDown.uniforms.th.value = 1.05;
    chain.forEach((t, i) => {
      this.mDown.uniforms.t.value = src; this.mDown.uniforms.px.value.set(0.5 / t.width, 0.5 / t.height);
      if (i === 1) this.mDown.uniforms.th.value = 0;
      quad.material = this.mDown; r.setRenderTarget(t); r.render(qs, qc); src = t.texture;
    });
    for (let i = chain.length - 1; i > 0; i--) {
      this.mUp.uniforms.t.value = chain[i].texture; this.mUp.uniforms.px.value.set(1 / chain[i].width, 1 / chain[i].height);
      quad.material = this.mUp; r.setRenderTarget(chain[i - 1]); r.render(qs, qc);
    }
    const u = this.mFinal.uniforms;
    u.t.value = this.main.texture; u.b.value = chain[0].texture; u.time.value = time;
    quad.material = this.mFinal; r.setRenderTarget(null); r.render(qs, qc);
  }
}
