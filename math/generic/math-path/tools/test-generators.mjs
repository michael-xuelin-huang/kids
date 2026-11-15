// Every generator, every level, 400 items each: the answer passes its own check, choices
// are distinct, include the answer exactly once, and every wrong choice fails the check.
//   node tools/test-generators.mjs
import fs from 'fs';
import { SKILLS, makeItem, checkItem } from '../app/src/content/skills.js';
import { parseAnswer, fmt, same } from '../app/src/content/answers.js';
const map = JSON.parse(fs.readFileSync(new URL('../knowledge-map/grades-3-5.json', import.meta.url)));
const ids = new Set(map.nodes.map((n) => n.id));
let failed = 0; const fail = (m) => { if (failed++ < 25) console.log('FAIL ' + m); };
for (const [skill, kinds] of Object.entries(SKILLS)) {
    if (!ids.has(skill)) fail(`${skill} is not in the map`);
    const node = map.nodes.find((n) => n.id === skill);
    for (const k of kinds) if (node && !node.templates.includes(k.template) && !(k.template === 'choice' || k.template === 'keypad')) fail(`${skill}/${k.kind}: template ${k.template} not listed in the map (${node.templates})`);
    for (let level = 1; level <= 5; level++) for (let i = 0; i < 400; i++) {
        for (const mode of ['choice', 'typed']) {
            const it = makeItem(skill, level, { input: { [mode]: 1 } });
            const tag = `${skill}/${it.kind} L${level}: ${it.prompt}`;
            const right = it.answer.symbol != null ? it.answer : it.mode === 'shade' ? { shaded: it.answer.n * it.visual.d / it.answer.d } : it.mode === 'place' ? { point: it.answer } : it.answer;
            if (!checkItem(it, right).correct) fail(`${tag} answer fails its own check`);
            if (it.mode === 'typed' && it.answer.symbol == null && !same(parseAnswer(fmt(it.answer)), it.answer)) fail(`${tag} typed answer does not parse`);
            if (it.mode === 'shade' && !Number.isInteger(it.answer.n * it.visual.d / it.answer.d)) fail(`${tag} cannot be shaded`);
            if (it.choices) {
                const labels = it.choices.map((c) => c.label);
                if (new Set(labels).size !== labels.length) fail(`${tag} repeated choices ${labels}`);
                const rights = it.choices.filter((c) => checkItem(it, c.value).correct);
                if (rights.length !== 1) fail(`${tag} has ${rights.length} correct choices: ${labels}`);
            }
            if (!it.hints || it.hints.length !== 3) fail(`${tag} needs 3 hints`);
            if (it.answer.n != null && (it.answer.n < 0 || !Number.isFinite(it.answer.n))) fail(`${tag} bad answer ${fmt(it.answer)}`);
        }
    }
}
// Parser
const P = [['3/4', '3/4'], ['three quarters', '3/4'], ['Three fourths.', '3/4'], ['one half', '1/2'], ['a third', '1/3'], ['¾', '3/4'], ['twelve', '12'], ['forty two', '42'],
    ['The answer is 56', '56'], ['1 1/2', '3/2'], ['one and a half', '3/2'], ['5 over 8', '5/8'], ['five over eight', '5/8'], ['0.5', '5/10'], ['six', '6'], ['2/0', null], ['banana', null]];
for (const [s, want] of P) { const g = parseAnswer(s); const got = g ? `${g.n}/${g.d}`.replace(/\/1$/, '') : null; if (got !== want) fail(`parse "${s}" -> ${got}, want ${want}`); }
console.log(failed ? `\n${failed} failing` : `all passing (${Object.keys(SKILLS).length} skills)`);
process.exit(failed ? 1 : 0);
