// Rendering. Atoms are ray-traced spheres drawn on camera-facing quads, then a
// post pass adds ink outlines and contact shading from the depth buffer, in the
// manner of David Goodsell's molecular illustrations.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

export const PALETTES = {
  lagoon: {a: '#58DCC8', b: '#0A6C80', ink: '#05243D', antigen: '#FF5C8A', antigen2: '#FF9DB6', crowd: '#A6F0E2'},
  sunset: {a: '#FFBB80', b: '#C7366A', ink: '#2A0B3F', antigen: '#6C4BE0', antigen2: '#A28CF5', crowd: '#FFDDB8'},
  sky: {a: '#A3E4F8', b: '#2860C4', ink: '#0A1A4F', antigen: '#FF7A45', antigen2: '#FFAE85', crowd: '#D8F4FC'},
  meadow: {a: '#CCF092', b: '#1C8C68', ink: '#06302A', antigen: '#E0469B', antigen2: '#F58CC6', crowd: '#E8F9C8'},
  amber: {a: '#FFD96E', b: '#DA651C', ink: '#3A1406', antigen: '#1E8FD6', antigen2: '#6CC0F0', crowd: '#FFEEB4'},
  violet: {a: '#DCB9FB', b: '#5838C2', ink: '#160A4A', antigen: '#22B8A0', antigen2: '#72E2CF', crowd: '#EEDCFD'},
  night: {a: '#40329A', b: '#0D0A33', ink: '#04031A', antigen: '#FF5C8A', antigen2: '#FF9DB6', crowd: '#6455C8'},
  fuchsia: {a: '#FF96BE', b: '#7A1C7E', ink: '#2B0533', antigen: '#FFC53D', antigen2: '#FFE08A', crowd: '#FFCADD'},
};

const shared = {uTime: {value: 0}};

const quadPositions = new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3);

const atomVertex = /* glsl */`
in vec3 iPos; in float iRad; in vec3 iCol;
uniform float uTime, uJitter;
out vec3 vCentre, vColor, vPoint; out float vRadius;
void main() {
  float s = length(modelViewMatrix[0].xyz);
  vec3 p = iPos + uJitter * vec3(sin(uTime * 3.1 + iPos.y * 37.0), sin(uTime * 2.7 + iPos.z * 31.0), sin(uTime * 3.7 + iPos.x * 41.0));
  vec4 c = modelViewMatrix * vec4(p, 1.0);
  vRadius = iRad * s;
  vCentre = c.xyz;
  vColor = iCol;
  vec3 corner = c.xyz + vec3(position.xy * vRadius * 1.4, 0.0);
  vPoint = corner;
  gl_Position = projectionMatrix * vec4(corner, 1.0);
}`;

const atomFragment = /* glsl */`
precision highp float;
in vec3 vCentre, vColor, vPoint; in float vRadius;
uniform mat4 projectionMatrix;
uniform vec3 uTint, uGlowColor;
uniform float uTintAmount, uGlow;
out vec4 fragColor;
void main() {
  vec3 rd = normalize(vPoint);
  float b = dot(vCentre, rd);
  float h = b * b - dot(vCentre, vCentre) + vRadius * vRadius;
  if (h < 0.0) discard;
  vec3 hit = rd * (b - sqrt(h));
  vec3 n = (hit - vCentre) / vRadius;
  vec4 clip = projectionMatrix * vec4(hit, 1.0);
  gl_FragDepth = 0.5 * clip.z / clip.w + 0.5;
  float shade = 0.8 + 0.2 * clamp(dot(n, normalize(vec3(-0.35, 0.65, 0.68))), 0.0, 1.0);
  vec3 col = mix(vColor, uTint, uTintAmount) * shade;
  col = mix(col, uGlowColor, uGlow * (0.35 + 0.65 * pow(1.0 - n.z, 2.0)));
  fragColor = vec4(col, 1.0);
}`;

export function makeCloud(positions, radii, colors, {jitter = 0.004} = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', quadPositions);
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(positions, 3));
  g.setAttribute('iRad', new THREE.InstancedBufferAttribute(radii, 1));
  g.setAttribute('iCol', new THREE.InstancedBufferAttribute(colors, 3));
  g.instanceCount = radii.length;
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: atomVertex,
    fragmentShader: atomFragment,
    uniforms: {
      uTime: shared.uTime,
      uJitter: {value: jitter},
      uTint: {value: new THREE.Color('#ffffff')},
      uTintAmount: {value: 0},
      uGlowColor: {value: new THREE.Color('#ffffff')},
      uGlow: {value: 0},
    },
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return mesh;
}

const postVertex = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const postFragment = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tColor, tDepth;
uniform vec2 uTexel;
uniform float uNear, uFar, uTime, uFogNear, uFogFar, uPx, uAspect, uAo, uFlash;
uniform vec3 uFieldA, uFieldB, uInk;

float zAt(vec2 uv) { float d = texture(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 field(vec2 uv) {
  vec2 p = uv - vec2(0.5, 0.56); p.x *= min(uAspect, 1.4);
  float wash = noise(uv * 2.6 + uTime * 0.012) * 0.6 + noise(uv * 6.1 - uTime * 0.02) * 0.28;
  return mix(uFieldA, uFieldB, smoothstep(0.02, 0.92, length(p) * 1.25 + (wash - 0.44) * 0.5));
}
void main() {
  float d = texture(tDepth, vUv).x;
  vec3 bg = field(vUv);
  vec3 col = bg;
  if (d < 1.0) {
    float z = zAt(vUv);
    float scale = clamp(z / 12.0, 0.5, 6.0);
    float hard = 0.0, soft = 0.0;
    vec2 dirs[8] = vec2[8](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1), vec2(0.7, 0.7), vec2(-0.7, 0.7), vec2(0.7, -0.7), vec2(-0.7, -0.7));
    for (int i = 0; i < 8; i++) {
      float dz = zAt(vUv + dirs[i] * uTexel * uPx) - z;
      hard = max(hard, smoothstep(0.34 * scale, 0.75 * scale, dz));
      soft = max(soft, smoothstep(0.035 * scale, 0.13 * scale, dz));
    }
    float occ = 0.0;
    if (uAo > 0.0) {
      float radius = 26.0 * uPx / max(z / 10.0, 0.6);
      for (int i = 0; i < 10; i++) {
        float a = float(i) * 2.399963;
        float r = (float(i) + 1.0) / 10.0;
        float dz = z - zAt(vUv + vec2(cos(a), sin(a)) * r * radius * uTexel);
        occ += smoothstep(0.03, 0.42, dz) * (1.0 - smoothstep(0.9, 2.0, dz));
      }
      occ = uAo * occ / 10.0;
    }
    float fog = smoothstep(uFogNear, uFogFar, z);
    col = texture(tColor, vUv).rgb * (1.0 - 0.6 * occ);
    col = mix(col, uInk, max(hard * 0.92, soft * 0.24) * (1.0 - fog * 0.6));
    col = mix(col, bg, fog * 0.86);
  }
  col += uFlash * vec3(1.0, 0.97, 0.9);
  col += (hash(vUv * 917.0 + fract(uTime)) - 0.5) * 0.022;
  vec2 v = vUv - 0.5;
  col *= 1.0 - 0.3 * dot(v, v);
  fragColor = vec4(col, 1.0);
}`;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: false, alpha: false, powerPreference: 'high-performance'});
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 220);
    this.quality = 1;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
      depthTexture: new THREE.DepthTexture(4, 4, THREE.UnsignedIntType),
    });
    const palette = PALETTES.lagoon;
    this.uniforms = {
      tColor: {value: this.target.texture}, tDepth: {value: this.target.depthTexture},
      uTexel: {value: new THREE.Vector2()}, uNear: {value: 1}, uFar: {value: 220}, uTime: shared.uTime,
      uFogNear: {value: 14}, uFogFar: {value: 58}, uPx: {value: 1}, uAspect: {value: 1}, uAo: {value: 1}, uFlash: {value: 0},
      uFieldA: {value: new THREE.Color(palette.a)}, uFieldB: {value: new THREE.Color(palette.b)}, uInk: {value: new THREE.Color(palette.ink)},
    };
    this.postScene = new THREE.Scene();
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const post = new THREE.Mesh(tri, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: postVertex, fragmentShader: postFragment,
      uniforms: this.uniforms, depthTest: false, depthWrite: false,
    }));
    post.frustumCulled = false;
    this.postScene.add(post);
    this.postCamera = new THREE.Camera();
    this.paletteFrom = null;
    this.paletteTo = palette;
    this.paletteT = 1;
    this.frameTimes = [];
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(Math.max(devicePixelRatio || 1, 1.5), 2) * this.quality;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    this.target.setSize(pw, ph);
    this.uniforms.uTexel.value.set(1 / pw, 1 / ph);
    this.uniforms.uPx.value = Math.max(1.1, dpr * 0.95);
    this.uniforms.uAspect.value = w / h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setPalette(name, seconds = 1.2) {
    this.paletteFrom = {
      a: this.uniforms.uFieldA.value.clone(), b: this.uniforms.uFieldB.value.clone(), ink: this.uniforms.uInk.value.clone(),
    };
    this.paletteTo = PALETTES[name];
    this.paletteT = seconds > 0 ? 0 : 1;
    this.paletteSpeed = seconds > 0 ? 1 / seconds : 1;
    if (seconds <= 0) {
      this.uniforms.uFieldA.value.set(this.paletteTo.a);
      this.uniforms.uFieldB.value.set(this.paletteTo.b);
      this.uniforms.uInk.value.set(this.paletteTo.ink);
    }
  }

  // Drops resolution, then contact shading, if the device cannot keep up.
  watchSpeed(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg < 1 / 40) return;
    if (this.quality > 0.6) { this.quality = Math.max(0.6, this.quality - 0.2); this.resize(); }
    else this.uniforms.uAo.value = 0;
  }

  render(time, dt) {
    shared.uTime.value = time;
    if (this.paletteT < 1) {
      this.paletteT = Math.min(1, this.paletteT + dt * this.paletteSpeed);
      const t = this.paletteT * this.paletteT * (3 - 2 * this.paletteT);
      const to = this.paletteTo, from = this.paletteFrom, u = this.uniforms;
      u.uFieldA.value.copy(from.a).lerp(new THREE.Color(to.a), t);
      u.uFieldB.value.copy(from.b).lerp(new THREE.Color(to.b), t);
      u.uInk.value.copy(from.ink).lerp(new THREE.Color(to.ink), t);
    }
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}
