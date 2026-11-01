---
title: Prediction mechanism of AlphaFold2 learner
type: game
updated: 2026-11-01
---

# Prediction mechanism of AlphaFold2 learner

A three.js game for students who know basic protein structure and no machine learning. In ten chapters you work through the ideas behind AlphaFold2 by hand, on real alignments and real structures, in a world of cut paper and daylight.

This game does not run AlphaFold2. Nothing in it is a neural network, and nothing it computes should be mistaken for an AlphaFold2 result.

## How to play

Open `index.html`. Everything is in this one file, so it needs no server and no network. It is designed for a phone held upright and also works on tablets and computers.

## Chapters

Each chapter leaves one principle to explain in your own words, and ends with one new case to apply it to. A first tier is for doing the computation, a second for a result that takes some thought, and a third for getting the new case right.

Chapters 1, 4 and 9 are a pilot of a new form: three levels of one puzzle, played directly on the board, with almost no text. The other seven keep the earlier form. All ten chapters are in English and Japanese. See "Puzzle chapters" below.

| # | Chapter | You do | The principle |
|---|---|---|---|
| 1 | The loom | Drag one real alignment column onto another. All the sequences are read, a cell of the pair table fills, and a thread appears on the real protein. Find a partner, then three real contacts, then a pair in a new family with the meter hidden | Why co-evolution reveals contacts, and how AlphaFold2 reads it into its pair table |
| 2 | Direct or indirect | Invert a correlation table, by a small exact model and then on the real family. Vary depth, and test family history | Why correlation is not contact |
| 3 | Two representations | Share out attention along a row and down a column to guess a hidden letter, step through one Evoformer block, then run a two-tower exchange and cut each wire | Why an MSA and a pair table are both kept, how they talk, and what attention is |
| 4 | Triangles | Swing a real triangle, then prove that real pairs cannot touch by choosing third residues on a half table of real distances, the last with a move budget | Why distances limit each other, and how AlphaFold2 is wired to look at triangles. Its pair table has no inequality rule |
| 5 | Residue gas | Build a real frame, compare a chain move with a free move, throw a flock from the black hole | Why residues are treated as free frames |
| 6 | Invariant point attention | Aim attention with a point in space, then turn the molecule and read the change in the weights | How the structure module stays invariant, and what that buys. DeepMind found it helpful but not essential |
| 7 | FAPE and the mirror | Stand on a residue, send a protein through a mirror, run eight folds with each of two losses, move the clamp | What FAPE measures, and how the right hand is reached |
| 8 | Recycling | Fold CheY with your own pipeline, feed the draft back, run the control | What recycling does, and how little of its gain a simple model can explain |
| 9 | Reading confidence | Cut real models: p53 where pLDDT falls, calmodulin where PAE says two parts cannot be placed, and adenylate kinase at the hinges a real crystal shows, which AF2's own PAE does not | How to read pLDDT and PAE, and what a low PAE does not say |
| 10 | What one model cannot say | See two real folds of KaiB, sort what one model can and cannot answer | What AlphaFold2 cannot tell you |

## What is real and what is not

Every card on screen carries one or more of five tags.

| Tag | Meaning |
|---|---|
| Real data | Measured, or taken from a database: Pfam alignments, PDB coordinates, UniProt annotations |
| Real AF2 output | Models, pLDDT and PAE from the AlphaFold Protein Structure Database |
| Computed here | Calculated live on your device |
| Teaching model | A small stand-in, labelled as such, that shows the shape of an idea but is not AlphaFold2 |
| From the papers | A statement about AlphaFold2 taken from the literature, with the source in the chapter note |

### Real computations on real data

- Mutual information, entropy, APC and mean-field DCA on 2,000 real sequences (chapters 1, 2), and mutual information on 4,000 real SH3 sequences (chapter 1).
- The triangle inequality on real distances, one third residue at a time (chapter 4), and whole bound smoothing on predicted contacts (chapter 8). The shortest proof of each puzzle is found by a search, not stored.
- How well pieces of a chain explain a real error map: the share of the map's variance kept when each block is replaced by its mean (chapter 9). AlphaFold2 does not cut chains. This is a way of reading its tables.
- Gram-Schmidt frames, frame composition, FAPE, aligned error, Kabsch-type superposition, dRMSD and lDDT on real coordinates (chapters 5 to 10).
- The attention line of Algorithm 22, on real frames, with live numerical checks of invariance (chapter 6).

### Teaching models

- **Two-tower exchange** (chapter 3). Two real tables and two wires, on real sequences: gradient ascent on the pseudo-likelihood (Ekeberg et al. 2013). The wires are one formula here and learned in AlphaFold2. The loss shown is on 300 sequences kept out of all training. It falls from about 1.51 to about 1.30 by block 12, and the training loss falls further, which is overfitting and is not shown as a result. Both wires are needed here by construction, so cutting one is a demonstration, not a finding.
- **Pose averaging** (chapter 5). Each residue hears from every other where it should be. The pair table here simply holds the real relative pose from the crystal, which AlphaFold2 does not have. Only the outward form matches: frames, composition in the local frame, eight blocks.
- **One optimiser, two losses** (chapter 7). Gradient steps on free coordinates from a black-hole start, changing only the loss. Same crystal, same start, same steps on the coordinates. The FAPE run also re-fits each frame's rotation at every step, because that loss needs frames. It is not the training of a network, and the loss uses the crystal as a training loss does. It shows the logic of Supplementary Fig. 9 in a far simpler system.
- **This game's own pipeline** (chapter 8). DCA, then bounds, then multidimensional scaling, then gradient descent on frames. Local shape within four residues along the chain is read from the crystal, as a stand-in for what a network learns about local structure. Contacts are not.
- **The dials** (chapter 2) and **tree test** (chapter 2). Exact arithmetic on made-up inputs, and made-up sequences with no coupling by construction.

### Results found while building, kept as found

These were measured, not designed in.

- On this sample, precision at L/2 is about 24% for MI, 50% for MI with APC, and 67% for DCA with APC. Depth and settings change these.
- The Supplement says "equivariance in the network is not essential", so the game states invariance as a design choice that helps. The paper says the triangle updates are "inspired by the necessity of consistency". We infer from the algorithms, which contain no such check, that nothing enforces the triangle inequality on the pair table. Final coordinates obey it by geometry.
- Reweighting at 80% identity barely changes the tree test, and M_eff is about 1,890 of 2,000 here. The game does not claim it cures phylogeny.
- A simple count of triangle support did not separate true from false contacts (AUC about 0.56 to 0.63), so the game does not claim that false contacts lack friends.
- On letters, DCA shrinks an indirect pair but does not zero it. Exact zero belongs to the Gaussian case. The real triple T16, I20, L24 is shown as a suspect only: conditioning on I20 does not remove the link, and no clean real example was found at separations of 6 or more.
- Recycling in the game's own pipeline gives a small gain at pass 2 and none after. Over nine runs, median RMSD went 3.95, 3.45, 3.53, 3.46 Å, and pass 2 raised lDDT in all nine. Using the top 54 pairs with no draft at all does as well (3.28 Å), so here the gain comes from which pairs are used. The draft drops some of the worst pairs and lets in more real ones, though the share of real contacts does not rise, and its distances alone do not help. The hand in this pipeline is set by the crystal-derived local shape, not found independently.
- In the mirror experiment, the same optimiser from the same start gives the real hand in 8 of 8 runs with FAPE, and mirror images in about half of them with distances alone.
- With a clamp at 10 Å, FAPE takes far more off a real domain swing than off evenly spread noise. Which of the two scores better depends on how the noise is made, so the game does not present a ranking as a finding.
- AlphaFold2's CheY model is 0.71 Å from crystal 3CHY over 128 residues and 0.62 Å over the 109 the alignment covers. That crystal dates from 1991, and the database pipeline can read templates, so this is not a blind test.
- AlphaFold2's adenylate kinase model has mean pLDDT 95.9. It is 0.75 Å from closed 1AKE and 7.20 Å from open 4AKE. Its real PAE stays near 4 Å between domains, while its true error against the open crystal is 12 to 22 Å.
- AlphaFold2's calmodulin lobes are 0.8 and 0.5 Å from 1CLL, and the whole chain is 6.5 Å off. Its real PAE shows this: about 3.7 Å within a lobe and 22 Å between them. The mean gap between PAE and the true error is about 4.6 Å here, 1.6 Å for adenylate kinase against its closed crystal and 6.7 Å against its open one, because PAE speaks of the state AlphaFold2 predicted.
- D57 and K109 count as a miss by our C-beta rule at 8.1 Å, yet their side chains touch at 2.7 Å. Of the 18 misses in the top 54, 7 have heavy atoms within 5 Å. By minimum heavy-atom distance under 8 Å, as in Morcos et al., precision is 85% and not 67%.

### Simplifications

- The twelve rows on chapter 1's board are real sequences, picked by a search so that true pairs show clearly by eye and unrelated columns do not. Twelve random rows would look far messier. The columns are picked too. The meter, the strong line and the distances use every sequence, never the tiles. The chapter note says so.
- Chapter 4's known sides are real C-beta distances chosen to make a puzzle. AlphaFold2 does not start from such a table, though a template, when one exists, can supply some distances. Its pair table holds learned numbers, not ranges.
- Each alignment column keeps its six commonest letters, and the rest share one slot, so that the inversion is a 663 by 663 matrix and runs on a phone. Against the full 21 letters that costs about 4 of the top 54 pairs on this sample (0.67 against 0.74).
- FAPE here uses Cα atoms in backbone frames, as AF2's per-layer loss does, not all atoms.
- lDDT is the Cα form without stereochemistry checks, as in `alphafold/model/lddt.py`.
- Contacts are Cβ atoms within 8 Å, at least 6 apart along the chain. Morcos et al. used minimum atomic distance under 8 Å.
- Triangles keep their real N-Cα-C shape, drawn larger than life.
- The title's flock is animation. The fold it reaches is a real AlphaFold DB model.

### PAE

Chapter 9 shows real PAE for P0DP23 and P69441, from AlphaFold DB. P0AE67's is kept in the bundle and no longer shown. During the first build the `/files/` paths answered 403 Forbidden to this project's scripts, and the Google Cloud copy needs an account. Neither was worked around. Coordinates and pLDDT came from EBI's public archives at `ftp.ebi.ac.uk`, read by HTTP Range. The three PAE JSON files were later fetched by a reviewer from the URLs the API returned. To rebuild, save them as `<accession>.pae.json` in the data cache folder. Maps labelled true error are computed by this game from a real model and a real crystal.

For the pilot, a new multi-domain protein (GRB2, P62993) was wanted for chapter 9's level 3. The API still names the files, but `/files/` answered 403 again, the EBI archive holds no PAE, and the Google Cloud copy refused an anonymous request. None of this was worked around, so level 3 uses adenylate kinase, which the player has not met in that chapter, and it is new only in that sense. With a PAE file in the cache, a protein like GRB2 could replace it.

## Sources

AlphaFold2: Jumper et al., Nature 596, 583 (2021), and its Supplementary Information, with algorithm numbers as cited in the chapter notes. DeepMind's `alphafold` repository: `model/config.py`, `folding.py`, `modules.py`, `all_atom.py`, `lddt.py`, `common/confidence.py`. Evans et al., bioRxiv 2021.10.04.463034. Senior et al., Nature 577, 706 (2020).

Figures on ablations are read by eye from Supplementary Fig. 10, because the main Fig. 4 could not be fetched, and are given as approximate.

Co-evolution: Morcos et al., PNAS 108, E1293 (2011). Marks et al., PLoS One 6, e28766 (2011). Dunn et al., Bioinformatics 24, 333 (2008). Ekeberg et al., Phys Rev E 87, 012707 (2013). Anishchenko et al., PNAS 114, 9122 (2017).

Geometry: Crippen, J Comput Phys 24, 96 (1977). Dress and Havel, Discrete Appl Math 19, 129 (1988). Mariani et al., Bioinformatics 29, 2722 (2013). Noel et al., J Phys Chem B 116, 6880 (2012).

Confidence and limits: Dawson et al., J Mol Biol 2003, doi 10.1016/j.jmb.2003.08.008. Wells et al., PNAS 2008, doi 10.1073/pnas.0801353105. Tunyasuvunakool et al., Nature 596, 590 (2021). Varadi et al., Nucleic Acids Res 50, D439 (2022). Alderson et al., PNAS 120, e2304302120 (2023). Williams et al., Acta Cryst D 81, 558 (2025). Buel and Walters, Nat Struct Mol Biol 29, 1 (2022). Pak et al., PLoS One 18, e0282689 (2023). Hekkelman et al., Nat Methods 20, 205 (2023). Outeiral et al., Bioinformatics 38, 1881 (2022). Chang and Perez, Nat Commun 17, 170 (2025 online). Mirdita et al., Nat Methods 19, 679 (2022). Gut and Lemmin, Bioinform Adv 5, vbae187 (2025).

Alternative states, a contested area: del Alamo et al., eLife 11, e75751 (2022). Wayment-Steele et al., Nature 625, 832 (2024). Chakravarty et al., Nat Commun 15, 7296 (2024). Schafer et al., Nature 638, E8 (2025), read as its preprint only. Wayment-Steele et al., J Mol Biol 437, 169376 (2025).

## Puzzle chapters

A chapter with `puzzle: true` has three stages, one for each level, and `place`, the steps of AlphaFold2 it lights on the marker under the title. Each level is self-contained, because a language change or a resume starts the stored stage afresh. The old API stays for the other seven chapters.

| Part | What it does |
|---|---|
| `run.level(goal, done, total)` | Starts a level: the goal line, always in view, with its progress |
| `ui.count(done, total)` | Updates the progress |
| `ui.feedback(line, tone)` | One short line, good or bad. It does not resize the card |
| `ui.meter({ label, max, mark })` | One number as a bar with a line to pass |
| `run.board({ at, hover, grab, move, drop, tap })` | A move on the board, the same with a finger and a mouse, with hover and a grab cursor. `fine: true` follows every pixel |
| `run.idle(where)` | After 6 s with no action, a small hand shows what can be moved |
| `run.won(lines, tier)` | The reward, then on by itself. A tap skips each pause |
| `ui.pipeline(steps)` | The marker: sequences, pairs, structure, confidence |
| `ui.cellSize(px)` | Keeps labels in step with a board's cells on any screen |

Level 3 of each puzzle is passed only with the idea: a random player gets through under 5% of tries, and each can be retried at once. After two misses a quiet "Show me" gives the answer and ends the chapter without the third crane, so no one is ever locked. The cases and windows are in `src/science/cases.js`, and `tools/test.mjs` holds them to what the chapters say.

## Data and licences

| Data | Source | Licence |
|---|---|---|
| Alignments PF00072.31 (response regulator) and PF00018.35 (SH3), sampled | Pfam, through the InterPro API | CC0 |
| Structures 3CHY, 1SHG, 4AKE, 1AKE, 1CLL, 1CDL, 1CFD, 2QKE, 5JYT | Protein Data Bank (files.rcsb.org) | CC0 |
| Models and pLDDT: P0AE67, P69441, P0DP23, P04637, Q13542 | AlphaFold Protein Structure Database, EBI public archives, model version 6, AlphaFold Monomer v2.0 pipeline | CC-BY-4.0 |
| Predicted aligned error: P0AE67, P69441, P0DP23 | AlphaFold Protein Structure Database, model version 6 | CC-BY-4.0 |
| Region annotations of p53 | UniProt P04637 | CC-BY-4.0 |

AlphaFold DB data is used under CC-BY-4.0. The coordinates were reduced to N, Cα, C and Cβ with pLDDT, and PAE is stored at 0.5 Å resolution. Please cite Jumper et al. 2021 and Varadi et al. 2022. CheY's alignment sample is 2,000 sequences drawn with a fixed seed from the 486,732 in the Pfam full alignment. The SH3 sample is 4,000 drawn from the 176,305 in its alignment.

Fonts, both SIL Open Font License 1.1, bundled from `@fontsource`: Fraunces (2020 The Fraunces Project Authors) and Alegreya Sans (2013 The Alegreya Sans Project Authors). three.js is MIT.

## Rebuilding

```sh
# Download the raw data to a cache folder outside this repository
node tools/fetch_data.mjs
python3 -I tools/pick_afdb.py <EBI tar URL> <cache folder> P0AE67 P69441   # see below

# Pack the data into src/data/bundle.js
node tools/pack_data.mjs

# Test the maths
node tools/test.mjs

# Build index.html. DEPS holds three, esbuild and the @fontsource packages.
DEPS=$HOME/.cache/pchem-learner node tools/build.mjs
```

`tools/pick_afdb.py` reads single entries from EBI's tar archives by HTTP Range, for example `https://ftp.ebi.ac.uk/pub/databases/alphafold/latest/UP000000625_83333_ECOLI_v6.tar` for the two E. coli proteins and `UP000005640_9606_HUMAN_v6.tar` for the human ones. That fetches a few megabytes in place of gigabytes.
