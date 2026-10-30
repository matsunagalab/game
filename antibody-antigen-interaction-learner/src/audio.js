// All sound is synthesised, so the game works offline with no audio files.
const SCALE = [0, 2, 4, 7, 9];

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
  }

  setMuted(muted) {
    this.muted = muted;
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
