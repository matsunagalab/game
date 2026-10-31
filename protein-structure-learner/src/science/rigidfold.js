// Fold prediction from a list of contacts, small enough to run on a phone.
// Helices and strands are rigid pieces, as their hydrogen bonds make them. Only how the pieces sit is unknown.
// Monte Carlo annealing looks for an arrangement that satisfies the contacts, keeps loops long enough to reach,
// and lets no two pieces overlap. It starts from random arrangements and never sees the native arrangement.

export const CONTACT_REACH = 7; // angstroms between the centres of two side chains that touch

const matOf = ([w, x, y, z]) => [
  1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
  2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
  2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
];

// Best rotation and translation taking P onto Q, both flat arrays. Returns the moved copy of P and the RMSD.
export function superpose(P, Q) {
  const n = P.length / 3;
  const cp = [0, 0, 0], cq = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    cp[k] += P[i * 3 + k] / n;
    cq[k] += Q[i * 3 + k] / n;
  }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += (P[i * 3 + a] - cp[a]) * (Q[i * 3 + b] - cq[b]);
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  let shift = 0;
  for (const r of N) for (const v of r) shift += Math.abs(v);
  let v = [1, 0.1, 0.1, 0.1];
  for (let it = 0; it < 300; it++) {
    const w = N.map((r, i) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + r[3] * v[3] + shift * v[i]);
    const l = Math.hypot(...w);
    v = w.map((x) => x / l);
  }
  const R = matOf(v);
  const apply = (x, y, z) => {
    const a = x - cp[0], b = y - cp[1], c = z - cp[2];
    return [R[0] * a + R[1] * b + R[2] * c + cq[0], R[3] * a + R[4] * b + R[5] * c + cq[1], R[6] * a + R[7] * b + R[8] * c + cq[2]];
  };
  let e = 0;
  const moved = new Float64Array(P.length);
  for (let i = 0; i < n; i++) {
    const w = apply(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    moved.set(w, i * 3);
    for (let k = 0; k < 3; k++) e += (w[k] - Q[i * 3 + k]) ** 2;
  }
  return { moved, rmsd: Math.sqrt(e / n), apply };
}

const rngOf = (seed) => {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

const quatMul = (a, b) => {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
};

// native: flat CA. tips: flat side-chain centres, same length. groups: [[a, b], ...] rigid ranges.
// Side chains point out of one face of a helix, so a contact also says which face of the piece is involved.
export function makeFolder(native, tips, groups) {
  const bodies = groups.map(([a, b]) => {
    const n = b - a + 1;
    const c = [0, 0, 0];
    for (let i = a; i <= b; i++) for (let k = 0; k < 3; k++) c[k] += native[i * 3 + k] / n;
    const pts = new Float64Array(n * 3);
    const sc = new Float64Array(n * 3);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) {
        pts[i * 3 + k] = native[(a + i) * 3 + k] - c[k];
        sc[i * 3 + k] = tips[(a + i) * 3 + k] - c[k];
      }
    return { a, b, n, pts, sc };
  });
  const bodyOf = new Int32Array(native.length / 3).fill(-1);
  groups.forEach(([a, b], g) => {
    for (let i = a; i <= b; i++) bodyOf[i] = g;
  });
  const m = bodies.length;
  const place = (body, q, t, i, from = body.pts) => {
    const r = q.mat;
    const k = (i - body.a) * 3;
    const x = from[k], y = from[k + 1], z = from[k + 2];
    return [r[0] * x + r[1] * y + r[2] * z + t[0], r[3] * x + r[4] * y + r[5] * z + t[1], r[6] * x + r[7] * y + r[8] * z + t[2]];
  };

  function energyOf(state, links) {
    let e = 0;
    for (const [i, j] of links) {
      const A = place(bodies[i.g], state[i.g], state[i.g].t, i.r, bodies[i.g].sc);
      const B = place(bodies[j.g], state[j.g], state[j.g].t, j.r, bodies[j.g].sc);
      const d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      if (d > CONTACT_REACH) e += (d - CONTACT_REACH) ** 2;
    }
    for (let g = 0; g + 1 < m; g++) {
      // The loop between two pieces can only stretch so far.
      const A = place(bodies[g], state[g], state[g].t, bodies[g].b);
      const B = place(bodies[g + 1], state[g + 1], state[g + 1].t, bodies[g + 1].a);
      const reach = 3.4 * (bodies[g + 1].a - bodies[g].b);
      const d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      if (d > reach) e += 4 * (d - reach) ** 2;
    }
    // No overlap: every second alpha carbon of each piece against the others.
    for (let g = 0; g < m; g++)
      for (let h = g + 1; h < m; h++) {
        for (let i = bodies[g].a; i <= bodies[g].b; i += 2) {
          const A = place(bodies[g], state[g], state[g].t, i);
          for (let j = bodies[h].a; j <= bodies[h].b; j += 2) {
            const B = place(bodies[h], state[h], state[h].t, j);
            const d2 = (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2;
            if (d2 < 36) e += 2 * (6 - Math.sqrt(d2)) ** 2;
          }
        }
      }
    return e;
  }

  // pairs: residue index pairs. A pair inside one rigid piece carries no information and is dropped.
  // keep: an earlier solution. It stands unless the new search beats it on the present contacts.
  function solve(pairs, { seed = 1, restarts = 6, steps = 2600, keep = null } = {}) {
    const links = pairs.filter(([i, j]) => bodyOf[i] >= 0 && bodyOf[j] >= 0 && bodyOf[i] !== bodyOf[j]).map(([i, j]) => [{ g: bodyOf[i], r: i }, { g: bodyOf[j], r: j }]);
    let best = keep ? { e: energyOf(keep, links), state: keep } : null;
    const rand = rngOf(seed * 7919 + 13);
    for (let run = 0; run < restarts; run++) {
      const state = bodies.map(() => {
        const q = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
        const l = Math.hypot(...q);
        const u = q.map((v) => v / l);
        return { q: u, mat: matOf(u), t: [(rand() - 0.5) * 30, (rand() - 0.5) * 30, (rand() - 0.5) * 30] };
      });
      let e = energyOf(state, links);
      let T = 30;
      const cool = (0.05 / T) ** (1 / steps);
      for (let s = 0; s < steps; s++, T *= cool) {
        const g = Math.floor(rand() * m);
        const old = state[g];
        const size = 0.25 + (T / 30) * 0.9;
        const dq = [1, (rand() - 0.5) * size, (rand() - 0.5) * size, (rand() - 0.5) * size];
        const l = Math.hypot(...dq);
        const nq = quatMul(dq.map((v) => v / l), old.q);
        const step = 0.8 + (T / 30) * 5;
        state[g] = { q: nq, mat: matOf(nq), t: old.t.map((v) => v + (rand() - 0.5) * step) };
        const ne = energyOf(state, links);
        if (ne <= e || rand() < Math.exp((e - ne) / T)) e = ne;
        else state[g] = old;
      }
      if (!best || e < best.e) best = { e, state: state.map((s) => ({ ...s })) };
    }
    return { ...best, links: links.length };
  }

  // Coordinates of the rigid residues in a solved arrangement, as a flat array aligned with `rigidIndex`.
  const rigidIndex = groups.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k));
  function coordsOf(state) {
    const out = new Float64Array(rigidIndex.length * 3);
    let k = 0;
    bodies.forEach((body, g) => {
      for (let i = body.a; i <= body.b; i++) {
        out.set(place(body, state[g], state[g].t, i), k * 3);
        k++;
      }
    });
    return out;
  }
  const nativeRigid = Float64Array.from(rigidIndex.flatMap((i) => [native[i * 3], native[i * 3 + 1], native[i * 3 + 2]]));
  return { solve, coordsOf, nativeRigid, rigidIndex, bodies, place };
}
