// Boils the MD analysis down to what the board shows: mean share of time held, and the spread between runs.
// node tools/md_collect.mjs <homeodomain json> <gb1 json> src/data/pull-md.json <homeodomain board json> <gb1 board json> <angles json>
// The board files come from tools/md_board.py, what each side chain holds by residue pair. The angles file comes from tools/md_angles.py.
import { readFileSync, writeFileSync } from 'node:fs';
const [a, b, out, boardA, boardB, anglesFile] = process.argv.slice(2);
const boil = (file, boardFile) => {
  const d = JSON.parse(readFileSync(file));
  const board = JSON.parse(readFileSync(boardFile));
  const keys = new Set(d.runs.flatMap((r) => Object.keys(r.hbonds)));
  const bonds = {};
  for (const k of keys) {
    const v = d.runs.map((r) => r.hbonds[k] ?? 0);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    if (m < 0.25) continue;
    bonds[k] = [+m.toFixed(2), +(Math.max(...v) - Math.min(...v)).toFixed(2)];
  }
  return { ns: d.runs.map((r) => r.ns), bonds, ties: board.ties };
};
const angles = JSON.parse(readFileSync(anglesFile));
const gb1 = boil(b, boardB);
gb1.angles = angles.gb1.curve;
gb1.angleStats = angles.gb1.stats;
const homeodomain = boil(a, boardA);
homeodomain.angleStats = angles.enh.stats;
writeFileSync(out, JSON.stringify({ homeodomain, gb1 }));
