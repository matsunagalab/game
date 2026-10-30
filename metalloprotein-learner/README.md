# Metalloprotein Learner

A browser game for reading coordination structures, using 21 real metal sites from metalloproteins. It is built with three.js and designed first for a phone held upright.

## How to play

Open `index.html` in a browser. This one file is the whole game, and it needs no network.

The screen is a 24-well crystallization plate. Opening a well dives in one move from the plate to the crystal, the lattice, a single molecule, and the metal site. Every site follows the same steps.

1. **Ligands**: in the apo pocket, where the metal is missing, tap the atoms that reach the green difference density. Atoms in the second coordination sphere are decoys.
2. **Shape**: tap a candidate polyhedron to check it against the real coordinating atoms.
3. **Metal**: drag or tap a vial of metal salt to add it to the site. A wrong choice makes the difference density respond in green or red.

When the right metal goes in, the interference figure spreads and the metal's color runs along the gray ribbon. Each mistake raises the B-factor and shakes the atoms. At 100 the crystal is lost. Your score is a resolution in Å.

The sixth well in each column is a short arcade game: HSAB (A6), a K-edge scan (B6), and the Irving–Williams series (C6). All six wells in column D are metal sites.

Drag with one finger to rotate, pinch with two to zoom, and tap to select. Progress is saved in the browser's localStorage.

## Rebuilding

```sh
sh tools/build.sh                         # build index.html from src/
node tools/make_data.mjs <folder of PDB files>   # rebuild src/data/sites.json
```

Dependencies are installed in `~/.cache/metalloprotein-learner`, outside the repository. `make_data.mjs` needs only Node. The folder must hold `XXXX.pdb` files, plus `1K4C.pdb1` for the KcsA tetramer. The atoms used for each site are listed in `tools/sites.mjs`.

## Data and materials

- Structures: Protein Data Bank entries 1AAY, 2CBA, 8TLN, 4DWV, 4EXS, 1IRO, 1A6M, 1YCC, 2CPP, 1IQZ, 1PLC, 4AZU, 2C9V, 1OXY, 1FWJ, 1EXR, 1K4C, 2FMS, 7REQ, 3WU2 and 3U7Q.
- Bond lengths, metal-metal distances and RMSD from ideal polyhedra on screen are all computed from those coordinates by `make_data.mjs`.
- Secondary structure comes from the HELIX and SHEET records of the PDB files, and references from the JRNL records.
- The difference density mesh and the crystal lattice are drawn for illustration. They are not measured electron density or real crystal symmetry.
- three.js (MIT), Bodoni Moda and Hanken Grotesk (SIL Open Font License 1.1).
