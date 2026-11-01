// What the puzzle chapters put on the board. These lists choose what is on view, and the tests hold them to what the
// chapters say about them. Every score and every answer is computed from the data, in the game and in the tests.

// Chapter 1. Real residues of the column window, and real rows of the alignment. The rows were picked by a search so that
// true pairs show clearly by eye and unrelated columns do not. The score never reads them.
export const CHEY = {
  given: 56,
  residues: [18, 35, 56, 57, 59, 68, 85, 87, 89, 103, 104, 105, 109, 119],
  rows: [1882, 500, 1656, 1766, 113, 373, 1691, 1298, 1330, 1099, 1834, 1082],
};
export const SH3 = {
  residues: [11, 15, 19, 23, 29, 33, 35, 37, 41, 43, 44, 46, 51, 53],
  rows: [[622, 1557, 1781, 3111, 830, 3141, 2220, 996, 562, 212, 2041, 3674], [113, 2548, 2494, 2717, 219, 2105, 2710, 331, 1797, 3311, 1360, 3345]],
};

// Chapter 4. The target pairs are pairs chapter 1 finds strong that do not touch. The known sides are real distances.
export const TRIANGLE = { far: 89, hinge: 120, end: 119 };
export const TRIANGLES = [
  { key: 'che3', nums: [53, 59, 84, 119, 122, 126], known: [[59, 126], [126, 122], [122, 119], [59, 53], [53, 84], [84, 119]], pair: [59, 119] },
  { key: 'sh3g', nums: [25, 26, 29, 35, 37, 46, 47], known: [[37, 26], [26, 29], [29, 25], [25, 46], [37, 35], [35, 47], [47, 46]], pair: [37, 46] },
];
export const TOUCH = 8;

// Chapter 9. The core of adenylate kinase, numbered from 1, as in Muller et al. 1996.
export const AKE_CORE = [[1, 29], [60, 121], [160, 214]];
