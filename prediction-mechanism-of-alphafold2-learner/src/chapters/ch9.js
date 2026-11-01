// Chapter 9. Read AlphaFold2's real confidence by cutting the chain. pLDDT judges each stretch by itself. PAE is a table
// of "stand here, how far off is that?", so sliding along the chain stands on one residue after another.
import * as THREE from 'three';
import { plddtStock, ribbonGeometry, STOCK } from '../world.js';
import { alignedError, superpose } from '../science/metrics.js';
import { bestCuts, mapSums, pieceFit, trustFit, withinAcross } from '../science/pieces.js';
import { AKE_CORE } from '../science/cases.js';
import { Abort } from '../run.js';
import { fmt, getModel, getPAE, getStructure, PaperProtein, stockFrom } from './common.js';
import { tr } from '../i18n.js';

const SIDE = 56; // Size of the board on the table.
const NEAR = 0.8; // A fit this close to the best one counts: aim is never the difficulty.
const REACH = 14; // How many residues a cut may be from the best cut and still count, for a finger on a phone.
const GOALS = tr(['Cut off the stretches AF2 is not sure of.', 'Cut between parts AF2 cannot place relative to each other.', 'True error against a crystal, not PAE. Cut at the hinges.'], ['AF2が確信していない部分を切り離す。', 'AF2が互いの位置を決めきれない部分の間で、鎖を切る。', '結晶構造との真の誤差で、PAEではない。ヒンジで切る。']);

export default {
  id: 'trust',
  puzzle: true,
  place: [3],
  title: tr('Reading confidence', '信頼度を読む'),
  tease: tr('Cut real AlphaFold2 models where their own confidence says to.', 'AlphaFold2の実際のモデルを、その信頼度に従って切り分ける。'),
  principle: tr('pLDDT says how sure AlphaFold2 is of each local shape. PAE says which parts it can place relative to each other. Neither measures motion.', 'pLDDTは、局所の形をAlphaFold2がどれだけ確信しているかを示す。PAEは、どの部分どうしの相対位置を確信しているかを示す。どちらも動きは測らない。'),
  goals: GOALS,
  note: tr(`<h3>Chapter note</h3>
    <p><b>Your move and AlphaFold2.</b> AF2 gives a list and a table, and no cuts. Sliding along the chain is standing on residue i, which is how PAE is defined: the expected error at j when prediction and truth are aligned on residue i. Each row of the map is one such stand, and it is what recolours the model under your finger. Cutting is how people read those tables. AF2 does not do it, and the fit on the meter is this game's, computed here. It is the share of the map's variance kept when each block of the map is replaced by its mean. Level 1's meter is the share of residues on the same side of pLDDT 70 as their piece's mean.</p>
    <p><b>pLDDT</b> is AF2's own estimate of per-residue lDDT-Cα, predicted in 50 bins from the final single representation (Algorithm 29). It gives 0 to 100. Bands, as AlphaFold DB states them (Varadi et al. 2022): ≥90 very high, 70 to 90 confident, 50 to 70 low, under 50 very low. A linear fit on 10,795 chains gave lDDT-Cα = 0.997 × pLDDT − 1.17, with Pearson r = 0.76 (Jumper et al. 2021, Fig. 2c). Above 90, χ<sub>1</sub> rotamers are about 80% correct. Above 70 the backbone is generally correct (Tunyasuvunakool et al. 2021).</p>
    <p><b>PAE</b> comes from the pair representation, in 64 bins of 0.5 Å from 0 to 31.5 Å, and it is not symmetric (Supplement 1.9.7). It is the aligned error of chapter 7, predicted without seeing the truth. The AlphaFold DB advises attaching no structural relevance to the relative position of parts with high PAE (Varadi et al. 2022).</p>
    <p><b>The maps.</b> PAE here is the real AlphaFold DB output (model version 6) for calmodulin and adenylate kinase. In level 3 the map is not AF2's: it is true error, computed by this game from the real AF2 model and the real open crystal 4AKE, which is what PAE tries to estimate. A true-error map needs a crystal, which you lack for a new protein. After you cut it, AF2's own PAE for the same protein takes its place. The mean gap between the two is about 6.7 Å against the open crystal and 1.6 Å against the closed one, 1AKE. The model is 0.75 Å from closed 1AKE and 7.20 Å from open 4AKE, and its mean pLDDT is 95.9. High confidence here means confidence in one state. It says nothing of the others, or of how often each occurs.</p>
    <p><b>Calmodulin.</b> The pale ghosts are real crystals, 1CLL and 1CDL, each laid on the AF2 model by its N-terminal lobe alone. Each lobe fits closely (0.8 and 0.5 Å to 1CLL, 0.6 and 0.6 Å to 1CDL), and the whole chain does not (6.5 and 11.5 Å). The hinge there is a flexible linker, but high PAE does not prove flexibility, and low PAE does not rule it out.</p>
    <p><b>p53.</b> UniProt marks residues 102 to 292 as DNA-binding, and 50 to 96, 282 to 325 and 351 to 393 as disordered. Residues 1 to 49 also score low. UniProt's disordered track does not cover them, but NMR shows this transactivation domain is disordered on its own too (Dawson et al. 2003; Wells et al. 2008). The short region near 325 to 355 scores high although AF2 predicted one chain and those residues form a tetramer. Asking about that needs AlphaFold-Multimer, a later version trained on complexes (Evans et al., bioRxiv 2021).</p>
    <p><b>Low pLDDT is not always disorder.</b> On CAID Disprot-PDB (n = 178,124 residues), pLDDT gave AUC 0.897 as a disorder predictor (Tunyasuvunakool 2021). AF2 gives pLDDT of 70 or more to nearly 15% of human disordered regions, and 90 or more to 4.5%, often those that fold on binding or phosphorylation (Alderson et al. 2023). Low confidence can also mean not enough information (EMBL-EBI training pages). eIF3 subunits E and M have low pLDDT but match the cryo-EM complex 6ZON (Williams et al. 2025), though that is inside a complex.</p>
    <p><b>PDB-like, not physical.</b> Jumper et al. write that AlphaFold "is trained to produce the protein structure most likely to appear as part of a PDB structure", and that where a stoichiometry, ligand or ion is predictable from sequence, it is likely to respect that implicitly. The adenylate kinase model matches the inhibitor-bound closed crystal. Calmodulin's lobes match calcium-bound crystals, not the calcium-free NMR structure (1CFD, 3.7 and 4.3 Å). That is agreement, not cause: templates, or a memory of similar training structures, could explain it too.</p>
    <p><b>Licences.</b> AlphaFold DB data is CC-BY-4.0: Jumper et al. 2021 and Varadi et al. 2022.</p>
    <p class="small">Sources as named above. Regions of p53 are from UniProt P04637. Domain limits of adenylate kinase are from Müller et al. 1996. Calmodulin 1CLL (Chattopadhyaya et al. 1992), 1CDL (Meador et al. 1992) and 1CFD (Kuboniwa et al. 1995), adenylate kinase 4AKE and 1AKE (Müller et al. 1996; Müller and Schulz 1992).</p>`, `<h3>この章の注</h3>
    <p><b>手の動きとAlphaFold2。</b>AF2が出すのは1つの列と1つの表で、切れ目は出さない。鎖に沿って指を動かすことは、残基iの上に立つことにあたる。PAEの定義がこれで、予測と正解を残基iでそろえたときの、残基jでの予想誤差である。マップの1行が1回の「立つ」にあたり、指の下でモデルの色が変わるのはこの値による。切ることは、人がこの表を読むときの方法である。AF2は切らない。メーターの適合度はこのゲームがこの場で計算した値で、マップの各ブロックをそれぞれの平均で置き換えたときに残る、マップの分散の割合である。レベル1のメーターは、pLDDT 70に対して、属する部分の平均と同じ側にある残基の割合である。</p>
    <p><b>pLDDT</b>は、残基ごとのlDDT-CαをAF2自身が見積もった値で、最後のシングル表現から50個のビンで予測する（Algorithm 29）。0から100の値をとる。区分はAlphaFold DBによる（Varadi et al. 2022）。90以上がとても高い、70〜90が確信あり、50〜70が低い、50未満がとても低い。10,795本の鎖での直線近似は lDDT-Cα = 0.997 × pLDDT − 1.17、ピアソンのrは0.76である（Jumper et al. 2021, Fig. 2c）。90を超えると、χ<sub>1</sub>回転異性体の約80%が正しい。70を超えると、主鎖はおおむね正しい（Tunyasuvunakool et al. 2021）。</p>
    <p><b>PAE</b>はペア表現から、0〜31.5 Åを0.5 Åずつに分けた64個のビンで予測し、対称ではない（Supplement 1.9.7）。第7章のaligned errorを、正解を見ずに予測した値である。AlphaFold DBは、PAEの高い部分どうしの相対位置に構造上の意味を持たせないよう勧めている（Varadi et al. 2022）。</p>
    <p><b>マップ。</b>ここでのPAEは、カルモジュリンとアデニル酸キナーゼのAlphaFold DBの実出力（モデル版6）である。レベル3のマップはAF2の出力ではない。AF2の実際のモデルと開いた形の結晶構造4AKEから、このゲームが計算した真の誤差で、PAEが見積もろうとしている量である。真の誤差のマップには結晶構造が必要で、新しいタンパク質にはそれがない。切り終えると、同じタンパク質のAF2自身のPAEに置き替わる。2つのマップの差の平均は、開いた結晶構造に対して約6.7 Å、閉じた結晶構造1AKEに対して1.6 Åである。モデルは閉じた1AKEから0.75 Å、開いた4AKEから7.20 Åの距離にあり、pLDDTの平均は95.9である。ここでの高い信頼度は、1つの状態についての信頼度である。ほかの状態や、それぞれがどれくらいの頻度で現れるかについては何も言わない。</p>
    <p><b>カルモジュリン。</b>薄い影は本物の結晶構造1CLLと1CDLで、それぞれN末端側のローブだけでAF2のモデルに重ねた。各ローブはよく合うが（1CLLで0.8と0.5 Å、1CDLで0.6と0.6 Å）、鎖全体は合わない（6.5と11.5 Å）。ここのヒンジは柔軟なリンカーだが、PAEが高いことが柔軟さの証明になるわけではなく、PAEが低いことが柔軟さを否定するわけでもない。</p>
    <p><b>p53。</b>UniProtは残基102〜292をDNA結合、50〜96、282〜325、351〜393を天然変性としている。残基1〜49もスコアが低い。UniProtの天然変性の記載には含まれないが、NMRによると、この転写活性化ドメインも単独では天然変性である（Dawson et al. 2003; Wells et al. 2008）。325〜355付近の短い領域はスコアが高いが、AF2は1本の鎖を予測しただけで、実際にはこの残基は四量体を作る。これを調べるには、複合体で訓練した後の版、AlphaFold-Multimerを使う（Evans et al., bioRxiv 2021）。</p>
    <p><b>pLDDTが低くても天然変性とは限らない。</b>CAID Disprot-PDB（n = 178,124残基）では、天然変性の予測器としてのpLDDTのAUCは0.897だった（Tunyasuvunakool 2021）。AF2はヒトの天然変性領域の15%近くにpLDDT 70以上、4.5%に90以上を与える。結合やリン酸化で折りたたまれる領域に多い（Alderson et al. 2023）。信頼度が低いのは、情報が足りないためのこともある（EMBL-EBI training pages）。eIF3のサブユニットEとMはpLDDTが低いが、クライオ電子顕微鏡の複合体6ZONと一致する（Williams et al. 2025）。ただしこれは複合体の中での話である。</p>
    <p><b>物理ではなくPDBに近い構造を出す。</b>Jumper et al.は、AlphaFoldは「PDB構造の一部として現れる可能性が最も高いタンパク質構造を出すように訓練されている（is trained to produce the protein structure most likely to appear as part of a PDB structure）」と書き、配列から予測できる化学量論、リガンド、イオンは暗に反映されるだろうと述べている。アデニル酸キナーゼのモデルは阻害剤が結合した閉じた結晶構造と合う。カルモジュリンのローブはカルシウム結合型の結晶構造と合い、カルシウムのないNMR構造（1CFD、3.7と4.3 Å）とは合わない。これは一致であって原因ではない。テンプレートや、訓練中の似た構造の記憶でも説明できる。</p>
    <p><b>ライセンス。</b>AlphaFold DBのデータはCC-BY-4.0である（Jumper et al. 2021、Varadi et al. 2022）。</p>
    <p class="small">出典は本文のとおり。p53の領域はUniProt P04637。アデニル酸キナーゼのドメインの範囲はMüller et al. 1996。カルモジュリン1CLL（Chattopadhyaya et al. 1992）、1CDL（Meador et al. 1992）、1CFD（Kuboniwa et al. 1995）。アデニル酸キナーゼ4AKE、1AKE（Müller et al. 1996; Müller and Schulz 1992）。</p>`),

  setup(run) {
    run.world.shadowSpan(110);
    run.own({ dispose: () => run.world.shadowSpan(80) });
  },
  stages: [local, between, hinges],
};

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const SCISSORS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fffdf8" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5 20 18M8.5 15.5 20 6"/></svg>';

// Blue for a small error, white for a large one, as a palette so that a finger can repaint a model every frame.
const SHADES = Array.from({ length: 33 }, (_, k) => { const t = k / 32, c = new THREE.Color(); return t < 0.3 ? c.copy(STOCK.high).lerp(STOCK.good, t / 0.3) : c.copy(STOCK.good).lerp(new THREE.Color('#fff3ea'), (t - 0.3) / 0.7); });
const shade = (e) => SHADES[Math.min(32, Math.round((e / 28) * 32))];

// The board: a chain laid on a sheet, with cuts on it that a finger can place and move. mode 'map' lays the chain along the
// diagonal of an error map, which appears one row at a time as the finger stands on each residue.
class ChainSheet {
  constructor(run, { n, e = null, score, cuts, end = 3, hidden = true, snap = null }) {
    Object.assign(this, { run, n, e, score, most: cuts, end, snap });
    const { world } = run;
    this.cuts = [];
    const paper = new THREE.Mesh(new THREE.BoxGeometry(SIDE + 2, 0.3, SIDE + 2), world.paper({ color: '#fffdf8', glow: 0, repeat: 2 }));
    paper.position.y = 0.15; paper.castShadow = true; paper.receiveShadow = true;
    this.paper = paper;
    world.scene.add(paper);
    this.flat = !e;
    this.seen = new Uint8Array(n);
    if (e) {
      const c = this.canvas = document.createElement('canvas');
      c.width = c.height = Math.max(n * 2, 512);
      this.g = c.getContext('2d');
      this.g.fillStyle = '#f6f1e5'; this.g.fillRect(0, 0, c.width, c.height);
      this.tex = new THREE.CanvasTexture(c);
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.minFilter = THREE.LinearFilter; // A row is added under a moving finger, so no mipmaps are rebuilt.
      this.tex.generateMipmaps = false;
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, SIDE).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
      this.sheet.position.y = 0.34;
      world.scene.add(this.sheet);
      if (!hidden) this.showAll();
    }
    // The chain, one paper strip for each residue, coloured by its real pLDDT.
    const w = (SIDE * (e ? Math.SQRT2 : 1)) / n;
    const g = new THREE.BoxGeometry(1, 0.34, 1), m = this.beads = new THREE.InstancedMesh(g, world.paper({ glow: 0.1, bump: 0 }), n);
    m.castShadow = true; m.frustumCulled = false;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e ? -Math.PI / 4 : 0), S = new THREE.Vector3(), P = new THREE.Vector3();
    for (let i = 0; i < n; i += 1) {
      const [x, z] = this.point(i + 0.5), h = e ? 1.8 : 1.5 + (score[i] / 100) * 30;
      S.set(w * 1.02, 1, h);
      P.set(x, 0.62, e ? z : z - h / 2);
      m.setMatrixAt(i, M.compose(P, Q, S));
      m.setColorAt(i, plddtStock(score[i]));
    }
    m.instanceMatrix.needsUpdate = true;
    world.scene.add(m);
    if (!e) {
      // The line pLDDT 70 sits at, to read the bars by.
      const y = 1.5 + 0.7 * 30, l = this.line70 = new THREE.Mesh(new THREE.BoxGeometry(SIDE, 0.1, 0.22), world.paper({ color: '#26343f', glow: 0, bump: 0 }));
      l.position.set(0, 0.9, this.point(0)[1] - y);
      world.scene.add(l);
    }
    this.toks = [];
  }

  // A place along the chain, in residues, as a point on the table.
  point(c) {
    const t = c / this.n;
    return this.flat ? [-SIDE / 2 + t * SIDE, SIDE / 2 - 8] : [-SIDE / 2 + t * SIDE, -SIDE / 2 + t * SIDE];
  }

  // World length of one residue along the chain.
  step() { return (SIDE * (this.flat ? 1 : Math.SQRT2)) / this.n; }

  // The place on the chain nearest a screen point, as a whole number of residues.
  place(x, y) {
    const p = this.run.world.onPlane(x, y, 0.6);
    if (!p) return null;
    const t = this.flat ? (p.x + SIDE / 2) / SIDE : ((p.x + SIDE / 2) + (p.z + SIDE / 2)) / (2 * SIDE), c = Math.round(t * this.n);
    return Math.max(this.end, Math.min(this.n - this.end, this.snap?.(c) ?? c));
  }

  over(x, y) {
    const p = this.run.world.onPlane(x, y, 0.6);
    return !!p && Math.abs(p.x) < SIDE / 2 + 5 && Math.abs(p.z) < SIDE / 2 + 5;
  }

  row(i) {
    if (this.seen[i]) return;
    this.seen[i] = 1;
    const { n, e, g, canvas } = this, s = canvas.width / n;
    for (let j = 0; j < n; j += 1) { g.fillStyle = `#${shade(e[i * n + j]).getHexString()}`; g.fillRect(j * s, i * s, s + 0.5, s + 0.5); }
    this.tex.needsUpdate = true;
  }

  showAll() { for (let i = 0; i < this.n; i += 1) this.row(i); }

  // Swaps the map for another one, sweeping down the sheet.
  async swap(e) {
    const { n, run } = this;
    this.e = e;
    this.seen.fill(0);
    for (let i = 0; i < n; i += 4) { for (let k = 0; k < 4 && i + k < n; k += 1) this.row(i + k); await run.sleep(16); }
  }

  // One cut's token and its lines across the map.
  token() {
    const { world, ui } = this.run, d = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.6, 28), world.paper({ color: '#26343f', glow: 0, bump: 0 }));
    d.castShadow = true;
    const a = new THREE.Mesh(new THREE.BoxGeometry(SIDE, 0.14, 0.42), world.paper({ color: '#26343f', glow: 0, bump: 0 }));
    const b = this.flat ? null : new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, SIDE), a.material);
    if (this.flat) a.scale.set(0.0076, 1, 74);
    world.scene.add(d, a);
    if (b) world.scene.add(b);
    const label = ui.label(SCISSORS, 'cutter');
    const t = { c: 0, d, a, b, label, y: 0.9 };
    this.toks.push(t);
    return t;
  }

  put(t, c) {
    t.c = c;
    const [x, z] = this.point(c);
    t.d.position.set(x, t.y, z);
    if (this.flat) { t.a.position.set(x, 0.8, z - 12); } else { t.a.position.set(0, 0.5, z); t.b.position.set(x, 0.5, 0); }
    this.run.world.shadowDirty = 2;
  }

  take(t) {
    const { world } = this.run;
    world.scene.remove(t.d, t.a);
    if (t.b) world.scene.remove(t.b);
    t.d.geometry.dispose(); t.d.material.dispose(); t.a.geometry.dispose(); t.a.material.dispose(); t.b?.geometry.dispose();
    t.label.remove();
    this.toks.splice(this.toks.indexOf(t), 1);
  }

  // Recolours the chain itself.
  tint(stock) {
    for (let i = 0; i < this.n; i += 1) this.beads.setColorAt(i, stock(i));
    this.beads.instanceColor.needsUpdate = true;
  }

  // Where a press would land, for a mouse.
  peek(c) {
    const { world } = this.run;
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 28), world.paper({ color: '#65cbf3', glow: 0, bump: 0 }));
      world.scene.add(this.ghost);
    }
    this.ghost.visible = c !== null;
    if (c !== null) { const [x, z] = this.point(c); this.ghost.position.set(x, 0.86, z); }
  }

  positions() { return this.toks.map((t) => t.c).sort((a, b) => a - b); }

  labels() { for (const t of this.toks) { const [x, z] = this.point(t.c); t.label.at(this.run.world.project([x, 1.2, z])); } }

  dispose() {
    const { world } = this.run;
    for (const t of [...this.toks]) this.take(t);
    world.scene.remove(this.paper, this.beads);
    if (this.sheet) { world.scene.remove(this.sheet); this.sheet.geometry.dispose(); this.sheet.material.dispose(); this.tex.dispose(); }
    if (this.ghost) { world.scene.remove(this.ghost); this.ghost.geometry.dispose(); this.ghost.material.dispose(); }
    if (this.line70) { world.scene.remove(this.line70); this.line70.geometry.dispose(); this.line70.material.dispose(); }
    this.paper.geometry.dispose(); this.paper.material.dispose(); this.beads.geometry.dispose(); this.beads.material.dispose();
    world.shadowDirty = 3;
  }
}

// The sheet, and the real model it speaks of.
function setUp(run, st, sheetOpts, { scale }) {
  const { world } = run, sheet = run.scoped(new ChainSheet(run, sheetOpts));
  const model = run.scoped(new PaperProtein(world, st, { stock: stockFrom(st), scale, center: [0, 16, 0], spin: 0.1, triangles: false }));
  const frame = (seconds = 0.6) => {
    const s = world.stage, tall = s.h > s.w * 0.92;
    if (tall) {
      const free = Math.max(24, (s.h / s.w) * (SIDE + 4) - SIDE - 4);
      model.scale = scale * Math.min(1, free / 44);
      model.center.set(0, 14 * Math.min(1, free / 44), SIDE / 2 + free / 2 + 1);
      world.look({ target: [0, 0, free / 2], dist: world.fitDist(SIDE + 4, SIDE + 4 + free, 0.08), polar: 0.08, az: 0 }, seconds);
    } else {
      model.scale = scale * 1.24;
      model.center.set(SIDE / 2 + 33, 14, 8);
      world.look({ target: [23, 0, 0], dist: world.fitDist(SIDE + 64, SIDE + 6, 0.08), polar: 0.08, az: 0 }, seconds);
    }
  };
  frame(0);
  run.onLayout = (t) => frame(t);
  run.tick(() => sheet.labels());
  return { sheet, model };
}

// Lets the player place and move cuts. onMove follows the finger, onCut answers each release, and true ends the play.
function cutting(run, sheet, { onStand, onLift, onCut, hint, control = {} }) {
  const { sound } = run;
  return run.until((done) => {
    let t = null, was = -1;
    control.stop = () => { off(); idle.dispose(); done(); };
    const stand = (c) => {
      if (!sheet.flat) { const a = Math.min(was < 0 ? c : was, c), b = Math.max(was < 0 ? c : was, c); for (let i = a; i <= b && i < sheet.n; i += 1) sheet.row(i); }
      was = c;
      onStand?.(c);
    };
    const off = run.board({
      fine: true,
      at: (x, y) => (sheet.over(x, y) ? sheet.place(x, y) : null),
      hover: (c) => sheet.peek(c),
      grab: (_, x, y) => {
        sheet.peek(null);
        const c = sheet.place(x, y);
        if (c === null) return;
        const near = sheet.toks.map((k) => [Math.abs(k.c - c), k]).sort((a, b) => a[0] - b[0])[0];
        const close = near && near[0] * sheet.step() <= 3.6; // The token's own size, so that a press beside it starts a new cut.
        t = close || sheet.toks.length >= sheet.most ? near[1] : sheet.token();
        was = -1;
        sheet.put(t, c);
        stand(c);
        sound.rustle(2, 0.03);
      },
      move: (_, x, y) => { const c = sheet.place(x, y); if (c !== null && t && c !== t.c) { sheet.put(t, c); stand(c); sound.pick(c); } },
      drop: () => { release(); },
      tap: () => { release(); },
      cancel: () => { release(); },
    });
    const release = () => {
      if (!t) return;
      t = null;
      onLift?.();
      sound.fold();
      if (onCut(sheet.positions())) control.stop();
    };
    const idle = run.idle(() => (sheet.toks.length ? null : hint()));
    run.scoped(idle);
  });
}

const along = (run, sheet, c) => () => { const [x, z] = sheet.point(c); return run.world.project([x, 1, z]); };

async function local(run) {
  const { ui, sound } = run, st = getModel('P04637'), n = st.plddt.length, CUTS = 4;
  // A cut falls into the nearest place where the colour really changes, so that aim is never the difficulty.
  const edges = runsOf(st.plddt), snap = (c) => edges.reduce((b, v) => (Math.abs(v - c) < Math.abs(b - c) ? v : b), edges[0]);
  const { sheet, model } = setUp(run, st, { n, score: st.plddt, cuts: CUTS, end: 4, snap: (c) => (Math.abs(snap(c) - c) <= 14 ? snap(c) : c) }, { scale: 0.46 });
  run.level(GOALS[0], 0, CUTS);
  ui.tags('af2', 'game');
  const meter = ui.meter({ label: tr('of residues sorted correctly', 'の残基を正しく分けた'), max: 1, mark: 0.94 });
  const base = stockFrom(st), judge = (cuts) => trustFit(st.plddt, cuts);
  const show = (cuts) => {
    const { fit, pieces } = judge(cuts), out = new Set();
    for (const p of pieces) if (!p.trusted) for (let i = p.from; i < p.to; i += 1) out.add(i);
    model.repaint((i) => (out.has(i) ? STOCK.mist : base(i)));
    sheet.tint((i) => (out.has(i) ? STOCK.mist : base(i)));
    meter.set(fit, `${Math.round(fit * 100)}%`, fit >= 0.94);
    sound.setOpening(fit);
    return fit;
  };
  meter.set(judge([]).fit, `${Math.round(judge([]).fit * 100)}%`);
  run.probe = { ready: true, at: (c) => along(run, sheet, c)(), best: () => runsOf(st.plddt), cuts: () => sheet.positions(), most: CUTS };
  await cutting(run, sheet, {
    onCut: (cuts) => {
      const fit = show(cuts);
      ui.count(cuts.length, CUTS);
      if (fit >= 0.94) return true;
      ui.feedback(cuts.length < CUTS ? tr('Grey is out.', '灰色は外れた。') : tr('Drag a cut to where the colour changes.', '切れ目を色が変わる所へ動かす。'), cuts.length < CUTS ? '' : 'bad');
      sound.soft();
      return false;
    },
    hint: () => ({ from: along(run, sheet, 40), to: along(run, sheet, 93) }),
  });
  ui.tags('af2', 'game', 'paper');
  await run.won(tr('AF2 drew the grey parts but does not vouch for them.', 'AF2は灰色の部分も描いたが、形は保証していない。'), 1, 2800);
}

// Where the score crosses the line, for the test bots.
function runsOf(score, line = 70) {
  const out = [];
  for (let i = 1; i < score.length; i += 1) if ((score[i] >= line) !== (score[i - 1] >= line)) out.push(i);
  return out;
}

async function between(run) {
  const { ui } = run, st = getModel('P0DP23'), { n, e } = getPAE('P0DP23');
  const { sheet, model } = setUp(run, st, { n, e, score: st.plddt, cuts: 1 }, { scale: 0.5 });
  run.level(GOALS[1], 0, 1);
  ui.tags('af2', 'game', 'paper');
  const sums = mapSums(e, n), best = bestCuts(sums, 1), meter = ui.meter({ label: tr('fit to the map', 'マップへの適合度'), max: 1, mark: best.fit * NEAR });
  const base = stockFrom(st);
  run.probe = { ready: true, at: (c) => along(run, sheet, c)(), best: () => best.cuts, cuts: () => sheet.positions(), most: 1 };
  let said = false;
  await cutting(run, sheet, {
    onStand: (c) => {
      const i = Math.min(n - 1, c);
      model.repaint((j) => shade(e[i * n + j]));
      if (!said) { said = true; ui.feedback(tr('Aligned here, pale parts are the ones AF2 is unsure of.', 'この残基でそろえたとき、淡い部分は位置が不確かである。')); }
    },
    onLift: () => model.repaint(base),
    onCut: ([c]) => {
      const fit = pieceFit(sums, [c]), good = fit >= best.fit * NEAR;
      meter.set(fit, `${Math.round(fit * 100)}%`, good);
      run.sound.setOpening(fit);
      if (good) { ui.count(1, 1); return true; }
      ui.feedback(tr('Move the cut.', '切れ目を動かす。'));
      return false;
    },
    hint: () => ({ from: along(run, sheet, 10), to: along(run, sheet, 110) }),
  });
  sheet.showAll();
  const { within, across } = withinAcross(sums, sheet.positions());
  // Real crystals laid on this model by one lobe alone. How far the other lobe lands is what aligned error means.
  for (const k of ['cam1', 'cam2']) ghost(run, model, onto(st, getStructure(k), 8, 73), k === 'cam1' ? '#a78bc9' : '#c8b3dd');
  ui.tags('af2', 'real', 'game');
  await run.won([tr(`Inside each piece ${fmt(within, 1)} Å, between them ${fmt(across, 1)} Å.`, `各部分の内側は${fmt(within, 1)} Å、間は${fmt(across, 1)} Å。`), tr('Two real crystals, aligned on one lobe: the other lands elsewhere.', '2つの結晶構造を片方のローブでそろえると、もう片方はずれる。')], 2, 2600);
}

// A crystal's C-alpha trace, moved onto a model by the residues numbered from a to b. Residues the two share are matched by
// their sequence.
function onto(af, ex, a, b) {
  const off = af.seq.indexOf(ex.seq.slice(0, 10)), P = [], Q = [];
  ex.seq.split('').forEach((c, i) => { const k = off + i; if (af.seq[k] === c && af.nums[k] >= a && af.nums[k] <= b) { P.push(ex.ca[i]); Q.push(af.ca[k]); } });
  return moved(ex.ca, superpose(P, Q));
}
const moved = (pts, { R, cp, cq }) => pts.map((p) => { const d = [p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]]; return [R[0] * d[0] + R[1] * d[1] + R[2] * d[2] + cq[0], R[3] * d[0] + R[4] * d[1] + R[5] * d[2] + cq[1], R[6] * d[0] + R[7] * d[1] + R[8] * d[2] + cq[2]]; });

// A second ribbon that shares the model's turning.
function ghost(run, model, ca, color) {
  const { world } = run, c = new THREE.Color(color), m = run.scoped(new THREE.Mesh(ribbonGeometry(ca, ca.map(() => c), { wide: 0.8, narrow: 0.26 }), world.paper({ vertexColors: true, glow: 0.45, repeat: 0.2, bump: 0.2 })));
  m.matrixAutoUpdate = false;
  m.castShadow = true;
  world.scene.add(m);
  m.dispose = () => { world.scene.remove(m); m.geometry.dispose(); m.material.dispose(); };
  run.tick(() => m.matrix.copy(model.group));
  return m;
}

async function hinges(run) {
  const { ui } = run, st = getModel('P69441'), open = getStructure('ake4'), paeReal = getPAE('P69441'), { n } = paeReal, CUTS = 4;
  const E = alignedError(st.frames, st.ca, open.frames, open.ca), sums = mapSums(E, n), best = bestCuts(sums, CUTS);
  const { sheet, model } = setUp(run, st, { n, e: E, score: st.plddt, cuts: CUTS }, { scale: 0.56 });
  run.level(GOALS[2], 0, CUTS);
  ui.tags('af2', 'real', 'game');
  const base = stockFrom(st), m = ui.meter({ label: tr('fit to the map', 'マップへの適合度'), max: 1, mark: best.fit });
  m.hidden = true;
  run.probe = { ready: true, at: (c) => along(run, sheet, c)(), best: () => best.cuts, cuts: () => sheet.positions(), most: CUTS };
  const near = (cuts) => cuts.length === CUTS && cuts.every((c, k) => Math.abs(c - best.cuts[k]) <= REACH) && pieceFit(sums, cuts) >= best.fit * 0.7;
  let fails = 0, solved = false;
  await run.until((done) => {
    const control = {}, finish = () => { control.stop(); done(); };
    const show = ui.button(tr('Show me', '答えを見る'), () => {
      while (sheet.toks.length) sheet.take(sheet.toks[0]);
      for (const c of best.cuts) sheet.put(sheet.token(), c);
      finish();
    }, { quiet: true, id: 'show' });
    const check = ui.button(tr('Check', '確かめる'), () => {
      const cuts = sheet.positions(), fit = pieceFit(sums, cuts), good = near(cuts);
      m.hidden = false;
      m.set(fit, `${Math.round(fit * 100)}%`, good);
      if (good) { solved = true; finish(); return; }
      fails += 1;
      run.sound.soft();
      ui.feedback(tr('Not yet. Each pale band has two edges.', 'まだである。淡い帯には端が2つある。'), 'bad');
      if (fails >= 2) ui.ctrl(show, check);
    }, { id: 'check' });
    check.disabled = true;
    ui.ctrl(check);
    cutting(run, sheet, {
      control,
      onStand: (c) => { const i = Math.min(n - 1, c); model.repaint((j) => shade(E[i * n + j])); },
      onLift: () => model.repaint(base),
      onCut: (cuts) => { ui.count(cuts.length, CUTS); check.disabled = cuts.length < CUTS; return false; },
      hint: () => ({ from: along(run, sheet, 10), to: along(run, sheet, 200) }),
    }).catch((e) => { if (!(e instanceof Abort)) throw e; });
  });
  ui.ctrl();
  sheet.showAll();
  // AF2's own PAE slides in over the true error. It has none of those bands, and that is the point of this chapter.
  const CORE = AKE_CORE.flatMap(([a, b]) => span(a, b)), fit = superpose(CORE.map((i) => open.ca[i]), CORE.map((i) => st.ca[i]));
  ghost(run, model, moved(open.ca, fit), '#a78bc9');
  await sheet.swap(paeReal.e);
  ui.tags('af2', 'real', 'game');
  ui.goal(tr('AF2\'s own PAE.', 'AF2自身のPAE。'));
  const line = tr('It stays blue: it speaks of the state it predicted.', '青いまま。予測した状態についての値である。');
  if (solved) await run.won(line, 3, 3600);
  else { ui.feedback(line); await run.pause(3600); }
}

const span = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k - 1);
