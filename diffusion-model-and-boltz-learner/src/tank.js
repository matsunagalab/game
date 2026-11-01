// The tank: the Ramachandran map drawn in water, with droplets that sit where real numbers put them.
import { Cloud, mixPigment } from './world.js';
import { MAP, ISLANDS } from './science/stats.js';
import { FieldTable, Mix2D } from './science/mix2d.js';
import { makeRng } from './science/rng.js';

const INK = '29, 33, 65';

// Pigment of a place on the map. Helix magenta, strand ultramarine, left-handed teal, blended smoothly.
export function placeInk(x, y, out) {
  const d = (cx, cy, w) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * w * w));
  const a = d(-65, -35, 58) + 1e-4, b = d(-100, 145, 62) + 1e-4, c = d(62, 40, 46) * 1.6 + d(60, 225, 40) + 1e-4, t = a + b + c;
  const A = a / t, B = b / t, C = c / t;
  out[0] = A * 0.16 + B * 1.15 + C * 1.15; out[1] = A * 1.2 + B * 0.86 + C * 0.26; out[2] = A * 0.5 + B * 0.16 + C * 0.42;
  return out;
}
export const MUTE = mixPigment([0.34, 0.33, 0.33]);

export class Tank {
  constructor(run, { drops = null, zoomable = true } = {}) {
    this.run = run; this.world = run.world; this.rng = makeRng(77);
    this.N = drops ?? run.world.dropCount;
    this.cloud = run.own(new Cloud(this.world, this.N));
    this.extra = [];
    this.zoom = 1; this.below = 0; this.belowMin = 0; this.belowMax = 0;
    this.showMap = true; this.labels = false; this.frameAlpha = 1;
    this.tmp = [0, 0, 0];
    this.fit(0);
    run.onLayout = () => this.fit(0.3);
    this.drawer = (g) => this.draw(g);
    this.world.overlays.add(this.drawer);
    run.own({ dispose: () => this.world.overlays.delete(this.drawer) });
    this.world.mood = { flow: 0.0007, decay: 0.84, trail: 0.5 };
    this.sx = new Float32Array(this.N); this.sy = new Float32Array(this.N);
  }

  // Fit the map plus any extra room the noise needs. Pixels kept free under the map are a chapter's own panel.
  fit(seconds = 0.6) {
    const z = this.zoom, cx = 0, cy = 80, h = 180 * z, s = this.world.stage;
    const b = this.below = s.w > s.h ? (s.h > 760 ? this.belowMax : this.belowMin) : Math.max(this.belowMin, Math.min(this.belowMax, s.h - s.w));
    const k = Math.max(Math.min((s.w - 34) / (2 * h), (s.h - b - 34) / (2 * h)), 1e-3);
    this.world.look(cx, cy - b / (2 * k), k, seconds);
  }

  // Keeps pixels under the map for a panel, between min and max as a tall stage allows. The panel's place on screen follows the stage.
  setPanel(min, seconds = 0.4, max = min) { this.belowMin = min; this.belowMax = max; this.fit(seconds); }

  get panel() {
    const s = this.world.stage, b = this.below, w = Math.min(s.w - 20, 720);
    return { x: s.x + (s.w - w) / 2, y: s.y + s.h - b - 2, w, h: b };
  }

  // The map's rectangle on screen.
  get mapRect() {
    const a = this.world.project(MAP.x0, MAP.y1), b = this.world.project(MAP.x1, MAP.y0);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

  // A brief glow round the map: the board answering a move.
  flash(good) { this.glow = { t: performance.now(), good }; }

  setZoom(z, seconds = 0.5) { if (Math.abs(z - this.zoom) > 0.001) { this.zoom = z; this.fit(seconds); } }

  // Size and darkness of droplets for a noise level. Ink keeps its mass as it spreads.
  look(sigma = 0, count = this.N, boost = 1) {
    const z = this.world.view.scale, size = 1.7 / Math.min(1, z * 0.27) * 0.42 + 0.34 * sigma;
    const m = (boost * 0.11 * (26000 / count) * 3.2) / (size * size) * (1 + sigma / 45);
    return { size, m };
  }

  // Put droplets on the map. xs, ys in degrees. Pigment follows the place, or the given guess arrays.
  paint(xs, ys, n, { sigma = 0, gx = null, gy = null, boost = 1, mute = 0, z = null } = {}) {
    const { cloud, tmp } = this, { size, m } = this.look(sigma, n, boost), { pos, ink, size: sz } = cloud;
    for (let i = 0; i < n; i += 1) {
      placeInk(gx ? gx[i] : xs[i], gy ? gy[i] : ys[i], tmp);
      pos[3 * i] = xs[i]; pos[3 * i + 1] = ys[i]; pos[3 * i + 2] = z ? z[i] : 0;
      const c = 1 - mute;
      ink[4 * i] = c * tmp[0] + mute * MUTE[0]; ink[4 * i + 1] = c * tmp[1] + mute * MUTE[1]; ink[4 * i + 2] = c * tmp[2] + mute * MUTE[2]; ink[4 * i + 3] = m;
      sz[i] = size;
    }
    cloud.commit(n);
  }

  clear() { this.cloud.commit(0); }

  draw(g) {
    if (this.showMap) this.drawMap(g);
    for (const f of this.extra) f(g, this.world);
    if (this.glow) {
      const t = (performance.now() - this.glow.t) / 650;
      if (t >= 1) this.glow = null;
      else {
        const r = this.mapRect;
        g.save();
        g.strokeStyle = this.glow.good ? `rgba(13, 138, 143, ${0.9 * (1 - t)})` : `rgba(194, 24, 91, ${0.9 * (1 - t)})`;
        g.lineWidth = 2 + 7 * (1 - t);
        g.strokeRect(r.x - 3 * t, r.y - 3 * t, r.w + 6 * t, r.h + 6 * t);
        g.restore();
      }
    }
  }

  drawMap(g) {
    const w = this.world, a = w.project(MAP.x0, MAP.y1), b = w.project(MAP.x1, MAP.y0);
    g.save();
    g.strokeStyle = `rgba(${INK}, ${0.3 * this.frameAlpha})`; g.lineWidth = 1;
    g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.fillStyle = `rgba(${INK}, ${0.62 * this.frameAlpha})`; g.font = '500 11.5px "Ysabeau Office", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    const big = b.x - a.x > 170;
    if (big) {
      for (const v of [-90, 0, 90]) {
        const p = w.project(v, MAP.y0);
        g.fillText(`${v}`, p.x, b.y + 3);
        g.beginPath(); g.moveTo(p.x, b.y); g.lineTo(p.x, b.y - 4); g.stroke();
      }
      g.textAlign = 'left'; g.textBaseline = 'middle';
      for (const v of [0, 90, 180]) {
        const p = w.project(MAP.x0, v);
        g.fillText(`${v}`, a.x + 5, p.y);
        g.beginPath(); g.moveTo(a.x, p.y); g.lineTo(a.x + 3.5, p.y); g.stroke();
      }
      g.font = 'italic 13px "Ysabeau Office", serif'; g.textAlign = 'right'; g.textBaseline = 'top';
      g.fillText('φ', b.x - 4, b.y + 3);
      g.textAlign = 'left'; g.fillText('ψ', a.x + 5, a.y + 3);
    }
    if (this.labels) {
      g.font = '700 13px "Ysabeau Office", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const l of ISLANDS) {
        const p = w.project(l.x + (l.id === 'aL' ? 0 : 0), l.y + (l.id === 'aL' ? 50 : l.id === 'aR' ? -46 : 72));
        g.lineWidth = 3; g.strokeStyle = 'rgba(247,248,245,.75)'; g.strokeText(l.name, p.x, p.y);
        g.fillStyle = `rgb(${INK})`; g.fillText(l.name, p.x, p.y);
      }
    }
    g.restore();
  }

  // A hairline arrow between two map points.
  arrow(g, x0, y0, x1, y1, color = `rgba(${INK}, .8)`, head = 6) {
    const w = this.world, a = w.project(x0, y0), b = w.project(x1, y1), t = Math.atan2(b.y - a.y, b.x - a.x);
    g.strokeStyle = color; g.fillStyle = color;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - head * Math.cos(t - 0.42), b.y - head * Math.sin(t - 0.42)); g.lineTo(b.x - head * Math.cos(t + 0.42), b.y - head * Math.sin(t + 0.42)); g.closePath(); g.fill();
  }

  ring(g, x, y, r = 11, color = `rgb(${INK})`, width = 2) {
    const p = this.world.project(x, y);
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke();
  }
}

// Fields are built once per data set and kept for the whole visit.
const tables = new Map();
export async function fieldOf(run, key, x, y, { progress = null } = {}) {
  if (tables.has(key)) return tables.get(key);
  const mix = new Mix2D(x, y).index(4), table = new FieldTable(mix, { low: 5, high: 800, levels: 20, grid: 96 });
  await run.budget(table.build(), progress, 9);
  tables.set(key, table);
  return table;
}

// Runs droplets through a sampler, a chunk of work per frame. Visible motion is the real path, step by step.
export class Pour {
  constructor(tank, n) {
    this.tank = tank; this.n = n;
    this.x = new Float64Array(n); this.y = new Float64Array(n); this.gx = new Float32Array(n); this.gy = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n);
  }

  start(rng, cx, cy, s) {
    for (let i = 0; i < this.n; i += 1) { this.x[i] = cx + s * rng.n(); this.y[i] = cy + s * rng.n(); this.gx[i] = cx; this.gy[i] = cy; }
  }

  // stepOne(p, i, k) moves point p (Float64Array(2)) for step k of the schedule and leaves the last guess in g.
  // halt() can stop a run between frames. Returns true if the run reached the end.
  async run(run, sched, stepOne, { seconds = 3, onStep = null, zoomOf = null, mute = 0, boost = 1, halt = null } = {}) {
    const { n, tank } = this, S = sched, steps = S.length - 1, p = new Float64Array(2), g = new Float64Array(2);
    const { x, y, gx, gy, px, py } = this;
    const per = (seconds * 1000) / steps;
    for (let k = 0; k < steps; k += 1) {
      if (!run.alive || halt?.()) return false;
      px.set(x); py.set(y);
      const fromG = gx.slice(), fromGy = gy.slice();
      let i = 0;
      const t0 = performance.now();
      // The work for this step, spread over frames.
      while (i < n) {
        const end = performance.now() + 7;
        do { p[0] = x[i]; p[1] = y[i]; stepOne(p, g, i, k); x[i] = p[0]; y[i] = p[1]; gx[i] = g[0]; gy[i] = g[1]; i += 1; } while (i < n && (i & 63 || performance.now() < end));
        if (i < n) await run.hold(new Promise(requestAnimationFrame));
        if (!run.alive || halt?.()) return false;
      }
      // Ease to the new positions.
      const wait = Math.max(0, per - (performance.now() - t0)), s0 = S[k], s1 = S[k + 1], b0 = Math.max(s1, 0);
      const seen = n, X = this.dx ??= new Float32Array(n), Y = this.dy ??= new Float32Array(n), GX = this.dgx ??= new Float32Array(n), GY = this.dgy ??= new Float32Array(n);
      const t1 = performance.now();
      for (;;) {
        await run.hold(new Promise(requestAnimationFrame));
        if (!run.alive || halt?.()) return false;
        const f = wait > 0 ? Math.min(1, (performance.now() - t1) / wait) : 1;
        for (let j = 0; j < seen; j += 1) { X[j] = px[j] + f * (x[j] - px[j]); Y[j] = py[j] + f * (y[j] - py[j]); GX[j] = fromG[j] + f * (gx[j] - fromG[j]); GY[j] = fromGy[j] + f * (gy[j] - fromGy[j]); }
        const s = Math.exp(Math.log(s0 + 1e-3) + f * (Math.log(b0 + 1e-3) - Math.log(s0 + 1e-3)));
        tank.paint(X, Y, seen, { sigma: s, gx: GX, gy: GY, mute: mute * Math.min(1, s / 120), boost });
        run.sound.setSigma(sigmaLevel(s));
        if (zoomOf) tank.setZoom(zoomOf(s), 0.25);
        if (f >= 1) break;
      }
      onStep?.(k, s1);
    }
    return true;
  }
}

// Noise on a 0 to 1 scale for the music: 0 is clean, 1 is the far end of the schedule.
export const sigmaLevel = (s, lo = 2, hi = 200) => Math.max(0, Math.min(1, Math.log(Math.max(s, lo) / lo) / Math.log(hi / lo)));
