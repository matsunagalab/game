// Starts the game and moves between the title, the plate and the wells.
import { makeArcade } from './arcade.js';
import { Sound } from './audio.js';
import { ROWS, WELL_IDS, WELLS } from './content.js';
import { Dive } from './dive.js';
import { Orbit } from './orbit.js';
import { Plate } from './plate.js';
import { Play } from './play.js';
import { Stage } from './stage.js';
import { button, el, fmt } from './ui.js';

const SAVE_KEY = 'metalloprotein-learner-v1';
const SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4zM16.5 9a4 4 0 0 1 0 6"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4zM21 9l-5 6M16 9l5 6"/></svg>';

class App {
  constructor(data = {}) {
    this.canvas = document.getElementById('c');
    this.ui = document.getElementById('ui');
    this.stage = new Stage(this.canvas);
    this.sound = new Sound();
    this.orbit = new Orbit(this.stage, this.canvas);
    this.plate = new Plate(this.stage);
    this.best = {};
    this.load();
    Object.assign(this.best, data.best);
    window.claude?.hot?.snapshot?.(() => ({ best: this.best }));
    for (const id of Object.keys(this.best)) this.plate.setSolved(id, true);
    this.mode = 'title';
    this.level = null;
    this.dive = null;
    this.time = 0;
    this.last = performance.now();
    this.stage.onResize = () => this.resized();
    this.orbit.onTap = (x, y) => this.tap(x, y);
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved) return;
      this.best = saved.best ?? {};
      this.sound.muted = !!saved.muted;
    } catch { /* A broken save just starts fresh. */ }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ best: this.best, muted: this.sound.muted }));
    } catch { /* Private browsing can refuse storage. The game still runs. */ }
  }

  record(id, res, score) {
    const old = this.best[id];
    const entry = WELLS[id].kind === 'site' ? { res: Math.min(res, old?.res ?? 9) } : { score: Math.max(score ?? 0, old?.score ?? 0) };
    this.best[id] = entry;
    this.plate.setSolved(id, true);
    this.save();
  }

  soundIcon() {
    return this.sound.muted ? SOUND_OFF : SOUND_ON;
  }

  toggleSound(b) {
    this.sound.setMuted(!this.sound.muted);
    b.innerHTML = this.soundIcon();
    this.save();
  }

  buzz(p) {
    try { navigator.vibrate?.(p); } catch { /* Not every phone allows it. */ }
  }

  nextAfter(id) {
    const i = WELL_IDS.indexOf(id);
    for (let k = 1; k < WELL_IDS.length; k++) {
      const c = WELL_IDS[(i + k) % WELL_IDS.length];
      if (!this.best[c]) return c;
    }
    return null;
  }

  firstOpen() {
    return WELL_IDS.find((id) => !this.best[id]) ?? 'A1';
  }

  clearPages() {
    this.page?.remove();
    this.page = null;
    this.rowLabels?.remove();
    this.rowLabels = null;
  }

  showTitle() {
    this.mode = 'title';
    this.clearPages();
    const p = el('section', 'title');
    p.innerHTML = '<h1>Metalloprotein<br>Learner</h1><p class="lede">Twenty-one real metal sites from the Protein Data Bank, seen between crossed polarizers. Find what holds each metal, name the shape, and bring the protein back to life.</p>';
    p.append(button('go big', Object.keys(this.best).length ? 'Open the plate' : 'Start', () => {
      this.sound.unlock();
      if (Object.keys(this.best).length) this.showPlate();
      else { this.showPlate(); this.select('A1'); this.open('A1'); }
    }));
    this.ui.append(p);
    this.page = p;
    this.plate.fade = 0;
    this.stage.u.uField.value = 1;
    this.stage.u.uFieldCentre.value.set(this.stage.portrait ? 0.5 : 0.68, this.stage.portrait ? 0.68 : 0.5);
    this.stage.camera.position.set(0, 0, this.plate.viewDist);
    this.stage.camera.quaternion.identity();
  }

  showPlate(selected) {
    this.mode = 'plate';
    this.clearPages();
    this.plate.fade = 1;
    this.plate.group.scale.setScalar(1);
    this.plate.layout();
    this.plate.next = this.firstOpen();
    this.stage.u.uField.value = 0.045;
    this.stage.u.uFieldCentre.value.set(0.5, this.stage.portrait ? 0.56 : 0.5);
    this.stage.setLift(0);
    this.orbit.enabled = false;
    this.stage.camera.position.set(0, 0, this.plate.viewDist);
    this.stage.camera.quaternion.identity();
    const p = el('section', 'plate-page');
    const head = el('header', 'plate-head');
    const solved = Object.keys(this.best).length;
    const sites = Object.entries(this.best).filter(([id]) => WELLS[id].kind === 'site').map(([, v]) => v.res);
    const mean = sites.length ? sites.reduce((a, b) => a + b, 0) / sites.length : 0;
    head.innerHTML = `<div><h2>Your plate</h2><p>${solved} of 24 wells solved${sites.length ? `, mean resolution ${mean.toFixed(2)} Å` : ''}</p></div>`;
    head.append(button('icon', this.soundIcon(), (e) => this.toggleSound(e.currentTarget)));
    this.info = el('div', 'plate-info');
    p.append(head, this.info);
    this.ui.append(p);
    this.page = p;
    this.placeRowLabels();
    this.select(selected ?? this.firstOpen());
  }

  // Letters and numbers moulded into the plate, as on a real one.
  placeRowLabels() {
    this.rowLabels?.remove();
    const box = el('div', 'plate-marks');
    this.ui.append(box);
    this.rowLabels = box;
    const { stage, plate } = this;
    const P = new (stage.camera.position.constructor)();
    const V = new (stage.camera.position.constructor)();
    stage.camera.updateMatrixWorld();
    const off = plate.pitchPx() * 0.62;
    const mark = (text, id, dx, dy) => {
      stage.project(plate.wellWorld(id, V), P);
      const m = el('span', '', text);
      m.style.left = `${P.x + dx}px`;
      m.style.top = `${P.y + dy}px`;
      box.append(m);
    };
    for (const r of 'ABCD') stage.portrait ? mark(r, `${r}1`, 0, -off) : mark(r, `${r}1`, -off, 0);
    for (let c = 1; c <= 6; c++) stage.portrait ? mark(c, `A${c}`, -off, 0) : mark(c, `A${c}`, 0, -off);
  }

  select(id) {
    this.plate.selected = id;
    const w = WELLS[id];
    const row = ROWS.find((r) => r.id === id[0]);
    const best = this.best[id];
    const status = best ? (best.res ? `Solved at ${best.res.toFixed(2)} Å` : `Best score ${best.score}`) : (w.kind === 'site' ? 'Empty drop' : 'A quick round');
    this.info.innerHTML = `<p class="row-name">Row ${row.id}, ${row.name}</p><h3><span>${id}</span>${fmt(w.name)}</h3><p class="status">${status}</p>`;
    this.info.append(button('go', best ? 'Open again' : 'Open this well', () => this.open(id)));
  }

  open(id) {
    this.sound.unlock();
    this.endLevel();
    this.clearPages();
    this.stage.u.uField.value = 0;
    const well = WELLS[id];
    this.stage.camera.quaternion.identity();
    if (well.kind === 'arcade') {
      this.mode = 'arcade';
      this.plate.fade = 0;
      this.level = makeArcade(this, id, well);
      return;
    }
    this.plate.fade = 1;
    this.plate.layout();
    this.mode = 'dive';
    this.level = new Play(this, id, well);
    this.dive = new Dive(this, id, this.level.view, () => {
      this.dive = null;
      this.mode = 'site';
      this.level.begin();
    });
  }

  endLevel() {
    if (this.dive) {
      this.dive.finished = true;
      this.dive.dispose();
      this.dive = null;
    }
    this.level?.dispose();
    this.level = null;
    this.orbit.onTap = (x, y) => this.tap(x, y);
  }

  leave() {
    const id = this.level?.id;
    this.endLevel();
    this.showPlate(id);
  }

  tap(x, y) {
    this.sound.unlock();
    if (this.mode === 'plate') {
      const id = this.plate.pick(x, y);
      if (id) {
        this.select(id);
        this.sound.tick();
      }
    } else if (this.mode === 'dive') this.dive?.skip();
    else this.level?.onTap?.(x, y);
  }

  resized() {
    this.plate.layout();
    if (this.mode === 'plate') {
      this.stage.camera.position.set(0, 0, this.plate.viewDist);
      this.placeRowLabels();
    }
    this.level?.lift?.();
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const ms = now - this.last;
    const dt = Math.min(0.05, ms / 1000);
    this.last = now;
    this.time += dt;
    const { stage, time } = this;
    if (document.hidden) return;
    stage.watch(ms);
    stage.easeLift(dt);
    this.dive?.update(dt);
    if (this.mode === 'site') this.orbit.update(dt, stage.camera);
    if (this.mode === 'plate' || this.mode === 'dive' || this.mode === 'title') this.plate.update(dt, time);
    this.level?.update(dt, time);
    stage.render(time);
  }
}

function boot(data) {
  try {
    window.game = new App(data);
  } catch (e) {
    console.error(e);
    document.getElementById('ui').innerHTML = '<section class="sheet"><h2>This game needs WebGL 2</h2><p>Your browser could not start it. Turn on hardware acceleration, or open the game in a current version of Safari or Chrome.</p></section>';
  }
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
