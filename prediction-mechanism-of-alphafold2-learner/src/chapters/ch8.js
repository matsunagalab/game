// Chapter 8. This game's whole small pipeline, run live, with its output fed back in as input.
import * as THREE from 'three';
import { Flock, ribbonGeometry, STOCK } from '../world.js';
import { uniformWeights } from '../science/msa.js';
import { meanFieldDCA } from '../science/dca.js';
import { lddt, rmsd, superpose } from '../science/metrics.js';
import { Pipeline } from '../science/pipeline.js';
import { ambient, apc, chart, compressColumns, fmt, frameBoard, getModel, pct, theFamily } from './common.js';
import { tr } from '../i18n.js';

const LIFT = 22;
const PASSES = 4;

export default {
  id: 'recycle',
  title: tr('Recycling', 'リサイクリング'),
  tease: tr('Hand the answer back as a question, and see what a second reading is worth.', '答えを問いとして返し、2度目の読みにどれだけの価値があるかを見る。'),
  principle: tr('One pass through the network can only reach so far. Recycling feeds the output back in as input, so the same network reads a fresh sample of the sequences with a draft in hand. It adds depth for almost no extra weights, and how many passes help depends on the protein.', 'ネットワークを1回通すだけでは届く範囲に限りがある。リサイクリングは出力を入力に戻すので、同じネットワークが下書きを手に、新しく抽出した配列を読む。重みをほとんど増やさずに深さが増し、何回のパスが役立つかはタンパク質によって違う。'),
  goals: [tr('Fold CheY with your own pipeline.', '自分のパイプラインでCheYを折りたたむ。'), tr('Recycle it, and run both controls.', 'リサイクルし、2つの対照を実行する。'), tr('Get the new case right first time, answer and reason.', '新しい例で、答えと理由の両方を1回で正解する。')],
  note: tr(`<h3>Chapter note</h3>
    <p><b>In AlphaFold2.</b> The whole network runs N<sub>cycle</sub> = 4 times by default, that is, 3 recycles, with shared weights (Algorithm 30; num_recycle = 3 in config.py). Three things return: the pair representation, the first row of the MSA representation, and the predicted Cβ distances, binned into 15 bins, 3 3/8 to 21 3/8 Å in the Supplement and 3.25 to 20.75 Å in config.py (Algorithm 32). Each pass also draws a new sample of the MSA. Only the last pass carries gradients, which keeps training cheap.</p>
    <p><b>How much it helps.</b> The paper says recycling "contributes markedly to accuracy". Removing it lowered lDDT-Cα at all MSA depths, by about 1 to 4, most near N<sub>eff</sub> of 30, read by eye from Supplementary Fig. 10. Of the double ablation of IPA and recycling, the authors say it is "not clear which missing features of recycling" explain the large drop: embedding the intermediate structures, the deeper network, intermediate losses, or weight tying. Independently, with ColabFold, 12 recycles on CASP14 raised mean TM-score to 0.898 from about 0.887, mostly on targets with little MSA information (Mirdita et al. 2022). In another study, removing only the recycled coordinates left the score at 0.84 ± 0.15 with full MSAs (Gut and Lemmin 2025), so the recycled embeddings may matter more than the coordinates. We found no independent curve of accuracy against recycle count with open per-count numbers. How much depth a protein needs varies: in Fig. 4b one CASP target settles early, and another changes until nearly the full depth.</p>
    <p><b>The binned draft.</b> Bins follow the AlphaFold2 code: each runs from one edge up to the next, the last is open ended, and a distance under 3.25 Å falls in no bin, so it stays blank here (modules.py).</p>
    <p><b>This game's pipeline is not AlphaFold2.</b> It has these real parts: mean-field DCA with APC on 2,000 real sequences, bound smoothing, classical multidimensional scaling, then gradient descent on frames in the two possible hands. One part comes from the crystal: the local shape, within four residues along the chain, stands in for what a network learns about local structure. The hand with the lower restraint energy is kept, and that energy includes this local shape, so the crystal sets the hand here. Without it the two hands tie.</p>
    <p><b>Recycling here.</b> Each new pass keeps pairs from the top 2L candidates that sit within 11 Å in the draft, and starts its embedding from the draft's distances. Over nine runs, all sequences plus eight random samples of 1,600, median RMSD went 3.95, 3.45, 3.53, 3.46 Å and median lDDT went 0.648, 0.668, 0.655, 0.646. Pass 2 raised lDDT in all nine of these runs and in ten of another twelve, so how sure the gain is depends on the sample, and passes 3 and 4 did not help. A control: using only the top 54 pairs, with no draft at all, gives a median of 3.28 Å and lDDT 0.678, as good as pass 2 or better in six of the nine runs. So the gain comes from which pairs are used. On all sequences, pass 1 has 109 pairs, 46 of them 8 Å or more apart, 19 at 12 Å or more and 10 at 15 Å or more, and pass 2 has 174, 79, 21 and 6. Across the nine runs the share of real contacts fell in every run, with a median of 59% at pass 1 and 55% at pass 2, while the median count of pairs at 15 Å or more fell from 10 to 6. Testing each cause alone across the nine runs: pass 2's chosen pairs with no draft distances gave a median of 3.16 Å and lDDT 0.681, better than pass 1 in all nine, and pass 1's pairs with the draft's distances gave 4.08 Å and 0.629, better in one of nine. So the draft's distances alone do not help. The way AlphaFold2 gains may be quite different.</p>
    <p><b>CASP14.</b> 0.96 Å and 2.8 Å are median backbone r.m.s.d.95, Cα at 95% residue coverage, on CASP domains (Jumper et al. 2021).</p>
    <p class="small">Sources: Jumper et al., Nature 2021, Supplement 1.10, 1.13. Mirdita et al., Nat Methods 2022. Gut and Lemmin, Bioinform Adv 2025.</p>`, `<h3>この章の注</h3>
    <p><b>AlphaFold2では。</b>ネットワーク全体を既定でN<sub>cycle</sub> = 4回、つまり3回のリサイクルで、重みを共有して実行する（Algorithm 30、config.pyのnum_recycle = 3）。戻すものは3つで、ペア表現、MSA表現の最初の行、15個のビンに分けた予測Cβ距離である。ビンの範囲はSupplementでは3 3/8〜21 3/8 Å、config.pyでは3.25〜20.75 Åである（Algorithm 32）。各パスではMSAの標本も新しく取り直す。勾配が流れるのは最後のパスだけで、これで訓練の計算が軽くなる。</p>
    <p><b>どれだけ役立つか。</b>論文はリサイクリングが「精度に顕著に寄与する（contributes markedly to accuracy）」と述べている。取り除くとすべてのMSAの深さでlDDT-Cαが約1〜4下がり、N<sub>eff</sub>が30付近で最も大きかった（Supplementary Fig. 10から目で読んだ値）。IPAとリサイクリングを同時に取り除いたときの大きな低下について、著者らは「リサイクリングのどの要素が欠けたためか明らかではない（not clear which missing features of recycling）」と述べている。候補は、中間構造の埋め込み、より深いネットワーク、中間の損失、重みの共有である。別に、ColabFoldでは12回のリサイクルによりCASP14の平均TMスコアが約0.887から0.898に上がり、その多くはMSAの情報が少ないターゲットでの改善だった（Mirdita et al. 2022）。別の研究では、リサイクルする座標だけを取り除いても、完全なMSAではスコアは0.84 ± 0.15のままだった（Gut and Lemmin 2025）。座標より、リサイクルされる埋め込みのほうが重要なのかもしれない。リサイクル回数と精度の関係を回数ごとの数値つきで公開した独立の曲線は見つからなかった。タンパク質に必要な深さはさまざまで、Fig. 4bでは、あるCASPターゲットは早く落ち着き、別のものはほぼ最後の深さまで変わり続ける。</p>
    <p><b>ビンに分けた下書き。</b>ビンはAlphaFold2のコードに従う。各ビンはある端から次の端までで、最後のビンは上限がなく、3.25 Å未満の距離はどのビンにも入らないので、ここでは空白のままである（modules.py）。</p>
    <p><b>このゲームのパイプラインはAlphaFold2ではない。</b>本物の部分は次のとおりである。2,000本の本物の配列に対するAPCつき平均場DCA、範囲の平滑化（bound smoothing）、古典的多次元尺度構成法、2つの可能なキラリティでのフレームの勾配降下である。1つの部分は結晶構造から来ている。配列上で4残基以内の局所の形を、ネットワークが局所構造について学ぶものの代わりにしている。拘束エネルギーの低いほうのキラリティを残し、このエネルギーには局所の形が含まれるので、ここでは結晶構造がキラリティを決めている。局所の形がなければ2つのキラリティは同点になる。</p>
    <p><b>ここでのリサイクリング。</b>新しいパスでは、上位2Lの候補のうち下書きで11 Å以内にある組を残し、下書きの距離から埋め込みを始める。9回の実行（全配列と、1,600配列の無作為標本8つ）で、RMSDの中央値は3.95、3.45、3.53、3.46 Å、lDDTの中央値は0.648、0.668、0.655、0.646と変わった。パス2でのlDDTの上昇は、この9回すべてと、別の12回のうち10回で起きたので、上昇の確かさは標本によって変わる。パス3と4は役に立たなかった。対照として、下書きなしで上位54組だけを使うと、中央値は3.28 Å、lDDT 0.678で、9回のうち6回でパス2と同等以上だった。つまり上昇は、どの組を使うかから来ている。全配列では、パス1は109組（8 Å以上離れた組46、12 Å以上19、15 Å以上10）、パス2は174組（同じく79、21、6）である。9回の実行すべてで本物の接触の割合は下がり、中央値はパス1の59%からパス2の55%になった。一方、15 Å以上の組の数の中央値は10から6に減った。9回の実行で原因を1つずつ調べると、パス2で選んだ組を下書きの距離なしで使うと中央値3.16 Å、lDDT 0.681で、9回すべてでパス1より良かった。パス1の組に下書きの距離を使うと4.08 Å、0.629で、パス1より良かったのは9回のうち1回だった。つまり下書きの距離だけでは役に立たない。AlphaFold2の上昇のしくみは、まったく違うかもしれない。</p>
    <p><b>CASP14。</b>0.96 Åと2.8 Åは、CASPのドメインでの主鎖r.m.s.d.95（残基の95%をカバーするCα）の中央値である（Jumper et al. 2021）。</p>
    <p class="small">出典: Jumper et al., Nature 2021、Supplement 1.10, 1.13。Mirdita et al., Nat Methods 2022。Gut and Lemmin, Bioinform Adv 2025。</p>`),

  async setup(run) {
    const f = run.state.f = theFamily(), che = f.che;
    const c = compressColumns(f.X, f.N, f.L, 6);
    run.state.scores = apc(await run.budget(meanFieldDCA(c.Y, f.N, f.L, c.qi, uniformWeights(f.N).w, 0.5)), f.L);
    const ca = run.state.ca = f.idx.map((r) => che.ca[r]), frames = f.idx.map((r) => che.frames[r]);
    run.state.pipe = new Pipeline(ca, frames, f.shape, { nums: f.idx.map((r) => che.nums[r]) });
    const ranked = f.score(run.state.scores).pairs.map(([, i, j]) => [f.posOf.get(i), f.posOf.get(j)]);
    run.state.first = ranked.slice(0, f.mapped);
    run.state.pool = ranked.slice(0, f.mapped * 2);
    run.state.isContact = ([i, j]) => f.D[f.colOf[i] * f.L + f.colOf[j]] < 8;
    run.state.scene = scene(run);
  },
  stages: [pipeline, again, real, check],
};

function scene(run) {
  const { world } = run, { f, ca } = run.state, n = ca.length;
  const mean = [0, 0, 0];
  for (const p of ca) { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; }
  const group = new THREE.Matrix4().makeTranslation(0, LIFT, 0).multiply(new THREE.Matrix4().makeRotationX(0.3)).multiply(new THREE.Matrix4().makeTranslation(-mean[0], -mean[1], -mean[2]));
  const truth = new THREE.Mesh(ribbonGeometry(ca, ca.map(() => new THREE.Color('#d7e0e5'))), world.paper({ vertexColors: true, transparent: true, opacity: 0.75, glow: 0.3 }));
  truth.matrixAutoUpdate = false; truth.matrix.copy(group);
  world.scene.add(truth);
  run.own({ dispose: () => { world.scene.remove(truth); truth.geometry.dispose(); truth.material.dispose(); } });
  frameBoard(run, 56, 60, { polar: 0.22, at: [0, LIFT - 6, 0], seconds: 0.6 });
  world.shadowSpan(70);
  run.own({ dispose: () => world.shadowSpan(80) });
  const flock = run.own(new Flock(world, n, f.shape, { size: 1.7 }));
  flock.paint(() => STOCK.high);
  let ribbon = null;
  const show = (gas) => {
    const P = gas.points(0), fit = superpose(P, ca), T = { R: fit.R, t: fit.cq };
    const placed = gas.frames.map((F, i) => {
      const R = [0, 1, 2].flatMap((a) => [0, 1, 2].map((b) => T.R[a * 3] * F.R[b] + T.R[a * 3 + 1] * F.R[3 + b] + T.R[a * 3 + 2] * F.R[6 + b]));
      return { R, t: fit.fitted[i] };
    });
    placed.forEach((F, i) => flock.place(i, F.R, F.t, group));
    flock.commit();
    if (ribbon) { world.scene.remove(ribbon); ribbon.geometry.dispose(); ribbon.material.dispose(); }
    ribbon = new THREE.Mesh(ribbonGeometry(fit.fitted, fit.fitted.map(() => STOCK.good)), world.paper({ vertexColors: true, glow: 0.4 }));
    ribbon.matrixAutoUpdate = false; ribbon.matrix.copy(group); ribbon.castShadow = true;
    world.scene.add(ribbon);
    world.shadowDirty = 3;
  };
  run.own({ dispose: () => { if (ribbon) { world.scene.remove(ribbon); ribbon.geometry.dispose(); ribbon.material.dispose(); } } });
  return { show };
}

async function pipeline(run) {
  const { ui, sound } = run, { pipe, first, ca, isContact, scene: s } = run.state;
  ui.tags('model', 'real', 'game');
  ui.reads([]);
  await run.line(tr('You now have every idea you need to fold a real protein on this device, so let us do it. This is your own small pipeline, not AlphaFold2.', 'この端末で本物のタンパク質を折りたたむのに必要な考え方はすべてそろったので、実際にやってみる。これはAlphaFold2ではなく、自分の小さなパイプラインである。'));
  await run.line(tr('The pale ribbon is the real CheY, there for you to compare with.', '淡いリボンは本物のCheYで、比較のために置いてある。'));
  await run.line(tr(`From chapter 2, take the ${run.state.first.length} best pairs. From chapter 4, smooth their triangles into a map. Then lay the map out in 3D, and settle it with small moves on the frames.`, `第2章から上位${run.state.first.length}組を取る。第4章のように三角形を平滑化してマップにする。そのマップを3次元に広げ、フレームの小さな動きで落ち着かせる。`));
  ui.say(tr('One thing is borrowed: local shape, up to four residues along the chain, comes from the crystal, and it also decides which hand comes out.', '1つだけ借りものがある。配列上で4残基以内の局所の形は結晶構造から取っていて、どちらのキラリティになるかもこれで決まる。'));
  await run.until((done) => { ui.ctrl(ui.button(tr('Fold it', '折りたたむ'), () => { ui.ctrl(); done(); }, { id: 'fold' })); });
  ui.say(tr('Folding, in both possible hands.', '2つの可能なキラリティの両方で折りたたんでいる。'));
  const gas = await run.budget(pipe.foldSlices(first));
  const p = gas.points(), r = rmsd(p, ca), l = lddt(p, ca), hits = first.filter(isContact).length;
  run.state.drafts = [{ gas, r, l, n: first.length, hits }];
  s.show(gas);
  sound.fold();
  sound.setOpening((l - 0.45) / 0.3);
  sound.phrase(5);
  run.reach(1);
  ui.reads([{ value: `${fmt(r)} Å`, label: tr('RMSD from the real CheY', '本物のCheYからのRMSD') }, { value: fmt(l), label: 'lDDT' }, { value: tr(`${hits} of ${first.length}`, `${first.length}組中${hits}組`), label: tr('contacts used were real', '使った接触のうち本物') }]);
  await run.line(tr('From real sequences to a fold, in seconds, with no learned weights, though with local shape read from the crystal. Some of those contacts are still false.', '局所の形は結晶構造から読んでいるものの、学習した重みなしで、本物の配列から数秒でfoldにたどり着いた。接触の一部はまだ偽物である。'));
}

async function again(run) {
  const { ui, sound } = run, { pipe, pool, first, ca, isContact, scene: s } = run.state;
  if (!run.state.drafts) { const g = await run.budget(pipe.foldSlices(first)), p = g.points(); run.state.drafts = [{ gas: g, r: rmsd(p, ca), l: lddt(p, ca), n: first.length, hits: first.filter(isContact).length }]; s.show(g); }
  const drafts = run.state.drafts.slice(0, 1);
  ui.tags('model', 'game');
  await run.line(tr('Here is the idea of <b>recycling</b>. Feed the draft back in as input, and read the data again with a shape in hand.', 'これが<b>リサイクリング</b>（recycling）の考え方である。下書きを入力に戻し、形を手にしてデータを読み直す。'));
  await run.line(tr('In this small pipeline, a new pass may look further down its list of pairs, and keeps those that sit close together in the draft.', 'この小さなパイプラインでは、新しいパスは組のリストのさらに下まで見て、下書きで近くにある組を残す。'));
  const c = chart(ui, { height: 82 });
  const draw = () => c.draw(Array.from({ length: PASSES }, (_, k) => ({ value: drafts[k]?.l ?? 0, label: tr(`pass ${k + 1}`, `パス${k + 1}`), text: drafts[k] ? fmt(drafts[k].l) : '', color: k === 0 ? '#65cbf3' : '#0053d6' })), { max: 1 });
  const control = { done: false, fewer: null };
  const ready = () => drafts.length >= PASSES && control.done && control.fewer;
  const status = () => { const d = drafts[drafts.length - 1]; ui.reads([{ value: `${fmt(d.r)} Å`, label: 'RMSD' }, { value: fmt(d.l), label: 'lDDT' }, { value: tr(`${pct(d.hits / d.n)} of ${d.n}`, `${d.n}組の${pct(d.hits / d.n)}`), label: tr('contacts real', '本物の接触') }]); };
  status();
  ui.say(tr('Feed each draft back up to pass 4, then run both controls.', 'パス4まで下書きを戻し、2つの対照を実行する。'));
  await run.until((done) => {
    const nxt = ui.button(tr('Next', '次へ'), () => done(), { id: 'next' });
    nxt.disabled = true;
    const feed = ui.button(tr('Feed it back', '戻す'), async () => {
      if (drafts.length >= PASSES) return;
      feed.disabled = true;
      const { contacts, gas } = await run.budget(pipe.recycleSlices(drafts[drafts.length - 1].gas, pool));
      const p = gas.points(), d = { gas, r: rmsd(p, ca), l: lddt(p, ca), n: contacts.length, hits: contacts.filter(isContact).length };
      drafts.push(d);
      s.show(gas);
      draw(); status();
      sound.setOpening((d.l - 0.45) / 0.3);
      sound.fold(); sound.phrase(5);
      feed.disabled = drafts.length >= PASSES;
      if (ready()) { run.reach(2); nxt.disabled = false; }
    }, { id: 'feed' });
    const ctl = ui.button(tr('Control: feed nothing', '対照：何も戻さない'), async () => {
      ctl.disabled = true;
      const g = await run.budget(pipe.foldSlices(first)), p = g.points(), same = Math.abs(rmsd(p, ca) - drafts[0].r);
      control.done = true;
      control.same = same;
      ui.say(tr(`With nothing fed back the calculation simply repeats, to ${same < 1e-9 ? 'every digit' : `${same.toExponential(1)} Å`}, as any fixed calculation must, so this control only confirms that the feed is what changed.`, `何も戻さないと、計算は${same < 1e-9 ? 'すべての桁' : `${same.toExponential(1)} Å`}まで同じ結果を繰り返す。固定した計算なら当然そうなるので、この対照が確かめるのは、変わったのは戻したものだということだけである。`));
      if (ready()) { run.reach(2); nxt.disabled = false; }
    }, { quiet: true, id: 'control' });
    const ctl2 = ui.button(tr('Control: fewer pairs, no draft', '対照：組を減らし下書きなし'), async () => {
      ctl2.disabled = true;
      const few = first.slice(0, first.length >> 1), g = await run.budget(pipe.foldSlices(few)), p = g.points();
      control.fewer = { r: rmsd(p, ca), l: lddt(p, ca), n: few.length };
      ui.say(tr(`Using only the top ${few.length} pairs, with no draft at all, gives ${fmt(control.fewer.r)} Å and lDDT ${fmt(control.fewer.l)}.`, `下書きをまったく使わず上位${few.length}組だけを使うと、${fmt(control.fewer.r)} Å、lDDT ${fmt(control.fewer.l)}になる。`));
      if (ready()) { run.reach(2); nxt.disabled = false; }
    }, { quiet: true, id: 'control2' });
    ui.ctrl(c, feed, ctl, ctl2, nxt);
    draw();
  });
  ui.ctrl();
  const gains = drafts.map((d) => d.l);
  ui.reads([{ value: tr(`${fmt(gains[0])} to ${fmt(Math.max(...gains))}`, `${fmt(gains[0])}〜${fmt(Math.max(...gains))}`), label: tr('best lDDT reached', '到達した最高のlDDT') }, { value: `${fmt(drafts[1].r - drafts[0].r)} Å`, label: tr('RMSD change at pass 2', 'パス2でのRMSDの変化') }]);
  const fw = control.fewer;
  await run.line(tr('The gain is small and comes early. After that it stops, and it can even slip back. This is one run, and the note gives the numbers across several.', '改善は小さく、早い段階で起きる。そのあと止まり、後戻りすることさえある。これは1回の実行で、複数回の数値は章の注にある。'));
  await run.line(tr(`And look at your second control: ${fmt(fw.r)} Å with fewer pairs and no draft at all. In this small pipeline the gain comes from which pairs are used. The draft drops some of the worst pairs and lets in more real ones, though the share of real contacts does not rise. Its distances alone do not help.`, `そして2つ目の対照を見ると、組を減らし下書きをまったく使わずに${fmt(fw.r)} Åである。この小さなパイプラインでは、改善はどの組を使うかから来ている。下書きは最悪の組の一部を落とし、本物の組をより多く入れるが、本物の接触の割合は上がらない。下書きの距離だけでは役に立たない。`));
  await run.line(tr('So do not take this as how AlphaFold2 gains. It shows that a draft can help you re-read data, and that passes run out when nothing new comes in.', 'だから、これをAlphaFold2の改善のしくみと受け取ってはならない。示しているのは、下書きがデータの読み直しに役立つことと、新しいものが入らなければパスの効果が尽きることである。'));
  run.state.drafts = drafts;
}

// Your draft as AlphaFold2 would get such a thing back: C-beta distances in 15 bins, 3.25 to 20.75 A in config.py.
function binnedDraft(gas, n) {
  const P = gas.points(3), box = document.createElement('canvas'), size = 150;
  box.className = 'chart';
  box.style.height = `${size}px`;
  box.paint = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = box.clientWidth || 300;
    box.width = W * dpr; box.height = size * dpr;
    const g = box.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = size / n, x0 = (W - size) / 2;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);
        if (d < 3.25) continue; // in AlphaFold2 a distance under the first edge falls in no bin
        const bin = Math.min(14, Math.floor((d - 3.25) / 1.25));
        g.fillStyle = `hsl(${212 - bin * 4}, 75%, ${28 + bin * 4.6}%)`;
        g.fillRect(x0 + j * cell, i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  };
  return box;
}

async function real(run) {
  const { ui } = run, { f, ca, pipe, first } = run.state;
  const af = getModel('P0AE67'), che = f.che;
  if (!run.state.drafts) { const g = await run.budget(pipe.foldSlices(first)), p = g.points(); run.state.drafts = [{ gas: g, r: rmsd(p, ca) }]; }
  // The same residues on both sides: those the alignment covers.
  const pa = f.idx.map((r) => af.ca[af.nums.indexOf(che.nums[r])]);
  const drafts = run.state.drafts, last = drafts[drafts.length - 1];
  ui.reads([]);
  ui.tags('paper');
  await run.line(tr('Now what AlphaFold2 really does, because it is not what your pipeline did.', '自分のパイプラインとは違うので、AlphaFold2が実際にしていることを見る。'));
  await run.line(tr('It feeds back three things: the first row of the MSA table, the pair table, and the predicted C-beta distances, sorted into 15 bins.', '戻すものは3つで、MSAの表の最初の行、ペアの表、15個のビンに分けた予測Cβ距離である。'));
  const box = binnedDraft(last.gas, ca.length);
  ui.tags('paper', 'game');
  await run.until((done) => { ui.say(tr('This is your last draft in that form: nothing but a table of coarse distances.', 'これが最後の下書きをその形にしたもので、粗い距離の表でしかない。')); ui.ctrl(box, ui.button(tr('Next', '次へ'), () => done(), { id: 'next' })); box.paint(); });
  ui.ctrl();
  ui.tags('paper');
  await run.line(tr('The frames themselves are not kept. Each pass starts them again from the black hole, so coordinates return only as those binned distances.', 'フレームそのものは残さない。各パスはブラックホールからやり直すので、座標はビンに分けた距離としてしか戻らない。'));
  await run.line(tr('So do not picture a draft being polished. Each pass builds the structure again, from richer tables and a new sample of sequences.', 'だから、下書きを磨いていく姿を思い浮かべてはいけない。各パスは、より豊かな表と新しい配列の標本から、構造をつくり直す。'));
  await run.line(tr('The authors found that removing recycling hurts accuracy. It also gives a much deeper network, with almost no extra weights.', '著者らによると、リサイクリングを取り除くと精度が下がる。リサイクリングは、重みをほとんど増やさずに、はるかに深いネットワークも与える。'));
  ui.tags('af2', 'real', 'game');
  ui.reads([{ value: `${fmt(last.r)} Å`, label: tr(`your pipeline, last pass, ${ca.length} residues`, `自分のパイプライン、最後のパス、${ca.length}残基`) }, { value: `${fmt(rmsd(pa, ca))} Å`, label: tr(`real AlphaFold2, the same ${ca.length} residues`, `本物のAlphaFold2、同じ${ca.length}残基`) }]);
  await run.line(tr('Here is the real thing beside yours. This crystal dates from 1991, so AlphaFold2 may have trained on it, and the database pipeline can also read known structures as templates. So this gap says little about a new protein.', '本物を自分の結果と並べた。この結晶構造は1991年のものなので、AlphaFold2の訓練に使われた可能性があり、データベースのパイプラインは既知の構造をテンプレートとして読むこともできる。だから、この差は新しいタンパク質についてほとんど何も言えない。'));
  ui.reads([]);
  ui.tags('paper');
  await run.line(tr('The fair test was blind. In CASP14, on structures not yet public, the median backbone error of AlphaFold2 was 0.96 Å, and the next best method reached 2.8 Å.', '公平な試験はブラインドテストだった。CASP14では、まだ公開されていない構造に対して、AlphaFold2の主鎖の誤差の中央値は0.96 Åで、次に良い方法は2.8 Åだった。'));
}

async function check(run) {
  const { ui } = run;
  ui.tags('model');
  const first = await run.choose(tr('A new case. Someone runs a network 50 passes with the output NOT fed back and the same input each time. What happens?', '新しい例である。出力を戻さず、毎回同じ入力で、ネットワークを50パス実行した人がいる。何が起きるか。'), [
    { text: tr('It keeps improving, just slowly.', 'ゆっくりだが良くなり続ける。'), right: false, why: tr('Your control showed no change at all. Nothing new went in.', '対照では何も変わらなかった。新しいものが何も入っていない。') },
    { text: tr('Nothing changes after the first pass.', '最初のパスのあとは何も変わらない。'), right: true, why: tr('Right. A fixed network on a fixed input gives a fixed output. Improvement needs something to change.', '正解。固定したネットワークに固定した入力を与えれば、出力も固定される。改善には何かが変わる必要がある。') },
    { text: tr('It gets worse.', '悪くなる。'), right: false, why: tr('It stays exactly the same.', 'まったく同じままである。') },
  ]);
  const second = await run.choose(tr('Why might a protein with few homologues gain more from recycling than one with many?', '相同配列の少ないタンパク質のほうが、多いタンパク質よりリサイクリングの効果が大きいことがあるのはなぜか。'), [
    { text: tr('One pass leaves it far from done, so later passes still have work to do.', '1パスでは完成から遠いので、あとのパスにまだ仕事が残っている。'), right: true, why: tr('Yes, and that matches ColabFold, where extra recycles helped mostly on targets with little MSA information.', '正解。これはColabFoldの結果とも合っていて、リサイクルを増やして役立ったのはMSAの情報が少ないターゲットが中心だった。') },
    { text: tr('Few sequences mean a faster network.', '配列が少ないとネットワークが速くなる。'), right: false, why: tr('Speed does not change accuracy.', '速さは精度を変えない。') },
    { text: tr('Recycling invents new sequences.', 'リサイクリングが新しい配列をつくり出す。'), right: false, why: tr('It resamples the sequences it has. It cannot create new evidence.', '持っている配列を抽出し直すだけで、新しい証拠はつくれない。') },
  ]);
  if (first && second) run.reach(3);
}
