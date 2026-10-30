// Boot, the main loop, and moving between the cover, the contents and the stages.
import * as THREE from '../vendor/three/three.module.js';
import { Press, Rig, PAPER } from './press.js';
import { Atoms } from './ribbon.js';
import { protein, TONE } from './proteins.js';
import { Sound, buzz } from './sound.js';
import { $, button, Overlay } from './ui.js';
import { CHAPTERS, allStages, nextStage } from './stages.js';
import rama from './data/rama.json';
import { startChain } from './chapters/chain.js';
import { startBeat } from './chapters/beat.js';
import { startCore } from './chapters/core.js';
import { startShell } from './chapters/shell.js';

const canvas = document.getElementById('c');
const root = document.getElementById('ui');
if (!document.createElement('canvas').getContext('webgl2')) {
  const note = document.createElement('p');
  note.className = 'nogl';
  note.textContent = 'This game needs WebGL 2. Open it in a current version of Safari, Chrome, Edge or Firefox.';
  root.append(note);
  throw new Error('WebGL 2 is not available');
}
const press = new Press(canvas);
const rig = new Rig(press, canvas);
const overlay = new Overlay(press);
const sound = new Sound();
const params = new URLSearchParams(location.search);

const SAVE_KEY = 'protein-structure-learner-v1';
const save = (() => {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {};
  } catch {}
  s.stamps ??= {};
  if (s.map) s.mapVisited = Uint8Array.from(atob(s.map), (c) => c.charCodeAt(0));
  s.write = () => {
    try {
      const { stamps, muted, map } = s;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ stamps, muted, map }));
    } catch {}
  };
  s.persistMap = (v) => {
    s.mapVisited = v.slice();
    s.map = btoa(String.fromCharCode(...v));
    s.write();
  };
  return s;
})();
sound.muted = !!save.muted;

let current = null;
let screen = null;

const safe = (name) => {
  const probe = $('div');
  probe.style.cssText = `position:fixed;left:0;top:0;width:0;height:env(${name},0px);visibility:hidden`;
  document.body.append(probe);
  const v = probe.getBoundingClientRect().height;
  probe.remove();
  return v;
};
const ctx = {
  press, rig, overlay, sound, save,
  layer: root,
  safeTop: () => safe('safe-area-inset-top'),
  safeBottom: () => safe('safe-area-inset-bottom'),
  safeRight: () => safe('safe-area-inset-right'),
  onLayout: null,
};
press.onResize = () => {
  ctx.onLayout?.();
  screen?.onResize?.();
};

// On touch screens only the end of a tap counts as permission to play sound.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  document.addEventListener(type, () => sound.unlock(), { capture: true });
}

// The sheet changes under a field of growing dots.
let wiping = false;
function turnPage(change) {
  if (wiping) return;
  if (press.reduced) {
    change();
    return;
  }
  wiping = true;
  sound.page();
  const u = press.uniforms.uWipe;
  const start = performance.now();
  let swapped = false;
  const step = (t) => {
    const e = (t - start) / 620;
    if (e < 0.5) u.value = (e * 2) ** 1.4;
    else {
      if (!swapped) {
        swapped = true;
        u.value = 1;
        change();
      }
      u.value = Math.max(0, 1 - ((e - 0.5) * 2) ** 1.4);
    }
    if (e < 1) requestAnimationFrame(step);
    else {
      u.value = 0;
      wiping = false;
    }
  };
  requestAnimationFrame(step);
}

const clearStage = () => {
  ctx.cancelFinish?.();
  current?.dispose?.();
  current = null;
  ctx.onLayout = null;
  root.replaceChildren();
  document.body.classList.remove('night');
  overlay.begin();
  rig.enabled = true;
  rig.manual = false;
  press.uniforms.uGlow.value.set(0, 0, 0);
  press.uniforms.uShadow.value = 0.22;
};

// Hemoglobin in space-filling form: four chains, four inks.
function coverArt() {
  const p = protein('hemoglobin');
  const a = new Atoms(p.atomEl.length + p.hetEl.length);
  const tones = [[1, 0, 0], [0, 1, 0], [0.34, 1, 0], [0, 0, 0.3]];
  for (let i = 0; i < p.atomEl.length; i++) {
    const res = p.atomRes[i];
    a.set(i, p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2], 1.75, tones[p.chain[res]], 1 + p.chain[res] * 50 + (res % 40));
  }
  for (let i = 0; i < p.hetEl.length; i++) {
    a.set(p.atomEl.length + i, p.hetXYZ[i * 3], p.hetXYZ[i * 3 + 1], p.hetXYZ[i * 3 + 2], 1.75, [1, 1, 0], 250);
  }
  a.commit(p.atomEl.length + p.hetEl.length);
  return a;
}

function showCover() {
  clearStage();
  press.setPaper(PAPER.white);
  press.setFlood([0, 0, 1]);
  press.clearDisc();
  press.uniforms.uShadow.value = 0;
  const art = coverArt();
  press.scene.add(art.mesh);
  rig.target.set(0, 0, 0);
  rig.targetGoal.set(0, 0, 0);
  rig.yaw = 1.2;
  rig.pitch = 0.18;
  rig.spin = 0.12;

  const place = () => {
    const landscape = press.cssW > press.cssH * 1.15;
    press.setFocus(landscape ? 0.72 : 0.56, landscape ? 0.55 : 0.63, true);
    const span = landscape ? press.cssH * 0.96 : press.cssW * 1.08;
    rig.distTarget = rig.dist = ((38 / Math.tan((press.camera.fov * Math.PI) / 360)) * press.cssH) / span;
  };
  place();

  const el = $('div', 'cover');
  const head = $('div');
  const h = $('h1');
  h.innerHTML = 'Protein<br>Structure<br>Learner';
  head.append(h, $('p', '', 'From two hinges to a virus.'));
  const foot = $('div', 'foot');
  const anyStamps = Object.keys(save.stamps).length > 0;
  foot.append(button('btn', anyStamps ? 'Open the book' : 'Start', () => turnPage(showContents)));
  el.append(head, foot);
  root.append(el);
  ctx.onLayout = place;
  current = {
    update() {},
    dispose() {
      press.scene.remove(art.mesh);
      art.dispose();
      rig.spin = 0;
    },
  };
}

// The real map, small.
function mapGlyph() {
  const c = $('canvas', 'glyph');
  const n = rama.cells;
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const land = rama.A[(n - 1 - y) * n + x] !== '0';
      img.data.set(land ? [255, 210, 31, 255] : [31, 42, 166, 255], (y * n + x) * 4);
    }
  g.putImageData(img, 0, 0);
  return c;
}

const glyphs = {
  beat: '<svg class="glyph" viewBox="0 0 74 74" fill="#ffd21f"><circle cx="9" cy="37" r="7"/><circle cx="29" cy="37" r="7"/><circle cx="45" cy="37" r="7"/><circle cx="65" cy="37" r="7"/><path d="M0 52h74v3H0z"/><path d="M0 19h74v3H0z"/></svg>',
  core: '<svg class="glyph" viewBox="0 0 74 74"><circle cx="37" cy="37" r="35" fill="#1f2aa6"/><g fill="#ffd21f"><circle cx="37" cy="13" r="7"/><circle cx="55" cy="19" r="7"/><circle cx="19" cy="19" r="7"/></g><g fill="#ff4a9e"><circle cx="63" cy="42" r="6"/><circle cx="11" cy="42" r="6"/><circle cx="47" cy="61" r="6"/><circle cx="27" cy="61" r="6"/></g></svg>',
  shell: '<svg class="glyph" viewBox="0 0 74 74" fill="none" stroke="#1f2aa6" stroke-width="3.2" stroke-linejoin="round"><path d="M37 3 66 20v34L37 71 8 54V20z" fill="#ff4a9e"/><path d="M37 3 20 30l17 18 17-18zM8 20l12 10-12 24M66 20 54 30l12 24M20 30h34M37 48v23M8 54l29-6 29 6"/></svg>',
};

function stampRow(id) {
  const earned = save.stamps[id] ?? [];
  const s = $('span', 'stamps');
  s.setAttribute('aria-label', `${earned.filter(Boolean).length} of 3 stamps`);
  for (let i = 0; i < 3; i++) s.append($('i', earned[i] ? 'on' : ''));
  return s;
}

function showContents() {
  clearStage();
  press.setPaper(PAPER.white);
  press.setFlood([0, 0, 1]);
  const page = $('div', 'contents');
  const mast = $('div', 'masthead');
  const total = allStages.length * 3;
  const earned = allStages.flatMap((st) => save.stamps[st.id] ?? []).filter(Boolean).length;
  mast.append($('span', '', `${earned} of ${total} stamps`));
  const mute = soundButton();
  mast.append(mute);
  page.append(mast);
  for (const ch of CHAPTERS) {
    const band = $('section', `band ${ch.id}`);
    const head = $('div', 'head');
    head.append($('h2', '', ch.title));
    if (ch.id === 'chain') head.append(mapGlyph());
    else {
      const art = $('div');
      art.innerHTML = glyphs[ch.id];
      head.append(art.firstChild);
    }
    band.append(head, $('p', 'level', ch.level), $('p', 'line', ch.line));
    const list = $('ol');
    ch.stages.forEach((st, i) => {
      const li = $('li');
      const b = $('button');
      b.type = 'button';
      b.append($('span', 'n', i + 1), $('span', 'name', st.title), stampRow(st.id));
      b.addEventListener('click', () => turnPage(() => startStage(st.id)));
      li.append(b);
      list.append(li);
    });
    band.append(list);
    page.append(band);
  }
  root.append(page);
  current = { update() {} };
}

const SPEAKER_ON = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 7h4l5-4v14l-5-4H2z"/><path d="M13.5 6.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 7h4l5-4v14l-5-4H2z"/><path d="m14 8 4 4m0-4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function soundButton() {
  const b = $('button', 'iconbtn');
  b.type = 'button';
  const paint = () => {
    b.innerHTML = sound.muted ? SPEAKER_OFF : SPEAKER_ON;
    b.setAttribute('aria-label', sound.muted ? 'Turn sound on' : 'Turn sound off');
  };
  paint();
  b.addEventListener('click', () => {
    sound.unlock();
    sound.setMuted(!sound.muted);
    save.muted = sound.muted;
    save.write();
    paint();
  });
  return b;
}

function makeHud(stage) {
  const hud = $('div', 'hud');
  const bar = $('div', 'bar');
  const back = button('iconbtn', '', () => turnPage(showContents));
  back.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.5 6 10l6.5 6.5"/></svg>';
  back.setAttribute('aria-label', 'Back to contents');
  const title = $('div', 'title', stage.title);
  const marks = $('span', 'stamps');
  const earned = [false, false, false];
  const dots = [0, 1, 2].map(() => {
    const i = $('i');
    marks.append(i);
    return i;
  });
  bar.append(back, title, marks, soundButton());
  const goal = $('p', 'goal');
  goal.setAttribute('aria-live', 'polite');
  hud.append(bar, goal);
  root.append(hud);
  let finish = null;
  return {
    el: hud,
    earned,
    setGoal: (t) => (goal.textContent = t),
    earn(i) {
      earned[i] = true;
      dots[i].classList.add('on');
      sound.stamp();
      buzz(30);
    },
    offerFinish() {
      if (finish) return;
      finish = button('btn pink finish', 'Finish', () => ctx.finishNow());
      hud.append(finish);
    },
  };
}

function startStage(id) {
  clearStage();
  const stage = allStages.find((s) => s.id === id);
  const hud = makeHud(stage);
  ctx.hud = hud;
  let ended = false;
  let pendingLine = '';
  let finishTimer = 0;
  ctx.earn = (i) => hud.earn(i);
  ctx.finishNow = () => {
    if (ended) return;
    ended = true;
    clearTimeout(finishTimer);
    const old = save.stamps[id] ?? [];
    save.stamps[id] = [0, 1, 2].map((i) => !!(old[i] || hud.earned[i]));
    save.write();
    showResult(stage, hud.earned, pendingLine);
  };
  ctx.finishSoon = (line = '', delay = 1500) => {
    pendingLine = line;
    clearTimeout(finishTimer);
    finishTimer = setTimeout(ctx.finishNow, delay);
  };
  ctx.cancelFinish = () => {
    ended = true;
    clearTimeout(finishTimer);
  };
  const start = { chain: startChain, beat: startBeat, core: startCore, shell: startShell }[stage.chapter];
  current = start(ctx, stage);
}

function showResult(stage, earned, line) {
  sound.chord([5, 7, 9, 12], 0.13);
  rig.enabled = true;
  const sheet = $('div', 'sheet');
  sheet.append($('h2', '', stage.title));
  const row = $('ul', 'big');
  const marks = stage.goals.map((goal) => {
    const li = $('li');
    const m = $('span', 'stampmark', '✓');
    li.append(m, $('span', '', goal));
    row.append(li);
    return m;
  });
  sheet.append(row);
  if (line) sheet.append($('p', 'lead', line));
  if (ctx.resultExtra) sheet.append(ctx.resultExtra);
  ctx.resultExtra = null;
  sheet.append($('p', '', stage.note), $('p', 'ref', stage.ref));
  const acts = $('div', 'acts');
  const next = nextStage(stage.id);
  acts.append(button('btn', next ? 'Next' : 'Back to the book', () => turnPage(() => (next ? startStage(next.id) : showContents()))));
  acts.append(button('btn quiet', 'Play again', () => turnPage(() => startStage(stage.id))));
  sheet.append(acts);
  root.append(sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('in')));
  marks.forEach((m, i) => {
    if (earned[i])
      setTimeout(() => {
        m.classList.add('on');
        sound.stamp();
        buzz(25);
      }, 420 + i * 260);
  });
}

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  overlay.begin();
  current?.update?.(dt);
  rig.update(dt);
  press.render(dt);
  requestAnimationFrame(frame);
}

Promise.allSettled([document.fonts.load('20px Dela'), document.fonts.load('600 20px Bricolage')]).then(() => {
  if (params.has('stage')) startStage(params.get('stage'));
  else if (params.has('contents')) showContents();
  else showCover();
  requestAnimationFrame(frame);
});

if (params.has('debug')) window.psl = { ctx, startStage, showContents, showCover, get current() { return current; } };
