// The shared drawing kit: the virtual stage, cloisonné molecules from PDB beads, tiles, buttons and sparks.
import { MOL, MORPH } from './molecules.js';

export const VW = 390;
export const VH = 640;
export const JEWEL = {
  ruby: '#d0304a', cobalt: '#3163d8', emerald: '#22a35f', amber: '#e3a02f', violet: '#8446c4', teal: '#18a7a3',
  rose: '#e2589c', gold: '#f2cc6a', sky: '#62b1ec', vellum: '#efe6d0', slate: '#6d7690', orange: '#e8742a', lead: '#0b0a11',
};
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { const x = clamp(t); return x * x * (3 - 2 * x); };
export const back = (t) => { const x = clamp(t) - 1; return 1 + 2.4 * x * x * x + 1.4 * x * x; };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (l) => l[Math.floor(Math.random() * l.length)];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const shade = (h, k) => {
  const c = hex(h).map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(',')})`;
};
export const alpha = (h, a) => `rgba(${hex(h).join(',')},${a})`;

const decoded = {};
function beads(name) {
  if (decoded[name]) return decoded[name];
  const m = MOL[name];
  if (!m) throw new Error(`no molecule ${name}`);
  const bin = atob(m.d);
  const a = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  let off = 0;
  const groups = m.g.map(([n, r]) => {
    const list = [];
    for (let i = 0; i < n; i++, off += 3) list.push([a[off] * m.s, -a[off + 1] * m.s, a[off + 2] * m.s]);
    return { list, r };
  });
  const all = groups.flatMap((g) => g.list);
  const ext = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  return (decoded[name] = { groups, ext, pts: m.p ?? {} });
}

// Size in Å of a molecule, so that scenes can stay to scale.
export function extent(name) {
  const { ext } = beads(name);
  return { w: ext[1] - ext[0], h: ext[3] - ext[2], cx: (ext[0] + ext[1]) / 2, cy: (ext[2] + ext[3]) / 2 };
}
export const anchor = (name, key) => { const p = beads(name).pts[key]; return p ? [p[0], -p[1], p[2]] : null; };

// Two real conformations of one molecule, bead for bead.
const morphs = {};
function morphBeads(name) {
  if (morphs[name]) return morphs[name];
  const m = MORPH[name];
  const read = (b64) => { const bin = atob(b64); const a = new Int8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  const A = read(m.a); const B = read(m.b);
  let off = 0;
  morphs[name] = m.g.map(([n, r]) => {
    const list = [];
    for (let i = 0; i < n; i++, off += 3) list.push([A[off] * m.s, -A[off + 1] * m.s, A[off + 2] * m.s, B[off] * m.s, -B[off + 1] * m.s, B[off + 2] * m.s]);
    return { list, r };
  });
  return morphs[name];
}

let streaks = null;
function streakTile() {
  if (streaks) return streaks;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.025})`;
    g.lineWidth = 0.5 + Math.random() * 2.2;
    const y = Math.random() * 128;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(40, y + rand(-6, 6), 80, y + rand(-6, 6), 128, y);
    g.stroke();
  }
  streaks = c;
  return c;
}

const sprites = new Map();
export const clearSprites = () => sprites.clear();

// A flat outlined molecule in the manner of David Goodsell, lit from behind like enamel on glass.
// px: canvas pixels per Å. colors: one per bead group.
export function sprite(name, colors, px, lead = JEWEL.lead) {
  const key = `${name}|${colors.join()}|${px.toFixed(3)}`;
  if (sprites.has(key)) return sprites.get(key);
  const { groups, ext } = beads(name);
  const pad = 9;
  const w = Math.ceil((ext[1] - ext[0]) + pad * 2);
  const h = Math.ceil((ext[3] - ext[2]) + pad * 2);
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.ceil(w * px));
  cv.height = Math.max(2, Math.ceil(h * px));
  const g = cv.getContext('2d');
  g.scale(px, px);
  g.translate(pad - ext[0], pad - ext[2]);
  const order = groups.map((gr, i) => ({ gr, i, z: gr.list.reduce((s, p) => s + p[2], 0) / (gr.list.length || 1) })).sort((a, b) => a.z - b.z);
  const allZ = groups.flatMap((gr) => gr.list.map((p) => p[2]));
  const zLo = Math.min(...allZ);
  const zHi = Math.max(...allZ);
  const circles = (list, r) => {
    const p = new Path2D();
    for (const b of list) { p.moveTo(b[0] + r, b[1]); p.arc(b[0], b[1], r, 0, 6.2832); }
    return p;
  };
  const LEVELS = 5;
  const line = 1.5;
  for (const { gr, i } of order) {
    const base = colors[i % colors.length];
    if (!base) continue;
    g.fillStyle = lead;
    g.fill(circles(gr.list, gr.r + line));
    // Back to front: the near beads are paler, as in a flat watercolour wash.
    const sorted = [...gr.list].sort((a, b) => a[2] - b[2]);
    for (let l = 0; l < LEVELS; l++) {
      const part = sorted.slice(Math.floor(sorted.length * l / LEVELS), Math.ceil(sorted.length * (l + 1) / LEVELS));
      if (!part.length) continue;
      const zm = (part[0][2] - zLo) / (zHi - zLo || 1);
      g.fillStyle = shade(base, -0.34 + zm * 0.5);
      g.fill(circles(part, gr.r * (0.9 + 0.1 * zm)));
    }
  }
  // Light through the glass: a soft pool from the upper left, then blown streaks.
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const pool = g.createRadialGradient(cv.width * 0.34, cv.height * 0.28, 0, cv.width * 0.5, cv.height * 0.5, Math.max(cv.width, cv.height) * 0.72);
  pool.addColorStop(0, 'rgba(255,245,215,.3)');
  pool.addColorStop(0.5, 'rgba(255,245,215,0)');
  pool.addColorStop(1, 'rgba(8,6,20,.34)');
  g.fillStyle = pool;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = g.createPattern(streakTile(), 'repeat');
  g.fillRect(0, 0, cv.width, cv.height);
  g.globalCompositeOperation = 'source-over';
  const out = { cv, ox: (pad - ext[0]) * px, oy: (pad - ext[2]) * px, px };
  sprites.set(key, out);
  return out;
}

export class Stage {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.resize();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.w = w;
    this.h = h;
    const wide = w >= 900 && w >= h;
    const short = h <= 480;
    const top = 60;
    const bottom = wide || short ? 8 : 138;
    const right = wide ? 430 : short ? w * 0.48 : 0;
    const availW = w - right;
    const availH = h - top - bottom;
    this.s = Math.min(availW / VW, availH / VH);
    this.ox = (availW - VW * this.s) / 2;
    this.oy = top + (availH - VH * this.s) / 2;
    this.left = -this.ox / this.s;
    this.right = (w - this.ox) / this.s;
    this.topEdge = -this.oy / this.s;
    this.bottomEdge = (h - this.oy) / this.s;
    clearSprites();
  }

  clear() { this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.clearRect(0, 0, this.cv.width, this.cv.height); }

  enter() { const k = this.s * this.dpr; this.c.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr); }

  toVirtual(px, py) { return { x: (px - this.ox) / this.s, y: (py - this.oy) / this.s }; }

  // k is the scale in virtual units per Å.
  mol(name, x, y, { k = 1, rot = 0, colors, a = 1, flip = false } = {}) {
    if (!(k > 0) || !Number.isFinite(x + y)) return;
    const s = sprite(name, colors, k * this.s * this.dpr);
    const { c } = this;
    const scale = 1 / (this.s * this.dpr);
    c.save();
    c.translate(x, y);
    if (rot) c.rotate(rot);
    if (flip) c.scale(-1, 1);
    c.scale(scale, scale);
    c.globalAlpha *= a;
    c.drawImage(s.cv, -s.ox, -s.oy);
    c.restore();
  }
}

// Drawn live, so a little plainer than a sprite. f runs from the first conformation to the second.
Stage.prototype.morph = function morph(name, f, x, y, { k = 1, rot = 0, colors, a = 1 } = {}) {
  const { c } = this;
  c.save();
  c.translate(x, y);
  if (rot) c.rotate(rot);
  c.scale(k, k);
  c.globalAlpha *= a;
  morphBeads(name).forEach((g, i) => {
    const col = colors[i % colors.length];
    if (!col) return;
    const dots = g.list.map((b) => [b[0] + (b[3] - b[0]) * f, b[1] + (b[4] - b[1]) * f, b[2] + (b[5] - b[2]) * f]);
    const zs = dots.map((d) => d[2]).sort((p, q) => p - q);
    const mid = zs[Math.floor(zs.length / 2)];
    const pass = (r, fill, keep) => {
      c.beginPath();
      for (const d of dots) if (keep(d)) { c.moveTo(d[0] + r, d[1]); c.arc(d[0], d[1], r, 0, 6.2832); }
      c.fillStyle = fill;
      c.fill();
    };
    pass(g.r + 1.1, JEWEL.lead, () => true);
    pass(g.r, shade(col, -0.18), (d) => d[2] < mid);
    pass(g.r * 0.96, shade(col, 0.12), (d) => d[2] >= mid);
  });
  c.restore();
};

export function text(c, str, x, y, { size = 15, color = JEWEL.vellum, align = 'center', italic = false, chip = false, base = 'middle' } = {}) {
  c.font = `${italic ? 'italic ' : ''}${size}px "IM Fell English", Georgia, serif`;
  c.textAlign = align;
  c.textBaseline = base;
  if (chip) {
    const w = c.measureText(str).width + 10;
    const lx = align === 'center' ? x - w / 2 : align === 'right' ? x - w + 5 : x - 5;
    c.fillStyle = 'rgba(11,10,17,.74)';
    c.fillRect(lx, y - size * 0.72, w, size * 1.44);
  }
  c.fillStyle = color;
  c.fillText(str, x, y);
}

export function tile(c, x, y, w, h, color, { lead = 2, r = 4, glow = 0 } = {}) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = JEWEL.lead;
  c.fill();
  c.beginPath();
  c.roundRect(x + lead, y + lead, w - lead * 2, h - lead * 2, Math.max(1, r - 1));
  const g = c.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, shade(color, 0.3 + glow * 0.4));
  g.addColorStop(0.55, shade(color, glow * 0.4));
  g.addColorStop(1, shade(color, -0.3 + glow * 0.4));
  c.fillStyle = g;
  c.fill();
}

export class Buttons {
  constructor() { this.list = []; }
  begin() { this.list = []; }
  add(c, id, x, y, w, h, label, { color = JEWEL.slate, size = 18, on = true, sub = '', glow = 0, ink = '#fff8e6' } = {}) {
    c.globalAlpha = on ? 1 : 0.42;
    tile(c, x, y, w, h, color, { lead: 2.5, r: 6, glow });
    text(c, label, x + w / 2, y + h / 2 + (sub ? -7 : 1), { size, color: ink });
    if (sub) text(c, sub, x + w / 2, y + h / 2 + 11, { size: 12.5, color: ink });
    c.globalAlpha = 1;
    if (on) this.list.push({ id, x, y, w, h });
  }
  hit(x, y) {
    const pad = 6;
    return this.list.find((b) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad)?.id ?? null;
  }
}

export class Sparks {
  constructor() { this.list = []; this.text = []; }
  burst(x, y, color, n = 10, v = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const s = v * (0.3 + Math.random());
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, color, r: rand(1.4, 3.2) });
    }
  }
  float(x, y, str, color = JEWEL.gold, size = 17) { this.text.push({ x, y, str, color, size, life: 1.1 }); }
  update(dt) {
    for (const s of this.list) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy *= 0.97; s.life -= dt; }
    this.list = this.list.filter((s) => s.life > 0);
    for (const t of this.text) { t.y -= 26 * dt; t.life -= dt; }
    this.text = this.text.filter((t) => t.life > 0);
  }
  draw(c) {
    for (const s of this.list) {
      c.globalAlpha = clamp(s.life / s.max);
      c.fillStyle = s.color;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, 6.2832);
      c.fill();
    }
    c.globalAlpha = 1;
    for (const t of this.text) {
      c.globalAlpha = clamp(t.life * 2);
      text(c, t.str, t.x, t.y, { size: t.size, color: t.color, chip: true });
    }
    c.globalAlpha = 1;
  }
}

// A lipid bilayer in glass: two rows of gold heads with a lead seam down the middle.
export function bilayer(c, stage, y, h, color = '#d8b25a', phase = 0) {
  const l = stage.left - 10;
  const r = stage.right + 10;
  c.fillStyle = 'rgba(70,52,16,.72)';
  c.fillRect(l, y, r - l, h);
  const step = 11;
  for (const [row, dir] of [[y + 5, 1], [y + h - 5, -1]]) {
    for (let x = l; x < r; x += step) {
      const wob = Math.sin(x * 0.31 + phase + row) * 1.2;
      c.beginPath();
      c.arc(x, row + wob, 5.2, 0, 6.2832);
      c.fillStyle = JEWEL.lead;
      c.fill();
      c.beginPath();
      c.arc(x, row + wob, 3.9, 0, 6.2832);
      c.fillStyle = color;
      c.fill();
      c.strokeStyle = 'rgba(232,195,106,.28)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(x - 1.5, row + 5 * dir);
      c.lineTo(x - 1.5 + wob * 0.6, row + (h / 2 - 7) * dir);
      c.moveTo(x + 1.5, row + 5 * dir);
      c.lineTo(x + 1.5 - wob * 0.6, row + (h / 2 - 7) * dir);
      c.stroke();
    }
  }
}
