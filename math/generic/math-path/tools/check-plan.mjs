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

// --- Minimal JSON Schema checker (type, const, enum, pattern, min/max, length, items,
// required, properties, additionalProperties, propertyNames, uniqueItems, $ref).
function typeOf(v) { return Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v; }
function resolve(ref) { return ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], schema); }
export function validate(v, s, at = '$', errs = []) {
    if (s.$ref) return validate(v, resolve(s.$ref), at, errs);
    const t = typeOf(v);
    if (s.type && !(s.type === t || (s.type === 'number' && t === 'integer'))) { errs.push(`${at}: expected ${s.type}, got ${t}`); return errs; }
    if ('const' in s && v !== s.const) errs.push(`${at}: must be ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.includes(v)) errs.push(`${at}: ${JSON.stringify(v)} is not one of ${s.enum.join(', ')}`);
    if (t === 'string') {
        if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${at}: "${v}" does not match ${s.pattern}`);
        if (s.minLength != null && v.length < s.minLength) errs.push(`${at}: too short`);
        if (s.maxLength != null && v.length > s.maxLength) errs.push(`${at}: longer than ${s.maxLength} characters`);
    }
    if (t === 'number' || t === 'integer') {
        if (s.minimum != null && v < s.minimum) errs.push(`${at}: ${v} < ${s.minimum}`);
        if (s.maximum != null && v > s.maximum) errs.push(`${at}: ${v} > ${s.maximum}`);
    }
    if (t === 'array') {
        if (s.minItems != null && v.length < s.minItems) errs.push(`${at}: needs at least ${s.minItems} items`);
        if (s.maxItems != null && v.length > s.maxItems) errs.push(`${at}: at most ${s.maxItems} items`);
        if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) errs.push(`${at}: repeated items`);
        if (s.items) v.forEach((x, i) => validate(x, s.items, `${at}[${i}]`, errs));
    }
    if (t === 'object') {
        for (const k of s.required || []) if (!(k in v)) errs.push(`${at}: missing "${k}"`);
        for (const [k, x] of Object.entries(v)) {
            if (s.propertyNames) validate(k, s.propertyNames, `${at} key "${k}"`, errs);
            if (s.properties && k in s.properties) validate(x, s.properties[k], `${at}.${k}`, errs);
            else if (s.additionalProperties === false) errs.push(`${at}: unknown field "${k}"`);
            else if (typeof s.additionalProperties === 'object') validate(x, s.additionalProperties, `${at}.${k}`, errs);
        }
    }
    return errs;
}

// --- Meaning checks.
export function checkPlan(plan) {
    const errors = validate(plan, schema);
    const warnings = [];
    if (errors.length) return { errors, warnings };
    const nodes = new Map(map.nodes.map((n) => [n.id, n]));
    const known = (id, where) => { if (!nodes.has(id)) errors.push(`${where}: unknown skill "${id}"`); return nodes.get(id); };

    plan.basis.mastered.forEach((id) => known(id, 'basis.mastered'));
    (plan.basis.shaky || []).forEach((id) => known(id, 'basis.shaky'));
    const mastered = new Set(plan.basis.mastered);
    const inFocus = new Map(plan.focus.map((f) => [f.node, f.role]));
    if (inFocus.size !== plan.focus.length) errors.push('focus: a skill is listed twice');

    for (const [i, f] of plan.focus.entries()) {
        const at = `focus[${i}] ${f.node}`;
        const n = known(f.node, at);
        if (!n) continue;
        if (f.templates) {
            for (const t of Object.keys(f.templates)) if (!n.templates.includes(t)) errors.push(`${at}: template "${t}" is not listed for this skill (map has ${n.templates.join(', ')})`);
            const sum = Object.values(f.templates).reduce((a, b) => a + b, 0);
            if (Math.abs(sum - 1) > 0.05) warnings.push(`${at}: template shares add to ${sum.toFixed(2)}, the game will rescale`);
        }
        if (f.input) {
            const sum = ['choice', 'typed', 'voice'].reduce((a, k) => a + (f.input[k] || 0), 0);
            if (sum && Math.abs(sum - 1) > 0.05) warnings.push(`${at}: input shares add to ${sum.toFixed(2)}, the game will rescale`);
            if (f.input.voice && !(f.templates ? 'fact-drill' in f.templates : n.templates.includes('fact-drill'))) warnings.push(`${at}: voice answers only work in fact drills`);
        }
        if (f.role === 'new' || f.role === 'stretch') {
            if (mastered.has(f.node)) warnings.push(`${at}: marked ${f.role} but already in basis.mastered`);
            const missing = n.prerequisites.filter((p) => !mastered.has(p) && !['repair', 'review'].includes(inFocus.get(p)));
            if (missing.length && f.role === 'new') errors.push(`${at}: prerequisites not mastered: ${missing.join(', ')}`);
            if (missing.length && f.role === 'stretch') warnings.push(`${at}: stretch skill with unmastered prerequisites ${missing.join(', ')}`);
        }
        if (f.role === 'review' && !mastered.has(f.node)) warnings.push(`${at}: review of a skill that is not in basis.mastered`);
        const d = f.difficulty;
        if (d && d.start && d.max && d.start > d.max) errors.push(`${at}: difficulty.start above difficulty.max`);
        if (d && f.bar && f.bar.atLevel && d.max && f.bar.atLevel > d.max) errors.push(`${at}: bar.atLevel ${f.bar.atLevel} can never be reached (difficulty.max ${d.max})`);
    }

    const newCount = plan.focus.filter((f) => f.role === 'new').length;
    const maxNew = plan.session?.maxNewSkills ?? 1;
    if ((maxNew === 0 && newCount) || newCount > maxNew * 2) errors.push(`focus: ${newCount} new skills is too many for maxNewSkills ${maxNew}`);
    else if (newCount > maxNew) warnings.push(`focus: ${newCount} new skills, sessions open ${maxNew} at a time`);
    const wsum = plan.focus.reduce((a, f) => a + (f.weight ?? 0.25), 0);
    if (Math.abs(wsum - 1) > 0.1) warnings.push(`focus weights add to ${wsum.toFixed(2)}, the game will rescale`);
    const mix = plan.session?.mix;
    if (mix) { const s = (mix.new || 0) + (mix.repair || 0) + (mix.review || 0); if (Math.abs(s - 1) > 0.05) warnings.push(`session.mix adds to ${s.toFixed(2)}`); }

    if (plan.story?.chapter) {
        const ch = story.chapters.find((c) => c.id === plan.story.chapter);
        if (!ch) errors.push(`story.chapter "${plan.story.chapter}" is not in story/zoo-island.json`);
        else {
            if (plan.story.world && plan.story.world !== ch.world) errors.push(`story: chapter ${ch.id} is in world ${ch.world}, not ${plan.story.world}`);
            if (!plan.focus.some((f) => ch.nodes.includes(f.node))) warnings.push(`story: chapter ${ch.id} does not practise any focus skill`);
        }
    }
    if (plan.story?.npc && !story.npcs[plan.story.npc]) warnings.push(`story.npc "${plan.story.npc}" is not a known character`);
    for (const id of plan.checkpoint?.include || []) known(id, 'checkpoint.include');
    if (plan.needsNewTemplate?.length) warnings.push(`needs new template(s): ${plan.needsNewTemplate.join(' | ')} — code change required`);
    return { errors, warnings };
}

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
