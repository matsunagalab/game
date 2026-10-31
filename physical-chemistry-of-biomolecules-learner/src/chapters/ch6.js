// The ledger: what is measured about one famous binding event, and what is only an illustration.
import { ledgerBar, text, INK, RED, BLUE } from '../charts.js';
import { LIT, TOY } from '../bench.js';

// Wild-type streptavidin and biotin, Magalhaes et al., Protein Science 2011, table II (300 K).
const TOTAL = { dG: -18.0, dH: -29.4, mTdS: 11.4 };
const DESTHIO = { dG: -12.4, dH: -21.7, mTdS: 9.3 };

// Mutants at the ureido oxygen, kcal/mol lost relative to wild type at 37 C: Klumb et al., Biochemistry 1998.
// Y43F is the closest to removing one hydrogen bond and nothing else.
const MUTANTS = [
  { name: 'Y43F', ddG: 1.2, ddH: 1.2 },
  { name: 'N23E', ddG: 2.6, ddH: 3.7 },
  { name: 'S27A', ddG: 2.9, ddH: 4.9 },
  { name: 'Y43A', ddG: 2.6, ddH: 7.8 },
  { name: 'N23A', ddG: 3.5, ddH: 7.9 },
];

// S45A and D128A, alone and together, 298 K: Hyre et al., Protein Science 2006, table 5.
const HYRE = [
  ['ΔΔG', 8.7, 10.1],
  ['ΔΔH', 12.0, 10.3],
  ['TΔΔS', 3.3, 0.3],
];

// An illustration only. These seven terms are not measured and have no unique definition.
const TERMS = [
  { name: 'Hydrogen bonds to biotin', kind: 'H', v: -12, why: 'A network of hydrogen bonds grips the ureido ring.', sign: -1 },
  { name: 'Close packing against the pocket', kind: 'H', v: -13, why: 'Biotin fits tightly, and many weak contacts add up.', sign: -1 },
  { name: 'Pulling polar groups out of water', kind: 'H', v: 6, why: 'Water bonds had to break first: the books of chapter four.', sign: 1 },
  { name: 'Water and loops settling in the pocket', kind: 'H', v: -10.4, why: 'Set by hand so that the sum matches.', sign: -1 },
  { name: 'Loss of free flight and tumbling', kind: 'S', v: 11, why: 'Two molecules become one, and freedom is lost.', sign: 1 },
  { name: 'Freezing the flexible tail', kind: 'S', v: 2.4, why: 'Each frozen bond costs entropy: chain entropy again.', sign: 1 },
  { name: 'Water set free from oily surfaces', kind: 'S', v: -2, why: 'Set by hand so that the sum matches.', sign: -1 },
];

export const ledger = {
  id: 'ledger',
  ch: 6,
  title: 'The whole ledger',
  lede: 'Streptavidin holds biotin more tightly than almost any other pair in biology. Start from what experiments really measure, and see how far a term-by-term account can go.',
  goals: ['Read what was really measured.', 'Say what the N23A mutation does to ΔG, given its ΔH, before you see it.', 'Sign all seven illustrated terms.'],
  note: {
    formula: 'ΔG = ΔH − TΔS = −29.4 + 11.4 = −18.0 kcal/mol (300 K)',
    text: 'Every force you measured is at work here at once. Binding is enthalpy-driven, with an entropy cost. Measured mutants show why a term-by-term split is hard. Three of the five ureido-pocket mutants lose far more ΔH than ΔG at 37 °C, one shows no gap, and the gaps change with temperature. A double mutant does not behave as its two parts added together, and its excess is mostly entropic. Free energies in biomolecules are small differences between large terms that do not simply add.',
    honest: 'Only ΔH is calorimetric here. ΔG uses a binding constant from other work, and −TΔS follows from those two. The wild-type table is reported at 300 K, while the paper\'s methods mention 25 °C. Other calorimetric sets differ by several kcal/mol in ΔH. Mutants are at 37 °C (Klumb et al. 1998); at 25 °C ΔΔH is smaller for S27A (1.6) and N23E (0.9), and Y43F even gains (−2.6). Large side-chain moves appear only in N23A and Y43A (Le Trong et al. 2003), so those two gaps need not be about one bond. The double mutant is at 298 K (Hyre et al. 2006, table 5). Reported ΔCp ranges from about −345 to −460 cal/mol/K. The seven terms are this game\'s illustration. They have no unique definition, even in principle (Mark and van Gunsteren 1994; Boresch and Karplus 1995).',
  },
  async run(b) {
    b.world(10);
    b.pattern(true);
    b.heat(0.32);
    const placed = [];
    let show = { ...TOTAL };
    let illustration = false;
    let lit = 0;
    b.draw((r) => {
      const s = b.scale;
      const [cx, cy] = b.px(5, 5);
      r.disk(cx, cy, s * 3.2, [0.45, 0.58, 0.72]);
      const n = TERMS.length;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const on = placed[i] !== undefined;
        const [x, y] = b.px(5 + Math.cos(a) * 4.1, 5 + Math.sin(a) * 4.1);
        r.bead(x, y, s * 0.38, on ? [0.78, 0.22, 0.13] : [0.65, 0.6, 0.5]);
      }
      r.disk(cx, cy, s * (0.9 + 0.8 * lit), [0.86, 0.66, 0.28]);
    });
    const sums = () => {
      if (!illustration) return { h: show.dH, m: show.mTdS, g: show.dG };
      let h = 0, m = 0;
      TERMS.forEach((t, i) => { if (placed[i] !== undefined) { if (t.kind === 'H') h += t.v; else m += t.v; } });
      return { h, m, g: h + m };
    };
    const threeRows = (g, box) => {
      const { h, m, g: dG } = sums();
      const rows = [['ΔH', h, BLUE], ['−TΔS', m, RED], ['ΔG', dG, INK]];
      const hg = Math.min(30, (box.h - 8) / 3);
      rows.forEach(([n, v, col], i) => {
        const y = box.y + 2 + i * (hg + 3);
        text(g, n, box.x, y + hg * 0.72);
        ledgerBar(g, box.x + 44, y, box.w - 104, hg - 4, v, 44, col);
        text(g, `${v >= 0 ? '+' : ''}${v.toFixed(1)}`, box.x + box.w, y + hg * 0.72, { align: 'right', color: col });
      });
      const mid = box.x + 44 + (box.w - 104) / 2;
      g.strokeStyle = INK;
      g.beginPath(); g.moveTo(mid, box.y); g.lineTo(mid, box.y + 3 * (hg + 3)); g.stroke();
    };
    b.chart(threeRows);
    b.say('First, what is really measured. A calorimeter gives ΔH directly. ΔG comes from a binding constant, and −TΔS from those two.');
    b.read(() => `${LIT} wild type, kcal/mol, 300 K`);
    await b.go('Remove a hydrogen bond');
    let pick = [{ name: 'N23A', ddH: 7.9, ddG: 0 }];
    b.chart((g, box) => {
      const h = Math.min(30, (box.h - 16) / Math.max(1, pick.length));
      text(g, 'kcal/mol lost at 37 °C', box.x, box.y + 10, { color: 'rgba(16,29,56,.65)' });
      let y = box.y + 15;
      const lw = 52;
      for (const m of pick) {
        text(g, m.name, box.x, y + h * 0.66);
        g.fillStyle = BLUE;
        g.fillRect(box.x + lw, y, (m.ddH / 9) * (box.w - lw - 62), h * 0.42);
        g.fillStyle = INK;
        g.fillRect(box.x + lw, y + h * 0.46, (m.ddG / 9) * (box.w - lw - 62), h * 0.42);
        text(g, `${m.ddH}`, box.x + box.w, y + h * 0.4, { align: 'right', color: BLUE });
        text(g, `${m.ddG || '?'}`, box.x + box.w, y + h * 0.86, { align: 'right' });
        y += h;
      }
      text(g, 'ΔΔH', box.x + box.w - 90, box.y + 10, { color: BLUE });
      text(g, 'ΔΔG', box.x + box.w - 50, box.y + 10);
    });
    b.say('N23A removes a side chain that bonds to biotin. At 37 °C ΔH gets worse by 7.9 kcal/mol. How much does ΔG get worse?');
    b.read(() => `${LIT} 37 °C`);
    const comp = await b.ask(['all of it, 7.9', 'less than half, 3.5', 'none of it']);
    pick = MUTANTS;
    b.say('3.5, and here are all five mutants. Three show a large gap at 37 °C; Y43F, the closest to removing one bond, shows none.');
    b.read(() => `${LIT} 37 °C. Large side-chain moves only in N23A and Y43A. At 25 °C ΔΔH: S27A 1.6, N23E 0.9, Y43F −2.6.`);
    await b.wait(2.6);
    await b.go('Two mutations at once');
    b.chart((g, box) => {
      const h = Math.min(30, (box.h - 18) / 3);
      text(g, 'added singles', box.x + 56, box.y + 11, { color: 'rgba(16,29,56,.75)' });
      text(g, 'measured', box.x + box.w - 90, box.y + 11, { color: RED });
      HYRE.forEach(([n, add, got], i) => {
        const y = box.y + 16 + i * h;
        text(g, n, box.x, y + h * 0.66);
        g.fillStyle = 'rgba(16,29,56,.7)';
        g.fillRect(box.x + 56, y, (add / 13) * (box.w - 104), h * 0.42);
        g.fillStyle = RED;
        g.fillRect(box.x + 56, y + h * 0.46, (got / 13) * (box.w - 104), h * 0.42);
        text(g, `${add.toFixed(1)}`, box.x + box.w, y + h * 0.4, { align: 'right' });
        text(g, `${got.toFixed(1)}`, box.x + box.w, y + h * 0.86, { align: 'right', color: RED });
      });
    });
    b.say('S45A and D128A remove two neighbouring hydrogen bonds. The singles add to 8.7 in ΔΔG; together they lose 10.1. The cooperativity is entropic.');
    b.read(() => `${LIT} 298 K, kcal/mol. ΔΔH 12.0 added, 10.3 measured; TΔΔS 3.3 added, 0.3 measured.`);
    await b.wait(2.6);
    await b.go('Then draw a ledger anyway');
    illustration = true;
    b.chart(threeRows);
    b.say('Terms do not add, so any split is a story, not a measurement. Here is one such story. Sign each term.');
    let right = 0;
    for (let i = 0; i < TERMS.length; i++) {
      const t = TERMS[i];
      b.read(() => `${TOY} <b>${t.name}</b> (${t.kind === 'H' ? 'ΔH' : '−TΔS'})`);
      const a = await b.ask(['favours binding', 'opposes binding']);
      const ok = (a === 0 ? -1 : 1) === t.sign;
      if (ok) { right++; b.sound.pluck(5 + i, 0.3); } else b.buzz(30);
      placed[i] = true;
      lit = (i + 1) / TERMS.length;
      b.say(`${t.v > 0 ? '+' : ''}${t.v.toFixed(1)} kcal/mol, an illustrated number. ${t.why}`);
      await b.wait(1.5);
    }
    b.say('The fourth and seventh terms were set to make this sum match. The seven terms have no unique definition, even in principle.');
    b.read(() => `${TOY} sum of illustrated terms, ${LIT} total`);
    await b.wait(2.6);
    await b.go('A weaker ligand');
    illustration = false;
    show = { ...DESTHIO };
    placed.length = 0;
    lit = 0.3;
    b.say(`Desthiobiotin lacks biotin's sulfur ring. Measured: ΔH weaker by ${(DESTHIO.dH - TOTAL.dH).toFixed(1)}, entropy cost eased by ${(TOTAL.mTdS - DESTHIO.mTdS).toFixed(1)}, ΔG weaker by ${(DESTHIO.dG - TOTAL.dG).toFixed(1)}.`);
    b.read(() => `${LIT} desthiobiotin, kcal/mol, 300 K`);
    await b.wait(3);
    return { seals: 1 + (comp === 1 ? 1 : 0) + (right === 7 ? 1 : 0), score: `You signed ${right} of 7 illustrated terms, and called the N23A result ${comp === 1 ? 'right' : 'wrong'}.` };
  },
};
