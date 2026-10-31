// The third stage: predict the experiment, then see the measured value.
import { el, logDial, fmtPow, plot } from './ui.js';
import { nearLog } from '../logic/score.js';
import { formulaMass, kTS, proficiency, rateEnhancement } from '../logic/rates.js';
import { OMP } from '../chapters.js';

const unitFmt = { years: (v) => `${fmtPow(v)} years`, fold: (v) => `${fmtPow(v)}-fold`, ratio: (v) => `${v.toFixed(1)} to 1` };

async function dialItem(app, it) {
  const { ui, sound } = app;
  ui.clearTray(); ui.tray.className = 'tray tall'; ui.clearRow();
  ui.say(it.ask);
  const d = logDial(ui.tray, { min: it.min, max: it.max, value: it.start, fmt: unitFmt[it.unit], onChange: () => sound.tap() });
  await new Promise((res) => ui.button('Predict', res, 'go'));
  ui.clearRow();
  const right = nearLog(d.value, it.truth, it.tol);
  d.reveal(it.truth, 'measured');
  if (right) { sound.good(3); app.haptic(16); } else sound.bad();
  ui.say(right ? 'Close to the measured value.' : 'Far from the measured value. Here is what was found.', null, right ? 'good' : 'bad');
  await new Promise((r) => setTimeout(r, 700));
  await ui.tell(it.reveal);
  ui.clearTray();
  return right;
}

async function choiceItem(app, it) {
  const { ui, sound } = app;
  ui.clearTray(); ui.tray.className = 'tray tall choices'; ui.clearRow();
  ui.say(it.ask);
  const pick = await new Promise((res) => {
    it.options.forEach((o, i) => { const b = el('button', 'opt', o); b.onclick = () => res(i); ui.tray.append(b); });
  });
  const right = pick === it.correct;
  [...ui.tray.children].forEach((b, i) => { b.disabled = true; if (i === it.correct) b.classList.add('right'); else if (i === pick) b.classList.add('wrong'); });
  if (right) { sound.good(3); app.haptic(16); } else sound.bad();
  await ui.tell(it.reveal);
  ui.clearTray();
  return right;
}

async function massItem(app, it) {
  const { ui, sound } = app;
  ui.clearTray(); ui.tray.className = 'tray tall'; ui.clearRow();
  const add = formulaMass(it.computedAdd) - formulaMass(it.lost);
  ui.say(it.ask);
  const read = el('div', 'read', `<em class="tag c">computed by this game</em><p>The sugar group is C₁₄H₂₃FNO₉, mass 368.3, and Asp52 loses one hydrogen to bond it, so the gain is <b>${add.toFixed(1)}</b>. You may do the sum.</p>`);
  ui.tray.append(read);
  const d = logDial(ui.tray, { min: 14200, max: 15000, value: 14400, log: false, ticks: false, fmt: (v) => `peak at ${v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, onChange: () => sound.tap() });
  await new Promise((res) => ui.button('Predict', res, 'go'));
  ui.clearRow();
  const right = Math.abs(d.value - it.truth) <= it.tol;
  d.reveal(it.truth, 'measured');
  if (right) { sound.good(3); app.haptic(16); } else sound.bad();
  await ui.tell(it.reveal);
  ui.clearTray();
  return right;
}

async function tsItem(app, it) {
  const { ui } = app;
  ui.clearTray(); ui.tray.className = 'tray tall'; ui.clearRow();
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const old = OMP.kNon1995, now = OMP.kNon2009;
  const t = el('div', 'read', `<em class="tag c">computed by this game</em><table class="tbl">${row('uncatalysed rate, 1995', `${fmtPow(old)} s⁻¹`)}${row('uncatalysed rate, 2009', `${fmtPow(now)} s⁻¹`)}${row('rate enhancement, 1995', fmtPow(rateEnhancement(OMP.kcat, old), 0))}${row('rate enhancement, 2009 rate', fmtPow(rateEnhancement(OMP.kcat, now), 0))}${row('proficiency, 1995', `${fmtPow(proficiency(old, OMP.kcatKm), 0)} M⁻¹`)}${row('proficiency, 2009 rate', `${fmtPow(proficiency(now, OMP.kcatKm), 0)} M⁻¹`)}${row('transition-state Kd, 2009 rate', `${fmtPow(kTS(now, OMP.kcatKm), 0)} M`)}</table>`);
  ui.tray.append(t);
  await ui.tell(it.say);
  ui.clearTray();
  return true;
}

export async function runEvidence(app, ch) {
  let predicted = false;
  for (const it of ch.evidence) {
    let r = false;
    app.evItem = it;
    if (it.type === 'dial') r = await dialItem(app, it);
    else if (it.type === 'choice') r = await choiceItem(app, it);
    else if (it.type === 'mass') r = await massItem(app, it);
    else if (it.type === 'ts') r = await tsItem(app, it);
    else if (it.type === 'note') { app.ui.clearTray(); await app.ui.tell(it.say); r = true; }
    if (it.key) predicted = r;
  }
  return predicted;
}
