// One well, played through: find the ligands, name the shape, seat the metal, see it light up.
import * as THREE from 'three';
import { METALS } from './content.js';
import { atomLabel, resLabel, site } from './sites.js';
import { bestView } from './orbit.js';
import { SiteView } from './view.js';
import { button, el, fmt, ShapeIcon } from './ui.js';

const nice = (s) => s[0].toUpperCase() + s.slice(1);
const WRONG = 13;
const START_B = 12;

export class Play {
  constructor(app, id, well) {
    this.app = app;
    this.id = id;
    this.well = well;
    this.data = site(well.site);
    this.view = new SiteView(app.stage, this.data, { ...well, tint: well.tint ?? METALS[well.metal].glow });
    this.k = 0;
    this.B = START_B;
    this.mistakes = 0;
    this.phase = 'dive';
    this.timers = [];
    this.tags = new Map();
    this.icons = [];
    this.iconT = 0;
    this.drag = null;
    this.seconds = 0;
    this.flying = [];
    this.tray = null;
    this.front = 0;

    const pts = this.points(0);
    const c = this.view.stageCentre(0);
    const r = Math.max(4.2, ...pts.map((p) => p.distanceTo(c)));
    const { orbit, stage } = app;
    const tan = Math.tan((stage.camera.fov * Math.PI) / 360);
    this.closeDist = (r * 1.34) / (tan * Math.min(1, stage.camera.aspect));
    orbit.goal.copy(c);
    orbit.target.copy(c);
    orbit.dist = orbit.goalDist = this.closeDist;
    orbit.minDist = this.closeDist * 0.5;
    orbit.maxDist = 170;
    orbit.aim(bestView(pts.map((p) => p.clone().sub(c)).concat([new THREE.Vector3()])));
    orbit.spin.set(0, 0);
    this.view.ringSize = Math.max(0.9, this.closeDist * 0.052);
    app.sound.mode(well.metal);
    this.header();
  }

  points(k) {
    const st = this.data.stages[k];
    return [...st.tap, ...st.decoy].map((x) => this.view.atoms[x.i].pos);
  }

  after(sec, fn) {
    this.timers.push({ left: sec, fn });
  }

  header() {
    const { app, well } = this;
    this.hud = el('div', 'hud');
    const name = el('div', 'hud-name');
    name.append(el('b', '', this.id), el('h2', '', fmt(well.name)));
    const right = el('div', 'hud-right');
    this.gauge = el('div', 'gauge', '<span>B-factor</span><i><em></em></i>');
    right.append(this.gauge, button('icon', app.soundIcon(), (e) => app.toggleSound(e.currentTarget)), button('icon', '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', () => app.leave()));
    this.hud.append(name, right);
    app.ui.append(this.hud);
    this.setGauge();
  }

  begin() {
    this.phase = 'intro';
    this.app.orbit.enabled = true;
    this.tray = el('div', 'tray');
    this.steps = el('ol', 'steps');
    this.body = el('div', 'tray-body');
    this.tray.append(this.steps, this.body);
    this.app.ui.append(this.tray);
    this.body.append(el('p', 'clue', fmt(this.well.clue)));
    if (this.id === 'A1') this.body.append(el('p', 'feedback', 'Each mistake raises the B-factor and shakes the site. At 100 the crystal is lost.'));
    this.body.append(button('go', 'Start', () => this.enter(0)));
    this.lift();
  }

  lift() {
    const { stage } = this.app;
    if (!this.tray) return;
    const r = this.tray.getBoundingClientRect();
    if (stage.portrait) stage.setLift(Math.round(r.height * 0.42));
    else if (stage.h < 480) stage.setLift(0, Math.round(r.width * 0.5));
    else stage.setLift(0);
  }

  drawSteps(active) {
    const has = this.cfg;
    const names = ['Ligands'];
    if (has.ask || this.st.shapes.length) names.push('Shape');
    if (has.soak || has.auto) names.push('Metal');
    this.steps.innerHTML = names.map((n) => `<li${n === active ? ' class="on"' : ''}>${n}</li>`).join('');
  }

  enter(k) {
    this.k = k;
    this.cfg = this.well.stages[k];
    this.st = this.data.stages[k];
    this.phase = 'find';
    const { view, app } = this;
    const given = this.st.given;
    given.forEach((g, i) => this.after(0.15 + i * 0.16, () => {
      view.bind(k, g.i);
      app.sound.tick();
    }));
    this.groups = [];
    const inGroup = new Set(this.st.together.flat());
    this.st.tap.forEach((t, i) => { if (!inGroup.has(i)) this.groups.push([i]); });
    for (const g of this.st.together) this.groups.push(g);
    this.found = 0;
    this.live = new Map();
    this.st.tap.forEach((t, i) => this.live.set(t.i, i));
    this.decoys = new Set(this.st.decoy.map((d) => d.i));
    view.setHalos([...this.live.keys(), ...this.decoys]);
    this.drawFind();
    if (k > 0) {
      const c = view.stageCentre(k);
      app.orbit.goal.copy(c);
      app.orbit.goalDist = this.closeDist;
      const dir = bestView(this.points(k).map((p) => p.clone().sub(c)));
      app.orbit.aim(dir);
    }
  }

  drawFind() {
    this.drawSteps('Ligands');
    this.body.innerHTML = '';
    this.prompt = el('p', 'task', fmt(this.cfg.find));
    this.dots = el('div', 'dots', this.groups.map(() => '<i></i>').join(''));
    this.feedback = el('p', 'feedback');
    this.body.append(this.prompt, this.dots, this.feedback);
    this.lift();
  }

  say(html, kind = '') {
    if (!this.feedback) return;
    this.feedback.className = `feedback ${kind}`;
    this.feedback.innerHTML = fmt(html);
    this.lift();
  }

  onTap(x, y) {
    if (this.phase !== 'find') return;
    const list = [...this.live.keys(), ...this.decoys];
    const i = this.view.pick(x, y, list);
    if (i < 0) return;
    if (this.live.has(i)) this.hit(i);
    else this.miss(i);
  }

  hit(i) {
    const { view, app, st, k } = this;
    const tapIndex = this.live.get(i);
    const group = this.groups.find((g) => g.includes(tapIndex));
    this.groups.splice(this.groups.indexOf(group), 1);
    group.forEach((ti, n) => {
      const t = st.tap[ti];
      this.live.delete(t.i);
      this.after(n * 0.09, () => {
        view.bind(k, t.i);
        this.pin(t.i, t.d, group.length > 3 ? n > 0 : false);
      });
    });
    view.dropHalos(group.map((ti) => st.tap[ti].i));
    app.sound.good();
    app.buzz(12);
    this.found++;
    this.dots.children[this.found - 1]?.classList.add('on');
    const a = view.atoms[i];
    this.say(`<b>${atomLabel(a)}</b> bound at ${st.tap[tapIndex].d.toFixed(2)} Å.`, 'good');
    if (this.groups.length === 0) {
      this.phase = 'wait';
      view.dropHalos([...this.decoys]);
      this.decoys.clear();
      this.after(0.85, () => this.afterFind());
    }
  }

  pin(i, d, quiet) {
    if (this.tags.has(i) || quiet) return;
    const a = this.view.atoms[i];
    const t = el('div', 'tag', `${fmt(resLabel(a))} <b>${d.toFixed(2)}</b>`);
    document.getElementById('tags').append(t);
    this.tags.set(i, t);
  }

  miss(i) {
    const { view, st, cfg } = this;
    const a = view.atoms[i];
    const d = st.decoy.find((x) => x.i === i).d.toFixed(2);
    this.decoys.delete(i);
    view.dropHalos([i]);
    view.flashWrong(i);
    let text = cfg.notes?.[a.sel];
    if (!text) {
      const twin = st.tap.map((t) => view.atoms[t.i]).find((t) => t.chain === a.chain && t.num === a.num && t.res === a.res);
      if (twin) text = `Right residue, wrong atom. It binds through ${atomLabel(twin).split(' ').pop()}.`;
      else text = `${atomLabel(a)} is not close enough to bond.`;
    }
    this.say(`${d} Å away. ${text}`, 'bad');
    this.penalty();
  }

  penalty() {
    this.mistakes++;
    this.B += WRONG;
    this.app.sound.bad();
    this.app.buzz(40);
    this.gauge.classList.remove('shake');
    void this.gauge.offsetWidth;
    this.gauge.classList.add('shake');
    this.setGauge();
    if (this.B >= 100) this.lose();
  }

  setGauge() {
    const b = Math.min(100, this.B);
    this.gauge.querySelector('em').style.width = `${b}%`;
    this.gauge.classList.toggle('hot', b > 66);
    this.gauge.querySelector('span').textContent = `B-factor ${Math.round(b)}`;
  }

  afterFind() {
    const { cfg, st } = this;
    this.app.sound.lock();
    if (st.shapes.length) this.askShape();
    else if (cfg.ask) this.askQuestion();
    else this.afterShape();
  }

  askShape() {
    this.phase = 'shape';
    this.drawSteps('Shape');
    const { st, view } = this;
    this.body.innerHTML = '';
    this.body.append(el('p', 'task', 'Name the shape. Tap one to lay it over the real atoms.'));
    const row = el('div', 'chips');
    const options = [...st.shapes].sort(() => Math.random() - 0.5);
    this.icons = [];
    this.choice = null;
    const lock = button('go', 'Choose a shape', () => this.lockShape());
    lock.disabled = true;
    for (const name of options) {
      const icon = new ShapeIcon(name);
      const b = el('button', 'chip');
      b.type = 'button';
      b.append(icon.svg, el('span', '', nice(name)));
      b.addEventListener('click', () => {
        for (const c of row.children) c.classList.remove('on');
        b.classList.add('on');
        this.choice = { name, b };
        view.showFit(st.fits[name].verts);
        lock.disabled = false;
        lock.textContent = `Lock in ${name}`;
        this.app.sound.tick();
      });
      row.append(b);
      this.icons.push(icon);
    }
    this.feedback = el('p', 'feedback');
    this.lockButton = lock;
    this.body.append(row, this.feedback, lock);
    this.lift();
  }

  lockShape() {
    const { st, view } = this;
    const { name, b } = this.choice;
    const answer = st.shapes[0];
    if (name === answer) {
      view.showFit(null);
      this.app.sound.lock();
      this.icons = [];
      this.shapeName = answer;
      if (this.cfg.ask) this.askQuestion();
      else this.afterShape();
      return;
    }
    b.disabled = true;
    b.classList.remove('on');
    b.classList.add('out');
    view.showFit(null);
    this.choice = null;
    this.lockButton.disabled = true;
    this.lockButton.textContent = 'Choose a shape';
    this.say(`${nice(name)} misses the real atoms by ${st.fits[name].rmsd.toFixed(2)} Å on average. There is a better fit.`, 'bad');
    this.penalty();
  }

  askQuestion() {
    this.phase = 'ask';
    this.drawSteps('Shape');
    const { ask } = this.cfg;
    this.body.innerHTML = '';
    this.body.append(el('p', 'task', fmt(ask.q)));
    const list = el('div', 'answers');
    for (const o of [...ask.options].sort(() => Math.random() - 0.5)) {
      const b = button('answer', fmt(o.label), () => {
        if (o.ok) {
          this.app.sound.lock();
          this.afterShape();
          return;
        }
        b.disabled = true;
        b.classList.add('out');
        this.say(o.why, 'bad');
        this.penalty();
      });
      list.append(b);
    }
    this.feedback = el('p', 'feedback');
    this.body.append(list, this.feedback);
    this.lift();
  }

  afterShape() {
    if (this.cfg.soak) this.askSoak();
    else this.seat(this.lastMetal, this.k === this.well.stages.length - 1);
  }

  askSoak() {
    this.phase = 'soak';
    this.drawSteps('Metal');
    const { soak } = this.cfg;
    this.body.innerHTML = '';
    this.body.append(el('p', 'task', fmt(soak.prompt ?? 'Drag the right metal salt up into the site, or tap it.')));
    const rack = el('div', 'rack');
    for (const m of [...soak.options].sort(() => Math.random() - 0.5)) {
      const info = METALS[m];
      const v = el('button', 'vial', `<i style="--liquid:${info.liquid}"></i><b>${m}</b><span>${fmt(info.salt)}</span>`);
      v.type = 'button';
      v.dataset.metal = m;
      this.vialEvents(v, m);
      rack.append(v);
    }
    this.feedback = el('p', 'feedback');
    this.body.append(rack, this.feedback);
    this.lift();
  }

  vialEvents(v, metal) {
    let start = null;
    v.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'soak' || v.disabled) return;
      start = { x: e.clientX, y: e.clientY };
      v.setPointerCapture(e.pointerId);
    });
    v.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!this.drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
        this.drag = el('div', 'ghost', `<b>${metal}</b>`);
        this.drag.style.setProperty('--c', METALS[metal].glow);
        document.getElementById('tags').append(this.drag);
      }
      if (this.drag) this.drag.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    });
    const release = (e) => {
      if (!start) return;
      start = null;
      if (this.drag) {
        this.drag.remove();
        this.drag = null;
        if (e.type === 'pointerup') {
          const top = this.tray.getBoundingClientRect().top;
          if (e.clientY < top) this.pour(metal, e.clientX, e.clientY, v);
        }
      } else if (e.type === 'pointerup') {
        const r = v.getBoundingClientRect();
        this.pour(metal, r.left + r.width / 2, r.top, v);
      }
    };
    v.addEventListener('pointerup', release);
    v.addEventListener('pointercancel', release);
    v.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const r = v.getBoundingClientRect();
        this.pour(metal, r.left + r.width / 2, r.top, v);
      }
    });
  }

  worldAt(x, y) {
    const { stage } = this.app;
    const p = new THREE.Vector3((x / stage.w) * 2 - 1, -(y / stage.h) * 2 + 1, 0.5).unproject(stage.camera);
    const dir = p.sub(stage.camera.position).normalize();
    return stage.camera.position.clone().addScaledVector(dir, this.app.orbit.dist * 0.7);
  }

  pour(metal, x, y, vial) {
    if (this.phase !== 'soak') return;
    this.phase = 'fly';
    const { view, k } = this;
    const info = METALS[metal];
    const ions = this.st.metals.slice(0, 5).map(() => view.spawnIon(k, info.glow, info.r, this.worldAt(x, y)));
    this.app.sound.whoosh();
    const ok = metal === this.cfg.soak.answer;
    this.flying.push({ ions, metal, ok, t: 0, from: ions[0].group.position.clone(), to: view.stageCentre(k), vial });
  }

  landed(f) {
    const { metal, ok } = f;
    if (ok) {
      for (const ion of f.ions) this.view.removeIon(ion);
      this.lastMetal = metal;
      this.seat(metal, this.k === this.well.stages.length - 1);
      return;
    }
    // Wrong ion: read the difference map, as you would at the computer.
    for (const ion of f.ions) this.flying.push({ bounce: true, ion, t: 0, from: ion.group.position.clone(), dir: new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize() });
    const real = METALS[this.cfg.soak.answer];
    const tried = METALS[metal];
    const gap = tried.e - real.e;
    let read;
    if (gap >= 5) {
      this.view.setDifference(this.k, 'red');
      read = `Red density: ${fmt(tried.ion)} has too many electrons for this peak.`;
    } else if (gap <= -5) {
      this.view.setDifference(this.k, 'green');
      read = `Green density stays: ${fmt(tried.ion)} has too few electrons for this peak.`;
    } else {
      this.view.setDifference(this.k, 'green');
      read = `The electron count is close, so density alone cannot decide.`;
    }
    f.vial.disabled = true;
    f.vial.classList.add('out');
    this.phase = 'soak';
    this.say(`${read} ${this.cfg.soak.why?.[metal] ?? `${fmt(tried.ion)} likes ${tried.likes}.`}`, 'bad');
    this.penalty();
  }

  // The metal seats: crystal lights, density goes flat, and colour runs out through the chain.
  seat(metal, last) {
    const { view, app, k } = this;
    const info = METALS[metal];
    this.lastMetal = metal;
    view.seatMetals(k, info.glow);
    view.dropHalos([...this.decoys]);
    app.sound.ignite(last);
    app.buzz(last ? [30, 50, 60] : 30);
    const c = view.stageCentre(k);
    const u = app.stage.u;
    const p = app.stage.project(c, new THREE.Vector3());
    u.uBurstCentre.value.set(p.x / app.stage.w, 1 - p.y / app.stage.h);
    this.flash = last ? 0.16 : 0.08;
    u.uTint.value.set(this.well.metal === metal ? view.tint : new THREE.Color(info.glow));
    this.burst = { t: 0, big: last };
    if (last) this.finale();
    else {
      this.phase = 'wait';
      this.body.innerHTML = '';
      this.after(1.5, () => this.enter(k + 1));
    }
  }

  finale() {
    this.phase = 'bloom';
    const { app, view } = this;
    this.tags.forEach((t) => t.classList.add('fade'));
    this.tray.remove();
    this.tray = null;
    app.stage.setLift(0);
    app.orbit.enabled = true;
    let far = 0;
    const p = view.geometry.attributes.aDist;
    for (let i = 0; i < p.count; i++) far = Math.max(far, p.getX(i));
    this.far = far + 8;
    // Frame the whole molecule in the part of the screen the results sheet leaves free.
    const { stage } = app;
    const tan = Math.tan((stage.camera.fov * Math.PI) / 360);
    const sphere = view.geometry.boundingSphere;
    const R = sphere.radius;
    const room = stage.portrait ? 0.38 : 1;
    const dist = Math.max(R / (tan * room), R / (tan * stage.camera.aspect)) * 1.08;
    app.orbit.goal.copy(sphere.center);
    app.orbit.goalDist = dist;
    app.orbit.maxDist = dist * 1.6;
    app.orbit.minDist = 10;
    view.ribbonMat.uniforms.uFogNear.value = dist;
    view.ribbonMat.uniforms.uFogFar.value = dist + R * 2.6;
    view.fog.uFogNear.value = dist;
    view.fog.uFogFar.value = dist + R * 2.6;
    this.bloomT = 0;
    this.after(2.5, () => this.finish());
  }

  resolution() {
    return 0.9 + 0.022 * (Math.min(this.B, 100) - 10);
  }

  finish() {
    this.phase = 'done';
    const { app, data, well, view } = this;
    const res = this.resolution();
    app.record(this.id, res);
    const s = el('section', 'sheet');
    const atoms = data.stages.flatMap((st) => [...st.given, ...st.tap]).sort((a, b) => a.d - b.d);
    const seen = new Set();
    const rows = atoms.filter((a) => (seen.has(a.i) ? false : seen.add(a.i))).slice(0, 6).map((a) => `<li><span>${fmt(atomLabel(view.atoms[a.i]))}</span><b>${a.d.toFixed(2)} Å</b></li>`).join('');
    const fit = data.stages.flatMap((st) => (st.shapes[0] ? [`${nice(st.shapes[0])}, ${st.fits[st.shapes[0]].rmsd.toFixed(2)} Å from ideal`] : []));
    const flawless = this.mistakes === 0;
    s.innerHTML = `
      <p class="kicker">Solved at ${res.toFixed(2)} Å${flawless ? ', with no mistakes' : ''}</p>
      <h2>${fmt(well.protein)}</h2>
      <p>${fmt(well.note)}</p>
      ${fit.length ? `<p class="fit">${fit.map(fmt).join('<br>')}</p>` : ''}
      <ul class="bonds">${rows}</ul>
      <p class="cite">PDB ${data.pdb}, ${data.res.toFixed(2)} Å, ${well.org}. ${citation(data.cite)}</p>`;
    const go = el('div', 'actions');
    const next = app.nextAfter(this.id);
    if (next) go.append(button('go', `Next: well ${next}`, () => app.open(next)));
    go.append(button('plain', 'Back to the plate', () => app.leave()));
    s.append(go);
    app.ui.append(s);
    this.sheet = s;
    this.gauge.remove();
    if (app.stage.portrait) app.stage.setLift(Math.round(s.getBoundingClientRect().height * 0.5 - 22));
    else app.stage.setLift(0, Math.round(s.getBoundingClientRect().width * 0.5));
  }

  lose() {
    if (this.phase === 'lost') return;
    this.phase = 'lost';
    const { app } = this;
    this.view.jitter = 0.22;
    this.tray?.remove();
    this.tray = null;
    app.stage.setLift(0);
    const s = el('section', 'sheet');
    s.innerHTML = '<p class="kicker">B-factor 100</p><h2>The crystal lost order</h2><p>Every wrong answer shook the site harder, until the atoms blurred out of the density. Start this well again.</p>';
    const go = el('div', 'actions');
    go.append(button('go', 'Try again', () => app.open(this.id)), button('plain', 'Back to the plate', () => app.leave()));
    s.append(go);
    app.ui.append(s);
    this.sheet = s;
  }

  update(dt, t) {
    const { view, app } = this;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const x = this.timers[i];
      x.left -= dt;
      if (x.left <= 0) {
        this.timers.splice(i, 1);
        x.fn();
      }
    }
    if (['find', 'shape', 'ask', 'soak'].includes(this.phase)) {
      this.seconds += dt;
      this.B += dt * 0.16;
      this.setGauge();
      if (this.B >= 100) this.lose();
    }
    if (this.phase !== 'lost') view.jitter = 0.002 + 0.03 * (Math.min(this.B, 100) / 100) ** 2;
    const open = this.bloomT === undefined;
    view.ribbonMat.uniforms.uSlab.value = open ? Math.max(0.1, app.orbit.dist - 2.5) : Math.max(0, view.ribbonMat.uniforms.uSlab.value - dt * 30);
    this.iconT += dt;
    this.icons.forEach((ic, i) => ic.draw(this.iconT * 0.7 + i));

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      if (f.bounce) {
        const k = f.t / 0.8;
        f.ion.group.position.copy(f.from).addScaledVector(f.dir, k * k * 24);
        f.ion.halo.material.opacity = 1 - k;
        if (k >= 1) {
          view.removeIon(f.ion);
          this.flying.splice(i, 1);
        }
      } else {
        const k = Math.min(1, f.t / 0.55);
        const e = k * k;
        f.ions.forEach((ion, n) => ion.group.position.lerpVectors(f.from, f.to, e).add(new THREE.Vector3(Math.sin(k * 9 + n), Math.cos(k * 8 + n), 0).multiplyScalar((1 - k) * 0.5 * (f.ions.length > 1 ? 1 : 0))));
        if (k >= 1) {
          this.flying.splice(i, 1);
          this.landed(f);
        }
      }
    }

    const u = app.stage.u;
    if (this.burst) {
      this.burst.t += dt;
      const len = this.burst.big ? 2.6 : 1.2;
      const k = Math.min(1, this.burst.t / len);
      u.uBurst.value = (1 - k) ** 1.6 * (this.burst.big ? 1.15 : 0.7);
      u.uBurstRadius.value = 0.06 + (1 - (1 - k) ** 2.2) * (this.burst.big ? 1.25 : 0.42);
      u.uFlash.value = Math.max(0, 1 - this.burst.t * 7) * this.flash;
      if (k >= 1) this.burst = null;
    }
    if (this.bloomT !== undefined) {
      this.bloomT += dt;
      const k = Math.min(1, this.bloomT / 2.8);
      view.front = this.far * (1 - (1 - k) ** 2);
    }
    // Tags sit just outside each atom, away from the site, so they cover less of it.
    const P = new THREE.Vector3();
    const C = app.stage.project(view.stageCentre(Math.min(this.k, this.data.stages.length - 1)), new THREE.Vector3());
    this.tags.forEach((tag, i) => {
      app.stage.project(view.atoms[i].now, P);
      const dx = P.x - C.x;
      const dy = P.y - C.y;
      const l = Math.hypot(dx, dy) || 1;
      tag.style.transform = `translate(${(P.x + (dx / l) * 34).toFixed(1)}px, ${(P.y + (dy / l) * 20).toFixed(1)}px) translate(-50%, -50%)`;
    });
    view.step(dt, t);
  }

  dispose() {
    this.tags.forEach((t) => t.remove());
    this.hud.remove();
    this.tray?.remove();
    this.sheet?.remove();
    this.drag?.remove();
    this.view.dispose();
    const u = this.app.stage.u;
    u.uBurst.value = 0;
    u.uFlash.value = 0;
    this.app.stage.setLift(0);
  }
}

function citation(c) {
  if (!c?.ref) return '';
  const first = c.auth.split(',')[0].split('.').pop().toLowerCase().replace(/(^|-)\S/g, (x) => x.toUpperCase());
  const m = /^(.*?)\s+V\.\s*(\S+)\s+(\S+)\s+(\d{4})/.exec(c.ref);
  const journal = (m ? m[1] : c.ref).replace(/\./g, '. ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase())
    .replace('Usa', 'USA').replace('Crystallogr. ,sect. B', 'Crystallogr. B');
  const body = m ? `${journal} ${m[2]}, ${m[3]} (${m[4]})` : journal;
  const link = c.doi ? ` <a href="https://doi.org/${c.doi}" target="_blank" rel="noopener">Paper</a>` : '';
  return `${first} et al., ${body}.${link}`;
}
