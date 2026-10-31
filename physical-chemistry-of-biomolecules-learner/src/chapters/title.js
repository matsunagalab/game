// The title print: a tiled box of live water with one oil drop.
import { liveWater, markShell, drawSolutes } from './common.js';

export async function titleScene(b) {
  const lab = liveWater(b, { T: 0.19, n: 110, solutes: [{ x: 0.5, y: 0.42, s: 1 }], area: 1, sweepsAt: 0.6 });
  const s = Math.min(innerWidth, innerHeight);
  b.pattern(true);
  b.heat(0.3);
  // The box repeats across the window, so the ink fills the page.
  const L = lab.w.L;
  b.world(L * Math.max(1, 560 / s) * (s / 560));
  lab.view.tile = 2;
  lab.view.onBond = null;
  b.each(() => markShell(lab));
  b.draw((r) => drawSolutes(b, lab, r));
  await new Promise(() => {});
}
