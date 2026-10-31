// A small bossa for vibraphone, keys, double bass and rim click, 4/4 at 104 beats a minute.
// The tune lives in C major around D, so the game's D minor pentatonic chimes always fit over it.
export const BEAT = 60 / 104;
export const BAR = 4;

// Bass root and fifth, then the keys' voicing.
export const CHORDS = {
  Dm9: { root: 50, fifth: 45, keys: [53, 57, 60, 64] },
  G13: { root: 43, fifth: 50, keys: [53, 59, 64] },
  C9: { root: 48, fifth: 43, keys: [52, 55, 59, 62] },
  Am9: { root: 45, fifth: 52, keys: [55, 59, 60, 64] },
  E7: { root: 52, fifth: 47, keys: [56, 62, 64] },
  F9: { root: 41, fifth: 48, keys: [55, 57, 60, 64] },
  Em7: { root: 52, fifth: 47, keys: [55, 59, 62] },
  Bm7b5: { root: 47, fifth: 53, keys: [57, 62, 65] },
};

const R = 0;
export const VERSE = {
  chords: ['Dm9', 'G13', 'C9', 'Am9', 'Dm9', 'G13', 'C9', 'E7'],
  tune: [
    [[R, 0.5], [69, 0.5], [72, 0.5], [76, 1], [74, 0.5], [72, 1]],
    [[R, 0.5], [71, 0.5], [74, 0.5], [76, 1], [74, 0.5], [71, 1]],
    [[72, 1.5], [71, 0.5], [67, 2]],
    [[R, 1], [69, 0.5], [67, 0.5], [64, 1], [R, 1]],
    [[R, 0.5], [69, 0.5], [72, 0.5], [77, 1], [76, 0.5], [74, 1]],
    [[R, 0.5], [71, 0.5], [74, 0.5], [79, 1], [77, 0.5], [74, 1]],
    [[76, 1.5], [74, 0.5], [72, 2]],
    [[R, 1], [68, 0.5], [71, 0.5], [74, 1], [R, 1]],
  ],
};
export const BRIDGE = {
  chords: ['F9', 'Em7', 'Dm9', 'C9', 'Bm7b5', 'E7', 'Am9', 'G13'],
  tune: [
    [[72, 0.5], [76, 0.5], [79, 1.5], [77, 0.5], [76, 1]],
    [[74, 1.5], [71, 0.5], [67, 2]],
    [[69, 0.5], [72, 0.5], [76, 1.5], [74, 0.5], [72, 1]],
    [[71, 1.5], [67, 0.5], [64, 2]],
    [[R, 0.5], [69, 0.5], [74, 0.5], [77, 1], [74, 0.5], [69, 1]],
    [[R, 0.5], [68, 0.5], [71, 0.5], [76, 1], [74, 0.5], [71, 1]],
    [[72, 1.5], [71, 0.5], [69, 1], [67, 1]],
    [[R, 2], [71, 0.5], [74, 0.5], [77, 1]],
  ],
};

const CLAVE = [0, 1.5, 3, 5, 6.5]; // the bossa clave over two bars, in beats

function band(chord, at, { keys = true, shaker = true } = {}) {
  const c = CHORDS[chord];
  const out = [
    { beat: at, kind: 'bass', midi: c.root, beats: 1.5 },
    { beat: at + 2, kind: 'bass', midi: c.fifth, beats: 1 },
    { beat: at + 3.5, kind: 'bass', midi: c.fifth, beats: 0.5, soft: true },
  ];
  if (keys) for (const off of [0, 1.5, 3]) for (const midi of c.keys) out.push({ beat: at + off, kind: 'keys', midi, beats: 0.5 });
  if (shaker) for (let i = 0; i < 8; i += 1) out.push({ beat: at + i / 2, kind: 'shaker', beats: 0.25, soft: i % 2 === 1 });
  return out;
}

function chorus(part, start, { lift = 0, tune = true, keys = true, shaker = true, bars = 8 } = {}) {
  const out = [];
  for (let i = 0; i < bars; i += 1) {
    const at = start + i * BAR;
    out.push(...band(part.chords[i], at, { keys, shaker }));
    if (i % 2 === 0) for (const c of CLAVE) out.push({ beat: at + c, kind: 'rim', beats: 0.25 });
    if (!tune) continue;
    let beat = at;
    for (const [midi, beats] of part.tune[i]) {
      if (midi) out.push({ beat, kind: 'vibes', midi: midi + lift, beats });
      beat += beats;
    }
  }
  return out;
}

const FORMS = [
  [[VERSE, { tune: false, keys: false, bars: 2 }], [VERSE, {}], [VERSE, { lift: 12 }], [BRIDGE, {}], [VERSE, { shaker: false }]],
  [[BRIDGE, { tune: false, bars: 2 }], [BRIDGE, {}], [VERSE, {}], [VERSE, { lift: 12, keys: false }]],
];
const TAIL = 2; // bars of silence before the band comes round

export function piece(pass) {
  const notes = [];
  let beat = 0;
  for (const [part, opt] of FORMS[pass % FORMS.length]) {
    notes.push(...chorus(part, beat, opt));
    beat += (opt.bars ?? 8) * BAR;
  }
  notes.sort((a, b) => a.beat - b.beat);
  return { notes, beats: beat + TAIL * BAR };
}
