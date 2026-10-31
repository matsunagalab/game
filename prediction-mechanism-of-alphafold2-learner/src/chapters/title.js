// The title: a flock of paper triangles, the real backbone of a protein with its real AlphaFold2 confidence as paper stock.
// The flock folds into the structure, holds, and comes apart again.
import * as THREE from 'three';
import { cloud, Flock, plddtStock, ribbonGeometry } from '../world.js';
import { getModel, hasModel } from '../science/data.js';
import { localAtoms } from '../science/gas.js';

const HOLD = 7, GATHER = 6, SCATTER = 5;

export async function titleScene(run) {
  const { world } = run;
  const st = getModel(hasModel('P04637') ? 'P04637' : 'P69441');
  const n = st.ca.length, shape = localAtoms(st);
  const flock = run.own(new Flock(world, n, shape, { size: 1.75 }));
  flock.paint((i) => plddtStock(st.plddt[i]));
  flock.tableY = 0.05;
  const mean = [0, 0, 0];
  const core = st.ca.map((p, i) => [p, st.plddt[i]]).filter(([, b]) => b >= 70);
  for (const [p] of core) { mean[0] += p[0] / core.length; mean[1] += p[1] / core.length; mean[2] += p[2] / core.length; }
  let reach = 0;
  for (const [p] of core) reach = Math.max(reach, Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]));
  const scale = 1, lift = 46;
  // The fold gets the real room between the words and the buttons, so its long tails never cross the text.
  const place = () => {
    const by = document.querySelector('#title .by').getBoundingClientRect(), foot = document.querySelector('#title .foot').getBoundingClientRect();
    const wide = innerWidth > innerHeight * 1.2;
    if (wide) world.setStage(by.right * 0.5, 0, innerWidth - by.right * 0.5, innerHeight);
    else world.setStage(0, by.bottom, innerWidth, Math.max(160, foot.top - by.bottom));
    const room = world.stage, tan = Math.tan((world.camera.fov * Math.PI) / 360);
    const dist = ((innerHeight / 2) / tan) * Math.max(128 / room.w, 120 / room.h);
    world.look({ target: new THREE.Vector3(0, lift, 0), dist, polar: 1.5, az: 0.26 }, 0);
  };
  place();
  run.onLayout = place;
  addEventListener('resize', place);
  run.own({ dispose: () => removeEventListener('resize', place) });
  world.shadowSpan(130);
  world.liveShadows = true;
  run.own({ dispose: () => { world.shadowSpan(80); } });

  // A pale ribbon arrives as the fold closes, so that helices and strands can be read.
  const pale = new THREE.Color('#dfeaf6');
  const colors = st.plddt.map((v) => plddtStock(v).clone().lerp(pale, 0.72));
  const ribbon = new THREE.Mesh(ribbonGeometry(st.ca, colors), world.paper({ vertexColors: true, glow: 0.5, repeat: 0.2, bump: 0.15, transparent: true, opacity: 0 }));
  ribbon.matrixAutoUpdate = false;
  ribbon.castShadow = false;
  world.scene.add(ribbon);
  run.own({ dispose: () => { world.scene.remove(ribbon); ribbon.geometry.dispose(); ribbon.material.dispose(); } });
  const toCore = new THREE.Matrix4().makeTranslation(-mean[0], -mean[1], -mean[2]);

  const skies = [cloud(world, -176, 78, -262, 0.8), cloud(world, 186, 104, -262, 0.65), cloud(world, 34, 58, -266, 0.5)];
  run.own({ dispose: () => { for (const c of skies) { world.scene.remove(c); c.geometry.dispose(); c.material.dispose(); } } });

  const R = new THREE.Matrix4(), q = new THREE.Quaternion(), home = st.frames.map((T) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(T.R[0], T.R[1], T.R[2], 0, T.R[3], T.R[4], T.R[5], 0, T.R[6], T.R[7], T.R[8], 0, 0, 0, 0, 1)));
  const axis = st.ca.map(() => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize());
  const phase = st.ca.map(() => Math.random() * Math.PI * 2), band = st.ca.map(() => Math.random());
  const tumble = new THREE.Quaternion(), out = new THREE.Quaternion(), rot = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const group = new THREE.Matrix4(), v = [0, 0, 0];
  const cycle = HOLD + GATHER + SCATTER + 5;
  let last = -1;
  const clock0 = world.time;
  run.tick((dt, tt) => {
    const t = (tt - clock0 + 1.5) % cycle;
    // phase of the cycle, from 0 (a flock in the air) to 1 (the fold)
    let g;
    if (t < 5) g = 0; else if (t < 5 + GATHER) g = (t - 5) / GATHER; else if (t < 5 + GATHER + HOLD) g = 1; else g = 1 - (t - 5 - GATHER - HOLD) / SCATTER;
    if (world.reduce) g = 1;
    const stage = g <= 0 ? 0 : g >= 1 ? 2 : 1;
    if (stage !== last) { if (stage === 1) run.sound.rustle(7, 0.03); if (stage === 2) { run.sound.fold(); run.sound.setOpening(0.9); } if (stage === 0) run.sound.setOpening(0.3); last = stage; }
    const cy = Math.sin(tt * 0.13) * 0.7;
    group.compose(new THREE.Vector3(0, lift, 0), q.setFromEuler(new THREE.Euler(0.18, tt * 0.09, 0)), new THREE.Vector3(scale, scale, scale));
    for (let i = 0; i < n; i += 1) {
      const c = st.ca[i], b = band[i], p = phase[i];
      const stag = THREE.MathUtils.clamp(g * 1.6 - (i / n) * 0.6, 0, 1);
      const e = stag * stag * (3 - 2 * stag);
      // The flock: a rolling sheet of birds, each on its own orbit in a shared flow.
      const a = tt * (0.28 + b * 0.16) + p, r = 56 + 40 * b + 16 * Math.sin(tt * 0.31 + p);
      const wx = Math.cos(a) * r + 22 * Math.sin(tt * 0.21 + b * 6), wy = 14 * Math.sin(a * 1.7 + cy) + 22 * (b - 0.5) + 8 * Math.sin(tt * 0.4 + i * 0.13), wz = Math.sin(a) * r * 0.62;
      const hx = c[0] - mean[0], hy = c[1] - mean[1], hz = c[2] - mean[2];
      v[0] = wx + (hx - wx) * e; v[1] = wy + (hy - wy) * e; v[2] = wz + (hz - wz) * e;
      tumble.setFromAxisAngle(axis[i], tt * (0.9 + b) + p);
      out.copy(tumble).slerp(home[i], e);
      R.makeRotationFromQuaternion(out);
      const m = R.elements;
      rot[0] = m[0]; rot[1] = m[4]; rot[2] = m[8]; rot[3] = m[1]; rot[4] = m[5]; rot[5] = m[9]; rot[6] = m[2]; rot[7] = m[6]; rot[8] = m[10];
      flock.place(i, rot, v, group);
    }
    flock.commit();
    ribbon.material.opacity = THREE.MathUtils.smoothstep(g, 0.72, 1) * 0.92;
    ribbon.visible = ribbon.material.opacity > 0.01;
    ribbon.matrix.multiplyMatrices(group, toCore);
  });
  return run.until(() => {});
}
