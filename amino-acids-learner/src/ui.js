// Everything on top of the canvas.
import * as THREE from 'three';
import { AA, CODES, FAMILIES, PROTEINS } from './data/amino.js';
import { mastery, TOP } from './learn.js';
import { STRUCTURES } from './data/structures.js';

const $ = (id) => document.getElementById(id);
const v = new THREE.Vector3();

// Structure drawing for one amino acid, tinted with its family colour.
export function formula(code, k = 1) {
  const fam = FAMILIES[AA[code].family].color;
  return STRUCTURES.aminoAcids[code].svg
    .replace(/width="(\d+)" height="(\d+)"/, (_, w, h) => `width="${Math.round(w * k)}" height="${Math.round(h * k)}"`)
    .replace('<svg ', `<svg class="formula-svg" style="--fam:${fam}" `);
}

export class Ui {
  constructor(app) {
    this.app = app;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.tape = $('tape');
    this.labels = [];
    this.labelBox = $('labels');
  }

  screens(...ids) {
    for (const id of ['title', 'hud', 'fix', 'hold', 'done', 'lost', 'pause', 'proteins', 'guide', 'specimen']) {
      $(id).hidden = !ids.includes(id);
    }
  }

  askBottom() {
    const r = $('ask').getBoundingClientRect();
    return r.bottom;
  }

  /* ----- a round ----- */

  startRound(round) {
    this.screens('hud');
    const row = document.createElement('div');
    row.className = 'tape-row';
    row.innerHTML = [...round.seq].map((c) => `<b style="--c:${FAMILIES[AA[c].family].color}">${c}</b>`).join('');
    this.tape.replaceChildren(row);
    this.row = row;
    this.cells = [...row.children];
    // Letters stay hidden until built, so the tape can't be read as an answer key.
    this.cells.forEach((b) => { b.dataset.c = b.textContent; b.textContent = '·'; });
    this.moveTape(0);
    this.helpers(round);
    $('prompt').textContent = round.protein ? round.protein.name : 'Practice';
    $('prompt').className = 'prompt';
    $('hint').innerHTML = round.protein ? `${round.seq.length} amino acids make ${round.protein.makes}.` : 'A chain of the amino acids you know least.';
    $('hint').classList.remove('gone');
    $('clockbar').style.opacity = 0;
    this.run = 0;
    $('recall').hidden = true;
    $('codon').hidden = true;
    this.clearLabels();
  }

  moveTape(i) {
    this.row.style.transform = `translateX(${-(i + 0.5) * 22}px)`;
    this.cells.forEach((b, k) => b.classList.toggle('here', k === i));
  }

  helpers(round) {
    const box = $('helpers');
    if (box.children.length !== round.maxHelpers) box.innerHTML = '<i></i>'.repeat(round.maxHelpers);
    [...box.children].forEach((el, i) => el.classList.toggle('gone', i >= round.helpers));
    box.setAttribute('aria-label', `${round.helpers} chaperones left`);
  }

  showQuestion(q, round, index) {
    const info = AA[q.code];
    const prompt = $('prompt');
    prompt.className = 'prompt' + (q.kind === 'clue' ? ' small' : q.kind === 'one' ? ' huge' : '');
    prompt.innerHTML = q.prompt;
    const hint = $('hint');
    hint.classList.remove('gone');
    if (q.recall) hint.textContent = this.coarse ? 'Tap its name.' : 'Tap its name, or type its one-letter code.';
    else if (round.asked === 1 && round.gentle) {
      hint.textContent = this.coarse ? 'Tap the one the ribosome asks for.' : 'Click the one the ribosome asks for, or press its number.';
    } else if (q.kind === 'label') hint.innerHTML = info.note;
    else if (this.run >= 3) hint.textContent = `${this.run} in a row`;
    else hint.classList.add('gone');
    this.moveTape(index);
    this.clock(1);
    $('clockbar').style.opacity = round.limit ? 1 : 0;
    this.clearLabels();
    const codon = $('codon');
    codon.textContent = round.codons[index];
    codon.hidden = false;
    this.place(codon, this.app.stage.siteWorld(0).setY(this.app.stage.L.riboY - 1.05));
    const recall = $('recall');
    recall.hidden = !q.recall;
    if (q.recall) {
      recall.innerHTML = q.options.map((c, i) => `<button data-code="${c}">${AA[c].name}</button>`).join('');
    } else if (q.labelled) {
      this.labels = q.options.map((c) => {
        const el = document.createElement('div');
        el.className = 'label';
        el.textContent = AA[c].name;
        this.labelBox.append(el);
        return el;
      });
    }
  }

  streak(n) { this.run = n; }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 1600);
  }

  clock(left) {
    const el = $('clock');
    el.style.transform = `scaleX(${Math.max(0, left)})`;
    el.classList.toggle('low', left < 0.28);
  }

  answered() {
    $('recall').hidden = true;
    this.clearLabels();
  }

  clearLabels() {
    this.labels.forEach((el) => el.remove());
    this.labels = [];
  }

  clearQuestion() {
    $('prompt').textContent = '';
    $('hint').textContent = '';
    $('clockbar').style.opacity = 0;
    $('recall').hidden = true;
    $('codon').hidden = true;
    this.clearLabels();
  }

  place(el, world) {
    v.copy(world).project(this.app.painter.camera);
    const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(calc(${x.toFixed(1)}px - 50%), calc(${y.toFixed(1)}px - 50%))`;
  }

  followLabels(round) {
    if (!this.labels.length) return;
    round.options.forEach((o, i) => {
      if (this.labels[i] && o.state !== 'gone') {
        this.place(this.labels[i], v.copy(o.group.position).setY(o.group.position.y - o.slot.r * 0.86));
      }
    });
  }

  stamp(round, i) {
    const b = this.cells[i];
    b.textContent = b.dataset.c;
    b.classList.add('done', 'pop');
    this.moveTape(i + 1);
  }

  showFix(want, picked, last) {
    const a = AA[want];
    const box = $('fix-compare');
    box.className = 'compare' + (picked ? '' : ' one');
    const fig = (code, cls, cap) => `<figure class="${cls}">${formula(code, picked ? 0.62 : 0.72)}<figcaption>${AA[code].name}<small>${AA[code].three}, ${AA[code].code}${cap ? `, ${cap}` : ''}</small></figcaption></figure>`;
    box.innerHTML = (picked ? fig(picked, 'pick', 'your pick') : '') + fig(want, 'right', picked ? 'the answer' : '');
    $('fix-title').textContent = picked ? 'Not that one' : 'Out of time';
    $('fix-note').innerHTML = a.note;
    $('fix-go').textContent = last ? 'Continue' : 'Try again';
    $('fix').hidden = false;
    $('hint').classList.add('gone');
    $('recall').hidden = true;
    this.clearLabels();
    if (!this.coarse) $('fix-go').focus({ preventScroll: true });
  }

  hideFix() { $('fix').hidden = true; }

  showLost() { $('lost').hidden = false; $('fix').hidden = true; $('hud').hidden = true; }

  showStop(codon) {
    const prompt = $('prompt');
    prompt.className = 'prompt';
    prompt.textContent = 'Stop';
    $('hint').classList.remove('gone');
    $('hint').textContent = `Codon ${codon} has no tRNA, so the ribosome lets go.`;
    $('clockbar').style.opacity = 0;
    $('codon').hidden = true;
    $('recall').hidden = true;
    this.clearLabels();
  }

  showHold(on) {
    $('hold').hidden = !on;
    $('hold-text').textContent = 'Press and hold to fold';
    if (on) this.holdRing(0);
  }

  holdRing(f) { $('hold-ring').style.strokeDashoffset = 1 - f; }

  showDone({ protein, fidelity, rate, verdict }) {
    const { app } = this;
    $('hud').hidden = true;
    $('done').hidden = false;
    $('done-kicker').textContent = verdict.name;
    $('done-title').innerHTML = protein ? `${protein.name} <small>PDB ${protein.pdb}</small>` : 'Practice chain';
    $('done-about').textContent = protein ? protein.about : verdict.note;
    $('done-stats').textContent = `${Math.round(fidelity * 100)}% right the first time, at ${rate.toFixed(1)} amino acids a second.`;
    const met = CODES.filter((c) => app.learner.aa[c].right > 0).length;
    $('done-aside').textContent = `You have met ${met} of the 20 amino acids. A bacterial ribosome adds 15 to 20 a second, and gets about one in every few thousand wrong.`;
    const next = app.afterRound(protein);
    $('done-next').textContent = next.label;
    $('done-next').onclick = next.go;
  }

  /* ----- pages ----- */

  fillProteins(selected, onPick) {
    const { app } = this;
    const list = $('protein-list');
    list.innerHTML = PROTEINS.map((p, i) => {
      const best = app.progress.best[p.id];
      return `<li><button data-id="${p.id}" aria-current="${p.id === selected}">
        <span class="num">${i + 1}</span><span class="name">${p.name}</span>
        <span class="len">${app.proteinSeq(p.id).length} residues</span>
        <span class="what">${best ? `<span class="best">${best.verdict}</span>, ${Math.round(best.fidelity * 100)}% correct` : p.makes}</span>
      </button></li>`;
    }).join('');
    list.onclick = (e) => {
      const b = e.target.closest('button');
      if (b) onPick(b.dataset.id);
    };
  }

  fillGuide(onPick) {
    const { app } = this;
    const groups = {};
    for (const c of CODES) (groups[AA[c].family] ||= []).push(c);
    $('guide-groups').innerHTML = Object.entries(groups).map(([fam, codes]) => {
      const F = FAMILIES[fam];
      return `<section class="family" style="--fam:${F.color};--wash:${F.wash}"><h3>${F.name}</h3><p>${F.about}</p><div class="specimens">${codes.map((c) => `
        <button class="spec" data-code="${c}" style="--m:${mastery(app.learner, c).toFixed(2)}">${formula(c, 1)}<span class="nm">${AA[c].name}</span><span class="cd">${AA[c].three}, ${AA[c].code}</span></button>`).join('')}</div></section>`;
    }).join('');
    const painted = CODES.filter((c) => app.learner.aa[c].m >= TOP).length;
    $('guide-count').textContent = `${painted} of 20 fully painted`;
    $('guide-groups').onclick = (e) => {
      const b = e.target.closest('.spec');
      if (b) onPick(b.dataset.code);
    };
  }

  fillSpecimen(code) {
    const a = AA[code];
    const F = FAMILIES[a.family];
    $('specimen-name').textContent = a.name;
    $('specimen-codes').textContent = `${a.three}, ${a.code}. ${F.name}.`;
    $('specimen-formula').innerHTML = formula(code, 0.8);
    $('specimen-note').innerHTML = a.note;
    $('specimen-letter').textContent = a.letter;
    $('specimen-codons').textContent = `Codons: ${a.codons.join(', ')}`;
  }
}
