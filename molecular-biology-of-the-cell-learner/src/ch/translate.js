// Chapter 3. The ribosome does the sensing: it feels the shape of the codon–anticodon helix.
// The player only sets the pace: a wrong tRNA that is hurried has less time to fall off, at either of two checks.
import { Chapter, text, JEWEL as J, tile, clamp } from './base.js';
import { smooth, back, pick } from '../kit.js';
import { classify, pairing, mismatchAt, tRNAFor, translateCodon, THREE, perfectAnticodon } from '../logic/code.js';
import { CCND1_EXON1_CDS, PROTEINS } from '../logic/seqs.js';
import { RATES, passBad, forwardRate, offRate, runChecks, together, stepLook, lookFires } from '../logic/proofread.js';

export const AMINO_GOAL = 14;
const BASE = { A: J.ruby, U: J.amber, G: J.cobalt, C: J.emerald };
const MRNA_Y = 250;
const W = 25;
const SITE = { E: 112, P: 195, A: 278 };
const RUNG = [104, 195, 286];
const TIME_LIMIT = 45;

export function codonsFrom(mrna) {
  const real = CCND1_EXON1_CDS.replaceAll('T', 'U');
  const m = (mrna && mrna.length >= 36 ? mrna + real.slice(mrna.length) : real).slice(0, (AMINO_GOAL + 3) * 3);
  return m.match(/.{3}/g);
}

export default class Translate extends Chapter {
  glass = [[0, 0, 40, 40, 0, 12]];

  constructor(game) {
    super(game);
    this.codons = codonsFrom(game.save.run.mrna);
    this.ci = 1; // The start codon already sits in the P site.
    this.chain = ['M'];
    this.state = 'idle';
    this.st = 0;
    this.gtp = 0;
    this.lost = 0;
    this.stats = { seen1: 0, pass1: 0, seen2: 0, pass2: 0 };
    this.tRNA = null;
    this.sinceRight = 0;
    this.shift = 0;
    this.pTRNA = perfectAnticodon(this.codons[0]);
    this.eTRNA = null;
    this.time = 0;
    this.held = 0;
    this.wrongTime = 0;
    this.pressed = false;
    this.toldNon = false;
    this.total = null;
  }

  beatSpec() {
    const k = 8.6; const x = 222; const y = 236;
    return {
      ends: ['Empty site', 'Correct helix'],
      line: (f) => (f < 0.4 ? 'At rest, A1492 and A1493 sit folded inside the ribosome.' : f < 0.8 ? 'A codon–anticodon helix forms, and these two bases swing out to feel it.' : 'They fit a correct helix at positions 1 and 2. The third is left looser: that is wobble.'),
      draw: (c, f) => {
        const st = this.stage;
        text(c, 'What the ribosome feels: the real atoms', 195, 16, { size: 16, color: J.gold, chip: true });
        st.mol('dec1', x, y, { k, colors: [null, null, J.amber, J.teal], a: smooth((f - 0.2) / 0.5) });
        st.morph('dec', f, x, y, { k, colors: [J.rose, J.violet] });
        text(c, 'A1492, A1493', 62, 150, { size: 15, chip: true, color: J.rose });
        text(c, 'G530', 95, 262, { size: 15, chip: true, color: J.violet });
        if (f > 0.5) { text(c, 'codon', 306, 176, { size: 14, chip: true, color: J.amber }); text(c, 'anticodon', 326, 262, { size: 14, chip: true, color: J.teal }); }
      },
    };
  }

  start() {
    this.t = 0;
    this.state = 'wait';
    this.st = 0.4;
    this.say('The ribosome judges each tRNA by itself. Hold the pad to hurry it. Let go to give it time.');
  }

  get codon() { return this.codons[this.ci]; }

  arrive() {
    // A base left wrong in chapter 2 can make a stop codon, and no normal tRNA reads one.
    if (translateCodon(this.codon) === '*') {
      this.stopped = true;
      this.state = 'end';
      this.st = 0;
      this.say('Your transcript error made a stop codon here. A release factor ends the chain too soon.');
      this.sound.bad();
      return;
    }
    let kind = pick(['cognate', 'cognate', 'near', 'near', 'near', 'non', 'non']);
    if (this.sinceRight >= 3) kind = 'cognate';
    this.sinceRight = kind === 'cognate' ? 0 : this.sinceRight + 1;
    const anti = tRNAFor(this.codon, kind);
    const k = classify(this.codon, anti);
    const at = mismatchAt(this.codon, anti);
    const sense = k === 'cognate' ? 'cognate' : k === 'non' ? 'non' : at === 2 ? 'third' : 'bad';
    this.tRNA = { anti, kind: k, sense, x: 450, look: 0, ok: pairing(this.codon, anti) };
    if (sense === 'bad') this.stats.seen1 += 1; // The tally counts the wrong tRNAs that the helix check is there to stop.
    this.state = 'arrive';
    this.st = 0;
    this.sound.tick(6, 0.06);
  }

  // A correct helix sets off EF-Tu's GTPase. A wrong pair only does so when it slips into a right-looking shape.
  fires(dt, rates) {
    const t = this.tRNA;
    if (t.sense === 'bad') return lookFires(t, rates, dt);
    return Math.random() < forwardRate(rates, t.sense) * dt;
  }

  falls(dt, rates) { return Math.random() < offRate(rates, this.tRNA.sense) * dt; }

  leave() {
    this.state = 'leave';
    this.st = 0;
    this.sound.tick(-4, 0.08);
  }

  join() {
    const t = this.tRNA;
    const aa = translateCodon([...t.anti].reverse().map((b) => ({ A: 'U', U: 'A', G: 'C', C: 'G' }[b])).join(''));
    const right = translateCodon(this.codon);
    const made = t.kind === 'cognate' ? right : aa === '*' ? 'X' : aa;
    const bad = made !== right;
    this.chain.push(made);
    if (bad) { this.sound.bad(); this.buzz(30); this.say(`A wrong tRNA got past both checks: ${THREE[made] ?? 'another'} in place of ${THREE[right]}.`); } else {
      if (t.kind !== 'cognate') this.say('A mismatch got through, but the code gives the same amino acid.');
      this.sound.delivered();
    }
    this.lastBad = bad;
    this.fx.burst(SITE.A, MRNA_Y - 60, bad ? J.ruby : J.gold, 12);
    this.flash(0.1);
    this.state = 'shift';
    this.st = 0;
  }

  // The rest of the protein goes by at the pace you kept, wrong tRNAs escaping each check at random.
  finishRun() {
    const h = this.wrongTime ? this.held / this.wrongTime : 0;
    const f = h * passBad(RATES.fast) + (1 - h) * passBad(RATES.slow);
    const wrongPerCodon = 0.8; // About this many tRNAs that are wrong in a watched position come by per codon here.
    const rest = runChecks(Math.round(280 * wrongPerCodon), f, f);
    const s = this.stats;
    this.total = { seen1: s.seen1 + rest.seen1, pass1: s.pass1 + rest.pass1, seen2: s.seen2 + rest.seen2, pass2: s.pass2 + rest.pass2 };
  }

  update(dt) {
    this.st += dt;
    const t = this.tRNA;
    const hurry = this.pressed;
    const rates = hurry ? RATES.fast : RATES.slow;
    if (this.state !== 'end' && this.state !== 'idle') this.time += dt;
    const checking = this.state === 'check1' || this.state === 'check2';
    // What matters for accuracy is how a wrong tRNA was treated.
    if (t && t.sense === 'bad' && checking) { this.wrongTime += dt; if (hurry) this.held += dt; stepLook(t, dt); }
    const quick = hurry ? 0.5 : 1;
    switch (this.state) {
      case 'wait': if (this.st > 0.26 * quick) this.arrive(); break;
      case 'arrive':
        t.x = 450 + (SITE.A - 450) * back(this.st / (0.3 * quick));
        if (this.st > 0.3 * quick) { t.x = SITE.A; this.state = 'check1'; this.st = 0; }
        break;
      case 'check1':
        if (t.sense === 'non') {
          if (this.st > 0.38) { if (!this.toldNon) { this.toldNon = true; this.say('Too few pairs: it falls off by itself.'); } this.leave(); }
        } else if (this.fires(dt, rates)) {
          this.gtp += 1;
          if (t.sense === 'bad') { this.stats.pass1 += 1; this.stats.seen2 += 1; }
          t.look = 0; // The second check starts afresh.
          this.state = 'check2';
          this.st = 0;
          this.sound.bell(2, 0.1);
          this.fx.float(SITE.A + 28, MRNA_Y - 96, 'GTP → GDP + Pi', J.emerald, 14);
        } else if (this.falls(dt, rates)) this.leave();
        break;
      case 'check2':
        if (this.fires(dt, rates)) {
          if (t.sense === 'bad') this.stats.pass2 += 1;
          this.state = 'accom';
          this.st = 0;
        } else if (this.falls(dt, rates)) {
          this.lost += 1;
          this.fx.float(SITE.A, MRNA_Y - 100, 'one GTP lost', J.ruby, 15);
          this.leave();
        }
        break;
      case 'accom': if (this.st > 0.2) this.join(); break;
      case 'leave': t.x = SITE.A + smooth(this.st / (0.22 * quick)) * 170; if (this.st > 0.22 * quick) { this.tRNA = null; this.state = 'wait'; this.st = 0; } break;
      case 'shift':
        this.shift = smooth(this.st / (0.3 * quick));
        if (this.st > 0.3 * quick) {
          this.eTRNA = this.pTRNA;
          this.pTRNA = t.anti;
          this.tRNA = null;
          this.shift = 0;
          this.ci += 1;
          this.state = 'wait';
          this.st = 0;
          if (this.chain.length - 1 >= AMINO_GOAL) { this.state = 'end'; this.st = 0; }
        }
        break;
      case 'end':
        if (!this.total) { this.finishRun(); this.say('At your pace the ribosome reads the other 280 codons. Count what got past each check.'); this.sound.whoosh(); }
        if (this.st > 3.4) this.end();
        break;
      default:
    }
    const real = PROTEINS.CCND1.seq;
    const wrong = [...this.chain].filter((a, i) => a !== real[i]).length;
    this.meters([{ label: 'Amino acids', value: `${this.chain.length - 1} of ${AMINO_GOAL}`, bar: (this.chain.length - 1) / AMINO_GOAL }, { label: 'Wrong', value: String(wrong) }, { label: 'GTP lost', value: String(this.lost) }, { label: 'Seconds', value: String(Math.round(this.time)) }]);
  }

  end() {
    const { lost, time } = this;
    // Compare with the real protein, so an error left in the transcript counts too.
    const real = PROTEINS.CCND1.seq;
    const wrong = [...this.chain].filter((a, i) => a !== real[i]).length + (this.stopped ? 1 : 0);
    const roses = wrong === 0 && time <= TIME_LIMIT ? 3 : wrong <= 1 ? 2 : 1;
    const { seen1, pass1, seen2, pass2 } = this.total;
    const all = together(this.total);
    const cyclin = this.cell.cyclin === null ? {} : { cyclin: Math.max(0.1, this.cell.cyclin * (1 - 0.12 * wrong)) };
    this.finish(roses, `${this.chain.length - 1} amino acids in ${Math.round(time)} seconds, ${wrong} wrong, ${lost} GTP lost. Over the whole protein, wrong tRNAs: check one passed ${pass1} of ${seen1} and check two ${pass2} of ${seen2}, ${all.none ? `so none of ${all.n.toLocaleString('en')} got past both checks` : `so together about 1 in ${all.n.toLocaleString('en')} wrong tRNAs`}.`, { wrongAA: wrong, peptide: this.chain.join(''), cell: { misfold: wrong, ...cyclin } });
  }

  down(x, y, id) { if (y > 460) { this.pressed = true; this.pressId = id; } }

  up(x, y, id) { if (id === this.pressId) this.pressed = false; }

  key(k) { if (k === ' ') this.pressed = !this.pressed; }

  drawTRNA(c, x, anti, { a = 1, ef = false, color = J.teal, aa = null } = {}) {
    const st = this.stage;
    c.globalAlpha = a;
    st.mol('trna', x, MRNA_Y - 86, { k: 0.8, colors: [color] });
    if (ef) st.mol('eftu', x + 22, MRNA_Y - 122, { k: 0.64, colors: [J.emerald, null] });
    if (aa) text(c, aa, x + 28, MRNA_Y - 130, { size: 15, chip: true, color: J.gold });
    // Anticodon, drawn antiparallel: the 3′ end is on the left, facing the 5′ end of the codon.
    [anti[2], anti[1], anti[0]].forEach((b, i) => {
      const tx = x - W * 1.5 + i * W;
      tile(c, tx + 0.5, MRNA_Y - 50, W - 1, 28, BASE[b], { lead: 1.5, r: 3 });
      text(c, b, tx + W / 2, MRNA_Y - 35, { size: 19 });
    });
    c.globalAlpha = 1;
  }

  // The decoding centre: what is felt, drawn large. Rungs that fit stand straight, and a wrong one is bent.
  drawHelix(c) {
    const st = this.stage;
    const top = 322; const bot = 382;
    c.fillStyle = 'rgba(11,10,17,.66)'; c.fillRect(st.left, 298, st.right - st.left, 118);
    const r = this.tRNA;
    const inSite = r && r.x === SITE.A && !['leave', 'shift', 'accom'].includes(this.state);
    text(c, 'Decoding centre: the shape of the helix', 195, 308, { size: 14, color: J.gold });
    const names = ['A1493', 'A1492 + G530', 'not watched closely'];
    RUNG.forEach((x, i) => {
      const cod = this.codon?.[i];
      if (!cod) return;
      tile(c, x - 15, top - 2, 30, 26, BASE[cod], { lead: 1.5, r: 3 });
      text(c, cod, x, top + 11, { size: 17 });
      const watched = i < 2;
      if (inSite) {
        const ab = [r.anti[2], r.anti[1], r.anti[0]][i];
        const fit = r.ok[i] || (r.look > 0 && watched);
        const wob = i === 2 && r.ok[2] && !'AU GC CG UA'.split(' ').includes(cod + ab);
        const sag = fit ? 0 : 7 + Math.sin(this.t * 22 + i) * 3;
        tile(c, x - 15 + sag, bot - 12, 30, 26, BASE[ab], { lead: 1.5, r: 3 });
        text(c, ab, x + sag, bot + 1, { size: 17 });
        c.strokeStyle = fit ? J.gold : J.ruby; c.lineWidth = 3;
        for (const dx of [-5, 5]) { c.beginPath(); c.moveTo(x + dx, top + 24); c.lineTo(x + dx + sag + (wob ? 4 : 0), bot - 12); c.stroke(); }
        // The bases that feel the groove dock only on a correct shape.
        if (watched) {
          const dock = fit ? 0 : 12;
          tile(c, x + 21 + dock, top + 20, 12, 22, fit ? J.emerald : J.ruby, { lead: 1.5, r: 3 });
        }
      } else if (watched) tile(c, x + 33, top + 20, 12, 22, J.slate, { lead: 1.5, r: 3 });
      text(c, names[i], x + (i === 1 ? 0 : i === 0 ? -8 : 0), 408, { size: 12.5, color: watched ? J.vellum : J.gold });
    });
  }

  drawTally(c) {
    const { seen1, pass1, seen2, pass2 } = this.total;
    const st = this.stage;
    const f = clamp(this.st / 1.6);
    c.fillStyle = 'rgba(11,10,17,.8)'; c.fillRect(st.left, 298, st.right - st.left, 118);
    const n = (v) => Math.round(v * f).toLocaleString('en');
    text(c, `Check one passed ${n(pass1)} of ${n(seen1)} wrong tRNAs`, 195, 322, { size: 17 });
    text(c, `Check two passed ${n(pass2)} of ${n(seen2)}`, 195, 350, { size: 17 });
    const all = together(this.total);
    if (f >= 1) text(c, all.none ? `None of ${all.n.toLocaleString('en')} got past both checks` : `Together about 1 in ${all.n.toLocaleString('en')} wrong tRNAs`, 195, 386, { size: 20, color: J.gold });
  }

  draw(c) {
    const st = this.stage;
    st.mol('ribo', 195, 116, { k: 0.92, colors: [J.amber, J.orange, '#2fa8a0', J.cobalt] });
    text(c, 'The ribosome', 195, 10, { size: 14, chip: true });
    const sh = this.shift * 83;
    const y = MRNA_Y;
    text(c, '5′', st.left + 12, y - 16, { size: 14, chip: true });
    text(c, '3′', st.right - 12, y - 16, { size: 14, chip: true });
    this.codons.forEach((cod, i) => {
      const cx = SITE.A + (i - this.ci) * 83 - sh;
      if (cx < st.left - 50 || cx > st.right + 50) return;
      [...cod].forEach((b, j) => {
        const tx = cx - W * 1.5 + j * W;
        tile(c, tx + 0.5, y - 15, W - 1, 30, BASE[b], { lead: 1.5, r: 3, glow: i === this.ci ? 0.35 : 0 });
        text(c, b, tx + W / 2, y + 1, { size: 19 });
      });
    });
    const checkName = this.state === 'check1' ? 'Check one' : this.state === 'check2' ? 'Check two' : 'A site';
    text(c, 'E', SITE.E, y + 27, { size: 14, chip: true });
    text(c, 'P', SITE.P, y + 27, { size: 14, chip: true });
    text(c, checkName, SITE.A, y + 27, { size: 15, chip: true, color: J.gold });
    if (this.eTRNA) this.drawTRNA(c, SITE.E - sh, this.eTRNA, { a: 0.75 * (1 - this.shift), color: J.slate });
    if (this.pTRNA) this.drawTRNA(c, SITE.P - sh, this.pTRNA, { color: J.violet, aa: THREE[this.chain[this.chain.length - 1]] ?? '' });
    const r = this.tRNA;
    if (r) this.drawTRNA(c, this.state === 'shift' ? r.x - sh : r.x, r.anti, { ef: ['arrive', 'check1'].includes(this.state), color: J.rose });
    if (this.total) this.drawTally(c); else this.drawHelix(c);
    const shown = this.chain.slice(-11);
    const px = 195 - (shown.length * 33) / 2;
    shown.forEach((a, i) => {
      tile(c, px + i * 33, 424, 32, 30, this.lastBad && i === shown.length - 1 ? J.ruby : J.violet, { lead: 1.5, r: 3 });
      text(c, THREE[a] ?? '?', px + i * 33 + 16, 440, { size: 12 });
    });
    tile(c, 12, 466, 366, 118, this.pressed ? J.amber : J.slate, { r: 10, glow: this.pressed ? 0.3 : 0 });
    text(c, this.pressed ? 'Hurrying' : 'Hold to hurry', 195, 512, { size: 28 });
    text(c, this.pressed ? 'Wrong tRNAs get less time to fall off' : 'Let go, and a wrong tRNA gets time to fall off', 195, 546, { size: 14.5 });
  }
}
