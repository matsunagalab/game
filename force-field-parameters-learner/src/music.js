// A chaconne for harpsichord, 3/4 at 84 beats a minute: a four-bar ground under a canon.
// The key is C sharp minor because the game's molecular pitches (wavenumber × 0.25 Hz) sit close to it:
// the C–C stretch at 276 Hz is a C sharp, and the C–H stretch at 734 Hz is an F sharp.
// Each finished term of the energy brings in one more voice of the canon, so the music grows with the force field.
export const BEAT = 60 / 84;
export const BAR = 3;
export const SCALE = [1, 3, 4, 6, 8, 9, 11, 0, 5]; // C sharp minor, with B sharp as the leading note and E sharp in the last chord

// The tones of each bar's chord, as pitch classes.
export const HARMONY = [[1, 4, 8], [8, 11, 3], [6, 9, 1], [8, 0, 3]];

const R = 0;
export const GROUND = [
  [[49, 1], [56, 1], [61, 1]],
  [[47, 1], [56, 1], [59, 1]],
  [[45, 1], [54, 1], [57, 1]],
  [[44, 1], [51, 1], [56, 1]],
];

// Four-bar strains. Any of them fits the ground, so they can be stacked at any multiple of four bars.
export const STRAINS = [
  [[[73, 2], [71, 1]], [[71, 2], [69, 1]], [[69, 2], [68, 1]], [[68, 2], [72, 1]]],
  [[[73, 0.5], [76, 0.5], [73, 0.5], [68, 0.5], [64, 0.5], [68, 0.5]],
    [[71, 0.5], [75, 0.5], [71, 0.5], [68, 0.5], [63, 0.5], [68, 0.5]],
    [[69, 0.5], [73, 0.5], [69, 0.5], [66, 0.5], [61, 0.5], [66, 0.5]],
    [[68, 0.5], [72, 0.5], [75, 0.5], [72, 0.5], [68, 0.5], [63, 0.5]]],
  [[[76, 1.5], [75, 0.5], [76, 1]], [[75, 1.5], [73, 0.5], [75, 1]], [[73, 1.5], [71, 0.5], [73, 1]], [[72, 1.5], [73, 0.5], [75, 1]]],
  [[[R, 0.5], [64, 0.5], [68, 0.5], [73, 0.5], [76, 1]],
    [[R, 0.5], [63, 0.5], [68, 0.5], [71, 0.5], [75, 1]],
    [[R, 0.5], [61, 0.5], [66, 0.5], [69, 0.5], [73, 1]],
    [[R, 0.5], [60, 0.5], [63, 0.5], [68, 0.5], [72, 1]]],
];

const ORDERS = [[0, 1, 2, 3], [2, 0, 3, 1], [1, 3, 0, 2]];
const LIFT = [0, 12, -12, 0];
const PAN = [0.15, -0.3, 0.3, -0.1];
const FINAL = [[61, 0], [65, 0.25], [68, 0.5], [73, 0.75], [77, 1]]; // C sharp major, spread by hand

export function piece(pass, voices = 1) {
  const count = Math.min(4, Math.max(1, voices));
  const order = ORDERS[pass % ORDERS.length];
  const strains = order.length * 4; // bars in the subject
  const bars = 4 + strains + (count - 1) * 4;
  const notes = [];
  for (let bar = 0; bar < bars; bar += 1) {
    let beat = bar * BAR;
    for (const [midi, beats] of GROUND[bar % 4]) {
      notes.push({ beat, midi, beats, voice: 'ground', pan: 0 });
      beat += beats;
    }
  }
  for (let v = 0; v < count; v += 1) {
    const enter = (4 + v * 4) * BAR;
    order.forEach((s, k) => STRAINS[s].forEach((bar, b) => {
      let beat = enter + (k * 4 + b) * BAR;
      for (const [midi, beats] of bar) {
        if (midi) notes.push({ beat, midi: midi + LIFT[v], beats, voice: 'line', pan: PAN[v] });
        beat += beats;
      }
    }));
  }
  const end = bars * BAR;
  FINAL.forEach(([midi, at]) => notes.push({ beat: end + at, midi, beats: 2, voice: 'line', pan: 0 }));
  notes.push({ beat: end, midi: 37, beats: 2, voice: 'ground', pan: 0 });
  notes.sort((a, b) => a.beat - b.beat);
  return { notes, beats: end + 2 * BAR + 2 * BAR };
}
