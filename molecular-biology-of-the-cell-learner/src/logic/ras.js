// The Ras switch and the three-kinase cascade. One stage's output sharpens through a steep response.
// The steep curves are fitted by hand so that one Ras moves the needle: they are not measured kinetics.
export const hill = (x, k = 0.4, n = 2) => (x ** n) / (k ** n + x ** n);

export function stepCascade(s, rasOn, dt) {
  const raf = s.raf + (rasOn - s.raf) * Math.min(1, dt / 0.6);
  const mek = s.mek + (hill(raf) * 1.12 - s.mek) * Math.min(1, dt / 0.8);
  const erk = s.erk + (hill(mek) * 1.12 - s.erk) * Math.min(1, dt / 1.0);
  return { raf, mek, erk };
}

// Measured GTP turnover per second (Wey 2013, H-Ras; Moghadamchargari 2019, K-Ras). Wild type alone, with GAP, and G12V with GAP.
export const KCAT = { intrinsic: 2e-4, gap: 18, g12vGap: 0.01 };
export const gapFold = () => KCAT.gap / KCAT.intrinsic;

// ERK duration, after Murphy 2002. ERK on makes Fos mRNA at once, and the protein follows later.
// Fos protein is lost quickly unless ERK is still on when it appears, because active ERK and its target RSK phosphorylate and stabilise it.
export const ERK_ON = 0.45;
export const newFos = () => ({ mrna: 0, loose: 0, stable: 0 });
export function stepFos(f, erk, dt) {
  const on = erk >= ERK_ON;
  const mrna = f.mrna + ((on ? 1 : 0) - f.mrna) * Math.min(1, dt / (on ? 2.5 : 5));
  const made = f.mrna * f.mrna * 0.55 * dt; // The protein lags behind its mRNA.
  const guarded = on ? f.loose * 0.05 * dt : 0;
  const loose = Math.max(0, f.loose + made - guarded - (f.loose / 2.2) * dt);
  const stable = Math.min(1, f.stable + guarded - (f.stable / 200) * dt);
  return { mrna, loose, stable };
}
