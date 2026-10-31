// The second stage of each chapter: a mechanic that is the catalytic strategy itself.
import { el, logDial, plot, fmtPow } from './ui.js';
import { charge, neighbours, clone } from '../chem/engine.js';
import { bellCurve, pHMaximum, protonationPopulations, caRate, musicFor, gapSeconds, zpeKIE, stretchRatio, piOverlap, enediolLost, kTS } from '../logic/rates.js';
import { INHIBITORS, OMP } from '../chapters.js';
import routes from '../data/routes.json';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function leaveButton(app, res) { return app.ui.button('Leave this stage', () => res(false), 'ghost'); }

// Tap an atom in the scene. Resolves with its id.
function pickAtom(app, ids) {
  return new Promise((res) => {
    app.onPointer = {
      down(x, y) {
        const { site } = app; let best = null, bd = 46;
        for (const id of ids) { const [px, py] = site.toScreen(site.pos[id]), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = id; } }
        if (best) { app.onPointer = null; res(best); }
      }, move() {}, up() {},
    };
  });
}

// ------------------------------------------------------------------ 1. What would help?
export async function tools(app, ch, ses) {
  const { ui, site } = app, spec = ses.spec, log = ses.log, idx = spec.index;
  // Read the needs off the route the player actually drew.
  const after0 = log.filter((l) => l.step === 0).pop().st, start = app.startState;
  const after1 = log.filter((l) => l.step === 1).pop().st;
  const protonsOn = (st, i) => neighbours(st, i).filter((j) => spec.atoms[j].el === 'H').length;
  let hole = null, base = null, acid = null;
  for (const a of spec.atoms) { if (charge(after0, spec.index[a.id]) === -1) hole = a.id; }
  for (const a of spec.atoms) {
    if (a.el !== 'O' && a.el !== 'N') continue;
    const i = spec.index[a.id];
    if (protonsOn(after0, i) < protonsOn(start, i)) base = a.id;
    if (a.res === 'amide' && protonsOn(after1, i) > protonsOn(after0, i)) acid = a.id;
  }
  const ask = [
    { q: 'Which atom took on a negative charge with nothing to hold it? An enzyme would give it a pocket of hydrogen bonds.', a: hole, ok: 'Yes. That pocket is called an oxyanion hole.', no: 'Look for the atom marked with a minus sign in the tetrahedral form.' },
    { q: 'Which oxygen had to lose a proton as it attacked? An enzyme would put a base beside it.', a: base, ok: 'Yes. A general base takes the proton as the bond forms.', no: 'It is the oxygen that attacked the carbon.' },
    { q: 'Which atom needed a proton before it could leave? An enzyme would put an acid beside it.', a: acid, ok: 'Yes. A general acid gives the leaving group a proton.', no: 'It is the atom whose bond to carbon had to break.' },
  ];
  site.setState(app.startState);
  ui.clearTray();
  let misses = 0;
  const heavy = spec.atoms.filter((a) => a.el !== 'H').map((a) => a.id);
  for (const k of ask) {
    ui.say(k.q); ui.clearRow();
    for (;;) {
      const id = await pickAtom(app, heavy);
      site.glowWant = new Float32Array(spec.n); site.glowWant[idx[id]] = 1;
      if (id === k.a) { app.sound.good(1); ui.say(k.ok, null, 'good'); await wait(1500); break; }
      misses += 1; app.sound.bad(); ui.say(k.no, null, 'bad');
    }
  }
  await ui.tell([['t', 'A base, an acid and a charge pocket: the next chapters are real sites that hold these in place.']]);
  return true;
}

// ------------------------------------------------------------------ 2. Line up the triad
export async function triad(app, ch, ses) {
  const { ui, site } = app;
  const [cb, cg] = site.site.axis, base = site.site.pos, ring = ['HCd', 'HCe', 'HNd', 'HNe', 'HHd', 'HCg'];
  const u = (() => { const d = [cg[0] - cb[0], cg[1] - cb[1], cg[2] - cb[2]], l = Math.hypot(...d); return d.map((v) => v / l); })();
  const rot = (p, a) => { const v = [p[0] - cg[0], p[1] - cg[1], p[2] - cg[2]], c = Math.cos(a), s = Math.sin(a), d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return [0, 1, 2].map((k) => cg[k] + v[k] * c + x[k] * s + u[k] * d * (1 - c)); };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  site.setState(app.startState);
  ui.clearTray(); ui.tray.className = 'tray tall';
  const read = el('div', 'read'); ui.tray.append(read);
  let good = false;
  const dial = logDial(ui.tray, { min: -180, max: 180, value: 145, log: false, fmt: (v) => `ring turned ${v.toFixed(0)}° from the crystal`, onChange: (v) => update(v) });
  const update = (deg) => {
    const a = deg * Math.PI / 180, o = {};
    for (const id of ring) o[id] = rot(base[id], a);
    site.override = o;
    const d1 = dist(o.HNe, base.Og), d2 = Math.min(dist(o.HNd, base.DO1), dist(o.HNd, base.DO2));
    read.innerHTML = `<em class="tag c">computed by this game</em><p>Nε to Ser221 Oγ <b>${d1.toFixed(1)} Å</b> &nbsp; Nδ to Asp32 <b>${d2.toFixed(1)} Å</b></p>`;
    const ok = d1 <= 3.3 && d2 <= 3.3;
    if (ok && !good) { good = true; app.sound.good(2); app.haptic(16); done.disabled = false; ui.say('Both hydrogen bonds close. Serine, histidine and aspartate now form one line.', null, 'good'); }
    if (!ok && good) { good = false; done.disabled = true; ui.say('A hydrogen bond has opened again. Keep turning.', null, 'open'); }
  };
  ui.say('Turn His64 about its real χ2 axis. Close both hydrogen bonds.');
  ui.clearRow();
  const done = ui.button('Fixed', () => {}, 'go'); done.disabled = true;
  const r = await new Promise((res) => { done.onclick = () => res(true); leaveButton(app, res); update(145); });
  if (r) {
    ui.clearRow(); ui.say('Now tap the nitrogen that must carry the proton, so that the other one can take serine\'s.');
    for (;;) {
      const id = await pickAtom(app, ['HNd', 'HNe']);
      const o = site.override || {}, dNd = Math.min(dist(o.HNd, base.DO1), dist(o.HNd, base.DO2)), dNe = Math.min(dist(o.HNe, base.DO1), dist(o.HNe, base.DO2));
      if (id === (dNd < dNe ? 'HNd' : 'HNe')) break;
      app.sound.bad(); ui.say('That nitrogen faces serine. It needs a free lone pair to take the proton.', null, 'bad');
    }
    app.sound.good(3);
    await ui.tell([['t', 'Nδ holds its proton toward Asp32, so Nε keeps a free lone pair toward serine. This is a reading of the crystal geometry.'], ['t', 'The geometry says what is in place. The next stage shows what experiments say each piece is worth.']]);
  }
  site.override = null; ui.clearTray();
  return !!r;
}

// ------------------------------------------------------------------ 3. Protonation and pH
export async function protons(app, ch, ses) {
  const { ui, site } = app;
  ui.clearTray(); ui.tray.className = 'tray tall';
  const state = { h12: 1, h119: 1 };
  const keys = [['His12', 'h12'], ['His119', 'h119']];
  const grid = el('div', 'twins'), result = el('div', 'read');
  ui.tray.append(grid, result);
  const paint = () => { grid.innerHTML = ''; for (const [n, k] of keys) { const b = el('button', `tog ${state[k] ? 'on' : ''}`, `<small>${n}</small><b>${state[k] ? 'protonated, H⁺' : 'neutral'}</b>`); b.onclick = () => { state[k] = 1 - state[k]; app.sound.tap(); paint(); }; grid.append(b); } };
  paint();
  ui.say('Set each histidine, then ask whether this game\'s rules allow RNA to be cut in that state.');
  ui.clearRow();
  const found = await new Promise((res) => {
    ui.button('Try it', () => {
      const key = `${state.h12 ? 'HIP' : 'HID'}/${state.h119 ? 'HIP' : 'HIE'}`, r = routes.combos[key];
      if (r.ok) { app.sound.good(1); res(true); return; }
      app.sound.bad(); ui.say(r.reason || 'No legal route from this state.', null, 'bad');
    }, 'go');
    leaveButton(app, res);
  });
  if (!found) { ui.clearTray(); return false; }
  ui.say('Only one of these four works: His12 neutral, His119 protonated. That follows from our rules: a base needs a free lone pair, a proton cannot cross phosphorus, and phosphoryl oxygens carry no proton here.', null, 'good');
  await new Promise((res) => { ui.clearRow(); ui.button('Next', res, 'go'); });
  // Now the populations.
  ui.clearTray(); ui.tray.className = 'tray tall';
  const cv = el('canvas', 'chart'), read = el('div', 'read'); ui.tray.append(cv, read);
  let swap = false, pH = 8, peak = false;
  const draw = () => {
    const [a, b] = swap ? [6.2, 5.8] : [5.8, 6.2];
    const curve = bellCurve(a, b, 3, 9);
    plot(cv, { series: [{ pts: curve }], xmin: 3, xmax: 9, ymin: 0, ymax: 0.42, mark: pH, xticks: [3, 5, 7, 9], xlabel: 'pH' });
    const f = protonationPopulations(pH, a, b);
    read.innerHTML = `<em class="tag c">computed by this game</em><p>At pH ${pH.toFixed(1)}: His12 free <b>${(f.base * 100).toFixed(0)}%</b>, His119 protonated <b>${(f.acid * 100).toFixed(0)}%</b>, both at once <b>${(f.active * 100).toFixed(0)}%</b></p>`;
    if (Math.abs(pH - pHMaximum(a, b)) < 0.25 && !peak) { peak = true; app.sound.good(2); ok.disabled = false; ui.say('You found the top of the bell. Measured cleavage of UpA peaks at pH 6.0.', 'm', 'good'); }
  };
  ui.say('In the free enzyme the pKa values of His12 and His119 are near 5.8 and 6.2. Those suit kcat/KM, the rate that sees free enzyme. Find the pH where the active form peaks.', 'm');
  ui.clearRow();
  const ok = ui.button('Next', () => {}, 'go'); ok.disabled = true;
  logDial(ui.tray, { min: 3, max: 9, value: 8, log: false, fmt: (v) => `pH ${v.toFixed(1)}`, onChange: (v) => { pH = v; draw(); } });
  draw();
  await new Promise((res) => { ok.onclick = res; });
  ui.clearRow();
  const sw = ui.button('Swap the two pKa values', () => { swap = !swap; draw(); app.sound.tap(); sw.dataset.t = 1; ui.say('The shape and the peak do not move. Only the height changes, and the height cannot be known without the true rate.', 'c', 'good'); nx.disabled = false; });
  const nx = ui.button('Next', () => {}, 'go'); nx.disabled = true;
  ui.say('Try a control. What if the two pKa values belong the other way round?');
  await new Promise((res) => { nx.onclick = res; });
  await ui.tell([['m', 'The NMR assignments of these two histidines really were swapped once, and later NMR corrected them. The mechanism survived.']]);
  ui.clearTray();
  return true;
}

// ------------------------------------------------------------------ 4. Be the proton shuttle
export async function relay(app, ch, ses) {
  const { ui, site, sound } = app;
  ui.clearTray(); ui.tray.className = 'tray tall';
  const read = el('div', 'read'), meter = el('div', 'meter', '<i></i>'); ui.tray.append(read, meter);
  const chain = ['Ow', 'W1', 'W2', 'HNd'];
  let his = true, buffer = 0;
  const show = () => {
    const k = caRate({ his64: his, bufferM: buffer });
    read.innerHTML = `<em class="tag t">teaching model</em><p>Turnover about <b>${fmtPow(k)}</b> per second. Gong every <b>${gapSeconds(k).toFixed(1)} s</b> in the piece.</p>`;
    meter.firstChild.style.width = `${Math.max(3, (Math.log10(k) - 2) / 5 * 100)}%`;
    sound.setMusic(ch.key, { ...musicFor(k), layers: 3, gong: true, noRest: true });
  };
  const round = (want, ids) => new Promise((res) => {
    let at = 0, count = 0, active = false;
    app.onPointer = {
      down(x, y) { active = true; at = 0; this.move(x, y); },
      move(x, y) {
        if (!active || at >= ids.length) return;
        const [px, py] = site.toScreen(site.pos[ids[at]]);
        if (Math.hypot(px - x, py - y) < 54) {
          sound.stroke(at * 2 + 1); site.burst(site.pos[ids[at]], 7, 1.4); app.haptic(8);
          at += 1;
          if (at === ids.length) { count += 1; active = false; sound.good(count); site.burst(site.pos[ids[at - 1]], 16, 1.8); res1(); }
        }
      },
      up() { active = false; if (at < ids.length && at > 0) ui.say(want.partial || 'Keep your finger down along the whole wire.', null, 'open'); },
    };
    const res1 = () => { if (count >= want.n) { app.onPointer = null; res(); } else ui.say(`${want.text} ${want.n - count} to go.`, null, 'open'); };
  });
  site.setState(ses.mid[ses.mid.length - 1]);
  show();
  ui.clearRow();
  // Every wait below can be left, so this stage never holds a player.
  let left = false;
  const bail = new Promise((res) => leaveButton(app, () => { left = true; app.onPointer = null; res(); }));
  const until = (p) => Promise.race([p, bail]);
  const quit = () => { ui.clearTray(); sound.setMusic(ch.key, { ...musicFor(caRate({ his64: true })), layers: 1, gong: true }); return false; };
  ui.say('Each new CO₂ needs the zinc water emptied. Run a finger from the zinc water along the wire to His64, three times.');
  await until(round({ n: 3, text: 'A proton is away.' }, chain));
  if (left) return quit();
  ui.say('You kept up. His64 hands each proton on to the buffer outside.', null, 'good');
  await wait(1300);
  his = false; show();
  const st = clone(site.st); for (const id of ['HCg', 'HCd', 'HCe', 'HNd', 'HNe', 'HHe', 'H2a']) st.on[st.spec.index[id]] = 0;
  site.setState(st);
  ui.say('Now His64 is gone, an alanine in its place. Run the wire again.');
  await until(round({ n: 1, text: '' }, ['Ow', 'W1', 'W2']));
  if (left) return quit();
  sound.bad();
  ui.say('The wire ends in nothing. Without buffer, proton transfer is up to 20-fold slower. This kcat is scaled from that.', 't', 'bad');
  await wait(1500);
  ui.say('Add imidazole, a small buffer that can reach in. Then run the wire once more.');
  const added = new Promise((res) => {
    logDial(ui.tray, { min: 0, max: 50, value: 0, log: false, ticks: false, fmt: (v) => `imidazole ${v.toFixed(0)} mM`, onChange: (v) => { buffer = v / 1000; show(); if (v > 10) res(); } });
  });
  await until(added);
  if (left) return quit();
  await until(round({ n: 1, text: '' }, ['Ow', 'W1', 'W2']));
  if (left) return quit();
  ui.clearRow();
  sound.setMusic(ch.key, { ...musicFor(caRate({ his64: true })), layers: 3, gong: true });
  await ui.tell([['m', 'Imidazole restores the proton transfer in this mutant, though a saturating rescue reached only about 40% of wild type with a related buffer.'], ['t', 'Which waters carry the proton, and whether they form one fixed wire, is still debated. The crystal wire here is one snapshot.']]);
  // Restore for the next stage.
  ui.clearTray();
  return true;
}

// ------------------------------------------------------------------ 5. Hold the loop
export async function loop(app, ch, ses) {
  const { ui, site, sound } = app, L = site.site.loop;
  ui.clearTray(); ui.tray.className = 'tray tall';
  const read = el('div', 'read'), hold = el('button', 'hold', 'Hold the loop shut'); ui.tray.append(read, hold);
  let shut = false, closure = 0, phase = 'empty', tPhase = 0, clean = 0, lost = 0, stop = false;
  const setPhase = (p) => { phase = p; tPhase = performance.now(); };
  const leak = enediolLost(5.5);
  const paint = () => { read.innerHTML = `<em class="tag t">teaching model</em><p>Clean turnovers <b>${clean}</b> of 3. Lost as methylglyoxal <b>${lost}</b></p>`; };
  const press = (e) => { e.preventDefault(); shut = true; hold.classList.add('on'); app.haptic(10); };
  const release = () => { shut = false; hold.classList.remove('on'); };
  hold.addEventListener('pointerdown', press); hold.addEventListener('pointerup', release); hold.addEventListener('pointercancel', release); hold.addEventListener('pointerleave', release);
  ui.clearRow();
  paint();
  ui.say('A DHAP has arrived. Press and hold to bring the loop over it.');
  const res = await new Promise((resolve) => {
    leaveButton(app, resolve);
    const tick = () => {
      if (stop || app.screen !== 'play') return;
      const dt = 1 / 60;
      closure += ((shut ? 1 : 0) - closure) * 0.12;
      site.loopPts = L.open.map((p, i) => p.map((v, k) => v + (L.closed[i][k] - v) * closure));
      const age = performance.now() - tPhase;
      if (phase === 'empty') {
        if (closure > 0.85) { setPhase('react1'); ui.say('Shut. Glu165 takes the proton, and the enediol forms. Hold on.', null, 'open'); sound.good(1); }
      } else if (phase === 'react1') {
        if (closure < 0.5) { const out = Math.random() < leak; if (out) { lost += 1; sound.bad(); site.burst([0, 0, 2], 18, 1.2); ui.say('The loop opened with the enediol exposed, and it was lost.', null, 'bad'); } else { ui.say('Lucky: the enediol stayed. Without its loop it usually does not.', null, 'open'); } paint(); setPhase('empty'); return requestAnimationFrame(tick); }
        if (age > 1500) { setPhase('react2'); sound.good(2); ui.say('Protons are moving through the enediol. Keep holding.', null, 'open'); }
      } else if (phase === 'react2') {
        if (closure < 0.5) { const out = Math.random() < leak; if (out) { lost += 1; sound.bad(); site.burst([0, 0, 2], 18, 1.2); ui.say('Too soon. The enediol was lost.', null, 'bad'); } paint(); setPhase('empty'); return requestAnimationFrame(tick); }
        if (age > 1500) { setPhase('product'); sound.good(3); ui.say('Product. Let go, so it can leave.', null, 'good'); }
      } else if (phase === 'product') {
        if (closure < 0.4) { clean += 1; sound.gongNow(); app.haptic(20); paint(); if (clean >= 3) { stop = true; resolve(true); return; } setPhase('empty'); ui.say('Clean. The next DHAP is here. Hold again.', null, 'good'); }
      }
      requestAnimationFrame(tick);
    };
    setPhase('empty'); tick();
  });
  stop = true; site.loopPts = null;
  ui.clearTray();
  const tipMove = Math.max(...L.open.map((p, i) => Math.hypot(p[0] - L.closed[i][0], p[1] - L.closed[i][1], p[2] - L.closed[i][2])));
  if (res) await ui.tell([
    ['c', `The chance of loss here is ${(leak * 100).toFixed(0)}%, from the measured ratio in the mutant with no loop tip, with glyceraldehyde phosphate as substrate.`],
    ['t', 'A real loop flips about 30,000 times a second. One solid-state NMR study saw similar rates with and without ligand. Your finger stands in for the time it spends shut.'],
    ['c', `The loop really moves: up to ${tipMove.toFixed(1)} Å at Gly173 between crystals 1YPI and 7TIM, computed here after superposing them.`],
    ['m', 'What the loop is for is still argued. Pompliano and Knowles saw it keep the enediol from escaping. Richard found elimination parameters similar with and without the segment.'],
    ['m', 'A later view: closure mainly shuts out water, which makes Glu165 a stronger base (Malabanan et al. 2010).'],
  ]);
  return !!res;
}

// ------------------------------------------------------------------ 6. Weigh the hydrogen
export async function pluck(app, ch, ses) {
  const { ui, site, sound } = app;
  ui.clearTray(); ui.tray.className = 'tray tall';
  const twin = el('div', 'twins'), read = el('div', 'read'); ui.tray.append(twin, read);
  const R = stretchRatio();
  let h = false, d = false, T = 25;
  const line = () => {
    const k = zpeKIE(2900, 2100, T + 273);
    read.innerHTML = `<em class="tag c">computed by this game</em><p>Frequency ratio from the masses <b>${R.toFixed(2)}</b>. If the bond is fully broken at the top, H is faster than D by <b>${k.toFixed(1)}</b> at ${T.toFixed(0)} °C.</p>`;
  };
  const strum = (rate, id) => {
    sound.pluck(rate); app.haptic(10);
    const home = site.pos.HR.slice(); let t = 0;
    const go = () => { t += 1 / 60; if (t > 1) { site.override = null; return; } site.override = { HR: home.map((v, i) => v + (i === 1 ? Math.sin(t * 60 * rate * (id ? 1 : 1)) * 0.16 * (1 - t) : 0)) }; requestAnimationFrame(go); };
    go();
  };
  const a = el('button', 'tog', '<small>C–H</small><b>pluck</b>'), b = el('button', 'tog', '<small>C–D</small><b>pluck</b>');
  twin.append(a, b);
  ui.clearRow();
  const nx = ui.button('Next', () => {}, 'go'); nx.disabled = true;
  a.onclick = () => { h = true; strum(1, 0); ready(); };
  b.onclick = () => { d = true; strum(1 / R, 1); ready(); };
  const ready = () => { if (h && d) { nx.disabled = false; ui.say('Same spring, heavier mass, lower note. A zero-point energy is half the vibration, so C–H starts higher.', 'c', 'good'); } };
  line();
  logDial(ui.tray, { min: 0, max: 60, value: 25, log: false, ticks: false, fmt: (v) => `${v.toFixed(0)} °C`, onChange: (v) => { T = v; line(); } });
  ui.say('Pluck both bonds and listen. The bar pitch here is scaled by the real mass ratio.');
  await new Promise((res) => { nx.onclick = res; });
  ui.clearTray();
  return true;
}

// ------------------------------------------------------------------ 7. Dunathan's dial
export async function dunathan(app, ch, ses) {
  const { ui, site, sound } = app, D = site.site.dun;
  ui.clearTray(); ui.tray.className = 'tray tall';
  const cv = el('canvas', 'newman'), read = el('div', 'read'); ui.tray.append(cv, read);
  const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const axis = unit([D.ca[0] - D.n[0], D.ca[1] - D.n[1], D.ca[2] - D.n[2]]);
  const N = unit(D.normal);
  const rot = (v, a) => { const c = Math.cos(a), s = Math.sin(a), d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2], x = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]]; return [0, 1, 2].map((k) => v[k] * c + x[k] * s + axis[k] * d * (1 - c)); };
  // Basis looking down the N–Cα axis: y along the part of the ring normal perpendicular to that axis.
  const yv = unit(N.map((v, k) => v - axis[k] * (N[0] * axis[0] + N[1] * axis[1] + N[2] * axis[2]))), xv = [axis[1] * yv[2] - axis[2] * yv[1], axis[2] * yv[0] - axis[0] * yv[2], axis[0] * yv[1] - axis[1] * yv[0]];
  const bonds = [['H', D.h, '#fff0d0'], ['COO⁻', D.c, '#ef6b52'], ['side chain', D.cb, '#7fd6bd']];
  let hit = false;
  const angleFromNormal = (v) => Math.acos(Math.min(1, Math.abs(unit(v).reduce((s, x, k) => s + x * N[k], 0)))) * 180 / Math.PI;
  const paint = (deg) => {
    const dpr = 2, W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const cx = W * 0.27, cy = H / 2, r = Math.min(H * 0.34, 50);
    // The pi orbitals of the ring, above and below.
    c.fillStyle = 'rgba(230,182,92,.17)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx, cy + s * r * 0.62, r * 0.3, r * 0.6, 0, 0, 6.3); c.fill(); }
    c.strokeStyle = 'rgba(230,182,92,.65)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - r * 1.1, cy); c.lineTo(cx + r * 1.1, cy); c.stroke();
    const a = deg * Math.PI / 180, out = [];
    c.font = '14px "Alegreya Sans"'; c.textAlign = 'center';
    for (const [name, v, col] of bonds) {
      const w = rot(v, a), x = w.reduce((s, q, k) => s + q * xv[k], 0), y = w.reduce((s, q, k) => s + q * yv[k], 0), l = Math.hypot(x, y) || 1;
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + x / l * r, cy - y / l * r); c.stroke();
      c.fillStyle = col; c.fillText(name, cx + x / l * (r + 12), cy - y / l * (r + 12) + 4);
      out.push([name, piOverlap(angleFromNormal(w)), col]);
    }
    c.textAlign = 'left';
    out.forEach(([name, ov, col], i) => { const y = 22 + i * 30, x = W * 0.56, w = W * 0.4; c.fillStyle = '#c9b48d'; c.fillText(name, x, y); c.fillStyle = 'rgba(230,182,92,.14)'; c.fillRect(x, y + 5, w, 7); c.fillStyle = col; c.fillRect(x, y + 5, w * ov, 7); });
    return out;
  };
  const dial = logDial(ui.tray, { min: -180, max: 180, value: 80, log: false, fmt: (v) => `turned ${v.toFixed(0)}° from the crystal`, onChange: (v) => check(v) });
  const check = (v) => {
    const o = paint(v), h = o[0][1], c = o[1][1];
    read.innerHTML = '<em class="tag c">computed by this game, from the coordinates of 1ARG</em>';
    if (h >= 0.85 && !hit) { hit = true; sound.good(3); app.haptic(14); nx.disabled = false; ui.say('The C–H bond now lies along the pi orbitals, so its electrons can pour into the ring.', null, 'good'); } else if (c >= 0.85 && !hit) ui.say('Now the carboxylate lies along the pi system. Other PLP enzymes use this pose to lose CO₂.', null, 'open');
    if (h < 0.7 && hit) { hit = false; nx.disabled = true; ui.say('Line up the bond that must break.', null, 'open'); }
  };
  ui.clearRow();
  const nx = ui.button('Next', () => {}, 'go'); nx.disabled = true;
  ui.say('Which bond breaks is set by how the enzyme holds Cα. Turn it until the C–H bond lies along the ring\'s pi orbitals.');
  setTimeout(() => check(80), 30);
  const solved = await new Promise((res) => { nx.onclick = () => res(true); leaveButton(app, res); });
  if (!solved) { ui.clearTray(); return false; }
  await ui.tell([['c', `In the crystal the C–H bond is ${D.crystal.h.toFixed(0)}° from the ring normal, the carboxylate ${D.crystal.c.toFixed(0)}° and the side chain ${D.crystal.cb.toFixed(0)}°.`], ['t', 'This is the Dunathan idea of 1966. The bond to break is held perpendicular to the plane of the ring.'], ['c', `This crystal is a reduced analogue, and the C4–C4′–N plane is twisted ${D.twist.toFixed(0)}° out of the ring. The hydrogen is placed by rule. So these angles are a guide, not a catalytic snapshot.`]]);
  ui.clearTray();
  return true;
}

// ------------------------------------------------------------------ 8. Trap the intermediate
const TRAP = {
  'WT/natural': { seen: false, text: 'Nothing accumulates. If a covalent form exists, it clears too fast to see.' },
  'E35Q/natural': { seen: false, text: 'Almost no activity: the mutant lost its acid, and a normal sugar leaves badly without it.' },
  'WT/NAG2F': { seen: false, text: 'A good substrate, kcat/KM 1,200 per molar per minute. The study reports no intermediate for this pair.' },
  'E35Q/NAG2F': { seen: true, mass: 14719, gain: 405, text: 'A covalent form appears: mass 14,719, a gain of 405. It still turned over too fast to crystallise.' },
  'WT/NAG2FGlcF': { seen: true, mass: 14683, gain: 367, text: 'A covalent form appears: mass 14,683. Fluorine on C2 slows both steps, but it still turns over faster than 96 per minute, too fast to crystallise.' },
  'E35Q/NAG2FGlcF': { seen: true, stable: true, mass: null, text: 'It piles up stoichiometrically, with a half-life of 64 hours at 25 °C. That is long enough to grow a crystal.' },
};
export async function trap(app, ch, ses) {
  const { ui, sound } = app;
  ui.clearTray(); ui.tray.className = 'tray tall';
  const state = { enz: 'WT', sub: 'natural' };
  const a = el('div', 'twins'), b = el('div', 'twins three'), read = el('div', 'read'); ui.tray.append(a, b, read);
  const names = { natural: 'natural sugar', NAG2F: '+ F at C1', NAG2FGlcF: '+ F at C1 and C2' };
  const paint = () => {
    a.innerHTML = ''; b.innerHTML = '';
    for (const e of ['WT', 'E35Q']) { const t = el('button', `tog ${state.enz === e ? 'on' : ''}`, `<small>enzyme</small><b>${e === 'WT' ? 'wild type' : 'Glu35 → Gln'}</b>`); t.onclick = () => { state.enz = e; sound.tap(); paint(); }; a.append(t); }
    for (const s of Object.keys(names)) { const t = el('button', `tog ${state.sub === s ? 'on' : ''}`, `<b>${names[s]}</b>`); t.onclick = () => { state.sub = s; sound.tap(); paint(); }; b.append(t); }
  };
  paint();
  read.innerHTML = '<p>To see an intermediate, the step that makes it must outrun the step that clears it.</p>';
  ui.clearRow();
  ui.say('Pick an enzyme and a substrate. Find a pair whose intermediate lasts long enough to crystallise.');
  const res = await new Promise((resolve) => {
    ui.button('Run', () => {
      const r = TRAP[`${state.enz}/${state.sub}`];
      read.innerHTML = `<em class="tag m">measured</em><p>${r.text}</p>`;
      if (r.stable) { sound.good(3); resolve(true); } else if (r.seen) sound.good(1); else sound.bad();
    }, 'go');
    leaveButton(app, resolve);
  });
  if (res) await ui.tell([['t', 'Glu35 → Gln removes the base that activates water, so clearing falls at least 500,000-fold. Fluorine at C1 is a good leaving group and needs no acid, so making it falls only about 50-fold.']]);
  ui.clearTray();
  return !!res;
}

// ------------------------------------------------------------------ 9. Design an inhibitor
export async function inhibitor(app, ch, ses) {
  const { ui, sound } = app;
  ui.clearTray(); ui.tray.className = 'tray tall';
  const grid = el('div', 'cards'), read = el('div', 'read'), axis = el('div', 'axis'); ui.tray.append(grid, axis, read);
  const lo = -25, hi = -2, X = (k) => (Math.log10(k) - lo) / (hi - lo) * 100;
  const target = kTS(OMP.kNon2009, OMP.kcatKm);
  const mk = el('i', 'ts'); mk.style.left = `${X(target)}%`; axis.append(mk, el('b', 'tsl', 'transition state'));
  axis.lastChild.style.left = `${X(target)}%`;
  const tried = new Set();
  ui.clearRow();
  ui.say('The transition state has a building negative charge at C6, beside Lys93. Choose what to put at C6.');
  read.innerHTML = `<em class="tag c">computed by this game</em><p>From kcat/KM (1995) and the uncatalysed rate (2009), the enzyme would bind the transition state with Kd near <b>${fmtPow(target, 0)} M</b>.</p>`;
  const res = await new Promise((resolve) => {
    for (const inh of INHIBITORS) {
      const c = el('button', 'tog', `<small>${inh.group}</small><b>${inh.name}</b>`);
      c.onclick = () => {
        tried.add(inh.id); sound.tap(); c.classList.add('on');
        const dot = el('i', `pt ${inh.id === 'O' ? 'best' : ''}`); dot.style.left = `${X(inh.ki)}%`; axis.append(dot);
        read.innerHTML = `<em class="tag m">measured</em><p>${inh.name}: Ki <b>${fmtPow(inh.ki, 1)} M</b>. ${inh.why} <small>${inh.src}</small></p>`;
        if (inh.id === 'O') { sound.good(3); app.haptic(20); nx.disabled = false; ui.say(`BMP has O⁻ where the carbanion forms. Its Ki is ${tried.size === 1 ? 'the tightest here, on your first try' : 'the tightest here'}.`, null, 'good'); }
      };
      grid.append(c);
    }
    const nx = ui.button('Next', () => resolve(true), 'go'); nx.disabled = true;
  });
  const bmp = INHIBITORS.find((x) => x.id === 'O');
  await ui.tell([['c', `BMP's ${fmtPow(bmp.ki, 0)} M is far from the ${fmtPow(target, 0)} M of the true transition state. An analogue captures one feature, not the whole of it.`], ['m', 'The phosphate far from the reaction matters too: its binding alone is worth about 12 kcal/mol, and it helps close the enzyme around the ring.']]);
  ui.clearTray();
  return !!res;
}

export const STRATEGIES = { tools, triad, protons, relay, loop, pluck, dunathan, trap, inhibitor };
