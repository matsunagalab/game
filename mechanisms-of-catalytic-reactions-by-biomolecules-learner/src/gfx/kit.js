// Shared pieces of the gold world.
import * as THREE from 'three';
import { CLOTH_VERT, CLOTH_FRAG, BODY_VERT, BODY_FRAG, GOLD_LIB } from './shaders.js';

export const INDIGO = new THREE.Color(0.0125, 0.012, 0.038);

export function clothMaterial(stage, opts = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: CLOTH_VERT, fragmentShader: CLOTH_FRAG, side: THREE.DoubleSide,
    uniforms: {
      tPat: { value: stage.pattern }, tLeaf: { value: stage.leaf }, uRect: { value: new THREE.Vector4(...(opts.rect || [0, 0, 1, 1])) },
      uGild: { value: new THREE.Vector3(...(opts.gild || [0, 0, 0])) }, uLight: { value: new THREE.Vector3(0.3, 0.5, 1) }, uWax: { value: opts.wax ?? 1 },
      uTime: { value: 0 }, uBase: { value: (opts.base || INDIGO).clone() }, uFlowT: { value: 0 }, uDim: { value: opts.dim ?? 1 }, uMirror: { value: opts.mirror ? 1 : 0 },
    },
  });
}

function bytes(b64) { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

export function bodyGeometry(pack) {
  const buf = bytes(pack.b64).buffer, { n, tn, lo, s } = pack;
  const p16 = new Uint16Array(buf, 0, n * 3), pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = p16[i] * s + lo[i % 3];
  const oct = new Uint8Array(buf, n * 6, n * 2), idx = new Uint16Array(buf.slice(n * 8, n * 8 + tn * 2));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('oct', new THREE.BufferAttribute(oct, 2, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export function bodyMaterial(stage, opts = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, side: THREE.DoubleSide,
    uniforms: { tLeaf: { value: stage.leaf }, uLight: { value: new THREE.Vector3(0.3, 0.5, 1) }, uClip: { value: opts.clip ?? 1000 }, uRim: { value: opts.rim ?? 1 }, uFade: { value: 1 }, uFocus: { value: new THREE.Vector3() }, uTime: { value: 0 } },
  });
}

// Letters cut from gold leaf. The mask comes from a 2D canvas, the bevel from the mask's own blur.
const LETTER_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; uniform sampler2D tMask; uniform vec3 uLight; uniform float uReveal; uniform vec2 uTexel;
${GOLD_LIB}
out vec4 o;
void main(){
  float a=texture(tMask,vUv).r;
  float l=texture(tMask,vUv,3.).r; float lx=texture(tMask,vUv+vec2(uTexel.x*5.,0.),3.).r, ly=texture(tMask,vUv+vec2(0.,uTexel.y*5.),3.).r;
  vec3 N=normalize(vec3(-(lx-l)*5.,-(ly-l)*5.,1.)); vec3 V=vec3(0.,0.,1.); vec3 L=normalize(uLight); float cr=0.;
  vec2 flow=normalize(vec2(.8,.25));
  vec3 c=goldLeaf(vUv*vec2(.9,.9*uTexel.x/uTexel.y),N,V,L,flow,.5,cr);
  c*=1.15; float k=a*(1.-cr*.55*a);
  float halo=texture(tMask,vUv,5.).r;
  o=vec4(c*k,1.);
  o.a=clamp(k+halo*.55,0.,1.)*uReveal;
  o.rgb=mix(vec3(.004,.003,.008),c,k);
  if(o.a<.003) discard;
}`;
const LETTER_VERT = /* glsl */`out vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

export function textPlate(stage, lines, { font, size, lineHeight = 1.05, align = 'center', px = 1100 } = {}) {
  const pad = size * 0.5;
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  ctx.font = `700 ${size}px ${font}`;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2), h = Math.ceil(lines.length * size * lineHeight + pad * 2);
  cv.width = w; cv.height = h;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.font = `700 ${size}px ${font}`; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = align;
  lines.forEach((l, i) => ctx.fillText(l, align === 'center' ? w / 2 : pad, pad + (i + 0.5) * size * lineHeight));
  const t = new THREE.CanvasTexture(cv); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.NoColorSpace;
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: LETTER_VERT, fragmentShader: LETTER_FRAG, transparent: true, depthWrite: false,
    uniforms: { tMask: { value: t }, tLeaf: { value: stage.leaf }, uLight: { value: new THREE.Vector3(0.3, 0.5, 1) }, uReveal: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) } } });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.userData.aspect = w / h;
  return mesh;
}

// Gold sparks: a soft round core, added to the picture so bloom picks it up.
const SPARK_VERT = /* glsl */`
in vec3 offset; in float size; in float glow;
out vec2 vQ; out float vG;
void main(){ vQ=position.xy; vG=glow; vec4 mv=modelViewMatrix*vec4(offset,1.); mv.xy+=position.xy*size; gl_Position=projectionMatrix*mv; }`;
const SPARK_FRAG = /* glsl */`
precision highp float; in vec2 vQ; in float vG; out vec4 o;
void main(){ float r=length(vQ); if(r>1.) discard; float c=exp(-r*r*5.); float k=exp(-r*r*22.);
 vec3 col=vec3(1.3,.82,.3)*c*.6+vec3(1.9,1.6,1.05)*k*1.2; o=vec4(col*vG,1.); }`;

export class Sparks {
  constructor(count) {
    this.count = count;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.offset = new Float32Array(count * 3); this.size = new Float32Array(count); this.glow = new Float32Array(count);
    g.setAttribute('offset', new THREE.InstancedBufferAttribute(this.offset, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('glow', new THREE.InstancedBufferAttribute(this.glow, 1).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = count;
    const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }
  flush() { const a = this.mesh.geometry.attributes; a.offset.needsUpdate = a.size.needsUpdate = a.glow.needsUpdate = true; }
}
