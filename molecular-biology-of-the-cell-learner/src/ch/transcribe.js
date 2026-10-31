// Chapter 2. The player is the active site of RNA polymerase II, then U1 and the 3′ splice site search.
import { Chapter, text, JEWEL as J } from './base.js';
import { clamp, tile, alpha, smooth, lerp } from '../kit.js';
import { rnaFromTemplate, templateOf, toRNA, translate } from '../logic/code.js';
import { CCND1_EXON1_CDS, CCND1_DONOR, CCND1_ACCEPTOR, U1, u1Pairs, INTRON_LENGTH } from '../logic/seqs.js';
import { cyclinOf, copiesFrom } from '../logic/cell.js';

export const LENGTH = 36;
const BASE = { A: J.ruby, U: J.amber, T: J.violet, G: J.cobalt, C: J.emerald };
const W = 36; // Tile width on the reading strip.
const FX = 195;
const KEYS = ['A', 'U', 'G', 'C'];

export default class Transcribe extends Chapter {
  glass = [[0, 2, 40, 2.4, 0, 15], [0, 4.1, 40, 1.05, 0, 14], [0, 11, 40, 5.9, 0, 15]];

  constructor(game) {
    super(game);
    this.dna = CCND1_EXON1_CDS.slice(0, LENGTH);
    this.tpl = templateOf(this.dna);
    this.i = 0;
    this.rna = [];
    this.scroll = 0;
    this.phase = 'read';
    this.mistakes = 0;
    this.stall = null;
    this.lock = 0;
    this.spliceTries = 0;
    this.readTime = 0;
    this.drag = null;
    this.t2 = 0;
  }

  start() {
    this.t = 0;
    this.say(cyclinOf(this.cell) >= 0.5 ? 'Template A pairs with U, T with A, G with C, C with G. Tap the RNA base.' : 'Little Fos, so few polymerases load here. Template A pairs with U, T with A.');
  }

  pick(b) {
    if (this.phase !== 'read' || this.stall || this.lock > 0) return;
    const right = rnaFromTemplate(this.tpl[this.i]);
    this.rna.push({ b, ok: b === right });
    if (b === right) {
      this.i += 1;
      this.sound.bell(KEYS.indexOf(b) * 3 - 2 + (this.i % 4) * 2, 0.13);
      this.fx.burst(FX, 324, BASE[b], 4, 60);
      if (this.i % 3 === 0) this.flash(0.05);
      if (this.i >= LENGTH) this.toSplice();
    } else {
      this.mistakes += 1;
      this.stall = true;
      this.sound.bad();
      this.buzz(30);
      this.say(`${b} cannot pair with template ${this.tpl[this.i]}. Pol II stalls with a frayed end.`);
    }
  }

  fix(cut) {
    if (!this.stall) return;
    this.stall = null;
    if (cut) {
      this.rna.pop();
      if (this.i > 0) { this.rna.pop(); this.i -= 1; } // TFIIS mainly removes two bases: the wrong one and the one before.
      this.lock = 0.9;
      this.sound.tick(-3);
      this.say('Pol II backs up. TFIIS helps it cut off the last two bases, and pick again.');
    } else {
      this.rna[this.rna.length - 1].kept = true;
      this.i += 1;
      this.lock = 1.8;
      this.sound.tick(-10, 0.2);
      this.say('Forced past. The error stays in the RNA, and into the next chapter.');
      if (this.i >= LENGTH) { this.lock = 0; this.toSplice(); }
    }
  }

  toSplice() {
    this.readTime = this.t;
    this.phase = 'u1';
    this.sound.whoosh();
    this.flash(0.3);
    this.tiles = toRNA(CCND1_DONOR.exon + CCND1_DONOR.intron);
    this.goal = CCND1_DONOR.exon.length - 3;
    this.off = 1;
    this.say('162 bases on, the exon ends. Slide the RNA until U1 pairs best here, then lock.');
  }

  toAcceptor() {
    this.phase = 'ag';
    this.tiles = toRNA(CCND1_ACCEPTOR.intron + CCND1_ACCEPTOR.exon);
    this.goal = CCND1_ACCEPTOR.intron.length - 2;
    this.off = 3;
    this.say(`${INTRON_LENGTH.toLocaleString('en')} bases of intron later. The cut is at the first AG after the branch point: slide to it.`);
  }

  lockSite() {
    this.spliceTries += 1;
    const at = Math.round(this.off);
    if (at === this.goal) {
      this.sound.bell(7, 0.2);
      this.flash(0.3);
      if (this.phase === 'u1') this.toAcceptor();
      else { this.phase = 'join'; this.t2 = 0; this.say('The spliceosome removes the intron as a lariat, and the two exons join.'); this.sound.fanfare(); }
    } else {
      this.sound.bad();
      if (this.phase === 'u1') this.say('Too few pairs for U1 to hold here. Look for more bars.');
      else this.say(this.tiles.slice(at, at + 2) === 'AG' ? 'A later AG: the cut would remove part of the exon, and the protein would lose amino acids.' : 'No AG here, so no cut can be made.');
    }
  }

  down(x, y) {
    const b = this.ui.hit(x, y);
    if (b) {
      if (b.length === 1) this.pick(b);
      else if (b === 'cut') this.fix(true);
      else if (b === 'force') this.fix(false);
      else if (b === 'lock') this.lockSite();
      return;
    }
    if (this.phase === 'u1' || this.phase === 'ag') this.drag = { x, off: this.off };
  }

  move(x) {
    if (!this.drag) return;
    this.off = clamp(this.drag.off + (this.drag.x - x) / 25, 0, this.tiles.length - (this.phase === 'u1' ? 9 : 2));
  }

  up() {
    if (!this.drag) return;
    this.drag = null;
    this.off = Math.round(this.off);
    this.sound.tick(2);
  }

  key(k) {
    const K = k.toUpperCase();
    if (KEYS.includes(K)) this.pick(K);
    if (K === 'ENTER' && (this.phase === 'u1' || this.phase === 'ag')) this.lockSite();
  }

  update(dt) {
    this.scroll += (this.i - this.scroll) * Math.min(1, dt * 14);
    this.lock = Math.max(0, this.lock - dt);
    if (this.phase === 'read') {
      const v = this.i / Math.max(1, this.t);
      this.meters([{ label: 'Bases', value: `${this.i} of ${LENGTH}`, bar: this.i / LENGTH }, { label: 'Your speed', value: `${v.toFixed(1)} per second` }, { label: 'Mistakes', value: String(this.mistakes) }]);
    } else if (this.phase === 'join') {
      this.t2 += dt;
      if (this.t2 > 3.4) this.end();
    } else this.meters([{ label: 'Tries', value: String(this.spliceTries) }, { label: 'Real speed', value: 'about 30 per second' }]);
  }

  end() {
    const left = this.rna.filter((r) => !r.ok).length;
    const clean = left === 0 && this.spliceTries <= 2;
    const roses = this.mistakes === 0 && clean && this.readTime <= 27 ? 3 : clean ? 2 : 1;
    const mrna = this.rna.map((r) => r.b).join('');
    const copies = copiesFrom(cyclinOf(this.cell));
    this.finish(roses, `${LENGTH} bases in ${Math.round(this.readTime)} seconds, ${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'}, ${left} left in the RNA. ${copies} polymerase${copies > 1 ? 's' : ''} followed yours, so ${copies} cop${copies > 1 ? 'ies' : 'y'} of this mRNA.`, { mrna, mrnaErrors: left, cell: { copies } });
  }

  drawRead(c) {
    const y0 = 304; const y1 = 354;
    // The transcription bubble: the template runs through, and the active site stays still.
    text(c, 'RNA, 5′ to 3′', 8, y0 - 30, { size: 14, align: 'left', chip: true });
    text(c, 'Template DNA, read 3′ to 5′', 382, y1 + 32, { size: 14, align: 'right', chip: true });
    text(c, '3′', 10, y1, { size: 14, align: 'left', chip: true });
    text(c, '5′', 380, y1, { size: 14, align: 'right', chip: true });
    c.save();
    c.beginPath(); c.rect(this.stage.left, y0 - 30, this.stage.right - this.stage.left, 110); c.clip();
    for (let i = 0; i < LENGTH; i++) {
      const x = FX + (i - this.scroll) * W;
      if (x < this.stage.left - W || x > this.stage.right + W) continue;
      const here = i === this.i;
      tile(c, x - W / 2 + 1, y1 - 18, W - 2, 36, BASE[this.tpl[i]], { glow: here ? 0.5 : 0 });
      text(c, this.tpl[i], x, y1 + 1, { size: 22 });
    }
    this.rna.forEach((r, i) => {
      const x = FX + (i - this.scroll) * W;
      if (x < this.stage.left - W) return;
      const frayed = !r.ok && !r.kept;
      const dy = frayed ? Math.sin(this.t * 14) * 3 - 6 : 0;
      tile(c, x - W / 2 + 1, y0 - 18 + dy, W - 2, 36, BASE[r.b], { glow: r.ok ? 0.1 : 0 });
      text(c, r.b, x, y0 + 1 + dy, { size: 22 });
      if (r.ok) { c.fillStyle = alpha(J.gold, 0.7); c.fillRect(x - 6, y0 + 19, 2.5, 13); c.fillRect(x + 3, y0 + 19, 2.5, 13); } else { c.fillStyle = J.ruby; c.fillRect(x - 8, y0 + 24, 16, 3); }
    });
    c.restore();
    // The magnesium of the active site marks where the next base goes.
    c.strokeStyle = J.gold; c.lineWidth = 2.5;
    c.strokeRect(FX - W / 2 - 1, y0 - 21, W + 2, y1 - y0 + 42);
    const s = this.stall;
    if (s) {
      this.ui.add(c, 'cut', 16, 442, 200, 96, 'Back up and cut', { color: J.emerald, sub: 'TFIIS cuts two bases', size: 19 });
      this.ui.add(c, 'force', 226, 442, 148, 96, 'Force past', { color: J.ruby, sub: 'leaves an error', size: 18 });
    } else {
      KEYS.forEach((k, i) => this.ui.add(c, k, 12 + i * 93, 432, 87, 116, k, { color: BASE[k], size: 46, on: this.lock <= 0 }));
    }
  }

  drawSlide(c) {
    const donor = this.phase === 'u1';
    const y = 330; const w = 25;
    const mid = 195;
    const span = donor ? 9 : 2;
    const x0 = mid - (span * w) / 2;
    const off = this.off;
    const split = donor ? CCND1_DONOR.exon.length : CCND1_ACCEPTOR.intron.length;
    c.save();
    c.beginPath(); c.rect(this.stage.left, y - 40, this.stage.right - this.stage.left, 80); c.clip();
    [...this.tiles].forEach((b, i) => {
      const x = x0 + (i - off) * w;
      const exon = donor ? i < split : i >= split;
      tile(c, x + 0.5, y - 18, w - 1, 36, exon ? BASE[b] : '#3a3448', { lead: 1.5, r: 3 });
      text(c, b, x + w / 2, y + 1, { size: 18, color: exon ? '#fff8e6' : J.vellum });
    });
    c.restore();
    text(c, donor ? 'pre-mRNA: exon, then intron' : 'pre-mRNA: intron, then exon', 195, y - 58, { size: 15, chip: true });
    const at = Math.round(off);
    if (donor) {
      const site = this.tiles.slice(at, at + 9);
      const pairs = u1Pairs(site);
      const n = pairs.filter(Boolean).length;
      [...U1].forEach((b, i) => {
        const x = x0 + i * w;
        tile(c, x + 0.5, y + 34, w - 1, 34, J.teal, { lead: 1.5, r: 3 });
        text(c, b, x + w / 2, y + 52, { size: 18 });
        if (pairs[i]) { c.fillStyle = J.gold; c.fillRect(x + w / 2 - 4, y + 20, 2.5, 13); c.fillRect(x + w / 2 + 2, y + 20, 2.5, 13); }
      });
      text(c, `U1 snRNA, 3′ to 5′: ${n} pairs of 9`, 195, y + 90, { size: 17, color: J.gold, chip: true });
    } else {
      c.strokeStyle = J.gold; c.lineWidth = 3;
      c.strokeRect(x0 - 1, y - 21, w * 2 + 2, 42);
      const here = this.tiles.slice(at, at + 2);
      text(c, here === 'AG' ? 'AG: a cut can go here' : `${here}: not AG`, 195, y + 54, { size: 17, color: here === 'AG' ? J.gold : J.vellum, chip: true });
    }
    text(c, 'drag the RNA', 195, 465, { size: 15, italic: true });
    this.ui.add(c, 'lock', 95, 488, 200, 62, donor ? 'Lock U1 here' : 'Lock the cut here', { color: J.teal, size: 20 });
  }

  drawJoin(c) {
    const f = smooth(this.t2 / 1.2);
    const a = toRNA(CCND1_DONOR.exon.slice(-9));
    const b = toRNA(CCND1_ACCEPTOR.exon.slice(0, 9));
    const w = 19; const y = 330;
    const gap = lerp(70, 0, f);
    [...a].forEach((n, i) => { const x = 195 - gap / 2 - (9 - i) * w; tile(c, x, y - 15, w - 1, 30, BASE[n], { lead: 1.5, r: 2 }); text(c, n, x + w / 2, y, { size: 15 }); });
    [...b].forEach((n, i) => { const x = 195 + gap / 2 + i * w; tile(c, x, y - 15, w - 1, 30, BASE[n], { lead: 1.5, r: 2 }); text(c, n, x + w / 2, y, { size: 15 }); });
    // The lariat lifts away.
    c.strokeStyle = alpha(J.vellum, 1 - f); c.lineWidth = 3;
    c.beginPath(); c.arc(195, y - 70 - f * 90, 34, 0, 6.28); c.moveTo(195, y - 36 - f * 90); c.lineTo(195 - gap / 2, y - 15); c.stroke();
    if (f > 0.9) {
      text(c, 'Read in threes, the join gives the real protein:', 195, y + 42, { size: 15.5, chip: true });
      const p = translate(toRNA(CCND1_EXON1_CDS.slice(-12) + CCND1_ACCEPTOR.exon.slice(0, 12)));
      text(c, [...p].join('  '), 195, y + 76, { size: 26, color: J.gold, chip: true });
    }
  }

  draw(c) {
    const st = this.stage;
    const bob = Math.sin(this.t * 1.5) * 1.5;
    st.mol('pol2', 195, 132 + bob, { k: 1.02, colors: [J.cobalt, J.violet, J.sky, J.gold, J.amber] });
    text(c, 'RNA polymerase II', 195, 16, { size: 15, chip: true });
    // How many polymerases load depends on how much Fos survived.
    const n = copiesFrom(cyclinOf(this.cell));
    for (let i = 1; i < n; i++) st.mol('pol2', 34 + (i - 1) * 54, 60, { k: 0.26, colors: [J.cobalt, J.violet, J.sky, J.gold, J.amber], a: 0.8 });
    if (n > 1) text(c, 'Others following', 8, 96, { size: 13, align: 'left', chip: true });
    if (this.phase === 'read') this.drawRead(c);
    else if (this.phase === 'join') this.drawJoin(c);
    else this.drawSlide(c);
    // Thin lead rays tie the close-up to the machine.
    c.strokeStyle = alpha(J.gold, 0.25); c.lineWidth = 1;
    c.beginPath(); c.moveTo(165, 215); c.lineTo(100, 268); c.moveTo(225, 215); c.lineTo(290, 268); c.stroke();
  }
}
