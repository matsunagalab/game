// All sound is synthesised: a written-out piece for harp and recorder, and a small bell for each delivery.
import { BEAT, piece } from './logic/music.js';

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const AHEAD = 1.5; // seconds of notes to queue, enough to ride out a throttled timer
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// A plucked string: partials that die away faster the higher they are.
function pluck(ctx, out, f, t, gain, ring) {
  for (const [r, l, d] of [[1, 1, 1], [2, 0.4, 0.6], [3, 0.14, 0.35], [4.01, 0.05, 0.2]]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f * r;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * l, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0003, t + ring * d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + ring * d + 0.02);
  }
}

// A soft recorder: a breathy start, and a note that sinks as it goes.
function blow(ctx, out, f, t, gain, length) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.05);
  g.gain.linearRampToValueAtTime(gain * 0.62, t + length * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0003, t + length + 0.14);
  lp.connect(g).connect(out);
  for (const [type, r, l] of [['triangle', 1, 1], ['sine', 2, 0.14]]) {
    const o = ctx.createOscillator();
    const v = ctx.createGain();
    o.type = type;
    o.frequency.value = f * r;
    v.gain.value = l;
    o.connect(v).connect(lp);
    o.start(t);
    o.stop(t + length + 0.16);
  }
}

// Plays one note of the piece. Exported so the piece can also be rendered offline.
export function playNote(ctx, out, note, t) {
  const f = hz(note.midi);
  const length = note.beats * BEAT * 0.92;
  if (note.voice === 'bass') pluck(ctx, out, f, t, 0.1, 2.2);
  else if (note.voice === 'harp') pluck(ctx, out, f, t, 0.065, 1.5);
  else if (note.voice === 'high') pluck(ctx, out, f, t, 0.06, 1.3);
  else blow(ctx, out, f, t, 0.06, length);
}

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
    this.music = ctx.createGain();
    this.music.gain.value = 1.25;
    this.music.connect(this.master);
    const room = ctx.createGain();
    room.gain.value = 0.3;
    this.music.connect(room).connect(this.wet);
    this.score = piece(0);
    this.pass = 0;
    this.next = 0;
    this.origin = ctx.currentTime + 0.5;
    setInterval(() => this.playOn(), 250);
    // A hidden page keeps quiet, and its clock stops with it.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    });
  }

  // Queues the notes due in the next moment. Nothing piles up while the context is stopped, because its clock stops too.
  playOn() {
    const { ctx } = this;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const { notes, beats } = this.score;
    const at = (n) => this.origin + n.beat * BEAT;
    // A long stall of the timer: carry on from here, not from a moment already past.
    if (this.next < notes.length && at(notes[this.next]) < now) this.origin += now + 0.1 - at(notes[this.next]);
    while (this.next < notes.length && at(notes[this.next]) < now + AHEAD) {
      if (!this.muted) playNote(ctx, this.music, notes[this.next], at(notes[this.next]));
      this.next += 1;
    }
    if (this.next >= notes.length && this.origin + beats * BEAT < now + AHEAD) {
      this.origin += beats * BEAT;
      this.pass += 1;
      this.score = piece(this.pass);
      this.next = 0;
    }
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

// Small mechanical sounds for the molecular stage.
Sound.prototype.tick = function tick(semi = 0, gain = 0.1) {
  if (!this.ctx || this.ctx.state !== 'running') return;
  const { ctx } = this;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(320 * 2 ** (semi / 12), t);
  o.frequency.exponentialRampToValueAtTime(120 * 2 ** (semi / 12), t + 0.05);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
  o.connect(g);
  g.connect(this.master);
  o.start(t);
  o.stop(t + 0.09);
};
Sound.prototype.bad = function bad() { this.tick(-14, 0.22); this.bell(1, 0.05); this.bell(2, 0.05, 0.04); };
Sound.prototype.whoosh = function whoosh(up = true) { [0, 3, 7, 12].forEach((s, i) => this.bell((up ? s : 12 - s) - 5, 0.06, i * 0.06)); };
