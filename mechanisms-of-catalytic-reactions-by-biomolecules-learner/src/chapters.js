// The words and the measured numbers. Every number here has a source in README.md.
// tag: m measured, c computed by this game, t teaching model.
// Anything tagged c is worked out here from its measured inputs, never typed in.
import { enediolLost, halfLife, YEAR } from './logic/rates.js';

export const OMP = { kcat: 39, kcatKm: 5.6e7, kNon1995: 2.8e-16, kNon2009: 3.4e-15 };
const HALF_PEPTIDE = 600;                 // years, an internal peptide bond at 25 °C, benchmark value
const MEAN_PEPTIDE = HALF_PEPTIDE / Math.LN2;
const halfMy = (k) => halfLife(k) / YEAR / 1e6;
const ADH_H = 490, ADH_D = 150;           // per second, hydride step, fitted by simulation (Plapp 2010, Table 1)
const LOST_RATIO = 5.5;                   // TIM without its loop tip, measured

export const CHAPTERS = [
  {
    key: 'water', title: 'Water alone', enzyme: 'No enzyme', strategy: 'Why an enzyme at all', free: true,
    where: 'Teaching model: no crystal here. The atoms are placed by hand so they can be read.',
    open: ['One amide bond, the bond that joins a protein, in plain water.', 'Your finger moves electrons. Draw from a lone pair or a bond to where the pair goes.', 'The game checks that electrons add up, that atoms can reach, and a short list of hand-written rules about what a species can bear. It has no orbital direction and does not rank by pKa, so "legal" means no more than that.'],
    steps: [
      { say: 'Drag a lone pair of the attacking water onto the carbonyl carbon.', nudge: 'That water oxygen is now positive. Let the helper water take one of its protons: drag the helper\'s lone pair to that proton, then send the O–H pair back to oxygen.', done: ['A tetrahedral carbon, with a negative oxygen. Nothing nearby holds that charge.', ['t', 'In neutral water protons probably shuffle at the same time, so the charge you see here is a teaching simplification.']] },
      { say: 'The nitrogen must gain a proton before it can leave. Send its lone pair to the proton on the helper water.', done: 'The nitrogen is positive now, and ready to leave without a charge.' },
      { say: 'Let the oxygen push back in, and break the bond to nitrogen.', done: 'The bond is cut. Water alone can do this, on paper.' },
    ],
    strategy2: 'tools', evidence: [
      { type: 'dial', key: true, ask: 'Your arrows are legal. How long until half of such bonds break, in neutral water at 25 °C?', unit: 'years', min: 1e-6, max: 1e7, start: 1e-3, truth: HALF_PEPTIDE, tol: 1.2,
        reveal: [['m', `About ${HALF_PEPTIDE} years for an internal peptide bond, from high-temperature rates extrapolated to 25 °C.`], ['m', 'Estimates at 25 °C run from about 350 to 600 years. A direct measurement at 37 °C gave about 250.'], ['m', 'An older figure of 7 years came from a peptide on a resin, and later work found it about 100 times too fast.']] },
    ],
    watch: { rate: 0, rateText: `No enzyme: one bond in about ${(Math.round(MEAN_PEPTIDE / 10) * 10).toFixed(0)} years on average`, steps: 3, say: 'The gong stays silent here. In plain water one turn of this cycle takes centuries.' },
  },
  {
    key: 'subtilisin', title: 'Subtilisin', enzyme: 'Subtilisin BPN′', strategy: 'Covalent catalysis, a general base and an oxyanion hole',
    where: 'Protein atoms: crystal 2SIC, a subtilisin with an inhibitor whose peptide sits like a substrate. Hydrogens, the water and all later positions are modelled.',
    open: ['This is the same bond, now in a real active site.', 'Ser221, His64 and Asp32 are a catalytic triad. Find a way to cut.'],
    steps: [
      { say: 'Attack the carbonyl with Ser221, and let His64 take its proton as you do.', nudge: 'Good. Keep going to the tetrahedral form.', done: 'The tetrahedral form. The oxyanion sits in a pocket of hydrogen bonds, the oxyanion hole.' },
      { say: 'Collapse it. The nitrogen must leave with a proton from His64.', nudge: 'The nitrogen now has its proton. Let the oxyanion push the bond off.', done: 'The amine has left. The substrate\'s acyl group is now bonded to serine.' },
      { say: 'A water arrives. Use His64 as a base again, and attack the acyl carbon.', nudge: 'Keep going to the second tetrahedral form.', done: 'The second tetrahedral form. The same hole holds it.' },
      { say: 'Collapse it, and give serine its proton back.', nudge: 'Serine now has its proton. Push the bond off.', done: 'Serine is free. One bond is cut, and the enzyme is unchanged.' },
    ],
    strategy2: 'triad', evidence: [
      { type: 'choice', ask: 'Add a p-nitrophenyl ester to chymotrypsin, and follow the yellow product. What does the first moment look like?', options: ['A steady line from the start', 'A fast burst, then a slow steady line', 'A slow start that speeds up'], correct: 1,
        reveal: [['m', 'A burst, about one product per enzyme, then a slow line (Hartley & Kilby 1954, on chymotrypsin).'], ['m', 'That is the two halves you drew: the acyl-enzyme forms fast, and water clears it slowly with these esters.']] },
      { type: 'choice', ask: 'Now the oxyanion hole. Replace Asn155 with leucine: the same size, but it cannot donate a hydrogen bond. What should change?', options: ['kcat falls, and KM stays the same', 'KM rises, and kcat stays the same', 'Nothing'], correct: 0,
        reveal: [['m', 'kcat fell 200 to 300-fold, and KM was unaltered (Bryan et al. 1986).'], ['t', 'That is what stabilising the tetrahedral form predicts: the hole helps the reaction, not the binding of the substrate.']] },
      { type: 'dial', key: true, ask: 'Replace His64 with alanine. By what factor does kcat fall?', unit: 'fold', min: 1, max: 1e12, start: 100, truth: 1e6, tol: 1,
        reveal: [['m', 'About a million-fold: from 8.1 to 8.1 × 10⁻⁶ per second on a Phe-Ala-Ala-Phe p-nitroanilide, pH 8.6, in the S24C background enzyme (Carter & Wells 1987).'], ['m', 'On that mutant, a histidine placed on the substrate brings kcat back about 2000-fold.']] },
      { type: 'choice', ask: 'Now remove all three: Ser221, His64 and Asp32. What happens?', options: ['About the same fall as one', 'The falls multiply, far past a million'], correct: 0,
        reveal: [['m', 'Far from additive. The triad works as a unit, worth a factor of about 2 × 10⁶ (Carter & Wells 1988).'], ['m', 'The enzyme as a whole gives at least 10⁹ to 10¹⁰, so something beyond the triad is still working.']] },
    ],
    watch: { rate: 8.1, rateText: 'kcat 8.1 per second, S24C subtilisin BPN′ on sFAAF-pNA, pH 8.6', steps: 4, say: 'Your cycle, turning. Each gong is one bond cut.', knock: { label: 'Remove His64', rate: 8.1e-6, text: 'kcat 8.1 × 10⁻⁶ per second, S24C:H64A', tag: 'm' } },
  },
  {
    key: 'rnase', title: 'Ribonuclease A', enzyme: 'Bovine RNase A', strategy: 'General acid and general base',
    where: 'Crystal 6RSA: uridine vanadate, a transition-state analogue. Vanadium stands for phosphorus, its apical oxygen for O5′. Earlier and later forms, hydrogens and water are modelled.',
    open: ['RNA is cut here. Two histidines sit on either side of the phosphate, with Lys41 close by.', 'One histidine must take a proton, and the other must give one.'],
    steps: [
      { say: 'Use His12 as a base. Let the 2′ oxygen attack phosphorus.', nudge: 'Keep going: the 2′ oxygen must end on phosphorus.', done: ['Phosphorus holds five bonds for a moment. Whether this form lives long enough to be an intermediate is debated.', ['c', 'In this crystal the attacking oxygen, the centre and the leaving oxygen lie nearly in a line: {inline}°.'], ['m', 'Phosphorothioate experiments showed this in-line path (Usher et al. 1972). Attack from behind turns phosphorus inside out, as wind turns an umbrella.']] },
      { say: 'Let it collapse. The 5′ oxygen must leave with a proton from His119.', nudge: 'Keep going.', done: ['The chain is cut, and a cyclic phosphate remains. Nearly all of it now leaves the enzyme.', ['m', 'Enzymes of this family released most of this intermediate rather than hydrolysing it (Thompson et al. 1994).']] },
      { say: 'Much later, a cyclic phosphate returns and water arrives. Now His119 is the base. Attack phosphorus.', nudge: 'Keep going.', done: 'Five bonds on phosphorus again.' },
      { say: 'Open the ring, and let His12 give the 2′ oxygen its proton.', nudge: 'Keep going.', done: 'Both histidines are back where they began.' },
    ],
    strategy2: 'protons', evidence: [
      { type: 'dial', ask: 'Replace His119 with alanine. By what factor does kcat/KM fall for UpA, a two-base RNA?', unit: 'fold', min: 1, max: 1e9, start: 10, truth: 2400, tol: 1,
        reveal: [['m', 'About 2400-fold on UpA, and 1.4 × 10⁴-fold on poly(C) (Thompson & Raines 1994).']] },
      { type: 'choice', key: true, ask: 'Now use a substrate whose leaving group is p-nitrophenol, which leaves easily without a proton. Which mutant loses its activity?', options: ['H12A only', 'H119A only', 'Both', 'Neither'], correct: 0,
        reveal: [['m', 'H12A falls about 5000-fold, and H119A is unaffected. A leaving group of pKa 7.14 needs no acid. RNA\'s own, near 14.8, does.'], ['t', 'This control tells the roles apart, which the pH curve cannot.']] },
      { type: 'note', say: [['m', 'Replace Lys41 with cysteine, and kcat/KM on poly(C) falls 10⁵-fold, more than either histidine (Messmore et al. 1995).'], ['t', 'Lys41 is thought to donate a hydrogen bond at the transition state. The fall fits that, but a mutant alone cannot show how.']] },
    ],
    watch: { rate: 1400, rateText: 'kcat 1.4 × 10³ per second for cleaving UpA, the first two steps only, pH 6.0, 25 °C', steps: 2, say: 'Each gong is one strand cut. Hydrolysis of the cyclic phosphate is a separate, slower event.' },
  },
  {
    key: 'ca', short: 'Anhydrase', title: 'Carbonic anhydrase', enzyme: 'Human carbonic anhydrase II', strategy: 'Metal ion catalysis and a proton shuttle',
    where: 'Protein and waters: crystal 2CBA. CO₂: from crystal 3D92 in the same setting. Other hydrogens and the incoming water are modelled.',
    open: ['Zinc holds a water here. On its own, water\'s pKa is 14. On this zinc it is about 7.', 'So at neutral pH the zinc can hold hydroxide, a far stronger nucleophile than water.'],
    steps: [
      { say: 'Attack CO₂ with the zinc hydroxide.', nudge: 'Keep going.', done: 'Bicarbonate on zinc. How its proton moves next is still argued over, so this model leaves it where it is.' },
      { say: 'A new water arrives. Give zinc its lone pair, and let bicarbonate let go.', nudge: 'Keep going.', done: 'Water sits on zinc, and it cannot attack CO₂ until it has lost a proton.' },
      { say: 'Send a proton along the wire to His64. Start with His64\'s lone pair.', nudge: 'Keep going.', done: 'Hydroxide is back. The cycle can begin again.' },
    ],
    strategy2: 'relay', evidence: [
      { type: 'choice', key: true, ask: 'Without His64, which added buffers bring the proton transfer back?', options: ['Imidazole, small and able to reach in', 'MOPS and HEPES, bulky buffers', 'All buffers equally'], correct: 0,
        reveal: [['m', 'Imidazole and 1-methylimidazole rescue it. MOPS and HEPES do not (Tu et al. 1989).'], ['t', 'One crystal of a mutant shows a rescuing buffer bound about 12 Å from zinc (Duda et al. 2001). A later study suggests that site may not be the productive one (An et al. 2002).']] },
      { type: 'choice', ask: 'In heavy water, proton steps slow down. If protons limit kcat, how does kcat change?', options: ['Falls about 3 to 4 times', 'No change', 'Rises'], correct: 0,
        reveal: [['m', 'kcat is 3 to 4 times larger in ordinary water, and kcat/KM shows a much smaller effect (Steiner et al. 1975).'], ['t', 'Consistent with a proton step limiting kcat. The exact path of the proton is still debated.']] },
    ],
    watch: { rate: 1e6, rateText: 'kcat about 10⁶ per second, human CA II, pH 8.3, 25 °C', steps: 3, say: 'The fastest cycle in this album. Each gong is one CO₂.', knock: { label: 'Remove His64', rate: 5e4, text: 'Without buffer, proton transfer is up to 20-fold slower. This kcat is scaled from that.', tag: 't' } },
  },
  {
    key: 'tim', short: 'Isomerase', title: 'Triosephosphate isomerase', enzyme: 'Yeast TIM', strategy: 'A closing loop: guarding an intermediate, or shutting out water',
    where: 'Protein atoms: crystal 7TIM with an intermediate analogue, PGH, mapped onto the substrate. Hydrogens are modelled. The open loop is from crystal 1YPI.',
    open: ['This enzyme moves one proton from carbon to carbon, and turns DHAP into glyceraldehyde phosphate.', 'The route passes through an enediol, which can fall apart.'],
    steps: [
      { say: 'Let Glu165 take the proton from C1, and send the electrons toward O2.', nudge: 'Keep going.', done: 'An enediolate. The negative charge sits near His95 and Lys12.' },
      { say: 'Let His95 give O2 a proton.', nudge: 'Keep going.', done: 'An enediol. In this classical route, His95 is left without its proton. That is unusual, and it is debated.' },
      { say: 'Let His95 take the proton from O1, as Glu165 puts a proton on C2.', nudge: 'Keep going.', done: 'Glyceraldehyde phosphate. Hydrogen has moved from C1 to C2, though the proton Glu165 returns has often exchanged with water first.' },
    ],
    trap: 'That reaction is real. Press undo, and keep phosphate on the enzyme\'s road.',
    strategy2: 'loop', evidence: [
      { type: 'dial', key: true, ask: 'Cut four residues from the tip of the loop. By what factor does activity fall?', unit: 'fold', min: 1, max: 1e9, start: 10, truth: 1e5, tol: 1,
        reveal: [['m', 'Nearly 10⁵-fold, in chicken TIM (Pompliano et al. 1990).'], ['c', `That mutant loses the enediol ${LOST_RATIO} times faster than it reprotonates it, so about ${(enediolLost(LOST_RATIO) * 100).toFixed(0)}% escapes, with glyceraldehyde phosphate as substrate.`], ['m', 'Phosphate loss itself was not much faster. The mutant mostly lost isomerization (Richard 1991).']] },
      { type: 'choice', ask: 'If the bound steps are faster than the substrate can arrive, what should a thicker solvent do to kcat/KM?', options: ['Slow it in step with viscosity', 'Nothing'], correct: 0,
        reveal: [['m', 'It slows in step with viscosity, with a slope close to one (Blacklow et al. 1988). Polymers that do not change the local viscosity have no effect.'], ['m', 'With glyceraldehyde phosphate the rate is limited by encounter. That is the sense of the word "perfect".']] },
    ],
    watch: { rate: 870, rateText: 'kcat about 870 per second for DHAP to GAP, the way you drew it, rabbit TIM, 25 °C, pH 7.5', steps: 3, say: 'Each gong is one proton carried across.' },
  },
  {
    key: 'adh', short: 'Dehydrogenase', title: 'Alcohol dehydrogenase', enzyme: 'Horse liver ADH', strategy: 'Hydride transfer to NAD⁺',
    where: 'Protein, NAD⁺ and alcohol: crystal 4DXH with trifluoroethanol, shown here as ethanol. Hydrogens are modelled.',
    open: ['Here a proton is not what moves. A hydrogen moves with both its electrons, as a hydride.', 'Binding NAD⁺ swings the catalytic domain against the coenzyme domain and closes the site (Plapp 2010). This crystal is that closed form.', 'Zinc holds the alcohol, and NAD⁺ waits behind it.'],
    steps: [
      { say: 'Empty the alcohol first. His51 pulls a proton through the relay.', nudge: 'Keep the relay going, one proton at a time, until the alcohol\'s proton has left.', done: 'An alkoxide on zinc. A measured pK of 7.2 fits this form (Sekhar & Plapp 1990).' },
      { say: 'Push from oxygen, and send a C–H pair to C4 of NAD⁺. The ring takes the rest.', nudge: 'Keep going.', done: 'Acetaldehyde, and NADH. The hydride went to the ring as one move.' },
    ],
    strategy2: 'pluck', evidence: [
      { type: 'dial', key: true, ask: 'Your estimate assumed nothing else matters. What ratio do kinetic studies give for the hydride step itself, H against D?', unit: 'ratio', min: 1, max: 30, start: 15, truth: ADH_H / ADH_D, tol: 0.25,
        reveal: [['c', `Fitted rates of ${ADH_H} and ${ADH_D} per second give ${(ADH_H / ADH_D).toFixed(1)}, in horse liver ADH with ethanol, 25 °C, pH 8.0 (Plapp 2010). These are kinetic simulation fits with other steps held fixed.`], ['m', 'The rate actually observed for this step is 180 per second, with H/D 3.8.'], ['c', 'Both are smaller than the zero-point estimate.']] },
      { type: 'choice', ask: 'The hydride step runs near 490 per second, but kcat is 3.5 per second. Which step sets kcat?', options: ['Hydride transfer', 'NADH leaving, at 5.5 per second'], correct: 1,
        reveal: [['m', 'NADH leaving is the slow step at kcat, so an isotope effect measured only on kcat would hide the chemistry.'], ['t', 'The closed enzyme presumably has to open to let it go. That is inferred, not measured for NADH.']] },
      { type: 'note', say: [['m', 'In yeast ADH, isotope ratios gave a secondary exponent of 10.2 ± 2.4 against a semiclassical 3.26 (Cha et al. 1989).'], ['t', 'That points to hydrogen tunnelling. The classical limit and the role of protein motion are still argued over.']] },
    ],
    watch: { rate: 3.5, rateText: 'kcat 3.5 per second, horse liver ADH, ethanol, 25 °C, pH 8.0', steps: 2, say: 'Each gong is one ethanol oxidised.' },
  },
  {
    key: 'aat', short: 'Aminotransferase', title: 'Aspartate aminotransferase', enzyme: 'E. coli AAT', strategy: 'PLP as an electron sink',
    where: 'Protein and ligand: crystal 1ARG, a reduced analogue of the external aldimine. Hydrogens are modelled. Residue numbers follow the pig enzyme, as is customary.',
    open: ['An amino group is about to move from aspartate to the cofactor.', 'First the alpha proton must go, and carbon has nowhere to keep those electrons.', 'PLP does: its ring is a sink.'],
    steps: [
      { say: 'Let Lys258 take the alpha proton, then push the electrons all the way into the ring, onto its nitrogen.', nudge: 'Keep pushing, bond by bond, toward the ring nitrogen.', done: 'A quinonoid form. In the natural reaction it does not build up; it is seen with some substrate analogues.' },
      { say: 'Now bring the electrons back. This time they end at C4′, which takes a proton from Lys258.', nudge: 'Keep going.', done: 'A ketimine. Water then splits it, which this model does not draw. The amino group stays on the cofactor, and oxaloacetate leaves.' },
    ],
    strategy2: 'dunathan', evidence: [
      { type: 'dial', key: true, ask: 'Replace Lys258 with alanine. By what factor does the proton shift itself fall?', unit: 'fold', min: 1, max: 1e10, start: 100, truth: 1e7, tol: 1,
        reveal: [['m', 'About 10⁶ to 10⁸-fold (Toney & Kirsch 1993).'], ['m', 'Yet kcat/KM falls only 3 to 100-fold in that study, because the mutant binds its aldimine far more tightly. Which number you quote matters.']] },
      { type: 'choice', ask: 'Give the enzyme aspartate and no second substrate. What happens?', options: ['It turns over and over', 'It reacts once and stops as PMP', 'Nothing at all'], correct: 1,
        reveal: [['m', 'It stops after one half-reaction, with the amino group on the cofactor. The band near 360 to 430 nm gives way to one near 330 nm.'], ['t', 'This is a ping-pong mechanism: the second substrate must take the amino group back off.']] },
    ],
    watch: { rate: 550, rateText: 'about 550 per second, half-reaction with aspartate, E. coli, 25 °C, pH 8.0', steps: 2, say: 'Each gong is one half-reaction.', knock: { label: 'Remove Lys258', rate: 5.5e-5, text: 'Proton shift 10⁶ to 10⁸-fold slower. This rate uses the midpoint, 10⁷.', tag: 't' } },
  },
  {
    key: 'lysozyme', title: 'Lysozyme', enzyme: 'Hen egg-white lysozyme', strategy: 'A textbook put to the test',
    where: 'Crystal 1H6M: the covalent form, E35Q shown as Glu35. The oxygen to the next sugar is placed by rule, behind C1 from Asp52. That hop from Glu35, nearly 6 Å, is past this game\'s usual reach and is allowed by hand.',
    open: ['The product keeps the same configuration at C1 as the substrate: retention.', 'Koshland saw in 1953 why that hints at two steps: one displacement inverts a carbon, so two give retention.', 'Phillips proposed a free positive sugar instead, bent toward a half-chair, and for decades textbooks drew it.', 'Both sets of arrows are legal by the rules of this game. Try them.'],
    steps: [
      { say: 'Break the bond to the next sugar, with a proton from Glu35. Draw either route.', altDone: true, done: 'That is one way. Now we finish it with water.' },
      { say: 'Water attacks C1, and Glu35 takes its proton.', nudge: 'Keep going.', done: 'The sugar chain is cut. Your arrows cannot say which route was right.' },
    ],
    strategy2: 'trap', evidence: [
      { type: 'mass', key: true, ask: 'The paper gives wild-type lysozyme a mass of 14,316. The 2-fluoro sugar adds its mass if it stays bonded. Where is the peak?', truth: 14683, tol: 8, computedAdd: { C: 14, H: 23, F: 1, N: 1, O: 9 }, lost: { H: 1 },
        reveal: [['m', 'Measured 14,683: a gain of 367 (Vocadlo et al. 2001).'], ['c', 'That matches the sugar group, 368.3, less the 1.0 of the hydrogen Asp52 loses. The paper\'s 14,316 is about 10 above the sequence mass of hen lysozyme, so the gain is what counts.'], ['m', 'The crystal, 1H6M, shows the bond itself: C1 to Asp52 at about 1.4 Å, in an undistorted chair.'], ['t', 'The distortion Phillips proposed survives in a new form: the Michaelis complex is bent, and the covalent form relaxes.'], ['t', 'These are modified substrates. The evidence for the natural one rests on them and on simulation, and the transition state still has positive character.']] },
    ],
    watch: { rate: 0.13, rateText: 'about 0.13 per second, turkey lysozyme on (GlcNAc)₆, reported the same for hen', steps: 2, say: 'Lysozyme is slow. Each gong is one cut.' },
  },
  {
    key: 'ompdc', short: 'Decarboxylase', title: 'OMP decarboxylase', enzyme: 'Yeast OMP decarboxylase', strategy: 'Binding the transition state',
    where: 'Protein and inhibitor: crystal 1DQX with BMP, which has O⁻ where the substrate has its carboxylate. The carboxylate and hydrogens are modelled.',
    open: ['This enzyme has no metal and no cofactor.', 'It must break a carbon–carbon bond and leave its electrons on C6, where they cannot spread into the ring\'s pi system.'],
    steps: [
      { say: 'Push from the carboxylate, and let the bond to C6 break. CO₂ leaves.', nudge: 'Keep going.', done: 'A vinyl carbanion on C6, for an instant. Exchange and isotope studies support it, but it is short lived.' },
      { say: 'Lys93 stands right there. Protonate C6.', nudge: 'Keep going.', done: 'UMP. No cofactor, and no ring protonation first: that older idea has been ruled out.' },
    ],
    strategy2: 'inhibitor', evidence: [
      { type: 'dial', key: true, ask: 'Without an enzyme, how long is the half-life of this decarboxylation at 25 °C?', unit: 'years', min: 1, max: 1e10, start: 1000, truth: halfMy(OMP.kNon2009) * 1e6, tol: 1.2,
        reveal: [['m', `First reported as ${halfMy(OMP.kNon1995).toFixed(0)} million years (Radzicka & Wolfenden 1995), on a model compound.`], ['m', `Remeasured in 2009 at about ${halfMy(OMP.kNon2009).toFixed(1)} million years (Lewis & Wolfenden).`], ['m', 'The enzyme does it in about 18 milliseconds.']] },
      { type: 'ts', say: [['c', 'kcat/KM over the uncatalysed rate gives the proficiency. Its inverse is how tightly the enzyme would have to bind the transition state.'], ['t', 'Strain by charge repulsion in the ground state was argued for years. A 2022 study of the human enzyme concludes it is not a driving force (Rindfleisch et al.), and earlier analysis favoured transition-state stabilisation (Warshel et al. 2000).'], ['m', 'Crystal work of 2013 found both substrate distortion and transition-state stabilization, with distortion worth 10 to 15% (Fujihashi et al.).'], ['t', 'A broad view: the site is built in advance, with its charges already facing the right way, so it pays less than water would to hold that state.'], ['m', 'This enzyme is no longer the record holder: phosphatases and uroporphyrinogen decarboxylase go further.']] },
    ],
    watch: { rate: 39, rateText: 'kcat 39 per second, yeast OMPDC, 25 °C', steps: 2, say: 'Last gong of the album. Each one is one CO₂ set free.' },
  },
];

// Inhibitors of the last chapter. Enzyme and method differ between rows, and the table says so.
export const INHIBITORS = [
  { id: 'H', name: 'UMP', group: 'H at C6', ki: 4.6e-4, src: 'the product itself (Wu et al. 2000)', why: 'The product leaves easily, as it must.' },
  { id: 'CH3', name: '6-methyl-UMP', group: 'CH₃ at C6', ki: 1.34e-4, src: 'M. thermautotrophicus enzyme', why: 'No charge at C6, and a group in the way.' },
  { id: 'CN', name: '6-cyano-UMP', group: 'CN at C6', ki: 2.9e-5, src: 'M. thermautotrophicus enzyme, ITC', why: 'A polar group, without a full charge.' },
  { id: 'N', name: '6-aza-UMP', group: 'N in place of C6', ki: 1.24e-5, src: 'M. thermautotrophicus enzyme, ITC', why: 'The ring nitrogen carries charge into the ring.' },
  { id: 'NH2', name: '6-amino-UMP', group: 'NH₂ at C6', ki: 8.4e-7, src: 'M. thermautotrophicus enzyme, ITC', why: 'Its NH₂ competes with the lysine for a place beside an aspartate. Why it binds well is not clear.' },
  { id: 'O', name: 'BMP', group: 'O⁻ at C6', ki: 9e-12, src: 'Levine et al. 1980, quoted in Wu et al. 2000', why: 'A negative charge spread over the ring\'s oxygens, including the O⁻ on C6, right beside Lys93.' },
];
