---
title: Protein Structure Learner
type: game
updated: 2026-11-01
---

# Protein Structure Learner

A three.js game for learning protein structure by handling it. It goes "from two hinges to a virus" in 5 chapters and 32 stages. It is designed for a phone held upright, and it also works in landscape, on tablets and on computers.

## How to play

Open `index.html`. Everything is in this one file, so it needs no server and no network.

## The five chapters

| Chapter | Level of structure | What you do | Subjects |
|---|---|---|---|
| Chain | Primary and secondary | Move φ and ψ with a finger and explore the Ramachandran plot as a map | Alanine, glycine and proline peptides |
| Bond | What secondary structure is | Play DSSP: drag a C=O to an N–H, read the energy, distance and angle, tilt a bond until it fails, find the patterns, then assign real stretches | Myoglobin, GFP, YcaC, a homeodomain, protein G, T4 lysozyme, hemoglobin |
| Beat | Sequence to structure | Light up the residues that face the partner to find the rule, then read real sequences and call each one helix or strand | GCN4, a nanobody, 13 fragments of real proteins |
| Core | Tertiary | Pull a real protein until bonds snap and let it spring back, pull a side chain out of its core, predict which mutation hurts most and meet the measured value, find contacts and let a search fold the protein, measure knobs in holes and derive the packing rule, pay for a cavity, refill a core and test the rule against the lab, pair buried polar groups | A homeodomain, protein G, GCN4 core mutants, T4 lysozyme, GFP |
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

Core, the Pull stages (Snap, Squish, Read it):

- `src/science/pull.js` simulates all heavy atoms and polar hydrogens of 1ENH (590 particles) and 1PGA (514) on the phone. Each frame is 12 Langevin steps. Time is not real and this is not a folding pathway: every atom has the same mass so that the step can be large, so one second of play is on the order of ten picoseconds of motion, and relaxation that takes a real protein nanoseconds takes about a second here because the memory term below pulls hard. The stationary distribution is still that of the model at 300 K, which is what lets occupancies be compared with MD.
- Forces, with nothing that lists which atoms should bond. Stiff springs on bonds and angles, and rigid peptide, ring and amide planes, all from the crystal. Generic threefold or twofold side-chain torsions that know no native angle. A free-energy map of φ and ψ from real alanine dipeptide MD, which keeps peptide planes from flipping and knows no folded protein: without it helices fell into i to i+3 and C5 patterns that C-alpha memory cannot see. Lennard-Jones contacts. Coulomb with ff14SB charges, non-polar hydrogens merged, and a dielectric of 1.6 r. EEF1 solvent exclusion on every atom, so that oil has no partner in it and burying a polar atom costs energy.
- Pieces that are this game's own, not published models: charged side chains keep 55% of their net charge, a milder form of EEF1's neutralised groups. Charge pairs are screened by how exposed each atom is, down to 35% for exposed side chains, 60% for charged groups and 70% for backbone, in the spirit of Generalized Born. This screening has no gradient of its own: EEF1 carries the cost of burial. ff14SB charges and EEF1 were never parameterised to work together. These numbers, and the contact depth of 0.15 kcal/mol, were chosen by comparing with the native MD below, so the native agreement is a fit, not a test.
- The memory is the unreal part, labelled Teaching model on screen: a strong Gō-type memory of the C-alpha contacts, one Gaussian well 5 kcal/mol deep and 4 Å wide on every C-alpha pair closer than 12 Å in the crystal and at least 3 apart in sequence. That is 425 wells on 1ENH and 525 on 1PGA, 2125 and 2625 kcal/mol in all, so it is not weak. It is stronger than the throwaway experiment's 3 kcal/mol and 6 Å, which let the fold drift about twice as far as MD. The board shows Memory so far beside Bonds, in kcal/mol against rest. Over 40 plays, at the moment Let go appears, Snap adds (mean ± SE) memory 27.2 ± 1.5, contacts 15.3 ± 1.7, covalent 7.3 ± 3.3, charges 1.0 ± 2.7 and water −7.5 ± 1.0, and the memory is the largest term in 26 of the 40. The strand in Squish adds 17.8 ± 1.2, 18.9 ± 1.8, 4.2 ± 2.5, 7.7 ± 2.8 and −9.9 ± 0.8, and the memory is largest in 8 of 40, so there the memory and contacts pay alike, and only Snap's end sheet says the memory paid mostly. F30 near its reading adds memory 20.7 ± 0.8, contacts 20.1 ± 4.2, covalent 16.6 ± 4.0, charges −7.5 ± 5.8 and water −1.4 ± 1.7. Those five terms hold about half of the hand's work (84 and 55 kcal/mol). The rest is friction. One named bond is worth −1.9 kcal/mol of Coulomb energy between its peptide groups, and 0 once broken, so three snapped bonds come to about +6. A Contacts chip was tried and dropped: at rest a 1 s mean strays by 8 and the baseline a player could have by 12 to 16, against a signal of 15 to 20, where the memory strays by 2 to 3. So the memory says what the pull cost, and the chips say what holds this place.
- What returns the chain: the memory sets the register, and charges tighten the bond by about 0.5 Å (H...A about 2.2 Å with them, 2.7 to 2.8 Å without). Without the memory a big pull does not return (C-alpha 4.2 Å after release against 0.8 Å with it). After a small pull the C-alpha trace does (1.0 Å), but the bonds lag: under the board's rule 3 of 12 plays had all back in 8 s and 9 of 12 in 30 s on 1ENH, and 11 of 12 and 12 of 12 on 1PGA. Side chains have no memory at all. The φψ map already holds local electrostatics and contacts, so it counts them twice with the same terms in the model, and glycine feels a quarter of it. That double count is left in and stated here: it keeps peptide planes from flipping. Real water is the test of all this, below.
- The hand is a spring capped at 45 kcal/mol/Å, about 3100 pN and far above real unfolding forces, balanced so that it neither carries nor turns the whole protein. The cap is what keeps play recoverable. With the finger at the full reach of a phone, 32 Å, all bonds that snapped returned within 7 s in 95% of pulls at a helix end and 100% at a strand edge, against 19% and 44% with a cap of 150. Over 64 grips covering both proteins, in random directions, 4 s after release C-alpha is within 0.02 Å of an unpulled control on average, and backbone bonds kept are 0.85 against 0.86 for 1ENH and 0.90 against 0.89 for 1PGA. After 400 rapid random grabs with little rest, about 11 minutes of abuse, no run went unstable, and after 10 s of rest the C-alphas sat 1.1 Å from the crystal with 31 and 24 backbone bonds.
- The board shows a bond only if it is formed at least 60% of the time in long resting runs of this model (`tools/rest_table.mjs`, 8 seeds of 6 s, stored in `src/data/pull-rest.json`, since a stage cannot spend seconds measuring this at start-up), held over 70% of the time in real-water MD, and the independent runs agree on that within 0.4. So K55–N51, 0.48 at rest here against 0.73 in MD, is off the board. A bond is judged by the rule itself, H...A under 2.5 Å with the angle over 120°. It snaps only while the hand is gaining ground: the grip has moved at least 1.5 Å, it has passed its furthest point by 0.3 Å within the last 0.75 s, and the rule has failed for 6 checks in a row with H...A beyond 3 Å. So a finger that stops scores almost nothing more: 1 snap in 240 s of a finger that never moved on 1ENH, and at most 2 after a 2.4 Å nudge and a 30 s wait. It counts as back when, over 18 checks, the rule holds for at least 50% of the time and for at least 80% of that bond's resting occupancy, with H...A averaging under 2.3 Å. A donor that settles on another acceptor shows as new, unless it visits that acceptor at least 10% of the time at rest. This test fails on purpose without charges: over 6 plays, all bonds came back in 6 of 6 and 6 of 6 with the full model, 0 of 6 and 0 of 6 with charges off, 0 of 6 and 0 of 6 with the memory alone, and 6 of 6 and 6 of 6 with EEF1 off, so nothing here claims water does this. A player in six finger styles gets all back in 170 of 180 plays in Snap and 180 of 180 on the strand in Squish. The bonds that stay off are the soft ones at the helix end, A54–Q50 and N51–I47, and their chip stays pink, or reads new when that is true.
- Buried, Half buried or In water comes from crowding, heavy neighbours within 6.5 Å, which tracks real solvent accessibility with r = −0.90 on both proteins. The chip for oil counts the residues whose oily carbons come within 5 Å of this side chain's carbons, for every residue, since Lys and Thr have aliphatic parts too. In Snap and Squish the salt-bridge chip is live, by residue pair within 4 Å, so a pull that breaks the pair takes it away. In Read it the chips hold still and come from real water, under that tag, because the model forms D47–K50 only 29% of the time at rest against 0.94 in MD.

Real-water MD, the test of the model:

- `tools/md_native.py`: ff14SB, TIP3P, PME, HMR at 1.5 amu, 4 fs, 300 K, 1 bar, 0.15 M NaCl, a truncated octahedron with 1.0 nm of padding, OpenMM 8.6.1. Three independent runs of each protein from the crystal, 5.8 ns each with the first 1 ns dropped, so 29 ns analysed. Termini are charged. 1ENH lacks OXT, which is placed by geometry. Neither protein has His or a disulfide.
- The folds held: C-alpha without five residues at each end is 0.52 Å from the crystal for 1ENH and 0.79 Å for 1PGA. 1ENH's chain ends are floppy, which takes all its C-alphas to 1.58 Å. In the game the memory pins those ends (0.72 Å), which real water does not.
- Error, from the spread between independent runs. Backbone bonds are stable: median SD between runs 0.02 on both proteins, 7% of them over 0.1, first half against second half r = 0.99, and pairs of runs r = 0.96 to 0.99. Side-chain bonds are not converged: median SD 0.08 and 0.11, half of 1PGA's spread by more than 0.1, and two pairs of 1PGA runs correlate at only r = 0.17 and 0.19. Errors from 1 ns blocks within a run agree with the run spread for backbone bonds, and understate it 1.5 times for 1PGA side chains. So these runs are long enough for backbone bonds and too short for side chains, and the game's weak side-chain match on 1PGA cannot really be judged, because MD does not agree with itself much better.

| At rest | 1ENH MD | 1ENH game | 1PGA MD | 1PGA game |
|---|---|---|---|---|
| Backbone H-bonds at any instant | 31.2 | 31.1 | 33.9 | 32.1 |
| Side-chain H-bonds | 20.7 | 18.6 | 16.5 | 17.1 |
| Oil contacts | 71 | 97 | 97 | 102 |
| Backbone bonds kept, two windows 1.3 ns or 4 s apart | 0.98 | 0.93 | 0.98 | 0.97 |

- Bond by bond, game against MD, these are fits, since the native MD chose a few parameters: backbone occupancy r = 0.94 and 0.93 (rank 0.84 and 0.82), salt bridges r = 0.88 and 0.56, side-chain bonds r = 0.72 and 0.35.
- Pull and release, `tools/md_pull.py`, with no memory and not used for any tuning, so this is a test. The same atoms as the game's grip, on a stiff spring of 10 kcal/mol/Å² against the far C-alphas, moved about 5 to 6 Å in 200 ps at peak forces of 1024 to 1572 pN, held 100 ps and released for 1 ns. The game's grip travels the same distance. The tool `tools/compare_md.mjs` makes every game number here.

| Grip | Runs | Backbone bonds broken, MD | Same in game | Back with same partner, MD by run | Game | Oil total at full stretch, MD | Game |
|---|---|---|---|---|---|---|---|
| 1ENH helix 3 end, R53 | 2 | 6.0 | 5.0 | 4/7, 5/5 | 95% | 0.85 | 0.98 |
| 1ENH helix 1, L16 | 2 | 6.5 | 5.1 | 7/7, 6/6 | 98% | 0.97 | 0.92 |
| 1ENH helix 3 middle, I45 | 3 | 4.0 | 4.9 | 4/4, 4/4, 1/4 | 100% | 0.61 | 1.01 |
| 1PGA β1–β2 turn, L12 | 3 | 5.0 | 2.5 | 2/4, 0/5, 2/6 | 85% | 0.92 | 0.95 |
| 1PGA β3–β4 turn, D47 | 3 | 4.3 | 3.6 | 3/3, 5/5, 5/5 | 95% | 0.68 | 0.89 |
| 1PGA F30 side chain | 3 | 4.3 | 4.1 | 0/3, 5/5, 0/5 | 100% | 0.78 | 0.75 |

- Bonds in real water, with no memory at all. Over 23 pull runs, 77 of 112 broken backbone bonds were back with the same partner 1 ns after release, with a 95% interval of 0.55 to 0.82 by run, and all came back in 11 runs. The helix end in Snap gives 20 of 28 in 5 runs, interval 0.48 to 0.93, and helices together 42 of 53, interval 0.61 to 0.95. The β3–β4 turn gives 13 of 13. The strand edge in Squish is worse: T16 gives 15 of 23, L12 gives 7 of 23, and together that is 22 of 46 over 10 runs, interval 0.30 to 0.68, with every bond back in only 2 runs. Water depends on the place. In 1PGA pulls that saved the water, a water sits on a broken N-H over half the time for 11 of 13 bonds, against 0 to 5% before. At the 1ENH helix end that holds for 2 of 5, and the others shift to the next carbonyl, as K52 to F49 and R53 to Q50, or stay unwound. So Snap names the carbonyl shift and only Squish names water. The baseline matters little: taking steady bonds from the native runs after the first 1 ns, where the tallies above take the last 200 ps before each pull, gives 82 of 122 against 77 of 112, 22 of 34 against 20 of 28 at the helix end, and 22 of 45 against 22 of 46 at the strand edge. The strong memory brings back more than real water does.
- The core in real water: with F30 held about 6 Å out, heavy atoms within 4.5 Å of where the ring sat, the ring included, fall from 12.4 to 9.5, with carbon 4.3 to 7.3 and N/O unchanged near 2.2, and 0 to 0.3 waters, and it stays about 3 short for the 100 ps hold and beyond. The space fills mostly with L5, then K4 and F52. In the game the place is followed by a fit on C-alphas far from F30, the ring leaves along the line the MD pull took and stops about 6 Å out, and past the first 3 Å it slides at one speed, like the MD pull. That pull ran at 3 m/s, so a slow finger stands in for nothing real: a much slower pull could fill the hole in water as well, and that has not been run. The board says Pulled at the MD speed while it slides. Hole is one plain mean, over the half second after the ring arrives, and a hole counts when it is at least 1 atom under rest. It reads 12.8 at rest and 10.8 on arrival, with carbon about 7 and N/O about 3.5. The same mean with no pull at all reads 0.5 above rest, with an SD of about 1, and passes the rule in 0 of 12, against 9 of 12 with the pull. An earlier version read the lowest value over a moving window and froze the bar, and about 1 atom of its 3 short was that selection. The reading does not measure forces: it falls mainly because the ring has left, and with charges off it reads 10.3, with memory off 11.8, with EEF1 off 12.8, and with the memory alone 10.1. After the reading the bar stays live and fills to about 12 within a second, and the board says Game fills in 1 s; real water does not. At about 10 ps to a second of play that is over 60 times too fast. After release the count passes 16, which is less of a fault: real water reads 14 to 15 there. F30A costs 3.0 kcal/mol, the same lesson as Cavity. F30 was home in 7 of 9 runs within 1 ns (0.4 to 0.6 Å), counting 6 later runs, and the 2 that stayed out sit about 30 to 40° off in χ2, which looks like a kinetic trap. That rate rests on few runs. The game calls home the first time a half-second mean falls under 1 Å, and this model rests near 0.5 Å. It reaches that in 16 of 16 pulls, and without the memory in 1 of 16. That is a first passage: in 4 of 16 pulls the mean rose past 1.3 Å within the next second, and at 11 s it lay between 0.5 and 2.0 Å. Waits for a return run in model time.
- The angle of a contact, the reason the Squish plot exists. One value per contact, with the same filters on both sides (residues at least 3 apart), counted by equal shares of the sphere so that an even spread reads flat and nothing is blown up near 180°. On 1PGA N–H...O has a mean of 154° and an SD of 15°, and X–C...C on the closest carbon pair of two oily residues, X a bonded heavy atom, has 114° and 25°. 1ENH gives 153° and 16°, and 119° and 25°. The H-bond uses 18 to 19% of the sphere and oil 62 to 66%. This replaces a distance plot that compared unlike quantities, so `tools/md_angles.py` keeps the controls beside the result. Random free spots at the contact distance, with the partner residue out and one rule on both sides, give oil 113° and 28°, and an H-bond 131° to 134° and 19° to 20°. Oil lies 0.08 to 0.10 nats from that null and the H-bond 0.63 to 0.87, so oil takes the angles sterics allow and an H-bond does not. Sterics do push N–H towards straight, which is why the null is not flat. One crystal frame holds the same contrast (12 to 13% against 35 to 44%), so this is geometry and the plot says nothing about motion. Shuffled vectors fill the sphere on both sides (98 to 100%). Holding all those filters, the result stands against residue separation of 2, 3 or 4, cutoffs of 2.2 to 3 Å and 4 to 5 Å, buried residues only, and side-chain H-bonds. The oil curve is only as flat as its X allows: measured from the side-chain centre or the C-alpha, its bins vary by up to 5 times, against 100 for the H-bond, and it still uses 56 to 69% of the sphere. Next-closest pairs are flatter (75 to 89%). An earlier version here read oil partners as swapping, and then read a flat shelf in distance as softness. Both were wrong: retention over time follows the cutoff, the shelf also appears in one crystal frame, and the closest C...C of a residue pair has a sharp peak and a valley just as H...O does. Oil does have a contact distance. It does not have a contact angle.
- Where the game departs from real water, and the note says so: its bonds come back more reliably, above all at the strand edge. Its oil contacts are too many on 1ENH (97 against 71). It holds the core too well at full stretch at I45 and D47 (0.89 to 1.01 against 0.61 to 0.68). Its memory pins the floppy N-terminal arm of 1ENH. Its pocket is shallower on arrival and fills far too fast. On 1ENH the oil contacts are not converged in MD (first half against second r = 0.79 to 0.89, 1PGA 0.95 to 0.98), the runs share one crystal start so their spread is a lower bound on error, and each site has 2 to 5 runs. The rates by site therefore rest on few runs.
- Tags on the board: Teaching model on everything the simulation does, Real-water MD on the percentages and the angle curves, Real data on the measured stabilities. In Read it the bond, salt-bridge and cap chips come from real-water MD by residue pair, and Buried and the oil count from the model.

Measured stability, used in Squish and Read it:

- Nisthal, Wang, Ary and Mayo (PNAS 2019): 935 single mutants of protein G B1 by Trp fluorescence over a 24-point GdmCl gradient, in sodium phosphate at pH 6.5. The paper does not state the temperature. The gene carries an N-terminal His6 tag, with minimal effect on stability by their report, and the structure they use is 1PGA. Their reference sequence has T at position 2, as in 1PGA. T2Q, used in much other work on this domain, is one of the variants, at +0.34.
- ΔΔG is the mean m-value times the difference in Cm. **Their sign: stabilising is positive, destabilising is negative.** This game's Stability lost is the negative of that, so a loss reads as a positive number, like the T4 lysozyme values in Cavity. Mutations at W43, and to Cys or Trp, were not made.
- 105 of the 935 failed their two-state checks through poor stability, an intermediate or no expression, and the paper gives them a placeholder of −4 kcal/mol. The game calls these unstable and never shows the −4 as a measurement. Wild-type ΔG is near 4 kcal/mol, by T2Q's values, which is why −4 is about the limit.
- ProtaBank itself refused connections, so the numbers come from the raw export of study gwoS2haU3 kept in the MAVE-NN repository. That copy agrees with the paper on 935 variants, 105 qualitative, 830 quantitative, a median of 0.05 and the sensitive positions 3, 5, 26, 30, 41, 45, 52 and 54. Two figures do not match: the interquartile range here is 1.11 against 1.0 in the paper, and the paper's 3%, 68% and 29% come out only if the qualitative variants are included with a band of ±1 kcal/mol, where the paper appears to apply them to the quantitative set. All 27 values quoted in `src/stages.js` were checked against this file.
- Read it uses rounds where one mutation stands clear of the rest, by at least 0.9 kcal/mol, which is more than the largest scatter among them (0.52, for Y33A). Burial explains about 40% of the cost across 48 alanine mutants (R² 0.41 for accessibility, 0.44 for crowding), so the sheet says about half. The rounds are built on purpose so that letters give nothing: over every deal of 5 rounds with 4 to pass, a blind guess passes 1.6%, oil letters first 3.6%, the biggest letter 2.0%, aromatics first 4.0%, hydrophobicity 0.7%, and the best letter order fitted to this very deck under 10%. Burial alone passes 30%. Reading the whole board, turn cap first, then Buried, then Half buried, then the oil count, passes 92% of deals on average over 24 sittings (60 to 100%), and is right on about 86% of rounds. That figure comes from the deck and is no measure of skill. On random sets of these 48 mutants with the same clearance, the full board picks right 85% of the time and passes 83% of deals, burial alone 77% and 67%, the oil count 81% and 75%, and oil letters 66% and 45%. The board does not reach 100% here either: T53 sits among T18 and T16, all Half buried, and the oil count points the wrong way, so a careful reader loses that round 5 times in 6, and Y33 reads right 63% of the time. Y33 and T51 are each an answer in one round and a decoy in another, so names cannot simply be learned. The chips are read by residue pair, so a carboxylate's two oxygens count once. D46 and D47 read differently: D46 caps a turn, by the backbone N-H of A48 and T49 (0.46 and 0.43), and D47 holds K50 in a salt bridge (0.94). Turn cap fits only D22 and D46 in this protein, and in 1ENH the same rule picks N-caps at S9, T27 and N41 and also N23, though the cost is known only for the two here: N37 holds Y33's C=O at a helix end at 0.98 and costs nothing, I6 reads Half buried and costs 1.3, and T55 and T49 cost 0.6 to 0.7 in water. The M1 amine is left out of the chips, because it is charged in MD and tagged in the measured protein. A gain under 0.6 reads about 0: T44A is left out for that reason, and T11A and V29A also disagree between datasets.
- Oil for oil, measured. At buried oil positions, 51% of 45 oil swaps stay within 1 kcal/mol, leaving out A26 and swaps to Ala, with a median of −0.88, and 11% of 100 polar swaps do. Over all 58 oil swaps it is 40% and −1.65. So oil is tolerated about five times as often as polar, and half of oil swaps still cost over 1 kcal/mol. The end sheet shows every oily swap at both phenylalanines. F30: Y gains 0.9, L costs 0.5, M 1.7, V 2.5, A 3.0, and I is unstable. F52: I costs 0.2, Y 0.3, L 2.5, M 2.7, V 3.0, and A is unstable. Unstable includes variants with an intermediate or no expression. T44A is left out of the rounds: its sign differs between datasets. D47A costs nothing in this assay, but the assay runs near 2 M guanidinium, which masks charges (Monera et al. 1994), and D47A also removes a charge next to D46, with no double-mutant cycle, so it does not price the salt bridge.



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

The Pull stages add these steps. They need OpenMM, with mdtraj for the analysis, and are not part of a normal rebuild, because their results are stored in `src/data/`.

```sh
# The table of atom classes and charges, from PLUMED's EEFSolv.cpp and OpenMM's ff14SB file
python tools/grab_params.py EEFSolv.cpp src/data/grab-params.json
# The backbone map, from the reweighted frames of the Boltz game's alanine dipeptide MD
python tools/rama_fes.py frames-1.txt frames-2.txt frames-3.txt src/data/grab-params.json

# Real-water MD. Run in one folder. Hours on one GPU
python tools/md_native.py prep 1ENH.pdb enh
python tools/md_native.py prep 1PGA.pdb gb1
python tools/md_native.py run enh 1 40 OpenCL      # runs 1 to 3 of each protein
python tools/md_pull.py enh 3 53 bb 6 1 OpenCL     # site, grip, distance in A, replicate

# Analysis, the data for the board, and the comparison with the game
python tools/md_analyse.py enh 3 1 enh-1.dcd enh-2.dcd enh-3.dcd > enh-md.json
python tools/md_analyse.py gb1 1 1 gb1-1.dcd gb1-2.dcd gb1-3.dcd > gb1-md.json
python tools/md_pull_analyse.py enh 3 53bb enh-pull-53bb-*.dcd > pull-enh-53bb.json
python tools/md_board.py enh 3 enh-*.dcd > enh-board.json
python tools/md_board.py gb1 1 gb1-*.dcd > gb1-board.json
python tools/md_angles.py <folder of runs> > angles.json
node tools/md_collect.mjs enh-md.json gb1-md.json src/data/pull-md.json enh-board.json gb1-board.json angles.json
node tools/rest_table.mjs > src/data/pull-rest.json
python tools/nisthal_values.py nisthal_raw.csv gb1-protein.pdb > tools/nisthal-values.json
node tools/compare_md.mjs enh-md.json gb1-md.json <folder of pull-*.json> > compare.json
```

`tools/md-results.json` keeps that comparison without its salt-bridge lists, and `tools/test_science.mjs` reads it, so a change of model or data shows up as a failed test.

There is no `node_modules` folder. three.js is included in `vendor/three/`.

## Music

A small bossa for vibraphone, keys, double bass and rim click in `src/music.js`, in C major around D, so the game's D minor pentatonic chimes always fit over it. The band sits out during the Beat chapter, which makes its own music.

## Folders

- `src/press.js`: the three-ink print engine, which every screen goes through
- `src/ribbon.js`: drawing of ribbons and space-filling models
- `src/peptide.js`: building a chain from φ and ψ, collisions, and hydrogen bonds for Chain
- `src/track.js`: the two rails of the Bond chapter
- `src/science/`: DSSP, surface area, patches, packing, the contact search, symmetry, electrostatics and the pullable protein (`pull.js`), with no browser code
- `src/chapters/`: the game for each chapter (`ppi.js`, `surface.js` and `shell.js` make up Shell, and `pull.js` holds the first three stages of Core)
- `src/stages.js`: stage definitions and explanations
- `tools/`: data generation, tests and the build

## Licenses and sources

three.js is MIT. The fonts (Dela Gothic One, Bricolage Grotesque) are SIL OFL. The structure data are wwPDB data under CC0. Measured binding data come from SKEMPI 2.0 and the papers it cites.

For the Pull stages:

| What | Source | Terms |
|---|---|---|
| Solvation parameters and atom classes, in `src/data/grab-params.json` | PLUMED EEFSolv table (EEF1-SB, Bottaro et al. 2013), after Lazaridis & Karplus 1999, read from `src/colvar/EEFSolv.cpp` of PLUMED, which carries the all-heavy-atom set | Published values. PLUMED's code is LGPL-3 and no code of it is used here |
| Partial charges, in the same file | Amber ff14SB (Maier et al. 2015), as shipped with OpenMM 8.6.1, with non-polar hydrogens merged | Published values, distributed with OpenMM |
| Backbone map, in the same file | Alanine dipeptide MD made for the Boltz game in this repository, `diffusion-model-and-boltz-learner/tools/md_alanine.py` | This repository's licence |
| Real-water MD occupancies, angle curves and side-chain ties, in `src/data/pull-md.json` | Made for this game with `tools/md_native.py`, `tools/md_pull.py`, `tools/md_board.py` and `tools/md_angles.py` | This repository's licence |
| Measured ΔΔG values, in `src/stages.js` | Nisthal, Wang, Ary & Mayo, PNAS 2019, 116:16367, deposited in ProtaBank as gwoS2haU3 | Measured numbers are quoted with credit, and `tools/nisthal-values.json` holds the few the tests check. The paper is under the PNAS licence. ProtaBank itself refused connections from here, so its terms could not be read, and the values were taken from the raw ProtaBank export kept in the MAVE-NN repository (`jbkinney/mavenn`, MIT), checked against the paper as described above. Ask before reusing more of the table |
