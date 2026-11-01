# Reads the runs of md_pull.py and asks the game's question in real water, with no memory term.
#   python md_pull_analyse.py <tag> <first residue> <site label> <run files...>
# Each run is cut into three windows: reference (last 200 ps before the pull), held (last 60 ps at full stretch), and end (last 200 ps after release).
# A bond counts as present in a window at over 50% of its frames, and as steady in the reference at over 70%.
# Oil contacts use the same 4.5 A rule. Every number is printed per run; nothing here is fitted.
import sys, json
import numpy as np
import mdtraj as md

tag, first, site = sys.argv[1], int(sys.argv[2]), sys.argv[3]
files = sys.argv[4:]
MIN = int(__import__('os').environ.get('MIN_FRAMES', 880))
top = md.load_topology(f'{tag}-protein.pdb')
atoms = list(top.atoms)
lab = lambda a: f'{a.residue.code}{a.residue.index + first}:{a.name}'
CH = lambda a: (a.residue.name == 'LYS' and a.name == 'NZ') or (a.residue.index == 0 and a.name == 'N')
ACC = {'O', 'OXT', 'OD1', 'OD2', 'OE1', 'OE2', 'OG', 'OG1', 'OH'}
parent = {}
for b in top.bonds:
    x, y = b[0], b[1]
    if x.element.symbol == 'H' and y.element.symbol != 'H': parent[x.index] = y
    if y.element.symbol == 'H' and x.element.symbol != 'H': parent[y.index] = x
donors = [(h, parent[h].index) for h in parent if parent[h].element.symbol in 'NO' and not CH(parent[h])]
free = [a.index for a in atoms if CH(a)]
acc = [a.index for a in atoms if a.element.symbol == 'O' and a.name in ACC]
res = np.array([a.residue.index for a in atoms])
oil = [a.index for a in atoms if a.element.symbol == 'C' and a.name not in ('C', 'CA') and a.residue.code in 'AVLIMFWYP']
H = np.array([d[0] for d in donors]); D = np.array([d[1] for d in donors]); A = np.array(acc); F = np.array(free); O = np.array(oil)
sameO = res[O][:, None] == res[O][None, :]
upper = np.triu(np.ones_like(sameO), 1).astype(bool) & ~sameO
OI, OJ = np.where(upper)

def bonds(xyz):
    d = xyz[:, H[:, None], :] - xyz[:, A[None, :], :]
    r = np.sqrt((d ** 2).sum(-1))
    v = xyz[:, D, :] - xyz[:, H, :]
    cos = ((-d) * v[:, :, None, :]).sum(-1) / (r * np.linalg.norm(v, axis=-1)[:, :, None])
    ok = (r < 0.25) & (cos < -0.5) & (res[H][:, None] != res[A][None, :])[None]
    out = {}
    for i in range(len(H)):
        for j in range(len(A)):
            hit = ok[:, i, j]
            if hit.any():
                k = (int(D[i]), int(A[j]))
                out[k] = out[k] | hit if k in out else hit
    rr = np.sqrt(((xyz[:, F[:, None], :] - xyz[:, A[None, :], :]) ** 2).sum(-1))
    for i, d2 in enumerate(F):
        for j, a in enumerate(A):
            if res[d2] != res[a]:
                hit = rr[:, i, j] < 0.35
                if hit.any():
                    out[(int(d2), int(a))] = hit
    return {k: float(v.mean()) for k, v in out.items()}

def oils(xyz):
    ro = np.sqrt(((xyz[:, O[:, None], :] - xyz[:, O[None, :], :]) ** 2).sum(-1))
    return (ro < 0.45)[:, upper].mean(0)

bb = lambda k: atoms[k[0]].name == 'N' and atoms[k[1]].name == 'O'
sid = lambda k: f'{atoms[k[0]].residue.code}{atoms[k[0]].residue.index + first}-{atoms[k[1]].residue.code}{atoms[k[1]].residue.index + first}'

def gap(t, res_no):
    """For a side-chain pull: atoms of other residues inside the place the side chain left, read as in the game, within 4.5 A of its home centre."""
    r = res_no - first
    side = [a.index for a in atoms if a.residue.index == r and a.element.symbol != 'H' and a.name not in ('N', 'CA', 'C', 'O', 'CB')]
    others = [a.index for a in atoms if a.residue.index != r and a.element.symbol != 'H']
    far = [a.index for a in atoms if a.name == 'CA' and abs(a.residue.index - r) > 6]
    fit = t.superpose(t, frame=200, atom_indices=far)
    x = fit.xyz
    home = x[150:250][:, side].mean(1).mean(0)
    count = lambda w: float((np.sqrt(((x[w][:, others] - home) ** 2).sum(-1)) < 0.45).sum(1).mean())
    ring = lambda w: float(np.linalg.norm(x[w][:, side].mean(1) - home, axis=1).mean() * 10)
    # The game's Core packed bar: heavy atoms within 6.5 A of each oil atom, leaving out the pulled residue, against the reference.
    oil2 = [i for i in oil if atoms[i].residue.index != r]
    def packed(w):
        d = np.sqrt(((x[w][:, oil2, None, :] - x[w][:, None, others, :]) ** 2).sum(-1))
        return float((d < 0.65).sum((1, 2)).mean()) - len(oil2)
    p0 = packed(slice(150, 250))
    def rim(w):
        inside = np.sqrt(((x[w][:, others] - home) ** 2).sum(-1)) < 0.45
        c = {}
        for k, i in enumerate(others):
            c[atoms[i].residue.index] = c.get(atoms[i].residue.index, 0) + float(inside[:, k].mean())
        return c
    r0, r1 = rim(slice(150, 250)), rim(slice(370, 400))
    code = lambda i: f'{top.residue(i).code}{i + first}'
    gain = sorted(((r1.get(i, 0) - r0.get(i, 0), i) for i in set(r0) | set(r1)), reverse=True)
    return {'entered': [f'{code(i)} +{v:.1f}' for v, i in gain[:5] if v > 0.3], 'left': [f'{code(i)} {v:.1f}' for v, i in gain[-3:] if v < -0.3], 'packedHeld': round(packed(slice(370, 400)) / p0, 3), 'packedEnd': round(packed(slice(-100, None)) / p0, 3), 'before': round(count(slice(150, 250)), 1),'packedHeld': round(packed(slice(370, 400)) / p0, 3), 'packedEnd': round(packed(slice(-100, None)) / p0, 3), 'before': round(count(slice(150, 250)), 1), 'held': round(count(slice(370, 400)), 1), 'end': round(count(slice(-100, None)), 1), 'moved': round(ring(slice(370, 400)), 1), 'endOff': round(ring(slice(-100, None)), 1)}

runs = []
for f in files:
    t = md.load_dcd(f, top=top)
    n = len(t)
    if n < MIN:
        continue
    # 2 ps per frame: free to 500 ps, pulled to 700, held to 800, released to 1800.
    ref, held, end = t.xyz[150:250], t.xyz[370:400], t.xyz[-100:]
    b0 = bonds(ref); b1 = bonds(held); b2 = bonds(end)
    steady = [k for k, v in b0.items() if v > 0.7]
    sb = [k for k in steady if bb(k)]
    ss = [k for k in steady if not bb(k)]
    broke = [k for k in steady if b1.get(k, 0) < 0.2]
    back = [k for k in broke if b2.get(k, 0) > 0.5]
    # A donor that lost its bond: did it take a new partner instead?
    new = []
    for k in broke:
        if b2.get(k, 0) > 0.5:
            continue
        alt = [q for q, v in b2.items() if q[0] == k[0] and q != k and v > 0.5]
        if alt:
            new.append(k)
    # When each broken backbone bond failed: the first frame of the pull from which H...A stays over 3.2 A for 10 ps. This is the board's rule for a snap.
    when = {}
    for k in broke:
        if not bb(k):
            continue
        hs = [h for h, d in donors if d == k[0]]
        if not hs:
            continue
        r = np.sqrt(((t.xyz[250:400][:, hs, :] - t.xyz[250:400][:, [k[1]], :]) ** 2).sum(-1)).min(1)
        off = r > 0.32
        run = np.convolve(off, np.ones(5, int), 'valid')
        hit = np.where(run == 5)[0]
        if len(hit):
            when[sid(k)] = int(hit[0]) * 2
    o0, o1, o2 = oils(ref), oils(held), oils(end)
    a = o0 > 0.5
    keep = float(((o2 > 0.5) & a).sum() / max(1, a.sum()))
    extra = {'gap': gap(t, int(site[:-2]))} if site.endswith('sc') else {}
    runs.append({**extra, 'file': f, 'frames': n, 'steady': len(steady), 'steadyBackbone': len(sb), 'broke': len(broke), 'brokeBackbone': sum(bb(k) for k in broke),
                 'backSame': len(back), 'backSameBackbone': sum(bb(k) for k in back), 'newPartner': len(new), 'order': sorted(when, key=when.get), 'whenPs': when, 'brokeNames': sorted(sid(k) for k in broke if bb(k)), 'stillOff': sorted(sid(k) for k in broke if k not in back and bb(k)),
                 'oilRef': round(float(o0.sum()), 1), 'oilHeld': round(float(o1.sum()), 1), 'oilEnd': round(float(o2.sum()), 1), 'oilKeep': round(keep, 3),
                 'caBack': round(float(md.rmsd(t[-100:], t, frame=200, atom_indices=top.select('name CA')).mean() * 10), 2)})
print(json.dumps({'tag': tag, 'site': site, 'runs': runs}))
