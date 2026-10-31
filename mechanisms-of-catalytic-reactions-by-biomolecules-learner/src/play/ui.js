// The small DOM layer: top bar, one sentence at a time, a tray for controls, dials and charts.
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export { el };

const TAG = { m: 'measured', c: 'computed by this game', t: 'teaching model' };

export class UI {
  constructor(root) {
    this.root = root;
    this.top = el('div', 'top');
    this.back = el('button', 'icon back', '<span>‹</span>'); this.back.setAttribute('aria-label', 'Back to the album');
    this.name = el('div', 'tname');
    this.dots = el('div', 'dots', '<i></i><i></i><i></i><i></i>');
    this.mute = el('button', 'icon mute', '<span></span>'); this.mute.setAttribute('aria-label', 'Sound');
    this.top.append(this.back, this.name, this.dots, this.mute);
    this.pane = el('div', 'pane');
    this.tray = el('div', 'tray');
    this.cap = el('div', 'cap');
    this.note = el('div', 'note');
    this.row = el('div', 'row');
    this.pane.append(this.note, this.tray, this.cap, this.row);
    root.append(this.top, this.pane);
    this.show(false);
  }

  show(on) { this.top.style.display = on ? 'flex' : 'none'; this.pane.style.display = on ? 'flex' : 'none'; }
  stage(i, name) { this.name.innerHTML = name; [...this.dots.children].forEach((d, k) => { d.className = k < i ? 'on' : k === i ? 'now' : ''; }); }
  say(text, tag, cls = '') {
    this.cap.className = `cap ${cls}`;
    this.cap.innerHTML = `${tag ? `<em class="tag ${tag}">${TAG[tag]}</em>` : ''}<p>${text}</p>`;
    this.cap.firstElementChild && this.cap.scrollTo?.(0, 0);
  }
  where(text) { this.note.textContent = text || ''; }
  clearTray() { this.tray.innerHTML = ''; this.tray.className = 'tray'; }
  clearRow() { this.row.innerHTML = ''; }
  button(label, fn, cls = '') { const b = el('button', `btn ${cls}`, label); b.addEventListener('click', fn); this.row.append(b); return b; }

  // One sentence at a time. Resolves when the player has read the last one.
  tell(list, finalLabel = 'Next') {
    return new Promise((res) => {
      let i = 0;
      const go = () => {
        const [tag, text] = list[i];
        this.say(text, tag);
        this.clearRow();
        this.button(i === list.length - 1 ? finalLabel : 'Next', () => { i += 1; if (i >= list.length) { this.clearRow(); res(); } else go(); }, 'go');
      };
      go();
    });
  }
}

// A dial on a log scale. A wide strip, so a thumb never has to be precise.
export function logDial(parent, { min, max, value, fmt, onChange, log = true, ticks = true }) {
  const box = el('div', 'dial'), track = el('div', 'track'), fill = el('div', 'fillb'), knob = el('div', 'knob'), out = el('div', 'dval');
  track.append(fill, knob); box.append(out, track); parent.append(box);
  const toX = (v) => (log ? (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)) : (v - min) / (max - min));
  const fromX = (x) => (log ? 10 ** (Math.log10(min) + x * (Math.log10(max) - Math.log10(min))) : min + x * (max - min));
  if (ticks && log) {
    const a = Math.ceil(Math.log10(min)), b = Math.floor(Math.log10(max)), every = b - a > 8 ? 2 : 1;
    for (let d = a; d <= b; d += every) { const t = el('i', 'tick'); t.style.left = `${toX(10 ** d) * 100}%`; track.append(t); }
  }
  let v = value, touched = false;
  const paint = () => { const x = toX(v) * 100; knob.style.left = `${x}%`; fill.style.width = `${x}%`; out.innerHTML = fmt(v); };
  const set = (e) => { const r = track.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); v = fromX(x); touched = true; paint(); onChange?.(v); };
  let down = false;
  box.addEventListener('pointerdown', (e) => { down = true; box.setPointerCapture?.(e.pointerId); set(e); });
  box.addEventListener('pointermove', (e) => { if (down) set(e); });
  box.addEventListener('pointerup', () => { down = false; });
  box.addEventListener('pointercancel', () => { down = false; });
  paint();
  return { get value() { return v; }, set value(x) { v = x; paint(); }, get touched() { return touched; }, el: box, track, reveal(truth, label) { const m = el('i', 'truth'); m.style.left = `${toX(truth) * 100}%`; track.append(m); const t = el('b', 'tlabel', label); t.style.left = `${toX(truth) * 100}%`; track.append(t); } };
}

export function fmtPow(v, digits = 1) {
  if (v === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(v))), m = v / 10 ** e;
  if (Math.abs(m).toFixed(digits) === (10).toFixed(digits)) { m = 1; e += 1; }
  if (e >= -2 && e <= 3) return v >= 100 ? v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2);
  const sup = String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  return `${m.toFixed(digits)} × 10${sup}`;
}

export function plot(canvas, { series, xmin, xmax, ymin, ymax, xlabel, ylabel, mark, logY = false, xticks = [] }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const L = 12, R = 8, T = 8, B = 24;
  const X = (x) => L + (x - xmin) / (xmax - xmin) * (W - L - R), Y = (y) => H - B - ((logY ? Math.log10(y) : y) - ymin) / (ymax - ymin) * (H - T - B);
  c.strokeStyle = 'rgba(230,182,92,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(L, H - B); c.lineTo(W - R, H - B); c.stroke();
  c.fillStyle = '#c9b48d'; c.font = '13px "Alegreya Sans"'; c.textAlign = 'center';
  for (const t of xticks) { c.fillText(String(t), X(t), H - 8); c.beginPath(); c.moveTo(X(t), H - B); c.lineTo(X(t), H - B + 4); c.stroke(); }
  if (xlabel) { c.textAlign = 'right'; c.fillText(xlabel, W - R, T + 10); }
  for (const s of series) {
    c.strokeStyle = s.color || '#f0c56a'; c.lineWidth = s.width || 2.2; c.setLineDash(s.dash || []); c.beginPath();
    s.pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke(); c.setLineDash([]);
  }
  if (mark !== undefined) { c.strokeStyle = 'rgba(244,212,140,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(mark), T); c.lineTo(X(mark), H - B); c.stroke(); }
}
