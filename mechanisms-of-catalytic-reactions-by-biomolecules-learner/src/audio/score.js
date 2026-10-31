// The piece. One gamelan, tuned in slendro, plays through the whole game.
//
// Each chapter has its own balungan, the skeleton melody, written in the usual number notation (1 2 3 5 6, 0 for a rest).
// The form is a lancaran-like cycle of eight balungan beats: the gong closes it. Kenong marks beats 4 and 8, kempul 2 and 6,
// kethuk the odd beats. In this game one gong is one turnover, and each step of the mechanism sits on a structural beat.
//
// Irama: every level doubles the balungan's length and doubles the density of the running parts around it.
// A pulse stays the same length at every level, so a slower enzyme still sounds alive. Only the gong moves further off.

export const PULSE = 0.25;         // seconds. A balungan beat at level 0 is two pulses.

// Cents above the first degree, close to a Javanese slendro. Real sets have no two tunings alike, and octaves run slightly wide.
const CENTS = { 1: 0, 2: 232, 3: 476, 5: 720, 6: 958 };
export const OCTAVE_CENTS = 1206;
export const BASE_HZ = 276;
export const hz = (deg, oct = 0) => BASE_HZ * 2 ** ((CENTS[deg] + oct * OCTAVE_CENTS) / 1200);

// Eight-beat strains. Each chapter has two, played in turn. Rests leave the air open.
export const BALUNGAN = {
  water:      ['0 3 0 2 0 3 0 1', '0 5 0 3 0 2 0 1'],
  subtilisin: ['2 1 2 6 2 1 6 5', '3 5 6 1 6 5 3 2'],
  rnase:      ['5 6 1 6 5 3 2 3', '1 2 3 5 6 5 3 2'],
  ca:         ['3 5 3 2 3 5 6 1', '6 5 3 2 1 2 3 5'],
  tim:        ['6 1 2 1 6 5 3 5', '2 3 5 3 2 1 6 1'],
  adh:        ['1 6 5 6 1 2 3 2', '5 3 2 3 5 6 1 6'],
  aat:        ['2 3 2 1 6 5 6 1', '3 2 1 2 3 5 3 2'],
  lysozyme:   ['5 3 5 6 5 3 2 1', '2 1 6 1 2 3 5 3'],
  ompdc:      ['1 2 3 2 1 6 5 6', '1 3 5 6 5 3 2 1'],
};

// Kotekan: two players, each with a broken pattern. Neither part is the tune. Together they make one fast line.
// Written against the next balungan note, in degrees relative to it on the five-note scale: polos on, sangsih off.
const POLOS =   [0, null, -1, 0, null, -1, null, 0];
const SANGSIH = [null, 1, null, null, 1, null, 1, null];
const SCALE = [1, 2, 3, 5, 6];
function stepDeg(deg, by) {
  const i = SCALE.indexOf(deg), n = i + by;
  const k = ((n % 5) + 5) % 5;
  return { deg: SCALE[k], oct: Math.floor(n / 5) };
}

const parse = (s) => s.trim().split(/\s+/).map(Number);

export const BEATS_PER_GONG = 8;
export const pulsesPerBeat = (level) => 2 ** (level + 1);
export const gongSeconds = (level) => BEATS_PER_GONG * pulsesPerBeat(level) * PULSE;

// layers: 0 saron only, 1 + bonang, 2 + peking, 3 + kotekan. gong: false holds the gong back until the cycle closes.
export function piece(chapter, pass, { level = 0, layers = 3, gong = true, rest = false } = {}) {
  const strains = BALUNGAN[chapter].map(parse), bal = strains[pass % strains.length];
  const P = pulsesPerBeat(level), notes = [], beats = BEATS_PER_GONG * P;
  const prev = strains[(pass + strains.length - 1) % strains.length];
  const at = (b) => b * P;              // pulse index of balungan beat b (1-based, so beat 8 ends the cycle)
  const hit = (pulse, inst, deg, oct, vel, pan = 0) => notes.push({ beat: pulse, inst, deg, oct, vel, pan });
  if (rest) {
    // A silent passage: only the kethuk breathes, and the gong closes it.
    hit(at(4) - P / 2, 'kethuk', 2, 0, 0.5);
    if (gong) hit(at(8) - P, 'gong', 6, -2, 0.9);
    notes.sort((a, b) => a.beat - b.beat);
    return { notes, beats };
  }
  for (let b = 1; b <= BEATS_PER_GONG; b++) {
    const d = bal[b - 1], pulse = at(b) - P;
    if (d) {
      hit(pulse, 'saron', d, 0, 0.8, -0.12);
      if (layers >= 1 && b % 2 === 0) hit(pulse, 'demung', d, -1, 0.7, 0.14);
    }
    if (b % 2 === 1) hit(pulse, 'kethuk', 2, 0, 0.55, 0.2);
    if (b === 2 || b === 6) hit(pulse, 'kempul', d || 5, -1, 0.7, -0.2);
    if (b === 4) hit(pulse, 'kenong', d || 3, 0, 0.75, 0.25);
    if (b === 8) {
      hit(pulse, 'kenong', d || 1, 0, 0.8, 0.25);
      if (gong) hit(pulse, 'gong', 6, -2, 1, 0);
    }
  }
  // Bonang: walks toward the next two notes, once a beat at level 0, in pairs at higher levels.
  if (layers >= 1) {
    for (let g = 0; g < 2; g++) {
      const start = g * 4, tones = [bal[start + 1] || bal[start + 3] || 1, bal[start + 3] || 1];
      for (let k = 0; k < 2; k++) {
        const pulse = (start + k * 2) * P + P / 2;
        hit(pulse, 'bonang', tones[k], 0, 0.5, 0.3);
        hit(pulse + P / 2, 'bonang', tones[k], 1, 0.34, 0.3);
      }
    }
  }
  // Peking doubles the skeleton in the upper octave, anticipating each note.
  if (layers >= 2) {
    for (let b = 1; b <= BEATS_PER_GONG; b++) {
      const d = bal[b - 1] || prev[b - 1]; if (!d) continue;
      const pulse = at(b) - P;
      hit((pulse - P / 2 + beats) % beats, 'peking', d, 1, 0.34, -0.3);
    }
  }
  // Kotekan runs at a steady pulse whatever the level, and pauses before each gong so it can be heard.
  if (layers >= 3) {
    for (let b = 1; b <= BEATS_PER_GONG; b++) {
      const target = bal[b - 1] || bal[(b) % 8] || 1, from = (b - 1) * P, n = Math.max(P, 2);
      for (let k = 0; k < n; k++) {
        if (b === 8 && k >= n - 2) continue;
        const m = k % 8, pu = POLOS[m], sa = SANGSIH[m];
        if (pu !== null) { const s = stepDeg(target, pu); hit(from + k, 'gangsa', s.deg, 1 + s.oct, 0.3, -0.42); }
        if (sa !== null) { const s = stepDeg(target, sa); hit(from + k, 'gangsa2', s.deg, 1 + s.oct, 0.3, 0.42); }
      }
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  return { notes, beats };
}

// Mechanism steps to structural beats. A chapter of n steps uses the last n of: kempul 2, kenong 4, kempul 6, gong 8.
export function stepBeats(n) {
  const all = [2, 4, 6, 8];
  return all.slice(all.length - Math.min(n, 4));
}
