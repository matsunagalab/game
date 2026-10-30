// All sound is synthesised. Each metal plays in its own mode, and a site resolves into a chord.
const SCALES = {
  Zn: [0, 2, 4, 7, 9], Fe: [0, 3, 5, 7, 10], Cu: [0, 2, 3, 7, 9], Ni: [0, 2, 5, 7, 9], Co: [0, 1, 5, 7, 8],
  Mn: [0, 3, 5, 6, 10], Mg: [0, 2, 4, 7, 11], Ca: [0, 2, 4, 6, 9], K: [0, 4, 5, 7, 11], Mo: [0, 2, 3, 7, 10],
};
const freq = (m) => 440 * 2 ** ((m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.count = 0;
    this.root = 57;
    this.scale = SCALES.Zn;
  }

  // Must run inside a tap, or phones keep the sound blocked.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 6;
    this.master.connect(limiter).connect(ctx.destination);
    this.wet = ctx.createConvolver();
    const n = ctx.sampleRate * 3.2;
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2.6;
    }
    this.wet.buffer = buf;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.34;
    this.wet.connect(wetGain).connect(this.master);
    this.startPad();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.04);
  }

  mode(metal) {
    this.scale = SCALES[metal] ?? SCALES.Zn;
    this.count = 0;
    if (this.padNotes) this.retune();
  }

  startPad() {
    const { ctx } = this;
    const out = ctx.createGain();
    out.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    out.connect(filter);
    filter.connect(this.master);
    filter.connect(this.wet);
    this.padNotes = [0, 7, 12, 16].map((st, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = freq(this.root - 24 + st);
      o.detune.value = (i - 1.5) * 4;
      o.connect(out);
      o.start();
      return { o, st };
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 260;
    lfo.connect(depth).connect(filter.frequency);
    lfo.start();
  }

  retune() {
    const t = this.ctx.currentTime;
    const third = this.scale[1] > 2 ? this.scale[1] : this.scale[2];
    const notes = [0, 7, 12, 12 + third];
    this.padNotes.forEach((p, i) => p.o.frequency.setTargetAtTime(freq(this.root - 24 + notes[i]), t, 0.8));
  }

  // A soft bell: two sines in an inharmonic ratio.
  bell(midi, t, gain = 0.2, decay = 1.5) {
    const { ctx } = this;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    const o = ctx.createOscillator();
    o.frequency.value = freq(midi);
    const m = ctx.createOscillator();
    m.frequency.value = freq(midi) * 3.51;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq(midi) * 1.1, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 0.5);
    m.connect(mg).connect(o.frequency);
    o.connect(env);
    env.connect(this.master);
    env.connect(this.wet);
    o.start(t);
    m.start(t);
    o.stop(t + decay + 0.1);
    m.stop(t + decay + 0.1);
  }

  degree(n) {
    const s = this.scale;
    return this.root + 12 + s[n % s.length] + 12 * Math.floor(n / s.length);
  }

  // Each right answer climbs the scale of this metal.
  good() {
    if (!this.ctx) return;
    this.bell(this.degree(this.count++), this.ctx.currentTime, 0.2);
  }

  lock() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 2, 4].forEach((d, i) => this.bell(this.degree(d + this.count), t + i * 0.08, 0.13));
  }

  bad() {
    if (!this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(82, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  tick() {
    if (!this.ctx) return;
    this.bell(this.root + 31, this.ctx.currentTime, 0.04, 0.25);
  }

  whoosh() {
    if (!this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const n = ctx.sampleRate * 0.6;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2800, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
    s.connect(f).connect(g);
    g.connect(this.master);
    g.connect(this.wet);
    s.start(t);
  }

  // The moment a metal seats: a low swell and a full chord in the mode of that metal.
  ignite(big = true) {
    if (!this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.3);
    const notes = big ? [0, 2, 3, 4, 5, 7] : [0, 2, 4];
    notes.forEach((d, i) => this.bell(this.degree(d), t + i * 0.055, big ? 0.16 : 0.13, big ? 3 : 1.8));
  }
}
