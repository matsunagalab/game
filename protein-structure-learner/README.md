---
title: Protein Structure Learner
type: game
updated: 2026-10-30
---

# Protein Structure Learner

A three.js game for learning protein structure by handling it. It goes "from two hinges to a virus" in 4 chapters and 15 stages. It is designed for a phone held upright, and it also works in landscape, on tablets and on computers.

## How to play

Open `index.html`. Everything is in this one file, so it needs no server and no network.

## The four chapters

| Chapter | Level of structure | What you do | Subjects |
|---|---|---|---|
| Chain | Primary and secondary | Move φ and ψ with a finger and explore the Ramachandran plot as a map | Alanine, glycine and proline peptides |
| Beat | Sequence to structure | Light up the residues that face the partner to find the rule, then read real sequences and call each one helix or strand | GCN4, a nanobody, 13 fragments of real proteins |
| Core | Tertiary | Read helical wheels and turn the oily faces toward the core to close it | GCN4, ferritin, myoglobin, GFP |
| Shell | Quaternary | Turn one subunit and all the copies follow until the shell closes | HIV protease, cholera toxin, the ferritin 24-mer, the STNV 60-mer |

## The science

- All coordinates are real PDB data (2HHB, 2ZTA, 1MEL, 1MBN, 2FHA, 1EMA, 1HSG, 3CHB, 2BUK).
- The Ramachandran plot is computed with a hard-sphere test on the game's own atomic model. The contact distances are those of Ramakrishnan & Ramachandran (1965). The α region falls outside at ideal bond angles, so the test is relaxed by 0.15 Å for atom pairs next to a hinge.
- The buried positions in GCN4 are a and d of the heptad. Whether a strand residue points in or out is judged from the Cβ direction computed from the real backbone.
- The 13 fragments in the reading test are only those where the correct fold puts more oil on one face (hydrophobic moment, Eisenberg 1982).
- The direction of the oily face in Core is the hydrophobic moment computed from real side chain positions. Helices and strands with no clear direction are fixed from the start and have no dial.

## Rebuilding

```sh
# Put the PDB files in one folder, then build the data
node tools/build_data.mjs <folder of PDB files>

# Build index.html (npx fetches esbuild)
node tools/build.mjs
```

There is no `node_modules` folder. three.js is included in `vendor/three/`.

## Folders

- `src/press.js`: the three-ink print engine, which every screen goes through
- `src/ribbon.js`: drawing of ribbons and space-filling models
- `src/peptide.js`: building a chain from φ and ψ, collisions, and hydrogen bonds
- `src/chapters/`: the game for each of the four chapters
- `src/stages.js`: stage definitions and explanations
- `tools/`: data generation and the build

## Licenses and sources

three.js is MIT. The fonts (Dela Gothic One, Bricolage Grotesque) are SIL OFL. The structure data are wwPDB data under CC0.
