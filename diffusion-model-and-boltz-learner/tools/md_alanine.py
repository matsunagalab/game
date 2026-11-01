# Alanine dipeptide (ACE-ALA-NME) in TIP3P water with ff14SB at 300 K and 1 bar, in OpenMM.
# Plain MD crosses between regions too rarely: 37.0 ns of unbiased runs had one real entry to phi > 0 (915 ps long) and four one-frame
# grazes, and the alpha-like share of 1 ns blocks ran from 0 to 0.73. So the reference uses a fixed 2-D bias on phi and psi, found by a short
# well-tempered metadynamics run, and each frame is weighted back by exp(+V/kT). The runs behind the game: run 1 6 OpenCL, run 2 9 CPU 3, run 3 9 CPU 3.
#   python md_alanine.py bias <ns> OpenCL            writes bias72.npy, the bias V(psi, phi) in kJ/mol on a 72 x 72 periodic grid
#   python md_alanine.py run <id> <ns> <OpenCL|CPU> [threads]    writes frames-<id>.txt: step, phi, psi, V in kJ/mol, every 1 ps
# needs OpenMM, and ad.pdb from pdbfixer/tests/data/alanine-dipeptide.pdb in the working folder.
import sys, math
import numpy as np
import openmm as mm, openmm.app as app, openmm.unit as u
from openmm.app.metadynamics import Metadynamics, BiasVariable

mode = sys.argv[1]
pdb = app.PDBFile('ad.pdb')
ff = app.ForceField('amber14/protein.ff14SB.xml', 'amber14/tip3p.xml')
mod = app.Modeller(pdb.topology, pdb.positions)
mod.addHydrogens(ff)
mod.addSolvent(ff, model='tip3p', padding=1.0*u.nanometer, ionicStrength=0*u.molar)
system = ff.createSystem(mod.topology, nonbondedMethod=app.PME, nonbondedCutoff=0.9*u.nanometer,
                         constraints=app.HBonds, rigidWater=True, hydrogenMass=1.5*u.amu)
system.addForce(mm.MonteCarloBarostat(1*u.bar, 300*u.kelvin, 25))
atoms = {(a.residue.name, a.name): a.index for a in mod.topology.atoms() if a.residue.name in ('ACE','ALA','NME')}
C0, N, CA, C, N2 = atoms[('ACE','C')], atoms[('ALA','N')], atoms[('ALA','CA')], atoms[('ALA','C')], atoms[('NME','N')]
def torsion(a, b, c, d):
    f = mm.CustomTorsionForce('theta'); f.addTorsion(a, b, c, d, []); return f
def dih(p, a, b, c, d):
    b0, b1, b2 = p[a]-p[b], p[c]-p[b], p[d]-p[c]
    b1n = b1/np.linalg.norm(b1)
    v = b0-np.dot(b0,b1n)*b1n; w = b2-np.dot(b2,b1n)*b1n
    return math.degrees(math.atan2(np.dot(np.cross(b1n,v),w), np.dot(v,w)))
def make(seed, plat, threads=None):
    integ = mm.LangevinMiddleIntegrator(300*u.kelvin, 1/u.picosecond, 4*u.femtoseconds)
    integ.setRandomNumberSeed(seed)
    platform = mm.Platform.getPlatformByName(plat)
    props = {'Precision':'single'} if plat == 'OpenCL' else ({'Threads':threads} if threads else {})
    sim = app.Simulation(mod.topology, system, integ, platform, props)
    sim.context.setPositions(mod.positions)
    sim.minimizeEnergy(maxIterations=500)
    sim.context.setVelocitiesToTemperature(300*u.kelvin, seed+1)
    return sim

if mode == 'bias':
    ns = float(sys.argv[2])
    w = 0.3
    pv = BiasVariable(torsion(C0, N, CA, C), -math.pi, math.pi, w, periodic=True, gridWidth=72)
    qv = BiasVariable(torsion(N, CA, C, N2), -math.pi, math.pi, w, periodic=True, gridWidth=72)
    meta = Metadynamics(system, [pv, qv], 300*u.kelvin, biasFactor=6.0, height=1.2*u.kilojoules_per_mole, frequency=250)
    sim = make(4242, sys.argv[3])
    meta.step(sim, int(ns*1e6/4))
    # Metadynamics stores the bias itself. getFreeEnergy returns -(gamma/(gamma-1)) V.
    gamma = 6.0
    F = meta.getFreeEnergy().value_in_unit(u.kilojoules_per_mole)
    V = -np.asarray(F)*(gamma-1)/gamma
    V = V - V.min()
    # OpenMM's grid runs over both ends, so a periodic table already closes on itself. Rows are psi, columns phi.
    G = V
    np.save('bias72.npy', G)
    print('bias range kJ/mol', G.min(), G.max())
else:
    run, ns, plat = sys.argv[2], float(sys.argv[3]), sys.argv[4]
    threads = sys.argv[5] if len(sys.argv) > 5 else None
    G = np.load('bias72.npy')
    cv = mm.CustomCVForce('table(phi,psi)')
    cv.addCollectiveVariable('phi', torsion(C0, N, CA, C)); cv.addCollectiveVariable('psi', torsion(N, CA, C, N2))
    # Continuous2DFunction takes x, here phi, as the fast index.
    cv.addTabulatedFunction('table', mm.Continuous2DFunction(72, 72, G.ravel().tolist(), -math.pi, math.pi, -math.pi, math.pi, True))
    cv.setForceGroup(1)
    system.addForce(cv)
    sim = make(5000+int(run), plat, threads)
    sim.step(50000)  # 200 ps of equilibration under the bias, not recorded
    out = open(f'frames-{run}.txt', 'w')
    for i in range(int(ns*1000)):
        sim.step(250)
        st = sim.context.getState(getPositions=True)
        p = st.getPositions(asNumpy=True).value_in_unit(u.nanometer)
        v = sim.context.getState(getEnergy=True, groups={1}).getPotentialEnergy().value_in_unit(u.kilojoules_per_mole)
        out.write(f'{i} {dih(p,C0,N,CA,C):.2f} {dih(p,N,CA,C,N2):.2f} {v:.4f}\n')
        if i % 200 == 0: out.flush()
    out.close()
