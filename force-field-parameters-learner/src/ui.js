// Everything drawn in HTML: the plate header, sliding rulers, reviewer notes and verdicts.
import { TIERS, frcmod } from './save.js';
import { Stops } from './stops.js';

const $ = id => document.getElementById(id);
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3' }, SUP = { '⁻': '−', '⁶': '6', '⁹': '9', '¹': '1', '²': '2', '³': '3' };
// Old Standard lacks most sub- and superscript digits, so they are set as real sub and sup elements.
export const typeset = h => h.replace(/[₀₁₂₃]+/g, m => `<sub>${[...m].map(c => SUB[c]).join('')}</sub>`)
  .replace(/[⁻⁶⁹¹²³]+/g, m => `<sup>${[...m].map(c => SUP[c]).join('')}</sup>`);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = typeset(html); return e; };

// A ruler that slides under a fixed needle, like the dial of an old radio.
// The scale is several screens long, so a thumb can place a value finely with no modifier keys.
export class Ruler {
  constructor(parent, { label, unit = '', min, max, step = 1, value, digits = 1, major, span = 3.2, onInput, onRelease, sound, format, compact = false }) {
    Object.assign(this, { min, max, step, digits, major: major ?? (max - min) / 10, span, onInput, onRelease, sound, format, unit });
    this.value = value; this.vel = 0;
    const root = this.root = el('div', compact ? 'ruler compact' : 'ruler');
    root.tabIndex = 0;
    root.setAttribute('role', 'slider');
    root.setAttribute('aria-label', label.replace(/<[^>]+>/g, ''));
    root.setAttribute('aria-valuemin', min); root.setAttribute('aria-valuemax', max);
    const head = el('div', 'ruler-head');
    head.append(el('span', 'ruler-label', label), this.val = el('output', 'ruler-value'));
    this.cv = el('canvas', 'ruler-scale');
    root.append(head, this.cv, el('i', 'ruler-needle'));
    parent.append(root);
    this.ctx = this.cv.getContext('2d');

    let last = 0, lastT = 0;
    this.cv.addEventListener('pointerdown', e => {
      this.cv.setPointerCapture(e.pointerId);
      this.drag = true; last = e.clientX; lastT = e.timeStamp; this.vel = 0;
      e.preventDefault();
    });
    this.cv.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const dx = e.clientX - last, dt = Math.max(1, e.timeStamp - lastT);
      last = e.clientX; lastT = e.timeStamp;
      this.vel = 0.7 * this.vel + 0.3 * (-dx / this.pxPerUnit() / dt * 16.7);
      this.nudge(-dx / this.pxPerUnit());
    });
    const up = () => { if (this.drag) { this.drag = false; this.onRelease?.(this.value); } };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
    root.addEventListener('keydown', e => {
      const s = e.shiftKey ? this.major : this.step;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { this.nudge(s); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { this.nudge(-s); e.preventDefault(); }
    });
    root.addEventListener('wheel', e => { this.nudge(Math.sign(e.deltaY + e.deltaX) * this.step * 2); e.preventDefault(); }, { passive: false });
    this.resize();
    this.show();
  }
  pxPerUnit() { return this.w * this.span / (this.max - this.min); }
  resize() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    this.w = r.width || 300; this.h = r.height || 44; this.d = d;
    this.cv.width = this.w * d; this.cv.height = this.h * d;
    this.draw();
  }
  nudge(dv) {
    const before = Math.floor(this.value / this.major);
    this.set(this.value + dv);
    if (Math.floor(this.value / this.major) !== before) this.sound?.tick();
    this.onInput?.(this.value);
  }
  set(v) {
    this.value = Math.min(this.max, Math.max(this.min, v));
    this.show();
  }
  show() {
    const v = Math.round(this.value / this.step) * this.step;
    this.val.innerHTML = (this.format ? this.format(v) : v.toFixed(this.digits)).replace('-', '−') + (this.unit ? ` <small>${this.unit}</small>` : '');
    this.root.setAttribute('aria-valuenow', v.toFixed(this.digits));
    this.draw();
  }
  tick() {
    if (this.drag || Math.abs(this.vel) < this.step * 0.05) return;
    this.vel *= 0.93;
    this.nudge(this.vel);
    if (this.value <= this.min || this.value >= this.max) this.vel = 0;
    if (Math.abs(this.vel) < this.step * 0.05) this.onRelease?.(this.value);
  }
  draw() {
    const { ctx, w, h, d, min, max, major } = this;
    if (!ctx) return;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const px = this.pxPerUnit(), minor = major / 5;
    const c = w / 2, first = Math.ceil((this.value - c / px) / minor) * minor;
    ctx.font = `13px "Old Standard TT", serif`;
    ctx.textAlign = 'center';
    for (let t = first; t <= this.value + c / px + minor; t += minor) {
      if (t < min - 1e-6 || t > max + 1e-6) continue;
      const x = c + (t - this.value) * px;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      const fade = 1 - Math.pow(Math.abs(x - c) / c, 3);
      ctx.strokeStyle = `rgba(234,243,244,${(isMajor ? 0.8 : 0.34) * fade})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, h - 2); ctx.lineTo(x, h - (isMajor ? 15 : 8)); ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = `rgba(234,243,244,${0.72 * fade})`;
        const dg = major < 0.1 ? 2 : major < 1 ? 1 : 0;
        ctx.fillText(Math.abs(t) < 1e-9 ? '0' : t.toFixed(dg).replace('-', '−'), x, h - 20);
      }
    }
  }
}

export class UI {
  constructor(sound) {
    this.sound = sound;
    this.rulers = []; this.tags = [];
    this.bar = $('bar'); this.note$ = $('note'); this.dock = $('dock');
    this.readouts$ = $('readouts'); this.rulers$ = $('rulers'); this.actions$ = $('actions');
    this.sendBtn = null;
    this.tmpV = null;
    addEventListener('resize', () => this.rulers.forEach(r => r.resize()));
    $('file').addEventListener('click', () => this.openFile());
    $('file-close').addEventListener('click', () => $('sheet').classList.remove('open'));
    $('file-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(frcmod()); $('file-copy').textContent = 'Copied'; }
      catch { $('file-copy').textContent = 'Select the text to copy it'; }
    });
  }

  openFile() {
    $('file-body').textContent = frcmod();
    $('file-copy').textContent = 'Copy the file';
    $('sheet').classList.add('open');
  }

  // Three goals, shown as pips. The line under them always names the next one.
  goals(list) {
    this.goalList = list;
    const g = $('goals');
    g.style.display = '';
    this.goalTop = 0;
    this.showGoals(0);
  }
  showGoals(t) {
    if (!this.goalList) return;
    const g = $('goals');
    const pips = [1, 2, 3].map(i => `<i class="${t >= i ? 'on' : ''}"></i>`).join('');
    const text = t >= 3 ? 'All three goals met.' : this.goalList[t];
    g.innerHTML = `<span class="pips">${pips}</span><span class="goal-text">${typeset(text)}</span>`;
    this.layout?.();
  }

  // The test board: one lamp per observable, like a continuous-integration dashboard.
  lights(defs) {
    const wrap = el('div', 'lights');
    wrap.dataset.n = defs.length;
    $('custom').append(wrap);
    const out = {};
    for (const [key, label] of defs) {
      const d = el('div', 'light'), lamp = el('b', 'lamp'), v = el('span', 'light-value');
      d.append(lamp, el('span', 'light-label', label), v);
      wrap.append(d);
      let state = -1, cur = '';
      out[key] = {
        set: (html, s) => {
          if (html !== cur) { cur = html; v.innerHTML = typeset(html); }
          if (s === state) return;
          if (state === 2 && s < 2) { d.classList.remove('broke'); void d.offsetWidth; d.classList.add('broke'); this.sound.tick(0.35); }
          if (state >= 0 && s === 2) this.sound.ping(defs.findIndex(x => x[0] === key), 0.1);
          state = s;
          d.dataset.s = s;
        },
        get state() { return state; },
      };
    }
    this.layout?.();
    return out;
  }

  stops(defs) {
    const s = new Stops($('custom'), defs, this.sound);
    this.layout?.();
    return s;
  }

  // Several knobs that share one line: tabs choose which ruler is on show.
  knobs(defs, extra = null) {
    const bar = el('div', 'tabs');
    this.rulers$.append(bar);
    const rs = defs.map(d => this.ruler({ compact: true, ...d }));
    const all = extra ? [...defs, extra] : defs;
    if (extra) this.rulers$.append(extra.el);
    const tabs = all.map((d, i) => {
      const b = el('button', 'tab', d.tab);
      b.addEventListener('click', () => pick(i));
      bar.append(b);
      return b;
    });
    const pick = i => {
      rs.forEach((r, k) => { r.root.style.display = k === i ? '' : 'none'; });
      tabs.forEach((t, k) => t.classList.toggle('on', k === i));
      if (extra) extra.el.style.display = i === defs.length ? '' : 'none';
      if (i < rs.length) rs[i].resize();
      this.layout?.();
    };
    pick(0);
    return rs;
  }

  plate(p, partName) {
    $('hud').classList.add('on');
    $('plate-no').textContent = `Plate ${p.no}, ${partName}`;
    $('plate-title').textContent = p.title;
    this.clear();
  }
  hideHud() { $('hud').classList.remove('on'); this.clear(); }

  clear() {
    this.note$.classList.remove('show');
    this.note$.innerHTML = '';
    this.readouts$.innerHTML = ''; this.rulers$.innerHTML = ''; this.actions$.innerHTML = '';
    $('tags').innerHTML = '';
    $('custom').innerHTML = '';
    $('goals').innerHTML = ''; $('goals').style.display = 'none';
    this.goalList = null;
    this.rulers = []; this.tags = []; this.sendBtn = null;
  }

  // Red pencil from Reviewer 2.
  note(html) {
    const n = this.note$;
    if (n.dataset.text === html) return;
    n.dataset.text = html;
    n.classList.remove('show');
    clearTimeout(this.noteT);
    this.noteT = setTimeout(() => { n.innerHTML = typeset(html); n.classList.add('show'); this.layout?.(); }, n.innerHTML ? 180 : 0);
  }

  ruler(opts) {
    const r = new Ruler(this.rulers$, { sound: this.sound, ...opts });
    this.rulers.push(r);
    this.layout?.();
    return r;
  }

  readout(label) {
    const d = el('div', 'readout');
    const v = el('span', 'readout-value');
    d.append(el('span', 'readout-label', label), v);
    this.readouts$.append(d);
    this.layout?.();
    let cur = '';
    return { set: html => { if (cur !== html) { cur = html; v.innerHTML = typeset(html); } }, root: d };
  }

  button(label, onClick, cls = '') {
    const b = el('button', 'act ' + cls, label);
    b.addEventListener('click', onClick);
    this.actions$.append(b);
    this.layout?.();
    return b;
  }

  // The send button shows what the reviewer would say right now.
  sender(onSend) {
    const b = el('button', 'act send', 'Not ready to send');
    b.disabled = true;
    b.addEventListener('click', () => onSend(this.tier));
    this.actions$.append(b);
    this.sendBtn = b;
    this.tier = 0;
    this.layout?.();
    return b;
  }
  setTier(tier) {
    if (!this.sendBtn) return;
    if (tier === this.tier) return;
    if (tier > this.tier) this.sound.snap(tier);
    this.tier = tier;
    this.showGoals(tier);
    const b = this.sendBtn;
    b.disabled = tier === 0;
    b.classList.toggle('ready', tier === 3);
    b.innerHTML = tier === 0 ? 'Not ready to send' : `Send to Reviewer 2 <small>${TIERS[tier].toLowerCase()} likely</small>`;
  }

  // A small label attached to a point in the scene.
  tag(html, get) {
    const t = el('span', 'tag', html);
    $('tags').append(t);
    const item = { el: t, get };
    this.tags.push(item);
    return item;
  }

  custom(html, cls = '') {
    const c = el('div', cls, html);
    $('custom').append(c);
    this.layout?.();
    return c;
  }

  verdict({ tier, comment, lesson, onNext, onStay, nextLabel = 'Next plate' }) {
    const v = $('verdict');
    const stamp = $('v-stamp');
    stamp.textContent = TIERS[tier];
    stamp.dataset.tier = tier;
    $('v-comment').innerHTML = typeset(comment);
    $('v-lesson').innerHTML = typeset(lesson);
    const next = $('v-next'), stay = $('v-stay');
    next.textContent = nextLabel;
    next.onclick = () => { v.classList.remove('open'); onNext(); };
    stay.style.display = tier < 3 && onStay ? '' : 'none';
    stay.onclick = () => { v.classList.remove('open'); onStay?.(); };
    v.classList.remove('open'); void v.offsetWidth;
    v.classList.add('open');
    setTimeout(() => this.sound.stamp(), 420);
    next.focus({ preventScroll: true });
  }

  crash(lines, onRestart) {
    const c = $('crash');
    $('crash-log').textContent = lines.join('\n');
    c.classList.add('open');
    $('crash-go').onclick = () => { c.classList.remove('open'); onRestart(); };
  }

  frame(stage) {
    for (const r of this.rulers) r.tick();
    if (!this.tags.length) return;
    this.tmpV ??= stage.camera.position.clone();
    for (const t of this.tags) {
      const w = t.get();
      if (!w) { t.el.style.opacity = 0; continue; }
      const p = stage.project(this.tmpV.set(...w), this.tmpV);
      t.el.style.opacity = 1;
      t.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;
    }
  }
}
