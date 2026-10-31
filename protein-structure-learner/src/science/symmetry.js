// What a set of contacts builds. Each copy of a subunit is one symmetry operator, a flat 3x4 matrix.
// A contact of kind g joins copy a to copy a·g. Free of three.js and the page.

export function compose(A, B) {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j];
    r[i * 4 + 3] = A[i * 4] * B[3] + A[i * 4 + 1] * B[7] + A[i * 4 + 2] * B[11] + A[i * 4 + 3];
  }
  return r;
}

const same = (x, y) => {
  let e = 0;
  for (let q = 0; q < 12; q++) e += Math.abs(x[q] - y[q]) * (q % 4 === 3 ? 0.02 : 1);
  return e < 0.3;
};

export const indexOfOp = (ops, m) => ops.findIndex((o) => same(o, m));
export const identityOf = (ops) => ops.findIndex((m) => Math.abs(m[0] - 1) + Math.abs(m[5] - 1) + Math.abs(m[10] - 1) < 0.02);

// Rotation angle in degrees, and the axis as a unit vector.
export function rotationOf(m) {
  const angle = (Math.acos(Math.min(1, Math.max(-1, (m[0] + m[5] + m[10] - 1) / 2))) * 180) / Math.PI;
  let axis = [m[9] - m[6], m[2] - m[8], m[4] - m[1]];
  const l = Math.hypot(...axis);
  if (l > 1e-4) return { angle, axis: axis.map((v) => v / l) };
  // At 180 degrees the skew part vanishes; the axis is the largest column of R + I.
  const col = [0, 1, 2].map((c) => [m[c] + (c === 0 ? 1 : 0), m[4 + c] + (c === 1 ? 1 : 0), m[8 + c] + (c === 2 ? 1 : 0)]);
  axis = col.sort((a, b) => Math.hypot(...b) - Math.hypot(...a))[0];
  const n = Math.hypot(...axis);
  return { angle, axis: axis.map((v) => v / n) };
}

// How many times the contact repeats before it comes home.
export function orderOf(ops, g) {
  const home = ops[identityOf(ops)];
  let c = ops[g];
  let n = 1;
  while (!same(c, home) && n < 100) {
    c = compose(c, ops[g]);
    n++;
  }
  return n;
}

// Which copies are joined, once these contacts form. Returns a label per copy.
export function components(ops, gens) {
  const label = new Array(ops.length).fill(-1);
  let next = 0;
  for (let s = 0; s < ops.length; s++) {
    if (label[s] >= 0) continue;
    label[s] = next;
    const todo = [s];
    while (todo.length) {
      const a = todo.pop();
      for (const g of gens) {
        const b = indexOfOp(ops, compose(ops[a], ops[g]));
        if (b >= 0 && label[b] < 0) {
          label[b] = next;
          todo.push(b);
        }
      }
    }
    next++;
  }
  return label;
}

export const sizeOfPiece = (ops, gens) => {
  const l = components(ops, gens);
  return l.filter((v) => v === l[identityOf(ops)]).length;
};

// The operators for a ring written as powers of its contact, starting from the identity.
export function powersOf(ops, g) {
  const order = [identityOf(ops)];
  let c = ops[g];
  while (!same(c, ops[order[0]]) && order.length < 100) {
    order.push(indexOfOp(ops, c));
    c = compose(c, ops[g]);
  }
  return order;
}
