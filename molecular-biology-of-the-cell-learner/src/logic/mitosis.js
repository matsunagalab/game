// Anaphase logic. No separase until securin is gone, and no securin destruction until the spindle check is satisfied.
export const UB_NEEDED = 4;
export const canDegrade = (ub) => ub >= UB_NEEDED;
export function pairTension(p) { return p.a !== null && p.b !== null && p.a !== p.b; }
export const checkpointSatisfied = (pairs) => pairs.every(pairTension);
export const separaseActive = (securin) => securin === 0;
