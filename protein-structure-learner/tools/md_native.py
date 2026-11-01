# Native-state MD of a small protein in explicit water, for comparing the game's model with real water.
# ff14SB, TIP3P, PME, HMR 1.5 amu, 4 fs, 300 K, 1 bar, 0.15 M NaCl. Modelled on the md_alanine.py script of the Boltz game.
#   python md_native.py prep  <PDB file> <tag>                         solvates; writes <tag>-solvated.pdb and <tag>-protein.pdb
#   python md_native.py bench <tag> <OpenCL|CPU> [threads]             prints ns/day
#   python md_native.py run   <tag> <run id> <ns> <OpenCL|CPU> [threads]    writes <tag>-<id>.dcd, protein atoms every 10 ps
# Independent runs differ in their velocities and thermostat noise, from the same crystal structure. The first 1 ns of each is not analysed.
# pdbfixer is not available. 1ENH has complete side chains and lacks only OXT, so OXT is placed here from the C, CA and O geometry.
import sys, time
import numpy as np
import openmm as mm, openmm.app as app, openmm.unit as u

FF = ('amber14/protein.ff14SB.xml', 'amber14/tip3p.xml')
AMINO = {'ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE','LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL'}

def add_oxt(mod):
    """Adds the missing terminal oxygen, in the plane of CA, C and O, 120 degrees from O."""
    chain = list(mod.topology.chains())[0]
    last = [r for r in chain.residues() if r.name in AMINO][-1]
    names = {a.name: a for a in last.atoms()}
    if 'OXT' in names:
        return mod
    pos = mod.positions.value_in_unit(u.nanometer)
    p = lambda n: np.array(list(pos[names[n].index]))
    c, ca, o = p('C'), p('CA'), p('O')
    a = (ca - c) / np.linalg.norm(ca - c)
    b = (o - c) / np.linalg.norm(o - c)
    d = -(a + b)
    d /= np.linalg.norm(d)
    x = c + 0.125 * d
    # Modeller has no add-atom call, so the terminal atom goes in through a new topology.
    top = app.Topology()
    newpos = []
    for ch in mod.topology.chains():
        nc = top.addChain(ch.id)
        for r in ch.residues():
            nr = top.addResidue(r.name, nc, r.id)
            for a2 in r.atoms():
                top.addAtom(a2.name, a2.element, nr)
                newpos.append(pos[a2.index])
            if r.index == last.index:
                top.addAtom('OXT', app.Element.getBySymbol('O'), nr)
                newpos.append(mm.Vec3(*x))
    atom_list = list(top.atoms())
    index = {(a2.residue.index, a2.name): a2 for a2 in atom_list}
    for b1, b2 in mod.topology.bonds():
        top.addBond(index[(b1.residue.index, b1.name)], index[(b2.residue.index, b2.name)])
    top.addBond(index[(last.index, 'C')], index[(last.index, 'OXT')])
    return app.Modeller(top, newpos * u.nanometer)

def prep(path, tag):
    pdb = app.PDBFile(path)
    mod = app.Modeller(pdb.topology, pdb.positions)
    # Crystal waters and ions go; the water box replaces them.
    mod.delete([r for r in mod.topology.residues() if r.name not in AMINO])
    mod = add_oxt(mod)
    ff = app.ForceField(*FF)
    mod.addHydrogens(ff, pH=7.0)
    print('protein atoms with hydrogens', mod.topology.getNumAtoms())
    with open(f'{tag}-protein.pdb', 'w') as f:
        app.PDBFile.writeFile(mod.topology, mod.positions, f)
    mod.addSolvent(ff, model='tip3p', padding=1.0*u.nanometer, boxShape='octahedron', ionicStrength=0.15*u.molar, neutralize=True)
    print('solvated atoms', mod.topology.getNumAtoms())
    with open(f'{tag}-solvated.pdb', 'w') as f:
        app.PDBFile.writeFile(mod.topology, mod.positions, f, keepIds=True)

def make(tag, seed, plat, threads=None):
    pdb = app.PDBFile(f'{tag}-solvated.pdb')
    ff = app.ForceField(*FF)
    system = ff.createSystem(pdb.topology, nonbondedMethod=app.PME, nonbondedCutoff=0.9*u.nanometer,
                             constraints=app.HBonds, rigidWater=True, hydrogenMass=1.5*u.amu)
    system.addForce(mm.MonteCarloBarostat(1*u.bar, 300*u.kelvin, 25))
    integ = mm.LangevinMiddleIntegrator(300*u.kelvin, 1/u.picosecond, 4*u.femtoseconds)
    integ.setRandomNumberSeed(seed)
    platform = mm.Platform.getPlatformByName(plat)
    props = {'Precision': 'single'} if plat == 'OpenCL' else ({'Threads': threads} if threads else {})
    sim = app.Simulation(pdb.topology, system, integ, platform, props)
    sim.context.setPositions(pdb.positions)
    if pdb.topology.getPeriodicBoxVectors() is not None:
        sim.context.setPeriodicBoxVectors(*pdb.topology.getPeriodicBoxVectors())
    return sim, pdb

mode = sys.argv[1]
if mode == 'prep':
    prep(sys.argv[2], sys.argv[3])
elif mode == 'bench':
    tag, plat = sys.argv[2], sys.argv[3]
    sim, _ = make(tag, 1, plat, sys.argv[4] if len(sys.argv) > 4 else None)
    sim.minimizeEnergy(maxIterations=200)
    sim.context.setVelocitiesToTemperature(300*u.kelvin, 2)
    sim.step(500)
    t = time.time()
    sim.step(2500)
    dt = time.time() - t
    print(plat, sys.argv[4:] , 'ns/day', round(2500*4e-6/dt*86400, 1))
else:
    tag, run, ns, plat = sys.argv[2], sys.argv[3], float(sys.argv[4]), sys.argv[5]
    threads = sys.argv[6] if len(sys.argv) > 6 else None
    seed = 7000 + 13*int(run)
    sim, pdb = make(tag, seed, plat, threads)
    sim.minimizeEnergy(maxIterations=1000)
    sim.context.setVelocitiesToTemperature(300*u.kelvin, seed + 1)
    protein = [a.index for a in pdb.topology.atoms() if a.residue.name in AMINO]
    sim.reporters.append(app.DCDReporter(f'{tag}-{run}.dcd', 2500, atomSubset=protein, enforcePeriodicBox=False))
    sim.reporters.append(app.StateDataReporter(f'{tag}-{run}.log', 25000, step=True, potentialEnergy=True, temperature=True, density=True, speed=True))
    steps = int(ns*1e6/4)
    # Written in slices so that a run that is stopped early still leaves a usable file.
    for i in range(0, steps, 25000):
        sim.step(25000)
