// All sound is synthesised, and every source decays on its own. There is no sustained tone anywhere in this game.
import { BEAT, OPENINGS, PHRASE, piece, ROOTS } from './music.js';
import { Player } from './player.js';

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.opening = 0.45; this.lastNote = 0; }

  // Must run inside a user gesture for iOS. Safe to call any number of times.
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3.5;
    this.master.connect(comp); comp.connect(ctx.destination);
    // iOS only opens the audio path once something has played inside a user gesture.
    const quiet = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
    src.buffer = quiet; src.connect(this.master); src.start(0);
    ctx.resume().catch(() => {});
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.connect(this.master);
    const rev = ctx.createConvolver();
    rev.buffer = this.room(1.8, 3.6);
    const rg = ctx.createGain(); rg.gain.value = 0.3;
    this.wet.connect(rev); rev.connect(rg); rg.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.62;
    this.music.connect(this.dry);
    const send = ctx.createGain(); send.gain.value = 0.34;
    this.music.connect(send); send.connect(this.wet);
    this.noiseBuf = this.noise(0.5);
    this.player = new Player(ctx, BEAT, (pass) => piece(pass), (n, t) => this.note(n, t));
    this.player.muted = this.muted;
  }

  room(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay * (i < 300 ? i / 300 : 1);
    }
    return b;
  }

  noise(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < n; i += 1) { v = 0.82 * v + 0.18 * (Math.random() * 2 - 1); d[i] = v * 2.2; }
    return b;
  }

  setMuted(m) {
    this.muted = m;
    if (this.player) this.player.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  // The measured number, as a fraction from 0 (cluster) to 1 (consonance).
  setOpening(x) { this.opening = Math.max(0, Math.min(1, x)); }

  pitch(degree, root, octave = 0) {
    const [base, kind] = ROOTS[root % ROOTS.length], table = OPENINGS[kind];
    const row = table[Math.min(table.length - 1, Math.round(this.opening * (table.length - 1)))];
    const d = Math.max(0, Math.min(row.length - 1, degree));
    return base + row[d] + octave + 12;
  }

  note(n, t) {
    if (n.voice === 'box') this.tine(hz(this.pitch(n.degree, n.root, n.octave)), t, n.soft ? 0.05 : 0.075, n.pan);
    else if (n.voice === 'piano') this.felt(hz(this.pitch(n.degree, n.root, n.octave)), t, 0.14, n.pan);
    else this.felt(hz(this.pitch(n.degree, n.root, n.octave)), t, 0.16, 0, 3.4);
  }

  voice(type, f, t, level, attack, ring, pan, out, detune = 0) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0002, t + attack + ring);
    o.connect(g);
    const p = ctx.createStereoPanner?.();
    if (p) { p.pan.value = pan; g.connect(p); p.connect(out); } else g.connect(out);
    o.start(t); o.stop(t + attack + ring + 0.03);
  }

  // A music-box tine: a clean fundamental and the strong, quick high partials of a plucked steel tongue.
  tine(f, t, amp, pan = 0) {
    this.voice('sine', f, t, amp, 0.002, 1.5, pan, this.music);
    this.voice('sine', f * 3.01, t, amp * 0.28, 0.001, 0.32, pan, this.music);
    this.voice('sine', f * 5.42, t, amp * 0.12, 0.001, 0.12, pan, this.music);
  }

  // A felt piano note: a soft attack, few partials through a closing filter, and the small thump of the hammer.
  felt(f, t, amp, pan = 0, ring = 2.6) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(Math.min(3000, f * 6), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(260, f * 1.6), t + 1);
    lp.connect(this.music);
    this.voice('triangle', f, t, amp, 0.012, ring, pan, lp);
    this.voice('sine', f * 2.001, t, amp * 0.3, 0.008, ring * 0.5, pan, lp, 3);
    this.voice('triangle', f, t, amp * 0.5, 0.012, ring * 0.8, pan, lp, -4);
    const s = ctx.createBufferSource(), g = ctx.createGain(), b = ctx.createBiquadFilter();
    s.buffer = this.noiseBuf; b.type = 'lowpass'; b.frequency.value = 500;
    g.gain.setValueAtTime(amp * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0002, t + 0.05);
    s.connect(b); b.connect(g); g.connect(this.music);
    s.start(t, Math.random() * 0.4, 0.07);
  }

  burst({ freq = 3000, q = 0.7, level = 0.1, dur = 0.12, type = 'bandpass', out = null } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0002, t + dur);
    s.connect(f); f.connect(g); g.connect(out ?? this.dry);
    s.start(t, Math.random() * 0.3, dur + 0.03);
  }

  // Paper. A rustle is many tiny dry bursts, a fold is a soft low press followed by a crisp edge.
  rustle(n = 5, level = 0.05) {
    if (!this.ctx) return;
    for (let i = 0; i < n; i += 1) setTimeout(() => this.burst({ freq: 2400 + Math.random() * 4200, q: 1.1, level: level * (0.5 + Math.random()), dur: 0.05 + Math.random() * 0.08 }), i * (28 + Math.random() * 40));
  }

  fold() {
    if (!this.ctx) return;
    this.burst({ freq: 240, q: 0.5, level: 0.22, dur: 0.16, type: 'lowpass' });
    setTimeout(() => this.burst({ freq: 4600, q: 1.5, level: 0.09, dur: 0.07 }), 46);
  }

  tap() { this.burst({ freq: 1800, q: 1, level: 0.06, dur: 0.04 }); }

  // One note under a finger: always a tone of the current chord.
  pick(step = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastNote < 0.05) return;
    this.lastNote = now;
    const root = this.rootNow();
    this.tine(hz(this.pitch(step % 6, root, 12)), now + 0.005, 0.05, 0);
  }

  rootNow() {
    const p = this.player;
    if (!p) return 0;
    const e = Math.max(0, (this.ctx.currentTime - p.origin) / BEAT);
    return Math.floor(e / 32) % ROOTS.length;
  }

  // One structure block or recycling pass: a short written phrase, in the harmony the measured number has reached.
  phrase(length = 5) {
    if (!this.ctx || this.muted) return;
    const root = this.rootNow(), t = this.ctx.currentTime + 0.03;
    for (let i = 0; i < length; i += 1) {
      const d = PHRASE[i % PHRASE.length];
      this.felt(hz(this.pitch(d, root, 12)), t + i * BEAT * 0.5, 0.12, (i - 2) * 0.1, 2.2);
      if (i % 2 === 0) this.tine(hz(this.pitch(d, root, 24)), t + i * BEAT * 0.5 + 0.02, 0.04, 0);
    }
  }

  good(level = 1) {
    if (!this.ctx || this.muted) return;
    const root = this.rootNow(), t = this.ctx.currentTime + 0.02;
    for (let i = 0; i <= level + 1; i += 1) this.tine(hz(this.pitch(i + 1, root, 24)), t + i * 0.1, 0.07, (i - 1) * 0.15);
  }

  soft() {
    if (!this.ctx || this.muted) return;
    this.felt(hz(this.pitch(0, this.rootNow(), 0)), this.ctx.currentTime + 0.02, 0.12, 0, 1.2);
  }
}
