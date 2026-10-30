// The last lesson: a large particle with repeating sites, and an antibody using both arms.
import * as THREE from 'three';
import {PALETTES, makeCloud} from './stage.js';
import {buildAntibody, HINGE, TIP_B, stemDirection} from './molecules.js';
import {formatKd} from './rules.js';
import {$} from './ui.js';

const R = 9.6;
const CENTRE = new THREE.Vector3(0, 0, -R - 1.5);
const MIN_SPAN = 6, MAX_SPAN = 15;

// Front-facing sites, as [left-right, up-down] angles from the camera axis.
const SITES = [[-0.72, 0.55], [-0.12, 0.72], [0.62, 0.5], [-0.9, -0.1], [-0.3, 0.08], [0.2, -0.05], [0.84, -0.2], [-0.5, -0.66], [0.3, -0.72]];

function sitePoint([a, b]) {
  return new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)).multiplyScalar(R).add(CENTRE);
}

function buildParticle(palette) {
  const list = [];
  const a = new THREE.Color(PALETTES[palette].antigen), b = new THREE.Color(PALETTES[palette].antigen2), base = new THREE.Color('#8E7BE8'), base2 = new THREE.Color('#B3A6F2');
  list.push([CENTRE.x, CENTRE.y, CENTRE.z, R - 0.1, base]);
  const n = 1700, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), t = i * golden;
    const d = new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r);
    d.add(new THREE.Vector3().randomDirection().multiplyScalar(0.05)).normalize();
    const c = Math.random() < 0.3 ? base2 : base;
    const len = R + Math.random() * 0.34 - 0.1;
    list.push([d.x * len + CENTRE.x, d.y * len + CENTRE.y, d.z * len + CENTRE.z, 0.42 + Math.random() * 0.26, c]);
  }
  const sites = SITES.map(sitePoint);
  for (const s of sites) {
    const n2 = s.clone().sub(CENTRE).normalize();
    for (let i = 0; i < 46; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(0.9).add(n2.clone().multiplyScalar(0.6)).add(s);
      list.push([v.x, v.y, v.z, 0.24, i % 3 ? a : b]);
    }
  }
  const pos = new Float32Array(list.length * 3), rad = new Float32Array(list.length), col = new Float32Array(list.length * 3);
  list.forEach((l, i) => { pos.set([l[0], l[1], l[2]], i * 3); rad[i] = l[3]; col.set([l[4].r, l[4].g, l[4].b], i * 3); });
  return {mesh: makeCloud(pos, rad, col), sites};
}

function buildPhagocyte() {
  const n = 2600, golden = Math.PI * (3 - Math.sqrt(5)), r0 = 34;
  const pos = new Float32Array(n * 3), rad = new Float32Array(n), col = new Float32Array(n * 3);
  const c = new THREE.Color('#F4E2FF'), c2 = new THREE.Color('#DEC2F7');
  rad[0] = r0 - 0.4;
  col.set([c2.r, c2.g, c2.b], 0);
  for (let i = 1; i < n; i++) {
    const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), t = i * golden;
    const len = r0 * (1 + 0.012 * Math.sin(t * 3 + y * 9)) + Math.random() * 0.5;
    pos.set([Math.cos(t) * r * len, y * len, Math.sin(t) * r * len], i * 3);
    rad[i] = 0.9 + Math.random() * 0.8;
    const k = Math.random() < 0.7 ? c : c2;
    col.set([k.r, k.g, k.b], i * 3);
  }
  const mesh = makeCloud(pos, rad, col, {jitter: 0});
  return mesh;
}

// Stem pointing straight out from the particle, each arm reaching for a surface point.
function standOn(s1, s2) {
  const normal = s1.clone().add(s2).multiplyScalar(0.5).sub(CENTRE).normalize();
  const armLength = HINGE.length();
  const half = s1.distanceTo(s2) / 2;
  const height = Math.sqrt(Math.max(armLength * armLength - half * half, 4));
  const hingeWorld = CENTRE.clone().addScaledVector(normal, R + height);
  const qBody = new THREE.Quaternion().setFromUnitVectors(stemDirection(), normal);
  const finalPos = hingeWorld.clone().sub(HINGE.clone().applyQuaternion(qBody));
  const qInv = qBody.clone().invert();
  const aimArm = (restTip, world) => {
    const rest = restTip.clone().sub(HINGE).normalize();
    const want = world.clone().sub(hingeWorld).applyQuaternion(qInv).normalize();
    return new THREE.Quaternion().setFromUnitVectors(rest, want);
  };
  return {hingeWorld, normal, qBody, finalPos, armAGoal: aimArm(new THREE.Vector3(0, 0, 0), s1), armBGoal: aimArm(TIP_B, s2)};
}

export async function runTwoArms({book, stage, sound, ruler, coach, wait, tween, aim, useView, float, pulse, kd}) {
  const {mesh: particle, sites} = buildParticle('night');
  particle.scale.setScalar(0.01);
  const group = new THREE.Group();
  group.add(particle);
  stage.scene.add(group);

  book.free = true;
  book.rig.rotation.z = 0;
  book.left.position.set(0, 60, 30);
  book.left.quaternion.identity();
  book.antibody.position.set(0, 0, 0);
  const ab = book.antibody;

  const portrait = innerWidth < innerHeight;
  const camera = () => {
    const H = innerHeight, W = innerWidth;
    const top = 70, bottom = $('#dock').hidden ? H : $('#dock').getBoundingClientRect().top;
    const span = 22;
    const px = Math.min((W - 66) / span, (bottom - top) / span);
    aim((W - 66) / 2, top + (bottom - top) / 2, px);
  };
  useView(camera, 2);

  await tween(1300, t => particle.scale.setScalar(Math.max(0.01, t)));
  particle.scale.setScalar(1);

  const spots = sites.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'spot';
    b.setAttribute('aria-label', `Site ${i + 1}`);
    b.dataset.i = i;
    $('#labels').append(b);
    return b;
  });
  const place = () => {
    const v = new THREE.Vector3();
    sites.forEach((s, i) => {
      v.copy(s).project(stage.camera);
      spots[i].style.transform = `translate(${(v.x + 1) / 2 * innerWidth}px, ${(1 - v.y) / 2 * innerHeight}px)`;
    });
  };
  let placing = true;
  const follow = () => { if (placing) { place(); requestAnimationFrame(follow); } };
  follow();

  const pair = await new Promise(resolve => {
    const chosen = [];
    spots.forEach((b, i) => b.addEventListener('click', () => {
      if (chosen[0] === i) { chosen.length = 0; b.classList.remove('on'); sound.pick(); return; }
      if (chosen.length === 0) { chosen.push(i); b.classList.add('on'); sound.place(); coach('Good. Now choose a second site. <b>The arms need room, but they cannot stretch forever.</b>'); return; }
      const d = sites[chosen[0]].distanceTo(sites[i]);
      if (d < MIN_SPAN) { sound.bad(); coach('<b>Too close.</b> The two arms cannot fold in that tightly. Try a site further away.'); return; }
      if (d > MAX_SPAN) { sound.bad(); coach('<b>Too far.</b> The arms span about 15 nm at most. Try a nearer site.'); return; }
      b.classList.add('on');
      sound.place();
      resolve([chosen[0], i]);
    }));
  });
  spots.forEach((b, i) => { if (!pair.includes(i)) b.classList.add('off'); });
  await wait(300);
  placing = false;
  spots.forEach(b => b.remove());

  const [s1, s2] = [sites[pair[0]], sites[pair[1]]];
  const {hingeWorld, normal, qBody, finalPos, armAGoal, armBGoal} = standOn(s1, s2);
  const startPos = finalPos.clone().add(normal.clone().multiplyScalar(26));

  book.left.quaternion.copy(qBody);
  await tween(1200, t => {
    const e = 1 - Math.pow(1 - t, 3);
    book.left.position.lerpVectors(startPos, finalPos, e);
    ab.armA.quaternion.identity().slerp(armAGoal, e);
  });
  sound.thunk();
  book.shake = 0;
  const scr = p => { const v = p.clone().project(stage.camera); return {x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight}; };
  let p = scr(s1);
  pulse(p.x, p.y);
  float('One arm', formatKd(kd), p.x, p.y - 20, 'neutral');
  ruler.set(kd);
  coach('One arm alone comes off at its own pace.');
  await wait(1500);

  await tween(900, t => { ab.armB.quaternion.identity().slerp(armBGoal, t * t); });
  sound.thunk();
  sound.ring();
  p = scr(s2);
  pulse(p.x, p.y);
  const both = kd / 1000;
  float('Both arms', formatKd(both), p.x, p.y - 20, 'good', true);
  ruler.set(both);
  coach('<b>Both arms.</b> When one lets go, the other holds it close, so it rebinds at once. Binding can get about a thousand times tighter.');
  await wait(2600);

  // More antibodies coat the particle, tails outward.
  coach('Thousands more arrive and coat the particle, with their tails sticking out.');
  const copies = [];
  const count = innerWidth < 600 ? 14 : 24;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + 0.5) / count, r = Math.sqrt(1 - y * y), t = i * golden + 0.6;
    const n = new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r);
    if (n.distanceTo(normal) < 0.6) continue;
    const tangent = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0.3, 1, 0.2)).normalize();
    const spot = sign => CENTRE.clone().addScaledVector(n.clone().addScaledVector(tangent, sign * 0.36).normalize(), R);
    const pose = standOn(spot(1), spot(-1));
    const copy = buildAntibody(4, 1.5);
    copy.quaternion.copy(pose.qBody);
    copy.armA.quaternion.copy(pose.armAGoal);
    copy.armB.quaternion.copy(pose.armBGoal);
    const from = pose.finalPos.clone().addScaledVector(n, 34);
    copy.position.copy(from);
    group.add(copy);
    copies.push({copy, to: pose.finalPos, from, delay: copies.length * 0.05});
  }
  await tween(2400, t => {
    for (const c of copies) {
      const k = Math.min(1, Math.max(0, t * 2 - c.delay));
      c.copy.position.lerpVectors(c.from, c.to, 1 - Math.pow(1 - k, 3));
    }
  });
  await wait(900);

  // The Fc tails call in a phagocyte, which rolls over the particle.
  coach('Immune cells have receptors for those tails. A phagocyte arrives and swallows the whole particle.');
  const cell = buildPhagocyte();
  const side = portrait ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(1, 0, 0);
  const from = CENTRE.clone().addScaledVector(side, 92);
  const to = CENTRE.clone().addScaledVector(side, 36);
  cell.position.copy(from);
  group.add(cell);
  await tween(3800, t => { const e = t * t * (3 - 2 * t); cell.position.lerpVectors(from, to, e); });
  sound.win();
  await wait(700);

  return () => {
    stage.scene.remove(group);
    book.left.position.set(0, 60, 30);
    ab.armA.quaternion.identity();
    ab.armB.quaternion.identity();
  };
}
