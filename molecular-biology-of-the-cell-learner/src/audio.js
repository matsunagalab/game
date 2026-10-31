// All sound is synthesised: an organ under everything, and a small bell for each delivery.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.step = 0; }

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
    this.wet.gain.value = 0.55;
    const verb = ctx.createConvolver();
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    verb.buffer = buf;
    this.wet.connect(verb).connect(this.master);
    // A soft organ chord in open fifths, swelling a little with time.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.organ = ctx.createGain();
    this.organ.gain.value = 0.05;
    lp.connect(this.organ);
    this.organ.connect(this.master);
    this.organ.connect(this.wet);
    [65.41, 98, 130.81, 196].forEach((f, i) => {
      for (const d of [-3, 3]) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        o.detune.value = d;
        o.connect(lp);
        o.start();
      }
    });
  }

  bell(semi, gain = 0.2, when = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { ctx } = this;
    const t = ctx.currentTime + when;
    const f = 523.25 * 2 ** (semi / 12);
    for (const [r, l, d] of [[1, 1, 1.5], [2.76, 0.35, 0.6], [5.4, 0.14, 0.25]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f * r;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * l, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.wet);
      o.start(t);
      o.stop(t + d + 0.02);
    }
  }

  delivered() { this.bell(SCALE[this.step % SCALE.length]); this.step += 1; }

  grow() { this.bell(-12, 0.09); }

  warn() { this.bell(13, 0.08); this.bell(14, 0.08, 0.09); }

  collapse() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    [0, 1, 2, 3].forEach((i) => this.bell(20 + i * 5 - i * i * 2, 0.05, i * 0.05));
  }

  fanfare() { [0, 7, 12, 16, 19, 24].forEach((s, i) => this.bell(s - 12, 0.2, i * 0.14)); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }
}
