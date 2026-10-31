// All sound is synthesised, so the game stays one small file.
import { BEAT, piece } from './music.js';
import { Player } from './player.js';

const PENTA = [0, 3, 5, 7, 10];
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.startPerf = performance.now();
  }

  // Browsers only allow audio after a tap.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Some embedded frames refuse audio. The game then plays on in silence.
    let ctx;
    try {
      ctx = this.ctx = new AC();
    } catch {
      return;
    }
    const master = (this.master = ctx.createGain());
    master.gain.value = this.muted ? 0 : 0.85;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -14;
    limit.ratio.value = 6;
    master.connect(limit).connect(ctx.destination);
    // A short room, built from decaying noise.
    const len = ctx.sampleRate * 1.3;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    const room = ctx.createConvolver();
    room.buffer = ir;
    const wet = (this.wet = ctx.createGain());
    wet.gain.value = 0.22;
    wet.connect(room).connect(master);
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.player = new Player(ctx, BEAT, piece, (n, t) => this.band(n, t));
    this.player.muted = this.muted;
    this.player.hold(!!this.quietBand);
  }

  // The Beat chapter makes its own music, so the band sits out.
  holdBand(on) {
    this.quietBand = on;
    this.player?.hold(on);
  }

  band(n, t) {
    const f = n.midi ? hz(n.midi) : 0;
    const length = n.beats * BEAT;
    if (n.kind === 'vibes') {
      this.voice(f, t, { gain: 0.085, dur: 1.5, wet: 0.7 });
      this.voice(f * 4, t, { gain: 0.016, dur: 0.22, wet: 0.3 });
    } else if (n.kind === 'keys') {
      this.voice(f, t, { type: 'triangle', gain: 0.024, dur: 0.42, attack: 0.008, wet: 0.5, filter: 1500 });
    } else if (n.kind === 'bass') {
      this.voice(f, t, { type: 'triangle', gain: n.soft ? 0.09 : 0.15, dur: Math.max(0.3, length), attack: 0.012, wet: 0.08, filter: 620 });
      this.voice(f * 2, t, { gain: 0.03, dur: 0.12, wet: 0 });
    } else if (n.kind === 'rim') {
      this.burst(t, { dur: 0.03, gain: 0.05, freq: 2200, q: 7, wet: 0.12 });
    } else if (n.kind === 'shaker') {
      this.burst(t, { dur: 0.05, gain: n.soft ? 0.008 : 0.016, freq: 6500, q: 1, type: 'highpass', wet: 0 });
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.player) this.player.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  // Seconds on the clock that rhythm is judged against. A song picks its clock once, at the start.
  now(useAudio = this.running) {
    return useAudio && this.ctx ? this.ctx.currentTime : (performance.now() - this.startPerf) / 1000;
  }

  note(degree, base = 146.83) {
    const oct = Math.floor(degree / 5);
    const step = ((degree % 5) + 5) % 5;
    return base * 2 ** (oct + PENTA[step] / 12);
  }

  voice(freq, t, { type = 'sine', dur = 0.3, gain = 0.2, attack = 0.004, wet = 0.5, slide = 0, filter = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      out = f;
    }
    out.connect(g);
    g.connect(this.master);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.wet);
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(t, { dur = 0.08, gain = 0.2, freq = 2000, q = 1, type = 'bandpass', wet = 0.2 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.wet);
    }
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // A soft mallet: a sine with a brief bright overtone.
  pluck(freq, gain = 0.2, t = this.t, wet = 0.5) {
    this.voice(freq, t, { gain, dur: 0.55, wet });
    this.voice(freq * 4.01, t, { gain: gain * 0.28, dur: 0.09, wet: wet * 0.4 });
  }

  tick(gain = 0.09) {
    this.burst(this.t, { dur: 0.018, gain, freq: 3400, q: 4, wet: 0.05 });
  }

  ratchet(gain = 0.16) {
    this.burst(this.t, { dur: 0.03, gain, freq: 1500, q: 6, wet: 0.1 });
    this.voice(420, this.t, { gain: gain * 0.5, dur: 0.04, type: 'square', wet: 0, filter: 1400 });
  }

  bump() {
    const t = this.t;
    this.voice(150, t, { gain: 0.32, dur: 0.16, slide: 0.45, wet: 0.1 });
    this.burst(t, { dur: 0.05, gain: 0.14, freq: 700, q: 1, wet: 0.1 });
  }

  // Rising run, used when hydrogen bonds zip shut.
  zip(i, base = 0) {
    this.pluck(this.note(base + i + 7), 0.17, this.t, 0.6);
  }

  chord(degrees, gain = 0.14, spread = 0.05) {
    degrees.forEach((d, i) => this.pluck(this.note(d), gain, this.t + i * spread, 0.8));
  }

  stamp() {
    const t = this.t;
    this.voice(95, t, { gain: 0.5, dur: 0.22, slide: 0.5, wet: 0.2 });
    this.burst(t, { dur: 0.05, gain: 0.3, freq: 1100, q: 0.7, wet: 0.2 });
  }

  page() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.burst(this.t, { dur: 0.42, gain: 0.07, freq: 900, q: 0.6, type: 'bandpass', wet: 0.3 });
  }

  squeeze() {
    const t = this.t;
    this.voice(70, t, { gain: 0.4, dur: 0.6, slide: 1.8, wet: 0.3, type: 'triangle' });
    this.burst(t, { dur: 0.5, gain: 0.08, freq: 500, q: 0.8, wet: 0.3 });
  }

  clunk(gain = 0.3) {
    const t = this.t;
    this.voice(190, t, { gain, dur: 0.12, slide: 0.6, wet: 0.2, type: 'triangle' });
    this.burst(t, { dur: 0.03, gain: gain * 0.6, freq: 2400, q: 3, wet: 0.2 });
  }

  bounce() {
    const t = this.t;
    this.voice(320, t, { gain: 0.2, dur: 0.3, slide: 0.35, wet: 0.2, type: 'triangle' });
  }

  bloom() {
    this.chord([0, 2, 4, 5, 7, 9, 10, 12], 0.15, 0.07);
    this.voice(this.note(-5), this.t, { gain: 0.25, dur: 2.2, attack: 0.3, wet: 1, type: 'triangle' });
  }

  // Rhythm parts: scheduled ahead of time at an exact t.
  kick(t, gain = 0.55) {
    this.voice(120, t, { gain, dur: 0.14, slide: 0.35, wet: 0.02 });
  }

  snare(t, gain = 0.2) {
    this.burst(t, { dur: 0.1, gain, freq: 1800, q: 0.6, wet: 0.2 });
    this.voice(210, t, { gain: gain * 0.5, dur: 0.07, wet: 0.1, type: 'triangle' });
  }

  hat(t, gain = 0.05) {
    this.burst(t, { dur: 0.03, gain, freq: 8000, q: 1, type: 'highpass', wet: 0 });
  }

  bass(freq, t, dur = 0.3, gain = 0.2) {
    this.voice(freq, t, { gain, dur, type: 'triangle', attack: 0.01, wet: 0.05, filter: 700 });
  }
}

export const buzz = (ms) => {
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(ms);
};
