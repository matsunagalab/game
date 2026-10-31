// What every chapter shares. A chapter draws in a 390 × 640 virtual stage and reports how it ended.
import { Sparks, Buttons, text, JEWEL, VW, VH, tile, clamp, alpha } from '../kit.js';
import { atpOf, atpRate } from '../logic/cell.js';

export class Chapter {
  constructor(game) {
    this.game = game;
    this.fx = new Sparks();
    this.ui = new Buttons();
    this.t = 0;
    this.over = false;
    this.hit = null;
  }

  get sound() { return this.game.sound; }

  get stage() { return this.game.stage; }

  get cell() { return this.game.cell; }

  // The chapter's own copy of the ATP stock, which is written back when it ends.
  useATP() { this.atp = Math.min(100, atpOf(this.cell) + 8); }

  spend(n) { this.atp = Math.max(0, this.atp - n); }

  get atpPace() { return atpRate(this.atp); }

  begin() {
    const w = this.beatSpec?.();
    if (w) { this.why = { ...w, f: 0, t: 0, used: false, drag: false }; this.say(w.line(0)); } else this.start();
  }

  start() {}

  // One frame: either the short moment on why the shape changes, or the chapter itself.
  frame(dt, c) {
    if (this.why) { this.drawWhy(c, dt); this.fx.update(dt); return; }
    this.t += dt;
    this.update(dt);
    this.fx.update(dt);
    this.draw(c);
    this.fx.draw(c);
  }

  drawWhy(c, dt) {
    const w = this.why;
    w.t += dt;
    // Until a finger arrives the slider moves by itself, so the movement is seen either way.
    if (!w.used) w.f = 0.5 - 0.5 * Math.cos(Math.max(0, w.t - 0.6) * 0.9);
    this.say(w.line(w.f));
    w.draw(c, w.f, w.t);
    const y = 494; const x0 = 44; const x1 = 346;
    text(c, w.ends[0], x0, y - 22, { size: 14, align: 'left', chip: true });
    text(c, w.ends[1], x1, y - 22, { size: 14, align: 'right', chip: true });
    c.fillStyle = JEWEL.lead; c.fillRect(x0 - 2, y - 4, x1 - x0 + 4, 8);
    c.fillStyle = JEWEL.gold; c.fillRect(x0, y - 2, (x1 - x0) * w.f, 4);
    const kx = x0 + (x1 - x0) * w.f;
    tile(c, kx - 17, y - 17, 34, 34, JEWEL.gold, { r: 17, glow: 0.3 });
    this.ui.add(c, 'whyGo', 120, 530, 150, 56, 'Go on', { color: JEWEL.emerald, size: 21, on: w.t > 1.2 });
    w.x0 = x0; w.x1 = x1; w.y = y;
  }

  pointer(type, x, y, id) {
    const w = this.why;
    if (!w) { this[type](x, y, id); return; }
    if (type === 'down') {
      if (this.ui.hit(x, y) === 'whyGo') { this.why = null; this.start(); return; }
      if (Math.abs(y - w.y) < 44) { w.drag = true; w.used = true; }
    }
    if (w.drag && type !== 'up') w.f = clamp((x - w.x0) / (w.x1 - w.x0));
    if (type === 'up') w.drag = false;
  }

  // One sentence at a time.
  say(s) { this.game.say(s); }

  meters(list) { this.game.meters(list); }

  flash(v = 0.25) { this.game.rose.u.uFlash.value = Math.min(0.6, this.game.rose.u.uFlash.value + v); }

  stress(v) { this.game.rose.u.uStress.value = v; }

  buzz(ms = 10) { try { navigator.vibrate?.(ms); } catch { /* Not every phone allows it. */ } }

  // roses 0 means the chapter was lost.
  finish(roses, score, carry = {}, lost = '') {
    if (this.over) return;
    this.over = true;
    this.game.chapterDone({ roses, score, carry, lost });
  }

  update() {}

  draw() {}

  down() {}

  move() {}

  up() {}

  key() {}
}
export { text, JEWEL, VW, VH, tile, clamp, alpha };
