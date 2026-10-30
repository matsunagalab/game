// The player's force field, the reference values, and everything that survives a reload.
import { RAD_FS_TO_CM, ACC } from './physics/md.js';

export const REF = {
  CH: { k: 340, r0: 1.09, m1: 12.011, m2: 1.008, name: 'C–H', type: 'CT-HC' },
  OH: { k: 553, r0: 0.9572, m1: 15.999, m2: 1.008, name: 'O–H', type: 'OW-HW' },
  CC: { k: 310, r0: 1.526, m1: 12.011, m2: 12.011, name: 'C–C', type: 'CT-CT' },
  V: [1.411, -0.271, 3.145],
  thetaHOH: 104.52, bend: 1595,
  sigmaAr: 3.405, epsAr: 0.238, sigmaDimer: 3.347, epsDimer: 0.2846,
  qO: -0.834, qGas: -0.659, muGas: 1.855,
};

export const wavenumber = (k, m1, m2) => Math.sqrt(2 * k * (1 / m1 + 1 / m2) * ACC) * RAD_FS_TO_CM;

export const PLATES = [
  { id: 'pluck',  term: 0, no: 'I',    title: 'One bond, plucked' },
  { id: 'harp',   term: 0, no: 'II',   title: 'Three strings' },
  { id: 'well',   term: 0, no: 'III',  title: 'Where the bond rests' },
  { id: 'chord',  term: 1, no: 'IV',   title: 'The chord of water' },
  { id: 'step',   term: 1, no: 'V',    title: 'How big a time step?' },
  { id: 'organ',  term: 2, no: 'VI',   title: 'Butane, seen end on' },
  { id: 'expose', term: 2, no: 'VII',  title: 'A long exposure' },
  { id: 'dimer',  term: 3, no: 'VIII', title: 'Two argon atoms' },
  { id: 'drop',   term: 3, no: 'IX',   title: 'A drop of liquid argon' },
  { id: 'dipole', term: 4, no: 'X',    title: 'One water, in the gas' },
  { id: 'liquid', term: 4, no: 'XI',   title: 'A drop of water' },
  { id: 'map',    term: 5, no: 'XII',  title: 'The backbone map' },
  { id: 'fold',   term: 5, no: 'XIII', title: 'Run your force field' },
];

export const TIERS = ['', 'Major revision', 'Minor revision', 'Accepted'];

const KEY = 'ff-learner-1';
const blank = () => ({
  tiers: {},
  ff: {
    CH: null, OH: null, CC: null, r0CH: null, kCH2: null,
    kTheta: null, theta: null, dt: null, V: null,
    sigmaDimer: null, epsDimer: null, sigma: null, eps: null,
    qGas: null, q: null, map: null, antiShare: null, muted: false,
  },
});

export const save = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); const b = blank(); return { ...b, ...s, ff: { ...b.ff, ...s.ff } }; }
  } catch { /* private browsing: play without saving */ }
  return blank();
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function resetSave() {
  const b = blank();
  save.tiers = b.tiers; save.ff = b.ff;
  persist();
}

const f1 = v => v.toFixed(1).padStart(7), f3 = v => v.toFixed(3).padStart(7), f4 = v => v.toFixed(4).padStart(8);

// The player's parameters as an AMBER frcmod file.
export function frcmod() {
  const { ff } = save;
  const L = ['ff26 hand tuned', ''];
  const bond = [];
  if (ff.CH != null) bond.push(`CT-HC  ${f1(ff.CH)} ${f3(ff.r0CH ?? REF.CH.r0)}`);
  if (ff.OH != null) bond.push(`OW-HW  ${f1(ff.OH)} ${f3(REF.OH.r0)}`);
  if (ff.CC != null) bond.push(`CT-CT  ${f1(ff.CC)} ${f3(REF.CC.r0)}`);
  L.push('BOND', ...(bond.length ? bond : ['(empty)']), '');
  L.push('ANGL', ...(ff.kTheta != null ? [`HW-OW-HW ${f1(ff.kTheta)} ${ff.theta.toFixed(2).padStart(7)}`] : ['(empty)']), '');
  const dih = [];
  if (ff.V) ff.V.forEach((v, i) => {
    const signs = [0, 180, 0];                // V₂ is written with γ=180° in the OPLS form
    const k = v / 2;
    dih.push(`CT-CT-CT-CT 1 ${f3(Math.abs(k))} ${((k < 0 ? 180 : 0) + signs[i]) % 360 === 0 ? '  0.0' : '180.0'} ${i + 1}`);
  });
  L.push('DIHE', ...(dih.length ? dih : ['(empty)']), '');
  const non = [];
  if (ff.sigma != null) non.push(`Ar  ${f3(ff.sigma * 2 ** (1 / 6) / 2)} ${f4(ff.eps)}`);
  L.push('NONB', ...(non.length ? non : ['(empty)']), '');
  if (ff.q != null) L.push('CHARGE', `OW ${f3(ff.q)}`, `HW ${f3(-ff.q / 2)}`, '');
  if (ff.map) L.push('CMAP', 'ALA  24×24 grid, hand sculpted', '');
  return L.join('\n');
}

export function nextPlate() {
  return PLATES.findIndex(p => !save.tiers[p.id]);
}
export function fiveDone() {
  return PLATES.filter(p => p.term < 5).every(p => save.tiers[p.id]);
}
