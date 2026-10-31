# Molecular biology of the cell learner

A living cell drawn as a stained glass rose window. Grow microtubules from the centrosome, keep cargo moving between organelles, and finish by dividing the window in two.

Open `index.html`. It is one file and needs no network.

## Rebuild

```sh
mkdir -p ~/.cache/pchem-learner && cd ~/.cache/pchem-learner
npm init -y && npm install three@0.187.0 esbuild@0.28.2
cd -
DEPS=$HOME/.cache/pchem-learner node tools/build.mjs
```

## How it is made

- `src/chapters.js` holds the seven chapters and the layout of the glass.
- `src/window.js` paints the glass once into a texture, then draws light, tracks and vesicles over it each frame.
- `src/main.js` runs tracks, cargo, stress and the final division.

The model is a teaching picture. Tracks run through one hub, and cargo spacing, speeds and queue limits are chosen for play.
