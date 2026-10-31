// One playthrough of a mechanism: arrows, steps, undo, hints. Screen-free, so the tests play it too.
import { initial, makeSpec, sigmaKey, clone, route, resolveArrow, moveRaw, problems, totalElectrons, complete, hashKey, stepsFrom, firstArrows } from './engine.js';
import { tryArrow } from './judge.js';

// The target of each step is defined by the reference arrows, then any route to that species is accepted.
export function compile(mech, site, patch = {}, net = null) {
  const spec = makeSpec({ ...mech, ...patch, contacts: site.contacts, protons: site.protons, close: site.close || [] });
  const steps = [];
  let st = initial(spec);
  const { pos } = site;
  for (const raw of mech.steps) {
    if (raw.enter) enter(st, raw.enter);
    const startKey = sigmaKey(st);
    st.moves = [];
    let s = st;
    for (const a of raw.ref) {
      const m = resolveArrow(s, a);
      const r = moveRaw(s, m);
      if (r.err) throw new Error(`${mech.key} step "${raw.name}": ${r.err} on ${JSON.stringify(a)}`);
      s = r.st;
    }
    const left = problems(s);
    if (left.length) throw new Error(`${mech.key} step "${raw.name}": unstable ${JSON.stringify(left.map((p) => [spec.atoms[p.i].id, p.kind]))}`);
    const step = { ...raw, startKey, key: sigmaKey(s), endSt: clone(s) };
    if (raw.alt) {
      step.altKeys = [];
      step.altStates = [];
      for (const refs of raw.alt) {
        let t = st;
        t.moves = [];
        for (const a of refs) t = moveRaw(t, resolveArrow(t, a)).st;
        if (problems(t).length) throw new Error(`${mech.key} alt in ${raw.name}`);
        step.altKeys.push(sigmaKey(t));
        step.altStates.push(t);
      }
    }
    steps.push(step);
    st = s;
    if (raw.leave) leave(st, raw.leave);
  }
  const dist = (i, j) => {
    const p = pos[spec.atoms[i].id], q = pos[spec.atoms[j].id];
    return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) : null;
  };
  return { mech, spec, steps, dist, net };
}

function setOn(st, ids, v) { for (const id of ids) st.on[st.spec.index[id]] = v; }
const enter = (st, ids) => setOn(st, ids, 1);
const leave = (st, ids) => setOn(st, ids, 0);

export class Session {
  constructor(compiled, { start, noNet } = {}) {
    Object.assign(this, compiled);
    if (noNet) this.steps = [{ key: 'none', name: 'free', ref: [] }];
    this.st = start ? clone(start) : initial(this.spec);
    this.index = 0;          // which step
    this.live = [];          // arrows of the step in progress
    this.stack = [];         // committed states, for undo
    this.mid = [];           // states part way through this step
    this.log = [];           // accepted steps with their arrows, replayed in the last stage
    this.mistakes = 0;
    this.hints = 0;
    this.finished = false;
    this.begin();
  }

  get step() { return this.steps[this.index]; }

  begin() {
    if (this.step?.enter) enter(this.st, this.step.enter);
    this.mid = [this.st];
    this.live = [];
  }

  // m uses engine indices. Returns what happened, for the screen to show.
  arrow(m) {
    const cur = this.mid[this.mid.length - 1];
    cur.base = this.st.b;
    if (this.mid.length === 1) cur.moves = [];
    const opts = { dist: this.dist, home: sigmaKey(this.st), start: this.st };
    let res;
    // A finger on a bond cannot say which end keeps the pair. Read it the way a chemist would: the end that makes sense.
    const anyH = m.b0 !== undefined && (this.spec.atoms[m.b0].el === 'H' || this.spec.atoms[m.b1].el === 'H');
    if (m.b0 !== undefined && m.to !== undefined && m.keep === undefined && !anyH && m.to !== m.b0 && m.to !== m.b1) {
      const keys = [this.step.key, ...(this.step.altKeys || [])];
      const worth = (r) => {
        if (r.verdict === 'reject') return 0;
        if (r.verdict === 'stable') return keys.includes(sigmaKey(r.st)) ? 9 : 3;
        const hit = keys.map((k) => r.finishes.get(k)).find(Boolean);
        return hit ? 8 - hit.arrows.length / 2 : 2;
      };
      const a = tryArrow(cur, { ...m, keep: m.b0 }, opts), b = tryArrow(cur, { ...m, keep: m.b1 }, opts);
      res = worth(b) > worth(a) ? b : a;
      if (worth(a) === worth(b)) res = tryArrow(cur, m, opts);
    } else res = tryArrow(cur, m, opts);
    if (res.verdict === 'reject') { this.mistakes += 1; return res; }
    this.live.push(m);
    this.mid.push(res.st);
    if (res.verdict === 'pending') return res;
    return this.settle(res);
  }

  settle(res) {
    const key = sigmaKey(res.st), { step } = this;
    const prev = this.st;
    const same = key === sigmaKey(prev);
    const hit = key === step.key || step.altKeys?.includes(key);
    if (hit && step.needLp && res.st.lp[this.spec.index[step.needLp]] < 1) {
      this.commit(res.st);
      this.spreading = true;
      return { ...res, verdict: 'stable', same: true, spread: true, text: step.spreadText || 'Legal. Those electrons can spread further: keep pushing.' };
    }
    if (hit) return this.finishStep(res);
    if (same) { this.commit(res.st); return { ...res, same: true, text: 'Legal: the same molecule drawn another way, a resonance form.' }; }
    const back = this.stack.some((s) => sigmaKey(s.st) === key) || key === step.startKey;
    if (back) { this.rollback(); this.mistakes += 1; return { verdict: 'reject', code: 'backward', arrows: true, text: 'Legal, but that only goes backward. It undoes the step before.' }; }
    const trap = this.mech.traps?.find((t) => t.when(res.st, this.spec));
    if (trap) { this.commit(res.st); this.trapped = trap; return { ...res, trap, text: trap.text }; }
    const onward = this.net ? this.net[this.index]?.includes(hashKey(key)) : route(res.st, step.key, 2);
    const note = this.mech.notes?.find((t) => t.when(res.st, this.spec));
    if (onward) { this.commit(res.st); return { ...res, onRoute: true, note: note?.text }; }
    this.rollback();
    this.mistakes += 1;
    return { verdict: 'reject', code: 'off-route', arrows: true, st: res.st, text: note ? note.text : 'Legal by these rules, but it leads away from this step. Try another pair.' };
  }

  commit(st) {
    this.stack.push({ st: this.st, index: this.index, live: this.live, log: this.log.slice() });
    this.log.push({ step: this.index, arrows: this.live, st });
    this.st = st;
    this.mid = [st];
    this.live = [];
  }

  rollback() { this.mid = [this.st]; this.live = []; }

  // An intermediate is a species, not a drawing. Whatever resonance form the player reached, the next step starts from the usual one.
  finishStep(res) {
    const { step } = this;
    this.spreading = false;
    const key = sigmaKey(res.st);
    const canon = key === step.key ? step.endSt : step.altStates?.[step.altKeys.indexOf(key)];
    if (canon) { const c = clone(canon); c.on.set(res.st.on); res = { ...res, st: c }; }
    this.commit(res.st);
    if (step.leave) { leave(this.st, step.leave); }
    this.index += 1;
    if (this.index >= this.steps.length) { this.finished = true; return { ...res, stepDone: step, finished: true }; }
    this.begin();
    return { ...res, stepDone: step };
  }

  undo() {
    if (this.live.length) {
      this.live.pop();
      this.mid.pop();
      return true;
    }
    const top = this.stack.pop();
    if (!top) return false;
    Object.assign(this, { st: top.st, index: top.index, log: top.log, finished: false, trapped: null });
    this.mid = [this.st];
    this.live = [];
    return true;
  }

  // The next arrow the engine itself would draw from here. Used for hints and the auto-player.
  nextArrow() {
    this.hints += 1;
    return this.peekArrow();
  }

  // Only ever points at the target, or at a species on a legal route to it.
  peekArrow() {
    const cur = this.mid[this.mid.length - 1], { step } = this;
    cur.base = this.st.b;
    if (this.mid.length === 1) cur.moves = [];
    const targets = [step.key, ...(step.altKeys || [])];
    // Same species, but the electrons must spread further: look for the drawing the step asks for.
    if (step.needLp && sigmaKey(cur) === step.key) {
      const want = this.spec.index[step.needLp], goal = (s) => s.lp[want] > 0;
      if (this.live.length) { const f = complete(cur, 6, 8000, null, goal).get(step.key); return f?.arrows[0] || null; }
      const n = this.spec.n;
      // Spreading is resonance: the pair moves along a bond that already exists.
      for (const m of firstArrows(this.st).filter((a) => a.lp !== undefined && this.spec.atoms[a.lp].el === 'C' && this.st.b[a.lp * n + a.to])) {
        const r = moveRaw(this.st, m);
        if (!r.err && complete(r.st, 6, 8000, null, goal).has(step.key)) return m;
      }
      return null;
    }
    const onward = (k) => targets.includes(k) || this.net?.[this.index]?.includes(hashKey(k));
    if (this.live.length) {
      const fin = complete(cur, 6, 5000, this.st);
      for (const k of targets) if (fin.get(k)?.arrows.length) return fin.get(k).arrows[0];
      const here = sigmaKey(this.st);
      for (const [k, v] of fin) if (k !== here && v.arrows.length && onward(k)) return v.arrows[0];
      return null;
    }
    const out = stepsFrom(this.st);
    for (const k of targets) if (out.has(k)) return out.get(k).arrows[0];
    for (const [k, v] of out) if (onward(k) && !this.stack.some((x) => sigmaKey(x.st) === k)) return v.arrows[0];
    return null;
  }
}

export { totalElectrons };
