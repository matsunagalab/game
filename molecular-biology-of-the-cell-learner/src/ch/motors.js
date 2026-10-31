// Chapter 7. Hand over hand on a microtubule. ATP must meet the empty head, and which head is empty alternates.
import { Chapter, text, JEWEL as J } from './base.js';
import { clamp, tile, alpha, smooth, lerp } from '../kit.js';
import { newWalker, bindATP, releasePi } from '../logic/kinesin.js';

const PX_NM = 7.2; // 8 nm = 58 units.
const MT_Y = 420;
const GOAL = 40;
const FALL = 1.05; // Seconds for an ATP to reach the head.
const WINDOW = 0.26;
const COLD = { from: 16, to: 22 }; // Steps where ATP runs low.
const CAT = 46; // Seconds until the cap is lost.
const HEAD = { 0: J.ruby, 1: J.cobalt };

export default class Motors extends Chapter {
  glass = [[0, 2.2, 40, 2.8, 0, 12], [0, 4.2, 40, 0.5, 0, 9], [0, 7, 40, 2.3, 0, 12]];

  constructor(game) {
    super(game);
    this.w = newWalker();
    this.head = [{ x: 0, tx: 0, lift: 0 }, { x: -8 * PX_NM, tx: -8 * PX_NM, lift: 1 }];
    this.cam = 0;
    this.tokens = [];
    this.gap = 0.7;
    this.misses = 0;
    this.combo = 0;
    this.swing = null;
    this.phaseT = 0;
    this.end_ = (GOAL + 12) * 8; // Plus end, in nm.
    this.cat = false;
    this.time = 0;
    this.stop = false;
    this.pad = -1;
    this.padT = 0;
    this.rigorSaid = false;
    this.useATP();
    this.waited = 0;
    this.gatedSaid = false;
  }

  beatSpec() {
    const k = 5.2; const x = 195; const y = 230;
    return {
      ends: ['Undocked', 'Docked'],
      line: (f) => (f < 0.4 ? 'Undocked, the neck linker is floppy, too loose to see in this crystal.' : f < 0.8 ? 'Two crystals of the human motor catch it undocked and docked.' : 'On the microtubule, ATP and its hydrolysis favour docking, and the free head can reach ahead.'),
      draw: (c, f) => {
        const st = this.stage;
        text(c, 'Why ATP moves the motor', 195, 16, { size: 17, color: J.gold, chip: true });
        st.morph('kin', f, x, y, { k, colors: [J.ruby] });
        st.mol('neck', x, y, { k, colors: [J.gold], a: smooth((f - 0.45) / 0.45) });
        if (f > 0.7) text(c, 'neck linker', 64, 176, { size: 15, chip: true, color: J.gold });
      },
    };
  }

  start() { this.t = 0; this.say('Tap the lit side as ATP reaches the ring round the empty head.'); }

  get steps() { return this.w.pos / 8; }

  get frontIndex() { return this.w.front; }

  spawnToken() {
    const low = this.steps >= COLD.from && this.steps < COLD.to;
    this.tokens.push({ t: 0, dx: 0, hit: false });
    const base = low ? 2 : Math.max(0.74, 1.08 - this.combo * 0.012);
    this.gap = (base / this.atpPace) * (0.92 + Math.random() * 0.16);
  }

  press(side) {
    if (this.stop) return;
    this.pad = side; this.padT = 0.16;
    if (this.w.phase !== 'wait' || this.swing) {
      if (!this.gatedSaid) { this.gatedSaid = true; this.say('The pull between the heads keeps them from letting go together, so one head is almost always holding on.'); }
      return;
    }
    const tok = this.tokens.find((k) => !k.hit && Math.abs(k.t - FALL) < WINDOW);
    if (side !== this.frontIndex) { this.miss('That head still holds ADP. The other head is empty.'); return; }
    if (!tok) { this.miss('No ATP at the head yet. Wait for it to reach the ring.'); return; }
    tok.hit = true;
    this.takeStep();
  }

  miss(msg) {
    this.misses += this.steps > 0 ? 1 : 0;
    this.combo = 0;
    this.sound.tick(-10, 0.12);
    this.buzz(14);
    if (msg) this.say(msg);
  }

  takeStep() {
    const before = this.w.heads.map((h) => h.nm);
    bindATP(this.w);
    const mover = this.w.front; // The head that just landed is the new front.
    this.swing = { i: mover, t: 0, from: before[mover] * PX_NM, to: this.w.heads[mover].nm * PX_NM };
    this.combo += 1;
    this.spend(0.5);
    this.waited = 0;
    this.sound.bell(((this.steps * 2) % 14) - 2, 0.13);
    this.fx.burst(190, MT_Y - 40, J.gold, 5, 60);
  }

  update(dt) {
    if (!this.stop) this.time += dt;
    this.padT -= dt;
    const low = this.steps >= COLD.from && this.steps < COLD.to;
    if (!this.stop) {
      this.gap -= dt;
      if (this.gap <= 0) this.spawnToken();
    }
    for (const k of this.tokens) {
      const passed = k.t > FALL + WINDOW;
      k.t += dt;
      if (!passed && k.t > FALL + WINDOW && !k.hit && this.w.phase === 'wait' && !this.swing && !this.stop && this.steps > 0) this.miss(null);
    }
    this.tokens = this.tokens.filter((k) => k.t < FALL + 0.7 && !k.hit);
    if (this.swing) {
      this.swing.t += dt / 0.3;
      if (this.swing.t >= 1) { this.head[this.swing.i].x = this.swing.to; this.head[this.swing.i].lift = 0; this.swing = null; this.phaseT = 0.12; }
    } else if (this.w.phase === 'bothBound') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { releasePi(this.w); this.head[1 - this.w.front].lift = 1; }
    }
    if (this.w.phase === 'wait' && !this.swing) this.waited += dt;
    this.cam += ((this.w.pos * PX_NM) - this.cam) * Math.min(1, dt * 7);
    if ((low || this.waited > 3) && !this.rigorSaid) { this.rigorSaid = true; this.say('ATP is scarce here. With no ATP the head simply holds on: rigor.'); }
    if (this.steps === COLD.to && this.rigorSaid !== 2) { this.rigorSaid = 2; this.say('ATP is back. Pick the pace up.'); }
    if (!this.cat && this.time > CAT) { this.cat = true; this.say('The GTP cap is gone: the microtubule is shrinking back towards you!'); this.sound.warn(); }
    if (this.cat && !this.stop) this.end_ -= 8 * 0.8 * dt;
    if (!this.stop) {
      if (this.steps >= GOAL) { this.stop = true; this.reached = true; this.t2 = 0; this.say('The vesicle reaches the cell surface and fuses, and TGF-α is delivered.'); this.sound.fanfare(); this.flash(0.5); } else if (this.end_ <= this.w.pos + 8) { this.stop = true; this.reached = false; this.t2 = 0; this.say('The track fell apart under the motor.'); this.sound.collapse(); }
    } else { this.t2 += dt; if (this.t2 > 1.6) this.end(); }
    this.meters([{ label: 'Steps', value: `${this.steps} of ${GOAL}`, bar: this.steps / GOAL }, { label: 'Carried', value: `${this.w.pos} nm` }, { label: 'ATP stock', value: String(Math.round(this.atp)) }, { label: 'Misses', value: String(this.misses) }]);
  }

  end() {
    const m = this.misses;
    const safe = this.reached && (!this.cat || this.end_ - this.w.pos > 16);
    let roses = 1;
    if (this.reached && m <= 6) roses = 2;
    if (safe && m <= 2 && !this.cat) roses = 3;
    const word = this.reached ? '' : ' The track shrank away, so the vesicle must wait for another motor.';
    this.finish(roses, `${this.steps} steps, ${this.w.pos} nm, ${this.w.atp} ATP, ${m} misses.${word}`, { steps: this.steps, cell: { atp: this.atp, delivered: !!this.reached } });
  }

  down(x) {
    this.press(x < 195 ? 0 : 1);
  }

  key(k) { if (k === 'ArrowLeft') this.press(0); if (k === 'ArrowRight') this.press(1); }

  drawTrack(c) {
    const st = this.stage;
    const dimer = 8 * PX_NM;
    const left = this.cam - 195 + st.left;
    const n0 = Math.floor(left / dimer) - 2;
    const n1 = n0 + Math.ceil((st.right - st.left) / dimer) + 4;
    const end = this.end_ * PX_NM;
    for (let i = n0; i < n1; i++) {
      const wx = i * dimer;
      const x = 195 + wx - this.cam;
      if (wx > end) break;
      const capped = wx > end - dimer * 2.2 && !this.cat;
      st.mol('tub', x, MT_Y + 34, { k: 0.7, rot: Math.PI / 2, colors: capped ? [J.gold, J.amber, J.emerald, J.emerald] : [J.sky, J.cobalt, J.gold, J.vellum] });
    }
    const ex = 195 + end - this.cam;
    if (ex < st.right + 30) {
      if (this.cat) { // Peeling protofilaments at the shrinking end.
        c.strokeStyle = J.ruby; c.lineWidth = 3;
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(ex, MT_Y + 20 + s * 10); c.quadraticCurveTo(ex + 18, MT_Y + 20 + s * 14, ex + 26, MT_Y + 20 + s * 34); c.stroke(); }
      }
      text(c, this.cat ? 'Shrinking end' : 'GTP cap, plus end', ex, MT_Y + 74, { size: 14, chip: true, color: this.cat ? J.ruby : J.gold });
    }
    text(c, '−', st.left + 18, MT_Y + 74, { size: 22, chip: true });
    text(c, '+', st.right - 18, MT_Y + 74, { size: 22, chip: true });
    if (this.steps >= GOAL - 12) {
      const sx = 195 + (GOAL + 1) * 8 * PX_NM - this.cam;
      c.fillStyle = alpha(J.gold, 0.7); c.fillRect(sx, 60, 6, 340);
      text(c, 'Cell surface', sx - 6, 72, { size: 14, align: 'right', chip: true });
    }
  }

  headPos(i) {
    const h = this.head[i];
    const base = this.w.pos ? 195 - this.cam : 195 - this.cam;
    let x = h.x; let y = MT_Y - 14;
    if (this.swing?.i === i) {
      const q = smooth(this.swing.t);
      x = lerp(this.swing.from, this.swing.to, q);
      y -= Math.sin(q * Math.PI) * 74;
    } else if (h.lift) { y -= 34; }
    return [base + x, y];
  }

  draw(c) {
    const st = this.stage;
    const t = this.t;
    this.drawTrack(c);
    const [ax, ay] = this.headPos(0);
    const [bx, by] = this.headPos(1);
    const mid = (Math.min(ax, bx) + Math.max(ax, bx)) / 2;
    const hub = [mid, MT_Y - 92];
    // Stalk up to the vesicle.
    const vx = mid; const vy = 168 + Math.sin(t * 2) * 3;
    c.strokeStyle = J.lead; c.lineWidth = 8; c.beginPath(); c.moveTo(hub[0], hub[1]); c.lineTo(vx, vy + 66); c.stroke();
    c.strokeStyle = J.gold; c.lineWidth = 4; c.beginPath(); c.moveTo(hub[0], hub[1]); c.lineTo(vx, vy + 66); c.stroke();
    // Vesicle: a lipid ball holding TGF-α.
    c.fillStyle = 'rgba(40,24,6,.8)'; c.beginPath(); c.arc(vx, vy, 66, 0, 6.28); c.fill();
    for (let i = 0; i < 44; i++) {
      const a = i * 0.1428 + t * 0.05;
      c.fillStyle = J.lead; c.beginPath(); c.arc(vx + Math.cos(a) * 66, vy + Math.sin(a) * 66, 5, 0, 6.28); c.fill();
      c.fillStyle = '#d8b25a'; c.beginPath(); c.arc(vx + Math.cos(a) * 66, vy + Math.sin(a) * 66, 3.7, 0, 6.28); c.fill();
    }
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + t * 0.2; c.fillStyle = J.emerald; c.beginPath(); c.arc(vx + Math.cos(a) * 34, vy + Math.sin(a) * 30, 8, 0, 6.28); c.fill(); }
    text(c, 'TGF-α cargo', vx, vy, { size: 14, chip: true });
    // Heads and neck linkers.
    [0, 1].forEach((i) => {
      const [x, y] = i === 0 ? [ax, ay] : [bx, by];
      c.strokeStyle = J.lead; c.lineWidth = 6; c.beginPath(); c.moveTo(hub[0], hub[1]); c.lineTo(x, y - 18); c.stroke();
      c.strokeStyle = HEAD[i]; c.lineWidth = 3; c.beginPath(); c.moveTo(hub[0], hub[1]); c.lineTo(x, y - 18); c.stroke();
      st.mol('kin', x, y, { k: 0.86, colors: [HEAD[i], J.gold] });
      const nuc = this.w.heads[i].nuc;
      text(c, nuc === 'empty' ? 'empty' : nuc, x, y - 42, { size: 13, chip: true, color: nuc === 'empty' ? J.gold : J.vellum });
    });
    // ATP drifts down to the empty head.
    const fx = this.frontIndex === 0 ? ax : bx;
    const fy = (this.frontIndex === 0 ? ay : by) - 8;
    if (this.w.phase === 'wait' && !this.swing) { c.strokeStyle = J.gold; c.lineWidth = 2.5; c.beginPath(); c.arc(fx, fy, 30, 0, 6.28); c.stroke(); }
    if (this.waited > 1.8) text(c, 'Rigor: no ATP, so it holds on', 195, 470, { size: 15, chip: true, color: J.gold });
    if (this.w.phase === 'bothBound') { c.strokeStyle = J.ruby; c.lineWidth = 2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(ax, ay - 18); c.lineTo(bx, by - 18); c.stroke(); c.setLineDash([]); }
    for (const k of this.tokens) {
      const f = k.t / FALL;
      const x = fx + (1 - clamp(f)) * 90;
      const y = fy - (1 - f) * 150;
      const fade = clamp((FALL + 0.7 - k.t) / 0.4);
      c.globalAlpha = fade;
      tile(c, x - 22, y - 13, 44, 26, J.emerald, { glow: 0.3, r: 8 });
      text(c, 'ATP', x, y + 1, { size: 15 });
      c.globalAlpha = 1;
    }
    // The two pads: one thumb for each head.
    const go = this.w.phase === 'wait' && !this.swing;
    const near = this.tokens.some((k) => !k.hit && Math.abs(k.t - FALL) < WINDOW);
    [0, 1].forEach((i) => {
      const lit = go && this.frontIndex === i;
      tile(c, 8 + i * 190, 516, 184, 78, HEAD[i], { glow: lit ? (near ? 0.9 : 0.35) : 0, r: 8 });
      c.globalAlpha = lit ? 1 : 0.55;
      text(c, i === 0 ? 'Red head' : 'Blue head', 100 + i * 190, 555, { size: 21 });
      c.globalAlpha = 1;
    });
  }
}
