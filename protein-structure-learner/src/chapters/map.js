// The Ramachandran Archipelago: the map of allowed backbone angles, drawn as a chart.
// Land is what hard atoms allow, sea is where they collide. Fog lifts wherever the player sails.
import rama from '../data/rama.json';
import { $ } from '../ui.js';

const INK = { pink: [255, 74, 158], yellow: [255, 210, 31], blue: [31, 42, 166], sea: [214, 240, 238] };
const N = rama.cells;

const blur = (src, radius) => {
  const out = new Float32Array(src.length);
  const pass = (from, to, dx, dy) => {
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += from[((j + k * dy + N) % N) * N + ((i + k * dx + N) % N)];
        to[j * N + i] = s / (2 * radius + 1);
      }
  };
  const tmp = new Float32Array(src.length);
  pass(src, tmp, 1, 0);
  pass(tmp, out, 0, 1);
  return out;
};

const fieldCache = new Map();
function fields(kind) {
  if (fieldCache.has(kind)) return fieldCache.get(kind);
  const row = rama[kind];
  const land = new Float32Array(N * N);
  const core = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    land[i] = row.charCodeAt(i) >= 49 ? 1 : 0;
    core[i] = row.charCodeAt(i) >= 50 ? 1 : 0;
  }
  const f = { land: blur(land, 1), core: blur(core, 1), far: blur(blur(land, 3), 3) };
  let count = 0;
  for (let i = 0; i < N * N; i++) if (land[i]) count++;
  f.landShare = count / (N * N);
  fieldCache.set(kind, f);
  return f;
}

const sample = (f, x, y) => {
  // x and y in cell units, wrapping around the torus.
  const fx = x - 0.5;
  const fy = y - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const at = (a, b) => f[((b + N) % N) * N + ((a + N) % N)];
  return (
    at(ix, iy) * (1 - tx) * (1 - ty) + at(ix + 1, iy) * tx * (1 - ty) +
    at(ix, iy + 1) * (1 - tx) * ty + at(ix + 1, iy + 1) * tx * ty
  );
};

function paintBase(canvas, kind, ratio) {
  const px = canvas.width;
  const g = canvas.getContext('2d');
  const img = g.createImageData(px, px);
  const d = img.data;
  const f = fields(kind);
  const k = N / px;
  const cell = 3.2 * ratio;
  const a1 = 0.78;
  const c1 = Math.cos(a1);
  const s1 = Math.sin(a1);
  const c2 = Math.cos(0.26);
  const s2 = Math.sin(0.26);
  const levels = [0.34, 0.2, 0.09];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const cx = x * k;
      const cy = (px - 1 - y) * k;
      const land = sample(f.land, cx, cy);
      const i = (y * px + x) * 4;
      let r, gr, b;
      if (land > 0.5) {
        const core = sample(f.core, cx, cy);
        [r, gr, b] = INK.yellow;
        const u = ((x * c2 - y * s2) / cell) % 1;
        const v = ((x * s2 + y * c2) / cell) % 1;
        const du = (u < 0 ? u + 1 : u) - 0.5;
        const dv = (v < 0 ? v + 1 : v) - 0.5;
        if (core > 0.5 && du * du + dv * dv < 0.2) {
          r = 255;
          gr = 92;
          b = 40;
        }
      } else {
        [r, gr, b] = INK.sea;
        const u = ((x * c1 - y * s1) / cell) % 1;
        const v = ((x * s1 + y * c1) / cell) % 1;
        const du = (u < 0 ? u + 1 : u) - 0.5;
        const dv = (v < 0 ? v + 1 : v) - 0.5;
        if (du * du + dv * dv < 0.05) {
          r = 120;
          gr = 150;
          b = 214;
        }
        const far = sample(f.far, cx, cy);
        for (const l of levels) {
          if (Math.abs(far - l) < 0.0065 * (1 + l * 4)) {
            [r, gr, b] = INK.blue;
          }
        }
      }
      if (Math.abs(land - 0.5) < 0.09) [r, gr, b] = INK.blue;
      d[i] = r;
      d[i + 1] = gr;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Grid, every 60 degrees, like lines of longitude.
  g.strokeStyle = 'rgba(31,42,166,.34)';
  g.lineWidth = 1 * ratio;
  g.setLineDash([3 * ratio, 4 * ratio]);
  for (let i = 1; i < 6; i++) {
    const p = Math.round((i / 6) * px) + 0.5;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, px);
    g.moveTo(0, p);
    g.lineTo(px, p);
    g.stroke();
  }
  g.setLineDash([]);
  g.fillStyle = '#1f2aa6';
  g.font = `italic 600 ${Math.max(11, px / ratio / 26) * ratio}px Bricolage, sans-serif`;
  g.textAlign = 'center';
  if (kind === 'A') g.fillText('Here be clashes', px * 0.72, px * 0.78);
  if (kind === 'P') g.fillText('Proline: φ is stuck', px * 0.68, px * 0.5);
  if (kind === 'G') g.fillText('Glycine sails anywhere', px * 0.5, px * 0.53);
}

export const PLACES = {
  alpha: { name: 'α helix', phi: -60, psi: -45, r: 20 },
  beta: { name: 'β strand', phi: -125, psi: 135, r: 28 },
  ppii: { name: 'polyproline II', phi: -75, psi: 145, r: 12 },
  left: { name: 'left-handed α', phi: 57, psi: 42, r: 15 },
  three10: { name: '3₁₀ helix', phi: -49, psi: -24, r: 9 },
  straight: { name: 'fully straight', phi: 180, psi: 180, r: 16 },
};

export const landShare = (kind) => fields(kind).landShare;

export class IslandMap {
  constructor(parent, { kind = 'A', fogged = true } = {}) {
    this.el = $('div', 'map');
    this.ratio = Math.min(2, devicePixelRatio || 1);
    this.base = $('canvas');
    this.fog = $('canvas');
    this.top = $('canvas');
    this.el.append(this.base, this.fog, this.top);
    this.readout = $('div', 'readout');
    this.el.append(this.readout);
    parent.append(this.el);
    this.kind = kind;
    this.fogged = fogged;
    this.size = 0;
    this.phi = 0;
    this.psi = 0;
    this.flags = [];
    this.found = [];
    this.locked = null;
    this.visited = new Uint8Array(36 * 36);
    this.bases = new Map();
    this.onMove = null;
    const toAngles = (e) => {
      const r = this.top.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      return [x * 360 - 180, (1 - y) * 360 - 180];
    };
    this.el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.el.setPointerCapture?.(e.pointerId);
      this.onMove?.(...toAngles(e), true);
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.onMove?.(...toAngles(e), true);
    });
    const up = () => {
      if (this.dragging) this.onRelease?.();
      this.dragging = false;
    };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'application');
    this.el.setAttribute('aria-label', 'Ramachandran map. Use arrow keys to steer.');
    this.el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 15 : 5;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (!d) return;
      e.preventDefault();
      this.onMove?.(this.phi + d[0], this.psi + d[1], true);
      this.onRelease?.();
    });
  }

  layout(x, y, size) {
    const s = Math.round(size);
    Object.assign(this.el.style, { left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s}px` });
    if (s === this.size) return;
    this.size = s;
    this.bases.clear();
    const px = s * this.ratio;
    for (const c of [this.base, this.fog, this.top]) {
      c.width = c.height = px;
    }
    this.drawBase();
    this.resetFog();
    this.drawTop();
  }

  drawBase() {
    const px = this.size * this.ratio;
    let c = this.bases.get(this.kind);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = px;
      paintBase(c, this.kind, this.ratio);
      this.bases.set(this.kind, c);
    }
    const g = this.base.getContext('2d');
    g.drawImage(c, 0, 0);
  }

  setKind(kind) {
    this.kind = kind;
    if (this.size) {
      this.drawBase();
      this.drawTop();
    }
  }

  resetFog() {
    const g = this.fog.getContext('2d');
    const px = this.fog.width;
    g.globalCompositeOperation = 'source-over';
    if (!this.fogged) {
      g.clearRect(0, 0, px, px);
      return;
    }
    g.fillStyle = '#1f2aa6';
    g.fillRect(0, 0, px, px);
    g.strokeStyle = 'rgba(255,255,255,.2)';
    g.lineWidth = this.ratio;
    g.setLineDash([3 * this.ratio, 4 * this.ratio]);
    for (let i = 1; i < 6; i++) {
      const p = Math.round((i / 6) * px) + 0.5;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, px);
      g.moveTo(0, p);
      g.lineTo(px, p);
      g.stroke();
    }
    g.setLineDash([]);
    for (let j = 0; j < 36; j++)
      for (let i = 0; i < 36; i++) if (this.visited[j * 36 + i]) this.brush(-175 + i * 10, -175 + j * 10, 9);
  }

  brush(phi, psi, deg) {
    const g = this.fog.getContext('2d');
    const px = this.fog.width;
    const r = (deg / 360) * px;
    const stamp = (x, y) => {
      const grad = g.createRadialGradient(x, y, r * 0.55, x, y, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    g.globalCompositeOperation = 'destination-out';
    const x = ((phi + 180) / 360) * px;
    const y = (1 - (psi + 180) / 360) * px;
    stamp(x, y);
    // The map wraps: sailing off one edge reappears on the other.
    if (x < r) stamp(x + px, y);
    if (x > px - r) stamp(x - px, y);
    if (y < r) stamp(x, y + px);
    if (y > px - r) stamp(x, y - px);
    g.globalCompositeOperation = 'source-over';
  }

  reveal(phi, psi) {
    if (!this.fogged) return;
    this.brush(phi, psi, 24);
    const R = 2;
    const ci = Math.floor((phi + 180) / 10);
    const cj = Math.floor((psi + 180) / 10);
    for (let j = -R; j <= R; j++)
      for (let i = -R; i <= R; i++) {
        if (i * i + j * j > R * R) continue;
        this.visited[((cj + j + 36) % 36) * 36 + ((ci + i + 36) % 36)] = 1;
      }
  }

  coverage() {
    let c = 0;
    for (const v of this.visited) c += v;
    return c / this.visited.length;
  }

  setCursor(phi, psi) {
    this.phi = phi;
    this.psi = psi;
    const sign = (v) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v))}°`;
    this.readout.textContent = `φ ${sign(phi)}   ψ ${sign(psi)}`;
    this.drawTop();
  }

  mark(place) {
    if (!this.found.includes(place)) this.found.push(place);
    this.drawTop();
  }

  drawTop() {
    if (!this.size) return;
    const g = this.top.getContext('2d');
    const r = this.ratio;
    const S = this.size;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, S, S);
    const toX = (phi) => ((phi + 180) / 360) * S;
    const toY = (psi) => (1 - (psi + 180) / 360) * S;

    g.font = `700 ${Math.max(12, S / 25)}px Bricolage, sans-serif`;
    g.textBaseline = 'middle';
    for (const p of this.found) {
      const x = toX(p.phi);
      const y = toY(p.psi);
      g.fillStyle = '#1f2aa6';
      g.beginPath();
      g.arc(x, y, 3, 0, 7);
      g.fill();
      const onRight = x < S * 0.7;
      g.textAlign = onRight ? 'left' : 'right';
      const tx = x + (onRight ? 7 : -7);
      g.lineWidth = 3.5;
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,.92)';
      g.strokeText(p.name, tx, y);
      g.fillText(p.name, tx, y);
    }
    for (const f of this.flags) {
      const x = toX(f.phi);
      const y = toY(f.psi);
      g.strokeStyle = '#ff4a9e';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, 9, 0, 7);
      g.stroke();
      g.textAlign = 'center';
      g.fillStyle = '#1f2aa6';
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(255,255,255,.92)';
      g.strokeText(f.label, x, y - 17);
      g.fillText(f.label, x, y - 17);
    }
    if (this.locked !== null) {
      const x = toX(this.locked);
      g.strokeStyle = '#ff4a9e';
      g.lineWidth = 2;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, S);
      g.stroke();
      g.setLineDash([]);
    }
    const x = toX(this.phi);
    const y = toY(this.psi);
    g.lineWidth = 2.5;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, 12, 0, 7);
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = '#ff4a9e';
    g.beginPath();
    g.arc(x, y, 9, 0, 7);
    g.stroke();
    g.fillStyle = '#ff4a9e';
    g.beginPath();
    g.arc(x, y, 3, 0, 7);
    g.fill();
  }

  dispose() {
    this.el.remove();
  }
}
