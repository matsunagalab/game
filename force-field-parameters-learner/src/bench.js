// Bench notes: real force-field history, tied to the plates. Each line was checked against a published record.
// Lines appear as the plates are finished.
export const BENCH = [
  { plate: 'organ', head: 'Families differ', lines: [
    '1–4 scaling is a family choice: AMBER uses ½ for vdW and 1/1.2 for charges, OPLS ½ for both, and CHARMM leaves both unscaled with special 1–4 vdW values.',
    'So are combining rules: AMBER and CHARMM use Lorentz-Berthelot, OPLS uses geometric means.',
    'Torsions are fitted around these choices, so they do not move between families.',
  ] },
  { plate: 'helix', head: 'The AMBER line', lines: [
    'ff99SB (Hornak 2006): new backbone torsions for ff99.',
    'ff99SB* (Best & Hummer 2009): a small ψ correction for helix-coil balance.',
    'ff99SB-ILDN (Lindorff-Larsen 2010): side-chain torsions refit: χ1 for Ile and Leu, χ1 and χ2 for Asp and Asn.',
    'ff14SB (Maier 2015): all side chains refit to QM, with a φ adjustment.',
    'ff19SB (Tian 2020): amino-acid-specific CMAPs fitted to QM surfaces in solution. Its authors recommend OPC water.',
  ] },
  { plate: 'cross', head: 'No universal map', lines: [
    'ff99SB and ff14SB work with no CMAP at all; nonbonded terms supply the φ/ψ coupling and torsions the rest. ff19SB brought CMAPs into the AMBER line.',
  ] },
  { plate: 'paint', head: 'The CHARMM line', lines: [
    'CHARMM22, then C22/CMAP (MacKerell 2004): a grid correction in φ and ψ.',
    'CHARMM36 (Best 2012): refitted CMAP and side chains.',
    'CHARMM36m (Huang 2017): an αL fix for disordered peptides, with stronger water hydrogens as an option.',
  ] },
  { plate: 'esp', head: 'Where charges come from', lines: [
    'RESP (Bayly 1993): restrained fits to an electrostatic potential.',
    'ff15ipq (Debiec 2016): charges fitted with solvent polarization built in, by the IPolQ route.',
    'Hydration free energy is the standard test of a charge set. FreeSolv (Mobley & Guthrie 2014) collects measured and computed values.',
  ] },
  { plate: 'liquid', head: 'Water is part of the force field', lines: [
    'TIP3P: three sites, 2.35 D.',
    'TIP4P/2005 (Abascal & Vega 2005): four sites, fitted to condensed-phase data including ice.',
    'OPC (Izadi 2014): a four-point model built by a different route, with a good dielectric constant.',
    'Polarizable force fields let the charges respond: AMOEBA (Ponder 2010) and Drude-2013 (Lopes 2013).',
  ] },
  { plate: 'salt', head: 'Pair by pair', lines: [
    'NBFIX overrides the combining rule for one pair. CUFIX (Yoo & Aksimentiev 2016, 2018) calibrates such pairs against osmotic pressure.',
    'CHARMM22* took the other route, and reduced side-chain charges (Piana 2011).',
  ] },
  { plate: 'argon', head: 'Fitted to liquids', lines: [
    'OPLS (Jorgensen 1996) fits nonbonded terms to liquid density and heat of vaporization.',
  ] },
  { plate: 'chain', head: 'Disordered chains', lines: [
    'Best, Zheng & Mittal (2014): protein-water ε × 1.10 (ff03ws).',
    'TIP4P-D (Piana 2015): water dispersion raised by about 50%.',
    'a99SB-disp (Robustelli 2018): torsions plus protein and water vdW, tested on 21 systems.',
  ] },
  { plate: 'pair', head: 'Sticky proteins', lines: [
    'Petrov & Zagrovic (2014): villin aggregated in simulation at concentrations where it is soluble.',
    'Stark, Andrews & Elcock (2013): second virial coefficients as a target, in a coarse-grained model.',
    'DES-Amber (Piana 2020): reparameterized for complexes; association free energies still deviate.',
  ] },
  { plate: 'sampling', head: 'Telling sampling from physics', lines: [
    'Noé et al. (2009): many short runs, joined in a Markov model, found misfolded traps in a WW domain.',
    'Piana et al. (2011): villin folded in four force fields, by different mechanisms.',
  ] },
  { plate: 'meta', head: 'Doing it by machine', lines: [
    'MBAR (Shirts & Chodera 2008): reweighting from many states at once.',
    'ForceBalance (Wang 2014): automatic, reproducible fits to mixed data.',
    'AMBER-FB15 (Wang 2017): bonded terms fitted to quantum data with ForceBalance, with charges and vdW unchanged and experiments kept for validation.',
    'Machine-learned potentials are the newest branch. MACE-OFF ran crambin in explicit water, and its authors note it lacks long-range electrostatics.',
  ] },
];
