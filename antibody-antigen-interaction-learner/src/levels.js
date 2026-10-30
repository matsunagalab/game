// Lessons. Each introduces one idea; the hand is what the B cell has to work with.
// `epitope` is what the antigen shows to each loop. `locked` loops are already set.

export const LESSONS = [
  {
    id: 'fit', title: 'Fit comes first', palette: 'lagoon', antigen: {seed: 11, stretch: [1, 1, 1], lumps: 0.1},
    epitope: {H1: 'S', H2: 'Y', L3: 'R', L1: 'N', L2: 'K', H3: 'N'},
    locked: {H2: 'Y', L1: 'N', L2: 'E'},
    hand: ['R', 'N', 'S'],
    target: 3e-6,
    intro: 'Six loops at the tip of the antibody reach toward the antigen. Long side chains meet short ones, and medium meets medium.',
    prompt: 'Tap a residue, then tap the loop facing its partner. Get the bead past the green line.',
    learned: 'Too long and atoms clash. Too short and water stays trapped. Shape decides first.',
  },
  {
    id: 'charge', title: 'Opposites attract', palette: 'sunset', antigen: {seed: 23, stretch: [1.08, 0.94, 1], lumps: 0.14},
    epitope: {H1: 'D', H2: 'E', L3: 'K', L1: 'R', L2: 'Y', H3: 'L'},
    locked: {L2: 'Y', H3: 'L'},
    hand: ['R', 'K', 'E', 'D', 'S'],
    target: 3e-8,
    intro: 'Blue side chains are positive and red ones are negative. A matched pair forms a salt bridge. Check the length too.',
    prompt: 'Pair each charge with its opposite, at the right length.',
    learned: 'Salt bridges are strong, but only when the lengths fit. Two loops with the same charge side by side also lose energy.',
  },
  {
    id: 'oil', title: 'Oil and water', palette: 'sky', antigen: {seed: 37, stretch: [0.94, 1.1, 1], lumps: 0.18},
    epitope: {H1: 'L', H2: 'W', L3: 'A', L1: 'F', L2: 'D', H3: 'L'},
    locked: {L2: 'R'},
    hand: ['L', 'A', 'W', 'Y', 'L', 'N'],
    target: 2e-8,
    intro: 'Oily surfaces are wrapped in ordered water. When two of them meet, that water escapes, and the escape drives binding.',
    prompt: 'Cover the oily patches. Keep polar groups out of them.',
    learned: 'The hydrophobic effect comes from the water leaving, not from the oil sticking.',
  },
  {
    id: 'hbond', title: 'The all-rounder', palette: 'meadow', antigen: {seed: 41, stretch: [1.04, 1, 0.96], lumps: 0.13},
    epitope: {H1: 'N', H2: 'F', L3: 'Y', L1: 'N', L2: 'E', H3: 'S'},
    locked: {},
    hand: ['Y', 'Y', 'Y', 'N', 'K', 'W', 'D'],
    target: 8e-7,
    intro: 'Tyrosine has an oily ring and a polar hydroxyl, so it can stack, pack, or hydrogen-bond. Binding sites are full of it.',
    prompt: 'Tyrosine works in many places. Find the arrangement that uses it well.',
    learned: 'Tyrosine is one of the most common residues in antibody binding sites because it fits almost any partner.',
  },
  {
    id: 'ring', title: 'Seal the ring', palette: 'amber', ring: true, antigen: {seed: 53, stretch: [1.1, 1, 1.05], lumps: 0.16},
    epitope: {H1: 'Y', H2: 'S', L3: 'E', L1: 'L', L2: 'R', H3: 'F'},
    locked: {},
    hand: ['F', 'R', 'K', 'Y', 'L', 'D', 'W', 'N'],
    target: 1e-9,
    intro: 'Water near a bond weakens it. If all five outer loops fit snugly, they keep water away and the center counts double.',
    prompt: 'Make every outer loop snug, then give the center your best contact.',
    learned: 'Real interfaces often have a tight center with a ring of residues around it that keeps water out. It is called an O-ring.',
  },
  {
    id: 'self', title: 'Friend or foe', palette: 'violet', ring: true, antigen: {seed: 67, stretch: [1, 1.06, 1], lumps: 0.15},
    epitope: {H1: 'R', H2: 'L', L3: 'E', L1: 'S', L2: 'Y', H3: 'K'},
    self: {H1: 'E', H2: 'L', L3: 'E', L1: 'S', L2: 'Y', H3: 'N'},
    locked: {},
    hand: ['D', 'S', 'L', 'K', 'R', 'E', 'Y', 'N'],
    target: 1e-8,
    selfFloor: 5e-7,
    intro: 'Your own body has a protein that looks almost the same. Bind the antigen and leave the look-alike alone.',
    prompt: 'The ringed sites differ between the two. Use them.',
    learned: 'B cells that bind self strongly are removed. A good antibody is both tight and selective.',
  },
];

export const TWO_ARMS = {
  id: 'arms', title: 'Two arms', palette: 'night',
  intro: 'An antibody has two identical arms. When both hold on, one can let go and still be held in place by the other.',
  prompt: 'Tap two sites that one antibody can span.',
  learned: 'This is avidity. Two weak grips can be far stronger together than either one alone.',
};
