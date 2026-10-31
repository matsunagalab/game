// Mechanisms of catalytic reactions by biomolecules learner.
import { Stage } from './gfx/stage.js';
import { TitleScene } from './gfx/title.js';
import { AlbumScene } from './gfx/album.js';
import { SiteScene } from './gfx/site.js';
import { Sound } from './audio/sound.js';
import { stepBeats } from './audio/score.js';
import { UI, el } from './play/ui.js';
import { MechanismStage, Labels } from './play/mechanism.js';
import { STRATEGIES } from './play/strategies.js';
import { runEvidence } from './play/evidence.js';
import { CHAPTERS, OMP } from './chapters.js';
import { MECHS } from './chem/mechanisms.js';
import { compile, Session } from './chem/session.js';
import { charge, clone, resolveArrow } from './chem/engine.js';
import { musicFor, gapSeconds } from './logic/rates.js';
import { tierFor, SAVE_KEY, blankSave, bestTier } from './logic/score.js';
import bodies from './data/bodies.json';
import sites from './data/sites.json';
import routes from './data/routes.json';

const TITLE_LINES = ['Mechanisms of', 'catalytic reactions', 'by biomolecules', 'learner'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function failWebGL() {
  document.body.innerHTML = '<div class="fail"><h1>Mechanisms of catalytic reactions by biomolecules learner</h1><p>This game needs WebGL 2, and this browser did not provide it. Try a current browser, or turn on graphics acceleration.</p></div>';
}

class App {
  constructor() {
    const canvas = this.canvas = document.getElementById('gl');
    this.stage = new Stage(canvas);
    this.stage.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sound = new Sound();
    this.pointer = { x: 0, y: 0 };
    this.save = this.load();
    this.sound.muted = this.save.muted;
    this.ui = new UI(document.getElementById('ui'));
    this.labels = new Labels(document.getElementById('labels'));
    this.title = new TitleScene(this.stage, bodies);
    this.album = new AlbumScene(this.stage);
    this.site = new SiteScene(this.stage, bodies);
    this.front = this.buildFront();
    this.bindInput();
    this.ui.back.onclick = () => this.showAlbum();
    this.ui.mute.onclick = () => this.toggleMute();
    this.paintMute();
    new ResizeObserver(() => this.fitPane()).observe(this.ui.pane);
    addEventListener('resize', () => { this.stage.resize(); this.title.resize(); this.album.resize(); if (this.site.site) this.site.fit(); this.fitPane(); });
    document.fonts.load('700 150px "Cormorant Upright"').then(() => this.title.setTitle(TITLE_LINES, '"Cormorant Upright"'));
    this.screen = 'title'; this.active = this.title;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  load() { try { return { ...blankSave(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return blankSave(); } }
  store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* private mode */ } }

  buildFront() {
    const root = document.getElementById('ui'), f = el('div', 'front');
    f.innerHTML = '<p class="sub">Push the electrons yourself, on real active sites.</p>';
    const b = el('button', 'begin', Object.keys(this.save.tiers).length ? 'Continue' : 'Open the album');
    b.onclick = () => { this.sound.unlock(); this.showAlbum(); };
    f.append(b); root.append(f);
    this.albumUI = el('div', 'albumui');
    this.albumUI.innerHTML = '<div class="acap"><small></small><h2></h2><p></p><div class="leaves"></div></div>';
    this.albumMute = el('button', 'icon mute', '<span></span>'); this.albumMute.onclick = () => this.toggleMute(); this.albumUI.append(this.albumMute);
    this.albumUI.style.display = 'none'; root.append(this.albumUI);
    return f;
  }

  toggleMute() { this.sound.unlock(); const m = !this.sound.muted; this.sound.setMuted(m); this.save.muted = m; this.store(); this.paintMute(); }
  paintMute() { for (const b of [this.ui.mute, this.albumMute]) if (b) { b.classList.toggle('off', this.sound.muted); b.setAttribute('aria-pressed', this.sound.muted); } }
  haptic(p) { navigator.vibrate?.(p); }

  bindInput() {
    const c = this.canvas;
    const unlock = () => this.sound.unlock();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId);
      if (this.screen === 'album') { drag = { x: e.clientX, s: this.album.want, moved: 0 }; return; }
      if (this.onPointer) this.onPointer.down(e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX / innerWidth * 2 - 1; this.pointer.y = 1 - e.clientY / innerHeight * 2;
      if (this.screen === 'album' && drag) {
        const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx));
        if (this.album.joinWant) return;
        this.album.want = Math.max(0, Math.min(8, drag.s - dx / (innerWidth * 0.42)));
        this.paintAlbum();
        return;
      }
      if (this.onPointer) this.onPointer.move(e.clientX, e.clientY);
    });
    const up = (e) => {
      if (this.screen === 'album' && drag) {
        const tap = drag.moved < 12 && !this.album.joinWant; drag = null;
        if (this.album.joinWant) return;
        this.album.want = Math.round(this.album.want); this.paintAlbum();
        if (tap) { const i = this.album.pick(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2); if (i >= 0) { if (i === Math.round(this.album.want)) this.openChapter(i); else { this.album.want = i; this.paintAlbum(); } } }
        return;
      }
      if (this.onPointer) this.onPointer.up(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }

  fitPane() {
    const r = this.ui.pane.getBoundingClientRect(), wide = innerWidth / innerHeight > 1;
    if (this.screen !== 'play') return;
    if (wide) this.site.setPad({ top: 66, bottom: 40, left: Math.round(r.right + 10), right: 30 });
    else this.site.setPad({ top: 62, bottom: Math.round(innerHeight - r.top + 6), left: 0, right: 0 });
  }

  // A dive into the panel, through dark cloth, into the site.
  async through(fn) {
    const { album, stage } = this, veil = stage.mFinal.uniforms.veil;
    const ramp = (from, to, ms, each) => new Promise((res) => { const t0 = performance.now(); const go = () => { const u = Math.min(1, (performance.now() - t0) / ms); veil.value = from + (to - from) * u; each?.(u); if (u < 1) requestAnimationFrame(go); else res(); }; go(); });
    if (this.stage.reduced) { fn(); return; }
    await ramp(0, 1, 420, (u) => { album.dive = u * u; });
    fn(); album.dive = 0;
    await ramp(1, 0, 420);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; const t = now / 1000;
    this.fps = this.fps * 0.97 + (dt * 1000) * 0.03 || 16;
    this.active.update(t, dt, this.pointer);
    if (this.screen === 'play') this.labels.update((i) => charge(this.site.st, i));
    this.stage.render(this.active.scene, this.active.camera, t);
    this.tune(now);
  }

  // Slow phones get a smaller buffer, never a broken picture.
  tune(now) {
    if (now < (this.nextTune || 4000)) return;
    this.nextTune = now + 3000;
    if (this.fps > 30 && this.stage.scale > 0.6) { this.stage.scale = Math.max(0.6, this.stage.scale - 0.15); this.stage.resize(); }
  }

  // ------------------------------------------------------------------ album
  gold() { return CHAPTERS.map((c) => this.save.tiers[c.key] || 0); }

  paintWhole() {
    const q = this.albumUI.querySelector('.acap');
    q.classList.add('band');
    q.querySelector('small').textContent = 'All panels gilded';
    q.querySelector('h2').textContent = 'One pattern';
    q.querySelector('p').textContent = 'Nine panels, one rule: electrons move in pairs.';
    q.querySelector('.leaves').innerHTML = '';
  }

  paintAlbum() {
    const i = Math.round(this.album.want), ch = CHAPTERS[i], t = this.save.tiers[ch.key] || 0;
    const q = this.albumUI.querySelector('.acap');
    q.classList.remove('band');
    q.querySelector('small').textContent = `Chapter ${i + 1} of ${CHAPTERS.length}`;
    q.querySelector('h2').textContent = ch.title;
    q.querySelector('p').textContent = ch.strategy;
    q.querySelector('.leaves').innerHTML = [1, 2, 3].map((k) => `<i class="${k <= t ? 'on' : ''}"></i>`).join('');
  }

  showAlbum(gild) {
    this.token = (this.token || 0) + 1;
    this.screen = 'album'; this.active = this.album; this.onPointer = null;
    this.front.style.display = 'none'; this.ui.show(false); this.labels.clear();
    this.albumUI.style.display = 'block';
    document.getElementById('ui').classList.add('albummode');
    this.album.want = gild ?? this.save.last ?? 0;
    this.album.setGold(this.gold());
    this.album.joinWant = this.gold().every((x) => x >= 1) ? (gild === 8 ? 1 : this.album.joinWant) : 0;
    this.paintAlbum();
    this.seeAll?.remove(); this.seeAll = null;
    if (this.gold().every((x) => x >= 1)) {
      const b = this.seeAll = el('button', 'seeall', 'See the whole pattern');
      b.onclick = () => {
        this.album.joinWant = this.album.joinWant ? 0 : 1;
        b.textContent = this.album.joinWant ? 'Back to the album' : 'See the whole pattern';
        if (this.album.joinWant) this.paintWhole(); else this.paintAlbum();
      };
      this.albumUI.append(b);
    }
    this.sound.setMusic('water', { level: 1, layers: 0, gong: false, quiet: false });
  }

  musicLayers(n) { const k = this.chapter.key; this.sound.setMusic(k, { ...this.baseMusic, layers: n, gong: false }); }

  // ------------------------------------------------------------------ one chapter
  async openChapter(i) {
    const token = (this.token = (this.token || 0) + 1);
    const alive = () => this.token === token;
    const ch = this.chapter = CHAPTERS[i], { ui, site } = this;
    this.save.last = i; this.store();
    this.albumUI.style.display = 'none';
    const mech = MECHS[ch.key], data = sites[ch.key];
    await this.through(() => {
      this.screen = 'play'; this.active = site;
      ui.show(true); document.getElementById('ui').classList.remove('albummode');
      ui.clearTray(); ui.clearRow(); ui.where(ch.where);
      site.load(ch.key, mech, data, i);
    });
    const compiled = compile(mech, data, {}, routes[ch.key]);
    // Chapter text belongs to the same steps.
    const ses = this.session = new Session(compiled);
    this.startState = clone(ses.st);
    site.setState(ses.mid[0]);
    this.labels.build(data, mech, site);
    this.fitPane();
    this.baseMusic = ch.watch.rate ? musicFor(ch.watch.rate) : { level: 1 };
    this.sound.setMusic(ch.key, { ...this.baseMusic, layers: 0, gong: false });
    const prog = (this.save.progress ??= {})[ch.key] || { stage: 0 };
    let { stage = 0, strategy = false, predicted = false, hints = 0 } = prog;
    const mark = (s) => { this.save.progress[ch.key] = { stage: s, strategy, predicted, hints }; this.store(); };
    if (stage === 0) {
      ui.stage(0, `${ch.short || ch.title} · draw`);
      await ui.tell(ch.open.map((t) => [null, t]), 'Begin');
      if (!alive()) return;
      this.mech = new MechanismStage(this, ch, ses);
      this.fitPane();
      await this.mech.start();
      if (!alive()) return;
      hints = ses.hints; stage = 1; mark(1);
    } else {
      // Resume: the mechanism is already drawn, so play it through.
      for (const s of compiled.steps) for (const a of s.ref) ses.arrow(resolveArrow(ses.mid[ses.mid.length - 1], a));
      site.setState(ses.mid[ses.mid.length - 1]);
    }
    if (stage === 1) {
      ui.stage(1, `${ch.short || ch.title} · strategy`); ui.clearRow();
      strategy = await STRATEGIES[ch.strategy2](this, ch, ses);
      if (!alive()) return;
      stage = 2; mark(2);
    }
    if (stage === 2) {
      ui.stage(2, `${ch.short || ch.title} · evidence`); ui.clearRow();
      this.sound.setMusic(ch.key, { ...this.baseMusic, layers: 1, gong: true });
      predicted = await runEvidence(this, ch);
      if (!alive()) return;
      stage = 3; mark(3);
    }
    ui.stage(3, `${ch.short || ch.title} · cycle`); ui.clearRow();
    await this.watch(ch, ses, alive);
    if (!alive()) return;
    const tier = tierFor({ mechanism: true, strategy, hints, predicted });
    bestTier(this.save, ch.key, tier);
    this.save.progress[ch.key] = { stage: 0 };
    this.store();
    this.finishChapter(i, tier, { strategy, hints, predicted });
  }

  async finishChapter(i, tier, r) {
    this.ui.clearTray(); this.ui.clearRow();
    const reason = tier >= 3 ? 'Three leaves: you drew it without help, and predicted the experiment.' : tier === 2 ? (r.hints ? 'Two leaves. A third needs the mechanism with no hints.' : 'Two leaves. A third needs the key experiment predicted.') : 'One leaf. A second needs the strategy solved.';
    this.ui.say(reason, null, 'good');
    this.sound.chime();
    await new Promise((res) => this.ui.button('Gild the panel', res, 'go'));
    this.showAlbum(i);
    this.album.scroll = i;
    const done = this.gold().every((x) => x >= 1);
    if (done) {
      await wait(2000);
      this.album.joinWant = 1;
      this.paintWhole();
      if (this.seeAll) this.seeAll.textContent = 'Back to the album';
      this.sound.setMusic('ompdc', { ...musicFor(OMP.kcat), layers: 3, gong: true });
    }
  }

  // ------------------------------------------------------------------ last stage: the cycle turns, with the gong
  async watch(ch, ses, alive) {
    const { ui, site, sound } = this, w = ch.watch;
    const steps = []; let prev = this.startState;
    for (const l of ses.log) { (steps[l.step] ??= []).push({ arrows: l.arrows, st: l.st, from: prev }); prev = l.st; }
    const count = Math.min(w.steps || steps.length, steps.length), beats = stepBeats(count);
    ui.clearTray(); ui.tray.className = 'tray tall';
    const read = el('div', 'read'); ui.tray.append(read);
    let rate = w.rate, label = w.rateText, gongs = 0, tag = 'm';
    const TAGNAME = { m: 'measured', t: 'derived, teaching model' };
    const line = () => {
      read.innerHTML = `<em class="tag ${tag}">${TAGNAME[tag]}</em><p>${label}</p><em class="tag t">teaching model</em><p>${rate ? `Compressed: each 1000-fold fall doubles the gap between gongs. Here, a gong every ${gapSeconds(rate).toFixed(0)} s.` : 'A true clock would show nothing at all.'}</p>`;
    };
    line();
    ui.say(w.say);
    const replayStep = (k) => {
      const group = steps[k] || [];
      group.forEach((g, n) => setTimeout(() => {
        if (this.screen !== 'play') return;
        let cur = g.from;
        g.arrows.forEach((m, a) => setTimeout(() => this.ghost(m, cur = cur), a * 120));
        site.setState(g.st, null);
      }, n * 240));
    };
    const reset = () => site.setState(this.startState);
    reset();
    let strikes = 0;
    const onStrike = () => {
      strikes += 1;
      const b = 2 * (((strikes - 1) % 4) + 1), idx = beats.indexOf(b);
      if (idx >= 0) replayStep(idx);
      if (b === 8) setTimeout(() => { if (this.screen === 'play') reset(); }, 700);
    };
    sound.onBeat = onStrike;
    sound.onGong = () => { gongs += 1; site.burst([0, 0, 2], 22, 1.6); this.haptic(24); if (cont) cont.disabled = false; };
    if (rate) sound.setMusic(ch.key, { ...musicFor(rate), layers: 3, gong: true, noRest: true });
    else sound.setMusic(ch.key, { level: 2, layers: 1, gong: false, noRest: true });
    // With sound off the cycle still turns, on a timer.
    const timer = setInterval(() => {
      if (sound.player && !sound.muted && sound.ctx?.state === 'running') return;
      onStrike();
      if (strikes % 4 === 0) sound.onGong?.();
    }, (rate ? gapSeconds(rate) : 16) * 250);
    let cont = null, knocked = false;
    if (w.knock) {
      const k = ui.button(w.knock.label, () => {
        knocked = !knocked;
        rate = knocked ? w.knock.rate : w.rate; label = knocked ? w.knock.text : w.rateText; tag = knocked ? w.knock.tag : 'm';
        k.textContent = knocked ? 'Put it back' : w.knock.label;
        sound.setMusic(ch.key, { ...musicFor(rate), layers: 3, gong: true, noRest: true });
        line();
        ui.say(knocked ? 'Listen: the change lands at the next gong, and the gong moves further away.' : 'Listen: the gong comes back closer.');
      }, 'ghost');
      this.knockBtn = k;
    }
    cont = ui.button('Seal this panel', () => {}, 'go');
    if (rate) cont.disabled = true; 
    if (rate) setTimeout(() => { if (cont) cont.disabled = false; }, 14000);
    await new Promise((res) => { cont.onclick = res; const b = ui.back.onclick; if (!alive()) res(); });
    clearInterval(timer);
    sound.onBeat = null; sound.onGong = null;
    ui.clearTray();
  }

  // A replayed arrow, in passing: a stroke and a run of gold.
  ghost(m, st) {
    const { site } = this, spec = st.spec, z = 2;
    const P = (i) => site.pos[spec.atoms[i].id];
    const a = m.lp !== undefined ? P(m.lp) : [(P(m.b0)[0] + P(m.b1)[0]) / 2, (P(m.b0)[1] + P(m.b1)[1]) / 2];
    const b = m.to !== undefined ? P(m.to) : [(P(m.t0)[0] + P(m.t1)[0]) / 2, (P(m.t0)[1] + P(m.t1)[1]) / 2];
    const A = [a[0], a[1], z + 2], B = [b[0], b[1], z + 2];
    const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1, bul = Math.min(0.9, l * 0.42);
    const r = site.ribbon();
    r.shape(A, [(A[0] + B[0]) / 2 - dy / l * bul, (A[1] + B[1]) / 2 + dx / l * bul, A[2]], B, 0.06, true);
    r.mat.uniforms.uFlow.value = 0; r.life = 0.9;
  }
}

let app;
try { app = new App(); window.__game = app; } catch (e) { console.warn(e); failWebGL(); }
