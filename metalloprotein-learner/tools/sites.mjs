// Which atoms of which PDB entry each well uses. Selectors read chain + residue number + '.' + atom name.
// tap: atoms the player must find. given: first-shell atoms the cofactor supplies, drawn already bound.
// decoy: atoms that look tempting and are not bonded. shapes: polyhedra to fit; the first is the answer.
export const SITES = [
  { key: 'zif268', pdb: '1AAY', chains: ['A'], na: ['B', 'C'], stages: [
    { metals: ['A202.ZN'], tap: ['A137.SG', 'A140.SG', 'A153.NE2', 'A157.NE2'], decoy: ['A153.ND1', 'A157.ND1', 'A156.OG1', 'A137.O'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
  ] },
  { key: 'ca2', pdb: '2CBA', chains: ['A'], stages: [
    { metals: ['A262.ZN'], tap: ['A94.NE2', 'A96.NE2', 'A119.ND1', 'A263.O'], decoy: ['A94.ND1', 'A96.ND1', 'A119.NE2', 'A199.OG1', 'A106.OE1'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
  ] },
  { key: 'thermolysin', pdb: '8TLN', chains: ['E'], stages: [
    { metals: ['E321.ZN'], tap: ['E142.NE2', 'E146.NE2', 'E166.OE2', 'E392.O'], decoy: ['E166.OE1', 'E143.OE1', 'E143.OE2', 'E142.ND1', 'E231.NE2', 'E157.OH'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
  ] },
  { key: 'adh', pdb: '4DWV', chains: ['A'], stages: [
    { metals: ['A376.ZN'], tap: ['A97.SG', 'A100.SG', 'A103.SG', 'A111.SG'], decoy: ['A100.O', 'A111.O', 'A97.O', 'A552.O'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
  ] },
  { key: 'ndm1', pdb: '4EXS', chains: ['A'], show: ['A301'], stages: [
    { metals: ['A302.ZN'], tap: ['A120.NE2', 'A122.ND1', 'A189.NE2', 'A301.S'], decoy: ['A120.ND1', 'A122.NE2', 'A189.ND1'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
    { metals: ['A303.ZN'], tap: ['A124.OD2', 'A208.SG', 'A250.NE2'], given: ['A301.S'], decoy: ['A124.OD1', 'A250.ND1'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
  ] },

  { key: 'rubredoxin', pdb: '1IRO', chains: ['A'], stages: [
    { metals: ['A55.FE'], tap: ['A6.SG', 'A9.SG', 'A39.SG', 'A42.SG'], decoy: ['A6.O', 'A39.O', 'A42.O'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
  ] },
  { key: 'myoglobin', pdb: '1A6M', chains: ['A'], core: ['A154', 'A157'], stages: [
    { metals: ['A154.FE'], given: ['A154.NA', 'A154.NB', 'A154.NC', 'A154.ND'], tap: ['A93.NE2', 'A157.O1'], decoy: ['A64.NE2', 'A93.ND1', 'A157.O2', 'A64.ND1'], shapes: ['octahedral', 'trigonal prismatic'] },
  ] },
  { key: 'cytc', pdb: '1YCC', chains: ['A'], core: ['A118'], stages: [
    { metals: ['A118.FE'], given: ['A118.NA', 'A118.NB', 'A118.NC', 'A118.ND'], tap: ['A18.NE2', 'A80.SD'], decoy: ['A18.ND1', 'A67.OH', 'A80.O'], shapes: ['octahedral', 'trigonal prismatic'] },
  ] },
  { key: 'p450', pdb: '2CPP', chains: ['A'], core: ['A417', 'A422'], stages: [
    { metals: ['A417.FE'], given: ['A417.NA', 'A417.NB', 'A417.NC', 'A417.ND'], tap: ['A357.SG'], decoy: ['A252.OG1', 'A357.O', 'A350.O'], shapes: ['square pyramidal', 'trigonal bipyramidal'] },
  ] },
  { key: 'fe4s4', pdb: '1IQZ', chains: ['A'], core: ['A82'], hull: 'A82', stages: [
    { metals: ['A82.FE1', 'A82.FE2', 'A82.FE3', 'A82.FE4'], tap: ['A11.SG', 'A14.SG', 'A17.SG', 'A61.SG'], decoy: ['A63.OG1', 'A65.OG', 'A14.O', 'A11.O'], shapes: [] },
  ] },

  { key: 'plastocyanin', pdb: '1PLC', chains: ['A'], stages: [
    { metals: ['A100.CU'], tap: ['A37.ND1', 'A84.SG', 'A87.ND1', 'A92.SD'], decoy: ['A37.NE2', 'A87.NE2', 'A36.O', 'A84.O'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
  ] },
  { key: 'azurin', pdb: '4AZU', chains: ['A'], stages: [
    { metals: ['A400.CU'], tap: ['A46.ND1', 'A117.ND1', 'A112.SG', 'A121.SD', 'A45.O'], decoy: ['A46.NE2', 'A117.NE2', 'A44.O', 'A112.O'], shapes: ['trigonal bipyramidal', 'square pyramidal'] },
  ] },
  { key: 'sod', pdb: '2C9V', chains: ['A', 'F'], stages: [
    { metals: ['A155.ZN'], tap: ['A63.ND1', 'A71.ND1', 'A80.ND1', 'A83.OD1'], decoy: ['A83.OD2', 'A63.NE2', 'A71.NE2'], shapes: ['tetrahedral', 'square planar', 'seesaw'] },
    { metals: ['A154.CU'], tap: ['A46.ND1', 'A48.NE2', 'A120.NE2'], decoy: ['A63.NE2', 'A48.ND1', 'A120.ND1'], shapes: ['trigonal planar', 'T-shaped', 'trigonal pyramidal'] },
  ] },
  { key: 'hemocyanin', pdb: '1OXY', chains: ['A'], core: ['A631'], stages: [
    { metals: ['A629.CU'], given: ['A631.O1', 'A631.O2'], tap: ['A324.NE2', 'A328.NE2', 'A364.NE2'], decoy: ['A324.ND1', 'A328.ND1', 'A364.ND1'], shapes: [] },
    { metals: ['A630.CU'], given: ['A631.O1', 'A631.O2'], tap: ['A173.NE2', 'A177.NE2', 'A204.NE2'], decoy: ['A173.ND1', 'A177.ND1', 'A204.ND1'], shapes: [] },
  ] },
  { key: 'urease', pdb: '1FWJ', chains: ['C'], stages: [
    { metals: ['C574.NI'], given: ['C725.O', 'C726.O'], tap: ['C246.ND1', 'C272.NE2', 'C217.OQ1'], decoy: ['C246.NE2', 'C272.ND1', 'C219.NE2'], shapes: ['square pyramidal', 'trigonal bipyramidal'] },
    { metals: ['C575.NI'], given: ['C725.O', 'C727.O'], tap: ['C134.NE2', 'C136.NE2', 'C217.OQ2', 'C360.OD1'], decoy: ['C360.OD2', 'C134.ND1', 'C136.ND1'], shapes: ['octahedral', 'trigonal prismatic'] },
  ] },

  { key: 'calmodulin', pdb: '1EXR', chains: ['A'], stages: [
    { metals: ['A1000.CA'], tap: ['A20.OD1', 'A22.OD1', 'A24.OD1', 'A26.O', 'A31.OE1', 'A31.OE2', 'A2122.O'], decoy: ['A20.OD2', 'A22.OD2', 'A24.OD2', 'A26.OG1'], shapes: ['pentagonal bipyramidal', 'capped octahedral', 'capped trigonal prismatic'] },
  ] },
  { key: 'kcsa', pdb: '1K4C', assembly: 'C', chains: ['C', 'E', 'F', 'G'], stages: [
    { metals: ['C3002.K'], tap: ['C76.O', 'E76.O', 'F76.O', 'G76.O', 'C77.O', 'E77.O', 'F77.O', 'G77.O'], together: [['C76.O', 'E76.O', 'F76.O', 'G76.O'], ['C77.O', 'E77.O', 'F77.O', 'G77.O']], decoy: ['C75.O', 'C78.O', 'E75.O', 'E78.O'], shapes: ['square antiprismatic', 'cubic', 'dodecahedral'] },
  ] },
  { key: 'polb', pdb: '2FMS', chains: ['A'], na: ['T', 'P', 'D'], show: ['A338', 'P10'], stages: [
    { metals: ['A339.MG'], given: ['A338.O2B', 'A338.O3G'], tap: ['A190.OD1', 'A192.OD2', 'A338.O1A', 'A347.O'], decoy: ['A338.O2A', 'A338.O1G'], shapes: ['octahedral', 'trigonal prismatic'] },
    { metals: ['A340.MG'], given: ['A338.O1A', 'A348.O'], tap: ['A190.OD2', 'A192.OD1', 'A256.OD2', 'P10.O3\''], decoy: ['A256.OD1', 'A338.O2A'], shapes: ['octahedral', 'trigonal prismatic'] },
  ] },
  { key: 'mcm', pdb: '7REQ', chains: ['A'], core: ['A1800'], stages: [
    { metals: ['A1800.CO'], given: ['A1800.N21', 'A1800.N22', 'A1800.N23', 'A1800.N24'], tap: ['A610.NE2'], decoy: ['A610.ND1', 'A608.OD1'], shapes: ['square pyramidal', 'trigonal bipyramidal'] },
  ] },
  { key: 'psii', pdb: '3WU2', chains: ['A', 'C'], core: ['A401'], hull: 'A401', stages: [
    { metals: ['A401.MN1', 'A401.MN2', 'A401.MN3', 'A401.MN4', 'A401.CA1'], tap: ['A170.OD1', 'A170.OD2', 'A189.OE2', 'A332.NE2', 'A333.OE1', 'A333.OE2', 'A342.OD1', 'A342.OD2', 'A344.OXT', 'A344.O', 'C354.OE1', 'C354.OE2'], together: [['A170.OD1', 'A170.OD2'], ['A333.OE1', 'A333.OE2'], ['A342.OD1', 'A342.OD2'], ['A344.OXT', 'A344.O'], ['C354.OE1', 'C354.OE2']], decoy: ['A337.NE2', 'A332.ND1', 'A61.OD1', 'A189.OE1'], shapes: [] },
  ] },
  { key: 'nitrogenase', pdb: '3U7Q', chains: ['A'], core: ['A6496', 'A6494'], hull: 'A6496', stages: [
    { metals: ['A6496.FE1', 'A6496.FE2', 'A6496.FE3', 'A6496.FE4', 'A6496.FE5', 'A6496.FE6', 'A6496.FE7', 'A6496.MO1'], tap: ['A275.SG', 'A442.ND1', 'A6494.O5', 'A6494.O7'], decoy: ['A442.NE2', 'A96.NH1', 'A195.NE2', 'A6494.O6'], shapes: [] },
  ] },
];
