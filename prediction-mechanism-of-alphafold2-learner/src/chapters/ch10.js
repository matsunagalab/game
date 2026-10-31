// Chapter 10. What one confident model cannot say: a second real fold, the limits, and the last case.
import { ambient, fmt, getModel, getStructure, stockFrom } from './common.js';
import { rmsd } from '../science/metrics.js';

export default {
  id: 'limits',
  title: 'What one model cannot say',
  tease: 'A confident model is one structure, not the protein. Find where it stops.',
  principle: 'A confident model is one structure, not the protein. It cannot say what other states exist, how often each occurs, what a mutation does, where a ligand sits or how the chain folds. pLDDT is a confidence, not a free energy.',
  goals: ['See two real folds of one protein.', 'Say what a single model can and cannot answer.', 'Get the final case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>Limits.</b> Mutations: AF2 is "largely unable to predict when a point mutation causes defective protein folding" in three case studies (Buel and Walters 2022), and dpLDDT against ddG gave r = −0.17 on 1,154 mutations (Pak et al. 2023). Ligands: not modelled, so for instance models lack heme and zinc (Hekkelman et al. 2023). Pathways: structure predictors did worse at folding questions than a classifier using chain length (Outeiral et al. 2022), though a later study argues AF2 learned some folding principles (Chang and Perez 2025). <b>Alternative states:</b> shallow random MSAs gave both conformations of eight membrane proteins, one of them only with templates. For four others, with one state already in AF2's training set, it never gave the other (del Alamo et al. 2022). Outside the training set, AF methods found both folds of only 1 of 7 fold switchers (Chakravarty et al. 2024). AF-Cluster clusters an MSA, and predicted KaiB states confirmed by NMR (Wayment-Steele et al. 2024). Whether coevolution or memorised sequence patterns drive this is contested (Chakravarty et al. 2024; Schafer et al. 2025; Wayment-Steele et al. 2025), and both sides agree pLDDT is not a free energy. In AF-Cluster's own KaiB models, the thermodynamically disfavoured fold-switched state had the higher pLDDT (Wayment-Steele et al. 2024). Across 92 fold switchers AF methods together found both folds in 32 (Chakravarty et al. 2024).</p>
    <p><b>Licences.</b> AlphaFold DB data is CC-BY-4.0: Jumper et al. 2021 and Varadi et al. 2022.</p>
    <p class="small">Sources as named above. KaiB 2QKE (Pattanayek et al. 2008) and 5JYT (Tseng et al. 2017). 5JYT carries five engineered mutations that stabilise the switched fold, so the two KaiB structures are not the same sequence.</p>`,

  stages: [kaib, limits, verdict],
};

async function kaib(run) {
  const { ui } = run;
  const k1 = getStructure('kai1'), k2 = getStructure('kai2');
  ambient(run, { st: k1 });
  const nums = k1.nums.filter((v) => v >= 52 && v <= 95 && k2.nums.includes(v));
  const a = nums.map((v) => k1.ca[k1.nums.indexOf(v)]), b = nums.map((v) => k2.ca[k2.nums.indexOf(v)]);
  ui.tags('real', 'game');
  ui.reads([{ value: `${fmt(rmsd(a, b), 1)} Å`, label: `KaiB, two folds (the second from a stabilised mutant), ${nums.length} residues` }]);
  await run.line('Adenylate kinase swings between states. KaiB, a clock protein, goes further: part of it has two different folds. A single predicted structure can show at most one of them at a time.');
  ui.tags('paper');
  await run.line('Metastable states are where confidence misleads most. In models of KaiB, the fold that is thermodynamically disfavoured for the free protein had the higher pLDDT.');
  await run.line('pLDDT is not a free energy, and it cannot say how populated a state is.');
  run.reach(1);
  ui.reads([]);
}

async function limits(run) {
  const { ui } = run;
  const st = getModel('P0AE67');
  ambient(run, { st, stock: stockFrom(st) });
  ui.tags('paper');
  ui.reads([]);
  const cards = [
    ['Does this point mutation unfold the protein?', false, 'AF2 cannot tell. In case studies it kept the fold for mutants known to unfold, with pLDDT almost unchanged. Across 1,154 mutations, the change in pLDDT barely tracked stability, r = −0.17.'],
    ['What does this domain look like, if pLDDT is 95?', true, 'Yes, as a confident model of one state. Above 90, the backbone and most side chains are typically right.'],
    ['How long does this state live?', false, 'The model has no time, temperature, or energy in it. For that you need experiments or simulation.'],
  ];
  let right = 0;
  for (const [q, can, why] of cards) {
    const ok = await run.choose(`Can a single AF2 model answer this? ${q}`, [
      { text: 'Yes', right: can, why },
      { text: 'No', right: !can, why },
    ]);
    if (ok) right += 1;
  }
  run.state.limitsRight = right;
  if (right === cards.length) run.reach(2);
  await run.line('Ligands and folding pathways are outside it too: AF2 places no ligands and does not simulate folding.');
}

async function verdict(run) {
  const { ui } = run;
  const st = getModel('P69441');
  ambient(run, { st, stock: stockFrom(st) });
  ui.tags('model');
  ui.reads([]);
  await run.line('A last case, in your own words if you like.');
  const a = await run.choose('A colleague asks: will the mutation Y to A at an enzyme\'s pocket stop it folding? They ran AF2, and pLDDT did not change.', [
    { text: 'Good news: no change in pLDDT means no change in stability.', right: false, why: 'That is not what pLDDT measures. AF2 has been shown to miss destabilising mutations.' },
    { text: 'That result says little. AF2 is not validated for the effect of mutations.', right: true, why: 'Right. Test it with an experiment, or a method built for stability.' },
    { text: 'Rerun with more recycles to find out.', right: false, why: 'More passes cannot add a sense of stability that the model does not have.' },
  ]);
  const b = await run.choose('Two shallow samples of an alignment gave two different folds, one with mean pLDDT 88 and one with 74. The colleague says the first must be the more stable state. What do you say?', [
    { text: 'Agreed. A higher pLDDT means a lower free energy.', right: false, why: 'pLDDT is not a free energy. In models of KaiB, the disfavoured fold scored higher.' },
    { text: 'The scores cannot rank them. Both folds need an experiment or a simulation.', right: true, why: 'Right. Two folds are worth testing, but their pLDDT says nothing of how stable or populated each one is.' },
    { text: 'Only the first fold can be real.', right: false, why: 'KaiB has two real folds, so a lower score does not rule a fold out.' },
  ]);
  if (a && b) run.reach(3);
  await run.line('You have now done it all by hand: read an alignment, found contacts, closed triangles, thrown a gas, turned a molecule, stood on a residue, and read the confidence.');
  await run.line('AlphaFold2 does none of these sums as such. It was built and trained so that it could use the same kinds of information. How it uses them is not fully known. Now you know some of what it can use, and what it cannot tell you.');
}
