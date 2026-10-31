# Molecular biology of the cell learner

A living cell drawn as a stained glass rose window. Each pane is a zoom, from the cell through an organelle down to one real molecular machine. You work as that molecule, and the rules of play are its chemistry. Finishing a chapter lights its pane, so what the molecule did stays visible in the whole cell.

The chapters follow one day of a human cell answering a growth signal, and each hands its product to the next.

Open `index.html`. It is one file and needs no network.

## Chapters

| # | Hour | Chapter | Molecule | You do | The rule of the game is |
|---|---|---|---|---|---|
| 1 | 0 | The switch | Ras, SOS, GAP, RAF, MEK, ERK | Flip Ras and keep ERK on for as long as you can | Ras flips between GTP and GDP. Fos protein survives only if ERK is still on when it appears, and that sets cyclin D. Too much signal makes SOS let go. Then G12V, which GAP barely switches off |
| 2 | 1 | Reading the gene | RNA polymerase II, TFIIS, U1 | Pair each template base, then find the splice sites | Template read 3′ to 5′, U for T, stall on a mismatch, TFIIS cuts back two bases, U1 marks the donor by pairing, first AG after the branch |
| 3 | 2 | Two checks for every codon | Ribosome, EF-Tu, tRNA | Set the pace: hold to hurry, let go to give a wrong tRNA time | The ribosome senses the helix itself. A wrong tRNA escapes each check by chance, so the tallies multiply on screen, and hurrying raises what gets through |
| 4 | 4 | Where does it go? | SRP, Sec61, Hsp70, signal peptidase | Sort real proteins by sequence, then thread TGF-α | A hydrophobic core means SRP. A greasy stretch of about 20 residues leaves sideways as a stop-transfer |
| 5 | 8 | The rotary engine | ATP synthase, respiratory chain | Spin the c-ring, tap NADH, choose a ring | A bare carboxylate cannot enter lipid. 3 ATP per turn, c protons per turn, stall at ΔG/(F·c/3). Sets the ATP stock for the rest of the day |
| 6 | 12 | Salt in, salt out | KcsA, Na⁺/K⁺-ATPase | Test the filter, then run the pump by hand | K⁺ passes and Na⁺ does not. 3 Na⁺, ATP, outer gate, 2 K⁺, inner gate. Open one gate while the other is open and the gradient collapses. Voltage from the Goldman equation, swelling from the Na⁺ left inside |
| 7 | 18 | Eight nanometres at a time | Kinesin, microtubule | Time ATP onto the empty head, left and right in turn | One ATP per 8 nm step, heads move 16 nm, gating keeps one head on, rigor when ATP is short, loss of the GTP cap shrinks the track |
| 8 | 23 | The cut | Aurora B, MCC, APC/C, proteasome, separase | Correct attachments, clear MCC, build ubiquitin chains, cut cohesin | No tension lets Aurora B reach the kinetochore. One loose kinetochore makes MCC and stops APC/C. Securin must go before separase cuts, and then the cell divides |

Each chapter has three roses. The third is meant to be hard.

### The shape of the molecule

Four chapters open with a short moment where you drag a slider between two real structures. The beads move between real coordinates, laid onto each other by least squares over a core that stays still (`tools/pdb.mjs` prints each fit and its RMSD). For β the moving residues 133–192 are left out, and for kinesin the core is trimmed by iteration.

| Chapter | From | To | Shows |
|---|---|---|---|
| 1 | 4Q21 | 5P21 | Switch I and II close on the γ-phosphate, which is why RAF binds GTP-Ras |
| 3 | 1J5E | 1IBM | A1492 and A1493 swing out onto the codon–anticodon helix. G530 is shown too, and the third position is left looser |
| 5 | 2XND chain F | 2XND chain E | γ props one β open while the others stay shut on ATP. This is the Tight→Open step of the cycle |
| 7 | 1BG2 | 1MKJ | The neck linker undocked and docked. The linker itself fades in, because it is disordered in 1BG2 |

Chapter 6 makes the point as a rule of play (two gates never open together), and chapter 8 as a playable checkpoint.

### One cell, carried through the day

The cell has a state that the window shows: a bar for cyclin D, ATP stock, voltage and misfolded protein, and the glass itself.

- **ERK duration sets cyclin D.** A transient pulse loses Fos, cyclin D stays low, fewer polymerases load, the cell waits in G1, and every later hour label moves on by up to 5 hours. Fewer cyclin D beads gather round the nucleus.
- **Your transcript is the mRNA.** A base left wrong in chapter 2 can change an amino acid in chapter 3 or make a stop codon.
- **Wrong amino acids misfold.** They appear as a chain for Hsp70 in chapter 4 and as ruby clumps in the window.
- **ATP is a budget.** Chapter 5 sets the stock, and the pump, kinesin, ubiquitin and MCC disassembly spend it. A thin stock means waiting: ATP arrives slower, the motor stands in rigor. It never ends the game.
- **A failing pump swells the cell.** Na⁺ left inside enlarges the window for the rest of the day.

A new run of chapter 1 starts a new day.

### Break it

After each chapter you choose what a real drug will do, then watch it in the window. A wrong answer explains why it is wrong.

| Chapter | Drug | Target | Limits stated |
|---|---|---|---|
| 1 | Sotorasib | Cys12 of KRAS G12C, GDP form | Only G12C has the cysteine |
| 2 | α-Amanitin | Pol II, by the bridge helix | Synthesis crawls. Liver takes it up |
| 3 | G418 | Decoding centre of the ribosome | Acts on ribosomes like ours too; the crystal is yeast 80S (5NDG). High doses also hold back elongation. Paromomycin named for bacteria, cycloheximide as the contrast |
| 4 | Mycolactone | Sec61 | "Many" proteins: it depends on the signal |
| 5 | Oligomycin, DNP | c-ring; the membrane | The gradient stays high with one and collapses with the other |
| 6 | Ouabain | Pump, from outside | Swelling is from red cells. Digoxin eases symptoms |
| 7 | Taxol | β-Tubulin | Mitotic arrest at high doses, extra poles at tumour levels, slower axonal transport at high doses. Monastrol is noted as a kinesin-5 drug |
| 8 | Bortezomib | β5 site of the proteasome | Metaphase arrest shown directly in fission yeast, and with MG132 in human cells. Then the division is shown again |

### Closing the circle

At the end of the day ADAM17 cuts TGF-α from the surface, it lands on EGFR on this cell and its neighbours, and Ras switches on again.

## Music

A slow dance for harp and recorder in D Dorian, 3/4, in `src/logic/music.js`, chosen to match the stained glass. It is written out with rests, and no note lasts more than two beats.

## Model limits

These are teaching models, and each chapter says where it departs from life.

- Time is compressed everywhere. A kinesin step takes about a second here and about 10 ms in a cell. The Na⁺/K⁺ pump turns about once in 5 seconds here and about 200 times a second in a cell.
- The ATP stock is a game budget. Real cells hold ATP nearly constant unless something is badly wrong. Hours of G1 delay and polymerase counts are illustrative, not measured.
- Ras: the cascade and the Fos model are hand-fitted curves, the feedback onto SOS runs at any signal strength and fires here as a discrete event, background GAPs turn Ras off after 4 to 9 seconds, five of each kinase are drawn though real copy numbers differ, and two of five Ras stand for the mutant share of the cell. The Fos logic is from mouse fibroblasts.
- Transcription: the transcript shown is the start of the coding part. NM_053056.3 has its coding sequence at 159..1046, so Pol II really starts 158 bases earlier, in the 5′ leader. 36 bases are played and 162 skipped. The spliceosome is reduced to U1 pairing and the first-AG rule. U1 pairing alone does not choose the site: across the gene other sites pair more strongly. The branch point is not located, because it is not known for this intron. The 5′ cap and poly-A tail are left out.
- Translation: the player sets the pace, and the ribosome senses. The gap between correct and wrong tRNA is about 20-fold (slow pace) here against about 650-fold in bacteria, so that errors can be seen, and the tally of 1 in N is per wrong tRNA, much worse than a real ribosome. It is not the 1 in 1,000 to 10,000 per amino acid measured in cells. Pace is one lever: a real cell does not have one. Proofreading rates were measured in bacteria. The tally adds a simulated run of the other 280 codons at your pace.
- Targeting: the rule of 8 hydrophobic residues in 10 is a rule of thumb that happens to sort these eleven real proteins. Real recognition is subtler. Hydrophobicity is on the Kyte–Doolittle scale. The TGF-α signal cut is predicted.
- ATP synthase: stall voltages use ΔG = 50 kJ/mol. c/3 is the simple-model ratio, and measured ratios differ somewhat. Ten protons per NADH is a common but debated estimate. The stalk is a drawn line, not a structure.
- Ions: ions on screen follow concentrations loosely, K⁺ outside is shown commoner than the real 1 in 30, and concentrations change far faster than in life. Whether the selectivity filter works by rigid fit is debated.
- Kinesin: the one-head-bound waiting state applies at low ATP. One protofilament is drawn in place of 13. The vesicle is drawn far smaller than life. Both crystals in the morph hold ADP, and in 1MKJ a bound sulfate holds the linker docked.
- Division: five pairs of sister chromatids stand for the 46 of a human cell. Four ubiquitins is a simplification. Inhibition of separase by Cdk1 is left out. Only the 20S core of the proteasome is drawn. MCC is taken apart by tapping, and in cells other routes also help.
- Scale differs from scene to scene.

Several structures are from other species, and the chapter notes say so: ribosome and 30S from T. thermophilus, Sec61 from the archaeon M. jannaschii (SecYEβ), SRP and Hsp70 from E. coli, KcsA from S. lividans, Pol II and separase from yeast, MCC from fission yeast, ATP synthase from cow, pump from pig and shark, ERK2 from rat.

## Structures

Reduced to Cα and P positions by `tools/pdb.mjs` and drawn flat in the manner of David Goodsell. PDB data are in the public domain under CC0 (wwPDB, rcsb.org).

| Name in game | PDB | What it is |
|---|---|---|
| EGFR with EGF | 1IVO | Human ectodomain dimer |
| Ras, GTP and GDP | 5P21, 4Q21 | Human H-Ras (Pai 1990; Milburn 1990) |
| SOS, GAP | 1BKD, 1WQ1 | Human, each from a complex with Ras |
| RAF, MEK, ERK | 3OMV, 1S9J, 2ERK | Human C-RAF, human MEK1, rat phospho-ERK2 |
| RNA polymerase II | 1I6H | Yeast elongation complex (Gnatt 2001) |
| Ribosome | 4V51 | T. thermophilus 70S with tRNAs |
| tRNA, EF-Tu | 1EHZ, 1TTT | Yeast tRNA-Phe; T. aquaticus ternary complex |
| Decoding centre | 1J5E, 1IBM | T. thermophilus 30S, empty and with a tRNA-Phe anticodon stem-loop on UUU |
| SRP | 2J28 | E. coli SRP on a ribosome |
| Sec61 | 1RH5 | M. jannaschii SecYEβ |
| Hsp70 | 2KHO | E. coli DnaK |
| ATP synthase | 2XND, 2XOK, 2W5J | Bovine F1-c8, yeast F1-c10, spinach c14 ring |
| K⁺ channel | 1K4C | KcsA |
| Na⁺/K⁺ pump | 3WGU, 2ZXE | Pig Na⁺ state, shark K⁺ state |
| Kinesin, tubulin | 1BG2, 1MKJ, 1JFF | Human motor domain, undocked and docked; bovine αβ-tubulin |
| Aurora B, APC/C | 4AF3, 4UI9 | Human |
| MCC | 4AEZ | S. pombe Cdc20, Mad2, Mad3 |
| Ubiquitin, proteasome | 1UBQ, 5LE5 | Human |
| Separase, Cdk–cyclin | 5U1T, 1FIN | Yeast separase–securin; human Cdk2–cyclin A |

## Sequences

CCND1 from Ensembl (ENST00000227507, GRCh38). Proteins from UniProt: P01135, P01308, P02768, P00533, P01130, P02452, P60709, P04406, P24385, P68871, P62258. The tests check that exon 1 translates to the UniProt protein, and that U1 pairs better at the real donor than anywhere in the 30 bases around it.

## Sources

Hopfield 1974 PNAS; Ninio 1975 Biochimie; Pape 1999 EMBO J; Gromadski & Rodnina 2004 Mol Cell; Ogle 2001 Science; Kramer & Farabaugh 2007 RNA; Ingolia 2011 Cell; Demeshkina 2012 Nature; Rozov 2016 Nat Commun; Loftfield 1972 Biochem J; Prokhorova 2017 PNAS; Bar-Nun 1983 BBA; Schneider-Poetsch 2010 Nat Chem Biol. Scheffzek 1997 Science; Wey 2013 Biochemistry; Prior 2020 Cancer Res; Murphy 2002 Nat Cell Biol; Brown 1998 Mol Cell Biol; Weber 1997 Biochem J; Lowenstein 1992 Cell; Vetter & Wittinghofer 2001 Science; Langlois 1995 JBC; Kamioka 2010 JBC; Canon 2019 Nature; Ostrem 2013 Nature. Jonkers 2014 eLife; Sydow 2009 Mol Cell; Wang 2009 Science; Gout 2017 Sci Adv; Burset 2000 NAR; Bushnell 2002 PNAS; Kaplan 2008 Mol Cell; Letschert 2006 Toxicol Sci. Bernstein 1989 Nature; Keenan 1998 Cell; Janda 2010 Nature; Hessa 2005 Nature, 2007 Nature; Kyte & Doolittle 1982 JMB; Mayer & Bukau 2005 CMLS; Akopian 2013 Annu Rev Biochem; Baron 2016 JEM; McKenna 2016, 2017 J Cell Sci; Gérard 2020 Mol Cell; Itskanov 2023 Nat Chem Biol. Noji 1997 Nature; Watt 2010 PNAS; Stock 1999 Science; Pogoryelov 2009 Nat Struct Mol Biol; Hinkle 2005 BBA; Abrahams 1994 Nature; Yang 2003 PNAS; Martin 2014 PNAS; Czub & Grubmüller 2014 JACS; Zhou 2015 eLife; Allegretti 2015 Nature; Symersky 2012 PNAS; Brand 2011 Biochem J; Grundlingh 2011 J Med Toxicol; Nicholls 2001 BST. Doyle 1998 Science; Zhou 2001 Nature; Noskov 2004 Nature; Köpfer 2014 Science; Rolfe & Brown 1997 Physiol Rev; LeMasurier 2001 JGP; Artigas & Gadsby 2003 PNAS; Tosteson & Hoffman 1960 JGP; Laursen 2013 PNAS. Schnitzer & Block 1997 Nature; Hua 1997 Nature; Asbury 2003 Science; Yildiz 2004 Science; Rice 1999 Nature; Mori 2007 Nature; Alonso 2007 Science; Sindelar 2002 NSB; Milic 2014 PNAS; Mickolajczyk 2015 PNAS; Hancock 2016 Biophys J; Rosenfeld 2003 JBC; Guydosh & Block 2006 PNAS; Yildiz 2008 Cell; Andreasson 2015 eLife; Mitchison & Kirschner 1984 Nature; Zasadil 2014 Sci Transl Med; LaPointe 2013 Neurotoxicology; Weaver 2014 MBoC; Mayer 1999 Science. Tanaka 2002 Cell; Lampson 2004 NCB; Sudakin 2001 JCB; Uhlmann 1999 Nature, 2000 Cell; Meyer & Rape 2014 Cell; Yau 2017 Cell; Lu 2015 Science; Thrower 2000 EMBO J; Liu 2009 Science; Rieder 1995 JCB; De Antoni 2005 Curr Biol; Eytan 2014 PNAS; Ye 2015 eLife; Alfieri 2018 Nature; Sherwood 1993 PNAS; Zur 2001 EMBO J; Takeda 2011 PLoS One; Zeng 2010 Cancer Cell; Groll 2006 Structure; Peschon 1998 Science; Sahin 2004 JCB; Kirschner & Mitchison 1986 Cell.

## Rebuild

```sh
mkdir -p ~/.cache/pchem-learner && cd ~/.cache/pchem-learner
npm init -y && npm install three@0.187.0 esbuild@0.28.2
cd -
DEPS=$HOME/.cache/pchem-learner node tools/build.mjs
node tools/test.mjs
```

`tools/pdb.mjs` rebuilds `src/molecules.js` from a folder of PDB files, given as `PDBDIR`.

## How it is made

- `src/window.js` paints the rose window and the glass behind each close view with one shader, and runs the camera.
- `src/kit.js` turns PDB beads into cloisonné sprites and holds tiles, buttons and sparks on a 390 × 640 virtual stage.
- `src/ch/` has one file per chapter.
- `src/logic/` has the screen-free rules: genetic code, proofreading, cascade and Fos, hydrophobicity, ATP synthase gearing, Goldman voltage, two-gate pump cycle, kinesin stepping, and the state of the cell. `tools/test.mjs` tests them.
- `src/chapters.js` holds the words of each chapter, its drug and the layout of the glass.
