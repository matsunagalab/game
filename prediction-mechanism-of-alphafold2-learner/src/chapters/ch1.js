// Chapter 1. Pair two columns of a real alignment: read all the sequences, fill a cell of the pair table, and see what the
// two residues do in the real structure. That is the step AlphaFold2 calls the outer product mean, by hand.
import { Color } from 'three';
import { Quilt, Threads, STOCK } from '../world.js';
import { TileBoard } from '../tiles.js';
import { columnDistances, getStructure, loadSH3 } from '../science/data.js';
import { entropy, mutualInformation, uniformWeights } from '../science/msa.js';
import { CHEY, SH3 } from '../science/cases.js';
import { Abort } from '../run.js';
import { fmt, miMatrix, PaperProtein, theFamily } from './common.js';
import { tr } from '../i18n.js';

const BLUE = '#0053d6', ORANGE = '#ff7d45', WEAK = new Color('#cfdbe2');

const GOALS = tr(['Drag S56 onto the column that changes with it.', 'Find three pairs that really touch.', 'New family: find a pair that touches.'], ['S56をつかみ、いっしょに変わる列へ重ねる。', '実際に接触している組を3つ見つける。', '新しいファミリーで、接触している組を見つける。']);

export default {
  id: 'loom',
  puzzle: true,
  place: [0, 1],
  title: tr('The loom', '織機'),
  tease: tr('Pair columns of a real alignment, and watch which residues turn out to touch.', '本物のアラインメントの列を組にして、どの残基が接触しているかを確かめる。'),
  principle: tr('Touching residues must keep fitting, so they tend to change in pairs. AlphaFold2 can read those paired changes from every pair of alignment columns into its pair table, with learned numbers, not mutual information.', '接触している残基はかみ合ったままでなければならず、対で変わることが多い。AlphaFold2はアラインメントの列の組をすべて読み、この対の変化をペア表現に書き込める。使うのは相互情報量ではなく、学習した数値である。'),
  goals: GOALS,
  note: tr(`<h3>Chapter note</h3>
    <p><b>Your move and AlphaFold2.</b> Pairing two columns, reading across every sequence and writing one number into a cell of a table is the shape of AF2's <b>outer product mean</b> (Supplementary Algorithm 10): for each pair of columns i and j it multiplies learned features of the two columns, averages over the sequences, and adds the result to cell ij of the pair representation. It does this for all pairs at once, in each of 48 Evoformer blocks. What is not the same: those 48 blocks average over at most 512 sampled sequences, and AF2 does not compute mutual information. Its numbers are learned in training on known structures, and no rule in it says that paired changes mean contact. DeepMind's own words on such relationships are that encouraging them is "the intention but we only observe the outcome that it increases model accuracy" (Supplement 1.9). The game computes mutual information because it can be checked by hand. The threads on the protein are the game's check against a crystal, which a prediction for a new protein does not have.</p>
    <p><b>The data.</b> 2,000 sequences sampled at random from the 486,732 in Pfam's full alignment of the response regulator family, PF00072. Sequences with over 25% gaps were dropped first. The structure is E. coli CheY, PDB 3CHY, at 1.66 Å. Pfam's 111 columns cover residues 9 to 120, and 109 of them map to a residue. The new family is SH3, PF00018: 4,000 sequences sampled from 176,305, with gappy ones dropped, on the spectrin SH3 crystal 1SHG.</p>
    <p><b>The tiles are chosen, and the score is not.</b> The twelve rows on the board are real sequences, picked by a search so that the true pairs show clearly by eye and unrelated columns do not. Twelve random rows would look far messier. The columns are picked too. Only the meter, the strong line and the distances are measured, and they use every sequence, not the tiles.</p>
    <p><b>Mutual information</b> between columns i and j is the sum over letter pairs of f(a,b) log[ f(a,b) / (f(a) f(b)) ], in nats. It is zero when knowing one letter tells you nothing about the other. It can never exceed the smaller of the two columns' entropies, so a column that never changes can never score.</p>
    <p>Here a gap counts as a 21st letter and a very small even pseudocount is added. A "strong" pair means the top 2% of pairs at least 6 apart, and that is the line on the meter.</p>
    <p><b>Touching</b> here means C-beta atoms under 8 Å apart, C-alpha for glycine. Pairs closer than 6 along the sequence are left out, because neighbours touch anyway.</p>
    <p><b>Orange threads</b> are strong pairs that do not touch. E89 and K119, for instance, score high and sit 16.7 Å apart. Such pairs are common: by this rule most strong pairs do not touch in CheY. The line is a rule, so a pair just past it can still touch by its side chains, as S104 and K119 do, and a pair that does not touch here may touch in another member of the family. Chapter 2 is about why.</p>
    <p><b>Level 3.</b> The meter stays hidden until you commit, so the rows are all you have. You commit once for each set of rows, and a miss brings new rows from the same family. The pairs that count are strong by the same rule and touch in 1SHG. N35 and K43 show a real swap of charges, and V44 and V53 a swap of sizes: G with F, A with I, V with V.</p>
    <p class="small">Sources: Jumper et al. 2021, Supplementary Information, Algorithm 10. Pfam (Mistry et al. 2021). CheY crystal 3CHY (Volz and Matsumura 1991). SH3 crystal 1SHG (Musacchio et al. 1992). Morcos et al. 2011.</p>`, `<h3>この章の注</h3>
    <p><b>手の動きとAlphaFold2。</b>2つの列を組にして全配列を読み、表のマスに1つの数を書き込む。これはAF2の<b>外積の平均</b>（outer product mean、Supplementary Algorithm 10）と同じ形である。AF2は列iと列jの組ごとに、2列の学習済みの特徴を掛け合わせ、配列について平均し、ペア表現のマスijに足す。すべての組を同時に、48個のEvoformerブロックのそれぞれで行う。違う点もある。この48個のブロックが平均するのは、抽出した最大512配列である。またAF2は相互情報量を計算しない。数値は既知の構造での訓練で学習したもので、対の変化が接触を意味するという規則が組み込まれているわけではない。DeepMindもこのような関係について、促すのは「意図であり、観察できるのはモデルの精度が上がるという結果だけである（the intention but we only observe the outcome that it increases model accuracy）」と書いている（Supplement 1.9）。このゲームが相互情報量を使うのは、手で確かめられるからである。タンパク質の上の糸は、ゲームが結晶構造と照らし合わせたものである。新しいタンパク質の予測には、この結晶構造はない。</p>
    <p><b>データ。</b>応答調節因子ファミリー（PF00072）のPfam全アラインメント486,732配列から、無作為に2,000配列を抽出した。先にギャップが25%を超える配列を除いている。立体構造は大腸菌のCheY（PDB 3CHY、分解能1.66 Å）である。Pfamの111列は残基9〜120にあたり、そのうち109列が残基に対応する。新しいファミリーはSH3（PF00018）で、ギャップの多い配列を除いたうえで176,305配列から4,000配列を抽出し、スペクトリンSH3の結晶構造1SHGに対応させた。</p>
    <p><b>タイルは選んであり、値は選んでいない。</b>盤上の12行は本物の配列だが、本当の組が目で見えやすく、無関係な列が組に見えないよう、探索で選んだ。無作為の12行なら、ずっと乱雑に見える。列も選んである。測った値はメーター、「強い」の線、距離だけで、これらはタイルではなく全配列から計算している。</p>
    <p>列iと列jの<b>相互情報量</b>（mutual information）は、文字の組すべてについて f(a,b) log[ f(a,b) / (f(a) f(b)) ] を足した値で、単位はナットである。片方の文字が分かってももう片方について何も分からないとき、0になる。2列のエントロピーの小さいほうを超えることはないので、変化しない列の値は0のままである。</p>
    <p>ここではギャップを21番目の文字として数え、ごく小さい一様な擬似カウントを足している。「強い」組とは、配列上で6以上離れた組のうち上位2%を指し、メーターの線がその値である。</p>
    <p>ここでの<b>接触</b>は、Cβ原子間の距離が8 Å未満であることを指す（グリシンはCα）。配列上で6未満の組は除く。配列上で近い残基は、もともと接触しているからである。</p>
    <p><b>オレンジの糸</b>は、強いのに接触していない組である。たとえばE89とK119は値が高いが、16.7 Å離れている。このような組はよくあり、この規則ではCheYの強い組の多くが接触していない。線は決めごとなので、S104とK119のように、線を少し超えた組でも側鎖どうしは接触していることがある。ここで接触していない組が、ファミリーの別のタンパク質では接触していることもある。理由は第2章で扱う。</p>
    <p><b>レベル3。</b>確定するまでメーターは隠れているので、手がかりは行だけである。1組の行につき確定は1回で、外すと同じファミリーの別の行に替わる。正解になる組は、同じ規則で強く、1SHGで接触している組である。N35とK43には本物の電荷の入れ替わりが、V44とV53には大きさの入れ替わり（GとF、AとI、VとV）が見られる。</p>
    <p class="small">出典: Jumper et al. 2021, Supplementary Information, Algorithm 10。Pfam（Mistry et al. 2021）。CheYの結晶構造3CHY（Volz and Matsumura 1991）。SH3の結晶構造1SHG（Musacchio et al. 1992）。Morcos et al. 2011。</p>`),

  setup(run) {
    const f = theFamily(), w = uniformWeights(f.N).w;
    run.state.chey = family(f.msa, f.che, w, f.D, miMatrix(f.X, f.N, f.L, w));
    run.world.shadowSpan(110);
    run.own({ dispose: () => run.world.shadowSpan(80) });
  },

  stages: [first, three, newFamily],
};

// A family as the board needs it, with its own line for "strong": the top 2% of pairs at least 6 apart.
function family(msa, st, w, D, M) {
  const { L, col2res } = msa, all = [];
  const valid = (i, j) => col2res[i] >= 0 && col2res[j] >= 0;
  for (let i = 0; i < L; i += 1) for (let j = i + 6; j < L; j += 1) if (valid(i, j)) all.push(M[i * L + j]);
  all.sort((a, b) => b - a);
  const col = (num) => col2res.findIndex((r) => r >= 0 && st.nums[r] === num);
  return { msa, st, w, D, strong: all[Math.floor(all.length * 0.02)], col, name: (c) => `${st.seq[col2res[c]]}${st.nums[col2res[c]]}` };
}

function sh3Family() {
  const msa = loadSH3(), st = getStructure('sh3g'), w = uniformWeights(msa.N).w;
  return family(msa, st, w, columnDistances(msa, st), miMatrix(msa.X, msa.N, msa.L, w));
}

// One board: the tiles, the pair table they feed, and the real structure it speaks of.
function table(run, fam, residues, rows) {
  const { world, ui } = run, { msa, st } = fam, cols = residues.map(fam.col), n = cols.length;
  const board = run.scoped(new TileBoard(world, { X: msa.X, L: msa.L, rows, cols }));
  // On a short screen the tiles keep the room: the pair table and the model give way.
  const compact = world.stage.h < world.stage.w * 1.42 && world.stage.h <= world.stage.w * 1.6 && world.stage.w < 560;
  const quilt = run.scoped(new Quilt(world, n, { cell: compact ? 1.06 : 1.5, gap: 0.12 }));
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) quilt.set(i, j, i === j ? STOCK.mist : STOCK.white);
  quilt.commit();
  const base = (st === theFamily().che ? 0.74 : 1.02) * (compact ? 0.62 : 1);
  const model = run.scoped(new PaperProtein(world, st, { stock: () => STOCK.good, scale: base, center: [0, 14, 0], spin: 0.14, size: 1.1, triangles: false }));
  const threads = run.scoped(new Threads(world, 24, { width: 0.42 }));
  const links = [];
  const heads = cols.map((c) => ui.label(fam.name(c), 'col'));
  const pair = ui.label(tr('pair table', 'ペアの表'), 'col');
  const far = ui.label('', 'col');
  far.el.style.display = 'none';
  const t = { board, quilt, model, threads, links, heads, n, fam, cols, far };
  const frame = (seconds = 0.6) => {
    const s = world.stage, tall = s.h > s.w * 0.92, [w, h] = board.size();
    if (tall && compact) {
      board.origin = [0, -10];
      quilt.origin = [-15, 25];
      model.center.set(14, 9, 25);
      world.look({ target: [0, 0, -1.5], dist: world.fitDist(w + 1.5, h + 22, 0.1), polar: 0.1, az: 0 }, seconds);
    } else if (tall) {
      board.origin = [0, -21];
      quilt.origin = [-15, 25];
      model.center.set(16, 14, 25);
      world.look({ target: [0, 0, -3.5], dist: world.fitDist(w + 1.5, h + 46, 0.1), polar: 0.1, az: 0 }, seconds);
    } else {
      board.origin = [-22, 1];
      quilt.origin = [33, 15];
      model.scale = base * 0.86;
      model.center.set(33, 12, -9);
      world.look({ target: [-1, 0, 1], dist: world.fitDist(106, h + 8, 0.1), polar: 0.1, az: 0 }, seconds);
    }
    board.back.position.set(board.origin[0], 0.15, board.origin[1]);
    quilt.back.position.set(quilt.origin[0], 0.1, quilt.origin[1]);
    quilt.layout();
    board.place();
  };
  frame(0);
  run.onLayout = (t) => frame(t);
  run.tick(() => {
    ui.cellSize(Math.abs(world.project([board.x(1), 0.6, 0]).x - world.project([board.x(0), 0.6, 0]).x));
    cols.forEach((_, k) => heads[k].at(world.project([board.x(k) + board.dx[k], 0.6, board.top() - 2])));
    const c = quilt.center(0, 0);
    pair.at(world.project([quilt.origin[0], 0.2, c.z - 2.4]));
    threads.clear();
    for (const l of links) threads.add(l.p, l.q, l.color, l.width, model.group);
    if (t.last) far.at(world.project(model.world3(t.last.mid)));
  });
  return t;
}

// Writes one pair into the pair table, and onto the real structure if it is worth a thread.
function link(t, a, b, color, width = 0.5) {
  const { fam, cols, links, quilt, far } = t, { st, msa } = fam, ra = msa.col2res[cols[a]], rb = msa.col2res[cols[b]];
  if (!links.some((l) => l.a === a && l.b === b)) links.push({ a, b, p: st.cb[ra], q: st.cb[rb], color, width });
  quilt.set(a, b, color === BLUE ? STOCK.high : STOCK.poor);
  quilt.set(b, a, color === BLUE ? STOCK.high : STOCK.poor);
  quilt.commit();
  t.last = { mid: st.cb[ra].map((v, i) => (v + st.cb[rb][i]) / 2) };
  far.set(`${fmt(fam.D[cols[a] * msa.L + cols[b]], 1)} Å`);
  far.el.style.display = '';
}

const measure = (t, a, b) => {
  const { fam, cols } = t, { msa, w, D, strong } = fam, A = cols[a], B = cols[b];
  const mi = mutualInformation(msa.X, msa.N, msa.L, A, B, w);
  return { mi, d: D[A * msa.L + B], strong: mi >= strong, apart: Math.abs(msa.col2res[A] - msa.col2res[B]), flat: Math.min(entropy(msa.X, msa.N, msa.L, A, w), entropy(msa.X, msa.N, msa.L, B, w)) < 0.4 };
};

// Lets the player pair columns, by a drag or by two taps. pair(a, b) answers each pair, and returning true ends the play.
// keep is a column that stays picked up between pairs.
function play(run, t, pair, hint, keep = -1) {
  const { board, heads } = t, { world, sound } = run;
  let sel = -1, over = -1, justPicked = false, back = 0;
  const mark = () => heads.forEach((h, k) => { h.el.classList.toggle('a', k === sel); h.el.classList.toggle('on', k === over); });
  const under = (x, y) => { const k = board.columnAt(world.onPlane(x, y, 0.8)); return k < 0 ? null : k; };
  const pick = (k, quiet = false) => {
    if (sel >= 0 && sel !== k) board.lower(sel);
    sel = k; board.raise(k); board.sortBy(k);
    if (!quiet) { sound.rustle(4, 0.04); sound.pick(k); }
    mark();
  };
  const clear = () => { if (keep >= 0) { over = -1; board.settle(); pick(keep, true); return; } if (sel >= 0) board.lower(sel); sel = -1; over = -1; mark(); };
  if (keep >= 0) pick(keep, true);
  run.scoped({ dispose: () => clearTimeout(back) });
  return run.until((done) => {
    const answer = (a, b) => {
      board.raise(a);
      board.beside(a, b);
      board.sortBy(a, b);
      sel = -1; over = -1; mark();
      clearTimeout(back);
      back = setTimeout(() => { if (run.alive) { board.settle(); if (keep >= 0) pick(keep, true); } }, 1300);
      if (pair(a, b)) { off(); done(); }
    };
    const off = run.board({
      at: under,
      hover: (k) => {
        if (over >= 0 && over !== sel) board.liftTo[over] = 0;
        over = k === null || k === sel ? -1 : k;
        if (over >= 0) board.liftTo[over] = 0.7;
        mark();
      },
      grab: (k) => {
        clearTimeout(back);
        justPicked = false;
        if (sel === k) return;
        if (sel >= 0) return; // This may be the second of two taps. A drag from here is sorted out in move.
        board.settle();
        pick(k);
        justPicked = true;
      },
      move: (k, x, y, on) => {
        if (sel !== k) pick(k);
        const p = world.onPlane(x, y, 3);
        if (p) board.carry(k, p.x);
        const o = on === k ? -1 : on ?? -1;
        if (o !== over) { over = o; mark(); board.sortBy(k, o); if (o >= 0) sound.pick(o); }
      },
      drop: (k, x, y, on) => { if (on === null || on === k) clear(); else answer(k, on); },
      cancel: () => clear(),
      tap: (k) => {
        if (justPicked) return;
        if (sel === k) clear();
        else if (sel >= 0) answer(sel, k);
      },
    });
    if (hint) run.scoped(run.idle(hint));
  });
}

const point = (run, t, k, row = 5) => () => run.world.project([t.board.x(k), 1, t.board.rowZ(row)]);

function reading(run, fam, n) {
  const m = run.ui.meter({ label: tr(`mutual information, all ${n.toLocaleString('en')} sequences`, `相互情報量（全${n.toLocaleString('en')}配列）`), max: 0.65, mark: fam.strong });
  return (r) => { m.set(r.mi, fmt(r.mi), r.strong); run.sound.setOpening(r.mi / 0.6); };
}

// Says what a pair of columns did. Shared by all levels, so that the same pair always gets the same answer.
function say(run, t, a, b, r) {
  const { ui, sound } = run, { fam, cols } = t, na = fam.name(cols[a]), nb = fam.name(cols[b]);
  if (r.apart < 6) { ui.feedback(tr('Too near along the chain to count.', '配列上で近すぎて、数えない。')); sound.soft(); return 'near'; }
  if (r.strong && r.d < 8) { sound.fold(); sound.good(1); link(t, a, b, BLUE); ui.feedback(tr(`Strong, ${fmt(r.d, 1)} Å apart: they touch.`, `強い組で${fmt(r.d, 1)} Å。接触している。`), 'good'); return 'touch'; }
  if (r.strong) { sound.soft(); link(t, a, b, ORANGE, 0.34); ui.feedback(tr(`Strong, but ${fmt(r.d, 1)} Å apart: past the 8 Å line.`, `強いが${fmt(r.d, 1)} Åで、8 Åの線を超える。`), 'bad'); return 'far'; }
  sound.soft();
  // A pair tried and found weak stays marked in the table, so that the board remembers it.
  if (!t.links.some((l) => l.a === Math.min(a, b) && l.b === Math.max(a, b))) { t.quilt.set(a, b, WEAK); t.quilt.set(b, a, WEAK); t.quilt.commit(); }
  ui.feedback(r.flat ? tr('That column hardly changes, so it says little.', 'この列はほとんど変わらず、情報が少ない。') : tr('Weak: below the strong line.', '弱い。「強い」の線に届かない。'), 'bad');
  return 'weak';
}

async function first(run) {
  const { ui } = run, fam = run.state.chey, t = table(run, fam, CHEY.residues, CHEY.rows), meter = reading(run, fam, fam.msa.N);
  const a = CHEY.residues.indexOf(CHEY.given);
  run.level(GOALS[0], 0, 1);
  ui.tags('real', 'game', 'model');
  // The strongest partner in view is found, not named here.
  let best = -1, top = 0;
  t.cols.forEach((_, k) => { if (k === a) return; const r = measure(t, a, k); if (r.apart >= 6 && r.mi > top) { top = r.mi; best = k; } });
  run.probe = { column: (k) => run.world.project([t.board.x(k), 1, t.board.rowZ(5)]), n: t.n, level: 1, answers: () => [[a, best]], given: a };
  await play(run, t, (x, y) => {
    const r = measure(t, x, y);
    meter(r);
    if (x !== a && y !== a) { ui.feedback(tr('Use S56.', 'S56を使う。')); run.sound.soft(); return false; }
    say(run, t, x, y, r);
    if (x === best || y === best) { ui.count(1, 1); return true; }
    return false;
  }, () => ({ from: point(run, t, a), to: point(run, t, (a + 3) % t.n) }), a);
  ui.tags('real', 'game', 'model', 'paper');
  await run.won(tr('AF2 too reads every pair of columns, over many sequences.', 'AF2も多くの配列で、列の組をすべて読む。'), 1);
}

async function three(run) {
  const { ui } = run, fam = run.state.chey, t = table(run, fam, CHEY.residues, CHEY.rows), meter = reading(run, fam, fam.msa.N);
  const a = CHEY.residues.indexOf(56), b = CHEY.residues.indexOf(68), found = new Set();
  link(t, a, b, BLUE);
  t.far.el.style.display = 'none';
  run.level(GOALS[1], 0, 3);
  ui.tags('real', 'game', 'model');
  const answers = [];
  for (let i = 0; i < t.n; i += 1) for (let j = i + 1; j < t.n; j += 1) { const r = measure(t, i, j); if (r.strong && r.d < 8 && r.apart >= 6 && !(i === a && j === b)) answers.push([i, j]); }
  run.probe = { column: (k) => run.world.project([t.board.x(k), 1, t.board.rowZ(5)]), n: t.n, level: 2, answers: () => answers, given: -1 };
  await play(run, t, (x, y) => {
    const r = measure(t, x, y), key = `${Math.min(x, y)},${Math.max(x, y)}`;
    meter(r);
    if (Math.min(x, y) === a && Math.max(x, y) === b) { ui.feedback(tr('Already linked.', 'すでに組になっている。')); return false; }
    if (say(run, t, x, y, r) === 'touch') found.add(key);
    ui.count(found.size, 3);
    return found.size >= 3;
  }, () => ({ from: point(run, t, 2), to: point(run, t, 9) }));
  await run.won(tr('Orange pairs change together but sit past 8 Å. Chapter 2 asks why.', 'オレンジの組は連動するが8 Åより遠い。理由は第2章で扱う。'), 2);
}

async function newFamily(run) {
  const { ui } = run, fam = run.state.sh3 ??= sh3Family();
  let misses = 0, set = 0;
  const once = tr('one try', '1回だけ');
  run.level(GOALS[2], once);
  for (;;) {
    const t = table(run, fam, SH3.residues, SH3.rows[set % SH3.rows.length]), answers = [];
    for (let i = 0; i < t.n; i += 1) for (let j = i + 1; j < t.n; j += 1) { const r = measure(t, i, j); if (r.strong && r.d < 8 && r.apart >= 6) answers.push([i, j]); }
    ui.tags('real', 'model');
    const m = ui.meter({ label: tr(`mutual information, all ${fam.msa.N.toLocaleString('en')} sequences`, `相互情報量（全${fam.msa.N.toLocaleString('en')}配列）`), max: 0.65, mark: fam.strong });
    m.hidden = true;
    let solved = false;
    run.probe = { column: (k) => run.world.project([t.board.x(k), 1, t.board.rowZ(5)]), n: t.n, level: 3, answers: () => answers, given: -1 };
    await play(run, t, (x, y) => {
      const r = measure(t, x, y);
      m.hidden = false;
      m.set(r.mi, fmt(r.mi), r.strong);
      ui.tags('real', 'game', 'model');
      solved = say(run, t, x, y, r) === 'touch';
      return true;
    }, () => ({ from: point(run, t, 3), to: point(run, t, 9) }));
    if (solved) { await run.won(tr('A new family, the same signal.', '新しいファミリーでも、同じ信号が見える。'), 3); return; }
    misses += 1;
    await run.pause(1500);
    if (misses >= 2 && await giveUp(run, t, answers)) return;
    set += 1;
    run.closeScope();
    ui.feedback(tr('New rows.', '行が替わった。'));
  }
}

// Never locked: after two sets of rows the answer is on offer, without the crane.
function giveUp(run, t, answers) {
  const { ui } = run;
  return run.until((done) => {
    ui.ctrl(ui.button(tr('Show me', '答えを見る'), () => {
      ui.ctrl();
      const [a, b] = answers[0];
      t.board.settle(); t.board.sortBy(a, b); t.board.beside(a, b);
      link(t, a, b, BLUE);
      ui.feedback(tr(`${t.fam.name(t.cols[a])} and ${t.fam.name(t.cols[b])} touch. Their blocks line up.`, `${t.fam.name(t.cols[a])}と${t.fam.name(t.cols[b])}が接触している。かたまりがそろう。`), 'good');
      run.pause(2600).then(() => done(true), (e) => { if (!(e instanceof Abort)) throw e; });
    }, { quiet: true, id: 'show' }), ui.button(tr('Try again', 'もう一度'), () => { ui.ctrl(); done(false); }, { id: 'again' }));
  });
}

