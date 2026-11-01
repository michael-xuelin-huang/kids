// Progress report: strengths, weaknesses, level and mastery per kind of
// question, built from the tutor's saved state and the child's answer history.
//
// Written for two readers: a parent (summary, tables) and an AI asked to design
// the next game or test (definitions, evidence, standards mapping, and a
// machine-readable JSON block at the end).

const OP_NAME = { mul: 'Multiplication facts (1×1 to 9×9)', div: 'Division facts (inverse of the times tables)', add: 'Addition (sums up to 81)', sub: 'Subtraction (within 81)' };
const OP_SYM = { mul: '×', div: '÷', add: '+', sub: '−' };
const ADD_TIERS = [
    'single digits, sum within 10 (3 + 4)',
    'single digits crossing 10 (8 + 7)',
    '2-digit + 1-digit, no regrouping (34 + 5)',
    '2-digit + 1-digit, with regrouping (38 + 5)',
    '2-digit + 2-digit, no regrouping (32 + 25)',
    '2-digit + 2-digit, with regrouping (38 + 27)',
];
const SUB_TIERS = [
    'within 10 (7 − 3)',
    'from the teens, crossing 10 (15 − 8)',
    '2-digit − 1-digit, no regrouping (39 − 5)',
    '2-digit − 1-digit, with regrouping (43 − 5)',
    '2-digit − 2-digit, no regrouping (57 − 25)',
    '2-digit − 2-digit, with regrouping (65 − 27)',
];
const SESSION_GAP_MS = 30 * 60 * 1000;

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pct = (x) => (x === null || x === undefined || Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);
const secs = (ms) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const fastLimitMs = (r) => ((r.op === 'add' || r.op === 'sub') && r.answer > 20 ? 6000 : 4000);

/** Stable key for "the same fact" (3×7 and 7×3 are one fact). */
function factKey(r) {
    if (r.op === 'mul') return `${Math.min(r.a, r.b)}×${Math.max(r.a, r.b)}`;
    if (r.op === 'add') return `${Math.max(r.a, r.b)} + ${Math.min(r.a, r.b)}`;
    return `${r.a} ${OP_SYM[r.op]} ${r.b}`;
}

/** Why a wrong answer was wrong (best guess from the number said). */
export function classifyError(r) {
    const { op, a, b, answer: ans, heard: h } = r;
    if (h === null || h === undefined) return 'no answer in time';
    const d = h - ans;
    const teenTy = { 13: 30, 14: 40, 15: 50, 16: 60, 17: 70, 18: 80, 19: 90 };
    const swapsTeen = teenTy[h] === ans || teenTy[ans] === h;
    if (swapsTeen) return 'teen/-ty mix-up (14 vs 40) — may be speech recognition';
    if (String(h).length === 2 && String(h).split('').reverse().join('') === String(ans)) return 'digits reversed';
    if (op === 'mul') {
        if ([a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b].includes(h)) return 'neighbouring fact (one group too many/few)';
        if (h === a + b) return 'added instead of multiplied';
        if (Math.abs(d) === 1) return 'off by one';
        for (let x = 2; x <= 9; x++) if (h % x === 0 && h / x <= 9) return 'another times-table answer (fact confusion)';
        return 'not a times-table answer';
    }
    if (op === 'div') {
        if (h === b) return 'said the divisor';
        if (Math.abs(d) === 1) return 'off by one (neighbouring fact)';
        if (h === a * b) return 'multiplied instead of divided';
        return 'other';
    }
    if (op === 'add') {
        if (Math.abs(d) === 10) return 'regrouping (carrying) error';
        if (Math.abs(d) === 1) return 'off by one (counting slip)';
        if (h === Math.abs(a - b)) return 'subtracted instead of added';
        return 'other';
    }
    if (op === 'sub') {
        const naive = (Math.floor(a / 10) - Math.floor(b / 10)) * 10 + Math.abs((a % 10) - (b % 10));
        if (a % 10 < b % 10 && h === naive) return 'subtracted smaller digit from larger (borrowing error)';
        if (Math.abs(d) === 10) return 'regrouping (borrowing) error';
        if (Math.abs(d) === 1) return 'off by one (counting slip)';
        if (h === a + b) return 'added instead of subtracted';
        return 'other';
    }
    return 'other';
}

/**
 * Per-fact verdict from the tutor's state AND the recent answer record
 * (last 6 tries of that fact): the tutor calls a fact known after a few fast
 * correct answers; for a report we also want it to stay right.
 */
function factVerdicts(history, tutor) {
    const recentByFact = new Map();
    for (const r of history) {
        const k = `${r.op}|${factKey(r)}`;
        const arr = recentByFact.get(k) || [];
        arr.push(r.correct);
        if (arr.length > 6) arr.shift();
        recentByFact.set(k, arr);
    }
    return (op, a, b, tutorStatus) => {
        const k = `${op}|${factKey({ op, a, b })}`;
        const rec = recentByFact.get(k);
        const acc = rec && rec.length ? rec.filter(Boolean).length / rec.length : null;
        const lastWrong = rec && rec.length && !rec[rec.length - 1];
        if (tutorStatus === 'weak' || (acc !== null && rec.length >= 2 && acc < 0.6)) return 'weak';
        if (tutorStatus === 'known' && (acc === null || (acc >= 0.8 && !lastWrong))) return 'known';
        if (tutorStatus === 'untested' && acc === null) return 'untested';
        return 'learning';
    };
}

function sessionsOf(history) {
    const out = [];
    for (const r of history) {
        const last = out[out.length - 1];
        if (!last || r.at - last.end > SESSION_GAP_MS) out.push({ start: r.at, end: r.at, items: [r] });
        else { last.end = r.at; last.items.push(r); }
    }
    return out.map((s) => ({
        date: new Date(s.start).toISOString().slice(0, 16).replace('T', ' '),
        minutes: Math.max(1, Math.round((s.end - s.start) / 60000)),
        questions: s.items.length,
        accuracy: s.items.filter((r) => r.correct).length / s.items.length,
        medianMs: median(s.items.filter((r) => r.correct).map((r) => r.ms)),
        ops: [...new Set(s.items.map((r) => r.op))],
    }));
}

function skillSummary(op, skill, history, solid = null) {
    const h = history.filter((r) => r.op === op);
    const recent = h.slice(-100);
    const correct = recent.filter((r) => r.correct);
    const accuracy = recent.length ? correct.length / recent.length : null;
    const fluency = recent.length ? correct.filter((r) => r.ms <= fastLimitMs(r)).length / recent.length : null;
    // For x and /, "known" means solid now (see factVerdicts), not just reached.
    const progress = solid ? solid.known / solid.total : skill.progress();
    let status;
    if (!skill.answered && !h.length) status = 'not started';
    else if (progress >= 0.9 && accuracy !== null && accuracy >= 0.9 && fluency >= 0.75 && recent.length >= 15) status = 'mastered';
    else if (progress >= 0.6 && (accuracy === null || accuracy >= 0.8)) status = 'secure';
    else status = 'learning';
    const items = Object.entries(skill.items);
    const weakNow = items.filter(([, r]) => r.box === 0 && r.wrong > 0).map(([k]) => k);
    const learningNow = items.filter(([, r]) => r.box > 0 && r.box < 3).map(([k]) => k);
    const edgeItem = skill.bank[Math.min(skill.lo, skill.N - 1)][0];
    return {
        op, name: OP_NAME[op], status, placed: skill.placed,
        progress: +progress.toFixed(3),
        ladderReached: +skill.progress().toFixed(3),
        ...(solid ? { factFamilies: solid } : {}),
        ladder: { rungsKnown: skill.lo, rungs: skill.N },
        workingOn: skill.lo >= skill.N ? 'everything on this ladder' : `around ${edgeItem.a} ${OP_SYM[op]} ${edgeItem.b}`,
        attempts: h.length, recentAttempts: recent.length,
        recentAccuracy: accuracy === null ? null : +accuracy.toFixed(3),
        fluency: fluency === null ? null : +fluency.toFixed(3),
        medianMs: median(correct.map((r) => r.ms)),
        weakNow: weakNow.length, learningNow: learningNow.length,
    };
}

function tierTable(op, skill) {
    const names = op === 'add' ? ADD_TIERS : SUB_TIERS;
    return names.map((name, t) => {
        const from = t * 3, to = t * 3 + 3;
        const known = Math.max(0, Math.min(skill.lo, to) - from);
        return { type: name, status: known >= 3 ? 'known' : known > 0 || (skill.lo >= from && skill.lo < to) ? 'learning' : skill.answered ? 'not yet' : 'not started' };
    });
}

function mulGrid(tutor, verdict) {
    const sym = { known: '✓', learning: '~', weak: '✗', untested: '·' };
    const v = (a, b) => verdict('mul', a, b, tutor.factStatus(a, b));
    const rows = [];
    const counts = { known: 0, learning: 0, weak: 0, untested: 0 };
    const weakFacts = [];
    for (let a = 1; a <= 9; a++) {
        const row = [];
        for (let b = 1; b <= 9; b++) {
            const x = v(a, b);
            row.push(sym[x]);
            if (a <= b) { counts[x]++; if (x === 'weak') weakFacts.push(`${a}×${b}`); }
        }
        rows.push(row);
    }
    const byTable = [];
    for (let f = 1; f <= 9; f++) {
        let k = 0;
        for (let x = 1; x <= 9; x++) if (v(f, x) === 'known') k++;
        byTable.push({ table: `×${f}`, known: k, of: 9 });
    }
    return { rows, byTable, families: { ...counts, total: 45 }, weakFacts };
}

function divFamilies(tutor, verdict) {
    const counts = { known: 0, learning: 0, weak: 0, untested: 0 };
    const div = tutor.skills.div;
    for (let a = 1; a <= 9; a++) for (let b = a; b <= 9; b++) {
        const p = a * b;
        const keys = [`div:${p}/${a}`, `div:${p}/${b}`];
        const st = keys.map((k) => (div.items[k] ? div.statusOf(k, 0) : (div.byKey.get(k) ? div.statusOf(k, div.byKey.get(k)[0].rung) : 'untested')));
        const tutorStatus = st.includes('weak') ? 'weak' : st.every((x) => x === 'known') ? 'known' : st.every((x) => x === 'untested') ? 'untested' : 'learning';
        const v1 = verdict('div', p, a, tutorStatus), v2 = verdict('div', p, b, tutorStatus);
        const x = [v1, v2].includes('weak') ? 'weak' : v1 === 'known' && v2 === 'known' ? 'known' : v1 === 'untested' && v2 === 'untested' ? 'untested' : 'learning';
        counts[x]++;
    }
    return { ...counts, total: 45 };
}

function weakSpots(history, tutor) {
    const recent = history.slice(-400);
    const facts = new Map();
    for (const r of recent) {
        const k = `${r.op}|${factKey(r)}`;
        const f = facts.get(k) || { op: r.op, fact: factKey(r), answer: r.answer, tries: 0, wrong: 0, said: [], errors: {} };
        f.tries++;
        if (!r.correct) {
            f.wrong++;
            if (r.heard !== null && r.heard !== undefined) f.said.push(r.heard);
            const e = classifyError(r);
            f.errors[e] = (f.errors[e] || 0) + 1;
        }
        facts.set(k, f);
    }
    // Facts the tutor currently marks as weak, even without recent history.
    for (const [op, skill] of Object.entries(tutor.skills)) {
        for (const [key, rec] of Object.entries(skill.items)) {
            if (rec.box !== 0 || !rec.wrong) continue;
            const it = skill.byKey.get(key)[0];
            const k = `${op}|${factKey(it)}`;
            if (!facts.has(k)) facts.set(k, { op, fact: factKey(it), answer: it.answer, tries: rec.n, wrong: rec.wrong, said: [], errors: {} });
        }
    }
    return [...facts.values()]
        .filter((f) => f.wrong > 0)
        .sort((x, y) => y.wrong - x.wrong || x.tries - y.tries)
        .slice(0, 12)
        .map((f) => ({ ...f, said: [...new Set(f.said)].slice(0, 4), accuracy: +(1 - f.wrong / f.tries).toFixed(2) }));
}

function errorPatterns(history) {
    const out = {};
    for (const r of history.slice(-400)) {
        if (r.correct) continue;
        const e = classifyError(r);
        out[r.op] = out[r.op] || {};
        out[r.op][e] = (out[r.op][e] || 0) + 1;
    }
    return out;
}

function trend(sessions) {
    if (sessions.length < 3) return { verdict: 'too early to tell', detail: `${sessions.length} session(s) so far; trends need at least 3.` };
    const last = sessions.slice(-3), prev = sessions.slice(-6, -3);
    const acc = (ss) => ss.reduce((s, x) => s + x.accuracy * x.questions, 0) / ss.reduce((s, x) => s + x.questions, 0);
    const med = (ss) => median(ss.map((x) => x.medianMs).filter((x) => x !== null));
    const a1 = acc(last), a0 = prev.length ? acc(prev) : null;
    const t1 = med(last), t0 = prev.length ? med(prev) : null;
    let verdict;
    if (a0 !== null && Math.abs(a1 - a0) < 0.03 && t0 && t1 && Math.abs(t1 - t0) / t0 < 0.1) verdict = a1 >= 0.9 ? 'plateau at a high level (saturated)' : 'plateau below mastery (stuck)';
    else if (a0 !== null && (a1 - a0 > 0.03 || (t0 && t1 && (t0 - t1) / t0 > 0.1))) verdict = 'improving';
    else if (a0 !== null && a0 - a1 > 0.05) verdict = 'declining (harder material or tiredness)';
    else verdict = 'steady';
    const earlierOps = new Set(sessions.slice(0, -3).flatMap((x) => x.ops));
    const newOps = [...new Set(last.flatMap((x) => x.ops))].filter((o) => !earlierOps.has(o));
    if (newOps.length && earlierOps.size) verdict += ` — new kinds of questions were added recently (${newOps.map((o) => OP_SYM[o]).join(' ')}), which usually lowers accuracy for a while`;
    return { verdict, recentAccuracy: +a1.toFixed(3), earlierAccuracy: a0 === null ? null : +a0.toFixed(3), recentMedianMs: t1, earlierMedianMs: t0 };
}

/** Grade-level standards the measured skills correspond to (US Common Core). */
function standards(sk) {
    const s = [];
    const add = sk.add, sub = sk.sub, mul = sk.mul, div = sk.div;
    const addLo = add.ladder.rungsKnown, subLo = sub.ladder.rungsKnown;
    s.push({ code: '2.OA.B.2', text: 'Fluently add and subtract within 20; know all sums of two one-digit numbers from memory', met: addLo >= 6 && subLo >= 6 ? 'met' : add.attempts || sub.attempts ? 'in progress' : 'not measured yet' });
    s.push({ code: '2.NBT.B.5', text: 'Fluently add and subtract within 100 using place-value strategies', met: addLo >= 18 && subLo >= 18 && (add.recentAccuracy ?? 0) >= 0.85 ? 'met' : add.attempts || sub.attempts ? 'in progress' : 'not measured yet' });
    s.push({ code: '3.OA.C.7', text: 'Fluently multiply and divide within 100; know all products of two one-digit numbers from memory', met: mul.status === 'mastered' && (div.status === 'mastered' || div.status === 'secure') ? 'met' : mul.status === 'mastered' ? 'multiplication met, division in progress' : 'in progress' });
    return s;
}

function recommendations(sk, weak, patterns, tr, r_grid = {}) {
    const rec = [];
    const mul = sk.mul, div = sk.div, add = sk.add, sub = sk.sub;
    if (mul.status !== 'mastered') {
        const conf = patterns.mul && (patterns.mul['neighbouring fact (one group too many/few)'] || 0);
        const fam = mul.factFamilies || {};
        const w = (r_grid.weakFacts || []).slice(0, 8);
        rec.push({ focus: 'Finish the times tables', why: `${fam.known ?? '?'} of 45 fact families are solid, ${fam.learning ?? 0} still being learned, ${fam.weak ?? 0} need practice${w.length ? ` (${w.join(', ')})` : ''}.`,
            ideas: [conf ? 'Skip-counting and "derived facts" games (7×8 = 7×7 + 7), since many errors are neighbouring facts' : 'Short daily retrieval practice on the remaining facts',
                'Array/area pictures for the facts still marked ✗'] });
    }
    if (mul.status === 'mastered' && div.status !== 'mastered') {
        rec.push({ focus: 'Division facts', why: `Multiplication is mastered; division is ${div.status} (${pct(div.progress)}).`, ideas: ['Fact-family games (7 × 8 = 56 ↔ 56 ÷ 7 = 8)', 'Missing-factor puzzles (□ × 7 = 56)'] });
    }
    if (add.status !== 'mastered' || sub.status !== 'mastered') {
        const borrow = patterns.sub && Object.entries(patterns.sub).filter(([k]) => /borrow/.test(k)).reduce((s, [, v]) => s + v, 0);
        const carry = patterns.add && (patterns.add['regrouping (carrying) error'] || 0);
        if (add.attempts || sub.attempts) {
            rec.push({ focus: 'Two-digit addition and subtraction', why: `Addition ${add.status}, subtraction ${sub.status}.`,
                ideas: [(borrow || 0) + (carry || 0) >= 3 ? `Place-value (tens and ones) practice with base-ten blocks — ${(borrow || 0) + (carry || 0)} regrouping errors seen` : 'Mental strategies: make-ten, jump by tens on a number line'] });
        }
    }
    const allSolid = [mul, div, add, sub].every((x) => x.status === 'mastered');
    if (mul.status === 'mastered') {
        rec.push({ focus: 'Ready to extend multiplication', why: 'Times tables are known and fluent.',
            ideas: ['Multi-digit × 1-digit (23 × 4) and × 10 / × 100 — 4.NBT.B.5', 'Area of rectangles and arrays (geometry/measurement) — 3.MD.C.7', 'Factors, multiples and primes — 4.OA.B.4', 'Missing-number equations as early algebra (□ × 6 = 42, 3 × □ + 2 = 20)'] });
    }
    if (div.status === 'mastered') {
        rec.push({ focus: 'Ready for long division and fractions', why: 'Division facts are known and fluent.',
            ideas: ['Division with remainders, then long division with 1-digit divisors — 4.NBT.B.6', 'Unit fractions as division (⅓ of 18) and equivalent fractions — 3.NF / 4.NF'] });
    }
    if (add.status === 'mastered' && sub.status === 'mastered') {
        rec.push({ focus: 'Ready for bigger numbers', why: 'Two-digit addition and subtraction with regrouping are mastered.', ideas: ['Add and subtract within 1000 — 3.NBT.A.2', 'Money, time and measurement word problems', 'Perimeter (adding side lengths)'] });
    }
    if (allSolid || /saturated/.test(tr.verdict)) {
        rec.unshift({ focus: 'Change of game', why: `Performance has ${/saturated/.test(tr.verdict) ? 'plateaued at a high level' : 'reached mastery on every ladder'}; more of the same will add little.`,
            ideas: ['Move to a new topic (see the "Ready to…" items) rather than harder versions of the same facts', 'Word problems that combine the four operations (two-step problems — 3.OA.D.8)'] });
    }
    for (const x of [mul, div, add, sub]) {
        if (x.recentAccuracy !== null && x.recentAccuracy >= 0.9 && x.fluency !== null && x.fluency < 0.6 && x.recentAttempts >= 15) {
            rec.push({ focus: `Speed up ${x.name.split(' (')[0].toLowerCase()}`, why: `Accurate (${pct(x.recentAccuracy)}) but only ${pct(x.fluency)} of answers are quick.`, ideas: ['Timed beat-your-best rounds on known facts'] });
        }
    }
    return rec;
}

/** Build the report data for one child. */
export function buildReport({ player, tutor, zoo, history }) {
    const sessions = sessionsOf(history);
    const verdict = factVerdicts(history, tutor);
    const grid = mulGrid(tutor, verdict);
    const divF = divFamilies(tutor, verdict);
    const skills = {
        mul: skillSummary('mul', tutor.skills.mul, history, grid.families),
        div: skillSummary('div', tutor.skills.div, history, divF),
        add: skillSummary('add', tutor.skills.add, history),
        sub: skillSummary('sub', tutor.skills.sub, history),
    };
    const recent = history.slice(-100);
    const weak = weakSpots(history, tutor);
    const patterns = errorPatterns(history);
    const tr = trend(sessions);
    return {
        generatedAt: new Date().toISOString(),
        player: player ? player.name : 'Player',
        source: "Pingo's Math Zoo — spoken-answer arithmetic practice (answers are whole numbers 1–81)",
        totals: {
            questionsAnswered: tutor.t, historyRecorded: history.length, sessions: sessions.length,
            firstPlayed: history.length ? new Date(history[0].at).toISOString().slice(0, 10) : null,
            lastPlayed: history.length ? new Date(history[history.length - 1].at).toISOString().slice(0, 10) : null,
            recentAccuracy: recent.length ? +(recent.filter((r) => r.correct).length / recent.length).toFixed(3) : null,
            medianAnswerMs: median(recent.filter((r) => r.correct).map((r) => r.ms)),
            zooLevel: zoo.level, stars: zoo.stars,
            operationsUnlocked: tutor.ops,
        },
        skills,
        multiplicationGrid: grid,
        additionTypes: tierTable('add', tutor.skills.add),
        subtractionTypes: tierTable('sub', tutor.skills.sub),
        weakSpots: weak,
        errorPatterns: patterns,
        sessions: sessions.slice(-10),
        trend: tr,
        standards: standards(skills),
        recommendations: recommendations(skills, weak, patterns, tr, grid),
    };
}

/** Markdown version (for download / pasting into an AI). */
export function reportMarkdown(r) {
    const L = [];
    const t = r.totals;
    L.push(`# Math progress report: ${r.player}`, '');
    L.push(`Generated ${r.generatedAt.slice(0, 10)} from ${r.source}.`, '');
    L.push('## Summary', '');
    const statusLine = Object.values(r.skills).map((s) => s.factFamilies
        ? `${s.name.split(' (')[0]}: **${s.status}** — ${s.factFamilies.known}/45 fact families solid, ${s.factFamilies.weak} need practice`
        : `${s.name.split(' (')[0]}: **${s.status}** (${pct(s.progress)} of the ladder)`);
    L.push(...statusLine.map((x) => `- ${x}`));
    L.push(`- Practice so far: ${t.questionsAnswered} questions${t.sessions ? ` in ${t.sessions} ${t.sessions === 1 ? 'session' : 'sessions'} (${t.firstPlayed}${t.lastPlayed !== t.firstPlayed ? ` to ${t.lastPlayed}` : ''})` : ''}.`);
    if (t.historyRecorded < 60) L.push(`- **Early estimate:** only ${t.historyRecorded} answers are recorded so far; accuracy, speed and error patterns become reliable after about 100–200 answers across several days.`);
    L.push(`- Last 100 answers: ${pct(t.recentAccuracy)} correct, typical answer time ${secs(t.medianAnswerMs)} (includes speaking).`);
    L.push(`- Trend: ${r.trend.verdict}.`, '');

    L.push('## By kind of question', '');
    L.push('| Skill | Status | Solid | Reached | Recent accuracy | Quick & correct | Typical time |');
    L.push('|---|---|---|---|---|---|---|');
    for (const s of Object.values(r.skills)) {
        L.push(`| ${s.name} | ${s.status} | ${pct(s.progress)} | ${pct(s.ladderReached)} | ${pct(s.recentAccuracy)} | ${pct(s.fluency)} | ${secs(s.medianMs)} |`);
    }
    L.push('', '"Solid" = known and answered right on recent tries; "reached" = how far the practice has gone.');
    L.push('');

    L.push('## Times tables (✓ solid, ~ learning, ✗ needs practice, · not reached)', '');
    L.push('| × | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |', '|---|---|---|---|---|---|---|---|---|---|');
    r.multiplicationGrid.rows.forEach((row, i) => L.push(`| **${i + 1}** | ${row.join(' | ')} |`));
    L.push('', `Facts known per table: ${r.multiplicationGrid.byTable.map((x) => `${x.table} ${x.known}/9`).join(', ')}.`, '');

    L.push('## Addition and subtraction by type', '');
    L.push('| Addition | Status |', '|---|---|', ...r.additionTypes.map((x) => `| ${x.type} | ${x.status} |`), '');
    L.push('| Subtraction | Status |', '|---|---|', ...r.subtractionTypes.map((x) => `| ${x.type} | ${x.status} |`), '');

    L.push('## Weak spots (most missed recently)', '');
    if (!r.weakSpots.length) L.push('No repeated misses recorded.', '');
    else {
        L.push('| Fact | Answer | Tries | Missed | Said instead | Likely reason |', '|---|---|---|---|---|---|');
        for (const w of r.weakSpots) {
            const reason = Object.entries(w.errors).sort((a, b) => b[1] - a[1]).map(([k]) => k)[0] || '–';
            L.push(`| ${w.fact} | ${w.answer} | ${w.tries} | ${w.wrong} | ${w.said.join(', ') || '–'} | ${reason} |`);
        }
        L.push('');
    }

    L.push('## Error patterns (last 400 answers)', '');
    const ep = Object.entries(r.errorPatterns);
    if (!ep.length) L.push('No wrong answers recorded yet.', '');
    for (const [op, m] of ep) {
        L.push(`- ${OP_NAME[op].split(' (')[0]}: ${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join('; ')}`);
    }
    L.push('');

    L.push('## Recent sessions', '');
    if (!r.sessions.length) L.push('No sessions recorded yet (history starts with this version of the game).', '');
    else {
        L.push('| Started (UTC) | Minutes | Questions | Accuracy | Typical time | Kinds |', '|---|---|---|---|---|---|');
        for (const s of r.sessions) L.push(`| ${s.date} | ${s.minutes} | ${s.questions} | ${pct(s.accuracy)} | ${secs(s.medianMs)} | ${s.ops.map((o) => OP_SYM[o]).join(' ')} |`);
        L.push('');
    }

    L.push('## Grade-level standards (US Common Core)', '');
    for (const s of r.standards) L.push(`- ${s.code} — ${s.text}: **${s.met}**`);
    L.push('');

    L.push('## What to work on next', '');
    for (const x of r.recommendations) {
        L.push(`- **${x.focus}.** ${x.why}`);
        for (const i of x.ideas) L.push(`  - ${i}`);
    }
    L.push('');

    L.push('## Notes for whoever designs the next game (including an AI)', '');
    L.push(
        '- The child answers out loud; a speech recognizer limited to number words checks the answer. A wrong answer can occasionally be a recognition error — the "teen/-ty mix-up" category is the most likely place for that.',
        '- Every answer is a whole number from 1 to 81. Not covered yet: numbers above 81, zero, fractions, decimals, place value beyond tens, geometry, measurement, word problems, multi-step problems, algebraic notation.',
        '- "Reached" = how far up an easiest-to-hardest sequence practice has gone; facts below that point are inferred from fast correct answers and spot-checked, not all asked. "Solid" (times tables and division) = the fact is known AND at least 80% right on its last tries.',
        '- Status: mastered = ≥90% solid, ≥90% recent accuracy and ≥75% of answers quick (under 4 s, 6 s for 2-digit sums); secure = ≥60% of the ladder and ≥80% accuracy; learning = otherwise.',
        '- Times include reading the question and saying the answer (about 1 s of speaking), so 2–3 s is fluent.',
        '- Suggested use: give this report to a designer or AI and ask for the next game: which topic, which skills to keep reviewing, and how to measure progress.',
        '',
    );

    L.push('## Data (JSON)', '', '```json', JSON.stringify({
        player: r.player, generatedAt: r.generatedAt, totals: r.totals, skills: r.skills,
        timesTablesKnownPerTable: r.multiplicationGrid.byTable, additionTypes: r.additionTypes, subtractionTypes: r.subtractionTypes,
        weakSpots: r.weakSpots, errorPatterns: r.errorPatterns, trend: r.trend, standards: r.standards,
        recommendedFocus: r.recommendations.map((x) => x.focus),
    }, null, 1), '```', '');
    return L.join('\n');
}

/** Minimal Markdown -> HTML for the in-game viewer (headings, lists, tables, bold, code). */
export function markdownToHtml(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const lines = md.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const l = lines[i];
        if (l.startsWith('```')) {
            const buf = []; i++;
            while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
            out.push(`<details class="report-json"><summary>Data for an AI (JSON)</summary><pre>${esc(buf.join('\n'))}</pre></details>`);
            i++; continue;
        }
        if (l.startsWith('# ')) out.push(`<h2>${inline(l.slice(2))}</h2>`);
        else if (l.startsWith('## ')) out.push(`<h3>${inline(l.slice(3))}</h3>`);
        else if (l.startsWith('|')) {
            const rows = [];
            while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
            const cells = (r) => r.slice(1, -1).split('|').map((c) => c.trim());
            const head = cells(rows[0]);
            const body = rows.slice(2).map(cells);
            out.push(`<div class="report-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
            continue;
        } else if (/^\s*- /.test(l)) {
            const items = [];
            while (i < lines.length && /^\s*- /.test(lines[i])) {
                const sub = /^\s{2,}- /.test(lines[i]);
                items.push(`<li${sub ? ' class="sub"' : ''}>${inline(lines[i].replace(/^\s*- /, ''))}</li>`);
                i++;
            }
            out.push(`<ul>${items.join('')}</ul>`);
            continue;
        } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
        i++;
    }
    return out.join('\n');
}
