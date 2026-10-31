// Plays a written piece on the audio clock, queuing a little ahead so a slow frame never makes it stumble.
// Taken from the force-field game, with one addition: the player can ask where the next pulse falls.
const AHEAD = 1.5;

export class Player {
  // score(pass) returns { notes: [{ beat, ... }], beats }. play(note, time) makes the sound.
  constructor(ctx, beat, score, play) {
    Object.assign(this, { ctx, beat, score, play, pass: 0, held: false, muted: false });
    this.begin(ctx.currentTime + 0.5);
    setInterval(() => this.pump(), 250);
    // A hidden page keeps quiet, and its clock stops with it.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    });
  }

  begin(origin) {
    this.piece = this.score(this.pass);
    this.origin = origin;
    this.next = 0;
  }

  // Stops the piece, or brings it back from the top after a pause.
  hold(on) {
    if (this.held === on) return;
    this.held = on;
    if (!on) this.begin(this.ctx.currentTime + 0.6);
  }

  // The next pulse of the piece after a time, so a sound effect can land on the music.
  nextPulse(after = this.ctx.currentTime) {
    const k = Math.ceil((after - this.origin) / this.beat);
    return this.origin + k * this.beat;
  }

  // Nothing piles up while the context is stopped, because its clock stops too.
  pump() {
    const { ctx, piece, beat } = this;
    if (this.held || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const { notes, beats } = piece;
    const at = (n) => this.origin + n.beat * beat;
    // A long stall of the timer: carry on from here, not from a moment already past.
    if (this.next < notes.length && at(notes[this.next]) < now) this.origin += now + 0.1 - at(notes[this.next]);
    while (this.next < notes.length && at(notes[this.next]) < now + AHEAD) {
      if (!this.muted) this.play(notes[this.next], at(notes[this.next]));
      this.next += 1;
    }
    if (this.next >= notes.length && this.origin + beats * beat < now + AHEAD) {
      this.pass += 1;
      this.begin(this.origin + beats * beat);
    }
  }
}
