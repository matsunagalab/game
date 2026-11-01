# What each side chain holds in the native MD, beyond bond occupancies.
#   python md_board.py <tag> <first residue> <run files...>   > <tag>-board.json
# ties:   for each residue, what its side chain holds, by residue pair. A hydrogen bond to either oxygen of a carboxylate counts once, because the
#         share between the two oxygens is the slow part that the runs disagree on. Each row: partner, what the partner gives (side, N or O),
#         mean over runs, lowest run.
import sys, json
import numpy as np
import mdtraj as md

tag, first = sys.argv[1], int(sys.argv[2])
files = sys.argv[3:]
top = md.load_topology(f'{tag}-protein.pdb')
atoms = list(top.atoms)
res = np.array([a.residue.index for a in atoms])
code = lambda r: f'{top.residue(int(r)).code}{int(r) + first}'
parent = {}
for b in top.bonds:
    x, y = b[0], b[1]
    if x.element.symbol == 'H' and y.element.symbol != 'H': parent[x.index] = y
    if y.element.symbol == 'H' and x.element.symbol != 'H': parent[y.index] = x
CH = lambda a: (a.residue.name == 'LYS' and a.name == 'NZ') or (a.residue.index == 0 and a.name == 'N')
ACC = {'O', 'OXT', 'OD1', 'OD2', 'OE1', 'OE2', 'OG', 'OG1', 'OH'}
donors = [(h, parent[h].index) for h in parent if parent[h].element.symbol in 'NO' and not CH(parent[h])]
free = [a.index for a in atoms if CH(a)]
acc = [a.index for a in atoms if a.element.symbol == 'O' and a.name in ACC]
H = np.array([d[0] for d in donors]); D = np.array([d[1] for d in donors]); A = np.array(acc); F = np.array(free)
BACK = {'N', 'O', 'C', 'CA', 'H', 'OXT'}
side = lambda i: atoms[i].name not in BACK

ties = []
for f in files:
    t = md.load_dcd(f, top=top)[100:]
    x = t.xyz
    # Every polar contact of a side chain, joined by residue pair and by whether the far end is backbone.
    dv = x[:, H[:, None], :] - x[:, A[None, :], :]
    r = np.sqrt((dv ** 2).sum(-1))
    v = x[:, D, :] - x[:, H, :]
    cos = ((-dv) * v[:, :, None, :]).sum(-1) / (r * np.linalg.norm(v, axis=-1)[:, :, None])
    ok = (r < 0.25) & (cos < -0.5)
    rr = np.sqrt(((x[:, F[:, None], :] - x[:, A[None, :], :]) ** 2).sum(-1)) < 0.35
    pairs = {}
    def note(a, b, hit):
        # a is the residue whose side chain is involved, b the partner; kind says what the partner gives.
        if res[a] == res[b] or not side(a):
            return
        key = (int(res[a]), int(res[b]), 'side' if side(b) else atoms[b].name)
        pairs[key] = pairs[key] | hit if key in pairs else hit.copy()
    for i in range(len(H)):
        for j in range(len(A)):
            hit = ok[:, i, j]
            if hit.any():
                note(int(D[i]), int(A[j]), hit)
                note(int(A[j]), int(D[i]), hit)
    for i in range(len(F)):
        for j in range(len(A)):
            hit = rr[:, i, j]
            if hit.any():
                note(int(F[i]), int(A[j]), hit)
                note(int(A[j]), int(F[i]), hit)
    ties.append({k: float(v.mean()) for k, v in pairs.items()})

keys = set(k for r in ties for k in r)
table = {}
for k in keys:
    v = [r.get(k, 0) for r in ties]
    m = float(np.mean(v))
    if m < 0.1:
        continue
    table.setdefault(code(k[0]), []).append([code(k[1]), k[2], round(m, 2), round(min(v), 2)])
for v in table.values():
    v.sort(key=lambda q: -q[2])
print(json.dumps({'tag': tag, 'ties': table}))
