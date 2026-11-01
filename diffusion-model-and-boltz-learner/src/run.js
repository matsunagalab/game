// One running chapter. Everything it makes is owned here, so leaving a chapter at any moment cleans up after itself.

export class Abort extends Error {}

export class Run {
  constructor(game, chapter) {
    Object.assign(this, { game, chapter, world: game.world, ui: game.ui, sound: game.sound, alive: true });
    this.owned = [];
    this.ticks = [];
    this.handlers = [];
    this.waits = new Set();
    this.probe = {};
    this.state = {};
  }

  own(x) { this.owned.push(x); return x; }

  tick(fn) {
    this.world.ticks.add(fn);
    this.ticks.push(fn);
    return fn;
  }

  untick(fn) { this.world.ticks.delete(fn); }

  // A wait that a player leaving the chapter can break.
  hold(promise) {
    return new Promise((resolve, reject) => {
      const stop = () => reject(new Abort());
      this.waits.add(stop);
      Promise.resolve(promise).then((v) => { this.waits.delete(stop); resolve(v); }, (e) => { this.waits.delete(stop); reject(e); });
    });
  }

  sleep(ms) { return this.hold(new Promise((r) => setTimeout(r, this.world.reduce ? Math.min(ms, 120) : ms))); }
  line(html, label) { return this.hold(this.ui.line(html, label)); }
  choose(html, options) { return this.hold(this.ui.choose(html, options)); }

  // Resolves when a control calls done(value).
  until(setup) { return this.hold(new Promise((resolve) => setup(resolve))); }

  // Runs a generator a slice at a time so the frame rate holds. onProgress gets a number from 0 to 1.
  budget(gen, onProgress, ms = 12) {
    return this.hold(new Promise((resolve, reject) => {
      const slice = () => {
        if (!this.alive) return;
        const end = performance.now() + ms;
        try {
          let r;
          do { r = gen.next(); if (!r.done && onProgress) onProgress(r.value); } while (!r.done && performance.now() < end);
          if (r.done) resolve(r.value); else requestAnimationFrame(slice);
        } catch (e) { reject(e); }
      };
      requestAnimationFrame(slice);
    }));
  }

  // Touch on the 3D scene.
  pointer({ down, move, up }) {
    const c = this.world.canvas;
    let active = false;
    const d = (e) => { if (e.isPrimary === false) return; active = true; try { c.setPointerCapture(e.pointerId); } catch { /* A released pointer cannot be captured. */ } down?.(e.clientX, e.clientY); };
    const m = (e) => { if (active) move?.(e.clientX, e.clientY); };
    const u = (e) => { if (active) { active = false; up?.(e.clientX, e.clientY); } };
    c.addEventListener('pointerdown', d); c.addEventListener('pointermove', m); c.addEventListener('pointerup', u); c.addEventListener('pointercancel', u);
    const off = () => { c.removeEventListener('pointerdown', d); c.removeEventListener('pointermove', m); c.removeEventListener('pointerup', u); c.removeEventListener('pointercancel', u); };
    this.handlers.push(off);
    return off;
  }

  // A move on the board, the same with a finger and a mouse. at(x, y) names what is under the pointer, or null. grab starts a press,
  // move follows it, drop ends it, and a press that did not travel is a tap. hover is for a mouse alone.
  board({ at, hover, grab, move, drop, tap, cancel, cursor = () => 'grab' }) {
    const c = this.world.canvas, TRAVEL = 6;
    let held = null, sx = 0, sy = 0, far = false, lit = null, id = null;
    const paint = (v) => { c.style.cursor = v; };
    const light = (t) => { if (t !== lit) { lit = t; hover?.(t); } paint(t === null ? '' : cursor(t)); };
    const d = (e) => {
      if (e.isPrimary === false) return;
      const t = at(e.clientX, e.clientY);
      if (t === null) return;
      held = t; id = e.pointerId; sx = e.clientX; sy = e.clientY; far = false;
      try { c.setPointerCapture(e.pointerId); } catch { /* A released pointer cannot be captured. */ }
      paint('grabbing');
      grab?.(t, e.clientX, e.clientY);
    };
    const m = (e) => {
      if (held === null) { if (e.pointerType === 'mouse') light(at(e.clientX, e.clientY)); return; }
      if (e.pointerId !== id) return;
      if (!far && Math.hypot(e.clientX - sx, e.clientY - sy) < TRAVEL) return;
      far = true;
      move?.(held, e.clientX, e.clientY);
    };
    const u = (e) => {
      if (held === null || e.pointerId !== id) return;
      const t = held;
      held = null;
      paint('');
      if (e.type === 'pointercancel') cancel?.(t);
      else if (far) drop?.(t, e.clientX, e.clientY);
      else tap?.(t, e.clientX, e.clientY);
    };
    const leave = () => { if (held === null) light(null); };
    c.addEventListener('pointerdown', d); c.addEventListener('pointermove', m); c.addEventListener('pointerup', u); c.addEventListener('pointercancel', u); c.addEventListener('pointerleave', leave);
    const off = () => {
      c.removeEventListener('pointerdown', d); c.removeEventListener('pointermove', m); c.removeEventListener('pointerup', u); c.removeEventListener('pointercancel', u); c.removeEventListener('pointerleave', leave);
      paint('');
    };
    this.handlers.push(off);
    return { dispose: off };
  }

  // Wraps an async handler for the board. Leaving the chapter while it waits is not an error.
  safe(fn) {
    return (...a) => Promise.resolve().then(() => fn(...a)).catch((e) => { if (!(e instanceof Abort)) { console.error(e); throw e; } });
  }

  // After ms with no action, where() says where to show the hand: { from, to }, both functions of no arguments.
  idle(where, ms = 6000) {
    let timer = 0;
    const show = () => { if (!this.alive) return; const h = where(); if (h) this.ui.hand(h.from, h.to ?? h.from); timer = setTimeout(show, ms * 1.5); };
    const arm = () => { clearTimeout(timer); this.ui.handOff(); timer = setTimeout(show, ms); };
    document.addEventListener('pointerdown', arm, true);
    arm();
    return { dispose: () => { clearTimeout(timer); document.removeEventListener('pointerdown', arm, true); this.ui.handOff(); } };
  }

  // Starts a level of a puzzle chapter. The tags say what is on the board.
  level(goal, tags = null) {
    const n = this.chapter.stages.length;
    this.ui.puzzle(true);
    this.ui.goal(goal, this.stageIndex + 1, n);
    this.ui.rounds(0);
    this.ui.feedback('');
    if (tags) this.ui.tags(...tags);
  }

  // A pause that a tap skips.
  pause(ms) {
    return this.hold(new Promise((resolve) => {
      let timer = 0;
      const go = () => { clearTimeout(timer); document.removeEventListener('pointerdown', go, true); resolve(); };
      timer = setTimeout(go, this.world.reduce ? Math.min(ms, 700) : ms);
      setTimeout(() => { if (this.alive) document.addEventListener('pointerdown', go, true); }, 150);
      this.handlers.push(() => document.removeEventListener('pointerdown', go, true));
    }));
  }

  // A level won: the reward, then on by itself. The next stage starts when this returns.
  won(html, tier, ms = 2200) {
    this.ui.feedback(html, 'good');
    this.ui.handOff();
    if ((this.game.save.tier[this.chapter.id] ?? 0) >= tier) this.sound.good(tier); else this.reach(tier);
    return this.pause(ms);
  }

  // Objects and handlers that belong to one stage of a chapter.
  scoped(x) { (this.scope ??= []).push(x); return x; }
  closeScope() {
    for (const x of (this.scope ?? []).reverse()) x.dispose?.();
    this.scope = [];
    this.ui.labels$.innerHTML = '';
  }

  // Raises this chapter's tier. A tier is never lost.
  reach(tier) { this.game.reach(this.chapter, tier); }

  stop() {
    this.alive = false;
    for (const f of this.ticks) this.world.ticks.delete(f);
    for (const h of this.handlers) h();
    for (const w of this.waits) w();
    this.waits.clear();
    this.closeScope();
    for (const x of this.owned.reverse()) x.dispose?.();
    this.owned = [];
    this.ui.labels$.innerHTML = '';
  }
}
