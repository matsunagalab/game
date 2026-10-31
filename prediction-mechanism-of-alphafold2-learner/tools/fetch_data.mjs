// Fetches the real data once, into a cache folder outside the repository. Nothing here runs in the game.
//   node tools/fetch_data.mjs
// Sources: InterPro (Pfam full alignments), RCSB (PDB files), AlphaFold DB API (entry metadata only: see below).
// Downloads go through plain curl, one at a time. AlphaFold DB answered Node's built-in fetch with 403 and curl with 200.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CACHE = process.env.DATA_CACHE || join(homedir(), '.cache/alphafold2-learner-data');
export const PFAM = 'PF00072';
export const PDB = ['3CHY', '4AKE', '1AKE', '1CLL', '1CDL', '1CFD', '2QKE', '5JYT', '1SHG'];
export const AFDB = ['P0AE67', 'P69441', 'P0DP23', 'P04637', 'P37840', 'Q13542', 'Q79V61'];

function save(url, path) {
  if (existsSync(path)) return;
  execFileSync('curl', ['-sS', '--fail', '-m', '600', '-o', path, url]);
  console.log('saved', path);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(CACHE, { recursive: true });
  save(`https://www.ebi.ac.uk/interpro/wwwapi/entry/pfam/${PFAM}/?annotation=alignment:full`, join(CACHE, `${PFAM}.full.gz`));
  save('https://www.ebi.ac.uk/interpro/wwwapi/entry/pfam/PF00018/?annotation=alignment:full', join(CACHE, 'PF00018.full.gz'));
  for (const id of PDB) save(`https://files.rcsb.org/download/${id}.pdb`, join(CACHE, `${id}.pdb`));
  // AlphaFold DB's /files/ paths answered 403 Forbidden at build time, so models come from EBI's public archives instead.
  // tools/pick_afdb.py reads single entries from those archives by HTTP Range. If the PAE files become reachable, or you
  // save them by hand as <accession>.pae.json in the cache folder, tools/pack_data.mjs will include them.
  for (const acc of AFDB) {
    const info = join(CACHE, `${acc}.json`);
    save(`https://alphafold.ebi.ac.uk/api/prediction/${acc}`, info);
  }
}
