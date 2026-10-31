// The card under the scene: one sentence at a time, the numbers that matter with where each one came from, and the controls.
const $ = (id) => document.getElementById(id);

// What a number is. Every reading in the game carries one of these.
export const TAGS = { real: 'Real data', af2: 'Real AF2 output', game: 'Computed here', model: 'Teaching model', paper: 'From the papers' };

export class UI {
  constructor(game) {
    this.game = game;
    this.say$ = $('say'); this.reads$ = $('reads'); this.ctrl$ = $('ctrl'); this.tags$ = $('tagline');
    this.labels$ = $('labels');
  }

  clear() { this.say$.innerHTML = ''; this.reads$.innerHTML = ''; this.ctrl$.innerHTML = ''; this.tags$.innerHTML = ''; this.labels$.innerHTML = ''; }

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
  async line(html, label = 'Next') {
    const parts = html.split(/(?<=[.?!])\s+(?=[A-Z<])/);
    for (let k = 0; k < parts.length; k += 1) {
      this.say(parts[k]);
      await new Promise((resolve) => {
        this.ctrl(this.button(k === parts.length - 1 ? label : 'Next', () => { this.ctrl(); resolve(); }, { id: 'next' }));
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
            this.ctrl$.append(this.button('Next', () => { this.ctrl(); resolve(first); }, { id: 'next' }));
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
