# Physical chemistry of biomolecules learner

Seventeen bench experiments on the forces between molecules, drawn as woodblock prints. Each one is a live particle simulation or an exact calculation in which an interaction emerges from the physics. You predict, you run, you measure, and only then does the equation appear.

Open `index.html`. It is one file and needs no network.

## The prints

Every readout carries a tag during play: live, long run (stored), exact, toy, or measured (literature).

| # | Chapter | Print | Model | Live or stored |
|---|---------|-------|-------|----------------|
| 1 | Hydrophobic effect | The cage | 2D Mercedes-Benz water around an oil drop | Live, with a stored long run as a ghost outline |
| 2 | | Room for a hole | Same, with no solute: how often an empty circle opens by itself | Live count, no table behind it; long-run lines to compare |
| 3 | | Two drops | Same, two to five held drops | Shell counts live; the free-energy curves are stored |
| 4 | | The bill | Same, kT 0.17 to 0.30, drop and hole, bonds on and off | Shell counts live; the bill is stored |
| 5 | | Small and large | Same, a hard hole of growing radius | Wall bonds live; the work curves are stored |
| 6 | Coulomb in water | Why 332 over ε | Drop of 120 Stockmayer dipoles around an ion | Live |
| 7 | | The buried salt bridge | Point charges in a low-ε sphere in water | Exact (Born and Kirkwood) |
| 8 | | The ion atmosphere | Primitive model of salt around a −6 macro-ion | Live |
| 9 | Dipoles and dispersion | Spinning dipoles | Two point dipoles | Exact integral, with live Metropolis arrows |
| 10 | | Two soft clouds | Two coupled Drude oscillators, argon Lennard-Jones fit | Exact normal modes |
| 11 | | Weak but numerous | Lennard-Jones sum over two carbon sheets, then the water contacts they give up | Exact sum, toy parameters; no net sign |
| 12 | Hydrogen bond | The shape of a bond | Four point charges with Lennard-Jones and overlap | Exact for a toy model |
| 13 | | Balance the books | Bond bookkeeping, then the same accounting in the water model | Literature numbers, plus stored g(r) and an exact angle average |
| 14 | Entropic forces | Forced together by crowding | Hard disks, both big disks held | Live force, with a stored long run |
| 15 | | Counter-ions go free | Manning's limiting law, then the Record–Lohman slope, invented proteins | Formula, with a cartoon of ions |
| 16 | | A chain counts its shapes | Lattice walks | Exact counts |
| 17 | The ledger | The whole ledger | Streptavidin and biotin | Measured totals, five mutants and a double mutant; the seven-term split is an illustration |

## What the hydrophobic chapter says

What is general is the free energy of restricting water. Its split into energy and entropy depends on temperature and on the solute.

- **Price of room.** Opening a hole of radius 1 costs about the same with or without bonds at the same density: 82% of the price stays at kT 0.18, nearly all of it at kT 0.24. The price comes from density: at the same pressure a bondless fluid swells and the hole gets far cheaper, so bonds matter by holding water dense. Lee (1985) adds that water molecules are small; this game varies density, not molecular size.
- **Who pays.** Entropy in a bondless fluid, energy in cold water. In a held box about nine tenths of a cold hole's price is ΔU. By kT 0.26 entropy pays for the hole in water too. This drop's held-box ΔU is near zero only by cancellation: solute–water attraction against the energy of rearranging water. −TΔS over ΔG at kT 0.18 runs from a few percent for a repulsive solute to many times ΔG for a strongly attractive one.
- **Orientation.** Shell waters really do lose turning freedom when cold. It is one term in a sum with large terms of both signs. Near kT 0.18 it is a large term and should not be undersold; by kT 0.20 it has halved while −TΔS at constant pressure is near zero.
- **Heating.** At constant pressure dΔH = T dΔS is an identity, and ΔG is flat because ΔS is near zero around T_S. The surprise is the size of ΔCp. The swing comes from water's thermal pressure, which rises from zero at the density maximum and needs bonds (Cerdeiriña and Debenedetti 2016, 2018). A held box is at the same state, and its −TΔS never changes sign, so shell-bond loss does not explain the flip.
- **Crossings.** At the density maximum ΔH equals the held-box ΔU. Above it, thermal pressure lifts ΔH. Where it crosses zero depends on the solute, and a hole or a purely repulsive solute has no crossing in the range.
- **Fixed temperature.** Yu and Karplus (1988) argued that water's energy and entropy of rearrangement cancel exactly. Thompson et al. (2026) show that this is not correct.
- **Pairs.** Part of the contact attraction is packing, the same physics as crowding: a bondless fluid at the same density reaches half to most of the part that comes from the water, depending on temperature (about 49 to 95%). With a solute that only repels, contact is about −0.35 ε without bonds, 70 to 85% of the same solute in water.
- **Size.** Small holes cost their area in any dense fluid. Water pays a surface cost that grows up to R ≈ 1.3 and holds, and a bondless fluid pays almost none. Wall waters lose bonds beyond R ≈ 1, but the cost starts earlier, so broken bonds are only part of it. Real water near coexistence goes further and dries; this model stays wet.

## What is live and what is precomputed

Everything marked live runs in the browser while you watch, inside a fixed slice of each frame. The slice shrinks on slow devices, so the picture stays smooth and the statistics take longer.

Free energies do not converge in the seconds a player has, so these come from long runs at build time. `tools/precompute_mb.mjs` writes `tools/mb_raw.json`, `tools/make_table.mjs` turns that into `src/sim/mbtable.js`, and `tools/precompute_disks.mjs` writes `src/sim/disktable.js`:

- Insertion of six test objects on one trajectory (this drop, a smaller one, weaker and stronger attraction, a purely repulsive solute, an empty hole of radius 1), 14 temperatures, in four settings: water at constant pressure 0.19 and in a held box (four runs of 300,000 sweeps of 100 waters each), no bonds at the same density and at the same pressure. ΔU, pΔV, the direct solute–water energy, the partial volume and the thermal pressure are kept apart. ΔH agrees with the Gibbs–Helmholtz slope of ΔG/T to about 0.1 ε from kT 0.18 to 0.28, and to 0.18 ε at the coldest point. ΔU and pΔV are fixed-concentration values (Ben-Naim), not partial molar ones.
- One held solute, 8 temperatures, three runs of 250,000 sweeps of 120 waters: orientations and bonds.
- Pair potential of mean force by test insertion in 300 waters, 6 temperatures, up to six runs each, with a flat baseline past r = 5, and the same without bonds. Seed spread is reported.
- Two held solutes in a held box, bonds on and off: shell counts.
- Hole counts and g(r), bonds on, off at the same density, and off at the same pressure.
- Hard cavities of 15 sizes at kT 0.18 and 0.24, and without bonds at pressure 0.31, which gives density 1.01, within 2% of water at kT 0.18. The work comes from the density at the wall (reversible work theorem), started from the exact value at the smallest hole.
- Crowding force at 41 distances with both big disks held, three runs of 150,000 sweeps each, read with thin skins so the sharp packing peaks survive.

## Models and their limits

- **Mercedes-Benz water.** Silverstein, Haymet and Dill's parameters: bond depth 1, bond length 1, Gaussian width 0.085, Lennard-Jones 0.1 and 0.7, pressure 0.19. It is 2D with three arms, so real water's numbers are out of reach. Energy is in units of one ideal bond, and T is kT in those units. There is no fair conversion to °C. At p = 0.19 the model is above its critical pressure, so it never boils; it thins smoothly into an expanded fluid, 30% less dense by kT 0.30. The low end, kT 0.17, is supercooled and may not be fully equilibrated. pV/NkT is about 1, unlike real water, so pΔV is a large part of ΔH: at kT 0.24 about half of it.
- **Reference state.** Insertion here is from vacuum into water at a fixed point. Kauzmann's claim is about transfer from oil to water, and another standard state shifts ΔS and the crossings. Real hydrocarbon transfer goes from entropy-driven near 22 °C to enthalpy-driven near 113 °C (Baldwin 1986), the same order as the crossings here. The order of the crossings matches for this drop, not as a general rule: the ΔH crossing moves with the solute.
- **Pairs.** A contact pair is only about −1.5 kT at kT 0.22, so free drops rarely clump in a small box. Spontaneous clumping did not clearly beat a bonds-off control in tests, and the game does not claim it. A line of five drops and a round clump differ by about one water. The contact is the least converged at kT 0.18 (−0.19 ± 0.02, seeds −0.13 to −0.29).
- **Crossover.** The contact theorem keeps the wall density of a large hole at or above p/kT, so no vapour layer can form at this pressure. This is not Lum–Chandler–Weeks drying. In this 2D toy, area stands in for volume and perimeter for surface.
- **Dipole drop.** Soft spheres with point dipoles in reduced units. It shows the mechanism and that ε rises with dipole strength and falls with heat. It is not water. ε is read from the polarisation flux (Gauss) and is noisy above about 10. The Kirkwood–Fröhlich relation with the whole drop's dipole gives about 7 at kT 1, close to the flux reading, and 4.75 at kT 2 against 3.9. The simpler sphere-in-vacuum formula fails because of the vacuum boundary.
- **Primitive model.** Hard ions in uniform ε 78.4 in a sphere, all pairs bare Coulomb. The measured length runs about 10% under 3.04/√I, mainly because the neutralising counter-ions add about 9% salt and a −6 macro-ion is beyond linear theory.
- **Kirkwood.** A uniform sphere of ε 4 is a stand-in for a protein. Depths near the surface are interpolated within one ion radius. In this model the net always rises from water to core.
- **Hydrogen bond.** Point charges and a hand-set overlap term. Its size is reasonable, but its details are not measured. In the toy, bending costs energy mostly through repulsion as atoms crowd. The ε slider is not physical at contact.
- **Depletion.** Asakura–Oosawa holds for dilute crowders; here they are dense, the pull at contact is about 3.5 times the formula, and a wedged crowder pushes the disks apart. Both disks are held, so the reading does not depend on slow disks; the hand re-places any crowder it would overlap. The live reading uses a wider skin than the long run, so it reads the sharpest peak at about 85% of its height.
- **Ledger.** Only ΔH is calorimetric; ΔG uses a binding constant from other work, and −TΔS follows from those two. All five Klumb mutants are shown, at 37 °C, with the 25 °C differences stated. The seven terms are this game's illustration, set to add up, and have no unique definition even in principle.

## Rebuild

```sh
mkdir -p ~/.cache/pchem-learner && cd ~/.cache/pchem-learner
npm init -y && npm install three@0.187.0 esbuild@0.28.2
cd -
node tools/precompute_mb.mjs      # Optional: about an hour on ten cores. Results are in tools/mb_raw.json.
node tools/precompute_disks.mjs   # Optional: a few minutes.
node tools/make_table.mjs
DEPS=$HOME/.cache/pchem-learner node tools/build.mjs
node tools/test_chem.mjs
```

## Code

- `src/sim/` holds the physics, with no screen code, so `tools/test_chem.mjs` can check it. That covers the Mercedes-Benz energy against a hand-worked example, detailed balance against exact quadrature for two waters, the signs of the hydrophobic effect, compensation and the bonds-off controls, the live hole count against its exact small-radius result, a measured Debye length against theory, the Keesom and London limits, and partition-function identities for chains.
- `src/render.js` draws washi, seigaiha and instanced ink molecules with Three.js.
- `src/bench.js` lets each experiment be a plain async script.
- `src/chapters/` holds the seventeen experiments.

Sources are named in the note that closes each print.
