// Turns PDB 1IGT (intact mouse IgG2a) into a compact module for the game.
// Source file: https://files.rcsb.org/download/1IGT.pdb
// Usage: node tools/prepare-structure.cjs path/to/1IGT.pdb
// Output: src/data/igg.js (coordinates in Å, paratope centred, facing +X).
const fs = require('fs');
const path = require('path');

const THREE_TO_ONE = {ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V'};
const SUGARS = new Set(['NAG','FUC','BMA','MAN','GAL','FUL','NDG','BGC']);

const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a, 1/Math.hypot(...a));
const mean = list => mul(list.reduce(add, [0,0,0]), 1/list.length);

function parse(file) {
  const residues = {A: [], B: [], C: [], D: []};
  const sugars = [];
  let last = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const rec = line.slice(0, 6).trim();
    if (rec !== 'ATOM' && rec !== 'HETATM') continue;
    if (line[16] !== ' ' && line[16] !== 'A') continue;
    const name = line.slice(12, 16).trim();
    const element = (line.slice(76, 78).trim() || name[0]).toUpperCase();
    if (element === 'H') continue;
    const xyz = [+line.slice(30, 38), +line.slice(38, 46), +line.slice(46, 54)];
    const resName = line.slice(17, 20);
    const chain = line[21];
    if (rec === 'HETATM') {
      if (SUGARS.has(resName)) sugars.push({name, element, xyz});
      continue;
    }
    const id = line.slice(22, 27);
    if (last[chain] !== id) {
      residues[chain].push({aa: THREE_TO_ONE[resName] || 'X', atoms: []});
      last[chain] = id;
    }
    residues[chain].at(-1).atoms.push({name, element, xyz});
  }
  return {residues, sugars};
}

// Finds the six hypervariable loops from the conserved motifs around them.
function cdrRanges(residues) {
  const seq = chain => chain.map(r => r.aa).join('');
  const L = seq(residues.A);
  const H = seq(residues.B).slice(0, 125);
  const lCys = [L.indexOf('C'), L.indexOf('C', 40)];
  const lTrp = L.indexOf('WYQ');
  const lFgxg = L.indexOf('FGGG');
  const hCys = [H.indexOf('C'), H.indexOf('C', 40)];
  const hTrp = H.indexOf('WVRQ');
  const hWgqg = H.indexOf('WGQG');
  const hRft = H.indexOf('RFTIS');
  return {
    L1: ['A', lCys[0]+1, lTrp-1],
    L2: ['A', lTrp+15, lTrp+21],
    L3: ['A', lCys[1]+1, lFgxg-1],
    H1: ['B', hCys[0]+4, hTrp-1],
    H2: ['B', hTrp+14, hRft-1],
    H3: ['B', hCys[1]+3, hWgqg-1],
  };
}

const pseudoCb = (n, ca, c) => {
  const b = sub(ca, n), d = sub(c, ca);
  const a = cross(b, d);
  return add(add(add(mul(a, -0.58273431), mul(b, 0.56802827)), mul(d, -0.54067466)), ca);
};
const atom = (res, name) => res.atoms.find(a => a.name === name);

function main() {
  const {residues, sugars} = parse(process.argv[2]);
  const ranges = cdrRanges(residues);
  const heavySeq = residues.B.map(r => r.aa).join('');
  const hingeStart = heavySeq.indexOf('GPTIKPCPPC');
  if (hingeStart < 0) throw new Error('hinge motif not found');

  // Variable domains and loops of the first arm set the reference frame.
  const vdomain = [...residues.A.slice(0, 107), ...residues.B.slice(0, 118)].map(r => atom(r, 'CA').xyz);
  const cdrCa = [];
  for (const [chain, a, b] of Object.values(ranges)) {
    for (let i = a; i <= b; i++) cdrCa.push(atom(residues[chain][i], 'CA').xyz);
  }
  const axis = unit(sub(mean(cdrCa), mean(vdomain)));

  const loops = {};
  for (const [key, [chain, a, b]] of Object.entries(ranges)) {
    let best = -1, bestScore = -Infinity;
    for (let i = a; i <= b; i++) {
      const r = residues[chain][i];
      const ca = atom(r, 'CA').xyz, cb = pseudoCb(atom(r, 'N').xyz, ca, atom(r, 'C').xyz);
      const score = dot(ca, axis) + 2.2 * dot(unit(sub(cb, ca)), axis);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    loops[key] = {chain, index: best, from: a, to: b};
  }

  const vhCentre = mean(residues.B.slice(0, 118).map(r => atom(r, 'CA').xyz));
  const vlCentre = mean(residues.A.slice(0, 107).map(r => atom(r, 'CA').xyz));
  const up0 = sub(vhCentre, vlCentre);
  const up = unit(sub(up0, mul(axis, dot(up0, axis))));
  const side = cross(axis, up);
  const tipCentre = mean(Object.values(loops).map(l => atom(residues[l.chain][l.index], 'CA').xyz));
  const toFrame = p => { const d = sub(p, tipCentre); return [dot(d, axis), dot(d, up), dot(d, side)]; };

  const sidechain = a => !['N', 'CA', 'C', 'O', 'OXT'].includes(a.name);
  const elementCode = {C: 0, N: 1, O: 2, S: 3};
  const groups = {fabA: [], fabB: [], fc: []};
  const hidden = new Set(Object.values(loops).map(l => `${l.chain}${l.index}`));
  const push = (group, list, chainRole, chain) => {
    list.forEach((r, i) => {
      for (const a of r.atoms) {
        if (chain && hidden.has(`${chain}${i}`) && sidechain(a)) continue;
        groups[group].push([...toFrame(a.xyz), elementCode[a.element] ?? 0, chainRole]);
      }
    });
  };
  push('fabA', residues.A, 1, 'A');
  push('fabA', residues.B.slice(0, hingeStart), 0, 'B');
  push('fabB', residues.C, 1);
  push('fabB', residues.D.slice(0, hingeStart), 0);
  push('fc', residues.B.slice(hingeStart), 0);
  push('fc', residues.D.slice(hingeStart), 0);
  for (const s of sugars) groups.fc.push([...toFrame(s.xyz), elementCode[s.element] ?? 0, 2]);

  // Loop backbone atoms get a third role so the renderer can tint them.
  const loopAtomKeys = new Set();
  for (const [chain, a, b] of Object.values(ranges)) {
    for (let i = a; i <= b; i++) for (const at of residues[chain][i].atoms) loopAtomKeys.add(toFrame(at.xyz).map(v => v.toFixed(2)).join());
  }
  for (const atomRow of groups.fabA) {
    if (loopAtomKeys.has(atomRow.slice(0, 3).map(v => v.toFixed(2)).join())) atomRow[4] = 3;
  }

  const buf = [];
  const groupInfo = {};
  for (const [name, atoms] of Object.entries(groups)) {
    groupInfo[name] = atoms.length;
    const data = Buffer.alloc(atoms.length * 7);
    atoms.forEach((a, i) => {
      for (let k = 0; k < 3; k++) data.writeInt16LE(Math.round(a[k] * 50), i * 7 + k * 2);
      data.writeUInt8(a[3] | (a[4] << 3), i * 7 + 6);
    });
    buf.push(data);
  }

  const loopInfo = {};
  for (const [key, l] of Object.entries(loops)) {
    const r = residues[l.chain][l.index];
    const n = atom(r, 'N').xyz, ca = atom(r, 'CA').xyz, c = atom(r, 'C').xyz;
    loopInfo[key] = {
      ca: toFrame(ca).map(v => +v.toFixed(2)),
      cb: toFrame(pseudoCb(n, ca, c)).map(v => +v.toFixed(2)),
      n: toFrame(n).map(v => +v.toFixed(2)),
      native: r.aa,
    };
  }

  // Real side-chain shapes, taken from this same structure, in a local frame.
  const templates = {};
  const wanted = 'ASDLNEKYFRWGQT';
  for (const aa of wanted) {
    if (aa === 'G') { templates.G = []; continue; }
    const options = [...residues.A, ...residues.B.slice(0, hingeStart)].filter(r => r.aa === aa && r.atoms.length >= 5);
    const need = {A:5,S:6,D:8,L:8,N:8,E:9,K:9,Y:12,F:11,R:11,W:14,Q:9,T:7}[aa];
    const r = options.find(o => o.atoms.length === need);
    const ca = atom(r, 'CA').xyz, n = atom(r, 'N').xyz, cb = atom(r, 'CB').xyz;
    const e1 = unit(sub(cb, ca));
    const e2 = unit(sub(sub(n, ca), mul(e1, dot(sub(n, ca), e1))));
    const e3 = cross(e1, e2);
    templates[aa] = r.atoms.filter(sidechain).map(a => {
      const d = sub(a.xyz, ca);
      return [+dot(d, e1).toFixed(2), +dot(d, e2).toFixed(2), +dot(d, e3).toFixed(2), elementCode[a.element] ?? 0];
    });
  }

  // Pivot points for moving the arms: the hinge, and the tip of the second arm.
  const hinge = toFrame(mean([...residues.B.slice(hingeStart, hingeStart + 12), ...residues.D.slice(hingeStart, hingeStart + 12)].map(r => atom(r, 'CA').xyz)));
  const tipB = toFrame(mean(Object.values(loops).map(l => atom(residues[l.chain === 'A' ? 'C' : 'D'][l.index], 'CA').xyz)));

  const meta = {source: 'PDB 1IGT', groups: groupInfo, loops: loopInfo, templates, hinge: hinge.map(v => +v.toFixed(2)), tipB: tipB.map(v => +v.toFixed(2))};
  const out = `// Generated by tools/prepare-structure.cjs from PDB 1IGT. Do not edit.\n` +
    `export const IGG_META = ${JSON.stringify(meta)};\n` +
    `export const IGG_ATOMS = "${Buffer.concat(buf).toString('base64')}";\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'igg.js'), out);

  console.log('groups', groupInfo, 'bytes', out.length);
  for (const [k, v] of Object.entries(loopInfo)) console.log(k, v.native, 'CA', v.ca.join(' '));
  for (const k of Object.keys(ranges)) { const [c, a, b] = ranges[k]; console.log(k, c, a, b, residues[c].slice(a, b+1).map(r => r.aa).join('')); }
  const span = groups.fabA.concat(groups.fabB, groups.fc);
  for (let k = 0; k < 3; k++) console.log('axis', k, Math.min(...span.map(a => a[k])).toFixed(1), Math.max(...span.map(a => a[k])).toFixed(1));
}
main();
