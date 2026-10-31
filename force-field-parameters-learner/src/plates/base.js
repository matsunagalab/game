import { Panel } from '../panel.js';

export class Plate {
  constructor(game, meta) {
    this.game = game; this.meta = meta;
    this.stage = game.stage; this.ui = game.ui; this.sound = game.sound; this.root = game.stage.root;
    this.time = 0;
  }
  enter() {}
  update() {}
  exit() {}
  down() { return false; }
  move() {}
  up() {}
  usePanel() { this.panel = new Panel(); return this.panel; }
  // Called from Game.layout with the free rectangle. Returns stage insets, or nothing for the default.
  arrange() {}
  // Portrait: the specimen above, the chart below. Wide: specimen left, chart right.
  split(F, share = 0.55) {
    const w = F.right - F.left, h = F.bottom - F.top, W = innerWidth, H = innerHeight;
    if (w > h * 1.15) {
      const cw = Math.round(w * share);
      this.panel.place({ x: F.right - cw - 8, y: F.top, w: cw, h });
      return { top: F.top, bottom: H - F.bottom, left: F.left, right: W - (F.right - cw - 16) };
    }
    const ch = Math.round(h * share);
    this.panel.place({ x: F.left + 8, y: F.bottom - ch, w: w - 16, h: ch });
    return { top: F.top, bottom: H - (F.bottom - ch - 6), left: F.left, right: W - F.right };
  }
  // Only the chart, centred and as large as it fits. A square option keeps maps square.
  fill(F, square = false) {
    let x = F.left + 6, y = F.top, w = F.right - F.left - 12, h = F.bottom - F.top;
    if (square) { const s = Math.min(w, h); x += (w - s) / 2; y += (h - s) / 2; w = h = s; }
    this.panel.place({ x, y, w, h });
  }
  // Runs step() until the time budget for this frame is gone, so slow phones simulate less, not jerkily.
  budget(ms, max, step) {
    const end = performance.now() + (this.game.mobile ? ms * 0.7 : ms);
    let n = 0;
    while (n < max) {
      step();
      n++;
      if ((n & 1) === 0 && performance.now() > end) break;
    }
    return n;
  }
  near(x, y, world, px = 56) {
    const v = this.stage.tmp ??= this.stage.camera.position.clone();
    const p = this.stage.project(v.set(...world), v);
    return Math.hypot(p.x - x, p.y - y) < px;
  }
}
