// The background piece: a slow dance for harp and recorder in D Dorian, 3/4 at 72 beats a minute.
// It is written out with rests, so the sound keeps moving and stops to breathe. No note lasts more than two beats.
export const BEAT = 60 / 72;
export const BAR = 3;
export const SCALE = [0, 2, 4, 5, 7, 9, 11]; // pitch classes of D Dorian: C D E F G A B

// Bass, then three notes above it, as MIDI numbers.
export const CHORDS = {
  Dm: [50, 57, 62, 65],
  C: [48, 55, 60, 64],
  G: [43, 55, 59, 62],
  Am: [45, 57, 60, 64],
  F: [41, 57, 60, 65],
};

const R = 0; // a rest

// Each bar is a list of [note, beats]. The first note of a bar is a chord tone.
export const VERSE = {
  chords: ['Dm', 'C', 'G', 'Dm', 'F', 'C', 'Dm', 'Dm'],
  tune: [
    [[69, 1.5], [67, 0.5], [65, 1]],
    [[64, 1], [67, 1], [64, 1]],
    [[62, 1.5], [64, 0.5], [67, 1]],
    [[69, 2], [R, 1]],
    [[72, 1.5], [69, 0.5], [65, 1]],
    [[67, 1], [64, 1], [67, 1]],
    [[69, 1], [65, 1], [64, 1]],
    [[62, 2], [R, 1]],
  ],
};

export const ANSWER = {
  chords: ['F', 'C', 'Dm', 'Am', 'G', 'Dm', 'Am', 'Dm'],
  tune: [
    [[72, 1], [74, 1], [72, 1]],
    [[67, 1.5], [69, 0.5], [67, 1]],
    [[69, 1], [72, 1], [74, 1]],
    [[76, 2], [R, 1]],
    [[74, 1.5], [72, 0.5], [71, 1]],
    [[69, 1], [65, 1], [69, 1]],
    [[72, 1], [69, 1], [64, 1]],
    [[62, 2], [R, 1]],
  ],
};

// One bar of harp. 'flow' is broken chords; 'thin' is bass and one note, for the quiet parts.
function harpBar(name, start, style) {
  const [bass, a, b, c] = CHORDS[name];
  const out = [{ beat: start, midi: bass, beats: 2, voice: 'bass' }];
  if (style === 'thin') {
    out.push({ beat: start + 1, midi: b, beats: 1, voice: 'harp' });
    return out;
  }
  [[1, a], [1.5, b], [2, c], [2.5, b]].forEach(([at, midi]) => out.push({ beat: start + at, midi, beats: 0.5, voice: 'harp' }));
  return out;
}

function section(part, start, { style = 'flow', voice = 'recorder', lift = 0, bars = 8, tune = true } = {}) {
  const out = [];
  for (let i = 0; i < bars; i += 1) {
    const at = start + i * BAR;
    out.push(...harpBar(part.chords[i], at, style));
    if (!tune) continue;
    let beat = at;
    for (const [midi, beats] of part.tune[i]) {
      if (midi) out.push({ beat, midi: midi + lift, beats, voice });
      beat += beats;
    }
  }
  return out;
}

// Two forms take turns, so the same tune comes round in a different dress.
const FORMS = [
  [[VERSE, { style: 'thin', tune: false, bars: 4 }], [VERSE, {}], [VERSE, { voice: 'high', lift: 12 }], [ANSWER, {}], [VERSE, { style: 'thin' }]],
  [[ANSWER, { style: 'thin', voice: 'high' }], [VERSE, {}], [ANSWER, {}], [VERSE, { voice: 'high', lift: 12, style: 'thin' }]],
];
const SILENCE = 2; // bars of nothing at all before the piece comes round

export function piece(pass) {
  const notes = [];
  let beat = 0;
  for (const [part, opt] of FORMS[pass % FORMS.length]) {
    notes.push(...section(part, beat, opt));
    beat += (opt.bars ?? 8) * BAR;
  }
  notes.sort((p, q) => p.beat - q.beat);
  return { notes, beats: beat + SILENCE * BAR };
}
