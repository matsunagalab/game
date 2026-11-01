// How often each donor sits on each acceptor in the resting model, over runs far longer than a stage can afford at start-up.
//   node tools/rest_table.mjs > src/data/pull-rest.json
// The board reads two things from this. Its bonds are those formed most of the time at rest, so a bond that only looks steady in a short sample is not
// asked to come back to a level it never held. And an acceptor the donor already visits at rest is not news when the donor lands on it after a pull.
import { readFileSync } from 'node:fs';
import { buildModel, step, holdStill, holdTurn, hbonds, atomLabel } from '../src/science/pull.js';

const ROOT = new URL('..', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('src/data/proteins.json', ROOT)));
const params = JSON.parse(readFileSync(new URL('src/data/grab-params.json', ROOT)));
const coords = (s) => { const b = Buffer.from(s, 'base64'); return Float32Array.from(new Int16Array(b.buffer, b.byteOffset, b.length / 2), (v) => v / 100); };
const u16 = (s) => { const b = Buffer.from(s, 'base64'); return new Uint16Array(b.buffer, b.byteOffset, b.length / 2); };
const load = (key) => { const p = raw.find((x) => x.key === key); return { ...p, n: p.seq.length, atomXYZ: coords(p.atoms.xyz), atomRes: u16(p.atoms.res) }; };
const SEEDS = +(process.env.SEEDS ?? 8);
const SECONDS = +(process.env.SECONDS ?? 6);
const out = {};
for (const key of ['homeodomain', 'gb1']) {
  const p = load(key);
  const count = new Map();
  let n = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const m = buildModel(p, params, { seed: s * 7919 + 13 });
    for (let f = 0; f < 120; f++) {
      step(m, 12);
      holdStill(m);
      holdTurn(m, 0.1);
    }
    for (let f = 0; f < SECONDS * 60; f++) {
      step(m, 12);
      holdStill(m);
      holdTurn(m, 0.1);
      if (f % 2 === 0) {
        n++;
        for (const k of hbonds(m)) {
          const [d, a] = k.split('-').map(Number);
          const name = `${atomLabel(m, d)}-${atomLabel(m, a)}`;
          count.set(name, (count.get(name) ?? 0) + 1);
        }
      }
    }
  }
  out[key] = Object.fromEntries([...count].filter(([, v]) => v / n >= 0.05).sort().map(([k, v]) => [k, +(v / n).toFixed(2)]));
}
console.log(JSON.stringify(out));
