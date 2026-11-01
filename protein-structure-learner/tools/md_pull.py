# The game's move in real water: pull one part of the protein, hold it, let go, and watch what comes back. There is no memory term here.
# ff14SB, TIP3P, PME, HMR, 4 fs, 300 K, as in md_native.py.
#   python md_pull.py <tag> <first residue number> <site number> <bb|sc> <distance A> <replicate> <OpenCL|CPU>
# bb pulls the backbone and CB of residues site-1 to site+1, the same atoms as the game's grip on a chain. sc pulls the side chain from CG outward.
# Stages: 500 ps free (only the last 200 ps are the reference), 200 ps pull, 100 ps hold, 1000 ps released. Protein coordinates every 2 ps.
# The grip is a stiff harmonic spring between the group and the far part of the protein, so that nothing else in the system is restrained.
import sys
import numpy as np
import openmm as mm, openmm.app as app, openmm.unit as u

tag, first, site, kind, dist, rep, plat = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], float(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
AMINO = {'ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE','LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL'}
pdb = app.PDBFile(f'{tag}-solvated.pdb')
ff = app.ForceField('amber14/protein.ff14SB.xml', 'amber14/tip3p.xml')
system = ff.createSystem(pdb.topology, nonbondedMethod=app.PME, nonbondedCutoff=0.9*u.nanometer, constraints=app.HBonds, rigidWater=True, hydrogenMass=1.5*u.amu)
system.addForce(mm.MonteCarloBarostat(1*u.bar, 300*u.kelvin, 25))
resi = [r for r in pdb.topology.residues() if r.name in AMINO]
at = site - first
if kind == 'bb':
    group = [a.index for r in resi[at-1:at+2] for a in r.atoms() if a.name in ('N', 'CA', 'C', 'O', 'CB')]
else:
    group = [a.index for a in resi[at].atoms() if a.element.symbol != 'H' and a.name not in ('N', 'CA', 'C', 'O', 'CB')]
far = [a.index for r in resi if abs(r.index - resi[at].index) > 6 for a in r.atoms() if a.name == 'CA']
print('group', len(group), 'far', len(far))

K = 10 * 4.184 * 100  # 10 kcal/mol/A^2 in kJ/mol/nm^2
force = mm.CustomCentroidBondForce(2, '0.5*k*((x1-x2-tx)^2+(y1-y2-ty)^2+(z1-z2-tz)^2)')
force.addGlobalParameter('k', 0.0)
for p in ('tx', 'ty', 'tz'):
    force.addGlobalParameter(p, 0.0)
force.addGroup(group)
force.addGroup(far)
force.addBond([0, 1], [])
force.setUsesPeriodicBoundaryConditions(False)
force.setForceGroup(2)
system.addForce(force)

seed = 9100 + 17 * rep + site
integ = mm.LangevinMiddleIntegrator(300*u.kelvin, 1/u.picosecond, 4*u.femtoseconds)
integ.setRandomNumberSeed(seed)
platform = mm.Platform.getPlatformByName(plat)
sim = app.Simulation(pdb.topology, system, integ, platform, {'Precision': 'single'} if plat == 'OpenCL' else {})
sim.context.setPositions(pdb.positions)
sim.context.setPeriodicBoxVectors(*pdb.topology.getPeriodicBoxVectors())
sim.minimizeEnergy(maxIterations=1000)
sim.context.setVelocitiesToTemperature(300*u.kelvin, seed + 1)

protein = [a.index for a in pdb.topology.atoms() if a.residue.name in AMINO]
name = f'{tag}-pull-{site}{kind}-{rep}'
sim.reporters.append(app.DCDReporter(f'{name}.dcd', 500, atomSubset=protein, enforcePeriodicBox=False))
STEP = 250  # one picosecond
sim.step(500 * STEP)

mass = np.array([system.getParticleMass(i).value_in_unit(u.dalton) for i in range(system.getNumParticles())])
def centres():
    x = sim.context.getState(getPositions=True).getPositions(asNumpy=True).value_in_unit(u.nanometer)
    return (x[group] * mass[group, None]).sum(0) / mass[group].sum(), (x[far] * mass[far, None]).sum(0) / mass[far].sum(), x[protein].mean(0)
g, f, c = centres()
base = g - f
d = (g - c) / np.linalg.norm(g - c)
sim.context.setParameter('k', K)
for p, v in zip(('tx', 'ty', 'tz'), base):
    sim.context.setParameter(p, float(v))
peak = 0.0
log = open(f'{name}.log', 'w')
for i in range(200):
    t = base + d * (dist * 0.1) * (i + 1) / 200
    for p, v in zip(('tx', 'ty', 'tz'), t):
        sim.context.setParameter(p, float(v))
    sim.step(STEP)
    g, f, _ = centres()
    fn = K * np.linalg.norm(g - f - t)  # kJ/mol/nm
    peak = max(peak, fn)
    log.write(f'{i} {np.dot(g - f - base, d) * 10:.2f} {fn * 1.66:.0f}\n')
for i in range(100):
    sim.step(STEP)
    g, f, _ = centres()
    log.write(f'{200 + i} {np.dot(g - f - base, d) * 10:.2f} {K * np.linalg.norm(g - f - t) * 1.66:.0f}\n')
log.flush()
print('peak force pN', round(peak * 1.66), 'moved A', round(float(np.dot(g - f - base, d) * 10), 2))
sim.context.setParameter('k', 0.0)
sim.step(1000 * STEP)
log.close()
