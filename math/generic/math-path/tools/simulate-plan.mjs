// Runs learning plans with simulated children, to check the engine:
// bars are reachable, test-out works, guessing never masters, reteach triggers,
// checkpoints run, and the automatic plan moves forward through the map.
//   node tools/simulate-plan.mjs
import fs from 'fs';
import { Learner, Session, now } from '../app/src/model/engine.js';
import { defaultPlan } from '../app/src/plan/defaultPlan.js';
import { checkPlan } from '../app/src/plan/checkPlan.js';
import { rnd } from '../app/src/content/skills.js';
import { frac } from '../app/src/content/answers.js';
const load = (p) => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url)));
const map = load('knowledge-map/grades-3-5.json'), story = load('story/zoo-island.json'), schema = load('schema/learning-plan.schema.json');
const plan = load('plans/example-from-pingo-report.plan.json');

let seed = 11; Math.random = rnd.f = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
let clock = Date.UTC(2026, 10, 1, 16); now.t = () => clock;
const mem = () => { const m = new Map(); return { read: (k) => m.get(k) || null, write: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) }; };

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

/** A simulated child: p(correct) by skill and level; learns a little each try. */
function child({ skill = () => 0.5, learnRate = 0.03, guesser = false, testMe = false } = {}) {
    const exp = {};
    return {
        answer(item) {
            const e = exp[item.skill] = (exp[item.skill] || 0) + 1;
            let p = guesser ? (item.mode === 'choice' ? 1 / item.choices.length : 0.05) : Math.min(0.97, skill(item.skill, item.level) + learnRate * e);
            const ok = Math.random() < p;
            const right = item.answer.symbol != null ? item.answer : item.mode === 'shade' ? { shaded: item.answer.n * item.visual.d / item.answer.d } : item.mode === 'place' ? { point: item.answer } : item.answer;
            if (ok) return right;
            if (item.mode === 'choice') { const w = item.choices.filter((c) => !(c.value.symbol != null ? c.value.symbol === item.answer.symbol : c.value.n * item.answer.d === item.answer.n * c.value.d)); return w[0].value; }
            if (item.mode === 'shade') return { shaded: (right.shaded + 1) % item.visual.d };
            if (item.mode === 'place') return { point: frac(item.answer.n + 1, item.answer.d) };
            return item.wrong && item.wrong[0] ? item.wrong[0].value : frac(item.answer.n + 1, item.answer.d);
        },
        testMe,
    };
}

function runSession(learner, plan, kid, kind = 'practice') {
    const s = new Session({ plan, learner, kind });
    const ev = { lessons: 0, reteach: 0, testedOut: [], barMet: [], items: 0 };
    for (let guard = 0; guard < 200; guard++) {
        const e = s.next();
        if (e.type === 'done') break;
        if (e.type === 'lesson') { ev.lessons++; if (e.reteach) ev.reteach++; s.lessonDone(e.skill, { testMe: kid.testMe && e.canTestOut }); continue; }
        clock += 20000;
        const fb = s.answer(e.item, kid.answer(e.item), { ms: 5000 });
        ev.items++;
        if (fb.testedOut) ev.testedOut.push(e.item.skill);
        if (fb.barMet) ev.barMet.push(e.item.skill);
        if (e.item.askWhy) s.explanation(e.item, 'because the pieces are the same size');
    }
    ev.entry = s.finish();
    ev.acc = s.n ? s.right / s.n : 0;
    return ev;
}

// 1. Average child on the example plan: bar on the new skills within a few sessions.
{
    const L = new Learner(mem(), 'avg'); const kid = child({ skill: (k, lvl) => 0.75 - 0.05 * lvl });
    const met = {}; const accs = [];
    for (let day = 1; day <= 6; day++) { const ev = runSession(L, plan, kid); accs.push(ev.acc); ev.barMet.forEach((k) => (met[k] = met[k] || day)); clock += 86400000; }
    check('average child reaches the bar on nf3-unit-fraction', !!met['nf3-unit-fraction'], `day ${met['nf3-unit-fraction']}`);
    check('average child reaches the bar on md3-area-concept', !!met['md3-area-concept'], `day ${met['md3-area-concept']}`);
    check('first sessions stay at 60–95% correct', accs.slice(0, 2).every((a) => a > 0.6 && a < 0.95), accs.map((a) => a.toFixed(2)).join(' '));
    check('delayed check turns bar-met into mastered', L.status('nf3-unit-fraction') === 'mastered', L.status('nf3-unit-fraction'));
    check('explanations saved', L.texts.length > 0, `${L.texts.length}`);
}
// 2. A child who already knows it tests out on day one.
{
    const L = new Learner(mem(), 'fast'); const kid = child({ skill: () => 0.99, testMe: true });
    const ev = runSession(L, plan, kid);
    check('fast child tests out of new skills', ev.testedOut.length >= 1, ev.testedOut.join(','));
}
// 3. A guesser never reaches the bar.
{
    const L = new Learner(mem(), 'guess'); const kid = child({ guesser: true });
    let any = false; for (let d = 0; d < 5; d++) { any = any || runSession(L, plan, kid).barMet.length > 0; clock += 86400000; }
    check('guessing never reaches the bar', !any);
}
// 4. A struggling child triggers reteach.
{
    const L = new Learner(mem(), 'slow'); const kid = child({ skill: () => 0.2, learnRate: 0 });
    const ev = runSession(L, plan, kid);
    check('struggling child gets a reteach lesson', ev.reteach >= 1, `${ev.reteach}`);
}
// 5. Checkpoint runs the configured number of questions.
{
    const L = new Learner(mem(), 'cp'); const kid = child({ skill: () => 0.8 });
    runSession(L, plan, kid);
    const ev = runSession(L, plan, kid, 'checkpoint');
    check('checkpoint asks 12 questions', ev.items === 12, `${ev.items}`);
    check('checkpoint saved', L.checkpoints.length === 1 && Object.keys(L.checkpoints[0].perSkill).length >= 2);
}
// 6. Automatic plans move forward through the map, and always pass the plan checker.
{
    const L = new Learner(mem(), 'auto'); const kid = child({ skill: (k, lvl) => 0.85 - 0.03 * lvl, learnRate: 0.05 });
    const pingo = { 'oa2-addsub-20': 'mastered', 'nbt2-addsub-100': 'mastered', 'oa3-facts-mult': 'mastered', 'oa3-facts-div': 'mastered', 'oa3-mult-meaning': 'mastered (inferred)', 'oa3-div-meaning': 'mastered (inferred)' };
    const seen = new Set(); let bad = [];
    for (let cycle = 0; cycle < 8; cycle++) {
        const p = defaultPlan({ map, story, learner: L, player: 'Sim', pingo });
        const { errors } = checkPlan(p, { schema, map, story });
        if (errors.length) bad.push(...errors);
        p.focus.forEach((f) => seen.add(f.node));
        for (let d = 0; d < 3; d++) { runSession(L, p, kid); clock += 86400000; }
    }
    check('automatic plans pass the checker', !bad.length, bad.slice(0, 3).join(' / '));
    check('automatic plans cover several new skills over 8 cycles', seen.size >= 6, [...seen].join(', '));
    check('mastered skills accumulate', L.mastered().length >= 4, L.mastered().join(', '));
}
// 7. Plan without optional fields works (defaults).
{
    const L = new Learner(mem(), 'min');
    const p = { version: 1, player: 'X', createdAt: '2026-11-14', basis: { mastered: ['oa3-div-meaning'] }, focus: [{ node: 'nf3-unit-fraction', role: 'new' }] };
    const ev = runSession(L, p, child({ skill: () => 0.7 }));
    check('a minimal plan runs', ev.items > 10, `${ev.items} questions`);
}
console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
