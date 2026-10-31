// "Fold", for felt piano and music box. 56 beats a minute, in eighth notes.
//
// A process piece. The music box loops seven eighths and the piano loops nine, so the two drift against each other and
// only line up every 63 eighths. Each pass adds one note to the box's cell, then takes it away, as an additive process.
// Rests are written into both loops, and a pass of near silence comes round every third time.
//
// The notes below are scale degrees, not pitches. audio.js turns a degree into a pitch at the moment it sounds, by way
// of OPENINGS, so the harmony can follow a measured number: a real loss falling, or a real confidence rising, moves it
// from tight clusters to open fifths. The measurement decides the chord. Nothing here decides it.
export const BEAT = 60 / 112; // one eighth

// Roots of the slow harmony, a bar being 8 eighths long. D, B, G, A.
export const ROOTS = [[50, 'maj'], [47, 'min'], [43, 'maj'], [45, 'maj']];
const BARS_PER_ROOT = 4;

// Semitones above the root for degrees 0 to 5, from cluster (0) to open consonance (4).
export const OPENINGS = {
  maj: [[12, 14, 15, 17, 19, 20], [12, 14, 16, 17, 19, 21], [12, 14, 16, 19, 21, 24], [12, 16, 19, 21, 24, 26], [12, 19, 24, 28, 31, 36]],
  min: [[12, 13, 15, 17, 18, 20], [12, 14, 15, 17, 19, 20], [12, 14, 15, 19, 20, 24], [12, 15, 19, 22, 24, 26], [12, 19, 24, 27, 31, 36]],
};

const R = -1; // a rest
const BOX = [0, R, 2, R, 4, R, R]; // seven eighths
const BOX_ADD = [[], [1], [1, 5], [1, 5, 3], [1, 5], [1], []]; // the extra notes each pass, inserted as a second voice
const PIANO = [0, R, R, 1, R, R, R, 3, R]; // nine eighths

export function piece(pass) {
  const notes = [], eighths = 64;
  const breath = pass % 3 === 2; // a quiet pass: only the piano's first notes and the bass
  const adds = BOX_ADD[pass % BOX_ADD.length];
  for (let e = 0; e < eighths; e += 1) {
    const root = Math.floor(e / (8 * BARS_PER_ROOT)) % ROOTS.length;
    const box = BOX[e % 7], pno = PIANO[e % 9];
    if (!breath && box !== R) notes.push({ beat: e, voice: 'box', degree: box + 1 + (e % 21 > 13 ? -1 : 0), root, octave: 12, pan: -0.25 });
    if (!breath && adds.includes(e % 7) && e % 2 === 1) notes.push({ beat: e + 0.5, voice: 'box', degree: 3 + (e % 3), root, octave: 12, pan: 0.3, soft: true });
    if (pno !== R && (!breath || e < 12)) notes.push({ beat: e, voice: 'piano', degree: pno, root, octave: 0, pan: 0.18 });
    if (e % (8 * BARS_PER_ROOT) === 0) notes.push({ beat: e, voice: 'bass', degree: 0, root, octave: -12, pan: 0 });
    if (e % (8 * BARS_PER_ROOT) === 12) notes.push({ beat: e, voice: 'bass', degree: 4, root, octave: -12, pan: 0 });
  }
  return { notes, beats: eighths };
}

// The chord tones a player's phrase can use right now: one phrase for each structure block or recycling pass.
export const PHRASE = [0, 2, 1, 3, 2, 4, 5];
