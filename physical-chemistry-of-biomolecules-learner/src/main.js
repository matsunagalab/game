// Screens and the frame loop. The physics lives in sim/, the experiments in chapters/.
import { Printer } from './render.js';
import { Bench, Abort } from './bench.js';
import { Sound } from './audio.js';
import { EXPERIMENTS, CHAPTERS } from './chapters/index.js';
import { titleScene } from './chapters/title.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'physical-chemistry-of-biomolecules-learner-v2-bench';
const KANJI = '一二三四五六七八九十'.split('').concat(['十一', '十二', '十三', '十四', '十五', '十六', '十七']);
const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6"/></svg>';

class Game {
  constructor() {
    this.printer = new Printer($('gl'));
    this.sound = new Sound();
    this.save = { best: {}, muted: false };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {}); } catch { /* A broken save just starts fresh. */ }
    this.sound.muted = !!this.save.muted;
    this.ov = $('ov').getContext('2d');
    this.tank = { x: 0, y: 0, s: 100 };
    this.mode = 'title';
    this.index = 0;
    this.frameMs = 16;
    this.bind();
    this.layout();
    this.showTitle();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  store() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* Private browsing can refuse storage. */ }
  }

  // The print is always square, in whatever room the panel leaves.
  layout() {
    const W = innerWidth;
    const H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const ov = $('ov');
    if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(H * dpr)) {
      ov.width = Math.round(W * dpr);
      ov.height = Math.round(H * dpr);
    }
    this.dpr = dpr;
    if (this.mode === 'title' || this.mode === 'album') {
      this.tank = { x: 0, y: 0, s: Math.max(W, H) };
      this.printer.setTank(0, 0, W, H, true);
      return;
    }
    const panel = $('panel').getBoundingClientRect();
    const top = 56;
    let box;
    if (panel.left > 10) box = { x: 0, y: top, w: panel.left, h: H - top };
    else box = { x: 0, y: top, w: W, h: panel.top - top };
    const s = Math.floor(Math.min(box.w - 16, box.h - 12));
    const x = Math.round(box.x + (box.w - s) / 2);
    const y = Math.round(box.y + (box.h - s) / 2);
    this.tank = { x, y, s };
    this.printer.setTank(x, y, s, s, false);
    const pad = $('sunpad');
    pad.style.left = `${x}px`;
    pad.style.top = `${y}px`;
    pad.style.width = `${s}px`;
    pad.style.height = '56px';
  }

  screens(...shown) {
    ['title', 'album', 'play', 'brief', 'done'].forEach((id) => { $(id).hidden = !shown.includes(id); });
  }

  nextIndex() {
    const i = EXPERIMENTS.findIndex((v) => !this.save.best[v.id]);
    return i < 0 ? 0 : i;
  }

  stopBench() {
    if (this.bench) this.bench.stop();
    this.bench = null;
  }

  showTitle() {
    this.stopBench();
    this.mode = 'title';
    this.screens('title');
    this.layout();
    this.printer.setSun(false);
    this.bench = new Bench(this);
    titleScene(this.bench).catch(() => {});
    const done = Object.keys(this.save.best).length;
    $('begin').textContent = done === 0 ? 'Start at the bench' : done >= EXPERIMENTS.length ? 'Back to the first bench' : `Go to print ${this.nextIndex() + 1}`;
  }

  showAlbum() {
    this.stopBench();
    this.mode = 'album';
    this.screens('album');
    this.printer.setSun(false);
    const next = this.nextIndex();
    const groups = CHAPTERS.map((c, n) => {
      const h = document.createElement('h3');
      h.textContent = `${n + 1}. ${c}`;
      const ol = document.createElement('ol');
      EXPERIMENTS.forEach((v, i) => {
        if (v.ch !== n + 1) return;
        const got = this.save.best[v.id];
        const li = document.createElement('li');
        if (i === next && !got) li.className = 'next';
        const b = document.createElement('button');
        b.innerHTML = `<span class="sheetlet">${got?.thumb ? `<img alt="" src="${got.thumb}">` : `<span class="num" lang="ja">${KANJI[i]}</span>`}</span>
          <span class="got" aria-label="${got ? `${got.seals} of 3 seals` : 'Not printed yet'}">${got ? '力'.repeat(got.seals) : ''}</span>
          <span class="name">${v.title}</span>`;
        b.addEventListener('click', () => this.open(i));
        li.append(b);
        ol.append(li);
      });
      return [h, ol];
    }).flat();
    $('prints').replaceChildren(...groups);
  }

  open(i) {
    this.stopBench();
    this.index = i;
    this.mode = 'brief';
    const v = EXPERIMENTS[i];
    this.exp = v;
    $('bnum').textContent = `Print ${i + 1} of ${EXPERIMENTS.length} · ${CHAPTERS[v.ch - 1]}`;
    $('btitle').textContent = v.title;
    $('blede').textContent = v.lede;
    $('bgoal').replaceChildren(...v.goals.map((g) => { const li = document.createElement('li'); li.textContent = g; return li; }));
    $('vnum').textContent = `${i + 1} of ${EXPERIMENTS.length} · ${CHAPTERS[v.ch - 1]}`;
    $('vtitle').textContent = v.title;
    $('say').textContent = '';
    $('read').textContent = '';
    $('ctrl').replaceChildren();
    $('chart').hidden = true;
    $('panel').style.visibility = 'hidden';
    this.screens('play', 'brief');
    this.layout();
    this.printer.setSun(false);
    this.bench = new Bench(this);
    if (v.preview) v.preview(this.bench);
  }

  start() {
    this.stopBench();
    this.mode = 'play';
    this.screens('play');
    $('panel').style.visibility = '';
    this.layout();
    const b = new Bench(this);
    this.bench = b;
    this.exp.run(b).then((res) => { if (this.bench === b) this.finish(res); }).catch((e) => { if (!(e instanceof Abort)) console.error(e); });
  }

  finish({ seals, score }) {
    if (this.mode !== 'play') return;
    this.mode = 'done';
    const v = this.exp;
    this.renderBench(0);
    const thumb = this.printer.snapshot(220, { x: this.tank.x, y: this.tank.y, w: this.tank.s, h: this.tank.s });
    const old = this.save.best[v.id];
    if (!old || seals >= old.seals) this.save.best[v.id] = { seals, thumb };
    this.store();
    $('dtitle').textContent = v.title;
    $('dscore').textContent = score;
    $('dformula').innerHTML = v.note.formula;
    $('dtext').textContent = v.note.text;
    $('dhonest').textContent = v.note.honest;
    $('seals').innerHTML = [0, 1, 2].map((i) => `<i class="${i < seals ? 'land' : 'off'}" lang="ja" style="animation-delay:${i * 0.22}s">力</i>`).join('');
    $('dnext').textContent = this.index + 1 < EXPERIMENTS.length ? `Print ${this.index + 2}` : 'See all seventeen prints';
    this.screens('play', 'done');
    $('panel').style.visibility = 'hidden';
    if (this.bench) this.bench.alive = false;
    this.bench.pending.clear();
    $('sunpad').hidden = true;
    [0, 1, 2].slice(0, seals).forEach((i) => setTimeout(() => this.sound.thud(), i * 220 + 120));
    this.sound.chord();
  }

  bind() {
    const on = (id, fn) => $(id).addEventListener('click', () => { this.sound.unlock(); fn(); });
    on('begin', () => this.open(this.nextIndex()));
    on('to-album', () => this.showAlbum());
    on('bgo', () => this.start());
    on('dnext', () => {
      if (this.index + 1 < EXPERIMENTS.length) this.open(this.index + 1);
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
    addEventListener('resize', () => { this.printer.resize(); this.layout(); });
    addEventListener('orientationchange', () => setTimeout(() => { this.printer.resize(); this.layout(); }, 200));
    this.paintSound();

    const pad = $('sunpad');
    const sunTo = (e) => {
      const k = this.bench?.sunCtl;
      if (!k) return;
      const f = Math.max(0, Math.min(1, (e.clientX - this.tank.x - 26) / (this.tank.s - 52)));
      k.set(k.min + (k.max - k.min) * f);
    };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); sunTo(e); });
    pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) sunTo(e); });
    pad.addEventListener('keydown', (e) => {
      const k = this.bench?.sunCtl;
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!k || !d) return;
      e.preventDefault();
      k.set(Math.max(k.min, Math.min(k.max, k.value + d * (k.max - k.min) * 0.02)));
    });

    const gl = $('gl');
    gl.addEventListener('pointerdown', (e) => {
      const b = this.bench;
      if (!b?.drag || this.mode !== 'play') return;
      const [x, y] = b.wx(e.clientX, e.clientY);
      const tok = b.drag.hit(x, y, e);
      if (tok === null || tok === undefined) return;
      gl.setPointerCapture(e.pointerId);
      this.grab = { tok, b };
      e.preventDefault();
    });
    gl.addEventListener('pointermove', (e) => {
      if (!this.grab || !gl.hasPointerCapture(e.pointerId)) return;
      const { tok, b } = this.grab;
      const [x, y] = b.wx(e.clientX, e.clientY);
      b.drag?.move?.(tok, x, y);
    });
    const end = () => {
      if (!this.grab) return;
      const { tok, b } = this.grab;
      this.grab = null;
      b.drag?.end?.(tok);
    };
    gl.addEventListener('pointerup', end);
    gl.addEventListener('pointercancel', end);
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

  renderBench(t) {
    const b = this.bench;
    const r = this.printer;
    r.begin();
    if (b) for (const f of b.draws) f(r);
    r.end();
    const g = this.ov;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (b) for (const f of b.overs) f(g);
    if (b?.sunCtl && !$('sunpad').hidden) {
      const k = b.sunCtl;
      const f = (k.value - k.min) / (k.max - k.min);
      const frac = (26 + f * (this.tank.s - 52)) / this.tank.s;
      r.setSun(true, frac);
      const lab = $('sunlabel');
      lab.textContent = k.fmt ? k.fmt(k.value) : k.value.toFixed(2);
      lab.style.left = `${Math.max(46, Math.min(this.tank.s - 46, frac * this.tank.s))}px`;
      $('sunpad').setAttribute('aria-valuenow', k.value.toFixed(2));
    } else r.setSun(false);
    if (b?.reader) {
      const html = b.reader();
      if (html !== this.lastRead) { $('read').innerHTML = html; this.lastRead = html; }
    }
    if (b?.charts.length) {
      const c = $('chart');
      const w = c.clientWidth, h = c.clientHeight;
      if (w && h) {
        if (c.width !== Math.round(w * this.dpr) || c.height !== Math.round(h * this.dpr)) {
          c.width = Math.round(w * this.dpr);
          c.height = Math.round(h * this.dpr);
        }
        const x = c.getContext('2d');
        x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        x.clearRect(0, 0, w, h);
        b.charts[0](x, { x: 0, y: 0, w, h });
      }
    }
    r.frame(t);
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const raw = now - this.last;
    this.last = now;
    this.frameMs += (raw - this.frameMs) * 0.05;
    const dt = Math.max(0, Math.min(0.05, raw / 1000)) * (this.speed ?? 1);
    const b = this.bench;
    // A slow device gives simulation a smaller slice, so the picture stays smooth.
    if (b) b.pace.ms = this.frameMs > 28 ? 2.5 : this.frameMs > 20 ? 4 : 6;
    if (b && this.mode !== 'done' && this.mode !== 'album') b.tick(dt);
    this.renderBench(now / 1000);
  }
}

try {
  window.game = new Game();
} catch (e) {
  document.body.textContent = 'This game needs WebGL, which this browser could not start.';
  console.error(e);
}
