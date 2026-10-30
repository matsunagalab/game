# Amino-acids learner

A browser game where you build real proteins one amino acid at a time, then fold them into their real 3D structures. It is built with three.js and designed first for a phone held upright.

## How to play

Open `index.html` in a browser. This one file is the whole game, and it needs no network.

1. Pick the amino acid that the ribosome's codon asks for. Tap it, or press its number or one-letter code on a keyboard.
2. A correct pick moves the mRNA forward three bases, extends the chain, and spreads watercolor over the pencil drawing of the cell.
3. A wrong pick uses up one chaperone and shows how the two amino acids differ as 2D structures. When the chaperones run out, the chain is taken apart.
4. After the stop codon, press and hold to fold the protein.

Questions change with how well you know each of the 20 amino acids:

labeled options → name → three-letter code → one-letter code → a clue → name it from its structure

Progress is saved in the browser's localStorage.

## Rebuilding

```sh
sh tools/build.sh            # build index.html from src/
node tools/test_learn.mjs    # test the learning logic and the genetic code table
```

Dependencies are installed in `~/.cache/amino-acids-learner`, outside the repository.

Rebuilding the structure data in `src/data/structures.js` needs RDKit and numpy.

```sh
python -I tools/make_data.py <folder of PDB files> src/data/structures.js
```

## Data and materials

- Structures: Protein Data Bank entries 1UAO, 1L2Y, 1VII, 1PIN (residues 6 to 39), 1MSO, 1PGA and 1UBQ. For NMR structures, the first model is used.
- Secondary structure: the HELIX and SHEET records of those files.
- Coordinates and 2D structures of the 20 amino acids: generated with RDKit, as zwitterions at pH 7.
- Insulin is built from the B and A chains only, without the C peptide. Entry 1MSO was chosen because it has the wild-type sequence. Entry 3I40 has Ala at B30.
- three.js (MIT), Young Serif and Shantell Sans (SIL Open Font License 1.1).
