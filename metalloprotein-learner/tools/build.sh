#!/bin/sh
# Rebuilds index.html. Dependencies live outside Google Drive so it never syncs node_modules.
set -e
here=$(cd "$(dirname "$0")" && pwd)
deps=${GAME_DEPS:-$HOME/.cache/metalloprotein-learner}
if [ ! -d "$deps/node_modules/three" ]; then
  mkdir -p "$deps"
  (cd "$deps" && npm init -y >/dev/null && npm install three@0.187.0 esbuild@0.28.2)
fi
cp "$here/build.mjs" "$deps/build.tmp.mjs"
GAME_ROOT=$(dirname "$here") GAME_DEPS="$deps" node "$deps/build.tmp.mjs"
rm "$deps/build.tmp.mjs"
