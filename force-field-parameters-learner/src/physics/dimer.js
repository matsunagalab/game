// The finale: two rigid proteins and a grid of every way they can meet.
// Configuration: r (centre to centre), a (where B sits around A), b (how B is turned).
// The energy is a sum of terms, each with one force-field coefficient (q², not q, for the charges):
//   U = Usteric + q²·Uelec + Epp·Udisp + γ·Upw + w·Uwater + n·Ufix
// So each term is stored once on the grid and a new parameter set is only a weighted sum.
// Water sites are switched by hand-set "lost" and "held" rules, so the barrier and the water-separated well
// come from a simple site model, not from simulated water.
export const KT = 0.596;
export const NR = 44, NA = 36, NB = 36;
export const R0 = 18.0, DR = 0.4;
export const N_CONF = NR * NA * NB;
export const TERMS = ['elec', 'disp', 'pw', 'water', 'fix'];
const D = Math.PI / 180;

export const TYPE = { P: 0, H: 1, POS: 2, NEG: 3 };
const SIGMA = 4.6;            // bead contact distance, Å
const WATER = 3.7;            // bead to water site distance. Two of these minus SIGMA is one water layer, 2.8 Å
const SALT = 4.8;             // contact distance of a salt-bridge pair, Å
const LOST_AT = 3.05, LOST = 1.15, BRIDGE = 0.04, LAYER = 0.14, GREASE = 1.0;   // water site energies, see Grid.one
const FORBIDDEN = 1e4;

const bump = (t, c, w) => { let d = ((t - c + 180) % 360 + 360) % 360 - 180; d /= w; return Math.exp(-d * d); };

// Perimeter in the plane z = 0. The shape is a radius for each direction; beads sit at equal arc length.
function outline(radius, nBeads) {
  const M = 720, pts = [];
  let len = 0, px = 0, py = 0;
  for (let i = 0; i <= M; i++) {
    const t = i / M * 360, r = radius(t), x = r * Math.cos(t * D), y = r * Math.sin(t * D);
    if (i) len += Math.hypot(x - px, y - py);
    pts.push([x, y, len, t]); px = x; py = y;
  }
  const out = [];
  let k = 0;
  for (let i = 0; i < nBeads; i++) {
    const s = (i + 0.5) / nBeads * len;
    while (pts[k + 1][2] < s) k++;
    const [x, y, , t] = pts[k], [x2, y2] = pts[Math.min(M, k + 1)];
    let nx = y2 - y, ny = x - x2;
    const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    if (nx * x + ny * y < 0) { nx = -nx; ny = -ny; }
    out.push({ x, y, nx, ny, t });
  }
  return out;
}

// A: a pocket at 0° (the native site) and a shallow decoy pocket at 130°.
// B: a knob at 0° that fits the pocket.
const radiusA = t => 10.2 - 3.0 * bump(t, 0, 30) - 1.9 * bump(t, 130, 24);
// Its surface is A's pocket, offset by one contact distance, so the native fit is real shape complementarity.
export const R_NATIVE = 23.6;
const knob = (() => {
  const pts = [];
  for (let t = -60; t <= 60; t += 1) {
    const r = radiusA((t + 360) % 360), x = r * Math.cos(t * D), y = r * Math.sin(t * D);
    const r2 = radiusA((t + 361) % 360), x2 = r2 * Math.cos((t + 1) * D), y2 = r2 * Math.sin((t + 1) * D);
    let nx = y2 - y, ny = x - x2;
    const n = Math.hypot(nx, ny); nx /= n; ny /= n;
    if (nx * x + ny * y < 0) { nx = -nx; ny = -ny; }
    // Into B's frame: B sits at +x, turned by 180°.
    const bx = -(x + nx * SIGMA - R_NATIVE), by = -(y + ny * SIGMA);
    pts.push([Math.atan2(by, bx) / D, Math.hypot(bx, by)]);
  }
  return pts.sort((a, b) => a[0] - b[0]);
})();
const R_BODY = 9.4;
const radiusB = t => {
  const a = t > 180 ? t - 360 : t;
  const w = Math.exp(-((a / 34) ** 6));          // blends from the knob into a round body
  let r = R_BODY;
  if (w > 1e-3) for (let i = 1; i < knob.length; i++) if (knob[i][0] >= a) { const [t0, r0] = knob[i - 1], [t1, r1] = knob[i]; r = r0 + (r1 - r0) * Math.max(0, Math.min(1, (a - t0) / (t1 - t0 || 1))); break; }
  return R_BODY + w * (r - R_BODY);
};

function typeA(t) {
  const d = Math.abs(((t + 180) % 360 + 360) % 360 - 180);
  if (d < 22) return TYPE.H;                                        // hydrophobic floor of the pocket
  if (t > 22 && t <= 44) return TYPE.NEG;                           // salt-bridge partners on the rim
  if (t > 316 && t <= 338) return TYPE.POS;
  if (t > 118 && t <= 142) return TYPE.H;                           // the decoy site: greasy too
  if (t > 142 && t <= 156) return TYPE.NEG;
  if (t > 200 && t <= 214) return TYPE.NEG;                         // far-side charge, for long-range steering
  return TYPE.P;
}
function typeB(t) {
  const d = Math.abs(((t + 180) % 360 + 360) % 360 - 180);
  if (d < 20) return TYPE.H;                                        // hydrophobic tip of the knob
  if (t > 20 && t <= 42) return TYPE.NEG;                           // lands opposite A's positive rim when turned 180°
  if (t > 318 && t <= 340) return TYPE.POS;
  if (t > 170 && t <= 186) return TYPE.POS;                         // back charge
  return TYPE.P;
}

function makeProtein(radius, typeOf, nBeads) {
  const beads = outline(radius, nBeads).map(p => ({ ...p, type: typeOf(p.t) }));
  const shell = beads.map(b => ({ x: b.x + b.nx * WATER, y: b.y + b.ny * WATER, type: b.type }));
  return { beads, shell };
}

export const PROT_A = makeProtein(radiusA, typeA, 34);
export const PROT_B = makeProtein(radiusB, typeB, 34);

// Contact strength of each pair of types. Hydrophobic pairs are the strongest.
const DISP = [[0.16, 0.16, 0.16, 0.16], [0.16, 1.05, 0.16, 0.16], [0.16, 0.16, 0.16, 0.16], [0.16, 0.16, 0.16, 0.16]];
const CHARGE = [0, 0, 1, -1];
const POLAR = [1, 0.1, 1.5, 1.5];      // how much a site's water is held

const eps = r => 78 - 74 * Math.exp(-r / 2.8);     // distance-dependent dielectric, screens quickly in water
const KAPPA = 1 / 9;                               // about 100 mM salt

export const NATIVE_POSE = { r: R_NATIVE, a: 0, b: 180 };
export const conf = (ir, ia, ib) => ir + NR * (ia + NA * ib);
export const rOf = ir => R0 + ir * DR;

// Sets positions for one configuration: A fixed at the origin, B at distance r in direction a, turned by b.
function placeB(r, aDeg, bDeg, src, dst) {
  const ca = Math.cos(aDeg * D), sa = Math.sin(aDeg * D), cb = Math.cos(bDeg * D), sb = Math.sin(bDeg * D);
  const ox = r * ca, oy = r * sa;
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    dst[2 * i] = ox + cb * s.x - sb * s.y;
    dst[2 * i + 1] = oy + sb * s.x + cb * s.y;
  }
}

export function bPose(r, aDeg, bDeg) {
  const n = PROT_B.beads.length, b = new Float64Array(2 * n), w = new Float64Array(2 * n);
  placeB(r, aDeg, bDeg, PROT_B.beads, b); placeB(r, aDeg, bDeg, PROT_B.shell, w);
  return { b, w };
}

export class Grid {
  constructor() {
    this.terms = {};
    for (const t of TERMS) this.terms[t] = new Float32Array(N_CONF);
    this.steric = new Float32Array(N_CONF);
    this.U = new Float32Array(N_CONF);
    this.next = 0;
    this.nb = PROT_B.beads.length;
    this.minA = new Float64Array(PROT_A.beads.length); this.minB = new Float64Array(this.nb);
    this.near = new Float32Array(N_CONF).fill(99);
    this.bx = new Float64Array(2 * this.nb); this.wx = new Float64Array(2 * this.nb);
    // The orientational sum is reused for the bound-state volume.
    this.rw = new Float64Array(NR);
    for (let ir = 0; ir < NR; ir++) this.rw[ir] = rOf(ir) ** 2;
  }
  get done() { return this.next >= NR; }
  // Tag each configuration once the geometry is known.
  label() {
    this.state = new Uint8Array(N_CONF);
    for (let ib = 0; ib < NB; ib++) for (let ia = 0; ia < NA; ia++) for (let ir = 0; ir < NR; ir++) { const q = conf(ir, ia, ib); this.state[q] = classify(this.near[q], ia * 10, ib * 10); }
  }
  // Fills one radial slice; call until done. Each slice is a few milliseconds.
  slice() {
    const ir = this.next++, r = rOf(ir);
    for (let ib = 0; ib < NB; ib++) for (let ia = 0; ia < NA; ia++) this.one(ir, ia, ib, r);
  }
  fill() { while (!this.done) this.slice(); this.label(); }
  one(ir, ia, ib, r) {
    const A = PROT_A, B = PROT_B, { bx, wx, nb, minA, minB } = this;
    placeB(r, ia * 10, ib * 10, B.beads, bx);
    placeB(r, ia * 10, ib * 10, B.shell, wx);
    const na = A.beads.length, q = conf(ir, ia, ib), T = this.terms;
    // A steric clash ends the calculation: this configuration cannot exist.
    const clash = (0.74 * SIGMA) ** 2;
    let near = 1e9;
    for (let i = 0; i < na; i++) {
      const a = A.beads[i];
      for (let j = 0; j < nb; j++) {
        const dx = a.x - bx[2 * j], dy = a.y - bx[2 * j + 1], d2 = dx * dx + dy * dy;
        if (d2 < clash) { this.steric[q] = FORBIDDEN; this.near[q] = 0; return; }
        if (d2 < near) near = d2;
      }
    }
    this.near[q] = Math.sqrt(near);
    const far = near > 121;                          // more than 11 Å apart: only charges still reach
    let st = 0, el = 0, di = 0, pw = 0, wa = 0, fx = 0;
    const s2 = SIGMA * SIGMA;
    if (!far) { minA.fill(1e9); minB.fill(1e9); }
    for (let i = 0; i < na; i++) {
      const a = A.beads[i], sa = A.shell[i], ti = a.type, qa = CHARGE[ti];
      for (let j = 0; j < nb; j++) {
        const dx = a.x - bx[2 * j], dy = a.y - bx[2 * j + 1], d2 = dx * dx + dy * dy, tj = B.beads[j].type, qb = CHARGE[tj];
        if (qa && qb) {
          const d = Math.sqrt(d2);
          el += 332 * qa * qb * Math.exp(-KAPPA * d) / (eps(d) * d);
          if (qa * qb < 0) fx += Math.exp(-(((d - SALT) / 1.1) ** 2));   // NBFIX: pushes this one kind of pair out of contact
        }
        if (far) continue;
        if (d2 < 144) {
          const m = s2 / d2, m3 = m * m * m;
          st += 0.2 * m3 * m3;                                           // repulsive wall
          di -= DISP[ti][tj] * m3 / (1 + 0.25 * m3 * m3);                // softened attractive tail
        }
        // How close does the other protein come to each water site?
        const ex = sa.x - bx[2 * j], ey = sa.y - bx[2 * j + 1], e2 = ex * ex + ey * ey;
        if (e2 < minA[i]) minA[i] = e2;
        const fa = wx[2 * j] - a.x, fb = wx[2 * j + 1] - a.y, f2 = fa * fa + fb * fb;
        if (f2 < minB[j]) minB[j] = f2;
      }
    }
    if (!far) {
      const add = (d2, type) => {
        if (d2 > 49) return;
        const d = Math.sqrt(d2), lost = 1 / (1 + Math.exp((d - LOST_AT) / 0.22)), held = Math.exp(-(((d - WATER - 0.1) / 0.6) ** 2)) * (1 - lost), p = POLAR[type];
        pw += LOST * p * lost - BRIDGE * p * held;       // a water squeezed out, or a water held by both proteins
        wa += -LAYER * held - (type === TYPE.H ? GREASE * lost : 0);   // an ordered layer, or ordered water released from grease
      };
      for (let i = 0; i < na; i++) add(minA[i], A.beads[i].type);
      for (let j = 0; j < nb; j++) add(minB[j], B.beads[j].type);
    }
    this.steric[q] = st;
    T.elec[q] = el; T.disp[q] = di; T.pw[q] = pw; T.water[q] = wa; T.fix[q] = fx;
  }

  // New parameters: one weighted sum over the grid, then the Boltzmann weights.
  combine(p) {
    const { U, steric, terms: { elec, disp, pw, water, fix } } = this;
    const q2 = p.q * p.q, E = p.Epp, g = p.gamma, w = p.water, n = p.fix;
    for (let i = 0; i < N_CONF; i++) U[i] = steric[i] + q2 * elec[i] + E * disp[i] + g * pw[i] + w * water[i] + n * fix[i];
  }
}

// Named states, decided from the geometry alone. Populations are measured inside the bound region.
export const STATE = { FREE: 0, NATIVE: 1, ENCOUNTER: 2, SOLVENT: 3, DECOY: 4 };
export const STATES = ['free', 'native', 'encounter', 'water-separated', 'mis-bound'];
const CONTACT = 5.7, BOUND = 9.6;
export const wrapDeg = a => ((a + 180) % 360 + 360) % 360 - 180;
export function classify(near, aDeg, bDeg) {
  if (near >= BOUND) return STATE.FREE;
  const nat = Math.abs(wrapDeg(aDeg)) <= 25 && Math.abs(wrapDeg(bDeg - 180)) <= 30;
  const dec = Math.abs(wrapDeg(aDeg - 130)) <= 25 && Math.abs(wrapDeg(bDeg - 310)) <= 35;
  if (near < CONTACT) return nat ? STATE.NATIVE : dec ? STATE.DECOY : STATE.ENCOUNTER;
  if (near >= 6.3 && near <= 8.9 && nat) return STATE.SOLVENT;
  return STATE.ENCOUNTER;
}

// Boltzmann sum over the grid. Weight r² for the shell volume. Orientations are averaged.
export function observables(grid) {
  const { U, near } = grid;
  const pop = new Float64Array(5);
  let boundVol = 0;
  for (let ib = 0; ib < NB; ib++) for (let ia = 0; ia < NA; ia++) for (let ir = 0; ir < NR; ir++) {
    const q = conf(ir, ia, ib), s = grid.state[q];
    const u = U[q];
    if (u > 500 || s === STATE.FREE) continue;
    const w = Math.exp(-u / KT) * grid.rw[ir];
    pop[s] += w;
  }
  const z = pop[1] + pop[2] + pop[3] + pop[4];
  // K = 4π ∫ r² ⟨e^(−U/kT)⟩ dr over the bound region, in Å³ per pair, then in L/mol.
  const Ka = 4 * Math.PI * DR * z / (NA * NB) * 6.022e-4;
  // The non-native part of the second virial coefficient: how much proteins attract when they are not forming the complex.
  // B22 = −2π ∫ r² (⟨e^(−U/kT)⟩ − 1) dr, native configurations left out, in units of the hard-sphere value.
  let b = 0;
  for (let i = 0; i < N_CONF; i++) {
    const ir = i % NR;
    if (grid.state[i] === STATE.NATIVE) continue;
    const e = U[i] > 500 ? 0 : Math.exp(-U[i] / KT);
    b += (e - 1) * grid.rw[ir];
  }
  // Everything inside the first grid radius is fully excluded.
  const inner = R0 ** 3 / 3, shell = -b * DR / (NA * NB);
  const hard = (R_NATIVE + 1) ** 3 / 3;
  return { p: [pop[1] / z, pop[2] / z, pop[3] / z, pop[4] / z], Ka, Kd: 1 / Ka, dG: -KT * Math.log(Ka), b22: (inner + shell) / hard };
}
