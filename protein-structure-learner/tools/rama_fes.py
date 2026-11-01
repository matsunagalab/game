# Adds a generic backbone term to src/data/grab-params.json: the free energy of phi and psi for alanine dipeptide in water, 10 degree grid.
#   python rama_fes.py frames-1.txt frames-2.txt frames-3.txt ../src/data/grab-params.json
# The frames are the 24.0 ns biased and reweighted reference of the Boltz game (diffusion-model-and-boltz-learner/tools/md_alanine.py),
# ff14SB, TIP3P, 300 K. Each line is: step, phi, psi, V in kJ/mol. Weights are exp(+V/kT). It knows nothing about any folded protein,
# so it cannot carry native information. It is smoothed with a 10 degree Gaussian and capped at 6 kcal/mol.
import sys, json
import numpy as np

kT = 2.494  # kJ/mol at 300 K
rows = [np.loadtxt(f) for f in sys.argv[1:-1]]
print([len(r) for r in rows])
d = np.vstack(rows)
phi, psi, V = d[:, 1], d[:, 2], d[:, 3]
w = np.exp(V / kT)
w /= w.max()
N = 36
g = -180 + (np.arange(N) + 0.5) * 10
P = np.zeros((N, N))
sig = 10.0
# Periodic Gaussian density. Rows are psi, columns are phi.
for i in range(N):
    dx = (psi - g[i] + 180) % 360 - 180
    a = w * np.exp(-0.5 * (dx / sig) ** 2)
    for j in range(N):
        dy = (phi - g[j] + 180) % 360 - 180
        P[i, j] = (a * np.exp(-0.5 * (dy / sig) ** 2)).sum()
F = -kT * np.log(P / P.max()) / 4.184
F = np.minimum(F, 6.0)
print('range', F.min(), F.max())
def at(a, b):
    return round(float(F[int((b + 180) // 10) % N, int((a + 180) // 10) % N]), 2)
for name, (a, b) in {'alpha': (-65, -40), '3-10': (-55, -25), 'beta': (-120, 130), 'PII': (-70, 145), 'alpha-L': (55, 45), 'flip': (60, -120)}.items():
    print(name, a, b, at(a, b))
path = sys.argv[-1]
p = json.load(open(path))
p['rama'] = [round(float(v), 2) for v in F.ravel()]
json.dump(p, open(path, 'w'), separators=(',', ':'))
