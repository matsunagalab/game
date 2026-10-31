// The standard genetic code and the base-pairing rules of codon and anticodon.
const BASES = 'UCAG';
const AA = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
export const THREE = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val', '*': 'Stop' };
export const NAME = { A: 'alanine', R: 'arginine', N: 'asparagine', D: 'aspartate', C: 'cysteine', Q: 'glutamine', E: 'glutamate', G: 'glycine', H: 'histidine', I: 'isoleucine', L: 'leucine', K: 'lysine', M: 'methionine', F: 'phenylalanine', P: 'proline', S: 'serine', T: 'threonine', W: 'tryptophan', Y: 'tyrosine', V: 'valine' };

export function translateCodon(codon) {
  const [a, b, c] = codon.toUpperCase().replaceAll('T', 'U').split('').map((x) => BASES.indexOf(x));
  return AA[a * 16 + b * 4 + c];
}
export const translate = (rna) => (rna.match(/.{3}/g) ?? []).map(translateCodon).join('');
export const allCodons = () => [...BASES].flatMap((a) => [...BASES].flatMap((b) => [...BASES].map((c) => a + b + c)));

const WC = { A: 'U', U: 'A', G: 'C', C: 'G' };
export const rnaFromTemplate = (t) => (t === 'A' ? 'U' : t === 'T' ? 'A' : t === 'G' ? 'C' : 'G');
export const templateOf = (dnaCoding) => [...dnaCoding].map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b])).join('');
export const toRNA = (dna) => dna.replaceAll('T', 'U');

// Anticodons are written 5'→3' as biochemists do. Position 34 is its first letter and meets the third codon base.
export const perfectAnticodon = (codon) => [...codon].reverse().map((b) => WC[b]).join('');

// Crick's wobble rules for position 34.
const WOBBLE = { G: 'CU', U: 'AG', C: 'G', A: 'U' };

// Per codon position (1..3): does it pair? Wobble counts only inside a family of codons for one amino acid,
// so a U34 tRNA for AUA (Ile) or UGA does not count as reading AUG (Met) or UGG (Trp).
export function pairing(codon, anti) {
  const direct = codon[2] === WC[anti[0]];
  const family = translateCodon(codon) === translateCodon(codon.slice(0, 2) + WC[anti[0]]);
  return [codon[0] === WC[anti[2]], codon[1] === WC[anti[1]], direct || (WOBBLE[anti[0]].includes(codon[2]) && family)];
}

export function classify(codon, anti) {
  const p = pairing(codon, anti);
  const bad = p.filter((x) => !x).length;
  return bad === 0 ? 'cognate' : bad === 1 ? 'near' : 'non';
}
// Positions 1 and 2 are watched by the ribosome. Position 3 is watched loosely.
export const mismatchAt = (codon, anti) => pairing(codon, anti).findIndex((ok) => !ok);

const swap = (b, i) => BASES[(BASES.indexOf(b) + 1 + i) % 4];
// A tRNA of the chosen class for this codon, written 5'→3'.
export function tRNAFor(codon, kind, roll = Math.random) {
  const a = perfectAnticodon(codon);
  if (kind === 'cognate') {
    if (codon[2] === 'U' && roll() < 0.6) return `G${a.slice(1)}`; // A G:U wobble is still correct.
    return a;
  }
  for (let tries = 0; tries < 40; tries++) {
    const s = [...a];
    const n = kind === 'near' ? 1 : 2 + Math.floor(roll() * 2);
    const pos = [2, 1, 0].sort(() => roll() - 0.5).slice(0, n);
    pos.forEach((p) => { s[p] = swap(s[p], Math.floor(roll() * 3)); });
    const t = s.join('');
    if (classify(codon, t) === (kind === 'near' ? 'near' : 'non')) return t;
  }
  return a;
}
