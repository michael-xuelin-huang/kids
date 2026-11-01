// Generates a sample progress report from a simulated child, to check what the
// report says and how it reads.   node tools/sample-report.mjs [knowsUpTo] [questions]
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const bus = new EventTarget();
globalThis.addEventListener = bus.addEventListener.bind(bus); globalThis.dispatchEvent = bus.dispatchEvent.bind(bus);
let now = Date.UTC(2026, 9, 1, 23, 0); Date.now = () => now;
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const rnd = Math.random;

const { Tutor } = await import('../src/utils/skillModel.js');
const { ZooProgress } = await import('../src/components/zoo.js');
const P = await import('../src/utils/players.js');
const { buildReport, reportMarkdown } = await import('../src/utils/report.js');

const K = +(process.argv[2] || 6), N = +(process.argv[3] || 420);
const p = P.addPlayer('Sample child');
const keys = P.keysFor(p.id);
const tutor = new Tutor({ storageKey: keys.tutor }), zoo = new ZooProgress({ storageKey: keys.zoo });
const holes = new Set(K >= 9 ? [] : ['6x7', '4x8', '3x8']);
const knowsMul = (a, b) => (Math.max(a, b) <= K && !holes.has(`${Math.min(a, b)}x${Math.max(a, b)}`)) || Math.min(a, b) === 1;
const learnt = new Map();
for (let i = 0; i < N; i++) {
    if (i && i % 35 === 0) now += 22 * 3600 * 1000; else now += 9000;    // a session ~ every 35 questions
    const { q, why } = tutor.next();
    let knows;
    if (q.op === 'mul' || q.op === 'div') knows = knowsMul(q.op === 'mul' ? q.a : q.b, q.op === 'mul' ? q.b : q.answer);
    else knows = K >= 9 || q.answer <= 20 || rnd() < 0.8;
    const k = `${q.op}${q.a},${q.b}`; const exp = learnt.get(k) || 0;
    const ok = rnd() < (knows ? 0.95 : 0.15 + 0.2 * exp);
    learnt.set(k, exp + 1);
    let heard = null;
    if (!ok && rnd() < 0.8) {
        if (q.op === 'mul') heard = rnd() < 0.6 ? q.a * (q.b + (rnd() < 0.5 ? 1 : -1)) : q.answer + 1;
        else if (q.op === 'sub') heard = (Math.floor(q.a / 10) - Math.floor(q.b / 10)) * 10 + Math.abs((q.a % 10) - (q.b % 10));
        else if (q.op === 'add') heard = q.answer - 10;
        else heard = q.b;
        if (heard < 1 || heard > 81 || heard === q.answer) heard = null;
    }
    const ms = ok ? (knows ? 1800 + rnd() * 1500 : 3500 + rnd() * 3000) : 9000;
    tutor.record(q, ok, ms / 1000, why);
    P.appendAttempt(p.id, { op: q.op, a: q.a, b: q.b, answer: q.answer, correct: ok, ms, why, heard });
    if (ok) zoo.add(why === 'review' || why === 'place' ? 1 : 2);
}
console.log(reportMarkdown(buildReport({ player: P.getPlayer(p.id), tutor, zoo, history: P.readHistory(p.id) })));
