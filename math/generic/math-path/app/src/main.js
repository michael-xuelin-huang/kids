// Math Path app: players → island home → lesson / questions → done; grown-ups screen
// for the plan and the report. The plan (JSON) decides everything the child sees.
import * as Players from '../../../math-quest-penguin/src/utils/players.js';
import { pingoSVG, animalSVG } from '../../../math-quest-penguin/src/components/art.js';
import { ZooProgress, animalName } from '../../../math-quest-penguin/src/components/zoo.js';
import { Tutor } from '../../../math-quest-penguin/src/utils/skillModel.js';
import { buildReport as pingoReport } from '../../../math-quest-penguin/src/utils/report.js';
import { Learner, Session, withDefaults } from './model/engine.js';
import { defaultPlan, nextFrontierSkill } from './plan/defaultPlan.js';
import { Placement } from './model/placement.js';
import { checkPlan } from './plan/checkPlan.js';
import { LESSONS } from './content/lessons.js';
import { makeItem, formatAnswer, hasGenerator } from './content/skills.js';
import { parseAnswer } from './content/answers.js';
import { renderVisual } from './ui/visuals.js';
import { buildReport, reportMarkdown } from './report.js';

const $ = (id) => document.getElementById(id);
const store = {
    read: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    write: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
};
const WORLD_NAMES = { pattern: 'Pattern Jungle', number: 'Number Ice Fields', fraction: 'Fraction Reef', shape: 'Shape Savanna', data: 'Data Observatory' };
const FRIENDLY = {
    'counts the unshaded parts': 'Count the shaded parts, out of ALL the parts.',
    'names the unshaded part': 'That names the part that is NOT shaded.',
    'writes the number of parts as the fraction': 'A fraction has two numbers: shaded parts on top, all parts underneath.',
    'counts the lines, not the parts': 'Count the parts (spaces), not the lines.',
    'counts the tick marks, not the jumps': 'Count the jumps between marks, not the marks.',
    'bigger denominator means bigger piece': 'More parts means SMALLER pieces.',
    'parts need not be equal': 'Fraction parts must be equal in size.',
    'swaps top and bottom': 'Top: how many we have. Bottom: how many parts in the whole.',
    'adds instead of multiplying': 'Equal groups: multiply, don\'t add.',
    'swaps divisor and quotient': 'Check: which number is the size of each share?',
    'neighbouring fact': 'Close! That\'s the fact next door.',
    'finds the perimeter instead': 'That\'s the distance around the edge. Area counts the squares inside.',
    'adds the same number to top and bottom': 'Multiply top and bottom by the same number, don\'t add.',
    'keeps the top number the same': 'When the pieces get smaller, you need more of them.',
    'stops after the first step': 'Good first step! There\'s one more.',
    'reads only the top number': 'Look at the bottom number too.',
    'subtracts instead of dividing': 'Sharing equally is dividing.',
};

let DATA = null;           // { map, story, schema }
let player = null, learner = null, zoo = null, planState = null, pingoStatus = {};
let session = null;
let placement = null;

// ---------------------------------------------------------------- start-up

async function loadData() {
    const get = async (p) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
    const [map, story, schema] = await Promise.all([get('../knowledge-map/grades-3-5.json'), get('../story/zoo-island.json'), get('../schema/learning-plan.schema.json')]);
    DATA = { map, story, schema };
}

function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
    window.scrollTo(0, 0);
}

$('brand-mark').innerHTML = pingoSVG();
$('picker-pingo').innerHTML = pingoSVG('happy');

function renderPlayers() {
    const list = Players.listPlayers();
    const el = $('player-list'); el.innerHTML = '';
    for (const p of list) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'player-card';
        b.innerHTML = `<span class="player-art">${animalSVG(p.avatar)}</span><span class="player-name"></span>`;
        b.querySelector('.player-name').textContent = p.name;
        b.addEventListener('click', () => choosePlayer(p.id));
        el.appendChild(b);
    }
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'player-card player-card--add';
    add.innerHTML = '<span class="plus">+</span><span class="player-name">Add a player</span>';
    add.addEventListener('click', () => { $('add-form').classList.remove('hidden'); $('add-name').focus(); });
    el.appendChild(add);
    $('picker-title').textContent = list.length ? "Who's playing?" : "What's your name?";
    if (!list.length) { $('add-form').classList.remove('hidden'); add.classList.add('hidden'); }
}
$('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('add-name').value.trim();
    if (!name) return;
    const p = Players.addPlayer(name);
    $('add-name').value = ''; $('add-form').classList.add('hidden');
    choosePlayer(p.id);
});

function pingoMapStatus(id) {
    try {
        const k = Players.keysFor(id);
        if (!localStorage.getItem(k.tutor)) return {};
        const tutor = new Tutor({ storageKey: k.tutor });
        const z = new ZooProgress({ storageKey: k.zoo });
        return pingoReport({ player: Players.getPlayer(id), tutor, zoo: z, history: Players.readHistory(id) }).mapStatus || {};
    } catch (e) { console.warn('Pingo progress not read', e); return {}; }
}

const PLAN_KEY = (id) => `math-path.plan.v1@${id}`;
function savePlan() { store.write(PLAN_KEY(player.id), planState); }
function autoPlan() {
    return { plan: defaultPlan({ map: DATA.map, story: DATA.story, learner, player: player.name, pingo: pingoStatus }), source: 'auto', loadedAt: Date.now(), sessions: 0 };
}

function choosePlayer(id) {
    if (!DATA) return;
    Players.setCurrentPlayer(id);
    player = Players.getPlayer(id);
    learner = new Learner(store, id);
    zoo = new ZooProgress({ storageKey: Players.keysFor(id).zoo });
    pingoStatus = pingoMapStatus(id);
    planState = store.read(PLAN_KEY(id));
    if (!planState || !planState.plan) { planState = autoPlan(); savePlan(); }
    $('player-name').textContent = player.name;
    $('player-art').innerHTML = animalSVG(player.avatar);
    $('player-chip').classList.remove('hidden'); $('star-chip').classList.remove('hidden');
    updateStars();
    if (!(learner.placements || []).length && !learner.sessions.length) return showCheckIntro();
    showHome();
}
$('player-chip').addEventListener('click', () => { if (session || placement) return; renderPlayers(); show('screen-picker'); });
$('brand').addEventListener('click', () => { if (player && !session && !placement) showHome(); });
function updateStars() { $('stars').textContent = zoo ? zoo.stars : 0; }

// ---------------------------------------------------------------- home

const skillTitle = (id) => DATA.map.nodes.find((n) => n.id === id)?.title || id;
function chapterOf(plan) {
    return DATA.story.chapters.find((c) => c.id === plan.story?.chapter) || DATA.story.chapters.find((c) => plan.focus.some((f) => c.nodes.includes(f.node))) || DATA.story.chapters[0];
}
function planDue() {
    const p = withDefaults(planState.plan);
    const days = (Date.now() - (planState.loadedAt || Date.now())) / 86400000;
    const probe = new Session({ plan: planState.plan, learner });
    return { complete: probe.planComplete(), sessionsUp: planState.sessions >= p.validFor.sessions, daysUp: days >= p.validFor.days, p };
}

function showHome() {
    if (planState.source === 'auto') {
        // Refresh the automatic plan once its work is done.
        const probe = new Session({ plan: planState.plan, learner });
        if (probe.planComplete()) { planState = autoPlan(); savePlan(); }
    }
    $('check-banner').classList.toggle('hidden', (learner.placements || []).length > 0);
    const plan = planState.plan; const ch = chapterOf(plan);
    $('chapter-world').textContent = WORLD_NAMES[ch.world] || ch.world;
    $('chapter-title').textContent = ch.title;
    $('npc-line').textContent = `“${plan.story?.goal || ch.title}!” says ${plan.story?.npc || ch.npc}.`;
    $('npc-art').innerHTML = pingoSVG('happy');
    const list = $('skill-list'); list.innerHTML = '';
    const p = withDefaults(plan);
    for (const f of p.focus) {
        const r = learner.skills[f.node]; const st = r ? r.status : 'new';
        const li = document.createElement('li');
        const done = st === 'barMet' || st === 'mastered';
        const counted = r ? r.window.filter((w) => w.level >= f.bar.atLevel && w.ok && !w.hint).length : 0;
        const prog = done ? 1 : Math.min(0.95, counted / Math.max(f.bar.minAttempts, 1));
        li.className = `skill ${done ? 'skill--done' : ''}`;
        li.innerHTML = `<span class="skill-role">${f.role === 'new' ? 'New' : f.role === 'repair' ? 'Fix-up' : f.role === 'review' ? 'Review' : 'Peek'}</span>
            <span class="skill-title"></span><span class="meter"><span style="width:${Math.round(prog * 100)}%"></span></span>
            <span class="skill-state">${done ? (st === 'mastered' ? '★ Mastered' : '✓ Got it') : hasGenerator(f.node) ? (r && r.level ? `Level ${r.level}` : 'Not started') : 'Coming soon'}</span>`;
        li.querySelector('.skill-title').textContent = skillTitle(f.node);
        list.appendChild(li);
    }
    const reward = plan.rewards?.unlockAnimal || ch.reward;
    $('reward').innerHTML = reward ? `<p>Pass the checkpoint to bring a <b></b> to the island.</p>` : '';
    if (reward) $('reward').querySelector('b').textContent = reward;
    const due = planDue();
    const ready = due.complete || due.sessionsUp || due.daysUp;
    $('btn-checkpoint').classList.toggle('btn--primary', ready);
    $('btn-checkpoint').classList.toggle('btn--quiet', !ready);
    $('home-note').textContent = due.complete ? 'Every skill this week has reached its goal. Time for the checkpoint!'
        : ready ? 'This plan has run its course. Take the checkpoint, then a grown-up can make the next plan.'
            : `Session ${Math.min(planState.sessions + 1, due.p.validFor.sessions)} of ${due.p.validFor.sessions} this plan.`;
    show('screen-home');
}
$('btn-start').addEventListener('click', () => startSession('practice'));
$('btn-checkpoint').addEventListener('click', () => startSession('checkpoint'));

// ---------------------------------------------------------------- session

let arrivals = [], barNews = [], startStars = 0;
function startSession(kind) {
    const rolling = planState.source === 'auto' && kind === 'practice';
    session = new Session({ plan: planState.plan, learner, kind, mastered: Object.entries(pingoStatus).filter(([, v]) => /^mastered/.test(v)).map(([k]) => k),
        nextSkill: rolling ? (inFocus) => nextFrontierSkill({ map: DATA.map, learner, pingo: pingoStatus }, inFocus) : null });
    arrivals = []; barNews = []; startStars = zoo.stars;
    step();
}
function step() {
    if (placement) return placementStep();
    const ev = session.next();
    if (ev.type === 'done') return finishSession();
    if (ev.type === 'lesson') return showLesson(ev);
    showItem(ev.item);
}

// ---------------------------------------------------------------- lesson

function showLesson(ev) {
    const lesson = LESSONS[ev.skill] || { idea: skillTitle(ev.skill), steps: [] };
    const p = withDefaults(planState.plan);
    const pages = lesson.steps.map((s) => ({ text: s.text, visual: s.visual }));
    const n = ev.reteach ? Math.max(2, p.teaching.workedExamples) : p.teaching.workedExamples;
    for (let i = 0; i < n; i++) {
        let it = makeItem(ev.skill, 1, { knobs: { context: 'picture' } });
        for (let t = 0; t < 6 && it.choices?.some((c) => c.svg); t++) it = makeItem(ev.skill, 1, { knobs: { context: 'picture' } });
        const pictureChoice = it.choices?.find((c) => c.svg && c.value.symbol === it.answer.symbol);
        const v = pictureChoice ? pictureChoice.svg : it.visual ? JSON.parse(JSON.stringify(it.visual)) : null;
        if (v && it.mode === 'shade') v.shaded = [...Array(it.answer.n * v.d / it.answer.d).keys()];
        if (v && it.mode === 'place') v.point = it.answer;
        pages.push({ example: true, text: it.prompt, visual: v, answer: pictureChoice ? 'this one' : formatAnswer(it), say: it.say });
    }
    if (!pages.length) pages.push({ text: lesson.idea });
    $('lesson-skill').textContent = ev.reteach ? `Let's look again: ${skillTitle(ev.skill)}` : ev.afterMiss ? `Here's how it works: ${skillTitle(ev.skill)}` : `New: ${skillTitle(ev.skill)}`;
    $('lesson-idea').textContent = lesson.idea;
    $('lesson-testme').classList.toggle('hidden', !ev.canTestOut);
    let i = 0;
    const render = () => {
        const pg = pages[i]; const body = $('lesson-body'); body.innerHTML = '';
        const t = document.createElement('p'); t.className = pg.example ? 'lesson-example' : 'lesson-text';
        t.textContent = pg.example ? `Example: ${pg.text}` : pg.text; body.appendChild(t);
        const vis = renderVisual(pg.visual); if (vis) body.appendChild(vis);
        if (pg.example) { const a = document.createElement('p'); a.className = 'lesson-answer'; a.textContent = `Answer: ${pg.answer}. ${pg.say}`; body.appendChild(a); }
        $('lesson-dots').innerHTML = pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
        $('lesson-back').disabled = i === 0;
        $('lesson-next').textContent = i === pages.length - 1 ? "Let's try" : 'Next';
    };
    $('lesson-back').onclick = () => { if (i > 0) { i--; render(); } };
    $('lesson-next').onclick = () => { if (i < pages.length - 1) { i++; render(); } else { session.lessonDone(ev.skill); step(); } };
    $('lesson-testme').onclick = () => { session.lessonDone(ev.skill, { testMe: true }); step(); };
    render();
    show('screen-lesson');
}

// ---------------------------------------------------------------- one question

const TAGS = { warmup: 'Warm-up', due: 'Remember this?', new: 'New skill', repair: 'Fix-up', review: 'Review', testout: 'Test-out', checkpoint: 'Checkpoint' };
let answered = false, hintsShown = 0, current = null, pendingGiven = null;

function showItem(item) {
    current = item; answered = false; hintsShown = 0; pendingGiven = null;
    show('screen-play');
    $('play-tag').textContent = TAGS[item.why] || '';
    if (session) $('progress-fill').style.width = `${Math.min(100, (session.n / session.maxQuestions) * 100)}%`;
    $('prompt').textContent = item.prompt;
    $('feedback').classList.add('hidden'); $('why-form').classList.add('hidden');
    $('hint-text').classList.add('hidden'); $('hint-text').textContent = '';
    const vis = $('visual'); vis.innerHTML = '';
    const interactive = item.mode === 'shade' || item.mode === 'place' ? item.mode : null;
    const v = renderVisual(item.visual, { mode: interactive, onChange: (g) => { pendingGiven = g; const c = $('btn-check'); if (c) c.disabled = false; } });
    if (v) vis.appendChild(v);
    const ans = $('answer'); ans.innerHTML = '';
    if (item.mode === 'choice') {
        const row = document.createElement('div'); row.className = `choices ${item.choices.some((c) => c.svg) ? 'choices--pictures' : ''}`;
        for (const c of item.choices) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'choice';
            if (c.svg) { const s = renderVisual(c.svg); b.appendChild(Object.assign(document.createElement('span'), { className: 'choice-label', textContent: c.label })); b.appendChild(s); }
            else b.textContent = c.label;
            b.addEventListener('click', () => submit(c.value, b));
            b.dataset.value = JSON.stringify(c.value);
            row.appendChild(b);
        }
        ans.appendChild(row);
    } else if (item.mode === 'typed') {
        const form = document.createElement('form'); form.className = 'typed'; form.autocomplete = 'off';
        form.innerHTML = `<input id="typed" type="text" inputmode="text" aria-label="Your answer" placeholder="Type or say it"><button class="btn btn--primary" type="submit">Check</button>`;
        const pad = document.createElement('div'); pad.className = 'keypad';
        for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '/', '0', '⌫']) {
            const b = document.createElement('button'); b.type = 'button'; b.textContent = k; b.className = 'key';
            b.addEventListener('click', () => { const inp = $('typed'); inp.value = k === '⌫' ? inp.value.slice(0, -1) : inp.value + k; inp.focus({ preventScroll: true }); });
            pad.appendChild(b);
        }
        form.addEventListener('submit', (e) => {
            e.preventDefault(); if (answered) return;
            const raw = $('typed').value; const g = parseAnswer(raw);
            if (!g) { flashHint(raw.trim() ? 'I couldn\'t read that. Try a number like 12 or a fraction like 3/4.' : 'Type your answer first.'); return; }
            submit(g, null, raw);
        });
        ans.appendChild(form); ans.appendChild(pad);
        setTimeout(() => { if (!matchMedia('(pointer: coarse)').matches) $('typed')?.focus(); }, 50);
    } else {
        const b = document.createElement('button'); b.type = 'button'; b.id = 'btn-check'; b.className = 'btn btn--primary'; b.textContent = 'Check'; b.disabled = true;
        b.addEventListener('click', () => { if (pendingGiven) submit(pendingGiven); });
        ans.appendChild(b);
        const tip = document.createElement('p'); tip.className = 'muted small'; tip.textContent = item.mode === 'shade' ? 'Tap the parts to shade them.' : 'Tap the line to place the dot.'; ans.appendChild(tip);
    }
    $('btn-hint').classList.toggle('hidden', item.hintLevel < 2);
    $('btn-dunno').classList.toggle('hidden', !item.placement);
    $('btn-stop').textContent = item.placement ? 'Finish' : 'Stop';
    if (item.placement) $('progress-fill').style.width = `${Math.min(100, Math.max(placement.n / placement.maxQuestions, placement.progress()) * 100)}%`;
    if (item.hintLevel >= 3) nextHint();
}
function flashHint(t) { const h = $('hint-text'); h.textContent = t; h.classList.remove('hidden'); }
function nextHint() {
    if (!current || answered || hintsShown >= current.hints.length) return;
    flashHint(current.hints[hintsShown]); hintsShown++;
    if (hintsShown >= current.hints.length) $('btn-hint').classList.add('hidden');
}
$('btn-hint').addEventListener('click', nextHint);

function submit(given, button, raw) {
    if (answered) return;
    answered = true;
    const item = current;
    if (item.placement) return placementAnswered(item, given, button);
    const fb = session.answer(item, given, { hint: hintsShown });
    // Mark the answer area.
    for (const b of document.querySelectorAll('.choice')) {
        b.disabled = true;
        const v = JSON.parse(b.dataset.value);
        const right = item.answer.symbol != null ? v.symbol === item.answer.symbol : v.n * item.answer.d === item.answer.n * v.d;
        if (right) b.classList.add('choice--right');
    }
    if (button && !fb.correct) button.classList.add('choice--wrong');
    document.querySelectorAll('#answer input, #answer button, .keypad .key').forEach((x) => { x.disabled = true; });
    $('btn-hint').classList.add('hidden');
    if (!fb.correct && (item.mode === 'shade' || item.mode === 'place')) {
        const v = JSON.parse(JSON.stringify(item.visual));
        if (item.mode === 'shade') v.shaded = [...Array(item.answer.n * v.d / item.answer.d).keys()];
        else v.point = item.answer;
        const s = renderVisual(v); if (s) { s.classList.add('vis--answer'); $('visual').appendChild(s); }
    }
    // Stars and animals.
    if (fb.stars) arrivals.push(...zoo.add(fb.stars));
    updateStars();
    if (fb.barMet) barNews.push({ skill: item.skill, testedOut: fb.testedOut });
    // Feedback.
    const praise = ['Yes!', 'Right!', 'Spot on!', 'You got it!', 'Nice!'];
    $('fb-title').textContent = fb.correct ? praise[Math.floor(Math.random() * praise.length)] + (fb.stars > 1 ? ` +${fb.stars} ★` : ' +1 ★') : session.kind === 'checkpoint' ? 'Not this time.' : `Not quite. The answer is ${formatAnswer(item)}.`;
    $('fb-title').className = `fb-title ${fb.correct ? 'ok' : 'no'}`;
    $('fb-say').textContent = session.kind === 'checkpoint' && !fb.correct ? '' : item.say || '';
    const notes = [];
    if (!fb.correct && fb.misconception && FRIENDLY[fb.misconception]) notes.push(FRIENDLY[fb.misconception]);
    if (fb.levelUp) notes.push('Level up! The next ones get a bit harder.');
    if (fb.levelDown) notes.push('Let\'s make the next one a bit easier.');
    if (fb.barMet) notes.push(fb.testedOut ? `You already know ${skillTitle(item.skill).toLowerCase()}. Skipping ahead!` : `You've got ${skillTitle(item.skill).toLowerCase()}! ✓`);
    if (fb.mastered) notes.push('Still remembered after a few days: mastered! ★');
    if (fb.demoted) notes.push('Let\'s practise this one again for a bit.');
    if (fb.added) {
        notes.push(`Next up: ${skillTitle(fb.added).toLowerCase()}.`);
        planState.plan.focus.push({ node: fb.added, role: 'new', weight: 0.35, why: 'Opened when the last skill was done.' });
        planState.plan.session = { ...planState.plan.session, maxNewSkills: Math.min(3, (planState.plan.session?.maxNewSkills || 1) + 1) };
        savePlan();
    }
    $('fb-note').textContent = notes.join(' ');
    $('feedback').classList.remove('hidden');
    $('feedback').classList.toggle('feedback--ok', fb.correct);
    if (item.askWhy) {
        $('why-label').textContent = item.explain || 'Why?';
        $('why-text').value = '';
        $('why-form').classList.remove('hidden');
        setTimeout(() => $('why-text').focus({ preventScroll: true }), 50);
        current._wasCorrect = fb.correct;
    }
    $('btn-next').focus({ preventScroll: true });
    if (item.askWhy) setTimeout(() => $('why-text').focus({ preventScroll: true }), 60);
}
$('btn-next').addEventListener('click', () => {
    if (!answered) return;
    if (current.askWhy) {
        const bonus = session.explanation(current, $('why-text').value, { wasCorrect: current._wasCorrect });
        if (bonus) arrivals.push(...zoo.add(bonus));
        updateStars();
    }
    step();
});
$('why-form').addEventListener('submit', (e) => { e.preventDefault(); $('btn-next').click(); });
$('why-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('btn-next').click(); } });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && answered && !$('screen-play').classList.contains('hidden') && document.activeElement?.id !== 'why-text' && document.activeElement?.id !== 'btn-next') { e.preventDefault(); $('btn-next').click(); }
});
$('btn-stop').addEventListener('click', () => (placement ? finishPlacement() : finishSession()));
$('btn-dunno').addEventListener('click', () => { if (!answered && current?.placement) { answered = true; placementAnswered(current, null, null); } });

// ---------------------------------------------------------------- quick check (placement)

function showCheckIntro() {
    $('check-pingo').innerHTML = pingoSVG('happy');
    show('screen-check');
}
$('btn-check-start').addEventListener('click', () => {
    const known = Object.entries(pingoStatus).filter(([, v]) => /^mastered/.test(v)).map(([k]) => k);
    placement = new Placement({ map: DATA.map, learner, known });
    placementStep();
});
$('btn-check-skip').addEventListener('click', showHome);
$('btn-banner-check').addEventListener('click', showCheckIntro);
$('btn-recheck').addEventListener('click', showCheckIntro);

function placementStep() {
    const ev = placement.next();
    if (ev.type === 'done') return finishPlacement();
    showItem(ev.item);
}
function placementAnswered(item, given, button) {
    const res = placement.answer(item, given);
    document.querySelectorAll('#answer input, #answer button, .keypad .key, .choice').forEach((x) => { x.disabled = true; });
    if (button) button.classList.add(res.correct ? 'choice--right' : 'choice--wrong');
    $('btn-dunno').classList.add('hidden');
    // No answers shown in the quick check: it's about finding the level, quickly.
    $('fb-title').textContent = res.correct ? '✓ Got it' : given == null ? 'OK, we\'ll learn that one' : 'OK, noted';
    $('fb-title').className = `fb-title ${res.correct ? 'ok' : 'mini'}`;
    $('fb-say').textContent = ''; $('fb-note').textContent = '';
    $('why-form').classList.add('hidden'); current.askWhy = false;
    $('feedback').classList.remove('hidden'); $('feedback').classList.toggle('feedback--ok', !!res.correct);
    $('btn-next').classList.add('hidden');
    setTimeout(() => { $('btn-next').classList.remove('hidden'); if (placement) placementStep(); }, res.correct ? 550 : 800);
}
function finishPlacement() {
    const P = placement; placement = null;
    $('btn-next').classList.remove('hidden');
    if (!P.n) return showHome();
    if (!P.current?.finished && P.current) { /* stopped mid-probe: keep what was decided */ }
    const result = P.apply();
    if (planState.source === 'auto') { planState = autoPlan(); savePlan(); }
    const sum = P.summary();
    $('done-pingo').innerHTML = pingoSVG('happy');
    $('done-title').textContent = `You already know ${result.known} skills!`;
    $('done-stats').innerHTML = `<div><b>${result.questions}</b><span>questions</span></div><div><b>${result.correct}</b><span>right</span></div><div><b>${result.frontier.length}</b><span>ready to learn</span></div>`;
    const news = $('done-news'); news.innerHTML = '';
    const rows = document.createElement('div'); rows.className = 'world-rows';
    for (const [w, o] of Object.entries(sum)) {
        const r = document.createElement('div'); r.className = 'world-row';
        r.innerHTML = `<b></b><span></span><span class="meter"><span style="width:${Math.round((o.known / o.total) * 100)}%"></span></span>`;
        r.querySelector('b').textContent = WORLD_NAMES[w] || w;
        r.querySelector('span').textContent = o.gradeDone ? `grade ${o.gradeDone} done` : `${o.known} of ${o.total}`;
        rows.appendChild(r);
    }
    news.appendChild(rows);
    const starts = planState.plan.focus.filter((f) => f.role === 'new').map((f) => skillTitle(f.node));
    if (starts.length) { const p = document.createElement('p'); p.textContent = `Starting with: ${starts.join('; ')}.`; news.appendChild(p); }
    $('btn-done').textContent = 'Start practising';
    show('screen-done');
}

// ---------------------------------------------------------------- done

function finishSession() {
    const s = session; session = null;
    const entry = s.finish();
    if (s.kind === 'practice' && entry.questions) { planState.sessions = (planState.sessions || 0) + 1; savePlan(); }
    $('done-pingo').innerHTML = pingoSVG('happy');
    $('done-title').textContent = s.kind === 'checkpoint' ? (entry.correct / Math.max(1, entry.questions) >= 0.8 ? 'Checkpoint passed!' : 'Checkpoint done') : entry.questions ? 'Great work!' : 'See you soon!';
    $('done-stats').innerHTML = `<div><b>${entry.questions}</b><span>questions</span></div><div><b>${entry.correct}</b><span>right</span></div><div><b>${zoo.stars - startStars}</b><span>stars</span></div>`;
    const news = $('done-news'); news.innerHTML = '';
    for (const b of barNews) { const p = document.createElement('p'); p.textContent = `✓ ${skillTitle(b.skill)}${b.testedOut ? ' (you already knew it!)' : ''}`; news.appendChild(p); }
    if (s.kind === 'checkpoint') {
        const reward = planState.plan.rewards?.unlockAnimal || chapterOf(planState.plan).reward;
        const p = document.createElement('p');
        p.textContent = entry.correct / Math.max(1, entry.questions) >= 0.8 ? `The ${reward} is coming to the island! A grown-up can now download your report and make the next plan.` : 'A grown-up can download your report so the next plan helps with the tricky parts.';
        news.appendChild(p);
    }
    for (const a of arrivals) {
        const d = document.createElement('div'); d.className = 'arrival';
        d.innerHTML = `<span class="arrival-art">${animalSVG(a.key)}</span><span></span>`;
        d.querySelector('span:last-child').textContent = `A ${animalName(a.key)} arrived at your zoo!`;
        news.appendChild(d);
    }
    show('screen-done');
}
$('btn-done').addEventListener('click', () => { $('btn-done').textContent = 'Back to the island'; showHome(); });

// ---------------------------------------------------------------- grown-ups

function renderPlanView() {
    const plan = planState.plan; const ch = chapterOf(plan);
    const v = $('plan-view'); v.innerHTML = '';
    const h = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; v.appendChild(e); return e; };
    h('p', `${planState.source === 'ai' ? 'Plan written for' : 'Automatic plan for'} ${plan.player}, ${plan.createdAt}. Session ${planState.sessions || 0} of ${withDefaults(plan).validFor.sessions}. Chapter: ${ch.title} (${WORLD_NAMES[ch.world]}).`, 'muted');
    if (plan.basis?.summary) h('p', plan.basis.summary);
    if (plan.parentNote) h('p', plan.parentNote, 'note');
    const t = document.createElement('table'); t.className = 'plan-table';
    t.innerHTML = '<thead><tr><th>Skill</th><th>Role</th><th>Status</th><th>Why</th></tr></thead>';
    const tb = document.createElement('tbody');
    for (const f of withDefaults(plan).focus) {
        const r = learner.skills[f.node];
        const tr = document.createElement('tr');
        const status = !hasGenerator(f.node) ? 'no game yet' : r ? `${r.status === 'barMet' ? 'bar met' : r.status}, level ${r.level ?? '–'}, ${r.attempts} tries` : 'not started';
        for (const x of [`${skillTitle(f.node)} (${f.node})`, f.role, status, f.why || '']) { const td = document.createElement('td'); td.textContent = x; tr.appendChild(td); }
        tb.appendChild(tr);
    }
    t.appendChild(tb); v.appendChild(t);
}
$('btn-parent').addEventListener('click', () => { renderPlanView(); $('plan-errors').classList.add('hidden'); $('parent-status').textContent = ''; show('screen-parent'); });
$('parent-back').addEventListener('click', showHome);

function usePlan(text) {
    const box = $('plan-errors');
    let plan;
    try { plan = JSON.parse(text); } catch (e) { box.innerHTML = ''; box.textContent = `That isn't valid JSON: ${e.message}`; box.classList.remove('hidden'); return; }
    const { errors, warnings } = checkPlan(plan, DATA);
    if (plan.player && player && plan.player.toLowerCase() !== player.name.toLowerCase()) warnings.push(`This plan is for ${plan.player}, but ${player.name} is playing.`);
    box.innerHTML = '';
    if (errors.length) {
        box.appendChild(Object.assign(document.createElement('p'), { textContent: 'This plan was not used. Fix these and try again:' }));
        const ul = document.createElement('ul'); for (const e of errors) ul.appendChild(Object.assign(document.createElement('li'), { textContent: e })); box.appendChild(ul);
        box.classList.remove('hidden'); return;
    }
    planState = { plan, source: 'ai', loadedAt: Date.now(), sessions: 0 }; savePlan();
    if (warnings.length) {
        box.appendChild(Object.assign(document.createElement('p'), { textContent: 'Plan in use. Notes:' }));
        const ul = document.createElement('ul'); for (const w of warnings) ul.appendChild(Object.assign(document.createElement('li'), { textContent: w })); box.appendChild(ul);
        box.classList.remove('hidden');
    } else box.classList.add('hidden');
    $('plan-json').value = '';
    $('parent-status').textContent = 'New plan in use.';
    renderPlanView();
}
$('plan-use').addEventListener('click', () => usePlan($('plan-json').value));
$('plan-file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) usePlan(await f.text()); e.target.value = ''; });
$('plan-auto').addEventListener('click', () => { planState = autoPlan(); savePlan(); renderPlanView(); $('parent-status').textContent = 'Automatic plan in use.'; });

function currentReport() { return reportMarkdown(buildReport({ player: player.name, plan: planState.plan, learner, map: DATA.map, pingo: pingoStatus })); }
function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fileDate = () => new Date().toISOString().slice(0, 10);
const slug = () => player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
$('report-download').addEventListener('click', () => download(`${fileDate()}-${slug()}.md`, currentReport(), 'text/markdown'));
$('report-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentReport()); $('parent-status').textContent = 'Report copied.'; } catch (e) { $('parent-status').textContent = 'Copy is blocked here; use Download.'; }
});
$('plan-download').addEventListener('click', () => download(`${fileDate()}-${slug()}.plan.json`, JSON.stringify(planState.plan, null, 2), 'application/json'));

// For automated browser tests only: read the question on screen.
window.__mathPath = { item: () => current };

// ---------------------------------------------------------------- go

renderPlayers();
loadData().then(() => {
    $('load-status').textContent = '';
    const id = Players.currentPlayerId();
    if (id && new URLSearchParams(location.search).has('continue')) choosePlayer(id);
}).catch((e) => { $('load-status').textContent = `Couldn't load the island (${e.message}). Check your connection and reload.`; });
