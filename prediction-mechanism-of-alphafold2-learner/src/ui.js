// The card under the scene: one sentence at a time, the numbers that matter with where each one came from, and the controls.
import { ja, tr } from './i18n.js';

const $ = (id) => document.getElementById(id);

// What a number is. Every reading in the game carries one of these.
export const TAGS = {
  real: tr('Real data', '実データ'), af2: tr('Real AF2 output', 'AF2の実出力'), game: tr('Computed here', 'この場の計算'),
  model: tr('Teaching model', '教材モデル'), paper: tr('From the papers', '論文の記述'),
};
const NEXT = tr('Next', '次へ');
// Where a chapter sits in AlphaFold2. Quiet on purpose: it orients, and there is nothing to read in it.
const STEPS = [tr('sequences', '配列'), tr('pairs', 'ペア'), tr('structure', '構造'), tr('confidence', '信頼度')];
const HAND = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 30c-3-3-6-7-7-10-1-2 1-3 3-2l3 3V6a2.2 2.2 0 0 1 4.4 0v7.6a2.2 2.2 0 0 1 4.3 0v1a2.2 2.2 0 0 1 4.3 0v1a2.2 2.2 0 0 1 4.3 0V23c0 3-1 5-2 7z" fill="#fffdf8" stroke="#26343f" stroke-width="1.5" stroke-linejoin="round"/></svg>';
// Sentences end at a stop in Japanese, which has no space after it. A closing tag or bracket stays with its sentence.
const SENTENCE = ja ? /(?<=[。？！])(?!<\/|[）」]|$)/ : /(?<=[.?!])\s+(?=[A-Z<])/;

export class UI {
  constructor(game) {
    this.game = game;
    this.say$ = $('say'); this.reads$ = $('reads'); this.ctrl$ = $('ctrl'); this.tags$ = $('tagline');
    this.labels$ = $('labels');
    this.goal$ = $('goal'); this.goalText$ = $('goal-text'); this.goalCount$ = $('goal-count'); this.pipe$ = $('pipe');
    this.card$ = $('card');
  }

  clear() {
    this.say$.innerHTML = ''; this.reads$.innerHTML = ''; this.ctrl$.innerHTML = ''; this.tags$.innerHTML = ''; this.labels$.innerHTML = '';
    this.handOff();
    this.puzzle(false);
    this.pipeline(null);
  }

  // A puzzle chapter's card: one goal, always in view, one line of feedback, one reading.
  puzzle(on) {
    this.card$.classList.toggle('puzzle', on);
    $('play').classList.toggle('puzzle', on);
    this.goal$.hidden = !on;
    if (!on) { this.goalText$.textContent = ''; this.goalCount$.textContent = ''; }
  }

  goal(html, done = null, total = null) {
    this.goalText$.innerHTML = html;
    this.count(done, total);
    this.fit();
  }

  // Progress beside the goal. Text may be given in place of two numbers.
  count(done, total = null) {
    this.goalCount$.textContent = done === null ? '' : total === null ? done : tr(`${done} of ${total}`, `${done}/${total}`);
  }

  // At most one short line. Tone good or bad colours it. It never resizes the card, so the board stays still.
  feedback(html, tone = '') {
    this.say$.innerHTML = html;
    this.say$.className = tone;
  }

  // One number that matters, as a bar with a line to pass.
  meter({ label, max = 1, mark = null }) {
    const m = document.createElement('div');
    m.className = 'meter';
    m.innerHTML = `<div class="m-read"><b></b><span>${label}</span></div><div class="m-bar"><i></i>${mark === null ? '' : `<u style="left:${(mark / max) * 100}%"></u>`}</div>`;
    const [b, i] = [m.querySelector('b'), m.querySelector('i')];
    this.reads$.replaceChildren(m);
    m.set = (v, text = '', pass = false) => {
      b.textContent = text;
      i.style.width = `${Math.min(100, (v / max) * 100)}%`;
      m.classList.toggle('pass', pass);
    };
    m.set(0, '–');
    return m;
  }

  // Lights the steps of AlphaFold2 this chapter is about. null hides the marker.
  pipeline(steps) {
    this.pipe$.hidden = !steps;
    this.pipe$.innerHTML = steps ? STEPS.map((t, k) => `<span class="${steps.includes(k) ? 'on' : ''}">${t}</span>`).join('<i></i>') : '';
  }

  // Labels on a board keep their size against its cells, whatever the screen.
  cellSize(px) {
    if (Math.abs(px - (this.cellPx ?? 0)) < 0.5) return;
    this.cellPx = px;
    this.labels$.style.setProperty('--cell-px', `${px}px`);
  }

  // A small hand that shows what can be moved. from and to are functions, so it follows the board.
  hand(from, to = from) {
    this.handOff();
    const el = this.hand$ = document.createElement('div'), t0 = performance.now(), PERIOD = 2300;
    el.className = 'hand';
    el.innerHTML = HAND;
    this.labels$.append(el);
    const step = (t) => {
      if (this.hand$ !== el) return;
      const p = ((t - t0) % PERIOD) / PERIOD, go = Math.min(1, Math.max(0, (p - 0.18) / 0.5)), e = go * go * (3 - 2 * go);
      const a = from(), b = to();
      el.style.transform = `translate(${a.x + (b.x - a.x) * e - 11}px, ${a.y + (b.y - a.y) * e - 3}px) scale(${p < 0.14 || p > 0.74 ? 1.08 : 0.96})`;
      el.style.opacity = p < 0.08 ? p / 0.08 : p > 0.86 ? (1 - p) / 0.14 : 1;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  handOff() { this.hand$?.remove(); this.hand$ = null; }

  say(html) { this.say$.innerHTML = html; this.fit(); }

  tags(...names) {
    this.tags$.innerHTML = names.map((n) => `<span class="tag ${n}">${TAGS[n]}</span>`).join('');
    this.fit();
  }

  reads(list) {
    this.reads$.innerHTML = list.map((r) => `<div class="read" ${r.id ? `id="${r.id}"` : ''}><b>${r.value}</b>${r.label}</div>`).join('');
    this.fit();
  }

  ctrl(...nodes) {
    this.ctrl$.innerHTML = '';
    this.ctrl$.append(...nodes.filter(Boolean));
    this.fit();
  }

  button(label, onClick, { quiet = false, id = null } = {}) {
    const b = document.createElement('button');
    b.className = `btn${quiet ? ' quiet' : ''}`;
    b.textContent = label;
    if (id) b.id = id;
    b.addEventListener('click', () => { this.game.sound.tap(); onClick(b); });
    return b;
  }

  slider({ label, min, max, step = 1, value, format = (v) => v, onInput, onDone }) {
    const l = document.createElement('label');
    l.className = 'slide';
    const s = document.createElement('input');
    Object.assign(s, { type: 'range', min, max, step, value });
    const o = document.createElement('output');
    o.textContent = format(+value);
    l.append(document.createTextNode(label), s, o);
    s.addEventListener('input', () => { o.textContent = format(+s.value); onInput?.(+s.value); });
    s.addEventListener('change', () => onDone?.(+s.value));
    l.input = s;
    return l;
  }

  // One sentence at a time. Text with several sentences is shown one by one, each with its own tap.
  async line(html, label = NEXT) {
    const parts = html.split(SENTENCE);
    for (let k = 0; k < parts.length; k += 1) {
      this.say(parts[k]);
      await new Promise((resolve) => {
        this.ctrl(this.button(k === parts.length - 1 ? label : NEXT, () => { this.ctrl(); resolve(); }, { id: 'next' }));
      });
    }
  }

  // A list of choices. Wrong answers explain themselves and leave the others open. Resolves once the right one is hit.
  // Returns true only if the first tap was right.
  choose(html, options) {
    this.say(html);
    this.options = options;
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.className = 'opts';
      let first = true;
      for (const o of options) {
        const b = document.createElement('button');
        b.className = 'opt';
        b.textContent = o.text;
        b.addEventListener('click', () => {
          this.game.sound.tap();
          if (o.right) {
            b.classList.add('right');
            this.game.sound.good(1);
            this.say(o.why);
            [...box.children].forEach((c) => { c.disabled = true; });
            this.ctrl$.append(this.button(NEXT, () => { this.ctrl(); resolve(first); }, { id: 'next' }));
          } else {
            first = false;
            b.classList.add('wrong');
            this.game.sound.soft();
            this.say(o.why);
          }
          this.fit();
        });
        box.append(b);
      }
      this.ctrl(box);
    });
  }

  // Keep the 3D stage clear of the card, however tall the card has grown.
  fit() { requestAnimationFrame(() => this.game.layout()); }

  label(html, cls = '') {
    const d = document.createElement('div');
    d.className = `lab ${cls}`;
    d.innerHTML = html;
    this.labels$.append(d);
    return { el: d, at(p) { d.style.left = `${p.x}px`; d.style.top = `${p.y}px`; }, remove() { d.remove(); }, set(t) { d.innerHTML = t; } };
  }
}

// Paper crane in three stages: one for each tier. Drawn, so no image file is needed.
const FOLD = [
  '<path d="M4 4h16v16H4z" fill="#fffdf8" stroke="#8fa4b2"/><path d="M4 4l16 16" stroke="#c9d3da"/>',
  '<path d="M3 16 12 5l9 11-9 3z" fill="#65cbf3" stroke="#2d7fa7"/><path d="M12 5v14" stroke="#2d7fa7"/>',
  '<path d="M2 9l6 4 4-8 3 7 7-5-5 9-3 5-5-3z" fill="#0053d6" stroke="#003a99" stroke-linejoin="round"/><path d="M12 5l-1 9 4-2" stroke="#6ea4f0" fill="none"/>',
];
export function foldIcons(tier, total = 3) {
  return Array.from({ length: total }, (_, i) => `<svg viewBox="0 0 24 24" aria-hidden="true" style="opacity:${i < tier ? 1 : 0.22}">${FOLD[i]}</svg>`).join('');
}
