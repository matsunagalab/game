// Chapter 6. The real attention formula of Algorithm 22, on real frames, with live numerical checks of invariance.
import * as THREE from 'three';
import { Flock, STOCK, Threads } from '../world.js';
import { apply, applyInverse, framesOf, moveFrames, movePoints, rotationAxisAngle } from '../science/frames.js';
import { ipaWeights, maxChange, rawWeights } from '../science/ipa.js';
import { ambient, fmt, frameBoard, theFamily } from './common.js';
import { tr } from '../i18n.js';

const GAMMA = 34;
const LIFT = 22;

export default {
  id: 'ipa',
  title: tr('Invariant point attention', 'IPA'),
  tease: tr('Aim attention with a point in space, then turn the whole molecule and see the numbers refuse to change.', '空間の点でアテンションの向きを決める。分子全体を回しても数値が変わらないことを確かめる。'),
  principle: tr('A rotated protein is the same protein, and invariant point attention is built to give the same answer in any orientation. Its attention reads the molecule\'s geometry only through distances between points placed in each residue\'s own frame, and those survive any rotation, so the update turns with the molecule. DeepMind found this helpful but not essential.', '回転したタンパク質も同じタンパク質であり、invariant point attention（IPA）はどの向きでも同じ答えを出すようにつくられている。そのアテンションは、各残基のフレームに置いた点どうしの距離を通してだけ分子の幾何を読む。距離はどんな回転でも変わらないので、更新は分子といっしょに回る。DeepMindは、これは役に立つが不可欠ではないと結論した。'),
  goals: [tr('Aim attention at three residues.', '3つの残基にアテンションを向ける。'), tr('Say correctly what survives a turn.', '回転で変わらないものを正しく答える。'), tr('Get the new case right first time, answer and reason.', '新しい例で、答えと理由の両方を1回で正解する。')],
  note: tr(`<h3>Chapter note</h3>
    <p><b>The formula here</b> is Algorithm 22, line 7: a<sub>ij</sub> = softmax<sub>j</sub>( w<sub>L</sub>( b<sub>ij</sub> − (γ w<sub>C</sub>/2) Σ<sub>p</sub> |T<sub>i</sub>∘q<sub>ip</sub> − T<sub>j</sub>∘k<sub>jp</sub>|² ) ), with w<sub>C</sub> = √(2/(9N<sub>q</sub>)), w<sub>L</sub> = √(1/3), and points in nanometres. The scalar query-key term is left out.</p>
    <p><b>Real sizes.</b> IPA has 12 heads, each with 16-dimensional scalar queries and values, 4 query points and 8 value points (Algorithm 22; config.py). Points are predicted by the network. Here you place one, and each residue's key point sits at its Cα. The γ of each head is learned. It is set to ${GAMMA} here so that attention is sharp enough to see.</p>
    <p><b>Why it is invariant.</b> Under a global rigid motion, T<sub>global</sub> cancels in the distance, and it cancels again when the value points are brought back into frame i (Supplement equations 3 to 6). So the update in local frames is unchanged, and the resulting structure moves with the molecule. That is <b>equivariance</b>.</p>
    <p><b>Rigid motion</b> here means rotation and translation, not reflection. IPA is not invariant to a mirror.</p>
    <p><b>How much it matters.</b> The authors write that "equivariance in the network is not essential", because the single ablation of IPA "is still a very accurate structure prediction network", and they call that a surprise (Supplement 1.13.3). That ablation predicts frames by one linear projection of the single representation, with no iteration inside the module. Recycling stays on, so predicted C-beta distances still reach the pair table between passes. But removing IPA and recycling together cost much more than removing recycling alone: about 8 in lDDT-Cα at its worst, by eye from Supplementary Fig. 10, and the authors warn this "must be interpreted with caution". The main paper's stated aim for IPA is different from symmetry alone: it says the module can "implicitly reason about the unrepresented side-chain atoms".</p>
    <p class="small">Sources: Jumper et al., Nature 2021, Supplement 1.8.2 and 1.13.3. alphafold/model/folding.py.</p>`, `<h3>この章の注</h3>
    <p><b>ここでの式</b>はAlgorithm 22の7行目である。a<sub>ij</sub> = softmax<sub>j</sub>( w<sub>L</sub>( b<sub>ij</sub> − (γ w<sub>C</sub>/2) Σ<sub>p</sub> |T<sub>i</sub>∘q<sub>ip</sub> − T<sub>j</sub>∘k<sub>jp</sub>|² ) )で、w<sub>C</sub> = √(2/(9N<sub>q</sub>))、w<sub>L</sub> = √(1/3)であり、点の単位はナノメートルである。スカラーのquery-keyの項は省いている。</p>
    <p><b>実際の大きさ。</b>IPAのヘッドは12個で、それぞれ16次元のスカラーのクエリと値、4つのクエリ点、8つの値の点を持つ（Algorithm 22、config.py）。点はネットワークが予測する。ここでは1つを自分で置き、各残基のキー点はCαにある。各ヘッドのγは学習される値で、ここではアテンションが見えるほど鋭くなるように${GAMMA}にしている。</p>
    <p><b>不変である理由。</b>全体の剛体運動のもとでは、T<sub>global</sub>は距離の中で打ち消され、値の点をフレームiに戻すときにもう一度打ち消される（Supplementの式3〜6）。そのため局所フレームでの更新は変わらず、できる構造は分子といっしょに動く。これが<b>同変性</b>（equivariance）である。</p>
    <p>ここでの<b>剛体運動</b>は回転と並進のことで、鏡映は含まない。IPAは鏡像に対しては不変ではない。</p>
    <p><b>どれほど重要か。</b>著者らは「ネットワークの同変性は不可欠ではない（equivariance in the network is not essential）」と書いている。IPAだけを取り除いても「依然として非常に精度の高い構造予測ネットワークである（is still a very accurate structure prediction network）」からで、それを驚きと呼んでいる（Supplement 1.13.3）。このアブレーションは、シングル表現の1回の線形射影でフレームを予測し、モジュール内の反復はない。リサイクリングは残るので、予測したCβ距離はパスの間にペアの表に届く。しかしIPAとリサイクリングを同時に取り除くと、リサイクリングだけを取り除く場合よりはるかに大きな損失になった。lDDT-Cαで最悪約8で（Supplementary Fig. 10から目で読んだ値）、著者らは「慎重に解釈しなければならない（must be interpreted with caution）」と注意している。本論文が述べるIPAの目的は、対称性だけではない。このモジュールは「表現されていない側鎖原子について暗黙に推論できる（implicitly reason about the unrepresented side-chain atoms）」としている。</p>
    <p class="small">出典: Jumper et al., Nature 2021、Supplement 1.8.2, 1.13.3。alphafold/model/folding.py。</p>`),

  setup(run) {
    const f = run.state.f = theFamily(), che = f.che, n = che.ca.length, mean = [0, 0, 0];
    for (const p of che.ca) { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; }
    run.state.frames = che.frames.map((T) => ({ R: T.R, t: [T.t[0] - mean[0], T.t[1] - mean[1], T.t[2] - mean[2]] }));
    run.state.ca = run.state.frames.map((T) => T.t);
    run.state.keys = run.state.frames.map(() => [[0, 0, 0]]);
    run.state.who = (i) => `${che.seq[i]}${che.nums[i]}`;
  },
  stages: [aim, turn, sort, mirror, check],
};

function scene(run) {
  const { world } = run, { f, frames } = run.state, n = frames.length;
  const flock = run.scoped(new Flock(world, n, f.shape, { size: 1.8 }));
  const pale = new THREE.Color('#a9cbdc');
  flock.paint(() => pale);
  const pose = { spin: new THREE.Quaternion(), group: new THREE.Matrix4() };
  const place = () => {
    pose.group.compose(new THREE.Vector3(0, LIFT, 0), pose.spin, new THREE.Vector3(1.05, 1.05, 1.05));
    frames.forEach((T, i) => flock.place(i, T.R, T.t, pose.group));
    flock.commit();
  };
  place();
  frameBoard(run, 58, 62, { polar: 0.18, at: [0, LIFT - 6, 0], seconds: 0 });
  world.shadowSpan(70);
  run.scoped({ dispose: () => world.shadowSpan(80) });
  const paint = (w, base = pale) => {
    const top = Math.max(...w), c = new THREE.Color();
    flock.paint((i) => c.copy(base).lerp(STOCK.high, Math.min(1, (w[i] / top) ** 0.7)).clone());
  };
  return { flock, pose, place, paint };
}

async function aim(run) {
  const { ui, world, sound } = run, { frames, keys, who } = run.state, n = frames.length;
  const s = scene(run);
  const i = run.state.frames.length > 50 ? 50 : 0;
  s.flock.mesh.setColorAt(i, STOCK.poor);
  ui.tags('real', 'game');
  ui.reads([]);
  await run.line(tr('Chapter 3 gave attention: a share of 100% spread over other residues. Here it gets a new way to choose, using positions in space.', '第3章のアテンションは、100%を他の残基に配分するものだった。ここでは、空間の位置を使う新しい選び方が加わる。'));
  const groupInv = () => s.pose.group.clone().invert();
  let q = [6, 2, 3];
  const dot = run.scoped(new Threads(world, 2, { width: 0.5 }));
  const update = () => {
    const w = ipaWeights(frames, i, [q], keys, { gamma: GAMMA });
    s.paint(w);
    s.flock.mesh.setColorAt(i, STOCK.poor);
    s.flock.mesh.instanceColor.needsUpdate = true;
    dot.clear();
    const g = apply(frames[i], q);
    dot.add(frames[i].t, g, '#ff7d45', 0.5, s.pose.group);
    world.shadowDirty = 1;
    return w;
  };
  await run.line(tr(`The orange triangle is residue ${who(i)}. It places one <b>query point</b> near itself, in its own frame. Each other residue offers a <b>key point</b>. Close points earn more attention.`, `オレンジの三角形は残基${who(i)}である。これは自分のフレームの中で、近くに<b>クエリ点</b>（query point）を1つ置く。他の各残基は<b>キー点</b>（key point）を差し出す。点どうしが近いほど多くのアテンションを得る。`));
  const targets = [15, 70, 100].filter((t) => t < n);
  let hit = 0;
  const lab = run.scoped(ui.label('', 'big'));
  run.scoped({ dispose: () => lab.remove() });
  const pos = (t) => new THREE.Vector3(...frames[t].t).applyMatrix4(s.pose.group);
  run.tick(() => { if (hit < targets.length) lab.at(world.project(pos(targets[hit]))); else lab.el.style.display = 'none'; });
  const prompt = () => { lab.set(who(targets[hit])); ui.say(tr(`Drag anywhere to move the query point, and give ${who(targets[hit])} the biggest share.`, `どこでもドラッグしてクエリ点を動かし、${who(targets[hit])}に最大の配分を与える。`)); };
  prompt();
  run.probe.target = () => world.project(pos(targets[Math.min(hit, targets.length - 1)]));
  await run.until((done) => {
    const at = (x, y) => {
      const c = pos(targets[hit]), p = world.onPlane(x, y, c.y);
      if (!p) return;
      const local = p.applyMatrix4(groupInv()).toArray();
      q = applyInverse(frames[i], local);
      const w = update();
      sound.pick(Math.floor(q[0] + 30) % 6);
      const best = w.indexOf(Math.max(...w));
      ui.reads([{ value: `${fmt(w[targets[hit]] * 100, 1)}%`, label: tr(`share to ${who(targets[hit])}`, `${who(targets[hit])}への配分`) }, { value: who(best), label: tr('gets the most', '最大の配分を得た残基') }]);
      return best === targets[hit];
    };
    const off = run.pointer({ down: at, move: at, up: (x, y) => { if (at(x, y)) { sound.fold(); hit += 1; if (hit === targets.length) { off(); done(); } else prompt(); } } });
  });
  run.reach(1);
  ui.tags('paper');
  await run.line(tr('You aimed attention through space. In AlphaFold2 the network itself places these points, many at once, and adds them to the attention you met in chapter 3. This is <b>invariant point attention</b>, or IPA.', '空間を通してアテンションの向きを決めた。AlphaFold2では、ネットワーク自身がこの点を一度に多数置き、第3章のアテンションに加える。これが<b>IPA</b>（invariant point attention）である。'));
  run.state.q = q;
  run.state.i = i;
}

async function turn(run) {
  const { ui, world, sound } = run, { frames, keys, ca, who } = run.state, n = frames.length;
  const s = scene(run), i = run.state.i ?? 50, q = run.state.q ?? [6, 2, 3];
  const w0 = ipaWeights(frames, i, [q], keys, { gamma: GAMMA }), rawBase = rawWeights(ca, i);
  s.paint(w0);
  ui.tags('game');
  ui.reads([]);
  let useRaw = false;
  let angle = 0, axis = [0.3, 1, 0.2];
  const q3 = new THREE.Quaternion();
  const update = () => {
    const R = rotationAxisAngle(axis, angle), T = { R, t: [13, -7, 21] };
    const fr = moveFrames(frames, T), pts = movePoints(ca, T);
    const a = ipaWeights(fr, i, [q], keys, { gamma: GAMMA }), b = rawWeights(pts, i);
    const dI = maxChange(a, w0), dR = maxChange(b, rawBase);
    q3.setFromAxisAngle(new THREE.Vector3(...axis).normalize(), angle);
    s.pose.spin.copy(q3);
    s.place();
    s.paint(useRaw ? b : a);
    world.shadowDirty = 1;
    ui.reads([{ value: useRaw ? fmt(dR, 3) : dI.toExponential(1), label: tr(`largest change in any share, ${useRaw ? 'raw coordinates' : 'IPA'}`, `配分の変化の最大値（${useRaw ? '生の座標' : 'IPA'}）`) }, { value: `${Math.round((angle * 180) / Math.PI) % 360}°`, label: tr('turned', '回転角') }]);
    run.state.turned = { dI, dR };
  };
  update();
  await run.line(tr('Now turn the whole molecule. Each share of attention gets recomputed from scratch, from the turned coordinates.', '分子全体を回す。アテンションの配分は、回した座標から一から計算し直す。'));
  ui.say(tr('Drag to turn, then try a simple rule that scores residues on raw x and y coordinates.', 'ドラッグして回す。次に、生のx座標とy座標で残基を採点する単純な規則を試す。'));
  let tried = false, turned = 0;
  await run.until((done) => {
    const nxt = ui.button(tr('Next', '次へ'), () => done(), { id: 'next' });
    nxt.disabled = true;
    const tog = ui.button(tr('Use raw coordinates', '生の座標を使う'), (b) => { useRaw = !useRaw; tried = true; b.textContent = useRaw ? tr('Use IPA', 'IPAを使う') : tr('Use raw coordinates', '生の座標を使う'); update(); }, { quiet: true, id: 'raw' });
    ui.ctrl(tog, nxt);
    let last = null;
    run.pointer({ down: (x, y) => { last = [x, y]; }, move: (x, y) => {
      if (!last) return;
      const dx = x - last[0], dy = y - last[1];
      last = [x, y];
      angle += (dx + dy) * 0.012;
      axis = [dy * 0.002 + 0.3, 1, 0.2];
      turned += Math.abs(dx) + Math.abs(dy);
      update();
      sound.rustle(1, 0.012);
      if (tried && turned > 120) nxt.disabled = false;
    } });
  });
  ui.ctrl();
  const t = run.state.turned;
  ui.reads([{ value: t.dI.toExponential(1), label: tr('IPA: change after turning', 'IPA：回転後の変化') }, { value: fmt(t.dR, 3), label: tr('raw coordinates: change after turning', '生の座標：回転後の変化') }]);
  await run.line(tr('With IPA the shares changed only by rounding error in the last digits of the arithmetic. With raw coordinates, turning the molecule changed the answer.', 'IPAでは、配分の変化は計算の末尾の桁の丸め誤差だけだった。生の座標では、分子を回すと答えが変わった。'));
  await run.line(tr('<b>Invariant</b> means unchanged. The shares are invariant to a turn. The move each residue then makes turns along with the molecule, and that is called <b>equivariant</b>.', '<b>不変</b>（invariant）とは変わらないことである。配分は回転に対して不変である。そのあと各残基が行う動きは分子といっしょに回り、これを<b>同変</b>（equivariant）と呼ぶ。'));
  await run.line(tr('A rotated protein is the same protein, and IPA gives the same answer in any orientation, by construction.', '回転したタンパク質も同じタンパク質であり、IPAはつくりからして、どの向きでも同じ答えを出す。'));
  ui.tags('paper');
  await run.line(tr('Is that essential? DeepMind found it was not. With IPA removed, frames came straight from one linear layer, with no attention in the module, and the network stayed very accurate. They called that a surprise. It still received earlier predictions and templates in forms that do not depend on orientation. Where a module reads coordinates directly, this is a clean way to keep orientation from mattering.', 'これは不可欠なのか。DeepMindの結論は、不可欠ではないというものだった。IPAを取り除くと、フレームは1つの線形層から直接出てきて、モジュールにアテンションはなくなったが、ネットワークの精度は非常に高いままだった。著者らはこれを驚きと呼んだ。それでも、以前の予測やテンプレートは向きに依存しない形で受け取っていた。モジュールが座標を直接読む場合、これは向きの影響を受けないようにするきれいな方法である。'));
  ui.tags('game');
  await run.line(tr(`It works because distances do not care which way you hold the molecule, and each residue's points are carried along by its own frame. The trick is that ${who(i)}'s query point travels with ${who(i)}.`, `これがうまくいくのは、距離は分子の持ち方に左右されず、各残基の点は自分のフレームに運ばれるからである。要点は、${who(i)}のクエリ点が${who(i)}といっしょに動くことである。`));
}

async function sort(run) {
  const { ui, sound } = run, { frames, ca, who } = run.state;
  ambient(run);
  const a = 20, b = 80, T = { R: rotationAxisAngle([1, 2, -1], 1.1), t: [10, 5, -3] };
  const m = moveFrames(frames, T), p = movePoints(ca, T);
  const dist = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  const before = { x: ca[a][0], d: dist(ca[a], ca[b]), l: applyInverse(frames[a], ca[b]) };
  const after = { x: p[a][0], d: dist(p[a], p[b]), l: applyInverse(m[a], p[b]) };
  ui.reads([]);
  ui.tags('game');
  let right = 0;
  const cards = [
    { q: tr(`The x coordinate of ${who(a)}. Does it survive a turn?`, `${who(a)}のx座標。回転で変わらないか。`), stays: false, v: tr(`${fmt(before.x, 2)} became ${fmt(after.x, 2)}.`, `${fmt(before.x, 2)}が${fmt(after.x, 2)}になった。`) },
    { q: tr(`The distance from ${who(a)} to ${who(b)}. Does it survive a turn?`, `${who(a)}から${who(b)}までの距離。回転で変わらないか。`), stays: true, v: tr(`${fmt(before.d, 6)} stayed ${fmt(after.d, 6)}.`, `${fmt(before.d, 6)}は${fmt(after.d, 6)}のままだった。`) },
    { q: tr(`Where ${who(b)} sits as seen from the frame of ${who(a)}. Does it survive a turn?`, `${who(a)}のフレームから見た${who(b)}の位置。回転で変わらないか。`), stays: true, v: tr(`(${before.l.map((v) => v.toFixed(3)).join(', ')}) stayed (${after.l.map((v) => v.toFixed(3)).join(', ')}).`, `(${before.l.map((v) => v.toFixed(3)).join(', ')})は(${after.l.map((v) => v.toFixed(3)).join(', ')})のままだった。`) },
  ];
  for (const c of cards) {
    const ok = await run.choose(c.q, [
      { text: tr('It stays the same', '変わらない'), right: c.stays, why: c.stays ? tr(`Right. ${c.v}`, `正解。${c.v}`) : tr(`Not this one. ${c.v}`, `これは違う。${c.v}`) },
      { text: tr('It changes', '変わる'), right: !c.stays, why: !c.stays ? tr(`Right. ${c.v}`, `正解。${c.v}`) : tr(`Not this one. ${c.v}`, `これは違う。${c.v}`) },
    ]);
    if (ok) right += 1;
    sound.tap();
  }
  if (right === cards.length) run.reach(2);
  ui.reads([]);
  await run.line(tr('So the safe things to compute with are distances, and positions seen from a residue\'s own frame. IPA reads geometry only in these ways.', 'つまり、計算に安全に使えるのは、距離と、残基自身のフレームから見た位置である。IPAはこの2つの形でだけ幾何を読む。'));
}

async function mirror(run) {
  const { ui } = run, { frames, keys, f } = run.state, i = run.state.i ?? 50, q = run.state.q ?? [6, 2, 3], che = f.che;
  ambient(run);
  ui.tags('game');
  const w = (p) => p.map((x) => [-x[0], -x[1], -x[2]]);
  const F = framesOf({ n: w(che.n), ca: w(che.ca), c: w(che.c) });
  const a = ipaWeights(frames, i, [q], keys, { gamma: GAMMA }), b = ipaWeights(F, i, [q], keys, { gamma: GAMMA });
  ui.reads([{ value: maxChange(a, b).toFixed(3), label: tr('largest change in any share, through a mirror', '鏡を通したときの配分の変化の最大値') }]);
  await run.line(tr('A rotation changed nothing. A mirror is different: it changes the shares by far more than rounding error. Chapter 7 is about that.', '回転では何も変わらなかった。鏡は違い、丸め誤差をはるかに超えて配分を変える。これは第7章で扱う。'));
  ui.reads([]);
}

async function check(run) {
  const { ui } = run;
  ambient(run);
  ui.tags('model');
  const first = await run.choose(tr('A new case. A team adds each residue\'s height above the lab bench as an input to their network. What goes wrong?', '新しい例である。あるチームが、実験台からの各残基の高さをネットワークの入力に加えた。何が問題か。'), [
    { text: tr('Nothing. Height is real information.', '問題ない。高さは本物の情報である。'), right: false, why: tr('Height depends on how the molecule happens to be held, so it says nothing about the protein itself.', '高さはたまたま分子をどう持っているかで決まるので、タンパク質そのものについては何も言わない。') },
    { text: tr('Answers now depend on orientation, so the same protein can get different predictions.', '答えが向きに依存するようになり、同じタンパク質でも違う予測が出うる。'), right: true, why: tr('Right. It is like the raw x coordinate. Turning the molecule changes the input, and so the answer.', '正解。生のx座標と同じである。分子を回すと入力が変わり、答えも変わる。') },
    { text: tr('It would only slow the network down.', 'ネットワークが遅くなるだけである。'), right: false, why: tr('Speed is not the issue. The network loses its guarantee of treating every orientation alike.', '問題は速さではない。どの向きも同じように扱うという保証を失う。') },
  ]);
  const second = await run.choose(tr('Which pair of numbers could safely go into IPA instead?', '代わりにIPAに入れても安全な2つの数はどれか。'), [
    { text: tr('The distance between two residues, and each one\'s position in the other\'s frame.', '2つの残基の距離と、相手のフレームでの互いの位置。'), right: true, why: tr('Yes. Both survive any rotation and translation.', '正解。どちらもどんな回転と並進でも変わらない。') },
    { text: tr('The x coordinate and the y coordinate.', 'x座標とy座標。'), right: false, why: tr('Both change when you turn the molecule.', 'どちらも分子を回すと変わる。') },
    { text: tr('The direction of each residue\'s first axis, in lab coordinates.', '実験室の座標系での、各残基の第1軸の向き。'), right: false, why: tr('A direction in lab coordinates turns with the molecule. Only its relation to other frames is safe.', '実験室の座標系での向きは分子といっしょに回る。安全なのは他のフレームとの関係だけである。') },
  ]);
  if (first && second) run.reach(3);
}
