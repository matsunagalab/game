// What the game teaches: every well, its clue, its feedback and its closing note.
// Distances and fits are not written here. They come from the coordinates in data/sites.json.

// e: electrons on the ion, which sets how strongly it scatters X-rays.
// liquid: the colour of the salt in water. glow: the colour the protein takes on.
export const METALS = {
  Zn: { ion: 'Zn^2+', salt: 'ZnCl_2', e: 28, liquid: '#e4ebf2', glow: '#d9e4ff', r: 0.34, likes: 'nitrogen, sulfur and oxygen at about 2.0 to 2.3 Å' },
  Fe: { ion: 'Fe^2+', salt: 'FeSO_4', e: 24, liquid: '#b7dc8c', glow: '#ff5a3c', r: 0.36, likes: 'sulfur at about 2.3 Å, and nitrogen at about 2.0 Å' },
  Cu: { ion: 'Cu^2+', salt: 'CuSO_4', e: 27, liquid: '#2f9bea', glow: '#2f8bff', r: 0.34, likes: 'histidine at about 2.0 Å and cysteine at about 2.2 Å' },
  Ni: { ion: 'Ni^2+', salt: 'NiCl_2', e: 26, liquid: '#4fc47f', glow: '#57d98a', r: 0.33, likes: 'nitrogen and oxygen at about 2.1 Å' },
  Co: { ion: 'Co^2+', salt: 'CoCl_2', e: 25, liquid: '#ea5f97', glow: '#ff4f9a', r: 0.34, likes: 'nitrogen at about 2.0 Å' },
  Mn: { ion: 'Mn^2+', salt: 'MnCl_2', e: 23, liquid: '#f2bccb', glow: '#b58cff', r: 0.38, likes: 'oxygen at about 2.2 Å' },
  Mg: { ion: 'Mg^2+', salt: 'MgCl_2', e: 10, liquid: '#e4ebf2', glow: '#9df7c0', r: 0.34, likes: 'six oxygens at about 2.1 Å' },
  Ca: { ion: 'Ca^2+', salt: 'CaCl_2', e: 18, liquid: '#e4ebf2', glow: '#ffd98a', r: 0.46, likes: 'six to eight oxygens at about 2.4 Å' },
  K: { ion: 'K^+', salt: 'KCl', e: 18, liquid: '#e4ebf2', glow: '#c9a2ff', r: 0.56, likes: 'eight oxygens at about 2.8 Å' },
  Na: { ion: 'Na^+', salt: 'NaCl', e: 10, liquid: '#e4ebf2', glow: '#ffe08a', r: 0.46, likes: 'oxygen at about 2.4 Å' },
  Mo: { ion: 'Mo', salt: 'Na_2MoO_4', e: 39, liquid: '#e4ebf2', glow: '#9fd8ff', r: 0.38, likes: 'sulfur at about 2.3 Å' },
  V: { ion: 'V', salt: 'NaVO_3', e: 20, liquid: '#f0d778', glow: '#ffd98a', r: 0.36, likes: 'sulfur at about 2.3 Å' },
};

export const ROWS = [
  { id: 'A', name: 'Zinc', line: 'Find the first shell. Zinc holds proteins together and does chemistry without changing charge.' },
  { id: 'B', name: 'Iron', line: 'Heme and iron-sulfur sites. Iron changes charge, so it can carry electrons and handle oxygen.' },
  { id: 'C', name: 'Copper and nickel', line: 'Blue copper sites, long bonds and metals working in pairs.' },
  { id: 'D', name: 'Hard ions and great clusters', line: 'Oxygen cages for calcium, potassium and magnesium, then the most complex metal centers in biology.' },
];

export const WELLS = {
  A1: {
    kind: 'site', site: 'zif268', name: 'Zinc finger', protein: 'Zif268 bound to DNA', org: 'Mouse', metal: 'Zn',
    clue: 'A chain of about 30 residues grips DNA. It keeps its fold only because one ion ties a hairpin to a helix.',
    stages: [{
      find: 'The green mesh is density the model cannot explain. Tap the four atoms that reach it.',
      soak: { answer: 'Zn', options: ['Zn', 'Mg', 'Ca'], why: {
        Mg: 'Magnesium almost never binds cysteine. It wants six oxygens.',
        Ca: 'Calcium wants six to eight oxygens at 2.4 Å. This site offers two sulfurs and two nitrogens at 2.1 to 2.3 Å.',
      } },
    }],
    note: 'Cys_2His_2 fingers are among the most common DNA-binding domains in the human genome. The zinc does no chemistry here. Its d shell is full, so it cannot change charge, and that makes it a safe rivet right next to DNA.',
  },
  A2: {
    kind: 'site', site: 'ca2', name: 'Carbonic anhydrase II', protein: 'Carbonic anhydrase II', org: 'Human', metal: 'Zn',
    clue: 'This enzyme hydrates CO_2 about a million times a second. Three histidines and one small molecule hold the ion at the bottom of a deep cleft.',
    stages: [{
      find: 'Find the four atoms. One of them is not part of the protein.',
      notes: {
        'A199.OG1': 'Thr199 Oγ1 hydrogen-bonds the bound water and steers it, but it never touches the metal.',
        'A106.OE1': 'Glu106 holds Thr199 in place from one layer further out. It never reaches the metal.',
      },
      soak: { answer: 'Zn', options: ['Zn', 'Ca', 'Mg', 'Cu'], why: {
        Cu: 'Copper would bind, and tightly, but the enzyme with copper in place does not work. Cu^2+ takes a five-coordinate shape that the substrate cannot use.',
        Ca: 'Calcium is too large for three histidines at 2.1 Å.',
        Mg: 'Magnesium prefers oxygen. Three histidines are the wrong offer.',
      } },
    }],
    note: 'His119 binds through Nδ1 while His94 and His96 use Nε2, so always check which ring nitrogen does the work. The fourth ligand is the catalyst: zinc lowers the pK_a of this water to about 7, so at neutral pH it is ready to attack CO_2 as hydroxide.',
  },
  A3: {
    kind: 'site', site: 'thermolysin', name: 'Thermolysin', protein: 'Thermolysin', org: 'Bacillus thermoproteolyticus', metal: 'Zn',
    clue: 'A protease from a hot-spring bacterium. Two of its ligands come from a single helix, in the motif His-Glu-X-X-His.',
    stages: [{
      find: 'Four atoms again. This time one is a carboxylate oxygen.',
      notes: {
        'E166.OE1': 'Oε1 sits at 2.79 Å, too far for a firm bond. Glu166 binds through its other oxygen at 1.88 Å.',
        'E143.OE1': 'Glu143 is the general base. It takes a proton from the water, and it does not bind the metal.',
        'E143.OE2': 'Glu143 is the general base. It takes a proton from the water, and it does not bind the metal.',
        'E231.NE2': 'His231 stabilizes the reaction intermediate from the second shell.',
        'E157.OH': 'Tyr157 stabilizes the reaction intermediate from the second shell.',
      },
      soak: { answer: 'Zn', options: ['Zn', 'Ca', 'Mn'], why: {
        Ca: 'Thermolysin does carry four Ca^2+ ions, but elsewhere, for heat stability. At 2.0 Å this site is much too tight for calcium.',
        Mn: 'Manganese prefers oxygen and longer bonds, near 2.2 Å. This site measures closer to 1.9 Å.',
      } },
    }],
    note: 'His142 and His146 sit about one helical turn apart, so the HEXXH motif places both on the same face. Glu143, between them in sequence, points at the water instead of the metal. You will see this motif in many zinc proteases.',
  },
  A4: {
    kind: 'site', site: 'adh', name: 'Alcohol dehydrogenase', protein: 'Alcohol dehydrogenase', org: 'Horse', metal: 'Zn',
    clue: 'This colorless enzyme holds two zinc ions about 20 Å apart. One binds the alcohol. This one sits in a small lobe far from any substrate.',
    stages: [{
      find: 'Four sulfurs, all from cysteine. Tap each one.',
      soak: { answer: 'Zn', options: ['Zn', 'Fe', 'Ca'], why: {
        Fe: 'Iron can sit in a Cys_4 site, as you will see in well B1, but that site is red and carries electrons. This protein is colorless and this site does no redox chemistry.',
        Ca: 'Calcium wants oxygen. Four thiolates are the wrong offer.',
      } },
    }],
    note: 'Same ligands and same shape as the iron in rubredoxin, for a different job. This zinc only stitches a lobe together. So ligands alone do not name the metal: you also need the color and the function.',
  },
  A5: {
    kind: 'site', site: 'ndm1', name: 'NDM-1', protein: 'New Delhi metallo-β-lactamase 1', org: 'Klebsiella pneumoniae', metal: 'Zn',
    clue: 'This enzyme destroys carbapenems, last-line antibiotics. Two ions sit 3.6 Å apart, and here a drug, L-captopril, wedges its sulfur between them.',
    stages: [{
      find: 'First ion: three histidines and the sulfur of the drug.',
      soak: { answer: 'Zn', options: ['Zn', 'Mg', 'Ca'], why: {
        Mg: 'Magnesium prefers oxygen, and here it would be offered three histidines and a thiol.',
        Ca: 'Calcium is too large for bonds near 2.1 Å.',
      } },
    }, {
      find: 'Second ion: the drug sulfur is shared. Find the other three atoms.',
      auto: true,
    }],
    note: 'In the working enzyme a hydroxide bridges the two zinc ions and opens the β-lactam ring. The thiol of captopril takes that bridging position. Notice that the two sites differ: His_3 on one side, Asp, Cys and His on the other.',
  },
  A6: {
    kind: 'arcade', game: 'sort', name: 'Hard or soft', metal: 'Ca',
    clue: 'Ions that hold their electrons tightly are hard and want oxygen. Easily polarized ions are soft and want sulfur. The ones in between take nitrogen.',
    note: 'Pearson’s rule of thumb explains most of what you saw in row A and will see in rows B to D. Zinc is borderline, which is why it takes His, Cys, Asp and Glu alike.',
  },

  B1: {
    kind: 'site', site: 'rubredoxin', name: 'Rubredoxin', protein: 'Rubredoxin', org: 'Clostridium pasteurianum', metal: 'Fe', tint: '#ff4a32',
    clue: 'A red protein of only 54 residues. It shuttles one electron at a time.',
    stages: [{
      find: 'Four sulfurs hold this ion. Tap each one.',
      soak: { answer: 'Fe', options: ['Fe', 'Zn', 'Mg'], why: {
        Zn: 'Zinc would fit a Cys_4 site, but it has only one stable charge, so it could never carry an electron. It is also colorless.',
        Mg: 'Magnesium avoids sulfur, and it cannot change charge.',
      } },
    }],
    note: 'The simplest iron-sulfur protein: one iron, four cysteines, no inorganic sulfur. The iron cycles between Fe^2+ and Fe^3+. The red color comes from charge moving between sulfur and iron.',
  },
  B2: {
    kind: 'site', site: 'myoglobin', name: 'Myoglobin', protein: 'Oxymyoglobin', org: 'Sperm whale', metal: 'Fe', heme: true,
    clue: 'Muscle stores oxygen in this protein, the first protein structure ever solved. The ring in the pocket already offers four nitrogens.',
    stages: [{
      find: 'The heme gives four nitrogens. Find the two atoms above and below the ring.',
      notes: {
        'A64.NE2': 'This is distal His64. It hydrogen-bonds the bound O_2 but does not touch the metal.',
        'A64.ND1': 'This is distal His64, and this nitrogen points away from the site.',
        'A157.O2': 'This is the far atom of O_2. It binds end-on and bent, through the near atom.',
      },
      soak: { answer: 'Fe', options: ['Fe', 'Mg', 'Zn'], why: {
        Mg: 'Magnesium in a similar ring gives you chlorophyll, not an oxygen store. It cannot bind O_2.',
        Zn: 'Zinc fills the ring but cannot bind O_2. Its full d shell has no way to bond to it.',
      } },
    }],
    note: 'Proximal His93 anchors the iron from below, and O_2 binds on the other face. Distal His64 hydrogen-bonds it, so O_2 binds more tightly than it otherwise would. Without the protein around it, heme iron oxidizes quickly in water.',
  },
  B3: {
    kind: 'site', site: 'cytc', name: 'Cytochrome c', protein: 'Iso-1-cytochrome c', org: 'Yeast', metal: 'Fe', heme: true,
    clue: 'This heme protein hands electrons along the respiratory chain. It does not bind oxygen, and the reason is in the pocket.',
    stages: [{
      find: 'Find the two atoms that close the heme from above and below.',
      notes: { 'A67.OH': 'Tyr67 hydrogen-bonds the sulfur of Met80 from the second shell.' },
      soak: { answer: 'Fe', options: ['Fe', 'Cu', 'Co'], why: {
        Cu: 'Copper binds porphyrins too, but it would not use two axial ligands this way.',
        Co: 'Cobalt does sit in tetrapyrroles, as you will see in well D4, but this is a heme, and heme means iron.',
      } },
    }],
    note: 'With His18 below and Met80 above, no position is free for O_2. The iron can only move electrons. Sulfur from methionine is an unusual ligand for heme, and it helps set the redox potential.',
  },
  B4: {
    kind: 'site', site: 'p450', name: 'Cytochrome P450cam', protein: 'Cytochrome P450cam with camphor', org: 'Pseudomonas putida', metal: 'Fe', heme: true,
    clue: 'This enzyme inserts an oxygen atom into a C–H bond of camphor, a very hard reaction. Its heme looks like the one in myoglobin, on a different anchor.',
    stages: [{
      find: 'The heme gives four nitrogens. Find the fifth atom. There is no sixth here.',
      notes: { 'A252.OG1': 'Thr252 helps protons reach bound oxygen, far from the metal.' },
      soak: { answer: 'Fe', options: ['Fe', 'Co', 'Mn'], why: {
        Co: 'Cobalt fits a tetrapyrrole, but this ring is heme.',
        Mn: 'Manganese prefers oxygen ligands. Heme means iron.',
      } },
    }],
    note: 'A cysteine thiolate replaces the histidine of myoglobin. It pushes electrons onto the iron, which helps split the O–O bond. With camphor in the pocket the sixth position is empty, and that gap is where O_2 will bind.',
  },
  B5: {
    kind: 'site', site: 'fe4s4', name: 'Ferredoxin', protein: '[4Fe-4S] ferredoxin', org: 'Bacillus thermoproteolyticus', metal: 'Fe', tint: '#ff9a4a', cluster: true,
    clue: 'The metal center here is not one ion but four, locked into a cage with four sulfides. This structure reaches 0.92 Å.',
    stages: [{
      find: 'The cage is in place. Find the four cysteines that anchor it.',
      ask: {
        q: 'What shape is this cage?',
        options: [
          { label: 'A distorted cube', ok: true },
          { label: 'A flat ring', why: 'Turn the cage and look along it. The atoms fill all three dimensions.' },
          { label: 'A single tetrahedron', why: 'Each iron is tetrahedral, but eight atoms make the whole cage.' },
        ],
      },
      soak: { answer: 'Fe', options: ['Fe', 'Zn', 'Cu'], why: {
        Zn: 'Zinc cannot share electrons around a cage. It has only one stable charge.',
        Cu: 'Copper does not build these cubes. Rust-colored clusters like this are iron.',
      } },
    }],
    note: 'Iron and sulfide take alternate corners of a distorted cube. Each iron is tetrahedral, with three sulfides and one cysteine. Electrons spread across the whole cage, which makes it a very good electron carrier.',
  },
  B6: {
    kind: 'arcade', game: 'edge', name: 'Edge scan', metal: 'Fe',
    clue: 'At a synchrotron you can name a metal without guessing. Each element absorbs X-rays sharply at its own energy, its K-edge.',
    note: 'Edges climb steadily with atomic number, the same trend Moseley found in X-ray emission lines. Crystallographers use exactly this scan to name the metal in a new structure.',
  },

  C1: {
    kind: 'site', site: 'plastocyanin', name: 'Plastocyanin', protein: 'Plastocyanin', org: 'Poplar', metal: 'Cu',
    clue: 'In the chloroplast this protein carries electrons toward photosystem I. It is a deep blue, with a strong band near 600 nm that simple complexes of this metal lack.',
    stages: [{
      find: 'Four ligands: two histidines, a cysteine, and a methionine that sits further out than the rest.',
      soak: { answer: 'Cu', options: ['Cu', 'Fe', 'Zn'], why: {
        Fe: 'Iron with cysteine is red, as in rubredoxin. Intense blue points elsewhere.',
        Zn: 'Zinc is colorless and cannot carry an electron.',
      } },
    }],
    note: 'Cu^2+ alone leans toward a square plane and Cu^+ toward a tetrahedron. This site sits between the two, so transferring an electron costs little movement. The classic explanation is the entatic state, where the protein forces this shape. How much is forced by the protein and how much by the cysteine ligand is still debated. The blue comes from charge moving from the cysteine sulfur, 2.07 Å away, to the copper.',
  },
  C2: {
    kind: 'site', site: 'azurin', name: 'Azurin', protein: 'Azurin', org: 'Pseudomonas aeruginosa', metal: 'Cu',
    clue: 'A bacterial blue copper protein. It looks like plastocyanin with one more contact. Some of the bonds here are unusually long.',
    stages: [{
      find: 'Find five atoms. Two of them sit near 3 Å, far longer than normal bonds. One is a backbone oxygen.',
      soak: { answer: 'Cu', options: ['Cu', 'Ni', 'Zn'], why: {
        Ni: 'Nickel-substituted azurin exists, but it is not blue.',
        Zn: 'Zinc-substituted azurin exists too, and it is colorless.',
      } },
    }],
    note: 'His46, His117 and Cys112 make a strong trigonal plane. Met121 at 3.18 Å and the carbonyl of Gly45 at 2.84 Å cap it from either side. Those weak contacts tune the redox potential, so count them even though they are long.',
  },
  C3: {
    kind: 'site', site: 'sod', name: 'Superoxide dismutase', protein: 'Cu,Zn superoxide dismutase (SOD1), reduced', org: 'Human', metal: 'Cu',
    clue: 'This enzyme destroys superoxide. One metal does the chemistry and the other holds the site in shape. His63 normally bridges them.',
    stages: [{
      find: 'Start with the structural ion: three histidines and an aspartate.',
      notes: { 'A83.OD2': 'Oδ2 sits at 2.85 Å. Asp83 binds through Oδ1.' },
      soak: { answer: 'Zn', options: ['Zn', 'Cu', 'Mg'], why: {
        Cu: 'Close, but the chemistry happens next door. This one is the structural ion.',
        Mg: 'Three histidines are the wrong offer for magnesium.',
      } },
    }, {
      find: 'Now the catalytic ion. This is the reduced enzyme, so count which histidines truly reach it.',
      notes: { 'A63.NE2': 'His63 is 3.46 Å away. In this reduced form the bridge is open, and His63 stays bound only to the other metal.' },
      soak: { answer: 'Cu', options: ['Cu', 'Zn', 'Fe'], why: {
        Zn: 'A Zn-Zn form does exist, and it is stable, but it cannot destroy superoxide.',
        Fe: 'Iron superoxide dismutases exist, with a different site. This one is Cu,Zn SOD.',
      } },
    }],
    note: 'In the oxidized enzyme His63 bridges the two metals. Here, in the reduced enzyme, the bridge has opened and the copper keeps three histidines. Mutations in this protein cause some inherited ALS through a toxic gain of function linked to misfolding. Some hypotheses involve missing or wrong metals.',
  },
  C4: {
    kind: 'site', site: 'hemocyanin', name: 'Hemocyanin', protein: 'Oxygenated hemocyanin', org: 'Horseshoe crab', metal: 'Cu',
    clue: 'Horseshoe crabs carry oxygen without heme. Their blood turns blue when oxygenated. Here O_2 sits between two ions 3.6 Å apart.',
    stages: [{
      find: 'O_2 is already bound. Find the three histidines on the first ion.',
      soak: { answer: 'Cu', options: ['Cu', 'Fe', 'Zn'], why: {
        Fe: 'Iron carries oxygen in heme or in hemerythrin. Neither is here, and those are not blue.',
        Zn: 'Zinc cannot hand electrons to oxygen.',
      } },
    }, {
      find: 'Now the three histidines on the second ion.',
      auto: true,
      ask: {
        q: 'Both oxygen atoms sit about 2 Å from both metals. How does O_2 bind?',
        options: [
          { label: 'Side-on to both', ok: true },
          { label: 'End-on to one', why: 'Then only one oxygen would touch one metal.' },
        ],
      },
    }],
    note: 'O_2 lies side-on between the coppers and is reduced to peroxide: the O–O distance here is 1.41 Å, against 1.21 Å in free O_2. Each copper gives up an electron, going from Cu^+ to Cu^2+. The blue comes from charge moving from the bound peroxide to the copper. This is a 2.4 Å structure, so treat the finer distances with care.',
  },
  C5: {
    kind: 'site', site: 'urease', name: 'Urease', protein: 'Urease', org: 'Klebsiella aerogenes', metal: 'Ni',
    clue: 'Urease was the first enzyme ever crystallized, in 1926, and the first shown to need this metal, in 1975. Two ions sit 3.6 Å apart.',
    stages: [{
      find: 'Waters are already bound. Find three protein atoms on the first ion. One is on a modified lysine.',
      soak: { answer: 'Ni', options: ['Ni', 'Zn', 'Fe', 'Co'], why: {
        Zn: 'A good guess for a dinuclear hydrolase, and related enzymes do use zinc. Urease is the famous exception.',
        Fe: 'Related enzymes can use iron, but this is the classic case of a different metal.',
        Co: 'Close in the periodic table, but not this one.',
      } },
    }, {
      find: 'Second ion: find four protein atoms. The same lysine returns with its other oxygen.',
      auto: true,
    }],
    note: 'Lys217 is carbamylated: CO_2 adds to its side chain, which gives it a carboxylate that bridges both ions. The gene just says lysine, so the sequence alone would never show this.',
  },
  C6: {
    kind: 'arcade', game: 'keep', name: 'Keep copper out', metal: 'Cu',
    clue: 'The Irving–Williams series ranks how tightly divalent metals bind: Mn < Fe < Co < Ni < Cu > Zn. So a protein cannot pick its metal by affinity alone.',
    note: 'Cells solve this by controlling where and when a protein folds, and by holding copper on chaperones. A protein left to chance would fill with copper.',
  },

  D1: {
    kind: 'site', site: 'calmodulin', name: 'Calmodulin', protein: 'Calmodulin', org: 'Paramecium tetraurelia', metal: 'Ca',
    clue: 'Calcium signals run through this protein. Each EF-hand loop grips one large ion that wants as many oxygens as it can get.',
    stages: [{
      find: 'Seven oxygens. One is a water, one is a backbone carbonyl, and one glutamate gives both of its oxygens.',
      notes: { 'A26.OG1': 'Thr26 binds through its backbone carbonyl, not its side chain.' },
      soak: { answer: 'Ca', options: ['Ca', 'Mg', 'Zn'], why: {
        Mg: 'Magnesium is smaller and wants six ligands at 2.1 Å. It cannot fill seven positions at 2.4 Å. The difference between these two ions is what makes this a calcium switch.',
        Zn: 'Zinc wants four tight ligands, often with nitrogen or sulfur. This cage is all oxygen and too wide.',
      } },
    }],
    note: 'An EF-hand loop is 12 residues long. Asp20, Asp22, Asp24 and the carbonyl of Thr26 line it, a water fills a gap, and Glu31 closes it with both oxygens. Seven ligands make a pentagonal bipyramid, the usual shape for calcium.',
  },
  D2: {
    kind: 'site', site: 'kcsa', name: 'KcsA channel', protein: 'KcsA selectivity filter', org: 'Streptomyces lividans', metal: 'K',
    clue: 'This channel passes potassium near the diffusion limit and rejects the smaller sodium ion. Four identical subunits line the pore with backbone carbonyls.',
    stages: [{
      find: 'Two rings of four oxygens cage this ion. Tap one oxygen in each ring.',
      soak: { answer: 'K', options: ['K', 'Na', 'Ca'], why: {
        Na: 'Na^+ wants oxygen at about 2.4 Å. Crowded, flexible carbonyls hold it less well than K^+, so it does not repay what it loses when it sheds its water.',
        Ca: 'Calcium has twice the charge, and this filter is built for one.',
      } },
    }],
    note: 'Eight oxygens form a square antiprism, the same shape eight waters take around K^+ in the central cavity of this channel. The ion swaps water for carbonyls at almost no cost. That is half of selectivity. The other half is the crowded carbonyls themselves, which favor K^+ even as the filter flexes.',
  },
  D3: {
    kind: 'site', site: 'polb', name: 'DNA polymerase β', protein: 'DNA polymerase β with a nonreactive nucleotide', org: 'Human', metal: 'Mg',
    clue: 'DNA polymerases use two ions 3.4 Å apart, held by acidic residues. One carries the incoming nucleotide. The other readies the end of the growing strand.',
    stages: [{
      find: 'Two phosphate oxygens are already bound. Find four more: two aspartates, one more phosphate oxygen and a water.',
      soak: { answer: 'Mg', options: ['Mg', 'Ca', 'Zn'], why: {
        Ca: 'Calcium binds DNA polymerases but stalls them. Its bonds are too long for this tight site.',
        Zn: 'Zinc prefers fewer ligands, often nitrogen or sulfur. Six oxygens at 2.1 Å point elsewhere.',
      } },
    }, {
      find: 'The catalytic ion. A shared phosphate oxygen and a water are bound. Find the other four, including the 3′ oxygen of the primer.',
      auto: true,
    }],
    note: 'This is the two-metal-ion mechanism. The nucleotide analog here cannot react, which freezes the moment just before chemistry. The primer 3′ oxygen sits 2.19 Å from the catalytic ion, right where it is activated to attack the phosphate.',
  },
  D4: {
    kind: 'site', site: 'mcm', name: 'Methylmalonyl-CoA mutase', protein: 'Methylmalonyl-CoA mutase with cob(II)alamin', org: 'Propionibacterium freudenreichii', metal: 'Co',
    clue: 'The ring here is a corrin, the heart of vitamin B_12. It resembles a porphyrin with one bridge missing. In the intact coenzyme a cobalt-carbon bond holds an adenosyl group, and that bond is built to break. In this structure it has already gone.',
    stages: [{
      find: 'The corrin gives four nitrogens. Find the ligand from below.',
      notes: { 'A608.OD1': 'Asp608 hydrogen-bonds His610 from the second shell.' },
      soak: { answer: 'Co', options: ['Co', 'Fe', 'Ni'], why: {
        Fe: 'Iron goes in porphyrin. A corrin means B_12.',
        Ni: 'Nickel has its own tetrapyrrole, F430, in methane-making microbes. A corrin means B_12.',
      } },
    }],
    note: 'Free B_12 uses its own dimethylbenzimidazole tail as this lower ligand. In the enzyme the tail swings away and His610 takes its place, a form called base-off, His-on. Dorothy Hodgkin solved the structure of B_12 by X-ray crystallography, work recognized with the 1964 Nobel Prize in Chemistry.',
  },
  D5: {
    kind: 'site', site: 'psii', name: 'Photosystem II', protein: 'Photosystem II, oxygen-evolving center', org: 'Thermosynechococcus vulcanus', metal: 'Mn', cluster: true,
    clue: 'Nearly all the oxygen you breathe was made at this cluster. It pulls electrons out of water using light. This 1.9 Å structure first located every metal, oxo bridge and bound water of the cluster.',
    stages: [{
      find: 'Find seven protein ligands. Most carboxylates bridge two metals, so one tap binds both oxygens.',
      ask: {
        q: 'How are the metals arranged?',
        options: [
          { label: 'A distorted cube with one dangling ion', ok: true },
          { label: 'A flat ring of five', why: 'Turn it. Four metals and the oxo bridges make a cube-like block, and the fifth hangs off.' },
          { label: 'A perfect cube', why: 'A perfect cube has no dangling corner, and the bonds here are clearly unequal.' },
        ],
      },
      soak: { answer: 'Ca', options: ['Ca', 'Mg', 'Fe'], prompt: 'Four of these metals are manganese. Which ion sits in the fifth position?', why: {
        Mg: 'Too small. This corner has bonds near 2.4 Å.',
        Fe: 'Iron is not found here. This corner has longer bonds and takes two waters.',
      } },
    }],
    note: 'Mn_4CaO_5 is often called a distorted chair: a Mn_3CaO_4 cubane with a fourth manganese attached. Four waters bind, two on Mn4 and two on Ca. The cluster stores four oxidizing equivalents, then makes one O_2 from two waters.',
  },
  D6: {
    kind: 'site', site: 'nitrogenase', name: 'Nitrogenase', protein: 'Nitrogenase MoFe protein', org: 'Azotobacter vinelandii', metal: 'Mo', tint: '#ffb070', cluster: true,
    clue: 'Soil bacteria split N_2, one of the strongest bonds in chemistry, at room temperature. They do it at the most complex metal cofactor known.',
    stages: [{
      find: 'The cofactor is in place. Find what holds its two ends: a cysteine, a histidine and two homocitrate oxygens.',
      ask: {
        q: 'A light atom sits in the very middle, 2.0 Å from six irons. What is it?',
        options: [
          { label: 'Carbon', ok: true },
          { label: 'Nitrogen', why: 'This was the leading idea for years, since the enzyme makes ammonia. A 1.0 Å map and spectroscopy ruled it out.' },
          { label: 'Oxygen', why: 'Its electron count does not match the density at the center.' },
        ],
      },
      soak: { answer: 'Mo', options: ['Mo', 'V', 'Fe'], prompt: 'Seven corners are iron. Which metal caps the far end?', why: {
        V: 'Some nitrogenases do use vanadium, but this one is the molybdenum enzyme.',
        Fe: 'Iron-only nitrogenases exist as well. The density at this corner is too strong for iron.',
      } },
    }],
    note: 'FeMo-cofactor holds seven irons, nine sulfurs, one molybdenum and a central carbon. That carbon was only proved in 2011, with this structure and spectroscopy, nearly twenty years after the cluster was first seen. How N_2 binds to it is still being worked out.',
  },
};

export const WELL_IDS = Object.keys(WELLS);

// Hard, borderline and soft ions for the sorting round.
export const SORT_IONS = [
  ['Mg^2+', 'O'], ['Ca^2+', 'O'], ['Na^+', 'O'], ['K^+', 'O'], ['Mn^2+', 'O'], ['Fe^3+', 'O'],
  ['Fe^2+', 'N'], ['Co^2+', 'N'], ['Ni^2+', 'N'], ['Cu^2+', 'N'], ['Zn^2+', 'N'],
  ['Cu^+', 'S'], ['Ag^+', 'S'], ['Au^+', 'S'], ['Cd^2+', 'S'], ['Hg^2+', 'S'],
];

// K-edge energies in keV.
export const EDGES = { Mn: 6.539, Fe: 7.112, Co: 7.709, Ni: 8.333, Cu: 8.979, Zn: 9.659 };

// Rounds of the mismetalation game. block: ions that bind tighter than the target.
export const KEEP_ROUNDS = [
  { target: 'Zn', block: ['Cu'], pass: ['Mn', 'Fe'] },
  { target: 'Fe', block: ['Cu', 'Ni', 'Zn'], pass: ['Mn'] },
  { target: 'Mn', block: ['Fe', 'Co', 'Ni', 'Cu', 'Zn'], pass: [] },
];
