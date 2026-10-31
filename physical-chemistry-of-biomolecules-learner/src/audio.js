// All sound is synthesised. A plucked string for each hydrogen bond that forms, so rates can be heard.
import { BEAT, piece } from './music.js';
import { Player } from './player.js';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const SCALE = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20, 24]; // In scale, from D.
const BASE = 146.83;
const TUNE = [5, 7, 8, 7, 5, 4, 3, 5, 7, 9, 8, 7, 5, 8, 7, 5, 4, 3, 2, 3];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastCross = 0;
    this.tuneStep = 0;
  }

  // Must run inside a tap. On touch screens only the end of the tap counts.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    this.ctx = ctx;
    ctx.resume().catch(() => {});
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -14;
    limit.ratio.value = 5;
    this.master.connect(limit).connect(ctx.destination);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    const verb = ctx.createConvolver();
    verb.buffer = this.room(2.2);
    this.wet.connect(verb).connect(this.master);
    this.string = this.pluckBuffer();
    this.air = this.noise();
    this.music = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 2600;
    this.music.connect(this.tone).connect(this.master);
    this.tone.connect(this.wet);
    this.player = new Player(ctx, BEAT, piece, (n, t) => this.perform(n, t));
    this.player.muted = this.muted;
  }

  noise() {
    const { ctx } = this;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // One note of the piece.
  perform(n, t) {
    if (n.voice === 'flute') this.flute(n, t);
    else this.koto(n, t, { koto: 0.2, low: 0.13, sweep: 0.07 }[n.voice]);
  }

  // The string buffer again, this time placed exactly, and pressed up into the note when the score says so.
  koto(n, t, gain) {
    const { ctx } = this;
    const s = ctx.createBufferSource();
    s.buffer = this.string;
    const rate = hz(n.midi) / BASE;
    s.playbackRate.setValueAtTime(n.push ? rate * 2 ** (-1 / 12) : rate, t);
    if (n.push) s.playbackRate.linearRampToValueAtTime(rate, t + 0.16);
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.music);
    s.start(t);
    s.stop(t + 1.8);
  }

  // Shakuhachi: it slides up into the note, gains vibrato as it goes, and carries its breath with it.
  flute(n, t) {
    const { ctx } = this;
    const f = hz(n.midi);
    const length = n.beats * BEAT * 0.94;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 2 ** (-0.7 / 12), t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.14);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 4.6;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.006, t + length * 0.8);
    wobble.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.1);
    g.gain.linearRampToValueAtTime(0.05, t + length * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0003, t + length + 0.12);
    o.connect(g).connect(this.music);
    const breath = ctx.createBufferSource();
    breath.buffer = this.air;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = f * 2;
    band.Q.value = 3;
    const b = ctx.createGain();
    b.gain.setValueAtTime(0.03, t);
    b.gain.exponentialRampToValueAtTime(0.0003, t + Math.min(0.5, length));
    breath.connect(band).connect(b).connect(this.music);
    const stop = t + length + 0.14;
    o.start(t); wobble.start(t); breath.start(t, Math.random());
    o.stop(stop); wobble.stop(stop); breath.stop(stop);
  }

  room(seconds) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  // Karplus-Strong string, rendered once and repitched.
  pluckBuffer() {
    const { ctx } = this;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.8);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = Math.round(sr / BASE);
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = i < period * 0.14 ? Math.random() * 2 - 1 : (Math.random() * 2 - 1) * 0.3;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const k = i % period;
      const v = line[k];
      d[i] = v * 0.7;
      line[k] = 0.996 * (0.62 * v + 0.38 * last);
      last = v;
    }
    return buf;
  }

  // A hotter sun opens the tone of the piece.
  setHeat(h) {
    if (!this.ctx) return;
    this.tone.frequency.setTargetAtTime(2000 + 3500 * h, this.ctx.currentTime, 0.2);
  }

  pluck(degree, gain = 0.3, when = 0, pan = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { ctx } = this;
    const oct = Math.floor(degree / SCALE.length);
    const semi = SCALE[((degree % SCALE.length) + SCALE.length) % SCALE.length] + oct * 12;
    const s = ctx.createBufferSource();
    s.buffer = this.string;
    s.playbackRate.value = 2 ** (semi / 12);
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner?.();
    let tail = s.connect(g);
    if (p) { p.pan.value = pan; tail = tail.connect(p); }
    tail.connect(this.master);
    tail.connect(this.wet);
    s.start(ctx.currentTime + when);
  }

  // One event in the simulation. Rate-limited, so a storm of bonds becomes a roll, not a roar.
  event(degree, gain = 0.16, pan = 0, gapS = 0.05) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCross < gapS) return;
    this.lastCross = now;
    this.pluck(degree, gain, 0, pan);
  }

  // Walks up the tune one note per call: used when something good keeps happening.
  tune() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCross < 0.17) return;
    this.lastCross = now;
    this.pluck(TUNE[this.tuneStep % TUNE.length], 0.3);
    this.tuneStep += 1;
  }

  chord() { [0, 3, 5, 7].forEach((d, i) => this.pluck(d + 3, 0.26, i * 0.09)); }

  thud() {
    if (!this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.14);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.42);
  }

  setMuted(m) {
    this.muted = m;
    if (this.player) this.player.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }
}
