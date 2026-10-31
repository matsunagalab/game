// Chapter 4. Real sequences come out of the ribosome: the player sorts them, then threads TGF-α through Sec61.
import { Chapter, text, JEWEL as J } from './base.js';
import { bilayer, clamp, tile, alpha, smooth } from '../kit.js';
import { coreScore, kind as kindOf, hydropathy } from '../logic/hydro.js';
import { PROTEINS } from '../logic/seqs.js';

const NAMES = { INS: 'Insulin', ACTB: 'Actin', ALB: 'Albumin', GAPDH: 'GAPDH', EGFR: 'EGF receptor', HBB: 'Haemoglobin β', LDLR: 'LDL receptor', CCND1: 'Cyclin D1', COL1A1: 'Collagen', YWHAE: '14-3-3 ε' };
const ORDER = ['INS', 'ACTB', 'ALB', 'GAPDH', 'EGFR', 'HBB', 'LDLR', 'CCND1'];
const COL = { oil: J.gold, plus: J.cobalt, minus: J.ruby, turn: J.slate, polar: J.teal };
const RATE = 6.5;
const SHOW = 30;
const THREAD = 7;

export default class Target extends Chapter {
  glass = [[0, -1, 40, 3.9, 0, 12], [0, 3.2, 40, 0.5, 0, 2], [0, 11, 40, 7.5, 0, 14]];

  constructor(game) {
    super(game);
    this.list = ORDER.map((id) => ({ id, name: NAMES[id], seq: PROTEINS[id].seq, er: PROTEINS[id].signal > 0 }));
    if (game.cell.misfold > 0) this.list.push({ id: 'CCND1', name: 'Your misfolded cyclin D1', seq: game.save.run.peptide ? game.save.run.peptide + PROTEINS.CCND1.seq.slice(15) : PROTEINS.CCND1.seq, er: false, bad: true });
    this.n = 0;
    this.right = 0;
    this.len = 0;
    this.phase = 'sort';
    this.flight = null;
    this.tgfa = PROTEINS.TGFA.seq;
    this.h = hydropathy(this.tgfa);
    this.pos = 0;
    this.cut = 0;
    this.gate = 0;
    this.slipped = 0;
    this.early = 0;
    this.t2 = 0;
  }

  start() { this.t = 0; this.say('Watch the gold. 8 gold in any 10 is a signal, so call SRP. Otherwise let go.'); }

  get cur() { return this.list[this.n]; }

  decide(toER) {
    if (this.phase !== 'sort' || this.flight) return;
    const c = this.cur;
    const ok = toER === c.er;
    if (ok) { this.right += 1; this.sound.delivered(); this.flash(0.1); if (c.bad) this.badOK = true; } else { this.sound.bad(); this.buzz(30); }
    const score = coreScore(c.seq);
    this.flight = { toER, ok, t: 0 };
    if (!ok) this.say(c.er ? `Missed: ${c.name} has ${score} gold in 10, and it needed the ER.` : `Wrong: ${c.name} has only ${score} gold in 10, and it belongs in the cytosol.`);
    else this.say(c.bad ? 'Hsp70 holds the bad chain, so it can refold or be destroyed.' : toER ? `SRP grips the signal of ${c.name}, and the ribosome heads for the ER.` : `Hsp70 guards ${c.name} as it folds in the cytosol.`);
  }

  toThread() {
    this.phase = 'thread';
    this.pos = 0;
    this.say('TGF-α docks on Sec61. Tap Cut when the blade mark reaches the pore.');
    this.sound.whoosh();
    this.flash(0.3);
  }

  doCut() {
    if (this.cut) return;
    const off = Math.abs(this.pos - PROTEINS.TGFA.signal);
    if (off > 5) { this.sound.bad(); this.say('Nothing to cut here yet: signal peptidase needs its site.'); return; }
    this.cut = off <= 2 ? 2 : 1;
    this.sound.bell(9, 0.2);
    this.fx.burst(195, 302, J.gold, 12);
    this.say('The signal is cut. Watch the curve: open the gate for the long greasy peak.');
  }

  doGate() {
    if (this.gate) return;
    const [a, b] = PROTEINS.TGFA.tm;
    const p = this.pos;
    if (p < a) { this.early += 1; this.sound.bad(); this.say('Too polar: this stretch would rather stay in water than enter the lipid.'); return; }
    const mid = (a + b) / 2;
    this.gate = Math.abs(p - mid) <= 6 ? 2 : 1;
    this.sound.bell(7, 0.2);
    this.flash(0.25);
    this.fx.burst(240, 268, J.gold, 14);
    this.say('The lateral gate opens and the helix slips sideways into the membrane.');
  }

  update(dt) {
    if (this.phase === 'sort') {
      if (this.flight) {
        this.flight.t += dt;
        if (this.flight.t > 1.2) {
          this.flight = null;
          this.n += 1;
          this.len = 0;
          if (this.n >= this.list.length) this.toThread();
        }
      } else {
        this.len = Math.min(SHOW, this.len + RATE * dt);
        if (this.len >= SHOW) this.t2 += dt;
        if (this.t2 > 2.4) { this.t2 = 0; this.decide(false); }
      }
    } else if (this.phase === 'thread') {
      this.pos += THREAD * dt;
      const [, b] = PROTEINS.TGFA.tm;
      if (!this.gate && this.pos > b + 2) {
        this.slipped += 1;
        this.pos = 0;
        this.cut = 0;
        this.sound.bad();
        this.say('The greasy stretch slid into the lumen. The cell starts a new copy.');
      }
      if (this.pos >= this.tgfa.length) { this.phase = 'end'; this.t2 = 0; this.say('The ribosome finishes the tail in the cytosol and lets go.'); }
    } else {
      this.t2 += dt;
      if (this.t2 > 1.4) this.end();
    }
    if (this.phase === 'sort') this.meters([{ label: 'Chains', value: `${Math.min(this.n + 1, this.list.length)} of ${this.list.length}`, bar: this.n / this.list.length }, { label: 'Sorted right', value: String(this.right) }, { label: 'Most gold in 10', value: String(this.cur ? coreScore(this.cur.seq.slice(0, Math.floor(this.len))) : 0) }]);
    else this.meters([{ label: 'Residue', value: `${Math.min(160, Math.floor(this.pos))} of 160`, bar: this.pos / 160 }, { label: 'Signal cut', value: this.cut ? 'yes' : 'no' }, { label: 'Gate', value: this.gate ? 'opened' : 'shut' }]);
  }

  end() {
    const all = this.right === this.list.length;
    const roses = all && this.cut === 2 && this.gate === 2 && !this.slipped && !this.early ? 3 : all ? 2 : 1;
    const held = this.list.some((c) => c.bad) && this.badOK;
    const misfold = held ? Math.max(0, this.cell.misfold - 1) : this.cell.misfold;
    this.finish(roses, `${this.right} of ${this.list.length} chains sorted right. Signal cut ${this.cut === 2 ? 'exactly' : 'near the site'}, stop-transfer caught ${this.gate === 2 ? 'exactly' : 'in time'}.`, { sorted: this.right, cell: { misfold } });
  }

  down(x, y) {
    const b = this.ui.hit(x, y);
    if (b === 'srp') this.decide(true);
    if (b === 'free') this.decide(false);
    if (b === 'cut') this.doCut();
    if (b === 'gate') this.doGate();
  }

  key(k) {
    if (k === 'ArrowLeft') { if (this.phase === 'sort') this.decide(true); else this.doCut(); }
    if (k === 'ArrowRight') { if (this.phase === 'sort') this.decide(false); else this.doGate(); }
  }

  drawSort(c) {
    const st = this.stage;
    const cur = this.cur;
    st.mol('ribo', 195, 96, { k: 0.72, colors: [J.amber, J.orange, '#2fa8a0', J.cobalt] });
    if (!cur) return;
    text(c, cur.name, 195, 186, { size: 20, color: J.gold, chip: true });
    const w = 25; const rows = 3; const per = 14;
    const n = Math.floor(this.len);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / per);
      if (r >= rows) break;
      const x = 195 - (per * w) / 2 + (i % per) * w;
      const y = 216 + r * 34;
      const a = cur.seq[i];
      const k = kindOf(a);
      const fresh = clamp(this.len - i);
      c.globalAlpha = fresh;
      tile(c, x + 0.5, y, w - 1, 31, COL[k], { lead: 1.5, r: 3, glow: k === 'oil' ? 0.25 : 0 });
      text(c, a, x + w / 2, y + 16, { size: 17, color: k === 'oil' ? '#2a2006' : '#fff8e6' });
      c.globalAlpha = 1;
    }
    const pos = [[J.gold, 'greasy'], [J.teal, 'polar'], [J.cobalt, 'plus'], [J.ruby, 'minus'], [J.slate, 'G, P']];
    pos.forEach(([col, s], i) => {
      const x = 22 + i * 73;
      tile(c, x, 334, 14, 14, col, { lead: 1.5, r: 2 });
      text(c, s, x + 19, 342, { size: 13.5, align: 'left' });
    });
    const f = this.flight;
    st.mol('srp', 106 + (f?.toER ? smooth(f.t / 0.6) * 60 : 0), 410 - (f?.toER ? smooth(f.t / 0.6) * 110 : 0), { k: 1, colors: [J.emerald, J.gold] });
    st.mol('hsp70', 290 - (f && !f.toER ? smooth(f.t / 0.6) * 60 : 0), 415 - (f && !f.toER ? smooth(f.t / 0.6) * 110 : 0), { k: 0.86, colors: [J.rose, J.violet] });
    this.ui.add(c, 'srp', 12, 492, 178, 92, 'SRP', { color: J.emerald, size: 26, sub: 'to the ER', on: !f && n >= 6 });
    this.ui.add(c, 'free', 200, 492, 178, 92, 'Let go', { color: J.violet, size: 26, sub: 'Hsp70, cytosol', on: !f && n >= 6 });
  }

  drawThread(c) {
    const st = this.stage;
    bilayer(c, st, 248, 44, '#d8b25a', this.t * 0.4);
    st.mol('ribo', 195, 118, { k: 0.62, colors: [J.amber, J.orange, '#2fa8a0', J.cobalt] });
    text(c, 'Cytosol', 12, 226, { size: 14, align: 'left', chip: true });
    text(c, 'ER lumen', 12, 306, { size: 14, align: 'left', chip: true });
    st.mol('sec', 195, 270, { k: 0.86, colors: [J.teal, J.rose], rot: 0 });
    // The chain through the pore: the part already inside loops in the lumen.
    c.strokeStyle = J.gold; c.lineWidth = 4;
    c.beginPath(); c.moveTo(195, 190); c.lineTo(195, 300);
    const inside = clamp((this.pos - (this.cut ? 22 : 0)) / 90);
    for (let i = 0; i <= 30 * inside; i++) c.lineTo(195 + Math.sin(i * 0.8) * (10 + i * 1.6), 300 + i * 0.6);
    c.stroke();
    if (this.gate) {
      const f = clamp((this.pos - 100) / 26);
      c.strokeStyle = J.gold; c.lineWidth = 8;
      c.beginPath(); c.moveTo(214 + f * 42, 254); c.lineTo(214 + f * 42, 286); c.stroke();
      text(c, 'stop-transfer helix', 300, 232, { size: 14, chip: true, color: J.gold });
    }
    // The hydropathy trace, moving past the pore.
    const x0 = 195; const y0 = 412; const sy = 15; const px = 7.2;
    c.fillStyle = 'rgba(11,10,17,.72)'; c.fillRect(st.left, 332, st.right - st.left, 128);
    c.strokeStyle = alpha(J.gold, 0.5); c.lineWidth = 1; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(st.left, y0 - 1.6 * sy); c.lineTo(st.right, y0 - 1.6 * sy); c.stroke(); c.setLineDash([]);
    text(c, 'greasy enough for the lipid', 8, y0 - 1.6 * sy - 9, { size: 13, align: 'left', color: J.gold });
    c.beginPath(); c.strokeStyle = J.vellum; c.lineWidth = 2.5;
    let started = false;
    this.h.forEach((v, i) => {
      const x = x0 + (i + 10 - this.pos) * px;
      if (x < st.left - 10 || x > st.right + 10) return;
      const y = y0 - v * sy;
      if (started) c.lineTo(x, y); else c.moveTo(x, y);
      started = true;
    });
    c.stroke();
    for (let i = Math.max(0, Math.floor(this.pos) - 28); i < Math.min(this.tgfa.length, this.pos + 28); i++) {
      const x = x0 + (i + 0.5 - this.pos) * px;
      c.fillStyle = COL[kindOf(this.tgfa[i])];
      c.fillRect(x - 3, 436, 6.2, 12);
    }
    if (!this.cut) {
      const x = x0 + (PROTEINS.TGFA.signal - this.pos) * px;
      text(c, '✂', x, 342, { size: 18, color: J.gold });
      c.strokeStyle = J.gold; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 352); c.lineTo(x, 448); c.stroke();
    }
    c.strokeStyle = J.gold; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x0, 332); c.lineTo(x0, 458); c.stroke();
    text(c, 'in the pore', x0, 468, { size: 13.5, chip: true });
    this.ui.add(c, 'cut', 12, 488, 178, 96, 'Cut', { color: J.emerald, size: 26, sub: 'signal peptidase', on: !this.cut });
    this.ui.add(c, 'gate', 200, 488, 178, 96, 'Open gate', { color: J.rose, size: 25, sub: 'sideways into lipid', on: !this.gate });
  }

  draw(c) {
    if (this.phase === 'sort') this.drawSort(c);
    else this.drawThread(c);
  }
}
