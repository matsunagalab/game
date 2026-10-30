// Chapter three: turn each helix on its helical wheel so that its oily face looks into the core, then squeeze.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER, YELLOW_INK, GREEN_INK } from '../press.js';
import { Ribbon, Atoms } from '../ribbon.js';
import { protein, classOf, TONE } from '../proteins.js';
import { buzz } from '../sound.js';
import { $, button, clamp, ease, wrapDeg } from '../ui.js';

const HYDROPATHY = { A: 0.3, V: 1, I: 1, L: 1, M: 0.8, F: 1, W: 0.8, C: 0.6, Y: 0.3, P: 0, G: 0, T: -0.1, S: -0.3, H: -0.4, N: -0.6, Q: -0.6, D: -1, E: -1, K: -1, R: -1, X: 0 };
const INK = { oil: '#ff9a1f', polar: '#a9b6ea', plus: '#ff4a9e', minus: '#1f2aa6', special: '#f6f8f7' };
const STEP = 20;
const GAP = 7;

function segment(p, a, b, isHelix, sideCentre) {
  const ca = p.caXYZ;
  const W = isHelix ? 4 : 1;
  const pts = [];
  for (let i = a; i + W - 1 <= b; i++) {
    const q = new THREE.Vector3();
    for (let j = 0; j < W; j++) q.add(new THREE.Vector3(ca[(i + j) * 3], ca[(i + j) * 3 + 1], ca[(i + j) * 3 + 2]));
    pts.push(q.divideScalar(W));
  }
  const axis = pts[pts.length - 1].clone().sub(pts[0]).normalize();
  const center = pts.reduce((s, q) => s.add(q), new THREE.Vector3()).divideScalar(pts.length);
  return { a, b, axis, center, theta: 0, shown: 0, gap: 0, seated: true, dial: false };
}

// The direction a helix's oily side faces: the hydrophobic moment, measured from the real side chains.
function oilyFace(p, seg, sideCentre) {
  const mu = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = seg.a; i <= seg.b; i++) {
    const c = sideCentre[i];
    if (!c) continue;
    q.set(c.x - p.caXYZ[i * 3], c.y - p.caXYZ[i * 3 + 1], c.z - p.caXYZ[i * 3 + 2]);
    q.addScaledVector(seg.axis, -q.dot(seg.axis)).normalize();
    mu.addScaledVector(q, HYDROPATHY[p.seq[i]] ?? 0);
  }
  seg.e1 = mu.normalize();
  seg.e2 = seg.axis.clone().cross(seg.e1);
  seg.dots = [];
  for (let i = seg.a; i <= seg.b; i++) {
    const c = sideCentre[i];
    if (!c) continue;
    q.set(c.x - p.caXYZ[i * 3], c.y - p.caXYZ[i * 3 + 1], c.z - p.caXYZ[i * 3 + 2]);
    q.addScaledVector(seg.axis, -q.dot(seg.axis));
    seg.dots.push({ aa: p.seq[i], at: Math.atan2(q.dot(seg.e2), q.dot(seg.e1)), i: i - seg.a });
  }
  // A long helix would bury its own wheel in dots; its middle stretch tells the same story.
  if (seg.dots.length > 18) {
    const skip = (seg.dots.length - 18) >> 1;
    seg.dots = seg.dots.slice(skip, skip + 18);
  }
}

class Wheel {
  constructor(size, parent, cls = 'wheel') {
    this.size = size;
    this.el = $('canvas', cls);
    const r = Math.min(2, devicePixelRatio || 1);
    this.ratio = r;
    this.el.width = this.el.height = size * r;
    this.el.style.width = this.el.style.height = `${size}px`;
    parent.append(this.el);
  }

  draw(seg, { big = false, selected = false, verdict = '' } = {}) {
    const g = this.el.getContext('2d');
    const { ratio: r, size: S } = this;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, S, S);
    const c = S / 2;
    const R = c - 2;
    g.beginPath();
    g.arc(c, c, R, 0, 7);
    g.fillStyle = seg.seated ? '#ffd21f' : '#ffffff';
    g.fill();
    g.lineWidth = selected ? 4 : 2.5;
    g.strokeStyle = '#1f2aa6';
    g.stroke();
    if (big) {
      g.lineWidth = 1.5;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + (seg.shown * Math.PI) / 180;
        g.beginPath();
        g.moveTo(c + Math.sin(a) * (R - 3), c - Math.cos(a) * (R - 3));
        g.lineTo(c + Math.sin(a) * (R - 9), c - Math.cos(a) * (R - 9));
        g.stroke();
      }
    }
    // The notch at the top marks the way to the core.
    g.fillStyle = '#ff4a9e';
    const w = big ? 13 : 7;
    g.beginPath();
    g.moveTo(c - w, 0);
    g.lineTo(c + w, 0);
    g.lineTo(c, big ? 20 : 10);
    g.closePath();
    g.fill();
    g.strokeStyle = '#1f2aa6';
    g.lineWidth = 1.5;
    g.stroke();

    const n = seg.dots.length;
    const dotR = big ? clamp(S / 14, 9, 13) : clamp(S / 16, 2.4, 4.2);
    for (const d of seg.dots) {
      const a = d.at + (seg.shown * Math.PI) / 180;
      // Later residues spiral inward so that they do not sit on top of earlier ones.
      const rr = R - (big ? 26 : 9) - ((d.i % 7) / 7) * R * (big ? 0.42 : 0.45);
      const x = c + Math.sin(a) * rr;
      const y = c - Math.cos(a) * rr;
      g.beginPath();
      g.arc(x, y, dotR, 0, 7);
      g.fillStyle = INK[classOf(d.aa)];
      g.fill();
      g.lineWidth = big ? 1.5 : 1;
      g.strokeStyle = '#1f2aa6';
      g.stroke();
      if (big) {
        g.fillStyle = classOf(d.aa) === 'minus' ? '#ffffff' : '#1f2aa6';
        g.font = `800 ${dotR * 1.25}px Bricolage, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(d.aa, x, y + 0.5);
      }
    }
    void n;
    if (verdict) {
      g.font = `800 ${S * 0.2}px Bricolage, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = '#ffffff';
      g.strokeText(verdict, c, c);
      g.fillStyle = '#1f2aa6';
      g.fillText(verdict, c, c);
    }
  }
}

class Core {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage });
    const { press, rig, hud, layer } = ctx;
    this.press = press;
    this.rig = rig;
    this.sound = ctx.sound;
    this.layer = layer;
    press.setPaper(PAPER.pink);
    press.setFlood([0, 0, 0]);
    press.clearDisc();
    press.uniforms.uShadow.value = 0.16;

    const p = (this.p = protein(stage.protein));
    this.sideCentre = this.sideCentres();
    const step = stage.flip ? 180 : STEP;
    this.step = step;

    this.segs = [];
    for (const [a, b] of stage.dials) {
      const s = segment(p, a, b, !stage.flip);
      s.dial = true;
      s.seated = false;
      oilyFace(p, s, this.sideCentre);
      this.segs.push(s);
    }
    for (const [a, b] of stage.fixed ?? []) this.segs.push(segment(p, a, b, !stage.flip));
    this.segs.sort((x, y) => x.a - y.a);
    this.dials = this.segs.filter((s) => s.dial);

    // Centre of the fold, used to push loose helices outward.
    const c = new THREE.Vector3();
    for (let i = 0; i < p.n; i++) c.add(new THREE.Vector3(p.caXYZ[i * 3], p.caXYZ[i * 3 + 1], p.caXYZ[i * 3 + 2]));
    this.centre = c.divideScalar(p.n);
    let random = stage.id.length * 7 + 3;
    const rand = () => (random = (random * 16807) % 2147483647) / 2147483647;
    for (const s of this.dials) {
      const out = s.center.clone().sub(this.centre);
      out.addScaledVector(s.axis, -out.dot(s.axis));
      s.out = out.lengthSq() > 0.01 ? out.normalize() : s.e1.clone().negate();
      if (stage.flip) s.theta = s.shown = 180;
      else {
        const k = 4 + Math.floor(rand() * 11);
        s.theta = s.shown = wrapDeg(k * STEP);
      }
      s.gap = GAP;
      s.gapGoal = GAP;
      s.matrix = new THREE.Matrix4();
    }
    for (const s of this.segs) if (!s.dial) {
      s.out = new THREE.Vector3();
      s.matrix = new THREE.Matrix4();
    }

    this.ribbon = new Ribbon(p.ss, p.chainEnds, { helixWidth: 1.25, strandWidth: 1.3, coil: 0.3, thickness: 0.3 });
    this.caOut = new Float32Array(p.n * 3);
    this.oOut = new Float32Array(p.n * 3);
    press.scene.add(this.ribbon.mesh);
    this.atoms = new Atoms(p.atomEl.length + p.hetEl.length + 40);
    press.scene.add(this.atoms.mesh);
    this.sideAtoms = [];
    for (let i = 0; i < p.atomEl.length; i++) if (p.atomSide[i] === '1' || p.seq[p.atomRes[i]] === 'X') this.sideAtoms.push(i);
    this.water = [];
    for (let i = 0; i < 32; i++) {
      const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(3 + rand() * 7).add(this.centre);
      this.water.push({ home: v, seed: rand() * 6 });
    }

    this.selected = 0;
    this.tries = 0;
    this.state = 'dial';
    this.t = 0;
    this.glow = 0;
    this.buildResidueMap();
    this.buildDock();

    let radius = 0;
    for (let i = 0; i < p.n; i++) radius = Math.max(radius, Math.hypot(p.caXYZ[i * 3] - this.centre.x, p.caXYZ[i * 3 + 1] - this.centre.y, p.caXYZ[i * 3 + 2] - this.centre.z));
    this.radius = radius + GAP * 0.7;
    rig.target.copy(this.centre);
    rig.targetGoal.copy(this.centre);
    rig.spin = 0;
    this.faceView();
    ctx.onLayout = () => this.layout();
    this.layout();
    this.applyPose();
    hud.setGoal(stage.flip ? 'Each strand has two faces. Tap a wheel to pick a strand, spin it to flip, then squeeze.' : 'Turn the wheel until the orange residues sit under the pink notch. Then squeeze.');
  }

  // Start with the first dial's oily face pointing sideways, so that the roll is easy to see.
  faceView() {
    const s = this.dials[0];
    const v = s.center.clone().sub(this.centre);
    const dir = v.lengthSq() > 0.01 ? v.normalize() : new THREE.Vector3(0, 0, 1);
    const view = dir.clone().add(new THREE.Vector3(0.3, 0.5, 0.7)).normalize();
    this.rig.yaw = Math.atan2(view.x, view.z);
    this.rig.pitch = Math.asin(clamp(view.y, -0.9, 0.9)) * 0.7;
  }

  sideCentres() {
    const { p } = this;
    const out = new Array(p.n).fill(null);
    const count = new Array(p.n).fill(0);
    for (let i = 0; i < p.atomEl.length; i++) {
      if (p.atomSide[i] !== '1') continue;
      const r = p.atomRes[i];
      out[r] ??= new THREE.Vector3();
      out[r].add(new THREE.Vector3(p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2]));
      count[r]++;
    }
    out.forEach((v, i) => v?.divideScalar(count[i]));
    return out;
  }

  // Each residue follows one segment, or a blend of two when it lies on the loop between them.
  buildResidueMap() {
    const { p, segs } = this;
    this.follow = new Array(p.n);
    for (let i = 0; i < p.n; i++) {
      let prev = null;
      let next = null;
      for (const s of segs) {
        if (i >= s.a && i <= s.b) {
          prev = next = s;
          break;
        }
        if (p.chain[s.a] !== p.chain[i]) continue;
        if (s.b < i) prev = s;
        if (s.a > i && !next) next = s;
      }
      const a = prev ?? next;
      const b = next ?? prev;
      this.follow[i] = a === b ? { a, b, f: 0 } : { a, b, f: (i - a.b) / (b.a - a.b) };
    }
  }

  layout() {
    const { cssW: w, cssH: h } = this.press;
    const box = this.dock.getBoundingClientRect();
    const dockH = box.height + 8;
    const dockW = box.width;
    const fov = this.press.camera.fov;
    let free;
    // On a short, wide screen the dock moves to the side; the stylesheet decides, so measure rather than guess.
    if (dockW < w * 0.7) {
      free = Math.min(w - dockW, h - 70);
      this.press.setFocus((w - dockW) / 2 / w, 0.56);
    } else {
      const top = 104;
      const room = h - dockH - top;
      free = Math.min(w, room);
      this.press.setFocus(0.5, (top + room / 2) / h);
    }
    this.rig.distTarget = ((this.radius / Math.tan((fov * Math.PI) / 360)) * h) / free;
    this.rig.dist = this.rig.distTarget;
  }

  buildDock() {
    const dock = (this.dock = $('div', 'core-dock'));
    const main = $('div', 'dial-wrap');
    const big = (this.bigSize = Math.round(clamp(Math.min(innerWidth * 0.5, innerHeight * 0.26), 150, 230)));
    this.big = new Wheel(big, main, 'wheel big');
    const side = $('div', 'dial-side');
    const minis = $('div', 'minis');
    const mini = this.dials.length > 4 ? 46 : 58;
    this.minis = this.dials.map((s, i) => {
      const b = $('button', 'mini');
      b.type = 'button';
      b.setAttribute('aria-label', `Pick ${this.stage.flip ? 'strand' : 'helix'} ${i + 1}`);
      const w = new Wheel(mini, b, 'wheel');
      b.addEventListener('click', () => {
        if (s.seated) return;
        this.select(i);
      });
      minis.append(b);
      return { w, b };
    });
    this.squeezeBtn = button('btn pink squeeze', 'Squeeze', () => this.squeeze());
    side.append(minis, this.squeezeBtn);
    dock.append(main, side);
    this.layer.append(dock);
    this.bindWheel();
    this.drawWheels();
  }

  bindWheel() {
    const el = this.big.el;
    const angle = (e) => {
      const r = el.getBoundingClientRect();
      return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    };
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (this.state !== 'dial' || !this.current() || this.current().seated) return;
      this.turning = true;
      this.lastAngle = angle(e);
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.turning) return;
      const a = angle(e);
      const s = this.current();
      s.free = (s.free ?? s.theta) + wrapDeg(a - this.lastAngle);
      this.lastAngle = a;
      this.setTheta(s, Math.round(s.free / this.step) * this.step);
    });
    const end = () => {
      this.turning = false;
      const s = this.current();
      if (s) s.free = s.theta;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', 'Turn the selected helix. Use the left and right arrow keys.');
    el.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const s = this.current();
      if (s && !s.seated && this.state === 'dial') {
        this.setTheta(s, s.theta + d * this.step);
        s.free = s.theta;
      }
    });
  }

  setTheta(s, v) {
    if (v === s.theta) return;
    s.theta = v;
    this.sound.ratchet();
    buzz(5);
    this.drawWheels();
  }

  current() {
    return this.dials[this.selected];
  }

  select(i) {
    this.selected = i;
    this.sound.tick(0.12);
    this.repaint = true;
    this.drawWheels();
  }

  drawWheels() {
    const cur = this.current();
    if (cur) this.big.draw(cur, { big: true, selected: true });
    this.dials.forEach((s, i) => {
      const m = this.minis[i];
      m.w.draw(s, { selected: i === this.selected, verdict: s.verdict ?? '' });
      m.b.classList.toggle('on', i === this.selected);
    });
  }

  squeeze() {
    if (this.state !== 'dial') return;
    this.tries++;
    this.state = 'squeeze';
    this.t = 0;
    this.sound.squeeze();
    buzz(30);
    for (const s of this.dials) s.gapStart = s.gap;
    this.squeezeBtn.disabled = true;
  }

  resolve() {
    const missed = [];
    for (const s of this.dials) {
      if (s.seated) continue;
      const err = Math.abs(wrapDeg(s.theta));
      const ok = this.stage.flip ? err < 90 : err <= 30;
      if (ok) {
        s.seated = true;
        s.settle = true;
        s.verdict = '';
        s.gap = 0;
        s.gapGoal = 0;
      } else {
        s.gapGoal = GAP;
        s.verdict = err <= 70 ? 'close' : 'far';
        missed.push(s);
      }
    }
    this.sound.clunk();
    if (missed.length === 0) {
      this.win();
      return;
    }
    this.sound.bounce();
    this.state = 'dial';
    this.squeezeBtn.disabled = false;
    if (this.current().seated) this.selected = this.dials.indexOf(missed[0]);
    const n = missed.length;
    this.ctx.hud.setGoal(n === 1 ? 'One still springs out: polar residues hate the core. Check its wheel.' : `${n} still spring out: polar residues hate the core. Check their wheels.`);
    this.repaint = true;
    this.drawWheels();
  }

  win() {
    const { ctx, stage } = this;
    this.state = 'won';
    this.t = 0;
    ctx.earn(0);
    if (this.tries <= stage.par[0]) ctx.earn(1);
    if (this.tries <= stage.par[1]) ctx.earn(2);
    this.sound.bloom();
    buzz(40);
    this.dock.classList.add('gone');
    ctx.hud.setGoal('');
    this.rig.spin = 0.18;
    const finale = { myoglobin: 3.4, gfp: 4.6 }[stage.id] ?? 2.2;
    const lines = { myoglobin: 'The heme slides into the one pocket the fold leaves open.', gfp: 'Sealed from water, the chromophore lights up.' };
    ctx.finishSoon(lines[stage.id] ?? `Closed in ${this.tries} ${this.tries === 1 ? 'squeeze' : 'squeezes'}. Water is out and the oil is in.`, finale * 1000);
    if (stage.id === 'myoglobin') {
      this.hemeT = 0;
      this.heme = true;
    }
    if (stage.id === 'gfp') {
      document.body.classList.add('night');
      this.press.setFlood([0, 0, 1]);
      this.press.uniforms.uShadow.value = 0;
      this.night = true;
      this.repaint = true;
      const x = this.p.seq.indexOf('X');
      if (x >= 0) this.flame = new THREE.Vector3(this.p.caXYZ[x * 3], this.p.caXYZ[x * 3 + 1], this.p.caXYZ[x * 3 + 2]);
    }
  }

  applyPose() {
    const { p, follow, caOut, oOut, atoms } = this;
    const T = new THREE.Matrix4();
    const R = new THREE.Matrix4();
    const B = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const s of this.segs) {
      if (!s.dial) continue;
      q.setFromAxisAngle(s.axis, (s.shown * Math.PI) / 180);
      R.makeRotationFromQuaternion(q);
      T.makeTranslation(s.center.x + s.out.x * s.gap, s.center.y + s.out.y * s.gap, s.center.z + s.out.z * s.gap);
      B.makeTranslation(-s.center.x, -s.center.y, -s.center.z);
      s.matrix.copy(T).multiply(R).multiply(B);
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const moved = (i, x, y, z) => {
      const f = follow[i];
      a.set(x, y, z);
      if (f.a.dial) a.applyMatrix4(f.a.matrix);
      if (f.f === 0 || f.b === f.a) return a;
      b.set(x, y, z);
      if (f.b.dial) b.applyMatrix4(f.b.matrix);
      return a.lerp(b, f.f);
    };
    for (let i = 0; i < p.n; i++) {
      let v = moved(i, p.caXYZ[i * 3], p.caXYZ[i * 3 + 1], p.caXYZ[i * 3 + 2]);
      caOut[i * 3] = v.x;
      caOut[i * 3 + 1] = v.y;
      caOut[i * 3 + 2] = v.z;
      v = moved(i, p.oXYZ[i * 3], p.oXYZ[i * 3 + 1], p.oXYZ[i * 3 + 2]);
      oOut[i * 3] = v.x;
      oOut[i * 3 + 1] = v.y;
      oOut[i * 3 + 2] = v.z;
    }
    this.ribbon.setCoords(caOut, oOut);
    const seg = this.current();
    this.ribbon.paint(
      (i) => {
        const f = follow[i];
        const on = f.a === seg && f.f === 0 && this.state !== 'won';
        if (this.night) return this.p.ss[i] === 'C' ? [0, 0.6, 0.15] : [0, 1, 0];
        return on ? [0, 1, 0] : [0, 0, 0.1];
      },
      (i) => 1 + (this.segs.indexOf(follow[i].a) + 1) * 3,
    );
    let n = 0;
    const won = this.state === 'won';
    for (const i of this.sideAtoms) {
      const r = p.atomRes[i];
      const v = moved(r, p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2]);
      const aa = p.seq[r];
      const f = follow[r];
      const inFocus = won || (f.a === seg && f.f === 0);
      // Only the chosen helix prints at full strength, so that its turning face stands out from the crowd.
      const base = aa === 'X' ? [0, 1, this.night ? 0 : 0.4] : TONE[classOf(aa)];
      const quiet = f.a.seated && !won ? 0.5 : 0.22;
      const ink = inFocus ? base : aa === 'X' ? base : [base[0] * quiet, base[1] * quiet, base[2] * quiet + 0.06];
      // Once the lantern lights, the side chains melt away and leave the barrel and its flame.
      const melt = this.night && aa !== 'X' ? 1 - ease(clamp(this.t / 1.2, 0, 1)) : 1;
      const size = (inFocus ? 1.5 : f.a.seated ? 1.25 : 1.05) * melt;
      if (size > 0.01) atoms.set(n++, v.x, v.y, v.z, size, ink, 120 + (r % 60));
    }
    this.waterStart = n;
    n = this.drawWater(n);
    n = this.drawHeme(n);
    atoms.commit(n);
  }

  // The water keeps moving when nothing else does, and only needs its own slots rewritten.
  stirWater() {
    if (this.waterStart === undefined) return;
    const end = this.drawWater(this.waterStart);
    this.drawHeme(end);
    this.atoms.commit(end + (this.heme ? this.p.hetEl.length : 0));
  }

  drawWater(n) {
    const t = this.clock ?? 0;
    const blow = this.state === 'won' ? ease(Math.min(1, this.t / 0.8)) : 0;
    const closed = this.dials.filter((s) => s.seated).length / this.dials.length;
    if (blow >= 1) return n;
    const shown = Math.round(this.water.length * (1 - closed * 0.7));
    for (let i = 0; i < shown; i++) {
      const w = this.water[i];
      const v = w.home.clone().sub(this.centre).multiplyScalar(1 + blow * 3.2).add(this.centre);
      v.x += Math.sin(t * 1.3 + w.seed) * 0.5;
      v.y += Math.cos(t * 1.1 + w.seed * 2) * 0.5;
      this.atoms.set(n++, v.x, v.y, v.z, 0.75, [0, 0, 0.75], 255);
    }
    return n;
  }

  drawHeme(n) {
    if (!this.heme) return n;
    const { p } = this;
    const k = 1 - ease(clamp((this.t - 0.5) / 1.3, 0, 1));
    const lift = 44 * k;
    for (let i = 0; i < p.hetEl.length; i++) {
      this.atoms.set(n++, p.hetXYZ[i * 3], p.hetXYZ[i * 3 + 1] + lift, p.hetXYZ[i * 3 + 2], 1.5, p.hetEl[i] === 'F' ? [0, 1, 0] : [1, 1, 0], 110);
    }
    return n;
  }

  update(dt) {
    this.clock = (this.clock ?? 0) + dt;
    this.t += dt;
    let moving = false;
    for (const s of this.dials) {
      const d = wrapDeg(s.theta - s.shown);
      if (Math.abs(d) > 0.05) {
        s.shown += d * (1 - Math.exp(-dt * 18));
        moving = true;
      }
      if (s.settle) {
        s.theta = 0;
        if (Math.abs(s.shown) < 0.2) s.settle = false;
      }
    }
    if (this.state === 'squeeze') {
      const e = ease(clamp(this.t / 0.5, 0, 1));
      for (const s of this.dials) if (!s.seated) s.gap = s.gapStart * (1 - e);
      moving = true;
      if (this.t >= 0.5) this.resolve();
    } else {
      for (const s of this.dials) {
        if (s.gapGoal === undefined) continue;
        const d = s.gapGoal - s.gap;
        if (Math.abs(d) > 0.01) {
          s.gap += d * (1 - Math.exp(-dt * 11));
          moving = true;
        }
      }
    }
    if (this.state === 'won') moving = this.t < 3;
    if (this.night) moving = this.t < 2;
    if (moving || this.repaint) {
      this.repaint = false;
      this.applyPose();
      this.drawWheels();
    } else this.stirWater();
    if (this.night) {
      // Swap the yellow drum for green, as a printer would, and let the lantern swell from the chromophore.
      const e = ease(clamp(this.t / 1.1, 0, 1));
      const ink = this.press.uniforms.uYellow.value;
      ink.set(...YELLOW_INK.map((v, i) => v + (GREEN_INK[i] - v) * e));
      this.glow = Math.min(1, this.glow + dt / 1.5);
      const c = this.ctx.overlay.project(this.flame ?? this.centre);
      const u = this.press.uniforms.uGlow.value;
      const breathe = 1 + Math.sin(this.clock * 2.2) * 0.03;
      u.set(c.x / this.press.cssW, 1 - c.y / this.press.cssH, ease(this.glow) * breathe);
    }
  }

  dispose() {
    const { press } = this;
    press.scene.remove(this.ribbon.mesh, this.atoms.mesh);
    this.ribbon.dispose();
    this.atoms.dispose();
    this.dock.remove();
    press.uniforms.uYellow.value.set(...YELLOW_INK);
    press.setFocus(0.5, 0.5, true);
    this.rig.spin = 0;
  }
}

export const startCore = (ctx, stage) => new Core(ctx, stage);
