// Tests for the plan checker: the examples pass, broken plans fail with the right error.
//   node tools/test-check-plan.mjs
import fs from 'fs';
import { checkPlan } from './check-plan.mjs';

const base = JSON.parse(fs.readFileSync(new URL('../plans/example-mia.plan.json', import.meta.url)));
const clone = () => JSON.parse(JSON.stringify(base));
let failed = 0;
function expect(name, plan, pattern) {
    const { errors } = checkPlan(plan);
    const ok = pattern ? errors.some((e) => pattern.test(e)) : errors.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + (errors.join(' / ') || 'no errors')}`);
}
expect('example plan passes', clone());
for (const f of fs.readdirSync(new URL('../plans/', import.meta.url))) {
    if (f.endsWith('.plan.json')) expect(`${f} passes`, JSON.parse(fs.readFileSync(new URL(`../plans/${f}`, import.meta.url))));
}
let p;
p = clone(); p.colour = 'blue';                                   expect('unknown field', p, /unknown field "colour"/);
p = clone(); delete p.basis;                                       expect('missing basis', p, /missing "basis"/);
p = clone(); p.focus[0].node = 'nf3-fractions';                    expect('unknown skill', p, /unknown skill "nf3-fractions"/);
p = clone(); p.focus[0].node = 'nf4-equivalent';                   expect('new skill before prerequisites', p, /prerequisites not mastered: nf3-equivalent-simple/);
p = clone(); p.focus[0].templates = { clock: 1 };                  expect('template the skill does not list', p, /template "clock" is not listed/);
p = clone(); p.focus[0].difficulty.max = 2;                        expect('bar level above max difficulty', p, /can never be reached/);
p = clone(); p.focus[0].bar.accuracy = 0.3;                        expect('bar accuracy out of range', p, /0.3 < 0.5/);
p = clone(); p.story.chapter = 'ice-1-bundles';                    expect('chapter in another world', p, /is in world number/);
p = clone(); p.session.maxNewSkills = 0;                           expect('new skill with maxNewSkills 0', p, /too many/);
p = clone(); p.factDrill.targetFacts = ['seven times eight'];      expect('bad fact format', p, /does not match/);
p = clone(); p.focus.push({ ...p.focus[1] });                      expect('skill listed twice', p, /listed twice/);
console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
