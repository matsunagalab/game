// The frame of the game: title, chapter menu, the zoom into a pane, and what each chapter leaves in the window.
import { Rose } from './window.js';
import { Sound } from './audio.js';
import { CHAPTERS, GLASS, MITOSIS_GLASS, WAKES, CENTROSOME } from './chapters.js';
import { Stage, text, JEWEL, extent, clamp } from './kit.js';
import { newCell, hourOf, atpOf, cyclinOf, delayHours } from './logic/cell.js';
import Signal from './ch/signal.js';
import Transcribe from './ch/transcribe.js';
import Translate from './ch/translate.js';
import Target from './ch/target.js';
import Energy from './ch/energy.js';
import Ions from './ch/ions.js';
import Motors from './ch/motors.js';
import Division from './ch/division.js';

const CLASSES = { signal: Signal, transcribe: Transcribe, translate: Translate, target: Target, energy: Energy, ions: Ions, motors: Motors, division: Division };
const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'molecular-biology-of-the-cell-learner-v2';
const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6"/></svg>';

function along(a, b, t, bow = 0.05) {
  const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
  const s = Math.sin(t * Math.PI) * bow;
  return { x: a.x + dx * t - (dy / len) * s, y: a.y + dy * t + (dx / len) * s };
}

class Game {
  constructor() {
    this.rose = new Rose($('gl'));
    this.stage = new Stage($('stage'));
    this.sound = new Sound();
    this.save = { best: {}, muted: false, run: {}, cell: newCell(), broke: {} };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {}); } catch { /* A broken save just starts fresh. */ }
    this.sound.muted = !!this.save.muted;
    this.mode = 'title';
    this.clock = 0;
    this.play = null;
    this.bind();
    this.rose.paint(GLASS);
    this.lightWindow();
    this.showTitle();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  get cell() { return this.save.cell; }

  store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* Private browsing can refuse storage. */ } }

  screens(...on) {
    ['title', 'chapters', 'hud', 'brief', 'done', 'drug'].forEach((id) => { $(id).hidden = !on.includes(id); });
    const show = on.some((id) => ['chapters', 'brief', 'done', 'drug'].includes(id));
    $('cellbar').hidden = !show || !this.anyCell();
    $('cellbar').classList.toggle('under', on.includes('chapters'));
    if (!$('cellbar').hidden) this.paintCellBar();
  }

  anyCell() { const c = this.cell; return c.cyclin !== null || c.atp !== null || c.vm !== null || c.misfold > 0; }

  // What the molecules have done so far to this one cell.
  paintCellBar() {
    const c = this.cell;
    const bar = (v) => `<i><b style="width:${Math.round(clamp(v) * 100)}%"></b></i>`;
    const chip = (label, value, b) => `<div><span>${label}</span><strong>${value}</strong>${b ?? ''}</div>`;
    const cy = c.cyclin === null ? 'not yet' : c.cyclin >= 0.7 ? 'high' : c.cyclin >= 0.4 ? 'fair' : 'low';
    $('cellbar').innerHTML = chip('Cyclin D', cy, c.cyclin === null ? '' : bar(c.cyclin))
      + chip('ATP stock', c.atp === null ? 'not yet' : `${Math.round(c.atp)}`, c.atp === null ? '' : bar(c.atp / 100))
      + chip('Voltage', c.vm === null ? 'not yet' : `${Math.round(c.vm)} mV`, c.vm === null ? '' : bar(-c.vm / 70))
      + chip('Misfolded', String(c.misfold), '')
      + (c.swell > 0.25 ? chip('Cell', 'swollen', '') : '');
  }

  nextIndex() {
    const i = CHAPTERS.findIndex((c) => !this.save.best[c.id]);
    return i < 0 ? 0 : i;
  }

  // Panes that have been played stay lit, and the rest wait in grey.
  lightWindow() {
    const lit = this.rose.u.uLit.value;
    const done = (id) => !!this.save.best[id];
    for (let i = 0; i < 16; i++) lit[i] = WAKES[i] ? (done(WAKES[i]) ? 1 : 0.28) : 1;
    const n = Object.keys(this.save.best).length;
    lit[0] = 0.5 + 0.5 * n / CHAPTERS.length; // The cytosol warms with each chapter.
    const { cell } = this;
    if (done('energy')) lit[5] = 0.35 + 0.65 * clamp(atpOf(cell) / 70); // Mitochondria glow with the stock of ATP.
    this.rose.u.uRim.value = cell.vm !== null ? 0.8 + 0.45 * clamp(-cell.vm / 65) : done('signal') ? 1 : 0.7;
    this.rose.swell = 1 + 0.1 * cell.swell;
  }

  look(x, y, k) { Object.assign(this.rose.want, { x, y, k }); }

  // Keep the chapter's pane clear of the sheet: above it on a phone, beside it on a wide screen.
  showPane(ch, k) {
    const wide = innerWidth > innerHeight;
    if (wide) this.look(ch.pane.x * 0.6 + 0.42, ch.pane.y * 0.6, k);
    else this.look(ch.pane.x * 0.6, ch.pane.y - 0.6, k);
  }

  // The window goes back to the living cell after the division.
  restoreGlass() {
    // A close view leaves the window's texture blank on some drivers, so paint it afresh on the way back.
    if (this.splitGlass || this.staleGlass) { this.rose.paint(GLASS); this.splitGlass = false; this.staleGlass = false; }
    this.rose.split = 0;
  }

  showTitle() {
    this.mode = 'title';
    this.play = null;
    this.look(0, 0, 1);
    this.restoreGlass();
    this.rose.stageMat.uniforms.uAmt.value = 0;
    this.rose.u.uFocus.value.set(0, 0, 0);
    this.screens('title');
    const n = Object.keys(this.save.best).length;
    $('begin').textContent = n === 0 ? 'Enter the cell' : n >= CHAPTERS.length ? 'Enter again' : `Go on to chapter ${this.nextIndex() + 1}`;
  }

  showChapters() {
    this.mode = 'chapters';
    this.play = null;
    this.look(0, innerHeight > innerWidth ? -0.2 : 0, 1);
    this.restoreGlass();
    this.rose.stageMat.uniforms.uAmt.value = 0;
    this.rose.u.uStress.value = 0;
    this.rose.u.uFocus.value.set(0, 0, 0);
    this.lightWindow();
    this.screens('chapters');
    const next = this.nextIndex();
    $('petals').replaceChildren(...CHAPTERS.map((c, i) => {
      const got = this.save.best[c.id];
      const li = document.createElement('li');
      li.className = got ? 'done' : i === next ? 'next' : '';
      const b = document.createElement('button');
      b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${c.title}<small>${c.molecule}</small></span><span class="r" aria-label="${got ? `${got} of 3 roses` : 'Not played yet'}">${got ? '❀'.repeat(got) : ''}</span>`;
      b.addEventListener('click', () => this.open(i));
      li.append(b);
      return li;
    }));
  }

  carryLine(id) {
    const r = this.save.run; const { cell } = this;
    const cy = cyclinOf(cell);
    const late = delayHours(cy);
    switch (id) {
      case 'transcribe': return cell.cyclin === null ? '' : cy >= 0.7 ? 'From the last chapter: ERK stayed on, Fos survived, and this gene is wide open.' : 'From the last chapter: ERK fell too soon and Fos fell apart, so this gene is barely on.';
      case 'translate': return r.mrna ? `From the last chapter: your own transcript${r.mrnaErrors ? `, with ${r.mrnaErrors} wrong base${r.mrnaErrors > 1 ? 's' : ''} left in` : ', free of mistakes'}, in ${cell.copies ?? 1} cop${cell.copies === 1 ? 'y' : 'ies'}.` : '';
      case 'target': return r.wrongAA !== undefined ? (r.wrongAA ? `From the last chapter: ${r.wrongAA} wrong amino acid${r.wrongAA > 1 ? 's' : ''}. A misfolded chain will need Hsp70.` : 'From the last chapter: your protein is correct and folds well.') : '';
      case 'energy': return late ? `Too little cyclin D has held this cell in G1 for ${late} more hours, waiting. The clock has moved on.` : (r.sorted !== undefined ? 'From the last chapter: the ER is busy, and all of that building burns ATP.' : '');
      case 'ions': return cell.atp !== null ? `From the last chapter: an ATP stock of ${Math.round(cell.atp)}.${cell.atp < 40 ? ' That is thin, so the pump will wait for ATP.' : ' Each pump cycle spends some.'}` : '';
      case 'motors': return cell.atp !== null ? `ATP stock ${Math.round(cell.atp)}.${cell.atp < 40 ? ' ATP will come rarely, and the motor will often stand in rigor.' : ' Each step spends a little.'}${cell.swell > 0.25 ? ' The cell is still swollen.' : ''}` : '';
      case 'division': return `${late ? `Hour ${hourOf(7, cell)}: ${late} hours late, for want of cyclin D. ` : ''}${r.steps ? `${r.steps} kinesin steps delivered TGF-α. ` : ''}The cell has grown and copied its DNA.`;
      default: return '';
    }
  }

  open(i) {
    this.index = i;
    const ch = CHAPTERS[i];
    this.ch = ch;
    this.mode = 'brief';
    this.play = null;
    this.showPane(ch, 0.72);
    this.restoreGlass();
    this.rose.stageMat.uniforms.uAmt.value = 0;
    this.rose.u.uStress.value = 0;
    this.rose.u.uFocus.value.set(ch.pane.x, ch.pane.y, 1);
    const hour = `Hour ${hourOf(i, this.cell)}`;
    $('bnum').textContent = `${hour} of the day · chapter ${i + 1} of ${CHAPTERS.length}`;
    $('btitle').textContent = ch.title;
    $('bmol').textContent = ch.molecule;
    $('blede').textContent = ch.lede;
    $('bgoal').textContent = ch.goal;
    $('bgoals').replaceChildren(...ch.roses.map((r) => { const li = document.createElement('li'); li.textContent = r; return li; }));
    $('bcarry').textContent = this.carryLine(ch.id);
    $('bcarry').hidden = !$('bcarry').textContent;
    $('cnum').textContent = `${hour} · ${ch.molecule}`;
    $('ctitle').textContent = ch.title;
    this.screens('brief');
    $('brief').scrollTop = 0;
  }

  // Powers of ten: fall through the pane towards a single molecule.
  dive() {
    const ch = this.ch;
    this.mode = 'zoom';
    this.zoomT = 0;
    this.screens();
    this.play = new CLASSES[ch.id](this);
    this.staleGlass = true;
    this.look(ch.pane.x, ch.pane.y, ch.pane.k);
    this.sound.whoosh(true);
  }

  startPlay() {
    this.mode = 'play';
    this.rose.stageMat.uniforms.uAmt.value = 1;
    this.screens('hud');
    $('meters').replaceChildren();
    this.meterCache = '';
    this.play.begin?.();
  }

  say(s) { if ($('say').textContent !== s) $('say').textContent = s; }

  meters(list) {
    const key = JSON.stringify(list);
    if (key === this.meterCache) return;
    this.meterCache = key;
    $('meters').innerHTML = list.map((m) => `<div><dt>${m.label}</dt><dd>${m.value ?? ''}</dd>${m.bar !== undefined ? `<i><b style="width:${Math.round(clamp(m.bar) * 100)}%;${m.color ? `background:${m.color}` : ''}"></b></i>` : ''}</div>`).join('');
  }

  chapterDone(r) {
    this.result = r;
    const ch = this.ch;
    const won = r.roses > 0;
    const { cell: changes, ...rest } = r.carry;
    this.save.run = { ...this.save.run, ...rest };
    if (ch.id === 'signal') { Object.assign(this.cell, newCell()); this.save.run = { erk: rest.erk }; } // A new signal starts a new day.
    Object.assign(this.cell, changes);
    if (won) this.save.best[ch.id] = Math.max(this.save.best[ch.id] ?? 0, r.roses);
    this.store();
    this.mode = 'out';
    this.outT = 0;
    this.rose.paint(GLASS);
    this.staleGlass = false;
    this.screens();
    if (won) this.sound.fanfare();
  }

  // After the fade: the drug beat, and after the last chapter the circle closes.
  afterOut() {
    const ch = this.ch;
    if (this.result.roses > 0 && ch.drugs?.length) { this.drugIndex = 0; this.showDrug(); } else this.afterDrugs();
  }

  undelivered() { return !!this.save.best.motors && !this.cell.delivered; }

  afterDrugs() {
    this.drugFx = null;
    this.drugActive = false;
    this.rose.u.uStress.value = 0;
    if (this.result.split) { this.mode = 'circle'; this.circleT = 0; this.screens(); this.lightWindow(); return; }
    this.showDone();
  }

  showDrug() {
    const ch = this.ch; const d = ch.drugs[this.drugIndex];
    this.mode = 'drug';
    this.drugFx = null;
    this.drugActive = true;
    this.lightWindow();
    this.drugT = 0;
    this.look(0, innerHeight > innerWidth ? -0.5 : 0, innerHeight > innerWidth ? 1 : 1);
    if (innerWidth > innerHeight) this.look(0.42, 0, 0.92);
    $('dgnum').textContent = 'Break it';
    $('dgname').textContent = d.name;
    $('dgwhat').textContent = d.what;
    $('dgq').textContent = d.q;
    $('dgopts').replaceChildren(...d.options.map((o, i) => {
      const b = document.createElement('button');
      b.className = 'dopt';
      b.textContent = o.t;
      b.addEventListener('click', () => this.pickDrug(i));
      return b;
    }));
    $('dgwhy').hidden = true;
    $('dgnext').hidden = true;
    $('dgskip').hidden = false;
    this.screens('drug');
    $('drug').scrollTop = 0;
  }

  pickDrug(i) {
    const d = this.ch.drugs[this.drugIndex]; const o = d.options[i];
    [...$('dgopts').children].forEach((b, n) => { b.disabled = true; b.classList.toggle('right', !!d.options[n].ok); b.classList.toggle('wrong', n === i && !o.ok); });
    $('dgwhy').textContent = `${o.ok ? 'Yes. ' : 'No. '}${o.why}`;
    $('dgwhy').hidden = false;
    $('dgnext').hidden = false;
    $('dgskip').hidden = true;
    $('dgnext').textContent = this.drugIndex + 1 < this.ch.drugs.length ? 'Next drug' : 'Go on';
    this.save.broke[`${this.ch.id}${this.drugIndex}`] = !!o.ok;
    this.store();
    this.drugFx = { ...d.fx, t: 0 };
    if (o.ok) this.sound.bell(7, 0.2); else this.sound.tick(-9, 0.14);
  }

  nextDrug() {
    this.drugIndex += 1;
    if (this.drugIndex < this.ch.drugs.length) this.showDrug(); else this.afterDrugs();
  }

  showDone() {
    const ch = this.ch; const r = this.result; const won = r.roses > 0;
    this.mode = 'done';
    if (!r.split) { this.lightWindow(); this.showPane(ch, 0.8); }
    $('roses').innerHTML = [0, 1, 2].map((i) => `<i class="${i < r.roses ? 'on' : ''}" style="animation-delay:${i * 0.2}s"></i>`).join('');
    $('dtitle').textContent = won ? ch.title : 'Not this time';
    $('dscore').textContent = won ? r.score : r.lost;
    $('deffect').textContent = !won ? '' : ch.id === 'division' && this.undelivered() ? 'Two daughter cells, each with a full set of chromosomes. No TGF-α reached the surface, so the next day waits for a signal from outside.' : ch.effect;
    $('dterm').textContent = won ? ch.term : '';
    $('dmore').hidden = !won;
    $('dmore').open = false;
    $('dnote').textContent = ch.note;
    $('dsrc').textContent = `Sources: ${ch.sources}`;
    $('dnext').textContent = !won ? 'Try again' : this.index + 1 < CHAPTERS.length ? `Chapter ${this.index + 2}: ${CHAPTERS[this.index + 1].title}` : 'See the window';
    $('dagain').hidden = !won;
    this.screens('done');
    $('done').scrollTop = 0;
  }

  bind() {
    const on = (id, fn) => $(id).addEventListener('click', () => { this.sound.unlock(); fn(); });
    on('begin', () => { const n = Object.keys(this.save.best).length; if (n === 0) this.open(0); else this.showChapters(); });
    on('bgo', () => this.dive());
    on('bback', () => this.showChapters());
    on('dback', () => this.showChapters());
    on('dnext', () => {
      const won = this.result?.roses > 0;
      if (won && this.index + 1 < CHAPTERS.length) this.open(this.index + 1);
      else if (!won) this.open(this.index);
      else this.showChapters();
    });
    on('dagain', () => this.open(this.index));
    on('dgnext', () => this.nextDrug());
    on('dgskip', () => this.afterDrugs());
    on('sound', () => this.toggleSound());
    document.querySelectorAll('[data-title]').forEach((b) => b.addEventListener('click', () => this.showTitle()));
    document.querySelectorAll('[data-chapters]').forEach((b) => b.addEventListener('click', () => this.showChapters()));
    // On touch screens only the end of a tap counts as permission to play sound.
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, () => this.sound.unlock(), { capture: true });
    const resize = () => {
      this.rose.resize(); this.stage.resize();
      if (this.play && this.ch) this.paintStage();
    };
    addEventListener('resize', resize);
    addEventListener('orientationchange', () => setTimeout(resize, 200));
    this.paintSound();
    const c = $('stage');
    const at = (e) => this.stage.toVirtual(e.clientX, e.clientY);
    c.addEventListener('pointerdown', (e) => {
      if (this.mode === 'zoom') { this.zoomT = 9; return; }
      if (this.mode === 'chapters') { this.tapPane(e); return; }
      if (this.mode === 'play' && !this.play.over) { const p = at(e); try { c.setPointerCapture(e.pointerId); } catch { /* Synthetic events have no capture. */ } this.play.pointer('down', p.x, p.y, e.pointerId); }
    });
    c.addEventListener('pointermove', (e) => {
      this.rose.pointer.x = (e.clientX / innerWidth - 0.5) * 2;
      this.rose.pointer.y = -(e.clientY / innerHeight - 0.5) * 2;
      if (this.mode === 'play' && !this.play.over) { const p = at(e); this.play.pointer('move', p.x, p.y, e.pointerId); }
    });
    const up = (e) => { if (this.mode === 'play' && !this.play.over) { const p = at(e); this.play.pointer('up', p.x, p.y, e.pointerId); } };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => { if (this.mode === 'play' && !this.play.over) this.play.key(e.key); });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  tapPane(e) {
    const p = this.rose.fromScreen(e.clientX, e.clientY);
    const hit = CHAPTERS.map((c, i) => [Math.hypot(p.x - c.pane.x, p.y - c.pane.y), i]).sort((a, b) => a[0] - b[0])[0];
    if (hit[0] < 0.17) this.open(hit[1]);
  }

  paintSound() {
    $('sound').innerHTML = this.sound.muted ? SPEAKER_OFF : SPEAKER_ON;
    $('sound').setAttribute('aria-label', this.sound.muted ? 'Turn sound on' : 'Turn sound off');
  }

  toggleSound() {
    this.sound.setMuted(!this.sound.muted);
    this.save.muted = this.sound.muted;
    this.store();
    this.paintSound();
  }

  paintStage() {
    const { stage } = this;
    this.rose.paintStage(this.play.glass, [stage.left / 100, stage.bottomEdge / 100, (stage.right - stage.left) / 100, (stage.topEdge - stage.bottomEdge) / 100]);
  }

  // The living cell: what finished chapters keep doing in the window, and what a drug takes away.
  life(dt) {
    const { rose, clock, cell } = this;
    const fx = this.drugFx;
    if (fx) fx.t += dt;
    const played = (id) => !!this.save.best[id] || !!this.drugActive;
    const stopped = (id) => fx?.stop?.includes(id) && fx.t > 0.5;
    const done = (id) => played(id) && !stopped(id);
    const beads = [];
    const run = (from, to, n, speed, c, s = 2.4) => {
      for (let i = 0; i < n; i++) {
        const t = ((clock * speed + i / n) % 1);
        beads.push({ ...along(from, to, t, 0.08), c, s });
      }
    };
    const P = { rim: { x: 0.78, y: 0.42 }, nuc: { x: -0.3, y: -0.26 }, ribo: { x: -0.66, y: 0.42 }, er: { x: -0.62, y: -0.1 }, gol: { x: 0.44, y: 0 }, mito: { x: 0.68, y: -0.42 } };
    const cy = cyclinOf(cell);
    rose.beginRibbons();
    if (done('motors') || fx?.frozen) {
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + 0.4;
        const to = { x: 0.9 * Math.cos(a), y: 0.9 * Math.sin(a) };
        rose.ribbon(CENTROSOME, to, 0.024, [0.03, 0.03, 0.05], 1, 0.03);
        rose.ribbon(CENTROSOME, to, 0.011, fx?.frozen ? [0.5, 0.85, 1] : [0.96, 0.9, 0.72], 1, 0.03);
        if (done('motors')) run(CENTROSOME, to, 2, 0.09 + i * 0.006, [0.4, 1, 0.8], 2.6);
      }
    }
    rose.endRibbons();
    if (done('signal')) run(P.rim, P.nuc, 1 + Math.round(3 * cy), 0.11, [1, 0.82, 0.3]);
    if (done('transcribe')) run(P.nuc, P.ribo, cell.copies ?? 2, 0.09, [1, 1, 0.8]);
    if (done('translate')) run(P.ribo, P.er, 3, 0.1, [1, 0.6, 0.25]);
    if (done('target')) { run(P.er, P.gol, 3, 0.08, [0.5, 1, 0.8]); run(P.gol, P.rim, 3, 0.08, [0.6, 1, 0.5]); }
    if (done('energy')) {
      const n = Math.round(4 + 8 * clamp(atpOf(cell) / 70));
      for (let i = 0; i < n; i++) { const a = i * 2.4; const t = (clock * 0.12 + i * 0.1) % 1; beads.push({ x: P.mito.x + Math.cos(a) * t * 0.5, y: P.mito.y + Math.sin(a) * t * 0.5, c: [1, 0.35, 0.3], s: 2 * (1 - t) + 0.6 }); }
    }
    if (done('ions')) for (let i = 0; i < 16; i++) { const a = i * 0.39; const w = Math.sin(clock * 1.2 + i * 2) * 0.03; beads.push({ x: (0.965 + w) * Math.cos(a), y: (0.965 + w) * Math.sin(a), c: i % 2 ? [0.7, 0.6, 1] : [1, 0.9, 0.4], s: 1.8 }); }
    // Cyclin D gathers round the nucleus, and misfolded protein collects as ruby clumps.
    if (cell.cyclin !== null) for (let i = 0; i < Math.round(cy * 9); i++) { const a = i * 0.7 + clock * 0.25; beads.push({ x: P.nuc.x + Math.cos(a) * 0.45, y: P.nuc.y + Math.sin(a) * 0.43, c: [1, 0.86, 0.35], s: 2.2 }); }
    const clumps = Math.min(8, cell.misfold * 3 + (fx?.ruby ? Math.min(14, fx.t * 6) : 0));
    for (let i = 0; i < clumps; i++) { const a = i * 2.1; beads.push({ x: 0.1 + Math.cos(a) * (0.12 + i * 0.05), y: -0.45 + Math.sin(a) * (0.1 + i * 0.03), c: [1, 0.18, 0.2], s: 3 }); }
    rose.setBeads(beads);
    if (fx) {
      const f = clamp((fx.t - 0.5) / 2.2);
      const lit = rose.u.uLit.value;
      for (const i of fx.dim ?? []) lit[i] = Math.min(lit[i], 1 - 0.8 * f);
      if (fx.rim !== undefined) rose.u.uRim.value = 1 + (fx.rim - 1) * f;
      if (fx.swell) rose.swell = 1 + fx.swell * f;
      rose.u.uStress.value = (fx.stress ?? 0) * f;
    } else if (this.mode !== 'done') rose.u.uStress.value = 0;
  }

  // Each daughter keeps a full set of chromosomes.
  splitBeads() {
    const beads = [{ x: 0, y: 0.76, c: [1, 0.8, 0.3], s: 7 }, { x: 0, y: -0.76, c: [1, 0.8, 0.3], s: 7 }];
    const stuck = this.mode === 'drug' && this.drugFx?.arrest;
    const y = stuck ? 0.05 : 0.36;
    for (const side of [1, -1]) for (let i = 0; i < 5; i++) beads.push({ x: (i - 2) * 0.13, y: side * (y + Math.sin(i * 2) * 0.03), c: stuck ? [1, 0.42, 0.6] : [0.45, 1, 0.75], s: 3.6 });
    // The day's product comes back round: TGF-α is cut from one surface and lands on a receptor.
    if ((this.mode === 'circle' || this.mode === 'done') && !this.undelivered()) {
      for (let i = 0; i < 10; i++) {
        const t = (this.clock * 0.28 + i * 0.1) % 1;
        const side = i % 2 ? 1 : -1;
        beads.push({ x: -0.34 + (i % 5) * 0.17, y: side * (0.1 - t * 0.04 + 0.0) * (1 - t) + side * 0.02, c: [0.4, 1, 0.65], s: 2.8 });
      }
    }
    this.rose.beginRibbons();
    this.rose.endRibbons();
    this.rose.setBeads(beads);
  }

  // Little enamel molecules inlaid in the panes of the map.
  drawInlays() {
    const { stage } = this;
    const c = stage.c;
    stage.enter();
    CHAPTERS.forEach((ch) => {
      if (ch.id === 'division') return;
      const s = this.rose.toScreen(ch.pane.x, ch.pane.y);
      const v = stage.toVirtual(s.x, s.y);
      const size = this.rose.toScreen(ch.pane.x + 0.11, ch.pane.y).x - s.x;
      const ex = extent(ch.icon);
      const k = (size * 1.7 / stage.s) / Math.max(ex.w, ex.h);
      const lit = !!this.save.best[ch.id];
      c.globalAlpha = lit ? 1 : 0.55;
      stage.mol(ch.icon, v.x - ex.cx * k, v.y - ex.cy * k, { k, colors: ch.iconColors });
      c.globalAlpha = 1;
    });
  }

  update(dt) {
    this.clock += dt;
    const { stage, rose } = this;
    stage.clear();
    if (this.mode === 'zoom') {
      this.zoomT += dt;
      const steps = this.ch.zoom;
      const T = 2.6;
      const f = clamp(this.zoomT / T);
      const i = Math.min(steps.length - 1, Math.floor(f * steps.length));
      stage.enter();
      const c = stage.c;
      text(c, steps[i][0], 195, 300, { size: 26, color: JEWEL.vellum, chip: true });
      text(c, steps[i][1], 195, 338, { size: 20, color: JEWEL.gold, chip: true });
      const amt = clamp((f - 0.72) / 0.28);
      rose.stageMat.uniforms.uAmt.value = amt;
      if (amt > 0 && !this.painted) { this.paintStage(); this.painted = true; }
      if (f >= 1) { this.painted = false; this.startPlay(); }
    } else if (this.mode === 'out') {
      // Linger on the finished scene, then pull back out to the window.
      this.outT += dt;
      const wait = this.result.hold ?? 0.7;
      stage.enter();
      stage.c.globalAlpha = clamp(1 - (this.outT - wait) / 0.5);
      this.play.draw(stage.c);
      stage.c.globalAlpha = 1;
      if (this.outT > wait) {
        if (!this.result.split) this.look(this.ch.pane.x, this.ch.pane.y, 0.5);
        rose.stageMat.uniforms.uAmt.value = clamp(1 - (this.outT - wait) / 0.8);
        rose.u.uStress.value = 0;
        if (this.result.roses > 0) this.lightWindow();
      }
      if (this.result.split && this.outT > wait) {
        if (!this.splitGlass) { rose.paint(MITOSIS_GLASS); this.splitGlass = true; this.look(0, 0, innerWidth > innerHeight ? 0.9 : 0.72); for (let i = 0; i < 16; i++) rose.u.uLit.value[i] = 1; this.sound.fanfare(); }
        const s = clamp((this.outT - wait - 1) / 2.6);
        rose.split = s * s * (3 - 2 * s);
      }
      if (this.outT > wait + (this.result.split ? 5.8 : 1.1)) this.afterOut();
    } else if (this.mode === 'play') {
      stage.enter();
      this.play.ui.begin();
      this.play.frame(dt, stage.c);
    } else if (this.mode === 'circle') {
      this.circleT += dt;
      const s = clamp(this.circleT / 1.2);
      rose.split = Math.max(rose.split, s * s * (3 - 2 * s));
      stage.enter();
      const c = stage.c;
      const lines = this.undelivered() ? ['The vesicle stopped short of the surface.', 'No TGF-α can be cut free from this cell.', 'A new day must wait for a signal from outside.'] : [`Hour ${hourOf(7, this.cell) + 1}. ADAM17 cuts TGF-α from the surface.`, 'It lands on EGFR, on this cell and its neighbours.', 'Ras switches on, and a new day begins.'];
      lines.forEach((l, i) => { if (this.circleT > 0.4 + i * 1.5) text(c, l, 195, 300 + i * 30, { size: 17, chip: true, color: i === 2 ? JEWEL.gold : JEWEL.vellum }); });
      if (this.circleT > 5.4) this.showDone();
    } else if (this.mode === 'drug') {
      if (this.splitGlass) {
        const want = this.drugFx?.arrest ? 0 : 1;
        rose.split += (want - rose.split) * Math.min(1, dt * 2.4);
      } else this.drawInlays();
    } else if (this.mode === 'chapters' || this.mode === 'title' || this.mode === 'brief' || this.mode === 'done') {
      if (!this.splitGlass) this.drawInlays();
    }
    if (this.splitGlass) this.splitBeads();
    else if (this.mode !== 'play' && this.mode !== 'zoom') this.life(dt);
    else rose.setBeads([]);
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.rose.frame(now / 1000, dt);
  }
}

try {
  window.game = new Game();
} catch (e) {
  document.body.textContent = 'This game needs WebGL, which this browser could not start.';
  console.error(e);
}
