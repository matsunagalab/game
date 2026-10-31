// The closing paper: the player's force field, the final test, and what was simplified.
import { save, frcmod, PLATES, TIERS, persist } from '../save.js';
import { typeset } from '../ui.js';
import { NAMES } from '../physics/fold.js';

const CITE = [
  'Abascal JLF, Vega C. J Chem Phys 123, 234505 (2005)', 'Bayly CI et al. J Phys Chem 97, 10269 (1993)', 'Berendsen HJC, Grigera JR, Straatsma TP. J Phys Chem 91, 6269 (1987)',
  'Best RB et al. J Chem Theory Comput 8, 3257 (2012)', 'Best RB, Hummer G. J Phys Chem B 113, 9004 (2009)', 'Best RB, Zheng W, Mittal J. J Chem Theory Comput 10, 5113 (2014)',
  'Bouvignies G et al. Nature 477, 111 (2011)', 'Cheung MS, García AE, Onuchic JN. PNAS 99, 685 (2002)', 'Debiec KT, Gronenborn AM, Chong LT. J Phys Chem B 118, 6561 (2014)',
  'Debiec KT et al. J Chem Theory Comput 12, 3926 (2016)', 'Hornak V et al. Proteins 65, 712 (2006)', 'Huang J et al. Nat Methods 14, 71 (2017)', 'Izadi S, Anandakrishnan R, Onufriev AV. J Phys Chem Lett 5, 3863 (2014)',
  'Jorgensen WL, Madura JD, Swenson CJ. J Am Chem Soc 106, 6638 (1984)', 'Jorgensen WL, Maxwell DS, Tirado-Rives J. J Am Chem Soc 118, 11225 (1996)', 'Kovács DP et al. J Am Chem Soc 147, 17598 (2025)',
  'Lifson S, Roig A. J Chem Phys 34, 1963 (1961)', 'Lindorff-Larsen K et al. Proteins 78, 1950 (2010)', 'Lopes PEM et al. J Chem Theory Comput 9, 5430 (2013)', 'MacKerell AD, Feig M, Brooks CL. J Comput Chem 25, 1400 (2004)',
  'Maier JA et al. J Chem Theory Comput 11, 3696 (2015)', 'Mobley DL, Guthrie JP. J Comput Aided Mol Des 28, 711 (2014)', 'Mulder FAA et al. Nat Struct Biol 8, 932 (2001)', 'Noé F et al. PNAS 106, 19011 (2009)',
  'Petrov D, Zagrovic B. PLoS Comput Biol 10, e1003638 (2014)', 'Piana S, Lindorff-Larsen K, Shaw DE. Biophys J 100, L47 (2011)', 'Piana S et al. J Phys Chem B 119, 5113 (2015)', 'Piana S et al. J Chem Theory Comput 16, 2494 (2020)',
  'Ponder JW et al. J Phys Chem B 114, 2549 (2010)', 'Robustelli P, Piana S, Shaw DE. PNAS 115, E4758 (2018)', 'Rohl CA, Baldwin RL. Biochemistry 36, 8435 (1997)', 'Shalongo W, Dugad L, Stellwagen E. J Am Chem Soc 116, 8288 (1994)',
  'Shirts MR, Chodera JD. J Chem Phys 129, 124105 (2008)', 'Stark AC, Andrews CT, Elcock AH. J Chem Theory Comput 9, 4176 (2013)', 'Tian C et al. J Chem Theory Comput 16, 528 (2020)', 'Vuister GW, Bax A. J Am Chem Soc 115, 7772 (1993)',
  'Wang LP, Martinez TJ, Pande VS. J Phys Chem Lett 5, 1885 (2014)', 'Wang LP et al. J Phys Chem B 121, 4023 (2017)', 'Yoo J, Aksimentiev A. J Chem Theory Comput 12, 430 (2016)', 'Yoo J, Aksimentiev A. Phys Chem Chem Phys 20, 8432 (2018)',
];

export function showPaper(game) {
  const { ff, tiers } = save;
  const counts = [0, 0, 0, 0];
  PLATES.forEach(p => counts[tiers[p.id] ?? 0]++);
  const score = PLATES.reduce((s, p) => s + (tiers[p.id] ?? 0), 0);
  const cites = Math.round(40 * Math.exp(score / 6.5)) + 7;
  const row = (name, mine, ref, d = 3) => `<tr><td>${name}</td><td>${mine == null ? '—' : Number(mine).toFixed(d).replace('-', '−')}</td><td>${ref}</td></tr>`;
  const c = ff.card, P = ff.meta;
  const states = c ? NAMES.map((n, i) => `<tr><td>${n}</td><td>${(c.p[i] * 100).toFixed(0)}%</td><td>${(c.target[i] * 100).toFixed(0)}%</td></tr>`).join('') + `<tr><td>melting temperature</td><td>${c.tm.toFixed(0)} K</td><td>${c.tmT.toFixed(0)} K</td></tr><tr><td>unfolded Rg</td><td>${c.rg.toFixed(2)} Å</td><td>${c.rgT.toFixed(2)} Å</td></tr>` : '<tr><td colspan="3">Finish the finale to fill this table.</td></tr>';
  const el = document.getElementById('paper');
  el.innerHTML = typeset(`<article>
    <p class="journal">Journal of Small Time Steps, volume 3, pages 1–12 (2026)</p>
    <h2>ff26: a force field developed by hand</h2>
    <p class="author">You, with comments from Reviewer 2</p>
    <div class="stamp">${TIERS[Math.max(1, Math.round(score / PLATES.length))]}</div>
    <h3>Abstract</h3>
    <p>We report a force field developed term by term. Torsions were fitted around the 1–4 terms and checked on a helix-coil transition. A backbone map was balanced between two ensembles. Charges were fitted to a field, restrained, and judged in a liquid. Pair corrections left the combining rules behind where they had to. Protein-water and protein-protein strength were balanced against each other. Last, finite runs, reweighting and a real fit were spent on one chain, and the result was judged by tests the fit never used${c ? `, after ${c.runs} runs` : ''}.</p>
    <h3>Table 1. Your force field, by the referee</h3>
    <table><tr><th>Observable</th><th>Yours</th><th>Target</th></tr>${states}</table>
    <h3>Table 2. Your parameters</h3>
    <table><tr><th>Parameter</th><th>Yours</th><th>For comparison</th></tr>
      ${row('Butane <i>V</i>₁', ff.V?.[0], ff.on14 ? 'with 1–4 on' : 'OPLS-UA 1.411', 2)}${row('Butane <i>V</i>₃', ff.V?.[2], 'OPLS-UA 3.145', 2)}
      ${row('ψ correction <i>k</i>', ff.kPsi, 'ff99SB* 0.179')}
      ${row('RESP <i>a</i> (au)', ff.respA, 'standard 0.0005, 0.001', 4)}${row('Water <i>q</i>₀', ff.qWater, 'TIP3P −0.834')}
      ${row('Arg–Asp <i>R</i>min (Å)', ff.rArg, 'CHARMM36m 3.637')}${row('Argon σ (Å)', ff.sigma, '3.405')}${row('Argon ε', ff.eps, '0.238')}
      ${row('Protein-water ×', P?.gamma ?? ff.gamma, 'teaching model')}${row('Protein-protein ×', P?.E ?? ff.E, 'teaching model')}
      ${row('Charge scale ×', P?.q, 'teaching model')}${row('Torsion <i>k</i> (finale)', P?.k, 'teaching model')}${row('Buried water <i>w</i>', P?.w, 'teaching model')}
    </table>
    <h3>What was simplified</h3>
    <p>Every physical readout comes from a calculation, on reduced systems. The helix-coil plate uses published Lifson-Roig numbers. The argon and water drops are live molecular dynamics. The CMAP targets, the reference field, the salt-bridge curve and Plates IX to XII are teaching models with invented numbers. The final chain has 16 beads on a cubic lattice: its populations are exact for that model, and they are not predictions for any real protein. Some motion, such as the water around the salt bridge, is illustrative.</p>
    <h3>Supporting information</h3>
    <pre>${frcmod()}</pre>
    <h3>References</h3>
    <p style="font-size:.9rem">${CITE.join('. ')}.</p>
    <p><i>${counts[3]} of ${PLATES.length} plates accepted. Cited by ${cites.toLocaleString('en-US')}.</i></p>
    <button id="p-copy">Copy the file</button><button id="p-back">Back to the equation</button>
  </article>`);
  el.classList.add('open');
  el.scrollTop = 0;
  document.getElementById('p-back').onclick = () => { el.classList.remove('open'); game.home(); };
  document.getElementById('p-copy').onclick = async e => {
    try { await navigator.clipboard.writeText(frcmod()); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select the text to copy it'; }
  };
  persist();
}
