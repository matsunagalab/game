// Kinetic proofreading after Hopfield (1974) and Ninio (1975).
// A wrong tRNA must pass two checks separated by an irreversible GTP hydrolysis, so the passing fractions multiply.
// Waiting longer at one check does not help past its limit: that limit is set by how the rates compare.
export const hopfieldError = (f, checks = 2) => f ** checks;

// The share of wrong tRNAs that go forward before they fall off, for two competing first-order rates.
export const passFraction = (forward, off) => forward / (forward + off);

// Rates per second in play. The ribosome senses the helix: a good fit fires EF-Tu's GTPase far sooner.
// In bacteria the gap is about 650-fold (Gromadski & Rodnina 2004). It is much smaller here, so that errors can be seen.
export const RATES = {
  slow: { good: 1.5, bad: 0.075, third: 0.55, off: 1.8, offThird: 1.2 },
  fast: { good: 3.8, bad: 1.6, third: 2, off: 1.8, offThird: 1.2 },
};
export const forwardRate = (r, kind) => (kind === 'cognate' ? r.good : kind === 'third' ? r.third : r.bad);
export const offRate = (r, kind) => (kind === 'cognate' ? 0 : kind === 'third' ? r.offThird : r.off);

// A wrong pair fires only in the moments it slips into a right-looking shape.
export const LOOK = { rate: 1.2, time: 0.18, share: 0.2 };
export function stepLook(t, dt, roll = Math.random) {
  t.look = Math.max(0, t.look - dt);
  if (t.look <= 0 && roll() < dt * LOOK.rate) t.look = LOOK.time;
}
export const lookFires = (t, r, dt, roll = Math.random) => t.look > 0 && roll() < (r.bad / LOOK.share) * dt;

// The same thing worked out. Waiting between looks ends in a look or a fall. A look ends in a firing, a fall, or nothing.
export function passBad(r) {
  const fire = r.bad / LOOK.share;
  const end = 1 - Math.exp(-(fire + r.off) * LOOK.time);
  const fires = (fire / (fire + r.off)) * end;
  const survives = 1 - end;
  const look = LOOK.rate / (LOOK.rate + r.off);
  return (look * fires) / (1 - look * survives);
}

// Runs n wrong tRNAs through both checks, each escape drawn independently.
export function runChecks(n, f1, f2, roll = Math.random) {
  let pass1 = 0; let pass2 = 0;
  for (let i = 0; i < n; i++) if (roll() < f1) { pass1 += 1; if (roll() < f2) pass2 += 1; }
  return { seen1: n, pass1, seen2: pass1, pass2 };
}

// "Together about 1 in N." If nothing got past both checks, there is no N to give, only the count.
export function together({ seen1, pass1, seen2, pass2 }) {
  if (pass1 === 0 || pass2 === 0) return { none: true, n: seen1 };
  return { none: false, n: Math.round((seen1 / pass1) * (seen2 / pass2)) };
}
export const chainErrors = (rate, length) => 1 - (1 - rate) ** length;
