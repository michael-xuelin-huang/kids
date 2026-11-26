// Report v2: what the child did under the current plan, in knowledge-map ids, for the
// next plan (prompts/next-plan.md). Markdown with a JSON block at the end.
import { withDefaults, barMet } from './model/engine.js';
import { frontier } from './plan/defaultPlan.js';

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '–');
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export function buildReport({ player, plan, learner, map, pingo = {} }) {
    const p = withDefaults(plan);
    const node = (id) => map.nodes.find((n) => n.id === id);
    const skills = Object.entries(learner.skills).filter(([, r]) => r.attempts > 0 || r.status !== 'new').map(([id, r]) => {
        const last = r.window.slice(-10);
        return {
            id, title: node(id)?.title || id, world: node(id)?.world, grade: node(id)?.grade, status: r.status === 'barMet' ? 'bar met (waiting for the check a few days later)' : r.status + (r.inherited ? ' (known from before)' : ''),
            level: r.level, attempts: r.attempts, recentAccuracy: last.length ? +(last.filter((w) => w.ok).length / last.length).toFixed(2) : null,
            medianSeconds: median(r.ms) ? +(median(r.ms) / 1000).toFixed(1) : null, hintsUsed: r.hints, misconceptions: r.misconceptions,
            lastSeen: day(r.lastSeen), barMetAt: day(r.barMetAt), masteredAt: day(r.masteredAt), reviewDue: day(r.reviewDue),
        };
    });
    const mastered = new Set([...learner.mastered(), ...Object.entries(pingo).filter(([, v]) => /^mastered/.test(v)).map(([k]) => k)]);
    const front = frontier(map, mastered);
    const blockers = Object.entries(learner.skills).filter(([, r]) => r.status === 'learning').map(([id]) => ({ id, holdsBack: map.nodes.filter((n) => n.prerequisites.includes(id)).map((n) => n.id) })).filter((b) => b.holdsBack.length >= 2);
    const planStart = Date.parse(plan.createdAt) || 0;
    const sessions = learner.sessions.filter((s) => s.at >= planStart - 86400000);
    const against = p.focus.map((f) => {
        const r = learner.skills[f.node];
        const metSessions = r && r.barMetAt ? sessions.filter((s) => s.at <= r.barMetAt && s.kind === 'practice').length : null;
        return { node: f.node, role: f.role, bar: f.bar, status: r ? r.status : 'not started', level: r?.level ?? null, attempts: r?.attempts || 0,
            recentAccuracy: r && r.window.length ? +(r.window.slice(-f.bar.window).filter((w) => w.ok).length / Math.min(f.bar.window, r.window.length)).toFixed(2) : null,
            barMet: !!r && (r.status === 'barMet' || r.status === 'mastered' || barMet(r, f.bar)), sessionsToBar: metSessions };
    });
    const worlds = {};
    for (const n of map.nodes) {
        const w = (worlds[n.world] = worlds[n.world] || { mastered: 0, total: 0, highestGradeAllMastered: null });
        w.total++; if (mastered.has(n.id)) w.mastered++;
    }
    for (const [w, o] of Object.entries(worlds)) {
        for (const g of [2, 3, 4, 5]) { const ns = map.nodes.filter((n) => n.world === w && n.grade === g); if (ns.length && ns.every((n) => mastered.has(n.id))) o.highestGradeAllMastered = g; }
    }
    const misc = {};
    for (const s of skills) for (const [m, c] of Object.entries(s.misconceptions || {})) misc[`${m} (${s.id})`] = c;
    const cp = learner.checkpoints[learner.checkpoints.length - 1] || null;
    const mapStatus = {};
    for (const [k, v] of Object.entries(pingo)) mapStatus[k] = `${v} (Pingo)`;
    for (const s of skills) mapStatus[s.id] = s.status.split(' ')[0] === 'bar' ? 'bar met' : s.status.replace(' (known from before)', '');
    return {
        player, generatedAt: new Date().toISOString(),
        plan: { createdAt: plan.createdAt, basedOnReport: plan.basedOnReport, chapter: plan.story?.chapter, focus: plan.focus.map((f) => `${f.node} (${f.role})`) },
        totals: {
            sessionsUnderPlan: sessions.filter((s) => s.kind === 'practice').length, minutes: +sessions.reduce((a, s) => a + s.minutes, 0).toFixed(0),
            questions: sessions.reduce((a, s) => a + s.questions, 0), accuracy: sessions.length ? +(sessions.reduce((a, s) => a + s.correct, 0) / Math.max(1, sessions.reduce((a, s) => a + s.questions, 0))).toFixed(2) : null,
        },
        againstPlan: against, skills, worlds, frontier: front.map((n) => n.id), blockers, misconceptions: misc,
        placement: (learner.placements || []).slice(-1)[0] || null,
        checkpoint: cp, ownWords: learner.texts.slice(-30), sessions: sessions.slice(-15), mapStatus,
    };
}

export function reportMarkdown(r) {
    const L = [];
    L.push(`# Math Path report: ${r.player}`, '', `Generated ${r.generatedAt.slice(0, 10)} by the Math Path app. Plan of ${r.plan.createdAt} (${r.plan.basedOnReport}), story chapter \`${r.plan.chapter || '–'}\`.`, '');
    L.push('## Summary', '');
    L.push(`- Under this plan: ${r.totals.sessionsUnderPlan} practice sessions, ${r.totals.minutes} minutes, ${r.totals.questions} questions, ${pct(r.totals.accuracy)} correct.`);
    const met = r.againstPlan.filter((a) => a.barMet).map((a) => a.node);
    L.push(`- Bars met: ${met.length ? met.map((m) => `\`${m}\``).join(', ') : 'none yet'} (of ${r.againstPlan.length} focus skills).`);
    if (r.checkpoint) L.push(`- Last checkpoint (${day(r.checkpoint.at)}): ${r.checkpoint.correct}/${r.checkpoint.questions} correct.`);
    L.push('');
    if (r.placement) {
        const pl = r.placement;
        L.push('## Quick check (placement)', '', `${day(pl.at)}: ${pl.questions} questions (${pl.correct} right) in ${pl.minutes} min. ${pl.known} skills counted as known (probed or inferred); ready to learn next: ${pl.frontier.map((x) => `\`${x}\``).join(', ') || '–'}.`, '',
            '| Skill probed | Right / asked | Result |', '|---|---|---|', ...Object.entries(pl.probed).map(([k, v]) => `| \`${k}\` | ${v.right}/${v.asked} | ${v.verdict === 'known' ? 'known' : 'not yet'} |`), '',
            'Known skills that were inferred rather than asked come back soon as spot-checks and drop to "learning" if missed.', '');
    }
    L.push('## Against the plan', '', '| Skill | Role | Status | Level | Recent accuracy | Attempts | Bar | Met | Sessions to bar |', '|---|---|---|---|---|---|---|---|---|');
    for (const a of r.againstPlan) L.push(`| \`${a.node}\` | ${a.role} | ${a.status} | ${a.level ?? '–'} | ${pct(a.recentAccuracy)} | ${a.attempts} | ${pct(a.bar.accuracy)} of last ${a.bar.window} at level ≥ ${a.bar.atLevel}, ≥ ${a.bar.minAttempts} tries${a.bar.medianSeconds ? `, ≤ ${a.bar.medianSeconds} s` : ''} | ${a.barMet ? 'yes' : 'no'} | ${a.sessionsToBar ?? '–'} |`);
    L.push('', '"Level" is 1–5 on the skill\'s ladder (1 = pictures and small numbers, 5 = full grade-level demand in symbols).', '');
    L.push('## All skills practised', '', '| Skill | Grade | Status | Level | Recent accuracy | Typical time | Hints | Last seen |', '|---|---|---|---|---|---|---|---|');
    for (const s of r.skills) L.push(`| ${s.title} (\`${s.id}\`) | ${s.grade ?? '–'} | ${s.status} | ${s.level ?? '–'} | ${pct(s.recentAccuracy)} | ${s.medianSeconds ? s.medianSeconds + ' s' : '–'} | ${s.hintsUsed} | ${s.lastSeen} |`);
    L.push('');
    L.push('## Misconceptions seen', '');
    const ms = Object.entries(r.misconceptions).sort((a, b) => b[1] - a[1]);
    L.push(...(ms.length ? ms.map(([m, c]) => `- ${m}: ${c} time${c === 1 ? '' : 's'}`) : ['None recorded.']), '');
    L.push('## The child\'s own words', '');
    if (!r.ownWords.length) L.push('No written or dictated answers yet.', '');
    for (const t of r.ownWords) L.push(`- **${t.why || 'Why?'}** (\`${t.skill}\`, after "${t.question}", answer was ${t.wasCorrect ? 'right' : 'wrong'}): "${t.answer}"`);
    L.push('');
    L.push('## Map position', '');
    for (const [w, o] of Object.entries(r.worlds)) L.push(`- ${w}: ${o.mastered}/${o.total} skills mastered${o.highestGradeAllMastered ? `, all of grade ${o.highestGradeAllMastered} done` : ''}`);
    L.push('', `Frontier (everything they need is mastered): ${r.frontier.map((x) => `\`${x}\``).join(', ') || '–'}`);
    if (r.blockers.length) L.push('', `Blockers (still learning, and holding back 2+ skills): ${r.blockers.map((b) => `\`${b.id}\` → ${b.holdsBack.join(', ')}`).join('; ')}`);
    L.push('');
    if (r.checkpoint) {
        L.push('## Checkpoint', '', '| Skill | Right |', '|---|---|', ...Object.entries(r.checkpoint.perSkill || {}).map(([k, v]) => `| \`${k}\` | ${v.right}/${v.asked} |`), '');
    }
    L.push('## Sessions', '', '| Date | Kind | Minutes | Questions | Correct | Stars |', '|---|---|---|---|---|---|');
    for (const s of r.sessions) L.push(`| ${day(s.at)} | ${s.kind} | ${s.minutes} | ${s.questions} | ${s.correct} | ${s.stars} |`);
    L.push('');
    L.push('## Knowledge-map skills (Math Path ids)', '', ...Object.entries(r.mapStatus).map(([k, v]) => `- \`${k}\`: ${v}`), '');
    L.push('## Notes for the next plan', '',
        '- Answers are checked by code. Choice answers carry the misconception of the option picked; typed answers are matched against known wrong answers.',
        '- "Bar met" waits for a check a few days later before it counts as mastered.',
        '- Write the next plan with prompts/next-plan.md and check it with tools/check-plan.mjs.', '');
    L.push('## Data (JSON)', '', '```json', JSON.stringify(r, null, 1), '```', '');
    return L.join('\n');
}
