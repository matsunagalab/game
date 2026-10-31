// All sound is synthesised, so the game works offline with no audio files.
import {BEAT, piece} from './music.js';
import {Player} from './player.js';

const SCALE = [0, 2, 4, 7, 9];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

export class Sound {
  constructor() { this.muted = false; this.ctx = null; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = this.ctx = new AudioCtx();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const reverb = ctx.createConvolver();
    const length = ctx.sampleRate * 2.4;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    reverb.buffer = impulse;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.3;
    this.wet.connect(reverb).connect(this.master);
    this.grit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const grit = this.grit.getChannelData(0);
    for (let i = 0; i < grit.length; i++) grit[i] = Math.random() * 2 - 1;
    this.music = ctx.createGain();
    this.music.connect(this.master);
    const room = ctx.createGain();
    room.gain.value = 0.25;
    this.music.connect(room).connect(this.wet);
    this.player = new Player(ctx, BEAT, piece, (n, t) => this.band(n, t));
    this.player.muted = this.muted;
  }

  // A metal tine: a clear tone with a quick bright buzz at the start.
  tine(f, t, level, ring) {
    const ctx = this.ctx;
    for (const [r, l, d] of [[1, 1, 1], [3.01, 0.22, 0.2], [6.2, 0.09, 0.07]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f * r;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level * l, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0003, t + ring * d);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + ring * d + 0.02);
    }
  }

  band(n, t) {
    const {ctx} = this;
    if (n.kind === 'lead') return this.tine(hz(n.midi), t, 0.085, 1.1);
    if (n.kind === 'tine') return this.tine(hz(n.midi), t, n.low ? 0.07 : 0.042, n.low ? 1 : 0.7);
    const src = ctx.createBufferSource();
    src.buffer = this.grit;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    if (n.kind === 'bell') {
      f.type = 'bandpass';
      f.frequency.value = 1700;
      f.Q.value = 9;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0003, t + 0.06);
    } else {
      f.type = 'highpass';
      f.frequency.value = 6000;
      g.gain.setValueAtTime(n.soft ? 0.007 : 0.016, t);
      g.gain.exponentialRampToValueAtTime(0.0003, t + 0.05);
    }
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.8);
    src.stop(t + 0.08);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.player) this.player.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  out(node) { node.connect(this.master); node.connect(this.wet); }

  tone(freq, {type = 'sine', attack = 0.004, decay = 0.5, level = 0.25, delay = 0, bend = 0} = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (bend) osc.frequency.exponentialRampToValueAtTime(freq * bend, t + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g);
    this.out(g);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  noise({duration = 0.6, from = 400, to = 2400, level = 0.12, delay = 0} = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + duration * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g);
    this.out(g);
    src.start(t);
  }

  // A kalimba-like pluck on a pentatonic scale, climbing as the score climbs.
  pluck(step, level = 0.24, delay = 0) {
    const octave = Math.floor(step / SCALE.length);
    const semis = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length] + 12 * octave;
    const freq = 293.66 * Math.pow(2, semis / 12);
    this.tone(freq, {decay: 0.9, level, delay});
    this.tone(freq * 3.01, {decay: 0.18, level: level * 0.3, delay});
    this.tone(freq * 6.2, {decay: 0.06, level: level * 0.14, delay});
  }

  place() { this.tone(520, {type: 'triangle', decay: 0.09, level: 0.14, bend: 0.6}); }
  pick() { this.tone(340, {type: 'triangle', decay: 0.07, level: 0.1, bend: 1.5}); }
  bad() { this.tone(138.59, {type: 'triangle', decay: 0.34, level: 0.26, bend: 0.72}); this.tone(146.83, {type: 'triangle', decay: 0.3, level: 0.16, bend: 0.72}); }
  cost() { this.tone(196, {decay: 0.55, level: 0.2, bend: 0.75}); }
  water() { for (let i = 0; i < 8; i++) this.tone(700 + Math.random() * 900, {decay: 0.09, level: 0.05, delay: i * 0.05 + Math.random() * 0.03, bend: 1.8}); this.noise({duration: 0.9}); }
  thunk() { this.tone(82.41, {decay: 0.5, level: 0.42, bend: 0.5}); this.noise({duration: 0.18, from: 900, to: 200, level: 0.1}); }
  win() { [0, 2, 4, 5, 7, 9].forEach((s, i) => this.pluck(s + 3, 0.2, i * 0.08)); }
  lose() { [4, 3, 1].forEach((s, i) => this.pluck(s, 0.16, i * 0.16)); }
  ring() { [5, 7, 10].forEach((s, i) => this.pluck(s, 0.22, i * 0.05)); }
}
