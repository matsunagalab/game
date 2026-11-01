// Noise schedules and samplers. D(x, s, out) must write the denoised guess for one point of `dim` numbers.
// References: Karras et al. 2022, Algorithms 1 and 2, Table 1. Abramson et al. 2024, Supplementary Algorithm 18.

// sigma_i = (smax^(1/rho) + i/(N-1) (smin^(1/rho) - smax^(1/rho)))^rho, then a final 0.
export function schedule(N, smin, smax, rho) {
  const a = smax ** (1 / rho), b = smin ** (1 / rho), out = [];
  for (let i = 0; i < N; i += 1) out.push((a + (N === 1 ? 0 : i / (N - 1)) * (b - a)) ** rho);
  out.push(0);
  return out;
}

// The schedule Boltz uses (src/boltz/model/modules/diffusionv2.py, sample_schedule): the same formula in units of sigma_data.
export const boltzSchedule = (N, { smin = 0.0001, smax = 160, rho = 7, sdata = 16 } = {}) => schedule(N, smin, smax, rho).map((s) => s * sdata);

// One step of the probability-flow ODE, dx/ds = (x - D(x; s)) / s.
export function euler(x, s0, s1, D, buf, dim = 2) {
  D(x, s0, buf);
  const k = (s1 - s0) / s0;
  for (let c = 0; c < dim; c += 1) x[c] += k * (x[c] - buf[c]);
}

// Heun's second-order step. Karras et al. 2022, Algorithm 1. Two denoiser calls, except the last step.
export function heun(x, s0, s1, D, buf, dim = 2, tmp = new Float64Array(dim * 2)) {
  D(x, s0, buf);
  for (let c = 0; c < dim; c += 1) { tmp[c] = (x[c] - buf[c]) / s0; tmp[dim + c] = x[c] + (s1 - s0) * tmp[c]; }
  if (s1 === 0) { for (let c = 0; c < dim; c += 1) x[c] = tmp[dim + c]; return 1; }
  const y = tmp.subarray(dim, dim * 2);
  D(y, s1, buf);
  for (let c = 0; c < dim; c += 1) x[c] += (s1 - s0) * 0.5 * (tmp[c] + (y[c] - buf[c]) / s1);
  return 2;
}

// The stochastic step of AlphaFold3 Algorithm 18, which Boltz also uses.
// With gamma = 0, lambda = 1 and eta = 1 it reduces to euler(). Noise is added first, then one first-order step with a step scale.
export function stochasticStep(x, s0, s1, D, buf, rng, { gamma0 = 0.8, gammaMin = 1, lambda = 1.003, eta = 1.5 } = {}, dim = 2) {
  const g = s1 > gammaMin ? gamma0 : 0, hat = s0 * (1 + g), v = lambda * lambda * (hat * hat - s0 * s0);
  if (v > 0) { const r = Math.sqrt(v); for (let c = 0; c < dim; c += 1) x[c] += r * rng.n(); }
  D(x, hat, buf);
  const k = eta * (s1 - hat) / hat;
  for (let c = 0; c < dim; c += 1) x[c] += k * (x[c] - buf[c]);
}

// Karras et al. 2022, Algorithm 2, with churn gamma (a fraction) and the second-order correction.
export function churnHeun(x, s0, s1, D, buf, rng, gamma, dim = 2, tmp = new Float64Array(dim * 2)) {
  const hat = s0 * (1 + gamma), r = Math.sqrt(Math.max(0, hat * hat - s0 * s0));
  for (let c = 0; c < dim; c += 1) x[c] += r * rng.n();
  return heun(x, hat, s1, D, buf, dim, tmp);
}

// EDM preconditioning. Karras et al. 2022, Table 1. Boltz uses these same forms with sdata = 16 A.
export const edm = {
  cskip: (s, d) => (d * d) / (s * s + d * d),
  cout: (s, d) => (s * d) / Math.sqrt(s * s + d * d),
  cin: (s, d) => 1 / Math.sqrt(s * s + d * d),
  cnoise: (s, d = 1) => Math.log(s / d) / 4, // Karras writes ln(s)/4. Boltz writes ln(s/sdata)/4, which differs by a constant.
  lambda: (s, d) => (s * s + d * d) / (s * d) ** 2,
};
