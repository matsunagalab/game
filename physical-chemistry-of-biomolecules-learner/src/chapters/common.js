// Shared set-up for water experiments.
import { MBWater } from '../sim/mbwater.js';
import { WaterView } from '../waterview.js';
import { DENSITY, SNAPSHOT } from '../sim/mbtable.js';

// Density of the model liquid at pressure 0.19, measured in tools/precompute_mb.mjs.
export function rhoAt(T) {
  const k = DENSITY.findIndex(([t]) => t >= T);
  if (k <= 0) return DENSITY[0][1];
  if (k < 0) return DENSITY[DENSITY.length - 1][1];
  const [t0, r0] = DENSITY[k - 1];
  const [t1, r1] = DENSITY[k];
  return r0 + ((r1 - r0) * (T - t0)) / (t1 - t0);
}

export const heatOf = (T) => Math.max(0, Math.min(1, (T - 0.16) / 0.15));

// A live box of water, equilibrated from a stored snapshot so the print opens as a real network.
export function liveWater(b, { T = 0.2, n = 150, solutes = [], area = 0, seed = 7, sweepsAt = 1, drawWater = true } = {}) {
  const L = Math.sqrt((n + area) / rhoAt(T));
  const w = new MBWater({ n, L, T, seed: seed + Math.floor(Math.random() * 1e6) });
  const snap = SNAPSHOT;
  if (snap.length >= n * 3) {
    for (let i = 0; i < n; i++) {
      w.x[i] = (snap[i * 3] / 1000) * L;
      w.y[i] = (snap[i * 3 + 1] / 1000) * L;
      w.setArms(i, (snap[i * 3 + 2] / 1000) * 2 * Math.PI);
    }
    w.rebuild();
  }
  w.step = 0.1 + Math.max(0, T - 0.18) * 1.1;
  w.turn = w.step * 3;
  for (const s of solutes) w.addSolute({ x: s.x * L, y: s.y * L, s: s.s ?? 1, e: 0.1, hard: s.hard });
  w.clearHard();
  b.world(L);
  const view = new WaterView(w, b);
  const lab = { w, view, frozen: false, sweeps: 0, free: false };
  let tuner = 0;
  b.each((dt) => {
    if (!lab.frozen) {
      b.pace.run((c) => {
        w.sweep(c);
        lab.sweeps += c;
        if (lab.free) for (const s of w.solutes) for (let k = 0; k < c; k++) w.moveSolute(s, 0.3);
      }, sweepsAt);
      if (++tuner % 30 === 0) w.tune();
    }
    view.update(dt);
  });
  // One koto note for every 25 new bonds, so faster bonding is heard as a faster roll.
  let owed = 0;
  view.onBond = (fresh) => {
    owed += fresh;
    if (owed < 25) return;
    owed = 0;
    b.sound.event(3 + Math.floor(Math.random() * 7), 0.08, (Math.random() - 0.5) * 0.7, 0.06);
  };
  if (drawWater) b.draw((r) => view.draw(r));
  // Settle quickly: the snapshot is near enough that a short burst finishes the job.
  w.sweep(30);
  view.update(0.2);
  view.sx.set(w.x); view.sy.set(w.y); view.st.set(w.t);
  return lab;
}

// Marks shell waters so the view tints them, and returns how many there are now.
export function markShell(lab, cut = 1.55) {
  const { w, view } = lab;
  const { L, n } = w;
  view.fade.fill(0);
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (const s of w.solutes) {
      let dx = w.x[i] - s.x;
      let dy = w.y[i] - s.y;
      dx -= L * Math.round(dx / L);
      dy -= L * Math.round(dy / L);
      const c = s.hard !== undefined ? s.hard + 0.75 : cut;
      if (dx * dx + dy * dy < c * c) { view.fade[i] = 1; count++; break; }
    }
  }
  return count;
}

export function drawSolutes(b, lab, r, tint = [0.87, 0.66, 0.28]) {
  for (const s of lab.w.solutes) {
    const [x, y] = b.px(s.x, s.y);
    const rad = (s.hard !== undefined ? s.hard - 0.12 : s.s * 0.6) * b.scale;
    r.disk(x, y, rad, tint);
  }
}

export const fmtKT = (T) => `kT ${T.toFixed(2)}`;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Scale the box and everything in it. The player sees the world grow a little, never a jump in density.
export function setBox(b, lab, L1) {
  const { w } = lab;
  const f = L1 / w.L;
  for (let i = 0; i < w.n; i++) {
    w.x[i] *= f; w.y[i] *= f;
    lab.view.sx[i] *= f; lab.view.sy[i] *= f;
  }
  for (const s of w.solutes) { s.x *= f; s.y *= f; }
  w.L = L1;
  w.grid(L1);
  w.rebuild();
  b.world(L1);
}

// Sets temperature, and eases the box to the density the model has at that temperature.
export function setT(b, lab, T, extra = 0) {
  const { w } = lab;
  w.T = T;
  w.step = 0.1 + Math.max(0, T - 0.18) * 1.1;
  w.turn = w.step * 3;
  setBox(b, lab, Math.sqrt((w.n + extra) / rhoAt(T)));
  b.heat(heatOf(T));
}

// Linear interpolation in a table of rows sorted by .T.
export function byT(rows, T, key) {
  if (T <= rows[0].T) return rows[0][key];
  for (let i = 1; i < rows.length; i++) {
    if (T <= rows[i].T) {
      const a = rows[i - 1], c = rows[i];
      return a[key] + ((c[key] - a[key]) * (T - a.T)) / (c.T - a.T);
    }
  }
  return rows[rows.length - 1][key];
}
