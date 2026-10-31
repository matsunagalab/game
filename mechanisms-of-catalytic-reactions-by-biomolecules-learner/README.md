# Mechanisms of catalytic reactions by biomolecules learner

A browser game about how enzymes work, played by pushing electrons. You draw curved arrows with a finger on real active sites, and an electron-bookkeeping engine checks them. It holds atoms, bonds, lone pairs, formal charges, valence and the octet, plus the rules listed below. The game checks that electrons add up, that atoms can reach, and a short list of hand-written rules about what a species can bear. It has no orbital direction and does not rank by pKa, so "legal" means no more than that, and the game says so at the start.

Everything is in one self-contained `index.html`. No network is needed while playing.

Open it on a phone in portrait, a tablet, or a computer. Progress is saved under the local-storage key `mechanisms-catalytic-learner-v1`.

## The world

Gold on black: Javanese and Balinese prada, gold leaf on deep cloth, with batik geometry. Each chapter is a panel of one folding album. Finishing a chapter gilds its panel, and the three reward tiers are three layers of one pattern. When all nine panels hold gold they leave their line and meet as one large figure, a wheel of nine curved arrows.

The enzyme is a dark sculpture contoured from its real coordinates. Active-site atoms are small jewels at their measured positions. Each electron pair the model tracks is two gold sparks, so a moved pair is visible as exactly two sparks running along your arrow.

The gold is a real shader: a tile of hammered leaf with hairline cracks, overlapping sheets, an anisotropic highlight that follows the batik lines, cloth fibre, and bloom.

## How a chapter runs

1. **Draw the mechanism.** Any legal route to the next intermediate is accepted.
2. **The strategy.** A mechanic that is the catalytic strategy itself.
3. **The evidence.** Predict an experiment on a dial or by choice, then see the measured value.
4. **The cycle.** Your own arrows replay in time with the gamelan. Each gong is one turnover.

Three gold leaves: the mechanism drawn; the strategy solved; then the mechanism with no hints and the key experiment predicted.

## Chapters

| # | Enzyme | Strategy | Second mechanic | Evidence |
|---|---|---|---|---|
| 1 | None: an amide in water | Why an enzyme at all | Find which atoms need a base, an acid and a charge pocket, all read from your own route | Half-life of a peptide bond |
| 2 | Subtilisin BPN′ (burst data from chymotrypsin) | Covalent catalysis, general base, oxyanion hole | Turn His64 about its real χ2 axis until both hydrogen bonds close | Burst kinetics; N155L in the oxyanion hole; H64A; removing the whole triad |
| 3 | Bovine RNase A | General acid and base, in-line attack | Set both histidines. One of four states passes this game's rules, and the screen names the rules. A bell curve emerges from populations | H119A with good and poor leaving groups; K41C |
| 4 | Human carbonic anhydrase II | Metal ion, proton shuttle | Be the shuttle: run protons along the water wire, lose His64, rescue with imidazole. The piece follows | Which buffers rescue; solvent isotope effect |
| 5 | TIM (yeast structure) | A closing loop: guarding an intermediate, or shutting out water | Hold the real loop shut through the enediol, release for the product | Loop-tip deletion; viscosity |
| 6 | Horse liver ADH | Hydride transfer to NAD⁺ | Pluck C–H and C–D; the pitch ratio and the isotope effect are computed | Fitted and observed H/D on the hydride step; which step limits kcat; tunnelling |
| 7 | E. coli aspartate aminotransferase | PLP as an electron sink | Turn Cα on a Newman projection until the C–H bond lies along the pi system (Dunathan) | K258A; the half-reaction with no second substrate |
| 8 | Hen egg-white lysozyme | A textbook put to the test | Choose enzyme and substrate to trap the intermediate | Predict the mass-spectrometry peak |
| 9 | Yeast OMP decarboxylase | Binding the transition state | Choose what sits at C6; each choice shows a measured Ki | Half-life of the uncatalysed reaction, its revision, and computed proficiency |

## The electron engine

`src/chem/` runs with no screen, and `tools/test.mjs` plays it directly.

- A state is a table of lone pairs and bond orders. An arrow moves one pair. Electrons and charge are conserved at every arrow, and the tests check that.
- After an arrow, an atom may be overfull or short of electrons. If more arrows can repair it, the game waits and says what is wrong. If nothing can, the arrow fails with the actual reason.
- Reasons include pentavalent carbon, a bare proton with no base in reach, a wrong leaving group (amide anion, bare alkoxide), a carbanion with nothing to spread into, an aromatic ring's lone pair, and atoms too far apart.
- Reach combines distance with bonds. `tools/structures.mjs` measures which atoms are close, using cut-offs that are chosen by hand: 3.7 Å to form a bond, 4.2 Å to pass a proton, 3.1 Å for a C–H hydrogen to move as hydride, 3.6 Å in the water chapter. Two atoms may not form a bond if a path of three or fewer bonds already joins them, so no ring of three or four closes. A proton may not pass directly between atoms two bonds apart, so a tautomer shift needs a real relay. These path rules hold for the state as it changes and for the state the step began from. Each proton's donor and acceptor are also recorded through a step and checked against the state it ends in, so the order of arrows cannot get round the proton rule. A real relay through a water is still allowed. A phosphorus on the line between two oxygens blocks a proton between them.
- `tools/routes.mjs` lets the engine play every chapter alone and records each species on a legal route to the next intermediate. The game looks a species up in that table.
- Two drawings with the same nuclei and sigma bonds count as one species, so resonance forms are the same intermediate. A completed intermediate is redrawn in its usual form.

Species rules are written by hand as well: which atoms may carry an anion or a carbanion in each chapter, no bare alkoxide, phosphoryl oxygens never protonated, histidine rings kept intact, hydride only from C–H, and no new bond onto an oxygen or nitrogen with a full shell. NAD⁺, PLP and OMP rings are judged by electron counting only. These decide some results, so read the claims below with that in mind.

- **From coordinates.** In alcohol dehydrogenase the pro-S hydrogen fails as too far: 4.3 Å from C4 in 4DXH, against 2.7 Å for pro-R. Those hydrogens are placed by rule on crystal atoms, so the distances are modelled.
- **From this game's rules.** In RNase A, one of four protonation states passes (one of nine with neutral tautomers). That follows from a base needing a free lone pair, from no proton crossing phosphorus, and from phosphoryl oxygens carrying no proton here. Without the last rule three of four pass, and the test suite checks that. The block on crossing phosphorus is also a hand choice: an atom within 0.7 Å of the line between two atoms blocks a proton hop, and that threshold is picked by hand. Without it the 2′ oxygen's proton hands straight to the 5′ oxygen and every state passes. The tests check that too. The screen says this.
- **Hand-assisted.** TIM's phosphate loss stays legal because that oxygen is listed as allowed to leave as an anion. Lysozyme's two routes are both declared, and only the experiment separates them.

## Music

A gamelan piece written out in `src/audio/score.js`, in a slendro-like tuning. All instruments are synthesised and rendered once into buffers: saron, demung, peking, gangsa pairs, bonang, kenong, kempul, kethuk and gong. Partials are inharmonic. Bars are struck in pairs tuned a few hertz apart, which gives the beating called ombak. Two gangsa parts interlock as kotekan, and the test suite checks that they never play together. Every tone decays by itself, and the form leaves silent passages.

The form is a lancaran-like colotomic cycle of eight balungan beats, closed by the gong. In this game one gong is one turnover, and each mechanism step falls on a structural beat. While you draw, the gong is withheld. The first one sounds when your cycle closes.

The rate mapping is compressed, and the game says so: **each 1000-fold fall in rate doubles the time between gongs**, exactly. A change of irama sets how dense the music is, and the pulse takes up the remainder, so a slower cycle stays alive and even a 20-fold change is heard. Removing His64 from subtilisin moves the piece from a gong every 13 s to one every 52 s. A true clock would not fit: the real difference is a factor of about a million.

## Model limits

- Atom positions after the first state are a teaching model from a small constraint solver. They keep bond lengths and angles, with crystal protein atoms held near their measured places. No intermediate geometry here is a crystal unless stated.
- Hydrogens, waters that arrive during a step, and missing substrate atoms are placed by stated rules. See `src/chem/mechanisms.js`.
- Crystals used as stand-ins, each labelled on screen: an inhibitor peptide for the subtilisin substrate; uridine vanadate for RNase, a transition-state analogue from which earlier and later forms are modelled; PGH mapped onto DHAP; trifluoroethanol shown as ethanol; a reduced aldimine analogue for AAT; the covalent E35Q lysozyme, shown as Glu35 with the bond to the next sugar modelled; BMP with a modelled carboxylate for OMPDC.
- Phosphoryl oxygens are not allowed to take protons. Routes through them (Breslow) are debated, and this model leaves them out.
- Lysozyme's leaving oxygen is placed by rule behind C1 from Asp52, because the crystal is of the covalent form. After relaxing, O5–C1–Oi is about 110° and OD2–C1–Oi about 155°, so it is not directly opposite, and it sits 5.87 Å from Glu35. That is past the usual 4.2 Å, so that single hop is an allowed exception, stated on screen. It may not carry the proton on to Asp52.
- In the water chapter the charged intermediate and H₃O⁺ are a teaching simplification, stated on screen: neutral routes where protons shuffle together are not offered.
- The engine has no energies. It judges what can exist and what can reach what. Proton transfers are not ranked by pKa except through the species rules.
- pKa values in failure messages (near 35 for an amide anion, near 16 for an alkoxide) are textbook teaching values in water, and acid strength in an active site differs.
- The carbonic anhydrase rate meter is a teaching model of steps in series. It uses kChem 10⁷ s⁻¹ and kShuttle 1.1 × 10⁶ s⁻¹, scaled so wild type lands near the measured kcat, and these are not measured steps. Its floor comes from a ratio measured without buffer, its ceiling (4.4 × 10⁵ s⁻¹) from the reported rescue of about 40%, and its half-saturation concentration of 20 mM is a placeholder. An et al. 2002 report rescued rates near 10⁵ s⁻¹, so the ceiling runs high.
- The TIM loop stage is a teaching model. Real loops flip about 30,000 times a second, and one solid-state NMR study saw similar rates with and without ligand. The chance of loss comes from the measured ratio for the mutant with no loop tip. The purpose of the loop is shown as argued, not settled.
- The stereoelectronic argument for phosphate loss in TIM is deliberately not used: calculations weaken it (Zhang et al. 2002).
- In 1ARG the C4–C4′–N plane is twisted about 32° out of the ring, and the alpha hydrogen is placed by rule, so the Dunathan angles are a guide. Both facts are on screen.
- The cycle stage for RNase A replays only the first two steps, because kcat covers cleavage only.
- Ketimine hydrolysis in AAT and Schiff-base exchange are not drawn.
- Rates in the cycle stage use different substrates and organisms, and each is named on screen. The cross-chapter comparison is rough.

## Sources

Status: **A** read in abstract or full text, or read in the source's own tables. **S** seen only quoted in another paper. **U** could not be checked; see below.

Peptide and water: benchmark 600 years at 25 °C (A: Stockbridge et al. 2010, Table 1). Estimates at 25 °C of about 350 to 600 years, and about 250 years measured at 37 °C (S: Radzicka & Wolfenden 1996 JACS 118:6105; Smith & Hansen 1998 JACS 120:8910, range supplied by the independent review, originals not read). Kahne & Still 1988 JACS 110:7529, a resin-bound peptide, about 100-fold shorter (S).

Serine proteases: Hartley & Kilby 1954 Biochem J 56:288, read by the independent review in the scan: intercept 1.1 to 1.2 mol/mol, p. 296 (A). Carter & Wells 1988 Nature 332:564, triad synergy about 2 × 10⁶ and total at least 10⁹ to 10¹⁰ (A). Carter & Wells 1987 Science 237:394, and the kinetic table in US patent 5371008: kcat 8.1 and 8.1 × 10⁻⁶ s⁻¹, 1.6 × 10⁻² s⁻¹ with His at P2 (A). Bryan et al. 1986 PNAS 83:3743, Leu155: kcat 200 to 300-fold lower, KM unaltered (A). Blow et al. 1969 Nature 221:337 (citation confirmed; charge relay as described by Cuchillo et al. 2011, A). Kossiakoff & Spencer 1981 Biochemistry 20:6462, neutron structure of trypsin: the base is His57, not Asp102 (A). Wilmouth et al. 2001 Nat Struct Biol 8:689 (A).

RNase A: Thompson et al. 1995 Bioorg Chem 23:471, kcat 1.4 × 10³ s⁻¹ at pH 6.0, 25 °C, maximal rate at pH 6.0 (A). Park et al. 2001 Biochemistry 40:4949, more than 10⁴-fold (A). Thompson & Raines 1994 JACS 116:5467, read in full at PMC3056461: Table 1 gives H119A about 2400-fold on UpA and 1.4 × 10⁴-fold on poly(C), which the paper's text rounds to 10⁴-fold for both; on UpOC₆H₄-p-NO₂, H12A about 5000-fold and H119A unaffected; leaving-group pKa about 14.8 and 7.14 (A). Thompson et al. 1994 Biochemistry 33:7408, cyclic intermediate released (A). Messmore et al. 1995 JACS 117:8057, K41C 10⁵-fold on poly(C) (A). Usher et al. 1972 PNAS 69:115, in-line geometry (A). pKa values 5.8 and 6.2 (S); microscopic 5.7 and 6.3, kinetic 5.2 and 6.3 (S). Cuchillo et al. 2011 Biochemistry 50:7835, on the assignments once being swapped (A).

Carbonic anhydrase: Steiner et al. 1975 Eur J Biochem 59:253 (A). kcat 1.0 × 10⁶ s⁻¹ at 25 °C, pH 8.3 (S, West et al. 2012). pKa about 6.8 to 7.0 (S). Tu et al. 1989 Biochemistry 28:7913 (A). Duda et al. 2001 Biochemistry 40:1741 (A). An et al. 2002 Biochemistry 41:3235: replacing Trp5 had no significant effect on rescue (A). Fisher et al. 2010, 2011; Maupin et al. 2009 on the debated water network (A). Domsic et al. 2008 JBC 283:30766 (A).

TIM: Pompliano et al. 1990 Biochemistry 29:3186 (A). Richard 1991 Biochemistry 30:4581 (A). Blacklow et al. 1988 Biochemistry 27:1158 (A). Malabanan et al. 2011 Biochemistry 50:5767, rabbit kcat: 4300 s⁻¹ from GAP, 870 s⁻¹ from DHAP (A). Malabanan et al. 2010 Curr Opin Struct Biol 20:702 (A). Lodi & Knowles 1991 Biochemistry 30:6948 (A). Harris et al. 1998; Cui & Karplus 2001 on criss-cross routes (A). Joseph et al. 1990 Science 249:1425 (A). Williams & McDermott 1995 (A). Zhang et al. 2002 JACS 124:14871 (A).

ADH: Plapp & Ramaswamy 2012 Biochemistry 51:4035 (A). Plapp 2010 Arch Biochem Biophys 493:3, domain closure, and rates in Tables 1 and 2: fitted 490 and 150 s⁻¹, observed apparent k4 180 s⁻¹ with H/D 3.8, footnote g (A). Sekhar & Plapp 1990 (A). Cha et al. 1989 Science 243:1325 (A), exponent 10.2 ± 2.4 via Nagel & Klinman 2010 (S). Kohen et al. 1999 (S). The zero-point estimate of about 6.9 is computed here from 2900 and 2100 cm⁻¹.

AAT: Dunathan 1966 PNAS 55:712 (citation confirmed; idea as stated by Toney 2011, A). Toney & Kirsch 1989 Science 243:1485 and 1993 Biochemistry 32:1471 (A). Yano et al. 1992 (A). Kuramitsu et al. 1990, values via Yano et al. 1998 (S, probably half-reaction constants). Toney 2014 (A). Hayashi et al. 1995 (A). Graber et al. 1995 for 1ARG (RCSB).

Lysozyme: Vocadlo et al. 2001 Nature 412:835, full text, including masses 14,316, 14,683 and 14,719 (A). Koshland 1953 Biol Rev 28:416 and Blake et al. 1965 (citations confirmed). Bottoni et al. 2005 Proteins 59:118; Bowman et al. 2008 Chem Commun 4425 (A). Banerjee & Rupley 1975, kcat 0.135 s⁻¹ (A). Malcolm et al. 1989 PNAS 86:133 (A).

OMPDC: Radzicka & Wolfenden 1995 Science 267:90, 78 million years from the abstract (A); other numbers via Chan et al. 2009 (S). Lewis & Wolfenden 2009 Biochemistry 48:8738 (A). Miller et al. 2000 PNAS 97:2011 (A). Levine et al. 1980 Biochemistry 19:4993 (A). Inhibitors of the M. thermautotrophicus enzyme (A). Wu et al. 2000 PNAS 97:2017 (A). Warshel et al. 2000 Biochemistry 39:14728 (A). Rindfleisch et al. 2022 Nat Catal 5:332, on the human enzyme (title and bibliographic record read by me, U). Fujihashi et al. 2013 JACS 135:17432, on 6-amino-UMP and on distortion worth 10 to 15% (A). Toth et al. 2007; Amyes et al. 2008; Harris et al. 2000; Van Vleet et al. 2008 (A). Richard et al. 2018 on the phosphodianion (A). Lad et al. 2003 PNAS 100:5607 and Lewis & Wolfenden 2008 PNAS 105:17328 on later records (A).

### Not verified

- Individual kcat/KM values for S221A, D32A and the double mutants of Carter & Wells 1988 could not be found, so they are not used. Only the abstract's numbers appear.
- A fact-checking pass for chapters 1 to 3 stopped early, so those chapters rest on abstracts and on text quoted in other papers. Numbers that could not be reached were left out. The planned pH-rate calculation for amide hydrolysis was replaced because the rate constants of Smith & Hansen 1998 could not be reached.

## PDB entries

| Chapter | Entry | Holds |
|---|---|---|
| 2 | 2SIC | Subtilisin BPN′ with Streptomyces subtilisin inhibitor, 1.8 Å |
| 3 | 6RSA | RNase A with uridine vanadate, a transition-state analogue, 2.0 Å, joint X-ray and neutron. O2′–V–apical O is 166° |
| 4 | 2CBA, 3D92 | Human CA II, 1.54 Å, wire waters 263, 318, 292; CO₂ from 3D92, 1.1 Å, same crystal setting |
| 5 | 7TIM, 1YPI | Yeast TIM with PGH, closed; unliganded, open. The loop moves up to 8.3 Å, at Gly173, after superposition |
| 6 | 4DXH | Horse liver ADH, NAD⁺, trifluoroethanol, 1.12 Å |
| 7 | 1ARG | E. coli AAT with a phosphopyridoxyl-aspartate analogue, 2.2 Å |
| 8 | 1H6M | E35Q hen lysozyme, covalent 2-fluoro glycosyl intermediate, 1.64 Å |
| 9 | 1DQX | Yeast OMPDC with BMP, 2.4 Å |

Coordinates are from the Protein Data Bank, available under CC0 1.0.

## Rebuilding

```sh
# Dependencies live outside the repository.
#   DEPS holds three@0.187, esbuild and the fonts.
export DEPS=$HOME/.cache/pchem-learner

mkdir -p pdb
for id in 2SIC 6RSA 2CBA 3D92 7TIM 1YPI 4DXH 1ARG 1H6M 1DQX; do
  curl -o pdb/$id.pdb https://files.rcsb.org/download/$id.pdb
done

PDBDIR=pdb node tools/structures.mjs   # sites, reach and bodies from the PDB files
node tools/routes.mjs                  # the engine plays every chapter, about 3 minutes
node tools/test.mjs                    # screen-free tests
node tools/build.mjs                   # writes index.html
```

## Fonts

Cormorant Upright and Alegreya Sans, both SIL Open Font License 1.1. Licences are in `assets/fonts/licenses/`.
