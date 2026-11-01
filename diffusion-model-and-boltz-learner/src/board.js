// A board for real molecules: the molecule fitted into the water, a panel kept free under it, and the board's answer to a move.
export class Board {
  constructor(run, { span = 44 } = {}) {
    Object.assign(this, { run, world: run.world, span, below: 0, belowMin: 0, belowMax: 0, extra: [], lift: 0 });
    this.fit(0);
    run.onLayout = () => this.fit(0.3);
    this.drawer = (g) => this.draw(g);
    this.world.overlays.add(this.drawer);
    run.own({ dispose: () => this.world.overlays.delete(this.drawer) });
    this.world.mood = { flow: 0.0011, decay: 0.92, trail: 0.9 };
    run.own({ dispose: () => { this.world.mood = { flow: 0.0009, decay: 0.9, trail: 0.8 }; } });
  }

  fit(seconds = 0.4) {
    const s = this.world.stage, b = this.below = s.w > s.h ? (s.h > 760 ? this.belowMax : this.belowMin) : Math.max(this.belowMin, Math.min(this.belowMax, s.h - s.w));
    const k = Math.max(Math.min((s.w - 16) / this.span, (s.h - b - 16) / this.span), 1e-3);
    this.world.look(0, -b / (2 * k), k, seconds);
  }

  // How many Angstrom the view shows across.
  setSpan(span, seconds = 0.4) { this.span = span; this.fit(seconds); }

  setPanel(min, seconds = 0.4, max = min) { this.belowMin = min; this.belowMax = max; this.fit(seconds); }

  get panel() {
    const s = this.world.stage, b = this.below, w = Math.min(s.w - 20, 720);
    return { x: s.x + (s.w - w) / 2, y: s.y + s.h - b - 2, w, h: b };
  }

  // The part of the stage the molecule has.
  get box() { const s = this.world.stage; return { x: s.x, y: s.y, w: s.w, h: s.h - this.below }; }

  flash(good) { this.glow = { t: performance.now(), good }; }

  draw(g) {
    for (const f of this.extra) f(g, this.world);
    if (!this.glow) return;
    const t = (performance.now() - this.glow.t) / 650;
    if (t >= 1) { this.glow = null; return; }
    const r = this.box, i = 7 - 3 * t;
    g.save();
    g.strokeStyle = this.glow.good ? `rgba(13, 138, 143, ${0.8 * (1 - t)})` : `rgba(194, 24, 91, ${0.8 * (1 - t)})`;
    g.lineWidth = 2 + 6 * (1 - t);
    g.strokeRect(r.x + i, r.y + i, r.w - 2 * i, r.h - 2 * i);
    g.restore();
  }
}
