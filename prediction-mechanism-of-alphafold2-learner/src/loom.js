// The alignment as a woven cloth. Each row is a real strip of paper. Rows really move when sorted.
// The weave itself, over and under, is drawn in the shader, so a cloth of thousands of crossings costs a few dozen meshes.
import * as THREE from 'three';

// Paper colours by residue class. Not the confidence colours, which mean something else in this game.
const CLASS = { A: '#e9cf9c', V: '#e9cf9c', I: '#e4c283', L: '#e4c283', M: '#e4c283', C: '#f0dd7a', F: '#d9a56b', W: '#cf9360', Y: '#dba97a', G: '#b8cc9f', P: '#9fbb92', S: '#bfe0ea', T: '#a9d6e6', N: '#9fcfe8', Q: '#8fc4e6', H: '#b3b6e6', K: '#6f9fe0', R: '#5b8fdc', D: '#ef9b83', E: '#e9846e', '-': '#f4efe4' };
const LETTERS = 'ACDEFGHIKLMNPQRSTVWY-';
export const letterColor = (i) => new THREE.Color(CLASS[LETTERS[i]]);
export const letterHex = (i) => CLASS[LETTERS[i]];

export class Loom {
  constructor(world, msa, { rows = 64, cellW = 1, cellH = 1.55, origin = [0, 0], seed = 3 } = {}) {
    this.world = world; this.msa = msa; this.rows = rows; this.L = msa.L; this.cellW = cellW; this.cellH = cellH; this.origin = origin;
    const { N, L, X } = msa;
    // An even sample of real rows for the eye. All statistics use every row.
    this.pick = Array.from({ length: rows }, (_, i) => Math.floor(((i + 0.5) / rows) * N * 0.999));
    const data = new Uint8Array(L * rows * 4), c = new THREE.Color();
    this.pick.forEach((s, r) => {
      for (let col = 0; col < L; col += 1) {
        c.set(CLASS[LETTERS[X[s * L + col]]]).convertLinearToSRGB();
        const at = (r * L + col) * 4;
        data[at] = c.r * 255; data[at + 1] = c.g * 255; data[at + 2] = c.b * 255; data[at + 3] = 255;
      }
    });
    this.tex = new THREE.DataTexture(data, L, rows, THREE.RGBAFormat);
    this.tex.needsUpdate = true;
    this.glowData = new Uint8Array(L);
    this.glow = new THREE.DataTexture(this.glowData, L, 1, THREE.RedFormat);
    this.glow.needsUpdate = true;
    const g = new THREE.PlaneGeometry(L * cellW, cellH * 0.94).rotateX(-Math.PI / 2);
    const m = world.paper({ glow: 0, bump: 0.15, repeat: 0.1 });
    const u = this.uniforms = { uTex: { value: this.tex }, uGlow: { value: this.glow }, uTime: { value: 0 }, uL: { value: L } };
    const base = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => {
      base(s, r);
      Object.assign(s.uniforms, u);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRow; varying float vRow; varying vec2 vCell; varying float vZ;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRow = aRow; vCell = vec2(uv.x * uL, uv.y); vZ = (modelMatrix * instanceMatrix * vec4(position, 1.0)).z;')
        .replace('void main() {', 'uniform float uL;\nvoid main() {');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uTex; uniform sampler2D uGlow; uniform float uTime; varying float vRow; varying vec2 vCell; varying float vZ;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 cell = vec2(floor(vCell.x), vRow);
          vec3 stock = texelFetch(uTex, ivec2(cell), 0).rgb;
          vec2 f = vec2(fract(vCell.x), vCell.y);
          float over = mod(cell.x + cell.y, 2.0);
          float pillow = over > 0.5 ? 1.0 - pow(abs(2.0 * f.x - 1.0), 3.0) * 0.28 : 1.0 - pow(abs(2.0 * f.y - 1.0), 3.0) * 0.28;
          stock = pow(stock, vec3(1.55)) * pillow * (over > 0.5 ? 1.0 : 0.93) * 0.92;
          float g = texelFetch(uGlow, ivec2(int(cell.x), 0), 0).r;
          stock += g * (0.22 + 0.2 * sin(uTime * 2.6 + cell.x * 0.9 + vZ * 0.5));
          diffuseColor.rgb *= stock;`);
    };
    m.customProgramCacheKey = () => 'loom';
    const mesh = this.mesh = new THREE.InstancedMesh(g, m, rows);
    const aRow = new THREE.InstancedBufferAttribute(new Float32Array(rows), 1);
    for (let i = 0; i < rows; i += 1) aRow.setX(i, i);
    g.setAttribute('aRow', aRow);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.at = Float32Array.from({ length: rows }, (_, i) => i);
    this.to = this.at.slice();
    this.lift = new Float32Array(rows);
    const back = this.back = new THREE.Mesh(new THREE.BoxGeometry(L * cellW + 2.4, 0.3, rows * cellH + 2.4), world.paper({ color: '#fffdf8', glow: 0, repeat: 2 }));
    back.position.set(origin[0], 0.15, origin[1]);
    back.castShadow = true; back.receiveShadow = true;
    world.scene.add(back, mesh);
    // Each marker is a pair of paper tabs at the cloth's edges, so the column itself stays in plain view.
    this.marks = [0xffffff, 0xffffff].map(() => {
      const b = new THREE.Group(), m = world.paper({ color: '#0053d6', glow: 0.1 });
      const span = rows * cellH + 6;
      for (const z of [-span / 2, span / 2]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(cellW * 3, 0.12, 5), m);
        t.position.z = z; t.castShadow = true;
        b.add(t);
      }
      b.material = m;
      b.visible = false; b.position.y = 1.4;
      world.scene.add(b);
      return b;
    });
    this.marks[1].material.color.set('#ff7d45');
    this.place();
    this.tick = (dt, t) => this.update(dt, t);
    world.ticks.add(this.tick);
  }

  place() {
    const { rows, cellH, origin, mesh, at } = this, M = new THREE.Matrix4();
    for (let r = 0; r < rows; r += 1) {
      M.makeTranslation(origin[0], 0.45 + this.lift[r], origin[1] - (rows * cellH) / 2 + (at[r] + 0.5) * cellH);
      mesh.setMatrixAt(r, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    let moving = false;
    for (let r = 0; r < this.rows; r += 1) {
      const d = this.to[r] - this.at[r];
      if (Math.abs(d) > 0.004) { this.at[r] += d * Math.min(1, dt * 7); moving = true; this.lift[r] = Math.min(1.4, Math.abs(d) * 0.3); } else { this.at[r] = this.to[r]; this.lift[r] *= 0.8; }
    }
    if (moving) { this.place(); this.world.shadowDirty = 2; }
  }

  // Strips with the same letter at col gather together; within a block, a second column can order them.
  sortBy(col, then = -1) {
    const { X, L } = this.msa, order = this.pick.map((s, r) => [r, X[s * L + col], then >= 0 ? X[s * L + then] : 0]);
    const count = new Map();
    for (const o of order) count.set(o[1], (count.get(o[1]) ?? 0) + 1);
    order.sort((a, b) => (count.get(b[1]) - count.get(a[1])) || (a[1] - b[1]) || (a[2] - b[2]) || (a[0] - b[0]));
    order.forEach(([r], rank) => { this.to[r] = rank; });
  }

  setGlow(values) { for (let c = 0; c < this.L; c += 1) this.glowData[c] = Math.min(255, Math.max(0, values[c] * 255)); this.glow.needsUpdate = true; }

  columnX(c) { return this.origin[0] - (this.L * this.cellW) / 2 + (c + 0.5) * this.cellW; }
  columnAt(x) { return Math.max(0, Math.min(this.L - 1, Math.floor((x - this.origin[0] + (this.L * this.cellW) / 2) / this.cellW))); }
  mark(k, col) {
    (this.marked ??= [-1, -1])[k] = col;
    const b = this.marks[k];
    b.visible = col >= 0;
    if (col >= 0) { b.position.set(this.columnX(col), 1.4, this.origin[1]); this.world.shadowDirty = 2; }
  }
  size() { return [this.L * this.cellW + 3, this.rows * this.cellH + 6]; }

  // Moves the whole cloth, with its markers, when the layout changes.
  relocate(x, z) {
    this.origin[0] = x; this.origin[1] = z;
    this.back.position.set(x, 0.15, z);
    this.place();
    for (const k of [0, 1]) if (this.marks[k].visible) this.mark(k, this.marked?.[k] ?? -1);
    this.world.shadowDirty = 3;
  }

  dispose() {
    const w = this.world;
    w.ticks.delete(this.tick);
    w.scene.remove(this.mesh, this.back, ...this.marks);
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.back.geometry.dispose(); this.back.material.dispose();
    this.marks.forEach((b) => { b.children.forEach((t) => t.geometry.dispose()); b.material.dispose(); });
    this.tex.dispose(); this.glow.dispose();
    w.shadowDirty = 3;
  }
}
