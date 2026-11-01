// Language. English by default. A change is saved and the page reloads, so each string is built once, in one language.
import { load } from './save.js';

export const ja = load().lang === 'ja';

// Both languages sit side by side at each string, so a computed number is the same value in both.
export const tr = (en, jp) => (ja ? jp : en);
