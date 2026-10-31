---
title: Protein Structure Learner
type: game
updated: 2026-10-31
---

# Protein Structure Learner

A three.js game for learning protein structure by handling it. It goes "from two hinges to a virus" in 5 chapters and 29 stages. It is designed for a phone held upright, and it also works in landscape, on tablets and on computers.

## How to play

Open `index.html`. Everything is in this one file, so it needs no server and no network.

## The five chapters

| Chapter | Level of structure | What you do | Subjects |
|---|---|---|---|
| Chain | Primary and secondary | Move φ and ψ with a finger and explore the Ramachandran plot as a map | Alanine, glycine and proline peptides |
| Bond | What secondary structure is | Play DSSP: drag a C=O to an N–H, read the energy, distance and angle, tilt a bond until it fails, find the patterns, then assign real stretches | Myoglobin, GFP, YcaC, a homeodomain, protein G, T4 lysozyme, hemoglobin |
| Beat | Sequence to structure | Light up the residues that face the partner to find the rule, then read real sequences and call each one helix or strand | GCN4, a nanobody, 13 fragments of real proteins |
| Core | Tertiary | Find contacts and let a search fold the protein, measure knobs in holes and derive the packing rule, pay for a cavity, refill a core and test the rule against the lab, pair buried polar groups | A homeodomain, GCN4 core mutants, T4 lysozyme, GFP |
| Shell | Patches and quaternary | Rub out a patch, bet on real patch profiles, drop hot spots, zip charges, run double-mutant tests, then build shells contact by contact | Barnase–barstar, growth hormone receptor, hemoglobin, HIV protease, cholera toxin, ferritin, STNV |

## The science

Structures:

- All coordinates are real PDB data: 2HHB, 2ZTA, 1MEL, 1MBN, 1ENH, 1TEN, 1FNA, 1PGA, 2FHA, 1EMA, 1HSG, 3CHB, 2BUK, 1BRS, 1A22, 1GCM, 1GCL, 2LZM, 181L (benzene only, fitted onto 2LZM) and part of 1YAC. 1A2P and 1A19 were compared with 1BRS for the free against bound figure of about 0.5 Å.

Chain and Beat:

- The Ramachandran plot is computed with a hard-sphere test on the game's own atomic model. The contact distances are those of Ramakrishnan & Ramachandran (1965). The α region falls outside at ideal bond angles, so the test is relaxed by 0.15 Å for atom pairs next to a hinge.
- The buried positions in GCN4 are a and d of the heptad. Whether a strand residue points in or out is judged from the Cβ direction computed from the real backbone.
- The 13 fragments in the reading test are only those where the correct fold puts more oil on one face (hydrophobic moment, Eisenberg 1982).

Bond:

- `src/science/dssp.js` follows Kabsch & Sander (1983): E = 0.084 × 332 × (1/rON + 1/rCH − 1/rOH − 1/rCN) kcal/mol, a bond below −0.5, H placed 1.0 Å from N opposite the previous C=O. Like `mkdssp`, each N–H keeps its two best acceptors. It reads no φ or ψ for helices and sheets, though bends use Cα angles. Turns, helices (two turns in a row), bridges, ladders and bulges follow the paper, with its priority H, B, E, G, I, T, S. Modern `mkdssp` prefers π over α, and assigns polyproline II from φ and ψ, so a few residues differ from current DSSP output, mostly H against I.
- This energy has no water in it, and it is a line for calling something a bond. It is not the stability a bond provides (Pace et al. 2014).
- `tools/test_science.mjs` checks the myoglobin helices, the GFP strands, the three protein G ladders, the π helix in YcaC, the orientation dependence of the sum, and agreement with the depositors' records.

Core:

- Contacts are side-chain heavy atoms within 4.5 Å. Who touches whom uses `src/science/rigidfold.js`: helices are rigid pieces, and Monte Carlo annealing from random arrangements looks for one that meets the contacts, loop reach and no overlap. It is never shown the real arrangement. On 1ENH, over larger samples, the median on helix residues is near 4 Å from 8 true contacts, near 8 Å from 8 false pairs and near 11 Å from none. True contacts come within 5 Å about two runs in three, and sometimes the opposite topology, near 9 Å, satisfies every contact. The game keeps the best arrangement across hits, passes once all 9 true pairs are found, and its final false test uses the pairs furthest apart in the real fold.
- Knob packing angles are measured here on real coordinates, as the angle between the knob's Cα–Cβ bond and the Cα–Cα vector at the base of its hole. Natural GCN4 (2ZTA): a 27°, d 81°. Tetramer (1GCL): a 86°, d 28°. Trimer (1GCM): a 65°, d 46°. These match the parallel, perpendicular and acute classes of Harbury et al. (1993, 1994), though the cutoffs of 40° and 70° are this game's own.
- Natural GCN4 has a = M2, V9, N16, V23, V30, so the angle uses V9, N16 and V23. There is no crystal of a = Ile, d = Leu here, so natural GCN4 is drawn for it. That it is a dimer, and the a/d assignments of pII and pLI, come from reviews of Harbury 1993 (Lupas et al. 2017), not from its table. Other variants in that paper are left out because their table could not be read.
- T4 lysozyme, measured: L46A 2.7, L121A 2.7, L99A 5.0 kcal/mol; cavities 24 Å³ (L46A) and 150 Å³ (L99A); benzene raises Tm by 6 °C (Eriksson et al. 1992). The L121A cavity volume could not be checked, so the game does not state it.
- Repack uses Zamyatnin (1972) residue volumes at real sites and neighbours. The rule is our own: volume is shared between neighbours in proportion to contacts, a site fits within 13 Å³ if its shape class also matches, and the fold holds if total volume is within 80 Å³. The rule is built to return the wild type, so that a full fit means the natural core. It is not a measured model. The game then sets it against experiments it gets wrong: F153L is more stable than wild type because Phe 153 is strained (Eriksson et al. 1993), and V111F with F153L is additive (Hurley et al. 1992). Real cores are more forgiving (Axe et al. 1996; Gassner et al. 1996).

Shell:

- Buried area comes from Shrake–Rupley in `src/science/sasa.js`, run at build time. It gives 1566 Å² for barnase–barstar and 2616 Å² for hormone–receptor, both sides together.
- Non-polar share counts carbon and sulfur atoms by area, and is always shown beside the same share for the whole surface. The patch detector knows the real complex.
- Score the patch, `src/science/patch.js`: patches around every surface residue, in the spirit of Jones & Thornton (1997), each sized to that protein's interface (800 to 1800 Å² per side). Three similar measures are computed: non-polar share, planarity (RMS from the best plane) and protrusion (CX of Pintar et al. 2002). Their propensity and solvation scales are left out because the tables were not checked.
- Decoys are drawn at random from patches clear of the interface and of other known sites: the second receptor site of growth hormone, from 3HHR, and hemoglobin's α1β2 seam. Ferritin was dropped from this stage because its other contacts leave too few honest decoys, but it stays in the comparison table. The game reports each rule's score in that one draw and its mean over 500 fresh draws, against 1.25 of 5 for blind chance. No single property decides.
- Hot-spot ΔΔG values are measured (Clackson & Wells 1995; Clackson et al. 1998), read through SKEMPI 2.0 and converted with RT ln(Kd ratio) at 298 K. W104 and W169 are lower bounds. 1A22 numbers receptor residues 200 higher.
- Steering and Right partner use double-mutant coupling energies worked out by us from the Kd values in SKEMPI 2.0, all from Schreiber & Fersht (1995), not copied from their table. R59–D39 is left out because it comes from another reference. Couplings overlap and do not sum to the binding energy. Bands: at least 3 kcal/mol tied, 1 to 3 weakly coupled, under 1 independent. Distances are between the closest side-chain atoms. A difference under 0.4 kcal/mol between losing both and losing one is not counted.
- The pull in Steering is a plain Coulomb sum over K, R, D and E with a Debye factor and a dielectric of 80. It shows trends only. An attempt to turn it into on-rates missed measured values by about 100-fold, so the game shows no computed rate.
- The waters shown in Steering are crystal waters of 1BRS within 3.5 Å of polar atoms on both chains: 14 in the copy drawn, and 11 to 18 across the three complexes in the crystal.
- Shape complementarity is quoted from the literature, not computed.
- Symmetry, `src/science/symmetry.js`: one contact repeated gives only a closed ring. Computed from the real operators, any two kinds of contact in ferritin join all 24 copies and any two in STNV join all 60, and the remaining kind then forms by itself. That depends on where these axes lie, and two rotations do not always do this. It is geometry, not assembly order. Areas on the chips are per copy, summed over the faces of a contact.
- In Five, the dial is a demonstration: the real ring is at 72° with no rise, and the helix at other angles is drawn by the game.
- In Two, each bead sits at its true distance from the two-fold axis, and residues within 2.5 Å count as on it (T26 and G51).

## Rebuilding

```sh
# Put the PDB files in one folder, then build the data (including 1YAC and 181L)
node tools/build_data.mjs <folder of PDB files>

# Test the science code
node tools/test_science.mjs

# Build index.html (npx fetches esbuild)
node tools/build.mjs
```

There is no `node_modules` folder. three.js is included in `vendor/three/`.

## Folders

- `src/press.js`: the three-ink print engine, which every screen goes through
- `src/ribbon.js`: drawing of ribbons and space-filling models
- `src/peptide.js`: building a chain from φ and ψ, collisions, and hydrogen bonds for Chain
- `src/track.js`: the two rails of the Bond chapter
- `src/science/`: DSSP, surface area, patches, packing, the contact search, symmetry and electrostatics, with no browser code
- `src/chapters/`: the game for each chapter (`ppi.js`, `surface.js` and `shell.js` make up Shell)
- `src/stages.js`: stage definitions and explanations
- `tools/`: data generation, tests and the build

## Licenses and sources

three.js is MIT. The fonts (Dela Gothic One, Bricolage Grotesque) are SIL OFL. The structure data are wwPDB data under CC0. Measured binding data come from SKEMPI 2.0 and the papers it cites.
