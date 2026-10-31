// Screens, controls and goals. The physics lives in chem.js and engine.js.
import { Scene } from './scene.js';
import { World, Swarm, WALKERS } from './engine.js';
import { Sound } from './audio.js';
import { VIEWS } from './views.js';
import { populations } from './chem.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'physical-chemistry-of-biomolecules-learner-v1';
const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6"/></svg>';

const toUnit = (c, v) => (c.log ? Math.log(v / c.min) / Math.log(c.max / c.min) : (v - c.min) / (c.max - c.min));
const fromUnit = (c, t) => (c.log ? c.min * (c.max / c.min) ** t : c.min + (c.max - c.min) * t);

class Game {
  constructor() {
    this.scene = new Scene($('gl'));
    this.sound = new Sound();
    this.save = { best: {}, muted: false };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {}); } catch { /* A broken save just starts fresh. */ }
    this.sound.muted = !!this.save.muted;
    this.world = new World();
    this.swarm = new Swarm(WALKERS, 2);
    this.swarm.onCross = (from, to, link) => this.crossed(from, to, link);
    this.c = {};
    this.env = {};
    this.mode = 'title';
    this.bind();
    this.showTitle();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  store() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* Private browsing can refuse storage. */ }
  }

  crossed(from, to, link) {
    const v = this.view;
    if (!v) return;
    if (v.onCross) {
      if (v.onCross(this.env, from, to, link, this.sound) === false) return;
    }
    if (this.mode !== 'title') this.sound.cross(to, to > from);
  }

  screens(...shown) {
    ['title', 'album', 'play', 'brief', 'done'].forEach((id) => { $(id).hidden = !shown.includes(id); });
    $('sunpad').hidden = !(shown.includes('play') && this.view?.controls?.some((k) => k.kind === 'sun'));
    if (!shown.includes('play')) $('handles').replaceChildren();
    $('handles').hidden = shown.includes('brief') || shown.includes('done');
  }

  nextIndex() {
    const i = VIEWS.findIndex((v) => !this.save.best[v.id]);
    return i < 0 ? 0 : i;
  }

  showTitle() {
    this.mode = 'title';
    this.load(VIEWS[2]);
    this.c.T = 322;
    this.view.controls[0].start = 305;
    this.screens('title');
    const done = Object.keys(this.save.best).length;
    $('begin').textContent = done === 0 ? 'Start the first view' : done >= VIEWS.length ? 'Look again at view one' : `Go to view ${this.nextIndex() + 1}`;
  }

  showAlbum() {
    this.mode = 'album';
    this.screens('album');
    const next = this.nextIndex();
    $('prints').replaceChildren(...VIEWS.map((v, i) => {
      const got = this.save.best[v.id];
      const li = document.createElement('li');
      const b = document.createElement('button');
      if (i === next && !got) li.className = 'next';
      b.innerHTML = `<span class="sheetlet">${got?.thumb ? `<img alt="" src="${got.thumb}">` : `<span class="num" lang="ja">${KANJI[i]}</span>`}</span>
        <span class="got" aria-label="${got ? `${got.seals} of 3 seals` : 'Not printed yet'}">${got ? '景'.repeat(got.seals) : ''}</span>
        <span class="name">${i + 1}. ${v.title}</span>`;
      b.addEventListener('click', () => this.open(i));
      li.append(b);
      return li;
    }));
  }

  // Set up the world for a view, without starting it.
  load(v) {
    this.view = v;
    const w = this.world;
    w.frozen = false;
    w.active = 1;
    w.hop = v.hop;
    w.wells = v.wells.map((x) => ({ ...x }));
    w.links = v.links.map((x) => ({ ...x }));
    this.c = {};
    v.controls?.forEach((k) => { this.c[k.key] = k.start ?? 0; });
    this.env = { t: 0, stage: v.stages?.[0], stageIndex: 0, hold: 0, round: v.wager?.[0], roundIndex: 0, pops: [0.5, 0.5, 0, 0, 0], errs: [] };
    this.swarm.n = this.swarm.cap;
    this.scene.colors([...v.colors, ...v.colors, ...v.colors].slice(0, 5));
    this.scene.night.target = v.night ? 1 : 0;
    this.tickView(0);
    this.seedEquilibrium();
    this.scene.apply(w, v.scale);
  }

  seedEquilibrium() {
    const w = this.world;
    const f = this.view.start ?? populations(w.wells.map((x) => x.G), w.T);
    this.swarm.seed(f, w);
    this.env.pops = [...this.swarm.smooth];
  }

  tickView(dt) { this.view.tick(this.c, this.world, this.env, dt); }

  open(i) {
    this.index = i;
    this.mode = 'brief';
    const v = VIEWS[i];
    this.load(v);
    this.buildControls();
    $('bnum').textContent = `View ${i + 1} of ${VIEWS.length}`;
    $('btitle').textContent = v.title;
    $('blede').innerHTML = v.lede;
    $('bgoal').textContent = v.goal;
    $('vnum').textContent = `View ${i + 1} of ${VIEWS.length}`;
    $('vtitle').textContent = v.title;
    this.screens('play', 'brief');
    $('panel').style.visibility = 'hidden';
  }

  start() {
    this.mode = 'play';
    this.screens('play');
    $('panel').style.visibility = '';
    const v = this.view;
    this.startedAt = performance.now();
    this.env.t = 0;
    $('strip').hidden = !v.night;
    $('mark').hidden = !v.wager;
    $('band').hidden = !v.stages;
    if (v.wager) this.beginRound();
    else this.showStage();
  }

  showStage() {
    const s = this.env.stage;
    if (!s) { $('say').textContent = ''; return; }
    $('say').textContent = s.say ?? this.view.goal;
    $('band').style.left = `${s.band[0] * 100}%`;
    $('band').style.width = `${(s.band[1] - s.band[0]) * 100}%`;
  }

  beginRound() {
    const { env, world, view } = this;
    this.tickView(0);
    env.guess = 0.5;
    env.released = false;
    env.watching = view.night ? env.round.watch : 0;
    this.setMark(0.5);
    $('say').textContent = env.round.say;
    if (view.night) {
      this.swarm.n = 1;
      this.swarm.seed([Math.random() < 0.5 ? 1 : 0, 0], world);
      this.swarm.seed([1, 0], world);
      this.swarm.n = 1;
      env.trace = [];
      $('ctrl').replaceChildren(this.letGo());
    } else {
      world.frozen = true;
      this.swarm.n = this.swarm.cap;
      this.swarm.seed([0.5, 0.5], world);
      $('ctrl').replaceChildren(this.letGo());
    }
  }

  letGo() {
    const b = document.createElement('button');
    b.className = 'stamp wide';
    b.id = 'release';
    b.textContent = this.view.night ? 'Watching…' : 'Release';
    b.disabled = !!this.view.night;
    b.addEventListener('click', () => this.release());
    return b;
  }

  setMark(f) {
    this.env.guess = Math.max(0, Math.min(1, f));
    $('mark').style.left = `${this.env.guess * 100}%`;
  }

  release() {
    const { env, world, view } = this;
    if (env.released) return;
    env.released = true;
    world.frozen = false;
    if (view.night) {
      // The crowd appears, each one a copy of the lone molecule's story.
      this.swarm.n = this.swarm.cap;
      this.swarm.seed([0.5, 0.5], world);
      this.boost = 6;
    } else this.boost = 5;
    $('release').disabled = true;
    $('release').textContent = 'Settling…';
    setTimeout(() => this.settle(), 2600);
  }

  settle() {
    const { env, view } = this;
    if (this.mode !== 'play' || !env.released) return;
    const truth = view.truth(env.round);
    const err = Math.abs(env.guess - truth);
    env.errs.push(err);
    this.sound.pluck(err < 0.06 ? 8 : 3, 0.4);
    $('say').textContent = `It settled at ${Math.round(truth * 100)}%. You said ${Math.round(env.guess * 100)}%.`;
    this.boost = 1;
    const more = env.roundIndex + 1 < view.wager.length;
    const b = $('release');
    b.disabled = false;
    b.textContent = more ? 'Next' : 'Finish';
    b.replaceWith(b.cloneNode(true));
    $('release').addEventListener('click', () => {
      if (!more) { this.finish(); return; }
      env.roundIndex += 1;
      env.round = view.wager[env.roundIndex];
      this.beginRound();
    });
  }

  buildControls() {
    const ctrl = $('ctrl');
    ctrl.replaceChildren();
    $('handles').replaceChildren();
    const { c } = this;
    this.scene.sunT = undefined;
    this.view.controls?.forEach((k) => {
      if (k.kind === 'sun') this.sunCtl = k;
      if (k.kind === 'slider') {
        const l = document.createElement('label');
        l.innerHTML = `<span>${k.label}</span><input type="range" min="0" max="1000" aria-label="${k.label}"><output></output>`;
        const inp = l.querySelector('input');
        const out = l.querySelector('output');
        const show = () => { out.textContent = k.fmt(c[k.key]); };
        inp.value = toUnit(k, c[k.key]) * 1000;
        inp.addEventListener('input', () => { c[k.key] = fromUnit(k, inp.value / 1000); show(); });
        show();
        ctrl.append(l);
      }
      if (k.kind === 'press') {
        const b = document.createElement('button');
        b.className = 'stamp wide';
        b.id = 'press';
        b.textContent = k.label;
        const set = (on) => (e) => { e.preventDefault(); c[k.key] = on; b.style.background = on ? '#8d2a1a' : ''; };
        b.addEventListener('pointerdown', set(1));
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => b.addEventListener(t, set(0)));
        b.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) set(1)(e); });
        b.addEventListener('keyup', (e) => { if (e.code === 'Space') set(0)(e); });
        ctrl.append(b);
      }
      if (k.kind === 'tap') {
        const b = document.createElement('button');
        b.className = 'stamp wide';
        b.id = 'tap';
        b.textContent = k.label;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); c[k.key] = Math.min(1, c[k.key] + 0.3); this.sound.unlock(); });
        b.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); c[k.key] = Math.min(1, c[k.key] + 0.3); } });
        ctrl.append(b);
      }
      if (k.kind === 'handle') {
        const d = document.createElement('div');
        d.className = 'seal';
        d.tabIndex = 0;
        d.setAttribute('role', 'slider');
        d.setAttribute('aria-label', 'Depth of the middle valley');
        d.setAttribute('aria-valuemin', k.min);
        d.setAttribute('aria-valuemax', k.max);
        d.dataset.well = k.well;
        let y0 = 0;
        let v0 = 0;
        d.addEventListener('pointerdown', (e) => { d.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = c[k.key]; });
        d.addEventListener('pointermove', (e) => {
          if (!d.hasPointerCapture(e.pointerId)) return;
          c[k.key] = Math.max(k.min, Math.min(k.max, v0 + (y0 - e.clientY) * 0.05));
        });
        d.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowUp') c[k.key] = Math.min(k.max, c[k.key] + 0.25);
          if (e.key === 'ArrowDown') c[k.key] = Math.max(k.min, c[k.key] - 0.25);
        });
        $('handles').append(d);
      }
    });
    if (!this.view.controls?.some((k) => k.kind === 'sun')) this.sunCtl = null;
    const handle = this.view.controls?.some((k) => k.kind === 'handle');
    if (!ctrl.children.length && !this.view.wager) ctrl.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: handle ? 'Drag the red seal up or down.' : 'Drag the sun across the sky.' }));
  }

  bind() {
    const on = (id, fn) => $(id).addEventListener('click', () => { this.sound.unlock(); fn(); });
    on('begin', () => this.open(this.nextIndex()));
    on('to-album', () => this.showAlbum());
    on('bgo', () => this.start());
    on('dnext', () => {
      if (this.index + 1 < VIEWS.length) this.open(this.index + 1);
      else this.showAlbum();
    });
    on('dagain', () => this.open(this.index));
    on('sound', () => this.toggleSound());
    document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => this.showTitle()));
    document.querySelectorAll('[data-album]').forEach((b) => b.addEventListener('click', () => this.showAlbum()));
    // On touch screens only the end of a tap counts as permission to play sound.
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      addEventListener(type, () => this.sound.unlock(), { capture: true });
    }
    addEventListener('resize', () => this.scene.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.scene.resize(), 200));
    this.paintSound();

    const pad = $('sunpad');
    const drag = (e) => {
      const k = this.sunCtl;
      if (!k) return;
      const t = Math.max(0, Math.min(1, (e.clientX / innerWidth - 0.08) / 0.84));
      this.c[k.key] = fromUnit(k, t);
    };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); drag(e); });
    pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) drag(e); });
    pad.addEventListener('keydown', (e) => {
      const k = this.sunCtl;
      if (!k) return;
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const t = toUnit(k, this.c[k.key]) + d * 0.005;
      this.c[k.key] = fromUnit(k, Math.max(0, Math.min(1, t)));
    });

    const pop = $('pop');
    const guess = (e) => { if (this.view?.wager && !this.env.released) { const r = pop.getBoundingClientRect(); this.setMark((e.clientX - r.left) / r.width); } };
    pop.addEventListener('pointerdown', (e) => { pop.setPointerCapture(e.pointerId); guess(e); });
    pop.addEventListener('pointermove', (e) => { if (pop.hasPointerCapture(e.pointerId)) guess(e); });
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

  stageDone() {
    const { env, view } = this;
    this.sound.chord();
    env.stageIndex += 1;
    env.hold = 0;
    env.stage = view.stages[env.stageIndex];
    if (env.stage) this.showStage();
    else this.finish();
  }

  sealsFor() {
    const { view, env } = this;
    if (view.wager) {
      const e = env.errs.reduce((a, b) => a + b, 0) / env.errs.length;
      return e < 0.05 ? 3 : e < 0.12 ? 2 : 1;
    }
    if (view.grade) return view.grade(env);
    const secs = env.t;
    return secs <= view.par ? 3 : secs <= view.par * 2.2 ? 2 : 1;
  }

  scoreLine() {
    const { view, env } = this;
    if (view.wager) return `Average miss: ${Math.round((env.errs.reduce((a, b) => a + b, 0) / env.errs.length) * 100)} points.`;
    if (view.race) return view.race(env);
    return `Printed in ${Math.round(env.t)} seconds.`;
  }

  finish() {
    if (this.mode !== 'play') return;
    this.mode = 'done';
    const v = this.view;
    const seals = this.sealsFor();
    this.scene.frame(performance.now() / 1000);
    const thumb = this.scene.snapshot();
    const old = this.save.best[v.id];
    if (!old || seals >= old.seals) this.save.best[v.id] = { seals, thumb };
    this.store();
    $('dtitle').textContent = v.title;
    $('dscore').textContent = this.scoreLine();
    $('dformula').innerHTML = v.note.formula;
    $('dtext').innerHTML = v.note.text;
    $('seals').innerHTML = [0, 1, 2].map((i) => `<i class="${i < seals ? 'land' : 'off'}" lang="ja" style="animation-delay:${i * 0.22}s">景</i>`).join('');
    $('dnext').textContent = this.index + 1 < VIEWS.length ? `View ${this.index + 2}` : 'See the twelve views';
    this.screens('play', 'done');
    $('panel').style.visibility = 'hidden';
    [0, 1, 2].slice(0, seals).forEach((i) => setTimeout(() => this.sound.thud(), i * 220 + 120));
  }

  drawPop() {
    const { swarm, view } = this;
    const n = this.world.wells.length;
    const fill = $('fill');
    if (fill.children.length !== n) fill.replaceChildren(...Array.from({ length: n }, () => document.createElement('i')));
    const colors = view.colors;
    const s = swarm.smooth;
    // Before a release the bar stays blank, or it would give the answer away.
    const hide = view.wager && !this.env.released;
    for (let i = 0; i < n; i++) {
      fill.children[i].style.width = hide ? '0' : `${s[i] * 100}%`;
      fill.children[i].style.background = i === 0 && colors[0] === '#f6efdc' ? '#fdf8ea' : colors[i % colors.length];
    }
  }

  drawStrip() {
    const cv = $('strip');
    const { trace } = this.env;
    if (!trace) return;
    const g = cv.getContext('2d');
    if (cv.width !== cv.clientWidth) { cv.width = cv.clientWidth; cv.height = cv.clientHeight; }
    g.clearRect(0, 0, cv.width, cv.height);
    const total = this.env.round.watch;
    trace.forEach(([t, s], i) => {
      const t2 = trace[i + 1]?.[0] ?? this.env.watched ?? t;
      g.fillStyle = s === 0 ? '#f6efdc' : '#e0452b';
      g.fillRect((t / total) * cv.width, s === 0 ? 4 : cv.height / 2 + 1, Math.max(1, ((t2 - t) / total) * cv.width), cv.height / 2 - 5);
    });
  }

  update(dt) {
    const { view: v, env, c, world, swarm } = this;
    if (!v) return;
    const play = this.mode === 'play';
    if (play && !(v.wager && !env.released && !v.night)) env.t += dt;
    if (play) env.pops = [...swarm.smooth];
    if (v.wager && !env.round) return;
    this.tickView(play ? dt : 0);

    const boost = this.boost && play ? this.boost : 1;
    const parts = boost > 1 ? 3 : 1;
    for (let i = 0; i < parts; i++) swarm.step((dt * boost) / parts, world);
    if (this.mode === 'title') {
      this.c.T = 322 + Math.sin(performance.now() / 5200) * 26;
    }
    this.scene.apply(world, v.scale);
    this.scene.walkers(swarm);

    // Sun and sky.
    const k = this.sunCtl;
    const hot = v.heat ? v.heat(world.T) : (world.T - 260) / 110;
    this.scene.heat.target = Math.max(0, Math.min(1, hot));
    const wantLook = this.mode === 'title' ? 0.62 : 0.22;
    this.scene.look += (wantLook - this.scene.look) * 0.06;
    if (k) {
      const t = toUnit(k, this.c[k.key]);
      this.scene.sun.x = 0.08 + t * 0.84;
      this.scene.sun.y = 0.815 + Math.sin(t * Math.PI) * 0.05;
      const pad = $('sunpad');
      const lab = $('sunlabel');
      lab.textContent = k.fmt(this.c[k.key]);
      lab.style.left = `${Math.max(46, Math.min(innerWidth - 46, this.scene.sun.x * innerWidth))}px`;
      const r = pad.getBoundingClientRect();
      lab.style.top = `${(1 - this.scene.sun.y) * innerHeight - r.top + 30}px`;
      pad.setAttribute('aria-valuetext', k.fmt(this.c[k.key]));
      pad.setAttribute('aria-label', 'Temperature');
      pad.setAttribute('aria-valuemin', k.min);
      pad.setAttribute('aria-valuemax', k.max);
      pad.setAttribute('aria-valuenow', Math.round(this.c[k.key]));
    } else {
      this.scene.sun.x = 0.74;
      this.scene.sun.y = 0.84;
    }
    this.sound.setHeat(this.scene.heat.value);

    if (this.mode !== 'play') return;
    const { smooth: p } = swarm;
    $('read').innerHTML = v.read(p, c, world, env);
    this.drawPop();
    document.querySelectorAll('.seal').forEach((d) => {
      const w = world.wells[+d.dataset.well];
      const at = this.scene.project(w.x, w.y);
      d.style.left = `${at.x}px`;
      d.style.top = `${at.y}px`;
      d.setAttribute('aria-valuenow', c.ES?.toFixed(1));
    });

    if (v.stages) {
      const s = env.stage;
      const ok = p[0] >= s.band[0] && p[0] <= s.band[1] && (!s.side || s.side(world.T));
      env.hold = ok ? env.hold + dt : Math.max(0, env.hold - dt * 0.7);
      $('band').classList.toggle('on', ok);
      $('band').style.boxShadow = ok ? `inset 0 ${-26 * Math.min(1, env.hold / s.secs)}px 0 rgba(200, 64, 42, .75)` : '';
      if (env.hold >= s.secs) this.stageDone();
    } else if (v.wager) {
      if (v.night && !env.released) {
        const st = swarm.state[0];
        env.watched = (env.watched ?? 0) + dt;
        if (env.trace.length === 0 || env.trace[env.trace.length - 1][1] !== st) env.trace.push([Math.min(env.watched, env.round.watch), st]);
        this.drawStrip();
        env.watching -= dt;
        if (env.watching <= 0 && $('release').disabled) {
          const b = $('release');
          b.disabled = false;
          b.textContent = 'Release the crowd';
          world.frozen = true;
        }
        if (env.watching <= 0) env.watched = env.round.watch;
      }
    } else {
      $('say').textContent = v.race(env);
      if ((v.time && env.t >= v.time) || v.done?.(env)) this.finish();
    }
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.scene.frame(now / 1000);
  }
}

try {
  window.game = new Game();
} catch (e) {
  document.body.textContent = 'This game needs WebGL, which this browser could not start.';
  console.error(e);
}
