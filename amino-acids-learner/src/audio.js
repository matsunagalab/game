// All sound is synthesised. Events land on a beat grid, so correct answers play in time,
// and instruments join as the streak grows.
import { AA } from './data/amino.js';

const PENTATONIC = [0, 2, 4, 7, 9];
const CHORDS = [[0, 4, 7, 11, 14], [-3, 0, 4, 7, 11], [-7, -3, 0, 4, 9], [-5, 0, 2, 7, 11]];
const ARP = [0, 2, 1, 3, 2, 1, 4, 2];
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.flow = 0;
    this.smoothFlow = 0;
    this.bpm = 84;
    this.root = 50;
    this.step = 0;
    this.nextStep = 0;
    this.playing = false;
    this.start0 = performance.now() / 1000;
  }

  // Must run inside a tap or click, or mobile browsers keep the sound blocked.
  unlock() {
    if (this.ctx) {
      this.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.resume();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 6;
    this.master.connect(limiter).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.4);
    this.wet.connect(verb).connect(this.master);
    this.duck = ctx.createBiquadFilter();
    this.duck.type = 'lowpass';
    this.duck.frequency.value = 12000;
    this.duck.connect(this.dry);
    this.duck.connect(this.wet);
    this.noise = this.noiseBuffer();
    this.timer = setInterval(() => this.schedule(), 30);
  }

  // A browser may refuse sound. The game then simply plays silently.
  resume() { this.ctx?.resume()?.catch(() => {}); }

  suspend() { this.ctx?.suspend()?.catch(() => {}); }

  impulse(seconds) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2 * 0.6;
    }
    return buf;
  }

  noiseBuffer() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.03);
  }

  tempo(bpm, root = 50) {
    this.bpm = bpm;
    this.root = root;
  }

  begin() {
    this.playing = true;
    this.step = 0;
    this.nextStep = this.now() + 0.08;
    this.start0 = this.nextStep;
  }

  stop() { this.playing = false; }

  get eighth() { return 30 / this.bpm; }

  // The next grid time at least lead seconds away. Eighth notes keep answers snappy.
  nextGrid(lead = 0.14) {
    const e = this.eighth;
    const t = this.now() + lead;
    const k = Math.ceil((t - this.start0) / e);
    return this.start0 + k * e;
  }

  schedule() {
    if (!this.playing || !this.ctx || this.ctx.state !== 'running') return;
    while (this.nextStep < this.ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextStep);
      this.step += 1;
      this.nextStep += this.eighth;
    }
  }

  playStep(s, t) {
    this.smoothFlow += (this.flow - this.smoothFlow) * 0.12;
    const f = this.smoothFlow;
    const bar = Math.floor(s / 8);
    const beat = s % 8;
    const chord = CHORDS[bar % 4];
    const root = this.root;
    if (beat === 0) {
      chord.slice(0, 4).forEach((n) => this.pad(root + 12 + n, t, this.eighth * 8));
      this.pluck(root - 12 + chord[0], t, 'bass', 0.3);
    }
    if (beat === 3 && f > 0.15) this.pluck(root - 12 + chord[0], t, 'bass', 0.2);
    if (beat === 6 && f > 0.35) this.pluck(root - 12 + chord[2], t, 'bass', 0.18);
    const arpGain = 0.03 + 0.1 * Math.min(1, f * 1.5);
    this.pluck(root + 24 + chord[ARP[beat]], t, 'kalimba', arpGain);
    if (f > 0.3 && beat % 4 === 0) this.thump(t, 0.2 * Math.min(1, (f - 0.2) * 3));
    if (f > 0.5 && beat % 2 === 1) this.shake(t, 0.05 * Math.min(1, (f - 0.4) * 3));
    if (f > 0.75 && bar % 2 === 1 && beat === 4) this.pluck(root + 36 + chord[(bar >> 1) % 4 + 1], t, 'bell', 0.09);
  }

  pad(midi, t, length) {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.6);
    g.gain.setValueAtTime(0.022, t + length * 0.7);
    g.gain.linearRampToValueAtTime(0, t + length + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.connect(lp).connect(this.duck);
    for (const d of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq(midi);
      o.detune.value = d;
      o.connect(g);
      o.start(t);
      o.stop(t + length + 0.6);
    }
  }

  pluck(midi, t, kind, gain) {
    const { ctx } = this;
    const f = freq(midi);
    const voice = {
      marimba: { parts: [[1, 1], [3.93, 0.3]], decay: 0.42 },
      kalimba: { parts: [[1, 1], [2.02, 0.22], [5.4, 0.1]], decay: 0.8 },
      glass: { parts: [[1, 1], [3.01, 0.32], [6.02, 0.1]], decay: 1.1 },
      bell: { parts: [[1, 1], [2.76, 0.4], [5.4, 0.2]], decay: 1.7 },
      bass: { parts: [[1, 1], [2, 0.15]], decay: 0.7 },
    }[kind];
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(this.duck);
    for (const [ratio, level] of voice.parts) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const d = voice.decay / (ratio > 2 ? 3 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.02);
    }
  }

  thump(t, gain) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.dry);
    o.start(t);
    o.stop(t + 0.22);
  }

  shake(t, gain) {
    const { ctx } = this;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    s.connect(hp).connect(g).connect(this.dry);
    s.start(t, Math.random() * 0.8, 0.09);
  }

  /* ----- events from the game ----- */

  note(code, t) {
    if (!this.ctx) return;
    const { family, degree } = AA[code];
    const octave = Math.floor(degree / 5);
    const midi = this.root + 12 * (octave + 1) + PENTATONIC[degree % 5];
    const when = t ?? this.ctx.currentTime;
    if (family === 'oily') this.pluck(midi, when, 'marimba', 0.5);
    else if (family === 'ring') this.pluck(midi + 12, when, 'glass', 0.32);
    else if (family === 'polar') this.pluck(midi + 12, when, 'kalimba', 0.42);
    else if (family === 'plus') {
      this.pluck(midi + 12, when, 'bell', 0.24);
      this.pluck(midi + 19, when + this.eighth / 2, 'bell', 0.16);
    } else {
      this.pluck(midi + 19, when, 'bell', 0.24);
      this.pluck(midi + 12, when + this.eighth / 2, 'bell', 0.16);
    }
  }

  wrong() {
    if (!this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(92, t + 0.22);
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.dry);
    o.start(t);
    o.stop(t + 0.32);
    this.muffle(true);
  }

  // Close the filter while a mistake is on screen, so the correction feels like a held breath.
  muffle(on) {
    if (!this.ctx) return;
    this.duck.frequency.setTargetAtTime(on ? 520 : 12000, this.ctx.currentTime, on ? 0.04 : 0.2);
  }

  tap() {
    if (this.ctx) this.pluck(this.root + 31, this.ctx.currentTime, 'marimba', 0.14);
  }

  sweep(t) {
    if (!this.ctx) return;
    const { ctx } = this;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
    s.connect(bp).connect(g).connect(this.wet);
    s.start(t, Math.random() * 0.3, 0.6);
  }

  // The finished protein plays its own sequence, and ends on the home chord.
  melody(seq) {
    if (!this.ctx) return 0;
    const spacing = Math.min(this.eighth / 2, 3.2 / seq.length);
    const t0 = this.ctx.currentTime + 0.1;
    [...seq].forEach((c, i) => this.note(c, t0 + i * spacing));
    const end = t0 + seq.length * spacing + 0.1;
    [0, 7, 12, 16, 19, 24].forEach((n, i) => this.pluck(this.root + 12 + n, end + i * 0.05, 'bell', 0.14));
    return end - t0;
  }

  low() {
    if (!this.ctx) return;
    [0, -5, -12].forEach((n, i) => this.pluck(this.root + n, this.ctx.currentTime + i * 0.18, 'bass', 0.4));
  }
}
