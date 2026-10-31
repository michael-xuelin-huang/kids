// Behaviour tests for the tutor (src/utils/skillModel.js, curriculum.js).
//
//   node tools/test-tutor.mjs     (or: npm run test:tutor)
import { Tutor } from '../src/utils/skillModel.js';
import { getBank, MAX_ANSWER } from '../src/utils/curriculum.js';

let failed = 0;
function check(name, ok, detail = '') {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
}
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

// Every question in every bank has a whole-number answer the recognizer can hear.
for (const op of ['mul', 'div', 'add', 'sub']) {
    const bad = getBank(op).flat().filter((q) => !Number.isInteger(q.answer) || q.answer < 1 || q.answer > MAX_ANSWER ||
        (op === 'mul' && q.a * q.b !== q.answer) || (op === 'div' && q.a / q.b !== q.answer) ||
        (op === 'add' && q.a + q.b !== q.answer) || (op === 'sub' && q.a - q.b !== q.answer));
    check(`${op}: all answers valid and in 1..${MAX_ANSWER}`, bad.length === 0, JSON.stringify(bad.slice(0, 3)));
}

// A child who knows every times-table fact is placed near the top in a few questions.
{
    Math.random = seeded(1);
    const t = new Tutor({ persist: false });
    let n = 0;
    while (!t.skills.mul.placed && n < 30) { const { q, why } = t.next(); t.record(q, true, 1.5, why); n++; }
    check('expert placed within 8 questions', n <= 8, `took ${n}`);
    check('expert placed at the top of the ladder', t.skills.mul.lo >= 40, `lo=${t.skills.mul.lo}`);
    check('expert reaches level 5', t.level === 5, `level ${t.level}`);
}

// A child who knows facts up to rung 20 (and nothing above) is placed near 20.
{
    Math.random = seeded(2);
    const t = new Tutor({ persist: false, ops: ['mul'] });
    let n = 0;
    while (!t.skills.mul.placed && n < 30) {
        const { q, why } = t.next(); const ok = q.rung < 20; t.record(q, ok, ok ? 1.8 : 9, why); n++;
    }
    const lo = t.skills.mul.lo;
    check('mid child placed within 10 questions', n <= 10, `took ${n}`);
    check('mid child edge found at rung 20 (±2)', Math.abs(lo - 20) <= 2, `lo=${lo}`);
}

// A missed fact comes back within 3 questions, and keeps coming back until learned.
{
    Math.random = seeded(3);
    const t = new Tutor({ persist: false, ops: ['mul'] });
    for (let i = 0; i < 12; i++) { const { q, why } = t.next(); t.record(q, q.rung < 25, 2, why); }
    let missed = null, cameBack = null;
    for (let i = 0; i < 40 && cameBack === null; i++) {
        const { q, why } = t.next(missed ? [] : []);
        if (missed && q.key === missed.key) cameBack = i - missed.at;
        if (!missed && q.rung >= 25) { missed = { key: q.key, at: i }; t.record(q, false, 9, why); continue; }
        t.record(q, true, 2, why);
    }
    check('missed fact repeated within 3 questions', cameBack !== null && cameBack <= 3, `came back after ${cameBack}`);
}

// Mixing: + and - unlock once multiplication is comfortable; / later; never for a struggling child.
{
    Math.random = seeded(4);
    const t = new Tutor({ persist: false });
    let unlockedAt = {};
    for (let i = 0; i < 80; i++) {
        const { q, why } = t.next(); const res = t.record(q, true, 2, why);
        for (const op of res.unlockedOps) unlockedAt[op] = i;
    }
    check('+ and - unlock for a confident child', unlockedAt.add !== undefined && unlockedAt.sub !== undefined, JSON.stringify(unlockedAt));
    check('/ unlocks after + and -', unlockedAt.div !== undefined && unlockedAt.div >= unlockedAt.add, JSON.stringify(unlockedAt));
    const ops = {}; for (let i = 0; i < 200; i++) { const { q } = t.next(); ops[q.op] = (ops[q.op] || 0) + 1; }
    check('x is still the biggest single share once mixing', ops.mul >= Math.max(ops.add, ops.sub, ops.div) &&
        ops.add > 10 && ops.sub > 10 && ops.div > 10, JSON.stringify(ops));

    Math.random = seeded(5);
    const s = new Tutor({ persist: false });
    for (let i = 0; i < 60; i++) { const { q, why } = s.next(); s.record(q, Math.random() < 0.5, 6, why); }
    check('no mixing for a child still struggling with x', s.ops.length === 1, s.ops.join(','));
}

// ?ops= forces the operation set.
{
    Math.random = seeded(6);
    const t = new Tutor({ persist: false, ops: ['add'] });
    const ops = new Set(); for (let i = 0; i < 20; i++) { const { q, why } = t.next(); ops.add(q.op); t.record(q, true, 2, why); }
    check('forced ops respected', ops.size === 1 && ops.has('add'), [...ops].join(','));
}

// Progress survives a reload.
{
    const store = {};
    globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
    Math.random = seeded(7);
    const t = new Tutor();
    for (let i = 0; i < 15; i++) { const { q, why } = t.next(); t.record(q, q.rung < 30, 2, why); }
    const t2 = new Tutor();
    check('saved state reloads', t2.hasSavedState && t2.skills.mul.lo === t.skills.mul.lo &&
        Object.keys(t2.skills.mul.items).length === Object.keys(t.skills.mul.items).length,
    `lo ${t.skills.mul.lo} vs ${t2.skills.mul.lo}`);

    // Old engine data: facts mastered there are known here.
    const stats = {};
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
        stats[`${a}x${b}`] = { attempts: Math.max(a, b) <= 5 ? 3 : 0, errors: 0, avgTime: 2, familiarity: Math.max(a, b) <= 5 ? 0.9 : 0 };
    }
    const t3 = new Tutor({ persist: false });
    t3.bootstrapFromFamiliarity(stats);
    check('old progress carried over (x1-x5 known)', t3.factStatus(4, 5) === 'known' && t3.factStatus(3, 3) === 'known' &&
        t3.factStatus(7, 8) === 'untested', `${t3.factStatus(4, 5)} ${t3.factStatus(7, 8)}`);
}

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
