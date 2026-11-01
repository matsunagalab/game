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
