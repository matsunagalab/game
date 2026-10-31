// All sound is synthesised. A plucked string for each barrier crossing, so rates can be heard.
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
    this.startDrone();
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

  // A low breath under everything, brighter when the sun is hot.
  startDrone() {
    const { ctx } = this;
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 440;
    bp.Q.value = 9;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0.02;
    this.breathFilter = bp;
    src.connect(bp).connect(this.breathGain).connect(this.wet);
    src.start();
    const o = ctx.createOscillator();
    o.frequency.value = BASE / 2;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    o.connect(g).connect(this.master);
    o.start();
  }

  setHeat(h) {
    if (!this.ctx) return;
    this.breathFilter.frequency.setTargetAtTime(300 + 900 * h, this.ctx.currentTime, 0.2);
    this.breathGain.gain.setTargetAtTime(0.012 + 0.04 * h, this.ctx.currentTime, 0.2);
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

  // Forward and backward crossings get different strings, so balance is audible.
  cross(to, forward) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCross < 0.055) return;
    this.lastCross = now;
    this.pluck((forward ? 6 : 3) + to, forward ? 0.2 : 0.14, 0, forward ? 0.35 : -0.35);
  }

  // Net flow plays the next note of the tune, so a driven cycle is a melody.
  tune() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCross < 0.17) return;
    this.lastCross = now;
    this.pluck(TUNE[this.tuneStep % TUNE.length], 0.34);
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
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }
}
