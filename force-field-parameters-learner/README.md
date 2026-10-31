# Force-Field Parameters of Biomolecular Simulation Learner

A browser game that gives you the intuition of force-field development. For proteins, bonds and angles are in good shape, so they are not here. You work on the four terms that are harder: dihedrals, CMAP, partial charges and van der Waals. You choose parameters, compare with a reference, find what you broke somewhere else, and iterate. The game ends with the real development loop: finite runs, reweighting, a fit, and tests the fit never saw.

It is one self-contained `index.html`. It needs no network and works on phones in portrait, tablets and desktops.

## The plates

The home screen is the energy equation: each term is a button. **Bench notes**, also on the home screen, grows with the plates and ties each term to real force fields.

| Plate | Term | What you do | Third goal exposes |
|---|---|---|---|
| I Organ stops | Dihedrals | Pull n = 1, 2, 3 stops to fit a twist profile | The 1–4 term double-counts; the torsion is whatever is left |
| II A tenth of a kcal/mol | Dihedrals | Add a small ψ torsion to a 15-residue helix-former | Matching 300 K is not matching the melt; a second knob fits the curve with the wrong ΔH, because errors cancel |
| III What torsions cannot do | CMAP | Switch on harmonics, then drag a rectangle | f(φ) + g(ψ) cancels exactly on the corners; a coupled surface does not |
| IV Painting the map | CMAP | Paint a 24×24 map, unlock Boltzmann inversion | One map, two ensembles: fitting one exactly leaves the other wrong |
| V Charges from a field | Charges | Tap atoms, slide charges, then solve least squares | Buried charges wander; a RESP restraint trades a little fit for sanity |
| VI A dipole for two worlds | Charges | Raise a water charge until a live drop holds | The gas dipole lamp stays red |
| VII The salt bridge | Charges | Weaken an over-bound Arg–Asp pair | Scaling charges breaks hydration; NBFIX needs one number per pair |
| VIII A liquid from two numbers | vdW | Fit σ and ε to a live argon drop (the OPLS recipe) | The gas pair lamp goes red |
| IX The chain that collapses | vdW | Strengthen protein-water attraction | One knob can only split the difference between Rg and folded stability |
| X Protein, water, protein | vdW | Balance protein-protein against protein-water | Kd, B22, chain Rg and folded stability need both knobs |
| XI Force field or sampling? | Finale | Run replicas and decide why a state is missing | Count independent transitions, not steps |
| XII Metastable | Finale | Spend 8 runs: simulate, reweight, fit, simulate | Several sets fit; populations alone pass the sealed tests only some of the time |

Each plate has three goals, a live board of lamps, and a verdict from Reviewer 2. The finale ends with a parameter card and a mock paper listing your numbers and the references.

## Science notes and honest limits

Every physical readout comes from a calculation in the browser. Some motion is illustrative, such as the water around the salt bridge, which is placed from the current gap. All of it runs on reduced systems, and these are the limits of each.

**Torsions (I).** The fit is the true Fourier series. The white dots are the OPLS united-atom coefficients for butane (Jorgensen, Madura & Swenson 1984; TraPPE quotes the same constants) drawn as a total energy. They stand in for a quantum scan, and are labelled so. The 1–4 term uses OPLS united-atom CH3 values with a simple widening of the angles near syn, because rigid geometry gives an unphysical wall. The chain is drawn with hydrogens, but the energies are united-atom.

**Helix-coil (II).** Exact Lifson-Roig transfer matrix for Ac-(AAQAA)3-NH2, using Table 5 of Best & Hummer (2009), with its ΔH, ΔS and ΔCp for both w and v. With those rows the model gives 82.8, 1.9, 20.2 and 14.0% helix at 303 K for ff03, ff99SB, ff03\* and ff99SB\*; their simulations gave 82.7, 1.8, 18.8 and 14.2%. The start is the ff99SB row. The target is the Lifson-Roig prediction from experimental helix-coil parameters (Rohl & Baldwin 1997, as tabulated by Best & Hummer), which gives 16% at 300 K; NMR on this peptide gives about 20% (Shalongo et al. 1994). The ψ correction is their form, k[1 + cos(ψ − δ)], with δ = 105.4°, and their k = 0.1788 kcal/mol works out to 0.54 kT per residue between helix and coil. A further 0.1 in k moves the helix content from 16% to about 50%, which is the plate's title. Limits: a torsion shift is treated as purely enthalpic, and v stays at the ff99SB value. The second knob trades enthalpy for entropy at fixed w(300 K); it is a teaching device, so that the third goal needs understanding and not fine finger control.

**CMAP (III, IV).** Exact Boltzmann populations on a 96×96 grid, read from a 24×24 grid (15°, as in CMAP) by periodic Catmull-Rom bicubic interpolation, which is the same family as CMAP but not the identical spline. The surface and both targets are synthetic: basin shapes follow known alanine regions, and the weights are invented. Sums of torsions cannot produce the coupling, but in real force fields the nonbonded terms supply some of it, and ff99SB and ff14SB have no CMAP. Plate IV's mechanism is that one map must serve two ensembles. It is not the real CHARMM36 story: CHARMM36 kept an old αL correction after its van der Waals radii changed, and in an RS peptide 80% of conformations contained a left-handed helix (41% per residue). CHARMM36m cut that to 1.8% (5.5% per residue) with a change confined to that region, using a coil-library target, and paired it with stronger water hydrogens for disordered chains. The Karplus coefficients are from Vuister & Bax (1993).

**Charges (V).** Real constrained least squares and the real RESP hyperbolic restraint on every non-hydrogen atom (a in atomic units, b = 0.1), on about 2,450 points in four shells around N-methylacetamide built from standard geometry. The cis lamp is a true cis conformer (CA···CM 2.78 Å against 3.80 Å trans). The reference field is synthetic: hidden off-atom charges tuned to a 3.8 D dipole, not quantum chemistry. Hidden methyl sites are put there to produce the buried-charge effect, so its size is illustrative, and this field needs a restraint stronger than the published 0.0005 and 0.001 au to shrink the buried carbons.

**Liquid water (VI), argon (VIII).** Live molecular dynamics, 90 rigid three-site waters and 600 argon atoms, in a soft spherical wall with no periodic boundaries. Readings are noisy and small-system. Targets: argon 1.40 g/cm³ and 1.54 kcal/mol (from 161 kJ/kg). The water target of 9.2 kcal/mol is a reference for this 90-water drop, not an experimental value; bulk liquid is about 9.9 (ΔHvap 10.5 − RT), and a 90-water drop reads lower.

**Salt bridge (VII).** A one-dimensional potential of mean force for a teaching model, with Ka as a real integral over the contact pair and the osmotic coefficient from mass action. Two numbers are tied to the literature: stock Ka is set to 4.06 M⁻¹ (CHARMM27) and the target is 0.37 M⁻¹ (experiment), both from Debiec et al. (2014), Table 1. The published CHARMM36m shift of Rmin from 3.55 to 3.637 Å is made to close that gap by a fitted lever of 11.3, so the curve must not be read as atomic geometry. Piana et al. (2011) reported this pair about ten times too strong in CHARMM22; the figure is quoted here via Ahmed et al. (2018). CHARMM22\* reduced side-chain charges and CHARMM36m used NBFIX. Scaling all charges here is the blunt version. The Lys–Asp pair and its target are invented. Hydration here only tracks q²; hydration free energy is the standard real test of charges (FreeSolv).

**Disordered chain (IX).** An exact census of all 21,175,146,054 walks of 16 beads on a cubic lattice (`tools/enumerate_chain.c`), reweighted instantly. The count matches the known number of 15-step cubic self-avoiding walks. Each bead-bead contact costs two bead-water contacts. The live chains are Metropolis Monte Carlo on the same energy. Energies are invented teaching values, so the folding cost is large here and the γ does not transfer: Best et al. found folded proteins stayed reasonably stable at their 1.10.

**Protein-protein balance (X).** Two rigid bead proteins in a plane: 57,024 configurations of (r, position angle, turn angle), with water sites on each protein. The energy is stored term by term. The water sites follow hand-set "lost" and "held" rules, so they give a contact well and a one-water shoulder, not a deep second minimum and not a simulated solvent. In this model the ratio of the two strengths sets the complex and the absolute scale sets folded stability. Real fixes differ: Best et al. raised only protein-water. Two rotational degrees of freedom are missing, and Kd is a model number. B22 leaves out the native pose, so it reports nonspecific stickiness, in units of a hard-sphere reference. Targets come from a hidden parameter set.

**Sampling and the loop (XI, XII).** One 16-bead chain with a helix-like native spiral and a sheet misfold. `tools/enumerate_fold.c` tallies every conformation by six integers: contacts, native contacts, misfold contacts, backbone shape, charge contacts and buried water. U is a sum of terms in those integers (q² for the charges). The census is the referee, and the player never sees it until they ask. Runs are real Metropolis Monte Carlo with exactly the census energy, and their populations match it. Each run stores tallies in blocks. Between runs the player sees only MBAR reweighting of those stored samples, with block-jackknife errors and Kish effective sample size. A state that no run visited has no samples and cannot appear. MBAR needs no linearity: it needs the energies of stored configurations at new parameters, plus overlap. The sum-of-terms form only makes re-scoring cheap. The errors are a fixed-weight block jackknife: it ignores the error in the run free energies and runs about twice too wide when the chain mixes. It cannot see what a trapped run never reached, so an estimate that leans on a run that never crossed can be confidently wrong: midway between a stuck run and a free one the misfold reads about 4 ± 1.6% against an exact 7.3%. The plate shows the share of each estimate that comes from such runs, and warns. The Fit tool is Levenberg-Marquardt on that estimate, with a pull toward the start and a trust region on Neff. The fit may use 300 K populations, coil Rg, high-salt populations (charges ×0.8) and denaturant populations (protein-water ×1.15). The sealed tests, never fitted, are a charge-free mutant, a core mutant (protein-protein strength ×0.92) and the melting temperature, defined here as native and unfolded being equal. A 340 K data set was tried and removed: it added nothing, and it overlaps the melting test. Melting never failed in any fit we measured, so it is the weakest of the three tests. The sealed tests are sealed from the fit, not from the player: the referee can be called three times, and after the first call the report says so, and a pass counts as a retest.

Plate XI's runs are not seeded. Each chain was chosen so that its evidence holds on any run, and the tests check this over seeds: the trapped chain's replicas disagree, the absent chain (0.002% misfold, under the share with no energy at all) shows at most one arrival in hundreds of hops, and the rare chain shows at least five arrivals. An arrival is three samples in a row in one new state. A verdict needs both checks: a longer run, and a replica started in the misfold.

Over 8 seeds of the plate's own steps, populations alone passed the sealed tests 4 times, and adding salt and denaturant passed 8 times. So populations alone pass only some of the time, and the player may not meet a failure on any one play; the referee always shows a rival set that fits the 300 K populations and fails.

Limits: all targets come from one hidden parameter set. Lattice moves are not real dynamics, so dwell shows that barriers exist, not how long they last. Melting uses fixed energies with kT scaled, so it ignores temperature dependence of the water terms. Salt and denaturant are one-line stand-ins. Populations are exact for this model and are not predictions for any real protein. Even the sealed tests do not fix every parameter: a third rival set passes them all, and the tests record this. The real anchor for scale is T4 lysozyme L99A, whose excited state is 3% populated, 2.0 kcal/mol above the ground state (about 3.5 kT) with a lifetime near 1 ms (Mulder et al. 2001; Bouvignies et al. 2011).

## Build

Dependencies stay outside the project:

```
DEPS=$HOME/.cache/pchem-learner node build.mjs
```

`DEPS` is a folder holding `three`, `esbuild` and the `@fontsource` packages listed in `package.json`.

The two census tables are generated once and checked in:

```
cc -O3 -o /tmp/enum tools/enumerate_chain.c && /tmp/enum > src/physics/chain-table.js
cc -O3 -o /tmp/fold tools/enumerate_fold.c && /tmp/fold > /tmp/raw-fold.js
node tools/pack_fold.mjs /tmp/raw-fold.js > src/physics/fold-table.js
```

The second takes about ten minutes.

## Tests

```
node tools/test_physics.mjs
```

Checks of the screen-free code in `src/physics/`, about 100 in all. They cover the transfer matrix against brute force and against the published helix fractions, ESP recovering known charges, partition sums against direct loops, Monte Carlo against the census, MBAR against exact answers and against its own run, the three cases of Plate XI, and a scripted run of Plate XII: a stuck run with high Neff and a missing state, a low-overlap prediction that a new run proves wrong, and a multi-seed comparison of a populations-only fit with one that adds salt and denaturant. The loop tests go through the same `Project` class the plate uses, and Plate XI's verdict logic is tested on its own, including double taps.

## References

Abascal & Vega, J Chem Phys 123, 234505 (2005). Ahmed, Papaleo & Lindorff-Larsen, PeerJ 6, e4967 (2018). Bayly et al., J Phys Chem 97, 10269 (1993). Berendsen, Grigera & Straatsma, J Phys Chem 91, 6269 (1987). Best et al., JCTC 8, 3257 (2012). Best & Hummer, J Phys Chem B 113, 9004 (2009). Best, Zheng & Mittal, JCTC 10, 5113 (2014). Bouvignies et al., Nature 477, 111 (2011). Cheung, García & Onuchic, PNAS 99, 685 (2002). Debiec, Gronenborn & Chong, J Phys Chem B 118, 6561 (2014). Debiec et al., JCTC 12, 3926 (2016). Hornak et al., Proteins 65, 712 (2006). Huang et al., Nat Methods 14, 71 (2017). Izadi, Anandakrishnan & Onufriev, J Phys Chem Lett 5, 3863 (2014). Jorgensen, Madura & Swenson, J Am Chem Soc 106, 6638 (1984). Jorgensen, Maxwell & Tirado-Rives, J Am Chem Soc 118, 11225 (1996). Kovács et al., J Am Chem Soc 147, 17598 (2025). Lifson & Roig, J Chem Phys 34, 1963 (1961). Lindorff-Larsen et al., Proteins 78, 1950 (2010). Lopes et al., JCTC 9, 5430 (2013). MacKerell, Feig & Brooks, J Comput Chem 25, 1400 (2004). Maier et al., JCTC 11, 3696 (2015). Mobley & Guthrie, J Comput Aided Mol Des 28, 711 (2014). Mulder et al., Nat Struct Biol 8, 932 (2001). Noé et al., PNAS 106, 19011 (2009). Petrov & Zagrovic, PLoS Comput Biol 10, e1003638 (2014). Piana, Lindorff-Larsen & Shaw, Biophys J 100, L47 (2011). Piana et al., J Phys Chem B 119, 5113 (2015). Piana et al., JCTC 16, 2494 (2020). Ponder et al., J Phys Chem B 114, 2549 (2010). Robustelli, Piana & Shaw, PNAS 115, E4758 (2018). Rohl & Baldwin, Biochemistry 36, 8435 (1997). Shalongo, Dugad & Stellwagen, J Am Chem Soc 116, 8288 (1994). Shirts & Chodera, J Chem Phys 129, 124105 (2008). Stark, Andrews & Elcock, JCTC 9, 4176 (2013). Tian et al., JCTC 16, 528 (2020). Vuister & Bax, J Am Chem Soc 115, 7772 (1993). Wang, Martinez & Pande, J Phys Chem Lett 5, 1885 (2014). Wang et al., J Phys Chem B 121, 4023 (2017). Yoo & Aksimentiev, JCTC 12, 430 (2016) and Phys Chem Chem Phys 20, 8432 (2018).
