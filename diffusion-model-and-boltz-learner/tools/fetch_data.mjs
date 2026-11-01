// Downloads the raw data to a cache folder outside this repository. Everything comes from documented public services.
//   CACHE=/some/folder node tools/fetch_data.mjs
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = process.env.CACHE || './cache';
const PDB = join(CACHE, 'pdb');
mkdirSync(PDB, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let k = 0; k < tries; k += 1) {
    const r = await fetch(url);
    if (r.ok) return r.text();
    if (r.status === 404) return null;
    await sleep(1500 * (k + 1));
  }
  return null;
}

// A fixed list of high-resolution chains, one from each cluster at 30% sequence identity (RCSB Search API).
async function highRes() {
  const f = join(CACHE, 'highres.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const body = {
    query: {
      type: 'group', logical_operator: 'and', nodes: [
        { type: 'terminal', service: 'text', parameters: { attribute: 'exptl.method', operator: 'exact_match', value: 'X-RAY DIFFRACTION' } },
        { type: 'terminal', service: 'text', parameters: { attribute: 'rcsb_entry_info.resolution_combined', operator: 'less_or_equal', value: 1.5 } },
        { type: 'terminal', service: 'text', parameters: { attribute: 'refine.ls_R_factor_R_free', operator: 'less_or_equal', value: 0.22 } },
        { type: 'terminal', service: 'text', parameters: { attribute: 'entity_poly.rcsb_entity_polymer_type', operator: 'exact_match', value: 'Protein' } },
        { type: 'terminal', service: 'text', parameters: { attribute: 'entity_poly.rcsb_sample_sequence_length', operator: 'range', value: { from: 80, to: 400 } } },
      ],
    },
    return_type: 'polymer_entity',
    request_options: {
      paginate: { start: 0, rows: 1500 },
      group_by: { aggregation_method: 'sequence_identity', similarity_cutoff: 30, ranking_criteria_type: { sort_by: 'rcsb_entry_info.resolution_combined', direction: 'asc' } },
      group_by_return_type: 'representatives', results_verbosity: 'compact',
    },
  };
  const r = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  writeFileSync(f, JSON.stringify(j.result_set));
  return j.result_set;
}

function pick(list, n) {
  // A small fixed shuffle, so the set can be rebuilt exactly from the same query.
  const a = [...list].sort();
  let s = 20261101;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

const list = pick(await highRes(), 420).map((x) => x.split('_')[0]);
const ADK = ['1AKE', '1ANK', '1E4V', '1E4Y', '2ECK', '3HPQ', '3HPR', '4AKE', '4X8H', '4X8L', '4X8M', '4X8O', '5EJE', '6F7U', '6HAM', '6HAP', '6RZE', '6S36', '7APU', '8BQF', '8CRG', '8PVW', '8Q2B', '8RJ4', '8RJ6', '8RJ9', '9L14', '9R6U', '9R71'];
const UB = ['2K39', '1D3Z', '1UBQ', '1XQQ'];
const all = [...new Set([...UB, ...ADK, ...list])];
let got = 0, miss = [];
for (const id of all) {
  const f = join(PDB, `${id}.pdb`);
  if (existsSync(f)) continue;
  let t = await get(`https://files.rcsb.org/download/${id}.pdb`);
  if (!t) { miss.push(id); await sleep(100); continue; }
  writeFileSync(f, t); got += 1;
  if (got % 40 === 0) console.log(got, 'of', all.length);
  await sleep(60);
}
console.log('fetched', got, 'missing (no legacy PDB file)', miss.length, miss.slice(0, 30).join(' '));
