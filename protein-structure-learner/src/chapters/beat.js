// Chapter two: where a residue sits along the chain decides which way its side chain points.
// The player works out the spacing, hears it as a beat, then reads it in real sequences.
import * as THREE from '../../vendor/three/three.module.js';
import { PAPER } from '../press.js';
import { Ribbon, Atoms } from '../ribbon.js';
import { buildChain, DEG } from '../peptide.js';
import { protein, classOf, ssTone, TONE } from '../proteins.js';
import { buzz } from '../sound.js';
import { $, button, clamp, ease } from '../ui.js';

const PERFECT = 0.065;
const GOOD = 0.14;
const TURN = 360 / 3.5; // a coiled coil trims a helix to 3.5 residues per turn, so its stripe stays on one face

// The a and d positions of the heptad, on both chains of GCN4.
function chooseNotes(p) {
  const notes = new Array(p.n).fill(false);
  for (const i of [1, 4, 8, 11, 15, 18, 22, 25, 29]) {
    notes[i] = true;
    notes[i + 31] = true;
  }
  return notes;
}

// One pitch per amino acid, all from one scale, so any sequence is a tune.
const PITCH = { L: 5, V: 7, I: 4, M: 2, F: 3, W: 0, A: 9, Y: 6, C: 8, N: 10 };

// The ride: the same rhythm, now played from what the player has worked out. Every bead looks alike.
class Ride {
  constructor(ctx, stage, onDone) {
    Object.assign(this, { ctx, stage, onDone });
    const { press, rig, hud } = ctx;
    this.press = press;
    this.rig = rig;
    this.overlay = ctx.overlay;
    this.sound = ctx.sound;
    document.body.classList.add('night');
    press.setPaper(PAPER.white);
    press.setFlood([0, 0, 1]);
    press.uniforms.uShadow.value = 0;
    rig.manual = true;
    rig.enabled = false;

    const p = (this.p = protein(stage.protein));
    this.notes = chooseNotes(p);
    this.ribbon = new Ribbon(p.ss, p.chainEnds, { helixWidth: 1.5, strandWidth: 1.4 });
    this.ribbon.setCoords(p.caXYZ, p.oXYZ);
    this.painted = new Array(p.n).fill(false);
    // One id per run of secondary structure: key lines belong between elements, not between residues.
    this.sseId = [];
    let run = 1;
    for (let i = 0; i < p.n; i++) {
      if (i && (p.ss[i] !== p.ss[i - 1] || p.chain[i] !== p.chain[i - 1])) run = (run % 90) + 1;
      this.sseId.push(run);
    }
    this.paint();
    press.scene.add(this.ribbon.mesh);

    // Side chains stay hidden until the player taps them.
    this.atoms = new Atoms(p.atomEl.length);
    this.atomsOf = Array.from({ length: p.n }, () => []);
    let count = 0;
    for (let i = 0; i < p.atomEl.length; i++) {
      if (p.atomSide[i] !== '1') continue;
      const r = p.atomRes[i];
      this.atoms.set(count, p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2], 0, TONE[classOf(p.seq[r])] ?? TONE.polar, 200 + (r % 40));
      this.atomsOf[r].push(count);
      count++;
    }
    this.atoms.commit(count);
    press.scene.add(this.atoms.mesh);
    this.blooms = [];

    // The score: residues in order, with a rest between chains so the meter survives the jump.
    this.steps = [];
    let first = 0;
    const bar = stage.meter[0] + stage.meter[1];
    for (const end of [...p.chainEnds, p.n - 1]) {
      for (let i = first; i <= end; i++) this.steps.push(i);
      first = end + 1;
      if (end !== p.n - 1) while (this.steps.length % bar) this.steps.push(-1);
    }
    // Line the first buried residue up with beat one.
    this.offset = 1;
    this.items = [];
    this.steps.forEach((r, s) => {
      if (r >= 0 && this.notes[r]) this.items.push({ step: s, res: r, state: 0 });
    });

    this.path = this.buildPath();
    this.cam = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.posAt(-8, this.cam);
    this.posAt(0, this.look);

    this.phase = 'wait';
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.hits = 0;
    this.pop = [];
    this.nextStep = -2 * bar;
    this.flash = 0;
    hud.setGoal('Every bead looks the same now. Tap each a and d as it reaches the ring: three, then four. Tap to start.');

    this.onPress = (e) => {
      if (e.target.closest?.('button')) return;
      this.tap();
    };
    this.onKey = (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyJ' || e.code === 'Enter') {
        e.preventDefault();
        this.tap();
      }
    };
    this.onHide = () => {
      if (document.hidden && this.phase === 'play') this.pause();
    };
    document.addEventListener('pointerdown', this.onPress);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onHide);
    ctx.onLayout = () => this.layout();
    this.layout();
  }

  layout() {
    const { cssW: w, cssH: h } = this.press;
    const landscape = w > h * 1.15;
    this.trackY = h - (landscape ? 58 : Math.max(120, h * 0.2)) - this.ctx.safeBottom();
    this.hitX = Math.max(64, w * 0.2);
    this.spacing = clamp(w / 8.2, 42, 66);
    this.press.setFocus(0.5, landscape ? 0.42 : 0.42, true);
    this.baseDisc = 0.42;
    this.press.setDisc(0.5, 0.42, this.baseDisc, [1, 0, 0]);
  }

  paint() {
    const { p } = this;
    const inks = (i) => {
      const t = ssTone(p.ss[i]);
      if (this.painted[i]) return [0.34, 1, 0];
      return [t[0] * 0.75 + 0.0, t[1] * 0.85, t[2]];
    };
    this.ribbon.paint(inks, (i) => this.sseId[i]);
  }

  buildPath() {
    const { p } = this;
    const c = new Float32Array(p.n * 3);
    for (let i = 0; i < p.n; i++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        let w = 0;
        for (let j = -3; j <= 3; j++) {
          const r = i + j;
          if (r < 0 || r >= p.n || p.chain[r] !== p.chain[i]) continue;
          s += p.caXYZ[r * 3 + k];
          w++;
        }
        c[i * 3 + k] = s / w;
      }
    }
    return c;
  }

  // Position along the score, in steps. Beyond either end it runs straight on.
  posAt(u, out) {
    const { steps, path } = this;
    const last = steps.length - 1;
    if (u < 0 || u > last) {
      // Beyond the ends of the chain, carry on in a straight line.
      const end = u < 0 ? steps[0] : steps[last];
      const inner = steps[u < 0 ? 5 : last - 5];
      const k = (u < 0 ? -u : u - last) / 5;
      return out.set(
        path[end * 3] + (path[end * 3] - path[inner * 3]) * k,
        path[end * 3 + 1] + (path[end * 3 + 1] - path[inner * 3 + 1]) * k,
        path[end * 3 + 2] + (path[end * 3 + 2] - path[inner * 3 + 2]) * k,
      );
    }
    const at = (s) => {
      let i = clamp(Math.floor(s), 0, steps.length - 1);
      while (steps[i] < 0 && i > 0) i--;
      return steps[i];
    };
    const r0 = at(u);
    const r1 = at(u + 1);
    const f = clamp(u - Math.floor(u), 0, 1);
    const near = this.p.chain[r0] === this.p.chain[r1];
    const k = near ? f : 0;
    out.set(
      path[r0 * 3] + (path[r1 * 3] - path[r0 * 3]) * k,
      path[r0 * 3 + 1] + (path[r1 * 3 + 1] - path[r0 * 3 + 1]) * k,
      path[r0 * 3 + 2] + (path[r1 * 3 + 2] - path[r0 * 3 + 2]) * k,
    );
    return out;
  }

  async begin() {
    const { sound, stage } = this;
    this.phase = 'starting';
    this.ctx.hud.setGoal('');
    sound.unlock();
    // A phone may have put audio to sleep. Give it a moment; if it stays asleep the song runs on the
    // system clock, silently, because switching clocks mid-song would throw off every note.
    if (sound.ctx && !sound.running) await Promise.race([sound.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
    if (this.phase !== 'starting') return;
    this.audioClock = sound.running;
    this.phase = 'play';
    this.t0 = sound.now(this.audioClock) + 0.25 + stage.tempo * (stage.meter[0] + stage.meter[1]) * 2;
    const bar = stage.meter[0] + stage.meter[1];
    this.nextStep = -2 * bar;
  }

  pause() {
    this.phase = 'wait';
    this.items.forEach((n) => (n.state = 0));
    this.score = this.combo = this.hits = 0;
    this.ctx.hud.setGoal('Paused. Tap to play from the start.');
  }

  tap() {
    if (this.phase === 'wait') {
      this.begin();
      return;
    }
    if (this.phase !== 'play') return;
    const now = this.songTime();
    let best = null;
    let bestD = 1;
    for (const n of this.items) {
      if (n.state) continue;
      const d = Math.abs(n.step * this.stage.tempo - now);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best && bestD <= GOOD) {
      this.hit(best, bestD);
    } else {
      this.combo = 0;
      this.pop.push({ text: 'early', t: 0, x: this.hitX, y: this.trackY - 62 });
      this.sound.tick(0.12);
    }
  }

  hit(n, d) {
    const perfect = d <= PERFECT;
    n.state = perfect ? 1 : 2;
    this.score += perfect ? 100 : 70;
    this.hits++;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    const aa = this.p.seq[n.res];
    this.sound.pluck(this.sound.note(PITCH[aa] ?? 5, 293.66), 0.26, this.sound.t, 0.5);
    this.flash = 1;
    this.pop.push({ text: perfect ? 'Perfect' : 'Good', t: 0, x: this.hitX, y: this.trackY - 62 });
    this.painted[n.res] = true;
    this.repaint = true;
    this.blooms.push({ res: n.res, t: 0 });
    buzz(perfect ? 14 : 8);
  }

  songTime() {
    const latency = this.audioClock ? (this.sound.ctx.outputLatency ?? 0) : 0;
    return this.sound.now(this.audioClock) - this.t0 - latency;
  }

  schedule() {
    const { sound, stage, steps } = this;
    if (!this.audioClock) return;
    const bar = stage.meter[0] + stage.meter[1];
    const beat = stage.tempo;
    const horizon = sound.now(true) + 0.22;
    const roots = [146.83, 146.83, 174.61, 130.81];
    while (this.t0 + this.nextStep * beat < horizon) {
      const s = this.nextStep++;
      const t = this.t0 + s * beat;
      const inBar = ((s - this.offset) % bar + bar) % bar;
      if (s >= steps.length) continue;
      const barIndex = Math.floor((s - this.offset) / bar);
      const root = roots[((barIndex % 4) + 4) % 4];
      if (s < 0) {
        if (inBar === 0 || inBar === stage.meter[0]) sound.hat(t, 0.16);
        continue;
      }
      if (inBar === 0 || inBar === stage.meter[0]) {
        sound.kick(t, inBar === 0 ? 0.5 : 0.36);
        this.kickAt = t;
      }
      sound.hat(t, inBar % 2 ? 0.022 : 0.04);
      if (stage.meter[0] === 4 && (inBar === 2 || inBar === 6)) sound.snare(t, 0.09);
      if (stage.meter[0] === 3 && inBar === 5) sound.snare(t, 0.09);
      if (inBar === 0) sound.bass(root, t, beat * 2.4, 0.2);
      if (inBar === stage.meter[0]) sound.bass(root * 1.5, t, beat * 2, 0.16);
      const r = steps[s];
      if (r >= 0 && !this.notes[r]) sound.pluck(sound.note(14 + (r * 3) % 5, 293.66), 0.018, t, 0.3);
    }
  }

  update(dt) {
    const { rig, press, stage } = this;
    let u;
    if (this.phase === 'wait' || this.phase === 'starting') {
      this.idle = (this.idle ?? 0) + dt;
      u = -8 + Math.sin(this.idle * 0.6) * 0.4;
    } else if (this.phase === 'play') {
      this.schedule();
      const song = this.songTime();
      u = song / stage.tempo;
      for (const n of this.items) {
        if (!n.state && song - n.step * stage.tempo > GOOD) {
          n.state = 3;
          this.combo = 0;
          this.pop.push({ text: 'Miss', t: 0, x: this.hitX, y: this.trackY - 62 });
        }
      }
      if (u > this.steps.length + 2) this.finish();
      this.u = u;
    } else {
      u = this.u;
    }

    if (press.reduced && this.phase !== 'end') {
      // Without the ride: hold a still view of the whole molecule.
      this.placeOverview();
    } else if (this.phase !== 'end') {
      const cam = press.camera;
      this.posAt(u - 7, this.tmpA ?? (this.tmpA = new THREE.Vector3()));
      this.posAt(u + 6, this.tmpB ?? (this.tmpB = new THREE.Vector3()));
      const k = 1 - Math.exp(-dt * 7);
      this.cam.lerp(this.tmpA, k);
      this.look.lerp(this.tmpB, k);
      const f = this.tmpB.clone().sub(this.tmpA).normalize();
      this.up.addScaledVector(f, -this.up.dot(f)).normalize();
      // Above a flat strand the camera must lift clear; inside a helix it can stay on the axis.
      const r = this.steps[clamp(Math.floor(u), 0, this.steps.length - 1)];
      const lift = r >= 0 && this.p.ss[r] === 'H' ? 0.6 : 3.4;
      this.lift = (this.lift ?? lift) + (lift - (this.lift ?? lift)) * k;
      cam.position.copy(this.cam).addScaledVector(this.up, this.lift);
      cam.up.copy(this.up);
      cam.lookAt(this.look);
      cam.near = 0.7;
      cam.far = 320;
      cam.updateProjectionMatrix();
      press.uniforms.uFogNear.value = 16;
      press.uniforms.uFogFar.value = 52;
    } else {
      this.endT += dt / 1.6;
      const e = ease(Math.min(1, this.endT));
      const cam = press.camera;
      cam.position.lerpVectors(this.endFrom, this.endTo, e);
      cam.up.lerpVectors(this.up, this.endUp, e).normalize();
      cam.lookAt(this.look.clone().multiplyScalar(1 - e));
      cam.near = 2;
      cam.far = 1200;
      cam.updateProjectionMatrix();
      press.uniforms.uFogNear.value = 16 + (this.endDist - 16) * e;
      press.uniforms.uFogFar.value = 52 + (this.endDist * 1.5 - 52) * e;
      if (this.endT >= 1 && !this.handed) {
        this.handed = true;
        rig.manual = false;
        rig.enabled = true;
        rig.dist = rig.distTarget = this.endDist;
        rig.yaw = Math.atan2(this.endTo.x, this.endTo.z);
        rig.pitch = Math.asin(this.endTo.y / this.endDist);
        rig.target.set(0, 0, 0);
        rig.targetGoal.set(0, 0, 0);
        rig.spin = 0.15;
      }
    }

    // Disc pulses with the kick.
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.phase === 'play' && this.audioClock) {
      const since = Math.max(0, this.sound.now(true) - (this.kickAt ?? 0));
      const pulse = Math.exp(-since * 9) * 0.05;
      press.setDisc(0.5, 0.42, this.baseDisc + pulse + this.flash * 0.03, [1, 0, 0]);
    }

    if (this.repaint) {
      this.repaint = false;
      this.paint();
    }
    this.animateBlooms(dt);
    this.drawTrack(u, dt);
  }

  overviewPose() {
    const { p, press } = this;
    let radius = 0;
    for (let i = 0; i < p.n; i++) radius = Math.max(radius, Math.hypot(p.caXYZ[i * 3], p.caXYZ[i * 3 + 1], p.caXYZ[i * 3 + 2]));
    const fit = ((radius + 4) / Math.tan((press.camera.fov * Math.PI) / 360)) * Math.max(1, press.cssH / press.cssW);
    // Look across the long axis of the molecule so that the buried stripe faces the reader.
    const mid = (p.n >> 1) - 1;
    const long = new THREE.Vector3(p.caXYZ[0] - p.caXYZ[mid * 3], p.caXYZ[1] - p.caXYZ[mid * 3 + 1], p.caXYZ[2] - p.caXYZ[mid * 3 + 2]).normalize();
    const across = long.clone().cross(new THREE.Vector3(0.21, 0.9, 0.38)).normalize();
    return { fit, to: across.add(new THREE.Vector3(0, 0.25, 0)).normalize().multiplyScalar(fit) };
  }

  placeOverview() {
    const { press } = this;
    const { fit, to } = this.overviewPose();
    const cam = press.camera;
    cam.position.copy(to);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    cam.near = 2;
    cam.far = 1200;
    cam.updateProjectionMatrix();
    press.uniforms.uFogNear.value = fit;
    press.uniforms.uFogFar.value = fit * 1.5;
  }

  animateBlooms(dt) {
    if (!this.blooms.length) return;
    for (const b of this.blooms) {
      b.t = Math.min(1, b.t + dt / 0.28);
      const s = b.t < 0.7 ? (b.t / 0.7) * 1.25 : 1.25 - ((b.t - 0.7) / 0.3) * 0.25;
      for (const a of this.atomsOf[b.res]) this.atoms.pos[a * 4 + 3] = 1.55 * s;
    }
    this.blooms = this.blooms.filter((b) => b.t < 1);
    this.atoms.commit(this.atoms.count);
  }

  drawTrack(u, dt) {
    const { overlay: o, stage, p } = this;
    const g = o.g;
    const y = this.trackY;
    const X = (s) => this.hitX + (s - u) * this.spacing;
    if (this.phase === 'end') return;

    g.fillStyle = '#1f2aa6';
    g.fillRect(0, y - 46, o.w, 92);
    g.fillStyle = '#ffd21f';
    g.fillRect(0, y - 46, o.w, 2.5);
    g.fillRect(0, y + 44, o.w, 2.5);

    // Bar lines: the meter is visible on the track.
    const bar = stage.meter[0] + stage.meter[1];
    g.fillStyle = 'rgba(255,210,31,.3)';
    const firstBar = Math.floor((u - 3) / bar) * bar + this.offset;
    for (let s = firstBar; X(s) < o.w + 40; s += bar) g.fillRect(X(s), y - 44, 1.5, 88);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lo = Math.max(0, Math.floor(u - 4));
    const hi = Math.min(this.steps.length - 1, Math.ceil(u + (o.w - this.hitX) / this.spacing) + 1);
    const state = new Map(this.items.map((n) => [n.step, n.state]));
    for (let s = lo; s <= hi; s++) {
      const r = this.steps[s];
      if (r < 0) continue;
      const x = X(s);
      const st = state.get(s) ?? 0;
      g.beginPath();
      g.arc(x, y, 17, 0, 7);
      g.fillStyle = st === 1 || st === 2 ? '#ffd21f' : st === 3 ? '#ff4a9e' : 'rgba(255,255,255,.14)';
      g.fill();
      g.fillStyle = st && st !== 3 ? '#1f2aa6' : st === 3 ? '#1f2aa6' : '#ffffff';
      g.font = '800 17px Bricolage, sans-serif';
      g.fillText(p.seq[r], x, y + 1);
    }
    // The ring.
    g.lineWidth = 5;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(this.hitX, y, 31 + this.flash * 7, 0, 7);
    g.stroke();

    for (const f of this.pop) {
      f.t += dt;
      const a = 1 - f.t / 0.5;
      if (a <= 0) continue;
      g.globalAlpha = a;
      g.font = '800 19px Bricolage, sans-serif';
      g.fillStyle = f.text === 'Perfect' ? '#ffd21f' : '#ffffff';
      g.fillText(f.text, f.x, f.y - f.t * 28);
      g.globalAlpha = 1;
    }
    this.pop = this.pop.filter((f) => f.t < 0.5);

    if (this.combo >= 3) {
      g.font = `${44 + this.flash * 8}px Dela, sans-serif`;
      g.fillStyle = '#ffd21f';
      g.fillText(this.combo, o.w / 2, y - 92);
    }
  }

  finish() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    const { p, press, ctx, items } = this;
    const accuracy = this.score / (items.length * 100);
    const { fit, to } = this.overviewPose();
    this.endDist = fit;
    this.endFrom = press.camera.position.clone();
    this.endTo = to;
    this.endUp = new THREE.Vector3(0, 1, 0);
    this.endT = 0;
    press.setDisc(0.5, 0.3, 0.46, [1, 0, 0]);
    press.setFocus(0.5, 0.3, true);
    this.onDone(accuracy, this.hits, items.length);
  }

  dispose() {
    document.removeEventListener('pointerdown', this.onPress);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onHide);
    const { press } = this;
    press.scene.remove(this.ribbon.mesh, this.atoms.mesh);
    this.ribbon.dispose();
    this.atoms.dispose();
    press.clearDisc();
    press.setFocus(0.5, 0.5, true);
  }
}

// One square per residue. The player lights the ones that face the partner, and the loop plays what they wrote.
class Sequencer {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage });
    const { press, rig, layer } = ctx;
    this.press = press;
    this.rig = rig;
    this.layer = layer;
    this.sound = ctx.sound;
    this.overlay = ctx.overlay;
    document.body.classList.add('night');
    press.setPaper(PAPER.white);
    press.setFlood([0, 0, 1]);
    press.clearDisc();
    press.uniforms.uShadow.value = 0;

    const p = (this.p = protein(stage.protein));
    this.cells = stage.strands ? this.strandCells() : this.heptadCells();
    this.needed = this.cells.filter((c) => c.core).length;
    this.found = 0;
    this.wrong = 0;
    this.wrongOn = 0;
    this.solved = false;
    this.head = -1;
    this.nextStep = 0;
    this.trail = [];
    this.hand = this.cells[0].angle;
    this.handGoal = this.hand;
    this.gap = stage.strands ? 0 : 5;
    this.tempo = stage.composeTempo;

    this.root = new THREE.Group();
    press.scene.add(this.root);
    this.parts = [];
    this.sideOf = new Map();
    this.sizes = new Map();
    this.buildScene();
    this.buildGrid();
    this.buildWheel();

    rig.yaw = 0;
    rig.pitch = 0.12;
    rig.spin = 0;
    rig.target.set(0, 0, 0);
    rig.targetGoal.set(0, 0, 0);
    ctx.onLayout = () => this.layout();
    this.layout();
    ctx.hud.setGoal(stage.prompt);
  }

  heptadCells() {
    const out = [];
    for (let i = 1; i <= 28; i++) {
      const pos = (i - 1) % 7;
      out.push({ res: i, pos, row: 0, core: pos === 0 || pos === 3, angle: (TURN / 4 + (i - 1) * TURN) % 360 });
    }
    return out;
  }

  // In a strand each side chain points away from the last. Which way is read from the real backbone.
  strandCells() {
    const { p } = this;
    const at = (a, i) => new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
    const centre = new THREE.Vector3();
    let weight = 0;
    for (let i = 0; i < p.n; i++) {
      const w = Math.max(0, 1 - p.rsa[i] / 25);
      centre.addScaledVector(at(p.caXYZ, i), w);
      weight += w;
    }
    centre.divideScalar(weight);
    const out = [];
    this.stage.strands.forEach(([a, b], row) => {
      for (let i = a; i <= b; i++) {
        const ca = at(p.caXYZ, i);
        const u = ca.clone().sub(at(p.nXYZ, i));
        const v = at(p.cXYZ, i).sub(ca);
        const n = u.clone().cross(v);
        const cb = n.multiplyScalar(-0.58273431).addScaledVector(u, 0.56802827).addScaledVector(v, -0.54067466);
        const core = cb.dot(centre.clone().sub(ca)) > 0;
        out.push({ res: i, pos: i - a, row, core, angle: core ? 0 : 180 });
      }
    });
    return out;
  }

  addPart(from, to, colourOf) {
    const { p } = this;
    const group = new THREE.Group();
    const ribbon = new Ribbon(p.ss.slice(from, to + 1), [], { helixWidth: 1.4, strandWidth: 1.4 });
    ribbon.setCoords(p.caXYZ.subarray(from * 3, (to + 1) * 3), p.oXYZ.subarray(from * 3, (to + 1) * 3));
    ribbon.paint((i) => colourOf(i + from), (i) => 1 + this.parts.length * 40 + (p.ss[i + from] === 'C' ? 1 : 0));
    group.add(ribbon.mesh);
    const list = [];
    for (let i = 0; i < p.atomEl.length; i++) {
      const r = p.atomRes[i];
      if (r >= from && r <= to && p.atomSide[i] === '1') list.push(i);
    }
    const atoms = new Atoms(list.length);
    list.forEach((i, k) => {
      const r = p.atomRes[i];
      atoms.set(k, p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2], 0, TONE.oil, 200 + (r % 40));
      if (!this.sideOf.has(r)) this.sideOf.set(r, { atoms, slots: [] });
      this.sideOf.get(r).slots.push(k);
    });
    atoms.commit(list.length);
    group.add(atoms.mesh);
    this.root.add(group);
    const part = { group, ribbon, atoms };
    this.parts.push(part);
    return part;
  }

  buildScene() {
    const { p, stage } = this;
    if (stage.strands) {
      const chosen = new Set(this.cells.map((c) => c.res));
      this.addPart(0, p.n - 1, (i) => (chosen.has(i) ? TONE.helix : p.ss[i] === 'E' ? TONE.strand : TONE.loop));
      this.moving = this.parts[0];
      this.extent = [24, 22];
      return;
    }
    // Lay the coiled coil on its side, chain A above chain B, N-terminus at the left, reading like the grid.
    const point = (i) => new THREE.Vector3(p.caXYZ[i * 3], p.caXYZ[i * 3 + 1], p.caXYZ[i * 3 + 2]);
    const mid = (a, b) => {
      const c = new THREE.Vector3();
      for (let i = a; i <= b; i++) c.add(point(i));
      return c.divideScalar(b - a + 1);
    };
    const centreA = mid(0, 30);
    const centreB = mid(31, 61);
    const X = point(29).sub(point(1)).add(point(60).sub(point(32))).normalize();
    const Y = centreA.clone().sub(centreB);
    Y.addScaledVector(X, -Y.dot(X)).normalize();
    const Z = X.clone().cross(Y);
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)).invert();
    this.root.position.copy(centreA.add(centreB).multiplyScalar(-0.5).applyQuaternion(this.root.quaternion));
    this.yAxis = Y;
    this.moving = this.addPart(0, 30, () => TONE.helix);
    this.addPart(31, 61, () => TONE.strand);
    for (const i of [1, 4, 8, 11, 15, 18, 22, 25]) this.grow(i + 31, 1.5);
    this.extent = [27, 15];
  }

  grow(res, size) {
    this.sizes.set(res, { now: this.sizes.get(res)?.now ?? 0, goal: size });
  }

  tint(res, ink) {
    const side = this.sideOf.get(res);
    if (!side) return;
    for (const k of side.slots) side.atoms.ink.set(ink, k * 3);
    side.atoms.commit(side.atoms.count);
  }

  buildGrid() {
    const grid = (this.grid = $('div', 'seq'));
    this.cells.forEach((c, k) => {
      const b = $('button', 'cell', k + 1);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', `Residue ${k + 1}`);
      b.addEventListener('click', () => this.toggle(c));
      c.el = b;
      grid.append(b);
    });
    this.layer.append(grid);
  }

  buildWheel() {
    const wrap = (this.wheelWrap = $('div', 'seqwheel'));
    const size = (this.wheelSize = 112);
    const c = (this.wheel = $('canvas'));
    const r = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = size * r;
    c.style.width = c.style.height = `${size}px`;
    this.wheelG = c.getContext('2d');
    this.wheelG.scale(r, r);
    wrap.append(c, $('span', '', this.stage.wheelLabel));
    this.layer.append(wrap);
  }

  drawWheel() {
    const g = this.wheelG;
    const S = this.wheelSize;
    const c = S / 2;
    const R = c - 2;
    const spot = (deg, r) => [c + Math.sin((deg * Math.PI) / 180) * r, c - Math.cos((deg * Math.PI) / 180) * r];
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(c, c, R, 0, 7);
    g.fillStyle = '#f6f8f7';
    g.fill();
    // The side that faces the partner.
    const half = this.stage.strands ? 90 : 52;
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, R, ((-90 - half) * Math.PI) / 180, ((-90 + half) * Math.PI) / 180);
    g.closePath();
    g.fillStyle = '#ff4a9e';
    g.fill();
    // The path of the last few residues: on a helix it draws a star.
    g.lineWidth = 1.5;
    this.trail.forEach((a, i) => {
      if (!i) return;
      g.strokeStyle = `rgba(31,42,166,${(0.75 * i) / this.trail.length})`;
      g.beginPath();
      g.moveTo(...spot(this.trail[i - 1], R - 9));
      g.lineTo(...spot(a, R - 9));
      g.stroke();
    });
    const angles = new Set(this.cells.map((x) => Math.round(x.angle)));
    g.fillStyle = 'rgba(31,42,166,.55)';
    for (const a of angles) {
      g.beginPath();
      g.arc(...spot(a, R - 9), 2.2, 0, 7);
      g.fill();
    }
    for (const x of this.cells) {
      if (!x.on) continue;
      g.beginPath();
      g.arc(...spot(x.angle, R - 9), 5, 0, 7);
      g.fillStyle = x.core ? '#ffd21f' : '#ff4a9e';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#1f2aa6';
      g.stroke();
    }
    g.strokeStyle = '#1f2aa6';
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(...spot(this.hand, R - 18));
    g.stroke();
    g.beginPath();
    g.arc(c, c, R, 0, 7);
    g.lineWidth = 2.5;
    g.stroke();
  }

  layout() {
    const { press, stage, rig } = this;
    const { cssW: w, cssH: h } = press;
    const ctx = this.ctx;
    const landscape = w > h * 1.15;
    const safeB = ctx.safeBottom();
    const across = stage.strands ? Math.max(...stage.strands.map(([a, b]) => b - a + 1)) : 7;
    const W = landscape ? Math.min(w * 0.46, 430) : Math.min(w - 24, 430);
    const rowsNow = stage.strands ? stage.strands.length : this.solved ? 4 : 5;
    const rowH = stage.strands ? 50 : this.solved ? 38 : 44;
    const header = !stage.strands && this.solved ? 20 : 0;
    const acts = this.solved ? 62 : 0;
    const gridH = rowsNow * rowH + header;
    const size = Math.floor(W / across) - 4;
    const spacing = this.solved || stage.strands ? W / across : W / 6;
    const left = landscape ? w - W - 12 - ctx.safeRight() : (w - W) / 2;
    const top = landscape ? Math.max(104, (h - gridH - acts) / 2) : h - gridH - acts - 12 - safeB;
    Object.assign(this.grid.style, { left: `${left}px`, top: `${top}px`, width: `${W}px`, height: `${gridH}px` });
    this.cells.forEach((c, k) => {
      const col = stage.strands ? c.pos : k % (this.solved ? 7 : 6);
      const row = stage.strands ? c.row : Math.floor(k / (this.solved ? 7 : 6));
      c.el.style.width = `${size}px`;
      c.el.style.height = `${rowH - 4}px`;
      c.el.style.transform = `translate(${col * spacing}px, ${header + row * rowH}px)`;
    });
    this.heads?.forEach((el, i) => {
      el.style.width = `${size}px`;
      el.style.transform = `translate(${(i * W) / 7}px, 0)`;
    });
    if (this.acts) {
      Object.assign(this.acts.style, { left: `${left}px`, width: `${W}px`, top: `${top + gridH + 8}px` });
    }
    const free = landscape ? { w: w - W - 24, h: h - 100 } : { w, h: top - 112 - (this.wheelInside ? 0 : 0) };
    const wheelBottom = landscape ? 12 + safeB : h - top + 8;
    Object.assign(this.wheelWrap.style, landscape ? { left: '12px', right: 'auto', bottom: `${wheelBottom}px` } : { right: '12px', left: 'auto', bottom: `${wheelBottom}px` });
    press.setFocus(landscape ? free.w / 2 / w : 0.5, landscape ? 0.54 : (112 + free.h / 2) / h);
    const t = Math.tan((press.camera.fov * Math.PI) / 360);
    const [rx, ry] = this.extent;
    rig.distTarget = Math.max((rx * h) / (free.w * t), (ry * h) / (Math.max(120, free.h) * t));
    rig.dist = rig.distTarget;
  }

  toggle(c) {
    if (this.solved) return;
    const { sound, ctx, stage } = this;
    c.on = !c.on;
    c.el.setAttribute('aria-pressed', c.on);
    c.el.classList.toggle('on', c.on && c.core);
    c.el.classList.toggle('bad', c.on && !c.core);
    if (c.on) {
      this.grow(c.res, 1.55);
      this.tint(c.res, c.core ? TONE.oil : TONE.plus);
      if (c.core) {
        this.found++;
        sound.pluck(sound.note(this.found + 4), 0.2);
        buzz(10);
        if (this.found === 1) ctx.hud.setGoal(stage.firstRight);
      } else {
        this.wrong++;
        this.wrongOn++;
        sound.bump();
        buzz(16);
        if (this.wrong === 1) ctx.hud.setGoal(stage.firstWrong);
      }
    } else {
      this.grow(c.res, 0);
      sound.tick(0.1);
      if (c.core) this.found--;
      else this.wrongOn--;
    }
    if (!stage.strands) this.gap = 5 * (1 - (this.found - this.wrongOn * 0.5) / this.needed);
    if (this.found === this.needed && this.wrongOn === 0) this.solve();
  }

  solve() {
    const { ctx, stage, p, sound } = this;
    this.solved = true;
    this.tempo = stage.tempo;
    this.nextStep = 0;
    this.t0 = sound.now(this.audio) + 0.1;
    this.gap = 0;
    ctx.earn(0);
    if (this.wrong <= stage.par[0]) ctx.earn(1);
    if (stage.strands && this.wrong <= stage.par[1]) ctx.earn(2);
    sound.bloom();
    buzz(40);
    this.cells.forEach((c, i) => {
      c.el.textContent = p.seq[c.res];
      c.el.classList.add('letter');
      c.el.tabIndex = -1;
      setTimeout(() => this.tint(c.res, TONE[classOf(p.seq[c.res])] ?? TONE.polar), i * 18);
    });
    if (!stage.strands) {
      this.heads = [...'abcdefg'].map((l) => {
        const el = $('span', 'cellhead', l);
        this.grid.append(el);
        return el;
      });
    }
    ctx.hud.setGoal(stage.solved);
    const acts = (this.acts = $('div', 'seqacts'));
    if (!stage.strands) acts.append(button('btn pink', 'Play it', () => this.startRide()));
    acts.append(button(stage.strands ? 'btn pink' : 'btn quiet', 'Finish', () => this.close()));
    this.layer.append(acts);
    ctx.resultExtra = this.written();
    this.layout();
  }

  // The answer in writing, in the same layout the grid ended in.
  written() {
    const { p, stage, cells } = this;
    const strip = $('div', stage.strands ? 'strip' : 'strip seven');
    strip.setAttribute('aria-label', 'Sequence with the buried residues marked');
    for (const c of cells) strip.append($('span', c.core ? 'on' : '', p.seq[c.res]));
    return strip;
  }

  close() {
    this.ctx.finishNow();
  }

  startRide() {
    const { ctx, stage } = this;
    const extra = ctx.resultExtra;
    this.clearAll();
    this.ride = new Ride(ctx, stage, (accuracy, hits, total) => {
      if (accuracy >= 0.8) ctx.earn(2);
      ctx.resultExtra = extra;
      ctx.finishSoon(`${Math.round(accuracy * 100)}% accuracy, ${hits} of ${total} positions.`, 1900);
    });
  }

  schedule(now) {
    const { sound, stage, cells } = this;
    const bar = stage.strands ? 8 : 7;
    while (this.t0 + this.nextStep * this.tempo < now + 0.2) {
      const s = this.nextStep++;
      const t = this.t0 + s * this.tempo;
      const c = cells[s % cells.length];
      if (!this.audio) continue;
      if (c.on) {
        if (c.core) {
          sound.kick(t, 0.42);
          sound.pluck(sound.note(c.pos % 2 ? 7 : 5, 293.66), 0.14, t, 0.4);
        } else {
          sound.burst(t, { dur: 0.14, gain: 0.2, freq: 480, q: 0.7, wet: 0.2 });
          sound.voice(233, t, { gain: 0.1, dur: 0.14, type: 'square', wet: 0.1, filter: 900 });
        }
      } else sound.hat(t, 0.03);
      if (this.solved) {
        const at = s % bar;
        if (at === 0) sound.bass([146.83, 146.83, 174.61, 130.81][Math.floor(s / bar) % 4], t, this.tempo * 2.4, 0.2);
        if (at === (stage.strands ? 4 : 5)) sound.snare(t, 0.08);
      }
    }
  }

  update(dt) {
    if (this.ride) {
      this.ride.update(dt);
      return;
    }
    const { sound, cells } = this;
    if (this.audio !== sound.running || this.t0 === undefined) {
      this.audio = sound.running;
      this.t0 = sound.now(this.audio);
      this.nextStep = 0;
    }
    const now = sound.now(this.audio);
    this.schedule(now);
    const step = Math.max(0, Math.floor((now - this.t0) / this.tempo));
    const k = step % cells.length;
    if (k !== this.head) {
      if (this.head >= 0) cells[this.head].el.classList.remove('now');
      this.head = k;
      const c = cells[k];
      c.el.classList.add('now');
      this.handGoal += ((c.angle - this.handGoal) % 360 + 360) % 360;
      this.trail.push(c.angle);
      if (this.trail.length > 8) this.trail.shift();
    }
    this.hand += (this.handGoal - this.hand) * Math.min(1, dt * 18);
    this.drawWheel();

    if (!this.stage.strands) {
      const y = this.moving.group.position.y;
      this.moving.group.position.y = y + (this.gap * (this.solved ? 0 : 1) - y) * Math.min(1, dt * 7);
    }
    const dirty = new Set();
    for (const [res, s] of this.sizes) {
      if (Math.abs(s.goal - s.now) < 0.01) continue;
      s.now += (s.goal - s.now) * Math.min(1, dt * 16);
      const side = this.sideOf.get(res);
      if (!side) continue;
      for (const slot of side.slots) side.atoms.pos[slot * 4 + 3] = s.now;
      dirty.add(side.atoms);
    }
    for (const a of dirty) a.commit(a.count);

    // A mark runs along the chain with the beat, tying the square to its place in the molecule.
    const c = cells[this.head];
    const p = this.p;
    const v = new THREE.Vector3(p.caXYZ[c.res * 3], p.caXYZ[c.res * 3 + 1], p.caXYZ[c.res * 3 + 2]).applyMatrix4(this.moving.group.matrixWorld);
    const s = this.overlay.project(v);
    const g = this.overlay.g;
    g.beginPath();
    g.arc(s.x, s.y, 7, 0, 7);
    g.lineWidth = 3;
    g.strokeStyle = '#ffffff';
    g.stroke();
  }

  clearAll() {
    const { press } = this;
    press.scene.remove(this.root);
    for (const part of this.parts) {
      part.ribbon.dispose();
      part.atoms.dispose();
    }
    this.parts = [];
    this.grid.remove();
    this.wheelWrap.remove();
    this.acts?.remove();
  }

  dispose() {
    if (this.ride) this.ride.dispose();
    else this.clearAll();
    this.press.setFocus(0.5, 0.5, true);
  }
}

const OIL = { A: 0.5, V: 1, I: 1, L: 1, M: 1, F: 1, W: 1, C: 0.7, Y: 0.6 };
const FOLD = { H: [-57, -47], E: [-125, 135], X: [-150, 150] };

// How much of the oil gathers on one face when each residue turns by this many degrees.
function faceShare(seq, turn) {
  let x = 0;
  let y = 0;
  let total = 0;
  [...seq].forEach((c, i) => {
    const h = OIL[c] ?? 0;
    x += h * Math.cos((i * turn * Math.PI) / 180);
    y += h * Math.sin((i * turn * Math.PI) / 180);
    total += h;
  });
  return total ? Math.hypot(x, y) / total : 0;
}

// Real stretches of real proteins. The player reads the spacing and calls the fold, by eye and by ear.
class Reader {
  constructor(ctx, stage) {
    Object.assign(this, { ctx, stage });
    const { press, rig, layer } = ctx;
    this.press = press;
    this.rig = rig;
    this.sound = ctx.sound;
    document.body.classList.add('night');
    press.setPaper(PAPER.white);
    press.setFlood([0, 0, 1]);
    press.clearDisc();
    press.uniforms.uShadow.value = 0;
    rig.yaw = 0;
    rig.pitch = 0;
    rig.spin = 0;
    rig.target.set(0, 0, 0);
    rig.targetGoal.set(0, 0, 0);

    const pick = (kind, n) => stage.pool.filter((r) => r.ss === kind).sort(() => Math.random() - 0.5).slice(0, n);
    this.rounds = [...pick('H', 4), ...pick('E', 4)].sort(() => Math.random() - 0.5);
    this.index = 0;
    this.right = 0;
    this.root = new THREE.Group();
    press.scene.add(this.root);

    const box = (this.box = $('div', 'reader'));
    this.count = $('p', 'readcount');
    this.tiles = $('div', 'tiles');
    this.choices = $('div', 'readacts');
    this.helix = button('btn', 'Helix', () => this.call('H'));
    this.strand = button('btn', 'Strand', () => this.call('E'));
    this.next = button('btn pink', 'Next', () => this.advance());
    this.choices.append(this.helix, this.strand, this.next);
    box.append(this.count, this.tiles, this.choices);
    layer.append(box);
    ctx.onLayout = () => this.layout();
    this.load();
  }

  load() {
    const round = (this.round = this.rounds[this.index]);
    const p = protein(round.protein);
    const seq = (this.seq = p.seq.slice(round.a, round.b + 1));
    const n = (this.n = seq.length);
    this.dropModel();
    this.ribbon = new Ribbon('C'.repeat(n), [], { coil: 0.62 });
    this.ribbon.paint(() => [0, 0, 0], () => 3);
    this.atoms = new Atoms(n);
    this.root.add(this.ribbon.mesh, this.atoms.mesh);
    this.kind = null;
    this.from = [...FOLD.X];
    this.angle = [...FOLD.X];
    this.t = 1;
    this.lift = 0;
    this.verdict = false;
    this.count.textContent = `${this.index + 1} of ${this.rounds.length}`;
    this.tiles.replaceChildren(...[...seq].map((c) => $('span', OIL[c] >= 0.6 ? 'oily' : '', c)));
    this.tiles.style.setProperty('--n', n);
    this.helix.hidden = this.strand.hidden = false;
    this.next.hidden = true;
    this.ctx.hud.setGoal(this.index === 0 ? this.stage.prompt : 'Read the orange letters, and listen. Is the spacing 3 and 4, or every other one?');
    this.nextStep = 0;
    this.t0 = undefined;
    this.pose(1);
    this.layout();
    this.root.quaternion.copy(this.goalTurn);
  }

  dropModel() {
    if (!this.ribbon) return;
    this.root.remove(this.ribbon.mesh, this.atoms.mesh);
    this.ribbon.dispose();
    this.atoms.dispose();
  }

  layout() {
    const { press, rig } = this;
    const { cssW: w, cssH: h } = press;
    const landscape = w > h * 1.15;
    const box = this.box.getBoundingClientRect();
    const free = landscape ? { w: w - box.width, h: h - 90 } : { w, h: h - box.height - 112 };
    press.setFocus(landscape ? free.w / 2 / w : 0.5, landscape ? 0.56 : (112 + free.h / 2) / h);
    const t = Math.tan((press.camera.fov * Math.PI) / 360);
    rig.distTarget = rig.dist = this.far = Math.max((26 * h) / (free.w * t), (15 * h) / (Math.max(120, free.h) * t));
  }

  call(kind) {
    if (this.kind) return;
    this.kind = kind;
    this.chosen = kind;
    this.from = [...this.angle];
    this.t = 0;
    this.sound.ratchet();
    this.helix.hidden = this.strand.hidden = true;
    this.rig.distTarget = this.far * (kind === 'H' ? 0.52 : 1);
  }

  judge() {
    const { round, seq, chosen, ctx } = this;
    this.verdict = true;
    const ok = chosen === round.ss;
    if (ok) this.right++;
    const asHelix = Math.round(faceShare(seq, 100) * 100);
    const asStrand = Math.round(faceShare(seq, 180) * 100);
    const words = `${round.name}. Oil on one face: ${asHelix}% as a helix, ${asStrand}% as a strand.`;
    if (ok) {
      this.sound.chord([5, 7, 9], 0.14);
      buzz(20);
      ctx.hud.setGoal(`Right. ${words}`);
    } else {
      this.sound.bump();
      ctx.hud.setGoal(`It is a ${round.ss === 'H' ? 'helix' : 'strand'}. ${words}`);
      // Fold it the right way, so that the last thing seen is the true stripe.
      this.kind = round.ss;
      this.from = [...this.angle];
      this.t = 0;
      this.rig.distTarget = this.far * (round.ss === 'H' ? 0.52 : 1);
    }
    this.next.hidden = false;
    this.next.textContent = this.index + 1 === this.rounds.length ? 'See the score' : 'Next';
    this.next.focus?.();
  }

  advance() {
    this.index++;
    if (this.index >= this.rounds.length) this.finish();
    else this.load();
  }

  finish() {
    const { ctx, right } = this;
    this.next.hidden = true;
    ctx.earn(0);
    if (right >= 6) ctx.earn(1);
    if (right === this.rounds.length) ctx.earn(2);
    ctx.finishSoon(`You read ${right} of ${this.rounds.length} sequences correctly.`, 500);
  }

  pose(k) {
    const { n, seq } = this;
    const goal = FOLD[this.kind ?? 'X'];
    this.lift = this.kind ? Math.max(this.lift, k) : 0;
    this.angle = [this.from[0] + (goal[0] - this.from[0]) * k, this.from[1] + (goal[1] - this.from[1]) * k];
    const built = buildChain(new Array(n).fill(this.angle[0] * DEG), new Array(n).fill(this.angle[1] * DEG));
    const res = built.res;
    const middle = new THREE.Vector3();
    for (const r of res) middle.add(new THREE.Vector3(...r.ca));
    middle.divideScalar(n);
    const ca = new Float32Array(n * 3);
    const o = new Float32Array(n * 3);
    const axis = new THREE.Vector3();
    const face = new THREE.Vector3();
    res.forEach((r, i) => {
      ca.set([r.ca[0] - middle.x, r.ca[1] - middle.y, r.ca[2] - middle.z], i * 3);
      o.set([r.o[0] - middle.x, r.o[1] - middle.y, r.o[2] - middle.z], i * 3);
      if (i + 3 < n) axis.add(new THREE.Vector3(...res[i + 3].ca).sub(new THREE.Vector3(...r.ca)));
      const out = new THREE.Vector3(...r.cb).sub(new THREE.Vector3(...r.ca)).normalize();
      // Side chains rise only as the chain folds. Before the answer they lie on the backbone,
      // because their up and down pattern would give a strand away.
      const on = new THREE.Vector3(...r.ca);
      const at = new THREE.Vector3(...r.cb).addScaledVector(out, 1.5).sub(on).multiplyScalar(this.lift).add(on).sub(middle);
      const oily = (OIL[seq[i]] ?? 0) >= 0.6;
      face.addScaledVector(out, OIL[seq[i]] ?? 0);
      this.atoms.set(i, at.x, at.y, at.z, oily ? 1.9 : 1.15, oily ? TONE.oil : [0, 0, 0.34], 200 + i);
    });
    this.atoms.commit(n);
    this.ribbon.setCoords(ca, o);
    // Turn the model so that its oily face looks up. A helix is shown end on, like a wheel.
    axis.normalize();
    face.addScaledVector(axis, -face.dot(axis));
    if (face.lengthSq() < 1e-4) face.set(axis.y, -axis.x, 0);
    face.normalize();
    const local = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, face, axis.clone().cross(face)));
    const A = this.kind === 'H' ? new THREE.Vector3(0.2, 0.3, 1).normalize() : new THREE.Vector3(1, 0, 0);
    const B = new THREE.Vector3(0, 1, 0);
    B.addScaledVector(A, -B.dot(A)).normalize();
    const wanted = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(A, B, A.clone().cross(B)));
    this.goalTurn = wanted.multiply(local.invert());
  }

  update(dt) {
    const { sound, seq } = this;
    if (this.finished) return;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 0.75);
      this.pose(ease(this.t));
      if (this.t >= 1 && !this.verdict) this.judge();
    }
    if (this.goalTurn) this.root.quaternion.slerp(this.goalTurn, Math.min(1, dt * 6));
    // The sequence loops as a beat: oily residues on the drum, with a short rest before it comes round.
    if (this.audio !== sound.running || this.t0 === undefined) {
      this.audio = sound.running;
      this.t0 = sound.now(this.audio) + 0.15;
      this.nextStep = 0;
    }
    const now = sound.now(this.audio);
    const beat = this.stage.tempo;
    const loop = seq.length + 3;
    while (this.t0 + this.nextStep * beat < now + 0.2) {
      const s = this.nextStep++ % loop;
      const t = this.t0 + (this.nextStep - 1) * beat;
      if (!this.audio || s >= seq.length) continue;
      if ((OIL[seq[s]] ?? 0) >= 0.6) {
        sound.kick(t, 0.42);
        sound.pluck(sound.note(5, 293.66), 0.13, t, 0.4);
      } else sound.hat(t, 0.035);
    }
    const at = Math.max(0, Math.floor((now - this.t0) / beat)) % loop;
    if (at !== this.lit) {
      this.tiles.children[this.lit]?.classList.remove('now');
      this.tiles.children[at]?.classList.add('now');
      this.lit = at;
    }
  }

  dispose() {
    const { press } = this;
    this.dropModel();
    press.scene.remove(this.root);
    this.box.remove();
    press.setFocus(0.5, 0.5, true);
  }
}

export function startBeat(ctx, stage) {
  return stage.pool ? new Reader(ctx, stage) : new Sequencer(ctx, stage);
}
