// Chapter 1. The player is both hands on the Ras switch. What counts is how long ERK stays on.
import { Chapter, text, JEWEL as J, tile, clamp, alpha } from './base.js';
import { bilayer, smooth, back, anchor } from '../kit.js';
import { stepCascade, stepFos, newFos, ERK_ON } from '../logic/ras.js';

const RAS_X = [52, 123, 195, 267, 338];
const OFF = [J.slate, J.sky, J.sky, J.lead];
const ON = [J.amber, '#fff0a8', '#ffe27a', J.ruby];
const RAS_Y = 244;
const END = 38; // The growth factor is gone by now.
const FEEDBACK = 10; // Signal, in ERK × seconds, before the pathway turns its own input down.
const TIER = 5; // The same number in each tier: real copy numbers differ, and RAF is the scarcest.

export default class Signal extends Chapter {
  glass = [[0, 0, 40, 1.72, 0, 11], [0, 12, 40, 10.3, 0, 12]];

  constructor(game) {
    super(game);
    this.ras = RAS_X.map((x) => ({ x, on: false, job: null, jt: 0, flip: 0, g12v: false, life: 0 }));
    this.c = { raf: 0, mek: 0, erk: 0 };
    this.fos = newFos();
    this.erkOn = 0;
    this.tipped = 0;
    this.phase = 'healthy';
    this.dimer = 0;
    this.blocked = 0;
    this.fb = 0;
  }

  beatSpec() {
    const k = 5.2;
    return {
      ends: ['GDP', 'GTP'],
      line: (f) => (f < 0.35 ? 'With GDP, switch I and switch II hang loose.' : f < 0.75 ? 'Move the slider: these are the real atoms of Ras, from two crystal structures.' : 'The third phosphate pulls Thr35 and Gly60 in. Only this closed shape fits RAF.'),
      draw: (c, f) => {
        const st = this.stage;
        text(c, 'Why GTP switches Ras on', 195, 16, { size: 17, color: J.gold, chip: true });
        const x = 195; const y = 238;
        st.morph('ras', f, x, y, { k, colors: [J.slate, J.gold, J.orange] });
        const g = anchor('rasT', 'pg');
        // The γ-phosphate is present only in GTP.
        c.fillStyle = alpha(J.ruby, smooth((f - 0.45) / 0.4));
        c.beginPath(); c.arc(x + g[0] * k, y + g[1] * k, 11, 0, 6.28); c.fill();
        if (f > 0.8) { c.strokeStyle = J.vellum; c.lineWidth = 1.5; c.beginPath(); c.moveTo(195, 414); c.lineTo(x + g[0] * k, y + g[1] * k); c.stroke(); text(c, 'γ-phosphate', 195, 424, { size: 14, chip: true, color: J.ruby }); }
        const t = anchor('rasT', 't35'); const q = anchor('rasT', 'g60');
        c.strokeStyle = J.vellum; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(70, 392); c.lineTo(x + t[0] * k, y + t[1] * k); c.moveTo(320, 392); c.lineTo(x + q[0] * k, y + q[1] * k); c.stroke();
        text(c, 'Switch I', 70, 400, { size: 15, chip: true, color: J.gold });
        text(c, 'Switch II', 320, 400, { size: 15, chip: true, color: J.orange });
      },
    };
  }

  start() {
    this.t = 0;
    this.say('The receptors sit apart. Wait for the growth factor.');
  }

  get sosHere() {
    if (this.t < 4 || this.t >= END || this.blocked > 0) return false;
    return !(this.t > 16.5 && this.t < 19.5); // Receptors are pulled into the cell.
  }

  tap(r) {
    if (r.job) return;
    if (r.g12v) { r.job = 'bounce'; r.jt = 0; this.sound.bad(); this.fx.float(r.x, RAS_Y + 56, 'Arginine cannot reach', J.ruby, 15); this.buzz(30); return; }
    if (r.on) { r.job = 'gap'; r.jt = 0; this.sound.tick(-5); return; }
    if (!this.sosHere) {
      this.say(this.t < 4 ? 'No growth factor yet, so no SOS at the membrane.' : this.blocked > 0 ? 'ERK is feeding back: the pathway phosphorylates SOS, which lets go for a while.' : 'The receptors are being pulled inside, so SOS has no place to sit.');
      this.fx.float(r.x, RAS_Y + 56, 'No SOS here', J.vellum, 15);
      this.sound.tick(-12, 0.06);
      return;
    }
    r.job = 'gef'; r.jt = 0; this.sound.tick(4);
  }

  update(dt) {
    const t = this.t;
    this.dimer = smooth((t - 2.4) / 1.3);
    for (const r of this.ras) {
      r.flip += ((r.on ? 1 : 0) - r.flip) * Math.min(1, dt * 9);
      if (r.job) {
        r.jt += dt;
        if (r.job === 'gef' && r.jt > 0.5) {
          r.job = null;
          // GDP has left an open pocket, and GTP is about ten times commoner in the cell.
          if (Math.random() < 0.1) { this.fx.float(r.x, RAS_Y - 2, 'GDP again', J.sky, 15); this.sound.tick(-8); } else { r.on = true; r.life = 4 + Math.random() * 5; this.fx.burst(r.x, RAS_Y, J.gold, 8); this.sound.bell(4, 0.12); }
        } else if (r.job === 'gap' && r.jt > 0.35) { r.job = null; r.on = false; this.fx.float(r.x + 14, RAS_Y + 40, 'Pi', J.emerald, 15); } else if (r.job === 'bounce' && r.jt > 0.5) r.job = null;
      } else if (r.on && !r.g12v) {
        r.life -= dt; // Background GAPs keep turning Ras off, even with no help from you.
        if (r.life <= 0) { r.on = false; this.fx.float(r.x, RAS_Y + 56, 'off by itself', J.vellum, 14); this.sound.tick(-6, 0.05); }
      }
    }
    const share = this.ras.filter((r) => r.on).length / this.ras.length;
    this.c = stepCascade(this.c, share, dt);
    const { erk } = this.c;
    if (this.phase === 'healthy') {
      this.fos = stepFos(this.fos, erk, dt);
      if (erk >= ERK_ON) this.erkOn += dt;
      // The pathway's own output turns its input down by phosphorylating SOS. This is the normal way a signal ends, at any strength.
      this.fb += erk * dt;
      if (this.fb > FEEDBACK && this.blocked <= 0) { this.blocked = 3.5; this.fb = 0; this.say('ERK is feeding back: the pathway phosphorylates SOS, which lets go for a while.'); this.sound.warn(); }
      this.blocked = Math.max(0, this.blocked - dt);
      if (t > 4 && this.tipped < 1) { this.tipped = 1; this.say('EGF joins two receptors, and Grb2 brings SOS to them. Now tap Ras to load GTP.'); this.sound.whoosh(); this.flash(0.2); }
      if (t > 10 && this.tipped < 2) { this.tipped = 2; this.say('Fos mRNA is made at once, but its protein comes later. Keep ERK in the gold zone.'); }
      if (t > 17 && this.tipped < 3) { this.tipped = 3; this.say('Receptors are pulled inside the cell. Load Ras before they go.'); }
      if (t > 22 && this.tipped < 4) { this.tipped = 4; this.say('Fos protein is arriving. If ERK is on, ERK and its target RSK phosphorylate it and save it.'); }
      if (t > END - 3 && this.tipped < 5) { this.tipped = 5; this.say('The growth factor is nearly gone.'); }
      if (t > END) {
        this.phase = 'g12v';
        this.t2 = 0;
        this.result = this.fos.stable;
        this.ras[1].g12v = true; this.ras[3].g12v = true;
        this.ras[1].on = true; this.ras[3].on = true;
        this.flash(0.4);
        this.sound.bad();
        this.say('No growth factor now. But in another cell two Ras are G12V: try to turn them off.');
      }
    } else {
      this.t2 += dt;
      this.stress(smooth(this.t2 / 7) * 0.5);
      if (this.t2 > 4.5 && this.tipped < 6) { this.tipped = 6; this.say('GAP\'s arginine cannot reach the site, so the signal almost never stops.'); }
      if (this.t2 > 9) this.end();
    }
    this.meters([{ label: 'ERK on', value: `${Math.round(this.erkOn)} s` }, { label: 'Fos saved', value: `${Math.round((this.phase === 'healthy' ? this.fos.stable : this.result) * 100)}%`, bar: this.phase === 'healthy' ? this.fos.stable : this.result }, { label: 'Ras on', value: `${this.ras.filter((r) => r.on).length} of 5` }]);
  }

  end() {
    const s = this.result;
    const roses = s >= 0.95 ? 3 : s >= 0.55 ? 2 : 1;
    const cyclin = Math.max(0.1, s);
    const word = s >= 0.7 ? 'ERK stayed on, so Fos was saved and cyclin D1 is on its way.' : s >= 0.4 ? 'ERK stayed on for a while, so some Fos was saved.' : 'ERK fell too soon, so Fos fell apart, and the cell will wait.';
    this.finish(roses, `ERK on for ${Math.round(this.erkOn)} seconds, ${Math.round(s * 100)}% of Fos saved. ${word}`, { erk: this.erkOn, cell: { cyclin } });
  }

  down(x, y) {
    const r = this.ras.map((q) => [Math.hypot(x - q.x, y - RAS_Y), q]).sort((a, b) => a[0] - b[0])[0];
    if (r[0] < 62) this.tap(r[1]);
  }

  key(k) { const i = +k - 1; if (this.ras[i]) this.tap(this.ras[i]); }

  draw(c) {
    const st = this.stage;
    const t = this.t;
    // Outside: two receptors, apart until the growth factor brings them together. Each is one chain of the real dimer.
    const liganded = this.phase === 'healthy' && t > 2.4 && t < END;
    const gapX = 26 * (1 - this.dimer);
    [[95, 0.04], [295, 0.8]].forEach(([x, ph]) => {
      const bob = Math.sin(t * 0.8 + ph * 6) * 2;
      const col = this.dimer > 0.5 && liganded ? J.emerald : J.slate;
      const col2 = this.dimer > 0.5 && liganded ? J.teal : J.slate;
      st.mol('egfr', x - gapX, 98 + bob, { k: 0.72, colors: [col, null, liganded ? J.gold : null, null] });
      st.mol('egfr', x + gapX, 98 + bob, { k: 0.72, colors: [null, col2, null, liganded ? J.gold : null] });
      if (t > 1 && t < 3) { const f = clamp((t - 1) / 1.4); c.fillStyle = J.gold; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * 30, 10 + f * 74, 6, 0, 6.28); c.fill(); } }
    });
    text(c, liganded ? 'EGF has joined two receptors' : 'Receptors, apart', 195, 18, { size: 15, chip: true, color: liganded ? J.gold : J.vellum });
    bilayer(c, st, 150, 40, '#d8b25a', t * 0.4);
    if (this.sosHere) st.mol('sos', 195, 172, { k: 0.26, colors: [J.emerald], a: 0.5 });
    for (const r of this.ras) {
      c.strokeStyle = J.gold; c.lineWidth = 2;
      c.beginPath(); c.moveTo(r.x, 188); c.quadraticCurveTo(r.x + 4, 200, r.x, RAS_Y - 26); c.stroke();
      const f = r.flip;
      const sway = Math.sin(t * 1.1 + r.x) * 1.4;
      const k = 1.26;
      const cols = r.g12v ? [J.ruby, '#ffd1d8', '#ffd1d8', J.gold] : null;
      if (f < 1 && !r.g12v) st.mol('rasD', r.x + sway, RAS_Y, { k, colors: OFF, a: 1 - f });
      if (f > 0) st.mol('rasT', r.x + sway, RAS_Y, { k, colors: cols ?? ON, a: f });
      if (r.on) { c.fillStyle = alpha(J.gold, 0.16 + 0.08 * Math.sin(t * 5 + r.x)); c.beginPath(); c.arc(r.x, RAS_Y, 38, 0, 6.28); c.fill(); }
      text(c, r.g12v ? 'G12V' : r.on ? 'GTP' : 'GDP', r.x, RAS_Y + 39, { size: 15, chip: true, color: r.on ? J.gold : J.sky });
      if (r.job === 'gef') {
        const p = back(r.jt / 0.18);
        st.mol('sos', r.x - 44 + 16 * p, RAS_Y + 8, { k: 0.5, colors: [J.emerald], a: clamp(r.jt / 0.12) });
        const o = r.jt / 0.5;
        text(c, 'GDP', r.x + o * 20, RAS_Y + 8 - o * 42, { size: 13, color: J.sky, chip: true });
      }
      if (r.job === 'gap' || r.job === 'bounce') {
        const f2 = r.job === 'bounce' ? Math.sin(Math.min(1, r.jt / 0.5) * 3.14) : back(r.jt / 0.16);
        st.mol('gap', r.x + 38 - 12 * f2, RAS_Y + 22, { k: 0.48, colors: [J.rose], a: clamp(r.jt / 0.1) });
      }
    }
    // The cascade: each active kinase switches on many of the next, so the tiers light up in turn.
    const tiers = [['raf', 'RAF', this.c.raf, J.orange, 318], ['mek', 'MEK', this.c.mek, J.teal, 376], ['erk', 'ERK', this.c.erk, J.ruby, 434]];
    tiers.forEach(([m, name, level, col, y]) => {
      for (let i = 0; i < TIER; i++) {
        const x = 90 + i * 62;
        const a = clamp(level * TIER - i);
        st.mol(m, x, y, { k: 0.46, colors: [a > 0.5 ? col : J.slate], a: 0.5 + 0.5 * a });
      }
      text(c, name, 12, y, { size: 16, align: 'left', chip: true, color: level > 0.2 ? J.gold : J.vellum });
    });
    // The needle, with the gold zone where ERK saves Fos.
    const gx = 26; const gw = 338; const gy = 482;
    tile(c, gx - 4, gy - 4, gw + 8, 34, '#2a2436', { r: 6, lead: 2 });
    const hot = this.blocked > 0;
    c.fillStyle = alpha(J.gold, 0.5);
    c.fillRect(gx + gw * ERK_ON, gy, gw * (1 - ERK_ON), 26);
    const nx = gx + gw * clamp(this.c.erk);
    c.fillStyle = J.vellum; c.fillRect(nx - 2.5, gy - 7, 5, 40);
    text(c, 'Active ERK', gx, gy - 12, { size: 14, align: 'left', chip: true });
    if (hot) text(c, 'SOS has let go', gx + gw, gy - 12, { size: 14, align: 'right', chip: true, color: J.ruby });
    // Fos: the message comes first and the protein later.
    const fy = 536;
    [['Fos mRNA', this.fos.mrna, J.sky, 0], ['Fos, unstable', clamp(this.fos.loose), J.rose, 26], ['Fos, saved by ERK', this.phase === 'healthy' ? this.fos.stable : this.result, J.gold, 52]].forEach(([n, v, col, dy]) => {
      text(c, n, gx, fy + dy, { size: 14, align: 'left' });
      c.fillStyle = J.lead; c.fillRect(gx + 118, fy + dy - 8, gw - 118, 16);
      c.fillStyle = col; c.fillRect(gx + 120, fy + dy - 6, (gw - 122) * v, 12);
    });
  }
}
