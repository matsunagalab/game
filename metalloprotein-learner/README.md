# Metalloprotein Learner

実在の金属タンパク質21部位を題材に、配位構造を読み解くブラウザゲームです。three.js 製で、スマホの縦画面を基本に作りました。

## 遊び方

`index.html` をブラウザで開きます。この1ファイルだけで動き、ネットワークは要りません。

画面は24ウェルの結晶化プレートです。ウェルを開くと、プレートから結晶、格子、1分子、金属部位へと1回で潜ります。どの部位も手順は同じです。

1. **配位子**: 金属が抜けた apo のポケットで、緑の差電子密度に届く原子をタップします。第二配位圏の原子は、おとりです
2. **形**: 候補の多面体をタップすると、実際の配位原子に重ねて確かめられます
3. **金属**: 金属塩の小瓶をドラッグ（またはタップ）して部位に入れます。間違えると差電子密度が緑か赤で反応します

正解で金属が入ると、干渉図が広がり、灰色のリボンに金属の色が広がります。間違えるたびに B-factor が上がって原子が揺れ、100 になると結晶を失います。成績は分解能（Å）です。

各列の6番目は、HSAB（A6）、K吸収端スキャン（B6）、Irving–Williams 系列（C6）の短いアーケードです。D 列は6つとも部位です。

操作は、1本指で回転、2本指でズーム、タップで選択です。進み具合はそのブラウザの localStorage に残ります。

## 作り直し

```sh
sh tools/build.sh                     # src/ から index.html を作る
node tools/make_data.mjs <PDBの場所>   # src/data/sites.json を作り直す
```

`node_modules` は Google Drive に同期させないよう `~/.cache/metalloprotein-learner` に置きます。`make_data.mjs` は Node だけで動き、`<PDBの場所>` に `XXXX.pdb` と、KcsA 四量体用の `1K4C.pdb1` が要ります。使う原子の指定は `tools/sites.mjs` にあります。

## データと素材

- 立体構造: Protein Data Bank の 1AAY、2CBA、8TLN、4DWV、4EXS、1IRO、1A6M、1YCC、2CPP、1IQZ、1PLC、4AZU、2C9V、1OXY、1FWJ、1EXR、1K4C、2FMS、7REQ、3WU2、3U7Q
- 画面の結合距離、金属間距離、理想多面体からの RMSD は、すべて上記の座標から `make_data.mjs` で計算した値です
- 二次構造は PDB ファイルの HELIX / SHEET 記録、文献は JRNL 記録から取っています
- 差電子密度の網と結晶格子は、見せるために作った表現で、実測の電子密度や実際の結晶の対称性ではありません
- three.js（MIT）、Bodoni Moda と Hanken Grotesk（SIL Open Font License 1.1）
