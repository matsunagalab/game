// Chapter 8. Aurora B corrects the spindle, loose kinetochores hold APC/C back, APC/C marks securin,
// separase cuts cohesin, and the window divides.
import { Chapter, text, JEWEL as J, tile, clamp, alpha } from './base.js';
import { smooth, rand } from '../kit.js';
import { UB_NEEDED, canDegrade, pairTension, checkpointSatisfied } from '../logic/mitosis.js';

const N = 5;
const POLE = { n: { x: 195, y: 34 }, s: { x: 195, y: 536 } };
const MID = 285;
const XS = [62, 128, 195, 262, 328];
const STRETCH = 34;
const SUBSTRATES = ['Securin', 'Cyclin B'];
const SPOTS = [[-118, -40], [118, -40], [-140, 60], [140, 60], [-96, 150], [96, 150], [0, 176], [0, -120]];

export default class Division extends Chapter {
  glass = [[0, 2.85, 40, 40, 0, 11], [1.95, 2.85, 2.5, 3.6, 0, 9], [1.95, 0.34, 0.5, 0.5, 0, 10], [1.95, 5.36, 0.5, 0.5, 0, 10]];

  constructor(game) {
    super(game);
    const start = [{ a: 'n', b: 'n' }, { a: 's', b: 's' }, { a: 'n', b: null }, { a: null, b: 's' }, { a: 'n', b: 's' }].sort(() => Math.random() - 0.5);
    this.pairs = XS.map((x, i) => ({ x, ...start[i], ta: rand(1.5, 3), tb: rand(1.5, 3), gap: 0, reach: 0 }));
    this.phase = 'spindle';
    this.broken = 0;
    this.taps = 0;
    this.hold = 0;
    this.sub = 0;
    this.ub = 0;
    this.dial = 0;
    this.dialV = 2.6;
    this.target = rand(1, 5);
    this.flash2 = 0;
    this.misses = 0;
    this.chew = 0;
    this.cuts = 0;
    this.firstCut = 0;
    this.path = null;
    this.t2 = 0;
    this.spread = 0;
    this.time = 0;
    this.mcc = 2;
    this.packs = [];
    this.loose = -1;
    this.looseT = 0;
    this.slipped = false;
    this.lockT = 0;
    this.useATP();
  }

  start() { this.t = 0; this.say('Pairs with a red ring have no tension. Tap one, and Aurora B can reach its kinetochores.'); }

  tapPair(p) {
    if (p.a === null || p.b === null) { this.say('This kinetochore is still searching. A microtubule will find it by itself.'); this.sound.tick(-8, 0.08); return; }
    this.taps += 1;
    p.reach = 0.9;
    if (pairTension(p)) {
      this.broken += 1;
      this.sound.bad();
      this.buzz(30);
      this.say('That pair is under tension, so its kinetochores are stretched out of Aurora B\'s reach.');
      p.reach = 0.25;
      return;
    }
    this.sound.tick(4);
    // No pull stretches the sisters apart, so Aurora B reaches the kinetochores and the grip loosens.
    p.a = null; p.b = null; p.ta = rand(1.1, 2); p.tb = rand(1.1, 2);
  }

  // Microtubules search at random, so a new grip can be wrong again.
  capture(p, key) {
    const home = key === 'a' ? 'n' : 's';
    p[key] = Math.random() < 0.74 ? home : (home === 'n' ? 's' : 'n');
    if (pairTension(p)) { this.sound.bell(7, 0.12); this.fx.burst(p.x, MID, J.emerald, 6); } else this.sound.tick(-6, 0.08);
  }

  loosePairs() { return this.pairs.filter((p) => p.a === null || p.b === null); }

  update(dt) {
    this.t2 += dt;
    if (this.phase !== 'part') this.time += dt;
    this.lockT = Math.max(0, this.lockT - dt);
    if (this.phase === 'spindle') this.stepSpindle(dt);
    else if (this.phase === 'check') this.stepCheck(dt);
    else if (this.phase === 'ub') this.stepUb(dt);
    else if (this.phase === 'cut') {
      if (this.cuts >= N) { this.phase = 'part'; this.t2 = 0; this.say('Every ring is cut, and the sisters are pulled to opposite poles.'); this.sound.fanfare(); this.flash(0.6); }
      this.meters([{ label: 'Cohesin rings cut', value: `${this.cuts} of ${N}`, bar: this.cuts / N }, { label: 'Separase', value: 'active' }]);
    } else {
      this.spread = smooth(this.t2 / 2.2);
      if (this.t2 > 2.5) this.end();
    }
  }

  stepSpindle(dt) {
    for (const p of this.pairs) {
      p.reach = Math.max(0, p.reach - dt);
      if (p.a === null) { this.mcc = Math.min(12, this.mcc + dt * 0.7); p.ta -= dt; if (p.ta <= 0) this.capture(p, 'a'); }
      if (p.b === null) { this.mcc = Math.min(12, this.mcc + dt * 0.7); p.tb -= dt; if (p.tb <= 0) this.capture(p, 'b'); }
      p.gap += ((pairTension(p) ? 1 : 0) - p.gap) * Math.min(1, dt * 6);
    }
    const good = this.pairs.filter(pairTension).length;
    if (checkpointSatisfied(this.pairs)) {
      this.hold += dt;
      if (this.hold > 0.8) this.toCheck();
    } else this.hold = 0;
    this.meters([{ label: 'Pairs with tension', value: `${good} of ${N}`, bar: good / N }, { label: 'MCC made', value: String(Math.round(this.mcc)) }, { label: 'Grips broken', value: String(this.broken) }]);
  }

  toCheck() {
    this.phase = 'check';
    this.t2 = 0;
    const n = Math.max(5, Math.min(7, Math.round(this.mcc)));
    this.packs = SPOTS.slice(0, n).map(([dx, dy]) => ({ dx, dy, life: 0 }));
    this.say('MCC still holds Cdc20, and with no Cdc20, APC/C waits. Tap MCC to pull it apart with ATP.');
    this.sound.whoosh();
    this.flash(0.3);
  }

  tapPack(m) {
    if (this.lockT > 0) return;
    this.packs = this.packs.filter((q) => q !== m);
    this.spend(1);
    this.lockT = (1 / this.atpPace - 1) * 0.7;
    this.sound.bell(5, 0.12);
    this.fx.burst(195 + m.dx, 214 + m.dy, J.gold, 8);
    if (!this.slipped && this.packs.length <= 3) {
      this.slipped = true;
      this.loose = 1 + Math.floor(Math.random() * 3);
      this.looseT = 3.6;
      this.sound.warn();
      this.say('One kinetochore has slipped. It alone makes new MCC, and the whole cell waits.');
    }
  }

  stepCheck(dt) {
    if (this.loose >= 0) {
      this.looseT -= dt;
      if (Math.floor((this.looseT + dt) / 0.9) !== Math.floor(this.looseT / 0.9) && this.packs.length < 8) {
        const free = SPOTS.find(([dx, dy]) => !this.packs.some((m) => m.dx === dx && m.dy === dy));
        if (free) this.packs.push({ dx: free[0], dy: free[1], life: 0 });
      }
      if (this.looseT <= 0) { this.loose = -1; this.say('A microtubule has caught it again. Now clear the MCC.'); this.sound.bell(7, 0.14); }
    } else if (this.packs.length === 0) {
      this.phase = 'ub';
      this.t2 = 0;
      this.say('Cdc20 is free and APC/C fires. Tap when the ubiquitin meets the lysine.');
      this.sound.whoosh();
      this.flash(0.4);
    }
    this.meters([{ label: 'MCC on Cdc20', value: String(this.packs.length) }, { label: 'Loose kinetochores', value: this.loose >= 0 ? '1' : '0' }, { label: 'ATP stock', value: String(Math.round(this.atp)) }]);
  }

  stepUb(dt) {
    this.dial = (this.dial + this.dialV * dt) % 6.2832;
    this.flash2 = Math.max(0, this.flash2 - dt);
    if (this.chew > 0) {
      this.chew += dt;
      if (this.chew > 1.5) {
        this.chew = 0; this.ub = 0; this.sub += 1; this.dialV += 0.5; this.target = rand(1, 5);
        if (this.sub >= SUBSTRATES.length) { this.phase = 'cut'; this.t2 = 0; this.say('Separase is free. Swipe across the chromosomes, through all five rings.'); this.sound.whoosh(); this.flash(0.5); } else this.say('Securin is gone, so separase can act. Cyclin B falls at the same time, or the cell cannot leave mitosis.');
      }
    }
    this.meters([{ label: SUBSTRATES[Math.min(this.sub, 1)], value: `${this.ub} of ${UB_NEEDED} ubiquitins`, bar: this.ub / UB_NEEDED }, { label: 'Misses', value: String(this.misses) }, { label: 'ATP stock', value: String(Math.round(this.atp)) }]);
  }

  end() {
    const clean = this.broken === 0;
    const stroke = this.strokeTime !== undefined && this.strokeTime <= 1;
    const roses = clean && stroke ? 3 : clean ? 2 : 1;
    this.finish(roses, `${Math.round(this.time)} seconds, ${this.broken} good grip${this.broken === 1 ? '' : 's'} broken, all ${N} rings cut ${stroke ? 'in one stroke' : 'in several strokes'}.`, { divided: true, cell: { atp: this.atp } });
    this.game.result.split = true;
    this.game.result.hold = 0.2;
  }

  tapUb() {
    if (this.chew > 0 || this.lockT > 0) return;
    let d = Math.abs(this.dial - this.target);
    d = Math.min(d, 6.2832 - d);
    if (d < 0.36) {
      this.ub += 1;
      this.spend(1);
      this.lockT = (1 / this.atpPace - 1) * 0.8;
      this.sound.bell(4 + this.ub * 3, 0.16);
      this.fx.burst(195, 250, J.gold, 8);
      this.target = (this.target + rand(1.6, 3.6)) % 6.2832;
      if (canDegrade(this.ub)) { this.chew = 0.001; this.sound.whoosh(false); this.say('A long enough chain: the proteasome pulls it in and cuts it to pieces.'); }
    } else {
      this.misses += 1;
      this.flash2 = 0.25;
      if (this.ub > 0 && this.misses % 2 === 0) { this.ub -= 1; this.say('A deubiquitinase trimmed the chain. Time the ring on the lysine.'); }
      this.sound.tick(-9, 0.1);
    }
  }

  down(x, y) {
    if (this.phase === 'spindle') {
      const p = this.pairs.map((q) => [Math.abs(x - q.x), q]).sort((a, b) => a[0] - b[0])[0];
      if (p[0] < 34 && Math.abs(y - MID) < 110) this.tapPair(p[1]);
    } else if (this.phase === 'check') {
      const m = this.packs.map((q) => [Math.hypot(x - (195 + q.dx), y - (214 + q.dy)), q]).sort((a, b) => a[0] - b[0])[0];
      if (m && m[0] < 52) this.tapPack(m[1]);
    } else if (this.phase === 'ub') this.tapUb();
    else if (this.phase === 'cut') { this.path = { x, y }; this.slice(x, y); }
  }

  move(x, y) { if (this.phase === 'cut' && this.path) { this.slice(x, y); this.path = { x, y }; } }

  up() { this.path = null; }

  key(k) {
    if (k === ' ') { if (this.phase === 'ub') this.tapUb(); else if (this.phase === 'check' && this.packs[0]) this.tapPack(this.packs[0]); }
    const i = +k - 1;
    if (this.pairs[i] && this.phase === 'spindle') this.tapPair(this.pairs[i]);
  }

  slice(x, y) {
    const a = this.path;
    if (!a) return;
    for (const p of this.pairs) {
      if (p.cut) continue;
      const hit = Math.abs(y - MID) < 40 && ((a.x - p.x) * (x - p.x) <= 0 || Math.abs(x - p.x) < 26);
      if (hit) {
        p.cut = true;
        this.cuts += 1;
        if (this.cuts === 1) this.firstCut = this.t;
        if (this.cuts === N) this.strokeTime = this.t - this.firstCut;
        this.sound.bell(5 + this.cuts * 2, 0.18);
        this.fx.burst(p.x, MID, J.gold, 14, 130);
      }
    }
  }

  drawSister(c, x, y, tens) {
    const col = tens ? J.emerald : J.rose;
    c.lineCap = 'round';
    for (const [w, k] of [[17, J.lead], [12, col]]) {
      c.strokeStyle = k; c.lineWidth = w;
      c.beginPath(); c.moveTo(x - 11, y - 6); c.lineTo(x + 11, y + 6); c.moveTo(x + 11, y - 6); c.lineTo(x - 11, y + 6); c.stroke();
    }
    c.lineCap = 'butt';
  }

  mt(c, pole, x, y, ok) {
    c.strokeStyle = J.lead; c.lineWidth = 4; c.beginPath(); c.moveTo(pole.x, pole.y); c.lineTo(x, y); c.stroke();
    c.strokeStyle = ok ? J.vellum : alpha(J.ruby, 0.9); c.lineWidth = 2; c.beginPath(); c.moveTo(pole.x, pole.y); c.lineTo(x, y); c.stroke();
  }

  // The chain of command, always on show: loose kinetochores make MCC, MCC blocks APC/C, and APC/C leads to the cut.
  drawCircuit(c, y) {
    const on = [this.loosePairs().length > 0 || this.loose >= 0, this.phase === 'spindle' || this.packs.length > 0, ['ub', 'cut', 'part'].includes(this.phase), ['cut', 'part'].includes(this.phase)];
    const names = ['Loose kinetochore', 'MCC on Cdc20', 'APC/C', 'Separase'];
    const joins = ['→', '⊣', '→']; // APC/C frees separase, by destroying securin.
    const w = 88; const gap = 8;
    names.forEach((n, i) => {
      const x = 7 + i * (w + gap);
      tile(c, x, y, w, 30, on[i] ? (i < 2 ? J.ruby : J.emerald) : '#39344a', { lead: 1.5, r: 4 });
      text(c, n, x + w / 2, y + 15, { size: i === 0 ? 10.5 : 12.5 });
      if (i < 3) text(c, joins[i], x + w + gap / 2, y + 15, { size: 13, color: J.gold, chip: true });
    });
  }

  drawSpindle(c) {
    const st = this.stage;
    Object.values(POLE).forEach((p) => {
      const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, 30);
      g.addColorStop(0, '#fff7cf'); g.addColorStop(0.5, J.gold); g.addColorStop(1, alpha(J.gold, 0));
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 30, 0, 6.28); c.fill();
    });
    for (const p of this.pairs) {
      const gap = 10 + STRETCH * p.gap;
      const pull = this.spread;
      const ty = MID - gap / 2 - pull * 170;
      const by = MID + gap / 2 + pull * 170;
      const tens = pairTension(p);
      if (p.a) this.mt(c, POLE[p.a], p.x, ty, tens);
      if (p.b) this.mt(c, POLE[p.b], p.x, by, tens);
      // Cohesin holds the sisters together until separase cuts it.
      if (!p.cut) {
        c.strokeStyle = J.lead; c.lineWidth = 6; c.beginPath(); c.ellipse(p.x, MID, 17, Math.max(11, gap / 2 + 3), 0, 0, 6.28); c.stroke();
        c.strokeStyle = this.phase === 'cut' ? J.gold : J.amber; c.lineWidth = 3; c.beginPath(); c.ellipse(p.x, MID, 17, Math.max(11, gap / 2 + 3), 0, 0, 6.28); c.stroke();
      }
      this.drawSister(c, p.x, ty, tens || this.spread > 0);
      this.drawSister(c, p.x, by, tens || this.spread > 0);
      // Aurora B stays between the sisters. Tension carries the kinetochores out of its reach.
      if (!p.cut) st.mol('aur', p.x, MID, { k: 0.32, colors: [J.violet, J.gold] });
      if (p.reach > 0) {
        const r = pairTension(p) ? 14 : gap / 2 + 8;
        c.strokeStyle = alpha(J.violet, clamp(p.reach * 2)); c.lineWidth = 3;
        c.beginPath(); c.moveTo(p.x, MID); c.lineTo(p.x, MID - r); c.moveTo(p.x, MID); c.lineTo(p.x, MID + r); c.stroke();
      }
      const lacking = p.a === null || p.b === null;
      if (!tens && this.phase === 'spindle' && !lacking) { c.strokeStyle = alpha(J.ruby, 0.7 + 0.3 * Math.sin(this.t * 6)); c.lineWidth = 3; c.beginPath(); c.arc(p.x, MID, 36, 0, 6.28); c.stroke(); }
      if (lacking && this.phase === 'spindle') {
        // A loose kinetochore breathes out MCC.
        for (let i = 0; i < 3; i++) { const f = (this.t * 0.8 + i / 3) % 1; c.fillStyle = alpha(J.orange, 1 - f); c.beginPath(); c.arc(p.x + Math.sin(i * 2 + this.t) * 12, MID + (p.a === null ? -30 : 30) * (1 + f), 4, 0, 6.28); c.fill(); }
      }
    }
    if (this.phase === 'cut') {
      st.mol('sep', 60, 130, { k: 0.6, colors: [J.ruby, null] });
      text(c, 'Separase', 60, 190, { size: 14, chip: true, color: J.gold });
      if (!this.path && this.cuts === 0) {
        const f = (this.t2 % 1.6) / 1.2;
        c.strokeStyle = alpha(J.gold, clamp(1.2 - f)); c.lineWidth = 3; c.beginPath(); c.moveTo(20, MID); c.lineTo(20 + 350 * clamp(f), MID); c.stroke();
      }
    }
    if (this.phase === 'spindle' || this.phase === 'cut') this.drawCircuit(c, 596);
  }

  drawCheck(c) {
    const st = this.stage;
    this.pairs.forEach((p, i) => {
      const bad = i === this.loose;
      c.fillStyle = J.lead; c.beginPath(); c.arc(p.x, 24, 13, 0, 6.28); c.fill();
      c.fillStyle = bad ? J.ruby : J.emerald; c.beginPath(); c.arc(p.x, 24, 11, 0, 6.28); c.fill();
    });
    text(c, this.loose >= 0 ? 'One loose kinetochore' : 'All kinetochores gripped', 195, 52, { size: 15, chip: true, color: this.loose >= 0 ? J.ruby : J.gold });
    st.mol('apc', 195, 214, { k: 0.56, colors: [J.teal, J.emerald, J.sky] });
    text(c, 'APC/C', 195, 214, { size: 16, chip: true });
    for (const m of this.packs) {
      m.life += 0.02;
      st.mol('mcc', 195 + m.dx, 214 + m.dy, { k: 0.62, colors: [J.ruby, J.orange, J.rose], a: clamp(m.life * 6) });
    }
    text(c, 'MCC: Mad2 and BubR1 holding Cdc20', 195, 420, { size: 15, chip: true, color: J.orange });
    text(c, 'Tap to pull MCC apart. p31 and TRIP13 spend ATP on it.', 195, 448, { size: 14, chip: true });
    this.drawCircuit(c, 596);
  }

  drawUb(c) {
    const st = this.stage;
    const cx = 195; const cy = 196;
    st.mol('apc', cx, 56, { k: 0.5, colors: [J.teal, J.emerald, J.sky] });
    text(c, 'APC/C with Cdc20', cx, 118, { size: 14, chip: true });
    const f = this.chew > 0 ? clamp((this.chew - 0.1) / 1.1) : 0;
    const sx = cx; const sy = cy + 40 + f * 170;
    if (this.sub < SUBSTRATES.length) {
      if (this.sub === 1) st.mol('cdk', sx, sy, { k: 0.7, colors: [J.slate, J.cobalt, J.gold], a: 1 - f * 0.8 });
      else st.mol('sep', sx, sy, { k: 0.46, colors: [null, J.rose], a: 1 - f * 0.8 });
      text(c, SUBSTRATES[this.sub], sx, sy + 42, { size: 15, chip: true, color: J.gold });
      for (let i = 0; i < this.ub; i++) st.mol('ub', sx + 34 + i * 25, sy - 26 + (i % 2) * 8, { k: 0.76, colors: [J.gold], a: 1 - f * 0.8 });
    }
    // The dial: E2 with its ubiquitin sweeps round, and must meet the free lysine.
    const R = 84; const dy = sy;
    c.strokeStyle = alpha(J.vellum, 0.3); c.lineWidth = 2; c.beginPath(); c.arc(cx, dy, R, 0, 6.28); c.stroke();
    if (this.chew <= 0 && this.phase === 'ub') {
      c.strokeStyle = J.gold; c.lineWidth = 11; c.beginPath(); c.arc(cx, dy, R, this.target - 0.36, this.target + 0.36); c.stroke();
      text(c, 'Lys', cx + Math.cos(this.target) * (R + 20), dy + Math.sin(this.target) * (R + 20), { size: 13.5, chip: true, color: J.gold });
      const x = cx + Math.cos(this.dial) * R; const y = dy + Math.sin(this.dial) * R;
      st.mol('ub', x, y, { k: 0.76, colors: [this.flash2 > 0 ? J.ruby : J.vellum] });
      if (this.lockT > 0) text(c, 'Waiting for ATP', cx, dy - 30, { size: 14, chip: true });
    }
    st.mol('prot', cx, 464, { k: 0.72, colors: [J.violet, J.ruby] });
    text(c, 'Proteasome, 20S core', cx + 96, 524, { size: 14, chip: true });
    if (this.chew > 1.1) for (let i = 0; i < 4; i++) { c.fillStyle = J.gold; c.beginPath(); c.arc(cx + rand(-16, 16), 540 + rand(0, 20), 3, 0, 6.28); c.fill(); }
  }

  draw(c) {
    if (this.phase === 'ub') this.drawUb(c);
    else if (this.phase === 'check') this.drawCheck(c);
    else this.drawSpindle(c);
  }
}
