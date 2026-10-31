# Physical chemistry of biomolecules learner

Twelve views of the free-energy landscape, drawn as woodblock prints. Molecules are walkers on the land: the sun sets the temperature, valleys are states, and passes are transition states. Each crossing plucks a string, so rates can be heard.

Open `index.html`. It is one file and needs no network.

## Rebuild

```sh
mkdir -p ~/.cache/pchem-learner && cd ~/.cache/pchem-learner
npm init -y && npm install three@0.187.0 esbuild@0.28.2
cd -
DEPS=$HOME/.cache/pchem-learner node tools/build.mjs
node tools/test_chem.mjs
```

## How the physics works

- `src/chem.js` holds the formulas, with no screen code.
- `src/engine.js` hops each walker with the exact rate of its link, so populations obey detailed balance. Inside a valley a walker jitters with a spread set by temperature. It does not simulate motion over the pass, which shows the hop as a short walk.
- Land shape is drawn from the same free energies. The height is compressed on a log scale so that small gaps stay visible beside tall barriers.
- Game time is compressed. Rates are per second of play, not real time.
