// The game: tracks, cargo, stress, and the final division. Rendering lives in window.js.
import { Rose } from './window.js';
import { Sound } from './audio.js';
import { CHAPTERS, STATIONS, GLASS, MITOSIS_GLASS, HUB } from './chapters.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'molecular-biology-of-the-cell-learner-v1';
const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6"/></svg>';
const SPEED = 0.62;
const QUEUE = 5;
const WHITE = [1, 0.97, 0.86];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A point on a track, measured from the hub. Matches the bow of the drawn ribbon.
function along(a, b, t, bow = 0.05) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const s = Math.sin(t * Math.PI) * bow;
  return { x: a.x + dx * t - (dy / len) * s, y: a.y + dy * t + (dx / len) * s };
}

class Game {
  constructor() {
    this.rose = new Rose($('gl'));
    this.sound = new Sound();
    this.save = { best: {}, muted: false };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {}); } catch { /* A broken save just starts fresh. */ }
    this.sound.muted = !!this.save.muted;
    this.tracks = [];
    this.cargo = [];
    this.sparks = [];
    this.recharge = [];
    this.tags = {};
    this.mode = 'title';
    this.bind();
    this.rose.paint(GLASS);
    this.showTitle();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* Private browsing can refuse storage. */ } }

  screens(...on) { ['title', 'chapters', 'hud', 'brief', 'done'].forEach((id) => { $(id).hidden = !on.includes(id); }); }

  nextIndex() {
    const i = CHAPTERS.findIndex((c) => !this.save.best[c.id]);
    return i < 0 ? 0 : i;
  }

  // The title keeps a small demonstration running behind the words.
  showTitle() {
    this.mode = 'title';
    this.prepare(CHAPTERS[2]);
    ['er', 'golgi', 'membrane'].forEach((s) => this.addTrack(s, true));
    this.screens('title');
    const n = Object.keys(this.save.best).length;
    $('begin').textContent = n === 0 ? 'Enter the cell' : n >= CHAPTERS.length ? 'Enter again' : `Go on to chapter ${this.nextIndex() + 1}`;
  }

  showChapters() {
    this.mode = 'chapters';
    this.prepare(null);
    this.screens('chapters');
    const next = this.nextIndex();
    $('petals').replaceChildren(...CHAPTERS.map((c, i) => {
      const got = this.save.best[c.id];
      const li = document.createElement('li');
      li.className = got ? 'done' : i === next ? 'next' : '';
      const b = document.createElement('button');
      b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${c.title}</span><span class="r" aria-label="${got ? `${got} of 3 roses` : 'Not played yet'}">${got ? '❀'.repeat(got) : ''}</span>`;
      b.addEventListener('click', () => this.open(i));
      li.append(b);
      return li;
    }));
  }

  prepare(ch) {
    this.ch = ch;
    this.tracks = [];
    this.cargo = [];
    this.sparks = [];
    this.recharge = [];
    this.count = 0;
    this.stress = 0;
    this.peak = 0;
    this.atp = 100;
    this.clock = 0;
    this.nextCat = ch?.catastrophe ?? 1e9;
    this.spawn = (ch?.routes ?? []).map((r, i) => r.every * 0.4 + i * 0.5);
    this.sites = {};
    this.rose.split = 0;
    this.rose.u.uStress.value = 0;
    this.drag = null;
    this.anaphase = 0;
    const wantMitosis = !!ch?.mitosis;
    if (wantMitosis !== this.painted) {
      this.rose.paint(wantMitosis ? MITOSIS_GLASS : GLASS);
      this.painted = wantMitosis;
    }
    if (wantMitosis) this.setupSpindle(ch);
    else ch?.stations.forEach((s) => { this.sites[s] = { ...STATIONS[s], id: s, wait: 0 }; });
    this.hub = wantMitosis ? null : HUB;
    this.buildTags();
  }

  setupSpindle(ch) {
    this.pairs = [];
    const n = ch.pairs;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.27;
      const y = Math.sin(i * 2.4) * 0.05;
      const top = { x, y: y + 0.075, id: `t${i}`, pole: { x: 0, y: 0.76 }, pair: i };
      const low = { x, y: y - 0.075, id: `b${i}`, pole: { x: 0, y: -0.76 }, pair: i };
      this.sites[top.id] = top;
      this.sites[low.id] = low;
      this.pairs.push([top, low]);
    }
  }

  buildTags() {
    const box = $('tags');
    box.replaceChildren();
    this.tags = {};
    Object.values(this.sites).forEach((s) => {
      if (!s.label) return;
      const d = document.createElement('div');
      d.className = 'tag';
      d.textContent = s.label;
      box.append(d);
      this.tags[s.id] = d;
    });
  }

  open(i) {
    this.index = i;
    const ch = CHAPTERS[i];
    this.prepare(ch);
    this.mode = 'brief';
    $('bnum').textContent = `Chapter ${i + 1} of ${CHAPTERS.length}`;
    $('btitle').textContent = ch.title;
    $('blede').textContent = ch.lede;
    $('bgoal').textContent = ch.goal;
    $('cnum').textContent = `Chapter ${i + 1} of ${CHAPTERS.length}`;
    $('ctitle').textContent = ch.title;
    this.screens('brief');
  }

  start() {
    const ch = this.ch;
    this.mode = 'play';
    this.screens('hud');
    $('atp-box').hidden = !ch.atp;
    $('count-label').textContent = ch.mitosis ? 'Pairs held' : 'Delivered';
    $('stress-box').hidden = !!ch.mitosis;
    $('budget-box').hidden = !!ch.mitosis;
    $('say').textContent = ch.goal;
    this.clock = 0;
  }

  /* ----- tracks ----- */

  addTrack(id, instant = false) {
    const budget = this.ch.budget ?? 99;
    if (this.tracks.filter((t) => t.state !== 'shrink').length + this.recharge.length >= budget) {
      $('say').textContent = this.recharge.length ? 'Fallen tubulin is reloading with GTP. Wait a moment, or take down another track.' : 'All your tubulin is in use. Tap a healthy track to take it down first.';
      return;
    }
    if (this.tracks.some((t) => t.id === id)) return;
    const site = this.sites[id];
    this.tracks.push({ id, from: site.pole ?? this.hub, to: site, grown: instant ? 1 : 0, state: instant ? 'ok' : 'grow', warn: 0 });
    this.sound.grow();
  }

  dropTrack(t, state = 'shrink') {
    t.state = state;
    this.cargo.forEach((c) => {
      if (c.on === t) { c.on = null; c.t = 0; c.phase = 'wait'; }
    });
  }

  trackFor(id) { return this.tracks.find((t) => t.id === id && (t.state === 'ok' || t.state === 'warn')); }

  catastrophe() {
    const pool = this.tracks.filter((t) => t.state === 'ok' && !(this.ch.mitosis && this.isHeld(t.id)));
    if (!pool.length) return;
    const t = pool[Math.floor(Math.random() * pool.length)];
    t.state = 'warn';
    t.warn = 2.1;
    this.sound.warn();
  }

  isHeld(id) {
    const s = this.sites[id];
    return this.pairs[s.pair].every((k) => this.trackFor(k.id));
  }

  /* ----- input ----- */

  bind() {
    const on = (id, fn) => $(id).addEventListener('click', () => { this.sound.unlock(); fn(); });
    on('begin', () => this.open(this.nextIndex()));
    on('bgo', () => this.start());
    on('dnext', () => {
      if (this.won && this.index + 1 < CHAPTERS.length) this.open(this.index + 1);
      else if (!this.won) this.open(this.index);
      else this.showChapters();
    });
    on('dagain', () => this.open(this.index));
    on('sound', () => this.toggleSound());
    document.querySelectorAll('[data-title]').forEach((b) => b.addEventListener('click', () => this.showTitle()));
    document.querySelectorAll('[data-chapters]').forEach((b) => b.addEventListener('click', () => this.showChapters()));
    // On touch screens only the end of a tap counts as permission to play sound.
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, () => this.sound.unlock(), { capture: true });
    addEventListener('resize', () => this.rose.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.rose.resize(), 200));
    this.paintSound();
    const c = $('gl');
    c.addEventListener('pointerdown', (e) => {
      const p = this.rose.fromScreen(e.clientX, e.clientY);
      this.down = p;
      if (this.mode === 'play' && this.hub && dist(p, this.hub) < 0.22) this.drag = { ...p };
    });
    c.addEventListener('pointermove', (e) => {
      this.rose.pointer.x = (e.clientX / innerWidth - 0.5) * 2;
      this.rose.pointer.y = -(e.clientY / innerHeight - 0.5) * 2;
      if (this.drag) Object.assign(this.drag, this.rose.fromScreen(e.clientX, e.clientY));
    });
    addEventListener('pointerup', (e) => {
      if (e.target !== c) { this.drag = null; return; }
      const p = this.rose.fromScreen(e.clientX, e.clientY);
      const dragged = !!this.drag && dist(p, this.hub) > 0.2;
      this.drag = null;
      if (this.mode === 'play') this.touch(p, dragged);
    });
    addEventListener('keydown', (e) => {
      if (this.mode !== 'play' || !/^[1-9]$/.test(e.key)) return;
      const s = Object.values(this.sites)[+e.key - 1];
      if (s) this.touch(s, false);
    });
  }

  // One tap: rescue a flashing track, or grow or remove the track of what was tapped.
  touch(p, dragged) {
    const warned = this.tracks.filter((t) => t.state === 'warn').map((t) => {
      let best = 9;
      for (let i = 0; i <= 10; i++) best = Math.min(best, dist(p, along(t.from, t.to, i / 10)));
      return [best, t];
    }).sort((a, b) => a[0] - b[0])[0];
    if (warned && warned[0] < 0.16) {
      warned[1].state = 'ok';
      this.sound.bell(7, 0.2);
      this.burst(p, WHITE, 6);
      return;
    }
    const site = Object.values(this.sites).map((s) => [dist(p, s), s]).sort((a, b) => a[0] - b[0])[0];
    const reach = this.ch.mitosis ? 0.12 : 0.24;
    if (!site || site[0] > reach) return;
    const t = this.tracks.find((x) => x.id === site[1].id && x.state !== 'shrink');
    if (t && !dragged) { if (!this.ch.mitosis) this.dropTrack(t); } else if (!t) this.addTrack(site[1].id);
  }

  paintSound() {
    $('sound').innerHTML = this.sound.muted ? SPEAKER_OFF : SPEAKER_ON;
    $('sound').setAttribute('aria-label', this.sound.muted ? 'Turn sound on' : 'Turn sound off');
  }

  toggleSound() {
    this.sound.setMuted(!this.sound.muted);
    this.save.muted = this.sound.muted;
    this.store();
    this.paintSound();
  }

  /* ----- simulation ----- */

  burst(p, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const v = 0.12 + Math.random() * 0.34;
      this.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, c: color });
    }
  }

  spawnCargo(route) {
    this.cargo.push({ route, leg: 0, phase: 'wait', t: 0, on: null, at: route.path[0], next: route.path[1], jitter: Math.random() * 6.28 });
  }

  stepCargo(dt) {
    const v = SPEED * (this.ch?.atp ? (this.atp < 20 ? 0.38 : 1) : 1);
    const free = {};
    for (const c of this.cargo) {
      if (c.phase === 'wait') {
        if (free[c.at]) continue;
        const t = this.trackFor(c.at);
        if (t && this.trackFor(c.next)) {
          // One departure at a time, so vesicles leave in a line.
          c.phase = 'in';
          c.on = t;
          c.t = 1;
          free[c.at] = true;
          if (this.ch?.atp) this.atp = Math.max(0, this.atp - 3);
        }
      } else if (c.phase === 'in') {
        c.t -= (v * dt) / Math.max(0.2, dist(c.on.from, c.on.to));
        if (c.t <= 0) { c.phase = 'out'; c.on = this.trackFor(c.next); c.t = 0; if (!c.on) { c.phase = 'wait'; } }
      } else if (c.phase === 'out') {
        c.t += (v * dt) / Math.max(0.2, dist(c.on.from, c.on.to));
        if (c.t >= 1) this.arrive(c);
      }
    }
    this.cargo = this.cargo.filter((c) => !c.gone);
  }

  arrive(c) {
    c.leg += 1;
    const { path, colors } = c.route;
    const here = STATIONS[c.next];
    this.burst(here, rgb(colors[Math.min(c.leg, colors.length - 1)]), 7);
    if (c.leg + 1 < path.length) {
      c.at = path[c.leg];
      c.next = path[c.leg + 1];
      c.phase = 'wait';
      c.on = null;
      c.t = 0;
      return;
    }
    c.gone = true;
    if (this.mode !== 'play') return;
    this.count += 1;
    this.stress = Math.max(0, this.stress - 3);
    this.sound.delivered();
    this.rose.u.uFlash.value = Math.min(0.5, this.rose.u.uFlash.value + 0.1);
    if (this.count >= this.ch.target) this.finish(true);
  }

  stepPressure(dt) {
    const queues = {};
    for (const c of this.cargo) if (c.phase === 'wait') queues[c.at] = (queues[c.at] ?? 0) + 1;
    Object.entries(this.tags).forEach(([id, d]) => {
      const n = queues[id] ?? 0;
      d.classList.toggle('full', n > QUEUE);
      d.textContent = this.sites[id].label + (n ? ` ${n}` : '');
    });
    if (this.ch.calm || this.mode !== 'play') return;
    let over = 0;
    Object.values(queues).forEach((n) => { over += Math.max(0, n - QUEUE); });
    this.stress = over ? this.stress + over * 2.6 * dt : Math.max(0, this.stress - 3 * dt);
    this.peak = Math.max(this.peak, this.stress);
    this.rose.u.uStress.value = Math.min(1, this.stress / 100) * 0.7;
    if (this.stress >= 100) this.finish(false);
  }

  stepTracks(dt) {
    for (const t of this.tracks) {
      if (t.state === 'grow') {
        t.grown = Math.min(1, t.grown + (dt * 1.5) / Math.max(0.3, dist(t.from, t.to)));
        if (t.grown >= 1) { t.state = 'ok'; this.burst(t.to, WHITE, 5); }
      } else if (t.state === 'warn') {
        t.warn -= dt;
        if (t.warn <= 0) {
          this.dropTrack(t);
          this.sound.collapse();
          if (this.ch.budget) this.recharge.push(3.2);
        }
      } else if (t.state === 'shrink') t.grown -= dt * 1.5;
    }
    this.tracks = this.tracks.filter((t) => t.grown > 0 || t.state === 'grow');
    this.recharge = this.recharge.map((x) => x - dt).filter((x) => x > 0);
  }

  stepSpindle(dt) {
    const ch = this.ch;
    const held = this.pairs.filter(([a, b]) => this.trackFor(a.id) && this.trackFor(b.id)).length;
    $('count').textContent = `${held} / ${this.pairs.length}`;
    if (this.anaphase > 0) {
      this.anaphase += dt;
      const p = Math.min(1, (this.anaphase - 1) / 2.6);
      const s = p * p * (3 - 2 * p);
      this.pairs.forEach(([a, b]) => {
        if (p >= 0) { a.pull = s; b.pull = s; }
      });
      this.tracks.forEach((t) => { t.short = s; });
      if (this.anaphase > 3.6) this.rose.split = Math.min(1, this.rose.split + dt * 0.5);
      if (this.anaphase > 6.2) this.finish(true);
      return;
    }
    if (held === this.pairs.length && this.tracks.every((t) => t.state === 'ok')) {
      this.anaphase = 0.001;
      this.tracks.forEach((t) => { t.state = 'ok'; });
      this.sound.fanfare();
      $('say').textContent = 'Every sister is attached and the pairs are under tension. The checkpoint lifts, and the sisters part.';
      this.nextCat = 1e9;
    }
  }

  update(dt) {
    const { ch } = this;
    if (ch) {
      const live = this.mode === 'play' || this.mode === 'title';
      if (live) {
        this.clock += dt;
        ch.routes?.forEach((r, i) => {
          this.spawn[i] -= dt;
          if (this.spawn[i] <= 0) {
            this.spawn[i] = r.every * (0.8 + Math.random() * 0.4);
            if (this.cargo.length < 150) this.spawnCargo(r);
          }
        });
        if (this.mode === 'play' && ch.catastrophe) {
          this.nextCat -= dt;
          if (this.nextCat <= 0) {
            this.nextCat = ch.catastrophe * (0.7 + Math.random() * 0.6);
            this.catastrophe();
          }
        }
        this.stepTracks(dt);
        if (!ch.mitosis) this.stepCargo(dt);
        if (ch.atp && this.mode === 'play') {
          if (this.trackFor('mito')) this.atp = Math.min(100, this.atp + 14 * dt);
          this.atp = Math.max(0, this.atp - 0.5 * dt);
        }
        if (ch.mitosis && this.mode === 'play') this.stepSpindle(dt);
        if (!ch.mitosis) this.stepPressure(dt);
      }
    }
    this.sparks.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; });
    this.sparks = this.sparks.filter((s) => s.life > 0);
    this.draw();
  }

  draw() {
    const { rose, clock } = this;
    rose.beginRibbons();
    const LEAD = [0.03, 0.03, 0.05];
    const end = (t) => (t.short ? { x: t.to.x + (t.from.x - t.to.x) * t.short * 0.86, y: t.to.y + (t.from.y - t.to.y) * t.short * 0.86 } : t.to);
    for (const t of this.tracks) rose.ribbon(t.from, end(t), 0.03, LEAD, Math.max(0, t.grown));
    for (const t of this.tracks) {
      const hot = t.state === 'warn' ? (Math.sin(clock * 22) > 0 ? [1, 0.2, 0.2] : [1, 0.95, 0.75]) : [0.98, 0.93, 0.76];
      rose.ribbon(t.from, end(t), t.state === 'warn' ? 0.022 : 0.014, hot, Math.max(0, t.grown));
    }
    if (this.drag && this.hub) rose.ribbon(this.hub, this.drag, 0.012, [0.91, 0.76, 0.42], 1);
    rose.endRibbons();

    const beads = [];
    if (this.hub) {
      beads.push({ ...this.hub, c: [1, 0.8, 0.3], s: 7 + Math.sin(clock * 2) * 0.6 });
    } else if (this.ch?.mitosis) {
      beads.push({ x: 0, y: 0.76, c: [1, 0.8, 0.3], s: 7 }, { x: 0, y: -0.76, c: [1, 0.8, 0.3], s: 7 });
      this.pairs.forEach((pair) => pair.forEach((k) => {
        const at = k.pull ? { x: k.x + (k.pole.x - k.x) * k.pull * 0.86, y: k.y + (k.pole.y - k.y) * k.pull * 0.86 } : k;
        const on = this.trackFor(k.id);
        beads.push({ ...at, c: on ? [0.45, 1, 0.75] : [1, 0.42, 0.6], s: 4.6 });
        beads.push({ x: at.x - 0.045, y: at.y + 0.02, c: [0.5, 0.65, 1], s: 2.6 }, { x: at.x + 0.045, y: at.y + 0.02, c: [0.5, 0.65, 1], s: 2.6 });
      }));
    }
    const waiting = {};
    for (const c of this.cargo) {
      const color = rgb(c.route.colors[Math.min(c.leg, c.route.colors.length - 1)]);
      if (c.phase === 'wait') {
        const n = (waiting[c.at] = (waiting[c.at] ?? 0) + 1);
        const home = STATIONS[c.at];
        const a = n * 2.4;
        const r = 0.02 * Math.sqrt(n) + 0.015;
        beads.push({ x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r, c: color, s: 2.6 });
      } else if (c.on) {
        beads.push({ ...along(c.on.from, c.on.to, c.t), c: color, s: 3.2 });
      }
    }
    for (const s of this.sparks) beads.push({ x: s.x, y: s.y, c: s.c, s: 2.4 * Math.min(1, s.life * 2) });
    rose.setBeads(beads);

    Object.entries(this.tags).forEach(([id, d]) => {
      const s = this.sites[id];
      const at = rose.toScreen(s.x, s.y);
      d.style.left = `${at.x}px`;
      d.style.top = `${at.y}px`;
    });
    if (this.mode === 'play') {
      const ch = this.ch;
      if (!ch.mitosis) $('count').textContent = `${this.count} / ${ch.target}`;
      const inUse = this.tracks.filter((t) => t.state !== 'shrink').length + this.recharge.length;
      $('budget').textContent = ch.budget ? `${ch.budget - inUse} left` : 'plenty';
      $('stress').style.width = `${this.stress}%`;
      $('atp').style.width = `${this.atp}%`;
    }
  }

  gradeRoses() {
    if (this.ch.mitosis) return this.clock < 22 ? 3 : this.clock < 40 ? 2 : 1;
    return this.ch.calm ? 3 : this.peak < 12 ? 3 : this.peak < 50 ? 2 : 1;
  }

  finish(won) {
    if (this.mode !== 'play') return;
    this.mode = 'done';
    this.won = won;
    const ch = this.ch;
    const roses = won ? this.gradeRoses() : 0;
    if (won) {
      this.save.best[ch.id] = Math.max(this.save.best[ch.id] ?? 0, roses);
      this.store();
      this.sound.fanfare();
    }
    $('roses').innerHTML = [0, 1, 2].map((i) => `<i class="${i < roses ? 'on' : ''}" style="animation-delay:${i * 0.2}s"></i>`).join('');
    $('dtitle').textContent = won ? ch.title : 'The cell gave up';
    $('dscore').textContent = won ? (ch.mitosis ? `Two cells, ${Math.round(this.clock)} seconds.` : `${this.count} delivered, highest stress ${Math.round(this.peak)}.`) : 'Cargo piled up for too long. A badly stressed cell can start apoptosis, a tidy self-destruction.';
    $('dterm').textContent = won ? ch.term : 'Tip: a queue above 5 raises stress. Watch for red labels.';
    $('dnote').textContent = won ? ch.note : '';
    $('dnext').textContent = !won ? 'Try again' : this.index + 1 < CHAPTERS.length ? `Chapter ${this.index + 2}` : 'See all chapters';
    $('dagain').hidden = !won;
    this.screens('done');
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.rose.frame(now / 1000);
  }
}

try {
  window.game = new Game();
} catch (e) {
  document.body.textContent = 'This game needs WebGL, which this browser could not start.';
  console.error(e);
}
