// Interlocking kalimba in 12/8 over a soft bell and shaker, at 76 dotted beats a minute, in D major.
// The game's plucks use the D major pentatonic, so they join in whenever they sound.
export const BEAT = 60 / (76 * 3); // one eighth note
export const BAR = 12;

export const CHORDS = {
  D: { tones: [50, 57, 62, 66, 69] },
  Bm: { tones: [47, 54, 62, 66, 71] },
  G: { tones: [43, 55, 62, 67, 71] },
  A: { tones: [45, 57, 61, 64, 69] },
};

const R = 0;
export const CYCLE = ['D', 'Bm', 'G', 'A'];

// In eighth notes. Each line is one bar over CYCLE, repeating.
export const TUNE = [
  [[74, 2], [76, 1], [78, 3], [R, 1], [76, 1], [74, 1], [71, 1], [74, 2]],
  [[71, 2], [74, 1], [78, 3], [R, 1], [76, 1], [74, 1], [71, 1], [69, 2]],
  [[71, 2], [74, 1], [79, 3], [R, 1], [78, 1], [76, 1], [74, 1], [71, 2]],
  [[69, 2], [73, 1], [76, 3], [R, 3], [69, 1], [71, 1], [73, 1]],
  [[74, 2], [78, 1], [81, 3], [R, 1], [78, 1], [76, 1], [74, 1], [78, 2]],
  [[78, 2], [76, 1], [74, 3], [R, 1], [74, 1], [71, 1], [69, 1], [71, 2]],
  [[71, 2], [74, 1], [79, 2], [78, 1], [76, 2], [74, 1], [71, 2], [R, 1]],
  [[69, 2], [73, 1], [76, 2], [73, 1], [R, 6]],
];

const BELL = [0, 2, 4, 5, 7, 9, 11]; // the twelve-beat bell pattern of West African drumming
const STEPS = [[0, 0], [3, 3], [5, 2], [6, 1], [8, 4], [9, 3], [11, 2]]; // eighth note, then which chord tone

function groove(at, chord, { bell = true, shaker = true, tines = true } = {}) {
  const out = [];
  const { tones } = CHORDS[chord];
  if (bell) for (const b of BELL) out.push({ beat: at + b, kind: 'bell', beats: 1 });
  if (shaker) for (let i = 0; i < 12; i += 1) out.push({ beat: at + i, kind: 'shaker', beats: 1, soft: i % 3 !== 0 });
  if (tines) for (const [b, k] of STEPS) out.push({ beat: at + b, kind: 'tine', midi: tones[k], beats: 2, low: k === 0 });
  return out;
}

function tune(at, bar, lift = 0) {
  const out = [];
  let beat = at;
  for (const [midi, beats] of TUNE[bar]) {
    if (midi) out.push({ beat, kind: 'lead', midi: midi + lift, beats });
    beat += beats;
  }
  return out;
}

// Sections: [bars, what plays].
const FORMS = [
  [[2, { tines: false }], [4, {}], [8, { lead: true }], [4, { bell: false }], [8, { lead: true, lift: 12 }], [2, { tines: false, shaker: false }]],
  [[2, { bell: false, tines: false }], [8, { lead: true, shaker: false }], [4, {}], [8, { lead: true }], [2, { tines: false, shaker: false }]],
];
const TAIL = 1;

export function piece(pass) {
  const notes = [];
  let bar = 0;
  for (const [count, opt] of FORMS[pass % FORMS.length]) {
    for (let i = 0; i < count; i += 1) {
      const at = bar * BAR;
      notes.push(...groove(at, CYCLE[bar % 4], opt));
      if (opt.lead) notes.push(...tune(at, (bar - 0) % 8, opt.lift ?? 0));
      bar += 1;
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  return { notes, beats: bar * BAR + TAIL * BAR };
}
