// Surface patches in the spirit of Jones and Thornton, J Mol Biol 1997: take a patch of a set size around every
// surface residue, measure its profile, and ask how the real interface ranks among all of them.
// Free of three.js and the page.

export const PATCH_AREA = 800; // square angstroms per side in a standard complex, half of 1600. Obligate dimers run larger.
const CX_REACH = 10; // angstroms
const CX_ATOM_VOLUME = 20.1; // cubic angstroms per protein atom (Pintar et al., Bioinformatics 2002)

// Smallest eigenvalue of a symmetric 3x3 matrix, by Jacobi rotations.
function smallestEigen(M) {
  const a = M.map((r) => [...r]);
  for (let sweep = 0; sweep < 12; sweep++)
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-10) continue;
      const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) {
        const x = a[k][p], y = a[k][q];
        a[k][p] = c * x - s * y;
        a[k][q] = s * x + c * y;
      }
      for (let k = 0; k < 3; k++) {
        const x = a[p][k], y = a[q][k];
        a[p][k] = c * x - s * y;
        a[q][k] = s * x + c * y;
      }
    }
  return Math.min(a[0][0], a[1][1], a[2][2]);
}

// How well atoms lie on one plane: root mean square distance from the best plane, in angstroms.
export function planarity(points) {
  const n = points.length / 3;
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += points[i * 3 + k] / n;
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) M[a][b] += ((points[i * 3 + a] - c[a]) * (points[i * 3 + b] - c[b])) / n;
  return Math.sqrt(Math.max(0, smallestEigen(M)));
}

// atoms: atom indices of one chain or subunit. Returns everything the patches need.
export function surfaceOf(p, atoms, free) {
  const xyz = p.atomXYZ;
  const n = atoms.length;
  // Protrusion: empty space around each atom, over filled space (CX of Pintar et al.).
  const R2 = CX_REACH * CX_REACH;
  const sphere = (4 / 3) * Math.PI * CX_REACH ** 3;
  const cx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = atoms[i];
    if (!free[i]) continue;
    let near = 0;
    for (let j = 0; j < n; j++) {
      const b = atoms[j];
      const dx = xyz[a * 3] - xyz[b * 3], dy = xyz[a * 3 + 1] - xyz[b * 3 + 1], dz = xyz[a * 3 + 2] - xyz[b * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < R2) near++;
    }
    const inside = near * CX_ATOM_VOLUME;
    cx[i] = (sphere - inside) / inside;
  }
  // Group the surface by residue.
  const res = new Map();
  atoms.forEach((a, i) => {
    if (free[i] < 1) return;
    const r = p.atomRes[a];
    if (!res.has(r)) res.set(r, { r, area: 0, list: [], c: [0, 0, 0] });
    const e = res.get(r);
    e.area += free[i];
    e.list.push(i);
    for (let k = 0; k < 3; k++) e.c[k] += xyz[a * 3 + k] * free[i];
  });
  const residues = [...res.values()].filter((e) => e.area >= 5);
  for (const e of residues) for (let k = 0; k < 3; k++) e.c[k] /= e.area;
  return { atoms, free, cx, residues, xyz };
}

// A patch: the surface residues nearest one centre residue, until it holds the target area.
export function patchAt(s, centre, target = PATCH_AREA) {
  const c = s.residues[centre].c;
  const order = s.residues.map((e, i) => [(e.c[0] - c[0]) ** 2 + (e.c[1] - c[1]) ** 2 + (e.c[2] - c[2]) ** 2, i]).sort((a, b) => a[0] - b[0]);
  const members = [];
  let area = 0;
  for (const [, i] of order) {
    members.push(i);
    area += s.residues[i].area;
    if (area >= target) break;
  }
  return { centre, members, area };
}

export function profileOf(s, patch, p, lost = null, other = null) {
  let area = 0, nonpolar = 0, cx = 0, plus = 0, minus = 0, real = 0, elsewhere = 0;
  const pts = [];
  for (const m of patch.members) {
    const e = s.residues[m];
    const aa = p.seq[e.r];
    if ('KR'.includes(aa)) plus++;
    if ('DE'.includes(aa)) minus++;
    for (const i of e.list) {
      const a = s.atoms[i];
      area += s.free[i];
      if ('CS'.includes(p.atomEl[a])) nonpolar += s.free[i];
      cx += s.cx[i] * s.free[i];
      pts.push(s.xyz[a * 3], s.xyz[a * 3 + 1], s.xyz[a * 3 + 2]);
      if (lost) real += lost[i];
      if (other?.[i]) elsewhere += s.free[i];
    }
  }
  return { area, nonpolar: nonpolar / area, stickOut: cx / area, flatness: planarity(pts), plus, minus, real, elsewhere: elsewhere / area };
}

// Share of the whole surface on carbon and sulfur atoms.
export function surfaceNonpolar(p, atoms, free) {
  let a = 0, c = 0;
  atoms.forEach((x, i) => {
    a += free[i];
    if ('CS'.includes(p.atomEl[x])) c += free[i];
  });
  return c / a;
}

// All patches on a surface, each sized to the real interface. lost: area each atom loses to the partner.
// other: non-zero for atoms in a different known binding site, which cannot honestly serve as a decoy.
export function allPatches(p, atoms, free, lost, other = null) {
  const s = surfaceOf(p, atoms, free);
  const total = lost.reduce((t, v) => t + v, 0);
  const size = Math.max(PATCH_AREA, total);
  const patches = s.residues.map((_, i) => {
    const patch = patchAt(s, i, size);
    const profile = profileOf(s, patch, p, lost, other);
    return { ...patch, ...profile, overlap: profile.real / total };
  });
  return { s, patches, total, size };
}

// Rank from the top, 1 = most extreme, of a value among all patches. high: larger counts as more extreme.
export const rankOf = (patches, pick, value, high) => 1 + patches.filter((x) => (high ? pick(x) > value : pick(x) < value)).length;

// Decoys are drawn at random from every patch clear of the real interface and of other known sites.
// Choosing them far apart would favour patches that stick out, and bias the score of any simple rule.
export const eligible = (patches) => patches.filter((x) => x.overlap < 0.12 && x.elsewhere < 0.12);

export function drawDecoys(pool, rnd, real, count = 3) {
  const taken = [];
  // No candidate may be nearly the same patch as another, or the colours would hide each other.
  const clash = (x) => [real, ...taken].some((t) => t.members.filter((m) => x.members.includes(m)).length > x.members.length * 0.3);
  for (let tries = 0; taken.length < count && tries < 600; tries++) {
    const x = pool[Math.floor(rnd() * pool.length)];
    if (!clash(x)) taken.push(x);
  }
  // On a small chain three clear patches may not exist. Take the least overlapping of what is left.
  while (taken.length < count) {
    const rest = pool.filter((x) => !taken.includes(x));
    const shared = (x) => [real, ...taken].reduce((n, t) => n + t.members.filter((m) => x.members.includes(m)).length, 0);
    taken.push(rest.reduce((a, b) => (shared(b) < shared(a) ? b : a)));
  }
  return taken;
}

export const seeded = (seed) => {
  let v = (seed * 7919 + 17) % 2147483647 || 1;
  return () => (v = (v * 16807) % 2147483647) / 2147483647;
};

// Four same-size candidates: the patch that best covers the real interface, and three random decoys.
export function candidates(p, atoms, free, lost, seed = 1, other = null) {
  const { s, patches, total, size } = allPatches(p, atoms, free, lost, other);
  const real = patches.reduce((a, b) => (b.overlap > a.overlap ? b : a));
  const pool = eligible(patches);
  const list = [real, ...drawDecoys(pool, seeded(seed), real)];
  const ranks = {
    nonpolar: rankOf(patches, (x) => x.nonpolar, real.nonpolar, true),
    flatness: rankOf(patches, (x) => x.flatness, real.flatness, false),
    stickOut: rankOf(patches, (x) => x.stickOut, real.stickOut, true),
  };
  return { s, patches, real, list, ranks, total, size, pool };
}

// How often a simple rule finds the real patch among four, averaged over fresh draws of decoys.
export function ruleMean(cases, pick, draws = 500, seed = 11) {
  const rnd = seeded(seed);
  let wins = 0;
  for (let d = 0; d < draws; d++)
    for (const c of cases) {
      const four = [c.real, ...drawDecoys(c.pool, rnd, c.real)];
      if (four.reduce((a, b) => (pick(b) > pick(a) ? b : a)) === c.real) wins++;
    }
  return wins / draws;
}
