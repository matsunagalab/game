// Chapter 4. Distances limit each other through triangles. First one real triangle in the hands, then a table of real
// distances where each move reads every pair through a third residue, which is the wiring of AlphaFold2's triangle updates.
import * as THREE from 'three';
import { Threads, STOCK } from '../world.js';
import { copyBounds, emptyBounds, fewestThirds, restrain, throughThird } from '../science/bounds.js';
import { vec } from '../science/frames.js';
import { getStructure } from '../science/data.js';
import { TOUCH, TRIANGLE, TRIANGLES as CASES } from '../science/cases.js';
import { Abort } from '../run.js';
import { fmt, PaperProtein, theFamily } from './common.js';
import { tr } from '../i18n.js';

const SCALE = 42; // The range bars run from 0 to this many angstroms.

const GOALS = tr(['Swing K119: how near E89, how far?', 'Prove N59 and K119 cannot touch: pick third residues.', 'Few moves: prove T37 and V46 of SH3 cannot touch.'], ['K119を振る。E89にどこまで近づき、どこまで離れるか。', 'N59とK119は接触できないと示す。第3の残基を選ぶ。', '少ない手数で、SH3のT37とV46は接触できないと示す。']);

export default {
  id: 'triangles',
  puzzle: true,
  place: [1],
  title: tr('Triangles', '三角形'),
  tease: tr('Two sides limit the third. Use that to prove what a real pair cannot do.', '2辺が決まると残りの1辺が限られる。これを使って、本物の組にできないことを示す。'),
  principle: tr('Two sides limit the third, so known distances constrain many others. AlphaFold2 lets every pair read its two other sides through every third residue. Its pair table has no inequality rule: training decides how they are used.', '2辺が分かれば残りの1辺が限られ、分かった距離が多くの距離をしばる。AlphaFold2では、すべてのペアが第3の残基ごとに残りの2辺を読む。ペア表現に不等式の規則はなく、2辺の使い方は訓練で決まる。'),
  goals: GOALS,
  note: tr(`<h3>Chapter note</h3>
    <p><b>Your move and AlphaFold2.</b> Tapping a third residue k lets every pair ij read sides ik and jk. That is the wiring of AF2's four triangle operations, in each of the 48 Evoformer blocks: multiplicative updates using outgoing and incoming edges (Algorithms 11 and 12), and attention around the starting and ending node (Algorithms 13 and 14), with 4 heads. Two things differ. AF2 does this for all k at once, not one at a time. And what a cell holds is not a range but learned numbers, 128 per pair, and each update is learned too.</p>
    <p><b>The four operations.</b> Outgoing edges read rows of the table and incoming edges read columns, because the pair table has a direction: cell ij need not equal cell ji. The multiplicative update sums over every k with no shared budget, and a normalising step and a learned gate follow the sum (g<sub>ij</sub> ⊙ Linear(LayerNorm(Σ<sub>k</sub> a<sub>ik</sub> ⊙ b<sub>jk</sub>)), Algorithms 11 and 12, line 4). Attention shares out a fixed 100% over k, steered in part by the third side, and then averages (Algorithm 13). So the first counts evidence from all third residues, and the second chooses whom to listen to.</p>
    <p><b>The ranges are the game's.</b> AF2 does not hold a ceiling and a floor, it does not compute a minimum, and it does not check the inequality. The paper says the updates are "inspired by the necessity of consistency" and arranged "in terms of triangles of edges". Whether the pair table obeys the inequality comes from training. The final coordinates obey it by geometry, as any points in space do. At the end of the network a separate head does read each pair as a distance distribution, 64 bins from 2.3 to 21.7 Å, and that is trained against real distances. The "axial attention" ablation, which removes triangles, pair bias and gating together, lowered lDDT-Cα by about 1 to 3 at most depths, read by eye from Supplementary Fig. 10.</p>
    <p><b>The sides here are real and given.</b> They are C-beta distances from the crystals 3CHY and 1SHG (C-alpha for glycine), chosen to make a puzzle. They are not what AF2 starts from: for a new protein it has no such table, though a template, when one exists, can supply some distances. Nothing here says that a false contact can usually be spotted this way: a simple count of triangle support did not separate true from false contacts on this family (AUC about 0.56 to 0.63, see README).</p>
    <p><b>The rule.</b> For any third residue k, U(i,j) ≤ U(i,k) + U(k,j), and L(i,j) ≥ L(i,k) − U(k,j). A cell starts with a floor of 3.2 Å, since two residues cannot overlap, and no ceiling. Taking every k once gives what the classic bound smoothing gives (Crippen; Dress and Havel), which chapter 8 uses on all 109 residues.</p>
    <p><b>The pairs.</b> E89 and K119, N59 and K119, and T37 and V46 of SH3 all score as strong by mutual information in chapter 1, and none touches in its crystal. They are 16.7, 18.4 and 18.8 Å apart.</p>
    <p class="small">Sources: Jumper et al., Nature 2021, main text and Supplement 1.6.5, 1.6.6, 1.9.8, 1.13. DeepMind alphafold model/config.py. Crippen 1977. Dress and Havel 1988.</p>`, `<h3>この章の注</h3>
    <p><b>手の動きとAlphaFold2。</b>第3の残基kをタップすると、すべての組ijが辺ikと辺jkを読む。これはAF2の4つの三角形の操作の配線と同じで、48個のEvoformerブロックのそれぞれで行われる。出ていく辺と入ってくる辺による乗算の更新（Algorithm 11、12）と、始点まわりと終点まわりのアテンション（Algorithm 13、14、ヘッドは4つ）である。違う点が2つある。AF2はkを1つずつではなく、すべて同時に扱う。またマスに入っているのは範囲ではなく学習された数値（1組あたり128個）で、更新のしかたも学習したものである。</p>
    <p><b>4つの操作。</b>ペア表現には向きがあり、マスijとマスjiは同じとは限らない。そのため、出ていく辺は表の行を、入ってくる辺は表の列を読む。乗算の更新はすべてのkについて足し合わせ、kの間で分け合う上限はない。和のあとには正規化と学習されたゲートが続く（g<sub>ij</sub> ⊙ Linear(LayerNorm(Σ<sub>k</sub> a<sub>ik</sub> ⊙ b<sub>jk</sub>))、Algorithm 11、12の4行目）。アテンションは合計100%をkに配分し、その配分には第3の辺も効き、そのあと平均をとる（Algorithm 13）。つまり前者はすべての第3の残基からの証拠を足し上げ、後者はどの残基に耳を傾けるかを選ぶ。</p>
    <p><b>範囲はゲームのものである。</b>AF2は上限と下限を持たず、最小値も計算せず、不等式も確かめない。論文には、この更新は「整合性の必要性に着想を得た（inspired by the necessity of consistency）」とあり、「辺の三角形によって（in terms of triangles of edges）」組み立てたとある。ペア表現が不等式に従うかどうかは訓練で決まる。最後に出る座標は、空間の点である以上、幾何から不等式に従う。ネットワークの最後では、別のヘッドが各ペアを距離の分布として読む。2.3〜21.7 Åの64個のビンで、本物の距離に対して訓練される。三角形、ペアのバイアス、ゲートをまとめて取り除く「軸方向アテンション（axial attention）」のアブレーションでは、多くの深さでlDDT-Cαが約1〜3下がった（Supplementary Fig. 10から目で読んだ値）。</p>
    <p><b>ここでの辺は本物で、与えられたものである。</b>結晶構造3CHYと1SHGのCβ距離（グリシンはCα）から、パズルになるように選んだ。AF2がこのような距離から始めるわけではない。新しいタンパク質にこのような表はなく、テンプレートがあるときに距離の一部が得られるだけである。誤った接触がふつうこの方法で見分けられる、と言っているわけではない。このファミリーでは、三角形の支持を単純に数えても、正しい接触と誤った接触は分かれなかった（AUC約0.56〜0.63、READMEを参照）。</p>
    <p><b>規則。</b>どの第3の残基kについても、U(i,j) ≤ U(i,k) + U(k,j)、L(i,j) ≥ L(i,k) − U(k,j)である。2つの残基は重なれないのでマスの下限は3.2 Åから始まり、上限はない。すべてのkを1回ずつ使うと、古典的な範囲の平滑化（bound smoothing、Crippen; Dress and Havel）と同じ結果になる。第8章では、これを109残基すべてに使う。</p>
    <p><b>使った組。</b>E89とK119、N59とK119、SH3のT37とV46は、第1章の相互情報量でいずれも強い組であり、どれもその結晶構造では接触していない。距離はそれぞれ16.7、18.4、18.8 Åである。</p>
    <p class="small">出典: Jumper et al., Nature 2021、本文とSupplement 1.6.5, 1.6.6, 1.9.8, 1.13。DeepMind alphafold model/config.py。Crippen 1977。Dress and Havel 1988。</p>`),

  setup(run) {
    run.world.shadowSpan(110);
    run.own({ dispose: () => run.world.shadowSpan(80) });
  },
  stages: [hands, table2, table3],
};

const ink = (world, color) => world.paper({ color, glow: 0.1, bump: 0.2, repeat: 0.3 });
function strip(run, w, d, h, color, shadow = true) {
  const m = run.scoped(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ink(run.world, color)));
  m.scale.set(w, h, d);
  m.castShadow = shadow; m.receiveShadow = true;
  run.world.scene.add(m);
  m.dispose = () => { run.world.scene.remove(m); m.geometry.dispose(); m.material.dispose(); };
  return m;
}
const name = (st, i) => `${st.seq[i]}${st.nums[i]}`;

// A strip laid between two points on the table.
function lay(m, a, b, y) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
  m.scale.x = Math.hypot(dx, dz);
  m.rotation.y = -Math.atan2(dz, dx);
}

async function hands(run) {
  const { ui, world, sound } = run, che = theFamily().che;
  const at = (n) => che.nums.indexOf(n), [A, K, B] = [at(TRIANGLE.far), at(TRIANGLE.hinge), at(TRIANGLE.end)];
  const a = vec.dist(che.cb[A], che.cb[K]), b = vec.dist(che.cb[K], che.cb[B]), real = vec.dist(che.cb[A], che.cb[B]);
  const lo = Math.abs(a - b), hi = a + b, S = 1.5, y = 0.7;
  const P = { A: [-14, 20], K: [-14 + a * S, 20] };
  run.level(GOALS[0], 0, 2);
  ui.tags('real', 'game');
  // The real residues, on the real protein, above the paper triangle.
  const compact = world.stage.h < world.stage.w * 1.5;
  const model = run.scoped(new PaperProtein(world, che, { stock: () => STOCK.good, scale: compact ? 0.44 : 0.7, center: [0, compact ? 9 : 14, compact ? -11 : -22], spin: 0.12, triangles: false }));
  const threads = run.scoped(new Threads(world, 4, { width: 0.42 }));
  const ring = run.scoped(new THREE.Mesh(new THREE.CircleGeometry(TOUCH * S, 48).rotateX(-Math.PI / 2), ink(world, '#ffd9c7')));
  ring.position.set(P.A[0], 0.1, P.A[1]);
  ring.receiveShadow = true;
  world.scene.add(ring);
  ring.dispose = () => { world.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); };
  const fixed = strip(run, 1, 2.2, 0.5, '#0053d6'), swing = strip(run, 1, 2.2, 0.5, '#0053d6'), third = strip(run, 1, 0.8, 0.3, '#ff7d45');
  lay(fixed, P.A, P.K, y);
  const disc = (color, r = 2.5) => {
    const m = run.scoped(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.7, 32), ink(world, color)));
    m.castShadow = true;
    world.scene.add(m);
    m.dispose = () => { world.scene.remove(m); m.geometry.dispose(); m.material.dispose(); };
    return m;
  };
  const dA = disc('#fffdf8'), dK = disc('#fffdf8'), dB = disc('#65cbf3', 3.3);
  dA.position.set(P.A[0], y + 0.5, P.A[1]);
  dK.position.set(P.K[0], y + 0.5, P.K[1]);
  const names = [ui.label(name(che, A)), ui.label(name(che, K)), ui.label(name(che, B), 'big')], len = ui.label('', 'big'), zoneName = ui.label(tr('touch zone', '接触の範囲'), 'col');
  // The ruler that the swing paints: the range of the third side.
  const X0 = -27, W = 54, Z = 36, toX = (d) => X0 + (Math.min(d, SCALE) / SCALE) * W;
  const track = strip(run, W, 2.2, 0.2, '#eee7d8', false), zone = strip(run, (TOUCH / SCALE) * W, 2.2, 0.26, '#ffb79a', false), swept = strip(run, 1, 2.2, 0.32, '#0053d6'), tick = strip(run, 0.5, 3.6, 0.6, '#26343f');
  track.position.set(X0 + W / 2, 0.3, Z);
  zone.position.set(X0 + ((TOUCH / SCALE) * W) / 2, 0.34, Z);
  const rule = ui.label(tr('third side, Å', '第3の辺（Å）'), 'col');
  const frame = (seconds = 0.6) => {
    const s = world.stage, tall = s.h > s.w * 0.92;
    if (tall) world.look({ target: [0, 0, compact ? 10 : 5.5], dist: world.fitDist(64, compact ? 66 : 88, 0.1), polar: 0.1, az: 0 }, seconds);
    else {
      model.center.set(-48, 14, 16);
      world.look({ target: [-5, 0, 17], dist: world.fitDist(124, 60, 0.1), polar: 0.1, az: 0 }, seconds);
    }
  };
  frame(0);
  run.onLayout = (s) => frame(s);
  let th = 2.3, seenLo = Infinity, seenHi = 0, got = 0, pulled = false;
  const dist = () => Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(th));
  const end = () => [P.K[0] + b * S * Math.cos(th), P.K[1] + b * S * Math.sin(th)];
  const pose = () => {
    const e = end(), d = dist();
    lay(swing, P.K, e, y + 0.1);
    lay(third, P.A, e, y - 0.15);
    dB.position.set(e[0], y + 0.6, e[1]);
    seenLo = Math.min(seenLo, d); seenHi = Math.max(seenHi, d);
    const l = toX(seenLo), r = toX(seenHi);
    swept.position.set((l + r) / 2, 0.4, Z); swept.scale.x = Math.max(0.5, r - l);
    tick.position.set(toX(d), 0.55, Z);
    world.shadowDirty = 2;
  };
  pose();
  run.tick(() => {
    threads.clear();
    threads.add(che.cb[A], che.cb[K], '#0053d6', 0.5, model.group);
    threads.add(che.cb[K], che.cb[B], '#0053d6', 0.5, model.group);
    threads.add(che.cb[A], che.cb[B], '#ff7d45', 0.4, model.group);
    const e = end();
    names[0].at(world.project([P.A[0], 1.4, P.A[1]]));
    names[1].at(world.project([P.K[0], 1.4, P.K[1] - 4]));
    names[2].at(world.project([e[0], 1.6, e[1] + 5]));
    len.at(world.project([(P.A[0] + e[0]) / 2, 1.4, (P.A[1] + e[1]) / 2 - 3.4]));
    len.set(`${fmt(dist(), 1)} Å`);
    rule.at(world.project([X0 + W / 2, 0.5, Z + 3.4]));
    zoneName.at(world.project([P.A[0], 0.5, P.A[1] - TOUCH * S * 0.62]));
  });
  run.probe = {
    ready: true,
    knob: () => world.project([end()[0], 1.6, end()[1]]),
    toward: (angle) => world.project([P.K[0] + b * S * Math.cos(angle), 1.6, P.K[1] + b * S * Math.sin(angle)]),
  };
  const NEAR = 1, FAR = 2, hit = () => (got & NEAR ? 1 : 0) + (got & FAR ? 1 : 0);
  const check = (done) => {
    const d = dist();
    if (!(got & NEAR) && d <= lo + 0.05) { got |= NEAR; sound.good(1); ui.feedback(tr(`Nearest ${fmt(lo, 1)} Å: ${fmt(a, 1)} − ${fmt(b, 1)}. It cannot touch.`, `最短${fmt(lo, 1)} Å（${fmt(a, 1)} − ${fmt(b, 1)}）。接触できない。`), 'good'); }
    if (!(got & FAR) && d >= hi - 0.05) { got |= FAR; sound.good(1); ui.feedback(tr(`Farthest ${fmt(hi, 1)} Å: ${fmt(a, 1)} + ${fmt(b, 1)}.`, `最長${fmt(hi, 1)} Å（${fmt(a, 1)} + ${fmt(b, 1)}）。`), 'good'); }
    ui.count(hit(), 2);
    if (got === (NEAR | FAR)) done();
  };
  await run.until((done) => {
    const off = run.board({
      at: (x, y2) => { const p = world.onPlane(x, y2, 1); if (!p) return null; const e = end(), g = Math.hypot(p.x - e[0], p.z - e[1]), o = Math.abs(Math.hypot(p.x - P.K[0], p.z - P.K[1]) - b * S); return g < 7 || o < 5 ? 'end' : null; },
      hover: (t) => { dB.scale.setScalar(t ? 1.14 : 1); world.shadowDirty = 2; },
      grab: () => { pulled = true; dB.scale.setScalar(1.14); sound.rustle(2, 0.03); },
      move: (_, x, y2) => {
        const p = world.onPlane(x, y2, 1);
        if (!p) return;
        th = Math.atan2(p.z - P.K[1], p.x - P.K[0]);
        // The ends of the swing pull the finger in, so that finding them never takes precision.
        if (Math.abs(Math.cos(th) + 1) < 0.02) th = Math.PI;
        if (Math.abs(Math.cos(th) - 1) < 0.02) th = 0;
        pose();
        sound.pick(Math.floor(dist() / 2));
        check(() => { off(); done(); });
      },
    });
    run.scoped({ dispose: off });
    run.scoped(run.idle(() => (pulled ? null : { from: () => run.probe.toward(th), to: () => run.probe.toward(th + 1.4) })));
  });
  // The real distance falls inside the range the player has just swept.
  const mark = strip(run, 0.6, 4.4, 0.7, '#ff7d45');
  mark.position.set(toX(real), 0.6, Z);
  const realLabel = ui.label(tr(`real ${fmt(real, 1)} Å`, `実際は${fmt(real, 1)} Å`), 'col');
  run.tick(() => realLabel.at(world.project([toX(real), 0.5, Z - 4])));
  await run.won(tr('Two sides limit the third.', '2辺で残りの1辺が限られる。'), 1, 2600);
}

// A half table of real residues. Each cell shows a range as a bar. The residues on the diagonal are the moves.
class TriMap {
  constructor(run, spec) {
    this.run = run;
    const { world, ui } = run, st = this.st = spec.key === 'che3' ? theFamily().che : getStructure(spec.key), nums = spec.nums, n = this.n = nums.length;
    this.idx = nums.map((v) => st.nums.indexOf(v));
    this.names = this.idx.map((i) => name(st, i));
    this.spec = spec;
    const D = (i, j) => vec.dist(st.cb[this.idx[i]], st.cb[this.idx[j]]);
    this.D = D;
    const b = this.b = emptyBounds(n);
    this.known = new Set();
    for (const [p, q] of spec.known) { const i = nums.indexOf(p), j = nums.indexOf(q), d = D(i, j); restrain(b, i, j, d, d); this.known.add(key(i, j)); }
    this.start = copyBounds(b);
    this.target = spec.pair.map((v) => nums.indexOf(v)).sort((x, y) => x - y);
    this.cell = 6;
    const cells = this.cells = [];
    for (let i = 0; i < n; i += 1) for (let j = i; j < n; j += 1) cells.push([i, j]);
    const c = this.cell, box = new THREE.BoxGeometry(c * 0.94, 0.5, c * 0.94), m = this.tiles = new THREE.InstancedMesh(box, world.paper({ glow: 0.1, bump: 0.25, repeat: 0.3 }), cells.length);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    const bar = new THREE.BoxGeometry(1, 0.2, 1), mk = (color) => { const q = new THREE.InstancedMesh(bar, world.paper({ color, glow: 0.1, bump: 0 }), cells.length); q.frustumCulled = false; return q; };
    this.track = mk('#eee7d8'); this.zone = mk('#ffb79a'); this.bar = mk('#0053d6');
    world.scene.add(m, this.track, this.zone, this.bar);
    this.lift = new Float32Array(cells.length); this.liftTo = new Float32Array(cells.length);
    this.fitLabels = () => ui.cellSize(Math.abs(world.project([this.x(1), 0.9, 0]).x - world.project([this.x(0), 0.9, 0]).x));
    this.lo = cells.map(([i, j]) => b.L[i * n + j]); this.hi = cells.map(([i, j]) => b.U[i * n + j]);
    this.labels = cells.map(([i, j]) => ui.label('', i === j ? 'res' : 'cell'));
    this.origin = [0, 0];
    this.tint();
    this.tick = (dt) => this.update(dt);
    run.tick(this.tick);
  }

  x(j) { return this.origin[0] + (j + 0.5 - this.n / 2) * this.cell; }
  z(i) { return this.origin[1] + (i + 0.5 - this.n / 2) * this.cell; }

  tint() {
    const white = new THREE.Color('#fffdf8'), known = new THREE.Color('#cfe8f5'), res = new THREE.Color('#65cbf3'), want = new THREE.Color('#ffe3d6');
    this.cells.forEach(([i, j], k) => {
      this.tiles.setColorAt(k, i === j ? res : i === this.target[0] && j === this.target[1] ? want : this.known.has(key(i, j)) ? known : white);
    });
    this.tiles.instanceColor.needsUpdate = true;
  }

  place() {
    const M = new THREE.Matrix4(), c = this.cell, n = this.cell * 0.82, H = 1.1, Z = c * 0.27, S = new THREE.Vector3(), Q = new THREE.Quaternion(), P = new THREE.Vector3();
    this.cells.forEach(([i, j], k) => {
      const x = this.x(j), z = this.z(i), y = 0.45 + this.lift[k];
      M.makeTranslation(x, y, z);
      this.tiles.setMatrixAt(k, M);
      const on = i !== j, L = x - n / 2, put = (mesh, from, to, h) => {
        S.set(on ? Math.max(0.15, ((to - from) / SCALE) * n) : 0.001, 1, H);
        P.set(L + (((from + to) / 2) / SCALE) * n, y + h, z + Z);
        mesh.setMatrixAt(k, M.compose(P, Q, S));
      };
      put(this.track, 0, SCALE, 0.28);
      put(this.zone, 0, TOUCH, 0.34);
      put(this.bar, Math.min(this.lo[k], SCALE), Math.min(this.hi[k], SCALE), 0.42);
    });
    for (const m of [this.tiles, this.track, this.zone, this.bar]) m.instanceMatrix.needsUpdate = true;
    this.run.world.shadowDirty = 2;
  }

  // Bars ease towards the true range, so that a move can be watched as it spreads.
  update(dt) {
    const { n, b, run } = this, f = Math.min(1, dt * 7);
    let moving = false;
    this.fitLabels();
    this.cells.forEach(([i, j], k) => {
      const lo = b.L[i * n + j], up = Math.min(b.U[i * n + j], SCALE * 1.2), hi = Math.min(this.hi[k], SCALE * 1.2);
      if (Math.abs(lo - this.lo[k]) > 0.02) { this.lo[k] += (lo - this.lo[k]) * f; moving = true; } else this.lo[k] = lo;
      if (Math.abs(up - hi) > 0.02) { this.hi[k] = hi + (up - hi) * f; moving = true; } else this.hi[k] = up;
      const l = this.liftTo[k] - this.lift[k];
      if (Math.abs(l) > 0.01) { this.lift[k] += l * Math.min(1, dt * 11); moving = true; } else this.lift[k] = this.liftTo[k];
      const p = run.world.project([this.x(j), 0.9, this.z(i) - (i === j ? 0 : this.cell * 0.11)]);
      this.labels[k].at(p);
    });
    if (moving) this.place();
  }

  text() {
    const { n, b } = this;
    this.cells.forEach(([i, j], k) => {
      if (i === j) { this.labels[k].set(this.names[i]); return; }
      const u = b.U[i * n + j], l = b.L[i * n + j];
      this.labels[k].set(this.known.has(key(i, j)) ? `<b>${l.toFixed(1)}</b>` : Number.isFinite(u) ? `${l.toFixed(0)}–${u.toFixed(0)}` : l > 3.3 ? `≥${l.toFixed(0)}` : '?');
    });
  }

  raise(cells) { this.liftTo.fill(0); for (const [i, j] of cells) { const k = this.cells.findIndex(([a, c]) => a === Math.min(i, j) && c === Math.max(i, j)); if (k >= 0) this.liftTo[k] = 1.6; } }
  floor() { const [i, j] = this.target; return this.b.L[i * this.n + j]; }
  ceiling() { const [i, j] = this.target; return this.b.U[i * this.n + j]; }
  solved(b = this.b) { const [i, j] = this.target; return b.L[i * this.n + j] > TOUCH; }
  reset() { this.b = copyBounds(this.start); this.text(); }
  // The diagonal cell under a screen point, or null.
  residueAt(x, y) {
    const p = this.run.world.onPlane(x, y, 0.8);
    if (!p) return null;
    const j = Math.floor((p.x - this.origin[0]) / this.cell + this.n / 2), i = Math.floor((p.z - this.origin[1]) / this.cell + this.n / 2);
    return i === j && i >= 0 && i < this.n ? i : null;
  }

  dispose() {
    const { world } = this.run;
    world.scene.remove(this.tiles, this.track, this.zone, this.bar);
    for (const m of [this.tiles, this.track, this.zone, this.bar]) { m.dispose?.(); m.material.dispose(); }
    this.tiles.geometry.dispose(); this.track.geometry.dispose();
    world.ticks.delete(this.tick);
    world.shadowDirty = 3;
  }
}
const key = (i, j) => `${Math.min(i, j)},${Math.max(i, j)}`;

function setUp(run, spec, goal) {
  const { world } = run, t = run.scoped(new TriMap(run, spec)), { n, st } = t, base = spec.key === 'che3' ? 0.5 : 0.64;
  const model = run.scoped(new PaperProtein(world, st, { stock: () => STOCK.good, scale: base, center: [0, 11, 0], spin: 0.12, triangles: false }));
  const threads = run.scoped(new Threads(world, 16, { width: 0.4 }));
  run.level(goal);
  const frame = (seconds = 0.6) => {
    const s = world.stage, tall = s.h > s.w * 0.92, side = n * t.cell;
    t.origin = [0, 0];
    if (tall) {
      const free = Math.max(0, (s.h / s.w) * (side + 1.5) - side - 1.5);
      model.scale = base * (free < side * 0.3 ? 0.72 : 1);
      model.center.set(-side * 0.25, free < side * 0.3 ? 8 : 11, side * 0.2 + free * 0.34);
      world.look({ target: [0, 0, free / 2], dist: world.fitDist(side + 1.5, side + free + 1.5, 0.1), polar: 0.1, az: 0 }, seconds);
    } else {
      // The table stays clear of the card: it is fitted to the room to the left of it.
      const room = Math.min(s.w, run.ui.card$.getBoundingClientRect().left - s.x - 12), span = side + 2, ppu = Math.min(room / span, s.h / span);
      model.scale = base;
      model.center.set(-side * 0.2, 8, side * 0.2);
      world.look({ target: [(s.w - room) / 2 / ppu, 0, 0], dist: world.fitDist(s.w / ppu, s.h / ppu, 0.1), polar: 0.1, az: 0 }, seconds);
    }
    t.place();
  };
  frame(0);
  run.onLayout = (s) => frame(s);
  t.text();
  t.place();
  const sides = spec.known.map(([p, q]) => [st.nums.indexOf(p), st.nums.indexOf(q)]), [I, J] = spec.pair.map((v) => st.nums.indexOf(v));
  t.extra = [];
  run.tick(() => {
    threads.clear();
    for (const [p, q] of sides) threads.add(st.cb[p], st.cb[q], '#0053d6', 0.36, model.group);
    for (const [p, q, c] of t.extra) threads.add(st.cb[p], st.cb[q], c, 0.4, model.group);
    threads.add(st.cb[I], st.cb[J], '#ff7d45', 0.42, model.group);
  });
  const name2 = run.ui.label(tr('pair table', 'ペアの表'), 'col');
  run.tick(() => name2.at(world.project([t.x(0) - t.cell * 0.05, 0.9, t.z(1) + t.cell * 0.12])));
  run.probe = { ready: true, residue: (k) => world.project([t.x(k), 0.9, t.z(k)]), n, best: () => fewestThirds(t.start, (b) => t.solved(b), { most: 5 }), solved: () => t.solved() };
  const [a, c] = t.target, m = run.ui.meter({ label: tr(`least possible, ${t.names[a]} to ${t.names[c]}`, `${t.names[a]}と${t.names[c]}の距離の下限`), max: 24, mark: TOUCH });
  t.showFloor = () => { m.set(t.floor(), `${fmt(t.floor(), 1)} Å`, t.solved()); run.sound.setOpening(0.3 + Math.min(0.7, (t.floor() / 12) * 0.7)); };
  t.showFloor();
  return t;
}

// One move. Returns true if anything changed.
function read(run, t, k) {
  const { sound } = run, changed = throughThird(t.b, k);
  t.raise(t.cells.filter(([i, j]) => (i === k || j === k) && i !== j));
  setTimeout(() => { if (run.alive) { t.raise([]); t.text(); } }, 520);
  sound.fold();
  sound.rustle(3, 0.03);
  t.showFloor();
  return changed;
}

function moves(run, t, onMove, hint) {
  const { sound } = run;
  return run.until((done) => {
    const show = (k) => { if (hint) { if (k === null) t.raise([]); else { const [i, j] = t.target; t.raise([[k, k], [i, k], [j, k]]); } } };
    const go = (k) => { t.raise([]); if (onMove(k)) { off(); idle.dispose(); done(); } };
    const off = run.board({
      cursor: 'pointer',
      at: (x, y) => t.residueAt(x, y),
      hover: (k) => show(k),
      grab: (k) => { show(k); sound.pick(k); },
      drop: (k) => go(k),
      tap: (k) => go(k),
    });
    const idle = run.idle(() => { const k = (t.target[0] + 1) % t.n; return { from: () => run.probe.residue(k) }; });
    run.scoped(idle);
  });
}

async function table2(run) {
  const { ui } = run, t = setUp(run, CASES[0], GOALS[1]), best = fewestThirds(t.start, (b) => t.solved(b), { most: 5 }).length;
  let used = 0;
  // The distances are real. A table of ranges is this game's, and AlphaFold2 holds no such thing.
  ui.tags('real', 'game', 'model');
  ui.count(tr(`${used} moves`, `${used}手`));
  await moves(run, t, (k) => {
    const before = t.floor(), changed = read(run, t, k), after = t.floor();
    used += 1;
    ui.count(tr(`${used} ${used === 1 ? 'move' : 'moves'}`, `${used}手`));
    if (t.solved()) return true;
    if (!changed) ui.feedback(tr('Nothing new.', '新しいことは分からない。'), 'bad');
    else if (after > before + 0.01) ui.feedback('');
    else ui.feedback(tr('Other pairs tightened. Which one helps?', '別の組の範囲が狭まった。どれが役に立つか。'));
    return false;
  }, true);
  await run.sleep(560);
  t.text();
  ui.tags('real', 'game', 'model', 'paper');
  await run.won([tr(`They cannot touch: ${used} moves (best ${best}).`, `接触できない。${used}手（最短${best}手）。`), tr('In AF2 each pair reads two sides, for every third residue.', 'AF2では各ペアが第3の残基ごとに2辺を読む。')], 2, 2400);
}

async function table3(run) {
  const { ui } = run, t = setUp(run, CASES[1], GOALS[2]), budget = fewestThirds(t.start, (b) => t.solved(b), { most: 5 }).length;
  ui.tags('real', 'game', 'model');
  let left = budget, fails = 0, wait = null;
  const moved = () => ui.count(tr(`${left} left`, `あと${left}手`));
  moved();
  run.probe.budget = budget;
  for (;;) {
    const solved = await moves(run, t, (k) => {
      read(run, t, k);
      left -= 1;
      moved();
      if (t.solved()) { wait = true; return true; }
      if (left === 0) { wait = false; return true; }
      return false;
    }, false).then(() => wait);
    if (solved) break;
    fails += 1;
    ui.feedback(tr(`The floor stopped at ${fmt(t.floor(), 1)} Å. Start again.`, `下限は${fmt(t.floor(), 1)} Åで止まった。やり直す。`), 'bad');
    run.sound.soft();
    await run.pause(1300);
    if (fails >= 2 && await giveUp(run, t, budget)) return;
    t.reset();
    left = budget;
    moved();
  }
  await run.sleep(560);
  t.text();
  await run.won(tr(`Really ${fmt(t.D(t.target[0], t.target[1]), 1)} Å apart.`, `実際の距離は${fmt(t.D(t.target[0], t.target[1]), 1)} Åである。`), 3, 2600);
}

// Never locked: after two tries the answer is on offer, without the crane.
function giveUp(run, t) {
  const { ui } = run;
  return run.until((done) => {
    ui.ctrl(ui.button(tr('Show me', '答えを見る'), async () => {
      ui.ctrl();
      t.reset();
      try {
        for (const k of fewestThirds(t.start, (b) => t.solved(b), { most: 5 })) {
          t.raise([[k, k]]);
          read(run, t, k);
          ui.feedback(tr(`Through ${t.names[k]}.`, `${t.names[k]}を通す。`));
          await run.sleep(900);
        }
        t.text();
        await run.pause(1800);
        done(true);
      } catch (e) { if (!(e instanceof Abort)) throw e; }
    }, { quiet: true, id: 'show' }), ui.button(tr('Try again', 'もう一度'), () => { ui.ctrl(); done(false); }, { id: 'again' }));
  });
}
