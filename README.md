# game

Browser games for learning biomolecules. They run on phones and computers.

Catalog: https://www.bio.ics.saitama-u.ac.jp/game/

| Game | Folder | Rebuild |
|---|---|---|
| Amino-acids learner | `amino-acids-learner/` | `sh tools/build.sh` |
| Protein Structure Learner | `protein-structure-learner/` | `node tools/build.mjs` |
| Force-Field Parameters of Biomolecular Simulation Learner | `force-field-parameters-learner/` | `npm install && npm run build` |
| Metalloprotein Learner | `metalloprotein-learner/` | `sh tools/build.sh` |
| Antibody-Antigen Interaction Learner | `antibody-antigen-interaction-learner/` | `npm install && npm run build` |

Run the rebuild command inside each game's folder.

## How the site is published

GitHub Pages serves the top level of `main` as it is. There is no automated build. The organization's Pages site uses the lab's custom domain, so the catalog is at `www.bio.ics.saitama-u.ac.jp/game/`, and `matsunagalab.github.io/game/` redirects there.

- Each game is a single `index.html` at the top of its folder. Commit a rebuilt `index.html` to publish it.
- The catalog is the top-level `index.html`.
- The images in `posters/` are title screens taken at a phone size of 390×664.

## Adding a game

1. Create a new folder with an `index.html` at its top.
2. Give the game its own localStorage key. All games share one site, so two games with the same key would mix their saved data.
3. Add a poster to `posters/` and an entry to the catalog's `index.html`.
4. Add any new fonts or libraries to `THIRD_PARTY.md`.

## Rights

Third-party material is listed in [THIRD_PARTY.md](THIRD_PARTY.md).
