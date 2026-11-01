// All sound is synthesised, and every source decays on its own. There is no sustained tone anywhere in this game.
import { BEAT, piece, place } from './music.js';
import { Player } from './player.js';
import { makeRng } from './science/rng.js';

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const DELAY = 2.2; // Every note is scheduled this late, so that noise can move it earlier as well as later.

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.sigma = 0; this.target = 0; this.rng = makeRng(31); this.log = []; this.lastTap = 0; }

  // Must run inside a user gesture for iOS. Safe to call any number of times.
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    // iOS only opens the audio path once something has played inside a user gesture.
    const quiet = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
    src.buffer = quiet; src.connect(this.master); src.start(0);
    ctx.resume().catch(() => {});
    this.dry = ctx.createGain(); this.dry.gain.value = 0.78;
    this.dry.connect(this.master);
    const rev = ctx.createConvolver();
    rev.buffer = this.room(2.1, 3.4);
    const rg = ctx.createGain(); rg.gain.value = 0.55;
    rev.connect(rg); rg.connect(this.master);
    // Everything passes under the water a little: a gentle low-pass, opening as the noise clears.
    this.water = ctx.createBiquadFilter(); this.water.type = 'lowpass'; this.water.frequency.value = 3200; this.water.Q.value = 0.3;
    this.music = ctx.createGain(); this.music.gain.value = 0.82;
    this.music.connect(this.water); this.water.connect(this.dry); this.water.connect(rev);
    this.player = new Player(ctx, BEAT, (pass) => piece(pass), (n, t) => this.note(n, t));
    this.player.muted = this.muted;
    setInterval(() => {
      this.sigma += (this.target - this.sigma) * 0.3;
      if (this.ctx.state === 'running') this.water.frequency.setTargetAtTime(3400 - 1900 * this.sigma, this.ctx.currentTime, 0.2);
    }, 100);
  }

  room(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay * (i < 400 ? i / 400 : 1);
    }
    return b;
  }

  setMuted(m) {
    this.muted = m;
    if (this.player) this.player.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  // The noise level of what is on screen, 0 clean to 1 pure noise.
  setSigma(x) { this.target = Math.max(0, Math.min(1, x)); }

  // One note of the score, placed by the real noise level at this moment. Noise also thins the notes, so that high sigma stays sparse.
  note(n, t) {
    const s = this.sigma, xt = this.rng.n(), xp = this.rng.n(), keep = this.rng.u();
    if (keep < 0.42 * s) return;
    const p = place(n, s, xt, xp), at = Math.max(this.ctx.currentTime + 0.02, t + DELAY + p.offset);
    const vel = n.vel * (1 - 0.3 * s), pan = (this.rng.u() - 0.5) * (0.3 + 1.1 * s);
    if (this.log.length < 4000) this.log.push({ nominal: t + DELAY, at, midi: n.midi, heard: p.midi, s });
    if (n.voice === 'hang') this.hang(hz(p.midi), at, 0.24 * vel, pan, 2.5);
    else if (n.voice === 'low') this.hang(hz(p.midi), at, 0.3 * vel, pan * 0.5, 3);
    else if (n.voice === 'kal') this.kalimba(hz(p.midi), at, 0.14 * vel, pan);
    else this.glass(hz(p.midi), at, 0.08 * vel, pan);
  }

  voice(f, t, level, attack, ring, pan, detune = 0) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0002, t + attack + ring);
    o.connect(g);
    const p = ctx.createStereoPanner?.();
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.music); } else g.connect(this.music);
    o.start(t); o.stop(t + attack + ring + 0.03);
  }

  // A hang drum: a round fundamental, its octave and a soft twelfth, struck with the hand.
  hang(f, t, amp, pan = 0, ring = 2.1) {
    this.voice(f, t, amp, 0.006, ring, pan);
    this.voice(f * 2.003, t, amp * 0.32, 0.004, ring * 0.55, pan);
    this.voice(f * 3.01, t, amp * 0.1, 0.003, ring * 0.3, pan);
  }

  // A kalimba tine heard through water: a clean tone and a brief bright partial.
  kalimba(f, t, amp, pan = 0) {
    this.voice(f, t, amp, 0.002, 0.95, pan);
    this.voice(f * 5.03, t, amp * 0.13, 0.001, 0.08, pan);
  }

  // A glass bowl, struck, with the inharmonic partials of a bowl. It still dies away by itself.
  glass(f, t, amp, pan = 0) {
    this.voice(f, t, amp, 0.015, 2.6, pan);
    this.voice(f * 2.71, t, amp * 0.4, 0.008, 1.5, pan, 3);
    this.voice(f * 5.15, t, amp * 0.14, 0.004, 0.7, pan);
  }

  // A drop falling into water: a quick rising chirp.
  drip(level = 0.5, at = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01 + at, o = ctx.createOscillator(), g = ctx.createGain(), f = 520 + this.rng.u() * 500;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11 * level, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0002, t + 0.11);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.13);
  }

  tap() { const now = performance.now(); if (now - this.lastTap > 60) { this.lastTap = now; this.drip(0.42); } }

  good(level = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.03, tones = [74, 78, 81, 86, 90];
    for (let i = 0; i <= level + 1; i += 1) this.kalimba(hz(tones[i]), t + i * 0.11, 0.1, (i - 1) * 0.2);
  }

  soft() {
    if (!this.ctx || this.muted) return;
    this.hang(hz(57), this.ctx.currentTime + 0.02, 0.11, 0, 1);
  }
}
