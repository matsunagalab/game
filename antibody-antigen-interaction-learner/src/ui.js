// Everything drawn in HTML over the 3D scene: residue labels, links, floating text, the ruler.
import * as THREE from 'three';
import {LOOPS, RESIDUES, CLASS_INFO, formatKd} from './rules.js';

export const $ = s => document.querySelector(s);
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const pipsHtml = reach => `<span class="pips" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= reach ? 'on' : ''}"></i>`).join('')}</span>`;

const SVG = 'http://www.w3.org/2000/svg';

export class Labels {
  constructor(book, camera, onLoop) {
    this.book = book;
    this.camera = camera;
    this.sites = {para: {}, epi: {}};
    this.links = {};
    this.root = $('#labels');
    this.svg = $('#links');
    this.visible = false;
    for (const loop of LOOPS) {
      const para = document.createElement('button');
      para.className = 'site para empty';
      para.addEventListener('click', () => onLoop(loop));
      const epi = document.createElement('div');
      epi.className = 'site epi';
      this.root.append(para, epi);
      this.sites.para[loop] = para;
      this.sites.epi[loop] = epi;
      const g = document.createElementNS(SVG, 'g');
      const under = document.createElementNS(SVG, 'path');
      const line = document.createElementNS(SVG, 'path');
      under.setAttribute('class', 'under');
      line.setAttribute('class', 'line');
      g.append(under, line);
      this.svg.append(g);
      this.links[loop] = {g, under, line};
    }
    this.setVisible(false);
  }

  setVisible(on) {
    this.visible = on;
    for (const loop of LOOPS) {
      this.sites.para[loop].classList.toggle('gone', !on);
      this.sites.epi[loop].classList.toggle('gone', !on);
      this.links[loop].g.classList.toggle('hide', !on);
    }
  }

  setPara(loop, aa, {locked = false} = {}) {
    const el = this.sites.para[loop];
    el.className = 'site para';
    if (!aa) {
      el.classList.add('empty');
      el.textContent = loop;
      el.setAttribute('aria-label', `Empty loop ${loop}`);
    } else {
      const r = RESIDUES[aa];
      el.classList.add(`c-${r.cls}`);
      el.innerHTML = `${r.code}${pipsHtml(r.reach)}`;
      el.setAttribute('aria-label', `Loop ${loop}: ${r.name}`);
    }
    el.classList.toggle('locked', locked);
    el.disabled = locked;
  }

  setEpi(loop, aa, alt = null) {
    const el = this.sites.epi[loop];
    const r = RESIDUES[aa];
    el.className = `site epi c-${r.cls}`;
    el.innerHTML = `${r.code}${pipsHtml(r.reach)}`;
    if (alt) {
      const a = RESIDUES[alt];
      el.classList.add('differs');
      el.insertAdjacentHTML('beforeend', `<span class="alt c-${a.cls}">self ${a.code}</span>`);
    }
  }

  setLink(loop, state) {
    const g = this.links[loop].g;
    g.classList.remove('good', 'loose', 'bad');
    if (state) g.classList.add(state);
  }

  clearLinks() { LOOPS.forEach(l => this.setLink(l, null)); }

  lit(loop, on) {
    this.sites.para[loop].classList.toggle('lit', on);
    this.sites.epi[loop].classList.toggle('lit', on);
  }

  targets(on) {
    for (const loop of LOOPS) {
      const el = this.sites.para[loop];
      el.classList.toggle('target', on && !el.disabled);
    }
  }

  point(world, out) {
    const v = this._v.copy(world).project(this.camera);
    out.x = (v.x + 1) / 2 * innerWidth;
    out.y = (1 - v.y) / 2 * innerHeight;
    return out;
  }

  _v = new THREE.Vector3();
  _w = new THREE.Vector3();
  _f = {x: 0, y: 0};

  // Pushes overlapping labels apart, starting from their true positions every frame.
  relax(list) {
    const w = 56, h = 32;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const ox = w - Math.abs(dx), oy = h - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          if (oy < ox) {
            const s = (dy >= 0 ? 1 : -1) * oy / 2;
            a.y -= s; b.y += s;
          } else {
            const s = (dx >= 0 ? 1 : -1) * ox / 2;
            a.x -= s; b.x += s;
          }
        }
      }
    }
  }

  update() {
    if (!this.visible) return;
    this.mid = this.mid || {};
    const positions = side => {
      this.point(this.book.faceWorld(side, this._w), this._f);
      const list = LOOPS.map(loop => {
        const out = this.point(this.book.tipWorld(side, loop, this._w), {x: 0, y: 0, loop});
        const dx = out.x - this._f.x, dy = out.y - this._f.y;
        const d = Math.hypot(dx, dy) || 1;
        const push = loop === 'H3' ? 8 : 18;
        out.x += dx / d * push;
        out.y += dy / d * push;
        return out;
      });
      this.relax(list);
      for (const p of list) this.sites[side][p.loop].style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      return list;
    };
    const para = positions('para'), epi = positions('epi');
    LOOPS.forEach((loop, i) => {
      const a = para[i], b = epi[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const bx = (mx - innerWidth / 2) * 0.16, by = (my - innerHeight * 0.42) * 0.28;
      const d = `M${a.x} ${a.y} Q${mx + bx} ${my + by} ${b.x} ${b.y}`;
      this.links[loop].under.setAttribute('d', d);
      this.links[loop].line.setAttribute('d', d);
      this.mid[loop] = {x: mx + bx * 0.5, y: my + by * 0.5};
    });
  }
}

const floaters = () => $('#floaters');

export function float(text, value, x, y, tone = 'neutral', big = false) {
  const el = document.createElement('div');
  el.className = `floater ${tone}${big ? ' big-one' : ''}`;
  el.style.left = `${Math.max(90, Math.min(innerWidth - 110, x))}px`;
  el.style.top = `${y}px`;
  el.innerHTML = `${text}${value ? `<em>${value}</em>` : ''}`;
  floaters().append(el);
  setTimeout(() => el.remove(), 1300);
}

export function pulse(x, y) {
  const el = document.createElement('div');
  el.className = 'pulse';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  floaters().append(el);
  setTimeout(() => el.remove(), 950);
}

export function chapter(text) {
  const el = $('#chapter');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

const TOP = -3, BOTTOM = -13; // log10 of KD at each end of the ruler

export class Ruler {
  constructor() {
    this.track = $('#ruler-track');
    for (const [log, label] of [[-3, '1 mM'], [-6, '1 µM'], [-9, '1 nM'], [-12, '1 pM']]) {
      const t = document.createElement('div');
      t.className = 'tick';
      t.style.top = `${this.pct(10 ** log)}%`;
      t.textContent = label;
      this.track.append(t);
    }
    this.goal = document.createElement('div');
    this.goal.className = 'goal';
    this.floor = document.createElement('div');
    this.floor.className = 'goal floor';
    this.floor.hidden = true;
    this.bead = document.createElement('div');
    this.bead.id = 'bead';
    this.bead.innerHTML = '<span id="bead-label"></span>';
    this.track.append(this.goal, this.floor, this.bead);
    this.label = this.bead.querySelector('span');
    this.set(1e-3);
  }

  pct(kd) {
    const v = (Math.log10(kd) - TOP) / (BOTTOM - TOP);
    return Math.max(-1, Math.min(103, v * 100));
  }

  set(kd, text) {
    this.bead.style.top = `${this.pct(kd)}%`;
    this.label.textContent = text ?? (kd >= 1e-3 ? 'weak' : formatKd(kd));
  }

  setGoal(kd) { this.goal.hidden = !kd; if (kd) this.goal.style.top = `${this.pct(kd)}%`; }
  setFloor(kd) { this.floor.hidden = !kd; if (kd) this.floor.style.top = `${this.pct(kd)}%`; }
}

export const legendHtml = () => Object.entries(CLASS_INFO).map(([k, v]) => `<span class="c-${k}">${v.label}</span>`).join('');
