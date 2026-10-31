// The rose window. The glass is painted once into a texture; light, tracks and vesicles are drawn over it live.
import * as THREE from 'three';

const PALETTE = [
  [0.66, 0.46, 0.2], // cytosol: amber
  [0.11, 0.2, 0.62], // nucleus: cobalt
  [0.05, 0.47, 0.5], // ER: teal
  [0.45, 0.14, 0.62], // nucleolus: violet
  [0.14, 0.56, 0.24], // Golgi: emerald
  [0.72, 0.09, 0.13], // mitochondrion: ruby
  [0.85, 0.42, 0.1], // ribosomes: orange
  [0.76, 0.14, 0.5], // lysosome: magenta
  [0.2, 0.46, 0.76], // endosome: sky
  [0.2, 0.3, 0.64], // spindle: blue
  [0.92, 0.72, 0.2], // pole: gold
];

const paintShader = (regions) => /* glsl */`
  varying vec2 vUv;
  const int N = ${regions.length};
  uniform vec4 uE[${Math.max(1, regions.length)}];
  uniform vec2 uA[${Math.max(1, regions.length)}];
  uniform vec3 uC[11];
  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  // Pane id, and the distance to the nearest edge between panes.
  vec3 voronoi(vec2 x) {
    vec2 n = floor(x), f = fract(x), mg, mr;
    float md = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash(n + g);
      vec2 r = g + o * .9 + .05 - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
    float e = 8.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 o = hash(n + g);
      vec2 r = g + o * .9 + .05 - f;
      if (dot(mr - r, mr - r) > 1e-5) e = min(e, dot(.5 * (mr + r), normalize(r - mr)));
    }
    return vec3(hash(n + mg), e);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    float a = hash(i).x, b = hash(i + vec2(1, 0)).x, c = hash(i + vec2(0, 1)).x, d = hash(i + vec2(1, 1)).x;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  void main() {
    vec2 p = (vUv - .5) * 2.6;
    float r = length(p);
    int reg = 0;
    float edge = 1e3;
    for (int i = 0; i < N; i++) {
      float c = cos(uA[i].x), s = sin(uA[i].x);
      vec2 d = p - uE[i].xy;
      vec2 q = vec2(d.x * c + d.y * s, -d.x * s + d.y * c) / uE[i].zw;
      float len = length(q);
      float sd = (len - 1.0) * min(uE[i].z, uE[i].w);
      if (sd < 0.0) { reg = int(uA[i].y); edge = abs(sd); }
      else edge = min(edge, sd);
    }
    float scale = reg == 0 ? 6.5 : (reg == 1 ? 9.0 : 13.0);
    vec3 v = voronoi(p * scale + float(reg) * 3.1);
    vec3 col = uC[reg];
    float tone = v.x;
    col *= .68 + .55 * tone;
    col = mix(col, col.gbr, (v.y - .5) * .1);
    // Hand-blown glass: streaks, seeds, and brightness gathered in the middle of each pane.
    float streak = noise(p * vec2(9., 38.) + v.xy * 30.);
    col *= .84 + .3 * streak;
    col *= .78 + .5 * smoothstep(.0, .22, v.z);
    float lead = 1.0 - smoothstep(.016, .026, v.z);
    float organelleLead = 1.0 - smoothstep(.006, .013, edge);
    // Stone rings and the gold of the cell membrane.
    float rimIn = smoothstep(.925, .933, r);
    float rimOut = 1.0 - smoothstep(1.0, 1.008, r);
    if (rimIn * rimOut > .5) {
      float a = atan(p.y, p.x);
      float beads = abs(fract(a * 18.0 / 3.14159) - .5);
      col = mix(vec3(.96,.74,.24), vec3(.62,.34,.06), smoothstep(.1, .5, beads));
      lead = max(0.0, 1.0 - smoothstep(.05, .08, beads));
    }
    col = mix(col, vec3(.05,.045,.07), max(lead, organelleLead));
    float ring = (1. - smoothstep(.0, .012, abs(r - .93))) + (1. - smoothstep(.0, .012, abs(r - 1.003)));
    col = mix(col, vec3(.04,.04,.06), clamp(ring, 0., 1.));
    if (r > 1.0) {
      // Dressed limestone around the opening.
      float block = noise(p * 26.) * .5 + noise(p * 7.) * .5;
      float a = atan(p.y, p.x) * 12.0 / 3.14159;
      float joint = (1. - smoothstep(.0, .04, abs(fract(a) - .5))) * step(r, 1.17);
      joint = max(joint, 1. - smoothstep(.0, .012, abs(r - 1.17)));
      vec3 stone = mix(vec3(.11,.105,.13), vec3(.17,.16,.18), block);
      col = stone * (1. - joint * .6) * (1. - smoothstep(1.12, 1.3, r) * .86);
    }
    gl_FragColor = vec4(col, r > 1.0 ? 0.0 : 1.0);
  }`;

export class Rose {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0c13);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    this.u = {
      uMap: { value: null }, uTime: { value: 0 }, uStress: { value: 0 }, uFlash: { value: 0 }, uFocus: { value: new THREE.Vector3(0, 0, 0) },
    };
    this.halves = [1, -1].map((side) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.u, uSide: { value: side }, uSplit: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */`
          varying vec2 vUv;
          uniform sampler2D uMap;
          uniform float uTime, uStress, uFlash, uSide, uSplit;
          uniform vec3 uFocus;
          void main() {
            vec2 p = (vUv - .5) * 2.6;
            float rim = 1.;
            // Each half keeps its own side of the cleavage furrow.
            if (uSplit > 0.0) {
              // The furrow pinches in, and each half rounds up into a whole cell with its own membrane.
              if (p.y * uSide < 0.0) discard;
              float d = length(p - vec2(0., uSide * .5 * uSplit));
              float edge = mix(1.9, .5, uSplit);
              if (d > edge) discard;
              if (length(p) > 1.0 && uSplit > .15) discard;
              rim = 1. - smoothstep(edge - .05, edge - .035, d);
            }
            vec4 t = texture2D(uMap, vUv);
            vec3 c = t.rgb;
            if (t.a > .5) {
              // Sun moves across the glass, and a slow shimmer keeps it alive.
              float beam = pow(max(0., sin(p.x * 1.1 + p.y * .7 - uTime * .1)), 3.0);
              float shim = .96 + .05 * sin(p.x * 13. + p.y * 9. + uTime * .6);
              c *= (1.02 + .55 * beam) * shim;
              c = mix(c, c * vec3(1.35, .45, .4), uStress);
              c += c * uFlash * .9;
              c *= 1.0 + .5 * uFocus.z * (1.0 - smoothstep(.0, .3, length(p - uFocus.xy)));
            }
            c = mix(vec3(.96, .74, .24), c, uSplit > 0. ? rim : 1.);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), mat);
      this.scene.add(m);
      return m;
    });
    this.ribbonGeo = new THREE.BufferGeometry();
    this.ribbonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9000), 3).setUsage(THREE.DynamicDrawUsage));
    this.ribbonGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9000), 3).setUsage(THREE.DynamicDrawUsage));
    this.ribbons = new THREE.Mesh(this.ribbonGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.NormalBlending, depthTest: false }));
    this.ribbons.frustumCulled = false;
    this.ribbons.position.z = 0.01;
    this.scene.add(this.ribbons);
    const cap = 240;
    this.beadPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.beadCol = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.beadSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.beadGeo = new THREE.BufferGeometry();
    this.beadGeo.setAttribute('position', this.beadPos);
    this.beadGeo.setAttribute('aCol', this.beadCol);
    this.beadGeo.setAttribute('aSize', this.beadSize);
    this.beadMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false,
      uniforms: { uScale: { value: 1 } },
      vertexShader: `attribute vec3 aCol; attribute float aSize; uniform float uScale; varying vec3 vCol;
        void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      // Enamel beads with a dark rim, so they read on bright glass.
      fragmentShader: `varying vec3 vCol;
        void main(){ float d = length(gl_PointCoord - .5) * 2.; if (d > 1.) discard;
          vec3 c = mix(mix(vec3(1.), vCol, smoothstep(.1, .5, d)), vec3(.04, .04, .07), smoothstep(.62, .76, d));
          gl_FragColor = vec4(c, 1. - smoothstep(.88, 1., d)); }`,
    });
    this.beads = new THREE.Points(this.beadGeo, this.beadMat);
    this.beads.frustumCulled = false;
    this.beads.position.z = 0.02;
    this.scene.add(this.beads);
    this.split = 0;
    this.pointer = { x: 0, y: 0 };
    this.resize();
  }

  // Paint a layout of glass once. A smaller texture on small screens keeps the shader cost at one frame.
  paint(regions) {
    const size = Math.min(2048, Math.round(Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) * 1.05));
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 4 });
    const n = Math.max(1, regions.length);
    const list = regions.length ? regions : [[9, 9, 0.01, 0.01, 0, 0]];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uE: { value: list.map((e) => new THREE.Vector4(e[0], e[1], Math.max(e[2], 1e-3), Math.max(e[3], 1e-3))) },
        uA: { value: list.map((e) => new THREE.Vector2(e[4], e[5])) },
        uC: { value: PALETTE.map((c) => new THREE.Vector3(...c)) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: paintShader(new Array(n)),
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const s = new THREE.Scene();
    s.add(quad);
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(s, new THREE.Camera());
    r.setRenderTarget(null);
    mat.dispose();
    quad.geometry.dispose();
    this.u.uMap.value = this.rt.texture;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.beadMat.uniforms.uScale.value = dpr * Math.min(h, w * 1.6) / 17;
    // The window fills the width on a phone and the height on a wide screen, above the HUD.
    const fit = Math.max(1.28 / (Math.tan(14 * Math.PI / 180) * this.camera.aspect), 1.5 / Math.tan(14 * Math.PI / 180));
    this.distance = Math.min(fit, 8.5);
    this.offset = w / h < 0.9 ? -0.24 : 0;
  }

  // Quads along a slightly bowed line, for tracks.
  beginRibbons() { this.ri = 0; }

  ribbon(a, b, width, color, grown = 1, bow = 0.05) {
    const pos = this.ribbonGeo.attributes.position.array;
    const col = this.ribbonGeo.attributes.color.array;
    const steps = 14;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const at = (t) => {
      const s = Math.sin(t * Math.PI) * bow;
      return [a.x + dx * t + nx * s, a.y + dy * t + ny * s];
    };
    for (let i = 0; i < steps && this.ri + 18 <= pos.length; i++) {
      const t0 = (i / steps) * grown;
      const t1 = ((i + 1) / steps) * grown;
      const [x0, y0] = at(t0);
      const [x1, y1] = at(t1);
      const w = width / 2;
      [[x0 - nx * w, y0 - ny * w], [x0 + nx * w, y0 + ny * w], [x1 + nx * w, y1 + ny * w], [x0 - nx * w, y0 - ny * w], [x1 + nx * w, y1 + ny * w], [x1 - nx * w, y1 - ny * w]].forEach(([x, y]) => {
        pos[this.ri] = x; pos[this.ri + 1] = y; pos[this.ri + 2] = 0;
        col[this.ri] = color[0]; col[this.ri + 1] = color[1]; col[this.ri + 2] = color[2];
        this.ri += 3;
      });
    }
  }

  endRibbons() {
    this.ribbonGeo.setDrawRange(0, this.ri / 3);
    this.ribbonGeo.attributes.position.needsUpdate = true;
    this.ribbonGeo.attributes.color.needsUpdate = true;
  }

  setBeads(list) {
    const n = Math.min(list.length, 240);
    for (let i = 0; i < n; i++) {
      const b = list[i];
      this.beadPos.setXYZ(i, b.x, b.y, 0);
      this.beadCol.setXYZ(i, b.c[0], b.c[1], b.c[2]);
      this.beadSize.setX(i, b.s ?? 1);
    }
    this.beadPos.needsUpdate = true;
    this.beadCol.needsUpdate = true;
    this.beadSize.needsUpdate = true;
    this.beadGeo.setDrawRange(0, n);
  }

  frame(t) {
    this.u.uTime.value = t;
    this.u.uFlash.value *= 0.92;
    const [a, b] = this.halves;
    const gap = this.split * 0.1;
    a.position.y = gap;
    b.position.y = -gap;
    a.material.uniforms.uSplit.value = this.split;
    b.material.uniforms.uSplit.value = this.split;
    const y = this.offset;
    const swayX = Math.sin(t * 0.17) * 0.05 + this.pointer.x * 0.09;
    const swayY = Math.sin(t * 0.13) * 0.03 + this.pointer.y * 0.06;
    const d = this.distance * (1 + this.split * 0.08);
    this.camera.position.set(swayX * d * 0.5, y + swayY * d * 0.5 - 0.0, d);
    this.camera.lookAt(0, y, 0);
    this.renderer.render(this.scene, this.camera);
  }

  // Unit-disk position to CSS pixels, and back.
  toScreen(x, y) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  fromScreen(px, py) {
    const v = new THREE.Vector3(px / innerWidth * 2 - 1, 1 - py / innerHeight * 2, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const t = -this.camera.position.z / dir.z;
    return { x: this.camera.position.x + dir.x * t, y: this.camera.position.y + dir.y * t };
  }
}
