// Compare the old question selection (grid levels + PID) with the new skill
// model (staircase placement + spaced repetition) on simulated children.
//
//   node tools/simulate-learning.mjs
//
// A simulated child knows each multiplication fact family to some degree
// (0..1), answers known facts quickly and mostly right, and LEARNS from every
// attempt. Metrics per session:
//   wasted   questions on facts the child already knew solidly
//   firstGap question number of the first question on a fact they did NOT know
//   learned  fact families that went from unknown to known during the session
//   gapsHit  of the child's "holes" (unknown facts among known ones), how many
//            were practised at least twice
// The children are synthetic: use this to compare designs, not to predict kids.
import { AdaptiveEngine } from '../src/utils/adaptiveEngine.js';
import { DifficultyController } from '../src/utils/difficultyController.js';
import { Tutor } from '../src/utils/skillModel.js';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fam = (a, b) => `${Math.min(a, b)}x${Math.max(a, b)}`;

function makeChild({ K, holes = 0, slip = 0.04, speed = 1, learn = 0.25 }, rnd) {
    const k = {}; const holeSet = new Set();
    for (let a = 1; a <= 9; a++) for (let b = a; b <= 9; b++) {
        let known = Math.max(a, b) <= K || a === 1;
        if (known && a > 1 && rnd() < holes) { known = false; holeSet.add(fam(a, b)); }
        k[fam(a, b)] = known ? 1 : 0;
    }
    return {
        k, holeSet,
        answer(a, b) {
            const f = fam(a, b), kv = k[f];
            const p = kv >= 0.9 ? 1 - slip : 0.1 + 0.7 * kv;
            const correct = rnd() < p;
            const base = kv >= 0.9 ? 2.0 * speed : (3 + (1 - kv) * 4) * speed;
            const time = base * (0.75 + 0.5 * rnd());
            k[f] = Math.min(1, kv + learn * (correct ? 1 : 0.8) * (0.6 + 0.8 * rnd()));
            return { correct: correct && time < 12, time };
        },
    };
}

function session(policy, spec, seed, N) {
    const rnd = mulberry32(seed); const realR = Math.random; Math.random = mulberry32(seed + 99);
    try {
        const child = makeChild(spec, rnd);
        const start = { ...child.k };
        const pol = policy();
        let wasted = 0, firstGap = N + 1; const holeReps = {};
        for (let i = 1; i <= N; i++) {
            const { a, b, done } = pol.next();
            const f = fam(a, b);
            if (child.k[f] >= 0.9) wasted++; else if (firstGap > N) firstGap = i;
            if (child.holeSet.has(f)) holeReps[f] = (holeReps[f] || 0) + 1;
            const r = child.answer(a, b);
            done(r.correct, r.time);
        }
        const est = pol.estimate ? pol.estimate() : null;
        let learned = 0;
        for (const f in start) if (start[f] < 0.9 && child.k[f] >= 0.9) learned++;
        const gapsHit = child.holeSet.size ? Object.values(holeReps).filter((n) => n >= 2).length / child.holeSet.size : null;
        let truth = 0; for (const f in child.k) if (child.k[f] >= 0.9) truth++;
        return { wasted, firstGap, learned, gapsHit, estErr: est === null ? null : Math.abs(est - truth / 45) };
    } finally { Math.random = realR; }
}

function oldPolicy() {
    const eng = new AdaptiveEngine({ persist: false });
    const ctl = new DifficultyController({ persist: false });
    let recent = [];
    return {
        next() {
            const g = ctl.gridSize; const q = eng.getNextQuestion(g, recent);
            recent.push(`${q.a}x${q.b}`); if (recent.length > 4) recent.shift();
            const cold = eng.isUnseen(q.a, q.b);
            return {
                a: q.a, b: q.b, done(ok, t) {
                    eng.recordAttempt(q.a, q.b, ok, t);
                    ctl.update(ok, t, { cold, masteryPct: eng.getMasteryPercentage(g), coldLeft: eng.countUnseen(g) });
                },
            };
        },
    };
}

function newPolicy() {
    const tutor = new Tutor({ persist: false, ops: ['mul'] });
    let recent = [];
    return {
        next() {
            const { q, why } = tutor.next(recent);
            recent.push(q.key); if (recent.length > 2) recent.shift();
            return { a: q.a, b: q.b, done(ok, t) { tutor.record(q, ok, t, why); } };
        },
        estimate: () => tutor.skills.mul.progress(),
    };
}

export const CHILDREN = {
    'beginner (knows x1-x3)': { K: 3, speed: 1.2 },
    'knows to x5': { K: 5 },
    'knows to x7': { K: 7 },
    'knows all, fast': { K: 9, speed: 0.8 },
    'knows all, slow talker': { K: 9, speed: 1.7 },
    'knows to x7, 20% holes': { K: 7, holes: 0.2 },
    'knows to x6, careless (10%)': { K: 6, slip: 0.1 },
};

export function evaluate(policy, N, seeds = 60) {
    const out = {};
    for (const [name, spec] of Object.entries(CHILDREN)) {
        const acc = { wasted: 0, firstGap: 0, learned: 0, gapsHit: 0, estErr: 0 }; let gh = 0, ee = 0;
        for (let s = 1; s <= seeds; s++) {
            const m = session(policy, spec, s * 7919, N);
            acc.wasted += m.wasted; acc.firstGap += m.firstGap; acc.learned += m.learned;
            if (m.gapsHit !== null) { acc.gapsHit += m.gapsHit; gh++; }
            if (m.estErr !== null) { acc.estErr += m.estErr; ee++; }
        }
        out[name] = {
            wasted: +(acc.wasted / seeds).toFixed(1),
            firstGap: +(acc.firstGap / seeds).toFixed(1),
            learned: +(acc.learned / seeds).toFixed(1),
            gapsHit: gh ? `${Math.round(100 * acc.gapsHit / gh)}%` : '-',
            ...(ee ? { 'level error': `${Math.round(100 * acc.estErr / ee)}%` } : {}),
        };
    }
    return out;
}

if (process.argv[1] && process.argv[1].endsWith('simulate-learning.mjs')) {
    for (const N of [40, 120]) {
        console.log(`\n=== ${N} questions per session (60 simulated children each) ===`);
        console.log('OLD (grid levels + PID)'); console.table(evaluate(oldPolicy, N));
        console.log('NEW (staircase placement + spaced repetition)'); console.table(evaluate(newPolicy, N));
    }
}
