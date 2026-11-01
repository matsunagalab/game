// Screens, the frame loop and saved progress. The science lives in science/, and each chapter in chapters/.
import { World } from './world.js';
import { Sound } from './audio.js';
import { UI, foldIcons } from './ui.js';
import { load, store } from './save.js';
import { ja, tr } from './i18n.js';
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
    this.enter();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    addEventListener('resize', () => { this.world.resize(); this.layout(); });
    this.chapters = CHAPTERS;
    window.__game = this;
  }

  // A language change reloads the page, and this puts the player back on the screen they left.
  enter() {
    const { back } = this.save;
    delete this.save.back;
    store(this.save);
    if (back === 'map') this.showMap();
    else if (Number.isInteger(back) && CHAPTERS[back]) this.open(back);
    else this.showTitle();
  }

  switchLanguage() {
    this.save.lang = ja ? 'en' : 'ja';
    const chapter = this.current ? CHAPTERS.indexOf(this.current.chapter) : -1;
    this.save.back = chapter >= 0 ? chapter : $('map').hidden ? null : 'map';
    store(this.save);
    location.reload();
  }

  bind() {
    const unlock = () => this.sound.unlock();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { passive: true, capture: true });
    document.querySelectorAll('[data-sound]').forEach((b) => b.addEventListener('click', () => this.toggleSound()));
    document.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => this.showMap()));
    document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => this.showTitle()));
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => this.switchLanguage()));
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
    $('done-again').addEventListener('click', () => {
      $('done').hidden = true;
      const { chapter } = this.current ?? {};
      if (!chapter?.puzzle) return;
      // A puzzle chapter is played again in place: the level still to win, or from the start.
      this.save.stage[chapter.id] = (this.save.tier[chapter.id] ?? 0) < 3 ? chapter.stages.length - 1 : 0;
      store(this.save);
      this.open(CHAPTERS.indexOf(chapter));
    });
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
      b.setAttribute('aria-label', this.save.muted ? tr('Turn sound on', '音を出す') : tr('Turn sound off', '音を消す'));
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
    $('note').hidden = true;
    $('done').hidden = true;
  }

  showTitle() {
    this.leave();
    this.screens('title');
    const done = CHAPTERS.filter((c) => this.save.tier[c.id]).length;
    const mid = CHAPTERS.findIndex((c) => (this.save.stage[c.id] ?? 0) > 0);
    this.resumeAt = mid >= 0 ? mid : this.nextChapter();
    $('begin').textContent = mid >= 0 || (done > 0 && done < CHAPTERS.length) ? tr(`Go on with chapter ${this.resumeAt + 1}`, `第${this.resumeAt + 1}章から続ける`) : done >= CHAPTERS.length ? tr('Back to chapter 1', '第1章に戻る') : tr('Begin', 'はじめる');
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
      b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${c.title}</span><span class="folds" aria-label="${tr(`${t} of 3`, `3段階のうち${t}`)}">${foldIcons(t)}</span><span class="p">${t ? c.principle : c.tease}</span>`;
      b.addEventListener('click', () => this.open(i));
      li.append(b);
      list.append(li);
    });
    this.world.setStage(0, 0, innerWidth, innerHeight);
  }

  async open(i) {
    this.leave();
    const chapter = CHAPTERS[i];
    this.screens('play');
    this.save.last = i;
    store(this.save);
    $('ctitle').textContent = chapter.title;
    $('cnum').textContent = tr(`Chapter ${i + 1} of ${CHAPTERS.length}`, `第${i + 1}章（全${CHAPTERS.length}章）`);
    this.paintFolds(chapter);
    const run = this.current = new Run(this, chapter);
    this.sound.setOpening(0.45);
    if (chapter.puzzle) { this.ui.puzzle(true); this.ui.pipeline(chapter.place); }
    this.layout();
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

  paintFolds(chapter) { $('cfolds').innerHTML = foldIcons(this.save.tier[chapter.id] ?? 0); }

  paintLevel(chapter, s) {
    const i = CHAPTERS.indexOf(chapter) + 1, n = chapter.stages.length;
    $('cnum').textContent = tr(`Ch. ${i}, level ${s + 1} of ${n}`, `第${i}章 レベル${s + 1}/${n}`);
  }

  reach(chapter, tier) {
    const had = this.save.tier[chapter.id] ?? 0;
    if (tier <= had) return;
    this.save.tier[chapter.id] = tier;
    store(this.save);
    this.paintFolds(chapter);
    this.sound.good(tier);
    this.sound.fold();
  }

  finish(chapter) {
    const t = this.save.tier[chapter.id] ?? 0, i = CHAPTERS.indexOf(chapter);
    $('done-folds').innerHTML = foldIcons(t);
    $('done-title').textContent = chapter.title;
    $('done-principle').textContent = chapter.principle;
    // The cranes already say what was done. A puzzle chapter spells out only what is left.
    $('done-goals').innerHTML = chapter.goals.map((g, k) => [k, `${k < t ? tr('Done', '達成') : tr('Not yet', '未達成')}${tr(': ', '：')}${g}`]).filter(([k]) => !chapter.puzzle || k >= t).map((x) => x[1]).join('<br>');
    $('done-next').textContent = i + 1 < CHAPTERS.length ? tr('Next chapter', '次の章へ') : tr('All chapters', '章の一覧');
    $('done-again').textContent = !chapter.puzzle ? tr('Stay here', 'ここに残る') : t < 3 ? tr('Try level 3 again', 'レベル3をもう一度') : tr('Play again', 'もう一度');
    $('done').hidden = false;
  }

  // The stage is whatever the card leaves free. In a tall window that is above it, in a wide window beside it.
  layout() {
    if ($('play').hidden) return;
    const W = innerWidth, H = innerHeight, bar = $('bar').getBoundingClientRect().bottom, card = $('card').getBoundingClientRect();
    const wide = card.left > W * 0.4;
    const before = this.world.stage;
    // A puzzle's card is small, so a wide board may run on under it and use the whole window.
    if (wide) this.world.setStage(0, bar, this.current?.chapter?.puzzle && H >= 600 ? W : card.left, H - bar);
    else this.world.setStage(0, bar, W, Math.max(120, card.top - bar));
    const now = this.world.stage;
    // A board is refitted only when the room for it really changes, so that a new sentence does not make it breathe.
    // At the start of a level the card is only just filling, so the board takes its place at once and does not glide there.
    if (Math.abs(before.w - now.w) + Math.abs(before.h - now.h) > 24) { this.current?.onLayout?.(performance.now() - (this.current?.bornAt ?? 0) < 900 ? 0 : undefined); this.current?.reframe?.(); }
  }

  loop(now) {
    this.world.frame(now);
    requestAnimationFrame(this.loop);
  }
}

// The words in index.html. English is already there, so only Japanese needs setting.
function localise() {
  document.querySelectorAll('[data-lang]').forEach((b) => { b.textContent = ja ? 'English' : '日本語'; });
  if (!ja) return;
  const text = (sel, t) => { document.querySelector(sel).textContent = t; };
  const aria = (sel, t) => document.querySelectorAll(sel).forEach((e) => e.setAttribute('aria-label', t));
  document.documentElement.lang = 'ja';
  document.title = 'AlphaFold2の予測のしくみを学ぶ';
  document.querySelector('meta[name="description"]').content = 'AlphaFold2の考え方を、本物の配列アラインメントと立体構造で、手を動かして確かめる。切り紙の世界のゲーム。このゲームはAlphaFold2を動かしてはいない。';
  aria('#gl', '紙の三角形。1枚がタンパク質の1残基にあたる');
  text('#title h1', 'AlphaFold2の予測のしくみを学ぶ');
  text('#title .by', '本物のタンパク質で、AlphaFold2の考え方を手で確かめる。このゲームはAlphaFold2を動かしてはいない。');
  text('#to-map', '章の一覧');
  text('#map h2', '全10章');
  text('#map .credit', 'AlphaFold2のモデルと信頼度: AlphaFold Protein Structure Database, CC-BY-4.0（Jumper et al. 2021; Varadi et al. 2022）。アラインメント: Pfam, CC0。立体構造: Protein Data Bank, CC0。出典は各章の注にある。');
  aria('[data-home]', 'タイトルへ戻る');
  aria('[data-map]', '章の一覧');
  aria('#note-open', 'この章の注');
  text('#note-restart', '章を最初から');
  text('#note-close', '閉じる');
  text('#done .small i', '何も見ずに、自分の言葉で友人に説明してみる。');
  text('#done-again', 'ここに残る');
  text('#done-next', '次の章へ');
}

function fail(message) {
  const d = document.createElement('div');
  d.id = 'fail';
  d.textContent = message;
  document.body.append(d);
}

try {
  localise();
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) fail(tr('This game needs WebGL2, which this browser does not offer. Please try a recent version of Safari, Chrome, Edge or Firefox.', 'このゲームにはWebGL2が必要だが、このブラウザでは使えない。新しいSafari、Chrome、Edge、Firefoxで開いてください。'));
  else new Game();
} catch (e) {
  console.error(e);
  fail(tr('The 3D view could not start on this device. Please try a recent version of Safari, Chrome, Edge or Firefox.', 'この端末では3D表示を開始できなかった。新しいSafari、Chrome、Edge、Firefoxで開いてください。'));
}
