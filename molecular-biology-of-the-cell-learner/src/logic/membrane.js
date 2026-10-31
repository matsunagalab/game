// Ion gradients: the Nernst and Goldman equations at body temperature, and the Post–Albers pump cycle.
const R = 8.314; const F = 96485;
export const nernst = (out, inside, z = 1, T = 310) => (R * T) / (z * F) * Math.log(out / inside) * 1000;
export function goldman(k, na, pNa = 0.04, T = 310) {
  return (R * T) / F * Math.log((k.o + pNa * na.o) / (k.i + pNa * na.i)) * 1000;
}

export const PUMP = { naOut: 3, kIn: 2, atp: 1 };

// Alternating access: an inner and an outer gate, never open together. Each call is one real event.
// E1 faces the cytosol. ATP phosphorylates the pump and shuts the inner gate. E2P faces outside.
// The second K+ releases the phosphate and shuts the outer gate.
export function newPump() { return { state: 'E1', inner: true, outer: false, na: 0, k: 0, cycles: 0, atp: 0, collapses: 0 }; }
export function pumpEvent(p, ev) {
  if (p.state === 'E1' && ev === 'Na' && p.na < 3) { p.na += 1; return true; }
  if (p.state === 'E1' && ev === 'ATP' && p.na === 3) { p.state = 'E1P'; p.atp += 1; p.inner = false; return true; }
  if (p.state === 'E1P' && ev === 'outer') { p.state = 'E2P'; p.outer = true; p.na = 0; return true; }
  if (p.state === 'E2P' && ev === 'K' && p.k < 2) {
    p.k += 1;
    if (p.k === 2) { p.state = 'E2'; p.outer = false; }
    return true;
  }
  if (p.state === 'E2' && ev === 'inner') { p.state = 'E1'; p.inner = true; p.k = 0; p.cycles += 1; return true; }
  // Opening one gate while the other stands open makes a hole through the membrane.
  if ((ev === 'outer' && p.inner) || (ev === 'inner' && p.outer)) { p.collapses += 1; return 'collapse'; }
  return false;
}
export function resetPump(p) { Object.assign(p, { state: 'E1', inner: true, outer: false, na: 0, k: 0 }); }
