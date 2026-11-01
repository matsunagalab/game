// Chapter 10. What one confident model cannot say: a second real fold, the limits, and the last case.
import { ambient, fmt, getModel, getStructure, stockFrom } from './common.js';
import { rmsd } from '../science/metrics.js';
import { tr } from '../i18n.js';

export default {
  id: 'limits',
  title: tr('What one model cannot say', '1つのモデルに言えないこと'),
  tease: tr('A confident model is one structure, not the protein. Find where it stops.', '信頼度の高いモデルも1つの構造であり、タンパク質そのものではない。どこまで言えるかを見極める。'),
  principle: tr('A confident model is one structure, not the protein. It cannot say what other states exist, how often each occurs, what a mutation does, where a ligand sits or how the chain folds. pLDDT is a confidence, not a free energy.', '信頼度の高いモデルも1つの構造であり、タンパク質そのものではない。ほかにどんな状態があるか、それぞれがどれくらいの頻度で現れるか、変異が何を起こすか、リガンドがどこに結合するか、鎖がどう折りたたまれるかは言えない。pLDDTは信頼度であって、自由エネルギーではない。'),
  goals: [tr('See two real folds of one protein.', '1つのタンパク質の本物の2つのfoldを見る。'), tr('Say what a single model can and cannot answer.', '1つのモデルに答えられることと答えられないことを言う。'), tr('Get the final case right first time, answer and reason.', '最後の例で、答えと理由の両方を1回で正解する。')],
  note: tr(`<h3>Chapter note</h3>
    <p><b>Limits.</b> Mutations: AF2 is "largely unable to predict when a point mutation causes defective protein folding" in three case studies (Buel and Walters 2022), and dpLDDT against ddG gave r = −0.17 on 1,154 mutations (Pak et al. 2023). Ligands: not modelled, so for instance models lack heme and zinc (Hekkelman et al. 2023). Pathways: structure predictors did worse at folding questions than a classifier using chain length (Outeiral et al. 2022), though a later study argues AF2 learned some folding principles (Chang and Perez 2025). <b>Alternative states:</b> shallow random MSAs gave both conformations of eight membrane proteins, one of them only with templates. For four others, with one state already in AF2's training set, it never gave the other (del Alamo et al. 2022). Outside the training set, AF methods found both folds of only 1 of 7 fold switchers (Chakravarty et al. 2024). AF-Cluster clusters an MSA, and predicted KaiB states confirmed by NMR (Wayment-Steele et al. 2024). Whether coevolution or memorised sequence patterns drive this is contested (Chakravarty et al. 2024; Schafer et al. 2025; Wayment-Steele et al. 2025), and both sides agree pLDDT is not a free energy. In AF-Cluster's own KaiB models, the thermodynamically disfavoured fold-switched state had the higher pLDDT (Wayment-Steele et al. 2024). Across 92 fold switchers AF methods together found both folds in 32 (Chakravarty et al. 2024).</p>
    <p><b>Licences.</b> AlphaFold DB data is CC-BY-4.0: Jumper et al. 2021 and Varadi et al. 2022.</p>
    <p class="small">Sources as named above. KaiB 2QKE (Pattanayek et al. 2008) and 5JYT (Tseng et al. 2017). 5JYT carries five engineered mutations that stabilise the switched fold, so the two KaiB structures are not the same sequence.</p>`, `<h3>この章の注</h3>
    <p><b>限界。</b>変異について。AF2は3つの事例研究で「点変異がタンパク質の折りたたみ異常を起こすときを、ほとんど予測できなかった（largely unable to predict when a point mutation causes defective protein folding）」（Buel and Walters 2022）。dpLDDTとddGの相関は1,154変異でr = −0.17だった（Pak et al. 2023）。リガンドについて。モデル化しないので、たとえばヘムや亜鉛はモデルにない（Hekkelman et al. 2023）。折りたたみ経路について。構造予測器は折りたたみの問題で、鎖長を使う分類器より成績が悪かった（Outeiral et al. 2022）。ただし後の研究は、AF2が折りたたみの原理の一部を学習したと論じている（Chang and Perez 2025）。<b>別の状態について。</b>浅い無作為のMSAで8つの膜タンパク質の両方の立体配座が得られたが、そのうち1つはテンプレートを使ったときだけだった。片方の状態がすでにAF2の訓練セットにある別の4つでは、もう片方は一度も得られなかった（del Alamo et al. 2022）。訓練セットの外では、AFの方法が両方のfoldを見つけたのは7つのfold switcherのうち1つだけだった（Chakravarty et al. 2024）。AF-ClusterはMSAをクラスタリングする方法で、KaiBの状態を予測し、NMRで確認された（Wayment-Steele et al. 2024）。これを動かしているのが共進化か記憶された配列パターンかには議論があるが（Chakravarty et al. 2024; Schafer et al. 2025; Wayment-Steele et al. 2025）、pLDDTが自由エネルギーではないことはどちらの立場も認めている。AF-Cluster自身のKaiBモデルでは、熱力学的に不利なfold switch状態のほうがpLDDTが高かった（Wayment-Steele et al. 2024）。92のfold switcher全体では、AFの方法を合わせて32で両方のfoldを見つけた（Chakravarty et al. 2024）。</p>
    <p><b>ライセンス。</b>AlphaFold DBのデータはCC-BY-4.0である（Jumper et al. 2021、Varadi et al. 2022）。</p>
    <p class="small">出典は本文のとおり。KaiB 2QKE（Pattanayek et al. 2008）と5JYT（Tseng et al. 2017）。5JYTには切り替わったfoldを安定化する5つの人工変異が入っているので、2つのKaiB構造は同じ配列ではない。</p>`),

  stages: [kaib, limits, verdict],
};

async function kaib(run) {
  const { ui } = run;
  const k1 = getStructure('kai1'), k2 = getStructure('kai2');
  ambient(run, { st: k1 });
  const nums = k1.nums.filter((v) => v >= 52 && v <= 95 && k2.nums.includes(v));
  const a = nums.map((v) => k1.ca[k1.nums.indexOf(v)]), b = nums.map((v) => k2.ca[k2.nums.indexOf(v)]);
  ui.tags('real', 'game');
  ui.reads([{ value: `${fmt(rmsd(a, b), 1)} Å`, label: tr(`KaiB, two folds (the second from a stabilised mutant), ${nums.length} residues`, `KaiBの2つのfold（2つ目は安定化変異体）、${nums.length}残基`) }]);
  await run.line(tr('Adenylate kinase swings between states. KaiB, a clock protein, goes further: part of it has two different folds. A single predicted structure can show at most one of them at a time.', 'アデニル酸キナーゼは状態の間を揺れ動く。時計タンパク質のKaiBはさらに進んで、一部が2つの異なるfoldをとる。1つの予測構造が一度に示せるのは、多くてもそのうちの1つである。'));
  ui.tags('paper');
  await run.line(tr('Metastable states are where confidence misleads most. In models of KaiB, the fold that is thermodynamically disfavoured for the free protein had the higher pLDDT.', '信頼度が最も誤解を招くのは準安定状態である。KaiBのモデルでは、単独のタンパク質で熱力学的に不利なfoldのほうがpLDDTが高かった。'));
  await run.line(tr('pLDDT is not a free energy, and it cannot say how populated a state is.', 'pLDDTは自由エネルギーではなく、ある状態がどれくらい存在するかは言えない。'));
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
    [tr('Does this point mutation unfold the protein?', 'この点変異でタンパク質はほどけるか。'), false, tr('AF2 cannot tell. In case studies it kept the fold for mutants known to unfold, with pLDDT almost unchanged. Across 1,154 mutations, the change in pLDDT barely tracked stability, r = −0.17.', 'AF2には分からない。事例研究では、ほどけることが分かっている変異体でもfoldを保ったままで、pLDDTはほとんど変わらなかった。1,154の変異で、pLDDTの変化は安定性にほとんど連動しなかった（r = −0.17）。')],
    [tr('What does this domain look like, if pLDDT is 95?', 'pLDDTが95なら、このドメインはどんな形か。'), true, tr('Yes, as a confident model of one state. Above 90, the backbone and most side chains are typically right.', '答えられる。1つの状態についての信頼度の高いモデルとしてである。90を超えると、主鎖と側鎖の大部分はたいてい正しい。')],
    [tr('How long does this state live?', 'この状態はどれくらいの時間続くか。'), false, tr('The model has no time, temperature, or energy in it. For that you need experiments or simulation.', 'モデルの中に時間も温度もエネルギーもない。これには実験かシミュレーションが必要である。')],
  ];
  let right = 0;
  for (const [q, can, why] of cards) {
    const ok = await run.choose(tr(`Can a single AF2 model answer this? ${q}`, `1つのAF2モデルでこれに答えられるか。${q}`), [
      { text: tr('Yes', '答えられる'), right: can, why },
      { text: tr('No', '答えられない'), right: !can, why },
    ]);
    if (ok) right += 1;
  }
  run.state.limitsRight = right;
  if (right === cards.length) run.reach(2);
  await run.line(tr('Ligands and folding pathways are outside it too: AF2 places no ligands and does not simulate folding.', 'AF2はリガンドを置かず折りたたみをシミュレーションもしないので、リガンドと折りたたみ経路も範囲外である。'));
}

async function verdict(run) {
  const { ui } = run;
  const st = getModel('P69441');
  ambient(run, { st, stock: stockFrom(st) });
  ui.tags('model');
  ui.reads([]);
  await run.line(tr('A last case, in your own words if you like.', '最後の例を、よければ自分の言葉で考える。'));
  const a = await run.choose(tr('A colleague asks: will the mutation Y to A at an enzyme\'s pocket stop it folding? They ran AF2, and pLDDT did not change.', '同僚が尋ねる。酵素のポケットのYからAへの変異で、折りたたまれなくなるだろうか。AF2を実行すると、pLDDTは変わらなかった。'), [
    { text: tr('Good news: no change in pLDDT means no change in stability.', '良い知らせである。pLDDTが変わらないなら安定性も変わらない。'), right: false, why: tr('That is not what pLDDT measures. AF2 has been shown to miss destabilising mutations.', 'pLDDTが測っているのはそれではない。AF2は不安定化する変異を見逃すことが示されている。') },
    { text: tr('That result says little. AF2 is not validated for the effect of mutations.', 'その結果からはほとんど何も言えない。AF2は変異の効果について検証されていない。'), right: true, why: tr('Right. Test it with an experiment, or a method built for stability.', '正解。実験か、安定性のためにつくられた方法で確かめる。') },
    { text: tr('Rerun with more recycles to find out.', 'リサイクルを増やして実行し直せば分かる。'), right: false, why: tr('More passes cannot add a sense of stability that the model does not have.', 'パスを増やしても、モデルにない安定性の感覚は加わらない。') },
  ]);
  const b = await run.choose(tr('Two shallow samples of an alignment gave two different folds, one with mean pLDDT 88 and one with 74. The colleague says the first must be the more stable state. What do you say?', 'アラインメントの浅い標本2つから、異なる2つのfoldが得られた。pLDDTの平均は一方が88、もう一方が74である。同僚は、最初のほうが安定な状態に違いないと言う。どう答えるか。'), [
    { text: tr('Agreed. A higher pLDDT means a lower free energy.', '同意する。pLDDTが高いほど自由エネルギーは低い。'), right: false, why: tr('pLDDT is not a free energy. In models of KaiB, the disfavoured fold scored higher.', 'pLDDTは自由エネルギーではない。KaiBのモデルでは、不利なfoldのスコアのほうが高かった。') },
    { text: tr('The scores cannot rank them. Both folds need an experiment or a simulation.', 'スコアでは順位をつけられない。どちらのfoldにも実験かシミュレーションが必要である。'), right: true, why: tr('Right. Two folds are worth testing, but their pLDDT says nothing of how stable or populated each one is.', '正解。2つのfoldは調べる価値があるが、pLDDTはそれぞれの安定性や存在量について何も言わない。') },
    { text: tr('Only the first fold can be real.', '本物でありうるのは最初のfoldだけである。'), right: false, why: tr('KaiB has two real folds, so a lower score does not rule a fold out.', 'KaiBには本物のfoldが2つあるので、スコアが低くてもそのfoldは否定されない。') },
  ]);
  if (a && b) run.reach(3);
  await run.line(tr('You have now done it all by hand: read an alignment, found contacts, closed triangles, thrown a gas, turned a molecule, stood on a residue, and read the confidence.', 'これでアラインメントを読み、接触を見つけ、三角形を閉じ、ガスを投げ、分子を回し、残基の上に立ち、信頼度を読むことまで、すべてを手で行った。'));
  await run.line(tr('AlphaFold2 does none of these sums as such. It was built and trained so that it could use the same kinds of information. How it uses them is not fully known. Now you know some of what it can use, and what it cannot tell you.', 'AlphaFold2はこれらの計算をそのままの形では行っていない。同じ種類の情報を使えるようにつくられ、訓練された。その使い方はすべて分かっているわけではない。これで、AlphaFold2が何を使えるのか、そして何を教えてくれないのかの一部が分かった。'));
}
