// All sound is synthesised: bronze with inharmonic partials, rendered once into buffers and then struck.
// Every tone dies away on its own, and nothing is held. Sound effects use the same tuning as the piece.
import { piece, PULSE, hz, BASE_HZ, pulsesPerBeat } from './score.js';
import { Player } from './player.js';

// partial ratio, level, decay seconds. Ratios are near those reported for gamelan bars and pots, not copied from one instrument.
const VOICE = {
  saron:   { base: BASE_HZ, dur: 1.9, p: [[1, 1, 1.0], [2.72, 0.32, 0.34], [5.16, 0.14, 0.12], [8.4, 0.05, 0.05]], tick: 0.22 },
  demung:  { base: BASE_HZ / 2, dur: 2.4, p: [[1, 1, 1.3], [2.68, 0.3, 0.42], [5.0, 0.1, 0.14]], tick: 0.16 },
  peking:  { base: BASE_HZ * 2, dur: 1.1, p: [[1, 1, 0.55], [2.76, 0.28, 0.16], [5.3, 0.1, 0.06]], tick: 0.3 },
  gangsa:  { base: BASE_HZ * 2, dur: 0.9, p: [[1, 1, 0.42], [2.74, 0.22, 0.12], [3.92, 0.1, 0.07]], tick: 0.24 },
  bonang:  { base: BASE_HZ, dur: 1.3, p: [[1, 1, 0.62], [1.53, 0.16, 0.3], [2.03, 0.34, 0.26], [2.86, 0.12, 0.12], [4.1, 0.05, 0.08]], tick: 0.1 },
  kenong:  { base: BASE_HZ, dur: 2.2, p: [[1, 1, 1.1], [1.97, 0.3, 0.5], [2.92, 0.14, 0.3], [4.2, 0.05, 0.12]], tick: 0.06 },
  kempul:  { base: BASE_HZ / 2, dur: 3.0, p: [[1, 1, 1.5], [2.0, 0.34, 0.8], [3.04, 0.12, 0.4]], tick: 0.04 },
  gong:    { base: 55, dur: 4.7, p: [[1, 1, 2.1], [1.012, 0.7, 1.8], [2.0, 0.42, 1.2], [2.96, 0.22, 0.7], [4.13, 0.1, 0.4], [5.7, 0.05, 0.25]], tick: 0.03 },
  kethuk:  { base: BASE_HZ * 0.76, dur: 0.34, p: [[1, 1, 0.09], [2.3, 0.2, 0.04]], tick: 0.08 },
  thud:    { base: BASE_HZ / 2, dur: 0.5, p: [[1, 1, 0.12], [1.5, 0.3, 0.06]], tick: 0.1 },
};
VOICE.gangsa2 = VOICE.gangsa;

// Paired tuning: every bar in the set has a partner tuned a few hertz sharp. Struck together they beat.
const OMBAK = { saron: 4.6, peking: 6.5, gangsa: 7.2, gangsa2: 7.2, demung: 3.2, bonang: 2.4, kenong: 1.8 };
const GAIN = { saron: 0.34, demung: 0.26, peking: 0.17, gangsa: 0.115, gangsa2: 0.115, bonang: 0.16, kenong: 0.23, kempul: 0.34, gong: 0.95, kethuk: 0.2, thud: 0.3 };

function renderVoice(ctx, v) {
  const sr = ctx.sampleRate, n = Math.floor(v.dur * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const norm = v.p.reduce((s, q) => s + q[1], 0);
  for (const [ratio, amp, decay] of v.p) {
    const w = 2 * Math.PI * v.base * ratio / sr, k = Math.exp(-1 / (decay * sr));
    let e = amp / norm, s = Math.sin(0), c = Math.cos(0);
    const sw = Math.sin(w), cw = Math.cos(w);
    for (let i = 0; i < n; i++) { d[i] += e * s; const ns = s * cw + c * sw; c = c * cw - s * sw; s = ns; e *= k; }
  }
  // The mallet: a very short noise tick.
  const tn = Math.floor(0.012 * sr);
  for (let i = 0; i < tn; i++) d[i] += (Math.random() * 2 - 1) * v.tick * (1 - i / tn) ** 2;
  for (let i = 0; i < 40; i++) d[i] *= i / 40;
  // Ends at true silence.
  const tail = Math.floor(0.05 * sr);
  for (let i = 0; i < tail; i++) d[n - 1 - i] *= i / tail;
  return b;
}

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.chapter = 'water'; this.opts = { level: 0, layers: 0, gong: false }; this.onGong = null; this.steps = []; this.gongs = []; }

  // Must run inside a user gesture on iOS.
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const master = this.master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.006;
    master.connect(comp); comp.connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.connect(master);
    const rev = ctx.createConvolver(); rev.buffer = this.pavilion(1.9); 
    this.wet = ctx.createGain(); this.wet.gain.value = 0.2; this.wet.connect(rev);
    rev.connect(master);
    this.music = ctx.createGain(); this.music.gain.value = 0.5;
    this.music.connect(this.dry); this.music.connect(this.wet);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.dry); this.sfx.connect(this.wet);
    this.buffers = {};
    // Render in small slices so the first tap stays responsive.
    const names = Object.keys(VOICE).filter((k) => k !== 'gangsa2');
    const next = () => {
      const k = names.shift();
      if (!k) {
        this.buffers.gangsa2 = this.buffers.gangsa;
        this.player = new Player(ctx, this.opts.pulse || PULSE, (pass) => this.nextPiece(pass), (n, t) => this.strike(n, t));
        this.player.muted = this.muted;
        this.player.hold(this.opts.quiet === true);
        return;
      }
      this.buffers[k] = renderVoice(ctx, VOICE[k]);
      setTimeout(next, 0);
    };
    next();
  }

  pavilion(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3.4 * (i < 240 ? i / 240 : 1) * 0.5; }
    return b;
  }

  nextPiece(pass) {
    const o = this.pending || this.opts; this.opts = o; this.pending = null;
    const rest = (pass % 5 === 4) && !o.noRest;
    const p = piece(this.chapter, pass, { ...o, rest });
    this.level = o.level;
    if (this.player) this.player.beat = o.pulse || PULSE;
    return p;
  }

  // Chooses what plays. Changes land at the next gong, as an irama change does.
  setMusic(chapter, opts, now = false) {
    const o = { level: 0, layers: 1, gong: true, ...opts };
    if (chapter !== this.chapter || now) {
      this.chapter = chapter; this.opts = o; this.pending = null;
      if (this.player) { this.player.pass = 0; this.player.hold(true); this.player.hold(false); }
    } else this.pending = o;
    if (o.quiet) this.player?.hold(true); else if (this.player?.held) this.player.hold(false);
  }

  strike(n, t) {
    const b = this.buffers[n.inst]; if (!b) return;
    const ctx = this.ctx, v = VOICE[n.inst], f = n.inst === 'gong' ? v.base : (n.inst === 'kethuk' ? v.base : hz(n.deg, n.oct));
    const rate = f / v.base, amp = GAIN[n.inst] * n.vel;
    const one = (r, a, pan) => {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = b; s.playbackRate.value = r; g.gain.value = a; s.connect(g);
      const p = ctx.createStereoPanner?.();
      if (p) { p.pan.value = pan; g.connect(p); p.connect(this.music); } else g.connect(this.music);
      s.start(t);
    };
    const pair = OMBAK[n.inst];
    if (pair) { one(rate, amp * 0.62, n.pan ?? 0); one(rate * (1 + pair / f), amp * 0.62, n.pan ?? 0); } else one(rate, amp, n.pan ?? 0);
    if (n.inst === 'gong') { this.gongs.push(t); const ms = (t - ctx.currentTime) * 1000; setTimeout(() => this.onGong?.(), Math.max(0, ms)); }
    if (n.inst === 'kenong' || n.inst === 'kempul') { const ms = (t - ctx.currentTime) * 1000; setTimeout(() => this.onBeat?.(n), Math.max(0, ms)); }
  }

  setMuted(m) { this.muted = m; if (this.player) this.player.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.04); }

  // An effect that lands on the music's next pulse, so play and piece stay together.
  fx(inst, deg, oct, vel = 0.7, snap = true) {
    if (!this.ctx || !this.buffers?.[inst] || this.muted) return;
    const t0 = this.ctx.currentTime + 0.01, t = snap && this.player && !this.player.held ? Math.min(this.player.nextPulse(t0), t0 + 0.13) : t0;
    const ctx = this.ctx, b = this.buffers[inst], v = VOICE[inst], f = inst === 'thud' ? v.base : hz(deg, oct);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.playbackRate.value = f / v.base; g.gain.value = GAIN[inst] * vel * 1.5;
    s.connect(g); g.connect(this.sfx); s.start(t);
  }

  // The stroke rising through the scale as a finger crosses the site.
  stroke(i) { const seq = [1, 2, 3, 5, 6]; this.fx('gangsa', seq[i % 5], Math.floor(i / 5), 0.5, false); }
  good(i = 0) { const seq = [1, 3, 5, 6, 2]; this.fx('saron', seq[i % 5], 1, 0.9); this.fx('peking', seq[(i + 1) % 5], 1, 0.6); }
  held() { this.fx('bonang', 3, 0, 0.7); }
  bad() { this.fx('thud', 1, 0, 0.9, false); }
  stepDone(i) { [1, 2, 3].forEach((_, k) => setTimeout(() => this.fx('saron', [1, 2, 3, 5, 6][(i + k * 2) % 5], 1, 0.7, false), k * 95)); }
  gongNow() { this.fx('gong', 6, -2, 0.9, false); }
  chime() { [6, 1, 2, 3, 5, 6].forEach((d, k) => setTimeout(() => this.fx('gangsa', d, k > 0 ? 2 : 1, 0.6, false), k * 85)); }
  tap() { this.fx('kethuk', 2, 0, 0.5, false); }
  pluck(ratio) { if (!this.ctx || !this.buffers?.saron) return; const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = this.buffers.saron; s.playbackRate.value = ratio; g.gain.value = 0.7; s.connect(g); g.connect(this.sfx); s.start(); }
}

export { pulsesPerBeat };
