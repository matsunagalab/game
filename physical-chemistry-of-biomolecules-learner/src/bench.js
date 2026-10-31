// The bench: one experiment at a time, written as a plain async script.
// An experiment says one thing, asks one thing, runs its simulation with each(), draws with draw().
// Leaving the screen rejects whatever the script is waiting on, so scripts need no clean-up code.
const $ = (id) => document.getElementById(id);
export class Abort extends Error {}

// Small tags beside each readout, so the player always knows what kind of number this is.
const stamp = (name, label) => `<i class="tg ${name}">${label}</i>`;
export const LIVE = stamp('live', 'live');
export const STORED = stamp('stored', 'long run');
export const EXACT = stamp('exact', 'exact');
export const TOY = stamp('toy', 'toy');
export const LIT = stamp('lit', 'measured');

const toUnit = (c, v) => (c.log ? Math.log(v / c.min) / Math.log(c.max / c.min) : (v - c.min) / (c.max - c.min));
const fromUnit = (c, t) => (c.log ? c.min * (c.max / c.min) ** t : c.min + (c.max - c.min) * t);

// Spends a fixed slice of each frame on simulation, whatever the device.
export class Pace {
  constructor(ms = 5) { this.ms = ms; this.cost = 0.2; this.limit = 80; }

  // Runs fn(count) with as many steps as fit in the budget.
  run(fn, room = 1) {
    const n = Math.max(1, Math.min(this.limit, Math.round((this.ms * room) / this.cost)));
    const t0 = performance.now();
    fn(n);
    const c = (performance.now() - t0) / n;
    if (c > 0) this.cost += (c - this.cost) * 0.1;
    return n;
  }
}

export class Bench {
  constructor(game) {
    this.game = game;
    this.alive = true;
    this.ticks = [];
    this.draws = [];
    this.overs = [];
    this.charts = [];
    this.reader = null;
    this.drag = null;
    this.pending = new Set();
    this.waiters = [];
    this.L = 10;
    this.flags = {}; // Free store for what the bot and the seals look at.
    this.t = 0;
    this.pace = new Pace(5);
    this.sliders = [];
  }

  // Life cycle ---------------------------------------------------------------------------------
  stop() {
    this.alive = false;
    this.waiters = [];
    for (const rej of this.pending) rej(new Abort());
    this.pending.clear();
    $('ctrl').replaceChildren();
    $('sunpad').hidden = true;
  }

  guard(run) {
    return new Promise((resolve, reject) => {
      if (!this.alive) { reject(new Abort()); return; }
      this.pending.add(reject);
      run((v) => { this.pending.delete(reject); resolve(v); });
    });
  }

  tick(dt) {
    this.t += dt;
    for (const f of this.ticks) f(dt);
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      if (this.waiters[i](dt)) this.waiters.splice(i, 1);
    }
  }

  // Script verbs -------------------------------------------------------------------------------
  say(text) { $('say').textContent = text; }

  clear() { $('ctrl').replaceChildren(); $('ctrl').className = ''; this.sliders = []; }

  each(fn) { this.ticks.push(fn); return fn; }

  drop(fn) { this.ticks = this.ticks.filter((f) => f !== fn); this.draws = this.draws.filter((f) => f !== fn); this.overs = this.overs.filter((f) => f !== fn); }

  draw(fn) { this.draws.push(fn); return fn; }

  over(fn) { this.overs.push(fn); return fn; }

  chart(fn) {
    const c = $('chart');
    c.hidden = !fn;
    this.charts = fn ? [fn] : [];
    this.game.layout();
  }

  read(fn) { this.reader = fn; if (!fn) $('read').textContent = ''; }

  wait(seconds) {
    return this.guard((done) => {
      let left = seconds;
      this.waiters.push((dt) => { left -= dt; if (left <= 0) { done(); return true; } return false; });
    });
  }

  // Waits until fn stays true for hold seconds.
  until(fn, hold = 0) {
    return this.guard((done) => {
      let held = 0;
      this.waiters.push((dt) => {
        held = fn() ? held + dt : 0;
        if (held >= hold && fn()) { done(); return true; }
        return false;
      });
    });
  }

  // Shows choices and resolves with the index tapped.
  ask(options, { stack = false } = {}) {
    return this.guard((done) => {
      const box = document.createElement('div');
      box.className = stack || options.some((o) => o.length > 16) ? 'stack' : 'row';
      options.forEach((label, i) => {
        const b = document.createElement('button');
        b.className = 'stamp quiet';
        b.textContent = label;
        b.dataset.choice = i;
        b.addEventListener('click', () => { box.remove(); this.game.sound.pluck(5, 0.25); done(i); });
        box.append(b);
      });
      $('ctrl').append(box);
    });
  }

  // One big button that resolves when tapped.
  go(label) {
    return this.guard((done) => {
      const b = document.createElement('button');
      b.className = 'stamp';
      b.style.width = '100%';
      b.textContent = label;
      b.dataset.go = '1';
      b.addEventListener('click', () => { b.remove(); done(); });
      $('ctrl').append(b);
    });
  }

  // A button that stays, and calls fn on each tap.
  button(label, fn, { quiet = true } = {}) {
    let box = $('ctrl').querySelector('.row.btns');
    if (!box) { box = document.createElement('div'); box.className = 'row btns'; $('ctrl').append(box); }
    const b = document.createElement('button');
    b.className = quiet ? 'stamp quiet' : 'stamp';
    b.textContent = label;
    b.addEventListener('click', () => fn(b));
    box.append(b);
    return b;
  }

  slider(k) {
    const s = { value: k.value, ...k };
    const l = document.createElement('label');
    l.innerHTML = `<span>${k.label}</span><input type="range" min="0" max="1000" aria-label="${k.label}"><output></output>`;
    const inp = l.querySelector('input');
    const out = l.querySelector('output');
    const show = () => { out.textContent = k.fmt ? k.fmt(s.value) : s.value.toFixed(2); };
    s.set = (v) => { s.value = v; inp.value = toUnit(k, v) * 1000; show(); };
    inp.addEventListener('input', () => {
      let v = fromUnit(k, inp.value / 1000);
      if (k.step) v = Math.round(v / k.step) * k.step;
      s.value = v;
      show();
      k.on?.(v);
    });
    s.el = inp;
    s.move = (v) => { inp.value = toUnit(k, v) * 1000; inp.dispatchEvent(new Event('input')); };
    s.set(k.value);
    $('ctrl').append(l);
    this.sliders.push(s);
    return s;
  }

  // The sun: dragged along the top of the print, it sets temperature.
  sun(k) {
    const s = { value: k.value, ...k };
    const pad = $('sunpad');
    pad.hidden = false;
    this.sunCtl = s;
    pad.setAttribute('aria-valuemin', k.min);
    pad.setAttribute('aria-valuemax', k.max);
    s.set = (v) => { s.value = v; s.on?.(v); };
    return s;
  }

  // Dragging on the print. o = { hit(wx, wy) -> token or null, move(token, wx, wy), end(token) } in world units.
  onDrag(o) { this.drag = o; }

  // World of side L shown in the square print, y down.
  world(L) { this.L = L; }

  get scale() { return this.game.tank.s / this.L; }

  px(x, y) { const t = this.game.tank; const s = t.s / this.L; return [t.x + x * s, t.y + y * s]; }

  wx(px, py) { const t = this.game.tank; const s = t.s / this.L; return [(px - t.x) / s, (py - t.y) / s]; }

  heat(h) { this.game.printer.heat.target = Math.max(0, Math.min(1, h)); }

  pattern(on) { this.game.printer.setPattern(on); }

  buzz(ms) { try { navigator.vibrate?.(ms); } catch { /* Not every device can. */ } }

  get sound() { return this.game.sound; }

  get small() { return this.game.tank.s < 420; }
}
