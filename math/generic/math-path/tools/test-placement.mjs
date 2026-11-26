// Quick-check placement with simulated children who know the map up to different points.
// Checks: question count, how many skills end up right, and that the plan it leads to
// starts at the child's real edge (not below it).
//   node tools/test-placement.mjs
import fs from 'fs';
import { Learner, now } from '../app/src/model/engine.js';
import { Placement } from '../app/src/model/placement.js';
import { defaultPlan } from '../app/src/plan/defaultPlan.js';
import { checkPlan } from '../app/src/plan/checkPlan.js';
import { rnd, SKILLS } from '../app/src/content/skills.js';
import { frac } from '../app/src/content/answers.js';
const load = (p) => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url)));
const map = load('knowledge-map/grades-3-5.json'), story = load('story/zoo-island.json'), schema = load('schema/learning-plan.schema.json');
let seed = 5; Math.random = rnd.f = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
let clock = Date.UTC(2026, 10, 20); now.t = () => clock;
const mem = () => { const m = new Map(); return { read: (k) => m.get(k) || null, write: (k, v) => m.set(k, v) }; };
const byId = new Map(map.nodes.map((n) => [n.id, n]));

/** Knows every skill up to `grade`, plus `extra` skills (closed under prerequisites), minus `holes`. */
function childKnows({ grade, extraP = 0, holeP = 0 }) {
    const K = new Set();
    for (const n of map.nodes) {
        const want = n.grade <= grade ? Math.random() >= holeP : n.grade === grade + 1 && Math.random() < extraP;
        if (want && n.prerequisites.every((p) => K.has(p))) K.add(n.id);
    }
    return K;
}
function answer(item, knows) {
    const ok = Math.random() < (knows ? 0.95 : 0.08);
    if (!knows && Math.random() < 0.5) return null;                          // "I don't know yet"
    const right = item.answer.symbol != null ? item.answer : item.mode === 'shade' ? { shaded: item.answer.n * item.visual.d / item.answer.d } : item.mode === 'place' ? { point: item.answer } : item.answer;
    if (ok) return right;
    if (item.mode === 'choice') { const w = item.choices.find((c) => !(c.value.symbol != null ? c.value.symbol === item.answer.symbol : c.value.n * item.answer.d === item.answer.n * c.value.d)); return w.value; }
    if (item.mode === 'shade') return { shaded: (right.shaded + 1) % item.visual.d };
    if (item.mode === 'place') return { point: frac(item.answer.n + 1, item.answer.d) };
    return frac(item.answer.n + 7, item.answer.d);
}

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const kids = [
    ['knows grade 2 only', { grade: 2 }],
    ['knows grade 3', { grade: 3 }],
    ['knows grade 3 + some grade 4', { grade: 3, extraP: 0.5 }],
    ['knows grade 4 (like Ailey?)', { grade: 4 }],
    ['grade 4 with 15% holes', { grade: 4, holeP: 0.15 }],
];
for (const [name, spec] of kids) {
    const qs = [], acc = [], startOk = [];
    for (let rep = 0; rep < 20; rep++) {
        const K = childKnows(spec);
        const L = new Learner(mem(), 'k' + rep);
        const P = new Placement({ map, learner: L, known: ['oa2-addsub-20'] });
        for (let g = 0; g < 60; g++) { const e = P.next(); if (e.type === 'done') break; P.answer(e.item, answer(e.item, K.has(e.item.skill))); }
        P.apply();
        qs.push(P.n);
        const testable = map.nodes.filter((n) => SKILLS[n.id]);
        acc.push(testable.filter((n) => (P.state[n.id] === 'known') === K.has(n.id)).length / testable.length);
        const plan = defaultPlan({ map, story, learner: L, player: 'Sim' });
        const { errors } = checkPlan(plan, { schema, map, story });
        if (errors.length) console.log('  plan errors:', errors.slice(0, 2).join(' / '));
        const news = plan.focus.filter((f) => f.role === 'new').map((f) => f.node);
        // "Starts at the edge": every new skill is one the child does NOT know yet.
        // (A child who knows every skill that has questions yet has no edge to start at.)
        const beyond = map.nodes.filter((n) => SKILLS[n.id]).every((n) => K.has(n.id));
        if (process.env.DBG && !(beyond || (news.length > 0 && news.every((id) => !K.has(id))))) console.log("   bad start:", news.map((id) => `${id}[${P.state[id] || "?"}${P.probed[id] ? " probed " + P.probed[id].right + "/" + P.probed[id].asked : ""}]`).join(", "));
        startOk.push(beyond || (news.length > 0 && news.every((id) => !K.has(id))) ? 1 : 0);
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`${name}: ${avg(qs).toFixed(1)} questions, ${(avg(acc) * 100).toFixed(0)}% of skills placed right, plan starts at the real edge ${(avg(startOk) * 100).toFixed(0)}% of the time`);
    check(`${name}: at most 38 questions`, Math.max(...qs) <= 38, `max ${Math.max(...qs)}`);
    check(`${name}: ≥ 85% of skills placed right`, avg(acc) >= 0.85, (avg(acc) * 100).toFixed(0) + '%');
    check(`${name}: plan starts at the edge ≥ 75% of the time`, avg(startOk) >= 0.75, (avg(startOk) * 100).toFixed(0) + '%');
}
console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
