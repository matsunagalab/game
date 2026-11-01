---
title: Diffusion model and Boltz-1/Boltz-2 learner
type: game
updated: 2026-11-01
---

# Diffusion model and Boltz-1/Boltz-2 learner

A three.js game for students who know basic protein structure and no machine learning. In nine chapters you work through diffusion models by doing the computation on real data: real residues, a real neural network trained in your browser, real structures, and a real molecular-dynamics reference. The world is coloured ink in clear water.

This game does not run Boltz. Nothing in it is Boltz. Chapters 6 to 9 use stored records of real Boltz-2 runs of one protein, and those are tagged wherever they appear.

## How to play

Open `index.html`. Everything is in this one file, so it needs no server and no network. It is designed for a phone held upright and also works on tablets and computers.

## Chapters

Chapters 1, 4 and 9 are puzzles, a pilot for the rest, and their boards are real 3D proteins. Each has one task always in view, done by dragging on the board itself, with three levels that move on by themselves. The third level is a new real case with less help. Nothing is read between moves: the board answers, the end sheet states the principle in a sentence or two, and the detail is in the chapter note, which is optional.

The other six chapters still leave one principle to explain in your own words, and end with a new case. The first drop is for doing the computation, the second for a result that takes some thought, and the third for getting the new case right first time, answer and reason.

| # | Chapter | You do | The principle |
|---|---|---|---|
| 1 | Making new from old | Drag the width of a model that adds noise to stored structures of real ubiquitin, score it on conformers it never saw, do it again with 4 stored, then on adenylate kinase with the score hidden | What a generative model is, why it is judged on unseen structures, and why noise on copies cannot hold chemistry |
| 2 | Dissolve it | Add real Gaussian noise, find where each peak of the density dies, bend the noise schedule, read Boltz-2's real one | Forward diffusion, scale, the schedule |
| 3 | The best guess | Drag a noisy point over the exact posterior, find a guess in empty water, test Tweedie's formula by finite differences, follow the score field | The denoiser, the posterior, the score |
| 4 | Run it backward | Set a sampler's stops until real ubiquitin lands with its 39 conformers at even rates, then hit the open share of adenylate kinase with its bars even on a budget of denoiser calls, spending spare calls on new stops or Heun's second looks, then again under fresh noise the size of Boltz-2's γ₀ | Samplers, what a call buys, why frequencies break before structures |
| 5 | Train a network in your hand | Train a real network with live loss, try three noise diets, beat the exact formula on unseen residues from only 100 examples | Training, loss, why networks generalise and the ideal denoiser copies |
| 6 | From two numbers to thousands | Dissolve and rebuild ubiquitin in all 1,803 coordinates, measure equivariance against the number of orientations, compare the plain mean over rotations with real Boltz-2, align by hand and by Kabsch, find where a chiral centre loses its hand | Rotation, alignment, chirality, hallucination |
| 7 | Same noise, different answer | Send one noise to different islands by residue type, test the guidance identity, open and close real adenylate kinase, predict a share, scrub a real Boltz-2 run | Conditioning, the trunk, why the first guess can be so good |
| 8 | What Boltz added | Run the recipe of Boltz-steering on the map in four modes against an exact target and tune it, compute a confidence score, see what a Pearson R buys, read the limits | Boltz-1, Boltz-1x, Boltz-2, affinity with its limits |
| 9 | Is it the Boltzmann distribution? | Drag one dot in the plane of η and γ₀ until sampled chains of adenylate kinase match a share we set, guess what each knob does to a rare region of the real MD reference on the alanine dipeptide molecule, then predict the exact run on Boltz-2's schedule | Sample frequencies are not populations unless checked |

## What is real and what is not

Every screen carries one or more of five tags.

| Tag | Meaning |
|---|---|
| Real data | Taken from a database, such as PDB coordinates, or our own MD trajectory |
| Real Boltz output | A stored record of real Boltz-2 runs of one protein |
| Computed here | Calculated live on your device |
| Teaching model | A small stand-in, labelled as such, that shows the shape of an idea but is not Boltz |
| From the papers | A statement about AlphaFold3, Boltz or BioEmu, taken from the literature, with the source in the chapter note |

### Real computations on real data, live

- The exact denoiser of Karras et al. 2022, Eq. 57, over 8,000 real residues (chapters 2 and 3), conditional versions for glycine, proline and alanine (chapter 7), and over MD frames (chapter 9). Over real structures in one frame in chapter 4, where noise outside their span cannot change the weights, so a run works on 38 numbers for ubiquitin and 16 for the kinase set, exactly, and a phone can run thousands of chains. Moved droplets use a grid of the exact field, with a mean error under 2% of σ, tested in `tools/test.mjs`. Below 5° the sum is exact over neighbours, except on chapter 9's board, which stays on the 5° grid so that it can follow a finger. That leaves the region shares unchanged, also tested.
- Tweedie's formula, checked live by finite differences of the real log-density.
- A kernel density on real structures in chapter 1, with its log density on hidden structures, in bits per atom.
- Euler, Heun, churn (Karras et al. Algorithms 1 and 2) and AlphaFold3's Algorithm 18. In chapter 4 the stops are placed by hand, and each step is Euler or Heun as the player chose.
- A real neural network: three layers of 48 units, 5,666 parameters, Adam, trained on the device.
- Kabsch superposition, mirror distances, Rg, the plain posterior mean over 4,000 random orientations, and the posterior for a hand with rotation integrated over 8,000 random rotations.
- An exact two-state run of Algorithm 18 on Boltz-2's schedule in Å, 200 steps, on the line between two real chains of adenylate kinase, with whole chains in all 642 coordinates as members of the same run, and the odds to a fitted power. This is this game's own calculation, not a published result. It leaves out centring, random rotation and Boltz's alignment.
- Feynman-Kac steering, by the recipe of Boltz-1's Algorithm 2 and `sample()` in `modules/diffusionv2.py`, on the map, against an exact known target.

### Teaching models

Each of these carries the Teaching model tag on screen.

- **Noise on copies** (chapter 1). A real generative model, and the blurred data a diffusion model passes through, but not how one is built. It teaches the test, not the machinery.
- **Exact fields on a few real structures in one frame** (chapters 1, 4, 9). There is no rotation. An exact field over a few structures can only give those structures back. Chapter 4 does not use the best-rotation denoiser, because it bends the shares of states, as below.
- **Two real chains as a mixture** (chapter 9). Closed and open adenylate kinase, Gaussians of width 0.3 Å, with a share we set. This is how a protein gets a known share, since no Boltzmann reference for a protein exists here. The counts of chains in chapter 4's set are also our choice and not populations.
- **Second looks stop by stop** (chapter 4). Mixing Euler and Heun within one run is sound mathematics and this game's own move. Real samplers keep to one rule, and Boltz uses first-order steps only.
- **The best-rotation denoiser** (chapters 6, 7). Each structure is rotated onto the noisy point by Kabsch, then weighted. It is not the integral over rotations. With no condition on adenylate kinase it gave 78% closed over 300 test runs against 68% in the set. 36 and 144 Euler steps give the same share, so the gap comes from this shortcut. The share also depends on where the noise starts: from 60, 90, 250 and 800 Å the same 22 structures gave about 94, 76, 48 and 42% closed. Set composition at 90 Å: 13, 30, 50 and 68% closed in the set give 28, 58, 70 and 83% in runs, so it tracks the data but bends upward. An exact field would not depend on the start, so the near match at 90 Å is partly luck. The likely reason, not proven, is that best-rotation weights depend on size: open chains have Rg 19.4 Å against 16.4 Å closed.
- **One structure in K orientations** (chapter 6). A small exact test of what training on orientations does.
- **Conditions as labels** (chapter 7). Residue type and "nucleotide bound" stand in for what the trunk computes.
- **Steering on the map** (chapter 8). Same recipe, in 2-D, with a flat-bottom energy on a disc. Energy units differ from Boltz, so the best λ here says nothing about Boltz's default of 4.
- **What R buys** (chapter 8). Forty invented ligands with Gaussian errors.
- **Sampler settings on a 2-D exact field** (chapter 9). Boltz's η, γ₀ and λ on our map of MD frames, with our schedule unless stated.
- **The dipeptide on the board** (chapter 9). Each molecule is one sampler droplet, built from the real starting structure with bond lengths and angles fixed and only φ and ψ turned. The sampler runs on the 2-D field, not on the molecule's coordinates.
- **Histogram weights** (chapter 9 note). p/q from 5° histograms, which is only possible in two dimensions.

### Simplifications

- **The flat sheet** (chapters 2, 3, 5, 7, 8 and level 2 of chapter 9). Angles wrap round, but the map is cut along φ = ±180° and ψ = −100° and treated as flat. Only 25 of 55,337 general residues lie within 5° of a cut. Chapter 2 says so on screen and tags it.
- **Curl of the water.** Trails and the slow curl of the ink are for looks. They fade to nothing as noise falls. Droplet positions come from data and the field, and on the title from the probability-flow ODE of the best-rotation denoiser on real ubiquitin conformers.
- **The title, the boards and the playback are not folding.** Sampling steps are iterations of a sampler. They are no folding pathway, no trajectory and not MD time. The title screen, chapter 4's board and chapter 7 say so, and chapter 9's note does.
- **Music.** See below.

### Results found while building, kept as found

- Noise on copies of ubiquitin scores best on hidden conformers near σ = 1.0 Å, and bonds there are wrong by about 1.6 Å. Across the 116 deposited models bonds vary by about 0.004 Å, and 0.006 Å in the bundled data, which are rounded to 0.01 Å. That is how tightly the refinement holds them, not thermal motion. So no width gives new structures and sound chemistry together. The cause is one width on every coordinate, not the number of dimensions: two atoms alone show the same bond error at the same width, and noise with the ensemble's own covariance, at the same 1.8 Å move per atom, leaves bonds about 0.33 Å off against 1.7 Å. The peak depends on the atoms: 1.05 Å for all 601, 0.83 Å without residues 71 to 76, 0.56 Å for the backbone of residues 1 to 70, and 2.1 Å for those six tail residues alone. The hidden score collapses at small widths (−220 bits per atom at 0.1 Å), and the stored score climbs for ever. All four ways of hiding every fourth of the bundled 39 conformers give the same peak, and distance between conformers does not depend on their order in the file. Scoring on the 77 conformers never bundled moves the peak only from 1.04 to 1.09 Å, which was checked once on the raw file, since `tools/test.mjs` cannot see conformers that are not bundled.
- When one stored structure dominates the density at a hidden one, the score peaks at σ = √(⟨r²⟩/3), with r the distance per atom from a hidden structure to its nearest stored one. This gives 1.05, 1.45, 1.24 and 0.36 Å for 29, 4 and 12 stored conformers and the kinase, and the peaks on a fine set of widths are the same. The spacing of the stored structures, which the board shows, is only a stand-in for r when the score is hidden. Over √3 it gives 1.09, 1.34, 1.14 and 0.29 Å.
- Fewer data move that peak little: 29, 12 and 4 stored conformers give about 1.05, 1.24 and 1.45 Å. On one hidden set, averaged over many splits, the factor is about 1.3 for a sevenfold drop. The same Gaussian blur on the 2-D map doubles its best width for a tenfold drop, from about 3.5° to about 7°.
- A bad ladder still lands on real structures, and that comes from the finite list. The last Euler step lands on the guess, and at low noise the guess is one of the 39 stored conformers. A Gaussian of the same covariance has no list, and stops at 1,000 and 2 Å shrink its spread from 2.2 to 0.45 Å.
- Frequencies break first. Two stops, 1,000 and 0.5 Å, land 0.01 Å from a conformer with an effective count of 1.9 of 39 and 67% on one conformer, because runs shrink toward the mean and pile onto the conformers nearest it. A closest-distance score cannot see this, so level 1 scores the count, and 37 of 39 needs well-placed stops. Twenty-five stops give 38.5.
- States far from the mean break soonest. The cause is distance from the mean, not rarity. With two populations the mean sits with the larger one, so the rare side is the far side: in 17 kinase chains with 11.8% open, 5 Euler calls give about 8% open and 25 Euler stops give 10.8%. A rare state near the mean does the opposite: 7 open and 8 closed chains with two made-up midpoints, 11.8% of that set, give 18% midpoints with 5 Euler stops and 100% with two. A chain that ends open passes even odds between about 31 and 121 Å.
- One second look is not accurate on a long jump. On jumps ending at 109, 79, 58 and 42 Å the share swings from 2 to 18% with where the jump ends and what follows, and 12% is only where undershoot and overshoot cross, with an even count near 12. An earlier version of levels 2 and 3 passed such ladders on the open share alone. Now both levels also need an even count of 16 of 17, the same bar as 37 of 39. With 10 calls, plain stops alone reach about 10%, just under the target, and three looks on the jumps from 205 to 16 Å give about 11.6% with an even count of 16.1, and moving any one stop by one place keeps the share between 10.3 and 12.8%.
- Fixed fresh noise has a plateau. With γ = 0.8, Euler gives 8.2, 8.4, 8.4, 8.2 and 8.5% at 25, 50, 100, 200 and 400 stops, and with no noise the same stops climb 10.8, 11.3, 11.5, 11.6 and 11.7%. Each step still jumps from 1.8 σ to σ in one go. A second look corrects most of that jump, on the jump that crosses about 120 Å and the next two, down to about 30 Å. Looks above or below that range change almost nothing. Heun on every step gives about 11.3% from 25 stops and slightly less with more steps, 11.1% at 400. For two exact states at a set 10%, Heun on every step gives 9.5% at 200 steps and 9.3% at 3,000, against 7.0% for Euler. At Boltz-2's η = 1.5 it gives only 4.7%, against 2.4% for Euler, so η is the main cause.
- The start matters only if it is too low. A perfect run reaches 11.8% from 1,000 Å, the set's own share, and 11.4% from 200 Å, and starting higher makes almost no difference. An earlier version started at 200 Å and showed a ladder at 11.8%, above that ceiling, which was errors cancelling.
- Peaks of the blurred density: 4 at σ = 25°, 3 at 35°, 2 at 40°, 1 at about 70°. The spread of the data, σ_data, is 66°.
- Boltz-2's 200-step schedule puts 118 steps above 16 Å, 37 between 1 and 16 Å, and 45 below 1 Å. Its noise burst applies on 154 steps.
- On 100 training residues, the exact field gives about 99% copies and covers about 60% of unseen residues within 5°. A small network on the same 100 gives about 12% copies and covers about 90%, with similar precision. This depends on training length: trained far longer, the same network drifts toward copying.
- Diets: 500 training steps on big noise only or small noise only leave the samples about 16° from unseen data, against about 4° for all noise levels.
- The plain mean over rotations shrinks toward zero at high noise. A real Boltz-2 run at σ = 4,608 Å gave a guess of full size (Rg 13.4 Å against 13.7 Å). That guess is 1.87 Å from the same run's end, and 2.0 to 2.4 Å from the ends of other runs, while two samples differ by 2.35 to 2.59 Å. 4,608 Å is 2,560 Å raised by the first noise burst, and it lies 4.6 standard deviations above the training noise, so the network is extrapolating there. We read the aligned loss, the rotation-invariant smooth LDDT term and the strength of the condition as the causes. No Boltz model without them was tested.
- With an aligned loss, D is not the posterior mean, so Tweedie's link to the score does not hold exactly for Boltz.
- The noisy point is 90% sure of a whole protein's hand below about 70 Å and of one chiral centre's, taken alone, below about 0.3 Å, with rotation integrated out. The simple formula 1/(1 + exp(−d²/2σ²)) puts the noise at its mean and ignores rotation, and gives 133 Å and 0.43 Å. Averaging over the noise alone gives 94 Å and 0.30 Å. With the local frame known from the rest of the chain, the limit for a centre is nearer 1 Å. In the stored run the network's first guess had the correct hand at 130 of 130 Cα centres, and at least 98.5% in all 20 steps, while the noisy input was near 50% correct until σ = 2 Å. That is one run, amino acids only, with ligands unchecked.
- A 2% state between two large ones stops being a peak at 0.28 d, an equal peak at 0.49 d, and the large states merge at 0.98 d, for neighbours at distance d.
- Guidance alone pushed droplets out of the zone but piled them at its wall, leaving populations almost unchanged. Resampling at λ = 4 cleared the zone and overshot. λ near 1 came close to the exact target.
- Plain MD of alanine dipeptide was not enough. 37.0 ns of unbiased runs had one real entry to φ above 0, of 915 ps, plus four one-frame grazes, and the α-like share of 1 ns blocks ran from 0 to 0.73. Pooled they gave 25.8 / 71.7 / 2.5%, which agrees with the final reference within error. They were replaced for having too few crossings and no independent repeats, not for a wrong answer.
- The reference uses a fixed 2-D bias and weights, 24.0 ns: about 30 ± 5 / 66 ± 4 / 3.4 ± 0.7% (α-like side, strand side, φ above 0), standard errors between three independent runs. The runs gave 37/61/1.9, 22/73/4.4 and 34/62/3.4. Blocks within runs understate this, and longer blocks keep raising the error. The Kish effective sample size of 3,404 ignores time correlation, and independent samples are about 100 to 300. The free-energy gap of the rare region is 1.77 ± 0.13 kcal/mol.
- Regions: φ above 0 is αL 3.0% and 0.4% else. ψ = 45° sits on the shoulder of the α region, not on the valley floor at 65 to 95°: a cut at 20° gives 28.1% α-like, and at 75° gives 31.5%.
- Sampler settings on that 2-D exact field, 60 steps from 400° to 1°, ρ = 7, ten seeds of 4,000 droplets (α-like / strand / φ above 0): plain 29.4 / 67.0 / 3.6; η = 1.5 alone 15.8 / 84.2 / 0.0; γ₀ = 0.8 alone 28.3 / 69.7 / 2.0; Boltz-2's η, γ₀ and λ 22.3 / 77.3 / 0.4 (rare region between about 0.2 and 0.6 across seeds as run in the game); Boltz-1's 17.8 / 82.1 / 0.1. The burst of noise is 1.50 σ for Boltz-2 and 1.13 σ for Boltz-1, against a cap of 1.0 σ in Karras et al. It undoes part of the contraction from η on this flat sheet and in Cartesian space. That direction belongs to the geometry. On the torus that φ and ψ really live on, added noise lowers what η left. Carried exactly on a periodic grid, with no droplets, the plain run gives 4.2%, noise alone 2.4%, η = 1.5 alone 1.6%, and all three 0.6%. The plain 4.2% is the error of 60 steps: 600 give 3.5%, and the frames hold 3.4%. Level 2's order of answers is a property of the cut-open map.
- Matching a set share on the plane of η and γ₀ is a valley, not a point. For a set 10% on Boltz-2's schedule, it runs from η = 1, γ₀ = 0 to about η = 0.9, γ₀ = 0.5 and η = 0.8, γ₀ = 1. It is a valley for the share alone: states of width 0.3 Å come out 0.39 Å wide at γ₀ = 0.5 and 0.49 Å at γ₀ = 1, so only η = 1, γ₀ = 0 keeps the width too. Boltz-2's setting lies far from it, near 2.5%. This is on an exact field, and says nothing about what suits a trained network.
- On Boltz-2's own range and 200 steps the full preset gives the same 0.4%, η = 1.5 alone gives 0 / 100 / 0, and η = 1.04 halves the rare region. On our 60-step range η near 1.1 halves it. That η depends on where the schedule starts. More steps do not repair it, because η changes the flow. Fixed γ₀ with a first-order step stalls too: two states at a set 10%, with noise alone, stay near 7% from 50 to 2,000 steps, because each step still jumps from 1.8 σ to σ. Karras et al. shrink γ with the number of steps, and AlphaFold3 and Boltz keep it fixed. None of this says anything direct about Boltz on any protein, because a trained network errs in other ways and Boltz's loss is aligned.
- Exact two states on Boltz-2's schedule in Å. With states 10 Å apart, 3.4%, 10% and 30% become 0.29%, 2.2% and 19.6%, and the odds are raised to powers 1.75, 1.73 and 1.67. At the real 119.5 Å between closed and open adenylate kinase, one distance over all 642 coordinates, about 8 Å per atom in this frame and 7.1 Å after best fitting, they become 0.35%, 2.4% and 19.8%, powers 1.69, 1.69 and 1.65. So the power is near 1.7, or near 2.2 with Boltz-1's settings. That holds while states lie at least about 4 Å apart with a width under about a tenth of that: width 0.3 Å gives 1.69 at 10 Å and 1.68 at 120 Å. Those first two cases differ in width as well as separation, and the width accounts for the small difference between them. Closer states climb fast, 1.98 at 3 Å, 2.6 at 2 Å and about 4 at 1 Å, and wide states fall, 1.5 at width 3 Å and 0.93 at width 5 Å, 10 Å apart. The link to temperature holds for shares only: the variance inside a state falls by 1/19.6, 1/5.4 and 1/2.6 for widths 0.3, 1 and 3 Å, not by 1/1.7. Whole chains in all 642 coordinates agree with the line within sampling error. This is our own calculation, not a paper's. It agrees in direction with the Boltz documentation on step scale and temperature.
- Reweighting Boltz-2-setting samples with histogram weights gives about 1% in the rare region with 4,000 droplets, and 1.9% with 40,000, because it only sums p over visited cells.

### The real Boltz record

From the author's own teaching exercises: Boltz 2.2.1, source commit `b1ebfc46ecf57f5414e0d1a6f9027bbb122c53bc`, seed 42, 20 sampling steps, 1 recycling step. The protein is the 136-residue first sequence of the alignment used there, which is byte-identical to `examples/msa/seq2.a3m` in the Boltz repository. `examples/prot.yaml` itself has 117 residues. These are reduced settings. The stored data are C-alpha coordinates of each noisy and denoised frame, the final structures of seven runs, the base and six variants, per-residue pLDDT, confidence values, and hand counts computed from all atoms. Those are the Boltz results in this game. They come from one protein, and they are the outcome of a quick exercise, not a benchmark.

## How a puzzle chapter is built

A chapter with `puzzle: true` gets the goal line, one line of feedback and the quiet marker of where it sits in the sampler (`place`). Its `stages` are its levels. The old `ui.line`, `ui.choose` and `check` still work for the six chapters that use them.

| Piece | Use |
|---|---|
| `run.level(goal, tags)` | Starts a level: the goal, its progress and the tags |
| `run.board({ at, grab, move, drop, tap, hover, cursor })` | A move on the board, the same with finger and mouse |
| `run.idle(where)` | A hand shows the move after 6 s with no action |
| `run.won(line, tier)` and `run.pause(ms)` | The reward, then on by itself. A tap skips the pause |
| `run.safe(fn)` | An async board handler that leaving the chapter cannot break |
| `ui.feedback(line, tone)`, `ui.rounds(done, total)`, `ui.pipeline(lit)`, `ui.hand(from, to)` | One line, dots for rounds inside a level, the marker, the hand |
| `board.setPanel(min, seconds, max)`, `board.panel`, `board.box`, `board.flash(good)`, `board.setSpan(a)` | A board for a molecule, with room under it for a chapter's own panel. `tank` offers the same panel for the map |
| `new Bundle(run, { n, bonds, K })`, `bundle.draw(X, { atomInk, chainInk, chainMass, strain })` | Several copies of a molecule in one cloud of ink, with red for strained bonds |
| `pour.run(..., { halt })` | A sampler run that the next move can stop |

Targets and cases live in `src/science/levels.js`, so that `tools/test.mjs` checks the numbers the game plays: that the answer to one level fails the next, and that replays of careless play under the game's own rules rarely pass.

## Music

The piece, "Noise and Return", is a score of about 90 note events for hang drum, kalimba and glass bowls. Forward diffusion is applied to it for real: each note gets Gaussian noise in time (up to 1.5 s standard deviation) and in pitch (up to 11 semitones), in proportion to the noise level on screen. At σ = 0 the score is exact, to the sample. Two mercies are added: noisy pitches are snapped to a D pentatonic scale, and up to 42% of notes are dropped at full noise, so that it sounds like sparse rain. All sound is synthesised and every source decays on its own within 3 s or so. There is no sustained tone.

## Sources

Diffusion: Sohl-Dickstein et al., ICML 2015. Ho, Jain and Abbeel, NeurIPS 2020. Song et al., ICLR 2021. Karras et al., NeurIPS 2022. Vincent, Neural Comput 2011.

Structure prediction: Abramson et al., Nature 630, 493 (2024), and Supplementary Information. Jumper et al., Nature 596, 583 (2021). Wohlwend et al., bioRxiv 10.1101/2024.11.19.624167, version posted May 2025. Passaro et al., bioRxiv 10.1101/2025.06.14.659707, version posted June 2025. The GitHub repository `jwohlwend/boltz` at commit `b1ebfc46`: `main.py`, `model/modules/diffusionv2.py`, `model/potentials/potentials.py`, `data/const.py`, `docs/prediction.md`. These two preprints have no journal version in Europe PMC as of November 2026.

Equilibrium sampling: Noé et al., Science 365, eaaw1147 (2019), read as its arXiv version. Lewis et al., Science 389, eadv9817 (2025), read as its preprint. Singhal et al., arXiv 2501.06848 (2025).

Independent tests of Boltz-2: Wan et al., J Chem Theory Comput 22, 7811 (2026). Bret et al., J Chem Inf Model 66, 1511 (2026). Read as abstracts.

The name: "Named after the Boltzmann Distribution", MIT Jameel Clinic, 6 December 2024, https://jclinic.mit.edu/democratizing-science-boltz-1/.

Memorising: Biroli et al., Nat Commun 15, 9957 (2024). Standard references not re-read for this game: Kabsch 1976, Lovell et al. 2003, Ramachandran et al. 1963, Rumelhart et al. 1986, Kingma and Ba 2015, Dhariwal and Nichol 2021, Jing et al. 2022, Buttenschoen et al. 2024, Robbins 1956 and Efron 2011.

## Data and licences

| Data | Source | Licence |
|---|---|---|
| 411 high-resolution crystal structures, one per 30% sequence cluster, chosen by a fixed query and shuffle (`tools/fetch_data.mjs`), reduced to φ, ψ and residue type | Protein Data Bank | CC0 |
| Ubiquitin 2K39, 39 of 116 conformers, heavy atoms. The other 77 were used once, outside the game, to check the hidden set | Protein Data Bank | CC0 |
| Adenylate kinase, E. coli, 51 chains from 28 entries (UniProt P69441), 22 kept, C-alpha | Protein Data Bank | CC0 |
| Alanine dipeptide MD, 24.0 ns, 2-D biased and reweighted | Made for this game with OpenMM 8.5, ff14SB, TIP3P, `tools/md_alanine.py` | This repository's licence |
| Alanine dipeptide starting structure, 10 heavy atoms, in `src/science/dipeptide.js` | pdbfixer's `alanine-dipeptide.pdb`, as used for the MD | MIT |
| A Boltz-2 run | Made by the author with Boltz (MIT) for the author's teaching exercises | This repository's licence |

Fonts, both SIL Open Font License 1.1, bundled from `@fontsource`: Instrument Serif (2022 The Instrument Serif Project Authors) and Ysabeau Office (2023 The Ysabeau Project Authors). three.js is MIT.

## Rebuilding

```sh
# 1. Raw data to a cache folder outside this repository
CACHE=/some/folder node tools/fetch_data.mjs

# 2. The MD reference. Needs OpenMM and pdbfixer's alanine-dipeptide.pdb as ad.pdb. Hours on one machine.
python tools/md_alanine.py bias 5 OpenCL
python tools/md_alanine.py run 1 6 OpenCL
python tools/md_alanine.py run 2 9 CPU 3
python tools/md_alanine.py run 3 9 CPU 3

# 3. Pack. BOLTZ points to the teaching exercises folder with results/. CACHE/trace-extract holds the arrays of results/trace.npz as .npy, with trace.json.
CACHE=/some/folder BOLTZ=/path/to/exercises MD=/path/to/md node tools/pack_data.mjs

# 4. Test the maths
node tools/test.mjs

# 5. Build index.html. DEPS holds three, esbuild and the @fontsource packages.
DEPS=/path/to/deps node tools/build.mjs
```
