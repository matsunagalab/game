// Chapter 3. Real attention on a real hidden letter, the outer product, then a live two-tower exchange on the real family.
import { Loom } from '../loom.js';
import { LETTERS, uniformWeights } from '../science/msa.js';
import { softmax } from '../science/ipa.js';
import { meanFieldDCA } from '../science/dca.js';
import { TwoTower } from '../science/twotower.js';
import { apc, canvasFont, chart, compressColumns, ContactQuilt, fmt, name, pct, theFamily } from './common.js';
import { tr } from '../i18n.js';

const TRAIN = 1700; // the last 300 sequences are held out and never shown to any model

export default {
  id: 'towers',
  title: tr('Two representations', '2つの表現'),
  tease: tr('Keep the sequences and the pairs in two tables, and let them talk.', '配列とペアを2つの表に持ち、互いにやりとりさせる。'),
  principle: tr('AlphaFold2 keeps one table about sequences and one about residue pairs. The sequences tell the pairs what varies together, and the pairs can tell each sequence where to look. DeepMind built the two to inform each other at every step, and removing part of that exchange cost a few points of accuracy, so it helps without being all or nothing.', 'AlphaFold2は、配列についての表と残基のペアについての表を持つ。配列はいっしょに変わるものをペアに伝え、ペアは各配列にどこを見るべきかを伝えられる。DeepMindはこの2つが各段階で情報を渡し合うように設計した。このやりとりの一部を取り除くと精度が数ポイント下がったので、役に立ってはいるが、なければ何もできないというものではない。'),
  goals: [tr('Run the exchange with both wires on.', '両方の配線をつないで、やりとりを実行する。'), tr('Cut each wire and see what fails.', '配線を1本ずつ切り、何ができなくなるかを見る。'), tr('Get the new case right first time, answer and reason.', '新しい例で、答えと理由の両方を1回で正解する。')],
  note: tr(`<h3>Chapter note</h3>
    <p><b>Real sizes in AlphaFold2.</b> The MSA representation is N<sub>seq</sub> × N<sub>res</sub> × 256, with 512 sequences at most in the main stack in fine-tuning and CASP settings. The pair representation is N<sub>res</sub> × N<sub>res</sub> × 128. The Evoformer repeats 48 blocks (Algorithm 6). Up to 5,120 more sequences go through a four-block extra MSA stack with 64 channels. Row and column attention use 8 heads, and triangle attention 4.</p>
    <p><b>This game's model.</b> A teaching model, but real arithmetic on real data. Here a block is one learning step on this family. In AlphaFold2 a block is one of 48 layers in a single forward pass. Each layer has its own weights, fixed after training. Its MSA table is (sequences, columns, 7) and its pair table is (columns, columns, 7, 7). Pair to MSA is a softmax over a sum of pair terms. MSA to pair is an outer product of each column's surprise with every other column's letters, averaged over sequences. This is gradient ascent on the pseudo-likelihood (Ekeberg et al. 2013). The Evoformer has two tables and two wires like these, but its wires are learned, not this formula.</p>
    <p><b>Loss shown.</b> The mean of −log p(true letter) on 300 sequences kept out of all the sums, including the choice of which six letters each column keeps. It falls to about 1.30 by block 12 and stops improving after about eight blocks, even while the loss on the training rows keeps falling. That gap is overfitting. Only the held-out number is shown.</p>
    <p><b>Outer product mean</b> is Algorithm 10. Fed one-hot letters with no learned weights, the average of the products is exactly the pair-frequency table f<sub>ij</sub>(a,b). In AF2 the inputs are learned vectors, and it runs in every block. <b>Row attention with pair bias</b> is Algorithm 7. The masked-letter task is the masked MSA loss of Supplement 1.9.9, with weight 2.0 in the total loss.</p>
    <p><b>The hidden letter.</b> The first sequence was chosen because its partner column helps, to show the idea. The fair test is the one over every column of all 300 kept-aside sequences. Column attention here scores 1,700 training sequences by how alike they are to the hidden one, leaving out the hidden column. Its large gain is mostly family resemblance, so it does not by itself find contacts. A tapped sequence is trusted at a fixed 90%. How sharp attention is, here the pair score times 6 and the likeness times 0.2, is set by hand in this game, where AlphaFold2 learns its own numbers.</p>
    <p><b>Percent right.</b> Each column here has seven classes: its six commonest letters, and one slot for all the rare ones. On that count the column alone gets 44% and likeness shares 59%. Counted over all 21 letters, they get 38% and 54%.</p>
    <p><b>Column attention</b> is Algorithm 8 and has no pair bias: position i of one sequence attends to position i of the others. <b>Block order</b> is Algorithm 6: row attention with pair bias, column attention, transition, outer product mean, multiplicative update outgoing then incoming, triangle attention starting node then ending node, transition. A transition is a two-layer network applied to each entry on its own.</p>
    <p><b>Masked MSA.</b> In training and inference, 15% of positions in the MSA cluster centres are masked. Of those, 70% become a special mask token, and the rest split evenly: 10% a random letter, 10% a letter drawn from the family's profile, and 10% left as they are (Supplement 1.2.7, config.py). The masked positions are what the network must predict in training. Removing that task cost about 11 lDDT-Cα at its worst, near N<sub>eff</sub> of 30 to 50, and almost nothing above about 500, read by eye from Supplementary Fig. 10. The authors say they intended it to encourage co-evolution-like reasoning, and report only that it raises accuracy.</p>
    <p><b>Real test of the idea.</b> DeepMind retrained AF2 with the raw MSA replaced by only first and second order statistics, the "no raw MSA" ablation. Reading Supplementary Fig. 10 by eye, lDDT-Cα fell by about 1 to 2 at most MSA depths, and the authors call the drop "not catastrophic". The ablation that removes the direct path from pair to MSA also removes triangles and costs about 1 to 3. They caution that hyperparameters were not retuned and that effects interact.</p>
    <p class="small">Sources: Jumper et al., Nature 2021, and Supplementary Methods 1.6, 1.9.9, 1.13. Ekeberg et al., Phys Rev E 2013.</p>`, `<h3>この章の注</h3>
    <p><b>AlphaFold2の実際の大きさ。</b>MSA表現はN<sub>seq</sub> × N<sub>res</sub> × 256で、メインのスタックの配列数は、ファインチューニングとCASPの設定で最大512である。ペア表現はN<sub>res</sub> × N<sub>res</sub> × 128である。Evoformerは48ブロックを繰り返す（Algorithm 6）。さらに最大5,120配列が、64チャネル、4ブロックのextra MSAスタックを通る。行と列のアテンションのヘッドは8つ、三角形のアテンションのヘッドは4つである。</p>
    <p><b>このゲームのモデル。</b>教材モデルだが、本物のデータでの本物の計算である。ここでのブロックは、このファミリーでの1回の学習ステップである。AlphaFold2のブロックは、1回の順伝播の中の48層の1つで、各層が固有の重みを持ち、重みは訓練のあと固定される。このモデルのMSAの表は（配列、列、7）、ペアの表は（列、列、7、7）である。ペアからMSAへの配線は、ペアの項の和に対するソフトマックスである。MSAからペアへの配線は、各列の「驚き」と他のすべての列の文字の外積を、配列について平均したものである。これは擬似尤度の勾配上昇である（Ekeberg et al. 2013）。Evoformerにも同じように2つの表と2本の配線があるが、配線は学習されたもので、この式ではない。</p>
    <p><b>表示している損失。</b>すべての和から除いた300配列での、−log p(本当の文字)の平均である。この300配列は、各列に残す6文字を選ぶときにも使っていない。損失はブロック12までに約1.30まで下がり、約8ブロックを過ぎると、訓練行の損失が下がり続けていても改善しなくなる。この差が過学習である。表示するのは取り置いた配列の値だけである。</p>
    <p><b>外積の平均</b>はAlgorithm 10である。学習した重みを使わずone-hotの文字を入れると、積の平均はちょうど文字の組の頻度の表f<sub>ij</sub>(a,b)になる。AF2では入力は学習されたベクトルで、すべてのブロックで実行される。<b>ペアのバイアスつきの行方向アテンション</b>はAlgorithm 7である。文字を隠す課題はSupplement 1.9.9のマスクMSA損失で、全損失の中での重みは2.0である。</p>
    <p><b>隠した文字。</b>最初の配列は、相手の列が役に立つものを、考え方を見せるために選んだ。公平な試験は、取り置いた300配列のすべての列で行うものである。ここでの列方向アテンションは、隠した列を除いて、1,700本の訓練配列を隠された配列との似ている度合いで採点する。大きな改善のほとんどはファミリーの類似によるので、それだけで接触が見つかるわけではない。タップした配列は90%に固定して信頼する。アテンションの鋭さ（ここではペアのスコアの6倍と似ている度合いの0.2倍）はこのゲームが手で決めている。AlphaFold2は自分の数値を学習する。</p>
    <p><b>正解率。</b>ここでの各列は7クラスで、最も多い6文字と、まれな文字すべてをまとめた1つの枠である。この数え方では、列だけで44%、似ている度合いで配分すると59%が正解する。21文字すべてで数えると38%と54%である。</p>
    <p><b>列方向アテンション</b>はAlgorithm 8で、ペアのバイアスはない。ある配列の位置iが、他の配列の位置iに耳を傾ける。<b>ブロックの順序</b>はAlgorithm 6である。ペアのバイアスつきの行方向アテンション、列方向アテンション、トランジション、外積の平均、乗算の更新（出ていく辺、入ってくる辺の順）、三角形のアテンション（始点、終点の順）、トランジションと続く。トランジションは、各要素に別々に適用する2層のネットワークである。</p>
    <p><b>マスクMSA。</b>訓練でも推論でも、MSAのクラスター中心の位置の15%をマスクする。そのうち70%は特別なマスク用トークンになり、残りは均等に分かれて、10%がランダムな文字、10%がファミリーのプロファイルから引いた文字、10%がそのままになる（Supplement 1.2.7、config.py）。マスクした位置が、ネットワークが訓練で予測しなければならない位置である。この課題を取り除くと、最も悪い場合でlDDT-Cαが約11下がり（N<sub>eff</sub>が30〜50付近）、約500以上ではほとんど下がらなかった（Supplementary Fig. 10から目で読んだ値）。著者らは共進化に似た推論を促す意図だったと述べ、報告しているのは精度が上がることだけである。</p>
    <p><b>考え方の実際の検証。</b>DeepMindは、生のMSAを1次と2次の統計量だけに置き換えてAF2を訓練し直した（「no raw MSA」アブレーション）。Supplementary Fig. 10を目で読むと、lDDT-CαはほとんどのMSAの深さで約1〜2下がり、著者らはこの低下を「致命的ではない（not catastrophic）」と呼んでいる。ペアからMSAへの直接の経路を取り除くアブレーションは三角形も同時に取り除き、低下は約1〜3である。著者らは、ハイパーパラメータを調整し直していないこと、効果が互いに影響し合うことに注意を促している。</p>
    <p class="small">出典: Jumper et al., Nature 2021、Supplementary Methods 1.6, 1.9.9, 1.13。Ekeberg et al., Phys Rev E 2013。</p>`),

  setup(run) {
    const f = run.state.f = theFamily();
    // The kept letters come from the training rows alone, so that the 300 rows kept aside have no say in anything.
    const c = compressColumns(f.X, f.N, f.L, 6, 21, TRAIN);
    run.state.Y = c.Y; run.state.qi = c.qi; run.state.kept = c.kept;
    const { world } = run;
    const loom = run.state.loom = run.own(new Loom(world, f.msa, { rows: 60 }));
    const q = run.state.q = run.own(new ContactQuilt(run, f, {}));
    run.onLayout = () => layout(run, loom, q);
    layout(run, loom, q);
    world.shadowSpan(130);
    run.own({ dispose: () => world.shadowSpan(80) });
  },
  stages: [meet, hidden, column, outer, wires, block, check],
};

function layout(run, loom, q) {
  const { world } = run, s = world.stage, tall = s.h > s.w * 0.9, { f } = run.state;
  if (tall) {
    loom.relocate(0, -46); q.quilt.origin = [0, 60];
    world.look({ target: [0, 0, 8], dist: world.fitDist(f.L + 6, 216, 0.1), polar: 0.1, az: 0 }, 0.7);
  } else {
    loom.relocate(-66, 0); q.quilt.origin = [66, 0];
    world.look({ target: [0, 0, 0], dist: world.fitDist(272, f.L + 24, 0.1), polar: 0.1, az: 0 }, 0.7);
  }
  q.quilt.back.position.set(q.quilt.origin[0], 0.1, q.quilt.origin[1]);
  q.quilt.layout();
}

async function meet(run) {
  const { ui } = run;
  ui.tags('real');
  await run.line(tr('A <b>neural network</b> is a long chain of arithmetic whose adjustable numbers, the <b>weights</b>, are nudged in <b>training</b> until its answers improve on known structures.', '<b>ニューラルネットワーク</b>は長い計算の連なりで、調整できる数である<b>重み</b>（weights）を、既知の構造に対する答えが良くなるまで<b>訓練</b>で少しずつ動かしていく。'));
  await run.line(tr('What it holds in mind at any step is a <b>representation</b>, a table of numbers, and AlphaFold2 keeps two: the loom, or <b>MSA representation</b>, with a row for each sequence, and the quilt, or <b>pair representation</b>, with a square for each pair of residues.', 'ネットワークが各段階で持っている数の表を<b>表現</b>（representation）と呼び、AlphaFold2は、配列ごとに1行を持つ織機、すなわち<b>MSA表現</b>と、残基の組ごとに1マスを持つキルト、すなわち<b>ペア表現</b>の2つを持つ。'));
  await run.line(tr('To see why it keeps both, try a job that one table cannot do alone.', 'なぜ両方を持つのかを見るために、1つの表だけではできない仕事を試す。'));
}

// The chance of each state at column i, given only that column in the training rows.
function profile(Y, L, i, q = 7) {
  const t = new Float64Array(q).fill(0.3);
  for (let s = 0; s < TRAIN; s += 1) t[Y[s * L + i]] += 1;
  const z = t.reduce((a, b) => a + b);
  return t.map((v) => v / z);
}
// The chance of each state at column i, given the letter at column j.
function conditional(Y, L, i, j, q = 7) {
  const t = new Float64Array(q * q).fill(0.3);
  for (let s = 0; s < TRAIN; s += 1) t[Y[s * L + j] * q + Y[s * L + i]] += 1;
  for (let b = 0; b < q; b += 1) { let z = 0; for (let a = 0; a < q; a += 1) z += t[b * q + a]; for (let a = 0; a < q; a += 1) t[b * q + a] /= z; }
  return t;
}

// A real hidden letter, shared by the row and column stages, so that a resumed chapter finds it too.
async function hiddenCase(run) {
  if (run.state.hiddenCase) return run.state.hiddenCase;
  const { f, Y, qi, kept } = run.state, L = f.L, N = f.N;
  // The coupling scores come from the sequences outside the held-out set.
  const w = uniformWeights(TRAIN).w;
  const scores = apc(await run.budget(meanFieldDCA(Y, TRAIN, L, qi, w, 0.5)), L);
  // A column pair with a strong real coupling, and a held-out sequence whose hidden letter is hard from the column alone.
  let at = 0, best = -1;
  for (let c = 0; c < L; c += 1) { for (let j = 0; j < L; j += 1) { if (Math.abs(c - j) >= 6 && scores[c * L + j] > best && qi[c] >= 7) { best = scores[c * L + j]; at = c; } } }
  const others = [];
  for (let j = 0; j < L; j += 1) if (j !== at) others.push(j);
  const ranked = others.slice().sort((a, b) => scores[at * L + b] - scores[at * L + a]);
  const stateName = (c, s) => (s < kept[c].length ? LETTERS[kept[c][s]] : tr('other', 'その他'));
  const prof = profile(Y, L, at), cond = new Map();
  const getCond = (j) => { if (!cond.has(j)) cond.set(j, conditional(Y, L, at, j)); return cond.get(j); };
  const held = [];
  for (let s = TRAIN; s < N && held.length < 3; s += 1) { const a = Y[s * L + at]; const c = getCond(ranked[0]); if (c[Y[s * L + ranked[0]] * 7 + a] > prof[a] * 1.5 && a < kept[at].length) held.push(s); }
  const row = held[0] ?? TRAIN, truth = Y[row * L + at];
  run.state.hiddenCase = { scores, at, ranked, row, truth, prof, stateName, getCond };
  return run.state.hiddenCase;
}

async function hidden(run) {
  const { ui, sound } = run, { f, Y, qi, kept, loom } = run.state, L = f.L, N = f.N;
  ui.tags('real', 'game', 'model');
  run.onLayout?.();
  const { scores, at, ranked, row, truth, prof, stateName, getCond } = await hiddenCase(run);
  const lossOf = (p) => -Math.log(p[truth]);
  const c = chart(ui, { height: 96 });
  const bars = (p) => c.draw(Array.from({ length: qi[at] }, (_, s) => ({ value: p[s], label: stateName(at, s), text: pct(p[s]), color: s === truth ? '#0053d6' : '#b8c9d4' })), { max: 1 });
  await run.line(tr(`Here is a job. One real sequence, from the 300 kept aside, has its letter at ${name(f, at)} hidden. Guess it.`, `仕事は次のとおりである。取り置いた300本のうちの本物の配列1本で、${name(f, at)}の文字を隠してある。その文字を当てる。`));
  ui.reads([{ value: fmt(lossOf(prof)), label: tr('loss', '損失') }]);
  ui.ctrl(c);
  bars(prof);
  await run.until((done) => {
    ui.say(tr('Using only that column, this is your best guess, and the true letter is the darker bar.', 'その列だけを使うと、これが最善の予想である。本当の文字は濃い棒である。'));
    ui.ctrl(c, ui.button(tr('Next', '次へ'), () => done(), { id: 'next' }));
    bars(prof);
  });
  ui.ctrl(c);
  bars(prof);
  await run.until((done) => { ui.say(tr('A <b>loss</b> is one number for how wrong a guess was, here minus the log of the chance you gave the truth, and training pushes it down.', '<b>損失</b>（loss）は予想の外れ具合を表す1つの数で、ここでは本当の文字に与えた確率の対数にマイナスをつけたものである。訓練はこれを下げていく。')); ui.ctrl(c, ui.button(tr('Next', '次へ'), () => done(), { id: 'next' })); bars(prof); });
  // Attention, by hand: tap positions to listen to them. The 100% is shared evenly among those you pick.
  const candidates = [ranked[0], ranked[1], ranked[Math.floor(L / 2)], ranked[L - 3]];
  const on = candidates.map(() => false);
  const mix = () => {
    const total = on.filter(Boolean).length, p = new Float64Array(7);
    if (!total) return prof;
    candidates.forEach((j, k) => { if (!on[k]) return; const t = getCond(j), b = Y[row * L + j]; for (let a = 0; a < 7; a += 1) p[a] += t[b * 7 + a] / total; });
    return p;
  };
  loom.mark(0, at);
  await run.until((done) => {
    ui.say(tr('<b>Attention</b> means sharing out 100% of your interest among other positions and mixing what they suggest, so tap positions to listen to them.', '<b>アテンション</b>（attention）とは、100%の関心を他の位置に配分し、それぞれの示す内容を混ぜることである。位置をタップして耳を傾ける。'));
    const nxt = ui.button(tr('Next', '次へ'), () => done(), { id: 'next' });
    nxt.disabled = true;
    const box = document.createElement('div');
    box.className = 'chips';
    candidates.forEach((j, k) => {
      const b = ui.button(`${name(f, j)}: ${stateName(j, Y[row * L + j])}`, () => {
        on[k] = !on[k];
        b.classList.toggle('on', on[k]);
        const p = mix(), c0 = on.filter(Boolean).length;
        loom.mark(1, on[k] ? j : -1);
        bars(p);
        ui.reads([{ value: fmt(lossOf(prof)), label: tr('loss, column alone', '損失（列だけ）') }, { value: c0 ? tr(`${Math.round(100 / c0)}% each`, `各${Math.round(100 / c0)}%`) : '0%', label: tr('your attention', 'アテンションの配分') }, { value: fmt(lossOf(p)), label: tr('loss, with attention', '損失（アテンションあり）') }]);
        if (lossOf(p) < lossOf(prof) - 0.2) nxt.disabled = false;
        sound.pick(k);
      }, { quiet: true, id: `listen-${k}` });
      box.append(b);
    });
    ui.ctrl(c, box, nxt);
    bars(prof);
  });
  for (const text of [tr('On this one sequence every position helped, and the best was a chain neighbour.', 'この1本の配列では、どの位置も役に立ち、最も役立ったのは鎖の上の隣の残基だった。'), tr('One case proves little, so test every letter.', '1つの例からはほとんど何も言えないので、すべての文字で試す。')]) await run.until((done) => { ui.say(text); ui.ctrl(c, ui.button(tr('Next', '次へ'), () => done(), { id: 'next' })); bars(mix()); });
  ui.ctrl();
  loom.mark(0, -1); loom.mark(1, -1);
  // The real test: every column of the held-out rows, three ways.
  ui.say(tr('Now score it properly: hide every letter of all 300 kept-aside sequences in turn.', 'きちんと採点する。取り置いた300配列のすべての文字を順に隠す。'));
  let l0 = 0, l1 = 0, l2 = 0, n = 0, h0 = 0, h1 = 0;
  const step = function* gen() {
    for (let i = 0; i < L; i += 1) {
      const pf = profile(Y, L, i), rest = [];
      for (let j = 0; j < L; j += 1) if (j !== i) rest.push(j);
      const wt = softmax(rest.map((j) => scores[i * L + j] * 6)), tables = rest.map((j) => conditional(Y, L, i, j));
      for (let s = TRAIN; s < N; s += 1) {
        const a = Y[s * L + i], p = new Float64Array(7), e = new Float64Array(7);
        rest.forEach((j, k) => { const t = tables[k], b = Y[s * L + j]; for (let x = 0; x < 7; x += 1) { p[x] += wt[k] * t[b * 7 + x]; e[x] += t[b * 7 + x] / rest.length; } });
        l0 -= Math.log(pf[a]); l1 -= Math.log(p[a]); l2 -= Math.log(e[a]); n += 1;
        let m0 = 0, m1 = 0;
        for (let x = 1; x < 7; x += 1) { if (pf[x] > pf[m0]) m0 = x; if (p[x] > p[m1]) m1 = x; }
        if (m0 === a) h0 += 1;
        if (m1 === a) h1 += 1;
      }
      yield i / L;
    }
  };
  await run.budget(step(), (v) => ui.reads([{ value: pct(v), label: tr('of the columns tested', '列の試験の進み具合') }]), 30);
  run.state.attn = { l0: l0 / n, l1: l1 / n, l2: l2 / n, h0: h0 / n, h1: h1 / n };
  ui.reads([{ value: fmt(l0 / n), label: tr(`loss, column alone (${pct(h0 / n)} right, counting rare letters as one)`, `損失（列だけ、正解率${pct(h0 / n)}、まれな文字は1つとして数える）`) }, { value: fmt(l2 / n), label: tr('loss, equal attention to all', '損失（すべてに均等なアテンション）') }, { value: fmt(l1 / n), label: tr(`loss, pair table sets it (${pct(h1 / n)} right)`, `損失（ペアの表が配分を決める、正解率${pct(h1 / n)}）`) }]);
  sound.fold();
  await run.line(tr('That is <b>pair to MSA</b>: the pair table tells each sequence where to look.', 'ペアの表が各配列にどこを見るべきかを伝えるのが、<b>ペアからMSAへ</b>の配線である。'));
  ui.reads([]);
  ui.tags('paper');
  await run.line(tr('In AlphaFold2 this is the pair bias on row-wise attention.', 'AlphaFold2では、これは行方向アテンションにかかるペアのバイアスである。'));
  await run.line(tr('AlphaFold2 plays this very game in training, hiding some letters and filling them in, and this <b>masked MSA</b> task was worth up to about 11 points of lDDT on shallow alignments, read by eye from a published plot.', 'AlphaFold2は訓練でまさにこの遊びをしていて、文字の一部を隠して埋めるこの<b>マスクMSA</b>（masked MSA）の課題は、浅いアラインメントで最大約11ポイントのlDDTに相当した（公開された図から目で読んだ値）。'));
}

// Column attention, on the same hidden letter: one position listens to the same position in other sequences.
async function column(run) {
  const { ui, sound } = run, { f, Y, qi, loom } = run.state, L = f.L, N = f.N;
  const { at, row, truth, prof, stateName } = await hiddenCase(run);
  ui.tags('real', 'game', 'model');
  ui.reads([]);
  await run.line(tr('That was <b>row-wise attention</b>: inside one sequence, a residue listens to other residues.', 'これが<b>行方向のアテンション</b>で、1本の配列の中で、ある残基が他の残基に耳を傾ける。'));
  await run.line(tr('The MSA table has a second kind, <b>column-wise attention</b>. One position listens to the same position in other sequences.', 'MSAの表にはもう1種類、<b>列方向のアテンション</b>がある。ある位置が、他の配列の同じ位置に耳を傾ける。'));
  loom.mark(0, at);
  // How alike each training sequence is to the hidden one, leaving out the hidden column itself.
  const alike = new Int32Array(TRAIN);
  for (let t = 0; t < TRAIN; t += 1) { let k = 0; for (let c = 0; c < L; c += 1) if (c !== at && Y[row * L + c] === Y[t * L + c]) k += 1; alike[t] = k; }
  const order = [...alike.keys()].sort((a, b) => alike[b] - alike[a]);
  const picks = [order[0], order[Math.floor(TRAIN / 2)], order[TRAIN - 1]];
  const on = picks.map(() => false);
  const c = chart(ui, { height: 92 });
  const lossOf = (p) => -Math.log(p[truth]);
  const mix = () => {
    const n = on.filter(Boolean).length;
    if (!n) return prof;
    const p = new Float64Array(7).fill(0.1 / 7);
    picks.forEach((t, k) => { if (on[k]) p[Y[t * L + at]] += 0.9 / n; });
    return p;
  };
  const bars = (p) => c.draw(Array.from({ length: qi[at] }, (_, s) => ({ value: p[s], label: stateName(at, s), text: pct(p[s]), color: s === truth ? '#0053d6' : '#b8c9d4' })), { max: 1 });
  await run.until((done) => {
    ui.say(tr('Same hidden letter: tap other sequences to listen to their letter at this position.', '隠す文字は同じである。他の配列をタップして、この位置の文字に耳を傾ける。'));
    const nxt = ui.button(tr('Next', '次へ'), () => done(), { id: 'next' });
    nxt.disabled = true;
    const box = document.createElement('div');
    box.className = 'chips';
    box.style.gridTemplateColumns = '1fr';
    const kind = [tr('Closest relative', '最も近い親戚'), tr('Middling relative', '中くらいの親戚'), tr('Most distant', '最も遠い親戚')];
    picks.forEach((t, k) => {
      const b = ui.button(tr(`${kind[k]}, ${Math.round((alike[t] / (L - 1)) * 100)}% alike: ${stateName(at, Y[t * L + at])}`, `${kind[k]}、${Math.round((alike[t] / (L - 1)) * 100)}%一致: ${stateName(at, Y[t * L + at])}`), () => {
        on[k] = !on[k];
        b.classList.toggle('on', on[k]);
        const p = mix();
        bars(p);
        ui.reads([{ value: fmt(lossOf(prof)), label: tr('loss, column alone', '損失（列だけ）') }, { value: fmt(lossOf(p)), label: tr('loss, with these sequences', '損失（これらの配列を使う）') }]);
        if (on.some(Boolean)) nxt.disabled = false;
        sound.pick(k);
      }, { quiet: true, id: `seq-${k}` });
      box.append(b);
    });
    ui.ctrl(c, box, nxt);
    bars(prof);
  });
  ui.ctrl();
  loom.mark(0, -1);
  ui.say(tr('Now hide every letter of the 300 kept-aside sequences again, and let likeness set the shares.', 'もう一度、取り置いた300配列のすべての文字を隠し、似ている度合いで配分を決める。'));
  const beta = 0.2;
  let l0 = 0, l1 = 0, n = 0, h0 = 0, h1 = 0;
  const profiles = Array.from({ length: L }, (_, i) => profile(Y, L, i));
  const slices = function* gen() {
    for (let s = TRAIN; s < N; s += 1) {
      const id = new Float64Array(TRAIN);
      let top = 0;
      for (let t = 0; t < TRAIN; t += 1) { let k = 0; for (let i = 0; i < L; i += 1) if (Y[s * L + i] === Y[t * L + i]) k += 1; id[t] = k; if (k > top) top = k; }
      const w = id.map((v) => Math.exp(beta * (v - top)));
      for (let i = 0; i < L; i += 1) {
        const a = Y[s * L + i], P = new Float64Array(7), pf = profiles[i];
        for (let t = 0; t < TRAIN; t += 1) P[Y[t * L + i]] += w[t];
        P[a] *= Math.exp(-beta); // the hidden column itself must not count towards likeness
        let z = 0;
        for (let x = 0; x < 7; x += 1) { P[x] += 1e-3 * (pf[x] + 1e-3); z += P[x]; }
        l0 -= Math.log(pf[a]); l1 -= Math.log(P[a] / z); n += 1;
        let m0 = 0, m1 = 0;
        for (let x = 1; x < 7; x += 1) { if (pf[x] > pf[m0]) m0 = x; if (P[x] > P[m1]) m1 = x; }
        if (m0 === a) h0 += 1;
        if (m1 === a) h1 += 1;
      }
      yield (s - TRAIN) / (N - TRAIN);
    }
  };
  await run.budget(slices(), (v) => ui.reads([{ value: pct(v), label: tr('of the sequences tested', '配列の試験の進み具合') }]), 30);
  run.state.columnAttn = { l0: l0 / n, l1: l1 / n, h0: h0 / n, h1: h1 / n };
  ui.reads([{ value: fmt(l0 / n), label: tr(`loss, column alone (${pct(h0 / n)} right, counting rare letters as one)`, `損失（列だけ、正解率${pct(h0 / n)}、まれな文字は1つとして数える）`) }, { value: fmt(l1 / n), label: tr(`loss, likeness sets the shares (${pct(h1 / n)} right)`, `損失（似ている度合いが配分を決める、正解率${pct(h1 / n)}）`) }]);
  sound.fold();
  await run.line(tr('That helps a lot, because close relatives share letters. This vote rests on the same family resemblance that made false links in chapter 2, so by itself it says nothing about contacts.', '近い親戚は文字を共有しているので、これは大きく役立つ。この投票は第2章で偽の結びつきを生んだファミリーの類似に基づいているので、それだけでは接触について何も言えない。'));
  await run.line(tr('Row attention lets a residue use the rest of its own sequence. Column attention lets it use other sequences at the same place.', '行方向のアテンションでは、残基は自分の配列の残りを使える。列方向のアテンションでは、他の配列の同じ場所を使える。'));
  ui.reads([]);
}

// One Evoformer block, in order.
const STEPS = [
  [tr('Row attention', '行方向アテンション'), tr('along each sequence, biased by the pair table', '各配列に沿って、ペアの表のバイアスつき')],
  [tr('Column attention', '列方向アテンション'), tr('the same position across sequences', '配列をまたいで同じ位置')],
  [tr('Transition', 'トランジション'), tr('a small network tidies each MSA entry', '小さなネットワークがMSAの要素を整える')],
  [tr('Outer product mean', '外積の平均'), tr('news from the MSA table to the pair table', 'MSAの表からペアの表へ情報を送る')],
  [tr('Triangle multiplication', '三角形の乗算の更新'), tr('chapter 4, outgoing then incoming', '第4章、出ていく辺、入ってくる辺の順')],
  [tr('Triangle attention', '三角形のアテンション'), tr('chapter 4, starting then ending node', '第4章、始点、終点の順')],
  [tr('Transition', 'トランジション'), tr('a small network tidies each pair entry', '小さなネットワークがペアの要素を整える')],
];

async function block(run) {
  const { ui, sound } = run;
  ui.reads([]);
  ui.tags('paper');
  await run.line(tr('You have now met the parts of one <b>Evoformer block</b>, the building unit of AlphaFold2.', 'これでAlphaFold2の基本単位である<b>Evoformerブロック</b>1つの部品がそろった。'));
  const list = document.createElement('ol');
  list.className = 'steps';
  list.innerHTML = STEPS.map(([name, what]) => tr(`<li><b>${name}</b>: ${what}</li>`, `<li><b>${name}</b>：${what}</li>`)).join('');
  ui.say(tr('One block runs these seven steps in order.', '1つのブロックは、この7つの段階を順に実行する。'));
  sound.pick(3);
  await run.until((done) => { ui.ctrl(list, ui.button(tr('Next', '次へ'), () => done(), { id: 'next' })); });
  ui.ctrl();
  await run.line(tr('AlphaFold2 stacks 48 of these blocks, each with its own weights, so news goes back and forth between the two tables many times.', 'AlphaFold2はそれぞれ固有の重みを持つこのブロックを48個積み重ねるので、2つの表の間を情報が何度も行き来する。'));
}

async function outer(run) {
  const { ui, sound } = run, { f } = run.state, { X, L, N } = f;
  ui.tags('real', 'game');
  run.onLayout?.();
  await run.line(tr('Now the other wire, from sequences to pairs. Take two columns. For one sequence, mark the one square of a small table where their letters meet. That is an <b>outer product</b>.', '次はもう1本の配線、配列からペアへである。2つの列を取る。1本の配列について、小さな表の中で2つの文字が交わる1マスに印をつける。これが<b>外積</b>（outer product）である。'));
  const col = (num) => f.colOf.find((c) => f.che.nums[f.col2res[c]] === num);
  const a = col(56), b = col(68);
  const top = (c) => { const t = new Int32Array(21); for (let s = 0; s < N; s += 1) t[X[s * L + c]] += 1; return [...t.keys()].sort((x, y) => t[y] - t[x]).slice(0, 5); };
  const ta = top(a), tb = top(b);
  const box = document.createElement('canvas');
  box.className = 'chart';
  box.style.height = '150px';
  const paint = (count) => {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = box.clientWidth || 300, h = 150;
    box.width = w * dpr; box.height = h * dpr;
    const g = box.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = new Float64Array(25);
    for (let s = 0; s < count; s += 1) {
      const i = ta.indexOf(X[s * L + a]), j = tb.indexOf(X[s * L + b]);
      if (i >= 0 && j >= 0) t[i * 5 + j] += 1 / count;
    }
    const m = Math.max(...t, 0.001), size = 25, x0 = (w - size * 5) / 2, y0 = 18;
    g.font = canvasFont(13); g.textAlign = 'center'; g.fillStyle = '#26343f';
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle = '#26343f';
      g.fillText(LETTERS[tb[i]], x0 + (i + 0.5) * size, 12);
      g.fillText(LETTERS[ta[i]], x0 - 10, y0 + (i + 0.7) * size);
      for (let j = 0; j < 5; j += 1) {
        const v = t[i * 5 + j] / m;
        g.fillStyle = `rgba(0, 83, 214, ${0.06 + 0.94 * v})`;
        g.fillRect(x0 + j * size + 1, y0 + i * size + 1, size - 2, size - 2);
      }
    }
    g.textAlign = 'left'; g.fillStyle = '#5a6b78';
    g.fillText(tr(`${name(f, a)} down`, `縦: ${name(f, a)}`), x0 + size * 5 + 12, 30);
    g.fillText(tr(`${name(f, b)} across`, `横: ${name(f, b)}`), x0 + size * 5 + 12, 48);
  };
  ui.reads([]);
  ui.say(tr('Drag to average over more and more real sequences.', 'スライダーを動かし、本物の配列をどんどん増やして平均する。'));
  await run.until((done) => {
    const nxt = ui.button(tr('Next', '次へ'), () => done(), { id: 'next' });
    nxt.disabled = true;
    const s = ui.slider({ label: tr('Sequences', '配列数'), min: 1, max: N, step: 1, value: 1, format: (v) => v.toLocaleString('en'), onInput: (v) => { paint(v); sound.pick(Math.floor(v / 300)); if (v > N / 2) nxt.disabled = false; } });
    ui.ctrl(box, s, nxt);
    paint(1);
  });
  ui.ctrl();
  await run.line(tr('The average of those outer products is the table of letter pairs behind chapter 1. This operation is the <b>outer product mean</b>, and it is how AlphaFold2 sends news from sequences to pairs.', 'この外積の平均が、第1章の裏にある文字の組の表である。この操作が<b>外積の平均</b>で、AlphaFold2が配列からペアへ情報を送るしくみである。'));
  ui.tags('paper');
  await run.line(tr('AlphaFold2 feeds it learned numbers, not plain letters, and it runs in every one of its blocks. It never computes mutual information or DCA as such.', 'AlphaFold2はここに文字そのものではなく学習された数値を入れ、すべてのブロックでこれを実行する。相互情報量やDCAそのものを計算することはない。'));
}

async function wires(run) {
  const { ui, sound } = run, { f, Y, qi } = run.state, { L, N } = f;
  const q = run.state.q;
  run.onLayout?.();
  ui.tags('model', 'real', 'game');
  const heldRows = Int32Array.from({ length: N - TRAIN }, (_, k) => TRAIN + k);
  await run.line(tr('Now connect both wires and let them run, on the real family. One block sends news both ways once.', '両方の配線をつなぎ、本物のファミリーで動かす。1ブロックで情報が両方向に1回ずつ流れる。'));
  await run.line(tr('This is not AlphaFold2. It has two tables and two wires like AlphaFold2, but here a block is one learning step on this family, and each wire is one written formula.', 'これはAlphaFold2ではない。AlphaFold2と同じく2つの表と2本の配線を持つが、ここでのブロックはこのファミリーでの1回の学習ステップで、各配線は書き下した1つの式である。'));
  const results = {};
  const c = chart(ui, { height: 62 });
  const drawResults = () => c.draw(['both', 'noPair', 'noMsa'].map((k) => ({ value: results[k]?.half ?? 0, text: results[k] ? pct(results[k].half) : '', label: k === 'both' ? tr('both wires', '両方の配線') : k === 'noPair' ? tr('pair to MSA cut', 'ペア→MSA切断') : tr('MSA to pair cut', 'MSA→ペア切断'), color: k === 'both' ? '#0053d6' : '#65cbf3' })));
  const perform = async (key, msaToPair, pairToMsa) => {
    const T = new TwoTower(Y, TRAIN, L, qi, { batch: 400, rate: 0.5, decay: 0.012, seed: 977 });
    T.wires = { msaToPair, pairToMsa };
    const start = await run.budget(T.heldOutSlices(heldRows));
    let held = start, half = 0, ok = true;
    for (let b = 1; b <= 12 && run.alive; b += 1) {
      await run.budget(T.stepSlices());
      held = await run.budget(T.heldOutSlices(heldRows));
      const S = T.scores();
      ok = S.some((v) => v > 0);
      const sc = ok ? f.score(apc(S, L)) : { pairs: [], half: 0 };
      half = sc.half;
      q.guesses(sc.pairs, f.mapped >> 1);
      ui.reads([{ value: `${b}/12`, label: tr('block', 'ブロック') }, { value: fmt(held, 3), label: tr('loss, kept-aside rows', '損失（取り置いた行）') }, { value: pct(half), label: tr('top pairs right', '上位の組の正解率') }]);
      sound.setOpening((start - held) / 0.25);
      if (b % 2 === 0) sound.phrase(3);
    }
    results[key] = { held, half, start };
    drawResults();
    sound.fold();
  };
  const choice = (label, key, a, b, id) => ui.button(label, async (el) => {
    const all = [...ui.ctrl$.querySelectorAll('button')];
    all.forEach((x) => { x.disabled = true; });
    ui.say(key === 'both' ? tr('Both wires on.', '両方の配線をつないだ。') : key === 'noPair' ? tr('The pair table can no longer reach the sequences.', 'ペアの表は配列に届かなくなった。') : tr('The sequences can no longer reach the pair table.', '配列はペアの表に届かなくなった。'));
    await perform(key, a, b);
    all.forEach((x) => { x.disabled = false; });
    if (results.both) run.reach(1);
    if (results.both && results.noPair && results.noMsa) { run.reach(2); nxt.disabled = false; }
    el.textContent = label;
    ui.say(explain(key));
  }, { quiet: key !== 'both', id });
  const explain = (key) => {
    const r = results[key];
    if (key === 'both') return tr(`The loss fell from ${fmt(r.start)} to ${fmt(r.held)}, and pairs improved as each table fed the other. Now cut a wire.`, `損失は${fmt(r.start)}から${fmt(r.held)}に下がり、2つの表が互いに情報を渡すにつれてペアも良くなった。次は配線を切る。`);
    if (key === 'noPair') return tr(`The table still fills with plain correlations and finds some contacts, but nothing reads it, so the loss stays near ${fmt(r.held)}.`, `表は単純な相関で埋まり、接触もいくつか見つかるが、それを読むものがないので、損失は${fmt(r.held)}付近にとどまる。`);
    return tr('With this wire cut the table stays empty, which simply follows from the wiring.', 'この配線を切ると表は空のままである。これは配線のしかたから当然そうなる。');
  };
  const nxt = ui.button(tr('Next', '次へ'), () => run.state.go?.(), { id: 'next' });
  nxt.disabled = true;
  ui.say(tr('Run it, on the real family.', '本物のファミリーで実行する。'));
  ui.tags('model', 'real', 'game');
  await run.until((done) => {
    run.state.go = done;
    ui.ctrl(c, choice(tr('Both wires', '両方の配線'), 'both', true, true, 'w-both'), choice(tr('Cut pair to MSA', 'ペア→MSAを切る'), 'noPair', true, false, 'w-nopair'), choice(tr('Cut MSA to pair', 'MSA→ペアを切る'), 'noMsa', false, true, 'w-nomsa'), nxt);
    drawResults();
  });
  ui.ctrl();
  sound.setOpening(0.6);
  ui.reads([]);
  await run.line(tr('Sequences hold the raw evidence, and pairs hold a summary of who relates to whom. In this small model the loop needs both wires, and that follows from how it is wired.', '配列は生の証拠を持ち、ペアは何が何と関係するかの要約を持つ。この小さなモデルのループに両方の配線が必要なのは、配線のしかたからくる結果である。'));
  ui.tags('paper');
  await run.line(tr('AlphaFold2 uses the same two-way plan. There, taking away the direct path from pairs to sequences, together with the triangles, costs a few points of accuracy.', 'AlphaFold2も同じ双方向の設計を使っている。そこでは、ペアから配列への直接の経路を三角形といっしょに取り除くと、精度が数ポイント下がる。'));
  q.guesses([], 0);
}

async function check(run) {
  const { ui } = run;
  ui.tags('model');
  const first = await run.choose(tr('A new case. A classmate says: "Throw away the sequences. Keep one table of pair frequencies, computed once, and feed only that to the network." What is lost?', '新しい例である。同級生が言う。「配列は捨てて、1回計算したペアの頻度の表だけをネットワークに入れればいい。」何が失われるか。'), [
    { text: tr('Nothing. The pair table already holds everything.', '何も失われない。ペアの表にすべて入っている。'), right: false, why: tr('A table of frequencies is a summary, so it drops what each sequence says. When DeepMind tried this, accuracy fell a little.', '頻度の表は要約なので、各配列が語る内容は落ちる。DeepMindがこれを試すと、精度は少し下がった。') },
    { text: tr('What each single sequence says, so the network cannot keep re-reading it.', '1本1本の配列が語る内容が失われ、ネットワークが読み直し続けられなくなる。'), right: true, why: tr('Right. When DeepMind tried this, accuracy fell a little, about 1 to 2 points. One likely reason is that a summary made once cannot ask new questions of the sequences. DeepMind measured the drop, not the reason.', '正解。DeepMindが試すと、精度は少し、約1〜2ポイント下がった。理由の1つと考えられるのは、1回つくった要約では配列に新しい問いを投げかけられないことである。DeepMindが測ったのは低下で、理由ではない。') },
    { text: tr('Only the speed of the network.', 'ネットワークの速さだけが変わる。'), right: false, why: tr('A table of frequencies is faster, not slower. The cost is in accuracy.', '頻度の表のほうが速い。失うのは精度である。') },
  ]);
  const second = await run.choose(tr('Attention in one sentence. Which is right?', 'アテンションを1文で言うと、どれが正しいか。'), [
    { text: tr('A fixed link between two residues, set by evolution.', '進化で決まった、2つの残基の間の固定された結びつき。'), right: false, why: tr('Attention weights are computed afresh for each sequence and each step, not fixed.', 'アテンションの重みは配列ごと、段階ごとに計算し直すもので、固定されていない。') },
    { text: tr('A share of 100% given to each other position, used to mix what they say.', '100%を他の各位置に配分し、それぞれの内容を混ぜるために使うもの。'), right: true, why: tr('Yes. A formula called a softmax turns scores into shares that add up to 1, and the result is a weighted average.', '正解。ソフトマックスという式がスコアを合計1の配分に変え、結果は重みつき平均になる。') },
    { text: tr('A score for how conserved a position is.', 'ある位置がどれだけ保存されているかのスコア。'), right: false, why: tr('Conservation is about one column. Attention is about who listens to whom.', '保存は1つの列の性質である。アテンションは、誰が誰に耳を傾けるかの話である。') },
  ]);
  if (first && second) run.reach(3);
}
