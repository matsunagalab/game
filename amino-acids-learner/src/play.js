// One protein from first codon to folded structure.
import * as THREE from 'three';
import { AA, FAMILIES, PROTEINS, STOP_CODONS } from './data/amino.js';
import { buildQuestion, record, resultFor } from './learn.js';
import { Chain } from './chain.js';
import { dabMesh, moleculeMesh, trnaMesh } from './world.js';
import { PAPER } from './render.js';
import { slotsFor } from './stage.js';

const LIMIT_BEATS = { label: 18, name: 16, three: 13, one: 11, clue: 15, recall: 16 };
const U = 0.62; // world size of one residue spacing while the chain trails
const STEP = 1 / 60;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const backOut = (t) => { const c = 1.6; const u = t - 1; return 1 + (c + 1) * u ** 3 + c * u ** 2; };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

class Option {
  constructor(scene, code, slot, index, tinted) {
    this.code = code;
    this.slot = slot;
    this.state = 'enter';
    this.t = -index * 0.07;
    this.group = new THREE.Group();
    this.dab = dabMesh(tinted ? FAMILIES[AA[code].family].wash : PAPER);
    this.dab.position.z = -1.6;
    this.dab.scale.setScalar(slot.r * 0.94);
    this.mol = moleculeMesh(code);
    this.scale = (slot.r * 0.9) / Math.max(this.mol.userData.radius, 3.6);
    this.mol.scale.setScalar(this.scale);
    this.trna = trnaMesh();
    this.trna.scale.setScalar(Math.min(0.6, slot.r * 0.19));
    this.trna.position.set(slot.r * 0.68, -slot.r * 0.56, -0.8);
    this.trna.rotation.z = -0.5;
    this.group.add(this.dab, this.trna, this.mol);
    this.home = new THREE.Vector3(slot.x, slot.y, 2.2);
    this.from = new THREE.Vector3(slot.x + 16, slot.y + 11, 2.2);
    this.group.position.copy(this.from);
    this.phase = Math.random() * 6.28;
    this.hover = 0;
    this.hovered = false;
    scene.add(this.group);
  }

  update(dt, time) {
    this.t += dt;
    const { group, mol } = this;
    // A gentle sway shows the depth, but never turns a ring edge-on.
    const sway = Math.sin(time * 0.75 + this.phase) * 0.3;
    mol.rotation.set(-0.1 + Math.sin(time * 0.5 + this.phase) * 0.08, sway, 0);
    this.hover += ((this.hovered ? 1 : 0) - this.hover) * Math.min(1, dt * 14);
    if (this.state === 'enter') {
      const k = Math.min(1, Math.max(0, this.t / 0.55));
      group.position.lerpVectors(this.from, this.home, backOut(k));
      if (k >= 1) this.state = 'idle';
    } else if (this.state === 'idle') {
      group.position.copy(this.home);
      group.position.y += Math.sin(time * 1.3 + this.phase) * 0.1;
      group.scale.setScalar(1 + this.hover * 0.06);
    } else if (this.state === 'fly') {
      const k = Math.min(1, this.t / this.dur);
      const e = k * k * (3 - 2 * k);
      group.position.lerpVectors(this.flyFrom, this.flyTo, e);
      group.position.y += Math.sin(k * Math.PI) * 1.4;
      group.scale.setScalar(1 - e * 0.72);
      this.dab.visible = k < 0.4;
    } else if (this.state === 'leave') {
      const k = Math.min(1, this.t / 0.5);
      group.position.x = this.flyFrom.x - k * k * 30;
      group.position.y = this.flyFrom.y + k * 2;
      if (k >= 1) this.dispose();
    } else if (this.state === 'shake') {
      const k = Math.min(1, this.t / 0.45);
      group.position.copy(this.flyFrom);
      group.position.x += Math.sin(k * 26) * (1 - k) * 0.5;
      group.scale.setScalar(1 - k * 0.2);
    }
  }

  reslot(slot) {
    this.slot = slot;
    this.home.set(slot.x, slot.y, 2.2);
    this.dab.scale.setScalar(slot.r * 0.94);
    this.scale = (slot.r * 0.9) / Math.max(this.mol.userData.radius, 3.6);
    this.mol.scale.setScalar(this.scale);
  }

  go(state, extra) {
    this.state = state;
    this.t = 0;
    this.flyFrom = this.group.position.clone();
    Object.assign(this, extra);
  }

  dispose() {
    this.state = 'gone';
    this.group.removeFromParent();
    this.dab.geometry.dispose();
    this.dab.material.dispose();
    this.trna.material.dispose();
  }
}

export class Round {
  constructor(app, { protein = null, seq = null }) {
    this.app = app;
    this.protein = protein;
    this.seq = protein ? app.proteinSeq(protein.id) : seq;
    this.levelSet = [...new Set(this.seq)];
    this.index = 0;
    this.errors = 0;
    this.slipped = false;
    this.options = [];
    this.flow = 0;
    this.streak = 0;
    this.state = 'intro';
    this.t = 0;
    this.helpers = 3 + Math.floor(this.seq.length / 20);
    this.maxHelpers = this.helpers;
    this.foldF = 0;
    this.holding = false;
    this.accum = 0;
    this.gentle = protein?.id === 'chignolin';
    this.asked = 0;

    const { stage, painter } = app;
    this.chain = new Chain(this.seq, protein?.id ?? null);
    painter.scene.add(this.chain.group);
    this.chain.group.scale.setScalar(U);
    this.chain.draw();

    // mRNA: a leader, one codon for each residue, a stop codon, and a tail.
    const rand = (n) => Array.from({ length: n }, () => pick(['A', 'U', 'G', 'C'])).join('');
    const codons = [...this.seq].map((c) => pick(AA[c].codons));
    this.stopCodon = pick(STOP_CODONS);
    this.codons = [...codons, this.stopCodon];
    const leader = rand(48);
    stage.reset(leader + this.codons.join('') + rand(60), leader.length);
    stage.show(true);
    painter.mask.fade = 0;
    painter.mask.clear();
    app.ui.startRound(this);
  }

  get L() { return this.app.stage.L; }

  update(dt, time) {
    const { app, chain } = this;
    this.t += dt;
    for (const o of this.options) o.update(dt, time);
    this.options = this.options.filter((o) => o.state !== 'gone');

    // Fixed steps keep the rope stable when a phone drops frames.
    this.accum = Math.min(this.accum + dt, STEP * 3);
    while (this.accum >= STEP) {
      this.accum -= STEP;
      if (chain.native && (this.state === 'hold' || this.state === 'done')) chain.stepFold(STEP, this.foldF);
      else if (this.state !== 'lost') this.stepRope();
    }

    if (this.state === 'intro' && this.t > 0.7) this.ask();
    if (this.state === 'ask') {
      if (this.limit) {
        const left = 1 - (this.t - this.askAt) / this.limit;
        app.ui.clock(left);
        if (left <= 0) this.miss();
      }
    }
    if (this.state === 'fly' && this.t >= this.dockAt) this.docked();
    if (this.state === 'stop') this.updateStop(dt);
    if (this.state === 'hold') this.updateHold(dt);
    if (this.state === 'done') {
      if (!app.dragging) chain.group.rotation.y += dt * 0.14;
      if (this.rest) {
        const k = 1 - Math.exp(-dt * 5);
        chain.group.position.lerp(this.rest.center, k);
        chain.group.scale.setScalar(chain.group.scale.x + (this.rest.scale - chain.group.scale.x) * k);
      }
    }
    if (this.state === 'lost') this.updateLost(dt);

    chain.draw();
    app.ui.followLabels(this);
  }

  stepRope() {
    const { chain, L } = this;
    const exit = this.app.stage.exitWorld();
    const a = [exit.x / U, exit.y / U, exit.z / U];
    const n = chain.count;
    const midY = Math.max(L.zoneBottom + 0.5, (L.zoneTop + L.zoneBottom) / 2 + 0.5);
    const radius = 1.2 + 1.15 * Math.sqrt(n);
    chain.stepRope(STEP, [0, midY / U, -2.4 / U], radius, a);
  }

  ask() {
    const { app, seq, index } = this;
    if (index >= seq.length) { this.release(); return; }
    this.clearOptions();
    const code = seq[index];
    const q = buildQuestion(code, app.learner, this.levelSet);
    this.q = q;
    this.state = 'ask';
    this.askAt = this.t;
    this.asked += 1;
    const beats = LIMIT_BEATS[q.kind] * (this.gentle ? 2 : 1);
    this.limit = (this.gentle && q.kind === 'label') ? 0 : (beats * 60) / app.music.bpm;
    app.ui.showQuestion(q, this, index);
    const slots = slotsFor(this.L, q.recall ? 1 : q.options.length);
    if (q.recall) this.options = [new Option(app.painter.scene, code, slots[0], 0, false)];
    else this.options = q.options.map((c, i) => new Option(app.painter.scene, c, slots[i], i, q.kind === 'label' || q.kind === 'name'));
  }

  // The screen changed shape, so move what is on it without asking a new question.
  relayout() {
    if (this.state !== 'ask') return;
    const slots = slotsFor(this.L, this.q.recall ? 1 : this.q.options.length);
    this.options.forEach((o, i) => o.reslot(slots[i]));
  }

  clearOptions() {
    for (const o of this.options) if (o.state !== 'gone') o.dispose();
    this.options = [];
  }

  // Called with the amino acid the player chose.
  choose(code) {
    if (this.state !== 'ask') return;
    const { app, q } = this;
    app.music.tap();
    if (code === q.code) this.correct(); else this.wrong(code);
  }

  correct() {
    const { app, q } = this;
    const target = this.options.find((o) => o.code === q.code);
    const grid = app.music.nextGrid(0.2);
    const dur = Math.max(0.16, grid - app.music.now());
    app.music.note(q.code, grid);
    app.music.sweep(grid);
    if (!this.slipped) record(app.learner, q.code, true);
    app.save();
    for (const o of this.options) if (o !== target && o.state !== 'gone') o.go('leave');
    const site = app.stage.siteWorld(0);
    target.go('fly', { dur, flyTo: site });
    this.state = 'fly';
    this.dockAt = this.t + dur;
    app.ui.answered();
  }

  docked() {
    const { app, q, chain } = this;
    this.clearOptions();
    app.stage.dock();
    app.stage.advance();
    const exit = app.stage.exitWorld();
    chain.addResidue(exit.x / U, exit.y / U, exit.z / U);
    this.index += 1;
    this.slipped = false;
    this.streak += 1;
    this.flow = Math.min(1, this.streak / 10);
    app.music.flow = this.flow;
    app.ui.streak(this.streak);
    // A long clean run earns back a helper, so long proteins stay survivable.
    if (this.streak % 8 === 0 && this.helpers < this.maxHelpers) {
      this.helpers += 1;
      app.ui.helpers(this);
      app.ui.toast('A chaperone came back');
    }
    app.ui.stamp(this, this.index - 1);
    app.stage.splash(FAMILIES[AA[q.code].family].color);
    navigator.vibrate?.(12);
    this.paint();
    if (this.index >= this.seq.length) this.release();
    else {
      this.state = 'beat';
      setTimeout(() => { if (this.state === 'beat' && !this.ended) this.ask(); }, 90);
    }
  }

  // Each catch soaks more of the page, so a finished chain finishes the painting.
  paint() {
    const { app, L } = this;
    const k = this.index / this.seq.length;
    const spread = 0.12 + 0.62 * k;
    const yr = (L.riboY + L.H / 2) / L.H;
    const x = 0.5 + (Math.random() - 0.5) * spread * 1.5;
    const y = 1 - yr - Math.random() * spread;
    const size = (0.13 + 0.14 * k + this.flow * 0.08) * (L.aspect < 1 ? 1.25 : 1);
    app.painter.mask.bloom(x, y, size);
    app.painter.mask.bloom(0.5, 1 - yr, size * 0.8);
  }

  wrong(code) {
    const bad = this.options.find((o) => o.code === code);
    if (bad) bad.go('shake');
    this.fail(code);
  }

  miss() { this.fail(null); }

  fail(code) {
    const { app, q } = this;
    if (!this.slipped) {
      this.errors += 1;
      record(app.learner, q.code, false);
      app.save();
    }
    this.slipped = true;
    this.streak = 0;
    this.flow *= 0.3;
    app.music.flow = this.flow;
    app.music.wrong();
    navigator.vibrate?.([30, 40, 30]);
    this.helpers -= 1;
    app.ui.helpers(this);
    this.state = 'fix';
    app.ui.showFix(q.code, code, this.helpers <= 0);
  }

  afterFix() {
    const { app } = this;
    app.music.muffle(false);
    if (this.helpers <= 0) this.lose(); else this.ask();
  }

  lose() {
    const { app } = this;
    this.state = 'lost';
    this.lostT = 0;
    this.ended = true;
    this.clearOptions();
    app.ui.clearQuestion();
    app.music.low();
    app.music.flow = 0;
    app.ui.showLost();
  }

  updateLost(dt) {
    this.lostT += dt;
    const c = Math.max(0, this.chain.count - Math.floor(this.lostT * 26));
    this.chain.count = c;
  }

  release() {
    const { app } = this;
    this.state = 'stop';
    this.stopT = 0;
    this.buildSeconds = this.t;
    this.clearOptions();
    app.ui.showStop(this.stopCodon);
    app.stage.clearTrnas();
  }

  updateStop(dt) {
    const { app, chain } = this;
    this.stopT += dt;
    app.stage.split = smooth(0.7, 1.9, this.stopT);
    if (this.stopT > 2 && this.state === 'stop') {
      app.stage.show(false);
      if (!this.protein) { this.finish(); return; }
      const c = chain.recenter();
      chain.group.position.set(c[0] * U, c[1] * U, c[2] * U);
      this.from = chain.group.position.clone();
      this.state = 'hold';
      this.foldF = 0;
      chain.fold = 0;
      this.fit = app.foldTarget(chain);
      app.ui.showHold(true);
      app.ui.clearQuestion();
    }
  }

  updateHold(dt) {
    const { app, chain, fit } = this;
    if (this.holding) {
      const speed = 1 / (4.5 + chain.n * 0.015);
      this.foldF = Math.min(1, this.foldF + dt * speed);
      this.bloomT = (this.bloomT ?? 0) - dt;
      if (this.bloomT <= 0) {
        this.bloomT = 0.3;
        app.painter.mask.bloom(0.2 + Math.random() * 0.6, 0.1 + Math.random() * 0.8, 0.2 + this.foldF * 0.14, 1.2);
      }
      app.music.flow = Math.max(this.flow, this.foldF);
    }
    const f = this.foldF;
    chain.cartoon = smooth(0.6, 1, f);
    chain.group.position.lerpVectors(this.from, fit.center, smooth(0, 0.4, f));
    chain.group.scale.setScalar(U + (fit.scale - U) * smooth(0.05, 0.7, f));
    app.ui.holdRing(f);
    if (f >= 1) this.finish();
  }

  finish() {
    const { app, seq, protein } = this;
    this.state = 'done';
    this.ended = true;
    this.foldF = 1;
    this.holding = false;
    app.ui.showHold(false);
    app.painter.mask.bloom(0.5, 0.5, 1.1, 1.3);
    app.dragEnabled = true;
    app.music.flow = 0.5;
    const fidelity = 1 - this.errors / seq.length;
    const rate = seq.length / Math.max(1, this.buildSeconds);
    const verdict = resultFor(this.errors, seq.length);
    if (protein) {
      app.music.melody(seq);
      app.recordBest(protein.id, { fidelity, rate, verdict: verdict.name });
    }
    setTimeout(() => {
      if (this.state !== 'done' || app.round !== this) return;
      app.ui.showDone({ protein, fidelity, rate, verdict });
      if (protein) this.rest = app.foldTarget(this.chain, true);
    }, protein ? 1500 : 500);
  }

  dispose() {
    this.ended = true;
    this.clearOptions();
    this.chain.dispose();
    this.app.stage.clearTrnas();
  }
}

export const nextProtein = (id) => PROTEINS[PROTEINS.findIndex((p) => p.id === id) + 1] ?? null;
