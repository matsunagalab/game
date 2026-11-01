// Chapter 2. A small exact model of why inverting correlations finds direct links, then real mean-field DCA on the real family.
import * as THREE from 'three';
import { Threads, STOCK } from '../world.js';
import { apc, miMatrix, uniformWeights, reweight } from '../science/msa.js';
import { meanFieldDCA, partialCorrelations } from '../science/dca.js';
import { evolveStar, evolveTree } from '../science/tree.js';
import { ambient, chart, compressColumns, ContactQuilt, fmt, frameBoard, name, PaperProtein, pct, theFamily } from './common.js';
import { tr } from '../i18n.js';

export default {
  id: 'direct',
  title: tr('Direct or indirect', '直接か間接か'),
  tease: tr('Linked is not the same as touching. Tell a real contact from a chain of friends.', '結びついていることと接触していることは違う。本物の接触と、友だちの友だちを見分ける。'),
  principle: tr('If A touches B and B touches C, then A and C tend to correlate without touching. Inverting the table of correlations shrinks those indirect links and leaves the direct ones, which is why direct coupling analysis finds contacts that mutual information misses.', 'AがBに接触し、BがCに接触していると、AとCは接触していなくても相関しやすい。相関の表の逆行列をとると、この間接の結びつきは小さくなり、直接の結びつきが残る。直接結合分析が、相互情報量の見逃す接触を見つけられるのはこのためである。'),
  goals: [tr('Run real direct coupling on the real family.', '本物のファミリーで直接結合分析を実行する。'), tr('Find how few sequences still give 60% right.', '何配列まで減らしても60%正解できるかを見つける。'), tr('Get the new case right first time, answer and reason.', '新しい例で、答えと理由の両方を1回で正解する。')],
  note: tr(`<h3>Chapter note</h3>
    <p><b>The small model</b> is exact arithmetic. You set the direct links, the game inverts that table to get the correlations you would observe, then inverts back. For a Gaussian the indirect link comes back as exactly zero. Real letters are not Gaussian, so on real data DCA shrinks an indirect pair but does not zero it.</p>
    <p><b>Mean-field DCA</b> (Morcos et al. 2011): couplings e<sub>ij</sub>(a,b) = −(C<sup>−1</sup>)<sub>ij</sub>(a,b), where C<sub>ij</sub>(a,b) = f<sub>ij</sub>(a,b) − f<sub>i</sub>(a) f<sub>j</sub>(b). The pseudocount is λ = M<sub>eff</sub>, which is large on purpose. The main run here is unweighted, and sequence reweighting at 80% identity gives the same 66.7% on this sample. The score here is the Frobenius norm of each coupling block in the zero-sum gauge (Ekeberg et al. 2013), not the direct information of Morcos.</p>
    <p><b>A simplification.</b> So that the inversion runs on a phone, each column keeps its six commonest letters and the rest share one slot. That gives a 663 by 663 matrix instead of 2,220. Against the full 21 letters this costs about 4 of the top 54 pairs on this sample (0.67 against 0.74). This is this game's shortcut, not part of DCA.</p>
    <p><b>The real triple.</b> T16, I20 and L24 are shown as a suspect, not a proof. Conditioning on I20 does not remove the link between T16 and L24, and the two contacts are only 4 apart along the chain, closer than chapter 1 counts. A search of this family found no clean real example of a chain link at separations of 6 or more, which is why the exact small model does the proving.</p>
    <p><b>Score of a guess.</b> Precision at L/2 means: of the 54 best-scoring pairs at least 6 apart, how many have C-beta atoms within 8 Å in 3CHY. Morcos used minimum atomic distance under 8 Å, so its figures are not directly comparable.</p>
    <p><b>Phylogeny.</b> In the tree test no two columns are coupled, by construction. Sequence reweighting at 80% identity is the usual partial remedy, but it barely changed this test, and this sample is too diverse for it to matter either: M<sub>eff</sub> is about 1,890 of 2,000. APC about halves the false top score.</p>
    <p><b>False pairs.</b> Across 4,000 families, about a quarter of strong DCA-type pairs were over 5 Å apart, and 3% over 15 Å. Of those beyond 15 Å, 35% lay at homo-oligomer interfaces, 19% came from structural variation in the family, and 27% were in repeat proteins. These are the abstract's figures; its Results section gives 34% for oligomers and 17% for repeats (Anishchenko et al. 2017).</p>
    <p><b>In AlphaFold2.</b> AF2 does not run DCA, and takes no precomputed covariance. It reads the MSA directly, and the training losses push it toward co-evolution-like reasoning. Its designers state this as an intention, and report only that the masked-MSA loss raises accuracy (Supplement 1.9.9, section 1.9). Its accuracy falls substantially when the median alignment depth is under about 30 sequences (Jumper et al. 2021, Fig. 5a).</p>
    <p class="small">Sources: Morcos et al., PNAS 2011. Ekeberg et al., Phys Rev E 2013. Dunn et al., Bioinformatics 2008. Marks et al., PLoS One 2011. Anishchenko et al., PNAS 2017. Jumper et al., Nature 2021.</p>`, `<h3>この章の注</h3>
    <p><b>小さなモデル</b>は厳密な計算である。直接の結びつきを決めると、ゲームはその表の逆行列をとって観測されるはずの相関を求め、もう一度逆行列をとって元に戻す。ガウス分布なら、間接の結びつきはちょうど0に戻る。本物の文字はガウス分布ではないので、実データではDCAは間接の組を小さくするが0にはしない。</p>
    <p><b>平均場DCA</b>（Morcos et al. 2011）では、結合はe<sub>ij</sub>(a,b) = −(C<sup>−1</sup>)<sub>ij</sub>(a,b)で、C<sub>ij</sub>(a,b) = f<sub>ij</sub>(a,b) − f<sub>i</sub>(a) f<sub>j</sub>(b)である。擬似カウントはλ = M<sub>eff</sub>で、わざと大きくしてある。ここでの主な計算は重みづけなしで、80%同一性で配列の重みづけをしても、この標本では同じ66.7%になる。ここでのスコアは、ゼロ和ゲージでの各結合ブロックのフロベニウスノルムで（Ekeberg et al. 2013）、Morcosのdirect informationではない。</p>
    <p><b>単純化。</b>スマートフォンでも逆行列を計算できるように、各列は最も多い6文字を残し、残りは1つの枠にまとめている。これで行列は2,220行ではなく663行になる。21文字すべてを使う場合と比べると、この標本では上位54組のうち約4組を失う（0.67と0.74）。これはこのゲームの近道で、DCAの一部ではない。</p>
    <p><b>本物の3つ組。</b>T16、I20、L24は疑わしい例として示すだけで、証明ではない。I20で条件づけてもT16とL24の結びつきは消えず、2つの接触は配列上で4しか離れていない。これは第1章で数える範囲より近い。このファミリーを探しても、6以上離れた位置で連鎖のきれいな実例は見つからなかった。そのため、証明は厳密な小さなモデルが担っている。</p>
    <p><b>予測の採点。</b>L/2での適合率（precision）とは、配列上で6以上離れた組のスコア上位54組のうち、3CHYでCβ原子が8 Å以内にある組がいくつあるかを指す。Morcosは最小原子間距離8 Å未満を使っているので、その数値とは直接比べられない。</p>
    <p><b>系統。</b>系統樹のテストでは、つくり方からしてどの2列も結合していない。80%同一性での配列の重みづけは一般的な部分的対策だが、このテストの結果はほとんど変わらなかった。この標本は多様性が高いので、ここでも効果はほとんどない（M<sub>eff</sub>は2,000のうち約1,890）。APCは偽の最高スコアをおよそ半分にする。</p>
    <p><b>偽の組。</b>4,000ファミリーを調べると、DCA型の強い組の約4分の1は5 Åより離れ、3%は15 Åより離れていた。15 Åを超える組のうち、35%はホモオリゴマーの界面にあり、19%はファミリー内の構造の違いによるもので、27%はリピートタンパク質にあった。これらは論文の要旨の数値で、Resultsの節ではオリゴマーが34%、リピートが17%である（Anishchenko et al. 2017）。</p>
    <p><b>AlphaFold2では。</b>AF2はDCAを実行せず、あらかじめ計算した共分散も受け取らない。MSAを直接読み、訓練の損失が共進化に似た推論へ導く。設計者はこれを意図として述べ、報告しているのはマスクMSAの損失が精度を上げることだけである（Supplement 1.9.9、1.9節）。アラインメントの深さの中央値が約30配列を下回ると、精度は大きく下がる（Jumper et al. 2021, Fig. 5a）。</p>
    <p class="small">出典: Morcos et al., PNAS 2011。Ekeberg et al., Phys Rev E 2013。Dunn et al., Bioinformatics 2008。Marks et al., PLoS One 2011。Anishchenko et al., PNAS 2017。Jumper et al., Nature 2021。</p>`),

  setup(run) {
    const f = run.state.f = theFamily(), w = uniformWeights(f.N).w;
    run.state.w = w;
    run.state.MI = miMatrix(f.X, f.N, f.L, w);
    const c = compressColumns(f.X, f.N, f.L, 6);
    run.state.Y = c.Y; run.state.qi = c.qi;
    run.probe.cols = (name_) => name_;
  },

  stages: [triple, dials, real, depth, tree, misses, check],
};

// T16, I20 and L24 lie one helical turn apart along a real helix, found by searching the real scores for such chains.
function tripleColumns(f) {
  const col = (num) => f.colOf.find((c) => f.che.nums[f.col2res[c]] === num);
  return [col(16), col(20), col(24)];
}

async function triple(run) {
  const { ui, world, sound } = run, { f, MI } = run.state, [a, b, c] = tripleColumns(f), L = f.L;
  const model = run.scoped(new PaperProtein(world, f.che, { stock: () => STOCK.good, scale: 1.5, center: [0, 22, 0], spin: 0.05, size: 1.6 }));
  model.angle = 2.2; model.update();
  frameBoard(run, 70, 74, { polar: 0.14, at: [0, 12, 0], seconds: 0 });
  world.shadowSpan(110);
  run.scoped({ dispose: () => world.shadowSpan(80) });
  const th = run.scoped(new Threads(world, 6, { width: 0.5 }));
  const pts = [a, b, c].map((k) => f.che.cb[f.col2res[k]]);
  const redraw = () => { th.clear(); th.add(pts[0], pts[1], '#0053d6', 0.55, model.group); th.add(pts[1], pts[2], '#0053d6', 0.55, model.group); th.add(pts[0], pts[2], '#ff7d45', 0.4, model.group); };
  redraw();
  run.tick(redraw);
  const m = (i, j) => MI[i * L + j];
  ui.tags('real', 'game');
  await run.line(tr(`Chapter 1 left a puzzle: many strongly linked pairs do not touch. Here is a real case just under the strong line, three residues along one helix.`, `第1章の謎は、強く結びついた組の多くが接触していないことだった。「強い」の線のすぐ下にある本物の例として、1本のヘリックス上の3残基を見る。`));
  ui.reads([{ value: fmt(m(a, b)), label: tr(`${name(f, a)} with ${name(f, b)}`, `${name(f, a)}と${name(f, b)}`) }, { value: fmt(m(b, c)), label: tr(`${name(f, b)} with ${name(f, c)}`, `${name(f, b)}と${name(f, c)}`) }, { value: fmt(m(a, c)), label: tr(`${name(f, a)} with ${name(f, c)}`, `${name(f, a)}と${name(f, c)}`) }]);
  await run.line(tr(`${name(f, a)} touches ${name(f, b)}, at ${fmt(f.D[a * L + b], 1)} Å. ${name(f, b)} touches ${name(f, c)}, at ${fmt(f.D[b * L + c], 1)} Å.`, `${name(f, a)}は${name(f, b)}に${fmt(f.D[a * L + b], 1)} Åで接触している。${name(f, b)}は${name(f, c)}に${fmt(f.D[b * L + c], 1)} Åで接触している。`));
  sound.tap();
  await run.line(tr(`But ${name(f, a)} and ${name(f, c)} are ${fmt(f.D[a * L + c], 1)} Å apart, with no contact, and their letters are linked too. That is the orange thread.`, `しかし${name(f, a)}と${name(f, c)}は${fmt(f.D[a * L + c], 1)} Å離れていて接触していないのに、文字は結びついている。これがオレンジの糸である。`));
  await run.line(tr('A middle residue can carry a link like this, but these numbers cannot prove it. So test the idea in an exact small model.', 'このような結びつきは真ん中の残基が伝えている可能性があるが、この数値では証明できない。そこで、厳密な小さなモデルで確かめる。'));
}

async function dials(run) {
  const { ui } = run;
  ui.reads([]);
  ui.tags('model');
  // Three paper discs and the links between them: blue strips are direct links, the orange strip is what you would measure.
  const { world } = run, THREE_POS = [[-20, 4, 12], [0, 4, -14], [20, 4, 12]];
  const discs = THREE_POS.map(([x, y, z], k) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40).rotateX(-Math.PI / 2), world.paper({ color: k === 1 ? '#65cbf3' : '#0053d6', glow: 0, bump: 0.2 }));
    m.position.set(x, y, z); m.castShadow = true;
    world.scene.add(m);
    run.scoped({ dispose: () => { world.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
    return m;
  });
  const names = ['A', 'B', 'C'].map((t, k) => { const l = ui.label(t, 'big'); run.tick(() => l.at(world.project(discs[k].position))); return l; });
  run.scoped({ dispose: () => names.forEach((l) => l.remove()) });
  frameBoard(run, 66, 52, { polar: 0.34, at: [0, 2, 0], seconds: 0.7 });
  const links = run.scoped(new Threads(world, 6, { width: 0.6, shadows: true }));
  const drawLinks = (ab1, bc1, ac1, corr) => {
    links.clear();
    const [A, B, C] = THREE_POS, up = (p, h) => [p[0], p[1] + h, p[2]];
    if (ab1 > 0.01) links.add(up(A, 1), up(B, 1), '#0053d6', 0.3 + ab1 * 2.6);
    if (bc1 > 0.01) links.add(up(B, 1), up(C, 1), '#0053d6', 0.3 + bc1 * 2.6);
    if (ac1 > 0.01) links.add(up(A, 1), up(C, 1), '#0053d6', 0.3 + ac1 * 2.6);
    if (Math.abs(corr) > 0.01) links.add(up(A, 7), up(C, 7), '#ff7d45', 0.25 + Math.abs(corr) * 2.2);
    world.shadowDirty = 2;
  };
  await run.line(tr('Try it in the smallest possible system: three positions, and you set how strongly each pair is directly linked.', '3つの位置だけの最小の系で、各組の直接の結びつきの強さを自分で決めて試す。'));
  let ab = 0.5, bc = 0.5, ac = 0;
  let saw = false;
  const update = () => {
    // Direct links define the inverse table. Its inverse, scaled, is what an observer would measure as correlation.
    const P = [1, -ab, -ac, -ab, 1, -bc, -ac, -bc, 1];
    const det = 1 - ab * ab - bc * bc - ac * ac - 2 * ab * bc * ac;
    const adj = [1 - bc * bc, ab + ac * bc, ac + ab * bc, ab + ac * bc, 1 - ac * ac, bc + ab * ac, ac + ab * bc, bc + ab * ac, 1 - ab * ab].map((v) => v / det);
    const s = [Math.sqrt(adj[0]), Math.sqrt(adj[4]), Math.sqrt(adj[8])];
    const C = [1, adj[1] / (s[0] * s[1]), adj[2] / (s[0] * s[2]), adj[1] / (s[0] * s[1]), 1, adj[5] / (s[1] * s[2]), adj[2] / (s[0] * s[2]), adj[5] / (s[1] * s[2]), 1];
    const d = partialCorrelations(C);
    run.state.dial = { corrAC: C[2], directAC: d.ac, det, P };
    drawLinks(ab, bc, ac, C[2]);
    ui.reads([
      { value: tr(`${fmt(C[1])} and ${fmt(C[5])}`, `${fmt(C[1])}と${fmt(C[5])}`), label: tr('A with B, B with C', 'AとB、BとC') },
      { value: fmt(C[2]), label: tr('A with C', 'AとC') },
      { value: Math.abs(d.ac) < 5e-13 ? '0.00' : fmt(d.ac), label: tr('direct A to C, after inverting', '逆行列でのAとCの直接の結びつき') },
    ]);
    if (ab > 0.3 && bc > 0.3 && Math.abs(ac) < 0.001) saw = true;
    return saw;
  };
  update();
  ui.say(tr('Set A to B and B to C strong, and A to C at zero, then read the numbers.', 'AとB、BとCを強く、AとCを0にして、数値を読む。'));
  await run.until((done) => {
    const go = ui.button(tr('I see it', '確かめた'), () => done(), { id: 'dial-done' });
    ui.ctrl(
      ui.slider({ label: tr('A to B', 'AとB'), min: 0, max: 0.55, step: 0.05, value: ab, format: (v) => v.toFixed(2), onInput: (v) => { ab = v; update(); } }),
      ui.slider({ label: tr('B to C', 'BとC'), min: 0, max: 0.55, step: 0.05, value: bc, format: (v) => v.toFixed(2), onInput: (v) => { bc = v; update(); } }),
      ui.slider({ label: tr('A to C', 'AとC'), min: 0, max: 0.25, step: 0.05, value: ac, format: (v) => v.toFixed(2), onInput: (v) => { ac = v; update(); } }),
      go,
    );
  });
  ui.ctrl();
  await run.line(tr('Correlation adds up every path between two positions. Along a chain, correlations multiply: A with C is A with B times B with C.', '相関は、2つの位置を結ぶすべての経路を足し合わせたものである。鎖のようにつながると相関は掛け算になり、AとCの相関はAとBの相関にBとCの相関を掛けた値になる。'));
  await run.line(tr('Take the matrix <b>inverse</b> of the correlation table, the table version of 1/x, and that sum is undone: the direct links come back.', '相関の表の<b>逆行列</b>（1/xの表版）をとると、この足し合わせが打ち消され、直接の結びつきが戻ってくる。'));
  await run.line(tr('Applied to an alignment, this is <b>direct coupling analysis</b>, or DCA. Real letters are not as tidy as this model, so indirect links shrink rather than vanish.', 'これをアラインメントに使うのが<b>直接結合分析</b>（direct coupling analysis、DCA）である。本物の文字はこのモデルほどきれいではないので、間接の結びつきは消えずに小さくなる。'));
}

async function real(run) {
  const { ui, world, sound } = run, { f, MI, Y, qi, w } = run.state;
  const q = run.scoped(new ContactQuilt(run, f, {}));
  frameBoard(run, f.L + 5, f.L + 5);
  ui.reads([]);
  ui.tags('real', 'game');
  await run.line(tr('This quilt has a square for every pair of positions. The lower half shows the real contacts of CheY.', 'このキルトには、位置の組ごとに1つのマスがある。下半分はCheYの本物の接触を示す。'));
  await run.line(tr('The upper half will show the best guesses. Dark blue squares are within our 8 Å line, and orange squares are beyond it.', '上半分には、予測の上位が並ぶ。濃い青のマスは8 Åの線の内側、オレンジのマスは外側である。'));
  const k = f.mapped >> 1;
  const seen = new Set();
  let dca = run.state.dca ?? null;
  let method = 'MI', useApc = false;
  const show = () => {
    const raw = method === 'MI' ? MI : dca, S = useApc ? apc(raw, f.L) : raw, sc = f.score(S), g = q.guesses(sc.pairs, k);
    sound.rustle(4, 0.03);
    seen.add(`${method}${useApc}`);
    run.state.last = { method, useApc, half: sc.half };
    ui.reads([{ value: pct(sc.half), label: tr(`of the top ${k} pairs within 8 Å`, `上位${k}組のうち8 Å以内`) }, { value: `${g.hit} / ${g.miss}`, label: tr('within / beyond', '内側 / 外側') }]);
    return sc;
  };
  show();
  ui.say(tr('This is mutual information, and most of its best guesses are wrong.', 'これが相互情報量で、上位の予測のほとんどは外れている。'));
  await run.until((done) => { ui.ctrl(ui.button(tr('Next', '次へ'), () => done(), { id: 'next' })); });
  await run.line(tr('Part of the trouble is that some columns are chatty, and link a little with everyone. Take out what the two columns\' average chat alone would predict: that is the <b>average product correction</b>, or APC.', '一因は、どの列とも少しずつ結びつく「にぎやかな」列があることである。2つの列の平均的なにぎやかさだけから予想される分を差し引くのが、<b>平均積補正</b>（average product correction、APC）である。'));
  useApc = true;
  show();
  ui.say(tr('That is better, from one line of arithmetic, so now run the real inversion.', 'たった1行の計算で良くなった。次は本物の逆行列を計算する。'));
  await run.until((done) => {
    const go = ui.button(tr('Invert the real table', '本物の表で逆行列を計算する'), async () => {
      go.disabled = true;
      ui.say(tr('Inverting a 663 by 663 table of real correlations.', '本物の相関の663×663の表で逆行列を計算している。'));
      const t0 = performance.now();
      dca = run.state.dca = await run.budget(meanFieldDCA(Y, f.N, f.L, qi, w, 0.5), (p) => { ui.reads([{ value: pct(p), label: tr('of the inversion done', '計算の進み具合') }]); });
      run.state.dcaMs = performance.now() - t0;
      done();
    }, { id: 'invert' });
    ui.ctrl(go);
  });
  method = 'DCA';
  useApc = false;
  show();
  sound.fold();
  run.reach(1);
  ui.say(tr(`Done on this device in ${(run.state.dcaMs / 1000).toFixed(1)} seconds, so now try each setting and compare.`, `この端末で${(run.state.dcaMs / 1000).toFixed(1)}秒で終わった。それぞれの設定を試して比べる。`));
  await run.until((done) => {
    const pick = (m, a) => () => { method = m; useApc = a; show(); ui.say(tr(`${m}${a ? ' with APC' : ' alone'}.`, `${m}${a ? '＋APC' : 'のみ'}。`)); if (seen.size >= 4) nxt.disabled = false; };
    const nxt = ui.button(tr('Next', '次へ'), () => done(), { id: 'next' });
    nxt.disabled = seen.size < 4;
    ui.ctrl(ui.button('MI', pick('MI', false), { quiet: true, id: 'm-mi' }), ui.button(tr('MI + APC', 'MI＋APC'), pick('MI', true), { quiet: true, id: 'm-mia' }), ui.button('DCA', pick('DCA', false), { quiet: true, id: 'm-dca' }), ui.button(tr('DCA + APC', 'DCA＋APC'), pick('DCA', true), { quiet: true, id: 'm-dcaa' }), nxt);
  });
  method = 'DCA'; useApc = true;
  show();
  await run.line(tr('The two ideas work together. Still, not every square is blue. The orange ones are real results, kept here on purpose, and the next steps look at them.', '2つの考え方はいっしょに働く。それでも、すべてのマスが青くなるわけではない。オレンジのマスも本物の結果で、わざと残してあり、このあと詳しく見る。'));
}

const DEPTHS = [50, 100, 200, 400, 800, 1600, 2000];

async function depth(run) {
  const { ui, sound } = run, { f, w } = run.state;
  ui.reads([]);
  ui.tags('game');
  const q = run.scoped(new ContactQuilt(run, f, {}));
  frameBoard(run, f.L + 5, f.L + 5);
  await run.line(tr('How many sequences does this need? Take a guess: how many give 60% of the top pairs right?', 'これには何配列必要か。上位の組の60%が正解になるのは何配列からか、予想する。'));
  const c = chart(ui);
  const results = new Map();
  ui.tags('game');
  ui.say(tr('Drag the slider, and each stop reruns the whole inversion on that many real sequences.', 'スライダーを動かす。止めるたびに、その数の本物の配列で逆行列の計算をやり直す。'));
  const best = () => { let b = Infinity; for (const [n, v] of results) if (v >= 0.6 && n < b) b = n; return b; };
  const run1 = async (n) => {
    const y = compressColumns(f.X, n, f.L, 6), S = await run.budget(meanFieldDCA(y.Y, n, f.L, y.qi, w, 0.5));
    const sc = f.score(apc(S, f.L));
    q.guesses(sc.pairs, f.mapped >> 1);
    results.set(n, sc.half);
    sound.pick(DEPTHS.indexOf(n));
    c.draw(DEPTHS.map((d) => ({ value: results.get(d) ?? 0, label: `${d}`, text: results.has(d) ? pct(results.get(d)) : '', color: (results.get(d) ?? 0) >= 0.6 ? '#0053d6' : '#65cbf3' })), { line: 0.6, label: '60%' });
    ui.reads([{ value: pct(sc.half), label: tr(`right with ${n} sequences`, `${n}配列での正解率`) }]);
  };
  await run1(50);
  await run.until((done) => {
    const nxt = ui.button(tr('Next', '次へ'), () => done(), { id: 'next' });
    nxt.disabled = true;
    const s = ui.slider({ label: tr('Sequences', '配列数'), min: 0, max: DEPTHS.length - 1, step: 1, value: 0, format: (v) => DEPTHS[v], onDone: async (v) => { await run1(DEPTHS[v]); if (results.size >= 3 && Number.isFinite(best())) { nxt.disabled = false; } const at = DEPTHS.indexOf(best()); if (at > 0 && results.has(DEPTHS[at - 1])) run.reach(2); } });
    ui.ctrl(c, s, nxt);
    c.draw(DEPTHS.map((d) => ({ value: results.get(d) ?? 0, label: `${d}`, text: results.has(d) ? pct(results.get(d)) : '' })), { line: 0.6, label: '60%' });
  });
  ui.ctrl();
  ui.reads([]);
  await run.line(tr('This is one sample, and another can shift the bars by several points. With few sequences there are too few paired changes to see.', 'これは1つの標本であり、別の標本なら棒は数ポイントずれることがある。配列が少ないと、見える対の変化が少なすぎる。'));
  ui.tags('paper');
  await run.line(tr('AlphaFold2 also suffers with shallow alignments, but at far lower depth, below about 30 sequences.', 'AlphaFold2も浅いアラインメントでは精度が落ちるが、それははるかに浅い、約30配列を下回るあたりからである。'));
}

async function tree(run) {
  const { ui } = run;
  ambient(run);
  ui.tags('model', 'game');
  await run.line(tr('One more false signal. Sequences are relatives, so they share letters by descent, even at positions that have nothing to do with each other.', '偽の信号はもう1つある。配列は親戚どうしなので、互いに関係のない位置でも、祖先から受け継いだ文字を共有する。'));
  const stat = (g, q) => {
    const M = miMatrix(g.X, g.N, g.L, uniformWeights(g.N).w, 1e-3, q), A = apc(M, g.L);
    let v = 0, n = 0, top = 0, topA = 0;
    for (let i = 0; i < g.L; i += 1) for (let j = i + 1; j < g.L; j += 1) { v += M[i * g.L + j]; n += 1; top = Math.max(top, M[i * g.L + j]); topA = Math.max(topA, A[i * g.L + j]); }
    return { mean: v / n, top, topA };
  };
  const t = evolveTree({ leaves: 1024, L: 30, q: 8, rate: 0.1 }), s = evolveStar({ leaves: 1024, L: 30, q: 8, rate: 0.1, depth: 10 });
  const a = stat(t, 8), b = stat(s, 8), rw = reweight(t.X, t.N, t.L, 0.8);
  const c = stat({ ...t }, 8);
  run.state.treeStats = { a, b, c, meff: rw.meff };
  ui.reads([{ value: fmt(a.mean, 3), label: tr('mean link, sequences on a family tree', '結びつきの平均（系統樹上の配列）') }, { value: fmt(b.mean, 3), label: tr('mean link, sequences with no shared history', '結びつきの平均（共通の歴史がない配列）') }]);
  await run.line(tr('Here 1,024 made-up sequences evolved with every column on its own, so no pair is truly linked. On a family tree, links appear anyway.', 'ここでは1,024本の架空の配列を、各列が独立に変わるように進化させたので、本当に結びついた組はない。それでも系統樹の上では結びつきが現れる。'));
  ui.reads([{ value: fmt(a.top, 3), label: tr('strongest false link', '最も強い偽の結びつき') }, { value: fmt(a.topA, 3), label: tr('after APC', 'APCのあと') }]);
  await run.line(tr('APC removes the shared background, though not all of it. Family history is a real source of false links.', 'APCは共通の背景を取り除くが、すべてではない。ファミリーの歴史は、実際に偽の結びつきを生む。'));
  ui.reads([]);
}

async function misses(run) {
  const { ui } = run, { f, Y, qi, w } = run.state;
  ambient(run);
  const dca = run.state.dca ?? await run.budget(meanFieldDCA(Y, f.N, f.L, qi, w, 0.5));
  const sc = f.score(apc(dca, f.L)), k = f.mapped >> 1, wrong = sc.pairs.slice(0, k).filter(([, i, j]) => !f.touching(i, j));
  ui.tags('real', 'game');
  const eg = wrong[0], within5 = wrong.filter(([, i, j]) => f.atoms(i, j) < 5).length;
  const byAtoms = sc.pairs.slice(0, k).filter(([, i, j]) => f.atoms(i, j) < 8).length / k;
  ui.reads([{ value: pct(sc.half), label: tr('top pairs, C-beta within 8 Å', '上位の組、Cβが8 Å以内') }, { value: pct(byAtoms), label: tr('any heavy atoms within 8 Å (Morcos)', 'いずれかの重原子が8 Å以内（Morcos）') }]);
  await run.line(tr(`Look at the wrong ones. The first is ${name(f, eg[1])} with ${name(f, eg[2])}. Their C-beta atoms are ${fmt(f.D[eg[1] * f.L + eg[2]], 1)} Å apart, just over our line, yet the side chains touch at ${fmt(f.atoms(eg[1], eg[2]), 1)} Å in the active site.`, `外れた組を見る。最初の組は${name(f, eg[1])}と${name(f, eg[2])}である。Cβ原子は${fmt(f.D[eg[1] * f.L + eg[2]], 1)} Å離れていて線をわずかに超えるが、活性部位で側鎖どうしは${fmt(f.atoms(eg[1], eg[2]), 1)} Åで接触している。`));
  await run.line(tr(`${within5} of the ${wrong.length} have atoms within 5 Å. Others may be real contacts in another shape, or between two copies of the protein. These were not tested, and some may simply be noise.`, `${wrong.length}組のうち${within5}組は、原子が5 Å以内にある。ほかの組は、別の形での本物の接触や、タンパク質の2つのコピーの間の接触かもしれない。これらは検証しておらず、単なるノイズも含まれるかもしれない。`));
  ui.reads([]);
}

async function check(run) {
  const { ui } = run;
  ambient(run);
  ui.tags('model');
  const first = await run.choose(tr('A new case. In another family, X and Y correlate 0.60, Y and Z correlate 0.50, and X and Z correlate 0.30. Do X and Z need a contact of their own?', '新しい例である。別のファミリーで、XとYの相関は0.60、YとZは0.50、XとZは0.30だった。XとZには直接の接触が必要か。'), [
    { text: tr('Yes. 0.30 is a strong correlation.', '必要である。0.30は強い相関である。'), right: false, why: tr('Size alone cannot say. What would the X to Y to Z chain give on its own?', '大きさだけでは決まらない。XからY、Zへの連鎖だけで、どれくらいの相関になるか。') },
    { text: tr('No. The chain already explains it.', '必要ない。連鎖だけで説明できる。'), right: true, why: tr('Right. 0.60 × 0.50 = 0.30, exactly what a chain through Y gives with no direct link at all.', '正解。0.60 × 0.50 = 0.30で、直接の結びつきがなくても、Yを通る連鎖だけでちょうどこの値になる。') },
    { text: tr('Yes. X and Z share a friend.', '必要である。XとZには共通の友だちがいる。'), right: false, why: tr('A shared friend is the reason to doubt it, not a reason to believe it.', '共通の友だちがいることは、接触を疑う理由であって、信じる理由ではない。') },
  ]);
  const second = await run.choose(tr('Now a family with only 40 sequences has a strong top pair. What do you do?', '今度は40配列しかないファミリーで、最上位に強い組が出た。どうするか。'), [
    { text: tr('Trust it. Top pairs are usually right.', '信じる。上位の組はたいてい正しい。'), right: false, why: tr('That was true for this family at 2,000 sequences. Look at your bars at 50.', 'それは2,000配列でのこのファミリーの話である。50配列のときの棒を見る。') },
    { text: tr('Doubt it. With so few sequences, few paired changes can be seen.', '疑う。配列がこれほど少ないと、見える対の変化も少ない。'), right: true, why: tr('Yes. At 50 sequences far fewer top pairs were right than with the whole 2,000.', '正解。50配列では、2,000配列すべてを使うときより、正解した上位の組がずっと少なかった。') },
    { text: tr('Use mutual information instead.', '代わりに相互情報量を使う。'), right: false, why: tr('Mutual information is also starved by few sequences, and it adds indirect links.', '相互情報量も配列が少ないと同じように情報が足りなくなり、さらに間接の結びつきも加わる。') },
  ]);
  if (first && second) run.reach(3);
}
