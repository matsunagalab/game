// Small DOM helpers, and chemical text: Zn^2+ and O_2 become proper super- and subscripts.
export const fmt = (s) => String(s).replace(/\^(\d*[+−-])/g, '<sup>$1</sup>').replace(/_(\d+|a\b)/g, '<sub>$1</sub>');

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function button(cls, html, fn) {
  const b = el('button', cls, html);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

const SHAPES = {
  'tetrahedral': [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  'square planar': [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]],
  'seesaw': [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, 0.87, 0]],
  'trigonal planar': [[1, 0, 0], [-0.5, 0.87, 0], [-0.5, -0.87, 0]],
  'T-shaped': [[1, 0, 0], [-1, 0, 0], [0, 1, 0]],
  'trigonal pyramidal': [[0.9, 0, -0.4], [-0.45, 0.78, -0.4], [-0.45, -0.78, -0.4]],
  'trigonal bipyramidal': [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, 0.87, 0], [-0.5, -0.87, 0]],
  'square pyramidal': [[0, 0, 1], [1, 0, -0.17], [0, 1, -0.17], [-1, 0, -0.17], [0, -1, -0.17]],
  'octahedral': [[0, 0, 1], [0, 0, -1], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]],
  'trigonal prismatic': [[0.7, 0, 0.72], [-0.35, 0.6, 0.72], [-0.35, -0.6, 0.72], [0.7, 0, -0.72], [-0.35, 0.6, -0.72], [-0.35, -0.6, -0.72]],
  'pentagonal bipyramidal': [[0, 0, 1], [0, 0, -1], ...[0, 1, 2, 3, 4].map((i) => [Math.cos(i * 1.257), Math.sin(i * 1.257), 0])],
  'capped octahedral': [[0.58, 0.58, 0.58], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]],
  'capped trigonal prismatic': [[1, 0, 0], ...[1.05, 3.14, 5.24].map((a) => [0.7 * Math.cos(a), 0.7 * Math.sin(a), 0.72]), ...[1.05, 3.14, 5.24].map((a) => [0.7 * Math.cos(a), 0.7 * Math.sin(a), -0.72])],
  'square antiprismatic': [...[0, 1.57, 3.14, 4.71].map((a) => [0.8 * Math.cos(a), 0.8 * Math.sin(a), 0.58]), ...[0.79, 2.36, 3.93, 5.5].map((a) => [0.8 * Math.cos(a), 0.8 * Math.sin(a), -0.58])],
  'cubic': [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map((v) => v.map((c) => c * 0.62)),
  'dodecahedral': [[0, 1, 0.6], [0, -1, 0.6], [1, 0, -0.6], [-1, 0, -0.6], [0.6, 0, 1], [-0.6, 0, 1], [0, 0.6, -1], [0, -0.6, -1]].map((v) => v.map((c) => c * 0.8)),
};

// Edges join each vertex to its nearest neighbours, which reads clearly at thumbnail size.
function edgesOf(vs) {
  const list = [];
  const n = vs.length;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const k = n <= 4 ? 3 : n <= 6 ? 4 : 4;
  for (let i = 0; i < n; i++) {
    const near = [...Array(n).keys()].filter((j) => j !== i).sort((a, b) => d(vs[i], vs[a]) - d(vs[i], vs[b])).slice(0, k);
    for (const j of near) if (!list.some(([a, b]) => (a === j && b === i) || (a === i && b === j))) list.push([i, j]);
  }
  return list;
}

// A small turning drawing of a polyhedron for the shape buttons.
export class ShapeIcon {
  constructor(name) {
    this.vs = SHAPES[name].map((v) => { const l = Math.hypot(...v) || 1; return n3(v, l, name); });
    this.edges = edgesOf(this.vs);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '-34 -34 68 68');
    this.lines = this.edges.map(() => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      this.svg.append(l);
      return l;
    });
    this.dots = this.vs.map(() => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', 2.6);
      this.svg.append(c);
      return c;
    });
    this.centre = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.centre.setAttribute('r', 3.4);
    this.centre.setAttribute('class', 'mid');
    this.svg.append(this.centre);
    this.draw(0.6);
  }

  draw(t) {
    const c = Math.cos(t), s = Math.sin(t), tilt = 0.5, ct = Math.cos(tilt), st = Math.sin(tilt);
    const pts = this.vs.map(([x, y, z]) => {
      const X = x * c + y * s;
      const Y = -x * s + y * c;
      return [X * 26, (Y * st - z * ct) * 26];
    });
    this.edges.forEach(([a, b], i) => {
      const l = this.lines[i];
      l.setAttribute('x1', pts[a][0]); l.setAttribute('y1', pts[a][1]);
      l.setAttribute('x2', pts[b][0]); l.setAttribute('y2', pts[b][1]);
    });
    this.dots.forEach((d, i) => { d.setAttribute('cx', pts[i][0]); d.setAttribute('cy', pts[i][1]); });
  }
}
const n3 = (v, l) => v.map((c) => c / l);
