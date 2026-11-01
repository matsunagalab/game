# The published stability values the game shows, boiled down from the raw ProtaBank export so that tests can check every number on screen.
#   python tools/nisthal_values.py <nisthal_raw.csv> <protein pdb> > tools/nisthal-values.json
# ala: every single mutant to alanine. f30, f52: every substitution there. core: all substitutions at buried oil residues (RSA under 15%).
# A value of -4 is the paper's mark for too unstable to measure, and is stored as null.
import csv, collections, json, sys
import numpy as np
import mdtraj as md

rows = list(csv.DictReader(open(sys.argv[1])))
D = collections.defaultdict(dict)
for r in rows:
    try:
        v = float(r['Data'])
    except ValueError:
        v = None
    D[r['Description']][r['Assay/Protocol']] = v
val = lambda k: D[k].get('ddG(mAvg)_mean')
wt = 'MTYKLILNGKTLKGETTTEAVDAATAEKVFKQYANDNGVDGEWTYDDATKTFTVTE'
t = md.load_pdb(sys.argv[2])
sa = md.shrake_rupley(t, mode='atom')[0] * 100
MAX = {'A': 129, 'R': 274, 'N': 195, 'D': 193, 'C': 167, 'Q': 225, 'E': 223, 'G': 104, 'H': 224, 'I': 197, 'L': 201, 'K': 236, 'M': 224, 'F': 240, 'P': 159, 'S': 155, 'T': 172, 'W': 285, 'Y': 263, 'V': 174}
rsa = {r.index + 1: sa[[a.index for a in r.atoms]].sum() / MAX[r.code] for r in t.top.residues}
OIL, POL = 'AVLIMFYW', 'STNQDEKRHG'
out = {'ala': {}, 'f30': {}, 'f52': {}, 'core': {'oil': [], 'polar': []}}
show = lambda v: None if v == -4 else round(v, 4)
for i in range(1, 57):
    w = wt[i - 1]
    k = f'{w}{i:02d}A'
    if w != 'A' and val(k) is not None:
        out['ala'][f'{w}{i}A'] = show(val(k))
for name, w, i in (('f30', 'F', 30), ('f52', 'F', 52)):
    for a in 'ACDEGHIKLMNPQRSTVWY':
        if val(f'{w}{i}{a}') is not None:
            out[name][a] = show(val(f'{w}{i}{a}'))
for i in range(1, 57):
    w = wt[i - 1]
    if rsa[i] >= 0.15 or w not in OIL:
        continue
    for group, kinds in (('oil', OIL), ('polar', POL)):
        for a in kinds:
            k = f'{w}{i:02d}{a}'
            if a != w and val(k) is not None:
                out['core'][group].append([f'{w}{i}{a}', val(k)])
print(json.dumps(out))
