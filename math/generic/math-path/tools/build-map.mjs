// Builds the knowledge map from its source table and checks it.
//
//   node tools/build-map.mjs
//
// Reads  knowledge-map/source-grades-3-5.txt
// Writes knowledge-map/grades-3-5.json  (for the game and the AI)
//        knowledge-map/grades-3-5.md    (for people: skills by world and grade, in learning order)
// Fails (exit 1) on: duplicate ids, unknown prerequisites, cycles, a prerequisite from a
// later grade, unknown worlds or game templates.
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'knowledge-map/source-grades-3-5.txt');

export const WORLDS = {
    pattern: 'Pattern Jungle (operations and algebraic thinking)',
    number: 'Number Ice Fields (place value and multi-digit operations)',
    fraction: 'Fraction Reef (fractions and decimals)',
    shape: 'Shape Savanna (measurement and geometry)',
    data: 'Data Observatory (data)',
};
export const TEMPLATES = {
    'fact-drill': 'Fast recall with spaced repeats (voice, keypad or choice) — Pingo today',
    choice: 'Tap one of 3 to 4 options; wrong options come from misconceptions',
    keypad: 'Type a number, fraction or decimal; equivalent forms accepted',
    'story-problem': 'Short story problem from an NPC; keypad or choice answer, optional "why"',
    explain: 'Explain why / find Pingo\'s mistake; free text, typed or dictated, AI-scored later',
    'fraction-bars': 'Cut, shade and compare fraction bars',
    'number-line': 'Place or read a number or fraction on a number line',
    'area-model': 'Arrays and area rectangles: build, split, count',
    'base-ten': 'Base-ten blocks: bundle and unbundle tens, hundreds, tenths',
    'long-algorithm': 'Column addition, subtraction and multiplication, one checked step at a time',
    'long-division': 'Long division, one checked step at a time',
    clock: 'Set and read an analog clock; elapsed time on a time line',
    protractor: 'Measure and build angles',
    'coordinate-grid': 'Plot and read points in the first quadrant',
    'graph-builder': 'Build and read picture graphs, bar graphs and line plots',
};

function parse() {
    const nodes = [];
    for (const [i, line] of fs.readFileSync(src, 'utf8').split('\n').entries()) {
        if (!line.trim() || line.startsWith('#')) continue;
        const f = line.split(' | ').map((s) => s.trim());
        if (f.length !== 8) throw new Error(`line ${i + 1}: expected 8 fields, got ${f.length}`);
        const list = (s, sep = ',') => (s === '-' ? [] : s.split(sep).map((x) => x.trim()).filter(Boolean));
        const [id, world, grade, standards, title, prereqs, templates, misconceptions] = f;
        nodes.push({
            id, world, grade: Number(grade), standards: list(standards), title,
            prerequisites: list(prereqs), templates: list(templates), misconceptions: list(misconceptions, ';'),
            ...(grade === '2' ? { floor: true, coveredBy: 'math-quest-penguin' } : {}),
            ...(['oa3-facts-mult', 'oa3-facts-div'].includes(id) ? { coveredBy: 'math-quest-penguin' } : {}),
        });
    }
    return nodes;
}

function check(nodes) {
    const errors = [];
    const byId = new Map();
    for (const n of nodes) {
        if (byId.has(n.id)) errors.push(`duplicate id ${n.id}`);
        byId.set(n.id, n);
        if (!WORLDS[n.world]) errors.push(`${n.id}: unknown world ${n.world}`);
        for (const t of n.templates) if (!TEMPLATES[t]) errors.push(`${n.id}: unknown template ${t}`);
        if (!n.standards.every((s) => /^\d\.[A-Z]{1,3}\.[A-D](\.\d+[a-d]?)?$/.test(s))) errors.push(`${n.id}: odd standard code ${n.standards}`);
    }
    for (const n of nodes) for (const p of n.prerequisites) {
        const q = byId.get(p);
        if (!q) errors.push(`${n.id}: unknown prerequisite ${p}`);
        else if (q.grade > n.grade) errors.push(`${n.id} (grade ${n.grade}) needs ${p} from grade ${q.grade}`);
    }
    // Topological order (Kahn); leftovers = a cycle.
    const indeg = new Map(nodes.map((n) => [n.id, n.prerequisites.filter((p) => byId.has(p)).length]));
    const layer = new Map();
    let frontier = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    frontier.forEach((id) => layer.set(id, 0));
    const order = [];
    while (frontier.length) {
        const next = [];
        for (const id of frontier) {
            order.push(id);
            for (const m of nodes) if (m.prerequisites.includes(id)) {
                indeg.set(m.id, indeg.get(m.id) - 1);
                layer.set(m.id, Math.max(layer.get(m.id) || 0, layer.get(id) + 1));
                if (indeg.get(m.id) === 0) next.push(m.id);
            }
        }
        frontier = next;
    }
    if (order.length !== nodes.length) errors.push(`cycle among: ${nodes.filter((n) => !order.includes(n.id)).map((n) => n.id).join(', ')}`);
    return { errors, order, layer };
}

const nodes = parse();
const { errors, order, layer } = check(nodes);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// Learning order: by depth in the graph, then grade, then world.
const rank = new Map(order.map((id, i) => [id, i]));
const sorted = [...nodes].sort((a, b) => layer.get(a.id) - layer.get(b.id) || a.grade - b.grade || rank.get(a.id) - rank.get(b.id));
for (const n of sorted) n.depth = layer.get(n.id);
const dependents = (id) => nodes.filter((m) => m.prerequisites.includes(id)).map((m) => m.id);
for (const n of sorted) n.unlocks = dependents(n.id);

const out = {
    name: 'Math Path knowledge map, grades 3 to 5',
    version: 1,
    generatedFrom: 'knowledge-map/source-grades-3-5.txt',
    standards: 'US Common Core State Standards for Mathematics (https://thecorestandards.org/Math/Content/)',
    worlds: WORLDS,
    templates: TEMPLATES,
    nodes: sorted,
};
fs.writeFileSync(path.join(root, 'knowledge-map/grades-3-5.json'), JSON.stringify(out, null, 1) + '\n');

const md = [
    '# Knowledge map: grades 3 to 5', '',
    `${nodes.length} skills in ${Object.keys(WORLDS).length} worlds, generated from \`source-grades-3-5.txt\` by \`tools/build-map.mjs\`. `
    + 'Grade 2 rows are the floor the map assumes. "Depth" is the number of prerequisite steps below a skill: anything at depth 0 can be learned first.', '',
];
for (const [w, name] of Object.entries(WORLDS)) {
    const ws = sorted.filter((n) => n.world === w);
    md.push(`## ${name}`, '', '| Skill | Grade | Standard | Depth | Needs | Games |', '|---|---|---|---|---|---|');
    for (const n of ws) md.push(`| ${n.title} (\`${n.id}\`)${n.coveredBy ? ' ✓ in Pingo' : ''} | ${n.grade} | ${n.standards.join(', ')} | ${n.depth} | ${n.prerequisites.map((p) => `\`${p}\``).join(', ') || '–'} | ${n.templates.join(', ')} |`);
    md.push('');
}
md.push('## Game templates', '', '| Template | What it is |', '|---|---|', ...Object.entries(TEMPLATES).map(([k, v]) => `| \`${k}\` | ${v} |`), '');
fs.writeFileSync(path.join(root, 'knowledge-map/grades-3-5.md'), md.join('\n'));

const count = (k) => Object.fromEntries(Object.keys(k === 'world' ? WORLDS : { 2: 1, 3: 1, 4: 1, 5: 1 }).map((x) => [x, nodes.filter((n) => String(n[k]) === x).length]));
console.log(`ok: ${nodes.length} skills, max depth ${Math.max(...sorted.map((n) => n.depth))}`);
console.log('by world', count('world'), 'by grade', count('grade'));

// The story library must only name real skills, and every skill should have a chapter.
const storyFile = path.join(root, 'story/zoo-island.json');
if (fs.existsSync(storyFile)) {
    const story = JSON.parse(fs.readFileSync(storyFile, 'utf8'));
    const ids = new Set(nodes.map((n) => n.id));
    const named = new Set(story.chapters.flatMap((c) => c.nodes));
    const unknown = [...named].filter((id) => !ids.has(id));
    const uncovered = [...ids].filter((id) => !named.has(id));
    if (unknown.length) { console.error(`story names unknown skills: ${unknown.join(', ')}`); process.exit(1); }
    console.log(`story: ${story.chapters.length} chapters${uncovered.length ? `, skills with no chapter: ${uncovered.join(', ')}` : ', every skill has a chapter'}`);
}
