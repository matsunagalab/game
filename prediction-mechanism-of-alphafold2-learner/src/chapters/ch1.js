// Chapter 1. The player works the real alignment and computes mutual information between real columns.
import { letterHex, Loom } from '../loom.js';
import { Threads, STOCK } from '../world.js';
import { entropy, mutualInformation, uniformWeights } from '../science/msa.js';
import { miniCase } from '../science/data.js';
import { fmt, miMatrix, name, PaperProtein, theFamily } from './common.js';

export default {
  id: 'loom',
  title: 'The loom',
  tease: 'Read a real family of proteins as a cloth, and find the threads that move together.',
  principle: 'Residues that touch must keep fitting, so a change at one tends to be paid for by a change at the other. A long alignment records those paired changes, which is why co-evolution reveals contacts.',
  goals: ['Find three strongly linked pairs of positions.', 'Find three pairs that really touch.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The data.</b> 2,000 sequences sampled at random from the 486,732 in Pfam's full alignment of the response regulator family, PF00072. Sequences with over 25% gaps were dropped first. The structure is E. coli CheY, PDB 3CHY, at 1.66 Å. Pfam's 111 columns cover residues 9 to 120, and 109 of them map to a residue.</p>
    <p><b>Mutual information</b> between columns i and j is the sum over letter pairs of f(a,b) log[ f(a,b) / (f(a) f(b)) ], in nats. It is zero when knowing one letter tells you nothing about the other. It can never exceed the smaller of the two columns' entropies, so a column that never changes can never score.</p>
    <p>Here a gap counts as a 21st letter and a very small even pseudocount is added. A "strong" pair means the top 2% of pairs at least 6 apart.</p>
    <p><b>Touching</b> here means C-beta atoms under 8 Å apart, C-alpha for glycine. Pairs closer than 6 along the sequence are left out, because neighbours touch anyway.</p>
    <p><b>A helping hand on a phone.</b> A column is about 3 pixels wide on a phone, so when your finger lands within two columns of a strongly linked one, the game moves your pick onto it. It does this only for a pair at least 6 apart whose columns both map to a residue. This helps your aim and changes no score.</p>
    <p><b>The new case.</b> The pair in the check was chosen because it scores high and is known to touch, and the six rows were chosen to show the pattern clearly. Its scores are from a sample of 4,000 sequences.</p>
    <p><b>In AlphaFold2.</b> AF2 does not compute mutual information. It reads the alignment itself. This chapter shows the signal it has access to.</p>
    <p class="small">Sources: Pfam (Mistry et al. 2021). CheY crystal 3CHY (Volz and Matsumura 1991). SH3 crystal 1SHG (Musacchio et al. 1992). Morcos et al. 2011.</p>`,

  setup(run) {
    const f = run.state.f = theFamily(), w = uniformWeights(f.N).w;
    run.state.w = w;
    run.state.MI = miMatrix(f.X, f.N, f.L, w);
    const all = [];
    for (let i = 0; i < f.L; i += 1) for (let j = i + 6; j < f.L; j += 1) if (f.valid(i, j)) all.push(run.state.MI[i * f.L + j]);
    all.sort((a, b) => b - a);
    run.state.strong = all[Math.floor(all.length * 0.02)];
    run.state.top = all[0];
    const { world } = run;
    const loom = run.state.loom = run.own(new Loom(world, f.msa, { rows: 60 }));
    const che = f.che;
    const model = run.state.model = run.own(new PaperProtein(world, che, { stock: () => STOCK.good, scale: 1.25, center: [0, 24, 76], spin: 0.1, size: 1.5 }));
    run.state.threads = run.own(new Threads(world, 24, { width: 0.42 }));
    run.onLayout = () => frame(run);
    frame(run, 0);
    world.shadowSpan(130);
    run.own({ dispose: () => world.shadowSpan(80) });
    run.probe = {
      column(c) { return world.project(loomPoint(run, c)); },
      strong() { return strongPairs(run); },
    };
  },

  stages: [meet, findPairs, check],
};

const loomPoint = (run, c) => { const { loom } = run.state; return [loom.columnX(c), 0.5, loom.origin[1]]; };

function frame(run, seconds = 0.7) {
  const { world } = run, { loom, model } = run.state, s = world.stage, tall = s.h > s.w * 0.92;
  const [w, h] = loom.size();
  if (tall) {
    loom.relocate(0, -44);
    model.center.set(0, 22, 62);
    world.look({ target: [0, 0, 8], dist: world.fitDist(w * 1.04, h + 118, 0.16), polar: 0.16, az: 0 }, seconds);
  } else {
    loom.relocate(-48, 0);
    model.center.set(88, 22, 6);
    world.look({ target: [7, 0, 0], dist: world.fitDist(w + 136, h * 1.16, 0.14), polar: 0.14, az: 0 }, seconds);
  }
}

function strongPairs(run) {
  const { f, MI, strong } = run.state, out = [];
  for (let i = 0; i < f.L; i += 1) for (let j = i + 6; j < f.L; j += 1) if (f.valid(i, j) && MI[i * f.L + j] >= strong) out.push([i, j, MI[i * f.L + j], f.touching(i, j)]);
  return out.sort((a, b) => b[2] - a[2]);
}

// Scrubbing the cloth. Resolves with the column under the finger when it lifts.
function pickColumn(run, k, onMove, snap = (c) => c) {
  const { loom } = run.state, { world } = run;
  return run.until((done) => {
    const tag = run.ui.label('', 'big');
    tag.el.style.display = 'none';
    let cur = -1;
    const at = (x, y) => {
      const p = world.onPlane(x, y, 0.5);
      if (!p) return;
      const c = snap(loom.columnAt(p.x));
      if (c !== cur) { cur = c; loom.mark(k, c); run.sound.pick(c % 6); onMove?.(c); }
      tag.el.style.display = '';
      tag.set(name(run.state.f, c));
      tag.at({ x, y: y - 58 });
    };
    run.pointer({ down: at, move: at, up: () => { if (cur >= 0) { tag.remove(); run.handlersOff?.(); done(cur); } } });
  });
}

async function meet(run) {
  const { ui } = run, { f, loom, w } = run.state;
  ui.tags('real');
  await run.line('This cloth is woven from real proteins.');
  await run.line(`Each strip across is one sequence. The family has ${f.msa.nFamily.toLocaleString('en')} of them, and these are 60 of a sample of ${f.N.toLocaleString('en')}.`);
  await run.line('Each thread down is one position, lined up across all those sequences. This table is a <b>multiple sequence alignment</b>, or MSA.');
  ui.say('Drag along the cloth and lift your finger to pick a position.');
  const a = await pickColumn(run, 0);
  run.handlersClear = true;
  loom.sortBy(a);
  run.sound.rustle(8, 0.05);
  run.state.a = a;
  await run.sleep(700);
  const h = entropy(f.X, f.N, f.L, a, w);
  ui.tags('real', 'game');
  ui.reads([{ value: fmt(h), label: 'variety at this position (its entropy)' }]);
  await run.line(`The strips have gathered by their letter at ${name(f, a)}, and the same letters now sit together.`);
  await run.line('Some positions hardly change at all. Others change a lot.');
}

async function findPairs(run) {
  const { ui, world, sound } = run, { f, loom, MI, strong, threads, model, w } = run.state;
  ui.reads([]);
  ui.tags('real', 'game');
  await run.line('Here is the idea. If two residues touch, a change in one can break the fit, unless the other changes too.');
  await run.line('So look for two positions whose letters move together. A number called <b>mutual information</b> measures that: how much one letter tells you about the other.');
  const found = [];
  const contacts = () => found.filter((x) => x.touch).length;
  let a = run.state.a ?? 40;
  for (let tries = 0; tries < 200; tries += 1) {
    ui.ctrl();
    ui.say(found.length < 3 ? 'Pick a first position. Bright columns are linked to it.' : 'Keep hunting. Now find pairs that really touch.');
    ui.reads(status());
    a = await pickOnce(run, 0);
    loom.sortBy(a);
    sound.rustle(5, 0.04);
    const glow = new Float32Array(f.L);
    loom.mark(1, -1);
    for (let c = 0; c < f.L; c += 1) glow[c] = c === a ? 0 : Math.min(1, (MI[a * f.L + c] / (strong * 1.1)) ** 2);
    loom.setGlow(glow);
    ui.say(`Now drag to a second position, and watch the number.`);
    const strip = pairStrip(run);
    ui.ctrl(strip);
    const b = await pickOnce(run, 1, (c) => {
      ui.reads([{ value: fmt(mutualInformation(f.X, f.N, f.L, a, c, w)), label: `mutual information, ${name(f, a)} with ${name(f, c)}` }, ...status()]);
      strip.paint(a, c, name(f, a), name(f, c));
    }, (c) => {
      // A column is about 3 pixels wide on a phone, so a strongly linked column within two of the finger catches it.
      let best = c;
      for (let x = Math.max(0, c - 2); x <= Math.min(f.L - 1, c + 2); x += 1) if (x !== a && Math.abs(x - a) >= 6 && f.valid(Math.min(a, x), Math.max(a, x)) && MI[a * f.L + x] >= strong && MI[a * f.L + x] > (best === a ? 0 : MI[a * f.L + best])) best = x;
      return best;
    });
    loom.sortBy(a, b);
    await run.sleep(420);
    strip.paint(a, b, name(f, a), name(f, b));
    const m = mutualInformation(f.X, f.N, f.L, a, b, w);
    const i = Math.min(a, b), j = Math.max(a, b);
    if (j - i < 6) { ui.say('Those two are neighbours along the chain, so try positions further apart.'); await run.sleep(1500); continue; }
    if (!f.valid(i, j)) { ui.say('One of those columns has no residue in this protein, so try another.'); await run.sleep(1500); continue; }
    const d = f.D[i * f.L + j], ra = f.col2res[a], rb = f.col2res[b], touch = d < 8;
    threads.add(f.che.cb[ra], f.che.cb[rb], touch ? '#0053d6' : '#ff7d45', touch ? 0.5 : 0.34, model.group);
    sound.fold();
    if (m >= strong) {
      if (!found.some((x) => x.i === i && x.j === j)) found.push({ i, j, touch });
      ui.say(`${name(f, a)} and ${name(f, b)} are strongly linked, and in the real structure they are ${fmt(d, 1)} Å apart. ${touch ? 'They touch.' : 'They do not touch.'}`);
      ui.tags('real', 'game');
    } else {
      ui.say(`Mutual information ${fmt(m)} is weak here, and those two are ${fmt(d, 1)} Å apart.`);
    }
    ui.reads(status());
    await run.sleep(300);
    if (found.length >= 3) run.reach(1);
    if (contacts() >= 3) run.reach(2);
    if (contacts() >= 3) break;
    await run.sleep(1700);
    if (found.length >= 3 && contacts() < 1) await run.line('Strong links, but look at the threads. Orange ones do not touch. That is common, and chapter 2 is about why.');
  }
  function status() { return [{ value: `${found.length}`, label: 'strong pairs' }, { value: `${contacts()}`, label: 'that touch' }]; }
  const s = strongPairs(run), hit = s.filter((x) => x[3]).length;
  ui.ctrl();
  await run.sleep(1200);
  ui.reads([{ value: `${hit} of ${s.length}`, label: 'of all strong pairs touch' }]);
  ui.tags('game');
  await run.line('Across all the strong pairs, most do not touch. Mutual information sees the signal, and it also sees a lot else.');
}

// The two chosen columns side by side, in the order the cloth is sorted. Blocks that line up are the signal.
function pairStrip(run) {
  const c = document.createElement('canvas');
  c.className = 'chart';
  c.style.height = '50px';
  c.paint = (a, b, nameA, nameB) => {
    const { f, loom } = run.state, { X, L } = f, dpr = Math.min(devicePixelRatio || 1, 2), W = c.clientWidth || 300, H = 50;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rows = loom.pick.map((s, r) => [loom.to[r], s]).sort((x, y) => x[0] - y[0]), left = 44, w = (W - left) / rows.length;
    g.font = '13px "Alegreya Sans", sans-serif'; g.fillStyle = '#26343f'; g.textBaseline = 'middle';
    g.fillText(nameA, 0, 13); g.fillText(nameB, 0, 37);
    const LET = 'ACDEFGHIKLMNPQRSTVWY-';
    rows.forEach(([, s], k) => {
      for (const [col, y] of [[a, 1], [b, 25]]) {
        g.fillStyle = letterHex(X[s * L + col]);
        g.fillRect(left + k * w, y, Math.ceil(w), 23);
      }
    });
    g.fillStyle = '#26343f'; g.textAlign = 'center';
    let start = 0;
    for (const [col, y] of [[a, 13], [b, 37]]) {
      start = 0;
      for (let k = 1; k <= rows.length; k += 1) {
        const v = X[rows[Math.min(k, rows.length - 1)][1] * L + col], u = X[rows[start][1] * L + col];
        if (k === rows.length || v !== u) { if (k - start >= 4) g.fillText(LET[u], left + ((start + k) / 2) * w, y); start = k; }
      }
    }
    g.textAlign = 'left';
  };
  return c;
}

// One selection: installs a pointer, resolves on lift, then removes itself.
function pickOnce(run, k, onMove, snap) {
  const before = run.handlers.length;
  return pickColumn(run, k, onMove, snap).then((c) => {
    run.handlers.splice(before).forEach((h) => h());
    return c;
  });
}

async function check(run) {
  const { ui } = run, { rows, names, mi, d, n } = miniCase();
  ui.reads([]);
  ui.tags('real');
  const head = ['P1', 'P2', 'P3', 'P4'];
  const table = `<span style="font-family:ui-monospace,Menlo,monospace;font-size:15.5px;line-height:1.35;display:block;margin:4px 0">${head.join(' ')}<br>${rows.map((r) => r.split('').join('  ')).join('<br>')}</span>`;
  const first = await run.choose(`A new protein: six real SH3 domains, from a family of ${n.toLocaleString('en')}. Which two positions most likely touch?${table}`, [
    { text: 'P1 and P2', right: false, why: 'P2 never changes. A position with no variety can tell you nothing about another.' },
    { text: 'P3 and P4', right: false, why: 'P3 changes, but the same letter at P3 sits with different letters at P4. Look for a tighter partner.' },
    { text: 'P1 and P4', right: true, why: `Right. G goes with F, A with I, and V with V: small with large, medium with medium. Across the family they score ${fmt(mi.pair)}, against ${fmt(mi.flat)} for P2, and in a real structure they are ${names[0]} and ${names[3]}, ${fmt(d, 1)} Å apart.` },
  ]);
  const second = await run.choose('Why does a pair like that suggest contact?', [
    { text: 'Touching residues must keep fitting, so changes are paid for in pairs.', right: true, why: 'Yes. Evolution keeps what still folds. A change in size at one site survives with a matching change at the other.' },
    { text: 'Those two letters are chemically similar.', right: false, why: 'G and F are very different. The signal is two positions changing together, not similarity.' },
    { text: 'Conserved positions always touch.', right: false, why: 'Conservation is about one position. A contact signal needs two positions varying together.' },
  ]);
  if (first && second) run.reach(3);
}
