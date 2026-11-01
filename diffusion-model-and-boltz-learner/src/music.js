// "Noise and Return", a piece for hang drum, kalimba and glass bowls. 66 beats a minute, in D, sixteen bars.
// It is a list of note events, each with a time and a pitch. That list is treated like any other data set in this game.
// Forward diffusion adds real Gaussian noise to times and pitches, in proportion to the sigma on screen, so the melody dissolves into
// scattered droplets and returns as the sampler runs. See place() below. The one mercy is that noisy pitches are snapped to the scale,
// because a chromatic cloud would sound like an accident, not like rain.
export const BEAT = 60 / 66;
const BARS = 16;

const melodyA = [
  [0, 78], [1.5, 81], [3, 83],
  [4.5, 81], [6, 78],
  [8, 76], [9.5, 78], [11, 74],
  [13, 71], [14, 74],
  [16, 69], [17.5, 71], [18.5, 74],
  [20, 76], [22, 78],
  [24, 76], [25, 74], [26, 71],
  [28, 69],
];
const melodyB = [
  [32, 79], [33.5, 83], [35, 81],
  [37, 79], [38, 76],
  [40, 78], [41.5, 81], [43, 86],
  [45, 83], [46.5, 81],
  [48, 83], [49, 81], [50, 78],
  [52, 79], [54, 76],
  [56, 76], [57.5, 73], [59, 76],
  [60, 74], [62, 69],
];
// Root, fifth and two colour tones for each two-bar chord.
const CHORDS = [
  [50, 57, 66, 69], [47, 54, 69, 74], [43, 50, 66, 71], [45, 52, 74, 76],
  [52, 59, 67, 74], [47, 54, 69, 74], [43, 50, 66, 71], [45, 52, 73, 76],
];

export function piece(pass) {
  const notes = [], add = (beat, midi, voice, vel) => notes.push({ beat, midi, voice, vel, pan: 0 });
  for (const [b, m] of [...melodyA, ...melodyB]) add(b, m, 'hang', 0.8 + 0.2 * Math.sin(b * 1.7));
  CHORDS.forEach((c, i) => {
    const b = i * 8;
    add(b, c[0] - 0, 'low', 0.8);
    if (i % 2 === 0) add(b + 5, c[1], 'low', 0.5);
    { // The kalimba thins out on every third pass, and has rests of its own.
      if (pass % 3 === 0 && i % 2) return;
      add(b + 0.5, c[2], 'kal', 0.7); add(b + 2.5, c[3], 'kal', 0.55); add(b + 3.5, c[2], 'kal', 0.5); add(b + 6.5, c[3], 'kal', 0.6);
    }
    if (pass % 3 === 2 && i % 2 === 1) add(b + 4, c[2] + 12, 'glass', 0.5);
  });
  notes.sort((a, b) => a.beat - b.beat);
  return { notes, beats: BARS * 4 + 8 }; // Eight beats of silence close each pass.
}

// A pentatonic with D as its home: D E F# A B. Bells keep to it however far the noise pushes them.
const SCALE = [2, 4, 6, 9, 11];
export function snap(m) {
  const r = Math.round(m), o = Math.floor(r / 12);
  let best = 0, lo = 99;
  for (let k = -1; k <= 1; k += 1) for (const s of SCALE) { const c = (o + k) * 12 + s, d = Math.abs(c - m); if (d < lo) { lo = d; best = c; } }
  return best;
}

// Standard deviations at full noise: 1.5 s in time, 11 semitones in pitch.
export const NOISE = { time: 1.5, pitch: 11 };

// Where a note lands at noise level s, from 0 to 1. xt and xp are that note's own Gaussian draws, kept fixed for the pass.
export function place(note, s, xt, xp) {
  if (s < 0.02) return { offset: 0, midi: note.midi };
  const midi = note.midi + NOISE.pitch * s * xp;
  return { offset: NOISE.time * s * xt, midi: snap(Math.max(40, Math.min(98, midi))) };
}
