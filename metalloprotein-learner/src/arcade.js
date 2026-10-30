// Three short rounds between the wells, each built on one idea from the row before it.
import * as THREE from 'three';
import { EDGES, KEEP_ROUNDS, METALS, SORT_IONS } from './content.js';
import { glowTexture } from './view.js';
import { button, el, fmt } from './ui.js';

const orb = (() => {
  let tex;
  let geo;
  return (color, r) => {
    tex ??= glowTexture();
    geo ??= new THREE.IcosahedronGeometry(1, 3);
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.92) }));
    m.scale.setScalar(r);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.scale.setScalar(r * 3.6);
    g.add(m, s);
    g.userData.dispose = () => { m.material.dispose(); s.material.dispose(); };
    return g;
  };
})();

class Arcade {
  constructor(app, id, well) {
    this.app = app;
    this.id = id;
    this.well = well;
    this.group = new THREE.Group();
    app.stage.scene.add(this.group);
    this.labels = new Set();
    this.score = 0;
    this.lives = 3;
    this.phase = 'intro';
    this.hud = el('div', 'hud');
    const name = el('div', 'hud-name');
    name.append(el('b', '', id), el('h2', '', well.name));
    const right = el('div', 'hud-right');
    this.counter = el('div', 'gauge', '<span></span>');
    right.append(this.counter, button('icon', app.soundIcon(), (e) => app.toggleSound(e.currentTarget)), button('icon', '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', () => app.leave()));
    this.hud.append(name, right);
    app.ui.append(this.hud);
    app.sound.mode(well.metal);
    app.orbit.enabled = false;
    app.stage.u.uField.value = 0.06;
    app.stage.u.uFieldCentre.value.set(0.5, 0.56);
    const cam = app.stage.camera;
    cam.position.set(0, 0, 26);
    cam.quaternion.identity();
    this.tray = el('div', 'tray');
    this.body = el('div', 'tray-body');
    this.tray.append(this.body);
    app.ui.append(this.tray);
    this.body.append(el('p', 'clue', fmt(well.clue)), button('go', 'Start', () => this.start()));
    this.showCounter();
  }

  begin() {}

  showCounter() {
    this.counter.firstChild.textContent = `Score ${this.score}, ${'●'.repeat(Math.max(0, this.lives))}`;
  }

  label(html) {
    const t = el('div', 'tag big', html);
    document.getElementById('tags').append(t);
    this.labels.add(t);
    return t;
  }

  place(tag, pos) {
    const P = this.app.stage.project(pos, new THREE.Vector3());
    tag.style.transform = `translate(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px) translate(-50%, -50%)`;
  }

  dropLabel(t) {
    t.remove();
    this.labels.delete(t);
  }

  finish(won, line) {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const { app, well } = this;
    this.tray.remove();
    if (won) app.record(this.id, 1, this.score);
    const s = el('section', 'sheet');
    s.innerHTML = `<p class="kicker">${line}</p><h2>${well.name}</h2><p>${fmt(well.note)}</p>`;
    const go = el('div', 'actions');
    const next = app.nextAfter(this.id);
    if (won && next) go.append(button('go', `Next: well ${next}`, () => app.open(next)));
    else go.append(button('go', 'Play again', () => app.open(this.id)));
    go.append(button('plain', 'Back to the plate', () => app.leave()));
    s.append(go);
    app.ui.append(s);
    this.sheet = s;
  }

  onTap() {}

  dispose() {
    this.labels.forEach((t) => t.remove());
    this.hud.remove();
    this.tray.remove();
    this.sheet?.remove();
    this.group.traverse((o) => o.userData.dispose?.());
    this.app.stage.scene.remove(this.group);
  }
}

// Hard or soft: send each falling ion to the donor atom it prefers.
class Sort extends Arcade {
  start() {
    this.phase = 'play';
    this.body.innerHTML = '';
    this.prompt = el('p', 'feedback');
    this.prompt.textContent = 'Send each ion to the atom it prefers.';
    const row = el('div', 'lanes');
    for (const [d, name, cls] of [['O', 'Oxygen', 'o'], ['N', 'Nitrogen', 'n'], ['S', 'Sulfur', 's']]) row.append(button(`lane ${cls}`, `<b>${d}</b><span>${name}</span>`, () => this.send(d)));
    this.body.append(this.prompt, row);
    this.ion = null;
    this.spawn();
    this.speed = 2.4;
    this.gone = [];
    this.lift();
  }

  lift() {
    const { stage } = this.app;
    stage.setLift(stage.portrait ? Math.round(this.tray.getBoundingClientRect().height * 0.4) : 0);
  }

  spawn() {
    let pick = SORT_IONS[Math.floor(Math.random() * SORT_IONS.length)];
    if (pick === this.lastPick) pick = SORT_IONS[(SORT_IONS.indexOf(pick) + 5) % SORT_IONS.length];
    this.lastPick = pick;
    const mesh = orb('#ecd98c', 0.66);
    mesh.position.set((Math.random() - 0.5) * 2, 9, 0);
    this.group.add(mesh);
    this.ion = { mesh, name: pick[0], lane: pick[1], tag: this.label(fmt(pick[0])) };
  }

  send(lane) {
    if (this.phase !== 'play' || !this.ion) return;
    const { ion } = this;
    if (lane === ion.lane) {
      this.score++;
      this.app.sound.good();
      this.speed = Math.min(8, this.speed + 0.28);
      this.prompt.innerHTML = fmt(`${ion.name} goes to ${lane}.`);
    } else {
      this.wrong(fmt(`${ion.name} prefers ${ion.lane}, not ${lane}.`));
    }
    this.leave(ion, lane);
    if (this.phase === 'play') this.spawn();
  }

  leave(ion, lane) {
    const x = { O: -7, N: 0, S: 7 }[lane];
    this.gone.push({ ...ion, t: 0, from: ion.mesh.position.clone(), to: new THREE.Vector3(x, -12, 0) });
    this.ion = null;
  }

  wrong(line) {
    this.lives--;
    this.app.sound.bad();
    this.app.buzz(40);
    this.prompt.innerHTML = line;
    if (this.lives <= 0) this.finish(this.score >= 12, this.score >= 12 ? `Sorted ${this.score} ions` : `Sorted ${this.score}. Reach 12 to clear this well.`);
  }

  update(dt) {
    if (this.phase !== 'play') return;
    this.showCounter();
    if (this.ion) {
      this.ion.mesh.position.y -= this.speed * dt;
      this.place(this.ion.tag, this.ion.mesh.position);
      if (this.ion.mesh.position.y < -6.5) {
        const { ion } = this;
        this.wrong(fmt(`Too slow. ${ion.name} prefers ${ion.lane}.`));
        this.leave(ion, ion.lane);
        if (this.phase === 'play') this.spawn();
      }
    }
    for (let i = this.gone.length - 1; i >= 0; i--) {
      const g = this.gone[i];
      g.t += dt * 3.4;
      g.mesh.position.lerpVectors(g.from, g.to, Math.min(1, g.t));
      this.place(g.tag, g.mesh.position);
      if (g.t >= 1) {
        this.group.remove(g.mesh);
        g.mesh.userData.dispose();
        this.dropLabel(g.tag);
        this.gone.splice(i, 1);
      }
    }
    if (this.score >= 24 && this.phase === 'play') this.finish(true, `Sorted all ${this.score} ions`);
  }
}

// Edge scan: sweep the beam energy until the absorption jumps, then name the metal.
class Edge extends Arcade {
  start() {
    this.phase = 'play';
    this.round = 0;
    this.lives = 3;
    this.order = Object.keys(EDGES).sort(() => Math.random() - 0.5).slice(0, 5);
    this.body.innerHTML = '';
    this.prompt = el('p', 'feedback');
    this.canvas = el('canvas', 'trace');
    this.range = el('input', 'energy');
    this.range.type = 'range';
    this.range.id = 'energy';
    this.range.min = 6200;
    this.range.max = 10000;
    this.range.step = 1;
    this.range.setAttribute('aria-label', 'Beam energy');
    this.reading = el('p', 'reading');
    this.tiles = el('div', 'tiles');
    this.body.append(this.prompt, this.canvas, this.reading, this.range, this.tiles);
    this.range.addEventListener('input', () => this.sweep());
    for (const m of Object.keys(EDGES)) {
      this.tiles.append(button('tile', `<b>${m}</b>`, (e) => this.guess(m, e.currentTarget)));
    }
    this.gem = orb('#ecd98c', 0.9);
    this.gem.position.y = 2.2;
    this.group.add(this.gem);
    this.ctx = this.canvas.getContext('2d');
    this.next();
    const { stage } = this.app;
    stage.setLift(stage.portrait ? Math.round(this.tray.getBoundingClientRect().height * 0.36) : 0);
  }

  next() {
    if (this.round >= this.order.length) {
      this.score = this.round;
      this.finish(true, 'All five metals named');
      return;
    }
    this.metal = this.order[this.round];
    this.seen = new Float32Array(960).fill(-1);
    this.range.value = 6200 + Math.floor(Math.random() * 300);
    this.prompt.textContent = `Sample ${this.round + 1} of 5. Drag the beam energy until absorption jumps, then tap the metal.`;
    for (const t of this.tiles.children) { t.disabled = false; t.classList.remove('out'); }
    this.showCounter();
    this.sweep();
  }

  // Absorption just above a K-edge: a step, a white line, then fading wiggles.
  signal(eV) {
    const edge = EDGES[this.metal] * 1000;
    const x = eV - edge;
    const step = 0.5 + Math.atan(x / 3) / Math.PI;
    const line = 0.42 * Math.exp(-(((x - 9) / 8) ** 2));
    const wiggle = x > 20 ? 0.09 * Math.sin(Math.sqrt(x) * 2.2) * Math.exp(-x / 500) : 0;
    return 0.1 + 0.55 * step + line + wiggle;
  }

  sweep() {
    const e = Number(this.range.value);
    const i = Math.round(((e - 6200) / 3800) * 959);
    for (let k = Math.max(0, i - 3); k <= Math.min(959, i + 3); k++) this.seen[k] = this.signal(6200 + (k / 959) * 3800);
    this.reading.textContent = `${(e / 1000).toFixed(3)} keV`;
    const v = this.signal(e);
    this.gem.scale.setScalar(0.7 + v * 0.7);
    this.draw(i);
  }

  draw(here) {
    const { canvas: c, ctx } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth * dpr;
    const h = c.clientHeight * dpr;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(0, h - dpr);
    ctx.lineTo(w, h - dpr);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < 960; i++) {
      const v = this.seen[i];
      if (v < 0) { pen = false; continue; }
      const x = (i / 959) * w;
      const y = h - (v / 1.2) * h;
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
    ctx.fillStyle = '#d24a9b';
    ctx.fillRect((here / 959) * w - dpr, 0, 2 * dpr, h);
  }

  guess(m, b) {
    if (this.phase !== 'play') return;
    if (m === this.metal) {
      this.app.sound.lock();
      this.score++;
      this.round++;
      this.next();
      return;
    }
    b.disabled = true;
    b.classList.add('out');
    this.lives--;
    this.app.sound.bad();
    this.prompt.textContent = `The ${m} edge is at ${EDGES[m].toFixed(3)} keV. Sweep again and read the jump.`;
    this.showCounter();
    if (this.lives <= 0) this.finish(false, 'Out of beam time');
  }

  update(dt, t) {
    if (this.gem) this.gem.position.x = Math.sin(t * 0.8) * 0.3;
  }
}

// Keep copper out: tap away any ion that binds tighter than the metal this site needs.
class Keep extends Arcade {
  start() {
    this.phase = 'play';
    this.round = 0;
    this.lives = 3;
    this.body.innerHTML = '';
    this.prompt = el('p', 'feedback');
    this.ladder = el('p', 'ladder', ['Mn', 'Fe', 'Co', 'Ni', 'Cu'].map((m) => `<span data-m="${m}">${m}</span>`).join('<i>&lt;</i>') + '<i>&gt;</i><span data-m="Zn">Zn</span>');
    this.body.append(this.ladder, this.prompt);
    this.site = orb('#dfe3ea', 0.9);
    this.group.add(this.site);
    this.ions = [];
    this.setRound();
    const { stage } = this.app;
    stage.setLift(stage.portrait ? Math.round(this.tray.getBoundingClientRect().height * 0.4) : 0);
    this.spawnIn = 0.5;
  }

  setRound() {
    const r = KEEP_ROUNDS[this.round];
    this.rule = r;
    this.filled = 0;
    this.prompt.innerHTML = fmt(`This site needs ${METALS[r.target].ion}. Tap away anything that binds tighter. Let five ${r.target} through.`);
    for (const s of this.ladder.querySelectorAll('span')) {
      const m = s.dataset.m;
      s.className = m === r.target ? 'want' : r.block.includes(m) ? 'block' : '';
    }
    const c = new THREE.Color(METALS[r.target].glow);
    this.site.children[1].material.color.copy(c);
    this.showCounter();
  }

  spawn() {
    const r = this.rule;
    const roll = Math.random();
    const pool = roll < 0.42 ? [r.target] : roll < 0.84 || !r.pass.length ? r.block : r.pass;
    const m = pool[Math.floor(Math.random() * pool.length)];
    const a = Math.random() * Math.PI * 2;
    const mesh = orb(METALS[m].glow, 0.72);
    const R = 14;
    mesh.position.set(Math.cos(a) * R * 0.55, Math.sin(a) * R, 0);
    this.group.add(mesh);
    const speed = 2.3 + this.round * 0.5 + Math.random() * 0.6;
    this.ions.push({ m, mesh, speed, tag: this.label(`<b>${m}</b>`) });
  }

  onTap(x, y) {
    if (this.phase !== 'play') return;
    const P = new THREE.Vector3();
    let best = null;
    let bd = 46;
    for (const ion of this.ions) {
      if (ion.flung) continue;
      this.app.stage.project(ion.mesh.position, P);
      const d = Math.hypot(P.x - x, P.y - y);
      if (d < bd) { bd = d; best = ion; }
    }
    if (!best) return;
    best.flung = true;
    best.vel = best.mesh.position.clone().normalize().multiplyScalar(26);
    if (best.m === this.rule.target) this.hurt(`That was the ${best.m} this site needs.`);
    else { this.score++; this.app.sound.tick(); this.showCounter(); }
  }

  hurt(line) {
    this.lives--;
    this.app.sound.bad();
    this.app.buzz(40);
    this.prompt.textContent = line;
    this.showCounter();
    if (this.lives <= 0) this.finish(false, 'The site filled with the wrong metal');
  }

  update(dt) {
    if (this.phase !== 'play') return;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = Math.max(0.55, 1.05 - this.round * 0.15);
      this.spawn();
    }
    for (let i = this.ions.length - 1; i >= 0; i--) {
      const ion = this.ions[i];
      const p = ion.mesh.position;
      if (ion.flung) p.addScaledVector(ion.vel, dt);
      else p.addScaledVector(p.clone().normalize(), -ion.speed * dt);
      this.place(ion.tag, p);
      let gone = p.length() > 22;
      if (!ion.flung && p.length() < 1.3) {
        gone = true;
        const { m } = ion;
        if (m === this.rule.target) {
          this.filled++;
          this.app.sound.good();
          this.score += 2;
          if (this.filled >= 5) {
            this.round++;
            this.app.sound.lock();
            if (this.round >= KEEP_ROUNDS.length) this.finish(true, 'Every site kept its metal');
            else this.setRound();
          }
        } else if (this.rule.block.includes(m)) {
          this.hurt(`${m} binds tighter and took the site.`);
        }
      }
      if (gone) {
        this.group.remove(ion.mesh);
        ion.mesh.userData.dispose();
        this.dropLabel(ion.tag);
        this.ions.splice(i, 1);
      }
    }
    this.showCounter();
  }
}

export const makeArcade = (app, id, well) => new ({ sort: Sort, edge: Edge, keep: Keep }[well.game])(app, id, well);
