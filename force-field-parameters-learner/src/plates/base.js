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
