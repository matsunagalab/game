// A small window of a real alignment as big paper tiles. Rows are real sequences and really move when sorted, and a
// column lifts off the sheet when it is picked up, so that it can be laid beside another column.
import * as THREE from 'three';
import { letterColor } from './loom.js';

const LETTERS = 'ACDEFGHIKLMNPQRSTVWY-', GRID = [7, 3];

// All letters on one sheet, redrawn once the game's own font has arrived.
function letterSheet() {
  const c = document.createElement('canvas'), size = 96;
  c.width = size * GRID[0]; c.height = size * GRID[1];
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
  const draw = () => {
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 66px "Alegreya Sans", "Helvetica Neue", Arial, sans-serif';
    [...LETTERS].forEach((t, i) => g.fillText(t === '-' ? '–' : t, ((i % GRID[0]) + 0.5) * size, (Math.floor(i / GRID[0]) + 0.54) * size));
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load?.('700 66px "Alegreya Sans"').then(draw, () => {});
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export class TileBoard {
  // X is the flat alignment with L columns. rows are real rows of it, cols are real columns.
  constructor(world, { X, L, rows, cols }, { cell = 4, origin = [0, 0], y = 0.5 } = {}) {
    Object.assign(this, { world, X, L, rows, cols, cell, origin, y });
    const R = rows.length, C = cols.length, g = new THREE.BoxGeometry(cell * 0.93, 0.5, cell * 0.93), n = R * C;
    const letter = new Float32Array(n);
    const tex = this.tex = letterSheet();
    const m = world.paper({ glow: 0.1, bump: 0.25, repeat: 0.25 }), base = m.onBeforeCompile, u = { uSheet: { value: tex } };
    m.onBeforeCompile = (s, r) => {
      base(s, r);
      s.uniforms.uSheet = u.uSheet;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLetter; varying float vLetter; varying vec2 vTile; varying float vTop;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLetter = aLetter; vTile = uv; vTop = step(0.5, normal.y);');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uSheet; varying float vLetter; varying vec2 vTile; varying float vTop;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 slot = vec2(mod(vLetter, ${GRID[0]}.0), floor(vLetter / ${GRID[0]}.0));
          vec2 at = (slot + vec2(vTile.x, 1.0 - vTile.y)) / vec2(${GRID[0]}.0, ${GRID[1]}.0);
          float ink = smoothstep(0.12, 0.62, texture2D(uSheet, vec2(at.x, 1.0 - at.y)).r) * vTop;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.08, 0.12), ink * 0.94);`);
    };
    m.customProgramCacheKey = () => 'tiles';
    const mesh = this.mesh = new THREE.InstancedMesh(g, m, n);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    rows.forEach((s, r) => cols.forEach((c, k) => {
      const v = X[s * L + c];
      letter[r * C + k] = v;
      mesh.setColorAt(r * C + k, letterColor(v));
    }));
    g.setAttribute('aLetter', new THREE.InstancedBufferAttribute(letter, 1));
    this.at = Float32Array.from({ length: R }, (_, i) => i);
    this.to = this.at.slice();
    this.lift = new Float32Array(C); this.liftTo = new Float32Array(C);
    this.dx = new Float32Array(C); this.dxTo = new Float32Array(C);
    const back = this.back = new THREE.Mesh(new THREE.BoxGeometry(C * cell + 1.6, 0.3, R * cell + 1.6), world.paper({ color: '#fffdf8', glow: 0, repeat: 2 }));
    back.castShadow = true; back.receiveShadow = true;
    world.scene.add(back, mesh);
    back.position.set(origin[0], 0.15, origin[1]);
    this.place();
    this.tick = (dt) => this.update(dt);
    world.ticks.add(this.tick);
  }

  size() { return [this.cols.length * this.cell + 1.6, this.rows.length * this.cell + 1.6]; }

  // Column k's centre on the sheet.
  x(k) { return this.origin[0] + (k + 0.5 - this.cols.length / 2) * this.cell; }
  rowZ(r) { return this.origin[1] + (r + 0.5 - this.rows.length / 2) * this.cell; }
  top() { return this.origin[1] - (this.rows.length * this.cell) / 2; }

  // The column under a world point, with a little room around the sheet for a finger.
  columnAt(p) {
    if (!p) return -1;
    const half = (this.rows.length * this.cell) / 2 + this.cell * 1.2;
    if (Math.abs(p.z - this.origin[1]) > half) return -1;
    const k = Math.floor((p.x - this.origin[0]) / this.cell + this.cols.length / 2);
    return k >= 0 && k < this.cols.length ? k : -1;
  }

  place() {
    const { rows, cols, mesh, at, y, lift, dx } = this, M = new THREE.Matrix4();
    rows.forEach((_, r) => {
      const z = this.rowZ(at[r]);
      cols.forEach((__, k) => { M.makeTranslation(this.x(k) + dx[k], y + 0.25 + lift[k], z); mesh.setMatrixAt(r * cols.length + k, M); });
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.world.shadowDirty = 2;
  }

  update(dt) {
    const f = Math.min(1, dt * 11);
    let moving = false;
    for (let r = 0; r < this.rows.length; r += 1) {
      const d = this.to[r] - this.at[r];
      if (Math.abs(d) > 0.004) { this.at[r] += d * f; moving = true; } else this.at[r] = this.to[r];
    }
    for (let k = 0; k < this.cols.length; k += 1) {
      const a = this.liftTo[k] - this.lift[k], b = this.dxTo[k] - this.dx[k];
      if (Math.abs(a) > 0.01) { this.lift[k] += a * f; moving = true; } else this.lift[k] = this.liftTo[k];
      if (Math.abs(b) > 0.01) { this.dx[k] += b * Math.min(1, dt * 18); moving = true; } else this.dx[k] = this.dxTo[k];
    }
    if (moving) this.place();
  }

  // Rows gather by their letter at column a, commonest first. Within a block, column b orders them.
  sortBy(a, b = -1) {
    const { X, L, rows, cols } = this, count = new Map(), order = rows.map((s, r) => [r, X[s * L + cols[a]], b >= 0 ? X[s * L + cols[b]] : 0]);
    for (const o of order) count.set(o[1], (count.get(o[1]) ?? 0) + 1);
    order.sort((p, q) => (count.get(q[1]) - count.get(p[1])) || (p[1] - q[1]) || (p[2] - q[2]) || (p[0] - q[0]));
    order.forEach(([r], rank) => { this.to[r] = rank; });
  }

  raise(k, h = 2.2) { this.liftTo[k] = h; }
  lower(k) { if (k >= 0) { this.liftTo[k] = 0; this.dxTo[k] = 0; } }
  settle() { this.liftTo.fill(0); this.dxTo.fill(0); }
  // Carries column k to world x.
  carry(k, x) { this.dxTo[k] = x - this.x(k); }
  // Lays column a beside column b.
  beside(a, b) { const side = b > a ? -1 : 1; this.dxTo[a] = this.x(b) + side * this.cell - this.x(a); }

  // The letter at a tile, for tests and labels.
  letter(r, k) { return LETTERS[this.X[this.rows[r] * this.L + this.cols[k]]]; }

  dispose() {
    const w = this.world;
    w.ticks.delete(this.tick);
    w.scene.remove(this.mesh, this.back);
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.back.geometry.dispose(); this.back.material.dispose();
    this.tex.dispose();
    w.shadowDirty = 3;
  }
}
