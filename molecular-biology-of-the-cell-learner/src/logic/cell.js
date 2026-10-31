// The state of the one cell that the player carries through the day.
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const newCell = () => ({ cyclin: null, copies: null, atp: null, vm: null, swell: 0, misfold: 0, delivered: false });

// Unplayed chapters count as a fair day, so any chapter can be opened on its own.
export const atpOf = (cell) => cell.atp ?? 70;
export const cyclinOf = (cell) => cell.cyclin ?? 0.8;

// A game budget. Real cells hold ATP nearly constant until something is badly wrong.
export const atpRate = (atp) => Math.min(1, Math.max(0.35, atp / 40));
export const spendATP = (cell, n) => { cell.atp = Math.max(0, atpOf(cell) - n); return cell.atp; };

// What chapter 5 leaves in stock: quick, clean work builds it up, and a slow chapter leaves it thin.
export const stockFrom = (seconds, slips) => Math.round(Math.min(100, Math.max(15, 132 - 2 * seconds - 10 * slips)));

// Too little cyclin D keeps the cell in G1 for longer.
export const delayHours = (cyclin) => Math.round((1 - cyclin) * 6);
export const copiesFrom = (cyclin) => 1 + Math.round(cyclin * 3);

export const BASE_HOURS = [0, 1, 2, 4, 8, 12, 18, 23];
export const hourOf = (i, cell) => BASE_HOURS[i] + (i >= 3 ? delayHours(cyclinOf(cell)) : 0);

export const swellFrom = (naInside) => clamp01((naInside - 15) / 110);
