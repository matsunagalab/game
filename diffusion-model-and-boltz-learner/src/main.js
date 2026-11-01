// Screens, the frame loop and saved progress. The science lives in science/, and each chapter in chapters/.
import { World } from './world.js';
import { Sound } from './audio.js';
import { UI, dropIcons } from './ui.js';
import { load, store } from './save.js';
import { Abort, Run } from './run.js';
import { CHAPTERS } from './chapters/index.js';
import { titleScene } from './chapters/title.js';

const $ = (id) => document.getElementById(id);
const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6"/></svg>';

class Game {
  constructor() {
    this.world = new World($('gl'));
    this.sound = new Sound();
    this.save = load();
    this.sound.muted = !!this.save.muted;
    this.ui = new UI(this);
    this.bind();
    this.loop = this.loop.bind(this);
    this.chapters = CHAPTERS;
    window.__game = this;
    this.showTitle();
    requestAnimationFrame(this.loop);
    addEventListener('resize', () => { this.world.resize(); this.layout(true); });
  }

  bind() {
    const unlock = () => this.sound.unlock();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { passive: true, capture: true });
    document.querySelectorAll('[data-sound]').forEach((b) => b.addEventListener('click', () => this.toggleSound()));
    document.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => this.showMap()));
    document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => this.showTitle()));
    $('to-map').addEventListener('click', () => this.showMap());
    $('begin').addEventListener('click', () => this.open(this.resumeAt ?? this.nextChapter()));
    $('note-open').addEventListener('click', () => { $('note-body').innerHTML = this.current.chapter.note; $('note').hidden = false; });
    $('note-close').addEventListener('click', () => { $('note').hidden = true; });
    $('note-restart').addEventListener('click', () => {
      const i = CHAPTERS.indexOf(this.current.chapter);
      this.save.stage[this.current.chapter.id] = 0;
      store(this.save);
      this.open(i);
    });
    $('done-again').addEventListener('click', () => { $('done').hidden = true; });
    $('done-next').addEventListener('click', () => {
      $('done').hidden = true;
      const i = CHAPTERS.indexOf(this.current?.chapter);
      if (i + 1 < CHAPTERS.length) this.open(i + 1); else this.showMap();
    });
    this.paintSound();
  }

  toggleSound() {
    this.save.muted = !this.save.muted;
    this.sound.setMuted(this.save.muted);
    store(this.save);
    this.paintSound();
  }

  paintSound() {
    document.querySelectorAll('[data-sound]').forEach((b) => {
      b.innerHTML = this.save.muted ? SPEAKER_OFF : SPEAKER_ON;
      b.setAttribute('aria-label', this.save.muted ? 'Turn sound on' : 'Turn sound off');
    });
  }

  screens(...shown) { for (const id of ['title', 'map', 'play']) $(id).hidden = !shown.includes(id); }

  nextChapter() {
    const i = CHAPTERS.findIndex((c) => !this.save.tier[c.id]);
    return i < 0 ? 0 : i;
  }

  leave() {
    if (this.current) { this.current.stop(); this.current = null; }
    this.ui.clear();
    $('card').classList.remove('tall');
    $('note').hidden = true;
    $('done').hidden = true;
  }

  showTitle() {
    this.leave();
    this.screens('title');
    const done = CHAPTERS.filter((c) => this.save.tier[c.id]).length;
    const mid = CHAPTERS.findIndex((c) => (this.save.stage[c.id] ?? 0) > 0);
    this.resumeAt = mid >= 0 ? mid : this.nextChapter();
    $('begin').textContent = mid >= 0 || (done > 0 && done < CHAPTERS.length) ? `Go on with chapter ${this.resumeAt + 1}` : done >= CHAPTERS.length ? 'Back to chapter 1' : 'Begin';
    this.world.setStage(0, 0, innerWidth, innerHeight);
    const run = this.current = new Run(this, { id: 'title' });
    titleScene(run).catch((e) => { if (!(e instanceof Abort)) console.error(e); });
  }

  showMap() {
    this.leave();
    this.screens('map');
    const list = $('chapters'), next = this.nextChapter();
    list.innerHTML = '';
    CHAPTERS.forEach((c, i) => {
      const t = this.save.tier[c.id] ?? 0;
      const li = document.createElement('li');
      if (i === next && !t) li.className = 'next';
      const b = document.createElement('button');
      b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${c.title}</span><span class="drops" aria-label="${t} of 3">${dropIcons(t)}</span><span class="p">${t ? c.principle : c.tease}</span>`;
      b.addEventListener('click', () => this.open(i));
      li.append(b);
      list.append(li);
    });
    this.world.setStage(0, 0, innerWidth, innerHeight);
    const run = this.current = new Run(this, { id: 'map' });
    titleScene(run, { quiet: true }).catch((e) => { if (!(e instanceof Abort)) console.error(e); });
  }

  async open(i) {
    this.leave();
    const chapter = CHAPTERS[i];
    this.screens('play');
    this.save.last = i;
    store(this.save);
    $('ctitle').textContent = chapter.title;
    $('cnum').textContent = `Chapter ${i + 1} of ${CHAPTERS.length}`;
    this.paintDrops(chapter);
    const run = this.current = new Run(this, chapter);
    this.sound.setSigma(0);
    this.layout(true);
    try {
      await chapter.setup?.(run);
      const from = Math.min(this.save.stage[chapter.id] ?? 0, chapter.stages.length - 1);
      for (let s = from; s < chapter.stages.length; s += 1) {
        this.save.stage[chapter.id] = s;
        store(this.save);
        run.stageIndex = s;
        await chapter.stages[s](run);
        if (!run.alive) return;
        run.closeScope();
      }
      this.save.stage[chapter.id] = 0;
      store(this.save);
      this.finish(chapter);
    } catch (e) {
      if (!(e instanceof Abort)) { console.error(e); throw e; }
    }
  }

  paintDrops(chapter) { $('cdrops').innerHTML = dropIcons(this.save.tier[chapter.id] ?? 0); }

  reach(chapter, tier) {
    const had = this.save.tier[chapter.id] ?? 0;
    if (tier <= had) return;
    this.save.tier[chapter.id] = tier;
    store(this.save);
    this.paintDrops(chapter);
    this.sound.good(tier);
  }

  finish(chapter) {
    const t = this.save.tier[chapter.id] ?? 0, i = CHAPTERS.indexOf(chapter);
    $('done-drops').innerHTML = dropIcons(t);
    $('done-title').textContent = chapter.title;
    $('done-principle').textContent = chapter.principle;
    $('done-goals').innerHTML = chapter.goals.map((g, k) => `${k < t ? 'Done' : 'Not yet'}: ${g}`).join('<br>');
    $('done-next').textContent = i + 1 < CHAPTERS.length ? 'Next chapter' : 'All chapters';
    $('done').hidden = false;
  }

  // The stage is whatever the card leaves free. In a tall window that is above it, in a wide window beside it.
  layout(force = false) {
    if ($('play').hidden) return;
    const W = innerWidth, H = innerHeight, bar = $('bar').getBoundingClientRect().bottom, card = $('card').getBoundingClientRect();
    const wide = card.left > W * 0.4;
    const before = this.world.stage;
    if (wide) this.world.setStage(0, bar, card.left, H - bar);
    else this.world.setStage(0, bar, W, Math.max(120, card.top - bar));
    const now = this.world.stage;
    // A board is refitted only when the room for it really changes, so that a new sentence does not make it breathe.
    if (force || Math.abs(before.w - now.w) + Math.abs(before.h - now.h) > 40) this.current?.onLayout?.();
  }

  loop(now) {
    this.world.frame(now);
    requestAnimationFrame(this.loop);
  }
}

function fail(message) {
  const d = document.createElement('div');
  d.id = 'fail';
  d.textContent = message;
  document.body.append(d);
}

try {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) fail('This game needs WebGL2, which this browser does not offer. Please try a recent version of Safari, Chrome, Edge or Firefox.');
  else new Game();
} catch (e) {
  console.error(e);
  fail('The 3D view could not start on this device. Please try a recent version of Safari, Chrome, Edge or Firefox.');
}
