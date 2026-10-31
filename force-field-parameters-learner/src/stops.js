// Organ stops: vertical drags that pull a harmonic in or push it out.
// The drag is relative and slow movement is finer, so a thumb can place a value to 0.01.
export class Stops {
  constructor(parent, defs, sound) {
    this.root = document.createElement('div');
    this.root.className = 'stops';
    parent.append(this.root);
    this.items = defs.map(d => this.make(d, sound));
  }
  make({ label, min, max, value, step = 0.01, digits = 2, onInput, onRelease }, sound) {
    const s = document.createElement('div');
    s.className = 'stop'; s.tabIndex = 0;
    s.setAttribute('role', 'slider'); s.setAttribute('aria-label', label.replace(/<[^>]+>/g, ''));
    s.setAttribute('aria-valuemin', min); s.setAttribute('aria-valuemax', max);
    s.innerHTML = `<div class="stop-rail"></div><div class="stop-zero"></div><div class="stop-pipe"></div><div class="stop-knob"></div><div class="stop-value"></div><div class="stop-label">${label}</div>`;
    this.root.append(s);
    const [zero, pipe, knob, val] = ['zero', 'pipe', 'knob', 'value'].map(k => s.querySelector('.stop-' + k));
    const it = {
      value, root: s,
      show() {
        const h = s.clientHeight || 104, top = 19, bot = h - 17, y = v => bot - (v - min) / (max - min) * (bot - top);
        const y0 = y(Math.max(min, Math.min(max, 0))), yv = y(it.value);
        zero.style.top = `${y0}px`; knob.style.top = `${yv}px`;
        pipe.style.top = `${Math.min(y0, yv)}px`; pipe.style.height = `${Math.abs(yv - y0)}px`;
        val.textContent = it.value.toFixed(digits).replace('-', '−');
        s.setAttribute('aria-valuenow', it.value.toFixed(digits));
      },
      set(v) { it.value = Math.max(min, Math.min(max, Math.round(v / step) * step)); it.show(); },
    };
    let ly = 0, drag = false, raw = value, id = null;
    s.addEventListener('pointerdown', e => {
      drag = true; ly = e.clientY; raw = it.value; id = e.pointerId;
      s.setPointerCapture(id); e.preventDefault();
    });
    s.addEventListener('pointermove', e => {
      if (!drag) return;
      const dy = e.clientY - ly; ly = e.clientY;
      const fine = Math.abs(dy) <= 1 ? 0.3 : 1;
      raw = Math.max(min, Math.min(max, raw - dy * fine * (max - min) / 170));
      const before = Math.round(it.value);
      it.set(raw);
      if (Math.round(it.value) !== before) sound?.tick(1.3);
      onInput?.(it.value);
    });
    const up = () => { if (drag) { drag = false; onRelease?.(it.value); } };
    s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
    s.addEventListener('keydown', e => {
      const d = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
      if (!d) return;
      it.set(it.value + d * (e.shiftKey ? 0.25 : 1) * step * 5); onInput?.(it.value); e.preventDefault();
    });
    it.show();
    return it;
  }
}
