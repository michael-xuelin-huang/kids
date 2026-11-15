// Checks a learning plan before the game uses it.
//
//   node tools/check-plan.mjs plans/example-mia.plan.json [more.plan.json ...]
//
// 1. Shape: against schema/learning-plan.schema.json (a small built-in checker for the
//    parts of JSON Schema the file uses, so no packages are needed).
// 2. Meaning: against the knowledge map and the story library:
//    - every skill id exists; templates are ones the map lists for that skill;
//    - a "new" skill has all prerequisites in basis.mastered (or in focus as repair/review);
//    - weights and mixes add up; at most session.maxNewSkills new skills;
//    - the story chapter exists, matches the world, and fits a focus skill.
// Exit 1 on errors; warnings are printed but pass.
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const schema = load('schema/learning-plan.schema.json');
const map = load('knowledge-map/grades-3-5.json');
const story = load('story/zoo-island.json');

import { checkPlan as check } from '../app/src/plan/checkPlan.js';
export const checkPlan = (plan) => check(plan, { schema, map, story });

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    const files = process.argv.slice(2);
    if (!files.length) { console.error('usage: node tools/check-plan.mjs <plan.json> ...'); process.exit(2); }
    let bad = 0;
    for (const f of files) {
        let plan;
        try { plan = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`FAIL ${f}: not valid JSON (${e.message})`); bad++; continue; }
        const { errors, warnings } = checkPlan(plan);
        console.log(`${errors.length ? 'FAIL' : 'ok  '} ${f}`);
        errors.forEach((e) => console.log(`  error: ${e}`));
        warnings.forEach((w) => console.log(`  warn:  ${w}`));
        if (errors.length) bad++;
    }
    process.exit(bad ? 1 : 0);
}
