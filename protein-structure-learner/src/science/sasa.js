// Solvent accessible surface by the method of Shrake and Rupley, J Mol Biol 1973.
// atoms: flat [x, y, z, ...], radii: one van der Waals radius per atom. Returns square angstroms per atom.
// Free of three.js and the page, so it runs in Node as well.

export const VDW = { C: 1.7, N: 1.55, O: 1.52, S: 1.8, P: 1.8, F: 1.5, Z: 1.4 };
export const PROBE = 1.4;

export function spherePoints(count) {
  const out = new Float64Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    out[i * 3] = Math.cos(golden * i) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(golden * i) * r;
  }
  return out;
}

export function sasa(xyz, radii, { points = 92, probe = PROBE, blockers = null } = {}) {
  const n = radii.length;
  const unit = spherePoints(points);
  const all = blockers ? { xyz: [...xyz, ...blockers.xyz], radii: [...radii, ...blockers.radii] } : { xyz, radii };
  const total = all.radii.length;
  const big = (Math.max(...all.radii) + probe) * 2;
  const key = (x, y, z) => `${Math.floor(x / big)},${Math.floor(y / big)},${Math.floor(z / big)}`;
  const grid = new Map();
  for (let i = 0; i < total; i++) {
    const k = key(all.xyz[i * 3], all.xyz[i * 3 + 1], all.xyz[i * 3 + 2]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const out = new Float64Array(n);
  const near = [];
  for (let a = 0; a < n; a++) {
    const ax = all.xyz[a * 3], ay = all.xyz[a * 3 + 1], az = all.xyz[a * 3 + 2];
    const ra = radii[a] + probe;
    near.length = 0;
    const cx = Math.floor(ax / big), cy = Math.floor(ay / big), cz = Math.floor(az / big);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const cell = grid.get(`${cx + i},${cy + j},${cz + k}`);
          if (!cell) continue;
          for (const b of cell) {
            if (b === a) continue;
            const rb = all.radii[b] + probe;
            const dx = ax - all.xyz[b * 3], dy = ay - all.xyz[b * 3 + 1], dz = az - all.xyz[b * 3 + 2];
            if (dx * dx + dy * dy + dz * dz < (ra + rb) ** 2) near.push(all.xyz[b * 3], all.xyz[b * 3 + 1], all.xyz[b * 3 + 2], rb * rb);
          }
        }
    let open = 0;
    let last = 0; // the atom that blocked the previous point usually blocks the next one too
    for (let p = 0; p < points; p++) {
      const px = ax + unit[p * 3] * ra, py = ay + unit[p * 3 + 1] * ra, pz = az + unit[p * 3 + 2] * ra;
      let free = true;
      for (let q = 0; q < near.length; q += 4) {
        const s = (q + last) % near.length;
        const dx = px - near[s], dy = py - near[s + 1], dz = pz - near[s + 2];
        if (dx * dx + dy * dy + dz * dz < near[s + 3]) {
          free = false;
          last = s;
          break;
        }
      }
      if (free) open++;
    }
    out[a] = (4 * Math.PI * ra * ra * open) / points;
  }
  return out;
}

// Buried surface of a complex: for each atom of A and B, how much area the partner hides.
export function buried(A, B, options) {
  const freeA = sasa(A.xyz, A.radii, options);
  const freeB = sasa(B.xyz, B.radii, options);
  const boundA = sasa(A.xyz, A.radii, { ...options, blockers: B });
  const boundB = sasa(B.xyz, B.radii, { ...options, blockers: A });
  const sum = (x) => x.reduce((s, v) => s + v, 0);
  return { freeA, freeB, boundA, boundB, area: sum(freeA) - sum(boundA) + sum(freeB) - sum(boundB) };
}
