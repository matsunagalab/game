// Small helpers for the layer of type and controls above the print.
export const $ = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const button = (cls, text, onClick) => {
  const b = $('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

// A transparent 2D sheet over the print, for marks that need crisp edges: bursts, dashes, note beads.
export class Overlay {
  constructor(press) {
    this.press = press;
    this.canvas = $('canvas', 'overlay');
    document.body.insertBefore(this.canvas, document.getElementById('ui'));
    this.g = this.canvas.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
    visualViewport?.addEventListener('resize', () => this.resize());
  }

  resize() {
    const r = Math.min(2, devicePixelRatio || 1);
    this.ratio = r;
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * r;
    this.canvas.height = this.h * r;
  }

  begin() {
    const { g, ratio } = this;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
  }

  // World point to css pixels.
  project(v, out = {}) {
    const p = v.clone().project(this.press.camera);
    out.x = (p.x * 0.5 + 0.5) * this.w;
    out.y = (-p.y * 0.5 + 0.5) * this.h;
    return out;
  }

  burst(x, y, r, spin = 0) {
    const { g } = this;
    const points = 9;
    const path = (scale) => {
      g.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = spin + (i / (points * 2)) * Math.PI * 2;
        const rad = (i % 2 ? r * 0.5 : r) * scale;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.closePath();
    };
    path(1.0);
    g.fillStyle = '#ffd21f';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#1f2aa6';
    g.stroke();
    path(0.55);
    g.fillStyle = '#ff4a9e';
    g.fill();
  }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
export const ease = (t) => t * t * (3 - 2 * t);
