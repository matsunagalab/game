# Builds src/data/grab-params.json for the Pull stages: one table per residue of atom class and partial charge.
#   python grab_params.py EEFSolv.cpp ../src/data/grab-params.json
# Solvation numbers and atom classes: the PLUMED EEFSolv table (EEF1-SB, Bottaro et al. 2013), after Lazaridis & Karplus 1999. Read from PLUMED's src/colvar/EEFSolv.cpp, which holds the all-heavy-atom set.
# Charges: Amber ff14SB, the same force field as the MD (tools/md_native.py). Each non-polar hydrogen is merged into its carbon, so that the game
# has no non-polar hydrogens. The hydrogens of Lys NZ and of the N-terminus are merged too, because those groups spin freely.
import json, os, re, sys
import xml.etree.ElementTree as ET
import openmm

src = open(sys.argv[1]).read()
i = src.find('EEFSolv::setupValueMap')
rows = re.findall(r'valuemap\["(\w+)"\] = \{\s*ANG3_TO_NM3 \* ([-\d.]+),\s*KCAL_TO_KJ \* ([-\d.]+),\s*KCAL_TO_KJ \* ([-\d.]+),\s*KCAL_TO_KJ \* ([-\d.]+),\s*KCAL_TO_KJ \* ([-\d.]+),\s*1\. / \(ANG_TO_NM \* ([-\d.]+)\),\s*([\d.]+),', src[i:])
types = {r[0]: {'v': float(r[1]), 'ref': float(r[2]), 'free': float(r[3]), 'lambda': float(r[6]), 'r': round(float(r[7]) * 10, 3)} for r in rows}

# PLUMED's map is written per residue with CHARMM names.
maps = {}
for m in re.finditer(r'typemap\["(\w+)"\]\s*=\s*\{(.*?)\n\s*\};', src, re.S):
    maps[m[1]] = dict(re.findall(r'\{"(\w+)"\s*,\s*"(\w+)"\s*\}', m[2]))
ALIAS = {'HIE': 'HSE', 'HID': 'HSD'}

xml = ET.parse(os.path.join(os.path.dirname(openmm.__file__), 'app/data/amber14/protein.ff14SB.xml')).getroot()
templates = {r.get('name'): r for r in xml.find('Residues')}

def table(name, base):
    t = templates[name]
    atoms = {a.get('name'): float(a.get('charge')) for a in t.findall('Atom')}
    bonds = [(b.get('atomName1'), b.get('atomName2')) for b in t.findall('Bond')]
    parent = {}
    for a, b in bonds:
        for x, y in ((a, b), (b, a)):
            if x[0] == 'H' and y[0] != 'H':
                parent[x] = y
    charge = dict(atoms)
    merged = set()
    for h, heavy in parent.items():
        polar = heavy[0] in 'NOS'
        free = (base == 'LYS' and heavy == 'NZ') or (name[0] == 'N' and name != 'NME' and heavy == 'N' and len(name) == 4)
        if not polar or free:
            charge[heavy] += charge.pop(h)
            merged.add(h)
    tm = maps[ALIAS.get(base, base)]
    out = {}
    for a, q in charge.items():
        if a[0] == 'H':
            out[a] = ['H', round(q, 4)]
            continue
        cls = tm.get(a) or tm.get({'CD1': 'CD'}.get(a, a))
        if len(name) == 4 and a == 'N' and name[0] == 'N':
            cls = 'NH3'
        if len(name) == 4 and a in ('O', 'OXT') and name[0] == 'C':
            cls = 'OC'
        if len(name) == 4 and a == 'C' and name[0] == 'C':
            cls = 'CC'
        if cls is None:
            raise SystemExit(f'no class for {name} {a}')
        out[a] = [cls, round(q, 4)]
    return out

AA = 'ALA ARG ASN ASP CYS GLN GLU GLY HIE ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL'.split()
res = {('HIS' if a == 'HIE' else a): table(a, a) for a in AA}
# Only the termini of the proteins used here.
for name in ('NARG', 'CILE', 'NMET', 'CGLU'):
    res[name] = table(name, name[1:])
used = sorted({v[0] for t in res.values() for v in t.values()} - {'H'})
json.dump({'types': {k: types[k] for k in used}, 'res': res}, open(sys.argv[2], 'w'), separators=(',', ':'))
for a in res:
    print(a, round(sum(v[1] for v in res[a].values()), 3), len(res[a]))
print(used)
