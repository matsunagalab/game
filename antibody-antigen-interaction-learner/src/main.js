import * as THREE from 'three';
import {Stage, PALETTES} from './stage.js';
import {buildCrowd} from './molecules.js';
import {Book} from './book.js';
import {Sound} from './audio.js';
import {
  RESIDUES, LOOPS, RIM, CORE, INTERACTIONS, CLASS_INFO, REACH_LABEL,
  evaluate, pairEnergy, assignments, kdFromEnergy, formatKd, formatDuration,
} from './rules.js';
import {LESSONS, TWO_ARMS} from './levels.js';
import {$, Labels, Ruler, float, pulse, chapter, pipsHtml, legendHtml, reducedMotion} from './ui.js';
import {newRun, offers, required, mutant, ROUNDS} from './germinal.js';
import {runTwoArms} from './arms.js';

if (!document.createElement('canvas').getContext('webgl2')) {
  $('#pitch').textContent = 'This game needs WebGL 2. Please open it in a current version of Chrome, Safari, Edge, or Firefox.';
  $('#title-actions').hidden = true;
  throw new Error('WebGL 2 is not available');
}

const stage = new Stage($('#gl'));
const small = Math.min(innerWidth, innerHeight) < 600;
const crowd = buildCrowd(small ? 16 : 28, PALETTES.lagoon.crowd);
stage.scene.add(crowd);
const book = new Book(stage, {waterCount: small ? 24 : 34});
const sound = new Sound();
const labels = new Labels(book, stage.camera, onLoop);
const ruler = new Ruler();

const STORE_KEY = 'antibody-antigen-learner-v1';
const store = Object.assign({stars: {}, seen: [], bestGc: null, armsDone: false, muted: false}, (() => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
})());
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private mode */ } };

const game = {fresh: [], mode: 'title', lesson: null, index: 0, hand: [], selected: null, placed: {}, busy: false, speed: 1, best: {}, run: null, cards: [], card: null};

const wait = ms => new Promise(r => setTimeout(r, reducedMotion ? Math.min(ms, 120) : ms / game.speed));
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

const tweens = new Set();
function tween(ms, fn) {
  return new Promise(resolve => {
    if (reducedMotion) { fn(1); resolve(); return; }
    tweens.add({t: 0, ms, fn, resolve});
  });
}

// Camera ------------------------------------------------------------------
const view = {dist: 42, goalDist: 42, look: new THREE.Vector3(), goalLook: new THREE.Vector3(), yaw: 0, pitch: 0, goalYaw: 0, goalPitch: 0, rate: 2.4};
const TAN = Math.tan(THREE.MathUtils.degToRad(15));

function aim(centreX, centreY, pxPerUnit, worldX = 0, worldY = 0) {
  view.goalDist = innerHeight / pxPerUnit / (2 * TAN);
  view.goalLook.set(worldX + (innerWidth / 2 - centreX) / pxPerUnit, worldY + (centreY - innerHeight / 2) / pxPerUnit, 0);
}

function bookView() {
  const W = innerWidth, H = innerHeight, portrait = W < H;
  const top = $('#bar').getBoundingClientRect().bottom + 6;
  const bottom = $('#dock').getBoundingClientRect().top - 6;
  const right = W - ($('#ruler').getBoundingClientRect().width + 14);
  const regionW = right, regionH = Math.max(120, bottom - top);
  const px = portrait ? Math.min(regionW / 5.5, regionH / 8.4) : Math.min(regionW / 9.8, regionH / 5.7);
  aim(regionW / 2, top + regionH / 2, px);
}

function complexView(sheetTop) {
  const W = innerWidth, H = innerHeight, portrait = W < H;
  const top = 70, bottom = Math.max(top + 120, sheetTop - 8);
  const regionH = bottom - top;
  const long = 24, short = 14;
  const px = portrait ? Math.min(W / short, regionH / long) : Math.min(W / long, regionH / short);
  const worldX = portrait ? -1.8 : -4.8, worldY = portrait ? -4.8 : 1.8;
  aim(W / 2, top + regionH / 2, px, worldX, worldY);
}

function titleView() {
  const W = innerWidth, H = innerHeight;
  if (W < H) aim(W / 2, H * 0.6, Math.min(W * 0.98, H * 0.46) / 17);
  else aim(W * 0.68, H * 0.52, H * 0.98 / 17);
}

let viewFn = titleView;
function useView(fn, rate = 2.4) { viewFn = fn; view.rate = rate; fn(); }

addEventListener('resize', () => {
  const portrait = innerWidth < innerHeight;
  if (portrait !== book.portrait && !book.free) book.setPortrait(portrait);
  viewFn();
});

// Dragging empty space turns the view a little, to inspect the interface.
let orbit = null;
$('#gl').addEventListener('pointerdown', e => { if (!book.free) orbit = {x: e.clientX, y: e.clientY, yaw: view.goalYaw, pitch: view.goalPitch}; });
addEventListener('pointermove', e => {
  if (!orbit) return;
  view.goalYaw = THREE.MathUtils.clamp(orbit.yaw - (e.clientX - orbit.x) * 0.006, -0.6, 0.6);
  view.goalPitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - orbit.y) * 0.006, -0.5, 0.5);
});
addEventListener('pointerup', () => { orbit = null; });

const syncCamera = dt => {
  const k = 1 - Math.exp(-dt * view.rate);
  view.dist += (view.goalDist - view.dist) * k;
  view.look.lerp(view.goalLook, k);
  view.yaw += (view.goalYaw - view.yaw) * k;
  view.pitch += (view.goalPitch - view.pitch) * k;
  const c = stage.camera;
  c.position.set(
    view.look.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist,
    view.look.y + Math.sin(view.pitch) * view.dist,
    view.look.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist,
  );
  c.lookAt(view.look);
  c.updateMatrixWorld();
  stage.uniforms.uFogNear.value = view.dist + 5;
  stage.uniforms.uFogFar.value = view.dist + 52;
};

// Palette and panels ------------------------------------------------------
function setPalette(name, seconds = 1.2) {
  const p = PALETTES[name];
  stage.setPalette(name, seconds);
  crowd.setColor(p.crowd);
  document.documentElement.style.setProperty('--ink', p.ink);
  document.documentElement.style.setProperty('--accent', p.antigen);
}

const show = (id, on = true) => { $(id).hidden = !on; };
function hud(on) { for (const id of ['#bar', '#ruler', '#dock']) show(id, on); }
function closeOverlays() { show('#sheet', false); show('#lessons', false); show('#notes', false); }

function coach(html) { $('#coach').innerHTML = html; }

// Notes -------------------------------------------------------------------
function discover(kind) {
  if (store.seen.includes(kind)) return;
  store.seen.push(kind);
  game.fresh.push(INTERACTIONS[kind].name);
  save();
  $('#notes-btn').classList.add('fresh');
}

function freshLine() {
  if (!game.fresh.length) return '';
  const line = `<p>New in your notes: ${game.fresh.join(', ')}.</p>`;
  game.fresh = [];
  return line;
}

function renderNotes() {
  const rows = Object.entries(INTERACTIONS).map(([k, v]) => store.seen.includes(k)
    ? `<div class="note"><b>${v.name}</b>${v.note}</div>`
    : `<div class="note locked"><b>Not found yet</b>Keep building to find this one.</div>`).join('');
  const reach = [1, 2, 3].map(r => {
    const names = Object.values(RESIDUES).filter(x => x.reach === r).map(x => x.code).join(', ');
    return `<span>${pipsHtml(r)} ${REACH_LABEL[r]}: ${names}</span>`;
  }).join('');
  $('#notes').innerHTML = `<div class="panel-inner">
    <div class="panel-head"><h2>Your notes</h2><button class="pill" id="notes-close">Close</button></div>
    <p>Side chain families</p><div class="legend">${legendHtml()}</div>
    <p>Reach. Pairs should add up to four bars: long with short, medium with medium.</p><div class="legend">${reach}</div>
    <p>K<sub>D</sub> is the antigen concentration at which half the antibody sites are filled, so lower is tighter. At body temperature, about 1.4 kcal/mol makes binding ten times tighter.</p>
    ${rows}</div>`;
  $('#notes-close').addEventListener('click', () => { show('#notes', false); });
}

$('#notes-btn').addEventListener('click', () => {
  $('#notes-btn').classList.remove('fresh');
  renderNotes();
  show('#notes');
});

function syncSound() {
  $('#sound-btn .wide').textContent = store.muted ? 'Sound off' : 'Sound on';
  $('#sound-btn .narrow').textContent = store.muted ? '×' : '♪';
  $('#sound-btn').setAttribute('aria-label', store.muted ? 'Sound off' : 'Sound on');
  $('#sound-btn').setAttribute('aria-pressed', String(!store.muted));
  sound.setMuted(store.muted);
}
$('#sound-btn').addEventListener('click', () => { store.muted = !store.muted; save(); syncSound(); });
for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(type, () => sound.unlock());

// Title and lesson list ---------------------------------------------------
function nextLessonIndex() {
  const i = LESSONS.findIndex(l => !store.stars[l.id]);
  return i < 0 ? LESSONS.length : i;
}

function renderTitle() {
  const i = nextLessonIndex();
  $('#play').textContent = i === 0 ? 'Start lesson 1' : i < LESSONS.length ? `Continue: ${LESSONS[i].title}` : store.armsDone ? 'Play germinal center' : `Continue: ${TWO_ARMS.title}`;
}

function leaveArms() {
  if (game.cleanUp) game.cleanUp();
  game.cleanUp = null;
}

function goTitle() {
  leaveArms();
  book.free = false;
  book.setPortrait(innerWidth < innerHeight);
  game.mode = 'title';
  game.busy = false;
  closeOverlays();
  hud(false);
  labels.setVisible(false);
  book.setAntigen(null);
  for (const l of LOOPS) book.setResidue('para', l, null, false);
  book.openness = 1;
  book.drift = 0;
  book.heroBlend = 1;
  view.goalYaw = view.goalPitch = 0;
  setPalette('lagoon');
  useView(titleView);
  renderTitle();
  show('#title');
}

function renderLessons() {
  const items = LESSONS.map((l, i) => {
    const stars = store.stars[l.id] || 0;
    return `<button class="row" data-i="${i}" style="--swatch:${PALETTES[l.palette].a}"><span class="n">${i + 1}</span><span class="t"><b>${l.title}</b><span>${['', 'One', 'Two', 'Three'][stars] ? `${stars} of 3 stars` : 'Not played yet'}</span></span></button>`;
  }).join('');
  const armsRow = `<button class="row" data-i="arms" style="--swatch:${PALETTES.night.a}"><span class="n" style="color:#fff">${LESSONS.length + 1}</span><span class="t"><b>${TWO_ARMS.title}</b><span>${store.armsDone ? 'Finished' : 'Not played yet'}</span></span></button>`;
  const gcRow = `<button class="row" data-i="gc" style="--swatch:${PALETTES.fuchsia.a}"><span class="n">★</span><span class="t"><b>Germinal center</b><span>${store.bestGc ? `Best: ${formatKd(store.bestGc)}` : 'Six rounds of mutation and selection, with no hints'}</span></span></button>`;
  $('#lessons').innerHTML = `<div class="panel-inner"><div class="panel-head"><h2>Lessons</h2><button class="pill" id="lessons-close">Close</button></div>${items}${armsRow}${gcRow}</div>`;
  $('#lessons-close').addEventListener('click', () => { show('#lessons', false); });
  $('#lessons').querySelectorAll('.row').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.i;
    if (v === 'gc') startGerminal();
    else if (v === 'arms') startArms();
    else startLesson(+v);
  }));
}

$('#to-lessons').addEventListener('click', () => { renderLessons(); show('#lessons'); });
$('#to-gc').addEventListener('click', () => startGerminal());
$('#play').addEventListener('click', () => {
  const i = nextLessonIndex();
  if (i < LESSONS.length) startLesson(i);
  else if (!store.armsDone) startArms();
  else startGerminal();
});
$('#back').addEventListener('click', () => {
  if (game.mode === 'arms') { location.reload(); return; }
  if (game.busy) return;
  renderLessons();
  show('#lessons');
  if (game.mode === 'done') goTitle();
});

// Lessons -----------------------------------------------------------------
function bestPossible(lv) {
  if (game.best[lv.id]) return game.best[lv.id];
  const open = LOOPS.filter(l => !lv.locked[l]);
  let best = Infinity;
  for (const a of assignments(open, lv.hand)) {
    const para = {...lv.locked, ...a};
    const r = evaluate(para, lv.epitope, lv);
    if (r.kd >= best || r.kd > lv.target) continue;
    if (lv.self && evaluate(para, lv.self, lv).kd < lv.selfFloor) continue;
    best = r.kd;
  }
  return (game.best[lv.id] = best);
}

const starsFor = (lv, kd) => kd > lv.target ? 0 : kd <= bestPossible(lv) * 1.01 ? 3 : kd <= Math.sqrt(lv.target * bestPossible(lv)) ? 2 : 1;

function enterScene(palette, antigen, epitope, alt) {
  leaveArms();
  closeOverlays();
  show('#title', false);
  setPalette(palette);
  book.free = false;
  book.setPortrait(innerWidth < innerHeight);
  book.setAntigen(antigen, palette);
  book.drift = 0;
  book.openness = 1;
  book.water.reset();
  book.clearGlow();
  labels.clearLinks();
  for (const l of LOOPS) {
    book.setResidue('epi', l, epitope[l], false);
    labels.setEpi(l, epitope[l], alt && alt[l] !== epitope[l] ? alt[l] : null);
    book.setResidue('para', l, null, false);
    labels.setPara(l, null);
  }
  book.right.scale.setScalar(0.01);
  view.goalYaw = view.goalPitch = 0;
  hud(true);
}

async function swoopIn() {
  useView(bookView, 2.2);
  const from = book.heroBlend;
  await tween(from > 0 ? 1500 : 500, t => {
    const e = easeInOut(t);
    book.heroBlend = from * (1 - e);
    book.right.scale.setScalar(Math.max(0.01, e));
  });
  book.heroBlend = 0;
  book.right.scale.setScalar(1);
  labels.setVisible(true);
}

async function startLesson(i) {
  const lv = LESSONS[i];
  game.mode = 'lesson';
  game.lesson = lv;
  game.index = i;
  game.busy = true;
  game.placed = {};
  game.selected = null;
  game.hand = lv.hand.map((aa, id) => ({id, aa, loop: null}));
  enterScene(lv.palette, lv.antigen, lv.epitope, lv.self);
  $('#bar-title').textContent = `${i + 1}. ${lv.title}`;
  ruler.set(1e-3);
  ruler.setGoal(lv.target);
  ruler.setFloor(lv.selfFloor || null);
  coach(`${lv.intro} <b>${lv.prompt}</b>`);
  renderTray();
  $('#bind').textContent = 'Bind';
  $('#bind').disabled = true;
  chapter(lv.title);
  await swoopIn();
  for (const [l, aa] of Object.entries(lv.locked)) {
    book.setResidue('para', l, aa);
    labels.setPara(l, aa, {locked: true});
    updatePair(l, lv.epitope, false);
  }
  game.busy = false;
}

function renderTray() {
  const tray = $('#tray');
  tray.innerHTML = '';
  const n = game.hand.length;
  tray.style.gridTemplateColumns = `repeat(${n > 5 && innerWidth < 600 ? Math.ceil(n / 2) : n}, minmax(0, 1fr))`;
  for (const tile of game.hand) {
    const r = RESIDUES[tile.aa];
    const b = document.createElement('button');
    b.className = tile.loop ? 'tile used' : `tile c-${r.cls}${game.selected === tile.id ? ' selected' : ''}`;
    b.innerHTML = `<b>${r.code}</b><span class="tile-meta">${CLASS_INFO[r.cls].glyph} ${pipsHtml(r.reach)}</span>`;
    b.setAttribute('aria-label', `${r.name}, ${CLASS_INFO[r.cls].label}, ${REACH_LABEL[r.reach]} reach`);
    wireTile(b, tile);
    tray.append(b);
  }
  labels.targets(game.selected !== null);
}

function wireTile(el, tile) {
  let start = null, ghost = null;
  el.addEventListener('pointerdown', e => {
    if (game.busy) return;
    start = {x: e.clientX, y: e.clientY};
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!start) return;
    if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      ghost = el.cloneNode(true);
      Object.assign(ghost.style, {position: 'fixed', left: 0, top: 0, width: `${el.offsetWidth}px`, margin: 0, pointerEvents: 'none', zIndex: 9, flex: 'none'});
      ghost.classList.remove('selected');
      document.body.append(ghost);
      el.style.opacity = 0.3;
      game.selected = tile.id;
      labels.targets(true);
    }
    if (ghost) ghost.style.transform = `translate(${e.clientX - el.offsetWidth / 2}px, ${e.clientY - 56}px) scale(1.08)`;
  });
  el.addEventListener('pointerup', e => {
    if (!start) return;
    start = null;
    if (!ghost) { toggleTile(tile.id); return; }
    ghost.remove();
    ghost = null;
    el.style.opacity = '';
    const loop = nearestLoop(e.clientX, e.clientY - 40);
    if (loop) onLoop(loop);
    else { game.selected = null; labels.targets(false); }
  });
  el.addEventListener('pointercancel', () => { start = null; if (ghost) { ghost.remove(); ghost = null; el.style.opacity = ''; } });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTile(tile.id); }
  });
}

function toggleTile(id) {
  if (game.busy) return;
  game.selected = game.selected === id ? null : id;
  sound.pick();
  renderTray();
}

function nearestLoop(x, y) {
  let best = null, bestD = 70;
  for (const loop of LOOPS) {
    const el = labels.sites.para[loop];
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
    if (d < bestD) { best = loop; bestD = d; }
  }
  return best;
}

function releaseTile(id) {
  const tile = game.hand[id];
  if (!tile.loop) return;
  delete game.placed[tile.loop];
  book.setResidue('para', tile.loop, null);
  labels.setPara(tile.loop, null);
  labels.setLink(tile.loop, null);
  tile.loop = null;
}

function linkState(pair) {
  if (pair.energy > 0) return 'bad';
  if (pair.energy === 0) return null;
  return pair.fit === 'snug' ? 'good' : 'loose';
}

function updatePair(loop, epitope, speak = true) {
  const p = book.residues.para[loop];
  const pair = pairEnergy(p, epitope[loop]);
  labels.setLink(loop, linkState(pair));
  if (!speak) return;
  const a = RESIDUES[p].code, b = RESIDUES[epitope[loop]].code;
  const info = INTERACTIONS[pair.kind];
  const extra = pair.fit === 'loose' && pair.energy < 0 ? ' It is a little short, so it counts for half.' : '';
  coach(`<b>${a} with ${b}: ${info.name}.</b> ${info.note}${extra}`);
}

function onLoop(loop) {
  if (game.busy || game.mode !== 'lesson') return;
  const current = game.placed[loop];
  if (game.selected !== null) {
    const tile = game.hand[game.selected];
    if (tile.loop) releaseTile(tile.id);
    if (current !== undefined) releaseTile(current);
    tile.loop = loop;
    game.placed[loop] = tile.id;
    book.setResidue('para', loop, tile.aa);
    labels.setPara(loop, tile.aa);
    updatePair(loop, game.lesson.epitope);
    sound.place();
    game.selected = null;
  } else if (current !== undefined) {
    releaseTile(current);
    game.selected = current;
    sound.pick();
  }
  renderTray();
  const open = LOOPS.filter(l => !game.lesson.locked[l]);
  $('#bind').disabled = !open.every(l => game.placed[l] !== undefined);
}

// Binding: each contact is counted out loud, like a slow reveal of the score.
const signed = e => `${e > 0 ? '+' : '−'}${Math.abs(e).toFixed(1)}`;

async function cascade(result, epitope, {quick = false} = {}) {
  game.speed = quick ? 2 : 1;
  game.counting = true;
  let energy = 0, note = 0;
  ruler.set(1e-3);
  const beat = 440;
  const midPoint = loop => labels.mid?.[loop] ?? {x: innerWidth / 2, y: innerHeight / 3};
  for (const step of result.steps) {
    energy += step.energy;
    const info = INTERACTIONS[step.kind];
    const shownKd = kdFromEnergy(energy);
    if (step.type === 'pair') {
      const p = midPoint(step.loop);
      labels.lit(step.loop, true);
      labels.setLink(step.loop, linkState(step));
      const good = step.energy < 0;
      book.setGlow('para', step.loop, good ? 0.5 : 0.25, good ? '#ffffff' : '#ff2030');
      book.setGlow('epi', step.loop, good ? 0.5 : 0.25, good ? '#ffffff' : '#ff2030');
      if (good) sound.pluck(note++);
      else if (step.energy > 0) sound.bad();
      else sound.pick();
      float(info.name, step.energy ? signed(step.energy) : '', p.x, p.y, good ? 'good' : step.energy > 0 ? 'bad' : 'neutral');
      discover(step.kind);
      ruler.set(shownKd);
      await wait(beat);
      labels.lit(step.loop, false);
      book.clearGlow();
    } else if (step.type === 'crowd') {
      const p = midPoint(step.loop);
      sound.bad();
      float(info.name, signed(step.energy), p.x, p.y, 'bad');
      discover('crowd');
      ruler.set(shownKd);
      await wait(beat);
    } else if (step.type === 'ring') {
      const p = midPoint(CORE);
      RIM.forEach(l => labels.lit(l, true));
      sound.ring();
      pulse(p.x, p.y);
      float(info.name, signed(step.energy), p.x, p.y - 24, 'good', true);
      discover('ring');
      ruler.set(shownKd);
      await wait(beat * 1.7);
      RIM.forEach(l => labels.lit(l, false));
    } else {
      sound.cost();
      float(info.name, signed(step.energy), innerWidth / 2, innerHeight * 0.42, 'bad');
      discover('entropy');
      ruler.set(shownKd);
      await wait(beat * 1.5);
    }
  }
  game.speed = 1;
  game.counting = false;
}

async function closeBook() {
  labels.setVisible(false);
  sound.noise({duration: 0.9, from: 300, to: 1400, level: 0.08});
  await tween(reducedMotion ? 1 : 880, t => { book.openness = 1 - t * t * t; });
  book.openness = 0;
  book.water.burst();
  book.shake = 1;
  sound.thunk();
  sound.water();
  stage.uniforms.uFlash.value = 0.34;
  tween(420, t => { stage.uniforms.uFlash.value = 0.34 * (1 - t); });
  const c = new THREE.Vector3(0, 0, 0).project(stage.camera);
  pulse((c.x + 1) / 2 * innerWidth, (1 - c.y) / 2 * innerHeight);
}

async function reopenBook() {
  closeOverlays();
  show('#dock');
  await tween(reducedMotion ? 1 : 420, t => { book.drift *= 1 - t; });
  book.drift = 0;
  book.water.reset();
  useView(bookView, 3);
  await tween(reducedMotion ? 1 : 620, t => { book.openness = easeInOut(t); });
  book.openness = 1;
  labels.setVisible(true);
}

async function fallAway() {
  await wait(420);
  await tween(1500, t => { book.drift = easeInOut(t); });
}

function worstPairs(result) {
  const bad = result.steps.filter(s => s.type === 'pair' && s.energy >= 0).sort((a, b) => b.energy - a.energy).slice(0, 3);
  return bad.map(s => {
    const p = RESIDUES[book.residues.para[s.loop]]?.code, e = RESIDUES[book.residues.epi[s.loop]]?.code;
    return `<li><b>${s.loop}, ${p} with ${e}:</b> ${INTERACTIONS[s.kind].note}</li>`;
  }).join('');
}

const starRow = n => `<div class="stars" role="img" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</div>`;

function openSheet(html) {
  const sheet = $('#sheet');
  sheet.innerHTML = html;
  show('#dock', false);
  show('#sheet');
  useView(() => complexView(sheet.getBoundingClientRect().top), 1.7);
  const action = sheet.querySelector('.big');
  if (action) action.focus({preventScroll: true});
}

async function bind() {
  if (game.busy) return;
  const lv = game.lesson;
  game.busy = true;
  game.selected = null;
  renderTray();
  $('#bind').disabled = true;
  const para = {...lv.locked};
  for (const l of Object.keys(game.placed)) para[l] = game.hand[game.placed[l]].aa;

  if (lv.self) {
    coach('<b>First, the look-alike.</b> Your cell is tested against your own protein.');
    for (const l of LOOPS) { book.setResidue('epi', l, lv.self[l]); labels.setEpi(l, lv.self[l]); }
    labels.clearLinks();
    await wait(600);
    const test = evaluate(para, lv.self, lv);
    await cascade(test, lv.self, {quick: true});
    if (test.kd < lv.selfFloor) {
      sound.lose();
      await closeBook();
      book.shake = 1;
      await fallAway();
      openSheet(`<div class="sheet-head"><h3>Removed</h3><span class="kd">self ${formatKd(test.kd)}</span></div>
        <p>This cell also grips your own protein, so the body removes it before it can do harm. Look at the ringed sites: a good contact there must turn bad on the look-alike.</p>
        <div class="actions"><button class="big" id="retry">Change the loops</button></div>`);
      $('#retry').addEventListener('click', retry);
      return;
    }
    float('Ignores self', '', innerWidth / 2, innerHeight * 0.36, 'good', true);
    sound.ring();
    await wait(800);
    for (const l of LOOPS) { book.setResidue('epi', l, lv.epitope[l]); labels.setEpi(l, lv.epitope[l], lv.self[l] !== lv.epitope[l] ? lv.self[l] : null); }
    labels.clearLinks();
    await wait(500);
  }

  coach('Counting every contact.');
  const result = evaluate(para, lv.epitope, lv);
  await cascade(result, lv.epitope);
  const win = result.kd <= lv.target;
  await closeBook();
  if (!win) {
    sound.lose();
    await fallAway();
    const head = result.kd < 1e-3 ? 'Fell off' : 'No grip';
    openSheet(`<div class="sheet-head"><h3>${head}</h3><span class="kd">${formatKd(result.kd)}</span></div>
      <p>It stays on for ${formatDuration(result.residence)}, and the goal is ${formatKd(lv.target)}.</p>
      ${worstPairs(result) ? `<ul>${worstPairs(result)}</ul>` : ''}
      ${freshLine()}
      <div class="actions"><button class="big" id="retry">Change the loops</button></div>`);
    $('#retry').addEventListener('click', retry);
    return;
  }
  sound.win();
  const stars = starsFor(lv, result.kd);
  store.stars[lv.id] = Math.max(store.stars[lv.id] || 0, stars);
  store.lastKd = result.kd;
  save();
  const next = game.index + 1;
  const nextLabel = next < LESSONS.length ? `Next: ${LESSONS[next].title}` : `Next: ${TWO_ARMS.title}`;
  await wait(650);
  openSheet(`<div class="sheet-head"><h3>Bound</h3>${starRow(stars)}</div>
    <p class="kd">K<sub>D</sub> ${formatKd(result.kd)}</p>
    <p>One antibody stays on for ${formatDuration(result.residence)}.</p>
    <p><b>${lv.learned}</b></p>
    ${freshLine()}
    <div class="actions">${stars < 3 ? '<button class="pill" id="retry">Try for 3 stars</button>' : ''}<button class="big" id="next">${nextLabel}</button></div>`);
  $('#next').addEventListener('click', () => (next < LESSONS.length ? startLesson(next) : startArms()));
  if (stars < 3) $('#retry').addEventListener('click', retry);
}

async function retry() {
  coach(`<b>${game.lesson.prompt}</b>`);
  labels.clearLinks();
  await reopenBook();
  for (const l of LOOPS) if (book.residues.para[l]) updatePair(l, game.lesson.epitope, false);
  ruler.set(1e-3);
  game.busy = false;
  $('#bind').disabled = false;
  renderTray();
}

// Germinal center ---------------------------------------------------------
async function startGerminal() {
  const run = newRun();
  game.mode = 'gc';
  game.run = run;
  game.busy = true;
  game.card = null;
  const seed = 70 + Math.floor(Math.random() * 400);
  enterScene('fuchsia', {seed, stretch: [1 + Math.random() * 0.1, 1 + Math.random() * 0.1, 1], lumps: 0.15}, run.epitope);
  $('#bar-title').textContent = 'Germinal center';
  ruler.setFloor(null);
  ruler.set(kdFromEnergy(run.start));
  $('#tray').innerHTML = '';
  coach('Your B cell competes with its neighbors for antigen. Each round it mutates, and only the tightest cells survive. <b>You get no hints here.</b>');
  $('#bind').textContent = 'Mutate';
  $('#bind').disabled = true;
  chapter('Germinal center');
  await swoopIn();
  for (const l of LOOPS) {
    book.setResidue('para', l, run.paratope[l]);
    labels.setPara(l, run.paratope[l], {locked: true});
    updatePair(l, run.epitope, false);
  }
  gcRound();
}

function gcRound() {
  const run = game.run;
  game.cards = offers(run);
  game.card = null;
  ruler.setGoal(kdFromEnergy(required(run)));
  $('#bar-title').textContent = `Round ${run.round} of ${ROUNDS}`;
  coach(`Round ${run.round}: pick one mutation. <b>Reach the green line or the cell is outcompeted.</b>`);
  const tray = $('#tray');
  tray.innerHTML = '';
  tray.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  game.cards.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = `<b>${RESIDUES[c.from].code} to ${RESIDUES[c.to].code}</b><span>loop ${c.loop}</span>`;
    b.addEventListener('click', () => selectCard(i, b));
    tray.append(b);
  });
  $('#bind').disabled = true;
  game.busy = false;
}

function selectCard(i, el) {
  if (game.busy) return;
  document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  LOOPS.forEach(l => labels.lit(l, false));
  game.card = i;
  labels.lit(game.cards[i].loop, true);
  sound.pick();
  $('#bind').disabled = false;
}

async function gcApply() {
  const run = game.run;
  const offer = game.cards[game.card];
  game.busy = true;
  $('#bind').disabled = true;
  labels.lit(offer.loop, false);
  const before = evaluate(run.paratope, run.epitope, {ring: true});
  const para = mutant(run, offer);
  const after = evaluate(para, run.epitope, {ring: true});
  run.paratope = para;
  book.setResidue('para', offer.loop, offer.to);
  labels.setPara(offer.loop, offer.to, {locked: true});
  sound.place();
  updatePair(offer.loop, run.epitope, false);
  LOOPS.forEach(l => updatePair(l, run.epitope, false));
  await wait(260);
  const delta = after.total - before.total;
  const p = labels.mid[offer.loop];
  const good = delta < 0;
  (good ? sound.pluck(run.round + 2) : sound.bad());
  float(after.pairs[offer.loop].kind ? INTERACTIONS[after.pairs[offer.loop].kind].name : '', delta ? signed(delta) : '', p.x, p.y, good ? 'good' : delta > 0 ? 'bad' : 'neutral');
  discover(after.pairs[offer.loop].kind);
  if (after.sealed && !before.sealed) { discover('ring'); sound.ring(); pulse(labels.mid[CORE].x, labels.mid[CORE].y); }
  ruler.set(after.kd);
  await wait(900);
  if (after.total > required(run)) { gcEnd(false, after); return; }
  sound.ring();
  run.round++;
  if (run.round > ROUNDS) { gcEnd(true, after); return; }
  float('Selected', '', innerWidth / 2, innerHeight * 0.36, 'good', true);
  await wait(650);
  gcRound();
}

async function gcEnd(win, result) {
  const first = kdFromEnergy(game.run.start);
  const gain = first / result.kd;
  const gainText = gain >= 2 ? `${gain >= 100 ? Math.round(gain).toLocaleString('en-US') : gain.toFixed(1)} times tighter than where you began` : 'about where you began';
  if (!store.bestGc || result.kd < store.bestGc) { store.bestGc = result.kd; save(); }
  await closeBook();
  if (win) sound.win(); else { sound.lose(); await fallAway(); }
  await wait(500);
  game.mode = 'done';
  const rounds = win ? ROUNDS : game.run.round - 1;
  openSheet(`<div class="sheet-head"><h3>${win ? 'Plasma cell' : 'Outcompeted'}</h3><span class="kd">${formatKd(result.kd)}</span></div>
    <p>${win ? 'Your clone won every round. It now leaves the germinal center and makes antibody by the thousand each second.' : `Your cell survived ${rounds} of ${ROUNDS} rounds. Without help from T cells, it dies and its neighbors take over.`}</p>
    <p>That is ${gainText}. Real affinity maturation often gains a hundredfold or more.</p>
    <div class="actions"><button class="pill" id="to-title">Title</button><button class="big" id="again">Start a new cell</button></div>`);
  $('#again').addEventListener('click', startGerminal);
  $('#to-title').addEventListener('click', goTitle);
}

$('#bind').addEventListener('click', () => (game.mode === 'gc' ? gcApply() : bind()));

// Tapping during the count speeds it up.
addEventListener('pointerdown', () => { if (game.counting) game.speed = 3; });

// Two arms ----------------------------------------------------------------
async function startArms() {
  game.mode = 'arms';
  game.busy = true;
  closeOverlays();
  show('#title', false);
  hud(true);
  show('#tray', true);
  $('#tray').innerHTML = '';
  $('#bind').hidden = true;
  labels.setVisible(false);
  labels.clearLinks();
  book.setAntigen(null);
  $('#bar-title').textContent = `${LESSONS.length + 1}. ${TWO_ARMS.title}`;
  ruler.setGoal(null);
  ruler.setFloor(null);
  coach(`${TWO_ARMS.intro} <b>${TWO_ARMS.prompt}</b>`);
  setPalette('night');
  chapter(TWO_ARMS.title);
  game.cleanUp = await runTwoArms({book, stage, sound, ruler, coach, wait, tween, aim, useView, float, pulse, kd: store.lastKd || 2e-8});
  store.armsDone = true;
  save();
  $('#bind').hidden = false;
  game.mode = 'done';
  game.busy = false;
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="sheet-head"><h3>You finished the lessons</h3></div>
    <p><b>${TWO_ARMS.learned}</b></p>
    <p>The tails left sticking out are how an antibody signals a phagocyte to swallow what it has coated.</p>
    <div class="actions"><button class="pill" id="to-title">Title</button><button class="big" id="gc">Try the germinal center</button></div>`;
  show('#dock', false);
  show('#sheet');
  $('#gc').addEventListener('click', startGerminal);
  $('#to-title').addEventListener('click', goTitle);
}

// Main loop ---------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, raw);
  const time = now / 1000;
  for (const tw of tweens) {
    tw.t = Math.min(1, tw.t + raw * 1000 * game.speed / tw.ms);
    tw.fn(tw.t);
    if (tw.t >= 1) { tweens.delete(tw); tw.resolve(); }
  }
  book.tick(dt, time);
  crowd.tick(dt);
  syncCamera(Math.min(raw, 0.25));
  labels.update();
  stage.render(time, dt);
  if (raw < 0.5 && !window.__lockQuality) stage.watchSpeed(raw);
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}

window.__game = {game, book, store, view, stage};
syncSound();
goTitle();
view.dist = view.goalDist;
view.look.copy(view.goalLook);
stage.setPalette('lagoon', 0);
requestAnimationFrame(frame);
