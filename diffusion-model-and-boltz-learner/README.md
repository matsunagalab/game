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

Each chapter leaves one principle to explain in your own words, and ends with a new case. The first drop is for doing the computation, the second for a result that takes some thought, and the third for getting the new case right first time, answer and reason.

| # | Chapter | You do | The principle |
|---|---|---|---|
| 1 | Making new from old | Pour 8,000 real residues, try lookup, tune a histogram on held-out residues, count the cells a protein would need | What a generative model is, why it is judged on unseen data, why tables fail |
| 2 | Dissolve it | Add real Gaussian noise, find where each peak of the density dies, bend the noise schedule, read Boltz-2's real one | Forward diffusion, scale, the schedule |
| 3 | The best guess | Drag a noisy point over the exact posterior, find a guess in empty water, test Tweedie's formula by finite differences, follow the score field | The denoiser, the posterior, the score |
| 4 | Run it backward | Launch droplets from pure noise, race Euler and Heun per denoiser call, rerun the same noise with and without churn | Samplers, determinism, what the noise decides |
| 5 | Train a network in your hand | Train a real network with live loss, try three noise diets, beat the exact formula on unseen residues from only 100 examples | Training, loss, why networks generalise and the ideal denoiser copies |
| 6 | From two numbers to thousands | Dissolve and rebuild ubiquitin in all 1,803 coordinates, measure equivariance against the number of orientations, compare the plain mean over rotations with real Boltz-2, align by hand and by Kabsch, find where a chiral centre loses its hand | Rotation, alignment, chirality, hallucination |
| 7 | Same noise, different answer | Send one noise to different islands by residue type, test the guidance identity, open and close real adenylate kinase, predict a share, scrub a real Boltz-2 run | Conditioning, the trunk, why the first guess can be so good |
| 8 | What Boltz added | Run the recipe of Boltz-steering on the map in four modes against an exact target and tune it, compute a confidence score, see what a Pearson R buys, read the limits | Boltz-1, Boltz-1x, Boltz-2, affinity with its limits |
| 9 | Is it the Boltzmann distribution? | Compute a free-energy difference, reproduce populations from MD, change each sampler setting alone and together, find a step scale that halves a rare region, run an exact two-state test on Boltz-2's schedule, reweight, judge uses of samples | Sample frequencies are not populations unless checked |

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

- The exact denoiser of Karras et al. 2022, Eq. 57, over 8,000 real residues (chapters 2 to 4), conditional versions for glycine, proline and alanine (chapter 7), and over MD frames (chapter 9). Moved droplets use a grid of the exact field, with a mean error under 2% of σ, tested in `tools/test.mjs`. Below 5° the sum is exact over neighbours.
- Tweedie's formula, checked live by finite differences of the real log-density.
- Euler, Heun, churn (Karras et al. Algorithms 1 and 2) and AlphaFold3's Algorithm 18.
- A real neural network: three layers of 48 units, 5,666 parameters, Adam, trained on the device.
- Kabsch superposition, mirror distances, Rg, the plain posterior mean over 4,000 random orientations, and the posterior for a hand with rotation integrated over 8,000 random rotations.
- An exact two-state run of Algorithm 18 on Boltz-2's schedule in Å, 200 steps, with the odds to a fitted power. This is this game's own calculation, not a published result.
- Feynman-Kac steering, by the recipe of Boltz-1's Algorithm 2 and `sample()` in `modules/diffusionv2.py`, on the map, against an exact known target.

### Teaching models

Each of these carries the Teaching model tag on screen.

- **The best-rotation denoiser** (chapters 6, 7). Each structure is rotated onto the noisy point by Kabsch, then weighted. It is not the integral over rotations. With no condition on adenylate kinase it gave 78% closed over 300 test runs against 68% in the set. 36 and 144 Euler steps give the same share, so the gap comes from this shortcut. The share also depends on where the noise starts: from 60, 90, 250 and 800 Å the same 22 structures gave about 94, 76, 48 and 42% closed. Set composition at 90 Å: 13, 30, 50 and 68% closed in the set give 28, 58, 70 and 83% in runs, so it tracks the data but bends upward. An exact field would not depend on the start, so the near match at 90 Å is partly luck. The likely reason, not proven, is that best-rotation weights depend on size: open chains have Rg 19.4 Å against 16.4 Å closed.
- **One structure in K orientations** (chapter 6). A small exact test of what training on orientations does.
- **Conditions as labels** (chapter 7). Residue type and "nucleotide bound" stand in for what the trunk computes.
- **Steering on the map** (chapter 8). Same recipe, in 2-D, with a flat-bottom energy on a disc. Energy units differ from Boltz, so the best λ here says nothing about Boltz's default of 4.
- **What R buys** (chapter 8). Forty invented ligands with Gaussian errors.
- **Sampler settings on a 2-D exact field** (chapter 9). Boltz's η, γ₀ and λ on our map, with our schedule unless stated.
- **Histogram weights** (chapter 9). p/q from 5° histograms, which is only possible in two dimensions.

### Simplifications

- **The flat sheet** (chapters 1 to 5, 7 to 9). Angles wrap round, but the map is cut along φ = ±180° and ψ = −100° and treated as flat. Only 25 of 55,337 general residues lie within 5° of a cut. Chapter 2 says so on screen and tags it.
- **Curl of the water.** Trails and the slow curl of the ink are for looks. They fade to nothing as noise falls. Droplet positions come from data and the field, and on the title from the probability-flow ODE of the best-rotation denoiser on real ubiquitin conformers.
- **The title and the playback are not folding.** Sampling steps are iterations of a sampler. They are no folding pathway and no trajectory. The title screen and chapter 7 say so.
- **Music.** See below.

### Results found while building, kept as found

- Held-out score of the histogram peaks at 3.96 bits at 5 to 7.5°, and falls to 2.34 bits at 1°, while the training score rises to 5.01.
- Peaks of the blurred density: 4 at σ = 25°, 3 at 35°, 2 at 40°, 1 at about 70°. The spread of the data, σ_data, is 66°.
- On the exact field, with η = 1 and no churn, populations come back within about half a percent. Heun with 3 steps is far worse than Euler with 3.
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
- Sampler settings on that 2-D exact field, 60 steps from 400° to 1°, ρ = 7, ten seeds of 4,000 droplets (α-like / strand / φ above 0): plain 29.4 / 67.0 / 3.6; η = 1.5 alone 15.8 / 84.2 / 0.0; γ₀ = 0.8 alone 28.3 / 69.7 / 2.0; Boltz-2's η, γ₀ and λ 22.3 / 77.3 / 0.4 (rare region between about 0.2 and 0.6 across seeds as run in the game); Boltz-1's 17.8 / 82.1 / 0.1. The burst of noise is 1.50 σ for Boltz-2 and 1.13 σ for Boltz-1, against a cap of 1.0 σ in Karras et al. It undoes part of the contraction from η.
- On Boltz-2's own range and 200 steps the full preset gives the same 0.4%, η = 1.5 alone gives 0 / 100 / 0, and η = 1.04 halves the rare region. On our 60-step range η near 1.1 halves it. That η depends on where the schedule starts. More steps do not repair it, because η changes the flow. On a torus the η-only effect is far weaker, 1.6% at η = 1.5, while the full preset gives 0.6%. None of this says anything direct about Boltz on any protein, because a trained network errs in other ways and Boltz's loss is aligned.
- Exact two states on Boltz-2's schedule in Å: 3.4% becomes 0.3%, 10% becomes 2.3%, 30% becomes 20%, whatever the separation above 5 Å. The odds are raised to a power near 1.7, and near 2.2 with Boltz-1's settings. This is our own calculation, not a paper's. It agrees in direction with the Boltz documentation on step scale and temperature.
- Reweighting Boltz-2-setting samples with histogram weights gives about 1% in the rare region with 4,000 droplets, and 1.9% with 40,000, because it only sums p over visited cells.

### The real Boltz record

From the author's own teaching exercises: Boltz 2.2.1, source commit `b1ebfc46ecf57f5414e0d1a6f9027bbb122c53bc`, seed 42, 20 sampling steps, 1 recycling step. The protein is the 136-residue first sequence of the alignment used there, which is byte-identical to `examples/msa/seq2.a3m` in the Boltz repository. `examples/prot.yaml` itself has 117 residues. These are reduced settings. The stored data are C-alpha coordinates of each noisy and denoised frame, the final structures of seven runs, the base and six variants, per-residue pLDDT, confidence values, and hand counts computed from all atoms. Those are the Boltz results in this game. They come from one protein, and they are the outcome of a quick exercise, not a benchmark.

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
| Ubiquitin 2K39, 39 of 116 conformers, heavy atoms | Protein Data Bank | CC0 |
| Adenylate kinase, E. coli, 51 chains from 28 entries (UniProt P69441), 22 kept, C-alpha | Protein Data Bank | CC0 |
| Alanine dipeptide MD, 24.0 ns, 2-D biased and reweighted | Made for this game with OpenMM 8.5, ff14SB, TIP3P, `tools/md_alanine.py` | This repository's licence |
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
