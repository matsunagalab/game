# Reads the runs from md_native.py and measures what the Pull stages claim. The definitions match src/science/pull.js.
#   python md_analyse.py <tag> <first residue number> <skip ns> run1.dcd run2.dcd ...   > <tag>-md.json
# H-bond: H...A under 2.5 A and D-H...A over 120 degrees. Lys NZ and the N-terminus spin freely, so they use N...O under 3.5 A.
# Salt bridge: Lys NZ, Arg NE/NH1/NH2 or the N-terminus within 4 A of Asp, Glu or C-terminal oxygens.
# Oil contact: side-chain carbons of A V L I M F W Y P, on different residues, within 4.5 A.
# Every number is given per run. Run-to-run spread is the error used, since block averages understated it badly in an earlier project.
import sys, json
import numpy as np
import mdtraj as md

tag, first, skip = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
files = sys.argv[4:]
top = md.load_topology(f'{tag}-protein.pdb')
ONE = {r.name: r.code for r in top.residues}
atoms = list(top.atoms)
lab = lambda a: f'{a.residue.code}{a.residue.index + first}:{a.name}'
CHARGED_N = lambda a: (a.residue.name == 'LYS' and a.name == 'NZ') or (a.residue.index == 0 and a.name == 'N')
ACC = {'O', 'OXT', 'OD1', 'OD2', 'OE1', 'OE2', 'OG', 'OG1', 'OH'}
parent = {}
for b in top.bonds:
    x, y = b[0], b[1]
    if x.element.symbol == 'H' and y.element.symbol != 'H': parent[x.index] = y
    if y.element.symbol == 'H' and x.element.symbol != 'H': parent[y.index] = x
donors = [(h, parent[h].index) for h in parent if parent[h].element.symbol in 'NO' and not CHARGED_N(parent[h]) ]
free = [a.index for a in atoms if CHARGED_N(a)]
acceptors = [a.index for a in atoms if a.element.symbol == 'O' and a.name in ACC]
res = np.array([a.residue.index for a in atoms])

BASIC = lambda a: (a.residue.name == 'LYS' and a.name == 'NZ') or (a.residue.name == 'ARG' and a.name in ('NE', 'NH1', 'NH2')) or (a.residue.index == 0 and a.name == 'N')
ACID = lambda a: (a.residue.name == 'ASP' and a.name in ('OD1', 'OD2')) or (a.residue.name == 'GLU' and a.name in ('OE1', 'OE2')) or a.name == 'OXT' or (a.residue.index == top.n_residues - 1 and a.name == 'O')
basic = [a.index for a in atoms if BASIC(a)]
acid = [a.index for a in atoms if ACID(a)]
OIL = 'AVLIMFWYP'
oil = [a.index for a in atoms if a.element.symbol == 'C' and a.name not in ('C', 'CA') and a.residue.code in OIL]

def hbond_matrix(xyz):
    """Booleans, frames x (donor groups + free N) x acceptors, keyed by heavy donor atom."""
    H = np.array([d[0] for d in donors]); D = np.array([d[1] for d in donors]); A = np.array(acceptors)
    d = xyz[:, H[:, None], :] - xyz[:, A[None, :], :]
    r = np.sqrt((d ** 2).sum(-1))
    v = xyz[:, D, :] - xyz[:, H, :]
    u = -d
    cos = (u * v[:, :, None, :]).sum(-1) / (r * np.linalg.norm(v, axis=-1)[:, :, None])
    ok = (r < 0.25) & (cos < -0.5)
    ok &= (res[H][:, None] != res[A][None, :])[None]
    return ok

def analyse(path):
    t = md.load_dcd(path, top=top)
    t = t[t.time > 0] if False else t
    dt = 0.01  # ns per frame
    n0 = int(skip / dt)
    t = t[n0:]
    xyz = t.xyz
    out = {'frames': len(xyz), 'ns': round(len(xyz) * dt, 2)}
    occ = {}
    B = np.zeros((len(xyz), 0))
    ok = hbond_matrix(xyz)
    # A donor heavy atom with two hydrogens counts once for each acceptor.
    pairs = {}
    for i, (h, d) in enumerate(donors):
        for j, a in enumerate(acceptors):
            hit = ok[:, i, j]
            if hit.any():
                key = (d, a)
                pairs[key] = pairs[key] | hit if key in pairs else hit
    F = np.array(free); A = np.array(acceptors)
    rr = np.sqrt(((xyz[:, F[:, None], :] - xyz[:, A[None, :], :]) ** 2).sum(-1))
    for i, d in enumerate(free):
        for j, a in enumerate(acceptors):
            if res[d] != res[a]:
                hit = rr[:, i, j] < 0.35
                if hit.any():
                    pairs[(d, a)] = hit
    out['hbonds'] = {f'{lab(atoms[d])}-{lab(atoms[a])}': round(float(v.mean()), 4) for (d, a), v in pairs.items() if v.mean() >= 0.01}
    # The error a single run would claim for itself, from 1 ns blocks, to set beside the spread between independent runs.
    nb = len(xyz) // 100
    if nb >= 3:
        out['blockSE'] = {f'{lab(atoms[d])}-{lab(atoms[a])}': round(float(np.array([b.mean() for b in np.array_split(v[:nb * 100], nb)]).std(ddof=1) / np.sqrt(nb)), 4) for (d, a), v in pairs.items() if v.mean() >= 0.05}
    # Salt bridges by residue pair.
    Ba = np.array(basic); Ac = np.array(acid)
    rs = np.sqrt(((xyz[:, Ba[:, None], :] - xyz[:, Ac[None, :], :]) ** 2).sum(-1))
    sb = {}
    for i, b in enumerate(basic):
        for j, a in enumerate(acid):
            key = (res[b], res[a])
            hit = rs[:, i, j] < 0.40
            sb[key] = sb[key] | hit if key in sb else hit
    code = lambda r: f'{top.residue(int(r)).code}{int(r) + first}'
    out['salt'] = {f'{code(a)}-{code(b)}': round(float(v.mean()), 4) for (a, b), v in sb.items() if v.mean() >= 0.01}
    # Oil contacts.
    O = np.array(oil)
    ro = np.sqrt(((xyz[:, O[:, None], :] - xyz[:, O[None, :], :]) ** 2).sum(-1))
    same = res[O][:, None] == res[O][None, :]
    upper = np.triu(np.ones_like(same), 1).astype(bool) & ~same
    C = (ro < 0.45)[:, upper]
    I, J = np.where(upper)
    out['oilTotalMean'] = round(float(C.sum(1).mean()), 2)
    out['oilTotalSd'] = round(float(C.sum(1).std()), 2)
    # Turnover. Of what is in contact at time t, how much is still in contact at t + lag? Compared with the fraction expected for an unrelated
    # frame of the same run, which is what independent partners would give.
    lags = [0.01, 0.1, 1, 5]
    def keep(M, lag):
        k = int(lag / dt)
        if k >= len(M): return None
        A0, A1 = M[:-k], M[k:]
        n = A0.sum()
        return float((A0 & A1).sum() / n) if n else None
    H = np.array(list(pairs.values())).T
    out['keepHbond'] = {str(l): keep(H, l) for l in lags}
    bb = np.array([atoms[d].name == 'N' and atoms[a].name == 'O' for d, a in pairs])
    out['keepHbondBackbone'] = {str(l): keep(H[:, bb], l) for l in lags}
    out['keepHbondSide'] = {str(l): keep(H[:, ~bb], l) for l in lags}
    out['keepOilAtom'] = {str(l): keep(C, l) for l in lags}
    # The control for the pull runs: the same two 200 ps windows, 1.3 ns apart, with no pull, from many starting points in this run.
    def windows(M, on, stay):
        out = []
        for s0 in range(0, len(M) - 150, 50):
            a, b = M[s0:s0 + 20].mean(0) > on, M[s0 + 130:s0 + 150].mean(0) > stay
            if a.sum():
                out.append(float((a & b).sum() / a.sum()))
        return round(float(np.mean(out)), 3) if out else None
    out['controlOilKeep'] = windows(C, 0.5, 0.5)
    out['controlBackbone'] = windows(H[:, bb], 0.7, 0.5)
    out['controlSide'] = windows(H[:, ~bb], 0.7, 0.5)
    # Residue level.
    rp = {}
    for n, (i, j) in enumerate(zip(I, J)):
        key = (res[O[i]], res[O[j]])
        rp[key] = rp[key] | C[:, n] if key in rp else C[:, n].copy()
    R = np.array(list(rp.values())).T
    out['keepOilResidue'] = {str(l): keep(R, l) for l in lags}
    out['oilResidueOcc'] = {f'{code(a)}-{code(b)}': round(float(v.mean()), 4) for (a, b), v in rp.items() if v.mean() >= 0.05}
    # Effective number of partners over the whole run, for each donor or oil atom: exp of the entropy of who it was touching.
    def partners(key_of):
        groups = {}
        for (d, a), v in pairs.items():
            groups.setdefault(key_of(d, a), []).append(v.mean())
        return groups
    groups = {}
    for (d, a), v in pairs.items():
        groups.setdefault(d, []).append(float(v.mean()))
    def neff(w):
        p = np.array(w); p = p / p.sum(); return float(np.exp(-(p * np.log(p + 1e-12)).sum()))
    out['neffHbondDonor'] = round(float(np.mean([neff(w) for w in groups.values() if sum(w) > 0.2])), 2)
    g2 = {}
    for n, (i, j) in enumerate(zip(I, J)):
        m = float(C[:, n].mean())
        if m > 0:
            g2.setdefault(O[i], []).append(m); g2.setdefault(O[j], []).append(m)
    out['neffOilAtom'] = round(float(np.mean([neff(w) for w in g2.values() if sum(w) > 0.2])), 2)
    out['oilAtomContactsMean'] = round(float(np.mean([sum(w) for w in g2.values() if sum(w) > 0.2])), 2)
    # Fold stayed folded? Heavy-atom and C-alpha distance from the crystal.
    ref = md.load_pdb(f'{tag}-protein.pdb')
    ca = top.select('name CA')
    heavy = top.select('element != H')
    out['rmsdCa'] = round(float(md.rmsd(t, ref, atom_indices=ca).mean() * 10), 2)
    # The chain ends of 1ENH are floppy, so the fold itself is read without five residues at each end.
    core = top.select(f'name CA and resid 5 to {top.n_residues - 6}')
    out['rmsdCore'] = round(float(md.rmsd(t, ref, atom_indices=core).mean() * 10), 2)
    out['rmsdHeavy'] = round(float(md.rmsd(t, ref, atom_indices=heavy).mean() * 10), 2)
    return out

print(json.dumps({'tag': tag, 'runs': [analyse(f) for f in files]}))
