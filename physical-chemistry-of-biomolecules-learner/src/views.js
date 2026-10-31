// The twelve views. Each one is a landscape, the controls that reshape it, and a goal.
import * as C from './chem.js';

const INK = { white: '#f6efdc', red: '#e0452b', gold: '#f0bf3f', jade: '#6fd0b4', rose: '#f08a8a' };
const pct = (x) => `${(x * 100).toFixed(x > 0.995 || x < 0.005 ? 1 : 0)}%`;
const celsius = (T) => `${Math.round(T - 273.15)}°C`.replace('-', '−');

const two = (a, b, extra = {}) => ({
  wells: [{ x: -0.42, y: 0.52, G: 0, k: 14, name: a }, { x: 0.46, y: -0.5, G: 1, k: 14, name: b }],
  links: [{ a: 0, b: 1, nu: 2.5, bump: 2 }],
  colors: [INK.white, INK.red],
  ...extra,
});

export const VIEWS = [
  {
    id: 'boltzmann',
    title: 'Two shapes of proline',
    lede: 'Every lantern is one proline in a protein chain. The peptide bond in front of it can be trans, in the deep valley, or cis, 1.3 kcal/mol higher. Heat lets molecules climb.',
    goal: 'Drag the sun until 90 of every 100 molecules sit in the deep valley, and hold it there.',
    ...two('trans', 'cis'),
    scale: 2.2,
    controls: [{ kind: 'sun', key: 'T', min: 40, max: 1600, log: true, start: 1200, fmt: (T) => `${Math.round(T)} K` }],
    heat: (T) => Math.log(T / 40) / Math.log(40),
    tick(c, w) { w.T = c.T; w.wells[1].G = 1.3; },
    stages: [{ band: [0.885, 0.915], secs: 3 }],
    par: 14,
    read: (p, c) => `trans ${pct(p[0])}, cis ${pct(p[1])}`,
    note: {
      formula: '<i>p</i><sub>2</sub> / <i>p</i><sub>1</sub> = e<sup>−Δ<i>G</i> / <i>RT</i></sup>',
      text: 'Exactly 90% falls near 298 K, which is about 25 °C. That is a realistic ratio: in unfolded chains about one proline in ten is cis, more with some neighbours. Temperature sets how much a gap in energy matters.',
    },
  },
  {
    id: 'tenfold',
    title: 'Worth a factor of ten',
    lede: 'At room temperature, free energy gaps turn into population ratios by one simple rule. Find it by guessing.',
    goal: 'Before each release, drag the marker to where you think the molecules will settle.',
    ...two('deep valley', 'shallow valley'),
    scale: 2.2,
    wager: [
      { gap: 1.36, say: 'The gap is 1.36 kcal/mol at 25 °C.' },
      { gap: 2.73, say: 'Now double the gap: 2.73 kcal/mol.' },
      { gap: 0.68, say: 'Half the first gap: 0.68 kcal/mol.' },
    ],
    tick(c, w, env) { w.T = 298; w.wells[1].G = env.round.gap; },
    truth: (r) => C.populations([0, r.gap], 298)[0],
    read: (p) => `deep valley ${pct(p[0])}`,
    note: {
      formula: 'gap = 1.36 log<sub>10</sub> (<i>p</i><sub>deep</sub> / <i>p</i><sub>shallow</sub>) kcal/mol at 25 °C',
      text: 'Each 1.36 kcal/mol multiplies the ratio by ten, and half of that multiplies it by about three. One hydrogen bond more or less can change a population this much.',
    },
  },
  {
    id: 'melting',
    title: 'The melting point',
    lede: 'The narrow valley is a folded protein: strong bonds, few shapes. The wide valley is the unfolded chain: weak bonds, countless shapes. Heat rewards the wide one, so the land itself moves as you change the sun.',
    goal: 'Find the temperature where half the molecules are folded, and hold it. The edge is sharp.',
    wells: [{ x: -0.42, y: 0.52, G: 0, k: 30, name: 'folded' }, { x: 0.46, y: -0.5, G: 0, k: 7, name: 'unfolded' }],
    links: [{ a: 0, b: 1, nu: 3, bump: 1.5 }],
    colors: [INK.white, INK.red],
    scale: 4,
    controls: [{ kind: 'sun', key: 'T', min: 300, max: 368, start: 305, fmt: celsius, step: 0.25 }],
    heat: (T) => (T - 290) / 85,
    tick(c, w) { w.T = c.T; w.wells[0].G = -C.stability(c.T, 60, 60 / 0.175); },
    stages: [{ band: [0.44, 0.56], secs: 3 }],
    par: 14,
    read: (p, c) => `folded ${pct(p[0])}, Δ<i>G</i> ${C.stability(c.T, 60, 60 / 0.175).toFixed(1)} kcal/mol`,
    note: {
      formula: 'Δ<i>G</i> = Δ<i>H</i> − <i>T</i>Δ<i>S</i> = 0 at <i>T</i><sub>m</sub> = Δ<i>H</i> / Δ<i>S</i>',
      text: 'With Δ<i>H</i> = 60 kcal/mol and Δ<i>S</i> = 0.175 kcal/mol/K, typical sizes for a small protein, Tm is 343 K. Two big numbers almost cancel, so about 15 degrees take the population from nine-tenths folded to nine-tenths unfolded. That sharpness is cooperativity.',
    },
  },
  {
    id: 'cold',
    title: 'Cold also unfolds',
    lede: 'Water holds oily side chains differently when it is cold. Because unfolding raises the heat capacity, this protein has a best temperature, and it falls apart on both sides of it.',
    goal: 'First find where it melts when hot. Then cool it past freezing and find where it melts again.',
    wells: [{ x: -0.42, y: 0.52, G: 0, k: 30, name: 'folded' }, { x: 0.46, y: -0.5, G: 0, k: 7, name: 'unfolded' }],
    links: [{ a: 0, b: 1, nu: 3, bump: 1.5 }],
    colors: [INK.white, INK.red],
    scale: 4,
    controls: [{ kind: 'sun', key: 'T', min: 250, max: 350, start: 298, fmt: celsius, step: 0.25 }],
    heat: (T) => (T - 245) / 115,
    tick(c, w) { w.T = c.T; w.wells[0].G = -C.stability(c.T, 60, 330, 1.8); },
    stages: [
      { band: [0.42, 0.58], secs: 2.5, side: (T) => T > 300, say: 'Hot side: find the half-way point.' },
      { band: [0.42, 0.58], secs: 2.5, side: (T) => T < 298, say: 'Now the cold side.' },
    ],
    par: 26,
    read: (p, c) => `folded ${pct(p[0])}, Δ<i>G</i> ${C.stability(c.T, 60, 330, 1.8).toFixed(1)} kcal/mol`,
    note: {
      formula: 'Δ<i>G</i>(<i>T</i>) = Δ<i>H</i><sub>m</sub>(1 − <i>T</i>/<i>T</i><sub>m</sub>) + Δ<i>C</i><sub>p</sub>[<i>T</i> − <i>T</i><sub>m</sub> − <i>T</i> ln(<i>T</i>/<i>T</i><sub>m</sub>)]',
      text: 'Stability is a curve with a top, here near 25 °C, not a line. With Δ<i>C</i><sub>p</sub> = 1.8 kcal/mol/K the cold melting point is close to −5 °C, so many real proteins would need supercooled water to show it.',
    },
  },
  {
    id: 'salt',
    title: 'Salt hides charge',
    lede: 'Two patches of opposite charge hold this pair of proteins together. Ions crowd around charges and screen them, so the attraction fades over a distance that shrinks as salt rises.',
    goal: 'Pour in salt until half the pairs are bound, and hold it.',
    ...two('bound', 'apart'),
    scale: 2.2,
    controls: [{ kind: 'slider', key: 'I', label: 'Salt', min: 0.001, max: 1, log: true, start: 0.005, fmt: (I) => (I < 1 ? `${Math.round(I * 1000)} mM` : '1 M') }],
    tick(c, w) { w.T = 298; w.wells[0].G = 2.19 + C.coulomb(3, -3, 7, 80, c.I); w.wells[1].G = 0; },
    stages: [{ band: [0.45, 0.55], secs: 3 }],
    par: 12,
    read: (p, c) => `bound ${pct(p[0])}, screening length ${C.debye(c.I).toFixed(1)} Å`,
    note: {
      formula: 'λ<sub>D</sub> = 3.04 / √<i>I</i> Å, for <i>I</i> in mol/L',
      text: 'Half bound came near 150 mM, the salt level of your cells. There the screening length is about 8 Å, roughly the reach of a charged patch, so charge attraction is present but easily tuned. In this pair the numbers were chosen to land there.',
    },
  },
  {
    id: 'proton',
    title: 'A proton comes and goes',
    lede: 'Lanterns in the protonated valley hold a proton. Each histidine gives it up when the water around it has few protons to spare. Nearby charges change how tightly it holds on.',
    goal: 'Find the pH that makes each histidine half protonated. Watch what the neighbour does.',
    ...two('protonated', 'free'),
    scale: 2.2,
    controls: [{ kind: 'slider', key: 'pH', label: 'pH', min: 3, max: 10, start: 8.6, fmt: (x) => x.toFixed(1), step: 0.02 }],
    tick(c, w, env) { w.T = 298; w.wells[0].G = C.protonGap(c.pH, env.stage.pKa, 298); w.wells[1].G = 0; },
    stages: [
      { band: [0.43, 0.57], secs: 2.5, pKa: 6.0, say: 'A histidine on the open surface.' },
      { band: [0.43, 0.57], secs: 2.5, pKa: 7.3, say: 'The same residue beside a negative aspartate.' },
      { band: [0.87, 0.93], secs: 2.5, pKa: 7.3, say: 'Same residue: make it 90% protonated.' },
    ],
    par: 26,
    read: (p, c) => `protonated ${pct(p[0])}, pH ${c.pH.toFixed(1)}`,
    note: {
      formula: 'pH = p<i>K</i><sub>a</sub> + log<sub>10</sub>([base] / [acid])',
      text: 'Half protonated means pH equals pKa, and one pH unit below it means ten to one. The aspartate raised the pKa by 1.3, worth 1.8 kcal/mol. Enzymes use such shifts to tune a catalytic residue.',
    },
  },
  {
    id: 'binding',
    title: 'Half bound',
    lede: 'A drug and its receptor. More drug in solution makes the bound valley deeper, even though the bond itself never changes.',
    goal: 'Set the drug level to reach each occupancy. This receptor has Kd = 100 nM.',
    ...two('bound', 'free'),
    scale: 2.2,
    controls: [{ kind: 'slider', key: 'L', label: 'Drug', min: 1e-9, max: 1e-4, log: true, start: 3e-9, fmt: (x) => (x < 1e-6 ? `${Number((x * 1e9).toPrecision(2))} nM` : `${Number((x * 1e6).toPrecision(2))} µM`) }],
    tick(c, w) { w.T = 298; w.wells[0].G = C.RT(298) * Math.log(1e-7 / c.L); w.wells[1].G = 0; },
    stages: [
      { band: [0.46, 0.54], secs: 2.5, say: 'Half of the receptors bound.' },
      { band: [0.875, 0.925], secs: 2.5, say: 'Now 90%.' },
      { band: [0.985, 0.995], secs: 2.5, say: 'Now 99%.' },
    ],
    par: 24,
    read: (p, c) => `bound ${pct(p[0])}, [drug] / Kd = ${Number((c.L / 1e-7).toPrecision(2))}`,
    note: {
      formula: 'θ = [L] / ([L] + <i>K</i><sub>d</sub>), Δ<i>G</i>° = <i>RT</i> ln <i>K</i><sub>d</sub>',
      text: 'Half at Kd, 90% at 9 times Kd, 99% at 99 times Kd. Going from 90% to 99% costs eleven times the drug. That is why doses rise fast for small gains, and side effects rise with them.',
    },
  },
  {
    id: 'bohr',
    title: 'Thin air',
    lede: 'You are climbing, and the air in your lungs carries only 60 torr of oxygen. Each haemoglobin holds 0 to 4 oxygens, shown as five valleys. Working muscle makes the blood slightly acidic, and acid loosens the grip.',
    goal: 'Hold the acid button in the muscle, release it in the lungs. Deliver as much oxygen as you can in 5 breaths.',
    wells: [
      { x: -0.8, y: 0.62, G: 0 }, { x: -0.42, y: 0.1, G: 0 }, { x: 0.02, y: -0.28, G: 0 }, { x: 0.46, y: -0.52, G: 0 }, { x: 0.92, y: -0.66, G: 0 },
    ],
    links: [0, 1, 2, 3].map((i) => ({ a: i, b: i + 1, nu: 14, bump: 0.6 })),
    hop: 9,
    colors: ['#7aa0d8', '#a58ac8', '#d874a0', '#e45a4e', INK.red],
    scale: 3,
    controls: [{ kind: 'press', key: 'acid', label: 'Hold for acid' }],
    time: 36,
    cycle: { lungs: 60, muscle: 30, half: 3.5 },
    tick(c, w, env) {
      w.T = 310;
      const { cycle } = this;
      const inLungs = Math.floor(env.t / cycle.half) % 2 === 0;
      env.place = inLungs ? 'Lungs: load up' : 'Muscle: let it go';
      const p = inLungs ? cycle.lungs : cycle.muscle;
      const pH = c.acid ? 7.2 : 7.4;
      C.hbStates(p, pH).forEach((x, i) => { w.wells[i].G = -C.RT(310) * Math.log(x + 1e-6); });
      const y = env.pops.reduce((s, x, i) => s + (x * i) / 4, 0);
      const ph = Math.floor(env.t / cycle.half);
      if (ph !== env.phase) {
        if (env.phase !== undefined) {
          if (ph % 2 === 1) env.top = y;
          else if (env.top !== undefined) { env.total = (env.total ?? 0) + Math.max(0, env.top - y); env.breaths = (env.breaths ?? 0) + 1; }
        }
        env.phase = ph;
      }
      env.score = (env.total ?? 0) / Math.max(1, env.breaths ?? 1);
      env.y = y;
    },
    done: (env) => (env.breaths ?? 0) >= 5,
    grade: (env) => (env.score >= 0.385 ? 3 : env.score >= 0.33 ? 2 : 1),
    race: (env) => `${env.place ?? ''}, delivered per trip ${pct(env.score ?? 0)}`,
    read: (p, c, w, env) => `oxygen on board ${pct(env.y ?? 0)}`,
    note: {
      formula: '<i>Y</i> ≈ <i>p</i><sup><i>n</i></sup> / (<i>P</i><sub>50</sub><sup><i>n</i></sup> + <i>p</i><sup><i>n</i></sup>), <i>n</i> ≈ 2.8',
      text: 'Binding one oxygen makes the next easier, so haemoglobin swings from mostly full to half empty over a small pressure drop. Myoglobin, with one site, would give up less than a tenth over the same range. The Bohr effect adds the rest: 0.2 pH units moves P50 by a quarter.',
    },
  },
  {
    id: 'optimum',
    title: 'Too hot to work',
    lede: 'Lanterns are substrate crossing a real barrier of 14 kcal/mol. Warmth speeds them, about double for 10 degrees. But the enzyme making the crossing unfolds faster still, and it never comes back.',
    goal: 'Convert as much substrate as you can in 20 seconds. Watch the enzyme that remains.',
    ...two('substrate', 'product'),
    links: [{ a: 0, b: 1, kf: 0, kb: 0, Gts: 14 }],
    scale: 3,
    controls: [{ kind: 'sun', key: 'T', min: 280, max: 345, start: 300, fmt: celsius, step: 0.5 }],
    heat: (T) => (T - 275) / 80,
    time: 20,
    start: [1, 0],
    tick(c, w, env, dt) {
      w.T = c.T;
      w.wells[1].G = -3;
      env.alive = (env.alive ?? 1) * Math.exp(-RATES.kill(c.T) * dt);
      w.links[0].kf = RATES.turn(c.T) * env.alive;
      w.links[0].kb = 0;
      env.score = env.pops[1];
    },
    grade: (env) => (env.score >= 0.93 ? 3 : env.score >= 0.86 ? 2 : 1),
    race: (env) => `enzyme still working ${pct(env.alive ?? 1)}`,
    read: (p) => `product ${pct(p[1])}`,
    note: {
      formula: '<i>k</i> = <i>A</i> e<sup>−<i>E</i><sub>a</sub> / <i>RT</i></sup>',
      text: 'Chemistry here has Ea = 14 kcal/mol, unfolding has about 90. A larger Ea means a steeper rise with heat, so above a certain point the enzyme is lost faster than heat can speed up its work. The best temperature depends on how long you need it to last.',
    },
  },
  {
    id: 'trap',
    title: 'The trap in a deep valley',
    lede: 'Substrate falls into the enzyme, climbs a pass to become product, and leaves. It seems the enzyme should grip substrate as hard as it can. Try it.',
    goal: 'Drag the seal on the middle valley. Make 6000 products in 20 seconds.',
    wells: [{ x: -0.72, y: 0.6, G: 0, name: 'free' }, { x: -0.02, y: 0.02, G: -6, name: 'enzyme with substrate' }, { x: 0.72, y: -0.62, G: -2, name: 'product' }],
    links: [
      { a: 0, b: 1, kf: 3, kb: 3, bump: 1 },
      { a: 1, b: 2, Gts: 8, nu: 3.5 * Math.exp(8 / C.RT(298)) },
      { a: 2, b: 0, kf: 1.5, kb: 0, bump: 0 },
    ],
    colors: [INK.white, INK.gold, INK.red],
    scale: 3.5,
    controls: [{ kind: 'handle', key: 'ES', well: 1, min: -7, max: 3, start: -6.5 }],
    time: 20,
    start: [1, 0, 0],
    tick(c, w, env) {
      w.T = 298;
      w.wells[1].G = c.ES;
      // Weak binding raises the off rate, not the on rate. Chemistry runs at 3.5 per second from a level valley.
      w.links[0].kb = 3 * Math.exp(c.ES / C.RT(298));
      env.score = env.turns ?? 0;
    },
    onCross(env, from, to) { if (from === 1 && to === 2) env.turns = (env.turns ?? 0) + 1; if (from === 2 && to === 1) env.turns = (env.turns ?? 0) - 1; },
    done: (env) => (env.turns ?? 0) >= 6000,
    grade: (env) => (env.turns >= 6000 && env.t < 18 ? 3 : env.turns >= 6000 ? 2 : 1),
    race: (env) => `${Math.max(0, env.turns ?? 0)} products`,
    read: (p, c) => `barrier from the middle valley ${(8 - c.ES).toFixed(1)} kcal/mol`,
    note: {
      formula: '<i>v</i> = <i>k</i><sub>cat</sub>[E][S] / (<i>K</i><sub>M</sub> + [S])',
      text: 'Too deep and molecules sit idle, because the pass stays where it was and the climb grows. Once the valley is level with the free state, making it shallower gains nothing, because the climb shrinks as fast as occupancy falls. A tight grip on substrate never helps. Only lowering the pass does, which is why enzymes bind the transition state harder than the substrate.',
    },
  },
  {
    id: 'single',
    title: 'One molecule in the dark',
    lede: 'Single-molecule experiments follow one protein at a time. It never settles. It jumps at random, and the strip records where it was.',
    goal: 'Watch the strip, then drag the marker to the share of time it would spend in the first valley over a long watch.',
    ...two('first valley', 'second valley'),
    links: [{ a: 0, b: 1, nu: 1.1, bump: 2 }],
    scale: 2.2,
    night: true,
    wager: [
      { gap: 0.55, watch: 14, say: 'Watch it for a while.' },
      { gap: 1.1, watch: 14, say: 'Another molecule, a bigger gap.' },
    ],
    tick(c, w, env) { w.T = 298; w.wells[1].G = env.round.gap; },
    truth: (r) => C.populations([0, r.gap], 298)[0],
    read: (p) => '',
    note: {
      formula: 'time average = ensemble average',
      text: 'One molecule followed for long enough spends its time in the same shares that a crowd shows at one instant. Every population in this game is really this: many lonely random jumps.',
    },
  },
  {
    id: 'life',
    title: 'Away from balance',
    lede: 'In most views so far, paths were balanced at equilibrium: as many molecules go forward as back, and the strings fall like rain. Life is not balanced. ATP breaks the tie, and pushes molecules round a cycle.',
    goal: 'Keep tapping ATP. Drive 4000 trips round the cycle in 30 seconds and listen.',
    wells: [{ x: -0.62, y: 0.52, G: 0, name: 'A' }, { x: 0.68, y: 0.3, G: 3, name: 'B' }, { x: -0.02, y: -0.62, G: 1.5, name: 'C' }],
    links: [{ a: 0, b: 1, nu: 3, bump: 1.5 }, { a: 1, b: 2, nu: 3, bump: 1 }, { a: 2, b: 0, nu: 3, bump: 1 }],
    colors: [INK.white, INK.red, INK.gold],
    scale: 3,
    controls: [{ kind: 'tap', key: 'atp', label: 'ATP' }],
    time: 30,
    tick(c, w, env, dt) {
      w.T = 310;
      c.atp *= Math.exp(-dt / 1.3);
      w.links[0].drive = c.atp * 6.5;
      env.score = env.net ?? 0;
    },
    onCross(env, from, to, link, sound) {
      if (link !== 2) return true;
      env.net = (env.net ?? 0) + (from === 2 ? 1 : -1);
      if (from === 2) sound.tune();
      return false;
    },
    done: (env) => (env.net ?? 0) >= 4000,
    grade: (env) => (env.net >= 4000 && env.t < 16 ? 3 : env.net >= 4000 ? 2 : 1),
    race: (env) => `${Math.max(0, env.net ?? 0)} trips round the cycle`,
    read: () => 'Without ATP, net flow is zero',
    note: {
      formula: 'Δ<i>G</i> = Δ<i>G</i>° + <i>RT</i> ln ([ADP][P<sub>i</sub>] / [ATP])',
      text: 'A cell keeps ATP far from equilibrium, so hydrolysing one gives about −12 kcal/mol, and it spends this to run cycles in one direction. That one-way flow is what ion pumps and motors are. When the drive stops, the tune stops, and the landscape returns to rain.',
    },
  },
];

// Rates for the enzyme race, per second of game time.
export const RATES = {
  turn: (T) => 0.09 * Math.exp((14 / C.R) * (1 / 310 - 1 / T)),
  kill: (T) => 0.2 * Math.exp((90 / C.R) * (1 / 325 - 1 / T)),
};
