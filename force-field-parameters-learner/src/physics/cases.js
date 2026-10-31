// Plate XI as logic, with no screen: three chains, and a verdict that needs evidence.
// Runs are not seeded. Every chain below gives the same evidence on any run, and the tests check that over many seeds.
export const CASES = [
  { name: 'trapped', p: { E: 1.4, gamma: 1, q: 1.4, k: 0, w: 0.3 }, steps: 400000, answer: 'unconverged' },
  { name: 'absent', p: { E: 1.02, gamma: 1.1, q: 0.2, k: 2.2, w: 1.1 }, steps: 400000, answer: 'absent' },
  { name: 'rare', p: { E: 1.05, gamma: 1.12, q: 0.6, k: 0.9, w: 1 }, steps: 60000, answer: 'rare' },
];

export class CaseBook {
  constructor() { this.done = 0; this.mistakes = 0; this.closed = false; this.open(0); }
  open(i) { this.c = i; this.waiting = false; this.longer = false; this.fromMisfold = false; }
  get cs() { return CASES[this.c]; }
  // Both checks must be in hand before any verdict.
  ready(finished) { return finished && this.longer && this.fromMisfold && !this.waiting && !this.closed; }
  // Returns null when the verdict cannot be taken: too early, or a second tap while the next chain is on its way.
  verdict(v, finished) {
    if (!this.ready(finished)) return null;
    if (v !== this.cs.answer) { this.mistakes++; return { right: false }; }
    this.done = Math.max(this.done, this.c + 1);
    if (this.c === CASES.length - 1) this.closed = true; else this.waiting = true;
    return { right: true, tier: this.done === CASES.length ? (this.mistakes ? 2 : 3) : this.done };
  }
  // Moves to the next chain once, however many timers fire.
  next() {
    if (!this.waiting) return false;
    this.open(this.c + 1);
    return true;
  }
}
