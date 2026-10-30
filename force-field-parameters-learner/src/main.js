import { Stage } from './stage.js';
import { Sound } from './audio.js';
import { UI, typeset } from './ui.js';
import { save, persist, PLATES, TIERS, nextPlate, fiveDone } from './save.js';
import { Front } from './plates/front.js';
import { Pluck, Harp, Well } from './plates/bonds.js';
import { Chord, Step } from './plates/angles.js';
import { Organ, Exposure } from './plates/dihedrals.js';
import { Dimer, Drop } from './plates/vdw.js';
import { Dipole, Liquid } from './plates/charges.js';
import { MapPlate, Fold, showPaper } from './plates/whole.js';

const KINDS = { pluck: Pluck, harp: Harp, well: Well, chord: Chord, step: Step, organ: Organ, expose: Exposure, dimer: Dimer, drop: Drop, dipole: Dipole, liquid: Liquid, map: MapPlate, fold: Fold };
const PARTS = ['Bonds', 'Angles', 'Dihedrals', 'van der Waals', 'Charges', 'Total energy'];
const $ = id => document.getElementById(id);

const TERMS = [
  { name: 'Bonds', sum: 'bonds', expr: '<i>k</i><sub>b</sub>(<i>r</i> − <i>r</i>₀)²' },
  { name: 'Angles', sum: 'angles', expr: '<i>k</i><sub>θ</sub>(<i>θ</i> − <i>θ</i>₀)²' },
  { name: 'Dihedrals', sum: 'dihedrals', expr: '½<i>V<sub>n</sub></i>[1 + cos(<i>nφ</i> − <i>γ</i>)]' },
  { name: 'van der Waals', sum: 'pairs', expr: '4<i>ε</i>[(<i>σ</i>/<i>r</i>)¹² − (<i>σ</i>/<i>r</i>)⁶]' },
  { name: 'Charges', sum: 'pairs', expr: '<i>q<sub>i</sub>q<sub>j</sub></i>/4π<i>ε</i>₀<i>r</i>' },
];

class Game {
  constructor() {
    this.mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    this.sound = new Sound();
    this.sound.muted = !!save.ff.muted;
    this.stage = new Stage($('gl'), { mobile: this.mobile });
    this.ui = new UI(this.sound);
    this.ui.layout = () => this.layout();
    this.plate = null;
    this.buildEquation();
    this.bindInput();
    addEventListener('resize', () => setTimeout(() => this.layout(), 60));
    new ResizeObserver(() => this.layout()).observe($('dock'));
    new ResizeObserver(() => this.layout()).observe($('note'));
    document.fonts?.ready.then(() => { this.ui.rulers.forEach(r => r.draw()); this.layout(); });
    // iOS only starts audio from a completed touch.
    for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => { this.sound.unlock(); this.sound.setProgress(this.termsDone()); }, { passive: true });
    document.addEventListener('visibilitychange', () => { const c = this.sound.ctx; if (c) document.hidden ? c.suspend() : c.resume(); });
    $('back').addEventListener('click', () => this.home());
    $('mute').addEventListener('click', () => this.toggleMute());
    this.showMute();
    $('begin').addEventListener('click', () => { this.sound.unlock(); const n = nextPlate(); n < 0 ? showPaper(this) : this.open(n); });
    this.home(true);
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  buildEquation() {
    const q = $('equation');
    q.innerHTML = '';
    const u = document.createElement('button');
    u.className = 'term u';
    u.innerHTML = `<span class="expr"><i>U</i> =</span><span class="name" data-tier="">Total energy</span>`;
    u.addEventListener('click', () => { this.sound.unlock(); this.openTerm(5); });
    q.append(u);
    this.termButtons = [];
    TERMS.forEach((t, i) => {
      if (i) { const p = document.createElement('span'); p.className = 'plus'; p.textContent = '+'; q.append(p); }
      const b = document.createElement('button');
      b.className = 'term';
      b.innerHTML = `<span class="expr"><span class="sum">Σ</span>${typeset(t.expr)}</span><span class="name" data-tier="">${t.name}</span>`;
      b.addEventListener('click', () => { this.sound.unlock(); this.openTerm(i); });
      q.append(b);
      this.termButtons.push(b);
    });
    this.uButton = u;
  }

  refreshEquation() {
    this.termButtons.forEach((b, i) => {
      const ps = PLATES.filter(p => p.term === i), done = ps.filter(p => save.tiers[p.id]);
      const all = done.length === ps.length;
      b.classList.toggle('done', all);
      const name = b.querySelector('.name');
      name.dataset.tier = all ? `, ${TIERS[Math.min(...ps.map(p => save.tiers[p.id]))].toLowerCase()}` : done.length ? `, ${done.length} of ${ps.length}` : '';
    });
    const ok = fiveDone();
    this.uButton.disabled = !ok;
    this.uButton.querySelector('.name').textContent = ok ? 'Total energy' : 'Finish all five terms';
    $('begin').textContent = nextPlate() === 0 ? 'Start' : nextPlate() < 0 ? 'Read your paper' : 'Continue';
  }

  termsDone() {
    return [0, 1, 2, 3, 4, 5].filter(t => PLATES.filter(p => p.term === t).every(p => save.tiers[p.id])).length;
  }

  openTerm(i) {
    const ps = PLATES.map((p, n) => [p, n]).filter(([p]) => p.term === i);
    const pick = ps.find(([p]) => !save.tiers[p.id]) ?? ps[0];
    this.open(pick[1]);
  }

  home(first) {
    this.leave();
    this.sound.stopAll();
    this.ui.hideHud();
    this.refreshEquation();
    $('front').classList.remove('off');
    this.plate = new Front(this, null);
    this.plate.enter();
    this.stage.setInsets(this.frontInsets());
    this.plate.fit?.();
    this.stage.develop(first ? 0 : 0.2);
  }

  frontInsets() {
    const eq = $('equation').parentElement.getBoundingClientRect(), h1 = document.querySelector('#front p').getBoundingClientRect();
    const landscape = innerWidth > innerHeight * 1.2;
    const title = document.querySelector('#front h1').getBoundingClientRect();
    const short = innerHeight <= 520;
    return { top: short ? title.bottom : landscape ? 0 : h1.bottom, bottom: innerHeight - eq.top + 6, left: landscape && innerWidth > 800 ? innerWidth * 0.34 : 0, right: 0 };
  }

  leave() {
    if (this.plate) { this.plate.exit(); this.sound.stopAll(); }
    this.plate = null;
    this.stage.clear();
  }

  open(i) {
    const meta = PLATES[i];
    this.index = i;
    this.leave();
    $('front').classList.add('off');
    this.ui.plate(meta, PARTS[meta.term]);
    const P = KINDS[meta.id];
    this.plate = new P(this, meta);
    this.plate.enter();
    this.layout();
    this.stage.develop(0);
  }

  // Keep the specimen clear of the header, the note and the controls on every screen shape.
  layout() {
    if (!$('hud').classList.contains('on')) { if (this.plate instanceof Front) { this.stage.setInsets(this.frontInsets()); } return; }
    const w = innerWidth, h = innerHeight;
    const bar = $('bar').getBoundingClientRect(), dock = $('dock').getBoundingClientRect(), n = $('note');
    const side = w > h && h <= 520, wide = w >= 900 && h >= 600;
    const nh = n.getBoundingClientRect().height;
    if (side) {
      n.style.top = 'auto'; n.style.bottom = '8px';
      this.stage.setInsets({ top: bar.bottom + 2, bottom: nh + 12, left: 0, right: dock.width });
    } else if (wide) {
      n.style.top = ''; n.style.bottom = '';
      this.stage.setInsets({ top: bar.bottom + 4, bottom: h - dock.top + 6, left: Math.min(n.getBoundingClientRect().right + 10, w * 0.34), right: 0 });
    } else {
      n.style.top = 'auto'; n.style.bottom = `${h - dock.top + 6}px`;
      this.stage.setInsets({ top: bar.bottom + 4, bottom: h - dock.top + nh + 12, left: 0, right: 0 });
    }
  }

  // A plate reports its result here. The best verdict is kept.
  finish(plate, tier, { comment, lesson, apply, nextLabel, onNext }) {
    const id = plate.meta.id;
    save.tiers[id] = Math.max(save.tiers[id] ?? 0, tier);
    apply?.(save.ff);
    persist();
    this.sound.accept(tier);
    this.sound.setProgress(this.termsDone());
    this.stage.pulse = tier === 3 ? 1.4 : 0.6;
    navigator.vibrate?.(tier === 3 ? [15, 50, 25] : 15);
    const i = PLATES.findIndex(p => p.id === id);
    const last = i === PLATES.length - 1;
    const part = PLATES[i + 1]?.term !== PLATES[i].term;
    this.ui.verdict({
      tier, comment, lesson, nextLabel: nextLabel ?? (last ? 'Read your paper' : part ? 'Back to the equation' : 'Next plate'),
      onStay: () => {},
      onNext: onNext ?? (() => (last ? showPaper(this) : part ? this.home() : this.open(i + 1))),
    });
  }

  toggleMute() {
    this.sound.unlock();
    save.ff.muted = !this.sound.muted;
    this.sound.setMuted(save.ff.muted);
    persist();
    this.showMute();
  }
  showMute() { $('wave').style.display = this.sound.muted ? 'none' : ''; }

  bindInput() {
    const c = $('gl');
    let tilt = false, lx = 0, ly = 0, id = null;
    c.addEventListener('pointerdown', e => {
      this.sound.unlock();
      if (id !== null) return;
      id = e.pointerId;
      try { c.setPointerCapture(id); } catch { /* pointer already gone */ }
      lx = e.clientX; ly = e.clientY;
      const took = this.plate?.down?.(e.clientX, e.clientY);
      tilt = !took;
      this.stage.dragging = tilt;
    });
    c.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      this.plate?.move?.(e.clientX, e.clientY);
      if (tilt) {
        const t = this.stage.tilt;
        t.yaw = Math.max(-0.7, Math.min(0.7, t.yaw - (e.clientX - lx) * 0.006));
        t.pitch = Math.max(-0.5, Math.min(0.5, t.pitch + (e.clientY - ly) * 0.005));
        lx = e.clientX; ly = e.clientY;
      }
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; tilt = false; this.stage.dragging = false;
      this.plate?.up?.();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    // No page zoom, scroll or long-press menu inside the game.
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => { if (e.target === c) e.preventDefault(); });
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    const ms = now - this.last;
    this.last = now;
    try { this.plate?.update?.(dt, now / 1000); } catch (err) { console.error(err); }
    this.ui.frame(this.stage);
    this.stage.render(dt);
    this.stage.adapt(ms);
    requestAnimationFrame(t => this.loop(t));
  }
}

const game = new Game();
window.__game = game;
