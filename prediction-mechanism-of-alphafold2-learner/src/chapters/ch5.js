// Chapter 5. Real frames, a real comparison of chain moves against free moves, and eight blocks of the teaching update.
import * as THREE from 'three';
import { Flock, ribbonGeometry, STOCK, Threads } from '../world.js';
import { apply, IDENTITY, rotationAxisAngle, vec } from '../science/frames.js';
import { fape, rmsd } from '../science/metrics.js';
import { PoseGas } from '../science/pose.js';
import { ambient, fmt, frameBoard, theFamily } from './common.js';

const LIFT = 24;

export default {
  id: 'gas',
  title: 'Residue gas',
  tease: 'Every residue is a free paper triangle. Throw them all in the air, from one point, and watch a fold appear.',
  principle: 'Each residue is treated as a rigid triangle with a position and a rotation, called a frame. The frames float free, with no chain holding them, so any residue can be corrected without swinging the rest of the protein.',
  goals: ['Run the eight blocks.', 'Run them again with short reach.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>A frame</b> is T = (R, t). It takes local coordinates to global: x<sub>global</sub> = R x<sub>local</sub> + t. Built by Algorithm 21: t is the C-alpha position, the first axis points from C-alpha to C, N lies in the plane of the first two axes, and the third is their cross product. Composition is (R<sub>1</sub>R<sub>2</sub>, R<sub>1</sub>t<sub>2</sub> + t<sub>1</sub>).</p>
    <p><b>Single representation.</b> Algorithm 6, line 12, makes it by a linear projection of the first row of the MSA representation, from 256 to 384 channels. It is not that row itself.</p>
    <p><b>In AlphaFold2.</b> The structure module has 8 layers with shared weights, and all frames start at the identity: the "black hole" start (Supplement 1.8). Each layer runs invariant point attention, then updates T<sub>i</sub> ← T<sub>i</sub> ∘ ΔT<sub>i</sub>, with ΔT read from the single representation as a non-unit quaternion and a translation (Algorithm 23). Rotation gradients are stopped between layers during training. Side chains come from torsion angles and ideal geometry, as a separate step.</p>
    <p><b>The chain.</b> Peptide-bond geometry is not imposed. The network often breaks it during the module, which the paper says lets it refine locally "without solving complex loop closure problems". From the start of training, FAPE rewards neighbours landing in the right place relative to each other. A violation loss on bad bonds, weight 1.0, comes only in fine-tuning, because earlier it destabilised training and slightly lowered accuracy (Supplement 1.9, 1.9.11). Exact geometry comes only from Amber relaxation after prediction, which does not improve accuracy measured by GDT or lDDT-Cα.</p>
    <p><b>This game's update is a stand-in.</b> Here the pair table holds each pair's real relative pose, taken from 3CHY, which AlphaFold2 does not have. In each block every residue hears from every other where it should be, averages those proposals, moves 42% of the way, and composes the move in its own frame. The first block takes the full turn and 30% of the shift. Only this rule's outward form matches: the frames, the composition and the eight blocks. All the skill of the real module is left out. Its need for every residue to hear nearly every other is a property of this toy: the "no IPA" ablation has no attention or iteration in this module at all, and lost very little (Supplement 1.13.1, 1.13.3).</p>
    <p><b>Real shape, larger size.</b> Triangles keep their real N-Cα-C shape, drawn larger than life so that they can be seen.</p>
    <p class="small">Sources: Jumper et al., Nature 2021, main text and Supplement 1.8, 1.9.11, Algorithms 20, 21, 23.</p>`,

  setup(run) {
    run.state.f = theFamily();
  },
  stages: [frameOf, lever, hole, reach, check],
};

async function frameOf(run) {
  const { ui, world, sound } = run, { f } = run.state, che = f.che;
  const i = che.nums.indexOf(57), T = che.frames[i];
  const big = run.scoped(new Flock(world, 1, f.shape, { size: 9 }));
  big.paint(() => STOCK.good);
  const c = [0, 12, 0];
  // Show the residue flat on the table so its own axes read clearly.
  const R = IDENTITY().R;
  big.place(0, R, c); big.commit();
  frameBoard(run, 62, 58, { polar: 0.42, at: [4, 8, 2], seconds: 0 });
  const th = run.scoped(new Threads(world, 4, { width: 0.42, shadows: true }));
  const tip = (v, s) => [c[0] + v[0] * s, c[1] + v[1] * s, c[2] + v[2] * s];
  const loc = f.shape;
  const lab = (t, p) => { const l = run.scoped(ui.label(t, 'big')); run.tick(() => l.at(world.project(p))); return { dispose: () => l.remove() }; };
  ui.tags('real');
  ui.reads([]);
  run.scoped(lab('Cα', tip([0, 0, 0], 9)));
  run.scoped(lab('C', tip(loc.c, 9.6)));
  run.scoped(lab('N', tip(loc.n, 9.6)));
  await run.line(`This is residue D57 of real CheY, drawn large: its N, Cα and C atoms. These three atoms are rigid, a triangle that barely changes from residue to residue.`);
  ui.say('Tap to build its frame.');
  const add = async (label, v, color, text) => {
    await run.until((done) => { ui.ctrl(ui.button(label, () => { ui.ctrl(); done(); }, { id: 'next' })); });
    th.add(tip([0, 0, 0], 9), tip(v, 22), color, 0.5);
    sound.fold();
    ui.say(text);
  };
  await add('First axis', [1, 0, 0], '#0053d6', 'The first axis points from Cα to C.');
  await add('Second axis', [0, 1, 0], '#65cbf3', 'The second lies in the triangle\'s plane, on the side of N, at a right angle to the first.');
  await add('Third axis', [0, 0, 1], '#ff7d45', 'The third is the cross product of the first two, so it stands straight out of the paper.');
  await run.until((done) => { ui.ctrl(ui.button('Next', () => { ui.ctrl(); done(); }, { id: 'next' })); });
  await run.line('A cross product has a handedness, which will matter in chapter 7.');
  ui.tags('real', 'game');
  ui.reads([{ value: `(${T.t.map((v) => v.toFixed(1)).join(', ')})`, label: 'where it sits, t, in Å' }, { value: T.R.slice(0, 3).map((v) => v.toFixed(2)).join(' '), label: 'first row of its rotation, R' }]);
  await run.line('A <b>frame</b> is where the residue sits and which way it is turned. Six numbers, in effect, and the three backbone atoms follow from them. So does the direction of the side chain.');
}

async function lever(run) {
  const { ui, world, sound } = run, { f } = run.state, che = f.che, n = che.ca.length;
  const flock = run.scoped(new Flock(world, n, f.shape, { size: 1.8 }));
  flock.paint(() => STOCK.good);
  const mean = [0, 0, 0];
  for (const p of che.ca) { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; }
  const group = new THREE.Matrix4().makeRotationX(0.25).multiply(new THREE.Matrix4().makeTranslation(-mean[0], -mean[1] + 20, -mean[2]));
  const k = 48;
  const draw = (T) => { T.forEach((t, i) => flock.place(i, t.R, t.t, group)); flock.commit(); };
  draw(che.frames);
  frameBoard(run, 56, 60, { polar: 0.2, at: [0, 16, 0], seconds: 0 });
  world.shadowSpan(70);
  run.scoped({ dispose: () => world.shadowSpan(80) });
  ui.tags('real', 'game');
  ui.reads([]);
  await run.line('Why float free? Here is a job. One residue in the middle of the chain sits a little out of place. Fix it.');
  // Chain move: turn one backbone bond. Everything after it swings as one rigid piece.
  const axis = vec.unit(vec.sub(che.ca[k], che.n[k])), pivot = che.ca[k];
  const moved = (ang) => {
    const R = rotationAxisAngle(axis, ang);
    return che.frames.map((T, i) => {
      if (i < k) return T;
      const p = vec.sub(T.t, pivot), q = [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
      const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) for (let c = 0; c < 3; c += 1) M[a * 3 + b] += R[a * 3 + c] * T.R[c * 3 + b];
      return { R: M, t: vec.add(q, pivot) };
    });
  };
  const report = (fr, kind) => {
    const pts = fr.map((T) => T.t);
    let far = 0, cnt = 0;
    pts.forEach((p, i) => { const d = vec.dist(p, che.ca[i]); far = Math.max(far, d); if (d > 0.25) cnt += 1; });
    ui.reads([{ value: `${cnt}`, label: 'residues moved' }, { value: `${fmt(far, 1)} Å`, label: 'furthest one travelled' }]);
    run.state[kind] = { cnt, far };
  };
  ui.say('First work the way a chain works: turn one backbone torsion at residue 50.');
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const s = ui.slider({ label: 'Torsion angle', min: -12, max: 12, step: 0.5, value: 0, format: (v) => `${v.toFixed(1)}°`, onInput: (v) => { const fr = moved((v * Math.PI) / 180); draw(fr); report(fr, 'chain'); sound.rustle(1, 0.02); if (Math.abs(v) >= 4) nxt.disabled = false; } });
    ui.ctrl(s, nxt);
  });
  ui.ctrl();
  await run.line('A few degrees near the middle swings the whole far end of the protein, like a long lever. Fixing one place breaks another.');
  draw(che.frames);
  ui.reads([]);
  ui.say('Now as a gas: move just that one frame.');
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const s = ui.slider({ label: 'Move frame', min: -4, max: 4, step: 0.1, value: 0, format: (v) => `${v.toFixed(1)} Å`, onInput: (v) => { const fr = che.frames.map((T, i) => (i === k ? { R: T.R, t: vec.add(T.t, [v, 0, 0]) } : T)); draw(fr); report(fr, 'gas'); sound.rustle(1, 0.02); if (Math.abs(v) >= 1) nxt.disabled = false; } });
    ui.ctrl(s, nxt);
  });
  ui.ctrl();
  await run.line('One residue moved, and nothing else. The price is a stretched bond to its neighbours, which can be mended later.');
  ui.tags('paper');
  await run.line('This is the <b>residue gas</b>. AlphaFold2 drops the chain and treats residues as free triangles while it works. It mostly learns the bonds from its losses, and a final clean-up makes them exact.');
}

// Runs eight blocks, animating the flock from each block's frames to the next.
async function eight(run, { flock, shape, group, th, ca, frames, reach, read }) {
  const { world, sound } = run;
  const g = new PoseGas(frames), n = frames.length;
  const lerpQ = frames.map(() => new THREE.Quaternion());
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), m = new THREE.Matrix4();
  const toQ = (R, q) => q.setFromRotationMatrix(m.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1));
  const start = fape(g.frames, g.points(), frames, ca);
  const measure = () => {
    const f = fape(g.frames, g.points(), frames, ca);
    let gap = 0;
    for (let i = 0; i + 1 < n; i += 1) gap += vec.dist(apply(g.frames[i], shape.c), apply(g.frames[i + 1], shape.n));
    return { f, gap: gap / (n - 1), r: rmsd(g.points(), ca) };
  };
  const out = [];
  const show = (T0, T1, e, jitter) => {
    th.clear();
    const R = [0, 0, 0, 0, 0, 0, 0, 0, 0], pos = [];
    for (let i = 0; i < n; i += 1) {
      toQ(T0[i].R, qa); toQ(T1[i].R, qb);
      lerpQ[i].copy(qa).slerp(qb, e);
      m.makeRotationFromQuaternion(lerpQ[i]);
      const el = m.elements;
      R[0] = el[0]; R[1] = el[4]; R[2] = el[8]; R[3] = el[1]; R[4] = el[5]; R[5] = el[9]; R[6] = el[2]; R[7] = el[6]; R[8] = el[10];
      const w = jitter * Math.sin(Math.PI * e), t = [
        T0[i].t[0] + (T1[i].t[0] - T0[i].t[0]) * e + w * Math.sin(i * 1.7 + e * 9),
        T0[i].t[1] + (T1[i].t[1] - T0[i].t[1]) * e + w * Math.cos(i * 2.3 + e * 7),
        T0[i].t[2] + (T1[i].t[2] - T0[i].t[2]) * e + w * Math.sin(i * 3.1 + e * 5)];
      pos.push({ R: R.slice(), t });
      flock.place(i, R, t, group);
    }
    flock.commit();
    for (let i = 0; i + 1 < n; i += 1) th.add(apply(pos[i], shape.c), apply(pos[i + 1], shape.n), '#ff7d45', 0.16, group);
  };
  show(g.frames, g.frames, 0, 0);
  for (let b = 1; b <= 8; b += 1) {
    const T0 = g.frames;
    g.step({ reach });
    const T1 = g.frames, r = measure();
    out.push(r);
    sound.setOpening(Math.max(0, 1 - r.f / start));
    sound.phrase(5);
    sound.rustle(6, 0.03);
    read(b, r);
    const t0 = world.time, dur = world.reduce ? 0.01 : 1.05;
    await run.hold(new Promise((res) => {
      const tk = run.tick(() => {
        const e = Math.min(1, (world.time - t0) / dur), s = e * e * (3 - 2 * e);
        show(T0, T1, s, 1.8 * (r.f / start));
        if (e >= 1) { run.untick(tk); res(); }
      });
    }));
  }
  return { res: out, gas: g };
}

function stageGas(run) {
  const { world } = run, { f } = run.state, che = f.che, n = che.ca.length;
  const flock = run.scoped(new Flock(world, n, f.shape, { size: 1.8 }));
  flock.paint(() => STOCK.high);
  const th = run.scoped(new Threads(world, n, { width: 0.16 }));
  const mean = [0, 0, 0];
  for (const p of che.ca) { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; }
  const group = new THREE.Matrix4().makeTranslation(0, LIFT, 0).multiply(new THREE.Matrix4().makeRotationX(0.3));
  const ca = che.ca.map((p) => [p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]]);
  const frames = che.frames.map((T, i) => ({ R: T.R, t: ca[i] }));
  frameBoard(run, 58, 62, { polar: 0.22, at: [0, LIFT - 6, 0], seconds: 0.6 });
  world.shadowSpan(70);
  world.liveShadows = true;
  run.scoped({ dispose: () => { world.liveShadows = false; world.shadowSpan(80); } });
  return { flock, th, group, ca, frames, shape: f.shape };
}

async function hole(run) {
  const { ui, world, sound } = run;
  const s = stageGas(run);
  ui.reads([]);
  ui.tags('model', 'game');
  sound.setOpening(0);
  // Every frame the identity: all 128 triangles lie exactly on top of each other.
  const zero = s.frames.map(() => IDENTITY());
  zero.forEach((T, i) => s.flock.place(i, T.R, T.t, s.group));
  s.flock.commit();
  ui.tags('paper');
  await run.line('All 128 residues of CheY now sit at one point, turned the same way, one on top of another. It looks like one triangle.');
  await run.line('AlphaFold2 starts here, and its authors call it the <b>black hole</b> start. The frames hold no guess at the shape. The guess is already in the pair table, which this module reads.');
  await run.line('The module reads two things: the pair table, and one row of the MSA table, the row of the protein being predicted. A linear projection of that row, a simple weighted mix of its numbers, is called the <b>single representation</b>, and it holds what the network knows about each residue.');
  ui.tags('model', 'game');
  await run.line('Now eight rounds of updates. The update rule here is this game\'s stand-in, and it is told the real relative poses. AlphaFold2 has to infer them with learned weights.');
  ui.say('Swipe up to throw the flock.');
  run.probe.throwAt = () => world.project(new THREE.Vector3(0, LIFT, 0));
  await run.until((done) => {
    let y0 = null;
    const off = run.pointer({ down: (x, y) => { y0 = y; }, up: (x, y) => { if (y0 !== null && y0 - y > 20) { off(); done(); } } });
    ui.ctrl(ui.button('Throw', () => { off(); done(); }, { quiet: true, id: 'throw' }));
  });
  ui.ctrl();
  sound.fold();
  ui.say('Each residue hears where the others think it should be, and moves part of the way.');
  const read = (b, r) => ui.reads([{ value: `${b} of 8`, label: 'block' }, { value: fmt(r.f), label: 'loss (FAPE, chapter 7)' }, { value: `${fmt(r.gap, 1)} Å`, label: 'mean gap across peptide bonds' }]);
  const { res, gas } = await eight(run, { ...s, reach: 0, read });
  run.reach(1);
  run.state.fullRun = res;
  const pts = gas.points();
  const stockColors = pts.map(() => STOCK.good);
  const ribbon = new THREE.Mesh(ribbonGeometry(pts, stockColors), world.paper({ vertexColors: true, glow: 0.45, repeat: 0.2, bump: 0.2 }));
  ribbon.matrixAutoUpdate = false; ribbon.matrix.copy(s.group); ribbon.castShadow = true;
  world.scene.add(ribbon);
  run.scoped({ dispose: () => { world.scene.remove(ribbon); ribbon.geometry.dispose(); ribbon.material.dispose(); } });
  s.th.clear();
  sound.fold();
  sound.good(2);
  const last = res[res.length - 1];
  ui.tags('model', 'game');
  await run.line(`The loss fell from ${fmt(res[0].f)} to ${fmt(last.f)}, and the real gap across a peptide bond is 1.33 Å. The gas reached the fold it was told about.`);
  await run.line('This shows that eight rounds of moves can assemble free frames. It does not show how to find them: AlphaFold2 has to work that out, with weights it learned.');
}

async function reach(run) {
  const { ui } = run;
  const s = stageGas(run);
  ui.reads([]);
  ui.tags('model', 'game');
  await run.line('What if news cannot travel far? Run it again, but let each residue hear only its four neighbours along the chain on each side.');
  ui.say('Tap to throw.');
  await run.until((done) => { ui.ctrl(ui.button('Throw', () => { ui.ctrl(); done(); }, { id: 'throw' })); });
  ui.say('Now each residue hears only its near neighbours.');
  const read = (b, r) => ui.reads([{ value: `${b} of 8`, label: 'block' }, { value: fmt(r.f), label: 'loss' }]);
  const { res } = await eight(run, { ...s, reach: 4, read });
  const lost = res[res.length - 1].f;
  run.reach(2);
  run.state.shortRun = res;
  await run.line(`After eight blocks the loss is still near ${fmt(lost)}, and even short pieces of chain are off. News travels too slowly when each residue hears only its neighbours.`);
  ui.tags('model', 'game', 'paper');
  await run.line('That is a property of this toy, where every residue must hear nearly every other. In AlphaFold2, long-range news has already reached the pair table before this module starts.');
}

async function check(run) {
  const { ui } = run;
  ambient(run);
  ui.reads([]);
  ui.tags('model');
  const first = await run.choose('A new case. A model of a 300-residue protein is right except for one loop. How does the residue gas let a network correct it?', [
    { text: 'By turning one torsion angle in the loop.', right: false, why: 'That can work with loop-closure tools, but one turn alone swings everything beyond it, as your slider showed. The gas avoids that.' },
    { text: 'By moving only the loop\'s frames, and mending the bonds later.', right: true, why: 'Right. Free frames can be corrected locally, and the stretched bonds can be mended afterwards.' },
    { text: 'Restart everything from the black hole.', right: false, why: 'That throws away everything that was already right.' },
  ]);
  const second = await run.choose('In the gas, what keeps neighbouring residues joined during the structure module?', [
    { text: 'A rigid chain, always present.', right: false, why: 'The gas has no chain. Your readout showed gaps far from 1.33 Å in the early blocks.' },
    { text: 'Nothing strictly. Losses in training ask for it, and a final clean-up makes it exact.', right: true, why: 'Yes. From the start of training, FAPE rewards neighbours landing in the right place relative to each other. A loss on bad bonds comes only in the last stage of training, called fine-tuning, because earlier it destabilised training and slightly lowered accuracy.' },
    { text: 'The triangle update in the pair table.', right: false, why: 'That shapes the pair table. It holds no bonds in the gas.' },
  ]);
  if (first && second) run.reach(3);
}
