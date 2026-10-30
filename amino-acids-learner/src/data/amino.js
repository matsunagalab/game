// What the player learns: the twenty amino acids, their families, and the proteins.

export const FAMILIES = {
  oily: { name: 'Nonpolar', color: '#6f8f1f', wash: '#c9dc8e', about: 'Avoid water and pack into the core of a protein.' },
  ring: { name: 'Aromatic', color: '#6a45c9', wash: '#cdbdf0', about: 'Flat, bulky rings that stack against each other.' },
  polar: { name: 'Polar', color: '#0f8f84', wash: '#a7e0d6', about: 'Uncharged, but happy in water. They form hydrogen bonds.' },
  plus: { name: 'Positive', color: '#2460d8', wash: '#b4ccf6', about: 'Carry a plus charge at the pH of a cell.' },
  minus: { name: 'Negative', color: '#d93a2b', wash: '#f6bcae', about: 'Carry a minus charge at the pH of a cell.' },
};

const aa = (code, three, name, family, degree, codons, clue, note, letter) =>
  ({ code, three, name, family, degree, codons: codons.split(' '), clue, note, letter });

// degree is the note this amino acid plays, counted up a pentatonic scale.
export const AA = Object.fromEntries([
  aa('G', 'Gly', 'Glycine', 'oily', 0, 'GGU GGC GGA GGG', 'No side chain at all', 'No side chain, just a hydrogen. The smallest, and the most flexible.', 'G for glycine.'),
  aa('A', 'Ala', 'Alanine', 'oily', 1, 'GCU GCC GCA GCG', 'A single methyl group', 'One methyl group. Small, plain, and common in helices.', 'A for alanine.'),
  aa('V', 'Val', 'Valine', 'oily', 2, 'GUU GUC GUA GUG', 'A short fork', 'A short fork. Its V shape is easy to spot.', 'V for valine, and it looks like one.'),
  aa('L', 'Leu', 'Leucine', 'oily', 3, 'UUA UUG CUU CUC CUA CUG', 'A fork one carbon further out', 'A fork one carbon further out than valine.', 'L for leucine.'),
  aa('I', 'Ile', 'Isoleucine', 'oily', 4, 'AUU AUC AUA', 'A fork at the first carbon, with one long arm', 'An isomer of leucine that forks at the very first carbon.', 'I for isoleucine.'),
  aa('P', 'Pro', 'Proline', 'oily', 1, 'CCU CCC CCA CCG', 'Loops back onto its own backbone', 'The side chain loops back onto the backbone nitrogen, so the chain kinks here.', 'P for proline.'),
  aa('M', 'Met', 'Methionine', 'oily', 5, 'AUG', 'Long, with a sulfur in the middle', 'A long chain with a sulfur in the middle. Its codon AUG starts most proteins.', 'M for methionine.'),
  aa('F', 'Phe', 'Phenylalanine', 'ring', 3, 'UUU UUC', 'A plain benzene ring', 'A plain benzene ring. Oily and bulky.', 'Say it as Fenylalanine.'),
  aa('Y', 'Tyr', 'Tyrosine', 'ring', 5, 'UAU UAC', 'A ring with an –OH on the far end', 'Phenylalanine with an –OH on the far end of the ring.', 'tYrosine. T was already taken.'),
  aa('W', 'Trp', 'Tryptophan', 'ring', 7, 'UGG', 'Two fused rings', 'Two fused rings. The largest of the twenty.', 'tWyptophan. A double ring, a double-u.'),
  aa('S', 'Ser', 'Serine', 'polar', 2, 'UCU UCC UCA UCG AGU AGC', 'A small alcohol', 'A small alcohol, –CH<sub>2</sub>OH.', 'S for serine.'),
  aa('T', 'Thr', 'Threonine', 'polar', 3, 'ACU ACC ACA ACG', 'A small alcohol with an extra methyl', 'Serine with an extra methyl group.', 'T for threonine.'),
  aa('C', 'Cys', 'Cysteine', 'polar', 4, 'UGU UGC', 'Ends in –SH', 'Ends in –SH. Two of them can lock together as a disulfide bond.', 'C for cysteine.'),
  aa('N', 'Asn', 'Asparagine', 'polar', 5, 'AAU AAC', 'A short amide', 'A short amide. The uncharged twin of aspartate.', 'asparagiNe. The N of its amide helps too.'),
  aa('Q', 'Gln', 'Glutamine', 'polar', 6, 'CAA CAG', 'A long amide', 'A long amide. The uncharged twin of glutamate.', 'Q-tamine.'),
  aa('D', 'Asp', 'Aspartate', 'minus', 6, 'GAU GAC', 'A short chain ending in COO<sup>–</sup>', 'A short side chain ending in a negative carboxylate.', 'asparDic acid. D comes before E, and Asp is the shorter one.'),
  aa('E', 'Glu', 'Glutamate', 'minus', 8, 'GAA GAG', 'A long chain ending in COO<sup>–</sup>', 'Aspartate with one more carbon. Also negative.', 'gluEtamic acid. E comes after D, and Glu is one carbon longer.'),
  aa('K', 'Lys', 'Lysine', 'plus', 7, 'AAA AAG', 'A long chain ending in –NH<sub>3</sub><sup>+</sup>', 'A long flexible chain ending in a positive amine.', 'K sits next to L, which leucine had taken.'),
  aa('R', 'Arg', 'Arginine', 'plus', 9, 'CGU CGC CGA CGG AGA AGG', 'A long chain ending in a guanidinium', 'A long chain ending in a guanidinium, which shares its plus charge across three nitrogens.', 'aRginine.'),
  aa('H', 'His', 'Histidine', 'plus', 8, 'CAU CAC', 'A five-membered ring with two nitrogens', 'A five-membered ring with two nitrogens. Near pH 7 it can gain or lose a proton.', 'H for histidine.'),
].map((a) => [a.code, a]));

export const CODES = Object.keys(AA);

export const STOP_CODONS = ['UAA', 'UAG', 'UGA'];

// Pairs people mix up. Used to pick harder wrong answers once the basics are known.
export const LOOKALIKES = {
  G: ['A', 'S'], A: ['G', 'S', 'V'], V: ['I', 'L', 'T'], L: ['I', 'V', 'M'], I: ['L', 'V', 'T'],
  P: ['V', 'H'], M: ['L', 'C', 'K'], F: ['Y', 'W', 'H'], Y: ['F', 'W', 'H'], W: ['F', 'Y', 'H'],
  S: ['T', 'C', 'A'], T: ['S', 'V', 'I'], C: ['S', 'M', 'T'], N: ['D', 'Q', 'H'], Q: ['E', 'N', 'K'],
  D: ['E', 'N', 'S'], E: ['D', 'Q', 'K'], K: ['R', 'Q', 'M'], R: ['K', 'H', 'Q'], H: ['W', 'R', 'N'],
};

// Each palette is one place in a cell. wash runs from the top of the page to the bottom.
export const PALETTES = {
  cytosol: { wash: ['#cfeae0', '#bcd5f0'], crowd: ['#63b8ac', '#7f9fe0', '#ab93dc', '#e79ab0', '#efcb6c'] },
  gila: { wash: ['#ece6b6', '#c5dcae'], crowd: ['#a9b04e', '#d9a441', '#d97f68', '#6fb08d', '#e7cf7b'] },
  microvillus: { wash: ['#eed3e6', '#c6c3f0'], crowd: ['#d07fb0', '#8b84dc', '#e4a0a0', '#6fb7c9', '#b49be0'] },
  nucleus: { wash: ['#c8d0f4', '#b0e0e4'], crowd: ['#6d84dd', '#49b2b8', '#9d7bdb', '#e7b553', '#dd8fbd'] },
  er: { wash: ['#f9dfc2', '#f4c7cf'], crowd: ['#e88f6d', '#e6b34f', '#d97fa3', '#86bea3', '#f0a78a'] },
  bacterium: { wash: ['#e0f1bd', '#b8e5d3'], crowd: ['#7fbf5a', '#4fb6a0', '#d7c64a', '#e58c7a', '#7fa8df'] },
  anywhere: { wash: ['#cde5f8', '#f7e3b0'], crowd: ['#6fa8e2', '#e6b24c', '#df8a9d', '#5fbfa8', '#a68be0'] },
};

export const PROTEINS = [
  {
    id: 'chignolin', name: 'Chignolin', pdb: '1UAO', palette: 'cytosol', bpm: 84, makes: 'a tiny hairpin',
    about: 'Designed in Japan in 2004, these ten residues fold into a tiny hairpin. Folding simulations still use it as a test.',
  },
  {
    id: 'trpcage', name: 'Trp-cage', pdb: '1L2Y', palette: 'gila', bpm: 86, makes: 'a cage around one tryptophan',
    about: 'A 20-residue protein designed in 2002. One tryptophan sits buried in a cage of prolines, and the whole thing folds in about four microseconds.',
  },
  {
    id: 'villin', name: 'Villin headpiece', pdb: '1VII', palette: 'microvillus', bpm: 88, makes: 'three helices',
    about: 'A small piece of villin, which bundles actin filaments. Its three helices come together in microseconds, among the fastest folds in nature.',
  },
  {
    id: 'ww', name: 'Pin1 WW domain', pdb: '1PIN', palette: 'nucleus', bpm: 90, makes: 'a three-stranded sheet',
    about: 'WW domains are named after their two tryptophans. Three strands form a small sheet that recognizes phosphorylated proteins.',
  },
  {
    id: 'insulin', name: 'Insulin', pdb: '1MSO', palette: 'er', bpm: 92, makes: 'two chains tied by disulfide bonds',
    about: 'The first protein ever sequenced. Three disulfide bonds tie its two chains together. A cell makes one long chain and cuts out the middle, so here you build just the two parts that stay.',
  },
  {
    id: 'gb1', name: 'Protein G B1', pdb: '1PGA', palette: 'bacterium', bpm: 94, makes: 'a helix on a sheet',
    about: 'A domain from a Streptococcus surface protein that grips antibodies. One helix packs across a four-stranded sheet.',
  },
  {
    id: 'ubiquitin', name: 'Ubiquitin', pdb: '1UBQ', palette: 'anywhere', bpm: 96, makes: 'the tag for recycling',
    about: 'Nearly the same in every animal, plant and fungus. Chains of ubiquitin mark a protein for the proteasome, which is where misfolded chains end up in this game.',
  },
];
