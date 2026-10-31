// Chapter 6. A channel that only K+ can pass, and a pump the player runs through its real cycle.
import { Chapter, text, JEWEL as J, tile } from './base.js';
import { bilayer, clamp, rand, alpha, smooth } from '../kit.js';
import { goldman, newPump, pumpEvent, resetPump } from '../logic/membrane.js';
import { swellFrom } from '../logic/cell.js';

const TOP = 214; const BOT = 262;
const PX = 118; const CX = 306; // Pump and channel.
const R = 17;
const COL = { K: J.violet, Na: J.amber };
const LABEL = { K: 'K⁺', Na: 'Na⁺' };
const OUT = { k: 5, na: 145 };
const D = 6; // mM moved per ion-load in the game.
const LIMIT = 120;

export default class Ions extends Chapter {
  glass = [[0, 0.35, 40, 1.8, 0, 11], [0, 8.2, 40, 5.6, 0, 12]];

  constructor(game) {
    super(game);
    this.k = 50; this.na = 100;
    this.pump = newPump();
    this.flip = 0; // 0 faces the cytosol, 1 faces outside.
    this.ions = [];
    for (let i = 0; i < 15; i++) this.spawn('in');
    for (let i = 0; i < 12; i++) this.spawn('out');
    this.phase = 'filter';
    this.triedK = false; this.triedNa = false;
    this.wrong = 0;
    this.bound = [];
    this.anim = null;
    this.leakT = 2;
    this.traveller = null;
    this.time = 0;
    this.best = 0;
    this.reached = false;
    this.useATP();
    this.atpWait = 0;
    this.lockT = 0;
    this.rush = 0;
  }

  start() { this.t = 0; this.say('First the channel. Tap a K⁺ inside the cell, to send it up the filter.'); }

  spawn(side, from) {
    const inside = side === 'in';
    const wantNa = inside ? this.na / (this.na + this.k) : 0.92;
    const el = Math.random() < wantNa ? 'Na' : 'K';
    this.ions.push({ el, side, x: from?.x ?? rand(20, 370), y: from?.y ?? (inside ? rand(BOT + 40, 520) : rand(10, TOP - 30)), vx: rand(-14, 14), vy: rand(-14, 14), fly: null });
  }

  get vm() { return goldman({ o: OUT.k, i: this.k }, { o: OUT.na, i: this.na }); }

  wander(dt) {
    for (const i of this.ions) {
      if (i.fly) continue;
      i.vx += rand(-60, 60) * dt; i.vy += rand(-60, 60) * dt;
      i.vx = clamp(i.vx, -26, 26); i.vy = clamp(i.vy, -26, 26);
      i.x += i.vx * dt; i.y += i.vy * dt;
      const lo = i.side === 'in' ? (i.x < 232 ? BOT + 150 : BOT + 34) : 32;
      const hi = i.side === 'in' ? 520 : TOP - 24;
      if (i.y < lo) { i.y = lo; i.vy *= -1; } if (i.y > hi) { i.y = hi; i.vy *= -1; }
      if (i.x < 18) { i.x = 18; i.vx *= -1; } if (i.x > 360) { i.x = 360; i.vx *= -1; }
    }
    // Keep the two populations in step with the real concentrations inside.
    const wantNa = this.na / (this.na + this.k);
    const inside = this.ions.filter((i) => i.side === 'in' && !i.fly);
    const haveNa = inside.filter((i) => i.el === 'Na').length / (inside.length || 1);
    if (Math.random() < dt * 3) {
      const swap = inside[Math.floor(Math.random() * inside.length)];
      if (swap) { if (haveNa > wantNa + 0.05 && swap.el === 'Na') swap.el = 'K'; else if (haveNa < wantNa - 0.05 && swap.el === 'K') swap.el = 'Na'; }
    }
    const outside = this.ions.filter((i) => i.side === 'out' && !i.fly);
    if (outside.filter((i) => i.el === 'K').length < 2) { const s = outside.find((i) => i.el === 'Na'); if (s) s.el = 'K'; }
  }

  tapIon(i) {
    if (this.phase === 'filter') { this.toFilter(i); return; }
    if (this.anim || this.reached || this.lockT > 0) return;
    const st = this.pump.state;
    const inside = i.side === 'in';
    if (st === 'E1') {
      if (!inside) { this.bounce(i, 'The outer gate is shut'); return; }
      if (i.el !== 'Na') { this.bounce(i, 'E1 grips Na⁺, not K⁺', true); return; }
    } else if (st === 'E2P') {
      if (inside) { this.bounce(i, 'The inner gate is shut'); return; }
      if (i.el !== 'K') { this.bounce(i, 'E2 grips K⁺, not Na⁺', true); return; }
    } else { this.bounce(i, 'Both gates are shut'); return; }
    if (!pumpEvent(this.pump, i.el)) return;
    const n = this.bound.length;
    i.fly = { x: PX + (st === 'E1' ? (n - 1) * 20 : (n - 0.5) * 22), y: 238, t: 0, then: 'bind' };
    this.bound.push(i);
    this.sound.bell(st === 'E1' ? 4 + n * 3 : 9 + n * 3, 0.14);
    if (this.pump.state === 'E2') this.say('The phosphate falls off and the outer gate shuts on 2 K⁺. Open the inner gate.');
    else if (st === 'E1' && this.pump.na === 3) this.say('Three Na⁺ aboard. Tap ATP to phosphorylate the pump.');
    else if (st === 'E1') this.say(`${this.pump.na} Na⁺ aboard. It needs 3.`);
    else this.say(`${this.pump.k} K⁺ aboard. It needs 2.`);
  }

  bounce(i, msg, count) {
    if (count) { this.wrong += 1; this.sound.bad(); this.buzz(20); } else this.sound.tick(-8, 0.08);
    i.vy *= -1; i.vx += rand(-30, 30);
    this.fx.float(i.x, i.y - 22, msg, count ? J.ruby : J.vellum, 15);
  }

  giveATP() {
    if (this.anim || this.atpWait > 0 || !pumpEvent(this.pump, 'ATP')) return;
    this.spend(2);
    this.atpWait = (1 / this.atpPace - 1) * 2.4;
    this.sound.bell(0, 0.2);
    this.say('Phosphate on an aspartate, and the inner gate shuts on 3 Na⁺. Now open the outer gate.');
  }

  gate(which) {
    if (this.anim || this.lockT > 0 || this.phase !== 'pump' || this.reached) return;
    const r = pumpEvent(this.pump, which);
    if (r === 'collapse') { this.collapse(); return; }
    if (r) { this.startFlip(which === 'outer' ? 'out' : 'in'); return; }
    this.sound.tick(-8, 0.08);
    this.say(which === 'outer' ? 'This gate needs the phosphate first.' : 'The inner gate opens once K⁺ is aboard.');
  }

  // Both gates open at once: a hole, and the ions run down their gradients.
  collapse() {
    this.k = Math.max(20, this.k - 20);
    this.na = Math.min(140, this.na + 20);
    this.bound.forEach((i) => { i.fly = null; i.side = 'in'; i.y = BOT + 60; });
    this.bound = [];
    resetPump(this.pump);
    this.lockT = 1.4;
    this.rush = 1.4;
    this.flash(0.5);
    this.sound.bad();
    this.buzz(60);
    this.say('Both gates open: a hole through the membrane, and the gradient runs away. Palytoxin does this.');
  }

  startFlip(to) { this.anim = { to, t: 0 }; this.sound.tick(0, 0.14); }

  endFlip() {
    const { to } = this.anim;
    this.anim = null;
    const list = this.bound;
    this.bound = [];
    if (to === 'out') {
      list.forEach((i, n) => { i.fly = null; i.side = 'out'; i.x = PX - 30 + n * 30; i.y = TOP - 30; i.vy = -22; i.el = 'Na'; });
      this.na = Math.max(8, this.na - 3 * D);
      this.say('E2 faces out and lets Na⁺ go. Pick 2 K⁺ from outside.');
      this.sound.whoosh();
    } else {
      list.forEach((i, n) => { i.fly = null; i.side = 'in'; i.x = PX - 18 + n * 36; i.y = BOT + 150; i.vy = 22; });
      this.k = Math.min(145, this.k + 2 * D);
      this.say('Inner gate open, K⁺ inside. Pick 3 Na⁺ again.');
      this.flash(0.12);
      // Keep the crowd the same size on each side.
      const inside = this.ions.filter((i) => i.side === 'in').length;
      if (inside > 15) this.ions.splice(this.ions.findIndex((i) => i.side === 'in' && !i.fly && i.el === 'K'), 1);
    }
    const out = this.ions.filter((i) => i.side === 'out' && !i.fly);
    while (out.length > 14) { const x = out.pop(); this.ions.splice(this.ions.indexOf(x), 1); }
    const nIn = this.ions.filter((i) => i.side === 'in').length;
    for (let i = nIn; i < 14; i++) this.spawn('in');
    const nOut = this.ions.filter((i) => i.side === 'out').length;
    for (let i = nOut; i < 11; i++) this.spawn('out');
  }

  toFilter(i) {
    if (this.traveller || i.side !== 'in') return;
    i.fly = { x: CX, y: BOT + 26, t: 0, then: 'mouth' };
    this.traveller = i;
    this.sound.tick(3);
  }

  update(dt) {
    this.wander(dt);
    if (this.phase === 'pump' && !this.reached) this.time += dt;
    for (const i of this.ions) {
      if (!i.fly) continue;
      const f = i.fly;
      f.t += dt * 2.6;
      i.x += (f.x - i.x) * Math.min(1, dt * 11);
      i.y += (f.y - i.y) * Math.min(1, dt * 11);
      if (f.t >= 1 && f.then === 'mouth') this.atMouth(i);
      if (f.t >= 1 && f.then === 'pass') this.throughFilter(i);
      if (f.t >= 1 && f.then === 'home') { i.fly = null; if (this.traveller === i) { this.traveller = null; this.afterTry(); } }
    }
    this.atpWait = Math.max(0, this.atpWait - dt);
    this.lockT = Math.max(0, this.lockT - dt);
    this.rush = Math.max(0, this.rush - dt);
    if (this.anim) {
      this.anim.t += dt / 0.5;
      const target = this.anim.to === 'out' ? 1 : 0;
      this.flip += (target - this.flip) * Math.min(1, dt * 7);
      if (this.anim.t >= 1) this.endFlip();
    } else this.flip += ((this.pump.state === 'E2P' || this.pump.state === 'E2' ? 1 : 0) - this.flip) * Math.min(1, dt * 7);
    if (this.phase === 'pump' && !this.reached) {
      // K+ leaks out through the channel, Na+ creeps in: the gradient always runs down.
      this.k = Math.max(20, this.k - 0.45 * dt);
      this.na = Math.min(140, this.na + 0.3 * dt);
      this.leakT -= dt;
      if (this.leakT <= 0 && !this.traveller) {
        this.leakT = rand(1.4, 2.6);
        const i = this.ions.find((q) => q.side === 'in' && q.el === 'K' && !q.fly);
        if (i) this.toFilter(i);
      }
      const v = this.vm;
      this.best = Math.min(this.best, v);
      if (v <= -65) {
        this.reached = true;
        this.say('−65 mV: the membrane is charged, the inside negative.');
        this.sound.fanfare();
        this.flash(0.5);
        this.tEnd = 1.8;
      }
      if (this.time > LIMIT) this.end();
    }
    if (this.reached) { this.tEnd -= dt; if (this.tEnd <= 0) this.end(); }
    this.meters(this.phase === 'filter' ? [{ label: 'K⁺ tried', value: this.triedK ? 'yes' : 'not yet' }, { label: 'Na⁺ tried', value: this.triedNa ? 'yes' : 'not yet' }] : [{ label: 'Voltage', value: `${Math.round(this.vm)} mV`, bar: clamp(-this.vm / 75) }, { label: 'K⁺ inside', value: `${Math.round(this.k)} mM` }, { label: 'Na⁺ inside', value: `${Math.round(this.na)} mM` }, { label: 'ATP stock', value: String(Math.round(this.atp)) }]);
  }

  atMouth(i) {
    if (i.el === 'K') {
      i.bare = true;
      i.fly = { x: CX, y: 216, t: -0.6, then: 'pass' };
      this.sound.bell(11, 0.14);
    } else {
      this.sound.tick(-9, 0.14);
      if (this.phase === 'filter') { this.fx.float(CX, BOT + 4, 'Na⁺ keeps its water', J.amber, 16); this.triedNa = true; }
      i.fly = { x: i.x + rand(-40, 40), y: BOT + 80, t: 0, then: 'home' };
    }
  }

  throughFilter(i) {
    i.bare = false;
    i.side = 'out';
    i.fly = null;
    i.y = TOP - 28;
    i.vy = -20;
    this.traveller = null;
    if (this.phase === 'filter') { this.triedK = true; this.fx.float(CX, TOP - 40, 'K⁺ gives its water to the filter', J.vellum, 15); this.afterTry(); }
    else { const out = this.ions.filter((q) => q.side === 'out' && !q.fly); if (out.length > 13) this.ions.splice(this.ions.indexOf(out[0]), 1); this.spawn('in'); }
  }

  afterTry() {
    if (this.phase !== 'filter') return;
    if (this.triedK && this.triedNa) {
      this.phase = 'pump';
      this.leakT = 3;
      this.say('K⁺ leaks away, and that makes the voltage. Tap 3 Na⁺ inside for the pump.');
      this.sound.whoosh();
    } else this.say(this.triedK ? 'Now tap a Na⁺. It is smaller, so surely it fits?' : 'Now tap a K⁺.');
  }

  end() {
    const v = this.best;
    if (this.done) return;
    this.done = true;
    const cycles = this.pump.cycles;
    const clean = this.wrong === 0 && this.pump.collapses === 0;
    const roses = v <= -65 && this.time <= 60 && clean ? 3 : v <= -65 && this.wrong <= 2 ? 2 : 1;
    const swell = swellFrom(this.na);
    const word = swell > 0.25 ? ' Too much Na⁺ stayed inside, water followed it, and the cell is swollen.' : '';
    this.finish(roses, `${Math.round(v)} mV after ${cycles} pump cycles in ${Math.round(this.time)} seconds, ${this.wrong} wrong ions, ${this.pump.collapses} collapses.${word}`, { pumpCycles: cycles, cell: { vm: Math.round(this.vm), swell, atp: this.atp } });
  }

  down(x, y) {
    const b = this.ui.hit(x, y);
    if (b === 'atp') { this.giveATP(); return; }
    if (b === 'outer' || b === 'inner') { this.gate(b); return; }
    const n = this.ions.filter((i) => !i.fly).map((i) => [Math.hypot(x - i.x, y - i.y), i]).sort((a, b) => a[0] - b[0])[0];
    if (n && n[0] < 32) this.tapIon(n[1]);
  }

  drawIon(c, i) {
    const a = i.el === 'Na' ? R - 3 : R;
    if (!i.bare) {
      for (let w = 0; w < 7; w++) {
        const q = w * 0.9 + this.t * 0.6 + i.x;
        c.fillStyle = alpha(J.sky, 0.75);
        c.beginPath(); c.arc(i.x + Math.cos(q) * (a + 5), i.y + Math.sin(q) * (a + 5), 3, 0, 6.28); c.fill();
      }
    }
    c.fillStyle = J.lead; c.beginPath(); c.arc(i.x, i.y, a + 1.5, 0, 6.28); c.fill();
    const g = c.createRadialGradient(i.x - a * 0.3, i.y - a * 0.3, 0, i.x, i.y, a);
    g.addColorStop(0, '#fff'); g.addColorStop(0.3, COL[i.el]); g.addColorStop(1, COL[i.el]);
    c.fillStyle = g; c.beginPath(); c.arc(i.x, i.y, a, 0, 6.28); c.fill();
    text(c, LABEL[i.el], i.x, i.y + 1, { size: 14.5, color: '#120d1c' });
  }

  draw(c) {
    const st = this.stage;
    bilayer(c, st, TOP, BOT - TOP, '#d8b25a', this.t * 0.4);
    // Pump: two real conformations, crossfaded.
    const f = smooth(this.flip);
    if (f < 1) st.mol('nakE1', PX, 300, { k: 1.06, rot: Math.PI, colors: [J.rose, J.violet], a: 1 - f });
    if (f > 0) st.mol('nakE2', PX, 300, { k: 1.06, rot: Math.PI, colors: ['#ff7ab6', J.violet], a: f });
    // Channel, with its filter drawn from the real carbonyl rings.
    st.mol('kcsa', CX, 238, { k: 1.02, colors: [J.teal] });
    for (let i = 0; i < 4; i++) {
      const y = 216 + i * 9;
      c.strokeStyle = J.ruby; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(CX - 12, y); c.lineTo(CX - 7, y); c.moveTo(CX + 7, y); c.lineTo(CX + 12, y); c.stroke();
    }
    if (this.phase === 'filter') { c.strokeStyle = alpha(J.gold, 0.6 + 0.4 * Math.sin(this.t * 4)); c.lineWidth = 2; c.beginPath(); c.arc(CX, BOT + 26, 26, 0, 6.28); c.stroke(); }
    for (const i of this.ions) this.drawIon(c, i);
    text(c, 'K⁺ channel', CX, BOT + 10, { size: 14, chip: true });
    text(c, { E1: 'E1: open to the cell', E1P: 'Both gates shut', E2P: 'E2: open to the outside', E2: 'Both gates shut' }[this.pump.state], PX, BOT + 146, { size: 14, chip: true, color: J.gold });
    if (this.pump.state === 'E1P' || this.pump.state === 'E2P') text(c, 'P on Asp', PX + 74, BOT + 100, { size: 13.5, chip: true, color: J.emerald });
    text(c, 'Outside the cell', 8, 8, { size: 14, align: 'left', chip: true });
    text(c, `K⁺ ${OUT.k} mM, Na⁺ ${OUT.na} mM`, 368, 8, { size: 13.5, align: 'right', chip: true });
    text(c, 'Inside the cell', 8, 546, { size: 14, align: 'left', chip: true });
    // Two gates: the rule of the machine is that they are never open together.
    const p = this.pump;
    const bars = [[TOP + 4, p.outer], [BOT - 4, p.inner]];
    bars.forEach(([y, open]) => {
      const gap = open ? 16 : 0;
      c.fillStyle = J.lead; c.fillRect(PX - 26 - gap, y - 4, 24, 8); c.fillRect(PX + 2 + gap, y - 4, 24, 8);
      c.fillStyle = open ? J.emerald : J.gold; c.fillRect(PX - 25 - gap, y - 3, 22, 6); c.fillRect(PX + 3 + gap, y - 3, 22, 6);
    });
    if (this.rush > 0) for (let i = 0; i < 9; i++) { const y = TOP - 50 + ((this.t * 300 + i * 34) % 170); c.fillStyle = i % 2 ? J.amber : J.violet; c.beginPath(); c.arc(PX + (i % 3 - 1) * 8, i % 2 ? y : 2 * 240 - y, 7, 0, 6.28); c.fill(); }
    if (this.phase === 'pump') {
      const y = 558; const w = 92;
      this.ui.add(c, 'outer', 8, y, w, 60, 'Outer gate', { color: p.outer ? J.emerald : J.sky, size: 15, sub: p.outer ? 'open' : 'shut' });
      const ready = p.state === 'E1' && p.na === 3 && !this.anim;
      this.ui.add(c, 'atp', 106, y, w, 60, 'ATP', { color: J.emerald, size: 20, sub: this.atpWait > 0 ? 'scarce: wait' : `stock ${Math.round(this.atp)}`, on: ready && this.atpWait <= 0, glow: ready ? 0.3 : 0 });
      this.ui.add(c, 'inner', 204, y, w, 60, 'Inner gate', { color: p.inner ? J.emerald : J.sky, size: 15, sub: p.inner ? 'open' : 'shut' });
      // Na⁺ left inside draws water in, and the cell swells.
      const sw = swellFrom(this.na);
      const r = 13 + 15 * sw;
      c.fillStyle = J.lead; c.beginPath(); c.arc(342, 586, r + 2, 0, 6.28); c.fill();
      c.fillStyle = sw > 0.25 ? J.rose : J.amber; c.beginPath(); c.arc(342, 586, r, 0, 6.28); c.fill();
      text(c, sw > 0.25 ? 'swollen' : 'cell', 342, 586, { size: 11.5, color: '#120d1c' });
    }
    // Voltage bar.
    const v = clamp(-this.vm / 80);
    c.fillStyle = J.lead; c.fillRect(372, 298, 12, 200);
    c.fillStyle = J.gold; c.fillRect(374, 498 - 196 * v, 8, 196 * v);
    const mark = 498 - 196 * (65 / 80);
    c.fillStyle = J.vellum; c.fillRect(366, mark, 18, 2);
    text(c, '−65 mV', 362, mark, { size: 13, align: 'right', chip: true });
  }
}
