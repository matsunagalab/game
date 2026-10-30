# game

生体分子を学ぶブラウザゲームを集めたリポジトリです。スマートフォンでもPCでも遊べます。

カタログ: https://www.bio.ics.saitama-u.ac.jp/game/

| ゲーム | フォルダ | 作り直し |
|---|---|---|
| Amino-acids learner | `amino-acids-learner/` | `sh tools/build.sh` |
| Protein Structure Learner | `protein-structure-learner/` | `node tools/build.mjs` |
| Force-Field Parameters of Biomolecular Simulation Learner | `force-field-parameters-learner/` | `npm install && npm run build` |
| Metalloprotein Learner | `metalloprotein-learner/` | `sh tools/build.sh` |
| Antibody-Antigen Interaction Learner | `antibody-antigen-interaction-learner/` | `npm install && npm run build` |

作り直しは各フォルダで実行します。

## 公開のしくみ

GitHub Pages が `main` の最上位をそのまま公開します。ビルドの自動処理はありません。組織のPagesに研究室サイトの独自ドメインが設定されているので、公開先は `www.bio.ics.saitama-u.ac.jp/game/` です。`matsunagalab.github.io/game/` からはここへ転送されます。

- 各ゲームは、フォルダ直下の `index.html` だけで動きます。作り直した `index.html` を commit すると公開されます。
- カタログは最上位の `index.html` です。
- `posters/` の画像は、スマートフォン縦画面（390×664）のタイトル画面です。

## ゲームを足すとき

1. 新しいフォルダを作り、直下に `index.html` を置きます。
2. localStorage のキーをゲームごとに変えます。全ゲームが同じ公開先を共有するので、同じキーだと保存データが混ざります。
3. `posters/` に画像を足し、カタログの `index.html` に1項目足します。
4. 使ったフォントやライブラリを `THIRD_PARTY.md` に足します。

## 権利

第三者の素材は [THIRD_PARTY.md](THIRD_PARTY.md) にあります。
