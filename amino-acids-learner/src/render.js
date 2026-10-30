// The look of the game. Everything is drawn as gouache into a buffer, then a final pass
// lays it on paper: unpainted areas show only ink lines, painted areas show the colour.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

export const PAPER = '#eff4ec';
export const INK = '#232d5c';

// Uniforms shared by every material, so changing the palette reaches all of them.
export const shared = {
  uWashA: { value: new THREE.Color('#cfeae0') },
  uWashB: { value: new THREE.Color('#bcd5f0') },
  uFog: { value: new THREE.Vector2(40, 130) },
  uRes: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uScroll: { value: 0 },
};

const LIGHT = 'normalize(vec3(-0.5, 0.8, 0.55))';

const gouacheFragment = /* glsl */ `
  uniform vec3 uWashA, uWashB;
  uniform vec2 uFog, uRes;
  uniform float uFlag, uEdge, uGloss;
  varying vec3 vColor, vN, vP;
  void main() {
    vec3 N = normalize(vN), V = normalize(-vP), L = ${LIGHT};
    float ndl = dot(N, L);
    vec3 shade = vColor * vec3(0.70, 0.68, 0.84);
    vec3 c = mix(shade, vColor, smoothstep(-0.3, 0.3, ndl));
    float rim = 1.0 - max(dot(N, V), 0.0);
    c = mix(c, shade * 0.74, smoothstep(0.60, 0.98, rim) * uEdge);
    c += vColor * 0.10 * smoothstep(0.7, 1.0, ndl);
    float s = pow(max(dot(normalize(L + V), N), 0.0), 60.0);
    c = mix(c, vec3(1.0), smoothstep(0.35, 0.7, s) * uGloss);
    float f = smoothstep(uFog.x, uFog.y, length(vP));
    vec3 fog = mix(uWashB, uWashA, gl_FragCoord.y / uRes.y);
    gl_FragColor = vec4(mix(c, fog, f), uFlag);
  }
`;

const gouacheVertex = /* glsl */ `
  varying vec3 vColor, vN, vP;
  uniform vec3 uTint;
  void main() {
    vec3 pos = position, nor = normal;
    vColor = uTint;
    #ifdef USE_COLOR
      vColor = color;
    #endif
    #ifdef USE_INSTANCING
      pos = (instanceMatrix * vec4(pos, 1.0)).xyz;
      nor = mat3(instanceMatrix) * nor;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #endif
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vN = normalMatrix * nor;
    vP = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// painted: 1 keeps the object in colour on bare paper, 0 lets the paint mask decide.
export function gouache({ painted = 1, edge = 1, gloss = 0, vertexColors = false, tint = '#ffffff', side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: gouacheVertex,
    fragmentShader: gouacheFragment,
    vertexColors,
    side,
    blending: THREE.NoBlending,
    uniforms: {
      ...shared,
      uFlag: { value: painted },
      uEdge: { value: edge },
      uGloss: { value: gloss },
      uTint: { value: new THREE.Color(tint) },
    },
  });
}

// Crowd molecules move entirely in the vertex shader, so thousands cost no JavaScript.
export function crowdMaterial() {
  return new THREE.ShaderMaterial({
    blending: THREE.NoBlending,
    uniforms: { ...shared, uFlag: { value: 0 }, uEdge: { value: 1 }, uGloss: { value: 0 }, uSpan: { value: 170 } },
    vertexShader: /* glsl */ `
      attribute vec3 aPos, aColor;
      attribute vec4 aAxis;
      attribute float aSize;
      uniform float uScroll, uTime, uSpan;
      varying vec3 vColor, vN, vP;
      vec3 turn(vec3 v, vec3 k, float a) {
        float c = cos(a), s = sin(a);
        return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
      }
      void main() {
        float a = aAxis.w + uTime * (0.05 + 0.1 * fract(aAxis.w * 3.7)) + uScroll * 0.12;
        vec3 p = turn(position, aAxis.xyz, a) * aSize;
        vec3 w = aPos;
        w.x = mod(w.x - uScroll + uSpan * 0.5, uSpan) - uSpan * 0.5;
        w.y += sin(uTime * 0.21 + aAxis.w * 9.0) * 0.5;
        vec4 mv = viewMatrix * vec4(w + p, 1.0);
        vN = mat3(viewMatrix) * turn(normal, aAxis.xyz, a);
        vP = mv.xyz;
        vColor = aColor;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: gouacheFragment,
  });
}

// A soft-edged dab of paint behind each molecule, so it reads against the crowd.
export function dabMaterial(color) {
  return new THREE.ShaderMaterial({
    blending: THREE.NoBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSeed: { value: Math.random() * 10 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uSeed; varying vec2 vUv;
      void main() {
        float a = atan(vUv.y, vUv.x);
        float r = 0.86 + 0.05 * sin(a * 3.0 + uSeed) + 0.035 * sin(a * 7.0 + uSeed * 2.0) + 0.02 * sin(a * 13.0 - uSeed);
        float d = length(vUv);
        if (d > r) discard;
        vec3 c = mix(uColor, uColor * vec3(0.88, 0.87, 0.93), smoothstep(r - 0.14, r, d));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

function makePaperTexture() {
  // Layers of value noise. R: tooth of the paper. G: fibres. B: slow pigment blotches.
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const lattice = (period, seed) => {
    const g = new Float32Array(period * period);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 16807) % 2147483647;
      g[i] = s / 2147483647;
    }
    return (x, y) => {
      const fx = x * period, fy = y * period;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
      const at = (a, b) => g[((b % period) * period + (a % period)) | 0];
      const top = at(ix, iy) * (1 - ux) + at(ix + 1, iy) * ux;
      const bot = at(ix, iy + 1) * (1 - ux) + at(ix + 1, iy + 1) * ux;
      return top * (1 - uy) + bot * uy;
    };
  };
  const n1 = lattice(128, 11), n2 = lattice(64, 23), n3 = lattice(32, 37), n4 = lattice(8, 53), n5 = lattice(4, 71), n6 = lattice(16, 97);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const tooth = 0.5 * n1(u, v) + 0.3 * n2(u, v) + 0.2 * n3(u, v);
      const fibre = n2(u * 2 % 1, v * 0.5) * 0.6 + n1(u, v) * 0.4;
      const blotch = 0.6 * n5(u, v) + 0.3 * n4(u, v) + 0.1 * n6(u, v);
      const i = (y * size + x) * 4;
      data[i] = tooth * 255;
      data[i + 1] = fibre * 255;
      data[i + 2] = blotch * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Where paint has landed, kept as a small greyscale canvas. Stamps grow over time like wet paint.
export class PaintMask {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.blooms = [];
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.fade = 0;
    this.dirty = true;
    this.resize(1);
  }

  // Keeps the paint already on the page, stretched to the new shape.
  resize(aspect) {
    const old = document.createElement('canvas');
    old.width = this.canvas.width;
    old.height = this.canvas.height;
    old.getContext('2d').drawImage(this.canvas, 0, 0);
    this.aspect = aspect;
    this.canvas.width = aspect >= 1 ? 256 : Math.round(256 * aspect);
    this.canvas.height = aspect >= 1 ? Math.round(256 / aspect) : 256;
    this.texture.dispose();
    this.clear();
    this.ctx.drawImage(old, 0, 0, this.canvas.width, this.canvas.height);
  }

  clear() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.blooms.length = 0;
    this.dirty = true;
  }

  flood() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = true;
  }

  // x, y from 0 to 1 with y going down. radius is a fraction of the longer screen side.
  bloom(x, y, radius, seconds = 0.9) {
    const lobes = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, d = i === 0 ? 0 : 0.35 + Math.random() * 0.5;
      lobes.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: i === 0 ? 1 : 0.4 + Math.random() * 0.45 });
    }
    this.blooms.push({ x, y, radius, age: 0, seconds, lobes });
  }

  stamp(x, y, radius, strength) {
    const { ctx, canvas } = this;
    const R = radius * Math.max(canvas.width, canvas.height);
    if (R < 1) return;
    const g = ctx.createRadialGradient(x * canvas.width, y * canvas.height, 0, x * canvas.width, y * canvas.height, R);
    g.addColorStop(0, `rgba(255,255,255,${strength})`);
    g.addColorStop(0.72, `rgba(255,255,255,${strength * 0.9})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x * canvas.width, y * canvas.height, R, 0, Math.PI * 2);
    ctx.fill();
    this.dirty = true;
  }

  update(dt) {
    const { canvas } = this;
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const b = this.blooms[i];
      const before = b.age / b.seconds;
      b.age += dt;
      const t = Math.min(1, b.age / b.seconds);
      const grow = 1 - (1 - t) ** 3;
      if (grow > 1 - (1 - before) ** 3) {
        for (const l of b.lobes) {
          const aspectX = canvas.height / canvas.width;
          this.stamp(b.x + l.dx * b.radius * grow * Math.min(1, aspectX), b.y + l.dy * b.radius * grow * Math.min(1, 1 / aspectX), b.radius * l.r * grow, 0.5);
        }
      }
      if (t >= 1) this.blooms.splice(i, 1);
    }
    if (this.fade > 0) {
      // Paint dries back to paper. Only used on the title page.
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.fillStyle = `rgba(0,0,0,${this.fade * dt})`;
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.dirty = true;
    }
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}

export class Painter {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 2, 240);
    this.mask = new PaintMask();
    this.target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.target.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
    this.paper = makePaperTexture();
    this.post = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tPaper: { value: this.paper },
        tMask: { value: this.mask.texture },
        uTexel: { value: new THREE.Vector2() },
        uPaperScale: { value: new THREE.Vector2(1, 1) },
        uNear: { value: this.camera.near },
        uFar: { value: this.camera.far },
        uPaper: { value: new THREE.Color(PAPER) },
        uInk: { value: new THREE.Color(INK) },
        uInkAmount: { value: 1 },
        uLine: { value: 1 },
        uInkFar: { value: 110 },
        uWashA: shared.uWashA,
        uWashB: shared.uWashB,
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth, tPaper, tMask;
        uniform vec2 uTexel, uPaperScale;
        uniform float uNear, uFar, uInkAmount, uLine, uInkFar;
        uniform vec3 uPaper, uInk, uWashA, uWashB;
        varying vec2 vUv;
        const vec2 DIRS[8] = vec2[8](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1),
          vec2(0.7, 0.7), vec2(-0.7, 0.7), vec2(0.7, -0.7), vec2(-0.7, -0.7));
        const mat2 TILT = mat2(0.92, 0.39, -0.39, 0.92);
        float eyeZ(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return (uNear * uFar) / (uFar - d * (uFar - uNear));
        }
        void main() {
          vec4 grain = texture2D(tPaper, TILT * (vUv * uPaperScale));
          vec4 broad = texture2D(tPaper, TILT * (vUv * uPaperScale * 0.13));
          // Lines wander a little, the way a hand does.
          vec2 wander = (broad.rg - 0.5) * uTexel * 5.0;
          vec2 uv = vUv + wander;
          vec4 src = texture2D(tColor, uv);
          float z = eyeZ(uv);
          vec2 o = uTexel * uLine;
          // Eight neighbours give a soft edge, standing in for antialiasing.
          float near = z, line = 0.0;
          for (int i = 0; i < 8; i++) {
            vec2 d = DIRS[i] * o;
            float zn = eyeZ(uv + d);
            near = min(near, zn);
            line += smoothstep(0.012, 0.03, abs(zn - z) / min(z, zn));
          }
          line = smoothstep(0.1, 0.8, line / 8.0);
          line *= 1.0 - smoothstep(uInkFar * 0.5, uInkFar, near);
          line *= 0.62 + 0.38 * grain.g;

          float m = texture2D(tMask, vUv).r;
          float edge = 0.5 + (grain.r - 0.5) * 0.42 + (broad.b - 0.5) * 0.5;
          float paint = smoothstep(edge - 0.07, edge + 0.07, m);
          float wet = paint * (1.0 - paint) * 4.0;

          vec3 bare = uPaper * (0.975 + 0.05 * grain.r);
          float isSky = step(0.9999, texture2D(tDepth, uv).x);
          vec3 wash = mix(uWashB, uWashA, vUv.y);
          wash *= 0.95 + 0.1 * broad.b;
          vec3 pigment = mix(src.rgb, wash, isSky);
          // Pigment settles into the tooth of the paper.
          pigment = mix(pigment, pigment * pigment, (0.5 - grain.r) * 0.32);
          pigment *= 0.98 + 0.04 * grain.r;

          float k = max(paint, src.a);
          vec3 c = mix(bare, pigment, k);
          c *= 1.0 - wet * (1.0 - src.a) * 0.13;
          float inked = line * uInkAmount * mix(0.8, 0.5, paint);
          c = mix(c, uInk, inked);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quad = new THREE.Mesh(tri, this.post);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCamera = new THREE.Camera();
    this.scale = 1;
  }

  // Render buffer size. Phones get less than their full pixel density, which still looks sharp.
  resize(width, height, scale) {
    this.width = width;
    this.height = height;
    this.scale = scale;
    const w = Math.round(width * scale), h = Math.round(height * scale);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.target.setSize(w, h);
    shared.uRes.value.set(w, h);
    const u = this.post.uniforms;
    u.uTexel.value.set(1 / w, 1 / h);
    u.uLine.value = Math.max(1, scale * 0.8);
    // Grain stays the same size in CSS pixels whatever the buffer size.
    u.uPaperScale.value.set(width / 220, height / 220);
    this.mask.resize(width / height);
    u.tMask.value = this.mask.texture;
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.setClearColor(shared.uWashA.value, 0);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}

export function setWash(a, b) {
  shared.uWashA.value.set(a);
  shared.uWashB.value.set(b);
}
