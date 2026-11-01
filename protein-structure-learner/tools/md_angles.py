# Is a hydrogen bond more particular about its angle than an oil contact? Native MD, one value per contact per frame, with the same filters on both sides.
#   python tools/md_angles.py <folder with <tag>-protein.pdb and <tag>-1..3.dcd> > angles.json
# Hydrogen bond: amide H within 2.5 A of a backbone O, angle N-H...O.
# Oil: for each pair of oily residues, the closest pair of side-chain carbons under 4.5 A, angle X-C...C at one end, X a bonded heavy atom, both picked at random.
# Both sides: residues at least three apart. Bins are equal in solid angle, so an even sphere reads 1 at every angle and nothing is blown up near 180 degrees.
# Controls, stored beside each result, because the distance plot this replaced was an artefact of counting:
#   null    random free spots at the contact distance, with the partner residue taken out, by one rule on both sides. What sterics alone would give.
#   crystal one frame, no dynamics. The contrast is there too, so this is about geometry and not about motion.
#   choices of X, of which carbon pair, and shuffled vectors.
import sys, json
import numpy as np
import mdtraj as md

FOLDER = sys.argv[1]
rng = np.random.default_rng(1)
FINE, COARSE = 48, 24
fine = np.linspace(-1, 1, FINE + 1)
coarse = np.linspace(-1, 1, COARSE + 1)

def ang(u, v):
    return np.degrees(np.arccos(np.clip((u * v).sum(-1) / (np.linalg.norm(u, axis=-1) * np.linalg.norm(v, axis=-1)), -1, 1)))

def hist(a, e=coarse):
    a = np.asarray(a)
    a = a[np.isfinite(a)]
    h = np.histogram(np.cos(np.radians(a)), bins=e)[0].astype(float)
    return h / h.sum()

def share(a):
    # How much of the sphere a contact uses: 1 if it fills the sphere evenly.
    p = hist(a)
    q = p[p > 0]
    return float(np.exp(-(q * np.log(q)).sum()) / COARSE)

def apart(a, b):
    p, q = hist(a), hist(b)
    return float((p[p > 0] * np.log(p[p > 0] / np.maximum(q[p > 0], 1e-4))).sum())

def stats(a):
    a = np.asarray(a)
    a = a[np.isfinite(a)]
    return {'n': len(a), 'mean': round(float(a.mean()), 1), 'sd': round(float(a.std()), 1), 'share': round(share(a), 3)}

class System:
    def __init__(s, tag):
        s.tag = tag
        s.top = md.load_topology(f'{FOLDER}/{tag}-protein.pdb')
        s.atoms = list(s.top.atoms)
        s.res = np.array([a.residue.index for a in s.atoms])
        s.name = np.array([a.name for a in s.atoms])
        s.el = np.array([a.element.symbol for a in s.atoms])
        s.code = np.array([a.residue.code for a in s.atoms])
        bond = {}
        for b in s.top.bonds:
            bond.setdefault(b[0].index, []).append(b[1].index)
            bond.setdefault(b[1].index, []).append(b[0].index)
        s.heavybond = {i: [j for j in v if s.el[j] != 'H'] for i, v in bond.items()}
        s.oil = np.array([i for i in range(len(s.atoms)) if s.el[i] == 'C' and s.name[i] not in ('C', 'CA') and s.code[i] in 'AVLIMFWYP'])
        s.amides = [(h, d) for d, a in enumerate(s.atoms) if a.name == 'N' and a.residue.index > 0 for h in bond.get(d, []) if s.el[h] == 'H']
        s.carbonyls = [i for i, a in enumerate(s.atoms) if a.name == 'O']
        s.heavy = np.nonzero(s.el != 'H')[0]
        s.crystal = md.load_pdb(f'{FOLDER}/{tag}-protein.pdb').xyz[0] * 10

def hydrogen(S, x):
    out, rows, U, V = [], [], [], []
    for h, d in S.amides:
        for a in S.carbonyls:
            if abs(S.res[a] - S.res[h]) < 3:
                continue
            va = x[:, a] - x[:, h]
            ok = np.linalg.norm(va, axis=1) < 2.5
            if not ok.any():
                continue
            vd = x[ok, d] - x[ok, h]
            out.append(ang(vd, va[ok]))
            U.append(vd)
            V.append(va[ok])
            rows += [(h, d, a, int(f)) for f in np.nonzero(ok)[0]]
    return np.concatenate(out), rows, np.concatenate(U), np.concatenate(V)

def contacts(S, x, which=0, rc=4.5):
    res = S.res[S.oil]
    rs = sorted(set(res))
    P, Q, F = [], [], []
    for i, ra in enumerate(rs):
        for rb in rs[i + 1:]:
            if abs(ra - rb) < 3:
                continue
            A, B = S.oil[res == ra], S.oil[res == rb]
            dd = np.linalg.norm(x[:, A[:, None]] - x[:, B[None, :]], axis=3).reshape(len(x), -1)
            if dd.shape[1] <= which:
                continue
            o = np.argsort(dd, axis=1)[:, which] if which else dd.argmin(1)
            ok = dd[np.arange(len(x)), o] < rc
            f = np.nonzero(ok)[0]
            if len(f):
                k = o[f]
                P.append(A[k // len(B)])
                Q.append(B[k % len(B)])
                F.append(f)
    P, Q, F = np.concatenate(P), np.concatenate(Q), np.concatenate(F)
    flip = rng.random(len(P)) < 0.5
    return np.where(flip, Q, P), np.where(flip, P, Q), F

def bonded(S, x, p, F):
    X = np.array([rng.choice(S.heavybond[int(i)]) for i in p])
    return x[F, X] - x[F, p]

def spots(c, toward, x0, atoms, rmin, rmax, clear, count=240):
    d = rng.normal(size=(count, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    r = (rng.random(count) * (rmax ** 3 - rmin ** 3) + rmin ** 3) ** (1 / 3)
    pts = c + d * r[:, None]
    free = np.linalg.norm(pts[:, None] - x0[atoms][None], axis=2).min(1) > clear
    return ang(np.repeat(toward[None], free.sum(), axis=0), pts[free] - c) if free.any() else np.array([])

out = {}
for tag in ('gb1', 'enh'):
    S = System(tag)
    x = np.concatenate([md.load_dcd(f'{FOLDER}/{tag}-{r}.dcd', top=S.top)[100:].xyz[::5] for r in (1, 2, 3)]) * 10
    a, rows, U, V = hydrogen(S, x)
    p, q, F = contacts(S, x)
    v = x[F, q] - x[F, p]
    b = ang(bonded(S, x, p, F), v)
    order = rng.permutation(len(rows))[:2500]
    nullH = np.concatenate([spots(x[f, h], x[f, d] - x[f, h], x[f], S.heavy[S.res[S.heavy] != S.res[k]], 1.7, 2.5, 2.45) for h, d, k, f in (rows[i] for i in order)])
    nullO = []
    for i in rng.permutation(len(p))[:2500]:
        pi, qi, f = int(p[i]), int(q[i]), int(F[i])
        n = rng.choice(S.heavybond[pi])
        nullO.append(spots(x[f, pi], x[f, n] - x[f, pi], x[f], S.heavy[S.res[S.heavy] != S.res[qi]], 3.4, 4.5, 3.2))
    nullO = np.concatenate(nullO)
    y = S.crystal[None]
    ac = hydrogen(S, y)[0]
    pc, qc, Fc = contacts(S, y)
    bc = ang(bonded(S, y, pc, Fc), y[Fc, qc] - y[Fc, pc])
    # Each vector with the second vector of another contact.
    swap = rng.permutation(len(U))
    swapO = rng.permutation(len(v))
    pairs = {}
    for w in (1, 2):
        p2, q2, F2 = contacts(S, x, which=w, rc=5.0)
        pairs[f'rank{w + 1}'] = stats(ang(bonded(S, x, p2, F2), x[F2, q2] - x[F2, p2]))
    ca = {int(S.res[i]): i for i in range(len(S.atoms)) if S.name[i] == 'CA'}
    toCa = x[F, [ca[int(S.res[i])] for i in p]] - x[F, p]
    # Curves, from low angle to 180, in units of an even sphere.
    pa, po = hist(a, fine) * FINE, hist(b, fine) * FINE
    keep = (fine[:-1] + fine[1:]) / 2 <= 0.5
    angle = np.degrees(np.arccos(((fine[:-1] + fine[1:]) / 2)[keep]))[::-1]
    hb, oil = pa[keep][::-1], po[keep][::-1]
    curve = {'ang': [round(float(t), 1) for t in angle] + [180.0], 'hb': [round(float(t), 2) for t in hb] + [round(float(hb[-1]), 2)], 'oil': [round(float(t), 2) for t in oil] + [round(float(oil[-1]), 2)], 'top': round(float(hb.max()) * 1.05, 2)}
    out[tag] = {'curve': curve, 'stats': {
        'hbond': stats(a), 'oil': stats(b), 'nullHbond': stats(nullH), 'nullOil': stats(nullO),
        'hbondFromNull': round(apart(a, nullH), 2), 'oilFromNull': round(apart(b, nullO), 2),
        'crystalHbond': stats(ac), 'crystalOil': stats(bc),
        'shuffledHbond': stats(ang(U, V[swap])), 'shuffledOil': stats(ang(bonded(S, x, p, F), v[swapO])),
        'oilToCa': stats(ang(toCa, v)), **pairs,
    }}
print(json.dumps(out))
