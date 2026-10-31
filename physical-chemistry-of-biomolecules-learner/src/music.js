// A slow piece for koto and shakuhachi in the In scale on D, 4/4 at 58 beats a minute.
// The silences are part of it: ma. The koto strings that sound for hydrogen bonds use the same scale, so they join in.
export const BEAT = 60 / 58;
export const BAR = 4;
export const SCALE = [2, 3, 7, 9, 10]; // D, E flat, G, A, B flat

const R = 0;
// A phrase is a list of [note, beats, ornament]. 'push' bends the string up into the note, as a koto player does by pressing behind the bridge.
const OPEN = [
  [[69, 1], [70, 0.5], [69, 0.5], [67, 2]],
  [[63, 1, 'push'], [62, 1], [R, 2]],
];
const CLIMB = [
  [[62, 0.5], [63, 0.5], [67, 1], [69, 2]],
  [[70, 1, 'push'], [69, 0.5], [67, 0.5], [69, 1], [R, 1]],
];
const HIGH = [
  [[74, 1.5], [75, 0.5, 'push'], [74, 1], [70, 1]],
  [[69, 2], [R, 2]],
];
const HOME = [
  [[67, 1], [69, 1], [70, 0.5], [69, 0.5], [67, 1]],
  [[63, 1.5, 'push'], [62, 2.5]],
];
// The flute answers across the silence.
const CALL = [[[R, 1], [69, 2], [70, 1]], [[69, 2.5], [R, 1.5]]];
const REPLY = [[[R, 2], [74, 1.5], [75, 0.5]], [[74, 1], [70, 2], [R, 1]]];
const FALL = [[[81, 2], [79, 1], [75, 1]], [[74, 3], [R, 1]]];

const BASS = [[50, 0], [57, 2]]; // low strings: D, then A, under each bar

function phrase(lines, start, voice) {
  const out = [];
  lines.forEach((bar, i) => {
    let beat = start + i * BAR;
    for (const [midi, beats, how] of bar) {
      if (midi) out.push({ beat, midi, beats, voice, push: how === 'push' });
      beat += beats;
    }
  });
  return out;
}

// A sweep of the hand across the strings.
function sweep(start, up = true) {
  const run = [50, 51, 55, 57, 58, 62, 63, 67, 69, 70, 74];
  return (up ? run : [...run].reverse()).map((midi, i) => ({ beat: start + i * 0.09, midi, beats: 0.25, voice: 'sweep' }));
}

function low(start, bars) {
  const out = [];
  for (let i = 0; i < bars; i += 1) for (const [midi, at] of BASS) out.push({ beat: start + i * BAR + at, midi, beats: 2, voice: 'low' });
  return out;
}

const SCORE = [
  [sweep, []],
  [OPEN, 'koto'], [CLIMB, 'koto'], [null, 1],
  [CALL, 'flute'], [null, 1],
  [HIGH, 'koto'], [HOME, 'koto'], [null, 2],
  [FALL, 'flute'], [REPLY, 'flute'], [null, 1],
  [CLIMB, 'koto'], [HOME, 'koto'], [null, 3],
];

export function piece(pass) {
  const notes = [];
  let bar = 0;
  const lift = pass % 2 ? 12 : 0; // every other time, the koto plays an octave up
  for (const [what, how] of SCORE) {
    if (what === sweep) { notes.push(...sweep(0)); continue; }
    if (what === null) { bar += how; continue; }
    const made = phrase(what, bar * BAR, how);
    for (const n of made) { if (how === 'koto') n.midi += lift; notes.push(n); }
    if (how === 'koto') notes.push(...low(bar * BAR, what.length));
    bar += what.length;
  }
  notes.push(...sweep((bar - 2) * BAR, false));
  notes.sort((a, b) => a.beat - b.beat);
  return { notes, beats: bar * BAR };
}
