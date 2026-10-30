# Amino-acids learner

実在のタンパク質をアミノ酸1個ずつ組み立て、最後に本物の立体構造へ折り畳むブラウザゲームです。three.js 製で、スマホの縦画面を基本に作りました。

## 遊び方

`index.html` をブラウザで開きます。この1ファイルだけで動き、ネットワークは要りません。

1. リボソームが読むコドンの指示どおりに、アミノ酸を選びます（タップ。キーボードなら数字か1文字コード）
2. 正解すると mRNA が3塩基進み、鎖が伸び、鉛筆画の細胞に水彩が広がります
3. 間違えるとシャペロンが1つ減り、似たものとの違いを2D構造式で見せます。なくなると鎖は分解されます
4. 終止コドンのあと、長押しで折り畳みます

出題は20種それぞれの習熟度で変わります。

ラベルつき → 名前 → 3文字 → 1文字 → 特徴のヒント → 構造を見て名前を答える

進み具合はそのブラウザの localStorage に残ります。

## 作り直し

```sh
sh tools/build.sh            # src/ から index.html を作る
node tools/test_learn.mjs    # 学習ロジックと遺伝暗号の表のテスト
```

`node_modules` は Google Drive に同期させないよう `~/.cache/amino-acids-learner` に置きます。

構造データ `src/data/structures.js` の作り直しには RDKit と numpy が要ります。

```sh
python -I tools/make_data.py PDBファイルのフォルダ src/data/structures.js
```

## データと素材

- 立体構造: Protein Data Bank の 1UAO、1L2Y、1VII、1PIN（6〜39番）、1MSO、1PGA、1UBQ。NMR 構造は1番目のモデル
- 二次構造: 上記ファイルの HELIX / SHEET 記録
- アミノ酸20種の座標と2D構造式: RDKit で生成（pH 7 の双性イオン）
- インスリンは B 鎖と A 鎖だけを作ります。C ペプチドは省いています。3I40 は B30 が Ala なので、野生型の 1MSO を使いました
- three.js（MIT）、Young Serif と Shantell Sans（SIL Open Font License 1.1）
