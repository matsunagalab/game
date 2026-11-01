// The card under the scene: one sentence at a time, the numbers that matter with where each one came from, and the controls.
const $ = (id) => document.getElementById(id);

// What a number is. Every screen carries at least one of these.
export const TAGS = { real: 'Real data', boltz: 'Real Boltz output', game: 'Computed here', model: 'Teaching model', paper: 'From the papers' };

// Where a chapter sits in a diffusion sampler. Quiet on purpose: it orients, and there is nothing to read in it.
const PIPE = ['noise', 'guess', 'step', 'structure'];
const HAND = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 30c-3-3-6-7-7-10-1-2 1-3 3-2l3 3V6a2.2 2.2 0 0 1 4.4 0v7.6a2.2 2.2 0 0 1 4.3 0v1a2.2 2.2 0 0 1 4.3 0v1a2.2 2.2 0 0 1 4.3 0V23c0 3-1 5-2 7z" fill="#fbfbf8" stroke="#1d2141" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export class UI {
  constructor(game) {
    this.game = game;
    this.say$ = $('say'); this.reads$ = $('reads'); this.ctrl$ = $('ctrl'); this.tags$ = $('tagline');
    this.labels$ = $('labels');
    this.card$ = $('card'); this.goal$ = $('goal'); this.goalText$ = $('goal-text'); this.goalCount$ = $('goal-count'); this.goalRounds$ = $('goal-rounds'); this.pipe$ = $('pipe');
  }

  clear() {
    this.say$.innerHTML = ''; this.say$.className = ''; this.reads$.innerHTML = ''; this.ctrl$.innerHTML = ''; this.tags$.innerHTML = ''; this.labels$.innerHTML = '';
    this.handOff();
    this.puzzle(false);
    this.pipeline(null);
  }

  // A puzzle chapter's card: the goal stays in view, under it one line of feedback.
  puzzle(on) {
    this.card$.classList.toggle('puzzle', on);
    this.goal$.hidden = !on;
    if (!on) { this.goalText$.textContent = ''; this.goalCount$.textContent = ''; this.goalRounds$.innerHTML = ''; }
  }

  goal(html, done = null, total = null) {
    this.goalText$.innerHTML = html;
    this.goalCount$.textContent = done === null ? '' : `${done} of ${total}`;
    this.fit();
  }

  // Dots beside the goal, for the rounds inside one level.
  rounds(done, total = 0) { this.goalRounds$.innerHTML = Array.from({ length: total }, (_, i) => `<b class="${i < done ? 'on' : ''}"></b>`).join(''); }

  // At most one short line. Tone good or bad colours it. The room for it is reserved, so the board stays still.
  feedback(html, tone = '') { this.say$.innerHTML = html; this.say$.className = tone; }

  // Lights the steps of the sampler this chapter is about. null hides the marker.
  pipeline(lit) {
    this.pipe$.hidden = !lit;
    this.pipe$.innerHTML = lit ? PIPE.map((t, k) => `<span class="${lit.includes(k) ? 'on' : ''}">${t}</span>`).join('<i></i>') : '';
  }

  // A small hand that shows what can be moved. from and to are functions, so it follows the board.
  hand(from, to = from) {
    this.handOff();
    const el = this.hand$ = document.createElement('div'), t0 = performance.now(), PERIOD = 2300;
    el.className = 'hand';
    el.innerHTML = HAND;
    this.labels$.append(el);
    const step = (t) => {
      if (this.hand$ !== el || !el.isConnected) return;
      const p = ((t - t0) % PERIOD) / PERIOD, go = Math.min(1, Math.max(0, (p - 0.18) / 0.5)), e = go * go * (3 - 2 * go), a = from(), b = to();
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

  // Update one reading without touching the others.
  read(id, value) { const e = document.querySelector(`#${id} b`); if (e) e.textContent = value; }

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

  chips(items) { const d = document.createElement('div'); d.className = 'chips'; d.append(...items.filter(Boolean)); return d; }

  slider({ label, min, max, step = 1, value, format = (v) => v, onInput, onDone, id }) {
    const l = document.createElement('label');
    l.className = 'slide';
    const s = document.createElement('input');
    Object.assign(s, { type: 'range', min, max, step, value });
    if (id) s.id = id;
    const o = document.createElement('output');
    o.textContent = format(+value);
    l.append(document.createTextNode(label), s, o);
    s.addEventListener('input', () => { o.textContent = format(+s.value); onInput?.(+s.value); });
    s.addEventListener('change', () => onDone?.(+s.value));
    l.input = s;
    l.show = (v) => { o.textContent = format(v); };
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
    const card = this.ctrl$.parentElement;
    card.classList.add('tall');
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
            this.ctrl$.append(this.button('Next', () => { this.ctrl(); card.classList.remove('tall'); resolve(first); }, { id: 'next' }));
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

  // Keep the stage clear of the card, however tall the card has grown.
  fit() { requestAnimationFrame(() => this.game.layout()); }

  label(html, cls = '') {
    const d = document.createElement('div');
    d.className = `lab ${cls}`;
    d.innerHTML = html;
    this.labels$.append(d);
    return { el: d, at(p) { d.style.left = `${p.x}px`; d.style.top = `${p.y}px`; }, remove() { d.remove(); }, set(t) { d.innerHTML = t; } };
  }
}

// A drop of ink for each tier: magenta, ultramarine, teal. Drawn, so no image file is needed.
const DROP = 'M12 2.5c3.4 4.7 7 8.4 7 12.3a7 7 0 0 1-14 0C5 10.9 8.6 7.2 12 2.5z';
const COLOR = ['#c2185b', '#2336a8', '#0d8a8f'];
export function dropIcons(tier, total = 3) {
  return Array.from({ length: total }, (_, i) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${DROP}" fill="${i < tier ? COLOR[i] : 'none'}" stroke="${i < tier ? COLOR[i] : '#9aa0b5'}" stroke-width="1.4"/></svg>`).join('');
}
