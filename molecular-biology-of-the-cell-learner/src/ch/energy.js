// Chapter 5. The ring turns only when a proton has neutralised the next site. Thermodynamics sets the stall.
import { Chapter, text, JEWEL as J } from './base.js';
import { clamp, tile, alpha, extent, anchor } from '../kit.js';
import { hPerATP, stallPmf } from '../logic/atpase.js';
import { stockFrom } from '../logic/cell.js';

const RX = 195; const RY = 372; // The ring.
const FX = 195; const FY = 146; // F1.
const GOAL = 30;
const DP = 3; // mV lost per proton through the ring.
const NADH_EVERY = 3;
const NADH_LIFE = 2.8;
const RINGS = { 8: 'c8', 10: 'c10', 14: 'c14' };
const NAMES = { 8: 'Cow, human', 10: 'Yeast, E. coli', 14: 'Spinach chloroplast' };
const BETA = ['Open', 'Loose', 'Tight'];
// Viewed from the matrix, ATP synthesis turns the rotor counterclockwise (Noji 1997 saw the reverse in hydrolysis).
const LOW = 150; // mV in the second part.

export default class Energy extends Chapter {
  glass = [[0, 0.1, 40, 3.2, 0, 14], [0, 8.2, 40, 3.8, 0, 13], [0, 3.72, 40, 0.6, 0, 11], [1.95, 3.72, 2.0, 2.0, 0, 13]];

  constructor(game) {
    super(game);
    this.c = 8;
    this.prog = 0; // Steps of the ring.
    // Sites facing the lipid hold a proton. Only the one at the channel can be bare.
    this.site = new Array(this.c).fill(true);
    this.hopT = 0;
    this.pmf = 212;
    this.atp = 0;
    this.nadh = [];
    this.nextN = 1.2;
    this.pulse = [];
    this.slips = 0;
    this.drag = null;
    this.phase = 'spin';
    this.pickTries = 0;
    this.protons = 0;
    this.time = 0;
    this.beta = [1, 0, 2]; // Chains D, E, F of F1: βDP loose, βE open, βTP tight, as in Yang 2003. Abrahams 1994 took βDP as the tight site.
    this.gamma = 0;
    this.madeThisTurn = 0;
    this.fly = [];
    this.pmfMax = 240;
  }

  beatSpec() {
    const k = 2.3; const x = 130; const y = 262;
    return {
      ends: ['Closed on ATP', 'Open'],
      line: (f) => (f < 0.4 ? 'γ is bent like a crank. Its shaft props one β open, and the other two stay shut on ATP.' : f < 0.75 ? 'These are real β subunits from one crystal: one shut, one open.' : 'As γ turns, it forces the next β open. Most of the energy goes into letting tight ATP go.'),
      draw: (c, f) => {
        const st = this.stage;
        text(c, 'Why turning γ makes ATP', 195, 16, { size: 17, color: J.gold, chip: true });
        st.mol('gammaS', x, y, { k, colors: [J.gold] });
        st.morph('beta', f, x, y, { k, colors: [J.ruby] });
        text(c, 'γ', x - 34, y + 96, { size: 20, chip: true, color: J.gold });
        text(c, 'One β subunit', 300, 96, { size: 15, chip: true, color: J.ruby });
        const a = clamp((f - 0.65) * 4);
        c.globalAlpha = a;
        text(c, 'ATP leaves', 322, 300 + (1 - a) * 20, { size: 18, color: J.gold, chip: true });
        c.globalAlpha = 1;
      },
    };
  }

  start() { this.t = 0; this.time = 0; this.say('Tap the NADH to pump protons. Then drag around the ring, counterclockwise.'); }

  get stall() { return stallPmf(this.c); }

  // Which subunit now faces the entry half-channel.
  get inlet() { return ((-Math.floor(this.prog + 1e-6)) % this.c + this.c) % this.c; }

  step(d) {
    const here = Math.floor(this.prog + 1e-6);
    // Only a neutral, protonated site can pass the gate into the lipid.
    const room = this.site[this.inlet] ? here + 1 : here + 0.12;
    const before = this.prog;
    this.prog = Math.min(room, this.prog + d);
    if (Math.floor(this.prog + 1e-6) > Math.floor(before + 1e-6)) this.click();
    if (d > 0 && !this.site[this.inlet] && this.prog >= here + 0.11 && this.prog === before) this.blocked = 0.3;
  }

  click() {
    // The site that has come right round drops its proton into the matrix, and waits bare for a new one.
    this.site[this.inlet] = false;
    this.hopT = 0;
    this.protons += 1;
    this.pmf -= DP;
    this.sound.tick(2 + (this.prog % this.c), 0.09);
    const per = this.c / 3;
    const whole = Math.floor(this.prog / per + 1e-6);
    if (whole > this.madeThisTurn) {
      this.madeThisTurn = whole;
      this.releaseATP();
    }
  }

  releaseATP() {
    this.atp += 1;
    this.beta = this.beta.map((s) => (s + 1) % 3);
    const a = this.betaAngle(this.beta.indexOf(0));
    this.fly.push({ x: FX + Math.cos(a) * 70, y: FY + Math.sin(a) * 70, a, t: 0 });
    this.sound.delivered();
    this.flash(0.08);
    this.buzz(8);
  }

  betaAngle(i) { const p = anchor('f1', `b${i + 1}`); return Math.atan2(p[1], p[0]); }

  tapNADH(n) {
    this.nadh = this.nadh.filter((m) => m !== n);
    this.pulse.push({ t: 0 });
    this.sound.tick(9, 0.1);
    this.fx.burst(n.x, n.y, J.sky, 6);
  }

  update(dt) {
    this.time += dt;
    const margin = this.pmf - this.stall;
    this.fly.forEach((f) => { f.t += dt; });
    this.fly = this.fly.filter((f) => f.t < 1);
    if (this.phase === 'spin') {
      this.nextN -= dt;
      if (this.nextN <= 0) { this.nextN = NADH_EVERY * (0.85 + Math.random() * 0.3); this.nadh.push({ x: -30, life: NADH_LIFE, y: 586 }); }
      for (const n of this.nadh) { n.life -= dt; n.x = 40 + 140 * (1 - n.life / NADH_LIFE); }
      if (this.nadh.some((n) => n.life <= 0)) this.nadh = this.nadh.filter((n) => n.life > 0);
      for (const p of this.pulse) { const before = p.t; p.t += dt; for (const mark of [0.25, 0.55, 0.85]) if (before < mark && p.t >= mark) { const add = mark < 0.5 ? 4 : mark < 0.8 ? 4 : 2; this.pmf = Math.min(this.pmfMax, this.pmf + add * DP); this.sound.tick(12, 0.05); } }
      this.pulse = this.pulse.filter((p) => p.t < 1);
      this.pmf -= 0.6 * dt; // A little leak.
    } else if (this.phase === 'choose' || this.phase === 'low') {
      this.pmf += (LOW - this.pmf) * Math.min(1, dt * 3);
    }
    // Proton hop: quick when the gradient is strong, and impossible below stall.
    if (!this.site[this.inlet]) {
      if (margin > 0) { this.hopT += dt; if (this.hopT > 0.035 + 1.4 / (margin + 7)) { this.site[this.inlet] = true; this.sound.tick(-2, 0.03); } }
    }
    // Below stall the enzyme runs backward and burns ATP.
    if (margin < 0 && !this.drag && this.phase !== 'end') {
      this.prog = Math.max(0, this.prog - dt * 1.4);
      this.back = (this.back ?? 0) + dt;
      if (this.back > 1 && this.atp > 0) { this.back = 0; this.atp -= 1; this.slips += 1; this.madeThisTurn = Math.floor(this.prog / (this.c / 3)); this.sound.bad(); this.fx.float(FX, FY + 96, 'running backward: ATP burned', J.ruby, 15); }
    }
    this.blocked = Math.max(0, (this.blocked ?? 0) - dt);
    if (this.phase === 'spin') {
      if (margin < 8 && this.t > 3) this.say(margin < 0 ? `Below ${Math.round(this.stall)} mV the gradient cannot pay for ATP. Tap NADH!` : 'The gradient is nearly spent. Tap NADH to pump.');
      else if (this.protons > 20) this.say(`${this.c} protons a turn, 3 ATP a turn: ${hPerATP(this.c).toFixed(1)} protons per ATP.`);
      else if (this.protons > 3) this.say('An arginine in subunit a blocks the straight path, so each proton must ride the ring.');
      if (this.atp >= GOAL) { this.spinTime = this.time; this.phase = 'choose'; this.nadh = []; this.pulse = []; this.say(`Now the gradient is only ${LOW} mV. Which ring can still make ATP?`); this.sound.whoosh(); this.flash(0.3); }
    } else if (this.phase === 'low') {
      if (this.ringGoal !== undefined && this.prog >= this.ringGoal) { this.phase = 'end'; this.t2 = 0; this.say('Same head, lower gear: more protons per ATP, but it works on a weak gradient.'); }
    } else if (this.phase === 'end') {
      this.t2 += dt;
      if (this.t2 > 1.8) this.end();
    }
    this.gamma += ((-(Math.floor(this.prog / (this.c / 3) + 1e-6) * 2.0944) - (this.prog % (this.c / 3)) / (this.c / 3) * 0.5) - this.gamma) * Math.min(1, dt * 14);
    this.meters([{ label: 'ATP', value: `${this.atp} of ${GOAL}`, bar: this.atp / GOAL }, { label: 'Gradient', value: `${Math.round(this.pmf)} mV`, bar: (this.pmf - 100) / 140, color: margin < 0 ? J.ruby : margin < 10 ? J.orange : J.gold }, { label: 'Stall below', value: `${Math.round(this.stall)} mV` }]);
  }

  end() {
    const right = this.pickTries === 1;
    const roses = this.slips === 0 && right && this.spinTime <= 38 ? 3 : (this.slips <= 1 && right) ? 2 : 1;
    const atp = stockFrom(this.spinTime, this.slips);
    this.finish(roses, `${GOAL} ATP in ${Math.round(this.spinTime)} seconds, ${this.protons} protons used, ${this.slips} ATP burned running backward. ATP stock for the rest of the day: ${atp}.`, { made: this.atp + 3, cell: { atp } });
  }

  chooseRing(c) {
    if (this.phase !== 'choose') return;
    this.pickTries += 1;
    const s = stallPmf(c);
    if (s > LOW) {
      this.sound.bad();
      this.say(`A ${c}-ring needs ${Math.round(s)} mV for each ATP. At ${LOW} mV it cannot turn.`);
      return;
    }
    this.c = c;
    this.site = new Array(c).fill(true);
    this.prog = 0;
    this.madeThisTurn = 0;
    this.hopT = 0;
    this.phase = 'low';
    this.ringGoal = c;
    this.sound.bell(7, 0.2);
    this.say('It turns. Drag it round once.');
  }

  angleOf(x, y) { return Math.atan2(y - RY, x - RX); }

  down(x, y, id) {
    const b = this.ui.hit(x, y);
    if (b?.startsWith?.('ring')) { this.chooseRing(+b.slice(4)); return; }
    const n = this.nadh.map((m) => [Math.hypot(x - m.x, y - m.y), m]).sort((p, q) => p[0] - q[0])[0];
    if (n && n[0] < 46) { this.tapNADH(n[1]); return; }
    if (y > 545) { if (this.nadh[0]) this.tapNADH(this.nadh[0]); return; }
    if (Math.hypot(x - RX, y - RY) < 150) { this.drag = this.angleOf(x, y); this.dragId = id; }
  }

  move(x, y, id) {
    if (this.drag === null || this.drag === undefined || id !== this.dragId) return;
    const a = this.angleOf(x, y);
    let d = a - this.drag;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    this.drag = a;
    if (d < 0 && this.phase !== 'choose' && this.phase !== 'end') this.step(-d * this.c / (2 * Math.PI));
  }

  up(x, y, id) { if (id === this.dragId) this.drag = null; }

  key(k) {
    if (k === ' ') { if (this.nadh[0]) this.tapNADH(this.nadh[0]); }
    if (k === 'ArrowRight' && this.phase !== 'choose') this.step(0.4);
  }

  draw(c) {
    const st = this.stage;
    const t = this.t;
    text(c, 'Matrix: ATP is made here', 8, 8, { size: 14, align: 'left', chip: true });
    // F1, looking down the rotor. Its three β subunits stand still and cycle through their states.
    st.mol('f1', FX, FY, { k: 1.16, colors: [J.amber, J.ruby] });
    st.mol('gamma', FX, FY, { k: 1.16, rot: this.gamma, colors: [J.gold] });
    ['b1', 'b2', 'b3'].forEach((_, i) => {
      const a = this.betaAngle(i);
      const s = this.beta[i];
      const x = FX + Math.cos(a) * 92; const y = FY + Math.sin(a) * 88;
      text(c, `β ${BETA[s]}`, clamp(x, 40, 350), y, { size: 14, chip: true, color: s === 0 ? J.gold : J.vellum });
    });
    for (const f of this.fly) {
      const x = f.x + Math.cos(f.a) * f.t * 90; const y = f.y + Math.sin(f.a) * f.t * 90;
      c.globalAlpha = 1 - f.t;
      text(c, 'ATP', x, y, { size: 20, color: J.gold, chip: true });
      c.globalAlpha = 1;
    }
    // The axle from the ring up to F1.
    c.strokeStyle = J.gold; c.lineWidth = 7; c.beginPath(); c.moveTo(RX, RY - 40); c.lineTo(RX, FY + 40); c.stroke();
    c.strokeStyle = J.lead; c.lineWidth = 1.5; c.beginPath(); c.moveTo(RX - 3.5, RY - 40); c.lineTo(RX - 3.5, FY + 40); c.moveTo(RX + 3.5, RY - 40); c.lineTo(RX + 3.5, FY + 40); c.stroke();
    // Protons queued at the entry channel.
    const queue = Math.round(clamp((this.pmf - 100) / 14, 1, 10));
    for (let i = 0; i < queue; i++) {
      const x = 372 - (i % 2) * 15 - Math.floor(i / 2) * 2 + Math.sin(t * 3 + i) * 2;
      const y = 306 + Math.floor(i / 2) * 15 + Math.cos(t * 2.4 + i) * 2;
      c.fillStyle = J.lead; c.beginPath(); c.arc(x, y, 6.5, 0, 6.28); c.fill();
      c.fillStyle = J.sky; c.beginPath(); c.arc(x, y, 5, 0, 6.28); c.fill();
    }
    // The c-ring, to the side of the stator.
    const name = RINGS[this.c];
    const ex = extent(name);
    const r = 92; const k = (r * 2.1) / Math.max(ex.w, ex.h);
    const rot = (-this.prog * 2 * Math.PI) / this.c;
    const c0 = anchor('c8', 'c1');
    st.mol(name, RX, RY, { k, rot: rot - (this.c === 8 ? Math.atan2(c0[1], c0[0]) : 0), colors: [J.ruby, '#e8542a'] });
    for (let i = 0; i < this.c; i++) {
      const a = rot - (i * 2 * Math.PI) / this.c + (this.c === 8 ? Math.PI / 8 * 0 : 0);
      const x = RX + Math.cos(a) * r * 0.82; const y = RY + Math.sin(a) * r * 0.82;
      const on = this.site[i];
      c.fillStyle = J.lead; c.beginPath(); c.arc(x, y, 7.5, 0, 6.28); c.fill();
      c.fillStyle = on ? J.sky : J.ruby; c.beginPath(); c.arc(x, y, 5.8, 0, 6.28); c.fill();
      text(c, on ? '' : '−', x, y, { size: 13 });
    }
    // Subunit a: the two half-channels at the right of the ring.
    tile(c, RX + 92, RY - 44, 38, 88, J.teal, { lead: 2.5, r: 8 });
    text(c, 'a', RX + 111, RY, { size: 18 });
    c.fillStyle = this.site[this.inlet] ? J.gold : alpha(J.ruby, 0.9);
    c.beginPath(); c.moveTo(RX + 92, RY - 5); c.lineTo(RX + 104, RY - 13); c.lineTo(RX + 104, RY + 3); c.fill();
    text(c, 'Protons wait outside the matrix', 382, 272, { size: 13.5, align: 'right', chip: true });
    // The stalk that holds the head still, drawn as a line: it is not in the structure used here.
    c.strokeStyle = J.lead; c.lineWidth = 7; c.beginPath(); c.moveTo(RX + 111, RY - 44); c.quadraticCurveTo(RX + 124, FY + 60, FX + 84, FY + 30); c.stroke();
    c.strokeStyle = J.teal; c.lineWidth = 4; c.beginPath(); c.moveTo(RX + 111, RY - 44); c.quadraticCurveTo(RX + 124, FY + 60, FX + 84, FY + 30); c.stroke();
    text(c, 'stalk holds the head still', 382, FY + 44, { size: 13, align: 'right', chip: true });
    text(c, 'Arg⁺', RX + 111, RY + 28, { size: 13, color: '#fff8e6' });
    if (this.blocked > 0) text(c, 'A bare − site cannot enter the lipid', RX, RY + 118, { size: 14.5, color: J.ruby, chip: true });
    // The chain that keeps the gradient up.
    if (this.phase === 'spin') {
      const y = 586;
      const nodes = [[250, 'I', 4], [305, 'III', 4], [360, 'IV', 2]];
      nodes.forEach(([x, n]) => { tile(c, x - 24, y - 24, 48, 48, J.violet, { glow: this.pulse.some((p) => Math.abs(p.t - (x === 250 ? 0.25 : x === 305 ? 0.55 : 0.85)) < 0.14) ? 0.8 : 0 }); text(c, n, x, y + 1, { size: 20 }); });
      text(c, 'Tap NADH: complexes I, III, IV pump protons', 195, 548, { size: 13.5, chip: true });
      for (const n of this.nadh) {
        tile(c, n.x - 34, n.y - 22, 68, 44, J.sky, { glow: 0.4 });
        text(c, 'NADH', n.x, n.y + 1, { size: 17, color: '#0d1830' });
      }
      for (const p of this.pulse) { const q = clamp(p.t); const x = 215 + q * 150; c.fillStyle = J.gold; c.beginPath(); c.arc(x, y - 30, 4, 0, 6.28); c.fill(); }
    } else if (this.phase === 'choose') {
      [8, 10, 14].forEach((n, i) => this.ui.add(c, `ring${n}`, 10 + i * 125, 500, 120, 88, `${n} subunits`, { color: i === 0 ? J.ruby : i === 1 ? J.amber : J.emerald, size: 19, sub: NAMES[n] }));
    }
  }
}
