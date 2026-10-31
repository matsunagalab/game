// Rigid frames as AlphaFold2 writes them: T = (R, t), x_global = R x_local + t.
// R is a flat array of 9 numbers by rows. Jumper et al. 2021, Supplementary Algorithms 21 and 23 and section 1.8.

export const vec = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  unit(a) { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; },
};

export const IDENTITY = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });

// Algorithm 21: x1 = N, x2 = CA, x3 = C. e1 points from CA to C, N lies in the e1-e2 plane, e3 = e1 x e2.
export function frameFromAtoms(n, ca, c) {
  const v1 = vec.sub(c, ca);
  const v2 = vec.sub(n, ca);
  const e1 = vec.unit(v1);
  const u2 = vec.sub(v2, vec.scale(e1, vec.dot(e1, v2)));
  const e2 = vec.unit(u2);
  const e3 = vec.cross(e1, e2);
  return { R: [e1[0], e2[0], e3[0], e1[1], e2[1], e3[1], e1[2], e2[2], e3[2]], t: [ca[0], ca[1], ca[2]] };
}

export function mulRR(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}
export const mulRv = (r, v) => [
  r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
  r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
  r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
];
export const mulRtv = (r, v) => [
  r[0] * v[0] + r[3] * v[1] + r[6] * v[2],
  r[1] * v[0] + r[4] * v[1] + r[7] * v[2],
  r[2] * v[0] + r[5] * v[1] + r[8] * v[2],
];
export const transpose = (r) => [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];

// T1 o T2 = (R1 R2, R1 t2 + t1)
export function compose(a, b) {
  const t = mulRv(a.R, b.t);
  return { R: mulRR(a.R, b.R), t: [t[0] + a.t[0], t[1] + a.t[1], t[2] + a.t[2]] };
}
export const apply = (T, x) => { const y = mulRv(T.R, x); return [y[0] + T.t[0], y[1] + T.t[1], y[2] + T.t[2]]; };
// T^-1 o x
export const applyInverse = (T, x) => mulRtv(T.R, [x[0] - T.t[0], x[1] - T.t[1], x[2] - T.t[2]]);
export function invert(T) {
  const R = transpose(T.R);
  const t = mulRv(R, T.t);
  return { R, t: [-t[0], -t[1], -t[2]] };
}

// Algorithm 23: a non-unit quaternion (1, b, c, d). It favours small rotations and is always a valid rotation.
export function rotationFromBCD(b, c, d) {
  const s = 1 / Math.sqrt(1 + b * b + c * c + d * d);
  const a = s; b *= s; c *= s; d *= s;
  return [
    a * a + b * b - c * c - d * d, 2 * b * c - 2 * a * d, 2 * b * d + 2 * a * c,
    2 * b * c + 2 * a * d, a * a - b * b + c * c - d * d, 2 * c * d - 2 * a * b,
    2 * b * d - 2 * a * c, 2 * c * d + 2 * a * b, a * a - b * b - c * c + d * d,
  ];
}

// A rotation about a unit axis, used to spin a whole molecule and by the teaching update.
export function rotationAxisAngle(axis, angle) {
  const [x, y, z] = vec.unit(axis);
  const s = Math.sin(angle), c = Math.cos(angle), u = 1 - c;
  return [
    c + x * x * u, x * y * u - z * s, x * z * u + y * s,
    y * x * u + z * s, c + y * y * u, y * z * u - x * s,
    z * x * u - y * s, z * y * u + x * s, c + z * z * u,
  ];
}

export function det3(r) {
  return r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]);
}

// Backbone frames for a whole chain. atoms = { n, ca, c }, each a list of [x, y, z].
export const framesOf = (atoms) => atoms.ca.map((ca, i) => frameFromAtoms(atoms.n[i], ca, atoms.c[i]));

// The same rigid motion applied to every frame and point of a structure.
export const moveFrames = (frames, T) => frames.map((f) => compose(T, f));
export const movePoints = (pts, T) => pts.map((p) => apply(T, p));
