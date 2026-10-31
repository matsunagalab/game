// How often does an empty circle of radius R appear by itself in the liquid?
// Throw test points at random and note the distance to the nearest water. The fraction of points with no water
// within R is P0(R), and -kT ln P0(R) is the work of opening that hole (Hummer et al., PNAS 1996).
// No table is involved: this is read from the live water.
export class HoleMeter {
  constructor(w, perFrame = 240) {
    this.w = w;
    this.perFrame = perFrame;
    this.DR = 0.02;
    this.NB = 90;
    this.h = new Float64Array(this.NB);
    this.total = 0;
    this.watchR = 1; // The radius whose error is tracked.
    this.series = []; // Fraction of empty looks at that radius, one number per batch.
  }

  reset() { this.h.fill(0); this.total = 0; this.series = []; }

  watch(R) { this.watchR = R; this.series = []; }

  save() { return { h: this.h.slice(), total: this.total }; }

  // Takes one batch of looks. Returns the biggest hole found, so the print can show it open.
  sample() {
    const { w, h, DR, NB, perFrame } = this;
    const { L } = w;
    let top = 0, tx = 0, ty = 0;
    let found = 0;
    for (let k = 0; k < perFrame; k++) {
      const x = w.rand() * L;
      const y = w.rand() * L;
      const r = Math.sqrt(w.nearest2(x, y));
      const b = Math.floor(r / DR);
      if (b < NB) h[b]++;
      this.total++;
      if (r >= this.watchR) found++;
      if (r > top) { top = r; tx = x; ty = y; }
    }
    this.series.push(found / perFrame);
    if (this.series.length > 8000) this.series.shift();
    return { x: tx, y: ty, r: top };
  }

  // Looks that found no water within R.
  hits(R) {
    let s = 0;
    for (let b = Math.ceil(R / this.DR - 1e-9); b < this.NB; b++) s += this.h[b];
    return s;
  }

  P0(R) { return this.total ? this.hits(R) / this.total : 0; }

  price(R, T) { const p = this.P0(R); return p > 0 ? -T * Math.log(p) : Infinity; }

  // Error of the price at the watched radius. Looks in one batch are far from independent, and cold water
  // rearranges slowly, so the error is the largest found over blocks of growing length. Null until there are enough.
  priceError(T) {
    const { series } = this;
    let worst = null;
    for (const size of [30, 60, 90, 120, 180]) {
      const count = Math.floor(series.length / size);
      if (count < 4) continue;
      const blocks = [];
      for (let b = 0; b < count; b++) {
        let v = 0;
        for (let i = 0; i < size; i++) v += series[b * size + i];
        blocks.push(v / size);
      }
      const m = blocks.reduce((s, v) => s + v, 0) / count;
      if (m <= 0) continue;
      const sd = Math.sqrt(blocks.reduce((s, v) => s + (v - m) ** 2, 0) / (count - 1));
      const e = (T * sd) / Math.sqrt(count) / m;
      if (worst === null || e > worst) worst = e;
    }
    return worst;
  }
}

// Below half the closest water-water distance two waters cannot share the circle, so P0 is exact.
export const smallHole = (R, rho) => 1 - rho * Math.PI * R * R;
