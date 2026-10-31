// Chapter 9. Real AlphaFold DB confidence, read by the player.
import * as THREE from 'three';
import { plddtStock, Quilt, STOCK } from '../world.js';
import { alignedError, rmsd } from '../science/metrics.js';
import { ambient, fmt, frameBoard, getModel, getPAE, getStructure, PaperProtein, stockFrom } from './common.js';

export default {
  id: 'trust',
  title: 'Reading confidence',
  tease: 'Read real confidence scores, local and between parts, and say what can be trusted.',
  principle: 'pLDDT says how sure AlphaFold2 is about the local shape around a residue. Predicted aligned error says how sure it is about the relative position of two parts. Neither is a measure of motion. Calmodulin\'s flexible linker shows as high PAE, but adenylate kinase\'s large swing barely shows, because PAE speaks of the state AlphaFold2 chose.',
  goals: ['Read the confidence of real p53.', 'Read a real PAE map, and say what can be trusted.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>pLDDT</b> is AF2's own estimate of per-residue lDDT-Cα, predicted in 50 bins from the final single representation (Algorithm 29). It gives 0 to 100. Bands, as AlphaFold DB states them (Varadi et al. 2022): ≥90 very high, 70 to 90 confident, 50 to 70 low, under 50 very low. A linear fit on 10,795 chains gave lDDT-Cα = 0.997 × pLDDT − 1.17, with Pearson r = 0.76 (Jumper et al. 2021, Fig. 2c). Above 90, χ<sub>1</sub> rotamers are about 80% correct. Above 70 the backbone is generally correct (Tunyasuvunakool et al. 2021).</p>
    <p><b>PAE</b> is the expected error at residue j when prediction and truth are aligned on residue i, in 64 bins of 0.5 Å from 0 to 31.5 Å, and it is not symmetric. It comes from the pair representation (Supplement 1.9.7). It is the aligned error of chapter 7, predicted without seeing the truth. The AlphaFold DB advises attaching no structural relevance to the relative position of parts with high PAE (Varadi et al. 2022).</p>
    <p><b>The maps in this chapter.</b> PAE here is the real AlphaFold DB output (model version 6) for CheY, calmodulin and adenylate kinase. Maps labelled true error are computed by this game, from a real AF2 model and a real crystal. A true-error map needs a crystal, and it is what PAE tries to estimate. The mean gap between the two, over all pairs of residues, is about 4.6 Å for calmodulin against 1CLL, 1.6 Å for adenylate kinase against its closed crystal, and 6.7 Å against its open one, where the mean PAE is 3.2 Å and the mean true error 9.7 Å. PAE speaks of the state AF2 chose. Calmodulin's PAE also agrees with this crystal only in part: the whole-protein RMSD is 6.5 Å to 1CLL and 11.5 Å to 1CDL, because the lobes sit differently in each. Between adenylate kinase's domains PAE is 3.3 to 4.3 Å, against 2.4 Å within the core, so its swing barely shows.</p>
    <p><b>Disorder.</b> The chapter's question uses 4E-BP2, which is disordered on its own. On CAID Disprot-PDB (n = 178,124 residues), pLDDT gave AUC 0.897 as a disorder predictor (Tunyasuvunakool 2021). AF2 gives pLDDT of 70 or more to nearly 15% of human disordered regions, and 90 or more to 4.5%, often those that fold on binding or phosphorylation, and 4E-BP2's model mixes features of two forms that do not coexist (Alderson et al. 2023). Low confidence can also mean not enough information (EMBL-EBI training pages). eIF3 subunits E and M have low pLDDT but match the cryo-EM complex 6ZON (Williams et al. 2025), though that is inside a complex.</p>
        <p><b>PDB-like, not physical.</b> Jumper et al. write that AlphaFold "is trained to produce the protein structure most likely to appear as part of a PDB structure", and that where a stoichiometry, ligand or ion is predictable from sequence, it is likely to respect that implicitly. The adenylate kinase model matches the inhibitor-bound closed crystal. Calmodulin's lobes match calcium-bound crystals (1CLL, 0.8 and 0.5 Å; 1CDL, 0.6 and 0.6 Å), not the calcium-free NMR structure (1CFD, 3.7 and 4.3 Å). That is agreement, not cause: templates, or a memory of similar training structures, could explain it too.</p>
    <p><b>p53.</b> UniProt marks residues 102 to 292 as DNA-binding, and 50 to 96, 282 to 325 and 351 to 393 as disordered. Residues 1 to 49 also score low. UniProt's disordered track does not cover them, but NMR shows this transactivation domain is disordered on its own too (Dawson et al. 2003; Wells et al. 2008). Regions A to C on the strip are residues 94 to 292, 293 to 324 and 325 to 356. The tetramer needs AlphaFold-Multimer, a later version trained on complexes (Evans et al., bioRxiv 2021).</p>
    <p><b>Licences.</b> AlphaFold DB data is CC-BY-4.0: Jumper et al. 2021 and Varadi et al. 2022.</p>
    <p class="small">Sources as named above. Regions of p53 are from UniProt P04637. Calmodulin 1CLL (Chattopadhyaya et al. 1992), 1CDL (Meador et al. 1992) and 1CFD (Kuboniwa et al. 1995), adenylate kinase 4AKE and 1AKE (Müller et al. 1996; Müller and Schulz 1992).</p>`,

  stages: [plddt, traps, pae, adk, check],
};

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const REGIONS = [[94, 292, 'Region A'], [293, 324, 'Region B'], [325, 356, 'Region C']];

function strip(ui, plddt, regions = []) {
  const c = document.createElement('canvas');
  c.className = 'chart';
  c.style.height = '62px';
  c.paint = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = c.clientWidth || 300, H = 62, n = plddt.length;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < n; i += 1) {
      g.fillStyle = `#${plddtStock(plddt[i]).getHexString()}`;
      const y = 30 - (plddt[i] / 100) * 26;
      g.fillRect((i / n) * W, y + 8, W / n + 0.6, 30 - y);
    }
    g.font = '12px "Alegreya Sans", sans-serif'; g.fillStyle = '#5a6b78'; g.textAlign = 'center';
    for (const [a, b, name] of regions) {
      g.fillText(name.replace('Region ', ''), (((a + b) / 2) / n) * W, 52);
      g.fillStyle = '#c9d3da'; g.fillRect(((a - 1) / n) * W + 1, 40, ((b - a) / n) * W - 2, 2); g.fillStyle = '#5a6b78';
    }
  };
  return c;
}

async function plddt(run) {
  const { ui, world, sound } = run;
  const st = getModel('P04637');
  const m = run.scoped(new PaperProtein(world, st, { stock: stockFrom(st), scale: 0.62, center: [0, 24, 0], spin: 0.08, size: 2, triangles: true }));
  m.update();
  frameBoard(run, 78, 82, { polar: 0.2, at: [0, 20, 0], seconds: 0 });
  world.shadowSpan(100);
  run.scoped({ dispose: () => world.shadowSpan(80) });
  ui.tags('af2');
  ui.reads([]);
  await run.line('This is real AlphaFold2 output for human p53. Each residue carries its own confidence, as paper stock.');
  await run.line('The number is <b>pLDDT</b>: the network\'s own guess at how right the local shape is. Dark blue is over 90, light blue 70 to 90, yellow 50 to 70, orange under 50.');
  const s = strip(ui, st.plddt, REGIONS);
  ui.say('Read the strip, residues 1 to 393, and say what you would do with each region.');
  let right = 0;
  ui.ctrl(s);
  s.paint();
  for (const [a, b, name] of REGIONS) {
    const v = mean(st.plddt.slice(a - 1, b)), good = v >= 70;
    ui.reads([{ value: fmt(v, 1), label: `mean pLDDT, ${name}, residues ${a} to ${b}` }]);
    sound.setOpening(v / 100);
    const ok = await pick(run, s, `${name}. Would you read its shape?`, [
      { text: 'Yes, read the shape', right: good, why: good ? (a === 325 ? 'Yes, for the shape of one chain. Hold that thought.' : 'Yes. Confident backbone.') : `No. At ${fmt(v, 0)} this should not be read as a shape.` },
      { text: 'No, do not read it', right: !good, why: !good ? `Right. Mean pLDDT ${fmt(v, 0)}. That long ribbon is not a structure.` : `It scores ${fmt(v, 0)}. That is a confident prediction.` },
    ]);
    if (ok) right += 1;
    sound.tap();
  }
  if (right >= REGIONS.length) run.reach(1);
  ui.ctrl();
  ui.reads([]);
  ui.tags('paper');
  await run.line('Compare UniProt: residues 102 to 292 bind DNA, and 282 to 325 and 351 to 393 are marked disordered. pLDDT mostly lines up with that.');
  await run.line('One region is a trap. Region C scored high, but AF2 predicted one chain, and those residues really form a tetramer: a shape made of four chains together.');
  await run.line('To ask about that tetramer you would use AlphaFold-Multimer, a later version trained on complexes, and give it all four chains.');
}

async function pick(run, s, q, options) {
  const { ui } = run;
  ui.say(q);
  ui.options = options;
  return run.until((done) => {
    let first = true;
    const box = document.createElement('div');
    box.className = 'opts';
    box.style.gridTemplateColumns = '1fr 1fr';
    for (const o of options) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = o.text;
      b.addEventListener('click', () => {
        run.sound.tap();
        if (o.right) { b.classList.add('right'); ui.say(o.why); [...box.children].forEach((x) => { x.disabled = true; }); ui.ctrl$.append(ui.button('Next', () => done(first), { id: 'next' })); ui.fit(); } else { first = false; b.classList.add('wrong'); ui.say(o.why); }
      });
      box.append(b);
    }
    ui.ctrl(s, box);
    s.paint();
  });
}

async function traps(run) {
  const { ui } = run;
  const st = getModel('Q13542');
  ambient(run, { st, stock: stockFrom(st) });
  ui.tags('af2', 'paper');
  ui.reads([]);
  ui.reads([{ value: fmt(mean(st.plddt), 1), label: 'mean pLDDT of 4E-BP2' }, { value: `${st.plddt.filter((v) => v >= 90).length} of ${st.plddt.length}`, label: 'residues over 90' }]);
  await run.line('This is real AlphaFold2 output for 4E-BP2, a protein that is disordered on its own.');
  ui.reads([]);
  await run.choose('A protein is known to be disordered on its own, yet AF2 gives part of it a pLDDT over 90. What is the best reading?', [
    { text: 'The experiments must be wrong.', right: false, why: 'Disorder in isolation is measured. The score is a prediction.' },
    { text: 'It may fold under some condition, such as binding or phosphorylation, and AF2 shows a folded form.', right: true, why: 'Often, yes. About 15% of human disordered regions get pLDDT over 70, and about 4.5% over 90. The model of 4E-BP2 mixes two forms that do not coexist.' },
    { text: 'High pLDDT proves it is rigid in the cell.', right: false, why: 'pLDDT is a confidence, not a measure of rigidity.' },
  ]);
  ui.reads([]);
  ui.tags('paper');
  await run.line('The reverse needs care too. A score under 50 often means disorder, but it can also mean too little information, or a shape that needs a partner.');
}

// Blue for a small error, white for a large one. Any map of e[i * n + j], with a stride for large proteins.
function paintMap(quilt, e, n, step = 1) {
  const col = new THREE.Color(), cells = Math.floor(n / step);
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const t = Math.min(1, e[(i * step) * n + j * step] / 28);
      quilt.set(i, j, t < 0.3 ? col.copy(STOCK.high).lerp(STOCK.good, t / 0.3) : col.copy(STOCK.good).lerp(STOCK.white, (t - 0.3) / 0.7));
    }
  }
  quilt.commit();
}

// How one AlphaFold2 calmodulin model fits a structure: both lobes, and the whole, on the residues the two share.
function lobeFit(af, ex) {
  const off = af.seq.indexOf(ex.seq.slice(0, 10)), ia = [], ib = [];
  ex.seq.split('').forEach((c, i) => { if (af.seq[off + i] === c) { ia.push(off + i); ib.push(i); } });
  const pick = (lo, hi) => ia.map((_, k) => k).filter((k) => af.nums[ia[k]] >= lo && af.nums[ia[k]] <= hi);
  const fit = (K) => rmsd(K.map((k) => af.ca[ia[k]]), K.map((k) => ex.ca[ib[k]]));
  return { n: fit(pick(8, 73)), c: fit(pick(84, 148)), whole: fit(ia.map((_, k) => k)) };
}

const blockMean = (e, n, A, B) => { let v = 0, c = 0; for (const i of A) for (const j of B) if (i !== j) { v += e[i * n + j]; c += 1; } return v / c; };

// The mean size of the difference between two maps, leaving out each residue with itself.
const meanGap = (a, b, n) => { let v = 0, c = 0; for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) if (i !== j) { v += Math.abs(a[i * n + j] - b[i * n + j]); c += 1; } return v / c; };

async function pae(run) {
  const { ui, world, sound } = run;
  let q = null;
  run.scoped({ dispose: () => q?.dispose() });
  const show = (e, n) => { q?.dispose(); q = new Quilt(world, n, {}); frameBoard(run, n + 5, n + 5); paintMap(q, e, n); world.shadowDirty = 2; };
  ui.reads([]);
  ui.tags('paper');
  await run.line('pLDDT is local, so it cannot say how two parts sit relative to each other. For that AlphaFold2 gives a second output.');
  const chey = getPAE('P0AE67');
  show(chey.e, chey.n);
  ui.tags('af2');
  ui.reads([{ value: `${fmt(mean(chey.e), 1)} Å`, label: 'mean PAE of CheY' }]);
  await run.line('This is <b>predicted aligned error</b>, or PAE. Stand on residue i, the row, and it gives the error AlphaFold2 expects at residue j, the column.');
  await run.line('Blue means a small expected error, and white a large one. This is CheY, one compact domain, so nearly all of the map is blue.');
  // Calmodulin. The crystal lacks the chain ends, so both maps use the residues they share.
  const full = getPAE('P0DP23'), af = getModel('P0DP23'), ex = getStructure('cam1'), off = af.seq.indexOf(ex.seq.slice(0, 10));
  const ia = [], ib = [];
  ex.seq.split('').forEach((c, i) => { if (af.seq[off + i] === c) { ia.push(off + i); ib.push(i); } });
  const n = ia.length, nums = ia.map((i) => af.nums[i]);
  const P = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) P[i * n + j] = full.e[ia[i] * full.n + ia[j]];
  const A = { fr: ia.map((i) => af.frames[i]), ca: ia.map((i) => af.ca[i]) }, T = { fr: ib.map((i) => ex.frames[i]), ca: ib.map((i) => ex.ca[i]) };
  const E = alignedError(A.fr, A.ca, T.fr, T.ca);
  const lobe = (a, b) => nums.map((_, i) => i).filter((i) => nums[i] >= a && nums[i] <= b);
  const N = lobe(8, 73), C = lobe(84, 148);
  show(P, n);
  ui.reads([{ value: `${fmt(blockMean(P, n, N, N), 1)} and ${fmt(blockMean(P, n, C, C), 1)} Å`, label: 'PAE within each lobe' }, { value: `${fmt(blockMean(P, n, N, C), 1)} and ${fmt(blockMean(P, n, C, N), 1)} Å`, label: 'PAE between the lobes' }]);
  await run.line('This is real AlphaFold2 calmodulin, which has two lobes joined by a flexible linker.');
  const first = await run.choose('Two blue blocks, and pale in between. What can you trust?', [
    { text: 'Each lobe\'s shape, but not the angle between them.', right: true, why: 'Right. AF2 is sure of each lobe, and it is saying that it cannot place one relative to the other.' },
    { text: 'The whole protein, since the blocks are dark.', right: false, why: 'The pale squares say that, standing on one lobe, AF2 expects large errors on the other.' },
    { text: 'Nothing, because part of the map is pale.', right: false, why: 'Inside each block the expected error is small. Those shapes are good.' },
  ]);
  if (first) run.reach(2);
  // The map is not symmetric: the reader flips it.
  const t = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) t[i * n + j] = P[j * n + i];
  const asym = (() => { let v = 0, c = 0; for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) { if (nums[i] < 8 || nums[j] > 148) continue; v += Math.abs(P[i * n + j] - P[j * n + i]); c += 1; } return v / c; })();
  ui.reads([{ value: `${fmt(asym, 1)} Å`, label: 'mean difference, i to j against j to i' }]);
  await run.until((done) => {
    ui.say('Flip the map across its diagonal, and watch it change.');
    let flipped = false;
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const flip = ui.button('Flip rows and columns', () => { flipped = !flipped; paintMap(q, flipped ? t : P, n); sound.rustle(3, 0.03); nxt.disabled = false; }, { quiet: true, id: 'flip-map' });
    ui.ctrl(flip, nxt);
  });
  ui.ctrl();
  paintMap(q, P, n);
  await run.line('PAE is not symmetric. The error at j seen from i need not equal the error at i seen from j, because each residue has its own frame.');
  // Now the map that needs a crystal.
  ui.tags('af2', 'real', 'game');
  ui.reads([{ value: `${fmt(blockMean(E, n, N, N), 1)} and ${fmt(blockMean(E, n, C, C), 1)} Å`, label: 'true error within each lobe' }, { value: `${fmt(blockMean(E, n, N, C), 1)} and ${fmt(blockMean(E, n, C, N), 1)} Å`, label: 'true error between the lobes' }, { value: `${fmt(meanGap(P, E, n), 1)} Å`, label: 'mean gap from PAE' }]);
  paintMap(q, E, n);
  sound.fold();
  await run.line('For calmodulin we hold a real crystal, 1CLL, so we can compute the true error, in the same way as in chapter 7. It is a measurement, and it needs a crystal, which is what you lack for a new protein.');
  const whole = rmsd(A.ca, T.ca), nl = rmsd(N.map((i) => A.ca[i]), N.map((i) => T.ca[i])), cl = rmsd(C.map((i) => A.ca[i]), C.map((i) => T.ca[i]));
  const other = lobeFit(af, getStructure('cam2'));
  ui.reads([{ value: `${fmt(whole, 1)} Å`, label: 'RMSD, whole protein' }, { value: `${fmt(nl, 1)} and ${fmt(cl, 1)} Å`, label: 'RMSD, each lobe alone' }, { value: `${fmt(other.whole, 1)} Å`, label: 'RMSD, whole protein, another crystal, 1CDL' }]);
  await run.line('Here PAE agreed with this crystal: the same blocks appear in both maps. A single RMSD would call this a poor model, though each lobe is nearly perfect and only their placement differs.');
  ui.reads([]);
}

async function adk(run) {
  const { ui, world } = run;
  const af = getModel('P69441'), open = getStructure('ake4'), closed = getStructure('ake1'), paeReal = getPAE('P69441'), n = paeReal.n;
  const E = alignedError(af.frames, af.ca, open.frames, open.ca), Ec = alignedError(af.frames, af.ca, closed.frames, closed.ca);
  const step = 2, cells = Math.floor(n / step), gap = cells / 2 + 4;
  const left = run.scoped(new Quilt(world, cells, { origin: [-gap, 0] })), right = run.scoped(new Quilt(world, cells, { origin: [gap, 0] }));
  paintMap(left, paeReal.e, n, step);
  paintMap(right, E, n, step);
  frameBoard(run, cells * 2 + 16, cells + 24);
  const labels = [['Real PAE', -gap], ['True error, open crystal', gap]].map(([t, x]) => {
    const l = ui.label(t);
    run.tick(() => l.at(world.project([x, 2, -cells / 2 - 7])));
    return l;
  });
  run.scoped({ dispose: () => labels.forEach((l) => l.remove()) });
  // Core, NMP and LID domains as in Muller et al. 1996. Residue numbers run from 1.
  const span = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k - 1);
  const CORE = [...span(1, 29), ...span(60, 121), ...span(160, 214)], NMP = span(30, 59), LID = span(122, 159);
  const both = (X, Y) => `${fmt(blockMean(paeReal.e, n, X, Y), 1)} / ${fmt(blockMean(Ec, n, X, Y), 1)} / ${fmt(blockMean(E, n, X, Y), 1)}`;
  ui.tags('af2', 'real', 'game');
  ui.reads([{ value: both(CORE, CORE), label: 'within the core: PAE / closed / open, Å' }, { value: both(CORE, LID), label: 'core to lid' }, { value: both(CORE, NMP), label: 'core to NMP' }, { value: both(LID, NMP), label: 'lid to NMP' }]);
  await run.line('Real adenylate kinase, whose domains swing as it works. Left is AlphaFold2\'s own PAE. Right is the true error of the same model against the open crystal.');
  await run.line('Real PAE stays near 4 Å between the domains, so AF2 is sure how they sit. Against the closed crystal the true error is close to that. Against the open crystal the same model is off by 12 to 22 Å. PAE speaks of the state AF2 chose. Low PAE does not mean the protein has no other.');
  const mp = mean(af.plddt);
  ui.reads([{ value: fmt(mp, 1), label: 'mean pLDDT' }, { value: `${fmt(rmsd(af.ca, closed.ca))} Å`, label: 'from closed crystal 1AKE' }, { value: `${fmt(rmsd(af.ca, open.ca))} Å`, label: 'from open crystal 4AKE' }, { value: `${fmt(meanGap(paeReal.e, Ec, n), 1)} and ${fmt(meanGap(paeReal.e, E, n), 1)} Å`, label: 'mean gap from PAE, closed and open' }]);
  await run.line('The model matches the closed crystal closely, and the open form is just as real. High confidence here means confidence in one state. It says nothing of the others, or of how often each occurs.');
  ui.tags('paper');
  ui.reads([]);
  await run.line('Why this state? AlphaFold2 is trained to produce the structure most likely to appear in the PDB, and a likely ligand or ion can shape its answer without ever being seen.');
  const cam = getModel('P0DP23'), bound = lobeFit(cam, getStructure('cam1')), free = lobeFit(cam, getStructure('cam3'));
  ui.tags('af2', 'real', 'game');
  ui.reads([{ value: `${fmt(bound.n, 1)} and ${fmt(bound.c, 1)} Å`, label: 'calmodulin lobes, calcium-bound 1CLL' }, { value: `${fmt(free.n, 1)} and ${fmt(free.c, 1)} Å`, label: 'calmodulin lobes, calcium-free 1CFD' }]);
  await run.line('This model and calmodulin\'s lobes both agree with ligand-bound structures, but that is agreement, not cause: templates or training memory could explain it too.');
}

// A new case, with the two numbers side by side in the question.
async function check(run) {
  const { ui } = run;
  const st = getModel('P69441');
  ambient(run, { st, stock: stockFrom(st) });
  ui.tags('model');
  ui.reads([]);
  const a = await run.choose('A new case. A colleague brings a two-domain enzyme with no structure, predicted by AF2. Domain 1 has mean pLDDT 93, domain 2 has 91, and the PAE map is pale between them. They want to design a drug against the pocket at the interface. What do you say?', [
    { text: 'Go ahead. Both domains are very high confidence.', right: false, why: 'pLDDT is local. The pale squares say the two domains are not placed relative to each other, and that pocket depends on exactly that.' },
    { text: 'Each domain is good, but the interface pocket cannot be trusted yet.', right: true, why: 'Right. Use pLDDT for the shape of each domain and PAE for their placement. Measure the interface before relying on it.' },
    { text: 'Nothing here can be used at all.', right: false, why: 'Each domain\'s shape is valuable. Only the relative placement is in doubt.' },
  ]);
  const b = await run.choose('Another enzyme scores pLDDT 95 throughout, and its whole PAE map is blue. A student says this proves the protein has one rigid shape. What do you say?', [
    { text: 'Agreed. Blue everywhere means that nothing moves.', right: false, why: 'Adenylate kinase was also blue between its domains, yet the same model is off by up to 22 Å against its open crystal.' },
    { text: 'It shows confidence in one arrangement. Other states are not ruled out.', right: true, why: 'Right. Both scores speak of the state AF2 chose. Neither is a measure of motion.' },
    { text: 'The map must be wrong, because enzymes always move.', right: false, why: 'It may well be right about that state. It simply does not speak of others.' },
  ]);
  if (a && b) run.reach(3);
}
