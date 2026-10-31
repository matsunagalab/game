// Molecules as walkers. Inside a valley each one jitters around the bottom, spreading further when hot.
// Between valleys it hops with the exact rate of the link, so populations obey detailed balance.
import { RT } from './chem.js';

export const WALKERS = 1400;

export class World {
  constructor() {
    this.wells = [];
    this.links = [];
    this.T = 298;
    this.active = 1; // Scales every rate, for an enzyme that is losing activity.
    this.frozen = false;
  }

  // Exact forward and backward rates of a link, per second of game time.
  rates(l) {
    const a = this.wells[l.a];
    const b = this.wells[l.b];
    const rt = RT(this.T);
    let kf;
    let kb;
    if (l.kf !== undefined) {
      kf = l.kf;
      kb = l.kb ?? 0;
    } else if (l.Gts !== undefined) {
      kf = l.nu * Math.exp(-(l.Gts - a.G) / rt);
      kb = l.nu * Math.exp(-(l.Gts - b.G) / rt);
    } else {
      const d = (b.G - a.G) / rt;
      kf = l.nu * Math.min(1, Math.exp(-d));
      kb = l.nu * Math.min(1, Math.exp(d));
    }
    const drive = Math.exp(l.drive ?? 0);
    return [kf * drive * this.active, kb * this.active];
  }
}

const gauss = () => {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * Math.random());
};

export class Swarm {
  constructor(n, wellCount) {
    this.cap = n;
    this.n = n;
    this.state = new Uint8Array(n);
    this.from = new Uint8Array(n);
    this.link = new Int16Array(n).fill(-1);
    this.prog = new Float32Array(n);
    this.ox = new Float32Array(n);
    this.oy = new Float32Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.tint = new Float32Array(n);
    this.counts = new Float64Array(5);
    this.smooth = new Float64Array(5);
    this.wellCount = wellCount;
    this.onCross = null;
  }

  // Place walkers by fractions, so a view can open already at equilibrium.
  seed(fractions, world) {
    let k = 0;
    fractions.forEach((f, i) => {
      const m = i === fractions.length - 1 ? this.cap - k : Math.round(f * this.cap);
      for (let j = 0; j < m && k < this.cap; j++, k++) {
        this.state[k] = i;
        this.link[k] = -1;
        this.ox[k] = gauss() * 0.1;
        this.oy[k] = gauss() * 0.1;
        this.tint[k] = i;
      }
    });
    // Shuffle so a lone walker or a small count is not all one colour.
    for (let i = this.cap - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = this.state[i]; this.state[i] = this.state[j]; this.state[j] = t;
      this.tint[i] = this.state[i]; this.tint[j] = this.state[j];
    }
    this.wellCount = world.wells.length;
    this.smooth.fill(0);
    this.count(1);
  }

  // Walkers on a pass belong to neither valley. Counting only the settled ones keeps the ratio exact.
  count(blend) {
    this.counts.fill(0);
    let settled = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.link[i] >= 0) continue;
      this.counts[this.state[i]] += 1;
      settled += 1;
    }
    if (!settled) return;
    for (let i = 0; i < 5; i++) this.smooth[i] += (this.counts[i] / settled - this.smooth[i]) * blend;
  }

  step(dt, world) {
    const { wells, links, T } = world;
    const rt = RT(T);
    // Rates out of each state, as [link, target, rate].
    const out = wells.map(() => []);
    if (!world.frozen) {
      links.forEach((l, i) => {
        const [kf, kb] = world.rates(l);
        out[l.a].push([i, l.b, kf]);
        if (kb > 0) out[l.b].push([i, l.a, kb]);
      });
    }
    const relax = Math.exp(-dt * 7);
    const kick = Math.sqrt(1 - relax * relax);
    for (let i = 0; i < this.n; i++) {
      const st = this.state[i];
      const w = wells[st];
      const sd = Math.sqrt(rt / (w.k ?? 14)) * 0.82;
      this.ox[i] = this.ox[i] * relax + sd * kick * gauss();
      this.oy[i] = this.oy[i] * relax + sd * kick * gauss();
      if (this.link[i] >= 0) {
        this.prog[i] += dt * (world.hop ?? 2.4);
        const a = wells[this.from[i]];
        const b = w;
        const p = Math.min(1, this.prog[i]);
        const s = p * p * (3 - 2 * p);
        this.px[i] = a.x + (b.x - a.x) * s + this.ox[i];
        this.py[i] = a.y + (b.y - a.y) * s + this.oy[i];
        if (p > 0.5) this.tint[i] = st;
        if (p >= 1) this.link[i] = -1;
        continue;
      }
      this.px[i] = w.x + this.ox[i];
      this.py[i] = w.y + this.oy[i];
      // Pick whether to hop from the total rate, then where, in proportion to each rate.
      const paths = out[st];
      let total = 0;
      for (let j = 0; j < paths.length; j++) total += paths[j][2];
      if (Math.random() >= 1 - Math.exp(-total * dt)) continue;
      let r = Math.random() * total;
      for (const [li, to, k] of paths) {
        r -= k;
        if (r <= 0) {
          this.state[i] = to;
          this.from[i] = st;
          this.link[i] = li;
          this.prog[i] = 0;
          this.onCross?.(st, to, li);
          break;
        }
      }
    }
    this.count(Math.min(1, dt * 5));
  }
}
