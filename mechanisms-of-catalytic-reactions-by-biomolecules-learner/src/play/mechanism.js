// The first stage. A finger draws from a lone pair or a bond; the engine answers.
import { sigmaKey, resolveArrow } from '../chem/engine.js';
import { elementName } from '../chem/judge.js';

const SRC_R = 48, SINK_R = 60;

export class Labels {
  constructor(layer) { this.layer = layer; this.items = []; }
  build(site, mech, scene) {
    this.layer.innerHTML = ''; this.items = [];
    this.scene = scene; this.mech = mech;
    mech.atoms.forEach((a, i) => {
      if ((a.el === 'H' || a.el === 'C') && !a.show) { this.items.push(null); return; }
      const e = document.createElement('i'); e.className = `al el-${a.el}${a.show ? ' named' : ''}`; e.textContent = a.show || a.el; this.layer.append(e);
      this.items.push({ e, i, a });
    });
    this.charges = mech.atoms.map(() => { const q = document.createElement('b'); q.className = 'q'; this.layer.append(q); return q; });
    // A residue's name goes to the emptiest spot just outside its atoms, so it never sits on another group.
    const absent = new Set(mech.absent || []);
    const all = mech.atoms.filter((a) => !absent.has(a.id)).map((a) => site.pos[a.id]);
    const placed = [];
    this.res = Object.entries(site.labels).map(([text, p]) => {
      const e = document.createElement('span'); e.className = 'rl'; e.textContent = text; this.layer.append(e);
      const ids = mech.atoms.filter((a) => a.res === text).map((a) => mech.atoms.indexOf(a));
      // A name may mark a context residue with no reactive atoms, such as Lys41.
      const far = ids.length ? Math.max(...ids.map((i) => { const q = site.pos[mech.atoms[i].id]; return Math.hypot(q[0] - p[0], q[1] - p[1]); })) : 0;
      let best = null, room = -1;
      for (let k = 0; k < 12; k++) {
        const ang = k * Math.PI / 6, c = [p[0] + Math.cos(ang) * (far + 0.62), p[1] + Math.sin(ang) * (far + 0.62) * 0.8, p[2]];
        const clear = Math.min(...[...all, ...placed].map((q) => Math.hypot(q[0] - c[0], (q[1] - c[1]) * 1.6)));
        if (clear > room) { room = clear; best = c; }
      }
      placed.push(best);
      return { e, q: best, ids };
    });
  }
  clear() { this.layer.innerHTML = ''; this.items = []; this.charges = []; this.res = []; }
  update(chargeOf) {
    const { scene } = this; if (!scene?.st) return;
    const { st } = scene, { atoms } = st.spec;
    for (const it of this.items) {
      if (!it) continue;
      const p = scene.pos[it.a.id], [x, y] = scene.toScreen(p), on = st.on[it.i];
      it.e.style.opacity = on ? 1 : 0;
      it.e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
    atoms.forEach((a, i) => {
      const q = this.charges[i], c = chargeOf(i), [x, y] = scene.toScreen(scene.pos[a.id]);
      const show = st.on[i] && c !== 0;
      if (q.dataset.c !== String(c)) { q.dataset.c = c; q.textContent = c > 1 ? `${c}+` : c === 1 ? '+' : c === -1 ? '−' : c < -1 ? `${-c}−` : ''; q.className = `q ${c > 0 ? 'plus' : 'minus'}`; }
      q.style.opacity = show ? 1 : 0;
      q.style.transform = `translate(${(x + 13).toFixed(1)}px,${(y - 15).toFixed(1)}px)`;
    });
    for (const r of this.res) {
      const [x, y] = scene.toScreen(r.q), w = r.e.offsetWidth || 50, cl = Math.max(4, Math.min(innerWidth - w - 4, x - w / 2));
      r.e.style.transform = `translate(${cl.toFixed(1)}px,${y.toFixed(1)}px)`;
      r.e.style.opacity = !r.ids.length || r.ids.some((i) => st.on[i]) ? 1 : 0;
    }
  }
}

export class MechanismStage {
  constructor(app, ch, session) {
    Object.assign(this, { app, ch, ses: session, scene: app.site, ui: app.ui, sound: app.sound });
    this.live = []; this.drag = null; this.finished = false; this.layers = 0; this.stepCount = 0; this.arrowCount = 0;
  }

  get cur() { return this.ses.mid[this.ses.mid.length - 1]; }

  start() {
    const { ui, ses, ch } = this;
    return new Promise((res) => {
      this.resolve = res;
      this.scene.setState(this.cur);
      this.bindRow();
      this.sayStep();
      this.app.onPointer = this;
      // The first arrow of the game is shown once, free of charge.
      if (this.ch.free) setTimeout(() => { if (!this.drag && !this.ses.live.length && !this.ses.log.length) this.hint(); }, 1100);
    });
  }

  bindRow() {
    const { ui } = this;
    ui.clearRow();
    this.undoBtn = ui.button('Undo', () => this.undo());
    this.hintBtn = ui.button('Show me', () => this.hint(), 'ghost');
  }

  sayStep() {
    const s = this.ch.steps[this.ses.index];
    this.ui.say(s.say);
    this.glow();
  }

  glow(i = -1) {
    const n = this.cur.spec.n;
    this.scene.glowWant = new Float32Array(n);
    if (i >= 0) this.scene.glowWant[i] = 1;
  }

  // ------------------------------------------------------------ picking
  worldOf(hit) {
    const { scene } = this, st = this.cur, z = this.planeZ();
    if (hit.kind === 'bond') { const p = scene.pos[st.spec.atoms[hit.i].id], q = scene.pos[st.spec.atoms[hit.j].id]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, z]; }
    const p = scene.pos[st.spec.atoms[hit.i].id];
    return [p[0], p[1], z];
  }

  planeZ() { let z = -99; const { scene } = this, st = this.cur; st.spec.atoms.forEach((a, i) => { if (st.on[i]) z = Math.max(z, scene.pos[a.id][2]); }); return z + 1; }

  pickSource(x, y) {
    const { scene } = this, st = this.cur, { n, atoms } = st.spec;
    let best = null, bd = SRC_R;
    const test = (px, py, hit, bias) => { const d = Math.hypot(px - x, py - y) + bias; if (d < bd) { bd = d; best = hit; } };
    for (let i = 0; i < n; i++) {
      if (!st.on[i]) continue;
      const [ax, ay] = scene.atomScreen(i);
      if (st.lp[i] > 0 && !atoms[i].metal) test(ax, ay, { kind: 'lp', i }, -6);
      for (let j = i + 1; j < n; j++) {
        if (!st.on[j]) continue;
        if (st.b[i * n + j] || st.c[i * n + j]) { const [bx, by] = scene.atomScreen(j); test((ax + bx) / 2, (ay + by) / 2, { kind: 'bond', i, j }, st.b[i * n + j] >= 2 ? -14 : 0); }
      }
    }
    return best;
  }

  pickSink(x, y, src) {
    const { scene } = this, st = this.cur, { n } = st.spec;
    let best = null, bd = SINK_R;
    const test = (px, py, hit, bias) => { const d = Math.hypot(px - x, py - y) + bias; if (d < bd) { bd = d; best = hit; } };
    for (let i = 0; i < n; i++) {
      if (!st.on[i]) continue;
      if (src.kind === 'lp' && src.i === i) continue;
      const [ax, ay] = scene.atomScreen(i);
      test(ax, ay, { kind: 'atom', i }, -4);
      for (let j = i + 1; j < n; j++) {
        if (!st.on[j] || !st.b[i * n + j]) continue;
        const shares = src.kind === 'lp' ? (src.i === i || src.i === j) : (src.i === i || src.i === j || src.j === i || src.j === j);
        if (!shares || (src.kind === 'bond' && src.i === i && src.j === j)) continue;
        const [bx, by] = scene.atomScreen(j);
        test((ax + bx) / 2, (ay + by) / 2, { kind: 'bond', i, j }, 0);
      }
    }
    return best;
  }

  toMove(src, sink) {
    const m = {};
    if (src.kind === 'lp') m.lp = src.i; else { m.b0 = src.i; m.b1 = src.j; }
    if (sink.kind === 'atom') m.to = sink.i; else { m.t0 = sink.i; m.t1 = sink.j; }
    return m;
  }

  // ------------------------------------------------------------ gesture
  down(x, y) {
    if (this.finished || this.busy) return;
    const src = this.pickSource(x, y);
    if (!src) return;
    const a = this.worldOf(src);
    this.drag = { src, a, path: [[x, y]], sink: null, ribbon: this.scene.ribbon(), crossed: 0 };
    this.drag.ribbon.mat.uniforms.uHot.value = 0;
    this.scene.frozen = true;
    this.sound.tap();
    this.glow(src.i);
    this.app.haptic(6);
    this.drawDrag(x, y);
  }

  drawDrag(x, y) {
    const d = this.drag, z = d.a[2];
    const end = d.sink ? this.worldOf(d.sink) : this.scene.toWorld(x, y, z);
    const mid = d.path[Math.floor(d.path.length / 2)], m = this.scene.toWorld(mid[0], mid[1], z);
    const c = this.control(d.a, end, m);
    d.ribbon.shape(d.a, c, end, 0.07, Math.hypot(end[0] - d.a[0], end[1] - d.a[1]) > 0.5);
  }

  control(a, b, m) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    let bx = (m[0] - mx) * 2, by = (m[1] - my) * 2, bulge = (bx * -dy + by * dx) / l;
    const min = Math.min(0.9, l * 0.42) * (bulge >= 0 ? 1 : -1);
    if (Math.abs(bulge) < Math.abs(min)) bulge = min;
    bulge = Math.max(-1.8, Math.min(1.8, bulge));
    return [mx - dy / l * bulge, my + dx / l * bulge, a[2]];
  }

  move(x, y) {
    const d = this.drag; if (!d) return;
    d.path.push([x, y]);
    const s = this.pickSink(x, y, d.src);
    const key = (h) => (h ? `${h.kind}${h.i}:${h.j}` : '');
    if (key(s) !== key(d.sink)) { d.sink = s; if (s) { d.crossed += 1; this.sound.stroke(d.crossed); this.app.haptic(4); this.glow(s.i); } else this.glow(d.src.i); }
    this.drawDrag(x, y);
  }

  up() {
    const d = this.drag; if (!d) return;
    this.drag = null; this.scene.frozen = false;
    const r = d.ribbon;
    if (!d.sink) { r.broken = true; r.life = 0.6; this.glow(); return; }
    this.arrowCount += 1;
    const m = this.toMove(d.src, d.sink), res = this.ses.arrow(m);
    this.lastResult = res;
    if (res.verdict === 'reject') return this.refuse(r, res, d);
    r.mat.uniforms.uHot.value = 1;
    r.mat.uniforms.uFlow.value = 0;
    r.mat.uniforms.uFlowT = 1;
    this.live.push(r);
    this.scene.setState(this.cur, r.curve);
    this.scene.burst(d.a, 6, 1.1);
    this.sound.good(this.arrowCount);
    this.app.haptic(14);
    if (res.verdict === 'pending') { r.life = undefined; this.sound.held(); this.ui.say(res.text, null, 'open'); this.glow(res.at); return; }
    this.settle(res);
  }

  refuse(r, res, d) {
    r.broken = true; r.life = 1.0; r.mat.uniforms.uHot.value = 0;
    this.sound.bad(); this.app.haptic([18, 30, 18]);
    this.ui.say(res.text, null, 'bad');
    if (res.arrows) {
      for (const q of this.live) { q.broken = true; q.life = 1; q.mat.uniforms.uHot.value = 0; }
      this.live = [];
      this.scene.setState(this.cur);
    }
    this.glow(res.at ?? -1);
  }

  // A step's closing words: one sentence at a time, each with its tag.
  fill(t) { return t.replace('{inline}', this.scene.site.inline ?? ''); }
  closing(line) { return [].concat(line).map((x) => (Array.isArray(x) ? [x[0], this.fill(x[1])] : [null, this.fill(x)])); }

  settle(res) {
    for (const q of this.live) q.life = 1.3;
    this.live = [];
    this.glow();
    const { ses, ch } = this;
    if (res.trap) { this.sound.bad(); this.ui.say(res.text, null, 'bad'); setTimeout(() => this.ui.say(`${res.text} ${ch.trap || ''}`, null, 'bad'), 50); return; }
    if (res.same) { this.ui.say(res.text, null, 'open'); return; }
    if (res.onRoute) { const s = ch.steps[ses.index]; this.ui.say(res.note || s.nudge || s.say, null, 'open'); return; }
    if (res.stepDone) {
      const i = ses.index - 1;
      this.stepCount += 1;
      this.layers = Math.min(3, this.layers + 1);
      this.app.musicLayers(this.layers);
      this.sound.stepDone(i);
      const line = ch.steps[Math.min(i, ch.steps.length - 1)].done;
      this.scene.setState(this.cur);
      if (res.finished) { this.finish(line); return; }
      this.busy = true;
      this.ui.tell(this.closing(line)).then(() => { this.busy = false; this.bindRow(); this.sayStep(); });
    }
  }

  finish(line) {
    this.finished = true;
    this.app.onPointer = null;
    this.scene.glowWant = null;
    this.sound.gongNow();
    this.app.haptic(30);
    this.scene.burst([0, 0, 2], 30, 1.8);
    this.ui.tell(this.closing(line), 'Go on').then(() => this.resolve(true));
  }

  undo() {
    if (this.drag || this.busy) return;
    if (this.live.length) { const r = this.live.pop(); r.broken = true; r.life = 0.5; }
    else for (const q of this.live) q.life = 0.2;
    if (this.ses.undo()) { this.scene.setState(this.cur); this.sayStep(); this.sound.tap(); }
  }

  // The engine draws the next arrow as a ghost. The player still has to draw it.
  hint() {
    if (this.drag || this.busy) return;
    const { ses, ch } = this;
    let m = null;
    if (!ses.live.length && sigmaKey(ses.st) === ses.step.startKey) m = resolveArrow(ses.st, ses.step.ref[0]);
    else m = ses.peekArrow() || null;
    if (!m) { this.ui.say('No legal arrow leads on from here. Press undo.', null, 'open'); return; }
    if (!(ch.free && ses.index === 0)) ses.hints += 1;
    const toHit = () => {
      const src = m.lp !== undefined ? { kind: 'lp', i: m.lp } : { kind: 'bond', i: m.b0, j: m.b1 };
      const sink = m.to !== undefined ? { kind: 'atom', i: m.to } : { kind: 'bond', i: m.t0, j: m.t1 };
      return [src, sink];
    };
    const [src, sink] = toHit();
    const a = this.worldOf(src), b = this.worldOf(sink), r = this.scene.ribbon();
    const c = this.control(a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]]);
    r.shape(a, c, b, 0.05, true);
    r.mat.uniforms.uHot.value = 0.5; r.mat.uniforms.uAlpha.value = 0.75; r.life = 2.6;
    this.glow(src.i);
    this.sound.tap();
    this.hintArrow = { src, sink };
  }
}
