// Starts the game and moves between pages.
import * as THREE from 'three';
import { PALETTES, PROTEINS } from './data/amino.js';
import { STRUCTURES } from './data/structures.js';
import { newLearner, practiceSequence } from './learn.js';
import { Chain } from './chain.js';
import { Music } from './audio.js';
import { nextProtein, Round } from './play.js';
import { Painter, setWash, shared } from './render.js';
import { measure, Stage } from './stage.js';
import { Ui } from './ui.js';
import { Crowd, dabMesh, moleculeMesh } from './world.js';

const SAVE_KEY = 'amino-acids-learner-v1';
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.canvas = $('gl');
    this.painter = new Painter(this.canvas);
    this.music = new Music();
    this.ui = new Ui(this);
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.crowd = new Crowd(this.painter.scene, this.touch ? 0 : 1);
    this.stage = new Stage(this.painter.scene);
    this.learner = newLearner();
    this.progress = { best: {} };
    this.load();
    this.mode = 'title';
    this.round = null;
    this.model = null; // the protein on show outside a round
    this.dragging = false;
    this.quality = this.touch ? 0.6 : 0.85;
    this.frames = 0;
    this.slowTime = 0;
    this.time = 0;
    this.last = performance.now();
    this.back = 'title';

    this.crowd.quality(this.quality);
    this.resize();
    this.bind();
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  proteinSeq(id) { return STRUCTURES.proteins[id].seq; }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved) return;
      Object.assign(this.learner.aa, saved.aa);
      this.learner.tick = saved.tick ?? 0;
      this.progress.best = saved.best ?? {};
      this.music.muted = !!saved.muted;
    } catch { /* A broken save just starts fresh. */ }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ aa: this.learner.aa, tick: this.learner.tick, best: this.progress.best, muted: this.music.muted }));
    } catch { /* Private browsing can refuse storage. The game still runs. */ }
  }

  recordBest(id, r) {
    const old = this.progress.best[id];
    if (!old || r.fidelity >= old.fidelity) this.progress.best[id] = r;
    this.save();
  }

  /* ----- layout ----- */

  renderScale() {
    const dpr = window.devicePixelRatio || 1;
    // Three times the pixels of a phone screen would be spent on detail nobody can see.
    return Math.max(1, Math.min(2, Math.max(dpr, 1.5))) * (this.scaleDown ?? 1);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.painter.resize(w, h, this.renderScale());
    const askVisible = !$('hud').hidden;
    const askBottom = askVisible ? this.ui.askBottom() : Math.min(240, h * 0.3);
    const L = measure(w, h, askBottom);
    this.L = L;
    const cam = this.painter.camera;
    cam.aspect = w / h;
    cam.position.set(0, 0, L.dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    shared.uFog.value.set(L.dist + 6, L.dist + 105);
    this.painter.post.uniforms.uInkFar.value = L.dist + 90;
    this.stage.layout(L);
    this.round?.relayout();
    if (this.mode !== 'play' && this.model) this.placeModel();
    if (this.mode === 'title') this.painter.mask.bloom(0.62, 0.62, 0.3);
  }

  palette(name) {
    const p = PALETTES[name];
    setWash(p.wash[0], p.wash[1]);
    this.crowd.palette(p.crowd);
  }

  /* ----- models outside a round ----- */

  showModel(id, painted) {
    this.clearModel();
    const chain = new Chain(this.proteinSeq(id), id, { painted: painted ? 1 : 0 });
    chain.snapNative();
    chain.draw();
    this.painter.scene.add(chain.group);
    this.model = chain;
    this.placeModel();
  }

  clearModel() {
    this.model?.dispose();
    this.model = null;
  }

  // Native size in chain units, so a tiny peptide and ubiquitin both fill the view.
  modelRadius(chain) {
    let r = 0;
    for (let i = 0; i < chain.n; i++) r = Math.max(r, Math.hypot(chain.native[i * 3], chain.native[i * 3 + 1], chain.native[i * 3 + 2]));
    return r + 0.8;
  }

  placeModel() {
    const { L, model } = this;
    const r = this.modelRadius(model);
    if (this.mode === 'title') {
      const land = L.aspect >= 1;
      const size = land ? L.H * 0.4 : L.W * 0.44;
      model.group.scale.setScalar(size / r);
      model.group.position.set(land ? L.W * 0.2 : 0, land ? 0 : -L.H * 0.1, 0);
    } else {
      const land = L.aspect >= 1;
      const size = land ? L.H * 0.34 : Math.min(L.W * 0.42, L.H * 0.17);
      model.group.scale.setScalar(size / r);
      model.group.position.set(land ? L.W * 0.24 : 0, land ? 0 : L.H * 0.26, 0);
    }
  }

  // Where the folded protein rests. With the results sheet up, it takes the space left over.
  foldTarget(chain, aroundSheet = false) {
    const { L } = this;
    const r = this.modelRadius(chain);
    const land = L.aspect >= 1;
    if (land) return { scale: (L.H * 0.4) / r, center: new THREE.Vector3(-L.W * 0.2, 0, 0) };
    const sheetTop = aroundSheet ? $('done').getBoundingClientRect().top : L.height * 0.8;
    const room = Math.max(6, sheetTop * L.perPx - 0.6);
    return {
      scale: Math.min(L.W * 0.44, room * 0.46) / r,
      center: new THREE.Vector3(0, L.H / 2 - room / 2 - 0.2, 0),
    };
  }

  /* ----- pages ----- */

  stopRound() {
    this.round?.dispose();
    this.round = null;
    this.paused = false;
    this.music.resume();
    this.dragEnabled = false;
    this.ui.clearQuestion();
    this.music.flow = 0;
  }

  showTitle() {
    this.stopRound();
    this.mode = 'title';
    this.ui.screens('title');
    this.stage.show(false);
    this.palette('cytosol');
    this.painter.mask.clear();
    this.painter.mask.fade = 0.16;
    this.showModel('ubiquitin', false);
    this.painter.post.uniforms.uInkAmount.value = 0.62;
    $('title-hint').textContent = this.ui.coarse ? 'Touch the page to paint it.' : 'Move across the page to paint it.';
    const next = PROTEINS.find((p) => !this.progress.best[p.id]);
    $('title-start').textContent = Object.keys(this.progress.best).length ? 'Continue' : 'Start';
    this.nextUp = next ?? PROTEINS[0];
    this.resize();
    this.autoBloom = 0.2;
  }

  showProteins(selected) {
    this.stopRound();
    this.mode = 'proteins';
    this.painter.post.uniforms.uInkAmount.value = 1;
    this.back = 'title';
    this.ui.screens('proteins');
    this.stage.show(false);
    this.painter.mask.fade = 0;
    this.choose(selected ?? this.nextUp?.id ?? PROTEINS[0].id);
  }

  choose(id) {
    const p = PROTEINS.find((x) => x.id === id);
    const known = !!this.progress.best[id];
    this.selected = id;
    this.palette(p.palette);
    this.painter.mask.clear();
    if (known) this.painter.mask.flood();
    this.showModel(id, known);
    this.ui.fillProteins(id, (x) => this.choose(x));
    $('protein-go').textContent = `Build ${p.name}`;
    this.nextUp = p;
  }

  showGuide() {
    this.back = this.mode === 'proteins' ? 'proteins' : 'title';
    this.ui.screens('guide');
    this.ui.fillGuide((code) => this.showSpecimen(code));
    $('guide').scrollTop = 0;
    this.mode = 'guide';
  }

  showSpecimen(code) {
    this.ui.screens('specimen');
    this.ui.fillSpecimen(code);
    this.clearSpecimen();
    this.painter.mask.clear();
    this.painter.mask.flood();
    this.mode = 'specimen';
    this.dragEnabled = true;
    const g = new THREE.Group();
    const mol = moleculeMesh(code);
    const dab = dabMesh('#fbfdf8');
    const rect = $('specimen-window').getBoundingClientRect();
    const r = Math.min(rect.width, rect.height) * 0.46 * this.L.perPx;
    mol.scale.setScalar(r * 0.95 / Math.max(mol.userData.radius, 3.8));
    dab.scale.setScalar(r * 1.08);
    dab.position.z = -5;
    g.add(mol);
    const y = this.L.H / 2 - (rect.top + rect.height / 2) * this.L.perPx;
    const x = (rect.left + rect.width / 2 - innerWidth / 2) * this.L.perPx;
    g.position.set(x, y, 0);
    dab.position.set(x, y, -4);
    this.painter.scene.add(g, dab);
    this.specimen = { group: g, dab, mol };
    if (this.model) this.model.group.visible = false;
  }

  clearSpecimen() {
    if (!this.specimen) return;
    this.specimen.group.removeFromParent();
    this.specimen.dab.removeFromParent();
    this.specimen.dab.material.dispose();
    this.specimen.dab.geometry.dispose();
    this.specimen = null;
    if (this.model) this.model.group.visible = true;
  }

  closeSpecimen() {
    this.clearSpecimen();
    this.dragEnabled = false;
    this.ui.screens('guide');
    this.ui.fillGuide((code) => this.showSpecimen(code));
    this.mode = 'guide';
  }

  leaveGuide() {
    this.clearSpecimen();
    this.dragEnabled = false;
    if (this.back === 'proteins') this.showProteins(this.selected);
    else this.showTitle();
  }

  start(protein) {
    this.stopRound();
    this.clearModel();
    this.clearSpecimen();
    this.mode = 'play';
    this.paused = false;
    this.music.unlock();
    const p = protein ?? this.nextUp ?? PROTEINS[0];
    this.palette(p.palette);
    this.music.tempo(p.bpm, 50 + (PROTEINS.indexOf(p) * 2) % 7);
    this.music.flow = 0;
    this.music.begin();
    this.ui.screens('hud');
    this.painter.post.uniforms.uInkAmount.value = 1;
    this.round = new Round(this, { protein: p });
    this.resize();
  }

  practice() {
    this.stopRound();
    this.clearModel();
    this.mode = 'play';
    this.paused = false;
    this.music.unlock();
    this.palette('anywhere');
    this.music.tempo(92, 50);
    this.music.flow = 0;
    this.music.begin();
    this.ui.screens('hud');
    this.painter.post.uniforms.uInkAmount.value = 1;
    this.round = new Round(this, { seq: practiceSequence(this.learner, 24) });
    this.resize();
  }

  afterRound(protein) {
    if (!protein) return { label: 'Practice again', go: () => this.practice() };
    const next = nextProtein(protein.id);
    if (next) {
      this.nextUp = next;
      return { label: `Build ${next.name}`, go: () => this.start(next) };
    }
    return { label: 'Practice', go: () => this.practice() };
  }

  /* ----- input ----- */

  bind() {
    const on = (id, fn) => $(id).addEventListener('click', () => { this.music.unlock(); this.music.tap(); fn(); });
    on('title-start', () => this.start(this.nextUp));
    on('title-proteins', () => this.showProteins());
    on('title-guide', () => this.showGuide());
    on('practice', () => this.practice());
    on('proteins-guide', () => this.showGuide());
    on('protein-go', () => this.start(this.nextUp));
    on('hud-pause', () => this.pause(true));
    on('pause-resume', () => this.pause(false));
    on('pause-list', () => this.showProteins());
    on('pause-sound', () => this.toggleSound());
    on('done-list', () => this.showProteins());
    on('lost-list', () => this.showProteins());
    on('lost-retry', () => {
      if (this.round && !this.round.protein) this.practice();
      else this.start(this.round?.protein ?? this.nextUp);
    });
    on('fix-go', () => this.continueFix());
    on('specimen-close', () => this.closeSpecimen());
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
      if (this.mode === 'guide') this.leaveGuide(); else this.showTitle();
    }));
    $('recall').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && this.round) this.round.choose(b.dataset.code);
    });

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    addEventListener('keydown', (e) => this.key(e));
    addEventListener('keyup', (e) => { if (e.code === 'Space' && this.round) this.round.holding = false; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.music.suspend();
        if (this.mode === 'play' && this.round?.state === 'ask') this.pause(true);
      } else if (!this.paused) this.music.resume();
    });
    // iOS can leave the audio context interrupted after a call or a screen lock.
    addEventListener('pointerdown', () => { if (this.music.ctx?.state !== 'running' && !this.paused) this.music.resume(); });
  }

  toggleSound() {
    this.music.setMuted(!this.music.muted);
    this.save();
    $('pause-sound').textContent = this.music.muted ? 'Turn sound on' : 'Turn sound off';
  }

  pause(on) {
    if (!this.round || this.round.ended) return;
    this.paused = on;
    $('pause').hidden = !on;
    $('pause-sound').textContent = this.music.muted ? 'Turn sound on' : 'Turn sound off';
    if (on) this.music.suspend(); else this.music.resume();
  }

  continueFix() {
    if (!this.round || this.round.state !== 'fix') return;
    this.ui.hideFix();
    this.round.afterFix();
  }

  optionAt(x, y) {
    const r = this.round;
    if (!r || r.state !== 'ask' || r.q.recall) return null;
    let best = null, bestD = Infinity;
    const v = new THREE.Vector3();
    for (const o of r.options) {
      if (o.state === 'gone') continue;
      v.copy(o.group.position).project(this.painter.camera);
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const reach = (o.slot.r / this.L.perPx) * 1.1;
      const d = Math.hypot(sx - x, sy - y);
      if (d < reach && d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  down(e) {
    this.music.unlock();
    this.pointer = { x: e.clientX, y: e.clientY };
    const { round } = this;
    if (this.mode === 'play' && round && !this.paused) {
      if (round.state === 'hold') { round.holding = true; return; }
      if (round.state === 'ask') {
        const o = this.optionAt(e.clientX, e.clientY);
        if (o) round.choose(o.code);
        return;
      }
    }
    if (this.mode === 'title') this.paintAt(e.clientX, e.clientY);
    if (this.dragEnabled || this.mode === 'title' || this.mode === 'proteins') this.dragging = true;
  }

  move(e) {
    const p = this.pointer;
    if (this.mode === 'title' && (e.pointerType === 'mouse' || this.dragging)) this.paintAt(e.clientX, e.clientY);
    if (this.dragging && p) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      this.turn(dy * 0.006, dx * 0.006);
      this.pointer = { x: e.clientX, y: e.clientY };
    }
    if (e.pointerType === 'mouse' && this.round && this.mode === 'play') {
      const hit = this.optionAt(e.clientX, e.clientY);
      for (const o of this.round.options) o.hovered = o === hit;
      this.canvas.style.cursor = hit ? 'pointer' : '';
    }
  }

  up() {
    this.dragging = false;
    this.pointer = null;
    if (this.round) this.round.holding = false;
  }

  turn(x, y) {
    const target = this.specimen?.group ?? (this.mode === 'play' ? this.round?.chain.group : this.model?.group);
    if (!target) return;
    target.rotation.y += y;
    target.rotation.x = Math.max(-1.3, Math.min(1.3, target.rotation.x + x));
  }

  paintAt(x, y) {
    const last = this.lastPaint;
    if (last && Math.hypot(last.x - x, last.y - y) < 12) return;
    this.lastPaint = { x, y };
    this.painter.mask.bloom(x / innerWidth, y / innerHeight, 0.075, 0.5);
  }

  key(e) {
    if (e.repeat) return;
    const { round } = this;
    if (e.code === 'Escape' && this.mode === 'play') { this.pause(!this.paused); return; }
    if (!round || this.paused || this.mode !== 'play') return;
    if (round.state === 'fix' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      this.continueFix();
      return;
    }
    if (round.state === 'hold' && e.code === 'Space') { e.preventDefault(); round.holding = true; return; }
    if (round.state !== 'ask') return;
    const n = Number(e.key);
    if (n >= 1 && n <= round.q.options.length) { round.choose(round.q.options[n - 1]); return; }
    const letter = e.key.toUpperCase();
    if (round.q.recall && /^[A-Z]$/.test(letter)) round.choose(letter);
    else if (round.q.options.includes(letter)) round.choose(letter);
  }

  /* ----- frame ----- */

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    this.watchSpeed(dt);
    if (this.paused) { this.painter.render(); return; }
    this.time += dt;
    shared.uTime.value = this.time;
    if (this.mode === 'play' && this.round) this.round.update(dt, this.time);
    this.stage.update(dt, this.time);
    if (this.model && !this.dragging) {
      this.model.group.rotation.y += dt * 0.2;
      this.model.draw();
    } else if (this.model) this.model.draw();
    if (this.specimen && !this.dragging) this.specimen.group.rotation.y += dt * 0.4;
    if (this.mode === 'title') {
      this.autoBloom -= dt;
      if (this.autoBloom <= 0) {
        this.autoBloom = 1.5 + Math.random();
        const land = this.L.aspect >= 1;
        this.painter.mask.bloom((land ? 0.7 : 0.5) + (Math.random() - 0.5) * 0.3, (land ? 0.5 : 0.62) + (Math.random() - 0.5) * 0.3, 0.14 + Math.random() * 0.1, 1.2);
      }
    }
    this.painter.mask.update(dt);
    this.painter.render();
  }

  // Phones vary a lot. If frames run long, trade sharpness and crowd size for smoothness.
  watchSpeed(dt) {
    this.frames += 1;
    this.slowTime += dt;
    if (this.frames < 90) return;
    const avg = this.slowTime / this.frames;
    this.frames = 0;
    this.slowTime = 0;
    if (avg > 0.024 && (this.scaleDown ?? 1) > 0.55) {
      this.scaleDown = (this.scaleDown ?? 1) - 0.15;
      this.quality = Math.max(0.3, this.quality - 0.12);
      this.crowd.quality(this.quality);
      this.resize();
    }
  }
}

try {
  window.__amino = new App();
} catch (err) {
  console.error(err);
  document.getElementById('nogl').hidden = false;
}
