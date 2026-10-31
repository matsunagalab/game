// The woodblock print: sky, relief, and the walkers. Every height comes from the same GLSL as the walkers use.
import * as THREE from 'three';

export const MAX = 5;

const RELIEF = /* glsl */`
uniform vec4 uW[${MAX}];
uniform vec4 uP[${MAX}];
uniform int uNW;
uniform int uNP;
uniform float uScale;
float freeE(vec2 p) {
  float m = 1e6;
  float e[${MAX}];
  for (int i = 0; i < uNW; i++) {
    vec2 d = p - uW[i].xy;
    e[i] = uW[i].z + 0.5 * uW[i].w * dot(d, d);
    m = min(m, e[i]);
  }
  float s = 0.0;
  for (int i = 0; i < uNW; i++) s += exp(-(e[i] - m) / 0.9);
  float g = m - 0.9 * log(s);
  for (int i = 0; i < uNP; i++) {
    vec2 d = p - uP[i].xy;
    float c = cos(uP[i].w), n = sin(uP[i].w);
    float u = d.x * c + d.y * n, v = -d.x * n + d.y * c;
    g += uP[i].z * exp(-u * u / 0.05 - v * v / 0.5);
  }
  return g;
}
float relief(vec2 p, float g) {
  float h = min(0.72 * log(1.0 + max(g, 0.0) / uScale), 1.28);
  float r = length(p);
  float far = smoothstep(0.75, -0.9, p.y);
  float near = smoothstep(0.62, 1.5, p.y);
  float side = smoothstep(1.2, 2.6, abs(p.x));
  h += smoothstep(1.2, 2.5, r) * far * (0.22 + 0.2 * sin(p.x * 2.1 + 1.0) * sin(p.y * 1.7 + .4) + 0.08 * sin(p.x * 5.3 + p.y * 3.1));
  h *= 1.0 - near * 0.92;
  h += side * (1.0 - far) * 0.12;
  return h;
}
`;

// Baren marks and washi fibres, tiled in screen space so the grain never swims with the camera.
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

export class Scene {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, alpha: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.autoClear = false;
    this.renderer = r;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    this.paper = paperTexture();
    this.sun = { x: 0.5, y: 0.8 };
    this.heat = { value: 0.3, target: 0.3 };
    this.night = { value: 0, target: 0 };
    this.tilt = 0;
    this.look = 0.2;
    const shared = {
      uW: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
      uP: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
      uNW: { value: 0 },
      uNP: { value: 0 },
      uScale: { value: 3 },
      uHeat: { value: 0.3 },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uPaper: { value: this.paper },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSun: { value: new THREE.Vector2(0.5, 0.8) },
      uRange: { value: 12 },
      uDpr: { value: 1 },
    };
    this.u = shared;
    this.sky = this.makeSky();
    this.terrain = this.makeTerrain();
    this.points = this.makePoints();
    this.scene.add(this.terrain, this.points);
    this.resize();
  }

  makeSky() {
    const mat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: this.u,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float uHeat, uNight, uTime;
        uniform vec2 uSun, uRes;
        uniform sampler2D uPaper;
        vec3 ramp3(vec3 a, vec3 b, vec3 c, float t) { return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0); }
        // Soft stacked bars of mist, the way prints draw distance.
        float bar(vec2 p, float y, float h, float x0, float x1) {
          float dy = abs(p.y - y) - h;
          float dx = max(x0 - p.x, p.x - x1);
          vec2 q = max(vec2(dx, dy) + h, 0.0);
          return 1.0 - smoothstep(h - 0.002, h + 0.002, length(q));
        }
        void main() {
          float aspect = uRes.x / uRes.y;
          vec2 p = vec2(vUv.x * aspect, vUv.y);
          float y = vUv.y;
          vec3 topC = ramp3(vec3(.05,.13,.27), vec3(.11,.25,.42), vec3(.47,.07,.05), uHeat);
          vec3 midC = ramp3(vec3(.34,.56,.70), vec3(.66,.79,.78), vec3(.86,.34,.16), uHeat);
          vec3 lowC = ramp3(vec3(.84,.89,.85), vec3(.96,.90,.76), vec3(.98,.76,.42), uHeat);
          vec3 col = mix(lowC, midC, smoothstep(.45, .8, y));
          // The ichimonji bokashi: a dark band wiped along the top of the block.
          col = mix(col, topC, smoothstep(.76, 1.0, y + .012 * sin(vUv.x * 9.0)));
          col = mix(col, vec3(.03,.05,.13), uNight * .92);
          // A far range and one cone, flat as a single block, just above the land.
          float rx = vUv.x;
          float range = .655 + .022 * sin(rx * 7.0 + 1.0) + .012 * sin(rx * 17.0);
          vec3 hazeC = mix(vec3(.45,.60,.70), vec3(.72,.42,.36), uHeat);
          col = mix(col, hazeC, (1.0 - smoothstep(range - .002, range + .002, y)) * (1.0 - uNight * .7));
          float cone = .755 - abs(rx - .3) * .36 * (1.0 + .5 * smoothstep(.0, .3, abs(rx - .3)));
          float inCone = 1.0 - smoothstep(cone - .002, cone + .002, y);
          vec3 coneC = mix(vec3(.16,.30,.47), vec3(.50,.13,.10), smoothstep(.45, 1.0, uHeat));
          col = mix(col, mix(coneC, vec3(.93,.92,.87), smoothstep(cone - .05, cone - .035, y + .006 * sin(rx * 60.0))), inCone * (1.0 - uNight * .6));
          vec2 s = vec2(uSun.x * aspect, uSun.y);
          float d = length(p - s);
          vec3 disc = ramp3(vec3(.97,.97,.90), vec3(.98,.84,.62), vec3(.95,.20,.10), uHeat);
          col = mix(col, disc, (1.0 - smoothstep(.052, .055, d)) * (1.0 - uNight * .35));
          col = mix(col, disc, .22 * (1.0 - smoothstep(.055, .15, d)) * (1.0 - uNight));
          float t = uTime * .006;
          float mist = 0.0;
          mist = max(mist, bar(p + vec2(fract(t) * .3, 0.), .80, .012, .05, aspect * .55));
          mist = max(mist, bar(p + vec2(-fract(t) * .2, 0.), .77, .012, aspect * .2, aspect * 1.1));
          mist = max(mist, bar(p + vec2(fract(t * 1.3) * .2, 0.), .74, .010, -.1, aspect * .4));
          vec3 cloud = mix(vec3(.94,.92,.85), vec3(1.,.82,.66), uHeat);
          col = mix(col, cloud, mist * .75 * (1.0 - uNight * .8));
          if (uNight > 0.01) {
            vec2 g = floor(p * 90.0);
            float r = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
            vec2 f = fract(p * 90.0) - .5;
            col += uNight * step(.985, r) * (1.0 - smoothstep(.0, .25, length(f))) * .8;
          }
          float grain = texture2D(uPaper, gl_FragCoord.xy / 256.0).r;
          col *= .94 + .12 * grain;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    q.frustumCulled = false;
    this.skyScene = new THREE.Scene();
    this.skyScene.add(q);
    this.skyCam = new THREE.Camera();
    return q;
  }

  makeTerrain() {
    const g = new THREE.PlaneGeometry(2, 2, 180, 180);
    g.rotateX(-Math.PI / 2);
    // Vertices crowd around the valleys, and the sheet runs on past the bottom of the screen.
    const at = g.attributes.position;
    for (let i = 0; i < at.count; i++) {
      const warp = (v) => v * (0.34 + 0.66 * v * v) * 7;
      at.setXYZ(i, warp(at.getX(i)), 0, warp(at.getZ(i)));
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */`
        ${RELIEF}
        varying float vG, vH, vNear, vX, vY;
        varying vec3 vNor;
        float at(vec2 p) { return relief(p, freeE(p)); }
        void main() {
          vec2 p = position.xz;
          float g = freeE(p);
          float h = relief(p, g);
          vG = g; vH = h;
          vNear = smoothstep(1.0, 2.2, p.y);
          vX = p.x; vY = p.y;
          vec3 w = vec3(p.x, h, p.y);
          float e = 0.03;
          vNor = normalize(vec3(at(p - vec2(e, 0.)) - at(p + vec2(e, 0.)), 2.0 * e, at(p - vec2(0., e)) - at(p + vec2(0., e))));
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying float vG, vH, vNear, vX, vY;
        varying vec3 vNor;
        uniform float uHeat, uNight, uRange;
        uniform sampler2D uPaper;
        vec3 band(float t) {
          // Pools of Prussian blue, sage slopes, ochre shoulders, then snow on the passes.
          vec3 c0 = vec3(.08,.20,.36), c1 = vec3(.13,.33,.47), c2 = vec3(.30,.47,.47), c3 = vec3(.47,.58,.47),
               c4 = vec3(.70,.67,.47), c5 = vec3(.82,.70,.45), c6 = vec3(.62,.46,.36), c7 = vec3(.36,.34,.40), c8 = vec3(.84,.83,.78);
          t = clamp(t, 0., 1.) * 8.0;
          float i = floor(t + .5);
          if (i < .5) return c0; if (i < 1.5) return c1; if (i < 2.5) return c2; if (i < 3.5) return c3;
          if (i < 4.5) return c4; if (i < 5.5) return c5; if (i < 6.5) return c6; if (i < 7.5) return c7;
          return c8;
        }
        void main() {
          // The block is cut along a ridge line, and the sky is printed behind it.
          if (vY < -1.62 + .16 * sin(vX * 2.3 + .6) + .07 * sin(vX * 6.1)) discard;
          vec3 n = normalize(vNor);
          float light = dot(n, normalize(vec3(-.5, .75, .4)));
          float grain = texture2D(uPaper, gl_FragCoord.xy / 256.0).r;
          float wob = (grain - .5) * .05;
          float t = vH / 1.5 + wob;
          vec3 col = band(t);
          // Two tones of shade, printed from a second block.
          float shade = smoothstep(.34, .36, light + wob) * .13 + smoothstep(.62, .64, light + wob) * .09;
          col *= .8 + shade * 1.5;
          // Bokashi inside each valley: ink gathers at the bottom.
          col = mix(vec3(.05,.13,.26), col, smoothstep(0., 1.3, vG + wob * 8.));
          // Contour lines, one every 2 kcal/mol: the key block.
          float c = vG / 2.0;
          float fw = fwidth(c);
          float line = 1.0 - smoothstep(fw * .6, fw * 1.5, abs(fract(c - .5) - .5));
          line *= smoothstep(0., .3, vG) * (1. - smoothstep(9., 17., vG));
          col = mix(col, vec3(.09,.12,.22), line * .55);
          // The foreground is printed last, in the darkest blue.
          col = mix(col, vec3(.06,.13,.25), smoothstep(.0, .55, vNear + wob * 3.));
          col = mix(col, col * vec3(1.14,.92,.82), max(0., uHeat - .5) * 1.1);
          col = mix(col, col * vec3(.34,.40,.62), uNight * .85);
          col *= .92 + .15 * grain;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    return m;
  }

  makePoints() {
    const g = new THREE.BufferGeometry();
    const cap = 1500;
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.tints = new THREE.BufferAttribute(new Float32Array(cap), 1);
    this.tints.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aTint', this.tints);
    g.setDrawRange(0, 0);
    this.pointsGeo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      uniforms: {
        ...this.u,
        uSize: { value: 1 },
        uCol: { value: [0, 1, 2, 3, 4].map(() => new THREE.Color()) },
      },
      vertexShader: /* glsl */`
        ${RELIEF}
        attribute float aTint;
        uniform float uSize, uDpr;
        uniform vec3 uCol[5];
        varying vec3 vCol;
        void main() {
          vec2 p = position.xy;
          vec3 w = vec3(p.x, relief(p, freeE(p)) + .015, p.y);
          vCol = uCol[int(aTint + .5)];
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_PointSize = uSize * uDpr * 36.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - .5) * 2.;
          if (d > 1.) discard;
          vec3 c = mix(vCol, vec3(.07,.09,.17), smoothstep(.62, .78, d));
          gl_FragColor = vec4(c, 1. - smoothstep(.86, 1., d));
        }`,
    });
    this.pointMat = mat;
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    return p;
  }

  colors(list) { list.forEach((c, i) => this.pointMat.uniforms.uCol.value[i].set(c).convertLinearToSRGB()); }

  // Mirrors the GLSL above, for the seal handles and the height of a pass.
  freeE(world, x, y, withPasses = true) {
    let m = 1e6;
    const e = world.wells.map((w) => {
      const v = w.G + 0.5 * (w.k ?? 14) * ((x - w.x) ** 2 + (y - w.y) ** 2);
      m = Math.min(m, v);
      return v;
    });
    let g = m - 0.9 * Math.log(e.reduce((s, v) => s + Math.exp(-(v - m) / 0.9), 0));
    if (withPasses) {
      world.links.forEach((l) => {
        const a = world.wells[l.a];
        const b = world.wells[l.b];
        const px = (a.x + b.x) / 2 - x;
        const py = (a.y + b.y) / 2 - y;
        const an = Math.atan2(b.y - a.y, b.x - a.x);
        const u = px * Math.cos(an) + py * Math.sin(an);
        const v = -px * Math.sin(an) + py * Math.cos(an);
        g += (l.B ?? 0) * Math.exp(-u * u / 0.05 - v * v / 0.5);
      });
    }
    return g;
  }

  // Send the live landscape to the GPU. Depths are measured from the lowest valley.
  apply(world, scale) {
    const min = Math.min(...world.wells.map((w) => w.G));
    const shown = { ...world, wells: world.wells.map((w) => ({ ...w, G: w.G - min })), links: world.links };
    this.shown = shown;
    this.u.uNW.value = world.wells.length;
    this.u.uNP.value = world.links.length;
    this.u.uScale.value = scale;
    world.wells.forEach((w, i) => this.u.uW.value[i].set(w.x, w.y, w.G - min, w.k ?? 14));
    world.links.forEach((l, i) => {
      const a = world.wells[l.a];
      const b = world.wells[l.b];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const ridge = this.freeE({ ...shown, links: [] }, mx, my);
      l.B = l.Gts !== undefined ? Math.max(0, l.Gts - min - ridge) : (l.bump ?? 2);
      this.u.uP.value[i].set(mx, my, l.B, Math.atan2(b.y - a.y, b.x - a.x));
    });
  }

  walkers(swarm) {
    const { n } = swarm;
    const p = this.pos.array;
    const t = this.tints.array;
    for (let i = 0; i < n; i++) {
      p[i * 3] = swarm.px[i];
      p[i * 3 + 1] = swarm.py[i];
      p[i * 3 + 2] = 0;
      t[i] = swarm.tint[i];
    }
    this.pos.needsUpdate = true;
    this.tints.needsUpdate = true;
    this.pointsGeo.setDrawRange(0, n);
    this.pointMat.uniforms.uSize.value = n === 1 ? 7 : 1;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.u.uRes.value.set(w, h);
    this.u.uDpr.value = dpr * Math.min(1.25, Math.max(.7, h / 760));
    this.camera.aspect = w / h;
    // A tall phone sees the valleys in depth; a wide screen sees the whole range.
    const a = w / h;
    this.dist = a < 0.9 ? 4.9 + (0.9 - a) * 3.2 : 4.9;
    this.camera.updateProjectionMatrix();
  }

  frame(t) {
    this.heat.value += (this.heat.target - this.heat.value) * 0.08;
    this.night.value += (this.night.target - this.night.value) * 0.04;
    this.u.uHeat.value = this.heat.value;
    this.u.uNight.value = this.night.value;
    this.u.uTime.value = t;
    this.u.uSun.value.set(this.sun.x, this.sun.y);
    const a = 0.5 + Math.sin(t * 0.05) * 0.018 + this.tilt;
    const d = this.dist;
    this.camera.position.set(Math.sin(a - .5) * d, d * 0.5, Math.cos(a - .5) * d);
    this.camera.lookAt(0, this.look, -0.25);
    const r = this.renderer;
    r.clear();
    r.render(this.skyScene, this.skyCam);
    r.clearDepth();
    r.render(this.scene, this.camera);
  }

  // Screen position of a place on the land, in CSS pixels.
  project(x, y, world) {
    const g = this.freeE(this.shown, x, y);
    const h = Math.min(1.28, 0.72 * Math.log(1 + Math.max(g, 0) / this.u.uScale.value));
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  // A small JPEG of the print as it stands now, for the portfolio.
  snapshot(w = 220) {
    const c = document.createElement('canvas');
    const h = Math.round(w * 1.3);
    c.width = w;
    c.height = h;
    const src = this.canvas;
    const sh = Math.min(src.height, src.width * 1.3);
    const sw = sh / 1.3;
    c.getContext('2d').drawImage(src, (src.width - sw) / 2, 0, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  }
}
