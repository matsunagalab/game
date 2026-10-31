// All sound is synthesised. Every pitch from a molecule is its real wavenumber × 0.25 Hz,
// which keeps frequency ratios exact and puts a C–H stretch at 734 Hz: 37 octaves below the real 88 THz.
export const CM_TO_HZ = 0.25;

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.voices = []; this.bass = 0; }

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.connect(this.master);
    const rev = ctx.createConvolver();
    rev.buffer = this.impulse(3.2, 2.6);
    this.wet.connect(rev);
    const rg = ctx.createGain(); rg.gain.value = 0.55;
    rev.connect(rg); rg.connect(this.master);
    this.hum = ctx.createGain(); this.hum.gain.value = 0.0;
    this.hum.connect(this.dry); this.hum.connect(this.wet);
    this.startDrone();
  }

  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }

  setMuted(m) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  get now() { return this.ctx?.currentTime ?? 0; }

  // A very quiet bed built from the C–C stretch (1104 cm⁻¹) and its neighbours. Tuned chapters add voices.
  startDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0.05;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900;
    this.droneGain.connect(filter); filter.connect(this.wet); filter.connect(this.dry);
    this.addVoice(1104 * CM_TO_HZ / 2, 0.8);
    this.addVoice(1104 * CM_TO_HZ / 4, 1);
  }

  // One more voice for each finished term, so the music grows with the force field.
  setProgress(n) {
    if (!this.ctx) return;
    const parts = [734 / 2, 399 / 2, 165, 552 / 2, 464];
    while ((this.grown ?? 0) < Math.min(n, parts.length)) { this.addVoice(parts[this.grown ?? 0], 0.42); this.grown = (this.grown ?? 0) + 1; }
  }

  addVoice(hz, gain = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = hz; g.gain.value = 0;
    lfo.frequency.value = 0.05 + Math.random() * 0.08; lg.gain.value = gain * 0.35;
    lfo.connect(lg); lg.connect(g.gain);
    g.gain.setTargetAtTime(gain * 0.65, ctx.currentTime, 2.5);
    o.connect(g); g.connect(this.droneGain);
    o.start(); lfo.start();
    this.voices.push(hz);
  }

  // A struck glass bar: the fundamental plus the two inharmonic partials of a free bar.
  pluck(hz, amp = 0.5, dur = 2.4) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [mul, a, d] of [[1, 1, 1], [2.756, 0.28, 0.35], [5.404, 0.1, 0.16]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz * mul;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * a * 0.5, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0004, t + dur * d);
      o.connect(g); g.connect(this.dry); g.connect(this.wet);
      o.start(t); o.stop(t + dur * d + 0.05);
    }
  }

  // Two steady tones. When they are close you hear the beating slow down, exactly as when tuning a string.
  startBeat(refHz, myHz) {
    if (!this.ctx || this.beat) return;
    const ctx = this.ctx;
    const mk = hz => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz; g.gain.value = 0.11;
      o.connect(g); g.connect(this.hum); o.start();
      return o;
    };
    this.beat = { ref: mk(refHz), my: mk(myHz) };
    this.hum.gain.setTargetAtTime(1, ctx.currentTime, 0.15);
  }
  setBeat(refHz, myHz) {
    if (!this.beat) return;
    this.beat.ref.frequency.value = refHz;
    this.beat.my.frequency.setTargetAtTime(myHz, this.ctx.currentTime, 0.02);
    this.hum.gain.setTargetAtTime(1, this.ctx.currentTime, 0.15);
    this.beatIdle = 0;
  }
  quietBeat(level = 0.12) { if (this.beat) this.hum.gain.setTargetAtTime(level, this.ctx.currentTime, 0.7); }
  stopBeat() {
    if (!this.beat) return;
    const b = this.beat; this.beat = null;
    this.hum.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => { b.ref.stop(); b.my.stop(); }, 500);
  }

  // Chord of up to three sustained tones, for water.
  chord(hzs, amp = 0.16, dur = 1.6) {
    if (!this.ctx) return;
    hzs.forEach((h, i) => setTimeout(() => this.pluck(h, amp + 0.1, dur + 1), i * 70));
  }

  // The torsion profile played as a waveform: its cosine series is the timbre.
  startOrgan(hz = 110) {
    if (!this.ctx || this.organ) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.frequency.value = hz; g.gain.value = 0; f.type = 'lowpass'; f.frequency.value = 1800;
    o.connect(f); f.connect(g); g.connect(this.dry); g.connect(this.wet); o.start();
    this.organ = { o, g };
  }
  setOrgan(vs, gamma) {
    if (!this.organ) return;
    const n = vs.length + 1, re = new Float32Array(n), im = new Float32Array(n);
    vs.forEach((v, i) => { re[i + 1] = 0.5 * v * Math.cos(gamma[i]); im[i + 1] = 0.5 * v * Math.sin(gamma[i]); });
    if (vs.every(v => Math.abs(v) < 1e-3)) re[1] = 0.01;
    this.organ.o.setPeriodicWave(this.ctx.createPeriodicWave(re, im, { disableNormalization: false }));
    this.organ.g.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.05);
    clearTimeout(this.organTimer);
    this.organTimer = setTimeout(() => this.organ?.g.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.5), 900);
  }
  stopOrgan() { if (this.organ) { const o = this.organ; this.organ = null; o.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); setTimeout(() => o.o.stop(), 400); } }

  tick(pitch = 1) {
    if (!this.ctx) return;
    const t = this.now;
    if (t - (this.lastTick || 0) < 0.03) return;
    this.lastTick = t;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 1900 * pitch;
    g.gain.setValueAtTime(0.022, t); g.gain.exponentialRampToValueAtTime(0.0002, t + 0.03);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.04);
  }

  // Short high ping for a hydrogen bond forming. Notes come from the player's own tuned chord.
  ping(i = 0, amp = 0.09) {
    const scale = [1104, 1337, 2208, 2936, 3300, 3709];
    this.pluck(scale[i % scale.length] * CM_TO_HZ * 2, amp, 1.2);
  }

  accept(tier = 3) {
    if (!this.ctx) return;
    const notes = [1104, 1337, 2208, 2936, 3709].map(v => v * CM_TO_HZ);
    notes.slice(0, 2 + tier).forEach((h, i) => setTimeout(() => this.pluck(h, 0.34, 3.2), i * 110));
  }

  // A short rising chord when a fit snaps into place: one more note for each goal.
  snap(tier = 1) {
    if (!this.ctx) return;
    [1104, 1337, 1656, 2208].slice(0, tier + 1).forEach((v, i) => setTimeout(() => this.pluck(v * CM_TO_HZ, 0.22, 1.6), i * 55));
  }

  stamp() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.14);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.25);
    this.noise(0.05, 0.14, 2400);
  }

  noise(dur, amp, freq) {
    if (!this.ctx) return;
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = amp;
    s.connect(f); f.connect(g); g.connect(this.dry); g.connect(this.wet); s.start();
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.7);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g); g.connect(this.dry); g.connect(this.wet); o.start(t); o.stop(t + 1);
    this.noise(0.9, 0.5, 3500);
  }

  // Shimmer that follows how much is happening in a droplet.
  startWash() {
    if (!this.ctx || this.washNode) return;
    const ctx = this.ctx, n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; s.loop = true; f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8; g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.wet); s.start();
    this.washNode = { s, f, g };
  }
  setWash(level, hz) {
    if (!this.washNode) return;
    this.washNode.g.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.2);
    this.washNode.f.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.3);
  }
  stopWash() { if (this.washNode) { const w = this.washNode; this.washNode = null; w.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); setTimeout(() => w.s.stop(), 400); } }

  stopAll() { this.stopBeat(); this.stopOrgan(); this.stopWash(); }
}
